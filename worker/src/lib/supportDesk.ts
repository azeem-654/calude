/**
 * The install owner's support desk: what the owner can do *for* and *to*
 * their own customers, and the timed passes behind it.
 *
 * ── What is here ──
 *
 *  segments   which customers are on trial, trial ended, paid, AppSumo
 *  alerts     things the owner should hear about at their desk and on their
 *             phone (crm_owner_alerts + a push to the owner's support workspace)
 *  threads    a direct message is a conversation in the owner's own support
 *             inbox (channel 'direct'), so the owner answers it where every
 *             other chat is answered, and the customer sees it in the app's
 *             corner card (crm_notices kind 'direct')
 *  access     permission to open a customer's workspaces: asked by email,
 *             approved by the customer, timed, ended by email. The gate itself
 *             is `supportGrantActive` in lib/db.ts — the one place every route
 *             asks "may this person touch that workspace".
 *  passes     on the cron: broadcasts in batches, permissions that ran out
 *
 * Every email here goes through the install's own mailbox (`installMailbox`,
 * routes/auth.ts) and `deliver` — never a customer's.
 */
import { installSecret, nowIso, type Env } from './db';
import { deliver, fromAddressOf } from './deliver';
import { timingSafeEqual } from './crypto';
import { trialFor } from './trial';
import { pushToWorkspace, type PushMessage } from './push';
import { recordEvent, rid, upsertPerson } from './engagement';
import { installMailbox } from '../routes/auth';
import { houseWidgetAccount } from '../routes/engage';
import { esc, safeLink } from '../routes/customers';

export const origin = (env: Env, fallback = '') => (env.APP_ORIGIN || fallback || '').replace(/\/$/, '');

/** The single install owner (CLAUDE.md: exactly one). */
export async function installOwnerEmail(env: Env): Promise<string> {
  const r = await env.DB.prepare("SELECT email FROM crm_users WHERE role = 'agency' AND account_id IS NULL ORDER BY created_at LIMIT 1")
    .first<{ email: string }>().catch(() => null);
  return r?.email ?? '';
}

/**
 * The owner's support workspace: the one holding the in-app help button, or
 * failing that the owner's oldest workspace. Direct messages live there and
 * alerts are pushed to the phones registered there.
 */
export async function supportAccount(env: Env): Promise<string> {
  const house = await houseWidgetAccount(env);
  if (house) return house;
  const owner = await installOwnerEmail(env);
  if (!owner) return '';
  const r = await env.DB.prepare('SELECT account_id AS id FROM crm_workspaces WHERE owner_email = ? ORDER BY created_at LIMIT 1')
    .bind(owner).first<{ id: string }>().catch(() => null);
  return r?.id ?? '';
}

/* ── Segments ─────────────────────────────────────────────────────────────── */

export type Segment = 'trial' | 'ended' | 'paid' | 'appsumo' | 'other';
export const SEGMENTS: Segment[] = ['trial', 'ended', 'paid', 'appsumo', 'other'];

/**
 * One customer's segment. AppSumo first: a redeemed code is a plan with
 * source 'appsumo', which `hasPaid` (and so the trial) also reads as paid —
 * but to the owner an AppSumo buyer and a monthly subscriber are different
 * people to write to.
 */
export async function segmentOf(env: Env, email: string): Promise<Segment> {
  const plan = await env.DB.prepare('SELECT source FROM crm_plans WHERE owner_email = ?')
    .bind(email).first<{ source: string }>().catch(() => null);
  if (plan?.source === 'appsumo') return 'appsumo';
  const t = await trialFor(env, email);
  if (t.kind === 'paid') return 'paid';
  if (t.kind === 'trial') return 'trial';
  if (t.kind === 'ended') return 'ended';
  return 'other';
}

