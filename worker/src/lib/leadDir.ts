/**
 * The owner's lead directory — people the install owner holds and lets
 * customers search (routes/leaddir.ts, docs/LEAD-DIRECTORY.md).
 *
 * ── Its own database ──
 *
 * The directory is millions of rows (the owner's first load is ~6 GB of CSV)
 * and lives in a D1 database of its own, bound as `LEADS`. In the product's
 * database it would share a 10 GB ceiling with every customer's CRM, and a
 * full D1 refuses *every* write — sign-ins, sends and saves would start
 * failing because somebody imported a spreadsheet. Unbound (the deploy could
 * not create it), the directory says so and nothing else is touched.
 *
 * The schema is made here, on first use, rather than by migrations: it is a
 * second database with nothing else in it, and the workflows only have to
 * make sure it exists (scripts/leads-db.mjs).
 *
 * Everything in this file but `ensureSchema` is pure, so
 * `npm run test:leaddir` can hold it still.
 */
import { regionNamed, splitPlace } from './regions';

export const SCHEMA = [
  `CREATE TABLE IF NOT EXISTS ld_people (
    id INTEGER PRIMARY KEY,
    dedupe TEXT NOT NULL UNIQUE,
    name TEXT NOT NULL, title TEXT, level TEXT, department TEXT,
    company TEXT, website TEXT, domain TEXT, email TEXT, phone TEXT, linkedin TEXT,
    industry TEXT, city TEXT, state TEXT, country TEXT, postal TEXT,
    size TEXT, revenue TEXT, founded TEXT, keywords TEXT,
    ind_k TEXT, st_k TEXT, ct_k TEXT, co_k TEXT, title_k TEXT,
    has_email INTEGER NOT NULL DEFAULT 0,
    import_id TEXT, added_at TEXT NOT NULL)`,
  'CREATE INDEX IF NOT EXISTS ld_people_geo ON ld_people(co_k, st_k, ind_k)',
  'CREATE INDEX IF NOT EXISTS ld_people_ind ON ld_people(ind_k, st_k)',
  'CREATE INDEX IF NOT EXISTS ld_people_city ON ld_people(ct_k)',
  'CREATE INDEX IF NOT EXISTS ld_people_import ON ld_people(import_id)',
  /* Counts per industry, state, country, level and size, kept as rows are
     added and removed — a GROUP BY over millions of rows would outrun D1's
     time limit on every page load. */
  `CREATE TABLE IF NOT EXISTS ld_facets (kind TEXT NOT NULL, value TEXT NOT NULL, label TEXT NOT NULL,
    n INTEGER NOT NULL DEFAULT 0, PRIMARY KEY (kind, value))`,
  `CREATE TABLE IF NOT EXISTS ld_imports (id TEXT PRIMARY KEY, file_key TEXT NOT NULL, name TEXT, label TEXT,
    size INTEGER, bytes_done INTEGER NOT NULL DEFAULT 0, rows_seen INTEGER NOT NULL DEFAULT 0,
    rows_added INTEGER NOT NULL DEFAULT 0, rows_dup INTEGER NOT NULL DEFAULT 0, rows_bad INTEGER NOT NULL DEFAULT 0,
    status TEXT NOT NULL, error TEXT, started_at TEXT NOT NULL, updated_at TEXT NOT NULL, finished_at TEXT)`,
  'CREATE INDEX IF NOT EXISTS ld_imports_key ON ld_imports(file_key)',
  /* A person removed on request stays out: a later import of the same file
     must not bring them back. */
  'CREATE TABLE IF NOT EXISTS ld_removed (dedupe TEXT PRIMARY KEY, at TEXT NOT NULL)',
  /* Who has seen whose details — the allowance, and why seeing the same
     person twice costs nothing. */
  `CREATE TABLE IF NOT EXISTS ld_reveals (account_id TEXT NOT NULL, person_id INTEGER NOT NULL, at TEXT NOT NULL,
    PRIMARY KEY (account_id, person_id))`,
  'CREATE INDEX IF NOT EXISTS ld_reveals_at ON ld_reveals(account_id, at)',
  'CREATE TABLE IF NOT EXISTS ld_meta (k TEXT PRIMARY KEY, v TEXT)',
];

let schemaReady: D1Database | null = null;
/** Once per isolate per database. */
export async function ensureSchema(db: D1Database): Promise<void> {
  if (schemaReady === db) return;
  await db.batch(SCHEMA.map(s => db.prepare(s)));
  schemaReady = db;
}

/** Rows per import request: under D1's thousand statements per invocation with room for the counters. */
export const ROWS_PER_BATCH = 500;

/**
 * What a customer may see each day and month, on the owner's directory.
 * Searching is free; the allowance is spent on seeing a person's address,
 * phone and profile — otherwise the whole directory is one script away.
 */
export const REVEAL_BUDGET = { day: 200, month: 2000 };

/* ── One row, as it is kept ─────────────────────────────────────────────── */

