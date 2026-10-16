/**
 * Design a thumbnail: pick a trending layout and change everything a creator
 * changes — the words, which word is picked out (coloured, or in a tilted
 * box), the colours and the background gradient, where the words sit and how
 * big, which side the face is on, a sticker, an arrow or a ring, a channel
 * strip, the moment and how close to the face — and see it change as you go.
 * "Make the PNG" has the engine draw it exactly, checks it is a real PNG, and
 * makes it the chosen thumbnail.
 *
 * The live preview draws the very plan the engine paints
 * (media/engine/thumbLayout.mjs `thumbPlan`): the same crop round the face,
 * the same lines of words at the same sizes and places, the same arrow,
 * ring, sticker and strip. Its picture is a frame of the editor's proxy
 * (same origin, so it can be painted) and its face the tracker's at that
 * moment; its fonts and blur are the browser's. So it is a close likeness,
 * labelled as a preview, and the PNG is the real one.
 */
import { useEffect, useMemo, useRef, useState } from 'react';
import { X, Wand2, Loader, Check, Crosshair } from 'lucide-react';
import {
  designThumb, videoStatus, clock, keepRanges, thumbPlan, normaliseSpec, EM, CONDENSE, HALO, STICKERS,
  type OutputView, type ThumbSpec, type ThumbPlan, type TrackRow,
} from '../../services/videoStudio';
import type { EditorCtx } from './VideoEditor';

const LAYOUTS: { key: string; name: string; hint: string; tall?: boolean; wide?: boolean }[] = [
  { key: 'bold', name: 'Face + big words', hint: 'The face close, huge words on a gradient panel' },
  { key: 'glow', name: 'Glow', hint: 'Sharp face in a glow on a blurred gradient' },
  { key: 'headline', name: 'Big headline', hint: 'Words first — screens and tutorials' },
  { key: 'short', name: 'Shorts cover', hint: '9:16: face high, a strip, words low', tall: true },
  { key: 'callout', name: 'Callout', hint: 'A ring round the face, an arrow to it' },
  { key: 'split', name: 'Two moments', hint: 'Before / after — "A vs B" splits the words' },
  { key: 'number', name: 'Big number', hint: 'The figure in your words, on a tile' },
  { key: 'cinematic', name: 'Cinematic', hint: 'Letterboxed and graded — finance, documentary' },
  { key: 'band', name: 'Colour band', hint: 'Classic' },
  { key: 'frame', name: 'Framed', hint: 'Classic' },
];
const CLASSIC = new Set(['band', 'frame', 'left']);
const STICKER_NAMES: Record<string, string> = { check: 'Tick', cross: 'Cross', up: 'Up arrow', down: 'Down arrow', money: 'Money', alert: 'Alert', question: 'Question', star: 'Star' };
/* Gradients from the trending examples, one press each. */
const GRADIENTS: [string, string][] = [['#6d28d9', '#1d4ed8'], ['#b91c1c', '#111111'], ['#f97316', '#7c2d12'], ['#0f172a', '#7f1d1d'], ['#0e7490', '#1e1b4b'], ['#111827', '#374151']];

/** A frame of the proxy at `t`, as an image the preview can paint, with its size. */
function useFrame(src: string, t: number | undefined): { url: string; w: number; h: number } {
  const [f, setF] = useState({ url: '', w: 0, h: 0 });
  const v = useRef<HTMLVideoElement | null>(null);
  useEffect(() => {
    if (!src || t === undefined) return;
    const el = v.current ?? document.createElement('video');
    v.current = el;
    el.muted = true; el.preload = 'auto'; el.crossOrigin = 'anonymous';
    if (el.src !== src) el.src = src;
    let gone = false;
    const draw = () => {
      if (gone || !el.videoWidth) return;
      const c = document.createElement('canvas');
      c.width = el.videoWidth; c.height = el.videoHeight;
      try { c.getContext('2d')!.drawImage(el, 0, 0); setF({ url: c.toDataURL('image/jpeg', 0.85), w: el.videoWidth, h: el.videoHeight }); } catch { /* a tainted canvas leaves the poster */ }
    };
    const go = () => { el.currentTime = Math.max(0, t); };
    el.addEventListener('seeked', draw);
    if (el.readyState >= 1) go(); else el.addEventListener('loadedmetadata', go, { once: true });
    return () => { gone = true; el.removeEventListener('seeked', draw); };
  }, [src, t]);
  return f;
}

