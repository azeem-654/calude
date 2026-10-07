/**
 * AI Autopilot's daily prospect finder — the engine.
 *
 * A project that is meant to find its own customers ("sell to real estate
 * agents in Virginia") has a finder: trades × places, an allowance a day, and
 * the project's audience list. Every cron tick takes one small step for the
 * finder whose turn it is (`nextJob` in lib/finderPlan.ts): read a few of the
 * websites already found, or run one more search page. Businesses with an
 * address that did not fail its check join Contacts (as prospects) and the
 * project's list, up to the day's allowance. The planner then proposes them to
 * the project's outreach in batches of 20, each waiting for approval — the
 * finder itself never sends anything.
 *
 * ── Writing to Contacts from the server ──
 *
 * Contacts are a document the browser owns and saves whole. The server adds to
 * it only through `dataUpdate` (compare-and-swap on `updated_at`), so it never
 * overwrites a browser save it did not see. The other direction — a browser
 * that read Contacts before the finder's write saving its older copy — cannot
 * be prevented from here, so `crm_project_prospects` keeps the record and
 * `reconcile` puts back any added prospect that is missing, every step.
 *
 * ── Whose money ──
 *
 * The owner's: Geoapify credits, Companies House requests. Each finder has
 * daily ceilings (`DAY_LIMITS`), uses Geoapify only while the install has
 * plenty of the day's credits left, never uses Google (paid per search, and
 * its terms forbid keeping what it returns), and stops when a trial ends.
 *
 * ── Connections: an AI Prospecting search as a project's source ──
 *
 * A finder that names a search definition (`search_id`) is a *connection*
 * (routes/sources.ts, lib/prospectSources.ts). It runs the same rotation, but:
 * only on its run days, from its hour, in the customer's time zone; with a
 * target of **verified** leads per run, examining as many candidates as that
 * takes (within `runLimits`); every candidate is put through `qualify` — the
 * website, the address and its check, duplicates against the CRM and the
 * project, the suppression and unsubscribe lists, the confidence bar — and a
 * rejected one is recorded with its reason, so tomorrow's run never examines
 * it again; and a qualifying lead goes where the connection says (the list,
 * tags, an owner, a deal, the next workflow of the same project). What it is
 * doing is written to `live` as it goes, for the screen to show. Finders
 * without a search run exactly as before.
 */
import { dataGet, dataUpdate, nowIso, type Env } from './lib/db';
import { findContacts, searchProspects, type Prospect } from './lib/prospects';
import { creditsToday, installGeoKey, searchGeoapify } from './lib/geoapify';
import { installRegisterKey, searchRegister } from './lib/companiesHouse';
import { checkEmails } from './lib/emailVerify';
import { trialForWorkspace } from './lib/trial';
import {
  DAY_LIMITS, READS_PER_TICK, afterSearch, forDay, isKnown, knownIndex, nextJob, nextRunAt, type FinderState, type Job,
} from './lib/finderPlan';
import {
  DEFAULT_DESTINATION, DEFAULT_FILTERS, DEFAULT_VERIFY, REJECT_LABEL, SOURCE_POLICY, nextRunStart, policyFor, qualify, runLimits, runNow,
  type Check, type Destination, type Filters, type RejectReason, type RunPlan, type Schedule, type Verify,
} from './lib/prospectSources';
import { enrolInto } from './lib/automationEngine';
import { loadPolicy } from './lib/sourcePolicyStore';

/** Leave Geoapify to people searching by hand once the install has used this much of the day. */
const GEO_SHARE = 2_000;
const FINDERS_PER_TICK = 2;

export interface FinderRow {
  id: string; account_id: string; project_id: string; workflow_id: string; name: string;
  trades: string; places: string; source: string; per_day: number; list_id: string;
  status: string; status_reason: string; cursor: number; page_token: string; done_keys: string;
  day: string; day_added: number; day_searches: number; day_reads: number;
  next_run_at: string; last_run_at: string;
  /* A connection's own settings (migration 0066); '' / defaults on an older finder. */
  search_id?: string; search_version?: number; criteria?: string; schedule?: string; run_days?: string; run_hour?: number; tz?: string;
  min_confidence?: number; verify?: string; destination?: string; manual_run?: string;
  day_examined?: number; day_rejected?: string; live?: string;
}

/** What a connection decided, read off its row with every default filled in. */
export interface Connection {
  searchId: string; searchName: string; filters: Filters; exclusions: string[];
  verify: Verify; minConfidence: number; destination: Destination; plan: RunPlan;
}
export const isConnection = (f: FinderRow) => !!f.search_id;
export function connectionOf(f: FinderRow): Connection {
  const c = parse<{ name?: string; filters?: Partial<Filters>; exclusions?: string[] }>(f.criteria, {});
  return {
    searchId: f.search_id ?? '', searchName: c.name ?? f.name,
    filters: { ...DEFAULT_FILTERS, ...(c.filters ?? {}) }, exclusions: Array.isArray(c.exclusions) ? c.exclusions : [],
    verify: { ...DEFAULT_VERIFY, ...parse<Partial<Verify>>(f.verify, {}) },
    minConfidence: Number(f.min_confidence) || 0,
    destination: { ...DEFAULT_DESTINATION, ...parse<Partial<Destination>>(f.destination, {}), listId: f.list_id },
    plan: { schedule: (f.schedule || 'daily') as Schedule, runDays: f.run_days || '1111111', runHour: Number(f.run_hour) || 0, tz: f.tz || 'UTC', manualRun: f.manual_run || '' },
  };
}

