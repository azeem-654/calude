/**
 * The inspector's panels that are not about words: the picture (shape and
 * framing of whatever is selected), the sound (noise reduction, voice) and
 * the music.
 *
 * Sound settings are heard in the player as they change (liveSound.ts builds
 * the same steps as the engine — soundPlan.mjs — out of Web Audio nodes, with
 * RNNoise in WebAssembly); what the browser cannot do (click repair, the
 * −16 LUFS loudness measured over the whole video) is said. "Apply to the
 * video now" puts them into the made file, each step named under Progress.
 * Music is heard in the preview at its volume (without the ducking).
 *
 * Music comes from two places, and both say where it came from: the open
 * library (Openverse — only CC0, public-domain and CC BY tracks, which allow
 * a business to put them under its videos; CC BY's credit is written into
 * each video's description), or the customer's own file with the rights
 * confirmed in a box they tick.
 */
import { useEffect, useRef, useState } from 'react';
import { Search, Play, Pause, Music2, Upload, Trash2, Loader, ExternalLink, Check, Wand2, Volume2, Mic, Sparkles, Clapperboard } from 'lucide-react';
import {
  searchMusic, chooseMusic, uploadMusic, renderOutputs, clock, layoutOptions, screenLayoutFor, trackNow,
  knownOf, framingOptions, resolveFraming, STRATEGY_LABEL, STRATEGY_HINT, KIND_LABEL,
  type FoundTrack, type Denoise, type Aspect, type Op, type ShortLayout, type Framing,
} from '../../services/videoStudio';
import type { EditorCtx } from './VideoEditor';
import EffectRow, { FxSlider, Switch } from './EffectRow';
import { useLiveSoundState } from './liveSound';

export function RenderHint({ ctx }: { ctx: EditorCtx }) {
  const stale = ctx.view.outputs.filter(o => o.stale);
  if (!stale.length) return null;
  return (
    <div className="vs-note warn">
      <Clapperboard size={15} />
      <span style={{ flex: 1 }}>{stale.length} video{stale.length === 1 ? '' : 's'} changed — render again to hear and see it in the files.</span>
      <button type="button" className="vs-btn ai sm" onClick={() => void renderOutputs(ctx.view.project.id, stale.map(o => o.id)).then(() => ctx.refresh())} data-act="render-stale">Render</button>
    </div>
  );
}

/* ── Video: shape and framing of what is selected ─────────────────────────── */

/** A small drawing of each Shorts layout (a 9:16 frame). */
function LayoutIcon({ kind }: { kind: ShortLayout }) {
  const box = (x: number, y: number, w: number, h: number, k: string, r = 1.5) => <rect key={k} x={x} y={y} width={w} height={h} rx={r} />;
  const parts = kind === 'speaker' ? [box(2, 2, 14, 26, 'a'), <circle key="f" cx={9} cy={11} r={3.2} className="f" />]
    : kind === 'screen' ? [box(2, 9, 14, 9, 'a')]
    : kind === 'split' ? [box(2, 2, 14, 12, 'a'), box(2, 16, 14, 12, 'b'), <circle key="f" cx={9} cy={21} r={2.6} className="f" />]
    : kind === 'two' ? [box(2, 2, 14, 12, 'a'), box(2, 16, 14, 12, 'b'), <circle key="f1" cx={9} cy={7.5} r={2.4} className="f" />, <circle key="f2" cx={9} cy={21.5} r={2.4} className="f" />]
    : kind === 'screencam' ? [box(2, 2, 14, 17, 'b'), box(2, 20, 14, 8, 'a'), <circle key="f" cx={9} cy={24} r={2.4} className="f" />, <path key="p" d="M8 8 l0 6 l1.6-1.4 l1.2 2.4 l1-0.5 l-1.1-2.3 l2.2 0z" className="f" />]
    : kind === 'follow' ? [box(2, 2, 14, 26, 'a'), <path key="p" d="M8 12 l0 7 l1.8-1.6 l1.4 2.8 l1.1-0.6 l-1.3-2.7 l2.5 0z" className="f" />]
    : [box(2, 2, 14, 26, 'a'), <circle key="p" cx={12} cy={22} r={3.4} className="f" />];
  return <svg className="vs-layout-ic" viewBox="0 0 18 30" width={18} height={30} aria-hidden="true">{parts}</svg>;
}

/**
 * How a Short is framed inside its shape (reframe.ts): the strategy the
 * analysis chose, or the customer's; the window's size; the camera band;
 * and pins — moments the window is pointed at by clicking the preview. Every
 * change is in the preview at once; the render reads the same plan.
 */