/** The tracker's face at `t`, as fractions of the frame (its box is about 0.78 as wide as tall). */
function faceAt(rows: TrackRow[] | undefined, t: number, fw: number, fh: number): { x: number; y: number; w: number; h: number } | null {
  if (!rows?.length || !fw || !fh) return null;
  let best = rows[0];
  for (const r of rows) { if (r[0] <= t) best = r; else break; }
  const h = best[3];
  if (!(h > 0.02)) return null;
  const w = (h * 0.78 * fh) / fw;
  return { x: best[1] - w / 2, y: best[2] - h / 2, w, h };
}

const pct = (v: number, of: number) => `${(v / of) * 100}%`;

/** The frame, cropped as the plan crops it, as a positioned picture. */
function Pic({ src, crop, sw, sh, filter, mask, className = 'td-pic' }: { src: string; crop: { x: number; y: number; w: number; h: number }; sw: number; sh: number; filter?: string; mask?: string; className?: string }) {
  return (
    <div className={className} style={mask ? { maskImage: mask, WebkitMaskImage: mask } : undefined}>
      {src && <img src={src} alt="" draggable={false} style={{ width: pct(sw, crop.w), height: pct(sh, crop.h), left: `${(-crop.x / crop.w) * 100}%`, top: `${(-crop.y / crop.h) * 100}%`, filter }} />}
    </div>
  );
}

