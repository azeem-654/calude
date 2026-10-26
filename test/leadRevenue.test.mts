/**
 * The performance fee's rules (worker/src/lib/leadRevenue.ts): which payments
 * count and why the rest do not, partial payments, refunds and chargebacks,
 * exclusions, a negative balance carried forward, the attribution window,
 * stage moves, and the pre-call check.
 *
 *   npm run test:leadrevenue
 */
import {
  buildStatement, callCheck, centsFrom, cleanTerms, leadVerdict, monthEnd, money, paymentVerdict, phoneKey, stageMoveProblem, summarize,
  type AgreementFacts, type LeadFacts, type PaymentFacts,
} from '../worker/src/lib/leadRevenue';
import { TRADE_GROWTH_OFFER, growthExample } from '../worker/src/lib/offers';

let pass = 0, fail = 0;
const ok = (n: string, c: boolean, d: unknown = '') => { if (c) pass++; else fail++; console.log(`${c ? '  ✓' : '  ✗'} ${n}${c ? '' : ` — ${JSON.stringify(d).slice(0, 400)}`}`); };

const A: AgreementFacts = { id: 'agr1', performanceBps: 500, attributionDays: 180, startsOn: '2026-01-01', endsOn: null, currency: 'USD' };
const lead = (o: Partial<LeadFacts> = {}): LeadFacts => ({
  id: 'L1', name: 'Pat', byService: true, existingCustomer: false, agreementId: 'agr1',
  firstTouchAt: '2026-02-01T10:00:00Z', wonAt: '2026-02-10T10:00:00Z', completedAt: '2026-03-01T10:00:00Z', ...o,
});
let n = 0;
const pay = (o: Partial<PaymentFacts> = {}): PaymentFacts => ({
  id: `P${++n}`, leadId: 'L1', kind: 'payment', amountCents: 600_000, excludedCents: 0, receivedOn: '2026-03-05',
  verification: 'contractor_confirmed', confirmedAt: '2026-03-05T12:00:00Z', disputed: false, void: false, statementId: null, ...o,
});

console.log('\nWhich jobs can earn a fee');
ok('a completed, service-sourced job within the window counts', leadVerdict(lead(), A).counts);
const v1 = leadVerdict(lead({ byService: false }), A);
ok('the contractor’s own source never counts', !v1.counts && !v1.held && /own source/.test(v1.why));
const v2 = leadVerdict(lead({ existingCustomer: true }), A);
ok('an existing customer never counts', !v2.counts && !v2.held);
const v3 = leadVerdict(lead({ agreementId: null }), A);
ok('a lead from before the agreement never counts', !v3.counts && !v3.held);
const v4 = leadVerdict(lead({ wonAt: null, completedAt: null }), A);
ok('an unaccepted quote is held, not counted', !v4.counts && v4.held && /not been won/.test(v4.why));
const v5 = leadVerdict(lead({ completedAt: null }), A);
ok('a won job not yet confirmed complete is held', !v5.counts && v5.held && /confirmed the job complete/.test(v5.why));
const v6 = leadVerdict(lead({ wonAt: '2026-09-01T10:00:00Z' }), A);
ok('won outside the attribution window never counts', !v6.counts && !v6.held && /180-day/.test(v6.why), v6);

console.log('\nWhich payments count');
ok('a confirmed payment counts', paymentVerdict(pay(), lead(), A, '2026-03-31').counts);
const r1 = paymentVerdict(pay({ verification: 'reported', confirmedAt: null }), lead(), A, '2026-03-31');
ok('a payment reported by the service team waits for the contractor', !r1.counts && r1.held && /confirmation/.test(r1.why));
const r2 = paymentVerdict(pay({ disputed: true }), lead(), A, '2026-03-31');
ok('a disputed payment is held', !r2.counts && r2.held);
const r3 = paymentVerdict(pay({ confirmedAt: '2026-04-02T00:00:00Z' }), lead(), A, '2026-03-31');
ok('confirmed after the statement closes: next statement', !r3.counts && r3.held && /next one/.test(r3.why));
const r4 = paymentVerdict(pay({ statementId: 'S0' }), lead(), A, '2026-03-31');
ok('never counted twice', !r4.counts && /Already counted/.test(r4.why));
ok('a void payment never counts', !paymentVerdict(pay({ void: true }), lead(), A, '2026-03-31').counts);
const r5 = paymentVerdict(pay({ receivedOn: '2027-01-01', confirmedAt: '2027-01-01T00:00:00Z' }), lead(), { ...A, endsOn: '2026-06-30' }, '2027-01-31');
ok('after the agreement and its window end, nothing counts', !r5.counts && !r5.held, r5);

