/**
 * The pointer in a screen recording — where it went, which moments deserve
 * to be followed, and how a render follows it. Pure and imported by the
 * browser too, so the editor's preview, the timeline and the render read the
 * same numbers.
 *
 * Where the pointer was comes from the Screen Recorder (recorder.ts
 * `PointerLog`): while recording, the shared screen is read a few times a
 * second at a small size and the pointer is found as the small thing that
 * moves; a click is the pointer coming to rest and the screen answering
 * under it. A browser is never told where the pointer is over other windows,
 * so this is read from the picture — close, not exact — and nothing here
 * zooms while recording: the person picks (or we propose) the moments
 * afterwards, which is what the owner asked for.
 *
 *   ScreenMeta      what the recorder saw: the layout over time (where the
 *                   screen and the camera were drawn), the pointer's path
 *                   and its likely clicks — stored as prep/screen.json
 *   autoFocus       the moments worth following, read from what was said
 *                   (words like "click", "this button", "go to settings")
 *                   together with where the pointer clicked
 *   zoomPlan/At     the long video zooming in on the pointer inside those
 *                   moments (the engine builds the same curve as a zoompan
 *                   expression from these numbers)
 *   screenPlan,
 *   followPath      a Short of a screen recording: the camera in the top
 *                   third (when there was one) and the screen below — or the
 *                   whole height — cropped round the pointer, following it
 *   pointerAss      the pointer drawn over the video (ring, spotlight, a big
 *                   arrow or hand, a dot) with a ripple at each click
 *   sfxEvents       click sounds, and a celebration or an error sound where
 *                   the words say so
 *
 * Everything returns plain numbers or an ASS script built only from numbers
 * and fixed shapes; the engine owns every filter.
 *
 * Self-contained on purpose (type imports only): edit.ts imports this file,
 * and a value import back would be a cycle.
 */
import type { Sentence } from './edit';

/* ── What the recorder saw ───────────────────────────────────────────────── */

/** A box as fractions (0–1) of the recorded frame: x, y, width, height. */
export type NBox = [number, number, number, number];
export type CamShape = 'circle' | 'square' | 'rounded';
/** From `t` (seconds of the recording, pauses left out) on: where the shared screen and the camera were drawn. */
export interface ScreenSeg { t: number; layout: string; screen: NBox | null; cam: NBox | null; shape: CamShape }
export interface ScreenMeta {
  v: 1;
  /** The recorded frame, px. */
  w: number; h: number;
  /** Seconds recorded. */
  dur: number;
  segs: ScreenSeg[];
  /** [t, x, y] — x/y as 0–1 of the shared screen's own picture (not the frame); sampled while it moves. */
  path: [number, number, number][];
  /** Likely clicks, [t, x, y] as above. */
  clicks: [number, number, number][];
  /** How the pointer was found: read from the picture. */
  how: 'picture';
}
/** What the project keeps about it (extras.screen): where the file is and what it holds. */
export interface ScreenRef { key: string; cam: boolean; at: string; moves: number; clicks: number; dur: number }

const num = (v: unknown, lo: number, hi: number, d: number) => { const x = Number(v); return Number.isFinite(x) ? Math.min(hi, Math.max(lo, x)) : d; };
const r3 = (n: number) => Math.round(n * 1000) / 1000;
const r2 = (n: number) => Math.round(n * 100) / 100;

function cleanBox(b: unknown): NBox | null {
  if (!Array.isArray(b) || b.length !== 4) return null;
  const [x, y, w, h] = b.map(v => num(v, 0, 1, NaN));
  if (![x, y, w, h].every(Number.isFinite) || w < 0.02 || h < 0.02 || x + w > 1.001 || y + h > 1.001) return null;
  return [r3(x), r3(y), r3(w), r3(h)];
}

/**
 * The recorder's file, checked field by field: anything malformed is
 * dropped, times are kept inside the recording and in order, and the lists
 * are capped (an hour at eight looks a second while moving is ~29k points).
 */
export function cleanScreenMeta(raw: unknown, maxDur = 4 * 3600): ScreenMeta | null {
  if (!raw || typeof raw !== 'object') return null;
  const o = raw as Record<string, unknown>;
  const w = Math.round(num(o.w, 16, 8192, NaN)), h = Math.round(num(o.h, 16, 8192, NaN));
  const dur = num(o.dur, 0, maxDur, NaN);
  if (!Number.isFinite(w) || !Number.isFinite(h) || !Number.isFinite(dur) || dur < 0.5) return null;
  const segs: ScreenSeg[] = (Array.isArray(o.segs) ? o.segs : []).slice(0, 500).map(s => {
    const x = (s && typeof s === 'object' ? s : {}) as Record<string, unknown>;
    return {
      t: r2(num(x.t, 0, dur, 0)),
      layout: String(x.layout ?? '').replace(/[^a-z-]/g, '').slice(0, 20) || 'bubble',
      screen: cleanBox(x.screen), cam: cleanBox(x.cam),
      shape: (['circle', 'square', 'rounded'] as CamShape[]).includes(x.shape as CamShape) ? x.shape as CamShape : 'circle',
    };
  }).filter(s => s.screen || s.cam).sort((a, b) => a.t - b.t);
  const pts = (v: unknown, cap: number): [number, number, number][] => (Array.isArray(v) ? v : []).slice(0, cap)
    /* A point after the recording ended is not clamped onto its last moment: it is dropped. */
    .map(p => Array.isArray(p) && Number(p[0]) <= dur + 0.5 ? [r2(num(p[0], 0, dur, NaN)), r3(num(p[1], 0, 1, NaN)), r3(num(p[2], 0, 1, NaN))] as [number, number, number] : null)
    .filter((p): p is [number, number, number] => !!p && p.every(Number.isFinite))
    .sort((a, b) => a[0] - b[0]);
  if (!segs.length) return null;
  return { v: 1, w, h, dur: r2(dur), segs, path: pts(o.path, 60_000), clicks: pts(o.clicks, 5_000), how: 'picture' };
}

/** The layout in force at `t` (the last one that started by then). */
export function segAt(m: Pick<ScreenMeta, 'segs'>, t: number): ScreenSeg | null {
  let cur: ScreenSeg | null = m.segs[0] ?? null;
  for (const s of m.segs) { if (s.t <= t) cur = s; else break; }
  return cur;
}

