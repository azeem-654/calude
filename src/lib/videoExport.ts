import type { Caption, ClipSegment, BrandPosition } from '../types';

export type CaptionStyle = 'classic' | 'karaoke' | 'bold' | 'minimal' | 'neon';
export type ExportResolution = '720p' | '1080p' | '4k';
export type SfxKind = 'none' | 'riser' | 'whoosh' | 'pops';

const RES_SCALE: Record<ExportResolution, number> = { '720p': 2 / 3, '1080p': 1, '4k': 2 };

export interface ExportClipParams {
  sourceBlobUrl: string;
  startTime: number;
  endTime: number;
  aspectRatio: '9:16' | '1:1' | '16:9';
  captions: Caption[];
  captionStyle?: CaptionStyle;
  /** AI Reframe focal point (0-1); defaults to center 0.5/0.5. */
  focusX?: number;
  focusY?: number;
  /** Enhance Speech: high-pass + compressor + makeup gain on the audio. */
  enhanceSpeech?: boolean;
  /** Synthesized sound effect mixed into the output. */
  sfx?: SfxKind;
  resolution?: ExportResolution;
  /** AI Image B-Roll: cutaway cards drawn during [start,end] (seconds relative to clip start). */
  brollImages?: { url: string; start: number; end: number }[];
  /** Montage segments cut from different parts of the source, stitched in order.
      When absent, the single [startTime,endTime] range is used. */
  segments?: ClipSegment[];
  /** Mood-matched background music id (see MUSIC_MOODS), mixed under the voice. */
  music?: string;
  /** Optional intro/outro title cards, rendered before/after the body. */
  intro?: string;
  outro?: string;
  /** Gradient for the intro/outro cards. */
  cardGradient?: string;
  /** Branding overlays burned onto every frame. */
  branding?: BrandingOptions;
  onProgress?: (pct: number) => void;
}

export interface BrandingOptions {
  logoUrl?: string;
  logoPosition?: BrandPosition;
  logoScale?: number;
  logoOpacity?: number;
  brandText?: string;
  brandTextPosition?: BrandPosition;
  brandTextStyle?: 'pill' | 'bar' | 'plain';
  brandTextColor?: string;
  brandTextBg?: string;
}

const CARD_SECONDS = 1.8;

/** Normalize a clip's segments; falls back to the single [start,end] span. */
export function normalizeSegments(segments: ClipSegment[] | undefined, start: number, end: number): ClipSegment[] {
  const segs = (segments ?? []).filter(s => s.end > s.start).sort((a, b) => a.start - b.start);
  return segs.length ? segs : [{ start, end }];
}

export function segmentsDuration(segs: ClipSegment[]): number {
  return segs.reduce((sum, s) => sum + (s.end - s.start), 0);
}

/** Draw a rounded B-roll cutaway card across the top half of the frame. */
export function drawBrollCard(ctx: CanvasRenderingContext2D, img: HTMLImageElement, w: number, h: number) {
  const cardW = w * 0.86, cardH = cardW * (9 / 16);
  const x = (w - cardW) / 2, y = h * 0.08;
  const r = Math.min(24, cardW * 0.04);
  ctx.save();
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + cardW, y, x + cardW, y + cardH, r);
  ctx.arcTo(x + cardW, y + cardH, x, y + cardH, r);
  ctx.arcTo(x, y + cardH, x, y, r);
  ctx.arcTo(x, y, x + cardW, y, r);
  ctx.closePath();
  ctx.shadowColor = 'rgba(0,0,0,0.5)';
  ctx.shadowBlur = 24;
  ctx.fillStyle = '#000';
  ctx.fill();
  ctx.shadowColor = 'transparent';
  ctx.shadowBlur = 0;
  ctx.clip();
  // cover-fit the image into the card
  const iw = img.naturalWidth, ih = img.naturalHeight;
  const srcRatio = iw / ih, dstRatio = cardW / cardH;
  let sx = 0, sy = 0, sw = iw, sh = ih;
  if (srcRatio > dstRatio) { sw = ih * dstRatio; sx = (iw - sw) / 2; }
  else { sh = iw / dstRatio; sy = (ih - sh) / 2; }
  ctx.drawImage(img, sx, sy, sw, sh, x, y, cardW, cardH);
  ctx.restore();
  ctx.lineWidth = Math.max(2, w * 0.004);
  ctx.strokeStyle = 'rgba(255,255,255,0.85)';
  ctx.stroke();
}

/* ── Shared caption painter (used by real + synthetic exports) ──
   `progress` (0-1 within the caption window) drives the karaoke highlight. */
