/**
 * The inspector's creative panels: Adjust (colour and filters), Animation
 * (zooms, transitions, fades, speed, progress bar), Tracking (follow a face or
 * the speaker) and Text (words on screen).
 *
 * Every control is an operation on the edit (`look.set`, `motion.set`,
 * `tracking.set`, `overlay.*`) — undoable, saved as a version, rendered by the
 * engine. The preview shows each one as closely as a browser can (CSS
 * filters, a zoom, the words animated) and says where it is only close.
 */
import { useState } from 'react';
import { RotateCcw, Plus, Trash2, Play, ScanFace, Mic2, Loader, Type, Wand2, Clapperboard, Info, SunMedium, Square, Pipette, Sparkles, ArrowUp, ArrowDown, ArrowLeft, ArrowRight } from 'lucide-react';
import {
  lookOf, motionOf, trackingOf, cssLook, clock, renderOutputs, trackNow, FILTER_PRESETS, effectsOf, overlayPlace, OVERLAY_FONTS, OVERLAY_ICONS,
  type Look, type Motion, type Overlay, type OverlayFont, type TrackMode, type EffectKey, type Op,
} from '../../services/videoStudio';
import type { EditorCtx } from './VideoEditor';
import EffectRow, { FxSlider } from './EffectRow';

type Kind = 'long' | 'short';

/** Which videos a setting is for — the Short open now, else the long video. */
function useTarget(ctx: EditorCtx): [Kind, (k: Kind) => void] {
  const [k, setK] = useState<Kind | null>(null);
  return [k ?? (ctx.activeClip ? 'short' : 'long'), setK];
}

function TargetChips({ k, set, what }: { k: Kind; set: (k: Kind) => void; what: string }) {
  return (
    <div className="vs-row" style={{ gap: 6 }}>
      <span className="vs-kbd">{what} for</span>
      <button type="button" className="vs-chip" aria-pressed={k === 'long'} onClick={() => set('long')}>Long video</button>
      <button type="button" className="vs-chip" aria-pressed={k === 'short'} onClick={() => set('short')}>All Shorts</button>
    </div>
  );
}

function RenderHint({ ctx }: { ctx: EditorCtx }) {
  const stale = ctx.view.outputs.filter(o => o.stale);
  if (!stale.length) return null;
  return (
    <div className="vs-note warn">
      <Clapperboard size={15} />
      <span style={{ flex: 1 }}>{stale.length} video{stale.length === 1 ? '' : 's'} changed — render to put it in the files.</span>
      <button type="button" className="vs-btn ai sm" onClick={() => void renderOutputs(ctx.view.project.id, stale.map(o => o.id)).then(() => ctx.refresh())}>Render</button>
    </div>
  );
}

/** A slider that saves on release, not on every pixel — one version per change, not forty. */
function Slider({ label, value, min, max, step = 1, unit = '', onSave, field }: { label: string; value: number; min: number; max: number; step?: number; unit?: string; onSave: (v: number) => void; field?: string }) {
  const [v, setV] = useState<number | null>(null);
  const shown = v ?? value;
  const save = () => { if (v !== null && v !== value) onSave(v); setV(null); };
  return (
    <label className="vs-slider" data-field={field}>
      <span><b>{label}</b><i>{shown > 0 && min < 0 ? '+' : ''}{shown}{unit}</i></span>
      <input type="range" min={min} max={max} step={step} value={shown} onChange={e => setV(Number(e.target.value))} onPointerUp={save} onKeyUp={save} onBlur={save} aria-label={label} />
    </label>
  );
}

/* ── Adjust ───────────────────────────────────────────────────────────────── */

const FILTER_NAME: Record<string, string> = { none: 'None', vivid: 'Vivid', warm: 'Warm', cool: 'Cool', cinematic: 'Cinematic', bw: 'Black & white', vintage: 'Vintage', punchy: 'Punchy', soft: 'Soft', food: 'Food' };

