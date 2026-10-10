/**
 * Design a thumbnail: pick a trending layout, the words (three to five read
 * best), the word in the accent colour, the moment, how close to the face,
 * the colours — and see it change as you go. "Make the PNG" then has the
 * engine draw it exactly (media/engine trendLayout), checks it is a real PNG,
 * and makes it the chosen thumbnail.
 *
 * The live preview is drawn here from the same frame of the editor's proxy
 * (same origin, so it can be painted into a canvas) and the face the tracker
 * found at that moment. It is a close likeness of the engine's layout, and is
 * labelled as a preview; the PNG is the real one.
 */
import { useEffect, useMemo, useRef, useState } from 'react';
import { X, Wand2, Loader, Check, Crosshair } from 'lucide-react';
import { designThumb, videoStatus, clock, keepRanges, trackAt, type OutputView, type ThumbSpec } from '../../services/videoStudio';
import type { EditorCtx } from './VideoEditor';

const LAYOUTS: { key: string; name: string; hint: string }[] = [
  { key: 'bold', name: 'Face + big words', hint: 'The face close, the words huge beside it' },
  { key: 'callout', name: 'Callout', hint: 'A ring round the face, an arrow to it' },
  { key: 'cinematic', name: 'Cinematic', hint: 'Letterboxed and graded — finance, documentary' },
  { key: 'split', name: 'Two moments', hint: 'Side by side' },
  { key: 'number', name: 'Big number', hint: 'The figure in your words, on a tile' },
  { key: 'band', name: 'Colour band', hint: 'Classic' },
  { key: 'frame', name: 'Framed', hint: 'Classic' },
];

/** A frame of the proxy at `t`, as an image the preview can use. */
function useFrame(src: string, t: number): string {
  const [url, setUrl] = useState('');
  const v = useRef<HTMLVideoElement | null>(null);
  useEffect(() => {
    if (!src) return;
    const el = v.current ?? document.createElement('video');
    v.current = el;
    el.muted = true; el.preload = 'auto'; el.crossOrigin = 'anonymous';
    if (el.src !== src) el.src = src;
    let gone = false;
    const draw = () => {
      if (gone || !el.videoWidth) return;
      const c = document.createElement('canvas');
      c.width = el.videoWidth; c.height = el.videoHeight;
      try { c.getContext('2d')!.drawImage(el, 0, 0); setUrl(c.toDataURL('image/jpeg', 0.85)); } catch { /* a tainted canvas leaves the poster */ }
    };
    const go = () => { el.currentTime = Math.max(0, t); };
    el.addEventListener('seeked', draw);
    if (el.readyState >= 1) go(); else el.addEventListener('loadedmetadata', go, { once: true });
    return () => { gone = true; el.removeEventListener('seeked', draw); };
  }, [src, t]);
  return url;
}