function FramingSection({ ctx, clip, n, set }: { ctx: EditorCtx; clip: NonNullable<ReturnType<EditorCtx['doc']['clips']['find']>>; n: number; set: (patch: Extract<Op, { op: 'clip.update' }>['patch'], note: string) => void }) {
  const t = ctx.view.source.track;
  const known = knownOf(ctx.track, t?.summary);
  const f = clip.framing ?? { strategy: 'auto' as const };
  const res = resolveFraming(clip.framing, known, clip.reframe);
  const [aiming, setAiming] = useState(false);
  const [asked, setAsked] = useState(false);
  const running = ctx.view.jobs.some(j => j.kind === 'track' && (j.state === 'queued' || j.state === 'running'));
  const setF = (patch: Partial<Framing>, note: string) => set({ framing: { ...patch, by: 'you' } }, note);
  useEffect(() => {
    window.dispatchEvent(new CustomEvent('vs-aim', { detail: aiming }));
    if (!aiming) return;
    const on = (e: Event) => {
      const d = (e as CustomEvent<{ x: number; y: number; t: number }>).detail;
      if (res.strategy === 'still') setF({ focus: { x: d.x, y: d.y } }, `Short ${n}: window moved`);
      else setF({ pins: [...(clip.framing?.pins ?? []).filter(p => Math.abs(p[0] - d.t) > 0.75), [Math.round(d.t * 100) / 100, d.x, d.y]] }, `Short ${n}: pinned at ${clock(d.t)}`);
    };
    window.addEventListener('vs-aimed', on);
    return () => window.removeEventListener('vs-aimed', on);
  }, [aiming, res.strategy, clip.framing?.pins, n]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => () => { window.dispatchEvent(new CustomEvent('vs-aim', { detail: false })); }, []);
  const layoutOn = !!clip.layout && clip.layout !== 'speaker' && clip.layout !== 'screen';
  const sized = !layoutOn && clip.reframe.mode !== 'fit' && res.strategy !== 'whole';
  return (
    <div className="vs-label" data-testid="vs-framing">Framing
      <div className="vs-framing-opts" role="radiogroup" aria-label="Framing">
        {framingOptions(known).map(o => (
          <button key={o.key} type="button" role="radio" aria-checked={f.strategy === o.key} className="vs-framing-opt" disabled={!o.ok} data-framing-opt={o.key} title={o.ok ? STRATEGY_HINT[o.key] : o.why}
            onClick={() => setF({ strategy: o.key }, `Short ${n}: ${STRATEGY_LABEL[o.key].toLowerCase()}`)}>
            <b>{o.label}</b><small>{o.ok ? (o.key === 'auto' && f.strategy === 'auto' ? res.note : STRATEGY_HINT[o.key]) : o.why}</small>
          </button>
        ))}
      </div>
      {layoutOn && <div className="vs-note">The layout below is in charge of this Short; pick a framing to go back to a window on the recording.</div>}
      {!layoutOn && f.strategy !== 'auto' && <small className="vs-kbd" data-testid="vs-framing-note" style={{ fontWeight: 500 }}>{res.note}</small>}
      <small className="vs-kbd" style={{ fontWeight: 500 }} data-testid="vs-analysis-note">
        {running ? 'Analysing the recording…' : known.analysed && known.kind ? `Analysed: ${KIND_LABEL[known.kind]} — ${known.why}.` : t?.ready ? 'Faces were found, but this recording was analysed before pointer and action detection existed.' : 'Not analysed yet.'}
        {!running && (!known.analysed) && <> <button type="button" className="vs-btn ghost sm" disabled={asked || !ctx.view.source.proxyUrl} data-act="analyse-again" onClick={() => { setAsked(true); void trackNow(ctx.view.project.id).then(() => ctx.refresh()); }}>Analyse {t?.ready ? 'again' : 'now'}</button></>}
      </small>
      {sized && (
        <FxSlider label="Window size" value={Math.round(res.zoom * 100)} min={35} max={100} unit="%" onSave={v => setF({ zoom: v / 100 }, `Short ${n}: window ${v}%`)} />
      )}
      {!layoutOn && res.strategy === 'screencam' && (
        <>
          <FxSlider label="Camera band" value={Math.round(res.share * 100)} min={20} max={50} unit="%" onSave={v => setF({ share: v / 100 }, `Short ${n}: camera band ${v}%`)} />
          <div className="vs-chips">
            <button type="button" className="vs-chip" aria-pressed={res.camAt === 'bottom'} onClick={() => setF({ camAt: 'bottom' }, `Short ${n}: camera below`)}>Camera below</button>
            <button type="button" className="vs-chip" aria-pressed={res.camAt === 'top'} onClick={() => setF({ camAt: 'top' }, `Short ${n}: camera above`)}>Camera above</button>
          </div>
        </>
      )}
      {sized && (
        <div className="vs-row" style={{ gap: 8, flexWrap: 'wrap' }}>
          <button type="button" className={`vs-btn sm ${aiming ? 'ai' : ''}`} aria-pressed={aiming} data-act="aim" onClick={() => setAiming(a => !a)}>{aiming ? 'Done pointing' : res.strategy === 'still' ? 'Move the window' : 'Point the window at a moment'}</button>
          <small className="vs-kbd" style={{ fontWeight: 500 }}>{res.strategy === 'still' ? 'Click the preview where the window should sit.' : 'Click the preview where the window should look at the current moment; it holds there for a moment, then carries on following.'}</small>
        </div>
      )}
      {!!clip.framing?.pins?.length && (
        <div className="vs-pins" data-testid="vs-pins">
          {clip.framing.pins.map(p => <button key={p[0]} type="button" className="vs-chip" title="Remove this pin" onClick={() => setF({ pins: clip.framing!.pins!.filter(q => q !== p) }, `Short ${n}: pin removed`)}>{clock(p[0])} · {Math.round(p[1] * 100)}%, {Math.round(p[2] * 100)}% ×</button>)}
        </div>
      )}
    </div>
  );
}

