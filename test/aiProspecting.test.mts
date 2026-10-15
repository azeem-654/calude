/**
 * AI Prospecting's judgement, without a browser (src/services/aiProspecting.ts).
 *
 *   npm run test:aiprospecting
 *
 * The sentence parser decides what is searched for, so a wrong split is a
 * wrong search the customer pays for in credits and time. The address choice
 * decides what is imported — an address a check already said would bounce
 * must never be the one used.
 */
import { addressesOf, askProblem, askSentence, bestAddress, chooseSource, leadScore, parseAsk, splitTradePlace, toCsv } from '../src/services/aiProspecting.ts';
import { extractKnown } from '../src/services/projectIntake.ts';
import type { Prospect, Verdict } from '../src/services/prospects.ts';
import { emailTag } from '../src/services/prospectImport.ts';

const out: string[] = [];
const ok = (n: string, p: boolean, d = '') => out.push(`${p ? 'PASS' : 'FAIL'}  ${n}${p ? '' : ` — ${d}`}`);
const eq = (n: string, got: unknown, want: unknown) => ok(n, JSON.stringify(got) === JSON.stringify(want), `got ${JSON.stringify(got)}`);

/* ── Sentences ── */
const ask = (t: string) => { const a = parseAsk(t); return a ? [a.trade, a.place] : null; };
eq('plain', ask('dentists in Leeds'), ['dentists', 'Leeds']);
eq('a verb in front', ask('Find dentists in Leeds'), ['dentists', 'Leeds']);
eq('"search for" and "near"', ask('search for cafés near Bristol.'), ['cafés', 'Bristol']);
eq('"show me all the"', ask('Show me all the hair salons in Manchester'), ['hair salons', 'Manchester']);
eq('the last "in" is the place', ask('bed and breakfasts in Bath'), ['bed and breakfasts', 'Bath']);
eq('a hyphenated town stays whole', ask('builders in Stoke-on-Trent'), ['builders', 'Stoke-on-Trent']);
{
  const k = extractKnown('Med spa in Miami, Florida. The clinic wants consultations booked.', ['lead-generation'], { portfolios: [], workspace: null }, [], []);
  eq('a sentence after the place is not part of it', k.location?.value ?? null, 'Miami, Florida');
}
eq('a region with a comma', ask('Find accountants in Austin, Texas'), ['accountants', 'Austin, Texas']);
eq('"local" is not part of the trade', ask('find local plumbers in Leeds'), ['plumbers', 'Leeds']);
{
  const a = parseAsk('Find dentists in Leeds with a website');
  ok('"with a website" is a narrowing, not part of the place', a?.place === 'Leeds' && a.want.website && !a.want.email, JSON.stringify(a));
  const b = parseAsk('get me 50 roofers near Bristol that have email addresses');
  ok('"that have email addresses" and a number', b?.trade === 'roofers' && b.place === 'Bristol' && b.want.email, JSON.stringify(b));
}
ok('no place → null, so the page asks for one', parseAsk('find dentists') === null);
ok('empty → null', parseAsk('   ') === null);
ok('no kind of business → null', parseAsk('in Leeds') === null);

/* ── What is missing, asked for rather than searched blind ── */
{
  const a = askProblem('dentists');
  ok('a trade with no place asks where, naming the trade', a?.field === 'place' && /Where should I look for dentists\?/.test(a.message) && a.trade === 'dentists', JSON.stringify(a));
  const b = askProblem('in Leeds');
  ok('a place with no trade asks what kind, naming the place', b?.field === 'trade' && /What kind of business in Leeds\?/.test(b.message) && b.place === 'Leeds', JSON.stringify(b));
  ok('nothing typed asks who', askProblem('  ')?.field === 'trade');
  ok('"registered companies in Leeds" still needs a kind of business — the register searches by trade', askProblem('registered companies in Leeds')?.field === 'trade', JSON.stringify(askProblem('registered companies in Leeds')));
  ok('a whole sentence has no problem', askProblem('Find dentists in Leeds with a website') === null);
}