export default function ThumbnailDesigner({ ctx, o, onClose }: { ctx: EditorCtx; o: OutputView; onClose: () => void }) {
  const { view, doc, duration } = ctx;
  const clip = o.kind === 'short' ? doc.clips.find(c => c.id === o.clipId) : undefined;
  const keeps = useMemo(() => keepRanges(duration, doc, clip ? [clip.s, clip.e] : undefined), [duration, doc, clip]);
  const from = keeps[0]?.[0] ?? 0, to = keeps[keeps.length - 1]?.[1] ?? duration;
  const start = (o.thumbs[o.chosenThumb] ?? o.thumbs[0])?.spec;
  const words0 = (o.meta as { titles?: string[] }).titles?.[0] ?? o.title;
  const [sp, setSp] = useState<ThumbSpec>(() => start ?? {
    layout: 'bold', text: words0.split(/\s+/).slice(0, 5).join(' '), highlight: '', at: Math.min(to, from + (to - from) * 0.2),
    accent: '#facc15', color: '#0b0b12', textColor: '#ffffff', border: true, zoom: 0.5,
  });
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState('');
  const set = (p: Partial<ThumbSpec>) => setSp(s => ({ ...s, ...p }));
  const frame = useFrame(view.source.proxyUrl, sp.at);
  const tall = o.kind === 'short' && (clip?.aspect ?? '9:16') !== '16:9';
  const words = sp.text.trim().split(/\s+/).filter(Boolean);
  const face = ctx.track?.face?.length ? trackAt(ctx.track.face, sp.at) : null;

  const make = async () => {
    setBusy(true); setMsg('');
    const r = await designThumb(view.project.id, o.id, sp);
    if (!r.success) { setBusy(false); setMsg(r.error ?? 'It could not be made.'); return; }
    const set0 = r.set;
    /* Asked of the server itself: the editor's own copy is a step behind while this waits. */
    for (let i = 0; i < 90; i++) {
      await new Promise(res => setTimeout(res, 1500));
      const v = await videoStatus(view.project.id, -1);
      if (!v.success) continue;
      const now = v.outputs.find(x => x.id === o.id);
      const open = v.jobs.some(j => j.kind === 'thumbnails' && j.target === o.id && (j.state === 'queued' || j.state === 'running'));
      const failed = v.jobs.find(j => j.kind === 'thumbnails' && j.target === o.id && j.state === 'failed');
      if (now?.thumbs.some(t => t.set === set0)) break;
      if (!open && failed) { setBusy(false); setMsg(failed.error || 'The thumbnail could not be made.'); return; }
    }
    await ctx.refresh();
    setBusy(false);
    onClose();
  };

  const hl = sp.highlight.toUpperCase();
  const textNode = (size: string, align: 'center' | 'left' = 'center') => (
    <div className="td-words" style={{ fontSize: size, textAlign: align, color: sp.textColor }}>
      {words.map((w, i) => <span key={i} style={w.replace(/[^\p{L}\p{N}$€£%]/gu, '').toUpperCase() === hl && hl ? { color: sp.accent } : undefined}>{w.toUpperCase()} </span>)}
    </div>
  );
  /* The picture: zoomed towards the face when there is one, as the engine crops it. */
  const scale = sp.layout === 'bold' || sp.layout === 'number' ? 1.4 + sp.zoom * 0.9 : sp.layout === 'callout' ? 1.15 + sp.zoom * 0.5 : 1.05;
  const pos = face ? `${Math.round(face[0] * 100)}% ${Math.round(face[1] * 100)}%` : '50% 42%';
  const bg: React.CSSProperties = { backgroundImage: frame ? `url("${frame}")` : view.source.posterUrl ? `url("${view.source.posterUrl}")` : undefined, backgroundSize: `${Math.round(scale * 100)}% auto`, backgroundPosition: pos };
  const faceLeft = !face || face[0] <= 0.5;

  return (
    <div className="vs-modal-back" role="dialog" aria-modal="true" aria-label="Design the thumbnail" onClick={onClose}>
      <div className="vs-modal td" onClick={e => e.stopPropagation()} data-testid="vs-thumb-designer">
        <div className="vs-row" style={{ marginBottom: 10 }}>
          <h2 style={{ margin: 0, fontSize: 17 }}>Design the thumbnail · {o.title.slice(0, 40)}</h2>
          <span className="vs-spacer" />
          <button type="button" className="vs-btn ghost sm" onClick={onClose} aria-label="Close"><X size={15} /></button>
        </div>
        <div className="td-body">
          <div className="td-stage">
            <div className={`td-canvas ${tall ? 'tall' : ''} lay-${sp.layout} ${sp.border ? 'edge' : ''}`} style={{ ['--acc' as string]: sp.accent, ['--panel' as string]: sp.color }} data-testid="vs-thumb-preview">
              {sp.layout === 'split' ? (
                <div className="td-split"><div style={bg} /><div style={{ ...bg, filter: 'saturate(1.2) brightness(0.95)' }} /></div>
              ) : <div className="td-bg" style={{ ...bg, filter: sp.layout === 'cinematic' ? 'saturate(.7) contrast(1.08)' : 'saturate(1.3) contrast(1.1)' }} />}
              {(sp.layout === 'bold' || sp.layout === 'number') && <div className={`td-panel ${tall ? 'bottom' : faceLeft ? 'right' : 'left'}`} />}
              {sp.layout === 'cinematic' && <><div className="td-bar top" /><div className="td-bar bottom" /></>}
              {sp.layout === 'callout' && face && <div className="td-ring" style={{ left: tall ? '50%' : '60%', top: tall ? '58%' : '50%' }} />}
              <div className={`td-text ${sp.layout} ${tall ? 'tall' : faceLeft ? 'right' : 'left'}`}>
                {sp.layout === 'number' && /\d/.test(sp.text) ? (
                  <><div className="td-tile">{(sp.text.match(/[$€£]?\d[\d.,]*%?(\s(million|billion|thousand))?/i) ?? [''])[0].toUpperCase()}</div>{textNode(tall ? '4.5cqw' : '3.4cqw')}</>
                ) : textNode(sp.layout === 'cinematic' ? (tall ? '5cqw' : '3.6cqw') : tall ? '8cqw' : '6.6cqw', sp.layout === 'callout' ? 'left' : 'center')}
              </div>
            </div>
            <span className="vs-kbd">Live preview — close to the PNG, which the engine draws exactly when you make it.</span>
          </div>
          <div className="td-controls vs-col">
            <div className="td-layouts">
              {LAYOUTS.map(l => <button key={l.key} type="button" className="td-layout" aria-pressed={sp.layout === l.key} onClick={() => set({ layout: l.key })} data-layout={l.key}><b>{l.name}</b><small>{l.hint}</small></button>)}
            </div>
            <label className="vs-label">Words <span className="vs-kbd" style={{ fontWeight: 500 }}>{words.length} — three to five read best on a phone</span>
              <input className="vs-input" value={sp.text} maxLength={80} onChange={e => set({ text: e.target.value })} data-field="video.thumbText" data-testid="vs-thumb-text" />
            </label>
            <div className="vs-label">Word in the accent colour
              <div className="vs-chips">{words.map((w, i) => { const bare = w.replace(/[^\p{L}\p{N}$€£%]/gu, ''); return <button key={i} type="button" className="vs-chip" aria-pressed={sp.highlight.toUpperCase() === bare.toUpperCase()} onClick={() => set({ highlight: sp.highlight.toUpperCase() === bare.toUpperCase() ? '' : bare })}>{w}</button>; })}</div>
            </div>
            <label className="vs-label">Moment · {clock(sp.at)}
              <div className="vs-row" style={{ flexWrap: 'nowrap' }}>
                <input type="range" min={from} max={to} step={0.1} value={sp.at} onChange={e => set({ at: Number(e.target.value) })} style={{ flex: 1 }} aria-label="Moment" />
                <button type="button" className="vs-btn sm" title="Use the playhead" onClick={() => set({ at: Math.min(to, Math.max(from, ctx.time)) })}><Crosshair size={13} /></button>
              </div>
            </label>
            {(sp.layout === 'bold' || sp.layout === 'number' || sp.layout === 'callout') && (
              <label className="vs-label">How close to the face · {Math.round(sp.zoom * 100)}%<input type="range" min={0} max={1} step={0.05} value={sp.zoom} onChange={e => set({ zoom: Number(e.target.value) })} aria-label="Zoom" /></label>
            )}
            <div className="vs-row">
              <label className="vs-label" style={{ flex: 1 }}>Accent<input type="color" className="vs-input" style={{ height: 34, padding: 3 }} value={sp.accent} onChange={e => set({ accent: e.target.value })} /></label>
              <label className="vs-label" style={{ flex: 1 }}>Panel<input type="color" className="vs-input" style={{ height: 34, padding: 3 }} value={sp.color} onChange={e => set({ color: e.target.value })} /></label>
              <label className="vs-label" style={{ flex: 1 }}>Words<input type="color" className="vs-input" style={{ height: 34, padding: 3 }} value={sp.textColor} onChange={e => set({ textColor: e.target.value })} /></label>
            </div>
            <label className="vs-row" style={{ gap: 6, fontSize: 13 }}><input type="checkbox" checked={sp.border} onChange={e => set({ border: e.target.checked })} /> Coloured edge (stands out on light and dark YouTube)</label>
            {!face && (sp.layout === 'callout' || sp.layout === 'bold') && <span className="vs-kbd">No face found at this moment — the picture is framed on the centre, and nothing is ringed.</span>}
            {msg && <div className="vs-note bad">{msg}</div>}
            <button type="button" className="vs-btn ai" disabled={busy || !words.length} onClick={() => void make()} data-act="make-thumb">
              {busy ? <Loader size={15} className="spin" /> : <Wand2 size={15} />} {busy ? 'Making the PNG…' : 'Make the PNG and use it'}
            </button>
            <span className="vs-kbd"><Check size={11} /> Checked as a real PNG before it is offered.</span>
          </div>
        </div>
      </div>
    </div>
  );
}
