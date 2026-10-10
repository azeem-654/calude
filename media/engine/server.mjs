/**
 * The media engine — FFmpeg behind a small HTTP API.
 *
 * Video Studio's heavy work (probing, proxies, audio for transcription,
 * renders, thumbnails) cannot run in a Worker: there is no subprocess, 128 MB
 * of memory and a CPU-time limit. It runs here instead, and this process is
 * deliberately *stateless and keyless*:
 *
 *   - it reads its inputs from signed, short-lived URLs the Worker hands it,
 *   - writes its outputs to signed upload URLs (single PUT, or R2 multipart
 *     through the Worker for anything large),
 *   - and reports a result. It never sees a database, a bucket key or an AI
 *     key, so a compromised engine can touch only the files of the job it was
 *     given, for the hour its URLs live.
 *
 * In production it is a Cloudflare Container (media/worker.ts — one instance
 * per job, scaled to zero) reached only through a service binding, so it has
 * no public address and runs with MEDIA_ENGINE_OPEN=1. Anywhere else, set
 * MEDIA_ENGINE_SECRET and every request must carry an HMAC of itself.
 *
 *   POST   /jobs          {id, op, params, inputs, upload, poke?}  → 202 {state}
 *   GET    /jobs/:id      → {state, stage, pct, result?, error?}
 *   DELETE /jobs/:id      → cancel
 *   GET    /health        → {ok, ffmpeg, busy}
 *
 * A job id seen before is answered with its state, not run again — the
 * Worker may dispatch twice (a retry after a timeout) and must not get two
 * renders for it.
 *
 * ── Hostile files ──
 *
 * Every input is untrusted. FFmpeg is told which protocols it may open and
 * which demuxers it may use (no HLS, no concat, no image sequences from a
 * video slot), so a crafted file cannot make it read local paths or reach
 * other hosts. Sizes, duration and resolution are checked by probe before any
 * work is spent on a file.
 */
import http from 'node:http';
import { spawn } from 'node:child_process';
import crypto from 'node:crypto';
import fs from 'node:fs';
import fsp from 'node:fs/promises';
import path from 'node:path';

const PORT = Number(process.env.PORT) || 8080;
const SECRET = process.env.MEDIA_ENGINE_SECRET || '';
const OPEN = process.env.MEDIA_ENGINE_OPEN === '1';
const WORK = process.env.WORK_DIR || '/tmp/pc-media';
const FONTS = process.env.FONTS_DIR || '/usr/share/fonts/truetype/noto';
const FFMPEG = process.env.FFMPEG || 'ffmpeg';
const FFPROBE = process.env.FFPROBE || 'ffprobe';
/** Plain http inputs are for a local test only; in production every URL is https. */
const ALLOW_HTTP = process.env.ALLOW_HTTP_INPUTS === '1';
const MAX_RUNNING = Number(process.env.MAX_RUNNING) || 2;
/* Face and speaker tracking: Python with OpenCV, the YuNet model beside it.
   Missing, the `track` op says so and everything else works as before. */
const PYTHON = process.env.PYTHON || 'python3';
const TRACK_PY = process.env.TRACK_PY || path.join(path.dirname(new URL(import.meta.url).pathname), 'track.py');
const FACE_MODEL = process.env.FACE_MODEL || path.join(path.dirname(new URL(import.meta.url).pathname), 'face_detection_yunet.onnx');
const PART = 16 * 1024 * 1024;

const VIDEO_FORMATS = 'mov,mp4,m4a,3gp,3g2,mj2,matroska,webm';
const IMAGE_FORMATS = 'png_pipe,jpeg_pipe,webp_pipe,image2';
const AUDIO_FORMATS = 'mp3,ogg,wav,flac,aac,mov,mp4,m4a,3gp,3g2,mj2,matroska,webm';
const PROTOCOLS = 'file,http,https,tcp,tls,crypto';
const VIDEO_CODECS = new Set(['h264', 'hevc', 'vp8', 'vp9', 'av1', 'prores', 'mpeg4', 'mjpeg', 'dnxhd']);
const AUDIO_CODECS = new Set(['aac', 'mp3', 'opus', 'vorbis', 'pcm_s16le', 'pcm_s24le', 'pcm_f32le', 'alac', 'flac', 'ac3', 'eac3']);

/** @type {Map<string, any>} */
const jobs = new Map();
const queue = [];
let running = 0;

/* ── Requests ─────────────────────────────────────────────────────────────── */

function send(res, status, body) {
  const s = JSON.stringify(body);
  res.writeHead(status, { 'content-type': 'application/json', 'content-length': Buffer.byteLength(s) });
  res.end(s);
}

/**
 * The request's own signature: HMAC-SHA256 over time, method, path and the
 * body's hash. Five minutes either way, so a captured request cannot be
 * replayed tomorrow.
 */
function signedOk(req, body) {
  if (OPEN && !SECRET) return true;
  if (!SECRET) return false;
  const ts = String(req.headers['x-pc-ts'] ?? '');
  const sig = String(req.headers['x-pc-sig'] ?? '');
  if (!/^\d{10}$/.test(ts) || Math.abs(Date.now() / 1000 - Number(ts)) > 300) return false;
  const bodyHash = crypto.createHash('sha256').update(body).digest('hex');
  const want = crypto.createHmac('sha256', SECRET).update(`${ts}\n${req.method}\n${req.url}\n${bodyHash}`).digest('hex');
  return sig.length === want.length && crypto.timingSafeEqual(Buffer.from(sig), Buffer.from(want));
}

const server = http.createServer(async (req, res) => {
  const chunks = [];
  for await (const c of req) { chunks.push(c); if (chunks.reduce((n, x) => n + x.length, 0) > 4 * 1024 * 1024) return send(res, 413, { error: 'too large' }); }
  const body = Buffer.concat(chunks);
  const url = new URL(req.url, 'http://engine');
  if (url.pathname === '/health') return send(res, 200, { ok: true, ffmpeg: await ffmpegVersion(), busy: running + queue.length, features: { track: await canTrack() } });
  if (url.pathname === '/busy') return send(res, 200, { busy: running + queue.length });
  if (!signedOk(req, body)) return send(res, 401, { error: 'unsigned' });

  const m = url.pathname.match(/^\/jobs\/([A-Za-z0-9_-]{6,80})$/);
  if (req.method === 'POST' && url.pathname === '/jobs') {
    let j;
    try { j = JSON.parse(body.toString('utf8')); } catch { return send(res, 400, { error: 'bad json' }); }
    if (!j || typeof j.id !== 'string' || !/^[A-Za-z0-9_-]{6,80}$/.test(j.id)) return send(res, 400, { error: 'bad id' });
    if (!OPS[j.op]) return send(res, 400, { error: 'unknown op' });
    const seen = jobs.get(j.id);
    if (seen) return send(res, 202, view(seen));
    const job = { id: j.id, op: j.op, params: j.params ?? {}, inputs: j.inputs ?? {}, upload: String(j.upload ?? ''), poke: String(j.poke ?? ''),
      state: 'queued', stage: 'queued', pct: null, result: null, error: '', children: new Set(), cancelled: false, at: Date.now() };
    for (const u of [...Object.values(job.inputs), job.upload, job.poke].filter(Boolean)) {
      if (!allowedUrl(String(u))) return send(res, 400, { error: 'input urls must be https' });
    }
    jobs.set(job.id, job);
    queue.push(job);
    pump();
    return send(res, 202, view(job));
  }
  if (m && req.method === 'GET') {
    const job = jobs.get(m[1]);
    return send(res, 200, job ? view(job) : { state: 'unknown' });
  }
  if (m && req.method === 'DELETE') {
    const job = jobs.get(m[1]);
    if (job) cancel(job);
    return send(res, 200, job ? view(job) : { state: 'unknown' });
  }
  send(res, 404, { error: 'not found' });
});

function allowedUrl(u) {
  try { const x = new URL(u); return x.protocol === 'https:' || (ALLOW_HTTP && x.protocol === 'http:'); } catch { return false; }
}

function view(job) {
  return { id: job.id, op: job.op, state: job.state, stage: job.stage, pct: job.pct, result: job.result, error: job.error };
}

function cancel(job) {
  job.cancelled = true;
  for (const c of job.children) { try { c.kill('SIGKILL'); } catch { /* gone */ } }
  if (job.state === 'queued' || job.state === 'running') { job.state = 'cancelled'; job.error = 'cancelled'; }
}

function pump() {
  while (running < MAX_RUNNING && queue.length) {
    const job = queue.shift();
    if (job.state !== 'queued') continue;
    running++;
    job.state = 'running';
    void run(job).finally(() => { running--; pump(); });
  }
}