/** The plan, drawn — the same numbers the engine paints. */
export function PlanPreview({ plan, frame, frame2 }: { plan: ThumbPlan; frame: { url: string; w: number; h: number }; frame2: { url: string; w: number; h: number } }) {
  const { W, H } = plan;
  const cq = (px: number) => `${(px / W) * 100}cqw`;
  const g = plan.grade;
  const filter = `contrast(${g.contrast}) saturate(${g.saturation}) brightness(${1 + g.brightness})${g.blur ? ` blur(${cq(g.blur)})` : ''}${g.cinematic ? ' sepia(.12) hue-rotate(-8deg)' : ''}`;
  const sw = frame.w || W, sh = frame.h || H;
  const ell = (e: { cx: number; cy: number; rx: number; ry: number }) => `${pct(e.rx, W)} ${pct(e.ry, H)} at ${pct(e.cx, W)} ${pct(e.cy, H)}`;
  return (
    <>
      {plan.split ? (
        <div className={`td-split ${plan.split.vertical ? 'v' : ''}`}>
          <div className="td-half">{plan.crop && <Pic src={frame.url} crop={plan.crop} sw={sw} sh={sh} filter="contrast(1.1) saturate(1.25)" />}</div>
          <div className="td-half">{plan.crop2 && <Pic src={frame2.url || frame.url} crop={plan.crop2} sw={frame2.w || sw} sh={frame2.h || sh} filter="contrast(1.1) saturate(1.25)" />}</div>
          <i className="td-divider" style={{ background: plan.split.divider.color, [plan.split.vertical ? 'height' : 'width']: cq(plan.split.divider.t) }} />
        </div>
      ) : plan.crop && <Pic src={frame.url} crop={plan.crop} sw={sw} sh={sh} filter={filter} />}
      {plan.fills.map((f, i) => {
        const a = f.alpha;
        const mask = a.axis === 'full' ? undefined
          : `linear-gradient(${a.axis === 'x' ? ((a.to ?? 1) > (a.from ?? 0) ? 'to right' : 'to left') : ((a.to ?? 1) > (a.from ?? 0) ? 'to bottom' : 'to top')}, transparent ${((a.to ?? 1) > (a.from ?? 0) ? (a.from ?? 0) : 1 - (a.from ?? 0)) * 100}%, #000 ${((a.to ?? 1) > (a.from ?? 0) ? (a.to ?? 1) : 1 - (a.to ?? 1)) * 100}%)`;
        return <div key={i} className="td-fill" style={{ background: `linear-gradient(${f.angle ?? 180}deg, ${f.c0solid}, ${f.c1solid})`, opacity: a.max, ...(mask ? { maskImage: mask, WebkitMaskImage: mask } : {}) }} />;
      })}
      {plan.halo && (
        <div className="td-fill" style={{ opacity: HALO.max / 255, background: `radial-gradient(${ell(plan.halo)}, transparent ${HALO.inner * 100}%, ${plan.halo.color} ${(HALO.inner + HALO.rise) * 100}%, ${plan.halo.color} ${(HALO.outer - HALO.soft) * 100}%, transparent ${HALO.outer * 100}%)` }} />
      )}
      {plan.spot && plan.crop && (
        <Pic src={frame.url} crop={plan.crop} sw={sw} sh={sh} filter="contrast(1.12) saturate(1.3)"
          mask={`radial-gradient(${ell(plan.spot)}, #000 ${(1 - plan.spot.feather) * 100}%, transparent 100%)`} />
      )}
      {plan.vignette && <div className="td-vig" />}
      {plan.bars > 0 && <><div className="td-bar" style={{ top: 0, height: pct(plan.bars, H) }} /><div className="td-bar" style={{ bottom: 0, height: pct(plan.bars, H) }} /></>}
      {plan.edge && <div className="td-edge" style={{ boxShadow: `inset 0 0 0 ${cq(plan.edge.t)} ${plan.edge.color}` }} />}
      <svg className="td-svg" viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" aria-hidden="true">
        {plan.rule && <rect x={plan.rule.x} y={plan.rule.y} width={plan.rule.w} height={plan.rule.h} fill={plan.rule.color} />}
        {plan.tile && <rect x={plan.tile.x} y={plan.tile.y} width={plan.tile.w} height={plan.tile.h} fill={plan.tile.color} style={{ filter: 'drop-shadow(0 6px 0 rgba(0,0,0,.4))' }} />}
        {plan.split?.vs && <circle cx={plan.split.vs.cx} cy={plan.split.vs.cy} r={plan.split.vs.r} fill={plan.split.vs.color} stroke="#fff" strokeWidth={plan.split.vs.r * 0.2} />}
        {plan.badge && <><rect x={plan.badge.x} y={plan.badge.y} width={plan.badge.w} height={plan.badge.h} fill={plan.badge.color} fillOpacity={0.78} /><rect x={plan.badge.x} y={plan.badge.y} width={Math.max(4, plan.badge.h * 0.14)} height={plan.badge.h} fill={plan.badge.bar} /></>}
      </svg>
      {plan.split?.vs && <div className="td-free" style={{ left: pct(plan.split.vs.cx, W), top: pct(plan.split.vs.cy, H), fontSize: cq(plan.split.vs.r * 1.05 * EM), color: plan.split.vs.ink, transform: 'translate(-50%,-50%)' }}>VS</div>}
      {plan.badge && <div className="td-free td-badge" style={{ left: pct(plan.badge.x + plan.badge.h * 0.42, W), top: pct(plan.badge.y + plan.badge.h / 2, H), fontSize: cq(plan.badge.h * 0.56 * EM), color: plan.badge.ink, transform: 'translateY(-50%)' }}>{plan.badge.text.toLocaleUpperCase()}</div>}
      {plan.lines.map((l, i) => {
        const tx = l.align === 'left' ? '0' : l.align === 'right' ? '-100%' : '-50%';
        return (
          <div key={i} className={`td-line ${l.box ? 'boxed' : ''}`} data-line={i}
            style={{
              left: pct(l.x, W), top: pct(l.y, H), fontSize: cq(l.fs * EM), fontFamily: l.font === 'Noto Sans' ? undefined : `'${l.font}', serif`,
              letterSpacing: l.spacing ? cq(l.spacing) : undefined,
              transformOrigin: l.align === 'left' ? 'left center' : l.align === 'right' ? 'right center' : 'center',
              transform: `translate(${tx}, -50%)${l.box ? ` rotate(${l.box.tilt}deg)` : ''} scaleX(${CONDENSE / 100})`,
              ...(l.box
                ? { background: l.box.color, padding: `0 ${cq(l.box.pad)}`, boxShadow: `0 ${cq(l.shadow)} 0 rgba(0,0,0,.35)` }
                : { WebkitTextStroke: `${cq(l.stroke * 2)} #000`, textShadow: `0 ${cq(l.shadow)} 0 rgba(0,0,0,.7)${l.glow ? `, 0 0 ${cq(l.glow)} rgba(0,0,0,.55)` : ''}` }),
            }}>
            {l.runs.map((r, k) => <span key={k} style={{ color: r.color }}>{r.t}</span>)}
          </div>
        );
      })}
      <svg className="td-svg" viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" aria-hidden="true">
        {plan.ring && <ellipse cx={plan.ring.cx} cy={plan.ring.cy} rx={plan.ring.rx} ry={plan.ring.ry} fill="none" stroke={plan.ring.color} strokeWidth={plan.ring.t * 2} />}
        {plan.arrow && <polygon points={plan.arrow.pts.map(p => p.join(',')).join(' ')} fill={plan.arrow.color} stroke="#000" strokeWidth={Math.max(3, Math.min(W, H) * 0.008)} strokeLinejoin="round" />}
        {plan.sticker && (
          <g data-sticker={plan.sticker.name}>
            <circle cx={plan.sticker.cx} cy={plan.sticker.cy} r={plan.sticker.r} fill={plan.sticker.disc} stroke="#fff" strokeWidth={plan.sticker.r * 0.2} />
            {plan.sticker.mark && <polygon points={plan.sticker.mark.map(p => p.join(',')).join(' ')} fill="#fff" />}
            {plan.sticker.glyph && <text x={plan.sticker.cx} y={plan.sticker.cy} fill="#fff" fontSize={plan.sticker.r * 1.35 * EM} fontWeight={800} textAnchor="middle" dominantBaseline="central" fontFamily="'Noto Sans', system-ui, sans-serif">{plan.sticker.glyph}</text>}
          </g>
        )}
      </svg>
    </>
  );
}

