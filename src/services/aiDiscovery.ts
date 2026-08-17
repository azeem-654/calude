/**
 * Finding prospects, and being straight about what is actually known about them.
 *
 * A directory listing is a thin thing. Google Places will tell you a clinic's
 * name, address, phone number and website, and it will not tell you whether the
 * practice has three locations or whether it could afford three thousand a
 * month. Those are exactly the questions an ICP asks.
 *
 * So qualification here has three answers, not two. A signal is met, not met, or
 * unanswerable — and unanswerable is reported as such rather than being scored
 * as a pass or quietly dropped from the list. The score is only ever over the
 * signals that could genuinely be checked, and it says so.
 *
 * The other thing this file refuses to do is invent a business. Every lead it
 * returns came back from a real search against a real source. When no source is
 * connected the answer is an empty list and an explanation, because a page of
 * plausible clinics with plausible addresses is indistinguishable from real data
 * right up until someone contacts them.
 */
import { sessionToken } from './auth';
import type { Contact } from '../types';
import type {
  AIChannel, AILead, AIStrategy, LeadQualification, LeadSource, SignalCheck,
} from '../types/aiSalesAgent';

const API_BASE = import.meta.env.DEV ? 'http://localhost:3001' : '';
const LEADS_KEY = 'crm_ai_leads';

/* ── Store ─────────────────────────────────────────────────────────────── */

function readLeads(): AILead[] {
  try {
    const raw = JSON.parse(localStorage.getItem(LEADS_KEY) || '[]');
    return Array.isArray(raw) ? raw.filter((l: AILead) => l && typeof l.id === 'string') : [];
  } catch { return []; }
}

function writeLeads(rows: AILead[]): boolean {
  try { localStorage.setItem(LEADS_KEY, JSON.stringify(rows)); return true; }
  catch (err) { console.error('AI Sales Agent could not save leads:', err); return false; }
}

export function leadsFor(campaignId: string): AILead[] {
  return readLeads().filter(l => l.campaignId === campaignId);
}

export function purgeLeads(campaignId: string): number {
  const rows = readLeads();
  const next = rows.filter(l => l.campaignId !== campaignId);
  const removed = rows.length - next.length;
  if (removed) writeLeads(next);
  return removed;
}

export function updateLead(id: string, updates: Partial<AILead>): AILead | null {
  const rows = readLeads();
  const i = rows.findIndex(l => l.id === id);
  if (i < 0) return null;
  rows[i] = { ...rows[i], ...updates, id: rows[i].id, campaignId: rows[i].campaignId };
  return writeLeads(rows) ? rows[i] : null;
}

/* ── The search query a strategy implies ───────────────────────────────── */

/**
 * Places takes one line of text, the way a person would type it into Maps.
 * Built from the ICP rather than the raw objective, because the objective also
 * contains the cadence, the price and the channels — none of which belong in a
 * search for businesses.
 */
export function searchQueryFor(strategy: AIStrategy): string {
  const what = strategy.icp.industry?.trim() || strategy.icp.description.trim();
  /* A place with no kind of business is not a search, it is a map. Without
     something to look for there is nothing to ask Places, and saying so beats
     spending a billed request on the word "Texas". */
  if (!what) return '';
  const where = strategy.icp.location?.trim();
  return [what, where ? `in ${where}` : ''].filter(Boolean).join(' ').replace(/\s+/g, ' ').trim();
}

/**
 * A postal address says TX, not Texas.
 *
 * Comparing an ICP's "Texas" against "1200 Congress Ave, Austin, TX 78701"
 * finds nothing, which briefly rejected every single lead a Texas search
 * returned. Both spellings of a state are treated as the same place.
 */
const US_STATES: Record<string, string> = {
  alabama: 'al', alaska: 'ak', arizona: 'az', arkansas: 'ar', california: 'ca',
  colorado: 'co', connecticut: 'ct', delaware: 'de', florida: 'fl', georgia: 'ga',
  hawaii: 'hi', idaho: 'id', illinois: 'il', indiana: 'in', iowa: 'ia',
  kansas: 'ks', kentucky: 'ky', louisiana: 'la', maine: 'me', maryland: 'md',
  massachusetts: 'ma', michigan: 'mi', minnesota: 'mn', mississippi: 'ms',
  missouri: 'mo', montana: 'mt', nebraska: 'ne', nevada: 'nv',
  'new hampshire': 'nh', 'new jersey': 'nj', 'new mexico': 'nm', 'new york': 'ny',
  'north carolina': 'nc', 'north dakota': 'nd', ohio: 'oh', oklahoma: 'ok',
  oregon: 'or', pennsylvania: 'pa', 'rhode island': 'ri', 'south carolina': 'sc',
  'south dakota': 'sd', tennessee: 'tn', texas: 'tx', utah: 'ut', vermont: 'vt',
  virginia: 'va', washington: 'wa', 'west virginia': 'wv', wisconsin: 'wi', wyoming: 'wy',
};