/** Every customer: an agency with a workspace of its own (the same test as Sign-ups). */
export async function customerRows(env: Env, limit = 2000): Promise<{ email: string; name: string; accountId: string; createdAt: string }[]> {
  const r = await env.DB.prepare(
    `SELECT email, name, account_id AS accountId, created_at AS createdAt FROM crm_users
     WHERE role = 'agency' AND account_id IS NOT NULL ORDER BY created_at DESC LIMIT ?`,
  ).bind(limit).all<{ email: string; name: string; accountId: string; createdAt: string }>();
  return r.results ?? [];
}

export async function isCustomer(env: Env, email: string): Promise<{ email: string; name: string; accountId: string } | null> {
  return env.DB.prepare("SELECT email, name, account_id AS accountId FROM crm_users WHERE email = ? AND role = 'agency' AND account_id IS NOT NULL")
    .bind(email.trim().toLowerCase()).first<{ email: string; name: string; accountId: string }>().catch(() => null);
}

/* ── Alerts for the owner ─────────────────────────────────────────────────── */

/**
 * Something the owner should hear about. Written for the open app (desktop
 * notification, `pulse`) and pushed to the phones registered on the support
 * workspace. Never throws: a customer's request is waiting on the caller.
 */
export async function ownerAlert(env: Env, a: { kind: string; email: string; summary: string; route: string; push?: PushMessage['kind'] | false }): Promise<void> {
  try {
    await env.DB.prepare('INSERT INTO crm_owner_alerts (id, kind, email, summary, route, created_at) VALUES (?,?,?,?,?,?)')
      .bind(rid('oa'), a.kind, a.email, a.summary.slice(0, 300), a.route, nowIso()).run();
  } catch { /* before 0107 */ }
  if (a.push === false) return;
  const acct = await supportAccount(env).catch(() => '');
  if (!acct) return;
  const title = {
    'customer.online': 'A customer is online',
    'customer.reply': 'A customer replied',
    'call.accepted': 'A customer is joining your call',
    'access.approved': 'Access approved',
  }[a.kind] ?? 'Support';
  await Promise.race([
    pushToWorkspace(env, acct, { kind: a.push ?? 'message', title, body: a.summary.slice(0, 160), route: a.route, tag: `${a.kind}:${a.email}` }).catch(() => null),
    new Promise(r => setTimeout(r, 4000)),
  ]);
}

/* ── Mail ─────────────────────────────────────────────────────────────────── */

export function mailHtml(o: { heading: string; paragraphs: string[]; button?: { href: string; label: string }; second?: { href: string; label: string }; footer?: string }): string {
  const btn = (b: { href: string; label: string }, dark = true) =>
    `<a href="${esc(b.href)}" style="display:inline-block;background:${dark ? '#17191c' : '#ffffff'};color:${dark ? '#c8f24d' : '#17191c'};border:1px solid #17191c;font-weight:700;text-decoration:none;padding:12px 22px;border-radius:999px;margin:0 8px 8px 0">${esc(b.label)}</a>`;
  return `
  <div style="font-family:system-ui,-apple-system,Segoe UI,sans-serif;max-width:540px;margin:0 auto;color:#17191c">
    <h2 style="font-size:20px;margin:0 0 12px">${esc(o.heading)}</h2>
    ${o.paragraphs.filter(Boolean).map(p => `<p style="font-size:15px;line-height:1.6;margin:0 0 12px">${esc(p).replace(/\n/g, '<br>')}</p>`).join('')}
    ${o.button || o.second ? `<p style="margin:18px 0 0">${o.button ? btn(o.button) : ''}${o.second ? btn(o.second, false) : ''}</p>` : ''}
    ${o.footer ? `<p style="font-size:12px;line-height:1.5;color:#8a8f98;margin:24px 0 0">${o.footer}</p>` : ''}
  </div>`;
}

