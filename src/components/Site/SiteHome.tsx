/**
 * The public site: one screen that never scrolls.
 *
 * Until now protectedcentral.com opened on a login box, which tells a visitor
 * who has never heard of the product exactly nothing. This is the page that
 * answers "what is it" before asking anyone to sign in.
 *
 * It is a deck rather than a document. The window holds still and the wheel
 * moves a horizontal track of panels through it, one notch at a time, with the
 * panels either side visible but unlit — so the movement between sections *is*
 * the animation rather than something layered on top of scrolling. useDeck.ts
 * has the input handling; this file is the content and the chrome.
 *
 * Every claim on it is checkable against the software. There are no customer
 * counts, no uptime figures and no testimonials, because there is nothing to
 * base them on yet and a marketing page that opens with an invented number is
 * the worst possible first impression for a product whose entire argument is
 * that it shows you its working.
 */
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  ArrowRight, ArrowUpRight, BarChart3, Building2, Check, ChevronLeft, ChevronRight,
  Info, Layers, MousePointerClick, Send, Sparkles, Users,
} from 'lucide-react';
import { activeBranding } from '../../services/tenancy';
import {
  IsoAgent, IsoFunnel, IsoHero, IsoPipeline, IsoSequence, IsoStudio,
} from './Isometric';
import { useDeck } from './useDeck';
import './site.css';

/* ── The content ──────────────────────────────────────────────────────── */

interface Panel {
  id: string;
  /** The chapter this belongs to, shown bottom-left while it is on screen. */
  chapter: string;
  eyebrow: string;
  /** Dark panels are the bands cut into an otherwise light page. */
  tone?: 'dark';
  render: (ctx: { onSignIn: () => void; name: string }) => React.ReactNode;
}

interface ProductCopy {
  id: string;
  eyebrow: string;
  /** The run-up, set in muted grey. */
  lead: string;
  /** The half the eye should land on, in full colour. */
  emph: string;
  body: string;
  art: () => React.ReactElement;
  points: string[];
}

const PRODUCTS: ProductCopy[] = [
  {
    id: 'agent',
    eyebrow: 'AI Sales Agent',
    lead: 'Describe the outcome.',
    emph: 'It builds the campaign.',
    body: 'Write what you want in a sentence. The agent works out who to reach and how, '
      + 'shows you the plan before anything exists, and then creates the real contacts, the real '
      + 'email sequence and the real enrolments in the modules that own them.',
    art: IsoAgent,
    points: [
      'Every plan is editable before a single record is created',
      'Nothing sends until you say it may',
      'Each record links back, so a campaign is one thing again',
    ],
  },
  {
    id: 'crm',
    eyebrow: 'Contacts & Pipelines',
    lead: 'The record of',
    emph: 'everyone you have spoken to.',
    body: 'Contacts with custom fields, notes, tasks and a full activity history. Drag-and-drop '
      + 'pipelines with the stages your business actually uses, and a command centre that shows '
      + 'what each person has opened, clicked and replied to.',
    art: IsoPipeline,
    points: [
      'Import a list, deduplicate on the way in',
      'Deals, stages and values you define',
      'Timezone inferred from the number when it is not set',
    ],
  },
  {
    id: 'email',
    eyebrow: 'Email & Sequences',
    lead: 'Cadences that stop',
    emph: 'the moment somebody answers.',
    body: 'Multi-step sequences on your own SMTP, with merge fields, open and click tracking, '
      + 'bounce suppression and a warm-up ramp that will refuse to send past the day’s allowance. '
      + 'Reply, and the follow-ups stop.',
    art: IsoSequence,
    points: [
      'A/B test any step',
      'Hard bounces suppressed on the first rejection',
      'Rates are hidden until the sample can carry them',
    ],
  },
  {
    id: 'funnels',
    eyebrow: 'Sites, Funnels & Booking',
    lead: 'Somewhere to land,',
    emph: 'and a diary to fill.',
    body: 'Build landing pages, multi-step funnels and full websites from blocks, then publish '
      + 'them. Booking pages with your real availability, so an interested reply turns into a '
      + 'meeting without a round of emails about Tuesday.',
    art: IsoFunnel,
    points: [
      'Every generated page stays editable',
      'Booking pages work for signed-out visitors',
      'Forms feed straight into contacts',
    ],
  },
  {
    id: 'studio',
    eyebrow: 'Content Studio',
    lead: 'One recording,',
    emph: 'a month of posts.',
    body: 'Turn a long video into short vertical clips with captions and your own branding, '
      + 'draft blog posts, and plan social campaigns across channels — each piece kept in a '
      + 'library where you can edit it before anything is published.',
    art: IsoStudio,
    points: [
      'Clips cut on real timestamps, not guesses',
      'Logo, website and text overlays',
      'Nothing publishes without a person approving it',
    ],
  },
];