export function drawStyledCaption(
  ctx: CanvasRenderingContext2D,
  opts: { w: number; h: number; text: string; emoji?: string; style: CaptionStyle; progress: number; accent?: string },
) {
  const { w, h, style } = opts;
  const fontSize = Math.round(h * (style === 'minimal' ? 0.036 : 0.045));
  ctx.font = `800 ${fontSize}px Inter, Arial, sans-serif`;
  ctx.textAlign = 'center';
  const full = `${opts.emoji ? opts.emoji + ' ' : ''}${opts.text}`;
  const y = h * 0.82;

  if (style === 'karaoke') {
    // Words light up as the caption plays.
    const words = full.split(' ');
    const activeIdx = Math.min(words.length - 1, Math.floor(opts.progress * words.length));
    const widths = words.map(word => ctx.measureText(word + ' ').width);
    const total = widths.reduce((a, b) => a + b, 0);
    const pad = fontSize * 0.5;
    ctx.fillStyle = 'rgba(0,0,0,0.72)';
    ctx.fillRect(w / 2 - total / 2 - pad, y - fontSize, total + pad * 2, fontSize * 1.5);
    let x = w / 2 - total / 2;
    ctx.textAlign = 'left';
    words.forEach((word, i) => {
      if (i === activeIdx) {
        ctx.fillStyle = '#ffe14d';
        ctx.fillRect(x - fontSize * 0.08, y - fontSize * 0.92, widths[i], fontSize * 1.18);
        ctx.fillStyle = '#17191c';
      } else {
        ctx.fillStyle = i < activeIdx ? '#ffe14d' : '#ffffff';
      }
      ctx.fillText(word, x, y);
      x += widths[i];
    });
    ctx.textAlign = 'center';
    return;
  }

  const metrics = ctx.measureText(full);
  const pad = fontSize * 0.5;
  if (style === 'classic') {
    ctx.fillStyle = 'rgba(0,0,0,0.72)';
    ctx.fillRect(w / 2 - metrics.width / 2 - pad, y - fontSize, metrics.width + pad * 2, fontSize * 1.5);
    ctx.fillStyle = '#ffffff';
    ctx.fillText(full, w / 2, y);
  } else if (style === 'bold') {
    ctx.lineWidth = Math.max(2, fontSize * 0.16);
    ctx.lineJoin = 'round';
    ctx.strokeStyle = '#000000';
    ctx.strokeText(full.toUpperCase(), w / 2, y);
    ctx.fillStyle = '#ffe14d';
    ctx.fillText(full.toUpperCase(), w / 2, y);
  } else if (style === 'minimal') {
    ctx.fillStyle = 'rgba(0,0,0,0.45)';
    ctx.fillRect(w / 2 - metrics.width / 2 - pad, y - fontSize, metrics.width + pad * 2, fontSize * 1.5);
    ctx.fillStyle = 'rgba(255,255,255,0.95)';
    ctx.fillText(full, w / 2, y);
  } else if (style === 'neon') {
    ctx.shadowColor = opts.accent ?? '#8b5cf6';
    ctx.shadowBlur = fontSize * 0.6;
    ctx.fillStyle = '#ffffff';
    ctx.fillText(full, w / 2, y);
    ctx.fillText(full, w / 2, y); // double pass = stronger glow
    ctx.shadowColor = 'transparent';
    ctx.shadowBlur = 0;
  }
}

/* ── Synthesized sound effects (WebAudio — no assets needed) ── */
export function scheduleSfx(
  audioCtx: AudioContext | OfflineAudioContext,
  dest: AudioNode,
  kind: SfxKind,
  startAt: number,
  captionOffsets: number[] = [],
) {
  if (kind === 'none') return;
  const now = startAt;
  if (kind === 'riser') {
    const osc = audioCtx.createOscillator();
    const gain = audioCtx.createGain();
    osc.type = 'sawtooth';
    osc.frequency.setValueAtTime(70, now);
    osc.frequency.exponentialRampToValueAtTime(520, now + 1.2);
    gain.gain.setValueAtTime(0.0001, now);
    gain.gain.exponentialRampToValueAtTime(0.16, now + 0.9);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + 1.25);
    osc.connect(gain); gain.connect(dest);
    osc.start(now); osc.stop(now + 1.3);
  } else if (kind === 'whoosh') {
    const dur = 0.8;
    const buf = audioCtx.createBuffer(1, audioCtx.sampleRate * dur, audioCtx.sampleRate);
    const data = buf.getChannelData(0);
    for (let i = 0; i < data.length; i++) data[i] = (Math.random() * 2 - 1) * (1 - i / data.length);
    const srcNode = audioCtx.createBufferSource();
    srcNode.buffer = buf;
    const bp = audioCtx.createBiquadFilter();
    bp.type = 'bandpass';
    bp.frequency.setValueAtTime(300, now);
    bp.frequency.exponentialRampToValueAtTime(2800, now + dur);
    bp.Q.value = 1.2;
    const gain = audioCtx.createGain();
    gain.gain.setValueAtTime(0.35, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + dur);
    srcNode.connect(bp); bp.connect(gain); gain.connect(dest);
    srcNode.start(now);
  } else if (kind === 'pops') {
    captionOffsets.slice(0, 24).forEach(off => {
      const t = now + Math.max(0, off);
      const osc = audioCtx.createOscillator();
      const gain = audioCtx.createGain();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(660, t);
      osc.frequency.exponentialRampToValueAtTime(330, t + 0.06);
      gain.gain.setValueAtTime(0.18, t);
      gain.gain.exponentialRampToValueAtTime(0.0001, t + 0.07);
      osc.connect(gain); gain.connect(dest);
      osc.start(t); osc.stop(t + 0.09);
    });
  }
}

