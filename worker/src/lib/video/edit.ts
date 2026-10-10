/**
 * Video Studio's edit decisions — one document per project, and the pure
 * functions every other part reads it through.
 *
 * ── One canonical edit ──
 *
 * The editor's preview (the proxy, played skipping the cut ranges) and the
 * final render (the engine's frame selection) both come from `keepRanges` on
 * this document. Nothing is ever cut by changing the source: the source in R2
 * is immutable, and a cut is a record with a reason, a confidence and a
 * state that can be approved, rejected or restored.
 *
 * ── Captions are not cuts ──
 *
 * Correcting what a caption says (`captionEdits`, by word) never touches the
 * picture; removing a spoken word (`cuts`) never rewrites a caption — the
 * word simply is not there to caption. The two are different operations and
 * the screen says which one a button does.
 *
 * Pure: no imports outside this folder, no I/O — the browser imports it too
 * (src/services/videoStudio.ts), so both sides read the edit the same way.
 */

export interface Word {
  /** Index in the transcript; stable — edits refer to words by it. */
  i: number;
  w: string;
  s: number;
  e: number;
  /** 0–1 where the transcriber gave one (Whisper gives it per segment). */
  c?: number;
  /** Speaker number, only when a provider with speaker detection produced it. */
  sp?: number;
}

export interface Sentence { i: number; w0: number; w1: number; s: number; e: number; text: string }

export interface Transcript {
  language: string;
  provider: string;
  duration: number;
  words: Word[];
  /** Mean confidence over the words that have one; null when none had one. */
  confidence: number | null;
  speakers: boolean;
}

export type CutKind = 'filler' | 'gap' | 'repeat' | 'false_start' | 'retake' | 'manual';
export type CutState = 'proposed' | 'approved' | 'rejected';

export interface Cut {
  /** Rule cuts have deterministic ids (kind + word index), so a decision about one survives re-running cleanup. */
  id: string;
  s: number;
  e: number;
  kind: CutKind;
  state: CutState;
  reason: string;
  conf: number;
  by: 'rule' | 'ai' | 'you';
}

export interface Protect { id: string; s: number; e: number; note: string }

export type CaptionPreset = 'clean' | 'bold' | 'boxed' | 'highlight';
export interface CaptionStyle {
  preset: CaptionPreset;
  /** Relative size, 0.6–1.6 of the preset's own. */
  size: number;
  color: string;
  highlight: string;
  position: 'bottom' | 'middle' | 'top';
  uppercase: boolean;
  outline: boolean;
  shadow: boolean;
  box: boolean;
  speakerLabels: boolean;
}

export interface Reframe { mode: 'crop' | 'fit' | 'source'; x: number; y: number }
export type Aspect = '16:9' | '9:16' | '1:1' | '4:5' | 'source';

export interface Scores { hook: number; clarity: number; relevance: number; completeness: number }

export interface Clip {
  id: string;
  title: string;
  topic: string;
  reason: string;
  s: number;
  e: number;
  /** Editorial estimates (1–5) from the AI's reading — never a prediction of reach. Null when chosen without AI. */
  scores: Scores | null;
  by: 'ai' | 'rules' | 'you';
  aspect: Exclude<Aspect, 'source' | '16:9'> | '16:9';
  reframe: Reframe;
}

export type CleanupPreset = 'conservative' | 'balanced' | 'aggressive';

export type Denoise = 'off' | 'light' | 'medium' | 'strong';
export interface AudioSettings {
  loudnorm: boolean;
  /** Steady background noise (fans, hum, hiss) taken out — the engine's levels. */
  denoise: Denoise;
  /** Presence, de-essing and gentle compression for speech. */
  voice?: boolean;
  /** The voice's own level, 0.5–1.5. */
  volume?: number;
}

/**
 * A music track under the videos. The track itself and its licence are set
 * only by the server (`music.set` is not accepted from a browser): it fetched
 * the track from a licensed source, or the customer uploaded it and confirmed
 * the rights. Volume, fades, ducking and where it applies are the customer's.
 */
export interface MusicTrack {
  id: string;
  key: string;
  title: string;
  artist: string;
  /** e.g. "CC0", "CC BY 4.0", "Your own upload". */
  license: string;
  licenseUrl: string;
  /** The credit a licence requires; '' when none is required. */
  attribution: string;
  source: 'openverse' | 'upload';
  sourceUrl: string;
  duration: number;
  volume: number;
  fadeIn: number;
  fadeOut: number;
  loop: boolean;
  duck: boolean;
  applyTo: 'all' | 'long' | 'shorts';
}
export const MUSIC_DEFAULTS = { volume: 0.18, fadeIn: 1.5, fadeOut: 2.5, loop: true, duck: true, applyTo: 'all' as const };

/**
 * The picture's colour and finish, for the long video or for every Short.
 * Numbers are -100…100 (sharpness, blur, vignette and grain 0…100), turned
 * into FFmpeg filters by the engine — which owns what each one means; the
 * browser previews them with CSS filters, which is close, not exact.
 */
