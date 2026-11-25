/**
 * /api/support-desk.php — the install owner's desk for their own customers,
 * and the customer's side of it.
 *
 *  owner     customers, broadcast_count, broadcast_test, broadcast_send,
 *            broadcasts, broadcast_cancel, direct, offer_call, access_request,
 *            access_list, access_end, access_open, review, reviews, pulse
 *  anybody   heartbeat, notice_answer, notice_reply, access_decide,
 *            access_revoke
 *
 * Owner-only means the install owner (role agency, no workspace of its own) —
 * the same test as routes/customers.ts. A sub-account running its own clients
 * is not the operator and gets none of this.
 *
 * What the owner may do inside a customer's account is decided in one place,
 * lib/db.ts `workspaceAccess` → `supportGrantActive`: only while the customer
 * has approved, only until the time they gave. A read-only review here never
 * passes through that gate and never writes to the customer's data; it is
 * logged with its reason, and the Terms say Protected Central may look.
 */
import { body, fail, json } from '../lib/http';
import { nowIso, userFromToken, type Env, type SessionUser } from '../lib/db';
import { createEvent } from '../lib/googleCalendar';
import { rateLimit } from '../lib/rateLimit';
import { listSignups, safeLink } from './customers';
import {
  ACCESS_HOURS, SEGMENTS, accessById, accessList, customerReply, decideAccess, endAccess, installOwnerEmail,
  installSend, isCustomer, mailHtml, origin, ownerAlert, postDirect, reviewSnapshot, segmentOf, sha256,
  broadcastHtml, supportAccount, when, type Segment,
} from '../lib/supportDesk';

interface Req {
  token?: string;
  action?: string;
  email?: string;
  message?: string;
  emailToo?: boolean;
  id?: string;
  answer?: string;
  approve?: boolean;
  hours?: number;
  reason?: string;
  path?: string;
  app?: string;
  since?: string;
  kind?: string;
  subject?: string;
  body?: string;
  link?: string;
  linkLabel?: string;
  audience?: string[];
  inApp?: boolean;
}

const isOwner = (u: SessionUser) => u.role === 'agency' && !u.accountId;
const ONLINE_MS = 150_000;
const NEW_VISIT_MS = 30 * 60_000;
const ONLINE_ALERT_GAP_MS = 6 * 3_600_000;
const s = (v: unknown, n: number) => String(v ?? '').trim().slice(0, n);

function audienceOf(v: unknown): Segment[] {
  const list = Array.isArray(v) ? v.map(String) : [];
  return SEGMENTS.filter(x => list.includes(x));
}

/** Customers in the chosen segments, with their names. */
async function audienceMembers(env: Env, segs: Segment[]): Promise<{ email: string; name: string }[]> {
  const rows = await listSignups(env, 2000);
  const out: { email: string; name: string }[] = [];
  for (const r of rows) if (segs.includes(await segmentOf(env, r.email))) out.push({ email: r.email, name: r.name });
  return out;
}