async function run(job) {
  const dir = path.join(WORK, job.id);
  await fsp.mkdir(dir, { recursive: true });
  try {
    job.result = await OPS[job.op](job, dir);
    if (!job.cancelled) { job.state = 'done'; job.stage = 'done'; job.pct = 100; }
  } catch (e) {
    if (!job.cancelled) { job.state = 'failed'; job.error = String(e?.message ?? e).slice(0, 600); }
  } finally {
    await fsp.rm(dir, { recursive: true, force: true }).catch(() => {});
    job.finishedAt = Date.now();
    if (job.poke) fetch(job.poke, { method: 'POST', body: '{}', headers: { 'content-type': 'application/json' } }).catch(() => {});
  }
}

/* Finished jobs are remembered for two hours so a late poll still gets its answer. */
setInterval(() => {
  const cut = Date.now() - 2 * 3600_000;
  for (const [id, j] of jobs) if (j.finishedAt && j.finishedAt < cut) jobs.delete(id);
}, 600_000).unref();

/* ── Processes ────────────────────────────────────────────────────────────── */

let trackCache = null;
/** Is face tracking available here: Python, OpenCV, the script? Asked once. */
async function canTrack() {
  if (trackCache !== null) return trackCache;
  try { await exec(PYTHON, ['-c', 'import cv2, numpy'], null); trackCache = fs.existsSync(TRACK_PY); } catch { trackCache = false; }
  return trackCache;
}
const faceModel = () => (fs.existsSync(FACE_MODEL) ? ['--model', FACE_MODEL] : []);

let versionCache = '';
async function ffmpegVersion() {
  if (versionCache) return versionCache;
  try { versionCache = (await exec(FFMPEG, ['-version'], null)).stdout.split('\n')[0]; } catch { versionCache = 'missing'; }
  return versionCache;
}

/**
 * Run a binary, collecting its output. `onLine` sees stdout lines as they
 * arrive (FFmpeg's -progress), which is where the real percentages come from.
 */
function exec(bin, args, job, { onLine, stdoutTo, onData } = {}) {
  return new Promise((resolve, reject) => {
    if (job?.cancelled) return reject(new Error('cancelled'));
    const p = spawn(bin, args, { stdio: ['ignore', stdoutTo ? 'pipe' : 'pipe', 'pipe'] });
    job?.children.add(p);
    let out = '', err = '', buf = '';
    p.stdout.on('data', d => {
      if (onData) { onData(d); return; }
      const s = d.toString();
      if (out.length < 2_000_000) out += s;
      if (onLine) { buf += s; let i; while ((i = buf.indexOf('\n')) >= 0) { onLine(buf.slice(0, i)); buf = buf.slice(i + 1); } }
    });
    p.stderr.on('data', d => { err = (err + d.toString()).slice(-8000); });
    p.on('error', reject);
    p.on('close', code => {
      job?.children.delete(p);
      if (job?.cancelled) return reject(new Error('cancelled'));
      if (code === 0) resolve({ stdout: out, stderr: err });
      else reject(new Error(`${path.basename(bin)} exited ${code}: ${err.split('\n').filter(Boolean).slice(-4).join(' | ')}`));
    });
  });
}

const inVideo = url => ['-protocol_whitelist', PROTOCOLS, '-format_whitelist', VIDEO_FORMATS, '-i', url];
const inImage = url => ['-protocol_whitelist', PROTOCOLS, '-format_whitelist', IMAGE_FORMATS, '-i', url];
const base = ['-hide_banner', '-nostdin', '-y', '-loglevel', 'error'];

async function probe(url, job) {
  const { stdout } = await exec(FFPROBE, ['-v', 'error', '-print_format', 'json', '-show_format', '-show_streams',
    '-protocol_whitelist', PROTOCOLS, '-format_whitelist', VIDEO_FORMATS, url], job);
  return JSON.parse(stdout);
}

function summarise(info) {
  const v = (info.streams ?? []).find(s => s.codec_type === 'video' && s.disposition?.attached_pic !== 1);
  const a = (info.streams ?? []).find(s => s.codec_type === 'audio');
  let rot = 0;
  for (const sd of v?.side_data_list ?? []) if (typeof sd.rotation === 'number') rot = sd.rotation;
  if (!rot && v?.tags?.rotate) rot = Number(v.tags.rotate) || 0;
  const turned = Math.abs(rot) % 180 === 90;
  const fr = String(v?.avg_frame_rate || v?.r_frame_rate || '0/1').split('/').map(Number);
  return {
    format: String(info.format?.format_name ?? ''),
    duration: Number(info.format?.duration ?? v?.duration ?? 0),
    bytes: Number(info.format?.size ?? 0),
    width: turned ? v?.height : v?.width,
    height: turned ? v?.width : v?.height,
    rotation: rot,
    fps: fr[1] ? Math.round((fr[0] / fr[1]) * 100) / 100 : 0,
    vcodec: v?.codec_name ?? '',
    acodec: a?.codec_name ?? '',
    hasVideo: !!v,
    hasAudio: !!a,
  };
}

/** Real progress from FFmpeg's -progress lines, against the duration expected out. */
function progressTo(job, stage, expected, from = 0, span = 100) {
  job.stage = stage;
  job.pct = expected > 0 ? Math.round(from) : null;
  return line => {
    const m = line.match(/^out_time_(?:us|ms)=(\d+)/);
    if (m && expected > 0) job.pct = Math.min(99, Math.round(from + (Number(m[1]) / 1e6 / expected) * span));
  };
}

/* ── Uploads, through the Worker to R2 ────────────────────────────────────── */

async function retry(fn, n = 4) {
  let last;
  for (let i = 0; i < n; i++) {
    try { return await fn(); } catch (e) { last = e; await new Promise(r => setTimeout(r, 800 * 2 ** i)); }
  }
  throw last;
}

async function upload(job, file, name, type) {
  const size = (await fsp.stat(file)).size;
  const u = `${job.upload}&name=${encodeURIComponent(name)}&type=${encodeURIComponent(type)}`;
  const ok = async r => { if (!r.ok) throw new Error(`upload ${name}: ${r.status} ${(await r.text()).slice(0, 200)}`); return r.json(); };
  if (size <= PART) {
    const buf = await fsp.readFile(file);
    await retry(() => fetch(u, { method: 'PUT', body: buf, headers: { 'content-type': type } }).then(ok));
    return { name, bytes: size };
  }
  const { uploadId } = await retry(() => fetch(`${u}&op=mpu-start`, { method: 'POST' }).then(ok));
  const fh = await fsp.open(file, 'r');
  const parts = [];
  try {
    for (let n = 1, off = 0; off < size; n++, off += PART) {
      const len = Math.min(PART, size - off);
      const b = Buffer.alloc(len);
      await fh.read(b, 0, len, off);
      const r = await retry(() => fetch(`${u}&op=mpu-part&uploadId=${encodeURIComponent(uploadId)}&part=${n}`, { method: 'PUT', body: b }).then(ok));
      parts.push({ partNumber: n, etag: r.etag });
      if (job.cancelled) throw new Error('cancelled');
    }
  } finally { await fh.close(); }
  await retry(() => fetch(`${u}&op=mpu-complete&uploadId=${encodeURIComponent(uploadId)}`, {
    method: 'POST', body: JSON.stringify({ parts }), headers: { 'content-type': 'application/json' },
  }).then(ok));
  return { name, bytes: size };
}

/* ── prepare: probe, sound, chunks for transcription, proxy, poster ───────── */

const num = (v, d, lo, hi) => { const n = Number(v); return Number.isFinite(n) ? Math.min(hi, Math.max(lo, n)) : d; };

