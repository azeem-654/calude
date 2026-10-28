/**
 * /api/rcm.php — medical billing / revenue-cycle management (phase 4). The
 * rules are lib/rcm.ts; this file is who may do what, and the record of it.
 *
 * ── Who is who ──
 *
 *   - the **biller** — the install owner, who runs billing for practices.
 *     They set a practice up, write and review claims, record what the
 *     clearinghouse and the payer said, import remittances, work denials,
 *     appeals and prior authorizations, and write internal notes.
 *   - the **practice** — whoever `workspaceAccess` lets into the practice's
 *     workspace (its owner or a client login). The practice portal: they read
 *     their claims, A/R, denials, remittances and the access log, and write
 *     notes the billing team sees and answer its requests. They never receive
 *     an internal note — the server leaves them out, not the screen.
 *
 * The owner reaches a practice's workspace by its id without claiming it (the
 * `knownWorkspace` rule of the growth-service ledger).
 *
 * ── Patient data ──
 *
 * A workspace is synthetic until the owner switches it live, which needs every
 * HIPAA launch blocker signed off, a BAA date, no synthetic rows left, and the
 * owner's own 2-step sign-in. In live mode everybody who opens it needs 2-step
 * sign-in too. Every read of a claim and every change is written to
 * crm_rcm_events, which triggers make append-only. Nothing here sends email,
 * calls an AI or reaches a clearinghouse: there is no clearinghouse
 * integration, so its answers are recorded by hand and the screen says so.
 */
import { body, fail, json } from '../lib/http';
import { RESERVED_AGENCY, nowIso, storageWorkspace, userFromToken, workspaceAccess, type Env, type SessionUser } from '../lib/db';
import {
  APPEAL_STATUSES, AUTH_STATUSES, HIPAA_BLOCKERS, PAYER_KINDS, PAYER_STATUSES,
  agingBuckets, authMoveProblem, authShown, blocking, carcCategory, chMoveProblem, cleanIcd10, codingChecks, isDenial, leakageAudit,
  matchLine, parseRemitCsv, patientRefProblem, payerMoveProblem, payerStatusAfterRemit, phiProblem, reconcile, rowKey, signedCents,
  syntheticPractice, syntheticRemitCsv, validModifier, validNpi, validProcCode,
  type AppealStatus, type AuthStatus, type ChStatus, type DataMode, type LineFacts, type PayerKind, type PayerStatus, type RemitRow, type WorkStatus,
  collectionsStatement, type FeeRow,
} from '../lib/rcm';
import { MEDICAL_BILLING_OFFER } from '../lib/offers';
import { centsFrom } from '../lib/leadRevenue';

const isOwner = (u: SessionUser): boolean => u.role === 'agency' && !u.accountId;
const clip = (v: unknown, n: number) => String(v ?? '').replace(/\p{Cc}/gu, ' ').trim().slice(0, n);
const parse = <T>(s: string | null | undefined, d: T): T => { try { return s ? JSON.parse(s) as T : d; } catch { return d; } };
const id = (p: string) => `${p}_${crypto.randomUUID().replace(/-/g, '').slice(0, 20)}`;
const today = () => nowIso().slice(0, 10);
const validDate = (v: unknown): string | null => {
  const s = String(v ?? '');
  return /^\d{4}-\d{2}-\d{2}$/.test(s) && !Number.isNaN(Date.parse(`${s}T00:00:00Z`)) && new Date(`${s}T00:00:00Z`).toISOString().slice(0, 10) === s ? s : null;
};
const addDays = (day: string, n: number) => new Date(Date.parse(`${day}T00:00:00Z`) + n * 86_400_000).toISOString().slice(0, 10);
const REMIT_MAX_BYTES = 2_000_000;

/* ── Rows ── */

interface Settings { account_id: string; data_mode: DataMode; baa_signed_on: string | null; coding_review: number; timely_filing_days: number; appeal_days: number; live_by: string | null; live_at: string | null }
interface ClaimRow {
  id: string; account_id: string; claim_no: string; practice_id: string; provider_id: string; payer_id: string; patient_ref: string; synthetic: number;
  service_from: string; service_to: string; diagnoses: string; work_status: WorkStatus; ch_status: ChStatus; ch_reason: string; ch_at: string | null;
  payer_status: PayerStatus; payer_claim_no: string; payer_at: string | null; billed_cents: number; allowed_cents: number | null; paid_cents: number;
  patient_resp_cents: number; adjust_cents: number; first_submitted_at: string | null; closed_reason: string; created_by: string; created_at: string; updated_at: string;
}
interface LineRow {
  id: string; account_id: string; claim_id: string; line_no: number; code: string; modifiers: string; units: number; charge_cents: number; dx_pointers: string;
  allowed_cents: number | null; paid_cents: number; patient_resp_cents: number; adjust_cents: number; remitted: number;
}
interface DenialRow { id: string; claim_id: string; line_id: string | null; group_code: string; carc: string; rarc: string; category: string; amount_cents: number; denied_on: string; appeal_by: string | null; status: string; source: string; resolved_at: string | null; created_at: string }
interface PayerRow { id: string; name: string; payer_code: string; kind: string; timely_filing_days: number | null; fee_schedule: string; synthetic: number }
interface RemitRowDb {
  id: string; remit_id: string; row_no: number; row_key: string; claim_no: string; payer_claim_no: string; service_date: string; code: string; billed_cents: number;
  allowed_cents: number; paid_cents: number; patient_resp_cents: number; adj_group: string; carc: string; rarc: string; check_no: string; paid_on: string;
  outcome: string; claim_id: string | null; line_id: string | null; set_aside_reason: string;
}

const claimView = (r: ClaimRow) => ({
  id: r.id, claimNo: r.claim_no, practiceId: r.practice_id, providerId: r.provider_id, payerId: r.payer_id, patientRef: r.patient_ref, synthetic: !!r.synthetic,
  serviceFrom: r.service_from, serviceTo: r.service_to, diagnoses: parse<string[]>(r.diagnoses, []), work: r.work_status, ch: r.ch_status, chReason: r.ch_reason, chAt: r.ch_at,
  payer: r.payer_status, payerClaimNo: r.payer_claim_no, payerAt: r.payer_at, billedCents: r.billed_cents, allowedCents: r.allowed_cents, paidCents: r.paid_cents,
  patientRespCents: r.patient_resp_cents, adjustCents: r.adjust_cents, firstSubmittedAt: r.first_submitted_at, closedReason: r.closed_reason, createdAt: r.created_at, updatedAt: r.updated_at,
});
const lineView = (l: LineRow) => ({
  id: l.id, claimId: l.claim_id, lineNo: l.line_no, code: l.code, modifiers: parse<string[]>(l.modifiers, []), units: l.units, chargeCents: l.charge_cents,
  dxPointers: parse<number[]>(l.dx_pointers, [1]), allowedCents: l.allowed_cents, paidCents: l.paid_cents, patientRespCents: l.patient_resp_cents, adjustCents: l.adjust_cents, remitted: !!l.remitted,
});
const lineFacts = (l: LineRow): LineFacts => ({
  id: l.id, claimId: l.claim_id, lineNo: l.line_no, code: l.code, units: l.units, chargeCents: l.charge_cents, allowedCents: l.allowed_cents,
  paidCents: l.paid_cents, patientRespCents: l.patient_resp_cents, adjustCents: l.adjust_cents, remitted: !!l.remitted,
});
const denialView = (d: DenialRow) => ({
  id: d.id, claimId: d.claim_id, lineId: d.line_id, group: d.group_code, carc: d.carc, rarc: d.rarc, category: d.category, amountCents: d.amount_cents,
  deniedOn: d.denied_on, appealBy: d.appeal_by, status: d.status, source: d.source, resolvedAt: d.resolved_at,
});
const payerView = (p: PayerRow) => ({ id: p.id, name: p.name, code: p.payer_code, kind: p.kind, timelyFilingDays: p.timely_filing_days, fees: parse<Record<string, number>>(p.fee_schedule, {}), synthetic: !!p.synthetic });

/* ── Who is asking ── */

interface Ctx { user: SessionUser; accountId: string; biller: boolean; owner: boolean; mine: boolean; role: 'biller' | 'practice'; settings: Settings }

async function knownWorkspace(env: Env, accountId: string): Promise<{ known: boolean; ownerEmail: string | null }> {
  const w = await env.DB.prepare('SELECT owner_email FROM crm_workspaces WHERE account_id = ?').bind(accountId).first<{ owner_email: string }>();
  if (w) return { known: true, ownerEmail: w.owner_email };
  const u = await env.DB.prepare('SELECT email FROM crm_users WHERE account_id = ? LIMIT 1').bind(accountId).first<{ email: string }>();
  return { known: !!u, ownerEmail: null };
}

async function settingsFor(env: Env, accountId: string): Promise<Settings> {
  const s = await env.DB.prepare('SELECT * FROM crm_rcm_settings WHERE account_id = ?').bind(accountId).first<Settings>();
  return s ?? { account_id: accountId, data_mode: 'synthetic', baa_signed_on: null, coding_review: 1, timely_filing_days: 90, appeal_days: 60, live_by: null, live_at: null };
}

async function has2fa(env: Env, email: string): Promise<boolean> {
  const r = await env.DB.prepare('SELECT totp_enabled_at FROM crm_users WHERE email = ?').bind(email).first<{ totp_enabled_at: string | null }>();
  return !!r?.totp_enabled_at;
}

async function context(env: Env, user: SessionUser, raw: unknown): Promise<Ctx | Response> {
  let accountId = clip(raw, 120);
  if (!accountId || !/^[\w.:@-]{1,120}$/.test(accountId)) return fail('Name the workspace.', 400);
  let owner = isOwner(user), mine = false, biller = false;
  if (accountId.startsWith('__')) {
    if (accountId !== RESERVED_AGENCY || user.role !== 'agency') return fail('That workspace is not yours.', 403, { code: 'not_yours' });
    accountId = storageWorkspace(user, accountId);
    mine = true; biller = owner;
  } else if (owner) {
    const k = await knownWorkspace(env, accountId);
    mine = k.ownerEmail === user.email;
    if (!k.known && !mine) return fail('There is no such workspace.', 404, { code: 'not_found' });
    biller = true;
  } else {
    const a = await workspaceAccess(env.DB, user, accountId);
    if (!a.ok) return fail(a.message ?? 'That workspace is not yours.', 403, { code: a.code ?? 'not_yours' });
  }
  const settings = await settingsFor(env, accountId);
  /* Real patient data: a password alone is not enough to open it. */
  if (settings.data_mode === 'live' && !(await has2fa(env, user.email))) {
    return fail('This workspace holds real patient data. Turn on 2-step sign-in (Settings → Security & Privacy) to open it.', 403, { code: 'needs_2fa' });
  }
  owner = owner && biller;
  return { user, accountId, biller, owner, mine, role: biller ? 'biller' : 'practice', settings };
}

const notBiller = () => fail('Only the billing team can do that. Write them a note instead.', 403, { code: 'biller_only' });
const notOwner = () => fail('Only the install owner can do that.', 403, { code: 'not_owner' });

function event(env: Env, c: Pick<Ctx, 'accountId' | 'user' | 'role'>, claimId: string | null, kind: string, detail: Record<string, unknown> = {}) {
  return env.DB.prepare('INSERT INTO crm_rcm_events (account_id, claim_id, kind, detail, by_email, by_role, at) VALUES (?, ?, ?, ?, ?, ?, ?)')
    .bind(c.accountId, claimId, kind, JSON.stringify(detail), c.user.email, c.role, nowIso());
}

