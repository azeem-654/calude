/**
 * Shorts layouts from the face track — which layouts a recording can carry,
 * and the boxes each one is cut from. Pure, imported by the browser too, so
 * the picker offers exactly what the engine will render and the preview draws
 * the same boxes.
 *
 * What the track can tell (media/engine/track.py `people`): where each person
 * sits, how big their face is, and in what share of the frames. From that:
 *   - a screen recording with a webcam bubble — one face, small, off in a
 *     corner or along an edge — can be split (screen above, camera below) or
 *     shown picture-in-picture;
 *   - two people seen most of the time, apart — one above the other;
 *   - any face at all — the speaker, followed.
 * Where it cannot, the option says why instead of being offered.
 *
 * Every box is numbers in source pixels; the engine builds its crop / scale /
 * vstack / overlay graph from them and from nothing else.
 */
import type { ShortLayout } from './edit';
import type { TrackFile } from './motion';

export interface Person { cx: number; cy: number; w: number; h: number; share: number }
export interface LayoutOption { key: ShortLayout; ok: boolean; why: string; label: string }
export type Box = [number, number, number, number];

export const LAYOUT_LABEL: Record<ShortLayout, string> = {
  speaker: 'Speaker (tracked)', screen: 'Screen only', split: 'Split: screen + camera', two: 'Split: both people', pip: 'Picture in picture',
};

const peopleOf = (tf: TrackFile | null): Person[] => (tf?.people ?? []).filter(p => p.share >= 0.15).sort((a, b) => b.share - a.share);

/** One face, small, near an edge, most of the time: a webcam bubble over a screen. */
export function webcamBubble(tf: TrackFile | null): Person | null {
  const ps = peopleOf(tf);
  if (ps.length !== 1) return null;
  const p = ps[0];
  const edge = Math.max(Math.abs(p.cx - 0.5), Math.abs(p.cy - 0.5));
  return p.share >= 0.4 && p.h <= 0.22 && edge >= 0.26 ? p : null;
}

/** Two people, each in a good share of the frames, side by side or apart. */
export function twoPeople(tf: TrackFile | null): [Person, Person] | null {
  const ps = peopleOf(tf).filter(p => p.share >= 0.25);
  if (ps.length < 2) return null;
  const [a, b] = ps;
  if (Math.hypot(a.cx - b.cx, a.cy - b.cy) < 0.18) return null;
  /* The one on the left (or higher) goes on top. */
  return (a.cx - b.cx || a.cy - b.cy) <= 0 ? [a, b] : [b, a];
}

export function layoutOptions(tf: TrackFile | null): LayoutOption[] {
  const found = !!tf;
  const ps = peopleOf(tf);
  const faces = (tf?.faces ?? 0) > 0 && (tf?.seen ?? 0) >= 0.1;
  const bubble = webcamBubble(tf), two = twoPeople(tf);
  const noTrack = 'Find faces first (Tracking tab) — the layout is worked out from where the faces are.';
  return [
    { key: 'speaker', label: LAYOUT_LABEL.speaker, ok: faces, why: !found ? noTrack : faces ? '' : 'No face was found to follow.' },
    { key: 'screen', label: LAYOUT_LABEL.screen, ok: true, why: '' },
    { key: 'split', label: LAYOUT_LABEL.split, ok: !!bubble, why: !found ? noTrack : bubble ? '' : ps.length > 1 ? 'There are two people here, not a screen with a webcam.' : ps.length ? 'Needs a screen recording with a small webcam picture in a corner; the face here is the main picture.' : 'No webcam face was found.' },
    { key: 'two', label: LAYOUT_LABEL.two, ok: !!two, why: !found ? noTrack : two ? '' : ps.length === 1 ? 'Only one person was found.' : 'Needs two people on screen most of the time.' },
    { key: 'pip', label: LAYOUT_LABEL.pip, ok: !!bubble, why: !found ? noTrack : bubble ? '' : 'Needs a screen recording with a small webcam picture in a corner.' },
  ];
}

const ev = (n: number) => Math.max(2, Math.round(n / 2) * 2);

/**
 * A crop around a face with the shape `aspect` (w / h): the face a little
 * above the middle, the box about `zoom` faces tall, inside the frame.
 */
export function faceBox(p: Person, srcW: number, srcH: number, aspect: number, zoom = 2.8): Box {
  let h = Math.min(srcH, Math.max(p.h * srcH * zoom, srcH * 0.2));
  let w = h * aspect;
  if (w > srcW) { w = srcW; h = w / aspect; }
  w = ev(w); h = ev(h);
  const x = Math.round(Math.min(srcW - w, Math.max(0, p.cx * srcW - w / 2)));
  const y = Math.round(Math.min(srcH - h, Math.max(0, p.cy * srcH - h * 0.42)));
  return [x, y, w, h];
}

export interface LayoutPlan {
  kind: 'split' | 'two' | 'pip';
  /** split / two: the top and the bottom box, each filling half the frame. pip: the camera box. */
  boxes: Box[];
  /** pip only: where the bubble goes on the output, and its size (px). */
  inset?: { x: number; y: number; size: number };
  /** The recording's and the output's sizes the boxes were worked out for (the preview scales by them). */
  src: [number, number];
  out: [number, number];
}

/** The boxes a layout is cut from, or null when this recording cannot carry it. */
export function layoutPlan(kind: ShortLayout, tf: TrackFile | null, srcW: number, srcH: number, outW: number, outH: number): LayoutPlan | null {
  const half = outW / (outH / 2);
  const dims = { src: [srcW, srcH] as [number, number], out: [outW, outH] as [number, number] };
  if (kind === 'split') {
    const b = webcamBubble(tf);
    return b ? { kind, boxes: [[0, 0, srcW, srcH], faceBox(b, srcW, srcH, half, 2.6)], ...dims } : null;
  }
  if (kind === 'two') {
    const t = twoPeople(tf);
    return t ? { kind, boxes: [faceBox(t[0], srcW, srcH, half), faceBox(t[1], srcW, srcH, half)], ...dims } : null;
  }
  if (kind === 'pip') {
    const b = webcamBubble(tf);
    if (!b) return null;
    const size = ev(outW * 0.38), m = Math.round(outW * 0.05);
    /* The bubble goes on the side the webcam was on, low enough to clear the captions' usual place above it. */
    const x = b.cx >= 0.5 ? outW - size - m : m;
    const y = Math.round(outH * 0.62);
    return { kind, boxes: [faceBox(b, srcW, srcH, 1, 2.4)], inset: { x, y, size }, ...dims };
  }
  return null;
}
