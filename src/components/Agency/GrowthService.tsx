/**
 * Growth service — the install owner's side of the HVAC/roofing offer.
 *
 *   - Customers: every signed-up account, with its agreement and what is
 *     waiting on whom; opening one shows its agreement and its ledger
 *     (Jobs/JobsRevenue.tsx `Ledger`, with the owner's powers).
 *   - Terms: the owner's commercial terms, effective-dated. A new row applies
 *     to agreements drafted from its date; a signed agreement keeps the terms
 *     it was signed on (fixed by a trigger in migration 0077, not only here).
 *
 * The server refuses all of it to anybody but the install owner
 * (routes/leadRevenue.ts); the route being hidden is a courtesy.
 */
import { useCallback, useEffect, useState } from 'react';
import { ArrowLeft, Check, Loader } from 'lucide-react';
import { usePageTitle } from '../../services/pageTitle';
import { isInstallOwner } from '../../services/moderation';
import { DEFAULT_TERMS, EXCLUSION_KINDS, money, type Terms } from '../../../worker/src/lib/leadRevenue';
import { Err, INK, LINE, Ledger, MUTED, box, btn, grid, input, label, primary, revApi, type Agreement, type Overview } from '../Jobs/JobsRevenue';

interface Customer { email: string; name: string; accountId: string; agreement: string | null; leads: number; awaitingConfirm: number; openStatements: number; openQueries: number }
interface TermRow { id: string; effective_from: string; setup_cents: number; monthly_cents: number; performance_bps: number; attribution_days: number; exclusions: string; note: string; created_by: string }

const small: React.CSSProperties = { fontSize: 12.5, color: MUTED, margin: 0, lineHeight: 1.5 };
const pct = (bps: number) => `${Number((bps / 100).toFixed(2))}%`;
const todayIso = () => new Date().toISOString().slice(0, 10);

export default function GrowthService() {
  usePageTitle('Growth service');
  const [tab, setTab] = useState<'customers' | 'terms'>('customers');
  const [open, setOpen] = useState<Customer | null>(null);
  if (!isInstallOwner()) {
    return <div style={{ padding: 28 }}><div style={box}><p style={small}>The growth service is run by the install owner. Your own jobs and revenue are under Sales → Jobs &amp; revenue.</p></div></div>;
  }
  return (
    <div style={{ padding: 'clamp(12px, 3vw, 28px)', maxWidth: 1180, margin: '0 auto', display: 'grid', gap: 14, minWidth: 0 }}>
      <div>
        <h1 style={{ margin: 0, fontSize: 'clamp(20px, 3vw, 26px)', fontWeight: 800, color: INK }}>Growth service</h1>
        <p style={{ ...small, fontSize: 13.5, marginTop: 4 }}>Agreements, each customer’s lead-to-revenue ledger, and performance-fee statements. Nothing here charges anybody: an approved fee is invoiced separately.</p>
      </div>
      {open ? (
        <CustomerView c={open} back={() => setOpen(null)} />
      ) : (
        <>
          <div role="tablist" style={{ display: 'flex', gap: 6 }}>
            {(['customers', 'terms'] as const).map(t => (
              <button key={t} role="tab" aria-selected={tab === t} style={{ ...btn, ...(tab === t ? { background: INK, color: '#fff', borderColor: INK } : {}) }} onClick={() => setTab(t)}>{t === 'customers' ? 'Customers' : 'Commercial terms'}</button>
            ))}
          </div>
          {tab === 'customers' ? <Customers onOpen={setOpen} /> : <TermsTab />}
        </>
      )}
    </div>
  );
}