/* ── What the screen shows while it works ──
 *
 * The candidate being checked, check by check, and the last few outcomes. A
 * real record of what happened — written as each check finishes, read by the
 * project's source card every few seconds — never an animation of work. */
export interface LiveCheck { label: string; state: string; detail: string }
export interface LiveItem { name: string; ok: boolean | null; confidence: number; reason: string; checks: LiveCheck[]; done: string[]; at: string }
export interface Live { run: string; current: LiveItem | null; recent: LiveItem[] }
const slim = (checks: Check[]): LiveCheck[] => checks.map(c => ({ label: c.label, state: c.state, detail: c.detail }));
async function writeLive(env: Env, id: string, live: Live): Promise<void> {
  await env.DB.prepare('UPDATE crm_prospect_finders SET live = ? WHERE id = ?').bind(JSON.stringify({ ...live, recent: live.recent.slice(0, 8) }), id).run().catch(() => undefined);
}

const parse = <T>(raw: string | null | undefined, fallback: T): T => {
  try { const v = JSON.parse(raw ?? ''); return (v ?? fallback) as T; } catch { return fallback; }
};
const rid = (p: string) => `${p}-${crypto.randomUUID()}`;
const today = (d = new Date()) => d.toISOString().slice(0, 10);

export function stateOf(f: FinderRow): FinderState {
  return {
    trades: parse<string[]>(f.trades, []), places: parse<string[]>(f.places, []), perDay: Math.max(1, Number(f.per_day) || 20),
    cursor: Number(f.cursor) || 0, pageToken: f.page_token || '', doneKeys: parse<string[]>(f.done_keys, []),
    day: f.day || '', dayAdded: Number(f.day_added) || 0, daySearches: Number(f.day_searches) || 0, dayReads: Number(f.day_reads) || 0,
  };
}

/** A connection's run-day tallies, alongside FinderState's. */
export interface RunTally { examined: number; rejected: Record<string, number> }

async function saveState(env: Env, f: FinderRow, s: FinderState, extra: { status?: string; reason?: string; next?: string; tally?: RunTally } = {}): Promise<void> {
  await env.DB.prepare(
    `UPDATE crm_prospect_finders SET cursor = ?, page_token = ?, done_keys = ?, day = ?, day_added = ?, day_searches = ?, day_reads = ?,
       status = ?, status_reason = ?, next_run_at = ?, last_run_at = ?, updated_at = ?,
       day_examined = COALESCE(?, day_examined), day_rejected = COALESCE(?, day_rejected) WHERE id = ?`,
  ).bind(
    s.cursor, s.pageToken, JSON.stringify(s.doneKeys.slice(-500)), s.day, s.dayAdded, s.daySearches, s.dayReads,
    extra.status ?? f.status, extra.reason ?? (extra.status ? '' : f.status_reason), extra.next ?? f.next_run_at, nowIso(), nowIso(),
    extra.tally ? extra.tally.examined : null, extra.tally ? JSON.stringify(extra.tally.rejected) : null, f.id,
  ).run();
}

async function log(env: Env, f: FinderRow, kind: string, detail: string, found = 0, added = 0): Promise<void> {
  await env.DB.prepare('INSERT INTO crm_finder_runs (id, finder_id, account_id, project_id, kind, detail, found, added, at) VALUES (?,?,?,?,?,?,?,?,?)')
    .bind(rid('fr'), f.id, f.account_id, f.project_id, kind, detail.slice(0, 600), found, added, nowIso()).run().catch(() => undefined);
}

/* ── The contact a found business becomes ── */

interface PPRow {
  id: string; name: string; email: string; phone: string; website: string; address: string; category: string;
  person_name: string; person_role: string; company_number: string; email_status: string; query: string; found_at: string; source: string;
  confidence?: number;
}

const EMAIL_TAG: Record<string, string> = { valid: 'verified email', domain_ok: 'email domain ok', risky: 'risky email', invalid: 'email bounces' };

export interface ContactExtras { tags?: string[]; owner?: string; searchName?: string; confidence?: number }

