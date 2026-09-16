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

/**
 * The rehearsal copy of the product.
 *
 * Its own Worker, its own database, its own cron — nothing it does can reach a
 * paying customer. Changes land here first and are promoted to the live app
 * deliberately rather than by being pushed.
 */
const STAGING_HOSTS = new Set(['testing.protectedcentral.com']);

/**
 * The staging Worker's *other* address.
 *
 * Cloudflare gives every Worker a `<name>.<account>.workers.dev` URL and turns
 * it on by default, with a preview wildcard beside it. Both are public —
 * "anyone with this URL can visit" — so the rehearsal copy has three front
 * doors, not one.
 *
 * That was a real hole rather than a tidiness complaint. Matching only the
 * custom domain meant that on the workers.dev address `isStagingHost()` was
 * false, so no warning bar was drawn, and `isAppHost()` was false too, so the
 * root rendered the marketing pitch. A publicly reachable copy of the product,
 * advertising the platform, with nothing saying it was a rehearsal.
 *
 * Matched by the Worker's name rather than by `.workers.dev` alone, so that the
 * *live* Worker's own preview URL is never mislabelled as staging.
 */
const STAGING_WORKER = 'crmpro-staging';
const isStagingWorkerUrl = (h: string): boolean =>
  h.endsWith('.workers.dev') && h.includes(STAGING_WORKER);

const APP_HOSTS = new Set(['app.protectedcentral.com', ...STAGING_HOSTS]);

const host = (): string =>
  (typeof window === 'undefined' ? '' : window.location.hostname).toLowerCase();

/**
 * A reseller's own address, resolved before this module is asked anything.
 *
 * `resolveHost()` fills this in at boot. It is a plain module variable rather
 * than state because every function here is called synchronously from render —
 * `isAppHost()` decides what the root route shows, and it cannot await.
 */
let whiteLabelled = false;

/** Called once at boot, by the resolver. */
export function markWhiteLabelHost(on: boolean): void { whiteLabelled = on; }

/** True on protectedcentral.com (or www), where only the marketing site exists. */
export const isMarketingHost = (): boolean => !whiteLabelled && MARKETING_HOSTS.has(host());

/**
 * True where the product lives.
 *
 * A reseller's own hostname counts. Their clients arrive expecting a login, not
 * a page advertising the platform their agency resells — showing them the
 * marketing site would undo the white label at the first click.
 */
export const isAppHost = (): boolean =>
  whiteLabelled || APP_HOSTS.has(host()) || isStagingWorkerUrl(host());

/**
 * True on the rehearsal copy.
 *
 * Note where this sits: `testing.protectedcentral.com` is in `APP_HOSTS`, so it
 * renders the product rather than the marketing page. Leaving it out was the
 * trap — a name that is neither an app host nor a marketing host falls through
 * to the development behaviour, and a visitor to the testing site would have
 * been shown the pitch instead of the login form.
 *
 * It is also what decides which features are rehearsing: something not ready
 * for customers can be fully live here and say "coming soon" on the real one,
 * from the same build.
 */
export const isStagingHost = (): boolean => {
  const h = host();
  return STAGING_HOSTS.has(h) || isStagingWorkerUrl(h);
};

/**
 * True where a feature that is not ready for paying customers may run.
 *
 * Staging and a developer's own machine. Deliberately *not* a white-label host:
 * a reseller's domain is a real customer's front door, and the fact that it is
 * not `app.protectedcentral.com` does not make it a rehearsal.
 */
export const isRehearsal = (): boolean => {
  if (isStagingHost()) return true;
  const h = host();
  return h === 'localhost' || h === '127.0.0.1' || h.endsWith('.workers.dev');
};

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
