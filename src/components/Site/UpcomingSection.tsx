/**
 * "Coming soon" — the home page's section on what is built and still being
 * tested (owner's brief, 2026-11-14: "create a part for the upcoming
 * features on the main website … take the idea from the incubator").
 *
 * ── Only the incubator, and only as true as it is ──
 *
 * Each card is one entry of docs/INCUBATOR.md, keyed by its switch name, and
 * its badge reads `featureReady` on the host the visitor is on: "Coming soon"
 * where it is off (the live site), "In testing now" where it is on (the
 * testing site). A feature released from the incubator should leave this
 * list in the same commit that takes it out of `REHEARSING` — it then
 * belongs in What's new. Nothing here gives a date: the incubator's own
 * rule is that a feature goes live when it passes, not on a day.
 *
 * ── The pictures ──
 *
 * Small loops drawn in CSS, labelled as illustrations: Protron's portrait
 * with voice bars for talking live, and an app window with Protron's coral
 * pointer filling a box and pressing a button for working the screen. They
 * move only while on screen and never under reduced motion.
 */
import { useEffect, useRef, useState, type CSSProperties } from 'react';
import { AudioLines, MousePointer2, Sparkles } from 'lucide-react';
import { useRevealGroup } from './useReveal';
import { motionReduced } from '../../services/motion';
import { featureReady, type Feature } from '../../services/features';
import './protronSection.css';

type Upcoming = { feature: Feature; icon: typeof Sparkles; title: string; body: string; points: string[]; art: 'live' | 'hands' };

const UPCOMING: Upcoming[] = [
  {
    feature: 'protron-live',
    icon: AudioLines,
    title: 'Talk live with Protron',
    body: 'A real conversation, out loud: Protron answers in a natural voice as you speak, and you can talk over it the way you would with a person.',
    points: ['Speak instead of typing, on any screen', 'Interrupt any time — it stops and listens', 'Captions of both sides as you go'],
    art: 'live',
  },
  {
    feature: 'protron-hands',
    icon: MousePointer2,
    title: 'Protron works the app for you',
    body: 'Approve a plan and Protron builds it while you watch: its pointer moves through the app, fills in the boxes and presses the same buttons you would.',
    points: ['Builds your business workspace in AI Autopilot', 'Fills forms and drafts social posts on screen', 'Sending, paying and deleting stay your buttons'],
    art: 'hands',
  },
];

function useOnScreen<T extends HTMLElement>() {
  const ref = useRef<T | null>(null);
  const [on, setOn] = useState(false);
  useEffect(() => {
    const el = ref.current;
    if (!el || motionReduced() || typeof IntersectionObserver === 'undefined') return;
    const io = new IntersectionObserver(([e]) => setOn(e.isIntersecting), { threshold: 0.3 });
    io.observe(el);
    return () => io.disconnect();
  }, []);
  return { ref, on };
}

function LiveArt() {
  const { ref, on } = useOnScreen<HTMLDivElement>();
  return (
    <div ref={ref} className={`ptn-up-art is-live-art${on ? ' is-on' : ''}`} aria-hidden="true">
      <span className="ptn-up-face"><img src="/protron/robot-160.webp" alt="" width={160} height={160} loading="lazy" decoding="async" /></span>
      <div className="ptn-up-talk">
        <span className="ptn-up-live"><i /> Live</span>
        <div className="ptn-voice">{Array.from({ length: 13 }, (_, i) => <i key={i} style={{ '--i': i } as CSSProperties} />)}</div>
        <p className="ptn-bub is-you">We need more booked jobs this spring.</p>
        <p className="ptn-bub is-bot">Then let’s start with the homeowners near you…</p>
      </div>
    </div>
  );
}

function HandsArt() {
  const { ref, on } = useOnScreen<HTMLDivElement>();
  return (
    <div ref={ref} className={`ptn-up-art is-hands-art${on ? ' is-on' : ''}`} aria-hidden="true">
      <div className="ptn-up-win">
        <span className="ptn-up-dots"><i /><i /><i /></span>
        <div className="ptn-up-body">
          <span className="ptn-up-nav"><i /><i /><i /><i /></span>
          <span className="ptn-up-form">
            <b>New business workspace</b>
            <span className="ptn-up-field"><em /></span>
            <span className="ptn-up-field is-2"><em /></span>
            <span className="ptn-up-btn">Build My AI Autopilot</span>
          </span>
        </div>
      </div>
      <span className="ptn-up-ptr">
        <span className="ptn-ripple" />
        <svg width="22" height="24" viewBox="0 0 24 26"><path d="M3 2.5 L3 21 L8.2 16.4 L11.6 23.6 L15 22 L11.7 15 L19.2 14.6 Z" fill="#d97757" stroke="#fff" strokeWidth="2" strokeLinejoin="round" /></svg>
        <span className="ptn-chip">Protron</span>
      </span>
    </div>
  );
}

export function UpcomingSection() {
  const grid = useRevealGroup<HTMLDivElement>('.ptn-up-card');
  return (
    <section className="dc-process ptn-up" id="coming-soon" aria-label="Coming soon">
      <div className="dc-chapter-head">
        <span className="dc-eyebrow">Coming soon</span>
        <h2>Built, and in final testing. <em>Next in Protected Central.</em></h2>
        <p>These are finished and running on our testing site. Each one switches on for everyone once it passes its tests.</p>
      </div>
      <div className="ptn-up-grid stagger" ref={grid}>
        {UPCOMING.map(u => {
          const testing = featureReady(u.feature);
          return (
            <article key={u.feature} className="ptn-up-card">
              {u.art === 'live' ? <LiveArt /> : <HandsArt />}
              <span className="ptn-up-cap">Illustration</span>
              <span className="ptn-new-top">
                <span className="dc-tile-icon"><u.icon size={14} /></span>
                <i className="ptn-up-badge" data-testing={testing ? '1' : '0'}>{testing ? 'In testing now' : 'Coming soon'}</i>
              </span>
              <b>{u.title}</b>
              <small>{u.body}</small>
              <ul>{u.points.map(p => <li key={p}><Sparkles size={12} /> {p}</li>)}</ul>
            </article>
          );
        })}
      </div>
    </section>
  );
}
