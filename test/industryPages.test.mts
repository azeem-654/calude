/**
 * The industry microsites (/hvac, /roofing, /medical-billing) say only what
 * something else holds them to, and stay inside themselves.
 *
 * Run with `npm run test:industry`. The pages name workflow templates, screens
 * and prices that live elsewhere — the template library, reels.ts, the plan
 * table — and a rename there would otherwise leave a card that silently
 * vanishes, a slide with no picture, or a search result quoting a price
 * nobody is charged.
 */
import { TEMPLATES } from '../src/components/Autopilot/workflowTemplates';
import { REELS } from '../src/components/Site/reels';
import { INDUSTRIES } from '../src/components/Site/industries';
import * as MED from '../src/components/Site/medicalBilling';
import * as ECOM from '../src/components/Site/ecommerce';
import { ECOMMERCE_OFFER, MEDICAL_BILLING_OFFER, TRADE_GROWTH_OFFER, ecommerceLine, feeOn, growthExample, growthFaq, growthLine, medicalExample, medicalLine } from '../worker/src/lib/offers';
import { readFileSync } from 'node:fs';
import {
  INDUSTRY_PAGES, PAGE_ALIASES, SITEMAP_PATHS, industryFor, industryJsonLd, isSiteHost, speaksAsUs,
} from '../worker/src/lib/industryPages';

const out: string[] = [];
const ok = (n: string, p: boolean, d = '') => out.push(`${p ? 'PASS' : 'FAIL'}  ${n}${p ? '' : ` — ${d}`}`);
const shots = new Set(Object.values(REELS).flat().map(s => s.file));

for (const ind of Object.values(INDUSTRIES)) {
  const name = ind.slug;
  const missing = ind.workflows.map(w => w.key).filter(k => !TEMPLATES.some(t => t.key === k));
  ok(`${name}: every workflow is a real template`, missing.length === 0, missing.join());
  const files = [...ind.heroShots, ...ind.stages.flatMap(s => s.only ?? [])];
  const gone = files.filter(f => !shots.has(f));
  ok(`${name}: every screen is a photographed shot`, gone.length === 0, gone.join());
  const reels = ind.stages.flatMap(s => s.reels).filter(r => !REELS[r]);
  ok(`${name}: every reel exists`, reels.length === 0, reels.join());
  /* No figures: a digit followed by a percent sign or an "x" multiplier is a
     result claim, and there is nothing to base one on. */
  const text = JSON.stringify(ind, (_k, v) => (typeof v === 'function' ? undefined : v));
  ok(`${name}: no percentages or multipliers`, !/\d+\s?%|\d+x\b/.test(text), (text.match(/.{20}\d+\s?%.{20}/) ?? [''])[0]);
  ok(`${name}: says it does not answer the phone`, ind.limits.some(l => /does not answer your phone/.test(l)));
  ok(`${name}: never promises leads or revenue`, !/guarantee[sd]? (more )?(leads|revenue|jobs)/i.test(text.replace(/does not guarantee/gi, '')));
}

/* Each microsite's frame stays inside it: its logo and Home go to its own
   root, and no menu entry leaves for the home page or another industry. */
const sites = [INDUSTRIES.hvac.site, INDUSTRIES.roofing.site, MED.MEDICAL_SITE, ECOM.ECOM_SITE];
for (const site of sites) {
  const hrefs = site.nav.map(l => l.href);
  ok(`${site.id}: the menu is in-page anchors only`, hrefs.every(h => h.startsWith('#')), hrefs.join());
  ok(`${site.id}: home is its own root`, site.root === INDUSTRY_PAGES[site.id as 'hvac'].path);
  ok(`${site.id}: books with its own words`, /Book|Request/.test(site.bookLabel));
}
ok('the four sites book with different words', new Set(sites.map(s => s.bookLabel)).size === 4);
ok('HVAC never routes to roofing and roofing never to HVAC', !JSON.stringify(INDUSTRIES.hvac.site).includes('/roofing') && !JSON.stringify(INDUSTRIES.roofing.site).includes('/hvac'));
ok('the medical site has its required sections', ['#audit', '#claims', '#ar', '#reporting', '#security', '#process', '#pricing', '#faq'].every(h => MED.MEDICAL_SITE.nav.some(l => l.href === h)));

