/**
 * The public site.
 *
 * It is the whole of protectedcentral.com. The product is a separate hostname,
 * app.protectedcentral.com, and every way in from here — sign in, sign up, the
 * hero buttons — is a link across to it. services/hosts.ts owns that decision
 * so the same bundle still runs as one site on localhost.
 *
 * The shape is the one a modern platform site has settled on, and it is that
 * shape for a reason: a visitor deciding between platforms is counting, and a
 * wall of tiles each containing a real screen answers "how much is in here"
 * faster than any paragraph. So the spine of the page is three chapters of
 * bento grid — get leads, close deals, scale — each tile a module, each module
 * photographed rather than illustrated.
 *
 * Every screenshot is a photograph of the running application, taken by
 * scripts/site-shots.mjs against a seeded workspace. Nothing here is a mock-up,
 * and when a module's look changes the picture is re-taken rather than redrawn.
 *
 * What this page will not do is invent evidence. There are no customer counts,
 * no star ratings and no testimonials, because there is nothing yet to base
 * them on — and a page whose entire argument is "we show you our working"
 * cannot open with a number nobody counted. Where a site of this shape would
 * carry a wall of reviews, this one carries a wall of what the software
 * actually does, which is checkable.
 */
import { useEffect, useState } from 'react';
import {
  ArrowRight, ArrowUpRight, Check, Sparkles, Send, MousePointerClick, Users,
  BarChart3, Building2, Inbox, Lock, Palette, ShieldCheck, Server, Activity,
  Mail, MessageSquare, Image as ImageIcon, FileText, Clapperboard,
  LayoutTemplate, Wand2,
} from 'lucide-react';
import { LogoMark } from '../shared/Logo';
import { appHref, isCrossOrigin } from '../../services/hosts';
import { PLANS } from '../../services/tenancy';
import { useReveal, useRevealGroup } from './useReveal';
import './site.css';

const SHOT = (name: string) => `${(import.meta.env.BASE_URL || '/').replace(/\/$/, '')}/site/${name}.webp`;

/* ── The tiles ───────────────────────────────────────────────────────────── */

/**
 * One module, as it appears in a chapter grid.
 *
 * `tone` is the tile's colour and `span` its width in grid columns. Both are
 * data rather than taste: a grid where every tile is the same size and colour
 * reads as a table, and the eye needs somewhere to land first in each row.
 */
interface Tile {
  id: string;
  title: string;
  body: string;
  shot: string;
  alt: string;
  tone: 'ink' | 'violet' | 'blue' | 'teal' | 'amber' | 'coral' | 'paper';
  span?: 2 | 3;
  icon: typeof Send;
}

interface Chapter {
  id: string;
  eyebrow: string;
  lead: string;
  /** The half of the heading that carries the gradient. */
  emph: string;
  body: string;
  pills: string[];
  tiles: Tile[];
}

