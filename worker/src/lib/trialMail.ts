/**
 * Onboarding emails on days 1, 3 and 5 of a trial, and the owner's daily
 * digest of who signed up.
 *
 * ── Who gets the onboarding emails ──
 *
 * Somebody on a trial (not paid, not the owner, not an account older than
 * trials) who has **not made a project yet** and has not pressed "stop these
 * emails". The moment they make a project they stop qualifying: these emails
 * exist to get somebody unstuck, and a person who is building does not need
 * telling how to start.
 *
 * Each day goes once. A person who first qualifies late — the owner's mailbox
 * was only validated on their day 4, say — gets the latest email that is due
 * and the earlier ones are marked skipped, never three in one minute.
 *
 * ── The marker follows the send ──
 *
 * A step is `sent` only after the mail server accepted it. A failure is
 * recorded as `failed` with a count and tried again an hour later, three times
 * at most; after that the owner's digest names it, rather than the cron
 * retrying a broken mailbox all week.
 *
 * ── What they are sent from ──
 *
 * The install owner's validated mailbox — the one sign-in codes use
 * (routes/auth.ts `installMailbox`), never a customer's. Replies go to the
 * owner. No mailbox, nothing sent and nothing marked: they go out once one is
 * connected.
 *
 * ── The digest ──
 *
 * To the owner, once a day at the hour they chose in their own time zone:
 * new sign-ups, trials ending, trials that ended unpaid, who is stuck, who went
 * quiet, who asked for help, and how the onboarding emails went. A day with
 * nothing in any of those is silent — a daily "nothing happened" is the email
 * that trains somebody to filter the one that mattered (autopilotDigest.ts has
 * the same rule).
 *
 * A scheduled run has no request and no origin, so every link comes from
 * `env.APP_ORIGIN`. Unset, both passes report that and send nothing.
 */
import { installSecret, metaGet, metaPut, nowIso, type Env } from './db';
import { deliver, fromAddressOf } from './deliver';
import { timingSafeEqual } from './crypto';
import { trialFor } from './trial';
import { installMailbox } from '../routes/auth';
import { esc, listSignups, loadSettings, safeLink, type Nudge, type Signup } from '../routes/customers';

const DAY = 86_400_000;
const HOUR = 3_600_000;
const MAX_ATTEMPTS = 3;
/** The pass itself runs at most this often: nothing here is due by the minute. */
const GATE_MS = 30 * 60_000;
const GATE_KEY = 'trial_nudges_at';
const DIGEST_DAY_KEY = 'owner_digest_day';
const DIGEST_TRY_KEY = 'owner_digest_try';
/** A slow mail server must not make one tick carry the whole backlog. */
const MAX_SENDS_PER_PASS = 25;

export interface TrialMailReport {
  nudged: number;
  failed: number;
  skipped: number;
  digest: string;
  notes: string[];
}

const origin = (env: Env) => (env.APP_ORIGIN ?? '').replace(/\/$/, '');

/* ── Opt-out ─────────────────────────────────────────────────────────────── */

async function optoutSig(env: Env, email: string): Promise<string> {
  const k = await crypto.subtle.importKey(
    'raw', new TextEncoder().encode(await installSecret(env.DB, 'trial_optout')),
    { name: 'HMAC', hash: 'SHA-256' }, false, ['sign'],
  );
  const mac = await crypto.subtle.sign('HMAC', k, new TextEncoder().encode(`optout\n${email}`));
  return [...new Uint8Array(mac)].slice(0, 16).map(b => b.toString(16).padStart(2, '0')).join('');
}

export async function optoutUrl(env: Env, email: string): Promise<string> {
  return `${origin(env)}/api/trial-optout.php?${new URLSearchParams({ e: email, s: await optoutSig(env, email) })}`;
}

/**
 * The "stop these emails" link, and the one-click header behind it.
 *
 * GET shows a page with a button, because mail scanners follow links and an
 * opt-out that fired on a scan would stop emails nobody asked to stop. POST —
 * the button, or the one-click unsubscribe a mail provider sends (RFC 8058) —
 * does it. The link is signed, so it only ever stops mail to its own address.
 */