const CAPABILITIES: { group: string; items: string[] }[] = [
  { group: 'Reach', items: ['Email sequences', 'One-to-one email', 'SMS with consent and STOP', 'Deliverability & warm-up', 'Prospect search'] },
  { group: 'Convert', items: ['Funnels', 'Websites', 'Landing pages', 'Booking pages', 'Forms & surveys'] },
  { group: 'Manage', items: ['Contacts', 'Pipelines', 'Conversations', 'Calendar', 'Tasks & notes'] },
  { group: 'Create', items: ['AI Shorts', 'Blog automation', 'Social creator', 'Content library', 'Brand overlays'] },
  { group: 'Understand', items: ['Campaign performance', 'Open & reply rates', 'Reputation', 'Analytics', 'Decision log'] },
  { group: 'Run it as an agency', items: ['Sub-accounts', 'White-label branding', 'Per-client billing', 'Role-based access', 'Isolated data per account'] },
];

const LIFECYCLE: { n: string; title: string; body: string }[] = [
  { n: '01', title: 'Objective', body: 'One or two sentences in your own words, kept verbatim so what was asked for can always be checked.' },
  { n: '02', title: 'Plan', body: 'Who to reach, what is on offer, how many follow-ups, when to stop. Every field editable; nothing created yet.' },
  { n: '03', title: 'Prospects', body: 'Checked against the plan one signal at a time. What a listing cannot settle is reported as unknown, not scored as a pass.' },
  { n: '04', title: 'Build', body: 'Real contacts, a real sequence, real enrolments — made through the same calls you would make by hand.' },
  { n: '05', title: 'Send', body: 'Inside the limits you set. A daily cap holds messages back rather than dropping them, and a reply ends the cadence.' },
  { n: '06', title: 'Measure', body: 'Sent, opened, replied, bounced, booked — read live from whichever module owns each figure.' },
  { n: '07', title: 'Rewrite', body: 'When the figures say the funnel is failing it rewrites the half that failed, and you edit that before it lands.' },
];

const LIMITS: { title: string; body: string }[] = [
  {
    title: 'Follow-ups need the app open',
    body: 'The schedule is checked every minute while a browser tab is open. Nothing goes out with every tab closed — a sequence resumes when you next open it.',
  },
  {
    title: 'You bring your own mailbox',
    body: 'Email goes through your SMTP account and replies come back over IMAP. Your sending reputation stays yours, and so does the setup.',
  },
  {
    title: 'It says so when it cannot tell',
    body: 'A directory listing cannot say whether a business can afford you. Where the answer is unknown it says unknown, and a rate over four sends is not shown as a rate.',
  },
];

/** One mark per capability group, so the grid reads at a glance. */
const GROUP_ICON: Record<string, typeof Check> = {
  Reach: Send,
  Convert: MousePointerClick,
  Manage: Users,
  Create: Sparkles,
  Understand: BarChart3,
  'Run it as an agency': Building2,
};

/* ── Shared pieces of a panel ─────────────────────────────────────────── */

const headingStyle: React.CSSProperties = {
  margin: 0, maxWidth: 620,
  fontSize: 'clamp(22px, 3vw, 36px)', fontWeight: 600,
  letterSpacing: '-0.03em', lineHeight: 1.16,
};

/**
 * A heading in two tones — the run-up muted, the point in full colour.
 *
 * Not decoration: the eye lands on the half that carries the claim, which is
 * the trick the reference uses on every section it has.
 */
function Heading({ lead, emph, as = 'h2' }: { lead: string; emph: string; as?: 'h1' | 'h2' }) {
  const Tag = as;
  return (
    <Tag style={{ ...headingStyle, fontSize: as === 'h1' ? 'clamp(30px, 4.4vw, 54px)' : headingStyle.fontSize }}>
      <span className="lead">{lead} </span>
      <span className="emph">{emph}</span>
    </Tag>
  );
}

function PanelHead({ eyebrow, lead, emph, note }: { eyebrow: string; lead: string; emph: string; note?: string }) {
  return (
    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 'clamp(12px, 3vw, 40px)', alignItems: 'flex-end', justifyContent: 'space-between' }}>
      <div style={{ minWidth: 0, flex: '1 1 320px' }}>
        <p className="mono" style={{ margin: '0 0 12px' }}>{eyebrow}</p>
        <Heading lead={lead} emph={emph} />
      </div>
      {note && (
        <p style={{ margin: 0, maxWidth: 300, fontSize: 12.5, lineHeight: 1.7, color: 'var(--text-mute)' }}>{note}</p>
      )}
    </div>
  );
}

