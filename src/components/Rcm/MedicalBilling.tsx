/**
 * Medical billing — the claims workbench and the practice portal
 * (routes/rcm.ts, rules in worker/src/lib/rcm.ts).
 *
 * One screen, two readers:
 *   - the billing team (the install owner), on a practice's workspace: set-up,
 *     claims and coding review, the clearinghouse's and the payer's answers,
 *     remittance import and reconciliation, denials and appeals, prior
 *     authorizations, internal notes, and the launch checklist;
 *   - the practice, on its own workspace: the same claims, A/R, denials,
 *     remittances and audit, read-only, plus notes to the billing team and
 *     answers to its requests. Internal notes never reach it — the server
 *     leaves them out.
 * Which buttons show comes from what the server says this person is (`as`);
 * the server refuses the rest either way.
 *
 * Two statuses on every claim, side by side and never merged: the
 * clearinghouse's ("did the file pass its edits") and the payer's ("what the
 * insurer decided"). A claim "accepted" by a clearinghouse is not paid.
 */
import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react';
import { AlertTriangle, Check, ClipboardCheck, Download, FileText, Loader, Lock, Plus, ShieldCheck, Upload } from 'lucide-react';
import { API_BASE } from '../../services/apiBase';
import { getSession, sessionToken } from '../../services/auth';
import { getActiveAccountId } from '../../services/tenancy';
import { usePageTitle } from '../../services/pageTitle';
import {
  AGING_BUCKETS, APPEAL_STATUSES, AUTH_STATUSES, CH_STATUSES, DENIAL_CATEGORIES, DENIAL_STATUSES, LEAK_KINDS, PAYER_KINDS, PAYER_STATUSES, WORK_STATUSES,
  type Check as CodingCheck, type ChStatus, type PayerStatus, type WorkStatus,
} from '../../../worker/src/lib/rcm';
import { money } from '../../../worker/src/lib/leadRevenue';
import { BAD, Err, GOOD, INK, LINE, MUTED, WARN, box, btn, grid, input, label, primary } from '../Jobs/JobsRevenue';

/* ── Shapes the server answers ── */

interface Line { id: string; lineNo: number; code: string; modifiers: string[]; units: number; chargeCents: number; dxPointers: number[]; allowedCents: number | null; paidCents: number; patientRespCents: number; adjustCents: number; remitted: boolean }
interface Claim {
  id: string; claimNo: string; practiceId: string; providerId: string; payerId: string; patientRef: string; synthetic: boolean; serviceFrom: string; serviceTo: string;
  diagnoses: string[]; work: WorkStatus; ch: ChStatus; chReason: string; chAt: string | null; payer: PayerStatus; payerClaimNo: string; billedCents: number;
  allowedCents: number | null; paidCents: number; patientRespCents: number; adjustCents: number; closedReason: string; lines: Line[];
}
interface Denial { id: string; claimId: string; lineId: string | null; group: string; carc: string; rarc: string; category: keyof typeof DENIAL_CATEGORIES; amountCents: number; deniedOn: string; appealBy: string | null; status: keyof typeof DENIAL_STATUSES; source: string }
interface Appeal { id: string; denial_id: string; claim_id: string; level: number; status: keyof typeof APPEAL_STATUSES; submitted_on: string | null; due_on: string | null; recovered_cents: number; summary: string }
interface Payer { id: string; name: string; code: string; kind: keyof typeof PAYER_KINDS; timelyFilingDays: number | null; fees: Record<string, number>; synthetic: boolean }
interface Remit { id: string; file_name: string; checks: string; file_paid_cents: number; posted_cents: number; deposit_cents: number | null; rows_total: number; rows_posted: number; rows_unmatched: number; rows_duplicate: number; status: string; imported_at: string; synthetic: number }
interface Auth { id: string; practice_id: string; payer_id: string; patient_ref: string; code: string; units: number; status: keyof typeof AUTH_STATUSES; shown: keyof typeof AUTH_STATUSES | 'expired'; auth_no: string; due_on: string | null; valid_from: string | null; valid_to: string | null; synthetic: number }
interface Note { id: string; claim_id: string | null; auth_id: string | null; visibility: 'internal' | 'practice'; kind: 'note' | 'request'; body: string; by_email: string; by_role: string; at: string; answered_at: string | null }
interface Finding { key: string; kind: keyof typeof LEAK_KINDS; claimId: string; claimNo: string; lineNo: number; code: string; cents: number; evidence: Record<string, string | number | null> }
interface Overview {
  as: { biller: boolean; owner: boolean; practice: boolean; mine: boolean };
  settings: { mode: 'synthetic' | 'live'; baaSignedOn: string | null; codingReview: boolean; timelyFilingDays: number; appealDays: number; liveAt: string | null; liveBy: string | null };
  practices: { id: string; name: string; npi: string; specialty: string; synthetic: number }[];
  providers: { id: string; practiceId: string; name: string; npi: string; specialty: string; active: number }[];
  payers: Payer[]; claims: Claim[]; denials: Denial[]; appeals: Appeal[]; remits: Remit[]; auths: Auth[]; notes: Note[];
  aging: { buckets: Record<string, { cents: number; claims: number }>; totalCents: number; byPayer: ({ payerId: string } & Record<string, number | string>)[]; unbilledCents: number; unbilledClaims: number; patientCents: number };
  leakage: { findings: Finding[]; totals: { lost: number; at_risk: number; recoverable: number }; totalCents: number };
  blockersCleared: boolean | null;
  integrations: { clearinghouse: string; eligibility: string };
}
type Answer<T> = T & { success?: boolean; error?: string; field?: string; checks?: CodingCheck[]; code?: string };

const rcmApi = async <T,>(action: string, extra: Record<string, unknown> = {}): Promise<Answer<T>> => {
  try {
    const r = await fetch(`${API_BASE}/api/rcm.php`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ token: sessionToken(), action, ...extra }) });
    return await r.json() as Answer<T>;
  } catch {
    return { success: false, error: 'Could not reach the server. Check your connection and try again.' } as Answer<T>;
  }
};

/* ── Look ── */

