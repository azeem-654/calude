/**
 * Framing a Short round what matters — the planner behind "New short
 * composition" (2026-11). A tall Short cut from a landscape recording used
 * to be the middle of the picture; the sides, with the speaker or the
 * menu, were gone. Now the recording's analysis (track.py: faces, the
 * pointer, where things happen, the kind of recording) decides a
 * *strategy*, and this file turns the strategy into the one thing the
 * engine and the preview both understand already: a window of fixed size
 * moved along a path inside a region, with a camera band when there is
 * one (pointer.ts `ScreenPlan`, engine `screenFrame`, Player
 * `drawScreenLayout`). So nothing here is a filter, and the preview is the
 * render.
 *
 * What is stored on the Short is only the customer's choices (`Framing`
 * in edit.ts: strategy, zoom, focus, band share, pins). The path is worked
 * out again from the analysis wherever it is needed, so the edit stays
 * small and the two sides cannot drift.
 *
 * Pure: imported by the Worker and the browser alike.
 */
import type { Framing, FrameStrategy } from './edit';
import { toSource } from './edit';
import type { Analysis, AnalysisSummary, TrackFile, TrackRow, VideoKind } from './motion';
import { KIND_LABEL, trackAt } from './motion';
import { faceBox, webcamBubble, type Box, type Person } from './layouts';
import { wideSpans, type ScreenMeta, type ScreenPlan } from './pointer';

export type Strategy = Exclude<FrameStrategy, 'auto'>;
export const STRATEGY_LABEL: Record<FrameStrategy, string> = {
  auto: 'Automatic', cursor: 'Follow the pointer', speaker: 'Follow the speaker', screencam: 'Screen + camera', content: 'Follow the action', still: 'Still window', whole: 'Whole picture',
};
export const STRATEGY_HINT: Record<FrameStrategy, string> = {
  auto: 'Chosen from what the analysis found in the recording.',
  cursor: 'A window that follows the mouse pointer; the whole screen where it ranges wide.',
  speaker: 'A window that follows the speaker’s face, with headroom.',
  screencam: 'The screen follows the pointer; the camera picture in a band of its own.',
  content: 'A window that follows where things happen on screen.',
  still: 'A window held where you put it (click the preview).',
  whole: 'The whole picture fitted in, on a blurred copy of itself.',
};

/** What is known about the recording for the decision — from the open file, or from the summary the project keeps. */
export interface Known {
  analysed: boolean;
  kind: VideoKind | null;
  why: string;
  cursorSeen: number;
  people: Person[];
  faces: boolean;
}

export function knownOf(tf: TrackFile | null | undefined, summary?: { seen?: number; faces?: number; analysis?: AnalysisSummary } | null): Known {
  const a = tf?.analysis ?? summary?.analysis ?? null;
  const people = (tf?.people ?? summary?.analysis?.people ?? []) as Person[];
  const seen = tf?.seen ?? summary?.seen ?? 0, faces = tf?.faces ?? summary?.faces ?? 0;
  return { analysed: !!a && a.v === 2, kind: a?.kind ?? null, why: a?.why ?? '', cursorSeen: a?.cursorSeen ?? 0, people, faces: faces > 0 && seen >= 0.1 };
}

export interface FramingOption { key: FrameStrategy; label: string; ok: boolean; why: string }

const NOT_ANALYSED = 'Needs the analysis of the recording — press “Analyse again” in the Tracking tab.';

/** Every strategy with whether this recording can carry it, and why not. */
export function framingOptions(k: Known): FramingOption[] {
  const bubble = webcamBubble({ people: k.people } as TrackFile);
  return [
    { key: 'auto', label: STRATEGY_LABEL.auto, ok: true, why: '' },
    { key: 'cursor', label: STRATEGY_LABEL.cursor, ok: k.analysed && k.cursorSeen >= 0.03, why: !k.analysed ? NOT_ANALYSED : k.cursorSeen >= 0.03 ? '' : 'No mouse pointer was seen moving in this recording.' },
    { key: 'speaker', label: STRATEGY_LABEL.speaker, ok: k.faces, why: k.faces ? '' : 'No face was found to follow.' },
    { key: 'screencam', label: STRATEGY_LABEL.screencam, ok: !!bubble, why: bubble ? '' : k.people.length > 1 ? 'There are two people here, not a screen with a webcam picture.' : k.people.length ? 'The face here is the main picture, not a small camera picture in a corner.' : 'No small camera picture was found in a corner.' },
    { key: 'content', label: STRATEGY_LABEL.content, ok: k.analysed, why: k.analysed ? '' : NOT_ANALYSED },
    { key: 'still', label: STRATEGY_LABEL.still, ok: true, why: '' },
    { key: 'whole', label: STRATEGY_LABEL.whole, ok: true, why: '' },
  ];
}