export function VideoPanel({ ctx }: { ctx: EditorCtx }) {
  const { doc } = ctx;
  const clip = ctx.activeClip ? doc.clips.find(c => c.id === ctx.activeClip) ?? null : null;
  if (clip) {
    const n = doc.clips.findIndex(c => c.id === clip.id) + 1;
    const set = (patch: Extract<Op, { op: 'clip.update' }>['patch'], note: string) =>
      void ctx.apply([{ op: 'clip.update', id: clip.id, patch }], note);
    /* What the render does for a tall Short of a Screen Recorder recording when no layout is picked (pipeline.ts renderSpec). */
    const autoLayout = clip.layout ? null : screenLayoutFor(clip, ctx.view.extras?.screen);
    return (
      <div className="vs-col" data-testid="vs-video-panel">
        <div className="vs-row"><b>Short {n}</b><span className="vs-kbd">{clock(clip.s)}–{clock(clip.e)}</span><span className="vs-spacer" />
          <button type="button" className="vs-btn ghost sm" onClick={() => ctx.setActiveClip(null)}>Long video</button></div>
        <label className="vs-label">Title
          <input className="vs-input" defaultValue={clip.title} key={`${clip.id}:${clip.title}`} onBlur={e => { const v = e.target.value.trim(); if (v && v !== clip.title) set({ title: v }, 'Renamed a Short'); }} />
        </label>
        <div className="vs-label">Shape
          <div className="vs-chips">{(['9:16', '1:1', '4:5', '16:9'] as const).map(a => <button key={a} type="button" className="vs-chip" aria-pressed={clip.aspect === a} onClick={() => set({ aspect: a }, `Short ${n}: ${a}`)}>{a}</button>)}</div>
        </div>
        <FramingSection ctx={ctx} clip={clip} n={n} set={set} />
        <div className="vs-label" data-testid="vs-layouts">Layout
          <div className="vs-layouts" role="radiogroup" aria-label="Layout">
            {layoutOptions(ctx.track, ctx.view.extras?.screen ?? null).filter(o => o.key !== 'speaker' && o.key !== 'screen').map(o => (
              <button key={o.key} type="button" role="radio" aria-checked={clip.layout === o.key || (!clip.layout && autoLayout === o.key)} className="vs-layout-opt" disabled={!o.ok} data-layout-opt={o.key}
                title={o.ok ? o.label : o.why} onClick={() => set({ layout: o.key }, `Short ${n}: ${o.label.toLowerCase()}`)}>
                <LayoutIcon kind={o.key} /><span><b>{o.label}</b>{!clip.layout && autoLayout === o.key && <small>Chosen for this screen recording</small>}{!o.ok && <small>{o.why}</small>}</span>
              </button>
            ))}
            {clip.layout && clip.layout !== 'speaker' && clip.layout !== 'screen' && <button type="button" className="vs-layout-opt" data-layout-opt="none" onClick={() => set({ layout: null }, `Short ${n}: framed, no layout`)}><span><b>No layout</b><small>Back to the framing above</small></span></button>}
          </div>
          <small className="vs-kbd" style={{ fontWeight: 500 }}>Fixed layouts from the faces{ctx.view.extras?.screen ? ' and from where the Screen Recorder saw the pointer' : ''}; a layout takes the place of the framing above. The preview shows the layout; the render builds the same boxes.</small>
        </div>
        <p className="vs-kbd" style={{ margin: 0 }}>Trim it in the Shorts list (left) or mark a stretch on the timeline.</p>
        <RenderHint ctx={ctx} />
      </div>
    );
  }
  const L = doc.long;
  const setL = (patch: { on?: boolean; aspect?: Aspect; reframe?: { mode?: 'crop' | 'fit' | 'source'; x?: number } }, note: string) => void ctx.apply([{ op: 'long.set', patch }], note);
  return (
    <div className="vs-col" data-testid="vs-video-panel">
      <label className="vs-row" style={{ gap: 8, fontSize: 13 }}><input type="checkbox" checked={L.on} onChange={e => setL({ on: e.target.checked }, e.target.checked ? 'Long video on' : 'Long video off')} /> Make the cleaned long video</label>
      <div className="vs-label">Shape
        <div className="vs-chips">{(['source', '16:9', '9:16', '1:1', '4:5'] as const).map(a => <button key={a} type="button" className="vs-chip" aria-pressed={L.aspect === a} onClick={() => setL({ aspect: a, ...(a === 'source' ? { reframe: { mode: 'source' } } : L.reframe.mode === 'source' ? { reframe: { mode: 'fit' } } : {}) }, `Long video: ${a}`)}>{a === 'source' ? 'As recorded' : a}</button>)}</div>
      </div>
      {L.aspect !== 'source' && (
        <div className="vs-label">Framing
          <div className="vs-chips">
            <button type="button" className="vs-chip" aria-pressed={L.reframe.mode === 'crop'} onClick={() => setL({ reframe: { mode: 'crop' } }, 'Crop')}>Crop</button>
            <button type="button" className="vs-chip" aria-pressed={L.reframe.mode === 'fit'} onClick={() => setL({ reframe: { mode: 'fit' } }, 'Fit')}>Whole picture</button>
          </div>
        </div>
      )}
      {L.reframe.mode === 'crop' && (
        <label className="vs-label">Crop position · {Math.round(L.reframe.x * 100)}%
          <input type="range" min={0} max={100} defaultValue={Math.round(L.reframe.x * 100)} key={L.reframe.x} aria-label="Crop position"
            onPointerUp={e => setL({ reframe: { x: Number((e.target as HTMLInputElement).value) / 100 } }, 'Moved the crop')} />
        </label>
      )}
      {ctx.view.source.probe && <p className="vs-kbd" style={{ margin: 0 }}>Recorded at {ctx.view.source.probe.width}×{ctx.view.source.probe.height}, {Math.round(ctx.view.source.probe.fps)} fps, {ctx.view.source.probe.vcodec.toUpperCase()}.</p>}
      <RenderHint ctx={ctx} />
    </div>
  );
}

