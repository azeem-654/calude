/**
 * The dashboard's starting point: ask AI Autopilot for anything.
 *
 * The owner's brief (2026-11-12): AI Autopilot is the product's main feature
 * and people should start everything from it, so the dashboard now opens on
 * one prompt box — greeting, a line, the box, a few starting points — over a
 * slow flight across green hills (HillsCanvas.tsx). As the page scrolls to
 * the next section the hills fade to nothing (opacity follows the scroll, in
 * a frame callback, written straight onto the node so the dashboard does not
 * re-render on every scroll tick) and stop drawing once gone.
 *
 * Sending hands the words to the New business workspace wizard the same way
 * Protron does (`sessionStorage.pc_protron_handoff` → `/autopilot?new=1&from=protron`,
 * read once by Autopilot.tsx), so it lands in the wizard's own box and goes
 * through Understand like anything typed there. Nothing is created here.
 */
import { useEffect, useRef, useState } from 'react';
import { ArrowRight, AudioLines, Sparkles } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import HillsCanvas from './HillsCanvas';
import { motionReduced } from '../../services/motion';

const STARTERS = [
  'Find new customers for me every day',
  'Grow my social media with daily posts',
  'Follow up with every enquiry automatically',
  'Bring past customers back',
];

/** The element that scrolls the page: the nearest scrolling ancestor, else the window. */
function scrollerOf(el: HTMLElement | null): HTMLElement | Window {
  for (let n = el?.parentElement; n; n = n.parentElement) {
    const o = getComputedStyle(n).overflowY;
    if ((o === 'auto' || o === 'scroll') && n.scrollHeight > n.clientHeight) return n;
  }
  return window;
}

export default function DashHero({ greeting, firstName }: { greeting: string; firstName: string }) {
  const navigate = useNavigate();
  const [text, setText] = useState('');
  const [visible, setVisible] = useState(true);
  const [still] = useState(() => motionReduced());
  const hero = useRef<HTMLElement>(null);
  const ground = useRef<HTMLDivElement>(null);

  /* The ground fades as the next section comes up, and stops at zero. */
  useEffect(() => {
    const el = hero.current;
    const g = ground.current;
    if (!el || !g) return;
    const scroller = scrollerOf(el);
    let raf = 0;
    let shown = true;
    const apply = () => {
      raf = 0;
      const rect = el.getBoundingClientRect();
      const span = Math.max(1, rect.height * 0.85);
      const passed = Math.max(0, -rect.top + (scroller === window ? 0 : (scroller as HTMLElement).getBoundingClientRect().top));
      const o = Math.max(0, Math.min(1, 1 - passed / span));
      g.style.opacity = o.toFixed(3);
      const now = o > 0.01;
      if (now !== shown) { shown = now; setVisible(now); }
    };
    const onScroll = () => { if (!raf) raf = requestAnimationFrame(apply); };
    apply();
    scroller.addEventListener('scroll', onScroll, { passive: true });
    window.addEventListener('resize', onScroll);
    return () => {
      scroller.removeEventListener('scroll', onScroll);
      window.removeEventListener('resize', onScroll);
      if (raf) cancelAnimationFrame(raf);
    };
  }, []);

  const send = (words: string) => {
    const t = words.trim();
    if (!t) return;
    try { sessionStorage.setItem('pc_protron_handoff', t.slice(0, 3000)); } catch { /* the wizard opens with an empty box instead */ }
    navigate('/autopilot?new=1&from=protron');
  };

  return (
    <section ref={hero} className="dash-hero" aria-label="Start with AI Autopilot">
      <div ref={ground} className="dash-hero-ground" aria-hidden="true">
        <HillsCanvas active={visible} still={still} />
        <span className="dash-hero-veil" />
      </div>
      <div className="dash-hero-inner">
        <span className="dash-hero-badge"><Sparkles size={13} /> AI Autopilot</span>
        <h1 className="dash-hero-title">{greeting}{firstName ? `, ${firstName}` : ''}</h1>
        <p className="dash-hero-sub">What should AI Autopilot do for your business today?</p>
        <form className="dash-hero-box" onSubmit={e => { e.preventDefault(); send(text); }}>
          <textarea
            className="dash-hero-input"
            aria-label="Ask AI Autopilot"
            data-field="dashboard.autopilot"
            rows={3}
            maxLength={3000}
            value={text}
            placeholder="Describe a result — e.g. find 20 dentists in Austin every day and email them about our offer…"
            onChange={e => setText(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send(text); } }}
          />
          <div className="dash-hero-bar">
            <button type="button" className="dash-hero-live" onClick={() => navigate('/autopilot?new=1')} title="Open the New business workspace wizard and talk to Protron">
              <AudioLines size={15} /> Talk to Protron
            </button>
            <button type="submit" className="dash-hero-send" aria-label="Send to AI Autopilot" disabled={!text.trim()}><ArrowRight size={18} /></button>
          </div>
        </form>
        <div className="dash-hero-starters" role="group" aria-label="Starting points">
          {STARTERS.map(s => <button key={s} type="button" className="dash-hero-chip" onClick={() => send(s)}>{s}</button>)}
        </div>
      </div>
    </section>
  );
}
