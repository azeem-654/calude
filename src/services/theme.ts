/**
 * theme.ts — app-wide light/dark mode.
 *
 * The CRM is styled with thousands of inline hex colors, so instead of
 * refactoring every component we flip a single `data-theme` attribute on
 * <html> and let a CSS filter in index.css invert the whole app (with images,
 * video, and avatars excepted). One toggle, every screen goes dark.
 *
 * The choice is stored in the global (un-scoped) `crm_theme` key so it follows
 * the user across sub-accounts.
 *
 * With no choice made, the app is dark (owner, 2026-11-14) — but only the
 * signed-in app. Public pages a visitor opens on the same host (a shop, a
 * form, a shared report, the sign-in page, the testing site's copy of the
 * public site) were never designed for the inversion, so they stay light
 * unless this browser chose dark. `enterApp`/`leaveApp` are called by the
 * signed-in shell (TopNav) as it mounts and unmounts.
 */
export type Theme = 'light' | 'dark';
const KEY = 'crm_theme';

/** What the app shows when nobody has chosen. */
const APP_DEFAULT: Theme = 'dark';

function chosen(): Theme | null {
  try { const t = window.localStorage.getItem(KEY); return t === 'dark' || t === 'light' ? t : null; } catch { return null; }
}

/** The signed-in app's theme: the choice, or the default. */
export function getTheme(): Theme {
  return chosen() ?? APP_DEFAULT;
}

export function applyTheme(t: Theme) {
  document.documentElement.setAttribute('data-theme', t);
}

export function setTheme(t: Theme) {
  try { window.localStorage.setItem(KEY, t); } catch { /* ignore */ }
  applyTheme(t);
}

export function toggleTheme(): Theme {
  const next: Theme = getTheme() === 'dark' ? 'light' : 'dark';
  setTheme(next);
  return next;
}

/* Addresses that are never the signed-in app (App.tsx's public routes). */
const PUBLIC_PATH = /^\/(book|shop|p|f|preview|site|login|auth|security|changelog|privacy|refund-policy|cookie-policy|terms-of-service|affiliate-terms|growth-service-terms|pricing|appsumo)(\/|$)/;

function signedIn(): boolean {
  try { return !!(JSON.parse(localStorage.getItem('crm_session') || 'null') as { token?: string } | null)?.token; } catch { return false; }
}

/**
 * On boot (call once, early). A choice applies everywhere, as it always has;
 * the dark default only where the signed-in app is about to draw, so it does
 * not flash light first.
 */
export function initTheme() {
  const c = chosen();
  if (c) { applyTheme(c); return; }
  applyTheme(signedIn() && !PUBLIC_PATH.test(location.pathname) ? APP_DEFAULT : 'light');
}

/** The signed-in shell mounted: its theme. */
export function enterApp() { applyTheme(getTheme()); }
/** And unmounted (signed out, or a public page): light again unless dark was chosen. */
export function leaveApp() { applyTheme(chosen() ?? 'light'); }