/* ── Audio ────────────────────────────────────────────────────────────────── */

/** Studio Sound's strengths as choices (the slider under them fine-tunes). */
const STUDIO_LEVELS = [
  { v: 30, label: 'Gentle', note: 'A light touch for a fairly quiet room' },
  { v: 60, label: 'Balanced', note: 'Most rooms and laptop mics' },
  { v: 80, label: 'Strong', note: 'Fans, air-con, traffic' },
  { v: 100, label: 'Maximum', note: 'AI voice isolation — very noisy rooms; listen before you publish' },
];

const NOISE: { key: Denoise; label: string; note: string }[] = [
  { key: 'off', label: 'Off', note: 'The sound as recorded.' },
  { key: 'light', label: 'Light', note: 'A little hiss and hum taken out; the voice untouched.' },
  { key: 'medium', label: 'Medium', note: 'Fans, air-conditioning and room noise reduced. Right for most recordings.' },
  { key: 'strong', label: 'Strong', note: 'Heavy, steady noise. Can make a voice sound thinner — listen before you publish.' },
  { key: 'max', label: 'Maximum (AI)', note: 'AI voice isolation: your voice is kept and everything that is not a voice — fans, music, traffic, keyboards, a TV — is taken out, and the room is turned right down wherever the transcript has nobody talking. The strongest there is; a very noisy recording can sound a little processed.' },
];

