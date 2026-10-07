/**
 * AI Prospecting searches as recurring lead sources for AI Autopilot projects —
 * the rules, pure. One implementation: the Worker (routes/sources.ts,
 * prospectFinderTick.ts) and the browser (services/prospectSources.ts, the
 * Connect wizard) both import this file, so a schedule, a confidence score or
 * a sentence like "change it to 25 a day" means the same thing on both sides.
 * `npm run test:sources` holds it still. No imports, no DOM, no Workers types.
 *
 * ── The pieces ──
 *
 * A *search definition* is what to look for (a kind of business in a place,
 * with filters), kept once per workspace with an id. A *connection* is one
 * project's use of it — when to run, how many verified leads a run should
 * add, how strictly to check them, and where they go next. The connection is
 * a finder row that names the definition, so the existing finder engine runs
 * it; nothing about the search is copied into a second engine.
 */

/* ── Where a search may come from ─────────────────────────────────────────
 *
 * Not every source may be run unattended, kept, or shown to customers. Google
 * Places forbids keeping what it returns, so it is never a recurring source
 * (a Google search connects through the business directories instead, and
 * the wizard says so). The owner's own lead files have no redistribution right
 * until the owner states one, so they are not a source here at all. A source
 * the owner switches off (`policyFor`) stops everywhere at once.
 */
export type SourceId = 'free' | 'register' | 'google' | 'osm';
export interface SourcePolicy {
  label: string;
  /** May an Autopilot connection run it on a schedule? */
  automate: boolean;
  /** May what it returns be stored (and so de-duplicated against tomorrow)? */
  keep: boolean;
  /** The licence the data comes under, said on every contact it produces. */
  licence: string;
  /** Why it cannot be automated, when it cannot. */
  why?: string;
}
export const SOURCE_POLICY: Record<SourceId, SourcePolicy> = {
  free: { label: 'Business directories', automate: true, keep: true, licence: 'OpenStreetMap contributors (ODbL), via Geoapify' },
  osm: { label: 'Business directories', automate: true, keep: true, licence: 'OpenStreetMap contributors (ODbL)' },
  register: { label: 'Verified business directories', automate: true, keep: true, licence: 'Companies House (Open Government Licence)' },
  google: {
    label: 'Google Maps', automate: false, keep: false, licence: 'Google Maps Platform',
    why: 'Google charges per search and its terms do not allow keeping what it returns, so a recurring search uses business directories instead.',
  },
};
/** The owner's switch per source: 'on' for everybody, 'owner' (kept internal), 'off'. */
export type PolicySetting = 'on' | 'owner' | 'off';
export const policyFor = (settings: Partial<Record<string, PolicySetting>> | null | undefined, source: string): PolicySetting =>
  (settings?.[source === 'osm' ? 'free' : source] as PolicySetting) ?? 'on';

/** The source a recurring search runs on. */
export const automatedSource = (s: string): 'free' | 'register' => (s === 'register' ? 'register' : 'free');

/* ── A search definition ── */

export interface Filters { website: boolean; email: boolean; phone: boolean }
export const DEFAULT_FILTERS: Filters = { website: false, email: true, phone: false };