async function prepare(job, dir) {
  const src = job.inputs.source;
  const p = job.params;
  job.stage = 'probe';
  const info = summarise(await probe(src, job));
  const limits = { maxDuration: num(p.maxDuration, 3 * 3600, 2, 6 * 3600), maxSide: num(p.maxSide, 4096, 320, 8192), maxBytes: num(p.maxBytes, 10e9, 1e6, 50e9) };
  if (!info.hasVideo) throw new Error('refused: the file has no video stream');
  if (!VIDEO_CODECS.has(info.vcodec)) throw new Error(`refused: video codec ${info.vcodec || 'unknown'} is not supported`);
  if (info.hasAudio && !AUDIO_CODECS.has(info.acodec)) throw new Error(`refused: audio codec ${info.acodec} is not supported`);
  if (!(info.duration >= 2)) throw new Error('refused: the video is shorter than two seconds');
  if (info.duration > limits.maxDuration) throw new Error(`refused: the video is ${Math.round(info.duration / 60)} minutes, over the ${Math.round(limits.maxDuration / 60)}-minute limit`);
  if (!(info.width > 0 && info.height > 0) || Math.max(info.width, info.height) > limits.maxSide) throw new Error(`refused: ${info.width}×${info.height} is outside the supported size`);
  if (info.bytes > limits.maxBytes) throw new Error('refused: the file is larger than allowed');

  const files = {};
  let silences = [], chunks = [];
  if (info.hasAudio) {
    /* The sound, once, at 8 kHz: a waveform for the editor (20 peaks a second)
       and where it is quiet (RMS under -38 dBFS for 0.35 s or more). Silences
       come from the audio itself, not from gaps between words, so cleanup can
       tell a real pause from a stretch of music or laughter. */
    job.stage = 'sound';
    const rate = 8000, win = 400; // 50 ms windows
    const peaks = [];
    const quiet = [];
    let carry = Buffer.alloc(0), w = 0, pk = 0, sum = 0, cnt = 0, peakEvery = rate / 20, pc = 0, pmax = 0;
    let quietFrom = -1;
    const threshold = Math.pow(10, -38 / 20) * 32768;
    await exec(FFMPEG, [...base, ...inVideo(src), '-vn', '-ac', '1', '-ar', String(rate), '-f', 's16le', 'pipe:1'], job, {
      onData: d => {
        const b = carry.length ? Buffer.concat([carry, d]) : d;
        const n = Math.floor(b.length / 2);
        for (let i = 0; i < n; i++) {
          const v = b.readInt16LE(i * 2);
          const a = v < 0 ? -v : v;
          if (a > pmax) pmax = a;
          if (++pc >= peakEvery) { peaks.push(Math.min(255, Math.round((pmax / 32768) * 255))); pc = 0; pmax = 0; }
          sum += v * v; cnt++;
          if (cnt >= win) {
            const rms = Math.sqrt(sum / cnt);
            const t = (w * win) / rate;
            if (rms < threshold) { if (quietFrom < 0) quietFrom = t; } else if (quietFrom >= 0) { if (t - quietFrom >= 0.35) quiet.push([quietFrom, t]); quietFrom = -1; }
            w++; sum = 0; cnt = 0;
          }
          if (pk++ % 800000 === 0) job.pct = info.duration ? Math.min(99, Math.round(((pk / rate) / info.duration) * 100)) : null;
        }
        carry = b.subarray(n * 2);
      },
    });
    if (quietFrom >= 0 && (w * win) / rate - quietFrom >= 0.35) quiet.push([quietFrom, (w * win) / rate]);
    silences = quiet.map(([a, b]) => [Math.round(a * 100) / 100, Math.round(b * 100) / 100]);
    await fsp.writeFile(path.join(dir, 'wave.json'), JSON.stringify({ rate: 20, peaks: Buffer.from(peaks).toString('base64') }));
    files.wave = await upload(job, path.join(dir, 'wave.json'), 'wave.json', 'application/json');

    /* Pieces for transcription, about chunkSeconds long, cut in the middle of a
       pause near each mark so no word is split between two pieces. */
    job.stage = 'audio'; job.pct = null;
    const target = num(p.chunkSeconds, 180, 30, 600);
    const cuts = [];
    for (let t = target; t < info.duration - 10; t += target) {
      const near = silences.filter(([a, b]) => Math.abs((a + b) / 2 - t) <= 30).sort((x, y) => Math.abs((x[0] + x[1]) / 2 - t) - Math.abs((y[0] + y[1]) / 2 - t))[0];
      const at = near ? (near[0] + near[1]) / 2 : t;
      if (!cuts.length || at - cuts[cuts.length - 1] > 20) cuts.push(Math.round(at * 100) / 100);
    }
    const list = path.join(dir, 'chunks.csv');
    await exec(FFMPEG, [...base, ...inVideo(src), '-vn', '-ac', '1', '-ar', '16000', '-c:a', 'libmp3lame', '-b:a', '48k',
      '-f', 'segment', ...(cuts.length ? ['-segment_times', cuts.join(',')] : []), '-segment_list', list, '-segment_list_type', 'csv',
      '-reset_timestamps', '1', path.join(dir, 'chunk-%03d.mp3')], job);
    const rows = (await fsp.readFile(list, 'utf8')).trim().split('\n').filter(Boolean);
    for (const r of rows) {
      const [name, s, e] = r.split(',');
      files[name] = await upload(job, path.join(dir, name), name, 'audio/mpeg');
      chunks.push({ name, s: Number(s), e: Number(e) });
    }
  }

  /* The editor's copy: 540 lines, a keyframe every second for snappy seeking,
     faststart so it plays while it loads. Never shown as the final quality. */
  const ph = num(p.proxyHeight, 540, 240, 1080);
  const portrait = info.height > info.width;
  const scale = portrait ? `scale=${ph}:-2` : `scale=-2:${ph}`;
  await exec(FFMPEG, [...base, ...inVideo(src), '-vf', `${scale},fps=30`, '-c:v', 'libx264', '-preset', 'veryfast', '-crf', '28', '-g', '30',
    '-pix_fmt', 'yuv420p', ...(info.hasAudio ? ['-c:a', 'aac', '-b:a', '96k', '-ac', '2'] : ['-an']), '-movflags', '+faststart',
    '-progress', 'pipe:1', '-nostats', path.join(dir, 'proxy.mp4')], job, { onLine: progressTo(job, 'proxy', info.duration) });
  files.proxy = await upload(job, path.join(dir, 'proxy.mp4'), 'proxy.mp4', 'video/mp4');

  job.stage = 'poster'; job.pct = null;
  const at = Math.min(3, info.duration / 3);
  await exec(FFMPEG, [...base, '-ss', String(at), ...inVideo(src), '-frames:v', '1', '-vf', portrait ? 'scale=405:-2' : 'scale=-2:405', '-q:v', '4', path.join(dir, 'poster.jpg')], job);
  files.poster = await upload(job, path.join(dir, 'poster.jpg'), 'poster.jpg', 'image/jpeg');

  /* A filmstrip for the editor's timeline: one small frame every few seconds,
     side by side in one picture, read from the proxy (already small, so this
     is quick). */
  job.stage = 'filmstrip';
  const every = Math.max(2, Math.ceil(info.duration / 300));
  const tiles = Math.max(1, Math.floor(info.duration / every) + 1);
  await exec(FFMPEG, [...base, '-i', path.join(dir, 'proxy.mp4'), '-vf', `fps=1/${every},scale=112:63:force_original_aspect_ratio=increase,crop=112:63,tile=${tiles}x1`,
    '-frames:v', '1', '-q:v', '5', path.join(dir, 'filmstrip.jpg')], job);
  files.filmstrip = { ...(await upload(job, path.join(dir, 'filmstrip.jpg'), 'filmstrip.jpg', 'image/jpeg')), every, tiles, w: 112, h: 62 };

  return { probe: info, silences, chunks, files };
}

/* ── track: faces and the speaker, for framing that follows them ────────── */

/**
 * The editor's proxy, a few frames a second, piped into track.py (which never
 * opens a file or URL itself) together with where there is speech. The result
 * is two camera paths — the most prominent face, and the speaker — that the
 * Worker carries through the edit into each render.
 */