export function AudioPanel({ ctx }: { ctx: EditorCtx }) {
  const a = ctx.doc.audio;
  const set = (patch: Partial<typeof a>, note: string) => void ctx.apply([{ op: 'audio.set', patch }], note);
  const vol = Math.round((a.volume ?? 1) * 100);
  const studio = !!a.studio;
  const music = ctx.doc.music;
  return (
    <div className="vs-col" data-testid="vs-audio-panel">
      <div className="vs-group"><b>Audio effects</b>
        {/* Studio Sound's level is chosen in the open, not behind a settings icon (the owner's ask). */}
        <div className={`vs-fx vs-studio ${studio ? 'on' : ''}`} data-effect="studio">
          <div className="vs-fx-row">
            <span className="ic" aria-hidden="true"><Wand2 size={15} /></span>
            <span className="t"><b>Studio Sound</b><small>{studio ? `Strength ${a.strength ?? 60}% · noise out, voice lifted, −16 LUFS` : 'Makes a room recording sound close to a studio one'}</small></span>
            <Switch on={studio} onChange={on => set({ studio: on }, on ? 'Studio Sound on' : 'Studio Sound off')} label="Studio Sound" field="video.fx.studio" />
          </div>
          <div className="vs-studio-levels" role="radiogroup" aria-label="Studio Sound strength">
            {STUDIO_LEVELS.map(l => {
              const cur = studio && Math.abs((a.strength ?? 60) - l.v) < 1;
              return (
                <button key={l.v} type="button" role="radio" aria-checked={cur} className="vs-studio-level" data-studio-level={l.v}
                  onClick={() => set({ studio: true, strength: l.v }, `Studio Sound: ${l.label.toLowerCase()} (${l.v}%)`)}>
                  <b>{l.label}</b><small>{l.v}%</small><span>{l.note}</span>
                </button>
              );
            })}
          </div>
          <FxSlider label="Fine-tune strength" value={a.strength ?? 60} min={0} max={100} unit="%" onSave={v => set({ strength: v, studio: true }, `Studio Sound strength ${v}%`)} />
          <small className="vs-kbd">Rumble cut, background noise taken out (RNNoise), harsh “s” softened, less boom and more presence, quiet and loud words evened, then loudness to −16 LUFS over the whole video. It cannot rebuild a word that clipped or dropped out.</small>
        </div>
        <EffectRow id="duck" icon={<Volume2 size={15} />} title="Lower audio of other layers" on={!!music && music.duck} disabled={!music}
          why="Add music first — this lowers it whenever someone speaks."
          summary={music ? (music.duck ? `“${music.title.slice(0, 28)}” dips under speech` : 'The music plays at its own level throughout') : undefined}
          onToggle={on => void ctx.apply([{ op: 'music.patch', patch: { duck: on } }], on ? 'Music lowered under speech' : 'Music at its own level')} />
      </div>
      <button type="button" className="vs-improve vs-oneclick" onClick={() => set({ studio: true, strength: 70, declick: true, gate: true }, 'Best voice: Studio Sound, clicks repaired, room lowered')} data-act="best-voice">
        <Wand2 size={20} /><span><b>Best voice in one click</b><small>Studio Sound at 70%, clicks and pops repaired, room noise between sentences lowered. Each can be changed below.</small></span>
      </button>
      <div className="vs-group"><b>Repairs</b>
        <div className="vs-label">Electrical hum
          <div className="vs-chips" role="radiogroup" aria-label="Hum removal">
            {([['off', 'Off'], ['50', '50 Hz (Europe, Asia, Africa, Australia)'], ['60', '60 Hz (Americas)']] as const).map(([k, l]) => (
              <button key={k} type="button" role="radio" aria-checked={(a.hum ?? 'off') === k} aria-pressed={(a.hum ?? 'off') === k} className="vs-chip" data-hum={k} onClick={() => set({ hum: k }, k === 'off' ? 'Hum removal off' : `${k} Hz hum removed`)}>{l}</button>
            ))}
          </div>
          <span className="vs-kbd" style={{ fontWeight: 500 }}>A low buzz from lights or a cable. It and three of its overtones are notched out narrowly, so the voice keeps its body. Pick the mains frequency where you recorded.</span>
        </div>
        <label className="vs-opt"><input type="checkbox" checked={!!a.declick} onChange={e => set({ declick: e.target.checked }, e.target.checked ? 'Clicks and pops repaired' : 'Click repair off')} data-testid="vs-declick" />
          <span><b>Repair clicks and pops</b><br /><small className="vs-kbd">Mouth clicks, plosive pops and digital ticks are found and filled in from the sound either side.</small></span></label>
        <label className="vs-opt"><input type="checkbox" checked={!!a.gate} onChange={e => set({ gate: e.target.checked }, e.target.checked ? 'Room noise between sentences lowered' : 'Room noise as recorded')} data-testid="vs-gate" />
          <span><b>Quiet the room between sentences</b><br /><small className="vs-kbd">When nobody is speaking the room is turned down (never to silence); words are untouched.</small></span></label>
      </div>
      <div className={`vs-label ${studio ? 'vs-dim' : ''}`}>Background noise reduction
        <div className="vs-chips" role="radiogroup" aria-label="Noise reduction">
          {NOISE.map(n => <button key={n.key} type="button" role="radio" aria-checked={a.denoise === n.key} className="vs-chip" aria-pressed={a.denoise === n.key} data-denoise={n.key} onClick={() => set({ denoise: n.key }, `Noise reduction: ${n.label.toLowerCase()}`)}>{n.label}</button>)}
        </div>
        <span className="vs-kbd" style={{ fontWeight: 500 }}>{studio ? 'Studio Sound is on and does this itself (Maximum strength uses AI voice isolation) — these levels are used when it is off. ' : ''}{NOISE.find(n => n.key === a.denoise)?.note}{a.denoise === 'max' ? '' : ' Steady noise is what these levels remove; for a dog, music or traffic choose Maximum (AI).'}</span>
      </div>
      <label className="vs-opt"><input type="checkbox" checked={!!a.speechOnly || a.denoise === 'max' || (studio && (a.strength ?? 60) >= 90)} disabled={a.denoise === 'max' || (studio && (a.strength ?? 60) >= 90)} onChange={e => set({ speechOnly: e.target.checked }, e.target.checked ? 'Only the talking kept' : 'Room kept between words')} data-testid="vs-speech-only" />
        <span><b>Keep only the talking</b><br /><small className="vs-kbd">Uses the transcript: wherever nobody is speaking the room is turned right down (−26 dB), with a breath kept before each phrase. Needs the video transcribed; always on with AI voice isolation.</small></span></label>
      <label className={`vs-opt ${studio ? 'vs-dim' : ''}`}><input type="checkbox" checked={!!a.voice} onChange={e => set({ voice: e.target.checked }, e.target.checked ? 'Voice clarity on' : 'Voice clarity off')} />
        <span><Mic size={13} /> <b>Voice clarity</b><br /><small className="vs-kbd">Presence lifted, harsh “s” sounds softened, levels evened out.{studio ? ' Part of Studio Sound while it is on.' : ''}</small></span></label>
      <label className="vs-label"><span><Volume2 size={13} /> Voice level · {vol}%</span>
        <input type="range" min={50} max={150} step={5} defaultValue={vol} key={vol} aria-label="Voice level"
          onPointerUp={e => set({ volume: Number((e.target as HTMLInputElement).value) / 100 }, 'Voice level')} onKeyUp={e => set({ volume: Number((e.target as HTMLInputElement).value) / 100 }, 'Voice level')} />
      </label>
      <label className="vs-opt"><input type="checkbox" checked={a.loudnorm || studio} disabled={studio} onChange={e => set({ loudnorm: e.target.checked }, e.target.checked ? 'Loudness evened out' : 'Loudness as recorded')} />
        <span><b>Even loudness</b><br /><small className="vs-kbd">Every video at −16 LUFS (true peak −1.5 dB), measured over the whole edit and then applied — the level podcasts and the platforms play at.{studio ? ' Always on with Studio Sound.' : ''}</small></span></label>
      <LiveSoundNote />
      <ApplyNow ctx={ctx} />
      <RenderHint ctx={ctx} />
    </div>
  );
}

