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
import { memo, useEffect, useMemo, useRef, useState } from 'react';
import { Scissors, RotateCcw, Shield, Film, Type, Play, Search, Check, X, ChevronUp, ChevronDown, Wand2, Sparkles, Trash2, Clapperboard } from 'lucide-react';
import {
  clock, cleanupSummary, effectiveCuts, isRtl, keepRanges, keptLength, runCleanup, videoCommand, renderOutputs, CAPTION_PRESETS,
  type CaptionStyle, type CleanupPreset, type Cut, type Sentence, type Word, type CaptionPreset,
} from '../../services/videoStudio';
import type { EditorCtx } from './VideoEditor';

/* ── Transcript ───────────────────────────────────────────────────────────── */

type WordState = '' | 'cut' | 'prop';

const Para = memo(function Para({ words, states, prot, edits, low, nowI, sel, hits, rtl }: {
  words: Word[]; states: WordState[]; prot: boolean[]; edits: Record<string, string>; low: boolean[]; nowI: number; sel: [number, number] | null; hits: Set<number>; rtl: boolean;
}) {
  return (
    <p dir={rtl ? 'rtl' : undefined}>
      <span className="vs-time-tag">{clock(words[0]?.s ?? 0)}</span>
      {words.map(w => {
        const edited = Object.prototype.hasOwnProperty.call(edits, String(w.i));
        const cls = ['vs-w', states[w.i], prot[w.i] ? 'prot' : '', low[w.i] ? 'low' : '', w.i === nowI ? 'now' : '',
          sel && w.i >= sel[0] && w.i <= sel[1] ? 'sel' : '', hits.has(w.i) ? 'hit' : '', edited ? 'edited' : ''].filter(Boolean).join(' ');
        return <span key={w.i} className={cls} data-i={w.i} title={edited ? `Caption reads: “${edits[String(w.i)] || '(hidden)'}”` : undefined}>{w.w} </span>;
      })}
    </p>
  );
});