/* ── Mood-matched background music (WebAudio-synthesized, no assets) ── */
interface MoodParams { tempo: number; wave: OscillatorType; gain: number; prog: number[]; arp: boolean; kick: boolean }
const MUSIC_MOODS: Record<string, MoodParams> = {
  lofi:         { tempo: 74,  wave: 'sine',     gain: 0.075, prog: [220, 196, 174, 196], arp: true,  kick: false },
  upbeat:       { tempo: 122, wave: 'sawtooth', gain: 0.05,  prog: [261, 329, 392, 349], arp: true,  kick: true  },
  motivational: { tempo: 102, wave: 'triangle', gain: 0.06,  prog: [261, 293, 329, 392], arp: true,  kick: true  },
  cinematic:    { tempo: 60,  wave: 'sine',     gain: 0.085, prog: [130, 146, 174, 196], arp: false, kick: false },
  corporate:    { tempo: 104, wave: 'triangle', gain: 0.05,  prog: [261, 329, 349, 392], arp: true,  kick: false },
  acoustic:     { tempo: 88,  wave: 'triangle', gain: 0.06,  prog: [196, 246, 293, 246], arp: true,  kick: false },
  hiphop:       { tempo: 90,  wave: 'square',   gain: 0.045, prog: [110, 146, 130, 164], arp: true,  kick: true  },
};

/** Schedule a low-volume musical bed under the voice for `duration` seconds. */
export function scheduleMusic(
  audioCtx: AudioContext | OfflineAudioContext,
  dest: AudioNode,
  mood: string | undefined,
  startAt: number,
  duration: number,
) {
  const p = mood && mood !== 'none' ? MUSIC_MOODS[mood] : undefined;
  if (!p) return;
  const master = audioCtx.createGain();
  master.gain.value = p.gain;
  const lp = audioCtx.createBiquadFilter();
  lp.type = 'lowpass';
  lp.frequency.value = 4200;
  master.connect(lp); lp.connect(dest);

  const beat = 60 / p.tempo;
  const bars = Math.ceil(duration / (beat * 4));
  for (let bar = 0; bar < bars; bar++) {
    const barStart = startAt + bar * beat * 4;
    const root = p.prog[bar % p.prog.length];
    // Sustained pad chord (root + fifth) for the whole bar.
    [root / 2, (root / 2) * 1.5].forEach(freq => {
      const osc = audioCtx.createOscillator();
      const g = audioCtx.createGain();
      osc.type = p.wave; osc.frequency.value = freq;
      g.gain.setValueAtTime(0.0001, barStart);
      g.gain.exponentialRampToValueAtTime(0.5, barStart + 0.3);
      g.gain.setValueAtTime(0.5, barStart + beat * 4 - 0.3);
      g.gain.exponentialRampToValueAtTime(0.0001, barStart + beat * 4);
      osc.connect(g); g.connect(master);
      osc.start(barStart); osc.stop(barStart + beat * 4);
    });
    // Arpeggio (eighth notes over the chord).
    if (p.arp) {
      const ratios = [1, 1.25, 1.5, 2];
      for (let e = 0; e < 8; e++) {
        const t = barStart + e * (beat / 2);
        if (t > startAt + duration) break;
        const osc = audioCtx.createOscillator();
        const g = audioCtx.createGain();
        osc.type = p.wave; osc.frequency.value = root * ratios[e % ratios.length];
        g.gain.setValueAtTime(0.22, t);
        g.gain.exponentialRampToValueAtTime(0.0001, t + beat * 0.45);
        osc.connect(g); g.connect(master);
        osc.start(t); osc.stop(t + beat * 0.5);
      }
    }
    // Kick on beats 1 & 3.
    if (p.kick) {
      [0, 2].forEach(bt => {
        const t = barStart + bt * beat;
        if (t > startAt + duration) return;
        const osc = audioCtx.createOscillator();
        const g = audioCtx.createGain();
        osc.type = 'sine';
        osc.frequency.setValueAtTime(140, t);
        osc.frequency.exponentialRampToValueAtTime(45, t + 0.12);
        g.gain.setValueAtTime(0.9, t);
        g.gain.exponentialRampToValueAtTime(0.0001, t + 0.16);
        osc.connect(g); g.connect(master);
        osc.start(t); osc.stop(t + 0.18);
      });
    }
  }
}

/**
 * Resolve a BrandPosition to an anchor box inside the frame, keeping overlays
 * clear of the caption band that sits across the lower-middle of the frame.
 */
function brandAnchor(pos: BrandPosition | undefined, w: number, h: number) {
  const p = pos ?? 'top-right';
  const margin = Math.round(w * 0.045);
  const top = p.startsWith('top');
  const y = top ? margin : h - margin;
  const align: CanvasTextAlign = p.endsWith('left') ? 'left' : p.endsWith('right') ? 'right' : 'center';
  const x = p.endsWith('left') ? margin : p.endsWith('right') ? w - margin : w / 2;
  return { x, y, align, top, margin };
}

/** Draw the brand logo onto the current frame. */
export function drawLogo(ctx: CanvasRenderingContext2D, img: HTMLImageElement, w: number, h: number, opts: BrandingOptions) {
  if (!img.naturalWidth || !img.naturalHeight) return;
  const scale = Math.min(0.35, Math.max(0.06, opts.logoScale ?? 0.16));
  const targetW = w * scale;
  const targetH = targetW * (img.naturalHeight / img.naturalWidth);
  const { x, y, align, top } = brandAnchor(opts.logoPosition ?? 'top-right', w, h);
  const dx = align === 'left' ? x : align === 'right' ? x - targetW : x - targetW / 2;
  const dy = top ? y : y - targetH;

  ctx.save();
  ctx.globalAlpha = Math.min(1, Math.max(0.1, opts.logoOpacity ?? 1));
  // Soft shadow keeps light logos readable over bright footage.
  ctx.shadowColor = 'rgba(0,0,0,0.35)';
  ctx.shadowBlur = Math.round(w * 0.02);
  ctx.drawImage(img, dx, dy, targetW, targetH);
  ctx.restore();
}

