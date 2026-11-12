/**
 * The dashboard's starting point: ask AI Autopilot for anything.
 *
 * The owner's brief (2026-11-12): AI Autopilot is the product's main feature
 * and people should start everything from it, so the dashboard opens on one
 * prompt box — greeting, a line, the box, a few starting points.
 *
 * ── The ground: colour light, not a picture ──
 *
 * First procedural WebGL hills (cartoonish, said the owner), then aerial
 * nature footage (it stuttered: a 720p video decoding under blurred glass
 * repaints the hero every frame), then an office photo, which the owner
 * replaced (fourth pass, 2026-11-12) with "a more modern background that suits
 * the app's theme", pointing at a soft lilac–pink–blue gradient as the example.
 * So the ground is CSS only — no download — in Autopilot's own colours:
 *
 *   colour  four large soft blobs (indigo, violet, pink, a peach glow), each a
 *           radial gradient drifting on its own slow loop
 *   silk    two wide bands of light curving across, like the example's sheen
 *   mouse   the colour shifts against the pointer (eased in a frame callback
 *           that stops as soon as it has caught up) and a soft light follows
 *           it; touch screens keep the drift alone
 *   grain   a fixed, faint noise so the gradient does not band
 *
 * Everything moves by `transform` or `opacity` only, nothing is blurred live,
 * and all of it pauses once the hero has scrolled away; reduced motion gets
 * the still gradient. The ground reaches up behind the top menu
 * (Dashboard.tsx measures how far), and while it is in view the menu turns
 * see-through (`html[data-hero-top]`, dashboard.css) so both share it. As the
 * page scrolls on, the ground fades (opacity written straight onto the node in
 * a frame callback, so the dashboard does not re-render per tick).
 *
 * ── Three ways in, said loudly ──
 *
 * The brief also asked that recording a prompt and talking live, one to one,
 * be the obvious things to do — setting up while talking should feel easy.
 * So the box carries a red **Record** button (the shared transcriber,
 * voice/useVoiceInput.ts: the words land in the box to be checked, nothing
 * is sent) and a lit **Talk live** button (the New business workspace
 * wizard, where Protron's real-time conversation lives). Under it,
 * AutopilotFilm.tsx shows what Autopilot does instead of listing features as
 * buttons.
 *
 * Sending hands the words to the New business workspace wizard the same way
 * Protron does (`sessionStorage.pc_protron_handoff` → `/autopilot?new=1&from=protron`,
 * read once by Autopilot.tsx), so it lands in the wizard's own box and goes
 * through Understand like anything typed there. Nothing is created here.
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import { ArrowRight, AudioLines, Loader, Mic, Sparkles, Square } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import AutopilotFilm from './AutopilotFilm';
import { useVoiceInput, defaultLocale } from '../Autopilot/voice/useVoiceInput';
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

/**
 * The ground: soft colour light in the Autopilot palette — indigo, violet,
 * pink and a peach glow — drifting slowly, two silk bands of light across it
 * and a fine grain, with a light that follows the pointer. Drawn entirely by
 * CSS gradients (no photo, no download): the owner replaced the office photo
 * with "a more modern background that suits the app's theme" (2026-11-12).
 */
