/**
 * The editor's panels that change the edit: Transcript, Cleanup, Shorts and
 * Captions. Each one only ever sends operations (edit.ts `Op`) through
 * `ctx.apply`, the same ones the assistant's sentences become.
 *
 * ── Two different things, said differently ──
 *
 * In the transcript, *Remove from video* cuts the spoken words out of the
 * picture and the sound; *Fix caption text* changes only what the captions
 * say and leaves the video exactly as it was. They are separate buttons with
 * separate words, because confusing them deletes something somebody meant
 * to keep.
 */
import { askConfirm } from '../shared/ConfirmDialog';
import { memo, useEffect, useMemo, useRef, useState } from 'react';
import { Scissors, RotateCcw, Shield, Film, Type, Play, Search, Check, X, ChevronUp, ChevronDown, Wand2, Sparkles, Trash2, Clapperboard } from 'lucide-react';
import {
  clock, cleanupSummary, effectiveCuts, isRtl, keepRanges, keptLength, runCleanup, videoCommand, renderOutputs, CAPTION_PRESETS,
  type CaptionStyle, type CleanupPreset, type Cut, type Sentence, type Word, type CaptionPreset,
} from '../../services/videoStudio';
import type { EditorCtx } from './VideoEditor';

/* The transcript editor lives in TranscriptEditor.tsx. */
export { TranscriptPanel } from './TranscriptEditor';

/* ── Cleanup ──────────────────────────────────────────────────────────────── */

const KIND_LABEL: Record<string, string> = { filler: 'Filler', gap: 'Pause', repeat: 'Repeat', false_start: 'False start', retake: 'Retake', manual: 'Your cut' };

function CutRow({ c, ctx }: { c: Cut; ctx: EditorCtx }) {
  return (
    <div className={`vs-item ${c.state === 'proposed' ? 'prop' : c.state === 'rejected' ? 'rej' : ''}`} data-cut={c.id} data-state={c.state} data-kind={c.kind}>
      <div className="vs-row">
        <b style={{ fontSize: 13 }}>{KIND_LABEL[c.kind] ?? c.kind}</b>
        <span className="vs-meta"><span>{clock(c.s)}–{clock(c.e)} ({(c.e - c.s).toFixed(1)} s)</span><span>{Math.round(c.conf * 100)}% sure</span><span>{c.by === 'you' ? 'by you' : c.by === 'ai' ? 'by AI' : 'by rule'}</span></span>
        <span className="vs-spacer" />
        <button type="button" className="vs-btn ghost sm" aria-label="Play" onClick={() => ctx.seek(Math.max(0, c.s - 1.5))}><Play size={13} /></button>
        {c.state !== 'approved' && <button type="button" className="vs-btn sm ok" data-act="approve" onClick={() => void ctx.apply([{ op: 'cut.set', id: c.id, state: 'approved' }], `Approved: ${c.reason}`)}><Check size={13} /> Approve</button>}
        {c.state === 'proposed' && <button type="button" className="vs-btn sm" data-act="reject" onClick={() => void ctx.apply([{ op: 'cut.set', id: c.id, state: 'rejected' }], `Rejected: ${c.reason}`)}><X size={13} /> Reject</button>}
        {c.state === 'approved' && <button type="button" className="vs-btn sm" data-act="restore" onClick={() => void ctx.apply([{ op: 'cut.set', id: c.id, state: 'rejected' }], `Restored: ${c.reason}`)}><RotateCcw size={13} /> Restore</button>}
        <button type="button" className="vs-btn ghost sm" title="Protect this part from any cut" aria-label="Protect" onClick={() => void ctx.apply([{ op: 'protect.add', s: c.s, e: c.e, note: 'Protected from cleanup' }], 'Protected a part')}><Shield size={13} /></button>
      </div>
      <span style={{ fontSize: 13 }}>{c.reason}</span>
    </div>
  );
}

