/**
 * /api/video.php — AI Video Studio (docs/VIDEO-STUDIO.md).
 *
 * Signed-in only, and every action names a workspace that is checked here;
 * every project, output and job is then read `WHERE account_id = ?` — a
 * project id from another workspace is "not found", never "forbidden", so
 * the answer does not even confirm it exists.
 *
 * Files never pass through this route: it hands out signed links to
 * /api/video-file.php (routes/videoFile.ts) after the check.
 *
 * Edits are optimistic: the browser sends the version it edited, and a stale
 * one is refused with the current document rather than overwriting somebody
 * else's change in another tab.
 */
import type { Env } from '../lib/db';
import { nowIso, userFromToken, workspaceAccess } from '../lib/db';
import { body, fail, json } from '../lib/http';
import { rateLimit } from '../lib/rateLimit';
import { loadAiKey } from '../lib/ai';
import {
  applyOps, describeRequest, newDoc, parseRequest, sentencesOf, SHORTS_MAX, MUSIC_DEFAULTS,
  type MusicTrack, type Op, type VideoDoc, type VideoRequest,
} from '../lib/video/edit';
import { proposeCleanup } from '../lib/video/cleanup';
import { parseVideoCommand } from '../lib/video/commands';
import { cleanMeta, type VideoMeta } from '../lib/video/shorts';
import { engineHealth, engineMode } from '../lib/video/engine';
import { transcriberMode } from '../lib/video/transcribe';
import { fileUrl, projectPrefix, workspacePrefix, sign, deletePrefix } from '../lib/video/store';
import { allowance, refusal } from '../lib/video/usage';
import { searchMusic, trackById, storeTrack, musicQuery, looksLikeAudio } from '../lib/video/music';
import { brandOf, kitOf, saveKit } from '../lib/video/brand';
import {
  advanceProject, cancelProject, enqueue, originOf, outputsOf, parse, readTranscript, renderSpec, stagesOf, syncOutputs, queueAfterEdit,
  recreditOutputs, type Extras, type JobRow, type OutputRow, type ProjectRow, type Source, type Thumb,
  cleanThumbSpec, thumbWords,
} from '../lib/video/pipeline';

interface Req {
  token?: string; accountId?: string; action?: string;
  projectId?: string; outputId?: string; name?: string; prompt?: string; settings?: Partial<VideoRequest> & { language?: string };
  autopilotProjectId?: string; workflowId?: string; spec?: unknown; playhead?: number;
  size?: number; type?: string; fileKey?: string; uploadId?: string;
  baseVersion?: number; ops?: Op[]; note?: string; version?: number; preset?: string;
  text?: string; selection?: { s: number; e: number } | null; clipId?: string | null;
  outputIds?: string[]; headline?: string; index?: number; status?: string; publishAt?: string | null;
  patch?: Record<string, unknown>; kit?: Record<string, unknown>; file?: string; probe?: boolean; light?: boolean; knownVersion?: number;
  q?: string; page?: number; trackId?: string; key?: string; title?: string; rightsConfirmed?: boolean; applyTo?: string;
  posts?: number; blog?: boolean; email?: boolean;
  want?: { repurpose?: { posts?: number; blog?: boolean; email?: boolean }; quiz?: boolean; denoise?: string; voice?: boolean; music?: string };
}

const s = (v: unknown, n: number) => String(v ?? '').replace(/[\u0000-\u001f]/g, ' ').trim().slice(0, n);
const VIDEO_EXT = /\.(mp4|m4v|mov|mkv|webm)$/i;
const VIDEO_TYPES = new Set(['video/mp4', 'video/quicktime', 'video/x-matroska', 'video/webm', 'video/x-m4v', '']);
const PART = 16 * 1024 * 1024;
const MAX_BYTES = 12e9;
const slug = (t: string) => t.toLowerCase().replace(/[^\p{L}\p{N}]+/gu, '-').replace(/^-|-$/g, '').slice(0, 60) || 'video';

/* ── What works, honestly ─────────────────────────────────────────────────── */

export type CapStatus = 'working' | 'needs_configuration' | 'unavailable' | 'planned';
export interface Capability { key: string; label: string; status: CapStatus; note: string }

async function capabilities(env: Env, accountId: string, probe: boolean): Promise<Capability[]> {
  const storage = !!env.VIDEO;
  const mode = engineMode(env);
  const health = probe && mode !== 'none' ? await engineHealth(env) : null;
  const engine = mode !== 'none' && (health ? health.ok : true);
  const stt = transcriberMode(env) !== 'none';
  const ai = !!(await loadAiKey(env, accountId).catch(() => null));
  const needs = (ok: boolean, _why = ''): CapStatus => ok ? 'working' : 'needs_configuration';
  return [
    { key: 'storage', label: 'Video storage', status: needs(storage, ''), note: storage ? 'Cloudflare R2' : 'The video bucket is not bound yet — the owner enables R2 in Cloudflare, then the next deploy creates it.' },
    { key: 'engine', label: 'Media engine (cuts, renders, thumbnails)', status: needs(engine, ''), note: mode === 'none' ? 'The FFmpeg engine is not deployed yet.' : health && !health.ok ? `Not answering: ${health.detail}` : mode === 'binding' ? 'Cloudflare Container, on demand' : 'External engine' },
    { key: 'transcription', label: 'Transcription with word timings', status: needs(stt, ''), note: stt ? 'Whisper large-v3-turbo on Workers AI — English, Turkish, Urdu and ~100 more, detected automatically' : 'Workers AI is not bound yet.' },
    { key: 'ai', label: 'AI topics, Shorts and metadata', status: ai ? 'working' : 'needs_configuration', note: ai ? 'Without it, Shorts and metadata are chosen by rule and say so.' : 'No AI key is available; Shorts and metadata are chosen by rule.' },
    { key: 'cleanup', label: 'Filler, pause, repeat and false-start cleanup', status: 'working', note: 'Proposed with reasons; you approve, reject, restore or protect.' },
    { key: 'captions', label: 'Captions: burned in, SRT, VTT', status: engine ? 'working' : 'needs_configuration', note: 'Word-timed, re-timed after every cut. Turkish and Urdu (right to left) set correctly.' },
    { key: 'reframe', label: '16:9, 9:16, 1:1, 4:5', status: engine ? 'working' : 'needs_configuration', note: 'Crop with a position you choose, or fit with a blurred fill to keep slides and screens whole.' },
    { key: 'thumbnails', label: 'PNG thumbnails', status: engine ? 'working' : 'needs_configuration', note: 'Exact headline text, brand colours and logo; every file checked to be a real PNG.' },
    { key: 'audio', label: 'Background noise reduction (light, medium, strong), voice clarity, loudness', status: engine ? 'working' : 'needs_configuration', note: 'Steady noise — fans, hum, hiss — is taken out. Distorted or cut-out speech cannot be rebuilt, and is not claimed to be.' },
    { key: 'music', label: 'Background music: royalty-free library and your own tracks', status: engine && storage ? 'working' : 'needs_configuration', note: 'Openverse tracks under CC0, public domain or CC BY only (credit added to descriptions), or your own upload with your rights confirmed. Ducked under speech, faded in and out.' },
    { key: 'repurpose', label: 'Repurpose: posts, an article and emails from the recording', status: ai ? 'working' : 'needs_configuration', note: 'Drafts in Social Creator, Blog and Campaigns — nothing is published or sent.' },
    { key: 'quiz', label: 'Quiz from a training recording', status: ai ? 'working' : 'needs_configuration', note: 'Multiple-choice questions about what is actually said, each linked to its moment.' },
    { key: 'speaker_tracking', label: 'Face and speaker tracking for 9:16 and other crops', status: !engine ? 'needs_configuration' : health && health.track === false ? 'needs_configuration' : 'working',
      note: health && health.track === false ? 'This engine was built without OpenCV — the next engine deploy adds it.' : 'Follows the most prominent face, or whoever\'s mouth moves while there is speech. It reads lips, not voices: two people talking at once, or a speaker turned away, are not told apart.' },
    { key: 'look', label: 'Colour, filters and finish', status: engine ? 'working' : 'needs_configuration', note: 'Temperature, tint, exposure, contrast, saturation, hue, sharpness, blur, vignette, grain and ten filters. The preview approximates; the render is exact.' },
    { key: 'motion', label: 'Animation: zooms, transitions, fades, speed, progress bar', status: engine ? 'working' : 'needs_configuration', note: 'Punch-ins on every other sentence or a slow push, a flash or dip at jump cuts, fades, 0.5–2× speed with captions re-timed.' },
    { key: 'overlays', label: 'Words on screen (titles, lower thirds, calls to action)', status: engine ? 'working' : 'needs_configuration', note: 'Animated — pop, slide, fade, reveal — and placed on the recording, so they stay with their moment through every cut.' },
    { key: 'thumb_edit', label: 'Thumbnail designer (trending layouts)', status: engine ? 'working' : 'needs_configuration', note: 'Face close-up with big outlined words, ring-and-arrow callout, cinematic, two moments, big number — words, colours, frame and zoom yours to change.' },
    { key: 'speakers', label: 'Speaker labels', status: 'unavailable', note: 'Needs a transcription provider with speaker detection.' },
    { key: 'audio_preview', label: 'Before/after audio preview in the browser', status: 'planned', note: 'Today: render, then listen to the finished file.' },
    { key: 'eye_contact', label: 'Eye-contact correction', status: 'unavailable', note: 'Provider setup required.' },
    { key: 'bg_removal', label: 'Portrait background removal', status: 'unavailable', note: 'Provider setup required. A portrait can be used as it is.' },
    { key: 'publishing', label: 'Direct publishing to social platforms', status: 'unavailable', note: 'Ready to publish manually: download the video and PNG, copy the caption, description and hashtags.' },
    { key: 'import', label: 'Import from YouTube, Google Drive, Dropbox', status: 'planned', note: 'Upload a file you own for now.' },
  ];
}