async function track(job, dir) {
  if (!(await canTrack())) throw new Error('refused: face tracking is not installed in this engine (Python with OpenCV)');
  const src = job.inputs.source;
  const fps = num(job.params.fps, 5, 1, 10);
  const info = summarise(await probe(src, job));
  if (!info.hasVideo) throw new Error('refused: no picture to track');
  const total = Math.ceil(info.duration * fps);
  /* Speech, per sampled frame: loud enough for long enough to be somebody talking. */
  const speech = [];
  if (info.hasAudio) {
    job.stage = 'sound';
    const rate = 8000, per = Math.round(rate / fps), threshold = Math.pow(10, -40 / 20) * 32768;
    let carry = Buffer.alloc(0), sum = 0, cnt = 0;
    await exec(FFMPEG, [...base, ...inVideo(src), '-vn', '-ac', '1', '-ar', String(rate), '-f', 's16le', 'pipe:1'], job, {
      onData: d => {
        const b = carry.length ? Buffer.concat([carry, d]) : d;
        const n = Math.floor(b.length / 2);
        for (let i = 0; i < n; i++) { const v = b.readInt16LE(i * 2); sum += v * v; if (++cnt >= per) { speech.push(Math.sqrt(sum / cnt) > threshold ? 1 : 0); sum = 0; cnt = 0; } }
        carry = b.subarray(n * 2);
      },
    });
  }
  await fsp.writeFile(path.join(dir, 'speech.json'), JSON.stringify(speech));
  const landscape = info.width >= info.height;
  const w = landscape ? 480 : even(480 * info.width / info.height), h = landscape ? even(480 * info.height / info.width) : 480;
  job.stage = 'faces'; job.pct = 0;
  const out = await new Promise((resolve, reject) => {
    const ff = spawn(FFMPEG, [...base, ...inVideo(src), '-an', '-vf', `fps=${fps},scale=${w}:${h}`, '-f', 'rawvideo', '-pix_fmt', 'bgr24', 'pipe:1'], { stdio: ['ignore', 'pipe', 'pipe'] });
    const py = spawn(PYTHON, [TRACK_PY, '--w', String(w), '--h', String(h), '--fps', String(fps), '--speech', path.join(dir, 'speech.json'), ...faceModel()], { stdio: ['pipe', 'pipe', 'pipe'] });
    job.children.add(ff); job.children.add(py);
    ff.stdout.pipe(py.stdin);
    py.stdin.on('error', () => {});
    let stdout = '', perr = '', ferr = '';
    py.stdout.on('data', d => { stdout += d.toString(); });
    py.stderr.on('data', d => {
      const s = d.toString();
      perr = (perr + s).slice(-4000);
      const m = s.match(/progress (\d+)/g);
      if (m) job.pct = Math.min(99, Math.round((Number(m[m.length - 1].split(' ')[1]) / Math.max(1, total)) * 100));
    });
    ff.stderr.on('data', d => { ferr = (ferr + d.toString()).slice(-2000); });
    py.on('error', reject); ff.on('error', reject);
    py.on('close', code => {
      job.children.delete(py); job.children.delete(ff);
      if (job.cancelled) return reject(new Error('cancelled'));
      if (code !== 0) return reject(new Error(`tracking failed: ${(perr || ferr).split('\n').filter(Boolean).slice(-3).join(' | ')}`));
      try { resolve(JSON.parse(stdout)); } catch { reject(new Error('tracking returned no result')); }
    });
  });
  await fsp.writeFile(path.join(dir, 'faces.json'), JSON.stringify(out));
  const up = await upload(job, path.join(dir, 'faces.json'), 'faces.json', 'application/json');
  return { file: up, summary: { detector: out.detector, seen: out.seen, faces: out.faces, tracks: out.tracks, switches: out.switches, frames: out.frames } };
}

/** Faces in one still (a thumbnail's frame), largest first, as fractions of the picture. */
async function facesIn(file, job) {
  if (!(await canTrack())) return [];
  try {
    const { stdout } = await exec(PYTHON, [TRACK_PY, '--image', file, ...faceModel()], job);
    return (JSON.parse(stdout).faces ?? []).filter(f => f.score >= 0.6);
  } catch { return []; }
}

/* ── render: the edit decisions, as a real MP4 ────────────────────────────── */

const HEX = /^#[0-9a-fA-F]{6}$/;
const even = n => Math.max(2, Math.round(n / 2) * 2);

/**
 * Cuts are applied by selecting frames rather than splicing pieces: one
 * decode, one encode, whatever the number of cuts. Every boundary is on the
 * 1/30 s grid (the Worker snaps them) and the sound is regrouped into frames of
 * exactly 1/30 s, so picture and sound keep exactly the same slots and lips
 * stay in sync however many hundred cuts a long recording has.
 */
/**
 * The look, as filters the engine owns: the request carries only numbers
 * (clamped here) and a preset's name from this list.
 */
const LOOK_PRESETS = {
  vivid: { sat: 0.35, con: 0.08 }, warm: { temp: 35, sat: 0.1 }, cool: { temp: -35, sat: 0.05 },
  cinematic: { con: 0.12, sat: -0.18, teal: true }, bw: { gray: true, con: 0.12 }, vintage: { curves: 'vintage', sat: -0.15, grain: 12 },
  punchy: { curves: 'strong_contrast', sat: 0.25 }, soft: { con: -0.1, bri: 0.03, sat: -0.05 }, food: { temp: 20, sat: 0.3, con: 0.05 },
};
function lookFilters(l) {
  if (!l || typeof l !== 'object') return [];
  const pre = LOOK_PRESETS[l.filter] ?? {};
  const f = [];
  /* Warmth, tint and the cinematic split in one per-channel table — a
     lookup per pixel, several times faster than colortemperature and
     colorbalance at 1080×1920 (measured), and the same shifts in effect. */
  const temp = (num(l.temperature, 0, -100, 100) + (pre.temp ?? 0)) / 100;
  const tint = num(l.tint, 0, -100, 100) / 100;
  const split = pre.teal ? 18 : 0;
  if (temp || tint || split) {
    const ch = (gain, sp) => `clip(val*${gain.toFixed(3)}${sp ? `${sp > 0 ? '+' : '-'}${Math.abs(sp)}*(val-128)/128` : ''},0,255)`;
    f.push(`lutrgb=r='${ch(1 + 0.22 * temp + 0.06 * tint, split)}':g='${ch(1 + 0.04 * temp - 0.12 * tint, 0)}':b='${ch(1 - 0.22 * temp + 0.06 * tint, -split)}'`);
  }
  if (pre.curves) f.push(`curves=preset=${pre.curves}`);
  const bri = num(l.brightness, 0, -100, 100) / 250 + (pre.bri ?? 0);
  const con = 1 + num(l.contrast, 0, -100, 100) / 150 + (pre.con ?? 0);
  const sat = pre.gray ? 0 : Math.max(0, 1 + num(l.saturation, 0, -100, 100) / 100 + (pre.sat ?? 0));
  const gam = Math.pow(2, num(l.exposure, 0, -100, 100) / 90);
  if (bri || con !== 1 || sat !== 1 || gam !== 1) f.push(`eq=brightness=${bri.toFixed(3)}:contrast=${con.toFixed(3)}:saturation=${sat.toFixed(3)}:gamma=${gam.toFixed(3)}`);
  const hue = num(l.hue, 0, -180, 180);
  if (hue) f.push(`hue=h=${hue}`);
  const sharp = num(l.sharpness, 0, 0, 100);
  if (sharp) f.push(`unsharp=5:5:${(sharp / 100 * 1.6).toFixed(2)}:5:5:0`);
  const blur = num(l.blur, 0, 0, 100);
  if (blur) f.push(`gblur=sigma=${(blur / 100 * 8).toFixed(2)}`);
  const vig = num(l.vignette, 0, 0, 100);
  if (vig) f.push(`vignette=angle=${(0.15 + vig / 100 * 0.6).toFixed(3)}`);
  const grain = num(l.grain, 0, 0, 100) + (pre.grain ?? 0);
  if (grain) f.push(`noise=alls=${Math.round(grain / 4)}:allf=t`);
  return f;
}

/**
 * Cuts are applied by selecting frames rather than splicing pieces: one
 * decode, one encode, whatever the number of cuts. Every boundary is on the
 * 1/30 s grid (the Worker snaps them) and the sound is regrouped into frames of
 * exactly 1/30 s, so picture and sound keep exactly the same slots and lips
 * stay in sync however many hundred cuts a long recording has.
 *
 * Time-varying work (a crop that follows a face, a flash at each cut) goes
 * through one `sendcmd` file the engine writes from the numbers it was sent;
 * zooms are a `zoompan` expression built here from time spans. A crop's size
 * never changes mid-stream (that stalls FFmpeg) — only where it sits.
 */
