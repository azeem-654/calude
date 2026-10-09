/**
 * "What do you want to grow?" — the site's use cases, named by outcome.
 *
 * Each card is a solution in the catalogue (services/projectSolutions.ts):
 * what it does in a sentence, the shape of its main workflow drawn small, and
 * "Build this", which opens Find my solution with that outcome chosen — the
 * plan it shows is the one the app builds. "See the real screens" goes to the
 * section of this page with the photographs of that module running; the small
 * flow here is a diagram, and says so by looking like one.
 *
 * The flows are the shape of the templates each solution builds (the finder's
 * Daily → Find → Verify → Qualified?, the follow-up's reply check …), not
 * promises about results.
 */
import { ArrowRight, Target, Repeat, Image as ImageIcon, Calendar, RefreshCw, FileText, Store, Building2 } from 'lucide-react';
import { useRevealGroup } from './useReveal';
import { featureReady } from '../../services/features';

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

export default function SolutionsSection({ onBuild }: { onBuild: (key: string) => void }) {
  const grid = useRevealGroup<HTMLDivElement>('.dc-uc');
  return (
    <section className="dc-usecases" id="solutions" aria-label="What do you want to grow?">
      <div className="dc-chapter-head">
        <span className="dc-eyebrow">Start from the outcome</span>
        <h2>What do you want <em>to grow?</em></h2>
        <p>Pick what you want. Protected Central shows you the system it would build — every workflow, every step — before you sign up.</p>
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
