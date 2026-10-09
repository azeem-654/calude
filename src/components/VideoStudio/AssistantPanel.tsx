/**
 * Talking to the editor. What is typed (or said) goes to /api/video.php
 * `command`, which turns it into the same validated operations the buttons
 * use (lib/video/commands.ts) — several in one sentence ("remove the
 * background noise and add calm music to all the videos") — or answers
 * honestly that it cannot. The assistant's own lines ("Your transcript is
 * ready", "Short 2 is ready") come from real job changes seen by the
 * editor's poll, never from a timer.
 */
import { useEffect, useRef, useState } from 'react';
import { Send, Loader, Sparkles, AudioLines, Music2, Scissors, Film, Captions, Wand2 } from 'lucide-react';
import VoiceControl from '../Autopilot/voice/VoiceControl';
import { videoCommand, gotoVersion } from '../../services/videoStudio';
import { getSession } from '../../services/auth';
import type { EditorCtx } from './VideoEditor';

export interface ChatMsg { who: 'me' | 'ai' | 'sys'; text: string }

/* Each one is a sentence the command reader understands (commands.ts); the
   Short needs its subject, so it is put in the box to finish rather than sent. */
const QUICK: { icon: typeof Film; label: string; hint: string; say: string; fill?: boolean }[] = [
  { icon: AudioLines, label: 'Remove background noise', hint: 'In every video', say: 'Remove the background noise in all of the videos' },
  { icon: Music2, label: 'Add background music', hint: 'Royalty-free, calm', say: 'Add calm background music to all the videos' },
  { icon: Scissors, label: 'Remove the long pauses', hint: 'Silence shortened', say: 'Remove the long pauses' },
  { icon: Film, label: 'Make a Short about…', hint: 'Name the subject', say: 'Find the section about ', fill: true },
  { icon: Captions, label: 'Bigger captions', hint: 'Easier to read', say: 'Make captions bigger' },
];

export default function AssistantPanel({ ctx, messages, inputRef }: { ctx: EditorCtx; messages: ChatMsg[]; inputRef?: React.RefObject<HTMLInputElement | null> }) {
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);
  const end = useRef<HTMLDivElement>(null);
  useEffect(() => { end.current?.scrollIntoView({ block: 'nearest' }); }, [messages.length]);
  const words = ctx.transcript?.words ?? [];
  const sel = ctx.selection ? { s: words[Math.min(ctx.selection.i0, ctx.selection.i1)]?.s ?? 0, e: words[Math.max(ctx.selection.i0, ctx.selection.i1)]?.e ?? 0 } : null;
  const first = (getSession()?.user?.name || '').trim().split(/\s+/)[0];

  const send = async (t = text) => {
    const q = t.trim();
    if (!q || busy) return;
    ctx.say({ who: 'me', text: q });
    setText('');
    setBusy(true);
    const r = await videoCommand(ctx.view.project.id, ctx.version, q, sel, ctx.activeClip);
    setBusy(false);
    if (r.undo || r.redo) {
      const v = r.undo ? ctx.version - 1 : ctx.version + 1;
      const g = v >= 1 && v <= ctx.view.maxVersion ? await gotoVersion(ctx.view.project.id, v) : null;
      if (g?.success) ctx.adopt(g.doc, g.docVersion);
      ctx.say({ who: 'ai', text: g?.success ? r.reply : 'There is nothing to ' + (r.undo ? 'undo.' : 'redo.') });
      await ctx.refresh();
      return;
    }
    if (r.doc && r.docVersion) ctx.adopt(r.doc, r.docVersion);
    ctx.say({ who: 'ai', text: r.reply ?? r.error ?? 'That did not work.' });
    await ctx.refresh();
  };

  return (
    <div className="vse-ai" data-testid="vs-assistant">
      <div className="vs-row" style={{ gap: 10, flexWrap: 'nowrap' }}>
        <span className="vs-mark" style={{ width: 34, height: 34, borderRadius: 11 }}><Sparkles size={17} /></span>
        <div className="vse-ai-hello">{first ? `Hi ${first}!` : 'Hi!'} How can I help you?</div>
      </div>
      {!messages.length && (
        <div className="vse-quick">
          {QUICK.map(q => (
            <button key={q.label} type="button" onClick={() => { if (q.fill) { setText(q.say); inputRef?.current?.focus(); } else void send(q.say); }} disabled={busy}>
              <i><q.icon size={15} /></i>
              <span><b>{q.label}</b><small>{q.hint}</small></span>
            </button>
          ))}
        </div>
      )}
      {messages.length > 0 && (
        <div className="vs-chat" aria-live="polite">
          {messages.map((m, i) => <div key={i} className={`vs-msg ${m.who}`} data-who={m.who}>{m.text}</div>)}
          {busy && <div className="vs-msg ai"><Loader size={13} className="spin" /> Working on it…</div>}
          <div ref={end} />
        </div>
      )}
      {messages.length > 0 && (
        <div className="vs-chips">{QUICK.slice(0, 3).map(q => <button key={q.label} type="button" className="vs-chip" onClick={() => void send(q.say)} disabled={busy}>{q.label}</button>)}</div>
      )}
      {sel && <span className="vs-kbd">Your selection ({(sel.e - sel.s).toFixed(1)} s) is what “this” means.</span>}
      <div className="vse-ai-input">
        <Wand2 size={15} color="#c084fc" style={{ flex: 'none' }} />
        <input ref={inputRef} placeholder="Ask AI to edit — “remove the noise and add upbeat music”" value={text} onChange={e => setText(e.target.value)}
          onKeyDown={e => { if (e.key === 'Enter') void send(); }} data-field="video.command" data-testid="vs-command" aria-label="Tell the editor what to change" />
        <VoiceControl compact onResult={r => setText(t => (t ? `${t} ` : '') + r.text)} />
        <button type="button" className="vs-btn ai sm" onClick={() => void send()} disabled={busy || !text.trim()} aria-label="Send"><Send size={14} /></button>
      </div>
      <span className="vs-kbd">Every change is a new version — undo with Ctrl+Z.</span>
    </div>
  );
}
