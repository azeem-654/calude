/**
 * Protron — the AI business manager in the corner of every screen.
 *
 * ── What this file is ──
 *
 * The launcher (the helmet), its offers of help, and the door to the panel.
 * It is mounted once in the signed-in shell (App.tsx), so it survives moving
 * between screens and the conversation goes with it. The panel itself —
 * chat, actions, voice — is a separate download (`ProtronPanel.tsx`) fetched
 * the first time somebody opens it: the face costs every page ~3 KB, the rest
 * only the people who use it.
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
 * ── Offering help without nagging ──
 *
 * Protron offers, never acts. It speaks up only when:
 *   - something just failed on this screen (fieldGuard's TROUBLE_EVENT),
 *   - the same dialog has been opened and closed three times in two minutes,
 *   - nothing has been touched for two minutes on a screen somebody has been
 *     on for at least that long, with the tab in front of them.
 * Each kind at most once per screen per session, never twice within ten
 * minutes, never while its panel is open or the human-help card is showing,
 * at most three times a day — and "Don't offer again" turns it off for good
 * (also in the panel's menu). Reading is not being stuck: scrolling or moving
 * the pointer counts as activity.
 */
import { lazy, Suspense, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useLocation } from 'react-router-dom';
import { getSession } from '../../services/auth';
import { TROUBLE_EVENT } from '../../services/fieldGuard';
import { screenContext } from '../../services/protron/knowledge';
import { loadPrefs, savePrefs, type Prefs } from '../../services/protron/memory';
import type { Who } from '../../services/protron/actions';
import { PROTRON_OPEN } from '../../services/protron/open';
import ProtronAvatar, { type AvatarState } from './ProtronAvatar';
import './protron.css';

const ProtronPanel = lazy(() => import('./ProtronPanel'));


const IDLE_MS = 120_000;
const COOLDOWN_MS = 10 * 60_000;
const MAX_A_DAY = 3;

type Offer = { why: 'trouble' | 'idle' | 'loop'; path: string };

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

function offerAllowed(kind: string, path: string): boolean {
  try {
    const day = new Date().toISOString().slice(0, 10);
    const last = Number(sessionStorage.getItem('pc_protron_last_offer') || 0);
    if (Date.now() - last < COOLDOWN_MS) return false;
    if (sessionStorage.getItem(`pc_protron_offer_${kind}_${path}`)) return false;
    const n = Number(localStorage.getItem(`pc_protron_offers_${day}`) || 0);
    return n < MAX_A_DAY;
  } catch { return false; }
}
function markOffered(kind: string, path: string): void {
  try {
    const day = new Date().toISOString().slice(0, 10);
    sessionStorage.setItem('pc_protron_last_offer', String(Date.now()));
    sessionStorage.setItem(`pc_protron_offer_${kind}_${path}`, '1');
    localStorage.setItem(`pc_protron_offers_${day}`, String(Number(localStorage.getItem(`pc_protron_offers_${day}`) || 0) + 1));
  } catch { /* private mode: offered once more, at worst */ }
}