/** The strategy settled, with every number filled in — what the hash, the render and the preview read. */
export interface Resolved {
  strategy: Strategy;
  /** Two people taking turns are better as the classic stacked layout (layouts.ts `two`) than as one window. */
  layout: 'two' | null;
  zoom: number;
  share: number;
  camAt: 'top' | 'bottom';
  focus: { x: number; y: number };
  pins: [number, number, number][];
  /** screencam: the screen band shows the screen whole (slides) rather than a window following the pointer. */
  fitScreen: boolean;
  by: 'ai' | 'you';
  /** One line for the customer: what was chosen and from what. */
  note: string;
}

const DEFAULT_ZOOM: Record<Strategy, number> = { cursor: 0.7, speaker: 1, screencam: 0.7, content: 0.85, still: 1, whole: 1 };

/**
 * `auto`, settled from the kind of recording:
 *   screen     the pointer where one moves, else the action
 *   screencam  the screen following the pointer, the camera in a band below
 *   slides     the whole slide (with the camera in a band when there is one)
 *   talking    the speaker, followed
 *   two        both people, stacked
 *   camera     the action, followed slowly, at the full height
 * Not analysed: the speaker when faces were found, else a still window at
 * the Short's own crop position — and the note says so.
 */
export function resolveFraming(f: Framing | undefined | null, k: Known, reframe: { x: number; y: number } = { x: 0.5, y: 0.5 }): Resolved {
  const want = f?.strategy ?? 'auto';
  const bubble = webcamBubble({ people: k.people } as TrackFile);
  let strategy: Strategy, layout: 'two' | null = null, fitScreen = false, note = '';
  const kindLine = k.kind ? `${KIND_LABEL[k.kind].toLowerCase()} (${k.why})` : '';
  if (want !== 'auto') {
    const opt = framingOptions(k).find(o => o.key === want);
    if (opt?.ok) { strategy = want; note = `${STRATEGY_LABEL[want]} — your choice.`; }
    else { strategy = k.faces ? 'speaker' : 'still'; note = `${STRATEGY_LABEL[want]} is not possible here (${opt?.why ?? 'unknown'}); ${STRATEGY_LABEL[strategy].toLowerCase()} instead.`; }
    if (strategy === 'screencam' && k.kind === 'slides') fitScreen = true;
  } else if (!k.analysed) {
    strategy = k.faces ? 'speaker' : 'still';
    note = k.faces ? 'Follows the speaker (faces were found; the recording has not been analysed further yet).' : 'A still window — the recording has not been analysed yet, so nothing is known to follow. Analyse again from the Tracking tab.';
  } else {
    switch (k.kind) {
      /* Two people: the one talking, cut to when the talk changes hands (track.py holds two seconds before a switch,
         so a pause or a laugh does not cut) — the stacked layout halves both pictures and is offered as a layout instead. */
      case 'two': strategy = k.faces ? 'speaker' : 'content'; break;
      case 'talking': strategy = k.faces ? 'speaker' : 'content'; break;
      case 'screencam': strategy = bubble ? 'screencam' : k.cursorSeen >= 0.03 ? 'cursor' : 'content'; break;
      case 'screen': strategy = k.cursorSeen >= 0.03 ? 'cursor' : 'content'; break;
      case 'slides': if (bubble) { strategy = 'screencam'; fitScreen = true; } else strategy = 'whole'; break;
      default: strategy = k.faces ? 'speaker' : 'content';
    }
    note = `${STRATEGY_LABEL[strategy]}${k.kind === 'two' ? ' who is talking, cutting when the talk changes hands' : ''} — ${kindLine || 'from the analysis'}.`;
  }
  const zoom = f?.zoom ?? DEFAULT_ZOOM[strategy];
  return {
    strategy, layout, zoom: strategy === 'whole' ? 1 : zoom, share: f?.share ?? 0.33, camAt: f?.camAt ?? 'bottom',
    focus: f?.focus ?? { x: reframe.x, y: reframe.y }, pins: f?.pins ?? [], fitScreen, by: f?.by ?? (want === 'auto' ? 'ai' : 'you'), note,
  };
}

