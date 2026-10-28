/**
 * Medical billing / RCM rules (worker/src/lib/rcm.ts).
 *
 * Run with `npm run test:rcm`. Self-contained and pure: the arithmetic and the
 * state rules a practice's money hangs off, checked without a database.
 * The Worker, the screens and who-may-do-what are test/rcm.e2e.mjs.
 */
import fs from 'node:fs';
import {
  HIPAA_BLOCKERS, agingBuckets, authShown, blocking, carcCategory, chMoveProblem, codingChecks, csvRows, isDenial, leakageAudit, matchLine,
  parseRemitCsv, patientRefProblem, payerMoveProblem, payerStatusAfterRemit, phiProblem, reconcile, rowKey, signedCents, syntheticPractice,
  syntheticRemitCsv, validIcd10, validNpi, validProcCode, type AuditClaim, type LineFacts,
} from '../worker/src/lib/rcm.ts';

const out: string[] = [];
const ok = (n: string, p: boolean, d: unknown = '') => out.push(`${p ? 'PASS' : 'FAIL'}  ${n}${p ? '' : ` — ${typeof d === 'string' ? d : JSON.stringify(d)}`}`);
const TODAY = '2026-10-26';

/* ── Identifiers ── */
ok('a real NPI passes its check digit', validNpi('1234567893') && validNpi('1245319599'));
ok('an NPI with a wrong check digit fails', !validNpi('1234567890') && !validNpi('123456789') && !validNpi('12345678931'));
ok('CPT, Category II and HCPCS codes pass', ['99213', '0001F', '0042T', 'G0438', 'J3420'].every(validProcCode));
ok('nonsense codes fail', !['9921', 'W1234', '99213X', ''].some(validProcCode));
ok('ICD-10-CM with or without the dot', validIcd10('E11.9') && validIcd10('E119') && validIcd10('Z00.00') && !validIcd10('U07') && !validIcd10('123'));

/* ── Synthetic guard and PHI ── */
ok('synthetic mode refuses a reference that is not SYN-', !!patientRefProblem('MRN44821', 'synthetic') && !patientRefProblem('SYN-44821', 'synthetic'));
ok('live mode takes the practice’s own reference', !patientRefProblem('MRN44821', 'live'));
ok('a name is not a reference', !!patientRefProblem('Jane Smith', 'live'));
ok('an SSN in free text is refused', !!phiProblem('called patient 123-45-6789 today') && !phiProblem('DOS 2026-10-01, claim C000123'));

/* ── Two statuses, never merged ── */
ok('a draft cannot be submitted', !!chMoveProblem('not_sent', 'submitted', 'draft', false));
ok('a ready claim can be submitted', !chMoveProblem('not_sent', 'submitted', 'ready', false));
ok('the clearinghouse accepts or rejects a submitted claim', !chMoveProblem('submitted', 'accepted', 'submitted', false) && !chMoveProblem('submitted', 'rejected', 'submitted', false));
ok('an accepted claim goes again only as a corrected claim', !!chMoveProblem('accepted', 'submitted', 'ready', false) && !chMoveProblem('accepted', 'submitted', 'ready', true));
ok('nothing jumps from not sent to accepted', !!chMoveProblem('not_sent', 'accepted', 'ready', false));
ok('the payer has nothing to say before the clearinghouse accepts', !!payerMoveProblem('none', 'in_process', 'submitted'));
ok('“paid” is never set by hand — only a remittance pays', !!payerMoveProblem('in_process', 'paid', 'accepted') && !!payerMoveProblem('in_process', 'partial', 'accepted'));
ok('a payer can pend and then deny', !payerMoveProblem('in_process', 'pended', 'accepted') && !payerMoveProblem('pended', 'denied', 'accepted'));
ok('a closed claim stays closed', !!payerMoveProblem('closed', 'in_process', 'accepted'));

