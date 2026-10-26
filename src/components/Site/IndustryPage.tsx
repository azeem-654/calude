/**
 * A trade microsite — /hvac, /roofing.
 *
 * Each sells the growth service (lib/offers.ts) to one kind of business, in
 * the order an owner decides: their problems, what the service does and how it
 * runs, how every opportunity is tracked to a collected payment, the software
 * underneath (the real screens), what it does not do, the price and what it is
 * taken of, the questions they would ask, and two ways to go on — book a
 * consultation, or write to a person.
 *
 * The frame is MicrositeLayout: its own nav and logo target, no way back to the
 * general home page and no link to another industry. The words are
 * industries.ts; the price is offers.ts; the screens are reels.ts (a sample
 * workspace, and the page says so). Nothing is a mock-up and nothing is a
 * result figure.
 *
 * The head a crawler reads is written by the Worker (lib/industryPages.ts);
 * this titles the tab with the same words.
 */
import { ArrowRight, Check, Minus } from 'lucide-react';
import { appHref, isCrossOrigin } from '../../services/hosts';
import { featureReady } from '../../services/features';
import { usePageTitle } from '../../services/pageTitle';
import { track } from '../../services/funnel';
import { TEMPLATES } from '../Autopilot/workflowTemplates';
import { INDUSTRY_PAGES, type TradeSlug } from '../../../worker/src/lib/industryPages';
import { growthFaq, growthLine } from '../../../worker/src/lib/offers';
import { INDUSTRIES, type Industry, type ModuleStage } from './industries';
import { REELS, type ReelShot } from './reels';
import ShotReel from './ShotReel';
import FeatureStage from './FeatureStage';
import FaqSection from './FaqSection';
import GrowthPricing from './GrowthPricing';
import { EnquiryForm } from './PricingPage';
import MicrositeLayout, { BookCall } from './Microsite';
import { useRevealGroup } from './useReveal';

const cross = (href: string) => (isCrossOrigin(href) ? { rel: 'noopener' as const } : {});

/** The named shots of some reels, in the order asked, each once. */
function shotsOf(reels: string[], only?: string[]): ReelShot[] {
  const all = reels.flatMap(r => REELS[r] ?? []);
  const seen = new Set<string>();
  const pick = only ? only.map(f => all.find(s => s.file === f)).filter((s): s is ReelShot => !!s) : all;
  return pick.filter(s => (seen.has(s.file) ? false : (seen.add(s.file), true)));
}

