/**
 * AI Video Studio from the browser's side — /api/video.php for everything,
 * /api/video-file.php (signed links the server hands out) for the bytes.
 *
 * The rules that decide what the edit keeps, how captions follow it, what a
 * sentence means and what a Short is are the Worker's own files, re-exported
 * here, so the preview in the editor and the render the engine makes read
 * the same edit the same way (docs/VIDEO-STUDIO.md).
 */
import { API_BASE } from './apiBase';
import { sessionToken } from './auth';
import { getActiveAccountId } from './tenancy';
import type { Clip, Transcript, VideoDoc, VideoRequest, Op, CleanupPreset } from '../../worker/src/lib/video/edit';
import type { VideoMeta } from '../../worker/src/lib/video/shorts';

export * from '../../worker/src/lib/video/edit';
export { cuesOf, isRtl, type Cue } from '../../worker/src/lib/video/captions';
export { cleanupSummary, isFiller } from '../../worker/src/lib/video/cleanup';
export { cameraPath, cutTimes, punchSpans, overlaySpan, trackAt, cssLook, type TrackFile, type TrackRow } from '../../worker/src/lib/video/motion';
export { toXmeml, editorialScore } from '../../worker/src/lib/video/xml';
export type { VideoMeta } from '../../worker/src/lib/video/shorts';

type Answer<T> = T & { success?: boolean; error?: string; field?: string; code?: string; conflict?: boolean };

async function call<T = Record<string, unknown>>(action: string, extra: Record<string, unknown> = {}): Promise<Answer<T>> {
  try {
    const r = await fetch(`${API_BASE}/api/video.php`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action, token: sessionToken(), accountId: getActiveAccountId(), ...extra }),
    });
    const d = await r.json().catch(() => ({ success: false, error: `The server answered ${r.status}.` }));
    return d as Answer<T>;
  } catch {
    return { success: false, error: 'Could not reach the server — check your connection.' } as Answer<T>;
  }
}

/* ── Shapes the server answers with ───────────────────────────────────────── */

export type CapStatus = 'working' | 'needs_configuration' | 'unavailable' | 'planned';
export interface Capability { key: string; label: string; status: CapStatus; note: string }
export interface Usage {
  tier: 'trial' | 'paid' | 'owner' | 'ended';
  limits: { sourceMin: number; renderMin: number; storageGb: number };
  used: { sourceMin: number; renderMin: number; audioMin: number; aiCalls: number; storageGb: number; costMicros: number };
}

export interface ProjectSummary {
  id: string; name: string; status: string; stage: string; error: string; createdAt: string; updatedAt: string;
  duration: number; sourceName: string; shorts: number; approved: number; posterUrl: string;
  autopilotProjectId: string | null; autopilotProjectName: string;
}

export interface Stage { key: string; label: string; state: 'done' | 'active' | 'waiting' | 'failed' | 'skipped'; pct: number | null; note: string }

export interface ThumbSpec { layout: string; text: string; highlight: string; at: number; at2?: number; accent: string; color: string; textColor: string; border: boolean; zoom: number }
export interface ThumbView { index: number; layout: string; width: number; height: number; bytes: number; verified: boolean; check: string; headline: string; set: number; url: string; downloadUrl: string; spec: ThumbSpec | null; face: boolean }
export interface TrackStatus { ready: boolean; summary: { detector: string; seen: number; faces: number; tracks: number; switches: { speaker: number; face: number }; frames: number } | null; error: string; at: string }

export type OutputStatus = 'processing' | 'needs_review' | 'approved' | 'ready_to_publish' | 'failed';
export interface OutputView {
  id: string; kind: 'long' | 'short'; clipId: string; title: string; status: OutputStatus; error: string; version: number;
  stale: boolean; rendered: boolean; duration: number; width: number; height: number; bytes: number; publishAt: string | null;
  meta: VideoMeta | Record<string, never>;
  mp4Url: string; downloadUrl: string; srtUrl: string; vttUrl: string; chosenThumb: number; thumbs: ThumbView[];
}