/* ── Coding checks ── */
const good = { serviceFrom: '2026-10-20', serviceTo: '2026-10-20', diagnoses: ['E119'], patientRef: 'SYN-1', payerId: 'p1', lines: [{ code: '99213', modifiers: [], units: 1, chargeCents: 13500, dxPointers: [1] }] };
ok('a clean claim has no errors', blocking(codingChecks(good, TODAY)).length === 0, codingChecks(good, TODAY));
const bad = codingChecks({ ...good, serviceFrom: '2026-11-30', diagnoses: ['XYZ'], lines: [{ code: '9921', modifiers: ['259'], units: 0, chargeCents: 0, dxPointers: [3] }] }, TODAY);
for (const k of ['dos_future', 'dx_0', 'line_1_code', 'line_1_mod', 'line_1_units', 'line_1_charge', 'line_1_ptr']) ok(`coding check catches ${k}`, bad.some(c => c.key === k && c.level === 'error'), bad.map(c => c.key));
const em = codingChecks({ ...good, lines: [good.lines[0], { code: '36415', modifiers: [], units: 1, chargeCents: 2500, dxPointers: [1] }] }, TODAY);
ok('an office visit with a procedure and no 25 is warned about', em.some(c => c.key === 'line_1_no25' && c.level === 'warning'));
const dup = codingChecks({ ...good, lines: [good.lines[0], { ...good.lines[0] }] }, TODAY);
ok('a repeated code with no 59/76/X modifier is warned about', dup.some(c => c.key === 'line_2_dup'));
const dupOk = codingChecks({ ...good, lines: [{ ...good.lines[0], code: '97110' }, { ...good.lines[0], code: '97110', modifiers: ['59'] }] }, TODAY);
ok('…and not with modifier 59', !dupOk.some(c => c.key === 'line_2_dup'));
const authWarn = codingChecks({ ...good, lines: [{ ...good.lines[0], code: '72148' }] }, TODAY, [{ patientRef: 'SYN-1', payerId: 'p1', code: '72148', status: 'submitted', validFrom: null, validTo: null }]);
ok('a prior authorization on file but not approved is warned about', authWarn.some(c => c.key === 'line_1_auth'));
const authOk = codingChecks({ ...good, lines: [{ ...good.lines[0], code: '72148' }] }, TODAY, [{ patientRef: 'SYN-1', payerId: 'p1', code: '72148', status: 'approved', validFrom: '2026-10-01', validTo: '2026-12-31' }]);
ok('…and not when one is approved for the date', !authOk.some(c => c.key === 'line_1_auth'));

/* ── Denials ── */
ok('CARC 50 is medical necessity, 197 authorization, 29 timely filing', carcCategory('50') === 'medical_necessity' && carcCategory('197') === 'authorization' && carcCategory('29') === 'timely_filing');
ok('a contractual write-down is not a denial', !isDenial('CO', '45', 0));
ok('patient responsibility is not a denial', !isDenial('PR', '1', 0) && !isDenial('PR', '50', 0));
ok('a zero payment with a denial reason is', isDenial('CO', '50', 0) && !isDenial('CO', '50', 1200));
ok('an approved authorization past its end shows as expired', authShown('approved', '2026-10-01', TODAY) === 'expired' && authShown('approved', '2026-12-01', TODAY) === 'approved');

/* ── Remittance files ── */
ok('amounts: commas, dollars, negatives and brackets', signedCents('1,234.50') === 123450 && signedCents('-80') === -8000 && signedCents('(12.00)') === -1200 && signedCents('') === 0 && signedCents('ten') === null);
ok('CSV: quotes, doubled quotes and commas inside quotes', JSON.stringify(csvRows('a,"b,c","say ""hi"""\r\n1,2,3\n')) === JSON.stringify([['a', 'b,c', 'say "hi"'], ['1', '2', '3']]));
const csv = [
  'Claim Number,ICN,DOS,CPT,Billed,Allowed,Paid,Patient Resp,Group,Reason,Remark,Check,Payment Date',
  'C000001,ICN1,10/01/2026,99214,180.00,131.00,104.80,26.20,CO,45,,CHK9,10/20/2026',
  'C000001,ICN1,10/01/2026,36415,25.00,9.00,7.20,1.80,CO,45,,CHK9,10/20/2026',
  'C000002,ICN2,2026-10-02,99213,"1,350.00",0,0,0,CO,50,N115,CHK9,2026-10-20',
  'C000003,ICN3,2026-10-02,ABCDE,10,0,0,0,CO,16,,CHK9,2026-10-20',
  ',,2026-10-02,99213,10,0,0,0,CO,16,,CHK9,2026-10-20',
].join('\n');
const p = parseRemitCsv(csv);
ok('a remittance with other column names is read', p.rows.length === 3 && p.rows[0].claimNo === 'C000001' && p.rows[0].serviceDate === '2026-10-01' && p.rows[0].paidOn === '2026-10-20', p);
ok('amounts in quotes with commas are read', p.rows[2].billedCents === 135000);
ok('bad rows are listed by row number, not dropped silently', p.problems.length === 2 && p.problems[0].rowNo === 5 && p.problems[1].rowNo === 6, p.problems);
ok('the file’s total paid is the sum of its rows', p.totalPaidCents === 10480 + 720);
ok('a file without a paid column is refused with what it has', parseRemitCsv('claim_no,code\nC1,99213').problems[0]?.says.includes('paid') === true);
const ssnCsv = parseRemitCsv('claim_no,code,paid,note\nC1,99213,10,123-45-6789\n');
ok('a row carrying an SSN is refused', ssnCsv.rows.length === 0 && /Social Security/.test(ssnCsv.problems[0]?.says ?? ''));
ok('the same payment has the same key in any file', rowKey(p.rows[0], 0) === rowKey(parseRemitCsv(csv).rows[0], 0));
ok('two identical rows in one file get different keys', rowKey(p.rows[0], 0) !== rowKey(p.rows[0], 1));

