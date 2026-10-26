/**
 * Medical billing / revenue-cycle management (phase 4): the rules.
 *
 * The install owner runs billing for medical practices; each practice is a
 * customer workspace (routes/rcm.ts keeps the ledger in crm_rcm_*). This file
 * decides, without touching a database:
 *
 *   1. what a claim may say before it goes out (`codingChecks`) — code and
 *      diagnosis formats, units, pointers, the modifier-25 and duplicate-line
 *      rules, and a missing prior authorization;
 *   2. the two statuses a claim carries, which are **not** one status: the
 *      clearinghouse's (did the file get through its edits) and the payer's
 *      (what the insurer decided). "Accepted" by a clearinghouse is not paid,
 *      and a screen that merged them would tell a practice money was coming
 *      that had only cleared a format check;
 *   3. what a remittance file says, line by line (`parseRemitCsv`), and which
 *      claim line each row pays — with a stable row key so the same payment
 *      sent twice is posted once (`rowKey`);
 *   4. where money is leaking (`leakageAudit`): each claim line is given at
 *      most one finding, the most serious, with its evidence, so the total is
 *      never the same dollars counted under two headings;
 *   5. how old what is owed is (`agingBuckets`), by date of service.
 *
 * ── Synthetic until the launch blockers are cleared ──
 *
 * A workspace starts in synthetic mode: every patient reference must start
 * `SYN-`, so a real one cannot be typed in by mistake, and the screens say it
 * is test data. Live data needs every item in `HIPAA_BLOCKERS` signed off by
 * the install owner, a BAA date on the workspace, and 2-step sign-in for
 * everyone who opens it (routes/rcm.ts). Nothing here ever holds a patient's
 * name, date of birth, address or SSN — a practice's own account reference is
 * the minimum the work needs, and `phiProblem` refuses an SSN-shaped string
 * in any box.
 *
 * Pure: the browser imports it too, so a screen explains a figure with the
 * rule that made it. `npm run test:rcm`.
 */

/* ── Money ──────────────────────────────────────────────────────────────── */

/** "1,234.50", "-80" or "(80.00)" → signed cents; null when it is not an amount. Remittances carry takebacks. */
export function signedCents(v: unknown): number | null {
  if (typeof v === 'number') return Number.isFinite(v) ? Math.round(v * 100) : null;
  let s = String(v ?? '').replace(/[$,\s]/g, '');
  let neg = false;
  if (/^\(.*\)$/.test(s)) { neg = true; s = s.slice(1, -1); }
  if (s.startsWith('-')) { neg = !neg; s = s.slice(1); }
  if (s === '') return 0;
  if (!/^\d{1,9}(\.\d{1,2})?$/.test(s)) return null;
  const c = Math.round(Number(s) * 100);
  return neg ? -c : c;
}

/* ── Identifiers ────────────────────────────────────────────────────────── */

/** A US NPI: ten digits whose Luhn check, with the 80840 prefix, holds. */
export function validNpi(v: unknown): boolean {
  const s = String(v ?? '');
  if (!/^\d{10}$/.test(s)) return false;
  const digits = `80840${s}`.split('').map(Number);
  let sum = 0;
  for (let i = digits.length - 1, alt = false; i >= 0; i--, alt = !alt) {
    let d = digits[i];
    if (alt) { d *= 2; if (d > 9) d -= 9; }
    sum += d;
  }
  return sum % 10 === 0;
}

/** CPT (5 digits, or 4 digits and F/T/U) or HCPCS Level II (a letter A–V and 4 digits). */
export const validProcCode = (v: unknown): boolean => /^(\d{5}|\d{4}[FTU]|[A-V]\d{4})$/.test(String(v ?? ''));
/** ICD-10-CM shape, stored without the dot: a letter, a digit, an alphanumeric, then up to four more. */
export const validIcd10 = (v: unknown): boolean => /^[A-TV-Z]\d[0-9A-Z][0-9A-Z]{0,4}$/.test(String(v ?? '').replace('.', '').toUpperCase());
export const cleanIcd10 = (v: unknown): string => String(v ?? '').replace('.', '').trim().toUpperCase();
export const validModifier = (v: unknown): boolean => /^[0-9A-Z]{2}$/.test(String(v ?? ''));

export const SYNTHETIC_PREFIX = 'SYN-';
/** A practice's patient account reference. In synthetic mode it must say so. */
export function patientRefProblem(v: unknown, mode: DataMode): string | null {
  const s = String(v ?? '').trim();
  if (!/^[A-Za-z0-9-]{3,40}$/.test(s)) return 'Give the practice’s patient account reference — letters, numbers and dashes, no names.';
  if (mode === 'synthetic' && !s.toUpperCase().startsWith(SYNTHETIC_PREFIX)) return `This workspace holds synthetic data only: patient references start ${SYNTHETIC_PREFIX}. Real patient data waits for the launch checklist.`;
  return null;
}

/** An SSN anywhere in free text. Nothing in this module needs one, ever. */
export function phiProblem(text: unknown): string | null {
  return /\b\d{3}-\d{2}-\d{4}\b/.test(String(text ?? '')) ? 'Remove the Social Security number — this module never needs one.' : null;
}

/* ── Modes and launch blockers ──────────────────────────────────────────── */

export type DataMode = 'synthetic' | 'live';

/**
 * What must be true before real patient data goes in. The owner signs each off
 * in the app (with who and when); the switch to live refuses until all are.
 * Mirrored, with the reasoning, in docs/HIPAA-LAUNCH-BLOCKERS.md.
 */
