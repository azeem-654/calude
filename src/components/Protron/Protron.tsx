/**
 * Protron — the AI business manager in the corner of every screen.
 *
 * ── What this file is ──
 *
 * The launcher (the robot face), its offers of help, and the door to the panel.
 * It is mounted once in the signed-in shell (App.tsx), so it survives moving
 * between screens and the conversation goes with it. The panel itself —
 * chat, actions, voice — is a separate download (`ProtronPanel.tsx`) fetched
 * the first time somebody opens it: the face costs every page ~3 KB, the rest
 * only the people who use it.
 *
 * ── How it looks ──
 *
 * The owner's example (2026-11-12, fourth pass): a frosted lavender tile
 * holding a glowing violet orb with the robot's portrait in it, alive — a
 * turning ring of colour light, a breathing glow tinted by what Protron is
 * doing, sparks circling (protron.css). The portrait is the same one the
 * panel and the wizard's live talk show.
 *
 * ── Where it sits ──
 *
 * Bottom left. The bottom right belongs to the Help widget and the owner's
 * notices (HelpLauncher, CornerHelp), and two round buttons in one corner are
 * one too many. It can be dragged anywhere and remembers where; while a
 * dialog is open it steps to the middle of the left edge, small, because a
 * wizard's Back button lives in the bottom-left corner (the same lesson
 * CornerHelp learned covering "Continue").
 *
 * ── Speaking first ──
 *
 * The owner's brief: when somebody stops — nothing touched for ten seconds
 * (the default; 30 s, 2 min or off in the panel's menu) — Protron opens
 * beside the face and starts the conversation: it reads the screen's shape
 * (screen.ts — headings, empty boxes, error messages; never what was typed),
 * says what the person seems to be doing and what may be in the way, and
 * offers ways to help (brain.ts `thinkAhead`). It also speaks up when
 * something on the screen just failed (fieldGuard's TROUBLE_EVENT or an
 * uncaught error), when the screen froze for a few seconds, and when the same
 * dialog was opened and closed three times in two minutes.
 *
 * It offers; it never acts on its own. Kept from nagging: once per screen per
 * visit (moving to another screen re-arms it), never within 45 seconds of the
 * last time, at most 30 a day, never while its panel is open, the tab is in
 * the background or the human-help card is up — and "Don't start chats" on
 * the message, or the panel's menu, turns it off.
 */
import { lazy, Suspense, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useLocation } from 'react-router-dom';
import { AudioLines } from 'lucide-react';
import { getSession } from '../../services/auth';
import { TROUBLE_EVENT } from '../../services/fieldGuard';
import { loadPrefs, savePrefs, type Prefs } from '../../services/protron/memory';
import type { Who } from '../../services/protron/actions';
import { PROTRON_OPEN } from '../../services/protron/open';
import ProtronAvatar, { type AvatarState } from './ProtronAvatar';
import ProtronCursor from './ProtronCursor';
import type { AutoWhy, Seed } from './ProtronPanel';
import './protron.css';
import { featureReady } from '../../services/features';

const ProtronPanel = lazy(() => import('./ProtronPanel'));


const GAP_MS = 45_000;
const MAX_A_DAY = 30;
/** A heartbeat this late means the page's main thread was stuck. */
const FROZE_MS = 4000;

function useModalOpen(): boolean {
  const [open, setOpen] = useState(false);
  useEffect(() => {
    const check = () => setOpen(!!document.querySelector('[aria-modal="true"]'));
    check();
    const mo = new MutationObserver(check);
    mo.observe(document.body, { childList: true, subtree: true, attributes: true, attributeFilter: ['aria-modal'] });
    return () => mo.disconnect();
  }, []);
  return open;
}

function autoAllowed(): boolean {
  try {
    const day = new Date().toISOString().slice(0, 10);
    if (Date.now() - Number(sessionStorage.getItem('pc_protron_last_auto') || 0) < GAP_MS) return false;
    return Number(localStorage.getItem(`pc_protron_autos_${day}`) || 0) < MAX_A_DAY;
  } catch { return false; }
}
function markAuto(): void {
  try {
    const day = new Date().toISOString().slice(0, 10);
    sessionStorage.setItem('pc_protron_last_auto', String(Date.now()));
    localStorage.setItem(`pc_protron_autos_${day}`, String(Number(localStorage.getItem(`pc_protron_autos_${day}`) || 0) + 1));
  } catch { /* private mode: at worst once more */ }
}

/* The incubator (services/features.ts, docs/INCUBATOR.md): read once — the
   hostname does not change under a running page. */
const LIVE_TALK = featureReady('protron-live');
const HANDS = featureReady('protron-hands');
const ACTS = featureReady('protron-acts');
const SPEAKS_FIRST = featureReady('protron-speaks-first');

