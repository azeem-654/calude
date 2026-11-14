/**
 * Protron's panel: the conversation, the actions it proposes, and voice.
 *
 * Loaded the first time Protron is opened (Protron.tsx), then kept mounted
 * while hidden so a half-typed message or a waiting confirmation survives
 * minimising. The conversation is kept per person and workspace, in this
 * browser and on the server (services/protron/memory.ts, sync.ts), so it
 * survives moving between screens, reloads and moving to another device.
 *
 * ── Where it floats ──
 *
 * Beside the launcher, wherever the launcher was dragged: to its right when there
 * is room, else to its left, clamped inside the window. The header drags the
 * panel itself. On a phone it is the whole screen, as before.
 *
 * ── A turn ──
 *
 *   1. The customer types or speaks. Speech goes through the same recorder and
 *      transcriber as the Autopilot box; a transcript the engine doubts is put
 *      in the box to be checked instead of being sent.
 *   2. The screen's shape is read (screen.ts: headings, boxes, messages —
 *      never values) and `think` (brain.ts) asks the AI through /api/ai.php for
 *      a reply and proposed actions — or matches the words itself when the AI
 *      is down, and says why.
 *   3. Every proposed action is checked (`checkCall`). Refused ones show as a
 *      refused card with the reason. Read-only and reversible ones run at once;
 *      anything that creates or spends waits on a card with Confirm and Cancel,
 *      checked again when Confirm is pressed. A running card lists its steps
 *      and ticks them off live while the screen behind it changes; one that
 *      filled boxes offers Undo. Each settled card is written to the
 *      workspace's audit trail (sync.ts `audit`).
 *   4. A read action that returns numbers (the workspace overview) is handed
 *      back to the AI once for the answer; that second answer may not act.
 *   5. The reply is spoken when the customer spoke, is in Talk mode, or asked
 *      for replies aloud.
 *
 * ── Talk mode: live, the same bot as the wizard's ──
 *
 * The owner (2026-11-12): the wizard's "Talk live with Protron" is the bot
 * they want, and the floating one must be the same. So Talk mode opens the
 * same real-time session (services/protron/live.ts → /api/live.php, mode
 * `assist`): the same voice and model, speech in and out at once, talking
 * over Protron interrupts it. Its instructions are Protron's on any screen,
 * and its two tools come back here: `look_at_screen` answers with the
 * screen's shape (screen.ts — never values) and, the first time, the action
 * list; `do_action` goes through `checkCall` exactly like a typed request —
 * read and reversible actions run at once with their pointer and typing,
 * confirm ones become a card the customer presses. Captions become turns of
 * the conversation, so the chat log keeps what was said.
 *
 * Where a live session cannot open (an OpenRouter-only install, no
 * microphone worklet), Talk falls back to the older turn-by-turn loop: the
 * microphone opens, a pause sends, the answer is spoken and the microphone
 * opens again, with barge-in from a level meter — and it says so.
 *
 * ── Speaking first ──
 *
 * Protron.tsx opens the panel with `seed.auto` when the customer has paused
 * (or something failed, or the screen froze); the panel reads the screen and
 * `thinkAhead` writes the opening. It never acts on its own — only offers.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import {
  Maximize2, Minimize2, Minus, Mic, Square, Send, Volume2, VolumeX, Settings2, RotateCcw,
  Check, X, Loader, Ban, CircleCheck, CircleAlert, Clock, AudioLines, MessageSquare, Undo2, Circle,
} from 'lucide-react';
import { useApp } from '../../context/AppContext';
import ProtronAvatar, { type AvatarState } from './ProtronAvatar';
import VoiceBars from '../Autopilot/voice/VoiceBars';
import { useVoiceInput, defaultLocale } from '../Autopilot/voice/useVoiceInput';
import { actionByName, checkCall, describeActions, needsConfirm, runChecked, type ActionCtx, type Who } from '../../services/protron/actions';
import { think, thinkAhead, type BrainReply, type TurnContext } from '../../services/protron/brain';
import { screenContext, startersFor } from '../../services/protron/knowledge';
import {
  adoptTurns, clearTurns, IDLE_CHOICES, isDirty, loadTurns, localStamp, markSynced, newId, normalisePrefs, saveTurns,
  type ActionCard, type Prefs, type Step, type Turn,
} from '../../services/protron/memory';
import { onVoiceLevel, speakerFor, stopAllVoices, unlockAudio, VOICE_PROBLEM_EVENT } from '../../services/protron/voice';
import { describeScreen, EDITING_EVENT, fillField, pressControl, readScreen, restoreFields, waitForField, type ScreenSnapshot } from '../../services/protron/screen';
import { audit, checkSite, clearRemote, loadRemote, saveRemoteSoon } from '../../services/protron/sync';
import { describeFacts, needsSiteCheck, openingFor } from '../../services/protron/identity';
import { readFacts } from '../../services/protron/facts';
import { pointAt, pointerDone, waitForElement } from '../../services/protron/cursor';
import { LiveVoice, liveSupported, type LiveState } from '../../services/protron/live';
import { featureReady } from '../../services/features';
import ThinkingLines from './ThinkingLines';

/* The incubator (docs/INCUBATOR.md): on live, Protron is a chat — typed or a
   recorded voice message. Live talk, hands-free Talk mode and working the
   screen are on the testing site only; speaking first is parked. */
const LIVE_TALK = featureReady('protron-live');
const HANDS = featureReady('protron-hands');
const SPEAKS_FIRST = featureReady('protron-speaks-first');
import type { SearchOutcome } from '../../services/protron/actions';
import { fetchBoard, type Project } from '../../services/projects';
import { saveWorkflow } from '../../services/autopilot';
import type { Stage } from '../../types';

const STAGE_COLOURS = ['#6366f1', '#0ea5e9', '#14b8a6', '#f59e0b', '#ef4444', '#8b5cf6', '#22c55e', '#64748b'];
const MIN_GAP_MS = 1200;

export type AutoWhy = 'idle' | 'trouble' | 'froze' | 'loop';
export interface Seed { message?: string; intro?: string; talk?: boolean; auto?: AutoWhy; n: number }

/** Cards left mid-run by a reload did not finish as far as anybody can tell. */
function settleInterrupted(turns: Turn[]): Turn[] {
  return turns.map(t => (t.actions?.some(a => a.status === 'running')
    ? { ...t, actions: t.actions.map(a => (a.status === 'running' ? { ...a, status: 'failed' as const, result: 'Interrupted before it finished.', steps: a.steps?.map(s => (s.status === 'running' ? { ...s, status: 'failed' as const } : s)) } : a)) }
    : t));
}

const sleep = (ms: number) => new Promise<void>(r => window.setTimeout(r, ms));

/** AI Prospecting's own report that its search settled (AiProspecting.tsx). */
function waitForSearch(ms: number): Promise<SearchOutcome | null> {
  return new Promise(resolve => {
    const on = (e: Event) => { window.clearTimeout(t); window.removeEventListener('pc-prospecting-results', on); resolve((e as CustomEvent<SearchOutcome>).detail); };
    const t = window.setTimeout(() => { window.removeEventListener('pc-prospecting-results', on); resolve(null); }, ms);
    window.addEventListener('pc-prospecting-results', on);
  });
}

/**
 * Barge-in: while Protron speaks in Talk mode, a level meter on the microphone
 * (echo-cancelled, so its own voice from the speakers mostly does not count).
 * A third of a second of somebody talking stops the voice and opens the mic.
 */
