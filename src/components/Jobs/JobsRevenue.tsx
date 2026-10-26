/**
 * Jobs & revenue — every inquiry followed to the job and the money collected,
 * and the performance fee behind it (routes/leadRevenue.ts, rules in
 * worker/src/lib/leadRevenue.ts).
 *
 * The same `Ledger` serves two readers:
 *   - the contractor, on their own workspace (/jobs): they confirm a job
 *     complete, confirm payments, approve call scripts and budgets, and query
 *     a fee statement line;
 *   - the install owner, on a customer's workspace (Growth service → a
 *     customer): they log inquiries and calls, report payments, correct
 *     attribution with a reason, and compute, send and approve statements.
 * Which buttons show comes from what the server says this person is (`as`);
 * the server refuses the rest either way.
 *
 * Every figure says what it means (DEFINITIONS, STAGE_INFO) — a quote is
 * never shown as money, and nothing is "verified" that a person typed in.
 */
import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react';
import { AlertTriangle, Check, ChevronDown, ChevronUp, FileText, Loader, Phone, Plus, ShieldCheck, Undo2 } from 'lucide-react';
import { API_BASE } from '../../services/apiBase';
import { getSession, sessionToken } from '../../services/auth';
import { getActiveAccountId } from '../../services/tenancy';
import { usePageTitle } from '../../services/pageTitle';
import { allZones } from '../../services/bookingTime';
import {
  APPROVAL_KINDS, CALL_OUTCOMES, CHANNELS, CONSENTS, DEFINITIONS, EXCLUSION_KINDS, METHODS, STAGES, STAGE_INFO, VERIFICATION_INFO,
  money, monthEnd, type Stage,
} from '../../../worker/src/lib/leadRevenue';

/* ── Shapes the server answers ── */

export interface Agreement {
  id: string; status: string; currency: string; setupCents: number; monthlyCents: number; performanceBps: number; attributionDays: number;
  exclusions: string[]; customerName: string; signedBy: string; signedAt: string | null; startsOn: string | null; endsOn: string | null; createdAt: string;
}
interface Lead {
  id: string; name: string; email: string; phone: string; service: string; stage: Stage; channel: keyof typeof CHANNELS; channelDetail: string;
  firstTouchAt: string; byService: boolean; agreementId: string | null; existingCustomer: boolean; consent: keyof typeof CONSENTS; timezone: string;
  quoteCents: number | null; finalCents: number | null; invoiceRef: string; invoicedCents: number | null; invoicedAt: string | null;
  wonAt: string | null; completedAt: string | null; completedBy: string | null; lostReason: string; createdBy: string; collectedCents?: number;
}
interface Payment {
  id: string; leadId: string; kind: 'payment' | 'refund' | 'chargeback'; amountCents: number; excludedCents: number; receivedOn: string; method: string;
  verification: keyof typeof VERIFICATION_INFO; reference: string; disputed: boolean; void: boolean; recordedBy: string; confirmedBy: string | null; statementId: string | null;
}
interface Line { paymentId: string; leadId: string; lead: string; kind: string; receivedOn: string; amountCents: number; excludedCents: number; netCents: number }
interface Held { paymentId: string; leadId: string; lead: string; kind: string; amountCents: number; held: boolean; why: string }
export interface StatementV {
  id: string; label: string; periodEnd: string; status: string; currency: string; bps: number; grossCents: number; excludedCents: number; refundsCents: number;
  carriedCents: number; netCents: number; feeCents: number; carryOutCents: number; lines: Line[]; notCounted: Held[]; computedAt: string; sentAt: string | null; approvedAt: string | null;
}
interface Query { id: string; statement_id: string; line_ref: string; body: string; by_email: string; at: string; answer: string; answered_at: string | null }
interface Approval { id: string; kind: keyof typeof APPROVAL_KINDS; title: string; body: string; amount_cents: number | null; status: string; requested_at: string; decided_by: string | null; decided_at: string | null; decision_note: string }
interface Call { id: string; lead_id: string | null; phone: string; outcome: string; notes: string; called_at: string; by_email: string }
export interface Overview {
  as: { owner: boolean; contractor: boolean };
  agreement: Agreement | null; agreements: Agreement[]; leads: Lead[]; payments: Payment[];
  metrics: { days: number; inquiries: number; fromService: number; won: number; quotedCents: number; completedCents: number; collectedCents: number; eligibleCents: number; feeApprovedCents: number; feePendingCents: number };
  statements: StatementV[]; queries: Query[]; approvals: Approval[]; dnc: { phone: string; reason: string; added_by: string; added_at: string }[]; calls: Call[];
  integrations: { payments: string };
}
type Answer<T> = T & { success?: boolean; error?: string; field?: string; checks?: { key: string; ok: boolean; says: string }[] };

export const revApi = async <T,>(action: string, extra: Record<string, unknown> = {}): Promise<Answer<T>> => {
  try {
    const r = await fetch(`${API_BASE}/api/lead-revenue.php`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ token: sessionToken(), action, ...extra }) });
    return await r.json() as Answer<T>;
  } catch {
    return { success: false, error: 'Could not reach the server. Check your connection and try again.' } as Answer<T>;
  }
};

/* ── Look ── */