/* ── Reading a project back ───────────────────────────────────────────────── */

async function signedOutputs(env: Env, origin: string, p: ProjectRow, outs: OutputRow[], doc: VideoDoc | null, src: Source): Promise<Record<string, unknown>[]> {
  const tr = doc ? await readTranscript(env, p).catch(() => null) : null;
  return Promise.all(outs.map(async o => {
    const files = parse<{ mp4?: { key: string; bytes: number }; srt?: string; vtt?: string }>(o.files, {});
    const thumbs = parse<Thumb[]>(o.thumbs, []);
    const spec = doc ? renderSpec(doc, src, o, tr) : null;
    const base = slug(o.title || p.name);
    return {
      id: o.id, kind: o.kind, clipId: o.clip_id, title: o.title, status: o.status, error: o.error, version: o.version,
      stale: !!(spec && o.edit_hash && spec.hash !== o.edit_hash), rendered: !!files.mp4,
      duration: o.duration, width: o.width, height: o.height, bytes: files.mp4?.bytes ?? 0, publishAt: o.publish_at,
      meta: parse<VideoMeta | Record<string, never>>(o.meta, {}),
      mp4Url: files.mp4 ? await fileUrl(env, origin, p.account_id, files.mp4.key) : '',
      downloadUrl: files.mp4 ? await fileUrl(env, origin, p.account_id, files.mp4.key, 7200, `${base}.mp4`) : '',
      srtUrl: files.srt ? await fileUrl(env, origin, p.account_id, files.srt, 7200, `${base}.srt`) : '',
      vttUrl: files.vtt ? await fileUrl(env, origin, p.account_id, files.vtt, 7200, `${base}.vtt`) : '',
      chosenThumb: o.chosen_thumb,
      thumbs: await Promise.all(thumbs.map(async (t, i) => ({
        index: i, layout: t.layout, width: t.width, height: t.height, bytes: t.bytes, verified: t.verified, check: t.check, headline: t.headline, set: t.set,
        spec: t.spec ?? null, face: !!t.face,
        url: await fileUrl(env, origin, p.account_id, t.key),
        downloadUrl: t.verified ? await fileUrl(env, origin, p.account_id, t.key, 7200, `${base}-thumbnail-${i + 1}.png`) : '',
      }))),
    };
  }));
}

async function readProject(env: Env, accountId: string, id: string): Promise<ProjectRow | null> {
  return env.DB.prepare('SELECT * FROM crm_video_projects WHERE id = ? AND account_id = ?').bind(id, accountId).first<ProjectRow>();
}

async function projectView(env: Env, origin: string, p: ProjectRow, opts: { light?: boolean; knownVersion?: number } = {}): Promise<Record<string, unknown>> {
  const src = parse<Source>(p.source, {});
  const doc = parse<VideoDoc | null>(p.doc, null);
  const { results: jobs } = await env.DB.prepare('SELECT * FROM crm_video_jobs WHERE project_id = ? ORDER BY created_at').bind(p.id).all<JobRow>();
  const outs = await outputsOf(env, p.id);
  const upload = await env.DB.prepare(`SELECT id, name, bytes, part_size, parts, file_key, state FROM crm_video_uploads WHERE project_id = ? AND state = 'open' ORDER BY created_at DESC LIMIT 1`)
    .bind(p.id).first<{ id: string; name: string; bytes: number; part_size: number; parts: string; file_key: string; state: string }>();
  const ap = p.autopilot_project_id
    ? await env.DB.prepare('SELECT name FROM crm_projects WHERE id = ? AND account_id = ?').bind(p.autopilot_project_id, p.account_id).first<{ name: string }>()
    : null;
  const maxV = await env.DB.prepare('SELECT MAX(version) AS v FROM crm_video_versions WHERE project_id = ?').bind(p.id).first<{ v: number | null }>();
  const sendDoc = !opts.light || opts.knownVersion !== p.doc_version;
  return {
    project: {
      id: p.id, name: p.name, prompt: p.prompt, status: p.status, stage: p.stage, stageNote: p.stage_note, error: p.error,
      language: p.language, createdAt: p.created_at, updatedAt: p.updated_at,
      autopilotProjectId: p.autopilot_project_id, autopilotProjectName: ap?.name ?? '', workflowId: p.workflow_id,
    },
    request: parse<VideoRequest | null>(p.request, null),
    source: {
      name: src.name ?? '', bytes: src.bytes ?? 0, probe: src.probe ?? null,
      proxyUrl: src.proxy ? await fileUrl(env, origin, p.account_id, src.proxy, 4 * 3600) : '',
      track: src.track ? { ready: !!src.track.key, summary: src.track.summary ?? null, error: src.track.error ?? '', at: src.track.at } : null,
      trackUrl: src.track?.key && sendDoc ? await fileUrl(env, origin, p.account_id, src.track.key, 4 * 3600) : '',
      posterUrl: src.poster ? await fileUrl(env, origin, p.account_id, src.poster, 4 * 3600) : '',
      waveUrl: src.wave && sendDoc ? await fileUrl(env, origin, p.account_id, src.wave, 4 * 3600) : '',
      filmstrip: src.filmstrip ? { url: await fileUrl(env, origin, p.account_id, src.filmstrip.key, 4 * 3600), every: src.filmstrip.every, tiles: src.filmstrip.tiles, w: src.filmstrip.w, h: src.filmstrip.h } : null,
      silences: sendDoc ? src.silences ?? [] : undefined,
    },
    extras: parse<Extras>(p.extras, {}),
    musicUrl: doc?.music ? await fileUrl(env, origin, p.account_id, doc.music.key, 4 * 3600) : '',
    transcriptUrl: p.transcript_key && sendDoc ? await fileUrl(env, origin, p.account_id, p.transcript_key, 4 * 3600) : '',
    docVersion: p.doc_version, maxVersion: maxV?.v ?? p.doc_version,
    ...(sendDoc ? { doc } : {}),
    outputs: await signedOutputs(env, origin, p, outs, doc, src),
    stages: stagesOf(p, jobs, outs, upload),
    jobs: jobs.slice(-40).map(j => ({ id: j.id, kind: j.kind, target: j.target, state: j.state, attempts: j.attempts, progress: j.progress, stage: j.stage, error: j.error })),
    upload: upload ? { id: upload.id, name: upload.name, bytes: upload.bytes, partSize: upload.part_size, done: Object.keys(parse<Record<string, string>>(upload.parts, {})).map(Number), fileKey: upload.file_key } : null,
  };
}