export const HIPAA_BLOCKERS = [
  { key: 'baa_template', title: 'A lawyer-reviewed Business Associate Agreement template', detail: 'Signed with each practice before any of its patient data is shared.' },
  { key: 'baa_hosting', title: 'A BAA with the hosting provider (Cloudflare)', detail: 'Cloudflare signs BAAs on its Enterprise plan only. Without one, patient data cannot be stored on this platform.' },
  { key: 'baa_mail', title: 'Mail and other services kept away from patient data, or under a BAA', detail: 'This module sends no email and makes no AI call with claim data; confirm nothing else (support chat, screen sharing, backups) receives it, or that each that does has a BAA.' },
  { key: 'risk_assessment', title: 'A written security risk assessment', detail: 'The HIPAA Security Rule requires one; it names the risks to patient data here and what reduces each.' },
  { key: 'policies_training', title: 'Privacy and security policies, and staff trained on them', detail: 'Including minimum necessary use, sanctions, and who may see what.' },
  { key: 'breach_procedure', title: 'A breach notification procedure', detail: 'Who decides, who tells the practice, and within what time.' },
  { key: 'mfa_everyone', title: '2-step sign-in for everyone with access', detail: 'Enforced by the app in live mode — anybody without it is refused.' },
  { key: 'backups_encrypted', title: 'Encrypted backups, with retention and deletion agreed', detail: 'The nightly backup must be encrypted (owner checklist item 14), and how long records are kept after a practice leaves must be written down.' },
  { key: 'audit_review', title: 'A schedule for reviewing the access log', detail: 'The log records every view and change; somebody must read it.' },
  { key: 'compensation_review', title: 'Legal review of the billing compensation model', detail: 'Percentage-of-collections billing is restricted in some states and payer contracts.' },
] as const;
export type BlockerKey = typeof HIPAA_BLOCKERS[number]['key'];

/* ── Payers ─────────────────────────────────────────────────────────────── */

export const PAYER_KINDS = { commercial: 'Commercial', medicare: 'Medicare', medicaid: 'Medicaid', tricare: 'TRICARE', workers_comp: 'Workers’ compensation', other: 'Other' } as const;
export type PayerKind = keyof typeof PAYER_KINDS;

/* ── A claim's two statuses ─────────────────────────────────────────────── */

/** Where the claim is in our own work, before and around submission. */
export const WORK_STATUSES = { draft: 'Draft', coding_review: 'Coding review', ready: 'Ready to submit', submitted: 'Submitted', closed: 'Closed' } as const;
export type WorkStatus = keyof typeof WORK_STATUSES;

/** The clearinghouse's answer: whether the file passed its edits. Says nothing about payment. */
export const CH_STATUSES = {
  not_sent: { label: 'Not sent', means: 'Not yet sent to the clearinghouse.' },
  submitted: { label: 'Submitted', means: 'Sent to the clearinghouse; its edits have not answered yet.' },
  accepted: { label: 'Accepted', means: 'Passed the clearinghouse’s edits and was forwarded to the payer. This is not a payment decision.' },
  rejected: { label: 'Rejected', means: 'Failed the clearinghouse’s edits and never reached the payer. Correct it and submit again.' },
} as const;
export type ChStatus = keyof typeof CH_STATUSES;

/** The payer's answer. Only a remittance (or a recorded decision) moves it past "in process". */
export const PAYER_STATUSES = {
  none: { label: 'No response', means: 'The payer has not acknowledged the claim.' },
  received: { label: 'Received', means: 'The payer acknowledged receiving it.' },
  in_process: { label: 'In process', means: 'The payer is adjudicating it.' },
  pended: { label: 'Pended', means: 'The payer is waiting for something — usually records or information.' },
  paid: { label: 'Paid', means: 'Paid in full of what the payer allowed.' },
  partial: { label: 'Partly paid', means: 'Some lines paid, some denied or reduced.' },
  denied: { label: 'Denied', means: 'Denied in full. See the denial for the reason and the appeal deadline.' },
  appealed: { label: 'Appealed', means: 'An appeal has been sent and is waiting for the payer.' },
  closed: { label: 'Closed', means: 'Nothing more is expected — paid, written off or withdrawn.' },
} as const;
export type PayerStatus = keyof typeof PAYER_STATUSES;

const CH_MOVES: Record<ChStatus, ChStatus[]> = {
  not_sent: ['submitted'],
  submitted: ['accepted', 'rejected'],
  rejected: ['submitted'],
  accepted: ['submitted'], // a corrected or replacement claim
};

/** Null when the clearinghouse move is allowed, or why not. */
export function chMoveProblem(from: ChStatus, to: ChStatus, work: WorkStatus, corrected: boolean): string | null {
  if (!CH_MOVES[from]?.includes(to)) return `A claim the clearinghouse shows as “${CH_STATUSES[from].label}” cannot be marked “${CH_STATUSES[to]?.label ?? to}”.`;
  if (to === 'submitted' && work !== 'ready') return 'Only a claim that has passed coding review and is ready can be submitted.';
  if (to === 'submitted' && from === 'accepted' && !corrected) return 'The payer already has this claim. Submit it again only as a corrected claim.';
  return null;
}

const PAYER_MOVES: Record<PayerStatus, PayerStatus[]> = {
  none: ['received', 'in_process', 'pended', 'denied', 'closed'],
  received: ['in_process', 'pended', 'denied', 'closed'],
  in_process: ['pended', 'denied', 'closed'],
  pended: ['in_process', 'denied', 'closed'],
  paid: ['closed'],
  partial: ['appealed', 'closed'],
  denied: ['appealed', 'closed'],
  appealed: ['in_process', 'denied', 'closed'],
  closed: [],
};