const chip = (bg: string, fg: string): React.CSSProperties => ({ display: 'inline-flex', alignItems: 'center', gap: 4, padding: '2px 8px', borderRadius: 99, background: bg, color: fg, fontSize: 11.5, fontWeight: 700, whiteSpace: 'nowrap' });
const small: React.CSSProperties = { fontSize: 12, color: MUTED, lineHeight: 1.5, margin: 0 };
const h3: React.CSSProperties = { margin: '0 0 8px', fontSize: 14.5, color: INK };
const day = (iso: string | null | undefined) => (iso ? new Date(iso.length === 10 ? `${iso}T12:00:00Z` : iso).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' }) : '—');
const todayIso = () => new Date().toISOString().slice(0, 10);
const scroller: React.CSSProperties = { overflowX: 'auto', maxWidth: '100%' };
const table: React.CSSProperties = { width: '100%', borderCollapse: 'collapse', fontSize: 12.5, color: INK };
const th: React.CSSProperties = { textAlign: 'left', padding: '6px 8px', borderBottom: `1px solid ${LINE}`, color: MUTED, fontWeight: 700, whiteSpace: 'nowrap' };
const td: React.CSSProperties = { padding: '6px 8px', borderBottom: `1px solid ${LINE}`, verticalAlign: 'top' };

const CH_COLOR: Record<ChStatus, [string, string]> = { not_sent: ['#f1f5f9', '#334155'], submitted: ['#e0f2fe', '#075985'], accepted: ['#dcfce7', '#166534'], rejected: ['#fee2e2', '#991b1b'] };
const PAYER_COLOR: Partial<Record<PayerStatus, [string, string]>> = { paid: ['#bbf7d0', '#14532d'], partial: ['#fef3c7', '#92400e'], denied: ['#fee2e2', '#991b1b'], appealed: ['#ede9fe', '#5b21b6'], pended: ['#fef3c7', '#92400e'], closed: ['#e2e8f0', '#334155'] };

function Statuses({ c }: { c: Claim }) {
  return (
    <span style={{ display: 'inline-flex', gap: 6, flexWrap: 'wrap' }}>
      <span style={chip(...CH_COLOR[c.ch])} title={CH_STATUSES[c.ch].means}>Clearinghouse: {CH_STATUSES[c.ch].label}</span>
      <span style={chip(...(PAYER_COLOR[c.payer] ?? ['#f1f5f9', '#334155']))} title={PAYER_STATUSES[c.payer].means}>Payer: {PAYER_STATUSES[c.payer].label}</span>
    </span>
  );
}

/** A small form runner: busy flag, the refusal, and a reload after success. */
function useAct(accountId: string, reload: () => void) {
  const [busy, setBusy] = useState('');
  const [error, setError] = useState<{ key: string; text: string; checks?: CodingCheck[] } | null>(null);
  const act = useCallback(async <T,>(key: string, action: string, extra: Record<string, unknown>, after?: (d: Answer<T>) => void) => {
    setBusy(key); setError(null);
    const d = await rcmApi<T>(action, { accountId, ...extra });
    setBusy('');
    if (!d.success) { setError({ key, text: d.error ?? 'That did not work.', checks: d.checks }); return false; }
    after?.(d);
    reload();
    return true;
  }, [accountId, reload]);
  return { busy, act, errorFor: (key: string) => (error?.key === key ? error.text : ''), checksFor: (key: string) => (error?.key === key ? error.checks : undefined) };
}

/* ── The page ── */

export default function MedicalBilling() {
  usePageTitle('Medical billing');
  const own = getActiveAccountId() || getSession()?.user?.accountId || '__agency__';
  const [accountId, setAccountId] = useState(own);
  const [isOwner, setIsOwner] = useState(false);
  const [workspaces, setWorkspaces] = useState<{ accountId: string; email: string; name: string; mode: string | null; practices: number; claims: number; openDenials: number }[]>([]);
  const [showChecklist, setShowChecklist] = useState(false);
  useEffect(() => {
    void rcmApi<{ workspaces: typeof workspaces }>('practices_all').then(d => { if (d.success) { setIsOwner(true); setWorkspaces(d.workspaces); } });
  }, []);
  return (
    <div style={{ padding: 'clamp(12px, 3vw, 28px)', maxWidth: 1180, margin: '0 auto', display: 'grid', gap: 14, minWidth: 0 }}>
      <div style={{ display: 'flex', gap: 10, alignItems: 'flex-end', justifyContent: 'space-between', flexWrap: 'wrap' }}>
        <div style={{ minWidth: 0 }}>
          <h1 style={{ margin: 0, fontSize: 'clamp(20px, 3vw, 26px)', fontWeight: 800, color: INK }}>Medical billing</h1>
          <p style={{ ...small, fontSize: 13.5, marginTop: 4 }}>Claims from coding to cash: what the clearinghouse and the payer said, remittances posted, denials worked, and what is still owed.</p>
        </div>
        {isOwner && (
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center', minWidth: 0 }}>
            <label style={{ ...label, minWidth: 'min(100%, 260px)' }}>Practice workspace
              <select style={input} value={accountId} onChange={e => setAccountId(e.target.value)} data-testid="rcm-workspace">
                <option value={own}>Your own workspace (for test data)</option>
                {workspaces.map(w => <option key={w.accountId} value={w.accountId}>{w.name || w.email}{w.practices ? ` — ${w.claims} claims${w.mode === 'live' ? ', live' : ''}` : ''}</option>)}
              </select>
            </label>
            <button style={btn} onClick={() => setShowChecklist(s => !s)} data-testid="rcm-checklist-open"><ClipboardCheck size={14} /> Launch checklist</button>
          </div>
        )}
      </div>
      {isOwner && showChecklist && <LaunchChecklist />}
      <Workbench key={accountId} accountId={accountId} />
    </div>
  );
}

type Tab = 'claims' | 'review' | 'denials' | 'remits' | 'aging' | 'auths' | 'leakage' | 'fee' | 'messages' | 'audit' | 'setup';

function Workbench({ accountId }: { accountId: string }) {
  const [o, setO] = useState<Overview | null>(null);
  const [loadErr, setLoadErr] = useState('');
  const [tab, setTab] = useState<Tab>('claims');
  const reload = useCallback(() => {
    void rcmApi<Overview>('overview', { accountId }).then(d => (d.success ? (setO(d), setLoadErr('')) : setLoadErr(d.error ?? 'Could not load medical billing for this workspace.')));
  }, [accountId]);
  useEffect(() => { reload(); }, [reload]);

  if (loadErr) return <div style={box}><Err text={loadErr} /></div>;
  if (!o) return <div style={box}><p style={small}><Loader size={13} className="spin" /> Loading…</p></div>;

  const empty = !o.practices.length;
  const review = o.claims.filter(c => c.work === 'coding_review').length;
  const openDenials = o.denials.filter(d => d.status === 'open').length;
  const requests = o.notes.filter(n => n.kind === 'request' && !n.answered_at).length;
  const tabs: { id: Tab; label: string; badge?: number; show: boolean }[] = [
    { id: 'claims', label: 'Claims', show: true },
    { id: 'review', label: 'Coding review', badge: review, show: o.as.biller },
    { id: 'denials', label: 'Denials & appeals', badge: openDenials, show: true },
    { id: 'remits', label: 'Remittances', show: true },
    { id: 'aging', label: 'A/R aging', show: true },
    { id: 'auths', label: 'Prior auth', show: true },
    { id: 'leakage', label: 'Leakage audit', show: true },
    { id: 'fee', label: 'Fee statement', show: true },
    { id: 'messages', label: 'Messages', badge: o.as.practice ? requests : 0, show: true },
    { id: 'audit', label: 'Access log', show: true },
    { id: 'setup', label: 'Set-up', show: o.as.biller },
  ];

  return (
    <div style={{ display: 'grid', gap: 14, minWidth: 0 }} data-testid="rcm">
      <ModeBanner o={o} />
      {empty && !o.as.biller && (
        <div style={box}><p style={{ ...small, fontSize: 13 }}><b style={{ color: INK }}>Nothing is set up here.</b> Medical billing is a service we run for medical practices. If we are your billing team, your claims appear here once we have set your practice up.</p></div>
      )}
      {empty && o.as.biller && <div style={box}><p style={{ ...small, fontSize: 13 }}><b style={{ color: INK }}>No practice in this workspace yet.</b> Start under <b>Set-up</b>{o.as.owner && o.as.mine && o.settings.mode === 'synthetic' ? ', or load the synthetic test practice there to try every screen' : ''}.</p></div>}
      <Tiles o={o} />
      <div role="tablist" style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
        {tabs.filter(t => t.show).map(t => (
          <button key={t.id} role="tab" aria-selected={tab === t.id} onClick={() => setTab(t.id)} data-testid={`rcm-tab-${t.id}`}
            style={{ ...btn, ...(tab === t.id ? { background: INK, color: '#fff', borderColor: INK } : {}) }}>
            {t.label}{t.badge ? <span style={chip(tab === t.id ? '#fff' : '#fef3c7', WARN)}>{t.badge}</span> : null}
          </button>
        ))}
      </div>
      {tab === 'claims' && <Claims o={o} accountId={accountId} reload={reload} />}
      {tab === 'review' && o.as.biller && <Review o={o} accountId={accountId} reload={reload} />}
      {tab === 'denials' && <Denials o={o} accountId={accountId} reload={reload} />}
      {tab === 'remits' && <Remits o={o} accountId={accountId} reload={reload} />}
      {tab === 'aging' && <Aging o={o} />}
      {tab === 'auths' && <Auths o={o} accountId={accountId} reload={reload} />}
      {tab === 'leakage' && <Leakage o={o} />}
      {tab === 'fee' && <FeeStatementTab accountId={accountId} />}
      {tab === 'messages' && <Messages o={o} accountId={accountId} reload={reload} />}
      {tab === 'audit' && <AuditLog accountId={accountId} />}
      {tab === 'setup' && o.as.biller && <Setup o={o} accountId={accountId} reload={reload} />}
    </div>
  );
}

function ModeBanner({ o }: { o: Overview }) {
  if (o.settings.mode === 'live') {
    return (
      <div style={{ ...box, background: '#f0fdf4', borderColor: '#bbf7d0' }} data-testid="rcm-mode">
        <p style={{ margin: 0, fontSize: 13, color: INK, fontWeight: 700 }}><Lock size={14} style={{ verticalAlign: '-2px', color: GOOD }} /> Live patient data. Every view and change is logged, and 2-step sign-in is required to open it.</p>
        <p style={{ ...small, marginTop: 4 }}>Live since {day(o.settings.liveAt)}. BAA signed {day(o.settings.baaSignedOn)}. No clearinghouse or payer is connected: claims are submitted in your clearinghouse and its answers recorded here.</p>
      </div>
    );
  }
  return (
    <div style={{ ...box, background: '#fffbeb', borderColor: '#fde68a' }} data-testid="rcm-mode">
      <p style={{ margin: 0, fontSize: 13, color: '#78350f', fontWeight: 700 }}><AlertTriangle size={14} style={{ verticalAlign: '-2px' }} /> Synthetic test data only — do not enter real patient information.</p>
      <p style={{ ...small, marginTop: 4, color: '#92400e' }}>Patient references here start SYN-. Real patient data waits until the launch checklist is signed off, a BAA is in place, and 2-step sign-in is on for everyone. No clearinghouse or payer is connected.</p>
    </div>
  );
}

function Tiles({ o }: { o: Overview }) {
  const billed = o.claims.reduce((t, c) => t + c.billedCents, 0), paid = o.claims.reduce((t, c) => t + c.paidCents, 0);
  const tiles = [
    { label: 'Claims', value: String(o.claims.length), means: 'Every claim in this workspace.' },
    { label: 'Billed', value: money(billed), means: 'The practice’s charges on every claim — not what payers will pay.' },
    { label: 'Paid by payers', value: money(paid), means: 'Posted from remittances only. Nothing typed by hand counts as paid.' },
    { label: 'Payer A/R', value: money(o.aging.totalCents), means: 'What payers still owe on claims they have, after write-downs and the patient’s share.' },
    { label: 'Open denials', value: String(o.denials.filter(d => d.status === 'open').length), means: 'Denials nobody has appealed, corrected or written off.' },
    { label: 'At stake', value: money(o.leakage.totalCents), means: 'The leakage audit’s total: each line counted once, under its most serious finding.' },
  ];
  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 150px), 1fr))', gap: 8 }} data-testid="rcm-tiles">
      {tiles.map(t => (
        <div key={t.label} style={{ padding: 10, borderRadius: 12, background: '#fff', border: `1px solid ${LINE}`, minWidth: 0 }} title={t.means}>
          <div style={{ fontSize: 11.5, fontWeight: 700, color: MUTED }}>{t.label}</div>
          <div style={{ fontSize: 19, fontWeight: 800, color: INK, overflowWrap: 'anywhere' }}>{t.value}</div>
        </div>
      ))}
    </div>
  );
}

/* ── Claims ── */

