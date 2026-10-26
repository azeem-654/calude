/**
 * The testing site's lock (worker/src/lib/stagingGate.ts).
 *
 * Run with `npm run test:gate`. Self-contained: it calls the gate with a fake
 * environment, because what matters is the decision, and a wrong one is
 * invisible in a typecheck — an open testing site looks exactly like a working one.
 */
import { createHash } from 'node:crypto';
import { markGated, stagingGate } from '../worker/src/lib/stagingGate.ts';

const out: string[] = [];
const ok = (n: string, p: boolean, d = '') => out.push(`${p ? 'PASS' : 'FAIL'}  ${n}${p ? '' : ` — ${d}`}`);
const sha = (s: string) => createHash('sha256').update(s).digest('hex');
const hashFor = (pair: string) => sha(sha(`gate:${pair}`));

const PAIR = 'tester:correct-horse-battery';
const env = { STAGING_GATE_HASH: hashFor(PAIR) } as never;
const live = {} as never;
const req = (path: string, headers: Record<string, string> = {}) => new Request(`https://testing.protectedcentral.com${path}`, { headers });
const run = (e: never, path: string, headers: Record<string, string> = {}) => stagingGate(req(path, headers), e, new URL(`https://testing.protectedcentral.com${path}`));
const basic = (pair: string) => ({ Authorization: `Basic ${Buffer.from(pair).toString('base64')}` });

ok('live has no lock', (await run(live, '/')) === null);

const anon = await run(env, '/');
ok('a stranger is refused with a password prompt', !!anon && 'stop' in anon && anon.stop.status === 401 && /^Basic /.test(anon.stop.headers.get('WWW-Authenticate') ?? ''));
ok('the refusal is not for indexing', !!anon && 'stop' in anon && /noindex/.test(anon.stop.headers.get('X-Robots-Tag') ?? ''));
const asset = await run(env, '/assets/index-abc.js');
ok('static files are locked too', !!asset && 'stop' in asset);
const api = await run(env, '/api/auth.php');
ok('the API is locked too', !!api && 'stop' in api);

const robots = await run(env, '/robots.txt');
ok('robots.txt is open and disallows everything', !!robots && 'stop' in robots && robots.stop.status === 200 && /Disallow: \/\n/.test(await robots.stop.text()));

const wrong = await run(env, '/', basic('tester:wrong'));
ok('a wrong password is refused', !!wrong && 'stop' in wrong);
const wrongUser = await run(env, '/', basic('someone:correct-horse-battery'));
ok('a wrong username is refused', !!wrongUser && 'stop' in wrongUser);

const right = await run(env, '/', basic(PAIR));
ok('the right username and password pass', !!right && 'setCookie' in right && !!right.setCookie);
const cookie = right && 'setCookie' in right ? right.setCookie!.split(';')[0] : '';
ok('the cookie is HttpOnly and Secure', !!right && 'setCookie' in right && /HttpOnly/.test(right.setCookie!) && /Secure/.test(right.setCookie!));
const again = await run(env, '/api/auth.php', { Cookie: `x=1; ${cookie}` });
ok('the cookie lets the next request through without asking again', !!again && 'setCookie' in again && again.setCookie === null);
const forged = await run(env, '/', { Cookie: `pc_gate=${hashFor(PAIR)}` });
ok('the committed hash cannot be replayed as the cookie', !!forged && 'stop' in forged);

const hook = await run(env, '/api/billing-webhook.php');
ok('signed webhooks are let through', !!hook && 'setCookie' in hook);
const sms = await run(env, '/api/sms-inbound.php');
ok('Twilio inbound is let through', !!sms && 'setCookie' in sms);

const secret = { STAGING_GATE_HASH: hashFor(PAIR), STAGING_GATE: 'owner:new-password-here' } as never;
const oldPw = await run(secret, '/', basic(PAIR));
ok('the owner’s secret replaces the committed password', !!oldPw && 'stop' in oldPw);
const newPw = await run(secret, '/', basic('owner:new-password-here'));
ok('…and the new password works', !!newPw && 'setCookie' in newPw);
const oldCookie = await run(secret, '/', { Cookie: cookie });
ok('…and changing it signs old browsers out of the lock', !!oldCookie && 'stop' in oldCookie);

const broken = await run({ STAGING_GATE_HASH: 'not-a-hash' } as never, '/', basic(PAIR));
ok('a broken setting stays shut rather than open', !!broken && 'stop' in broken);

const marked = markGated(new Response('hi', { headers: { 'Content-Type': 'text/plain' } }), 'pc_gate=x; Path=/');
ok('every answer behind the lock says noindex', /noindex/.test(marked.headers.get('X-Robots-Tag') ?? '') && marked.headers.get('Set-Cookie') === 'pc_gate=x; Path=/');

console.log(out.join('\n'));
const failed = out.filter(l => l.startsWith('FAIL')).length;
console.log(`\n${out.length - failed}/${out.length} passed`);
process.exit(failed ? 1 : 0);
