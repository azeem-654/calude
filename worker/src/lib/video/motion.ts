/**
 * Movement in the render, worked out on the output's clock — pure, and
 * imported by the browser too, so the preview and the render agree.
 *
 *   cameraPath   where a crop should look, from the engine's face/speaker
 *                track (source time) through the edit (output time)
 *   cutTimes     where the jump cuts fall, for a flash or a dip
 *   punchSpans   the stretches zoomed in by a punch-in (every other sentence)
 *   overlayAss   words on screen as an ASS script, animated, re-timed
 *
 * Everything returns plain numbers; the engine turns them into filters it
 * owns, so nothing from a request becomes filter text.
 */
import type { Overlay, Sentence } from './edit';
import { toOutput, keptLength } from './edit';

/** One keyframe of a track: time, centre x, centre y, face height (all 0–1 of the frame), 1 where the shot cuts. */
export type TrackRow = [number, number, number, number, number];

export interface TrackFile {
  detector: string;
  fps: number;
  frames: number;
  /** Share of sampled frames with any face. */
  seen: number;
  /** Most faces in one frame. */
  faces: number;
  tracks: number;
  switches: { speaker: number; face: number };
  speaker: TrackRow[];
  face: TrackRow[];
}

/** The value of a track at a source time: the keyframe before it, eased towards the next unless the next is a cut. */
export function trackAt(rows: TrackRow[], t: number): [number, number] {
  if (!rows.length) return [0.5, 0.45];
  let lo = 0, hi = rows.length - 1;
  if (t <= rows[0][0]) return [rows[0][1], rows[0][2]];
  if (t >= rows[hi][0]) return [rows[hi][1], rows[hi][2]];
  while (hi - lo > 1) { const m = (lo + hi) >> 1; if (rows[m][0] <= t) lo = m; else hi = m; }
  const a = rows[lo], b = rows[hi];
  if (b[4] === 1) return [a[1], a[2]];
  const k = (t - a[0]) / Math.max(1e-6, b[0] - a[0]);
  return [a[1] + (b[1] - a[1]) * k, a[2] + (b[2] - a[2]) * k];
}

/**
 * Keyframes for the crop, in output time: [t, cx, cy, cut]. Inside each kept
 * stretch the track's own keyframes are carried across; at every jump cut a
 * keyframe marks a cut, because the picture jumped there anyway and easing
 * across it would drift.
 */
export function cameraPath(rows: TrackRow[], keeps: [number, number][]): [number, number, number, number][] {
  const out: [number, number, number, number][] = [];
  let acc = 0;
  for (const [a, b] of keeps) {
    const [x0, y0] = trackAt(rows, a);
    out.push([round(acc), round(x0), round(y0), 1]);
    for (const r of rows) {
      if (r[0] <= a || r[0] >= b) continue;
      out.push([round(acc + (r[0] - a)), r[1], r[2], r[4]]);
    }
    acc += b - a;
  }
  return out.slice(0, 40_000);
}

const round = (n: number) => Math.round(n * 1000) / 1000;

/** Output times where one kept stretch meets the next — the jump cuts. */
export function cutTimes(keeps: [number, number][]): number[] {
  const out: number[] = [];
  let acc = 0;
  for (let i = 0; i < keeps.length; i++) {
    if (i > 0) out.push(round(acc));
    acc += keeps[i][1] - keeps[i][0];
  }
  /* A flash on cuts a fifth of a second apart is a strobe, not a transition. */
  return out.filter((t, i, all) => i === 0 || t - all[i - 1] >= 0.6).slice(0, 4000);
}

/**
 * Punch-ins: every other sentence is shown zoomed in, the classic way a talk
 * is kept moving. Spans are output time, cut short where a sentence is cut.
 */
export function punchSpans(sentences: Pick<Sentence, 's' | 'e'>[], keeps: [number, number][]): [number, number][] {
  const total = keptLength(keeps);
  const starts: number[] = [];
  for (const s of sentences) {
    const o = firstKept(s.s, s.e, keeps);
    if (o !== null && (!starts.length || o - starts[starts.length - 1] >= 1.2)) starts.push(o);
  }
  const spans: [number, number][] = [];
  for (let i = 1; i < starts.length; i += 2) spans.push([round(starts[i]), round(starts[i + 1] ?? total)]);
  return spans.slice(0, 3000);
}