/** Every way a place might be written in an address. */
function placeAliases(place: string): string[] {
  const p = norm(place);
  const out = new Set([p]);
  if (US_STATES[p]) out.add(US_STATES[p]);
  for (const [full, code] of Object.entries(US_STATES)) if (code === p) out.add(full);
  return [...out];
}

/* ── Sources ───────────────────────────────────────────────────────────── */

export interface DiscoveredBusiness {
  id: string;
  name: string;
  address?: string;
  phone?: string;
  website?: string;
  email?: string;
  rating?: number | null;
  ratingCount?: number | null;
  businessStatus?: string;
  category?: string;
}

export interface DiscoveryResult {
  ok: boolean;
  source: LeadSource;
  businesses: DiscoveredBusiness[];
  /** Why there is nothing, when there is nothing. Always shown, never swallowed. */
  error?: string;
  /** Set when the source needs configuring rather than having genuinely failed. */
  needsSetup?: boolean;
}

/**
 * A place to plug another source in. Anything implementing this can be offered
 * alongside Places without the rest of the module changing.
 */
export interface DiscoverySource {
  id: LeadSource;
  label: string;
  search(query: string, limit: number): Promise<DiscoveryResult>;
}

export const googlePlaces: DiscoverySource = {
  id: 'google-places',
  label: 'Google Places',
  async search(query, limit) {
    try {
      const res = await fetch(`${API_BASE}/api/places-search.php`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'search', token: sessionToken(), query, maxResults: limit }),
      });
      if (res.status === 401) {
        return { ok: false, source: 'google-places', businesses: [], error: 'Your session has expired. Sign in again and try the search.' };
      }
      const data = await res.json() as { success: boolean; places?: DiscoveredBusiness[]; error?: string; code?: string };
      if (!data.success) {
        return {
          ok: false, source: 'google-places', businesses: [],
          error: data.error || 'The search failed.',
          needsSetup: data.code === 'no_key',
        };
      }
      return { ok: true, source: 'google-places', businesses: data.places ?? [] };
    } catch {
      return {
        ok: false, source: 'google-places', businesses: [],
        error: 'Could not reach the search endpoint. This needs the PHP backend deployed — it will not work on a static preview.',
      };
    }
  },
};

/**
 * The contacts already in the CRM, offered as a source of prospects.
 *
 * The reason this exists is blunt. Google Places does not publish email
 * addresses, so a campaign built only from Places has phone numbers and nobody
 * to email — which the build refuses to pretend otherwise about. The people a
 * business can actually email are usually already in its CRM: enquiries that
 * went cold, quotes that were never chased, customers who stopped coming. That
 * is the cheapest campaign anyone can run and the agent could not reach it.
 *
 * It does not judge the ICP itself. qualify() does that, exactly as it does for
 * a directory listing, so there is one qualification path and every rejection
 * still has to show its evidence.
 *
 * Two exclusions, both deliberate. Someone with no email address is no use to
 * an email campaign. And a current customer is not a cold prospect — mailing
 * your own customers a "quick question about {{company}}" is the sort of thing
 * that has to be chosen, not arrived at by default.
 */
export function crmContacts(contacts: Contact[]): DiscoverySource {
  return {
    id: 'crm',
    label: 'Your contacts',
    async search(_query, limit) {
      const withEmail = contacts.filter(c => !!c.email?.trim());
      const usable = withEmail.filter(c => c.status !== 'customer');

      if (!contacts.length) {
        return { ok: false, source: 'crm', businesses: [], error: 'There are no contacts in this workspace yet, so there is nobody to work.' };
      }
      if (!withEmail.length) {
        return {
          ok: false, source: 'crm', businesses: [],
          error: `None of your ${contacts.length} contacts has an email address, so there is nobody here an email campaign could reach.`,
        };
      }
      if (!usable.length) {
        return {
          ok: false, source: 'crm', businesses: [],
          error: `All ${withEmail.length} contacts with an email address are marked as customers. They are left out of cold outreach on purpose — change a status if you meant to include one.`,
        };
      }

      return {
        ok: true,
        source: 'crm',
        businesses: usable.slice(0, limit).map(c => ({
          id: c.id,
          /* The company is what an ICP is written about; the person's name is
             what the email says hello to, and leadToContact keeps both. */
          name: c.company?.trim() || c.name,
          address: c.address?.trim() || c.customFields?.leadAddress || undefined,
          phone: c.phone || undefined,
          website: c.website || undefined,
          email: c.email.trim(),
          category: c.tags?.length ? c.tags.join(', ') : undefined,
        })),
      };
    },
  };
}