const CHAPTERS: Chapter[] = [
  {
    id: 'leads',
    eyebrow: 'Find the work',
    lead: 'Get more',
    emph: 'leads.',
    body: 'Say what you want in a sentence and the agent builds the campaign — then every place a '
      + 'lead can come from, in the same login.',
    pills: ['Describe the outcome', 'Approve before it exists', 'Sends on your own mailbox'],
    tiles: [
      {
        id: 'agent', title: 'AI Sales Agent', tone: 'ink', span: 3, icon: Sparkles,
        body: 'Write the outcome you want. It works out who to reach and how, shows you the plan '
          + 'before anything exists, then creates the real contacts, sequence and enrolments.',
        shot: 'agent', alt: 'The AI Sales Agent, showing a campaign built from one sentence',
      },
      {
        id: 'contacts', title: 'Contacts', tone: 'paper', icon: Users,
        body: 'Everyone you have spoken to, with custom fields, notes, tasks and the full history. '
          + 'Imports deduplicate on the way in.',
        shot: 'contacts', alt: 'The contact list with filters and health on every row',
      },
      {
        id: 'funnels', title: 'Funnels', tone: 'violet', icon: MousePointerClick,
        body: 'Multi-step funnels with real pages behind them, published on your own domain.',
        shot: 'funnels', alt: 'The funnel builder',
      },
      {
        id: 'websites', title: 'Websites', tone: 'blue', icon: LayoutTemplate,
        body: 'Whole sites, built and published from the same place the campaigns run.',
        shot: 'websites', alt: 'The website builder',
      },
      {
        id: 'scheduling', title: 'Booking pages', tone: 'teal', icon: MessageSquare,
        body: 'Your availability, a public link, and the meeting on your calendar without an email thread.',
        shot: 'scheduling', alt: 'Scheduling and booking pages',
      },
      {
        id: 'blog', title: 'Blog automation', tone: 'amber', icon: FileText,
        body: 'A topic plan from your own portfolio, written to the search terms your buyers use.',
        shot: 'blog', alt: 'Blog automation with topic clusters',
      },
      {
        id: 'social', title: 'Social creator', tone: 'coral', icon: ImageIcon,
        body: 'Posts on the right canvas for each platform, in your colours, editable before they go.',
        shot: 'social', alt: 'The social post creator',
      },
    ],
  },
  {
    id: 'deals',
    eyebrow: 'Do the work',
    lead: 'Close more',
    emph: 'deals.',
    body: 'The pipeline, the inbox and the calendar in one place — so the follow-up happens whether '
      + 'or not anybody remembers it.',
    pills: ['Stages you define', 'Replies end the cadence', 'Sends with nobody logged in'],
    tiles: [
      {
        id: 'pipelines', title: 'Pipelines', tone: 'blue', span: 3, icon: BarChart3,
        body: 'Stages you define, dragged straight across. Open value and the same value weighted by '
          + 'probability, counted from your own records rather than estimated.',
        shot: 'pipelines', alt: 'The pipeline board with deals by stage',
      },
      {
        id: 'marketing', title: 'Email & sequences', tone: 'violet', icon: Mail,
        body: 'Multi-step cadences on your own SMTP that stop the moment somebody answers. '
          + 'The server sends them, so a scheduled campaign goes out with every tab closed.',
        shot: 'marketing', alt: 'Campaigns and their sequences',
      },
      {
        id: 'conversations', title: 'Conversations', tone: 'ink', icon: Inbox,
        body: 'Replies read from your own mailbox over IMAP, so a conversation stays a conversation.',
        shot: 'conversations', alt: 'The conversations inbox',
      },
      {
        id: 'calendar', title: 'Calendar', tone: 'paper', icon: Users,
        body: 'The week on one grid, with what is booked and who booked it.',
        shot: 'calendar', alt: 'The calendar week view',
      },
      {
        id: 'reputation', title: 'Reputation', tone: 'coral', icon: ShieldCheck,
        body: 'Ask the customers most likely to say something good, and answer the ones who did not.',
        shot: 'reputation', alt: 'Reputation and review management',
      },
    ],
  },
  {
    id: 'scale',
    eyebrow: 'Sell the work',
    lead: 'Scale your business',
    emph: 'faster.',
    body: 'A workspace per client, your name on all of it, and a schedule that runs whether or not '
      + 'anyone is watching.',
    pills: ['A sub-account per client', 'White-label per client', 'Enforced on the server'],
    tiles: [
      {
        id: 'agency', title: 'Agency & sub-accounts', tone: 'violet', span: 3, icon: Building2,
        body: 'Its own contacts, pipelines, campaigns and calendar for every client, switched between '
          + 'in one click. A workspace you do not own is refused by the API, not merely hidden by the '
          + 'interface — and each sub-account carries its own plan and its own price.',
        shot: 'agency', alt: 'The agency dashboard listing client sub-accounts',
      },
      {
        id: 'analytics', title: 'Analytics', tone: 'blue', icon: BarChart3,
        body: 'Every figure read live from the module that owns it. A rate over four sends is not shown as a rate.',
        shot: 'analytics', alt: 'The analytics screen',
      },
      {
        id: 'automation', title: 'Automation', tone: 'ink', icon: Activity,
        body: 'What the schedule did while you were away — what started, what sent, and the exact '
          + 'sentence for anything it could not do.',
        shot: 'automation', alt: 'The automation health screen',
      },
      {
        id: 'infrastructure', title: 'Domains & mailboxes', tone: 'teal', icon: Server,
        body: 'Search a domain and register it, write SPF, DKIM and DMARC, create the mailbox — '
          + 'without leaving the app.',
        shot: 'infrastructure', alt: 'The infrastructure settings screen',
      },
    ],
  },
];

