/**
 * The company register as a prospect source — the parts that decide, without
 * a network (worker/src/lib/companiesHouse.ts).
 *
 *   npm run test:register
 *
 * The trade → SIC mapping is what turns a word into a search, and a wrong code
 * returns a confident list of the wrong businesses; the officer filter is what
 * keeps a director who resigned in 2020 off somebody's call sheet.
 */
import { activeOfficers, officerName, sicFor, toRegisterProspect } from '../src/lib/companiesHouse';

const out: string[] = [];
const ok = (n: string, p: boolean, d = '') => out.push(`${p ? 'PASS' : 'FAIL'}  ${n}${p ? '' : ` — ${d}`}`);
const eq = (n: string, got: unknown, want: unknown) => ok(n, JSON.stringify(got) === JSON.stringify(want), `got ${JSON.stringify(got)}`);

eq('dentists → dental practice', sicFor('dentists'), ['86230']);
eq('accountants → the three accounting codes', sicFor('Accountants'), ['69201', '69202', '69203']);
eq('plumbers → plumbing and heating', sicFor('plumbers'), ['43220']);
eq('cafés with an accent', sicFor('cafés'), ['56102']);
eq('hair salons', sicFor('hair salons'), ['96020']);
eq('a trade with no code is null, never a guess', sicFor('unicorn groomers'), null);
eq('"SMITH, John Andrew" reads as a name', officerName('SMITH, John Andrew'), 'John Andrew Smith');
eq('a corporate officer with no comma', officerName('ACME HOLDINGS LTD'), 'Acme Holdings LTD');
{
  const o = activeOfficers([
    { name: 'OLD, Gone', officer_role: 'director', resigned_on: '2020-01-01' },
    { name: 'CLERK, Sam', officer_role: 'secretary' },
    { name: 'SHAH, Priya', officer_role: 'director' },
    { name: 'NOBODY, X', officer_role: 'judicial-factor' },
  ]);
  eq('serving officers only, directors first', o.map(x => x.name), ['Priya Shah', 'Sam Clerk']);
  eq('…with their role in words', o[0].role, 'Director');
}
{
  const p = toRegisterProspect({ company_name: 'PARK ROW ACCOUNTANTS LTD', company_number: '01234567', date_of_creation: '2015-04-01',
    registered_office_address: { address_line_1: '9 Park Row', locality: 'Leeds', postal_code: 'LS1 5HD' } }, 'accountants');
  ok('a company becomes a lead with its number, page and address, and no invented website or email',
    !!p && p.ref === 'ch:01234567' && p.source === 'register' && p.name === 'Park Row Accountants LTD' && p.website === '' && p.email === ''
    && p.address === '9 Park Row, Leeds, LS1 5HD' && /\/company\/01234567$/.test(p.registerUrl ?? ''), JSON.stringify(p));
  ok('no name or number → dropped', toRegisterProspect({ company_name: 'X' }, 'a') === null);
}

console.log(out.join('\n'));
const failed = out.filter(l => l.startsWith('FAIL')).length;
console.log(`\n${out.length - failed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