/* ── Saving an edit ───────────────────────────────────────────────────────── */

/**
 * Apply operations at `base`, as version base+1. Versions past the current
 * one (after an undo) are the redo history and go — an edit after an undo
 * starts a new branch, as in every editor.
 */
async function saveEdit(env: Env, p: ProjectRow, base: number | undefined, ops: Op[], note: string, who: string): Promise<{ ok: true; doc: VideoDoc; version: number; refused: string[] } | { ok: false; conflict: true; doc: VideoDoc; version: number }> {
  const doc = parse<VideoDoc>(p.doc, null as unknown as VideoDoc);
  if (base !== undefined && base !== p.doc_version) return { ok: false, conflict: true, doc, version: p.doc_version };
  const duration = parse<Source>(p.source, {}).probe?.duration ?? 0;
  const { doc: next, refused } = applyOps(doc, ops, duration);
  const version = p.doc_version + 1;
  const r = await env.DB.batch([
    env.DB.prepare('DELETE FROM crm_video_versions WHERE project_id = ? AND version >= ?').bind(p.id, version),
    env.DB.prepare('UPDATE crm_video_projects SET doc = ?, doc_version = ?, updated_at = ? WHERE id = ? AND doc_version = ?')
      .bind(JSON.stringify(next), version, nowIso(), p.id, p.doc_version),
    env.DB.prepare('INSERT OR REPLACE INTO crm_video_versions (project_id, version, account_id, doc, note, created_by, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)')
      .bind(p.id, version, p.account_id, JSON.stringify(next), note.slice(0, 200), who, nowIso()),
  ]);
  if (!r[1].meta.changes) {
    const cur = (await readProject(env, p.account_id, p.id))!;
    return { ok: false, conflict: true, doc: parse<VideoDoc>(cur.doc, doc), version: cur.doc_version };
  }
  p.doc = JSON.stringify(next);
  p.doc_version = version;
  return { ok: true, doc: next, version, refused };
}

/** After an edit: output rows for new or removed clips; new ones are made at once, changed ones wait for "Render". */
async function afterEdit(env: Env, origin: string, p: ProjectRow, doc: VideoDoc, rerender: string[] = []): Promise<string> {
  const outs = await syncOutputs(env, p, doc);
  const fresh = outs.filter(o => !o.edit_hash && o.status === 'processing').map(o => o.id);
  const again = outs.filter(o => rerender.includes('*') || rerender.includes(o.clip_id) || rerender.includes(o.id)).map(o => o.id);
  if (!fresh.length && !again.length) return '';
  const r = await queueAfterEdit(env, origin, p, { metadata: true, only: [...fresh, ...again] });
  return r.refused;
}

/* ── Music: a licensed track fetched by the server, then set on the edit ─── */

async function addMusic(env: Env, p: ProjectRow, base: number | undefined, pick: { trackId?: string; query?: string }, who: string, applyTo?: string):
  Promise<{ ok: true; doc: VideoDoc; version: number; track: MusicTrack } | { ok: false; error: string }> {
  let t: Awaited<ReturnType<typeof trackById>> = null;
  if (pick.trackId) t = await trackById(env, pick.trackId);
  else {
    /* "Add calm music": the first licensed track the search finds that also
       downloads — the screen names it and the Music panel offers others. */
    const found = await searchMusic(env, musicQuery(pick.query ?? ''));
    if (!found.ok) return { ok: false, error: found.error };
    for (const f of found.tracks.filter(x => x.duration >= 30).slice(0, 4)) { t = await trackById(env, f.id); if (t) break; }
  }
  if (!t) return { ok: false, error: 'No licensed track was found for that — try other words, or upload your own in the Music panel.' };
  const stored = await storeTrack(env, p.account_id, t);
  if (!stored.ok) return { ok: false, error: stored.error };
  const prev = parse<VideoDoc>(p.doc, null as unknown as VideoDoc).music;
  const track: MusicTrack = {
    id: t.id, key: stored.key, title: t.title, artist: t.artist, license: t.license, licenseUrl: t.licenseUrl, attribution: t.attribution,
    source: 'openverse', sourceUrl: t.pageUrl, duration: t.duration,
    volume: prev?.volume ?? MUSIC_DEFAULTS.volume, fadeIn: prev?.fadeIn ?? MUSIC_DEFAULTS.fadeIn, fadeOut: prev?.fadeOut ?? MUSIC_DEFAULTS.fadeOut,
    loop: prev?.loop ?? MUSIC_DEFAULTS.loop, duck: prev?.duck ?? MUSIC_DEFAULTS.duck,
    applyTo: applyTo === 'long' || applyTo === 'shorts' ? applyTo : prev?.applyTo ?? 'all',
  };
  const r = await saveEdit(env, p, base, [{ op: 'music.set', track }], `Music: “${t.title}” by ${t.artist}`, who);
  if (!r.ok) return { ok: false, error: 'This project changed in another window — try again.' };
  await recreditOutputs(env, p, r.doc);
  return { ok: true, doc: r.doc, version: r.version, track };
}

const musicSentence = (t: MusicTrack) => `Added “${t.title}” by ${t.artist} (${t.license}${t.attribution ? ' — the credit is added to each description' : ''}) under ${t.applyTo === 'all' ? 'every video' : t.applyTo === 'long' ? 'the long video' : 'the Shorts'}, ducked under your voice.`;

/* ── The route ────────────────────────────────────────────────────────────── */

