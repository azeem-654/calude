/**
 * "Watch it get built" — AI Autopilot, step by step, at the foot of the home page.
 *
 * ── Why it is drawn, and what it replaced ──
 *
 * The closing section used to hold a reel of the dashboard: a whole page
 * shrunk into the strip, which read as a short, tall picture with a wide gap
 * above it, and nothing in it showed Autopilot doing anything. The owner
 * asked for a proper demonstration: 16:9 across the column, a story a visitor
 * can follow, and a pointer that moves like a hand rather than jumping.
 *
 * So the page draws it, as five scenes in the app's own Autopilot palette
 * (Autopilot/theme.ts) with the product's real names — New AI Autopilot
 * business workspace, the 12-month marketing plan, Workflows, Marketing,
 * Conversations, replies held for your OK. A recorded MP4 would go stale the
 * day a label changes and would be blurry at one of the two widths; this is
 * crisp at both and costs no download.
 *
 * ── Honesty ──
 *
 * It is an illustration with one example business, and says so in the frame.
 * There are no figures in it: the last scene says what happens ("Replies
 * arrive in your inbox"), not how many — an invented count would read as a
 * result (CLAUDE.md: no invented figures on a customer screen).
 *
 * ── How it moves ──
 *
 * Every scene is laid out once, in full, at a fixed design size, and scaled
 * to the frame with one transform — so nothing reflows while it plays, and
 * the pointer's targets are measured from the real elements (their layout
 * offsets, which ignore the reveal transforms) instead of written as pixels
 * that would be wrong at another width. A narrow frame gets a second design
 * size with fewer, larger parts (`is-compact`), because one design scaled to
 * a phone puts its text at four pixels.
 *
 * Each step is a list of cues on its own clock: reveal a part, type into a
 * box, move the pointer, click. One requestAnimationFrame loop runs that
 * clock, and only while the demo is playing, at least partly on screen and
 * the tab visible. It writes only classes (opacity/transform transitions in
 * autopilotDemo.css) and the pointer's transform; React renders once per
 * step, never per frame. The pointer travels on a slight arc with a
 * minimum-jerk profile (no sudden starts or stops), never disappears, and
 * carries on from wherever it was when a step changes — it cannot teleport.
 *
 * Somebody whose device asks for less motion gets each step as a still,
 * finished frame with its caption, and moves between them with the buttons.
 *
 * ── Sound ──
 *
 * None. Protron's narrated voice (protron.php `narrate`) needs a signed-in
 * workspace and the public site has none, and the owner asked for no browser
 * voice; the captions under the frame carry every step.
 */
import { useCallback, useEffect, useLayoutEffect, useRef, useState, type CSSProperties, type ReactNode } from 'react';
import {
  Calendar, Check, ChevronRight, Clock, FileText, GitBranch, Inbox, LayoutDashboard, Loader, Mail,
  MessageSquare, Pause, Play, Send, Share2, ShieldCheck, SkipBack, SkipForward, Sparkles, Zap,
} from 'lucide-react';
import { LogoMark } from '../shared/Logo';
import { motionReduced } from '../../services/motion';
import './autopilotDemo.css';

/* ── The story ─────────────────────────────────────────────────────────── */

type Cue =
  | { at: number; do: 'on'; k: string }
  | { at: number; do: 'type'; k: string; ms: number }
  | { at: number; do: 'move'; k: string; ms: number }
  | { at: number; do: 'click'; k: string };

type Rail = 'autopilot' | 'marketing' | 'conversations';

type Step = { title: string; caption: string; crumb: string; rail: Rail; ms: number; cues: Cue[] };

const on = (at: number, k: string): Cue => ({ at, do: 'on', k });
const type = (at: number, k: string, ms: number): Cue => ({ at, do: 'type', k, ms });
const move = (at: number, k: string, ms: number): Cue => ({ at, do: 'move', k, ms });
const click = (at: number, k: string): Cue => ({ at, do: 'click', k });