function Customers({ onOpen }: { onOpen: (c: Customer) => void }) {
  const [list, setList] = useState<Customer[] | null>(null);
  const [err, setErr] = useState('');
  const [q, setQ] = useState('');
  useEffect(() => { void revApi<{ customers: Customer[] }>('customers').then(d => (d.success ? setList(d.customers) : setErr(d.error ?? 'Could not load customers.'))); }, []);
  if (err) return <div style={box}><Err text={err} /></div>;
  if (!list) return <div style={box}><p style={small}><Loader size={13} className="spin" /> Loading…</p></div>;
  const shown = list.filter(c => !q || `${c.email} ${c.name}`.toLowerCase().includes(q.toLowerCase()));
  return (
    <div style={{ display: 'grid', gap: 8, minWidth: 0 }}>
      <input style={{ ...input, maxWidth: 360 }} placeholder="Find a customer by name or email" value={q} onChange={e => setQ(e.target.value)} aria-label="Find a customer" />
      {!shown.length && <div style={box}><p style={small}>No customers{q ? ' match' : ' have signed up yet'}.</p></div>}
      {shown.map(c => (
        <button key={c.accountId} onClick={() => onOpen(c)} data-customer={c.email}
          style={{ all: 'unset', boxSizing: 'border-box', background: '#fff', border: `1px solid ${LINE}`, borderRadius: 14, padding: 14, cursor: 'pointer', display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'center' }}>
          <b style={{ color: INK, minWidth: 0, overflowWrap: 'anywhere' }}>{c.name || c.email}</b>
          <span style={{ fontSize: 12.5, color: MUTED, minWidth: 0, overflowWrap: 'anywhere' }}>{c.email}</span>
          <span style={{ marginLeft: 'auto', fontSize: 12.5, color: c.agreement === 'active' ? '#15803d' : MUTED, fontWeight: 700 }}>
            {c.agreement === 'active' ? 'Agreement in force' : c.agreement === 'draft' ? 'Agreement drafted' : c.agreement === 'ended' ? 'Agreement ended' : 'No agreement'}
            {` · ${c.leads} lead${c.leads === 1 ? '' : 's'}`}
            {c.awaitingConfirm ? ` · ${c.awaitingConfirm} payment${c.awaitingConfirm === 1 ? '' : 's'} awaiting them` : ''}
            {c.openQueries ? ` · ${c.openQueries} question${c.openQueries === 1 ? '' : 's'} for you` : ''}
          </span>
        </button>
      ))}
    </div>
  );
}

function CustomerView({ c, back }: { c: Customer; back: () => void }) {
  return (
    <div style={{ display: 'grid', gap: 12, minWidth: 0 }}>
      <div><button style={btn} onClick={back}><ArrowLeft size={13} /> All customers</button></div>
      <h2 style={{ margin: 0, fontSize: 18, color: INK, overflowWrap: 'anywhere' }}>{c.name || c.email} <span style={{ fontSize: 13, color: MUTED, fontWeight: 500 }}>{c.email}</span></h2>
      <Ledger accountId={c.accountId} ownerTools={(o, reload) => <AgreementAdmin o={o} accountId={c.accountId} customerName={c.name || c.email} reload={reload} />} />
    </div>
  );
}

function TermsFields({ t, set }: { t: Terms; set: (t: Terms) => void }) {
  const dollars = (cents: number) => String(cents / 100);
  const toCents = (v: string) => Math.round(Number(v.replace(/[$,]/g, '')) * 100);
  return (
    <>
      <div style={grid}>
        <label style={label}>Setup fee ($)<input style={input} data-field="terms.setup" value={dollars(t.setupCents)} onChange={e => set({ ...t, setupCents: toCents(e.target.value) })} inputMode="decimal" /></label>
        <label style={label}>Monthly fee ($)<input style={input} data-field="terms.monthly" value={dollars(t.monthlyCents)} onChange={e => set({ ...t, monthlyCents: toCents(e.target.value) })} inputMode="decimal" /></label>
        <label style={label}>Performance fee (%)<input style={input} data-field="terms.bps" value={String(t.performanceBps / 100)} onChange={e => set({ ...t, performanceBps: Math.round(Number(e.target.value) * 100) })} inputMode="decimal" /></label>
        <label style={label}>Attribution window (days)<input style={input} data-field="terms.days" value={String(t.attributionDays)} onChange={e => set({ ...t, attributionDays: Number(e.target.value) })} inputMode="numeric" /></label>
      </div>
      <fieldset style={{ border: 'none', padding: 0, margin: '10px 0 0' }}>
        <legend style={{ fontSize: 12, fontWeight: 700, color: '#334155' }}>Left out of eligible collections</legend>
        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', marginTop: 4 }}>
          {Object.entries(EXCLUSION_KINDS).map(([k, v]) => (
            <label key={k} style={{ fontSize: 12.5, display: 'inline-flex', gap: 5, alignItems: 'center' }}>
              <input type="checkbox" checked={t.exclusions.includes(k as keyof typeof EXCLUSION_KINDS)} onChange={e => set({ ...t, exclusions: e.target.checked ? [...t.exclusions, k as keyof typeof EXCLUSION_KINDS] : t.exclusions.filter(x => x !== k) })} /> {v}
            </label>
          ))}
        </div>
      </fieldset>
    </>
  );
}