export function CleanupPanel({ ctx }: { ctx: EditorCtx }) {
  const { doc } = ctx;
  const [more, setMore] = useState(false);
  const [running, setRunning] = useState(false);
  const summary = cleanupSummary(doc.cuts);
  const proposed = doc.cuts.filter(c => c.state === 'proposed');
  const approved = doc.cuts.filter(c => c.state === 'approved');
  const rejected = doc.cuts.filter(c => c.state === 'rejected');
  const before = ctx.duration, after = keptLength(keepRanges(ctx.duration, doc));
  const preset = async (p: CleanupPreset) => {
    setRunning(true);
    const r = await runCleanup(ctx.view.project.id, ctx.version, p);
    setRunning(false);
    if (r.success) await ctx.refresh();
    else ctx.say({ who: 'ai', text: r.error ?? 'Cleanup could not run.' });
  };
  if (!ctx.transcript) return <p className="vs-sub">Cleanup suggestions appear once the recording is transcribed.</p>;
  const shown = more ? approved : approved.slice(0, 40);
  return (
    <div className="vs-col" data-testid="vs-cleanup">
      <div className="vs-row" role="radiogroup" aria-label="Cleanup level">
        {(['conservative', 'balanced', 'aggressive'] as CleanupPreset[]).map(p => (
          <button key={p} type="button" role="radio" aria-checked={doc.cleanup.preset === p} className="vs-chip" aria-pressed={doc.cleanup.preset === p} disabled={running} onClick={() => void preset(p)} data-preset={p}>
            {p[0].toUpperCase() + p.slice(1)}{p === 'balanced' ? ' (default)' : ''}
          </button>
        ))}
        {running && <span className="vs-kbd">Re-reading…</span>}
      </div>
      <p className="vs-kbd" style={{ margin: 0 }}>
        Pauses are shortened, never removed, and only where the sound is quiet too. Fillers standing alone and pauses start applied; anything that changes what is said — repeats, false starts — waits for you. Numbers, prices, dates and “not” are never cut.
      </p>
      <div className="vs-note ok" data-testid="vs-cleanup-summary">
        <Sparkles size={15} /> <span>{clock(before)} → {clock(after)} with what is approved now. {summary.map(s => `${s.n} ${KIND_LABEL[s.kind]?.toLowerCase() ?? s.kind}${s.n === 1 ? '' : 's'} (${s.approved} applied)`).join(' · ') || 'Nothing to clean up.'}</span>
      </div>
      {proposed.length > 0 && (
        <>
          <div className="vs-row">
            <h3 style={{ margin: 0 }}>To review · {proposed.length}</h3>
            <span className="vs-spacer" />
            <button type="button" className="vs-btn sm ok" onClick={() => void ctx.apply([{ op: 'cut.setMany', ids: proposed.map(c => c.id), state: 'approved' }], `Approved ${proposed.length} suggestions`)}>Approve all</button>
            <button type="button" className="vs-btn sm" onClick={() => void ctx.apply([{ op: 'cut.setMany', ids: proposed.map(c => c.id), state: 'rejected' }], `Rejected ${proposed.length} suggestions`)}>Reject all</button>
          </div>
          <div className="vs-list">{proposed.slice(0, 120).map(c => <CutRow key={c.id} c={c} ctx={ctx} />)}</div>
        </>
      )}
      {approved.length > 0 && (
        <>
          <h3 style={{ margin: '6px 0 0' }}>Applied · {approved.length}</h3>
          <div className="vs-list">{shown.map(c => <CutRow key={c.id} c={c} ctx={ctx} />)}</div>
          {approved.length > shown.length && <button type="button" className="vs-btn ghost sm" onClick={() => setMore(true)}>Show all {approved.length}</button>}
        </>
      )}
      {rejected.length > 0 && <details><summary className="vs-kbd" style={{ cursor: 'pointer' }}>Rejected · {rejected.length}</summary><div className="vs-list" style={{ marginTop: 8 }}>{rejected.slice(0, 100).map(c => <CutRow key={c.id} c={c} ctx={ctx} />)}</div></details>}
      {doc.protects.length > 0 && (
        <>
          <h3 style={{ margin: '6px 0 0' }}>Protected · {doc.protects.length}</h3>
          <div className="vs-list">{doc.protects.map(p => (
            <div key={p.id} className="vs-item"><div className="vs-row"><Shield size={13} color="#12a594" /><span>{clock(p.s)}–{clock(p.e)} {p.note && `· ${p.note}`}</span><span className="vs-spacer" />
              <button type="button" className="vs-btn ghost sm" onClick={() => void ctx.apply([{ op: 'protect.remove', id: p.id }], 'Removed a protection')}>Unprotect</button></div></div>
          ))}</div>
        </>
      )}
    </div>
  );
}

/* ── Shorts ───────────────────────────────────────────────────────────────── */