/** Send from the install mailbox. `ok:false` with a reason when there is none. */
export async function installSend(env: Env, to: string, subject: string, html: string, unsubscribeUrl?: string): Promise<{ ok: boolean; error: string }> {
  const mb = await installMailbox(env);
  if (!mb) return { ok: false, error: 'No mailbox in your own workspace can send yet — connect and validate one in Settings → Email & SMS.' };
  const r = await deliver(mb, { fromName: mb.from.name || 'Protected Central', fromEmail: fromAddressOf(mb), to, subject, html, unsubscribeUrl });
  return { ok: r.ok, error: r.ok ? '' : r.error };
}

/* ── Marketing opt-out ────────────────────────────────────────────────────── */

async function hmac(env: Env, purpose: string, text: string): Promise<string> {
  const k = await crypto.subtle.importKey('raw', new TextEncoder().encode(await installSecret(env.DB, purpose)),
    { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const mac = await crypto.subtle.sign('HMAC', k, new TextEncoder().encode(text));
  return [...new Uint8Array(mac)].slice(0, 16).map(b => b.toString(16).padStart(2, '0')).join('');
}

export async function unsubUrl(env: Env, email: string): Promise<string> {
  return `${origin(env)}/api/support-unsub.php?${new URLSearchParams({ e: email, s: await hmac(env, 'support_optout', `optout\n${email}`) })}`;
}

export async function unsubValid(env: Env, email: string, sig: string): Promise<boolean> {
  return !!email && !!sig && timingSafeEqual(sig, await hmac(env, 'support_optout', `optout\n${email}`));
}

/* ── Direct threads ───────────────────────────────────────────────────────── */

/**
 * The conversation in the owner's support inbox that holds direct messages
 * with this customer — found, or opened. One per customer while it is open.
 */
export async function directThread(env: Env, customer: { email: string; name: string }): Promise<{ accountId: string; conversationId: string; personId: string } | null> {
  const acct = await supportAccount(env);
  if (!acct) return null;
  const person = await upsertPerson(env, acct, { email: customer.email, name: customer.name, source: 'direct' });
  const open = await env.DB.prepare(
    "SELECT id FROM crm_conversations WHERE account_id = ? AND person_id = ? AND channel = 'direct' AND status != 'closed' ORDER BY updated_at DESC LIMIT 1",
  ).bind(acct, person.id).first<{ id: string }>();
  if (open) return { accountId: acct, conversationId: open.id, personId: person.id };
  const id = rid('conv'); const now = nowIso();
  await env.DB.prepare(
    `INSERT INTO crm_conversations (id, account_id, person_id, channel, status, handled_by, subject, last_at, created_at, updated_at)
     VALUES (?,?,?, 'direct', 'open', 'human', ?, ?, ?, ?)`,
  ).bind(id, acct, person.id, `Direct — ${customer.name || customer.email}`.slice(0, 200), now, now, now).run();
  return { accountId: acct, conversationId: id, personId: person.id };
}

/** A message from support into a direct thread, and the corner card that shows it. */
export async function postDirect(env: Env, o: {
  customer: { email: string; name: string }; author: string; text: string;
  kind: 'direct' | 'call'; link?: string; linkLabel?: string; title?: string;
}): Promise<{ ok: boolean; error?: string; conversationId?: string; noticeId?: string }> {
  const t = await directThread(env, o.customer);
  if (!t) return { ok: false, error: 'Your support workspace is not set up yet — make a help widget in Customer Support → Widgets first.' };
  const now = nowIso();
  await env.DB.prepare(
    `INSERT INTO crm_conversation_messages (id, conversation_id, account_id, role, author, body, internal, created_at)
     VALUES (?,?,?, 'agent', ?, ?, 0, ?)`,
  ).bind(rid('msg'), t.conversationId, t.accountId, o.author, o.text, now).run();
  await env.DB.prepare(
    "UPDATE crm_conversations SET last_at = ?, updated_at = ?, agent_seen_at = ?, needs_human_since = '', handled_by = 'human' WHERE id = ?",
  ).bind(now, now, now, t.conversationId).run();
  const noticeId = crypto.randomUUID();
  await env.DB.prepare(
    `INSERT INTO crm_notices (id, to_email, title, body, link, link_label, emailed, created_at, kind, conversation_id)
     VALUES (?,?,?,?,?,?, 'skipped', ?, ?, ?)`,
  ).bind(noticeId, o.customer.email, (o.title || 'A message from support').slice(0, 200), o.text.slice(0, 2000),
    o.link ? safeLink(o.link) : '', o.linkLabel ?? '', now, o.kind, t.conversationId).run();
  return { ok: true, conversationId: t.conversationId, noticeId };
}

/** The customer's answer in a direct thread: back into the owner's inbox, waiting for a person. */
export async function customerReply(env: Env, conversationId: string, customer: { email: string; name: string }, text: string): Promise<boolean> {
  const acct = await supportAccount(env);
  const conv = await env.DB.prepare("SELECT id, account_id AS accountId FROM crm_conversations WHERE id = ? AND account_id = ? AND channel = 'direct'")
    .bind(conversationId, acct).first<{ id: string; accountId: string }>();
  if (!conv) return false;
  const now = nowIso();
  await env.DB.prepare(
    `INSERT INTO crm_conversation_messages (id, conversation_id, account_id, role, author, body, internal, created_at)
     VALUES (?,?,?, 'visitor', ?, ?, 0, ?)`,
  ).bind(rid('msg'), conv.id, conv.accountId, customer.email, text, now).run();
  await env.DB.prepare(
    `UPDATE crm_conversations SET status = 'open', last_at = ?, updated_at = ?, last_visitor_at = ?, visitor_seen_at = ?,
            needs_human_since = CASE WHEN needs_human_since = '' THEN ? ELSE needs_human_since END
     WHERE id = ?`,
  ).bind(now, now, now, now, now, conv.id).run();
  /* recordEvent pushes 'chat.message' to the owner's phone like any other chat. */
  await recordEvent(env, conv.accountId, { kind: 'chat.message', refId: conv.id, summary: `${customer.name || customer.email}: ${text.slice(0, 140)}` });
  await ownerAlert(env, { kind: 'customer.reply', email: customer.email, summary: `${customer.name || customer.email}: ${text.slice(0, 140)}`, route: `/engagement?tab=inbox&c=${encodeURIComponent(conv.id)}`, push: false });
  return true;
}

/* ── Access to a customer's workspaces ────────────────────────────────────── */

export const ACCESS_HOURS = [1, 2, 4, 8];

export async function sha256(text: string): Promise<string> {
  const h = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text));
  return [...new Uint8Array(h)].map(b => b.toString(16).padStart(2, '0')).join('');
}

