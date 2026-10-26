/**
 * The growth service's price, as the HVAC and roofing sites show it.
 *
 * The figures, the scope and the two disclosures are GrowthOfferBlock — the
 * same block the home page draws — so the three pages quote one offer. What is
 * only on the trade sites is around it: what stays with the contractor's team,
 * the written limits, and what their own agreement will state.
 */
import { Minus } from 'lucide-react';
import { TRADE_GROWTH_OFFER as O } from '../../../worker/src/lib/offers';
import GrowthOfferBlock from './GrowthOfferBlock';
import { BookCall } from './Microsite';

export default function GrowthPricing({ intro }: { intro: string }) {
  return (
    <section className="ind-sec gp" id="pricing" aria-label="Pricing">
      <div className="dc-chapter-head">
        <span className="dc-eyebrow">Pricing</span>
        <h2>One setup fee, one monthly fee, <em>and a share only of what you collect.</em></h2>
        <p>{intro}</p>
      </div>

      <GrowthOfferBlock />

      <div className="gp-grid">
        <div className="gp-card">
          <h3><Minus size={15} /> What stays with your team</h3>
          <ul className="gp-list">{O.contractorDuties.map(i => <li key={i}>{i}</li>)}</ul>
          <p className="gp-limits">{O.limits}</p>
        </div>
        <div className="gp-card">
          <h3>Reviewed before it is invoiced</h3>
          <p>Each month you see the jobs and payments behind the fee and can query any line. The fee is invoiced only after that review, and nothing is charged to a card automatically.</p>
          <p>{O.feeBasis}</p>
        </div>
      </div>

      <div className="gp-agreement">
        <h3>Written into your own agreement</h3>
        <ul>{O.agreementTerms.map(t => <li key={t}>{t}</li>)}</ul>
        <p>Changes to these public prices never change an agreement you have signed.</p>
      </div>

      <div className="dc-cta-pair gp-cta"><BookCall size="lg" /></div>
    </section>
  );
}
