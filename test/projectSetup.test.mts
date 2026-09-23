/**
 * How far a new project is, argued with directly.
 *
 * Run with `npm run test:setup`. Pure: no database, no browser. The question
 * "why does it say 0%" is a question about a rule, and a rule is far easier to
 * argue with as a function than by creating projects and watching.
 *
 * ── What is worth testing ──
 *
 * The bug this was written after: a project created a minute ago read 0%, which
 * is arithmetically correct against the launch plan alone and reads as broken.
 * So the first check is that a brand-new project is *not* zero — and the second
 * is that it is not 100 either, because a bar that fills to look busy is the
 * thing this codebase keeps refusing to build.
 */
import { setupProgress, type SetupInput } from '../src/services/projectSetup';

const out: string[] = [];
const ok = (n: string, p: boolean, d = '') => out.push(`${p ? 'PASS' : 'FAIL'}  ${n}${p ? '' : ` — ${d}`}`);

const NOW = Date.parse('2026-09-23T12:00:00.000Z');
const minsAgo = (m: number) => new Date(NOW - m * 60_000).toISOString();

const input = (over: Partial<SetupInput> = {}): SetupInput => ({
  hasPortfolio: true,
  guardrailCount: 7,
  launchSteps: [{ label: 'Get email sending' }, { label: 'Write the first campaign' }, { label: 'Build the shop' }],
  launchDone: 0,
  lastPlannedAt: null,
  createdAt: minsAgo(1),
  workflows: 0,
  produced: 0,
  awaiting: 0,
  lastError: '',
  now: NOW,
  ...over,
});

/* ── The bug ────────────────────────────────────────────────────────────── */

{
  const r = setupProgress(input());
  ok('a brand-new project is not at zero', r.percent > 0, `${r.percent}%`);
  /* Four setup steps done out of eight (five setup + three launch). */
  ok('and the number is the real fraction, not a flourish',
    r.done === 4 && r.total === 8 && r.percent === 50, JSON.stringify({ done: r.done, total: r.total, percent: r.percent }));
  ok('nor is it near finished', r.percent < 100);
  ok('it says the first pass is what it is waiting for',
    /first pass/i.test(r.doing), r.doing);
  ok('and how long that takes, because this one is knowable',
    /five minutes/i.test(r.eta), r.eta);
  ok('it is not reported as stalled a minute in', !r.stalled);
}

/* ── Nothing is ticked that has not happened ────────────────────────────── */

{
  const r = setupProgress(input({ hasPortfolio: false }));
  const client = r.steps.find(s => s.key === 'client');
  ok('a project with no client says so rather than ticking it', client?.state === 'stuck', JSON.stringify(client));
  ok('and that is what it reports it is waiting on', /client profile/i.test(r.doing), r.doing);
  /* The one that matters: a missing client is not "in progress", it is stuck,
     and patience will not fix it. */
  ok('a missing client is never counted as done', r.done < 4, String(r.done));
}

{
  const r = setupProgress(input({ guardrailCount: 0, launchSteps: [] }));
  ok('a project with no permissions and no build order counts only what exists',
    r.done === 2, JSON.stringify(r.steps.map(s => `${s.key}:${s.state}`)));
}

/* ── Waiting too long is its own state ──────────────────────────────────── */

{
  const fresh = setupProgress(input({ createdAt: minsAgo(9) }));
  ok('nine minutes in, it is still just waiting', !fresh.stalled, fresh.doing);

  const r = setupProgress(input({ createdAt: minsAgo(40) }));
  /*
   * Three ticks with no pass means the schedule is not running. Saying so is
   * the whole point: the alternative is a customer watching a bar for an hour
   * while nothing is wrong with their project and everything is wrong with the
   * cron.
   */
  ok('forty minutes with no pass is reported as stalled', r.stalled);
  ok('and it says how long it has been', /40 minutes/.test(r.steps.find(s => s.key === 'plan')?.detail ?? ''),
    r.steps.find(s => s.key === 'plan')?.detail);
  ok('and stops claiming a five-minute estimate', !/five minutes/i.test(r.eta), r.eta);
  ok('and says nothing is lost', /picks up/i.test(r.doing), r.doing);
}

/* ── Once it is running ─────────────────────────────────────────────────── */

{
  const r = setupProgress(input({ lastPlannedAt: minsAgo(30), launchDone: 1 }));
  ok('a planned project counts the launch steps it has finished',
    r.done === 6 && r.percent === 75, JSON.stringify({ done: r.done, percent: r.percent }));
  ok('and names the one it is on now', /Write the first campaign/.test(r.doing), r.doing);
  const next = r.steps.find(s => s.key === 'launch-1');
  ok('which is marked as the one in flight', next?.state === 'now', JSON.stringify(next));
  const later = r.steps.find(s => s.key === 'launch-2');
  ok('and the one after it is not', later?.state === 'waiting', JSON.stringify(later));
  /* Days, not minutes. The pace is set by a planner that runs once a day, and a
     countdown to the minute would be a number invented to fill a slot. */
  ok('the estimate for the rest is in days and says it is an estimate',
    /day/i.test(r.eta) && /estimate/i.test(r.eta), r.eta);
}

{
  const r = setupProgress(input({ lastPlannedAt: minsAgo(30), launchDone: 3, produced: 5 }));
  ok('everything done is 100%', r.percent === 100, `${r.percent}%`);
  ok('and it stops estimating once there is nothing left to wait for', r.eta === '', r.eta);
  ok('and reports what it made', /5 things made/.test(r.doing), r.doing);
}

/* ── A failure outranks everything ──────────────────────────────────────── */

{
  const r = setupProgress(input({
    lastError: 'No mailbox is connected, so nothing could be sent.',
    lastPlannedAt: minsAgo(30),
    awaiting: 3,
  }));
  /* The recorded failure, not the cheerful count. A customer with three things
     waiting and a broken mailbox needs the mailbox sentence first. */
  ok('a recorded failure is what it reports, ahead of anything else',
    /No mailbox is connected/.test(r.doing), r.doing);
}

for (const line of out) console.log(line);
const failed = out.filter(l => l.startsWith('FAIL')).length;
console.log(`\n${out.length - failed}/${out.length} passed`);
process.exit(failed ? 1 : 0);