async function loadClaim(env: Env, c: Ctx, claimId: unknown): Promise<ClaimRow | null> {
  return env.DB.prepare('SELECT * FROM crm_rcm_claims WHERE id = ? AND account_id = ?').bind(String(claimId ?? ''), c.accountId).first<ClaimRow>();
}
async function linesOf(env: Env, c: Ctx, claimId: string): Promise<LineRow[]> {
  return (await env.DB.prepare('SELECT * FROM crm_rcm_lines WHERE claim_id = ? AND account_id = ? ORDER BY line_no').bind(claimId, c.accountId).all<LineRow>()).results;
}
async function owned(env: Env, c: Ctx, table: 'crm_rcm_practices' | 'crm_rcm_providers' | 'crm_rcm_payers', rowId: unknown): Promise<boolean> {
  return !!(await env.DB.prepare(`SELECT id FROM ${table} WHERE id = ? AND account_id = ?`).bind(String(rowId ?? ''), c.accountId).first());
}
async function authsFacts(env: Env, c: Ctx) {
  const { results } = await env.DB.prepare('SELECT patient_ref, payer_id, code, status, valid_from, valid_to FROM crm_rcm_auths WHERE account_id = ?').bind(c.accountId)
    .all<{ patient_ref: string; payer_id: string; code: string; status: string; valid_from: string | null; valid_to: string | null }>();
  return results.map(a => ({ patientRef: a.patient_ref, payerId: a.payer_id, code: a.code, status: a.status, validFrom: a.valid_from, validTo: a.valid_to }));
}
async function checksFor(env: Env, c: Ctx, claim: ClaimRow, lines: LineRow[]) {
  return codingChecks({
    serviceFrom: claim.service_from, serviceTo: claim.service_to, diagnoses: parse(claim.diagnoses, []), patientRef: claim.patient_ref, payerId: claim.payer_id,
    lines: lines.map(l => ({ code: l.code, modifiers: parse(l.modifiers, []), units: l.units, chargeCents: l.charge_cents, dxPointers: parse(l.dx_pointers, [1]) })),
  }, today(), await authsFacts(env, c));
}
/** The claim's totals, from its lines, as statements to run with whatever else changes. */
function totalsStmt(env: Env, claimId: string, accountId: string) {
  return env.DB.prepare(`UPDATE crm_rcm_claims SET
      billed_cents = (SELECT COALESCE(SUM(charge_cents), 0) FROM crm_rcm_lines WHERE claim_id = ?1),
      allowed_cents = (SELECT CASE WHEN COUNT(allowed_cents) = 0 THEN NULL ELSE SUM(allowed_cents) END FROM crm_rcm_lines WHERE claim_id = ?1),
      paid_cents = (SELECT COALESCE(SUM(paid_cents), 0) FROM crm_rcm_lines WHERE claim_id = ?1),
      patient_resp_cents = (SELECT COALESCE(SUM(patient_resp_cents), 0) FROM crm_rcm_lines WHERE claim_id = ?1),
      adjust_cents = (SELECT COALESCE(SUM(adjust_cents), 0) FROM crm_rcm_lines WHERE claim_id = ?1),
      updated_at = ?3
    WHERE id = ?1 AND account_id = ?2`).bind(claimId, accountId, nowIso());
}

/* ── Claim input ── */

interface CleanClaim { practiceId: string; providerId: string; payerId: string; patientRef: string; serviceFrom: string; serviceTo: string; diagnoses: string[]; lines: { code: string; modifiers: string[]; units: number; chargeCents: number; dxPointers: number[] }[] }

async function cleanClaim(env: Env, c: Ctx, v: Record<string, unknown>): Promise<CleanClaim | Response> {
  if (!(await owned(env, c, 'crm_rcm_practices', v.practiceId))) return fail('Choose the practice.', 200, { field: 'claim.practice' });
  if (!(await owned(env, c, 'crm_rcm_providers', v.providerId))) return fail('Choose the rendering provider.', 200, { field: 'claim.provider' });
  if (!(await owned(env, c, 'crm_rcm_payers', v.payerId))) return fail('Choose the payer.', 200, { field: 'claim.payer' });
  const patientRef = clip(v.patientRef, 40);
  const pr = patientRefProblem(patientRef, c.settings.data_mode);
  if (pr) return fail(pr, 200, { field: 'claim.patientRef' });
  const serviceFrom = validDate(v.serviceFrom);
  if (!serviceFrom) return fail('Give the date of service.', 200, { field: 'claim.serviceFrom' });
  if (serviceFrom > today()) return fail('The date of service cannot be in the future.', 200, { field: 'claim.serviceFrom' });
  const serviceTo = v.serviceTo ? validDate(v.serviceTo) : serviceFrom;
  if (!serviceTo || serviceTo < serviceFrom) return fail('The service end date must be on or after its start.', 200, { field: 'claim.serviceTo' });
  const dxRaw = Array.isArray(v.diagnoses) ? v.diagnoses : String(v.diagnoses ?? '').split(/[\s,;]+/);
  const diagnoses = dxRaw.map(cleanIcd10).filter(Boolean).slice(0, 12);
  if (!diagnoses.length) return fail('Add at least one diagnosis code.', 200, { field: 'claim.diagnoses' });
  const rawLines = Array.isArray(v.lines) ? v.lines.slice(0, 50) as Record<string, unknown>[] : [];
  if (!rawLines.length) return fail('Add at least one service line.', 200, { field: 'claim.lines' });
  const lines: CleanClaim['lines'] = [];
  for (const [i, l] of rawLines.entries()) {
    const code = clip(l.code, 6).toUpperCase();
    if (!validProcCode(code)) return fail(`Line ${i + 1}: “${code || 'blank'}” is not a CPT or HCPCS code.`, 200, { field: 'claim.lines' });
    const modifiers = (Array.isArray(l.modifiers) ? l.modifiers : String(l.modifiers ?? '').split(/[\s,]+/)).map(m => clip(m, 2).toUpperCase()).filter(Boolean).slice(0, 4);
    if (modifiers.some(m => !validModifier(m))) return fail(`Line ${i + 1}: a modifier is two letters or digits.`, 200, { field: 'claim.lines' });
    const units = Number(l.units ?? 1);
    if (!Number.isInteger(units) || units < 1 || units > 999) return fail(`Line ${i + 1}: units must be a whole number from 1.`, 200, { field: 'claim.lines' });
    const chargeCents = centsFrom(l.charge);
    if (!chargeCents) return fail(`Line ${i + 1}: enter the charge, like 135.00.`, 200, { field: 'claim.lines' });
    const ptrs = (Array.isArray(l.dxPointers) ? l.dxPointers : String(l.dxPointers ?? '1').split(/[\s,]+/)).map(Number).filter(n => Number.isInteger(n) && n > 0).slice(0, 4);
    lines.push({ code, modifiers, units, chargeCents, dxPointers: ptrs.length ? ptrs : [1] });
  }
  return { practiceId: String(v.practiceId), providerId: String(v.providerId), payerId: String(v.payerId), patientRef, serviceFrom, serviceTo, diagnoses, lines };
}

function lineInserts(env: Env, c: Ctx, claimId: string, lines: CleanClaim['lines']) {
  return lines.map((l, i) => env.DB.prepare(`INSERT INTO crm_rcm_lines (id, account_id, claim_id, line_no, code, modifiers, units, charge_cents, dx_pointers) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`)
    .bind(id('rl'), c.accountId, claimId, i + 1, l.code, JSON.stringify(l.modifiers), l.units, l.chargeCents, JSON.stringify(l.dxPointers)));
}

async function nextClaimNo(env: Env, accountId: string): Promise<string> {
  const r = await env.DB.prepare('SELECT COUNT(*) AS n FROM crm_rcm_claims WHERE account_id = ?').bind(accountId).first<{ n: number }>();
  return `C${String((r?.n ?? 0) + 1).padStart(6, '0')}`;
}

/* ── Remittance posting ── */

interface Plan {
  rows: (RemitRow & { key: string; outcome: 'posted' | 'unmatched' | 'duplicate'; claimId: string | null; lineId: string | null; claimNo: string; why: string })[];
  postedCents: number;
}

/** What an import would do, without writing: each row matched, or why not. */
async function planRemit(env: Env, c: Ctx, rows: RemitRow[]): Promise<Plan> {
  const claims = (await env.DB.prepare('SELECT id, claim_no, payer_claim_no FROM crm_rcm_claims WHERE account_id = ?').bind(c.accountId).all<{ id: string; claim_no: string; payer_claim_no: string }>()).results;
  const byNo = new Map(claims.map(r => [r.claim_no.toLowerCase(), r]));
  const byPayerNo = new Map(claims.filter(r => r.payer_claim_no).map(r => [r.payer_claim_no.toLowerCase(), r]));
  const lineCache = new Map<string, LineFacts[]>();
  const seen = new Map<string, number>();
  const keyed = rows.map(r => {
    const base = rowKey(r, 0);
    const n = seen.get(base) ?? 0;
    seen.set(base, n + 1);
    return { r, key: rowKey(r, n) };
  });
  const posted = new Set<string>();
  for (let i = 0; i < keyed.length; i += 90) {
    const part = keyed.slice(i, i + 90).map(k => k.key);
    const { results } = await env.DB.prepare(`SELECT row_key FROM crm_rcm_remit_rows WHERE account_id = ? AND outcome = 'posted' AND row_key IN (${part.map(() => '?').join(',')})`)
      .bind(c.accountId, ...part).all<{ row_key: string }>();
    for (const x of results) posted.add(x.row_key);
  }
  const taken = new Set<string>();
  const out: Plan['rows'] = [];
  let postedCents = 0;
  for (const { r, key } of keyed) {
    if (posted.has(key)) { out.push({ ...r, key, outcome: 'duplicate', claimId: null, lineId: null, why: 'Already posted from an earlier file.' }); continue; }
    const claim = (r.claimNo && byNo.get(r.claimNo.toLowerCase())) || (r.payerClaimNo && byPayerNo.get(r.payerClaimNo.toLowerCase())) || null;
    if (!claim) { out.push({ ...r, key, outcome: 'unmatched', claimId: null, lineId: null, why: 'No claim in this workspace has that number.' }); continue; }
    if (!lineCache.has(claim.id)) lineCache.set(claim.id, (await linesOf(env, c, claim.id)).map(lineFacts));
    const line = matchLine(r, lineCache.get(claim.id)!, taken);
    if (!line) { out.push({ ...r, key, outcome: 'unmatched', claimId: claim.id, lineId: null, claimNo: claim.claim_no, why: `Claim ${claim.claim_no} has no ${r.code} line.` }); continue; }
    taken.add(line.id);
    posted.add(key);
    postedCents += r.paidCents;
    out.push({ ...r, key, outcome: 'posted', claimId: claim.id, lineId: line.id, claimNo: claim.claim_no, why: '' });
  }
  return { rows: out, postedCents };
}