export async function handleTrialOptout(req: Request, env: Env): Promise<Response> {
  const url = new URL(req.url);
  const email = (url.searchParams.get('e') ?? '').trim().toLowerCase();
  const s = url.searchParams.get('s') ?? '';
  const page = (msg: string, button = false) => new Response(
    `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Email preferences</title></head>
<body style="font-family:system-ui,-apple-system,Segoe UI,sans-serif;background:#f4f5f7;margin:0;padding:48px 16px;color:#17191c">
<div style="max-width:440px;margin:0 auto;background:#fff;border-radius:16px;padding:28px">
<p style="font-size:16px;line-height:1.6;margin:0 0 18px">${msg}</p>
${button ? `<form method="post"><button style="background:#17191c;color:#c8f24d;border:0;border-radius:999px;padding:12px 22px;font-weight:700;font-size:15px;cursor:pointer">Stop these emails</button></form>` : ''}
</div></body></html>`,
    { status: 200, headers: { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store' } },
  );
  if (!email || !s || !timingSafeEqual(s, await optoutSig(env, email))) {
    return page('That link is not valid. If you want to stop getting trial emails, reply to one and say so.');
  }
  if (req.method !== 'POST') {
    return page(`Stop the trial tips sent to <b>${esc(email)}</b>? You will still get sign-in codes and anything you ask us for.`, true);
  }
  await env.DB.prepare('UPDATE crm_users SET nudges_off_at = ? WHERE email = ? AND nudges_off_at IS NULL')
    .bind(nowIso(), email).run();
  return page('Done — no more trial tips. You will still get sign-in codes and anything you ask us for.');
}

/* ── Day 1, 3 and 5 ──────────────────────────────────────────────────────── */

function firstName(name: string, email: string): string {
  const n = (name || '').trim();
  if (!n || n === email.split('@')[0]) return 'there';
  return n.split(/\s+/)[0];
}

function fill(text: string, vars: Record<string, string>): string {
  return text.replace(/\{(\w+)\}/g, (m, k: string) => (k in vars ? vars[k] : m));
}

export async function nudgeHtml(env: Env, n: Nudge, who: { email: string; name: string; daysLeft: number }, kickoffUrl: string): Promise<{ subject: string; html: string; unsubscribeUrl: string }> {
  const vars = { name: firstName(who.name, who.email), daysLeft: String(who.daysLeft) };
  const subject = fill(n.subject, vars);
  const paras = fill(n.body, vars).split(/\n{2,}/).map(p => p.trim()).filter(Boolean)
    .map(p => `<p style="font-size:15px;line-height:1.6;margin:0 0 14px">${esc(p).replace(/\n/g, '<br>')}</p>`).join('');
  const kick = safeLink(kickoffUrl);
  const unsubscribeUrl = await optoutUrl(env, who.email);
  const html = `
    <div style="font-family:system-ui,-apple-system,Segoe UI,sans-serif;max-width:540px;margin:0 auto;color:#17191c">
      ${paras}
      <p style="margin:20px 0 10px">
        <a href="${esc(origin(env))}/autopilot" style="display:inline-block;background:#17191c;color:#c8f24d;font-weight:700;text-decoration:none;padding:12px 22px;border-radius:999px">Start my first project</a>
      </p>
      ${kick ? `<p style="margin:0 0 20px"><a href="${esc(kick)}" style="color:#3b5bdb;font-weight:600">Or book a free 20-minute call</a></p>` : ''}
      <p style="font-size:12px;color:#6b7280;line-height:1.6;margin:24px 0 0;border-top:1px solid #eceef1;padding-top:12px">
        You are getting this because you started a Protected Central trial with ${esc(who.email)}.
        <a href="${esc(unsubscribeUrl)}" style="color:#6b7280">Stop these emails</a>.
      </p>
    </div>`;
  return { subject, html, unsubscribeUrl };
}

async function ownerEmail(env: Env): Promise<string> {
  const r = await env.DB.prepare("SELECT email FROM crm_users WHERE role = 'agency' AND account_id IS NULL LIMIT 1")
    .first<{ email: string }>();
  return r?.email ?? '';
}

interface NudgeRow { step: number; status: string; attempts: number; at: string }

async function record(env: Env, email: string, step: number, status: 'sent' | 'failed' | 'skipped', detail: string) {
  await env.DB.prepare(
    `INSERT INTO crm_trial_nudges (email, step, status, attempts, detail, at) VALUES (?,?,?,?,?,?)
     ON CONFLICT(email, step) DO UPDATE SET status = excluded.status,
       attempts = crm_trial_nudges.attempts + excluded.attempts, detail = excluded.detail, at = excluded.at`,
  ).bind(email, step, status, status === 'skipped' ? 0 : 1, detail.slice(0, 300), nowIso()).run();
}

export async function runTrialNudges(env: Env, report: TrialMailReport): Promise<void> {
  const settings = await loadSettings(env);
  if (!settings.nudgesOn) return;
  if (!origin(env)) { report.notes.push('Trial emails skipped: APP_ORIGIN is not set, so their links would point nowhere.'); return; }

  const last = Date.parse((await metaGet(env.DB, GATE_KEY)) ?? '');
  if (Number.isFinite(last) && Date.now() - last < GATE_MS) return;
  await metaPut(env.DB, GATE_KEY, nowIso());

  const now = Date.now();
  /* Only people a day or more in, still inside the trial, still subscribed,
     with no project anywhere they own. Everyone else is not asked about. */
  const r = await env.DB.prepare(
    `SELECT u.email, u.name, u.created_at AS createdAt FROM crm_users u
     WHERE u.role = 'agency' AND u.account_id IS NOT NULL
       AND u.trial_ends_at > ? AND u.nudges_off_at IS NULL AND u.created_at <= ?
       AND NOT EXISTS (SELECT 1 FROM crm_projects p WHERE p.account_id IN
             (SELECT account_id FROM crm_workspaces WHERE owner_email = u.email))
     ORDER BY u.created_at LIMIT 200`,
  ).bind(new Date(now).toISOString(), new Date(now - DAY).toISOString())
    .all<{ email: string; name: string; createdAt: string }>();
  const people = r.results ?? [];
  if (!people.length) return;

  const mb = await installMailbox(env);
  if (!mb) {
    report.notes.push('Trial emails are waiting: connect and validate a mailbox in the owner\'s own workspace.');
    return;
  }
  const replyTo = settings.digestTo || await ownerEmail(env);

  let sends = 0;
  for (const p of people) {
    if (sends >= MAX_SENDS_PER_PASS) break;
    const trial = await trialFor(env, p.email);
    if (trial.kind !== 'trial') continue;

    const age = (now - Date.parse(p.createdAt)) / DAY;
    const due = settings.nudges.filter(n => age >= n.day).sort((a, b) => a.day - b.day);
    if (!due.length) continue;

    const rows = (await env.DB.prepare('SELECT step, status, attempts, at FROM crm_trial_nudges WHERE email = ?')
      .bind(p.email).all<NudgeRow>()).results ?? [];
    const done = rows.filter(x => x.status === 'sent' || x.status === 'skipped').map(x => x.step);
    const highestDone = done.length ? Math.max(...done) : 0;
    const target = due[due.length - 1];
    if (target.day <= highestDone) continue;

    const prev = rows.find(x => x.step === target.day);
    if (prev?.status === 'failed') {
      if (prev.attempts >= MAX_ATTEMPTS) continue;
      if (now - Date.parse(prev.at) < HOUR) continue;
    }

    const msg = await nudgeHtml(env, target, { email: p.email, name: p.name, daysLeft: trial.daysLeft }, settings.kickoffUrl);
    sends++;
    const sent = await deliver(mb, {
      fromName: mb.from.name || 'Protected Central', fromEmail: fromAddressOf(mb), to: p.email,
      subject: msg.subject, html: msg.html, replyTo: replyTo || undefined, unsubscribeUrl: msg.unsubscribeUrl,
    });
    if (!sent.ok) {
      await record(env, p.email, target.day, 'failed', sent.error || 'The mail server refused it.');
      report.failed++;
      continue;
    }
    await record(env, p.email, target.day, 'sent', '');
    report.nudged++;
    /* The earlier days this overtook are closed, so they are never sent late. */
    for (const n of due) {
      if (n.day < target.day && !done.includes(n.day)) {
        await record(env, p.email, n.day, 'skipped', `Day ${target.day} went instead`);
        report.skipped++;
      }
    }
  }
}

/* ── The owner's digest ──────────────────────────────────────────────────── */

function localParts(tz: string): { date: string; hour: number } {
  const now = new Date();
  try {
    const date = new Intl.DateTimeFormat('en-CA', { timeZone: tz || 'UTC', year: 'numeric', month: '2-digit', day: '2-digit' }).format(now);
    const hour = Number(new Intl.DateTimeFormat('en-GB', { timeZone: tz || 'UTC', hour: 'numeric', hour12: false }).format(now)) % 24;
    return { date, hour };
  } catch {
    return { date: now.toISOString().slice(0, 10), hour: now.getUTCHours() };
  }
}

function ago(iso: string | null): string {
  if (!iso) return 'never';
  const ms = Date.now() - Date.parse(iso);
  if (!Number.isFinite(ms)) return '—';
  if (ms < HOUR) return `${Math.max(1, Math.round(ms / 60_000))} min ago`;
  if (ms < DAY) return `${Math.round(ms / HOUR)} h ago`;
  const d = Math.floor(ms / DAY);
  return d === 1 ? 'yesterday' : `${d} days ago`;
}

function signals(s: Signup): string {
  return [
    s.projects ? `${s.projects} project${s.projects === 1 ? '' : 's'}` : 'no project',
    s.mailboxes ? 'mailbox connected' : 'no mailbox',
    `last here ${ago(s.lastSeen)}`,
  ].join(' · ');
}

function section(title: string, note: string, people: { s: Signup; line: string }[]): string {
  if (!people.length) return '';
  const rows = people.slice(0, 15).map(({ s, line }) => `
    <tr><td style="padding:8px 0;border-top:1px solid #eceef1">
      <b style="font-size:14px">${esc(s.name || s.email.split('@')[0])}</b>
      <a href="mailto:${esc(s.email)}" style="color:#6b7280;font-size:13px;text-decoration:none"> ${esc(s.email)}</a><br>
      <span style="font-size:12.5px;color:#4b5563">${esc(line)}</span>
    </td></tr>`).join('');
  const more = people.length > 15 ? `<p style="font-size:12.5px;color:#6b7280;margin:6px 0 0">…and ${people.length - 15} more on the Sign-ups screen.</p>` : '';
  return `
    <h3 style="font-size:15px;margin:22px 0 2px">${esc(title)} <span style="color:#6b7280;font-weight:600">${people.length}</span></h3>
    <p style="font-size:12.5px;color:#6b7280;margin:0 0 6px">${esc(note)}</p>
    <table style="width:100%;border-collapse:collapse">${rows}</table>${more}`;
}

export interface DigestContent { subject: string; html: string; empty: boolean }

export async function buildOwnerDigest(env: Env): Promise<DigestContent> {
  const all = await listSignups(env, 1000);
  const now = Date.now();
  const since = now - DAY;
  const age = (s: Signup) => (now - Date.parse(s.createdAt)) / DAY;

  const fresh = all.filter(s => Date.parse(s.createdAt) >= since);
  const ending = all.filter(s => s.trial.kind === 'trial' && s.trial.daysLeft <= 2);
  const endedNow = all.filter(s => s.trial.kind === 'ended' && s.trial.endsAt && Date.parse(s.trial.endsAt) >= since);
  const endingSet = new Set(ending.map(s => s.email));
  const stuck = all.filter(s => s.trial.kind === 'trial' && age(s) >= 1 && !s.projects && !endingSet.has(s.email));
  const quiet = all.filter(s => s.trial.kind === 'trial' && age(s) >= 2
    && (!s.lastSeen || now - Date.parse(s.lastSeen) > 2 * DAY) && !endingSet.has(s.email));
  const onTrial = all.filter(s => s.trial.kind === 'trial').length;
  const paying = all.filter(s => s.trial.kind === 'paid').length;

  const helpRows = (await env.DB.prepare(
    "SELECT DISTINCT verified_email AS e FROM crm_live_sessions WHERE verified_email != '' AND created_at >= ?",
  ).bind(new Date(since).toISOString()).all<{ e: string }>().catch(() => ({ results: [] as { e: string }[] }))).results ?? [];
  const byEmail = new Map(all.map(s => [s.email, s]));
  const help = helpRows.map(r => byEmail.get(r.e)).filter((s): s is Signup => !!s);

  const nudgeRows = (await env.DB.prepare('SELECT email, step, status, attempts, detail FROM crm_trial_nudges WHERE at >= ?')
    .bind(new Date(since).toISOString()).all<{ email: string; step: number; status: string; attempts: number; detail: string }>()
    .catch(() => ({ results: [] as { email: string; step: number; status: string; attempts: number; detail: string }[] }))).results ?? [];
  const sentN = nudgeRows.filter(r => r.status === 'sent').length;
  const failedRows = nudgeRows.filter(r => r.status === 'failed');

  const empty = !fresh.length && !ending.length && !endedNow.length && !stuck.length && !quiet.length && !help.length && !nudgeRows.length;

  const parts: string[] = [];
  if (fresh.length) parts.push(`${fresh.length} new`);
  if (ending.length) parts.push(`${ending.length} ending soon`);
  if (stuck.length) parts.push(`${stuck.length} not started`);
  if (help.length) parts.push(`${help.length} asked for help`);
  const subject = `Sign-ups: ${parts.length ? parts.join(', ') : 'a quiet day'}`;

  const failedHtml = failedRows.length ? `
    <p style="font-size:13px;color:#991b1b;margin:8px 0 0">${failedRows.length} could not be sent:
    ${failedRows.slice(0, 10).map(r => `${esc(r.email)} (day ${r.step}${r.attempts >= MAX_ATTEMPTS ? ', gave up after 3 tries' : ''}: ${esc(r.detail)})`).join('; ')}</p>` : '';

  const html = `
    <div style="font-family:system-ui,-apple-system,Segoe UI,sans-serif;max-width:600px;margin:0 auto;color:#17191c">
      <h2 style="font-size:20px;margin:0 0 4px">Your sign-ups this morning</h2>
      <p style="font-size:13.5px;color:#4b5563;margin:0 0 4px">${onTrial} on trial · ${paying} paying · ${all.length} customers in all</p>
      ${section('New in the last 24 hours', 'A welcome message is already waiting in their app.', fresh.map(s => ({ s, line: `signed up ${ago(s.createdAt)} · ${signals(s)}` })))}
      ${section('Trials ending in the next 2 days', 'The best time for a personal note or a call.', ending.map(s => ({ s, line: `${s.trial.daysLeft} day${s.trial.daysLeft === 1 ? '' : 's'} left · ${signals(s)}` })))}
      ${section('Trials that ended without paying', 'They can still choose a plan; nothing they made is gone.', endedNow.map(s => ({ s, line: signals(s) })))}
      ${section('Not started', 'A day or more in with no project. The onboarding emails are working on these.', stuck.map(s => ({ s, line: `day ${Math.floor(age(s))} · ${signals(s)}` })))}
      ${section('Gone quiet', 'On trial and not in the app for two days.', quiet.map(s => ({ s, line: signals(s) })))}
      ${section('Asked for help', 'Started a screen share in the last 24 hours.', help.map(s => ({ s, line: signals(s) })))}
      ${nudgeRows.length ? `<h3 style="font-size:15px;margin:22px 0 2px">Onboarding emails</h3>
        <p style="font-size:13px;color:#4b5563;margin:0">${sentN} sent in the last 24 hours.</p>${failedHtml}` : ''}
      <p style="margin:26px 0 0"><a href="${esc(origin(env))}/signups" style="display:inline-block;background:#17191c;color:#c8f24d;font-weight:700;text-decoration:none;padding:12px 22px;border-radius:999px">Open Sign-ups &amp; trials</a></p>
      <p style="font-size:12px;color:#6b7280;margin:18px 0 0">Change the time or turn this off under Sign-ups &amp; trials → Daily digest.</p>
    </div>`;
  return { subject, html, empty };
}

export async function sendOwnerDigest(env: Env, opts: { force?: boolean } = {}): Promise<{ ok: boolean; to: string; error: string; code: string }> {
  const bad = (code: string, error: string) => ({ ok: false, to: '', error, code });
  const settings = await loadSettings(env);
  if (!opts.force && !settings.digestOn) return bad('off', 'The digest is off.');
  if (!origin(env)) return bad('no_origin', 'APP_ORIGIN is not set, so the digest\'s links would point nowhere.');

  const local = localParts(settings.digestTz);
  if (!opts.force) {
    if ((await metaGet(env.DB, DIGEST_DAY_KEY)) === local.date) return bad('done', 'Already sent today.');
    const inWindow = (local.hour - settings.digestHour + 24) % 24 < 3;
    if (!inWindow) return bad('not_due', 'Not the hour yet.');
    const tried = (await metaGet(env.DB, DIGEST_TRY_KEY)) ?? '';
    const [day, n] = tried.split(':');
    if (day === local.date && Number(n) >= MAX_ATTEMPTS) return bad('gave_up', 'Could not be sent three times today.');
  }

  const mb = await installMailbox(env);
  if (!mb) return bad('no_mailbox', 'Connect and validate a mailbox in your own workspace (Settings → Email & SMS) — the digest is sent from it.');
  const to = settings.digestTo || await ownerEmail(env);
  if (!to) return bad('no_owner', 'There is no owner address to send it to.');

  const d = await buildOwnerDigest(env);
  if (d.empty && !opts.force) {
    /* Nothing to say: the day is closed so the next thirty-odd ticks do not
       build the same empty report again. There is nothing here to retry. */
    await metaPut(env.DB, DIGEST_DAY_KEY, local.date);
    return bad('quiet', 'Nothing to report today.');
  }

  const sent = await deliver(mb, {
    fromName: mb.from.name || 'Protected Central', fromEmail: fromAddressOf(mb), to,
    subject: d.subject, html: d.html,
  });
  if (!sent.ok) {
    if (!opts.force) {
      const tried = (await metaGet(env.DB, DIGEST_TRY_KEY)) ?? '';
      const [day, n] = tried.split(':');
      await metaPut(env.DB, DIGEST_TRY_KEY, `${local.date}:${day === local.date ? Number(n) + 1 : 1}`);
    }
    return bad('send_failed', sent.error || 'The mail server refused the digest.');
  }
  /* Stamped only now: a digest that failed is tried again on the next tick. */
  if (!opts.force) await metaPut(env.DB, DIGEST_DAY_KEY, local.date);
  return { ok: true, to, error: '', code: '' };
}

/** The whole pass, for the cron: the emails first, then the digest that reports on them. */
export async function runTrialMail(env: Env): Promise<TrialMailReport> {
  const report: TrialMailReport = { nudged: 0, failed: 0, skipped: 0, digest: '', notes: [] };
  try { await runTrialNudges(env, report); }
  catch (e) { report.notes.push(`Trial emails stopped: ${e instanceof Error ? e.message : String(e)}`); }
  try {
    const d = await sendOwnerDigest(env);
    report.digest = d.ok ? 'sent' : d.code;
    if (!d.ok && (d.code === 'send_failed' || d.code === 'no_mailbox' || d.code === 'no_origin')) report.notes.push(`Owner digest: ${d.error}`);
  } catch (e) { report.notes.push(`Owner digest stopped: ${e instanceof Error ? e.message : String(e)}`); }
  return report;
}