async function render(job, dir) {
  const p = job.params;
  const src = job.inputs.source;
  const keeps = (Array.isArray(p.keeps) ? p.keeps : []).map(k => [Number(k[0]), Number(k[1])]).filter(([a, b]) => Number.isFinite(a) && b > a);
  if (!keeps.length) throw new Error('nothing to render: every part is cut');
  const W = even(num(p.width, 1920, 160, 3840)), H = even(num(p.height, 1080, 160, 3840));
  const srcW = num(p.srcWidth, 1920, 16, 8192), srcH = num(p.srcHeight, 1080, 16, 8192);
  const fps = num(p.fps, 30, 24, 60);
  const speed = num(p.speed, 1, 0.5, 2);
  const s0 = Math.max(0, keeps[0][0]);
  const end = keeps[keeps.length - 1][1];
  const rel = keeps.map(([a, b]) => [a - s0, b - s0]);
  const total = rel.reduce((n, [a, b]) => n + (b - a), 0);
  const outTotal = total / speed;
  const half = 0.5 / fps;
  const sel = rel.map(([a, b]) => `between(t,${(a - 0.001).toFixed(4)},${(b - half).toFixed(4)})`).join('+');

  const cmds = [];
  const mode = ['crop', 'fit', 'source'].includes(p.mode) ? p.mode : 'source';
  let frame;
  if (mode === 'crop') {
    const cw = even(Math.min(srcW, srcH * W / H)), ch = even(Math.min(srcH, srcW * H / W));
    const place = (cx, cy) => [
      Math.round(Math.min(srcW - cw, Math.max(0, cx * srcW - cw / 2))),
      Math.round(Math.min(srcH - ch, Math.max(0, cy * srcH - ch * 0.42))),
    ];
    const cam = (Array.isArray(p.camera) ? p.camera : []).slice(0, 40000)
      .map(r => [num(r[0], 0, 0, 1e6), num(r[1], 0.5, 0, 1), num(r[2], 0.45, 0, 1), r[3] ? 1 : 0]).sort((a, b) => a[0] - b[0]);
    /* Without a path the crop sits where the customer put it, centred on that point. */
    const [x, y] = cam.length ? place(cam[0][1], cam[0][2]) : [
      Math.round(Math.min(srcW - cw, Math.max(0, num(p.cropX, 0.5, 0, 1) * srcW - cw / 2))),
      Math.round(Math.min(srcH - ch, Math.max(0, num(p.cropY, 0.5, 0, 1) * srcH - ch / 2))),
    ];
    frame = `crop@cam=${cw}:${ch}:${x}:${y},scale=${W}:${H}`;
    /* The path, ten times a second, eased between keyframes and stepped at cuts. */
    let last = [x, y];
    for (let i = 0; i < cam.length; i++) {
      const [t, cx, cy] = cam[i];
      const next = cam[i + 1];
      const stop = next ? next[0] : total;
      for (let u = t; u < stop - 1e-6; u += 0.1) {
        const k = next && !next[3] ? (u - t) / Math.max(1e-6, next[0] - t) : 0;
        const [px, py] = place(cx + (next && !next[3] ? (next[1] - cx) * k : 0), cy + (next && !next[3] ? (next[2] - cy) * k : 0));
        if (px !== last[0] || py !== last[1] || u === t) { cmds.push([u, `crop@cam x ${px}, crop@cam y ${py}`]); last = [px, py]; }
      }
    }
  } else if (mode === 'fit') {
    frame = `split[f1][f2];[f1]scale=${W}:${H}:force_original_aspect_ratio=increase,crop=${W}:${H},boxblur=24:2,eq=brightness=-0.08[bg];` +
      `[f2]scale=${W}:${H}:force_original_aspect_ratio=decrease[fg];[bg][fg]overlay=(W-w)/2:(H-h)/2`;
  } else {
    frame = `scale=${W}:${H}:force_original_aspect_ratio=decrease,pad=${W}:${H}:(ow-iw)/2:(oh-ih)/2:color=black`;
  }

  /* Zoom: a punch-in on the spans given, or a slow push across the video. */
  let zoom = '';
  const z = p.zoom && typeof p.zoom === 'object' ? p.zoom : null;
  if (z && (z.kind === 'punch' || z.kind === 'slow')) {
    const amt = num(z.amount, 1.12, 1.03, 1.35) - 1;
    let expr = '';
    if (z.kind === 'slow') expr = `1+${amt.toFixed(3)}*min(1,it/${Math.max(1, total).toFixed(2)})`;
    else {
      const spans = (Array.isArray(z.spans) ? z.spans : []).slice(0, 3000).map(sp => [num(sp[0], 0, 0, 1e6), num(sp[1], 0, 0, 1e6)]).filter(([a, b]) => b > a);
      if (spans.length) expr = `1+${amt.toFixed(3)}*(${spans.map(([a, b]) => `between(it,${a.toFixed(2)},${b.toFixed(2)})`).join('+')})`;
    }
    if (expr) zoom = `,zoompan=z='${expr}':x='iw/2-(iw/zoom/2)':y='ih*0.4-(ih/zoom*0.4)':d=1:s=${W}x${H}:fps=${fps}`;
  }

  /* A flash or a dip to black at each jump cut. */
  let trans = '';
  if (p.transition === 'flash' || p.transition === 'dip') {
    const level = p.transition === 'flash' ? 0.32 : -0.55;
    for (const t of (Array.isArray(p.cuts) ? p.cuts : []).slice(0, 4000).map(Number).filter(Number.isFinite)) {
      cmds.push([Math.max(0, t - 0.05), `eq@tr brightness ${level}`], [t + 0.08, 'eq@tr brightness 0']);
    }
    trans = ',eq@tr=brightness=0';
  }
  let send = '';
  if (cmds.length) {
    cmds.sort((a, b) => a[0] - b[0]);
    await fsp.writeFile(path.join(dir, 'cmds.txt'), cmds.map(([t, c]) => `${t.toFixed(3)} ${c};`).join('\n'));
    send = `sendcmd=f=${path.join(dir, 'cmds.txt')},`;
  }

  const look = lookFilters(p.look);
  let subs = '';
  for (const [k, key] of [['caps', 'ass'], ['words', 'overlayAss']]) {
    if (typeof p[key] === 'string' && p[key].length) {
      await fsp.writeFile(path.join(dir, `${k}.ass`), p[key]);
      subs += `,subtitles=filename=${path.join(dir, `${k}.ass`)}:fontsdir=${FONTS}`;
    }
  }
  const fadeIn = num(p.fadeIn, 0, 0, 5), fadeOut = num(p.fadeOut, 0, 0, 5);
  const fades = `${fadeIn ? `,fade=t=in:st=0:d=${fadeIn}` : ''}${fadeOut ? `,fade=t=out:st=${Math.max(0, outTotal - fadeOut).toFixed(3)}:d=${fadeOut}` : ''}`;
  const bar = p.progressBar ? `,drawbox=x=0:y=ih-${Math.max(6, Math.round(H * 0.008))}:w='iw*t/${outTotal.toFixed(3)}':h=${Math.max(6, Math.round(H * 0.008))}:color=${HEX.test(String(p.accent)) ? String(p.accent).replace('#', '0x') : '0xa855f7'}:t=fill` : '';
  const pace = speed !== 1 ? `,setpts=PTS/${speed},fps=${fps}` : '';
  const graph = [`[0:v]setpts=PTS-STARTPTS,fps=${fps},select='${sel}',setpts=N/${fps}/TB,${send}${frame}${zoom}${look.length ? `,${look.join(',')}` : ''}${trans}${pace}${subs}${fades}${bar},format=yuv420p[v]`];
  const hasAudio = p.hasAudio !== false;
  const audio = p.audio ?? {};
  /* Natural first: each level removes more steady noise (fans, hum, hiss) and
     the strongest also takes off the top end where hiss lives. Nothing here
     can rebuild a voice that clipped or dropped out — the screen says so. */
  const DENOISE = { light: 'afftdn=nr=10:nf=-42', medium: 'afftdn=nr=18:nf=-38:tn=1', strong: 'afftdn=nr=26:nf=-34:tn=1,lowpass=f=11000' };
  const voice = ['highpass=f=70'];
  if (DENOISE[audio.denoise]) voice.push(DENOISE[audio.denoise]);
  if (audio.voice) voice.push('equalizer=f=3200:t=q:w=1.2:g=2.5', 'deesser=i=0.35', 'acompressor=threshold=0.08:ratio=3:attack=8:release=120:makeup=1.5');
  const gain = num(audio.volume, 1, 0.3, 2);
  if (gain !== 1) voice.push(`volume=${gain}`);
  if (speed !== 1) voice.push(`atempo=${speed}`);
  const stereo = 'aformat=sample_fmts=fltp:sample_rates=48000:channel_layouts=stereo';
  const afades = `${fadeIn ? `,afade=t=in:st=0:d=${fadeIn}` : ''}${fadeOut ? `,afade=t=out:st=${Math.max(0, outTotal - fadeOut).toFixed(3)}:d=${fadeOut}` : ''}`;
  const level = `${audio.loudnorm !== false ? ',loudnorm=I=-16:LRA=11:TP=-1.5,aresample=48000' : ''}${afades}`;
  const music = p.music && job.inputs.music ? p.music : null;
  if (hasAudio) {
    graph.push(`[0:a]asetpts=PTS-STARTPTS,aresample=48000,asetnsamples=n=${48000 / fps}:p=0,aselect='${sel}',asetpts=N/SR/TB,${voice.join(',')},${stereo}[sp]`);
  }
  if (music) {
    /* The track under the voice: its own volume, faded in and out, cut to the
       video's length; ducked under speech so words stay clear. */
    const mv = num(music.volume, 0.18, 0, 1), fi = num(music.fadeIn, 1.5, 0, 10), fo = num(music.fadeOut, 2.5, 0, 15);
    graph.push(`[1:a]aresample=48000,${stereo},volume=${mv},atrim=0:${outTotal.toFixed(3)},asetpts=PTS-STARTPTS` +
      `${fi > 0 ? `,afade=t=in:st=0:d=${fi}` : ''}${fo > 0 ? `,afade=t=out:st=${Math.max(0, outTotal - fo).toFixed(3)}:d=${fo}` : ''}[m]`);
    if (hasAudio && music.duck !== false) {
      graph.push('[sp]asplit=2[sp1][sp2]', '[m][sp2]sidechaincompress=threshold=0.02:ratio=8:attack=15:release=350[md]', `[sp1][md]amix=inputs=2:duration=first:normalize=0${level}[a]`);
    } else if (hasAudio) {
      graph.push(`[sp][m]amix=inputs=2:duration=first:normalize=0${level}[a]`);
    } else {
      graph.push(`[m]anull${level}[a]`);
    }
  } else if (hasAudio) {
    graph.push(`[sp]anull${level}[a]`);
  }
  const withAudio = hasAudio || !!music;
  await fsp.writeFile(path.join(dir, 'graph.txt'), graph.join(';'));
  const out = path.join(dir, 'out.mp4');
  const musicIn = music ? [...(music.loop !== false ? ['-stream_loop', '-1'] : []), '-protocol_whitelist', PROTOCOLS, '-format_whitelist', AUDIO_FORMATS, '-i', job.inputs.music] : [];
  await exec(FFMPEG, [...base, '-ss', String(s0), '-t', String(end - s0 + 0.05), ...inVideo(src), ...musicIn,
    '-filter_complex_script', path.join(dir, 'graph.txt'), '-map', '[v]', ...(withAudio ? ['-map', '[a]'] : []),
    '-c:v', 'libx264', '-preset', String(p.preset ?? 'veryfast').replace(/[^a-z]/g, '') || 'veryfast', '-crf', String(num(p.crf, 21, 14, 32)),
    '-profile:v', 'high', '-r', String(fps), ...(withAudio ? ['-c:a', 'aac', '-b:a', '160k', '-ac', '2'] : []), '-t', outTotal.toFixed(3),
    '-movflags', '+faststart', '-progress', 'pipe:1', '-nostats', out], job, { onLine: progressTo(job, 'render', outTotal) });
  job.stage = 'check'; job.pct = null;
  const made = summarise(await probe(out, job));
  if (!made.hasVideo || made.vcodec !== 'h264') throw new Error('the render did not produce an H.264 video');
  if (Math.abs(made.duration - outTotal) > Math.max(1, outTotal * 0.02)) throw new Error(`the render is ${made.duration.toFixed(1)} s, expected ${outTotal.toFixed(1)} s`);
  const name = String(p.name ?? 'video.mp4').replace(/[^a-z0-9._-]/gi, '') || 'video.mp4';
  job.stage = 'upload';
  const up = await upload(job, out, name, 'video/mp4');
  return { file: up, duration: made.duration, width: made.width, height: made.height, vcodec: made.vcodec, acodec: made.acodec };
}

