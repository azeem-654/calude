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
 * So the ground is CSS only — no download. Fifth pass (owner, 2026-11-14,
 * with a reference): an ember-orange glow rising from the bottom through a
 * fine dot grid, the prompt box as glass with a glowing edge. Sixth pass
 * (same day): the glow drifts slowly between that orange and the logo's
 * green and back, and the hero has a light version for day mode and a
 * near-black one for night mode (dashboard.css):
 *
 *   colour  four soft blobs (three embers along the bottom, a faint warm one
 *           at the top), each a radial gradient drifting on its own slow loop,
 *           and a green layer cross-faded over them on a long loop
 *   dots    a dot grid, masked so it shows where the glow is
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
 * ── One column, full width ──
 *
 * The box, the film and the day bar share one column (`.dash-hero-col`), as
 * wide as the page allows (owner, 2026-11-14: a column sized to fit one
 * screen made both "very small" on a laptop).
 *
 * Sending hands the words to the New business workspace wizard the same way
 * Protron does (`sessionStorage.pc_protron_handoff` → `/autopilot?new=1&from=protron`,
 * read once by Autopilot.tsx), so it lands in the wizard's own box and goes
 * through Understand like anything typed there. Nothing is created here.
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import { ArrowRight, AudioLines, Loader, MessageSquare, Mic, Sparkles, Square } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import AutopilotFilm from './AutopilotFilm';
import { useVoiceInput, defaultLocale } from '../Autopilot/voice/useVoiceInput';
import { motionReduced } from '../../services/motion';
import { featureReady } from '../../services/features';

const LIVE_TALK = featureReady('protron-live');

/* Short labels so the four fit one row under the box at the film's width (the
   row's height is part of the one-screen sum below); the full sentence is
   what goes to the wizard. */
const STARTERS = [
  { label: 'New customers daily', prompt: 'Find new customers for me every day' },
  { label: 'Daily social posts', prompt: 'Grow my social media with daily posts' },
  { label: 'Follow up enquiries', prompt: 'Follow up with every enquiry automatically' },
  { label: 'Win back customers', prompt: 'Bring past customers back' },
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
 * The ground: near-black lit from below by drifting ember-orange glows, a dot
 * grid catching that light, a fine grain, and a warm light that follows the
 * pointer. Drawn entirely by CSS gradients (no photo, no download) — the
 * owner's reference of 2026-11-14 replaced the indigo-to-peach aurora.
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
      {/* The logo's green, cross-faded in and out over the ember (opacity only). */}
      <span className="dash-aurora-green" />
      <span className="dash-aurora-dots" />
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

export default function DashHero({ greeting, firstName, children }: { greeting: string; firstName: string; children?: React.ReactNode }) {
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
      <div className="dash-hero-col">
      <div className="dash-hero-inner">
        <h1 className="dash-hero-title">{greeting}{firstName ? `, ${firstName}` : ''}</h1>
        <p className="dash-hero-sub">What should AI Autopilot do for your business today?</p>
        <form className="dash-hero-box" onSubmit={e => { e.preventDefault(); send(text); }}>
          <span className="dash-hero-spark" aria-hidden="true"><Sparkles size={20} /></span>
          <textarea
            ref={box}
            className="dash-hero-input"
            aria-label="Ask AI Autopilot"
            data-field="dashboard.autopilot"
            rows={2}
            maxLength={3000}
            value={text}
            placeholder="Describe a result — e.g. find 20 dentists in Austin every day and email them about our offer…"
            onChange={e => { setText(e.target.value); if (note) setNote(''); }}
            onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send(text); } }}
          />
          <div className="dash-hero-bar">
            <div className="dash-hero-ways">
              <RecordButton onText={heard} signal={recSignal} />
              {LIVE_TALK ? (
                <button type="button" className="dash-hero-live" onClick={talk} title="Talk to Protron live, one to one — it sets AI Autopilot up while you speak">
                  <span className="dash-hero-live-dot" aria-hidden="true" />
                  <AudioLines size={15} /> Talk live <span className="dash-hero-live-sub">one-to-one with Protron</span>
                </button>
              ) : (
                /* Live talk is in the incubator (docs/INCUBATOR.md): on the live
                   app this opens Protron's chat, so it says so (audit,
                   2026-11-14 — "Talk live" led a reviewer to a typed chat). */
                <button type="button" className="dash-hero-live" onClick={talk} title="Chat with Protron — type or send a voice message; it sets AI Autopilot up with you">
                  <span className="dash-hero-live-dot" aria-hidden="true" />
                  <MessageSquare size={15} /> Chat with Protron <span className="dash-hero-live-sub">type or record</span>
                </button>
              )}
            </div>
            <button type="submit" className="dash-hero-send" aria-label="Send to AI Autopilot" disabled={!text.trim()}><span>Send</span><ArrowRight size={16} /></button>
          </div>
          {note && <p className="dash-hero-note" role="status">{note}</p>}
        </form>
        <div className="dash-hero-starters" role="group" aria-label="Starting points">
          {STARTERS.map(s => <button key={s.label} type="button" className="dash-hero-chip" title={s.prompt} onClick={() => send(s.prompt)}>{s.label}</button>)}
        </div>
      </div>
      <div className="dash-hero-film">
        <AutopilotFilm onTalk={talk} onRecord={recordIt} onType={typeIt} />
      </div>
      {/* The day bar, inside the same light (owner, 2026-11-14: "blend it
          inside the theme atmosphere"). */}
      {children && <div className="dash-hero-day">{children}</div>}
      </div>
    </section>
  );
}