/**
 * Null when a hand-recorded payer move is allowed. "Paid" and "partly paid"
 * are not in the list: they come only from a posted remittance, so a claim is
 * never shown paid on somebody's word.
 */
export function payerMoveProblem(from: PayerStatus, to: PayerStatus, ch: ChStatus): string | null {
  if (to === 'paid' || to === 'partial') return 'Payments come from a posted remittance, not from a status change. Import the payer’s remittance file.';
  if (ch !== 'accepted') return 'The payer has nothing to answer until the clearinghouse has accepted the claim.';
  if (!PAYER_MOVES[from]?.includes(to)) return `A claim the payer shows as “${PAYER_STATUSES[from].label}” cannot be marked “${PAYER_STATUSES[to]?.label ?? to}”.`;
  return null;
}

/* ── Coding checks ──────────────────────────────────────────────────────── */

export interface LineInput { code: string; modifiers: string[]; units: number; chargeCents: number; dxPointers: number[] }
export interface ClaimInput { serviceFrom: string; serviceTo: string; diagnoses: string[]; lines: LineInput[]; patientRef: string; payerId: string }
export interface AuthFacts { patientRef: string; payerId: string; code: string; status: string; validFrom: string | null; validTo: string | null }
export interface Check { key: string; level: 'error' | 'warning'; says: string }

const EM = /^992(0[2-5]|1[1-5])$/;
const DISTINCT = new Set(['59', '76', '77', '91', 'XE', 'XS', 'XP', 'XU']);

/**
 * What a coder would catch. Errors stop a claim leaving coding review;
 * warnings are shown and left to the reviewer's judgement.
 */
export function codingChecks(c: ClaimInput, today: string, auths: AuthFacts[] = []): Check[] {
  const out: Check[] = [];
  const err = (key: string, says: string) => out.push({ key, level: 'error', says });
  const warn = (key: string, says: string) => out.push({ key, level: 'warning', says });
  if (!/^\d{4}-\d{2}-\d{2}$/.test(c.serviceFrom)) err('dos', 'Give the date of service.');
  else {
    if (c.serviceFrom > today) err('dos_future', 'The date of service is in the future.');
    if (c.serviceTo && c.serviceTo < c.serviceFrom) err('dos_order', 'The service end date is before its start.');
    const age = (Date.parse(today) - Date.parse(c.serviceFrom)) / 86_400_000;
    if (age > 365) warn('dos_old', 'The date of service is over a year ago — most payers’ filing limits have passed.');
  }
  if (!c.diagnoses.length) err('dx_none', 'Add at least one diagnosis code.');
  c.diagnoses.forEach((d, i) => { if (!validIcd10(d)) err(`dx_${i}`, `Diagnosis ${i + 1} (“${d}”) is not an ICD-10-CM code.`); });
  if (c.diagnoses.length > 12) err('dx_many', 'A claim carries at most 12 diagnosis codes.');
  if (!c.lines.length) err('lines_none', 'Add at least one service line.');
  c.lines.forEach((l, i) => {
    const n = i + 1;
    if (!validProcCode(l.code)) err(`line_${n}_code`, `Line ${n}: “${l.code}” is not a CPT or HCPCS code.`);
    l.modifiers.forEach(m => { if (!validModifier(m)) err(`line_${n}_mod`, `Line ${n}: modifier “${m}” is not two letters or digits.`); });
    if (l.modifiers.length > 4) err(`line_${n}_mods`, `Line ${n}: at most four modifiers.`);
    if (!Number.isInteger(l.units) || l.units < 1 || l.units > 999) err(`line_${n}_units`, `Line ${n}: units must be a whole number from 1.`);
    if (!(l.chargeCents > 0)) err(`line_${n}_charge`, `Line ${n}: the charge must be more than zero.`);
    if (!l.dxPointers.length) err(`line_${n}_ptr`, `Line ${n}: point to at least one diagnosis.`);
    l.dxPointers.forEach(p => { if (!(p >= 1 && p <= c.diagnoses.length)) err(`line_${n}_ptr`, `Line ${n}: diagnosis pointer ${p} points at nothing.`); });
    if (EM.test(l.code) && l.modifiers.includes('25') && c.lines.length < 2) warn(`line_${n}_25`, `Line ${n}: modifier 25 says a separate procedure was done the same day, but there is no other line.`);
    if (EM.test(l.code) && !l.modifiers.includes('25') && c.lines.some((o, j) => j !== i && !EM.test(o.code))) warn(`line_${n}_no25`, `Line ${n}: an office visit billed with a procedure usually needs modifier 25, or it is bundled.`);
    const twin = c.lines.findIndex((o, j) => j < i && o.code === l.code);
    if (twin >= 0 && !l.modifiers.some(m => DISTINCT.has(m))) warn(`line_${n}_dup`, `Line ${n} repeats line ${twin + 1}’s code with no 59/76/X-modifier — it will be denied as a duplicate.`);
    const onFile = auths.filter(a => a.patientRef === c.patientRef && a.code === l.code && a.payerId === c.payerId);
    if (onFile.length && !onFile.some(a => a.status === 'approved' && (!a.validFrom || a.validFrom <= c.serviceFrom) && (!a.validTo || a.validTo >= c.serviceFrom))) {
      warn(`line_${n}_auth`, `Line ${n}: a prior authorization for ${l.code} is on file but none is approved for this date of service.`);
    }
  });
  return out;
}

