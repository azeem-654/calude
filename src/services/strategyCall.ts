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
import { useEffect, useState } from 'react';
import { STRATEGY_CALL_PATH, type SiteSource } from '../../worker/src/lib/strategyCall';
import { API_BASE } from './apiBase';

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

/*
 * Whether the owner is taking bookings, asked once per page load and shared by
 * every button on it. A "Book a Strategy Call" that opens a page saying
 * bookings are closed is a broken promise, so while they are closed the
 * buttons lead to the page's own inquiry form instead. Until the answer comes
 * (or if the server cannot be reached) the button keeps the booking link: the
 * booking page has its own closed state and its own way to write to us.
 */
export type BookingState = 'unknown' | 'open' | 'closed';
let asked: Promise<BookingState> | null = null;
function askBooking(): Promise<BookingState> {
  asked ??= fetch(`${API_BASE}/api/strategy-call.php`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'config' }) })
    .then(r => r.json() as Promise<{ success?: boolean; settings?: { enabled?: boolean } }>)
    .then(d => (d.success ? (d.settings?.enabled ? 'open' : 'closed') : 'unknown') as BookingState)
    .catch(() => 'unknown' as BookingState);
  return asked;
}

export function useBookingState(): BookingState {
  const [state, setState] = useState<BookingState>('unknown');
  useEffect(() => { let live = true; void askBooking().then(s => { if (live) setState(s); }); return () => { live = false; }; }, []);
  return state;
}

/**
 * Where a "book a call" button on `site` should go: the booking page, or —
 * when bookings are closed — `writeHref`, the inquiry form on the same page.
 */
export function useCallLink(site: SiteSource, writeHref: string): { href: string; closed: boolean } {
  const closed = useBookingState() === 'closed';
  return { href: closed ? writeHref : strategyCallHref(site), closed };
}
