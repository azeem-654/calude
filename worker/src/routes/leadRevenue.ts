/**
 * /api/lead-revenue.php — the lead-to-revenue ledger and the growth service's
 * performance fee (phase 2). The rules are lib/leadRevenue.ts; this file is
 * who may do what, and the record of it.
 *
 * ── Who is who ──
 *
 * Two parties look at one contractor's ledger, and they are not
 * interchangeable:
 *
 *   - the **contractor** — whoever `workspaceAccess` lets into the workspace.
 *     Only they confirm a job complete with its final amount, confirm a
 *     payment received, approve a call script or an ad budget, and query a
 *     statement line. Those are the facts a fee is taken on.
 *   - the **install owner**, who runs the service and earns the fee. They
 *     record inquiries and calls, correct attribution with a reason, keep the
 *     terms and agreements, and compute, send and approve statements. They can
 *     report a payment but it counts only once the contractor confirms it.
 *
 * The owner is a contractor only in a workspace they own themselves. They
 * reach a customer's workspace by its id without claiming it — calling
 * `workspaceAccess` for them on a customer's legacy workspace would claim it.
 *
 * ── What the ledger never does ──
 *
 * It never charges anybody. A statement is approved and then invoiced outside
 * this ledger; nothing here touches a processor (docs/claude/money.md: this is
 * not one of the three pots). Every change is an append-only event; a signed
 * agreement's terms and a counted payment are also fixed by triggers in
 * migration 0077, so a bug here cannot rewrite them either.
 */
import { body, fail, json } from '../lib/http';
import { RESERVED_AGENCY, nowIso, storageWorkspace, userFromToken, workspaceAccess, type Env, type SessionUser } from '../lib/db';
import { isZone } from '../lib/bookingTime';
import {
  APPROVAL_KINDS, CALL_OUTCOMES, CHANNELS, DEFAULT_TERMS, METHODS, PAYMENT_KINDS, STAGE_INFO,
  buildStatement, callCheck, centsFrom, cleanTerms, isChannel, isConsent, isStage, periodLabel, phoneKey,
  existingCustomerProblem, stageMoveProblem, summarize,
  type AgreementFacts, type ApprovalKind, type LeadFacts, type PaymentFacts, type PaymentKind, type Stage, type Terms, type Verification,
} from '../lib/leadRevenue';

const isOwner = (u: SessionUser): boolean => u.role === 'agency' && !u.accountId;
const clip = (v: unknown, n: number) => String(v ?? '').replace(/\p{Cc}/gu, ' ').trim().slice(0, n);
const parse = <T>(s: string | null | undefined, d: T): T => { try { return s ? JSON.parse(s) as T : d; } catch { return d; } };
const id = (p: string) => `${p}_${crypto.randomUUID().replace(/-/g, '').slice(0, 20)}`;
const DATE_OK = /^\d{4}-\d{2}-\d{2}$/;
const today = () => nowIso().slice(0, 10);
const validDate = (v: unknown): string | null => {
  const s = String(v ?? '');
  return DATE_OK.test(s) && !Number.isNaN(Date.parse(`${s}T00:00:00Z`)) && new Date(`${s}T00:00:00Z`).toISOString().slice(0, 10) === s ? s : null;
};

/* ── Rows ── */

interface LeadRow {
  id: string; account_id: string; name: string; email: string; phone: string; service: string; stage: string;
  channel: string; channel_detail: string; first_touch_at: string; by_service: number; agreement_id: string | null;
  existing_customer: number; consent: string; timezone: string; quote_cents: number | null; final_cents: number | null;
  invoice_ref: string; invoiced_cents: number | null; invoiced_at: string | null; won_at: string | null;
  completed_at: string | null; completed_by: string | null; lost_reason: string; created_by: string; created_at: string; updated_at: string;
}
interface PayRow {
  id: string; account_id: string; lead_id: string; kind: string; amount_cents: number; excluded_cents: number; received_on: string;
  method: string; verification: string; reference: string; disputed: number; void: number; recorded_by: string; recorded_at: string;
  confirmed_by: string | null; confirmed_at: string | null; statement_id: string | null;
}
interface AgreementRow {
  id: string; account_id: string; status: string; terms_id: string | null; currency: string; setup_cents: number; monthly_cents: number;
  performance_bps: number; attribution_days: number; exclusions: string; customer_name: string; signed_by: string; signed_at: string | null;
  starts_on: string | null; ends_on: string | null; created_by: string; created_at: string; updated_at: string;
}
interface StatementRow {
  id: string; account_id: string; agreement_id: string; label: string; period_end: string; status: string; currency: string; bps: number;
  gross_cents: number; excluded_cents: number; refunds_cents: number; carried_cents: number; net_cents: number; fee_cents: number;
  carry_out_cents: number; lines: string; computed_at: string; created_by: string; sent_at: string | null; approved_by: string | null; approved_at: string | null;
}

const leadView = (r: LeadRow) => ({
  id: r.id, name: r.name, email: r.email, phone: r.phone, service: r.service, stage: r.stage as Stage,
  channel: r.channel, channelDetail: r.channel_detail, firstTouchAt: r.first_touch_at, byService: !!r.by_service,
  agreementId: r.agreement_id, existingCustomer: !!r.existing_customer, consent: r.consent, timezone: r.timezone,
  quoteCents: r.quote_cents, finalCents: r.final_cents, invoiceRef: r.invoice_ref, invoicedCents: r.invoiced_cents, invoicedAt: r.invoiced_at,
  wonAt: r.won_at, completedAt: r.completed_at, completedBy: r.completed_by, lostReason: r.lost_reason,
  createdBy: r.created_by, createdAt: r.created_at, updatedAt: r.updated_at,
});
const payView = (r: PayRow) => ({
  id: r.id, leadId: r.lead_id, kind: r.kind as PaymentKind, amountCents: r.amount_cents, excludedCents: r.excluded_cents,
  receivedOn: r.received_on, method: r.method, verification: r.verification as Verification, reference: r.reference,
  disputed: !!r.disputed, void: !!r.void, recordedBy: r.recorded_by, recordedAt: r.recorded_at,
  confirmedBy: r.confirmed_by, confirmedAt: r.confirmed_at, statementId: r.statement_id,
});
const agreementView = (r: AgreementRow) => ({
  id: r.id, accountId: r.account_id, status: r.status, termsId: r.terms_id, currency: r.currency,
  setupCents: r.setup_cents, monthlyCents: r.monthly_cents, performanceBps: r.performance_bps, attributionDays: r.attribution_days,
  exclusions: parse<string[]>(r.exclusions, []), customerName: r.customer_name, signedBy: r.signed_by, signedAt: r.signed_at,
  startsOn: r.starts_on, endsOn: r.ends_on, createdAt: r.created_at,
});
const statementView = (r: StatementRow) => ({
  id: r.id, agreementId: r.agreement_id, label: r.label, periodEnd: r.period_end, status: r.status, currency: r.currency, bps: r.bps,
  grossCents: r.gross_cents, excludedCents: r.excluded_cents, refundsCents: r.refunds_cents, carriedCents: r.carried_cents,
  netCents: r.net_cents, feeCents: r.fee_cents, carryOutCents: r.carry_out_cents, ...parse(r.lines, { lines: [], notCounted: [] }),
  computedAt: r.computed_at, sentAt: r.sent_at, approvedBy: r.approved_by, approvedAt: r.approved_at,
});