export const blocking = (checks: Check[]) => checks.filter(c => c.level === 'error');

/* ── Denials ────────────────────────────────────────────────────────────── */

export const DENIAL_CATEGORIES = {
  eligibility: 'Eligibility or coverage', authorization: 'Prior authorization', coding: 'Coding', documentation: 'Documentation or information',
  timely_filing: 'Timely filing', duplicate: 'Duplicate', bundling: 'Bundled', non_covered: 'Not covered', medical_necessity: 'Medical necessity',
  coordination: 'Coordination of benefits', other: 'Other',
} as const;
export type DenialCategory = keyof typeof DENIAL_CATEGORIES;

/** Claim Adjustment Reason Codes most often seen, by what to do about them. */
const CARC_CATEGORY: Record<string, DenialCategory> = {
  '4': 'coding', '5': 'coding', '6': 'coding', '11': 'coding', '16': 'documentation', '18': 'duplicate', '22': 'coordination', '23': 'coordination',
  '26': 'eligibility', '27': 'eligibility', '29': 'timely_filing', '31': 'eligibility', '50': 'medical_necessity', '96': 'non_covered', '97': 'bundling',
  '109': 'eligibility', '119': 'non_covered', '146': 'coding', '167': 'coding', '181': 'coding', '182': 'coding', '197': 'authorization', '198': 'authorization',
  '204': 'non_covered', '226': 'documentation', '227': 'documentation', '234': 'bundling', '236': 'bundling', '252': 'documentation', '15': 'authorization', '62': 'authorization',
};
/** Patient responsibility and contractual write-downs are not denials. */
const NOT_DENIAL = new Set(['1', '2', '3', '45', '253', '142', '94']);

export function carcCategory(carc: string): DenialCategory { return CARC_CATEGORY[carc] ?? 'other'; }
export function isDenial(group: string, carc: string, paidCents: number): boolean {
  if (!carc || NOT_DENIAL.has(carc)) return false;
  if (group === 'PR') return false;
  return paidCents <= 0;
}

export const DENIAL_STATUSES = { open: 'Open', appealing: 'Appealing', corrected: 'Corrected and resubmitted', won: 'Overturned', lost: 'Upheld', written_off: 'Written off' } as const;
export type DenialStatus = keyof typeof DENIAL_STATUSES;
export const APPEAL_STATUSES = { drafting: 'Drafting', submitted: 'Submitted', won: 'Won', partial: 'Partly won', lost: 'Lost', withdrawn: 'Withdrawn' } as const;
export type AppealStatus = keyof typeof APPEAL_STATUSES;

/* ── Prior authorization ────────────────────────────────────────────────── */

export const AUTH_STATUSES = { needed: 'Needed', submitted: 'Submitted', approved: 'Approved', denied: 'Denied', cancelled: 'Cancelled' } as const;
export type AuthStatus = keyof typeof AUTH_STATUSES;
const AUTH_MOVES: Record<AuthStatus, AuthStatus[]> = {
  needed: ['submitted', 'cancelled'], submitted: ['approved', 'denied', 'cancelled'], denied: ['submitted', 'cancelled'], approved: ['cancelled'], cancelled: [],
};
export function authMoveProblem(from: AuthStatus, to: AuthStatus): string | null {
  return AUTH_MOVES[from]?.includes(to) ? null : `An authorization that is “${AUTH_STATUSES[from]}” cannot become “${AUTH_STATUSES[to] ?? to}”.`;
}
/** What the queue shows: an approved authorization past its end date is expired, whatever its row says. */
export function authShown(status: AuthStatus, validTo: string | null, today: string): AuthStatus | 'expired' {
  return status === 'approved' && validTo && validTo < today ? 'expired' : status;
}

/* ── Remittance files ───────────────────────────────────────────────────── */

export interface RemitRow {
  rowNo: number; claimNo: string; payerClaimNo: string; serviceDate: string; code: string;
  billedCents: number; allowedCents: number; paidCents: number; patientRespCents: number;
  adjGroup: string; carc: string; rarc: string; checkNo: string; paidOn: string;
}
export interface ParsedRemit { rows: RemitRow[]; problems: { rowNo: number; says: string }[]; totalPaidCents: number; checks: string[] }

/** Header names we accept for each column — clearinghouse exports name them differently. */
const COLS: Record<keyof Omit<RemitRow, 'rowNo'>, string[]> = {
  claimNo: ['claim_no', 'claim', 'claim number', 'patient control number', 'pcn', 'claim_id', 'clm01'],
  payerClaimNo: ['payer_claim_no', 'payer claim number', 'icn', 'payer claim control number', 'clp07'],
  serviceDate: ['service_date', 'dos', 'date of service', 'svc date'],
  code: ['code', 'cpt', 'hcpcs', 'procedure', 'procedure code', 'cpt/hcpcs'],
  billedCents: ['billed', 'charge', 'billed amount', 'submitted'],
  allowedCents: ['allowed', 'allowed amount'],
  paidCents: ['paid', 'paid amount', 'payment'],
  patientRespCents: ['patient_resp', 'patient responsibility', 'pr', 'patient resp'],
  adjGroup: ['adj_group', 'group', 'group code', 'cas01'],
  carc: ['carc', 'reason', 'reason code', 'adjustment reason', 'cas02'],
  rarc: ['rarc', 'remark', 'remark code'],
  checkNo: ['check_no', 'check', 'eft', 'check/eft', 'trace number', 'trn02'],
  paidOn: ['paid_date', 'paid on', 'payment date', 'check date'],
};