const MONTHS: [string, string][] = [
  ['Jan', 'New-year plumbing check'], ['Feb', 'Frozen-pipe prevention'], ['Mar', 'Water-heater tune-up'],
  ['Apr', 'Leak detection week'], ['May', 'Outdoor taps & irrigation'], ['Jun', 'Water-saving tips'],
  ['Jul', 'Monsoon drain prep'], ['Aug', 'Back-to-school routines'], ['Sep', 'Water-heater flush month'],
  ['Oct', 'Fall inspection offer'], ['Nov', 'Guest-ready kitchens'], ['Dec', 'Year-end maintenance'],
];

const STEPS: Step[] = [
  {
    title: 'Business details',
    caption: 'Tell AI Autopilot about the business in a few lines. That is the whole brief.',
    crumb: 'New business workspace',
    rail: 'autopilot',
    ms: 9400,
    cues: [
      move(200, 'f1', 750), click(1000, 'f1'), type(1050, 'f1t', 850), on(1900, 'w1'),
      move(2050, 'f2', 650), click(2750, 'f2'), type(2800, 'f2t', 1300), on(3900, 'w2'),
      move(4250, 'f3', 600), click(4900, 'f3'), type(4950, 'f3t', 1000), on(5700, 'w3'),
      move(6050, 'f4', 550), click(6650, 'f4'), type(6700, 'f4t', 850), on(7300, 'w4'),
      move(7650, 'go', 750), click(8450, 'go'),
    ],
  },
  {
    title: '12-month plan',
    caption: 'It writes a 12-month marketing plan from what you said — a theme for every month.',
    crumb: 'Brightside Plumbing · Overview',
    rail: 'autopilot',
    ms: 7600,
    cues: [
      on(150, 'plan'),
      ...MONTHS.map((_, i) => on(350 + i * 120, `m${i}`)),
      move(2100, 'm6', 900), click(3100, 'm6'), on(3200, 'detail'),
      on(3600, 'd1'), on(3850, 'd2'), on(4100, 'd3'),
    ],
  },
  {
    title: 'Workflows & emails',
    caption: 'It builds the email workflows and writes every email in them, ready to read.',
    crumb: 'Brightside Plumbing · Workflows',
    rail: 'autopilot',
    ms: 8600,
    cues: [
      on(150, 'n0'), on(450, 'e0'), on(600, 'n1'), on(900, 'e1'), on(1050, 'n2'), on(1350, 'e2'), on(1500, 'n3'), on(1800, 'e3'), on(1950, 'n4'),
      move(2200, 'n4', 850), click(3150, 'n4'), on(3250, 'mail'),
      type(3500, 'subj', 750), type(4350, 'body', 2500), on(7000, 'hold'),
    ],
  },
  {
    title: 'Posts scheduled',
    caption: 'Blog articles and social posts are written to the plan and put on the schedule.',
    crumb: 'Marketing · Scheduled posts',
    rail: 'marketing',
    ms: 7000,
    cues: [
      on(250, 'p0'), on(600, 'p1'), on(950, 'p2'), on(1300, 'p3'), on(1650, 'p4'),
      move(2100, 'sched', 900), click(3100, 'sched'), on(3150, 'week'),
    ],
  },
  {
    title: 'Replies come in',
    caption: 'Replies arrive in your inbox with an answer drafted. Nothing sends until you say yes.',
    crumb: 'Conversations',
    rail: 'conversations',
    ms: 9600,
    cues: [
      on(250, 'r0'), on(650, 'r1'), on(1050, 'r2'),
      move(1500, 'r0', 850), click(2450, 'r0'), on(2550, 'reply'),
      type(2900, 'draft', 1900),
      move(5000, 'send', 800), click(5900, 'send'), on(6000, 'sent'),
      on(6700, 'b1'), on(7100, 'b2'),
    ],
  },
];

/* ── Drawing helpers ───────────────────────────────────────────────────── */

/** Text that types itself: every character is laid out from the start and only shown. */
function Typed({ k, text }: { k: string; text: string }) {
  return (
    <span className="apd-typed" data-k={k} data-typed="">
      {Array.from(text).map((c, i) => <span key={i} className="apd-c">{c}</span>)}
    </span>
  );
}

function Field({ k, label, ph, text, wide }: { k: string; label: string; ph: string; text: string; wide?: boolean }) {
  return (
    <div className={`apd-field apd-t${wide ? ' apd-wide-only' : ''}`} data-k={k}>
      <span className="apd-lbl">{label}</span>
      <span className="apd-input">
        <span className="apd-ph">{ph}</span>
        <Typed k={`${k}t`} text={text} />
      </span>
    </div>
  );
}