export interface LeadIn {
  name?: unknown; first?: unknown; last?: unknown; title?: unknown; level?: unknown; department?: unknown;
  company?: unknown; website?: unknown; email?: unknown; phone?: unknown; linkedin?: unknown;
  industry?: unknown; city?: unknown; state?: unknown; country?: unknown; postal?: unknown;
  size?: unknown; revenue?: unknown; founded?: unknown; keywords?: unknown;
}

export interface Lead {
  dedupe: string;
  name: string; title: string; level: string; department: string;
  company: string; website: string; domain: string; email: string; phone: string; linkedin: string;
  industry: string; city: string; state: string; country: string; postal: string;
  size: string; revenue: string; founded: string; keywords: string;
  ind_k: string; st_k: string; ct_k: string; co_k: string; title_k: string; has_email: number;
}

/** Every column is text of a bounded length; anything else becomes empty, never an error. */
const txt = (v: unknown, max: number) => String(v ?? '').replace(/[\u0000-\u001f\u007f]+/g, ' ').replace(/\s+/g, ' ').trim().slice(0, max);
export const key = (s: string) => s.toLowerCase().normalize('NFKD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]+/g, ' ').trim();
const EMAIL = /^[a-z0-9._%+'-]+@[a-z0-9.-]+\.[a-z]{2,24}$/;
const COUNTRY_ALIAS: Record<string, string> = { usa: 'united states', us: 'united states', 'u s': 'united states', 'u s a': 'united states', 'united states of america': 'united states', uk: 'united kingdom', 'great britain': 'united kingdom', england: 'united kingdom' };

export function siteOf(raw: string): { website: string; domain: string } {
  let s = raw.trim();
  if (!s) return { website: '', domain: '' };
  if (!/^https?:\/\//i.test(s)) s = `https://${s}`;
  try {
    const u = new URL(s);
    if (!/\./.test(u.hostname)) return { website: '', domain: '' };
    return { website: `${u.protocol}//${u.hostname}${u.pathname === '/' ? '' : u.pathname}`.slice(0, 200), domain: u.hostname.replace(/^www\./, '').toLowerCase() };
  } catch { return { website: '', domain: '' }; }
}

/** A row as the browser sent it → as it is kept, or null when there is nobody in it. */
export function normalise(r: LeadIn): Lead | null {
  let name = txt(r.name, 120);
  if (!name) name = txt(`${txt(r.first, 60)} ${txt(r.last, 60)}`, 120);
  const company = txt(r.company, 160);
  const emailRaw = txt(r.email, 160).toLowerCase().replace(/^mailto:/, '');
  const email = EMAIL.test(emailRaw) ? emailRaw : '';
  if (!name && !email) return null;
  const site = siteOf(txt(r.website, 300));
  const domain = site.domain || (email ? email.split('@')[1] : '');
  const country = txt(r.country, 60);
  const state = txt(r.state, 60);
  const city = txt(r.city, 80);
  const title = txt(r.title, 160);
  let co = key(country);
  co = COUNTRY_ALIAS[co] ?? co;
  /* A US state written as its code ("FL") is kept under its name, so a
     search for Florida finds both. */
  const region = state ? regionNamed(state) : null;
  const st = region ? key(region.name) : key(state);
  const linkedin = txt(r.linkedin, 200);
  return {
    dedupe: email || `n:${key(name)}|${domain || key(company)}`,
    name: name || email, title, level: txt(r.level, 40), department: txt(r.department, 80),
    company, website: site.website, domain, email, phone: txt(r.phone, 40),
    linkedin: /^https?:\/\/([a-z]+\.)?linkedin\.com\//i.test(linkedin) ? linkedin : '',
    industry: txt(r.industry, 80), city, state: region ? region.name : state, country, postal: txt(r.postal, 12),
    size: txt(r.size, 40), revenue: txt(r.revenue, 30), founded: txt(r.founded, 4).replace(/\D/g, ''), keywords: txt(r.keywords, 240),
    ind_k: key(txt(r.industry, 80)), st_k: st, ct_k: key(city), co_k: co, title_k: key(title), has_email: email ? 1 : 0,
  };
}

/** The columns written, in order — `insertSql` and `insertArgs` must agree. */
export const COLS = ['dedupe', 'name', 'title', 'level', 'department', 'company', 'website', 'domain', 'email', 'phone', 'linkedin',
  'industry', 'city', 'state', 'country', 'postal', 'size', 'revenue', 'founded', 'keywords',
  'ind_k', 'st_k', 'ct_k', 'co_k', 'title_k', 'has_email'] as const;

/** One person, unless they are already there or were removed on request. */
export const insertSql = `INSERT OR IGNORE INTO ld_people (${COLS.join(', ')}, import_id, added_at)
  SELECT ${COLS.map(() => '?').join(', ')}, ?, ? WHERE NOT EXISTS (SELECT 1 FROM ld_removed WHERE dedupe = ?)`;
export const insertArgs = (l: Lead, importId: string, at: string) => [...COLS.map(c => l[c]), importId, at, l.dedupe];

/** The counters a row adds to (or takes from): kind, value, label. */
export function facetsOf(l: Pick<Lead, 'ind_k' | 'industry' | 'st_k' | 'state' | 'co_k' | 'country' | 'level' | 'size'>): [string, string, string][] {
  const out: [string, string, string][] = [];
  if (l.ind_k) out.push(['industry', l.ind_k, l.industry]);
  if (l.st_k) out.push(['state', `${l.co_k}|${l.st_k}`, l.state]);
  if (l.co_k) out.push(['country', l.co_k, l.country]);
  if (l.level) out.push(['level', key(l.level), l.level]);
  if (l.size) out.push(['size', key(l.size), l.size]);
  return out;
}

/* ── A search ────────────────────────────────────────────────────────────── */

/* A job title as people type it → the words it is written with in the data. */
const TITLE_WORDS: Record<string, string[]> = {
  ceo: ['ceo', 'chief executive'], cfo: ['cfo', 'chief financial'], cto: ['cto', 'chief technology'], coo: ['coo', 'chief operating'],
  cmo: ['cmo', 'chief marketing'], founder: ['founder'], owner: ['owner'], president: ['president'], vp: ['vp', 'vice president'],
  md: ['managing director'], partner: ['partner'], director: ['director'], manager: ['manager'], broker: ['broker'], agent: ['agent'],
};

export function titleTerms(q: string): string[] {
  const k = key(q);
  if (!k) return [];
  const parts = k.split(/\s*(?:\bor\b|,)\s*/).map(s => s.trim()).filter(Boolean);
  const out = new Set<string>();
  for (const p of parts.length ? parts : [k]) for (const w of TITLE_WORDS[p] ?? [p]) out.add(w);
  return [...out].slice(0, 8);
}

/** Words that say "a business" rather than which one — dropped before reading what is left as a role. */
const GENERIC = new Set(['business', 'businesses', 'company', 'companies', 'firm', 'firms', 'people', 'person', 'persons', 'contacts', 'leads', 'decision', 'makers', 'maker', 'the', 'of', 'and', 'small', 'local', 'all']);

/** "business owners" → ["owner"]; "CEOs and founders" → ["ceo", "chief executive", "founder"]. Empty when nothing is a role. */
export function roleTerms(q: string): string[] {
  const words = key(q).split(' ').filter(w => w && !GENERIC.has(w)).map(w => (w.length > 3 && /[^s]s$/.test(w) ? w.slice(0, -1) : w));
  const out = new Set<string>();
  for (const w of words) for (const t of TITLE_WORDS[w] ?? []) out.add(t);
  return [...out].slice(0, 8);
}

export interface Where { sql: string; args: (string | number)[]; note: string }

/**
 * A place as typed → the columns it names. "Tampa, Florida" is a city in a
 * state; "Florida" or "FL" a state; "United States" a country; anything else
 * a city. Matched against what is in the directory, so the screen can say
 * when a place is not there rather than show an empty table.
 */
export function placeWhere(place: string, states: Set<string>, countries: Set<string>): Where {
  const p = place.trim();
  if (!p) return { sql: '', args: [], note: '' };
  let co = key(p);
  co = COUNTRY_ALIAS[co] ?? co;
  if (countries.has(co)) return { sql: 'co_k = ?', args: [co], note: '' };
  const region = regionNamed(p);
  if (region) return { sql: 'st_k = ?', args: [key(region.name)], note: '' };
  if (states.has(key(p))) return { sql: 'st_k = ?', args: [key(p)], note: '' };
  const sp = splitPlace(p);
  if (sp.region) return { sql: 'ct_k = ? AND st_k = ?', args: [key(sp.town), key(sp.region)], note: '' };
  const [town, rest] = p.split(',').map(s => s.trim());
  if (rest) {
    let r = key(rest); r = COUNTRY_ALIAS[r] ?? r;
    if (countries.has(r)) return { sql: 'ct_k = ? AND co_k = ?', args: [key(town), r], note: '' };
    if (states.has(r)) return { sql: 'ct_k = ? AND st_k = ?', args: [key(town), r], note: '' };
  }
  return { sql: 'ct_k = ?', args: [key(town)], note: '' };
}

/** "dentist" → the industries in the directory that contain it, most-populated first. */
export function industriesLike(q: string, facets: { value: string; n: number }[]): string[] {
  const k = key(q).replace(/s\b/g, '');
  if (!k) return [];
  const words = k.split(' ').filter(w => w.length > 1);
  return facets
    .filter(f => words.every(w => f.value.includes(w)))
    .sort((a, b) => b.n - a.n)
    .slice(0, 40)
    .map(f => f.value);
}

/* ── What a customer sees before spending their allowance ───────────────── */

export function maskEmail(e: string): string {
  if (!e) return '';
  const [u, d] = e.split('@');
  return `${u.slice(0, 1)}${'•'.repeat(Math.min(6, Math.max(3, u.length - 1)))}@${d}`;
}
export function maskPhone(p: string): string {
  if (!p) return '';
  let seen = 0;
  const digits = p.replace(/\D/g, '').length;
  /* The area code stays — it says where — and the rest is hidden. */
  return p.replace(/\d/g, d => (++seen <= Math.min(3, digits - 4) ? d : '•'));
}
