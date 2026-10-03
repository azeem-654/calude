/**
 * Turning found businesses into contacts — once each — and remembering what
 * was searched for.
 *
 * Pure apart from the recent-searches store at the bottom, so the rules that
 * decide "is this somebody we already have?" can be argued with in a test
 * rather than discovered in a customer's Contacts as two Leeds Dental 1s.
 *
 * ── Why dedupe here and not in the store ──
 *
 * `bulkImportContacts` appends whatever it is given, which is right for a
 * spreadsheet somebody chose to import. A prospect search is different: the
 * same dentist comes back from every search of that town, and somebody who
 * searches on Monday and again on Thursday has not found a second dentist.
 * So an import is split first into the new and the already-known, and the
 * already-known are put on the list rather than created again.
 */
import type { Contact } from '../types';
import type { Prospect, ProspectSource, Contactable, Verdict } from './prospects';
import { bestAddress, personFor } from './aiProspecting';

/** What the shown results were searched for, as the search form had it. */
export interface Searched { source: ProspectSource; trade: string; place: string }

/** Where a row came from, in the words that go on its `source` stamp. */
export function sourceLabel(answered: ProspectSource | ''): string {
  return answered === 'google' ? 'Google Maps'
    : answered === 'free' ? 'Business directory (OpenStreetMap via Geoapify)'
      : answered === 'register' ? 'Company register (Companies House)'
        : 'OpenStreetMap';
}

/**
 * The address a prospect will be imported with: published on the map, on its
 * own site, or by a named person Hunter saw published — the first of those a
 * check has not shown to be dead.
 */
export function emailOf(p: Prospect, found: Record<string, Contactable>, checks: Record<string, Verdict> = {}): string {
  return bestAddress(p, found, checks);
}

/**
 * The tag an address's check puts on the contact, so "verified emails only"
 * is one click in Contacts and an audience rule anywhere. Nothing for an
 * address that was never checked — no tag is not the same as a bad one.
 */
export const EMAIL_TAGS = new Set(['verified email', 'email domain ok', 'risky email', 'email bounces']);
export function emailTag(v: Verdict | undefined): string {
  if (!v) return '';
  return v.status === 'valid' ? 'verified email'
    : v.status === 'domain_ok' ? 'email domain ok'
      : v.status === 'risky' ? 'risky email'
        : v.status === 'invalid' ? 'email bounces' : '';
}

/**
 * The contacts these prospects would become.
 *
 * Status `prospect`, always — these are strangers, and that one field is what
 * every sending rule downstream reads (contactLists.listKindOf, the planner's
 * audience pass, the campaign wizard's warning).
 */
export function prospectRows(
  chosen: Prospect[], answered: ProspectSource | '', searched: Searched | null,
  found: Record<string, Contactable>, now = new Date().toISOString(), checks: Record<string, Verdict> = {},
): Omit<Contact, 'id'>[] {
  const from = sourceLabel(answered);
  const what = searched ? `${searched.trade} in ${searched.place}` : '';
  return chosen.map(p => {
    const email = emailOf(p, found, checks);
    const v = email ? checks[email] : undefined;
    const person = personFor(p, found, email);
    /* What the check said travels with the contact, so a campaign later can
       leave out the ones that were never more than "the domain takes mail". */
    const fields: Record<string, string> = {
      ...(answered === 'google' && p.placeId ? { googlePlaceId: p.placeId } : {}),
      ...(v ? { emailStatus: v.status, emailCheck: v.level, emailCheckedAt: v.checkedAt } : {}),
      ...(p.companyNumber ? { companyNumber: p.companyNumber } : {}),
    };
    /* With no named person behind the address, the register's first serving
       director is the person to write to — named by law, and current. */
    const officer = !person && p.officers?.length ? p.officers[0] : null;
    const who = person ? { name: person.name, role: person.position } : officer ? { name: officer.name, role: officer.role } : null;
    return {
      name: p.name,
      email,
      phone: p.phone,
      status: 'prospect',
      /* Tagged with where and what, because a list of 40 businesses with no
         label is unusable a week later. */
      tags: ['prospect search', p.category, emailTag(v), p.companyNumber ? 'company register' : ''].filter(Boolean),
      /* The stamp says what made the row, so a list full of found businesses
         can still be told apart from people who asked to hear from you — which
         is the distinction the sending rules turn on. */
      source: `${from} · ${what}`,
      createdAt: now,
      lastActivity: now,
      value: 0,
      company: p.name,
      website: p.website,
      address: p.address,
      /* A named person Hunter saw published goes on as the person to write to;
         the row stays the business, so dedupe by name still finds it. */
      ...(who ? { firstName: who.name.split(' ')[0], lastName: who.name.split(' ').slice(1).join(' ') || undefined, jobTitle: who.role || undefined } : {}),
      /* The place id is the part of a Google answer that may be kept, and the
         one that finds this business on Google again. Only Google results carry
         one; the free directory's ids are its own and are not stored. */
      ...(Object.keys(fields).length ? { customFields: fields } : {}),
    };
  });
}

