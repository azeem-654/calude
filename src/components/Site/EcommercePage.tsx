/**
 * The e-commerce managed-service page — /ecommerce-management-services.
 *
 * A premium done-for-you service at one monthly price, written for people
 * searching for e-commerce management services: what the service is, the
 * platforms, what the team handles, the real screens of a sample store's
 * workspace (IndustryDemo), how it starts, the price and what it does not
 * include, the client's part, questions, and a call. Every figure is read from
 * lib/offers.ts (ECOMMERCE_OFFER); the copy is ecommerce.ts.
 *
 * The frame is MicrositeLayout, so the page has its own menu of in-page
 * sections and the booking buttons follow the owner's switch — while calls are
 * not being booked they open the inquiry form below instead.
 */
import { Check, Info, Play, Receipt, ShoppingBag } from 'lucide-react';
import { usePageTitle } from '../../services/pageTitle';
import { INDUSTRY_PAGES } from '../../../worker/src/lib/industryPages';
import { ECOMMERCE_OFFER as O, dollars } from '../../../worker/src/lib/offers';
import { ECOM_FAQ, ECOM_HANDLE, ECOM_HERO, ECOM_MODULES, ECOM_PLATFORMS, ECOM_PLATFORM_NOTE, ECOM_PROCESS, ECOM_SERVICE, ECOM_SITE } from './ecommerce';
import FaqSection from './FaqSection';
import IndustryDemo from './IndustryDemo';
import { EnquiryForm } from './PricingPage';
import MicrositeLayout, { BookCall } from './Microsite';
import { useRevealGroup } from './useReveal';