const leadFacts = (r: LeadRow): LeadFacts & { quoteCents: number | null; finalCents: number | null; createdAt: string } => ({
  id: r.id, name: r.name, byService: !!r.by_service, existingCustomer: !!r.existing_customer, agreementId: r.agreement_id,
  firstTouchAt: r.first_touch_at, wonAt: r.won_at, completedAt: r.completed_at, quoteCents: r.quote_cents, finalCents: r.final_cents, createdAt: r.created_at,
});
const payFacts = (r: PayRow): PaymentFacts => ({
  id: r.id, leadId: r.lead_id, kind: r.kind as PaymentKind, amountCents: r.amount_cents, excludedCents: r.excluded_cents,
  receivedOn: r.received_on, verification: r.verification as Verification, confirmedAt: r.confirmed_at, disputed: !!r.disputed,
  void: !!r.void, statementId: r.statement_id,
});
const agreementFacts = (r: AgreementRow): AgreementFacts => ({
  id: r.id, performanceBps: r.performance_bps, attributionDays: r.attribution_days, startsOn: r.starts_on ?? '9999-12-31',
  endsOn: r.ends_on, currency: r.currency,
});

/* ── Who is asking ── */

interface Ctx { user: SessionUser; accountId: string; owner: boolean; contractor: boolean; role: 'owner' | 'contractor' }

/** Whether the owner may act on `accountId` as the service: a workspace that exists and somebody owns. */
async function knownWorkspace(env: Env, accountId: string): Promise<{ known: boolean; ownerEmail: string | null }> {
  const w = await env.DB.prepare('SELECT owner_email FROM crm_workspaces WHERE account_id = ?').bind(accountId).first<{ owner_email: string }>();
  if (w) return { known: true, ownerEmail: w.owner_email };
  const u = await env.DB.prepare('SELECT email FROM crm_users WHERE account_id = ? LIMIT 1').bind(accountId).first<{ email: string }>();
  return { known: !!u, ownerEmail: null };
}

async function context(env: Env, user: SessionUser, accountId: string): Promise<Ctx | Response> {
  if (!accountId || !/^[\w.:@-]{1,120}$/.test(accountId)) return fail('Name the workspace.', 400);
  /* An agency's own bucket is one name for everybody, stored per person underneath (storageWorkspace):
     the ledger keys it the same way, or every agency would share one. */
  if (accountId.startsWith('__')) {
    if (accountId !== RESERVED_AGENCY || user.role !== 'agency') return fail('That workspace is not yours.', 403, { code: 'not_yours' });
    return { user, accountId: storageWorkspace(user, accountId), owner: isOwner(user), contractor: true, role: isOwner(user) ? 'owner' : 'contractor' };
  }
  if (isOwner(user)) {
    const k = await knownWorkspace(env, accountId);
    const mine = k.ownerEmail === user.email;
    if (!k.known && !mine) return fail('There is no such workspace.', 404, { code: 'not_found' });
    return { user, accountId, owner: true, contractor: mine, role: 'owner' };
  }
  const a = await workspaceAccess(env.DB, user, accountId);
  if (!a.ok) return fail(a.message ?? 'That workspace is not yours.', 403, { code: a.code ?? 'not_yours' });
  return { user, accountId, owner: false, contractor: true, role: 'contractor' };
}

const notContractor = () => fail('Only the contractor confirms this — the service team cannot do it for you.', 403, { code: 'contractor_only' });
const notOwner = () => fail('Only the install owner can do that.', 403, { code: 'not_owner' });

function event(env: Env, c: Pick<Ctx, 'accountId' | 'user' | 'role'>, leadId: string | null, kind: string, detail: Record<string, unknown>) {
  return env.DB.prepare('INSERT INTO crm_rev_events (account_id, lead_id, kind, detail, by_email, by_role, at) VALUES (?, ?, ?, ?, ?, ?, ?)')
    .bind(c.accountId, leadId, kind, JSON.stringify(detail), c.user.email, c.role, nowIso());
}

async function loadLead(env: Env, c: Ctx, leadId: unknown): Promise<LeadRow | null> {
  return env.DB.prepare('SELECT * FROM crm_rev_leads WHERE id = ? AND account_id = ?').bind(String(leadId ?? ''), c.accountId).first<LeadRow>();
}
async function loadPayment(env: Env, c: Ctx, payId: unknown): Promise<PayRow | null> {
  return env.DB.prepare('SELECT * FROM crm_rev_payments WHERE id = ? AND account_id = ?').bind(String(payId ?? ''), c.accountId).first<PayRow>();
}
async function activeAgreement(env: Env, accountId: string): Promise<AgreementRow | null> {
  return env.DB.prepare("SELECT * FROM crm_growth_agreements WHERE account_id = ? AND status = 'active'").bind(accountId).first<AgreementRow>();
}
/** The terms in force today: the latest effective row, or the public offer if the owner has written none. */
async function currentTerms(env: Env): Promise<{ id: string | null; terms: Terms }> {
  const r = await env.DB.prepare('SELECT * FROM crm_growth_terms WHERE effective_from <= ? ORDER BY effective_from DESC, created_at DESC LIMIT 1').bind(today())
    .first<{ id: string; currency: string; setup_cents: number; monthly_cents: number; performance_bps: number; attribution_days: number; exclusions: string }>();
  if (!r) return { id: null, terms: DEFAULT_TERMS };
  return { id: r.id, terms: { currency: r.currency, setupCents: r.setup_cents, monthlyCents: r.monthly_cents, performanceBps: r.performance_bps, attributionDays: r.attribution_days, exclusions: parse(r.exclusions, []) } };
}

/** The statement for an agreement as it stands now, from the ledger. */
async function computeFor(env: Env, ag: AgreementRow, periodEnd: string) {
  const [leads, pays, last] = await Promise.all([
    env.DB.prepare('SELECT * FROM crm_rev_leads WHERE account_id = ? AND agreement_id = ?').bind(ag.account_id, ag.id).all<LeadRow>(),
    env.DB.prepare('SELECT p.* FROM crm_rev_payments p JOIN crm_rev_leads l ON l.id = p.lead_id WHERE p.account_id = ? AND l.agreement_id = ? AND p.statement_id IS NULL AND p.void = 0')
      .bind(ag.account_id, ag.id).all<PayRow>(),
    env.DB.prepare("SELECT carry_out_cents FROM crm_rev_statements WHERE agreement_id = ? AND status = 'approved' ORDER BY period_end DESC, approved_at DESC LIMIT 1")
      .bind(ag.id).first<{ carry_out_cents: number }>(),
  ]);
  return buildStatement(agreementFacts(ag), leads.results.map(leadFacts), pays.results.map(payFacts), periodEnd, last?.carry_out_cents ?? 0);
}

/* ── The handler ── */

