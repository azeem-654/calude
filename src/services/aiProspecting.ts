/**
 * AI Prospecting — the judgement that does not need a network.
 *
 * The page takes one sentence ("find dentists in Leeds with a website") and
 * runs real steps for it: a directory search, a read of each business's own
 * website for the address it published, and a check of every address found.
 * This module turns the sentence into a search, scores what came back, and
 * words the checks — pure, so `npm run test:aiprospecting` can hold it still.
 *
 * ── What it will not do ──
 *
 * Search LinkedIn, or anything else that forbids it. LinkedIn's terms forbid
 * automated collection and it pursues scrapers in court; Apollo, ZoomInfo and
 * the rest license their data per seat to the subscriber, not to a platform
 * passing it on to its own customers. The sources here are the ones whose
 * terms allow exactly this use: OpenStreetMap's directory (ODbL), Google Maps
 * on the owner's key (place ids only kept), each business's own website, and
 * — when the owner connects it — Hunter, which reports only addresses it saw
 * published, with the pages it saw them on.
 *
 * The Lead library (/lead-directory, the owner's screen; routes/leaddir.ts) is
 * separate on purpose: it is the owner's own lead files. It never feeds this page's
 * searches and is not shown beside them either — the owner decided customers
 * must not see a searchable directory of people: the platform finds
 * businesses live, it is not a data broker.
 */
import type { Contactable, FoundPerson, Prospect, Verdict, CheckStatus } from './prospects';

/* ── The sentence ─────────────────────────────────────────────────────── */

/**
 * Where a search can look. The page has no tabs for these any more: the
 * sentence says which ("registered companies", "with reviews"), and
 * `chooseSource` decides what is actually asked, given what is switched on.
 */
export type AskSource = 'free' | 'register' | 'google';

/* Named for what they give, never for who supplies them — the results name
   no supplier. `SOURCE_NAME` (services/prospects) is still the provenance
   stamp an imported contact carries. */
export const SOURCE_LABEL: Record<AskSource | 'osm', string> = {
  free: 'All businesses', osm: 'All businesses', register: 'Registered companies', google: 'With ratings & reviews',
};

export interface Ask {
  trade: string;
  place: string;
  /** Narrowing the sentence asked for, applied to the results — never sent as a search term. */
  want: { email: boolean; website: boolean; phone: boolean };
  /** Which source the sentence asked for — before anything is known about what is switched on. */
  source: AskSource;
}

const LEAD_IN = /^(?:please\s+)?(?:can you\s+|could you\s+)?(?:find|search(?:\s+for)?|look(?:\s+for)?|get|show(?:\s+me)?|list|give me|i\s+(?:want|need)|pull|build(?:\s+(?:me\s+)?a\s+list\s+of)?)\s+(?:me\s+)?(?:some\s+|all\s+(?:the\s+)?|the\s+|a\s+list\s+of\s+|\d+\s+)?/i;
const QUALIFIERS: { re: RegExp; key: keyof Ask['want'] }[] = [
  { re: /\b(?:with|that have|who have|having|and)\s+(?:an?\s+)?(?:verified\s+|published\s+|valid\s+)?e-?mails?(?:\s+address(?:es)?)?\b/i, key: 'email' },
  { re: /\b(?:with|that have|who have|having|and)\s+(?:an?\s+)?web\s*sites?\b/i, key: 'website' },
  { re: /\b(?:with|that have|who have|having|and)\s+(?:an?\s+)?(?:phone|telephone)(?:\s+numbers?)?\b/i, key: 'phone' },
];

/*
 * The words that pick a source, and are then taken out of the sentence —
 * "accountants in Leeds from Companies House" searches for accountants in
 * Leeds, not in "Leeds from Companies House". The company register is the
 * only source with directors, and Google the only one with ratings, so asking
 * for either is asking for that source.
 */
