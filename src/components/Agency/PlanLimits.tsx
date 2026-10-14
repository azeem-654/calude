/**
 * Plans & allowances — the install owner changes what each package allows.
 *
 * One row per meter, one column per plan and the free trial. A box left blank
 * is the plan's own number (worker/src/lib/allowances.ts, shown greyed as the
 * placeholder); a number typed is the owner's, kept in `crm_plan_limits` and
 * enforced from the next request. −1 is unlimited.
 *
 * Prices are not here, on purpose: they are what checkout charges, and changing
 * one is a release (docs/PRICING.md), not a box on a screen.
 *
 * Sub-accounts are stored on each customer's plan row when they pay, so a
 * change there reaches new purchases, not people already subscribed.
 */
import { useEffect, useMemo, useState } from 'react';
import { Loader, SlidersHorizontal } from 'lucide-react';
import {
  METERS, PLAN_DEFS, TRIAL_LIMITS, dollars, fetchEnquiries, fetchGrants, fetchPlans, grantPlan, markEnquiryDone, saveLimits,
  type Enquiry, type Grant, type Limits, type MeterId, type PlanTable,
} from '../../services/allowances';

const INK = '#17191c';
const MUTED = '#6b7280';
const LINE = '#e6e9f0';

type Col = { id: string; name: string; price: string; base: Limits; now: Limits };
type Draft = Record<string, Partial<Record<MeterId, string>>>;

