/**
 * The home page's pricing: the growth service, the offer new prospects are
 * sold. The software plans' cards ($49 / $97 / $197) are no longer shown here
 * — the owner's decision of 2026-10-26. They still exist in allowances.ts, on
 * /pricing (which existing subscribers reach from Plan & billing) and on every
 * subscription already sold; nothing here reprices anybody.
 *
 * The button books the strategy call while the owner is taking bookings. While
 * they are not, it opens the inquiry form below instead — a "Book" button
 * that lands on "bookings are closed" is worse than no button. The form is
 * always one click away ("Prefer to write?") and opens by itself when the
 * visitor arrives at /#enquire (where the closed booking page sends them).
 */
import { useEffect, useRef, useState } from 'react';
import { CalendarCheck, Mail } from 'lucide-react';
import { TRADE_GROWTH_OFFER as O } from '../../../worker/src/lib/offers';
import { strategyCallHref, useBookingState } from '../../services/strategyCall';
import GrowthOfferBlock from './GrowthOfferBlock';
import { EnquiryForm } from './PricingPage';

export default function HomePricing() {
  const closed = useBookingState() === 'closed';
  const [writing, setWriting] = useState(false);
  const formRef = useRef<HTMLDivElement | null>(null);
  const open = writing || closed;

  const toForm = () => {
    setWriting(true);
    setTimeout(() => formRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 40);
  };
  useEffect(() => {
    if (window.location.hash === '#enquire') toForm();
  }, []);

  return (
    <section className="ind-sec gp hp" id="pricing" aria-label="Pricing">
      <div className="dc-chapter-head">
        <span className="dc-eyebrow">Pricing</span>
        <h2>{O.headline}</h2>
        <p className="hp-sub">{O.subhead}</p>
        <p>{O.summary}</p>
      </div>

      <GrowthOfferBlock />

      <div className="dc-cta-pair gp-cta">
        {closed ? (
          <button type="button" className="dc-btn dc-btn-primary dc-btn-lg" onClick={toForm} data-testid="home-book" data-booking="closed">
            <Mail size={16} /> Tell Us About Your Business
          </button>
        ) : (
          <a className="dc-btn dc-btn-primary dc-btn-lg" href={strategyCallHref('main')} data-testid="home-book" data-booking="open">
            <CalendarCheck size={16} /> Book a Strategy Call
          </a>
        )}
        {!open && (
          <button type="button" className="dc-btn dc-btn-outline dc-btn-lg" onClick={toForm} data-testid="home-write">Prefer to write?</button>
        )}
      </div>
      {closed && <p className="hp-closed" role="status">Calls are not being booked at the moment. Write to us below and a person replies by email.</p>}

      {open && (
        <div className="hp-form" id="enquire" ref={formRef} data-testid="home-enquire">
          <EnquiryForm context="Growth service — home page" needs={false} placeholder="Your trade, your area, how leads reach you now and what you would like more of…" />
        </div>
      )}
    </section>
  );
}
