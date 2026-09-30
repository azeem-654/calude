/**
 * The install owner and the people who signed up.
 *
 * ── Why this exists ──
 *
 * Sign-up is open and every account is on a 7-day trial. The owner's question
 * on any given morning is "who arrived, have they done anything, and who is
 * about to run out" — and until now the only way to answer it was to query D1
 * by hand. A trial customer who gets stuck on day two and hears nothing is a
 * customer lost on day seven; the whole point of this screen is that the owner
 * sees them in time to say something.
 *
 * ── Two audiences, one route ──
 *
 *  owner     `signups`, `message`, `settings_get`, `settings_save`
 *  anybody   `mine` (their trial and their unread messages), `read`
 *
 * Owner-only means the install owner, the single account with no workspace of
 * its own — the same test as routes/billing.ts. A sub-account running its own
 * clients is not the operator and must not see the operator's customer list.
 *
 * ── What the owner can send ──
 *
 * A message is a row in `crm_notices`, shown inside the app (the corner card,
 * NoticeCard.tsx) until the customer closes it, and optionally emailed through
 * the install's own mailbox — the same one sign-in codes use, never a
 * customer's (routes/auth.ts `installMailbox`). Its button is a link the owner
 * chose, most often their kickoff-call booking page. The link is checked to be
 * http(s) here, because it is rendered as a link inside somebody else's signed-in
 * session and a `javascript:` URL there would run as them.
 */
import { body, fail, json } from '../lib/http';
import { metaGet, metaPut, nowIso, userFromToken, type Env, type SessionUser } from '../lib/db';
import { deliver, fromAddressOf } from '../lib/deliver';
import { trialFor, type TrialState } from '../lib/trial';
import { installMailbox } from './auth';

interface Req {
  token?: string;
  action?: string;
  to?: string[];
  title?: string;
  body?: string;
  link?: string;
  linkLabel?: string;
  email?: boolean;
  id?: string;
  settings?: Partial<Settings>;
}

/** What the owner sets once: where kickoff calls are booked, and the welcome. */
export interface Settings {
  kickoffUrl: string;
  welcomeOn: boolean;
  welcomeTitle: string;
  welcomeBody: string;
}

const SETTINGS_KEY = 'customer_success';
const DEFAULTS: Settings = {
  kickoffUrl: '',
  welcomeOn: true,
  welcomeTitle: 'Welcome — your 7-day trial has started',
  welcomeBody: 'Book a free 20-minute kickoff call and we will set up your first project with you, on your screen. Or press the help button in the corner any time — chat, a call, or share your screen.',
};

const isOwner = (u: SessionUser) => u.role === 'agency' && !u.accountId;

/** http(s) or nothing. Anything else in an href in a customer's session runs as them. */
function safeLink(v: unknown): string {
  const s = String(v ?? '').trim().slice(0, 500);
  if (!s) return '';
  try {
    const u = new URL(s);
    return u.protocol === 'https:' || u.protocol === 'http:' ? u.toString() : '';
  } catch { return ''; }
}

