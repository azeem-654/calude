import type { Caption } from '../types';

export interface ExportClipParams {
  sourceBlobUrl: string;
  startTime: number;
  endTime: number;
  aspectRatio: '9:16' | '1:1' | '16:9';
  captions: Caption[];
  onProgress?: (pct: number) => void;
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

  const { w, h } = CANVAS_DIMS[params.aspectRatio];
  const clipDuration = params.endTime - params.startTime;
  if (clipDuration <= 0) throw new Error('Invalid clip duration.');

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
    video.currentTime = params.startTime;
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
  audioSource.connect(audioDest);
  if (audioCtx.state === 'suspended') await audioCtx.resume();

  const canvasStream = (canvas as HTMLCanvasElement & { captureStream: (fps?: number) => MediaStream }).captureStream(30);
  const combined = new MediaStream([
    ...canvasStream.getVideoTracks(),
    ...audioDest.stream.getAudioTracks(),
  ]);

  const { mimeType, fileExt } = pickMimeType();
  const recorder = new MediaRecorder(combined, { mimeType, videoBitsPerSecond: 8_000_000 });
  const chunks: BlobPart[] = [];
  recorder.ondataavailable = e => { if (e.data.size > 0) chunks.push(e.data); };

  // Captions carry absolute video-timeline timestamps (they're generated from the
  // clip's original startTime), so match them directly against video.currentTime.
  const activeCaptionFor = (currentTime: number) =>
    params.captions.find(c => currentTime >= c.startTime && currentTime < c.endTime);

  const drawFrame = () => {
    // cover-fit crop from source video into target canvas
    const vw = video.videoWidth, vh = video.videoHeight;
    const srcRatio = vw / vh, dstRatio = w / h;
    let sx = 0, sy = 0, sw = vw, sh = vh;
    if (srcRatio > dstRatio) { sw = vh * dstRatio; sx = (vw - sw) / 2; }
    else { sh = vw / dstRatio; sy = (vh - sh) / 2; }
    ctx.drawImage(video, sx, sy, sw, sh, 0, 0, w, h);

    const cap = activeCaptionFor(video.currentTime);
    if (cap) {
      const fontSize = Math.round(h * 0.045);
      ctx.font = `800 ${fontSize}px Inter, Arial, sans-serif`;
      ctx.textAlign = 'center';
      const text = `${cap.emoji ? cap.emoji + ' ' : ''}${cap.text}`;
      const y = h * 0.82;
      const metrics = ctx.measureText(text);
      const pad = fontSize * 0.5;
      ctx.fillStyle = 'rgba(0,0,0,0.72)';
      ctx.fillRect(w / 2 - metrics.width / 2 - pad, y - fontSize, metrics.width + pad * 2, fontSize * 1.5);
      ctx.fillStyle = '#ffffff';
      ctx.fillText(text, w / 2, y);
    }
  };

  let rafId = 0;
  const tick = () => {
    drawFrame();
    if (params.onProgress) {
      const pct = Math.min(100, Math.round(((video.currentTime - params.startTime) / clipDuration) * 100));
      params.onProgress(pct);
    }
    rafId = requestAnimationFrame(tick);
  };

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

    video.ontimeupdate = () => {
      if (video.currentTime >= params.endTime) {
        if (recorder.state === 'recording') recorder.stop();
      }
    };
    video.onended = () => { if (recorder.state === 'recording') recorder.stop(); };

    recorder.start(250);
    rafId = requestAnimationFrame(tick);
    video.play().catch(err => { cleanup(); reject(err); });
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
  const { w, h } = CANVAS_DIMS[params.aspectRatio];
  const durationSec = Math.max(3, Math.min(params.durationSec || 10, 20));

  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Canvas rendering is not supported in this browser.');

  // Real footage thumbnail (when available) beats a flat gradient.
  const bgImg = params.backgroundImageUrl ? await loadImage(params.backgroundImageUrl) : null;

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

  const canvasStream = (canvas as HTMLCanvasElement & { captureStream: (fps?: number) => MediaStream }).captureStream(30);
  const { mimeType, fileExt } = pickMimeType();
  const recorder = new MediaRecorder(canvasStream, { mimeType, videoBitsPerSecond: 6_000_000 });
  const chunks: BlobPart[] = [];
  recorder.ondataavailable = e => { if (e.data.size > 0) chunks.push(e.data); };

  let startTs = 0;
  let rafId = 0;

  const drawFrame = (elapsed: number) => {
    if (bgImg) {
      // Ken Burns: slow zoom + gentle drift over the real thumbnail, cover-cropped.
      const t = Math.min(1, elapsed / durationSec);
      const zoom = 1.08 + t * 0.14;
      const iw = bgImg.naturalWidth, ih = bgImg.naturalHeight;
      const srcRatio = iw / ih, dstRatio = w / h;
      let sw = iw, sh = ih;
      if (srcRatio > dstRatio) sw = ih * dstRatio; else sh = iw / dstRatio;
      sw /= zoom; sh /= zoom;
      const maxX = iw - sw, maxY = ih - sh;
      const sx = maxX * (0.5 + 0.18 * Math.sin(t * Math.PI));
      const sy = maxY * 0.5;
      ctx.drawImage(bgImg, sx, sy, sw, sh, 0, 0, w, h);
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
    if (bgImg) {
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

    // Active caption (bottom third), synced to elapsed time.
    const idx = Math.min(captions.length - 1, Math.floor(elapsed / perCaption));
    const cap = captions[idx];
    if (cap) {
      const capSize = Math.round(h * 0.05);
      ctx.font = `800 ${capSize}px Inter, Arial, sans-serif`;
      const text = `${(cap as Caption).emoji ? (cap as Caption).emoji + ' ' : ''}${cap.text}`;
      const lines = wrap(text, w * 0.86);
      const baseY = h * 0.72;
      lines.forEach((ln, i) => {
        const y = baseY + i * capSize * 1.3;
        const m = ctx.measureText(ln);
        const pad = capSize * 0.4;
        ctx.fillStyle = 'rgba(0,0,0,0.6)';
        ctx.fillRect(w / 2 - m.width / 2 - pad, y - capSize, m.width + pad * 2, capSize * 1.35);
        ctx.fillStyle = '#ffffff';
        ctx.fillText(ln, w / 2, y);
      });
    }

    // Progress bar along the bottom.
    const pct = Math.min(1, elapsed / durationSec);
    ctx.fillStyle = 'rgba(255,255,255,0.25)';
    ctx.fillRect(0, h - 10, w, 10);
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, h - 10, w * pct, 10);
  };

  return new Promise<ExportResult>((resolve, reject) => {
    recorder.onstop = () => {
      cancelAnimationFrame(rafId);
      if (chunks.length === 0) { reject(new Error('Recording produced no data.')); return; }
      resolve({ blob: new Blob(chunks, { type: mimeType }), mimeType, fileExt });
    };
    recorder.onerror = () => { cancelAnimationFrame(rafId); reject(new Error('Recording failed.')); };

    const tick = (ts: number) => {
      if (!startTs) startTs = ts;
      const elapsed = (ts - startTs) / 1000;
      drawFrame(elapsed);
      params.onProgress?.(Math.min(100, Math.round((elapsed / durationSec) * 100)));
      if (elapsed >= durationSec) { if (recorder.state === 'recording') recorder.stop(); return; }
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