/** A sticker as a little picture, for its button. */
function StickerIcon({ name }: { name: string }) {
  const plan = thumbPlan({ layout: 'headline', text: 'x', sticker: name }, 100, 100, null, null);
  const s = plan.sticker;
  if (!s) return null;
  const k = 11 / s.r;
  const at = (p: [number, number]) => `${(p[0] - s.cx) * k + 12},${(p[1] - s.cy) * k + 12}`;
  return (
    <svg width="24" height="24" viewBox="0 0 24 24" aria-hidden="true">
      <circle cx="12" cy="12" r="11" fill={s.disc} />
      {s.mark && <polygon points={s.mark.map(at).join(' ')} fill="#fff" />}
      {s.glyph && <text x="12" y="12.5" fill="#fff" fontSize="14" fontWeight={800} textAnchor="middle" dominantBaseline="central">{s.glyph}</text>}
    </svg>
  );
}

function Seg<T extends string>({ value, options, onChange, label, disabled }: { value: T; options: [T, string][]; onChange: (v: T) => void; label: string; disabled?: boolean }) {
  return (
    <div className="vs-label">{label}
      <div className="vs-chips" role="radiogroup" aria-label={label}>
        {options.map(([v, l]) => <button key={v} type="button" className="vs-chip" role="radio" aria-checked={value === v} aria-pressed={value === v} disabled={disabled} onClick={() => onChange(v)}>{l}</button>)}
      </div>
    </div>
  );
}