const L = (id: string, code: string, remitted = false): LineFacts => ({ id, claimId: 'k', lineNo: 1, code, units: 1, chargeCents: 10000, allowedCents: null, paidCents: 0, patientRespCents: 0, adjustCents: 0, remitted });
const lines = [L('l1', '97110'), L('l2', '97110'), L('l3', '99213')];
const taken = new Set<string>();
const m1 = matchLine({ ...p.rows[0], code: '97110' }, lines, taken); taken.add(m1!.id);
const m2 = matchLine({ ...p.rows[0], code: '97110' }, lines, taken);
ok('two lines with the same code are matched in order', m1?.id === 'l1' && m2?.id === 'l2');
ok('a code the claim does not have matches nothing — never guessed', matchLine({ ...p.rows[0], code: '93000' }, lines, new Set()) === null);

ok('all lines paid → paid', payerStatusAfterRemit([{ remitted: true, paidCents: 100, denied: false }, { remitted: true, paidCents: 50, denied: false }]) === 'paid');
ok('one paid, one denied → partly paid', payerStatusAfterRemit([{ remitted: true, paidCents: 100, denied: false }, { remitted: true, paidCents: 0, denied: true }]) === 'partial');
ok('all denied → denied', payerStatusAfterRemit([{ remitted: true, paidCents: 0, denied: true }]) === 'denied');
ok('one line not yet answered → partly paid, not paid', payerStatusAfterRemit([{ remitted: true, paidCents: 100, denied: false }, { remitted: false, paidCents: 0, denied: false }]) === 'partial');

/* ── Reconciliation ── */
ok('deposit equals posted, nothing unmatched → reconciled', reconcile({ filePaidCents: 5000, postedCents: 5000, depositCents: 5000, unmatched: 0 }).status === 'reconciled');
ok('no deposit entered → not reconciled, and says so', /bank/.test(reconcile({ filePaidCents: 5000, postedCents: 5000, depositCents: null, unmatched: 0 }).problems.join()));
ok('a deposit that differs names the difference', /differ by -0.10/.test(reconcile({ filePaidCents: 5000, postedCents: 5000, depositCents: 4990, unmatched: 0 }).problems.join()));
ok('an unmatched row stops reconciliation', reconcile({ filePaidCents: 5000, postedCents: 4000, depositCents: 4000, unmatched: 1 }).status === 'unreconciled');

/* ── Aging ── */
const ar = agingBuckets([
  { id: 'a', payerId: 'p1', serviceFrom: '2026-10-20', billedCents: 10000, paidCents: 0, adjustCents: 0, patientRespCents: 0, ch: 'accepted', payer: 'in_process', work: 'submitted' },
  { id: 'b', payerId: 'p1', serviceFrom: '2026-08-01', billedCents: 10000, paidCents: 6000, adjustCents: 2000, patientRespCents: 1000, ch: 'accepted', payer: 'partial', work: 'submitted' },
  { id: 'c', payerId: 'p2', serviceFrom: '2026-05-01', billedCents: 20000, paidCents: 0, adjustCents: 0, patientRespCents: 0, ch: 'accepted', payer: 'denied', work: 'submitted' },
  { id: 'd', payerId: 'p2', serviceFrom: '2026-10-01', billedCents: 5000, paidCents: 0, adjustCents: 0, patientRespCents: 0, ch: 'not_sent', payer: 'none', work: 'ready' },
  { id: 'e', payerId: 'p2', serviceFrom: '2026-01-01', billedCents: 9000, paidCents: 0, adjustCents: 0, patientRespCents: 0, ch: 'accepted', payer: 'closed', work: 'closed' },
], TODAY);
ok('aging buckets by date of service', ar.buckets.b0_30.cents === 10000 && ar.buckets.b61_90.cents === 1000 && ar.buckets.b120.cents === 20000, ar.buckets);
ok('an unsent claim is unbilled, not a receivable', ar.unbilledCents === 5000 && ar.unbilledClaims === 1);
ok('a closed claim is not owed', ar.totalCents === 31000);
ok('the patient’s share is shown apart from the payer’s', ar.patientCents === 1000);