function useBargeIn(active: boolean, onSpeech: () => void): void {
  const cb = useRef(onSpeech);
  useEffect(() => { cb.current = onSpeech; }, [onSpeech]);
  useEffect(() => {
    if (!active || !navigator.mediaDevices?.getUserMedia) return;
    let stream: MediaStream | null = null;
    let ctx: AudioContext | null = null;
    let raf = 0;
    let stopped = false;
    void (async () => {
      try {
        stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true } });
        if (stopped) { stream.getTracks().forEach(t => t.stop()); return; }
        ctx = new AudioContext();
        const an = ctx.createAnalyser();
        an.fftSize = 512;
        ctx.createMediaStreamSource(stream).connect(an);
        const data = new Uint8Array(an.fftSize);
        let loud = 0;
        const started = performance.now();
        const tick = () => {
          an.getByteTimeDomainData(data);
          let sum = 0;
          for (const d of data) { const x = (d - 128) / 128; sum += x * x; }
          const rms = Math.sqrt(sum / data.length);
          /* The first half-second is the voice starting through the speakers. */
          if (performance.now() - started > 500 && rms > 0.09) loud++; else loud = Math.max(0, loud - 1);
          if (loud > 18) { cb.current(); return; }
          raf = requestAnimationFrame(tick);
        };
        raf = requestAnimationFrame(tick);
      } catch { /* no microphone permission: the Stop button still interrupts */ }
    })();
    return () => { stopped = true; cancelAnimationFrame(raf); stream?.getTracks().forEach(t => t.stop()); void ctx?.close().catch(() => undefined); };
  }, [active]);
}

/** Where the floating panel goes, beside the launcher. */
/* Compact by default (owner, 2026-11-12: a big window hides the screen it is working on). Kept in step with protron.css. */
const PANEL = { w: 372, h: 540, wl: 560, hl: 720 };
function besideAnchor(anchor: { left: number; top: number } | null, large: boolean): { left: number; top: number } {
  const vw = window.innerWidth, vh = window.innerHeight;
  const w = Math.min(large ? PANEL.wl : PANEL.w, vw - 16), h = Math.min(large ? PANEL.hl : PANEL.h, vh - 16);
  const a = anchor ?? { left: 16, top: vh - 82 };
  let left = a.left + 72 + w <= vw - 8 ? a.left + 72 : a.left - w - 12;
  if (left < 8) left = Math.min(vw - w - 8, Math.max(8, a.left));
  const top = Math.max(8, Math.min(vh - h - 8, a.top + 64 - h));
  return { left: Math.round(left), top: Math.round(top) };
}

/** "Heard in 0.9 s · answered in 1.6 s · speaking in 1.1 s" — what was measured, nothing else. */
function timingLine(t: NonNullable<Turn['timing']>): string {
  const sec = (ms: number) => `${(ms / 1000).toFixed(1)} s`;
  return [t.heardMs !== undefined && `heard in ${sec(t.heardMs)}`, t.thinkMs !== undefined && `answered in ${sec(t.thinkMs)}`, t.voiceMs !== undefined && `speaking in ${sec(t.voiceMs)}`]
    .filter(Boolean).join(' · ').replace(/^./, c => c.toUpperCase());
}

function StepList({ steps }: { steps: Step[] }) {
  return (
    <ol className="pt-steps" aria-label="Steps">
      {steps.map((s, i) => (
        <li key={i} data-s={s.status}>
          {s.status === 'done' ? <Check size={13} /> : s.status === 'failed' ? <X size={13} /> : s.status === 'running' ? <Loader size={13} className="spin" /> : <Circle size={9} />}
          <span>{s.label}</span>
        </li>
      ))}
    </ol>
  );
}