/* ── thumbnail: a frame, the brand and the exact words, as a real PNG ─────── */

/**
 * The layouts are named here, not sent as filter text: the Worker chooses a
 * layout and colours, and the engine owns what that means. A filter graph
 * assembled from request text would be an injection point.
 */
function layoutFilter(layout, W, H, color, accent) {
  const c = HEX.test(color) ? color.replace('#', '0x') : '0x5b46e5';
  const a = HEX.test(accent) ? accent.replace('#', '0x') : '0xa3e635';
  switch (layout) {
    case 'left':
      return `eq=contrast=1.06:saturation=1.12,drawbox=x=0:y=0:w=${Math.round(W * 0.62)}:h=${H}:color=black@0.58:t=fill,drawbox=x=0:y=0:w=${Math.round(W * 0.014)}:h=${H}:color=${a}@1:t=fill`;
    case 'band':
      return `eq=contrast=1.05:saturation=1.1,drawbox=x=0:y=${Math.round(H * 0.64)}:w=${W}:h=${H - Math.round(H * 0.64)}:color=${c}@0.94:t=fill`;
    case 'frame':
    default:
      return `crop=iw*0.86:ih*0.86,scale=${W}:${H},eq=contrast=1.1:saturation=1.18,drawbox=x=0:y=0:w=${W}:h=${H}:color=${c}@1:t=${Math.round(Math.min(W, H) * 0.035)}`;
  }
}

/* ── The trending layouts: built here from words, colours and a face ─────── */

/**
 * What a 2025–26 thumbnail that gets clicked looks like, by the creators'
 * own advice (docs/VIDEO-STUDIO.md §13): one dominant subject — a face, big;
 * three to five words; two or three colours; a thick outline on every letter,
 * because it has to read at phone size; one word picked out in the accent;
 * a coloured edge so it stands out on both YouTube themes; and, sparingly, a
 * ring or an arrow that points at what the video shows. Five layouts follow
 * that, each drawn from the frame and the face found in it:
 *   bold        the face close up on one side, the words huge on the other
 *   callout     the whole frame, a ring round the face and an arrow to it
 *   cinematic   letterboxed, muted and graded — for finance and documentary
 *   split       two moments side by side
 *   number      the figure in the headline, enormous, on an accent tile
 */
const THUMB_NEW = new Set(['bold', 'callout', 'cinematic', 'split', 'number']);
const assHex = (hex, alpha = 0) => { const h = HEX.test(hex) ? hex.slice(1) : 'ffffff'; return `&H${alpha.toString(16).padStart(2, '0')}${h.slice(4, 6)}${h.slice(2, 4)}${h.slice(0, 2)}`.toUpperCase(); };
const assSafe = t => String(t ?? '').replace(/[{}]/g, m => (m === '{' ? '(' : ')')).replace(/\\/g, '/').replace(/[\r\n]+/g, ' ').trim();
/* A figure worth a tile: "$49", "30%", "10x", "4 million" — a unit only when no letter follows it. */
const NUMBER = /[$€£₺₨]?\d[\d.,]*(?:\s?(?:%|[kKmMbB](?![a-z])|[xX](?![a-z])|\+))?(?:\s(?:million|billion|thousand|percent|hours?|days?|minutes?))?/i;

/** Words into lines of at most `per` words, at most `max` lines. */
function lines(text, per, max) {
  const w = text.split(/\s+/).filter(Boolean);
  const out = [];
  for (let i = 0; i < w.length && out.length < max; i += per) out.push(w.slice(i, i + per).join(' '));
  return out;
}

/** The headline as ASS lines: uppercase, thick outline, the chosen word in the accent. */
function headlineEvents({ text, highlight, x, y, an, size, color, accent, outline, maxWidth, per = 2, maxLines = 4, upper = true, spacing = 0 }) {
  const shown = upper ? text.toLocaleUpperCase() : text;
  const ls = lines(shown, per, maxLines);
  const longest = Math.max(1, ...ls.map(l => l.length));
  /* Bold sans runs about 0.6 of its size per character: shrink to fit the room. */
  const fs = Math.max(18, Math.round(Math.min(size, maxWidth / (longest * 0.6))));
  const hl = String(highlight ?? '').toLocaleUpperCase().replace(/[^\p{L}\p{N}$€£%]/gu, '');
  const body = ls.map(l => l.split(' ').map(word => {
    const bare = word.replace(/[^\p{L}\p{N}$€£%]/gu, '');
    return hl && bare === hl ? `{\\c${assHex(accent)}}${assSafe(word)}{\\c${assHex(color)}}` : assSafe(word);
  }).join(' ')).join('\\N');
  return [`Dialogue: 2,0:00:00.00,0:00:10.00,T,,0,0,0,,{\\an${an}\\pos(${Math.round(x)},${Math.round(y)})\\fs${fs}\\bord${Math.max(2, Math.round(fs * outline))}\\shad${Math.max(2, Math.round(fs / 16))}\\fsp${spacing}\\c${assHex(color)}\\3c&H000000&\\4c&H000000&}${body}`, fs, ls.length];
}

function ellipse(cx, cy, rx, ry) {
  const k = 0.5523, r = n => Math.round(n);
  return `m ${r(cx + rx)} ${r(cy)} b ${r(cx + rx)} ${r(cy + k * ry)} ${r(cx + k * rx)} ${r(cy + ry)} ${r(cx)} ${r(cy + ry)} b ${r(cx - k * rx)} ${r(cy + ry)} ${r(cx - rx)} ${r(cy + k * ry)} ${r(cx - rx)} ${r(cy)} b ${r(cx - rx)} ${r(cy - k * ry)} ${r(cx - k * rx)} ${r(cy - ry)} ${r(cx)} ${r(cy - ry)} b ${r(cx + k * rx)} ${r(cy - ry)} ${r(cx + rx)} ${r(cy - k * ry)} ${r(cx + rx)} ${r(cy)}`;
}

/** An arrow from (x1,y1) to (x2,y2) as one filled shape. */
function arrow(x1, y1, x2, y2, width) {
  const dx = x2 - x1, dy = y2 - y1, len = Math.max(1, Math.hypot(dx, dy));
  const ux = dx / len, uy = dy / len, nx = -uy, ny = ux;
  const head = Math.min(len * 0.45, width * 3.2), hw = width * 1.6, w = width / 2;
  const bx = x2 - ux * head, by = y2 - uy * head;
  const p = [[x1 + nx * w, y1 + ny * w], [bx + nx * w, by + ny * w], [bx + nx * hw, by + ny * hw], [x2, y2], [bx - nx * hw, by - ny * hw], [bx - nx * w, by - ny * w], [x1 - nx * w, y1 - ny * w]];
  return `m ${p.map(([x, y]) => `${Math.round(x)} ${Math.round(y)}`).join(' l ')}`;
}