export function ShortsPanel({ ctx, sentences }: { ctx: EditorCtx; sentences: Sentence[] }) {
  const { doc, view } = ctx;
  const [ask, setAsk] = useState('');
  const [asking, setAsking] = useState(false);
  const [answer, setAnswer] = useState('');
  const outFor = (clipId: string) => view.outputs.find(o => o.kind === 'short' && o.clipId === clipId);
  const jobFor = (outId: string) => view.jobs.find(j => j.target === outId && j.kind === 'render' && (j.state === 'running' || j.state === 'queued'));
  /* Nudge to the next sentence boundary either way. */
  const nudge = (s: number, dir: -1 | 1, edge: 'start' | 'end') => {
    const marks = sentences.map(x => edge === 'start' ? x.s : x.e);
    const next = dir < 0 ? [...marks].reverse().find(m => m < s - 0.05) : marks.find(m => m > s + 0.05);
    return next ?? s;
  };
  const find = async () => {
    if (!ask.trim()) return;
    setAsking(true);
    const text = /^(find|make|create)/i.test(ask.trim()) ? ask.trim() : `Find the section about ${ask.trim()}`;
    const r = await videoCommand(view.project.id, ctx.version, text, null, null);
    setAsking(false);
    setAnswer(r.reply ?? r.error ?? '');
    if (r.success) await ctx.refresh();
  };
  return (
    <div className="vs-col" data-testid="vs-shorts">
      <div className="vs-row">
        <input className="vs-input" style={{ flex: 1, minWidth: 200 }} value={ask} onChange={e => setAsk(e.target.value)} onKeyDown={e => { if (e.key === 'Enter') void find(); }}
          placeholder="Find the section about AI Prospecting…" data-field="video.command" data-testid="vs-find" />
        <button type="button" className="vs-btn ai sm" onClick={() => void find()} disabled={asking}><Wand2 size={13} /> Find it</button>
      </div>
      {answer && <div className="vs-note">{answer}</div>}
      <p className="vs-kbd" style={{ margin: 0 }}>Scores are the AI's editorial reading of each passage (1–5). They are not a prediction of views or reach.</p>
      {!doc.clips.length && <p className="vs-sub">{ctx.transcript ? 'No Shorts yet — find a section above, or select words in the transcript and choose “Make a Short”.' : 'Shorts are chosen once the transcript is ready.'}</p>}
      {doc.clips.map((c, n) => {
        const o = outFor(c.id);
        const job = o ? jobFor(o.id) : undefined;
        const kept = keptLength(keepRanges(ctx.duration, doc, [c.s, c.e]));
        return (
          <div key={c.id} className="vs-item" data-testid="vs-clip" data-clip={c.id} style={ctx.activeClip === c.id ? { borderColor: '#5b46e5' } : undefined}>
            <div className="vs-row">
              <span className="vs-badge processing">Short {n + 1}</span>
              <input className="vs-input" style={{ flex: 1, minWidth: 160, fontWeight: 700, padding: '5px 8px' }} defaultValue={c.title} key={`${c.id}:${c.title}`} aria-label="Short title"
                onBlur={e => { if (e.target.value.trim() && e.target.value !== c.title) void ctx.apply([{ op: 'clip.update', id: c.id, patch: { title: e.target.value.trim() } }], 'Renamed a Short'); }} />
              {o && <span className={`vs-badge ${o.status}`}>{job ? (job.progress !== null ? `Rendering ${Math.round(job.progress)}%` : 'Rendering…') : o.stale ? 'Edited — render again' : o.status === 'needs_review' ? 'Needs review' : o.status.replace(/_/g, ' ')}</span>}
            </div>
            <div className="vs-meta">
              <span>{clock(kept)} long</span><span>from {clock(c.s)}–{clock(c.e)}</span>{c.topic && <span>Topic: {c.topic}</span>}<span>{c.by === 'ai' ? 'Chosen by AI' : c.by === 'rules' ? 'Chosen by rule' : 'Chosen by you'}</span>
            </div>
            <span style={{ fontSize: 13 }}>{c.reason}</span>
            {c.scores && <div className="vs-scores">{(['hook', 'clarity', 'relevance', 'completeness'] as const).map(k => <span key={k}>{k[0].toUpperCase() + k.slice(1)} <b>{c.scores![k]}</b>/5</span>)}</div>}
            <div className="vs-row">
              <button type="button" className="vs-btn sm" onClick={() => { ctx.setActiveClip(c.id); }} data-act="preview"><Play size={13} /> Preview</button>
              <span className="vs-kbd">Start</span>
              <button type="button" className="vs-btn ghost sm" aria-label="Start earlier" onClick={() => void ctx.apply([{ op: 'clip.update', id: c.id, patch: { s: nudge(c.s, -1, 'start') } }], 'Short starts earlier')}><ChevronUp size={13} /></button>
              <button type="button" className="vs-btn ghost sm" aria-label="Start later" data-act="start-later" onClick={() => void ctx.apply([{ op: 'clip.update', id: c.id, patch: { s: nudge(c.s, 1, 'start') } }], 'Short starts later')}><ChevronDown size={13} /></button>
              <span className="vs-kbd">End</span>
              <button type="button" className="vs-btn ghost sm" aria-label="End earlier" onClick={() => void ctx.apply([{ op: 'clip.update', id: c.id, patch: { e: nudge(c.e, -1, 'end') } }], 'Short ends earlier')}><ChevronUp size={13} /></button>
              <button type="button" className="vs-btn ghost sm" aria-label="End later" onClick={() => void ctx.apply([{ op: 'clip.update', id: c.id, patch: { e: nudge(c.e, 1, 'end') } }], 'Short ends later')}><ChevronDown size={13} /></button>
              <span className="vs-spacer" />
              <button type="button" className="vs-btn ghost sm danger" aria-label="Remove this Short" onClick={async () => { if (await askConfirm({ title: `Remove “${c.title}”?`, message: 'This Short is taken out of the video’s Shorts.', confirmLabel: 'Remove Short', danger: true })) void ctx.apply([{ op: 'clip.remove', id: c.id }], 'Removed a Short'); }}><Trash2 size={13} /></button>
            </div>
            <div className="vs-row">
              <select className="vs-select" style={{ width: 'auto' }} value={c.aspect} aria-label="Shape" onChange={e => void ctx.apply([{ op: 'clip.update', id: c.id, patch: { aspect: e.target.value as typeof c.aspect } }], 'Changed a Short\'s shape')}>
                <option value="9:16">9:16</option><option value="1:1">1:1</option><option value="4:5">4:5</option><option value="16:9">16:9</option>
              </select>
              <select className="vs-select" style={{ width: 'auto' }} value={c.reframe.mode} aria-label="Framing" onChange={e => void ctx.apply([{ op: 'clip.update', id: c.id, patch: { reframe: { mode: e.target.value as 'crop' | 'fit' } } }], 'Changed framing')}>
                <option value="crop">Crop</option><option value="fit">Fit whole screen</option>
              </select>
              {c.reframe.mode === 'crop' && (
                <label className="vs-row" style={{ gap: 6, fontSize: 12.5, color: 'var(--muted)', flex: 1, minWidth: 160 }}>Position
                  <input type="range" min={0} max={100} defaultValue={Math.round(c.reframe.x * 100)} key={`${c.id}:${c.reframe.x}`} style={{ flex: 1 }} aria-label="Crop position"
                    onMouseUp={e => void ctx.apply([{ op: 'clip.update', id: c.id, patch: { reframe: { x: Number((e.target as HTMLInputElement).value) / 100 } } }], 'Moved the crop')}
                    onKeyUp={e => void ctx.apply([{ op: 'clip.update', id: c.id, patch: { reframe: { x: Number((e.target as HTMLInputElement).value) / 100 } } }], 'Moved the crop')} />
                </label>
              )}
              {o?.stale && <button type="button" className="vs-btn ai sm" data-act="rerender" onClick={() => void renderOutputs(view.project.id, [o.id]).then(() => ctx.refresh())}><Clapperboard size={13} /> Render again</button>}
            </div>
          </div>
        );
      })}
    </div>
  );
}

