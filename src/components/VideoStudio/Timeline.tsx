/**
 * The timeline: the whole recording on one clock, as tracks — the picture
 * (a filmstrip the engine cut from the proxy, one frame every few seconds),
 * what is said (sentences), the Shorts, the sound (the measured waveform) and
 * the music. Cuts are drawn over the picture and the sound: red where they
 * apply, amber where they are only suggested; protected parts in teal.
 *
 * A press moves the playhead; a drag marks a stretch, and the bar under the
 * tracks offers what can be done with it — cut, restore, protect, make a
 * Short — each one the same operation the transcript's buttons send.
 */
import { useEffect, useMemo, useRef, useState } from 'react';
import { ZoomIn, ZoomOut, Scissors, RotateCcw, Shield, Film, X, Play, Music2, Plus, Maximize, Type } from 'lucide-react';
import { clock, effectiveCuts, sentencesOf, type Overlay } from '../../services/videoStudio';
import type { EditorCtx } from './VideoEditor';

const NAME_W = 96;
const ROW = { ruler: 22, video: 56, words: 28, text: 26, shorts: 32, wave: 44, music: 30 };

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
  const [sel, setSel] = useState<{ s: number; e: number } | null>(null);
  const drag = useRef<{ x0: number; t0: number; moved: boolean } | null>(null);
  const headRef = useRef<HTMLDivElement>(null);
  /* A Short's edge or an overlay being dragged: where it was, and where it is now. */
  const [held, setHeld] = useState<{ kind: 'clip' | 'ov'; id: string; edge: 's' | 'e' | 'both'; x0: number; s: number; e: number; ns: number; ne: number } | null>(null);

  useEffect(() => {
    const el = scroller.current;
    if (!el) return;
    const ro = new ResizeObserver(() => setWidth(Math.max(200, el.clientWidth - NAME_W - 4)));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const dur = Math.max(1, duration);
  const pps = (width / dur) * zoom;
  const W = Math.max(width, Math.round(dur * pps));
  const x = (t: number) => t * pps;


  /* The playhead moves every frame from the player's own loop, not through React. */
  useEffect(() => {
    const on = (e: Event) => {
      const t = (e as CustomEvent<number>).detail;
      if (headRef.current) headRef.current.style.left = `${NAME_W + t * pps}px`;
      const el = scroller.current;
      if (el && zoom > 1) {
        const px = t * pps + NAME_W;
        if (px < el.scrollLeft + NAME_W + 20 || px > el.scrollLeft + el.clientWidth - 40) el.scrollLeft = Math.max(0, px - NAME_W - el.clientWidth * 0.25);
      }
    };
    window.addEventListener('vs-frame', on);
    return () => window.removeEventListener('vs-frame', on);
  }, [pps, zoom]);

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
        requestAnimationFrame(() => { el.scrollLeft = Math.max(0, at * (width / dur) * nz - (e.clientX - r.left - NAME_W)); });
        return nz;
      });
    };
    el.addEventListener('wheel', onWheel, { passive: false });
    return () => el.removeEventListener('wheel', onWheel);
  }, [pps, width, dur]);

  /* The waveform, drawn at most 16k pixels wide and stretched beyond. */
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
    const grad = g.createLinearGradient(0, 0, 0, h);
    grad.addColorStop(0, '#c084fc'); grad.addColorStop(1, '#ec4899');
    g.fillStyle = grad;
    const rate = 20;
    const bar = Math.max(1, Math.round(1.5 * dpr)), stepPx = bar + Math.max(1, Math.round(dpr));
    for (let px = 0; px < w; px += stepPx) {
      const t0 = (px / w) * dur, t1 = ((px + stepPx) / w) * dur;
      let v = 0;
      for (let i = Math.floor(t0 * rate); i <= Math.floor(t1 * rate); i++) v = Math.max(v, wave[i] ?? 0);
      const bh = Math.max(1, (v / 255) * h * 0.92);
      g.fillRect(px, (h - bh) / 2, bar, bh);
    }
  }, [wave, W, dur]);

  const sentences = useMemo(() => ctx.transcript ? sentencesOf(ctx.transcript.words) : [], [ctx.transcript]);
  const applied = useMemo(() => effectiveCuts(doc), [doc]);
  const proposed = doc.cuts.filter(c => c.state === 'proposed');

  /* The transcript's selection, shown here too. */
  const words = ctx.transcript?.words ?? [];
  const tSel = ctx.selection && words.length ? { s: words[Math.min(ctx.selection.i0, ctx.selection.i1)]?.s ?? 0, e: words[Math.max(ctx.selection.i0, ctx.selection.i1)]?.e ?? 0 } : null;
  const range = sel ?? tSel;

  const at = (e: React.PointerEvent) => {
    const r = (e.currentTarget as HTMLElement).getBoundingClientRect();
    return Math.max(0, Math.min(dur, (e.clientX - r.left) / pps));
  };
  const down = (e: React.PointerEvent<HTMLDivElement>) => {
    if ((e.target as HTMLElement).closest('button')) return;
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    drag.current = { x0: e.clientX, t0: at(e), moved: false };
  };
  const move = (e: React.PointerEvent<HTMLDivElement>) => {
    const d = drag.current;
    if (!d) return;
    if (Math.abs(e.clientX - d.x0) > 4) d.moved = true;
    if (d.moved) { const t = at(e); setSel({ s: Math.min(d.t0, t), e: Math.max(d.t0, t) }); }
  };
  const up = (e: React.PointerEvent<HTMLDivElement>) => {
    const d = drag.current;
    drag.current = null;
    if (!d) return;
    if (!d.moved) { setSel(null); ctx.seek(at(e)); }
  };

  const ticks = useMemo(() => { const s = tickStep(pps); const out: number[] = []; for (let t = 0; t <= dur; t += s) out.push(t); return out; }, [pps, dur]);
  const strip = view.source.filmstrip;
  const tileW = Math.round(ROW.video * (strip ? strip.w / strip.h : 16 / 9));
  const tiles = strip ? Array.from({ length: Math.ceil(W / tileW) }, (_, i) => i) : [];
  const clipOut = (id: string) => view.outputs.find(o => o.kind === 'short' && o.clipId === id);

  const overlays = (
    <>
      {applied.map(([s, e], i) => <div key={`a${i}`} className="vse-cutzone" style={{ left: x(s), width: Math.max(2, x(e) - x(s)) }} />)}
      {proposed.map(c => <div key={c.id} className="vse-cutzone prop" style={{ left: x(c.s), width: Math.max(2, x(c.e) - x(c.s)) }} title={c.reason} />)}
      {doc.protects.map(p => <div key={p.id} className="vse-protect" style={{ left: x(p.s), width: Math.max(2, x(p.e) - x(p.s)) }} title="Protected" />)}
      {range && <div className="vse-selzone" style={{ left: x(range.s), width: Math.max(2, x(range.e) - x(range.s)) }} />}
    </>
  );

  const act = async (ops: Parameters<EditorCtx['apply']>[0], note: string) => { if (await ctx.apply(ops, note)) setSel(null); };

  /* Trimming a Short by its edges, moving or stretching words on screen. A
     Short's edges snap to sentence boundaries (Alt to drag freely), so a
     Short never starts mid-word. */
  const snap = (t: number, alt: boolean) => {
    if (alt || !sentences.length) return t;
    const marks = sentences.flatMap(s => [s.s, s.e]);
    const best = marks.reduce((b, m) => (Math.abs(m - t) < Math.abs(b - t) ? m : b), marks[0]);
    return Math.abs(best - t) * pps < 14 ? best : t;
  };
  const grab = (e: React.PointerEvent, kind: 'clip' | 'ov', id: string, edge: 's' | 'e' | 'both', s: number, en: number) => {
    e.stopPropagation(); e.preventDefault();
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    setHeld({ kind, id, edge, x0: e.clientX, s, e: en, ns: s, ne: en });
  };
  const drag2 = (e: React.PointerEvent) => {
    if (!held) return;
    const dt = (e.clientX - held.x0) / pps;
    let ns = held.s, ne = held.e;
    if (held.edge === 's' || held.edge === 'both') ns = held.s + dt;
    if (held.edge === 'e' || held.edge === 'both') ne = held.e + dt;
    if (held.kind === 'clip') { if (held.edge === 's') ns = snap(ns, e.altKey); if (held.edge === 'e') ne = snap(ne, e.altKey); }
    ns = Math.max(0, Math.min(ns, ne - 0.3)); ne = Math.min(dur, Math.max(ne, ns + 0.3));
    setHeld({ ...held, ns, ne });
  };
  const drop = () => {
    const m = held;
    setHeld(null);
    if (!m || (Math.abs(m.ns - m.s) < 0.02 && Math.abs(m.ne - m.e) < 0.02)) return;
    if (m.kind === 'clip') void ctx.apply([{ op: 'clip.update', id: m.id, patch: { s: m.ns, e: m.ne } }], `Short trimmed to ${clock(m.ns)}–${clock(m.ne)}`);
    else void ctx.apply([{ op: 'overlay.update', id: m.id, patch: { s: m.ns, e: m.ne } }], 'Words moved');
  };
  const live = (kind: 'clip' | 'ov', id: string, s: number, e: number): [number, number] => (held && held.kind === kind && held.id === id ? [held.ns, held.ne] : [s, e]);

  /* Keys while the timeline has the pointer: I and O mark the stretch, X cuts it, P protects it, M makes a Short of it. */
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const el = e.target as HTMLElement;
      if (['INPUT', 'TEXTAREA', 'SELECT'].includes(el?.tagName) || el?.isContentEditable || e.metaKey || e.ctrlKey) return;
      const t = ctx.time;
      if (e.key === 'i') setSel(s => ({ s: t, e: Math.max(t + 0.5, s?.e ?? t + 2) }));
      else if (e.key === 'o') setSel(s => ({ s: Math.min(s?.s ?? Math.max(0, t - 2), t - 0.5), e: t }));
      else if (e.key === 'x' && sel) void act([{ op: 'cut.add', s: sel.s, e: sel.e, reason: 'Cut on the timeline' }], `Cut ${clock(sel.s)}–${clock(sel.e)}`);
      else if (e.key === 'p' && sel) void act([{ op: 'protect.add', s: sel.s, e: sel.e, note: 'Protected on the timeline' }, { op: 'cut.restoreRange', s: sel.s, e: sel.e }], 'Protected a stretch');
      else if (e.key === 'm' && sel && sel.e - sel.s >= 5) void act([{ op: 'clip.add', s: sel.s, e: sel.e, title: `Short from ${clock(sel.s)}`, reason: 'Marked by you on the timeline' }], 'New Short from the timeline');
      else if (e.key === 'Escape') setSel(null);
      else return;
      e.preventDefault();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <div className="vse-tl" data-testid="vs-timeline">
      <div className="vse-tl-head">
        <b>Timeline</b>
        <span className="vs-kbd">{clock(dur)} · press to move the playhead, drag to mark (or I / O), then X cut · P protect · M make a Short · drag a Short's edges to trim · Ctrl+scroll to zoom</span>
        <span className="vs-spacer" />
        <div className="vse-legend">
          <span><i style={{ background: '#f05d6c' }} />Cut</span><span><i style={{ background: '#fbbf24' }} />Suggested</span><span><i style={{ background: '#2dd4bf' }} />Protected</span>
        </div>
        <button type="button" className="vs-btn sm" onClick={() => setZoom(z => Math.max(1, z / 1.6))} disabled={zoom <= 1} aria-label="Zoom out"><ZoomOut size={14} /></button>
        <button type="button" className="vs-btn sm" onClick={() => setZoom(1)} disabled={zoom === 1} aria-label="Fit the whole video"><Maximize size={14} /></button>
        <button type="button" className="vs-btn sm" onClick={() => setZoom(z => Math.min(80, z * 1.6))} aria-label="Zoom in"><ZoomIn size={14} /></button>
      </div>
      <div className="vse-tl-scroll" ref={scroller}>
        <div className="vse-tl-inner" style={{ width: W + NAME_W }}>
          <div className="vse-tl-row" style={{ height: ROW.ruler }}>
            <div className="vse-tl-name" />
            <div className="vse-ruler" style={{ width: W }} onPointerDown={e => ctx.seek(at(e))}>
              {ticks.map(t => <span key={t} style={{ left: x(t) }}>{clock(t)}</span>)}
            </div>
          </div>
          <div className="vse-tl-row" style={{ height: ROW.video }}>
            <div className="vse-tl-name">Video</div>
            <div className="vse-lane video" style={{ width: W, height: ROW.video }} onPointerDown={down} onPointerMove={move} onPointerUp={up} data-lane="video">
              {strip ? tiles.map(i => {
                const t = Math.min(dur - 0.01, (i * tileW + tileW / 2) / pps);
                const k = Math.min(strip.tiles - 1, Math.floor(t / strip.every));
                return <div key={i} className="vse-frame" style={{ left: i * tileW, width: tileW, backgroundImage: `url("${strip.url}")`, backgroundSize: `${strip.tiles * tileW}px ${ROW.video}px`, backgroundPosition: `${-k * tileW}px 0` }} />;
              }) : view.source.posterUrl ? <div className="vse-frame" style={{ left: 0, width: W, backgroundImage: `url("${view.source.posterUrl}")`, backgroundSize: `auto ${ROW.video}px`, backgroundRepeat: 'repeat-x' }} /> : null}
              {overlays}
            </div>
          </div>
          <div className="vse-tl-row" style={{ height: ROW.words }}>
            <div className="vse-tl-name">Text</div>
            <div className="vse-lane" style={{ width: W, height: ROW.words }} onPointerMove={drag2} onPointerUp={drop}>
              {(doc.overlays ?? []).map((ov: Overlay) => {
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
          <div className="vse-tl-row" style={{ height: ROW.text }}>
            <div className="vse-tl-name">Speech</div>
            <div className="vse-lane" style={{ width: W, height: ROW.text }} onPointerDown={down} onPointerMove={move} onPointerUp={up}>
              {sentences.map((s, i) => x(s.e) - x(s.s) >= 3 && (
                <div key={i} className="vse-block cap" style={{ left: x(s.s), width: x(s.e) - x(s.s) - 1 }} title={s.text}>{x(s.e) - x(s.s) > 40 ? s.text : ''}</div>
              ))}
              {!sentences.length && <span className="vse-lane-empty">{ctx.transcript ? 'No speech found' : 'Appears when transcribed'}</span>}
            </div>
          </div>
          <div className="vse-tl-row" style={{ height: ROW.shorts }}>
            <div className="vse-tl-name">Shorts</div>
            <div className="vse-lane" style={{ width: W, height: ROW.shorts }} onPointerMove={drag2} onPointerUp={drop}>
              {doc.clips.map((c, n) => {
                const o = clipOut(c.id);
                const [s0, e0] = live('clip', c.id, c.s, c.e);
                return (
                  <div key={c.id} role="button" tabIndex={0} className={`vse-block short ${ctx.activeClip === c.id ? 'on' : ''}`} style={{ left: x(s0), width: Math.max(14, x(e0) - x(s0)) }}
                    onClick={() => { ctx.setActiveClip(c.id); ctx.seek(c.s); }} onKeyDown={e => { if (e.key === 'Enter') { ctx.setActiveClip(c.id); ctx.seek(c.s); } }}
                    title={`${c.title}${o?.stale ? ' — edited, render again' : ''} — drag an edge to trim`} data-clip-block={c.id}>
                    <i className="h l" onPointerDown={e => grab(e, 'clip', c.id, 's', c.s, c.e)} data-edge="s" />
                    {n + 1}{x(e0) - x(s0) > 60 ? ` · ${c.title}` : ''}{held?.id === c.id ? ` · ${clock(e0 - s0)}` : ''}
                    <i className="h r" onPointerDown={e => grab(e, 'clip', c.id, 'e', c.s, c.e)} data-edge="e" />
                  </div>
                );
              })}
            </div>
          </div>
          <div className="vse-tl-row" style={{ height: ROW.wave }}>
            <div className="vse-tl-name">Audio</div>
            <div className="vse-lane wave" style={{ width: W, height: ROW.wave }} onPointerDown={down} onPointerMove={move} onPointerUp={up} data-testid="vs-wave">
              <canvas ref={canvas} style={{ width: W, height: ROW.wave }} aria-label="Waveform" />
              {overlays}
            </div>
          </div>
          <div className="vse-tl-row" style={{ height: ROW.music }}>
            <div className="vse-tl-name">Music</div>
            <div className="vse-lane" style={{ width: W, height: ROW.music }}>
              {doc.music ? (
                (doc.music.applyTo === 'shorts' ? doc.clips.map(c => [c.s, c.e] as [number, number]) : [[0, dur] as [number, number]]).map(([s, e], i) => (
                  <button key={i} type="button" className="vse-block music" style={{ left: x(s), width: Math.max(14, x(e) - x(s)) }} onClick={() => ctx.setTab('music')} title={`${doc.music!.title} — ${doc.music!.license}`}>
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
      {range && (
        <div className="vse-tl-actions" data-testid="vs-tl-actions">
          <span className="vs-badge processing">{clock(range.s)}–{clock(range.e)} · {(range.e - range.s).toFixed(1)} s</span>
          <button type="button" className="vs-btn sm" onClick={() => ctx.seek(range.s)}><Play size={13} /> Play</button>
          <button type="button" className="vs-btn sm" onClick={() => void act([{ op: 'cut.add', s: range.s, e: range.e, reason: 'Cut on the timeline' }], `Cut ${clock(range.s)}–${clock(range.e)}`)} data-act="tl-cut"><Scissors size={13} /> Cut</button>
          <button type="button" className="vs-btn sm" onClick={() => void act([{ op: 'cut.restoreRange', s: range.s, e: range.e }], `Restored ${clock(range.s)}–${clock(range.e)}`)}><RotateCcw size={13} /> Restore</button>
          <button type="button" className="vs-btn sm" onClick={() => void act([{ op: 'protect.add', s: range.s, e: range.e, note: 'Protected on the timeline' }, { op: 'cut.restoreRange', s: range.s, e: range.e }], 'Protected a stretch')}><Shield size={13} /> Protect</button>
          <button type="button" className="vs-btn sm" disabled={range.e - range.s < 5} title={range.e - range.s < 5 ? 'Mark at least 5 seconds' : undefined}
            onClick={() => void act([{ op: 'clip.add', s: range.s, e: range.e, title: `Short from ${clock(range.s)}`, reason: 'Marked by you on the timeline' }], 'New Short from the timeline').then(() => ctx.setTab('shorts'))}><Film size={13} /> Make a Short</button>
          <span className="vs-spacer" />
          <button type="button" className="vs-btn ghost sm" aria-label="Clear the marked stretch" onClick={() => { setSel(null); ctx.setSelection(null); }}><X size={13} /></button>
        </div>
      )}
    </div>
  );
}
