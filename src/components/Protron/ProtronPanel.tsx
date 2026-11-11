/**
 * Protron's panel: the conversation, the actions it proposes, and voice.
 *
 * Loaded the first time Protron is opened (Protron.tsx), then kept mounted
 * while hidden so a half-typed message or a waiting confirmation survives
 * minimising. The conversation itself is kept per person and workspace
 * (services/protron/memory.ts), so it also survives moving between screens
 * and reloading.
 *
 * ── A turn ──
 *
 *   1. The customer types or speaks. Speech goes through the same recorder and
 *      transcriber as the Autopilot box; a transcript the engine doubts is put
 *      in the box to be checked instead of being sent.
 *   2. `think` (brain.ts) asks the AI through /api/ai.php for a reply and
 *      proposed actions — or matches the words itself when the AI is down,
 *      and says so.
 *   3. Every proposed action is checked (`checkCall`). Refused ones show as a
 *      refused card with the reason. Read-only ones run at once and their card
 *      says what happened. Anything that creates or spends waits on a card
 *      with Confirm and Cancel; it is checked again when Confirm is pressed.
 *   4. A read action that returns numbers (the workspace overview) is handed
 *      back to the AI once for the answer; that second answer may not act.
 *   5. The reply is read aloud when the customer spoke, or asked for replies
 *      to be spoken. A spoken question gets the microphone back afterwards,
 *      so a conversation can go on hands-free; typing, the microphone or Stop
 *      interrupt the voice at once.
 *
 * ── What it does when the customer changes screen ──
 *
 * With the panel open, a short line says where they are now and offers that
 * screen's starters — written here, not by the AI, so moving around costs
 * nothing. A move Protron itself made is not announced twice.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import {
  Maximize2, Minimize2, Minus, Mic, Square, Send, Volume2, VolumeX, Settings2, RotateCcw,
  Check, X, Loader, Ban, CircleCheck, CircleAlert, Clock,
} from 'lucide-react';
import { useApp } from '../../context/AppContext';
import ProtronAvatar, { type AvatarState } from './ProtronAvatar';
import VoiceBars from '../Autopilot/voice/VoiceBars';
import { useVoiceInput, defaultLocale } from '../Autopilot/voice/useVoiceInput';
import { actionByName, checkCall, needsConfirm, runChecked, type ActionCtx, type Who } from '../../services/protron/actions';
import { think, type BrainReply, type TurnContext } from '../../services/protron/brain';
import { screenContext, startersFor } from '../../services/protron/knowledge';
import { clearTurns, loadTurns, newId, saveTurns, type ActionCard, type Prefs, type Turn } from '../../services/protron/memory';
import { browserSpeaker } from '../../services/protron/voice';
import type { Stage } from '../../types';

const STAGE_COLOURS = ['#6366f1', '#0ea5e9', '#14b8a6', '#f59e0b', '#ef4444', '#8b5cf6', '#22c55e', '#64748b'];
const MIN_GAP_MS = 1200;

/** Cards left mid-run by a reload did not finish as far as anybody can tell. */
function settleInterrupted(turns: Turn[]): Turn[] {
  return turns.map(t => (t.actions?.some(a => a.status === 'running')
    ? { ...t, actions: t.actions.map(a => (a.status === 'running' ? { ...a, status: 'failed' as const, result: 'Interrupted before it finished.' } : a)) }
    : t));
}

