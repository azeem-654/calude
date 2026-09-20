/**
 * The public face of the engagement platform.
 *
 * ── What makes this route different from every other one here ──
 *
 * Nothing that arrives is trusted and nobody is signed in. A form submission
 * comes from a page on somebody else's domain; a chat message comes from a
 * widget embedded on a site this install has never seen. So every assumption
 * the signed-in routes make has to be re-earned:
 *
 *  - **The tenant is never taken from the request.** It is resolved from a
 *    widget's `public_key` or a form's `slug`, both of which are unique across
 *    the install and map to exactly one workspace. A caller naming an
 *    `accountId` is ignored.
 *  - **A public key unlocks nothing but its own widget.** It is designed to sit
 *    in a browser. It cannot read contacts, cannot list conversations, and
 *    cannot reach another widget — so there is nothing to steal by reading the
 *    page source, which is where it will always be.
 *  - **A conversation is only readable with the key that created it.** The
 *    visitor key is random and returned once; without it a conversation id is
 *    an id and nothing more.
 *  - **Everything is rate limited per address**, because every endpoint here
 *    creates rows for anonymous callers.
 */
import { body, fail, json } from '../lib/http';
import { nowIso, type Env } from '../lib/db';
import { rateLimit } from '../lib/rateLimit';
import { gate as contentGate } from '../lib/contentGate';
import {
  cleanEmail, guestKey, publicKey, recordEvent, rid, upsertPerson, nextTicketRef,
} from '../lib/engagement';
import { think, type AgentConfig, type Turn } from '../lib/agentBrain';
import { runTool } from '../lib/agentTools';
import { enrolOnEvent } from '../lib/automationEngine';

interface Req {
  action?: string;
  /* Identity of the surface being used. One of these, never an accountId. */
  widgetKey?: string;
  formSlug?: string;
  /* A conversation, proven by the key handed back when it was created. */
  conversationId?: string;
  visitorKey?: string;
  ticketRef?: string;
  guestKey?: string;

  message?: string;
  name?: string;
  email?: string;
  phone?: string;
  company?: string;
  subject?: string;
  answers?: Record<string, unknown>;
  context?: Record<string, unknown>;
  consent?: boolean;
}

const MAX_BODY = 4000;

/** The workspace behind a widget key, and the widget's own configuration. */
async function widgetFor(env: Env, key: string) {
  if (!/^[a-f0-9]{24,48}$/.test(key)) return null;
  return env.DB.prepare(
    `SELECT id, account_id AS accountId, agent_id AS agentId, allowed_hosts AS allowedHosts,
            title, subtitle, welcome, launcher, accent, position, offline_text AS offlineText,
            consent_text AS consentText, features, form_id AS formId, booking_slug AS bookingSlug,
            show_branding AS showBranding, status
     FROM crm_widgets WHERE public_key = ?`,
  ).bind(key).first<Record<string, unknown>>();
}

/**
 * Is this page allowed to embed this widget?
 *
 * An empty list means anywhere, which is right while somebody is testing and
 * wrong once they are live — the configuration screen says so rather than this
 * silently tightening. When a list *is* set, a request with no Origin at all is
 * refused: that is a script calling the endpoint directly, not a browser.
 */
function hostAllowed(allowed: string, origin: string | null): boolean {
  const list = allowed.split(',').map(h => h.trim().toLowerCase()).filter(Boolean);
  if (!list.length) return true;
  if (!origin) return false;
  let host = '';
  try { host = new URL(origin).hostname.toLowerCase(); } catch { return false; }
  return list.some(h => host === h || host.endsWith(`.${h}`));
}

const cors = (origin: string | null) => ({
  /* The widget is meant to be embedded, so the browser has to be allowed to
     call this from another origin. It is safe because the key grants nothing
     beyond this widget, and every write is rate limited and content-gated. */
  'Access-Control-Allow-Origin': origin || '*',
  'Access-Control-Allow-Headers': 'Content-Type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Vary': 'Origin',
});