export default function IndustryPage({ slug }: { slug: TradeSlug }) {
  const ind: Industry = INDUSTRIES[slug];
  const meta = INDUSTRY_PAGES[slug];
  usePageTitle(meta.title);
  const trade = slug === 'hvac' ? 'HVAC' : 'roofing';

  const problems = useRevealGroup<HTMLDivElement>('.ind-problem');
  const flows = useRevealGroup<HTMLDivElement>('.ind-flow');
  const steps = useRevealGroup<HTMLDivElement>('.ind-step');

  const stages = ind.stages.filter(s => !s.needsProspects || featureReady('prospects'));
  const workflows = ind.workflows
    .map(w => ({ ...w, t: TEMPLATES.find(t => t.key === w.key) }))
    .filter((w): w is typeof w & { t: NonNullable<typeof w.t> } => !!w.t);
  const signup = appHref(`/signup?industry=${slug}`);

  return (
    <MicrositeLayout site={ind.site}>
      {/* ── The trade's hero and the first call to action ── */}
      <section className="ind-hero" id="top">
        <div className="dc-hero-glow" aria-hidden="true" />
        <div className="ind-hero-copy">
          <span className="dc-eyebrow"><ind.icon size={14} /> {ind.forWhom}</span>
          <h1 className="ind-h1">
            <span>{ind.hero.lead}.</span>
            <em>{ind.hero.emph}.</em>
          </h1>
          <p className="ind-sub">{ind.hero.sub}</p>
          <div className="dc-hero-cta">
            <BookCall size="lg" testid="hero-book" />
            <a className="dc-btn dc-btn-outline dc-btn-lg" href="#pricing">See pricing <ArrowRight size={15} /></a>
          </div>
          <p className="ind-offer-line" data-testid="offer-line">{growthLine()}. Advertising budget and approved third-party charges are paid separately.</p>
        </div>
        <div className="ind-hero-shot dc-stage-show">
          <ShotReel shots={shotsOf(['pipelines', 'hero', 'contacts', 'calendar'], ind.heroShots)} label={`Protected Central for ${meta.audience}`} eager />
        </div>
        {/* Said once, where the first screen appears: these are a sample, not a firm in this trade. */}
        <p className="dc-sample-note">Screens show a sample workspace with example data — not a real {trade} business’s records.</p>
      </section>

      {/* ── The problems, each with what the service does about it ── */}
      <section className="ind-sec" id="problems" aria-label="Problems">
        <div className="dc-chapter-head">
          <span className="dc-eyebrow">The problem</span>
          <h2>{ind.problemsHead.lead} <em>{ind.problemsHead.emph}</em></h2>
          <p>{ind.problemsHead.body}</p>
        </div>
        <div className="ind-problems stagger" ref={problems}>
          {ind.problems.map(p => (
            <article key={p.title} className="ind-problem">
              <span className="dc-tile-icon"><p.icon size={16} /></span>
              <h3>{p.title}</h3>
              <p className="ind-pain">{p.pain}</p>
              <p className="ind-fix"><Check size={13} aria-hidden="true" /><span><b>What we do: </b>{p.fix}</span></p>
            </article>
          ))}
        </div>
      </section>

      {/* ── The service and how it runs ── */}
      <section className="ind-sec" id="service" aria-label="The service">
        <div className="dc-chapter-head">
          <span className="dc-eyebrow">The service</span>
          <h2>{ind.service.lead} <em>{ind.service.emph}</em></h2>
          <p>{ind.service.body}</p>
        </div>
        <div className="ind-steps stagger" ref={steps}>
          {ind.serviceSteps.map(s => (
            <article key={s.title} className="ind-step">
              <span className="dc-tile-icon"><s.icon size={16} /></span>
              <h3>{s.title}</h3>
              <p>{s.body}</p>
            </article>
          ))}
        </div>
      </section>

      {/* ── Lead to revenue: what is tracked, and what each number means ── */}
      <section className="ind-sec" id="tracking" aria-label="Lead-to-revenue tracking">
        <div className="dc-chapter-head">
          <span className="dc-eyebrow">Lead to revenue</span>
          <h2>From the first inquiry <em>to the payment in your account.</em></h2>
          <p>Every opportunity keeps its original source and moves through the same stages, each dated and signed by whoever recorded it. You confirm the money steps — so the report never calls an estimate revenue.</p>
        </div>
        <ol className="ind-journey" aria-label="Tracked stages">
          {ind.journey.map(j => <li key={j}>{j}</li>)}
        </ol>
        <div className="ind-terms ind-defs">
          <div><h3>Estimated value</h3><p>What an inquiry might be worth. A guide for priorities — never counted as revenue.</p></div>
          <div><h3>Quoted and won</h3><p>The estimate you sent, then the value you and the customer agreed. Still not revenue.</p></div>
          <div><h3>Invoiced</h3><p>The final job amount you confirm and bill. Shown with what is still outstanding.</p></div>
          <div><h3>Collected</h3><p>Payments actually received, less refunds and reversals. The only figure the performance fee is based on.</p></div>
        </div>
        <p className="ind-note">Where the source of a job is uncertain — an existing customer, a referral with no record, missing details — it is marked unknown or under review and left out of the fee until you and we agree it.</p>
      </section>

      {/* ── The software underneath, as its real screens ── */}
      <div id="software">
        {stages.map((s: ModuleStage, i) => (
          <FeatureStage
            key={s.id}
            id={`solution-${s.id}`}
            className="ind-stage"
            eyebrow={s.eyebrow}
            title={<>{s.lead} <em>{s.emph}</em></>}
            body={s.body}
            label={`${s.lead} ${s.emph}`}
            shots={shotsOf(s.reels, s.only)}
            features={s.features}
          >
            {s.id === 'pipeline' && (
              <div className="ind-stages" aria-label="An example set of pipeline stages">
                {ind.pipelineExample.map((st, n) => (
                  <span key={st} className="ind-stage-chip">{st}{n < ind.pipelineExample.length - 2 && <ArrowRight size={11} aria-hidden="true" />}</span>
                ))}
                <small>An example — the stages are agreed with you.</small>
              </div>
            )}
            {i === 0 && <div className="dc-cta-pair"><BookCall /></div>}
          </FeatureStage>
        ))}
      </div>

      {/* ── Ready-made workflows, read from the template library ── */}
      <section className="ind-sec" id="workflows" aria-label="Ready-made workflows">
        <div className="dc-chapter-head">
          <span className="dc-eyebrow">Automation</span>
          <h2>{ind.workflowsHead.lead} <em>{ind.workflowsHead.emph}</em></h2>
          <p>{ind.workflowsHead.body}</p>
        </div>
        <div className="ind-flows stagger" ref={flows}>
          {workflows.map(w => (
            <article key={w.key} className="ind-flow" data-template={w.key}>
              <h3>{w.t.name.replace(/ Automation$/, '')}</h3>
              <p className="ind-flow-why">{w.why}</p>
              <p className="ind-flow-what">{w.t.description}</p>
              <div className="ind-flow-needs">
                <b>Needs</b>
                <ul>{w.t.needs.map(n => <li key={n}>{n}</li>)}</ul>
              </div>
            </article>
          ))}
        </div>
      </section>

      {/* ── What changes, and what it does not do ── */}
      <section className="ind-sec" id="outcomes" aria-label="What changes">
        <div className="dc-chapter-head">
          <span className="dc-eyebrow">Outcomes</span>
          <h2>What it changes, <em>and what it does not.</em></h2>
          <p>These are things the service and the software do every month once they are set up — not results anybody can promise. What they bring in depends on your market, your prices and how your team answers.</p>
        </div>
        <div className="ind-outcomes">
          <div className="ind-outcome-card">
            <h3><Check size={15} /> What it supports</h3>
            <ul>{ind.outcomes.map(o => <li key={o}><Check size={13} aria-hidden="true" /> <span>{o}</span></li>)}</ul>
          </div>
          <div className="ind-outcome-card ind-limits">
            <h3><Minus size={15} /> What it does not do</h3>
            <ul>{ind.limits.map(o => <li key={o}><Minus size={13} aria-hidden="true" /> <span>{o}</span></li>)}</ul>
          </div>
        </div>
      </section>

      {/* ── Pricing: the growth offer, from offers.ts ── */}
      <GrowthPricing trade={trade} intro={ind.pricingIntro} />

      {/* ── Questions this trade asks ── */}
      <FaqSection items={[...ind.faq, ...growthFaq()]} title={<>Questions {slug === 'hvac' ? 'HVAC owners' : 'roofers'} <em>ask first.</em></>} />

      {/* ── Prefer to write: a person reads it and replies ── */}
      <section className="ind-sec ind-talk" id="talk" aria-label="Write to us">
        <div className="dc-chapter-head">
          <span className="dc-eyebrow">Prefer to write?</span>
          <h2>Tell us about <em>your business.</em></h2>
          <p>{ind.talk.body}</p>
        </div>
        <div className="ind-talk-form">
          <EnquiryForm context={`${meta.name} page`} needs={false} placeholder={ind.talk.placeholder} />
        </div>
      </section>

      {/* ── The closing call ── */}
      <section className="dc-cta">
        <div className="dc-cta-glow" aria-hidden="true" />
        <h2>{ind.closing.title.split('\n').map((l, n) => <span key={n}>{n > 0 && <br />}{l}</span>)}</h2>
        <p>{ind.closing.body}</p>
        <div className="dc-hero-cta">
          <BookCall size="lg" variant="light" testid="closing-book" />
        </div>
        <p className="ind-diy">
          Prefer to run the software yourself? <a href={signup} {...cross(signup)} onClick={() => track('trial_cta_clicked')}>Start the software free for 7 days</a> — no card, and no service fee.
        </p>
        <div className="ind-cta-space" aria-hidden="true" />
      </section>
    </MicrositeLayout>
  );
}
