/**
 * A trade page on the public site — /hvac, /roofing.
 *
 * The home page explains the platform to everybody; this explains it to one
 * kind of business, in the order an owner decides: their problems, what the
 * product does about each, the screens, how it is set up, what changes, what
 * it costs, the questions they would ask, and two ways to go on (start free,
 * or write to a person).
 *
 * It is the home page's own parts — FeatureStage and ShotReel over the real
 * screens (reels.ts), the price cards from the plan table the server enforces
 * (PricingSection), the FAQ section, the Custom enquiry form — given the
 * trade's words from industries.ts. Nothing is a mock-up and nothing is a
 * figure: the screens are a sample workspace and say so, and the page states
 * what the product does not do as plainly as what it does.
 *
 * The head a crawler reads is written by the Worker (lib/industryPages.ts);
 * this titles the tab with the same words.
 */
import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { ArrowRight, ArrowUpRight, Check, Minus, MessageSquare } from 'lucide-react';
import { LogoMark } from '../shared/Logo';
import { appHref, isCrossOrigin } from '../../services/hosts';
import { featureReady } from '../../services/features';
import { usePageTitle } from '../../services/pageTitle';
import { track } from '../../services/funnel';
import { motionReduced } from '../../services/motion';
import { TEMPLATES } from '../Autopilot/workflowTemplates';
import { INDUSTRY_PAGES, type IndustrySlug } from '../../../worker/src/lib/industryPages';
import { INDUSTRIES, PROCESS, type Industry, type ModuleStage } from './industries';
import { REELS, type ReelShot } from './reels';
import { StartFree, TrialNote } from './SiteHome';
import Starfield from './Starfield';
import ShotReel from './ShotReel';
import FeatureStage from './FeatureStage';
import PricingSection from './PricingSection';
import FaqSection from './FaqSection';
import { EnquiryForm } from './PricingPage';
import HelpLauncher from '../shared/HelpLauncher';
import { useRevealGroup } from './useReveal';
import './site.css';
import './industry.css';

const cross = (href: string) => (isCrossOrigin(href) ? { rel: 'noopener' as const } : {});

/** The named shots of some reels, in the order asked, each once. */
function shotsOf(reels: string[], only?: string[]): ReelShot[] {
  const all = reels.flatMap(r => REELS[r] ?? []);
  const seen = new Set<string>();
  const pick = only ? only.map(f => all.find(s => s.file === f)).filter((s): s is ReelShot => !!s) : all;
  return pick.filter(s => (seen.has(s.file) ? false : (seen.add(s.file), true)));
}

/** Smooth unless the visitor asked for less motion. */
const scrollToId = (id: string) =>
  document.getElementById(id)?.scrollIntoView({ block: 'start', behavior: motionReduced() ? 'auto' : 'smooth' });