/** Whether a resolved framing changes anything against the plain crop it replaces — a still, unzoomed window at the crop point is that crop. */
export const framingMatters = (r: Resolved): boolean => !(r.strategy === 'still' && r.zoom >= 0.999 && !r.pins.length);

/* ── The plan: a window, its path, the camera band ────────────────────────── */

export interface FramePlan {
  plan: ScreenPlan & { fitScreen?: boolean };
  /** [output time, x, y] of the window's top-left (source px), every 0.1 s (pointer.ts `followAt`). */
  path: [number, number, number][];
  /** Output stretches shown whole (the region fitted) instead of the window. */
  wide: [number, number][];
}

const ev = (n: number) => Math.max(2, Math.round(n / 2) * 2);
/** An even position (a crop's x or y may be 0; only sizes have a floor). */
const ev0 = (n: number) => Math.max(0, Math.round(n / 2) * 2);
const r2 = (n: number) => Math.round(n * 100) / 100;
const FULL: [number, number, number, number] = [0, 0, 1, 1];

function regionOf(an: Analysis | undefined, srcW: number, srcH: number): Box {
  const c = an?.content ?? FULL;
  const w = ev(Math.max(0.3, c[2]) * srcW), h = ev(Math.max(0.3, c[3]) * srcH);
  return [Math.min(srcW - w, Math.max(0, Math.round(c[0] * srcW))), Math.min(srcH - h, Math.max(0, Math.round(c[1] * srcH))), w, h];
}

/** The largest window of the output's shape inside the region, times `zoom`. */
function windowFor(region: Box, outW: number, bandH: number, zoom: number): [number, number] {
  const aspect = outW / Math.max(1, bandH);
  let h = region[3], w = h * aspect;
  if (w > region[2]) { w = region[2]; h = w / aspect; }
  const z = Math.min(1, Math.max(0.35, zoom));
  return [ev(Math.max(16, w * z)), ev(Math.max(16, h * z))];
}

/** Where the pointer, the speaker or the action is at a source time (frame px), or null when nothing is known there. */
type Sample = (tSrc: number) => [number, number] | null;

function cursorSampler(an: Analysis, srcW: number, srcH: number): Sample {
  const rows = an.cursor;
  return t => {
    if (!rows.length || t < rows[0][0] - 2) return null;
    let lo = 0, hi = rows.length - 1;
    if (t >= rows[hi][0]) return [rows[hi][1] * srcW, rows[hi][2] * srcH];
    if (t <= rows[0][0]) return [rows[0][1] * srcW, rows[0][2] * srcH];
    while (hi - lo > 1) { const m = (lo + hi) >> 1; if (rows[m][0] <= t) lo = m; else hi = m; }
    const a = rows[lo], b = rows[hi];
    if (b[0] - a[0] > 0.6) return [a[1] * srcW, a[2] * srcH];
    const k = (t - a[0]) / Math.max(1e-6, b[0] - a[0]);
    return [(a[1] + (b[1] - a[1]) * k) * srcW, (a[2] + (b[2] - a[2]) * k) * srcH];
  };
}

function activitySampler(an: Analysis, srcW: number, srcH: number): Sample {
  const rows = an.activity.filter(r => r[4] >= 0.004);
  return t => {
    if (!rows.length) return null;
    let lo = 0, hi = rows.length - 1;
    if (t < rows[0][0] - 1) return null;
    while (hi - lo > 1) { const m = (lo + hi) >> 1; if (rows[m][0] <= t) lo = m; else hi = m; }
    const r = rows[hi][0] <= t ? rows[hi] : rows[lo];
    return t - r[0] > 3 ? null : [r[1] * srcW, r[2] * srcH];
  };
}