export interface AccessRow {
  id: string; customerEmail: string; accountId: string; mode: string; hours: number; reason: string;
  status: string; requestedBy: string; requestedAt: string; decidedAt: string | null; expiresAt: string | null; endedAt: string | null;
}

const ACCESS_COLS = `id, customer_email AS customerEmail, account_id AS accountId, mode, hours, reason, status,
  requested_by AS requestedBy, requested_at AS requestedAt, decided_at AS decidedAt, expires_at AS expiresAt, ended_at AS endedAt`;

export async function accessById(env: Env, id: string): Promise<AccessRow | null> {
  return env.DB.prepare(`SELECT ${ACCESS_COLS} FROM crm_support_access WHERE id = ?`).bind(id).first<AccessRow>().catch(() => null);
}
export async function accessByToken(env: Env, token: string): Promise<AccessRow | null> {
  if (!/^[a-f0-9]{64}$/.test(token)) return null;
  return env.DB.prepare(`SELECT ${ACCESS_COLS} FROM crm_support_access WHERE token_hash = ? AND mode = 'assist'`)
    .bind(await sha256(token)).first<AccessRow>().catch(() => null);
}
export async function accessList(env: Env, where = '1=1', bind: unknown[] = [], limit = 60): Promise<AccessRow[]> {
  const r = await env.DB.prepare(`SELECT ${ACCESS_COLS} FROM crm_support_access WHERE ${where} ORDER BY requested_at DESC LIMIT ${limit}`)
    .bind(...bind).all<AccessRow>().catch(() => ({ results: [] as AccessRow[] }));
  return r.results ?? [];
}