/** The statements that post one matched row: the line, a denial if it is one, and the claim's statuses after. */
async function postRowStmts(env: Env, c: Ctx, row: RemitRow, rowId: string, claimId: string, lineId: string): Promise<D1PreparedStatement[]> {
  const claim = (await loadClaim(env, c, claimId))!;
  const lines = await linesOf(env, c, claimId);
  const line = lines.find(l => l.id === lineId)!;
  const allowed = row.allowedCents !== 0 ? row.allowedCents : line.allowed_cents;
  const denied = isDenial(row.adjGroup, row.carc, row.paidCents);
  const after = lines.map(l => (l.id === lineId
    ? { remitted: true, paidCents: l.paid_cents + row.paidCents, denied }
    : { remitted: !!l.remitted, paidCents: l.paid_cents, denied: false }));
  const prevDenied = (await env.DB.prepare("SELECT line_id FROM crm_rcm_denials WHERE claim_id = ? AND account_id = ? AND status IN ('open','appealing')").bind(claimId, c.accountId).all<{ line_id: string | null }>()).results;
  for (const [i, l] of lines.entries()) if (prevDenied.some(d => d.line_id === l.id) && l.id !== lineId) after[i].denied = true;
  const status = payerStatusAfterRemit(after) ?? claim.payer_status;
  const paidOn = row.paidOn || today();
  const stmts: D1PreparedStatement[] = [
    env.DB.prepare(`UPDATE crm_rcm_lines SET allowed_cents = ?, paid_cents = paid_cents + ?, patient_resp_cents = patient_resp_cents + ?,
        adjust_cents = CASE WHEN ? IS NULL THEN adjust_cents ELSE MAX(0, charge_cents - ?) END, remitted = 1 WHERE id = ? AND account_id = ?`)
      .bind(allowed, row.paidCents, row.patientRespCents, allowed, allowed ?? 0, lineId, c.accountId),
    env.DB.prepare(`UPDATE crm_rcm_claims SET payer_status = ?, payer_at = ?, payer_claim_no = CASE WHEN payer_claim_no = '' THEN ? ELSE payer_claim_no END,
        ch_status = CASE WHEN ch_status IN ('submitted','not_sent') THEN 'accepted' ELSE ch_status END, updated_at = ? WHERE id = ? AND account_id = ?`)
      .bind(status, nowIso(), row.payerClaimNo, nowIso(), claimId, c.accountId),
    totalsStmt(env, claimId, c.accountId),
    event(env, c, claimId, 'remit_posted', { row: rowId, code: row.code, paidCents: row.paidCents, allowedCents: row.allowedCents, carc: row.carc, payerStatus: status }),
  ];
  if (denied) {
    stmts.push(env.DB.prepare(`INSERT INTO crm_rcm_denials (id, account_id, claim_id, line_id, group_code, carc, rarc, category, amount_cents, denied_on, appeal_by, status, source, remit_row_id, created_by, created_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'open', 'remit', ?, ?, ?)`)
      .bind(id('rd'), c.accountId, claimId, lineId, row.adjGroup, row.carc, row.rarc, carcCategory(row.carc), row.billedCents || line.charge_cents, paidOn,
        addDays(paidOn, c.settings.appeal_days), rowId, c.user.email, nowIso()));
  } else if (row.paidCents > 0) {
    /* A later payment on a line that was denied answers that denial. */
    stmts.push(env.DB.prepare(`UPDATE crm_rcm_denials SET status = 'won', resolved_by = ?, resolved_at = ? WHERE claim_id = ? AND line_id = ? AND account_id = ? AND status IN ('open','appealing','corrected')`)
      .bind(c.user.email, nowIso(), claimId, lineId, c.accountId));
  }
  return stmts;
}

async function refreshRemit(env: Env, c: Ctx, remitId: string) {
  const r = await env.DB.prepare('SELECT * FROM crm_rcm_remits WHERE id = ? AND account_id = ?').bind(remitId, c.accountId).first<{ file_paid_cents: number; deposit_cents: number | null }>();
  if (!r) return;
  const agg = await env.DB.prepare(`SELECT COALESCE(SUM(CASE WHEN outcome = 'posted' THEN paid_cents END), 0) AS posted, SUM(outcome = 'posted') AS np, SUM(outcome = 'unmatched') AS nu, SUM(outcome = 'duplicate') AS nd
      FROM crm_rcm_remit_rows WHERE remit_id = ? AND account_id = ?`).bind(remitId, c.accountId).first<{ posted: number; np: number; nu: number; nd: number }>();
  const rec = reconcile({ filePaidCents: r.file_paid_cents, postedCents: agg?.posted ?? 0, depositCents: r.deposit_cents, unmatched: agg?.nu ?? 0 });
  await env.DB.prepare('UPDATE crm_rcm_remits SET posted_cents = ?, rows_posted = ?, rows_unmatched = ?, rows_duplicate = ?, status = ? WHERE id = ? AND account_id = ?')
    .bind(agg?.posted ?? 0, agg?.np ?? 0, agg?.nu ?? 0, agg?.nd ?? 0, rec.status, remitId, c.accountId).run();
}

async function sha256Hex(s: string): Promise<string> {
  const d = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(s));
  return [...new Uint8Array(d)].map(b => b.toString(16).padStart(2, '0')).join('');
}

/* ── The handler ── */