/** The output time of the first moment of [s, e] that survives the edit. */
function firstKept(s: number, e: number, keeps: [number, number][]): number | null {
  for (const [a, b] of keeps) {
    if (b <= s) continue;
    if (a >= e) return null;
    return toOutput(Math.max(a, s), keeps);
  }
  return null;
}

/** The output time of the last moment of [s, e] that survives the edit. */
function lastKept(s: number, e: number, keeps: [number, number][]): number | null {
  for (let i = keeps.length - 1; i >= 0; i--) {
    const [a, b] = keeps[i];
    if (a >= e) continue;
    if (b <= s) return null;
    return toOutput(Math.min(b, e), keeps);
  }
  return null;
}

/** An overlay's place in this output, or null when none of it is kept. */
export function overlaySpan(ov: Pick<Overlay, 's' | 'e'>, keeps: [number, number][]): [number, number] | null {
  const a = firstKept(ov.s, ov.e, keeps), b = lastKept(ov.s, ov.e, keeps);
  return a === null || b === null || b - a < 0.2 ? null : [a, b];
}

/* ── Words on screen ─────────────────────────────────────────────────────── */

const pad = (n: number) => String(n).padStart(2, '0');
function assTime(t: number): string {
  const cs = Math.max(0, Math.round(t * 100));
  return `${Math.floor(cs / 360000)}:${pad(Math.floor((cs % 360000) / 6000))}:${pad(Math.floor((cs % 6000) / 100))}.${pad(cs % 100)}`;
}
/** #rrggbb → ASS &HAABBGGRR. */
function assColour(hex: string, alpha = 0): string {
  const h = /^#[0-9a-f]{6}$/i.test(hex) ? hex.slice(1) : 'ffffff';
  return `&H${alpha.toString(16).padStart(2, '0').toUpperCase()}${h.slice(4, 6)}${h.slice(2, 4)}${h.slice(0, 2)}`.toUpperCase();
}
/** What was typed, never an override tag: braces and backslashes are made harmless. */
const safe = (s: string) => s.replace(/[{}]/g, m => (m === '{' ? '(' : ')')).replace(/\\/g, '/').replace(/[\r\n]+/g, ' ');