function assDoc(W, H, events) {
  return ['[Script Info]', 'ScriptType: v4.00+', `PlayResX: ${W}`, `PlayResY: ${H}`, 'WrapStyle: 2', 'ScaledBorderAndShadow: yes', '',
    '[V4+ Styles]',
    'Format: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding',
    'Style: T,Noto Sans,64,&H00FFFFFF,&H00FFFFFF,&H00000000,&H96000000,-1,0,0,0,96,100,0,0,1,4,3,5,0,0,0,1',
    'Style: D,Noto Sans,20,&H00FFFFFF,&H00FFFFFF,&H00000000,&H00000000,0,0,0,0,100,100,0,0,1,0,0,7,0,0,0,1',
    '', '[Events]', 'Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text', ...events, ''].join('\n');
}

/**
 * One trending thumbnail: the picture's filter (crop, grade, panel, border)
 * and its ASS (words, ring, arrow). `face` is the largest face in the frame
 * as fractions, or null — then nothing is ringed, because circling nothing
 * in particular is the clickbait the advice warns against.
 */
function trendLayout(it, W, H, srcW, srcH, face) {
  const portrait = H > W;
  const accent = HEX.test(it.accent) ? it.accent : '#facc15';
  const panel = HEX.test(it.color) ? it.color : '#0b0b12';
  const color = HEX.test(it.textColor) ? it.textColor : '#ffffff';
  const text = assSafe(it.text || 'Watch this').slice(0, 80);
  const zoom = num(it.zoom, 0.5, 0, 1);
  const border = it.border !== false;
  const hexF = h => h.replace('#', '0x');
  const events = [];
  const fx = face ? face.x + face.w / 2 : 0.5, fy = face ? face.y + face.h / 2 : 0.45;
  /** A crop of the source that puts the face at (px, py) of the output, the face `fh` of its height. */
  const aim = (px, py, fh) => {
    let s = face ? (fh * H) / (face.h * srcH) : Math.max(W / srcW, H / srcH);
    s = Math.max(s, W / srcW, H / srcH);
    const cw = Math.min(srcW, W / s), ch = Math.min(srcH, H / s);
    const x = Math.min(srcW - cw, Math.max(0, fx * srcW - px * cw)), y = Math.min(srcH - ch, Math.max(0, fy * srcH - py * ch));
    return `crop=${Math.round(cw)}:${Math.round(ch)}:${Math.round(x)}:${Math.round(y)},scale=${W}:${H},setsar=1`;
  };
  const edge = border ? `,drawbox=x=0:y=0:w=${W}:h=${H}:color=${hexF(accent)}@1:t=${Math.round(Math.min(W, H) * 0.018)}` : '';
  let look = '';
  const layout = it.layout === 'number' && !NUMBER.test(text) ? 'bold' : it.layout;
  if (layout === 'bold' || layout === 'number') {
    const faceLeft = fx <= 0.5;
    if (portrait) {
      look = `${aim(0.5, 0.33, 0.30 + 0.18 * zoom)},eq=contrast=1.12:saturation=1.3,unsharp=5:5:0.5`;
      for (let i = 0; i < 12; i++) look += `,drawbox=x=0:y=${Math.round(H * (0.46 + i * 0.015))}:w=${W}:h=${Math.round(H * 0.015) + 1}:color=${hexF(panel)}@${(0.07 * (i + 1)).toFixed(2)}:t=fill`;
      look += `,drawbox=x=0:y=${Math.round(H * 0.64)}:w=${W}:h=${H - Math.round(H * 0.64)}:color=${hexF(panel)}@0.92:t=fill`;
    } else {
      look = `${aim(faceLeft ? 0.3 : 0.7, 0.46, 0.5 + 0.28 * zoom)},eq=contrast=1.12:saturation=1.3,unsharp=5:5:0.5`;
      const from = faceLeft ? 0.42 : 0.58;
      for (let i = 0; i < 12; i++) {
        const x0 = faceLeft ? from + i * 0.0125 : from - (i + 1) * 0.0125;
        look += `,drawbox=x=${Math.round(W * x0)}:y=0:w=${Math.round(W * 0.0125) + 1}:h=${H}:color=${hexF(panel)}@${(0.07 * (i + 1)).toFixed(2)}:t=fill`;
      }
      look += faceLeft ? `,drawbox=x=${Math.round(W * 0.57)}:y=0:w=${W}:h=${H}:color=${hexF(panel)}@0.92:t=fill` : `,drawbox=x=0:y=0:w=${Math.round(W * 0.43)}:h=${H}:color=${hexF(panel)}@0.92:t=fill`;
    }
    look += edge;
    const areaX = portrait ? W / 2 : faceLeft ? W * 0.785 : W * 0.215;
    const areaW = portrait ? W * 0.88 : W * 0.40;
    const areaY = portrait ? H * 0.8 : H * 0.5;
    if (layout === 'number') {
      const n = (text.match(NUMBER) ?? [''])[0].trim();
      const rest = text.replace(n, '').replace(/\s+/g, ' ').trim();
      const tile = portrait ? [W * 0.12, H * 0.66, W * 0.76, H * 0.16] : [areaX - areaW / 2, H * 0.14, areaW, H * 0.42];
      look += `,drawbox=x=${Math.round(tile[0])}:y=${Math.round(tile[1])}:w=${Math.round(tile[2])}:h=${Math.round(tile[3])}:color=${hexF(accent)}@1:t=fill`;
      const [ev] = headlineEvents({ text: n, highlight: '', x: tile[0] + tile[2] / 2, y: tile[1] + tile[3] / 2, an: 5, size: tile[3] * 0.8, color: '#111111', accent, outline: 0, maxWidth: tile[2] * 0.92, per: 3, maxLines: 1 });
      events.push(ev.replace('\\3c&H000000&', '\\3c&HFFFFFF&').replace(/\\shad\d+/, '\\shad0'));
      if (rest) events.push(headlineEvents({ text: rest, highlight: it.highlight, x: areaX, y: portrait ? H * 0.89 : H * 0.74, an: 5, size: H * (portrait ? 0.05 : 0.1), color, accent, outline: 0.08, maxWidth: areaW, per: 3, maxLines: 2 })[0]);
    } else {
      events.push(headlineEvents({ text, highlight: it.highlight, x: areaX, y: areaY, an: 5, size: H * (portrait ? 0.075 : 0.17), color, accent, outline: 0.09, maxWidth: areaW, per: portrait ? 2 : 2, maxLines: 4 })[0]);
    }
  } else if (layout === 'callout') {
    /* Where the crop puts the face, and how big — the ring is drawn round exactly that. */
    const cf = portrait ? 0.24 + 0.1 * zoom : 0.42 + 0.2 * zoom;
    const [px, py] = portrait ? [0.5, 0.58] : [0.6, 0.5];
    look = `${aim(px, py, face ? cf : 0.4)},eq=contrast=1.1:saturation=1.35,vignette=angle=0.5${edge}`;
    const textLeft = portrait || !face || fx >= 0.42;
    const [ev, fs, n] = headlineEvents({ text, highlight: it.highlight, x: textLeft ? W * 0.05 : W * 0.95, y: H * 0.06, an: textLeft ? 7 : 9, size: H * (portrait ? 0.06 : 0.15), color, accent, outline: 0.09, maxWidth: W * (portrait ? 0.9 : 0.5), per: 2, maxLines: 3 });
    events.push(ev);
    if (face) {
      const cx = W * px, cy = H * py, fh = H * cf, fw = fh * (face.w * srcW) / (face.h * srcH);
      const rx = fw * 0.85, ry = fh * 0.8;
      const ringColor = '#ef4444';
      events.push(`Dialogue: 1,0:00:00.00,0:00:10.00,D,,0,0,0,,{\\an7\\pos(0,0)\\1a&HFF&\\bord${Math.round(Math.min(W, H) * 0.012)}\\3c${assHex(ringColor)}\\shad0\\p1}${ellipse(cx, cy, rx, ry)}{\\p0}`);
      const tx = portrait ? W * 0.3 : textLeft ? W * 0.05 + Math.min(W * 0.4, fs * 3) : W * 0.6, ty = H * 0.06 + fs * n * 1.15 + (portrait ? H * 0.01 : 0);
      const ex = portrait ? cx - rx * 0.35 : cx - rx * 0.92 * (textLeft ? 1 : -0.2), ey = portrait ? cy - ry * 0.95 : cy - ry * 0.55;
      events.push(`Dialogue: 1,0:00:00.00,0:00:10.00,D,,0,0,0,,{\\an7\\pos(0,0)\\c${assHex(ringColor)}\\bord${Math.max(2, Math.round(Math.min(W, H) * 0.005))}\\3c&H000000&\\shad0\\p1}${arrow(tx, ty, ex, ey, Math.min(W, H) * 0.028)}{\\p0}`);
    }
  } else if (layout === 'cinematic') {
    const bar = Math.round(H * (portrait ? 0.06 : 0.1));
    look = `${aim(0.5, 0.42, 0.38)},eq=contrast=1.08:saturation=0.72,lutrgb=r='clip(val*1.02+16*(val-128)/128,0,255)':b='clip(val*0.98-16*(val-128)/128,0,255)',vignette=angle=0.42` +
      `,drawbox=x=0:y=0:w=${W}:h=${bar}:color=black@1:t=fill,drawbox=x=0:y=${H - bar}:w=${W}:h=${bar}:color=black@1:t=fill` +
      `,drawbox=x=${Math.round(W * 0.42)}:y=${Math.round(H * 0.69)}:w=${Math.round(W * 0.16)}:h=${Math.max(3, Math.round(H * 0.006))}:color=${hexF(accent)}@1:t=fill`;
    events.push(headlineEvents({ text, highlight: it.highlight, x: W / 2, y: H * 0.79, an: 5, size: H * (portrait ? 0.045 : 0.085), color, accent, outline: 0.04, maxWidth: W * 0.86, per: 4, maxLines: 2, spacing: Math.round(H * 0.006) })[0]);
  } else if (layout === 'split') {
    /* The second frame arrives as input 1; the graph stacks them. */
    look = 'SPLIT';
    events.push(headlineEvents({ text, highlight: it.highlight, x: W / 2, y: portrait ? H * 0.5 : H * 0.84, an: 5, size: H * (portrait ? 0.06 : 0.12), color, accent, outline: 0.1, maxWidth: W * 0.9, per: 3, maxLines: 2 })[0]);
  }
  return { look, ass: assDoc(W, H, events), split: layout === 'split', accent, border };
}

