/**
 * The parts of the prospect finder that do not need a network.
 *
 * Run with `npm run test:prospects`. Overpass itself cannot be exercised here —
 * and that is the point of splitting it this way: the query builder, the
 * mapping from an OSM element to a lead, the deduplication and the email
 * filtering are where the judgement lives, and all four are testable without
 * asking a volunteer-run service anything.
 *
 * The email filter gets the most attention because it is the one that produces
 * a *wrong* answer rather than no answer. A prospect list quietly full of
 * theme authors and WordPress support addresses looks exactly like a prospect
 * list until somebody mails it.
 */
import { harvest, overpassQuery, safeTerm, toProspect, type OsmElement } from '../src/lib/prospects';

const out: string[] = [];
const ok = (n: string, p: boolean, d = '') => out.push(`${p ? 'PASS' : 'FAIL'}  ${n}${p ? '' : ` — ${d}`}`);

/* ── The query cannot be broken out of ── */
{
  /* Asserted on the sanitiser rather than on the finished query: the template
     itself legitimately contains `"];`, so searching the whole string for it
     fails on the tool's own punctuation and proves nothing. */
  for (const nasty of ['plumber"]; out; //', "plumber'); drop--", 'plumber[a-z]{99}', 'plumber\n(nwr;)']) {
    ok(`nothing to break out with survives: ${JSON.stringify(nasty)}`,
      /^[a-z0-9 ]*$/.test(safeTerm(nasty)), safeTerm(nasty));
  }
  ok('and the word itself survives', safeTerm('plumber"]; out; //').startsWith('plumber'));
  ok('a term is capped so it cannot be a regex bomb', safeTerm('a'.repeat(500)).length <= 40);
  const q = overpassQuery('plumber', 'Manchester');
  const clean = q;
  ok('all five business tag families are searched',
    ['craft', 'shop', 'office', 'healthcare', 'amenity'].every(k => clean.includes(`["${k}"~`)));
  ok('and a name match must also have a website to count', clean.includes('["name"~"plumber",i]["website"]'));
}

/* ── An element becomes a lead, or is dropped ── */
const el = (tags: Record<string, string>, id = 1): OsmElement => ({ type: 'node', id, lat: 53.4, lon: -2.2, tags });

ok('an unnamed point is not a business anybody can contact',
  toProspect(el({ craft: 'plumber' })) === null);
ok('a named point with no business tag is a guess, not a lead',
  toProspect(el({ name: 'Bob' })) === null);

{
  const p = toProspect(el({
    name: 'Bob the Plumber', craft: 'plumber',
    'contact:phone': '+44 161 555 0100; +44 7700 900000',
    'contact:website': 'https://bobtheplumber.co.uk',
    'contact:email': 'Bob@BobThePlumber.co.uk',
    'addr:housenumber': '12', 'addr:street': 'Oxford Road', 'addr:city': 'Manchester', 'addr:postcode': 'M1 5QA',
  }));
  ok('the contact: spellings are read as well as the plain ones', p?.phone === '+44 161 555 0100', p?.phone);
  ok('a semicolon-separated list takes the first, not the whole string', !p?.phone.includes(';'));
  ok('the website comes through', p?.website === 'https://bobtheplumber.co.uk', p?.website);
  ok('the address is lower-cased', p?.email === 'bob@bobtheplumber.co.uk', p?.email);
  ok('the address lines are joined in postal order', p?.address === '12 Oxford Road Manchester M1 5QA', p?.address);
  ok('the category is readable rather than an OSM key', p?.category === 'plumber', p?.category);
  ok('the ref identifies the element', p?.ref === 'node/1', p?.ref);
}

{
  const p = toProspect(el({ name: 'Smith & Co', office: 'estate_agent' }));
  ok('an underscored OSM value is turned into words', p?.category === 'estate agent', p?.category);
}

/* ── Email harvesting: mostly about what it refuses ── */
{
  const page = `
    Contact us: Hello@BobThePlumber.co.uk or bookings@bobtheplumber.co.uk.
    Theme by wonderthemes — support@wordpress.com
    Photos from someone@example.com
    no-reply@bobtheplumber.co.uk
    Our accountant: ledgers@someaccountant.co.uk
    Emergencies: emergency@bobtheplumber.co.uk.
  `;
  const found = harvest(page, 'www.bobtheplumber.co.uk');
  ok('published addresses on the business’s own domain are kept',
    found.includes('hello@bobtheplumber.co.uk') && found.includes('bookings@bobtheplumber.co.uk'), found.join(','));
  ok('the theme author is not a prospect', !found.some(e => e.includes('wordpress.com')), found.join(','));
  ok('nor is the stock photo library', !found.some(e => e.includes('example.com')), found.join(','));
  ok('no-reply is not somebody to write to', !found.includes('no-reply@bobtheplumber.co.uk'), found.join(','));
  ok('and neither is their accountant, who is on another domain',
    !found.some(e => e.includes('someaccountant')), found.join(','));
  ok('a trailing full stop is not part of the address',
    found.every(e => !e.endsWith('.')), found.join(','));
  ok('www. is not treated as a different company', found.length >= 3, found.join(','));
}
{
  const many = harvest(Array.from({ length: 20 }, (_, i) => `a${i}@x.co.uk`).join(' '), 'x.co.uk');
  ok('a page listing every staff address gives five, not twenty', many.length === 5, String(many.length));
}

console.log(out.join('\n'));
const failed = out.filter(l => l.startsWith('FAIL')).length;
console.log(`\n${out.length - failed}/${out.length} passed`);
if (failed) process.exit(1);
