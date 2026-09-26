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
 * faster than any paragraph. So the spine of the page is AI Autopilot, then
 * three chapters of bento grid — get leads, close deals, scale — each tile a
 * module, each module shown as a reel of its screens that matter (ShotReel).
 *
 * Every screenshot is a photograph of the running application, taken by
 * scripts/site-reels.mts against a seeded workspace. Nothing here is a mock-up,
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
  BarChart3, Building2, Lock, Palette, ShieldCheck, Mail, MessageSquare,
  Image as ImageIcon, FileText, LayoutTemplate, Wand2, Globe, Search, Rss,
  PlaySquare, Mic, GitBranch, PenLine, Bot, ClipboardList, Calendar, KeyRound, Eye,
  Workflow,
} from 'lucide-react';
import { LogoMark } from '../shared/Logo';
import { appHref, isCrossOrigin } from '../../services/hosts';
import { featureReady } from '../../services/features';
import { PLANS } from '../../services/tenancy';
import { TEMPLATES } from '../Autopilot/workflowTemplates';
import { useReveal, useRevealGroup } from './useReveal';
import Starfield from './Starfield';
import ShotReel from './ShotReel';
import WorksWith from '../shared/WorksWith';
import { AiOrb, EventChips, TypedPrompt } from '../shared/AutopilotScene';
import { REELS } from './reels';
import HelpLauncher from '../shared/HelpLauncher';
import './site.css';

type Reel = keyof typeof REELS;

/* ── The tiles ───────────────────────────────────────────────────────────── */

/**
 * One module, as it appears in a chapter grid.
 *
 * `tone` is the tile's colour and `span` its width in grid columns. Both are
 * data rather than taste: a grid where every tile is the same size and colour
 * reads as a table, and the eye needs somewhere to land first in each row.
 *
 * `reel` names the module's screens in reels.ts — what it is for, a picture at
 * a time — rather than one clip of its page scrolling past.
 */
interface Tile {
  id: string;
  title: string;
  body: string;
  reel: Reel;
  tone: 'ink' | 'lime' | 'mint' | 'forest' | 'slate' | 'moss' | 'paper';
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
    body: 'Every place a lead can come from — pages, sites, posts and articles — with the people '
      + 'they bring in kept in one list.',
    pills: ['Pages on your own domain', 'Posts drafted for you', 'Everyone in one list'],
    tiles: [
      {
        id: 'contacts', title: 'Contacts', tone: 'slate', span: 3, icon: Users,
        body: 'Everyone you have spoken to, with custom fields, notes, tasks and the full history on '
          + 'one page — and the next thing worth doing for each of them. Imports deduplicate on the way in.',
        reel: 'contacts',
      },
      {
        id: 'funnels', title: 'Funnels', tone: 'lime', icon: MousePointerClick,
        body: 'Multi-step funnels with real pages behind them, published on your own domain.',
        reel: 'funnels',
      },
      {
        id: 'websites', title: 'Websites', tone: 'paper', icon: LayoutTemplate,
        body: 'Whole sites, built and published from the same place the campaigns run.',
        reel: 'websites',
      },
      {
        id: 'social', title: 'Social creator', tone: 'moss', icon: ImageIcon,
        body: 'Posts on the right canvas for each platform, in your colours, editable before they go.',
        reel: 'social',
      },
      {
        id: 'blog', title: 'Blog automation', tone: 'forest', span: 3, icon: FileText,
        body: 'A topic plan from your own portfolio, written to the search terms your buyers use — '
          + 'or a post a week, written by an Autopilot agent and waiting for you to publish.',
        reel: 'blog',
      },
    ],
  },
  {
    id: 'deals',
    eyebrow: 'Do the work',
    lead: 'Close more',
    emph: 'deals.',
    body: 'The pipeline, the follow-up and the calendar in one place — so the next step happens '
      + 'whether or not anybody remembers it.',
    pills: ['Stages you define', 'Replies end the cadence', 'Sends with nobody logged in'],
    tiles: [
      {
        id: 'pipelines', title: 'Pipelines', tone: 'ink', span: 3, icon: BarChart3,
        body: 'Stages you define, dragged straight across. Open value and the same value weighted by '
          + 'probability, counted from your own records rather than estimated.',
        reel: 'pipelines',
      },
      {
        id: 'marketing', title: 'Email & sequences', tone: 'lime', icon: Mail,
        body: 'Multi-step cadences on your own mailbox that stop the moment somebody answers. '
          + 'The server sends them, so a scheduled campaign goes out with every tab closed.',
        reel: 'marketing',
      },
      {
        id: 'engagement', title: 'Forms & tickets', tone: 'paper', icon: ClipboardList,
        body: 'A form that files the contact and starts the follow-up, and a ticket for anybody who needs help.',
        reel: 'engagement',
      },
      {
        id: 'calendar', title: 'Calendar', tone: 'mint', icon: Calendar,
        body: 'The week on one grid, with what is booked, who booked it, and a public booking link.',
        reel: 'calendar',
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
        id: 'agency', title: 'Agency & sub-accounts', tone: 'forest', span: 3, icon: Building2,
        body: 'Its own contacts, pipelines, campaigns and calendar for every client, switched between '
          + 'in one click. A workspace you do not own is refused by the API, not merely hidden by the '
          + 'interface — and each sub-account carries its own plan and its own price.',
        reel: 'agency',
      },
      {
        id: 'analytics', title: 'Analytics', tone: 'slate', span: 3, icon: BarChart3,
        body: 'Every figure read live from the module that owns it — revenue, leads and where they came '
          + 'from. A rate over four sends is not shown as a rate.',
        reel: 'analytics',
      },
    ],
  },
];