/* ── The chain, as a diagram ─────────────────────────────────────────────── */

const CHAIN = [
  { icon: Mail, label: 'Email sequence', where: 'Marketing' },
  { icon: MessageSquare, label: 'SMS campaign', where: 'Marketing' },
  { icon: ImageIcon, label: 'Social posts', where: 'Social Creator' },
  { icon: FileText, label: 'Blog project', where: 'Blog Automation' },
  { icon: Clapperboard, label: 'Short script', where: 'Ready to shoot' },
  { icon: LayoutTemplate, label: 'Landing page', where: 'Funnels' },
];

/* ── What it actually does, in place of testimonials ─────────────────────── */

const CAPABILITIES: { group: string; icon: typeof Send; items: string[] }[] = [
  { group: 'Reach', icon: Send, items: ['Email sequences', 'One-to-one email', 'SMS with consent and STOP', 'Deliverability & warm-up', 'Prospect search'] },
  { group: 'Convert', icon: MousePointerClick, items: ['Funnels', 'Websites', 'Landing pages', 'Booking pages', 'Forms & surveys'] },
  { group: 'Manage', icon: Users, items: ['Contacts', 'Pipelines', 'Conversations', 'Calendar', 'Tasks & notes'] },
  { group: 'Create', icon: Sparkles, items: ['AI Shorts', 'Blog automation', 'Social creator', 'Content library', 'Brand overlays'] },
  { group: 'Understand', icon: BarChart3, items: ['Campaign performance', 'Open & reply rates', 'Reputation', 'Analytics', 'Decision log'] },
  { group: 'Run it as an agency', icon: Building2, items: ['Sub-accounts', 'White-label branding', 'Per-client billing', 'Role-based access', 'Isolated data'] },
];

const OWNERSHIP = [
  { icon: Send, title: 'Your mailbox', body: 'Gmail, Microsoft 365, Brevo or anything that speaks SMTP. Stored encrypted on the server, used only to send your mail, never handed back to a browser.' },
  { icon: ShieldCheck, title: 'Your domain', body: 'SPF, DKIM and DMARC checked against your own domain — and written for you when Cloudflare is connected.' },
  { icon: Palette, title: 'Your name', body: 'White-label the product name, logo and colour per client, so what they log into looks like yours.' },
  { icon: Lock, title: 'Your data', body: 'One workspace per client, isolated on the server. Naming somebody else’s workspace is refused, not hidden.' },
];

/* ── Small pieces ────────────────────────────────────────────────────────── */

/**
 * The extra attributes a link to the app needs.
 *
 * On the marketing host these go to another origin and want `rel="noopener"`;
 * on localhost the same bundle serves both, so the link is same-origin and the
 * attribute would be noise. hosts.ts decides, per href.
 */
const cross = (href: string) => (isCrossOrigin(href) ? { rel: 'noopener' as const } : {});