export function AdjustPanel({ ctx }: { ctx: EditorCtx }) {
  const [k, setK] = useTarget(ctx);
  const l = lookOf(ctx.doc, k);
  const set = (patch: Partial<Look>, note: string) => void ctx.apply([{ op: 'look.set', target: k, patch }], note);
  const frame = ctx.view.source.posterUrl;
  return (
    <div className="vs-col" data-testid="vs-adjust-panel">
      <TargetChips k={k} set={setK} what="Colour" />
      <div className="vs-filters" role="radiogroup" aria-label="Filter">
        {FILTER_PRESETS.map(f => (
          <button key={f} type="button" role="radio" aria-checked={l.filter === f} className="vs-filter" data-filter={f} onClick={() => set({ filter: f }, `Filter: ${FILTER_NAME[f]}`)}>
            <span className="sw" style={{ backgroundImage: frame ? `url("${frame}")` : undefined, filter: cssLook({ ...l, filter: f, temperature: 0, tint: 0, brightness: 0, contrast: 0, saturation: 0, exposure: 0, hue: 0, blur: 0, sharpness: 0 }) }} />
            <small>{FILTER_NAME[f]}</small>
          </button>
        ))}
      </div>
      <div className="vs-group"><b>White balance</b>
        <Slider label="Temperature" value={l.temperature} min={-100} max={100} onSave={v => set({ temperature: v }, 'Temperature')} field="video.temperature" />
        <Slider label="Tint" value={l.tint} min={-100} max={100} onSave={v => set({ tint: v }, 'Tint')} />
      </div>
      <div className="vs-group"><b>Tone</b>
        <Slider label="Exposure" value={l.exposure} min={-100} max={100} onSave={v => set({ exposure: v }, 'Exposure')} />
        <Slider label="Brightness" value={l.brightness} min={-100} max={100} onSave={v => set({ brightness: v }, 'Brightness')} />
        <Slider label="Contrast" value={l.contrast} min={-100} max={100} onSave={v => set({ contrast: v }, 'Contrast')} />
        <Slider label="Saturation" value={l.saturation} min={-100} max={100} onSave={v => set({ saturation: v }, 'Saturation')} />
      </div>
      <div className="vs-group"><b>Creative</b>
        <Slider label="Hue" value={l.hue} min={-180} max={180} unit="°" onSave={v => set({ hue: v }, 'Hue')} />
        <Slider label="Sharpness" value={l.sharpness} min={0} max={100} onSave={v => set({ sharpness: v }, 'Sharpness')} />
        <Slider label="Blur" value={l.blur} min={0} max={100} onSave={v => set({ blur: v }, 'Blur')} />
        <Slider label="Vignette" value={l.vignette} min={0} max={100} onSave={v => set({ vignette: v }, 'Vignette')} />
        <Slider label="Film grain" value={l.grain} min={0} max={100} onSave={v => set({ grain: v }, 'Film grain')} />
      </div>
      <div className="vs-row">
        <button type="button" className="vs-btn sm" onClick={() => void ctx.apply([{ op: 'look.set', target: k, patch: {}, reset: true }], 'Colour reset')} data-act="look-reset"><RotateCcw size={13} /> Reset all</button>
        <span className="vs-kbd">The preview is close; vignette and grain show only in the render.</span>
      </div>
      <RenderHint ctx={ctx} />
    </div>
  );
}

/* ── Animation ────────────────────────────────────────────────────────────── */

export function AnimationPanel({ ctx }: { ctx: EditorCtx }) {
  const [k, setK] = useTarget(ctx);
  const m = motionOf(ctx.doc, k);
  const set = (patch: Partial<Motion>, note: string) => void ctx.apply([{ op: 'motion.set', target: k, patch }], note);
  return (
    <div className="vs-col" data-testid="vs-animation-panel">
      <TargetChips k={k} set={setK} what="Animation" />
      <div className="vs-group"><b>Zoom</b>
        <div className="vs-chips" role="radiogroup" aria-label="Zoom">
          {([['off', 'None'], ['punch', 'Punch-in every other sentence'], ['slow', 'Slow push']] as const).map(([v, t]) => <button key={v} type="button" role="radio" aria-checked={m.zoom === v} className="vs-chip" aria-pressed={m.zoom === v} data-zoom={v} onClick={() => set({ zoom: v }, `Zoom: ${t.toLowerCase()}`)}>{t}</button>)}
        </div>
        {m.zoom !== 'off' && <Slider label="How close" value={Math.round((m.zoomAmount - 1) * 100)} min={3} max={35} unit="%" onSave={v => set({ zoomAmount: 1 + v / 100 }, 'Zoom amount')} />}
        <span className="vs-kbd">A punch-in on alternate sentences keeps a talking head moving without hiding a word.</span>
      </div>
      <div className="vs-group"><b>At jump cuts</b>
        <div className="vs-chips" role="radiogroup" aria-label="Transition">
          {([['none', 'Straight cut'], ['smooth', 'Smooth (blend)'], ['flash', 'White flash'], ['dip', 'Dip to black']] as const).map(([v, t]) => <button key={v} type="button" role="radio" aria-checked={m.transition === v} className="vs-chip" aria-pressed={m.transition === v} data-transition={v} onClick={() => set({ transition: v }, `Transition: ${t.toLowerCase()}`)}>{t}</button>)}
        </div>
      </div>
      <div className="vs-group"><b>Fades</b>
        <Slider label="Fade in from black" value={m.fadeIn} min={0} max={5} step={0.5} unit=" s" onSave={v => set({ fadeIn: v }, 'Fade in')} />
        <Slider label="Fade out to black" value={m.fadeOut} min={0} max={5} step={0.5} unit=" s" onSave={v => set({ fadeOut: v }, 'Fade out')} />
      </div>
      <div className="vs-group"><b>Speed</b>
        <div className="vs-chips">
          {[0.75, 1, 1.1, 1.25, 1.5, 2].map(v => <button key={v} type="button" className="vs-chip" aria-pressed={m.speed === v} data-speed={v} onClick={() => set({ speed: v }, `Speed ${v}×`)}>{v}×</button>)}
        </div>
        <span className="vs-kbd">The voice keeps its pitch; captions, words on screen and chapters move with it. The preview plays at this speed too.</span>
      </div>
      <label className="vs-opt"><input type="checkbox" checked={m.progressBar} onChange={e => set({ progressBar: e.target.checked }, e.target.checked ? 'Progress bar on' : 'Progress bar off')} />
        <span><b>Progress bar</b> along the bottom, in the caption highlight colour</span></label>
      <RenderHint ctx={ctx} />
    </div>
  );
}

