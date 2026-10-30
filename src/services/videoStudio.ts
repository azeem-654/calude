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
export { cleanupSummary, isFiller, findFillers, fillerCounts, FILLER_KINDS, FILLER_INFO, DEFAULT_FILLERS, type FillerKind } from '../../worker/src/lib/video/cleanup';
export { cameraPath, cutTimes, punchSpans, overlaySpan, overlayPlace, logoBox, OVERLAY_SIZE, OVERLAY_FAMILY, trackAt, cssLook, cssEffects, type TrackFile, type TrackRow } from '../../worker/src/lib/video/motion';
export { layoutOptions, layoutPlan, LAYOUT_LABEL, type LayoutPlan, type LayoutOption } from '../../worker/src/lib/video/layouts';
export {
  autoFocus, pointerOf, pointerAt, pointerInFrame, segAt, focusWindows, zoomPlan, zoomAt, zoomLevel, screenPlan, screenLayoutOptions, followPath, followAt,
  resolveCursor, cursorFor, momentFor, screenLayoutFor, frameMap, sfxSample, SFX_LENGTH, CURSOR_STYLES, CURSOR_LABEL, CLICK_SOUNDS, SOUND_LABEL, POINTER_DEFAULT,
  type ScreenMeta, type ScreenSeg, type ScreenRef, type NBox, type CamShape, type FocusRange, type PointerSettings, type CursorStyle, type ClickSound, type Moment, type ZoomPlan, type ScreenPlan, type Sensitivity,
} from '../../worker/src/lib/video/pointer';
export { toXmeml, editorialScore } from '../../worker/src/lib/video/xml';
export type { VideoMeta } from '../../worker/src/lib/video/shorts';
export { parseYoutubeUrl, youtubeThumb, YOUTUBE_WAY_FORWARD, type YoutubeLink } from '../../worker/src/lib/video/youtube';

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

export interface ThumbSpec {
  layout: string; text: string; highlight: string; at: number; at2?: number; accent: string; color: string; textColor: string; border: boolean; zoom: number;
  /* The trending layouts' options (media/engine/thumbLayout.mjs) — absent on older thumbnails, which draw as before. */
  color2?: string; hlStyle?: 'color' | 'box'; side?: 'auto' | 'left' | 'right' | 'center'; textPos?: 'auto' | 'top' | 'middle' | 'bottom';
  textSize?: number; sticker?: string; pointer?: 'auto' | 'none' | 'arrow' | 'circle' | 'both'; badge?: string;
}
/** The plan the engine paints, so the designer's preview is drawn from the same numbers. */
export { thumbPlan, normaliseSpec, inkOn, lineRect, TREND_LAYOUTS, STICKERS, EM, CONDENSE, HALO, type Plan as ThumbPlan } from '../../media/engine/thumbLayout.mjs';
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
    /** For a project started from YouTube that has no video yet: what to do instead. */
    wayForward?: string;
  };
  request: (VideoRequest & { language?: string }) | null;
  source: {
    /** A signed link to the logo picture (doc.logo), for the preview. */
    logoUrl?: string;
    name: string; bytes: number; probe: Probe | null; proxyUrl: string; posterUrl: string; waveUrl: string; silences?: [number, number][];
    filmstrip?: { url: string; every: number; tiles: number; w: number; h: number } | null;
    track?: TrackStatus | null; trackUrl?: string;
    /** A Screen Recorder recording's notes (layout, pointer path, clicks) — signed, when there are any. */
    screenUrl?: string;
    /** Started from the customer's own YouTube video (fetched: the bytes arrived and were checked). */
    youtube?: { id: string; url: string; title: string; channel: string; thumb: string; fetched: boolean } | null;
    /** Fetched from a direct link to a video file: how far it has got. */
    link?: { url: string; bytes: number; got: number } | null };
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
export interface LibrarySource {
  projectId: string; projectName: string; name: string; bytes: number; duration: number; width: number; height: number; createdAt: string; posterUrl: string;
  /** The project's own status (draft, uploading, processing, ready, failed). */
  status: string;
  /** Signed, short-lived: the editor's proxy once made, the stored original until then. */
  playUrl: string;
  /** Signed: the original exactly as uploaded, named for the project. */
  downloadUrl: string;
}

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
  publish?: Record<string, PublishTexts>;
  translations?: Record<string, { at: string; cues: { s: number; e: number; text: string }[] }>;
  screen?: import('../../worker/src/lib/video/pointer').ScreenRef;
}
export interface PublishTexts { fields: Record<string, string>; posts: Record<string, string>; at: string }
export const savePublish = (projectId: string, key: string, fields: Record<string, string>, platformPosts: Record<string, string> = {}) =>
  call<{ publish: PublishTexts }>('publish_save', { projectId, key, fields, platformPosts });