export default function IndustryPage({ slug }: { slug: IndustrySlug }) {
  const ind: Industry = INDUSTRIES[slug];
  const meta = INDUSTRY_PAGES[slug];
  const other = INDUSTRY_PAGES[slug === 'hvac' ? 'roofing' : 'hvac'];
  usePageTitle(meta.title);

  const [stuck, setStuck] = useState(false);
  useEffect(() => {
    const onScroll = () => setStuck(window.scrollY > 24);
    onScroll();
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  /* The same one-line nav as the home page (SiteHome): it measures itself and
     steps down until it fits, rather than guessing from a breakpoint. */
  const navRef = useRef<HTMLElement | null>(null);
  useLayoutEffect(() => {
    const el = navRef.current;
    if (!el) return;
    const fit = () => {
      for (const step of ['full', 'tight', 'tiny']) {
        el.dataset.fit = step;
        if (el.scrollWidth <= el.clientWidth + 1) return;
      }
    };
    fit();
    const ro = new ResizeObserver(fit);
    ro.observe(el);
    for (const c of Array.from(el.children)) ro.observe(c);
    document.fonts?.ready.then(fit).catch(() => {});
    return () => ro.disconnect();
  }, []);

  const problems = useRevealGroup<HTMLDivElement>('.ind-problem');
  const flows = useRevealGroup<HTMLDivElement>('.ind-flow');

  const stages = ind.stages.filter(s => !s.needsProspects || featureReady('prospects'));
  const workflows = ind.workflows
    .map(w => ({ ...w, t: TEMPLATES.find(t => t.key === w.key) }))
    .filter((w): w is typeof w & { t: NonNullable<typeof w.t> } => !!w.t);

  const talk = (e?: React.MouseEvent) => { e?.preventDefault(); scrollToId('talk'); };
  const how = (e?: React.MouseEvent) => { e?.preventDefault(); scrollToId('how'); };

  return (
    <div className="dc ind" data-industry={slug}>
      <HelpLauncher signedIn={false} />
      <Starfield />

      <header ref={navRef} className={`dc-nav${stuck ? ' stuck' : ''}`}>
        <a className="dc-brand" href="/" aria-label="Protected Central home">
          <LogoMark size={26} />
          <span>Protected Central</span>
        </a>
        <nav className="dc-links" aria-label="On this page">
          <a href="#problems">Problems</a>
          <a href="#solutions">Solutions</a>
          <a href="#how">How it works</a>
          <a href="#pricing">Pricing</a>
          <a href="#faq">FAQ</a>
          <a href={other.path}>{other.name}</a>
        </nav>
        <div className="dc-nav-cta">
          <a className="dc-btn dc-btn-ghost" href={appHref('/login')} {...cross(appHref('/login'))}>Sign in</a>
          <a className="dc-btn dc-btn-primary" href={appHref('/signup')} aria-label="Start free" {...cross(appHref('/signup'))} onClick={() => track('trial_cta_clicked')}>
            <span className="dc-cta-long">Start free</span><span className="dc-cta-short" aria-hidden="true">Try free</span>
          </a>
        </div>
      </header>

      <main>
        {/* ── 1–2. The trade's hero and the first call to action ── */}
        <section className="ind-hero" id="top">
          <div className="dc-hero-glow" aria-hidden="true" />
          <div className="ind-hero-copy">
            <nav className="ind-crumbs" aria-label="Breadcrumb">
              <a href="/">Protected Central</a><span aria-hidden="true">/</span><span aria-current="page">{meta.name}</span>
            </nav>
            <span className="dc-eyebrow"><ind.icon size={14} /> {ind.forWhom}</span>
            <h1 className="ind-h1">
              <span>{ind.hero.lead}.</span>
              <em>{ind.hero.emph}.</em>
            </h1>
            <p className="ind-sub">{ind.hero.sub}</p>
            <div className="dc-hero-cta">
              <StartFree size="lg" where="hero" />
              <a className="dc-btn dc-btn-outline dc-btn-lg" href="#talk" onClick={talk} data-testid="discuss">
                <MessageSquare size={16} /> Discuss your business
              </a>
              <a className="dc-btn dc-btn-ghost dc-btn-lg" href="#how" onClick={how}>See how it works <ArrowRight size={15} /></a>
            </div>
            <TrialNote />
          </div>
          <div className="ind-hero-shot dc-stage-show">
            <ShotReel shots={shotsOf(['pipelines', 'hero', 'contacts', 'calendar'], ind.heroShots)} label={`Protected Central for ${meta.audience}`} eager />
          </div>
          {/* Said once, where the first screen appears: these are a sample, not a firm in this trade. */}
          <p className="dc-sample-note">Screens show a sample workspace with example data — not a real {meta.name.toLowerCase()} business’s records.</p>
        </section>

        {/* ── 3. The problems, each with what the product does about it ── */}
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
                <p className="ind-fix"><Check size={13} aria-hidden="true" /><span><b>What Protected Central does: </b>{p.fix}</span></p>
              </article>
            ))}
          </div>
        </section>

        {/* ── 4–5. The solutions, as the modules and their real screens ── */}
        <div id="solutions">
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
                  <small>An example — you name your own stages.</small>
                </div>
              )}
              {i === 0 && (
                <div className="dc-cta-pair">
                  <StartFree />
                  <a className="dc-btn dc-btn-outline" href="#talk" onClick={talk}>Discuss your business</a>
                </div>
              )}
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

        {/* ── 6. How it is set up and run ── */}
        <FeatureStage
          id="how"
          className="ind-stage"
          eyebrow="How it works"
          title={<>Describe the business. <em>Approve what it builds.</em></>}
          body={<>AI Autopilot turns a description of your {meta.name === 'HVAC' ? 'HVAC business' : 'roofing business'} into a business
            workspace — its pipeline, workflows and campaigns — that you read before it runs, and that runs on the
            server once you switch it on.</>}
          label="How AI Autopilot is set up"
          shots={REELS.autopilot}
          features={PROCESS}
        />

        {/* ── 7. What changes, and what it does not do ── */}
        <section className="ind-sec" id="outcomes" aria-label="What changes">
          <div className="dc-chapter-head">
            <span className="dc-eyebrow">Outcomes</span>
            <h2>What it changes, <em>and what it does not.</em></h2>
            <p>These are the things the software does every day once it is set up — not results we can promise. What they bring in depends on your market, your prices and how your team answers.</p>
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

        {/* ── 8. Pricing: the same cards and numbers as everywhere, with what they cover ── */}
        <PricingSection
          intro={<p>{ind.pricingIntro}</p>}
          after={(
            <div className="ind-terms" aria-label="What the price covers">
              <div>
                <h3>Recurring</h3>
                <p>The plan, monthly or yearly (ten months’ price, two free), in US dollars. Cancel from Plan &amp; billing.</p>
              </div>
              <div>
                <h3>One-time</h3>
                <p>Checkout charges only the plan. Done-for-you setup comes with a Custom plan and is agreed with you before anything is charged.</p>
              </div>
              <div>
                <h3>Billed by others</h3>
                <p>Your email provider, if it charges; your SMS provider’s per-message charges, if you send texts; your payment processor’s fees, if you take payments. A domain bought in the app is priced before you buy it.</p>
              </div>
              <div>
                <h3>Included help</h3>
                <p>The AI is included in each plan’s allowance — no key of your own. Help is in the app by chat, tickets and screen sharing on every plan; Pro’s questions are answered first.</p>
              </div>
            </div>
          )}
        />

        {/* ── 9. Questions this trade asks ── */}
        <FaqSection items={ind.faq} title={<>Questions {meta.name === 'HVAC' ? 'HVAC owners' : 'roofers'} <em>ask first.</em></>} />

        {/* ── Discuss your business: a person reads it and replies ── */}
        <section className="ind-sec ind-talk" id="talk" aria-label="Discuss your business">
          <div className="dc-chapter-head">
            <span className="dc-eyebrow">Talk to a person</span>
            <h2>Discuss <em>your business.</em></h2>
            <p>{ind.talk.body}</p>
          </div>
          <div className="ind-talk-form">
            <EnquiryForm context={`${meta.name} page`} needs={false} placeholder={ind.talk.placeholder} />
          </div>
        </section>

        {/* ── 10. The closing call ── */}
        <section className="dc-cta">
          <div className="dc-cta-glow" aria-hidden="true" />
          <h2>{ind.closing.title.split('\n').map((l, n) => <span key={n}>{n > 0 && <br />}{l}</span>)}</h2>
          <p>{ind.closing.body}</p>
          <div className="dc-hero-cta">
            <a className="dc-btn dc-btn-light dc-btn-lg" href={appHref('/signup')} {...cross(appHref('/signup'))} onClick={() => track('trial_cta_clicked')}>
              Start free <ArrowUpRight size={16} />
            </a>
            <a className="dc-btn dc-btn-outline-light dc-btn-lg" href="#talk" onClick={talk}>Discuss your business</a>
          </div>
          <div className="ind-cta-space" aria-hidden="true" />
        </section>
      </main>

      <footer className="dc-foot">
        <div className="dc-foot-cols">
          <div className="dc-foot-brand">
            <a className="dc-brand" href="/"><LogoMark size={24} /><span>Protected Central</span></a>
            <p>Every step, in the open.</p>
          </div>
          <div>
            <h5>On this page</h5>
            <a href="#problems">Problems</a><a href="#solutions">Solutions</a>
            <a href="#workflows">Workflows</a><a href="#how">How it works</a>
          </div>
          <div>
            <h5>Platform</h5>
            <a href="/#autopilot">AI Autopilot</a><a href="/#deals">Pipelines</a>
            <a href="/#leads">Contacts</a><a href="/pricing">Pricing</a>
          </div>
          <div>
            <h5>Industries</h5>
            <a href={INDUSTRY_PAGES.hvac.path} aria-current={slug === 'hvac' ? 'page' : undefined}>HVAC</a>
            <a href={INDUSTRY_PAGES.roofing.path} aria-current={slug === 'roofing' ? 'page' : undefined}>Roofing</a>
          </div>
          <div>
            <h5>Help</h5>
            <a href="#talk" onClick={talk}>Discuss your business</a>
            <a href="#faq">Questions</a>
            <a href="/#find">Find my solution</a>
          </div>
          <div>
            <h5>Account</h5>
            <a href={appHref('/login')} {...cross(appHref('/login'))}>Sign in</a>
            <a href={appHref('/signup')} {...cross(appHref('/signup'))}>Start free</a>
            <a href="/security">Security &amp; privacy</a>
            <a href="/privacy">Privacy policy</a>
            <a href="/terms-of-service">Terms of service</a>
          </div>
        </div>
        <div className="dc-foot-base">
          <span>© {new Date().getFullYear()} Protected Central</span>
          <span>Sends on your own mailbox. Your data stays in your workspace.</span>
        </div>
      </footer>
    </div>
  );
}
