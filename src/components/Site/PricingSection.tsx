/**
 * The home page's pricing: three priced plans and Custom, monthly or yearly,
 * each with "Show full details", and a way to the full page (/pricing).
 *
 * The cards are PricingParts.tsx — generated from the plan table the server
 * enforces, so the page cannot promise a number nothing holds anybody to.
 * What is the same on every plan is said once, under the cards.
 */
import { useState, type ReactNode } from 'react';
import { ArrowRight, Check } from 'lucide-react';
import { BillingToggle, PlanCards, usePlanTable } from './PricingParts';

/**
 * `intro` replaces the paragraph under the heading and `after` adds a block
 * under the cards — the trade pages say what the price does and does not
 * cover for their reader. The cards and the numbers are the same everywhere.
 */
export default function PricingSection({ intro, after, eyebrow = 'Pricing' }: { intro?: ReactNode; after?: ReactNode; eyebrow?: string } = {}) {
  const table = usePlanTable();
  const [yearly, setYearly] = useState(false);

  return (
    <section className="dc-pricing" id="pricing">
      <div className="dc-chapter-head">
        <span className="dc-eyebrow">{eyebrow}</span>
        <h2>Three plans, <em>or one built around you.</em></h2>
        {intro ?? (
          <p>
            Every plan starts with 7 days free, and no card is asked for until you choose one. Each says exactly
            how much it makes for you a month — business workspaces, posts, Shorts, prospects — and your Usage page shows
            what is left. Every plan is white-label: your name, logo and colours.
          </p>
        )}
      </div>

      <BillingToggle yearly={yearly} onChange={setYearly} />
      <PlanCards table={table} yearly={yearly} customHref="/pricing#custom" />

      <div className="dc-plan-included">
        <strong>Every plan includes</strong>
        <ul>{table.included.map(f => <li key={f}><Check size={12} /> {f}</li>)}</ul>
        <p>
          The free trial runs on a smaller allowance ({table.trial.limits.autopilot_projects} AI Autopilot business workspaces,
          {' '}{table.trial.limits.ai_shorts} AI Shorts, {table.trial.limits.social_posts} social posts) and needs no card.
          Allowances are shared by every workspace you run. What you charge your own clients is yours to set.
        </p>
        <a className="dc-btn dc-btn-outline dc-plan-all" href="/pricing">Compare every plan in detail <ArrowRight size={14} /></a>
      </div>
      {after}
    </section>
  );
}