/* The growth offer is the approved one, and the fee arithmetic matches the brief. */
ok('growth offer: $300 setup, $87 a month, 5%', TRADE_GROWTH_OFFER.setupCents === 30000 && TRADE_GROWTH_OFFER.monthlyCents === 8700 && TRADE_GROWTH_OFFER.performanceBps === 500);
ok('growth line reads as approved', growthLine() === '$300 setup + $87/month + 5% performance fee', growthLine());
ok('fee on $6,000 is $300, on $3,000 is $150', feeOn(600_000, 500) === 30_000 && feeOn(300_000, 500) === 15_000);
ok('the worked example is the approved one', growthExample() === 'For example, if a qualifying job generates $6,000 in eligible collected revenue, the illustrative performance fee at 5% is $300, subject to the agreed calculation rules.', growthExample());
ok('the cost disclosure names ad budget and third-party expenses as outside both fees', /advertising budget/.test(TRADE_GROWTH_OFFER.costDisclosure) && /third-party expenses/.test(TRADE_GROWTH_OFFER.costDisclosure) && /not included in the setup fee or the monthly fee/.test(TRADE_GROWTH_OFFER.costDisclosure));
ok('the fee disclosure excludes whole revenue, unrelated customers, unaccepted quotes and uncollected amounts', ['entire business revenue', 'existing unrelated customers', 'unaccepted quotations', 'not been collected'].every(w => TRADE_GROWTH_OFFER.feeDisclosure.includes(w)));
ok('the three figures are labelled apart', /One-time setup/.test(TRADE_GROWTH_OFFER.labels.setup) && /Recurring/.test(TRADE_GROWTH_OFFER.labels.monthly) && /Performance fee/.test(TRADE_GROWTH_OFFER.labels.performance));
ok('the approved scope, eight items', TRADE_GROWTH_OFFER.includes.length === 8 && TRADE_GROWTH_OFFER.includes[0] === 'Business-specific CRM and pipeline setup' && TRADE_GROWTH_OFFER.includes[7] === 'Performance-fee calculations based on qualifying collected revenue');
ok('no fee on nothing, refunds or a negative', feeOn(0, 500) === 0 && feeOn(-5000, 500) === 0);
ok('fee rounds once, half up, to the cent', feeOn(1_010, 500) === 51 && feeOn(1_009, 500) === 50);
ok('ad budget and third-party charges are separate', TRADE_GROWTH_OFFER.separate.some(x => /Advertising/.test(x.title)) && TRADE_GROWTH_OFFER.separate.some(x => /third-party/i.test(x.title)));
ok('the fee basis excludes the whole business', /Not your existing customers/.test(TRADE_GROWTH_OFFER.feeBasis));
ok('the growth FAQ carries the approved example', growthFaq()[0].a.includes(growthExample()));

/* One block draws the price on the home page and both trade sites, and no page types a figure. */
const src = (f: string) => readFileSync(new URL(`../src/components/Site/${f}`, import.meta.url), 'utf8');
ok('both trade sites render GrowthOfferBlock', /<GrowthOfferBlock/.test(src('GrowthPricing.tsx')));
ok('the home page prices the software with the plan cards, and the services in their own section', /<HomePricing \/>/.test(src('SiteHome.tsx')) && /<PlanCards/.test(src('HomePricing.tsx')) && /<ServiceOffers \/>/.test(src('SiteHome.tsx')) && !/PlanCards/.test(src('ServiceOffers.tsx')));
ok('the home services list all four, each linking to its own site', ['ecommerceLine()', 'growthLine()', 'medicalLine()', 'INDUSTRY_PAGES.ecommerce.path', 'INDUSTRY_PAGES.hvac.path', 'INDUSTRY_PAGES.roofing.path', "INDUSTRY_PAGES['medical-billing'].path"].every(w => src('ServiceOffers.tsx').includes(w)));
for (const f of ['GrowthOfferBlock.tsx', 'GrowthPricing.tsx', 'HomePricing.tsx', 'ServiceOffers.tsx', 'IndustryPage.tsx', 'SiteHome.tsx', 'EcommercePage.tsx', 'MedicalBillingPage.tsx', 'ecommerce.ts', 'medicalBilling.ts']) {
  const text = src(f).replace(/\/\*[\s\S]*?\*\/|\/\/.*$/gm, '');
  ok(`${f}: no price typed into the page`, !/\$\s?\d|\b\d+\s?%/.test(text), (text.match(/.{30}(\$\s?\d|\b\d+\s?%).{20}/) ?? [''])[0]);
}