/** Draw the website / CTA text overlay onto the current frame. */
export function drawBrandText(ctx: CanvasRenderingContext2D, w: number, h: number, opts: BrandingOptions) {
  const text = (opts.brandText ?? '').trim();
  if (!text) return;
  const style = opts.brandTextStyle ?? 'pill';
  const fs = Math.round(w * 0.042);
  const padX = Math.round(fs * 0.75);
  const padY = Math.round(fs * 0.45);
  const color = opts.brandTextColor || '#ffffff';
  const bg = opts.brandTextBg || 'rgba(15,23,42,0.72)';
  const { x, y, align, top, margin } = brandAnchor(opts.brandTextPosition ?? 'bottom-center', w, h);

  ctx.save();
  ctx.font = `700 ${fs}px Inter, system-ui, -apple-system, sans-serif`;
  ctx.textBaseline = 'middle';
  const textW = ctx.measureText(text).width;
  const boxW = textW + padX * 2;
  const boxH = fs + padY * 2;
  const boxX = align === 'left' ? x : align === 'right' ? x - boxW : x - boxW / 2;
  const boxY = top ? y : y - boxH;
  const cy = boxY + boxH / 2;

  if (style === 'bar') {
    ctx.fillStyle = bg;
    ctx.fillRect(0, boxY, w, boxH);
  } else if (style === 'pill') {
    const r = boxH / 2;
    ctx.fillStyle = bg;
    ctx.beginPath();
    ctx.moveTo(boxX + r, boxY);
    ctx.lineTo(boxX + boxW - r, boxY);
    ctx.arcTo(boxX + boxW, boxY, boxX + boxW, boxY + r, r);
    ctx.lineTo(boxX + boxW, boxY + boxH - r);
    ctx.arcTo(boxX + boxW, boxY + boxH, boxX + boxW - r, boxY + boxH, r);
    ctx.lineTo(boxX + r, boxY + boxH);
    ctx.arcTo(boxX, boxY + boxH, boxX, boxY + boxH - r, r);
    ctx.lineTo(boxX, boxY + r);
    ctx.arcTo(boxX, boxY, boxX + r, boxY, r);
    ctx.closePath();
    ctx.fill();
  }

  // A full-width bar always centres its label; pill/plain follow the anchor box.
  const textX = style === 'bar' ? w / 2 : boxX + boxW / 2;
  ctx.textAlign = 'center';
  ctx.fillStyle = color;
  if (style === 'plain') {
    // No plate behind the text — outline it so it stays legible on any footage.
    ctx.lineWidth = Math.max(2, fs * 0.13);
    ctx.strokeStyle = 'rgba(0,0,0,0.6)';
    ctx.lineJoin = 'round';
    ctx.strokeText(text, textX, cy);
  }
  ctx.fillText(text, textX, cy);
  ctx.restore();
}

