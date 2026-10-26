/**
 * The medical billing microsite — /medical-billing.
 *
 * Its own site, not a trade page with new headings: a professional
 * revenue-cycle service for practices, in the order a practice manager
 * decides — the problems, the leakage audit, claims and denials, payments and
 * A/R, reporting, the RCM workspace, how patient data is handled, how
 * onboarding works, how it is priced (after an assessment — there is no
 * figure), questions, and the call to book an assessment.
 *
 * No screens: there is no sample RCM workspace to photograph yet, and a
 * drawing of one would be a mock-up. No figures of any kind (medicalBilling.ts
 * says what may never be claimed). The frame is MicrositeLayout, so nothing
 * here links to the general home page or to another industry.
 */
import { Check } from 'lucide-react';
import { usePageTitle } from '../../services/pageTitle';
import { INDUSTRY_PAGES } from '../../../worker/src/lib/industryPages';
import { MEDICAL_BILLING_OFFER } from '../../../worker/src/lib/offers';
import {
  MED_AR, MED_AUDIENCE, MED_AUDIT, MED_CLAIMS, MED_FAQ, MED_HERO, MED_PROBLEMS, MED_PROCESS, MED_REPORTING,
  MED_SECURITY, MED_SITE_ICON, MED_SOFTWARE, MEDICAL_SITE,
} from './medicalBilling';
import FaqSection from './FaqSection';
import { EnquiryForm } from './PricingPage';
import MicrositeLayout, { BookCall } from './Microsite';
import { useRevealGroup } from './useReveal';

type Feature = { icon: (p: { size?: number }) => React.ReactNode; title: string; body: string };

function Features({ items }: { items: Feature[] }) {
  return (
    <div className="med-features">
      {items.map(f => (
        <article key={f.title} className="med-feature">
          <span className="dc-tile-icon"><f.icon size={16} /></span>
          <h3>{f.title}</h3>
          <p>{f.body}</p>
        </article>
      ))}
    </div>
  );
}