/* ── AI Autopilot, the part that is new ──────────────────────────────────── */

/**
 * What a visitor needs to know about Autopilot, one line each.
 *
 * Every line is something a customer can do today, on the live product. The
 * template count is read from the library so it cannot drift from it.
 */
const AUTOPILOT = [
  { icon: Mic, title: 'Say what you want', body: 'Type a sentence, say it out loud, or hand it your files and website. It asks only the questions it could not answer itself.' },
  { icon: Workflow, title: 'Approve the blueprint', body: 'You read exactly what it will build — every workflow, every step — and change it in a sentence before anything exists.' },
  { icon: GitBranch, title: 'See every branch', body: 'Workflows are drawn the way they run, each fork labelled Yes or No and every path joined up.' },
  { icon: PenLine, title: 'Edit any step in place', body: 'The pen on a step opens that step alone, with your real forms, tags and stages to pick from — or a new form made on the spot.' },
  { icon: LayoutTemplate, title: `${TEMPLATES.length} ready-made workflows`, body: 'Filed by the problem they solve — missed calls, quotes gone quiet, reviews, daily posts — each previewed in full first.' },
  { icon: ShieldCheck, title: 'Nothing sends unasked', body: 'Anything that emails or texts starts as a draft. What each project may do on its own is a setting you can change.' },
];

/* ── The chain, as a diagram ─────────────────────────────────────────────── */

/* What an Autopilot agent reads, and where what it makes lands. Both lists are
   the ones the server runs (worker/src/lib/projectAgents.ts) — a source or an
   output added here without one there would be a promise. */
const SOURCES = [
  { icon: Wand2, label: 'Your portfolio' },
  { icon: Globe, label: 'A web page' },
  { icon: Search, label: 'A web search' },
  { icon: Rss, label: 'A news feed' },
  { icon: PlaySquare, label: 'A YouTube channel' },
];

const CHAIN = [
  { icon: ImageIcon, label: 'Social posts', where: 'Social Creator' },
  { icon: FileText, label: 'Blog posts', where: 'Blog' },
  { icon: Mail, label: 'Email campaigns', where: 'Campaigns' },
  { icon: MessageSquare, label: 'Follow-ups', where: 'When a lead arrives' },
];

/* ── What it actually does, in place of testimonials ─────────────────────── */

const CAPABILITIES: { group: string; icon: typeof Send; items: string[] }[] = [
  { group: 'Automate', icon: Bot, items: ['AI Autopilot projects', `${TEMPLATES.length} workflow templates`, 'Branching workflows', 'Scheduled AI agents', 'Voice prompts'] },
  {
    group: 'Reach', icon: Send,
    /* Prospect search is held back on the live site (services/features.ts). A
       wall of "what it does" cannot list what it does not do yet. */
    items: ['Email sequences', 'One-to-one email', 'SMS with consent and STOP', 'Deliverability & warm-up',
      ...(featureReady('prospects') ? ['Prospect search'] : [])],
  },
  { group: 'Convert', icon: MousePointerClick, items: ['Funnels', 'Websites', 'Forms & surveys', 'Booking pages', 'Online shop & checkout'] },
  { group: 'Manage', icon: Users, items: ['Contacts', 'Pipelines', 'Conversations', 'Calendar', 'Support tickets'] },
  { group: 'Create', icon: Sparkles, items: ['Social creator', 'Blog automation', 'AI Shorts', 'Content library', 'Brand overlays'] },
  { group: 'Run it as an agency', icon: Building2, items: ['Sub-accounts', 'White-label branding', 'Per-client billing', 'Role-based access', 'Isolated data'] },
];

