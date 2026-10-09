/**
 * /api/site-plan.php — the public site's "Find my solution", and its funnel.
 *
 *   understand   a visitor's request (and at most one website and two files)
 *                → the same understanding the app's wizard gets
 *                (routes/intake.ts), with no account
 *   transcribe   a spoken request → its words
 *   event        one step of the funnel, counted
 *   funnel       the counts, for the install owner only
 *
 * ── Spending the operator's AI on strangers ──
 *
 * `understand` and `transcribe` run on the operator's key for somebody who has
 * not signed up — that is the point: the visitor sees their own business
 * understood before they are asked for an address. So both are limited three
 * ways: per connection (8 understandings / 12 recordings an hour), per day
 * across the whole site (600 / 300), and in what they may carry (one page,
 * two files). Past any of them the answer is `no_ai` with a reason, and the
 * site matches the visitor's words itself and says so — the same path as an
 * install with no key at all.
 *
 * ── The funnel ──
 *
 * One row per visitor, event and day (`crm_funnel_events`, migration 0068), so
 * a refresh or a double click is not two visitors and the table grows with
 * people, not with clicks. Only a fixed list of event names, a random visitor
 * id, a catalogue solution key and "phone"/"desktop" are kept — never a
 * visitor's words (services/funnel.ts). Events after sign-up need the session:
 * `signup_completed` counts only an account created in the last two hours (so
 * signing in to an old account is not a sign-up), and the project steps only
 * an account in its first fortnight.
 */
import { body, fail, json } from '../lib/http';
import { nowIso, userFromToken, type Env } from '../lib/db';
import { loadAiKey } from '../lib/ai';
import { rateLimit } from '../lib/rateLimit';
import { transcribe, understand, type IntakeReq } from './intake';

const EVENTS = new Set([
  'homepage_view', 'hero_cta_clicked', 'wizard_started', 'wizard_intent_submitted',
  'wizard_question_answered', 'wizard_completed', 'solution_viewed', 'solution_edited',
  'trial_cta_clicked', 'signup_started', 'signup_completed', 'autopilot_project_build_started',
  'autopilot_project_created', 'first_workflow_created', 'first_value_reached',
]);
/** Steps that happen inside an account: counted only with a session. */
const SIGNED_IN = new Set(['signup_completed', 'autopilot_project_build_started', 'autopilot_project_created', 'first_workflow_created', 'first_value_reached']);

/** The order the report reads in — the funnel, top to bottom. */
export const FUNNEL_ORDER = [
  'homepage_view', 'hero_cta_clicked', 'wizard_started', 'wizard_intent_submitted', 'wizard_question_answered',
  'wizard_completed', 'solution_viewed', 'solution_edited', 'trial_cta_clicked', 'signup_started',
  'signup_completed', 'autopilot_project_build_started', 'autopilot_project_created', 'first_workflow_created',
  'first_value_reached',
];

const ipOf = (req: Request) => req.headers.get('CF-Connecting-IP') || 'local';

interface Req extends IntakeReq {
  event?: string;
  vid?: string;
  solution?: string;
  device?: string;
  days?: number;
}

export async function handleSitePlan(req: Request, env: Env): Promise<Response> {
  const d = await body<Req>(req);
  const act = String(d.action ?? '');
  if (act === 'event') return event(req, env, d);
  if (act === 'funnel') return funnel(env, d);
  if (act !== 'understand' && act !== 'transcribe') return fail('Unknown action.');

  const voice = act === 'transcribe';
  const ip = ipOf(req);
  const mine = await rateLimit(env, { what: voice ? 'site-voice' : 'site-understand', who: ip, max: voice ? 12 : 8, windowSeconds: 3600 });
  if (!mine.allowed) return fail('That is a lot of requests from one connection — your words are matched here instead.', 200, { code: 'no_ai', reason: 'rate_limited' });
  const all = await rateLimit(env, { what: voice ? 'site-voice' : 'site-understand', who: 'all', max: voice ? 300 : 600, windowSeconds: 86_400 });
  if (!all.allowed) return fail('The site’s AI allowance for today is used up — your words are matched here instead.', 200, { code: 'no_ai', reason: 'daily_cap' });

  /* No workspace: the operator's pool, as for a trial account's first day. */
  const key = await loadAiKey(env, '');
  if (!key) return fail('The AI is not available on this install right now.', 200, { code: 'no_ai' });

  if (voice) return transcribe(key, d);
  /* Less material than a signed-in customer may send: one page, two files,
     no portfolio (there is none). */
  const files = (d.files ?? []).slice(0, 2);
  return understand(env, key, '', { ...d, files, urls: (d.urls ?? []).slice(0, 1), texts: (d.texts ?? []).slice(0, 1), portfolioId: undefined });
}

