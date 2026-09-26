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
import { nowIso, userFromToken, type Env, type SessionUser } from '../lib/db';
import { rateLimit } from '../lib/rateLimit';
import { gate as contentGate } from '../lib/contentGate';
import {
  cleanEmail, guestKey, publicKey, recordEvent, rid, upsertPerson, nextTicketRef,
} from '../lib/engagement';
import { think, type AgentConfig, type Turn } from '../lib/agentBrain';
import { runTool } from '../lib/agentTools';
import { enrolOnEvent } from '../lib/automationEngine';
import { cleanSdp, iceServers, offersScreen, SEEN_EVERY_MS, WAIT_MINUTES } from '../lib/liveHelp';

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

  /* Live help. `token` is only ever the cookie placeholder, swapped for the
     real session by withCookieToken when — and only when — the widget is on
     this install's own origin. On anybody else's site it stays "cookie" and
     resolves to nobody. */
  token?: string;
  sessionId?: string;
  shareKey?: string;
  sdp?: string;
  state?: string;
  reason?: string;
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
     window, nowhere near enough to fill a workspace's inbox with rubbish.

     Except the live-help poll, which has its own. A person waiting for support
     asks every few seconds and creates nothing by asking; charging that to the
     shared budget would lock them out of their own session in ten minutes. */
  const limit = act === 'live_poll'
    ? await rateLimit(env, { what: 'engage-live', who: ip, max: 600, windowSeconds: 600 })
    : await rateLimit(env, { what: 'engage', who: ip, max: 60, windowSeconds: 600 });
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

  /* ── Which widget is the help button inside this app ──
     The install owner's, and only theirs: the round button in the corner of
     Protected Central is Protected Central answering its own customers, with
     the same widget any customer puts on their own site. A tenant ticking the
     same box on their workspace changes nothing here. Answers with a key that
     is public anyway, or with nothing. */
  if (act === 'house') {
    const w = await env.DB.prepare(
      `SELECT public_key AS publicKey FROM crm_widgets
       WHERE in_app = 1 AND status = 'live' AND account_id IN (
         SELECT ws.account_id FROM crm_workspaces ws
         JOIN crm_users u ON u.email = ws.owner_email
         WHERE u.account_id IS NULL AND u.role = 'agency')
       ORDER BY updated_at DESC LIMIT 1`,
    ).first<{ publicKey: string }>().catch(() => null);
    return withCors(json({ success: true, widgetKey: w?.publicKey ?? '' }));
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
        kind: 'form_submitted', ref: String(form.name ?? ''), refId: String(form.id ?? ''),
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
    const email = cleanEmail(d.email) || (await signedIn(env, d.token))?.email || '';
    if (!email) return withCors(fail('Enter an email address so we can reply.'));
    const subject = String(d.subject ?? '').trim().slice(0, 200);
    if (!subject) return withCors(fail('Say what it is about.'));

    const text = String(d.message ?? '').trim().slice(0, MAX_BODY);
    const tGate = await contentGate(env, accountId, 'form', `${subject}\n${text}`);
    if (!tGate.ok) return withCors(fail(tGate.message, 422, { code: 'blocked' }));

    /* A signed-in customer of this install raising one from the app is who
       their session says, whatever the form was filled in with. */
    const me = await signedIn(env, d.token);
    const person = await upsertPerson(env, accountId, {
      email: me?.email || email, name: d.name || me?.name, phone: d.phone, source: 'ticket', context: d.context,
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

  /* ══ Live help: sharing a screen with the business ══════════════════════
   *
   * This side is the person sharing. They ask; somebody at the business sees
   * the request in Customer Engagement → Live help and joins; the two
   * browsers then talk directly. What passes through here is the handshake
   * and the state, never the picture.
   */
  if (act === 'live_start') {
    const w = await widgetFor(env, String(d.widgetKey ?? ''));
    if (!w || w.status !== 'live') return withCors(fail('Support is not available here.', 404));
    if (!hostAllowed(String(w.allowedHosts ?? ''), origin)) {
      return withCors(fail('This is not enabled for this website.', 403));
    }
    if (!offersScreen(w.features)) {
      return withCors(fail('Screen sharing is not switched on for this chat.', 403, { code: 'off' }));
    }
    /* On top of the shared budget: each request is a row and an alert to a
       real person, so a handful an hour from one address is plenty. */
    const starts = await rateLimit(env, { what: 'live-start', who: ip, max: 6, windowSeconds: 3600 });
    if (!starts.allowed) return withCors(fail('Too many requests from this connection. Try again later.', 429));

    const accountId = String(w.accountId);
    const me = await signedIn(env, d.token);
    const name = String(d.name ?? '').trim().slice(0, 120) || me?.name || '';
    const email = cleanEmail(d.email) || me?.email || '';
    const topic = String(d.subject ?? '').trim().slice(0, 500);
    if (topic) {
      const g = await contentGate(env, accountId, 'chat', topic);
      if (!g.ok) return withCors(fail(g.message, 422, { code: 'blocked' }));
    }

    let personId = '';
    if (email) {
      const person = await upsertPerson(env, accountId, {
        email, name, source: 'live', context: d.context,
      });
      personId = person.id;
    }

    const id = rid('live');
    const key = publicKey();
    const now = nowIso();
    await env.DB.prepare(
      `INSERT INTO crm_live_sessions
       (id, account_id, widget_id, conversation_id, person_id, name, email, topic, page_url,
        verified_email, verified_account, share_key, seen_at, created_at, updated_at)
       VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
    ).bind(
      id, accountId, String(w.id), String(d.conversationId ?? '').slice(0, 80), personId,
      name, email, topic, String(d.context?.page ?? '').slice(0, 400),
      me?.email ?? '', await provenWorkspace(env, me, d.context?.workspace),
      key, now, now, now,
    ).run();

    await recordEvent(env, accountId, {
      kind: 'live.requested', personId, refId: id,
      summary: `${name || email || 'A visitor'} wants to share their screen${topic ? ` — ${topic.slice(0, 80)}` : ''}`,
    });

    const ice = await iceServers(env);
    return withCors(json({
      success: true, sessionId: id, shareKey: key,
      iceServers: ice.servers, relay: ice.relay,
    }));
  }

  if (['live_offer', 'live_poll', 'live_end'].includes(act)) {
    const row = await env.DB.prepare(
      `SELECT id, account_id AS accountId, share_key AS shareKey, status, ended_reason AS endedReason,
              answer, meet_url AS meetUrl, agent_name AS agentName, sharer_state AS sharerState,
              seen_at AS seenAt, created_at AS createdAt
       FROM crm_live_sessions WHERE id = ?`,
    ).bind(String(d.sessionId ?? '').slice(0, 80)).first<Record<string, string>>();
    /* One answer for "no such session" and "wrong key", as for conversations. */
    if (!row || !d.shareKey || row.shareKey !== String(d.shareKey)) {
      return withCors(fail('That session could not be found.', 404));
    }
    const now = nowIso();

    if (act === 'live_offer') {
      if (row.status !== 'waiting') return withCors(fail('This session has already started or ended.', 409));
      const sdp = cleanSdp(d.sdp);
      if (!sdp) return withCors(fail('That connection description was not usable.', 422));
      await env.DB.prepare(
        "UPDATE crm_live_sessions SET offer = ?, updated_at = ?, seen_at = ? WHERE id = ? AND status = 'waiting' AND answer = ''",
      ).bind(sdp, now, now, row.id).run();
      return withCors(json({ success: true }));
    }

    if (act === 'live_end') {
      if (row.status !== 'ended') {
        const reason = d.reason === 'failed' ? 'failed' : 'sharer';
        await env.DB.prepare(
          "UPDATE crm_live_sessions SET status = 'ended', ended_reason = ?, sharer_state = ?, ended_at = ?, updated_at = ? WHERE id = ? AND status != 'ended'",
        ).bind(reason, reason === 'failed' ? 'failed' : row.sharerState, now, now, row.id).run();
      }
      return withCors(json({ success: true }));
    }

    /* live_poll. Nobody has picked it up in time: said, and ended, here rather
       than left for a sweep that only runs when the business looks. */
    let status = row.status;
    let endedReason = row.endedReason;
    if (status === 'waiting' && Date.parse(row.createdAt) < Date.now() - WAIT_MINUTES * 60_000) {
      await env.DB.prepare(
        "UPDATE crm_live_sessions SET status = 'ended', ended_reason = 'expired', ended_at = ?, updated_at = ? WHERE id = ? AND status = 'waiting'",
      ).bind(now, now, row.id).run();
      status = 'ended';
      endedReason = 'expired';
    }

    /* The heartbeat is written only now and then, and when the connection
       state actually changes — a poll every few seconds that wrote every time
       would be a database write every few seconds for every waiting person. */
    const state = ['new', 'connecting', 'connected', 'failed'].includes(String(d.state)) ? String(d.state) : row.sharerState;
    const stale = Date.parse(row.seenAt) < Date.now() - SEEN_EVERY_MS;
    if (status !== 'ended' && (stale || state !== row.sharerState)) {
      await env.DB.prepare('UPDATE crm_live_sessions SET seen_at = ?, sharer_state = ? WHERE id = ?')
        .bind(now, state, row.id).run();
    }

    return withCors(json({
      success: true, status, endedReason,
      answer: row.answer || '', meetUrl: row.meetUrl || '', agentName: row.agentName || '',
    }));
  }

  return withCors(fail('Unknown action.', 400));
}

/**
 * The signed-in person behind a request, when there is one.
 *
 * Only ever true on this install's own origin: the page sends the cookie
 * placeholder, and withCookieToken swaps in the real session only for a
 * same-origin request carrying the cookie. A widget on a stranger's site sends
 * the same placeholder and gets nobody — so an identity found here was proved,
 * not typed.
 */
async function signedIn(env: Env, token: unknown) {
  const t = String(token ?? '');
  if (!t || t === 'cookie') return null;
  return userFromToken(env.DB, t).catch(() => null);
}

/**
 * The workspace a signed-in sharer was using, if it is really theirs.
 *
 * The page says which one; the database decides whether to believe it. Read
 * only — `workspaceAccess` would claim an unowned id for them, and asking for
 * help must not be a way of creating a workspace.
 */
async function provenWorkspace(env: Env, me: SessionUser | null, claimed: unknown): Promise<string> {
  if (!me) return '';
  const ws = String(claimed ?? '').slice(0, 80);
  if (!ws) return me.accountId ?? '';
  if (me.accountId === ws) return ws;
  const row = await env.DB.prepare('SELECT 1 AS ok FROM crm_workspaces WHERE account_id = ? AND owner_email = ?')
    .bind(ws, me.email).first<{ ok: number }>().catch(() => null);
  return row ? ws : '';
}
