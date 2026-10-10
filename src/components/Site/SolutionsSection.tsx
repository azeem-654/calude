/**
 * "What do you want to grow?" — Find my solution, open on the page, and the
 * ready-made recipes under it.
 *
 * The wizard (SolutionWizard.tsx, `inline`) is the section's first thing:
 * already open at its first question, so a visitor can describe what they
 * want without finding a button first — the owner asked for it published
 * here rather than in a pop-up. Every other "Find my solution" on the page
 * scrolls here (SiteHome `openWizard`), and so does a `#find` / `#find=<key>`
 * link. Its code is loaded as the section nears the screen (or the moment
 * somebody is sent here); until then a still copy of its first screen holds
 * the space, so nothing below jumps when it arrives.
 *
 * Under it, the recipes. Each card is a solution in the catalogue
 * (services/projectSolutions.ts): what it does in a sentence, the shape of its
 * main workflow drawn small, and "Build this", which picks that outcome in the
 * wizard above and brings it into view — the plan it shows is the one the app
 * builds. "See the real screens" goes to the section of this page with the
 * photographs of that module running; the small flow here is a diagram, and
 * says so by looking like one.
 *
 * The flows are the shape of the templates each solution builds (the finder's
 * Daily → Find → Verify → Qualified?, the follow-up's reply check …), not
 * promises about results.
 */
import { lazy, Suspense, useEffect, useRef, useState } from 'react';
import { ArrowRight, Target, Repeat, Image as ImageIcon, Calendar, RefreshCw, FileText, Store, Building2, Sparkles } from 'lucide-react';
import { useReveal, useRevealGroup } from './useReveal';
import { featureReady } from '../../services/features';
/* The card's look is wanted before its code (the still first screen below). */
import './solutionWizard.css';

/* The wizard carries the app's whole judgement — the catalogue, the blueprint,
   the workflow drawing — so it is fetched as the section comes near, not with
   the page. */
const SolutionWizard = lazy(() => import('./SolutionWizard'));

/**
 * What the page asks of the wizard. `n` changes when a solution is picked from
 * outside it ("Build this", `#find=<key>`): the wizard starts again with that
 * pick, as opening the modal with one used to. `call` changes whenever
 * somebody is sent to it at all.
 */
export interface FindRequest { pick: string; n: number; call: number }

type Step = string | { ask: string; yes: string; no: string };

const CASES: { key: string; icon: typeof Target; title: string; body: string; flow: Step[]; see: string }[] = [
  {
    key: 'lead-generation', icon: Target, title: 'Find new customers',
    body: 'Searches for the businesses you sell to every day, reads their websites for a published address, checks it, and adds the good ones to your CRM.',
    flow: ['Every day', 'Find businesses', 'Check the address', { ask: 'Qualified?', yes: 'Add to CRM', no: 'Find another' }],
    see: featureReady('prospects') ? '#prospecting' : '#leads',
  },
  {
    key: 'sales-followup', icon: Repeat, title: 'Automate follow-up',
    body: 'Answers a new lead in minutes, nudges quotes that went quiet, and stops the moment somebody replies.',
    flow: ['New lead', 'Reply in minutes', { ask: 'Replied?', yes: 'Hand to you', no: 'Nudge in 2 days' }],
    see: '#deals',
  },
  {
    key: 'social-growth', icon: ImageIcon, title: 'Create daily content',
    body: 'Reads your website and writes posts with images in your colours, on the days you choose — each one waiting for your yes.',
    flow: ['Every weekday', 'Read your site', 'Write post + image', 'Ready for review'],
    see: '#leads',
  },
  {
    key: 'appointment-booking', icon: Calendar, title: 'Book more appointments',
    body: 'A booking page of your own, reminders before each visit, and a rebooking message for anybody who misses one.',
    flow: ['Booked', 'Reminder', { ask: 'Turned up?', yes: 'Thank you', no: 'Offer a new time' }],
    see: '#deals',
  },
  {
    key: 'customer-reactivation', icon: RefreshCw, title: 'Re-engage old customers',
    body: 'Writes to the people who bought before, with a reason to come back — a short sequence that ends when they answer.',
    flow: ['Your list', 'Email 1', { ask: 'Answered?', yes: 'Book them', no: 'Email 2 in 4 days' }],
    see: '#deals',
  },
  {
    key: 'blog-seo', icon: FileText, title: 'Grow with SEO articles',
    body: 'A topic plan from what you sell, then an article a week written to what your buyers search for, drafted for you to publish.',
    flow: ['Every week', 'Pick a topic', 'Draft the article', 'Ready to publish'],
    see: '#leads',
  },
  {
    key: 'ecommerce-store', icon: Store, title: 'Build an online store',
    body: 'Your products from a spreadsheet into a shop page with checkout, then a thank-you and a review request after each order.',
    flow: ['Your products', 'Shop page', 'Order paid', 'Ask for a review'],
    see: '#leads',
  },
  {
    key: 'agency-operations', icon: Building2, title: 'Run agency clients',
    body: 'A workspace per client under your own name, onboarding that runs itself, and reports they can open without a login.',
    flow: ['New client', 'Onboarding', 'Monthly report', 'Renewal reminder'],
    see: '#scale',
  },
];