/** The speaker (or the most prominent face) with headroom: the window's centre sits a little under the face so the face is at 42 % of its height. */
function faceSampler(rows: TrackRow[], srcW: number, srcH: number, ch: number): Sample {
  if (!rows.length) return () => null;
  return t => { const [x, y] = trackAt(rows, t); return [x * srcW, y * srcH + 0.08 * ch]; };
}

/**
 * The window's path: it holds still while the target stays inside a dead
 * zone round its centre, glides to the target when it leaves it, and cuts
 * (no glide) at a scene cut, a speaker change or a pin. Output time, 0.1 s
 * steps, like the Screen Recorder's `followPath` — the engine moves the
 * crop from these rows.
 */
export function glidePath(sample: Sample, plan: Pick<ScreenPlan, 'region' | 'crop'>, keeps: [number, number][], o: { dead: number; tau: number; cuts: number[]; pins: [number, number, number][]; start: [number, number]; srcW: number; srcH: number }): [number, number, number][] {
  const [rx, ry, rw, rh] = plan.region, [cw, ch] = plan.crop;
  const cx0 = rx + cw / 2, cx1 = rx + rw - cw / 2, cy0 = ry + ch / 2, cy1 = ry + rh - ch / 2;
  const clampC = (x: number, y: number): [number, number] => [Math.min(cx1, Math.max(cx0, x)), Math.min(cy1, Math.max(cy0, y))];
  const total = keeps.reduce((n, [a, b]) => n + (b - a), 0);
  const out: [number, number, number][] = [];
  const k = 1 - Math.exp(-0.1 / o.tau);
  let c: [number, number] | null = null, target: [number, number] | null = null;
  let cutI = 0, lastSrc = -1;
  const cuts = [...o.cuts].sort((a, b) => a - b);
  for (let t = 0; t <= total + 1e-6 && out.length < 40_000; t += 0.1) {
    const s = toSource(t, keeps);
    /* A cut of the edit (the source time jumping) and a cut of the scene both cut the window. */
    let cut = lastSrc >= 0 && (s - lastSrc > 0.25 || s < lastSrc);
    while (cutI < cuts.length && cuts[cutI] <= s) { if (lastSrc >= 0 && cuts[cutI] > lastSrc) cut = true; cutI++; }
    lastSrc = s;
    const pin = o.pins.find(p => s >= p[0] && s < p[0] + 1.5);
    let p: [number, number] | null;
    if (pin) { p = clampC(pin[1] * o.srcW, pin[2] * o.srcH); if (s - pin[0] < 0.11) cut = true; }
    else { const f = sample(s); p = f ? clampC(f[0], f[1]) : null; }
    if (!c) { c = target = p ?? clampC(o.start[0], o.start[1]); }
    else if (p) {
      if (cut) { c = p; target = p; }
      else if (Math.abs(p[0] - c[0]) > cw * o.dead || Math.abs(p[1] - c[1]) > ch * o.dead || pin) target = p;
    }
    c = [c[0] + (target![0] - c[0]) * k, c[1] + (target![1] - c[1]) * k];
    out.push([r2(t), ev0(c[0] - cw / 2), ev0(c[1] - ch / 2)]);
  }
  return out;
}

/** The camera's box for a screencam band: the webcam picture, a little wider than the face, in the band's own shape. */
function camBoxFor(b: Person, srcW: number, srcH: number, outW: number, bandH: number): Box {
  return faceBox(b, srcW, srcH, outW / Math.max(1, bandH), 2.6);
}

/**
 * The plan for a Short: the region, the window, the camera band, the path
 * and the whole-picture stretches. Null when the strategy needs an
 * analysis this file does not have (the caller then crops as before).
 */