export async function handleRcm(req: Request, env: Env): Promise<Response> {
  const d = await body<Record<string, unknown>>(req);
  const action = String(d.action ?? '');
  const user = await userFromToken(env.DB, d.token as string | undefined);
  if (!user) return fail('Sign in again.', 401, { code: 'signed_out' });

  /* ── The owner's own: launch blockers and the practices they bill for ── */

  if (action === 'blockers' || action === 'blocker_set' || action === 'practices_all') {
    if (!isOwner(user)) return notOwner();
    if (action === 'blocker_set') {
      const key = String(d.key ?? '');
      if (!HIPAA_BLOCKERS.some(b => b.key === key)) return fail('There is no such item.', 400);
      if (d.done) {
        const note = clip(d.note, 400);
        if (note.length < 3) return fail('Say how this was done — who, what document, or where it is kept.', 200, { field: 'blocker.note' });
        await env.DB.prepare('INSERT INTO crm_rcm_blockers (key, done_by, done_at, note) VALUES (?, ?, ?, ?) ON CONFLICT(key) DO UPDATE SET done_by = excluded.done_by, done_at = excluded.done_at, note = excluded.note')
          .bind(key, user.email, nowIso(), note).run();
      } else {
        await env.DB.prepare('DELETE FROM crm_rcm_blockers WHERE key = ?').bind(key).run();
      }
    }
    if (action === 'practices_all') {
      const { results } = await env.DB.prepare(
        `SELECT u.account_id AS accountId, u.email, u.name,
                (SELECT data_mode FROM crm_rcm_settings s WHERE s.account_id = u.account_id) AS mode,
                (SELECT COUNT(*) FROM crm_rcm_practices p WHERE p.account_id = u.account_id) AS practices,
                (SELECT COUNT(*) FROM crm_rcm_claims k WHERE k.account_id = u.account_id) AS claims,
                (SELECT COUNT(*) FROM crm_rcm_denials x WHERE x.account_id = u.account_id AND x.status = 'open') AS openDenials
         FROM crm_users u WHERE u.role = 'agency' AND u.account_id IS NOT NULL
         ORDER BY practices DESC, u.created_at DESC LIMIT 500`,
      ).all();
      return json({ success: true, workspaces: results });
    }
    const { results } = await env.DB.prepare('SELECT key, done_by AS doneBy, done_at AS doneAt, note FROM crm_rcm_blockers').all<{ key: string; doneBy: string; doneAt: string; note: string }>();
    const done = new Map(results.map(r => [r.key, r]));
    return json({ success: true, blockers: HIPAA_BLOCKERS.map(b => ({ ...b, done: done.get(b.key) ?? null })), cleared: HIPAA_BLOCKERS.every(b => done.has(b.key)) });
  }

  /* Everything else is about one practice workspace. */
  const ctx = await context(env, user, d.accountId);
  if (ctx instanceof Response) return ctx;
  const c = ctx;
  const mode = c.settings.data_mode;
  const synthetic = mode === 'synthetic' ? 1 : 0;

  /* Every box a person types into is checked for an SSN, whichever action it is. */
  const ssn = phiProblem(JSON.stringify(d));
  if (ssn && action !== 'remit_preview' && action !== 'remit_import') return fail(ssn, 200);

  if (action === 'overview') {
    const [claims, lines, denials, appeals, payers, practices, providers, remits, auths, notes, blockers] = await Promise.all([
      env.DB.prepare('SELECT * FROM crm_rcm_claims WHERE account_id = ? ORDER BY service_from DESC, created_at DESC LIMIT 2000').bind(c.accountId).all<ClaimRow>(),
      env.DB.prepare('SELECT * FROM crm_rcm_lines WHERE account_id = ? ORDER BY claim_id, line_no').bind(c.accountId).all<LineRow>(),
      env.DB.prepare('SELECT * FROM crm_rcm_denials WHERE account_id = ? ORDER BY denied_on DESC').bind(c.accountId).all<DenialRow>(),
      env.DB.prepare('SELECT * FROM crm_rcm_appeals WHERE account_id = ? ORDER BY created_at DESC').bind(c.accountId).all(),
      env.DB.prepare('SELECT * FROM crm_rcm_payers WHERE account_id = ? ORDER BY name').bind(c.accountId).all<PayerRow>(),
      env.DB.prepare('SELECT id, name, npi, specialty, synthetic FROM crm_rcm_practices WHERE account_id = ? ORDER BY created_at').bind(c.accountId).all(),
      env.DB.prepare('SELECT id, practice_id AS practiceId, name, npi, specialty, active, synthetic FROM crm_rcm_providers WHERE account_id = ? ORDER BY name').bind(c.accountId).all(),
      env.DB.prepare('SELECT * FROM crm_rcm_remits WHERE account_id = ? ORDER BY imported_at DESC LIMIT 200').bind(c.accountId).all(),
      env.DB.prepare('SELECT * FROM crm_rcm_auths WHERE account_id = ? ORDER BY COALESCE(due_on, valid_to, created_at)').bind(c.accountId).all(),
      /* The practice never receives an internal note: filtered here, not on the screen. */
      env.DB.prepare(`SELECT * FROM crm_rcm_notes WHERE account_id = ? ${c.biller ? '' : "AND visibility = 'practice'"} ORDER BY at DESC LIMIT 500`).bind(c.accountId).all(),
      c.owner ? env.DB.prepare('SELECT key FROM crm_rcm_blockers').all<{ key: string }>() : Promise.resolve({ results: [] as { key: string }[] }),
    ]);
    const linesBy = new Map<string, LineRow[]>();
    for (const l of lines.results) linesBy.set(l.claim_id, [...(linesBy.get(l.claim_id) ?? []), l]);
    const pv = payers.results.map(payerView);
    const t = today();
    const aging = agingBuckets(claims.results.map(r => ({
      id: r.id, payerId: r.payer_id, serviceFrom: r.service_from, billedCents: r.billed_cents, paidCents: r.paid_cents, adjustCents: r.adjust_cents,
      patientRespCents: r.patient_resp_cents, ch: r.ch_status, payer: r.payer_status, work: r.work_status,
    })), t);
    const audit = leakageAudit(
      claims.results.map(r => ({ id: r.id, claimNo: r.claim_no, payerId: r.payer_id, serviceFrom: r.service_from, ch: r.ch_status, chAt: r.ch_at, payer: r.payer_status, work: r.work_status, submittedAt: r.first_submitted_at, lines: (linesBy.get(r.id) ?? []).map(lineFacts) })),
      denials.results.map(x => ({ id: x.id, claimId: x.claim_id, lineId: x.line_id, status: x.status as never, carc: x.carc, deniedOn: x.denied_on, appealBy: x.appeal_by, amountCents: x.amount_cents })),
      Object.fromEntries(pv.map(p => [p.id, p.fees])),
      Object.fromEntries(pv.filter(p => p.timelyFilingDays).map(p => [p.id, p.timelyFilingDays!])),
      c.settings.timely_filing_days, t,
    );
    /* An overview opened is a view of patient data: logged, once per person per ten minutes so reloads do not bury the log. */
    const recent = await env.DB.prepare("SELECT 1 FROM crm_rcm_events WHERE account_id = ? AND by_email = ? AND kind = 'opened' AND at > ? LIMIT 1")
      .bind(c.accountId, c.user.email, new Date(Date.now() - 600_000).toISOString()).first();
    if (!recent) await event(env, c, null, 'opened', {}).run();
    return json({
      success: true,
      as: { biller: c.biller, owner: c.owner, practice: !c.biller, mine: c.mine },
      settings: {
        mode, baaSignedOn: c.settings.baa_signed_on, codingReview: !!c.settings.coding_review, timelyFilingDays: c.settings.timely_filing_days,
        appealDays: c.settings.appeal_days, liveAt: c.settings.live_at, liveBy: c.settings.live_by,
      },
      practices: practices.results, providers: providers.results, payers: pv,
      claims: claims.results.map(r => ({ ...claimView(r), lines: (linesBy.get(r.id) ?? []).map(lineView) })),
      denials: denials.results.map(denialView), appeals: appeals.results,
      remits: remits.results, auths: (auths.results as { status: AuthStatus; valid_to: string | null }[]).map(a => ({ ...a, shown: authShown(a.status, a.valid_to, t) })),
      notes: notes.results, aging, leakage: audit,
      blockersCleared: c.owner ? HIPAA_BLOCKERS.every(b => blockers.results.some(r => r.key === b.key)) : null,
      /* Nothing reaches a clearinghouse or a payer from here; the screen says so rather than implying it. */
      integrations: { clearinghouse: 'none', eligibility: 'none' },
    });
  }

  if (action === 'claim_get') {
    const claim = await loadClaim(env, c, d.id);
    if (!claim) return fail('That claim is not in this workspace.', 404);
    const lines = await linesOf(env, c, claim.id);
    const [denials, appeals, notes, events, rows, checks] = await Promise.all([
      env.DB.prepare('SELECT * FROM crm_rcm_denials WHERE claim_id = ? AND account_id = ? ORDER BY denied_on').bind(claim.id, c.accountId).all<DenialRow>(),
      env.DB.prepare('SELECT * FROM crm_rcm_appeals WHERE claim_id = ? AND account_id = ? ORDER BY created_at').bind(claim.id, c.accountId).all(),
      env.DB.prepare(`SELECT * FROM crm_rcm_notes WHERE claim_id = ? AND account_id = ? ${c.biller ? '' : "AND visibility = 'practice'"} ORDER BY at`).bind(claim.id, c.accountId).all(),
      env.DB.prepare('SELECT kind, detail, by_email AS byEmail, by_role AS byRole, at FROM crm_rcm_events WHERE claim_id = ? AND account_id = ? ORDER BY id').bind(claim.id, c.accountId).all(),
      env.DB.prepare('SELECT * FROM crm_rcm_remit_rows WHERE claim_id = ? AND account_id = ? ORDER BY paid_on, row_no').bind(claim.id, c.accountId).all(),
      checksFor(env, c, claim, lines),
    ]);
    await event(env, c, claim.id, 'viewed', {}).run();
    return json({
      success: true, claim: claimView(claim), lines: lines.map(lineView), checks,
      denials: denials.results.map(denialView), appeals: appeals.results, notes: notes.results,
      events: events.results.map(e => ({ ...e, detail: parse((e as { detail: string }).detail, {}) })), remitRows: rows.results,
    });
  }

  if (action === 'remit_get') {
    const r = await env.DB.prepare('SELECT * FROM crm_rcm_remits WHERE id = ? AND account_id = ?').bind(String(d.id ?? ''), c.accountId).first<{ id: string; file_paid_cents: number; posted_cents: number; deposit_cents: number | null; rows_unmatched: number }>();
    if (!r) return fail('That remittance is not in this workspace.', 404);
    const rows = await env.DB.prepare('SELECT * FROM crm_rcm_remit_rows WHERE remit_id = ? AND account_id = ? ORDER BY row_no').bind(r.id, c.accountId).all<RemitRowDb>();
    await event(env, c, null, 'remit_viewed', { remit: r.id }).run();
    return json({ success: true, remit: r, rows: rows.results, reconciliation: reconcile({ filePaidCents: r.file_paid_cents, postedCents: r.posted_cents, depositCents: r.deposit_cents, unmatched: r.rows_unmatched }) });
  }

  if (action === 'audit') {
    const { results } = await env.DB.prepare('SELECT e.id, e.claim_id AS claimId, k.claim_no AS claimNo, e.kind, e.detail, e.by_email AS byEmail, e.by_role AS byRole, e.at FROM crm_rcm_events e LEFT JOIN crm_rcm_claims k ON k.id = e.claim_id WHERE e.account_id = ? ORDER BY e.id DESC LIMIT 500')
      .bind(c.accountId).all();
    return json({ success: true, events: results.map(e => ({ ...e, detail: parse((e as { detail: string }).detail, {}) })) });
  }

  /* The month's collections fee statement (lib/rcm.ts collectionsStatement): read by
     the billing team and the practice alike, so the practice can check every line
     behind the fee. A calculation to review — nothing is invoiced or charged here. */
  if (action === 'fee_statement') {
    const month = String(d.month ?? '').trim() || today().slice(0, 7);
    if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(month)) return fail('Name the month as YYYY-MM.', 200, { field: 'rcm.fee.month' });
    const { results } = await env.DB.prepare(`SELECT r.id, r.claim_id AS claimId, COALESCE(k.claim_no, r.claim_no) AS claimNo, r.paid_on AS paidOn, r.paid_cents AS paidCents, r.outcome
        FROM crm_rcm_remit_rows r LEFT JOIN crm_rcm_claims k ON k.id = r.claim_id AND k.account_id = r.account_id
        WHERE r.account_id = ? AND r.paid_on LIKE ? ORDER BY r.paid_on, r.row_no`).bind(c.accountId, `${month}%`).all<FeeRow>();
    const st = collectionsStatement(results, month, MEDICAL_BILLING_OFFER.collectionsBps);
    return json({
      success: true, statement: st, synthetic: mode === 'synthetic',
      basis: MEDICAL_BILLING_OFFER.feeBasis,
      status: 'calculated — for review, not invoiced',
      patientPayments: 'not tracked',
    });
  }

  /* Notes: the one thing both sides write. A practice note is always visible to both. */
  if (action === 'note_add') {
    const text = clip(d.body, 2000);
    if (text.length < 2) return fail('Write the note.', 200, { field: 'note.body' });
    const claimId = d.claimId ? String(d.claimId) : null;
    if (claimId && !(await loadClaim(env, c, claimId))) return fail('That claim is not in this workspace.', 404);
    const authId = d.authId ? String(d.authId) : null;
    if (authId && !(await env.DB.prepare('SELECT id FROM crm_rcm_auths WHERE id = ? AND account_id = ?').bind(authId, c.accountId).first())) return fail('That authorization is not in this workspace.', 404);
    const visibility = c.biller && d.visibility === 'internal' ? 'internal' : 'practice';
    const kind = c.biller && d.kind === 'request' ? 'request' : 'note';
    const nid = id('rn');
    const stmts = [
      env.DB.prepare('INSERT INTO crm_rcm_notes (id, account_id, claim_id, auth_id, visibility, kind, body, by_email, by_role, at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)')
        .bind(nid, c.accountId, claimId, authId, visibility, kind, text, c.user.email, c.role, nowIso()),
      event(env, c, claimId, visibility === 'internal' ? 'internal_note' : kind === 'request' ? 'request_sent' : 'note', { note: nid }),
    ];
    if (d.answers) {
      const req = await env.DB.prepare("SELECT id FROM crm_rcm_notes WHERE id = ? AND account_id = ? AND kind = 'request' AND visibility = 'practice'").bind(String(d.answers), c.accountId).first();
      if (!req) return fail('That request is not in this workspace.', 404);
      stmts.push(env.DB.prepare('UPDATE crm_rcm_notes SET answered_at = ? WHERE id = ? AND account_id = ?').bind(nowIso(), String(d.answers), c.accountId));
    }
    await env.DB.batch(stmts);
    return json({ success: true, id: nid });
  }

  /* Everything below changes the billing record: the billing team's alone. */
  if (!c.biller) return notBiller();

  if (action === 'settings_save') {
    const s = (d.settings ?? {}) as Record<string, unknown>;
    const filing = Number(s.timelyFilingDays ?? c.settings.timely_filing_days), appeal = Number(s.appealDays ?? c.settings.appeal_days);
    if (!Number.isInteger(filing) || filing < 30 || filing > 730) return fail('A filing limit is between 30 and 730 days.', 200, { field: 'settings.timelyFilingDays' });
    if (!Number.isInteger(appeal) || appeal < 14 || appeal > 365) return fail('An appeal window is between 14 and 365 days.', 200, { field: 'settings.appealDays' });
    let baa = c.settings.baa_signed_on;
    if (s.baaSignedOn !== undefined) {
      baa = s.baaSignedOn ? validDate(s.baaSignedOn) : null;
      if (s.baaSignedOn && (!baa || baa > today())) return fail('Give the date the BAA was signed — today or earlier.', 200, { field: 'settings.baaSignedOn' });
      if (!baa && mode === 'live') return fail('A live workspace keeps its BAA date.', 200, { field: 'settings.baaSignedOn' });
    }
    await env.DB.batch([
      env.DB.prepare(`INSERT INTO crm_rcm_settings (account_id, data_mode, baa_signed_on, coding_review, timely_filing_days, appeal_days, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)
          ON CONFLICT(account_id) DO UPDATE SET baa_signed_on = excluded.baa_signed_on, coding_review = excluded.coding_review, timely_filing_days = excluded.timely_filing_days, appeal_days = excluded.appeal_days, updated_at = excluded.updated_at`)
        .bind(c.accountId, mode, baa, s.codingReview === false ? 0 : 1, filing, appeal, nowIso()),
      event(env, c, null, 'settings', { baaSignedOn: baa, codingReview: s.codingReview !== false, filing, appeal }),
    ]);
    return json({ success: true });
  }

  if (action === 'go_live') {
    if (!c.owner) return notOwner();
    if (mode === 'live') return json({ success: true, already: true });
    const done = (await env.DB.prepare('SELECT key FROM crm_rcm_blockers').all<{ key: string }>()).results.map(r => r.key);
    const open = HIPAA_BLOCKERS.filter(b => !done.includes(b.key));
    if (open.length) return fail(`${open.length} launch item${open.length === 1 ? ' is' : 's are'} not signed off yet: ${open.map(b => b.title).join('; ')}.`, 200, { code: 'blockers_open' });
    if (!c.settings.baa_signed_on) return fail('Record the date this practice signed its BAA first.', 200, { field: 'settings.baaSignedOn' });
    if (!(await has2fa(env, c.user.email))) return fail('Turn on 2-step sign-in for your own account first (Settings → Security & Privacy).', 200, { code: 'needs_2fa' });
    const left = await env.DB.prepare(`SELECT (SELECT COUNT(*) FROM crm_rcm_claims WHERE account_id = ?1 AND synthetic = 1) + (SELECT COUNT(*) FROM crm_rcm_practices WHERE account_id = ?1 AND synthetic = 1)
        + (SELECT COUNT(*) FROM crm_rcm_payers WHERE account_id = ?1 AND synthetic = 1) + (SELECT COUNT(*) FROM crm_rcm_auths WHERE account_id = ?1 AND synthetic = 1) AS n`).bind(c.accountId).first<{ n: number }>();
    if (left?.n) return fail('Remove the synthetic test data first, so nothing invented sits beside real patients.', 200, { code: 'synthetic_left' });
    if (String(d.confirm ?? '') !== 'LIVE') return fail('Type LIVE to confirm.', 200, { field: 'golive.confirm' });
    await env.DB.batch([
      env.DB.prepare(`INSERT INTO crm_rcm_settings (account_id, data_mode, baa_signed_on, coding_review, timely_filing_days, appeal_days, live_by, live_at, updated_at) VALUES (?, 'live', ?, ?, ?, ?, ?, ?, ?)
          ON CONFLICT(account_id) DO UPDATE SET data_mode = 'live', live_by = excluded.live_by, live_at = excluded.live_at, updated_at = excluded.updated_at`)
        .bind(c.accountId, c.settings.baa_signed_on, c.settings.coding_review, c.settings.timely_filing_days, c.settings.appeal_days, c.user.email, nowIso(), nowIso()),
      event(env, c, null, 'went_live', {}),
    ]);
    return json({ success: true });
  }

  if (action === 'synthetic_seed') {
    if (!c.owner || !c.mine) return fail('Synthetic test data goes only into a workspace of your own, never a practice’s.', 403, { code: 'not_yours' });
    if (mode !== 'synthetic') return fail('This workspace holds live data.', 200);
    if (await env.DB.prepare('SELECT id FROM crm_rcm_practices WHERE account_id = ? AND synthetic = 1').bind(c.accountId).first()) return json({ success: true, already: true });
    const t = today(), fx = syntheticPractice(t), at = nowIso();
    const pid = id('rp');
    const provIds = fx.providers.map(() => id('rv'));
    const payerIds = fx.payers.map(() => id('ry'));
    const stmts: D1PreparedStatement[] = [
      env.DB.prepare(`INSERT INTO crm_rcm_settings (account_id, data_mode, updated_at) VALUES (?, 'synthetic', ?) ON CONFLICT(account_id) DO NOTHING`).bind(c.accountId, at),
      env.DB.prepare('INSERT INTO crm_rcm_practices (id, account_id, name, npi, specialty, synthetic, created_by, created_at) VALUES (?, ?, ?, ?, ?, 1, ?, ?)').bind(pid, c.accountId, fx.practice.name, fx.practice.npi, fx.practice.specialty, c.user.email, at),
      ...fx.providers.map((p, i) => env.DB.prepare('INSERT INTO crm_rcm_providers (id, account_id, practice_id, name, npi, specialty, synthetic, created_at) VALUES (?, ?, ?, ?, ?, ?, 1, ?)').bind(provIds[i], c.accountId, pid, p.name, p.npi, p.specialty, at)),
      ...fx.payers.map((p, i) => env.DB.prepare('INSERT INTO crm_rcm_payers (id, account_id, name, payer_code, kind, timely_filing_days, fee_schedule, synthetic, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, 1, ?, ?)')
        .bind(payerIds[i], c.accountId, p.name, p.code, p.kind, p.filingDays, JSON.stringify(p.fees), at, at)),
    ];
    const base = Number((await nextClaimNo(env, c.accountId)).slice(1));
    const claimNos: Record<string, string> = {};
    const posts: { claimId: string; row: RemitRow }[] = [];
    fx.claims.forEach((k, i) => {
      const cid = id('rc'), no = `C${String(base + i).padStart(6, '0')}`;
      claimNos[k.ref] = no;
      const sent = !['draft', 'coding_review', 'filing_soon', 'past_filing'].includes(k.stage);
      const ch: ChStatus = k.stage === 'rejected' ? 'rejected' : sent ? 'accepted' : 'not_sent';
      const work: WorkStatus = k.stage === 'draft' || k.stage === 'rejected' ? 'draft' : k.stage === 'coding_review' ? 'coding_review' : sent ? 'submitted' : 'ready';
      const chAt = sent || ch === 'rejected' ? new Date(Date.parse(k.dos) + 2 * 86_400_000).toISOString() : null;
      stmts.push(env.DB.prepare(`INSERT INTO crm_rcm_claims (id, account_id, claim_no, practice_id, provider_id, payer_id, patient_ref, synthetic, service_from, service_to, diagnoses, work_status, ch_status, ch_reason, ch_at, first_submitted_at, created_by, created_at, updated_at)
          VALUES (?, ?, ?, ?, ?, ?, ?, 1, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`)
        .bind(cid, c.accountId, no, pid, provIds[i % 2], payerIds[k.payer], k.ref, k.dos, k.dos, JSON.stringify(k.dx), work, ch, ch === 'rejected' ? 'Synthetic: subscriber ID invalid for payer' : '', chAt, sent || ch === 'rejected' ? chAt : null, c.user.email, at, at));
      stmts.push(...lineInserts(env, c, cid, k.lines.map(l => ({ code: l.code, modifiers: l.mods, units: l.units, chargeCents: l.charge, dxPointers: [1] }))));
      stmts.push(totalsStmt(env, cid, c.accountId));
      const fees = fx.payers[k.payer].fees as Record<string, number>;
      if (k.stage === 'paid' || k.stage === 'underpaid' || k.stage === 'denied') {
        k.lines.forEach((l, j) => {
          const contract = fees[l.code] ?? l.charge;
          const allowed = k.stage === 'underpaid' ? contract - 1800 : k.stage === 'denied' && j === 0 ? 0 : contract;
          const paid = k.stage === 'denied' && j === 0 ? 0 : Math.round(allowed * 0.8);
          posts.push({ claimId: cid, row: { rowNo: j + 2, claimNo: no, payerClaimNo: `SYNICN${base + i}`, serviceDate: k.dos, code: l.code, billedCents: l.charge, allowedCents: allowed, paidCents: paid,
            patientRespCents: allowed - paid, adjGroup: paid ? 'CO' : 'CO', carc: paid ? '45' : '50', rarc: paid ? '' : 'N115', checkNo: 'SYNCHK-1001', paidOn: t } });
        });
      }
    });
    fx.auths.forEach(a => {
      stmts.push(env.DB.prepare(`INSERT INTO crm_rcm_auths (id, account_id, practice_id, payer_id, patient_ref, code, units, status, auth_no, due_on, requested_on, valid_from, valid_to, synthetic, created_by, created_at, updated_at)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, ?, ?, ?)`)
        .bind(id('ra'), c.accountId, pid, payerIds[a.payer], a.ref, a.code, a.units, a.status, a.status === 'approved' ? 'SYN-AUTH-77' : '', 'dueIn' in a && a.dueIn != null ? addDays(t, a.dueIn) : null,
          a.status === 'needed' ? null : t, ('validFrom' in a ? a.validFrom : null) ?? null, ('validTo' in a ? a.validTo : null) ?? null, c.user.email, at, at));
    });
    stmts.push(event(env, c, null, 'synthetic_seeded', { claims: fx.claims.length }));
    await env.DB.batch(stmts);
    /* The paid and denied ones arrive the way real ones do: as one posted remittance. */
    const rows = posts.map(p => p.row);
    const csv = ['claim_no,payer_claim_no,service_date,code,billed,allowed,paid,patient_resp,adj_group,carc,rarc,check_no,paid_date',
      ...rows.map(r => [r.claimNo, r.payerClaimNo, r.serviceDate, r.code, (r.billedCents / 100).toFixed(2), (r.allowedCents / 100).toFixed(2), (r.paidCents / 100).toFixed(2), (r.patientRespCents / 100).toFixed(2), r.adjGroup, r.carc, r.rarc, r.checkNo, r.paidOn].join(','))].join('\n');
    await importRemit(env, c, csv, 'synthetic-remittance-1.csv');
    return json({ success: true, claimNos });
  }

  if (action === 'synthetic_remit') {
    const { results } = await env.DB.prepare('SELECT claim_no, patient_ref FROM crm_rcm_claims WHERE account_id = ? AND synthetic = 1').bind(c.accountId).all<{ claim_no: string; patient_ref: string }>();
    if (!results.length) return fail('There is no synthetic test data in this workspace.', 200);
    return json({ success: true, csv: syntheticRemitCsv(Object.fromEntries(results.map(r => [r.patient_ref, r.claim_no])), today()), fileName: 'synthetic-remittance-2.csv' });
  }

  if (action === 'synthetic_purge') {
    if (mode !== 'synthetic') return fail('This workspace holds live data; nothing is removed in bulk.', 200);
    const claimIds = (await env.DB.prepare('SELECT id FROM crm_rcm_claims WHERE account_id = ? AND synthetic = 1').bind(c.accountId).all<{ id: string }>()).results.map(r => r.id);
    const stmts: D1PreparedStatement[] = [];
    for (let i = 0; i < claimIds.length; i += 90) {
      const part = claimIds.slice(i, i + 90), q = part.map(() => '?').join(',');
      for (const t of ['crm_rcm_lines', 'crm_rcm_denials', 'crm_rcm_appeals', 'crm_rcm_notes', 'crm_rcm_remit_rows']) {
        stmts.push(env.DB.prepare(`DELETE FROM ${t} WHERE account_id = ? AND claim_id IN (${q})`).bind(c.accountId, ...part));
      }
    }
    for (const t of ['crm_rcm_claims', 'crm_rcm_auths', 'crm_rcm_payers', 'crm_rcm_providers', 'crm_rcm_practices', 'crm_rcm_remits']) {
      stmts.push(env.DB.prepare(`DELETE FROM ${t} WHERE account_id = ? AND synthetic = 1`).bind(c.accountId));
    }
    stmts.push(env.DB.prepare(`DELETE FROM crm_rcm_remit_rows WHERE account_id = ? AND remit_id NOT IN (SELECT id FROM crm_rcm_remits WHERE account_id = ?)`).bind(c.accountId, c.accountId));
    stmts.push(event(env, c, null, 'synthetic_removed', { claims: claimIds.length }));
    await env.DB.batch(stmts);
    return json({ success: true, removed: claimIds.length });
  }

  /* ── Set-up: practices, providers, payers ── */

  if (action === 'practice_save') {
    const v = (d.practice ?? {}) as Record<string, unknown>;
    const name = clip(v.name, 160);
    if (name.length < 2) return fail('Give the practice’s name.', 200, { field: 'practice.name' });
    const npi = clip(v.npi, 10);
    if (npi && !validNpi(npi)) return fail('That is not a valid NPI — ten digits, and the check digit must match.', 200, { field: 'practice.npi' });
    const pid = v.id ? String(v.id) : id('rp');
    if (v.id && !(await owned(env, c, 'crm_rcm_practices', v.id))) return fail('That practice is not in this workspace.', 404);
    await env.DB.batch([
      v.id
        ? env.DB.prepare('UPDATE crm_rcm_practices SET name = ?, npi = ?, specialty = ? WHERE id = ? AND account_id = ?').bind(name, npi, clip(v.specialty, 80), pid, c.accountId)
        : env.DB.prepare('INSERT INTO crm_rcm_practices (id, account_id, name, npi, specialty, synthetic, created_by, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)').bind(pid, c.accountId, name, npi, clip(v.specialty, 80), synthetic, c.user.email, nowIso()),
      env.DB.prepare(`INSERT INTO crm_rcm_settings (account_id, data_mode, updated_at) VALUES (?, 'synthetic', ?) ON CONFLICT(account_id) DO NOTHING`).bind(c.accountId, nowIso()),
      event(env, c, null, v.id ? 'practice_changed' : 'practice_added', { practice: pid }),
    ]);
    return json({ success: true, id: pid });
  }

  if (action === 'provider_save') {
    const v = (d.provider ?? {}) as Record<string, unknown>;
    if (!(await owned(env, c, 'crm_rcm_practices', v.practiceId))) return fail('Choose the practice.', 200, { field: 'provider.practice' });
    const name = clip(v.name, 160);
    if (name.length < 2) return fail('Give the provider’s name.', 200, { field: 'provider.name' });
    const npi = clip(v.npi, 10);
    if (!validNpi(npi)) return fail('Give the provider’s individual NPI — ten digits, and the check digit must match.', 200, { field: 'provider.npi' });
    if (v.id && !(await owned(env, c, 'crm_rcm_providers', v.id))) return fail('That provider is not in this workspace.', 404);
    const vid = v.id ? String(v.id) : id('rv');
    await env.DB.batch([
      v.id
        ? env.DB.prepare('UPDATE crm_rcm_providers SET practice_id = ?, name = ?, npi = ?, specialty = ?, active = ? WHERE id = ? AND account_id = ?').bind(String(v.practiceId), name, npi, clip(v.specialty, 80), v.active === false ? 0 : 1, vid, c.accountId)
        : env.DB.prepare('INSERT INTO crm_rcm_providers (id, account_id, practice_id, name, npi, specialty, synthetic, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)').bind(vid, c.accountId, String(v.practiceId), name, npi, clip(v.specialty, 80), synthetic, nowIso()),
      event(env, c, null, v.id ? 'provider_changed' : 'provider_added', { provider: vid }),
    ]);
    return json({ success: true, id: vid });
  }

  if (action === 'payer_save') {
    const v = (d.payer ?? {}) as Record<string, unknown>;
    const name = clip(v.name, 160);
    if (name.length < 2) return fail('Give the payer’s name.', 200, { field: 'payer.name' });
    if (!Object.hasOwn(PAYER_KINDS, String(v.kind))) return fail('Choose what kind of payer this is.', 200, { field: 'payer.kind' });
    const filing = v.timelyFilingDays === '' || v.timelyFilingDays == null ? null : Number(v.timelyFilingDays);
    if (filing != null && (!Number.isInteger(filing) || filing < 30 || filing > 730)) return fail('A filing limit is between 30 and 730 days.', 200, { field: 'payer.timelyFilingDays' });
    const fees: Record<string, number> = {};
    for (const [code, amount] of Object.entries((v.fees ?? {}) as Record<string, unknown>).slice(0, 500)) {
      const k = clip(code, 6).toUpperCase();
      if (!validProcCode(k)) return fail(`“${k}” in the fee schedule is not a CPT or HCPCS code.`, 200, { field: 'payer.fees' });
      const cents = centsFrom(amount);
      if (cents == null) return fail(`The fee for ${k} is not an amount.`, 200, { field: 'payer.fees' });
      fees[k] = cents;
    }
    if (v.id && !(await owned(env, c, 'crm_rcm_payers', v.id))) return fail('That payer is not in this workspace.', 404);
    const yid = v.id ? String(v.id) : id('ry');
    await env.DB.batch([
      v.id
        ? env.DB.prepare('UPDATE crm_rcm_payers SET name = ?, payer_code = ?, kind = ?, timely_filing_days = ?, fee_schedule = ?, updated_at = ? WHERE id = ? AND account_id = ?')
          .bind(name, clip(v.code, 20), String(v.kind) as PayerKind, filing, JSON.stringify(fees), nowIso(), yid, c.accountId)
        : env.DB.prepare('INSERT INTO crm_rcm_payers (id, account_id, name, payer_code, kind, timely_filing_days, fee_schedule, synthetic, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)')
          .bind(yid, c.accountId, name, clip(v.code, 20), String(v.kind), filing, JSON.stringify(fees), synthetic, nowIso(), nowIso()),
      event(env, c, null, v.id ? 'payer_changed' : 'payer_added', { payer: yid }),
    ]);
    return json({ success: true, id: yid });
  }

  /* ── Claims ── */

  if (action === 'claim_create' || action === 'claim_update') {
    const v = await cleanClaim(env, c, (d.claim ?? {}) as Record<string, unknown>);
    if (v instanceof Response) return v;
    if (action === 'claim_update') {
      const claim = await loadClaim(env, c, d.id);
      if (!claim) return fail('That claim is not in this workspace.', 404);
      if (claim.work_status !== 'draft') return fail('Only a draft can be edited. Return it from coding review, or wait for a rejection.', 200, { code: 'not_draft' });
      await env.DB.batch([
        env.DB.prepare(`UPDATE crm_rcm_claims SET practice_id = ?, provider_id = ?, payer_id = ?, patient_ref = ?, service_from = ?, service_to = ?, diagnoses = ?, updated_at = ? WHERE id = ? AND account_id = ?`)
          .bind(v.practiceId, v.providerId, v.payerId, v.patientRef, v.serviceFrom, v.serviceTo, JSON.stringify(v.diagnoses), nowIso(), claim.id, c.accountId),
        env.DB.prepare('DELETE FROM crm_rcm_lines WHERE claim_id = ? AND account_id = ?').bind(claim.id, c.accountId),
        ...lineInserts(env, c, claim.id, v.lines),
        totalsStmt(env, claim.id, c.accountId),
        event(env, c, claim.id, 'edited', { lines: v.lines.length }),
      ]);
      return json({ success: true, id: claim.id });
    }
    const idem = clip(d.idem, 80) || null;
    if (idem) {
      const had = await env.DB.prepare('SELECT id, claim_no FROM crm_rcm_claims WHERE account_id = ? AND idem_key = ?').bind(c.accountId, idem).first<{ id: string; claim_no: string }>();
      if (had) return json({ success: true, id: had.id, claimNo: had.claim_no, repeated: true });
    }
    for (let attempt = 0; attempt < 3; attempt++) {
      const cid = id('rc'), no = await nextClaimNo(env, c.accountId), at = nowIso();
      try {
        await env.DB.batch([
          env.DB.prepare(`INSERT INTO crm_rcm_claims (id, account_id, claim_no, practice_id, provider_id, payer_id, patient_ref, synthetic, service_from, service_to, diagnoses, work_status, idem_key, created_by, created_at, updated_at)
              VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'draft', ?, ?, ?, ?)`)
            .bind(cid, c.accountId, no, v.practiceId, v.providerId, v.payerId, v.patientRef, synthetic, v.serviceFrom, v.serviceTo, JSON.stringify(v.diagnoses), idem, c.user.email, at, at),
          ...lineInserts(env, c, cid, v.lines),
          totalsStmt(env, cid, c.accountId),
          event(env, c, cid, 'created', { claimNo: no, lines: v.lines.length }),
        ]);
        return json({ success: true, id: cid, claimNo: no });
      } catch (e) {
        if (idem) {
          const had = await env.DB.prepare('SELECT id, claim_no FROM crm_rcm_claims WHERE account_id = ? AND idem_key = ?').bind(c.accountId, idem).first<{ id: string; claim_no: string }>();
          if (had) return json({ success: true, id: had.id, claimNo: had.claim_no, repeated: true });
        }
        if (!/UNIQUE/i.test(String(e))) throw e;
      }
    }
    return fail('Two claims were numbered at the same moment. Try again.', 409);
  }

  if (action === 'claim_review' || action === 'coding_approve' || action === 'coding_return') {
    const claim = await loadClaim(env, c, d.id);
    if (!claim) return fail('That claim is not in this workspace.', 404);
    const lines = await linesOf(env, c, claim.id);
    const checks = await checksFor(env, c, claim, lines);
    const errors = blocking(checks);
    if (action === 'claim_review') {
      if (claim.work_status !== 'draft') return fail('Only a draft goes to coding review.', 200);
      const to: WorkStatus = c.settings.coding_review ? 'coding_review' : 'ready';
      if (to === 'ready' && errors.length) return json({ success: false, error: errors[0].says, checks });
      await env.DB.batch([
        env.DB.prepare("UPDATE crm_rcm_claims SET work_status = ?, updated_at = ? WHERE id = ? AND account_id = ? AND work_status = 'draft'").bind(to, nowIso(), claim.id, c.accountId),
        event(env, c, claim.id, to === 'ready' ? 'ready' : 'to_coding_review', { errors: errors.length, warnings: checks.length - errors.length }),
      ]);
      return json({ success: true, to, checks });
    }
    if (claim.work_status !== 'coding_review') return fail('That claim is not waiting for coding review.', 200);
    if (action === 'coding_approve') {
      if (errors.length) return json({ success: false, error: `Coding review cannot pass with ${errors.length} error${errors.length === 1 ? '' : 's'}: ${errors[0].says}`, checks });
      const warnings = checks.filter(x => x.level === 'warning');
      if (warnings.length && !d.acceptWarnings) return json({ success: false, error: 'Read the warnings, then approve with them accepted.', checks, code: 'warnings' });
      await env.DB.batch([
        env.DB.prepare("UPDATE crm_rcm_claims SET work_status = 'ready', updated_at = ? WHERE id = ? AND account_id = ? AND work_status = 'coding_review'").bind(nowIso(), claim.id, c.accountId),
        event(env, c, claim.id, 'coding_approved', { warningsAccepted: warnings.map(w => w.key) }),
      ]);
      return json({ success: true });
    }
    const why = clip(d.reason, 1000);
    if (why.length < 3) return fail('Say what the coder should change.', 200, { field: 'coding.reason' });
    await env.DB.batch([
      env.DB.prepare("UPDATE crm_rcm_claims SET work_status = 'draft', updated_at = ? WHERE id = ? AND account_id = ? AND work_status = 'coding_review'").bind(nowIso(), claim.id, c.accountId),
      env.DB.prepare("INSERT INTO crm_rcm_notes (id, account_id, claim_id, visibility, kind, body, by_email, by_role, at) VALUES (?, ?, ?, 'internal', 'note', ?, ?, ?, ?)")
        .bind(id('rn'), c.accountId, claim.id, `Returned from coding review: ${why}`, c.user.email, c.role, nowIso()),
      event(env, c, claim.id, 'coding_returned', {}),
    ]);
    return json({ success: true });
  }

  if (action === 'ch_record') {
    const claim = await loadClaim(env, c, d.id);
    if (!claim) return fail('That claim is not in this workspace.', 404);
    const to = String(d.to ?? '') as ChStatus;
    const problem = chMoveProblem(claim.ch_status, to, claim.work_status, !!d.corrected);
    if (problem) return fail(problem, 200, { field: 'ch.to' });
    const reason = clip(d.reason, 300);
    if (to === 'rejected' && reason.length < 3) return fail('Give the clearinghouse’s rejection reason, as it said it.', 200, { field: 'ch.reason' });
    const at = nowIso();
    const work: WorkStatus = to === 'submitted' ? 'submitted' : to === 'rejected' ? 'draft' : claim.work_status;
    await env.DB.batch([
      env.DB.prepare(`UPDATE crm_rcm_claims SET ch_status = ?, ch_reason = ?, ch_at = ?, work_status = ?, first_submitted_at = COALESCE(first_submitted_at, CASE WHEN ? = 'submitted' THEN ? END),
          payer_claim_no = CASE WHEN ? != '' THEN ? ELSE payer_claim_no END, updated_at = ? WHERE id = ? AND account_id = ? AND ch_status = ?`)
        .bind(to, to === 'rejected' ? reason : '', at, work, to, at, clip(d.payerClaimNo, 40), clip(d.payerClaimNo, 40), at, claim.id, c.accountId, claim.ch_status),
      event(env, c, claim.id, `ch_${to}`, { from: claim.ch_status, reason: to === 'rejected' ? reason : undefined, corrected: !!d.corrected }),
    ]);
    return json({ success: true });
  }

  if (action === 'payer_record') {
    const claim = await loadClaim(env, c, d.id);
    if (!claim) return fail('That claim is not in this workspace.', 404);
    const to = String(d.to ?? '') as PayerStatus;
    if (!Object.hasOwn(PAYER_STATUSES, to)) return fail('Choose what the payer said.', 200, { field: 'payer.to' });
    const problem = payerMoveProblem(claim.payer_status, to, claim.ch_status);
    if (problem) return fail(problem, 200, { field: 'payer.to' });
    const reason = clip(d.reason, 300);
    if (to === 'closed' && reason.length < 3) return fail('Say why the claim is closed — paid in full, written off, or withdrawn.', 200, { field: 'payer.reason' });
    await env.DB.batch([
      env.DB.prepare(`UPDATE crm_rcm_claims SET payer_status = ?, payer_at = ?, payer_claim_no = CASE WHEN ? != '' THEN ? ELSE payer_claim_no END,
          work_status = CASE WHEN ? = 'closed' THEN 'closed' ELSE work_status END, closed_reason = CASE WHEN ? = 'closed' THEN ? ELSE closed_reason END, updated_at = ?
          WHERE id = ? AND account_id = ? AND payer_status = ?`)
        .bind(to, nowIso(), clip(d.payerClaimNo, 40), clip(d.payerClaimNo, 40), to, to, reason, nowIso(), claim.id, c.accountId, claim.payer_status),
      event(env, c, claim.id, `payer_${to}`, { from: claim.payer_status, reason: reason || undefined }),
    ]);
    return json({ success: true });
  }

  /* ── Denials and appeals ── */

  if (action === 'denial_add') {
    const claim = await loadClaim(env, c, d.claimId);
    if (!claim) return fail('That claim is not in this workspace.', 404);
    const lineId = d.lineId ? String(d.lineId) : null;
    if (lineId && !(await env.DB.prepare('SELECT id FROM crm_rcm_lines WHERE id = ? AND claim_id = ? AND account_id = ?').bind(lineId, claim.id, c.accountId).first())) return fail('That line is not on this claim.', 404);
    const carc = clip(d.carc, 6).toUpperCase();
    if (!/^[A-Z]?\d{1,3}$/.test(carc)) return fail('Give the reason code (CARC) from the payer, like 50 or 197.', 200, { field: 'denial.carc' });
    const deniedOn = validDate(d.deniedOn) ?? today();
    const amount = centsFrom(d.amount);
    if (amount == null || amount <= 0) return fail('Enter the amount denied.', 200, { field: 'denial.amount' });
    const did = id('rd');
    await env.DB.batch([
      env.DB.prepare(`INSERT INTO crm_rcm_denials (id, account_id, claim_id, line_id, group_code, carc, rarc, category, amount_cents, denied_on, appeal_by, status, source, created_by, created_at)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'open', 'manual', ?, ?)`)
        .bind(did, c.accountId, claim.id, lineId, clip(d.group, 2).toUpperCase() || 'CO', carc, clip(d.rarc, 8).toUpperCase(), carcCategory(carc), amount, deniedOn, addDays(deniedOn, c.settings.appeal_days), c.user.email, nowIso()),
      event(env, c, claim.id, 'denial_recorded', { denial: did, carc }),
    ]);
    return json({ success: true, id: did });
  }

  if (action === 'denial_set') {
    const den = await env.DB.prepare('SELECT * FROM crm_rcm_denials WHERE id = ? AND account_id = ?').bind(String(d.id ?? ''), c.accountId).first<DenialRow>();
    if (!den) return fail('That denial is not in this workspace.', 404);
    const to = String(d.to ?? '');
    if (!['corrected', 'written_off', 'open'].includes(to)) return fail('A denial is corrected, written off, or reopened here; appeals decide the rest.', 200, { field: 'denial.to' });
    if (to === 'open' && !['corrected', 'written_off'].includes(den.status)) return fail('Only a corrected or written-off denial can be reopened.', 200);
    if (to !== 'open' && !['open', 'appealing'].includes(den.status)) return fail('That denial is already resolved.', 200);
    const why = clip(d.reason, 300);
    if (to === 'written_off' && why.length < 3) return fail('Say why it is written off.', 200, { field: 'denial.reason' });
    await env.DB.batch([
      env.DB.prepare('UPDATE crm_rcm_denials SET status = ?, resolved_by = ?, resolved_at = ? WHERE id = ? AND account_id = ?').bind(to, to === 'open' ? null : c.user.email, to === 'open' ? null : nowIso(), den.id, c.accountId),
      event(env, c, den.claim_id, `denial_${to}`, { denial: den.id, reason: why || undefined }),
    ]);
    return json({ success: true });
  }

  if (action === 'appeal_create') {
    const den = await env.DB.prepare('SELECT * FROM crm_rcm_denials WHERE id = ? AND account_id = ?').bind(String(d.denialId ?? ''), c.accountId).first<DenialRow>();
    if (!den) return fail('That denial is not in this workspace.', 404);
    if (!['open', 'appealing'].includes(den.status)) return fail('That denial is resolved; there is nothing to appeal.', 200);
    const prior = await env.DB.prepare("SELECT MAX(level) AS lvl, SUM(status IN ('drafting','submitted')) AS live FROM crm_rcm_appeals WHERE denial_id = ? AND account_id = ?").bind(den.id, c.accountId).first<{ lvl: number | null; live: number | null }>();
    if (prior?.live) return fail('An appeal on this denial is already under way.', 200);
    const summary = clip(d.summary, 2000);
    if (summary.length < 10) return fail('Say what the appeal argues and what it encloses.', 200, { field: 'appeal.summary' });
    const aid = id('rx');
    await env.DB.batch([
      env.DB.prepare("INSERT INTO crm_rcm_appeals (id, account_id, denial_id, claim_id, level, status, due_on, summary, created_by, created_at) VALUES (?, ?, ?, ?, ?, 'drafting', ?, ?, ?, ?)")
        .bind(aid, c.accountId, den.id, den.claim_id, (prior?.lvl ?? 0) + 1, den.appeal_by, summary, c.user.email, nowIso()),
      event(env, c, den.claim_id, 'appeal_drafted', { appeal: aid, level: (prior?.lvl ?? 0) + 1 }),
    ]);
    return json({ success: true, id: aid });
  }

  if (action === 'appeal_set') {
    const ap = await env.DB.prepare('SELECT * FROM crm_rcm_appeals WHERE id = ? AND account_id = ?').bind(String(d.id ?? ''), c.accountId).first<{ id: string; denial_id: string; claim_id: string; status: AppealStatus }>();
    if (!ap) return fail('That appeal is not in this workspace.', 404);
    const to = String(d.to ?? '') as AppealStatus;
    if (!Object.hasOwn(APPEAL_STATUSES, to)) return fail('Choose the appeal’s outcome.', 200, { field: 'appeal.to' });
    const allowed: Record<AppealStatus, AppealStatus[]> = { drafting: ['submitted', 'withdrawn'], submitted: ['won', 'partial', 'lost', 'withdrawn'], won: [], partial: [], lost: [], withdrawn: [] };
    if (!allowed[ap.status].includes(to)) return fail(`An appeal that is “${APPEAL_STATUSES[ap.status]}” cannot become “${APPEAL_STATUSES[to]}”.`, 200, { field: 'appeal.to' });
    const recovered = to === 'won' || to === 'partial' ? centsFrom(d.recovered) : 0;
    if (recovered == null) return fail('Enter what the payer agreed to pay, or 0.', 200, { field: 'appeal.recovered' });
    const submittedOn = to === 'submitted' ? (validDate(d.submittedOn) ?? today()) : null;
    const denialTo = to === 'submitted' ? 'appealing' : to === 'won' || to === 'partial' ? 'won' : to === 'lost' ? 'lost' : 'open';
    const claim = (await loadClaim(env, c, ap.claim_id))!;
    const payerTo: PayerStatus | null = to === 'submitted' && ['denied', 'partial'].includes(claim.payer_status) ? 'appealed'
      : (to === 'won' || to === 'partial') && claim.payer_status === 'appealed' ? 'in_process'
      : to === 'lost' && claim.payer_status === 'appealed' ? 'denied' : null;
    await env.DB.batch([
      env.DB.prepare('UPDATE crm_rcm_appeals SET status = ?, submitted_on = COALESCE(?, submitted_on), recovered_cents = ?, decided_at = CASE WHEN ? IN (\'won\',\'partial\',\'lost\',\'withdrawn\') THEN ? END WHERE id = ? AND account_id = ?')
        .bind(to, submittedOn, recovered, to, nowIso(), ap.id, c.accountId),
      env.DB.prepare('UPDATE crm_rcm_denials SET status = ?, resolved_by = CASE WHEN ? IN (\'won\',\'lost\') THEN ? END, resolved_at = CASE WHEN ? IN (\'won\',\'lost\') THEN ? END WHERE id = ? AND account_id = ?')
        .bind(denialTo, denialTo, c.user.email, denialTo, nowIso(), ap.denial_id, c.accountId),
      ...(payerTo ? [env.DB.prepare('UPDATE crm_rcm_claims SET payer_status = ?, payer_at = ?, updated_at = ? WHERE id = ? AND account_id = ?').bind(payerTo, nowIso(), nowIso(), claim.id, c.accountId)] : []),
      event(env, c, ap.claim_id, `appeal_${to}`, { appeal: ap.id, recoveredCents: recovered || undefined }),
    ]);
    return json({ success: true });
  }

  /* ── Remittances ── */

  if (action === 'remit_preview' || action === 'remit_import') {
    const csv = String(d.csv ?? '');
    if (!csv.trim()) return fail('Choose the remittance file (CSV).', 200, { field: 'remit.file' });
    if (csv.length > REMIT_MAX_BYTES) return fail('That file is over 2 MB. Split it by check or by week.', 200, { field: 'remit.file' });
    if (action === 'remit_preview') {
      const parsed = parseRemitCsv(csv);
      const plan = await planRemit(env, c, parsed.rows);
      return json({ success: true, problems: parsed.problems, totalPaidCents: parsed.totalPaidCents, checks: parsed.checks, postedCents: plan.postedCents,
        rows: plan.rows.map(r => ({ rowNo: r.rowNo, claimNo: r.claimNo || r.payerClaimNo, code: r.code, paidCents: r.paidCents, allowedCents: r.allowedCents, carc: r.carc, outcome: r.outcome, why: r.why })) });
    }
    const r = await importRemit(env, c, csv, clip(d.fileName, 120) || 'remittance.csv');
    return r instanceof Response ? r : json({ success: true, ...r });
  }

  if (action === 'remit_deposit') {
    const r = await env.DB.prepare('SELECT id FROM crm_rcm_remits WHERE id = ? AND account_id = ?').bind(String(d.id ?? ''), c.accountId).first<{ id: string }>();
    if (!r) return fail('That remittance is not in this workspace.', 404);
    const cents = signedCents(d.deposit);
    if (cents == null || String(d.deposit ?? '').trim() === '') return fail('Enter the amount that reached the bank, like 1,250.00.', 200, { field: 'remit.deposit' });
    await env.DB.batch([
      env.DB.prepare('UPDATE crm_rcm_remits SET deposit_cents = ? WHERE id = ? AND account_id = ?').bind(cents, r.id, c.accountId),
      event(env, c, null, 'deposit_recorded', { remit: r.id, cents }),
    ]);
    await refreshRemit(env, c, r.id);
    return json({ success: true });
  }

  if (action === 'remit_row_match' || action === 'remit_row_set_aside') {
    const row = await env.DB.prepare('SELECT * FROM crm_rcm_remit_rows WHERE id = ? AND account_id = ?').bind(String(d.rowId ?? ''), c.accountId).first<RemitRowDb>();
    if (!row) return fail('That remittance row is not in this workspace.', 404);
    if (row.outcome !== 'unmatched') return fail('Only an unmatched row can be matched or set aside.', 200);
    if (action === 'remit_row_set_aside') {
      const why = clip(d.reason, 300);
      if (why.length < 3) return fail('Say why this row is set aside — for example, another practice’s patient.', 200, { field: 'remit.reason' });
      await env.DB.batch([
        env.DB.prepare("UPDATE crm_rcm_remit_rows SET outcome = 'set_aside', set_aside_reason = ? WHERE id = ? AND account_id = ? AND outcome = 'unmatched'").bind(why, row.id, c.accountId),
        event(env, c, null, 'remit_row_set_aside', { row: row.id, reason: why }),
      ]);
      await refreshRemit(env, c, row.remit_id);
      return json({ success: true });
    }
    const claim = await env.DB.prepare('SELECT * FROM crm_rcm_claims WHERE claim_no = ? AND account_id = ?').bind(clip(d.claimNo, 40), c.accountId).first<ClaimRow>();
    if (!claim) return fail('No claim in this workspace has that number.', 200, { field: 'remit.claimNo' });
    const asRow: RemitRow = { rowNo: row.row_no, claimNo: claim.claim_no, payerClaimNo: row.payer_claim_no, serviceDate: row.service_date, code: row.code, billedCents: row.billed_cents,
      allowedCents: row.allowed_cents, paidCents: row.paid_cents, patientRespCents: row.patient_resp_cents, adjGroup: row.adj_group, carc: row.carc, rarc: row.rarc, checkNo: row.check_no, paidOn: row.paid_on };
    const line = matchLine(asRow, (await linesOf(env, c, claim.id)).map(lineFacts), new Set());
    if (!line) return fail(`Claim ${claim.claim_no} has no ${row.code} line.`, 200, { field: 'remit.claimNo' });
    if (await env.DB.prepare("SELECT id FROM crm_rcm_remit_rows WHERE account_id = ? AND row_key = ? AND outcome = 'posted'").bind(c.accountId, row.row_key).first()) {
      return fail('That payment is already posted from another file.', 200, { field: 'remit.claimNo' });
    }
    await env.DB.batch([
      env.DB.prepare("UPDATE crm_rcm_remit_rows SET outcome = 'posted', claim_id = ?, line_id = ? WHERE id = ? AND account_id = ? AND outcome = 'unmatched'").bind(claim.id, line.id, row.id, c.accountId),
      ...(await postRowStmts(env, c, asRow, row.id, claim.id, line.id)),
    ]);
    await refreshRemit(env, c, row.remit_id);
    return json({ success: true });
  }

  /* ── Prior authorizations ── */

  if (action === 'auth_create') {
    const v = (d.auth ?? {}) as Record<string, unknown>;
    if (!(await owned(env, c, 'crm_rcm_practices', v.practiceId))) return fail('Choose the practice.', 200, { field: 'auth.practice' });
    if (!(await owned(env, c, 'crm_rcm_payers', v.payerId))) return fail('Choose the payer.', 200, { field: 'auth.payer' });
    const ref = clip(v.patientRef, 40);
    const pr = patientRefProblem(ref, mode);
    if (pr) return fail(pr, 200, { field: 'auth.patientRef' });
    const code = clip(v.code, 6).toUpperCase();
    if (!validProcCode(code)) return fail('Give the CPT or HCPCS code the authorization is for.', 200, { field: 'auth.code' });
    const units = Number(v.units ?? 1);
    if (!Number.isInteger(units) || units < 1 || units > 999) return fail('Units must be a whole number from 1.', 200, { field: 'auth.units' });
    const due = v.dueOn ? validDate(v.dueOn) : null;
    if (v.dueOn && !due) return fail('Give the date the authorization is needed by.', 200, { field: 'auth.dueOn' });
    const aid = id('ra'), at = nowIso();
    await env.DB.batch([
      env.DB.prepare(`INSERT INTO crm_rcm_auths (id, account_id, practice_id, payer_id, patient_ref, code, units, status, due_on, synthetic, created_by, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, 'needed', ?, ?, ?, ?, ?)`)
        .bind(aid, c.accountId, String(v.practiceId), String(v.payerId), ref, code, units, due, synthetic, c.user.email, at, at),
      event(env, c, null, 'auth_added', { auth: aid, code }),
    ]);
    return json({ success: true, id: aid });
  }

  if (action === 'auth_set') {
    const a = await env.DB.prepare('SELECT * FROM crm_rcm_auths WHERE id = ? AND account_id = ?').bind(String(d.id ?? ''), c.accountId).first<{ id: string; status: AuthStatus }>();
    if (!a) return fail('That authorization is not in this workspace.', 404);
    const to = String(d.to ?? '') as AuthStatus;
    if (!Object.hasOwn(AUTH_STATUSES, to)) return fail('Choose the authorization’s new status.', 200, { field: 'auth.to' });
    const problem = authMoveProblem(a.status, to);
    if (problem) return fail(problem, 200, { field: 'auth.to' });
    let authNo = '', from: string | null = null, until: string | null = null;
    if (to === 'approved') {
      authNo = clip(d.authNo, 40);
      if (authNo.length < 2) return fail('Give the authorization number the payer issued.', 200, { field: 'auth.authNo' });
      from = validDate(d.validFrom); until = validDate(d.validTo);
      if (!from || !until || until < from) return fail('Give the dates the authorization is valid from and to.', 200, { field: 'auth.validTo' });
    }
    await env.DB.batch([
      env.DB.prepare(`UPDATE crm_rcm_auths SET status = ?, auth_no = CASE WHEN ? != '' THEN ? ELSE auth_no END, valid_from = COALESCE(?, valid_from), valid_to = COALESCE(?, valid_to),
          requested_on = CASE WHEN ? = 'submitted' THEN ? ELSE requested_on END, decided_on = CASE WHEN ? IN ('approved','denied') THEN ? ELSE decided_on END, updated_at = ? WHERE id = ? AND account_id = ? AND status = ?`)
        .bind(to, authNo, authNo, from, until, to, today(), to, today(), nowIso(), a.id, c.accountId, a.status),
      event(env, c, null, `auth_${to}`, { auth: a.id }),
    ]);
    return json({ success: true });
  }

  return fail(`Unknown action: ${action}`, 400);
}