export function contactOf(r: PPRow, projectId: string, now = nowIso(), x: ContactExtras = {}): Record<string, unknown> {
  const [trade, place] = r.query.split('|');
  const fields: Record<string, string> = { foundAt: r.found_at, projectId };
  /* Where it came from, said on the contact itself: the search, the source and
     its licence, the date — so a list can always be traced back. */
  if (x.searchName) {
    const pol = SOURCE_POLICY[(r.source as keyof typeof SOURCE_POLICY)] ?? SOURCE_POLICY.free;
    fields.prospectSearch = x.searchName;
    fields.provenance = `Found by the AI Prospecting search "${x.searchName}" in ${pol.label} (${pol.licence}) on ${r.found_at.slice(0, 10)}`;
  }
  if (x.confidence) fields.confidence = `${x.confidence}%`;
  if (r.email_status) { fields.emailStatus = r.email_status; fields.emailCheck = 'basic'; fields.emailCheckedAt = now; }
  if (r.company_number) fields.companyNumber = r.company_number;
  const [first, ...rest] = r.person_name.split(' ').filter(Boolean);
  /* What found it goes in a field of its own: as the source line it ran to
     sixty characters and the contact list prints the source under the name,
     which squeezed every row of the table into a column of wrapped words. */
  if (trade) fields.foundBy = `${trade} in ${place ?? ''}`.trim();
  return {
    /* Stable, so putting a prospect back after a stale browser save is the same contact, not a second one. */
    id: `pf-${r.id}`,
    name: r.name, email: r.email, phone: r.phone, status: 'prospect',
    tags: [...new Set(['prospect search', 'autopilot', r.category, EMAIL_TAG[r.email_status] ?? '', ...(x.tags ?? [])].filter(Boolean))],
    ...(x.owner ? { assignedTo: x.owner } : {}),
    source: r.source === 'manual'
      ? 'AI Prospecting · added to a project'
      : 'AI Autopilot · daily prospecting',
    /* A date, as every other writer of contacts stores it (the list prints
       it as it is, so a full timestamp showed as one). */
    createdAt: now, lastActivity: now.slice(0, 10), value: 0,
    company: r.name, website: r.website, address: r.address,
    ...(first ? { firstName: first, lastName: rest.join(' ') || undefined, jobTitle: r.person_role || undefined } : {}),
    customFields: fields,
  };
}

/**
 * Put `rows` into Contacts and on the list, as one compare-and-swap each.
 * Returns the rows that are now in both, or null when either write lost its
 * race three times (the next step tries again).
 */
async function putInContacts(env: Env, accountId: string, listId: string, projectId: string, rows: PPRow[], x: (r: PPRow) => ContactExtras = () => ({})): Promise<PPRow[] | null> {
  if (!rows.length) return [];
  const add = rows.map(r => contactOf(r, projectId, nowIso(), x(r)));
  const okC = await dataUpdate(env.DB, accountId, 'crm_contacts', cur => {
    const list = parse<Record<string, unknown>[]>(cur, []);
    const have = new Set(list.map(c => String(c.id)));
    const fresh = add.filter(c => !have.has(String(c.id)));
    return fresh.length ? JSON.stringify([...fresh, ...list]) : null;
  });
  if (!okC) return null;
  if (listId) {
    const okL = await dataUpdate(env.DB, accountId, 'crm_contact_lists', cur => {
      const lists = parse<{ id: string; memberIds?: string[] }[]>(cur, []);
      const l = lists.find(x => x.id === listId);
      if (!l) return null;
      const ids = new Set(l.memberIds ?? []);
      const before = ids.size;
      for (const c of add) ids.add(String(c.id));
      if (ids.size === before) return null;
      l.memberIds = [...ids];
      return JSON.stringify(lists);
    });
    if (!okL) return null;
  }
  return rows;
}

const PP_COLS = 'id, name, email, phone, website, address, category, person_name, person_role, company_number, email_status, query, found_at, source, contact_id, confidence';

/** Prospects marked added whose contact is not in Contacts any more — a stale save dropped them. Put them back. */
export async function reconcile(env: Env, accountId: string, projectId: string, listId: string): Promise<number> {
  const added = (await env.DB.prepare(`SELECT ${PP_COLS} FROM crm_project_prospects WHERE account_id = ? AND project_id = ? AND status = 'added' ORDER BY added_at DESC LIMIT 400`)
    .bind(accountId, projectId).all<PPRow & { contact_id: string }>()).results ?? [];
  if (!added.length) return 0;
  const contacts = parse<{ id: string }[]>(await dataGet(env.DB, accountId, 'crm_contacts'), []);
  const have = new Set(contacts.map(c => c.id));
  /* Only the finder's own contacts (`pf-…`); a prospect added by hand is the browser's, and a
     customer who deleted one of those meant it. */
  const missing = added.filter(r => r.contact_id.startsWith('pf-') && !have.has(r.contact_id)).slice(0, 100);
  if (!missing.length) return 0;
  const done = await putInContacts(env, accountId, listId, projectId, missing);
  return done?.length ?? 0;
}