function AgreementAdmin({ o, accountId, customerName, reload }: { o: Overview; accountId: string; customerName: string; reload: () => void }) {
  const draft = o.agreements.find(a => a.status === 'draft') ?? null;
  const active = o.agreement;
  const [t, setT] = useState<Terms | null>(null);
  const [sign, setSign] = useState({ signedBy: '', signedOn: todayIso(), startsOn: todayIso() });
  const [endsOn, setEndsOn] = useState(todayIso());
  const [busy, setBusy] = useState('');
  const [err, setErr] = useState({ key: '', text: '' });
  useEffect(() => {
    if (draft) setT({ currency: draft.currency, setupCents: draft.setupCents, monthlyCents: draft.monthlyCents, performanceBps: draft.performanceBps, attributionDays: draft.attributionDays, exclusions: draft.exclusions as Terms['exclusions'] });
  }, [draft?.id]); // eslint-disable-line react-hooks/exhaustive-deps
  const run = useCallback(async (key: string, action: string, extra: Record<string, unknown>) => {
    setBusy(key); setErr({ key: '', text: '' });
    const d = await revApi(action, { accountId, ...extra });
    setBusy('');
    if (!d.success) setErr({ key, text: d.error ?? 'That did not work.' }); else reload();
  }, [accountId, reload]);
  const line = (a: Agreement) => `${money(a.setupCents)} setup · ${money(a.monthlyCents)}/month · ${pct(a.performanceBps)} · ${a.attributionDays}-day window`;
  return (
    <div style={box} data-testid="agreement-admin">
      <h3 style={{ margin: '0 0 8px', fontSize: 14.5, color: INK }}>Agreement</h3>
      {active && (
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'flex-end' }}>
          <p style={{ ...small, flex: '1 1 260px' }}>In force: {line(active)}. Its terms are fixed; to change them, end it and sign a new one.</p>
          <label style={{ ...label, flex: '0 1 170px' }}>Last day<input style={input} type="date" data-field="agreement.endsOn" value={endsOn} onChange={e => setEndsOn(e.target.value)} /></label>
          <button style={btn} disabled={busy === 'end'} onClick={() => void run('end', 'agreement_end', { id: active.id, endsOn })}>End the agreement</button>
        </div>
      )}
      {err.key === 'end' && <Err text={err.text} />}
      {!active && !draft && (
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
          <p style={{ ...small, flex: '1 1 260px' }}>No agreement yet. A draft starts from today’s commercial terms; you can adjust it for this customer before it is signed.</p>
          <button style={primary} disabled={busy === 'draft'} onClick={() => void run('draft', 'agreement_draft', { customerName })} data-testid="agreement-draft">Draft an agreement</button>
        </div>
      )}
      {err.key === 'draft' && <Err text={err.text} />}
      {draft && t && (
        <div style={{ display: 'grid', gap: 10 }}>
          <p style={small}>Draft — not yet in force, and not shown to the customer.{active ? ' It can be signed once the agreement in force has ended.' : ''}</p>
          <TermsFields t={t} set={setT} />
          <div><button style={btn} disabled={busy === 'terms'} onClick={() => void run('terms', 'agreement_terms', { id: draft.id, terms: t, customerName })}>Save the draft’s terms</button></div>
          {err.key === 'terms' && <Err text={err.text} />}
          <div style={grid}>
            <label style={label}>Signed for the customer by<input style={input} data-field="agreement.signedBy" value={sign.signedBy} onChange={e => setSign(x => ({ ...x, signedBy: e.target.value }))} /></label>
            <label style={label}>Signed on<input style={input} type="date" data-field="agreement.signedOn" value={sign.signedOn} max={todayIso()} onChange={e => setSign(x => ({ ...x, signedOn: e.target.value }))} /></label>
            <label style={label}>In force from<input style={input} type="date" data-field="agreement.startsOn" value={sign.startsOn} onChange={e => setSign(x => ({ ...x, startsOn: e.target.value }))} /></label>
          </div>
          <p style={small}>Record it as signed only once the customer has signed the written agreement. From then on its terms cannot be changed here or anywhere else.</p>
          <div><button style={primary} disabled={busy === 'sign'} onClick={() => void run('sign', 'agreement_activate', { id: draft.id, ...sign })} data-testid="agreement-sign"><Check size={13} /> Record as signed</button></div>
          {err.key === 'sign' && <Err text={err.text} />}
        </div>
      )}
    </div>
  );
}