export interface Probe { duration: number; width: number; height: number; fps: number; vcodec: string; acodec: string; hasAudio: boolean; format: string; rotation: number }

export interface ProjectView {
  project: {
    id: string; name: string; prompt: string; status: string; stage: string; stageNote: string; error: string; language: string;
    createdAt: string; updatedAt: string; autopilotProjectId: string | null; autopilotProjectName: string; workflowId: string | null;
  };
  request: (VideoRequest & { language?: string }) | null;
  source: { name: string; bytes: number; probe: Probe | null; proxyUrl: string; posterUrl: string; waveUrl: string; silences?: [number, number][];
    filmstrip?: { url: string; every: number; tiles: number; w: number; h: number } | null;
    track?: TrackStatus | null; trackUrl?: string };
  extras: Extras;
  musicUrl: string;
  transcriptUrl: string;
  docVersion: number;
  maxVersion: number;
  doc?: VideoDoc;
  outputs: OutputView[];
  stages: Stage[];
  jobs: { id: string; kind: string; target: string; state: string; attempts: number; progress: number | null; stage: string; error: string }[];
  upload: { id: string; name: string; bytes: number; partSize: number; done: number[]; fileKey: string } | null;
  capabilities?: Capability[];
}

export interface LibraryItem {
  id: string; projectId: string; projectName: string; autopilotProjectId: string | null; kind: 'long' | 'short'; title: string; status: OutputStatus;
  duration: number; width: number; height: number; publishAt: string | null; updatedAt: string;
  thumbUrl: string; thumbDownload: string; downloadUrl: string; caption: string; description: string; hashtags: string;
}
export interface LibrarySource { projectId: string; projectName: string; name: string; bytes: number; duration: number; width: number; height: number; createdAt: string; posterUrl: string }

export interface VideoBrand {
  company: string; description: string; website: string; color: string; accent: string; cta: string; handles: string; logoKey: string;
  from: Record<string, string>;
}
export interface VideoKit { color?: string; accent?: string; cta?: string; handles?: string; useLogo?: boolean }

/* ── Calls ────────────────────────────────────────────────────────────────── */

export const videoCapabilities = (probe = false) => call<{ capabilities: Capability[]; usage: Usage }>('capabilities', { probe });
export const listVideoProjects = () => call<{ projects: ProjectSummary[] }>('list');
export interface Want { repurpose?: { posts: number; blog: boolean; email: boolean }; quiz?: boolean; denoise?: 'light' | 'medium' | 'strong'; voice?: boolean; music?: string }
export interface QuizQuestion { q: string; options: string[]; answer: number; explain: string; t: number }
export interface Extras {
  want?: { repurpose?: { posts: number; blog: boolean; email: boolean }; quiz?: boolean };
  repurposed?: { at: string; links: { kind: string; id: string; label: string; route: string }[]; notes: string[] };
  quiz?: { at: string; questions: QuizQuestion[]; by: 'ai' };
  quizNote?: string;
}
export interface FoundTrack {
  id: string; title: string; artist: string; license: string; licenseCode: string; licenseUrl: string; attribution: string;
  duration: number; previewUrl: string; pageUrl: string; provider: string; genres: string[];
}

export const createVideoProject = (p: { name: string; prompt: string; settings?: Partial<VideoRequest> & { language?: string }; autopilotProjectId?: string; workflowId?: string; want?: Want }) =>
  call<{ id: string; request: VideoRequest }>('create', p);
export const getVideoProject = (projectId: string) => call<ProjectView>('get', { projectId });
export const videoStatus = (projectId: string, knownVersion: number) => call<ProjectView>('status', { projectId, knownVersion });
export const renameVideoProject = (projectId: string, name: string) => call('rename', { projectId, name });
export const editVideo = (projectId: string, baseVersion: number, ops: Op[], note: string) =>
  call<{ doc: VideoDoc; docVersion: number; refused?: string[]; note?: string }>('edit', { projectId, baseVersion, ops, note });