/* ── Which source the sentence asks for ── */
const src = (t: string) => { const a = parseAsk(t); return a ? [a.trade, a.place, a.source] : null; };
eq('plain is all businesses', src('dentists in Leeds'), ['dentists', 'Leeds', 'free']);
eq('"registered companies" prefix', src('registered companies: accountants in Leeds'), ['accountants', 'Leeds', 'register']);
eq('"limited companies" after the trade', src('accountants limited companies in Leeds'), ['accountants', 'Leeds', 'register']);
eq('"registered dental companies" keeps the trade between', src('Find registered dental companies in Leeds'), ['dental', 'Leeds', 'register']);
eq('"from Companies House" is not part of the place', src('accountants in Leeds from Companies House'), ['accountants', 'Leeds', 'register']);
eq('"on the company register"', src('accountants in Leeds on the company register'), ['accountants', 'Leeds', 'register']);
eq('"with their directors"', src('accountants in Leeds with their directors'), ['accountants', 'Leeds', 'register']);
eq('"with reviews" is Google, not part of the place', src('dentists in Leeds with reviews'), ['dentists', 'Leeds', 'google']);
eq('"with ratings and reviews"', src('cafés near Bristol with ratings and reviews'), ['cafés', 'Bristol', 'google']);
eq('"on Google Maps"', src('plumbers in Manchester on Google Maps'), ['plumbers', 'Manchester', 'google']);
eq('"top-rated"', src('top-rated hair salons in York'), ['hair salons', 'York', 'google']);
{
  const a = parseAsk('dentists in Leeds with a website and reviews');
  ok('"with a website and reviews": both read, neither in the place', a?.place === 'Leeds' && a.want.website && a.source === 'google', JSON.stringify(a));
  const b = parseAsk('dentists in Leeds with reviews and an email');
  ok('"with reviews and an email"', b?.place === 'Leeds' && b.want.email && b.source === 'google', JSON.stringify(b));
}
ok('the same sentence twice reads the same (no regex state carried over)', JSON.stringify(parseAsk('accountants in Leeds from Companies House')) === JSON.stringify(parseAsk('accountants in Leeds from Companies House')));
eq('"registered nurses" is not the register when no company is named', src('registered nurses agencies in Leeds')?.[2], 'free');

/* ── What is asked, given what is switched on ── */
{
  const allOn = { available: true, register: { available: true } };
  const allOff = { available: false, code: 'no_key', register: { available: false, code: 'no_key' } };
  eq('all businesses whatever is on', chooseSource('free', allOff), { source: 'free', note: '' });
  eq('the register when its key is set', chooseSource('register', allOn), { source: 'register', note: '' });
  eq('ratings when Google is on', chooseSource('google', allOn), { source: 'google', note: '' });
  const r = chooseSource('register', allOff);
  ok('the register when its key is not set → all businesses, and said', r.source === 'free' && /Registered companies .* not switched on .* all businesses instead/.test(r.note), JSON.stringify(r));
  const g = chooseSource('google', allOff);
  ok('ratings when Google is off → all businesses, and said, no supplier named', g.source === 'free' && /Ratings and reviews are not switched on/.test(g.note) && !/Google/.test(g.note), JSON.stringify(g));
  const t = chooseSource('google', { available: false, code: 'trial_ended', register: { available: true } });
  ok('an ended trial says so', t.source === 'free' && /trial ended/.test(t.note), JSON.stringify(t));
  eq('not known yet → what was asked, for the server to answer', chooseSource('register', null), { source: 'register', note: '' });
}
eq('a search reads back as a sentence with its source', ['free', 'register', 'google'].map(x => parseAsk(askSentence('accountants', 'Leeds', x as 'free'))?.source), ['free', 'register', 'google']);

