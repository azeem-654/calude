/**
 * Finding businesses to sell to, without anybody's API key.
 *
 * ── Why not Google Places, which this app already had ──
 *
 * Two reasons, and the second is the fatal one.
 *
 * It is not free: Google retired the pooled $200 credit in March 2025 and
 * replaced it with per-SKU allowances that do not pool, so Text Search gives
 * 5,000 calls a month and then charges $32 per thousand.
 *
 * And its terms forbid the product being built here. Places content may not be
 * pre-fetched, cached or stored, beyond the place id and, for thirty days, a
 * latitude and longitude. A prospect list is by definition stored contact
 * details — so "search Google Maps and keep the results" is not a feature that
 * can be built on Places at all, at any price.
 *
 * ── What replaces it ──
 *
 * OpenStreetMap, through Overpass. No key, no account, no bill, and the data is
 * ODbL — it may be kept and used, with attribution. Coverage is a real
 * trade-off and is stated plainly to the customer rather than papered over:
 * OSM is excellent for a European high street and patchy for a small trade in
 * a suburb nobody has mapped.
 *
 * What Overpass asks in return is restraint. The public instances serve roughly
 * ten thousand requests a day across every user on earth, with no guarantee and
 * a standing warning that commercial callers who lean on them lose access. So
 * every answer is cached, and the same question is never asked twice in a
 * fortnight.
 *
 * ── Where the email addresses come from ──
 *
 * OSM carries a phone and a website far more often than an address. So the
 * website is read — through `readSite`, which already refuses to fetch
 * anything on a private network — and published contact addresses are taken
 * off it. That is the business's own published address, not a guess at a
 * pattern: `firstname.lastname@` invented by a tool is how a sending domain
 * gets burned on bounces.
 *
 * Nothing here decides whether somebody may be emailed. That is clause 3 of the
 * acceptable use policy and it is the customer's judgement to make, which is
 * why the import step makes them say so rather than this quietly implying it.
 */
import { nowIso, type Env } from './db';
import { readSite, urlProblem } from './readSite';

export interface Prospect {
  /** OSM element, so the same business found twice is recognisably the same. */
  ref: string;
  name: string;
  phone: string;
  website: string;
  /** From OSM's own tags. Usually empty; the site read fills the rest in. */
  email: string;
  address: string;
  category: string;
  lat: number;
  lon: number;
}

/*
 * Three instances, tried in order.
 *
 * Not redundancy for its own sake — the main instance is a volunteer service
 * that genuinely goes down, and the OSM wiki lists the mirrors precisely so
 * that callers spread out rather than all waiting on one host. A single
 * hardcoded endpoint makes an outage there look like a broken feature here.
 */
const OVERPASS_HOSTS = [
  'https://overpass-api.de/api/interpreter',
  'https://overpass.kumi.systems/api/interpreter',
  'https://overpass.private.coffee/api/interpreter',
];

/* A fortnight. Shops do close, but not fast enough to justify asking a
   volunteer-run service the same question every day. */
const CACHE_SECONDS = 14 * 24 * 3600;

/**
 * Overpass wants a regex; this makes one that cannot break out of the query.
 *
 * An allow-list, not an escape. Everything that is not a letter, a digit or a
 * space is dropped — so there is no quote to close, no bracket to match and no
 * semicolon to end a statement with, whatever was typed. Exported because that
 * claim is worth testing rather than asserting in a comment.
 */
export const safeTerm = (s: string): string => s.toLowerCase().replace(/[^a-z0-9 ]/g, '').trim().slice(0, 40);

/**
 * OSM does not have a "plumber" field — it has `craft`, `shop`, `office`,
 * `amenity` and `healthcare`, and a given trade lives in a different one
 * depending on who mapped it. So all five are searched for the word, plus the
 * business name, and anything with no business tag at all is left out.
 */
export function overpassQuery(trade: string, place: string): string {
  const t = safeTerm(trade);
  const p = safeTerm(place);
  return `[out:json][timeout:20];
area["name"~"^${p}$",i]["boundary"="administrative"]->.a;
(
  nwr(area.a)["craft"~"${t}",i];
  nwr(area.a)["shop"~"${t}",i];
  nwr(area.a)["office"~"${t}",i];
  nwr(area.a)["healthcare"~"${t}",i];
  nwr(area.a)["amenity"~"${t}",i];
  nwr(area.a)["name"~"${t}",i]["website"];
);
out center tags 80;`;
}

export interface OsmElement {
  type: string;
  id: number;
  lat?: number; lon?: number;
  center?: { lat: number; lon: number };
  tags?: Record<string, string>;
}

