/**
 * Talking to the editor. What is typed (or said) goes to /api/video.php
 * `command`, which turns it into the same validated operations the buttons
 * use (lib/video/commands.ts) — or answers honestly that it cannot. The
 * assistant's own lines ("Your transcript is ready", "Short 2 is ready")
 * come from real job changes seen by the editor's poll, never from a timer.
 */
import { useEffect, useRef, useState } from 'react';
import { Send, Loader, Sparkles } from 'lucide-react';
import VoiceControl from '../Autopilot/voice/VoiceControl';
import { videoCommand, gotoVersion } from '../../services/videoStudio';
import type { EditorCtx } from './VideoEditor';

export interface ChatMsg { who: 'me' | 'ai' | 'sys'; text: string }

const SUGGEST = ['Remove the long pause at the beginning', 'Find the section about pricing', 'Make Short 1 faster', 'Make captions smaller', 'Create another thumbnail', 'Restore my second example'];

export default function AssistantPanel({ ctx, messages }: { ctx: EditorCtx; messages: ChatMsg[] }) {
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);
  const end = useRef<HTMLDivElement>(null);
  useEffect(() => { end.current?.scrollIntoView({ block: 'nearest' }); }, [messages.length]);
  const words = ctx.transcript?.words ?? [];
  const sel = ctx.selection ? { s: words[Math.min(ctx.selection.i0, ctx.selection.i1)]?.s ?? 0, e: words[Math.max(ctx.selection.i0, ctx.selection.i1)]?.e ?? 0 } : null;

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
      ctx.say({ who: 'ai', text: g?.success ? r.reply : 'There is nothing to ' + (r.undo ? 'undo.' : 'redo.') });
      await ctx.refresh();
      return;
    }
    ctx.say({ who: 'ai', text: r.reply ?? r.error ?? 'That did not work.' });
    await ctx.refresh();
  };

  return (
    <div className="vs-col" data-testid="vs-assistant">
      <div className="vs-chat" aria-live="polite">
        {!messages.length && <div className="vs-msg ai"><Sparkles size={13} /> I know this project's video, transcript, Shorts and brand. Ask me to change something — every change can be undone.</div>}
        {messages.map((m, i) => <div key={i} className={`vs-msg ${m.who}`} data-who={m.who}>{m.text}</div>)}
        {busy && <div className="vs-msg ai"><Loader size={13} className="spin" /> Working on it…</div>}
        <div ref={end} />
      </div>
      <div className="vs-chips">{SUGGEST.map(s => <button key={s} type="button" className="vs-chip" onClick={() => void send(s)}>{s}</button>)}</div>
      {sel && <span className="vs-kbd">Your transcript selection ({sel.e - sel.s > 0 ? `${(sel.e - sel.s).toFixed(1)} s` : ''}) is what “this” means.</span>}
      <div className="vs-row">
        <input className="vs-input" style={{ flex: 1 }} placeholder="Tell the editor what to change…" value={text} onChange={e => setText(e.target.value)}
          onKeyDown={e => { if (e.key === 'Enter') void send(); }} data-field="video.command" data-testid="vs-command" />
        <VoiceControl compact onResult={r => setText(t => (t ? `${t} ` : '') + r.text)} />
        <button type="button" className="vs-btn ai sm" onClick={() => void send()} disabled={busy || !text.trim()} aria-label="Send"><Send size={14} /></button>
      </div>
    </div>
  );
}