function AuroraGround({ active, still }: { active: boolean; still: boolean }) {
  const root = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = root.current;
    if (!el || still || !active) return;
    /* A finger has no hover to follow; touch screens keep the slow drift. */
    if (!window.matchMedia?.('(hover: hover) and (pointer: fine)').matches) return;
    const at = { x: 0, y: 0, gx: 0, gy: 0 };
    const to = { x: 0, y: 0, gx: 0, gy: 0 };
    let raf = 0;
    const step = () => {
      at.x += (to.x - at.x) * 0.06; at.y += (to.y - at.y) * 0.06;
      at.gx += (to.gx - at.gx) * 0.12; at.gy += (to.gy - at.gy) * 0.12;
      el.style.setProperty('--px', at.x.toFixed(4));
      el.style.setProperty('--py', at.y.toFixed(4));
      el.style.setProperty('--gx', `${at.gx.toFixed(1)}px`);
      el.style.setProperty('--gy', `${at.gy.toFixed(1)}px`);
      /* Stops as soon as it has caught up: no frame is drawn for a still mouse. */
      const left = Math.abs(to.x - at.x) + Math.abs(to.y - at.y) + (Math.abs(to.gx - at.gx) + Math.abs(to.gy - at.gy)) / 400;
      raf = left > 0.0008 ? requestAnimationFrame(step) : 0;
    };
    const move = (e: PointerEvent) => {
      const r = el.getBoundingClientRect();
      if (e.clientY > r.bottom) return;
      to.x = (e.clientX / window.innerWidth) * 2 - 1;
      to.y = ((e.clientY - r.top) / Math.max(1, r.height)) * 2 - 1;
      to.gx = e.clientX - r.left;
      to.gy = e.clientY - r.top;
      if (el.dataset.pointer !== '1') { el.dataset.pointer = '1'; at.gx = to.gx; at.gy = to.gy; }
      if (!raf) raf = requestAnimationFrame(step);
    };
    window.addEventListener('pointermove', move, { passive: true });
    return () => { window.removeEventListener('pointermove', move); if (raf) cancelAnimationFrame(raf); };
  }, [active, still]);
  return (
    <div ref={root} className="dash-aurora" data-still={still ? '1' : '0'} data-active={active ? '1' : '0'}>
      <span className="dash-aurora-blob is-a" />
      <span className="dash-aurora-blob is-b" />
      <span className="dash-aurora-blob is-c" />
      <span className="dash-aurora-blob is-d" />
      <span className="dash-aurora-silk is-1" />
      <span className="dash-aurora-silk is-2" />
      <span className="dash-aurora-glow" />
      <span className="dash-aurora-grain" />
    </div>
  );
}

/**
 * Record a prompt into the box. The same transcriber as the wizard's
 * microphone: what was heard is added to the box for the person to read —
 * nothing is sent from here.
 */
function RecordButton({ onText, signal }: { onText: (t: string, note: string) => void; signal: number }) {
  const v = useVoiceInput(defaultLocale());
  const go = useCallback(async () => {
    if (v.phase === 'listening') { void v.stop(); return; }
    if (v.phase === 'starting' || v.phase === 'transcribing') return;
    const r = await v.start();
    if (r) onText(r.text, r.doubtful ? r.note : 'Added to the box. Check the words, then send.');
  }, [v, onText]);
  const goRef = useRef(go);
  useEffect(() => { goRef.current = go; });
  const seen = useRef(signal);
  useEffect(() => { if (signal !== seen.current) { seen.current = signal; void goRef.current(); } }, [signal]);
  if (!v.supported) return null;
  const listening = v.phase === 'listening';
  const working = v.phase === 'starting' || v.phase === 'transcribing';
  return (
    <button type="button" className={`dash-hero-rec${listening ? ' is-on' : ''}`} onClick={() => void go()} disabled={working}
      aria-pressed={listening} style={{ ['--lvl' as string]: v.level.toFixed(3) } as React.CSSProperties}
      title={listening ? 'Stop recording' : 'Record your prompt instead of typing'}>
      {working ? <Loader size={15} className="spin" /> : listening ? <Square size={13} fill="currentColor" /> : <Mic size={15} />}
      <span>{listening ? `Stop · ${Math.floor(v.seconds / 60)}:${String(v.seconds % 60).padStart(2, '0')}` : v.phase === 'transcribing' ? 'Transcribing…' : v.phase === 'starting' ? 'Starting…' : 'Record'}</span>
    </button>
  );
}