const WILL: [string, ReactNode][] = [
  ['w1', <>A <b>12-month marketing plan</b></>],
  ['w2', <><b>Email workflows</b> and every email in them</>],
  ['w3', <><b>Blog and social posts</b>, on a schedule</>],
  ['w4', <><b>Reply drafts</b>, held for your OK</>],
];

const FLOW: { k: string; tone: string; icon: typeof Mail; h: string; s: string }[] = [
  { k: 'n0', tone: 'trigger', icon: Zap, h: 'New enquiry arrives', s: 'Trigger' },
  { k: 'n1', tone: 'ai', icon: Sparkles, h: 'AI writes a personal reply', s: 'AI step' },
  { k: 'n2', tone: 'wait', icon: Clock, h: 'Wait two days', s: 'Wait' },
  { k: 'n3', tone: 'condition', icon: GitBranch, h: 'Did they reply?', s: 'If / else' },
  { k: 'n4', tone: 'integration', icon: Mail, h: 'Send follow-up email', s: 'Email' },
];

const POSTS: { k: string; day: string; kind: string; icon: typeof Mail; h: string }[] = [
  { k: 'p0', day: 'Mon', kind: 'Facebook post', icon: Share2, h: 'Is your drain ready for monsoon season?' },
  { k: 'p1', day: 'Tue', kind: 'Blog post', icon: FileText, h: 'Getting your drains ready for the monsoon' },
  { k: 'p2', day: 'Wed', kind: 'Instagram post', icon: Share2, h: 'Before and after: a water-heater install' },
  { k: 'p3', day: 'Thu', kind: 'LinkedIn post', icon: Share2, h: 'Why we flush water heaters every year' },
  { k: 'p4', day: 'Fri', kind: 'Facebook post', icon: Share2, h: 'A leak at the weekend? Do this first' },
];

const INBOX: { k: string; subj: string; msg: string }[] = [
  { k: 'r0', subj: 'Re: Still need a hand with that leak?', msg: 'Yes please — is Thursday morning possible?' },
  { k: 'r1', subj: 'Re: Is your drain ready for monsoon season?', msg: 'How much notice do you need for a drain check?' },
  { k: 'r2', subj: 'New enquiry from your website', msg: 'Our water heater is making a banging noise.' },
];

/* ── Layout: two design sizes, one transform ───────────────────────────── */

type Fit = { w: number; h: number; k: number; compact: boolean };

/** The design size for a frame `c` px wide: whichever keeps the app's text at a readable size once scaled. */
function fitFor(c: number): Fit {
  if (c < 620) return { w: 640, h: 360, k: c / 640, compact: true };
  if (c < 900) return { w: 960, h: 540, k: c / 960, compact: false };
  return { w: 1200, h: 675, k: c / 1200, compact: false };
}

/** Where an element sits inside the canvas, from layout offsets — transforms (reveals, the scale) do not count. */
function boxIn(el: HTMLElement, root: HTMLElement) {
  let x = 0, y = 0;
  let n: HTMLElement | null = el;
  while (n && n !== root) { x += n.offsetLeft; y += n.offsetTop; n = n.offsetParent as HTMLElement | null; }
  return { x, y, w: el.offsetWidth, h: el.offsetHeight, ok: n === root };
}

const clamp01 = (n: number) => Math.max(0, Math.min(1, n));
/** Minimum-jerk easing: velocity and acceleration are zero at both ends, as in a hand's reach. */
const reach = (s: number) => s * s * s * (10 - 15 * s + 6 * s * s);

type Move = { at: number; ms: number; x0: number; y0: number; cx: number; cy: number; x1: number; y1: number };
type Typing = { at: number; ms: number; chars: HTMLElement[]; shown: number };

/* ── The player ────────────────────────────────────────────────────────── */