/* ── The panels ───────────────────────────────────────────────────────── */

const productPanel = (p: ProductCopy): Panel => ({
  id: p.id,
  chapter: 'Products',
  eyebrow: p.eyebrow,
  render: () => {
    const Art = p.art;
    return (
      <div style={{
        flex: 1, minHeight: 0, display: 'grid', gap: 'clamp(16px, 2.6vw, 40px)',
        gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 300px), 1fr))',
        alignItems: 'center',
      }}>
        <div style={{ minWidth: 0, display: 'flex', flexDirection: 'column', gap: 15 }}>
          <div>
            <p className="mono" style={{ margin: '0 0 12px' }}>{p.eyebrow}</p>
            <Heading lead={p.lead} emph={p.emph} />
          </div>
          <p style={{ margin: 0, maxWidth: 480, fontSize: 13.5, lineHeight: 1.75, color: 'var(--text-mute)' }}>
            {p.body}
          </p>
          <ul style={{ margin: 0, padding: 0, listStyle: 'none', display: 'flex', flexDirection: 'column', gap: 9 }}>
            {p.points.map(pt => (
              <li key={pt} style={{ display: 'flex', gap: 10, fontSize: 12.5, color: 'var(--text-mute)', lineHeight: 1.55, alignItems: 'flex-start' }}>
                <span className="glyph soft" style={{ width: 19, height: 19, borderRadius: 6, marginTop: 1 }}>
                  <Check size={11} strokeWidth={3} />
                </span>
                {pt}
              </li>
            ))}
          </ul>
        </div>
        <div className="stage" style={{ minWidth: 0 }}><Art /></div>
      </div>
    );
  },
});