export const gotoVersion = (projectId: string, version: number) => call<{ doc: VideoDoc; docVersion: number }>('goto_version', { projectId, version });
export const listVersions = (projectId: string) => call<{ versions: { version: number; note: string; created_by: string; created_at: string }[]; current: number }>('versions', { projectId });
export const runCleanup = (projectId: string, baseVersion: number, preset: CleanupPreset) => call<{ doc: VideoDoc; docVersion: number }>('cleanup', { projectId, baseVersion, preset });
export const videoCommand = (projectId: string, baseVersion: number, text: string, selection: { s: number; e: number } | null, clipId: string | null, playhead?: number) =>
  call<{ reply: string; understood: boolean; undo: boolean; redo: boolean; doc?: VideoDoc; docVersion?: number }>('command', { projectId, baseVersion, text, selection, clipId, playhead });
export const renderOutputs = (projectId: string, outputIds?: string[]) => call<{ queued: number }>('render', { projectId, outputIds });
export const moreThumbnails = (projectId: string, outputId: string, headline?: string) => call<{ set: number }>('thumbnails', { projectId, outputId, headline });
export const chooseThumb = (projectId: string, outputId: string, index: number) => call('choose_thumb', { projectId, outputId, index });
export const setOutputStatus = (projectId: string, outputId: string, status: OutputStatus, publishAt?: string | null) => call('set_status', { projectId, outputId, status, publishAt });
export const updateMeta = (projectId: string, outputId: string, patch: Record<string, unknown>) => call<{ meta: VideoMeta }>('meta_update', { projectId, outputId, patch });
export const regenerateMeta = (projectId: string, outputId: string) => call('regenerate_meta', { projectId, outputId });
export const retryVideo = (projectId: string) => call<{ retried: number }>('retry', { projectId });
export const cancelVideo = (projectId: string) => call('cancel', { projectId });
export const deleteVideoProject = (projectId: string) => call('delete', { projectId });
export const searchMusic = (projectId: string, q: string) => call<{ tracks: FoundTrack[] }>('music_search', { projectId, q });
export const chooseMusic = (projectId: string, baseVersion: number, trackId: string, applyTo?: string) =>
  call<{ doc: VideoDoc; docVersion: number; reply: string }>('music_choose', { projectId, baseVersion, trackId, applyTo });
export const startRepurpose = (projectId: string, want: { posts: number; blog: boolean; email: boolean }) => call('repurpose', { projectId, ...want });
export const startQuiz = (projectId: string) => call('quiz', { projectId });
export const designThumb = (projectId: string, outputId: string, spec: ThumbSpec) => call<{ set: number }>('thumb_custom', { projectId, outputId, spec });
export const trackNow = (projectId: string) => call('track_now', { projectId });
export async function loadTrack(url: string): Promise<import('../../worker/src/lib/video/motion').TrackFile | null> {
  if (!url) return null;
  try { const r = await fetch(url); return r.ok ? await r.json() : null; } catch { return null; }
}

