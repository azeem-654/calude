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
import { RotateCcw, Plus, Trash2, Play, ScanFace, Mic2, Loader, Type, Wand2, Clapperboard, Info } from 'lucide-react';
import {
  lookOf, motionOf, trackingOf, cssLook, clock, renderOutputs, trackNow, FILTER_PRESETS,
  type Look, type Motion, type Overlay, type TrackMode,
} from '../../services/videoStudio';
import type { EditorCtx } from './VideoEditor';

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
          {([['none', 'Straight cut'], ['flash', 'White flash'], ['dip', 'Dip to black']] as const).map(([v, t]) => <button key={v} type="button" role="radio" aria-checked={m.transition === v} className="vs-chip" aria-pressed={m.transition === v} data-transition={v} onClick={() => set({ transition: v }, `Transition: ${t.toLowerCase()}`)}>{t}</button>)}
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

/* ── Text ─────────────────────────────────────────────────────────────────── */

const STYLE_NAME: Record<Overlay['style'], string> = { title: 'Title', lower: 'Lower third', cta: 'Call to action', label: 'Label', quote: 'Quote' };
const ANIM_NAME: Record<Overlay['anim'], string> = { none: 'None', fade: 'Fade', pop: 'Pop', slide: 'Slide in', reveal: 'Reveal' };

export function TextPanel({ ctx }: { ctx: EditorCtx }) {
  const [draft, setDraft] = useState('');
  const [style, setStyle] = useState<Overlay['style']>('title');
  const [len, setLen] = useState(3);
  const ovs = [...(ctx.doc.overlays ?? [])].sort((a, b) => a.s - b.s);
  const add = () => {
    const t = draft.trim();
    if (!t) return;
    const s = Math.max(0, ctx.time);
    void ctx.apply([{ op: 'overlay.add', s, e: Math.min(ctx.duration, s + len), text: t, style, anim: style === 'lower' ? 'slide' : 'pop', position: style === 'cta' ? 'bottom' : 'top' }], `Words on screen: “${t.slice(0, 30)}”`).then(ok => ok && setDraft(''));
  };
  const patch = (id: string, p: Partial<Overlay>, note: string) => void ctx.apply([{ op: 'overlay.update', id, patch: p }], note);
  return (
    <div className="vs-col" data-testid="vs-text-panel">
      <div className="vs-item">
        <div className="vs-row"><Type size={15} color="#c084fc" /><b>Add words at {clock(ctx.time)}</b></div>
        <input className="vs-input" placeholder="e.g. 3 ways to get more leads" value={draft} maxLength={120} onChange={e => setDraft(e.target.value)} onKeyDown={e => { if (e.key === 'Enter') add(); }} data-field="video.overlayText" data-testid="vs-overlay-text" />
        <div className="vs-chips">{(Object.keys(STYLE_NAME) as Overlay['style'][]).map(s => <button key={s} type="button" className="vs-chip" aria-pressed={style === s} onClick={() => setStyle(s)}>{STYLE_NAME[s]}</button>)}</div>
        <div className="vs-row">
          <span className="vs-kbd">On screen for</span>
          {[2, 3, 5, 8].map(n => <button key={n} type="button" className="vs-chip" aria-pressed={len === n} onClick={() => setLen(n)}>{n} s</button>)}
          <span className="vs-spacer" />
          <button type="button" className="vs-btn ai sm" disabled={!draft.trim()} onClick={add} data-act="overlay-add"><Plus size={13} /> Add</button>
        </div>
        <span className="vs-kbd">Placed on the recording: it stays with its moment in every video that keeps it, through any cut.</span>
      </div>
      {!ovs.length && <p className="vs-sub" style={{ margin: 0 }}>No words on screen yet. Move the playhead to where they should appear and add them here.</p>}
      {ovs.map(o => (
        <div key={o.id} className="vs-item" data-overlay={o.id}>
          <div className="vs-row">
            <span className="vs-badge processing">{clock(o.s)}–{clock(o.e)}</span>
            <input className="vs-input" style={{ flex: 1, minWidth: 120, padding: '5px 8px' }} defaultValue={o.text} key={`${o.id}:${o.text}`} aria-label="Words"
              onBlur={e => { const v = e.target.value.trim(); if (v && v !== o.text) patch(o.id, { text: v }, 'Words changed'); }} />
            <button type="button" className="vs-btn ghost sm" aria-label="Play from here" onClick={() => ctx.seek(Math.max(0, o.s - 0.5))}><Play size={13} /></button>
            <button type="button" className="vs-btn ghost sm danger" aria-label="Remove" onClick={() => void ctx.apply([{ op: 'overlay.remove', id: o.id }], 'Words removed')}><Trash2 size={13} /></button>
          </div>
          <div className="vs-row" style={{ gap: 6 }}>
            <select className="vs-select" style={{ width: 'auto' }} value={o.style} aria-label="Style" onChange={e => patch(o.id, { style: e.target.value as Overlay['style'] }, 'Style')}>{(Object.keys(STYLE_NAME) as Overlay['style'][]).map(s => <option key={s} value={s}>{STYLE_NAME[s]}</option>)}</select>
            <select className="vs-select" style={{ width: 'auto' }} value={o.anim} aria-label="Animation" onChange={e => patch(o.id, { anim: e.target.value as Overlay['anim'] }, 'Animation')}>{(Object.keys(ANIM_NAME) as Overlay['anim'][]).map(s => <option key={s} value={s}>{ANIM_NAME[s]}</option>)}</select>
            <select className="vs-select" style={{ width: 'auto' }} value={o.position} aria-label="Position" onChange={e => patch(o.id, { position: e.target.value as Overlay['position'] }, 'Position')}><option value="top">Top</option><option value="middle">Middle</option><option value="bottom">Bottom</option></select>
            <input type="color" value={o.color} aria-label="Text colour" onChange={e => patch(o.id, { color: e.target.value }, 'Text colour')} />
            <input type="color" value={o.bg} aria-label="Box colour" onChange={e => patch(o.id, { bg: e.target.value }, 'Box colour')} />
          </div>
        </div>
      ))}
      <RenderHint ctx={ctx} />
    </div>
  );
}