export const INK = '#0f172a', MUTED = '#64748b', LINE = '#e6e9f0', GOOD = '#15803d', WARN = '#b45309', BAD = '#b91c1c';
export const box: React.CSSProperties = { background: '#fff', borderRadius: 16, border: `1px solid ${LINE}`, padding: 'clamp(14px, 3vw, 20px)', minWidth: 0 };
export const input: React.CSSProperties = { width: '100%', minWidth: 0, boxSizing: 'border-box', padding: '8px 10px', borderRadius: 9, border: `1px solid ${LINE}`, fontSize: 13, fontFamily: 'inherit', color: INK, background: '#fff' };
export const label: React.CSSProperties = { display: 'grid', gap: 5, fontSize: 12, fontWeight: 700, color: '#334155', minWidth: 0 };
export const btn: React.CSSProperties = { display: 'inline-flex', alignItems: 'center', gap: 6, padding: '7px 12px', borderRadius: 9, border: `1px solid ${LINE}`, background: '#fff', color: INK, fontSize: 12.5, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit' };
export const primary: React.CSSProperties = { ...btn, background: INK, color: '#fff', border: `1px solid ${INK}` };
export const grid: React.CSSProperties = { display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 200px), 1fr))', gap: 10 };
const chip = (bg: string, fg: string): React.CSSProperties => ({ display: 'inline-flex', alignItems: 'center', gap: 4, padding: '2px 8px', borderRadius: 99, background: bg, color: fg, fontSize: 11.5, fontWeight: 700, whiteSpace: 'nowrap' });
const small: React.CSSProperties = { fontSize: 12, color: MUTED, lineHeight: 1.5, margin: 0 };
const pct = (bps: number) => `${Number((bps / 100).toFixed(2))}%`;
const day = (iso: string | null) => (iso ? new Date(iso.length === 10 ? `${iso}T12:00:00Z` : iso).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' }) : '—');
const todayIso = () => new Date().toISOString().slice(0, 10);

export function Err({ text }: { text: string }) {
  return text ? <p role="alert" style={{ margin: '6px 0 0', color: BAD, fontSize: 12.5, fontWeight: 600 }}>{text}</p> : null;
}

/** A small form runner: busy flag, the refusal, and a reload after success. */
function useAct(accountId: string, reload: () => void) {
  const [busy, setBusy] = useState('');
  const [error, setError] = useState<{ key: string; text: string } | null>(null);
  const act = useCallback(async <T,>(key: string, action: string, extra: Record<string, unknown>, after?: (d: Answer<T>) => void) => {
    setBusy(key); setError(null);
    const d = await revApi<T>(action, { accountId, ...extra });
    setBusy('');
    if (!d.success) { setError({ key, text: d.error ?? 'That did not work.' }); return false; }
    after?.(d);
    reload();
    return true;
  }, [accountId, reload]);
  return { busy, error, act, errorFor: (key: string) => (error?.key === key ? error.text : '') };
}

/* ── The page ── */

export default function JobsRevenue() {
  usePageTitle('Jobs & revenue');
  const accountId = getActiveAccountId() || getSession()?.user?.accountId || '__agency__';
  return (
    <div style={{ padding: 'clamp(12px, 3vw, 28px)', maxWidth: 1180, margin: '0 auto', display: 'grid', gap: 14, minWidth: 0 }}>
      <div>
        <h1 style={{ margin: 0, fontSize: 'clamp(20px, 3vw, 26px)', fontWeight: 800, color: INK }}>Jobs &amp; revenue</h1>
        <p style={{ ...small, fontSize: 13.5, marginTop: 4 }}>Every inquiry, followed to the job and the money you collected — with where it came from, kept from the first contact.</p>
      </div>
      <Ledger accountId={accountId} />
    </div>
  );
}

export function Ledger({ accountId, ownerTools }: { accountId: string; ownerTools?: (o: Overview, reload: () => void) => ReactNode }) {
  const [o, setO] = useState<Overview | null>(null);
  const [loadErr, setLoadErr] = useState('');
  const [days, setDays] = useState(0);
  const [tab, setTab] = useState<'leads' | 'payments' | 'statements' | 'approvals' | 'calls'>('leads');
  const reload = useCallback(() => {
    void revApi<Overview>('overview', { accountId, days }).then(d => (d.success ? (setO(d), setLoadErr('')) : setLoadErr(d.error ?? 'Could not load this workspace’s jobs.')));
  }, [accountId, days]);
  useEffect(() => { reload(); }, [reload]);

  if (loadErr) return <div style={box}><Err text={loadErr} /></div>;
  if (!o) return <div style={box}><p style={small}><Loader size={13} className="spin" /> Loading…</p></div>;

  const toConfirm = o.payments.filter(p => p.verification === 'reported').length;
  const pending = o.approvals.filter(a => a.status === 'pending').length;
  const openQ = o.queries.filter(q => !q.answered_at).length;
  const tabs: { id: typeof tab; label: string; badge?: number }[] = [
    { id: 'leads', label: 'Leads & jobs' },
    { id: 'payments', label: 'Payments', badge: o.as.contractor ? toConfirm : 0 },
    { id: 'statements', label: 'Fee statements', badge: o.as.owner ? openQ : 0 },
    { id: 'approvals', label: 'Approvals', badge: o.as.contractor ? pending : 0 },
    { id: 'calls', label: 'Calls & do-not-call' },
  ];

  return (
    <div style={{ display: 'grid', gap: 14, minWidth: 0 }} data-testid="ledger">
      <AgreementLine o={o} />
      {ownerTools?.(o, reload)}
      <Metrics o={o} days={days} setDays={setDays} />
      <div role="tablist" style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
        {tabs.map(t => (
          <button key={t.id} role="tab" aria-selected={tab === t.id} onClick={() => setTab(t.id)} data-testid={`tab-${t.id}`}
            style={{ ...btn, ...(tab === t.id ? { background: INK, color: '#fff', borderColor: INK } : {}) }}>
            {t.label}{t.badge ? <span style={chip(tab === t.id ? '#fff' : '#fef3c7', WARN)}>{t.badge}</span> : null}
          </button>
        ))}
      </div>
      {tab === 'leads' && <Leads o={o} accountId={accountId} reload={reload} />}
      {tab === 'payments' && <Payments o={o} accountId={accountId} reload={reload} />}
      {tab === 'statements' && <Statements o={o} accountId={accountId} reload={reload} />}
      {tab === 'approvals' && <Approvals o={o} accountId={accountId} reload={reload} />}
      {tab === 'calls' && <Calls o={o} accountId={accountId} reload={reload} />}
    </div>
  );
}

function AgreementLine({ o }: { o: Overview }) {
  const a = o.agreement;
  if (!a) {
    return (
      <div style={{ ...box, background: '#f8fafc' }} data-testid="agreement-line">
        <p style={{ ...small, fontSize: 13 }}><b style={{ color: INK }}>No growth-service agreement is in force in this workspace.</b> You can track every lead and job here all the same; no performance fee is calculated without a signed agreement.</p>
      </div>
    );
  }
  return (
    <div style={{ ...box, background: '#f7fee7', borderColor: '#d9f99d' }} data-testid="agreement-line">
      <p style={{ margin: 0, fontSize: 13.5, color: INK, fontWeight: 700 }}>
        <ShieldCheck size={15} style={{ verticalAlign: '-3px', color: GOOD }} /> Growth service agreement: {money(a.setupCents, a.currency)} setup · {money(a.monthlyCents, a.currency)}/month · {pct(a.performanceBps)} performance fee on eligible collections
      </p>
      <p style={{ ...small, marginTop: 4 }}>
        Signed by {a.signedBy || '—'} on {day(a.signedAt)}, in force from {day(a.startsOn)}{a.endsOn ? ` to ${day(a.endsOn)}` : ''}. A job counts if it is won within {a.attributionDays} days of first contact.
        {a.exclusions.length ? ` Left out of the fee: ${a.exclusions.map(x => EXCLUSION_KINDS[x as keyof typeof EXCLUSION_KINDS] ?? x).join(', ').toLowerCase()}.` : ''} Your advertising budget and approved third-party expenses are paid separately and are not part of these fees.
      </p>
    </div>
  );
}

function Metrics({ o, days, setDays }: { o: Overview; days: number; setDays: (n: number) => void }) {
  const [explain, setExplain] = useState(false);
  const m = o.metrics, cur = o.agreement?.currency ?? 'USD';
  const tiles: { k: keyof typeof DEFINITIONS; label: string; value: string }[] = [
    { k: 'inquiries', label: 'Inquiries', value: String(m.inquiries) },
    { k: 'fromService', label: 'From the service', value: String(m.fromService) },
    { k: 'won', label: 'Jobs won', value: String(m.won) },
    { k: 'quoted', label: 'Quoted (not money)', value: money(m.quotedCents, cur) },
    { k: 'completed', label: 'Completed jobs', value: money(m.completedCents, cur) },
    { k: 'collected', label: 'Collected', value: money(m.collectedCents, cur) },
    { k: 'eligible', label: 'Eligible collections', value: money(m.eligibleCents, cur) },
    { k: 'feeApproved', label: 'Fees approved', value: money(m.feeApprovedCents, cur) },
    { k: 'feePending', label: 'Fee under review', value: money(m.feePendingCents, cur) },
  ];
  return (
    <div style={box} data-testid="metrics">
      <div style={{ display: 'flex', gap: 8, alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', marginBottom: 10 }}>
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
          {[[0, 'All time'], [30, '30 days'], [90, '90 days'], [365, '12 months']].map(([n, l]) => (
            <button key={n} onClick={() => setDays(n as number)} style={{ ...btn, padding: '5px 10px', ...(days === n ? { background: '#f1f5f9', borderColor: '#cbd5e1' } : {}) }}>{l}</button>
          ))}
        </div>
        <button style={{ ...btn, border: 'none', color: MUTED }} onClick={() => setExplain(x => !x)} aria-expanded={explain}>{explain ? <ChevronUp size={14} /> : <ChevronDown size={14} />} What these mean</button>
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 150px), 1fr))', gap: 8 }}>
        {tiles.map(t => (
          <div key={t.k} style={{ padding: 10, borderRadius: 12, background: '#f8fafc', border: `1px solid ${LINE}`, minWidth: 0 }} title={DEFINITIONS[t.k]}>
            <div style={{ fontSize: 11.5, fontWeight: 700, color: MUTED }}>{t.label}</div>
            <div style={{ fontSize: 19, fontWeight: 800, color: INK, overflowWrap: 'anywhere' }}>{t.value}</div>
            {explain && <p style={{ ...small, fontSize: 11.5, marginTop: 4 }}>{DEFINITIONS[t.k]}</p>}
          </div>
        ))}
      </div>
    </div>
  );
}