export async function handleSupportDesk(req: Request, env: Env): Promise<Response> {
  const d = await body<Req>(req);
  const user = await userFromToken(env.DB, d.token);
  if (!user) return fail('Sign in again — this needs a current session.', 401, { code: 'unauthorised' });
  const act = s(d.action, 40);
  const reqOrigin = new URL(req.url).origin;

  /* ══ Anybody signed in ══════════════════════════════════════════════════ */

  /* A page of the app is open and visible: who is online, and anything the
     owner sent since. Written at most once a minute per person (the page
     calls every 60 s) and answered with what the corner card needs. */
  if (act === 'heartbeat') {
    const now = nowIso();
    let unread = 0; let latest = '';
    let access: { id: string; status: string; hours: number; reason: string; expiresAt: string | null } | null = null;
    try {
      if (!isOwner(user)) {
        const prev = await env.DB.prepare('SELECT last_at AS lastAt, visit_at AS visitAt FROM crm_user_presence WHERE email = ?')
          .bind(user.email).first<{ lastAt: string; visitAt: string }>();
        const newVisit = !prev || Date.now() - Date.parse(prev.lastAt) > NEW_VISIT_MS;
        await env.DB.prepare(
          `INSERT INTO crm_user_presence (email, account_id, path, app, visit_at, last_at) VALUES (?,?,?,?,?,?)
           ON CONFLICT(email) DO UPDATE SET account_id = excluded.account_id, path = excluded.path, app = excluded.app,
             visit_at = CASE WHEN ?7 = 1 THEN excluded.visit_at ELSE crm_user_presence.visit_at END, last_at = excluded.last_at`,
        ).bind(user.email, user.accountId ?? '', s(d.path, 200), s(d.app, 20) || 'web', now, now, newVisit ? 1 : 0).run();
        /* "Came online" once per visit, and at most every six hours per
           person — an alert every time somebody reopens a tab is noise the
           owner learns to ignore. Customers only: not client logins. */
        if (newVisit && user.role === 'agency') {
          const last = await env.DB.prepare("SELECT created_at AS at FROM crm_owner_alerts WHERE kind = 'customer.online' AND email = ? ORDER BY created_at DESC LIMIT 1")
            .bind(user.email).first<{ at: string }>();
          if (!last || Date.now() - Date.parse(last.at) > ONLINE_ALERT_GAP_MS) {
            const seg = await segmentOf(env, user.email);
            await ownerAlert(env, {
              kind: 'customer.online', email: user.email,
              summary: `${user.name || user.email} (${{ trial: 'on trial', ended: 'trial ended', paid: 'paid', appsumo: 'AppSumo', other: 'customer' }[seg]}) is using the app now.`,
              route: '/engagement?tab=customers',
            });
          }
        }
      }
      const n = await env.DB.prepare('SELECT count(*) AS n, max(created_at) AS latest FROM crm_notices WHERE to_email = ? AND read_at IS NULL')
        .bind(user.email).first<{ n: number; latest: string | null }>();
      unread = Number(n?.n ?? 0); latest = n?.latest ?? '';
      const a = (await accessList(env, "customer_email = ? AND mode = 'assist' AND (status = 'pending' OR (status = 'active' AND expires_at > ?))", [user.email, now], 1))[0];
      if (a) access = { id: a.id, status: a.status, hours: a.hours, reason: a.reason, expiresAt: a.expiresAt };
    } catch { /* before 0107 */ }
    return json({ success: true, unread, latest, access });
  }

  /* A call offer answered from the corner card. */
  if (act === 'notice_answer') {
    const answer = s(d.answer, 10) === 'join' ? 'join' : 'decline';
    const n = await env.DB.prepare("SELECT id, kind, link FROM crm_notices WHERE id = ? AND to_email = ? AND kind = 'call'")
      .bind(s(d.id, 80), user.email).first<{ id: string; kind: string; link: string }>();
    if (!n) return fail('That message could not be found.', 404);
    const now = nowIso();
    await env.DB.prepare('UPDATE crm_notices SET answer = ?, answered_at = ?, read_at = ? WHERE id = ?').bind(answer, now, now, n.id).run();
    await ownerAlert(env, {
      kind: answer === 'join' ? 'call.accepted' : 'call.declined', email: user.email,
      summary: answer === 'join' ? `${user.name || user.email} is joining your call now.` : `${user.name || user.email} said not now to the call.`,
      route: '/engagement?tab=customers', push: answer === 'join' ? 'call' : false,
    });
    return json({ success: true, link: answer === 'join' ? n.link : '' });
  }

  /* An answer to a direct message, back into the owner's support inbox. */
  if (act === 'notice_reply') {
    const text = s(d.message, 4000);
    if (!text) return fail('Write something first.', 200, { field: 'notice.reply' });
    const room = await rateLimit(env, { what: 'notice-reply', who: user.email, max: 30, windowSeconds: 600 });
    if (!room.allowed) return fail('That is a lot of messages at once — wait a few minutes.', 429);
    const n = await env.DB.prepare("SELECT conversation_id AS conv FROM crm_notices WHERE id = ? AND to_email = ? AND kind IN ('direct','call')")
      .bind(s(d.id, 80), user.email).first<{ conv: string }>();
    if (!n?.conv) return fail('That message could not be found.', 404);
    const ok = await customerReply(env, n.conv, { email: user.email, name: user.name }, text);
    if (!ok) return fail('That conversation has been closed — use the help button to write to us.', 409);
    return json({ success: true });
  }

  /* Approve or decline a request for access, inside the app. Only the
     customer it was asked of. */
  if (act === 'access_decide') {
    const row = await accessById(env, s(d.id, 80));
    if (!row || row.customerEmail !== user.email || row.mode !== 'assist') return fail('That request could not be found.', 404);
    const r = await decideAccess(env, row, !!d.approve, reqOrigin);
    if (!r.ok) return fail(`That request is already ${r.status}.`, 409);
    return json({ success: true, status: r.status, expiresAt: r.expiresAt ?? null });
  }

  if (act === 'access_revoke') {
    const row = await accessById(env, s(d.id, 80));
    if (!row || row.customerEmail !== user.email) return fail('That permission could not be found.', 404);
    const ok = await endAccess(env, row.id, 'revoked');
    return ok ? json({ success: true }) : fail('That permission has already ended.', 409);
  }

  /* ══ The owner's alone from here ════════════════════════════════════════ */
  if (!isOwner(user)) return fail('Only the install owner can use the support desk.', 403);

  if (act === 'customers') {
    const rows = await listSignups(env, 2000);
    const presence = new Map<string, { lastAt: string; path: string; app: string; visitAt: string }>();
    try {
      const p = await env.DB.prepare('SELECT email, last_at AS lastAt, path, app, visit_at AS visitAt FROM crm_user_presence WHERE last_at > ?')
        .bind(new Date(Date.now() - 7 * 86_400_000).toISOString()).all<{ email: string; lastAt: string; path: string; app: string; visitAt: string }>();
      for (const r of p.results ?? []) presence.set(r.email, r);
    } catch { /* before 0107 */ }
    const grants = new Map<string, { id: string; status: string; expiresAt: string | null; hours: number }>();
    for (const g of await accessList(env, "mode = 'assist' AND (status = 'pending' OR (status = 'active' AND expires_at > ?))", [nowIso()], 500)) {
      if (!grants.has(g.customerEmail)) grants.set(g.customerEmail, { id: g.id, status: g.status, expiresAt: g.expiresAt, hours: g.hours });
    }
    const optouts = new Set(((await env.DB.prepare('SELECT email FROM crm_customer_optouts').all<{ email: string }>().catch(() => ({ results: [] }))).results ?? []).map(r => r.email));
    const out = [];
    for (const r of rows) {
      const p = presence.get(r.email);
      out.push({
        email: r.email, name: r.name, createdAt: r.createdAt, accountId: r.accountId, trial: r.trial,
        segment: await segmentOf(env, r.email), lastSeen: p?.lastAt && (!r.lastSeen || p.lastAt > r.lastSeen) ? p.lastAt : r.lastSeen,
        online: !!p && Date.now() - Date.parse(p.lastAt) < ONLINE_MS, onlinePath: p?.path ?? '', onlineApp: p?.app ?? '',
        projects: r.projects, mailboxes: r.mailboxes, access: grants.get(r.email) ?? null, optedOut: optouts.has(r.email),
      });
    }
    const calendar = !!(await callCalendar(env));
    return json({ success: true, customers: out, calendar, supportReady: !!(await supportAccount(env)) });
  }

  if (act === 'pulse') {
    const since = s(d.since, 40) || new Date(Date.now() - 60_000).toISOString();
    let alerts: unknown[] = []; let online = 0;
    try {
      alerts = (await env.DB.prepare('SELECT id, kind, email, summary, route, created_at AS createdAt FROM crm_owner_alerts WHERE created_at > ? ORDER BY created_at ASC LIMIT 20')
        .bind(since).all()).results ?? [];
      online = Number((await env.DB.prepare('SELECT count(*) AS n FROM crm_user_presence WHERE last_at > ?')
        .bind(new Date(Date.now() - ONLINE_MS).toISOString()).first<{ n: number }>())?.n ?? 0);
    } catch { /* before 0107 */ }
    return json({ success: true, alerts, online, cursor: nowIso() });
  }

  /* ── Emails to customers, by plan ── */
  const draft = () => {
    const kind = s(d.kind, 20) === 'marketing' ? 'marketing' : 'update';
    const subject = s(d.subject, 200);
    const text = s(d.body, 8000);
    const rawLink = s(d.link, 500);
    const link = safeLink(rawLink);
    return { kind, subject, body: text, rawLink, link, linkLabel: link ? (s(d.linkLabel, 60) || 'Open') : '' };
  };
  const checkDraft = (b: ReturnType<typeof draft>) => {
    if (!b.subject) return fail('Give the email a subject.', 200, { field: 'bc.subject' });
    if (!b.body) return fail('Write the message.', 200, { field: 'bc.body' });
    if (b.rawLink && !b.link) return fail('The button link must start with https://', 200, { field: 'bc.link' });
    return null;
  };

  if (act === 'broadcast_count') {
    const segs = audienceOf(d.audience);
    const members = await audienceMembers(env, segs);
    let optedOut = 0;
    if (s(d.kind, 20) === 'marketing' && members.length) {
      const set = new Set(((await env.DB.prepare('SELECT email FROM crm_customer_optouts').all<{ email: string }>().catch(() => ({ results: [] }))).results ?? []).map(r => r.email));
      optedOut = members.filter(m => set.has(m.email)).length;
    }
    return json({ success: true, count: members.length, optedOut });
  }

  if (act === 'broadcast_test') {
    const b = draft(); const bad = checkDraft(b); if (bad) return bad;
    const { html, unsubscribeUrl } = await broadcastHtml(env, b, { email: user.email, name: user.name });
    const r = await installSend(env, user.email, `[Test] ${b.subject}`, html, unsubscribeUrl);
    return r.ok ? json({ success: true, to: user.email }) : fail(r.error, 200, { code: 'send' });
  }

  if (act === 'broadcast_send') {
    const b = draft(); const bad = checkDraft(b); if (bad) return bad;
    const segs = audienceOf(d.audience);
    if (!segs.length) return fail('Choose who it goes to.', 200, { field: 'bc.audience' });
    const members = await audienceMembers(env, segs);
    if (!members.length) return fail('Nobody is in those groups yet.', 200, { field: 'bc.audience' });
    const id = crypto.randomUUID(); const now = nowIso();
    await env.DB.prepare(
      `INSERT INTO crm_support_broadcasts (id, kind, subject, body, link, link_label, audience, in_app, status, total, created_by, created_at)
       VALUES (?,?,?,?,?,?,?,?, 'queued', ?, ?, ?)`,
    ).bind(id, b.kind, b.subject, b.body, b.link, b.linkLabel, JSON.stringify(segs), d.inApp ? 1 : 0, members.length, user.email, now).run();
    const stmts = members.map(m => env.DB.prepare('INSERT OR IGNORE INTO crm_support_broadcast_recipients (broadcast_id, email, name) VALUES (?,?,?)').bind(id, m.email, m.name));
    for (let i = 0; i < stmts.length; i += 50) await env.DB.batch(stmts.slice(i, i + 50));
    /* The in-app copy goes now; the emails go in batches on the cron, so a
       thousand customers never wait on one request. */
    if (d.inApp) {
      const ins = members.map(m => env.DB.prepare('INSERT INTO crm_notices (id, to_email, title, body, link, link_label, emailed, created_at) VALUES (?,?,?,?,?,?,?,?)')
        .bind(crypto.randomUUID(), m.email, b.subject, b.body.replace(/\{name\}/g, (m.name || '').split(/\s+/)[0] || 'there').slice(0, 2000), b.link, b.linkLabel, 'skipped', now));
      for (let i = 0; i < ins.length; i += 50) await env.DB.batch(ins.slice(i, i + 50));
    }
    return json({ success: true, id, total: members.length });
  }

  if (act === 'broadcasts') {
    const r = await env.DB.prepare(
      `SELECT b.id, b.kind, b.subject, b.audience, b.in_app AS inApp, b.status, b.total, b.created_at AS createdAt, b.finished_at AS finishedAt,
              (SELECT count(*) FROM crm_support_broadcast_recipients r WHERE r.broadcast_id = b.id AND r.status = 'sent') AS sent,
              (SELECT count(*) FROM crm_support_broadcast_recipients r WHERE r.broadcast_id = b.id AND r.status = 'failed') AS failed,
              (SELECT count(*) FROM crm_support_broadcast_recipients r WHERE r.broadcast_id = b.id AND r.status = 'skipped') AS skipped,
              (SELECT count(*) FROM crm_support_broadcast_recipients r WHERE r.broadcast_id = b.id AND r.status = 'queued') AS queued
       FROM crm_support_broadcasts b ORDER BY b.created_at DESC LIMIT 20`,
    ).all().catch(() => ({ results: [] }));
    return json({ success: true, broadcasts: r.results ?? [] });
  }

  if (act === 'broadcast_cancel') {
    await env.DB.prepare("UPDATE crm_support_broadcasts SET status = 'cancelled', finished_at = ? WHERE id = ? AND status IN ('queued','sending')")
      .bind(nowIso(), s(d.id, 80)).run();
    await env.DB.prepare("UPDATE crm_support_broadcast_recipients SET status = 'skipped', error = 'cancelled' WHERE broadcast_id = ? AND status = 'queued'")
      .bind(s(d.id, 80)).run();
    return json({ success: true });
  }

  /* ── One customer ── */
  const target = async () => {
    const email = s(d.email, 190).toLowerCase();
    return email ? isCustomer(env, email) : null;
  };

  if (act === 'direct') {
    const c = await target(); if (!c) return fail('That address is not one of your customers.', 404);
    const text = s(d.message, 4000);
    if (!text) return fail('Write the message.', 200, { field: 'dm.message' });
    const r = await postDirect(env, { customer: c, author: user.email, text, kind: 'direct', title: `A message from ${user.name || 'support'}` });
    if (!r.ok) return fail(r.error ?? 'Could not send that.', 200);
    let emailed = '';
    if (d.emailToo) {
      const m = await installSend(env, c.email, `${user.name || 'Protected Central support'} sent you a message`, mailHtml({
        heading: `A message from ${user.name || 'Protected Central support'}`,
        paragraphs: [text.length > 600 ? `${text.slice(0, 600)}…` : text, 'Reply inside the app — the message is waiting in the corner of your screen.'],
        button: { href: `${origin(env, reqOrigin)}/`, label: 'Open Protected Central' },
      }));
      emailed = m.ok ? 'sent' : m.error;
    }
    return json({ success: true, conversationId: r.conversationId, emailed });
  }

  if (act === 'offer_call') {
    const c = await target(); if (!c) return fail('That address is not one of your customers.', 404);
    const cal = await callCalendar(env);
    if (!cal) return fail('Connect your Google Calendar under Customer Support → Meetings first — the call is a Google Meet made for it.', 200, { code: 'no-calendar' });
    const iso = (ms: number) => new Date(ms).toISOString().slice(0, 19);
    const start = Date.now();
    const ev = await createEvent(env, cal.accountId, {
      ownerEmail: cal.ownerEmail, summary: `Setup help — ${c.name || c.email}`,
      description: 'A live call to help set up your business in Protected Central.',
      startIso: iso(start), endIso: iso(start + 45 * 60_000), timezone: 'UTC', guestEmail: c.email, guestName: c.name || undefined,
    });
    if (!ev.ok || !ev.data?.meetingUrl) return fail(ev.error || 'Google made the event but gave it no Meet link.', 200, { code: 'meeting' });
    const text = s(d.message, 1000) || `Hi ${(c.name || '').split(/\s+/)[0] || 'there'} — I can see you are setting things up. Would a quick video or voice call help? I can walk you through it on your screen right now.`;
    const r = await postDirect(env, { customer: c, author: user.email, text, kind: 'call', link: ev.data.meetingUrl, linkLabel: 'Join the call', title: `${user.name || 'Support'} is offering a live call` });
    if (!r.ok) return fail(r.error ?? 'Could not send that.', 200);
    let emailed = '';
    if (d.emailToo) {
      const m = await installSend(env, c.email, `${user.name || 'Protected Central support'} is offering you a live call`, mailHtml({
        heading: 'A live call to help you set up',
        paragraphs: [text, 'It is a Google Meet — video or just voice, whichever you like.'],
        button: { href: ev.data.meetingUrl, label: 'Join the call' },
      }));
      emailed = m.ok ? 'sent' : m.error;
    }
    return json({ success: true, meetUrl: ev.data.meetingUrl, emailed });
  }

  /* ── Access to their account, with their permission ── */
  if (act === 'access_request') {
    const c = await target(); if (!c) return fail('That address is not one of your customers.', 404);
    const hours = Number(d.hours);
    if (!ACCESS_HOURS.includes(hours)) return fail('Choose how long: 1, 2, 4 or 8 hours.', 200, { field: 'ac.hours' });
    const reason = s(d.reason, 500);
    if (!reason) return fail('Say what you need the access for — the customer reads this before deciding.', 200, { field: 'ac.reason' });
    const open = (await accessList(env, "customer_email = ? AND mode = 'assist' AND (status = 'pending' OR (status = 'active' AND expires_at > ?))", [c.email, nowIso()], 1))[0];
    if (open) return fail(open.status === 'active' ? `You already have access until ${when(open.expiresAt ?? '')}.` : 'A request is already waiting for their answer.', 409);
    const id = crypto.randomUUID();
    const tokenBytes = crypto.getRandomValues(new Uint8Array(32));
    const token = [...tokenBytes].map(b => b.toString(16).padStart(2, '0')).join('');
    const now = nowIso();
    await env.DB.prepare(
      `INSERT INTO crm_support_access (id, customer_email, account_id, mode, hours, reason, status, requested_by, token_hash, requested_at)
       VALUES (?,?,?, 'assist', ?, ?, 'pending', ?, ?, ?)`,
    ).bind(id, c.email, c.accountId, hours, reason, user.email, await sha256(token), now).run();
    await env.DB.prepare(
      `INSERT INTO crm_notices (id, to_email, title, body, link, link_label, emailed, created_at, kind, ref)
       VALUES (?,?,?,?, '', '', 'skipped', ?, 'access', ?)`,
    ).bind(crypto.randomUUID(), c.email, `Support is asking to open your account for ${hours} hour${hours === 1 ? '' : 's'}`, reason, now, id).run();
    const base = `${origin(env, reqOrigin)}/api/support-consent.php?t=${token}`;
    const m = await installSend(env, c.email, 'Protected Central support is asking for access to your account', mailHtml({
      heading: 'May we open your account to help?',
      paragraphs: [
        `${user.name || 'Protected Central support'} would like to open your Protected Central account for ${hours} hour${hours === 1 ? '' : 's'} to help set things up.`,
        `What for: ${reason}`,
        'Nothing changes unless you approve. If you do, access ends by itself after that time and we email you when it has; you can end it sooner whenever you like.',
      ],
      button: { href: `${base}&a=approve`, label: `Approve for ${hours} hour${hours === 1 ? '' : 's'}` },
      second: { href: `${base}&a=decline`, label: 'Decline' },
      footer: 'The buttons open a page where you confirm — opening this email does nothing by itself.',
    }));
    return json({ success: true, id, emailed: m.ok ? 'sent' : m.error });
  }

  if (act === 'access_list') {
    return json({ success: true, access: await accessList(env, '1=1', [], 80) });
  }

  if (act === 'access_end') {
    const ok = await endAccess(env, s(d.id, 80), 'ended');
    return ok ? json({ success: true }) : fail('That permission has already ended.', 409);
  }

  /* The workspaces the owner may open now, to switch into. Checked against
     the clock, the same rule the gate uses. */
  if (act === 'access_open') {
    const row = await accessById(env, s(d.id, 80));
    if (!row || row.mode !== 'assist' || row.status !== 'active' || !row.expiresAt || row.expiresAt <= nowIso()) {
      return fail('That permission is not active.', 409);
    }
    const ws = (await env.DB.prepare('SELECT account_id AS id FROM crm_workspaces WHERE owner_email = ? ORDER BY created_at')
      .bind(row.customerEmail).all<{ id: string }>()).results ?? [];
    const who = await isCustomer(env, row.customerEmail);
    return json({ success: true, expiresAt: row.expiresAt, customerEmail: row.customerEmail, customerName: who?.name ?? '', mainAccountId: who?.accountId ?? '', workspaces: ws.map(w => w.id) });
  }

  /* Read-only, logged with why. */
  if (act === 'review') {
    const c = await target(); if (!c) return fail('That address is not one of your customers.', 404);
    const reason = s(d.reason, 500);
    if (!reason) return fail('Say why you are looking — every review is recorded with its reason.', 200, { field: 'rv.reason' });
    const now = nowIso();
    await env.DB.prepare(
      `INSERT INTO crm_support_access (id, customer_email, account_id, mode, hours, reason, status, requested_by, requested_at, decided_at, ended_at)
       VALUES (?,?,?, 'review', 0, ?, 'ended', ?, ?, ?, ?)`,
    ).bind(crypto.randomUUID(), c.email, c.accountId, reason, user.email, now, now, now).run();
    return json({ success: true, snapshot: await reviewSnapshot(env, c.email) });
  }

  return fail(`"${act}" is not something this endpoint does.`);
}

