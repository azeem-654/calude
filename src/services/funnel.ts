/**
 * The public site's funnel, counted: from a visit to a project's first output.
 *
 * ── What is sent ──
 *
 * An event name from the fixed list below, a random visitor id (`pc_vid`, made
 * here, nothing about the person), the solution key the visitor chose (a
 * catalogue key, never their words), the screen size class, and — after
 * sign-in — the session cookie, which lets the server confirm a sign-up is a
 * new account. Never an answer, a sentence, an address or a business name:
 * the report needs counts, and counts are all that is kept
 * (worker/src/routes/sitePlan.ts, one row per visitor, event and day).
 *
 * A browser that says "do not track" (Global Privacy Control or DNT) sends
 * nothing; the owner's report says such visitors are not counted.
 *
 * The id crosses from protectedcentral.com to the app's origin as `?vid=` on
 * the sign-up link (hosts.ts `appHref`), because the two origins keep separate
 * storage and the funnel would otherwise end at the site's edge.
 */
import { sessionToken } from './auth';
import { API_BASE } from './apiBase';

export const FUNNEL_EVENTS = [
  'homepage_view', 'hero_cta_clicked', 'wizard_started', 'wizard_intent_submitted',
  'wizard_question_answered', 'wizard_completed', 'solution_viewed', 'solution_edited',
  'trial_cta_clicked', 'signup_started', 'signup_completed', 'autopilot_project_build_started',
  'autopilot_project_created', 'first_workflow_created', 'first_value_reached',
] as const;
export type FunnelEvent = typeof FUNNEL_EVENTS[number];

const VID = 'pc_vid';
const VID_RE = /^[a-f0-9]{24}$/;

const optedOut = (): boolean => {
  try {
    const n = navigator as Navigator & { globalPrivacyControl?: boolean };
    return n.globalPrivacyControl === true || n.doNotTrack === '1';
  } catch { return false; }
};

/** This browser's anonymous id, made on first use. Empty when storage is off. */
export function visitorId(): string {
  try {
    const have = localStorage.getItem(VID) ?? '';
    if (VID_RE.test(have)) return have;
    const bytes = crypto.getRandomValues(new Uint8Array(12));
    const id = [...bytes].map(b => b.toString(16).padStart(2, '0')).join('');
    localStorage.setItem(VID, id);
    return id;
  } catch { return ''; }
}

/**
 * On the app's origin: adopt the id the site sent along, unless this browser
 * already has its own, and take it out of the address bar.
 */
export function captureVisitor(): void {
  try {
    const u = new URL(location.href);
    const vid = u.searchParams.get('vid') ?? '';
    if (!vid) return;
    if (VID_RE.test(vid) && !VID_RE.test(localStorage.getItem(VID) ?? '')) localStorage.setItem(VID, vid);
    u.searchParams.delete('vid');
    history.replaceState(null, '', u.pathname + u.search + u.hash);
  } catch { /* storage off: the visit is simply not joined up */ }
}

/**
 * The same, but only for a browser the funnel already knows — one that came
 * from the site or started a sign-up. Steps inside the app (a project built,
 * its first output) are part of the site's funnel only for those people; a
 * customer of two years building their fortieth project is not a conversion.
 */
export function trackKnown(event: FunnelEvent, props: { solution?: string } = {}): void {
  try { if (!VID_RE.test(localStorage.getItem(VID) ?? '')) return; } catch { return; }
  track(event, props);
}

const sent = new Set<string>();

/** Count one step. Fire and forget: a count is never a reason for a page to fail. */
export function track(event: FunnelEvent, props: { solution?: string } = {}): void {
  if (optedOut()) return;
  const vid = visitorId();
  if (!vid) return;
  const key = `${event}|${props.solution ?? ''}`;
  if (sent.has(key)) return;
  sent.add(key);
  const device = typeof window !== 'undefined' && window.innerWidth <= 760 ? 'phone' : 'desktop';
  const body = JSON.stringify({ action: 'event', event, vid, solution: props.solution ?? '', device, token: sessionToken() || undefined });
  try {
    void fetch(`${API_BASE}/api/site-plan.php`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body, keepalive: true }).catch(() => {});
  } catch { /* offline */ }
}
