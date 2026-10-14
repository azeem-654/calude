/**
 * The site's pricing — four packages, monthly or yearly.
 *
 * Every number on a card is generated from the plan's limits
 * (`featureLines` in worker/src/lib/allowances.ts), the table the server
 * enforces and checkout charges from. It is drawn at once from that file and
 * then from `/api/allowances.php` `plans`, which carries the install owner's
 * changes — so a card never promises a number the server does not hold.
 *
 * What is the same on every plan is said once, under the cards: listing it on
 * a higher plan would sell somebody a thing they already had.
 */
import { useEffect, useState } from 'react';
import { ArrowRight, Check } from 'lucide-react';
import { appHref, isCrossOrigin } from '../../services/hosts';
import { track } from '../../services/funnel';
import { DEFAULT_TABLE, annualSaving, dollars, featureLines, fetchPlans, type PlanTable } from '../../services/allowances';
import { useRevealGroup } from './useReveal';

const cross = (href: string) => (isCrossOrigin(href) ? { rel: 'noopener' as const } : {});

export default function PricingSection() {
  const [table, setTable] = useState<PlanTable>(DEFAULT_TABLE);
  const [yearly, setYearly] = useState(false);
  const cards = useRevealGroup<HTMLDivElement>('.dc-plan');
  useEffect(() => { void fetchPlans().then(t => { if (t) setTable(t); }); }, []);
  const signup = appHref('/signup');

  return (
    <section className="dc-pricing" id="pricing">
      <div className="dc-chapter-head">
        <span className="dc-eyebrow">Pricing</span>
        <h2>Pick the size. <em>Every number is enforced, not estimated.</em></h2>
        <p>
          Every plan starts with 7 days free, and no card is asked for until you choose one. Each plan
          says exactly how much it makes for you a month — projects, posts, Shorts, prospects — and
          your Usage page shows what is left. Monthly allowances start again on the 1st.
        </p>
      </div>

      <div className="dc-billing-toggle" role="radiogroup" aria-label="Billing period">
        <button type="button" role="radio" aria-checked={!yearly} className={!yearly ? 'on' : ''} onClick={() => setYearly(false)}>Monthly</button>
        <button type="button" role="radio" aria-checked={yearly} className={yearly ? 'on' : ''} onClick={() => setYearly(true)}>
          Yearly <span className="dc-billing-save">2 months free</span>
        </button>
      </div>

      <div className="dc-plans dc-plans-4 stagger" ref={cards}>
        {table.plans.map(p => (
          <div key={p.id} data-plan={p.id} className={`dc-plan${p.featured ? ' featured' : ''}`}>
            {p.featured && <span className="dc-plan-flag">Most popular</span>}
            <h3>{p.name}</h3>
            <div className="dc-plan-price">
              <span>$</span>{dollars(yearly ? p.annualCents : p.monthlyCents)}<small>/{yearly ? 'year' : 'month'}</small>
            </div>
            <p className="dc-plan-tag">
              {yearly ? `Saves $${dollars(annualSaving(p))} a year · ` : ''}{p.tagline}
            </p>
            <ul>{featureLines(p).map(f => <li key={f}><Check size={12} /> {f}</li>)}</ul>
            <a className={`dc-btn ${p.featured ? 'dc-btn-primary' : 'dc-btn-outline'}`} href={signup} {...cross(signup)} onClick={() => track('trial_cta_clicked')}>
              Start free <ArrowRight size={14} />
            </a>
            <small className="dc-plan-note">7 days free · No card required</small>
          </div>
        ))}
      </div>

      <div className="dc-plan-included">
        <strong>Every plan includes</strong>
        <ul>{table.included.map(f => <li key={f}><Check size={12} /> {f}</li>)}</ul>
        <p>
          The free trial runs on a smaller allowance ({table.trial.limits.autopilot_projects} AI Autopilot projects,
          {' '}{table.trial.limits.ai_shorts} AI Shorts, {table.trial.limits.social_posts} social posts) and needs no card.
          Allowances are shared by every workspace you run. What you charge your own clients is yours to set.
        </p>
      </div>
    </section>
  );
}
