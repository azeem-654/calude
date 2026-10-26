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
import { MEDICAL_BILLING_OFFER, TRADE_GROWTH_OFFER, feeOn, growthFaq, growthLine } from '../worker/src/lib/offers';
import {
  INDUSTRY_PAGES, SITEMAP_PATHS, industryFor, industryJsonLd, isSiteHost, speaksAsUs,
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
const sites = [INDUSTRIES.hvac.site, INDUSTRIES.roofing.site, MED.MEDICAL_SITE];
for (const site of sites) {
  const hrefs = site.nav.map(l => l.href);
  ok(`${site.id}: the menu is in-page anchors only`, hrefs.every(h => h.startsWith('#')), hrefs.join());
  ok(`${site.id}: home is its own root`, site.root === `/${site.id}`);
  ok(`${site.id}: books with its own words`, /Book|Request/.test(site.bookLabel));
}
ok('the three sites book with different words', new Set(sites.map(s => s.bookLabel)).size === 3);
ok('the medical site has its required sections', ['#audit', '#claims', '#ar', '#reporting', '#security', '#process', '#pricing', '#faq'].every(h => MED.MEDICAL_SITE.nav.some(l => l.href === h)));

/* The growth offer is the approved one, and the fee arithmetic matches the brief. */
ok('growth offer: $300 setup, $87 a month, 5%', TRADE_GROWTH_OFFER.setupCents === 30000 && TRADE_GROWTH_OFFER.monthlyCents === 8700 && TRADE_GROWTH_OFFER.performanceBps === 500);
ok('growth line reads as approved', growthLine() === '$300 setup + $87/month + 5% performance fee on eligible attributed collections', growthLine());
ok('fee on $8,000 is $400, on $3,000 is $150', feeOn(800_000, 500) === 40_000 && feeOn(300_000, 500) === 15_000);
ok('no fee on nothing, refunds or a negative', feeOn(0, 500) === 0 && feeOn(-5000, 500) === 0);
ok('fee rounds once, half up, to the cent', feeOn(1_010, 500) === 51 && feeOn(1_009, 500) === 50);
ok('ad budget and third-party charges are separate', TRADE_GROWTH_OFFER.separate.some(x => /Advertising/.test(x.title)) && TRADE_GROWTH_OFFER.separate.some(x => /third-party/i.test(x.title)));
ok('the fee basis excludes the whole business', /Not your existing customers/.test(TRADE_GROWTH_OFFER.feeBasis));
ok('the growth FAQ worked example is $400 and $150', /\$400/.test(growthFaq()[0].a) && /\$150/.test(growthFaq()[0].a));

/* Medical billing never inherits the trade figures. */
const medText = JSON.stringify({ ...MED, MEDICAL_BILLING_OFFER }, (_k, v) => (typeof v === 'function' ? undefined : v));
ok('medical: no dollar figure, percentage or multiplier', !/\$\s?\d|\d+\s?%|\d+x\b/.test(medText), (medText.match(/.{30}(\$\s?\d|\d+\s?%).{20}/) ?? [''])[0]);
ok('medical: priced by assessment', MEDICAL_BILLING_OFFER.pricing === 'assessment' && !('performanceBps' in MEDICAL_BILLING_OFFER));
ok('medical: says the trade fee does not apply', /does not apply/.test(MEDICAL_BILLING_OFFER.note));
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
ok('the sitemap lists every microsite and the booking page', ['/hvac', '/roofing', '/medical-billing', '/book/strategy-call'].every(p => SITEMAP_PATHS.includes(p)));

/* Structured data quotes the offer the pages show — and medical billing quotes nothing. */
for (const m of Object.values(INDUSTRY_PAGES)) {
  const data = JSON.parse(industryJsonLd(m)) as { '@type': string; offers?: { name: string; price: string }[] }[];
  const offers = data.find(d => d['@type'] === 'Service')?.offers ?? [];
  if (m.slug === 'medical-billing') ok('medical-billing: structured data carries no price', offers.length === 0 && !/"price"/.test(industryJsonLd(m)));
  else ok(`${m.slug}: structured data prices are the growth offer's`, offers.map(o => o.price).join() === '300.00,87.00', JSON.stringify(offers));
  ok(`${m.slug}: title and description are set`, m.title.length > 20 && m.description.length > 80 && m.description.length < 300);
}

console.log(out.join('\n'));
const failed = out.filter(l => l.startsWith('FAIL')).length;
console.log(`\n${out.length - failed}/${out.length} passed`);
process.exit(failed ? 1 : 0);