export async function placesStatus(): Promise<{ configured: boolean; keyHint: string }> {
  try {
    const res = await fetch(`${API_BASE}/api/places-search.php`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'status', token: sessionToken() }),
    });
    const data = await res.json() as { configured?: boolean; keyHint?: string };
    return { configured: !!data.configured, keyHint: data.keyHint ?? '' };
  } catch { return { configured: false, keyHint: '' }; }
}

/* ── Qualification ─────────────────────────────────────────────────────── */

/** Words in an ICP signal that no directory listing can settle. */
const UNANSWERABLE = /afford|budget|revenue|turnover|spend|profit|growing|decision[- ]maker|intent|looking for|in the market/i;

const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9 ]/g, ' ').replace(/\s+/g, ' ').trim();

/**
 * Check one business against one signal.
 *
 * The default is `unknown`. A signal only counts as met when there is something
 * concrete behind it — a word in the address, a website that exists — and the
 * evidence is recorded so the answer can be argued with.
 */
export function checkSignal(signal: string, biz: DiscoveredBusiness, strategy: AIStrategy, siblings: DiscoveredBusiness[]): SignalCheck {
  const text = norm(signal);

  if (UNANSWERABLE.test(signal)) {
    return {
      signal, verdict: 'unknown',
      evidence: 'A business listing cannot answer this. Judge it yourself, or check it on the call.',
    };
  }

  const location = strategy.icp.location?.trim();
  if (location && norm(signal).includes(norm(location))) {
    if (!biz.address) {
      return { signal, verdict: 'unknown', evidence: 'No address was returned for this business.' };
    }
    const address = ` ${norm(biz.address)} `;
    const hit = placeAliases(location).some(a => address.includes(` ${a} `));
    /* A miss is unknown rather than a rejection. The search itself was already
       constrained to the area, and an address can name a suburb or a county
       instead of the region — throwing the lead away on that is too eager. */
    return {
      signal,
      verdict: hit ? 'met' : 'unknown',
      evidence: hit
        ? `Address: ${biz.address}`
        : `Address does not mention ${location}: ${biz.address}. It came back from a search for ${location}, so check it.`,
    };
  }

  const industry = strategy.icp.industry?.trim();
  if (industry && norm(signal).includes(norm(industry))) {
    const hay = norm(`${biz.name} ${biz.category ?? ''}`);
    const words = norm(industry).split(' ').filter(w => w.length > 3);
    const hit = words.some(w => hay.includes(w.replace(/s$/, '')));
    return {
      signal,
      verdict: hit ? 'met' : 'unknown',
      evidence: hit
        ? `Listed as “${biz.category || biz.name}”.`
        : `Listed as “${biz.category || 'no category'}”, which does not obviously match. Worth a look.`,
    };
  }

  /* "More than one location" is not a field Places returns, but a chain shows
     up as the same name at several addresses in one result set. That is an
     inference from the search, not a fact from the source, and it says so. */
  if (/more than one location|multiple locations|multi[- ]?location|chain|branches/i.test(signal)) {
    const same = siblings.filter(b => norm(b.name) === norm(biz.name));
    if (same.length > 1) {
      return { signal, verdict: 'met', evidence: `Inferred: “${biz.name}” appears at ${same.length} addresses in these results.` };
    }
    return {
      signal, verdict: 'unknown',
      evidence: 'Only one address for this name in these results, which does not rule out others. Places does not report how many sites a business has.',
    };
  }

  if (/website|online|web presence/i.test(signal)) {
    return {
      signal,
      verdict: biz.website ? 'met' : 'not-met',
      evidence: biz.website ? `Website: ${biz.website}` : 'No website listed.',
    };
  }

  if (/review|rating|reputation/i.test(signal)) {
    const has = typeof biz.rating === 'number' && !!biz.ratingCount;
    return {
      signal,
      verdict: has ? 'met' : 'unknown',
      evidence: has ? `${biz.rating} from ${biz.ratingCount} reviews.` : 'No rating returned.',
    };
  }

  /* Anything else: look for the signal's own words in what the source gave. */
  const hay = norm(`${biz.name} ${biz.category ?? ''} ${biz.address ?? ''}`);
  const words = text.split(' ').filter(w => w.length > 3);
  const hits = words.filter(w => hay.includes(w));
  if (words.length && hits.length === words.length) {
    return { signal, verdict: 'met', evidence: `Matched on “${hits.join('”, “')}” in the listing.` };
  }
  return { signal, verdict: 'unknown', evidence: 'Nothing in the listing settles this either way.' };
}

