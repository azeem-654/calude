/**
 * Protron's chat messages (worker/src/lib/protronFeed.ts): the words are facts
 * from the records, say when nothing goes out without a yes, and say nothing
 * on a quiet day.   npx tsx test/protronFeed.test.mts  (in test:protron)
 */
import { askText, progressText, summaryText, waitingText } from '../worker/src/lib/protronFeed';

let bad = 0;
const ok = (name: string, cond: boolean, detail = '') => { console.log(`  ${cond ? '✓' : '✗'} ${name}${cond ? '' : `  — ${detail}`}`); if (!cond) bad++; };

const w = waitingText({ summary: 'Email 12 past clients about spring', because: 'They have not heard from you in 90 days', project: 'Vine Street Kitchen' });
ok('a waiting item names the business, the action and the reason', /Vine Street Kitchen/.test(w) && /Email 12 past clients/.test(w) && /90 days/.test(w), w);
ok('…and says nothing goes out until approved', /Nothing goes out until you approve it/.test(w), w);

ok('a quiet business writes no progress message', progressText('Harbour Law', [], []) === '');
const p = progressText('Harbour Law', ['Wrote a follow-up email', 'Built a booking workflow', 'Posted on LinkedIn', 'Tagged 4 leads', 'Planned next week'], ['Could not send: no mailbox']);
ok('progress counts what was done and points to the rest', /carried out 5 things/.test(p) && /…and 1 more/.test(p), p);
ok('…and owns what failed, without retrying', /did not work/.test(p) && /not retried/.test(p), p);

const a = askText('Brightline Realty', 'Win listing appointments');
ok('the question names the business and its own goal', /Brightline Realty/.test(a) && /Win listing appointments/.test(a), a);

const s = summaryText([
  { name: 'Vine Street Kitchen', status: 'running', awaiting: 2, done: 3, failed: 0, flagged: [] },
  { name: 'Harbour Law', status: 'paused', awaiting: 0, done: 0, failed: 0, flagged: [] },
]);
ok('the summary lists every business with its own numbers', /Vine Street Kitchen: 2 things waiting for you · 3 done/.test(s) && /Harbour Law: paused/.test(s), s);
ok('…and says how many need a yes', /2 things need your yes/.test(s), s);
ok('no businesses: says so plainly', /no business workspaces running yet/.test(summaryText([])));

console.log(bad ? `\n${bad} failed` : '\nall passed');
process.exit(bad ? 1 : 0);
