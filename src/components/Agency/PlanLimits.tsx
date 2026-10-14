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
  METERS, PLAN_DEFS, TRIAL_LIMITS, dollars, fetchPlans, saveLimits, type Limits, type MeterId, type PlanTable,
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
      id: p.id, name: p.name, price: `$${dollars(p.monthlyCents)}/mo`,
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
        </>
      )}
    </section>
  );
}