async function thumbnail(job, dir) {
  const p = job.params;
  const W = even(num(p.width, 1280, 160, 3840)), H = even(num(p.height, 720, 160, 3840));
  const items = (Array.isArray(p.items) ? p.items : []).slice(0, 6);
  if (!items.length) throw new Error('no thumbnail asked for');
  job.stage = 'frame';
  const src = job.inputs.source;
  const cover = `scale=${W}:${H}:force_original_aspect_ratio=increase,crop=${W}:${H}`;
  /* Every moment asked for, once: a cover-sized frame for the classic
     layouts, and the frame at up to 1920 wide for the ones that close in on a
     face, with the faces found in it. */
  const frames = new Map();
  const grab = async at => {
    const key = num(at, num(p.at, 1, 0, 6 * 3600), 0, 6 * 3600).toFixed(2);
    if (frames.has(key)) return frames.get(key);
    const i = frames.size;
    const coverFile = path.join(dir, `frame-${i}.png`), bigFile = path.join(dir, `big-${i}.png`);
    await exec(FFMPEG, [...base, '-ss', key, ...inVideo(src), '-frames:v', '1', '-vf', cover, coverFile], job);
    await exec(FFMPEG, [...base, '-ss', key, ...inVideo(src), '-frames:v', '1', '-vf', 'scale=w=min(1920\\,iw):h=-2', bigFile], job);
    const { stdout } = await exec(FFPROBE, ['-v', 'error', '-print_format', 'json', '-show_streams', bigFile], job);
    const st = JSON.parse(stdout).streams?.[0] ?? {};
    const faces = await facesIn(bigFile, job);
    const f = { cover: coverFile, big: bigFile, w: st.width || W, h: st.height || H, face: faces[0] ?? null };
    frames.set(key, f);
    return f;
  };
  let portrait = '';
  if (job.inputs.portrait) {
    portrait = path.join(dir, 'portrait.png');
    await exec(FFMPEG, [...base, ...inImage(job.inputs.portrait), '-frames:v', '1', '-vf', cover, portrait], job);
  }
  let logo = '';
  if (job.inputs.logo) {
    logo = path.join(dir, 'logo.png');
    await exec(FFMPEG, [...base, ...inImage(job.inputs.logo), '-frames:v', '1', '-vf', `scale=${Math.round(W * 0.13)}:-1`, logo], job);
  }
  const made = [];
  for (const [i, it] of items.entries()) {
    job.stage = `thumbnail ${i + 1} of ${items.length}`;
    job.pct = Math.round((i / items.length) * 100);
    const name = String(it.name ?? `thumb-${i + 1}.png`).replace(/[^a-z0-9._-]/gi, '');
    if (!name.endsWith('.png')) throw new Error('thumbnails are PNG');
    const fr = await grab(it.at);
    const assFile = path.join(dir, `t${i}.ass`);
    const out = path.join(dir, name);
    const inputs = [];
    let graph;
    let face = null;
    if (THUMB_NEW.has(String(it.layout))) {
      face = fr.face;
      const t = trendLayout(it, W, H, fr.w, fr.h, face);
      await fsp.writeFile(assFile, t.ass);
      if (t.split) {
        const fr2 = await grab(it.at2 ?? num(it.at, 1, 0, 6 * 3600) + 6);
        const half = H > W ? `scale=${W}:${H / 2}:force_original_aspect_ratio=increase,crop=${W}:${H / 2}` : `scale=${W / 2}:${H}:force_original_aspect_ratio=increase,crop=${W / 2}:${H}`;
        inputs.push('-i', fr.big, '-i', fr2.big);
        const stack = H > W ? 'vstack' : 'hstack';
        const div = H > W ? `drawbox=x=0:y=${H / 2 - Math.round(H * 0.006)}:w=${W}:h=${Math.round(H * 0.012)}` : `drawbox=x=${W / 2 - Math.round(W * 0.006)}:y=0:w=${Math.round(W * 0.012)}:h=${H}`;
        graph = `[0:v]${half},eq=contrast=1.1:saturation=1.25[a];[1:v]${half},eq=contrast=1.1:saturation=1.25[b];[a][b]${stack},${div}:color=${t.accent.replace('#', '0x')}@1:t=fill` +
          `${t.border ? `,drawbox=x=0:y=0:w=${W}:h=${H}:color=${t.accent.replace('#', '0x')}@1:t=${Math.round(Math.min(W, H) * 0.018)}` : ''},subtitles=filename=${assFile}:fontsdir=${FONTS}`;
      } else {
        inputs.push('-i', fr.big);
        graph = `[0:v]${t.look},subtitles=filename=${assFile}:fontsdir=${FONTS}`;
      }
    } else {
      await fsp.writeFile(assFile, String(it.ass ?? ''));
      inputs.push('-i', it.bg === 'portrait' && portrait ? portrait : fr.cover);
      graph = `[0:v]${layoutFilter(String(it.layout), W, H, String(it.color ?? ''), String(it.accent ?? ''))},subtitles=filename=${assFile}:fontsdir=${FONTS}`;
    }
    const logoAt = inputs.filter(x => x === '-i').length;
    graph = logo ? `${graph}[b];[b][${logoAt}:v]overlay=W-w-${Math.round(W * 0.03)}:${Math.round(H * 0.05)},format=rgb24[o]` : `${graph},format=rgb24[o]`;
    await exec(FFMPEG, [...base, ...inputs, ...(logo ? ['-i', logo] : []), '-filter_complex', graph, '-map', '[o]', '-frames:v', '1', '-c:v', 'png', '-f', 'image2', out], job);
    /* What came out is decoded again before it is called a PNG: right codec,
       right size. The Worker checks the bytes once more after upload. */
    const { stdout } = await exec(FFPROBE, ['-v', 'error', '-print_format', 'json', '-show_streams', out], job);
    const s = JSON.parse(stdout).streams?.[0] ?? {};
    if (s.codec_name !== 'png' || s.width !== W || s.height !== H) throw new Error(`thumbnail ${name} is ${s.codec_name} ${s.width}×${s.height}, not PNG ${W}×${H}`);
    const up = await upload(job, out, name, 'image/png');
    made.push({ ...up, width: W, height: H, layout: it.layout, id: it.id ?? '', face: !!face });
  }
  return { thumbs: made };
}

const OPS = { prepare, render, thumbnail, track, probe: async job => ({ probe: summarise(await probe(job.inputs.source, job)) }) };

fs.mkdirSync(WORK, { recursive: true });
server.listen(PORT, () => console.log(`media engine on :${PORT}${SECRET ? ' (signed)' : OPEN ? ' (open: behind a service binding)' : ' (refusing: no secret)'}`));