function Claims({ o, accountId, reload }: { o: Overview; accountId: string; reload: () => void }) {
  const [filter, setFilter] = useState<'all' | WorkStatus>('all');
  const [adding, setAdding] = useState(false);
  const [open, setOpen] = useState<string | null>(null);
  const payer = (id: string) => o.payers.find(p => p.id === id)?.name ?? '—';
  const shown = o.claims.filter(c => filter === 'all' || c.work === filter);
  return (
    <div style={{ display: 'grid', gap: 10, minWidth: 0 }}>
      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', alignItems: 'center' }}>
        {o.as.biller && <button style={primary} onClick={() => setAdding(a => !a)} disabled={!o.practices.length} data-testid="claim-add-open"><Plus size={14} /> New claim</button>}
        <select aria-label="Show" style={{ ...input, width: 'auto' }} value={filter} onChange={e => setFilter(e.target.value as typeof filter)}>
          <option value="all">Every claim ({o.claims.length})</option>
          {(Object.keys(WORK_STATUSES) as WorkStatus[]).map(s => <option key={s} value={s}>{WORK_STATUSES[s]} ({o.claims.filter(c => c.work === s).length})</option>)}
        </select>
      </div>
      {adding && <ClaimForm o={o} accountId={accountId} onDone={() => { setAdding(false); reload(); }} />}
      {!shown.length && <div style={box}><p style={small}>{o.claims.length ? 'No claims with that status.' : 'No claims yet.'}</p></div>}
      {shown.map(c => (
        <div key={c.id} style={{ ...box, padding: 0 }} data-claim={c.claimNo}>
          <button onClick={() => setOpen(x => (x === c.id ? null : c.id))} aria-expanded={open === c.id}
            style={{ all: 'unset', boxSizing: 'border-box', cursor: 'pointer', width: '100%', padding: 14, display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
            <span style={{ fontWeight: 800, color: INK, fontSize: 14 }}>{c.claimNo}</span>
            <span style={{ fontSize: 12.5, color: MUTED }}>{c.patientRef} · {day(c.serviceFrom)} · {payer(c.payerId)}</span>
            {c.synthetic && <span style={chip('#fef3c7', '#92400e')}>Synthetic</span>}
            <span style={chip('#f1f5f9', '#334155')}>{WORK_STATUSES[c.work]}</span>
            <Statuses c={c} />
            <span style={{ marginLeft: 'auto', fontSize: 12.5, color: MUTED }}>billed {money(c.billedCents)} · paid {money(c.paidCents)}</span>
          </button>
          {open === c.id && <ClaimDetail id={c.id} o={o} accountId={accountId} reload={reload} />}
        </div>
      ))}
    </div>
  );
}

interface LineDraft { code: string; modifiers: string; units: string; charge: string; dxPointers: string }
const blankLine = (): LineDraft => ({ code: '', modifiers: '', units: '1', charge: '', dxPointers: '1' });

function ClaimForm({ o, accountId, onDone, edit }: { o: Overview; accountId: string; onDone: () => void; edit?: Claim }) {
  const [f, setF] = useState({
    practiceId: edit?.practiceId ?? o.practices[0]?.id ?? '', providerId: edit?.providerId ?? o.providers[0]?.id ?? '', payerId: edit?.payerId ?? o.payers[0]?.id ?? '',
    patientRef: edit?.patientRef ?? (o.settings.mode === 'synthetic' ? 'SYN-' : ''), serviceFrom: edit?.serviceFrom ?? todayIso(), serviceTo: edit?.serviceTo ?? '', diagnoses: edit?.diagnoses.join(', ') ?? '',
  });
  const [lines, setLines] = useState<LineDraft[]>(edit ? edit.lines.map(l => ({ code: l.code, modifiers: l.modifiers.join(' '), units: String(l.units), charge: (l.chargeCents / 100).toFixed(2), dxPointers: l.dxPointers.join(',') })) : [blankLine()]);
  const [idem] = useState(() => `claim-${crypto.randomUUID()}`);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const set = (k: keyof typeof f) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => setF(x => ({ ...x, [k]: e.target.value }));
  const setLine = (i: number, k: keyof LineDraft) => (e: React.ChangeEvent<HTMLInputElement>) => setLines(ls => ls.map((l, j) => (j === i ? { ...l, [k]: e.target.value } : l)));
  async function save(e: React.FormEvent) {
    e.preventDefault(); setBusy(true); setErr('');
    const claim = { ...f, serviceTo: f.serviceTo || f.serviceFrom, lines: lines.map(l => ({ code: l.code, modifiers: l.modifiers, units: Number(l.units), charge: l.charge, dxPointers: l.dxPointers })) };
    const d = await rcmApi(edit ? 'claim_update' : 'claim_create', { accountId, idem, id: edit?.id, claim });
    setBusy(false);
    if (!d.success) { setErr(d.error ?? 'That could not be saved.'); return; }
    onDone();
  }
  return (
    <form style={box} onSubmit={e => void save(e)} noValidate data-testid="claim-form">
      <h3 style={h3}>{edit ? `Edit ${edit.claimNo}` : 'A new claim'}</h3>
      <div style={grid}>
        <label style={label}>Practice<select style={input} data-field="claim.practice" value={f.practiceId} onChange={set('practiceId')}>{o.practices.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}</select></label>
        <label style={label}>Rendering provider<select style={input} data-field="claim.provider" value={f.providerId} onChange={set('providerId')}>{o.providers.filter(p => p.active).map(p => <option key={p.id} value={p.id}>{p.name}</option>)}</select></label>
        <label style={label}>Payer<select style={input} data-field="claim.payer" value={f.payerId} onChange={set('payerId')}>{o.payers.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}</select></label>
        <label style={label}>Patient account reference<input style={input} data-field="claim.patientRef" value={f.patientRef} onChange={set('patientRef')} placeholder={o.settings.mode === 'synthetic' ? 'SYN-1234' : 'The practice’s account number'} autoComplete="off" /></label>
        <label style={label}>Date of service<input style={input} type="date" data-field="claim.serviceFrom" value={f.serviceFrom} max={todayIso()} onChange={set('serviceFrom')} /></label>
        <label style={label}>Through <i style={{ fontWeight: 500 }}>(if more than a day)</i><input style={input} type="date" data-field="claim.serviceTo" value={f.serviceTo} max={todayIso()} onChange={set('serviceTo')} /></label>
        <label style={label}>Diagnosis codes (ICD-10)<input style={input} data-field="claim.diagnoses" value={f.diagnoses} onChange={set('diagnoses')} placeholder="E11.9, I10" /></label>
      </div>
      <p style={{ ...small, marginTop: 8 }}>No names, dates of birth or member IDs: the practice’s own account reference is all a claim here needs.</p>
      <div style={{ display: 'grid', gap: 8, marginTop: 10 }} data-field="claim.lines">
        {lines.map((l, i) => (
          <div key={i} style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 110px), 1fr))', gap: 8, padding: 10, borderRadius: 10, background: '#f8fafc', border: `1px solid ${LINE}` }}>
            <label style={label}>Line {i + 1} code<input style={input} value={l.code} onChange={setLine(i, 'code')} placeholder="99213" /></label>
            <label style={label}>Modifiers<input style={input} value={l.modifiers} onChange={setLine(i, 'modifiers')} placeholder="25" /></label>
            <label style={label}>Units<input style={input} value={l.units} onChange={setLine(i, 'units')} inputMode="numeric" /></label>
            <label style={label}>Charge<input style={input} value={l.charge} onChange={setLine(i, 'charge')} inputMode="decimal" placeholder="135.00" /></label>
            <label style={label}>Diagnosis pointers<input style={input} value={l.dxPointers} onChange={setLine(i, 'dxPointers')} placeholder="1,2" /></label>
            {lines.length > 1 && <button type="button" style={{ ...btn, alignSelf: 'end' }} onClick={() => setLines(ls => ls.filter((_, j) => j !== i))}>Remove</button>}
          </div>
        ))}
        <button type="button" style={{ ...btn, justifySelf: 'start' }} onClick={() => setLines(ls => [...ls, blankLine()])}><Plus size={13} /> Add a line</button>
      </div>
      <Err text={err} />
      <div style={{ display: 'flex', gap: 8, marginTop: 10, flexWrap: 'wrap' }}>
        <button type="submit" style={primary} disabled={busy} data-testid="claim-save">{busy ? <Loader size={13} className="spin" /> : <Check size={13} />} {edit ? 'Save changes' : 'Save as draft'}</button>
        <button type="button" style={btn} onClick={onDone}>Cancel</button>
      </div>
    </form>
  );
}

interface ClaimDetailData {
  claim: Claim; lines: Line[]; checks: CodingCheck[]; denials: Denial[]; appeals: Appeal[]; notes: Note[];
  events: { kind: string; detail: Record<string, unknown>; byEmail: string; byRole: string; at: string }[];
  remitRows: { id: string; code: string; paid_cents: number; allowed_cents: number; carc: string; check_no: string; paid_on: string }[];
}