/* ── Which address ── */
const p = (o: Partial<Prospect>): Prospect => ({ ref: 'r', name: 'Biz', phone: '', website: 'https://biz.example', email: '', address: '', category: '', lat: 0, lon: 0, ...o });
const v = (email: string, status: Verdict['status']): Verdict => ({ email, status, reason: '', level: 'basic', provider: '', role: false, free: false, disposable: false, checkedAt: '' });
{
  const found = { 'https://biz.example': { emails: ['info@biz.example'], mx: true, people: [{ email: 'sam@biz.example', name: 'Sam Lee', position: 'Owner', type: 'personal' as const, sources: 2, confidence: 90 }] } };
  eq('every address, the map first, then the site, then people, once each', addressesOf(p({ email: 'INFO@biz.example' }), found), ['info@biz.example', 'sam@biz.example']);
  eq('the first that has not bounced', bestAddress(p({}), found, { 'info@biz.example': v('info@biz.example', 'invalid') }), 'sam@biz.example');
  eq('nothing, when every one bounced', bestAddress(p({}), found, { 'info@biz.example': v('info@biz.example', 'invalid'), 'sam@biz.example': v('sam@biz.example', 'invalid') }), '');
}

/* ── The score is the sum of its parts, and says so ── */
eq('nothing at all is 0', leadScore(p({ website: '' }), '', undefined, null), 0);
eq('verified email, phone, website, person, 4.6★ is 100', leadScore(p({ phone: '1', rating: 4.6 }), 'a@b.c', v('a@b.c', 'valid'), { email: 'a@b.c', name: 'A', position: '', type: 'personal', sources: 1, confidence: 1 }), 100);
eq('a domain-only check scores less than a verified one', leadScore(p({}), 'a@b.c', v('a@b.c', 'domain_ok'), null) < leadScore(p({}), 'a@b.c', v('a@b.c', 'valid'), null), true);
eq('an invalid address adds nothing', leadScore(p({ website: '' }), 'a@b.c', v('a@b.c', 'invalid'), null), 0);

/* ── The tag an address's check puts on the contact ── */
eq('verified → "verified email"', emailTag(v('a@b.c', 'valid')), 'verified email');
eq('domain only → "email domain ok", never "verified"', emailTag(v('a@b.c', 'domain_ok')), 'email domain ok');
eq('bounces → "email bounces"', emailTag(v('a@b.c', 'invalid')), 'email bounces');
eq('never checked → no tag at all', emailTag(undefined), '');

/* ── CSV ── */
{
  const csv = toCsv([{ p: p({ name: '=HYPERLINK("http://evil")', address: 'Line 1, Leeds' }), email: 'a@b.c', v: v('a@b.c', 'valid'), person: null, score: 55 }]);
  const line = csv.split('\r\n')[1];
  ok('a formula in a business name is defused', line.startsWith(`"'=HYPERLINK(""http://evil"")"`), line);
  ok('a comma is quoted, and the check is in words', line.includes('"Line 1, Leeds"') && line.includes(',Contact verified,'), line);
}

/* A place typed into the trade box is a place, not part of the trade. */
{
  const x = splitTradePlace('commercial properties in virginia');
  ok('"commercial properties in virginia" is a trade and a place', x.trade === 'commercial properties' && x.place === 'Virginia', JSON.stringify(x));
  ok('a plain trade is left alone', JSON.stringify(splitTradePlace('dentists')) === JSON.stringify({ trade: 'dentists', place: '' }));
  const k = extractKnown('Find me commercial properties in virginia and email them to book appointments', ['lead-generation'], { portfolios: [] });
  ok('the request\'s audience keeps its place out of the trade', String(k.prospectTrades?.value ?? '') === 'commercial properties' && String(k.prospectPlaces?.value ?? '') === 'Virginia',
    JSON.stringify({ t: k.prospectTrades?.value, p: k.prospectPlaces?.value }));
}

console.log(out.join('\n'));
const failed = out.filter(l => l.startsWith('FAIL')).length;
console.log(`\n${out.length - failed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