/** "Tuesday 25 November, 3:40 pm UTC" — the customer's zone is not known to the server. */
export function when(iso: string): string {
  try {
    return `${new Date(iso).toLocaleString('en-GB', { timeZone: 'UTC', weekday: 'long', day: 'numeric', month: 'long', hour: 'numeric', minute: '2-digit', hour12: true })} UTC`;
  } catch { return iso; }
}

/**
 * Approve or decline. One rule for the email link and the in-app button: only
 * a pending request moves, so a link clicked twice — or after the customer
 * declined in the app — changes nothing.
 */
export async function decideAccess(env: Env, row: AccessRow, approve: boolean, reqOrigin = ''): Promise<{ ok: boolean; status: string; expiresAt?: string }> {
  if (row.status !== 'pending') return { ok: false, status: row.status };
  const now = nowIso();
  if (!approve) {
    await env.DB.prepare("UPDATE crm_support_access SET status = 'declined', decided_at = ? WHERE id = ? AND status = 'pending'").bind(now, row.id).run();
    await env.DB.prepare("UPDATE crm_notices SET read_at = ?, answer = 'declined', answered_at = ? WHERE kind = 'access' AND ref = ?").bind(now, now, row.id).run().catch(() => null);
    await ownerAlert(env, { kind: 'access.declined', email: row.customerEmail, summary: `${row.customerEmail} declined access to their account.`, route: '/engagement?tab=customers', push: false });
    return { ok: true, status: 'declined' };
  }
  const expiresAt = new Date(Date.now() + row.hours * 3_600_000).toISOString();
  const r = await env.DB.prepare("UPDATE crm_support_access SET status = 'active', decided_at = ?, expires_at = ? WHERE id = ? AND status = 'pending'")
    .bind(now, expiresAt, row.id).run();
  if (!r.meta?.changes) return { ok: false, status: 'pending' };
  await env.DB.prepare("UPDATE crm_notices SET read_at = ?, answer = 'approved', answered_at = ? WHERE kind = 'access' AND ref = ?").bind(now, now, row.id).run().catch(() => null);
  const endLink = `${origin(env, reqOrigin)}/api/support-consent.php?${new URLSearchParams({ id: row.id, end: '1' })}`;
  await installSend(env, row.customerEmail, 'Support now has access to your Protected Central account', mailHtml({
    heading: 'You gave support access to your account',
    paragraphs: [
      `Protected Central support can now open your account to help set things up, until ${when(expiresAt)} (${row.hours} hour${row.hours === 1 ? '' : 's'}).`,
      row.reason ? `What it is for: ${row.reason}` : '',
      'When the time is up access ends by itself and we will email you to say so. You can end it sooner at any time.',
    ],
    button: { href: `${origin(env, reqOrigin)}/`, label: 'Open my account' },
    second: { href: endLink, label: 'End access now' },
  })).catch(() => null);
  await ownerAlert(env, { kind: 'access.approved', email: row.customerEmail, summary: `${row.customerEmail} approved access for ${row.hours} h — until ${when(expiresAt)}.`, route: '/engagement?tab=customers' });
  return { ok: true, status: 'active', expiresAt };
}

/** Stop an active permission now — by the owner ('ended') or the customer ('revoked'). */
export async function endAccess(env: Env, id: string, by: 'ended' | 'revoked'): Promise<boolean> {
  const now = nowIso();
  const r = await env.DB.prepare(
    `UPDATE crm_support_access SET status = ?, ended_at = ? WHERE id = ? AND mode = 'assist' AND status IN ('active','pending')`,
  ).bind(by, now, id).run().catch(() => null);
  if (!r?.meta?.changes) return false;
  await mailEnded(env);
  if (by === 'revoked') {
    const row = await accessById(env, id);
    if (row) await ownerAlert(env, { kind: 'access.revoked', email: row.customerEmail, summary: `${row.customerEmail} ended your access to their account.`, route: '/engagement?tab=customers', push: false });
  }
  return true;
}