/** RFC 4180-ish: quoted fields, doubled quotes, commas and newlines inside quotes. */
export function csvRows(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [], f = '', q = false;
  const s = text.replace(/^﻿/, '');
  for (let i = 0; i < s.length; i++) {
    const ch = s[i];
    if (q) {
      if (ch === '"') { if (s[i + 1] === '"') { f += '"'; i++; } else q = false; }
      else f += ch;
    } else if (ch === '"') q = true;
    else if (ch === ',') { row.push(f); f = ''; }
    else if (ch === '\n' || ch === '\r') {
      if (ch === '\r' && s[i + 1] === '\n') i++;
      row.push(f); f = '';
      if (row.some(c => c.trim() !== '')) rows.push(row);
      row = [];
    } else f += ch;
  }
  row.push(f);
  if (row.some(c => c.trim() !== '')) rows.push(row);
  return rows;
}

const isoDay = (v: string): string => {
  const s = v.trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s;
  const m = /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/.exec(s);
  if (m) return `${m[3]}-${m[1].padStart(2, '0')}-${m[2].padStart(2, '0')}`;
  if (/^\d{8}$/.test(s)) return `${s.slice(0, 4)}-${s.slice(4, 6)}-${s.slice(6)}`;
  return '';
};

export const REMIT_MAX_ROWS = 5000;

export function parseRemitCsv(text: string): ParsedRemit {
  const all = csvRows(text);
  const problems: ParsedRemit['problems'] = [];
  if (all.length < 2) return { rows: [], problems: [{ rowNo: 0, says: 'The file has no rows under its header.' }], totalPaidCents: 0, checks: [] };
  const head = all[0].map(h => h.trim().toLowerCase());
  const idx = {} as Record<keyof typeof COLS, number>;
  for (const k of Object.keys(COLS) as (keyof typeof COLS)[]) idx[k] = head.findIndex(h => COLS[k].includes(h));
  const missing = (['code', 'paidCents'] as const).filter(k => idx[k] < 0);
  if (idx.claimNo < 0 && idx.payerClaimNo < 0) missing.push('claimNo' as never);
  if (missing.length) {
    return { rows: [], problems: [{ rowNo: 1, says: `The header needs columns for ${missing.map(m => COLS[m][0]).join(', ')}. It has: ${head.join(', ')}.` }], totalPaidCents: 0, checks: [] };
  }
  if (all.length - 1 > REMIT_MAX_ROWS) return { rows: [], problems: [{ rowNo: 0, says: `A file can hold at most ${REMIT_MAX_ROWS} rows. Split it.` }], totalPaidCents: 0, checks: [] };
  const rows: RemitRow[] = [];
  const cell = (r: string[], k: keyof typeof COLS) => (idx[k] >= 0 ? String(r[idx[k]] ?? '').trim() : '');
  for (let i = 1; i < all.length; i++) {
    const r = all[i], rowNo = i + 1;
    const amounts = {} as Record<'billedCents' | 'allowedCents' | 'paidCents' | 'patientRespCents', number>;
    let bad = '';
    for (const k of ['billedCents', 'allowedCents', 'paidCents', 'patientRespCents'] as const) {
      const v = signedCents(cell(r, k));
      if (v == null) { bad = `“${cell(r, k)}” in ${COLS[k][0]} is not an amount.`; break; }
      amounts[k] = v;
    }
    const code = cell(r, 'code').toUpperCase();
    const sd = cell(r, 'serviceDate'), pd = cell(r, 'paidOn');
    if (!bad && !validProcCode(code)) bad = `“${code}” is not a CPT or HCPCS code.`;
    if (!bad && !cell(r, 'claimNo') && !cell(r, 'payerClaimNo')) bad = 'No claim number on this row.';
    if (!bad && sd && !isoDay(sd)) bad = `“${sd}” is not a date.`;
    if (!bad && pd && !isoDay(pd)) bad = `“${pd}” is not a date.`;
    const ssn = phiProblem(r.join(' '));
    if (!bad && ssn) bad = ssn;
    if (bad) { problems.push({ rowNo, says: bad }); continue; }
    rows.push({
      rowNo, claimNo: cell(r, 'claimNo'), payerClaimNo: cell(r, 'payerClaimNo'), serviceDate: isoDay(sd), code,
      ...amounts, adjGroup: cell(r, 'adjGroup').toUpperCase().slice(0, 2), carc: cell(r, 'carc').toUpperCase().slice(0, 6), rarc: cell(r, 'rarc').toUpperCase().slice(0, 8),
      checkNo: cell(r, 'checkNo').slice(0, 40), paidOn: isoDay(pd),
    });
  }
  return { rows, problems, totalPaidCents: rows.reduce((t, r) => t + r.paidCents, 0), checks: [...new Set(rows.map(r => r.checkNo).filter(Boolean))] };
}

/**
 * The identity of one payment on one line. The same payer resending the same
 * remittance (or a second file overlapping the first) produces the same keys,
 * which the database holds unique — so it is posted once, never twice.
 * `occurrence` separates two genuinely identical rows in one file.
 */
export function rowKey(r: RemitRow, occurrence: number): string {
  return [r.checkNo, r.claimNo || r.payerClaimNo, r.code, r.serviceDate, r.paidCents, r.allowedCents, r.carc, occurrence].join('|').toLowerCase();
}