export async function handleLeadRevenue(req: Request, env: Env): Promise<Response> {
  const d = await body<Record<string, unknown>>(req);
  const action = String(d.action ?? '');
  const user = await userFromToken(env.DB, d.token as string | undefined);
  if (!user) return fail('Sign in again.', 401, { code: 'signed_out' });

  /* ── The owner's own screens: terms and customers ── */

  if (action === 'terms_list' || action === 'terms_add' || action === 'customers') {
    if (!isOwner(user)) return notOwner();
    if (action === 'terms_list') {
      const { results } = await env.DB.prepare('SELECT * FROM crm_growth_terms ORDER BY effective_from DESC, created_at DESC').all();
      return json({ success: true, terms: results, current: await currentTerms(env), defaults: DEFAULT_TERMS });
    }
    if (action === 'terms_add') {
      const from = validDate(d.effectiveFrom);
      if (!from) return fail('Give the date these terms apply from.', 200, { field: 'terms.from' });
      if (from < today()) return fail('Terms apply from today or later — an earlier date would reach agreements already drafted.', 200, { field: 'terms.from' });
      const t = cleanTerms((d.terms ?? {}) as Record<string, unknown>);
      if (!t.terms) return fail(t.error!, 200, { field: t.field });
      const tid = id('terms');
      await env.DB.prepare('INSERT INTO crm_growth_terms (id, effective_from, currency, setup_cents, monthly_cents, performance_bps, attribution_days, exclusions, note, created_by, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)')
        .bind(tid, from, t.terms.currency, t.terms.setupCents, t.terms.monthlyCents, t.terms.performanceBps, t.terms.attributionDays, JSON.stringify(t.terms.exclusions), clip(d.note, 300), user.email, nowIso()).run();
      return json({ success: true, id: tid });
    }
    /* customers: every signed-up account, with its agreement and what is waiting on whom. */
    const { results } = await env.DB.prepare(
      `SELECT u.email, u.name, u.account_id AS accountId,
              (SELECT status FROM crm_growth_agreements a WHERE a.account_id = u.account_id ORDER BY CASE status WHEN 'active' THEN 0 WHEN 'draft' THEN 1 ELSE 2 END, updated_at DESC LIMIT 1) AS agreement,
              (SELECT COUNT(*) FROM crm_rev_leads l WHERE l.account_id = u.account_id) AS leads,
              (SELECT COUNT(*) FROM crm_rev_payments p WHERE p.account_id = u.account_id AND p.verification = 'reported' AND p.void = 0) AS awaitingConfirm,
              (SELECT COUNT(*) FROM crm_rev_statements s WHERE s.account_id = u.account_id AND s.status IN ('draft','review')) AS openStatements,
              (SELECT COUNT(*) FROM crm_rev_queries q WHERE q.account_id = u.account_id AND q.answered_at IS NULL) AS openQueries
       FROM crm_users u WHERE u.role = 'agency' AND u.account_id IS NOT NULL ORDER BY (agreement IS NULL), u.created_at DESC LIMIT 500`,
    ).all();
    return json({ success: true, customers: results });
  }

  /* Everything else is about one workspace. */
  const ctx = await context(env, user, clip(d.accountId, 120));
  if (ctx instanceof Response) return ctx;
  const c = ctx;

  if (action === 'overview') {
    const days = [30, 90, 365].includes(Number(d.days)) ? Number(d.days) : 0;
    const since = days ? new Date(Date.now() - days * 86_400_000).toISOString() : '0000';
    const [leads, pays, ags, sts, qs, aps, dnc, calls] = await Promise.all([
      env.DB.prepare('SELECT * FROM crm_rev_leads WHERE account_id = ? ORDER BY first_touch_at DESC LIMIT 1000').bind(c.accountId).all<LeadRow>(),
      env.DB.prepare('SELECT * FROM crm_rev_payments WHERE account_id = ? ORDER BY received_on DESC, recorded_at DESC LIMIT 5000').bind(c.accountId).all<PayRow>(),
      env.DB.prepare('SELECT * FROM crm_growth_agreements WHERE account_id = ? ORDER BY created_at DESC').bind(c.accountId).all<AgreementRow>(),
      env.DB.prepare("SELECT * FROM crm_rev_statements WHERE account_id = ? AND status != 'void' ORDER BY period_end DESC, computed_at DESC").bind(c.accountId).all<StatementRow>(),
      env.DB.prepare('SELECT * FROM crm_rev_queries WHERE account_id = ? ORDER BY at').bind(c.accountId).all(),
      env.DB.prepare('SELECT * FROM crm_rev_approvals WHERE account_id = ? ORDER BY requested_at DESC').bind(c.accountId).all(),
      env.DB.prepare('SELECT phone, reason, added_by, added_at FROM crm_rev_dnc WHERE account_id = ? ORDER BY added_at DESC').bind(c.accountId).all(),
      env.DB.prepare('SELECT * FROM crm_rev_calls WHERE account_id = ? ORDER BY called_at DESC LIMIT 100').bind(c.accountId).all(),
    ]);
    const active = ags.results.find(a => a.status === 'active') ?? null;
    /* A customer sees only a signed agreement; a draft is the owner's until it is put to them. */
    const agreements = ags.results.filter(a => c.owner || a.status !== 'draft').map(agreementView);
    const statements = sts.results.filter(s => c.owner || s.status !== 'draft').map(statementView);
    const collectedBy = new Map<string, number>();
    for (const p of pays.results) if (!p.void && p.verification !== 'reported') collectedBy.set(p.lead_id, (collectedBy.get(p.lead_id) ?? 0) + (p.kind === 'payment' ? p.amount_cents : -p.amount_cents));
    const approved = sts.results.filter(s => s.status === 'approved').reduce((t, s) => t + s.fee_cents, 0);
    const open = sts.results.find(s => s.status === 'draft' || s.status === 'review');
    return json({
      success: true,
      as: { owner: c.owner, contractor: c.contractor },
      agreement: active ? agreementView(active) : null,
      agreements,
      leads: leads.results.map(r => ({ ...leadView(r), collectedCents: collectedBy.get(r.id) ?? 0 })),
      payments: pays.results.filter(p => !p.void).map(payView),
      metrics: {
        days,
        ...summarize(leads.results.map(leadFacts), pays.results.map(payFacts), since, active ? agreementFacts(active) : null),
        feeApprovedCents: approved,
        feePendingCents: open && (c.owner || open.status !== 'draft') ? open.fee_cents : 0,
      },
      statements,
      queries: qs.results,
      approvals: aps.results,
      dnc: dnc.results,
      calls: calls.results.map(r => ({ ...r, checks: parse((r as { checks: string }).checks, {}) })),
      /* Nothing verifies a payment automatically yet; the screen says so rather than implying it. */
      integrations: { payments: 'none' },
    });
  }

  if (action === 'lead_get') {
    const l = await loadLead(env, c, d.id);
    if (!l) return fail('That lead is not in this workspace.', 404);
    const [pays, evs, calls] = await Promise.all([
      env.DB.prepare('SELECT * FROM crm_rev_payments WHERE lead_id = ? AND account_id = ? ORDER BY received_on, recorded_at').bind(l.id, c.accountId).all<PayRow>(),
      env.DB.prepare('SELECT kind, detail, by_email AS byEmail, by_role AS byRole, at FROM crm_rev_events WHERE lead_id = ? AND account_id = ? ORDER BY id').bind(l.id, c.accountId).all(),
      env.DB.prepare('SELECT * FROM crm_rev_calls WHERE lead_id = ? AND account_id = ? ORDER BY called_at').bind(l.id, c.accountId).all(),
    ]);
    return json({ success: true, lead: leadView(l), payments: pays.results.map(payView), events: evs.results.map(e => ({ ...e, detail: parse((e as { detail: string }).detail, {}) })), calls: calls.results });
  }

  if (action === 'lead_create') {
    const v = (d.lead ?? {}) as Record<string, unknown>;
    const name = clip(v.name, 120);
    if (name.length < 2) return fail('Give the person’s or business’s name.', 200, { field: 'lead.name' });
    if (!isChannel(v.channel)) return fail('Say where this lead first came from.', 200, { field: 'lead.channel' });
    const email = clip(v.email, 200).toLowerCase();
    if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return fail('That is not an email address.', 200, { field: 'lead.email' });
    const phone = clip(v.phone, 40);
    if (phone && phoneKey(phone).length < 10) return fail('Give the full phone number, with area code.', 200, { field: 'lead.phone' });
    const consent = isConsent(v.consent) ? v.consent : 'inquiry';
    const tz = clip(v.timezone, 60);
    if (tz && !isZone(tz)) return fail('Choose a time zone from the list.', 200, { field: 'lead.timezone' });
    /* First touch is now unless the lead came in recently and is logged late; never in the future, never months back. */
    let first = nowIso();
    if (v.firstTouchOn) {
      const day = validDate(v.firstTouchOn);
      if (!day) return fail('Give the date of first contact.', 200, { field: 'lead.firstTouchOn' });
      const age = (Date.now() - Date.parse(`${day}T12:00:00Z`)) / 86_400_000;
      if (age < -1) return fail('First contact cannot be in the future.', 200, { field: 'lead.firstTouchOn' });
      if (age > 31) return fail('Leads are logged within a month of first contact, so attribution is not decided after the fact.', 200, { field: 'lead.firstTouchOn' });
      if (day !== today()) first = `${day}T12:00:00.000Z`;
    }
    const idem = clip(d.idem, 80) || null;
    if (idem) {
      const had = await env.DB.prepare('SELECT * FROM crm_rev_leads WHERE account_id = ? AND idem_key = ?').bind(c.accountId, idem).first<LeadRow>();
      if (had) return json({ success: true, lead: leadView(had), repeated: true });
    }
    const ag = await activeAgreement(env, c.accountId);
    const agreementId = ag && ag.starts_on && first.slice(0, 10) >= ag.starts_on ? ag.id : null;
    const lid = id('lead'), at = nowIso();
    const byService = CHANNELS[v.channel].service ? 1 : 0;
    const quote = v.quote != null && v.quote !== '' ? centsFrom(v.quote) : null;
    if (v.quote != null && v.quote !== '' && quote == null) return fail('Enter the quote as an amount, like 4500 or 4,500.00.', 200, { field: 'lead.quote' });
    try {
      await env.DB.batch([
        env.DB.prepare(`INSERT INTO crm_rev_leads (id, account_id, name, email, phone, service, stage, channel, channel_detail, first_touch_at, by_service, agreement_id,
            existing_customer, consent, timezone, quote_cents, idem_key, created_by, created_at, updated_at)
          VALUES (?, ?, ?, ?, ?, ?, 'inquiry', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`)
          .bind(lid, c.accountId, name, email, phone, clip(v.service, 160), v.channel, clip(v.channelDetail, 160), first, byService, agreementId,
            v.channel === 'own_repeat' ? 1 : 0, consent, tz, quote, idem, c.user.email, at, at),
        event(env, c, lid, 'created', { channel: v.channel, detail: clip(v.channelDetail, 160), firstTouchAt: first, byService: !!byService, agreementId }),
      ]);
    } catch (e) {
      /* Two submits racing on one key: the other one stored it. */
      if (idem && /UNIQUE/i.test(String(e))) {
        const had = await env.DB.prepare('SELECT * FROM crm_rev_leads WHERE account_id = ? AND idem_key = ?').bind(c.accountId, idem).first<LeadRow>();
        if (had) return json({ success: true, lead: leadView(had), repeated: true });
      }
      throw e;
    }
    return json({ success: true, lead: leadView((await loadLead(env, c, lid))!) });
  }

  if (action === 'lead_update') {
    const l = await loadLead(env, c, d.id);
    if (!l) return fail('That lead is not in this workspace.', 404);
    const v = (d.patch ?? {}) as Record<string, unknown>;
    const next = { name: l.name, email: l.email, phone: l.phone, service: l.service, consent: l.consent, timezone: l.timezone, quote_cents: l.quote_cents };
    if ('name' in v) { next.name = clip(v.name, 120); if (next.name.length < 2) return fail('Give the person’s or business’s name.', 200, { field: 'lead.name' }); }
    if ('email' in v) { next.email = clip(v.email, 200).toLowerCase(); if (next.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(next.email)) return fail('That is not an email address.', 200, { field: 'lead.email' }); }
    if ('phone' in v) { next.phone = clip(v.phone, 40); if (next.phone && phoneKey(next.phone).length < 10) return fail('Give the full phone number, with area code.', 200, { field: 'lead.phone' }); }
    if ('service' in v) next.service = clip(v.service, 160);
    if ('consent' in v) { if (!isConsent(v.consent)) return fail('Choose what consent you have.', 200, { field: 'lead.consent' }); next.consent = v.consent; }
    if ('timezone' in v) { next.timezone = clip(v.timezone, 60); if (next.timezone && !isZone(next.timezone)) return fail('Choose a time zone from the list.', 200, { field: 'lead.timezone' }); }
    if ('quote' in v) {
      const q = v.quote === '' || v.quote == null ? null : centsFrom(v.quote);
      if (v.quote !== '' && v.quote != null && q == null) return fail('Enter the quote as an amount, like 4500 or 4,500.00.', 200, { field: 'lead.quote' });
      next.quote_cents = q;
    }
    const changed = Object.fromEntries(Object.entries(next).filter(([k, val]) => (l as unknown as Record<string, unknown>)[k] !== val).map(([k, val]) => [k, { from: (l as unknown as Record<string, unknown>)[k], to: val }]));
    if (!Object.keys(changed).length) return json({ success: true, lead: leadView(l) });
    await env.DB.batch([
      env.DB.prepare('UPDATE crm_rev_leads SET name = ?, email = ?, phone = ?, service = ?, consent = ?, timezone = ?, quote_cents = ?, updated_at = ? WHERE id = ? AND account_id = ?')
        .bind(next.name, next.email, next.phone, next.service, next.consent, next.timezone, next.quote_cents, nowIso(), l.id, c.accountId),
      event(env, c, l.id, 'edited', changed),
    ]);
    return json({ success: true, lead: leadView((await loadLead(env, c, l.id))!) });
  }

  if (action === 'stage') {
    const l = await loadLead(env, c, d.id);
    if (!l) return fail('That lead is not in this workspace.', 404);
    if (!isStage(d.to)) return fail('Choose a stage.', 200, { field: 'lead.stage' });
    const reason = clip(d.reason, 300);
    const problem = stageMoveProblem(l.stage as Stage, d.to, reason);
    if (problem) return fail(problem, 200, { field: /reason|why/i.test(problem) ? 'lead.reason' : 'lead.stage' });
    const at = nowIso();
    const order = (s: string) => Object.keys(STAGE_INFO).indexOf(s);
    /* Won is stamped the first time and kept while the job stays at or past won; moving back below it clears it. */
    let wonAt = l.won_at;
    if (d.to === 'won' && !wonAt) wonAt = at;
    if (d.to !== 'lost' && order(d.to) < order('won')) wonAt = null;
    if (d.to === 'lost') wonAt = null;
    await env.DB.batch([
      env.DB.prepare('UPDATE crm_rev_leads SET stage = ?, won_at = ?, lost_reason = ?, updated_at = ? WHERE id = ? AND account_id = ?')
        .bind(d.to, wonAt, d.to === 'lost' ? reason : '', at, l.id, c.accountId),
      event(env, c, l.id, 'stage', { from: l.stage, to: d.to, reason }),
    ]);
    return json({ success: true, lead: leadView((await loadLead(env, c, l.id))!) });
  }

  if (action === 'confirm_completion') {
    if (!c.contractor) return notContractor();
    const l = await loadLead(env, c, d.id);
    if (!l) return fail('That lead is not in this workspace.', 404);
    if (l.stage !== 'won' && l.stage !== 'in_progress') return fail('Only a won or in-progress job can be confirmed complete.', 200, { field: 'lead.stage' });
    const final = centsFrom(d.finalAmount);
    if (final == null || final <= 0) return fail('Enter the job’s final amount, as invoiced.', 200, { field: 'lead.final' });
    const at = nowIso();
    await env.DB.batch([
      env.DB.prepare("UPDATE crm_rev_leads SET stage = 'completed', final_cents = ?, completed_at = ?, completed_by = ?, updated_at = ? WHERE id = ? AND account_id = ?")
        .bind(final, at, c.user.email, at, l.id, c.accountId),
      event(env, c, l.id, 'completed', { finalCents: final, from: l.stage }),
    ]);
    return json({ success: true, lead: leadView((await loadLead(env, c, l.id))!) });
  }

  if (action === 'invoice') {
    if (!c.contractor) return notContractor();
    const l = await loadLead(env, c, d.id);
    if (!l) return fail('That lead is not in this workspace.', 404);
    if (l.stage !== 'completed' && l.stage !== 'in_progress' && l.stage !== 'won') return fail('Invoice a job once it is won.', 200, { field: 'lead.stage' });
    const amt = centsFrom(d.amount);
    if (amt == null || amt <= 0) return fail('Enter the invoice amount.', 200, { field: 'lead.invoiceAmount' });
    const ref = clip(d.reference, 80);
    await env.DB.batch([
      env.DB.prepare('UPDATE crm_rev_leads SET invoice_ref = ?, invoiced_cents = ?, invoiced_at = ?, updated_at = ? WHERE id = ? AND account_id = ?')
        .bind(ref, amt, nowIso(), nowIso(), l.id, c.accountId),
      event(env, c, l.id, 'invoiced', { amountCents: amt, reference: ref }),
    ]);
    return json({ success: true, lead: leadView((await loadLead(env, c, l.id))!) });
  }

  if (action === 'existing_customer') {
    const l = await loadLead(env, c, d.id);
    if (!l) return fail('That lead is not in this workspace.', 404);
    const value = d.value === true;
    const reason = clip(d.reason, 300);
    if (reason.length < 3) return fail('Say why, in a few words — it is kept with the lead.', 200, { field: 'lead.reason' });
    /* Marking somebody an existing customer takes the job out of the fee; only the contractor knows that. The owner may only undo it, with a reason both can read. */
    if (value && !c.contractor) return notContractor();
    if (value && !c.owner) {
      const late = existingCustomerProblem({ wonAt: l.won_at, createdAt: l.created_at });
      if (late) return fail(late, 200, { field: 'lead.reason', code: 'too_late' });
    }
    await env.DB.batch([
      env.DB.prepare('UPDATE crm_rev_leads SET existing_customer = ?, updated_at = ? WHERE id = ? AND account_id = ?').bind(value ? 1 : 0, nowIso(), l.id, c.accountId),
      event(env, c, l.id, 'existing_customer', { value, reason }),
    ]);
    return json({ success: true, lead: leadView((await loadLead(env, c, l.id))!) });
  }

  if (action === 'attribution_fix') {
    if (!c.owner) return notOwner();
    const l = await loadLead(env, c, d.id);
    if (!l) return fail('That lead is not in this workspace.', 404);
    const reason = clip(d.reason, 300);
    if (reason.length < 3) return fail('Say why, in a few words — the contractor sees it.', 200, { field: 'lead.reason' });
    const by = d.byService === true ? 1 : 0;
    if (by === l.by_service) return fail('That is already how the lead is attributed.', 200, { field: 'lead.attribution' });
    await env.DB.batch([
      env.DB.prepare('UPDATE crm_rev_leads SET by_service = ?, updated_at = ? WHERE id = ? AND account_id = ?').bind(by, nowIso(), l.id, c.accountId),
      event(env, c, l.id, 'attribution', { from: !!l.by_service, to: !!by, reason, firstTouch: { channel: l.channel, at: l.first_touch_at } }),
    ]);
    return json({ success: true, lead: leadView((await loadLead(env, c, l.id))!) });
  }

  /* ── Money ── */

  if (action === 'payment_add') {
    const l = await loadLead(env, c, d.leadId);
    if (!l) return fail('That lead is not in this workspace.', 404);
    const kind = (PAYMENT_KINDS as readonly string[]).includes(String(d.kind)) ? d.kind as PaymentKind : null;
    if (!kind) return fail('Choose payment, refund or chargeback.', 200, { field: 'pay.kind' });
    const amount = centsFrom(d.amount);
    if (amount == null || amount <= 0) return fail('Enter the amount.', 200, { field: 'pay.amount' });
    const excluded = d.excluded == null || d.excluded === '' ? 0 : centsFrom(d.excluded);
    if (excluded == null || excluded > amount) return fail('The excluded part (tax, permits…) is an amount no larger than the payment.', 200, { field: 'pay.excluded' });
    const on = validDate(d.receivedOn);
    if (!on) return fail('Give the date the money arrived.', 200, { field: 'pay.receivedOn' });
    if (on > today()) return fail('A payment cannot be received in the future.', 200, { field: 'pay.receivedOn' });
    if (on < l.first_touch_at.slice(0, 10)) return fail('That date is before the lead first got in touch.', 200, { field: 'pay.receivedOn' });
    const method = (METHODS as readonly string[]).includes(String(d.method)) ? String(d.method) : 'other';
    const idem = clip(d.idem, 80) || null;
    if (idem) {
      const had = await env.DB.prepare('SELECT * FROM crm_rev_payments WHERE account_id = ? AND idem_key = ?').bind(c.accountId, idem).first<PayRow>();
      if (had) return json({ success: true, payment: payView(had), repeated: true });
    }
    /* What the contractor records, they have confirmed; what the service team records waits for them. */
    const verification: Verification = c.contractor ? 'contractor_confirmed' : 'reported';
    const pid = id('pay'), at = nowIso();
    try {
      await env.DB.batch([
        env.DB.prepare(`INSERT INTO crm_rev_payments (id, account_id, lead_id, kind, amount_cents, excluded_cents, received_on, method, verification, reference,
            recorded_by, recorded_at, confirmed_by, confirmed_at, idem_key) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`)
          .bind(pid, c.accountId, l.id, kind, amount, excluded, on, method, verification, clip(d.reference, 80), c.user.email, at,
            c.contractor ? c.user.email : null, c.contractor ? at : null, idem),
        event(env, c, l.id, kind, { paymentId: pid, amountCents: amount, excludedCents: excluded, receivedOn: on, verification }),
      ]);
    } catch (e) {
      if (idem && /UNIQUE/i.test(String(e))) {
        const had = await env.DB.prepare('SELECT * FROM crm_rev_payments WHERE account_id = ? AND idem_key = ?').bind(c.accountId, idem).first<PayRow>();
        if (had) return json({ success: true, payment: payView(had), repeated: true });
      }
      throw e;
    }
    return json({ success: true, payment: payView((await loadPayment(env, c, pid))!) });
  }

  if (action === 'payment_confirm') {
    if (!c.contractor) return notContractor();
    const p = await loadPayment(env, c, d.id);
    if (!p || p.void) return fail('That payment is not in this workspace.', 404);
    if (p.verification !== 'reported') return json({ success: true, payment: payView(p) });
    const excluded = d.excluded == null || d.excluded === '' ? p.excluded_cents : centsFrom(d.excluded);
    if (excluded == null || excluded > p.amount_cents) return fail('The excluded part is an amount no larger than the payment.', 200, { field: 'pay.excluded' });
    const at = nowIso();
    await env.DB.batch([
      env.DB.prepare("UPDATE crm_rev_payments SET verification = 'contractor_confirmed', excluded_cents = ?, confirmed_by = ?, confirmed_at = ? WHERE id = ? AND account_id = ? AND verification = 'reported'")
        .bind(excluded, c.user.email, at, p.id, c.accountId),
      event(env, c, p.lead_id, 'payment_confirmed', { paymentId: p.id, amountCents: p.amount_cents, excludedCents: excluded }),
    ]);
    return json({ success: true, payment: payView((await loadPayment(env, c, p.id))!) });
  }

  if (action === 'payment_dispute' || action === 'payment_void') {
    const p = await loadPayment(env, c, d.id);
    if (!p || p.void) return fail('That payment is not in this workspace.', 404);
    if (p.statement_id) return fail('That payment is on an approved statement. Record a refund or chargeback instead.', 200, { field: 'pay.kind' });
    const reason = clip(d.reason, 300);
    if (reason.length < 3) return fail('Say why, in a few words.', 200, { field: 'pay.reason' });
    /* A confirmed payment is the contractor's fact: only they withdraw it. The service team may void what it reported itself. */
    if (action === 'payment_void' && p.verification !== 'reported' && !c.contractor) return notContractor();
    const set = action === 'payment_void' ? 'void = 1' : `disputed = ${d.value === false ? 0 : 1}`;
    await env.DB.batch([
      env.DB.prepare(`UPDATE crm_rev_payments SET ${set} WHERE id = ? AND account_id = ? AND statement_id IS NULL`).bind(p.id, c.accountId),
      event(env, c, p.lead_id, action === 'payment_void' ? 'payment_voided' : 'payment_disputed', { paymentId: p.id, reason, value: action === 'payment_void' ? true : d.value !== false }),
    ]);
    return json({ success: true });
  }

  /* ── Agreements ── */

  if (action === 'agreement_draft' || action === 'agreement_terms' || action === 'agreement_activate' || action === 'agreement_end') {
    if (!c.owner) return notOwner();
    if (action === 'agreement_draft') {
      const open = await env.DB.prepare("SELECT * FROM crm_growth_agreements WHERE account_id = ? AND status = 'draft'").bind(c.accountId).first<AgreementRow>();
      if (open) return json({ success: true, agreement: agreementView(open), repeated: true });
      const t = await currentTerms(env);
      const aid = id('agr'), at = nowIso();
      await env.DB.batch([
        env.DB.prepare(`INSERT INTO crm_growth_agreements (id, account_id, status, terms_id, currency, setup_cents, monthly_cents, performance_bps, attribution_days, exclusions,
            customer_name, created_by, created_at, updated_at) VALUES (?, ?, 'draft', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`)
          .bind(aid, c.accountId, t.id, t.terms.currency, t.terms.setupCents, t.terms.monthlyCents, t.terms.performanceBps, t.terms.attributionDays,
            JSON.stringify(t.terms.exclusions), clip(d.customerName, 160), c.user.email, at, at),
        event(env, c, null, 'agreement_drafted', { agreementId: aid, termsId: t.id, terms: t.terms }),
      ]);
      const row = await env.DB.prepare('SELECT * FROM crm_growth_agreements WHERE id = ?').bind(aid).first<AgreementRow>();
      return json({ success: true, agreement: agreementView(row!) });
    }
    const ag = await env.DB.prepare('SELECT * FROM crm_growth_agreements WHERE id = ? AND account_id = ?').bind(String(d.id ?? ''), c.accountId).first<AgreementRow>();
    if (!ag) return fail('That agreement is not in this workspace.', 404);
    if (action === 'agreement_terms') {
      if (ag.status !== 'draft') return fail('A signed agreement’s terms are fixed. End it and draft a new one.', 200, { field: 'terms.setup' });
      const t = cleanTerms((d.terms ?? {}) as Record<string, unknown>);
      if (!t.terms) return fail(t.error!, 200, { field: t.field });
      await env.DB.batch([
        env.DB.prepare(`UPDATE crm_growth_agreements SET setup_cents = ?, monthly_cents = ?, performance_bps = ?, attribution_days = ?, exclusions = ?, customer_name = ?, updated_at = ?
            WHERE id = ? AND status = 'draft'`)
          .bind(t.terms.setupCents, t.terms.monthlyCents, t.terms.performanceBps, t.terms.attributionDays, JSON.stringify(t.terms.exclusions), clip(d.customerName ?? ag.customer_name, 160), nowIso(), ag.id),
        event(env, c, null, 'agreement_terms', { agreementId: ag.id, terms: t.terms }),
      ]);
    } else if (action === 'agreement_activate') {
      if (ag.status !== 'draft') return fail('Only a draft can be signed.', 200);
      const signedBy = clip(d.signedBy, 120);
      if (signedBy.length < 2) return fail('Who signed it for the customer?', 200, { field: 'agreement.signedBy' });
      const signedOn = validDate(d.signedOn);
      if (!signedOn || signedOn > today()) return fail('Give the date it was signed — today or earlier.', 200, { field: 'agreement.signedOn' });
      const startsOn = validDate(d.startsOn);
      if (!startsOn || startsOn < signedOn) return fail('It starts on or after the day it was signed.', 200, { field: 'agreement.startsOn' });
      if (await activeAgreement(env, c.accountId)) return fail('This workspace already has an agreement in force. End it first.', 200, { field: 'agreement.signedBy' });
      try {
        await env.DB.batch([
          env.DB.prepare("UPDATE crm_growth_agreements SET status = 'active', signed_by = ?, signed_at = ?, starts_on = ?, updated_at = ? WHERE id = ? AND status = 'draft'")
            .bind(signedBy, signedOn, startsOn, nowIso(), ag.id),
          event(env, c, null, 'agreement_signed', { agreementId: ag.id, signedBy, signedOn, startsOn }),
        ]);
      } catch (e) {
        if (/UNIQUE/i.test(String(e))) return fail('This workspace already has an agreement in force. End it first.', 200, { field: 'agreement.signedBy' });
        throw e;
      }
    } else {
      if (ag.status !== 'active') return fail('Only an agreement in force can be ended.', 200);
      const endsOn = validDate(d.endsOn);
      if (!endsOn || endsOn < (ag.starts_on ?? '')) return fail('Give the last day of the agreement, on or after its start.', 200, { field: 'agreement.endsOn' });
      await env.DB.batch([
        env.DB.prepare("UPDATE crm_growth_agreements SET status = 'ended', ends_on = ?, updated_at = ? WHERE id = ? AND status = 'active'").bind(endsOn, nowIso(), ag.id),
        event(env, c, null, 'agreement_ended', { agreementId: ag.id, endsOn }),
      ]);
    }
    const row = await env.DB.prepare('SELECT * FROM crm_growth_agreements WHERE id = ?').bind(ag.id).first<AgreementRow>();
    return json({ success: true, agreement: agreementView(row!) });
  }

  /* ── Statements ── */

  if (action === 'statement_compute') {
    if (!c.owner) return notOwner();
    const ag = await env.DB.prepare("SELECT * FROM crm_growth_agreements WHERE account_id = ? AND status IN ('active', 'ended') ORDER BY CASE status WHEN 'active' THEN 0 ELSE 1 END, updated_at DESC LIMIT 1")
      .bind(c.accountId).first<AgreementRow>();
    if (!ag) return fail('There is no signed agreement in this workspace, so there is no fee to calculate.', 200);
    const periodEnd = validDate(d.periodEnd);
    if (!periodEnd || periodEnd > today()) return fail('Choose the day the statement closes — today or earlier.', 200, { field: 'statement.periodEnd' });
    const open = await env.DB.prepare("SELECT * FROM crm_rev_statements WHERE agreement_id = ? AND status IN ('draft', 'review')").bind(ag.id).first<StatementRow>();
    if (open?.status === 'review') return fail('The open statement is with the contractor. Take it back to draft before recalculating.', 200);
    const s = await computeFor(env, ag, periodEnd);
    const sid = open?.id ?? id('stmt'), at = nowIso();
    const lines = JSON.stringify({ lines: s.lines, notCounted: s.notCounted });
    await env.DB.batch([
      open
        ? env.DB.prepare(`UPDATE crm_rev_statements SET label = ?, period_end = ?, bps = ?, gross_cents = ?, excluded_cents = ?, refunds_cents = ?, carried_cents = ?, net_cents = ?,
              fee_cents = ?, carry_out_cents = ?, lines = ?, computed_at = ? WHERE id = ? AND status = 'draft'`)
          .bind(periodLabel(periodEnd), periodEnd, s.bps, s.grossCents, s.excludedCents, s.refundsCents, s.carriedCents, s.netCents, s.feeCents, s.carryOutCents, lines, at, sid)
        : env.DB.prepare(`INSERT INTO crm_rev_statements (id, account_id, agreement_id, label, period_end, status, currency, bps, gross_cents, excluded_cents, refunds_cents,
              carried_cents, net_cents, fee_cents, carry_out_cents, lines, computed_at, created_by) VALUES (?, ?, ?, ?, ?, 'draft', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`)
          .bind(sid, c.accountId, ag.id, periodLabel(periodEnd), periodEnd, s.currency, s.bps, s.grossCents, s.excludedCents, s.refundsCents, s.carriedCents, s.netCents, s.feeCents, s.carryOutCents, lines, at, c.user.email),
      event(env, c, null, 'statement_computed', { statementId: sid, periodEnd, netCents: s.netCents, feeCents: s.feeCents, lines: s.lines.length }),
    ]);
    const row = await env.DB.prepare('SELECT * FROM crm_rev_statements WHERE id = ?').bind(sid).first<StatementRow>();
    return json({ success: true, statement: statementView(row!) });
  }

  if (action === 'statement_send' || action === 'statement_reopen' || action === 'statement_approve' || action === 'statement_void') {
    if (!c.owner) return notOwner();
    const st = await env.DB.prepare('SELECT * FROM crm_rev_statements WHERE id = ? AND account_id = ?').bind(String(d.id ?? ''), c.accountId).first<StatementRow>();
    if (!st) return fail('That statement is not in this workspace.', 404);
    const at = nowIso();
    if (action === 'statement_send') {
      if (st.status !== 'draft') return fail('Only a draft can be sent for review.', 200);
      await env.DB.batch([
        env.DB.prepare("UPDATE crm_rev_statements SET status = 'review', sent_at = ? WHERE id = ? AND status = 'draft'").bind(at, st.id),
        event(env, c, null, 'statement_sent', { statementId: st.id }),
      ]);
    } else if (action === 'statement_reopen') {
      if (st.status !== 'review') return fail('Only a statement under review can be taken back.', 200);
      await env.DB.batch([
        env.DB.prepare("UPDATE crm_rev_statements SET status = 'draft' WHERE id = ? AND status = 'review'").bind(st.id),
        event(env, c, null, 'statement_reopened', { statementId: st.id }),
      ]);
    } else if (action === 'statement_void') {
      if (st.status !== 'draft' && st.status !== 'review') return fail('An approved statement stays. Put any correction on the next one.', 200);
      await env.DB.batch([
        env.DB.prepare("UPDATE crm_rev_statements SET status = 'void' WHERE id = ? AND status IN ('draft', 'review')").bind(st.id),
        event(env, c, null, 'statement_voided', { statementId: st.id, reason: clip(d.reason, 300) }),
      ]);
    } else {
      if (st.status !== 'review') return fail('Send the statement to the contractor for review before approving it.', 200);
      const q = await env.DB.prepare('SELECT COUNT(*) AS n FROM crm_rev_queries WHERE statement_id = ? AND answered_at IS NULL').bind(st.id).first<{ n: number }>();
      if (q?.n) return fail(`${q.n} question${q.n === 1 ? ' is' : 's are'} still open on this statement. Answer ${q.n === 1 ? 'it' : 'them'} first.`, 200, { code: 'open_queries' });
      /* The ledger may have moved since it was computed — a payment voided, disputed or confirmed. Approve only what is still true. */
      const ag = await env.DB.prepare('SELECT * FROM crm_growth_agreements WHERE id = ?').bind(st.agreement_id).first<AgreementRow>();
      const now = await computeFor(env, ag!, st.period_end);
      const was = parse<{ lines: { paymentId: string }[] }>(st.lines, { lines: [] }).lines.map(x => x.paymentId).sort().join();
      if (now.netCents !== st.net_cents || now.feeCents !== st.fee_cents || now.lines.map(x => x.paymentId).sort().join() !== was) {
        return fail('Payments changed since this statement was calculated. Take it back to draft and recalculate.', 200, { code: 'stale' });
      }
      const ids = now.lines.map(x => x.paymentId);
      await env.DB.batch([
        env.DB.prepare("UPDATE crm_rev_statements SET status = 'approved', approved_by = ?, approved_at = ? WHERE id = ? AND status = 'review'").bind(c.user.email, at, st.id),
        ...ids.map(pid => env.DB.prepare('UPDATE crm_rev_payments SET statement_id = ? WHERE id = ? AND account_id = ? AND statement_id IS NULL').bind(st.id, pid, c.accountId)),
        event(env, c, null, 'statement_approved', { statementId: st.id, feeCents: st.fee_cents, netCents: st.net_cents, payments: ids.length }),
      ]);
    }
    const row = await env.DB.prepare('SELECT * FROM crm_rev_statements WHERE id = ?').bind(st.id).first<StatementRow>();
    return json({ success: true, statement: statementView(row!) });
  }

  if (action === 'query_add') {
    if (!c.contractor) return notContractor();
    const st = await env.DB.prepare("SELECT id, status FROM crm_rev_statements WHERE id = ? AND account_id = ?").bind(String(d.statementId ?? ''), c.accountId).first<{ id: string; status: string }>();
    if (!st || st.status === 'draft' || st.status === 'void') return fail('That statement is not open for questions.', 404);
    const text = clip(d.body, 1000);
    if (text.length < 5) return fail('Write your question.', 200, { field: 'query.body' });
    const qid = id('q');
    await env.DB.batch([
      env.DB.prepare('INSERT INTO crm_rev_queries (id, account_id, statement_id, line_ref, body, by_email, at) VALUES (?, ?, ?, ?, ?, ?, ?)')
        .bind(qid, c.accountId, st.id, clip(d.lineRef, 80), text, c.user.email, nowIso()),
      event(env, c, null, 'query', { statementId: st.id, queryId: qid, lineRef: clip(d.lineRef, 80) }),
    ]);
    return json({ success: true, id: qid });
  }

  if (action === 'query_answer') {
    if (!c.owner) return notOwner();
    const text = clip(d.body, 1000);
    if (text.length < 3) return fail('Write the answer.', 200, { field: 'query.answer' });
    const r = await env.DB.prepare('UPDATE crm_rev_queries SET answer = ?, answered_by = ?, answered_at = ? WHERE id = ? AND account_id = ? AND answered_at IS NULL')
      .bind(text, c.user.email, nowIso(), String(d.id ?? ''), c.accountId).run();
    if (!r.meta.changes) return fail('That question is not open in this workspace.', 404);
    await event(env, c, null, 'query_answered', { queryId: String(d.id) }).run();
    return json({ success: true });
  }

  /* ── Approvals, do-not-call and calls ── */

  if (action === 'approval_request') {
    if (!c.owner) return notOwner();
    const kind = String(d.kind ?? '');
    if (!(kind in APPROVAL_KINDS)) return fail('Choose what needs approving.', 200, { field: 'approval.kind' });
    const title = clip(d.title, 160);
    if (title.length < 3) return fail('Give it a title.', 200, { field: 'approval.title' });
    const text = clip(d.body, 6000);
    if (kind === 'call_script' && text.length < 20) return fail('Paste the script the caller will use.', 200, { field: 'approval.body' });
    const needsAmount = kind === 'ad_budget' || kind === 'third_party_expense';
    const amount = d.amount == null || d.amount === '' ? null : centsFrom(d.amount);
    if (needsAmount && (amount == null || amount <= 0)) return fail('Enter the amount you are asking them to approve.', 200, { field: 'approval.amount' });
    const aid = id('apr');
    await env.DB.batch([
      env.DB.prepare("INSERT INTO crm_rev_approvals (id, account_id, kind, title, body, amount_cents, status, requested_by, requested_at) VALUES (?, ?, ?, ?, ?, ?, 'pending', ?, ?)")
        .bind(aid, c.accountId, kind, title, text, needsAmount ? amount : null, c.user.email, nowIso()),
      event(env, c, null, 'approval_requested', { approvalId: aid, kind, title, amountCents: needsAmount ? amount : null }),
    ]);
    return json({ success: true, id: aid });
  }

  if (action === 'approval_decide' || action === 'approval_withdraw') {
    const ap = await env.DB.prepare('SELECT id, kind, status FROM crm_rev_approvals WHERE id = ? AND account_id = ?').bind(String(d.id ?? ''), c.accountId).first<{ id: string; kind: ApprovalKind; status: string }>();
    if (!ap) return fail('That request is not in this workspace.', 404);
    if (action === 'approval_withdraw') {
      if (!c.owner) return notOwner();
      if (ap.status !== 'pending' && ap.status !== 'approved') return fail('That request is already closed.', 200);
    } else {
      if (!c.contractor) return notContractor();
      if (ap.status !== 'pending') return fail('That request has already been decided.', 200);
    }
    const status = action === 'approval_withdraw' ? 'withdrawn' : d.decision === 'approved' ? 'approved' : d.decision === 'declined' ? 'declined' : '';
    if (!status) return fail('Approve or decline.', 200, { field: 'approval.decision' });
    await env.DB.batch([
      env.DB.prepare('UPDATE crm_rev_approvals SET status = ?, decided_by = ?, decided_at = ?, decision_note = ? WHERE id = ? AND account_id = ?')
        .bind(status, c.user.email, nowIso(), clip(d.note, 500), ap.id, c.accountId),
      event(env, c, null, `approval_${status}`, { approvalId: ap.id, kind: ap.kind, note: clip(d.note, 500) }),
    ]);
    return json({ success: true, status });
  }

  if (action === 'dnc_add' || action === 'dnc_remove') {
    const phone = phoneKey(d.phone);
    if (phone.length < 10) return fail('Give the full phone number, with area code.', 200, { field: 'dnc.phone' });
    if (action === 'dnc_add') {
      await env.DB.batch([
        env.DB.prepare('INSERT OR IGNORE INTO crm_rev_dnc (account_id, phone, reason, added_by, added_at) VALUES (?, ?, ?, ?, ?)').bind(c.accountId, phone, clip(d.reason, 200), c.user.email, nowIso()),
        event(env, c, null, 'dnc_added', { phone, reason: clip(d.reason, 200) }),
      ]);
    } else {
      /* Taking a number off the list lets it be called again: the contractor's decision, with a reason. */
      if (!c.contractor) return notContractor();
      if (clip(d.reason, 200).length < 3) return fail('Say why this number may be called again.', 200, { field: 'dnc.reason' });
      await env.DB.batch([
        env.DB.prepare('DELETE FROM crm_rev_dnc WHERE account_id = ? AND phone = ?').bind(c.accountId, phone),
        event(env, c, null, 'dnc_removed', { phone, reason: clip(d.reason, 200) }),
      ]);
    }
    return json({ success: true });
  }

  if (action === 'call_check' || action === 'call_log') {
    const l = d.leadId ? await loadLead(env, c, d.leadId) : null;
    if (d.leadId && !l) return fail('That lead is not in this workspace.', 404);
    const phone = phoneKey(l?.phone || d.phone);
    const tz = clip(d.timezone, 60) || l?.timezone || '';
    const consent = isConsent(d.consent) ? d.consent : isConsent(l?.consent) ? l!.consent as 'inquiry' : 'none';
    const [dnc, scripts] = await Promise.all([
      env.DB.prepare('SELECT 1 AS x FROM crm_rev_dnc WHERE account_id = ? AND phone = ?').bind(c.accountId, phone).first(),
      env.DB.prepare("SELECT id, title FROM crm_rev_approvals WHERE account_id = ? AND kind = 'call_script' AND status = 'approved' ORDER BY decided_at DESC").bind(c.accountId).all<{ id: string; title: string }>(),
    ]);
    const check = callCheck({ phone, timezone: tz, consent, onDnc: !!dnc, approvedScripts: scripts.results.length, atMs: Date.now() });
    if (action === 'call_check') return json({ success: true, ...check, scripts: scripts.results });
    /* Calls are made by people on the service team; logging one re-runs every check, so a refused call cannot be logged as made. */
    if (!c.owner) return notOwner();
    if (!check.allowed) return fail(check.checks.find(x => !x.ok)!.says, 200, { code: 'call_blocked', field: 'call.phone', checks: check.checks });
    const script = scripts.results.find(s => s.id === d.scriptId);
    if (!script) return fail('Choose the approved script you used.', 200, { field: 'call.script' });
    const outcome = (CALL_OUTCOMES as readonly string[]).includes(String(d.outcome)) ? String(d.outcome) : '';
    if (!outcome) return fail('Choose how the call went.', 200, { field: 'call.outcome' });
    const cid = id('call'), at = nowIso();
    const stmts = [
      env.DB.prepare('INSERT INTO crm_rev_calls (id, account_id, lead_id, phone, script_id, outcome, notes, checks, called_at, by_email) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)')
        .bind(cid, c.accountId, l?.id ?? null, phone, script.id, outcome, clip(d.notes, 1000), JSON.stringify({ timezone: tz, consent, checks: check.checks }), at, c.user.email),
      event(env, c, l?.id ?? null, 'call', { callId: cid, outcome, scriptId: script.id }),
    ];
    /* "Do not call me again" goes on the list there and then. */
    if (outcome === 'do_not_call') stmts.push(env.DB.prepare('INSERT OR IGNORE INTO crm_rev_dnc (account_id, phone, reason, added_by, added_at) VALUES (?, ?, ?, ?, ?)').bind(c.accountId, phone, 'Asked on a call not to be called again', c.user.email, at));
    await env.DB.batch(stmts);
    return json({ success: true, id: cid });
  }

  return fail(`"${action}" is not something this endpoint does.`);
}