/** Your own track: uploaded to this project's music folder, then attached with your rights confirmed. */
export async function uploadMusic(projectId: string, baseVersion: number, file: File, rightsConfirmed: boolean): Promise<{ ok: true; doc: VideoDoc; docVersion: number } | { ok: false; error: string }> {
  if (!rightsConfirmed) return { ok: false, error: 'Tick the box to confirm you own this track or have a licence to use it.' };
  if (file.size > 16 * 1024 * 1024) return { ok: false, error: 'Tracks up to 16 MB can be uploaded.' };
  const u = await call<{ url: string; prefix: string }>('music_upload_url', { projectId });
  if (!u.success) return { ok: false, error: u.error ?? 'Could not start the upload.' };
  const ext = (file.name.match(/\.(mp3|m4a|wav|ogg|flac)$/i)?.[1] ?? 'mp3').toLowerCase();
  const type = ext === 'mp3' ? 'audio/mpeg' : ext === 'm4a' ? 'audio/mp4' : `audio/${ext}`;
  const put = await fetch(`${u.url}&name=track.${ext}&type=${encodeURIComponent(type)}`, { method: 'PUT', body: file }).then(r => r.json()).catch(() => ({ success: false })) as { success?: boolean };
  if (!put.success) return { ok: false, error: 'The track did not upload.' };
  const r = await call<{ doc: VideoDoc; docVersion: number }>('music_attach', { projectId, baseVersion, key: `${u.prefix}track.${ext}`, title: file.name.replace(/\.[^.]+$/, ''), rightsConfirmed });
  return r.success ? { ok: true, doc: r.doc, docVersion: r.docVersion } : { ok: false, error: r.error ?? 'The track could not be used.' };
}

export const videoLibrary = () => call<{ items: LibraryItem[]; sources: LibrarySource[] }>('library');
export const videoBrand = (autopilotProjectId?: string) => call<{ brand: VideoBrand; kit: VideoKit }>('brand_get', { autopilotProjectId });
export const saveVideoKit = (kit: VideoKit) => call<{ kit: VideoKit; brand: VideoBrand }>('brand_set', { kit });

export async function loadTranscript(url: string): Promise<Transcript | null> {
  if (!url) return null;
  try { const r = await fetch(url); return r.ok ? await r.json() as Transcript : null; } catch { return null; }
}

export async function loadWave(url: string): Promise<Uint8Array | null> {
  if (!url) return null;
  try {
    const r = await fetch(url);
    if (!r.ok) return null;
    const d = await r.json() as { peaks: string };
    return Uint8Array.from(atob(d.peaks), c => c.charCodeAt(0));
  } catch { return null; }
}

/* ── Uploading: resumable, in parts, real progress ────────────────────────── */

export interface UploadProgress { sent: number; total: number; parts: number; partsDone: number; resumed: boolean }

/**
 * Upload a file in 16 MB parts, three at a time, each retried with back-off.
 * Choosing the same file again (same name, size and modified time) resumes:
 * the server remembers which parts arrived. Progress is bytes the server
 * confirmed — never a timer.
 */
export async function uploadVideo(projectId: string, file: File, onProgress: (p: UploadProgress) => void, signal?: AbortSignal): Promise<{ ok: true } | { ok: false; error: string; code?: string }> {
  const start = await call<{ uploadId: string; partSize: number; parts: number; done: number[]; partUrl: string }>('upload_start', {
    projectId, name: file.name, size: file.size, type: file.type, fileKey: `${file.name}|${file.size}|${file.lastModified}`,
  });
  if (!start.success) return { ok: false, error: start.error ?? 'The upload could not start.', code: start.code };
  const done = new Set(start.done);
  const size = (n: number) => Math.min(start.partSize, file.size - (n - 1) * start.partSize);
  let sent = [...done].reduce((n, p) => n + size(p), 0);
  const report = () => onProgress({ sent, total: file.size, parts: start.parts, partsDone: done.size, resumed: start.done.length > 0 });
  report();
  const queue = Array.from({ length: start.parts }, (_, i) => i + 1).filter(n => !done.has(n));
  let failure = '';
  const worker = async () => {
    while (queue.length && !failure) {
      if (signal?.aborted) { failure = 'Upload paused.'; return; }
      const n = queue.shift()!;
      const blob = file.slice((n - 1) * start.partSize, (n - 1) * start.partSize + size(n));
      let lastErr = '';
      for (let attempt = 0; attempt < 5; attempt++) {
        try {
          const r = await fetch(`${start.partUrl}&part=${n}`, { method: 'PUT', body: blob, signal });
          const d = await r.json().catch(() => ({})) as { success?: boolean; error?: string; code?: string };
          if (d.success) { done.add(n); sent += size(n); report(); lastErr = ''; break; }
          lastErr = d.error ?? `part ${n} was refused (${r.status})`;
          if (r.status === 415 || r.status === 410 || r.status === 403) { failure = lastErr; return; }
        } catch (e) {
          if (signal?.aborted) { failure = 'Upload paused.'; return; }
          lastErr = String((e as Error).message ?? e);
        }
        await new Promise(r => setTimeout(r, 800 * 2 ** attempt));
      }
      if (lastErr) { failure = `Part ${n} would not upload: ${lastErr}`; return; }
    }
  };
  await Promise.all([worker(), worker(), worker()]);
  if (failure) return { ok: false, error: failure };
  const fin = await call('upload_complete', { projectId, uploadId: start.uploadId });
  return fin.success ? { ok: true } : { ok: false, error: fin.error ?? 'The upload could not be finished.' };
}