/* ── Leakage: one finding per line, never counted twice ── */
const LF = (id: string, claimId: string, code: string, charge: number, extra: Partial<LineFacts> = {}): LineFacts => ({ id, claimId, lineNo: 1, code, units: 1, chargeCents: charge, allowedCents: null, paidCents: 0, patientRespCents: 0, adjustCents: 0, remitted: false, ...extra });
const claims: AuditClaim[] = [
  { id: 'k1', claimNo: 'C1', payerId: 'p1', serviceFrom: '2026-05-01', ch: 'not_sent', chAt: null, payer: 'none', work: 'ready', submittedAt: null, lines: [LF('x1', 'k1', '99213', 13500)] },
  { id: 'k2', claimNo: 'C2', payerId: 'p1', serviceFrom: '2026-10-01', ch: 'accepted', chAt: '2026-10-03T00:00:00Z', payer: 'denied', work: 'submitted', submittedAt: '2026-10-03', lines: [LF('x2', 'k2', '99214', 18000, { remitted: true, allowedCents: 0 })] },
  { id: 'k3', claimNo: 'C3', payerId: 'p1', serviceFrom: '2026-10-01', ch: 'accepted', chAt: '2026-10-03T00:00:00Z', payer: 'paid', work: 'submitted', submittedAt: '2026-10-03', lines: [LF('x3', 'k3', '99213', 13500, { remitted: true, allowedCents: 7400, paidCents: 5920 })] },
  { id: 'k4', claimNo: 'C4', payerId: 'p1', serviceFrom: '2026-07-01', ch: 'accepted', chAt: '2026-07-03T00:00:00Z', payer: 'none', work: 'submitted', submittedAt: '2026-07-03', lines: [LF('x4', 'k4', '99213', 13500)] },
  { id: 'k5', claimNo: 'C5', payerId: 'p1', serviceFrom: '2026-10-10', ch: 'rejected', chAt: '2026-10-11T00:00:00Z', payer: 'none', work: 'draft', submittedAt: '2026-10-11', lines: [LF('x5', 'k5', '99213', 13500)] },
];
const audit = leakageAudit(claims, [{ id: 'd2', claimId: 'k2', lineId: 'x2', status: 'open', carc: '50', deniedOn: '2026-10-20', appealBy: '2026-12-19', amountCents: 18000 }],
  { p1: { '99213': 9200, '99214': 13100 } }, {}, 90, TODAY);
const kinds = Object.fromEntries(audit.findings.map(f => [f.claimNo, f.kind]));
ok('past the filing limit is lost', kinds.C1 === 'timely_filing');
ok('an open denial is a denial not worked — and not also an underpayment', kinds.C2 === 'denied_unworked' && audit.findings.filter(f => f.lineId === 'x2').length === 1);
ok('allowed below contract is an underpayment, with its evidence', kinds.C3 === 'underpaid' && audit.findings.find(f => f.claimNo === 'C3')?.cents === 1800 && audit.findings.find(f => f.claimNo === 'C3')?.evidence.contracted === 9200);
ok('no answer for over 45 days is flagged', kinds.C4 === 'no_response');
ok('a rejection left over a week is flagged', kinds.C5 === 'rejected_unresolved');
ok('every line has at most one finding', new Set(audit.findings.map(f => f.lineId)).size === audit.findings.length);
ok('no finding is worth more than its line’s charge', audit.findings.every(f => f.cents <= claims.flatMap(k => k.lines).find(l => l.id === f.lineId)!.chargeCents));
ok('the total is the sum of its parts', audit.totalCents === audit.findings.reduce((t, f) => t + f.cents, 0));
ok('the contracted rate caps what is at stake on an unbilled line', audit.findings.find(f => f.claimNo === 'C1')?.cents === 9200);