export default function PlanLimits() {
  const [table, setTable] = useState<PlanTable | null | undefined>(undefined);
  const [draft, setDraft] = useState<Draft>({});
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState<{ ok: boolean; text: string } | null>(null);

  useEffect(() => { void fetchPlans(true).then(setTable); }, []);

  const cols: Col[] = useMemo(() => table ? [
    { id: 'trial', name: 'Free trial', price: '7 days', base: TRIAL_LIMITS, now: table.trial.limits },
    ...table.plans.map(p => ({
      id: p.id, name: p.kind === 'legacy' ? `${p.name} (no longer sold)` : p.name,
      price: p.kind === 'custom' ? 'given by hand' : `$${dollars(p.monthlyCents)}/mo`,
      base: PLAN_DEFS.find(d => d.id === p.id)!.limits, now: p.limits,
    })),
  ] : [], [table]);

  /* The box shows the owner's number when there is one, blank when it is the plan's own. */
  const shown = (c: Col, m: MeterId) => draft[c.id]?.[m] ?? (c.now[m] !== c.base[m] ? String(c.now[m]) : '');
  const dirty = Object.values(draft).some(d => Object.keys(d).length);

  async function save() {
    setBusy(true); setNote(null);
    for (const [planId, d] of Object.entries(draft)) {
      if (!Object.keys(d).length) continue;
      const limits = Object.fromEntries(Object.entries(d).map(([k, v]) => [k, (v ?? '').trim() === '' ? '' : Number(String(v).trim())]));
      const r = await saveLimits(planId, limits as never);
      if (!r.success) { setBusy(false); setNote({ ok: false, text: r.error || 'Could not save.' }); return; }
      setTable({ plans: r.plans, trial: r.trial, included: table?.included ?? [], changed: r.changed ?? [] });
    }
    setBusy(false); setDraft({});
    setNote({ ok: true, text: 'Saved. The new numbers apply from the next request, on the site’s price cards too.' });
  }

  return (
    <section style={{ background: '#fff', border: `1px solid ${LINE}`, borderRadius: 16, padding: 'clamp(14px, 3vw, 22px)' }} aria-labelledby="pl-h" data-plan-limits>
      <h2 id="pl-h" style={{ margin: 0, fontSize: 16, fontWeight: 800, color: INK, display: 'flex', alignItems: 'center', gap: 8 }}>
        <SlidersHorizontal size={16} /> Plans &amp; allowances
      </h2>
      <p style={{ margin: '6px 0 12px', fontSize: 13, color: MUTED, lineHeight: 1.6 }}>
        What each package allows a month. Blank is the plan’s own number (shown faintly); type a number to change it,
        or −1 for unlimited. The site’s price cards and every refusal read these. Prices are changed in a release —
        see docs/PRICING.md.
      </p>
      {table === undefined && <p style={{ fontSize: 13, color: MUTED }}><Loader size={13} className="spin" /> Loading…</p>}
      {table === null && <p role="status" style={{ fontSize: 13, color: '#92400e' }}>The plans could not be read just now.</p>}
      {table && (
        <>
          <div style={{ overflowX: 'auto', border: `1px solid ${LINE}`, borderRadius: 12 }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12.5, minWidth: 720 }}>
              <thead>
                <tr style={{ background: '#f7f8fa' }}>
                  <th style={{ textAlign: 'left', padding: '8px 10px', color: MUTED, fontWeight: 700 }}>Allowance</th>
                  {cols.map(c => (
                    <th key={c.id} style={{ textAlign: 'left', padding: '8px 10px', color: INK, fontWeight: 800 }}>
                      {c.name}<div style={{ fontWeight: 600, color: MUTED, fontSize: 11 }}>{c.price}</div>
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {METERS.map(m => (
                  <tr key={m.id} style={{ borderTop: `1px solid ${LINE}` }}>
                    <td style={{ padding: '6px 10px', color: INK, fontWeight: 600 }} title={m.counted}>
                      {m.label}{m.kind === 'monthly' ? <span style={{ color: MUTED, fontWeight: 500 }}> / month</span> : null}
                    </td>
                    {cols.map(c => (
                      <td key={c.id} style={{ padding: '4px 6px' }}>
                        <input
                          data-field={`plans.${m.id}`} aria-label={`${c.name}: ${m.label}`} inputMode="numeric"
                          value={shown(c, m.id)} placeholder={c.base[m.id] < 0 ? '−1 (unlimited)' : String(c.base[m.id])}
                          onChange={e => setDraft(d => ({ ...d, [c.id]: { ...d[c.id], [m.id]: e.target.value } }))}
                          style={{ width: '100%', minWidth: 70, boxSizing: 'border-box', padding: '6px 8px', border: `1px solid ${LINE}`, borderRadius: 8, fontSize: 12.5, fontFamily: 'inherit' }}
                        />
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap', marginTop: 12 }}>
            <button type="button" disabled={!dirty || busy} onClick={() => void save()}
              style={{ display: 'inline-flex', alignItems: 'center', gap: 6, border: 'none', borderRadius: 999, padding: '8px 16px', background: INK, color: '#c8f24d', fontWeight: 700, fontSize: 13, cursor: dirty && !busy ? 'pointer' : 'default', opacity: dirty ? 1 : 0.5 }}>
              {busy ? <Loader size={14} className="spin" /> : null} Save allowances
            </button>
            {dirty && <button type="button" onClick={() => setDraft({})} style={{ border: `1px solid ${LINE}`, background: '#fff', borderRadius: 999, padding: '7px 14px', fontSize: 13, cursor: 'pointer' }}>Discard</button>}
            {note && <span role={note.ok ? 'status' : 'alert'} style={{ fontSize: 13, color: note.ok ? '#065f46' : '#991b1b' }}>{note.text}</span>}
          </div>
          <p style={{ margin: '10px 0 0', fontSize: 12, color: MUTED, lineHeight: 1.55 }}>
            Sub-accounts are fixed on a customer’s plan when they pay, so a change there reaches new purchases. Everything
            else applies to everybody on the plan at once. You are never limited.
          </p>
          <Grants plans={table.plans.map(p => ({ id: p.id, name: p.name }))} />
          <Enquiries />
        </>
      )}
    </section>
  );
}

/**
 * Give a customer a plan by hand — how a Custom plan is given, or a plan
 * agreed outside checkout. A plan the processor set is the processor's; this
 * removes only what was given here.
 */
function Grants({ plans }: { plans: { id: string; name: string }[] }) {
  const [list, setList] = useState<Grant[] | null>(null);
  const [email, setEmail] = useState('');
  const [plan, setPlan] = useState('custom');
  const [note, setNote] = useState<{ ok: boolean; text: string } | null>(null);
  const load = () => { void fetchGrants().then(setList); };
  useEffect(load, []);

  async function grant(to: string, planId: string) {
    setNote(null);
    const r = await grantPlan(to, planId);
    if (!r.success) { setNote({ ok: false, text: r.error || 'Could not do that.' }); return; }
    setNote({ ok: true, text: planId ? `${to} is on ${plans.find(p => p.id === planId)?.name ?? planId}.` : `${to}’s hand-given plan was removed.` });
    setEmail(''); load();
  }

  return (
    <div style={{ marginTop: 22, borderTop: `1px solid ${LINE}`, paddingTop: 16 }} data-grants>
      <h3 style={{ margin: 0, fontSize: 14.5, fontWeight: 800, color: INK }}>Give a customer a plan</h3>
      <p style={{ margin: '4px 0 10px', fontSize: 12.5, color: MUTED, lineHeight: 1.55 }}>
        How a Custom plan is given (its numbers are the Custom column above), or any plan agreed outside checkout.
        A plan given here is never changed by a payment or a cancellation; remove it here.
      </p>
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
        <input data-field="grant.email" aria-label="Customer email" placeholder="customer@example.com" value={email} onChange={e => setEmail(e.target.value)}
          style={{ flex: '1 1 220px', minWidth: 0, padding: '7px 10px', border: `1px solid ${LINE}`, borderRadius: 8, fontSize: 13 }} />
        <select data-field="grant.plan" aria-label="Plan" value={plan} onChange={e => setPlan(e.target.value)} style={{ padding: '7px 10px', border: `1px solid ${LINE}`, borderRadius: 8, fontSize: 13 }}>
          {plans.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
        </select>
        <button type="button" disabled={!email.trim()} onClick={() => void grant(email.trim(), plan)}
          style={{ border: 'none', borderRadius: 999, padding: '7px 14px', background: INK, color: '#c8f24d', fontWeight: 700, fontSize: 13, cursor: 'pointer' }}>Give plan</button>
      </div>
      {note && <p role={note.ok ? 'status' : 'alert'} style={{ fontSize: 12.5, margin: '8px 0 0', color: note.ok ? '#065f46' : '#991b1b' }}>{note.text}</p>}
      {list && list.length > 0 && (
        <ul style={{ listStyle: 'none', padding: 0, margin: '10px 0 0', display: 'grid', gap: 6, fontSize: 12.5 }}>
          {list.map(g => (
            <li key={g.email} style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
              <b style={{ color: INK }}>{g.email}</b> <span style={{ color: MUTED }}>{plans.find(p => p.id === g.planId)?.name ?? g.planId}</span>
              <button type="button" onClick={() => void grant(g.email, '')} style={{ border: `1px solid ${LINE}`, background: '#fff', borderRadius: 999, padding: '2px 10px', fontSize: 12, cursor: 'pointer' }}>Remove</button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

/** What visitors asked for on the public pricing page's Custom form. */
function Enquiries() {
  const [list, setList] = useState<Enquiry[] | null | undefined>(undefined);
  useEffect(() => { void fetchEnquiries().then(setList); }, []);
  const open = (list ?? []).filter(e => !e.handledAt);
  return (
    <div style={{ marginTop: 22, borderTop: `1px solid ${LINE}`, paddingTop: 16 }} data-enquiries>
      <h3 style={{ margin: 0, fontSize: 14.5, fontWeight: 800, color: INK }}>Custom plan enquiries {list ? <span style={{ color: MUTED, fontWeight: 600 }}>· {open.length} open</span> : null}</h3>
      <p style={{ margin: '4px 0 10px', fontSize: 12.5, color: MUTED, lineHeight: 1.55 }}>
        From the Custom form on the pricing page. Each is also emailed to you when your install mailbox can send.
      </p>
      {list === null && <p style={{ fontSize: 12.5, color: MUTED }}>Could not read them just now.</p>}
      {list && !list.length && <p style={{ fontSize: 12.5, color: MUTED }}>None yet.</p>}
      <div style={{ display: 'grid', gap: 8 }}>
        {(list ?? []).slice(0, 30).map(e => (
          <div key={e.id} data-enquiry-row style={{ border: `1px solid ${LINE}`, borderRadius: 10, padding: '10px 12px', opacity: e.handledAt ? 0.55 : 1, fontSize: 13 }}>
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'baseline' }}>
              <b style={{ color: INK }}>{e.name}</b>{e.company && <span style={{ color: MUTED }}>{e.company}</span>}
              <a href={`mailto:${e.email}?subject=${encodeURIComponent('Your Custom plan enquiry')}`} style={{ color: INK }}>{e.email}</a>
              <span style={{ color: MUTED, fontSize: 12 }}>{new Date(e.createdAt).toLocaleString()}</span>
            </div>
            {e.needs.length > 0 && <div style={{ color: MUTED, fontSize: 12, marginTop: 2 }}>{e.needs.join(' · ')}</div>}
            <p style={{ margin: '6px 0 0', whiteSpace: 'pre-wrap', color: '#3f4247', lineHeight: 1.5, overflowWrap: 'anywhere' }}>{e.message}</p>
            {!e.handledAt && (
              <button type="button" onClick={() => void markEnquiryDone(e.id).then(() => fetchEnquiries().then(setList))}
                style={{ marginTop: 6, border: `1px solid ${LINE}`, background: '#fff', borderRadius: 999, padding: '3px 10px', fontSize: 12, cursor: 'pointer' }}>Mark handled</button>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
