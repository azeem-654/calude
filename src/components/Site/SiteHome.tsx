/**
 * The public site.
 *
 * Until now protectedcentral.com opened on a login box, which tells a visitor
 * who has never heard of the product exactly nothing. This is the page that
 * answers "what is it" before asking anyone to sign in.
 *
 * Every claim on it is checkable against the software. There are no customer
 * counts, no uptime figures and no testimonials, because there is nothing to
 * base them on yet and a marketing page that opens with an invented number is
 * the worst possible first impression for a product whose entire argument is
 * that it shows you its working.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowRight, ArrowUpRight, Check, ChevronLeft, ChevronRight, Layers } from 'lucide-react';
import { activeBranding } from '../../services/tenancy';
import {
  IsoAgent, IsoFunnel, IsoHero, IsoPipeline, IsoSequence, IsoStudio,
} from './Isometric';
import './site.css';

/* ── What the product actually contains ───────────────────────────────── */

interface Product {
  id: string;
  eyebrow: string;
  title: string;
  body: string;
  art: () => React.ReactElement;
  points: string[];
}

const PRODUCTS: Product[] = [
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

/* Grouped the way somebody evaluating the product would ask about it. */
const CAPABILITIES: { group: string; items: string[] }[] = [
  { group: 'Reach', items: ['Email sequences', 'One-to-one email', 'SMS with consent and STOP handling', 'Deliverability & warm-up', 'Prospect search'] },
  { group: 'Convert', items: ['Funnels', 'Websites', 'Landing pages', 'Booking pages', 'Forms & surveys'] },
  { group: 'Manage', items: ['Contacts', 'Pipelines', 'Conversations', 'Calendar', 'Tasks & notes'] },
  { group: 'Create', items: ['AI Shorts', 'Blog automation', 'Social creator', 'Content library', 'Brand overlays'] },
  { group: 'Understand', items: ['Campaign performance', 'Open & reply rates', 'Reputation', 'Analytics', 'Decision log'] },
  { group: 'Run it as an agency', items: ['Sub-accounts', 'White-label branding', 'Per-client billing', 'Role-based access', 'Isolated data per account'] },
];

/* The loop the agent actually runs, in the order it runs it. */
const LIFECYCLE: { n: string; title: string; body: string }[] = [
  { n: '01', title: 'Objective', body: 'You write one or two sentences in your own words. It is kept verbatim, so what was asked for can always be checked.' },
  { n: '02', title: 'Plan', body: 'Who to reach, what is on offer, which channels, how many follow-ups and when to stop chasing. Every field editable; nothing created yet.' },
  { n: '03', title: 'Prospects', body: 'Searched from a real source and checked against the plan one signal at a time. Anything a listing cannot settle is reported as unknown, not scored as a pass.' },
  { n: '04', title: 'Build', body: 'Real contacts, a real sequence, real enrolments — created through the same calls you would make by hand, and linked back to the campaign.' },
  { n: '05', title: 'Send', body: 'Inside the limits you set. A daily cap holds messages back rather than dropping them, and a reply ends the cadence.' },
  { n: '06', title: 'Measure', body: 'Sent, opened, replied, bounced, booked — read live from the module that owns each figure. Percentages appear only once the sample can carry them.' },
  { n: '07', title: 'Rewrite', body: 'When the figures say the funnel is failing, it works out which half failed and rewrites that half. You edit the proposal before it goes anywhere near the live sequence.' },
];

/* Said plainly, because a customer finds all three out in week one anyway. */
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
    title: 'It will tell you when it cannot tell',
    body: 'A directory listing cannot say whether a business can afford you. Where the answer is unknown it says unknown, and a rate over four sends is not shown as a rate.',
  },
];

/* ── Small helpers ────────────────────────────────────────────────────── */

/** Reveal on first scroll into view. */
function useReveal<T extends HTMLElement>() {
  const ref = useRef<T | null>(null);
  /* A browser with no observer gets the content, not a permanently invisible
     page. Decided at first render rather than corrected inside the effect. */
  const [shown, setShown] = useState(() => typeof IntersectionObserver === 'undefined');

  useEffect(() => {
    if (shown) return;
    const node = ref.current;
    if (!node) return;
    const io = new IntersectionObserver(entries => {
      for (const e of entries) if (e.isIntersecting) { setShown(true); io.disconnect(); }
    }, { rootMargin: '0px 0px -12% 0px' });
    io.observe(node);
    return () => io.disconnect();
  }, [shown]);

  return { ref, shown };
}

