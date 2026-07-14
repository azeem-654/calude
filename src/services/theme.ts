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
 */
export type Theme = 'light' | 'dark';
const KEY = 'crm_theme';

export function getTheme(): Theme {
  try { return (window.localStorage.getItem(KEY) as Theme) || 'light'; } catch { return 'light'; }
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

/** Apply the persisted theme on boot (call once, early). */
export function initTheme() {
  applyTheme(getTheme());
}