export interface LineFacts { id: string; claimId: string; lineNo: number; code: string; units: number; chargeCents: number; allowedCents: number | null; paidCents: number; patientRespCents: number; adjustCents: number; remitted: boolean }

/**
 * Which line a row pays: the claim's lines with the same code, a line not yet
 * remitted first (so a two-line claim with the same code is matched in order),
 * then any. Null when nothing fits — the row is listed as unmatched, never
 * guessed onto another claim.
 */
export function matchLine(row: RemitRow, lines: LineFacts[], taken: Set<string>): LineFacts | null {
  const same = lines.filter(l => l.code === row.code);
  return same.find(l => !l.remitted && !taken.has(l.id)) ?? same.find(l => !taken.has(l.id)) ?? null;
}

/** The payer's state after its remittance: from what was paid on every line. */
export function payerStatusAfterRemit(lines: { remitted: boolean; paidCents: number; denied: boolean }[]): PayerStatus | null {
  const done = lines.filter(l => l.remitted);
  if (!done.length) return null;
  const paid = done.filter(l => l.paidCents > 0).length;
  const denied = done.filter(l => l.denied && l.paidCents <= 0).length;
  if (paid === 0 && denied > 0) return 'denied';
  if (denied > 0 || done.length < lines.length) return 'partial';
  return paid > 0 ? 'paid' : 'closed';
}

/* ── Reconciliation ─────────────────────────────────────────────────────── */

export interface RecInput { filePaidCents: number; postedCents: number; depositCents: number | null; unmatched: number }
export function reconcile(r: RecInput): { status: 'reconciled' | 'unreconciled'; problems: string[] } {
  const problems: string[] = [];
  if (r.unmatched) problems.push(`${r.unmatched} row${r.unmatched === 1 ? '' : 's'} did not match a claim — match or set aside each one.`);
  if (r.depositCents == null) problems.push('Enter the amount that reached the bank for this check or EFT.');
  else if (r.depositCents !== r.postedCents) problems.push(`The bank deposit (${(r.depositCents / 100).toFixed(2)}) and the payments posted (${(r.postedCents / 100).toFixed(2)}) differ by ${((r.depositCents - r.postedCents) / 100).toFixed(2)}.`);
  if (r.postedCents !== r.filePaidCents && !r.unmatched) problems.push('Some rows of the file were not posted (duplicates of earlier payments). Check they were paid before.');
  return { status: problems.length ? 'unreconciled' : 'reconciled', problems };
}

/* ── A/R aging ──────────────────────────────────────────────────────────── */

export const AGING_BUCKETS = [
  { key: 'b0_30', label: '0–30 days', max: 30 }, { key: 'b31_60', label: '31–60', max: 60 }, { key: 'b61_90', label: '61–90', max: 90 },
  { key: 'b91_120', label: '91–120', max: 120 }, { key: 'b120', label: 'Over 120', max: Infinity },
] as const;
export type BucketKey = typeof AGING_BUCKETS[number]['key'];

export interface ArClaim { id: string; payerId: string; serviceFrom: string; billedCents: number; paidCents: number; adjustCents: number; patientRespCents: number; ch: ChStatus; payer: PayerStatus; work: WorkStatus }

/**
 * What the payer still owes on a claim: billed, less paid, less contractual
 * write-downs, less what was moved to the patient. Only claims that left the
 * building count as receivables — an unsent claim is unbilled, shown apart.
 */
export function payerBalance(c: ArClaim): number {
  return Math.max(0, c.billedCents - c.paidCents - c.adjustCents - c.patientRespCents);
}
export function agingBuckets(claims: ArClaim[], today: string) {
  const buckets = Object.fromEntries(AGING_BUCKETS.map(b => [b.key, { cents: 0, claims: 0 }])) as Record<BucketKey, { cents: number; claims: number }>;
  const byPayer = new Map<string, Record<BucketKey, number>>();
  let unbilledCents = 0, unbilledClaims = 0, patientCents = 0;
  for (const c of claims) {
    if (c.payer === 'closed' || c.work === 'closed') continue;
    patientCents += c.patientRespCents;
    if (c.ch === 'not_sent' || c.ch === 'rejected') { unbilledCents += c.billedCents - c.paidCents; unbilledClaims++; continue; }
    const bal = payerBalance(c);
    if (!bal) continue;
    const age = Math.max(0, Math.floor((Date.parse(today) - Date.parse(c.serviceFrom)) / 86_400_000));
    const b = AGING_BUCKETS.find(x => age <= x.max)!.key;
    buckets[b].cents += bal; buckets[b].claims++;
    const p = byPayer.get(c.payerId) ?? Object.fromEntries(AGING_BUCKETS.map(x => [x.key, 0])) as Record<BucketKey, number>;
    p[b] += bal; byPayer.set(c.payerId, p);
  }
  const totalCents = Object.values(buckets).reduce((t, b) => t + b.cents, 0);
  return { buckets, totalCents, byPayer: [...byPayer.entries()].map(([payerId, b]) => ({ payerId, ...b })), unbilledCents, unbilledClaims, patientCents };
}

/* ── Leakage audit ──────────────────────────────────────────────────────── */

