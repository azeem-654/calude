/**
 * The pricing pieces the home page and /pricing share: the monthly/yearly
 * switch, the four cards (three priced plans and Custom), each with "Show full
 * details", and the full comparison.
 *
 * Every number and every tick is generated from the plan table
 * (worker/src/lib/allowances.ts — `featureLines`, `comparison`), read first
 * from that file and then from `/api/allowances.php` `plans`, which carries
 * the install owner's changes. So nothing here can promise what the server
 * does not enforce, and nothing is written out twice.
 */
import { useEffect, useState } from 'react';
import { ArrowRight, Check, ChevronDown, Minus } from 'lucide-react';
import { appHref, isCrossOrigin } from '../../services/hosts';
import { track } from '../../services/funnel';
import {
  CARD_PLANS, COMPARE_NOTES, CUSTOM_OFFER, DEFAULT_TABLE, annualSaving, comparison, dollars, featureLines, fetchPlans,
  type Cell, type PlanDef, type PlanTable,
} from '../../services/allowances';

const cross = (href: string) => (isCrossOrigin(href) ? { rel: 'noopener' as const } : {});

/** The packages, as the server holds them once it has answered. */
export function usePlanTable(): PlanTable {
  const [table, setTable] = useState<PlanTable>(DEFAULT_TABLE);
  useEffect(() => { void fetchPlans().then(t => { if (t) setTable(t); }); }, []);
  return table;
}

export function BillingToggle({ yearly, onChange }: { yearly: boolean; onChange: (y: boolean) => void }) {
  return (
    <div className="dc-billing-toggle" role="radiogroup" aria-label="Billing period">
      <button type="button" role="radio" aria-checked={!yearly} className={!yearly ? 'on' : ''} onClick={() => onChange(false)}>Monthly</button>
      <button type="button" role="radio" aria-checked={yearly} className={yearly ? 'on' : ''} onClick={() => onChange(true)}>
        Yearly <span className="dc-billing-save">2 months free</span>
      </button>
    </div>
  );
}

export function CellView({ v }: { v: Cell }) {
  if (v === true) return <span className="pc-yes"><Check size={14} aria-hidden="true" /><span className="sr-only">Included</span></span>;
  if (v === false) return <span className="pc-no"><Minus size={14} aria-hidden="true" /><span className="sr-only">Not included</span></span>;
  return <>{v}</>;
}

/**
 * The four cards. `customHref` is where Custom's button goes — the enquiry
 * form on /pricing, or that page from the home page.
 */
export function PlanCards({ table, yearly, customHref, onCustom }: {
  table: PlanTable; yearly: boolean; customHref: string; onCustom?: () => void;
}) {
  const plans = CARD_PLANS(table.plans);
  const groups = comparison(plans);
  const [open, setOpen] = useState<string>('');
  const signup = appHref('/signup');

  return (
    <div className="dc-plans dc-plans-4">
      {plans.map(p => {
        const custom = p.kind === 'custom';
        const shown = open === p.id;
        return (
          <div key={p.id} data-plan={p.id} className={`dc-plan${p.featured ? ' featured' : ''}${custom ? ' dc-plan-custom' : ''}`}>
            {p.featured && <span className="dc-plan-flag">Most popular</span>}
            <h3>{p.name}</h3>
            {custom
              ? <div className="dc-plan-price dc-plan-talk">Let’s talk</div>
              : <div className="dc-plan-price"><span>$</span>{dollars(yearly ? p.annualCents : p.monthlyCents)}<small>/{yearly ? 'year' : 'month'}</small></div>}
            <p className="dc-plan-tag">
              {!custom && yearly ? `Saves $${dollars(annualSaving(p))} a year · ` : ''}{p.tagline}
            </p>
            <ul>{(custom ? CUSTOM_OFFER : featureLines(p)).map(f => <li key={f}><Check size={12} /> {f}</li>)}</ul>

            <button type="button" className="dc-plan-more" aria-expanded={shown} aria-controls={`pd-${p.id}`}
              onClick={() => setOpen(shown ? '' : p.id)}>
              {shown ? 'Hide full details' : 'Show full details'} <ChevronDown size={14} className={shown ? 'up' : ''} />
            </button>
            {shown && (
              <div id={`pd-${p.id}`} className="dc-plan-details">
                {groups.map(g => (
                  <div key={g.name}>
                    <h4>{g.name}</h4>
                    <dl>
                      {g.rows.map(r => (
                        <div key={r.label}><dt>{r.label}</dt><dd><CellView v={r.values[p.id]} /></dd></div>
                      ))}
                    </dl>
                  </div>
                ))}
              </div>
            )}

            {custom
              ? <a className="dc-btn dc-btn-outline" href={customHref} onClick={e => { if (onCustom) { e.preventDefault(); onCustom(); } }}>Tell us what you need <ArrowRight size={14} /></a>
              : <a className={`dc-btn ${p.featured ? 'dc-btn-primary' : 'dc-btn-outline'}`} href={signup} {...cross(signup)} onClick={() => track('trial_cta_clicked')}>Start free <ArrowRight size={14} /></a>}
            <small className="dc-plan-note">{custom ? 'A reply from a person, by email' : '7 days free · No card required'}</small>
          </div>
        );
      })}
    </div>
  );
}

/**
 * The full comparison. A table with a header that stays in view on a wide
 * screen; on a phone five columns cannot be read, so one plan at a time with
 * a switcher above it.
 */
export function ComparisonTable({ table }: { table: PlanTable }) {
  const plans = CARD_PLANS(table.plans);
  const groups = comparison(plans);
  const [pick, setPick] = useState<string>(plans.find(p => p.featured)?.id ?? plans[0].id);
  const price = (p: PlanDef) => (p.kind === 'custom' ? 'Let’s talk' : `$${dollars(p.monthlyCents)}/mo`);

  return (
    <div className="pc-compare" data-compare>
      <div className="pc-switch" role="tablist" aria-label="Plan to show">
        {plans.map(p => (
          <button key={p.id} type="button" role="tab" aria-selected={pick === p.id} className={pick === p.id ? 'on' : ''} onClick={() => setPick(p.id)}>{p.name}</button>
        ))}
      </div>
      <table>
        <thead>
          <tr>
            <th scope="col" className="pc-feature">Compare plans</th>
            {plans.map(p => (
              <th key={p.id} scope="col" data-col={p.id} className={pick === p.id ? 'picked' : ''}>
                <span className="pc-th-name">{p.name}</span><span className="pc-th-price">{price(p)}</span>
              </th>
            ))}
          </tr>
        </thead>
        {groups.map(g => (
          <tbody key={g.name}>
            <tr className="pc-group"><th scope="rowgroup" colSpan={plans.length + 1}>{g.name}</th></tr>
            {g.rows.map(r => (
              <tr key={r.label}>
                <th scope="row" className="pc-feature">{r.label}{r.note && <small>{r.note}</small>}</th>
                {plans.map(p => <td key={p.id} data-col={p.id} className={pick === p.id ? 'picked' : ''}><CellView v={r.values[p.id]} /></td>)}
              </tr>
            ))}
          </tbody>
        ))}
      </table>
      <ul className="pc-notes">{COMPARE_NOTES.map(n => <li key={n}>{n}</li>)}</ul>
    </div>
  );
}