/** Draw a full-frame intro/outro title card. */
export function drawTitleCard(ctx: CanvasRenderingContext2D, w: number, h: number, text: string, gradient: string, progress: number) {
  const hexes = gradient.match(/#[0-9a-fA-F]{3,8}/g) ?? ['#6366f1', '#8b5cf6'];
  const g = ctx.createLinearGradient(0, 0, w, h);
  g.addColorStop(0, hexes[0]); g.addColorStop(1, hexes[1] ?? hexes[0]);
  ctx.fillStyle = g; ctx.fillRect(0, 0, w, h);
  // Fade/scale in.
  const a = Math.min(1, progress * 3);
  ctx.save();
  ctx.globalAlpha = a;
  ctx.translate(w / 2, h / 2);
  ctx.scale(0.9 + 0.1 * a, 0.9 + 0.1 * a);
  ctx.textAlign = 'center';
  const fs = Math.round(w * 0.09);
  ctx.font = `900 ${fs}px Inter, 'Arial Black', Arial, sans-serif`;
  const words = text.toUpperCase().split(/\s+/);
  const lines: string[] = []; let line = '';
  for (const word of words) { const test = line ? `${line} ${word}` : word; if (ctx.measureText(test).width > w * 0.8 && line) { lines.push(line); line = word; } else line = test; }
  if (line) lines.push(line);
  const startY = -((lines.length - 1) * fs * 1.15) / 2;
  ctx.lineWidth = fs * 0.14; ctx.lineJoin = 'round'; ctx.strokeStyle = 'rgba(0,0,0,0.55)';
  ctx.fillStyle = '#ffffff';
  lines.slice(0, 4).forEach((ln, i) => { const y = startY + i * fs * 1.15; ctx.strokeText(ln, 0, y); ctx.fillText(ln, 0, y); });
  ctx.restore();
}

export interface ExportResult {
  blob: Blob;
  mimeType: string;
  fileExt: string;
}

const CANVAS_DIMS: Record<ExportClipParams['aspectRatio'], { w: number; h: number }> = {
  '9:16': { w: 1080, h: 1920 },
  '1:1':  { w: 1080, h: 1080 },
  '16:9': { w: 1920, h: 1080 },
};

function pickMimeType(): { mimeType: string; fileExt: string } {
  const candidates = [
    { mimeType: 'video/mp4;codecs=avc1,mp4a.40.2', fileExt: 'mp4' },
    { mimeType: 'video/webm;codecs=vp9,opus', fileExt: 'webm' },
    { mimeType: 'video/webm;codecs=vp8,opus', fileExt: 'webm' },
    { mimeType: 'video/webm', fileExt: 'webm' },
  ];
  for (const c of candidates) {
    if (typeof MediaRecorder !== 'undefined' && MediaRecorder.isTypeSupported(c.mimeType)) return c;
  }
  return { mimeType: 'video/webm', fileExt: 'webm' };
}

export function canExportVideo(): boolean {
  return typeof MediaRecorder !== 'undefined' && typeof HTMLCanvasElement.prototype.captureStream === 'function';
}

/**
 * Renders a real, downloadable video file for a clip: crops the source video to the
 * target aspect ratio, burns in the active caption per frame, and records real-time
 * via canvas.captureStream() + MediaRecorder. Runs in wall-clock time bounded by the
 * clip's duration (no server-side transcoding is available in this app).
 */
export async function exportClipToVideo(params: ExportClipParams): Promise<ExportResult> {
  if (!canExportVideo()) {
    throw new Error('Your browser does not support in-browser video export. Try Chrome, Edge, or Firefox.');
  }

  const scale = RES_SCALE[params.resolution ?? '1080p'];
  const w = Math.round(CANVAS_DIMS[params.aspectRatio].w * scale);
  const h = Math.round(CANVAS_DIMS[params.aspectRatio].h * scale);
  const segs = normalizeSegments(params.segments, params.startTime, params.endTime);
  const clipDuration = segmentsDuration(segs);
  const multiSeg = segs.length > 1;
  if (clipDuration <= 0) throw new Error('Invalid clip duration.');
  // Output-timeline start of each segment (cumulative).
  const segOutStart: number[] = [];
  segs.reduce((acc, s, i) => { segOutStart[i] = acc; return acc + (s.end - s.start); }, 0);

  const video = document.createElement('video');
  video.src = params.sourceBlobUrl;
  video.crossOrigin = 'anonymous';
  video.muted = false;
  video.playsInline = true;

  await new Promise<void>((resolve, reject) => {
    video.onloadedmetadata = () => resolve();
    video.onerror = () => reject(new Error('Could not load source video for export.'));
  });

  await new Promise<void>((resolve) => {
    const onSeeked = () => { video.removeEventListener('seeked', onSeeked); resolve(); };
    video.addEventListener('seeked', onSeeked);
    video.currentTime = segs[0].start;
  });

  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Canvas rendering is not supported in this browser.');

  // Route audio through a silent Web Audio graph so export doesn't play out loud,
  // while still feeding a real audio track into the recorded stream.
  const AudioCtx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
  const audioCtx = new AudioCtx();
  const audioSource = audioCtx.createMediaElementSource(video);
  const audioDest = audioCtx.createMediaStreamDestination();
  if (params.enhanceSpeech) {
    // Enhance Speech: cut rumble, tame peaks, lift the voice.
    const highpass = audioCtx.createBiquadFilter();
    highpass.type = 'highpass';
    highpass.frequency.value = 85;
    const comp = audioCtx.createDynamicsCompressor();
    comp.threshold.value = -24;
    comp.knee.value = 24;
    comp.ratio.value = 4;
    comp.attack.value = 0.003;
    comp.release.value = 0.25;
    const makeup = audioCtx.createGain();
    makeup.gain.value = 1.35;
    audioSource.connect(highpass); highpass.connect(comp); comp.connect(makeup); makeup.connect(audioDest);
  } else {
    audioSource.connect(audioDest);
  }
  if (audioCtx.state === 'suspended') await audioCtx.resume();

  const introDur = params.intro?.trim() ? CARD_SECONDS : 0;
  const outroDur = params.outro?.trim() ? CARD_SECONDS : 0;
  const totalOut = introDur + clipDuration + outroDur;
  const cardGradient = params.cardGradient ?? 'linear-gradient(135deg,#6366f1,#8b5cf6)';

  // Caption windows on the OUTPUT timeline, offset past the intro card. Montage
  // captions are already output-timed; single-cut captions carry source times.
  const captionOut = params.captions.map(c => multiSeg
    ? { cap: c, start: introDur + c.startTime, end: introDur + c.endTime }
    : { cap: c, start: introDur + (c.startTime - params.startTime), end: introDur + (c.endTime - params.startTime) });

  // AI Sound Effect + mood music, scheduled into the recorded track.
  if (params.sfx && params.sfx !== 'none') {
    const offsets = captionOut.map(c => c.start).filter(o => o >= 0 && o < totalOut);
    scheduleSfx(audioCtx, audioDest, params.sfx, audioCtx.currentTime + 0.1 + introDur, offsets.map(o => o - introDur));
  }
  scheduleMusic(audioCtx, audioDest, params.music, audioCtx.currentTime + 0.05, totalOut);

  const canvasStream = (canvas as HTMLCanvasElement & { captureStream: (fps?: number) => MediaStream }).captureStream(30);
  const combined = new MediaStream([
    ...canvasStream.getVideoTracks(),
    ...audioDest.stream.getAudioTracks(),
  ]);

  const { mimeType, fileExt } = pickMimeType();
  const recorder = new MediaRecorder(combined, { mimeType, videoBitsPerSecond: 8_000_000 });
  const chunks: BlobPart[] = [];
  recorder.ondataavailable = e => { if (e.data.size > 0) chunks.push(e.data); };

  const focusX = params.focusX ?? 0.5;
  const focusY = params.focusY ?? 0.5;

  // Segment playback state.
  let segIdx = 0;
  const activeCaptionFor = (outElapsed: number) => captionOut.find(c => outElapsed >= c.start && outElapsed < c.end);

  // AI Image B-Roll: preload cutaway images (failed loads are skipped).
  const brollLoaded: { img: HTMLImageElement; start: number; end: number }[] = [];
  if (params.brollImages?.length) {
    const loaded = await Promise.all(params.brollImages.map(async b => ({ ...b, img: await loadImage(b.url) })));
    loaded.forEach(b => { if (b.img) brollLoaded.push({ img: b.img, start: b.start, end: b.end }); });
  }

  // Branding: preload the logo once so every frame can stamp it cheaply.
  const brand = params.branding;
  const brandLogo = brand?.logoUrl ? await loadImage(brand.logoUrl) : null;
  const hasBranding = !!(brandLogo || brand?.brandText?.trim());
  /** Stamp logo + website text over the current frame (drawn last, above captions). */
  const drawBranding = () => {
    if (!brand) return;
    if (brandLogo) drawLogo(ctx, brandLogo, w, h, brand);
    drawBrandText(ctx, w, h, brand);
  };

  // Output-timeline position accounting for the intro card offset.
  const outputElapsed = () => introDur + segOutStart[segIdx] + Math.max(0, video.currentTime - segs[segIdx].start);

  const drawBody = () => {
    // cover-fit crop from source video, anchored on the AI Reframe focal point
    const vw = video.videoWidth, vh = video.videoHeight;
    const srcRatio = vw / vh, dstRatio = w / h;
    let sx = 0, sy = 0, sw = vw, sh = vh;
    if (srcRatio > dstRatio) { sw = vh * dstRatio; sx = (vw - sw) * focusX; }
    else { sh = vw / dstRatio; sy = (vh - sh) * focusY; }
    ctx.drawImage(video, sx, sy, sw, sh, 0, 0, w, h);

    const rel = outputElapsed();
    const activeBroll = brollLoaded.find(b => rel >= b.start && rel < b.end);
    if (activeBroll) drawBrollCard(ctx, activeBroll.img, w, h);

    const cap = activeCaptionFor(rel);
    if (cap) {
      const progress = Math.max(0, Math.min(1, (rel - cap.start) / Math.max(0.001, cap.end - cap.start)));
      drawStyledCaption(ctx, { w, h, text: cap.cap.text, emoji: cap.cap.emoji, style: params.captionStyle ?? 'classic', progress });
    }
    if (hasBranding) drawBranding();
  };

  let rafId = 0;
  let recStart = 0;
  let phase: 'intro' | 'body' | 'outro' = introDur ? 'intro' : 'body';
  let outroStart = 0;

  const cleanup = () => {
    cancelAnimationFrame(rafId);
    audioSource.disconnect();
    audioCtx.close().catch(() => {});
    video.pause();
    video.src = '';
  };

  return new Promise<ExportResult>((resolve, reject) => {
    recorder.onstop = () => {
      cleanup();
      if (chunks.length === 0) { reject(new Error('Recording produced no data.')); return; }
      resolve({ blob: new Blob(chunks, { type: mimeType }), mimeType, fileExt });
    };
    recorder.onerror = () => { cleanup(); reject(new Error('Recording failed.')); };

    const tick = (ts: number) => {
      if (!recStart) recStart = ts;
      const elapsed = (ts - recStart) / 1000;
      if (phase === 'intro') {
        drawTitleCard(ctx, w, h, params.intro!, cardGradient, Math.min(1, elapsed / introDur));
        if (hasBranding) drawBranding();
        if (elapsed >= introDur) { phase = 'body'; video.play().catch(() => {}); }
        params.onProgress?.(Math.min(100, Math.round((elapsed / totalOut) * 100)));
      } else if (phase === 'body') {
        drawBody();
        params.onProgress?.(Math.min(100, Math.round((outputElapsed() / totalOut) * 100)));
      } else {
        drawTitleCard(ctx, w, h, params.outro!, cardGradient, Math.min(1, (elapsed - outroStart) / outroDur));
        if (hasBranding) drawBranding();
        if (elapsed - outroStart >= outroDur) { if (recorder.state === 'recording') recorder.stop(); return; }
        params.onProgress?.(Math.min(100, Math.round(((introDur + clipDuration + (elapsed - outroStart)) / totalOut) * 100)));
      }
      rafId = requestAnimationFrame(tick);
    };

    const endBody = () => {
      if (outroDur) { phase = 'outro'; outroStart = (performance.now() - recStart) / 1000; video.pause(); }
      else if (recorder.state === 'recording') recorder.stop();
    };

    video.ontimeupdate = () => {
      if (phase !== 'body') return;
      if (video.currentTime >= segs[segIdx].end - 0.02) {
        if (segIdx < segs.length - 1) { segIdx++; video.currentTime = segs[segIdx].start; }
        else endBody();
      }
    };
    video.onended = () => { if (phase === 'body') endBody(); };

    recorder.start(250);
    rafId = requestAnimationFrame(tick);
    if (!introDur) video.play().catch(err => { cleanup(); reject(err); });
  });
}

export interface SyntheticClipParams {
  gradient: string;                 // CSS linear-gradient string, e.g. 'linear-gradient(135deg,#6366f1,#8b5cf6)'
  title: string;
  captions: Caption[];
  aspectRatio: '9:16' | '1:1' | '16:9';
  durationSec: number;              // wall-clock length to render (kept short for previews)
  /** Optional CORS-safe image (e.g. the YouTube thumbnail via the yt-thumb.php
      proxy) drawn as the background with a slow Ken Burns zoom. */
  backgroundImageUrl?: string;
  captionStyle?: CaptionStyle;
  resolution?: ExportResolution;
  sfx?: SfxKind;
  music?: string;
  intro?: string;
  outro?: string;
  /** Script-to-Video: per-caption background images (aligned by index). */
  sceneImages?: (string | null)[];
  onProgress?: (pct: number) => void;
}

function loadImage(url: string): Promise<HTMLImageElement | null> {
  return new Promise(resolve => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => resolve(img);
    img.onerror = () => resolve(null);
    img.src = url;
  });
}