const REGISTER_WORDS: RegExp[] = [
  /\b(?:on|from|via|using|in|at)\s+(?:the\s+)?companies\s+house\b/gi,
  /\bcompanies\s+house\b/gi,
  /\b(?:on|from|via|using|in)\s+the\s+(?:company|companies)\s+register\b/gi,
  /\b(?:company|companies)\s+register\b/gi,
  /\b(?:with|and|including)\s+(?:their\s+|the\s+)?directors?(?:'?\s*names)?\b/gi,
];
/* "registered companies", "limited companies", "registered dental companies" — the words between are the trade. */
const REGISTERED = /\b(?:registered|limited|ltd\.?)\s+((?:[\p{L}&'-]+\s+){0,3}?)(?:companies|company|firms|businesses)\b/giu;
const GOOGLE_WORDS: RegExp[] = [
  /\b(?:with|and|having|that have|who have)\s+(?:good\s+|great\s+|high\s+|star\s+|google\s+)?(?:ratings?|reviews?)(?:\s+(?:and|&)\s+(?:ratings?|reviews?))?\b/gi,
  /\b(?:on|from|via|using|in)\s+google(?:\s+maps)?\b/gi,
  /\bgoogle(?:\s+maps)?\b/gi,
  /\b(?:top|highly|well|best)[\s-]rated\b/gi,
];

const squash = (t: string) => t.replace(/\(\s*\)/g, ' ').replace(/\s+/g, ' ').trim();

/**
 * The sentence read into its parts, any of which may be missing — `parseAsk`
 * is this with both parts required, `askProblem` says which one is not there.
 */
export function readAsk(text: string): Ask {
  let t = String(text ?? '').replace(/\s+/g, ' ').trim().replace(/[.?!]+$/, '');
  const want = { email: false, website: false, phone: false };
  let source: AskSource = 'free';
  /* Ratings first: "with a website and reviews" leaves "with a website" for the qualifier. */
  /* Replaced and compared, never `.test()`ed: a global pattern's test()
     remembers where it stopped, and the next sentence would start there. */
  const take = (re: RegExp, as: AskSource, by: string | ((...m: string[]) => string) = ' ') => {
    const next = t.replace(re, by as string);
    if (next !== t) { source = as; t = squash(next); }
  };
  for (const re of GOOGLE_WORDS) take(re, 'google');
  take(REGISTERED, 'register', (_m: string, mid?: string) => ` ${mid ?? ''} `);
  for (const re of REGISTER_WORDS) take(re, 'register');
  for (const q of QUALIFIERS) {
    if (q.re.test(t)) { want[q.key] = true; t = squash(t.replace(q.re, ' ')); }
  }
  t = t.replace(LEAD_IN, '').replace(/^[\s:;,\-–—()]+/, '')
    .replace(/^(?:(?:businesses|companies|firms)\s+)?(?:(?:that|which|who)\s+(?:are|is)\s+)?/i, '').trim();
  const clean = (x: string) => x.replace(/^[\s:;,\-–—()]+|[\s:;,\-–—()]+$/g, '').trim();
  let trade = '';
  let place = '';
  const only = /^(?:in|near|around|across|within)\s+(.+)$/i.exec(t);
  const m = /^(.+)\s+(?:in|near|around|across|within)\s+(.+?)$/i.exec(t);
  if (only) place = only[1];
  else if (m) { trade = m[1]; place = m[2]; } else trade = t;
  trade = clean(trade.replace(/\b(?:local|nearby)\b/gi, '').replace(/\s+/g, ' '));
  place = clean(place.replace(/\b(?:area|region|city centre|city center)\b$/i, ''));
  return { trade: trade.slice(0, 80), place: place.slice(0, 80), want, source };
}

const enough = (x: string) => x.replace(/[^\p{L}\p{N}]/gu, '').length >= 2;

/**
 * "Find dentists in Leeds with a website" → dentists · Leeds, wanting a website.
 *
 * Split at the last " in ", " near " or " around " — "builders in Stoke-on-
 * Trent" and "bed and breakfasts in Bath" both have to come out whole.
 * `null` when there is no place or no kind of business: the directory
 * searches inside a named place for a named kind, so a sentence without both
 * cannot be run, and the page asks for the missing one (`askProblem`).
 */
export function parseAsk(text: string): Ask | null {
  const a = readAsk(text);
  return enough(a.trade) && enough(a.place) ? a : null;
}

/**
 * What a sentence is missing, in words the page puts under the box — asked
 * for, rather than searched blind. Null when it can be run.
 */
export function askProblem(text: string): { field: 'trade' | 'place'; message: string; trade: string; place: string } | null {
  if (!String(text ?? '').trim()) return { field: 'trade', message: 'Say who to look for — "dentists in Leeds", "cafés near Bristol".', trade: '', place: '' };
  const a = readAsk(text);
  if (enough(a.trade) && enough(a.place)) return null;
  if (!enough(a.trade)) {
    return a.place
      ? { field: 'trade', message: `What kind of business in ${a.place}? Say it in the sentence — "dentists in ${a.place}".`, trade: '', place: a.place }
      : { field: 'trade', message: 'Say what kind of business — "dentists in Leeds", "cafés near Bristol".', trade: '', place: '' };
  }
  return { field: 'place', message: `Where should I look for ${a.trade}? Add a town or city to the sentence — "${a.trade} in Leeds".`, trade: a.trade, place: '' };
}

/** What the server says is on, in the shape `googleAvailability` answers. */
export interface SourceAvailability {
  available: boolean;
  code?: string;
  register: { available: boolean; code?: string };
}

/**
 * Which source a search actually asks, and what to say when it is not the
 * one the sentence asked for. The company register needs the owner's
 * Companies House key and ratings need Google Maps on the owner's key; with
 * either off, the search goes to the business directories and says so —
 * never a refusal for a choice the customer could not see was off.
 * `avail` null (not known yet) asks for what was asked; the server then
 * refuses by name if it must.
 */
export function chooseSource(asked: AskSource, avail: SourceAvailability | null): { source: AskSource; note: string } {
  if (asked === 'free' || !avail) return { source: asked, note: '' };
  const on = asked === 'register' ? avail.register.available : avail.available;
  if (on) return { source: asked, note: '' };
  const code = asked === 'register' ? avail.register.code : avail.code;
  const what = asked === 'register' ? 'Registered companies (the company register, with directors)' : 'Ratings and reviews';
  const why = code === 'trial_ended' ? 'stopped when the trial ended' : 'are not switched on for this app yet';
  return { source: 'free', note: `${what} ${why}, so this searches all businesses instead.` };
}

/** A sentence that reads back as this search, source included — for the box and for "Run again". */
export function askSentence(trade: string, place: string, source: AskSource | 'osm' = 'free'): string {
  const base = `${trade} in ${place}`;
  return source === 'register' ? `${base} from the company register` : source === 'google' ? `${base} with reviews` : base;
}

/** The title a run is shown under: "Dentists · Leeds". */
export const askTitle = (trade: string, place: string) =>
  `${trade.charAt(0).toUpperCase()}${trade.slice(1)} · ${place.charAt(0).toUpperCase()}${place.slice(1)}`;

/* ── Which address, and whose ─────────────────────────────────────────── */

/**
 * Every address known for a business, best first: the one on the map, the
 * ones its own website publishes, then the people Hunter saw published.
 */
export function addressesOf(p: Prospect, found: Record<string, Contactable>): string[] {
  const c = found[p.website];
  const all = [p.email, ...(c?.emails ?? []), ...(c?.people ?? []).map(x => x.email)].map(e => String(e ?? '').toLowerCase()).filter(Boolean);
  return [...new Set(all)];
}

/**
 * The address to use — the first that a check has not shown to be dead. A
 * business whose only address bounced is imported without one, rather than
 * with an address the checks already said would not arrive.
 */
export function bestAddress(p: Prospect, found: Record<string, Contactable>, checks: Record<string, Verdict>): string {
  return addressesOf(p, found).find(e => checks[e]?.status !== 'invalid') ?? '';
}

export function personFor(p: Prospect, found: Record<string, Contactable>, email: string): FoundPerson | null {
  if (!email) return null;
  return found[p.website]?.people?.find(x => x.email === email && x.type === 'personal' && x.name) ?? null;
}

/* ── The score ────────────────────────────────────────────────────────── */

/**
 * How reachable a lead is, out of 100 — and nothing else.
 *
 * It is not a prediction that they will buy, and it does not pretend to be:
 * every point is something on the row, and `SCORE_RULE` is shown beside the
 * column so anybody can add it up themselves.
 */
export const SCORE_RULE = 'Reachability: a verified email 40 (an unchecked or domain-only one 25, a risky one 10), a phone 20, a website 15, a named person 15, rated 4★ or more on Google 10.';

export function leadScore(p: Prospect, email: string, v: Verdict | undefined, person: FoundPerson | null): number {
  let s = 0;
  if (email) s += !v ? 25 : v.status === 'valid' ? 40 : v.status === 'domain_ok' || v.status === 'unknown' ? 25 : v.status === 'risky' ? 10 : 0;
  if (p.phone) s += 20;
  if (p.website) s += 15;
  if (person) s += 15;
  if (typeof p.rating === 'number' && p.rating >= 4) s += 10;
  return Math.min(100, s);
}

/* ── What a check found, in words ─────────────────────────────────────── */

export const STATUS_LABEL: Record<CheckStatus, string> = {
  valid: 'Contact verified',
  domain_ok: 'Contact checked',
  risky: 'Risky',
  invalid: 'Invalid',
  unknown: 'Not checked',
};

/*
 * "Contact verified" only for a mailbox a verifier said will take the mail;
 * a domain-level check — format, domain, mail server — is "Contact checked".
 * Calling the second "verified" would tell somebody an address cannot bounce
 * when nobody asked the mailbox. Both carry the day they were checked.
 */
export function checkLabel(v: Verdict): string {
  const day = v.checkedAt ? ` · ${new Date(v.checkedAt).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' })}` : '';
  if (v.status === 'valid') return `Contact verified${day}`;
  if (v.status === 'domain_ok') return `Contact checked${day}`;
  return `${STATUS_LABEL[v.status]}${v.status === 'unknown' ? '' : day}`;
}

const REASONS: Record<string, string> = {
  mailbox_exists: 'The mail server confirmed this mailbox exists.',
  mailbox_not_checked: 'The domain takes mail. The mailbox itself was not checked — connect a verifier for that.',
  bad_syntax: 'This is not a well-formed address.',
  no_domain: 'This domain does not exist.',
  null_mx: 'This domain says it accepts no email.',
  no_mail_server: 'This domain has no mail server.',
  no_mx: 'This domain has no mail server record; mail may still reach it, but often does not.',
  dns_failed: 'The domain could not be looked up just now — try again.',
  disposable: 'A throwaway inbox. Somebody reading it next week is unlikely.',
  catch_all: 'This domain accepts mail for any name, so this mailbox cannot be confirmed either way.',
  mailbox_missing: 'The mail server says this mailbox does not exist. Sending to it would bounce.',
  spam_trap: 'A known spam trap. Never send to it.',
  complainer: 'This address is known for reporting mail as spam.',
  role: 'A role inbox (info@, sales@) — fine for a business, read by whoever is on duty.',
  server_did_not_answer: 'The mail server would not say whether this mailbox exists.',
  verifier_failed: 'The verifier could not be asked just now.',
  risky: 'The verifier could not confirm it.',
};

export function verdictSentence(v: Verdict): string {
  const base = REASONS[v.reason] ?? (v.status === 'invalid' ? 'This address would bounce.' : 'Could not be confirmed.');
  const extra = [v.role && v.reason !== 'role' && 'A role inbox.', v.free && 'Personal webmail, not a company domain.'].filter(Boolean).join(' ');
  return `${base}${extra ? ` ${extra}` : ''}`;
}

/* ── Export ───────────────────────────────────────────────────────────── */

const cell = (s: unknown) => {
  const t = String(s ?? '');
  /* A leading = + - @ is a formula to a spreadsheet; prefixing a quote keeps a
     business called "=HYPERLINK(...)" from running when somebody opens it. */
  const safe = /^[=+\-@\t\r]/.test(t) ? `'${t}` : t;
  return /[",\n]/.test(safe) ? `"${safe.replace(/"/g, '""')}"` : safe;
};

export function toCsv(rows: { p: Prospect; email: string; v?: Verdict; person: FoundPerson | null; score: number }[]): string {
  const head = ['Business', 'Category', 'Address', 'Phone', 'Website', 'Email', 'Email check', 'Contact name', 'Contact role', 'Score'];
  const lines = rows.map(r => [
    r.p.name, r.p.category, r.p.address, r.p.phone, r.p.website, r.email,
    r.v ? STATUS_LABEL[r.v.status] : r.email ? 'Not checked' : '', r.person?.name ?? '', r.person?.position ?? '', r.score,
  ].map(cell).join(','));
  return [head.join(','), ...lines].join('\r\n');
}

/** "3 min ago", "2 h", "yesterday" — for the run list. */
export function ago(iso: string, now = Date.now()): string {
  const m = Math.max(0, Math.round((now - Date.parse(iso)) / 60_000));
  if (!Number.isFinite(m)) return '';
  if (m < 1) return 'now';
  if (m < 60) return `${m}m`;
  const h = Math.round(m / 60);
  if (h < 24) return `${h}h`;
  const d = Math.round(h / 24);
  return d === 1 ? '1d' : `${d}d`;
}

/* ── Neighbouring audiences ── */

const RELATED: [RegExp, string[]][] = [
  [/real estate|realtor|estate agent/, ['real estate brokers', 'property managers', 'mortgage brokers', 'home inspectors']],
  [/dent/, ['orthodontists', 'dental clinics', 'opticians', 'physiotherapists']],
  [/caf|coffee/, ['bakeries', 'restaurants', 'delis', 'tea rooms']],
  [/account|bookkeep/, ['financial advisers', 'solicitors', 'mortgage brokers', 'insurance brokers']],
  [/hair|salon|barber/, ['barbers', 'beauty salons', 'nail salons', 'spas']],
  [/plumb/, ['electricians', 'heating engineers', 'builders', 'roofers']],
  [/restaurant/, ['cafés', 'pubs', 'takeaways', 'hotels']],
  [/gym|fitness/, ['personal trainers', 'yoga studios', 'physiotherapists', 'sports shops']],
  [/lawyer|solicitor|attorney/, ['accountants', 'financial advisers', 'estate agents', 'insurance brokers']],
  [/contractor|builder|construction/, ['roofers', 'electricians', 'plumbers', 'architects']],
  [/propert|real estate|realt|estate agent/, ['real estate agents', 'property managers', 'mortgage brokers', 'insurance agencies']],
];

/**
 * "commercial properties in virginia" typed or heard as one kind of business
 * is a kind of business and a place. Searched whole it is a trade no
 * directory has — the wizard once did exactly that, on a whole state, and
 * timed out in front of the customer.
 */
export function splitTradePlace(trade: string): { trade: string; place: string } {
  const m = /^(.+?)\s+(?:in|near|around|across|throughout)\s+(.{2,})$/i.exec(trade.trim());
  if (!m) return { trade: trade.trim(), place: '' };
  const place = m[2].trim().replace(/\b\p{Ll}/gu, c => c.toUpperCase());
  return { trade: m[1].trim(), place };
}

/**
 * Other kinds of business worth trying beside `trade` — suggestions only: the
 * customer picks which, because a related audience is a judgement about what
 * they sell, not something to assume.
 */
export function relatedTrades(trade: string): string[] {
  const t = trade.toLowerCase();
  return (RELATED.find(([re]) => re.test(t))?.[1] ?? []).filter(x => x !== t);
}

/**
 * The place in a sentence like "sell to real estate agents in Virginia and …":
 * the capitalised words after in/across/around/near. Capitals, because "in
 * person" and "in bulk" are not places.
 */
/* States, nations and provinces, for a request typed in lower case —
   "realtors in virginia". Names only; the Worker's lib/regions.ts has their
   towns. Capitals are otherwise required, because "in person" is not a place. */
const REGIONS = 'alabama|alaska|arizona|arkansas|california|colorado|connecticut|delaware|florida|georgia|hawaii|idaho|illinois|indiana|iowa|kansas|kentucky|louisiana|maine|maryland|massachusetts|michigan|minnesota|mississippi|missouri|montana|nebraska|nevada|new hampshire|new jersey|new mexico|new york|north carolina|north dakota|ohio|oklahoma|oregon|pennsylvania|rhode island|south carolina|south dakota|tennessee|texas|utah|vermont|virginia|washington|west virginia|wisconsin|wyoming|england|scotland|wales|northern ireland|ontario|quebec|british columbia|alberta|new south wales|victoria|queensland|western australia|south australia';
const REGION_RE = new RegExp(`\\b(?:in|across|around|near|throughout)\\s+(${REGIONS})\\b`, 'i');

export function placeIn(text: string): string | null {
  const m = /\b(?:in|across|around|near|throughout)\s+((?:[A-Z][\p{L}.'-]+)(?:(?:,\s*|\s+)(?:[A-Z][\p{L}.'-]+)){0,3})/u.exec(text);
  if (!m) {
    const r = REGION_RE.exec(text);
    return r ? r[1].replace(/\b\p{Ll}/gu, c => c.toUpperCase()) : null;
  }
  /* The sentence's own full stop is not part of the place ("in Dallas."),
     an abbreviation's is ("Washington D.C."). */
  /* A full stop after a lower-case letter ends the sentence, so whatever
     follows is the next sentence, not more of the place: "in Miami, Florida.
     The clinic…" was read as "Miami, Florida. The". */
  const p = m[1].split(/(?<=\p{Ll})\.\s/u)[0]
    .replace(/(?:,\s*|\s+)(?:And|With|To|For|The|We|Our|My|I|It|They|This|That)$/, '').trim().replace(/(?<=\p{Ll})\.+$/u, '');
  return p.length >= 2 ? p : null;
}

/**
 * Who a "sell … to X" sentence is selling to — the audience, which must not be
 * mistaken for the customer's own trade. "Sell my software to real estate
 * agents" is not a real-estate business.
 */
export function sellingTo(text: string): string | null {
  const m = /\b(?:sell|selling|market|marketing|pitch|offer|offering)\b[^.]*?\bto\s+([a-z][a-z0-9&' -]{2,60}?)(?=\s+(?:in|near|around|across|throughout|and|who|that|with|so)\b|[.,;!?]|$)/i.exec(text);
  if (!m) return null;
  const phrase = m[1].trim().replace(/^(the|some|more|local)\s+/i, '');
  if (!phrase || phrase.split(/\s+/).length > 6 || /^(them|it|us|me|people|customers|clients|businesses)$/i.test(phrase)) return null;
  return phrase;
}
