/**
 * The dashboard's starting point: ask AI Autopilot for anything.
 *
 * The owner's brief (2026-11-12): AI Autopilot is the product's main feature
 * and people should start everything from it, so the dashboard opens on one
 * prompt box — greeting, a line, the box, a few starting points.
 *
 * ── The ground: real footage, not a drawing ──
 *
 * The first version flew over procedural WebGL hills; the owner found it
 * cartoonish and asked for real, high-quality nature — greenery, then
 * mountains, then the sea. It is now aerial footage (green hills → lush
 * mountains → alpine peaks → a rocky coast → low over the sea), one 37 s loop
 * whose last crossfade returns to its first frame, from five Mixkit clips
 * under their free commercial licence (docs/MEDIA-CREDITS.md). Two encodes:
 * 720p, and 480p for narrow screens; a data-saver connection or reduced
 * motion gets the still poster. It pauses off screen and in a hidden tab. As
 * the page scrolls on, the ground fades (opacity written straight onto the
 * node in a frame callback, so the dashboard does not re-render per tick).
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

const FOOTAGE = '/media/autopilot/nature';

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

/** Which encode: the small one for a phone-width screen, none at all on data saver. */
function footageBase(): string | null {
  try {
    const c = (navigator as Navigator & { connection?: { saveData?: boolean } }).connection;
    if (c?.saveData) return null;
  } catch { /* no connection info: assume it is fine */ }
  return `${FOOTAGE}-${window.innerWidth <= 760 ? '480' : '720'}`;
}

function Footage({ active, still }: { active: boolean; still: boolean }) {
  const ref = useRef<HTMLVideoElement>(null);
  const [src] = useState(() => (still ? null : footageBase()));
  useEffect(() => {
    const v = ref.current;
    if (!v) return;
    const sync = () => { if (active && !document.hidden) void v.play().catch(() => { /* autoplay refused: the poster stays */ }); else v.pause(); };
    sync();
    document.addEventListener('visibilitychange', sync);
    return () => document.removeEventListener('visibilitychange', sync);
  }, [active]);
  if (!src) return <img className="dash-hero-video" src={`${FOOTAGE}-poster.jpg`} alt="" />;
  return (
    /* H.264 first (every Safari and Chrome); VP9 for a browser built without
       H.264, such as plain Chromium. */
    <video ref={ref} className="dash-hero-video" poster={`${FOOTAGE}-poster.jpg`}
      muted loop playsInline autoPlay preload="auto" disablePictureInPicture aria-hidden="true" tabIndex={-1}>
      <source src={`${src}.mp4`} type="video/mp4" />
      <source src={`${src}.webm`} type="video/webm" />
    </video>
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
        <Footage active={visible} still={still} />
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