export function TranscriptPanel({ ctx, sentences }: { ctx: EditorCtx; sentences: Sentence[] }) {
  const { transcript, doc } = ctx;
  const box = useRef<HTMLDivElement>(null);
  const [query, setQuery] = useState('');
  const [hitAt, setHitAt] = useState(0);
  const [captionDraft, setCaptionDraft] = useState<string | null>(null);
  const words = transcript?.words ?? [];

  /* Per word: cut / suggested / protected / unsure — one pass over the cuts. */
  const { states, prot, low } = useMemo(() => {
    const states: WordState[] = new Array(words.length).fill('');
    const prot: boolean[] = new Array(words.length).fill(false);
    const low: boolean[] = words.map(w => typeof w.c === 'number' && w.c < 0.6);
    const mark = (s: number, e: number, v: WordState) => {
      for (const w of words) { if (w.e <= s + 0.02) continue; if (w.s >= e - 0.02) break; if (v === 'cut' || !states[w.i]) states[w.i] = v; }
    };
    for (const [s, e] of effectiveCuts(doc)) mark(s, e, 'cut');
    for (const c of doc.cuts) if (c.state === 'proposed') mark(c.s, c.e, 'prop');
    for (const p of doc.protects) for (const w of words) if (w.s < p.e && w.e > p.s) prot[w.i] = true;
    return { states, prot, low };
  }, [words, doc.cuts, doc.protects]);

  const paras = useMemo(() => {
    const out: Word[][] = [];
    let cur: Word[] = [];
    let n = 0;
    for (const s of sentences) {
      const ws = words.slice(s.w0, s.w1 + 1);
      const gap = cur.length ? s.s - cur[cur.length - 1].e : 0;
      if (cur.length && (n >= 5 || gap > 2.5)) { out.push(cur); cur = []; n = 0; }
      cur.push(...ws); n++;
    }
    if (cur.length) out.push(cur);
    return out;
  }, [sentences, words]);

  const hits = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (q.length < 2) return [] as number[];
    const terms = q.split(/\s+/);
    const found: number[] = [];
    for (let i = 0; i + terms.length <= words.length; i++) {
      if (terms.every((t, k) => words[i + k].w.toLowerCase().replace(/[^\p{L}\p{N}$%]/gu, '').includes(t.replace(/[^\p{L}\p{N}$%]/gu, '')))) found.push(i);
    }
    return found;
  }, [query, words]);
  const hitSet = useMemo(() => { const s = new Set<number>(); const n = query.trim().split(/\s+/).length; for (const h of hits) for (let k = 0; k < n; k++) s.add(h + k); return s; }, [hits, query]);

  const nowI = useMemo(() => { const w = words.find(x => ctx.time >= x.s && ctx.time < x.e + 0.1); return w ? w.i : -1; }, [words, ctx.time]);
  const sel = ctx.selection ? [Math.min(ctx.selection.i0, ctx.selection.i1), Math.max(ctx.selection.i0, ctx.selection.i1)] as [number, number] : null;

  useEffect(() => { if (hits.length) box.current?.querySelector(`[data-i="${hits[hitAt % hits.length]}"]`)?.scrollIntoView({ block: 'center', behavior: 'smooth' }); }, [hits, hitAt]);

  if (!transcript) return <p className="vs-sub">The transcript appears here when transcription finishes — each word timed, so you can edit the video by editing the text.</p>;
  if (!words.length) return <div className="vs-note">No spoken words were found in this video, so there is nothing to transcribe or caption.</div>;

  const pick = (e: React.MouseEvent) => {
    const s = window.getSelection();
    const at = (n: Node | null) => (n instanceof Element ? n : n?.parentElement)?.closest('[data-i]')?.getAttribute('data-i');
    if (s && !s.isCollapsed) {
      const a = at(s.anchorNode), b = at(s.focusNode);
      if (a && b) { ctx.setSelection({ i0: Number(a), i1: Number(b) }); return; }
    }
    const i = at(e.target as Node);
    if (!i) return;
    const n = Number(i);
    if (e.shiftKey && ctx.selection) ctx.setSelection({ i0: ctx.selection.i0, i1: n });
    else { ctx.setSelection({ i0: n, i1: n }); ctx.seek(words[n].s); }
  };

  const range = sel ? { s: words[sel[0]].s, e: words[sel[1]].e } : null;
  const selText = sel ? words.slice(sel[0], sel[1] + 1).map(w => w.w).join(' ') : '';
  const prevEnd = sel && sel[0] > 0 ? words[sel[0] - 1].e : 0;
  const nextStart = sel && sel[1] + 1 < words.length ? words[sel[1] + 1].s : ctx.duration;
  const cutRange = range ? { s: Math.max(prevEnd + 0.02, range.s - 0.06), e: Math.min(nextStart - 0.02, range.e + 0.06) } : null;
  const selCut = sel ? states.slice(sel[0], sel[1] + 1).some(x => x === 'cut') : false;
  const rtl = isRtl(words.slice(0, 40).map(w => w.w).join(' '));

  return (
    <div className="vs-col" data-testid="vs-transcript">
      <div className="vs-row">
        <div style={{ position: 'relative', flex: 1, minWidth: 180 }}>
          <Search size={14} style={{ position: 'absolute', left: 10, top: 11, color: '#9aa0a8' }} />
          <input className="vs-input" style={{ paddingLeft: 30 }} placeholder="Search the transcript" value={query} data-testid="vs-search"
            onChange={e => { setQuery(e.target.value); setHitAt(0); }} onKeyDown={e => { if (e.key === 'Enter') setHitAt(h => h + 1); }} />
        </div>
        {query.trim().length > 1 && <span className="vs-kbd">{hits.length ? `${(hitAt % hits.length) + 1} of ${hits.length}` : 'Not found'}</span>}
        <span className="vs-kbd">{transcript.language ? transcript.language.toUpperCase() : ''}{transcript.confidence !== null ? ` · confidence ${Math.round(transcript.confidence * 100)}%` : ''}</span>
      </div>
      <p className="vs-kbd" style={{ margin: 0 }}>
        Select words, then <b>Remove from video</b> to cut them, or <b>Fix caption text</b> to correct only what the captions say. <span style={{ textDecoration: 'underline dotted' }}>Dotted</span> words are ones the transcriber was unsure of. {transcript.speakers ? '' : 'Speaker labels need a provider with speaker detection.'}
      </p>
      {sel && range && (
        <div className="vs-selbar" data-testid="vs-selbar">
          <small>{sel[1] - sel[0] + 1} word{sel[1] === sel[0] ? '' : 's'} · {clock(range.s)}–{clock(range.e)}</small>
          {captionDraft === null ? (
            <>
              <button type="button" className="vs-btn sm" onClick={() => ctx.seek(range.s)}><Play size={13} /> Play</button>
              {selCut
                ? <button type="button" className="vs-btn sm" data-testid="vs-restore" onClick={() => void ctx.apply([{ op: 'cut.restoreRange', s: range.s - 0.05, e: range.e + 0.05 }], `Restored “${selText.slice(0, 50)}”`)}><RotateCcw size={13} /> Restore</button>
                : <button type="button" className="vs-btn sm" data-testid="vs-remove" onClick={() => cutRange && void ctx.apply([{ op: 'cut.add', s: cutRange.s, e: cutRange.e, reason: `Removed “${selText.slice(0, 60)}”` }], `Removed “${selText.slice(0, 50)}”`)}><Scissors size={13} /> Remove from video</button>}
              <button type="button" className="vs-btn sm" onClick={() => void ctx.apply([{ op: 'protect.add', s: range.s - 0.05, e: range.e + 0.05, note: 'Protected in the transcript' }, { op: 'cut.restoreRange', s: range.s, e: range.e }], 'Protected a section')}><Shield size={13} /> Keep (protect)</button>
              <button type="button" className="vs-btn sm" data-testid="vs-fix-caption" onClick={() => setCaptionDraft(selText)}><Type size={13} /> Fix caption text</button>
              <button type="button" className="vs-btn sm" onClick={() => void ctx.apply([{ op: 'clip.add', s: range.s, e: range.e, title: selText.split(' ').slice(0, 8).join(' '), reason: 'Chosen by you in the transcript' }], 'New Short from the transcript').then(ok => ok && ctx.setTab('shorts'))}><Film size={13} /> Make a Short</button>
              <span className="vs-spacer" />
              <button type="button" className="vs-btn sm" aria-label="Clear selection" onClick={() => ctx.setSelection(null)}><X size={13} /></button>
            </>
          ) : (
            <>
              <input className="vs-input" style={{ flex: 1, minWidth: 160, background: '#fff' }} value={captionDraft} onChange={e => setCaptionDraft(e.target.value)} data-testid="vs-caption-input" aria-label="Caption text" autoFocus />
              <button type="button" className="vs-btn sm" data-testid="vs-caption-save" onClick={() => {
                /* The new words go on the first word of the selection; the rest
                   are hidden from the captions only. The video is not touched. */
                const ops = [{ op: 'caption.edit' as const, i: sel[0], text: captionDraft }, ...Array.from({ length: sel[1] - sel[0] }, (_, k) => ({ op: 'caption.edit' as const, i: sel[0] + k + 1, text: '' }))];
                void ctx.apply(ops, 'Caption text corrected').then(() => setCaptionDraft(null));
              }}><Check size={13} /> Save caption text</button>
              <button type="button" className="vs-btn sm" onClick={() => setCaptionDraft(null)}>Cancel</button>
              <small style={{ width: '100%' }}>Only the captions change. The video and its sound stay exactly as they are.</small>
            </>
          )}
        </div>
      )}
      <div className="vs-tr" ref={box} onMouseUp={pick} dir={rtl ? 'rtl' : undefined}>
        {paras.map((ws, k) => (
          <Para key={k} words={ws} states={states} prot={prot} edits={doc.captionEdits} low={low} rtl={rtl}
            nowI={ws.some(w => w.i === nowI) ? nowI : -1} sel={sel && ws.some(w => w.i >= sel[0] && w.i <= sel[1]) ? sel : null}
            hits={ws.some(w => hitSet.has(w.i)) ? hitSet : EMPTY} />
        ))}
      </div>
    </div>
  );
}
const EMPTY = new Set<number>();

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
              <button type="button" className="vs-btn ghost sm danger" aria-label="Remove this Short" onClick={() => { if (window.confirm(`Remove “${c.title}”?`)) void ctx.apply([{ op: 'clip.remove', id: c.id }], 'Removed a Short'); }}><Trash2 size={13} /></button>
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