/**
 * "Apply to the video now": the sound settings are heard only in a made file,
 * so this makes it — and opens Progress, where each step of the pass (hum,
 * clicks, Studio Sound, the two loudness passes) shows as it runs. With no
 * video made yet it opens Export, which can make the long one.
 */
function ApplyNow({ ctx }: { ctx: EditorCtx }) {
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const outs = ctx.view.outputs;
  const changed = outs.filter(o => o.stale || !o.rendered);
  const go = async () => {
    setBusy(true); setErr('');
    /* No video yet (a Screen Recorder save): the long video is switched on and made here — the
       button used to send the customer to Export with "Make the video with this sound", which
       read as making another video. The made file replaces the last one; it is not a copy. */
    if (!outs.length && !(await ctx.apply([{ op: 'long.set', patch: { on: true } }], 'Apply the sound to the video'))) { setBusy(false); setErr('Could not save the change.'); return; }
    const r = await renderOutputs(ctx.view.project.id, outs.length ? changed.map(o => o.id) : undefined);
    setBusy(false);
    if (!r.success) { setErr(r.error ?? 'Could not start.'); return; }
    ctx.setTab('activity');
    void ctx.refresh();
  };
  return (
    <div className="vs-col" style={{ gap: 6 }}>
      <button type="button" className="vs-btn ai" disabled={busy || (outs.length > 0 && !changed.length)} onClick={() => void go()} data-act="apply-now">
        {busy ? <Loader size={14} className="spin" /> : <Wand2 size={14} />} {outs.length > 0 && !changed.length ? 'The video already has this sound' : changed.length > 1 ? `Apply to the ${changed.length} videos now` : 'Apply to the video now'}
      </button>
      <small className="vs-kbd">Updates the same video — each sound step is named under Progress while it runs.</small>
      {err && <div className="vs-note bad">{err}</div>}
    </div>
  );
}

/** Whether the player is playing these settings live, in plain words. */
function LiveSoundNote() {
  const st = useLiveSoundState();
  return (
    <div className={`vs-note ${st.state === 'off' ? 'warn' : ''}`} data-testid="vs-live-sound" data-state={st.state}>
      <Sparkles size={15} />
      <span>{st.state === 'live' ? 'You are hearing these in the player now — a live preview close to the made video. Click repair and the final −16 LUFS loudness are heard in the made video only.'
        : st.state === 'starting' ? 'Press play to hear these settings in the player.'
          : st.why || 'This browser cannot play the sound fixes live; they are heard in the made video.'}</span>
    </div>
  );
}

/* ── Music ────────────────────────────────────────────────────────────────── */

const MOODS = ['Calm', 'Upbeat', 'Corporate', 'Inspiring', 'Lo-fi', 'Cinematic', 'Acoustic', 'Piano'];