function TermsTab() {
  const [rows, setRows] = useState<TermRow[] | null>(null);
  const [current, setCurrent] = useState<{ id: string | null; terms: Terms } | null>(null);
  const [t, setT] = useState<Terms>(DEFAULT_TERMS);
  const [from, setFrom] = useState(todayIso());
  const [note, setNote] = useState('');
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);
  const load = useCallback(() => {
    void revApi<{ terms: TermRow[]; current: { id: string | null; terms: Terms } }>('terms_list').then(d => {
      if (!d.success) { setErr(d.error ?? 'Could not load the terms.'); return; }
      setRows(d.terms); setCurrent(d.current); setT(d.current.terms);
    });
  }, []);
  useEffect(() => { load(); }, [load]);
  async function add() {
    setBusy(true); setErr('');
    const d = await revApi('terms_add', { effectiveFrom: from, terms: t, note });
    setBusy(false);
    if (!d.success) setErr(d.error ?? 'Could not save.'); else { setNote(''); load(); }
  }
  return (
    <div style={{ display: 'grid', gap: 10, minWidth: 0 }}>
      <div style={box}>
        <h3 style={{ margin: '0 0 6px', fontSize: 14.5, color: INK }}>In force today</h3>
        {current && <p style={small}>{money(current.terms.setupCents)} setup · {money(current.terms.monthlyCents)}/month · {pct(current.terms.performanceBps)} performance fee · {current.terms.attributionDays}-day attribution window{current.id ? '' : ' — the public offer, since no terms of your own have been written'}.</p>}
        <p style={{ ...small, marginTop: 6 }}>These are the starting point for a new agreement. The public website’s prices are in lib/offers.ts and change only with a release — keep the two in step.</p>
      </div>
      <div style={box}>
        <h3 style={{ margin: '0 0 10px', fontSize: 14.5, color: INK }}>New terms, from a date</h3>
        <TermsFields t={t} set={setT} />
        <div style={{ ...grid, marginTop: 10 }}>
          <label style={label}>Apply from<input style={input} type="date" data-field="terms.from" value={from} min={todayIso()} onChange={e => setFrom(e.target.value)} /></label>
          <label style={label}>Note <i style={{ fontWeight: 500 }}>(optional)</i><input style={input} value={note} onChange={e => setNote(e.target.value)} /></label>
        </div>
        <p style={{ ...small, marginTop: 8 }}>New terms reach only agreements drafted from that date. Agreements already signed keep their own.</p>
        <div style={{ marginTop: 10 }}><button style={primary} disabled={busy} onClick={() => void add()} data-testid="terms-add">Save the new terms</button></div>
        <Err text={err} />
      </div>
      {!!rows?.length && (
        <div style={box}>
          <h3 style={{ margin: '0 0 8px', fontSize: 14.5, color: INK }}>History</h3>
          {rows.map(r => <p key={r.id} style={{ ...small, marginTop: 4 }}>From {r.effective_from}: {money(r.setup_cents)} setup · {money(r.monthly_cents)}/month · {pct(r.performance_bps)} · {r.attribution_days} days{r.note ? ` — ${r.note}` : ''} <span style={{ color: '#94a3b8' }}>({r.created_by})</span></p>)}
        </div>
      )}
    </div>
  );
}
