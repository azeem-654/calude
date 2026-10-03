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
 */
import type { Contactable, FoundPerson, Prospect, Verdict, CheckStatus } from './prospects';

/* ── The sentence ─────────────────────────────────────────────────────── */

export interface Ask {
  trade: string;
  place: string;
  /** Narrowing the sentence asked for, applied to the results — never sent as a search term. */
  want: { email: boolean; website: boolean; phone: boolean };
}

const LEAD_IN = /^(?:please\s+)?(?:can you\s+|could you\s+)?(?:find|search(?:\s+for)?|look(?:\s+for)?|get|show(?:\s+me)?|list|give me|i\s+(?:want|need)|pull|build(?:\s+(?:me\s+)?a\s+list\s+of)?)\s+(?:me\s+)?(?:some\s+|all\s+(?:the\s+)?|the\s+|a\s+list\s+of\s+|\d+\s+)?/i;
const QUALIFIERS: { re: RegExp; key: keyof Ask['want'] }[] = [
  { re: /\b(?:with|that have|who have|having|and)\s+(?:an?\s+)?(?:verified\s+|published\s+|valid\s+)?e-?mails?(?:\s+address(?:es)?)?\b/i, key: 'email' },
  { re: /\b(?:with|that have|who have|having|and)\s+(?:an?\s+)?web\s*sites?\b/i, key: 'website' },
  { re: /\b(?:with|that have|who have|having|and)\s+(?:an?\s+)?(?:phone|telephone)(?:\s+numbers?)?\b/i, key: 'phone' },
];

/**
 * "Find dentists in Leeds with a website" → dentists · Leeds, wanting a website.
 *
 * Split at the last " in ", " near " or " around " — "builders in Stoke-on-
 * Trent" and "bed and breakfasts in Bath" both have to come out whole.
 * `null` when there is no place: the directory searches inside a named place,
 * so a sentence without one cannot be run and the page asks for one.
 */
export function parseAsk(text: string): Ask | null {
  let t = String(text ?? '').replace(/\s+/g, ' ').trim().replace(/[.?!]+$/, '');
  const want = { email: false, website: false, phone: false };
  for (const q of QUALIFIERS) {
    if (q.re.test(t)) { want[q.key] = true; t = t.replace(q.re, ' ').replace(/\s+/g, ' ').trim(); }
  }
  t = t.replace(LEAD_IN, '').replace(/^(?:businesses|companies)\s+(?:that\s+are\s+|which\s+are\s+)?/i, '').trim();
  const m = /^(.+)\s+(?:in|near|around|across|within)\s+(.+?)$/i.exec(t);
  if (!m) return null;
  const trade = m[1].replace(/\b(?:local|nearby)\b/gi, '').replace(/\s+/g, ' ').trim();
  const place = m[2].replace(/\b(?:area|region|city centre|city center)\b$/i, '').trim();
  if (trade.replace(/[^\p{L}\p{N}]/gu, '').length < 2 || place.replace(/[^\p{L}\p{N}]/gu, '').length < 2) return null;
  return { trade: trade.slice(0, 80), place: place.slice(0, 80), want };
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
  valid: 'Verified',
  domain_ok: 'Domain OK',
  risky: 'Risky',
  invalid: 'Invalid',
  unknown: 'Not checked',
};

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