async function event(req: Request, env: Env, d: Req): Promise<Response> {
  const name = String(d.event ?? '');
  const vid = String(d.vid ?? '');
  if (!EVENTS.has(name) || !/^[a-f0-9]{24}$/.test(vid)) return fail('Not an event.');
  const flood = await rateLimit(env, { what: 'site-event', who: ipOf(req), max: 300, windowSeconds: 3600 });
  if (!flood.allowed) return json({ success: true, counted: false });

  let accountId: string | null = null;
  if (SIGNED_IN.has(name)) {
    const user = await userFromToken(env.DB, d.token);
    if (!user) return json({ success: true, counted: false });
    accountId = user.accountId ?? null;
    /* A sign-up is an account made in the last two hours; the steps after it
       count for an account in its first fortnight — a long-standing customer
       building another project is not the site's conversion. */
    const row = await env.DB.prepare('SELECT created_at AS at FROM crm_users WHERE email = ?').bind(user.email).first<{ at: string }>();
    const made = Date.parse(String(row?.at ?? '').replace(' ', 'T'));
    const span = name === 'signup_completed' ? 2 * 3600_000 : 14 * 86_400_000;
    if (!Number.isFinite(made) || Date.now() - made > span) return json({ success: true, counted: false });
  }
  const solution = /^[a-z][a-z0-9-]{1,40}$/.test(String(d.solution ?? '')) ? String(d.solution) : '';
  const device = d.device === 'phone' ? 'phone' : 'desktop';
  const now = nowIso();
  await env.DB.prepare(
    `INSERT OR IGNORE INTO crm_funnel_events (day, event, visitor, solution, device, account_id, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
  ).bind(now.slice(0, 10), name, vid, solution, device, accountId, now).run();
  return json({ success: true, counted: true });
}

/**
 * The funnel for the owner: distinct visitors per step over a window, by
 * device, and which solutions the finished wizards chose. Distinct over the
 * whole window, not summed by day — one person on two days is one person.
 */
async function funnel(env: Env, d: Req): Promise<Response> {
  const user = await userFromToken(env.DB, d.token);
  if (!user) return fail('Sign in again.', 401, { code: 'unauthorised' });
  if (user.role !== 'agency' || user.accountId) return fail('Only the install owner can see the site funnel.', 403, { code: 'not_owner' });
  const days = [7, 30, 90].includes(Number(d.days)) ? Number(d.days) : 30;
  const since = new Date(Date.now() - (days - 1) * 86_400_000).toISOString().slice(0, 10);
  const rows = await env.DB.prepare(
    `SELECT event, device, COUNT(DISTINCT visitor) AS n FROM crm_funnel_events WHERE day >= ? GROUP BY event, device`,
  ).bind(since).all<{ event: string; device: string; n: number }>();
  const total = await env.DB.prepare(
    'SELECT event, COUNT(DISTINCT visitor) AS n FROM crm_funnel_events WHERE day >= ? GROUP BY event',
  ).bind(since).all<{ event: string; n: number }>();
  const picks = await env.DB.prepare(
    `SELECT solution, COUNT(DISTINCT visitor) AS n FROM crm_funnel_events
      WHERE day >= ? AND event = 'wizard_completed' AND solution != '' GROUP BY solution ORDER BY n DESC LIMIT 12`,
  ).bind(since).all<{ solution: string; n: number }>();
  const byEvent = new Map((total.results ?? []).map(r => [r.event, r.n]));
  const steps = FUNNEL_ORDER.map(e => ({
    event: e,
    visitors: byEvent.get(e) ?? 0,
    phone: (rows.results ?? []).find(r => r.event === e && r.device === 'phone')?.n ?? 0,
    desktop: (rows.results ?? []).find(r => r.event === e && r.device === 'desktop')?.n ?? 0,
  }));
  return json({ success: true, days, since, steps, solutions: picks.results ?? [] });
}