function Tile({ t }: { t: Tile }) {
  return (
    <article className={`dc-tile dc-${t.tone}${t.span === 3 ? ' dc-wide' : ''}`}>
      <div className="dc-tile-head">
        <span className="dc-tile-icon"><t.icon size={15} /></span>
        <h3>{t.title}</h3>
      </div>
      <p>{t.body}</p>
      <figure className="dc-tile-shot">
        {/* Width and height are the real pixel size so the space is reserved
            before the picture arrives and the grid does not jump as it loads. */}
        <img src={SHOT(t.shot)} alt={t.alt} loading="lazy" width={1400} height={903} />
      </figure>
    </article>
  );
}

function ChapterBlock({ c }: { c: Chapter }) {
  const head = useReveal<HTMLDivElement>();
  const grid = useRevealGroup<HTMLDivElement>('.dc-tile');

  return (
    <section className="dc-chapter" id={c.id} aria-label={`${c.lead} ${c.emph}`}>
      <div className="dc-chapter-head reveal" ref={head}>
        <span className="dc-eyebrow">{c.eyebrow}</span>
        <h2>{c.lead} <em>{c.emph}</em></h2>
        <p>{c.body}</p>
        <a className="dc-btn dc-btn-primary" href={appHref('/signup')} {...cross(appHref('/signup'))}>
          Start free <ArrowRight size={15} />
        </a>
        <div className="dc-pills">
          {c.pills.map(p => <span key={p} className="dc-pill"><Check size={11} /> {p}</span>)}
        </div>
      </div>

      <div className="dc-bento" ref={grid}>
        {c.tiles.map(t => <Tile key={t.id} t={t} />)}
      </div>
    </section>
  );
}

/* ── The page ────────────────────────────────────────────────────────────── */