/** The wizard's first screen, still, while its code is on the way. */
function WizardShell() {
  return (
    <div className="sw-card sw-inline sw-shell" aria-busy="true" aria-label="Find my solution">
      <header className="sw-head">
        <span className="sw-brand"><Sparkles size={15} /> Find my solution</span>
        <div className="sw-bar" aria-hidden="true"><i style={{ width: '8%' }} /></div>
      </header>
      <div className="sw-body">
        <h2 className="sw-title">What would you like your business to accomplish?</h2>
        <p className="sw-sub">Say it the way you would to a person. Protected Central works out the rest and shows you the system it would build — before you sign up.</p>
        <div className="sw-ask" />
        <div className="sw-shell-cards" aria-hidden="true">{Array.from({ length: 8 }, (_, i) => <i key={i} />)}</div>
      </div>
    </div>
  );
}

export default function SolutionsSection({ find, onBuild }: { find: FindRequest; onBuild: (key: string) => void }) {
  const grid = useRevealGroup<HTMLDivElement>('.dc-uc');
  const head = useReveal<HTMLDivElement>();
  const section = useRef<HTMLElement | null>(null);
  const [load, setLoad] = useState(find.call > 0);
  useEffect(() => { if (find.call) setLoad(true); }, [find.call]);
  useEffect(() => {
    const el = section.current;
    if (!el || typeof IntersectionObserver === 'undefined') { setLoad(true); return; }
    const io = new IntersectionObserver(([e]) => { if (e?.isIntersecting) { setLoad(true); io.disconnect(); } }, { rootMargin: '150% 0px' });
    io.observe(el);
    return () => io.disconnect();
  }, []);

  return (
    <section className="dc-usecases dc-find-sec" id="solutions" aria-label="What do you want to grow?" ref={section}>
      <div className="dc-chapter-head">
        <span className="dc-eyebrow"><Sparkles size={13} /> Find my solution</span>
        <h2>What do you want <em>to grow?</em></h2>
        <p>Say it in a sentence, or start from a recipe below. Protected Central shows you the system it would build — every workflow, every step — before you sign up.</p>
      </div>

      <div className="dc-find" id="find">
        {load
          ? <Suspense fallback={<WizardShell />}><SolutionWizard key={find.n} inline initialPick={find.pick} call={find.call} /></Suspense>
          : <WizardShell />}
      </div>

      <div className="dc-uc-head reveal" ref={head}>
        <h3>Or start from a ready-made recipe</h3>
        <p>Each one is a plan the wizard above can build. Press <b>Build this</b> and it opens there with that outcome picked.</p>
      </div>
      <div className="dc-uc-grid stagger" ref={grid}>
        {CASES.map(c => (
          <article key={c.key} className="dc-uc">
            <span className="dc-tile-icon"><c.icon size={16} /></span>
            <h3>{c.title}</h3>
            <p>{c.body}</p>
            <ol className="dc-uc-flow" aria-label={`How it runs: ${c.flow.map(s => (typeof s === 'string' ? s : `${s.ask} yes: ${s.yes}, no: ${s.no}`)).join(', then ')}`}>
              {c.flow.map((s, i) => (typeof s === 'string'
                ? <li key={i} className="dc-uc-step">{s}</li>
                : (
                  <li key={i} className="dc-uc-fork">
                    <span className="dc-uc-ask">{s.ask}</span>
                    <span className="dc-uc-yes"><b>Yes</b> {s.yes}</span>
                    <span className="dc-uc-no"><b>No</b> {s.no}</span>
                  </li>
                )))}
            </ol>
            <div className="dc-uc-go">
              <button type="button" className="dc-btn dc-btn-primary dc-btn-sm" onClick={() => onBuild(c.key)}>Build this <ArrowRight size={14} /></button>
              <a className="dc-uc-see" href={c.see}>See the real screens</a>
            </div>
          </article>
        ))}
      </div>
    </section>
  );
}