export const FILTER_PRESETS = ['none', 'vivid', 'warm', 'cool', 'cinematic', 'bw', 'vintage', 'punchy', 'soft', 'food'] as const;
export type FilterPreset = typeof FILTER_PRESETS[number];
export interface Look {
  filter: FilterPreset;
  temperature: number; tint: number; brightness: number; contrast: number; saturation: number; exposure: number; hue: number;
  sharpness: number; blur: number; vignette: number; grain: number;
}
export const LOOK_DEFAULT: Look = { filter: 'none', temperature: 0, tint: 0, brightness: 0, contrast: 0, saturation: 0, exposure: 0, hue: 0, sharpness: 0, blur: 0, vignette: 0, grain: 0 };

/**
 * Movement and timing: zooms (a punch-in every other sentence, or a slow push
 * across the whole video), a flash or dip at every jump cut, fades from and
 * to black, the playback speed and a progress bar. Speed changes the length
 * of the file; captions, overlays and chapters are re-timed to match.
 */
export interface Motion {
  zoom: 'off' | 'punch' | 'slow';
  zoomAmount: number;
  transition: 'none' | 'flash' | 'dip';
  fadeIn: number;
  fadeOut: number;
  speed: number;
  progressBar: boolean;
}
export const MOTION_DEFAULT: Motion = { zoom: 'off', zoomAmount: 1.12, transition: 'none', fadeIn: 0, fadeOut: 0, speed: 1, progressBar: false };

/**
 * Following a face when a video is cropped to a new shape. "face" follows the
 * most prominent face; "speaker" follows whoever's mouth moves while there is
 * speech (media/engine/track.py says how, and what it cannot tell apart).
 * Only used where the framing is a crop.
 */
export type TrackMode = 'off' | 'face' | 'speaker';

/** Words on screen for a stretch of the recording — burned in, animated. */
export interface Overlay {
  id: string;
  /** Source time: it appears in every video that keeps this stretch. */
  s: number;
  e: number;
  text: string;
  style: 'title' | 'lower' | 'cta' | 'label' | 'quote';
  position: 'top' | 'middle' | 'bottom';
  anim: 'none' | 'fade' | 'pop' | 'slide' | 'reveal';
  color: string;
  bg: string;
}
export const OVERLAY_STYLES: Overlay['style'][] = ['title', 'lower', 'cta', 'label', 'quote'];
export const OVERLAY_ANIMS: Overlay['anim'][] = ['none', 'fade', 'pop', 'slide', 'reveal'];

export const lookOf = (doc: Pick<VideoDoc, 'look'>, kind: 'long' | 'short'): Look => ({ ...LOOK_DEFAULT, ...(doc.look?.[kind] ?? {}) });
export const motionOf = (doc: Pick<VideoDoc, 'motion'>, kind: 'long' | 'short'): Motion => ({ ...MOTION_DEFAULT, ...(doc.motion?.[kind] ?? {}) });
export const trackingOf = (doc: Pick<VideoDoc, 'tracking'>, kind: 'long' | 'short'): TrackMode => doc.tracking?.[kind] ?? 'off';

export interface VideoDoc {
  v: 1;
  cleanup: { preset: CleanupPreset; ran: boolean };
  cuts: Cut[];
  protects: Protect[];
  /** Word index → caption text. '' hides the word in captions only. */
  captionEdits: Record<string, string>;
  captions: { on: boolean; burn: boolean; long: CaptionStyle; short: CaptionStyle };
  long: { on: boolean; aspect: Aspect; reframe: Reframe; chapters: { s: number; title: string }[] };
  shorts: { count: number; min: number; max: number; aspect: '9:16' | '1:1' | '4:5'; mode?: 'crop' | 'fit' };
  clips: Clip[];
  thumbnails: { on: boolean; headline: Record<string, string> };
  audio: AudioSettings;
  /** Background music under every video it applies to, with its licence. Null: none. */
  music?: MusicTrack | null;
  look?: { long: Look; short: Look };
  motion?: { long: Motion; short: Motion };
  tracking?: { long: TrackMode; short: TrackMode };
  overlays?: Overlay[];
}

/* ── The request, read from what somebody typed ─────────────────────────── */

export interface VideoRequest {
  long: boolean;
  shorts: number;
  min: number;
  max: number;
  captions: boolean;
  thumbnails: boolean;
  cleanup: CleanupPreset;
  aspect: '9:16' | '1:1' | '4:5';
  /** Crop to the speaker, or fit the whole frame (screens, slides, demos). */
  layout: 'crop' | 'fit';
  /** What was understood, in words, for the screen to say back. */
  understood: string[];
}

const NUMBER_WORDS: Record<string, number> = {
  one: 1, a: 1, an: 1, single: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9, ten: 10,
  eleven: 11, twelve: 12, thirteen: 13, fourteen: 14, fifteen: 15, twenty: 20,
};
const countOf = (s: string): number | null => {
  const n = Number(s);
  if (Number.isFinite(n)) return n;
  return NUMBER_WORDS[s.toLowerCase()] ?? null;
};

export const SHORTS_MAX = 15;

/** The request in words, for the screen to say back before anything runs. */
export function describeRequest(r: Omit<VideoRequest, 'understood'>): string[] {
  return [
    r.long ? 'one cleaned long video' : 'no long video',
    r.shorts ? `${r.shorts} Short${r.shorts === 1 ? '' : 's'} of ${r.min}–${r.max} s (${r.aspect})` : 'no Shorts',
    r.captions ? 'captions' : 'no captions',
    r.thumbnails ? 'PNG thumbnails' : 'no thumbnails',
    `${r.cleanup} cleanup`,
    ...(r.layout === 'fit' && r.shorts ? ['screens kept whole (no crop)'] : []),
  ];
}