export const abortUpload = (projectId: string) => call('upload_abort', { projectId });

/* ── Presentation ─────────────────────────────────────────────────────────── */

export const STATUS_LABEL: Record<OutputStatus, string> = {
  processing: 'Processing', needs_review: 'Needs review', approved: 'Approved', ready_to_publish: 'Ready to publish', failed: 'Failed',
};

export const bytesLabel = (n: number) => n >= 1e9 ? `${(n / 1e9).toFixed(2)} GB` : n >= 1e6 ? `${(n / 1e6).toFixed(1)} MB` : `${Math.max(1, Math.round(n / 1e3))} KB`;

export interface Template { key: string; name: string; blurb: string; prompt: string; settings: Partial<VideoRequest> }
/** Starting points; each is only a prompt and settings — nothing a template does is hidden. */
export const TEMPLATES: Template[] = [
  { key: 'podcast', name: 'Weekly podcast', blurb: 'A cleaned episode, five Shorts, captions and PNG thumbnails.', prompt: 'Clean this podcast, remove filler words and long gaps, create one polished episode and five 30–60 second Shorts with captions and PNG thumbnails.', settings: { long: true, shorts: 5, min: 30, max: 60 } },
  { key: 'webinar', name: 'Webinar', blurb: 'One cleaned recording and four Shorts on its main points.', prompt: 'Turn this webinar into one cleaned long video and four Shorts about its main points, with captions and thumbnails.', settings: { long: true, shorts: 4, min: 30, max: 75 } },
  { key: 'training', name: 'Training recording', blurb: 'Three reels; screens kept whole.', prompt: 'Create three reels from this training recording. Keep the screen fully visible. Captions on.', settings: { long: false, shorts: 3, min: 30, max: 90, cleanup: 'conservative', layout: 'fit' } },
  { key: 'interview', name: 'Interview', blurb: 'Gentle cleanup, the full conversation and three highlights.', prompt: 'Lightly clean this interview, keep the natural pauses, create the full conversation and three highlight Shorts.', settings: { long: true, shorts: 3, cleanup: 'conservative' } },
  { key: 'tutorial', name: 'Product demo / tutorial', blurb: 'Screen recording: fit, not crop, so nothing on screen is lost.', prompt: 'Clean this product demo and create four Shorts, one per feature, keeping the screen whole. Add captions and thumbnails.', settings: { long: true, shorts: 4, min: 30, max: 60, layout: 'fit' } },
  { key: 'captions', name: 'Captions only', blurb: 'The same video, cleaned, with captions and SRT/VTT files.', prompt: 'Clean this recording and add captions. No Shorts.', settings: { long: true, shorts: 0 } },
];

export type { Clip, Transcript, VideoDoc, VideoRequest, Op, CleanupPreset };
export type { MusicTrack, AudioSettings, Denoise } from '../../worker/src/lib/video/edit';