function Section({ label, children, id }: { label?: string; id?: string; children: React.ReactNode }) {
  const { ref, shown } = useReveal<HTMLElement>();
  return (
    <section id={id} ref={ref} data-shown={shown} className="reveal"
      style={{
        position: 'relative',
        padding: 'clamp(56px, 9vw, 130px) clamp(18px, 5vw, 72px)',
        borderTop: '1px solid var(--line-soft)',
      }}>
      {label && (
        <p className="mono" style={{ margin: '0 0 clamp(24px, 4vw, 46px)' }}>{label}</p>
      )}
      {children}
    </section>
  );
}

/* ── The page ─────────────────────────────────────────────────────────── */

export default function SiteHome() {
  const navigate = useNavigate();
  const name = activeBranding().appName;

  return (
    <div className="site">
      <Header name={name} onSignIn={() => navigate('/login')} />
      <Hero onSignIn={() => navigate('/login')} />
      <Products />
      <Lifecycle />
      <Capabilities />
      <Straight />
      <Close onSignIn={() => navigate('/login')} />
      <Footer name={name} />
    </div>
  );
}

/* ── Header ───────────────────────────────────────────────────────────── */

function Header({ name, onSignIn }: { name: string; onSignIn: () => void }) {
  const [solid, setSolid] = useState(false);
  useEffect(() => {
    const onScroll = () => setSolid(window.scrollY > 24);
    onScroll();
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  return (
    <header style={{
      position: 'sticky', top: 0, zIndex: 20,
      display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between',
      gap: 16, flexWrap: 'wrap',
      padding: 'clamp(14px, 2.4vw, 26px) clamp(18px, 5vw, 72px)',
      backgroundColor: solid ? 'rgba(13,13,13,0.86)' : 'transparent',
      backdropFilter: solid ? 'blur(10px)' : 'none',
      WebkitBackdropFilter: solid ? 'blur(10px)' : 'none',
      borderBottom: `1px solid ${solid ? 'var(--line-soft)' : 'transparent'}`,
      transition: 'background-color 240ms ease, border-color 240ms ease',
    }}>
      <div style={{ display: 'flex', alignItems: 'flex-start', gap: 'clamp(20px, 5vw, 64px)', flexWrap: 'wrap' }}>
        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}>
          <Layers size={15} color="#f4f4f5" />
          <span className="mono" style={{ color: 'var(--text)', fontSize: 11.5, letterSpacing: '0.2em' }}>
            {name}
          </span>
        </span>
        <span className="strapline" style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
          <span className="mono" style={{ color: '#b8bbc1' }}>Growth, evolved</span>
          <span className="mono">Sales · Marketing · Sites · Content</span>
        </span>
      </div>
      <button className="btn" onClick={onSignIn}>Sign in <ArrowRight size={13} /></button>
    </header>
  );
}

/* ── Hero ─────────────────────────────────────────────────────────────── */

function Hero({ onSignIn }: { onSignIn: () => void }) {
  return (
    <div style={{ position: 'relative', overflow: 'hidden' }}>
      <div className="rules" />
      <div style={{
        position: 'relative',
        display: 'grid',
        gap: 'clamp(28px, 5vw, 64px)',
        gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 340px), 1fr))',
        alignItems: 'center',
        padding: 'clamp(48px, 9vw, 116px) clamp(18px, 5vw, 72px) clamp(56px, 9vw, 120px)',
        maxWidth: 1440, margin: '0 auto',
      }}>
        <div style={{ minWidth: 0 }}>
          <p className="mono" style={{ margin: 0 }}>One system of record</p>
          <h1 style={{
            margin: '18px 0 0',
            maxWidth: 620,
            fontSize: 'clamp(32px, 5.2vw, 62px)',
            lineHeight: 1.06,
            letterSpacing: '-0.035em',
            fontWeight: 500,
            color: 'var(--text)',
          }}>
            Everything it takes to win the next customer.
          </h1>
          <p style={{
            margin: '22px 0 0',
            maxWidth: 520,
            fontSize: 'clamp(14px, 1.4vw, 16.5px)',
            lineHeight: 1.7,
            color: 'var(--text-body)',
          }}>
            Find the people worth contacting, write to them, book the meeting and see what actually
            worked — in one place, on your own mailbox, with every step visible and editable before
            it happens.
          </p>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10, marginTop: 30 }}>
            <button className="btn btn-primary" onClick={onSignIn}>
              Open the app <ArrowRight size={13} />
            </button>
            <a className="btn" href="#products">See what is inside</a>
          </div>
        </div>

        <div style={{ minWidth: 0, display: 'grid', placeItems: 'center' }}>
          <IsoHero />
        </div>
      </div>
    </div>
  );
}

/* ── The product carousel ─────────────────────────────────────────────── */