/** Move up to today's remaining allowance of ready prospects into the audience. */
async function addReady(env: Env, f: FinderRow, s: FinderState, live?: Live): Promise<number> {
  const room = s.perDay - s.dayAdded;
  if (room <= 0) return 0;
  const ready = (await env.DB.prepare(`SELECT ${PP_COLS} FROM crm_project_prospects WHERE finder_id = ? AND status = 'ready' ORDER BY found_at LIMIT ?`)
    .bind(f.id, room).all<PPRow>()).results ?? [];
  if (!ready.length) return 0;
  const conn = isConnection(f) ? connectionOf(f) : null;
  const done = await putInContacts(env, f.account_id, f.list_id, f.project_id, ready, conn
    ? r => ({ tags: conn.destination.tags, owner: conn.destination.owner, searchName: conn.searchName, confidence: Number(r.confidence) || 0 })
    : undefined);
  if (!done) return 0;
  const at = nowIso();
  for (const r of done) {
    await env.DB.prepare("UPDATE crm_project_prospects SET status = 'added', contact_id = ?, added_at = ? WHERE id = ?").bind(`pf-${r.id}`, at, r.id).run();
  }
  if (conn) await afterAdded(env, f, conn, done, live);
  return done.length;
}

/**
 * The rest of where a connection says qualifying leads go: a deal each, and
 * the next workflow of the same project. Each is reported on the lead's line
 * in `live` as it happened — "sent to Dental Outreach" only when the engine
 * accepted them, and why not when it did not.
 */
async function afterAdded(env: Env, f: FinderRow, conn: Connection, rows: PPRow[], live?: Live): Promise<void> {
  const done = new Map<string, string[]>(rows.map(r => [r.id, ['Added to CRM']]));
  const lists = parse<{ id: string; name?: string }[]>(await dataGet(env.DB, f.account_id, 'crm_contact_lists'), []);
  const listName = lists.find(l => l.id === f.list_id)?.name;
  for (const r of rows) {
    if (listName) done.get(r.id)!.push(`Added to ${listName}`);
    if (conn.destination.tags.length) done.get(r.id)!.push(`Tagged ${conn.destination.tags.join(', ')}`);
    if (conn.destination.owner) done.get(r.id)!.push(`Assigned to ${conn.destination.owner}`);
  }
  const d = conn.destination;
  if (d.pipelineId) {
    let stageName = '';
    const ok = await dataUpdate(env.DB, f.account_id, 'crm_pipelines', cur => {
      const pipes = parse<{ id: string; name?: string; stages?: { id: string; name?: string; deals?: unknown[] }[] }[]>(cur, []);
      const p = pipes.find(x => x.id === d.pipelineId);
      const st = p?.stages?.find(x => x.id === d.stageId) ?? p?.stages?.[0];
      if (!p || !st) return null;
      stageName = `${p.name ?? 'pipeline'} → ${st.name ?? 'first stage'}`;
      st.deals = st.deals ?? [];
      const at = nowIso();
      for (const r of rows) {
        st.deals.push({
          id: rid('deal'), title: r.name, contactId: `pf-${r.id}`, contactName: r.name, value: 0, stage: st.id, probability: 10,
          expectedClose: '', assignedTo: d.owner, createdAt: at, priority: 'normal', status: 'active', source: 'autopilot',
          description: `Found by "${conn.searchName}" (AI Prospecting) — confidence ${Number(r.confidence) || 0}%.`,
        });
      }
      return JSON.stringify(pipes);
    });
    for (const r of rows) done.get(r.id)!.push(ok && stageName ? `Deal in ${stageName}` : 'No deal — that pipeline was not found');
  }
  if (d.nextWorkflowId) {
    const e = await enrolInto(env, f.account_id, d.nextWorkflowId, rows.map(r => ({ id: `pf-${r.id}`, name: r.name, email: r.email, phone: r.phone })));
    for (const r of rows) done.get(r.id)!.push(e.ok ? `Sent to ${e.name}` : `Not sent on: ${e.error}`);
    if (!e.ok) await log(env, f, 'error', `Next workflow: ${e.error}`);
  }
  if (live) {
    const byName = new Map(rows.map(r => [r.id, r]));
    for (const [id, steps] of done) {
      const r = byName.get(id)!;
      const was = live.recent.find(x => x.name === r.name && x.ok);
      if (was) was.done = steps;
      else live.recent.unshift({ name: r.name, ok: true, confidence: Number(r.confidence) || 0, reason: '', checks: [], done: steps, at: nowIso() });
    }
    await writeLive(env, f.id, live);
  }
}

/* ── Who must never be prospected again ── */

/** The workspace's suppression list (both keys the app has used) and every unsubscribe. */
async function suppressedSet(env: Env, accountId: string): Promise<Set<string>> {
  const out = new Set<string>();
  for (const key of ['crm_suppression_list', 'crm_suppressions']) {
    for (const x of parse<({ email?: string } | string)[]>(await dataGet(env.DB, accountId, key), [])) {
      const e = (typeof x === 'string' ? x : x?.email ?? '').trim().toLowerCase();
      if (e) out.add(e);
    }
  }
  const u = await env.DB.prepare('SELECT email FROM crm_unsubscribes WHERE account_id = ? LIMIT 20000').bind(accountId).all<{ email: string }>().catch(() => ({ results: [] }));
  for (const r of u.results ?? []) out.add(String(r.email).toLowerCase());
  return out;
}

/* ── A connection's check, candidate by candidate ── */