export const saveTranslation = (projectId: string, language: string, cues: { s: number; e: number; text: string }[]) => call('translation_save', { projectId, language, cues });
export interface FoundTrack {
  id: string; title: string; artist: string; license: string; licenseCode: string; licenseUrl: string; attribution: string;
  duration: number; previewUrl: string; pageUrl: string; provider: string; genres: string[];
}

export const createVideoProject = (p: {
  name: string; prompt: string; settings?: Partial<VideoRequest> & { language?: string }; autopilotProjectId?: string; workflowId?: string; want?: Want;
  /** Instead of an upload: the customer's own YouTube video, with their word that they may use it. */
  youtubeUrl?: string; rightsConfirmed?: boolean; title?: string;
}) => call<{ id: string; request: VideoRequest }>('create', p);
/** Which video a pasted link names, and what YouTube calls it (asked by the server, never by the browser). */
export const youtubeInfo = (youtubeUrl: string) => call<{ id: string; url: string; thumb: string; title: string; author: string; note: string }>('youtube_info', { youtubeUrl });
export const getVideoProject = (projectId: string) => call<ProjectView>('get', { projectId });
export const videoStatus = (projectId: string, knownVersion: number) => call<ProjectView>('status', { projectId, knownVersion });
export const renameVideoProject = (projectId: string, name: string) => call('rename', { projectId, name });
export const editVideo = (projectId: string, baseVersion: number, ops: Op[], note: string) =>
  call<{ doc: VideoDoc; docVersion: number; refused?: string[]; note?: string }>('edit', { projectId, baseVersion, ops, note });
export const gotoVersion = (projectId: string, version: number) => call<{ doc: VideoDoc; docVersion: number }>('goto_version', { projectId, version });
export const listVersions = (projectId: string) => call<{ versions: { version: number; note: string; created_by: string; created_at: string }[]; current: number }>('versions', { projectId });
export const runCleanup = (projectId: string, baseVersion: number, preset: CleanupPreset, opts: { fillers?: string[]; maxPause?: number | null } = {}) =>
  call<{ doc: VideoDoc; docVersion: number }>('cleanup', { projectId, baseVersion, preset, ...opts });
export const videoCommand = (projectId: string, baseVersion: number, text: string, selection: { s: number; e: number } | null, clipId: string | null, playhead?: number) =>
  call<{ reply: string; understood: boolean; undo: boolean; redo: boolean; doc?: VideoDoc; docVersion?: number }>('command', { projectId, baseVersion, text, selection, clipId, playhead });
export const renderOutputs = (projectId: string, outputIds?: string[]) => call<{ queued: number }>('render', { projectId, outputIds });
export const moreThumbnails = (projectId: string, outputId: string, headline?: string) => call<{ set: number }>('thumbnails', { projectId, outputId, headline });
export const chooseThumb = (projectId: string, outputId: string, index: number) => call('choose_thumb', { projectId, outputId, index });
export const setOutputStatus = (projectId: string, outputId: string, status: OutputStatus, publishAt?: string | null) => call('set_status', { projectId, outputId, status, publishAt });
export const updateMeta = (projectId: string, outputId: string, patch: Record<string, unknown>) => call<{ meta: VideoMeta }>('meta_update', { projectId, outputId, patch });
/** What the Screen Recorder saw — the layout over time, the pointer's path and its clicks — kept with the project (prep/screen.json). */
export const saveScreenMeta = (projectId: string, meta: import('../../worker/src/lib/video/pointer').ScreenMeta) =>
  call<{ screen: import('../../worker/src/lib/video/pointer').ScreenRef }>('screen_save', { projectId, meta });
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

/**
 * A thumbnail redesigned in the Graphics Designer & Editor, made this video's
 * thumbnail: the PNG goes straight to storage through a signed link, then the
 * server checks it from its bytes (a real PNG, the size the video needs)
 * before it is offered and chosen. `accountId` is the workspace the video is
 * in — a design opened from another workspace is refused here, by name,
 * rather than answered "not found".
 */
export async function applyDesignAsThumb(target: { projectId: string; outputId: string; accountId?: string }, png: Blob): Promise<{ ok: true; note: string } | { ok: false; error: string }> {
  if (target.accountId && target.accountId !== getActiveAccountId()) return { ok: false, error: 'This video is in another workspace — switch to it, then use the design.' };
  const u = await call<{ url: string; key: string; width: number; height: number }>('thumb_upload_url', { projectId: target.projectId, outputId: target.outputId });
  if (!u.success) return { ok: false, error: u.error ?? 'The upload could not start.' };
  const put = await fetch(`${u.url}&name=designed.png&type=image/png`, { method: 'PUT', body: png }).then(r => r.json()).catch(() => ({ success: false })) as { success?: boolean };
  if (!put.success) return { ok: false, error: 'The picture did not upload — try again.' };
  const a = await call<{ index: number; note: string }>('thumb_attach', { projectId: target.projectId, outputId: target.outputId, key: u.key });
  if (!a.success) return { ok: false, error: a.error ?? 'The picture was not accepted.' };
  return { ok: true, note: a.note ?? '' };
}
export const trackNow = (projectId: string) => call('track_now', { projectId });

