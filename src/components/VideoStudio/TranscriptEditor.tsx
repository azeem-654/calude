/**
 * The transcript as the main way to edit — edit the words, the video follows.
 *
 *   select words (drag, shift-click, or Shift + arrows) → Delete or Backspace
 *   cuts them: they stay on the page struck through in red, the video skips
 *   them; select struck words → Restore (or R). A text cursor sits between
 *   words: the arrows move it and the playhead with it, and while the video
 *   plays it follows the word being said. Pauses, filler words and retakes
 *   the cleanup found sit inline as chips — accept or ignore each one where
 *   it is. Ctrl/⌘ + Z and Y walk the version history.
 *
 * There is no second edit model: every key and every chip sends the same
 * operations (`cut.add`, `cut.restoreRange`, `cut.set`, `caption.edit`)
 * through `ctx.apply` as the buttons do, so undo, the render and the
 * timeline all see one edit.
 *
 * ── Two different things, said differently ──
 *
 * *Remove from video* (Delete) cuts the spoken words out of the picture and
 * the sound; *Fix caption text* changes only what the captions say and
 * leaves the video exactly as it was. They are separate keys and buttons with
 * separate words, because confusing them deletes something somebody meant to
 * keep.
 */
import { memo, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Scissors, RotateCcw, Shield, Film, Type, Play, Search, Check, X, Pause, Keyboard } from 'lucide-react';
import { clock, effectiveCuts, isRtl, type Cut, type Sentence, type Word } from '../../services/videoStudio';
import type { EditorCtx } from './VideoEditor';

type WordState = '' | 'cut' | 'prop';

/** Speakers, when the transcript has them: a colour each, the same everywhere. */
export const SPEAKER_COLORS = ['#60a5fa', '#f472b6', '#34d399', '#fbbf24', '#a78bfa', '#fb923c'];

const CHIP_KIND: Record<string, string> = { gap: 'Pause', filler: 'Filler', repeat: 'Repeat', false_start: 'False start', retake: 'Retake' };

/** A suggestion where it happens: accept (cut it) or ignore (keep it); an applied pause can be put back. */
function Chip({ c, onSet }: { c: Cut; onSet: (c: Cut, state: Cut['state']) => void }) {
  const prop = c.state === 'proposed';
  const label = c.kind === 'gap' ? `${(c.e - c.s).toFixed(1)} s` : c.kind === 'retake' ? (c.reason.match(/^Take \d+ of \d+/)?.[0] ?? 'Retake') : CHIP_KIND[c.kind] ?? c.kind;
  return (
    <span className={`vs-chipin ${c.kind} ${prop ? 'prop' : 'done'}`} contentEditable={false} data-chip={c.id} title={c.reason} onMouseUp={e => e.stopPropagation()}>
      <span className="k">{c.kind === 'gap' ? <Pause size={10} /> : null}{c.kind === 'gap' ? '' : `${CHIP_KIND[c.kind] ?? c.kind} · `}{label}</span>
      {prop ? (
        <>
          <button type="button" aria-label={`Remove: ${c.reason}`} data-act="chip-accept" onClick={() => onSet(c, 'approved')}><Check size={11} /></button>
          <button type="button" aria-label={`Keep: ${c.reason}`} data-act="chip-ignore" onClick={() => onSet(c, 'rejected')}><X size={11} /></button>
        </>
      ) : <button type="button" aria-label={`Put back: ${c.reason}`} data-act="chip-restore" onClick={() => onSet(c, 'rejected')}><RotateCcw size={11} /></button>}
    </span>
  );
}