const norm = (s: string) => s.toLowerCase().normalize('NFKD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]+/g, ' ').trim();
/** One definition per distinct search in a workspace. */
export const searchKey = (source: string, trade: string, place: string) => `${automatedSource(source)}|${norm(trade)}|${norm(place)}`;
const titleCase = (s: string) => s.trim().replace(/\s+/g, ' ').replace(/(^|\s)(\p{Ll})/gu, (_, a: string, b: string) => a + b.toUpperCase());
export const searchName = (trade: string, place: string) => `${titleCase(trade)} — ${titleCase(place)}`;
export const workflowNameFor = (trade: string, place: string) => `${titleCase(place)} ${titleCase(trade)} Prospecting Automation`;

/** Did what the search finds change, as opposed to its name? Asks whether connected workflows should follow. */
export function substantiallyDifferent(
  a: { trade: string; place: string; source: string; filters: Filters; exclusions: string[] },
  b: { trade: string; place: string; source: string; filters: Filters; exclusions: string[] },
): boolean {
  return norm(a.trade) !== norm(b.trade) || norm(a.place) !== norm(b.place) || automatedSource(a.source) !== automatedSource(b.source)
    || a.filters.website !== b.filters.website || a.filters.phone !== b.filters.phone || a.filters.email !== b.filters.email
    || [...a.exclusions].map(norm).sort().join('|') !== [...b.exclusions].map(norm).sort().join('|');
}

/* ── When it runs ─────────────────────────────────────────────────────────
 *
 * A run is a local day: on each run day, from the chosen hour, the finder
 * works through the day in small steps until the target is in (or the day's
 * ceilings are reached). Days are the customer's, not UTC's — a weekday run in
 * New York must not start on a Sunday evening.
 */
export type Schedule = 'daily' | 'weekdays' | 'weekly' | 'custom' | 'manual';
export const SCHEDULES: { id: Schedule; label: string }[] = [
  { id: 'daily', label: 'Every day' }, { id: 'weekdays', label: 'Every weekday' }, { id: 'weekly', label: 'Weekly' },
  { id: 'custom', label: 'Custom days' }, { id: 'manual', label: 'Manual only' },
];
export const DAY_NAMES = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

/** The seven-letter mask (Monday first) for a schedule. */
export function daysFor(schedule: Schedule, custom = '1111111', weeklyDay = 0): string {
  if (schedule === 'daily') return '1111111';
  if (schedule === 'weekdays') return '1111100';
  if (schedule === 'weekly') return DAY_NAMES.map((_, i) => (i === weeklyDay ? '1' : '0')).join('');
  if (schedule === 'manual') return '0000000';
  return /^[01]{7}$/.test(custom) && custom.includes('1') ? custom : '1111100';
}

export interface Local { date: string; weekday: number; hour: number }

/** The date, weekday (Monday 0) and hour in a time zone. An unknown zone is UTC. */
export function localParts(at: Date, tz: string): Local {
  let parts: Record<string, string> = {};
  try {
    const f = new Intl.DateTimeFormat('en-US', { timeZone: tz || 'UTC', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', hourCycle: 'h23', weekday: 'short' });
    parts = Object.fromEntries(f.formatToParts(at).map(p => [p.type, p.value]));
  } catch {
    return localParts(at, 'UTC');
  }
  const wd = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'].indexOf(parts.weekday);
  return { date: `${parts.year}-${parts.month}-${parts.day}`, weekday: wd < 0 ? 0 : wd, hour: Number(parts.hour) % 24 };
}

/** The UTC instant of a local date and hour in a zone (two passes settle a DST edge). */
export function zonedTime(date: string, hour: number, tz: string): Date {
  const [y, m, d] = date.split('-').map(Number);
  let t = Date.UTC(y, m - 1, d, hour);
  for (let i = 0; i < 2; i++) {
    const p = localParts(new Date(t), tz);
    const [py, pm, pd] = p.date.split('-').map(Number);
    const shown = Date.UTC(py, pm - 1, pd, p.hour);
    t += Date.UTC(y, m - 1, d, hour) - shown;
  }
  return new Date(t);
}

export interface RunPlan {
  schedule: Schedule; runDays: string; runHour: number; tz: string;
  /** Local date of a run somebody started by hand ('' when none). */
  manualRun: string;
}

/** Is a run on now, and for which local day? */
export function runNow(p: RunPlan, at: Date): { on: boolean; date: string; why: string } {
  const l = localParts(at, p.tz);
  if (p.manualRun === l.date) return { on: true, date: l.date, why: 'started by hand' };
  if (p.schedule === 'manual') return { on: false, date: l.date, why: 'Runs only when started by hand.' };
  const days = daysFor(p.schedule, p.runDays);
  if (days[l.weekday] !== '1') return { on: false, date: l.date, why: `${DAY_NAMES[l.weekday]} is not a run day.` };
  if (l.hour < p.runHour) return { on: false, date: l.date, why: `Today's run starts at ${String(p.runHour).padStart(2, '0')}:00.` };
  return { on: true, date: l.date, why: '' };
}

/** The next time a run starts, after `at` (null for manual-only). */
export function nextRunStart(p: RunPlan, at: Date): Date | null {
  if (p.schedule === 'manual') return null;
  const days = daysFor(p.schedule, p.runDays);
  const l = localParts(at, p.tz);
  for (let i = 0; i < 9; i++) {
    const probe = new Date(zonedTime(l.date, 12, p.tz).getTime() + i * 86_400_000);
    const d = localParts(probe, p.tz);
    if (days[d.weekday] !== '1') continue;
    const start = zonedTime(d.date, p.runHour, p.tz);
    if (start.getTime() > at.getTime()) return start;
  }
  return null;
}

export function describeSchedule(p: Pick<RunPlan, 'schedule' | 'runDays' | 'runHour'>): string {
  const at = `${String(p.runHour).padStart(2, '0')}:00`;
  if (p.schedule === 'manual') return 'Manual only';
  if (p.schedule === 'daily') return `Every day from ${at}`;
  if (p.schedule === 'weekdays') return `Weekdays from ${at}`;
  const days = daysFor(p.schedule, p.runDays);
  const names = DAY_NAMES.filter((_, i) => days[i] === '1');
  return `${p.schedule === 'weekly' ? 'Every' : 'On'} ${names.join(', ')} from ${at}`;
}

/** Work allowed in one run, scaled to its target — finding 40 verified leads can take 150 websites. */
export const TARGET_MAX = 100;
export function runLimits(target: number): { searches: number; reads: number } {
  const t = Math.max(1, Math.min(TARGET_MAX, target));
  return { searches: Math.min(30, 8 + Math.ceil(t / 4)), reads: Math.min(600, Math.max(150, t * 6)) };
}

/* ── Is a candidate good enough? ──────────────────────────────────────────
 *
 * Confidence is a sum of checks that actually ran, never a guess: the screen
 * lists each part, so 92% can be explained line by line. A check that could
 * not run adds nothing rather than being assumed to have passed.
 */
export type Level = 'recommended' | 'strict';
export interface Verify {
  level: Level;
  /** Turn away info@, sales@ and the like. */
  rejectRole: boolean;
  /** Turn away a business that writes from Gmail, Outlook… */
  rejectFreeMail: boolean;
}
export const DEFAULT_VERIFY: Verify = { level: 'recommended', rejectRole: false, rejectFreeMail: false };
export const DEFAULT_MIN_CONFIDENCE = 85;

export type CheckState = 'pass' | 'fail' | 'skip' | 'wait' | 'run';
export interface Check { key: string; label: string; state: CheckState; detail: string; points: number }

export interface Candidate {
  name: string;
  website: string;
  /** Did the website answer when read (null when there is no website or it was not read). */
  siteLive: boolean | null;
  email: string;
  /** Was the address published on the business's own site (rather than only in a directory)? */
  emailOnSite: boolean;
  phone: string;
  /** The address check, when one ran. */
  verdict: { status: 'valid' | 'domain_ok' | 'risky' | 'invalid' | 'unknown'; role: boolean; free: boolean; disposable: boolean; level: 'basic' | 'mailbox' } | null;
  duplicate: boolean;
  suppressed: boolean;
}

export type RejectReason =
  | 'duplicate' | 'suppressed' | 'no_email' | 'no_website' | 'no_phone' | 'site_down' | 'invalid_domain'
  | 'failed_verification' | 'disposable' | 'role_address' | 'free_mail' | 'not_mailbox_verified' | 'low_confidence' | 'excluded';

export const REJECT_LABEL: Record<RejectReason, string> = {
  duplicate: 'Already in your CRM or this project',
  suppressed: 'On your suppression or unsubscribe list',
  no_email: 'No address published',
  no_website: 'No website',
  no_phone: 'No phone number',
  site_down: 'Website did not answer',
  invalid_domain: 'Email domain takes no mail',
  failed_verification: 'Failed verification',
  disposable: 'Throwaway address',
  role_address: 'Role address (info@, sales@…)',
  free_mail: 'Free webmail address',
  not_mailbox_verified: 'Mailbox not verified',
  low_confidence: 'Below the confidence you set',
  excluded: 'Matches an exclusion',
};

const hostOf = (s: string) => {
  const t = s.trim().toLowerCase();
  if (!t) return '';
  try { return new URL(/^https?:\/\//.test(t) ? t : `https://${t}`).hostname.replace(/^www\./, ''); } catch { return ''; }
};

/**
 * The checks for one candidate, in the order the screen shows them, and the
 * verdict. `filters` are the search's (website/phone required), `verify` and
 * `minConfidence` the connection's.
 */
export function qualify(c: Candidate, filters: Filters, verify: Verify, minConfidence: number, exclusions: string[] = []):
{ ok: boolean; confidence: number; reason: RejectReason | null; checks: Check[] } {
  const checks: Check[] = [];
  const add = (key: string, label: string, state: CheckState, detail: string, points = 0) => { checks.push({ key, label, state, detail, points }); };
  let reason: RejectReason | null = null;
  const reject = (r: RejectReason) => { if (!reason) reason = r; };

  add('found', 'Found by the search', 'pass', c.name, 30);
  const lower = `${c.name} ${c.website}`.toLowerCase();
  const hit = exclusions.map(x => x.trim().toLowerCase()).find(x => x && lower.includes(x));
  if (hit) { add('excluded', 'Exclusions', 'fail', `Matches "${hit}"`); reject('excluded'); }

  if (!c.website) {
    add('website', 'Website checked', filters.website ? 'fail' : 'skip', 'No website listed');
    if (filters.website) reject('no_website');
  } else if (c.siteLive === false) {
    add('website', 'Website checked', filters.website ? 'fail' : 'skip', 'Did not answer');
    if (filters.website) reject('site_down');
  } else {
    add('website', 'Website checked', 'pass', hostOf(c.website), 20);
  }

  if (!c.email) {
    add('email', 'Email found', 'fail', 'No address published');
    reject('no_email');
  } else {
    add('email', 'Email found', 'pass', c.emailOnSite ? 'Published on its own website' : 'Listed in the directory', c.emailOnSite ? 15 : 8);
    const site = hostOf(c.website), dom = c.email.split('@')[1] ?? '';
    if (site && (dom === site || dom.endsWith(`.${site}`))) add('match', 'Address matches the website', 'pass', dom, 10);
    const v = c.verdict;
    if (!v) add('domain', 'Domain checked', 'skip', 'Not checked');
    else if (v.status === 'invalid') { add('domain', 'Domain checked', 'fail', 'Takes no mail'); reject('invalid_domain'); }
    else add('domain', 'Domain checked', 'pass', 'Takes mail', 0);
    if (v && v.status !== 'invalid') {
      if (v.disposable) { add('verify', 'Email verification', 'fail', 'A throwaway address'); reject('disposable'); }
      else if (v.status === 'valid') add('verify', 'Email verification', 'pass', v.level === 'mailbox' ? 'Mailbox accepts mail' : 'Checked', 25);
      else if (v.status === 'domain_ok') add('verify', 'Email verification', verify.level === 'strict' ? 'fail' : 'pass', 'Domain and mail server checked; the mailbox itself was not asked', 15);
      else if (v.status === 'risky') add('verify', 'Email verification', verify.level === 'strict' ? 'fail' : 'pass', 'Accepts everything (catch-all) — cannot be confirmed', 3);
      else add('verify', 'Email verification', verify.level === 'strict' ? 'fail' : 'skip', 'Could not be checked');
      if (verify.level === 'strict' && v.status !== 'valid') reject('not_mailbox_verified');
      if (v.role) { add('role', 'Named mailbox', verify.rejectRole ? 'fail' : 'skip', 'A role address (info@, sales@…)', -5); if (verify.rejectRole) reject('role_address'); }
      if (v.free) { add('free', 'Business address', verify.rejectFreeMail ? 'fail' : 'skip', 'A free webmail address', -10); if (verify.rejectFreeMail) reject('free_mail'); }
    }
  }
  if (c.phone) add('phone', 'Phone number', 'pass', c.phone, 5);
  else { add('phone', 'Phone number', filters.phone ? 'fail' : 'skip', 'None listed'); if (filters.phone) reject('no_phone'); }

  add('duplicate', 'Duplicate check', c.duplicate ? 'fail' : 'pass', c.duplicate ? 'Already in your CRM or this project' : 'New to you');
  if (c.duplicate) reject('duplicate');
  add('suppression', 'Suppression check', c.suppressed ? 'fail' : 'pass', c.suppressed ? 'Asked not to be contacted' : 'Not on your lists');
  if (c.suppressed) reject('suppressed');

  const confidence = Math.max(0, Math.min(100, checks.filter(k => k.state === 'pass' || k.points < 0).reduce((s, k) => s + k.points, 0)));
  const passes = confidence >= minConfidence;
  add('confidence', 'Confidence', passes ? 'pass' : 'fail', `${confidence}% (needs ${minConfidence}%)`);
  if (!passes) reject('low_confidence');
  return { ok: !reason, confidence, reason, checks };
}

/* ── Where qualifying leads go ── */

export interface Destination {
  /** The contact list (crm_contact_lists id) — the project's audience by default. */
  listId: string;
  tags: string[];
  /** Assign to this team member (contact.assignedTo). */
  owner: string;
  /** Create a deal for each in this pipeline (its first stage unless `stageId`). */
  pipelineId: string;
  stageId: string;
  /** Start each in this workflow of the same project. */
  nextWorkflowId: string;
}
export const DEFAULT_DESTINATION: Destination = { listId: '', tags: [], owner: '', pipelineId: '', stageId: '', nextWorkflowId: '' };

/* ── Plain language ───────────────────────────────────────────────────────
 *
 * What somebody types to the project rather than opening a form. Read by
 * pattern, not by an AI call, so it always means the same thing and never
 * changes a setting the sentence did not name. Anything else is `unknown`
 * and the screen says what it can do.
 */
export type Command =
  | { kind: 'connect'; search: string }
  | { kind: 'target'; target: number; schedule?: Schedule }
  | { kind: 'schedule'; schedule: Schedule; weeklyDay?: number }
  | { kind: 'pause' } | { kind: 'resume' }
  | { kind: 'next_workflow'; workflow: string }
  | { kind: 'min_confidence'; value: number }
  | { kind: 'skip_contacted' }
  | { kind: 'run_now' }
  | { kind: 'unknown' };

const NUM: Record<string, number> = { ten: 10, fifteen: 15, twenty: 20, 'twenty five': 25, thirty: 30, forty: 40, fifty: 50, sixty: 60, hundred: 100, 'a hundred': 100 };

function scheduleIn(t: string): { schedule: Schedule; weeklyDay?: number } | null {
  if (/\bweekdays?\b|monday (?:to|through|-) friday|working days?|business days?/.test(t)) return { schedule: 'weekdays' };
  if (/\bevery day\b|\bdaily\b|\beach day\b|\ba day\b|\bper day\b|\/day\b/.test(t)) return { schedule: 'daily' };
  const wk = /\b(?:weekly|every week|once a week)(?:\s+on\s+(\w+))?|\bevery (monday|tuesday|wednesday|thursday|friday|saturday|sunday)\b/.exec(t);
  if (wk) {
    const day = (wk[1] || wk[2] || 'monday').slice(0, 3);
    const i = DAY_NAMES.findIndex(d => d.toLowerCase() === day);
    return { schedule: 'weekly', weeklyDay: i < 0 ? 0 : i };
  }
  if (/\bmanual(?:ly)?\b|only when i (?:say|ask|press)|on demand/.test(t)) return { schedule: 'manual' };
  return null;
}

export function parseSourceCommand(text: string): Command {
  const t = ` ${text.toLowerCase().replace(/[’']/g, '').replace(/[.!?,;]+(?=\s|$)/g, ' ').replace(/\s+/g, ' ').trim()} `;
  if (!t.trim()) return { kind: 'unknown' };
  const conn = /\bconnect (?:my |the )?(.+?) search\b/.exec(t) ?? /\bconnect (?:my |the )?(?:search )?(?:for )?"?(.+?)"?(?: to (?:this|the) project)?\s*$/.exec(t.trim());
  if (conn && !/\bworkflow\b/.test(t)) return { kind: 'connect', search: conn[1].replace(/\b(?:to|into) (?:this|the|my) project\b/, '').trim() };
  if (/\b(?:pause|stop|halt)\b(?! adding)/.test(t) && /\b(?:source|prospecting|search|finding|it|this)\b/.test(t)) return { kind: 'pause' };
  if (/\b(?:resume|restart|unpause|start again|switch (?:it )?back on)\b/.test(t)) return { kind: 'resume' };
  if (/\b(?:run|find|start) (?:it |them |one )?now\b|\brun (?:a|today'?s) run\b/.test(t)) return { kind: 'run_now' };
  if (/\b(?:already contacted|contacted before|already emailed|weve contacted|we have contacted)\b/.test(t)) return { kind: 'skip_contacted' };
  const conf = /\b(?:above|over|at least|minimum(?: of)?|min(?:imum)? confidence(?: of)?|only (?:accept|take|keep) (?:leads )?(?:above|over))\s*(\d{2,3})\s*%?/.exec(t)
    ?? /(\d{2,3})\s*%\s*(?:confidence|or (?:more|higher|above))/.exec(t);
  if (conf && /confiden|%/.test(t)) return { kind: 'min_confidence', value: Math.max(50, Math.min(100, Number(conf[1]))) };
  const wf = /\b(?:start|put|send|move|enrol|enroll|feed|add) (?:these |the |new |them |my )?(?:leads|prospects|contacts|them)? ?(?:in|into|to|through) (?:my |the )?(.+?)(?: workflow| automation)?\s*$/.exec(t.trim());
  if (wf && /\b(?:workflow|automation|outreach|sequence|campaign)\b/.test(t)) return { kind: 'next_workflow', workflow: wf[1].replace(/\b(?:workflow|automation)\b/g, '').trim() };
  const n = /\b(\d{1,3})\b/.exec(t)?.[1] ?? Object.entries(NUM).find(([w]) => new RegExp(`\\b${w}\\b`).test(t))?.[1];
  const sched = scheduleIn(t);
  if (n !== undefined && /\b(?:prospects?|leads?|per|a day|every|each|change|make it|set it|to)\b/.test(t)) {
    const target = Math.max(1, Math.min(TARGET_MAX, Number(n)));
    return sched ? { kind: 'target', target, schedule: sched.schedule } : { kind: 'target', target };
  }
  if (sched) return { kind: 'schedule', ...sched };
  return { kind: 'unknown' };
}

/** "The best match for what somebody typed" among names — for "connect my NYC dentists search". */
export function bestMatch<T extends { name: string }>(typed: string, items: T[]): T | null {
  const want = norm(typed).replace(/\b(?:my|the|search|prospecting|prospects?)\b/g, ' ').split(' ').filter(w => w.length > 1);
  if (!want.length) return null;
  const alias = (w: string) => (w === 'nyc' ? 'new york city' : w === 'la' ? 'los angeles' : w);
  let best: T | null = null, score = 0;
  for (const it of items) {
    const hay = ` ${norm(it.name)} `;
    const s = want.reduce((a, w) => a + (hay.includes(` ${alias(w)}`) || hay.includes(` ${w.replace(/s$/, '')}`) ? 1 : 0), 0) / want.length;
    if (s > score) { score = s; best = it; }
  }
  return score >= 0.5 ? best : null;
}