/* ── Captions ─────────────────────────────────────────────────────────────── */

export function CaptionsPanel({ ctx }: { ctx: EditorCtx }) {
  const { doc, view } = ctx;
  const [target, setTarget] = useState<'short' | 'long'>(doc.clips.length ? 'short' : 'long');
  const st = doc.captions[target];
  const set = (patch: Partial<CaptionStyle>, note: string) => void ctx.apply([{ op: 'caption.style', target, patch }], note);
  const staleCount = view.outputs.filter(o => o.stale).length;
  return (
    <div className="vs-col" data-testid="vs-captions">
      <div className="vs-row">
        <label className="vs-row" style={{ gap: 6, fontSize: 13 }}><input type="checkbox" checked={doc.captions.on} onChange={e => void ctx.apply([{ op: 'captions.set', on: e.target.checked }], e.target.checked ? 'Captions on' : 'Captions off')} /> Captions on</label>
        <label className="vs-row" style={{ gap: 6, fontSize: 13 }}><input type="checkbox" checked={doc.captions.burn} disabled={!doc.captions.on} onChange={e => void ctx.apply([{ op: 'captions.set', burn: e.target.checked }], 'Burn-in changed')} /> Burned into the video</label>
        <span className="vs-spacer" />
        <div className="vs-row" role="tablist">
          <button type="button" className="vs-chip" aria-pressed={target === 'short'} onClick={() => setTarget('short')}>Shorts</button>
          <button type="button" className="vs-chip" aria-pressed={target === 'long'} onClick={() => setTarget('long')}>Long video</button>
        </div>
      </div>
      <div className="vs-row">
        {(Object.keys(CAPTION_PRESETS) as CaptionPreset[]).map(p => (
          <button key={p} type="button" className="vs-chip" aria-pressed={st.preset === p} onClick={() => set({ preset: p }, `Caption style: ${p}`)}>{p[0].toUpperCase() + p.slice(1)}</button>
        ))}
      </div>
      <label className="vs-label">Size · {Math.round(st.size * 100)}%
        <input type="range" min={60} max={160} step={5} defaultValue={Math.round(st.size * 100)} key={`${target}:${st.size}`} onMouseUp={e => set({ size: Number((e.target as HTMLInputElement).value) / 100 }, 'Caption size')} onKeyUp={e => set({ size: Number((e.target as HTMLInputElement).value) / 100 }, 'Caption size')} aria-label="Caption size" />
      </label>
      <div className="vs-row">
        {(['top', 'middle', 'bottom'] as const).map(p => <button key={p} type="button" className="vs-chip" aria-pressed={st.position === p} onClick={() => set({ position: p }, `Captions at the ${p}`)}>{p[0].toUpperCase() + p.slice(1)}</button>)}
      </div>
      <div className="vs-row">
        <label className="vs-label" style={{ flex: 1 }}>Text <input type="color" className="vs-input" style={{ height: 36, padding: 3 }} value={st.color} onChange={e => set({ color: e.target.value }, 'Caption colour')} /></label>
        <label className="vs-label" style={{ flex: 1 }}>Highlighted words <input type="color" className="vs-input" style={{ height: 36, padding: 3 }} value={st.highlight} onChange={e => set({ highlight: e.target.value }, 'Highlight colour')} /></label>
      </div>
      <div className="vs-row">
        {([['uppercase', 'Capitals'], ['outline', 'Outline'], ['shadow', 'Shadow'], ['box', 'Background box']] as const).map(([k, l]) => (
          <label key={k} className="vs-row" style={{ gap: 6, fontSize: 13 }}><input type="checkbox" checked={st[k]} onChange={e => set({ [k]: e.target.checked } as Partial<CaptionStyle>, `${l} ${e.target.checked ? 'on' : 'off'}`)} /> {l}</label>
        ))}
      </div>
      <div className="vs-note"><Type size={15} /> <span>The preview shows the style now. Burned-in captions change on the next render{staleCount ? ` — ${staleCount} video${staleCount === 1 ? '' : 's'} to render again (button at the top)` : ''}. Captions follow every cut automatically, and Turkish and Urdu are set in fonts that carry them.</span></div>
      <h3 style={{ margin: '4px 0 0' }}>Caption files</h3>
      {view.outputs.filter(o => o.srtUrl).map(o => (
        <div key={o.id} className="vs-row" style={{ fontSize: 13 }}>
          <span style={{ flex: 1 }}>{o.kind === 'long' ? 'Long video' : o.title}</span>
          <a className="vs-btn sm" href={o.srtUrl}>SRT</a><a className="vs-btn sm" href={o.vttUrl}>VTT</a>
        </div>
      ))}
      {!view.outputs.some(o => o.srtUrl) && <p className="vs-sub">SRT and VTT files are written with each render.</p>}
    </div>
  );
}