/* ── Leads ── */

const STAGE_COLOR: Record<Stage, [string, string]> = {
  inquiry: ['#f1f5f9', '#334155'], qualified: ['#e0f2fe', '#075985'], appointment: ['#ede9fe', '#5b21b6'], quoted: ['#fef3c7', '#92400e'],
  won: ['#dcfce7', '#166534'], in_progress: ['#d1fae5', '#065f46'], completed: ['#bbf7d0', '#14532d'], lost: ['#fee2e2', '#991b1b'],
};

function Leads({ o, accountId, reload }: { o: Overview; accountId: string; reload: () => void }) {
  const [filter, setFilter] = useState<Stage | 'all'>('all');
  const [adding, setAdding] = useState(false);
  const [open, setOpen] = useState<string | null>(null);
  const shown = o.leads.filter(l => filter === 'all' || l.stage === filter);
  const count = (s: Stage) => o.leads.filter(l => l.stage === s).length;
  return (
    <div style={{ display: 'grid', gap: 10, minWidth: 0 }}>
      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', alignItems: 'center' }}>
        <button style={primary} onClick={() => setAdding(a => !a)} data-testid="lead-add-open"><Plus size={14} /> Add an inquiry</button>
        <select aria-label="Show stage" style={{ ...input, width: 'auto' }} value={filter} onChange={e => setFilter(e.target.value as Stage | 'all')}>
          <option value="all">Every stage ({o.leads.length})</option>
          {STAGES.map(s => <option key={s} value={s}>{STAGE_INFO[s].label} ({count(s)})</option>)}
        </select>
      </div>
      {adding && <AddLead accountId={accountId} onDone={() => { setAdding(false); reload(); }} />}
      {!shown.length && <div style={box}><p style={small}>{o.leads.length ? 'No leads at this stage.' : 'No leads yet. Add the first inquiry — where it came from is kept from the start.'}</p></div>}
      {shown.map(l => (
        <div key={l.id} style={{ ...box, padding: 0 }} data-lead={l.id}>
          <button onClick={() => setOpen(x => (x === l.id ? null : l.id))} aria-expanded={open === l.id}
            style={{ all: 'unset', boxSizing: 'border-box', cursor: 'pointer', width: '100%', padding: 14, display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
            <span style={{ fontWeight: 800, color: INK, fontSize: 14, minWidth: 0, overflowWrap: 'anywhere' }}>{l.name}</span>
            <span style={chip(...STAGE_COLOR[l.stage])}>{STAGE_INFO[l.stage].label}</span>
            {l.byService ? <span style={chip('#f7fee7', '#3f6212')}>From the service</span> : <span style={chip('#f1f5f9', MUTED)}>Your source</span>}
            {l.existingCustomer && <span style={chip('#fef3c7', WARN)}>Existing customer</span>}
            <span style={{ marginLeft: 'auto', fontSize: 12.5, color: MUTED }}>
              {l.service ? `${l.service} · ` : ''}{l.quoteCents != null ? `quoted ${money(l.quoteCents)} · ` : ''}collected {money(l.collectedCents ?? 0)}
            </span>
          </button>
          {open === l.id && <LeadDetail id={l.id} o={o} accountId={accountId} reload={reload} />}
        </div>
      ))}
    </div>
  );
}

function AddLead({ accountId, onDone }: { accountId: string; onDone: () => void }) {
  const [f, setF] = useState({ name: '', phone: '', email: '', service: '', channel: '', channelDetail: '', firstTouchOn: todayIso(), consent: 'inquiry', timezone: Intl.DateTimeFormat().resolvedOptions().timeZone, quote: '' });
  const [idem] = useState(() => `lead-${crypto.randomUUID()}`);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const zones = useMemo(() => allZones(f.timezone), [f.timezone]);
  const set = (k: keyof typeof f) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => setF(x => ({ ...x, [k]: e.target.value }));
  async function save(e: React.FormEvent) {
    e.preventDefault(); setBusy(true); setErr('');
    const d = await revApi('lead_create', { accountId, idem, lead: f });
    setBusy(false);
    if (!d.success) { setErr(d.error ?? 'That could not be saved.'); return; }
    onDone();
  }
  return (
    <form style={box} onSubmit={e => void save(e)} noValidate data-testid="lead-form">
      <h3 style={{ margin: '0 0 10px', fontSize: 14.5, color: INK }}>A new inquiry</h3>
      <div style={grid}>
        <label style={label}>Name<input style={input} data-field="lead.name" value={f.name} onChange={set('name')} /></label>
        <label style={label}>Phone<input style={input} data-field="lead.phone" value={f.phone} onChange={set('phone')} inputMode="tel" /></label>
        <label style={label}>Email<input style={input} data-field="lead.email" value={f.email} onChange={set('email')} type="email" /></label>
        <label style={label}>What they need<input style={input} value={f.service} onChange={set('service')} placeholder="AC replacement, roof inspection…" /></label>
        <label style={label}>Where they first came from
          <select style={input} data-field="lead.channel" value={f.channel} onChange={set('channel')}>
            <option value="">Choose…</option>
            {Object.entries(CHANNELS).map(([k, c]) => <option key={k} value={k}>{c.label}</option>)}
          </select>
        </label>
        <label style={label}>Campaign, list or referrer <i style={{ fontWeight: 500 }}>(optional)</i><input style={input} value={f.channelDetail} onChange={set('channelDetail')} /></label>
        <label style={label}>First contact<input style={input} type="date" data-field="lead.firstTouchOn" value={f.firstTouchOn} max={todayIso()} onChange={set('firstTouchOn')} /></label>
        <label style={label}>Consent to call
          <select style={input} data-field="lead.consent" value={f.consent} onChange={set('consent')}>{Object.entries(CONSENTS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select>
        </label>
        <label style={label}>Their time zone
          <select style={input} data-field="lead.timezone" value={f.timezone} onChange={set('timezone')}>{zones.map(z => <option key={z} value={z}>{z}</option>)}</select>
        </label>
        <label style={label}>Quote, if one is out <i style={{ fontWeight: 500 }}>(not money)</i><input style={input} data-field="lead.quote" value={f.quote} onChange={set('quote')} inputMode="decimal" placeholder="4,500" /></label>
      </div>
      <p style={{ ...small, marginTop: 8 }}>Where a lead first came from is kept as it was recorded. Only leads from the agreed service’s own work can ever carry a fee.</p>
      <Err text={err} />
      <div style={{ display: 'flex', gap: 8, marginTop: 10 }}>
        <button type="submit" style={primary} disabled={busy} data-testid="lead-save">{busy ? <Loader size={13} className="spin" /> : <Check size={13} />} Save the inquiry</button>
        <button type="button" style={btn} onClick={onDone}>Cancel</button>
      </div>
    </form>
  );
}

interface Detail { lead: Lead; payments: Payment[]; events: { kind: string; detail: Record<string, unknown>; byEmail: string; byRole: string; at: string }[]; calls: Call[] }

const EVENT_WORDS: Record<string, (d: Record<string, unknown>) => string> = {
  created: d => `Recorded — first contact ${CHANNELS[d.channel as keyof typeof CHANNELS]?.label.toLowerCase() ?? d.channel}${d.agreementId ? ', under the agreement' : ''}`,
  stage: d => `Moved from ${STAGE_INFO[d.from as Stage]?.label ?? d.from} to ${STAGE_INFO[d.to as Stage]?.label ?? d.to}${d.reason ? ` — “${d.reason}”` : ''}`,
  completed: d => `Confirmed complete, final amount ${money(Number(d.finalCents))}`,
  invoiced: d => `Invoiced ${money(Number(d.amountCents))}${d.reference ? ` (${d.reference})` : ''}`,
  edited: d => `Edited: ${Object.keys(d).join(', ').replace(/_cents/g, '').replace(/_/g, ' ')}`,
  existing_customer: d => `${d.value ? 'Marked' : 'Unmarked'} as an existing customer — “${d.reason}”`,
  attribution: d => `Attribution changed to ${d.to ? 'from the service' : 'your own source'} — “${d.reason}”`,
  payment: d => `Payment of ${money(Number(d.amountCents))} received ${d.receivedOn} — ${d.verification === 'reported' ? 'reported, waiting for confirmation' : 'confirmed'}`,
  refund: d => `Refund of ${money(Number(d.amountCents))} on ${d.receivedOn}`,
  chargeback: d => `Chargeback of ${money(Number(d.amountCents))} on ${d.receivedOn}`,
  payment_confirmed: d => `Payment of ${money(Number(d.amountCents))} confirmed`,
  payment_voided: d => `A payment was voided — “${d.reason}”`,
  payment_disputed: d => `A payment was ${d.value ? 'marked disputed' : 'cleared of its dispute'} — “${d.reason}”`,
  call: d => `Call logged: ${String(d.outcome).replace(/_/g, ' ')}`,
};

function LeadDetail({ id, o, accountId, reload }: { id: string; o: Overview; accountId: string; reload: () => void }) {
  const [d, setD] = useState<Detail | null>(null);
  const load = useCallback(() => { void revApi<Detail>('lead_get', { accountId, id }).then(x => x.success && setD(x)); }, [accountId, id]);
  useEffect(() => { load(); }, [load]);
  const both = useCallback(() => { load(); reload(); }, [load, reload]);
  const { busy, act, errorFor } = useAct(accountId, both);
  const [to, setTo] = useState<Stage | ''>('');
  const [reason, setReason] = useState('');
  const [finalAmt, setFinalAmt] = useState('');
  const [inv, setInv] = useState({ amount: '', reference: '' });
  const [pay, setPay] = useState({ kind: 'payment', amount: '', excluded: '', receivedOn: todayIso(), method: 'card', reference: '' });
  const [payIdem, setPayIdem] = useState(() => `pay-${crypto.randomUUID()}`);
  const [why, setWhy] = useState('');
  if (!d) return <div style={{ padding: '0 14px 14px' }}><p style={small}><Loader size={13} className="spin" /> Loading…</p></div>;
  const l = d.lead;
  const canComplete = o.as.contractor && (l.stage === 'won' || l.stage === 'in_progress');
  const sec: React.CSSProperties = { borderTop: `1px solid ${LINE}`, padding: 14, display: 'grid', gap: 8, minWidth: 0 };
  return (
    <div data-testid="lead-detail">
      <div style={sec}>
        <div style={grid}>
          <p style={small}><b style={{ color: INK }}>First contact</b><br />{day(l.firstTouchAt)} — {CHANNELS[l.channel]?.label}{l.channelDetail ? ` (${l.channelDetail})` : ''}</p>
          <p style={small}><b style={{ color: INK }}>Reach them</b><br />{[l.phone, l.email].filter(Boolean).join(' · ') || '—'}{l.timezone ? ` · ${l.timezone}` : ''}</p>
          <p style={small}><b style={{ color: INK }}>Amounts</b><br />Quote {l.quoteCents != null ? money(l.quoteCents) : '—'} · Final {l.finalCents != null ? money(l.finalCents) : '—'} · Invoiced {l.invoicedCents != null ? money(l.invoicedCents) : '—'}</p>
          <p style={small}><b style={{ color: INK }}>Fee</b><br />{!l.agreementId ? 'Came in outside an agreement — no fee.' : !l.byService ? 'Your own source — no fee.' : l.existingCustomer ? 'Existing customer — no fee.' : !l.completedAt ? 'Counts only once won and confirmed complete.' : 'Confirmed payments on this job count toward the fee.'}</p>
        </div>
      </div>

      <div style={sec}>
        <b style={{ fontSize: 13, color: INK }}>Move it on</b>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'flex-end' }}>
          <label style={{ ...label, flex: '1 1 160px' }}>Stage
            <select style={input} data-field="lead.stage" value={to} onChange={e => setTo(e.target.value as Stage)}>
              <option value="">Choose…</option>
              {STAGES.filter(s => s !== 'completed' && s !== l.stage).map(s => <option key={s} value={s}>{STAGE_INFO[s].label}</option>)}
            </select>
          </label>
          <label style={{ ...label, flex: '2 1 200px' }}>Reason <i style={{ fontWeight: 500 }}>(needed to go back or mark lost)</i><input style={input} data-field="lead.reason" value={reason} onChange={e => setReason(e.target.value)} /></label>
          <button style={btn} disabled={!to || busy === 'stage'} onClick={() => void act('stage', 'stage', { id, to, reason }, () => { setTo(''); setReason(''); })} data-testid="stage-move">Move</button>
        </div>
        {to && <p style={small}>{STAGE_INFO[to].means}</p>}
        <Err text={errorFor('stage')} />
        {canComplete && (
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'flex-end', marginTop: 6 }}>
            <label style={{ ...label, flex: '1 1 180px' }}>Final amount of the job<input style={input} data-field="lead.final" value={finalAmt} onChange={e => setFinalAmt(e.target.value)} inputMode="decimal" placeholder="6,000" /></label>
            <button style={primary} disabled={busy === 'complete'} onClick={() => void act('complete', 'confirm_completion', { id, finalAmount: finalAmt })} data-testid="confirm-complete"><Check size={13} /> I confirm the job is complete</button>
          </div>
        )}
        {!o.as.contractor && (l.stage === 'won' || l.stage === 'in_progress') && <p style={small}>The contractor confirms the job complete and its final amount — the service team cannot.</p>}
        <Err text={errorFor('complete')} />
        {o.as.contractor && ['won', 'in_progress', 'completed'].includes(l.stage) && (
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'flex-end' }}>
            <label style={{ ...label, flex: '1 1 140px' }}>Invoice amount<input style={input} data-field="lead.invoiceAmount" value={inv.amount} onChange={e => setInv(x => ({ ...x, amount: e.target.value }))} inputMode="decimal" /></label>
            <label style={{ ...label, flex: '1 1 140px' }}>Invoice number<input style={input} value={inv.reference} onChange={e => setInv(x => ({ ...x, reference: e.target.value }))} /></label>
            <button style={btn} disabled={busy === 'invoice'} onClick={() => void act('invoice', 'invoice', { id, ...inv })}><FileText size={13} /> Record the invoice</button>
          </div>
        )}
        <Err text={errorFor('invoice')} />
      </div>

      <div style={sec}>
        <b style={{ fontSize: 13, color: INK }}>Money on this job</b>
        {!d.payments.length && <p style={small}>Nothing recorded yet.</p>}
        {d.payments.map(p => (
          <div key={p.id} style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center', fontSize: 13, opacity: p.void ? 0.5 : 1 }} data-payment={p.id}>
            <b style={{ color: p.kind === 'payment' ? INK : BAD }}>{p.kind === 'payment' ? '' : '−'}{money(p.amountCents)}</b>
            <span style={{ color: MUTED }}>{p.kind} · {day(p.receivedOn)} · {p.method}{p.excludedCents ? ` · ${money(p.excludedCents)} excluded` : ''}</span>
            <span style={chip(p.verification === 'reported' ? '#fef3c7' : '#dcfce7', p.verification === 'reported' ? WARN : GOOD)} title={VERIFICATION_INFO[p.verification]}>{p.verification === 'reported' ? 'Waiting for confirmation' : p.verification === 'integration_verified' ? 'Integration-verified' : 'Confirmed by contractor'}</span>
            {p.disputed && <span style={chip('#fee2e2', BAD)}>Disputed</span>}
            {p.void && <span style={chip('#f1f5f9', MUTED)}>Void</span>}
            {p.statementId && <span style={chip('#e0f2fe', '#075985')}>On an approved statement</span>}
          </div>
        ))}
        <div style={{ ...grid, marginTop: 4 }}>
          <label style={label}>Kind<select style={input} data-field="pay.kind" value={pay.kind} onChange={e => setPay(x => ({ ...x, kind: e.target.value }))}><option value="payment">Payment received</option><option value="refund">Refund given</option><option value="chargeback">Chargeback</option></select></label>
          <label style={label}>Amount<input style={input} data-field="pay.amount" value={pay.amount} onChange={e => setPay(x => ({ ...x, amount: e.target.value }))} inputMode="decimal" /></label>
          <label style={label}>Of which tax, permits… <i style={{ fontWeight: 500 }}>(left out of the fee)</i><input style={input} data-field="pay.excluded" value={pay.excluded} onChange={e => setPay(x => ({ ...x, excluded: e.target.value }))} inputMode="decimal" placeholder="0" /></label>
          <label style={label}>Date<input style={input} type="date" data-field="pay.receivedOn" value={pay.receivedOn} max={todayIso()} onChange={e => setPay(x => ({ ...x, receivedOn: e.target.value }))} /></label>
          <label style={label}>How<select style={input} value={pay.method} onChange={e => setPay(x => ({ ...x, method: e.target.value }))}>{METHODS.map(m => <option key={m} value={m}>{m}</option>)}</select></label>
          <label style={label}>Reference<input style={input} value={pay.reference} onChange={e => setPay(x => ({ ...x, reference: e.target.value }))} /></label>
        </div>
        <p style={small}>{o.as.contractor ? 'What you record here counts as confirmed by you.' : 'What the service team records waits for the contractor to confirm it, and counts toward a fee only then.'} No payment integration is connected, so nothing here is verified automatically.</p>
        <div><button style={btn} disabled={busy === 'pay'} onClick={() => void act('pay', 'payment_add', { leadId: id, idem: payIdem, ...pay }, () => { setPay(x => ({ ...x, amount: '', excluded: '', reference: '' })); setPayIdem(`pay-${crypto.randomUUID()}`); })} data-testid="pay-add"><Plus size={13} /> Record it</button></div>
        <Err text={errorFor('pay')} />
      </div>

      <div style={sec}>
        <b style={{ fontSize: 13, color: INK }}>Attribution</b>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'flex-end' }}>
          <label style={{ ...label, flex: '2 1 220px' }}>Reason<input style={input} data-field="lead.reason lead.attribution" value={why} onChange={e => setWhy(e.target.value)} placeholder="Kept with the lead, visible to both sides" /></label>
          {o.as.contractor && !l.existingCustomer && <button style={btn} disabled={busy === 'existing'} onClick={() => void act('existing', 'existing_customer', { id, value: true, reason: why }, () => setWhy(''))}>They were already my customer</button>}
          {l.existingCustomer && <button style={btn} disabled={busy === 'existing'} onClick={() => void act('existing', 'existing_customer', { id, value: false, reason: why }, () => setWhy(''))}><Undo2 size={13} /> Not an existing customer</button>}
          {o.as.owner && <button style={btn} disabled={busy === 'existing'} onClick={() => void act('existing', 'attribution_fix', { id, byService: !l.byService, reason: why }, () => setWhy(''))}>Correct to {l.byService ? 'their own source' : 'from the service'}</button>}
        </div>
        <Err text={errorFor('existing')} />
      </div>

      <div style={sec}>
        <b style={{ fontSize: 13, color: INK }}>History</b>
        <ol style={{ margin: 0, paddingLeft: 18, display: 'grid', gap: 4 }} data-testid="lead-history">
          {d.events.map((e, i) => (
            <li key={i} style={{ fontSize: 12.5, color: '#334155' }}>
              {(EVENT_WORDS[e.kind] ?? (() => e.kind.replace(/_/g, ' ')))(e.detail)} <span style={{ color: MUTED }}>— {e.byEmail} ({e.byRole}), {new Date(e.at).toLocaleString()}</span>
            </li>
          ))}
        </ol>
      </div>
    </div>
  );
}

