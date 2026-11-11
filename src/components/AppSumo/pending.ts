/*
 * What an AppSumo buyer left waiting before signing in, in this browser.
 *
 * Kept apart from AppSumoPage so the app shell can ask "is anything waiting?"
 * on every load without pulling the whole page into the first download — the
 * page itself is loaded only when somebody opens /appsumo.
 */

/** The code typed before signing in, carried across sign-up in this browser. */
export const PENDING_CODE_KEY = 'pc_appsumo_code';
export function pendingAppsumoCode(): string {
  try { return localStorage.getItem(PENDING_CODE_KEY) ?? ''; } catch { return ''; }
}

/** The one-use claim from AppSumo's Activate button, carried across sign-up the same way. */
export const PENDING_LICENSE_KEY = 'pc_appsumo_license';
export function pendingLicense(): string {
  try { return localStorage.getItem(PENDING_LICENSE_KEY) ?? ''; } catch { return ''; }
}

/** Anything waiting to be added to the account once signed in. */
export const pendingAppsumo = () => pendingAppsumoCode() || pendingLicense();