export function toProspect(el: OsmElement): Prospect | null {
  const t = el.tags ?? {};
  const name = (t.name ?? '').trim();
  /* An unnamed shop is a dot on a map, not a business anybody can contact. */
  if (!name) return null;

  const category = t.craft || t.shop || t.office || t.healthcare || t.amenity || '';
  /* A point tagged only with a name and a website is a guess; require that
     somebody classified it as a business of some kind. */
  if (!category) return null;

  const line = [t['addr:housenumber'], t['addr:street'], t['addr:city'], t['addr:postcode']]
    .filter(Boolean).join(' ').trim();

  return {
    ref: `${el.type}/${el.id}`,
    name: name.slice(0, 160),
    /* OSM has three spellings for each of these and uses all three. */
    phone: (t.phone || t['contact:phone'] || t['contact:mobile'] || '').split(';')[0].trim().slice(0, 40),
    website: (t.website || t['contact:website'] || t.url || '').split(';')[0].trim().slice(0, 300),
    email: (t.email || t['contact:email'] || '').split(';')[0].trim().toLowerCase().slice(0, 160),
    address: line.slice(0, 200),
    category: category.replace(/_/g, ' ').slice(0, 60),
    lat: el.lat ?? el.center?.lat ?? 0,
    lon: el.lon ?? el.center?.lon ?? 0,
  };
}

export interface SearchResult {
  prospects: Prospect[];
  /** True when this came from the cache. Shown, because it explains the speed. */
  cached: boolean;
  error: string;
}

export async function searchProspects(env: Env, trade: string, place: string): Promise<SearchResult> {
  const t = safeTerm(trade);
  const p = safeTerm(place);
  if (t.length < 2) return { prospects: [], cached: false, error: 'Say what kind of business to look for.' };
  if (p.length < 2) return { prospects: [], cached: false, error: 'Say where to look — a town or a city.' };

  const key = `${t}|${p}`;
  const now = Math.floor(Date.now() / 1000);

  const hit = await env.DB.prepare('SELECT payload FROM crm_prospect_cache WHERE q = ? AND expires_at > ?')
    .bind(key, now).first<{ payload: string }>();
  if (hit) {
    try { return { prospects: JSON.parse(hit.payload) as Prospect[], cached: true, error: '' }; }
    catch { /* an unreadable row is asked again rather than trusted */ }
  }

  const body = `data=${encodeURIComponent(overpassQuery(t, p))}`;
  let data: { elements?: OsmElement[] } | null = null;
  let lastError = '';
  let busy = false;

  /*
   * ── Bounded, because trying three hosts is not free ──
   *
   * A host that is simply unreachable takes as long to fail as the connection
   * takes to give up, and three of those in series is a customer watching a
   * spinner for a minute before being told it did not work. Testing it that way
   * round is what surfaced this: the first version had no timeout at all.
   *
   * Twelve seconds each is generous — a city-sized Overpass query comes back in
   * one to five — and the overall budget stops the third attempt being started
   * when there is no time left to finish it.
   */
  const started = Date.now();
  const PER_HOST_MS = 12_000;
  const BUDGET_MS = 26_000;

  for (const host of OVERPASS_HOSTS) {
    /* Would this attempt still be running when the budget ran out? Then do not
       start it. Checking whether the budget has *already* gone lets a third
       12-second attempt begin at 24 seconds and finish at 36, which is the
       spinner this was meant to prevent. */
    if (Date.now() - started + PER_HOST_MS > BUDGET_MS) break;
    let res: Response;
    try {
      res = await fetch(host, {
        signal: AbortSignal.timeout(PER_HOST_MS),
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
          /* Overpass asks callers to identify themselves, so an abusive one can
             be told apart from a busy one and spoken to rather than blocked. */
          'User-Agent': 'ProtectedCentral/1.0 (business search; contact via protectedcentral.com)',
        },
        body,
      });
    } catch (e) {
      /* A timeout and a refused connection are both "this one is no good, try
         the next", and the name of the error is the only thing that tells them
         apart afterwards. */
      lastError = e instanceof Error ? `${e.name === 'TimeoutError' ? 'timed out' : e.message}` : String(e);
      continue;
    }

    /* Their own words for "too many, or too slow". Worth trying the next
       instance for, and worth telling the customer to wait rather than
       reporting as a fault, because waiting genuinely fixes it. */
    if (res.status === 429 || res.status === 503 || res.status === 504) {
      busy = true;
      lastError = `busy (${res.status})`;
      continue;
    }
    if (!res.ok) { lastError = `answered ${res.status}`; continue; }

    try { data = await res.json(); break; }
    catch { lastError = 'sent something this could not read'; }
  }

  if (!data) {
    return {
      prospects: [], cached: false,
      error: busy
        ? 'OpenStreetMap is busy right now. Try again in a minute — searches you have already run are still here.'
        : `Could not reach OpenStreetMap (${lastError}). Searches you have already run are still here.`,
    };
  }

  const seen = new Set<string>();
  const prospects: Prospect[] = [];
  for (const el of data.elements ?? []) {
    const pr = toProspect(el);
    if (!pr) continue;
    /* The same business is often a point *and* a building outline. Same name at
       the same address is one lead, not two. */
    const dedupe = `${pr.name.toLowerCase()}|${pr.address.toLowerCase()}`;
    if (seen.has(dedupe)) continue;
    seen.add(dedupe);
    prospects.push(pr);
  }

  await env.DB.prepare(
    'INSERT OR REPLACE INTO crm_prospect_cache (q, payload, expires_at, created_at) VALUES (?,?,?,?)',
  ).bind(key, JSON.stringify(prospects), now + CACHE_SECONDS, nowIso()).run();

  return { prospects, cached: false, error: '' };
}

