/**
 * The public site's own pages, and nothing else (PUB-4).
 *
 * protectedcentral.com answered every address with the home page and status
 * 200, so a mistyped or retired link looked like a page to a search engine —
 * duplicate copies of the home page under any address anybody linked — and
 * every page shared the home page's title and description. Pure, so the Worker
 * (status and head) and the app (which screen) read the same list.
 */
import { PAGE_ALIASES, SITEMAP_PATHS, industryFor, servicesPublic } from './industryPages';

/** The live public host only — never localhost, the app, staging or a white label. */
export const isPublicSiteHost = (hostname: string): boolean => /^(www\.)?protectedcentral\.com$/i.test(hostname);

/** Addresses that are not the pitch but are real on that host. /login and
    /signup stay: older emails and bookmarks link them on this host, and the
    home page they land on has both buttons. */
const PREFIXES = ['/book/', '/shop/', '/p/', '/f/', '/s/', '/auth/', '/api/', '/assets/', '/.well-known/'];
const EXTRA = ['/appsumo', '/sitemap.xml', '/robots.txt', '/login', '/signup'];

/**
 * Is this a page the public site has? A file (anything with an extension) is
 * the platform's to answer.
 *
 * The service sites (/hvac, /roofing, /medical-billing, the e-commerce page
 * and its aliases) are pages only where the services are shown — the testing
 * site and a developer's machine (`servicesPublic`, the same hosts as the
 * incubator's switches, docs/INCUBATOR.md). On the live site they are a real
 * 404 (owner, 2026-11-18), not a redirect home: a page that is not offered
 * does not exist there. `hostname` defaults to the browser's own, so App.tsx's
 * call needs no change; the Worker passes the request's.
 */
export function isKnownPublicPath(pathname: string, hostname: string = (globalThis as { location?: { hostname?: string } }).location?.hostname ?? ''): boolean {
  const p = (pathname.replace(/\/+$/, '') || '/').toLowerCase();
  if ((p in PAGE_ALIASES || industryFor(p)) && !servicesPublic(hostname)) return false;
  if (p === '/' || (SITEMAP_PATHS.includes(p) && !industryFor(p)) || EXTRA.includes(p) || p in PAGE_ALIASES || industryFor(p)) return true;
  if (PREFIXES.some(x => `${p}/`.startsWith(x))) return true;
  return /\/[^/]+\.[a-z0-9]{1,8}$/i.test(p);
}

/* A customer's page on the public site: protectedcentral.com/<brand>/<page>
   (owner, 2026-11-19 — replacing app.protectedcentral.com/s/<brand>/<page>).
   One copy of the shape, read by the Worker (status, head, and what a brand
   may be called) and by the app (which screen). */
export const BRAND_OK = /^[a-z0-9](?:[a-z0-9-]{0,28}[a-z0-9])$/;
export const PART_OK = /^[a-z0-9](?:[a-z0-9-]{0,38}[a-z0-9])?$/;

/**
 * "brand" or "brand/page" when the address could be a customer's page, else ''.
 * Only called for addresses the site does not have itself — the site's own
 * pages always win, and `brandNameFree` keeps a brand from ever being named
 * like one of them.
 */
export function brandPath(pathname: string): string {
  const parts = pathname.toLowerCase().replace(/^\/+|\/+$/g, '').split('/');
  if (parts.length > 2 || !BRAND_OK.test(parts[0] ?? '')) return '';
  if (parts.length === 2 && !PART_OK.test(parts[1])) return '';
  return parts.join('/');
}

/**
 * May a customer publish under this short name? Not if protectedcentral.com
 * already has, or could show, a page at /<name> — on any host, which is why
 * it asks as localhost, where every incubated page (/hvac, /roofing…) is on.
 */
export function brandNameFree(brand: string): boolean {
  return !isKnownPublicPath(`/${brand}`, 'localhost');
}

export interface PageHead { title: string; description: string }

/** Each public page's own title and description, as a crawler or link preview reads them. Plain facts only. */
export const PUBLIC_HEADS: Record<string, PageHead> = {
  '/pricing': { title: 'Pricing — Protected Central', description: 'Protected Central plans and what each one includes: AI Autopilot business workspaces, AI writing, prospecting, AI Video Studio, white label and support.' },
  '/security': { title: 'Security — Protected Central', description: 'How Protected Central protects accounts and data: sign-in, encryption of stored credentials, tenancy, backups and how to report a vulnerability.' },
  '/changelog': { title: 'Changelog — Protected Central', description: 'What has changed in Protected Central, newest first.' },
  '/privacy': { title: 'Privacy Policy — Protected Central', description: 'What personal information Protected Central handles, why, who else processes it, how long it is kept and the choices you have.' },
  '/refund-policy': { title: 'Refund Policy — Protected Central', description: 'Refunds for Protected Central plans bought in the app and through AppSumo, and what a refund changes on your account.' },
  '/cookie-policy': { title: 'Cookie Policy — Protected Central', description: 'The cookies Protected Central sets, what each one is for, and how long it lasts.' },
  '/terms-of-service': { title: 'Terms of Service — Protected Central', description: 'The terms for using Protected Central.' },
  '/terms': { title: 'Acceptable Use — Protected Central', description: 'What Protected Central may and may not be used for.' },
  '/affiliate-terms': { title: 'Affiliate Terms — Protected Central', description: 'How the Protected Central affiliate program works: what you earn, when it is paid and how you may promote it.' },
  '/growth-service-terms': { title: 'Growth Service Terms — Protected Central', description: 'The terms of the Protected Central growth service for HVAC and roofing businesses.' },
  '/appsumo': { title: 'AppSumo — Protected Central', description: 'Redeem a Protected Central AppSumo code and see what your lifetime plan includes.' },
};

export const NOT_FOUND_HEAD: PageHead = { title: 'Page not found — Protected Central', description: 'There is no page at this address on protectedcentral.com.' };

export const headFor = (pathname: string): PageHead | null => PUBLIC_HEADS[(pathname.replace(/\/+$/, '') || '/').toLowerCase()] ?? null;