function Products() {
  const [active, setActive] = useState(0);
  const [offset, setOffset] = useState(0);
  const [paused, setPaused] = useState(false);
  const viewport = useRef<HTMLDivElement | null>(null);
  const panels = useRef<(HTMLElement | null)[]>([]);
  const { ref, shown } = useReveal<HTMLElement>();

  const reduced = useMemo(
    () => typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches,
    [],
  );

  /* Measured rather than computed: the panel width is a clamp(), so the only
     honest way to centre one is to ask the browser where it ended up. */
  const centre = useCallback((index: number) => {
    const box = viewport.current;
    const panel = panels.current[index];
    if (!box || !panel) return;
    setOffset((box.clientWidth - panel.offsetWidth) / 2 - panel.offsetLeft);
  }, []);

  useEffect(() => { centre(active); }, [active, centre]);

  useEffect(() => {
    const onResize = () => centre(active);
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, [active, centre]);

  /* Advances on its own, but never while somebody is reading or tabbing
     through it, and not at all for anyone who asked for less motion. */
  useEffect(() => {
    if (paused || reduced || !shown) return;
    const id = window.setInterval(() => setActive(i => (i + 1) % PRODUCTS.length), 7000);
    return () => window.clearInterval(id);
  }, [paused, reduced, shown]);

  const go = (delta: number) =>
    setActive(i => (i + delta + PRODUCTS.length) % PRODUCTS.length);

  /* Swipe. Without it the only way through this on a phone is the arrows, and
     nobody reaches for an arrow on a carousel they can see. */
  const drag = useRef<{ x: number; id: number } | null>(null);
  const onPointerDown = (e: React.PointerEvent) => {
    if (e.pointerType === 'mouse') return;
    drag.current = { x: e.clientX, id: e.pointerId };
  };
  const onPointerUp = (e: React.PointerEvent) => {
    const start = drag.current;
    drag.current = null;
    if (!start || start.id !== e.pointerId) return;
    const moved = e.clientX - start.x;
    if (Math.abs(moved) > 44) go(moved < 0 ? 1 : -1);
  };

  return (
    <section id="products" ref={ref} data-shown={shown} className="reveal"
      onMouseEnter={() => setPaused(true)}
      onMouseLeave={() => setPaused(false)}
      onFocusCapture={() => setPaused(true)}
      onBlurCapture={() => setPaused(false)}
      style={{ position: 'relative', paddingBottom: 'clamp(48px, 7vw, 96px)', borderTop: '1px solid var(--line-soft)' }}>

      <div style={{
        display: 'flex', flexWrap: 'wrap', gap: 16, alignItems: 'flex-end', justifyContent: 'space-between',
        padding: 'clamp(40px, 6vw, 84px) clamp(18px, 5vw, 72px) clamp(22px, 3vw, 40px)',
      }}>
        <div>
          <p className="mono" style={{ margin: 0 }}>Products</p>
          <h2 style={{
            margin: '14px 0 0', fontSize: 'clamp(23px, 3.2vw, 38px)', fontWeight: 500,
            letterSpacing: '-0.025em', color: 'var(--text)',
          }}>
            Five modules. One record of the truth.
          </h2>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <button className="btn" aria-label="Previous product" onClick={() => go(-1)}
            style={{ padding: '9px 12px' }}>
            <ChevronLeft size={15} />
          </button>
          <button className="btn" aria-label="Next product" onClick={() => go(1)}
            style={{ padding: '9px 12px' }}>
            <ChevronRight size={15} />
          </button>
        </div>
      </div>

      <div ref={viewport} style={{ overflow: 'hidden', paddingBottom: 4, touchAction: 'pan-y' }}
        onPointerDown={onPointerDown}
        onPointerUp={onPointerUp}
        onPointerCancel={() => { drag.current = null; }}
        onKeyDown={e => {
          if (e.key === 'ArrowRight') { e.preventDefault(); go(1); }
          if (e.key === 'ArrowLeft') { e.preventDefault(); go(-1); }
        }}>
        <div className="track" style={{ transform: `translateX(${offset}px)` }}>
          {PRODUCTS.map((p, i) => {
            const on = i === active;
            const Art = p.art;
            return (
              <article
                key={p.id}
                ref={el => { panels.current[i] = el; }}
                className="panel"
                data-active={on}
                aria-hidden={!on}
                style={{ pointerEvents: on ? 'auto' : 'none' }}
              >
                <div>
                  <p className="mono" style={{ margin: 0 }}>{p.eyebrow}</p>
                  <h3 style={{
                    margin: '12px 0 0', fontSize: 'clamp(19px, 2.3vw, 29px)', fontWeight: 500,
                    letterSpacing: '-0.02em', lineHeight: 1.2, color: 'var(--text)',
                  }}>
                    {p.title}
                  </h3>
                  <p style={{
                    margin: '12px 0 0', maxWidth: 480, fontSize: 13.5, lineHeight: 1.75,
                    color: 'var(--text-body)',
                  }}>
                    {p.body}
                  </p>
                </div>

                <div className="stage"><Art /></div>

                <ul style={{ margin: 0, padding: 0, listStyle: 'none', display: 'flex', flexDirection: 'column', gap: 7 }}>
                  {p.points.map(pt => (
                    <li key={pt} style={{ display: 'flex', gap: 9, fontSize: 12.5, color: '#a4a8af', lineHeight: 1.55 }}>
                      <Check size={13} color="var(--blue-lit)" style={{ flexShrink: 0, marginTop: 3 }} />
                      {pt}
                    </li>
                  ))}
                </ul>
              </article>
            );
          })}
        </div>
      </div>

      {/* The tab row doubles as the position indicator, so there is no separate
          row of dots saying the same thing twice. */}
      <div role="tablist" aria-label="Products"
        style={{
          display: 'grid', gap: 'clamp(10px, 2vw, 28px)',
          gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 150px), 1fr))',
          padding: 'clamp(26px, 4vw, 48px) clamp(18px, 5vw, 72px) 0',
        }}>
        {PRODUCTS.map((p, i) => (
          <button key={p.id} role="tab" className="tab" aria-selected={i === active}
            onClick={() => setActive(i)}>
            <span className="mono" style={{ color: 'inherit', display: 'block' }}>
              {String(i + 1).padStart(2, '0')} — {p.eyebrow}
            </span>
          </button>
        ))}
      </div>
    </section>
  );
}

