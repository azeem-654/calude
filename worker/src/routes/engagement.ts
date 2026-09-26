/**
 * The owner's side of the engagement platform.
 *
 * Everything here needs a session and every single query is scoped by the
 * account the session was checked against — never by an id in the request. That
 * is the whole of the tenant isolation story on this route: there is no code
 * path that reads a row without `account_id = ?` bound to the checked value, so
 * naming another workspace's conversation returns nothing rather than a refusal
 * that confirms it exists.
 */
import { body, fail, json } from '../lib/http';
import { nowIso, userFromToken, workspaceAccess, type Env } from '../lib/db';
import { cleanSlug, publicKey, recordEvent, rid } from '../lib/engagement';
import { voiceStatus } from '../lib/voice';
import { enrolOnEvent } from '../lib/automationEngine';
import { cleanSdp, iceServers, offersScreen, sweepLive } from '../lib/liveHelp';
import { createEvent } from '../lib/googleCalendar';

interface Req {
  token?: string;
  accountId?: string;
  action?: string;
  id?: string;
  /* Conversations */
  conversationId?: string;
  message?: string;
  internal?: boolean;
  status?: string;
  assignedTo?: string;
  /* Tickets */
  subject?: string;
  bodyText?: string;
  priority?: string;
  category?: string;
  resolution?: string;
  personId?: string;
  /* Automations — which graph's runs, and which run's history */
  automationId?: string;
  runId?: string;
  /* Forms, agents, knowledge, widgets — saved whole */
  record?: Record<string, unknown>;
  /* Live help — the answering browser's half of the handshake */
  sdp?: string;
}

const s = (v: unknown, max = 400) => String(v ?? '').trim().slice(0, max);
const int = (v: unknown, lo: number, hi: number) =>
  Math.min(Math.max(Math.round(Number(v) || 0), lo), hi);

