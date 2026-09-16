/**
 * The arithmetic behind a recommendation that costs real money.
 *
 * Run with `npm run test:plan`. Every number here is one somebody will act on:
 * too few mailboxes and their domain gets filtered, too many and they have paid
 * for infrastructure they will never fill.
 *
 * The cases that matter most are the ones where the *shape* of the answer
 * changes — an owned list needing no pool at all, a shop that does not have a
 * reply funnel — because those are the ones a generic slider gets wrong while
 * looking perfectly reasonable.
 */
import {
  BEGINNER, DEFAULTS, INDUSTRIES, capacityOf, industryById,
  infrastructureFor, packageFor, project,
} from '../src/services/sendingPlan';

const out: string[] = [];
const ok = (n: string, p: boolean, d = '') => out.push(`${p ? 'PASS' : 'FAIL'}  ${n}${p ? '' : ` — ${d}`}`);

/* ── The beginner package is what it claims to be ── */
{
  ok('the starter is three domains and nine mailboxes',
    BEGINNER.domains === 3 && BEGINNER.mailboxes === 9, JSON.stringify(BEGINNER));
  ok('nine mailboxes at ten a day over twenty-two days is 1,980 a month',
    BEGINNER.emailsPerMonth === 1980, String(BEGINNER.emailsPerMonth));
  ok('and the capacity function agrees with the package',
    capacityOf(BEGINNER) === BEGINNER.emailsPerMonth, `${capacityOf(BEGINNER)}`);
}

/* ── Sizing backwards from a target ── */
{
  const p = packageFor(15000, 'cold');
  /* 15,000 / 22 days = 682 a day; at 10 each that is 69 mailboxes, 23 domains. */
  ok('15,000 cold emails a month needs 69 mailboxes', p.mailboxes === 69, String(p.mailboxes));
  ok('and 23 domains at three each', p.domains === 23, String(p.domains));
  ok('the pool it recommends can actually carry the target',
    p.emailsPerMonth >= 15000, `${p.emailsPerMonth}`);

  /* Raising the daily rate is the lever that shrinks the bill. */
  const faster = packageFor(15000, 'cold', { perMailboxPerDay: 30 });
  ok('at thirty a day the same target needs far fewer mailboxes',
    faster.mailboxes === 23 && faster.domains === 8, JSON.stringify(faster));
  ok('and that is genuinely fewer, not a rounding artefact',
    faster.mailboxes < p.mailboxes / 2);
}

/* ── The distinction the whole module exists for ── */
{
  const owned = infrastructureFor({
    emailsPerMonth: 15000, listKind: 'owned', ...DEFAULTS,
  });
  ok('an owned list needs one domain however big it is',
    owned.domains === 1 && owned.mailboxes === 1, JSON.stringify(owned));
  ok('and no warm-up, because the domain is already trusted', owned.warmupDays === 0);
  ok('and it says why, rather than silently differing', owned.note.length > 20, owned.note);

  const cold = infrastructureFor({ emailsPerMonth: 15000, listKind: 'cold', ...DEFAULTS });
  ok('a cold pool does need warming', cold.warmupDays === 21, String(cold.warmupDays));
  ok('selling a pool to an owned list would be 22 domains nobody needs',
    cold.domains - owned.domains === 22, `${cold.domains} vs ${owned.domains}`);
}

/* ── Floors: nobody gets zero of anything ── */
{
  const tiny = infrastructureFor({ emailsPerMonth: 1, listKind: 'cold', ...DEFAULTS });
  ok('one email a month still needs one mailbox on one domain',
    tiny.mailboxes === 1 && tiny.domains === 1, JSON.stringify(tiny));
  const none = infrastructureFor({ emailsPerMonth: 0, listKind: 'cold', ...DEFAULTS });
  ok('and so does none', none.mailboxes === 1 && none.domains === 1);
  const silly = infrastructureFor({
    emailsPerMonth: 1000, listKind: 'cold',
    perMailboxPerDay: -5, mailboxesPerDomain: 0, sendingDaysPerMonth: 0,
  });
  ok('nonsense settings are clamped rather than dividing by zero',
    Number.isFinite(silly.mailboxes) && silly.mailboxes > 0, JSON.stringify(silly));
}

/* ── The projection is a range, and the stages narrow ── */
{
  const b2b = industryById('b2b-services');
  ok('the industry list is reachable by id', !!b2b);
  const p = project(b2b!, 15000);
  ok('nothing is projected as 100% delivered', p.delivered.high < p.sent, `${p.delivered.high}/${p.sent}`);
  ok('every stage is smaller than the one before it',
    p.replies.high < p.delivered.high
    && p.interested.high <= p.replies.high
    && p.meetings.high <= p.interested.high
    && p.customers.high <= p.meetings.high,
    JSON.stringify(p));
  ok('every stage is a range, not a single number',
    p.replies.low < p.replies.high && p.revenue.low < p.revenue.high,
    JSON.stringify({ replies: p.replies, revenue: p.revenue }));
  /* 15,000 sent, 2–5% reply, ~20–35% interested, 40–60% meet, 15–25% close. */
  ok('15,000 B2B emails project a believable handful of customers, not hundreds',
    p.customers.low >= 1 && p.customers.high <= 120, JSON.stringify(p.customers));
}

/* ── A shop is a different machine ── */
{
  const shop = industryById('ecommerce')!;
  ok('a shop defaults to its own list, not cold', shop.listKind === 'owned');
  const p = project(shop, 10000);
  ok('and has no reply funnel to show', !p.funnelApplies && p.replies.high === 0);
  ok('but still projects orders and revenue', p.customers.high > 0 && p.revenue.high > 0, JSON.stringify(p.customers));
  ok('and the note says cold email is the wrong tool', /wrong tool/.test(shop.note), shop.note);
}

/* ── Every industry is internally consistent ── */
for (const i of INDUSTRIES) {
  ok(`${i.id}: every range is low-to-high`,
    i.replyRate[0] <= i.replyRate[1] && i.dealValue[0] <= i.dealValue[1]
    && i.closeShare[0] <= i.closeShare[1],
    JSON.stringify(i));
  ok(`${i.id}: rates are fractions, not percentages`,
    i.replyRate[1] <= 1 && i.closeShare[1] <= 1, JSON.stringify(i));
  ok(`${i.id}: says in plain words why it differs`, i.note.length > 30);
}

console.log(out.join('\n'));
const failed = out.filter(l => l.startsWith('FAIL')).length;
console.log(`\n${out.length - failed}/${out.length} passed`);
if (failed) process.exit(1);
