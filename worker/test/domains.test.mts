/**
 * What a domain search actually looks up.
 *
 * Run with `npm run test:domains`. No registrar, no database, no network —
 * `domainCandidates` is pure precisely so the thing that was wrong here can be
 * argued with rather than clicked at.
 *
 * The reported bug, in one line: a customer typed `asdfggg.com` into a project
 * called "Your first project" and was offered six `yourfirstproject.*` names.
 * The first four cases below are that, from both ends.
 */
import { domainCandidates, CANDIDATE_ROOM } from '../src/lib/domainSearch';

const out: string[] = [];
const ok = (n: string, p: boolean, d = '') => out.push(`${p ? 'PASS' : 'FAIL'}  ${n}${p ? '' : ` — ${d}`}`);

/* ── The bug that was reported ── */
{
  const r = domainCandidates('Your first project', 'asdfggg.com');
  ok('what was typed decides the stem', r.base === 'asdfggg', r.base);
  ok('the exact name asked for is offered first', r.candidates[0] === 'asdfggg.com', r.candidates[0]);
  ok('the project name appears nowhere',
    !r.candidates.some(c => c.includes('yourfirstproject')), r.candidates.join(', '));
  ok('and every suggestion is built from what was typed',
    r.candidates.every(c => c.includes('asdfggg')), r.candidates.join(', '));
}

/* ── The half that returned nothing of theirs at all ── */
{
  const r = domainCandidates('Your first project', 'bobsplumbing');
  ok('a word with no extension still searches for that word', r.base === 'bobsplumbing', r.base);
  ok('it is offered across the usual extensions',
    ['com', 'net', 'org'].every(t => r.candidates.includes(`bobsplumbing.${t}`)), r.candidates.join(', '));
  ok('nothing exact is claimed when no extension was given', r.exact === '', r.exact);
}

/* ── The company name is the fallback, not the default ── */
{
  const r = domainCandidates('ABC Roofing & Sons Ltd.', '');
  /* `&` becomes `and` and only the company-type words go, so this is the whole
     name. The docstring in the source claimed `abcroofing` for years and was
     simply wrong — which is how the short form below came to be missing. */
  ok('an empty box falls back to the business name', r.base === 'abcroofingandsons', r.base);
  ok('and offers it on the usual extensions', r.candidates.includes('abcroofingandsons.com'), r.candidates.join(', '));
  ok('with a shorter version, because nobody says that down a phone',
    r.candidates.includes('abcroofing.com'), r.candidates.join(', '));

  const brief = domainCandidates('Bobs Plumbing', '');
  ok('a name that is already short gets no pointless second version',
    !brief.candidates.some(c => c !== 'bobsplumbing.com' && /^bobs\.com$/.test(c)), brief.candidates.join(', '));

  const typedToo = domainCandidates('ABC Roofing & Sons Ltd.', 'zenith');
  ok('and the short form is not offered when they typed something of their own',
    !typedToo.candidates.some(c => c.includes('abcroofing')), typedToo.candidates.join(', '));

  const none = domainCandidates('', '');
  ok('with neither, there is nothing to search for', none.base === '' && none.candidates.length === 0);
}

/* ── Ideas, not just extensions ── */
{
  const r = domainCandidates('', 'bobsplumbing');
  ok('there are second choices beyond swapping the extension',
    r.candidates.some(c => c === 'getbobsplumbing.com') && r.candidates.some(c => c === 'bobsplumbinghq.com'),
    r.candidates.join(', '));
  ok('and they are .com, not get<name>.biz',
    r.candidates.filter(c => /^(get|try)/.test(c)).every(c => c.endsWith('.com')), r.candidates.join(', '));
}

/* ── Typed input is not a hostname until it has been made one ── */
{
  ok('capitals and spaces are folded',
    domainCandidates('', '  Bobs Plumbing .COM ').base === 'bobsplumbing',
    domainCandidates('', '  Bobs Plumbing .COM ').base);
  ok('punctuation somebody pasted cannot reach a lookup',
    /^[a-z0-9-]+$/.test(domainCandidates('', "bob's plumbing!!").base),
    domainCandidates('', "bob's plumbing!!").base);
  const two = domainCandidates('', 'bobs.co.uk');
  ok('a two-part extension survives', two.exact === 'bobs.co.uk', two.exact);
  const junk = domainCandidates('', 'bobs.123');
  ok('an extension that is not one is not claimed as exact', junk.exact === '', junk.exact);
  ok('and the stem is still searched anyway', junk.candidates.includes('bobs.com'), junk.candidates.join(', '));
}

/* ── Cost: every candidate is a billed lookup ── */
{
  const r = domainCandidates('A Very Long Business Name Indeed Limited', 'somethinglong.com');
  ok(`never more than ${CANDIDATE_ROOM} names in one search`,
    r.candidates.length <= CANDIDATE_ROOM, String(r.candidates.length));
  ok('and no duplicates, which would be paid for twice',
    new Set(r.candidates).size === r.candidates.length, r.candidates.join(', '));
}

console.log(out.join('\n'));
const failed = out.filter(l => l.startsWith('FAIL')).length;
console.log(`\n${out.length - failed}/${out.length} passed`);
if (failed) process.exit(1);