/** Where the pointer was at `t`, 0–1 of the screen: between two samples close together it is eased, otherwise it stays where it was last seen. */
export function pointerAt(m: Pick<ScreenMeta, 'path'>, t: number): [number, number] | null {
  const p = m.path;
  if (!p.length) return null;
  if (t <= p[0][0]) return [p[0][1], p[0][2]];
  let lo = 0, hi = p.length - 1;
  if (t >= p[hi][0]) return [p[hi][1], p[hi][2]];
  while (hi - lo > 1) { const mid = (lo + hi) >> 1; if (p[mid][0] <= t) lo = mid; else hi = mid; }
  const a = p[lo], b = p[hi];
  if (b[0] - a[0] > 0.6) return [a[1], a[2]];
  const k = (t - a[0]) / Math.max(1e-6, b[0] - a[0]);
  return [a[1] + (b[1] - a[1]) * k, a[2] + (b[2] - a[2]) * k];
}

/** The pointer at `t` as 0–1 of the whole recorded frame, or null where no screen was shown. */
export function pointerInFrame(m: Pick<ScreenMeta, 'path' | 'segs'>, t: number): [number, number] | null {
  const s = segAt(m, t), p = pointerAt(m, t);
  if (!s?.screen || !p) return null;
  const [x, y, w, h] = s.screen;
  return [x + p[0] * w, y + p[1] * h];
}

/* ── The settings, kept on the edit (doc.pointer) ─────────────────────────── */

export const CURSOR_STYLES = ['auto', 'ring', 'spotlight', 'arrow', 'hand', 'dot', 'none'] as const;
export type CursorStyle = typeof CURSOR_STYLES[number];
export type DrawnCursor = Exclude<CursorStyle, 'auto'>;
export const CURSOR_LABEL: Record<CursorStyle, string> = {
  auto: 'Chosen for each moment', ring: 'Highlight ring', spotlight: 'Spotlight', arrow: 'Big arrow', hand: 'Pointing hand', dot: 'Soft dot', none: 'Nothing drawn',
};
export const CLICK_SOUNDS = ['none', 'click', 'soft', 'pop'] as const;
export type ClickSound = typeof CLICK_SOUNDS[number];
export const SOUND_LABEL: Record<ClickSound | 'celebrate' | 'error', string> = { none: 'No sound', click: 'Mouse click', soft: 'Soft tap', pop: 'Pop', celebrate: 'Celebration', error: 'Error buzz' };
export type Moment = 'auto' | 'none' | 'celebrate' | 'error';

/** A stretch of the recording (source time) where the video follows the pointer. */
export interface FocusRange {
  id: string; s: number; e: number;
  by: 'auto' | 'you';
  /** Why it was picked, in words (auto), or '' (yours). */
  why: string;
  /** The pointer drawn here; 'auto' takes it from what is said. */
  cursor: CursorStyle;
  /** A sound at its last click: 'auto' takes it from what is said. */
  moment: Moment;
}
export interface PointerSettings {
  /** Follow the pointer in the moments below at all. */
  on: boolean;
  /** The moments were proposed once (so a re-run of the analysis never overwrites the customer's). */
  ran: boolean;
  /** How close the long video goes, 1.3–2.6×. */
  zoom: number;
  cursor: CursorStyle;
  /** The drawn pointer's size, 0.6–2. */
  size: number;
  color: string;
  click: ClickSound;
  /** Celebration and error sounds where the words say so. */
  moments: boolean;
  /** Sound effects' volume, 0–1. */
  volume: number;
  /** Where it applies: the long video, the Shorts. */
  long: boolean;
  shorts: boolean;
  focus: FocusRange[];
  /** How readily a moment is picked (autoFocus): low — only the clearest; high — any click or pointer work while you talk about the screen. */
  sensitivity?: Sensitivity;
}
export type Sensitivity = 'low' | 'normal' | 'high';
export const POINTER_DEFAULT: PointerSettings = {
  on: true, ran: false, zoom: 1.8, cursor: 'auto', size: 1, color: '#facc15', click: 'none', moments: false, volume: 0.6, long: true, shorts: true, focus: [], sensitivity: 'high',
};
export const pointerOf = (doc: { pointer?: Partial<PointerSettings> | null }): PointerSettings => ({ ...POINTER_DEFAULT, ...(doc.pointer ?? {}), focus: doc.pointer?.focus ?? [] });

const HEX = /^#[0-9a-f]{6}$/i;
let seq = 0;
const fid = () => `pf${Date.now().toString(36)}${(seq++ % 1296).toString(36).padStart(2, '0')}${Math.random().toString(36).slice(2, 5)}`;

/** Ranges in order, none overlapping (overlaps merged, the earlier one's settings kept), inside the recording, at most 200. */
export function cleanFocus(list: unknown, duration: number): FocusRange[] {
  const rows = (Array.isArray(list) ? list : []).slice(0, 400).map(x => {
    const o = (x && typeof x === 'object' ? x : {}) as Record<string, unknown>;
    const s = num(o.s, 0, duration, NaN), e = num(o.e, 0, duration, NaN);
    if (!Number.isFinite(s) || !Number.isFinite(e) || e - s < 0.5) return null;
    return {
      id: typeof o.id === 'string' && /^[a-z0-9]{4,40}$/i.test(o.id) ? o.id : fid(), s: r2(s), e: r2(e),
      by: o.by === 'auto' ? 'auto' as const : 'you' as const,
      why: String(o.why ?? '').replace(/[\u0000-\u001f]/g, ' ').trim().slice(0, 160),
      cursor: (CURSOR_STYLES as readonly string[]).includes(o.cursor as string) ? o.cursor as CursorStyle : 'auto',
      moment: (['auto', 'none', 'celebrate', 'error'] as Moment[]).includes(o.moment as Moment) ? o.moment as Moment : 'auto',
    };
  }).filter((r): r is FocusRange => !!r).sort((a, b) => a.s - b.s);
  const out: FocusRange[] = [];
  for (const r of rows) { const last = out[out.length - 1]; if (last && r.s <= last.e) last.e = Math.max(last.e, r.e); else out.push({ ...r }); }
  return out.slice(0, 200);
}