export default function ThumbnailDesigner({ ctx, o, onClose }: { ctx: EditorCtx; o: OutputView; onClose: () => void }) {
  const { view, doc, duration } = ctx;
  const clip = o.kind === 'short' ? doc.clips.find(c => c.id === o.clipId) : undefined;
  const keeps = useMemo(() => keepRanges(duration, doc, clip ? [clip.s, clip.e] : undefined), [duration, doc, clip]);
  const from = keeps[0]?.[0] ?? 0, to = keeps[keeps.length - 1]?.[1] ?? duration;
  const start = (o.thumbs[o.chosenThumb] ?? o.thumbs[0])?.spec;
  const words0 = (o.meta as { titles?: string[] }).titles?.[0] ?? o.title;
  const tall = o.kind === 'short';
  const W = tall ? 1080 : 1280, H = tall ? 1920 : 720;
  const [sp, setSp] = useState<ThumbSpec>(() => start ?? {
    layout: tall ? 'short' : 'bold', text: words0.split(/\s+/).slice(0, 5).join(' '), highlight: '', at: Math.min(to, from + (to - from) * 0.2),
    accent: '#facc15', color: '#0b0b12', textColor: '#ffffff', border: true, zoom: 0.5,
  });
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState('');
  const set = (p: Partial<ThumbSpec>) => setSp(s => ({ ...s, ...p }));
  const frame = useFrame(view.source.proxyUrl, sp.at);
  const frame2 = useFrame(view.source.proxyUrl, sp.layout === 'split' ? (sp.at2 ?? Math.min(to, sp.at + 6)) : undefined);
  const words = sp.text.trim().split(/\s+/).filter(Boolean);
  const classic = CLASSIC.has(sp.layout);
  const face = faceAt(ctx.track?.face, sp.at, frame.w, frame.h);
  const face2 = faceAt(ctx.track?.face, sp.at2 ?? sp.at + 6, frame2.w || frame.w, frame2.h || frame.h);
  const plan = useMemo(() => classic ? null : thumbPlan({ ...sp, at2: undefined }, W, H, frame.w ? { w: frame.w, h: frame.h } : { w: view.source.probe?.width ?? W, h: view.source.probe?.height ?? H }, face, face2),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [classic, sp, W, H, frame.w, frame.h, face?.x, face?.y, face?.h, face2?.x, face2?.h]);
  const opts = normaliseSpec(sp);
  const shown = plan?.layout ?? sp.layout;
  const pointer = opts.pointer === 'auto' ? (shown === 'callout' ? 'both' : 'none') : opts.pointer;

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

  /* The classic layouts keep their simple likeness. */
  const hl = sp.highlight.toUpperCase();
  const classicPreview = (
    <>
      <div className="td-pic" style={{ backgroundImage: frame.url ? `url("${frame.url}")` : view.source.posterUrl ? `url("${view.source.posterUrl}")` : undefined, backgroundSize: 'cover', backgroundPosition: 'center' }} />
      {sp.layout === 'band' && <div className="td-band" style={{ background: sp.color }} />}
      <div className={`td-classic ${sp.layout}`}>
        {words.map((w, i) => <span key={i} style={w.replace(/[^\p{L}\p{N}$€£%]/gu, '').toUpperCase() === hl && hl ? { color: sp.accent } : undefined}>{w} </span>)}
      </div>
      {sp.layout === 'frame' && <div className="td-edge" style={{ boxShadow: `inset 0 0 0 3cqw ${sp.color}` }} />}
    </>
  );
  const facesLayout = ['bold', 'glow', 'short', 'callout', 'number'].includes(shown);
  const layouts = LAYOUTS.filter(l => !(l.tall && !tall));

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
            <div className={`td-canvas ${tall ? 'tall' : ''}`} data-testid="vs-thumb-preview" data-layout={shown}>
              {plan ? <PlanPreview plan={plan} frame={frame.url ? frame : { url: view.source.posterUrl, w: view.source.probe?.width ?? W, h: view.source.probe?.height ?? H }} frame2={frame2} /> : classicPreview}
            </div>
            <span className="vs-kbd">Live preview of the engine's own layout — the PNG is drawn exactly when you make it ({W}×{H}).</span>
            {plan && plan.layout !== sp.layout && <span className="vs-kbd" style={{ color: '#fbbf24' }}>{sp.layout === 'number' ? 'No figure in the words, so it is drawn as “Face + big words”.' : sp.layout === 'short' ? 'The Shorts cover is for 9:16 — drawn as “Face + big words”.' : ''}</span>}
          </div>
          <div className="td-controls vs-col">
            <div className="td-layouts" role="radiogroup" aria-label="Layout">
              {layouts.map(l => <button key={l.key} type="button" className="td-layout" role="radio" aria-checked={sp.layout === l.key} aria-pressed={sp.layout === l.key} onClick={() => set({ layout: l.key })} data-layout={l.key}><b>{l.name}</b><small>{l.hint}</small></button>)}
            </div>
            <label className="vs-label">Words <span className="vs-kbd" style={{ fontWeight: 500 }}>{words.length} — three to five read best on a phone</span>
              <input className="vs-input" value={sp.text} maxLength={80} onChange={e => set({ text: e.target.value })} data-field="video.thumbText" data-testid="vs-thumb-text" />
            </label>
            <div className="vs-label">Word picked out
              <div className="vs-chips">{words.map((w, i) => { const bare = w.replace(/[^\p{L}\p{N}$€£%#]/gu, ''); return <button key={i} type="button" className="vs-chip" aria-pressed={sp.highlight.toUpperCase() === bare.toUpperCase()} onClick={() => set({ highlight: sp.highlight.toUpperCase() === bare.toUpperCase() ? '' : bare })}>{w}</button>; })}</div>
            </div>
            {!classic && <Seg label="…shown as" value={opts.hlStyle} options={[['color', 'Accent colour'], ['box', 'Tilted box']]} onChange={v => set({ hlStyle: v })} />}
            <div className="vs-row">
              <label className="vs-label" style={{ flex: 1 }}>Accent<input type="color" className="vs-input td-color" value={sp.accent} onChange={e => set({ accent: e.target.value })} aria-label="Accent colour" /></label>
              <label className="vs-label" style={{ flex: 1 }}>{classic ? 'Panel' : 'Background'}<input type="color" className="vs-input td-color" value={sp.color} onChange={e => set({ color: e.target.value })} aria-label="Background colour" /></label>
              {!classic && <label className="vs-label" style={{ flex: 1 }}>…fading to<input type="color" className="vs-input td-color" value={opts.color2 || '#000000'} onChange={e => set({ color2: e.target.value })} aria-label="Second background colour" /></label>}
              <label className="vs-label" style={{ flex: 1 }}>Words<input type="color" className="vs-input td-color" value={sp.textColor} onChange={e => set({ textColor: e.target.value })} aria-label="Word colour" /></label>
            </div>
            {!classic && (
              <div className="vs-chips" aria-label="Gradients">
                {GRADIENTS.map(([a, b]) => <button key={a + b} type="button" className="td-grad" title={`${a} → ${b}`} aria-label={`Gradient ${a} to ${b}`} aria-pressed={sp.color === a && opts.color2 === b} style={{ background: `linear-gradient(135deg, ${a}, ${b})` }} onClick={() => set({ color: a, color2: b })} />)}
              </div>
            )}
            {!classic && (
              <>
                <Seg label="Words at" value={opts.textPos} options={[['auto', 'Auto'], ['top', 'Top'], ['middle', 'Middle'], ['bottom', 'Bottom']]} onChange={v => set({ textPos: v })} />
                <label className="vs-label">Word size · {Math.round(opts.textSize * 100)}%<input type="range" min={0.6} max={1.4} step={0.05} value={opts.textSize} onChange={e => set({ textSize: Number(e.target.value) })} aria-label="Word size" /></label>
                {!tall && facesLayout && <Seg label="Face on the" value={opts.side} options={[['auto', 'Auto'], ['left', 'Left'], ['center', 'Centre'], ['right', 'Right']]} onChange={v => set({ side: v })} />}
                <div className="vs-label">Sticker
                  <div className="vs-chips">
                    <button type="button" className="vs-chip" aria-pressed={!opts.sticker} onClick={() => set({ sticker: '' })}>None</button>
                    {STICKERS.map(k => <button key={k} type="button" className="vs-chip td-sticker" aria-pressed={opts.sticker === k} onClick={() => set({ sticker: k })} title={STICKER_NAMES[k]} aria-label={STICKER_NAMES[k]} data-sticker={k}><StickerIcon name={k} /></button>)}
                  </div>
                </div>
                {shown !== 'split' && <Seg label="Point at the face" value={opts.pointer} options={[['auto', 'Auto'], ['none', 'None'], ['arrow', 'Arrow'], ['circle', 'Circle'], ['both', 'Both']]} onChange={v => set({ pointer: v })} />}
                <label className="vs-label">Channel strip <span className="vs-kbd" style={{ fontWeight: 500 }}>optional — your channel or handle</span>
                  <input className="vs-input" value={sp.badge ?? ''} maxLength={28} onChange={e => set({ badge: e.target.value })} placeholder="@yourchannel" data-field="video.thumbBadge" />
                </label>
              </>
            )}
            <label className="vs-label">Moment · {clock(sp.at)}
              <div className="vs-row" style={{ flexWrap: 'nowrap' }}>
                <input type="range" min={from} max={to} step={0.1} value={sp.at} onChange={e => set({ at: Number(e.target.value) })} style={{ flex: 1 }} aria-label="Moment" />
                <button type="button" className="vs-btn sm" title="Use the playhead" aria-label="Use the playhead" onClick={() => set({ at: Math.min(to, Math.max(from, ctx.time)) })}><Crosshair size={13} /></button>
              </div>
            </label>
            {shown === 'split' && (
              <label className="vs-label">Second moment · {clock(sp.at2 ?? Math.min(to, sp.at + 6))}
                <input type="range" min={from} max={to} step={0.1} value={sp.at2 ?? Math.min(to, sp.at + 6)} onChange={e => set({ at2: Number(e.target.value) })} aria-label="Second moment" />
              </label>
            )}
            {facesLayout && <label className="vs-label">How close to the face · {Math.round(sp.zoom * 100)}%<input type="range" min={0} max={1} step={0.05} value={sp.zoom} onChange={e => set({ zoom: Number(e.target.value) })} aria-label="Zoom" /></label>}
            <label className="vs-row" style={{ gap: 6, fontSize: 13 }}><input type="checkbox" checked={sp.border} onChange={e => set({ border: e.target.checked })} /> Coloured edge (stands out on light and dark YouTube)</label>
            {!face && ctx.track && facesLayout && <span className="vs-kbd">No face found at this moment — the picture is framed on the centre, and nothing is ringed or pointed at.</span>}
            {!ctx.track && facesLayout && <span className="vs-kbd">Faces are still being found in this video — the engine finds the face in the frame itself when it makes the PNG.</span>}
            {plan && face && pointer !== 'none' && pointer !== 'circle' && !plan.arrow && <span className="vs-kbd" style={{ color: '#fbbf24' }}>No room for an arrow between the words and the face here — move the face or the words.</span>}
            {shown === 'glow' && <span className="vs-kbd">A spotlight on the face over your colours — not a cut-out (that needs background removal, which is not available).</span>}
            {msg && <div className="vs-note bad">{msg}</div>}
            <button type="button" className="vs-btn ai" disabled={busy || !words.length} onClick={() => void make()} data-act="make-thumb">
              {busy ? <Loader size={15} className="spin" /> : <Wand2 size={15} />} {busy ? 'Making the PNG…' : 'Make the PNG and use it'}
            </button>
            <span className="vs-kbd"><Check size={11} /> Checked as a real PNG before it is offered. Redesign it further with “Edit in Graphics Designer & Editor” on the board.</span>
          </div>
        </div>
      </div>
    </div>
  );
}
