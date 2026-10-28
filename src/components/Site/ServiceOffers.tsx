/**
 * The home page's managed services, after the software pricing.
 *
 * Four services, each with its own site, its own written terms and its own
 * price, quoted in one line from lib/offers.ts — never typed here, and never
 * in the software plans' table above. The note at the top says how the two
 * relate: the software is what the work is delivered in; a service fee pays
 * for the agreed work.
 *
 * The HVAC and roofing growth service is one offer sold on two sites, so it
 * has a card per site with the same line; medical billing has its own basis
 * (eligible net collections on claims handled), and e-commerce a flat fee.
 */
import { ArrowRight, Home, ShoppingBag, Stethoscope, Thermometer } from 'lucide-react';
import { MEDICAL_BILLING_OFFER, TRADE_GROWTH_OFFER, ecommerceLine, growthLine, medicalLine } from '../../../worker/src/lib/offers';
import { INDUSTRY_PAGES } from '../../../worker/src/lib/industryPages';

const SERVICES = [
  {
    id: 'ecommerce', icon: ShoppingBag, title: 'E-commerce business setup & management', href: INDUSTRY_PAGES.ecommerce.path,
    line: ecommerceLine(), basis: 'for the agreed monthly managed-service scope',
    body: 'Shopify, Amazon, eBay and Walmart store setup and management, advertising management, and your CRM, email, SMS, reviews and support run for you.',
    separate: 'ad spend, inventory, marketplace and payment fees, shipping and third-party apps.',
    link: 'E-commerce management services',
  },
  {
    id: 'hvac', icon: Thermometer, title: 'HVAC business services', href: INDUSTRY_PAGES.hvac.path,
    line: growthLine(), basis: 'performance fee on eligible collected revenue from qualifying jobs',
    body: 'Inquiries captured with their source, estimates followed up, and every job tracked to the payment in your account.',
    separate: TRADE_GROWTH_OFFER.costDisclosure.replace(/^You are responsible for /, '').replace(/\. These costs.*$/, '.'),
    link: 'HVAC growth service',
  },
  {
    id: 'roofing', icon: Home, title: 'Roofing business services', href: INDUSTRY_PAGES.roofing.path,
    line: growthLine(), basis: 'performance fee on eligible collected revenue from qualifying jobs',
    body: 'Inspections, estimates and insurance jobs followed through, with each job tracked to the payment collected.',
    separate: TRADE_GROWTH_OFFER.costDisclosure.replace(/^You are responsible for /, '').replace(/\. These costs.*$/, '.'),
    link: 'Roofing growth service',
  },
  {
    id: 'medical', icon: Stethoscope, title: 'Medical billing & RCM services', href: INDUSTRY_PAGES['medical-billing'].path,
    line: medicalLine(), basis: 'on claims handled under the signed agreement, subject to legal and compliance review',
    body: 'Claims, denials, remittances and A/R followed through for medical practices, with a practice portal and reporting.',
    separate: MEDICAL_BILLING_OFFER.separate.map(s => s.charAt(0).toLowerCase() + s.slice(1)).join('; ') + '.',
    link: 'Medical billing services',
  },
] as const;

export default function ServiceOffers() {
  return (
    <section className="ind-sec so" id="services" aria-label="Managed services">
      <div className="dc-chapter-head">
        <span className="dc-eyebrow">Managed services</span>
        <h2>Prefer us to do the work? <em>Done-for-you services.</em></h2>
        <p>Each service is run by our team in Protected Central, on its own written terms and at its own price. The software supports the delivery; the service fee pays for the agreed managed-service work — it is not a software plan, and you do not need one as well.</p>
      </div>

      <div className="so-cards so-cards-4">
        {SERVICES.map(s => (
          <article key={s.id} className="so-card" data-testid={`offer-${s.id}`}>
            <div className="so-head">
              <span className="dc-tile-icon"><s.icon size={16} /></span>
              <h3>{s.title}</h3>
            </div>
            <div className="so-price so-price-one"><div><b className="so-line">{s.line}</b><span>{s.basis}</span></div></div>
            <p>{s.body}</p>
            <p className="so-separate"><b>Paid separately, by you:</b> {s.separate}</p>
            <div className="so-links"><a href={s.href}>{s.link} <ArrowRight size={13} /></a></div>
          </article>
        ))}
      </div>
      <p className="so-foot">No service guarantees revenue, sales, collections or results. Each service’s page has its full terms.</p>
    </section>
  );
}