export type PointerOp =
  | { op: 'pointer.set'; patch: Partial<Omit<PointerSettings, 'focus' | 'ran'>> }
  | { op: 'pointer.focus.add'; s: number; e: number; cursor?: CursorStyle }
  | { op: 'pointer.focus.removeRange'; s: number; e: number }
  | { op: 'pointer.focus.remove'; id: string }
  | { op: 'pointer.focus.update'; id: string; patch: { s?: number; e?: number; cursor?: CursorStyle; moment?: Moment } }
  | { op: 'pointer.focus.set'; list: Partial<FocusRange>[] };

/** One pointer operation on the settings; a refusal is a sentence. Called by edit.ts `applyOps`. */
export function applyPointerOp(cur: PointerSettings | undefined | null, o: PointerOp, duration: number): { next: PointerSettings; refused?: string } {
  const p: PointerSettings = { ...POINTER_DEFAULT, ...(cur ?? {}), focus: [...(cur?.focus ?? [])] };
  switch (o.op) {
    case 'pointer.set': {
      const x = o.patch ?? {};
      if (typeof x.on === 'boolean') p.on = x.on;
      if (x.zoom !== undefined) p.zoom = r2(num(x.zoom, 1.3, 2.6, p.zoom));
      if ((CURSOR_STYLES as readonly string[]).includes(x.cursor as string)) p.cursor = x.cursor as CursorStyle;
      if (x.size !== undefined) p.size = r2(num(x.size, 0.6, 2, p.size));
      if (typeof x.color === 'string' && HEX.test(x.color)) p.color = x.color.toLowerCase();
      if ((CLICK_SOUNDS as readonly string[]).includes(x.click as string)) p.click = x.click as ClickSound;
      if (typeof x.moments === 'boolean') p.moments = x.moments;
      if (x.volume !== undefined) p.volume = r2(num(x.volume, 0, 1, p.volume));
      if (typeof x.long === 'boolean') p.long = x.long;
      if (typeof x.shorts === 'boolean') p.shorts = x.shorts;
      if (x.sensitivity === 'low' || x.sensitivity === 'normal' || x.sensitivity === 'high') p.sensitivity = x.sensitivity;
      return { next: p };
    }
    case 'pointer.focus.add': {
      const s = num(o.s, 0, duration, NaN), e = num(o.e, 0, duration, NaN);
      if (!Number.isFinite(s) || !Number.isFinite(e) || e - s < 0.5) return { next: p, refused: 'a stretch to follow the pointer needs at least half a second' };
      p.focus = cleanFocus([...p.focus, { s, e, by: 'you', why: '', cursor: o.cursor ?? 'auto', moment: 'auto' }], duration);
      return { next: p };
    }
    case 'pointer.focus.removeRange': {
      const s = num(o.s, 0, duration, NaN), e = num(o.e, 0, duration, NaN);
      if (!Number.isFinite(s) || !Number.isFinite(e) || e <= s) return { next: p, refused: 'nothing to stop following' };
      const next: FocusRange[] = [];
      for (const r of p.focus) {
        if (r.e <= s || r.s >= e) { next.push(r); continue; }
        if (r.s < s - 0.5) next.push({ ...r, e: r2(s) });
        if (r.e > e + 0.5) next.push({ ...r, id: fid(), s: r2(e) });
      }
      p.focus = next;
      return { next: p };
    }
    case 'pointer.focus.remove': p.focus = p.focus.filter(r => r.id !== o.id); return { next: p };
    case 'pointer.focus.update': {
      const r = p.focus.find(x => x.id === o.id);
      if (!r) return { next: p, refused: 'no such stretch' };
      const x = o.patch ?? {};
      const s = x.s !== undefined ? num(x.s, 0, duration, r.s) : r.s, e = x.e !== undefined ? num(x.e, 0, duration, r.e) : r.e;
      if (e - s < 0.5) return { next: p, refused: 'a stretch to follow the pointer needs at least half a second' };
      Object.assign(r, { s: r2(s), e: r2(e) });
      if ((CURSOR_STYLES as readonly string[]).includes(x.cursor as string)) r.cursor = x.cursor as CursorStyle;
      if ((['auto', 'none', 'celebrate', 'error'] as Moment[]).includes(x.moment as Moment)) r.moment = x.moment as Moment;
      p.focus = cleanFocus(p.focus, duration);
      return { next: p };
    }
    case 'pointer.focus.set':
      p.focus = cleanFocus(o.list, duration);
      p.ran = true;
      return { next: p };
  }
  return { next: p, refused: 'unknown pointer change' };
}

/* ── Which moments to follow: the words and the clicks together ──────────── */

const ACTION = /\b(click(?:ing|ed|s)?|tap|press|select|choose|pick|open|show|check|find|enable|disable|edit|update|change|publish|share|send|install|log ?in|sign ?in|login|page|screen|window|panel|form|card|zoom|go(?:ing)? (?:to|into|over)|head (?:to|over)|navigate|type|enter|fill(?: in| out)?|drag|drop|scroll|hover|toggle|switch|turn (?:on|off)|save|submit|upload|download|add|create|set up|setup|configure|connect|paste|copy|delete|remove|search|button|menu|tab|field|link|icon|settings|dashboard|option|dropdown|checkbox|sidebar|toolbar)\b/gi;
const POINTING = /\b(right here|over here|up here|down here|this (?:one|button|link|box|field|menu|tab|icon|option|page|section|part)|you can see|notice|look at|watch (?:this|how)|as you can see)\b/gi;

/** The pointer that suits what is being said: a hand for pressing, a ring for typing, a spotlight for looking. */
export function cursorFor(text: string): DrawnCursor {
  const t = text.toLowerCase();
  if (/\b(click|tap|press|button|link|select|choose|pick|open)\b/.test(t)) return 'hand';
  if (/\b(type|typing|enter|fill|write|paste|field|box|search)\b/.test(t)) return 'ring';
  if (/\b(notice|look|see|watch|important|here)\b/.test(t)) return 'spotlight';
  return 'arrow';
}

