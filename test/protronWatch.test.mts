/**
 * Protron's campaign watch thresholds (worker/src/lib/protronJudge.ts):
 * what is raised, what is not, and that a reply count the workspace cannot
 * split by campaign is never presented as one campaign's.
 */
import { judge, WATCH } from '../worker/src/lib/protronJudge.ts';

const out: string[] = [];
const ok = (n: string, p: boolean, d = '') => out.push(`${p ? 'PASS' : 'FAIL'}  ${n}${p ? '' : ` — ${d}`}`);
const row = (account_id: string, source_id: string, sent: number, failed = 0) => ({ account_id, source_id, source_name: `Campaign ${source_id}`, sent, failed });

{
  const f = judge([row('a', 'c1', 60), row('a', 'c2', 20)], new Map([['a', 0]]));
  ok('W1 80 sent, 0 replies → low replies named on the biggest sender', f.length === 1 && f[0].kind === 'low_replies' && f[0].sourceId === 'c1', JSON.stringify(f));
  ok('W1 the body gives the workspace total, not a per-campaign split', f[0]?.body.includes('sent 80 emails') && f[0].body.includes('60 from'), f[0]?.body);
}
ok('W2 healthy replies → nothing', judge([row('a', 'c1', 100)], new Map([['a', 3]])).length === 0);
ok('W3 too few sent to judge → nothing', judge([row('a', 'c1', WATCH.minSent - 1)], new Map([['a', 0]])).length === 0);
{
  const f = judge([row('b', 'c9', 27, 5)], new Map([['b', 5]]));
  ok('W4 ≥10% failed of ≥30 attempts → failing sends, named', f.length === 1 && f[0].kind === 'failing_sends' && f[0].body.includes('5 of 32'), JSON.stringify(f));
}
ok('W5 workspaces are judged apart', judge([row('a', 'c1', 50), row('b', 'c2', 50)], new Map([['a', 0], ['b', 9]])).every(x => x.accountId === 'a'));

console.log(out.join('\n'));
const failed = out.filter(l => l.startsWith('FAIL')).length;
console.log(`\n${out.length - failed}/${out.length} passed`);
if (failed) process.exit(1);
