/**
 * The home page's software pricing: Growth $97/month, Scale $297/month and
 * Custom (the owner's specification of 2026-10-28) — the same cards as
 * /pricing, drawn from the plan table the server charges and enforces
 * (PricingParts.tsx, lib/allowances.ts). No figure is typed here.
 *
 * The managed services are priced in their own section below
 * (ServiceOffers.tsx) and never in this table: a software subscription and a
 * managed-service fee are different purchases.
 *
 * Custom is sold by conversation. Its button opens the strategy call while the
 * owner is taking bookings; while they are not, it opens the inquiry form
 * below instead — a "Book" button that lands on "bookings are closed" is
 * worse than no button. The form is always one click away ("Prefer to
 * write?") and opens by itself at /#enquire, where the closed booking page
 * sends visitors.
 */
import { useEffect, useRef, useState } from 'react';
import { ArrowRight, CalendarCheck, Mail } from 'lucide-react';
import { strategyCallHref, useBookingState } from '../../services/strategyCall';
import { PlanCards, usePlanTable } from './PricingParts';
import { BILLING_TERMS } from './pricingTerms';
import { EnquiryForm } from './PricingPage';

export default function HomePricing() {
  const table = usePlanTable();
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
    <section className="ind-sec hp" id="pricing" aria-label="Software pricing">
      <div className="dc-chapter-head">
        <span className="dc-eyebrow">Software pricing</span>
        <h2>Protected Central software. <em>Run it yourself.</em></h2>
        <p>The CRM and marketing-automation platform as a self-serve subscription: 7 days free with no card, then {BILLING_TERMS.replace('USD, billed monthly after the 7-day trial · ', 'billed monthly in US dollars, ')}. Every number on a card is what the product holds you to.</p>
      </div>

      <PlanCards table={table} customHref="#enquire" onCustom={toForm} />

      <p className="hp-compare"><a href="/pricing#compare">Compare every feature, plan by plan <ArrowRight size={13} /></a></p>

      <div className="dc-cta-pair gp-cta">
        {closed ? (
          <button type="button" className="dc-btn dc-btn-primary dc-btn-lg" onClick={toForm} data-testid="home-book" data-booking="closed">
            <Mail size={16} /> Contact Sales about Custom
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
          <EnquiryForm context="Home page" placeholder="Custom plan, a managed service, or a question — tell us about your business…" />
        </div>
      )}
    </section>
  );
}