const Para = memo(function Para({ words, states, prot, edits, low, nowI, caret, sel, hits, rtl, chips, speaker, guessed, thumb, onChip }: {
  words: Word[]; states: WordState[]; prot: boolean[]; edits: Record<string, string>; low: boolean[]; nowI: number; caret: number; sel: [number, number] | null;
  hits: Set<number>; rtl: boolean; chips: Map<number, Cut[]> | null; speaker: number | null; onChip: (c: Cut, state: Cut['state']) => void;
  /** No speaker detection: everyone is "Speaker 1", and the label says so when asked. */
  guessed?: boolean;
  /** The frame where this scene starts (a tile of the filmstrip). */
  thumb?: React.CSSProperties | null;
}) {
  return (
    <p dir={rtl ? 'rtl' : undefined}>
      {thumb && <span className="vs-scene-th" style={thumb} contentEditable={false} aria-hidden="true" />}
      {speaker !== null && <span className="vs-spk" contentEditable={false} style={{ color: SPEAKER_COLORS[speaker % SPEAKER_COLORS.length] }} data-speaker={speaker}
        title={guessed ? 'Speaker labels need a transcription provider with speaker detection — until then everything is Speaker 1.' : undefined}>Speaker {speaker + 1}</span>}
      <span className="vs-time-tag" contentEditable={false}>{clock(words[0]?.s ?? 0)}</span>
      {words.map(w => {
        const edited = Object.prototype.hasOwnProperty.call(edits, String(w.i));
        const cls = ['vs-w', states[w.i], prot[w.i] ? 'prot' : '', low[w.i] ? 'low' : '', w.i === nowI ? 'now' : '', w.i === caret ? 'caret' : '',
          sel && w.i >= sel[0] && w.i <= sel[1] ? 'sel' : '', hits.has(w.i) ? 'hit' : '', edited ? 'edited' : ''].filter(Boolean).join(' ');
        return (
          <span key={w.i} style={{ display: 'contents' }}>
            {chips?.get(w.i)?.map(c => <Chip key={c.id} c={c} onSet={onChip} />)}
            <span className={cls} data-i={w.i} title={edited ? `Caption reads: “${edits[String(w.i)] || '(hidden)'}”` : states[w.i] === 'cut' ? 'Cut from the video' : undefined}>{w.w} </span>
          </span>
        );
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
  /** The text cursor: before word `caret`. */
  const [caret, setCaret] = useState(0);
  const anchor = useRef<number | null>(null);
  const [playing, setPlaying] = useState(false);
  const [help, setHelp] = useState(false);
  const words = useMemo(() => transcript?.words ?? [], [transcript]);
  /* A chip's accept / ignore, stable across renders so a paragraph redraws only when its own words change. */
  const chipAct = useRef<(c: Cut, state: Cut['state']) => void>(() => {});
  const onChip = useCallback((c: Cut, state: Cut['state']) => chipAct.current(c, state), []);

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

  /* The cleanup's suggestions, placed in the text: a pause before the word
     after it, a filler or a retake before its first word. Applied fillers and
     retakes need no chip — their words are already struck through. */
  const chips = useMemo(() => {
    const m = new Map<number, Cut[]>();
    if (!words.length) return m;
    const firstFrom = (t: number) => { let lo = 0, hi = words.length; while (lo < hi) { const mid = (lo + hi) >> 1; if (words[mid].s < t) lo = mid + 1; else hi = mid; } return lo; };
    for (const c of doc.cuts) {
      if (c.by === 'you' || c.state === 'rejected') continue;
      if (c.state === 'approved' && c.kind !== 'gap') continue;
      const j = c.kind === 'gap' ? firstFrom(c.e - 0.05) : firstFrom(c.s - 0.02);
      const at = words[Math.min(words.length - 1, j)]?.i;
      if (at === undefined) continue;
      m.set(at, [...(m.get(at) ?? []), c]);
    }
    return m;
  }, [words, doc.cuts]);

  const speakers = !!transcript?.speakers || words.some(w => typeof w.sp === 'number');
  /* A Short is a composition of its own: its script is its own stretch of the recording. */
  const clip = ctx.activeClip ? doc.clips.find(c => c.id === ctx.activeClip) ?? null : null;
  const paras = useMemo(() => {
    const out: Word[][] = [];
    let cur: Word[] = [];
    let n = 0;
    for (const s of sentences) {
      const ws = words.slice(s.w0, s.w1 + 1).filter(w => !clip || (w.e > clip.s + 0.01 && w.s < clip.e - 0.01));
      if (!ws.length) continue;
      const gap = cur.length ? s.s - cur[cur.length - 1].e : 0;
      const turn = speakers && cur.length && ws[0]?.sp !== cur[cur.length - 1].sp;
      if (cur.length && (n >= 5 || gap > 2.5 || turn)) { out.push(cur); cur = []; n = 0; }
      cur.push(...ws); n++;
    }
    if (cur.length) out.push(cur);
    return out;
  }, [sentences, words, speakers, clip?.s, clip?.e]); // eslint-disable-line react-hooks/exhaustive-deps
  /* A small frame at each scene's start, from the filmstrip the engine made. */
  const strip = ctx.view.source.filmstrip;
  /* One style object per tile, kept: a new object each render told every
     paragraph's memo it had changed, so the whole transcript — thousands of
     words — redrew ten times a second while the video played, and the
     preview stuttered under it. */
  const thumbCache = useMemo(() => new Map<number, React.CSSProperties>(), [strip?.url, strip?.tiles, strip?.every, strip?.w, strip?.h]); // eslint-disable-line react-hooks/exhaustive-deps
  const thumbAt = (t: number): React.CSSProperties | null => {
    if (!strip) return null;
    const k = Math.min(strip.tiles - 1, Math.max(0, Math.floor(t / strip.every)));
    let st = thumbCache.get(k);
    if (!st) { st = { backgroundImage: `url("${strip.url}")`, backgroundSize: `${strip.tiles * 100}% 100%`, backgroundPosition: `${strip.tiles > 1 ? (k / (strip.tiles - 1)) * 100 : 0}% 0`, aspectRatio: `${strip.w} / ${strip.h}` }; thumbCache.set(k, st); }
    return st;
  };

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

  /* The player says when it plays; while it does, the cursor follows the word being said. */
  useEffect(() => {
    const on = (e: Event) => setPlaying(!!(e as CustomEvent<boolean>).detail);
    window.addEventListener('vs-play-state', on);
    return () => window.removeEventListener('vs-play-state', on);
  }, []);
  useEffect(() => {
    if (!playing || nowI < 0) return;
    setCaret(nowI);
    const el = box.current?.querySelector(`[data-i="${nowI}"]`) as HTMLElement | null;
    const scroller = box.current?.closest('.vse-scroll') as HTMLElement | null;
    if (el && scroller) {
      const r = el.getBoundingClientRect(), b = scroller.getBoundingClientRect();
      if (r.top < b.top + 20 || r.bottom > b.bottom - 20) el.scrollIntoView({ block: 'center', behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth' });
    }
  }, [playing, nowI]);

  if (!transcript) return <p className="vs-sub">The transcript appears here when transcription finishes — each word timed, so you can edit the video by editing the text.</p>;
  if (!words.length) return <div className="vs-note">No spoken words were found in this video, so there is nothing to transcribe or caption.</div>;

  const range = sel ? { s: words[sel[0]].s, e: words[sel[1]].e } : null;
  const selText = sel ? words.slice(sel[0], sel[1] + 1).map(w => w.w).join(' ') : '';
  const cutRangeOf = (a: number, b: number) => {
    const prevEnd = a > 0 ? words[a - 1].e : 0;
    const nextStart = b + 1 < words.length ? words[b + 1].s : ctx.duration;
    return { s: Math.max(prevEnd + 0.02, words[a].s - 0.06), e: Math.min(nextStart - 0.02, words[b].e + 0.06) };
  };
  const selCut = sel ? states.slice(sel[0], sel[1] + 1).some(x => x === 'cut') : false;
  const selAllCut = sel ? states.slice(sel[0], sel[1] + 1).every(x => x === 'cut') : false;
  const rtl = isRtl(words.slice(0, 40).map(w => w.w).join(' '));
  const quote = (t: string) => `“${t.slice(0, 50)}${t.length > 50 ? '…' : ''}”`;

  const remove = (a: number, b: number) => {
    const text = words.slice(a, b + 1).map(w => w.w).join(' ');
    if (states.slice(a, b + 1).every(x => x === 'cut')) { ctx.say({ who: 'ai', text: `${quote(text)} is already cut — select it and press R to restore it.` }); return; }
    const r = cutRangeOf(a, b);
    void ctx.apply([{ op: 'cut.add', s: r.s, e: r.e, reason: `Removed “${text.slice(0, 60)}”` }], `Removed ${quote(text)}`);
    ctx.setSelection(null);
    setCaret(Math.min(words.length - 1, b + 1));
  };
  const restore = (a: number, b: number) => {
    const text = words.slice(a, b + 1).map(w => w.w).join(' ');
    void ctx.apply([{ op: 'cut.restoreRange', s: words[a].s - 0.05, e: words[b].e + 0.05 }], `Restored ${quote(text)}`);
  };
  chipAct.current = (c: Cut, state: Cut['state']) => void ctx.apply([{ op: 'cut.set', id: c.id, state }], `${state === 'approved' ? 'Removed' : c.state === 'approved' ? 'Put back' : 'Kept'}: ${c.reason}`);

  const moveTo = (j: number, extend: boolean) => {
    const k = Math.max(0, Math.min(words.length - 1, j));
    if (extend) {
      if (anchor.current === null) anchor.current = sel ? (caret <= sel[0] ? sel[1] : sel[0]) : caret;
      ctx.setSelection({ i0: anchor.current, i1: k });
    } else { anchor.current = null; if (sel) ctx.setSelection(null); }
    setCaret(k);
    ctx.seek(words[k].s);
    box.current?.querySelector(`[data-i="${k}"]`)?.scrollIntoView({ block: 'nearest' });
  };
  const sentenceOf = (j: number) => sentences.findIndex(s => j >= s.w0 && j <= s.w1);

  const onKey = (e: React.KeyboardEvent<HTMLDivElement>) => {
    if (e.target !== e.currentTarget && (e.target as HTMLElement).tagName === 'BUTTON') return;
    const k = e.key;
    if (k === 'ArrowRight' || k === 'ArrowLeft') {
      e.preventDefault();
      const d = (k === 'ArrowRight') !== rtl ? 1 : -1;
      if (e.altKey || e.ctrlKey || e.metaKey) {
        /* A sentence at a time: on to the next one's start, or back to this one's (then the one before). */
        const si = sentenceOf(caret), here = sentences[si];
        const to = d > 0 ? sentences[Math.min(sentences.length - 1, si + 1)] : here && here.w0 < caret ? here : sentences[Math.max(0, si - 1)];
        if (to) moveTo(to.w0, e.shiftKey);
      } else moveTo(caret + d, e.shiftKey);
    } else if (k === 'ArrowDown' || k === 'ArrowUp') {
      e.preventDefault();
      const si = sentenceOf(caret), s = sentences[Math.max(0, Math.min(sentences.length - 1, si + (k === 'ArrowDown' ? 1 : -1)))];
      moveTo(s.w0 + Math.min(caret - (sentences[si]?.w0 ?? 0), s.w1 - s.w0), e.shiftKey);
    } else if (k === 'Home' || k === 'End') {
      e.preventDefault();
      const s = sentences[sentenceOf(caret)];
      if (s) moveTo(k === 'Home' ? s.w0 : s.w1, e.shiftKey);
    } else if (k === 'Delete' || k === 'Backspace') {
      e.preventDefault();
      if (sel) remove(sel[0], sel[1]);
      else if (k === 'Backspace' && caret > 0) { remove(caret - 1, caret - 1); setCaret(caret - 1); }
      else if (k === 'Delete') remove(caret, caret);
    } else if ((k === 'r' || k === 'R') && !e.ctrlKey && !e.metaKey && sel && selCut) {
      e.preventDefault(); restore(sel[0], sel[1]);
    } else if (k === 'Escape') { anchor.current = null; ctx.setSelection(null); }
    else if (k === ' ') { e.preventDefault(); window.dispatchEvent(new Event('vs-toggle')); }
    else if ((e.ctrlKey || e.metaKey) && k.toLowerCase() === 'a') { e.preventDefault(); anchor.current = 0; ctx.setSelection({ i0: 0, i1: words.length - 1 }); }
  };

  const pick = (e: React.MouseEvent) => {
    const s = window.getSelection();
    const at = (n: Node | null) => (n instanceof Element ? n : n?.parentElement)?.closest('[data-i]')?.getAttribute('data-i');
    if (s && !s.isCollapsed) {
      const a = at(s.anchorNode), b = at(s.focusNode);
      if (a && b) { anchor.current = Number(a); ctx.setSelection({ i0: Number(a), i1: Number(b) }); setCaret(Number(b)); return; }
    }
    const i = at(e.target as Node);
    if (!i) return;
    const n = Number(i);
    if (e.shiftKey && (ctx.selection || anchor.current !== null)) { const a0 = ctx.selection?.i0 ?? anchor.current ?? caret; ctx.setSelection({ i0: a0, i1: n }); setCaret(n); }
    else { anchor.current = n; ctx.setSelection({ i0: n, i1: n }); setCaret(n); ctx.seek(words[n].s); }
  };

  return (
    <div className="vs-col" data-testid="vs-transcript">
      <div className="vs-row">
        <div style={{ position: 'relative', flex: 1, minWidth: 160 }}>
          <Search size={14} style={{ position: 'absolute', left: 10, top: 11, color: '#9aa0a8' }} />
          <input className="vs-input" style={{ paddingLeft: 30 }} placeholder="Search the transcript" value={query} data-testid="vs-search"
            onChange={e => { setQuery(e.target.value); setHitAt(0); }} onKeyDown={e => { if (e.key === 'Enter') setHitAt(h => h + 1); }} />
        </div>
        {query.trim().length > 1 && <span className="vs-kbd">{hits.length ? `${(hitAt % hits.length) + 1} of ${hits.length}` : 'Not found'}</span>}
        <button type="button" className="vs-btn ghost sm" aria-label="Keyboard shortcuts" aria-expanded={help} onClick={() => setHelp(h => !h)} data-act="tr-keys"><Keyboard size={14} /></button>
      </div>
      <p className="vs-kbd" style={{ margin: 0 }}>
        Edit the video by editing the text: select words and press <b>Delete</b> to cut them (they stay here, struck through), select struck words and press <b>R</b> to restore. Click a word to move the playhead there.
        {transcript.language ? ` ${transcript.language.toUpperCase()}` : ''}{transcript.confidence !== null ? ` · confidence ${Math.round(transcript.confidence * 100)}%` : ''}{speakers ? '' : ' · speaker labels need a transcription provider with speaker detection'}{clip ? ` · this Short's own stretch, ${clock(clip.s)}–${clock(clip.e)}` : ''}.
      </p>
      {help && (
        <div className="vs-keys" data-testid="vs-tr-keys" role="note">
          <span><kbd>←</kbd><kbd>→</kbd> a word · <kbd>↑</kbd><kbd>↓</kbd> a sentence · <kbd>Home</kbd>/<kbd>End</kbd> its ends</span>
          <span><kbd>Shift</kbd> + any of those selects · drag or shift-click too</span>
          <span><kbd>Delete</kbd>/<kbd>Backspace</kbd> cut · <kbd>R</kbd> restore · <kbd>Esc</kbd> clear</span>
          <span><kbd>Space</kbd> play/pause · <kbd>Ctrl/⌘</kbd>+<kbd>Z</kbd> undo · <kbd>Ctrl/⌘</kbd>+<kbd>Y</kbd> redo</span>
        </div>
      )}
      {sel && range && (
        <div className="vs-selbar" data-testid="vs-selbar">
          <small>{sel[1] - sel[0] + 1} word{sel[1] === sel[0] ? '' : 's'} · {clock(range.s)}–{clock(range.e)}</small>
          {captionDraft === null ? (
            <>
              <button type="button" className="vs-btn sm" onClick={() => ctx.seek(range.s)}><Play size={13} /> Play</button>
              {selCut && <button type="button" className="vs-btn sm" data-testid="vs-restore" onClick={() => restore(sel[0], sel[1])}><RotateCcw size={13} /> Restore</button>}
              {!selAllCut && <button type="button" className="vs-btn sm" data-testid="vs-remove" onClick={() => remove(sel[0], sel[1])}><Scissors size={13} /> Remove from video</button>}
              <button type="button" className="vs-btn sm" onClick={() => void ctx.apply([{ op: 'protect.add', s: range.s - 0.05, e: range.e + 0.05, note: 'Protected in the transcript' }, { op: 'cut.restoreRange', s: range.s, e: range.e }], 'Protected a section')}><Shield size={13} /> Keep (protect)</button>
              <button type="button" className="vs-btn sm" data-testid="vs-fix-caption" onClick={() => setCaptionDraft(selText)}><Type size={13} /> Fix caption text</button>
              <button type="button" className="vs-btn sm" onClick={() => void ctx.apply([{ op: 'clip.add', s: range.s, e: range.e, title: selText.split(' ').slice(0, 8).join(' '), reason: 'Chosen by you in the transcript' }], 'New Short from the transcript').then(ok => ok && ctx.setTab('shorts'))}><Film size={13} /> Make a Short</button>
              <span className="vs-spacer" />
              <button type="button" className="vs-btn sm" aria-label="Clear selection" onClick={() => { anchor.current = null; ctx.setSelection(null); }}><X size={13} /></button>
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
      <div className="vs-tr" ref={box} onMouseUp={pick} onKeyDown={onKey} dir={rtl ? 'rtl' : undefined} tabIndex={0} data-keys="own" data-testid="vs-tr-text"
        role="textbox" aria-multiline="true" aria-readonly="true" aria-label="Transcript — select words and press Delete to cut them from the video">
        {paras.map((ws, k) => {
          const inside = (i: number) => ws[0].i <= i && i <= ws[ws.length - 1].i;
          const sp = speakers ? (typeof ws[0].sp === 'number' && (k === 0 || paras[k - 1][0].sp !== ws[0].sp) ? ws[0].sp! : null) : k === 0 ? 0 : null;
          return (
            <Para key={`${k}:${ws[0].i}`} words={ws} states={states} prot={prot} edits={doc.captionEdits} low={low} rtl={rtl} speaker={sp} guessed={!speakers} thumb={thumbAt(ws[0].s)}
              nowI={inside(nowI) ? nowI : -1} caret={inside(caret) ? caret : -1} sel={sel && sel[0] <= ws[ws.length - 1].i && sel[1] >= ws[0].i ? sel : null}
              hits={ws.some(w => hitSet.has(w.i)) ? hitSet : EMPTY} chips={ws.some(w => chips.has(w.i)) ? chips : null} onChip={onChip} />
          );
        })}
      </div>
    </div>
  );
}
const EMPTY = new Set<number>();