export async function handleVideo(req: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
  const d = await body<Req>(req);
  const user = await userFromToken(env.DB, d.token);
  if (!user) return fail('Sign in again to use Video Studio.', 401, { code: 'unauthorised' });
  const accountId = String(d.accountId ?? '').trim();
  /* An empty or odd id is refused before any lookup — an agency naming '' must
     not be treated as naming a workspace nobody has claimed yet. */
  if (!/^[A-Za-z0-9_.-]{1,64}$/.test(accountId)) return fail('A valid workspace is required.', 400, { code: 'no_workspace' });
  const access = await workspaceAccess(env.DB, user, accountId);
  if (!access.ok) return fail(access.message ?? 'That workspace is not yours.', 403, { code: access.code });
  const act = s(d.action, 40);
  const origin = originOf(env, req);
  const kick = (projectId: string) => ctx.waitUntil(advanceProject(env, origin, projectId, 25_000).catch(() => 0));

  if (act === 'capabilities') {
    return json({ success: true, capabilities: await capabilities(env, accountId, !!d.probe), usage: await allowance(env, accountId) });
  }

  if (act === 'list') {
    const { results } = await env.DB.prepare(
      `SELECT p.*, (SELECT COUNT(*) FROM crm_video_outputs o WHERE o.project_id = p.id AND o.kind = 'short') AS shorts,
              (SELECT COUNT(*) FROM crm_video_outputs o WHERE o.project_id = p.id AND o.status IN ('approved','ready_to_publish')) AS approved,
              (SELECT name FROM crm_projects a WHERE a.id = p.autopilot_project_id AND a.account_id = p.account_id) AS autopilot_name
         FROM crm_video_projects p WHERE p.account_id = ? ORDER BY p.updated_at DESC LIMIT 200`,
    ).bind(accountId).all<ProjectRow & { shorts: number; approved: number; autopilot_name: string | null }>();
    const projects = await Promise.all(results.map(async p => {
      const src = parse<Source>(p.source, {});
      return {
        id: p.id, name: p.name, status: p.status, stage: p.stage, error: p.error, createdAt: p.created_at, updatedAt: p.updated_at,
        duration: src.probe?.duration ?? 0, sourceName: src.name ?? '', shorts: p.shorts, approved: p.approved,
        posterUrl: src.poster ? await fileUrl(env, origin, accountId, src.poster, 4 * 3600) : '',
        autopilotProjectId: p.autopilot_project_id, autopilotProjectName: p.autopilot_name ?? '',
      };
    }));
    return json({ success: true, projects });
  }

  if (act === 'create') {
    const rl = await rateLimit(env, { what: 'video-create', who: accountId, max: 40, windowSeconds: 3600 });
    if (!rl.allowed) return fail('That is a lot of new video projects in an hour — try again shortly.', 429);
    const no = await refusal(env, accountId, {});
    if (no) return fail(no, 402, { code: 'trial_ended' });
    let autopilot: string | null = null, workflow: string | null = null;
    let defaults: Partial<VideoRequest> = {};
    if (d.autopilotProjectId) {
      const ap = await env.DB.prepare('SELECT id FROM crm_projects WHERE id = ? AND account_id = ?').bind(s(d.autopilotProjectId, 80), accountId).first<{ id: string }>();
      if (!ap) return fail('That AI Autopilot project is not in this workspace.', 200, { field: 'video.autopilot' });
      autopilot = ap.id;
      const wf = d.workflowId
        ? await env.DB.prepare('SELECT id, nodes FROM crm_project_workflows WHERE id = ? AND project_id = ? AND account_id = ?').bind(s(d.workflowId, 80), ap.id, accountId).first<{ id: string; nodes: string }>()
        : await env.DB.prepare(`SELECT id, nodes FROM crm_project_workflows WHERE project_id = ? AND account_id = ? AND nodes LIKE '%"video_package"%' ORDER BY position LIMIT 1`).bind(ap.id, accountId).first<{ id: string; nodes: string }>();
      if (wf) {
        workflow = wf.id;
        /* "Every podcast → 5 Shorts": the workflow says what to make, so an
           upload into the project needs no prompt. */
        const node = parse<{ type?: string; config?: Record<string, unknown> }[]>(wf.nodes, []).find(n => n.config?.produces === 'video_package');
        const c = node?.config ?? {};
        /* Node configs are written as strings by the catalogue. */
        const n = (v: unknown) => Number.isFinite(Number(v)) && String(v ?? '').trim() !== '' ? Number(v) : null;
        const b = (v: unknown) => v === true || v === 'true' ? true : v === false || v === 'false' ? false : null;
        defaults = {
          ...(n(c.shorts) !== null ? { shorts: Math.min(SHORTS_MAX, Math.max(0, Math.round(n(c.shorts)!))) } : {}),
          ...(n(c.min) !== null ? { min: n(c.min)! } : {}), ...(n(c.max) !== null ? { max: n(c.max)! } : {}),
          ...(b(c.long) !== null ? { long: b(c.long)! } : {}), ...(b(c.captions) !== null ? { captions: b(c.captions)! } : {}),
          ...(b(c.thumbnails) !== null ? { thumbnails: b(c.thumbnails)! } : {}),
          ...(c.cleanup === 'conservative' || c.cleanup === 'balanced' || c.cleanup === 'aggressive' ? { cleanup: c.cleanup } : {}),
        };
      }
    }
    const prompt = s(d.prompt, 2000);
    /* A typed request wins; with none, the workflow's own settings do (the
       stand-in sentence only fills what the workflow does not say). */
    const reqd = prompt ? parseRequest(prompt, defaults)
      : { ...parseRequest(defaults.shorts !== undefined ? 'clean this recording' : 'clean this recording and create three shorts', defaults), ...defaults };
    const st = d.settings ?? {};
    const request: VideoRequest & { language?: string } = {
      ...reqd,
      ...(typeof st.long === 'boolean' ? { long: st.long } : {}),
      ...(Number.isFinite(Number(st.shorts)) && st.shorts !== undefined ? { shorts: Math.min(SHORTS_MAX, Math.max(0, Math.round(Number(st.shorts)))) } : {}),
      ...(Number(st.min) >= 10 ? { min: Math.min(170, Math.round(Number(st.min))) } : {}),
      ...(Number(st.max) >= 15 ? { max: Math.min(180, Math.round(Number(st.max))) } : {}),
      ...(typeof st.captions === 'boolean' ? { captions: st.captions } : {}),
      ...(typeof st.thumbnails === 'boolean' ? { thumbnails: st.thumbnails } : {}),
      ...(st.cleanup && ['conservative', 'balanced', 'aggressive'].includes(st.cleanup) ? { cleanup: st.cleanup } : {}),
      ...(st.aspect && ['9:16', '1:1', '4:5'].includes(st.aspect) ? { aspect: st.aspect } : {}),
      ...(st.layout === 'fit' || st.layout === 'crop' ? { layout: st.layout } : {}),
      ...(st.language && /^(en|tr|ur)$/.test(st.language) ? { language: st.language } : {}),
    };
    if (request.max < request.min + 5) request.max = request.min + 5;
    request.understood = describeRequest(request);
    const brand = await brandOf(env, accountId, autopilot).catch(() => null);
    const doc = newDoc(request, brand?.color ?? '');
    /* The welcome wizard's choices beyond the video itself. */
    const w = d.want ?? {};
    if (w.denoise && ['light', 'medium', 'strong'].includes(w.denoise)) doc.audio.denoise = w.denoise as 'medium';
    if (w.voice) doc.audio.voice = true;
    const extras: Extras = { want: {
      ...(w.repurpose ? { repurpose: { posts: Math.max(0, Math.min(6, Math.round(Number(w.repurpose.posts ?? 3)))), blog: w.repurpose.blog !== false, email: w.repurpose.email !== false } } : {}),
      ...(w.quiz ? { quiz: true } : {}),
    } };
    const id = `vp-${crypto.randomUUID()}`;
    const now = nowIso();
    const name = s(d.name, 120) || 'Untitled video';
    await env.DB.batch([
      env.DB.prepare(`INSERT INTO crm_video_projects (id, account_id, name, prompt, request, autopilot_project_id, workflow_id, status, doc, doc_version, extras, created_by, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, 'draft', ?, 1, ?, ?, ?, ?)`).bind(id, accountId, name, prompt, JSON.stringify(request), autopilot, workflow, JSON.stringify(doc), JSON.stringify(extras), user.email, now, now),
      env.DB.prepare('INSERT INTO crm_video_versions (project_id, version, account_id, doc, note, created_by, created_at) VALUES (?, 1, ?, ?, ?, ?, ?)')
        .bind(id, accountId, JSON.stringify(doc), 'Project created', user.email, now),
    ]);
    /* Music asked for in the wizard is found now, while the video uploads. */
    let musicNote = '';
    if (typeof w.music === 'string' && w.music.trim() && env.VIDEO) {
      const fresh = await readProject(env, accountId, id);
      const m = fresh ? await addMusic(env, fresh, 1, { query: w.music }, user.email) : null;
      musicNote = m?.ok ? musicSentence(m.track) : m ? `No music was added: ${m.error}` : '';
    }
    return json({ success: true, id, request, musicNote });
  }

  if (act === 'brand_get') return json({ success: true, brand: await brandOf(env, accountId, s(d.autopilotProjectId, 80) || null), kit: await kitOf(env, accountId) });
  if (act === 'brand_set') return json({ success: true, kit: await saveKit(env, accountId, (d.kit ?? {}) as never), brand: await brandOf(env, accountId) });
  if (act === 'usage') return json({ success: true, usage: await allowance(env, accountId) });

  if (act === 'library') {
    const { results } = await env.DB.prepare(
      `SELECT o.*, p.name AS project_name, p.autopilot_project_id AS ap FROM crm_video_outputs o JOIN crm_video_projects p ON p.id = o.project_id AND p.account_id = o.account_id
        WHERE o.account_id = ? ORDER BY o.updated_at DESC LIMIT 400`,
    ).bind(accountId).all<OutputRow & { project_name: string; ap: string | null }>();
    const items = await Promise.all(results.map(async o => {
      const thumbs = parse<Thumb[]>(o.thumbs, []);
      const t = thumbs[o.chosen_thumb] ?? thumbs.find(x => x.verified);
      const files = parse<{ mp4?: { key: string; bytes: number } }>(o.files, {});
      const meta = parse<Partial<VideoMeta>>(o.meta, {});
      return {
        id: o.id, projectId: o.project_id, projectName: o.project_name, autopilotProjectId: o.ap, kind: o.kind, title: o.title, status: o.status,
        duration: o.duration, width: o.width, height: o.height, publishAt: o.publish_at, updatedAt: o.updated_at,
        thumbUrl: t ? await fileUrl(env, origin, accountId, t.key, 4 * 3600) : '',
        thumbDownload: t?.verified ? await fileUrl(env, origin, accountId, t.key, 7200, `${slug(o.title)}-thumbnail.png`) : '',
        downloadUrl: files.mp4 ? await fileUrl(env, origin, accountId, files.mp4.key, 7200, `${slug(o.title)}.mp4`) : '',
        caption: [meta.titles?.[0], meta.hashtags?.join(' ')].filter(Boolean).join('\n\n'),
        description: meta.description ?? '', hashtags: (meta.hashtags ?? []).join(' '),
      };
    }));
    const sources = await env.DB.prepare(`SELECT id, name, source, created_at FROM crm_video_projects WHERE account_id = ? AND source != '{}' ORDER BY created_at DESC LIMIT 200`)
      .bind(accountId).all<{ id: string; name: string; source: string; created_at: string }>();
    return json({
      success: true, items,
      sources: await Promise.all(sources.results.map(async r => {
        const src = parse<Source>(r.source, {});
        return { projectId: r.id, projectName: r.name, name: src.name ?? '', bytes: src.bytes ?? 0, duration: src.probe?.duration ?? 0, width: src.probe?.width ?? 0, height: src.probe?.height ?? 0, createdAt: r.created_at,
          posterUrl: src.poster ? await fileUrl(env, origin, accountId, src.poster, 4 * 3600) : '' };
      })),
    });
  }

  /* ── Everything below is about one project, which must be this workspace's ── */
  const p = d.projectId ? await readProject(env, accountId, s(d.projectId, 80)) : null;
  const outputRow = async () => d.outputId && p
    ? env.DB.prepare('SELECT * FROM crm_video_outputs WHERE id = ? AND project_id = ? AND account_id = ?').bind(s(d.outputId, 80), p.id, accountId).first<OutputRow>()
    : null;
  if (!p) return fail('That video project was not found in this workspace.', 404, { code: 'not_found' });

  switch (act) {
    case 'get': case 'status': {
      const view = await projectView(env, origin, p, { light: act === 'status', knownVersion: d.knownVersion });
      /* Any open job, not only a project still "processing": a new thumbnail
         set or a re-render on a finished project must move while somebody
         watches, not wait for the next cron tick. */
      if ((view.jobs as { state: string }[]).some(j => j.state === 'queued' || j.state === 'running')) kick(p.id);
      return json({ success: true, ...view, capabilities: act === 'get' ? await capabilities(env, accountId, false) : undefined });
    }

    case 'rename': {
      const name = s(d.name, 120);
      if (!name) return fail('A project needs a name.', 200, { field: 'video.name' });
      await env.DB.prepare('UPDATE crm_video_projects SET name = ?, updated_at = ? WHERE id = ?').bind(name, nowIso(), p.id).run();
      return json({ success: true });
    }

    case 'upload_start': {
      if (!env.VIDEO) return fail('Video storage is not set up yet, so nothing can be uploaded. The owner enables R2 in Cloudflare; the next deploy creates the bucket.', 503, { code: 'no_storage' });
      const name = s(d.name, 200), size = Math.floor(Number(d.size)), type = s(d.type, 60).toLowerCase();
      if (!VIDEO_EXT.test(name) || !VIDEO_TYPES.has(type)) return fail('Choose an MP4, MOV, MKV or WebM video.', 200, { field: 'video.file', code: 'not_video' });
      if (!(size > 0) || size > MAX_BYTES) return fail('Videos up to 12 GB can be uploaded.', 200, { field: 'video.file' });
      const src = parse<Source>(p.source, {});
      if (src.key) return fail('This project already has its video. Start a new project for another recording.', 200, { code: 'has_source' });
      const no = await refusal(env, accountId, { bytes: size });
      if (no) return fail(no, 402, { code: 'allowance' });
      const fileKey = s(d.fileKey, 300);
      /* The same file chosen again picks up where it stopped. */
      const open = await env.DB.prepare(`SELECT * FROM crm_video_uploads WHERE project_id = ? AND account_id = ? AND state = 'open' AND file_key = ? AND bytes = ?`)
        .bind(p.id, accountId, fileKey, size).first<{ id: string; r2_key: string; part_size: number; parts: string }>();
      const ext = (name.match(VIDEO_EXT)?.[1] ?? 'mp4').toLowerCase();
      let id: string, key: string;
      if (open) { id = open.id; key = open.r2_key; } else {
        key = `${projectPrefix(accountId, p.id)}source/original.${ext}`;
        const up = await env.VIDEO.createMultipartUpload(key, { httpMetadata: { contentType: type || 'video/mp4' }, customMetadata: { name: name.slice(0, 120) } });
        id = `vu-${crypto.randomUUID()}`;
        await env.DB.prepare(`INSERT INTO crm_video_uploads (id, account_id, project_id, r2_key, upload_id, name, bytes, type, part_size, file_key, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`)
          .bind(id, accountId, p.id, key, up.uploadId, name, size, type || 'video/mp4', PART, fileKey, nowIso(), nowIso()).run();
        await env.DB.prepare(`UPDATE crm_video_projects SET status = 'uploading', stage = 'upload', updated_at = ? WHERE id = ?`).bind(nowIso(), p.id).run();
      }
      const t = await sign(env, { a: accountId, k: key, m: 'up', u: id }, 24 * 3600);
      return json({ success: true, uploadId: id, partSize: PART, parts: Math.ceil(size / PART), done: open ? Object.keys(parse<Record<string, string>>(open.parts, {})).map(Number) : [], partUrl: `${origin}/api/video-file.php?t=${t}` });
    }

    case 'upload_complete': {
      const row = await env.DB.prepare(`SELECT * FROM crm_video_uploads WHERE id = ? AND project_id = ? AND account_id = ? AND state = 'open'`)
        .bind(s(d.uploadId, 80), p.id, accountId).first<{ id: string; r2_key: string; upload_id: string; name: string; bytes: number; type: string; part_size: number; parts: string }>();
      if (!row || !env.VIDEO) return fail('That upload is not open any more.', 200, { code: 'no_upload' });
      const parts = parse<Record<string, string>>(row.parts, {});
      const n = Math.ceil(row.bytes / row.part_size);
      const missing = Array.from({ length: n }, (_, i) => i + 1).filter(i => !parts[String(i)]);
      if (missing.length) return json({ success: false, error: `${missing.length} part${missing.length === 1 ? '' : 's'} still to upload.`, missing: missing.slice(0, 50) });
      await env.VIDEO.resumeMultipartUpload(row.r2_key, row.upload_id).complete(Array.from({ length: n }, (_, i) => ({ partNumber: i + 1, etag: parts[String(i + 1)] })));
      const head = await env.VIDEO.head(row.r2_key);
      if (!head || head.size !== row.bytes) return fail('The upload did not arrive whole — choose the file again to resume.', 200, { code: 'incomplete' });
      const src: Source = { key: row.r2_key, name: row.name, bytes: row.bytes, type: row.type };
      await env.DB.batch([
        env.DB.prepare(`UPDATE crm_video_uploads SET state = 'done', updated_at = ? WHERE id = ?`).bind(nowIso(), row.id),
        env.DB.prepare(`UPDATE crm_video_projects SET source = ?, status = 'processing', stage = 'prepare', error = '', updated_at = ? WHERE id = ?`).bind(JSON.stringify(src), nowIso(), p.id),
      ]);
      await enqueue(env, { accountId, projectId: p.id, kind: 'prepare', idem: `prepare:${p.id}:${row.r2_key}` });
      kick(p.id);
      return json({ success: true });
    }

    case 'upload_abort': {
      const row = await env.DB.prepare(`SELECT id, r2_key, upload_id FROM crm_video_uploads WHERE project_id = ? AND account_id = ? AND state = 'open'`).bind(p.id, accountId).first<{ id: string; r2_key: string; upload_id: string }>();
      if (row && env.VIDEO) {
        await env.VIDEO.resumeMultipartUpload(row.r2_key, row.upload_id).abort().catch(() => null);
        await env.DB.prepare(`UPDATE crm_video_uploads SET state = 'aborted', updated_at = ? WHERE id = ?`).bind(nowIso(), row.id).run();
      }
      await env.DB.prepare(`UPDATE crm_video_projects SET status = 'draft', stage = '', updated_at = ? WHERE id = ? AND source = '{}'`).bind(nowIso(), p.id).run();
      return json({ success: true });
    }

    case 'edit': {
      /* A track and its licence are set only by the server (music_choose,
         music_attach); a browser may change how it plays, not what it is. */
      const ops = (Array.isArray(d.ops) ? d.ops.slice(0, 200) : []).filter(o => o?.op !== 'music.set');
      if (!ops.length) return fail('Nothing to change.');
      const r = await saveEdit(env, p, d.baseVersion, ops, s(d.note, 200) || 'Edited', user.email);
      if (!r.ok) return json({ success: false, conflict: true, error: 'This project changed in another window — showing the latest version.', doc: r.doc, docVersion: r.version });
      const refusedRender = await afterEdit(env, origin, p, r.doc);
      if (ops.some(o => o.op === 'music.remove' || o.op === 'music.patch')) await recreditOutputs(env, p, r.doc);
      kick(p.id);
      return json({ success: true, doc: r.doc, docVersion: r.version, refused: r.refused, note: refusedRender });
    }

    case 'goto_version': {
      const v = Math.floor(Number(d.version));
      const row = await env.DB.prepare('SELECT doc FROM crm_video_versions WHERE project_id = ? AND version = ?').bind(p.id, v).first<{ doc: string }>();
      if (!row) return fail('That version is not there.', 200, { code: 'no_version' });
      await env.DB.prepare('UPDATE crm_video_projects SET doc = ?, doc_version = ?, updated_at = ? WHERE id = ?').bind(row.doc, v, nowIso(), p.id).run();
      const doc = parse<VideoDoc>(row.doc, null as unknown as VideoDoc);
      p.doc = row.doc; p.doc_version = v;
      await afterEdit(env, origin, p, doc);
      return json({ success: true, doc, docVersion: v });
    }

    case 'versions': {
      const { results } = await env.DB.prepare('SELECT version, note, created_by, created_at FROM crm_video_versions WHERE project_id = ? ORDER BY version DESC LIMIT 100').bind(p.id).all();
      return json({ success: true, versions: results, current: p.doc_version });
    }

    case 'cleanup': {
      const preset = s(d.preset, 20);
      if (!['conservative', 'balanced', 'aggressive'].includes(preset)) return fail('Choose Conservative, Balanced or Aggressive.', 200, { field: 'video.cleanup' });
      const tr = await readTranscript(env, p);
      if (!tr) return fail('The transcript is not ready yet.');
      const src = parse<Source>(p.source, {});
      const cuts = proposeCleanup(tr.words, src.silences ?? null, preset as 'balanced', src.probe?.duration ?? tr.duration);
      const r = await saveEdit(env, p, d.baseVersion, [{ op: 'cleanup.preset', preset: preset as 'balanced', cuts }], `Cleanup: ${preset}`, user.email);
      if (!r.ok) return json({ success: false, conflict: true, error: 'This project changed in another window.', doc: r.doc, docVersion: r.version });
      return json({ success: true, doc: r.doc, docVersion: r.version });
    }

    case 'command': {
      const text = s(d.text, 400);
      if (!text) return fail('Say what to change.', 200, { field: 'video.command' });
      const tr = await readTranscript(env, p);
      const doc = parse<VideoDoc>(p.doc, null as unknown as VideoDoc);
      const duration = parse<Source>(p.source, {}).probe?.duration ?? tr?.duration ?? 0;
      const sel = d.selection && Number.isFinite(d.selection.s) && Number.isFinite(d.selection.e) ? { s: Number(d.selection.s), e: Number(d.selection.e) } : null;
      const res = parseVideoCommand(text, { doc, words: tr?.words ?? [], sentences: tr ? sentencesOf(tr.words) : [], duration, selection: sel, clipId: d.clipId ?? null, playhead: Number.isFinite(Number(d.playhead)) ? Number(d.playhead) : null });
      let out: { doc?: VideoDoc; docVersion?: number } = {};
      let base = d.baseVersion;
      if (res.ops.length) {
        const r = await saveEdit(env, p, base, res.ops, `You said: “${text.slice(0, 120)}”`, user.email);
        if (!r.ok) return json({ success: false, conflict: true, error: 'This project changed in another window — try again.', doc: r.doc, docVersion: r.version });
        out = { doc: r.doc, docVersion: r.version };
        base = r.version;
        if (res.ops.some(o => o.op === 'music.remove' || o.op === 'music.patch')) await recreditOutputs(env, p, r.doc);
      }
      if (res.music) {
        if (!env.VIDEO) res.reply = `${res.reply} Music needs video storage, which is not set up yet.`.trim();
        else {
          const m = await addMusic(env, p, base, { query: res.music.query }, user.email);
          if (m.ok) { out = { doc: m.doc, docVersion: m.version }; res.reply = `${res.reply} ${musicSentence(m.track)} Every video will render again.`.trim(); }
          else res.reply = `${res.reply} No music was added: ${m.error}`.trim();
        }
      }
      if (out.doc) {
        const note = await afterEdit(env, origin, p, out.doc, res.rerender ?? []);
        if (note) res.reply += ` ${note}`;
      }
      if (res.thumbnail) {
        const outs = await outputsOf(env, p.id);
        const o = res.thumbnail.target === 'long' ? outs.find(x => x.kind === 'long') : outs.find(x => x.clip_id === res.thumbnail!.target || x.id === res.thumbnail!.target) ?? outs.find(x => x.kind === 'long');
        if (o) {
          const sets = parse<Thumb[]>(o.thumbs, []).map(t => t.set);
          const set = Math.min(6, (sets.length ? Math.max(...sets) : 0) + 1);
          await enqueue(env, { accountId, projectId: p.id, kind: 'thumbnails', target: o.id, idem: `thumbs:${o.id}:${set}`, input: { set }, revive: true });
        } else res.reply = 'There is no rendered video to make a thumbnail for yet.';
      }
      kick(p.id);
      return json({ success: true, reply: res.reply, understood: res.understood, undo: !!res.undo, redo: !!res.redo, ...out });
    }

    case 'music_search': {
      const r = await searchMusic(env, s(d.q, 80) || 'calm instrumental', Number(d.page) || 1);
      if (!r.ok) return fail(r.error, 200, { code: 'music_unavailable' });
      /* Heard through this Worker, never straight from the library's hosts. */
      const tracks = await Promise.all(r.tracks.map(async t => ({ ...t,
        previewUrl: `${origin}/api/video-file.php?t=${await sign(env, { a: accountId, k: `${workspacePrefix(accountId)}music/listen`, m: 'listen', u: t.id }, 3600)}` })));
      return json({ success: true, tracks });
    }

    case 'music_choose': {
      if (!env.VIDEO) return fail('Video storage is not set up yet.', 503);
      const m = await addMusic(env, p, d.baseVersion, { trackId: s(d.trackId, 40) }, user.email, s(d.applyTo, 10));
      if (!m.ok) return fail(m.error, 200, { field: 'video.music' });
      await afterEdit(env, origin, p, m.doc);
      return json({ success: true, doc: m.doc, docVersion: m.version, reply: musicSentence(m.track) });
    }

    case 'music_upload_url': {
      if (!env.VIDEO) return fail('Video storage is not set up yet.', 503);
      const prefix = `${projectPrefix(accountId, p.id)}music/up-${crypto.randomUUID().slice(0, 8)}/`;
      return json({ success: true, url: `${origin}/api/video-file.php?t=${await sign(env, { a: accountId, k: prefix, m: 'put' }, 1800)}`, prefix });
    }

    case 'music_attach': {
      if (!env.VIDEO) return fail('Video storage is not set up yet.', 503);
      if (!d.rightsConfirmed) return fail('Tick the box to confirm you own this track or have a licence to use it in your videos.', 200, { field: 'video.musicRights' });
      const key = s(d.key, 300);
      if (!key.startsWith(`${projectPrefix(accountId, p.id)}music/up-`)) return fail('That upload is not part of this project.', 403);
      const obj = await env.VIDEO.get(key, { range: { offset: 0, length: 64 } });
      const head = obj ? new Uint8Array(await obj.arrayBuffer()) : new Uint8Array();
      if (!looksLikeAudio(head)) { await env.VIDEO.delete(key).catch(() => null); return fail('That file is not audio Video Studio can use (MP3, M4A, WAV, Ogg or FLAC).', 200, { field: 'video.musicFile' }); }
      const prev = parse<VideoDoc>(p.doc, null as unknown as VideoDoc).music;
      const track: MusicTrack = {
        id: `up-${crypto.randomUUID().slice(0, 8)}`, key, title: s(d.title, 120) || 'Your track', artist: user.name || user.email,
        license: 'Your own upload', licenseUrl: '', attribution: '', source: 'upload', sourceUrl: '', duration: 0,
        volume: prev?.volume ?? MUSIC_DEFAULTS.volume, fadeIn: prev?.fadeIn ?? MUSIC_DEFAULTS.fadeIn, fadeOut: prev?.fadeOut ?? MUSIC_DEFAULTS.fadeOut,
        loop: prev?.loop ?? true, duck: prev?.duck ?? true, applyTo: d.applyTo === 'long' || d.applyTo === 'shorts' ? d.applyTo : prev?.applyTo ?? 'all',
      };
      const r = await saveEdit(env, p, d.baseVersion, [{ op: 'music.set', track }], `Music: your upload “${track.title}” (rights confirmed by ${user.email})`, user.email);
      if (!r.ok) return json({ success: false, conflict: true, error: 'This project changed in another window — try again.' });
      await recreditOutputs(env, p, r.doc);
      await afterEdit(env, origin, p, r.doc);
      return json({ success: true, doc: r.doc, docVersion: r.version });
    }

    case 'repurpose': {
      if (!p.transcript_key) return fail('The recording has to be transcribed first.');
      const want = { posts: Math.max(0, Math.min(6, Math.round(Number(d.posts ?? 3)))), blog: d.blog !== false, email: d.email !== false };
      if (!want.posts && !want.blog && !want.email) return fail('Choose at least one thing to write.');
      await enqueue(env, { accountId, projectId: p.id, kind: 'repurpose', idem: `repurpose:${p.id}:${Date.now()}`, input: want });
      kick(p.id);
      return json({ success: true });
    }

    case 'quiz': {
      if (!p.transcript_key) return fail('The recording has to be transcribed first.');
      await enqueue(env, { accountId, projectId: p.id, kind: 'quiz', idem: `quiz:${p.id}:${Date.now()}` });
      kick(p.id);
      return json({ success: true });
    }

    case 'render': {
      const ids = Array.isArray(d.outputIds) ? d.outputIds.map(x => s(x, 80)) : undefined;
      const r = await queueAfterEdit(env, origin, p, { only: ids });
      if (r.refused) return fail(r.refused, 402, { code: 'allowance' });
      kick(p.id);
      return json({ success: true, queued: r.queued });
    }

    case 'thumbnails': {
      const o = await outputRow();
      if (!o) return fail('Choose a video first.', 200, { code: 'no_output' });
      if (d.headline !== undefined) {
        const r = await saveEdit(env, p, undefined, [{ op: 'thumbnail.headline', target: o.id, text: s(d.headline, 90) }], 'Thumbnail headline', user.email);
        if (!r.ok) return json({ success: false, conflict: true, error: 'Try again.' });
      }
      const sets = parse<Thumb[]>(o.thumbs, []).map(t => t.set);
      const set = Math.min(6, (sets.length ? Math.max(...sets) : 0) + 1);
      if (sets.includes(6)) return fail('Six sets is the most a video keeps — choose one of those.');
      await enqueue(env, { accountId, projectId: p.id, kind: 'thumbnails', target: o.id, idem: `thumbs:${o.id}:${set}:${Date.now()}`, input: { set } });
      kick(p.id);
      return json({ success: true, set });
    }

    case 'thumb_custom': {
      const o = await outputRow();
      if (!o) return fail('Choose a video first.', 200, { code: 'no_output' });
      const all = parse<Thumb[]>(o.thumbs, []);
      const set = Math.max(100, ...all.map(t => t.set)) + 1;
      const spec = cleanThumbSpec(d.spec, { layout: 'bold', text: thumbWords(o.title || p.name), highlight: '', at: 1, accent: '#facc15', color: '#0b0b12', textColor: '#ffffff', border: true, zoom: 0.5 });
      if (!spec.text) return fail('Write the words for the thumbnail.', 200, { field: 'video.thumbText' });
      await enqueue(env, { accountId, projectId: p.id, kind: 'thumbnails', target: o.id, idem: `thumbs:${o.id}:${set}`, input: { set, custom: spec } });
      kick(p.id);
      return json({ success: true, set });
    }

    case 'track_now': {
      const src = parse<Source>(p.source, {});
      if (!src.proxy) return fail('The video has to be prepared first.');
      await enqueue(env, { accountId, projectId: p.id, kind: 'track', idem: `track:${p.id}:${Date.now()}`, maxAttempts: 3 });
      kick(p.id);
      return json({ success: true });
    }

    case 'choose_thumb': {
      const o = await outputRow();
      if (!o) return fail('Choose a video first.');
      const thumbs = parse<Thumb[]>(o.thumbs, []);
      const i = Math.floor(Number(d.index));
      if (!thumbs[i]?.verified) return fail('That thumbnail did not pass the PNG check, so it cannot be chosen.');
      await env.DB.prepare('UPDATE crm_video_outputs SET chosen_thumb = ?, updated_at = ? WHERE id = ?').bind(i, nowIso(), o.id).run();
      return json({ success: true });
    }

    case 'set_status': {
      const o = await outputRow();
      if (!o) return fail('Choose a video first.');
      const status = s(d.status, 20);
      if (!['needs_review', 'approved', 'ready_to_publish'].includes(status)) return fail('Unknown status.');
      if (!parse<{ mp4?: unknown }>(o.files, {}).mp4) return fail('This video has not been rendered yet.');
      const at = d.publishAt === null ? null : d.publishAt ? new Date(String(d.publishAt)) : undefined;
      if (at && Number.isNaN(at.getTime())) return fail('That date is not valid.', 200, { field: 'video.publishAt' });
      await env.DB.prepare(`UPDATE crm_video_outputs SET status = ?, publish_at = ${at === undefined ? 'publish_at' : '?'}, updated_at = ? WHERE id = ?`)
        .bind(...(at === undefined ? [status, nowIso(), o.id] : [status, at ? at.toISOString() : null, nowIso(), o.id])).run();
      return json({ success: true });
    }

    case 'meta_update': {
      const o = await outputRow();
      if (!o) return fail('Choose a video first.');
      const cur = parse<VideoMeta>(o.meta, { titles: [], description: '', keywords: [], tags: [], hashtags: [], chapters: [], pinnedComment: '', cta: '', by: 'rules' });
      const merged = cleanMeta({ ...cur, pinned_comment: cur.pinnedComment, ...(d.patch ?? {}) }, o.kind, o.duration);
      if (!merged) return fail('A video needs a title and a description of at least a sentence.', 200, { field: 'video.meta' });
      if (o.kind === 'long' && !d.patch?.chapters) merged.chapters = cur.chapters;
      await env.DB.prepare('UPDATE crm_video_outputs SET meta = ?, title = ?, updated_at = ? WHERE id = ?').bind(JSON.stringify({ ...merged, by: 'you' }), merged.titles[0], nowIso(), o.id).run();
      return json({ success: true, meta: merged });
    }

    case 'regenerate_meta': {
      const o = await outputRow();
      if (!o) return fail('Choose a video first.');
      await env.DB.prepare(`UPDATE crm_video_outputs SET meta = '{}', updated_at = ? WHERE id = ?`).bind(nowIso(), o.id).run();
      await enqueue(env, { accountId, projectId: p.id, kind: 'metadata', idem: `meta:${o.id}:${Date.now()}`, input: { ids: [o.id] } });
      kick(p.id);
      return json({ success: true });
    }

    case 'retry': {
      const r = await env.DB.prepare(`UPDATE crm_video_jobs SET state = 'queued', attempts = 0, error = '', engine_ref = '', next_at = ?, updated_at = ? WHERE project_id = ? AND state = 'failed'`)
        .bind(nowIso(), nowIso(), p.id).run();
      await env.DB.prepare(`UPDATE crm_video_projects SET status = 'processing', error = '', updated_at = ? WHERE id = ? AND status = 'failed'`).bind(nowIso(), p.id).run();
      await env.DB.prepare(`UPDATE crm_video_outputs SET status = 'processing', error = '' WHERE project_id = ? AND status = 'failed'`).bind(p.id).run();
      kick(p.id);
      return json({ success: true, retried: r.meta.changes });
    }

    case 'cancel': {
      const n = await cancelProject(env, p.id);
      await env.DB.prepare(`UPDATE crm_video_projects SET status = CASE WHEN transcript_key IS NULL THEN 'failed' ELSE 'ready' END, error = CASE WHEN transcript_key IS NULL THEN 'Cancelled.' ELSE error END, updated_at = ? WHERE id = ?`).bind(nowIso(), p.id).run();
      return json({ success: true, cancelled: n });
    }

    case 'delete': {
      await cancelProject(env, p.id);
      await env.DB.batch([
        env.DB.prepare('DELETE FROM crm_video_outputs WHERE project_id = ? AND account_id = ?').bind(p.id, accountId),
        env.DB.prepare('DELETE FROM crm_video_jobs WHERE project_id = ? AND account_id = ?').bind(p.id, accountId),
        env.DB.prepare('DELETE FROM crm_video_versions WHERE project_id = ? AND account_id = ?').bind(p.id, accountId),
        env.DB.prepare('DELETE FROM crm_video_uploads WHERE project_id = ? AND account_id = ?').bind(p.id, accountId),
        env.DB.prepare('DELETE FROM crm_video_projects WHERE id = ? AND account_id = ?').bind(p.id, accountId),
      ]);
      ctx.waitUntil(deletePrefix(env, projectPrefix(accountId, p.id)).catch(() => 0));
      return json({ success: true });
    }
  }
  return fail('Unknown action.', 400);
}

export type { Capability as VideoCapability };