/* ── Payments ── */

function Payments({ o, accountId, reload }: { o: Overview; accountId: string; reload: () => void }) {
  const { busy, act, errorFor } = useAct(accountId, reload);
  const [reason, setReason] = useState<Record<string, string>>({});
  const name = (lid: string) => o.leads.find(l => l.id === lid)?.name ?? '—';
  const waiting = o.payments.filter(p => p.verification === 'reported');
  return (
    <div style={{ display: 'grid', gap: 10, minWidth: 0 }}>
      <div style={box}>
        <h3 style={{ margin: '0 0 6px', fontSize: 14.5, color: INK }}>Waiting for {o.as.contractor ? 'your' : 'the contractor’s'} confirmation</h3>
        <p style={small}>Payments the service team reported. None counts toward a fee until {o.as.contractor ? 'you confirm' : 'the contractor confirms'} the money arrived.</p>
        {!waiting.length && <p style={{ ...small, marginTop: 8 }}>Nothing is waiting.</p>}
        {waiting.map(p => (
          <div key={p.id} style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center', marginTop: 10, fontSize: 13 }} data-waiting={p.id}>
            <b>{money(p.amountCents)}</b><span style={{ color: MUTED }}>{name(p.leadId)} · {p.kind} · {day(p.receivedOn)} · reported by {p.recordedBy}</span>
            {o.as.contractor && <button style={primary} disabled={busy === p.id} onClick={() => void act(p.id, 'payment_confirm', { id: p.id })} data-testid="pay-confirm"><Check size={13} /> Confirm received</button>}
            <input style={{ ...input, width: 200 }} data-field="pay.reason" placeholder="Reason, to void" value={reason[p.id] ?? ''} onChange={e => setReason(r => ({ ...r, [p.id]: e.target.value }))} />
            <button style={btn} disabled={busy === p.id} onClick={() => void act(p.id, 'payment_void', { id: p.id, reason: reason[p.id] ?? '' })}>{o.as.contractor ? 'Not received — void' : 'Withdraw'}</button>
            <Err text={errorFor(p.id)} />
          </div>
        ))}
      </div>
      <div style={box}>
        <h3 style={{ margin: '0 0 8px', fontSize: 14.5, color: INK }}>Every payment, refund and chargeback</h3>
        {!o.payments.length && <p style={small}>None yet. Record money on a job from its card under Leads &amp; jobs.</p>}
        {o.payments.map(p => (
          <div key={p.id} style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center', padding: '6px 0', borderTop: `1px solid ${LINE}`, fontSize: 13 }}>
            <b style={{ color: p.kind === 'payment' ? INK : BAD }}>{p.kind === 'payment' ? '' : '−'}{money(p.amountCents)}</b>
            <span style={{ color: MUTED, minWidth: 0, overflowWrap: 'anywhere' }}>{name(p.leadId)} · {p.kind} · {day(p.receivedOn)}{p.excludedCents ? ` · ${money(p.excludedCents)} excluded` : ''}</span>
            <span style={chip(p.verification === 'reported' ? '#fef3c7' : '#dcfce7', p.verification === 'reported' ? WARN : GOOD)}>{p.verification === 'reported' ? 'Waiting' : 'Confirmed'}</span>
            {p.disputed && <span style={chip('#fee2e2', BAD)}>Disputed</span>}
            {p.statementId ? <span style={chip('#e0f2fe', '#075985')}>Counted</span> : p.verification !== 'reported' && (
              <>
                <input style={{ ...input, width: 180 }} data-field="pay.reason" placeholder="Reason" value={reason[p.id] ?? ''} onChange={e => setReason(r => ({ ...r, [p.id]: e.target.value }))} />
                <button style={btn} disabled={busy === p.id} onClick={() => void act(p.id, 'payment_dispute', { id: p.id, value: !p.disputed, reason: reason[p.id] ?? '' })}>{p.disputed ? 'Resolve dispute' : 'Mark disputed'}</button>
                <Err text={errorFor(p.id)} />
              </>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

/* ── Statements ── */

function Statements({ o, accountId, reload }: { o: Overview; accountId: string; reload: () => void }) {
  const { busy, act, errorFor } = useAct(accountId, reload);
  const [periodEnd, setPeriodEnd] = useState(() => { const t = todayIso(); return monthEnd(t) <= t ? monthEnd(t) : t; });
  const [ask, setAsk] = useState<Record<string, string>>({});
  const [answer, setAnswer] = useState<Record<string, string>>({});
  const [open, setOpen] = useState<string | null>(o.statements[0]?.id ?? null);
  return (
    <div style={{ display: 'grid', gap: 10, minWidth: 0 }}>
      <div style={box}>
        <p style={small}>A statement lists every confirmed payment on a qualifying job not yet counted, less refunds, chargebacks and agreed exclusions. {o.as.owner ? 'You' : 'The owner'} calculate{o.as.owner ? '' : 's'} it, {o.as.owner ? 'send' : 'sends'} it {o.as.owner ? 'to the contractor' : 'to you'} to check, and approve{o.as.owner ? '' : 's'} it only after that. Nothing here charges a card; an approved fee is invoiced separately.</p>
        {o.as.owner && (
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'flex-end', marginTop: 10 }}>
            <label style={{ ...label, flex: '0 1 200px' }}>Closes on<input style={input} type="date" data-field="statement.periodEnd" value={periodEnd} max={todayIso()} onChange={e => setPeriodEnd(e.target.value)} /></label>
            <button style={primary} disabled={busy === 'compute'} onClick={() => void act('compute', 'statement_compute', { periodEnd })} data-testid="stmt-compute">Calculate the statement</button>
          </div>
        )}
        <Err text={errorFor('compute')} />
      </div>
      {!o.statements.length && <div style={box}><p style={small}>No statements yet.</p></div>}
      {o.statements.map(s => {
        const qs = o.queries.filter(q => q.statement_id === s.id);
        return (
          <div key={s.id} style={box} data-statement={s.id}>
            <button onClick={() => setOpen(x => (x === s.id ? null : s.id))} style={{ all: 'unset', cursor: 'pointer', display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'center', width: '100%' }} aria-expanded={open === s.id}>
              <b style={{ color: INK }}>{s.label}</b>
              <span style={chip(s.status === 'approved' ? '#dcfce7' : s.status === 'review' ? '#fef3c7' : '#f1f5f9', s.status === 'approved' ? GOOD : s.status === 'review' ? WARN : MUTED)}>{s.status === 'review' ? 'With the contractor' : s.status === 'draft' ? 'Draft' : 'Approved'}</span>
              <span style={{ marginLeft: 'auto', fontSize: 13, color: INK }}>Net {money(s.netCents, s.currency)} × {pct(s.bps)} = <b data-testid="stmt-fee">{money(s.feeCents, s.currency)}</b></span>
            </button>
            {open === s.id && (
              <div style={{ display: 'grid', gap: 8, marginTop: 10 }}>
                <p style={small}>Closes {day(s.periodEnd)}. Collected {money(s.grossCents)} − excluded {money(s.excludedCents)} − refunds and chargebacks {money(s.refundsCents)}{s.carriedCents ? ` − carried from the last statement ${money(-s.carriedCents)}` : ''} = net {money(s.netCents)}.{s.carryOutCents ? ` The negative balance of ${money(-s.carryOutCents)} comes off the next statement.` : ''}</p>
                <b style={{ fontSize: 12.5, color: INK }}>Counted ({s.lines.length})</b>
                {s.lines.map(x => (
                  <div key={x.paymentId} style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center', fontSize: 12.5 }} data-line={x.paymentId}>
                    <span style={{ minWidth: 0, overflowWrap: 'anywhere' }}>{x.lead} · {x.kind} · {day(x.receivedOn)} · {money(x.amountCents)}{x.excludedCents ? ` − ${money(x.excludedCents)} excluded` : ''}</span>
                    <b style={{ marginLeft: 'auto', color: x.netCents < 0 ? BAD : INK }}>{money(x.netCents)}</b>
                    {o.as.contractor && s.status === 'review' && <button style={{ ...btn, padding: '3px 8px' }} onClick={() => setAsk(a => ({ ...a, [s.id]: a[s.id] ?? `About ${x.lead}, ${money(x.amountCents)} on ${x.receivedOn}: ` }))}>Ask about this</button>}
                  </div>
                ))}
                {!!s.notCounted.length && <b style={{ fontSize: 12.5, color: INK }}>Not counted ({s.notCounted.length})</b>}
                {s.notCounted.map(x => (
                  <p key={x.paymentId} style={{ ...small, fontSize: 12.5 }}>{x.lead} · {x.kind} · {money(x.amountCents)} — <span style={{ color: x.held ? WARN : MUTED }}>{x.held ? 'held: ' : 'left out: '}{x.why}</span></p>
                ))}
                {qs.map(q => (
                  <div key={q.id} style={{ padding: 10, borderRadius: 10, background: '#f8fafc', fontSize: 12.5 }} data-query={q.id}>
                    <p style={{ margin: 0 }}><b>Question</b> from {q.by_email}: {q.body}</p>
                    {q.answered_at ? <p style={{ margin: '4px 0 0' }}><b>Answer:</b> {q.answer}</p> : o.as.owner ? (
                      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginTop: 6 }}>
                        <input style={{ ...input, flex: '1 1 200px', width: 'auto' }} data-field="query.answer" value={answer[q.id] ?? ''} onChange={e => setAnswer(a => ({ ...a, [q.id]: e.target.value }))} placeholder="Your answer" />
                        <button style={btn} disabled={busy === q.id} onClick={() => void act(q.id, 'query_answer', { id: q.id, body: answer[q.id] ?? '' })}>Answer</button>
                        <Err text={errorFor(q.id)} />
                      </div>
                    ) : <p style={{ margin: '4px 0 0', color: WARN }}>Waiting for an answer.</p>}
                  </div>
                ))}
                {o.as.contractor && s.status === 'review' && (
                  <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', alignItems: 'flex-end' }}>
                    <label style={{ ...label, flex: '1 1 240px' }}>A question about this statement<input style={input} data-field="query.body" value={ask[s.id] ?? ''} onChange={e => setAsk(a => ({ ...a, [s.id]: e.target.value }))} /></label>
                    <button style={btn} disabled={busy === `q${s.id}`} onClick={() => void act(`q${s.id}`, 'query_add', { statementId: s.id, body: ask[s.id] ?? '' }, () => setAsk(a => ({ ...a, [s.id]: '' })))} data-testid="query-send">Send the question</button>
                    <Err text={errorFor(`q${s.id}`)} />
                  </div>
                )}
                {o.as.owner && s.status !== 'approved' && (
                  <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                    {s.status === 'draft' && <button style={primary} disabled={busy === s.id} onClick={() => void act(s.id, 'statement_send', { id: s.id })} data-testid="stmt-send">Send to the contractor to review</button>}
                    {s.status === 'review' && <button style={primary} disabled={busy === s.id} onClick={() => void act(s.id, 'statement_approve', { id: s.id })} data-testid="stmt-approve"><Check size={13} /> Approve the fee</button>}
                    {s.status === 'review' && <button style={btn} disabled={busy === s.id} onClick={() => void act(s.id, 'statement_reopen', { id: s.id })}>Take back to draft</button>}
                    <button style={btn} disabled={busy === s.id} onClick={() => void act(s.id, 'statement_void', { id: s.id })}>Void</button>
                  </div>
                )}
                <Err text={errorFor(s.id)} />
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

/* ── Approvals ── */

function Approvals({ o, accountId, reload }: { o: Overview; accountId: string; reload: () => void }) {
  const { busy, act, errorFor } = useAct(accountId, reload);
  const [f, setF] = useState({ kind: 'call_script', title: '', body: '', amount: '' });
  const [note, setNote] = useState<Record<string, string>>({});
  return (
    <div style={{ display: 'grid', gap: 10, minWidth: 0 }}>
      <div style={box}>
        <p style={small}>Call scripts, advertising budgets, third-party expenses and campaigns are agreed before they happen. No call is logged without an approved script, and an advertising budget or third-party expense is paid by the contractor directly — never part of the service’s fees.</p>
      </div>
      {o.as.owner && (
        <div style={box}>
          <h3 style={{ margin: '0 0 10px', fontSize: 14.5, color: INK }}>Ask the contractor to approve</h3>
          <div style={grid}>
            <label style={label}>What<select style={input} data-field="approval.kind" value={f.kind} onChange={e => setF(x => ({ ...x, kind: e.target.value }))}>{Object.entries(APPROVAL_KINDS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select></label>
            <label style={label}>Title<input style={input} data-field="approval.title" value={f.title} onChange={e => setF(x => ({ ...x, title: e.target.value }))} /></label>
            {(f.kind === 'ad_budget' || f.kind === 'third_party_expense') && <label style={label}>Amount<input style={input} data-field="approval.amount" value={f.amount} onChange={e => setF(x => ({ ...x, amount: e.target.value }))} inputMode="decimal" /></label>}
          </div>
          <label style={{ ...label, marginTop: 10 }}>{f.kind === 'call_script' ? 'The script' : 'Details'}<textarea style={{ ...input, minHeight: 90 }} data-field="approval.body" value={f.body} onChange={e => setF(x => ({ ...x, body: e.target.value }))} /></label>
          <div style={{ marginTop: 10 }}><button style={primary} disabled={busy === 'req'} onClick={() => void act('req', 'approval_request', f, () => setF({ kind: f.kind, title: '', body: '', amount: '' }))} data-testid="approval-request">Send for approval</button></div>
          <Err text={errorFor('req')} />
        </div>
      )}
      {!o.approvals.length && <div style={box}><p style={small}>Nothing has been asked for yet.</p></div>}
      {o.approvals.map(a => (
        <div key={a.id} style={box} data-approval={a.id}>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
            <b style={{ color: INK }}>{a.title}</b><span style={chip('#f1f5f9', '#334155')}>{APPROVAL_KINDS[a.kind]}</span>
            {a.amount_cents != null && <b>{money(a.amount_cents)}</b>}
            <span style={chip(a.status === 'approved' ? '#dcfce7' : a.status === 'pending' ? '#fef3c7' : '#f1f5f9', a.status === 'approved' ? GOOD : a.status === 'pending' ? WARN : MUTED)}>{a.status}</span>
          </div>
          {a.body && <p style={{ ...small, whiteSpace: 'pre-wrap', marginTop: 6, color: '#334155' }}>{a.body}</p>}
          {a.decided_at && <p style={{ ...small, marginTop: 6 }}>{a.status} by {a.decided_by} on {day(a.decided_at)}{a.decision_note ? ` — “${a.decision_note}”` : ''}</p>}
          {a.status === 'pending' && o.as.contractor && (
            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginTop: 8 }} data-field="approval.decision">
              <input style={{ ...input, flex: '1 1 200px', width: 'auto' }} placeholder="A note (optional)" value={note[a.id] ?? ''} onChange={e => setNote(n => ({ ...n, [a.id]: e.target.value }))} />
              <button style={primary} disabled={busy === a.id} onClick={() => void act(a.id, 'approval_decide', { id: a.id, decision: 'approved', note: note[a.id] ?? '' })} data-testid="approval-approve"><Check size={13} /> Approve</button>
              <button style={btn} disabled={busy === a.id} onClick={() => void act(a.id, 'approval_decide', { id: a.id, decision: 'declined', note: note[a.id] ?? '' })}>Decline</button>
            </div>
          )}
          {(a.status === 'pending' || a.status === 'approved') && o.as.owner && <div style={{ marginTop: 8 }}><button style={btn} disabled={busy === a.id} onClick={() => void act(a.id, 'approval_withdraw', { id: a.id })}>Withdraw</button></div>}
          <Err text={errorFor(a.id)} />
        </div>
      ))}
    </div>
  );
}

/* ── Calls ── */

function Calls({ o, accountId, reload }: { o: Overview; accountId: string; reload: () => void }) {
  const { busy, act, errorFor } = useAct(accountId, reload);
  const [dnc, setDnc] = useState({ phone: '', reason: '' });
  const [c, setC] = useState({ leadId: '', phone: '', timezone: Intl.DateTimeFormat().resolvedOptions().timeZone, consent: '', scriptId: '', outcome: '', notes: '' });
  const [check, setCheck] = useState<{ allowed: boolean; checks: { key: string; ok: boolean; says: string }[]; scripts: { id: string; title: string }[] } | null>(null);
  const [checkErr, setCheckErr] = useState('');
  const zones = useMemo(() => allZones(c.timezone), [c.timezone]);
  async function runCheck() {
    setCheckErr('');
    const d = await revApi<{ allowed: boolean; checks: { key: string; ok: boolean; says: string }[]; scripts: { id: string; title: string }[] }>('call_check', { accountId, ...c });
    if (!d.success) { setCheckErr(d.error ?? 'Could not check.'); return; }
    setCheck(d);
    if (!c.scriptId && d.scripts[0]) setC(x => ({ ...x, scriptId: d.scripts[0].id }));
  }
  const lead = o.leads.find(l => l.id === c.leadId);
  return (
    <div style={{ display: 'grid', gap: 10, minWidth: 0 }}>
      <div style={box}>
        <p style={small}><Phone size={13} style={{ verticalAlign: '-2px' }} /> Calls are made by people on the service team — this software places none. Before a call is logged, the server checks the do-not-call list, consent, the person’s local time (08:00–21:00) and that a script is approved. The national do-not-call registry is not connected here.</p>
      </div>
      {o.as.owner && (
        <div style={box}>
          <h3 style={{ margin: '0 0 10px', fontSize: 14.5, color: INK }}>Check, then log a call</h3>
          <div style={grid}>
            <label style={label}>Lead<select style={input} value={c.leadId} onChange={e => { const l = o.leads.find(x => x.id === e.target.value); setC(x => ({ ...x, leadId: e.target.value, timezone: l?.timezone || x.timezone })); setCheck(null); }}><option value="">A number, not a lead</option>{o.leads.map(l => <option key={l.id} value={l.id}>{l.name}</option>)}</select></label>
            {!lead && <label style={label}>Phone<input style={input} data-field="call.phone" value={c.phone} onChange={e => { setC(x => ({ ...x, phone: e.target.value })); setCheck(null); }} inputMode="tel" /></label>}
            {lead && <p style={{ ...small, alignSelf: 'end' }} data-field="call.phone">{lead.phone || 'This lead has no phone number.'}</p>}
            <label style={label}>Their time zone<select style={input} value={c.timezone} onChange={e => { setC(x => ({ ...x, timezone: e.target.value })); setCheck(null); }}>{zones.map(z => <option key={z} value={z}>{z}</option>)}</select></label>
            {!lead && <label style={label}>Consent<select style={input} value={c.consent} onChange={e => { setC(x => ({ ...x, consent: e.target.value })); setCheck(null); }}><option value="">None recorded</option>{Object.entries(CONSENTS).filter(([k]) => k !== 'none').map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select></label>}
          </div>
          <div style={{ marginTop: 10 }}><button style={btn} onClick={() => void runCheck()} data-testid="call-check">Check before calling</button></div>
          <Err text={checkErr} />
          {check && (
            <div style={{ marginTop: 10, display: 'grid', gap: 4 }} data-testid="call-checks">
              {check.checks.map(x => <p key={x.key} style={{ margin: 0, fontSize: 12.5, color: x.ok ? GOOD : BAD }}>{x.ok ? <Check size={12} /> : <AlertTriangle size={12} />} {x.says}</p>)}
              {check.allowed && (
                <div style={{ ...grid, marginTop: 6 }}>
                  <label style={label}>Script used<select style={input} data-field="call.script" value={c.scriptId} onChange={e => setC(x => ({ ...x, scriptId: e.target.value }))}>{check.scripts.map(s => <option key={s.id} value={s.id}>{s.title}</option>)}</select></label>
                  <label style={label}>How it went<select style={input} data-field="call.outcome" value={c.outcome} onChange={e => setC(x => ({ ...x, outcome: e.target.value }))}><option value="">Choose…</option>{CALL_OUTCOMES.map(x => <option key={x} value={x}>{x.replace(/_/g, ' ')}</option>)}</select></label>
                  <label style={label}>Notes<input style={input} value={c.notes} onChange={e => setC(x => ({ ...x, notes: e.target.value }))} /></label>
                  <div style={{ alignSelf: 'end' }}><button style={primary} disabled={busy === 'call'} onClick={() => void act('call', 'call_log', c, () => { setCheck(null); setC(x => ({ ...x, outcome: '', notes: '' })); })} data-testid="call-log">Log the call</button></div>
                </div>
              )}
            </div>
          )}
          <Err text={errorFor('call')} />
        </div>
      )}
      <div style={box}>
        <h3 style={{ margin: '0 0 8px', fontSize: 14.5, color: INK }}>Do-not-call list ({o.dnc.length})</h3>
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', alignItems: 'flex-end' }}>
          <label style={{ ...label, flex: '1 1 160px' }}>Phone<input style={input} data-field="dnc.phone" value={dnc.phone} onChange={e => setDnc(x => ({ ...x, phone: e.target.value }))} inputMode="tel" /></label>
          <label style={{ ...label, flex: '2 1 200px' }}>Reason<input style={input} data-field="dnc.reason" value={dnc.reason} onChange={e => setDnc(x => ({ ...x, reason: e.target.value }))} /></label>
          <button style={btn} disabled={busy === 'dnc'} onClick={() => void act('dnc', 'dnc_add', dnc, () => setDnc({ phone: '', reason: '' }))} data-testid="dnc-add">Add</button>
          {o.as.contractor && <button style={btn} disabled={busy === 'dnc'} onClick={() => void act('dnc', 'dnc_remove', dnc, () => setDnc({ phone: '', reason: '' }))}>Remove</button>}
        </div>
        <Err text={errorFor('dnc')} />
        {o.dnc.map(n => <p key={n.phone} style={{ ...small, marginTop: 6 }}><b style={{ color: INK }}>{n.phone}</b> — {n.reason || 'no reason given'} · {n.added_by}, {day(n.added_at)}</p>)}
      </div>
      <div style={box}>
        <h3 style={{ margin: '0 0 8px', fontSize: 14.5, color: INK }}>Calls logged</h3>
        {!o.calls.length && <p style={small}>None yet.</p>}
        {o.calls.map(x => <p key={x.id} style={{ ...small, marginTop: 4 }}><b style={{ color: INK }}>{x.phone}</b> · {x.outcome.replace(/_/g, ' ')} · {x.by_email} · {new Date(x.called_at).toLocaleString()}{x.notes ? ` — ${x.notes}` : ''}</p>)}
      </div>
    </div>
  );
}