/**
 * Renders a real, downloadable branded video for a clip WITHOUT a source file.
 * Used for YouTube-sourced and demo clips (whose original footage can't be
 * fetched in-browser): draws the clip's gradient, title card, and time-synced
 * captions onto a canvas and records it via MediaRecorder. The result is a
 * genuine .mp4/.webm the user can save — not a placeholder.
 */
export async function renderSyntheticClip(params: SyntheticClipParams): Promise<ExportResult> {
  if (!canExportVideo()) {
    throw new Error('Your browser does not support in-browser video export. Try Chrome, Edge, or Firefox.');
  }
  const synthScale = RES_SCALE[params.resolution ?? '1080p'];
  const w = Math.round(CANVAS_DIMS[params.aspectRatio].w * synthScale);
  const h = Math.round(CANVAS_DIMS[params.aspectRatio].h * synthScale);
  const durationSec = Math.max(3, Math.min(params.durationSec || 10, 40));

  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Canvas rendering is not supported in this browser.');

  // Real footage thumbnail (when available) beats a flat gradient.
  const bgImg = params.backgroundImageUrl ? await loadImage(params.backgroundImageUrl) : null;

  // Script-to-Video: per-scene backgrounds aligned to caption indices.
  const sceneImgs: (HTMLImageElement | null)[] = params.sceneImages?.length
    ? await Promise.all(params.sceneImages.map(u => (u ? loadImage(u) : Promise.resolve(null))))
    : [];

  // Pull the two accent colours out of the CSS gradient string.
  const hexes = params.gradient.match(/#[0-9a-fA-F]{3,8}/g) ?? ['#6366f1', '#8b5cf6'];
  const c1 = hexes[0] ?? '#6366f1';
  const c2 = hexes[1] ?? c1;

  const captions = params.captions.length ? params.captions : [{ id: 'x', text: params.title, startTime: 0, endTime: durationSec }];
  const perCaption = durationSec / captions.length;

  const wrap = (text: string, maxWidth: number): string[] => {
    const words = text.split(' ');
    const lines: string[] = [];
    let line = '';
    for (const word of words) {
      const test = line ? `${line} ${word}` : word;
      if (ctx.measureText(test).width > maxWidth && line) { lines.push(line); line = word; }
      else line = test;
    }
    if (line) lines.push(line);
    return lines;
  };

  const introDur = params.intro?.trim() ? CARD_SECONDS : 0;
  const outroDur = params.outro?.trim() ? CARD_SECONDS : 0;
  const totalDur = introDur + durationSec + outroDur;

  const canvasStream = (canvas as HTMLCanvasElement & { captureStream: (fps?: number) => MediaStream }).captureStream(30);
  const { mimeType, fileExt } = pickMimeType();

  // Give the synthetic render a real audio track with SFX + mood music.
  let sfxCtx: AudioContext | null = null;
  const tracks = [...canvasStream.getVideoTracks()];
  const wantsAudio = (params.sfx && params.sfx !== 'none') || (params.music && params.music !== 'none');
  if (wantsAudio) {
    const AudioCtx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    sfxCtx = new AudioCtx();
    const dest = sfxCtx.createMediaStreamDestination();
    if (params.sfx && params.sfx !== 'none') {
      const offsets = captions.map((_, i) => introDur + i * perCaption);
      scheduleSfx(sfxCtx, dest, params.sfx, sfxCtx.currentTime + 0.1 + introDur, offsets.map(o => o - introDur));
    }
    scheduleMusic(sfxCtx, dest, params.music, sfxCtx.currentTime + 0.05, totalDur);
    if (sfxCtx.state === 'suspended') await sfxCtx.resume();
    tracks.push(...dest.stream.getAudioTracks());
  }
  const recordStream = new MediaStream(tracks);

  const recorder = new MediaRecorder(recordStream, { mimeType, videoBitsPerSecond: 6_000_000 });
  const chunks: BlobPart[] = [];
  recorder.ondataavailable = e => { if (e.data.size > 0) chunks.push(e.data); };

  let startTs = 0;
  let rafId = 0;

  const drawFrame = (elapsed: number) => {
    const sceneIdx = Math.min(captions.length - 1, Math.floor(elapsed / perCaption));
    const frameImg = sceneImgs[sceneIdx] ?? bgImg;
    if (frameImg) {
      // Ken Burns: slow zoom + gentle drift over the image, cover-cropped.
      const t = Math.min(1, elapsed / durationSec);
      const zoom = 1.08 + t * 0.14;
      const iw = frameImg.naturalWidth, ih = frameImg.naturalHeight;
      const srcRatio = iw / ih, dstRatio = w / h;
      let sw = iw, sh = ih;
      if (srcRatio > dstRatio) sw = ih * dstRatio; else sh = iw / dstRatio;
      sw /= zoom; sh /= zoom;
      const maxX = iw - sw, maxY = ih - sh;
      const sx = maxX * (0.5 + 0.18 * Math.sin(t * Math.PI));
      const sy = maxY * 0.5;
      ctx.drawImage(frameImg, sx, sy, sw, sh, 0, 0, w, h);
    } else {
      // Animated diagonal gradient (subtle shimmer between the two accents).
      const shift = (Math.sin(elapsed * 0.8) + 1) / 2;
      const g = ctx.createLinearGradient(0, 0, w, h);
      g.addColorStop(0, c1);
      g.addColorStop(Math.min(0.9, 0.4 + shift * 0.2), c2);
      g.addColorStop(1, c1);
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, w, h);
    }

    // Soft vignette for legibility.
    const vg = ctx.createRadialGradient(w / 2, h / 2, h * 0.2, w / 2, h / 2, h * 0.75);
    vg.addColorStop(0, 'rgba(0,0,0,0)');
    vg.addColorStop(1, 'rgba(0,0,0,0.45)');
    ctx.fillStyle = vg;
    ctx.fillRect(0, 0, w, h);

    // Top scrim keeps the title readable over bright footage.
    if (frameImg) {
      const top = ctx.createLinearGradient(0, 0, 0, h * 0.32);
      top.addColorStop(0, 'rgba(0,0,0,0.6)');
      top.addColorStop(1, 'rgba(0,0,0,0)');
      ctx.fillStyle = top;
      ctx.fillRect(0, 0, w, h * 0.32);
    }

    // Title card near the top.
    ctx.textAlign = 'center';
    const titleSize = Math.round(h * 0.038);
    ctx.font = `800 ${titleSize}px Inter, Arial, sans-serif`;
    ctx.fillStyle = 'rgba(255,255,255,0.96)';
    const titleLines = wrap(params.title, w * 0.82).slice(0, 3);
    titleLines.forEach((ln, i) => ctx.fillText(ln, w / 2, h * 0.16 + i * titleSize * 1.25));

    // Active caption (bottom third), synced to elapsed time + styled (AI Captions).
    const idx = Math.min(captions.length - 1, Math.floor(elapsed / perCaption));
    const cap = captions[idx];
    if (cap) {
      const progress = Math.max(0, Math.min(1, (elapsed - idx * perCaption) / perCaption));
      drawStyledCaption(ctx, { w, h, text: cap.text, emoji: (cap as Caption).emoji, style: params.captionStyle ?? 'classic', progress, accent: c2 });
    }

    // Progress bar along the bottom.
    const pct = Math.min(1, elapsed / durationSec);
    ctx.fillStyle = 'rgba(255,255,255,0.25)';
    ctx.fillRect(0, h - 10, w, 10);
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, h - 10, w * pct, 10);
  };

  return new Promise<ExportResult>((resolve, reject) => {
    const finish = () => { cancelAnimationFrame(rafId); sfxCtx?.close().catch(() => {}); };
    recorder.onstop = () => {
      finish();
      if (chunks.length === 0) { reject(new Error('Recording produced no data.')); return; }
      resolve({ blob: new Blob(chunks, { type: mimeType }), mimeType, fileExt });
    };
    recorder.onerror = () => { finish(); reject(new Error('Recording failed.')); };

    const cardGradient = params.gradient;
    const tick = (ts: number) => {
      if (!startTs) startTs = ts;
      const elapsed = (ts - startTs) / 1000;
      if (introDur && elapsed < introDur) {
        drawTitleCard(ctx, w, h, params.intro!, cardGradient, elapsed / introDur);
      } else if (elapsed < introDur + durationSec) {
        drawFrame(elapsed - introDur);
      } else if (outroDur && elapsed < totalDur) {
        drawTitleCard(ctx, w, h, params.outro!, cardGradient, (elapsed - introDur - durationSec) / outroDur);
      } else {
        if (recorder.state === 'recording') recorder.stop();
        return;
      }
      params.onProgress?.(Math.min(100, Math.round((elapsed / totalDur) * 100)));
      rafId = requestAnimationFrame(tick);
    };

    recorder.start(200);
    rafId = requestAnimationFrame(tick);
  });
}

export function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