/* ── How it runs ──────────────────────────────────────────────────────── */

function Lifecycle() {
  return (
    <Section label="How a campaign runs">
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 24, alignItems: 'flex-end', justifyContent: 'space-between', marginBottom: 'clamp(28px, 4vw, 52px)' }}>
        <h2 style={{
          margin: 0, maxWidth: 620, fontSize: 'clamp(23px, 3.2vw, 38px)', fontWeight: 500,
          letterSpacing: '-0.025em', lineHeight: 1.16, color: 'var(--text)',
        }}>
          Seven steps, and you can stop it at any of them.
        </h2>
        <p style={{ margin: 0, maxWidth: 340, fontSize: 13.5, lineHeight: 1.7, color: 'var(--text-body)' }}>
          The agent decides what should happen. The modules you already use do it, and keep owning
          whether it worked.
        </p>
      </div>

      <ol style={{
        margin: 0, padding: 0, listStyle: 'none',
        /* Hairlines drawn on each cell rather than as a 1px grid gap: seven
           items in a four-across grid leave an empty cell, and the gap trick
           paints that leftover as a solid block. */
        display: 'grid', gap: 1,
        gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 250px), 1fr))',
      }}>
        {LIFECYCLE.map(s => (
          <li key={s.n} className="row-link"
            style={{
              backgroundColor: 'var(--ink)',
              boxShadow: '0 0 0 1px var(--line-soft)',
              padding: 'clamp(18px, 2.4vw, 28px)',
            }}>
            <span className="mono" style={{ color: 'var(--blue-lit)' }}>{s.n}</span>
            <h3 style={{ margin: '12px 0 8px', fontSize: 15.5, fontWeight: 500, color: 'var(--text)' }}>{s.title}</h3>
            <p style={{ margin: 0, fontSize: 12.5, lineHeight: 1.7, color: 'var(--text-body)' }}>{s.body}</p>
          </li>
        ))}
      </ol>
    </Section>
  );
}

/* ── Everything included ──────────────────────────────────────────────── */

function Capabilities() {
  return (
    <Section label="Everything included">
      <h2 style={{
        margin: '0 0 clamp(28px, 4vw, 52px)', maxWidth: 700,
        fontSize: 'clamp(23px, 3.2vw, 38px)', fontWeight: 500,
        letterSpacing: '-0.025em', lineHeight: 1.16, color: 'var(--text)',
      }}>
        No add-ons, no per-feature tiers, no second tool to keep in sync.
      </h2>

      {/* Six groups. At 220px they land five across and leave one orphan on a
          row of its own; at 330px they land three across and fill both rows. */}
      <div style={{
        display: 'grid', gap: 'clamp(24px, 3vw, 44px)',
        gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 330px), 1fr))',
      }}>
        {CAPABILITIES.map(c => (
          <div key={c.group}>
            <p className="mono" style={{ margin: '0 0 14px', paddingBottom: 12, borderBottom: '1px solid var(--line-soft)' }}>
              {c.group}
            </p>
            <ul style={{ margin: 0, padding: 0, listStyle: 'none', display: 'flex', flexDirection: 'column', gap: 9 }}>
              {c.items.map(i => (
                <li key={i} style={{ fontSize: 13.5, color: '#a4a8af', lineHeight: 1.5 }}>{i}</li>
              ))}
            </ul>
          </div>
        ))}
      </div>
    </Section>
  );
}

