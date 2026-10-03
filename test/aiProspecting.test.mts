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
import { addressesOf, bestAddress, leadScore, parseAsk, toCsv } from '../src/services/aiProspecting.ts';
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
  ok('a comma is quoted, and the check is in words', line.includes('"Line 1, Leeds"') && line.includes(',Verified,'), line);
}

console.log(out.join('\n'));
const failed = out.filter(l => l.startsWith('FAIL')).length;
console.log(`\n${out.length - failed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