export const LEAK_KINDS = {
  timely_filing: { label: 'Past the filing limit', severity: 'lost', means: 'Never submitted, and the payer’s filing limit has passed. Usually unrecoverable.' },
  denied_unworked: { label: 'Denial not worked', severity: 'at_risk', means: 'Denied, with no appeal or correction under way.' },
  rejected_unresolved: { label: 'Rejection not corrected', severity: 'at_risk', means: 'Rejected by the clearinghouse and not resubmitted — the payer has never seen it.' },
  filing_soon: { label: 'Filing limit close', severity: 'at_risk', means: 'Not yet submitted, and within 30 days of the payer’s filing limit.' },
  underpaid: { label: 'Paid below the fee schedule', severity: 'recoverable', means: 'The payer allowed less than the contracted rate on file.' },
  zero_paid_no_reason: { label: 'Paid nothing, no reason given', severity: 'at_risk', means: 'A remittance paid nothing on the line and gave no denial reason.' },
  no_response: { label: 'No payer response', severity: 'at_risk', means: 'Accepted by the clearinghouse over 45 days ago, with no answer from the payer.' },
} as const;
export type LeakKind = keyof typeof LEAK_KINDS;
/** The order findings are chosen in — the first that applies to a line is its finding, and the only one. */
const LEAK_ORDER: LeakKind[] = ['timely_filing', 'denied_unworked', 'rejected_unresolved', 'filing_soon', 'zero_paid_no_reason', 'underpaid', 'no_response'];

export interface AuditClaim {
  id: string; claimNo: string; payerId: string; serviceFrom: string; ch: ChStatus; chAt: string | null; payer: PayerStatus; work: WorkStatus;
  submittedAt: string | null; lines: LineFacts[];
}
export interface AuditDenial { id: string; claimId: string; lineId: string | null; status: DenialStatus; carc: string; deniedOn: string; appealBy: string | null; amountCents: number }
export interface Finding { key: string; kind: LeakKind; claimId: string; claimNo: string; lineId: string; lineNo: number; code: string; cents: number; evidence: Record<string, string | number | null> }

const days = (a: string, b: string) => Math.floor((Date.parse(b.slice(0, 10)) - Date.parse(a.slice(0, 10))) / 86_400_000);

/**
 * Every claim line with money at risk or lost, at most once each.
 *
 * `feeSchedules` maps a payer id to its contracted allowed amount per code
 * (cents per unit). Amounts are what is at stake on that line — never more
 * than its charge — so the total is a sum of disjoint parts.
 */
export function leakageAudit(claims: AuditClaim[], denials: AuditDenial[], feeSchedules: Record<string, Record<string, number>>, filingDays: Record<string, number>, defaultFilingDays: number, today: string) {
  const findings: Finding[] = [];
  for (const c of claims) {
    if (c.work === 'closed' || c.payer === 'closed') continue;
    const limit = filingDays[c.payerId] ?? defaultFilingDays;
    const age = days(c.serviceFrom, today);
    const unsent = c.ch === 'not_sent';
    for (const l of c.lines) {
      const open = denials.find(d => d.claimId === c.id && (d.lineId === l.id || d.lineId == null) && d.status === 'open');
      const sched = feeSchedules[c.payerId]?.[l.code];
      const expected = sched != null ? sched * l.units : null;
      const tests: Record<LeakKind, () => Finding['evidence'] | null> = {
        timely_filing: () => (unsent && age > limit ? { dateOfService: c.serviceFrom, filingLimitDays: limit, daysSinceService: age } : null),
        denied_unworked: () => (open ? { denial: open.id, reasonCode: open.carc, deniedOn: open.deniedOn, appealBy: open.appealBy } : null),
        rejected_unresolved: () => (c.ch === 'rejected' && c.chAt && days(c.chAt, today) > 7 ? { rejectedOn: c.chAt.slice(0, 10), daysSince: days(c.chAt, today) } : null),
        filing_soon: () => (unsent && age <= limit && limit - age <= 30 ? { dateOfService: c.serviceFrom, filingLimitDays: limit, daysLeft: limit - age } : null),
        zero_paid_no_reason: () => (l.remitted && l.paidCents <= 0 && !denials.some(d => d.claimId === c.id && (d.lineId === l.id || d.lineId == null)) && l.patientRespCents <= 0 ? { paid: 0 } : null),
        underpaid: () => (l.remitted && expected != null && l.allowedCents != null && expected - l.allowedCents > 100 ? { contracted: expected, allowed: l.allowedCents, units: l.units } : null),
        no_response: () => (c.ch === 'accepted' && (c.payer === 'none' || c.payer === 'received') && !l.remitted && c.chAt && days(c.chAt, today) > 45 ? { acceptedOn: c.chAt.slice(0, 10), daysSince: days(c.chAt, today) } : null),
      };
      for (const kind of LEAK_ORDER) {
        const ev = tests[kind]();
        if (!ev) continue;
        /* What the line should bring in: the contracted rate when one is on file, never more than was charged. */
        const due = expected != null ? Math.min(expected, l.chargeCents) : l.chargeCents;
        const atStake = kind === 'underpaid' ? Math.min(l.chargeCents, (expected ?? 0) - (l.allowedCents ?? 0))
          : kind === 'denied_unworked' && open?.lineId ? Math.min(due, open.amountCents)
          : due - Math.max(0, l.paidCents);
        findings.push({ key: `${l.id}`, kind, claimId: c.id, claimNo: c.claimNo, lineId: l.id, lineNo: l.lineNo, code: l.code, cents: Math.max(0, atStake), evidence: ev });
        break;
      }
    }
  }
  const totals = { lost: 0, at_risk: 0, recoverable: 0 } as Record<'lost' | 'at_risk' | 'recoverable', number>;
  for (const f of findings) totals[LEAK_KINDS[f.kind].severity] += f.cents;
  return { findings, totals, totalCents: totals.lost + totals.at_risk + totals.recoverable };
}

