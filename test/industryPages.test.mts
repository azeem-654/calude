/**
 * The trade pages (/hvac, /roofing) say only what something else holds them to.
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
import { PLAN_DEFS } from '../worker/src/lib/allowances';
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

const [h, r] = [INDUSTRIES.hvac, INDUSTRIES.roofing];
ok('the two pages are written separately', h.hero.lead !== r.hero.lead
  && h.problems.filter(p => r.problems.some(q => q.pain === p.pain)).length === 0
  && h.faq[0].q !== r.faq[0].q);

/* Routes and hosts. */
ok('/hvac and /hvac/ are the HVAC page', industryFor('/hvac')?.slug === 'hvac' && industryFor('/hvac/')?.slug === 'hvac');
ok('/roofing is the roofing page', industryFor('/roofing')?.slug === 'roofing');
ok('other paths are not trade pages', !industryFor('/') && !industryFor('/hvacs') && !industryFor('/pricing'));
ok('our own hosts speak as us', ['protectedcentral.com', 'www.protectedcentral.com', 'app.protectedcentral.com', 'testing.protectedcentral.com', 'localhost'].every(speaksAsUs));
ok('a reseller subdomain or domain does not', !speaksAsUs('acme.protectedcentral.com') && !speaksAsUs('portal.acme-agency.com'));
ok('the sitemap is only on the public site', isSiteHost('protectedcentral.com') && !isSiteHost('app.protectedcentral.com'));
ok('the sitemap lists both trade pages', SITEMAP_PATHS.includes('/hvac') && SITEMAP_PATHS.includes('/roofing'));

/* Structured data quotes the prices checkout charges. */
for (const m of Object.values(INDUSTRY_PAGES)) {
  const data = JSON.parse(industryJsonLd(m)) as { '@type': string; offers?: { name: string; price: string }[] }[];
  const offers = data.find(d => d['@type'] === 'SoftwareApplication')?.offers ?? [];
  const want = PLAN_DEFS.filter(p => p.kind === 'self' && p.monthlyCents > 0).map(p => `${p.name}:${(p.monthlyCents / 100).toFixed(2)}`);
  ok(`${m.slug}: structured data prices are the plan table's`, offers.map(o => `${o.name}:${o.price}`).join() === want.join(), JSON.stringify(offers));
  ok(`${m.slug}: title and description are set`, m.title.length > 20 && m.description.length > 80 && m.description.length < 300);
}

console.log(out.join('\n'));
const failed = out.filter(l => l.startsWith('FAIL')).length;
console.log(`\n${out.length - failed}/${out.length} passed`);
process.exit(failed ? 1 : 0);