/* ── Synthetic fixtures ── */
const fx = syntheticPractice(TODAY);
ok('every synthetic NPI is a valid one (and none is anybody’s real record)', [fx.practice.npi, ...fx.providers.map(p => p.npi)].every(validNpi));
ok('every synthetic patient reference starts SYN-', [...fx.claims, ...fx.auths].every(c => c.ref.startsWith('SYN-')));
ok('every synthetic claim passes its own coding errors', fx.claims.every(k => blocking(codingChecks({ serviceFrom: k.dos, serviceTo: k.dos, diagnoses: k.dx, patientRef: k.ref, payerId: 'x', lines: k.lines.map(l => ({ code: l.code, modifiers: l.mods, units: l.units, chargeCents: l.charge, dxPointers: [1] })) }, TODAY)).length === 0));
ok('the synthetic remittance parses cleanly', parseRemitCsv(syntheticRemitCsv({ 'SYN-1004': 'C000004', 'SYN-1005': 'C000005' }, TODAY)).problems.length === 0);

/* ── The launch list is the document ── */
const doc = fs.readFileSync('docs/HIPAA-LAUNCH-BLOCKERS.md', 'utf8');
ok('every launch blocker is in docs/HIPAA-LAUNCH-BLOCKERS.md', HIPAA_BLOCKERS.every(b => doc.includes(`\`${b.key}\``)), HIPAA_BLOCKERS.filter(b => !doc.includes(`\`${b.key}\``)).map(b => b.key));

/* The collections fee statement: posted payer payments on claims, take-backs off, never negative. */
{
  const { collectionsStatement } = await import('../worker/src/lib/rcm');
  const { MEDICAL_BILLING_OFFER, TRADE_GROWTH_OFFER } = await import('../worker/src/lib/offers');
  const rows = [
    { id: 'a', claimId: 'c1', claimNo: 'SYN-1', paidOn: '2026-10-03', paidCents: 1_000_000, outcome: 'posted' },
    { id: 'b', claimId: 'c2', claimNo: 'SYN-2', paidOn: '2026-10-09', paidCents: 1_000_000, outcome: 'posted' },
    { id: 'c', claimId: 'c1', claimNo: 'SYN-1', paidOn: '2026-10-20', paidCents: -200_000, outcome: 'posted' },
    { id: 'd', claimId: null, claimNo: 'SYN-9', paidOn: '2026-10-21', paidCents: 500_000, outcome: 'unmatched' },
    { id: 'e', claimId: 'c2', claimNo: 'SYN-2', paidOn: '2026-10-22', paidCents: 1_000_000, outcome: 'duplicate' },
    { id: 'f', claimId: 'c3', claimNo: 'SYN-3', paidOn: '2026-09-30', paidCents: 900_000, outcome: 'posted' },
  ];
  const st = collectionsStatement(rows, '2026-10', MEDICAL_BILLING_OFFER.collectionsBps);
  ok('fee statement: only posted rows on a claim, in the month, count', st.counted.map(r => r.id).join() === 'a,b,c' && st.excluded.map(r => r.id).join() === 'd,e');
  ok('fee statement: take-backs come off before the percentage', st.receivedCents === 2_000_000 && st.takebackCents === 200_000 && st.netCents === 1_800_000 && st.feeCents === 90_000, st);
  ok('fee statement: a duplicate payment is never counted twice', !st.counted.some(r => r.id === 'e'));
  const neg = collectionsStatement([{ id: 'x', claimId: 'c1', claimNo: '', paidOn: '2026-11-02', paidCents: -50_000, outcome: 'posted' }], '2026-11', 500);
  ok('fee statement: more taken back than paid is a nil fee and a stated shortfall, never a negative fee', neg.feeCents === 0 && neg.netCents === 0 && neg.shortfallCents === 50_000);
  ok('fee statement: a bad month counts nothing', collectionsStatement(rows, 'October', 500).counted.length === 0);
  ok('the medical offer is its own constant, not the trade offer', MEDICAL_BILLING_OFFER.id === 'medical_billing' && !('performanceBps' in MEDICAL_BILLING_OFFER) && MEDICAL_BILLING_OFFER.collectionsBps === 500 && TRADE_GROWTH_OFFER.id === 'trade_growth');
}

console.log(out.join('\n'));
const failed = out.filter(l => l.startsWith('FAIL')).length;
console.log(`\n${out.length - failed}/${out.length} passed`);
process.exit(failed ? 1 : 0);