/**
 * "Clean this recording, remove filler words and long gaps, create one
 * polished main video and four Shorts, add captions and create PNG
 * thumbnails." → long, 4 Shorts, captions, thumbnails, balanced cleanup.
 *
 * Read by pattern, never by an AI call: what a project will make is shown
 * back before anything runs, and the customer can change every part of it.
 */
export function parseRequest(prompt: string, defaults: Partial<VideoRequest> = {}): VideoRequest {
  const t = ` ${prompt.toLowerCase().replace(/[–—]/g, '-')} `;
  const r: VideoRequest = {
    long: true, shorts: 0, min: 30, max: 60, captions: true, thumbnails: true, cleanup: 'balanced', aspect: '9:16', layout: 'crop', understood: [],
    ...defaults,
  };
  const shortWord = '(?:shorts?|reels?|clips?|tiktoks?|vertical videos?)';
  const m = t.match(new RegExp(`\\b(\\d{1,2}|one|a|an|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve|thirteen|fourteen|fifteen|twenty)\\s+(?:[a-z0-9-]+\\s+){0,3}?${shortWord}\\b`));
  if (m) r.shorts = Math.min(SHORTS_MAX, Math.max(1, countOf(m[1]) ?? 1));
  else if (new RegExp(`\\b${shortWord}\\b`).test(t)) r.shorts = defaults.shorts || 3;
  const range = t.match(/(\d{1,3})\s*(?:-|to)\s*(\d{1,3})\s*(?:s\b|sec|second)/);
  if (range) { r.min = Math.max(10, Math.min(Number(range[1]), 170)); r.max = Math.min(180, Math.max(r.min + 5, Number(range[2]))); }
  else {
    const under = t.match(/(?:under|up to|max(?:imum)?|less than)\s*(\d{1,3})\s*(?:s\b|sec|second)/);
    if (under) { r.max = Math.min(180, Math.max(15, Number(under[1]))); r.min = Math.min(r.min, Math.max(10, Math.round(r.max / 2))); }
  }
  const onlyShorts = /\b(only|just)\s+(the\s+)?(shorts?|reels?|clips?)\b/.test(t) || /\bno (long|main|full)\b/.test(t);
  const mentionsLong = /\b(long|main|full|polished|cleaned?|edited)\s+(video|version|cut|edit|episode|recording)\b|\blong[- ]form\b|\bone long\b/.test(t);
  /* A long video when one is asked for, when cleaning is (cleaning a
     recording is cleaning the whole of it), or when no Shorts are — "create
     three reels from every training recording" asks for reels only. */
  r.long = !onlyShorts && (mentionsLong || /\bclean/.test(t) || r.shorts === 0);
  if (/\bno captions?\b|\bwithout captions?\b|\bno subtitles?\b/.test(t)) r.captions = false;
  else if (/\bcaptions?\b|\bsubtitles?\b/.test(t)) r.captions = true;
  if (/\bno thumbnails?\b|\bwithout thumbnails?\b/.test(t)) r.thumbnails = false;
  else if (/\bthumbnails?\b|\bcovers?\b/.test(t)) r.thumbnails = true;
  if (/\b(aggressive|tight(ly)?|fast[- ]paced|every pause|all (the )?pauses)\b/.test(t)) r.cleanup = 'aggressive';
  else if (/\b(light(ly)?|gentle|conservative|minimal|natural)\b/.test(t)) r.cleanup = 'conservative';
  if (/\b(square|1:1)\b/.test(t)) r.aspect = '1:1';
  else if (/\b4:5\b|\bportrait feed\b/.test(t)) r.aspect = '4:5';
  /* A screen recording must not be cropped to a face: the slide is the point. */
  if (/\b(screen|slides?|demo|tutorial|screencast|presentation|whole frame|don'?t crop|do not crop|keep (the )?(screen|ui|interface))\b/.test(t)) r.layout = 'fit';

  r.understood = describeRequest(r);
  return r;
}

/* ── A fresh document ────────────────────────────────────────────────────── */

export const CAPTION_PRESETS: Record<CaptionPreset, Omit<CaptionStyle, 'size' | 'position' | 'speakerLabels'>> = {
  clean: { preset: 'clean', color: '#ffffff', highlight: '#ffd43b', uppercase: false, outline: true, shadow: true, box: false },
  bold: { preset: 'bold', color: '#ffffff', highlight: '#a3e635', uppercase: true, outline: true, shadow: true, box: false },
  boxed: { preset: 'boxed', color: '#ffffff', highlight: '#ffd43b', uppercase: false, outline: false, shadow: false, box: true },
  highlight: { preset: 'highlight', color: '#ffffff', highlight: '#22d3ee', uppercase: false, outline: true, shadow: true, box: false },
};

export const style = (preset: CaptionPreset, extra: Partial<CaptionStyle> = {}): CaptionStyle =>
  ({ ...CAPTION_PRESETS[preset], size: 1, position: 'bottom', speakerLabels: false, ...extra });

export function newDoc(req: VideoRequest, brandColor = ''): VideoDoc {
  const hl = /^#[0-9a-f]{6}$/i.test(brandColor) ? brandColor : undefined;
  return {
    v: 1,
    cleanup: { preset: req.cleanup, ran: false },
    cuts: [],
    protects: [],
    captionEdits: {},
    captions: { on: req.captions, burn: req.captions, long: style('clean'), short: style('bold', hl ? { highlight: hl } : {}) },
    long: { on: req.long, aspect: 'source', reframe: { mode: 'source', x: 0.5, y: 0.5 }, chapters: [] },
    shorts: { count: req.shorts, min: req.min, max: req.max, aspect: req.aspect, mode: req.layout ?? 'crop' },
    clips: [],
    thumbnails: { on: req.thumbnails, headline: {} },
    audio: { loudnorm: true, denoise: 'off' },
  };
}

/* ── What is kept ────────────────────────────────────────────────────────── */

export const FPS = 30;
const grid = (t: number, fps = FPS) => Math.round(t * fps) / fps;

/** The approved cuts with every protected range taken back out of them. */
export function effectiveCuts(doc: Pick<VideoDoc, 'cuts' | 'protects'>): [number, number][] {
  let out: [number, number][] = doc.cuts.filter(c => c.state === 'approved').map(c => [c.s, c.e]);
  for (const p of doc.protects) {
    const next: [number, number][] = [];
    for (const [a, b] of out) {
      if (b <= p.s || a >= p.e) { next.push([a, b]); continue; }
      if (a < p.s) next.push([a, p.s]);
      if (b > p.e) next.push([p.e, b]);
    }
    out = next;
  }
  return out.sort((x, y) => x[0] - y[0]);
}

/**
 * The parts of the source that survive the edit, in source time, inside
 * `range` (a clip) or the whole recording. Boundaries are on the 1/30 s grid
 * the engine renders on, so the preview and the render agree to the frame;
 * slivers shorter than two frames are dropped rather than flashed.
 */
export function keepRanges(duration: number, doc: Pick<VideoDoc, 'cuts' | 'protects'>, range?: [number, number]): [number, number][] {
  const [rs, re] = range ?? [0, duration];
  const from = Math.max(0, rs), to = Math.min(duration, re);
  const keeps: [number, number][] = [];
  let at = from;
  for (const [a, b] of effectiveCuts(doc)) {
    if (b <= at) continue;
    if (a >= to) break;
    if (a > at) keeps.push([at, Math.min(a, to)]);
    at = Math.max(at, b);
  }
  if (at < to) keeps.push([at, to]);
  const snapped: [number, number][] = [];
  for (const [a, b] of keeps) {
    const s = grid(a), e = grid(b);
    if (e - s < 2 / FPS) continue;
    const last = snapped[snapped.length - 1];
    if (last && s - last[1] < 1 / FPS) last[1] = e;
    else snapped.push([s, e]);
  }
  return snapped;
}

export const keptLength = (keeps: [number, number][]) => keeps.reduce((n, [a, b]) => n + (b - a), 0);

/** Source time → output time, or null when that moment is cut. */
export function toOutput(t: number, keeps: [number, number][]): number | null {
  let acc = 0;
  for (const [a, b] of keeps) {
    if (t < a) return null;
    if (t <= b) return acc + (t - a);
    acc += b - a;
  }
  return null;
}

/** Output time → source time (for seeking the preview). */
export function toSource(t: number, keeps: [number, number][]): number {
  let acc = 0;
  for (const [a, b] of keeps) {
    if (t <= acc + (b - a)) return a + (t - acc);
    acc += b - a;
  }
  return keeps.length ? keeps[keeps.length - 1][1] : 0;
}

export interface TimedWord { i: number; w: string; s: number; e: number; sp?: number }

/**
 * The words that survive, on the output's clock, with caption corrections
 * applied. A word is kept when most of it is kept; the rest are gone from
 * the captions because they are gone from the video.
 */
export function retimeWords(words: Word[], keeps: [number, number][], captionEdits: Record<string, string> = {}): TimedWord[] {
  const out: TimedWord[] = [];
  let acc = 0, k = 0;
  const starts: number[] = [];
  for (const [a, b] of keeps) { starts.push(acc); acc += b - a; }
  for (const w of words) {
    const mid = (w.s + w.e) / 2;
    while (k < keeps.length && keeps[k][1] < mid) k++;
    if (k >= keeps.length) break;
    const [a, b] = keeps[k];
    if (mid < a) continue;
    const text = Object.prototype.hasOwnProperty.call(captionEdits, String(w.i)) ? captionEdits[String(w.i)] : w.w;
    if (!text.trim()) continue;
    const s = starts[k] + (Math.max(w.s, a) - a);
    const e = starts[k] + (Math.min(w.e, b) - a);
    out.push({ i: w.i, w: text.trim(), s, e: Math.max(e, s + 0.05), sp: w.sp });
  }
  return out;
}

/* ── Sentences ───────────────────────────────────────────────────────────── */

const END = /[.!?…۔؟]["')\]]*$/;

/** Sentences from words: terminal punctuation, a pause over 1.2 s, or 40 words. */
export function sentencesOf(words: Word[]): Sentence[] {
  const out: Sentence[] = [];
  let start = 0;
  for (let j = 0; j < words.length; j++) {
    const w = words[j], next = words[j + 1];
    const brk = !next || END.test(w.w) || next.s - w.e > 1.2 || j - start >= 39;
    if (brk) {
      const ws = words.slice(start, j + 1);
      out.push({ i: out.length, w0: words[start].i, w1: w.i, s: words[start].s, e: w.e, text: ws.map(x => x.w).join(' ').replace(/\s+([,.!?;:…])/g, '$1') });
      start = j + 1;
    }
  }
  return out;
}

/* ── Operations — every change to the document goes through these ───────── */

export type Op =
  | { op: 'cut.add'; s: number; e: number; reason?: string }
  | { op: 'cut.set'; id: string; state: CutState }
  | { op: 'cut.setMany'; ids: string[]; state: CutState }
  | { op: 'cut.restoreRange'; s: number; e: number }
  | { op: 'protect.add'; s: number; e: number; note?: string }
  | { op: 'protect.remove'; id: string }
  | { op: 'caption.edit'; i: number; text: string }
  | { op: 'caption.style'; target: 'long' | 'short'; patch: Partial<CaptionStyle> }
  | { op: 'captions.set'; on?: boolean; burn?: boolean }
  | { op: 'clip.add'; s: number; e: number; title?: string; topic?: string; reason?: string }
  | { op: 'clip.update'; id: string; patch: Partial<Pick<Clip, 's' | 'e' | 'title' | 'topic' | 'aspect'>> & { reframe?: Partial<Reframe> } }
  | { op: 'clip.remove'; id: string }
  | { op: 'long.set'; patch: { on?: boolean; aspect?: Aspect; reframe?: Partial<Reframe> } }
  | { op: 'audio.set'; patch: Partial<VideoDoc['audio']> }
  | { op: 'music.set'; track: MusicTrack }
  | { op: 'music.patch'; patch: Partial<Pick<MusicTrack, 'volume' | 'fadeIn' | 'fadeOut' | 'loop' | 'duck' | 'applyTo'>> }
  | { op: 'music.remove' }
  | { op: 'look.set'; target: 'long' | 'short'; patch: Partial<Look>; reset?: boolean }
  | { op: 'motion.set'; target: 'long' | 'short'; patch: Partial<Motion> }
  | { op: 'tracking.set'; target: 'long' | 'short'; mode: TrackMode }
  | { op: 'overlay.add'; s: number; e: number; text: string; style?: Overlay['style']; position?: Overlay['position']; anim?: Overlay['anim']; color?: string; bg?: string }
  | { op: 'overlay.update'; id: string; patch: Partial<Omit<Overlay, 'id'>> }
  | { op: 'overlay.remove'; id: string }
  | { op: 'clip.duplicate'; id: string }
  | { op: 'thumbnail.headline'; target: string; text: string }
  | { op: 'shorts.set'; patch: Partial<VideoDoc['shorts']> }
  | { op: 'cleanup.preset'; preset: CleanupPreset; cuts: Cut[] };

const HEX = /^#[0-9a-fA-F]{6}$/;
const clamp = (n: unknown, lo: number, hi: number, d: number) => { const x = Number(n); return Number.isFinite(x) ? Math.min(hi, Math.max(lo, x)) : d; };
const text = (v: unknown, max: number) => String(v ?? '').replace(/[\u0000-\u001f]/g, ' ').trim().slice(0, max);
let seq = 0;
export const newId = (p: string) => `${p}${Date.now().toString(36)}${(seq++ % 1296).toString(36).padStart(2, '0')}${Math.random().toString(36).slice(2, 6)}`;

function cleanStyle(cur: CaptionStyle, patch: Partial<CaptionStyle>): CaptionStyle {
  const base = patch.preset && patch.preset !== cur.preset && CAPTION_PRESETS[patch.preset] ? { ...cur, ...CAPTION_PRESETS[patch.preset] } : { ...cur };
  return {
    ...base,
    size: patch.size !== undefined ? clamp(patch.size, 0.6, 1.6, cur.size) : base.size,
    color: patch.color && HEX.test(patch.color) ? patch.color : base.color,
    highlight: patch.highlight && HEX.test(patch.highlight) ? patch.highlight : base.highlight,
    position: patch.position && ['bottom', 'middle', 'top'].includes(patch.position) ? patch.position : base.position,
    uppercase: typeof patch.uppercase === 'boolean' ? patch.uppercase : base.uppercase,
    outline: typeof patch.outline === 'boolean' ? patch.outline : base.outline,
    shadow: typeof patch.shadow === 'boolean' ? patch.shadow : base.shadow,
    box: typeof patch.box === 'boolean' ? patch.box : base.box,
    speakerLabels: typeof patch.speakerLabels === 'boolean' ? patch.speakerLabels : base.speakerLabels,
  };
}

const ASPECTS: Aspect[] = ['16:9', '9:16', '1:1', '4:5', 'source'];

/**
 * Apply operations, refusing anything malformed. Returns the new document and
 * a line per refused operation; the caller saves a version only when
 * something changed. Times are clamped to the recording.
 */
export function applyOps(doc: VideoDoc, ops: Op[], duration: number): { doc: VideoDoc; refused: string[] } {
  const d: VideoDoc = JSON.parse(JSON.stringify(doc));
  const refused: string[] = [];
  const range = (s: unknown, e: unknown): [number, number] | null => {
    const a = clamp(s, 0, duration, NaN), b = clamp(e, 0, duration, NaN);
    return Number.isFinite(a) && Number.isFinite(b) && b - a >= 0.04 ? [a, b] : null;
  };
  for (const o of ops.slice(0, 200)) {
    switch (o?.op) {
      case 'cut.add': {
        const r = range(o.s, o.e);
        if (!r) { refused.push('a cut needs a start before its end'); break; }
        d.cuts.push({ id: newId('cu'), s: r[0], e: r[1], kind: 'manual', state: 'approved', reason: text(o.reason, 140) || 'Removed by you', conf: 1, by: 'you' });
        break;
      }
      case 'cut.set': case 'cut.setMany': {
        const ids = new Set(o.op === 'cut.set' ? [o.id] : (o.ids ?? []).slice(0, 2000));
        if (!['proposed', 'approved', 'rejected'].includes(o.state)) { refused.push('unknown cut state'); break; }
        for (const c of d.cuts) if (ids.has(c.id)) c.state = o.state;
        break;
      }
      case 'cut.restoreRange': {
        const r = range(o.s, o.e);
        if (!r) { refused.push('nothing to restore'); break; }
        d.cuts = d.cuts.filter(c => !(c.by === 'you' && c.s < r[1] && c.e > r[0]));
        for (const c of d.cuts) if (c.state === 'approved' && c.s < r[1] && c.e > r[0]) c.state = 'rejected';
        break;
      }
      case 'protect.add': {
        const r = range(o.s, o.e);
        if (!r) { refused.push('a protected part needs a start before its end'); break; }
        d.protects.push({ id: newId('pr'), s: r[0], e: r[1], note: text(o.note, 120) });
        break;
      }
      case 'protect.remove': d.protects = d.protects.filter(p => p.id !== o.id); break;
      case 'caption.edit': {
        if (!Number.isInteger(o.i) || o.i < 0) { refused.push('caption edit names no word'); break; }
        d.captionEdits[String(o.i)] = text(o.text, 80);
        break;
      }
      case 'caption.style': {
        if (o.target !== 'long' && o.target !== 'short') { refused.push('captions are for the long video or the Shorts'); break; }
        d.captions[o.target] = cleanStyle(d.captions[o.target], o.patch ?? {});
        break;
      }
      case 'captions.set':
        if (typeof o.on === 'boolean') d.captions.on = o.on;
        if (typeof o.burn === 'boolean') d.captions.burn = o.burn;
        break;
      case 'clip.add': {
        const r = range(o.s, o.e);
        if (!r || r[1] - r[0] < 3) { refused.push('a Short needs at least three seconds'); break; }
        if (r[1] - r[0] > 180) { refused.push('a Short is at most three minutes'); break; }
        d.clips.push({ id: newId('cl'), title: text(o.title, 100) || 'New Short', topic: text(o.topic, 80), reason: text(o.reason, 240) || 'Added by you',
          s: r[0], e: r[1], scores: null, by: 'you', aspect: d.shorts.aspect, reframe: { mode: d.shorts.mode ?? 'crop', x: 0.5, y: 0.5 } });
        break;
      }
      case 'clip.update': {
        const c = d.clips.find(x => x.id === o.id);
        if (!c) { refused.push('no such Short'); break; }
        const p = o.patch ?? {};
        const r = range(p.s ?? c.s, p.e ?? c.e);
        if (!r || r[1] - r[0] < 3 || r[1] - r[0] > 180) { refused.push('a Short is between three seconds and three minutes'); break; }
        [c.s, c.e] = r;
        if (p.title !== undefined) c.title = text(p.title, 100) || c.title;
        if (p.topic !== undefined) c.topic = text(p.topic, 80);
        if (p.aspect && ['9:16', '1:1', '4:5', '16:9'].includes(p.aspect)) c.aspect = p.aspect;
        if (p.reframe) c.reframe = {
          mode: p.reframe.mode && ['crop', 'fit', 'source'].includes(p.reframe.mode) ? p.reframe.mode : c.reframe.mode,
          x: clamp(p.reframe.x, 0, 1, c.reframe.x), y: clamp(p.reframe.y, 0, 1, c.reframe.y),
        };
        break;
      }
      case 'clip.remove': d.clips = d.clips.filter(c => c.id !== o.id); break;
      case 'long.set': {
        const p = o.patch ?? {};
        if (typeof p.on === 'boolean') d.long.on = p.on;
        if (p.aspect && ASPECTS.includes(p.aspect)) d.long.aspect = p.aspect;
        if (p.reframe) d.long.reframe = {
          mode: p.reframe.mode && ['crop', 'fit', 'source'].includes(p.reframe.mode) ? p.reframe.mode : d.long.reframe.mode,
          x: clamp(p.reframe.x, 0, 1, d.long.reframe.x), y: clamp(p.reframe.y, 0, 1, d.long.reframe.y),
        };
        break;
      }
      case 'audio.set': {
        const p = o.patch ?? {};
        if (typeof p.loudnorm === 'boolean') d.audio.loudnorm = p.loudnorm;
        if (p.denoise && ['off', 'light', 'medium', 'strong'].includes(p.denoise)) d.audio.denoise = p.denoise;
        if (typeof p.voice === 'boolean') d.audio.voice = p.voice;
        if (p.volume !== undefined) d.audio.volume = Math.round(clamp(p.volume, 0.5, 1.5, 1) * 100) / 100;
        break;
      }
      case 'music.set': {
        const t = o.track;
        if (!t || typeof t.key !== 'string' || !t.key || !t.title) { refused.push('no track to add'); break; }
        d.music = {
          id: text(t.id, 80), key: t.key, title: text(t.title, 120), artist: text(t.artist, 120), license: text(t.license, 60),
          licenseUrl: text(t.licenseUrl, 300), attribution: text(t.attribution, 400), source: t.source === 'upload' ? 'upload' : 'openverse',
          sourceUrl: text(t.sourceUrl, 400), duration: clamp(t.duration, 0, 36000, 0),
          volume: clamp(t.volume, 0, 1, MUSIC_DEFAULTS.volume), fadeIn: clamp(t.fadeIn, 0, 10, MUSIC_DEFAULTS.fadeIn), fadeOut: clamp(t.fadeOut, 0, 15, MUSIC_DEFAULTS.fadeOut),
          loop: typeof t.loop === 'boolean' ? t.loop : MUSIC_DEFAULTS.loop, duck: typeof t.duck === 'boolean' ? t.duck : MUSIC_DEFAULTS.duck,
          applyTo: t.applyTo === 'long' || t.applyTo === 'shorts' ? t.applyTo : 'all',
        };
        break;
      }
      case 'music.patch': {
        if (!d.music) { refused.push('there is no music to change — add a track first'); break; }
        const p = o.patch ?? {};
        if (p.volume !== undefined) d.music.volume = Math.round(clamp(p.volume, 0, 1, d.music.volume) * 100) / 100;
        if (p.fadeIn !== undefined) d.music.fadeIn = clamp(p.fadeIn, 0, 10, d.music.fadeIn);
        if (p.fadeOut !== undefined) d.music.fadeOut = clamp(p.fadeOut, 0, 15, d.music.fadeOut);
        if (typeof p.loop === 'boolean') d.music.loop = p.loop;
        if (typeof p.duck === 'boolean') d.music.duck = p.duck;
        if (p.applyTo === 'all' || p.applyTo === 'long' || p.applyTo === 'shorts') d.music.applyTo = p.applyTo;
        break;
      }
      case 'music.remove': d.music = null; break;
      case 'look.set': {
        if (o.target !== 'long' && o.target !== 'short') { refused.push('a look is for the long video or the Shorts'); break; }
        const cur = o.reset ? { ...LOOK_DEFAULT } : lookOf(d, o.target);
        const p = o.patch ?? {};
        const n = (k: keyof Look, lo: number, hi: number) => { if (p[k] !== undefined) (cur as unknown as Record<string, number>)[k] = Math.round(clamp(p[k], lo, hi, cur[k] as number)); };
        if (p.filter && (FILTER_PRESETS as readonly string[]).includes(p.filter)) cur.filter = p.filter;
        for (const k of ['temperature', 'tint', 'brightness', 'contrast', 'saturation', 'exposure'] as const) n(k, -100, 100);
        n('hue', -180, 180);
        for (const k of ['sharpness', 'blur', 'vignette', 'grain'] as const) n(k, 0, 100);
        d.look = { long: lookOf(d, 'long'), short: lookOf(d, 'short'), [o.target]: cur };
        break;
      }
      case 'motion.set': {
        if (o.target !== 'long' && o.target !== 'short') { refused.push('motion is for the long video or the Shorts'); break; }
        const cur = motionOf(d, o.target);
        const p = o.patch ?? {};
        if (p.zoom && ['off', 'punch', 'slow'].includes(p.zoom)) cur.zoom = p.zoom;
        if (p.zoomAmount !== undefined) cur.zoomAmount = Math.round(clamp(p.zoomAmount, 1.03, 1.35, cur.zoomAmount) * 100) / 100;
        if (p.transition && ['none', 'flash', 'dip'].includes(p.transition)) cur.transition = p.transition;
        if (p.fadeIn !== undefined) cur.fadeIn = Math.round(clamp(p.fadeIn, 0, 5, cur.fadeIn) * 10) / 10;
        if (p.fadeOut !== undefined) cur.fadeOut = Math.round(clamp(p.fadeOut, 0, 5, cur.fadeOut) * 10) / 10;
        if (p.speed !== undefined) cur.speed = Math.round(clamp(p.speed, 0.5, 2, cur.speed) * 100) / 100;
        if (typeof p.progressBar === 'boolean') cur.progressBar = p.progressBar;
        d.motion = { long: motionOf(d, 'long'), short: motionOf(d, 'short'), [o.target]: cur };
        break;
      }
      case 'tracking.set': {
        if (o.target !== 'long' && o.target !== 'short') { refused.push('tracking is for the long video or the Shorts'); break; }
        if (!['off', 'face', 'speaker'].includes(o.mode)) { refused.push('unknown tracking'); break; }
        d.tracking = { long: trackingOf(d, 'long'), short: trackingOf(d, 'short'), [o.target]: o.mode };
        break;
      }
      case 'overlay.add': {
        const r = range(o.s, o.e);
        const t = text(o.text, 120);
        if (!r || r[1] - r[0] < 0.3) { refused.push('words on screen need at least a third of a second'); break; }
        if (!t) { refused.push('words on screen need some words'); break; }
        if ((d.overlays ?? []).length >= 200) { refused.push('at most 200 overlays'); break; }
        d.overlays = [...(d.overlays ?? []), {
          id: newId('ov'), s: r[0], e: r[1], text: t,
          style: OVERLAY_STYLES.includes(o.style as Overlay['style']) ? o.style! : 'title',
          position: o.position && ['top', 'middle', 'bottom'].includes(o.position) ? o.position : 'top',
          anim: OVERLAY_ANIMS.includes(o.anim as Overlay['anim']) ? o.anim! : 'pop',
          color: o.color && HEX.test(o.color) ? o.color : '#ffffff',
          bg: o.bg && HEX.test(o.bg) ? o.bg : '#7c3aed',
        }];
        break;
      }
      case 'overlay.update': {
        const ov = (d.overlays ?? []).find(x => x.id === o.id);
        if (!ov) { refused.push('no such overlay'); break; }
        const p = o.patch ?? {};
        const r = range(p.s ?? ov.s, p.e ?? ov.e);
        if (!r || r[1] - r[0] < 0.3) { refused.push('words on screen need at least a third of a second'); break; }
        [ov.s, ov.e] = r;
        if (p.text !== undefined) ov.text = text(p.text, 120) || ov.text;
        if (p.style && OVERLAY_STYLES.includes(p.style)) ov.style = p.style;
        if (p.position && ['top', 'middle', 'bottom'].includes(p.position)) ov.position = p.position;
        if (p.anim && OVERLAY_ANIMS.includes(p.anim)) ov.anim = p.anim;
        if (p.color && HEX.test(p.color)) ov.color = p.color;
        if (p.bg && HEX.test(p.bg)) ov.bg = p.bg;
        break;
      }
      case 'overlay.remove': d.overlays = (d.overlays ?? []).filter(x => x.id !== o.id); break;
      case 'clip.duplicate': {
        const c = d.clips.find(x => x.id === o.id);
        if (!c) { refused.push('no such Short'); break; }
        if (d.clips.length >= 40) { refused.push('at most 40 Shorts in a project'); break; }
        const copy = { ...JSON.parse(JSON.stringify(c)), id: newId('cl'), title: `${c.title} (copy)`.slice(0, 100), by: 'you' as const, scores: c.scores, reason: 'A copy, to try a different version' };
        d.clips.splice(d.clips.indexOf(c) + 1, 0, copy);
        break;
      }
      case 'thumbnail.headline': d.thumbnails.headline[text(o.target, 60)] = text(o.text, 90); break;
      case 'shorts.set': {
        const p = o.patch ?? {};
        if (p.count !== undefined) d.shorts.count = Math.round(clamp(p.count, 0, SHORTS_MAX, d.shorts.count));
        if (p.min !== undefined) d.shorts.min = Math.round(clamp(p.min, 10, 170, d.shorts.min));
        if (p.max !== undefined) d.shorts.max = Math.round(clamp(p.max, d.shorts.min + 5, 180, d.shorts.max));
        if (p.aspect && ['9:16', '1:1', '4:5'].includes(p.aspect)) d.shorts.aspect = p.aspect;
        break;
      }
      case 'cleanup.preset': {
        if (!['conservative', 'balanced', 'aggressive'].includes(o.preset)) { refused.push('unknown cleanup level'); break; }
        /* The rule proposals are replaced; a decision somebody already made
           about the same cut (same id) is kept, and their own cuts stay. */
        const decided = new Map(d.cuts.filter(c => c.by !== 'you').map(c => [c.id, c.state]));
        const fresh = (o.cuts ?? []).map(c => ({ ...c, state: decided.get(c.id) && decided.get(c.id) !== 'proposed' ? decided.get(c.id)! : c.state }));
        d.cuts = [...d.cuts.filter(c => c.by === 'you'), ...fresh];
        d.cleanup = { preset: o.preset, ran: true };
        break;
      }
      default:
        refused.push(`unknown operation ${(o as { op?: string })?.op ?? ''}`);
    }
  }
  return { doc: d, refused };
}

/**
 * The output's dimensions. "source" keeps the recording's own shape, at most
 * 1920 on the long side; the rest are the platforms' standard sizes.
 */
export function dimsFor(aspect: Aspect, srcW: number, srcH: number): { width: number; height: number } {
  switch (aspect) {
    case '9:16': return { width: 1080, height: 1920 };
    case '1:1': return { width: 1080, height: 1080 };
    case '4:5': return { width: 1080, height: 1350 };
    case '16:9': return { width: 1920, height: 1080 };
    default: {
      const k = Math.min(1, 1920 / Math.max(srcW, srcH, 1));
      const ev = (n: number) => Math.max(2, Math.round(n / 2) * 2);
      return { width: ev(srcW * k), height: ev(srcH * k) };
    }
  }
}

/** A stable short hash of anything JSON — what decides whether a render is still current. */
export function hashOf(v: unknown): string {
  const s = JSON.stringify(v);
  let h1 = 0x811c9dc5, h2 = 0x01000193;
  for (let i = 0; i < s.length; i++) {
    const c = s.charCodeAt(i);
    h1 = Math.imul(h1 ^ c, 16777619) >>> 0;
    h2 = Math.imul(h2 + c, 2246822519) >>> 0;
  }
  return h1.toString(36) + h2.toString(36);
}

/** Seconds as m:ss or h:mm:ss. */
export function clock(t: number): string {
  const s = Math.max(0, Math.round(t));
  const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), r = s % 60;
  return h ? `${h}:${String(m).padStart(2, '0')}:${String(r).padStart(2, '0')}` : `${m}:${String(r).padStart(2, '0')}`;
}