/* ── Tracking ─────────────────────────────────────────────────────────────── */

export function TrackingPanel({ ctx }: { ctx: EditorCtx }) {
  const [k, setK] = useTarget(ctx);
  const [asked, setAsked] = useState(false);
  const t = ctx.view.source.track;
  const running = ctx.view.jobs.some(j => j.kind === 'track' && (j.state === 'queued' || j.state === 'running'));
  const job = ctx.view.jobs.find(j => j.kind === 'track' && j.state === 'running');
  const mode = trackingOf(ctx.doc, k);
  const set = (m: TrackMode) => void ctx.apply([{ op: 'tracking.set', target: k, mode: m }], m === 'off' ? 'Tracking off' : m === 'face' ? 'Follow the face' : 'Follow the speaker');
  const clip = ctx.activeClip ? ctx.doc.clips.find(c => c.id === ctx.activeClip) : null;
  const framing = k === 'short' ? (clip?.reframe.mode ?? ctx.doc.shorts.mode ?? 'crop') : ctx.doc.long.aspect === 'source' ? 'source' : ctx.doc.long.reframe.mode;
  const sum = t?.summary;
  return (
    <div className="vs-col" data-testid="vs-tracking-panel">
      <TargetChips k={k} set={setK} what="Tracking" />
      <div className="vs-item">
        <div className="vs-row"><ScanFace size={15} color="#c084fc" /><b>Faces in this recording</b></div>
        {running ? <span className="vs-kbd"><Loader size={12} className="spin" /> Finding faces{job?.progress != null ? ` · ${Math.round(job.progress)}%` : '…'}</span>
          : t?.ready && sum ? (
            <span className="vs-kbd" data-testid="vs-track-summary">
              {sum.faces ? `${sum.faces} face${sum.faces === 1 ? '' : 's'} at most in one frame, seen in ${Math.round(sum.seen * 100)}% of it` : 'No faces found — tracking has nothing to follow.'}
              {sum.faces > 1 ? ` · the speaker changes ${sum.switches.speaker} time${sum.switches.speaker === 1 ? '' : 's'}` : ''} · {sum.detector === 'yunet' ? 'YuNet detector' : 'Haar detector'}
            </span>
          ) : t?.error ? <div className="vs-note warn">{t.error}</div>
            : <span className="vs-kbd">Not analysed yet.</span>}
        {!running && !t?.ready && <button type="button" className="vs-btn sm" style={{ justifySelf: 'start' }} disabled={asked} onClick={() => { setAsked(true); void trackNow(ctx.view.project.id).then(() => ctx.refresh()); }} data-act="track-now"><Wand2 size={13} /> Find faces</button>}
      </div>
      <div className="vs-group"><b>Keep in frame</b>
        <div className="vs-track-modes" role="radiogroup" aria-label="Tracking">
          {([['off', 'Fixed', 'The crop stays where you put it.', Info], ['face', 'Follow the face', 'The most prominent face, held in frame.', ScanFace], ['speaker', 'Follow the speaker', 'Cuts to whoever is talking.', Mic2]] as const).map(([v, title, hint, Icon]) => (
            <button key={v} type="button" role="radio" aria-checked={mode === v} className="vs-track-mode" data-track={v} disabled={v !== 'off' && !t?.ready} onClick={() => set(v)}>
              <Icon size={16} /><b>{title}</b><small>{hint}</small>
            </button>
          ))}
        </div>
      </div>
      {mode !== 'off' && framing !== 'crop' && <div className="vs-note warn">Tracking moves a crop. These videos are framed as “{framing === 'fit' ? 'whole picture' : 'as recorded'}”, so there is nothing to move — choose Crop in the Video tab.</div>}
      <p className="vs-kbd" style={{ margin: 0 }}>The speaker is the face whose mouth moves while there is speech, held for two seconds before the frame cuts to them. It reads lips, not voices: two people talking at once, or someone turned away, are not told apart.</p>
      <RenderHint ctx={ctx} />
    </div>
  );
}