export default function Protron() {
  const session = getSession();
  const who: Who = useMemo(() => ({
    isClient: session?.user.role === 'client',
    isOwner: !!session && session.user.accountId == null && session.user.role === 'agency',
  // eslint-disable-next-line react-hooks/exhaustive-deps -- the two fields are what decide it; the session object is new on every read
  }), [session?.user.role, session?.user.accountId]);
  const loc = useLocation();
  const [prefs, setPrefsState] = useState<Prefs>(loadPrefs);
  const setPrefs = useCallback((p: Prefs) => { setPrefsState(p); savePrefs(p); }, []);
  const [open, setOpen] = useState(false);
  const [everOpened, setEverOpened] = useState(false);
  const [size, setSize] = useState<'normal' | 'large'>('normal');
  const [face, setFace] = useState<AvatarState>('idle');
  const [seed, setSeed] = useState<{ message?: string; intro?: string; n: number } | null>(null);
  const [offer, setOffer] = useState<Offer | null>(null);
  const modalOpen = useModalOpen();
  const here = screenContext(loc.pathname, who);

  const show = useCallback((s?: { message?: string; intro?: string }) => {
    setOpen(true);
    setEverOpened(true);
    setOffer(null);
    if (s && (s.message || s.intro)) setSeed(prev => ({ ...s, n: (prev?.n ?? 0) + 1 }));
  }, []);

  /* Opened from elsewhere in the app (the wizard's "Plan it with Protron", a link). */
  useEffect(() => {
    const on = (e: Event) => show({ message: (e as CustomEvent<{ message?: string }>).detail?.message });
    window.addEventListener(PROTRON_OPEN, on);
    return () => window.removeEventListener(PROTRON_OPEN, on);
  }, [show]);

  /* ── Offers of help ── */
  const canOffer = prefs.proactive && !open;
  const propose = useCallback((why: Offer['why']) => {
    const path = window.location.pathname;
    if (!offerAllowed(why, path)) return;
    /* The human-help card is already asking. */
    if (document.querySelector('[role="dialog"][aria-label="Help with this screen"]')) return;
    markOffered(why, path);
    setOffer({ why, path });
  }, []);

  useEffect(() => {
    if (!canOffer) return;
    const onTrouble = () => propose('trouble');
    window.addEventListener(TROUBLE_EVENT, onTrouble);
    return () => window.removeEventListener(TROUBLE_EVENT, onTrouble);
  }, [canOffer, propose]);

  /* The same dialog opened and closed again and again. */
  const opens = useRef<number[]>([]);
  const wasModal = useRef(false);
  useEffect(() => {
    if (modalOpen && !wasModal.current) {
      const now = Date.now();
      opens.current = [...opens.current.filter(t => now - t < 120_000), now];
      if (canOffer && opens.current.length >= 3) { opens.current = []; propose('loop'); }
    }
    wasModal.current = modalOpen;
  }, [modalOpen, canOffer, propose]);
  useEffect(() => { opens.current = []; }, [loc.pathname]);

  /* Two minutes untouched, tab in front, on a screen they have been on that long. */
  useEffect(() => {
    if (!canOffer) return;
    let last = Date.now();
    const arrived = Date.now();
    const touch = () => { last = Date.now(); };
    const evs = ['pointerdown', 'pointermove', 'keydown', 'wheel', 'touchstart', 'scroll'] as const;
    evs.forEach(e => window.addEventListener(e, touch, { passive: true, capture: true }));
    const timer = window.setInterval(() => {
      if (document.visibilityState !== 'visible') { last = Date.now(); return; }
      const now = Date.now();
      if (now - last >= IDLE_MS && now - arrived >= IDLE_MS) { window.clearInterval(timer); propose('idle'); }
    }, 10_000);
    return () => { window.clearInterval(timer); evs.forEach(e => window.removeEventListener(e, touch, { capture: true })); };
  }, [canOffer, propose, loc.pathname]);

  /* An offer belongs to the screen it was made on. */
  useEffect(() => { setOffer(o => (o && o.path !== loc.pathname ? null : o)); }, [loc.pathname]);

  /* ── Dragging the launcher ── */
  const drag = useRef<{ x: number; y: number; moved: boolean } | null>(null);
  const [dockPx, setDockPx] = useState<{ left: number; top: number } | null>(null);
  useEffect(() => {
    const place = () => {
      if (!prefs.dock) { setDockPx(null); return; }
      setDockPx({ left: Math.round(prefs.dock.x * (window.innerWidth - 64)), top: Math.round(prefs.dock.y * (window.innerHeight - 64)) });
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
    setDockPx({ left: Math.max(0, Math.min(window.innerWidth - 64, e.clientX - 30)), top: Math.max(0, Math.min(window.innerHeight - 64, e.clientY - 30)) });
  };
  const onPointerUp = (e: React.PointerEvent<HTMLButtonElement>) => {
    const d = drag.current;
    drag.current = null;
    e.currentTarget.dataset.dragging = '0';
    if (d?.moved && dockPx) {
      setPrefs({ ...prefs, dock: { x: dockPx.left / Math.max(1, window.innerWidth - 64), y: dockPx.top / Math.max(1, window.innerHeight - 64) } });
    } else {
      show();
    }
  };

  if (!session) return null;

  const aside = modalOpen && !open;
  const launcherStyle = !aside && dockPx ? { left: dockPx.left, top: dockPx.top, bottom: 'auto' } : undefined;
  const offerText = offer?.why === 'trouble' ? 'That did not go through. Want me to look at it with you?'
    : offer?.why === 'loop' ? 'Going back and forth with this? Tell me what you are trying to do and I will walk you through it.'
      : `Need a hand with ${here.label}? Tell me what you are trying to accomplish.`;

  return (
    <>
      {!open && (
        <div className="pt-launch" data-aside={aside ? '1' : '0'} style={launcherStyle}>
          <button
            type="button"
            className="pt-orb"
            aria-label="Open Protron, your AI business manager"
            title="Protron — your AI business manager (drag to move)"
            onPointerDown={onPointerDown}
            onPointerMove={onPointerMove}
            onPointerUp={onPointerUp}
            /* A keyboard or screen-reader press arrives as a click with no
               pointer behind it (detail 0); a pointer press is handled on up,
               where a drag can be told from a tap. */
            onClick={e => { if (e.detail === 0) show(); }}
          >
            <ProtronAvatar size={aside ? 34 : 50} state={face} />
            {offer && <span className="pt-orb-dot" aria-hidden />}
          </button>
          <span className="pt-name">Protron</span>
        </div>
      )}

      {offer && !open && !aside && (
        <div className="pt-bubble" role="status" style={launcherStyle ? { left: launcherStyle.left, bottom: 'auto', top: Math.max(8, (launcherStyle.top as number) - 120) } : undefined}>
          <b style={{ display: 'block', marginBottom: 2 }}>Protron</b>
          {offerText}
          <div className="pt-bubble-row">
            <button type="button" className="pt-yes" onClick={() => show({ intro: offer.why === 'trouble'
              ? `Something on ${here.label} did not go through. Tell me what you were doing and I will help you finish it — or ask me to open the right screen.`
              : `You're on ${here.label}. What are you trying to get done? I can explain it, open the right screen or set things up with you.` })}>Yes, help me</button>
            <button type="button" onClick={() => setOffer(null)}>Not now</button>
            <button type="button" onClick={() => { setOffer(null); setPrefs({ ...prefs, proactive: false }); }}>Don&rsquo;t offer again</button>
          </div>
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
            onClose={() => setOpen(false)}
          />
        </Suspense>
      )}
    </>
  );
}
