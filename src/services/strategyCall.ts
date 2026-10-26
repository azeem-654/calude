/**
 * Links to the operator's strategy call, built in one place.
 *
 * Every "Book a strategy call" on the four sites comes from `strategyCallHref`,
 * so the address is never retyped and the page always learns which site sent
 * the visitor (`src`) and, where the visitor arrived from an ad or a campaign,
 * the UTM tags and click ids that came with them. Those are kept in this tab's
 * sessionStorage on arrival (first touch wins for the visit), because a
 * visitor who lands on /hvac?utm_campaign=spring and reads for ten minutes has
 * lost them from the address bar by the time they click.
 *
 * The page and the server re-check all of it (`cleanSource`): this is a
 * convenience for attribution, not something trusted.
 */
import { STRATEGY_CALL_PATH, type SiteSource } from '../../worker/src/lib/strategyCall';

const KEY = 'pc_arrival_utm';
const UTM = ['utm_source', 'utm_medium', 'utm_campaign', 'utm_content', 'utm_term'] as const;
const CLICK = ['gclid', 'fbclid', 'msclkid'] as const;

/** Keep the campaign tags this visit arrived with. Called once by each public page. */
export function rememberArrival(): void {
  try {
    if (sessionStorage.getItem(KEY)) return;
    const q = new URLSearchParams(window.location.search);
    const kept: Record<string, string> = {};
    for (const k of [...UTM, ...CLICK]) { const v = q.get(k); if (v) kept[k] = v.slice(0, 120); }
    const ref = document.referrer && !document.referrer.startsWith(window.location.origin) ? document.referrer : '';
    if (ref) kept.ref = ref.slice(0, 200);
    sessionStorage.setItem(KEY, JSON.stringify(kept));
  } catch { /* storage off: the link carries only the site */ }
}

/* What this visit arrived with: the stored first touch, else the address the
   page is on now — links are drawn before the page's effect has stored it. */
function arrival(): Record<string, string> {
  let kept: Record<string, string> = {};
  try { kept = JSON.parse(sessionStorage.getItem(KEY) ?? '{}') as Record<string, string>; } catch { /* storage off */ }
  if (Object.keys(kept).length) return kept;
  const q = new URLSearchParams(window.location.search);
  for (const k of [...UTM, ...CLICK]) { const v = q.get(k); if (v) kept[k] = v.slice(0, 120); }
  return kept;
}

/** The booking page's address for a visitor on `site`, carrying what they arrived with. */
export function strategyCallHref(site: SiteSource): string {
  const q = new URLSearchParams({ src: site });
  const a = arrival();
  for (const k of [...UTM, ...CLICK]) if (a[k]) q.set(k, a[k]);
  const base = (import.meta.env.BASE_URL || '/').replace(/\/$/, '');
  return `${base}${STRATEGY_CALL_PATH}?${q.toString()}`;
}

/** The source the booking page sends with a booking: from its own address, then the visit's first touch. */
export function sourceFromLocation(): { site: string; utm: Record<string, string>; clickIds: Record<string, string>; referrer: string } {
  const q = new URLSearchParams(window.location.search);
  const a = arrival();
  const utm: Record<string, string> = {};
  for (const k of UTM) { const v = q.get(k) ?? a[k]; if (v) utm[k.slice(4)] = v; }
  const clickIds: Record<string, string> = {};
  for (const k of CLICK) { const v = q.get(k) ?? a[k]; if (v) clickIds[k] = v; }
  return { site: q.get('src') ?? 'main', utm, clickIds, referrer: a.ref ?? (document.referrer || '') };
}
