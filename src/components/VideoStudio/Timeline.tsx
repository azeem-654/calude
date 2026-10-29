/**
 * The timeline, laid out after Descript: the open composition (the long
 * video, or one Short's own stretch) on one clock, as tracks —
 *
 *   Scenes     numbered blocks over the filmstrip, each with its words as
 *              chips; a scene starts where the script starts a paragraph, or
 *              where the customer pressed Split
 *   Captions   the caption cues, as the render will show them
 *   Phrases    what is said, a block per phrase, with a "…" block for every
 *              gap between them — over
 *   Waveform   the measured sound; what is cut is faded, what is muted grey
 *   Shorts, Text, Music
 *
 * ── Blocks are selected, not just looked at ──
 *
 * A press on a phrase or a gap selects exactly that block (Shift extends from
 * the first one), lights the same words in the script, moves the playhead
 * there and offers what can be done with it: remove the section, select
 * everything before or after it, split here, mute, shorten a gap, restore.
 * Each is the same operation the script's buttons send (`cut.add`,
 * `cut.restoreRange`, `mute.add`, `scene.split`), so undo, the preview and the
 * render see one edit. A drag on a lane still marks any stretch (I / O too).
 */
import { useEffect, useMemo, useRef, useState } from 'react';
import { Scissors, RotateCcw, Shield, Film, X, Play, Music2, Plus, Type, VolumeX, ChevronsLeft, ChevronsRight, SplitSquareHorizontal, Minimize2, MousePointer2 } from 'lucide-react';
import { clock, effectiveCuts, sentencesOf, cuesOf, retimeWords, pointerOf, type Overlay, type Word } from '../../services/videoStudio';
import type { EditorCtx } from './VideoEditor';

const NAME_W = 92;
const ROW = { ruler: 22, scenes: 66, caps: 26, phrases: 30, wave: 46, pointer: 26, shorts: 30, text: 26, music: 28 };
/** A pause this long between words ends a phrase and is a gap block of its own. */
const GAP = 0.35;

export interface Block { kind: 'phrase' | 'gap'; s: number; e: number; w0: number; w1: number; text: string }

/** Phrases and the gaps between them, inside [t0, t1]. Word indices are -1 for a gap. */
export function phraseBlocks(words: Word[], t0: number, t1: number): Block[] {
  const ws = words.filter(w => w.e > t0 + 0.01 && w.s < t1 - 0.01);
  const out: Block[] = [];
  let cur: Word[] = [];
  const close = () => { if (cur.length) out.push({ kind: 'phrase', s: cur[0].s, e: cur[cur.length - 1].e, w0: cur[0].i, w1: cur[cur.length - 1].i, text: cur.map(w => w.w).join(' ') }); cur = []; };
  let at = t0;
  for (const w of ws) {
    const gap = w.s - (cur.length ? cur[cur.length - 1].e : at);
    if (gap >= GAP) {
      close();
      out.push({ kind: 'gap', s: Math.max(t0, cur.length ? cur[cur.length - 1].e : at), e: w.s, w0: -1, w1: -1, text: '' });
    }
    const last = cur[cur.length - 1];
    if (cur.length >= 9 || (last && /[.?!]$/.test(last.w) && cur.length >= 3)) close();
    cur.push(w);
    at = w.e;
  }
  close();
  const end = out.length ? out[out.length - 1].e : t0;
  if (t1 - end >= GAP) out.push({ kind: 'gap', s: end, e: t1, w0: -1, w1: -1, text: '' });
  /* A gap block must start where the phrase before it ended. */
  for (let i = 1; i < out.length; i++) if (out[i].kind === 'gap') out[i].s = out[i - 1].e;
  return out;
}

function tickStep(pps: number): number {
  for (const s of [1, 2, 5, 10, 15, 30, 60, 120, 300, 600, 900, 1800]) if (s * pps >= 70) return s;
  return 3600;
}