export default function ProtronPanel({ open, who, size, onSize, prefs, onPrefs, face, onFace, seed, anchor, onClose }: {
  open: boolean;
  who: Who;
  size: 'normal' | 'large';
  onSize: (s: 'normal' | 'large') => void;
  prefs: Prefs;
  onPrefs: (p: Prefs) => void;
  face: AvatarState;
  onFace: (s: AvatarState) => void;
  seed: Seed | null;
  /** The launcher's top-left corner, for floating beside it. */
  anchor: { left: number; top: number } | null;
  onClose: () => void;
}) {
  const loc = useLocation();
  const navigate = useNavigate();
  const app = useApp();
  const [turns, setTurns] = useState<Turn[]>(() => settleInterrupted(loadTurns()));
  const turnsRef = useRef(turns);
  const prefsRef = useRef(prefs);
  useEffect(() => { prefsRef.current = prefs; }, [prefs]);
  const [busy, setBusy] = useState(false);
  const [phase, setPhase] = useState('');
  const [input, setInput] = useState('');
  const [voiceNote, setVoiceNote] = useState('');
  /* The voice could not read a reply: say why rather than a second voice reading it. */
  useEffect(() => {
    const on = (e: Event) => setVoiceNote(String((e as CustomEvent<string>).detail ?? ''));
    window.addEventListener(VOICE_PROBLEM_EVENT, on);
    return () => window.removeEventListener(VOICE_PROBLEM_EVENT, on);
  }, []);
  const [menu, setMenu] = useState(false);
  const [speaking, setSpeaking] = useState(false);
  const [aiDown, setAiDown] = useState('');
  const [online, setOnline] = useState(() => navigator.onLine);
  const [talk, setTalk] = useState(false);
  const [pos, setPos] = useState<{ left: number; top: number } | null>(null);
  useEffect(() => { talkRef.current = talk; }, [talk]);
  const box = useRef<HTMLTextAreaElement>(null);
  const logEnd = useRef<HTMLDivElement>(null);
  const ring = useRef<HTMLDivElement>(null);
  const lastSend = useRef(0);
  const navTarget = useRef('');
  const loop = useRef(false);
  const talkRef = useRef(false);
  const lastScreen = useRef<ScreenSnapshot | null>(null);
  /* The live session, while Talk mode has one open. */
  const liveRef = useRef<LiveVoice | null>(null);
  const [live, setLive] = useState<LiveState>('idle');
  const [liveCaption, setLiveCaption] = useState<{ who: 'you' | 'protron'; text: string } | null>(null);
  const [liveNote, setLiveNote] = useState('');
  /* Talk mode is the live kind (else turn by turn). */
  const [liveTalk, setLiveTalk] = useState(false);
  /* This install has no live voice (said once): Talk goes turn by turn from then on. */
  const noLive = useRef(false);
  const toldActions = useRef(false);
  /* Talk mode ends a turn sooner after the speaker stops: a conversation, not dictation. */
  const v = useVoiceInput(defaultLocale(), {
    silenceStopSeconds: talk ? 1.2 : 1.8,
    /* What Protron last said and the business's name, so names are spelled right (routes/intake.ts `context`). */
    context: () => {
      const lastSaid = [...turnsRef.current].reverse().find(t => t.role === 'protron')?.text ?? '';
      return [lastSaid ? `They are answering: ${lastSaid.slice(0, 300)}` : '', prefsRef.current.business.name ? `Their business: ${prefsRef.current.business.name}` : ''].filter(Boolean).join('. ');
    },
  });
  /* When the take stopped and the transcriber started — the start of "heard in". */
  const heardFrom = useRef(0);
  useEffect(() => { if (v.phase === 'transcribing') heardFrom.current = performance.now(); }, [v.phase]);
  const speaker = speakerFor(prefs.voice);

  const commit = useCallback((next: Turn[]) => {
    turnsRef.current = next;
    setTurns(next);
    saveTurns(next);
    saveRemoteSoon(next, prefsRef.current, markSynced);
  }, []);
  const commitRef = useRef(commit);
  const patchCard = useCallback((turnId: string, cardId: string, patch: Partial<ActionCard>) => {
    commit(turnsRef.current.map(t => (t.id === turnId ? { ...t, actions: (t.actions ?? []).map(a => (a.id === cardId ? { ...a, ...patch } : a)) } : t)));
  }, [commit]);

  useEffect(() => {
    const up = () => setOnline(true);
    const down = () => setOnline(false);
    window.addEventListener('online', up);
    window.addEventListener('offline', down);
    return () => { window.removeEventListener('online', up); window.removeEventListener('offline', down); };
  }, []);

  /* ── The same conversation on every device ── */
  useEffect(() => {
    if (!open) return;
    let gone = false;
    void loadRemote().then(r => {
      if (gone || !r) return;
      if (r.updatedAt > localStamp() && !busy) {
        const remote = settleInterrupted(r.turns);
        adoptTurns(remote, r.updatedAt);
        turnsRef.current = remote;
        setTurns(remote);
        if (r.prefs && Object.keys(r.prefs).length) onPrefs(normalisePrefs({ ...prefsRef.current, ...r.prefs, dock: prefsRef.current.dock }));
      } else if (isDirty()) {
        saveRemoteSoon(turnsRef.current, prefsRef.current, markSynced);
      }
    });
    return () => { gone = true; };
  // eslint-disable-next-line react-hooks/exhaustive-deps -- each time it is opened
  }, [open]);

  /* ── What answers at their email domain: asked once, kept with the prefs ── */
  useEffect(() => {
    if (!open || !needsSiteCheck(readFacts(prefsRef.current))) return;
    let gone = false;
    void checkSite().then(site => { if (!gone && site) onPrefs({ ...prefsRef.current, siteCheck: site }); });
    return () => { gone = true; };
  // eslint-disable-next-line react-hooks/exhaustive-deps -- once per opening
  }, [open]);

  /* ── Floating beside the launcher ── */
  /* Placed while rendering when it is opened or its launcher moves (React's
     "adjust state on a prop change"), so it never paints in the old spot. */
  const [placedFor, setPlacedFor] = useState<unknown[]>([]);
  if (open && (placedFor[0] !== open || placedFor[1] !== anchor || placedFor[2] !== size)) {
    setPlacedFor([open, anchor, size]);
    setPos(besideAnchor(anchor, size === 'large'));
  }
  if (!open && placedFor[0]) { setPlacedFor([false]); if (talk) setTalk(false); if (speaking) setSpeaking(false); }
  useEffect(() => {
    const keep = () => setPos(p => (p ? besideAnchor(anchor, size === 'large') : p));
    window.addEventListener('resize', keep);
    return () => window.removeEventListener('resize', keep);
  }, [anchor, size]);
  /* A box it is about to type into is under the panel: the panel moves to
     whichever side of the box has room, so the typing is seen. */
  useEffect(() => {
    const on = (e: Event) => {
      const r = (e as CustomEvent<{ left: number; top: number; right: number; bottom: number }>).detail;
      const el = document.querySelector<HTMLElement>('.pt-panel');
      if (!r || !el || window.innerWidth <= 760) return;
      const p = el.getBoundingClientRect();
      if (p.right <= r.left || p.left >= r.right || p.bottom <= r.top || p.top >= r.bottom) return;
      const w = p.width, vw = window.innerWidth;
      const left = vw - r.right - 12 >= w ? r.right + 12 : r.left - 12 >= w ? r.left - w - 12 : (r.left + r.right) / 2 > vw / 2 ? 8 : vw - w - 8;
      setPos(prev => ({ left: Math.round(left), top: prev?.top ?? Math.round(p.top) }));
    };
    window.addEventListener(EDITING_EVENT, on);
    return () => window.removeEventListener(EDITING_EVENT, on);
  }, []);
  const drag = useRef<{ dx: number; dy: number } | null>(null);
  const onHeadDown = (e: React.PointerEvent<HTMLElement>) => {
    if ((e.target as HTMLElement).closest('button') || window.innerWidth <= 760 || !pos) return;
    drag.current = { dx: e.clientX - pos.left, dy: e.clientY - pos.top };
    e.currentTarget.setPointerCapture(e.pointerId);
  };
  const onHeadMove = (e: React.PointerEvent<HTMLElement>) => {
    if (!drag.current) return;
    const el = e.currentTarget.parentElement as HTMLElement;
    setPos({
      left: Math.max(8, Math.min(window.innerWidth - el.offsetWidth - 8, e.clientX - drag.current.dx)),
      top: Math.max(8, Math.min(window.innerHeight - el.offsetHeight - 8, e.clientY - drag.current.dy)),
    });
  };
  const onHeadUp = () => { drag.current = null; };

  /* ── What the actions may touch ── */
  const actx: ActionCtx = useMemo(() => ({
    who,
    navigate: (p: string) => { navTarget.current = p.split('?')[0]; navigate(p); },
    addContact: c => {
      const now = new Date().toISOString();
      app.addContact({
        name: c.name, email: c.email, phone: c.phone, company: c.company, status: 'lead', tags: [],
        source: 'Protron (AI Live Business Manager)', createdAt: now, lastActivity: now, value: 0,
      });
    },
    createPipeline: name => app.createPipeline(name).id,
    setStages: (id, stages) => {
      const list: Stage[] = stages.map((s, i) => ({ id: `stage-${id}-${i}`, name: s, color: STAGE_COLOURS[i % STAGE_COLOURS.length], deals: [] }));
      app.updatePipeline(id, { stages: list });
    },
    counts: () => ({
      contacts: app.contacts.length,
      pipelines: app.pipelines.length,
      deals: app.pipelines.reduce((n, p) => n + p.stages.reduce((m, s) => m + s.deals.length, 0), 0),
      emailCampaigns: app.campaigns.length,
      websites: app.websites.length,
      funnels: app.funnels.length,
      appointments: app.appointments.length,
      conversations: app.conversations.length,
    }),
    setProactive: on => onPrefs({ ...prefsRef.current, proactive: on }),
    handOffToAutopilot: (text, opts) => {
      try {
        sessionStorage.setItem('pc_protron_handoff', text);
        if (opts?.auto && HANDS) sessionStorage.setItem('pc_protron_autodrive', '1'); else sessionStorage.removeItem('pc_protron_autodrive');
      } catch { /* the wizard opens with an empty box instead */ }
      navTarget.current = '/autopilot';
      navigate('/autopilot?new=1&from=protron');
      return !!opts?.auto && HANDS;
    },
    fill: fillField,
    press: pressControl,
    waitFor: key => waitForField(key),
    labelOf: key => lastScreen.current?.fields.find(f => f.key === key)?.label ?? '',
    signal: (event, detail) => window.dispatchEvent(new CustomEvent(event, { detail })),
    wait: sleep,
    point: (target, label) => pointAt(target, label),
    waitForEl: async (sel, ms) => !!(await waitForElement(sel, ms)),
    waitForSearch,
    listProjects: async () => {
      const b = await fetchBoard();
      if (b.error) return null;
      return (b.projects as Project[]).map(p => ({ id: p.id, name: p.name, status: p.status, client: p.portfolioName ?? '' }));
    },
    currentProjectId: () => new URLSearchParams(window.location.search).get('project') ?? '',
    saveWorkflow: async (projectId, rec, templateKey) => {
      const r = await saveWorkflow(projectId, { ...rec, status: 'draft' }, templateKey);
      return { ok: !!r.success, id: String((r as { id?: string }).id ?? rec.id ?? ''), error: String(r.error ?? '') };
    },
    updateBusiness: patch => {
      const business = { ...prefsRef.current.business, ...patch };
      onPrefs({ ...prefsRef.current, business });
      return business;
    },
  }), [who, navigate, app, onPrefs]);

  /* ── The face follows what is happening ── */
  const settleFace = useCallback((s: AvatarState, ms = 1400) => {
    onFace(s);
    window.setTimeout(() => onFace('idle'), ms);
  }, [onFace]);
  useEffect(() => {
    if (v.phase === 'listening' || v.phase === 'starting') onFace('listening');
    else if (v.phase === 'transcribing') onFace('thinking');
  }, [v.phase, onFace]);
  useEffect(() => onVoiceLevel(l => { ring.current?.style.setProperty('--pt-lvl', l.toFixed(3)); }), []);

  /* ── Speaking ── */
  const micRef = useRef<() => void>(() => undefined);
  const speak = useCallback(async (text: string, turnId?: string, from?: number) => {
    /* One voice at a time: while a live session is open it does the talking. */
    if (!speaker.supported() || !text.trim() || liveRef.current?.active) return;
    setSpeaking(true);
    onFace('speaking');
    await speaker.speak(text, () => {
      /* Time to the first sound of the answer, measured. */
      if (!turnId || from === undefined) return;
      const voiceMs = Math.round(performance.now() - from);
      commitRef.current(turnsRef.current.map(t => (t.id === turnId ? { ...t, timing: { ...t.timing, voiceMs } } : t)));
    });
    setSpeaking(false);
    onFace('idle');
    if (loop.current) micRef.current();
  }, [onFace, speaker]);
  const hush = useCallback(() => { loop.current = false; stopAllVoices(); setSpeaking(false); onFace('idle'); }, [onFace]);

  /* ── Carrying out a card ── */
  const settle = (card: ActionCard, status: 'done' | 'failed' | 'cancelled' | 'refused', result: string) => {
    const tier = actionByName(card.name)?.tier;
    /* Moving around is not worth a row; everything that wrote, filled, spent or was stopped is. */
    if (!(tier === 'read' && status === 'done')) audit(card.name, card.title, status, result);
  };
  const execute = useCallback(async (turnId: string, card: ActionCard, confirmed: boolean): Promise<{ ok: boolean; message: string; data?: Record<string, number | string> }> => {
    /* Checked again at the moment it runs: a card confirmed after a reload,
       or after the customer's permissions changed, is judged as of now. */
    const c = checkCall({ name: card.name, args: card.args }, who);
    if (!c.ok) { patchCard(turnId, card.id, { status: 'refused', result: c.error }); settle(card, 'refused', c.error); return { ok: false, message: c.error }; }
    patchCard(turnId, card.id, { status: 'running' });
    onFace('working');
    const res = await runChecked(c, { ...actx, report: steps => patchCard(turnId, card.id, { steps }) }, confirmed);
    pointerDone();
    patchCard(turnId, card.id, { status: res.ok ? 'done' : 'failed', result: res.message, undo: res.undo });
    settle(card, res.ok ? 'done' : 'failed', res.message);
    settleFace(res.ok ? 'done' : 'error', res.ok ? 1200 : 2600);
    /* A live conversation hears how a card it asked for (or one confirmed later) ended. */
    if (confirmed && liveRef.current?.active) liveRef.current.sendText(`[app] The customer pressed Confirm on “${card.title}”. Result: ${res.message}`);
    return { ok: res.ok, message: res.message, data: res.data };
  }, [who, actx, patchCard, onFace, settleFace]);

  const undo = useCallback(async (turnId: string, card: ActionCard) => {
    const n = await restoreFields(card.undo ?? []);
    patchCard(turnId, card.id, { undo: undefined, result: n ? `Undone — put back what was in ${n === 1 ? 'that box' : `those ${n} boxes`} before.` : 'Those boxes are not on screen any more, so there was nothing to put back.' });
    if (n) audit(card.name, card.title, 'cancelled', 'Undone by the customer');
  }, [patchCard]);

  /* Through a ref, because a read action's follow-up answer is delivered by
     the same function that delivered the question's. */
  const respondRef = useRef<(r: BrainReply, ctx: TurnContext, spoken: boolean, allowFollowUp: boolean, auto?: boolean, timing?: Turn['timing']) => Promise<void>>(async () => undefined);
  const respond = useCallback(async (r: BrainReply, ctx: TurnContext, spoken: boolean, allowFollowUp: boolean, auto = false, timing?: Turn['timing']) => {
    setAiDown(r.offline ? (r.reason || 'the AI is not answering') : '');
    const cards: ActionCard[] = (allowFollowUp ? r.actions : []).map(call => {
      const c = checkCall(call, who);
      const def = actionByName(call.name);
      if (!c.ok) { settle({ id: '', name: call.name, title: def?.title ?? call.name, args: {}, status: 'refused' }, 'refused', c.error); return { id: newId(), name: call.name, title: def?.title ?? 'Not available', args: {}, status: 'refused' as const, result: c.error }; }
      return {
        id: newId(), name: c.def.name, title: c.def.title, args: c.args,
        status: needsConfirm(c.def) ? 'waiting' as const : 'running' as const,
        confirmText: c.def.confirmText?.(c.args),
      };
    });
    const turn: Turn = {
      id: newId(), role: 'protron', at: Date.now(), path: ctx.path,
      text: r.reply || (cards.length ? '' : 'I could not work that out — could you say it another way?'),
      actions: cards.length ? cards : undefined,
      suggestions: r.suggestions.length ? r.suggestions : undefined,
      offline: r.offline,
      error: !!r.error && !r.reply,
      auto: auto || undefined,
      timing: spoken && timing ? timing : undefined,
    };
    if (r.error) turn.text = `${turn.text}${turn.text ? '\n\n' : ''}(${r.error})`;
    commit([...turnsRef.current, turn]);
    if (spoken || prefsRef.current.speak) void speak(r.reply, spoken ? turn.id : undefined, performance.now());

    for (const card of cards.filter(c => c.status === 'running')) {
      const def = actionByName(card.name);
      const out = await execute(turn.id, card, false);
      if (allowFollowUp && def?.feedsBack && out.ok && out.data) {
        const again = await think(turnsRef.current, { ...ctx, toolResult: { name: card.name, data: out.data } });
        await respondRef.current(again, ctx, spoken, false);
      }
    }
  }, [who, commit, execute, speak]);
  useEffect(() => { respondRef.current = respond; }, [respond]);

  const context = useCallback((spoken = false): TurnContext => {
    const snap = readScreen();
    lastScreen.current = snap;
    return {
      who, path: loc.pathname, pageTitle: document.title, business: prefsRef.current.business, screen: describeScreen(snap),
      facts: describeFacts(readFacts(prefsRef.current)), spoken,
    };
  }, [who, loc.pathname]);

  const send = useCallback(async (raw: string, spoken = false, heardMs?: number) => {
    const text = raw.trim().slice(0, 2000);
    if (!text || busy) return;
    if (Date.now() - lastSend.current < MIN_GAP_MS) return;
    lastSend.current = Date.now();
    unlockAudio();
    stopAllVoices();
    setSpeaking(false);
    loop.current = spoken;
    setInput('');
    setVoiceNote('');
    setPhase('Reading your screen');
    const ctx = context(spoken);
    commit([...turnsRef.current, { id: newId(), role: 'user', text, at: Date.now(), path: loc.pathname }]);
    setBusy(true);
    onFace('thinking');
    try {
      setPhase('Asking the AI');
      const t0 = performance.now();
      const r = await think(turnsRef.current, ctx);
      const thinkMs = Math.round(performance.now() - t0);
      setPhase(r.actions.length ? 'Checking what it proposed' : 'Writing the answer');
      onFace('idle');
      await respond(r, ctx, spoken, true, false, { heardMs, thinkMs });
    } catch (e) {
      commit([...turnsRef.current, { id: newId(), role: 'protron', at: Date.now(), text: `Something went wrong on my side: ${e instanceof Error ? e.message : String(e)}`, error: true }]);
      settleFace('error', 2600);
    } finally {
      setBusy(false);
      setPhase('');
    }
  }, [busy, loc.pathname, commit, onFace, respond, settleFace, context]);

  /** Protron speaks first: the customer paused, something failed, or the screen froze. */
  const opening = useCallback(async (why: AutoWhy) => {
    if (busy) return;
    setBusy(true);
    setPhase('Reading your screen');
    onFace('thinking');
    const ctx = context();
    const seconds = prefsRef.current.idleSeconds || 10;
    try {
      setPhase('Working out what might help');
      const r = await thinkAhead(turnsRef.current, ctx, why === 'idle' ? seconds : 0, why);
      onFace('idle');
      await respond(r, ctx, false, true, true);
    } finally { setBusy(false); setPhase(''); }
  }, [busy, context, onFace, respond]);

  const retry = useCallback(() => {
    const list = turnsRef.current;
    const lastUser = [...list].reverse().find(t => t.role === 'user');
    if (!lastUser) return;
    const cut = list.slice(0, list.lastIndexOf(lastUser));
    commit(cut);
    lastSend.current = 0;
    void send(lastUser.text);
  }, [commit, send]);

  /* ── The microphone ── */
  const mic = useCallback(async () => {
    unlockAudio();
    if (speaker.speaking()) hush();
    if (v.phase === 'listening') { void v.stop(); return; }
    if (v.phase === 'starting' || v.phase === 'transcribing' || busy) return;
    const r = await v.start();
    /* Nothing heard: Talk mode waits for the microphone rather than reopening
       it forever on a silent room or a refused permission. */
    if (!r || !r.text.trim()) { loop.current = false; onFace('idle'); return; }
    if (r.audio) URL.revokeObjectURL(r.audio);
    /* A voice message waits in the box to be checked and sent (owner,
       2026-11-14: a misheard sentence went out with no chance to fix it).
       Only hands-free Talk mode (the incubator) sends what it heard. */
    if (!talkRef.current) {
      loop.current = false;
      onFace('idle');
      setInput(prev => (prev.trim() ? `${prev.trim()} ${r.text}` : r.text));
      setVoiceNote(r.doubtful ? r.note : 'Here’s what I heard — fix anything I got wrong, then press send.');
      window.setTimeout(() => box.current?.focus(), 0);
      return;
    }
    void send(r.text, true, heardFrom.current ? Math.round(performance.now() - heardFrom.current) : undefined);
  }, [v, busy, hush, onFace, send, speaker]);
  useEffect(() => { micRef.current = () => { if (open) void mic(); }; }, [mic, open]);
  useBargeIn(open && talk && speaking, () => { hush(); loop.current = true; void mic(); });

  /* ── Live: the same real-time session as the wizard's Talk live ── */
  const stopLive = useCallback(() => {
    const lv = liveRef.current;
    liveRef.current = null;
    lv?.stop(true);
    setLive('idle');
    setLiveCaption(null);
  }, []);

  /** The model's two tools: look at the screen, ask for an action. */
  const liveTool = useCallback(async (name: string, args: Record<string, unknown>): Promise<Record<string, unknown>> => {
    if (name === 'look_at_screen') {
      const ctx = context(true);
      const out: Record<string, unknown> = { screen_name: screenContext(window.location.pathname, who).label, path: window.location.pathname, screen: ctx.screen || 'Nothing readable on screen.', known: ctx.facts };
      if (!toldActions.current) { toldActions.current = true; out.actions = describeActions(who); }
      return out;
    }
    if (name !== 'do_action') return { ok: false, error: 'Unknown tool.' };
    let parsed: unknown;
    try { parsed = args.args_json ? JSON.parse(String(args.args_json)) : {}; } catch { return { ok: false, error: 'args_json was not a JSON object.' }; }
    /* The screen's boxes get their keys when it is read: read it now, as the typed chat does before each turn. */
    lastScreen.current = readScreen();
    const call = { name: String(args.name ?? ''), args: parsed };
    const c = checkCall(call, who);
    const def = actionByName(call.name);
    if (!c.ok) {
      commit([...turnsRef.current, { id: newId(), role: 'protron', at: Date.now(), path: window.location.pathname, text: '', actions: [{ id: newId(), name: call.name, title: def?.title ?? 'Not available', args: {}, status: 'refused', result: c.error }] }]);
      settle({ id: '', name: call.name, title: def?.title ?? call.name, args: {}, status: 'refused' }, 'refused', c.error);
      return { ok: false, error: c.error };
    }
    const card: ActionCard = { id: newId(), name: c.def.name, title: c.def.title, args: c.args, status: needsConfirm(c.def) ? 'waiting' : 'running', confirmText: c.def.confirmText?.(c.args) };
    const turn: Turn = { id: newId(), role: 'protron', at: Date.now(), path: window.location.pathname, text: '', actions: [card] };
    commit([...turnsRef.current, turn]);
    if (card.status === 'waiting') return { ok: false, waiting_for_confirm: true, message: `Shown to the customer as “${card.title}” with a Confirm button. Nothing has happened yet — ask them to press Confirm.` };
    const out = await execute(turn.id, card, false);
    return { ok: out.ok, message: out.message, ...(out.data ? { data: out.data } : {}) };
  }, [context, who, commit, execute]);
  const liveToolRef = useRef(liveTool);
  useEffect(() => { liveToolRef.current = liveTool; }, [liveTool]);

  const reconnectAt = useRef(0);
  const restartLive = useRef<() => void>(() => undefined);
  const startLive = useCallback(() => {
    stopLive();
    hush();
    setLiveNote('');
    setLiveTalk(true);
    toldActions.current = false;
    let lastWho = '';
    const lv: LiveVoice = new LiveVoice({
      onState: (st, message, code) => {
        if (liveRef.current !== lv) return;
        setLive(st);
        if (st === 'live') onFace('listening');
        if (st === 'error' || st === 'ended') {
          liveRef.current = null;
          onFace('idle');
          if (code === 'no_live' || code === 'mic' || code === 'connect') {
            /* No live voice here: carry on turn by turn, and say why. */
            if (code === 'no_live') noLive.current = true;
            setLiveNote(`${message ?? 'Live voice is not available.'} Talking turn by turn instead.`);
            setLive('idle');
            setLiveTalk(false);
            if (code !== 'mic') { loop.current = true; window.setTimeout(() => micRef.current(), 150); }
          } else if (message) {
            /* The voice service dropping mid-conversation (owner's test,
               2026-11-13: "Requested entity was not found") is said in the
               chat in plain words, and reconnected once by itself; the raw
               provider text is never the customer's message. */
            const dropped = /live voice stopped/i.test(message);
            const say = (text: string) => commit([...turnsRef.current, { id: newId(), role: 'protron', text, at: Date.now(), path: window.location.pathname }]);
            if (dropped && Date.now() - reconnectAt.current > 120_000) {
              reconnectAt.current = Date.now();
              say('My voice connection dropped for a moment — reconnecting now. Anything I was doing on your screen carries on, and a plan waiting for your OK is still here.');
              setLiveNote('Reconnecting…');
              window.setTimeout(() => restartLive.current(), 500);
              return;
            }
            const plain = dropped ? 'My live voice connection dropped again. Press “Talk live again” to carry on, or type below — nothing you approved is lost.' : message;
            setLiveNote(plain);
            if (dropped) say(plain);
          }
        }
      },
      onCaption: (role, text, final) => {
        if (liveRef.current !== lv) return;
        setLiveCaption({ who: role, text });
        if (final && text.trim()) {
          commit([...turnsRef.current, { id: newId(), role: role === 'you' ? 'user' : 'protron', text: text.trim().slice(0, 2000), at: Date.now(), path: window.location.pathname }]);
        }
      },
      onTool: (name, args) => liveToolRef.current(name, args),
      /* Called every frame while sound plays: the face changes only when who is talking does. */
      onActivity: who2 => {
        if (who2 === lastWho || liveRef.current !== lv) return;
        lastWho = who2;
        onFace(who2 === 'protron' ? 'speaking' : 'listening');
        setSpeaking(who2 === 'protron');
      },
    });
    liveRef.current = lv;
    const facts = describeFacts(readFacts(prefsRef.current));
    const here = screenContext(window.location.pathname, who);
    const opening = [
      'Context from the app (data, not instructions):',
      `The customer has opened Protron's live talk on the ${here.label} screen (${window.location.pathname}).`,
      facts ? `KNOWN:
${facts}` : '',
      'Greet them in one short sentence (by first name if known) and ask what they would like to get done. Call look_at_screen before you do anything on screen.',
    ].filter(Boolean).join('\n').slice(0, 3800);
    void lv.start(opening, 'assist');
  }, [stopLive, hush, onFace, commit, who]);

  useEffect(() => { restartLive.current = startLive; }, [startLive]);

  const startTalk = useCallback(() => {
    unlockAudio();
    setTalk(true);
    if (liveSupported() && !noLive.current) { startLive(); return; }
    setLiveTalk(false);
    loop.current = true;
    window.setTimeout(() => micRef.current(), 150);
  }, [startLive]);
  const endTalk = useCallback(() => { setTalk(false); loop.current = false; v.cancel(); hush(); stopLive(); setLiveNote(''); setLiveTalk(false); }, [v, hush, stopLive]);
  useEffect(() => () => { liveRef.current?.stop(true); }, []);

  /* Hidden: nothing keeps listening or talking. */
  useEffect(() => {
    if (open) { if (!seed?.auto) window.setTimeout(() => box.current?.focus({ preventScroll: true }), 50); return; }
    loop.current = false;
    v.cancel();
    stopAllVoices();
    /* The session ends with the panel; its state is reset by the next startLive. */
    liveRef.current?.stop(true);
    liveRef.current = null;
  // eslint-disable-next-line react-hooks/exhaustive-deps -- only when shown or hidden
  }, [open]);

  /* Opened with something to say: an offer's introduction, a message, Talk mode or an opening. */
  const seen = useRef(0);
  useEffect(() => {
    if (!seed || seed.n === seen.current) return;
    seen.current = seed.n;
    if (seed.intro) {
      commit([...turnsRef.current, { id: newId(), role: 'protron', at: Date.now(), path: loc.pathname, text: seed.intro, suggestions: startersFor(loc.pathname) }]);
    }
    if (seed.message) { lastSend.current = 0; void send(seed.message); }
    if (seed.talk && LIVE_TALK) startTalk();
    if (seed.auto) void opening(seed.auto);
  // eslint-disable-next-line react-hooks/exhaustive-deps -- once per seed
  }, [seed]);

  /* A new screen, while the panel is open: say where they are now. */
  useEffect(() => {
    if (!open) return;
    const list = turnsRef.current;
    const last = list[list.length - 1];
    if (!last || last.path === loc.pathname) return;
    const here = screenContext(loc.pathname, who);
    /* A live conversation is told where the customer is now, without having to answer. */
    liveRef.current?.sendContext(`[app] The screen is now ${here.label} (${loc.pathname}). Call look_at_screen to see it.`);
    if (navTarget.current === loc.pathname) { navTarget.current = ''; commit(list.map((t, i) => (i === list.length - 1 ? { ...t, path: loc.pathname } : t))); return; }
    if (busy || liveRef.current) return;
    commit([...list, {
      id: newId(), role: 'protron', at: Date.now(), path: loc.pathname,
      text: `You're now in ${here.label}${here.desc ? ` — ${here.desc.charAt(0).toLowerCase()}${here.desc.slice(1)}` : ''}. Want a hand with anything here?`,
      suggestions: startersFor(loc.pathname),
    }]);
  // eslint-disable-next-line react-hooks/exhaustive-deps -- on a move only
  }, [loc.pathname, open, who, commit]);

  useEffect(() => { logEnd.current?.scrollIntoView({ block: 'end' }); }, [turns, busy, open, phase]);

  const newConversation = () => {
    hush();
    clearTurns();
    turnsRef.current = [];
    setTurns([]);
    void clearRemote().then(() => markSynced(Date.now()));
    setMenu(false);
  };

  const here = screenContext(loc.pathname, who);
  /* The first words, from what is known — recomputed when the profile or site check changes. */
  const greeting = useMemo(() => openingFor(readFacts(prefs)), [prefs]);
  const listening = v.phase === 'listening' || v.phase === 'starting';
  const working = face === 'working';
  const status: { text: string; tone: 'ok' | 'warn' | 'bad' } = !online ? { text: 'You are offline', tone: 'bad' }
    : listening ? { text: 'Listening…', tone: 'ok' }
      : v.phase === 'transcribing' ? { text: 'Working out what you said…', tone: 'ok' }
        : busy ? { text: `${phase || 'Thinking'}…`, tone: 'ok' }
          : speaking ? { text: 'Speaking…', tone: 'ok' }
            : working ? { text: 'Carrying it out, step by step…', tone: 'ok' }
              : aiDown ? { text: `Basic mode — ${aiDown}`, tone: 'warn' }
                : { text: `Ready · on ${here.label}`, tone: 'ok' };

  const lastTurn = turns[turns.length - 1];
  const lastBot = [...turns].reverse().find(t => t.role === 'protron');
  const isLive = (a: ActionCard) => a.status === 'running' || a.status === 'waiting';
  const liveTurn = [...turns].reverse().find(t => (t.actions ?? []).some(isLive));
  const liveCard = liveTurn?.actions?.find(isLive);
  const style = pos && window.innerWidth > 760 ? { left: pos.left, top: pos.top, bottom: 'auto', right: 'auto' } : undefined;

  const card = (t: Turn, a: ActionCard) => (
    <div key={a.id} className="pt-card" data-s={a.status}>
      <div className="pt-card-top">
        {a.status === 'done' ? <CircleCheck size={15} color="#16a34a" />
          : a.status === 'failed' ? <CircleAlert size={15} color="#dc2626" />
            : a.status === 'refused' ? <Ban size={15} color="#dc2626" />
              : a.status === 'running' ? <Loader size={15} className="spin" />
                : a.status === 'cancelled' ? <X size={15} color="#64748b" /> : <Clock size={15} color="#b45309" />}
        <span>{a.title}</span>
        <span className="pt-chip" data-s={a.status}>
          {a.status === 'waiting' ? (a.name === 'propose_setup_plan' ? 'Approve below' : 'Confirm below') : a.status === 'running' ? 'Working' : a.status === 'done' ? 'Done' : a.status === 'failed' ? 'Did not work' : a.status === 'refused' ? 'Not allowed' : 'Cancelled'}
        </span>
      </div>
      {a.status === 'waiting' && a.confirmText && <p style={{ whiteSpace: 'pre-line' }}>{a.confirmText}</p>}
      {a.steps && a.steps.length > 0 && <StepList steps={a.steps} />}
      {a.result && <p>{a.result}</p>}
      {a.status === 'waiting' && (
        <div className="pt-card-row">
          <button type="button" className="pt-btn pt-btn-primary" onClick={() => { unlockAudio(); void execute(t.id, a, true); }}><Check size={14} /> {a.name === 'propose_setup_plan' ? 'Approve the plan' : 'Confirm'}</button>
          <button type="button" className="pt-btn" onClick={() => { patchCard(t.id, a.id, { status: 'cancelled', result: 'Cancelled — nothing was changed.' }); settle(a, 'cancelled', 'Cancelled by the customer'); }}>Cancel</button>
        </div>
      )}
      {a.status === 'done' && a.undo && a.undo.length > 0 && (
        <div className="pt-card-row"><button type="button" className="pt-btn" onClick={() => void undo(t.id, a)}><Undo2 size={14} /> Undo</button></div>
      )}
    </div>
  );

  return (
    <section
      className="pt-panel"
      role="dialog"
      aria-label="Protron, your AI Live Business Manager"
      data-size={size}
      data-talk={talk ? '1' : '0'}
      data-peek={face === 'working' && !talk ? '1' : '0'}
      hidden={!open}
      style={style}
      onKeyDown={e => { if (e.key === 'Escape') { e.stopPropagation(); onClose(); } }}
    >
      <header className="pt-head-bar" onPointerDown={onHeadDown} onPointerMove={onHeadMove} onPointerUp={onHeadUp} title="Drag to move">
        <span className="pt-mini" style={{ width: 44, height: 44 }}><ProtronAvatar size={40} state={face} /></span>
        <span className="pt-title">
          <b>Protron</b>
          <span className="pt-status" data-tone={status.tone} aria-live="polite" title={status.text}><i aria-hidden />{status.text}</span>
        </span>
        {LIVE_TALK && (
          <button type="button" className="pt-icon" aria-pressed={talk} title={talk ? 'Back to the chat' : 'Talk to Protron, hands-free'}
            aria-label={talk ? 'Back to the chat' : 'Talk to Protron'} onClick={() => (talk ? endTalk() : startTalk())}>
            {talk ? <MessageSquare size={17} /> : <AudioLines size={17} />}
          </button>
        )}
        <button type="button" className="pt-icon" aria-pressed={prefs.speak} title={prefs.speak ? 'Stop reading replies aloud' : 'Read replies aloud'}
          aria-label={prefs.speak ? 'Stop reading replies aloud' : 'Read replies aloud'}
          onClick={() => { unlockAudio(); if (prefs.speak) hush(); onPrefs({ ...prefs, speak: !prefs.speak }); }}>
          {prefs.speak ? <Volume2 size={17} /> : <VolumeX size={17} />}
        </button>
        <button type="button" className="pt-icon" aria-expanded={menu} aria-label="Protron settings" title="Settings" onClick={() => setMenu(m => !m)}><Settings2 size={17} /></button>
        <button type="button" className="pt-icon pt-wide-only" aria-label={size === 'large' ? 'Make Protron smaller' : 'Make Protron larger'} title={size === 'large' ? 'Smaller' : 'Larger'}
          onClick={() => onSize(size === 'large' ? 'normal' : 'large')}>
          {size === 'large' ? <Minimize2 size={17} /> : <Maximize2 size={17} />}
        </button>
        <button type="button" className="pt-icon" aria-label="Minimise Protron" title="Minimise — the conversation is kept" onClick={onClose}><Minus size={18} /></button>
      </header>

      {menu && (
        <div className="pt-menu">
          {SPEAKS_FIRST && <>
          <label>
            <input type="checkbox" checked={prefs.proactive} onChange={e => onPrefs({ ...prefs, proactive: e.target.checked })} />
            <span>Start a conversation when I pause<small>Protron reads the screen (labels and messages, never what you typed) and offers help. It only offers — it never acts on its own.</small></span>
          </label>
          <label style={{ cursor: 'default' }}>
            <span style={{ flex: 1 }}>After</span>
            <select data-field="protron.idleSeconds" className="pt-select" value={prefs.idleSeconds} disabled={!prefs.proactive}
              onChange={e => onPrefs({ ...prefs, idleSeconds: Number(e.target.value) })}>
              {IDLE_CHOICES.filter(n => n > 0).map(n => <option key={n} value={n}>{n < 60 ? `${n} seconds` : `${n / 60} minutes`} without a touch</option>)}
            </select>
          </label>
          </>}
          <label style={{ cursor: 'default' }}>
            <span style={{ flex: 1 }}>Voice</span>
            <select data-field="protron.voice" className="pt-select" value={prefs.voice} onChange={e => { stopAllVoices(); onPrefs({ ...prefs, voice: e.target.value === 'natural' ? 'natural' : 'warm' }); }}>
              <option value="warm">Protron — its own AI voice</option>
              <option value="natural">Device — this browser&rsquo;s own voice (free)</option>
            </select>
          </label>
          <label>
            <input type="checkbox" checked={prefs.speak} onChange={e => { if (!e.target.checked) hush(); onPrefs({ ...prefs, speak: e.target.checked }); }} />
            <span>Read replies aloud<small>{LIVE_TALK ? 'Spoken questions and Talk mode are always answered aloud.' : 'Voice messages are always answered aloud.'} The AI voices are one AI credit a reply; your voice is turned into text and not kept.</small></span>
          </label>
          <label style={{ display: 'grid', gap: 4, cursor: 'default' }}>
            <span style={{ fontWeight: 600 }}>Your business, so answers fit it</span>
            <input data-field="protron.business" className="pt-input" value={prefs.business.name} maxLength={80} placeholder="Company name"
              onChange={e => onPrefs({ ...prefs, business: { ...prefs.business, name: e.target.value } })} />
            <input data-field="protron.about" className="pt-input" value={prefs.business.about} maxLength={200} placeholder="What you do, e.g. used car dealership"
              onChange={e => onPrefs({ ...prefs, business: { ...prefs.business, about: e.target.value } })} />
            <input data-field="protron.audience" className="pt-input" value={prefs.business.audience ?? ''} maxLength={160} placeholder="Your customers, e.g. families buying a first car"
              onChange={e => onPrefs({ ...prefs, business: { ...prefs.business, audience: e.target.value } })} />
            <input data-field="protron.places" className="pt-input" value={prefs.business.places ?? ''} maxLength={120} placeholder="Where you work, e.g. Dallas, TX"
              onChange={e => onPrefs({ ...prefs, business: { ...prefs.business, places: e.target.value } })} />
            <input data-field="protron.website" className="pt-input" value={prefs.business.website ?? ''} maxLength={120} placeholder="Website, if you have one"
              onChange={e => onPrefs({ ...prefs, business: { ...prefs.business, website: e.target.value } })} />
          </label>
          {prefs.dock && <button type="button" className="pt-btn" style={{ justifySelf: 'start' }} onClick={() => onPrefs({ ...prefs, dock: null })}>Put Protron back in the corner</button>}
          <button type="button" className="pt-danger" onClick={newConversation}>Clear this conversation</button>
          <small>Kept for you in this workspace — in this browser and on our server, so it follows you to other devices. Clearing removes both. What Protron does is also written to the workspace&rsquo;s audit trail.</small>
        </div>
      )}

      {talk && liveTalk ? (
        <div className="pt-talk-stage" data-live="1" aria-live="polite">
          <div className="pt-talk-orb" ref={ring} data-state={live === 'connecting' ? 'thinking' : speaking ? 'speaking' : working ? 'thinking' : live === 'live' ? 'listening' : 'idle'}>
            <ProtronAvatar size={112} state={face} />
          </div>
          <div className="pt-talk-state">
            <span className="pt-live-tag"><i aria-hidden /> Live</span>{' '}
            {live === 'connecting' ? 'Connecting…' : live === 'live' ? (speaking ? 'Protron is speaking — talk any time to interrupt' : working ? 'Working on your screen…' : 'Listening — just talk') : live === 'ended' || live === 'idle' ? 'The live conversation has ended' : 'Live voice stopped'}
          </div>
          {liveCaption?.text && <p className="pt-talk-caption" data-who={liveCaption.who}>{liveCaption.text}</p>}
          {liveTurn && liveCard && <div className="pt-talk-card">{card(liveTurn, liveCard)}</div>}
          {liveNote && <div className="pt-voice" role="status" style={{ background: 'rgba(59, 29, 18, .75)', color: '#fed7aa' }}>{liveNote}</div>}
          <div className="pt-talk-row">
            {live === 'live' || live === 'connecting'
              ? <button type="button" className="pt-btn pt-btn-end" onClick={stopLive}><Square size={13} /> End live talk</button>
              : <button type="button" className="pt-btn pt-btn-primary" onClick={startLive}><AudioLines size={14} /> Talk live again</button>}
            <button type="button" className="pt-btn" onClick={endTalk}><MessageSquare size={14} /> Back to chat</button>
          </div>
          <small className="pt-foot-note">Live, like Talk live in AI Autopilot: the same voice, in real time. Protron proposes a plan, and once you approve it, builds it on your screen while you watch.</small>
        </div>
      ) : talk ? (
        <div className="pt-talk-stage" aria-live="polite">
          <div className="pt-talk-orb" ref={ring} data-state={listening ? 'listening' : speaking ? 'speaking' : busy || working ? 'thinking' : 'idle'}>
            <ProtronAvatar size={112} state={face} />
          </div>
          <div className="pt-talk-state">
            {listening ? 'Listening — pause when you are done' : v.phase === 'transcribing' ? 'Working out what you said…' : busy ? `${phase || 'Thinking'}…` : speaking ? 'Speaking — just talk to interrupt' : working ? 'Carrying it out…' : 'Your turn — press the microphone or just talk'}
          </div>
          {listening && <div className="pt-voice-bars" style={{ width: '70%' }}><VoiceBars meter={v.meter} count={28} height={28} /></div>}
          {lastBot?.text && <p className="pt-talk-caption">{lastBot.text}</p>}
          {lastBot?.timing && <small className="pt-timing" style={{ color: '#8aa0b2' }}>{timingLine(lastBot.timing)}</small>}
          {liveTurn && liveCard && <div className="pt-talk-card">{card(liveTurn, liveCard)}</div>}
          {liveNote && <div className="pt-voice" role="status" style={{ background: 'rgba(59, 29, 18, .75)', color: '#fed7aa' }}>{liveNote}</div>}
          {v.problem && v.phase === 'error' && <div className="pt-voice" role="alert" style={{ background: '#3b1d12', color: '#fed7aa' }}>{v.problem}</div>}
          <div className="pt-talk-row">
            <button type="button" className="pt-round pt-mic pt-mic-big" data-on={listening ? '1' : '0'} disabled={!v.supported || v.phase === 'transcribing'}
              aria-label={listening ? 'Stop listening' : 'Talk to Protron'} onClick={() => { loop.current = true; void mic(); }}>
              {listening ? <Square size={20} /> : <Mic size={24} />}
            </button>
            {speaking && <button type="button" className="pt-btn" onClick={hush}><Square size={13} /> Stop</button>}
            <button type="button" className="pt-btn" onClick={endTalk}><MessageSquare size={14} /> Back to chat</button>
          </div>
          <small className="pt-foot-note">Turn by turn here: you speak, Protron answers aloud, then listens again. Just start talking to interrupt it.</small>
        </div>
      ) : (
        <div className="pt-log" aria-live="polite">
          {/* Live talk is the headline: the first thing in the window, lit,
              beside Protron's pointer resting on its charging dock — the
              pointer it moves around the app when it works for you. */}
          <div className="pt-hero">
            {HANDS && <PointerDock />}
            <div className="pt-hero-copy">
              <b>{LIVE_TALK ? 'AI Live Business Manager' : 'AI Business Manager'}</b>
              <span>{HANDS
                ? 'Talk to me like a colleague — I plan it, you approve, I build it on your screen.'
                : 'Type, or press the microphone to send a voice message. I plan it, you approve, AI Autopilot builds it.'}</span>
            </div>
            {LIVE_TALK && (
              <button type="button" className="pt-btn pt-live-cta" onClick={() => { unlockAudio(); startTalk(); }}>
                <AudioLines size={15} /> Talk live
              </button>
            )}
          </div>
          {!turns.length && (
            <div style={{ display: 'grid', gap: 12, justifyItems: 'start' }}>
              <div className="pt-msg pt-msg-bot">
                <span className="pt-mini"><ProtronAvatar size={22} state="idle" alive={false} /></span>
                <span className="pt-bubble-text">
                  {greeting.text}
                  {'\n\n'}Tell me what you want — “I'm a dentist in Virginia and need clients”, or “set up automated email campaigns”. I'll show you the plan in a few bullets, and once you approve it {HANDS ? 'I set it all up in AI Autopilot while you watch' : 'AI Autopilot sets it all up'}.
                </span>
              </div>
              <div className="pt-sugs">
                {greeting.suggestions.map(s => <button key={s} type="button" className="pt-sug" onClick={() => void send(s)}>{s}</button>)}
                {LIVE_TALK && <button type="button" className="pt-sug" onClick={startTalk}><AudioLines size={13} style={{ verticalAlign: '-2px' }} /> Talk to me</button>}
              </div>
            </div>
          )}

          {turns.map(t => (t.role === 'user'
            ? <div key={t.id} className="pt-msg pt-msg-user">{t.text}</div>
            : (
              <div key={t.id} style={{ display: 'grid', gap: 8 }}>
                <div className="pt-msg pt-msg-bot" data-error={t.error ? '1' : '0'}>
                  <span className="pt-mini"><ProtronAvatar size={22} state={t.error ? 'error' : 'idle'} alive={false} /></span>
                  <span style={{ minWidth: 0 }}>
                    {t.text && <span className="pt-bubble-text" style={{ display: 'block' }}>{t.text}</span>}
                    {t.auto && (
                      <span className="pt-note" style={{ display: 'block', color: '#6b7280' }}>
                        I spoke up because you paused.{' '}
                        <button type="button" className="pt-link" onClick={() => onPrefs({ ...prefs, proactive: false })}>Don&rsquo;t start chats</button>
                      </span>
                    )}
                    {t.offline && !t.error && <span className="pt-note" style={{ display: 'block' }}>Answered without the AI{aiDown && t === lastBot && !t.text.includes(aiDown) ? ` — ${aiDown.replace(/[.\s]+$/, '')}` : ''}.</span>}
                    {t.timing && <span className="pt-note pt-timing" style={{ display: 'block' }}>{timingLine(t.timing)}</span>}
                    {(t.actions ?? []).map(a => card(t, a))}
                    {t.error && t === lastTurn && (
                      <button type="button" className="pt-btn" style={{ marginTop: 8 }} onClick={retry}><RotateCcw size={14} /> Try again</button>
                    )}
                  </span>
                </div>
                {t === lastTurn && t.suggestions && !busy && (
                  <div className="pt-sugs" style={{ paddingLeft: 34 }}>
                    {t.suggestions.map(s => <button key={s} type="button" className="pt-sug" onClick={() => void send(s)}>{s}</button>)}
                  </div>
                )}
              </div>
            )))}

          {busy && (
            <div className="pt-typing" role="status">
              <span className="pt-mini"><ProtronAvatar size={22} state="thinking" alive={false} /></span>
              <span className="pt-dots" aria-hidden><span /><span /><span /></span>
              {phase ? <span className="pt-phase">{phase}…</span> : <ThinkingLines className="pt-phase" business={prefs.business.about || prefs.business.name} />}
            </div>
          )}
          <div ref={logEnd} />
        </div>
      )}

      {!talk && (
        <div className="pt-compose">
          {(listening || v.phase === 'transcribing') && (
            <div className="pt-voice">
              <span style={{ fontWeight: 700 }}>{v.phase === 'transcribing' ? 'Working out what you said…' : 'Listening — pause when you are done'}</span>
              {listening && <span className="pt-voice-bars"><VoiceBars meter={v.meter} count={22} height={22} /></span>}
              {listening && <button type="button" className="pt-btn" onClick={() => { loop.current = false; v.cancel(); onFace('idle'); }}>Cancel</button>}
            </div>
          )}
          {speaking && (
            <div className="pt-voice">
              <span style={{ flex: 1 }}>Speaking… press the microphone to talk over me.</span>
              <button type="button" className="pt-btn" onClick={hush}><Square size={13} /> Stop</button>
            </div>
          )}
          {v.problem && v.phase === 'error' && <div className="pt-voice" role="alert" style={{ background: '#fff7ed', color: '#9a3412' }}>{v.problem}</div>}
          {voiceNote && <div className="pt-voice" style={{ background: '#fffbeb', color: '#92400e' }}>{voiceNote}</div>}
          <div className="pt-compose-row">
            <textarea
              ref={box}
              rows={1}
              value={input}
              maxLength={2000}
              aria-label="Message Protron"
              placeholder={listening ? 'Listening…' : 'Ask or tell Protron…'}
              onChange={e => {
                setInput(e.target.value);
                if (speaking) hush();
                const el = e.currentTarget;
                el.style.height = 'auto';
                el.style.height = `${Math.min(140, el.scrollHeight)}px`;
              }}
              onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); void send(input); } }}
            />
            <button type="button" className="pt-round pt-mic" data-on={listening ? '1' : '0'}
              disabled={!v.supported || v.phase === 'transcribing'}
              aria-label={listening ? 'Stop listening' : 'Speak to Protron'}
              title={!v.supported ? 'This browser cannot use a microphone — type instead' : listening ? 'Stop listening' : 'Speak one message'}
              onClick={() => void mic()}>
              {listening ? <Square size={16} /> : <Mic size={18} />}
            </button>
            <button type="button" className="pt-round pt-send" disabled={!input.trim() || busy} aria-label="Send" onClick={() => void send(input)}><Send size={17} /></button>
          </div>
          <div className="pt-foot-note">Protron proposes a plan, and acts once you approve it.</div>
        </div>
      )}
    </section>
  );
}