function ClaimDetail({ id, o, accountId, reload }: { id: string; o: Overview; accountId: string; reload: () => void }) {
  const [d, setD] = useState<ClaimDetailData | null>(null);
  const [editing, setEditing] = useState(false);
  const load = useCallback(() => { void rcmApi<ClaimDetailData>('claim_get', { accountId, id }).then(x => { if (x.success) setD(x); }); }, [accountId, id]);
  useEffect(() => { load(); }, [load]);
  const both = useCallback(() => { load(); reload(); }, [load, reload]);
  const { busy, act, errorFor } = useAct(accountId, both);
  const [chReason, setChReason] = useState('');
  const [payerTo, setPayerTo] = useState<PayerStatus | ''>('');
  const [payerReason, setPayerReason] = useState('');
  if (!d) return <div style={{ padding: 14 }}><p style={small}><Loader size={13} className="spin" /> Loading…</p></div>;
  const c = d.claim;
  const biller = o.as.biller;
  return (
    <div style={{ padding: '0 14px 14px', display: 'grid', gap: 12, minWidth: 0 }} data-testid="claim-detail">
      {editing && <ClaimForm o={o} accountId={accountId} edit={{ ...c, lines: d.lines }} onDone={() => { setEditing(false); both(); }} />}
      <div style={scroller}>
        <table style={table}>
          <thead><tr>{['Line', 'Code', 'Mod', 'Units', 'Charge', 'Allowed', 'Paid', 'Patient', 'Write-down'].map(h => <th key={h} style={th}>{h}</th>)}</tr></thead>
          <tbody>
            {d.lines.map(l => (
              <tr key={l.id}>
                <td style={td}>{l.lineNo}</td><td style={td}>{l.code}</td><td style={td}>{l.modifiers.join(' ') || '—'}</td><td style={td}>{l.units}</td>
                <td style={td}>{money(l.chargeCents)}</td><td style={td}>{l.allowedCents == null ? '—' : money(l.allowedCents)}</td><td style={td}>{l.remitted ? money(l.paidCents) : '—'}</td>
                <td style={td}>{l.remitted ? money(l.patientRespCents) : '—'}</td><td style={td}>{l.remitted ? money(l.adjustCents) : '—'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p style={small}>Diagnoses: {c.diagnoses.join(', ')}. Paid, allowed and write-downs come only from posted remittances.</p>
      {c.ch === 'rejected' || c.chReason ? <p style={{ ...small, color: BAD }}>Clearinghouse rejection: {c.chReason}</p> : null}
      {c.closedReason && <p style={small}>Closed: {c.closedReason}</p>}

      {biller && (
        <div style={{ display: 'grid', gap: 8 }}>
          <h3 style={{ ...h3, margin: 0 }}>Work this claim</h3>
          {d.checks.length > 0 && c.work !== 'submitted' && c.work !== 'closed' && <Checks checks={d.checks} />}
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', alignItems: 'center' }} data-field="ch.to">
            {c.work === 'draft' && <button style={btn} onClick={() => setEditing(e => !e)}>Edit</button>}
            {c.work === 'draft' && <button style={primary} disabled={!!busy} onClick={() => void act('review', 'claim_review', { id: c.id })} data-testid="claim-to-review">{o.settings.codingReview ? 'Send to coding review' : 'Mark ready'}</button>}
            {c.work === 'ready' && (c.ch === 'not_sent' || c.ch === 'rejected') && <button style={primary} disabled={!!busy} onClick={() => void act('ch', 'ch_record', { id: c.id, to: 'submitted' })} data-testid="ch-submitted">Record: submitted to the clearinghouse</button>}
            {c.work === 'ready' && c.ch === 'accepted' && <button style={btn} disabled={!!busy} onClick={() => void act('ch', 'ch_record', { id: c.id, to: 'submitted', corrected: true })}>Record: corrected claim submitted</button>}
            {c.ch === 'submitted' && <button style={primary} disabled={!!busy} onClick={() => void act('ch', 'ch_record', { id: c.id, to: 'accepted' })} data-testid="ch-accepted">Clearinghouse accepted it</button>}
          </div>
          {c.ch === 'submitted' && (
            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', alignItems: 'end' }}>
              <label style={{ ...label, flex: '1 1 220px' }}>Rejection reason, as the clearinghouse gave it<input style={input} data-field="ch.reason" value={chReason} onChange={e => setChReason(e.target.value)} /></label>
              <button style={btn} disabled={!!busy} onClick={() => void act('ch', 'ch_record', { id: c.id, to: 'rejected', reason: chReason })} data-testid="ch-rejected">Clearinghouse rejected it</button>
            </div>
          )}
          {c.ch === 'accepted' && c.payer !== 'closed' && (
            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', alignItems: 'end' }}>
              <label style={{ ...label, flex: '1 1 180px' }}>What the payer said
                <select style={input} data-field="payer.to" value={payerTo} onChange={e => setPayerTo(e.target.value as PayerStatus)}>
                  <option value="">Choose…</option>
                  {(['received', 'in_process', 'pended', 'denied', 'closed'] as PayerStatus[]).map(s => <option key={s} value={s}>{PAYER_STATUSES[s].label}</option>)}
                </select>
              </label>
              <label style={{ ...label, flex: '1 1 220px' }}>Reason or note<input style={input} data-field="payer.reason" value={payerReason} onChange={e => setPayerReason(e.target.value)} /></label>
              <button style={btn} disabled={!!busy || !payerTo} onClick={() => void act('payer', 'payer_record', { id: c.id, to: payerTo, reason: payerReason })} data-testid="payer-record">Record</button>
            </div>
          )}
          <p style={small}>No clearinghouse is connected: submit in your clearinghouse, then record its answer here. Payments come only from an imported remittance.</p>
          <Err text={errorFor('review') || errorFor('ch') || errorFor('payer')} />
        </div>
      )}

      {d.denials.length > 0 && (
        <div style={{ display: 'grid', gap: 6 }}>
          <h3 style={{ ...h3, margin: 0 }}>Denials</h3>
          {d.denials.map(x => <p key={x.id} style={small}><b style={{ color: INK }}>{DENIAL_CATEGORIES[x.category] ?? x.category}</b> — reason {x.group}-{x.carc}{x.rarc ? ` / ${x.rarc}` : ''}, {money(x.amountCents)}, denied {day(x.deniedOn)}, appeal by {day(x.appealBy)} · {DENIAL_STATUSES[x.status]}</p>)}
        </div>
      )}
      {d.remitRows.length > 0 && (
        <div style={{ display: 'grid', gap: 4 }}>
          <h3 style={{ ...h3, margin: 0 }}>Remittance lines posted</h3>
          {d.remitRows.map(r => <p key={r.id} style={small}>{r.code}: paid {money(r.paid_cents)} of {money(r.allowed_cents)} allowed{r.carc ? `, reason ${r.carc}` : ''} — check {r.check_no || '—'}, {day(r.paid_on)}</p>)}
        </div>
      )}
      <NotesBox notes={d.notes} accountId={accountId} claimId={c.id} biller={biller} onDone={both} />
      <details>
        <summary style={{ ...small, cursor: 'pointer', fontWeight: 700 }}>History of this claim ({d.events.length})</summary>
        <div style={{ display: 'grid', gap: 3, marginTop: 6 }}>
          {d.events.map((e, i) => <p key={i} style={small}>{day(e.at)} {new Date(e.at).toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' })} — {EVENT_WORDS[e.kind] ?? e.kind.replace(/_/g, ' ')} · {e.byEmail} ({e.byRole})</p>)}
        </div>
      </details>
    </div>
  );
}

const EVENT_WORDS: Record<string, string> = {
  created: 'Claim written', edited: 'Edited', viewed: 'Viewed', to_coding_review: 'Sent to coding review', ready: 'Marked ready', coding_approved: 'Passed coding review',
  coding_returned: 'Returned from coding review', ch_submitted: 'Recorded as submitted to the clearinghouse', ch_accepted: 'Clearinghouse accepted', ch_rejected: 'Clearinghouse rejected',
  remit_posted: 'Remittance posted', denial_recorded: 'Denial recorded', appeal_drafted: 'Appeal drafted', appeal_submitted: 'Appeal submitted', note: 'Note', internal_note: 'Internal note', request_sent: 'Request sent to the practice',
};

function Checks({ checks }: { checks: CodingCheck[] }) {
  return (
    <div style={{ display: 'grid', gap: 3 }} data-testid="coding-checks">
      {checks.map(x => <p key={x.key + x.says} style={{ ...small, color: x.level === 'error' ? BAD : WARN }}>{x.level === 'error' ? 'Error' : 'Warning'}: {x.says}</p>)}
    </div>
  );
}

function NotesBox({ notes, accountId, claimId, authId, biller, onDone }: { notes: Note[]; accountId: string; claimId?: string; authId?: string; biller: boolean; onDone: () => void }) {
  const [text, setText] = useState('');
  const [vis, setVis] = useState<'internal' | 'practice' | 'request'>(biller ? 'internal' : 'practice');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  async function add() {
    setBusy(true); setErr('');
    const d = await rcmApi('note_add', { accountId, claimId, authId, body: text, visibility: vis === 'internal' ? 'internal' : 'practice', kind: vis === 'request' ? 'request' : 'note' });
    setBusy(false);
    if (!d.success) { setErr(d.error ?? 'That could not be saved.'); return; }
    setText(''); onDone();
  }
  return (
    <div style={{ display: 'grid', gap: 6 }}>
      <h3 style={{ ...h3, margin: 0 }}>Notes</h3>
      {notes.map(n => (
        <p key={n.id} style={{ ...small, color: INK, background: n.visibility === 'internal' ? '#f8fafc' : '#fff', padding: 8, borderRadius: 8, border: `1px solid ${LINE}` }}>
          {n.visibility === 'internal' && <span style={chip('#e2e8f0', '#334155')}>Internal</span>} {n.kind === 'request' && <span style={chip('#fef3c7', WARN)}>Request{n.answered_at ? ' — answered' : ''}</span>} {n.body}
          <span style={{ display: 'block', color: MUTED, marginTop: 2 }}>{n.by_email} · {day(n.at)}</span>
        </p>
      ))}
      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', alignItems: 'end' }}>
        <label style={{ ...label, flex: '1 1 240px' }}>Add a note<input style={input} data-field="note.body" value={text} onChange={e => setText(e.target.value)} /></label>
        {biller && (
          <select aria-label="Who sees it" style={{ ...input, width: 'auto' }} value={vis} onChange={e => setVis(e.target.value as typeof vis)}>
            <option value="internal">Internal — billing team only</option>
            <option value="practice">Shared with the practice</option>
            <option value="request">Request to the practice</option>
          </select>
        )}
        <button style={btn} disabled={busy || !text.trim()} onClick={() => void add()} data-testid="note-add">Add</button>
      </div>
      <Err text={err} />
    </div>
  );
}

/* ── Coding review ── */

function Review({ o, accountId, reload }: { o: Overview; accountId: string; reload: () => void }) {
  const queue = o.claims.filter(c => c.work === 'coding_review');
  if (!queue.length) return <div style={box}><p style={small}>Nothing is waiting for coding review.</p></div>;
  return <div style={{ display: 'grid', gap: 10 }}>{queue.map(c => <ReviewCard key={c.id} c={c} accountId={accountId} reload={reload} />)}</div>;
}

function ReviewCard({ c, accountId, reload }: { c: Claim; accountId: string; reload: () => void }) {
  const [checks, setChecks] = useState<CodingCheck[] | null>(null);
  const [reason, setReason] = useState('');
  const { busy, act, errorFor } = useAct(accountId, reload);
  useEffect(() => { void rcmApi<ClaimDetailData>('claim_get', { accountId, id: c.id }).then(d => { if (d.success) setChecks(d.checks); }); }, [accountId, c.id]);
  const errors = checks?.filter(x => x.level === 'error').length ?? 0;
  const warnings = checks?.filter(x => x.level === 'warning').length ?? 0;
  return (
    <div style={box} data-review={c.claimNo}>
      <p style={{ margin: '0 0 6px', fontWeight: 800, color: INK }}>{c.claimNo} <span style={{ fontWeight: 500, color: MUTED, fontSize: 12.5 }}>{c.patientRef} · {day(c.serviceFrom)} · {c.lines.map(l => l.code).join(', ')} · dx {c.diagnoses.join(', ')}</span></p>
      {checks ? (checks.length ? <Checks checks={checks} /> : <p style={{ ...small, color: GOOD }}><Check size={12} /> No coding problems found.</p>) : <p style={small}><Loader size={12} className="spin" /> Checking…</p>}
      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', alignItems: 'end', marginTop: 8 }}>
        <button style={primary} disabled={!!busy || errors > 0} onClick={() => void act('approve', 'coding_approve', { id: c.id, acceptWarnings: warnings > 0 })} data-testid="coding-approve">
          <ShieldCheck size={13} /> {warnings ? 'Approve, warnings accepted' : 'Approve'}
        </button>
        <label style={{ ...label, flex: '1 1 220px' }}>Or return it, saying what to change<input style={input} data-field="coding.reason" value={reason} onChange={e => setReason(e.target.value)} /></label>
        <button style={btn} disabled={!!busy} onClick={() => void act('return', 'coding_return', { id: c.id, reason })} data-testid="coding-return">Return to the coder</button>
      </div>
      <Err text={errorFor('approve') || errorFor('return')} />
    </div>
  );
}

/* ── Denials and appeals ── */

function Denials({ o, accountId, reload }: { o: Overview; accountId: string; reload: () => void }) {
  const { busy, act, errorFor } = useAct(accountId, reload);
  const [drafting, setDrafting] = useState<string | null>(null);
  const [summary, setSummary] = useState('');
  const [reason, setReason] = useState('');
  const [recovered, setRecovered] = useState('');
  const claimNo = (id: string) => o.claims.find(c => c.id === id)?.claimNo ?? '—';
  const byCat = Object.entries(o.denials.filter(d => d.status === 'open').reduce<Record<string, number>>((t, d) => ({ ...t, [d.category]: (t[d.category] ?? 0) + d.amountCents }), {}));
  if (!o.denials.length) return <div style={box}><p style={small}>No denials. Denials arrive with a remittance (a line paid nothing with a denial reason), or are recorded by hand from a payer letter.</p></div>;
  return (
    <div style={{ display: 'grid', gap: 10, minWidth: 0 }}>
      {byCat.length > 0 && <div style={box}><p style={small}><b style={{ color: INK }}>Open, by reason:</b> {byCat.map(([k, v]) => `${DENIAL_CATEGORIES[k as keyof typeof DENIAL_CATEGORIES] ?? k} ${money(v)}`).join(' · ')}</p></div>}
      {o.denials.map(d => {
        const appeals = o.appeals.filter(a => a.denial_id === d.id);
        const live = appeals.find(a => a.status === 'drafting' || a.status === 'submitted');
        const overdue = d.status === 'open' && d.appealBy && d.appealBy < todayIso();
        return (
          <div key={d.id} style={box} data-denial={d.id}>
            <p style={{ margin: 0, fontWeight: 800, color: INK, fontSize: 13.5 }}>
              {claimNo(d.claimId)} · {DENIAL_CATEGORIES[d.category] ?? d.category} <span style={chip(d.status === 'open' ? '#fee2e2' : '#f1f5f9', d.status === 'open' ? '#991b1b' : '#334155')}>{DENIAL_STATUSES[d.status]}</span>
              {overdue && <span style={chip('#fee2e2', '#991b1b')}>Appeal deadline passed</span>}
            </p>
            <p style={{ ...small, marginTop: 4 }}>Reason {d.group}-{d.carc}{d.rarc ? ` / ${d.rarc}` : ''} · {money(d.amountCents)} · denied {day(d.deniedOn)} · appeal by {day(d.appealBy)} · from {d.source === 'remit' ? 'a remittance' : 'a payer letter'}</p>
            {appeals.map(a => <p key={a.id} style={{ ...small, marginTop: 4 }}>Appeal level {a.level}: {APPEAL_STATUSES[a.status]}{a.submitted_on ? `, sent ${day(a.submitted_on)}` : ''}{a.recovered_cents ? `, recovered ${money(a.recovered_cents)}` : ''} — {a.summary}</p>)}
            {o.as.biller && (
              <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', alignItems: 'end', marginTop: 8 }} data-field="appeal.to denial.to">
                {(d.status === 'open' || d.status === 'appealing') && !live && <button style={primary} onClick={() => { setDrafting(d.id); setSummary(''); }} data-testid="appeal-draft-open">Draft an appeal</button>}
                {live?.status === 'drafting' && <button style={primary} disabled={!!busy} onClick={() => void act(d.id, 'appeal_set', { id: live.id, to: 'submitted' })} data-testid="appeal-submit">Record: appeal sent</button>}
                {live?.status === 'submitted' && (
                  <>
                    <label style={{ ...label, flex: '0 1 140px' }}>Recovered<input style={input} data-field="appeal.recovered" value={recovered} onChange={e => setRecovered(e.target.value)} inputMode="decimal" placeholder="0.00" /></label>
                    <button style={btn} disabled={!!busy} onClick={() => void act(d.id, 'appeal_set', { id: live.id, to: 'won', recovered })} data-testid="appeal-won">Won</button>
                    <button style={btn} disabled={!!busy} onClick={() => void act(d.id, 'appeal_set', { id: live.id, to: 'partial', recovered })}>Partly won</button>
                    <button style={btn} disabled={!!busy} onClick={() => void act(d.id, 'appeal_set', { id: live.id, to: 'lost', recovered: '0' })}>Lost</button>
                  </>
                )}
                {d.status === 'open' && !live && <button style={btn} disabled={!!busy} onClick={() => void act(d.id, 'denial_set', { id: d.id, to: 'corrected' })}>Corrected and resubmitted</button>}
                {(d.status === 'open' || d.status === 'appealing') && (
                  <>
                    <label style={{ ...label, flex: '1 1 180px' }}>Write-off reason<input style={input} data-field="denial.reason" value={reason} onChange={e => setReason(e.target.value)} /></label>
                    <button style={btn} disabled={!!busy} onClick={() => void act(d.id, 'denial_set', { id: d.id, to: 'written_off', reason })}>Write off</button>
                  </>
                )}
              </div>
            )}
            {drafting === d.id && (
              <div style={{ display: 'grid', gap: 6, marginTop: 8 }}>
                <label style={label}>What the appeal argues, and what it encloses<textarea style={{ ...input, minHeight: 70 }} data-field="appeal.summary" value={summary} onChange={e => setSummary(e.target.value)} /></label>
                <div style={{ display: 'flex', gap: 6 }}>
                  <button style={primary} disabled={!!busy} onClick={() => void act(d.id, 'appeal_create', { denialId: d.id, summary }, () => setDrafting(null))} data-testid="appeal-save">Save the draft</button>
                  <button style={btn} onClick={() => setDrafting(null)}>Cancel</button>
                </div>
              </div>
            )}
            <Err text={errorFor(d.id)} />
          </div>
        );
      })}
    </div>
  );
}

/* ── Remittances ── */

interface Preview { problems: { rowNo: number; says: string }[]; totalPaidCents: number; postedCents: number; rows: { rowNo: number; claimNo: string; code: string; paidCents: number; allowedCents: number; carc: string; outcome: string; why: string }[] }

function Remits({ o, accountId, reload }: { o: Overview; accountId: string; reload: () => void }) {
  const [csv, setCsv] = useState('');
  const [fileName, setFileName] = useState('');
  const [preview, setPreview] = useState<Preview | null>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const [result, setResult] = useState('');
  const [open, setOpen] = useState<string | null>(null);
  async function pick(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0];
    setPreview(null); setResult(''); setErr('');
    if (!f) return;
    if (f.size > 2_000_000) { setErr('That file is over 2 MB. Split it by check or by week.'); return; }
    setCsv(await f.text()); setFileName(f.name);
  }
  async function run(action: 'remit_preview' | 'remit_import') {
    setBusy(true); setErr('');
    const d = await rcmApi<Preview & { posted: number; unmatched: number; duplicate: number }>(action, { accountId, csv, fileName });
    setBusy(false);
    if (!d.success) { setErr(d.error ?? 'That file could not be read.'); return; }
    if (action === 'remit_preview') { setPreview(d); return; }
    setResult(`Imported: ${d.posted} posted, ${d.unmatched} unmatched, ${d.duplicate} already posted before.`);
    setPreview(null); setCsv(''); reload();
  }
  async function sample() {
    const d = await rcmApi<{ csv: string; fileName: string }>('synthetic_remit', { accountId });
    if (!d.success) { setErr(d.error ?? 'No sample available.'); return; }
    setCsv(d.csv); setFileName(d.fileName); setPreview(null);
  }
  return (
    <div style={{ display: 'grid', gap: 10, minWidth: 0 }}>
      {o.as.biller && (
        <div style={box}>
          <h3 style={h3}>Import a remittance (CSV)</h3>
          <p style={small}>Export the 835 remittance from your clearinghouse as CSV: one row per service line, with claim number, code, billed, allowed, paid, patient responsibility, adjustment group and reason, and the check or EFT number. The preview shows every row and what it would do before anything is posted. The same payment is never posted twice.</p>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center', marginTop: 8 }}>
            <label style={{ ...btn }} data-field="remit.file"><Upload size={13} /> Choose a file<input type="file" accept=".csv,text/csv" onChange={e => void pick(e)} style={{ display: 'none' }} data-testid="remit-file" /></label>
            {o.settings.mode === 'synthetic' && o.claims.some(c => c.synthetic) && <button style={btn} onClick={() => void sample()} data-testid="remit-sample"><FileText size={13} /> Use the synthetic sample file</button>}
            {fileName && <span style={small}>{fileName}</span>}
            {csv && <button style={btn} disabled={busy} onClick={() => void run('remit_preview')} data-testid="remit-preview">Preview</button>}
            {preview && !preview.problems.length && <button style={primary} disabled={busy} onClick={() => void run('remit_import')} data-testid="remit-import">Post it</button>}
            {preview && preview.problems.length > 0 && <button style={btn} disabled={busy} onClick={() => void run('remit_import')} data-testid="remit-import">Post the readable rows</button>}
          </div>
          {preview && (
            <div style={{ marginTop: 10, display: 'grid', gap: 6 }} data-testid="remit-plan">
              <p style={small}>{preview.rows.length} rows read · {money(preview.totalPaidCents)} paid in the file · {money(preview.postedCents)} would be posted.</p>
              {preview.problems.map(p => <p key={p.rowNo} style={{ ...small, color: BAD }}>Row {p.rowNo}: {p.says}</p>)}
              <div style={scroller}>
                <table style={table}>
                  <thead><tr>{['Row', 'Claim', 'Code', 'Allowed', 'Paid', 'Reason', 'What happens'].map(h => <th key={h} style={th}>{h}</th>)}</tr></thead>
                  <tbody>{preview.rows.map(r => <tr key={r.rowNo}><td style={td}>{r.rowNo}</td><td style={td}>{r.claimNo}</td><td style={td}>{r.code}</td><td style={td}>{money(r.allowedCents)}</td><td style={td}>{money(r.paidCents)}</td><td style={td}>{r.carc || '—'}</td><td style={td}>{r.outcome === 'posted' ? 'Posted' : r.outcome === 'duplicate' ? 'Skipped — already posted' : `Not matched — ${r.why}`}</td></tr>)}</tbody>
                </table>
              </div>
            </div>
          )}
          <Err text={err} />
          {result && <p style={{ ...small, color: GOOD, marginTop: 6 }}>{result}</p>}
        </div>
      )}
      {!o.remits.length && <div style={box}><p style={small}>No remittances imported yet.</p></div>}
      {o.remits.map(r => (
        <div key={r.id} style={{ ...box, padding: 0 }} data-remit={r.file_name}>
          <button onClick={() => setOpen(x => (x === r.id ? null : r.id))} aria-expanded={open === r.id}
            style={{ all: 'unset', boxSizing: 'border-box', cursor: 'pointer', width: '100%', padding: 14, display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
            <span style={{ fontWeight: 800, color: INK, fontSize: 13.5, overflowWrap: 'anywhere' }}>{r.file_name}</span>
            <span style={chip(r.status === 'reconciled' ? '#dcfce7' : '#fef3c7', r.status === 'reconciled' ? '#166534' : '#92400e')}>{r.status === 'reconciled' ? 'Reconciled' : 'Not reconciled'}</span>
            <span style={{ marginLeft: 'auto', fontSize: 12.5, color: MUTED }}>{day(r.imported_at)} · posted {money(r.posted_cents)} · {r.rows_posted}/{r.rows_total} rows{r.rows_unmatched ? ` · ${r.rows_unmatched} unmatched` : ''}</span>
          </button>
          {open === r.id && <RemitDetail id={r.id} accountId={accountId} biller={o.as.biller} reload={reload} />}
        </div>
      ))}
    </div>
  );
}

interface RemitDetailData { remit: Remit; rows: { id: string; row_no: number; claim_no: string; code: string; paid_cents: number; allowed_cents: number; carc: string; outcome: string; set_aside_reason: string }[]; reconciliation: { status: string; problems: string[] } }

function RemitDetail({ id, accountId, biller, reload }: { id: string; accountId: string; biller: boolean; reload: () => void }) {
  const [d, setD] = useState<RemitDetailData | null>(null);
  const load = useCallback(() => { void rcmApi<RemitDetailData>('remit_get', { accountId, id }).then(x => { if (x.success) setD(x); }); }, [accountId, id]);
  useEffect(() => { load(); }, [load]);
  const both = useCallback(() => { load(); reload(); }, [load, reload]);
  const { busy, act, errorFor } = useAct(accountId, both);
  const [deposit, setDeposit] = useState('');
  const [match, setMatch] = useState<Record<string, string>>({});
  if (!d) return <div style={{ padding: 14 }}><p style={small}><Loader size={13} className="spin" /> Loading…</p></div>;
  return (
    <div style={{ padding: '0 14px 14px', display: 'grid', gap: 10, minWidth: 0 }} data-testid="remit-detail">
      <div>
        <p style={small}>In the file: {money(d.remit.file_paid_cents)} · posted: {money(d.remit.posted_cents)} · bank deposit: {d.remit.deposit_cents == null ? 'not entered' : money(d.remit.deposit_cents)}</p>
        {d.reconciliation.problems.map(p => <p key={p} style={{ ...small, color: WARN }}>{p}</p>)}
        {d.reconciliation.status === 'reconciled' && <p style={{ ...small, color: GOOD }}><Check size={12} /> Reconciled: the deposit matches what was posted, and every row is accounted for.</p>}
      </div>
      {biller && (
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', alignItems: 'end' }}>
          <label style={{ ...label, flex: '0 1 200px' }}>Amount that reached the bank<input style={input} data-field="remit.deposit" value={deposit} onChange={e => setDeposit(e.target.value)} inputMode="decimal" placeholder="0.00" /></label>
          <button style={btn} disabled={!!busy} onClick={() => void act('dep', 'remit_deposit', { id, deposit })} data-testid="remit-deposit">Save the deposit</button>
          <Err text={errorFor('dep')} />
        </div>
      )}
      <div style={scroller}>
        <table style={table}>
          <thead><tr>{['Row', 'Claim', 'Code', 'Allowed', 'Paid', 'Reason', 'Outcome'].map(h => <th key={h} style={th}>{h}</th>)}</tr></thead>
          <tbody>
            {d.rows.map(r => (
              <tr key={r.id}>
                <td style={td}>{r.row_no}</td><td style={td}>{r.claim_no || '—'}</td><td style={td}>{r.code}</td><td style={td}>{money(r.allowed_cents)}</td><td style={td}>{money(r.paid_cents)}</td><td style={td}>{r.carc || '—'}</td>
                <td style={td}>
                  {r.outcome === 'posted' ? 'Posted' : r.outcome === 'duplicate' ? 'Already posted before' : r.outcome === 'set_aside' ? `Set aside — ${r.set_aside_reason}` : biller ? (
                    <span style={{ display: 'inline-flex', gap: 4, flexWrap: 'wrap', alignItems: 'center' }} data-field="remit.claimNo remit.reason">
                      <input style={{ ...input, width: 110 }} aria-label="Claim number or reason" value={match[r.id] ?? ''} onChange={e => setMatch(m => ({ ...m, [r.id]: e.target.value }))} placeholder="C000123" />
                      <button style={btn} disabled={!!busy} onClick={() => void act(r.id, 'remit_row_match', { rowId: r.id, claimNo: match[r.id] })}>Match</button>
                      <button style={btn} disabled={!!busy} onClick={() => void act(r.id, 'remit_row_set_aside', { rowId: r.id, reason: match[r.id] })}>Set aside</button>
                      <Err text={errorFor(r.id)} />
                    </span>
                  ) : 'Not matched yet'}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

/* ── A/R aging ── */

function Aging({ o }: { o: Overview }) {
  const a = o.aging;
  const payer = (id: string) => o.payers.find(p => p.id === id)?.name ?? '—';
  return (
    <div style={{ display: 'grid', gap: 10, minWidth: 0 }}>
      <div style={box} data-testid="aging">
        <h3 style={h3}>What payers still owe, by age</h3>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 120px), 1fr))', gap: 8 }}>
          {AGING_BUCKETS.map(b => (
            <div key={b.key} style={{ padding: 10, borderRadius: 12, background: b.max > 90 ? '#fef2f2' : '#f8fafc', border: `1px solid ${LINE}` }}>
              <div style={{ fontSize: 11.5, fontWeight: 700, color: MUTED }}>{b.label}</div>
              <div style={{ fontSize: 17, fontWeight: 800, color: INK }}>{money(a.buckets[b.key]?.cents ?? 0)}</div>
              <div style={small}>{a.buckets[b.key]?.claims ?? 0} claims</div>
            </div>
          ))}
        </div>
        <p style={{ ...small, marginTop: 8 }}>Total {money(a.totalCents)}. Aged from the date of service. A claim’s balance is its charges less what was paid, the contractual write-down and the patient’s share. Unbilled — not yet accepted by a clearinghouse — is shown apart: {money(a.unbilledCents)} on {a.unbilledClaims} claims. The patients’ share moved off the payers: {money(a.patientCents)} (patient payments are not tracked here).</p>
      </div>
      {a.byPayer.length > 0 && (
        <div style={{ ...box, ...scroller }}>
          <table style={table}>
            <thead><tr><th style={th}>Payer</th>{AGING_BUCKETS.map(b => <th key={b.key} style={th}>{b.label}</th>)}</tr></thead>
            <tbody>{a.byPayer.map(p => <tr key={p.payerId}><td style={td}>{payer(p.payerId)}</td>{AGING_BUCKETS.map(b => <td key={b.key} style={td}>{money(Number(p[b.key] ?? 0))}</td>)}</tr>)}</tbody>
          </table>
        </div>
      )}
    </div>
  );
}

/* ── The collections fee statement ──
   Read-only, and the same for the billing team and the practice: the month's
   posted payer payments behind the fee, what was left out and why, and the
   arithmetic (lib/rcm.ts collectionsStatement). Nothing is invoiced from here. */

interface FeeStatementAnswer {
  statement: { month: string; counted: FeeLine[]; excluded: FeeLine[]; receivedCents: number; takebackCents: number; netCents: number; shortfallCents: number; bps: number; feeCents: number };
  synthetic: boolean; basis: string; status: string;
}
interface FeeLine { id: string; claimId: string | null; claimNo: string; paidOn: string; paidCents: number; outcome: string }

function FeeStatementTab({ accountId }: { accountId: string }) {
  const [month, setMonth] = useState(() => new Date().toISOString().slice(0, 7));
  const [d, setD] = useState<Answer<FeeStatementAnswer> | null>(null);
  useEffect(() => {
    let alive = true;
    setD(null);
    void rcmApi<FeeStatementAnswer>('fee_statement', { accountId, month }).then(r => { if (alive) setD(r); });
    return () => { alive = false; };
  }, [accountId, month]);
  const st = d?.success ? d.statement : null;
  const OUT: Record<string, string> = { unmatched: 'Not matched to a claim', duplicate: 'Already posted in another file', set_aside: 'Set aside', posted: 'Not linked to a claim' };
  return (
    <div style={{ display: 'grid', gap: 10, minWidth: 0 }} data-testid="rcm-fee">
      <div style={box}>
        <div style={{ display: 'flex', gap: 10, alignItems: 'flex-end', flexWrap: 'wrap', justifyContent: 'space-between' }}>
          <h3 style={{ ...h3, margin: 0 }}>Collections fee statement</h3>
          <label style={label}>Month<input type="month" style={input} data-field="rcm.fee.month" value={month} onChange={e => setMonth(e.target.value)} /></label>
        </div>
        {!d && <p style={small}><Loader size={13} className="spin" /> Calculating…</p>}
        {d && !d.success && <Err text={d.error ?? 'Could not calculate the statement.'} />}
        {st && (
          <>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 140px), 1fr))', gap: 8, marginTop: 10 }}>
              {[['Payer payments posted', st.receivedCents], ['Take-backs and recoupments', -st.takebackCents], ['Eligible net collections', st.netCents], [`Fee at ${st.bps / 100}%`, st.feeCents]].map(([k, v]) => (
                <div key={k as string} style={{ padding: 10, borderRadius: 12, background: '#f8fafc', border: `1px solid ${LINE}` }}>
                  <div style={{ fontSize: 11.5, fontWeight: 700, color: MUTED }}>{k}</div>
                  <div style={{ fontSize: 17, fontWeight: 800, color: INK }} data-testid={`rcm-fee-${String(k).split(' ')[0].toLowerCase()}`}>{money(v as number)}</div>
                </div>
              ))}
            </div>
            {st.shortfallCents > 0 && <p style={{ ...small, color: WARN, marginTop: 8 }}>Take-backs exceeded payments by {money(st.shortfallCents)} this month, so the fee is nil. Whether the difference carries into next month is set by the signed agreement.</p>}
            <p style={{ ...small, marginTop: 8 }}><b style={{ color: INK }}>Status: {d.status}.</b> {d.basis} Patient payments are not tracked in this module, so none is counted.{d.synthetic ? ' Synthetic test data only — no real payments.' : ''}</p>
          </>
        )}
      </div>
      {st && (
        <div style={{ ...box, ...scroller }}>
          <h3 style={h3}>Counted ({st.counted.length})</h3>
          {st.counted.length ? (
            <table style={table}>
              <thead><tr><th style={th}>Paid on</th><th style={th}>Claim</th><th style={th}>Amount</th></tr></thead>
              <tbody>{st.counted.map(r => <tr key={r.id}><td style={td}>{r.paidOn}</td><td style={td}>{r.claimNo || '—'}</td><td style={td}>{money(r.paidCents)}</td></tr>)}</tbody>
            </table>
          ) : <p style={small}>No payer payment was posted to a claim in this month.</p>}
          {st.excluded.length > 0 && (
            <>
              <h3 style={{ ...h3, marginTop: 12 }}>Left out ({st.excluded.length})</h3>
              <table style={table}>
                <thead><tr><th style={th}>Paid on</th><th style={th}>Claim</th><th style={th}>Amount</th><th style={th}>Why</th></tr></thead>
                <tbody>{st.excluded.map(r => <tr key={r.id}><td style={td}>{r.paidOn}</td><td style={td}>{r.claimNo || '—'}</td><td style={td}>{money(r.paidCents)}</td><td style={td}>{OUT[r.outcome] ?? r.outcome}</td></tr>)}</tbody>
              </table>
            </>
          )}
        </div>
      )}
    </div>
  );
}

/* ── Prior authorization ── */

function Auths({ o, accountId, reload }: { o: Overview; accountId: string; reload: () => void }) {
  const { busy, act, errorFor } = useAct(accountId, reload);
  const [adding, setAdding] = useState(false);
  const [f, setF] = useState({ practiceId: o.practices[0]?.id ?? '', payerId: o.payers[0]?.id ?? '', patientRef: o.settings.mode === 'synthetic' ? 'SYN-' : '', code: '', units: '1', dueOn: '' });
  const [dec, setDec] = useState<Record<string, { authNo: string; validFrom: string; validTo: string }>>({});
  const payer = (id: string) => o.payers.find(p => p.id === id)?.name ?? '—';
  const set = (k: keyof typeof f) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => setF(x => ({ ...x, [k]: e.target.value }));
  const STATUS_COLOR: Record<string, [string, string]> = { needed: ['#fee2e2', '#991b1b'], submitted: ['#e0f2fe', '#075985'], approved: ['#dcfce7', '#166534'], denied: ['#fee2e2', '#991b1b'], expired: ['#fef3c7', '#92400e'], cancelled: ['#f1f5f9', '#334155'] };
  return (
    <div style={{ display: 'grid', gap: 10, minWidth: 0 }}>
      {o.as.biller && <button style={{ ...primary, justifySelf: 'start' }} onClick={() => setAdding(a => !a)} disabled={!o.practices.length} data-testid="auth-add-open"><Plus size={14} /> An authorization is needed</button>}
      {adding && (
        <div style={box}>
          <div style={grid}>
            <label style={label}>Practice<select style={input} data-field="auth.practice" value={f.practiceId} onChange={set('practiceId')}>{o.practices.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}</select></label>
            <label style={label}>Payer<select style={input} data-field="auth.payer" value={f.payerId} onChange={set('payerId')}>{o.payers.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}</select></label>
            <label style={label}>Patient account reference<input style={input} data-field="auth.patientRef" value={f.patientRef} onChange={set('patientRef')} autoComplete="off" /></label>
            <label style={label}>Code<input style={input} data-field="auth.code" value={f.code} onChange={set('code')} placeholder="72148" /></label>
            <label style={label}>Units<input style={input} data-field="auth.units" value={f.units} onChange={set('units')} inputMode="numeric" /></label>
            <label style={label}>Needed by<input style={input} type="date" data-field="auth.dueOn" value={f.dueOn} onChange={set('dueOn')} /></label>
          </div>
          <div style={{ display: 'flex', gap: 8, marginTop: 10 }}>
            <button style={primary} disabled={!!busy} onClick={() => void act('add', 'auth_create', { auth: { ...f, units: Number(f.units) } }, () => setAdding(false))} data-testid="auth-save">Add to the queue</button>
            <button style={btn} onClick={() => setAdding(false)}>Cancel</button>
          </div>
          <Err text={errorFor('add')} />
        </div>
      )}
      {!o.auths.length && <div style={box}><p style={small}>No prior authorizations in the queue.</p></div>}
      {o.auths.map(a => (
        <div key={a.id} style={box} data-auth={a.id}>
          <p style={{ margin: 0, fontWeight: 800, color: INK, fontSize: 13.5 }}>
            {a.code} × {a.units} · {a.patient_ref} · {payer(a.payer_id)} <span style={chip(...(STATUS_COLOR[a.shown] ?? ['#f1f5f9', '#334155']))}>{a.shown === 'expired' ? 'Expired' : AUTH_STATUSES[a.shown]}</span>
          </p>
          <p style={{ ...small, marginTop: 4 }}>{a.due_on ? `Needed by ${day(a.due_on)}. ` : ''}{a.auth_no ? `Authorization ${a.auth_no}, valid ${day(a.valid_from)} to ${day(a.valid_to)}.` : ''}</p>
          {o.as.biller && (
            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', alignItems: 'end', marginTop: 8 }} data-field="auth.to">
              {(a.status === 'needed' || a.status === 'denied') && <button style={btn} disabled={!!busy} onClick={() => void act(a.id, 'auth_set', { id: a.id, to: 'submitted' })} data-testid="auth-submitted">Record: requested from the payer</button>}
              {a.status === 'submitted' && (
                <>
                  <label style={{ ...label, flex: '1 1 120px' }}>Authorization number<input style={input} data-field="auth.authNo" value={dec[a.id]?.authNo ?? ''} onChange={e => setDec(x => ({ ...x, [a.id]: { ...(x[a.id] ?? { authNo: '', validFrom: '', validTo: '' }), authNo: e.target.value } }))} /></label>
                  <label style={{ ...label, flex: '1 1 130px' }}>Valid from<input style={input} type="date" value={dec[a.id]?.validFrom ?? ''} onChange={e => setDec(x => ({ ...x, [a.id]: { ...(x[a.id] ?? { authNo: '', validFrom: '', validTo: '' }), validFrom: e.target.value } }))} /></label>
                  <label style={{ ...label, flex: '1 1 130px' }}>Valid to<input style={input} type="date" data-field="auth.validTo" value={dec[a.id]?.validTo ?? ''} onChange={e => setDec(x => ({ ...x, [a.id]: { ...(x[a.id] ?? { authNo: '', validFrom: '', validTo: '' }), validTo: e.target.value } }))} /></label>
                  <button style={primary} disabled={!!busy} onClick={() => void act(a.id, 'auth_set', { id: a.id, to: 'approved', ...dec[a.id] })} data-testid="auth-approved">Approved</button>
                  <button style={btn} disabled={!!busy} onClick={() => void act(a.id, 'auth_set', { id: a.id, to: 'denied' })}>Denied</button>
                </>
              )}
              {a.status !== 'cancelled' && <button style={btn} disabled={!!busy} onClick={() => void act(a.id, 'auth_set', { id: a.id, to: 'cancelled' })}>Not needed</button>}
            </div>
          )}
          <Err text={errorFor(a.id)} />
        </div>
      ))}
    </div>
  );
}

/* ── Leakage audit ── */

function Leakage({ o }: { o: Overview }) {
  const L = o.leakage;
  const evidence = (f: Finding) => Object.entries(f.evidence).filter(([, v]) => v != null).map(([k, v]) => `${k.replace(/([A-Z])/g, ' $1').toLowerCase()}: ${typeof v === 'number' && /contracted|allowed|paid/.test(k) ? money(v) : v}`).join(' · ');
  return (
    <div style={{ display: 'grid', gap: 10, minWidth: 0 }} data-testid="leakage">
      <div style={box}>
        <h3 style={h3}>Where money is leaking</h3>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 150px), 1fr))', gap: 8 }}>
          {([['lost', 'Lost', BAD], ['at_risk', 'At risk', WARN], ['recoverable', 'Recoverable underpayment', INK]] as const).map(([k, l, color]) => (
            <div key={k} style={{ padding: 10, borderRadius: 12, background: '#f8fafc', border: `1px solid ${LINE}` }}>
              <div style={{ fontSize: 11.5, fontWeight: 700, color: MUTED }}>{l}</div>
              <div style={{ fontSize: 17, fontWeight: 800, color }}>{money(L.totals[k])}</div>
            </div>
          ))}
        </div>
        <p style={{ ...small, marginTop: 8 }}>Each claim line is counted once, under its most serious finding, so these never add the same dollars twice. Underpayments are measured against the fee schedule entered for each payer; with none entered, none are found.</p>
      </div>
      {!L.findings.length && <div style={box}><p style={small}>Nothing found.</p></div>}
      {L.findings.map(f => (
        <div key={f.key} style={box}>
          <p style={{ margin: 0, fontWeight: 800, color: INK, fontSize: 13.5 }}>{f.claimNo} line {f.lineNo} ({f.code}) · {LEAK_KINDS[f.kind].label} · {money(f.cents)}</p>
          <p style={{ ...small, marginTop: 4 }}>{LEAK_KINDS[f.kind].means} <span style={{ color: INK }}>Evidence — {evidence(f)}</span></p>
        </div>
      ))}
    </div>
  );
}

/* ── Messages ── */

function Messages({ o, accountId, reload }: { o: Overview; accountId: string; reload: () => void }) {
  const [answer, setAnswer] = useState<Record<string, string>>({});
  const { busy, act, errorFor } = useAct(accountId, reload);
  const shared = o.notes.filter(n => n.visibility === 'practice');
  const claimNo = (id: string | null) => (id ? o.claims.find(c => c.id === id)?.claimNo ?? '' : '');
  return (
    <div style={{ display: 'grid', gap: 10, minWidth: 0 }}>
      <div style={box}>
        <NotesBox notes={[]} accountId={accountId} biller={o.as.biller} onDone={reload} />
        <p style={{ ...small, marginTop: 6 }}>{o.as.practice ? 'Notes here reach your billing team. Do not write patient names or Social Security numbers — use the account reference.' : 'Shared notes and requests are seen by the practice. Internal notes are not, and are kept on each claim.'}</p>
      </div>
      {!shared.length && <div style={box}><p style={small}>No messages yet.</p></div>}
      {shared.map(n => (
        <div key={n.id} style={box} data-note={n.id}>
          <p style={{ margin: 0, fontSize: 13, color: INK }}>{n.kind === 'request' && <span style={chip('#fef3c7', WARN)}>{n.answered_at ? 'Request — answered' : 'Request'}</span>} {claimNo(n.claim_id) && <b>{claimNo(n.claim_id)}: </b>}{n.body}</p>
          <p style={{ ...small, marginTop: 2 }}>{n.by_email} ({n.by_role === 'biller' ? 'billing team' : 'practice'}) · {day(n.at)}</p>
          {n.kind === 'request' && !n.answered_at && o.as.practice && (
            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', alignItems: 'end', marginTop: 6 }}>
              <label style={{ ...label, flex: '1 1 240px' }}>Your answer<input style={input} data-field="note.body" value={answer[n.id] ?? ''} onChange={e => setAnswer(a => ({ ...a, [n.id]: e.target.value }))} /></label>
              <button style={primary} disabled={!!busy} onClick={() => void act(n.id, 'note_add', { body: answer[n.id] ?? '', claimId: n.claim_id ?? undefined, answers: n.id })} data-testid="request-answer">Answer</button>
            </div>
          )}
          <Err text={errorFor(n.id)} />
        </div>
      ))}
    </div>
  );
}

/* ── Access log ── */

function AuditLog({ accountId }: { accountId: string }) {
  const [events, setEvents] = useState<{ id: number; claimNo: string | null; kind: string; byEmail: string; byRole: string; at: string }[] | null>(null);
  useEffect(() => { void rcmApi<{ events: NonNullable<typeof events> }>('audit', { accountId }).then(d => setEvents(d.success ? d.events : [])); }, [accountId]);
  if (!events) return <div style={box}><p style={small}><Loader size={13} className="spin" /> Loading…</p></div>;
  return (
    <div style={{ ...box, ...scroller }} data-testid="audit">
      <p style={{ ...small, marginBottom: 8 }}>Every time somebody opened this workspace’s billing, viewed a claim or a remittance, or changed anything — newest first. It cannot be edited or deleted, by anybody.</p>
      <table style={table}>
        <thead><tr>{['When', 'Who', 'What', 'Claim'].map(h => <th key={h} style={th}>{h}</th>)}</tr></thead>
        <tbody>{events.map(e => <tr key={e.id}><td style={{ ...td, whiteSpace: 'nowrap' }}>{new Date(e.at).toLocaleString()}</td><td style={td}>{e.byEmail} ({e.byRole})</td><td style={td}>{EVENT_WORDS[e.kind] ?? e.kind.replace(/_/g, ' ')}</td><td style={td}>{e.claimNo ?? '—'}</td></tr>)}</tbody>
      </table>
    </div>
  );
}

/* ── Set-up ── */

function Setup({ o, accountId, reload }: { o: Overview; accountId: string; reload: () => void }) {
  const { busy, act, errorFor } = useAct(accountId, reload);
  const [s, setS] = useState({ baaSignedOn: o.settings.baaSignedOn ?? '', timelyFilingDays: String(o.settings.timelyFilingDays), appealDays: String(o.settings.appealDays), codingReview: o.settings.codingReview });
  const [pr, setPr] = useState({ name: '', npi: '', specialty: '' });
  const [pv, setPv] = useState({ practiceId: o.practices[0]?.id ?? '', name: '', npi: '', specialty: '' });
  const [py, setPy] = useState({ name: '', code: '', kind: 'commercial', timelyFilingDays: '', fees: '' });
  const [confirm, setConfirm] = useState('');
  const fees = useMemo(() => Object.fromEntries(py.fees.split(/\n+/).map(l => l.split(/[=:\s]+/)).filter(p => p[0]).map(p => [p[0].trim(), p[1] ?? ''])), [py.fees]);
  const section = (title: string, children: ReactNode, testid?: string) => <div style={box} data-testid={testid}><h3 style={h3}>{title}</h3>{children}</div>;
  return (
    <div style={{ display: 'grid', gap: 10, minWidth: 0 }}>
      {section('This workspace', (
        <>
          <div style={grid}>
            <label style={label}>BAA signed on<input style={input} type="date" data-field="settings.baaSignedOn" value={s.baaSignedOn} max={todayIso()} onChange={e => setS(x => ({ ...x, baaSignedOn: e.target.value }))} /></label>
            <label style={label}>Default filing limit (days)<input style={input} data-field="settings.timelyFilingDays" value={s.timelyFilingDays} onChange={e => setS(x => ({ ...x, timelyFilingDays: e.target.value }))} inputMode="numeric" /></label>
            <label style={label}>Appeal window (days)<input style={input} data-field="settings.appealDays" value={s.appealDays} onChange={e => setS(x => ({ ...x, appealDays: e.target.value }))} inputMode="numeric" /></label>
            <label style={{ ...label, alignContent: 'end' }}><span><input type="checkbox" checked={s.codingReview} onChange={e => setS(x => ({ ...x, codingReview: e.target.checked }))} /> Every claim passes coding review</span></label>
          </div>
          <button style={{ ...primary, marginTop: 10 }} disabled={!!busy} onClick={() => void act('settings', 'settings_save', { settings: { ...s, timelyFilingDays: Number(s.timelyFilingDays), appealDays: Number(s.appealDays) } })} data-testid="settings-save">Save</button>
          <Err text={errorFor('settings')} />
        </>
      ))}
      {section('Practices', (
        <>
          {o.practices.map(p => <p key={p.id} style={small}><b style={{ color: INK }}>{p.name}</b>{p.npi ? ` · NPI ${p.npi}` : ''}{p.specialty ? ` · ${p.specialty}` : ''}{p.synthetic ? ' · synthetic' : ''}</p>)}
          <div style={{ ...grid, marginTop: 8 }}>
            <label style={label}>Practice name<input style={input} data-field="practice.name" value={pr.name} onChange={e => setPr(x => ({ ...x, name: e.target.value }))} /></label>
            <label style={label}>Group NPI <i style={{ fontWeight: 500 }}>(optional)</i><input style={input} data-field="practice.npi" value={pr.npi} onChange={e => setPr(x => ({ ...x, npi: e.target.value }))} inputMode="numeric" /></label>
            <label style={label}>Specialty<input style={input} value={pr.specialty} onChange={e => setPr(x => ({ ...x, specialty: e.target.value }))} /></label>
          </div>
          <button style={{ ...btn, marginTop: 8 }} disabled={!!busy} onClick={() => void act('practice', 'practice_save', { practice: pr }, () => setPr({ name: '', npi: '', specialty: '' }))} data-testid="practice-save"><Plus size={13} /> Add the practice</button>
          <Err text={errorFor('practice')} />
        </>
      ))}
      {section('Providers', (
        <>
          {o.providers.map(p => <p key={p.id} style={small}><b style={{ color: INK }}>{p.name}</b> · NPI {p.npi}{p.specialty ? ` · ${p.specialty}` : ''}{p.active ? '' : ' · inactive'}</p>)}
          <div style={{ ...grid, marginTop: 8 }}>
            <label style={label}>Practice<select style={input} data-field="provider.practice" value={pv.practiceId} onChange={e => setPv(x => ({ ...x, practiceId: e.target.value }))}><option value="">Choose…</option>{o.practices.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}</select></label>
            <label style={label}>Name<input style={input} data-field="provider.name" value={pv.name} onChange={e => setPv(x => ({ ...x, name: e.target.value }))} /></label>
            <label style={label}>Individual NPI<input style={input} data-field="provider.npi" value={pv.npi} onChange={e => setPv(x => ({ ...x, npi: e.target.value }))} inputMode="numeric" /></label>
            <label style={label}>Specialty<input style={input} value={pv.specialty} onChange={e => setPv(x => ({ ...x, specialty: e.target.value }))} /></label>
          </div>
          <button style={{ ...btn, marginTop: 8 }} disabled={!!busy} onClick={() => void act('provider', 'provider_save', { provider: pv }, () => setPv(x => ({ ...x, name: '', npi: '', specialty: '' })))} data-testid="provider-save"><Plus size={13} /> Add the provider</button>
          <Err text={errorFor('provider')} />
        </>
      ))}
      {section('Payers and fee schedules', (
        <>
          {o.payers.map(p => <p key={p.id} style={small}><b style={{ color: INK }}>{p.name}</b> · {PAYER_KINDS[p.kind]}{p.code ? ` · ${p.code}` : ''} · filing limit {p.timelyFilingDays ?? o.settings.timelyFilingDays} days · {Object.keys(p.fees).length} contracted rates</p>)}
          <div style={{ ...grid, marginTop: 8 }}>
            <label style={label}>Payer name<input style={input} data-field="payer.name" value={py.name} onChange={e => setPy(x => ({ ...x, name: e.target.value }))} /></label>
            <label style={label}>Payer ID<input style={input} value={py.code} onChange={e => setPy(x => ({ ...x, code: e.target.value }))} /></label>
            <label style={label}>Kind<select style={input} data-field="payer.kind" value={py.kind} onChange={e => setPy(x => ({ ...x, kind: e.target.value }))}>{Object.entries(PAYER_KINDS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select></label>
            <label style={label}>Filing limit (days)<input style={input} data-field="payer.timelyFilingDays" value={py.timelyFilingDays} onChange={e => setPy(x => ({ ...x, timelyFilingDays: e.target.value }))} inputMode="numeric" placeholder={String(o.settings.timelyFilingDays)} /></label>
          </div>
          <label style={{ ...label, marginTop: 8 }}>Contracted rates, one per line — code = allowed amount per unit<textarea style={{ ...input, minHeight: 70, fontFamily: 'ui-monospace, monospace' }} data-field="payer.fees" value={py.fees} onChange={e => setPy(x => ({ ...x, fees: e.target.value }))} placeholder={'99213 = 92.00\n99214 = 131.00'} /></label>
          <button style={{ ...btn, marginTop: 8 }} disabled={!!busy} onClick={() => void act('payer', 'payer_save', { payer: { ...py, fees } }, () => setPy({ name: '', code: '', kind: 'commercial', timelyFilingDays: '', fees: '' }))} data-testid="payer-save"><Plus size={13} /> Add the payer</button>
          <Err text={errorFor('payer')} />
        </>
      ))}
      {o.settings.mode === 'synthetic' && section('Synthetic test data', (
        <>
          <p style={small}>A made-up practice with claims in every state, a remittance already posted, denials, prior authorizations and leakage to find — to try every screen. It goes only into your own workspace, never a practice’s, and is labelled synthetic everywhere.</p>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 8 }}>
            {o.as.owner && o.as.mine && <button style={btn} disabled={!!busy} onClick={() => void act('seed', 'synthetic_seed', {})} data-testid="synthetic-seed"><Download size={13} /> Load the synthetic practice</button>}
            <button style={btn} disabled={!!busy} onClick={() => void act('purge', 'synthetic_purge', {})} data-testid="synthetic-purge">Remove all synthetic data</button>
          </div>
          <Err text={errorFor('seed') || errorFor('purge')} />
        </>
      ), 'synthetic')}
      {o.as.owner && o.settings.mode === 'synthetic' && section('Real patient data', (
        <>
          <p style={small}>Switching this workspace to live data cannot be undone. It needs every launch checklist item signed off{o.blockersCleared ? ' (done)' : ' (not yet)'}, the BAA date above, no synthetic data left here, and your own 2-step sign-in. After it, everybody who opens this workspace needs 2-step sign-in.</p>
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', alignItems: 'end', marginTop: 8 }}>
            <label style={{ ...label, flex: '0 1 160px' }}>Type LIVE to confirm<input style={input} data-field="golive.confirm" value={confirm} onChange={e => setConfirm(e.target.value)} /></label>
            <button style={btn} disabled={!!busy} onClick={() => void act('live', 'go_live', { confirm })} data-testid="go-live"><Lock size={13} /> Switch to live data</button>
          </div>
          <Err text={errorFor('live')} />
        </>
      ))}
    </div>
  );
}

/* ── The owner's launch checklist ── */

function LaunchChecklist() {
  const [d, setD] = useState<{ blockers: { key: string; title: string; detail: string; done: { doneBy: string; doneAt: string; note: string } | null }[]; cleared: boolean } | null>(null);
  const [notes, setNotes] = useState<Record<string, string>>({});
  const [err, setErr] = useState<{ key: string; text: string } | null>(null);
  const load = useCallback(() => { void rcmApi<NonNullable<typeof d>>('blockers').then(x => { if (x.success) setD(x); }); }, []);
  useEffect(() => { load(); }, [load]);
  async function set(key: string, done: boolean) {
    setErr(null);
    const x = await rcmApi('blocker_set', { key, done, note: notes[key] ?? '' });
    if (!x.success) { setErr({ key, text: x.error ?? 'That did not save.' }); return; }
    load();
  }
  if (!d) return <div style={box}><p style={small}><Loader size={13} className="spin" /> Loading…</p></div>;
  return (
    <div style={box} data-testid="launch-checklist">
      <h3 style={h3}>Before real patient data — the launch checklist</h3>
      <p style={small}>{d.cleared ? 'Every item is signed off. Each practice workspace can now be switched to live data under Set-up.' : 'Until every item is signed off, every practice workspace stays on synthetic data. The reasoning for each is in docs/HIPAA-LAUNCH-BLOCKERS.md.'}</p>
      <div style={{ display: 'grid', gap: 8, marginTop: 10 }}>
        {d.blockers.map(b => (
          <div key={b.key} style={{ padding: 10, borderRadius: 10, border: `1px solid ${LINE}`, background: b.done ? '#f0fdf4' : '#fff' }} data-blocker={b.key}>
            <p style={{ margin: 0, fontSize: 13, fontWeight: 700, color: INK }}>{b.done ? <Check size={13} style={{ color: GOOD, verticalAlign: '-2px' }} /> : null} {b.title}</p>
            <p style={{ ...small, marginTop: 2 }}>{b.detail}</p>
            {b.done ? (
              <p style={{ ...small, marginTop: 4 }}>Signed off by {b.done.doneBy} on {day(b.done.doneAt)}: “{b.done.note}” <button style={{ ...btn, padding: '3px 8px' }} onClick={() => void set(b.key, false)}>Undo</button></p>
            ) : (
              <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', alignItems: 'end', marginTop: 6 }}>
                <label style={{ ...label, flex: '1 1 240px' }}>How it was done<input style={input} data-field="blocker.note" value={notes[b.key] ?? ''} onChange={e => setNotes(n => ({ ...n, [b.key]: e.target.value }))} placeholder="Who, which document, where it is kept" /></label>
                <button style={btn} onClick={() => void set(b.key, true)}>Sign off</button>
              </div>
            )}
            {err?.key === b.key && <Err text={err.text} />}
          </div>
        ))}
      </div>
    </div>
  );
}