const PANELS: Panel[] = [
  {
    id: 'hero',
    chapter: 'Intro',
    eyebrow: 'One system of record',
    tone: 'dark',
    render: ({ onSignIn }) => (
      <>
        <div className="beam" />
        <div style={{
          position: 'relative', flex: 1, minHeight: 0, display: 'grid',
          gap: 'clamp(16px, 2.6vw, 40px)',
          gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 300px), 1fr))',
          alignItems: 'center',
        }}>
          <div style={{ minWidth: 0 }}>
            <span className="chip">For agencies &amp; growing teams</span>
            <div style={{ marginTop: 18 }}>
              <Heading as="h1" lead="Everything it takes to" emph="win the next customer." />
            </div>
            <p style={{ margin: '18px 0 0', maxWidth: 460, fontSize: 'clamp(13px, 1.2vw, 15px)', lineHeight: 1.7, color: 'var(--on-dark-mute)' }}>
              Find the people worth contacting, write to them, book the meeting and see what
              actually worked — in one place, on your own mailbox, with every step visible and
              editable before it happens.
            </p>
            <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 6, marginTop: 26 }}>
              <button className="btn btn-primary" onClick={onSignIn}>
                Get started <ArrowRight size={13} />
              </button>
              <button className="btn btn-quiet" onClick={onSignIn}>
                Sign in <ChevronRight size={13} />
              </button>
            </div>
          </div>
          <div className="stage" style={{ minWidth: 0 }}><IsoHero /></div>
        </div>
      </>
    ),
  },

  ...PRODUCTS.map(productPanel),

  {
    id: 'lifecycle',
    chapter: 'How it runs',
    eyebrow: 'How a campaign runs',
    render: () => (
      <div style={{ flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column', gap: 'clamp(16px, 2.4vw, 30px)' }}>
        <PanelHead
          eyebrow="How a campaign runs"
          lead="Seven steps, and"
          emph="you can stop it at any of them."
          note="The agent decides what should happen. The modules you already use do it, and keep owning whether it worked."
        />
        <ol className="mesh" style={{
          margin: 0, padding: 0, listStyle: 'none',
          gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 210px), 1fr))',
        }}>
          {LIFECYCLE.map(s => (
            <li key={s.n} className="row-link">
              <span className="mono" style={{ color: 'var(--lime-deep)' }}>{s.n}</span>
              <h3 style={{ margin: '9px 0 6px', fontSize: 14, fontWeight: 600, color: 'var(--text)' }}>{s.title}</h3>
              <p style={{ margin: 0, fontSize: 11.5, lineHeight: 1.65, color: 'var(--text-mute)' }}>{s.body}</p>
            </li>
          ))}
        </ol>
      </div>
    ),
  },

  {
    id: 'included',
    chapter: 'Included',
    eyebrow: 'Everything included',
    render: () => (
      <div style={{ flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column', gap: 'clamp(16px, 2.4vw, 32px)' }}>
        <PanelHead
          eyebrow="Everything included"
          lead="No add-ons, no per-feature tiers,"
          emph="no second tool to keep in sync."
        />
        <div style={{
          display: 'grid', gap: 'clamp(10px, 1.4vw, 16px)',
          gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 230px), 1fr))',
        }}>
          {CAPABILITIES.map(c => {
            const Glyph = GROUP_ICON[c.group] ?? Check;
            return (
              <div key={c.group} className="tile">
                <span style={{ display: 'flex', alignItems: 'center', gap: 9 }}>
                  <span className="glyph soft"><Glyph size={14} strokeWidth={2.2} /></span>
                  <span style={{ fontSize: 13.5, fontWeight: 600, color: 'var(--text)' }}>{c.group}</span>
                </span>
                <ul style={{ margin: '11px 0 0', padding: 0, listStyle: 'none', display: 'flex', flexDirection: 'column', gap: 5 }}>
                  {c.items.map(i => (
                    <li key={i} style={{ fontSize: 12, color: 'var(--text-mute)', lineHeight: 1.5 }}>{i}</li>
                  ))}
                </ul>
              </div>
            );
          })}
        </div>
      </div>
    ),
  },

  {
    id: 'answers',
    chapter: 'Straight answers',
    eyebrow: 'Straight answers',
    render: () => (
      <div style={{ flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column', gap: 'clamp(16px, 2.4vw, 32px)' }}>
        <PanelHead
          eyebrow="Straight answers"
          lead="The three things everybody"
          emph="finds out in week one."
          note="Better here than in an email to support."
        />
        <div style={{
          display: 'grid', gap: 'clamp(12px, 1.8vw, 22px)',
          gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 240px), 1fr))',
        }}>
          {LIMITS.map(l => (
            <div key={l.title} className="tile" style={{ padding: 'clamp(16px, 2.2vw, 24px)' }}>
              <span className="glyph soft" style={{ marginBottom: 11 }}><Info size={14} strokeWidth={2.2} /></span>
              <h3 style={{ margin: '0 0 8px', fontSize: 14.5, fontWeight: 600, color: 'var(--text)' }}>{l.title}</h3>
              <p style={{ margin: 0, fontSize: 12, lineHeight: 1.7, color: 'var(--text-mute)' }}>{l.body}</p>
            </div>
          ))}
        </div>
      </div>
    ),
  },

  {
    id: 'start',
    chapter: 'Start',
    eyebrow: 'Start',
    tone: 'dark',
    render: ({ onSignIn, name }) => (
      <>
        <div className="stripes" />
        <div style={{
          position: 'relative', flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column',
          alignItems: 'center', justifyContent: 'center', textAlign: 'center',
        }}>
          <span className="chip">Free to try</span>
          <div style={{ marginTop: 18 }}>
            <Heading lead="Point it at your list and" emph="watch it show its working." />
          </div>
          <p style={{ margin: '16px 0 0', maxWidth: 430, fontSize: 13.5, lineHeight: 1.7, color: 'var(--on-dark-mute)' }}>
            Connect your own mailbox, write one sentence about what you want, and approve the plan
            before anything is created.
          </p>
          <div style={{ display: 'flex', flexWrap: 'wrap', justifyContent: 'center', alignItems: 'center', gap: 6, marginTop: 26 }}>
            <button className="btn btn-primary" onClick={onSignIn}>
              Get started <ArrowRight size={13} />
            </button>
            {/* Routed, not an href: the app is served under a base path in
                development and a raw link would leave it. */}
            <button className="btn btn-quiet" onClick={onSignIn}>Sign in <ArrowUpRight size={12} /></button>
          </div>
          <p className="mono" style={{ margin: '34px 0 0' }}>© {new Date().getFullYear()} {name}</p>
        </div>
      </>
    ),
  },
];

/* ── The deck ─────────────────────────────────────────────────────────── */