export function overlayAss(overlays: Overlay[], keeps: [number, number][], width: number, height: number, speed = 1): string {
  const m = Math.min(width, height);
  const sizes: Record<Overlay['style'], number> = { title: 0.085, lower: 0.05, cta: 0.058, label: 0.04, quote: 0.062 };
  const yFor = (p: Overlay['position']) => Math.round(height * (p === 'top' ? 0.13 : p === 'middle' ? 0.5 : height > width ? 0.66 : 0.8));
  const events: string[] = [];
  const styles: string[] = [];
  overlays.slice(0, 200).forEach((ov, i) => {
    const span = overlaySpan(ov, keeps);
    if (!span) return;
    const [a, b] = [span[0] / speed, span[1] / speed];
    const size = Math.round(m * sizes[ov.style]);
    const boxed = ov.style === 'lower' || ov.style === 'cta' || ov.style === 'label';
    const name = `O${i}`;
    /* Boxed styles draw an opaque box in the overlay's own colour (BorderStyle 3); the rest are bold with a thick dark outline. */
    styles.push(`Style: ${name},Noto Sans,${size},${assColour(ov.color)},${assColour(ov.bg)},${assColour(boxed ? ov.bg : '#000000')},${assColour(boxed ? ov.bg : '#000000', boxed ? 0 : 0x70)},-1,${ov.style === 'quote' ? -1 : 0},0,0,100,100,${ov.style === 'title' ? 1 : 0},0,${boxed ? 3 : 1},${boxed ? Math.round(size * 0.34) : Math.max(3, Math.round(size / 11))},${boxed ? 0 : Math.max(1, Math.round(size / 26))},5,0,0,0,1`);
    const left = ov.style === 'lower' || ov.style === 'label';
    const x = left ? Math.round(width * 0.06) : Math.round(width / 2);
    const y = ov.style === 'label' ? Math.round(height * 0.07) : yFor(ov.position);
    const an = left ? 4 : 5;
    const dur = Math.max(0.3, b - a);
    const ms = (s: number) => Math.round(s * 1000);
    const words = ov.style === 'quote' ? `“${safe(ov.text)}”` : safe(ov.text);
    let tags = `\\an${an}\\pos(${x},${y})`;
    switch (ov.anim) {
      case 'fade': tags += '\\fad(250,250)'; break;
      case 'pop': tags += `\\fscx60\\fscy60\\t(0,160,\\fscx110\\fscy110)\\t(160,260,\\fscx100\\fscy100)\\fad(100,180)`; break;
      case 'slide': tags = `\\an${an}\\move(${left ? -Math.round(width * 0.4) : x},${y + (left ? 0 : Math.round(height * 0.06))},${x},${y},0,${Math.min(320, ms(dur) / 2)})\\fad(120,200)`; break;
      case 'reveal': return events.push(`Dialogue: 1,${assTime(a)},${assTime(b)},${name},,0,0,0,,{${tags}\\fad(0,200)}{\\kf${Math.min(Math.round(dur * 60), 120)}}${words}`);
      default: break;
    }
    events.push(`Dialogue: 1,${assTime(a)},${assTime(b)},${name},,0,0,0,,{${tags}}${words}`);
  });
  if (!events.length) return '';
  return [
    '[Script Info]', 'ScriptType: v4.00+', `PlayResX: ${width}`, `PlayResY: ${height}`, 'WrapStyle: 0', 'ScaledBorderAndShadow: yes', '',
    '[V4+ Styles]',
    'Format: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding',
    ...styles, '',
    '[Events]', 'Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text',
    ...events, '',
  ].join('\n');
}

/**
 * The browser's preview of a look: CSS filters, close to what the engine's
 * FFmpeg filters do, never presented as exact.
 */
export function cssLook(l: { filter: string; temperature: number; tint: number; brightness: number; contrast: number; saturation: number; exposure: number; hue: number; blur: number; sharpness: number }): string {
  const P: Record<string, string> = {
    vivid: 'saturate(1.35) contrast(1.08)', warm: 'sepia(0.22) saturate(1.15)', cool: 'hue-rotate(-12deg) saturate(1.05) brightness(1.02)',
    cinematic: 'contrast(1.12) saturate(0.82) sepia(0.12) hue-rotate(-8deg)', bw: 'grayscale(1) contrast(1.12)', vintage: 'sepia(0.45) contrast(0.92) saturate(0.85)',
    punchy: 'contrast(1.22) saturate(1.25)', soft: 'contrast(0.9) brightness(1.05) saturate(0.95)', food: 'sepia(0.15) saturate(1.3) contrast(1.05)',
  };
  const parts = [P[l.filter] ?? ''];
  const bright = 1 + l.brightness / 250 + l.exposure / 200;
  if (bright !== 1) parts.push(`brightness(${bright.toFixed(3)})`);
  if (l.contrast) parts.push(`contrast(${(1 + l.contrast / 150).toFixed(3)})`);
  if (l.saturation) parts.push(`saturate(${Math.max(0, 1 + l.saturation / 100).toFixed(3)})`);
  if (l.temperature > 0) parts.push(`sepia(${(l.temperature / 300).toFixed(3)})`);
  if (l.temperature < 0) parts.push(`hue-rotate(${(l.temperature / 8).toFixed(1)}deg)`);
  if (l.tint) parts.push(`hue-rotate(${(l.tint / 10).toFixed(1)}deg)`);
  if (l.hue) parts.push(`hue-rotate(${l.hue}deg)`);
  if (l.blur) parts.push(`blur(${(l.blur / 25).toFixed(2)}px)`);
  return parts.filter(Boolean).join(' ') || 'none';
}
