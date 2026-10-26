/**
 * The home page's services and what each costs — beside, not inside, the
 * software plans.
 *
 * Two offers sold by conversation (lib/offers.ts): the growth service for HVAC
 * and roofing, with its three figures and the two costs that are never ours;
 * and medical billing, priced after an assessment. Each links to its own
 * microsite, and both to the strategy call, marked as coming from the main
 * site. The software plans keep their own section below, so a visitor never
 * reads $87 a month as a software plan or a plan's price as the service.
 */
import { ArrowRight, CalendarCheck, Home, Stethoscope, Thermometer } from 'lucide-react';
import { MEDICAL_BILLING_OFFER, TRADE_GROWTH_OFFER as O, dollars, percent } from '../../../worker/src/lib/offers';
import { strategyCallHref } from '../../services/strategyCall';

export default function ServiceOffers() {
  const book = strategyCallHref('main');
  return (
    <section className="ind-sec so" id="services" aria-label="Services and pricing">
      <div className="dc-chapter-head">
        <span className="dc-eyebrow">Services</span>
        <h2>Done with you, <em>priced in the open.</em></h2>
        <p>Besides the software, we run two services for particular industries. Each has its own site, its own terms and its own price — and neither is a software plan.</p>
      </div>

      <div className="so-cards">
        <article className="so-card" data-testid="offer-growth">
          <div className="so-head">
            <span className="dc-tile-icon"><Thermometer size={16} /></span>
            <span className="dc-tile-icon"><Home size={16} /></span>
            <h3>{O.name}</h3>
          </div>
          <div className="so-price">
            <div><b>{dollars(O.setupCents)}</b><span>setup, once</span></div>
            <div><b>{dollars(O.monthlyCents)}</b><span>a month</span></div>
            <div><b>{percent(O.performanceBps)}</b><span>of eligible attributed collections</span></div>
          </div>
          <p>The {percent(O.performanceBps)} applies only to payments collected for completed jobs the agreed service brought in — not to your existing customers or the rest of your business.</p>
          <p className="so-separate"><b>Paid separately, by you:</b> your advertising budget, and any third-party charges you approve.</p>
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

      <div className="dc-cta-pair so-cta">
        <a className="dc-btn dc-btn-primary dc-btn-lg" href={book} data-testid="home-book"><CalendarCheck size={16} /> Book a Strategy Call</a>
        <a className="dc-btn dc-btn-outline dc-btn-lg" href={book}>Discuss Your Business</a>
      </div>
    </section>
  );
}