/**
 * The "access has ended" emails, once each. Only for permissions that were
 * actually given — a request withdrawn before anybody approved it ended
 * nothing the customer needs telling about.
 */
async function mailEnded(env: Env): Promise<number> {
  const due = await accessList(env, "mode = 'assist' AND status IN ('expired','ended','revoked') AND decided_at IS NOT NULL AND end_mailed = 0", [], 25);
  let sent = 0;
  for (const row of due) {
    /* Claimed first, so two passes cannot both send it. */
    const claim = await env.DB.prepare('UPDATE crm_support_access SET end_mailed = 1 WHERE id = ? AND end_mailed = 0').bind(row.id).run();
    if (!claim.meta?.changes) continue;
    const why = row.status === 'revoked' ? 'You ended it.' : row.status === 'ended' ? 'Support finished and closed it.' : 'The time you gave ran out.';
    const r = await installSend(env, row.customerEmail, 'Support no longer has access to your account', mailHtml({
      heading: 'Support access has ended',
      paragraphs: [
        `The permission you gave Protected Central support to open your account has ended. ${why}`,
        'Nobody from Protected Central can open your account now. If you need help again, ask from the help button in the app and we will ask your permission first.',
      ],
    }));
    if (r.ok) sent++;
  }
  return sent;
}

/** Cron: permissions whose time is up, the emails that say so, requests nobody answered. */
export async function runSupportAccess(env: Env): Promise<{ expired: number; mailed: number }> {
  try {
    const now = nowIso();
    const r = await env.DB.prepare("UPDATE crm_support_access SET status = 'expired', ended_at = expires_at WHERE mode = 'assist' AND status = 'active' AND expires_at <= ?")
      .bind(now).run();
    const stale = new Date(Date.now() - 48 * 3_600_000).toISOString();
    await env.DB.prepare("UPDATE crm_support_access SET status = 'lapsed', ended_at = ? WHERE mode = 'assist' AND status = 'pending' AND requested_at < ?")
      .bind(now, stale).run();
    return { expired: Number(r.meta?.changes ?? 0), mailed: await mailEnded(env) };
  } catch { return { expired: 0, mailed: 0 }; /* before 0107 */ }
}

/* ── Broadcasts ───────────────────────────────────────────────────────────── */

const BATCH = 40;

export async function broadcastHtml(env: Env, b: { kind: string; subject: string; body: string; link: string; linkLabel: string }, to: { email: string; name: string }): Promise<{ html: string; unsubscribeUrl?: string }> {
  const first = (to.name || '').trim().split(/\s+/)[0] || 'there';
  const text = b.body.replace(/\{name\}/g, first);
  const unsub = b.kind === 'marketing' ? await unsubUrl(env, to.email) : undefined;
  return {
    html: mailHtml({
      heading: b.subject,
      paragraphs: text.split(/\n{2,}/),
      button: b.link ? { href: b.link, label: b.linkLabel || 'Open' } : undefined,
      footer: unsub
        ? `You are getting this because you have a Protected Central account. <a href="${esc(unsub)}" style="color:#8a8f98">Stop these emails</a> — account and support emails still reach you.`
        : 'You are getting this because you have a Protected Central account. It is about your account, so it is sent to every customer it concerns.',
    }),
    unsubscribeUrl: unsub,
  };
}