/* Medical billing: its own published price and basis — never a result figure, never the trade offer. */
const medText = JSON.stringify({ ...MED, MEDICAL_BILLING_OFFER }, (_k, v) => (typeof v === 'function' ? undefined : v));
const medCopy = JSON.stringify(MED, (_k, v) => (typeof v === 'function' ? undefined : v));
ok('medical copy: no dollar figure, percentage or multiplier typed (the price comes from the offer)', !/\$\s?\d|\d+\s?%|\d+x\b/.test(medCopy), (medCopy.match(/.{30}(\$\s?\d|\d+\s?%).{20}/) ?? [''])[0]);
ok('medical: $300 setup + $87/month + 5% of eligible net collections', MEDICAL_BILLING_OFFER.setupCents === 30000 && MEDICAL_BILLING_OFFER.monthlyCents === 8700 && MEDICAL_BILLING_OFFER.collectionsBps === 500 && medicalLine() === '$300 setup + $87/month + 5% of eligible net collections', medicalLine());
ok('medical: its own constant, never the trade performance fee', !('performanceBps' in MEDICAL_BILLING_OFFER) && MEDICAL_BILLING_OFFER.id === 'medical_billing');
ok('medical: the basis is claims handled under the agreement, not the practice’s revenue', /claims we submitted or worked under your signed agreement/.test(MEDICAL_BILLING_OFFER.feeBasis) && /not a percentage of your practice’s total revenue/i.test(MEDICAL_BILLING_OFFER.feeBasis));
ok('medical: refunds and take-backs come off; unpaid and estimated amounts never count', MEDICAL_BILLING_OFFER.excluded.some(x => /Refunds, recoupments/.test(x)) && MEDICAL_BILLING_OFFER.excluded.some(x => /not yet paid/.test(x)));
ok('medical: subject to legal and compliance review, said beside the price', /subject to legal and compliance review/i.test(MEDICAL_BILLING_OFFER.review));
ok('medical: nothing is charged automatically', MEDICAL_BILLING_OFFER.billing.some(b => /Nothing is charged to a card automatically/.test(b)));
ok('medical: the example is computed — $20,000 → $1,000', /\$20,000/.test(medicalExample()) && /\$1,000/.test(medicalExample()), medicalExample());
ok('medical: the audit flags issues for review and does not claim proof', /flags potential issues for a person to review/.test(MED.MED_AUDIT.body) && /not proof that money was lost/.test(MED.MED_AUDIT.body));
ok('medical: never claims HIPAA compliance or certification', !/(we are|is|are fully) HIPAA|HIPAA[- ]certified (practice|service|provider)|fully secure|guarantee[sd]? (a |more )?(recover|revenue|payment)/i.test(medText.replace(/do not claim one|do not describe ourselves as “HIPAA certified”|no official HIPAA certification|Are you HIPAA compliant\?|Do you guarantee/g, '')));
ok('medical: no testimonials', !/testimonial|said about us|our clients say/i.test(medText));

const [h, r] = [INDUSTRIES.hvac, INDUSTRIES.roofing];
ok('the two pages are written separately', h.hero.lead !== r.hero.lead
  && h.problems.filter(p => r.problems.some(q => q.pain === p.pain)).length === 0
  && h.faq[0].q !== r.faq[0].q);

/* Routes and hosts. */
ok('/hvac and /hvac/ are the HVAC page', industryFor('/hvac')?.slug === 'hvac' && industryFor('/hvac/')?.slug === 'hvac');
ok('/roofing is the roofing page', industryFor('/roofing')?.slug === 'roofing');
ok('/medical-billing is the medical page', industryFor('/medical-billing')?.slug === 'medical-billing' && industryFor('/medical-billing/')?.slug === 'medical-billing');
ok('other paths are not trade pages', !industryFor('/') && !industryFor('/hvacs') && !industryFor('/pricing'));
ok('our own hosts speak as us', ['protectedcentral.com', 'www.protectedcentral.com', 'app.protectedcentral.com', 'testing.protectedcentral.com', 'localhost'].every(speaksAsUs));
ok('a reseller subdomain or domain does not', !speaksAsUs('acme.protectedcentral.com') && !speaksAsUs('portal.acme-agency.com'));
ok('the sitemap is only on the public site', isSiteHost('protectedcentral.com') && !isSiteHost('app.protectedcentral.com'));
ok('the sitemap lists every microsite and the booking page', ['/hvac', '/roofing', '/medical-billing', '/ecommerce-management-services', '/book/strategy-call'].every(p => SITEMAP_PATHS.includes(p)));
ok('/ecommerce-management-services is the e-commerce page', industryFor('/ecommerce-management-services')?.slug === 'ecommerce' && industryFor('/ecommerce-management-services/')?.slug === 'ecommerce');
ok('the e-commerce short addresses redirect to the one canonical page, and are not pages themselves', Object.values(PAGE_ALIASES).every(p => p === '/ecommerce-management-services') && Object.keys(PAGE_ALIASES).every(a => !industryFor(a) && !SITEMAP_PATHS.includes(a)));
const wrangler = readFileSync(new URL('../wrangler.jsonc', import.meta.url), 'utf8');
ok('the Worker runs first for the e-commerce page and its aliases (head and redirects)', ['/ecommerce-management-services', ...Object.keys(PAGE_ALIASES)].every(p => wrangler.includes(`"${p}"`)));

