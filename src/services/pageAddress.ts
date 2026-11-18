/**
 * The short company name in a published page's address —
 * app.protectedcentral.com/s/<company>/<page>.
 *
 * Owner, 2026-11-18: an address like /s/business-website read as one of
 * Protected Central's own pages. Under the customer's short name it reads as
 * theirs: /s/lone-star/free-quote. AI Autopilot asks for it (suggesting one),
 * the publish panel shows and lets them change it, and the Worker keeps each
 * name to the one account that took it first (routes/published.ts).
 *
 * The same rules are in the Worker (`BRAND_OK`, `RESERVED_BRANDS`); this copy
 * is only for suggesting and previewing — the server decides.
 */

/** Words that make a name long without making it theirs. */
const FILLER = /\b(the|and|&|llc|l\.l\.c|inc|incorporated|ltd|limited|co|company|corp|corporation|plc|gmbh|pty|services?|solutions?|group|enterprises?)\b\.?/gi;

/** Lower-case letters, digits and single hyphens; 2–30 characters, never empty-looking. */
export function cleanUrlPart(raw: string, max = 30): string {
  return raw.normalize('NFKD').replace(/[̀-ͯ]/g, '').toLowerCase()
    .replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, max).replace(/-+$/, '');
}

/**
 * A short name from the business name: "Lone Star Electric LLC" → "lone-star",
 * "I run Blue Ridge Plumbing" → "blue-ridge". Two words is usually enough to be
 * recognisable; the trade word is the first to go when there are more.
 */
export function suggestUrlName(company: string): string {
  const words = company
    .replace(/^\s*(i|we)\s+(run|own|have|manage)\s+/i, '')
    .replace(FILLER, ' ')
    .split(/\s+/).map(w => cleanUrlPart(w)).filter(Boolean);
  if (!words.length) return '';
  const picked = words.length > 2 ? words.slice(0, 2) : words;
  const out = cleanUrlPart(picked.join('-'), 24);
  return out.length >= 2 ? out : cleanUrlPart(words.join('-'), 24);
}

/** The page part: the item's name without the company's words, or a plain fallback. */
export function suggestPagePart(itemName: string, urlName: string, kind: 'site' | 'funnel', business = ''): string {
  const brandWords = new Set([...urlName.split('-'), ...cleanUrlPart(business, 80).split('-')].filter(Boolean));
  const rest = cleanUrlPart(itemName, 120).split('-').filter(w => w && !brandWords.has(w)).join('-');
  return cleanUrlPart(rest, 40) || (kind === 'site' ? 'website' : 'offer');
}

/* The account's chosen name, remembered so every page after the first uses
   it. Plain key: tenant storage prefixes it per workspace. */
const KEY = 'crm_page_brand';
export function savedUrlName(): string {
  try { return cleanUrlPart(localStorage.getItem(KEY) ?? ''); } catch { return ''; }
}
export function rememberUrlName(v: string): void {
  try { if (cleanUrlPart(v)) localStorage.setItem(KEY, cleanUrlPart(v)); } catch { /* private window: asked again next time */ }
}
