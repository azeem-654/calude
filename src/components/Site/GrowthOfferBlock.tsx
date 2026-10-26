/**
 * The growth service's price and its disclosures — one block, drawn the same
 * on the home page, /hvac and /roofing.
 *
 * Every word and figure is lib/offers.ts, and this is the only component that
 * lays them out, so the three pages cannot drift: a change to the offer is a
 * change to one constant, and a disclosure cannot be dropped from one page
 * without being dropped from all three. It keeps apart the things a buyer
 * confuses — the one-time setup, the monthly fee, the performance fee and what
 * it is taken of, and the costs that are never ours. It takes no props on
 * purpose: nothing about the price may differ between the pages.
 */
import { Check, Info, Receipt } from 'lucide-react';
import { TRADE_GROWTH_OFFER as O, dollars, growthExample, growthLine, percent } from '../../../worker/src/lib/offers';

export default function GrowthOfferBlock() {
  return (
    <div className="go" data-testid="growth-offer">
      <p className="go-line" data-testid="growth-line">{growthLine()}</p>

      <div className="gp-figures" data-testid="growth-figures">
        <div className="gp-fig">
          <b>{dollars(O.setupCents)}</b>
          <span>{O.labels.setup}</span>
          <p>Paid once. Your CRM, pipeline, lead capture and tracking, set up and checked with you.</p>
        </div>
        <div className="gp-plus" aria-hidden="true">+</div>
        <div className="gp-fig">
          <b>{dollars(O.monthlyCents)}<small>/month</small></b>
          <span>{O.labels.monthly}</span>
          <p>The platform and the service work agreed with you, billed monthly.</p>
        </div>
        <div className="gp-plus" aria-hidden="true">+</div>
        <div className="gp-fig">
          <b>{percent(O.performanceBps)}</b>
          <span>{O.labels.performance}</span>
          <p>Only on money actually collected for qualifying jobs, under your agreement.</p>
        </div>
      </div>

      <div className="go-includes" data-testid="growth-includes">
        <h3>The offer includes, subject to the actual agreed service scope:</h3>
        <ul>{O.includes.map(i => <li key={i}><Check size={13} aria-hidden="true" /> <span>{i}.</span></li>)}</ul>
      </div>

      <div className="go-disclose">
        <div className="go-note" data-testid="cost-disclosure">
          <h3><Info size={15} aria-hidden="true" /> Important cost disclosure</h3>
          <p>{O.costDisclosure}</p>
        </div>
        <div className="go-note" data-testid="fee-disclosure">
          <h3><Receipt size={15} aria-hidden="true" /> Performance-fee disclosure</h3>
          <p>{O.feeDisclosure}</p>
          <p className="go-example" data-testid="fee-example">{growthExample()}</p>
        </div>
      </div>
    </div>
  );
}