/** Post a remittance file: every row recorded with what became of it, in one batch. */
async function importRemit(env: Env, c: Ctx, csv: string, fileName: string): Promise<Response | { id: string; posted: number; unmatched: number; duplicate: number; problems: { rowNo: number; says: string }[] }> {
  const parsed = parseRemitCsv(csv);
  if (!parsed.rows.length) return fail(parsed.problems[0]?.says ?? 'The file has no rows that could be read.', 200, { field: 'remit.file', problems: parsed.problems });
  const hash = await sha256Hex(csv.replace(/\r\n/g, '\n').trim());
  const dup = await env.DB.prepare('SELECT id, imported_at FROM crm_rcm_remits WHERE account_id = ? AND file_hash = ?').bind(c.accountId, hash).first<{ id: string; imported_at: string }>();
  if (dup) return fail(`This file was already imported on ${dup.imported_at.slice(0, 10)}. Nothing was posted twice.`, 200, { field: 'remit.file', code: 'duplicate_file', remitId: dup.id });
  const plan = await planRemit(env, c, parsed.rows);
  const remitId = id('rr');
  const stmts: D1PreparedStatement[] = [
    env.DB.prepare(`INSERT INTO crm_rcm_remits (id, account_id, file_name, file_hash, checks, file_paid_cents, rows_total, status, synthetic, imported_by, imported_at) VALUES (?, ?, ?, ?, ?, ?, ?, 'unreconciled', ?, ?, ?)`)
      .bind(remitId, c.accountId, fileName, hash, JSON.stringify(parsed.checks), parsed.totalPaidCents, parsed.rows.length, c.settings.data_mode === 'synthetic' ? 1 : 0, c.user.email, nowIso()),
  ];
  const insertRow = (r: Plan['rows'][number], rid: string, outcome: string) => env.DB.prepare(`INSERT INTO crm_rcm_remit_rows (id, account_id, remit_id, row_no, row_key, claim_no, payer_claim_no, service_date, code, billed_cents, allowed_cents, paid_cents, patient_resp_cents,
      adj_group, carc, rarc, check_no, paid_on, outcome, claim_id, line_id) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`)
    .bind(rid, c.accountId, remitId, r.rowNo, r.key, r.claimNo, r.payerClaimNo, r.serviceDate, r.code, r.billedCents, r.allowedCents, r.paidCents, r.patientRespCents,
      r.adjGroup, r.carc, r.rarc, r.checkNo, r.paidOn, outcome, outcome === 'posted' ? r.claimId : null, outcome === 'posted' ? r.lineId : null);
  for (const r of plan.rows) if (r.outcome !== 'posted') stmts.push(insertRow(r, id('rw'), r.outcome));
  stmts.push(event(env, c, null, 'remit_imported', { remit: remitId, file: fileName, rows: plan.rows.length }));
  await env.DB.batch(stmts);
  /* Each posted row is its own batch — the row and everything it changes, or
     none of it — and reads its claim as the rows before it left it, so a claim
     with two lines in one file ends with both. A row another import posted in
     the meantime fails the unique key and is recorded as the duplicate it is. */
  for (const r of plan.rows) {
    if (r.outcome !== 'posted') continue;
    const rid = id('rw');
    try {
      await env.DB.batch([insertRow(r, rid, 'posted'), ...(await postRowStmts(env, c, r, rid, r.claimId!, r.lineId!))]);
    } catch (e) {
      if (!/UNIQUE/i.test(String(e))) throw e;
      r.outcome = 'duplicate';
      await insertRow(r, rid, 'duplicate').run();
    }
  }
  await refreshRemit(env, c, remitId);
  return { id: remitId, posted: plan.rows.filter(r => r.outcome === 'posted').length, unmatched: plan.rows.filter(r => r.outcome === 'unmatched').length, duplicate: plan.rows.filter(r => r.outcome === 'duplicate').length, problems: parsed.problems };
}