export async function handleEngagement(req: Request, env: Env): Promise<Response> {
  const d = await body<Req>(req);
  const user = await userFromToken(env.DB, d.token);
  const accountId = s(d.accountId, 64);
  const access = await workspaceAccess(env.DB, user, accountId);
  /*
   * Two different refusals, and the status has to tell them apart.
   *
   * `workspaceAccess` returns `not_yours` for a missing session as well as for
   * a wrong workspace, so mapping that code alone gave 403 to somebody whose
   * session had simply expired — and a client seeing 403 does not try to sign
   * in again, it shows "not allowed" to a person who is allowed. Whether there
   * is a user at all is the distinction, so it is checked first.
   */
  if (!user) return fail('Sign in again — this needs a current session.', 401, { code: 'unauthorised' });
  if (!access.ok) return fail(access.message ?? 'That workspace is not yours.', 403);

  const act = s(d.action, 40);
  const now = nowIso();
  /* Bound once: every write below stamps the acting user, and `userFromToken`
     has already been proven non-null by `workspaceAccess` refusing otherwise. */
  const who = user?.email ?? '';

  /* ── Overview ─────────────────────────────────────────────────────────── */
  if (act === 'overview') {
    const one = async (sql: string) =>
      Number((await env.DB.prepare(sql).bind(accountId).first<{ n: number }>())?.n ?? 0);

    return json({
      success: true,
      counts: {
        openConversations: await one("SELECT count(*) AS n FROM crm_conversations WHERE account_id = ? AND status = 'open'"),
        waitingOnHuman: await one("SELECT count(*) AS n FROM crm_conversations WHERE account_id = ? AND handled_by = 'human' AND status = 'open'"),
        openTickets: await one("SELECT count(*) AS n FROM crm_tickets WHERE account_id = ? AND status NOT IN ('resolved','closed')"),
        newSubmissions: await one("SELECT count(*) AS n FROM crm_form_submissions WHERE account_id = ? AND status = 'new'"),
        people: await one('SELECT count(*) AS n FROM crm_engage_people WHERE account_id = ?'),
        liveAgents: await one("SELECT count(*) AS n FROM crm_ai_agents WHERE account_id = ? AND status = 'live'"),
        liveWidgets: await one("SELECT count(*) AS n FROM crm_widgets WHERE account_id = ? AND status = 'live'"),
        liveForms: await one("SELECT count(*) AS n FROM crm_forms WHERE account_id = ? AND status = 'live'"),
        liveWaiting: await one("SELECT count(*) AS n FROM crm_live_sessions WHERE account_id = ? AND status = 'waiting'"),
      },
      /* The one number that is a judgement rather than a count: how often the
         assistant finished the job. Escalations over conversations, inverted. */
      resolution: {
        conversations: await one('SELECT count(*) AS n FROM crm_conversations WHERE account_id = ?'),
        escalated: await one("SELECT count(*) AS n FROM crm_engage_events WHERE account_id = ? AND kind = 'conversation.escalated'"),
      },
      recent: (await env.DB.prepare(
        `SELECT kind, summary, created_at AS createdAt, ref_id AS refId, person_id AS personId
         FROM crm_engage_events WHERE account_id = ? ORDER BY created_at DESC LIMIT 30`,
      ).bind(accountId).all()).results ?? [],
    });
  }

  /* ── The inbox ────────────────────────────────────────────────────────── */
  if (act === 'conversations') {
    const { results } = await env.DB.prepare(
      `SELECT c.id, c.channel, c.status, c.handled_by AS handledBy, c.assigned_to AS assignedTo,
              c.subject, c.intent, c.ai_summary AS aiSummary, c.page_url AS pageUrl,
              c.last_at AS lastAt, c.created_at AS createdAt,
              p.name AS personName, p.email AS personEmail, p.id AS personId
       FROM crm_conversations c
       LEFT JOIN crm_engage_people p ON p.id = c.person_id AND p.account_id = c.account_id
       WHERE c.account_id = ?
       ORDER BY c.last_at DESC LIMIT 200`,
    ).bind(accountId).all();
    return json({ success: true, conversations: results ?? [] });
  }

  if (act === 'conversation') {
    const conv = await env.DB.prepare(
      `SELECT c.*, p.name AS personName, p.email AS personEmail, p.phone AS personPhone
       FROM crm_conversations c
       LEFT JOIN crm_engage_people p ON p.id = c.person_id AND p.account_id = c.account_id
       WHERE c.id = ? AND c.account_id = ?`,
    ).bind(s(d.conversationId, 80), accountId).first();
    if (!conv) return fail('That conversation could not be found.', 404);

    const { results: messages } = await env.DB.prepare(
      `SELECT id, role, author, body, sources, internal, created_at AS createdAt
       FROM crm_conversation_messages WHERE conversation_id = ? AND account_id = ?
       ORDER BY created_at ASC LIMIT 500`,
    ).bind(s(d.conversationId, 80), accountId).all();

    /* Everything a human needs to pick this up without asking the customer to
       start again — section 9, in one payload. */
    const personId = String((conv as Record<string, unknown>).person_id ?? '');
    const { results: tickets } = personId
      ? await env.DB.prepare(
          'SELECT id, reference, subject, status FROM crm_tickets WHERE person_id = ? AND account_id = ? ORDER BY created_at DESC LIMIT 10',
        ).bind(personId, accountId).all()
      : { results: [] };
    const { results: timeline } = personId
      ? await env.DB.prepare(
          'SELECT kind, summary, created_at AS createdAt FROM crm_engage_events WHERE person_id = ? AND account_id = ? ORDER BY created_at DESC LIMIT 30',
        ).bind(personId, accountId).all()
      : { results: [] };

    return json({ success: true, conversation: conv, messages: messages ?? [], tickets: tickets ?? [], timeline: timeline ?? [] });
  }

  if (act === 'reply') {
    const conv = await env.DB.prepare('SELECT id FROM crm_conversations WHERE id = ? AND account_id = ?')
      .bind(s(d.conversationId, 80), accountId).first();
    if (!conv) return fail('That conversation could not be found.', 404);
    const text = s(d.message, 4000);
    if (!text) return fail('Write something first.');

    await env.DB.prepare(
      `INSERT INTO crm_conversation_messages (id, conversation_id, account_id, role, author, body, internal, created_at)
       VALUES (?,?,?, 'agent', ?,?,?,?)`,
    ).bind(rid('msg'), s(d.conversationId, 80), accountId, who, text, d.internal ? 1 : 0, now).run();

    /* Replying *is* taking over. Making that a separate button is how a bot
       ends up answering over the top of a colleague mid-sentence. An internal
       note is not a reply, so it leaves the AI where it was. */
    if (!d.internal) {
      await env.DB.prepare(
        "UPDATE crm_conversations SET handled_by = 'human', last_at = ?, updated_at = ? WHERE id = ? AND account_id = ?",
      ).bind(now, now, s(d.conversationId, 80), accountId).run();
    }
    return json({ success: true });
  }

  if (act === 'set_conversation') {
    const allowed = new Set(['open', 'pending', 'closed']);
    const status = allowed.has(s(d.status, 20)) ? s(d.status, 20) : 'open';
    await env.DB.prepare(
      'UPDATE crm_conversations SET status = ?, assigned_to = ?, updated_at = ? WHERE id = ? AND account_id = ?',
    ).bind(status, s(d.assignedTo, 190), now, s(d.conversationId, 80), accountId).run();
    return json({ success: true });
  }

  /* Give it back to the assistant — the other half of the human override. */
  if (act === 'resume_ai') {
    await env.DB.prepare(
      "UPDATE crm_conversations SET handled_by = 'ai', updated_at = ? WHERE id = ? AND account_id = ?",
    ).bind(now, s(d.conversationId, 80), accountId).run();
    return json({ success: true });
  }

  /* ── Tickets ──────────────────────────────────────────────────────────── */
  if (act === 'tickets') {
    const { results } = await env.DB.prepare(
      `SELECT t.id, t.reference, t.subject, t.status, t.priority, t.category, t.assigned_to AS assignedTo,
              t.source, t.created_at AS createdAt, t.updated_at AS updatedAt,
              p.name AS personName, p.email AS personEmail
       FROM crm_tickets t
       LEFT JOIN crm_engage_people p ON p.id = t.person_id AND p.account_id = t.account_id
       WHERE t.account_id = ? ORDER BY t.created_at DESC LIMIT 300`,
    ).bind(accountId).all();
    return json({ success: true, tickets: results ?? [] });
  }

  if (act === 'ticket') {
    const t = await env.DB.prepare(
      `SELECT t.*, p.name AS personName, p.email AS personEmail
       FROM crm_tickets t
       LEFT JOIN crm_engage_people p ON p.id = t.person_id AND p.account_id = t.account_id
       WHERE t.id = ? AND t.account_id = ?`,
    ).bind(s(d.id, 80), accountId).first();
    if (!t) return fail('That ticket could not be found.', 404);
    const { results } = await env.DB.prepare(
      `SELECT role, author, body, internal, created_at AS createdAt FROM crm_ticket_messages
       WHERE ticket_id = ? AND account_id = ? ORDER BY created_at ASC LIMIT 300`,
    ).bind(s(d.id, 80), accountId).all();
    /* The guest key is never returned. It is what lets a customer read their own
       ticket, and a screen that shows it teaches people to paste it around. */
    const row = t as Record<string, unknown>;
    delete row.guest_key;
    return json({ success: true, ticket: row, messages: results ?? [] });
  }

  if (act === 'ticket_reply') {
    const t = await env.DB.prepare('SELECT id FROM crm_tickets WHERE id = ? AND account_id = ?')
      .bind(s(d.id, 80), accountId).first();
    if (!t) return fail('That ticket could not be found.', 404);
    const text = s(d.message, 6000);
    if (!text) return fail('Write something first.');
    await env.DB.prepare(
      `INSERT INTO crm_ticket_messages (id, ticket_id, account_id, role, author, body, internal, created_at)
       VALUES (?,?,?, 'agent', ?,?,?,?)`,
    ).bind(rid('tmsg'), s(d.id, 80), accountId, who, text, d.internal ? 1 : 0, now).run();
    await env.DB.prepare('UPDATE crm_tickets SET updated_at = ? WHERE id = ? AND account_id = ?')
      .bind(now, s(d.id, 80), accountId).run();
    return json({ success: true });
  }

  if (act === 'set_ticket') {
    const allowed = new Set(['open', 'in_progress', 'waiting', 'resolved', 'closed']);
    const status = allowed.has(s(d.status, 20)) ? s(d.status, 20) : 'open';
    const prio = new Set(['low', 'normal', 'high', 'urgent']);
    const priority = prio.has(s(d.priority, 10)) ? s(d.priority, 10) : 'normal';
    const done = status === 'resolved' || status === 'closed';
    await env.DB.prepare(
      `UPDATE crm_tickets SET status = ?, priority = ?, category = ?, assigned_to = ?,
              resolution = ?, resolved_at = CASE WHEN ? = 1 THEN ? ELSE resolved_at END, updated_at = ?
       WHERE id = ? AND account_id = ?`,
    ).bind(
      status, priority, s(d.category, 60), s(d.assignedTo, 190), s(d.resolution, 2000),
      done ? 1 : 0, now, now, s(d.id, 80), accountId,
    ).run();
    await recordEvent(env, accountId, { kind: 'ticket.updated', refId: s(d.id, 80), summary: `Moved to ${status}` });
    return json({ success: true });
  }

  if (act === 'create_ticket') {
    const subject = s(d.subject, 200);
    if (!subject) return fail('Give the ticket a subject.');
    const { nextTicketRef, guestKey } = await import('../lib/engagement');
    const reference = await nextTicketRef(env, accountId);
    const id = rid('tkt');
    await env.DB.prepare(
      `INSERT INTO crm_tickets
       (id, account_id, reference, person_id, subject, body, category, priority, assigned_to, source, guest_key, created_at, updated_at)
       VALUES (?,?,?,?,?,?,?,?,?, 'manual', ?,?,?)`,
    ).bind(
      id, accountId, reference, s(d.personId, 80), subject, s(d.bodyText, 6000),
      s(d.category, 60), s(d.priority, 10) || 'normal', s(d.assignedTo, 190), guestKey(), now, now,
    ).run();
    await recordEvent(env, accountId, { kind: 'ticket.created', personId: s(d.personId, 80), refId: id, summary: `${reference}: ${subject}` });
    return json({ success: true, id, reference });
  }

  /* ── Forms, agents, knowledge, widgets ────────────────────────────────── */
  /*
   * One save and one delete each, rather than a bespoke endpoint per field.
   * The shape is validated on the way in; anything not named here is dropped
   * rather than written, so a caller cannot set `account_id` by sending it.
   */
  /* What "not specified" means, per column. Only presentational fields belong
     here: a blank business description must stay blank, because inventing one
     is how an agent starts describing a business nobody described to it. */
  const DEFAULTS: Record<string, string> = {
    accent: '#5b46e5', position: 'right', launcher: 'Chat with us',
    submit_label: 'Send', priority: 'normal', purpose: 'support',
    personality: 'professional', escalation: 'human',
    hours_from: '09:00', hours_to: '17:00', hours_days: 'Mon,Tue,Wed,Thu,Fri',
    timezone: 'UTC', kind: 'article', name: 'Website chat',
  };

  const saveable: Record<string, { table: string; cols: string[]; slugCol?: string }> = {
    form: {
      table: 'crm_forms',
      cols: ['name', 'slug', 'headline', 'blurb', 'submit_label', 'success_message', 'redirect_url',
        'fields', 'create_person', 'notify_emails', 'workflow_id', 'ai_triage', 'consent_text', 'status'],
      slugCol: 'slug',
    },
    agent: {
      table: 'crm_ai_agents',
      cols: ['name', 'avatar_url', 'purpose', 'personality', 'greeting', 'instructions', 'business_info',
        'qualifying', 'tools', 'hours_from', 'hours_to', 'hours_days', 'timezone', 'fallback', 'escalation', 'status'],
    },
    article: {
      table: 'crm_kb_articles',
      cols: ['title', 'body', 'kind', 'tags', 'source_url', 'status'],
    },
    widget: {
      table: 'crm_widgets',
      cols: ['name', 'agent_id', 'allowed_hosts', 'title', 'subtitle', 'welcome', 'launcher', 'accent',
        'position', 'offline_text', 'consent_text', 'features', 'form_id', 'booking_slug', 'show_branding', 'in_app', 'status'],
    },
    voice_agent: {
      table: 'crm_voice_agents',
      cols: ['name', 'agent_id', 'provider', 'phone_number', 'greeting', 'objectives', 'transfer_to',
        'record_calls', 'consent_text', 'status'],
    },
  };

  if (act.startsWith('list_')) {
    const what = act.slice(5);
    const spec = saveable[what];
    if (!spec) return fail('Unknown list.', 400);
    const { results } = await env.DB.prepare(
      `SELECT * FROM ${spec.table} WHERE account_id = ? ORDER BY created_at DESC LIMIT 300`,
    ).bind(accountId).all();
    /* A widget's public key is meant to be public, but a *list* of them is the
       owner's own screen and no other tenant's key is ever in it. */
    return json({ success: true, items: results ?? [] });
  }

  if (act.startsWith('save_')) {
    const what = act.slice(5);
    const spec = saveable[what];
    if (!spec) return fail('Unknown record type.', 400);

    const rec = d.record ?? {};
    const id = s(rec.id, 80) || rid(what.slice(0, 3));
    const existing = await env.DB.prepare(`SELECT id FROM ${spec.table} WHERE id = ? AND account_id = ?`)
      .bind(id, accountId).first();

    const values: Record<string, string | number> = {};
    for (const col of spec.cols) {
      /* The client sends camelCase; the columns are snake. Converted here rather
         than in fifteen call sites. */
      const camel = col.replace(/_([a-z])/g, (_, c: string) => c.toUpperCase());
      const raw = rec[camel] ?? rec[col];
      if (col === 'fields' || col === 'qualifying' || col === 'tools' || col === 'features' || col === 'objectives') {
        const asText = typeof raw === 'string' ? raw.slice(0, 40_000) : JSON.stringify(raw ?? []).slice(0, 40_000);
        /* A widget with no features is a launcher that opens nothing. Chat is
           the one every widget has, so it is what "unspecified" means. */
        values[col] = (asText === '[]' && col === 'features') ? '["chat"]' : asText;
      } else if (col === 'create_person' || col === 'ai_triage' || col === 'show_branding' || col === 'record_calls') {
        values[col] = raw === false || raw === 0 ? 0 : 1;
      } else if (col === 'in_app') {
        /* Off unless asked for, the opposite of the flags above: switching a
           widget into the corner of every customer's app is not a default. */
        values[col] = raw === true || raw === 1 || raw === '1' ? 1 : 0;
      } else if (col === 'status') {
        const ok = new Set(['draft', 'live', 'published', 'archived']);
        values[col] = ok.has(String(raw)) ? String(raw) : 'draft';
      } else {
        const text = s(raw, col === 'body' || col === 'instructions' || col === 'business_info' ? 40_000 : 400);
        /*
         * An omitted presentational field falls back to the schema's default
         * rather than to empty.
         *
         * Writing '' looked harmless and was not: a widget saved from a form
         * that did not ask about colour came back with no accent, no launcher
         * text and no position, and rendered as an unstyled box on a customer's
         * website. The column defaults are the designed answer to "not
         * specified", and blanking them threw that away.
         */
        values[col] = text || (DEFAULTS[col] ?? '');
      }
    }

    if (!s(values.name ?? values.title, 200)) return fail('Give it a name.');

    /* A slug has to be unique across the install — a submission arrives with
       nothing else to say whose form it is. Suffixed rather than refused, the
       same way the shop's collections do it. */
    if (spec.slugCol) {
      let slug = cleanSlug(values[spec.slugCol] || values.name);
      if (!slug) return fail('That name cannot be turned into a web address.');
      const clash = await env.DB.prepare(`SELECT id FROM ${spec.table} WHERE ${spec.slugCol} = ? AND id != ?`)
        .bind(slug, id).first();
      if (clash) slug = `${slug}-${Math.random().toString(36).slice(2, 6)}`;
      values[spec.slugCol] = slug;
    }

    const cols = Object.keys(values);
    if (existing) {
      await env.DB.prepare(
        `UPDATE ${spec.table} SET ${cols.map(c => `${c} = ?`).join(', ')}, updated_at = ? WHERE id = ? AND account_id = ?`,
      ).bind(...cols.map(c => values[c]), now, id, accountId).run();
    } else {
      const extra = what === 'widget' ? ', public_key' : '';
      const extraVal = what === 'widget' ? [publicKey()] : [];
      await env.DB.prepare(
        `INSERT INTO ${spec.table} (id, account_id, ${cols.join(', ')}${extra}, created_at, updated_at)
         VALUES (?,?,${cols.map(() => '?').join(',')}${extra ? ',?' : ''},?,?)`,
      ).bind(id, accountId, ...cols.map(c => values[c]), ...extraVal, now, now).run();
    }

    const saved = await env.DB.prepare(`SELECT * FROM ${spec.table} WHERE id = ? AND account_id = ?`)
      .bind(id, accountId).first();
    return json({ success: true, id, item: saved });
  }

  if (act.startsWith('delete_')) {
    const what = act.slice(7);
    const spec = saveable[what];
    if (!spec) return fail('Unknown record type.', 400);
    await env.DB.prepare(`DELETE FROM ${spec.table} WHERE id = ? AND account_id = ?`)
      .bind(s(d.id, 80), accountId).run();
    return json({ success: true });
  }

  /* ── Submissions ──────────────────────────────────────────────────────── */
  if (act === 'submissions') {
    const { results } = await env.DB.prepare(
      `SELECT sub.id, sub.form_id AS formId, sub.answers, sub.context, sub.status, sub.created_at AS createdAt,
              sub.ai_summary AS aiSummary, sub.ai_intent AS aiIntent, sub.ai_quality AS aiQuality,
              f.name AS formName, p.name AS personName, p.email AS personEmail
       FROM crm_form_submissions sub
       LEFT JOIN crm_forms f ON f.id = sub.form_id AND f.account_id = sub.account_id
       LEFT JOIN crm_engage_people p ON p.id = sub.person_id AND p.account_id = sub.account_id
       WHERE sub.account_id = ? ORDER BY sub.created_at DESC LIMIT 300`,
    ).bind(accountId).all();
    return json({ success: true, submissions: results ?? [] });
  }

  /* ── People captured from public channels ─────────────────────────────── */
  /*
   * The merge the whole design turns on. The browser asks for anything it has
   * not seen, writes it into `crm_contacts` itself, and tells us which CRM id it
   * used. Nothing here ever writes the contacts blob, so a public capture and an
   * owner with the app open cannot overwrite one another.
   */
  if (act === 'unmerged_people') {
    const { results } = await env.DB.prepare(
      `SELECT id, email, phone, name, company, source, context, created_at AS createdAt
       FROM crm_engage_people WHERE account_id = ? AND crm_id = '' ORDER BY created_at ASC LIMIT 200`,
    ).bind(accountId).all();
    return json({ success: true, people: results ?? [] });
  }

  if (act === 'mark_merged') {
    const pairs = Array.isArray(d.record?.pairs) ? d.record.pairs as { id: string; crmId: string }[] : [];
    for (const pair of pairs.slice(0, 200)) {
      await env.DB.prepare(
        "UPDATE crm_engage_people SET crm_id = ?, merged_at = ? WHERE id = ? AND account_id = ? AND crm_id = ''",
      ).bind(s(pair.crmId, 80), now, s(pair.id, 80), accountId).run();

      /*
       * Point any automation already running at the real contact.
       *
       * A form submission enrols somebody the instant it arrives, which is
       * before the CRM contact exists — the contact list is the browser's
       * document and nothing has written to it yet. So a run starts holding the
       * *engagement* person's id and the name and address it was given.
       *
       * This is the moment a CRM contact exists. From here the run finds the
       * full record, so a condition on a tag or a field the customer has since
       * edited reads the real thing rather than the snapshot taken at capture.
       */
      await env.DB.prepare(
        'UPDATE crm_automation_runs SET contact_id = ?, updated_at = ? WHERE account_id = ? AND contact_id = ?',
      ).bind(s(pair.crmId, 80), now, accountId, s(pair.id, 80)).run();

      /* And anything the engine has already asked to be changed on that person.
         A tag added by an automation thirty seconds after the form was sent is
         recorded against the engagement id, because that is the only id that
         existed. Without this line it would be addressed to a contact the
         browser has never heard of and would sit unapplied for ever. */
      await env.DB.prepare(
        'UPDATE crm_contact_changes SET contact_id = ? WHERE account_id = ? AND contact_id = ? AND applied_at IS NULL',
      ).bind(s(pair.crmId, 80), accountId, s(pair.id, 80)).run();
    }
    return json({ success: true, merged: pairs.length });
  }

  /* ── Voice ────────────────────────────────────────────────────────────── */
  /*
   * Asked of the server rather than hardcoded on the screen. Whether voice can
   * work is a property of the deployment, not of the browser looking at it — so
   * the day a provider is added, every tenant's screen stops saying it cannot.
   */
  if (act === 'voice_status') {
    return json({ success: true, ...voiceStatus() });
  }

  if (act === 'voice_sessions') {
    const { results } = await env.DB.prepare(
      `SELECT id, direction, from_number AS fromNumber, duration_s AS durationSeconds,
              ai_summary AS aiSummary, outcome, created_at AS createdAt
       FROM crm_voice_sessions WHERE account_id = ? ORDER BY created_at DESC LIMIT 200`,
    ).bind(accountId).all();
    return json({ success: true, sessions: results ?? [] });
  }

  if (act === 'set_submission') {
    const allowed = new Set(['new', 'seen', 'actioned', 'spam']);
    const status = allowed.has(s(d.status, 20)) ? s(d.status, 20) : 'seen';
    await env.DB.prepare('UPDATE crm_form_submissions SET status = ? WHERE id = ? AND account_id = ?')
      .bind(status, s(d.id, 80), accountId).run();
    return json({ success: true });
  }

  /* ── The delivery log ─────────────────────────────────────────────────── */
  /*
   * "Did Rita get the email?" — the one question the enrolment history could
   * never answer, because it lived inside a JSON blob that cannot be filtered.
   * Optional filters rather than one fixed view: the same rows answer "what did
   * this campaign send" and "what has this address ever been sent", and those
   * are the two ways anybody ever comes at it.
   */
  /* ── What the automations actually did ──────────────────────────────────
   *
   * The builder has always been able to draw one. Until the engine existed,
   * "enrolled: 0" was the only thing any screen could say about it, and it was
   * indistinguishable from an automation nobody had triggered yet and from one
   * that could never run at all. These two actions are what make the difference
   * visible.
   */
  /*
   * An event the *browser* saw, handed to the engine.
   *
   * Tags, deals and field changes all happen in the app, on records the app
   * owns. The Worker never sees them — so without this, "when a tag is added"
   * was a trigger the builder offered and nothing could ever fire, which is the
   * same class of bug as the missing engine itself.
   *
   * Authenticated and workspace-scoped, unlike the public path: only somebody
   * already inside a workspace can say something happened in it.
   */
  if (act === 'enrol_event') {
    const kind = s(d.record?.kind, 40);
    const contactId = s(d.record?.contactId, 80);
    if (!kind || !contactId) return fail('Which event, and for whom?', 400);
    const started = await enrolOnEvent(env, accountId, {
      kind,
      ref: s(d.record?.ref, 160),
      contactId,
      contactName: s(d.record?.contactName, 120),
      contactEmail: s(d.record?.contactEmail, 190),
      contactPhone: s(d.record?.contactPhone, 40),
    });
    return json({ success: true, started });
  }

  if (act === 'automation_runs') {
    const id = s(d.automationId, 80);
    const rows = id
      ? await env.DB.prepare(
          `SELECT id, automation_id AS automationId, automation_name AS automationName,
                  contact_id AS contactId, contact_name AS contactName, contact_email AS contactEmail,
                  node_id AS nodeId, due_at AS dueAt, status, detail,
                  trigger_kind AS triggerKind, trigger_ref AS triggerRef,
                  steps_taken AS stepsTaken, created_at AS createdAt, updated_at AS updatedAt
           FROM crm_automation_runs WHERE account_id = ? AND automation_id = ?
           ORDER BY updated_at DESC LIMIT 200`,
        ).bind(accountId, id).all()
      : await env.DB.prepare(
          `SELECT id, automation_id AS automationId, automation_name AS automationName,
                  contact_id AS contactId, contact_name AS contactName, contact_email AS contactEmail,
                  node_id AS nodeId, due_at AS dueAt, status, detail,
                  trigger_kind AS triggerKind, trigger_ref AS triggerRef,
                  steps_taken AS stepsTaken, created_at AS createdAt, updated_at AS updatedAt
           FROM crm_automation_runs WHERE account_id = ?
           ORDER BY updated_at DESC LIMIT 200`,
        ).bind(accountId).all();

    /* Counted in the database rather than from the page of rows above, so a
       workspace with three hundred runs does not read "200 active". */
    const { results: totals } = await env.DB.prepare(
      id
        ? 'SELECT status, COUNT(*) AS n FROM crm_automation_runs WHERE account_id = ? AND automation_id = ? GROUP BY status'
        : 'SELECT status, COUNT(*) AS n FROM crm_automation_runs WHERE account_id = ? GROUP BY status',
    ).bind(...(id ? [accountId, id] : [accountId])).all();

    return json({ success: true, runs: rows.results ?? [], totals: totals ?? [] });
  }

  if (act === 'automation_log') {
    const runId = s(d.runId, 80);
    if (!runId) return fail('Which run?', 400);
    /* Scoped by account as well as by run id: a run id from another workspace
       must read as empty rather than as somebody else's history. */
    const { results } = await env.DB.prepare(
      `SELECT id, node_id AS nodeId, node_type AS nodeType, status, detail, created_at AS createdAt
       FROM crm_automation_log WHERE account_id = ? AND run_id = ? ORDER BY created_at ASC LIMIT 400`,
    ).bind(accountId, runId).all();
    return json({ success: true, entries: results ?? [] });
  }

  /* ── Changes the engine wants made to a contact ──
   *
   * Read and then confirmed by the browser, which is the only writer of the
   * contact list. Exactly the shape `unmerged_people` / `mark_merged` already
   * take, for exactly the same reason. */
  if (act === 'pending_contact_changes') {
    const { results } = await env.DB.prepare(
      `SELECT id, contact_id AS contactId, kind, field, value, source, source_id AS sourceId, created_at AS createdAt
       FROM crm_contact_changes WHERE account_id = ? AND applied_at IS NULL
       ORDER BY created_at ASC LIMIT 300`,
    ).bind(accountId).all();
    return json({ success: true, changes: results ?? [] });
  }

  if (act === 'mark_changes_applied') {
    const ids = Array.isArray(d.record?.ids) ? d.record.ids as string[] : [];
    for (const id of ids.slice(0, 300)) {
      /* `applied_at IS NULL` in the WHERE, so replaying a batch is harmless —
         the same guarantee `mark_merged` gives, and the reason both are safe to
         call on a timer. */
      await env.DB.prepare(
        'UPDATE crm_contact_changes SET applied_at = ? WHERE id = ? AND account_id = ? AND applied_at IS NULL',
      ).bind(now, s(id, 80), accountId).run();
    }
    return json({ success: true, applied: ids.length });
  }

  if (act === 'delivery_log') {
    const sourceId = s(d.id, 80);
    const who = s(d.assignedTo, 200);   // reused as the recipient filter
    const where: string[] = ['account_id = ?'];
    const bind: (string | number)[] = [accountId];
    if (sourceId) { where.push('source_id = ?'); bind.push(sourceId); }
    if (who) { where.push('recipient = ?'); bind.push(who.toLowerCase()); }
    if (s(d.status, 20)) { where.push('status = ?'); bind.push(s(d.status, 20)); }

    const { results } = await env.DB.prepare(
      `SELECT id, channel, source, source_id AS sourceId, source_name AS sourceName,
              step_index AS stepIndex, contact_id AS contactId, recipient, subject,
              status, detail, sent_from AS sentFrom, created_at AS createdAt
       FROM crm_delivery_log WHERE ${where.join(' AND ')}
       ORDER BY created_at DESC LIMIT 500`,
    ).bind(...bind).all();

    const totals = await env.DB.prepare(
      `SELECT status, count(*) AS n FROM crm_delivery_log WHERE account_id = ? GROUP BY status`,
    ).bind(accountId).all<{ status: string; n: number }>();

    return json({ success: true, entries: results ?? [], totals: totals.results ?? [] });
  }

  /* ── Live help: watching somebody's screen ───────────────────────────── */
  /*
   * The answering side. A request arrives from a widget (engage.ts); whoever
   * joins first writes the answer, and from then on the two browsers talk
   * directly. Everything is scoped to the checked workspace like the rest of
   * this route, and the share key and descriptions never leave it except to
   * the one person joining.
   */
  if (act === 'live_sessions') {
    await sweepLive(env, accountId);
    const { results } = await env.DB.prepare(
      `SELECT id, name, email, topic, page_url AS pageUrl, verified_email AS verifiedEmail,
              verified_account AS verifiedAccount, status, ended_reason AS endedReason,
              sharer_state AS sharerState, agent_email AS agentEmail, agent_name AS agentName,
              meet_url AS meetUrl, (offer != '') AS ready,
              created_at AS createdAt, joined_at AS joinedAt, ended_at AS endedAt
       FROM crm_live_sessions WHERE account_id = ? ORDER BY created_at DESC LIMIT 60`,
    ).bind(accountId).all();
    const { results: widgets } = await env.DB.prepare(
      "SELECT features FROM crm_widgets WHERE account_id = ? AND status = 'live'",
    ).bind(accountId).all<{ features: string }>();
    const meet = await env.DB.prepare(
      "SELECT 1 AS ok FROM crm_calendar_connections WHERE account_id = ? AND status = 'connected' LIMIT 1",
    ).bind(accountId).first();
    return json({
      success: true, sessions: results ?? [],
      /* Said rather than implied by an empty list: "nobody has asked" and
         "nobody can ask" are different, and only one is fixed on this screen. */
      enabled: (widgets ?? []).some(w => offersScreen(w.features)),
      relay: !!(env.TURN_KEY_ID && env.TURN_KEY_API_TOKEN),
      meetReady: !!meet,
    });
  }

  /* The app-wide alert asks this every half minute from every open tab, so it
     is a read and nothing else — no sweep. A request whose page stopped asking
     is left out by its heartbeat rather than by closing it here. */
  if (act === 'live_waiting') {
    const cut = new Date(Date.now() - 3 * 60_000).toISOString();
    const row = await env.DB.prepare(
      "SELECT count(*) AS n FROM crm_live_sessions WHERE account_id = ? AND status = 'waiting' AND seen_at >= ?",
    ).bind(accountId, cut).first<{ n: number }>();
    const { results: widgets } = await env.DB.prepare(
      "SELECT features FROM crm_widgets WHERE account_id = ? AND status = 'live'",
    ).bind(accountId).all<{ features: string }>();
    return json({ success: true, waiting: Number(row?.n ?? 0), enabled: (widgets ?? []).some(w => offersScreen(w.features)) });
  }

  if (act === 'live_session') {
    const row = await env.DB.prepare(
      `SELECT id, name, email, topic, status, offer, answer, agent_email AS agentEmail,
              sharer_state AS sharerState, meet_url AS meetUrl, ended_reason AS endedReason
       FROM crm_live_sessions WHERE id = ? AND account_id = ?`,
    ).bind(s(d.id, 80), accountId).first<Record<string, string>>();
    if (!row) return fail('That session could not be found.', 404);
    /* The ICE servers are minted only for somebody about to join — a TURN
       credential is a small bill, and a list screen refreshing every few
       seconds would mint one each time. */
    const ice = row.status === 'waiting' && row.offer ? await iceServers(env) : { servers: [], relay: false };
    return json({ success: true, session: row, iceServers: ice.servers, relay: ice.relay });
  }

  if (act === 'live_answer') {
    const sdp = cleanSdp(d.sdp);
    if (!sdp) return fail('That connection description was not usable.', 422);
    /* First to join wins, in one statement. Two people pressing Join at once
       must not both believe they are connected while one of them is looking at
       nothing. */
    const res = await env.DB.prepare(
      `UPDATE crm_live_sessions
       SET answer = ?, status = 'live', agent_email = ?, agent_name = ?, joined_at = ?, updated_at = ?
       WHERE id = ? AND account_id = ? AND status = 'waiting' AND answer = '' AND offer != ''`,
    ).bind(sdp, who, user?.name ?? '', now, now, s(d.id, 80), accountId).run();
    if (!res.meta.changes) {
      return fail('Somebody else has joined this one already, or they have left.', 409, { code: 'taken' });
    }
    await recordEvent(env, accountId, {
      kind: 'live.joined', refId: s(d.id, 80), summary: `${user?.name || who} joined a screen share`,
    });
    return json({ success: true });
  }

  if (act === 'live_end') {
    await env.DB.prepare(
      `UPDATE crm_live_sessions SET status = 'ended', ended_reason = 'agent', ended_at = ?, updated_at = ?
       WHERE id = ? AND account_id = ? AND status != 'ended'`,
    ).bind(now, now, s(d.id, 80), accountId).run();
    return json({ success: true });
  }

  /*
   * The fallback: a Google Meet, made now, for this session.
   *
   * For the networks a direct connection cannot cross, and for anybody on a
   * phone — mobile browsers cannot share a screen from a web page, and the Meet
   * app can. Needs a connected calendar on this workspace; without one it says
   * so by name rather than handing back a link to nowhere.
   */
  if (act === 'live_meet') {
    const row = await env.DB.prepare(
      `SELECT id, name, email, verified_email AS verifiedEmail, topic, meet_url AS meetUrl, status
       FROM crm_live_sessions WHERE id = ? AND account_id = ?`,
    ).bind(s(d.id, 80), accountId).first<Record<string, string>>();
    if (!row) return fail('That session could not be found.', 404);
    if (row.meetUrl) return json({ success: true, meetUrl: row.meetUrl });
    if (row.status === 'ended') return fail('That session has ended.', 409);

    const conn = await env.DB.prepare(
      "SELECT owner_email AS ownerEmail FROM crm_calendar_connections WHERE account_id = ? AND status = 'connected' LIMIT 1",
    ).bind(accountId).first<{ ownerEmail: string }>();
    if (!conn) {
      return fail('No Google Calendar is connected on this workspace, so a Meet cannot be made. Connect one under Meetings.', 200, { code: 'no-calendar' });
    }

    /* UTC wall-clock with the zone named, the same contract the booking path
       uses; "now" is the same instant in every zone. */
    const iso = (ms: number) => new Date(ms).toISOString().slice(0, 19);
    const start = Date.now();
    const guest = row.verifiedEmail || row.email;
    const ev = await createEvent(env, accountId, {
      ownerEmail: conn.ownerEmail,
      summary: `Live help — ${row.name || guest || 'a customer'}`,
      description: row.topic || 'Screen-sharing support session.',
      startIso: iso(start), endIso: iso(start + 30 * 60_000), timezone: 'UTC',
      guestEmail: guest || undefined, guestName: row.name || undefined,
    });
    if (!ev.ok || !ev.data?.meetingUrl) {
      return fail(ev.error || 'Google made the event but gave it no Meet link.', 200, { code: 'meeting' });
    }
    await env.DB.prepare('UPDATE crm_live_sessions SET meet_url = ?, updated_at = ? WHERE id = ? AND account_id = ?')
      .bind(ev.data.meetingUrl, now, row.id, accountId).run();
    await recordEvent(env, accountId, {
      kind: 'meeting.created', refId: row.id,
      summary: `Google Meet made for ${row.name || guest || 'a live-help session'}`,
      detail: { meetingUrl: ev.data.meetingUrl },
    });
    return json({ success: true, meetUrl: ev.data.meetingUrl });
  }

  /* ── Settings ─────────────────────────────────────────────────────────── */
  if (act === 'settings') {
    const row = await env.DB.prepare('SELECT * FROM crm_engage_settings WHERE account_id = ?')
      .bind(accountId).first();
    return json({ success: true, settings: row ?? null });
  }

  if (act === 'save_settings') {
    const r = d.record ?? {};
    await env.DB.prepare(
      `INSERT INTO crm_engage_settings
       (account_id, business_name, support_email, logo_url, accent,
        notify_new_conversation, notify_new_ticket, notify_new_submission, notify_emails, retain_days, updated_at)
       VALUES (?,?,?,?,?,?,?,?,?,?,?)
       ON CONFLICT(account_id) DO UPDATE SET
         business_name=excluded.business_name, support_email=excluded.support_email,
         logo_url=excluded.logo_url, accent=excluded.accent,
         notify_new_conversation=excluded.notify_new_conversation,
         notify_new_ticket=excluded.notify_new_ticket,
         notify_new_submission=excluded.notify_new_submission,
         notify_emails=excluded.notify_emails, retain_days=excluded.retain_days,
         updated_at=excluded.updated_at`,
    ).bind(
      accountId, s(r.businessName, 160), s(r.supportEmail, 190), s(r.logoUrl, 400), s(r.accent, 20) || '#5b46e5',
      r.notifyNewConversation === false ? 0 : 1,
      r.notifyNewTicket === false ? 0 : 1,
      r.notifyNewSubmission === false ? 0 : 1,
      s(r.notifyEmails, 600), int(r.retainDays, 0, 3650), now,
    ).run();
    return json({ success: true });
  }

  return fail('Unknown action.', 400);
}