console.log('\nStatements');
const s1 = buildStatement(A, [lead()], [pay()], '2026-03-31');
ok('the approved example: $6,000 collected → $300 fee', s1.netCents === 600_000 && s1.feeCents === 30_000 && s1.lines.length === 1, s1);
ok('the site’s example and the statement agree', growthExample().includes('$6,000') && growthExample().includes('$300') && TRADE_GROWTH_OFFER.performanceBps === A.performanceBps);
const s2 = buildStatement(A, [lead()], [pay({ amountCents: 300_000 })], '2026-03-31');
ok('a partial payment earns its share: $3,000 → $150', s2.feeCents === 15_000);
const s3 = buildStatement(A, [lead()], [pay({ amountCents: 650_000, excludedCents: 50_000 })], '2026-03-31');
ok('agreed exclusions (tax, permits) come off first', s3.grossCents === 650_000 && s3.excludedCents === 50_000 && s3.netCents === 600_000 && s3.feeCents === 30_000, s3);
const s4 = buildStatement(A, [lead()], [pay(), pay({ kind: 'refund', amountCents: 100_000, receivedOn: '2026-03-20', confirmedAt: '2026-03-20T00:00:00Z' })], '2026-03-31');
ok('a refund reduces the net: $6,000 − $1,000 → $250', s4.refundsCents === 100_000 && s4.netCents === 500_000 && s4.feeCents === 25_000, s4);
const s5 = buildStatement(A, [lead()], [pay({ kind: 'chargeback', amountCents: 200_000 })], '2026-03-31');
ok('a chargeback alone leaves a negative net, no fee, carried forward', s5.netCents === -200_000 && s5.feeCents === 0 && s5.carryOutCents === -200_000, s5);
const s6 = buildStatement(A, [lead()], [pay()], '2026-03-31', -200_000);
ok('the carried balance comes off the next statement', s6.carriedCents === -200_000 && s6.netCents === 400_000 && s6.feeCents === 20_000, s6);
ok('a positive carry is ignored (only debts carry)', buildStatement(A, [lead()], [pay()], '2026-03-31', 50_000).netCents === 600_000);
const s7 = buildStatement(A, [lead(), lead({ id: 'L2', name: 'Own', byService: false })],
  [pay(), pay({ leadId: 'L2' }), pay({ verification: 'reported', confirmedAt: null }), pay({ void: true })], '2026-03-31');
ok('everything not counted is listed with its reason; void lines are not', s7.lines.length === 1 && s7.notCounted.length === 2 && s7.notCounted.every(x => x.why.length > 5), s7.notCounted);
ok('held and excluded are told apart', s7.notCounted.some(x => x.held) && s7.notCounted.some(x => !x.held));
const s8 = buildStatement(A, [lead()], [pay({ amountCents: 1_010 }), pay({ amountCents: 1_010 })], '2026-03-31');
ok('the fee rounds once, on the total — not per payment', s8.feeCents === 101, s8.feeCents);
ok('an empty statement is zero', buildStatement(A, [], [], '2026-03-31').feeCents === 0);