/** What you could actually reach this business on, given what came back. */
export function contactableOn(biz: DiscoveredBusiness): AIChannel[] {
  const out: AIChannel[] = [];
  if (biz.email) out.push('email');
  if (biz.phone) out.push('sms');
  return out;
}

export function qualify(biz: DiscoveredBusiness, strategy: AIStrategy, siblings: DiscoveredBusiness[], now = new Date()): LeadQualification {
  const checks = strategy.icp.signals.map(s => checkSignal(s, biz, strategy, siblings));

  /* Closed businesses are not prospects, and Google says so plainly. */
  if (biz.businessStatus && biz.businessStatus !== 'OPERATIONAL') {
    checks.unshift({
      signal: 'Still trading',
      verdict: 'not-met',
      evidence: `Google lists this as ${biz.businessStatus.replace(/_/g, ' ').toLowerCase()}.`,
    });
  }

  /* The score covers only what could be checked. Counting unanswerable signals
     as failures would bury every lead; counting them as passes would be a lie. */
  const answerable = checks.filter(c => c.verdict !== 'unknown');
  const met = answerable.filter(c => c.verdict === 'met').length;
  const score = answerable.length === 0 ? 0 : Math.round((met / answerable.length) * 100);

  return { score, checks, contactable: contactableOn(biz), at: now.toISOString() };
}

/** A lead is rejected only on something actually established, never on a gap. */
export function verdictFor(q: LeadQualification): 'qualified' | 'rejected' {
  const failed = q.checks.some(c => c.verdict === 'not-met');
  return failed ? 'rejected' : 'qualified';
}

/* ── Running a search ──────────────────────────────────────────────────── */

export interface DiscoveryRun {
  ok: boolean;
  added: AILead[];
  duplicates: number;
  error?: string;
  needsSetup?: boolean;
  query: string;
}

/**
 * Search, qualify, and store — skipping anything already found for this
 * campaign, so running it twice adds only what is new.
 */
export async function discover(
  campaignId: string,
  strategy: AIStrategy,
  opts: { limit?: number; source?: DiscoverySource } = {},
): Promise<DiscoveryRun> {
  const source = opts.source ?? googlePlaces;
  /* Each source caps itself — Places is clamped to 20 by its own endpoint —
     so this only stops a caller asking for an unbounded number. */
  const limit = Math.max(1, Math.min(200, opts.limit ?? 20));
  const query = searchQueryFor(strategy);

  if (!query) {
    return { ok: false, added: [], duplicates: 0, query, error: 'The plan does not say who to look for. Add an industry or a description to the strategy first.' };
  }

  const result = await source.search(query, limit);
  if (!result.ok) {
    return { ok: false, added: [], duplicates: 0, query, error: result.error, needsSetup: result.needsSetup };
  }

  const existing = readLeads();
  const seen = new Set(existing.filter(l => l.campaignId === campaignId).map(l => l.sourceRef || norm(l.name)));

  const added: AILead[] = [];
  let duplicates = 0;
  const at = new Date().toISOString();

  result.businesses.forEach((biz, i) => {
    const key = biz.id || norm(biz.name);
    if (seen.has(key)) { duplicates++; return; }
    seen.add(key);
    const q = qualify(biz, strategy, result.businesses);
    added.push({
      id: `${campaignId}-${Date.now().toString(36)}-${i.toString(36)}`,
      campaignId,
      name: biz.name || 'Unnamed business',
      source: result.source,
      sourceRef: biz.id || undefined,
      address: biz.address || undefined,
      phone: biz.phone || undefined,
      website: biz.website || undefined,
      email: biz.email || undefined,
      rating: typeof biz.rating === 'number' ? biz.rating : undefined,
      ratingCount: typeof biz.ratingCount === 'number' ? biz.ratingCount : undefined,
      businessStatus: biz.businessStatus || undefined,
      status: verdictFor(q),
      qualification: q,
      createdAt: at,
    });
  });

  if (added.length) writeLeads([...existing, ...added]);
  return { ok: true, added, duplicates, query };
}

/** How the lead list stands, for the panel's summary line. */
export interface LeadStats {
  total: number;
  qualified: number;
  rejected: number;
  withEmail: number;
  withPhone: number;
  withWebsite: number;
}

export function leadStats(leads: AILead[]): LeadStats {
  const qualified = leads.filter(l => l.status === 'qualified' || l.status === 'promoted');
  return {
    total: leads.length,
    qualified: qualified.length,
    rejected: leads.filter(l => l.status === 'rejected').length,
    withEmail: leads.filter(l => !!l.email).length,
    withPhone: leads.filter(l => !!l.phone).length,
    withWebsite: leads.filter(l => !!l.website).length,
  };
}