function esc(v: string): string {
  return v.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

export async function loadSettings(env: Env): Promise<Settings> {
  try {
    const raw = await metaGet(env.DB, SETTINGS_KEY);
    return raw ? { ...DEFAULTS, ...(JSON.parse(raw) as Partial<Settings>) } : { ...DEFAULTS };
  } catch { return { ...DEFAULTS }; }
}

/**
 * The welcome a new account finds waiting inside the app.
 *
 * In-app only. Emailing it here would put the owner's mail server between a
 * person and their first screen — sign-in would wait on SMTP — and the owner
 * can email everybody who arrived today from the Sign-ups screen in one press.
 */
export async function welcomeNewAccount(env: Env, email: string): Promise<void> {
  try {
    const s = await loadSettings(env);
    if (!s.welcomeOn || !s.welcomeTitle.trim()) return;
    await env.DB.prepare(
      'INSERT INTO crm_notices (id, to_email, title, body, link, link_label, emailed, created_at) VALUES (?,?,?,?,?,?,?,?)',
    ).bind(
      crypto.randomUUID(), email, s.welcomeTitle.slice(0, 200), s.welcomeBody.slice(0, 2000),
      safeLink(s.kickoffUrl), s.kickoffUrl ? 'Book my kickoff call' : '', 'skipped', nowIso(),
    ).run();
  } catch { /* before 0052, or a transient failure: nobody is kept from signing in by a welcome */ }
}

interface SignupRow {
  email: string;
  name: string;
  createdAt: string;
  accountId: string;
  verifiedAt: string | null;
  hasPassword: number;
  lastSeen: string | null;
  sessions: number;
  projects: number;
  mailboxes: number;
  helpAsked: number;
  workspaces: number;
}

export async function handleCustomers(req: Request, env: Env): Promise<Response> {
  const d = await body<Req>(req);
  const user = await userFromToken(env.DB, d.token);
  if (!user) return fail('Sign in again — this needs a current session.', 401, { code: 'unauthorised' });
  const act = d.action ?? '';

  /* ── Anybody: their own trial and their own messages ── */
  if (act === 'mine') {
    const trial = await trialFor(env, user.email);
    let notices: unknown[] = [];
    try {
      const r = await env.DB.prepare(
        `SELECT id, title, body, link, link_label AS linkLabel, created_at AS createdAt
         FROM crm_notices WHERE to_email = ? AND read_at IS NULL ORDER BY created_at DESC LIMIT 5`,
      ).bind(user.email).all();
      notices = r.results ?? [];
    } catch { notices = []; }
    const s = await loadSettings(env);
    return json({ success: true, trial, notices, kickoffUrl: safeLink(s.kickoffUrl) });
  }

  if (act === 'read') {
    const id = String(d.id ?? '');
    /* Scoped to the reader: an id is not permission to close somebody else's. */
    await env.DB.prepare('UPDATE crm_notices SET read_at = ? WHERE id = ? AND to_email = ?')
      .bind(nowIso(), id, user.email).run();
    return json({ success: true });
  }

  /* ── The owner's alone from here ── */
  if (!isOwner(user)) return fail('Only the install owner can see who signed up.', 403);

  if (act === 'settings_get') return json({ success: true, settings: await loadSettings(env) });

  if (act === 'settings_save') {
    const cur = await loadSettings(env);
    const given = d.settings ?? {};
    const rawUrl = String(given.kickoffUrl ?? cur.kickoffUrl).trim();
    const url = safeLink(rawUrl);
    if (rawUrl && !url) return fail('The booking link must start with https://', 200, { field: 'kickoffUrl' });
    const next: Settings = {
      kickoffUrl: url,
      welcomeOn: given.welcomeOn ?? cur.welcomeOn,
      welcomeTitle: String(given.welcomeTitle ?? cur.welcomeTitle).slice(0, 200),
      welcomeBody: String(given.welcomeBody ?? cur.welcomeBody).slice(0, 2000),
    };
    await metaPut(env.DB, SETTINGS_KEY, JSON.stringify(next));
    return json({ success: true, settings: next });
  }

  if (act === 'signups') {
    /*
     * Every customer — agencies with a workspace of their own — newest first.
     * The counts are the signals that say whether somebody got going: a
     * project made, a mailbox connected, a request for help. None of them reads
     * inside anybody's workspace data; they are counts of rows the owner's
     * install already holds.
     */
    const r = await env.DB.prepare(
      `SELECT u.email, u.name, u.created_at AS createdAt, u.account_id AS accountId,
              u.email_verified_at AS verifiedAt, (u.hash != '') AS hasPassword,
              (SELECT MAX(s.last_seen_at) FROM crm_sessions s WHERE s.email = u.email) AS lastSeen,
              (SELECT COUNT(*) FROM crm_sessions s WHERE s.email = u.email) AS sessions,
              (SELECT COUNT(*) FROM crm_projects p WHERE p.account_id IN
                 (SELECT account_id FROM crm_workspaces WHERE owner_email = u.email)) AS projects,
              (SELECT COUNT(*) FROM crm_mailbox_accounts m WHERE m.account_id IN
                 (SELECT account_id FROM crm_workspaces WHERE owner_email = u.email)) AS mailboxes,
              (SELECT COUNT(*) FROM crm_live_sessions l WHERE l.verified_email = u.email) AS helpAsked,
              (SELECT COUNT(*) FROM crm_workspaces w WHERE w.owner_email = u.email) AS workspaces
       FROM crm_users u
       WHERE u.role = 'agency' AND u.account_id IS NOT NULL
       ORDER BY u.created_at DESC LIMIT 300`,
    ).all<SignupRow>();
    const rows = r.results ?? [];
    const out: (SignupRow & { trial: TrialState })[] = [];
    for (const row of rows) out.push({ ...row, trial: await trialFor(env, row.email) });
    const mailbox = !!(await installMailbox(env));
    return json({ success: true, signups: out, canEmail: mailbox, settings: await loadSettings(env) });
  }

  if (act === 'message') {
    const title = String(d.title ?? '').trim().slice(0, 200);
    const text = String(d.body ?? '').trim().slice(0, 4000);
    if (!title) return fail('Give the message a headline.', 200, { field: 'title' });
    const rawLink = String(d.link ?? '').trim();
    const link = safeLink(rawLink);
    if (rawLink && !link) return fail('The button link must start with https://', 200, { field: 'link' });
    const linkLabel = link ? (String(d.linkLabel ?? '').trim().slice(0, 60) || 'Open') : '';

    /* Only real customers. An address that is not one is dropped, not
       written — this is not a way to mail strangers from the install. */
    const wanted = [...new Set((d.to ?? []).map(e => String(e).trim().toLowerCase()).filter(Boolean))].slice(0, 300);
    if (!wanted.length) return fail('Choose who it is for.');
    const known: string[] = [];
    for (const e of wanted) {
      const hit = await env.DB.prepare("SELECT 1 AS n FROM crm_users WHERE email = ? AND role = 'agency' AND account_id IS NOT NULL")
        .bind(e).first();
      if (hit) known.push(e);
    }
    if (!known.length) return fail('None of those addresses belongs to a customer here.');

    const mb = d.email ? await installMailbox(env) : null;
    if (d.email && !mb) {
      return fail('Email is not available yet — connect and validate a mailbox in your own workspace (Settings → Email & SMS). The in-app message can still be sent.', 200, { code: 'no_mailbox' });
    }

    let emailed = 0; let failed = 0;
    for (const to of known) {
      let state: 'sent' | 'failed' | 'skipped' = 'skipped';
      if (mb) {
        const html = `
          <div style="font-family:system-ui,-apple-system,Segoe UI,sans-serif;max-width:520px;margin:0 auto;color:#17191c">
            <h2 style="font-size:20px;margin:0 0 12px">${esc(title)}</h2>
            ${text.split(/\n{2,}/).map(p => `<p style="font-size:15px;line-height:1.6;margin:0 0 12px">${esc(p).replace(/\n/g, '<br>')}</p>`).join('')}
            ${link ? `<p style="margin:18px 0 0"><a href="${esc(link)}" style="display:inline-block;background:#17191c;color:#c8f24d;font-weight:700;text-decoration:none;padding:12px 22px;border-radius:999px">${esc(linkLabel)}</a></p>` : ''}
          </div>`;
        const sent = await deliver(mb, { fromName: mb.from.name || 'Protected Central', fromEmail: fromAddressOf(mb), to, subject: title, html });
        state = sent.ok ? 'sent' : 'failed';
        if (sent.ok) emailed++; else failed++;
      }
      await env.DB.prepare(
        'INSERT INTO crm_notices (id, to_email, title, body, link, link_label, emailed, created_at) VALUES (?,?,?,?,?,?,?,?)',
      ).bind(crypto.randomUUID(), to, title, text, link, linkLabel, state, nowIso()).run();
    }
    /* Partial is said as partial. "Sent" over a batch where half the email
       failed is the kind of success that is found out later. */
    return json({
      success: true, delivered: known.length, dropped: wanted.length - known.length, emailed, emailFailed: failed,
    });
  }

  return fail(`"${act}" is not something this endpoint does.`);
}