/** The owner's connected Google Calendar, on any of their workspaces. */
async function callCalendar(env: Env): Promise<{ accountId: string; ownerEmail: string } | null> {
  const owner = await installOwnerEmail(env);
  if (!owner) return null;
  const support = await supportAccount(env);
  return env.DB.prepare(
    `SELECT account_id AS accountId, owner_email AS ownerEmail FROM crm_calendar_connections
     WHERE status = 'connected' AND account_id IN (SELECT account_id FROM crm_workspaces WHERE owner_email = ?)
     ORDER BY CASE WHEN account_id = ? THEN 0 ELSE 1 END LIMIT 1`,
  ).bind(owner, support).first<{ accountId: string; ownerEmail: string }>().catch(() => null);
}

/* ══ Public: the links in the emails ═════════════════════════════════════
 * GET shows a page with a button; only the button's POST acts. Mail scanners
 * follow links, and a scanner approving access to somebody's account would be
 * the worst possible way to get this wrong.
 */
function page(title: string, msg: string, form = ''): Response {
  return new Response(`<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>${title}</title></head>
<body style="font-family:system-ui,-apple-system,Segoe UI,sans-serif;background:#f4f5f7;margin:0;padding:48px 16px;color:#17191c">
<div style="max-width:460px;margin:0 auto;background:#fff;border-radius:16px;padding:28px">
<h1 style="font-size:20px;margin:0 0 12px">${title}</h1>
<div style="font-size:15px;line-height:1.6">${msg}</div>${form}
</div></body></html>`, { status: 200, headers: { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store', 'X-Robots-Tag': 'noindex' } });
}
const button = (label: string, name: string, value: string, dark = true) =>
  `<button name="${name}" value="${value}" style="background:${dark ? '#17191c' : '#fff'};color:${dark ? '#c8f24d' : '#17191c'};border:1px solid #17191c;border-radius:999px;padding:12px 22px;font-weight:700;font-size:15px;cursor:pointer;margin:0 8px 8px 0">${label}</button>`;
const escH = (v: string) => v.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

export async function handleSupportConsent(req: Request, env: Env): Promise<Response> {
  const url = new URL(req.url);
  const form = req.method === 'POST' ? await req.formData().catch(() => null) : null;

  /* "End access now" from the approval email: by id, ended by the customer.
     Ending is the safe direction — it can only take access away — so the id
     alone is enough, still behind a button. */
  const endId = url.searchParams.get('id') ?? '';
  if (url.searchParams.get('end') === '1' && endId) {
    const row = await accessById(env, endId);
    if (!row || row.mode !== 'assist') return page('Not found', 'That link is not valid.');
    if (row.status !== 'active' || !row.expiresAt || row.expiresAt <= nowIso()) return page('Access has already ended', 'Support does not have access to your account now.');
    if (req.method !== 'POST') return page('End support access?', `Support can open your account until ${escH(when(row.expiresAt))}. End it now?`, `<form method="post" style="margin-top:18px">${button('End access now', 'go', '1')}</form>`);
    await endAccess(env, row.id, 'revoked');
    return page('Access ended', 'Done — nobody from Protected Central can open your account now. We have emailed you to confirm.');
  }

  const token = url.searchParams.get('t') ?? '';
  const { accessByToken } = await import('../lib/supportDesk');
  const row = await accessByToken(env, token);
  if (!row) return page('Not found', 'That link is not valid.');
  if (row.status !== 'pending') {
    const said = { active: 'You approved it.', declined: 'You declined it.', expired: 'It was approved and has since ended.', ended: 'It has ended.', revoked: 'You ended it.', lapsed: 'It was not answered in time and has lapsed.' }[row.status] ?? '';
    return page('Already answered', `This request has already been answered. ${said}`);
  }
  if (req.method !== 'POST') {
    const pick = url.searchParams.get('a');
    return page('May support open your account?',
      `<p>Protected Central support is asking to open your account for <b>${row.hours} hour${row.hours === 1 ? '' : 's'}</b>.</p><p><b>What for:</b> ${escH(row.reason)}</p><p>If you approve, access ends by itself after that time and we email you when it has. You can end it sooner from that email.</p>`,
      `<form method="post" style="margin-top:18px">${pick === 'decline' ? button('Decline', 'go', 'decline') + button('Approve', 'go', 'approve', false) : button(`Approve for ${row.hours} hour${row.hours === 1 ? '' : 's'}`, 'go', 'approve') + button('Decline', 'go', 'decline', false)}</form>`);
  }
  const go = String(form?.get('go') ?? '');
  if (go !== 'approve' && go !== 'decline') return page('Nothing changed', 'Choose Approve or Decline.');
  const r = await decideAccess(env, row, go === 'approve', url.origin);
  if (!r.ok) return page('Already answered', 'This request has already been answered.');
  return go === 'approve'
    ? page('Access approved', `Thank you. Support can open your account until ${escH(when(r.expiresAt ?? ''))}. We have emailed you a link to end it sooner.`)
    : page('Declined', 'Done — support will not open your account. Nothing has changed.');
}

export async function handleSupportUnsub(req: Request, env: Env): Promise<Response> {
  const url = new URL(req.url);
  const email = (url.searchParams.get('e') ?? '').trim().toLowerCase();
  const sig = url.searchParams.get('s') ?? '';
  const { unsubValid } = await import('../lib/supportDesk');
  if (!(await unsubValid(env, email, sig))) return page('Email preferences', 'That link is not valid. Reply to any of our emails and we will take you off the list.');
  /* RFC 8058 one-click: the mail client POSTs without a page in between. */
  if (req.method !== 'POST') {
    return page('Email preferences', `Stop Protected Central's news and offers to <b>${escH(email)}</b>? Account and support emails still reach you.`, `<form method="post" style="margin-top:18px">${button('Stop these emails', 'go', '1')}</form>`);
  }
  await env.DB.prepare('INSERT OR IGNORE INTO crm_customer_optouts (email, at) VALUES (?, ?)').bind(email, nowIso()).run();
  return page('Done', 'You will not get our news and offers any more. Account and support emails still reach you.');
}