/* ── Synthetic fixtures ─────────────────────────────────────────────────── */

/**
 * The test practice: invented throughout, and labelled so on every row. Used
 * by the owner's demo and by the tests — never put in a practice's workspace.
 * Dates are relative to `today`, so the A/R and audit always have something
 * in each bucket.
 */
export function syntheticPractice(today: string) {
  const ago = (n: number) => new Date(Date.parse(today) - n * 86_400_000).toISOString().slice(0, 10);
  return {
    practice: { name: 'Synthetic Family Medicine (test data)', npi: '1234567893', specialty: 'Family medicine' },
    providers: [
      { name: 'Dr. Test Provider One (synthetic)', npi: '1245319599', specialty: 'Family medicine' },
      { name: 'Test Nurse Practitioner (synthetic)', npi: '1679576722', specialty: 'Nurse practitioner' },
    ],
    payers: [
      { name: 'Synthetic Commercial Plan', code: 'SYN01', kind: 'commercial' as PayerKind, filingDays: 90, fees: { '99213': 9200, '99214': 13100, '36415': 900, '81002': 400, '93000': 1700 } },
      { name: 'Synthetic Medicare (test)', code: 'SYN02', kind: 'medicare' as PayerKind, filingDays: 365, fees: { '99213': 8800, '99214': 12600, '36415': 300, '93000': 1600 } },
      { name: 'Synthetic Medicaid (test)', code: 'SYN03', kind: 'medicaid' as PayerKind, filingDays: 120, fees: { '99213': 5500, '99214': 7800 } },
    ],
    claims: [
      { ref: 'SYN-1001', payer: 0, dos: ago(12), dx: ['E119', 'I10'], lines: [{ code: '99214', units: 1, charge: 18000, mods: [] as string[] }, { code: '36415', units: 1, charge: 2500, mods: [] as string[] }], stage: 'paid' },
      { ref: 'SYN-1002', payer: 0, dos: ago(20), dx: ['J069'], lines: [{ code: '99213', units: 1, charge: 13500, mods: [] }], stage: 'underpaid' },
      { ref: 'SYN-1003', payer: 1, dos: ago(40), dx: ['I10'], lines: [{ code: '99214', units: 1, charge: 18000, mods: [] }, { code: '93000', units: 1, charge: 4500, mods: [] }], stage: 'denied' },
      { ref: 'SYN-1004', payer: 1, dos: ago(70), dx: ['M545'], lines: [{ code: '99213', units: 1, charge: 13500, mods: [] }], stage: 'accepted' },
      { ref: 'SYN-1005', payer: 2, dos: ago(100), dx: ['Z0000'], lines: [{ code: '99214', units: 1, charge: 18000, mods: [] }], stage: 'accepted' },
      { ref: 'SYN-1006', payer: 0, dos: ago(65), dx: ['R509'], lines: [{ code: '99213', units: 1, charge: 13500, mods: [] }], stage: 'filing_soon' },
      { ref: 'SYN-1007', payer: 2, dos: ago(150), dx: ['J029'], lines: [{ code: '99213', units: 1, charge: 13500, mods: [] }], stage: 'past_filing' },
      { ref: 'SYN-1008', payer: 0, dos: ago(14), dx: ['N390'], lines: [{ code: '99213', units: 1, charge: 13500, mods: [] }, { code: '81002', units: 1, charge: 1500, mods: [] }], stage: 'rejected' },
      { ref: 'SYN-1009', payer: 0, dos: ago(3), dx: ['E119'], lines: [{ code: '99214', units: 1, charge: 18000, mods: [] }, { code: '36415', units: 1, charge: 2500, mods: [] }], stage: 'coding_review' },
      { ref: 'SYN-1010', payer: 1, dos: ago(2), dx: ['I10'], lines: [{ code: '99213', units: 1, charge: 13500, mods: [] }], stage: 'draft' },
    ],
    auths: [
      { ref: 'SYN-1011', payer: 0, code: '72148', units: 1, status: 'submitted' as AuthStatus, dueIn: 3 },
      { ref: 'SYN-1012', payer: 1, code: '97110', units: 12, status: 'approved' as AuthStatus, validFrom: ago(30), validTo: ago(-60) },
      { ref: 'SYN-1013', payer: 0, code: '70553', units: 1, status: 'needed' as AuthStatus, dueIn: 1 },
    ],
  };
}

/** A remittance for the synthetic practice's claims, as a payer would send it — for trying the import. */
export function syntheticRemitCsv(claimNos: Record<string, string>, today: string): string {
  const rows = [
    ['claim_no', 'payer_claim_no', 'service_date', 'code', 'billed', 'allowed', 'paid', 'patient_resp', 'adj_group', 'carc', 'rarc', 'check_no', 'paid_date'],
  ];
  const c = (ref: string) => claimNos[ref] ?? ref;
  rows.push([c('SYN-1004'), 'SYNICN4004', '', '99213', '135.00', '88.00', '70.40', '17.60', 'CO', '45', '', 'SYNCHK-2002', today]);
  rows.push([c('SYN-1005'), 'SYNICN5005', '', '99214', '180.00', '0', '0', '0', 'CO', '16', 'M51', 'SYNCHK-2002', today]);
  return rows.map(r => r.map(v => (/[",\n]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v)).join(',')).join('\n') + '\n';
}