async function qualifyStep(env: Env, f: FinderRow, s: FinderState, conn: Connection, tally: RunTally, live: Live): Promise<{ state: FinderState; detail: string }> {
  const rows = (await env.DB.prepare("SELECT id, name, email, phone, website FROM crm_project_prospects WHERE finder_id = ? AND status = 'candidate' ORDER BY found_at LIMIT ?")
    .bind(f.id, READS_PER_TICK).all<{ id: string; name: string; email: string; phone: string; website: string }>()).results ?? [];
  if (!rows.length) return { state: s, detail: 'Nothing waiting to be checked.' };
  const known = knownIndex(parse<{ name?: string; company?: string; email?: string; phone?: string; website?: string }[]>(await dataGet(env.DB, f.account_id, 'crm_contacts'), []));
  const suppressed = await suppressedSet(env, f.account_id);
  let reads = 0, passed = 0, failed = 0;
  for (const r of rows) {
    const pending = (label: string, state = 'wait', detail = '') => ({ label, state, detail });
    live.current = {
      name: r.name, ok: null, confidence: 0, reason: '', done: [], at: nowIso(),
      checks: [pending('Finding candidate', 'pass', r.name), pending('Website checked', 'run'), pending('Domain checked'), pending('Email verification'), pending('Duplicate check'), pending('Suppression check'), pending('Confidence')],
    };
    await writeLive(env, f.id, live);

    let siteLive: boolean | null = null;
    const onSite = new Set<string>();
    if (r.website) {
      const c = await findContacts(env, r.website, true);
      reads++;
      siteLive = c.live ?? (c.emails.length ? true : null);
      for (const e of c.emails) onSite.add(e.toLowerCase());
    }
    const all = [...new Set([...(r.email ? [r.email.toLowerCase()] : []), ...onSite])];
    let best = '', verdict: Parameters<typeof qualify>[0]['verdict'] = null;
    if (all.length) {
      const v = await checkEmails(env, f.account_id, all, conn.verify.level === 'strict', true);
      /* The best address: the first a check did not fail — and, under strict,
         one the mailbox check said is deliverable when there is one. */
      const order = conn.verify.level === 'strict' ? [...all].sort((a, b) => Number(v.verdicts[b]?.status === 'valid') - Number(v.verdicts[a]?.status === 'valid')) : all;
      const pick = order.find(e => v.verdicts[e] && v.verdicts[e].status !== 'invalid') ?? order[0];
      best = pick;
      const vd = v.verdicts[pick];
      verdict = vd ? { status: vd.status, role: vd.role, free: vd.free, disposable: vd.disposable, level: vd.level } : null;
    }
    const sameEmail = best ? await env.DB.prepare(
      "SELECT 1 AS x FROM crm_project_prospects WHERE account_id = ? AND project_id = ? AND email = ? AND id != ? AND status IN ('added', 'ready') LIMIT 1",
    ).bind(f.account_id, f.project_id, best, r.id).first<{ x: number }>() : null;
    const q = qualify({
      name: r.name, website: r.website, siteLive, email: best, emailOnSite: !!best && onSite.has(best), phone: r.phone, verdict,
      duplicate: !!sameEmail || isKnown(known, { name: r.name, email: best, phone: r.phone, website: r.website }),
      suppressed: !!best && suppressed.has(best),
    }, conn.filters, conn.verify, conn.minConfidence, conn.exclusions);

    tally.examined++;
    const status = q.ok ? 'ready' : q.reason === 'no_email' ? 'no_email' : 'rejected';
    if (!q.ok && q.reason) tally.rejected[q.reason] = (tally.rejected[q.reason] ?? 0) + 1;
    if (q.ok) passed++; else failed++;
    await env.DB.prepare('UPDATE crm_project_prospects SET status = ?, email = ?, email_status = ?, confidence = ?, reject_reason = ?, checks = ?, search_id = ? WHERE id = ?')
      .bind(status, best, verdict?.status ?? '', q.confidence, q.reason ?? '', JSON.stringify(slim(q.checks)), conn.searchId, r.id).run();
    const item: LiveItem = { name: r.name, ok: q.ok, confidence: q.confidence, reason: q.reason ? REJECT_LABEL[q.reason as RejectReason] : '', checks: slim(q.checks), done: q.ok ? ['Verified — joins the CRM next'] : [], at: nowIso() };
    live.current = item;
    live.recent.unshift(item);
    await writeLive(env, f.id, live);
  }
  /* Nothing is being checked between steps — say so, rather than leave the last candidate "current". */
  live.current = null;
  await writeLive(env, f.id, live);
  return {
    state: { ...s, dayReads: s.dayReads + reads },
    detail: `Checked ${rows.length} candidate${rows.length === 1 ? '' : 's'}: ${passed} verified, ${failed} turned away`,
  };
}

/* ── One step ── */