/**
 * The logo: made a PNG here (any picture the browser can open — and with its
 * background taken out first when asked), sent straight to storage through a
 * signed link, then checked by the server from its bytes, which is what sets
 * it on the project. `onStep` reports each step as it happens.
 */
export async function uploadLogo(projectId: string, baseVersion: number, png: Blob, name: string, bgRemoved: boolean, onStep: (s: 'link' | 'upload' | 'check') => void):
  Promise<{ ok: true; doc: VideoDoc; docVersion: number } | { ok: false; error: string }> {
  onStep('link');
  const u = await call<{ url: string; key: string }>('logo_upload_url', { projectId });
  if (!u.success) return { ok: false, error: u.error ?? 'The upload could not start.' };
  onStep('upload');
  const put = await fetch(`${u.url}&name=logo.png&type=image/png`, { method: 'PUT', body: png }).then(r => r.json()).catch(() => ({ success: false })) as { success?: boolean };
  if (!put.success) return { ok: false, error: 'The logo did not upload — try again.' };
  onStep('check');
  const a = await call<{ doc: VideoDoc; docVersion: number }>('logo_attach', { projectId, key: u.key, name, bgRemoved, baseVersion });
  if (!a.success) return { ok: false, error: a.error ?? 'The logo was not accepted.' };
  return { ok: true, doc: a.doc, docVersion: a.docVersion };
}
export async function loadScreen(url: string): Promise<import('../../worker/src/lib/video/pointer').ScreenMeta | null> {
  if (!url) return null;
  try { const r = await fetch(url); return r.ok ? await r.json() : null; } catch { return null; }
}
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
 * One part, PUT with XMLHttpRequest rather than fetch: only XHR reports the
 * bytes of a request body as they leave, which is what lets the progress
 * screen move with the real upload instead of jumping 16 MB at a time.
 */
function putPart(url: string, blob: Blob, onBytes: (n: number) => void, signal?: AbortSignal): Promise<{ status: number; body: { success?: boolean; error?: string; code?: string } }> {
  return new Promise((resolve, reject) => {
    const x = new XMLHttpRequest();
    x.open('PUT', url);
    x.upload.onprogress = e => onBytes(e.loaded);
    x.onload = () => { let body = {}; try { body = JSON.parse(x.responseText); } catch { /* not JSON */ } resolve({ status: x.status, body }); };
    x.onerror = () => reject(new Error('The connection dropped.'));
    x.onabort = () => reject(new Error('Upload paused.'));
    signal?.addEventListener('abort', () => x.abort(), { once: true });
    x.send(blob);
  });
}

/**
 * Upload a file in 16 MB parts, three at a time, each retried with back-off.
 * Choosing the same file again (same name, size and modified time) resumes:
 * the server remembers which parts arrived. Progress is bytes that have
 * really left the browser (parts the server confirmed plus the bytes of the
 * parts on their way) — never a timer.
 */
export async function uploadVideo(projectId: string, file: File, onProgress: (p: UploadProgress) => void, signal?: AbortSignal): Promise<{ ok: true } | { ok: false; error: string; code?: string }> {
  const start = await call<{ uploadId: string; partSize: number; parts: number; done: number[]; partUrl: string }>('upload_start', {
    projectId, name: file.name, size: file.size, type: file.type, fileKey: `${file.name}|${file.size}|${file.lastModified}`,
  });
  if (!start.success) return { ok: false, error: start.error ?? 'The upload could not start.', code: start.code };
  const done = new Set(start.done);
  const size = (n: number) => Math.min(start.partSize, file.size - (n - 1) * start.partSize);
  let confirmed = [...done].reduce((n, p) => n + size(p), 0);
  const flying = new Map<number, number>();
  const report = () => onProgress({ sent: Math.min(file.size, confirmed + [...flying.values()].reduce((a, b) => a + b, 0)), total: file.size, parts: start.parts, partsDone: done.size, resumed: start.done.length > 0 });
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
          const r = await putPart(`${start.partUrl}&part=${n}`, blob, b => { flying.set(n, b); report(); }, signal);
          flying.delete(n);
          if (r.body.success) { done.add(n); confirmed += size(n); report(); lastErr = ''; break; }
          lastErr = r.body.error ?? `part ${n} was refused (${r.status})`;
          if (r.status === 415 || r.status === 410 || r.status === 403) { failure = lastErr; report(); return; }
        } catch (e) {
          flying.delete(n); report();
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

/**
 * A direct link to a video file (…/talk.mp4 on the customer's own site or
 * storage): the Worker fetches it into the project — fenced like every
 * address somebody types — and answers when it is stored. The bytes it has
 * fetched so far are on `status` (`source.link`).
 */
export const importVideoLink = (projectId: string, url: string) => call<{ bytes: number }>('import_link', { projectId, url });

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
