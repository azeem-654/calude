/**
 * Quick Shorts' analysis of a video file, on the server (AI-1).
 *
 * The file goes up through Video Studio's own upload — a project made with
 * `long: false, shorts: 0`, the same way the Screen Recorder saves a
 * recording — and the Worker hands it to the AI on the install's keys
 * (`quick_analyze`, routes/video.ts). The page never talks to Google and holds
 * no key: it used to, with a key from localStorage that was empty for every
 * customer, so every upload came back 403.
 *
 * The project is a real Video Studio project, so the recording is there to
 * edit afterwards, and a retry analyses the stored file again instead of
 * uploading it twice.
 */
import { createVideoProject, uploadVideo, getVideoProject, type UploadProgress } from './videoStudio';
import { readAnalysis, type GeminiAnalysis } from '../lib/gemini';
import { API_BASE } from './apiBase';
import { sessionToken } from './auth';
import { getActiveAccountId } from './tenancy';

export interface QuickStep { stage: 'upload' | 'analyse'; progress?: UploadProgress; studioProjectId: string }

/** Ask the Worker to analyse the stored file of a Video Studio project. */
async function quickAnalyze(projectId: string, settings: { maxClipDuration: number; focus: string }): Promise<{ success?: boolean; error?: string; code?: string; analysis?: unknown }> {
  try {
    const r = await fetch(`${API_BASE}/api/video.php`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'quick_analyze', token: sessionToken(), accountId: getActiveAccountId(), projectId, quick: settings }),
    });
    return await r.json().catch(() => ({ success: false, error: `The server answered ${r.status}.` }));
  } catch {
    return { success: false, error: 'Could not reach the server — check your connection.' };
  }
}

/**
 * Upload (unless `studioProjectId` already holds the file) and analyse.
 * Throws a sentence the page can show; `onStep` reports the real upload bytes
 * and names the Video Studio project as soon as it exists, so the caller can
 * keep it for a retry.
 */
export async function analyseUploadedVideo(
  file: File | null,
  name: string,
  settings: { maxClipDuration: number; focus: string },
  knownDuration: number | undefined,
  onStep: (s: QuickStep) => void,
  studioProjectId?: string,
): Promise<{ analysis: GeminiAnalysis; studioProjectId: string }> {
  let id = studioProjectId ?? '';
  /* A project from an earlier try may already hold the file: analysed again, not uploaded again. */
  const stored = id ? await getVideoProject(id) : null;
  const hasFile = !!(stored?.success && (stored.source?.bytes ?? 0) > 0);
  if (!hasFile) {
    if (!file) throw new Error('The video file is no longer available in this browser. Choose it again to analyse it.');
    if (!id || !stored?.success) {
      const made = await createVideoProject({ name: `Quick Shorts — ${name}`.slice(0, 120), prompt: '', settings: { long: false, shorts: 0 } });
      if (!made.success || !made.id) throw new Error(made.error ?? 'The video could not be uploaded.');
      id = made.id;
    }
    onStep({ stage: 'upload', studioProjectId: id });
    const up = await uploadVideo(id, file, progress => onStep({ stage: 'upload', progress, studioProjectId: id }));
    if (!up.ok) throw new Error(up.error);
  }
  onStep({ stage: 'analyse', studioProjectId: id });
  const r = await quickAnalyze(id, settings);
  if (!r.success) throw new Error(r.error ?? 'The AI could not analyse this video.');
  return { analysis: readAnalysis(r.analysis, settings.maxClipDuration, knownDuration), studioProjectId: id };
}