/**
 * Protron's pointer, resting on its charging dock: the pointer gives off
 * "active" signal arcs while the dock's bolt charges it. Pure SVG + CSS
 * (protron.css `.pt-dock`), still under reduced motion. Decorative.
 */
function PointerDock() {
  return (
    <svg className="pt-dock" viewBox="0 0 64 56" width="64" height="56" aria-hidden focusable="false">
      <defs>
        <linearGradient id="pt-dock-g" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stopColor="#8b5cf6" /><stop offset="1" stopColor="#22d3ee" /></linearGradient>
      </defs>
      {/* the dock */}
      <rect x="8" y="42" width="48" height="10" rx="5" fill="#1e1b4b" />
      <rect className="pt-dock-charge" x="11" y="45" width="42" height="4" rx="2" fill="url(#pt-dock-g)" />
      <path d="M33 38 l-5 7 h4 l-2 6 6-8 h-4 z" fill="#facc15" stroke="#1e1b4b" strokeWidth=".8" className="pt-dock-bolt" />
      {/* signal arcs */}
      <g className="pt-dock-wifi" fill="none" stroke="#22d3ee" strokeWidth="2" strokeLinecap="round">
        <path d="M39 12 a8 8 0 0 1 8 8" /><path d="M39 6 a14 14 0 0 1 14 14" />
      </g>
      {/* the pointer */}
      <path className="pt-dock-pointer" d="M24 8 L24 36 L31 29 L36 40 L40 38 L35 27 L45 27 Z" fill="#d97757" stroke="#fff" strokeWidth="2" strokeLinejoin="round" />
    </svg>
  );
}