export function framePlan(r: Resolved, tf: TrackFile | null, srcW: number, srcH: number, outW: number, outH: number, keeps: [number, number][]): FramePlan | null {
  const an = tf?.analysis?.v === 2 ? tf.analysis : undefined;
  const region = regionOf(an, srcW, srcH);
  const total = keeps.reduce((n, [a, b]) => n + (b - a), 0);
  const src: [number, number] = [srcW, srcH], out: [number, number] = [outW, outH];
  const start: [number, number] = [r.focus.x * srcW, r.focus.y * srcH];
  const bubble = webcamBubble(tf);
  if (r.strategy === 'screencam' && !bubble) return null;
  const screencam = r.strategy === 'screencam' && bubble;
  const top = screencam ? ev(outH * r.share) : 0;
  const crop = windowFor(region, outW, outH - top, r.strategy === 'whole' ? 1 : r.zoom);
  const plan: FramePlan['plan'] = {
    kind: screencam ? 'screencam' : 'follow', region, cam: screencam ? camBoxFor(bubble, srcW, srcH, outW, top) : null, camAt: r.camAt, crop, top, src, out,
    ...(r.fitScreen ? { fitScreen: true } : {}),
  };
  const still = (): [number, number, number][] => {
    const [cw, ch] = crop;
    const x = Math.min(region[0] + region[2] - cw, Math.max(region[0], start[0] - cw / 2)), y = Math.min(region[1] + region[3] - ch, Math.max(region[1], start[1] - ch / 2));
    return [[0, ev0(x), ev0(y)]];
  };
  if (r.strategy === 'whole') return { plan, path: still(), wide: [[0, r2(total)]] };
  if (r.fitScreen) return { plan, path: still(), wide: [] };
  const cuts = an?.cuts ?? [];
  const common = { cuts, pins: r.pins, start, srcW, srcH };
  if (r.strategy === 'still') return { plan, path: r.pins.length ? glidePath(() => null, plan, keeps, { ...common, dead: 1, tau: 0.3 }) : still(), wide: [] };
  if (r.strategy === 'cursor' || r.strategy === 'screencam') {
    if (!an) return null;
    const cur = an.cursor.length ? cursorSampler(an, srcW, srcH) : activitySampler(an, srcW, srcH);
    const path = glidePath(cur, plan, keeps, { ...common, dead: 0.2, tau: 0.22 });
    /* Whole-screen moments where the pointer ranges wider than the window or rests: the same rule as the Screen Recorder's, on a meta built from the analysis. */
    const meta: Pick<ScreenMeta, 'path' | 'segs'> = {
      segs: [{ t: 0, layout: 'screen', screen: [region[0] / srcW, region[1] / srcH, region[2] / srcW, region[3] / srcH], cam: null, shape: 'square' }],
      path: an.cursor.map(c => [c[0], (c[1] * srcW - region[0]) / region[2], (c[2] * srcH - region[1]) / region[3]] as [number, number, number]),
    };
    const wide = an.cursor.length && !screencam ? wideSpans(meta, keeps, plan) : [];
    return { plan, path, wide };
  }
  if (r.strategy === 'speaker') {
    const rows = tf?.speaker?.length ? tf.speaker : tf?.face ?? [];
    if (!rows.length) return null;
    const path = glidePath(faceSampler(rows, srcW, srcH, crop[1]), plan, keeps, { ...common, cuts: [...cuts, ...rows.filter(x => x[4] === 1).map(x => x[0])], dead: 0.12, tau: 0.3 });
    return { plan, path, wide: [] };
  }
  /* content: the action, followed slowly. */
  if (!an) return null;
  const path = glidePath(activitySampler(an, srcW, srcH), plan, keeps, { ...common, dead: 0.3, tau: 0.8 });
  return { plan, path, wide: [] };
}

/** The window's centre at an output time, 0–1 of the frame — for the panel's readout and the focus marker. */
export function windowCentre(fp: FramePlan, t: number): [number, number] {
  const i = Math.min(fp.path.length - 1, Math.max(0, Math.floor(t / 0.1 + 1e-6)));
  const row = fp.path[i] ?? fp.path[0];
  const [cw, ch] = fp.plan.crop, [W, H] = fp.plan.src;
  return row ? [(row[1] + cw / 2) / W, (row[2] + ch / 2) / H] : [0.5, 0.5];
}
