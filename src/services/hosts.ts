/**
 * Which of the two sites is this?
 *
 * One build, one Worker, two hostnames:
 *
 *   protectedcentral.com       the public marketing site — what it is, what it
 *                              does, and two ways in
 *   app.protectedcentral.com   the product itself — login, and everything
 *                              behind it
 *
 * Both names point at the same Worker, so the split has to happen in the
 * bundle. Everything here is derived from the hostname at call time rather
 * than baked in at build time: the same artefact then serves the apex, the
 * subdomain, a preview URL and localhost without a per-environment build.
 *
 * Anywhere that is neither name — localhost, a *.workers.dev preview, a branch
 * deploy — keeps the old single-host behaviour: the marketing page at the root
 * and the login form at /login, both reachable, no cross-origin hop in the
 * middle. That is what makes the site developable at all.
 */

/** Where the product lives. Sign-in and sign-up from the marketing site land here. */
export const APP_ORIGIN = 'https://app.protectedcentral.com';

/** The public site. Both the apex and www serve it. */
const MARKETING_HOSTS = new Set(['protectedcentral.com', 'www.protectedcentral.com']);

const APP_HOSTS = new Set(['app.protectedcentral.com']);

const host = (): string =>
  (typeof window === 'undefined' ? '' : window.location.hostname).toLowerCase();

/** True on protectedcentral.com (or www), where only the marketing site exists. */
export const isMarketingHost = (): boolean => MARKETING_HOSTS.has(host());

/** True on app.protectedcentral.com, where the marketing site is somebody else's URL. */
export const isAppHost = (): boolean => APP_HOSTS.has(host());

/**
 * A link into the product.
 *
 * Absolute when the visitor is on the marketing site — they have to cross to
 * another origin to get there. Relative everywhere else, so the router handles
 * it and development does not bounce to production.
 */
export function appHref(path = '/login'): string {
  const clean = path.startsWith('/') ? path : `/${path}`;
  if (isMarketingHost()) return `${APP_ORIGIN}${clean}`;
  const base = (import.meta.env.BASE_URL || '/').replace(/\/$/, '');
  return `${base}${clean}`;
}

/** True when `appHref` produced a link off this origin, so the router cannot take it. */
export const isCrossOrigin = (href: string): boolean => /^https?:\/\//.test(href);