export default function ProtronPanel({ open, who, size, onSize, prefs, onPrefs, face, onFace, seed, onClose }: {
  open: boolean;
  who: Who;
  size: 'normal' | 'large';
  onSize: (s: 'normal' | 'large') => void;
  prefs: Prefs;
  onPrefs: (p: Prefs) => void;
  face: AvatarState;
  onFace: (s: AvatarState) => void;
  seed: { message?: string; intro?: string; n: number } | null;
  onClose: () => void;
}) {
  const loc = useLocation();
  const navigate = useNavigate();
  const app = useApp();
  const [turns, setTurns] = useState<Turn[]>(() => settleInterrupted(loadTurns()));
  const turnsRef = useRef(turns);
  const [busy, setBusy] = useState(false);
  const [input, setInput] = useState('');
  const [voiceNote, setVoiceNote] = useState('');
  const [menu, setMenu] = useState(false);
  const [speaking, setSpeaking] = useState(false);
  const [aiDown, setAiDown] = useState(false);
  const [online, setOnline] = useState(() => navigator.onLine);
  const box = useRef<HTMLTextAreaElement>(null);
  const logEnd = useRef<HTMLDivElement>(null);
  const lastSend = useRef(0);
  const navTarget = useRef('');
  const loop = useRef(false);
  const v = useVoiceInput(defaultLocale(), { silenceStopSeconds: 1.8 });

  const commit = useCallback((next: Turn[]) => { turnsRef.current = next; setTurns(next); saveTurns(next); }, []);
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

  /* ── What the actions may touch ── */
  const actx: ActionCtx = useMemo(() => ({
    who,
    navigate: (p: string) => { navTarget.current = p.split('?')[0]; navigate(p); },
    addContact: c => {
      const now = new Date().toISOString();
      app.addContact({
        name: c.name, email: c.email, phone: c.phone, company: c.company, status: 'lead', tags: [],
        source: 'Protron (AI business manager)', createdAt: now, lastActivity: now, value: 0,
      });
    },
    createPipeline: (name, stages) => {
      const p = app.createPipeline(name);
      const list: Stage[] = stages.map((s, i) => ({ id: `stage-${Date.now()}-${i}`, name: s, color: STAGE_COLOURS[i % STAGE_COLOURS.length], deals: [] }));
      app.updatePipeline(p.id, { stages: list });
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
    setProactive: on => onPrefs({ ...prefs, proactive: on }),
    handOffToAutopilot: text => {
      try { sessionStorage.setItem('pc_protron_handoff', text); } catch { /* the wizard opens with an empty box instead */ }
      navTarget.current = '/autopilot';
      navigate('/autopilot?new=1&from=protron');
    },
  }), [who, navigate, app, prefs, onPrefs]);

  /* ── The face follows what is happening ── */
  const settleFace = useCallback((s: AvatarState, ms = 1400) => {
    onFace(s);
    window.setTimeout(() => onFace('idle'), ms);
  }, [onFace]);
  useEffect(() => {
    if (v.phase === 'listening' || v.phase === 'starting') onFace('listening');
    else if (v.phase === 'transcribing') onFace('thinking');
  }, [v.phase, onFace]);

  /* ── Speaking ── */
  const micRef = useRef<() => void>(() => undefined);
  const speak = useCallback(async (text: string) => {
    if (!browserSpeaker.supported() || !text.trim()) return;
    setSpeaking(true);
    onFace('speaking');
    await browserSpeaker.speak(text);
    setSpeaking(false);
    onFace('idle');
    if (loop.current) micRef.current();
  }, [onFace]);
  const hush = useCallback(() => { loop.current = false; browserSpeaker.stop(); setSpeaking(false); onFace('idle'); }, [onFace]);

  /* ── Carrying out a card ── */
  const execute = useCallback(async (turnId: string, card: ActionCard, confirmed: boolean): Promise<{ ok: boolean; data?: Record<string, number | string> }> => {
    /* Checked again at the moment it runs: a card confirmed after a reload,
       or after the customer's permissions changed, is judged as of now. */
    const c = checkCall({ name: card.name, args: card.args }, who);
    if (!c.ok) { patchCard(turnId, card.id, { status: 'refused', result: c.error }); return { ok: false }; }
    patchCard(turnId, card.id, { status: 'running' });
    onFace('working');
    const res = await runChecked(c, actx, confirmed);
    patchCard(turnId, card.id, { status: res.ok ? 'done' : 'failed', result: res.message });
    settleFace(res.ok ? 'done' : 'error', res.ok ? 1200 : 2600);
    return { ok: res.ok, data: res.data };
  }, [who, actx, patchCard, onFace, settleFace]);

  /* Through a ref, because a read action's follow-up answer is delivered by
     the same function that delivered the question's. */
  const respondRef = useRef<(r: BrainReply, ctx: TurnContext, spoken: boolean, allowFollowUp: boolean) => Promise<void>>(async () => undefined);
  const respond = useCallback(async (r: BrainReply, ctx: TurnContext, spoken: boolean, allowFollowUp: boolean) => {
    setAiDown(r.offline);
    const cards: ActionCard[] = (allowFollowUp ? r.actions : []).map(call => {
      const c = checkCall(call, who);
      const def = actionByName(call.name);
      if (!c.ok) return { id: newId(), name: call.name, title: def?.title ?? 'Not available', args: {}, status: 'refused' as const, result: c.error };
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
    };
    if (r.error) turn.text = `${turn.text}${turn.text ? '\n\n' : ''}(${r.error})`;
    commit([...turnsRef.current, turn]);
    if (spoken || prefs.speak) void speak(r.reply);

    for (const card of cards.filter(c => c.status === 'running')) {
      const def = actionByName(card.name);
      const out = await execute(turn.id, card, false);
      if (allowFollowUp && def?.feedsBack && out.ok && out.data) {
        const again = await think(turnsRef.current, { ...ctx, toolResult: { name: card.name, data: out.data } });
        await respondRef.current(again, ctx, spoken, false);
      }
    }
  }, [who, commit, execute, prefs.speak, speak]);
  useEffect(() => { respondRef.current = respond; }, [respond]);

  const send = useCallback(async (raw: string, spoken = false) => {
    const text = raw.trim().slice(0, 2000);
    if (!text || busy) return;
    if (Date.now() - lastSend.current < MIN_GAP_MS) return;
    lastSend.current = Date.now();
    browserSpeaker.stop();
    setSpeaking(false);
    loop.current = spoken;
    setInput('');
    setVoiceNote('');
    const ctx: TurnContext = { who, path: loc.pathname, pageTitle: document.title, business: prefs.business };
    commit([...turnsRef.current, { id: newId(), role: 'user', text, at: Date.now(), path: loc.pathname }]);
    setBusy(true);
    onFace('thinking');
    try {
      const r = await think(turnsRef.current, ctx);
      onFace('idle');
      await respond(r, ctx, spoken, true);
    } catch (e) {
      commit([...turnsRef.current, { id: newId(), role: 'protron', at: Date.now(), text: `Something went wrong on my side: ${e instanceof Error ? e.message : String(e)}`, error: true }]);
      settleFace('error', 2600);
    } finally {
      setBusy(false);
    }
  }, [busy, who, loc.pathname, prefs.business, commit, onFace, respond, settleFace]);

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
    if (browserSpeaker.speaking()) hush();
    if (v.phase === 'listening') { void v.stop(); return; }
    if (v.phase === 'starting' || v.phase === 'transcribing' || busy) return;
    const r = await v.start();
    if (!r || !r.text.trim()) { loop.current = false; onFace('idle'); return; }
    if (r.doubtful) {
      loop.current = false;
      onFace('idle');
      setInput(r.text);
      setVoiceNote(r.note);
      window.setTimeout(() => box.current?.focus(), 0);
      return;
    }
    void send(r.text, true);
  }, [v, busy, hush, onFace, send]);
  useEffect(() => { micRef.current = () => { if (open) void mic(); }; }, [mic, open]);

  /* Hidden: nothing keeps listening or talking. */
  useEffect(() => {
    if (open) { window.setTimeout(() => box.current?.focus(), 50); return; }
    loop.current = false;
    v.cancel();
    browserSpeaker.stop();
    setSpeaking(false);
  // eslint-disable-next-line react-hooks/exhaustive-deps -- only when shown or hidden
  }, [open]);

  /* Opened with something to say: an offer's introduction, or a message to send. */
  const seen = useRef(0);
  useEffect(() => {
    if (!seed || seed.n === seen.current) return;
    seen.current = seed.n;
    if (seed.intro) {
      commit([...turnsRef.current, { id: newId(), role: 'protron', at: Date.now(), path: loc.pathname, text: seed.intro, suggestions: startersFor(loc.pathname) }]);
    }
    if (seed.message) { lastSend.current = 0; void send(seed.message); }
  // eslint-disable-next-line react-hooks/exhaustive-deps -- once per seed
  }, [seed]);

  /* A new screen, while the panel is open: say where they are now. */
  useEffect(() => {
    if (!open) return;
    const list = turnsRef.current;
    const last = list[list.length - 1];
    if (!last || last.path === loc.pathname) return;
    if (navTarget.current === loc.pathname) { navTarget.current = ''; commit(list.map((t, i) => (i === list.length - 1 ? { ...t, path: loc.pathname } : t))); return; }
    const here = screenContext(loc.pathname, who);
    commit([...list, {
      id: newId(), role: 'protron', at: Date.now(), path: loc.pathname,
      text: `You're now in ${here.label}${here.desc ? ` — ${here.desc.charAt(0).toLowerCase()}${here.desc.slice(1)}` : ''}. Want a hand with anything here?`,
      suggestions: startersFor(loc.pathname),
    }]);
  }, [loc.pathname, open, who, commit]);

  useEffect(() => { logEnd.current?.scrollIntoView({ block: 'end' }); }, [turns.length, busy, open]);

  const newConversation = () => {
    hush();
    clearTurns();
    commit([]);
    setMenu(false);
  };

  const here = screenContext(loc.pathname, who);
  const status: { text: string; tone: 'ok' | 'warn' | 'bad' } = !online ? { text: 'You are offline', tone: 'bad' }
    : v.phase === 'listening' ? { text: 'Listening…', tone: 'ok' }
      : v.phase === 'transcribing' ? { text: 'Working out what you said…', tone: 'ok' }
        : busy ? { text: 'Thinking…', tone: 'ok' }
          : speaking ? { text: 'Speaking…', tone: 'ok' }
            : face === 'working' ? { text: 'Carrying it out…', tone: 'ok' }
              : aiDown ? { text: 'Basic mode — AI not answering', tone: 'warn' }
                : { text: `Ready · on ${here.label}`, tone: 'ok' };

  const side = prefs.dock && prefs.dock.x > 0.5 ? 'right' : 'left';
  const listening = v.phase === 'listening' || v.phase === 'starting';
  const lastTurn = turns[turns.length - 1];

  return (
    <section
      className="pt-panel"
      role="dialog"
      aria-label="Protron, your AI business manager"
      data-size={size}
      data-side={side}
      hidden={!open}
      onKeyDown={e => { if (e.key === 'Escape') { e.stopPropagation(); onClose(); } }}
    >
      <header className="pt-head-bar">
        <span className="pt-mini" style={{ width: 44, height: 44 }}><ProtronAvatar size={40} state={face} /></span>
        <span className="pt-title">
          <b>Protron</b>
          <span className="pt-status" data-tone={status.tone} aria-live="polite"><i aria-hidden />{status.text}</span>
        </span>
        <button type="button" className="pt-icon" aria-pressed={prefs.speak} title={prefs.speak ? 'Stop reading replies aloud' : 'Read replies aloud'}
          aria-label={prefs.speak ? 'Stop reading replies aloud' : 'Read replies aloud'}
          onClick={() => { if (prefs.speak) hush(); onPrefs({ ...prefs, speak: !prefs.speak }); }}>
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
          <label>
            <input type="checkbox" checked={prefs.proactive} onChange={e => onPrefs({ ...prefs, proactive: e.target.checked })} />
            <span>Offer help when I seem stuck<small>At most three times a day, never twice in ten minutes. Protron only offers — it never acts on its own.</small></span>
          </label>
          <label>
            <input type="checkbox" checked={prefs.speak} onChange={e => { if (!e.target.checked) hush(); onPrefs({ ...prefs, speak: e.target.checked }); }} />
            <span>Read replies aloud<small>Spoken questions are always answered aloud. Your voice is turned into text and not kept.</small></span>
          </label>
          <label style={{ display: 'grid', gap: 4, cursor: 'default' }}>
            <span style={{ fontWeight: 600 }}>Your business, so answers fit it</span>
            <input data-field="protron.business" className="pt-input" style={{ font: 'inherit', fontSize: 13, padding: '7px 9px', border: '1px solid #e2e5ea', borderRadius: 9, marginTop: 0 }}
              value={prefs.business.name} maxLength={80} placeholder="Company name"
              onChange={e => onPrefs({ ...prefs, business: { ...prefs.business, name: e.target.value } })} />
            <input className="pt-input" style={{ font: 'inherit', fontSize: 13, padding: '7px 9px', border: '1px solid #e2e5ea', borderRadius: 9, marginTop: 0 }}
              value={prefs.business.about} maxLength={200} placeholder="What you do, e.g. roofing in Dallas, TX"
              onChange={e => onPrefs({ ...prefs, business: { ...prefs.business, about: e.target.value } })} />
          </label>
          {prefs.dock && <button type="button" className="pt-btn" style={{ justifySelf: 'start' }} onClick={() => onPrefs({ ...prefs, dock: null })}>Put Protron back in the corner</button>}
          <button type="button" className="pt-danger" onClick={newConversation}>Clear this conversation</button>
          <small>Kept in this browser for you and this workspace only. Clearing removes it.</small>
        </div>
      )}

      <div className="pt-log" aria-live="polite">
        {!turns.length && (
          <div style={{ display: 'grid', gap: 12, justifyItems: 'start' }}>
            <div className="pt-msg pt-msg-bot">
              <span className="pt-mini"><ProtronAvatar size={22} state="idle" alive={false} /></span>
              <span className="pt-bubble-text">
                Hi, I&rsquo;m <b>Protron</b>, your AI business manager. Ask me how anything in here works, or tell me what you want done — I can open the right screen, search for prospects, start an AI Autopilot business workspace, add contacts and set up a deals pipeline.
                {'\n\n'}Anything that sends, publishes, deletes or charges stays your button to press. You&rsquo;re on <b>{here.label}</b>.
              </span>
            </div>
            <div className="pt-sugs">
              {startersFor(loc.pathname).map(s => <button key={s} type="button" className="pt-sug" onClick={() => void send(s)}>{s}</button>)}
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
                  {t.offline && !t.error && <span className="pt-note" style={{ display: 'block' }}>Answered without the AI.</span>}
                  {(t.actions ?? []).map(a => (
                    <div key={a.id} className="pt-card">
                      <div className="pt-card-top">
                        {a.status === 'done' ? <CircleCheck size={15} color="#16a34a" />
                          : a.status === 'failed' ? <CircleAlert size={15} color="#dc2626" />
                            : a.status === 'refused' ? <Ban size={15} color="#dc2626" />
                              : a.status === 'running' ? <Loader size={15} className="spin" />
                                : a.status === 'cancelled' ? <X size={15} color="#64748b" /> : <Clock size={15} color="#b45309" />}
                        <span>{a.title}</span>
                        <span className="pt-chip" data-s={a.status}>
                          {a.status === 'waiting' ? 'Needs your OK' : a.status === 'running' ? 'Working' : a.status === 'done' ? 'Done' : a.status === 'failed' ? 'Did not work' : a.status === 'refused' ? 'Not allowed' : 'Cancelled'}
                        </span>
                      </div>
                      {a.status === 'waiting' && a.confirmText && <p>{a.confirmText}</p>}
                      {a.result && <p>{a.result}</p>}
                      {a.status === 'waiting' && (
                        <div className="pt-card-row">
                          <button type="button" className="pt-btn pt-btn-primary" onClick={() => void execute(t.id, a, true)}><Check size={14} /> Confirm</button>
                          <button type="button" className="pt-btn" onClick={() => patchCard(t.id, a.id, { status: 'cancelled', result: 'Cancelled — nothing was changed.' })}>Cancel</button>
                        </div>
                      )}
                    </div>
                  ))}
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
            <span style={{ position: 'absolute', width: 1, height: 1, overflow: 'hidden', clip: 'rect(0 0 0 0)' }}>Protron is thinking</span>
          </div>
        )}
        <div ref={logEnd} />
      </div>

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
            aria-label={listening ? 'Stop listening' : 'Talk to Protron'}
            title={!v.supported ? 'This browser cannot use a microphone — type instead' : listening ? 'Stop listening' : 'Talk to Protron (turn by turn)'}
            onClick={() => void mic()}>
            {listening ? <Square size={16} /> : <Mic size={18} />}
          </button>
          <button type="button" className="pt-round pt-send" disabled={!input.trim() || busy} aria-label="Send" onClick={() => void send(input)}><Send size={17} /></button>
        </div>
        <div className="pt-foot-note">Protron can be wrong. It never sends, publishes, deletes or charges for you.</div>
      </div>
    </section>
  );
}