/* ── Visual effects ───────────────────────────────────────────────────────── */

const kelvinLabel = (k: number) => `${k.toLocaleString('en')} K${k < 6400 ? ' · warmer' : k > 6600 ? ' · cooler' : ''}`;

/**
 * The owner's reference, row by row: each effect a switch, its settings in a
 * panel that opens under it, and "Remove effect". All of it is rendered by
 * the engine; the preview shows colour and shadow closely and says where it
 * cannot (the key, the skin smoothing).
 */
export function VisualEffectsPanel({ ctx }: { ctx: EditorCtx }) {
  const [k, setK] = useTarget(ctx);
  const fx = effectsOf(ctx.doc, k);
  const set = (effect: EffectKey, patch: Record<string, unknown>, note: string) => void ctx.apply([{ op: 'effects.set', target: k, effect, patch }], note);
  const remove = (effect: EffectKey, name: string) => void ctx.apply([{ op: 'effects.set', target: k, effect, patch: {}, remove: true }], `${name} removed`);
  const toggle = (effect: EffectKey, name: string) => (on: boolean) => set(effect, { on }, `${name} ${on ? 'on' : 'off'}`);
  const clip = ctx.activeClip ? ctx.doc.clips.find(c => c.id === ctx.activeClip) : null;
  const framed = k === 'short' ? ((clip?.reframe.mode ?? ctx.doc.shorts.mode ?? 'crop') === 'fit' || clip?.layout === 'pip' || clip?.layout === 'screen') : ctx.doc.long.aspect !== 'source' && ctx.doc.long.reframe.mode === 'fit';
  const faces = !!ctx.view.source.track?.ready && (ctx.view.source.track.summary?.faces ?? 0) > 0;
  const c = fx.color, sh = fx.shadow, g = fx.green, ap = fx.appearance;
  return (
    <div className="vs-col" data-testid="vs-effects-panel">
      <TargetChips k={k} set={setK} what="Effects" />
      <div className="vs-group"><b>Visual effects</b>
        <EffectRow id="color" icon={<SunMedium size={15} />} title="Color adjustments" on={c.on} onToggle={toggle('color', 'Color adjustments')} onRemove={() => remove('color', 'Color adjustments')}
          summary={c.on ? `${kelvinLabel(c.kelvin)} · exposure ${c.exposure > 0 ? '+' : ''}${c.exposure}` : 'Exposure, contrast, highlights, shadows, saturation, temperature'}>
          <FxSlider label="Exposure" value={c.exposure} min={-100} max={100} onSave={v => set('color', { exposure: v, on: true }, 'Exposure')} />
          <FxSlider label="Contrast" value={c.contrast} min={-100} max={100} onSave={v => set('color', { contrast: v, on: true }, 'Contrast')} />
          <FxSlider label="Highlights" value={c.highlights} min={-100} max={100} onSave={v => set('color', { highlights: v, on: true }, 'Highlights')} />
          <FxSlider label="Shadows" value={c.shadows} min={-100} max={100} onSave={v => set('color', { shadows: v, on: true }, 'Shadows')} />
          <FxSlider label="Saturation" value={c.saturation} min={-100} max={100} onSave={v => set('color', { saturation: v, on: true }, 'Saturation')} />
          <FxSlider label="Temperature" value={c.kelvin} min={2000} max={12000} step={100} fmt={kelvinLabel} onSave={v => set('color', { kelvin: v, on: true }, `Temperature ${v} K`)} />
          <small className="vs-kbd">6,500 K is neutral daylight; lower warms the picture, higher cools it.</small>
        </EffectRow>
        <EffectRow id="shadow" icon={<Square size={15} />} title="Shadow" on={sh.on} onToggle={toggle('shadow', 'Shadow')} onRemove={() => remove('shadow', 'Shadow')}
          summary={sh.on ? (framed ? `${sh.opacity}% · blur ${sh.blur}` : 'On, but this framing fills the frame — nothing to cast it') : 'Under the picture where it sits in a frame'}>
          <FxSlider label="X" value={sh.x} min={-80} max={80} unit=" px" onSave={v => set('shadow', { x: v, on: true }, 'Shadow X')} />
          <FxSlider label="Y" value={sh.y} min={-80} max={80} unit=" px" onSave={v => set('shadow', { y: v, on: true }, 'Shadow Y')} />
          <FxSlider label="Blur" value={sh.blur} min={0} max={80} unit=" px" onSave={v => set('shadow', { blur: v, on: true }, 'Shadow blur')} />
          <FxSlider label="Opacity" value={sh.opacity} min={0} max={100} unit="%" onSave={v => set('shadow', { opacity: v, on: true }, 'Shadow opacity')} />
          <label className="vs-row" style={{ gap: 8, fontSize: 13 }}>Colour <input type="color" value={sh.color} onChange={e => set('shadow', { color: e.target.value, on: true }, 'Shadow colour')} aria-label="Shadow colour" /></label>
          <small className="vs-kbd">Shows where the video sits inside the frame: “whole picture” framing, or the camera bubble of a picture-in-picture Short. A video that fills its frame has nothing to cast a shadow on.</small>
        </EffectRow>
        <EffectRow id="green" icon={<Pipette size={15} />} title="Green screen" on={g.on} onToggle={toggle('green', 'Green screen')} onRemove={() => remove('green', 'Green screen')}
          summary={g.on ? `Keying ${g.color} · similarity ${g.similarity}%` : 'Only for footage shot in front of a green or blue screen'}>
          <label className="vs-row" style={{ gap: 8, fontSize: 13 }}>Screen colour <input type="color" value={g.color} onChange={e => set('green', { color: e.target.value, on: true }, 'Key colour')} aria-label="Screen colour" />
            <button type="button" className="vs-chip" onClick={() => set('green', { color: '#00ff00', on: true }, 'Key: green')}>Green</button>
            <button type="button" className="vs-chip" onClick={() => set('green', { color: '#0047bb', on: true }, 'Key: blue')}>Blue</button></label>
          <FxSlider label="Similarity" value={g.similarity} min={1} max={60} unit="%" onSave={v => set('green', { similarity: v, on: true }, 'Key similarity')} />
          <FxSlider label="Edge softness" value={g.blend} min={0} max={40} unit="%" onSave={v => set('green', { blend: v, on: true }, 'Key softness')} />
          <label className="vs-row" style={{ gap: 8, fontSize: 13 }}>Background <input type="color" value={g.bg} onChange={e => set('green', { bg: e.target.value, on: true }, 'Key background')} aria-label="Background colour" /></label>
          <small className="vs-kbd">A real chroma key: every pixel near the screen colour is replaced by the background colour, and green spill is taken off the edges. On ordinary footage it would cut holes in the picture — use it only for a green or blue screen. The preview shows the footage as recorded; the key is in the render.</small>
        </EffectRow>
        <EffectRow id="appearance" icon={<Sparkles size={15} />} title="Improve appearance" on={ap.on} onToggle={toggle('appearance', 'Improve appearance')} onRemove={() => remove('appearance', 'Improve appearance')}
          summary={ap.on ? `Amount ${ap.amount}%${faces ? '' : ' · no face found, so no skin smoothing'}` : 'Smooths and evens the picture'}>
          <FxSlider label="Amount" value={ap.amount} min={0} max={100} unit="%" onSave={v => set('appearance', { amount: v, on: true }, `Improve appearance ${v}%`)} />
          <small className="vs-kbd">Smooths and evens the picture: a mild denoise, gentle automatic white balance and exposure, a light sharpen{faces ? ', and skin smoothed only inside the face the Tracking tab found (edges and eyes kept)' : '. Skin smoothing needs a face — find faces in the Tracking tab'}. It does not reshape anything. The preview shows it only roughly; the render is exact.</small>
        </EffectRow>
      </div>
      <span className="vs-kbd">The preview shows colour and shadow closely, not exactly; green screen and skin smoothing are seen in the render.</span>
      <RenderHint ctx={ctx} />
    </div>
  );
}