export default function SiteHome() {
  const navigate = useNavigate();
  const name = activeBranding().appName;
  const onSignIn = useCallback(() => navigate('/login'), [navigate]);

  const deck = useDeck(PANELS.length);
  /* Pulled out of the object: a callback ref read off a member expression in
     the ref position trips the hooks lint, and a plain identifier is clearer. */
  const { index, attach } = deck;

  const viewport = useRef<HTMLDivElement | null>(null);
  const cards = useRef<(HTMLElement | null)[]>([]);
  const [offset, setOffset] = useState(0);

  /* Measured rather than computed: the card width is a clamp(), so the only
     honest way to centre one is to ask the browser where it landed. */
  const centre = useCallback(() => {
    const box = viewport.current;
    const card = cards.current[index];
    if (!box || !card) return;
    setOffset((box.clientWidth - card.offsetWidth) / 2 - card.offsetLeft);
  }, [index]);

  useLayoutEffect(centre, [centre]);

  useEffect(() => {
    window.addEventListener('resize', centre);
    return () => window.removeEventListener('resize', centre);
  }, [centre]);

  /*
   * The document behind this must not scroll while the deck is on screen, or a
   * phone drags the whole page around underneath the panels. Restored on the
   * way out so signing in does not leave the app unable to scroll.
   */
  useEffect(() => {
    const html = document.documentElement;
    const body = document.body;
    const prev = { html: html.style.overflow, body: body.style.overflow, overscroll: body.style.overscrollBehavior };
    html.style.overflow = 'hidden';
    body.style.overflow = 'hidden';
    body.style.overscrollBehavior = 'none';
    return () => {
      html.style.overflow = prev.html;
      body.style.overflow = prev.body;
      body.style.overscrollBehavior = prev.overscroll;
    };
  }, []);

  const chapter = PANELS[index].chapter;
  /* Where this panel sits within its own chapter, e.g. 2 / 5 through Products. */
  const withinChapter = useMemo(() => {
    const all = PANELS.filter(p => p.chapter === chapter);
    return { n: all.findIndex(p => p.id === PANELS[index].id) + 1, of: all.length };
  }, [chapter, index]);

  return (
    <div className="site deck-root" ref={attach}>
      <div className="rules" />

      <header className="deck-chrome deck-top">
        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 9 }}>
          {/* A lime mark rather than a bare icon: white-on-white was invisible
              the moment the page stopped being dark. */}
          <span className="glyph" style={{ width: 24, height: 24, borderRadius: 7 }}>
            <Layers size={13} strokeWidth={2.4} />
          </span>
          <span className="mono" style={{ color: 'var(--text)', fontSize: 11.5, letterSpacing: '0.2em', fontWeight: 600 }}>
            {name}
          </span>
        </span>
        <span className="strapline" style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
          <span className="mono" style={{ color: '#b8bbc1' }}>Growth, evolved</span>
          <span className="mono">Sales · Marketing · Sites · Content</span>
        </span>
        <span style={{ flex: 1 }} />
        <button className="btn" onClick={onSignIn}>Sign in <ArrowRight size={13} /></button>
      </header>

      <div className="deck-viewport" ref={viewport}>
        <div className="deck-track" style={{ transform: `translate3d(${offset}px,0,0)` }}>
          {PANELS.map((p, i) => {
            const on = i === index;
            return (
              <section
                key={p.id}
                ref={el => { cards.current[i] = el; }}
                className={p.tone === 'dark' ? 'card dark' : 'card'}
                data-active={on}
                aria-hidden={!on}
                inert={!on}
              >
                {p.render({ onSignIn, name })}
              </section>
            );
          })}
        </div>
      </div>

      <footer className="deck-chrome deck-bottom">
        <span className="deck-chapter" style={{ display: 'flex', alignItems: 'baseline', gap: 12, minWidth: 0 }}>
          <span className="mono" style={{ color: '#b8bbc1' }}>{chapter}</span>
          {withinChapter.of > 1 && (
            <span className="mono deck-count">{withinChapter.n} / {withinChapter.of}</span>
          )}
        </span>

        <div className="deck-rail" role="tablist" aria-label="Sections">
          {PANELS.map((p, i) => (
            <button
              key={p.id}
              role="tab"
              aria-selected={i === index}
              aria-label={p.eyebrow}
              title={p.eyebrow}
              className="tick"
              onClick={() => deck.to(i)}
            />
          ))}
        </div>

        <span style={{ display: 'flex', gap: 6 }}>
          <button className="btn nav" aria-label="Previous section"
            onClick={() => deck.go(-1)} disabled={index === 0}>
            <ChevronLeft size={15} />
          </button>
          <button className="btn nav" aria-label="Next section"
            onClick={() => deck.go(1)} disabled={index === PANELS.length - 1}>
            <ChevronRight size={15} />
          </button>
        </span>
      </footer>
    </div>
  );
}