export default function EcommercePage() {
  const meta = INDUSTRY_PAGES.ecommerce;
  usePageTitle(meta.title);
  const platforms = useRevealGroup<HTMLDivElement>('.med-feature');
  const steps = useRevealGroup<HTMLDivElement>('.ind-step');

  return (
    <MicrositeLayout site={ECOM_SITE}>
      {/* ── Hero: the offer's name is the page's one h1 ── */}
      <section className="ind-hero med-hero ecom-hero" id="top">
        <div className="dc-hero-glow" aria-hidden="true" />
        <div className="ind-hero-copy">
          <span className="dc-eyebrow"><ShoppingBag size={14} /> {ECOM_HERO.eyebrow}</span>
          <h1 className="ind-h1 ecom-h1">{ECOM_HERO.h1}</h1>
          <p className="ind-sub">{ECOM_HERO.sub}</p>
          <div className="dc-hero-cta">
            <BookCall size="lg" testid="hero-book" />
            <a className="dc-btn dc-btn-outline dc-btn-lg" href="#see-it-work"><Play size={15} /> See it working</a>
          </div>
          <p className="ind-offer-line" data-testid="offer-line">{dollars(O.monthlyCents)}/month for your written monthly scope. Ad spend, inventory and platform fees are paid separately.</p>
        </div>
      </section>

      {/* ── What the service is ── */}
      <section className="ind-sec" id="service" aria-label="The service">
        <div className="dc-chapter-head">
          <span className="dc-eyebrow">The service</span>
          <h2>{ECOM_SERVICE.lead} <em>{ECOM_SERVICE.emph}</em></h2>
        </div>
        <div className="ecom-prose">{ECOM_SERVICE.body.map(p => <p key={p.slice(0, 24)}>{p}</p>)}</div>
      </section>

      {/* ── Platforms ── */}
      <section className="ind-sec" id="platforms" aria-label="Platforms supported">
        <div className="dc-chapter-head">
          <span className="dc-eyebrow">Platforms</span>
          <h2>Amazon, eBay, Shopify and Walmart <em>store management.</em></h2>
          <p>Set up and managed on the platforms in your scope — one, or all four.</p>
        </div>
        <div className="med-features stagger" ref={platforms}>
          {ECOM_PLATFORMS.map(p => (
            <article key={p.title} className="med-feature">
              <span className="dc-tile-icon"><p.icon size={16} /></span>
              <h3>{p.title}</h3>
              <p>{p.body}</p>
              {p.note && <p className="ecom-note">{p.note}</p>}
            </article>
          ))}
        </div>
        <p className="ind-note" data-testid="platform-note">{ECOM_PLATFORM_NOTE}</p>
      </section>

      {/* ── What we handle ── */}
      <section className="ind-sec" id="handle" aria-label="What Protected Central handles">
        <div className="dc-chapter-head">
          <span className="dc-eyebrow">What we handle</span>
          <h2>E-commerce setup and marketing services, <em>run for you.</em></h2>
          <p>Within your client access, the approved scope, each platform’s requirements and the monthly delivery plan we agree.</p>
        </div>
        <div className="ecom-handle">
          {ECOM_HANDLE.map(g => (
            <article key={g.title} className="ind-outcome-card ecom-group">
              <h3><g.icon size={16} aria-hidden="true" /> {g.title}</h3>
              <ul>{g.items.map(i => <li key={i}><Check size={13} aria-hidden="true" /> <span>{i}</span></li>)}</ul>
            </article>
          ))}
        </div>
        <h3 className="ecom-sub-h">The Protected Central modules your store runs on</h3>
        <div className="med-features ecom-modules">
          {ECOM_MODULES.map(m => (
            <article key={m.title} className="med-feature">
              <span className="dc-tile-icon"><m.icon size={16} /></span>
              <h3>{m.title}</h3>
              <p>{m.body}</p>
            </article>
          ))}
        </div>
      </section>

      {/* ── The real screens of a sample store's workspace ── */}
      <IndustryDemo slug="ecommerce" />

      {/* ── Process ── */}
      <section className="ind-sec" id="process" aria-label="How it works">
        <div className="dc-chapter-head">
          <span className="dc-eyebrow">The process</span>
          <h2>How we start, <em>and how each month runs.</em></h2>
        </div>
        <div className="ind-steps stagger" ref={steps}>
          {ECOM_PROCESS.map(s => (
            <article key={s.title} className="ind-step">
              <span className="dc-tile-icon"><s.icon size={16} /></span>
              <h3>{s.title}</h3>
              <p>{s.body}</p>
            </article>
          ))}
        </div>
      </section>

      {/* ── Pricing ── */}
      <section className="ind-sec gp" id="pricing" aria-label="Pricing">
        <div className="dc-chapter-head">
          <span className="dc-eyebrow">Pricing</span>
          <h2>One monthly fee, <em>for a written scope.</em></h2>
        </div>
        <div className="go" data-testid="ecom-offer">
          <p className="go-line" data-testid="ecom-line">{O.name}</p>
          <div className="gp-figures ecom-figures">
            <div className="gp-fig">
              <b>{dollars(O.monthlyCents)}<small>/month</small></b>
              <span>Managed-service fee, in US dollars</span>
              <p>{O.feeBasis}</p>
            </div>
          </div>
          <div className="go-includes" data-testid="ecom-scope">
            <h3>Your written scope settles, before the first month:</h3>
            <ul>{O.scopeCovers.map(i => <li key={i}><Check size={13} aria-hidden="true" /> <span>{i}.</span></li>)}</ul>
            <p className="ecom-note">The service is customised by that written scope. Tasks, campaigns, products, marketplaces and content are not unlimited; anything beyond the scope is quoted first and starts only once you approve it.</p>
          </div>
          <div className="go-disclose">
            <div className="go-note" data-testid="ecom-separate">
              <h3><Info size={15} aria-hidden="true" /> Paid separately, by you</h3>
              <p>Unless an approved agreement explicitly says otherwise:</p>
              <ul className="ecom-list">{O.separate.map(i => <li key={i}>{i}</li>)}</ul>
            </div>
            <div className="go-note" data-testid="ecom-terms">
              <h3><Receipt size={15} aria-hidden="true" /> Billing and results</h3>
              <p>The fee is invoiced monthly under your signed agreement, which states the start date, the term and the notice to end it. It is not a software subscription, and it is separate from the Protected Central software plans.</p>
              <p>{O.noGuarantee}</p>
            </div>
          </div>
        </div>
        <div className="dc-cta-pair gp-cta"><BookCall size="lg" testid="pricing-book" /></div>
      </section>

      {/* ── The client's part ── */}
      <section className="ind-sec" id="responsibilities" aria-label="Client responsibilities">
        <div className="dc-chapter-head">
          <span className="dc-eyebrow">Your part</span>
          <h2>What stays <em>yours.</em></h2>
          <p>The accounts and the business are yours; we run the work you give us access to.</p>
        </div>
        <div className="ind-outcome-card ecom-duties">
          <ul>{O.clientDuties.map(i => <li key={i}><Check size={13} aria-hidden="true" /> <span>{i}</span></li>)}</ul>
        </div>
      </section>

      {/* ── Questions ── */}
      <FaqSection items={ECOM_FAQ} title={<>E-commerce management <em>questions.</em></>} />

      {/* ── In writing ── */}
      <section className="ind-sec ind-talk" id="talk" aria-label="Tell us about your store">
        <div className="dc-chapter-head">
          <span className="dc-eyebrow">Prefer to write?</span>
          <h2>Tell us about <em>your store.</em></h2>
          <p>What you sell, where you sell it now, the platforms you want, and your monthly ad budget. A person reads every message and replies by email.</p>
        </div>
        <div className="ind-talk-form">
          <EnquiryForm context="E-commerce services page" needs={false} placeholder="Products, current channels (Shopify, Amazon, eBay, Walmart), what you want managed, monthly ad budget…" />
        </div>
      </section>

      {/* ── Closing call ── */}
      <section className="dc-cta">
        <div className="dc-cta-glow" aria-hidden="true" />
        <h2>Your store, your marketplaces,<br />one team running them.</h2>
        <p>Start with a strategy call. We will tell you plainly what we would do, and what we would not.</p>
        <div className="dc-hero-cta">
          <BookCall size="lg" variant="light" testid="closing-book" />
        </div>
        <div className="ind-cta-space" aria-hidden="true" />
      </section>
    </MicrositeLayout>
  );
}