export default function Timeline({ ctx, wave }: { ctx: EditorCtx; wave: Uint8Array | null }) {
  const { doc, duration, view } = ctx;
  const scroller = useRef<HTMLDivElement>(null);
  const canvas = useRef<HTMLCanvasElement>(null);
  const [width, setWidth] = useState(800);
  const [zoom, setZoom] = useState(1);
  const [tool, setTool] = useState<'select' | 'scrub'>('select');
  const [sel, setSel] = useState<{ s: number; e: number } | null>(null);
  /** Selected blocks: from `a` (where Shift extends from) to `b`. */
  const [pick, setPick] = useState<{ a: number; b: number } | null>(null);
  const drag = useRef<{ x0: number; t0: number; moved: boolean } | null>(null);
  const headRef = useRef<HTMLDivElement>(null);
  /* A Short's edge or an overlay being dragged: where it was, and where it is now. */
  const [held, setHeld] = useState<{ kind: 'clip' | 'ov' | 'ptr'; id: string; edge: 's' | 'e' | 'both'; x0: number; s: number; e: number; ns: number; ne: number } | null>(null);

  /* The composition on screen: a Short shows its own stretch. */
  const clip = ctx.activeClip ? doc.clips.find(c => c.id === ctx.activeClip) ?? null : null;
  const t0 = clip ? clip.s : 0, t1 = clip ? clip.e : Math.max(1, duration);
  const span = Math.max(0.5, t1 - t0);

  useEffect(() => {
    const el = scroller.current;
    if (!el) return;
    const ro = new ResizeObserver(() => setWidth(Math.max(200, el.clientWidth - NAME_W - 4)));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  useEffect(() => { setPick(null); setSel(null); setZoom(1); }, [clip?.id]);

  const pps = (width / span) * zoom;
  const W = Math.max(width, Math.round(span * pps));
  const x = (t: number) => (t - t0) * pps;

  /* The transport's zoom buttons, tool and Split; the zoom it shows. */
  useEffect(() => { window.dispatchEvent(new CustomEvent('vs-tl-zoomed', { detail: zoom * 100 })); }, [zoom]);
  useEffect(() => {
    const onZoom = (e: Event) => { const d = (e as CustomEvent<string>).detail; setZoom(z => d === 'fit' ? 1 : d === 'in' ? Math.min(80, z * 1.18) : Math.max(1, z / 1.18)); };
    const onTool = (e: Event) => setTool((e as CustomEvent<'select' | 'scrub'>).detail);
    window.addEventListener('vs-tl-zoom', onZoom); window.addEventListener('vs-tool', onTool);
    return () => { window.removeEventListener('vs-tl-zoom', onZoom); window.removeEventListener('vs-tool', onTool); };
  }, []);

  /* The playhead moves every frame from the player's own loop, not through React. */
  useEffect(() => {
    const on = (e: Event) => {
      const t = (e as CustomEvent<number>).detail;
      if (headRef.current) headRef.current.style.left = `${NAME_W + (t - t0) * pps}px`;
      const el = scroller.current;
      if (el && zoom > 1) {
        const px = (t - t0) * pps + NAME_W;
        if (px < el.scrollLeft + NAME_W + 20 || px > el.scrollLeft + el.clientWidth - 40) el.scrollLeft = Math.max(0, px - NAME_W - el.clientWidth * 0.25);
      }
    };
    window.addEventListener('vs-frame', on);
    return () => window.removeEventListener('vs-frame', on);
  }, [pps, zoom, t0]);

  /* Ctrl/⌘ + wheel zooms, held at the point under the pointer. */
  useEffect(() => {
    const el = scroller.current;
    if (!el) return;
    const onWheel = (e: WheelEvent) => {
      if (!(e.ctrlKey || e.metaKey)) return;
      e.preventDefault();
      const r = el.getBoundingClientRect();
      const at = (el.scrollLeft + e.clientX - r.left - NAME_W) / pps;
      setZoom(z => {
        const nz = Math.min(80, Math.max(1, z * (e.deltaY < 0 ? 1.25 : 0.8)));
        requestAnimationFrame(() => { el.scrollLeft = Math.max(0, at * (width / span) * nz - (e.clientX - r.left - NAME_W)); });
        return nz;
      });
    };
    el.addEventListener('wheel', onWheel, { passive: false });
    return () => el.removeEventListener('wheel', onWheel);
  }, [pps, width, span]);

  const applied = useMemo(() => effectiveCuts(doc), [doc]);
  const mutes = doc.mutes ?? [];
  /* The waveform, drawn at most 16k pixels wide and stretched beyond; what
     is cut is drawn faded and what is muted grey, so the sound that is left
     reads at a glance. */
  useEffect(() => {
    const c = canvas.current;
    if (!c) return;
    const dpr = Math.min(2, devicePixelRatio || 1);
    const w = Math.min(16000, Math.round(W * dpr)), h = Math.round(ROW.wave * dpr);
    c.width = w; c.height = h;
    const g = c.getContext('2d');
    if (!g) return;
    g.clearRect(0, 0, w, h);
    if (!wave) return;
    const rate = 20;
    const bar = Math.max(1, Math.round(1.5 * dpr)), stepPx = bar + Math.max(1, Math.round(dpr));
    let ci = 0;
    for (let px = 0; px < w; px += stepPx) {
      const a = t0 + (px / w) * span, b = t0 + ((px + stepPx) / w) * span;
      let v = 0;
      for (let i = Math.floor(a * rate); i <= Math.floor(b * rate); i++) v = Math.max(v, wave[i] ?? 0);
      const bh = Math.max(1, (v / 255) * h * 0.92);
      const mid = (a + b) / 2;
      while (ci < applied.length && applied[ci][1] < mid) ci++;
      const cut = ci < applied.length && applied[ci][0] <= mid;
      const muted = mutes.some(m => mid >= m.s && mid < m.e);
      g.globalAlpha = cut ? 0.25 : 1;
      g.fillStyle = cut ? '#b9b3c6' : muted ? '#c7c7d1' : '#7c6cf0';
      g.fillRect(px, (h - bh) / 2, bar, bh);
    }
    g.globalAlpha = 1;
  }, [wave, W, span, t0, applied, mutes]);

  const words = useMemo(() => ctx.transcript?.words ?? [], [ctx.transcript]);
  const sentences = useMemo(() => sentencesOf(words), [words]);
  const blocks = useMemo(() => phraseBlocks(words, t0, t1), [words, t0, t1]);
  /* Scenes: where the script starts a paragraph (five sentences, or a pause over 2.5 s), and every Split. */
  const scenes = useMemo(() => {
    const marks = new Set<number>([t0]);
    let n = 0, prevE = -1;
    for (const s of sentences) {
      if (s.e <= t0 || s.s >= t1) continue;
      if (prevE >= 0 && (n >= 5 || s.s - prevE > 2.5)) { marks.add(Math.max(t0, s.s - 0.05)); n = 0; }
      n++; prevE = s.e;
    }
    for (const t of doc.splits ?? []) if (t > t0 + 0.2 && t < t1 - 0.2) marks.add(t);
    const at = [...marks].sort((a, b) => a - b).filter((t, i, arr) => i === 0 || t - arr[i - 1] > 0.3);
    return at.map((s, i) => {
      const e = at[i + 1] ?? t1;
      return { n: i + 1, s, e, words: words.filter(w => w.s >= s - 0.01 && w.s < e).slice(0, 40), split: (doc.splits ?? []).some(x => Math.abs(x - s) < 0.06) };
    });
  }, [sentences, words, doc.splits, t0, t1]);
  const kind = clip ? 'short' as const : 'long' as const;
  const cues = useMemo(() => words.length ? cuesOf(retimeWords(words, [[0, Math.max(duration, words[words.length - 1].e)]], doc.captionEdits), kind).filter(c => c.e > t0 && c.s < t1) : [], [words, duration, doc.captionEdits, kind, t0, t1]);
  const proposed = doc.cuts.filter(c => c.state === 'proposed');

  /* The script's selection, shown here too. */
  const tSel = ctx.selection && words.length ? { s: words[Math.min(ctx.selection.i0, ctx.selection.i1)]?.s ?? 0, e: words[Math.max(ctx.selection.i0, ctx.selection.i1)]?.e ?? 0 } : null;
  const lo = pick ? Math.min(pick.a, pick.b) : -1, hi = pick ? Math.max(pick.a, pick.b) : -1;
  const pickRange = pick && blocks[lo] && blocks[hi] ? { s: blocks[lo].s, e: blocks[hi].e } : null;
  const range = pickRange ?? sel ?? tSel;
  /* A block counts as cut when nearly all of it is inside cuts, muted likewise. */
  const covered = (s: number, e: number, list: [number, number][]) => list.reduce((n, [a, b]) => n + Math.max(0, Math.min(b, e) - Math.max(a, s)), 0) >= (e - s) * 0.8;

  const choose = (i: number, extend: boolean) => {
    const next = extend && pick ? { a: pick.a, b: i } : { a: i, b: i };
    setPick(next); setSel(null);
    const a = Math.min(next.a, next.b), b = Math.max(next.a, next.b);
    const ws = blocks.slice(a, b + 1).filter(x => x.kind === 'phrase');
    ctx.setSelection(ws.length ? { i0: ws[0].w0, i1: ws[ws.length - 1].w1 } : null);
    if (!extend) ctx.seek(blocks[i].s);
  };
  /* Selecting in the script clears a block selection that no longer matches it. */
  useEffect(() => {
    if (!pick || !ctx.selection) return;
    const ws = blocks.slice(lo, hi + 1).filter(x => x.kind === 'phrase');
    if (!ws.length || ws[0].w0 !== Math.min(ctx.selection.i0, ctx.selection.i1) || ws[ws.length - 1].w1 !== Math.max(ctx.selection.i0, ctx.selection.i1)) setPick(null);
  }, [ctx.selection]); // eslint-disable-line react-hooks/exhaustive-deps

  const at = (e: React.PointerEvent) => {
    const r = (e.currentTarget as HTMLElement).getBoundingClientRect();
    return Math.max(t0, Math.min(t1, t0 + (e.clientX - r.left) / pps));
  };
  const down = (e: React.PointerEvent<HTMLDivElement>) => {
    if ((e.target as HTMLElement).closest('button, [data-block]')) return;
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    drag.current = { x0: e.clientX, t0: at(e), moved: false };
  };
  const move = (e: React.PointerEvent<HTMLDivElement>) => {
    const d = drag.current;
    if (!d) return;
    if (Math.abs(e.clientX - d.x0) > 4) d.moved = true;
    if (!d.moved) return;
    if (tool === 'scrub') { ctx.seek(at(e)); return; }
    const t = at(e); setPick(null); setSel({ s: Math.min(d.t0, t), e: Math.max(d.t0, t) });
  };
  const up = (e: React.PointerEvent<HTMLDivElement>) => {
    const d = drag.current;
    drag.current = null;
    if (!d) return;
    if (!d.moved) { setSel(null); setPick(null); ctx.seek(at(e)); }
  };

  const ticks = useMemo(() => { const s = tickStep(pps); const out: number[] = []; for (let t = Math.ceil(t0 / s) * s; t <= t1; t += s) out.push(t); return out; }, [pps, t0, t1]);
  const strip = view.source.filmstrip;
  const tileW = Math.round(ROW.scenes * (strip ? strip.w / strip.h : 16 / 9));
  const tiles = strip ? Array.from({ length: Math.ceil(W / tileW) }, (_, i) => i) : [];
  const clipOut = (id: string) => view.outputs.find(o => o.kind === 'short' && o.clipId === id);

  const shades = (lane: 'video' | 'wave') => (
    <>
      {applied.map(([s, e], i) => e > t0 && s < t1 && <div key={`a${i}`} className={`vse-cutzone ${lane}`} style={{ left: x(Math.max(s, t0)), width: Math.max(2, x(Math.min(e, t1)) - x(Math.max(s, t0))) }} data-cutzone="" />)}
      {proposed.map(c => c.e > t0 && c.s < t1 && <div key={c.id} className="vse-cutzone prop" style={{ left: x(Math.max(c.s, t0)), width: Math.max(2, x(Math.min(c.e, t1)) - x(Math.max(c.s, t0))) }} title={c.reason} />)}
      {doc.protects.map(p => p.e > t0 && p.s < t1 && <div key={p.id} className="vse-protect" style={{ left: x(Math.max(p.s, t0)), width: Math.max(2, x(Math.min(p.e, t1)) - x(Math.max(p.s, t0))) }} title="Protected" />)}
      {lane === 'wave' && mutes.map(m => m.e > t0 && m.s < t1 && <div key={m.id} className="vse-mutezone" style={{ left: x(Math.max(m.s, t0)), width: Math.max(2, x(Math.min(m.e, t1)) - x(Math.max(m.s, t0))) }} title="Muted" />)}
      {range && <div className="vse-selzone" style={{ left: x(range.s), width: Math.max(2, x(range.e) - x(range.s)) }} />}
    </>
  );

  const act = async (ops: Parameters<EditorCtx['apply']>[0], note: string) => { if (await ctx.apply(ops, note)) { setSel(null); setPick(null); ctx.setSelection(null); } };

  /* What a block selection can do. */
  const pb = pickRange && pick ? blocks.slice(lo, hi + 1) : [];
  const onlyGaps = pb.length > 0 && pb.every(b => b.kind === 'gap');
  const removeRange = () => {
    if (!pickRange) return null;
    /* Phrases are cut a little wide (as the script cuts words), never into a neighbouring word. */
    const prev = blocks[lo - 1], next = blocks[hi + 1];
    let s = pickRange.s, e = pickRange.e;
    if (pb[0].kind === 'phrase') s = Math.max(prev?.kind === 'phrase' ? prev.e + 0.02 : t0, s - 0.04);
    if (pb[pb.length - 1].kind === 'phrase') e = Math.min(next?.kind === 'phrase' ? next.s - 0.02 : t1, e + 0.04);
    return { s: Math.max(t0, s), e: Math.min(t1, e) };
  };
  /** Select blocks a..b without moving the playhead (everything before / after). */
  const selectBlocks = (a: number, b: number) => {
    if (a > b) return;
    setPick({ a, b });
    const ws = blocks.slice(a, b + 1).filter(x2 => x2.kind === 'phrase');
    ctx.setSelection(ws.length ? { i0: ws[0].w0, i1: ws[ws.length - 1].w1 } : null);
  };
  const label = pb.length === 1 ? (pb[0].kind === 'gap' ? `Gap · ${(pb[0].e - pb[0].s).toFixed(1)} s` : `“${pb[0].text.slice(0, 40)}${pb[0].text.length > 40 ? '…' : ''}”`) : `${pb.length} blocks`;
  const isCut = pickRange ? covered(pickRange.s, pickRange.e, applied) : false;
  const isMuted = pickRange ? covered(pickRange.s, pickRange.e, mutes.map(m => [m.s, m.e] as [number, number])) : false;

  /* Split at the playhead (the transport's button). */
  useEffect(() => {
    const on = () => { const t = ctx.time; if (t > t0 + 0.2 && t < t1 - 0.2) void ctx.apply([{ op: 'scene.split', t }], `Split at ${clock(t)}`); else ctx.say({ who: 'ai', text: 'Move the playhead inside the video to split it there.' }); };
    window.addEventListener('vs-split', on);
    return () => window.removeEventListener('vs-split', on);
  });

  /* Trimming a Short by its edges, moving or stretching words on screen. A
     Short's edges snap to sentence boundaries (Alt to drag freely), so a
     Short never starts mid-word. */
  const snap = (t: number, alt: boolean) => {
    if (alt || !sentences.length) return t;
    const marks = sentences.flatMap(s => [s.s, s.e]);
    const best = marks.reduce((b, m) => (Math.abs(m - t) < Math.abs(b - t) ? m : b), marks[0]);
    return Math.abs(best - t) * pps < 14 && Math.abs(best - t) < 1.5 ? best : t;
  };
  const grab = (e: React.PointerEvent, kindG: 'clip' | 'ov' | 'ptr', id: string, edge: 's' | 'e' | 'both', s: number, en: number) => {
    e.stopPropagation(); e.preventDefault();
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    setHeld({ kind: kindG, id, edge, x0: e.clientX, s, e: en, ns: s, ne: en });
  };
  const drag2 = (e: React.PointerEvent) => {
    if (!held) return;
    const dt = (e.clientX - held.x0) / pps;
    let ns = held.s, ne = held.e;
    if (held.edge === 's' || held.edge === 'both') ns = held.s + dt;
    if (held.edge === 'e' || held.edge === 'both') ne = held.e + dt;
    if (held.kind === 'clip') { if (held.edge === 's') ns = snap(ns, e.altKey); if (held.edge === 'e') ne = snap(ne, e.altKey); }
    ns = Math.max(0, Math.min(ns, ne - 0.3)); ne = Math.min(duration, Math.max(ne, ns + 0.3));
    setHeld({ ...held, ns, ne });
  };
  const drop = () => {
    const m = held;
    setHeld(null);
    if (!m || (Math.abs(m.ns - m.s) < 0.02 && Math.abs(m.ne - m.e) < 0.02)) return;
    if (m.kind === 'clip') void ctx.apply([{ op: 'clip.update', id: m.id, patch: { s: m.ns, e: m.ne } }], `Short trimmed to ${clock(m.ns)}–${clock(m.ne)}`);
    else if (m.kind === 'ptr') void ctx.apply([{ op: 'pointer.focus.update', id: m.id, patch: { s: m.ns, e: m.ne } }], `Pointer followed ${clock(m.ns)}–${clock(m.ne)}`);
    else void ctx.apply([{ op: 'overlay.update', id: m.id, patch: { s: m.ns, e: m.ne } }], 'Words moved');
  };
  const live = (k: 'clip' | 'ov' | 'ptr', id: string, s: number, e: number): [number, number] => (held && held.kind === k && held.id === id ? [held.ns, held.ne] : [s, e]);

  /* A Screen Recorder recording: the stretches where the video follows the pointer, as a lane of their own. */
  const screenRec = !!view.extras?.screen;
  const focus = screenRec ? pointerOf(doc).focus : [];

  /* Keys outside text boxes and the script: I and O mark, X cuts, P protects, M makes a Short, F follows the pointer; Delete removes the selected blocks. */
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const el = e.target as HTMLElement;
      if (['INPUT', 'TEXTAREA', 'SELECT'].includes(el?.tagName) || el?.isContentEditable || el?.closest?.('[data-keys="own"]') || e.metaKey || e.ctrlKey) return;
      const t = ctx.time;
      const r = pickRange ?? sel;
      if (e.key === 'i') { setPick(null); setSel(s => ({ s: t, e: Math.max(t + 0.5, s?.e ?? t + 2) })); }
      else if (e.key === 'o') { setPick(null); setSel(s => ({ s: Math.min(s?.s ?? Math.max(0, t - 2), t - 0.5), e: t })); }
      else if ((e.key === 'x' || ((e.key === 'Delete' || e.key === 'Backspace') && pick)) && r) { const rr = pick ? removeRange() ?? r : r; void act([{ op: 'cut.add', s: rr.s, e: rr.e, reason: 'Cut on the timeline' }], `Cut ${clock(rr.s)}–${clock(rr.e)}`); }
      else if (e.key === 'p' && r) void act([{ op: 'protect.add', s: r.s, e: r.e, note: 'Protected on the timeline' }, { op: 'cut.restoreRange', s: r.s, e: r.e }], 'Protected a stretch');
      else if (e.key === 'f' && r && screenRec) void act([{ op: 'pointer.focus.add', s: r.s, e: r.e }], `Follow the pointer ${clock(r.s)}–${clock(r.e)}`);
      else if (e.key === 'm' && r && r.e - r.s >= 5) void act([{ op: 'clip.add', s: r.s, e: r.e, title: `Short from ${clock(r.s)}`, reason: 'Marked by you on the timeline' }], 'New Short from the timeline');
      else if (e.key === 'Escape' && (sel || pick)) { setSel(null); setPick(null); }
      else return;
      e.preventDefault();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <div className="vse-tl" data-testid="vs-timeline" data-tool={tool}>
      <div className="vse-tl-head">
        <b>{clip ? `Short ${doc.clips.indexOf(clip) + 1}` : 'Timeline'}</b>
        <span className="vs-kbd vse-hide-sm">{clock(span)} · press a phrase or a gap to select it (Shift extends) · drag to mark a stretch · Ctrl+scroll to zoom</span>
        <span className="vs-spacer" />
        <div className="vse-legend">
          <span><i style={{ background: '#e11d48' }} />Cut</span><span><i style={{ background: '#f59e0b' }} />Suggested</span><span><i style={{ background: '#0d9488' }} />Protected</span><span><i style={{ background: '#9ca3af' }} />Muted</span>
        </div>
      </div>
      <div className="vse-tl-scroll" ref={scroller}>
        <div className="vse-tl-inner" style={{ width: W + NAME_W }}>
          <div className="vse-tl-row" style={{ height: ROW.ruler }}>
            <div className="vse-tl-name" />
            <div className="vse-ruler" style={{ width: W }} onPointerDown={e => ctx.seek(at(e))}>
              {ticks.map(t => <span key={t} style={{ left: x(t) }}>{clock(t)}</span>)}
            </div>
          </div>
          <div className="vse-tl-row" style={{ height: ROW.scenes }}>
            <div className="vse-tl-name">Scenes</div>
            <div className="vse-lane video" style={{ width: W, height: ROW.scenes }} onPointerDown={down} onPointerMove={move} onPointerUp={up} data-lane="video">
              {strip ? tiles.map(i => {
                const t = Math.min(t1 - 0.01, t0 + (i * tileW + tileW / 2) / pps);
                const k = Math.min(strip.tiles - 1, Math.floor(t / strip.every));
                return <div key={i} className="vse-frame" style={{ left: i * tileW, width: tileW, backgroundImage: `url("${strip.url}")`, backgroundSize: `${strip.tiles * tileW}px ${ROW.scenes}px`, backgroundPosition: `${-k * tileW}px 0` }} />;
              }) : view.source.posterUrl ? <div className="vse-frame" style={{ left: 0, width: W, backgroundImage: `url("${view.source.posterUrl}")`, backgroundSize: `auto ${ROW.scenes}px`, backgroundRepeat: 'repeat-x' }} /> : null}
              {shades('video')}
              {scenes.map(sc => (
                <div key={sc.n} className={`vse-scene ${sc.split ? 'split' : ''}`} style={{ left: x(sc.s), width: Math.max(6, x(sc.e) - x(sc.s) - 2) }} data-scene={sc.n}
                  title={`Scene ${sc.n} · ${clock(sc.s)}–${clock(sc.e)}${sc.split ? ' · split by you' : ''}`}>
                  <span className="n">{sc.n}</span>
                  {x(sc.e) - x(sc.s) > 70 && <span className="ws">{sc.words.map(w => <i key={w.i}>{w.w}</i>)}</span>}
                  {sc.split && <button type="button" className="unsplit" aria-label={`Join scene ${sc.n} to the one before`} onClick={() => void ctx.apply([{ op: 'scene.join', t: sc.s }], `Joined at ${clock(sc.s)}`)}><X size={10} /></button>}
                </div>
              ))}
            </div>
          </div>
          <div className="vse-tl-row" style={{ height: ROW.caps }}>
            <div className="vse-tl-name">Captions</div>
            <div className="vse-lane" style={{ width: W, height: ROW.caps }} onPointerDown={down} onPointerMove={move} onPointerUp={up}>
              {cues.map((c, i) => x(c.e) - x(c.s) >= 3 && (
                <div key={i} className="vse-block cap" style={{ left: x(Math.max(c.s, t0)), width: Math.max(3, x(Math.min(c.e, t1)) - x(Math.max(c.s, t0)) - 1) }} title={c.text}>{x(c.e) - x(c.s) > 40 ? c.text : ''}</div>
              ))}
              {!cues.length && <span className="vse-lane-empty">{ctx.transcript ? 'No speech found' : 'Appears when transcribed'}</span>}
            </div>
          </div>
          <div className="vse-tl-row" style={{ height: ROW.phrases }}>
            <div className="vse-tl-name">Phrases</div>
            <div className="vse-lane phrases" style={{ width: W, height: ROW.phrases }} onPointerDown={down} onPointerMove={move} onPointerUp={up} data-testid="vs-phrases">
              {blocks.map((b, i) => {
                const w = x(b.e) - x(b.s);
                const cut = covered(b.s, b.e, applied), muted = covered(b.s, b.e, mutes.map(m => [m.s, m.e] as [number, number]));
                return (
                  <button key={`${b.kind}${b.s}`} type="button" className={`vse-pb ${b.kind} ${cut ? 'cut' : ''} ${muted ? 'muted' : ''}`} aria-pressed={i >= lo && i <= hi}
                    style={{ left: x(b.s), width: Math.max(3, w - 1) }} data-block={b.kind} data-i={i} data-s={b.s.toFixed(2)} data-e={b.e.toFixed(2)}
                    title={b.kind === 'gap' ? `Gap · ${(b.e - b.s).toFixed(1)} s` : b.text}
                    onClick={e => choose(i, e.shiftKey)}>
                    {b.kind === 'gap' ? (w > 14 ? '…' : '') : w > 30 ? b.text : ''}
                  </button>
                );
              })}
              {!blocks.length && <span className="vse-lane-empty">{ctx.transcript ? 'No speech found' : 'Appears when transcribed'}</span>}
            </div>
          </div>
          <div className="vse-tl-row" style={{ height: ROW.wave }}>
            <div className="vse-tl-name">Waveform</div>
            <div className="vse-lane wave" style={{ width: W, height: ROW.wave }} onPointerDown={down} onPointerMove={move} onPointerUp={up} data-testid="vs-wave">
              <canvas ref={canvas} style={{ width: W, height: ROW.wave }} aria-label="Waveform — what is cut is faded, what is muted is grey" />
              {shades('wave')}
            </div>
          </div>
          {screenRec && (
            <div className="vse-tl-row" style={{ height: ROW.pointer }}>
              <div className="vse-tl-name">Pointer</div>
              <div className="vse-lane" style={{ width: W, height: ROW.pointer }} onPointerMove={drag2} onPointerUp={drop} data-testid="vs-pointer-lane">
                {focus.filter(r => r.e > t0 && r.s < t1).map(r => {
                  const [s0, e0] = live('ptr', r.id, r.s, r.e);
                  return (
                    <div key={r.id} className={`vse-block ptr ${r.by}`} style={{ left: x(Math.max(t0, s0)), width: Math.max(16, x(Math.min(t1, e0)) - x(Math.max(t0, s0))) }} data-focus-block={r.id}
                      title={`${r.by === 'auto' ? `Picked: ${r.why}` : 'Marked by you'} — the video follows the pointer here. Drag to move, edges to resize; double-click for its settings.`}
                      onPointerDown={e => grab(e, 'ptr', r.id, 'both', r.s, r.e)} onDoubleClick={() => { ctx.seek(r.s); ctx.setTab('pointer'); }}>
                      <i className="h l" onPointerDown={e => grab(e, 'ptr', r.id, 's', r.s, r.e)} />
                      <MousePointer2 size={10} style={{ flex: 'none', marginRight: 3 }} />{x(e0) - x(s0) > 70 ? (r.by === 'auto' ? 'Picked' : 'Yours') : ''}{held?.id === r.id ? ` · ${clock(e0 - s0)}` : ''}
                      <button type="button" className="x" aria-label={`Stop following the pointer at ${clock(r.s)}`} onPointerDown={e => e.stopPropagation()} onClick={() => void ctx.apply([{ op: 'pointer.focus.remove', id: r.id }], `Stopped following the pointer at ${clock(r.s)}`)}><X size={9} /></button>
                      <i className="h r" onPointerDown={e => grab(e, 'ptr', r.id, 'e', r.s, r.e)} />
                    </div>
                  );
                })}
                {!focus.length && <button type="button" className="vse-add-music words" onClick={() => ctx.setTab('pointer')}><MousePointer2 size={12} /> Mark where to follow the pointer (drag on the timeline, then press F)</button>}
              </div>
            </div>
          )}
          {!clip && (
            <div className="vse-tl-row" style={{ height: ROW.shorts }}>
              <div className="vse-tl-name">Shorts</div>
              <div className="vse-lane" style={{ width: W, height: ROW.shorts }} onPointerMove={drag2} onPointerUp={drop}>
                {doc.clips.map((c, n) => {
                  const o = clipOut(c.id);
                  const [s0, e0] = live('clip', c.id, c.s, c.e);
                  return (
                    <div key={c.id} role="button" tabIndex={0} className="vse-block short" style={{ left: x(s0), width: Math.max(14, x(e0) - x(s0)) }}
                      onClick={() => { ctx.setActiveClip(c.id); ctx.seek(c.s); }} onKeyDown={e => { if (e.key === 'Enter') { ctx.setActiveClip(c.id); ctx.seek(c.s); } }}
                      title={`${c.title}${o?.stale ? ' — edited, render again' : ''} — press to open it as a composition; drag an edge to trim`} data-clip-block={c.id}>
                      <i className="h l" onPointerDown={e => grab(e, 'clip', c.id, 's', c.s, c.e)} data-edge="s" />
                      {n + 1}{x(e0) - x(s0) > 60 ? ` · ${c.title}` : ''}{held?.id === c.id ? ` · ${clock(e0 - s0)}` : ''}
                      <i className="h r" onPointerDown={e => grab(e, 'clip', c.id, 'e', c.s, c.e)} data-edge="e" />
                    </div>
                  );
                })}
              </div>
            </div>
          )}
          {clip && (
            <div className="vse-tl-row" style={{ height: ROW.shorts }}>
              <div className="vse-tl-name">Short</div>
              <div className="vse-lane" style={{ width: W, height: ROW.shorts }} onPointerMove={drag2} onPointerUp={drop}>
                {(() => {
                  const [s0, e0] = live('clip', clip.id, clip.s, clip.e);
                  return (
                    <div className="vse-block short on" style={{ left: x(Math.max(t0, s0)), width: Math.max(14, x(Math.min(t1, e0)) - x(Math.max(t0, s0))) }} data-clip-block={clip.id} title="Drag an edge to trim this Short">
                      <i className="h l" onPointerDown={e => grab(e, 'clip', clip.id, 's', clip.s, clip.e)} data-edge="s" />
                      {doc.clips.indexOf(clip) + 1} · {clip.title}{held?.id === clip.id ? ` · ${clock(e0 - s0)}` : ''}
                      <i className="h r" onPointerDown={e => grab(e, 'clip', clip.id, 'e', clip.s, clip.e)} data-edge="e" />
                    </div>
                  );
                })()}
              </div>
            </div>
          )}
          <div className="vse-tl-row" style={{ height: ROW.text }}>
            <div className="vse-tl-name">Text</div>
            <div className="vse-lane" style={{ width: W, height: ROW.text }} onPointerMove={drag2} onPointerUp={drop}>
              {(doc.overlays ?? []).filter(ov => ov.e > t0 && ov.s < t1).map((ov: Overlay) => {
                const [s0, e0] = live('ov', ov.id, ov.s, ov.e);
                return (
                  <div key={ov.id} className="vse-block ov" style={{ left: x(s0), width: Math.max(16, x(e0) - x(s0)), ['--ovbg' as string]: ov.bg }} title={`${ov.text} — drag to move, edges to resize`}
                    onPointerDown={e => grab(e, 'ov', ov.id, 'both', ov.s, ov.e)} onDoubleClick={() => ctx.setTab('text')} data-overlay-block={ov.id}>
                    <i className="h l" onPointerDown={e => grab(e, 'ov', ov.id, 's', ov.s, ov.e)} />
                    <Type size={10} style={{ flex: 'none', marginRight: 4 }} />{x(e0) - x(s0) > 50 ? ov.text : ''}
                    <i className="h r" onPointerDown={e => grab(e, 'ov', ov.id, 'e', ov.s, ov.e)} />
                  </div>
                );
              })}
              {!(doc.overlays ?? []).length && <button type="button" className="vse-add-music words" onClick={() => ctx.setTab('text')}><Plus size={12} /> Add words on screen</button>}
            </div>
          </div>
          <div className="vse-tl-row" style={{ height: ROW.music }}>
            <div className="vse-tl-name">Music</div>
            <div className="vse-lane" style={{ width: W, height: ROW.music }}>
              {doc.music ? (
                (doc.music.applyTo === 'shorts' ? doc.clips.map(c => [c.s, c.e] as [number, number]) : [[t0, t1] as [number, number]]).filter(([s, e]) => e > t0 && s < t1).map(([s, e], i) => (
                  <button key={i} type="button" className="vse-block music" style={{ left: x(Math.max(s, t0)), width: Math.max(14, x(Math.min(e, t1)) - x(Math.max(s, t0))) }} onClick={() => ctx.setTab('music')} title={`${doc.music!.title} — ${doc.music!.license}`}>
                    <Music2 size={11} style={{ flex: 'none', marginRight: 4 }} />{x(e) - x(s) > 80 ? `${doc.music!.title} · ${Math.round(doc.music!.volume * 100)}%` : ''}
                  </button>
                ))
              ) : (
                <button type="button" className="vse-add-music" onClick={() => ctx.setTab('music')}><Plus size={12} /> Add royalty-free music</button>
              )}
            </div>
          </div>
          <div className="vse-playhead" ref={headRef} style={{ left: NAME_W + x(ctx.time) }} />
        </div>
      </div>
      {pickRange && pick ? (
        <div className="vse-tl-actions" data-testid="vs-block-actions">
          <span className="vs-badge processing">{label} · {clock(pickRange.s)}–{clock(pickRange.e)}</span>
          <button type="button" className="vs-btn sm" onClick={() => ctx.seek(pickRange.s)}><Play size={13} /> Play</button>
          {!isCut && <button type="button" className="vs-btn sm" data-act="block-remove" onClick={() => { const r = removeRange()!; void act([{ op: 'cut.add', s: r.s, e: r.e, reason: pb.length === 1 && pb[0].kind === 'gap' ? 'Gap removed on the timeline' : `Removed “${pb.filter(b => b.kind === 'phrase').map(b => b.text).join(' ').slice(0, 60)}”` }], `Removed ${label}`); }}><Scissors size={13} /> Remove this section</button>}
          <button type="button" className="vs-btn sm" data-act="block-before" disabled={lo <= 0} onClick={() => selectBlocks(0, lo - 1)}><ChevronsLeft size={13} /> Select everything before</button>
          <button type="button" className="vs-btn sm" data-act="block-after" disabled={hi >= blocks.length - 1} onClick={() => selectBlocks(hi + 1, blocks.length - 1)}><ChevronsRight size={13} /> Select everything after</button>
          <button type="button" className="vs-btn sm" data-act="block-split" onClick={() => void ctx.apply([{ op: 'scene.split', t: pickRange.s }], `Split at ${clock(pickRange.s)}`)}><SplitSquareHorizontal size={13} /> Split here</button>
          {!isMuted && <button type="button" className="vs-btn sm" data-act="block-mute" onClick={() => void act([{ op: 'mute.add', s: pickRange.s, e: pickRange.e }], `Muted ${clock(pickRange.s)}–${clock(pickRange.e)}`)}><VolumeX size={13} /> Mute</button>}
          {screenRec && <button type="button" className="vs-btn sm" data-act="block-follow" onClick={() => void act([{ op: 'pointer.focus.add', s: pickRange.s, e: pickRange.e }], `Follow the pointer ${clock(pickRange.s)}–${clock(pickRange.e)}`)}><MousePointer2 size={13} /> Follow the pointer</button>}
          {onlyGaps && pb.length === 1 && pb[0].e - pb[0].s > 0.5 && !isCut && (
            <button type="button" className="vs-btn sm" data-act="block-shorten" onClick={() => void act([{ op: 'cut.add', s: pb[0].s + 0.15, e: pb[0].e - 0.15, reason: `Gap of ${(pb[0].e - pb[0].s).toFixed(1)} s shortened to 0.3 s` }], 'Shortened a gap')}><Minimize2 size={13} /> Shorten gap</button>
          )}
          {(isCut || isMuted || applied.some(([a, b]) => b > pickRange.s && a < pickRange.e) || mutes.some(m => m.e > pickRange.s && m.s < pickRange.e)) && (
            <button type="button" className="vs-btn sm" data-act="block-restore" onClick={() => void act([{ op: 'cut.restoreRange', s: pickRange.s - 0.05, e: pickRange.e + 0.05 }, { op: 'mute.restoreRange', s: pickRange.s - 0.05, e: pickRange.e + 0.05 }], `Restored ${clock(pickRange.s)}–${clock(pickRange.e)}`)}><RotateCcw size={13} /> Restore</button>
          )}
          <span className="vs-spacer" />
          <button type="button" className="vs-btn ghost sm" aria-label="Clear the selection" onClick={() => { setPick(null); ctx.setSelection(null); }}><X size={13} /></button>
        </div>
      ) : range && (
        <div className="vse-tl-actions" data-testid="vs-tl-actions">
          <span className="vs-badge processing">{clock(range.s)}–{clock(range.e)} · {(range.e - range.s).toFixed(1)} s</span>
          <button type="button" className="vs-btn sm" onClick={() => ctx.seek(range.s)}><Play size={13} /> Play</button>
          <button type="button" className="vs-btn sm" onClick={() => void act([{ op: 'cut.add', s: range.s, e: range.e, reason: 'Cut on the timeline' }], `Cut ${clock(range.s)}–${clock(range.e)}`)} data-act="tl-cut"><Scissors size={13} /> Cut</button>
          <button type="button" className="vs-btn sm" onClick={() => void act([{ op: 'cut.restoreRange', s: range.s, e: range.e }, { op: 'mute.restoreRange', s: range.s, e: range.e }], `Restored ${clock(range.s)}–${clock(range.e)}`)}><RotateCcw size={13} /> Restore</button>
          <button type="button" className="vs-btn sm" onClick={() => void act([{ op: 'mute.add', s: range.s, e: range.e }], `Muted ${clock(range.s)}–${clock(range.e)}`)}><VolumeX size={13} /> Mute</button>
          <button type="button" className="vs-btn sm" onClick={() => void act([{ op: 'protect.add', s: range.s, e: range.e, note: 'Protected on the timeline' }, { op: 'cut.restoreRange', s: range.s, e: range.e }], 'Protected a stretch')}><Shield size={13} /> Protect</button>
          <button type="button" className="vs-btn sm" disabled={range.e - range.s < 5} title={range.e - range.s < 5 ? 'Mark at least 5 seconds' : undefined}
            onClick={() => void act([{ op: 'clip.add', s: range.s, e: range.e, title: `Short from ${clock(range.s)}`, reason: 'Marked by you on the timeline' }], 'New Short from the timeline').then(() => ctx.setTab('shorts'))}><Film size={13} /> Make a Short</button>
          {screenRec && <button type="button" className="vs-btn sm" data-act="tl-follow" onClick={() => void act([{ op: 'pointer.focus.add', s: range.s, e: range.e }], `Follow the pointer ${clock(range.s)}–${clock(range.e)}`)}><MousePointer2 size={13} /> Follow the pointer</button>}
          {screenRec && focus.some(r => r.e > range.s && r.s < range.e) && <button type="button" className="vs-btn sm" data-act="tl-unfollow" onClick={() => void act([{ op: 'pointer.focus.removeRange', s: range.s, e: range.e }], `Stopped following the pointer ${clock(range.s)}–${clock(range.e)}`)}><X size={13} /> Stop following</button>}
          <span className="vs-spacer" />
          <button type="button" className="vs-btn ghost sm" aria-label="Clear the marked stretch" onClick={() => { setSel(null); ctx.setSelection(null); }}><X size={13} /></button>
        </div>
      )}
    </div>
  );
}