export async function handleEngage(req: Request, env: Env): Promise<Response> {
  const origin = req.headers.get('Origin');
  if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: cors(origin) });

  const d = await body<Req>(req);
  const act = String(d.action ?? '');
  const ip = req.headers.get('CF-Connecting-IP') ?? 'unknown';

  const withCors = (r: Response) => {
    const h = new Headers(r.headers);
    for (const [k, v] of Object.entries(cors(origin))) h.set(k, v);
    return new Response(r.body, { status: r.status, headers: h });
  };

  /* One budget for the whole public surface. Generous for a person using a chat
     window, nowhere near enough to fill a workspace's inbox with rubbish. */
  const limit = await rateLimit(env, { what: 'engage', who: ip, max: 60, windowSeconds: 600 });
  if (!limit.allowed) {
    return withCors(fail('Too many requests from this connection. Try again shortly.', 429));
  }

  /* ── The widget asks what it should look like ── */
  if (act === 'widget') {
    const w = await widgetFor(env, String(d.widgetKey ?? ''));
    if (!w || w.status !== 'live') {
      return withCors(fail('This chat is not available.', 404, { notFound: true }));
    }
    if (!hostAllowed(String(w.allowedHosts ?? ''), origin)) {
      return withCors(fail('This chat is not enabled for this website.', 403));
    }
    const agent = w.agentId
      ? await env.DB.prepare('SELECT name, greeting, avatar_url AS avatarUrl FROM crm_ai_agents WHERE id = ? AND status = \'live\'')
          .bind(String(w.agentId)).first<Record<string, unknown>>()
      : null;

    return withCors(json({
      success: true,
      widget: {
        title: w.title, subtitle: w.subtitle, welcome: w.welcome, launcher: w.launcher,
        accent: w.accent, position: w.position, consentText: w.consentText,
        features: w.features, showBranding: w.showBranding,
        bookingSlug: w.bookingSlug, formId: w.formId,
        offlineText: w.offlineText,
      },
      /* Named rather than assumed: a widget with no live agent can still take a
         ticket, and saying so beats a chat box that answers nothing. */
      agent: agent ? { name: agent.name, greeting: agent.greeting, avatarUrl: agent.avatarUrl } : null,
    }));
  }

  /* ── Start a conversation ── */
  if (act === 'start') {
    const w = await widgetFor(env, String(d.widgetKey ?? ''));
    if (!w || w.status !== 'live') return withCors(fail('This chat is not available.', 404));
    if (!hostAllowed(String(w.allowedHosts ?? ''), origin)) {
      return withCors(fail('This chat is not enabled for this website.', 403));
    }

    const accountId = String(w.accountId);
    const key = publicKey();
    const id = rid('conv');
    const now = nowIso();

    await env.DB.prepare(
      `INSERT INTO crm_conversations
       (id, account_id, channel, status, handled_by, page_url, widget_id, visitor_key, last_at, created_at, updated_at)
       VALUES (?,?, 'chat', 'open', 'ai', ?, ?, ?, ?, ?, ?)`,
    ).bind(
      id, accountId, String(d.context?.page ?? '').slice(0, 400), String(w.id), key, now, now, now,
    ).run();

    await recordEvent(env, accountId, {
      kind: 'conversation.created', refId: id, summary: 'A visitor opened the chat',
      detail: { page: d.context?.page ?? '' },
    });

    return withCors(json({ success: true, conversationId: id, visitorKey: key }));
  }

  /* ── Say something ── */
  if (act === 'send') {
    const conv = await env.DB.prepare(
      `SELECT id, account_id AS accountId, handled_by AS handledBy, person_id AS personId,
              widget_id AS widgetId, status, visitor_key AS visitorKey
       FROM crm_conversations WHERE id = ?`,
    ).bind(String(d.conversationId ?? '')).first<Record<string, unknown>>();

    /* One message for "no such conversation" and "wrong key". Telling them apart
       would turn an id into a way of asking whether somebody else's chat exists. */
    if (!conv || String(conv.visitorKey) !== String(d.visitorKey ?? '')) {
      return withCors(fail('That conversation could not be found.', 404));
    }
    if (conv.status === 'closed') return withCors(fail('This conversation has been closed.', 409));

    const accountId = String(conv.accountId);
    const text = String(d.message ?? '').trim().slice(0, MAX_BODY);
    if (!text) return withCors(fail('Type a message first.'));

    /* The same gate every other entry point in this app goes through. A public
       chat box is the most exposed text field the product has. */
    const verdict = await contentGate(env, accountId, 'chat', text);
    if (!verdict.ok) {
      return withCors(fail(verdict.message, 422, { code: 'blocked' }));
    }

    const now = nowIso();
    await env.DB.prepare(
      `INSERT INTO crm_conversation_messages (id, conversation_id, account_id, role, body, created_at)
       VALUES (?,?,?, 'visitor', ?, ?)`,
    ).bind(rid('msg'), String(conv.id), accountId, text, now).run();
    await env.DB.prepare('UPDATE crm_conversations SET last_at = ?, updated_at = ? WHERE id = ?')
      .bind(now, now, String(conv.id)).run();

    /* A human has taken over: the AI stays out of it entirely. This is the whole
       of section 54 — an agent who has picked up a conversation is not competing
       with a bot for the next word. */
    if (conv.handledBy !== 'ai') {
      return withCors(json({ success: true, handedOver: true, messages: [] }));
    }

    const widget = await env.DB.prepare('SELECT agent_id AS agentId FROM crm_widgets WHERE id = ?')
      .bind(String(conv.widgetId)).first<{ agentId: string }>();
    const cfg = widget?.agentId
      ? await env.DB.prepare('SELECT * FROM crm_ai_agents WHERE id = ? AND account_id = ?')
          .bind(widget.agentId, accountId).first<AgentConfig>()
      : null;

    if (!cfg) {
      /* No agent configured. Said plainly rather than left as a chat box that
         never answers — and the conversation is still in the inbox, so a human
         can pick it up. */
      const said = 'Thanks — a colleague will pick this up. Leave your email and we will come back to you.';
      await env.DB.prepare(
        `INSERT INTO crm_conversation_messages (id, conversation_id, account_id, role, body, created_at)
         VALUES (?,?,?, 'system', ?, ?)`,
      ).bind(rid('msg'), String(conv.id), accountId, said, nowIso()).run();
      return withCors(json({ success: true, messages: [{ role: 'system', body: said }] }));
    }

    const { results: history } = await env.DB.prepare(
      `SELECT role, body FROM crm_conversation_messages
       WHERE conversation_id = ? AND internal = 0 ORDER BY created_at ASC LIMIT 40`,
    ).bind(String(conv.id)).all<Turn>();

    const out = await think(env, accountId, cfg, history ?? []);

    /* What the AI says goes through the same gate as what the visitor said. It
       is writing in somebody else's brand voice on somebody else's website. */
    const aiGate = await contentGate(env, accountId, 'chat', out.reply);
    const safe = aiGate.ok ? out.reply : (cfg.fallback || 'Let me put you through to a colleague.');

    await env.DB.prepare(
      `INSERT INTO crm_conversation_messages (id, conversation_id, account_id, role, body, sources, created_at)
       VALUES (?,?,?, 'ai', ?, ?, ?)`,
    ).bind(rid('msg'), String(conv.id), accountId, safe, JSON.stringify(out.sources), nowIso()).run();

    if (out.intent) {
      await env.DB.prepare('UPDATE crm_conversations SET intent = ? WHERE id = ?')
        .bind(out.intent, String(conv.id)).run();
    }

    /* The tool runs *after* the words are stored, so a tool that fails still
       leaves a conversation that reads correctly. */
    let toolResult: unknown = null;
    if (out.tool) {
      toolResult = await runTool(env, {
        accountId, conversationId: String(conv.id), personId: String(conv.personId ?? ''),
        name: out.tool.name, args: out.tool.args,
      });
    }

    if (out.needsHuman) {
      await env.DB.prepare(
        "UPDATE crm_conversations SET status = 'open', ai_summary = ? WHERE id = ?",
      ).bind(safe.slice(0, 400), String(conv.id)).run();
      await recordEvent(env, accountId, {
        kind: 'conversation.escalated', refId: String(conv.id),
        summary: 'The assistant asked for a person',
      });
    }

    return withCors(json({
      success: true,
      messages: [{ role: 'ai', body: safe, sources: out.sources }],
      tool: toolResult,
      /* Reported, not hidden: a chat that has quietly stopped thinking should
         say so, and the widget offers the human instead. */
      degraded: out.unavailable ?? null,
    }));
  }

  /* ── Poll for replies a human has sent ── */
  if (act === 'poll') {
    const conv = await env.DB.prepare(
      'SELECT id, account_id AS accountId, visitor_key AS visitorKey, handled_by AS handledBy, status FROM crm_conversations WHERE id = ?',
    ).bind(String(d.conversationId ?? '')).first<Record<string, unknown>>();
    if (!conv || String(conv.visitorKey) !== String(d.visitorKey ?? '')) {
      return withCors(fail('That conversation could not be found.', 404));
    }
    const { results } = await env.DB.prepare(
      `SELECT role, body, created_at AS createdAt FROM crm_conversation_messages
       WHERE conversation_id = ? AND internal = 0 ORDER BY created_at ASC LIMIT 200`,
    ).bind(String(conv.id)).all();
    return withCors(json({
      success: true, messages: results ?? [],
      handedOver: conv.handledBy !== 'ai', status: conv.status,
    }));
  }

  /* ── Tell us who you are ── */
  if (act === 'identify') {
    const conv = await env.DB.prepare(
      'SELECT id, account_id AS accountId, visitor_key AS visitorKey FROM crm_conversations WHERE id = ?',
    ).bind(String(d.conversationId ?? '')).first<Record<string, unknown>>();
    if (!conv || String(conv.visitorKey) !== String(d.visitorKey ?? '')) {
      return withCors(fail('That conversation could not be found.', 404));
    }
    const accountId = String(conv.accountId);
    const person = await upsertPerson(env, accountId, {
      email: d.email, phone: d.phone, name: d.name, company: d.company,
      source: 'chat', sourceRef: String(conv.id), context: d.context,
    });
    await env.DB.prepare('UPDATE crm_conversations SET person_id = ?, updated_at = ? WHERE id = ?')
      .bind(person.id, nowIso(), String(conv.id)).run();
    await recordEvent(env, accountId, {
      kind: 'contact.captured', personId: person.id, refId: String(conv.id),
      summary: `${person.name || person.email || 'A visitor'} left their details in the chat`,
    });

    /* Somebody who leaves their details in the chat is a new contact, and "when
       a contact is created" is the trigger a customer reaches for to greet one.
       Same reasoning as the form above. */
    await enrolOnEvent(env, accountId, {
      kind: 'contact_created', contactId: person.id,
      contactName: person.name ?? '', contactEmail: person.email ?? '', contactPhone: person.phone ?? '',
    });
    return withCors(json({ success: true }));
  }

  /* ── The form a visitor fills in ── */
  if (act === 'form') {
    const slug = String(d.formSlug ?? '').slice(0, 60);
    const form = await env.DB.prepare(
      `SELECT id, account_id AS accountId, name, headline, blurb, fields, submit_label AS submitLabel,
              success_message AS successMessage, redirect_url AS redirectUrl, consent_text AS consentText, status
       FROM crm_forms WHERE slug = ?`,
    ).bind(slug).first<Record<string, unknown>>();
    if (!form || form.status !== 'live') {
      return withCors(fail('This form is not available.', 404, { notFound: true }));
    }
    /* The account id is deliberately not in this payload. The page rendering the
       form has no use for it, and it is the one value that would make the key
       worth stealing. */
    return withCors(json({
      success: true,
      form: {
        name: form.name, headline: form.headline, blurb: form.blurb, fields: form.fields,
        submitLabel: form.submitLabel, consentText: form.consentText,
      },
    }));
  }

  if (act === 'submit') {
    const slug = String(d.formSlug ?? '').slice(0, 60);
    const form = await env.DB.prepare(
      `SELECT id, account_id AS accountId, name, fields, create_person AS createPerson,
              success_message AS successMessage, redirect_url AS redirectUrl, consent_text AS consentText,
              notify_emails AS notifyEmails, status
       FROM crm_forms WHERE slug = ?`,
    ).bind(slug).first<Record<string, unknown>>();
    if (!form || form.status !== 'live') return withCors(fail('This form is not available.', 404));

    const accountId = String(form.accountId);

    /* Consent is refused rather than recorded as absent. A submission kept
       without the tick is a record nobody can lawfully act on, which is worse
       than not having it. */
    if (String(form.consentText ?? '').trim() && d.consent !== true) {
      return withCors(fail('Please agree before sending.', 422, { code: 'consent' }));
    }

    const answers: Record<string, string> = {};
    for (const [k, v] of Object.entries(d.answers ?? {})) {
      if (Object.keys(answers).length >= 40) break;
      answers[String(k).slice(0, 60)] = String(v ?? '').slice(0, 2000);
    }

    const joined = Object.values(answers).join(' \n');
    const gated = await contentGate(env, accountId, 'form', joined);
    if (!gated.ok) return withCors(fail(gated.message, 422, { code: 'blocked' }));

    const email = cleanEmail(answers.email ?? d.email);
    const now = nowIso();

    let personId = '';
    if (Number(form.createPerson ?? 1) === 1) {
      const person = await upsertPerson(env, accountId, {
        email, phone: answers.phone, name: answers.name, company: answers.company,
        source: 'form', sourceRef: String(form.id), context: d.context,
      });
      personId = person.id;
    }

    const subId = rid('sub');
    await env.DB.prepare(
      `INSERT INTO crm_form_submissions
       (id, form_id, account_id, person_id, answers, context, created_at)
       VALUES (?,?,?,?,?,?,?)`,
    ).bind(
      subId, String(form.id), accountId, personId,
      JSON.stringify(answers), JSON.stringify(d.context ?? {}).slice(0, 4000), now,
    ).run();

    await recordEvent(env, accountId, {
      kind: 'form.submitted', personId, refId: subId,
      summary: `${answers.name || email || 'Someone'} sent "${String(form.name)}"`,
      detail: { formId: form.id },
    });

    /*
     * Start any automation waiting on this form.
     *
     * Here rather than on the tick, because the most useful thing an automation
     * does is answer somebody in the moment they asked — and an event that has
     * to wait up to five minutes to be *noticed* cannot do that. The work still
     * happens on the tick; this only decides who is in it.
     *
     * `enrolOnEvent` never throws. A broken graph must not be the reason a
     * stranger's enquiry is refused.
     */
    if (personId) {
      await enrolOnEvent(env, accountId, {
        kind: 'form_submitted', ref: String(form.name ?? ''),
        contactId: personId, contactName: answers.name ?? '',
        contactEmail: email, contactPhone: answers.phone ?? '',
      });
    }

    return withCors(json({
      success: true,
      message: String(form.successMessage ?? '') || 'Thank you — we have got that.',
      redirect: String(form.redirectUrl ?? ''),
    }));
  }

  /* ── Raise a ticket from the widget ── */
  if (act === 'ticket') {
    const w = await widgetFor(env, String(d.widgetKey ?? ''));
    if (!w || w.status !== 'live') return withCors(fail('Support is not available here.', 404));
    if (!hostAllowed(String(w.allowedHosts ?? ''), origin)) {
      return withCors(fail('This is not enabled for this website.', 403));
    }
    const accountId = String(w.accountId);
    const email = cleanEmail(d.email);
    if (!email) return withCors(fail('Enter an email address so we can reply.'));
    const subject = String(d.subject ?? '').trim().slice(0, 200);
    if (!subject) return withCors(fail('Say what it is about.'));

    const text = String(d.message ?? '').trim().slice(0, MAX_BODY);
    const tGate = await contentGate(env, accountId, 'form', `${subject}\n${text}`);
    if (!tGate.ok) return withCors(fail(tGate.message, 422, { code: 'blocked' }));

    const person = await upsertPerson(env, accountId, {
      email, name: d.name, phone: d.phone, source: 'ticket', context: d.context,
    });
    const reference = await nextTicketRef(env, accountId);
    const key = guestKey();
    const id = rid('tkt');
    const now = nowIso();

    await env.DB.prepare(
      `INSERT INTO crm_tickets
       (id, account_id, reference, person_id, conversation_id, subject, body, source, guest_key, created_at, updated_at)
       VALUES (?,?,?,?,?,?,?, 'widget', ?,?,?)`,
    ).bind(
      id, accountId, reference, person.id, String(d.conversationId ?? ''), subject, text, key, now, now,
    ).run();

    await recordEvent(env, accountId, {
      kind: 'ticket.created', personId: person.id, refId: id,
      summary: `${reference}: ${subject}`,
    });

    /* The reference and the key together are what lets them come back to it
       without an account — the same bargain the booking engine makes. */
    return withCors(json({ success: true, reference, guestKey: key }));
  }

  /* ── Look a ticket up again ── */
  if (act === 'ticket_status') {
    const ref = String(d.ticketRef ?? '').trim().toUpperCase().slice(0, 20);
    const key = String(d.guestKey ?? '');
    const same = 'We could not find a ticket with that reference and key.';
    if (!ref || !key) return withCors(fail(same, 200, { code: 'no-match' }));

    const t = await env.DB.prepare(
      `SELECT id, reference, subject, status, priority, created_at AS createdAt, resolution
       FROM crm_tickets WHERE reference = ? AND guest_key = ?`,
    ).bind(ref, key).first<Record<string, unknown>>();
    if (!t) return withCors(fail(same, 200, { code: 'no-match' }));

    const { results } = await env.DB.prepare(
      `SELECT role, body, created_at AS createdAt FROM crm_ticket_messages
       WHERE ticket_id = ? AND internal = 0 ORDER BY created_at ASC LIMIT 100`,
    ).bind(String(t.id)).all();

    return withCors(json({ success: true, ticket: t, messages: results ?? [] }));
  }

  return withCors(fail('Unknown action.', 400));
}