console.log('\nStages');
ok('forward is allowed', stageMoveProblem('inquiry', 'qualified', '') === null && stageMoveProblem('quoted', 'won', '') === null);
ok('nobody reaches completed by a stage move', /contractor/.test(stageMoveProblem('in_progress', 'completed', '') ?? ''));
ok('a completed job stays completed', /stays completed/.test(stageMoveProblem('completed', 'won', 'oops') ?? ''));
ok('back needs a reason', !!stageMoveProblem('won', 'quoted', '') && stageMoveProblem('won', 'quoted', 'customer changed their mind') === null);
ok('lost needs a reason', !!stageMoveProblem('quoted', 'lost', '') && stageMoveProblem('quoted', 'lost', 'went elsewhere') === null);
ok('not in progress before it is won', !!stageMoveProblem('quoted', 'in_progress', ''));

console.log('\nCalls');
const at = Date.parse('2026-03-10T15:00:00Z'); // 11:00 in New York, 08:00 in Los Angeles
const good = { phone: '(212) 555-0100', timezone: 'America/New_York', consent: 'inquiry' as const, onDnc: false, approvedScripts: 1, atMs: at };
ok('an inquiry, in hours, with a script: allowed', callCheck(good).allowed);
ok('on the do-not-call list: refused', !callCheck({ ...good, onDnc: true }).allowed);
const cc = callCheck({ ...good, consent: 'none' });
ok('no consent: refused, and says the registry is not connected', !cc.allowed && /registry is not connected/.test(cc.checks.find(c => c.key === 'consent')!.says));
ok('no approved script: refused', !callCheck({ ...good, approvedScripts: 0 }).allowed);
ok('07:00 in Los Angeles: refused', !callCheck({ ...good, timezone: 'America/Los_Angeles', atMs: Date.parse('2026-03-10T14:00:00Z') }).allowed);
ok('08:00 in Los Angeles: allowed', callCheck({ ...good, timezone: 'America/Los_Angeles' }).allowed);
ok('21:00 in New York: refused', !callCheck({ ...good, atMs: Date.parse('2026-03-11T01:00:00Z') }).allowed);
ok('an unknown zone: refused, said so', !callCheck({ ...good, timezone: 'Nowhere/Else' }).allowed);
ok('every check is reported', callCheck(good).checks.length === 5);
ok('phone keys drop punctuation and a leading 1', phoneKey('+1 (212) 555-0100') === '2125550100');

console.log('\nAmounts, terms, dates');
ok('amounts typed with commas and dollars', centsFrom('$4,500.50') === 450_050 && centsFrom('300') === 30_000 && centsFrom('4.567') === null && centsFrom('abc') === null);
ok('money reads back', money(30_000) === '$300' && money(-150_050) === '−$1,500.50');
ok('terms refused by box', cleanTerms({ setupCents: 30000, monthlyCents: 8700, performanceBps: 9000, attributionDays: 180 }).field === 'terms.bps');
ok('terms accepted', cleanTerms({ setupCents: 30000, monthlyCents: 8700, performanceBps: 500, attributionDays: 180, exclusions: ['tax', 'bogus'] }).terms?.exclusions.join() === 'tax');
ok('month end', monthEnd('2026-02-10') === '2026-02-28' && monthEnd('2028-02-01') === '2028-02-29' && monthEnd('2026-12-31') === '2026-12-31');

console.log('\nThe dashboard');
const m = summarize([{ ...lead(), quoteCents: 700_000, finalCents: 650_000, createdAt: '2026-02-01T10:00:00Z' }, { ...lead({ id: 'L2', byService: false, wonAt: null, completedAt: null }), quoteCents: 100_000, finalCents: null, createdAt: '2026-02-02T00:00:00Z' }],
  [pay({ amountCents: 650_000, excludedCents: 50_000 }), pay({ leadId: 'L2', amountCents: 10_000 }), pay({ verification: 'reported', confirmedAt: null })], '0000', A);
ok('collected counts confirmed money only; eligible only qualifying jobs, less exclusions', m.collectedCents === 660_000 && m.eligibleCents === 600_000, m);
ok('quotes are summed apart and never counted as money', m.quotedCents === 800_000 && m.completedCents === 650_000 && m.inquiries === 2 && m.fromService === 1 && m.won === 1, m);

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