/* ── Contact details, from the business's own site ────────────────────────── */

export interface Contactable {
  emails: string[];
  /** true has MX, false has none, null the lookup did not run. */
  mx: boolean | null;
}

/*
 * Addresses that are on every page of every website and belong to nobody: the
 * theme author, the agency that built it, the image library. Filtering them is
 * the difference between a prospect list and a list of WordPress developers.
 */
const JUNK = /@(example|sentry|wordpress|wixpress|squarespace|shopify|godaddy|sentry\.io|cloudflare|googlemail\.test)\./i;
const JUNK_LOCAL = /^(no-?reply|donotreply|postmaster|abuse|webmaster|hostmaster|privacy|dmca)@/i;

const EMAIL_RE = /[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,24}/gi;

export function harvest(text: string, host: string): string[] {
  const found = new Set<string>();
  for (const raw of text.match(EMAIL_RE) ?? []) {
    const e = raw.toLowerCase().replace(/[.,;:)]+$/, '');
    if (JUNK.test(e) || JUNK_LOCAL.test(e)) continue;
    /* Only addresses on the business's own domain. A site that links to its
       accountant should not put the accountant in somebody's prospect list. */
    const domain = e.split('@')[1] ?? '';
    const bare = host.replace(/^www\./, '');
    if (domain !== bare && !domain.endsWith(`.${bare}`)) continue;
    found.add(e);
    if (found.size >= 5) break;
  }
  return [...found];
}

/** Does this domain accept mail at all? Free, no key, and it catches the dead ones. */
async function hasMx(domain: string): Promise<boolean | null> {
  try {
    const r = await fetch(`https://cloudflare-dns.com/dns-query?name=${encodeURIComponent(domain)}&type=MX`, {
      headers: { accept: 'application/dns-json' },
    });
    if (!r.ok) return null;
    const d = await r.json<{ Status?: number; Answer?: { type: number }[] }>();
    if (d.Status !== 0) return false;
    return (d.Answer ?? []).some(a => a.type === 15);
  } catch {
    /* Null, not false. "We could not check" reported as "this will bounce" has
       customers deleting good leads. */
    return null;
  }
}

/**
 * Read one business's site for a published address.
 *
 * The home page first, then the two pages that carry contact details when the
 * home page does not. Three fetches at most: the point is to find the address
 * a business chose to publish, not to crawl anybody.
 */
export async function findContacts(env: Env, website: string): Promise<Contactable> {
  const blank: Contactable = { emails: [], mx: null };
  if (!website || urlProblem(website)) return blank;

  let host = '';
  try { host = new URL(website).hostname.toLowerCase(); } catch { return blank; }

  const now = Math.floor(Date.now() / 1000);
  const hit = await env.DB.prepare('SELECT emails, mx FROM crm_prospect_contacts WHERE host = ? AND expires_at > ?')
    .bind(host, now).first<{ emails: string; mx: number }>();
  if (hit) {
    return { emails: hit.emails ? hit.emails.split(',') : [], mx: hit.mx === 1 ? true : hit.mx === 0 ? false : null };
  }

  const base = website.replace(/\/+$/, '');
  const emails = new Set<string>();
  for (const path of ['', '/contact', '/contact-us']) {
    if (emails.size) break;
    try {
      const page = await readSite(`${base}${path}`);
      for (const e of harvest(`${page.text}\n${page.title}`, host)) emails.add(e);
    } catch { /* a 404 on /contact is the normal case, not an error */ }
  }

  const mx = await hasMx(host.replace(/^www\./, ''));

  await env.DB.prepare(
    'INSERT OR REPLACE INTO crm_prospect_contacts (host, emails, mx, expires_at, created_at) VALUES (?,?,?,?,?)',
  ).bind(host, [...emails].join(','), mx === true ? 1 : mx === false ? 0 : -1, now + CACHE_SECONDS, nowIso()).run();

  return { emails: [...emails], mx };
}