async function searchStep(env: Env, f: FinderRow, s: FinderState, job: Extract<Job, { kind: 'search' }>, tallyRef?: RunTally): Promise<{ state: FinderState; detail: string; found: number }> {
  const at = nowIso();
  let prospects: Prospect[] = [];
  let next = '';
  let via = '';
  let error = '';
  if (f.source === 'register') {
    const key = await installRegisterKey(env);
    if (!key) error = 'The company register is not switched on for this app.';
    else {
      const r = await searchRegister(env, key.key, job.trade, job.place, job.pageToken, true);
      if (r.ok) { prospects = r.prospects; next = r.next; via = 'register'; } else error = r.error;
    }
  } else {
    const geo = await installGeoKey(env);
    if (geo && (await creditsToday(env)) < GEO_SHARE) {
      const r = await searchGeoapify(env, geo.key, job.trade, job.place, job.pageToken, true);
      if (r.ok) { prospects = r.prospects; next = r.next; via = 'free'; }
    }
    if (!via) {
      /* Overpass matches OSM's tags, which are singular. One answer, no pages. */
      const word = job.trade.toLowerCase().split(/\s+/).map(w => (w.length > 3 && /[^s]s$/.test(w) ? w.slice(0, -1) : w)).join(' ');
      const r = await searchProspects(env, word, job.place, true);
      if (r.error) error = r.error; else { prospects = r.prospects; via = 'osm'; }
    }
  }
  if (error) {
    /* A source that is down is not the search being finished: try it again on a later step. */
    return { state: { ...s, daySearches: s.daySearches + 1 }, detail: `Searching ${job.trade} in ${job.place} failed: ${error}`, found: 0 };
  }

  const contacts = parse<{ name?: string; company?: string; email?: string; phone?: string; website?: string }[]>(await dataGet(env.DB, f.account_id, 'crm_contacts'), []);
  const known = knownIndex(contacts);
  const conn = isConnection(f) ? connectionOf(f) : null;
  const excl = (conn?.exclusions ?? []).map(x => x.trim().toLowerCase()).filter(Boolean);
  let fresh = 0;
  for (const p of prospects) {
    /* A connection keeps what it turned away, and why — duplicates found at the
       search are counted as examined, so "examined 180 to find 40" is true. */
    const dup = isKnown(known, p);
    const excluded = !dup && excl.some(x => `${p.name} ${p.website ?? ''}`.toLowerCase().includes(x));
    const status = dup ? (conn ? 'rejected' : 'known') : excluded ? 'rejected' : 'candidate';
    const reason = dup && conn ? 'duplicate' : excluded ? 'excluded' : '';
    const officer = p.officers?.[0];
    const r = await env.DB.prepare(
      `INSERT OR IGNORE INTO crm_project_prospects
         (id, account_id, project_id, finder_id, ref, name, email, phone, website, address, category, person_name, person_role,
          company_number, query, source, status, found_at, reject_reason, search_id)
       VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
    ).bind(
      rid('pp'), f.account_id, f.project_id, f.id, p.ref.slice(0, 200), p.name.slice(0, 200), (p.email || '').toLowerCase().slice(0, 190),
      (p.phone || '').slice(0, 40), (p.website || '').slice(0, 300), (p.address || '').slice(0, 300), (p.category || job.trade).slice(0, 80),
      (officer?.name ?? '').slice(0, 80), (officer?.role ?? '').slice(0, 80), (p.companyNumber ?? '').slice(0, 20),
      job.key.slice(0, 200), via, status, at, reason, conn?.searchId ?? '',
    ).run().catch(() => null);
    if (r?.meta?.changes && status === 'candidate') fresh++;
    if (r?.meta?.changes && reason && tallyRef) { tallyRef.examined++; tallyRef.rejected[reason] = (tallyRef.rejected[reason] ?? 0) + 1; }
  }
  const state = afterSearch(s, job, next);
  return {
    state,
    detail: `Searched ${job.trade} in ${job.place}: ${prospects.length} found, ${fresh} new to this project${next ? '' : ' — that search is done'}`,
    found: fresh,
  };
}

async function readStep(env: Env, f: FinderRow, s: FinderState): Promise<{ state: FinderState; detail: string }> {
  const rows = (await env.DB.prepare("SELECT id, name, email, website FROM crm_project_prospects WHERE finder_id = ? AND status = 'candidate' ORDER BY found_at LIMIT ?")
    .bind(f.id, READS_PER_TICK).all<{ id: string; name: string; email: string; website: string }>()).results ?? [];
  let ready = 0, none = 0, reads = 0;
  for (const r of rows) {
    const emails = new Set<string>();
    if (r.email) emails.add(r.email);
    if (r.website) {
      const c = await findContacts(env, r.website, true);
      reads++;
      for (const e of c.emails) emails.add(e.toLowerCase());
    }
    let best = '', status = '';
    if (emails.size) {
      const v = await checkEmails(env, f.account_id, [...emails], false, true);
      for (const e of emails) {
        const verdict = v.verdicts[e];
        if (verdict && verdict.status !== 'invalid') { best = e; status = verdict.status; break; }
      }
    }
    if (best) {
      ready++;
      await env.DB.prepare("UPDATE crm_project_prospects SET status = 'ready', email = ?, email_status = ? WHERE id = ?").bind(best, status, r.id).run();
    } else {
      none++;
      await env.DB.prepare("UPDATE crm_project_prospects SET status = 'no_email' WHERE id = ?").bind(r.id).run();
    }
  }
  return { state: { ...s, dayReads: s.dayReads + reads }, detail: `Read ${reads} website${reads === 1 ? '' : 's'}: ${ready} with an address that takes mail, ${none} with nothing to write to` };
}

export interface StepOutcome { ran: boolean; job: Job['kind'] | 'paused' | 'waiting'; detail: string; added: number; found: number }

/** One step for one finder. `force` (Run now) ignores the schedule but not the allowances. */
export async function stepFinder(env: Env, f: FinderRow, now = new Date()): Promise<StepOutcome> {
  /* Paused with the workflow that shows it, and stopped when the trial is. */
  if (f.workflow_id) {
    const wf = await env.DB.prepare('SELECT status FROM crm_project_workflows WHERE id = ? AND account_id = ?').bind(f.workflow_id, f.account_id).first<{ status: string }>();
    if (!wf) { await saveState(env, f, stateOf(f), { status: 'paused', reason: 'Its workflow was deleted.' }); return { ran: false, job: 'paused', detail: 'Its workflow was deleted.', added: 0, found: 0 }; }
    if (wf.status !== 'active') return { ran: false, job: 'paused', detail: 'Its workflow is switched off.', added: 0, found: 0 };
  }
  if ((await trialForWorkspace(env, f.account_id).catch(() => null))?.kind === 'ended') {
    const why = 'The trial ended, so daily prospecting has stopped. Choosing a plan starts it again.';
    await saveState(env, f, stateOf(f), { status: 'paused', reason: why });
    await log(env, f, 'paused', why);
    return { ran: false, job: 'paused', detail: why, added: 0, found: 0 };
  }

  /* A connection runs on its own days, from its own hour, in its own zone;
     its counters belong to that local day, not to UTC's. */
  const conn = isConnection(f) ? connectionOf(f) : null;
  /* A source the owner has switched off stops every connection on it, and says so. */
  if (conn && policyFor(await loadPolicy(env), f.source) === 'off') {
    const why = 'The owner of this app has switched this source off, so this prospecting source is paused.';
    await saveState(env, f, stateOf(f), { status: 'paused', reason: why });
    await log(env, f, 'paused', why);
    return { ran: false, job: 'paused', detail: why, added: 0, found: 0 };
  }
  let runDate = today(now);
  if (conn) {
    const r = runNow(conn.plan, now);
    if (!r.on) {
      const next = nextRunStart(conn.plan, now);
      await env.DB.prepare('UPDATE crm_prospect_finders SET next_run_at = ? WHERE id = ?')
        .bind((next ?? new Date(now.getTime() + 86_400_000)).toISOString(), f.id).run();
      return { ran: false, job: 'waiting', detail: r.why, added: 0, found: 0 };
    }
    runDate = r.date;
  }

  const was = stateOf(f);
  let s = forDay(was, runDate);
  const newDay = was.day !== s.day;
  const tally: RunTally = newDay ? { examined: 0, rejected: {} } : { examined: Number(f.day_examined) || 0, rejected: parse<Record<string, number>>(f.day_rejected, {}) };
  const stored = parse<Live>(f.live, { run: '', current: null, recent: [] });
  const live: Live = stored.run === runDate ? stored : { run: runDate, current: null, recent: [] };
  const limits = conn ? runLimits(s.perDay) : DAY_LIMITS;
  await reconcile(env, f.account_id, f.project_id, f.list_id).catch(() => 0);

  /* Today's room first: what is already ready joins the audience before anything new is looked for. */
  let added = await addReady(env, f, s, conn ? live : undefined);
  s = { ...s, dayAdded: s.dayAdded + added };
  if (added) await log(env, f, 'add', `Added ${added} to the project's audience`, 0, added);

  const counts = await env.DB.prepare(
    "SELECT SUM(CASE WHEN status = 'candidate' THEN 1 ELSE 0 END) AS c, SUM(CASE WHEN status = 'ready' THEN 1 ELSE 0 END) AS r FROM crm_project_prospects WHERE finder_id = ?",
  ).bind(f.id).first<{ c: number | null; r: number | null }>();
  const job = nextJob(s, Number(counts?.c ?? 0), Number(counts?.r ?? 0), limits);
  let detail = '';
  let found = 0;

  /* When the next step is: soon while today's run has work, otherwise the next run day. */
  const restUntil = (j: Job) => {
    if (conn && (j.kind === 'rest' || j.kind === 'exhausted')) {
      /* Within a run, today's start has passed, so this is the next run day's. */
      const nx = nextRunStart(conn.plan, now);
      return (nx ?? new Date(now.getTime() + 86_400_000)).toISOString();
    }
    return nextRunAt(now, j);
  };

  if (job.kind === 'search') {
    const r = await searchStep(env, f, s, job, conn ? tally : undefined);
    s = r.state; detail = r.detail; found = r.found;
    await log(env, f, 'search', detail, found);
  } else if (job.kind === 'read') {
    const r = conn ? await qualifyStep(env, f, s, conn, tally, live) : await readStep(env, f, s);
    s = r.state; detail = r.detail;
    await log(env, f, 'read', detail);
    const more = await addReady(env, f, s, conn ? live : undefined);
    s = { ...s, dayAdded: s.dayAdded + more };
    added += more;
    if (more) await log(env, f, 'add', `Added ${more} to the project's audience`, 0, more);
  } else if (job.kind === 'exhausted') {
    detail = 'Every search in the rotation has been run to its end. Add places or kinds of business to find more.';
    await saveState(env, f, s, { status: 'exhausted', reason: detail, next: restUntil(job), tally: conn ? tally : undefined });
    await log(env, f, 'exhausted', detail);
    return { ran: true, job: job.kind, detail, added, found };
  } else if (conn) {
    detail = job.why === 'quota'
      ? `This run's ${s.perDay} verified leads are in (${tally.examined} examined).`
      : `Found ${s.dayAdded} of ${s.perDay} — this run's search allowance (${limits.searches} searches, ${limits.reads} websites) is used up. The next run carries on.`;
  } else {
    detail = job.why === 'quota' ? `Today's ${s.perDay} are in.` : `Today's limits are reached (${DAY_LIMITS.searches} searches, ${DAY_LIMITS.reads} websites).`;
  }
  const settled = job.kind === 'rest';
  await saveState(env, f, s, { next: settled ? restUntil(job) : nextRunAt(now, job), tally: conn ? tally : undefined });
  return { ran: true, job: job.kind, detail, added, found };
}

/**
 * Keep less about the businesses that were turned away. Their name and the
 * source's id stay — that is what stops tomorrow's run examining them again —
 * but after 30 days their address, phone and street are cleared: nothing a
 * customer will ever be shown or sent to needs them.
 */
export async function minimiseRejected(env: Env, now = new Date()): Promise<number> {
  const cutoff = new Date(now.getTime() - 30 * 86_400_000).toISOString();
  const r = await env.DB.prepare(
    `UPDATE crm_project_prospects SET email = '', phone = '', address = '', person_name = '', person_role = '', checks = ''
     WHERE id IN (SELECT id FROM crm_project_prospects WHERE status IN ('rejected', 'no_email', 'known') AND found_at < ?
                  AND (email != '' OR phone != '' OR address != '') LIMIT 300)`,
  ).bind(cutoff).run().catch(() => null);
  return r?.meta?.changes ?? 0;
}

const FINDER_COLS = `id, account_id, project_id, workflow_id, name, trades, places, source, per_day, list_id, status, status_reason,
  cursor, page_token, done_keys, day, day_added, day_searches, day_reads, next_run_at, last_run_at,
  search_id, search_version, criteria, schedule, run_days, run_hour, tz, min_confidence, verify, destination, manual_run,
  day_examined, day_rejected, live`;

export async function loadFinder(env: Env, id: string, accountId: string): Promise<FinderRow | null> {
  return env.DB.prepare(`SELECT ${FINDER_COLS} FROM crm_prospect_finders WHERE id = ? AND account_id = ?`).bind(id, accountId).first<FinderRow>();
}

export interface FinderReport { ran: number; added: number; found: number; notes: string[] }

/** The cron pass: the finders whose turn it is, one step each. */
export async function runProspectFinders(env: Env, now = new Date()): Promise<FinderReport> {
  const report: FinderReport = { ran: 0, added: 0, found: 0, notes: [] };
  const due = (await env.DB.prepare(
    `SELECT ${FINDER_COLS} FROM crm_prospect_finders WHERE status = 'active' AND (next_run_at = '' OR next_run_at <= ?) ORDER BY next_run_at LIMIT ?`,
  ).bind(now.toISOString(), FINDERS_PER_TICK).all<FinderRow>().catch(() => ({ results: [] as FinderRow[] }))).results ?? [];
  for (const f of due) {
    try {
      const r = await stepFinder(env, f, now);
      if (r.ran) report.ran++;
      report.added += r.added; report.found += r.found;
      /* A finder that is switched off is looked at again tomorrow, not every tick;
         a connection waiting for its next run day has already said when. */
      if (!r.ran && r.job !== 'waiting') await env.DB.prepare('UPDATE crm_prospect_finders SET next_run_at = ? WHERE id = ?').bind(nextRunAt(now, { kind: 'rest', why: 'limits' }), f.id).run();
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      report.notes.push(`Finder ${f.id}: ${msg}`);
      await log(env, f, 'error', msg);
      await env.DB.prepare('UPDATE crm_prospect_finders SET next_run_at = ? WHERE id = ?').bind(new Date(now.getTime() + 30 * 60_000).toISOString(), f.id).run().catch(() => undefined);
    }
  }
  /* Once an hour, keep less about the businesses connections turned away. */
  if (now.getUTCMinutes() < 5) await minimiseRejected(env, now).catch(() => 0);
  return report;
}