export default function SiteHome() {
  const [stuck, setStuck] = useState(false);
  const [tab, setTab] = useState(0);

  /* The nav is transparent over the hero and solid once you leave it, which is
     the only way a dark translucent bar stays legible over a light page. */
  useEffect(() => {
    const onScroll = () => setStuck(window.scrollY > 24);
    onScroll();
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  const hero = useReveal<HTMLDivElement>();
  const chain = useRevealGroup<HTMLDivElement>('.dc-chain-node');
  const wall = useRevealGroup<HTMLDivElement>('.dc-wall-card');
  const own = useRevealGroup<HTMLDivElement>('.dc-own-card');
  const price = useRevealGroup<HTMLDivElement>('.dc-plan');

  return (
    <div className="dc">
      {/* ── Nav ── */}
      <header className={`dc-nav${stuck ? ' stuck' : ''}`}>
        <a className="dc-brand" href="#top">
          <LogoMark size={26} />
          <span>Protected Central</span>
        </a>
        <nav className="dc-links" aria-label="Sections">
          <a href="#leads">Leads</a>
          <a href="#deals">Deals</a>
          <a href="#scale">Agency</a>
          <a href="#platform">Platform</a>
          <a href="#pricing">Pricing</a>
        </nav>
        <div className="dc-nav-cta">
          <a className="dc-btn dc-btn-ghost" href={appHref('/login')} {...cross(appHref('/login'))}>Sign in</a>
          <a className="dc-btn dc-btn-primary" href={appHref('/signup')} {...cross(appHref('/signup'))}>Start free</a>
        </div>
      </header>

      {/* ── Hero ── */}
      <section className="dc-hero" id="top">
        <div className="dc-hero-glow" aria-hidden="true" />
        <div className="dc-hero-inner reveal" ref={hero}>
          <h1 className="dc-split">
            <span>Run your agency</span>
            <i aria-hidden="true" />
            <span>Resell it as your own</span>
          </h1>
          <p className="dc-hero-sub">
            Find the people worth contacting, write to them, book the meeting and see what actually
            worked — one login, on your own mailbox, with every step visible and editable before it happens.
          </p>
          <div className="dc-hero-cta">
            <a className="dc-btn dc-btn-primary dc-btn-lg" href={appHref('/signup')} {...cross(appHref('/signup'))}>
              Start free <ArrowRight size={16} />
            </a>
            <a className="dc-btn dc-btn-outline dc-btn-lg" href="#leads">See the modules</a>
          </div>
          <figure className="dc-hero-shot">
            <div className="dc-chrome" aria-hidden="true"><i /><i /><i /></div>
            <img src={SHOT('dashboard')} alt="The dashboard, showing the day at a glance" width={1400} height={903} />
          </figure>
        </div>
      </section>

      {/* ── The band under the hero.
             Where a site of this shape prints a star rating, this prints
             something that can be checked by opening the product. ── */}
      <div className="dc-band">
        <span>Twenty modules. One login.</span>
        <b>Your mailbox, your domain, your name on it.</b>
      </div>

      {/* ── The three chapters ── */}
      {CHAPTERS.map(c => <ChapterBlock key={c.id} c={c} />)}

      {/* ── The chain ── */}
      <section className="dc-process" aria-label="One outcome, every channel">
        <div className="dc-chapter-head">
          <span className="dc-eyebrow">The part nobody else does</span>
          <h2>One outcome in. <em>Every channel out.</em></h2>
          <p>
            Pick what you want to happen — book more consultations, launch an offer, win back the
            customers who went quiet — and the whole campaign is written from your company portfolio.
            You read it in full before anything is created.
          </p>
        </div>

        <div className="dc-chain" ref={chain}>
          <div className="dc-chain-node dc-chain-source">
            <span className="dc-tile-icon"><Wand2 size={16} /></span>
            <b>Your portfolio</b>
            <small>What you sell, and to whom</small>
          </div>
          <div className="dc-chain-fan" aria-hidden="true" />
          <div className="dc-chain-out">
            {CHAIN.map(c => (
              <div key={c.label} className="dc-chain-node">
                <span className="dc-tile-icon"><c.icon size={14} /></span>
                <b>{c.label}</b>
                <small>{c.where}</small>
              </div>
            ))}
          </div>
        </div>

        <figure className="dc-flow-shot">
          <img src={SHOT('flow')} alt="The campaign canvas, with each step as a node joined by wires" loading="lazy" width={1400} height={903} />
        </figure>
      </section>

      {/* ── Platform / ownership ── */}
      <section className="dc-platform" id="platform">
        <div className="dc-chapter-head">
          <span className="dc-eyebrow">Yours, not ours</span>
          <h2>A single, powerful, <em>white-label platform.</em></h2>
          <p>
            Every third-party call is made from the server, never from the browser. Customer
            credentials are encrypted at rest and are never returned to a page — endpoints report
            whether a secret is set, never what it is.
          </p>
        </div>

        <div className="dc-tabs" role="tablist" aria-label="What you own">
          {OWNERSHIP.map((o, i) => (
            <button
              key={o.title}
              role="tab"
              aria-selected={tab === i}
              className={tab === i ? 'on' : ''}
              onClick={() => setTab(i)}
            >
              <o.icon size={14} /> {o.title}
            </button>
          ))}
        </div>

        <div className="dc-own" ref={own}>
          <div className="dc-own-card dc-own-lead">
            <h3>{OWNERSHIP[tab].title}</h3>
            <p>{OWNERSHIP[tab].body}</p>
          </div>
          <figure className="dc-own-shot">
            <img
              src={SHOT(tab === 3 ? 'agency' : 'infrastructure')}
              alt={tab === 3 ? 'Client sub-accounts' : 'Domain, DNS and mailbox settings'}
              loading="lazy" width={1400} height={903}
            />
          </figure>
        </div>
      </section>

      {/* ── The wall.
             A site of this shape puts a grid of reviews here. There are none to
             put, so this is what the software does instead — a claim per line,
             each one checkable by opening the product. ── */}
      <section className="dc-wallsec" aria-label="What is in it">
        <div className="dc-chapter-head">
          <span className="dc-eyebrow">All of it, in one login</span>
          <h2>Everything you would otherwise <em>buy five times.</em></h2>
        </div>
        <div className="dc-wall" ref={wall}>
          {CAPABILITIES.map(g => (
            <div key={g.group} className="dc-wall-card">
              <h4><g.icon size={14} /> {g.group}</h4>
              <ul>{g.items.map(i => <li key={i}><Check size={12} /> {i}</li>)}</ul>
            </div>
          ))}
        </div>
      </section>

      {/* ── Pricing ── */}
      <section className="dc-pricing" id="pricing">
        <div className="dc-chapter-head">
          <span className="dc-eyebrow">Resell it at your price</span>
          <h2>One subscription. <em>As many clients as your plan allows.</em></h2>
          <p>
            You are billed once. What you charge your own clients is entirely yours to set, and the
            sub-account allowance is enforced on the server rather than in the browser.
          </p>
        </div>
        <div className="dc-plans" ref={price}>
          {PLANS.map((p, i) => (
            <div key={p.id} className={`dc-plan${i === 1 ? ' featured' : ''}`}>
              {i === 1 && <span className="dc-plan-flag">Most agencies</span>}
              <h3>{p.name}</h3>
              <div className="dc-plan-price"><span>$</span>{p.price}<small>/month</small></div>
              <p className="dc-plan-sub">
                {p.limits.resell < 0
                  ? 'Unlimited sub-accounts'
                  : `${p.limits.resell} sub-account${p.limits.resell === 1 ? '' : 's'}`}
              </p>
              <ul>{p.features.map(f => <li key={f}><Check size={12} /> {f}</li>)}</ul>
              <a className={`dc-btn ${i === 1 ? 'dc-btn-primary' : 'dc-btn-outline'}`} href={appHref('/signup')} {...cross(appHref('/signup'))}>
                Start free <ArrowRight size={14} />
              </a>
            </div>
          ))}
        </div>
      </section>

      {/* ── Closing call ── */}
      <section className="dc-cta">
        <div className="dc-cta-glow" aria-hidden="true" />
        <h2>Get started with<br />Protected Central today</h2>
        <p>Free to start. Your workspace is yours alone from the moment it exists.</p>
        <div className="dc-hero-cta">
          <a className="dc-btn dc-btn-light dc-btn-lg" href={appHref('/signup')} {...cross(appHref('/signup'))}>
            Create your account <ArrowUpRight size={16} />
          </a>
          <a className="dc-btn dc-btn-outline-light dc-btn-lg" href={appHref('/login')} {...cross(appHref('/login'))}>Sign in</a>
        </div>
        <figure className="dc-cta-shot">
          <img src={SHOT('marketing')} alt="Campaigns running in the product" loading="lazy" width={1400} height={903} />
        </figure>
      </section>

      {/* ── Footer ── */}
      <footer className="dc-foot">
        <div className="dc-foot-cols">
          <div className="dc-foot-brand">
            <a className="dc-brand" href="#top"><LogoMark size={24} /><span>Protected Central</span></a>
            <p>Every step, in the open.</p>
          </div>
          <div>
            <h5>Find</h5>
            <a href="#leads">AI Sales Agent</a><a href="#leads">Contacts</a>
            <a href="#leads">Funnels</a><a href="#leads">Websites</a>
          </div>
          <div>
            <h5>Do</h5>
            <a href="#deals">Pipelines</a><a href="#deals">Email &amp; sequences</a>
            <a href="#deals">Conversations</a><a href="#deals">Calendar</a>
          </div>
          <div>
            <h5>Sell</h5>
            <a href="#scale">Sub-accounts</a><a href="#scale">White-label</a>
            <a href="#scale">Automation</a><a href="#pricing">Pricing</a>
          </div>
          <div>
            <h5>Account</h5>
            <a href={appHref('/login')} {...cross(appHref('/login'))}>Sign in</a>
            <a href={appHref('/signup')} {...cross(appHref('/signup'))}>Create an account</a>
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