export default function AutopilotDemo() {
  const root = useRef<HTMLElement | null>(null);
  const screen = useRef<HTMLDivElement | null>(null);
  const canvas = useRef<HTMLDivElement | null>(null);
  const pointer = useRef<HTMLDivElement | null>(null);
  const ripple = useRef<HTMLSpanElement | null>(null);
  const rippleAt = useRef<HTMLDivElement | null>(null);
  const scenes = useRef<(HTMLElement | null)[]>([]);
  const fills = useRef<(HTMLSpanElement | null)[]>([]);

  const [reduced] = useState(() => motionReduced());
  const [fit, setFit] = useState<Fit>(() => fitFor(1180));
  const [step, setStep] = useState(0);
  const [playing, setPlaying] = useState(!reduced);
  const [inView, setInView] = useState(false);
  const [shown, setShown] = useState(() => typeof document === 'undefined' || !document.hidden);

  /* The clock and what it has done so far in this step. Refs, not state: they
     change every frame and nothing React draws depends on them. */
  const t = useRef(0);
  const fired = useRef(0);
  const typing = useRef<Typing[]>([]);
  const travel = useRef<Move | null>(null);
  const hits = useRef<{ el: HTMLElement; until: number }[]>([]);
  const ptr = useRef({ x: 0, y: 0 });

  /* ── Size: one measurement per resize, never per frame ── */
  useLayoutEffect(() => {
    const el = screen.current;
    if (!el) return;
    const size = () => {
      const next = fitFor(el.clientWidth || 1180);
      setFit(f => (f.w === next.w && Math.abs(f.k - next.k) < 0.0005 ? f : next));
    };
    size();
    const ro = new ResizeObserver(size);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  /* ── Only while somebody can see it ── */
  useEffect(() => {
    const el = root.current;
    if (!el || typeof IntersectionObserver === 'undefined') { setInView(true); return; }
    const io = new IntersectionObserver(([e]) => setInView(e.isIntersecting), { threshold: 0.2 });
    io.observe(el);
    const vis = () => setShown(!document.hidden);
    document.addEventListener('visibilitychange', vis);
    return () => { io.disconnect(); document.removeEventListener('visibilitychange', vis); };
  }, []);

  const setPointer = useCallback((x: number, y: number) => {
    ptr.current = { x, y };
    const p = pointer.current;
    if (p) p.style.transform = `translate3d(${x.toFixed(2)}px, ${y.toFixed(2)}px, 0)`;
  }, []);

  const find = (k: string): HTMLElement[] => {
    const sc = scenes.current[step];
    return sc ? Array.from(sc.querySelectorAll<HTMLElement>(`[data-k="${k}"]`)) : [];
  };

  /** One cue, fired at `now` (ms into the step). `still` draws its end state with no movement. */
  const fire = (cue: Cue, now: number, still: boolean) => {
    const els = find(cue.k);
    const el = els[0];
    const cv = canvas.current;
    if (!el || !cv) return;
    if (cue.do === 'on') { els.forEach(e => e.classList.add('is-on')); return; }
    if (cue.do === 'type') {
      const chars = Array.from(el.querySelectorAll<HTMLElement>('.apd-c'));
      if (still) { chars.forEach(c => c.classList.add('is-on')); return; }
      typing.current.push({ at: now, ms: cue.ms, chars, shown: 0 });
      return;
    }
    if (cue.do === 'click') {
      el.classList.add('is-clicked');
      /* A part this design size leaves out gets no ring where the pointer is not. */
      if (still || !el.offsetParent) return;
      el.classList.add('is-hit');
      hits.current.push({ el, until: now + 700 });
      /* The ring is drawn where the pointer's tip is, and animated with the
         Web Animations API: transform and opacity only, no class juggling
         or forced reflow to restart a CSS animation. */
      const at = rippleAt.current, r = ripple.current;
      if (at && r) {
        at.style.transform = `translate3d(${ptr.current.x.toFixed(2)}px, ${ptr.current.y.toFixed(2)}px, 0)`;
        r.animate?.([{ transform: 'scale(0.2)', opacity: 0.9 }, { transform: 'scale(1)', opacity: 0 }], { duration: 620, easing: 'cubic-bezier(.2,.7,.3,1)' });
      }
      pointer.current?.animate?.([{ scale: '1' }, { scale: '0.86' }, { scale: '1' }], { duration: 240, easing: 'ease-out' });
      return;
    }
    /* move: to a point a little inside the target, from wherever the pointer is. */
    if (still) return;
    const b = boxIn(el, cv);
    if (!b.ok || (!b.w && !b.h)) return; // not drawn at this size (a wide-only part on a phone)
    const x1 = b.x + Math.min(b.w * 0.5, 120), y1 = b.y + b.h * 0.55;
    const { x: x0, y: y0 } = ptr.current;
    const dx = x1 - x0, dy = y1 - y0, len = Math.hypot(dx, dy) || 1;
    /* A gentle arc that bows upward, the way a wrist swings — a straight
       line at an even speed is what made the old pointer read as a robot. */
    let nx = -dy / len, ny = dx / len;
    if (ny > 0) { nx = -nx; ny = -ny; }
    const bow = Math.min(90, len * 0.16);
    /* A long reach takes longer: at a fixed duration the trip across the
       screen at the loop was a blur nobody's eye could follow. */
    const ms = Math.max(cue.ms, 350 + len * 0.85);
    travel.current = { at: now, ms, x0, y0, x1, y1, cx: (x0 + x1) / 2 + nx * bow, cy: (y0 + y1) / 2 + ny * bow };
  };

  /** Advances the step's drawing to time `now` (ms into the step). */
  const advance = (now: number) => {
    const cues = STEPS[step].cues;
    while (fired.current < cues.length && cues[fired.current].at <= now) {
      /* A click waits for the pointer to arrive — it never lands on a
         target the pointer has not reached — and the cues after it wait too. */
      if (cues[fired.current].do === 'click' && travel.current) break;
      fire(cues[fired.current++], now, false);
    }
    for (const ty of typing.current) {
      const n = Math.round(ty.chars.length * clamp01((now - ty.at) / ty.ms));
      if (n === ty.shown) continue;
      ty.chars[ty.shown - 1]?.classList.remove('is-caret');
      while (ty.shown < n) ty.chars[ty.shown++].classList.add('is-on');
      if (n < ty.chars.length) ty.chars[n - 1]?.classList.add('is-caret');
    }
    typing.current = typing.current.filter(ty => ty.shown < ty.chars.length);
    const m = travel.current;
    if (m) {
      const s = reach(clamp01((now - m.at) / m.ms)), u = 1 - s;
      setPointer(u * u * m.x0 + 2 * u * s * m.cx + s * s * m.x1, u * u * m.y0 + 2 * u * s * m.cy + s * s * m.y1);
      if (s >= 1) travel.current = null;
    }
    if (hits.current.length) {
      hits.current = hits.current.filter(h => (now < h.until ? true : (h.el.classList.remove('is-hit'), false)));
    }
    const f = fills.current[step];
    if (f) f.style.transform = `scaleX(${clamp01(now / STEPS[step].ms).toFixed(4)})`;
  };

  /* ── A step begins: its scene is cleared while invisible, then plays ── */
  useLayoutEffect(() => {
    const sc = scenes.current[step];
    if (!sc) return;
    /* Transitions off for the reset, or every part would visibly fade back
       out as its scene fades in. On again a frame later. */
    sc.classList.add('apd-reset');
    sc.querySelectorAll('.is-on, .is-clicked, .is-hit, .is-caret').forEach(e => e.classList.remove('is-on', 'is-clicked', 'is-hit', 'is-caret'));
    t.current = 0; fired.current = 0; typing.current = []; travel.current = null; hits.current = [];
    fills.current.forEach((f, i) => { if (f) f.style.transform = i < step ? 'scaleX(1)' : 'scaleX(0)'; });
    if (reduced) {
      STEPS[step].cues.forEach(c => fire(c, c.at, true));
      fills.current[step]?.style.setProperty('transform', 'scaleX(1)');
    }
    const raf = requestAnimationFrame(() => sc.classList.remove('apd-reset'));
    return () => cancelAnimationFrame(raf);
  // eslint-disable-next-line react-hooks/exhaustive-deps -- fire reads the step it was rendered with
  }, [step, fit.w, reduced]);

  /* The pointer starts low on the right, in view, the first time and after a resize to another design size. */
  useLayoutEffect(() => { setPointer(fit.w * 0.74, fit.h * 0.8); }, [fit.w, fit.h, setPointer]);

  /* ── The clock ── */
  const running = playing && inView && shown && !reduced;
  useEffect(() => {
    if (!running) return;
    let raf = 0;
    let last = performance.now();
    const tick = (now: number) => {
      /* A long gap (a dropped frame, a debugger) moves the story on by one
         frame's worth, not by the gap. */
      t.current += Math.min(50, now - last);
      last = now;
      advance(t.current);
      if (t.current >= STEPS[step].ms) { setStep(s => (s + 1) % STEPS.length); return; }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  // eslint-disable-next-line react-hooks/exhaustive-deps -- advance reads the current step
  }, [running, step]);

  const go = (i: number) => { setStep((i + STEPS.length) % STEPS.length); };
  const cur = STEPS[step];

  return (
    <section
      ref={root}
      className={`apd${fit.compact ? ' is-compact' : fit.w < 1200 ? ' is-mid' : ' is-big'}${reduced ? ' is-still' : ''}`}
      aria-roledescription="video"
      aria-label="AI Autopilot, step by step — an illustration with an example business"
    >
      <div className="apd-screen" ref={screen}>
        <div
          className="apd-canvas"
          ref={canvas}
          style={{ width: fit.w, height: fit.h, transform: `scale(${fit.k})` }}
          aria-hidden="true"
        >
          <div className="apd-app">
            <header className="apd-top">
              <LogoMark size={fit.compact ? 20 : 22} />
              <b className="apd-brand">Protected Central</b>
              <span className="apd-crumbs">
                {STEPS.map((s, i) => (
                  <span key={s.title} className={`apd-crumb${i === step ? ' is-now' : ''}`}>
                    {s.rail === 'autopilot' ? <>AI Autopilot <ChevronRight size={13} /> </> : null}{s.crumb}
                  </span>
                ))}
              </span>
              {/* Said in the frame itself, so a screenshot of it says it too. */}
              <span className="apd-ex">Illustration · example business</span>
            </header>
            <div className="apd-body">
              <nav className="apd-rail">
                <span className="apd-rail-i"><LayoutDashboard size={17} /><i>Dashboard</i></span>
                <span className={`apd-rail-i${cur.rail === 'autopilot' ? ' is-now' : ''}`}><Sparkles size={17} /><i>AI Autopilot</i></span>
                <span className={`apd-rail-i${cur.rail === 'conversations' ? ' is-now' : ''}`}><MessageSquare size={17} /><i>Conversations</i></span>
                <span className="apd-rail-i"><Calendar size={17} /><i>Calendar</i></span>
                <span className={`apd-rail-i${cur.rail === 'marketing' ? ' is-now' : ''}`}><Mail size={17} /><i>Marketing</i></span>
              </nav>
              <div className="apd-main">
                {/* 1 · Business details */}
                <section className={`apd-scene apd-s1${step === 0 ? ' is-now' : ''}`} ref={e => { scenes.current[0] = e; }}>
                  <div className="apd-card apd-form">
                    <div className="apd-card-h">
                      <span className="apd-ic is-ai"><Sparkles size={16} /></span>
                      <span><b>New AI Autopilot business workspace</b><small>Tell it about the business — it builds the rest.</small></span>
                    </div>
                    <Field k="f1" label="Business name" ph="Your business" text="Brightside Plumbing" />
                    <Field k="f2" label="What you sell" ph="Your services" text="Emergency repairs and water-heater installs" />
                    <Field k="f3" label="Who your customers are" ph="Who you serve, and where" text="Homeowners in Tucson, Arizona" />
                    <Field k="f4" label="Website" ph="yourbusiness.com" text="brightside-plumbing.example" wide />
                    <div className="apd-form-foot">
                      <span className="apd-btn is-primary apd-t apd-go" data-k="go">
                        <span className="apd-go-a"><Sparkles size={15} /> Build my plan</span>
                        <span className="apd-go-b"><Loader size={15} className="apd-spin" /> Building…</span>
                      </span>
                    </div>
                  </div>
                  <aside className="apd-card apd-will">
                    <b className="apd-will-h">What AI Autopilot will build</b>
                    <ul>
                      {WILL.map(([k, text]) => (
                        <li key={k} className="apd-will-i" data-k={k}><span className="apd-tick"><Check size={12} strokeWidth={3} /></span><span>{text}</span></li>
                      ))}
                    </ul>
                  </aside>
                </section>

                {/* 2 · The 12-month plan */}
                <section className={`apd-scene apd-s2${step === 1 ? ' is-now' : ''}`} ref={e => { scenes.current[1] = e; }}>
                  <div className="apd-card apd-plan apd-r" data-k="plan">
                    <div className="apd-card-h">
                      <span className="apd-ic is-ai"><Calendar size={16} /></span>
                      <span><b>12-month marketing plan</b><small>Written from your brief. Every agent works to the month’s theme.</small></span>
                    </div>
                    <div className="apd-months">
                      {MONTHS.map(([m, theme], i) => (
                        <div key={m} className={`apd-month apd-r${i === 6 ? ' apd-t' : ''}`} data-k={`m${i}`}>
                          <b>{m}</b><span>{theme}</span>
                        </div>
                      ))}
                    </div>
                    <div className="apd-detail apd-r" data-k="detail">
                      <b>July · Monsoon drain prep</b>
                      <span className="apd-detail-i apd-r" data-k="d1"><Mail size={14} /> Emails to past customers about drain checks</span>
                      <span className="apd-detail-i apd-r" data-k="d2"><Share2 size={14} /> Social posts with monsoon tips</span>
                      <span className="apd-detail-i apd-r" data-k="d3"><FileText size={14} /> A blog article on getting drains ready</span>
                    </div>
                  </div>
                </section>

                {/* 3 · Workflows and the emails in them */}
                <section className={`apd-scene apd-s3${step === 2 ? ' is-now' : ''}`} ref={e => { scenes.current[2] = e; }}>
                  <div className="apd-card apd-flow">
                    <div className="apd-card-h"><span className="apd-ic is-ai"><GitBranch size={16} /></span><span><b>Workflow · New enquiry follow-up</b><small>Built by AI Autopilot</small></span></div>
                    <div className="apd-nodes">
                      {FLOW.map((n, i) => (
                        <div key={n.k} className="apd-node-wrap">
                          {i > 0 && <span className="apd-edge" data-k={`e${i - 1}`} />}
                          <div className={`apd-node apd-r is-${n.tone}${i === 4 ? ' apd-t' : ''}`} data-k={n.k}>
                            <span className="apd-node-ic"><n.icon size={15} /></span>
                            <span className="apd-node-t"><b>{n.h}</b><small>{n.s}</small></span>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                  <div className="apd-card apd-mail apd-r" data-k="mail">
                    <div className="apd-mail-h"><Mail size={15} /> <b>Send follow-up email</b><span className="apd-pill">Written by AI</span></div>
                    <div className="apd-mail-row"><span>Subject</span><Typed k="subj" text="Still need a hand with that leak?" /></div>
                    <p className="apd-mail-body">
                      <Typed k="body" text="Hi there, just checking in after your enquiry about the leak. We can come out this week — reply to this email and we will find a time that suits you." />
                    </p>
                    <div className="apd-hold apd-r" data-k="hold"><ShieldCheck size={15} /> Waits for your OK before it sends</div>
                  </div>
                </section>

                {/* 4 · Posts on the schedule */}
                <section className={`apd-scene apd-s4${step === 3 ? ' is-now' : ''}`} ref={e => { scenes.current[3] = e; }}>
                  <div className="apd-card apd-week" data-k="week">
                    <div className="apd-card-h">
                      <span className="apd-ic is-ai"><Calendar size={16} /></span>
                      <span><b>Scheduled posts · this week</b><small>Social posts and blog posts, written to July’s theme</small></span>
                      <span className="apd-btn is-primary apd-t apd-sched" data-k="sched"><Check size={15} /> Approve &amp; schedule</span>
                    </div>
                    <div className="apd-days">
                      {POSTS.map((p, i) => (
                        <div key={p.k} className={`apd-day${i > 2 ? ' apd-wide-only' : ''}`}>
                          <span className="apd-day-h">{p.day}</span>
                          <div className="apd-post apd-r" data-k={p.k} style={{ '--i': i } as CSSProperties}>
                            <span className="apd-post-k"><p.icon size={13} /> {p.kind}</span>
                            <b>{p.h}</b>
                            <span className="apd-post-s">
                              <span className="apd-st-a"><Clock size={12} /> 9:00 am · Draft</span>
                              <span className="apd-st-b"><Check size={12} strokeWidth={3} /> Scheduled</span>
                            </span>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                </section>

                {/* 5 · Replies, held for your OK */}
                <section className={`apd-scene apd-s5${step === 4 ? ' is-now' : ''}`} ref={e => { scenes.current[4] = e; }}>
                  <div className="apd-card apd-inbox">
                    <div className="apd-card-h"><span className="apd-ic"><Inbox size={16} /></span><span><b>Inbox</b><small>Replies to what Autopilot sent</small></span></div>
                    {INBOX.map((r, i) => (
                      <div key={r.k} className={`apd-msg apd-r${i === 0 ? ' apd-t' : ''}${i === 2 ? ' apd-wide-only' : ''}`} data-k={r.k}>
                        <span className="apd-dot" />
                        <span className="apd-msg-t"><b>{r.subj}</b><span>{r.msg}</span></span>
                      </div>
                    ))}
                  </div>
                  <div className="apd-card apd-reply apd-r" data-k="reply">
                    <div className="apd-mail-h"><Sparkles size={15} /> <b>Reply waiting for your OK</b></div>
                    <blockquote>Yes please — is Thursday morning possible?</blockquote>
                    <p className="apd-mail-body"><Typed k="draft" text="Thursday morning works. We can be with you between 9 and 11 — shall we book that in?" /></p>
                    <div className="apd-reply-foot">
                      <span className="apd-btn">Edit</span>
                      <span className="apd-btn is-primary apd-t" data-k="send"><Send size={14} /> Send</span>
                    </div>
                    <div className="apd-sent apd-r" data-k="sent"><Check size={14} strokeWidth={3} /> Sent from your own mailbox</div>
                  </div>
                  <div className="apd-badges">
                    <span className="apd-badge apd-r" data-k="b1"><Inbox size={15} /> Replies arrive in your inbox</span>
                    <span className="apd-badge apd-r" data-k="b2"><ShieldCheck size={15} /> Nothing sends until you approve it</span>
                  </div>
                </section>
              </div>
            </div>
          </div>
          <div className="apd-ripple-at" ref={rippleAt}><span className="apd-ripple" ref={ripple} /></div>
          <div className="apd-ptr" ref={pointer}>
            <svg viewBox="0 0 24 24" width="26" height="26"><path d="M4 2.5 L4 19.5 L8.6 15.4 L11.5 21.8 L14.6 20.4 L11.8 14.2 L18 14.2 Z" fill="#0f1115" stroke="#fff" strokeWidth="1.6" strokeLinejoin="round" /></svg>
          </div>
        </div>
      </div>

      <div className="apd-bar">
        <div className="apd-ctls">
          {reduced && <button type="button" className="apd-ctl" onClick={() => go(step - 1)} aria-label="Previous step"><SkipBack size={15} /></button>}
          {!reduced && (
            <button type="button" className="apd-ctl is-play" onClick={() => setPlaying(v => !v)} aria-label={playing ? 'Pause' : 'Play'}>
              {playing ? <Pause size={16} fill="currentColor" /> : <Play size={16} fill="currentColor" />}
            </button>
          )}
          {reduced && <button type="button" className="apd-ctl" onClick={() => go(step + 1)} aria-label="Next step"><SkipForward size={15} /></button>}
        </div>
        <div className="apd-info">
          <ol className="apd-chips">
            {STEPS.map((s, i) => (
              <li key={s.title}>
                <button
                  type="button"
                  className={`apd-chip${i === step ? ' is-now' : ''}${i < step ? ' is-done' : ''}`}
                  onClick={() => go(i)}
                  aria-label={`Step ${i + 1}: ${s.title}`}
                  aria-current={i === step ? 'step' : undefined}
                >
                  <span className="apd-chip-l"><i>{i + 1}</i><span>{s.title}</span></span>
                  <span className="apd-chip-track"><span ref={e => { fills.current[i] = e; }} /></span>
                </button>
              </li>
            ))}
          </ol>
          <p className="apd-cap" aria-live={running ? 'off' : 'polite'}>
            <b>Step {step + 1} · {cur.title}.</b> {cur.caption}
          </p>
        </div>
      </div>
    </section>
  );
}