export function MusicPanel({ ctx }: { ctx: EditorCtx }) {
  const { doc, view } = ctx;
  const m = doc.music ?? null;
  const [q, setQ] = useState('');
  const [tracks, setTracks] = useState<FoundTrack[] | null>(null);
  const [searching, setSearching] = useState(false);
  const [err, setErr] = useState('');
  const [busyId, setBusyId] = useState('');
  const [hearing, setHearing] = useState('');
  const [rights, setRights] = useState(false);
  const [file, setFile] = useState<File | null>(null);
  const [uploading, setUploading] = useState(false);
  const [applyTo, setApplyTo] = useState<'all' | 'long' | 'shorts'>(m?.applyTo ?? 'all');
  const ear = useRef<HTMLAudioElement | null>(null);

  useEffect(() => () => { ear.current?.pause(); }, []);

  const find = async (text: string) => {
    setSearching(true); setErr('');
    const r = await searchMusic(view.project.id, `${text || 'calm'} instrumental`.trim());
    setSearching(false);
    if (r.success) setTracks(r.tracks ?? []); else { setTracks(null); setErr(r.error ?? 'The music library could not be searched.'); }
  };
  const hear = (t: FoundTrack) => {
    if (hearing === t.id) { ear.current?.pause(); setHearing(''); return; }
    ear.current?.pause();
    const a = new Audio(t.previewUrl);
    a.volume = 0.8;
    a.onended = () => setHearing('');
    a.onerror = () => { setHearing(''); setErr('That track could not be played.'); };
    ear.current = a;
    void a.play().catch(() => setHearing(''));
    setHearing(t.id);
  };
  const choose = async (t: FoundTrack) => {
    setBusyId(t.id); setErr('');
    ear.current?.pause(); setHearing('');
    const r = await chooseMusic(view.project.id, ctx.version, t.id, applyTo);
    setBusyId('');
    if (!r.success) { setErr(r.error ?? 'That track could not be added.'); return; }
    ctx.say({ who: 'ai', text: r.reply });
    await ctx.refresh();
  };
  const upload = async () => {
    if (!file) return;
    setUploading(true); setErr('');
    const r = await uploadMusic(view.project.id, ctx.version, file, rights);
    setUploading(false);
    if (!r.ok) { setErr(r.error); return; }
    setFile(null); setRights(false);
    ctx.say({ who: 'ai', text: `“${file.name}” is under your videos now. Render to hear it in the files.` });
    await ctx.refresh();
  };
  const patch = (p: Partial<NonNullable<typeof m>>, note: string) => void ctx.apply([{ op: 'music.patch', patch: p }], note);

  return (
    <div className="vs-col" data-testid="vs-music-panel">
      {m ? (
        <div className="vs-item" data-testid="vs-music-current">
          <div className="vs-row"><Music2 size={15} color="#2dd4bf" /><b style={{ flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{m.title}</b>
            <button type="button" className="vs-btn ghost sm danger" aria-label="Remove the music" onClick={() => void ctx.apply([{ op: 'music.remove' }], 'Music removed')} data-act="music-remove"><Trash2 size={13} /></button></div>
          <span className="vs-meta"><span>{m.artist}</span><span className="vs-badge working">{m.license}</span>{m.licenseUrl && <a href={m.licenseUrl} target="_blank" rel="noreferrer">licence <ExternalLink size={10} /></a>}{m.sourceUrl && <a href={m.sourceUrl} target="_blank" rel="noreferrer">source <ExternalLink size={10} /></a>}</span>
          {m.attribution && <small className="vs-kbd">Credit added to each video's description: {m.attribution}</small>}
          {view.musicUrl && <audio controls src={view.musicUrl} preload="none" style={{ width: '100%', height: 34 }} />}
          <label className="vs-label">Volume under the voice · {Math.round(m.volume * 100)}%
            <input type="range" min={2} max={60} defaultValue={Math.round(m.volume * 100)} key={m.volume} aria-label="Music volume" data-field="video.musicVolume"
              onPointerUp={e => patch({ volume: Number((e.target as HTMLInputElement).value) / 100 }, 'Music volume')} onKeyUp={e => patch({ volume: Number((e.target as HTMLInputElement).value) / 100 }, 'Music volume')} />
          </label>
          <div className="vs-row">
            <label className="vs-label" style={{ flex: 1 }}>Fade in · {m.fadeIn}s
              <input type="range" min={0} max={10} step={0.5} defaultValue={m.fadeIn} key={`i${m.fadeIn}`} onPointerUp={e => patch({ fadeIn: Number((e.target as HTMLInputElement).value) }, 'Music fade-in')} />
            </label>
            <label className="vs-label" style={{ flex: 1 }}>Fade out · {m.fadeOut}s
              <input type="range" min={0} max={15} step={0.5} defaultValue={m.fadeOut} key={`o${m.fadeOut}`} onPointerUp={e => patch({ fadeOut: Number((e.target as HTMLInputElement).value) }, 'Music fade-out')} />
            </label>
          </div>
          <div className="vs-row">
            <label className="vs-row" style={{ gap: 6, fontSize: 13 }}><input type="checkbox" checked={m.duck} onChange={e => patch({ duck: e.target.checked }, e.target.checked ? 'Music dips under speech' : 'Music at a steady level')} /> Dip under speech</label>
            <label className="vs-row" style={{ gap: 6, fontSize: 13 }}><input type="checkbox" checked={m.loop} onChange={e => patch({ loop: e.target.checked }, e.target.checked ? 'Music loops' : 'Music plays once')} /> Loop</label>
          </div>
          <div className="vs-chips" role="radiogroup" aria-label="Music applies to">
            {([['all', 'All videos'], ['long', 'Long video only'], ['shorts', 'Shorts only']] as const).map(([k, l]) => (
              <button key={k} type="button" role="radio" aria-checked={m.applyTo === k} className="vs-chip" aria-pressed={m.applyTo === k} onClick={() => patch({ applyTo: k }, `Music on: ${l.toLowerCase()}`)}>{l}</button>
            ))}
          </div>
        </div>
      ) : (
        <p className="vs-sub" style={{ margin: 0 }}>No music yet. Find a royalty-free track below, or upload your own.</p>
      )}

      <div className="vs-label">{m ? 'Change the track' : 'Royalty-free music'}
        <div className="vs-row" style={{ flexWrap: 'nowrap' }}>
          <div style={{ position: 'relative', flex: 1 }}>
            <Search size={14} style={{ position: 'absolute', left: 10, top: 11, color: '#8a8d99' }} />
            <input className="vs-input" style={{ paddingLeft: 30 }} placeholder="Mood or style — calm, upbeat, piano…" value={q} onChange={e => setQ(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter') void find(q); }} data-field="video.music" data-testid="vs-music-q" />
          </div>
          <button type="button" className="vs-btn ai sm" onClick={() => void find(q)} disabled={searching} data-testid="vs-music-search">{searching ? <Loader size={13} className="spin" /> : <Search size={13} />} Find</button>
        </div>
      </div>
      <div className="vs-chips">{MOODS.map(w => <button key={w} type="button" className="vs-chip" onClick={() => { setQ(w.toLowerCase()); void find(w.toLowerCase()); }}>{w}</button>)}</div>
      {!m && (
        <div className="vs-chips" role="radiogroup" aria-label="Put the music under">
          {([['all', 'All videos'], ['long', 'Long video'], ['shorts', 'Shorts']] as const).map(([k, l]) => <button key={k} type="button" className="vs-chip" aria-pressed={applyTo === k} onClick={() => setApplyTo(k)}>{l}</button>)}
        </div>
      )}
      {err && <div className="vs-note bad" role="alert">{err}</div>}
      {tracks && !tracks.length && <p className="vs-sub" style={{ margin: 0 }}>Nothing found with a licence that allows business use. Try another mood.</p>}
      {tracks && tracks.length > 0 && (
        <div className="vs-list" data-testid="vs-music-results">
          {tracks.map(t => (
            <div key={t.id} className="vs-track" data-track={t.id}>
              <button type="button" className="pl" onClick={() => hear(t)} aria-label={hearing === t.id ? `Stop ${t.title}` : `Listen to ${t.title}`}>{hearing === t.id ? <Pause size={15} /> : <Play size={15} />}</button>
              <div style={{ minWidth: 0 }}>
                <b title={t.title}>{t.title}</b>
                <small>{t.artist}{t.duration ? ` · ${clock(t.duration)}` : ''} · <span style={{ color: t.licenseCode === 'by' ? '#fbbf24' : '#34d399' }}>{t.license}</span>{t.provider ? ` · ${t.provider}` : ''}</small>
              </div>
              <button type="button" className="vs-btn sm" disabled={!!busyId} onClick={() => void choose(t)} data-act="use-track">{busyId === t.id ? <Loader size={13} className="spin" /> : <Check size={13} />} Use</button>
            </div>
          ))}
        </div>
      )}
      <p className="vs-kbd" style={{ margin: 0 }}>From <a href="https://openverse.org" target="_blank" rel="noreferrer">Openverse</a>. Only CC0, public-domain and CC BY tracks are shown — licences that allow a business to use them in its videos. A CC BY track's credit is written into every video's description for you.</p>

      <details className="vs-item">
        <summary style={{ cursor: 'pointer', fontWeight: 650, fontSize: 13 }}><Upload size={13} /> Upload your own track</summary>
        <div className="vs-col" style={{ marginTop: 8 }}>
          <input type="file" accept="audio/mpeg,audio/mp4,audio/wav,audio/ogg,audio/flac,.mp3,.m4a,.wav,.ogg,.flac" data-field="video.musicFile" data-testid="vs-music-file"
            onChange={e => setFile(e.target.files?.[0] ?? null)} />
          <label className="vs-row" style={{ gap: 8, fontSize: 12.5, alignItems: 'flex-start' }}>
            <input type="checkbox" checked={rights} onChange={e => setRights(e.target.checked)} data-field="video.musicRights" />
            <span>I own this track or have a licence to use it in my videos.</span>
          </label>
          <button type="button" className="vs-btn sm" style={{ justifySelf: 'start' }} disabled={!file || uploading} onClick={() => void upload()}>{uploading ? <Loader size={13} className="spin" /> : <Wand2 size={13} />} Use this track</button>
        </div>
      </details>
      <RenderHint ctx={ctx} />
    </div>
  );
}
