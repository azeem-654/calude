/**
 * The growth service's price, as the HVAC and roofing sites show it.
 *
 * Every figure comes from lib/offers.ts — the same constants the structured
 * data and (from phase 2) a new customer agreement read — so this page cannot
 * quote a number nobody is held to. It separates the five things a buyer
 * confuses: the one-time setup, the monthly fee, the performance fee and what
 * it is taken of, and the two costs that are never ours (advertising and
 * approved third-party charges).
 */
import { Check, Minus } from 'lucide-react';
import { TRADE_GROWTH_OFFER as O, dollars, feeOn, percent } from '../../../worker/src/lib/offers';
import { BookCall } from './Microsite';

export default function GrowthPricing({ trade, intro }: { trade: string; intro: string }) {
  const pct = percent(O.performanceBps);
  return (
    <section className="ind-sec gp" id="pricing" aria-label="Pricing">
      <div className="dc-chapter-head">
        <span className="dc-eyebrow">Pricing</span>
        <h2>One setup fee, one monthly fee, <em>and a share only of what you collect.</em></h2>
        <p>{intro}</p>
      </div>

      <div className="gp-figures" data-testid="growth-figures">
        <div className="gp-fig">
          <b>{dollars(O.setupCents)}</b>
          <span>one-time setup</span>
          <p>Your {trade} pipeline, lead capture, tracking and the agreed campaigns, set up and checked with you.</p>
        </div>
        <div className="gp-plus" aria-hidden="true">+</div>
        <div className="gp-fig">
          <b>{dollars(O.monthlyCents)}<small>/month</small></b>
          <span>platform and agreed service</span>
          <p>The software, the agreed prospecting, campaign and follow-up work, and the monthly report.</p>
        </div>
        <div className="gp-plus" aria-hidden="true">+</div>
        <div className="gp-fig">
          <b>{pct}</b>
          <span>of eligible attributed collections</span>
          <p>Only on money you actually collect for completed jobs the service brought in — never your whole business.</p>
        </div>
      </div>

      <div className="gp-grid">
        <div className="gp-card">
          <h3>What the {pct} is taken of</h3>
          <p>{O.feeBasis}</p>
          <div className="gp-example" aria-label="A worked example">
            <div><span>An eligible job you collect in full</span><b>{dollars(800_000)} → {dollars(feeOn(800_000, O.performanceBps))}</b></div>
            <div><span>Collected so far on that job</span><b>{dollars(300_000)} → {dollars(feeOn(300_000, O.performanceBps))}</b></div>
            <small>An illustration of the arithmetic, not a forecast. The rest of the fee follows only as you are paid.</small>
          </div>
        </div>
        <div className="gp-card">
          <h3>Paid separately, never to us</h3>
          {O.separate.map(s => <p key={s.title}><b>{s.title}.</b> {s.body}</p>)}
          <p><b>Reviewed before it is invoiced.</b> Each month you see the jobs and payments behind the fee and can query any line. Nothing is charged to a card automatically.</p>
        </div>
      </div>

      <div className="ind-outcomes gp-scope">
        <div className="ind-outcome-card">
          <h3><Check size={15} /> What the service includes</h3>
          <ul>{O.includes.map(i => <li key={i}><Check size={13} aria-hidden="true" /> <span>{i}</span></li>)}</ul>
        </div>
        <div className="ind-outcome-card ind-limits">
          <h3><Minus size={15} /> What stays with your team</h3>
          <ul>{O.contractorDuties.map(i => <li key={i}><Minus size={13} aria-hidden="true" /> <span>{i}</span></li>)}</ul>
          <p className="gp-limits">{O.limits}</p>
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