/** Cron: the next batch of every queued broadcast, through the install mailbox. */
export async function runBroadcasts(env: Env): Promise<{ sent: number; failed: number; note: string }> {
  let rows: { broadcastId: string; email: string; name: string; tries: number }[];
  try {
    rows = (await env.DB.prepare(
      `SELECT r.broadcast_id AS broadcastId, r.email, r.name, r.tries FROM crm_support_broadcast_recipients r
       JOIN crm_support_broadcasts b ON b.id = r.broadcast_id
       WHERE r.status = 'queued' AND b.status IN ('queued','sending') ORDER BY b.created_at, r.email LIMIT ?`,
    ).bind(BATCH).all<{ broadcastId: string; email: string; name: string; tries: number }>()).results ?? [];
  } catch { return { sent: 0, failed: 0, note: '' }; }
  if (!rows.length) return { sent: 0, failed: 0, note: '' };
  const mb = await installMailbox(env);
  if (!mb) return { sent: 0, failed: 0, note: 'Customer emails are waiting: no mailbox in the owner workspace can send.' };
  const cache = new Map<string, { kind: string; subject: string; body: string; link: string; linkLabel: string }>();
  let sent = 0, failed = 0;
  for (const r of rows) {
    let b = cache.get(r.broadcastId);
    if (!b) {
      b = await env.DB.prepare('SELECT kind, subject, body, link, link_label AS linkLabel FROM crm_support_broadcasts WHERE id = ?')
        .bind(r.broadcastId).first<{ kind: string; subject: string; body: string; link: string; linkLabel: string }>() ?? undefined;
      if (!b) continue;
      cache.set(r.broadcastId, b);
      await env.DB.prepare("UPDATE crm_support_broadcasts SET status = 'sending' WHERE id = ? AND status = 'queued'").bind(r.broadcastId).run();
    }
    /* Asked again at send time: somebody can opt out while a broadcast is queued. */
    if (b.kind === 'marketing') {
      const out = await env.DB.prepare('SELECT 1 AS x FROM crm_customer_optouts WHERE email = ?').bind(r.email).first();
      if (out) {
        await env.DB.prepare("UPDATE crm_support_broadcast_recipients SET status = 'skipped', error = 'opted out', at = ? WHERE broadcast_id = ? AND email = ?")
          .bind(nowIso(), r.broadcastId, r.email).run();
        continue;
      }
    }
    const { html, unsubscribeUrl } = await broadcastHtml(env, b, r);
    const res = await deliver(mb, { fromName: mb.from.name || 'Protected Central', fromEmail: fromAddressOf(mb), to: r.email, subject: b.subject, html, unsubscribeUrl });
    /* Three tries, then failed with the server's reason — never silently dropped. */
    const status = res.ok ? 'sent' : r.tries + 1 >= 3 ? 'failed' : 'queued';
    await env.DB.prepare('UPDATE crm_support_broadcast_recipients SET status = ?, error = ?, tries = tries + 1, at = ? WHERE broadcast_id = ? AND email = ?')
      .bind(status, res.ok ? '' : res.error.slice(0, 300), nowIso(), r.broadcastId, r.email).run();
    if (res.ok) sent++; else failed++;
  }
  for (const id of cache.keys()) {
    const left = await env.DB.prepare("SELECT 1 AS x FROM crm_support_broadcast_recipients WHERE broadcast_id = ? AND status = 'queued' LIMIT 1").bind(id).first();
    if (!left) await env.DB.prepare("UPDATE crm_support_broadcasts SET status = 'done', finished_at = ? WHERE id = ? AND status = 'sending'").bind(nowIso(), id).run();
  }
  return { sent, failed, note: '' };
}

/* ── Read-only review ─────────────────────────────────────────────────────── */

/** Columns that can hold a secret are never part of a review, whatever the table. */
const SECRETISH = /pass|secret|token|key|hash|cred|cookie|auth|sig|otp|code_/i;

function safeRow(r: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(r)) {
    if (SECRETISH.test(k)) continue;
    out[k] = typeof v === 'string' ? v.slice(0, 300) : v;
  }
  return out;
}

