/**
 * The home page's industry sites, after its pricing.
 *
 * The growth service for HVAC and roofing is priced in the section above
 * (HomePricing); its card here repeats only the one-line price from
 * lib/offers.ts and leads to the two trade sites. Medical billing is a
 * different offer, priced after an assessment, and never carries the trades'
 * performance fee.
 */
import { ArrowRight, Home, Stethoscope, Thermometer } from 'lucide-react';
import { MEDICAL_BILLING_OFFER, TRADE_GROWTH_OFFER as O, growthLine } from '../../../worker/src/lib/offers';

export default function ServiceOffers() {
  return (
    <section className="ind-sec so" id="services" aria-label="Industry services">
      <div className="dc-chapter-head">
        <span className="dc-eyebrow">Industries</span>
        <h2>Built for your trade, <em>priced in the open.</em></h2>
        <p>Each industry has its own site, its own terms and its own price.</p>
      </div>

      <div className="so-cards">
        <article className="so-card" data-testid="offer-growth">
          <div className="so-head">
            <span className="dc-tile-icon"><Thermometer size={16} /></span>
            <span className="dc-tile-icon"><Home size={16} /></span>
            <h3>{O.name}</h3>
          </div>
          <div className="so-price so-price-one"><div><b className="so-line">{growthLine()}</b><span>the pricing above, the same on both sites</span></div></div>
          <p className="so-separate"><b>Paid separately, by you:</b> your advertising budget, and any approved third-party expenses.</p>
          <div className="so-links">
            <a href="/hvac">HVAC <ArrowRight size={13} /></a>
            <a href="/roofing">Roofing <ArrowRight size={13} /></a>
          </div>
        </article>

        <article className="so-card" data-testid="offer-medical">
          <div className="so-head">
            <span className="dc-tile-icon"><Stethoscope size={16} /></span>
            <h3>{MEDICAL_BILLING_OFFER.name}</h3>
          </div>
          <div className="so-price so-price-one"><div><b>By assessment</b><span>quoted for your practice</span></div></div>
          <p>{MEDICAL_BILLING_OFFER.note}</p>
          <p className="so-separate"><b>Priced on:</b> {MEDICAL_BILLING_OFFER.factors.slice(0, 4).join(', ').toLowerCase()}, and more.</p>
          <div className="so-links"><a href="/medical-billing">Medical billing <ArrowRight size={13} /></a></div>
        </article>
      </div>
    </section>
  );
}