const norm = (s?: string) => String(s ?? '').toLowerCase().replace(/&/g, 'and').replace(/[^\p{L}\p{N}]+/gu, ' ').trim();
const digits = (s?: string) => {
  const d = String(s ?? '').replace(/\D/g, '');
  /* The last nine digits, so "0113 555 0101" and "+44 113 555 0101" agree. */
  return d.length >= 7 ? d.slice(-9) : '';
};
const host = (s?: string) => {
  const t = String(s ?? '').trim().toLowerCase();
  if (!t) return '';
  try { return new URL(/^https?:\/\//.test(t) ? t : `https://${t}`).hostname.replace(/^www\./, ''); } catch { return ''; }
};

/**
 * The contact this row already is, if any.
 *
 * Same email; or the same Google place; or the same name *and* the same phone
 * or website. A name alone is not enough — there is a "Smile Dental" in every
 * town, and merging two of them would put one business's replies on another's
 * record.
 */
export function sameBusiness(row: Omit<Contact, 'id'> | Contact, c: Contact | Omit<Contact, 'id'>): boolean {
  const e1 = String(row.email ?? '').trim().toLowerCase();
  if (e1 && e1 === String(c.email ?? '').trim().toLowerCase()) return true;
  const p1 = row.customFields?.googlePlaceId;
  if (p1 && p1 === c.customFields?.googlePlaceId) return true;
  const n1 = norm(row.name || row.company);
  if (!n1 || n1 !== norm(c.name || c.company)) return false;
  const ph = digits(row.phone);
  if (ph && ph === digits(c.phone)) return true;
  const h = host(row.website);
  return !!h && h === host(c.website);
}

export interface ImportPlan {
  /** Rows to create. */
  fresh: Omit<Contact, 'id'>[];
  /** Rows that are somebody already in Contacts, with any blanks this search can fill. */
  known: { contact: Contact; fill: Partial<Contact> }[];
  /** Rows ticked twice in one import (the same business from two pages). */
  repeats: number;
}

/**
 * Split an import into what is new and who is already here.
 *
 * An existing contact is never overwritten — a phone number somebody typed in
 * after a call is worth more than the one on a map. Only an empty field is
 * filled, so a second search that found the email the first could not is not
 * wasted.
 */
export function planImport(rows: Omit<Contact, 'id'>[], contacts: Contact[], checks: Record<string, Verdict> = {}): ImportPlan {
  const fresh: Omit<Contact, 'id'>[] = [];
  const known = new Map<string, { contact: Contact; fill: Partial<Contact> }>();
  let repeats = 0;
  for (const row of rows) {
    const hit = contacts.find(c => sameBusiness(row, c));
    if (hit) {
      const was = known.get(hit.id);
      const fill: Partial<Contact> = { ...(was?.fill ?? {}) };
      if (!hit.email && row.email && !fill.email) fill.email = row.email;
      if (!hit.phone && row.phone && !fill.phone) fill.phone = row.phone;
      if (!hit.website && row.website && !fill.website) fill.website = row.website;
      if (!hit.address && row.address && !fill.address) fill.address = row.address;
      if (row.customFields?.googlePlaceId && !hit.customFields?.googlePlaceId) {
        fill.customFields = { ...(hit.customFields ?? {}), googlePlaceId: row.customFields.googlePlaceId };
      }
      /* A fresher check of the address they already have replaces the old
         one — including "this bounces", which is the one a campaign most
         needs to know. Their address itself is theirs to change, not ours. */
      const mail = (fill.email ?? hit.email ?? '').toLowerCase();
      const v = mail ? checks[mail] : undefined;
      if (v) {
        fill.customFields = { ...(fill.customFields ?? hit.customFields ?? {}), emailStatus: v.status, emailCheck: v.level, emailCheckedAt: v.checkedAt };
        /* The new check's tag replaces the old one — an address cannot be both verified and bouncing. */
        const kept = (fill.tags ?? hit.tags ?? []).filter(t => !EMAIL_TAGS.has(t));
        fill.tags = [...kept, emailTag(v)].filter(Boolean);
      }
      /* The person the web named, when the record has nobody yet and the address is theirs. */
      if (!hit.firstName && row.firstName && mail === row.email.toLowerCase()) {
        fill.firstName = row.firstName;
        if (row.lastName) fill.lastName = row.lastName;
        if (!hit.jobTitle && row.jobTitle) fill.jobTitle = row.jobTitle;
      }
      if (was) repeats++;
      known.set(hit.id, { contact: hit, fill });
      continue;
    }
    if (fresh.some(f => sameBusiness(row, f))) { repeats++; continue; }
    fresh.push(row);
  }
  return { fresh, known: [...known.values()], repeats };
}

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

/** "Dentists — Leeds, Oct": what was searched, and when, so the list says what it is. */
export function suggestListName(trade: string, place: string, when = new Date()): string {
  const cap = (s: string) => s.trim().replace(/\s+/g, ' ').replace(/^./, c => c.toUpperCase());
  const t = cap(trade);
  const what = t && !/s$/i.test(t) && !/\s/.test(t) ? `${t}s` : t;
  const where = cap(place);
  return `${what || 'Businesses'}${where ? ` — ${where}` : ''}, ${MONTHS[when.getMonth()]}`.slice(0, 80);
}

/* ── Recent and saved searches ─────────────────────────────────────────────
 *
 * Kept in the workspace's own storage (`crm_prospect_searches`, a plain key —
 * the tenant layer scopes it, and the sync takes it to the server like every
 * other workspace record), so a colleague in the same workspace sees the
 * searches that were run and nobody has to remember how "dentists" was spelt
 * last time. Results are not kept: Google's terms forbid it, and the free
 * directory's are cached on the server already.
 */
const SEARCHES_KEY = 'crm_prospect_searches';

export interface SavedSearch {
  source: ProspectSource;
  trade: string;
  place: string;
  at: string;
  /** How many came back the last time it was run. */
  count: number;
  /** Pinned by the customer — kept when older searches make room. */
  saved?: boolean;
}

const sameSearch = (a: Pick<SavedSearch, 'source' | 'trade' | 'place'>, b: Pick<SavedSearch, 'source' | 'trade' | 'place'>) =>
  a.source === b.source && norm(a.trade) === norm(b.trade) && norm(a.place) === norm(b.place);

export function loadSearches(): SavedSearch[] {
  try {
    const raw = JSON.parse(localStorage.getItem(SEARCHES_KEY) || '[]');
    return Array.isArray(raw) ? raw.filter(s => s && typeof s.trade === 'string' && typeof s.place === 'string') : [];
  } catch { return []; }
}

function storeSearches(list: SavedSearch[]): SavedSearch[] {
  try { localStorage.setItem(SEARCHES_KEY, JSON.stringify(list)); } catch { /* storage full or blocked */ }
  return list;
}

/** Most recent first; saved ones always kept, eight unsaved at most. */
export function rememberSearch(list: SavedSearch[], s: Omit<SavedSearch, 'at' | 'saved'>, at = new Date().toISOString()): SavedSearch[] {
  const was = list.find(x => sameSearch(x, s));
  const next = [{ ...s, at, saved: was?.saved }, ...list.filter(x => !sameSearch(x, s))];
  let unsaved = 0;
  return next.filter(x => x.saved || ++unsaved <= 8);
}

export function recordSearch(s: Omit<SavedSearch, 'at' | 'saved'>): SavedSearch[] {
  return storeSearches(rememberSearch(loadSearches(), s));
}

export function toggleSaved(s: SavedSearch): SavedSearch[] {
  return storeSearches(loadSearches().map(x => (sameSearch(x, s) ? { ...x, saved: !x.saved } : x)));
}

export function forgetSearch(s: SavedSearch): SavedSearch[] {
  return storeSearches(loadSearches().filter(x => !sameSearch(x, s)));
}
