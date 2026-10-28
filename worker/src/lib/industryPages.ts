/**
 * The industry microsites — protectedcentral.com/hvac, /roofing and
 * /medical-billing — as a crawler sees them.
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
 * Prices in the structured data are read from lib/offers.ts, the one place
 * every service's terms are written, so a search result cannot quote a price
 * nobody is held to.
 *
 * The e-commerce service page (/ecommerce-management-services) is served the
 * same way: one canonical address, with /ecommerce and /e-commerce answering
 * 301 to it (index.ts `ALIASES`), so a search engine never sees two copies.
 */
import { ECOMMERCE_OFFER, MEDICAL_BILLING_OFFER, TRADE_GROWTH_OFFER, dollars, ecommerceLine, medicalLine, percent } from './offers';

/* The search snippet's price, from the offer — never typed (it once drifted from the page). */
const PRICE_WORDS = `${dollars(TRADE_GROWTH_OFFER.setupCents)} setup, ${dollars(TRADE_GROWTH_OFFER.monthlyCents)}/month, plus a ${percent(TRADE_GROWTH_OFFER.performanceBps)} performance fee on eligible collections.`;

export type IndustrySlug = 'hvac' | 'roofing' | 'medical-billing' | 'ecommerce';
/** The two trades sold the growth service. */
export type TradeSlug = 'hvac' | 'roofing';

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
    title: 'HVAC growth service: leads, follow-up and revenue tracking — Protected Central',
    description: `An HVAC pipeline set up for you, inquiries captured with their source, agreed campaigns and outbound prospecting, and every estimate tracked to the job and the payment. ${PRICE_WORDS}`,
  },
  roofing: {
    slug: 'roofing',
    path: '/roofing',
    name: 'Roofing',
    audience: 'Roofing contractors',
    title: 'Roofing growth service: inquiries, estimates and revenue tracking — Protected Central',
    description: `A roofing pipeline set up for you, inquiries captured with their source, commercial prospecting and campaigns, and every inspection and estimate tracked to the job and the payment. ${PRICE_WORDS}`,
  },
  'medical-billing': {
    slug: 'medical-billing',
    path: '/medical-billing',
    name: 'Medical Billing',
    audience: 'Medical practices',
    title: 'Medical billing and revenue-cycle management — Protected Central',
    description: `Claims, denials, payments and A/R followed through for independent and multi-provider practices, with a revenue-leakage review and reporting you can check. ${medicalLine()}, on claims handled under your signed agreement.`,
  },
  ecommerce: {
    slug: 'ecommerce',
    path: '/ecommerce-management-services',
    name: 'E-commerce',
    audience: 'Online sellers and e-commerce brands',
    title: 'E-commerce Management Services: Amazon, eBay, Shopify & Walmart — Protected Central',
    description: `Done-for-you e-commerce business setup and management: Shopify store and marketplace accounts on Amazon, eBay and Walmart set up and run, ads managed, and CRM, email, SMS and support handled. ${ecommerceLine()} for a written monthly scope; ad spend and platform fees are yours.`,
  },
};

