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
import { ArrowRight, ArrowUpRight, Check, ChevronLeft, ChevronRight, Layers } from 'lucide-react';
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
  render: (ctx: { onSignIn: () => void; name: string }) => React.ReactNode;
}

interface ProductCopy {
  id: string;
  eyebrow: string;
  title: string;
  body: string;
  art: () => React.ReactElement;
  points: string[];
}

const PRODUCTS: ProductCopy[] = [
  {
    id: 'agent',
    eyebrow: 'AI Sales Agent',
    title: 'Describe the outcome. It builds the campaign.',
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
    title: 'The record of everyone you have ever spoken to.',
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
    title: 'Cadences that stop the moment somebody answers.',
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
    title: 'Somewhere for the traffic to land, and a diary to fill.',
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
    title: 'One recording, a month of posts.',
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

/* ── Shared pieces of a panel ─────────────────────────────────────────── */

function PanelHead({ eyebrow, title, note }: { eyebrow: string; title: string; note?: string }) {
  return (
    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 'clamp(12px, 3vw, 40px)', alignItems: 'flex-end', justifyContent: 'space-between' }}>
      <div style={{ minWidth: 0, flex: '1 1 320px' }}>
        <p className="mono" style={{ margin: 0 }}>{eyebrow}</p>
        <h2 style={{
          margin: '12px 0 0', maxWidth: 620,
          fontSize: 'clamp(21px, 2.9vw, 34px)', fontWeight: 500,
          letterSpacing: '-0.025em', lineHeight: 1.18, color: 'var(--text)',
        }}>
          {title}
        </h2>
      </div>
      {note && (
        <p style={{ margin: 0, maxWidth: 300, fontSize: 12.5, lineHeight: 1.7, color: 'var(--text-body)' }}>{note}</p>
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
        <div style={{ minWidth: 0, display: 'flex', flexDirection: 'column', gap: 14 }}>
          <div>
            <p className="mono" style={{ margin: 0 }}>{p.eyebrow}</p>
            <h2 style={{
              margin: '12px 0 0',
              fontSize: 'clamp(21px, 2.9vw, 34px)', fontWeight: 500,
              letterSpacing: '-0.025em', lineHeight: 1.18, color: 'var(--text)',
            }}>
              {p.title}
            </h2>
          </div>
          <p style={{ margin: 0, maxWidth: 480, fontSize: 13.5, lineHeight: 1.75, color: 'var(--text-body)' }}>
            {p.body}
          </p>
          <ul style={{ margin: 0, padding: 0, listStyle: 'none', display: 'flex', flexDirection: 'column', gap: 8 }}>
            {p.points.map(pt => (
              <li key={pt} style={{ display: 'flex', gap: 9, fontSize: 12.5, color: '#a4a8af', lineHeight: 1.55 }}>
                <Check size={13} color="var(--blue-lit)" style={{ flexShrink: 0, marginTop: 3 }} />
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
    render: ({ onSignIn }) => (
      <div style={{
        flex: 1, minHeight: 0, display: 'grid', gap: 'clamp(16px, 2.6vw, 40px)',
        gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 300px), 1fr))',
        alignItems: 'center',
      }}>
        <div style={{ minWidth: 0 }}>
          <p className="mono" style={{ margin: 0 }}>One system of record</p>
          <h1 style={{
            margin: '16px 0 0', maxWidth: 560,
            fontSize: 'clamp(30px, 4.6vw, 56px)', lineHeight: 1.06,
            letterSpacing: '-0.035em', fontWeight: 500, color: 'var(--text)',
          }}>
            Everything it takes to win the next customer.
          </h1>
          <p style={{ margin: '18px 0 0', maxWidth: 470, fontSize: 'clamp(13px, 1.2vw, 15px)', lineHeight: 1.7, color: 'var(--text-body)' }}>
            Find the people worth contacting, write to them, book the meeting and see what actually
            worked — in one place, on your own mailbox, with every step visible and editable before
            it happens.
          </p>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10, marginTop: 26 }}>
            <button className="btn btn-primary" onClick={onSignIn}>
              Open the app <ArrowRight size={13} />
            </button>
            <span className="mono hint" style={{ alignSelf: 'center' }}>Scroll to explore</span>
          </div>
        </div>
        <div className="stage" style={{ minWidth: 0 }}><IsoHero /></div>
      </div>
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
          title="Seven steps, and you can stop it at any of them."
          note="The agent decides what should happen. The modules you already use do it, and keep owning whether it worked."
        />
        <ol style={{
          margin: 0, padding: 0, listStyle: 'none', display: 'grid', gap: 1,
          gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 210px), 1fr))',
        }}>
          {LIFECYCLE.map(s => (
            <li key={s.n} className="row-link"
              style={{
                backgroundColor: 'var(--panel)',
                boxShadow: '0 0 0 1px var(--line-soft)',
                padding: 'clamp(13px, 1.5vw, 20px)',
              }}>
              <span className="mono" style={{ color: 'var(--blue-lit)' }}>{s.n}</span>
              <h3 style={{ margin: '9px 0 6px', fontSize: 14, fontWeight: 500, color: 'var(--text)' }}>{s.title}</h3>
              <p style={{ margin: 0, fontSize: 11.5, lineHeight: 1.65, color: 'var(--text-body)' }}>{s.body}</p>
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
          title="No add-ons, no per-feature tiers, no second tool to keep in sync."
        />
        <div style={{
          display: 'grid', gap: 'clamp(16px, 2.4vw, 34px)',
          gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 250px), 1fr))',
        }}>
          {CAPABILITIES.map(c => (
            <div key={c.group}>
              <p className="mono" style={{ margin: '0 0 11px', paddingBottom: 9, borderBottom: '1px solid var(--line-soft)' }}>
                {c.group}
              </p>
              <ul style={{ margin: 0, padding: 0, listStyle: 'none', display: 'flex', flexDirection: 'column', gap: 7 }}>
                {c.items.map(i => (
                  <li key={i} style={{ fontSize: 12.5, color: '#a4a8af', lineHeight: 1.5 }}>{i}</li>
                ))}
              </ul>
            </div>
          ))}
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
          title="The three things everybody finds out in week one."
          note="Better here than in an email to support."
        />
        <div style={{
          display: 'grid', gap: 'clamp(12px, 1.8vw, 22px)',
          gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 240px), 1fr))',
        }}>
          {LIMITS.map(l => (
            <div key={l.title} style={{
              border: '1px solid var(--line-soft)', borderRadius: 2,
              padding: 'clamp(16px, 2.2vw, 26px)', backgroundColor: 'var(--panel-dim)',
            }}>
              <h3 style={{ margin: '0 0 9px', fontSize: 14.5, fontWeight: 500, color: 'var(--text)' }}>{l.title}</h3>
              <p style={{ margin: 0, fontSize: 12, lineHeight: 1.7, color: 'var(--text-body)' }}>{l.body}</p>
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
    render: ({ onSignIn, name }) => (
      <div style={{
        flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column',
        alignItems: 'center', justifyContent: 'center', textAlign: 'center', gap: 4,
      }}>
        <p className="mono" style={{ margin: 0 }}>Start</p>
        <h2 style={{
          margin: '16px 0 0', maxWidth: 640,
          fontSize: 'clamp(25px, 3.8vw, 46px)', fontWeight: 500,
          letterSpacing: '-0.03em', lineHeight: 1.1, color: 'var(--text)',
        }}>
          Point it at your list and watch it show its working.
        </h2>
        <p style={{ margin: '16px 0 0', maxWidth: 430, fontSize: 13.5, lineHeight: 1.7, color: 'var(--text-body)' }}>
          Connect your own mailbox, write one sentence about what you want, and approve the plan
          before anything is created.
        </p>
        <div style={{ display: 'flex', flexWrap: 'wrap', justifyContent: 'center', gap: 10, marginTop: 26 }}>
          <button className="btn btn-primary" onClick={onSignIn}>
            Open the app <ArrowRight size={13} />
          </button>
          {/* Routed, not an href: the app is served under a base path in
              development and a raw link would leave it. */}
          <button className="btn" onClick={onSignIn}>Sign in <ArrowUpRight size={12} /></button>
        </div>
        <p className="mono" style={{ margin: '34px 0 0' }}>© {new Date().getFullYear()} {name}</p>
      </div>
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
        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}>
          <Layers size={15} color="#f4f4f5" />
          <span className="mono" style={{ color: 'var(--text)', fontSize: 11.5, letterSpacing: '0.2em' }}>{name}</span>
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
                className="card"
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
