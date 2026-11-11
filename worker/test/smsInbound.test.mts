/**
 * T-2: an inbound text belongs to the workspace whose token signed it, in
 * any row order. `npm run test:smsinbound` (pure, no network).
 */
import { inboundOwner } from '../src/lib/smsInbound';

const out: string[] = [];
const ok = (n: string, p: boolean, d = '') => out.push(`${p ? 'PASS' : 'FAIL'}  ${n}${p ? '' : ` — ${d}`}`);

const A = { accountId: 'ws-a', accountSid: 'AC' + 'a'.repeat(32), authToken: 'token-a' };
const B = { accountId: 'ws-b', accountSid: 'AC' + 'b'.repeat(32), authToken: 'token-b' };
const signedByA = async (t: string) => t === 'token-a';

ok('A first: A', (await inboundOwner([A, B], A.accountSid, signedByA)) === 'ws-a');
ok('B first (the claimant row first): still A', (await inboundOwner([B, A], A.accountSid, signedByA)) === 'ws-a');
ok('no AccountSid in the form: still the one whose token signed it', (await inboundOwner([B, A], '', signedByA)) === 'ws-a');
ok('a claimant naming A\'s SID but holding its own token does not win', (await inboundOwner([{ ...B, accountSid: A.accountSid }, A], A.accountSid, signedByA)) === 'ws-a');
ok('signed by nobody here: nobody', (await inboundOwner([A, B], A.accountSid, async () => false)) === null);
const tried: string[] = [];
await inboundOwner([B, A], A.accountSid, async t => { tried.push(t); return t === 'token-a'; });
ok('the SID Twilio named is tried first', tried[0] === 'token-a', tried.join());

console.log(out.join('\n'));
const failed = out.filter(l => l.startsWith('FAIL')).length;
console.log(`\n${out.length - failed}/${out.length} passed`);
if (failed) process.exit(1);