const PICK = ['name', 'firstName', 'lastName', 'email', 'phone', 'company', 'title', 'subject', 'status', 'type', 'url', 'domain', 'createdAt', 'sentAt', 'tags'];

/**
 * What a customer's workspaces hold, for a read-only look. Reads only — there
 * is nothing here that writes, and it never goes through the workspace gate,
 * so a review cannot be turned into access. Each part is tried on its own so a
 * table this database does not have yet costs that part, not the review.
 */
export async function reviewSnapshot(env: Env, customerEmail: string): Promise<Record<string, unknown>> {
  const ws = (await env.DB.prepare('SELECT account_id AS id, created_at AS createdAt FROM crm_workspaces WHERE owner_email = ? ORDER BY created_at')
    .bind(customerEmail).all<{ id: string; createdAt: string }>()).results ?? [];
  const q = async (sql: string, ...b: unknown[]) => {
    try { return ((await env.DB.prepare(sql).bind(...b).all<Record<string, unknown>>()).results ?? []).map(safeRow); } catch { return []; }
  };
  const workspaces = [];
  for (const w of ws.slice(0, 10)) {
    const data: { key: string; count: number | null; bytes: number; sample: Record<string, unknown>[] }[] = [];
    const keys = await q('SELECT k, length(v) AS bytes FROM crm_data WHERE account_id = ? ORDER BY bytes DESC LIMIT 60', w.id);
    for (const k of keys) {
      const key = String(k.k ?? '');
      const bytes = Number(k.bytes ?? 0);
      let count: number | null = null; let sample: Record<string, unknown>[] = [];
      if (bytes < 3_000_000) {
        try {
          const raw = (await env.DB.prepare('SELECT v FROM crm_data WHERE account_id = ? AND k = ?').bind(w.id, key).first<{ v: string }>())?.v ?? '';
          const parsed: unknown = JSON.parse(raw);
          if (Array.isArray(parsed)) {
            count = parsed.length;
            sample = parsed.slice(0, 12).map(x => {
              if (!x || typeof x !== 'object') return { value: String(x).slice(0, 200) };
              const o: Record<string, unknown> = {};
              for (const f of PICK) if ((x as Record<string, unknown>)[f] !== undefined) o[f] = typeof (x as Record<string, unknown>)[f] === 'string' ? String((x as Record<string, unknown>)[f]).slice(0, 200) : (x as Record<string, unknown>)[f];
              return o;
            });
          }
        } catch { /* not JSON: listed by size only */ }
      }
      data.push({ key, count, bytes, sample });
    }
    workspaces.push({
      accountId: w.id, createdAt: w.createdAt, data,
      projects: await q('SELECT * FROM crm_projects WHERE account_id = ? ORDER BY created_at DESC LIMIT 30', w.id),
      mailboxes: await q('SELECT * FROM crm_mailbox_accounts WHERE account_id = ? LIMIT 20', w.id),
      sends7d: await q("SELECT channel, status, count(*) AS n FROM crm_delivery_log WHERE account_id = ? AND created_at > ? GROUP BY channel, status", w.id, new Date(Date.now() - 7 * 86_400_000).toISOString()),
      recentSends: await q('SELECT * FROM crm_delivery_log WHERE account_id = ? ORDER BY created_at DESC LIMIT 40', w.id),
      widgets: await q('SELECT * FROM crm_widgets WHERE account_id = ? LIMIT 20', w.id),
      conversations: await q("SELECT status, channel, count(*) AS n FROM crm_conversations WHERE account_id = ? GROUP BY status, channel", w.id),
      tickets: await q('SELECT status, count(*) AS n FROM crm_tickets WHERE account_id = ? GROUP BY status', w.id),
      domains: await q('SELECT * FROM crm_domains WHERE account_id = ? LIMIT 30', w.id),
      pages: await q('SELECT * FROM crm_pages WHERE account_id = ? ORDER BY updated_at DESC LIMIT 30', w.id),
    });
  }
  return { customerEmail, workspaces, readAt: nowIso() };
}