export default function MedicalBillingPage() {
  const meta = INDUSTRY_PAGES['medical-billing'];
  usePageTitle(meta.title);
  const problems = useRevealGroup<HTMLDivElement>('.ind-problem');

  return (
    <MicrositeLayout site={MEDICAL_SITE}>
      {/* ── 1. Hero ── */}
      <section className="ind-hero med-hero" id="top">
        <div className="dc-hero-glow" aria-hidden="true" />
        <div className="ind-hero-copy">
          <span className="dc-eyebrow"><MED_SITE_ICON size={14} /> {MED_HERO.eyebrow}</span>
          <h1 className="ind-h1"><span>{MED_HERO.lead}</span><em>{MED_HERO.emph}.</em></h1>
          <p className="ind-sub">{MED_HERO.sub}</p>
          <div className="dc-hero-cta">
            <BookCall size="lg" testid="hero-book" />
            <a className="dc-btn dc-btn-outline dc-btn-lg" href="#request">Request Medical Billing Assessment</a>
          </div>
          <ul className="med-audience" aria-label="Who it is for">
            {MED_AUDIENCE.map(a => <li key={a.label}><a.icon size={14} /> {a.label}</li>)}
          </ul>
        </div>
      </section>

      {/* ── 2. Problems ── */}
      <section className="ind-sec" id="problems" aria-label="Problems">
        <div className="dc-chapter-head">
          <span className="dc-eyebrow">The problem</span>
          <h2>Where practice revenue <em>goes missing.</em></h2>
          <p>Rarely one large failure — usually many small ones nobody had time to chase.</p>
        </div>
        <div className="ind-problems med-problems stagger" ref={problems}>
          {MED_PROBLEMS.map(p => (
            <article key={p.title} className="ind-problem">
              <span className="dc-tile-icon"><p.icon size={16} /></span>
              <h3>{p.title}</h3>
              <p className="ind-pain">{p.body}</p>
            </article>
          ))}
        </div>
      </section>

      {/* ── 3. Revenue-leakage audit ── */}
      <section className="ind-sec" id="audit" aria-label="Revenue-leakage audit">
        <div className="dc-chapter-head">
          <span className="dc-eyebrow">Revenue-leakage audit</span>
          <h2>{MED_AUDIT.lead} <em>{MED_AUDIT.emph}</em></h2>
          <p>{MED_AUDIT.body}</p>
        </div>
        <div className="ind-outcomes">
          <div className="ind-outcome-card">
            <h3><Check size={15} /> What it looks for</h3>
            <ul>{MED_AUDIT.checks.map(c => <li key={c}><Check size={13} aria-hidden="true" /> <span>{c}</span></li>)}</ul>
          </div>
          <div className="ind-outcome-card med-kinds">
            <h3>Four amounts, never mixed</h3>
            {MED_AUDIT.kinds.map(k => <p key={k.title}><b>{k.title}.</b> {k.body}</p>)}
          </div>
        </div>
      </section>

      {/* ── 4. Claims and denial management ── */}
      <section className="ind-sec" id="claims" aria-label="Claims and denials">
        <div className="dc-chapter-head">
          <span className="dc-eyebrow">Claims and denials</span>
          <h2>{MED_CLAIMS.lead} <em>{MED_CLAIMS.emph}</em></h2>
          <p>{MED_CLAIMS.body}</p>
        </div>
        <ol className="ind-journey med-statuses" aria-label="Claim statuses">{MED_CLAIMS.statuses.map(s => <li key={s}>{s}</li>)}</ol>
        <Features items={MED_CLAIMS.features} />
      </section>

      {/* ── 5. Payments and A/R ── */}
      <section className="ind-sec" id="ar" aria-label="Payments and accounts receivable">
        <div className="dc-chapter-head">
          <span className="dc-eyebrow">Payments and A/R</span>
          <h2>{MED_AR.lead} <em>{MED_AR.emph}</em></h2>
          <p>{MED_AR.body}</p>
        </div>
        <Features items={MED_AR.features} />
      </section>

      {/* ── 6. Reporting ── */}
      <section className="ind-sec" id="reporting" aria-label="Reporting">
        <div className="dc-chapter-head">
          <span className="dc-eyebrow">Reporting</span>
          <h2>{MED_REPORTING.lead} <em>{MED_REPORTING.emph}</em></h2>
          <p>{MED_REPORTING.body}</p>
        </div>
        <ul className="med-points">{MED_REPORTING.points.map(p => <li key={p}><Check size={13} aria-hidden="true" /> {p}</li>)}</ul>
      </section>

      {/* ── 7. The internal RCM software ── */}
      <section className="ind-sec" id="software" aria-label="The RCM workspace">
        <div className="dc-chapter-head">
          <span className="dc-eyebrow">The software</span>
          <h2>{MED_SOFTWARE.lead} <em>{MED_SOFTWARE.emph}</em></h2>
          <p>{MED_SOFTWARE.body}</p>
        </div>
        <Features items={MED_SOFTWARE.points} />
      </section>

      {/* ── Security and data handling ── */}
      <section className="ind-sec" id="security" aria-label="Security and patient data">
        <div className="dc-chapter-head">
          <span className="dc-eyebrow">Security</span>
          <h2>{MED_SECURITY.lead} <em>{MED_SECURITY.emph}</em></h2>
          <p>{MED_SECURITY.body}</p>
        </div>
        <Features items={MED_SECURITY.points} />
        <p className="ind-note">{MED_SECURITY.note}</p>
      </section>

      {/* ── 8. Onboarding and data access ── */}
      <section className="ind-sec" id="process" aria-label="Onboarding">
        <div className="dc-chapter-head">
          <span className="dc-eyebrow">Onboarding</span>
          <h2>How we start, <em>and what we need from you.</em></h2>
        </div>
        <div className="ind-steps">
          {MED_PROCESS.map(s => <article key={s.title} className="ind-step"><h3>{s.title}</h3><p>{s.body}</p></article>)}
        </div>
      </section>

      {/* ── 9. Pricing: assessed, never a figure ── */}
      <section className="ind-sec" id="pricing" aria-label="Pricing">
        <div className="dc-chapter-head">
          <span className="dc-eyebrow">Pricing</span>
          <h2>Priced for your practice, <em>after an assessment.</em></h2>
          <p data-testid="med-pricing-note">{MEDICAL_BILLING_OFFER.note}</p>
        </div>
        <div className="ind-outcome-card med-factors">
          <h3>What the price depends on</h3>
          <ul>{MEDICAL_BILLING_OFFER.factors.map(f => <li key={f}><Check size={13} aria-hidden="true" /> <span>{f}</span></li>)}</ul>
        </div>
        <div className="dc-cta-pair gp-cta"><BookCall size="lg" /></div>
      </section>

      {/* ── 10. Questions ── */}
      <FaqSection items={MED_FAQ} title={<>Questions practices <em>ask first.</em></>} />

      {/* ── Request in writing ── */}
      <section className="ind-sec ind-talk" id="request" aria-label="Request an assessment">
        <div className="dc-chapter-head">
          <span className="dc-eyebrow">Prefer to write?</span>
          <h2>Request a medical billing <em>assessment.</em></h2>
          <p>Tell us your specialty, number of providers, payers and roughly how many claims a month. Please do not include any patient information. A person reads every request and replies by email.</p>
        </div>
        <div className="ind-talk-form">
          <EnquiryForm context="Medical billing page" needs={false} placeholder="Specialty, providers and locations, main payers, monthly claim volume, what is not working…" />
        </div>
      </section>

      {/* ── 11. Final call ── */}
      <section className="dc-cta">
        <div className="dc-cta-glow" aria-hidden="true" />
        <h2>See where your claims stand.<br />Then decide.</h2>
        <p>Start with an assessment call. No obligation, and no patient data is needed for it.</p>
        <div className="dc-hero-cta"><BookCall size="lg" variant="light" testid="closing-book" /></div>
        <div className="ind-cta-space" aria-hidden="true" />
      </section>
    </MicrositeLayout>
  );
}
