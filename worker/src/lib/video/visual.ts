/**
 * Every visual decision for one video, in one place — what the render sends
 * the engine and what the preview draws come from this and nothing else
 * (2026-11: the preview used to work the same things out again by itself,
 * and drifted — a look that showed on the long video was missing from a
 * laid-out Short, five effects had no preview at all).
 *
 * `visualSpec` answers: the output's size; how the picture is framed (a
 * crop at a point, a crop that follows a face, the whole picture, a classic
 * layout from the faces, the Screen Recorder's pointer layout, or the
 * planner's window — reframe.ts); which look, motion and effects apply;
 * which words on screen and which logo. pipeline.ts `renderSpec` hashes
 * and sends it; Player.tsx draws it. Pure, shared.
 */
import type { Clip, Effects, Look, LogoSettings, Motion, Overlay, TrackMode, VideoDoc } from './edit';
import { dimsFor, effectsOf, effectsOn, logoFor, lookOf, motionOf, trackingOf } from './edit';
import { overlaySpan } from './motion';
import { screenLayoutFor, type ScreenRef } from './pointer';
import { framingMatters, resolveFraming, type Known, type Resolved } from './reframe';

export interface VisualInput {
  doc: VideoDoc;
  clip: Clip | null | undefined;
  probe: { width: number; height: number };
  /** Whether the face track (prep/faces.json) exists for this recording. */
  tracked: boolean;
  /** What the analysis found (reframe.ts `knownOf`). */
  known: Known;
  /** The Screen Recorder's notes, when the recording has them. */
  screen: Pick<ScreenRef, 'cam'> | null | undefined;
  keeps: [number, number][];
}

export interface VisualSpec {
  kind: 'long' | 'short';
  width: number; height: number;
  mode: 'crop' | 'fit' | 'source';
  x: number; y: number;
  tracking: TrackMode;
  /** A classic layout from the faces (layouts.ts). */
  layout: 'split' | 'two' | 'pip' | null;
  /** The Screen Recorder's own pointer layout (pointer.ts). */
  screenLayout: 'screencam' | 'follow' | null;
  /** The planner's framing (reframe.ts) — a window on a path; null when another framing applies. */
  framing: Resolved | null;
  look: Look; motion: Motion;
  effects: Partial<Effects>;
  overlays: Overlay[];
  logo: LogoSettings | null;
}

export function visualSpec(i: VisualInput): VisualSpec {
  const { doc, clip, probe } = i;
  const kind = clip ? 'short' as const : 'long' as const;
  const aspect = clip ? clip.aspect : doc.long.aspect;
  const { width, height } = dimsFor(aspect, probe.width, probe.height);
  const reframe = clip ? clip.reframe : doc.long.reframe;
  let mode: VisualSpec['mode'] = aspect === 'source' ? 'source' : reframe.mode === 'source' && !clip ? 'crop' : reframe.mode;
  /* Following a face only means something where the picture is cropped, and only once the faces are known.
     A Short laid out as "speaker" follows the speaker whatever the Shorts' own tracking says. */
  let tracking: TrackMode = mode === 'crop' && i.tracked ? (clip?.layout === 'speaker' ? 'speaker' : trackingOf(doc, kind)) : 'off';
  /* A Screen Recorder Short: the layout asked for, or — not asked, in a tall shape — the camera on top
     if there was one, else the screen following the pointer, which is what a screen Short is for. */
  const screenLayout = screenLayoutFor(clip, i.screen);
  let layout: VisualSpec['layout'] = screenLayout ? null : clip?.layout === 'split' || clip?.layout === 'two' || clip?.layout === 'pip' ? (i.tracked ? clip.layout : null) : null;
  /* The planner frames a cropped Short that has no layout of its own and no Screen Recorder notes:
     every new Short, and every older one cropped at a point — unless what it decides is that very crop. */
  let framing: Resolved | null = null;
  if (clip && !screenLayout && !layout && !clip.layout && (clip.framing || mode === 'crop')) {
    const r = resolveFraming(clip.framing, i.known, reframe);
    if (r.layout === 'two' && i.tracked) layout = 'two';
    else if (framingMatters(r) && (i.tracked || r.strategy === 'whole')) framing = r;
  }
  if (framing) { mode = 'crop'; tracking = 'off'; }
  const effects = effectsOn(effectsOf(doc, kind));
  return {
    kind, width, height, mode, x: reframe.x, y: reframe.y, tracking, layout, screenLayout, framing,
    look: lookOf(doc, kind), motion: motionOf(doc, kind), effects,
    overlays: (doc.overlays ?? []).filter(ov => overlaySpan(ov, i.keeps)), logo: logoFor(doc, kind),
  };
}

/** What of a framing a render depends on (the hash); the path is derived from the analysis file, named by its key beside it. */
export const framingKey = (r: Resolved) => ({ s: r.strategy, z: r.zoom, sh: r.share, c: r.camAt, f: r.focus, p: r.pins, fit: r.fitScreen });
