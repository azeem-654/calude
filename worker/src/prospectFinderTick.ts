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

/** Leave Geoapify to people searching by hand once the install has used this much of the day. */
const GEO_SHARE = 2_000;
const FINDERS_PER_TICK = 2;

export interface FinderRow {
  id: string; account_id: string; project_id: string; workflow_id: string; name: string;
  trades: string; places: string; source: string; per_day: number; list_id: string;
  status: string; status_reason: string; cursor: number; page_token: string; done_keys: string;
  day: string; day_added: number; day_searches: number; day_reads: number;
  next_run_at: string; last_run_at: string;
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

async function saveState(env: Env, f: FinderRow, s: FinderState, extra: { status?: string; reason?: string; next?: string } = {}): Promise<void> {
  await env.DB.prepare(
    `UPDATE crm_prospect_finders SET cursor = ?, page_token = ?, done_keys = ?, day = ?, day_added = ?, day_searches = ?, day_reads = ?,
       status = ?, status_reason = ?, next_run_at = ?, last_run_at = ?, updated_at = ? WHERE id = ?`,
  ).bind(
    s.cursor, s.pageToken, JSON.stringify(s.doneKeys.slice(-500)), s.day, s.dayAdded, s.daySearches, s.dayReads,
    extra.status ?? f.status, extra.reason ?? (extra.status ? '' : f.status_reason), extra.next ?? f.next_run_at, nowIso(), nowIso(), f.id,
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
}

const EMAIL_TAG: Record<string, string> = { valid: 'verified email', domain_ok: 'email domain ok', risky: 'risky email', invalid: 'email bounces' };

export function contactOf(r: PPRow, projectId: string, now = nowIso()): Record<string, unknown> {
  const [trade, place] = r.query.split('|');
  const fields: Record<string, string> = { foundAt: r.found_at, projectId };
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
    tags: ['prospect search', 'autopilot', r.category, EMAIL_TAG[r.email_status] ?? ''].filter(Boolean),
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
async function putInContacts(env: Env, accountId: string, listId: string, projectId: string, rows: PPRow[]): Promise<PPRow[] | null> {
  if (!rows.length) return [];
  const add = rows.map(r => contactOf(r, projectId));
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

const PP_COLS = 'id, name, email, phone, website, address, category, person_name, person_role, company_number, email_status, query, found_at, source, contact_id';

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
async function addReady(env: Env, f: FinderRow, s: FinderState): Promise<number> {
  const room = s.perDay - s.dayAdded;
  if (room <= 0) return 0;
  const ready = (await env.DB.prepare(`SELECT ${PP_COLS} FROM crm_project_prospects WHERE finder_id = ? AND status = 'ready' ORDER BY found_at LIMIT ?`)
    .bind(f.id, room).all<PPRow>()).results ?? [];
  if (!ready.length) return 0;
  const done = await putInContacts(env, f.account_id, f.list_id, f.project_id, ready);
  if (!done) return 0;
  const at = nowIso();
  for (const r of done) {
    await env.DB.prepare("UPDATE crm_project_prospects SET status = 'added', contact_id = ?, added_at = ? WHERE id = ?").bind(`pf-${r.id}`, at, r.id).run();
  }
  return done.length;
}

/* ── One step ── */

async function searchStep(env: Env, f: FinderRow, s: FinderState, job: Extract<Job, { kind: 'search' }>): Promise<{ state: FinderState; detail: string; found: number }> {
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
  let fresh = 0;
  for (const p of prospects) {
    const status = isKnown(known, p) ? 'known' : 'candidate';
    const officer = p.officers?.[0];
    const r = await env.DB.prepare(
      `INSERT OR IGNORE INTO crm_project_prospects
         (id, account_id, project_id, finder_id, ref, name, email, phone, website, address, category, person_name, person_role,
          company_number, query, source, status, found_at)
       VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
    ).bind(
      rid('pp'), f.account_id, f.project_id, f.id, p.ref.slice(0, 200), p.name.slice(0, 200), (p.email || '').toLowerCase().slice(0, 190),
      (p.phone || '').slice(0, 40), (p.website || '').slice(0, 300), (p.address || '').slice(0, 300), (p.category || job.trade).slice(0, 80),
      (officer?.name ?? '').slice(0, 80), (officer?.role ?? '').slice(0, 80), (p.companyNumber ?? '').slice(0, 20),
      job.key.slice(0, 200), via, status, at,
    ).run().catch(() => null);
    if (r?.meta?.changes && status === 'candidate') fresh++;
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

export interface StepOutcome { ran: boolean; job: Job['kind'] | 'paused'; detail: string; added: number; found: number }

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

  let s = forDay(stateOf(f), today(now));
  await reconcile(env, f.account_id, f.project_id, f.list_id).catch(() => 0);

  /* Today's room first: what is already ready joins the audience before anything new is looked for. */
  let added = await addReady(env, f, s);
  s = { ...s, dayAdded: s.dayAdded + added };
  if (added) await log(env, f, 'add', `Added ${added} to the project's audience`, 0, added);

  const counts = await env.DB.prepare(
    "SELECT SUM(CASE WHEN status = 'candidate' THEN 1 ELSE 0 END) AS c, SUM(CASE WHEN status = 'ready' THEN 1 ELSE 0 END) AS r FROM crm_project_prospects WHERE finder_id = ?",
  ).bind(f.id).first<{ c: number | null; r: number | null }>();
  const job = nextJob(s, Number(counts?.c ?? 0), Number(counts?.r ?? 0));
  let detail = '';
  let found = 0;

  if (job.kind === 'search') {
    const r = await searchStep(env, f, s, job);
    s = r.state; detail = r.detail; found = r.found;
    await log(env, f, 'search', detail, found);
  } else if (job.kind === 'read') {
    const r = await readStep(env, f, s);
    s = r.state; detail = r.detail;
    await log(env, f, 'read', detail);
    const more = await addReady(env, f, s);
    s = { ...s, dayAdded: s.dayAdded + more };
    added += more;
    if (more) await log(env, f, 'add', `Added ${more} to the project's audience`, 0, more);
  } else if (job.kind === 'exhausted') {
    detail = 'Every search in the rotation has been run to its end. Add places or kinds of business to find more.';
    await saveState(env, f, s, { status: 'exhausted', reason: detail, next: nextRunAt(now, job) });
    await log(env, f, 'exhausted', detail);
    return { ran: true, job: job.kind, detail, added, found };
  } else {
    detail = job.why === 'quota' ? `Today's ${s.perDay} are in.` : `Today's limits are reached (${DAY_LIMITS.searches} searches, ${DAY_LIMITS.reads} websites).`;
  }
  await saveState(env, f, s, { next: nextRunAt(now, job) });
  return { ran: true, job: job.kind, detail, added, found };
}

const FINDER_COLS = `id, account_id, project_id, workflow_id, name, trades, places, source, per_day, list_id, status, status_reason,
  cursor, page_token, done_keys, day, day_added, day_searches, day_reads, next_run_at, last_run_at`;

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
      /* A finder that is switched off is looked at again tomorrow, not every tick. */
      if (!r.ran) await env.DB.prepare('UPDATE crm_prospect_finders SET next_run_at = ? WHERE id = ?').bind(nextRunAt(now, { kind: 'rest', why: 'limits' }), f.id).run();
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      report.notes.push(`Finder ${f.id}: ${msg}`);
      await log(env, f, 'error', msg);
      await env.DB.prepare('UPDATE crm_prospect_finders SET next_run_at = ? WHERE id = ?').bind(new Date(now.getTime() + 30 * 60_000).toISOString(), f.id).run().catch(() => undefined);
    }
  }
  return report;
}