/* ── Text ─────────────────────────────────────────────────────────────────── */

const STYLE_NAME: Record<Overlay['style'], string> = {
  title: 'Title', subtitle: 'Description', lower: 'Lower third', cta: 'Call to action', label: 'Label', quote: 'Quote', ticker: 'Scrolling ticker', camlabel: 'Name under camera',
};
const ANIM_NAME: Record<Overlay['anim'], string> = { none: 'None', fade: 'Fade', pop: 'Pop', slide: 'Slide in', reveal: 'Reveal' };
const FONT_NAME: Record<OverlayFont, string> = { sans: 'Clean', serif: 'Classic serif', display: 'Display', condensed: 'Condensed' };
/* The nine places of the grid, as the centre of the words in % of the frame. */
const GRID: [number, number][] = [[18, 12], [50, 12], [82, 12], [18, 50], [50, 50], [82, 50], [18, 86], [50, 86], [82, 86]];

/** What one press of a preset adds: the words, how long, and where. */
type Preset = { key: string; label: string; hint: string; make: (t: string, s: number, e: number, cam: { x: number; y: number } | null) => Extract<Op, { op: 'overlay.add' }>[] };
const PRESETS: Preset[] = [
  { key: 'title', label: 'Title + description', hint: 'A heading with a line under it', make: (t, s, e) => {
    const [a, ...rest] = t.split(/\s*[|\n]\s*/);
    const out: Extract<Op, { op: 'overlay.add' }>[] = [{ op: 'overlay.add', s, e, text: a, style: 'title', position: 'top', anim: 'pop' }];
    if (rest.join(' ').trim()) out.push({ op: 'overlay.add', s, e, text: rest.join(' ').trim(), style: 'subtitle', position: 'top', anim: 'fade' });
    return out;
  } },
  { key: 'lower', label: 'Lower third', hint: 'Your name or a point, bottom left', make: (t, s, e) => [{ op: 'overlay.add', s, e, text: t, style: 'lower', anim: 'slide', position: 'bottom' }] },
  { key: 'ticker', label: 'Scrolling ticker', hint: 'Words crossing a band, like the news', make: (t, s, e) => [{ op: 'overlay.add', s, e, text: t, style: 'ticker', anim: 'none', position: 'bottom', speed: 12, bg: '#111827' }] },
  { key: 'camlabel', label: 'Name under camera', hint: 'A tag under your camera bubble', make: (t, s, e, cam) => [{ op: 'overlay.add', s, e, text: t, style: 'camlabel', anim: 'fade', position: 'bottom', ...(cam ? { x: cam.x, y: cam.y } : {}) }] },
  { key: 'cta', label: 'Call to action', hint: 'A pill button, bottom centre', make: (t, s, e) => [{ op: 'overlay.add', s, e, text: t, style: 'cta', anim: 'pop', position: 'bottom' }] },
  { key: 'label', label: 'Label', hint: 'A small tag, top left', make: (t, s, e) => [{ op: 'overlay.add', s, e, text: t, style: 'label', anim: 'fade', position: 'top' }] },
  { key: 'quote', label: 'Quote', hint: 'Italic words in quotes', make: (t, s, e) => [{ op: 'overlay.add', s, e, text: t, style: 'quote', anim: 'fade', position: 'middle' }] },
];