/** A success said out loud gets a celebration; an error, a buzz; anything else, nothing. */
export function momentFor(text: string): 'celebrate' | 'error' | null {
  const t = text.toLowerCase();
  if (/\b(error|wrong|fail(?:ed|s|ure)?|oops|mistake|warning|invalid|broken|doesn'?t work|not working)\b/.test(t)) return 'error';
  if (/\b(done|that'?s it|success(?:ful(?:ly)?)?|congrat\w*|perfect|awesome|it works|working now|published|live now|finished|nailed it|there we go|and voil[aà])\b/.test(t)) return 'celebrate';
  return null;
}

const travel = (m: Pick<ScreenMeta, 'path'>, s: number, e: number) => {
  let d = 0, prev: [number, number, number] | null = null;
  for (const p of m.path) {
    if (p[0] < s) { prev = p; continue; }
    if (p[0] > e) break;
    if (prev) d += Math.hypot(p[1] - prev[1], p[2] - prev[2]);
    prev = p;
  }
  return d;
};

/**
 * The moments worth following — only the major ones. A sentence earns it
 * when it talks about doing something on screen ("click", "go to settings",
 * "this button") *and* the pointer acted while it was said (clicked, or
 * travelled); neighbours are merged, padded so the move into the moment is
 * seen, and only the strongest are kept — about one and a half a minute.
 * With no transcript, the clicks alone mark them, and the reason says so.
 */
/**
 * How readily a sentence becomes a moment. Normal is the rule above. High
 * (the default since the owner found moments missed) also takes a sentence
 * about the screen with any pointer work under it, and a click said nothing
 * about, and keeps about three a minute; low keeps only the clearest.
 */
const SENSE: Record<Sensitivity, { per: number; did: number; sum: number; pad: number; alone: boolean }> = {
  low: { per: 0.8, did: 2, sum: 5, pad: 0.4, alone: false },
  normal: { per: 1.5, did: 2, sum: 4, pad: 0.4, alone: false },
  high: { per: 3, did: 1, sum: 2, pad: 0.8, alone: true },
};

export function autoFocus(m: Pick<ScreenMeta, 'path' | 'clicks' | 'dur'>, sentences: Pick<Sentence, 's' | 'e' | 'text'>[], duration: number, sensitivity: Sensitivity = 'normal'): FocusRange[] {
  const dur = Math.max(1, duration || m.dur);
  const T = SENSE[sensitivity] ?? SENSE.normal;
  const cap = Math.min(80, Math.max(2, Math.round(dur / 60 * T.per)));
  type Pick_ = { s: number; e: number; score: number; text: string; clicks: number; words: string[] };
  const picks: Pick_[] = [];
  if (sentences.length) {
    for (const st of sentences) {
      const clicks = m.clicks.filter(c => c[0] >= st.s - T.pad && c[0] <= st.e + T.pad).length;
      const moved = travel(m, st.s, st.e);
      const acts = [...st.text.matchAll(ACTION)].map(x => x[0].toLowerCase());
      const points = [...st.text.matchAll(POINTING)].length;
      const said = Math.min(3, acts.length) + Math.min(2, points * 2);
      const did = Math.min(4, clicks * 2) + (moved > 0.08 ? 1 : 0) + (moved > 0.25 ? 1 : 0);
      if (did >= T.did && said + did >= T.sum && (said >= 1 || (T.alone && clicks >= 1))) picks.push({ s: st.s, e: st.e, score: said + did, text: st.text, clicks, words: [...new Set(acts)].slice(0, 2) });
    }
  } else {
    for (const c of m.clicks) picks.push({ s: c[0] - 1.5, e: c[0] + 2, score: 2, text: '', clicks: 1, words: [] });
  }
  /* Neighbours within a breath of each other are one moment. */
  const merged: Pick_[] = [];
  for (const p of picks.sort((a, b) => a.s - b.s)) {
    const last = merged[merged.length - 1];
    if (last && p.s - last.e < 1.2) { last.e = Math.max(last.e, p.e); last.score += p.score; last.clicks += p.clicks; last.text = `${last.text} ${p.text}`.trim(); last.words = [...new Set([...last.words, ...p.words])].slice(0, 2); }
    else merged.push({ ...p });
  }
  const best = merged.sort((a, b) => b.score - a.score).slice(0, cap).sort((a, b) => a.s - b.s);
  return cleanFocus(best.map(p => {
    const s = Math.max(0, p.s - 0.4);
    let e = Math.min(dur, p.e + 0.6);
    if (e - s < 2.5) e = Math.min(dur, s + 2.5);
    if (e - s > 25) e = s + 25;
    const said = p.words.length ? `You said “${p.words.join('”, “')}”` : '';
    const clicked = p.clicks ? `${p.clicks} click${p.clicks === 1 ? '' : 's'}` : 'the pointer moving';
    return {
      s, e, by: 'auto' as const,
      why: sentences.length ? `${said}${said ? ' with ' : ''}${clicked}` : `${clicked} (no transcript to read)`,
      cursor: p.text ? cursorFor(p.text) : 'ring' as CursorStyle,
      moment: (p.text ? momentFor(p.text) : null) ?? 'none' as Moment,
    };
  }), dur);
}

/** A range's pointer, with 'auto' taken from the words said inside it. */
export function resolveCursor(r: Pick<FocusRange, 's' | 'e' | 'cursor'>, global: CursorStyle, sentences: Pick<Sentence, 's' | 'e' | 'text'>[]): DrawnCursor {
  if (global !== 'auto') return global;
  if (r.cursor !== 'auto') return r.cursor;
  return cursorFor(sentences.filter(x => x.e > r.s && x.s < r.e).map(x => x.text).join(' '));
}
export function resolveMoment(r: Pick<FocusRange, 's' | 'e' | 'moment'>, sentences: Pick<Sentence, 's' | 'e' | 'text'>[]): 'celebrate' | 'error' | null {
  if (r.moment === 'none') return null;
  if (r.moment !== 'auto') return r.moment;
  return momentFor(sentences.filter(x => x.e > r.s && x.s < r.e).map(x => x.text).join(' '));
}

/* ── Clocks: source time ↔ output time ───────────────────────────────────── */

function toOut(t: number, keeps: [number, number][]): number | null {
  let acc = 0;
  for (const [a, b] of keeps) { if (t < a) return null; if (t <= b) return acc + (t - a); acc += b - a; }
  return null;
}
function toSrc(t: number, keeps: [number, number][]): number {
  let acc = 0;
  for (const [a, b] of keeps) { if (t <= acc + (b - a)) return a + (t - acc); acc += b - a; }
  return keeps.length ? keeps[keeps.length - 1][1] : 0;
}
/** A source stretch's place in an output: from its first kept moment to its last, or null when nothing of it survives. */
export function outSpan(s: number, e: number, keeps: [number, number][]): [number, number] | null {
  let a: number | null = null, b: number | null = null;
  for (const [x, y] of keeps) {
    if (y <= s || x >= e) continue;
    if (a === null) a = toOut(Math.max(x, s), keeps);
    b = toOut(Math.min(y, e), keeps);
  }
  return a === null || b === null || b - a < 0.3 ? null : [a, b];
}

export interface Window { a: number; b: number; range: FocusRange }
/** The moments as output-time windows; two closer than a second are one, so the picture does not bob out and back in. */
export function focusWindows(focus: FocusRange[], keeps: [number, number][]): Window[] {
  const out: Window[] = [];
  for (const r of focus) {
    const sp = outSpan(r.s, r.e, keeps);
    if (!sp) continue;
    const last = out[out.length - 1];
    if (last && sp[0] - last.b < 1) last.b = Math.max(last.b, sp[1]);
    else out.push({ a: sp[0], b: sp[1], range: r });
  }
  return out;
}

/* ── The long video: zooming in on the pointer ───────────────────────────── */

/** How long the zoom takes to go in and come out, s. */
export const RAMP = 0.45;
export interface ZoomPlan {
  z: number; ramp: number; w: number; h: number;
  /** Output time, before any speed change. */
  windows: [number, number][];
  /** [t, cx, cy]: the centre of the view, in output pixels, every `step` seconds inside the windows. */
  keys: [number, number, number][];
}

/**
 * Where the view looks inside each window: at the pointer, but it only moves
 * when the pointer leaves the middle of the view, and then glides — a view
 * glued to every twitch of the pointer is unwatchable. `map` turns a point of
 * the recorded frame (0–1) into output pixels.
 */
export function zoomPlan(m: Pick<ScreenMeta, 'path' | 'segs'>, keeps: [number, number][], windows: Window[], zoom: number, W: number, H: number,
  map: (fx: number, fy: number) => [number, number] | null): ZoomPlan {
  const z = num(zoom, 1.3, 2.6, 1.8);
  const total = windows.reduce((n, w) => n + (w.b - w.a), 0);
  const step = Math.max(0.2, total / 3000);
  const keys: [number, number, number][] = [];
  const hw = W / (2 * z), hh = H / (2 * z);
  const clampX = (x: number) => Math.min(W - hw, Math.max(hw, x)), clampY = (y: number) => Math.min(H - hh, Math.max(hh, y));
  for (const w of windows) {
    let c: [number, number] | null = null, target: [number, number] | null = null;
    const wk: [number, number, number][] = [];
    for (let t = w.a; t <= w.b + 1e-6; t += step) {
      const f = pointerInFrame(m, toSrc(t, keeps));
      const p = f ? map(f[0], f[1]) : null;
      if (p) {
        if (!c) { c = [clampX(p[0]), clampY(p[1])]; target = c; }
        else if (Math.abs(p[0] - c[0]) > hw * 0.5 || Math.abs(p[1] - c[1]) > hh * 0.5) target = [clampX(p[0]), clampY(p[1])];
      }
      if (!c) c = target = [W / 2, H / 2];
      const k = 1 - Math.exp(-step / 0.35);
      c = [c[0] + (target![0] - c[0]) * k, c[1] + (target![1] - c[1]) * k];
      wk.push([r2(t), Math.round(c[0]), Math.round(c[1])]);
    }
    keys.push(...simplify(wk));
  }
  return { z, ramp: RAMP, w: W, h: H, windows: windows.map(w => [r2(w.a), r2(w.b)]), keys: keys.slice(0, 6000) };
}

/* Keyframes a straight line between their neighbours already gives (within 1.5 px) are left out: the engine's expression has a term per keyframe. */
function simplify(ks: [number, number, number][]): [number, number, number][] {
  if (ks.length < 3) return ks;
  const out = [ks[0]];
  for (let i = 1; i < ks.length - 1; i++) {
    const a = out[out.length - 1], b = ks[i + 1], c = ks[i];
    const u = (c[0] - a[0]) / Math.max(1e-6, b[0] - a[0]);
    if (Math.abs(a[1] + (b[1] - a[1]) * u - c[1]) > 1.5 || Math.abs(a[2] + (b[2] - a[2]) * u - c[2]) > 1.5) out.push(c);
  }
  out.push(ks[ks.length - 1]);
  return out;
}

/** How far in at `t`: eased in over the ramp at a window's start and out at its end. The engine's zoompan uses the same curve. */
export function zoomLevel(plan: Pick<ZoomPlan, 'z' | 'ramp' | 'windows'>, t: number): number {
  let e = 0;
  for (const [a, b] of plan.windows) e += Math.min(1, Math.max(0, (t - a) / plan.ramp)) * Math.min(1, Math.max(0, (b - t) / plan.ramp));
  return 1 + (plan.z - 1) * Math.min(1, e);
}

/** The view at `t`: its zoom and the top-left of what is shown, in output pixels (the engine's zoompan x/y). */
export function zoomAt(plan: ZoomPlan, t: number): { z: number; x: number; y: number } {
  const z = zoomLevel(plan, t);
  let cx = plan.w / 2, cy = plan.h / 2;
  const k = plan.keys;
  for (let i = 0; i < k.length - 1; i++) {
    if (t >= k[i][0] && t < k[i + 1][0]) {
      const u = (t - k[i][0]) / Math.max(1e-6, k[i + 1][0] - k[i][0]);
      cx = k[i][1] + (k[i + 1][1] - k[i][1]) * u; cy = k[i][2] + (k[i + 1][2] - k[i][2]) * u;
      break;
    }
  }
  const vw = plan.w / z, vh = plan.h / z;
  return { z, x: Math.min(plan.w - vw, Math.max(0, cx - vw / 2)), y: Math.min(plan.h - vh, Math.max(0, cy - vh / 2)) };
}

/* ── A Short of a screen recording ───────────────────────────────────────── */

export type Box = [number, number, number, number];
export interface ScreenPlan {
  kind: 'screencam' | 'follow';
  /** Where the screen is in the recording (px): the crop never leaves it. */
  region: Box;
  /** screencam: the camera's box (px), shown whole in the top third. */
  cam: Box | null;
  /** The size of the window moved round the pointer (px). */
  crop: [number, number];
  /** screencam: the camera's height on the output (px); follow: 0. */
  top: number;
  src: [number, number];
  out: [number, number];
}

const ev = (n: number) => Math.max(2, Math.round(n / 2) * 2);
const pxBox = (b: NBox, W: number, H: number): Box => {
  const w = ev(b[2] * W), h = ev(b[3] * H);
  return [Math.min(W - w, Math.max(0, Math.round(b[0] * W))), Math.min(H - h, Math.max(0, Math.round(b[1] * H))), w, h];
};

/** The layout shown most of the time between s and e. */
export function mainSeg(m: Pick<ScreenMeta, 'segs'>, s: number, e: number): ScreenSeg | null {
  let best: ScreenSeg | null = null, most = -1;
  m.segs.forEach((g, i) => {
    const a = Math.max(s, g.t), b = Math.min(e, m.segs[i + 1]?.t ?? Infinity);
    if (b - a > most) { most = b - a; best = g; }
  });
  return best ?? segAt(m, s);
}

/**
 * The boxes a screen Short is cut from: "screencam" puts the camera, whole,
 * in the top third and the screen round the pointer below; "follow" fills
 * the whole height with the screen round the pointer. Null when this
 * recording cannot carry it (no screen, or no camera for "screencam").
 */
export function screenPlan(kind: 'screencam' | 'follow', m: Pick<ScreenMeta, 'segs'>, s: number, e: number, srcW: number, srcH: number, outW: number, outH: number): ScreenPlan | null {
  const g = mainSeg(m, s, e);
  if (!g?.screen) return null;
  if (kind === 'screencam' && !g.cam) return null;
  const region = pxBox(g.screen, srcW, srcH);
  const top = kind === 'screencam' ? ev(outH / 3) : 0;
  const aspect = outW / (outH - top);
  let ch = region[3], cw = ch * aspect;
  if (cw > region[2]) { cw = region[2]; ch = cw / aspect; }
  return { kind, region, cam: kind === 'screencam' && g.cam ? pxBox(g.cam, srcW, srcH) : null, crop: [ev(cw), ev(ch)], top, src: [srcW, srcH], out: [outW, outH] };
}

/**
 * The screen layout a Short gets: the one asked for — or, not asked, in a
 * tall shape, the camera on top if there was one, else the screen following
 * the pointer (what a screen Short is for). Null for an uploaded video, a
 * wide Short or another layout. The render and the preview both ask this.
 */
export function screenLayoutFor(clip: { layout?: string; aspect: string } | null | undefined, ref: Pick<ScreenRef, 'cam'> | null | undefined): 'screencam' | 'follow' | null {
  if (!clip || !ref) return null;
  if (clip.layout === 'screencam') return ref.cam ? 'screencam' : 'follow';
  if (clip.layout === 'follow') return 'follow';
  return !clip.layout && (clip.aspect === '9:16' || clip.aspect === '4:5') ? (ref.cam ? 'screencam' : 'follow') : null;
}

/** A point of the recorded frame (0–1) on the output, as the engine frames it: whole (letterboxed) or a crop that stays still. */
export function frameMap(mode: 'crop' | 'fit' | 'source', srcW: number, srcH: number, W: number, H: number, cropX = 0.5, cropY = 0.5): (fx: number, fy: number) => [number, number] {
  if (mode === 'crop') {
    const cw = Math.min(srcW, srcH * W / H), ch = Math.min(srcH, srcW * H / W);
    const x0 = Math.min(srcW - cw, Math.max(0, cropX * srcW - cw / 2)), y0 = Math.min(srcH - ch, Math.max(0, cropY * srcH - ch / 2));
    return (fx, fy) => [(fx * srcW - x0) * (W / cw), (fy * srcH - y0) * (H / ch)];
  }
  const k = Math.min(W / srcW, H / srcH), ox = (W - srcW * k) / 2, oy = (H - srcH * k) / 2;
  return (fx, fy) => [ox + fx * srcW * k, oy + fy * srcH * k];
}

/** Which screen layouts a recording can carry, and why not. */
export function screenLayoutOptions(ref: Pick<ScreenRef, 'cam' | 'moves'> | null): { key: 'screencam' | 'follow'; ok: boolean; why: string }[] {
  const none = 'Only for recordings made with the Screen Recorder, which notes where the pointer went.';
  return [
    { key: 'screencam', ok: !!ref?.cam, why: !ref ? none : ref.cam ? '' : 'The camera was not on while this was recorded.' },
    { key: 'follow', ok: !!ref, why: ref ? '' : none },
  ];
}

/**
 * The window's top-left (px) every tenth of a second of the Short (output
 * time, before speed): centred on the pointer, kept inside the screen, and
 * moved only when the pointer nears the window's edge — then glided.
 */
export function followPath(m: Pick<ScreenMeta, 'path' | 'segs'>, keeps: [number, number][], plan: Pick<ScreenPlan, 'region' | 'crop' | 'src'>): [number, number, number][] {
  const [rx, ry, rw, rh] = plan.region, [cw, ch] = plan.crop, [W, H] = plan.src;
  const cx0 = rx + cw / 2, cx1 = rx + rw - cw / 2, cy0 = ry + ch / 2, cy1 = ry + rh - ch / 2;
  const clampC = (x: number, y: number): [number, number] => [Math.min(cx1, Math.max(cx0, x)), Math.min(cy1, Math.max(cy0, y))];
  const total = keeps.reduce((n, [a, b]) => n + (b - a), 0);
  const out: [number, number, number][] = [];
  let c: [number, number] | null = null, target: [number, number] | null = null;
  for (let t = 0; t <= total + 1e-6 && out.length < 40_000; t += 0.1) {
    const f = pointerInFrame(m, toSrc(t, keeps));
    if (f) {
      const p = clampC(f[0] * W, f[1] * H);
      if (!c) { c = p; target = p; }
      else if (Math.abs(p[0] - c[0]) > cw * 0.28 || Math.abs(p[1] - c[1]) > ch * 0.28) target = p;
    }
    if (!c) c = target = clampC(rx + rw / 2, ry + rh / 2);
    const k = 1 - Math.exp(-0.1 / 0.3);
    c = [c[0] + (target![0] - c[0]) * k, c[1] + (target![1] - c[1]) * k];
    out.push([r2(t), ev(c[0] - cw / 2), ev(c[1] - ch / 2)]);
  }
  return out;
}

/** The window at `t` along a follow path (the step before it). */
export function followAt(path: [number, number, number][], t: number): [number, number] | null {
  if (!path.length) return null;
  const i = Math.min(path.length - 1, Math.max(0, Math.floor(t / 0.1 + 1e-6)));
  return [path[i][1], path[i][2]];
}

/* ── The pointer drawn over the video, and clicks heard ──────────────────── */

export interface PointerMark { t: number; x: number; y: number }
export interface ClickMark { t: number; x: number; y: number; sound: ClickSound | 'celebrate' | 'error' }

/**
 * Inside each window: the pointer every tenth of a second and its clicks, on
 * the output's clock after `speed`, in output pixels through `place` (which
 * knows the zoom or the follow crop; null where the point is off the picture).
 */
export function pointerMarks(m: Pick<ScreenMeta, 'path' | 'segs' | 'clicks'>, keeps: [number, number][], windows: Window[], speed: number,
  place: (tOut: number, fx: number, fy: number) => [number, number] | null, sentences: Pick<Sentence, 's' | 'e' | 'text'>[], s: Pick<PointerSettings, 'click' | 'moments'>):
  { marks: { w: Window; pts: PointerMark[] }[]; clicks: ClickMark[] } {
  const marks: { w: Window; pts: PointerMark[] }[] = [];
  const clicks: ClickMark[] = [];
  for (const w of windows) {
    const pts: PointerMark[] = [];
    for (let t = w.a; t <= w.b + 1e-6; t += 0.1) {
      const f = pointerInFrame(m, toSrc(t, keeps));
      const p = f ? place(t, f[0], f[1]) : null;
      if (p) pts.push({ t: r2(t / speed), x: Math.round(p[0]), y: Math.round(p[1]) });
    }
    if (pts.length) marks.push({ w, pts });
    const inside = m.clicks.map(c => ({ c, o: toOut(c[0], keeps) })).filter(x => x.o !== null && x.o >= w.a && x.o <= w.b);
    const moment = s.moments ? resolveMoment(w.range, sentences) : null;
    inside.forEach((x, i) => {
      const f = pointerInFrame({ ...m, path: [[x.c[0], x.c[1], x.c[2]]] }, x.c[0]);
      const p = f ? place(x.o!, f[0], f[1]) : null;
      if (!p) return;
      const last = i === inside.length - 1;
      const sound = last && moment ? moment : s.click;
      clicks.push({ t: r2(x.o! / speed), x: Math.round(p[0]), y: Math.round(p[1]), sound });
    });
    /* A success said with no click to hang it on still gets its sound, at the moment's end. */
    if (moment && !inside.length) {
      const f = pointerInFrame(m, toSrc(w.b, keeps));
      const p = f ? place(w.b, f[0], f[1]) : null;
      clicks.push({ t: r2(Math.max(w.a, w.b - 0.3) / speed), x: Math.round(p?.[0] ?? -1), y: Math.round(p?.[1] ?? -1), sound: moment });
    }
  }
  return { marks, clicks };
}

/** Sound effects for the engine: [output time, sound], at most 300, none closer than 80 ms. */
export function sfxEvents(clicks: ClickMark[]): [number, Exclude<ClickSound, 'none'> | 'celebrate' | 'error'][] {
  const out: [number, Exclude<ClickSound, 'none'> | 'celebrate' | 'error'][] = [];
  for (const c of [...clicks].sort((a, b) => a.t - b.t)) {
    if (c.sound === 'none') continue;
    if (out.length && c.t - out[out.length - 1][0] < 0.08) continue;
    out.push([c.t, c.sound]);
  }
  return out.slice(0, 300);
}

/**
 * The sounds, as numbers of time — what the browser plays to let somebody
 * hear one before choosing it. media/engine/server.mjs `SFX` makes the same
 * sounds with FFmpeg's aevalsrc from the same formulas; change both together.
 */
export const SFX_LENGTH: Record<Exclude<ClickSound, 'none'> | 'celebrate' | 'error', number> = { click: 0.06, soft: 0.09, pop: 0.12, celebrate: 0.75, error: 0.42 };
export function sfxSample(kind: keyof typeof SFX_LENGTH, t: number, noise = 0): number {
  const S = Math.sin, P = 2 * Math.PI, between = (a: number, b: number) => (t >= a && t <= b ? 1 : 0);
  switch (kind) {
    case 'click': return 0.6 * S(P * 2200 * t) * Math.exp(-t * 90) + 0.3 * noise * Math.exp(-t * 160);
    case 'soft': return 0.5 * S(P * 900 * t) * Math.exp(-t * 60);
    case 'pop': return 0.6 * S(P * (500 + 1500 * t) * t) * Math.exp(-t * 40);
    case 'celebrate': return 0.3 * (S(P * 523 * t) * between(0, 0.14) + S(P * 659 * t) * between(0.12, 0.26) + S(P * 784 * t) * between(0.24, 0.38) + S(P * 1047 * t) * between(0.36, 0.75)) * Math.exp(-Math.max(0, t - 0.36) * 5);
    case 'error': return 0.35 * (S(P * 220 * t) + 0.6 * S(P * 233 * t)) * (between(0, 0.16) + between(0.22, 0.42));
  }
}

/* ASS: the shapes, fixed; only numbers are put into them. */
const pad2 = (n: number) => String(n).padStart(2, '0');
function assTime(t: number): string {
  const cs = Math.max(0, Math.round(t * 100));
  return `${Math.floor(cs / 360000)}:${pad2(Math.floor((cs % 360000) / 6000))}:${pad2(Math.floor((cs % 6000) / 100))}.${pad2(cs % 100)}`;
}
const bgr = (hex: string) => { const h = HEX.test(hex) ? hex.slice(1) : 'facc15'; return `${h.slice(4, 6)}${h.slice(2, 4)}${h.slice(0, 2)}`.toUpperCase(); };
const circle = (r: number) => { const k = r * 0.5523; return `m ${r} 0 b ${r + k} 0 ${2 * r} ${r - k} ${2 * r} ${r} b ${2 * r} ${r + k} ${r + k} ${2 * r} ${r} ${2 * r} b ${r - k} ${2 * r} 0 ${r + k} 0 ${r} b 0 ${r - k} ${r - k} 0 ${r} 0`; };
/* The same circle the other way round: inside a rectangle it cuts a hole (libass fills by winding). */
const circleRev = (cx: number, cy: number, r: number) => { const k = r * 0.5523; return `m ${cx} ${cy - r} b ${cx - k} ${cy - r} ${cx - r} ${cy - k} ${cx - r} ${cy} b ${cx - r} ${cy + k} ${cx - k} ${cy + r} ${cx} ${cy + r} b ${cx + k} ${cy + r} ${cx + r} ${cy + k} ${cx + r} ${cy} b ${cx + r} ${cy - k} ${cx + k} ${cy - r} ${cx} ${cy - r}`; };
const ARROW = [[0, 0], [0, 34], [9, 26], [15, 40], [21, 37], [15, 24], [27, 24]];
const HAND = [[10, 0], [15, 0], [16, 16], [19, 12], [24, 13], [25, 17], [29, 15], [33, 17], [34, 21], [37, 20], [40, 23], [40, 34], [35, 44], [16, 44], [6, 30], [3, 24], [6, 21], [10, 25]];
const poly = (pts: number[][], k: number) => { const q = pts.map(([x, y]) => `${Math.round(x * k)} ${Math.round(y * k)}`); return `m ${q[0]} l ${q.slice(1).join(' ')}`; };

/**
 * The pointer as an ASS script: within each window the chosen shape glides
 * from one tenth-of-a-second place to the next (\move), and every click gets
 * a ripple that grows and fades. Built only from numbers and the fixed
 * shapes above — nothing typed reaches it.
 */
export function pointerAss(marks: { w: Window; pts: PointerMark[]; cursor: DrawnCursor }[], clicks: ClickMark[], W: number, H: number, size: number, color: string): string {
  const k = Math.min(W, H) / 1080 * num(size, 0.6, 2, 1);
  const col = bgr(color);
  const ev: string[] = [];
  const line = (a: number, b: number, tags: string, draw: string, layer = 0) => ev.push(`Dialogue: ${layer},${assTime(a)},${assTime(b)},P,,0,0,0,,{${tags}\\p1}${draw}{\\p0}`);
  for (const { pts, cursor } of marks) {
    if (cursor === 'none') continue;
    for (let i = 0; i < pts.length; i++) {
      const p = pts[i], q = pts[i + 1] ?? p;
      const a = p.t, b = Math.max(p.t + 0.02, q.t);
      const mv = (dx: number, dy: number) => `\\move(${p.x + dx},${p.y + dy},${q.x + dx},${q.y + dy})`;
      if (cursor === 'ring') { const r = Math.round(30 * k); line(a, b, `\\an7${mv(-r, -r)}\\bord${Math.max(2, Math.round(4 * k))}\\shad0\\1a&HE0&\\1c&H${col}&\\3c&H${col}&`, circle(r)); }
      else if (cursor === 'dot') { const r = Math.round(22 * k); line(a, b, `\\an7${mv(-r, -r)}\\bord0\\shad0\\1a&H70&\\1c&H${col}&`, circle(r)); }
      else if (cursor === 'spotlight') {
        const r = Math.round(120 * k);
        /* The whole frame dimmed, with a hole round the pointer that follows it. */
        line(a, b, `\\an7\\pos(0,0)\\bord0\\shad0\\1a&H70&\\1c&H000000&`, `m 0 0 l ${W} 0 l ${W} ${H} l 0 ${H} ${circleRev(p.x, p.y, r)}`);
        line(a, b, `\\an7${mv(-r, -r)}\\bord${Math.max(2, Math.round(3 * k))}\\shad0\\1a&HFF&\\3c&H${col}&`, circle(r), 1);
      } else {
        const shape = cursor === 'hand' ? HAND : ARROW, s = 1.6 * k;
        /* The arrow's tip (or the finger) on the pointer. */
        const ox = cursor === 'hand' ? -Math.round(12 * s) : 0;
        line(a, b, `\\an7${mv(ox, 0)}\\bord${Math.max(2, Math.round(2.5 * k))}\\shad${Math.max(1, Math.round(3 * k))}\\4a&H90&\\1c&HFFFFFF&\\3c&H000000&`, poly(shape, s), 2);
      }
    }
  }
  for (const c of clicks) {
    if (c.x < 0) continue;
    const r = Math.round(26 * k);
    line(c.t, c.t + 0.45, `\\an5\\pos(${c.x},${c.y})\\bord${Math.max(2, Math.round(4 * k))}\\shad0\\1a&HFF&\\3c&H${c.sound === 'error' ? '3A3AEF' : c.sound === 'celebrate' ? '5EC522' : col}&\\fscx40\\fscy40\\t(0,450,\\fscx180\\fscy180\\3a&HFF&)`, circle(r), 3);
  }
  if (!ev.length) return '';
  return `[Script Info]\nScriptType: v4.00+\nPlayResX: ${W}\nPlayResY: ${H}\nWrapStyle: 2\nScaledBorderAndShadow: yes\n\n[V4+ Styles]\nFormat: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding\nStyle: P,Arial,20,&H00FFFFFF,&H00FFFFFF,&H00000000,&H00000000,0,0,0,0,100,100,0,0,1,0,0,7,0,0,0,1\n\n[Events]\nFormat: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text\n${ev.join('\n')}\n`;
}
