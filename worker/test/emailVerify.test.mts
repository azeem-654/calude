/**
 * Email verification for AI Prospecting — the parts that decide, without a
 * network (worker/src/lib/emailVerify.ts).
 *
 * Run with `npm run test:emailverify`.
 *
 * The thing most worth proving is the line between `domain_ok` and `valid`.
 * The free checks can say a domain takes mail; only a verifier that talked to
 * the mail server can say the mailbox exists. A basic pass that came back
 * `valid` would be a green tick on an address nobody checked — and the
 * customer would find out when it bounced.
 */
import {
  addressFacts, basicVerdict, mapProvider, normaliseEmail, peopleFromHunter, syntaxOk, domainOf,
} from '../src/lib/emailVerify';

const out: string[] = [];
const ok = (n: string, p: boolean, d = '') => out.push(`${p ? 'PASS' : 'FAIL'}  ${n}${p ? '' : ` — ${d}`}`);
const dns = (o: Partial<{ exists: boolean; mx: boolean; nullMx: boolean; a: boolean }>) => ({ exists: true, mx: true, nullMx: false, a: true, ...o });

/* ── The address alone ── */
for (const good of ['hello@leedsdental.co.uk', 'sarah.chen@mintly.ai', 'a@b.io', 'first_last+tag@sub.example.com']) {
  ok(`well formed: ${good}`, syntaxOk(good));
}
for (const bad of ['hello@', '@x.com', 'a..b@x.com', 'hello@localhost', 'x@1.2.3.4', '.a@x.com', 'a@x.c', 'image@2x.png.']) {
  ok(`refused: ${bad}`, !syntaxOk(bad));
}
ok('mailto: and trailing punctuation are stripped', normaliseEmail(' MailTo:Hello@Shop.COM). ') === 'hello@shop.com', normaliseEmail(' MailTo:Hello@Shop.COM). '));
{
  const f = addressFacts('info@leedsdental.co.uk');
  ok('info@ is a role inbox, not free, not disposable', f.role && !f.free && !f.disposable, JSON.stringify(f));
  ok('info2@ is still a role inbox', addressFacts('info2@x.com').role);
  ok('sarah@ is not a role inbox', !addressFacts('sarah@x.com').role);
  ok('gmail is free webmail', addressFacts('bob@gmail.com').free);
  ok('mailinator is disposable, and so are its subdomains', addressFacts('x@mailinator.com').disposable && addressFacts('x@eu.mailinator.com').disposable);
}

/* ── The basic verdict — never "valid" ── */
{
  const v = basicVerdict('hello@leedsdental.co.uk', dns({}));
  ok('a domain with MX is domain_ok, not valid — the mailbox was not checked', v.status === 'domain_ok' && v.reason === 'mailbox_not_checked' && v.level === 'basic', JSON.stringify(v));
  ok('no basic verdict is ever valid', [dns({}), dns({ mx: false }), dns({ mx: false, a: false }), dns({ exists: false }), dns({ nullMx: true, mx: false }), null]
    .every(d => basicVerdict('a@b.com', d).status !== 'valid'));
  ok('NXDOMAIN is invalid', basicVerdict('a@nope.example', dns({ exists: false })).status === 'invalid');
  ok('a null MX (RFC 7505) is invalid', basicVerdict('a@b.com', dns({ mx: false, nullMx: true })).reason === 'null_mx');
  ok('no MX but an A record is risky, not invalid', basicVerdict('a@b.com', dns({ mx: false, a: true })).status === 'risky');
  ok('no MX and no A is invalid', basicVerdict('a@b.com', dns({ mx: false, a: false })).reason === 'no_mail_server');
  ok('a failed lookup is unknown — never "will bounce"', basicVerdict('a@b.com', null).status === 'unknown');
  ok('bad syntax is invalid before any lookup', basicVerdict('a..b@x.com', null).reason === 'bad_syntax');
  ok('a throwaway inbox with MX is risky', basicVerdict('a@yopmail.com', dns({})).reason === 'disposable');
}