const OWNERSHIP: { icon: typeof Send; title: string; body: string; reel: Reel }[] = [
  { icon: Send, title: 'Your mailbox', reel: 'marketing', body: 'Gmail, Microsoft 365, Brevo or anything that speaks SMTP. Stored encrypted on the server, used only to send your mail, never handed back to a browser.' },
  { icon: ShieldCheck, title: 'Your domain', reel: 'marketing', body: 'SPF, DKIM and DMARC checked against your own domain — and written for you when Cloudflare is connected.' },
  { icon: Palette, title: 'Your name', reel: 'agency', body: 'White-label the product name, logo and colour per client, so what they log into looks like yours.' },
  { icon: Lock, title: 'Your data', reel: 'agency', body: 'One workspace per client, isolated on the server. Naming somebody else’s workspace is refused, not hidden.' },
];

/* ── Security, on the home page ──────────────────────────────────────────
   Four things that are true of the running product, each backed by a section
   of the Trust Center (/security). No certifications, no "unhackable". */
const TRUST: { icon: typeof Send; title: string; body: string }[] = [
  { icon: Lock, title: 'Workspace protection', body: 'Business information is separated between workspaces, and every request is checked on the server against who is signed in.' },
  { icon: KeyRound, title: 'Secure access', body: 'Hashed passwords, optional 2-step sign-in, limits on password guessing, and a list of every device signed in to your account.' },
  { icon: Eye, title: 'Visibility & control', body: 'See sign-ins and account changes, sign devices out, manage who can open a workspace, and export or delete your data.' },
  { icon: Sparkles, title: 'Responsible AI processing', body: 'AI is given the material for the task you asked for, not your workspace — and the Security page lists exactly what goes where.' },
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
      <ShotReel shots={REELS[t.reel]} label={t.title} />
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

      <div className="dc-bento stagger" ref={grid}>
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

  const chain = useRevealGroup<HTMLDivElement>('.dc-chain-node');
  const wall = useRevealGroup<HTMLDivElement>('.dc-wall-card');
  const own = useRevealGroup<HTMLDivElement>('.dc-own-card');
  const price = useRevealGroup<HTMLDivElement>('.dc-plan');
  const band = useReveal<HTMLDivElement>();
  const tabs = useRevealGroup<HTMLDivElement>('button');
  const foot = useRevealGroup<HTMLDivElement>(':scope > div');
  const source = useReveal<HTMLDivElement>();
  const flow = useReveal<HTMLDivElement>();
  const ctaShot = useReveal<HTMLDivElement>();
  const showHead = useReveal<HTMLDivElement>();
  const showList = useRevealGroup<HTMLDivElement>('.dc-show-item');

  return (
    <div className="dc">
      {/* The same help button as inside the app, for somebody deciding whether
          to sign up: a question before buying is the one most worth answering. */}
      <HelpLauncher signedIn={false} />
      {/* The sky everything else is translucent over. */}
      <Starfield />

      {/* ── Nav ── */}
      <header className={`dc-nav${stuck ? ' stuck' : ''}`}>
        <a className="dc-brand" href="#top">
          <LogoMark size={26} />
          <span>Protected Central</span>
        </a>
        <nav className="dc-links" aria-label="Sections">
          <a href="#autopilot">Autopilot</a>
          <a href="#leads">Leads</a>
          <a href="#deals">Deals</a>
          <a href="#scale">Agency</a>
          <a href="#platform">Platform</a>
          <a href="#pricing">Pricing</a>
          <a href="/security">Security</a>
        </nav>
        <div className="dc-nav-cta">
          <a className="dc-btn dc-btn-ghost" href={appHref('/login')} {...cross(appHref('/login'))}>Sign in</a>
          <a className="dc-btn dc-btn-primary" href={appHref('/signup')} {...cross(appHref('/signup'))}>Start free</a>
        </div>
      </header>

      {/* ── Hero ──
             AI Autopilot, working, is the first thing anybody sees: a request
             being typed, the real Autopilot screens underneath it, and the
             things it does surfacing around them. The screens are photographs
             of the product (reels.ts); the prompt and the events are an
             illustration and say nothing about anybody's results. ── */}
      <section className="dc-hero" id="top">
        <div className="dc-hero-glow" aria-hidden="true" />
        <div className="dc-hero-inner">
          <a className="dc-eyebrow dc-ai-pill dc-lead-0" href="#autopilot">
            <Sparkles size={14} /> AI Autopilot<span className="dc-ai-pill-more"> — describe it, and it builds and runs it</span> <ArrowRight size={14} />
          </a>
          <h1 className="dc-split">
            <span className="dc-lead-l">Run your agency</span>
            <i aria-hidden="true" />
            <span className="dc-lead-r">Resell it as your own</span>
          </h1>
          <p className="dc-hero-sub dc-lead-1">
            Tell it what you want in a sentence and AI Autopilot builds the workflows, writes the posts
            and follows up every lead — one login, on your own mailbox, with every step visible and
            editable before it happens.
          </p>
          <div className="dc-hero-cta dc-lead-2">
            <a className="dc-btn dc-btn-primary dc-btn-lg" href={appHref('/signup')} {...cross(appHref('/signup'))}>
              Start free <ArrowRight size={16} />
            </a>
            <a className="dc-btn dc-btn-outline dc-btn-lg" href="#autopilot">See how it works</a>
          </div>
          <div className="dc-hero-stage dc-lead-3">
            <div className="dc-hero-sparks" aria-hidden="true">{Array.from({ length: 14 }, (_, i) => <i key={i} />)}</div>
            <div className="dc-hero-orb" aria-hidden="true"><AiOrb size={120} /></div>
            <TypedPrompt className="dc-hero-prompt" />
            {/* The hero's reel is the one that loads eagerly — it is the first
                thing anybody sees, and waiting for it to be scrolled to would
                mean it never starts. */}
            <div className="dc-hero-shot">
              <ShotReel shots={REELS.autopilot} label="AI Autopilot" eager />
              <span className="dc-hero-scan" aria-hidden="true" />
            </div>
            <EventChips className="dc-hero-chips" />
          </div>
          {/* The figures in every screen on this page are example data. Said
              once, plainly, where the first of them appears. */}
          <p className="dc-sample-note">Screens show a sample workspace with example data.</p>
        </div>
      </section>

      {/* ── What it connects to, and what it writes for. Two rows, labelled,
             because they are two different claims (WorksWith.tsx). ── */}
      <div className="dc-works">
        <WorksWith title="Works with the tools you already use" />
      </div>

      {/* ── The band under the hero.
             Where a site of this shape prints a star rating, this prints
             something that can be checked by opening the product. ── */}
      <div className="dc-band reveal" ref={band}>
        <span>Every module. One login.</span>
        <b>Your mailbox, your domain, your name on it.</b>
      </div>

      {/* ── AI Autopilot ──
             First, because it is what the rest is now driven by, and because
             it is the part a visitor has not seen on another platform. ── */}
      <section className="dc-showcase" id="autopilot" aria-label="AI Autopilot">
        <div className="dc-show">
          <div className="dc-show-head reveal" ref={showHead}>
            <span className="dc-eyebrow">AI Autopilot</span>
            <h2>Describe it once. <em>It builds and runs it.</em></h2>
            <p>
              Say what the business needs — more reviews, quotes that do not go quiet, a post every
              morning — and Autopilot turns it into workflows you can read, then runs them on the
              server every five minutes, whether or not anybody is logged in.
            </p>
            <div className="dc-show-list stagger" ref={showList}>
              {AUTOPILOT.map(a => (
                <div key={a.title} className="dc-show-item">
                  <span className="dc-tile-icon"><a.icon size={15} /></span>
                  <div><b>{a.title}</b><span>{a.body}</span></div>
                </div>
              ))}
            </div>
          </div>
          <div className="dc-show-reel">
            {/* The hero shows these from the first; here they start from the
                board it all runs from, so the same reel is not seen twice in
                the same order. */}
            <ShotReel shots={[...REELS.autopilot].reverse()} label="AI Autopilot" />
          </div>
        </div>
      </section>

      {/* ── The three chapters ── */}
      {CHAPTERS.map(c => <ChapterBlock key={c.id} c={c} />)}

      {/* ── The chain ── */}
      <section className="dc-process" aria-label="One outcome, every channel">
        <div className="dc-chapter-head">
          <span className="dc-eyebrow">Agents that work while you do not</span>
          <h2>Your sources in. <em>Every channel out.</em></h2>
          <p>
            An Autopilot agent reads what you point it at — your own portfolio, a page, a search of the
            web, a news feed or a YouTube channel — and turns it into posts, articles and campaigns on
            the schedule you choose. Each one lands in the module it belongs to, ready to read.
          </p>
        </div>

        <div className="dc-chain">
          <div className="dc-chain-node dc-chain-source reveal" ref={source}>
            <span className="dc-tile-icon"><Bot size={16} /></span>
            <b>An agent reads</b>
            <small className="dc-chain-sources">
              {SOURCES.map(x => <span key={x.label}><x.icon size={11} /> {x.label}</span>)}
            </small>
          </div>
          <div className="dc-chain-fan" aria-hidden="true" />
          <div className="dc-chain-out stagger" ref={chain}>
            {CHAIN.map(c => (
              <div key={c.label} className="dc-chain-node">
                <span className="dc-tile-icon"><c.icon size={14} /></span>
                <b>{c.label}</b>
                <small>{c.where}</small>
              </div>
            ))}
          </div>
        </div>

        <div className="dc-flow-shot reveal" ref={flow}>
          <ShotReel shots={REELS.autopilot.slice(1, 3)} label="A workflow, drawn as it runs" />
        </div>
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

        <div className="dc-tabs stagger" role="tablist" aria-label="What you own" ref={tabs}>
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

        <div className="dc-own stagger" ref={own}>
          <div className="dc-own-card dc-own-lead" key={tab}>
            <h3>{OWNERSHIP[tab].title}</h3>
            <p>{OWNERSHIP[tab].body}</p>
          </div>
          <div className="dc-own-shot">
            <ShotReel key={OWNERSHIP[tab].reel} shots={REELS[OWNERSHIP[tab].reel]} label={OWNERSHIP[tab].title} />
          </div>
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
        <div className="dc-wall stagger" ref={wall}>
          {CAPABILITIES.map(g => (
            <div key={g.group} className="dc-wall-card">
              <h4><g.icon size={14} /> {g.group}</h4>
              <ul>{g.items.map(i => <li key={i}><Check size={12} /> {i}</li>)}</ul>
            </div>
          ))}
        </div>
      </section>

      {/* ── Security ── */}
      <section className="dc-trust" id="trust" aria-label="Security and privacy">
        <div className="dc-chapter-head">
          <span className="dc-eyebrow">Security &amp; privacy</span>
          <h2>Your business <em>belongs to you.</em></h2>
          <p>Protected Central is built around privacy, access control and secure business operations.</p>
        </div>
        <div className="dc-trust-grid">
          {TRUST.map(t => (
            <div key={t.title} className="dc-trust-card">
              <span className="dc-tile-icon"><t.icon size={15} /></span>
              <h3>{t.title}</h3>
              <p>{t.body}</p>
            </div>
          ))}
        </div>
        <div className="dc-trust-more">
          <a className="dc-btn dc-btn-outline" href="/security">Explore Security &amp; Privacy <ArrowRight size={14} /></a>
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
        <div className="dc-plans stagger" ref={price}>
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
        <div className="dc-cta-shot reveal" ref={ctaShot}>
          <ShotReel shots={REELS.dashboard} label="The product" chrome={false} />
        </div>
      </section>

      {/* ── Footer ── */}
      <footer className="dc-foot">
        <div className="dc-foot-cols stagger" ref={foot}>
          <div className="dc-foot-brand">
            <a className="dc-brand" href="#top"><LogoMark size={24} /><span>Protected Central</span></a>
            <p>Every step, in the open.</p>
          </div>
          <div>
            <h5>Find</h5>
            <a href="#autopilot">AI Autopilot</a><a href="#autopilot">Workflow templates</a>
            <a href="#leads">Contacts</a><a href="#leads">Funnels</a>
          </div>
          <div>
            <h5>Do</h5>
            <a href="#deals">Pipelines</a><a href="#deals">Email &amp; sequences</a>
            <a href="#deals">Forms &amp; tickets</a><a href="#deals">Calendar</a>
          </div>
          <div>
            <h5>Sell</h5>
            <a href="#scale">Sub-accounts</a><a href="#scale">White-label</a>
            <a href="#scale">Analytics</a><a href="#pricing">Pricing</a>
          </div>
          <div>
            <h5>Account</h5>
            <a href={appHref('/login')} {...cross(appHref('/login'))}>Sign in</a>
            <a href={appHref('/signup')} {...cross(appHref('/signup'))}>Create an account</a>
            <a href="/security">Security &amp; privacy</a>
            <a href="/privacy">Privacy policy</a>
            <a href="/terms-of-service">Terms of service</a>
            <a href="/terms">Acceptable use</a>
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