export default function Protron() {
  const session = getSession();
  const who: Who = useMemo(() => ({
    isClient: session?.user.role === 'client',
    isOwner: !!session && session.user.accountId == null && session.user.role === 'agency',
    hands: HANDS,
    acts: ACTS,
  // eslint-disable-next-line react-hooks/exhaustive-deps -- the two fields are what decide it; the session object is new on every read
  }), [session?.user.role, session?.user.accountId]);
  const loc = useLocation();
  const [prefs, setPrefsState] = useState<Prefs>(loadPrefs);
  const setPrefs = useCallback((p: Prefs) => { setPrefsState(p); savePrefs(p); }, []);
  const [open, setOpen] = useState(false);
  const [everOpened, setEverOpened] = useState(false);
  const [size, setSize] = useState<'normal' | 'large'>('normal');
  const [face, setFace] = useState<AvatarState>('idle');
  const [seed, setSeed] = useState<Seed | null>(null);
  const modalOpen = useModalOpen();

  const show = useCallback((s?: Omit<Seed, 'n'>) => {
    setOpen(true);
    setEverOpened(true);
    if (s && (s.message || s.intro || s.talk || s.auto)) setSeed(prev => ({ ...s, n: (prev?.n ?? 0) + 1 }));
  }, []);

  /* Arriving from Protron's campaign alert (lib/protronWatch.ts): the email's
     button opens the app with `?protron=optimise&campaign=<name>`, and the
     request is written for the customer here. Only letters, digits and a few
     marks of the name are kept, and it goes in as the customer's message —
     Protron then proposes the change and waits for their approval, so a
     crafted link can at most put a sentence in their box. */
  useEffect(() => {
    const q = new URLSearchParams(window.location.search);
    if (q.get('protron') !== 'optimise') return;
    const name = (q.get('campaign') ?? '').replace(/[^\p{L}\p{N} '&.,:-]/gu, '').trim().slice(0, 80);
    q.delete('protron'); q.delete('campaign');
    window.history.replaceState(null, '', `${window.location.pathname}${q.toString() ? `?${q}` : ''}${window.location.hash}`);
    show({ message: `You told me replies on ${name ? `“${name}”` : 'one of my campaigns'} are lower than expected. Yes — show me what you would change to get more responses, and I'll approve it.` });
  }, [show]);

  /* Opened from elsewhere in the app (the wizard's "Plan it with Protron", a link). */
  useEffect(() => {
    const on = (e: Event) => show({ message: (e as CustomEvent<{ message?: string }>).detail?.message });
    window.addEventListener(PROTRON_OPEN, on);
    return () => window.removeEventListener(PROTRON_OPEN, on);
  }, [show]);

  /* ── Speaking first ── */
  /* Parked (owner, 2026-11-14): Protron opens only when it is clicked. */
  const canSpeakFirst = SPEAKS_FIRST && prefs.proactive && prefs.idleSeconds > 0 && !open;
  const spokenHere = useRef('');
  const speakFirst = useCallback((why: AutoWhy) => {
    const path = window.location.pathname;
    if (why === 'idle' && spokenHere.current === path) return;
    if (document.visibilityState !== 'visible' || !autoAllowed()) return;
    /* The human-help card is already asking. */
    if (document.querySelector('[role="dialog"][aria-label="Help with this screen"]')) return;
    spokenHere.current = path;
    markAuto();
    show({ auto: why });
  }, [show]);
  useEffect(() => { spokenHere.current = ''; }, [loc.pathname]);

  useEffect(() => {
    if (!SPEAKS_FIRST || !prefs.proactive || open) return;
    const onTrouble = () => speakFirst('trouble');
    const onError = (e: ErrorEvent) => { if (e.error instanceof Error) speakFirst('trouble'); };
    window.addEventListener(TROUBLE_EVENT, onTrouble);
    window.addEventListener('error', onError);
    return () => { window.removeEventListener(TROUBLE_EVENT, onTrouble); window.removeEventListener('error', onError); };
  }, [prefs.proactive, open, speakFirst]);

  /* The same dialog opened and closed again and again. */
  const opens = useRef<number[]>([]);
  const wasModal = useRef(false);
  useEffect(() => {
    if (modalOpen && !wasModal.current) {
      const now = Date.now();
      opens.current = [...opens.current.filter(t => now - t < 120_000), now];
      if (canSpeakFirst && opens.current.length >= 3) { opens.current = []; speakFirst('loop'); }
    }
    wasModal.current = modalOpen;
  }, [modalOpen, canSpeakFirst, speakFirst]);
  useEffect(() => { opens.current = []; }, [loc.pathname]);

  /* Nothing touched for the chosen time, tab in front; and a page that froze. */
  useEffect(() => {
    if (!canSpeakFirst) return;
    const idleMs = prefs.idleSeconds * 1000;
    let last = Date.now();
    let beat = Date.now();
    const touch = () => { last = Date.now(); };
    const evs = ['pointerdown', 'pointermove', 'keydown', 'wheel', 'touchstart', 'scroll', 'input'] as const;
    evs.forEach(e => window.addEventListener(e, touch, { passive: true, capture: true }));
    const timer = window.setInterval(() => {
      const now = Date.now();
      const late = now - beat;
      beat = now;
      if (document.visibilityState !== 'visible') { last = now; return; }
      if (late > FROZE_MS) { speakFirst('froze'); return; }
      if (now - last >= idleMs) speakFirst('idle');
    }, 1000);
    return () => { window.clearInterval(timer); evs.forEach(e => window.removeEventListener(e, touch, { capture: true })); };
  }, [canSpeakFirst, prefs.idleSeconds, speakFirst, loc.pathname]);

  /* ── Dragging the launcher ── */
  const drag = useRef<{ x: number; y: number; moved: boolean } | null>(null);
  const [dockPx, setDockPx] = useState<{ left: number; top: number } | null>(null);
  useEffect(() => {
    const place = () => {
      if (!prefs.dock) { setDockPx(null); return; }
      setDockPx({ left: Math.round(prefs.dock.x * (window.innerWidth - 72)), top: Math.round(prefs.dock.y * (window.innerHeight - 72)) });
    };
    place();
    window.addEventListener('resize', place);
    return () => window.removeEventListener('resize', place);
  }, [prefs.dock]);

  const onPointerDown = (e: React.PointerEvent<HTMLButtonElement>) => {
    drag.current = { x: e.clientX, y: e.clientY, moved: false };
    e.currentTarget.setPointerCapture(e.pointerId);
  };
  const onPointerMove = (e: React.PointerEvent<HTMLButtonElement>) => {
    const d = drag.current;
    if (!d) return;
    if (!d.moved && Math.hypot(e.clientX - d.x, e.clientY - d.y) < 6) return;
    d.moved = true;
    e.currentTarget.dataset.dragging = '1';
    setDockPx({ left: Math.max(0, Math.min(window.innerWidth - 72, e.clientX - 35)), top: Math.max(0, Math.min(window.innerHeight - 72, e.clientY - 35)) });
  };
  const onPointerUp = (e: React.PointerEvent<HTMLButtonElement>) => {
    const d = drag.current;
    drag.current = null;
    e.currentTarget.dataset.dragging = '0';
    if (d?.moved && dockPx) {
      setPrefs({ ...prefs, dock: { x: dockPx.left / Math.max(1, window.innerWidth - 72), y: dockPx.top / Math.max(1, window.innerHeight - 72) } });
    } else {
      show();
    }
  };

  const aside = modalOpen && !open;
  const anchor = useMemo(() => (aside ? { left: 0, top: Math.round(window.innerHeight / 2 - 21) } : dockPx ?? null),
  // eslint-disable-next-line react-hooks/exhaustive-deps -- by value, so the panel is not moved on every render
  [aside, dockPx?.left, dockPx?.top]);

  if (!session) return null;

  const launcherStyle = !aside && dockPx ? { left: dockPx.left, top: dockPx.top, bottom: 'auto' } : undefined;

  return (
    <>
      {!open && (
        <div className="pt-launch" data-no-shot data-aside={aside ? '1' : '0'} style={launcherStyle}>
          <button
            type="button"
            className="pt-orb"
            data-state={face}
            aria-label="Open Protron, your AI Live Business Manager"
            title="Protron — your AI Live Business Manager (drag to move it anywhere)"
            onPointerDown={onPointerDown}
            onPointerMove={onPointerMove}
            onPointerUp={onPointerUp}
            /* A keyboard or screen-reader press arrives as a click with no
               pointer behind it (detail 0); a pointer press is handled on up,
               where a drag can be told from a tap. */
            onClick={e => { if (e.detail === 0) show(); }}
          >
            <span className="pt-orb-halo" aria-hidden />
            <span className="pt-orb-glow" aria-hidden />
            {!aside && <span className="pt-orb-sparks" aria-hidden><i /><i /><i /></span>}
            <span className="pt-orb-core"><ProtronAvatar size={aside ? 32 : 44} state={face} /></span>
          </button>
          {!aside && LIVE_TALK && (
            <button type="button" className="pt-talk" aria-label="Talk to Protron" title="Talk to Protron, hands-free" onClick={() => show({ talk: true })}>
              <AudioLines size={15} />
            </button>
          )}
          <span className="pt-name">Protron</span>
          {/* The owner's words for what it is, always on show under the tile. */}
          {!aside && <span className="pt-caption" aria-hidden>{LIVE_TALK ? 'AI Live Business Manager' : 'AI Business Manager'}</span>}
        </div>
      )}

      {everOpened && (
        <Suspense fallback={null}>
          <ProtronPanel
            open={open}
            who={who}
            size={size}
            onSize={setSize}
            prefs={prefs}
            onPrefs={setPrefs}
            face={face}
            onFace={setFace}
            seed={seed}
            anchor={anchor}
            onClose={() => setOpen(false)}
          />
        </Suspense>
      )}
      {everOpened && HANDS && <ProtronCursor />}
    </>
  );
}