/* ── The providers' words, mapped to ours ── */
{
  const h = (data: Record<string, unknown>, status = 200) => mapProvider('hunter', status, { data });
  ok('Hunter valid → valid', h({ status: 'valid', result: 'deliverable' }).status === 'valid');
  ok('Hunter accept_all → risky catch-all', h({ status: 'accept_all', result: 'risky', accept_all: true }).reason === 'catch_all');
  ok('Hunter invalid → invalid', h({ status: 'invalid', result: 'undeliverable' }).status === 'invalid');
  ok('Hunter 222 (server would not say) → unknown, not a key fault', (() => { const a = h({}, 222); return a.status === 'unknown' && !a.keyFault; })());
  ok('Hunter 401 → a key fault', mapProvider('hunter', 401, { errors: [{ id: 'authentication_failed', details: 'No user found' }] }).keyFault);
  ok('Hunter 429 → a key fault (out of credits), not an address verdict', mapProvider('hunter', 429, null).keyFault);
  const z = (b: Record<string, unknown>) => mapProvider('zerobounce', 200, b);
  ok('ZeroBounce valid → valid', z({ status: 'valid' }).status === 'valid');
  ok('ZeroBounce catch-all → risky', z({ status: 'catch-all' }).reason === 'catch_all');
  ok('ZeroBounce spamtrap → invalid', z({ status: 'spamtrap' }).reason === 'spam_trap' && z({ status: 'spamtrap' }).status === 'invalid');
  ok('ZeroBounce error body → a key fault', z({ error: 'Invalid API key or your account ran out of credits' }).keyFault);
  const m = (b: Record<string, unknown>) => mapProvider('millionverifier', 200, b);
  ok('MillionVerifier ok → valid', m({ result: 'ok', error: '' }).status === 'valid');
  ok('MillionVerifier invalid → invalid', m({ result: 'invalid', error: '' }).status === 'invalid');
  ok('MillionVerifier unknown → unknown', m({ result: 'unknown', error: '' }).status === 'unknown');
  ok('MillionVerifier error → a key fault', m({ error: 'Invalid API key' }).keyFault);
}

/* ── Hunter's domain search: published addresses only ── */
{
  const body = { data: { emails: [
    { value: 'info@leedsdental.co.uk', type: 'generic', confidence: 95, sources: [{ uri: 'https://leedsdental.co.uk/contact' }] },
    { value: 'Sarah.Chen@leedsdental.co.uk', type: 'personal', confidence: 91, sources: [{ uri: 'a' }, { uri: 'b' }], first_name: 'Sarah', last_name: 'Chen', position: 'Practice Manager' },
    { value: 'guess@leedsdental.co.uk', type: 'personal', confidence: 60, sources: [], first_name: 'Gus', last_name: 'Ess' },
    { value: 'someone@otherdomain.com', type: 'personal', confidence: 90, sources: [{ uri: 'x' }] },
    { value: 'not an email', type: 'generic', sources: [{ uri: 'x' }] },
  ] } };
  const people = peopleFromHunter('leedsdental.co.uk', body);
  ok('an address with no page behind it (a pattern guess) is dropped', !people.some(p => p.email.startsWith('guess@')), JSON.stringify(people));
  ok('another domain\'s address is dropped', !people.some(p => p.email.endsWith('otherdomain.com')));
  ok('named people first, lower-cased, with their role', people[0]?.email === 'sarah.chen@leedsdental.co.uk' && people[0].name === 'Sarah Chen' && people[0].position === 'Practice Manager' && people[0].sources === 2, JSON.stringify(people[0]));
  ok('two kept', people.length === 2, String(people.length));
  ok('an empty answer is no people', peopleFromHunter('x.com', null).length === 0);
  ok('domainOf strips www and scheme', domainOf('https://www.LeedsDental.co.uk/contact') === 'leedsdental.co.uk' && domainOf('shop.com') === 'shop.com');
}

console.log(out.join('\n'));
const failed = out.filter(l => l.startsWith('FAIL')).length;
console.log(`\n${out.length - failed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