/* E-commerce: the managed service, its price and its honesty. */
const ecomText = JSON.stringify({ ...ECOM, ECOMMERCE_OFFER }, (_k, v) => (typeof v === 'function' ? undefined : v));
const ecomCopy = JSON.stringify(ECOM, (_k, v) => (typeof v === 'function' ? undefined : v));
ok('e-commerce: $2,200/month, no performance fee', ECOMMERCE_OFFER.monthlyCents === 220000 && ecommerceLine() === '$2,200/month' && !('performanceBps' in ECOMMERCE_OFFER));
ok('e-commerce: the offer is named as approved', ECOMMERCE_OFFER.name === 'E-commerce Business Setup & Growth Management' && ECOM.ECOM_HERO.h1 === ECOMMERCE_OFFER.name);
ok('e-commerce: ad spend, inventory, marketplace fees, shipping/payment fees and third-party apps are separate', ['Advertising spend', 'Inventory', 'Marketplace commissions', 'Shipping', 'themes, apps'].every(w => ECOMMERCE_OFFER.separate.some(x => x.includes(w))));
ok('e-commerce: no revenue, ROAS or profit guarantee', /do not guarantee revenue, sales volume, return on ad spend, profit/.test(ECOMMERCE_OFFER.noGuarantee) && !/guarantee[sd]? (more )?(sales|revenue|roas|profit)/i.test(ecomCopy.replace(/do not guarantee/gi, '').replace(/Do you guarantee/g, '')));
ok('e-commerce: says no marketplace is connected and nothing publishes automatically', /does not connect to Amazon, eBay, Walmart or Shopify/.test(ECOM.ECOM_PLATFORM_NOTE) && /nothing is published or changed on them automatically/.test(ECOM.ECOM_PLATFORM_NOTE));
ok('e-commerce: never claims an integration, partnership or certification', !/(integrated|integration) with (amazon|ebay|walmart|shopify)|official partner|certified partner|amazon partner|shopify partner/i.test(ecomText));
ok('e-commerce: nothing promised unlimited', !/\bunlimited\b/i.test(ecomCopy.replace(/not unlimited|Nothing is unlimited/gi, '')));
ok('e-commerce: Walmart is subject to eligibility and approval', ECOM.ECOM_PLATFORMS.some(p => /Walmart/.test(p.title) && /eligibility and approval/.test(p.note ?? '')));
ok('e-commerce: SMS only with consent', ECOM.ECOM_HANDLE.some(g => g.items.some(i => /SMS marketing only to customers who gave consent/.test(i))));
ok('e-commerce: no testimonials', !/testimonial|said about us|our clients say/i.test(ecomText));
ok('e-commerce: the search terms are on the page in plain words', ['e-commerce management services', 'e-commerce business management', 'store management', 'e-commerce setup and marketing'].every(w => (ecomCopy + src('EcommercePage.tsx')).toLowerCase().includes(w)) && /Amazon, eBay, Shopify and Walmart/.test(src('EcommercePage.tsx')));
ok('e-commerce: one h1', (src('EcommercePage.tsx').match(/<h1\b/g) ?? []).length === 1);

/* Structured data quotes the offer each page shows. */
for (const m of Object.values(INDUSTRY_PAGES)) {
  const data = JSON.parse(industryJsonLd(m)) as { '@type': string; offers?: { name: string; price: string }[] }[];
  const offers = data.find(d => d['@type'] === 'Service')?.offers ?? [];
  if (m.slug === 'ecommerce') ok('ecommerce: structured data is the one monthly price', offers.map(o => o.price).join() === '2200.00', JSON.stringify(offers));
  else ok(`${m.slug}: structured data prices are its offer's setup and monthly fee`, offers.map(o => o.price).join() === '300.00,87.00', JSON.stringify(offers));
  if (m.slug === 'medical-billing') ok('medical-billing: structured data says the percentage is of eligible net collections, subject to review', /eligible net collections on claims handled/.test(industryJsonLd(m)) && /legal and compliance review/.test(industryJsonLd(m)));
  ok(`${m.slug}: title and description are set`, m.title.length > 20 && m.description.length > 80 && m.description.length < 300);
}

console.log(out.join('\n'));
const failed = out.filter(l => l.startsWith('FAIL')).length;
console.log(`\n${out.length - failed}/${out.length} passed`);
process.exit(failed ? 1 : 0);