export function TextPanel({ ctx }: { ctx: EditorCtx }) {
  const [draft, setDraft] = useState('');
  const [preset, setPreset] = useState('title');
  const [len, setLen] = useState<number>(4);
  const [open, setOpen] = useState<string | null>(null);
  const ovs = [...(ctx.doc.overlays ?? [])].sort((a, b) => a.s - b.s);
  /* Under the camera: from where the Screen Recorder drew it at this moment, centred just below it (inside the frame). */
  const camSpot = (() => {
    const segs = ctx.screen?.segs ?? [];
    const g = [...segs].reverse().find(x => x.t <= ctx.time && x.cam) ?? segs.find(x => x.cam);
    if (!g?.cam) return null;
    const [x, y, w, h] = g.cam;
    return { x: Math.round((x + w / 2) * 1000) / 10, y: Math.min(94, Math.round((y + h) * 1000) / 10 + 4) };
  })();
  const pr = PRESETS.find(p => p.key === preset)!;
  const add = () => {
    const t = draft.trim();
    if (!t) return;
    const whole = len === 0;
    const s = whole ? 0 : Math.max(0, ctx.time);
    const e = whole ? ctx.duration : Math.min(ctx.duration, s + len);
    void ctx.apply(pr.make(t, s, e, camSpot), `${pr.label}: “${t.slice(0, 30)}”`).then(ok => ok && setDraft(''));
  };
  const patch = (id: string, p: Partial<Overlay>, note: string) => void ctx.apply([{ op: 'overlay.update', id, patch: p }], note);
  const placeOf = (o: Overlay) => overlayPlace(o, false);
  const nudge = (o: Overlay, dx: number, dy: number, big: boolean) => {
    const c = placeOf(o), k = big ? 5 : 1;
    patch(o.id, { x: Math.max(0, Math.min(100, c.x + dx * k)), y: Math.max(0, Math.min(100, c.y + dy * k)) }, `Words moved ${k}%`);
  };
  return (
    <div className="vs-col" data-testid="vs-text-panel">
      <div className="vs-item vs-col" style={{ gap: 8 }}>
        <div className="vs-row"><Type size={15} color="#c084fc" /><b>Add text at {clock(ctx.time)}</b></div>
        <div className="vs-preset-grid" role="radiogroup" aria-label="What kind of text">
          {PRESETS.map(p => (
            <button key={p.key} type="button" role="radio" aria-checked={preset === p.key} className="vs-preset" onClick={() => setPreset(p.key)} data-preset={p.key}>
              <b>{p.label}</b><small>{p.key === 'camlabel' && !camSpot ? 'Bottom left (no camera noted)' : p.hint}</small>
            </button>
          ))}
        </div>
        {preset === 'ticker' ? (
          <textarea className="vs-textarea" rows={2} placeholder="e.g. ★ New: book a free call this week ★ 20% off for new clients" value={draft} maxLength={300} onChange={e => setDraft(e.target.value)} data-field="video.overlayText" data-testid="vs-overlay-text" />
        ) : (
          <input className="vs-input" placeholder={preset === 'title' ? 'Title | description (a | splits them)' : 'e.g. 3 ways to get more leads'} value={draft} maxLength={preset === 'title' ? 240 : 120}
            onChange={e => setDraft(e.target.value)} onKeyDown={e => { if (e.key === 'Enter') add(); }} data-field="video.overlayText" data-testid="vs-overlay-text" />
        )}
        <div className="vs-row" style={{ flexWrap: 'wrap' }}>
          <span className="vs-kbd">On screen for</span>
          {[2, 4, 8, 15, 0].map(n => <button key={n} type="button" className="vs-chip" aria-pressed={len === n} onClick={() => setLen(n)}>{n ? `${n} s` : 'Whole video'}</button>)}
          <span className="vs-spacer" />
          <button type="button" className="vs-btn ai sm" disabled={!draft.trim()} onClick={add} data-act="overlay-add"><Plus size={13} /> Add</button>
        </div>
        <span className="vs-kbd">Placed on the recording: it stays with its moment in every video that keeps it, through any cut.</span>
      </div>
      {!ovs.length && <p className="vs-sub" style={{ margin: 0 }}>No text yet. Move the playhead to where it should appear, pick a kind and add it.</p>}
      {ovs.map(o => {
        const c = placeOf(o);
        const expanded = open === o.id;
        return (
          <div key={o.id} className="vs-item" data-overlay={o.id}>
            <div className="vs-row">
              <span className="vs-badge processing">{clock(o.s)}–{clock(o.e)}</span>
              {o.style === 'ticker'
                ? <textarea className="vs-textarea" style={{ flex: 1, minWidth: 120, padding: '5px 8px' }} rows={1} defaultValue={o.text} key={`${o.id}:${o.text}`} aria-label="Words" maxLength={300}
                    onBlur={e => { const v = e.target.value.trim(); if (v && v !== o.text) patch(o.id, { text: v }, 'Words changed'); }} />
                : <input className="vs-input" style={{ flex: 1, minWidth: 120, padding: '5px 8px' }} defaultValue={o.text} key={`${o.id}:${o.text}`} aria-label="Words" maxLength={120}
                    onBlur={e => { const v = e.target.value.trim(); if (v && v !== o.text) patch(o.id, { text: v }, 'Words changed'); }} />}
              <button type="button" className="vs-btn ghost sm" aria-label="Play from here" onClick={() => ctx.seek(Math.max(0, o.s - 0.5))}><Play size={13} /></button>
              <button type="button" className="vs-btn ghost sm danger" aria-label="Remove" onClick={() => void ctx.apply([{ op: 'overlay.remove', id: o.id }], 'Words removed')}><Trash2 size={13} /></button>
            </div>
            <div className="vs-row" style={{ gap: 6, flexWrap: 'wrap' }}>
              <select className="vs-select" style={{ width: 'auto' }} value={o.style} aria-label="Kind" onChange={e => patch(o.id, { style: e.target.value as Overlay['style'] }, 'Kind of text')}>{(Object.keys(STYLE_NAME) as Overlay['style'][]).map(st => <option key={st} value={st}>{STYLE_NAME[st]}</option>)}</select>
              <select className="vs-select" style={{ width: 'auto' }} value={o.font ?? 'sans'} aria-label="Font" onChange={e => patch(o.id, { font: e.target.value as OverlayFont }, 'Font')}>{OVERLAY_FONTS.map(f => <option key={f} value={f}>{FONT_NAME[f]}</option>)}</select>
              <button type="button" className="vs-chip" aria-pressed={o.bold ?? o.style !== 'subtitle'} onClick={() => patch(o.id, { bold: !(o.bold ?? o.style !== 'subtitle') }, 'Bold')} aria-label="Bold"><b>B</b></button>
              <button type="button" className="vs-chip" aria-pressed={o.italic ?? o.style === 'quote'} onClick={() => patch(o.id, { italic: !(o.italic ?? o.style === 'quote') }, 'Italic')} aria-label="Italic"><i>I</i></button>
              <input type="color" value={o.color} aria-label="Text colour" onChange={e => patch(o.id, { color: e.target.value }, 'Text colour')} />
              <input type="color" value={o.bg} aria-label="Box colour" onChange={e => patch(o.id, { bg: e.target.value }, 'Box colour')} />
              <button type="button" className="vs-btn ghost sm" aria-expanded={expanded} onClick={() => setOpen(expanded ? null : o.id)} data-act="overlay-more">{expanded ? 'Less' : 'Place & size'}</button>
            </div>
            {expanded && (
              <div className="vs-col" style={{ gap: 8, marginTop: 4 }}>
                {o.style !== 'ticker' && (
                  <div className="vs-row" style={{ gap: 12, alignItems: 'flex-start', flexWrap: 'wrap' }}>
                    <div className="vs-place-grid" role="group" aria-label="Place on the frame">
                      {GRID.map(([x, y], n) => <button key={n} type="button" aria-label={`Place ${n + 1}`} aria-pressed={Math.abs(c.x - x) < 6 && Math.abs(c.y - y) < 6} onClick={() => patch(o.id, { x, y }, 'Words placed')} />)}
                    </div>
                    <div className="vs-nudge">
                      <button type="button" className="vs-btn sm" aria-label="Move up" onClick={e => nudge(o, 0, -1, e.shiftKey)}><ArrowUp size={13} /></button>
                      <div className="vs-row" style={{ gap: 4 }}>
                        <button type="button" className="vs-btn sm" aria-label="Move left" onClick={e => nudge(o, -1, 0, e.shiftKey)}><ArrowLeft size={13} /></button>
                        <span className="vs-kbd">{c.x}%, {c.y}%</span>
                        <button type="button" className="vs-btn sm" aria-label="Move right" onClick={e => nudge(o, 1, 0, e.shiftKey)}><ArrowRight size={13} /></button>
                      </div>
                      <button type="button" className="vs-btn sm" aria-label="Move down" onClick={e => nudge(o, 0, 1, e.shiftKey)}><ArrowDown size={13} /></button>
                    </div>
                  </div>
                )}
                {o.style === 'ticker' && <FxSlider label="Height on the frame" value={c.y} min={5} max={95} unit="%" onSave={v => patch(o.id, { y: v, x: 50 }, 'Ticker moved')} />}
                <FxSlider label="Size" value={o.size ?? 100} min={40} max={300} step={5} unit="%" onSave={v => patch(o.id, { size: v }, `Text size ${v}%`)} />
                {o.style === 'ticker' && <FxSlider label="One pass takes" value={o.speed ?? 12} min={4} max={40} unit=" s" onSave={v => patch(o.id, { speed: v }, 'Ticker speed')} />}
                <div className="vs-row" style={{ gap: 6, flexWrap: 'wrap' }}>
                  <select className="vs-select" style={{ width: 'auto' }} value={o.anim} aria-label="Animation" onChange={e => patch(o.id, { anim: e.target.value as Overlay['anim'] }, 'Animation')}>{(Object.keys(ANIM_NAME) as Overlay['anim'][]).map(a => <option key={a} value={a}>{ANIM_NAME[a]}</option>)}</select>
                  <button type="button" className="vs-btn ghost sm" onClick={() => patch(o.id, { s: Math.min(ctx.time, o.e - 0.5) }, 'Text starts here')}>Start at playhead</button>
                  <button type="button" className="vs-btn ghost sm" onClick={() => patch(o.id, { e: Math.max(ctx.time, o.s + 0.5) }, 'Text ends here')}>End at playhead</button>
                </div>
                <div className="vs-field-label">Icon before the words</div>
                <div className="vs-chips">
                  <button type="button" className="vs-chip" aria-pressed={!o.icon} onClick={() => patch(o.id, { icon: '' }, 'No icon')}>None</button>
                  {OVERLAY_ICONS.map(ic => <button key={ic} type="button" className="vs-chip" aria-pressed={o.icon === ic} onClick={() => patch(o.id, { icon: ic }, `Icon ${ic}`)}>{ic}</button>)}
                </div>
                {(o.x !== undefined || o.y !== undefined) && <button type="button" className="vs-btn ghost sm" style={{ justifySelf: 'start' }} onClick={() => patch(o.id, { position: o.position }, 'Words back to their place')}>Back to the kind's own place</button>}
              </div>
            )}
          </div>
        );
      })}
      <RenderHint ctx={ctx} />
    </div>
  );
}
