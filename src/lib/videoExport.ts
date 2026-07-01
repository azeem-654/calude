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
