/**
 * The trade pages — protectedcentral.com/hvac and /roofing — as a crawler sees
 * them.
 *
 * The page itself is the React app (src/components/Site/IndustryPage.tsx), and
 * it titles its own tab. But a search engine's first pass and every link
 * preview read the served HTML without running a script, and the served HTML is
 * index.html, which describes the home page. So the Worker rewrites the head on
 * the way out: title, description, canonical, Open Graph, and structured data.
 *
 * One list, two readers: the page imports `INDUSTRY_PAGES` for its tab title,
 * so the tab and the search result cannot say different things. That is why
 * this file is plain data and functions — the app's build compiles it too —
 * and the rewriting itself, which needs the Worker's HTMLRewriter, is
 * industryHead.ts.
 *
 * Prices in the structured data are read from `PLAN_DEFS`, the table checkout
 * charges from, so a search result cannot quote a price nobody is charged.
 */
import { PLAN_DEFS } from './allowances';

export type IndustrySlug = 'hvac' | 'roofing';

export interface IndustryMeta {
  slug: IndustrySlug;
  path: string;
  /** "HVAC", "Roofing" — what the nav and the breadcrumb call it. */
  name: string;
  /** Who it is for, as structured data's audience says it. */
  audience: string;
  title: string;
  description: string;
}

export const SITE_ORIGIN = 'https://protectedcentral.com';

export const INDUSTRY_PAGES: Record<IndustrySlug, IndustryMeta> = {
  hvac: {
    slug: 'hvac',
    path: '/hvac',
    name: 'HVAC',
    audience: 'HVAC businesses',
    title: 'CRM and follow-up for HVAC businesses — Protected Central',
    description: 'Keep every HVAC enquiry, estimate and past customer in one pipeline. Protected Central builds the estimate follow-up, seasonal reactivation and prospecting workflows, and runs them once you approve. 7 days free.',
  },
  roofing: {
    slug: 'roofing',
    path: '/roofing',
    name: 'Roofing',
    audience: 'Roofing contractors',
    title: 'CRM and follow-up for roofing contractors — Protected Central',
    description: 'Track every roofing inquiry, inspection and estimate in one pipeline. Protected Central builds the inspection and estimate follow-up, reactivation and prospecting workflows, and runs them once you approve. 7 days free.',
  },
};

/** The trade a path names, or null. A trailing slash is the same page. */
export function industryFor(pathname: string): IndustryMeta | null {
  const p = pathname.replace(/\/+$/, '').toLowerCase();
  return (Object.values(INDUSTRY_PAGES).find(m => m.path === p)) ?? null;
}

/**
 * The hosts that speak as Protected Central.
 *
 * A reseller's own domain is served by this same Worker, and a preview card
 * there reading "Protected Central for HVAC" would undo their white label at
 * the first link they paste. So the head is rewritten only where the site is
 * ours (and on a developer's machine, so it can be checked); anywhere else the
 * response leaves untouched. Named one by one rather than as
 * `*.protectedcentral.com`, because a reseller's free login address is a
 * subdomain of ours and is theirs, not ours.
 */
const OUR_HOSTS = new Set(['protectedcentral.com', 'www.protectedcentral.com', 'app.protectedcentral.com', 'testing.protectedcentral.com', 'localhost', '127.0.0.1']);
export function speaksAsUs(hostname: string): boolean {
  const h = hostname.toLowerCase();
  return OUR_HOSTS.has(h) || h.endsWith('.workers.dev');
}

/** The public site itself — where a sitemap and robots.txt describe pages that exist. */
export function isSiteHost(hostname: string): boolean {
  const h = hostname.toLowerCase();
  return h === 'protectedcentral.com' || h === 'www.protectedcentral.com' || h === 'localhost' || h === '127.0.0.1';
}

/** Schema.org data for one trade page: the page, the product it is about, the way back. */
export function industryJsonLd(m: IndustryMeta): string {
  const url = `${SITE_ORIGIN}${m.path}`;
  const offers = PLAN_DEFS
    .filter(p => p.kind === 'self' && p.monthlyCents > 0)
    .map(p => ({
      '@type': 'Offer',
      name: p.name,
      price: (p.monthlyCents / 100).toFixed(2),
      priceCurrency: 'USD',
      priceSpecification: {
        '@type': 'UnitPriceSpecification',
        price: (p.monthlyCents / 100).toFixed(2),
        priceCurrency: 'USD',
        billingDuration: 'P1M',
        unitCode: 'MON',
      },
      url: `${url}#pricing`,
    }));
  const data = [
    {
      '@context': 'https://schema.org',
      '@type': 'WebPage',
      '@id': `${url}#page`,
      url,
      name: m.title,
      description: m.description,
      isPartOf: { '@type': 'WebSite', name: 'Protected Central', url: `${SITE_ORIGIN}/` },
      about: { '@id': `${url}#software` },
    },
    {
      '@context': 'https://schema.org',
      '@type': 'SoftwareApplication',
      '@id': `${url}#software`,
      name: 'Protected Central',
      applicationCategory: 'BusinessApplication',
      operatingSystem: 'Web',
      description: m.description,
      audience: { '@type': 'BusinessAudience', audienceType: m.audience },
      offers,
    },
    {
      '@context': 'https://schema.org',
      '@type': 'BreadcrumbList',
      itemListElement: [
        { '@type': 'ListItem', position: 1, name: 'Protected Central', item: `${SITE_ORIGIN}/` },
        { '@type': 'ListItem', position: 2, name: m.name, item: url },
      ],
    },
  ];
  /* `<` escaped so nothing in a description can close the script element. */
  return JSON.stringify(data).replace(/</g, '\\u003c');
}

/** Every public page worth indexing. Signed-in screens are not pages anybody searches for. */
export const SITEMAP_PATHS = ['/', '/pricing', '/hvac', '/roofing', '/security', '/privacy', '/terms-of-service', '/terms', '/affiliate-terms'];

export function sitemapXml(): string {
  const urls = SITEMAP_PATHS.map(p => `  <url><loc>${SITE_ORIGIN}${p}</loc></url>`).join('\n');
  return `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls}\n</urlset>\n`;
}

export function robotsTxt(): string {
  return `User-agent: *\nAllow: /\nDisallow: /api/\nDisallow: /p/\n\nSitemap: ${SITE_ORIGIN}/sitemap.xml\n`;
}