/* ── Straight answers ─────────────────────────────────────────────────── */

function Straight() {
  return (
    <Section label="Straight answers">
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 24, alignItems: 'flex-end', justifyContent: 'space-between', marginBottom: 'clamp(28px, 4vw, 52px)' }}>
        <h2 style={{
          margin: 0, maxWidth: 620, fontSize: 'clamp(23px, 3.2vw, 38px)', fontWeight: 500,
          letterSpacing: '-0.025em', lineHeight: 1.16, color: 'var(--text)',
        }}>
          The three things everybody finds out in week one.
        </h2>
        <p style={{ margin: 0, maxWidth: 340, fontSize: 13.5, lineHeight: 1.7, color: 'var(--text-body)' }}>
          Better here than in an email to support.
        </p>
      </div>

      <div style={{
        display: 'grid', gap: 'clamp(16px, 2vw, 26px)',
        gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 260px), 1fr))',
      }}>
        {LIMITS.map(l => (
          <div key={l.title} style={{
            border: '1px solid var(--line-soft)', borderRadius: 2,
            padding: 'clamp(20px, 2.6vw, 30px)', backgroundColor: 'var(--panel-dim)',
          }}>
            <h3 style={{ margin: '0 0 10px', fontSize: 15.5, fontWeight: 500, color: 'var(--text)' }}>{l.title}</h3>
            <p style={{ margin: 0, fontSize: 12.5, lineHeight: 1.75, color: 'var(--text-body)' }}>{l.body}</p>
          </div>
        ))}
      </div>
    </Section>
  );
}

/* ── Close ────────────────────────────────────────────────────────────── */

function Close({ onSignIn }: { onSignIn: () => void }) {
  const { ref, shown } = useReveal<HTMLDivElement>();
  return (
    <div ref={ref} data-shown={shown} className="reveal"
      style={{ position: 'relative', overflow: 'hidden', borderTop: '1px solid var(--line-soft)' }}>
      <div className="rules" />
      <div style={{
        position: 'relative', textAlign: 'center',
        padding: 'clamp(64px, 10vw, 150px) clamp(18px, 5vw, 72px)',
      }}>
        <p className="mono" style={{ margin: 0 }}>Start</p>
        <h2 style={{
          margin: '18px auto 0', maxWidth: 760,
          fontSize: 'clamp(27px, 4.6vw, 54px)', fontWeight: 500,
          letterSpacing: '-0.03em', lineHeight: 1.1, color: 'var(--text)',
        }}>
          Point it at your list and watch it show its working.
        </h2>
        <p style={{ margin: '18px auto 0', maxWidth: 470, fontSize: 14, lineHeight: 1.7, color: 'var(--text-body)' }}>
          Connect your own mailbox, write one sentence about what you want, and approve the plan
          before anything is created.
        </p>
        <div style={{ display: 'flex', justifyContent: 'center', flexWrap: 'wrap', gap: 10, marginTop: 30 }}>
          <button className="btn btn-primary" onClick={onSignIn}>
            Open the app <ArrowRight size={13} />
          </button>
          <a className="btn" href="#products">Back to the products</a>
        </div>
      </div>
    </div>
  );
}

function Footer({ name }: { name: string }) {
  return (
    <footer style={{
      display: 'flex', flexWrap: 'wrap', gap: 16, justifyContent: 'space-between', alignItems: 'center',
      padding: 'clamp(22px, 3vw, 34px) clamp(18px, 5vw, 72px)',
      borderTop: '1px solid var(--line-soft)',
    }}>
      <span className="mono">© {new Date().getFullYear()} {name}</span>
      <span style={{ display: 'flex', flexWrap: 'wrap', gap: 'clamp(14px, 3vw, 30px)' }}>
        <a className="mono" href="#products">Products</a>
        <a className="mono" href="#top">Top</a>
        <a className="mono" href="/login" style={{ display: 'inline-flex', alignItems: 'center', gap: 5 }}>
          Sign in <ArrowUpRight size={11} />
        </a>
      </span>
    </footer>
  );
}