/** Addresses people type for the e-commerce page, answered with a 301 to the one canonical address. */
export const PAGE_ALIASES: Record<string, string> = {
  '/ecommerce': '/ecommerce-management-services',
  '/e-commerce': '/ecommerce-management-services',
  '/ecommerce-management': '/ecommerce-management-services',
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

/** The growth service's two fixed prices, as Offers. The performance fee is a percentage, so it is said in words. */
export function growthOffers(url: string) {
  const o = TRADE_GROWTH_OFFER;
  return [
    { '@type': 'Offer', name: 'One-time setup', price: (o.setupCents / 100).toFixed(2), priceCurrency: o.currency, url: `${url}#pricing` },
    {
      '@type': 'Offer', name: 'Monthly platform and service fee', price: (o.monthlyCents / 100).toFixed(2), priceCurrency: o.currency, url: `${url}#pricing`,
      priceSpecification: { '@type': 'UnitPriceSpecification', price: (o.monthlyCents / 100).toFixed(2), priceCurrency: o.currency, billingDuration: 'P1M', unitCode: 'MON' },
      description: `Plus a performance fee of ${percent(o.performanceBps)} on eligible collections from jobs attributed to the service. Advertising budget and approved third-party charges are paid separately.`,
    },
  ];
}

/** The medical service's two fixed prices as Offers; the collections percentage in words. */
export function medicalOffers(url: string) {
  const o = MEDICAL_BILLING_OFFER;
  return [
    { '@type': 'Offer', name: 'One-time practice setup', price: (o.setupCents / 100).toFixed(2), priceCurrency: o.currency, url: `${url}#pricing` },
    {
      '@type': 'Offer', name: 'Monthly platform and billing-service fee', price: (o.monthlyCents / 100).toFixed(2), priceCurrency: o.currency, url: `${url}#pricing`,
      priceSpecification: { '@type': 'UnitPriceSpecification', price: (o.monthlyCents / 100).toFixed(2), priceCurrency: o.currency, billingDuration: 'P1M', unitCode: 'MON' },
      description: `Plus ${percent(o.collectionsBps)} of eligible net collections on claims handled under the signed agreement. Subject to legal and compliance review.`,
    },
  ];
}

/** The e-commerce service's one monthly price. */
export function ecommerceOffers(url: string) {
  const o = ECOMMERCE_OFFER;
  return [{
    '@type': 'Offer', name: 'Monthly managed service', price: (o.monthlyCents / 100).toFixed(2), priceCurrency: o.currency, url: `${url}#pricing`,
    priceSpecification: { '@type': 'UnitPriceSpecification', price: (o.monthlyCents / 100).toFixed(2), priceCurrency: o.currency, billingDuration: 'P1M', unitCode: 'MON' },
    description: 'For the agreed monthly scope. Advertising spend, inventory, marketplace and payment fees, shipping and third-party apps are paid separately by the client.',
  }];
}

const SERVICE_TYPE: Record<IndustrySlug, string> = {
  hvac: 'Lead generation and revenue tracking for contractors',
  roofing: 'Lead generation and revenue tracking for contractors',
  'medical-billing': 'Medical billing and revenue-cycle management',
  ecommerce: 'E-commerce store setup and management',
};

/** Schema.org data for one microsite: the page, the service it is about, the way back. */
export function industryJsonLd(m: IndustryMeta): string {
  const url = `${SITE_ORIGIN}${m.path}`;
  const offers = m.slug === 'medical-billing' ? medicalOffers(url) : m.slug === 'ecommerce' ? ecommerceOffers(url) : growthOffers(url);
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
      '@type': 'Service',
      '@id': `${url}#software`,
      name: `Protected Central ${m.name}`,
      serviceType: SERVICE_TYPE[m.slug],
      provider: { '@type': 'Organization', name: 'Protected Central', url: `${SITE_ORIGIN}/` },
      areaServed: 'US',
      description: m.description,
      audience: { '@type': 'BusinessAudience', audienceType: m.audience },
      offers,
    },
  ];
  /* `<` escaped so nothing in a description can close the script element. */
  return JSON.stringify(data).replace(/</g, '\\u003c');
}

/** Every public page worth indexing. Signed-in screens are not pages anybody searches for. */
export const SITEMAP_PATHS = ['/', '/pricing', '/ecommerce-management-services', '/hvac', '/roofing', '/medical-billing', '/book/strategy-call', '/security', '/privacy', '/terms-of-service', '/terms', '/affiliate-terms', '/growth-service-terms'];

export function sitemapXml(): string {
  const urls = SITEMAP_PATHS.map(p => `  <url><loc>${SITE_ORIGIN}${p}</loc></url>`).join('\n');
  return `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls}\n</urlset>\n`;
}

export function robotsTxt(): string {
  return `User-agent: *\nAllow: /\nDisallow: /api/\nDisallow: /p/\n\nSitemap: ${SITE_ORIGIN}/sitemap.xml\n`;
}