export default function DashHero({ greeting, firstName }: { greeting: string; firstName: string }) {
  const navigate = useNavigate();
  const [text, setText] = useState('');
  const [visible, setVisible] = useState(true);
  const [still] = useState(() => motionReduced());
  const [note, setNote] = useState('');
  const [recSignal, setRecSignal] = useState(0);
  const hero = useRef<HTMLElement>(null);
  const ground = useRef<HTMLDivElement>(null);
  const box = useRef<HTMLTextAreaElement>(null);

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
      /* The top menu is see-through while it sits over the ground. */
      if (o > 0.35) document.documentElement.dataset.heroTop = '1';
      else delete document.documentElement.dataset.heroTop;
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
      delete document.documentElement.dataset.heroTop;
    };
  }, []);

  const talk = useCallback(() => navigate('/autopilot?new=1'), [navigate]);
  const typeIt = useCallback(() => { box.current?.scrollIntoView({ block: 'center', behavior: 'smooth' }); box.current?.focus(); }, []);
  const recordIt = useCallback(() => { box.current?.scrollIntoView({ block: 'center', behavior: 'smooth' }); setRecSignal(n => n + 1); }, []);
  const heard = useCallback((t: string, why: string) => { setText(prev => (prev.trim() ? `${prev.trim()} ${t}` : t).slice(0, 3000)); setNote(why); box.current?.focus(); }, []);

  const send = (words: string) => {
    const t = words.trim();
    if (!t) return;
    try { sessionStorage.setItem('pc_protron_handoff', t.slice(0, 3000)); } catch { /* the wizard opens with an empty box instead */ }
    navigate('/autopilot?new=1&from=protron');
  };

  return (
    <section ref={hero} className="dash-hero" aria-label="Start with AI Autopilot" data-noinvert="">
      <div ref={ground} className="dash-hero-ground" aria-hidden="true">
        <AuroraGround active={visible} still={still} />
        <span className="dash-hero-veil" />
      </div>
      <div className="dash-hero-inner">
        <span className="dash-hero-badge"><Sparkles size={13} /> AI Autopilot</span>
        <h1 className="dash-hero-title">{greeting}{firstName ? `, ${firstName}` : ''}</h1>
        <p className="dash-hero-sub">What should AI Autopilot do for your business today?</p>
        <form className="dash-hero-box" onSubmit={e => { e.preventDefault(); send(text); }}>
          <textarea
            ref={box}
            className="dash-hero-input"
            aria-label="Ask AI Autopilot"
            data-field="dashboard.autopilot"
            rows={3}
            maxLength={3000}
            value={text}
            placeholder="Describe a result — e.g. find 20 dentists in Austin every day and email them about our offer…"
            onChange={e => { setText(e.target.value); if (note) setNote(''); }}
            onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send(text); } }}
          />
          <div className="dash-hero-bar">
            <div className="dash-hero-ways">
              <RecordButton onText={heard} signal={recSignal} />
              <button type="button" className="dash-hero-live" onClick={talk} title="Talk to Protron live, one to one — it sets AI Autopilot up while you speak">
                <span className="dash-hero-live-dot" aria-hidden="true" />
                <AudioLines size={15} /> Talk live <span className="dash-hero-live-sub">one-to-one with Protron</span>
              </button>
            </div>
            <button type="submit" className="dash-hero-send" aria-label="Send to AI Autopilot" disabled={!text.trim()}><ArrowRight size={18} /></button>
          </div>
          {note && <p className="dash-hero-note" role="status">{note}</p>}
        </form>
        <p className="dash-hero-how">Type it, record it, or just talk — Protron sets everything up while you speak.</p>
        <div className="dash-hero-starters" role="group" aria-label="Starting points">
          {STARTERS.map(s => <button key={s} type="button" className="dash-hero-chip" onClick={() => send(s)}>{s}</button>)}
        </div>
      </div>
      <div className="dash-hero-film">
        <AutopilotFilm onTalk={talk} onRecord={recordIt} onType={typeIt} />
      </div>
    </section>
  );
}
