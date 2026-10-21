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
 *   GET    /health        → {ok, ffmpeg, busy, features: {track, youtube}}
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
import { TREND_LAYOUTS, thumbPlan, rgbOf, CONDENSE, HALO } from './thumbLayout.mjs';

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
  if (url.pathname === '/health') return send(res, 200, { ok: true, ffmpeg: await ffmpegVersion(), busy: running + queue.length, features: { track: await canTrack(), youtube: !!(await canFetch()), rnnoise: hasRnn() } });
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

/**
 * The source, once, onto this engine's own disk — when it fits. Preparing a
 * video reads it five times over (probe, sound, proxy, poster, filmstrip) and
 * FFmpeg seeks, dropping connections half-way through each. It is fetched in
 * 16 MB ranges, each retried on its own, so a connection lost at 180 MB costs
 * one piece rather than the whole file — and no single response through the
 * Worker is large. A file the disk cannot hold twice over is streamed as before.
 */
const PIECE = 16 * 1024 * 1024;
async function localCopy(src, bytes, dir, job) {
  if (!(bytes > 0)) return src;
  try {
    const st = await fsp.statfs(dir);
    if (st.bavail * st.bsize < bytes * 2 + 512 * 1024 * 1024) return src;
  } catch { return src; }
  const file = path.join(dir, 'source.bin');
  job.stage = 'download'; job.pct = 0;
  const fh = await fsp.open(file, 'w');
  try {
    for (let at = 0; at < bytes; at += PIECE) {
      if (job.cancelled) throw new Error('cancelled');
      const end = Math.min(bytes, at + PIECE) - 1;
      const buf = await retry(async () => {
        const r = await fetch(src, { headers: { Range: `bytes=${at}-${end}` } });
        if (r.status === 200 && at === 0) return r; // a server without ranges sends the whole file
        if (r.status !== 206) throw new Error(`could not read the source (${r.status})`);
        const b = Buffer.from(await r.arrayBuffer());
        if (b.length !== end - at + 1) throw new Error(`a piece of the source arrived as ${b.length} of ${end - at + 1} bytes`);
        return b;
      });
      if (!Buffer.isBuffer(buf)) {
        let got = 0;
        for await (const chunk of buf.body) {
          if (job.cancelled) throw new Error('cancelled');
          await fh.write(chunk, 0, chunk.length, got);
          got += chunk.length;
          job.pct = Math.min(99, Math.round((got / bytes) * 100));
        }
        if (got !== bytes) throw new Error(`the source arrived as ${got} of ${bytes} bytes`);
        break;
      }
      await fh.write(buf, 0, buf.length, at);
      job.pct = Math.min(99, Math.round(((end + 1) / bytes) * 100));
    }
  } finally { await fh.close(); }
  return file;
}

async function prepare(job, dir) {
  const p = job.params;
  job.stage = 'probe';
  const remote = job.inputs.source;
  const info = summarise(await probe(remote, job));
  const limits = { maxDuration: num(p.maxDuration, 3 * 3600, 2, 6 * 3600), maxSide: num(p.maxSide, 4096, 320, 8192), maxBytes: num(p.maxBytes, 10e9, 1e6, 50e9) };
  if (!info.hasVideo) throw new Error('refused: the file has no video stream');
  if (!VIDEO_CODECS.has(info.vcodec)) throw new Error(`refused: video codec ${info.vcodec || 'unknown'} is not supported`);
  if (info.hasAudio && !AUDIO_CODECS.has(info.acodec)) throw new Error(`refused: audio codec ${info.acodec} is not supported`);
  if (!(info.duration >= 2)) throw new Error('refused: the video is shorter than two seconds');
  if (info.duration > limits.maxDuration) throw new Error(`refused: the video is ${Math.round(info.duration / 60)} minutes, over the ${Math.round(limits.maxDuration / 60)}-minute limit`);
  if (!(info.width > 0 && info.height > 0) || Math.max(info.width, info.height) > limits.maxSide) throw new Error(`refused: ${info.width}×${info.height} is outside the supported size`);
  if (info.bytes > limits.maxBytes) throw new Error('refused: the file is larger than allowed');
  /* Refused files are refused before a byte of them is copied. */
  const src = await localCopy(remote, info.bytes, dir, job);

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

/* ── The voice ────────────────────────────────────────────────────────────── */

/* RNNoise (arnndn) is a small neural network trained on speech in noise; it
   takes out far more than an FFT denoiser before the voice starts to sound
   thin. Its model file is pinned in the image (Dockerfile); without it the
   FFT denoiser is used and /health says so. */
const RNN_MODEL = process.env.RNNOISE_MODEL || path.join(path.dirname(new URL(import.meta.url).pathname), 'rnnoise.rnnn');
const hasRnn = () => /^[\w./-]+$/.test(RNN_MODEL) && fs.existsSync(RNN_MODEL);

/**
 * The speech chain. Studio Sound, when on, is a studio's order of work: a
 * high-pass for rumble and handling noise; the strongest denoiser there is;
 * a de-esser; a little less mud (250 Hz) and a little more presence
 * (3.5 kHz); a gentle compressor so quiet words come up — strength (0–100)
 * scales each. Loudness (−16 LUFS, two passes) is applied after the mix.
 * Without it, the older noise levels and "voice clarity" as before. Nothing
 * here can rebuild a voice that clipped or dropped out — the screen says so.
 */
function voiceChain(audio) {
  if (audio.studio) {
    const k = num(audio.strength, 60, 0, 100) / 100;
    return [
      'highpass=f=80:poles=2',
      hasRnn() ? `arnndn=m=${RNN_MODEL}:mix=${(0.5 + 0.5 * k).toFixed(2)}` : `afftdn=nr=${(10 + 16 * k).toFixed(1)}:nf=-40:tn=1`,
      `deesser=i=${(0.25 + 0.3 * k).toFixed(2)}`,
      `equalizer=f=250:t=q:w=1.1:g=${(-1 - 2 * k).toFixed(1)}`,
      `equalizer=f=3500:t=q:w=1.4:g=${(1 + 2.5 * k).toFixed(1)}`,
      `acompressor=threshold=${(0.14 - 0.06 * k).toFixed(3)}:ratio=${(2 + 2 * k).toFixed(1)}:attack=6:release=120:knee=3:makeup=${(1.2 + 0.6 * k).toFixed(2)}`,
    ];
  }
  /* Natural first: each level removes more steady noise (fans, hum, hiss) and
     the strongest also takes off the top end where hiss lives. */
  const DENOISE = { light: 'afftdn=nr=10:nf=-42', medium: 'afftdn=nr=18:nf=-38:tn=1', strong: 'afftdn=nr=26:nf=-34:tn=1,lowpass=f=11000' };
  const voice = ['highpass=f=70'];
  if (DENOISE[audio.denoise]) voice.push(DENOISE[audio.denoise]);
  if (audio.voice) voice.push('equalizer=f=3200:t=q:w=1.2:g=2.5', 'deesser=i=0.35', 'acompressor=threshold=0.08:ratio=3:attack=8:release=120:makeup=1.5');
  return voice;
}

/** Pass one of loudness normalisation: the edited sound, measured by loudnorm itself. Null when it cannot be read. */
async function measureLoudness(job, dir, src, s0, end, musicIn, soundGraph, outTotal) {
  const file = path.join(dir, 'measure.txt');
  await fsp.writeFile(file, soundGraph);
  try {
    const { stderr } = await exec(FFMPEG, ['-hide_banner', '-nostdin', '-y', '-loglevel', 'info', '-ss', String(s0), '-t', String(end - s0 + 0.05), ...inVideo(src), ...musicIn,
      '-filter_complex_script', file, '-map', '[a]', '-t', outTotal.toFixed(3), '-f', 'null', '-progress', 'pipe:1', '-nostats', '-'], job, { onLine: progressTo(job, 'loudness', outTotal) });
    const m = stderr.match(/\{[^{}]*"input_i"[^{}]*\}/g);
    if (!m) return null;
    const j = JSON.parse(m[m.length - 1]);
    const n = v => { const x = Number(v); return Number.isFinite(x) ? Math.round(x * 100) / 100 : null; };
    const r = { i: n(j.input_i), lra: n(j.input_lra), tp: n(j.input_tp), thresh: n(j.input_thresh), offset: n(j.target_offset) };
    /* Silence measures as −inf; there is nothing to normalise then. */
    return Object.values(r).every(v => v !== null) && r.i > -70 ? r : null;
  } catch { return null; }
}

/* ── Visual effects and Shorts layouts: numbers in, filters the engine owns out ── */

const hexOr = (v, d) => (HEX.test(String(v)) ? String(v).replace('#', '0x').toLowerCase() : d);

/** Only the effects switched on, each value clamped; anything else is ignored. */
function cleanEffects(e) {
  const o = e && typeof e === 'object' ? e : {};
  const on = k => (o[k] && typeof o[k] === 'object' && o[k].on === true ? o[k] : null);
  const c = on('color'), sh = on('shadow'), g = on('green'), a = on('appearance');
  const key = g ? hexOr(g.color, '0x00ff00') : '';
  return {
    color: c ? { exposure: num(c.exposure, 0, -100, 100), contrast: num(c.contrast, 0, -100, 100), highlights: num(c.highlights, 0, -100, 100), shadows: num(c.shadows, 0, -100, 100), saturation: num(c.saturation, 0, -100, 100), kelvin: num(c.kelvin, 6500, 2000, 12000) } : null,
    shadow: sh ? { x: num(sh.x, 0, -80, 80), y: num(sh.y, 18, -80, 80), blur: num(sh.blur, 30, 0, 80), color: hexOr(sh.color, '0x000000'), opacity: num(sh.opacity, 55, 0, 100) / 100 } : null,
    /* A blue screen is despilled as blue: the key's blue above its green. */
    green: g ? { color: key, similarity: num(g.similarity, 18, 1, 60) / 100, blend: num(g.blend, 6, 0, 40) / 100, bg: hexOr(g.bg, '0x101828'), blue: parseInt(key.slice(6, 8), 16) > parseInt(key.slice(4, 6), 16) } : null,
    appearance: a ? { amount: num(a.amount, 50, 0, 100) / 100 } : null,
  };
}

/** The colour of light at a temperature (Tanner Helland's fit), 0–1 per channel. */
function kelvinRgb(k) {
  const t = k / 100;
  const r = t <= 66 ? 255 : 329.698727446 * Math.pow(t - 60, -0.1332047592);
  const g = t <= 66 ? 99.4708025861 * Math.log(t) - 161.1195681661 : 288.1221695283 * Math.pow(t - 60, -0.0755148492);
  const b = t >= 66 ? 255 : t <= 19 ? 0 : 138.5177312231 * Math.log(t - 10) - 305.0447927307;
  return [r, g, b].map(v => Math.min(255, Math.max(0, v)) / 255);
}

/**
 * Colour adjustments: one lookup for exposure and the light's temperature
 * (relative to 6500 K, lower warmer, as FFmpeg's colortemperature means it —
 * a per-pixel table is several times faster at 1080×1920), a curve for
 * highlights and shadows, and eq for contrast and saturation.
 */
function colorFilters(c) {
  if (!c) return [];
  const f = [];
  const ev = Math.pow(2, c.exposure / 50);
  const [kr, kg, kb] = kelvinRgb(c.kelvin), [nr, ng, nb] = kelvinRgb(6500);
  let gr = kr / nr, gg = kg / ng, gb = kb / nb;
  const lum = 0.2126 * gr + 0.7152 * gg + 0.0722 * gb;
  gr = (gr / lum) * ev; gg = (gg / lum) * ev; gb = (gb / lum) * ev;
  if (Math.abs(gr - 1) > 0.002 || Math.abs(gg - 1) > 0.002 || Math.abs(gb - 1) > 0.002) f.push(`lutrgb=r='clip(val*${gr.toFixed(4)},0,255)':g='clip(val*${gg.toFixed(4)},0,255)':b='clip(val*${gb.toFixed(4)},0,255)'`);
  if (c.highlights || c.shadows) {
    const lo = Math.min(0.45, Math.max(0.05, 0.25 + (c.shadows / 100) * 0.12)), hi = Math.min(0.95, Math.max(0.55, 0.75 + (c.highlights / 100) * 0.12));
    f.push(`curves=all='0/0 0.25/${lo.toFixed(3)} 0.75/${hi.toFixed(3)} 1/1'`);
  }
  const con = 1 + c.contrast / 150, sat = Math.max(0, 1 + c.saturation / 100);
  if (con !== 1 || sat !== 1) f.push(`eq=contrast=${con.toFixed(3)}:saturation=${sat.toFixed(3)}`);
  return f;
}

/** Improve appearance, the whole picture: mild denoise, gentle auto levels (white balance and exposure), a light sharpen. */
function appearanceFilters(a) {
  if (!a) return [];
  const k = a.amount;
  return [
    `hqdn3d=${(1 + 2 * k).toFixed(2)}:${(1 + 1.5 * k).toFixed(2)}:${(2 + 4 * k).toFixed(2)}:${(2 + 3 * k).toFixed(2)}`,
    `normalize=blackpt=black:whitept=white:smoothing=60:independence=0.35:strength=${(0.1 + 0.3 * k).toFixed(2)}`,
    `unsharp=5:5:${(0.25 + 0.45 * k).toFixed(2)}:5:5:0`,
  ];
}

/**
 * Skin smoothing inside the face box only: the box cut out, an
 * edge-preserving blur (bilateral — skin evens out, eyes and edges stay),
 * a soft oval edge so no line shows, put back where it was. The box keeps its
 * size (a crop that changes size stalls FFmpeg); only where it sits moves,
 * through sendcmd, ten times a second, as a crop that follows a face does.
 */
function skinFilter(sk, a, srcW, srcH, total, cmds) {
  if (!a || !sk || typeof sk !== 'object') return '';
  const bw = even(num(sk.w, 0, 0, srcW)), bh = even(num(sk.h, 0, 0, srcH));
  if (bw < 24 || bh < 24 || bw > srcW || bh > srcH) return '';
  const pth = (Array.isArray(sk.path) ? sk.path : []).slice(0, 40000)
    .map(r => [num(r[0], 0, 0, 1e6), num(r[1], 0.5, 0, 1), num(r[2], 0.45, 0, 1), r[3] ? 1 : 0]).sort((x, y) => x[0] - y[0]);
  if (!pth.length) return '';
  const at = (cx, cy) => [Math.round(Math.min(srcW - bw, Math.max(0, cx * srcW - bw / 2)) / 2) * 2, Math.round(Math.min(srcH - bh, Math.max(0, cy * srcH - bh / 2)) / 2) * 2];
  const [x0, y0] = at(pth[0][1], pth[0][2]);
  let last = [x0, y0];
  for (let i = 0; i < pth.length; i++) {
    const [t, cx, cy] = pth[i];
    const next = pth[i + 1];
    const stop = next ? next[0] : total;
    for (let u = t; u < stop - 1e-6; u += 0.1) {
      const k = next && !next[3] ? (u - t) / Math.max(1e-6, next[0] - t) : 0;
      const [px, py] = at(cx + (next && !next[3] ? (next[1] - cx) * k : 0), cy + (next && !next[3] ? (next[2] - cy) * k : 0));
      if (px !== last[0] || py !== last[1]) { cmds.push([u, `crop@skin x ${px}, crop@skin y ${py}, overlay@skin x ${px}, overlay@skin y ${py}`]); last = [px, py]; }
    }
  }
  const k = a.amount;
  return `split[sk0][sk1];[sk1]crop@skin=${bw}:${bh}:${x0}:${y0},bilateral=sigmaS=${(3 + 7 * k).toFixed(1)}:sigmaR=${(0.05 + 0.07 * k).toFixed(3)},format=yuva420p,` +
    `geq=lum='lum(X,Y)':cb='cb(X,Y)':cr='cr(X,Y)':a='255*clip((1-hypot(2*X/W-1,2*Y/H-1))*3,0,1)'[sk2];[sk0][sk2]overlay@skin=${x0}:${y0},format=yuv420p,`;
}

/** A shadow under a picture of w×h placed at (x, y) of the output (round for a bubble): one blurred frame, made once and repeated. */
function shadowUnder(tag, sh, w, h, x, y, W, fps, round = false) {
  const k = W / 1080, b = Math.max(1, Math.round(sh.blur * k)), pad = b * 2;
  const ox = Math.round(x - pad + sh.x * k), oy = Math.round(y - pad + sh.y * k);
  const shape = round ? `geq=r='r(X,Y)':g='g(X,Y)':b='b(X,Y)':a='255*${sh.opacity.toFixed(2)}*lte(hypot(X-W/2,Y-H/2),W/2)'` : `colorchannelmixer=aa=${sh.opacity.toFixed(2)}`;
  return `color=c=${sh.color}:s=${w}x${h}:r=${fps}:d=0.1,format=rgba,${shape},pad=${w + 2 * pad}:${h + 2 * pad}:${pad}:${pad}:color=black@0,` +
    `gblur=sigma=${(b / 2).toFixed(1)},trim=end_frame=1,loop=loop=-1:size=1:start=0,setpts=N/${fps}/TB[${tag}s];[${tag}bg][${tag}s]overlay=x=${ox}:y=${oy}:shortest=1[${tag}bs]`;
}

/** The whole picture inside the frame on a blurred, darkened copy of itself — with a shadow under it when asked. */
function fitFrame(tag, W, H, srcW, srcH, sh, fps, label = '') {
  const k = Math.min(W / srcW, H / srcH), fw = even(srcW * k), fh = even(srcH * k);
  const x = Math.round((W - fw) / 2), y = Math.round((H - fh) / 2);
  const bg = `split[${tag}1][${tag}2];[${tag}1]scale=${W}:${H}:force_original_aspect_ratio=increase,crop=${W}:${H},boxblur=24:2,eq=brightness=-0.08[${tag}bg];[${tag}2]scale=${fw}:${fh},setsar=1[${tag}fg];`;
  return sh
    ? `${bg}${shadowUnder(tag, sh, fw, fh, x, y, W, fps)};[${tag}bs][${tag}fg]overlay=${x}:${y}${label}`
    : `${bg}[${tag}bg][${tag}fg]overlay=${x}:${y}${label}`;
}

/** A layout's boxes, clamped to the recording; null when there is nothing sound to build. */
function cleanLayout(l, srcW, srcH, W, H) {
  if (!l || typeof l !== 'object' || !['split', 'two', 'pip'].includes(l.kind)) return null;
  const boxes = (Array.isArray(l.boxes) ? l.boxes : []).slice(0, 2).map(b => {
    const w = even(num(b?.[2], 0, 0, srcW)), h = even(num(b?.[3], 0, 0, srcH));
    return [Math.round(num(b?.[0], 0, 0, Math.max(0, srcW - w))), Math.round(num(b?.[1], 0, 0, Math.max(0, srcH - h))), Math.min(w, srcW - (srcW % 2)), Math.min(h, srcH - (srcH % 2))];
  });
  if (boxes.length !== (l.kind === 'pip' ? 1 : 2) || boxes.some(b => b[2] < 16 || b[3] < 16)) return null;
  const size = even(num(l.inset?.size, W * 0.38, 64, Math.min(W, H)));
  const inset = l.kind === 'pip' ? { x: Math.round(num(l.inset?.x, W - size - 40, 0, W - size)), y: Math.round(num(l.inset?.y, H * 0.62, 0, H - size)), size } : null;
  return { kind: l.kind, boxes, inset };
}

/**
 * The Shorts layouts, built from boxes:
 *   split  the screen whole in the top half, the camera's crop in the bottom
 *   two    one person's crop on top, the other's below
 *   pip    the screen whole, the camera in a round bubble (with the shadow, if on)
 */
function layoutFrame(l, W, H, srcW, srcH, sh, fps) {
  const H2 = even(H / 2);
  const crop = (b, w, h) => `crop=${b[2]}:${b[3]}:${b[0]}:${b[1]},scale=${w}:${h},setsar=1`;
  if (l.kind === 'split') return `split[l1][l2];[l1]${fitFrame('lt', W, H2, srcW, srcH, null, fps, '[lt]')};[l2]${crop(l.boxes[1], W, H - H2)}[lb];[lt][lb]vstack`;
  if (l.kind === 'two') return `split[l1][l2];[l1]${crop(l.boxes[0], W, H2)}[lt];[l2]${crop(l.boxes[1], W, H - H2)}[lb];[lt][lb]vstack`;
  const { x, y, size } = l.inset;
  const edge = (size / 2 / 3).toFixed(1);
  const round = `format=yuva420p,geq=lum='lum(X,Y)':cb='cb(X,Y)':cr='cr(X,Y)':a='255*clip((1-hypot(2*X/W-1,2*Y/H-1))*${edge},0,1)'`;
  const main = fitFrame('pm', W, H, srcW, srcH, null, fps, '[pmain]');
  const base = sh ? `[pmain]null[pibg];${shadowUnder('pi', sh, size, size, x, y, W, fps, true)};[pibs]` : '[pmain]';
  return `split[l1][l2];[l1]${main};[l2]${crop(l.boxes[0], size, size)},${round}[pin];${base}[pin]overlay=${x}:${y}`;
}

/** Green screen: a real chroma key on the colour chosen, the spill taken off the edges, a colour behind. */
function greenFilter(g, W, H, fps) {
  if (!g) return '';
  return `,chromakey=color=${g.color}:similarity=${g.similarity.toFixed(3)}:blend=${g.blend.toFixed(3)},despill=type=${g.blue ? 'blue' : 'green'}:mix=0.6,format=yuva420p[gk];` +
    `color=c=${g.bg}:s=${W}x${H}:r=${fps}[gb];[gb][gk]overlay=0:0:shortest=1`;
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
  const after = [...look, ...colorFilters(fx.color), ...appearanceFilters(fx.appearance)];
  const graph = [`[0:v]setpts=PTS-STARTPTS,fps=${fps},select='${sel}',setpts=N/${fps}/TB,${send}${skin}${frame}${greenFilter(fx.green, W, H, fps)}${zoom}${after.length ? `,${after.join(',')}` : ''}${trans}${pace}${subs}${fades}${bar},format=yuv420p[v]`];
  const hasAudio = p.hasAudio !== false;
  const audio = p.audio ?? {};
  const voice = voiceChain(audio);
  const gain = num(audio.volume, 1, 0.3, 2);
  if (gain !== 1) voice.push(`volume=${gain}`);
  if (speed !== 1) voice.push(`atempo=${speed}`);
  const stereo = 'aformat=sample_fmts=fltp:sample_rates=48000:channel_layouts=stereo';
  const afades = `${fadeIn ? `,afade=t=in:st=0:d=${fadeIn}` : ''}${fadeOut ? `,afade=t=out:st=${Math.max(0, outTotal - fadeOut).toFixed(3)}:d=${fadeOut}` : ''}`;
  /* Studio Sound always ends at −16 LUFS; otherwise it is the customer's "even loudness" box. */
  const levelled = audio.loudnorm !== false || !!audio.studio;
  const music = p.music && job.inputs.music ? p.music : null;
  const sound = [];
  if (hasAudio) {
    sound.push(`[0:a]asetpts=PTS-STARTPTS,aresample=48000,asetnsamples=n=${48000 / fps}:p=0,aselect='${sel}',asetpts=N/SR/TB,${voice.join(',')},${stereo}[sp]`);
  }
  /* `@LEVEL@` is where the loudness filter goes: measuring it first (pass one)
     and then applying exactly what was measured (pass two). */
  if (music) {
    /* The track under the voice: its own volume, faded in and out, cut to the
       video's length; "lower audio of other layers" ducks it under speech so
       the words stay clear — a sidechain on the voice itself. */
    const mv = num(music.volume, 0.18, 0, 1), fi = num(music.fadeIn, 1.5, 0, 10), fo = num(music.fadeOut, 2.5, 0, 15);
    sound.push(`[1:a]aresample=48000,${stereo},volume=${mv},atrim=0:${outTotal.toFixed(3)},asetpts=PTS-STARTPTS` +
      `${fi > 0 ? `,afade=t=in:st=0:d=${fi}` : ''}${fo > 0 ? `,afade=t=out:st=${Math.max(0, outTotal - fo).toFixed(3)}:d=${fo}` : ''}[m]`);
    if (hasAudio && music.duck !== false) {
      sound.push('[sp]asplit=2[sp1][sp2]', '[m][sp2]sidechaincompress=threshold=0.025:ratio=8:attack=20:release=400:knee=4[md]', '[sp1][md]amix=inputs=2:duration=first:normalize=0@LEVEL@[a]');
    } else if (hasAudio) {
      sound.push('[sp][m]amix=inputs=2:duration=first:normalize=0@LEVEL@[a]');
    } else {
      sound.push('[m]anull@LEVEL@[a]');
    }
  } else if (hasAudio) {
    sound.push('[sp]anull@LEVEL@[a]');
  }
  const withAudio = hasAudio || !!music;
  const musicIn = music ? [...(music.loop !== false ? ['-stream_loop', '-1'] : []), '-protocol_whitelist', PROTOCOLS, '-format_whitelist', AUDIO_FORMATS, '-i', job.inputs.music] : [];
  const LN = 'loudnorm=I=-16:LRA=11:TP=-1.5';
  let level = '';
  if (withAudio && levelled) {
    /* Two passes, as EBU R128 normalisation should be done: the whole edited
       sound is measured first, then corrected linearly by exactly that — one
       pass guesses as it goes and pumps on speech that starts quietly. If the
       measurement cannot be read, the one-pass filter is used instead. */
    const measured = await measureLoudness(job, dir, src, s0, end, musicIn, sound.join(';').replace(/@LEVEL@/g, `,${LN}:print_format=json`), outTotal);
    level = measured
      ? `,${LN}:measured_I=${measured.i}:measured_LRA=${measured.lra}:measured_TP=${measured.tp}:measured_thresh=${measured.thresh}:offset=${measured.offset}:linear=true,aresample=48000`
      : `,${LN},aresample=48000`;
  }
  graph.push(...sound.map(g => g.replace(/@LEVEL@/g, `${level}${afades}`)));
  await fsp.writeFile(path.join(dir, 'graph.txt'), graph.join(';'));
  const out = path.join(dir, 'out.mp4');
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

/* ── The trending layouts: a plan (thumbLayout.mjs) painted with FFmpeg and libass ── */

/*
 * thumbLayout.mjs decides the geometry — the crop that puts the face where it
 * goes, the gradient panels, the spotlight, every line of words with its size
 * and place, the ring, the arrow, the sticker. The designer's preview draws
 * the very same plan in the browser. Here it becomes:
 *   - an FFmpeg graph built only from the plan's numbers (crop, grade, blur,
 *     gradient fills as geq expressions of numbers, the spotlight's ellipse,
 *     letterbox, edge) — never from request text;
 *   - an ASS file for everything drawn on top (words, boxes, ring,
 *     arrow, tile, sticker, strip), where the customer's words are escaped
 *     text and nothing else.
 */
const assHex = (hex, alpha = 0) => { const h = HEX.test(hex) ? hex.slice(1) : 'ffffff'; return `&H${alpha.toString(16).padStart(2, '0')}${h.slice(4, 6)}${h.slice(2, 4)}${h.slice(0, 2)}`.toUpperCase(); };
const assSafe = t => String(t ?? '').replace(/[{}]/g, m => (m === '{' ? '(' : ')')).replace(/\\/g, '/').replace(/[\r\n]+/g, ' ').trim();
/** Like assSafe, but keeps the space a run starts with (a word after the first on its line). */
const assRun = t => String(t ?? '').replace(/[{}]/g, m => (m === '{' ? '(' : ')')).replace(/\\/g, '/').replace(/[\r\n]+/g, ' ');
const n0 = v => Math.round(Number(v) || 0);

function ellipse(cx, cy, rx, ry) {
  const k = 0.5523, r = n => Math.round(n);
  return `m ${r(cx + rx)} ${r(cy)} b ${r(cx + rx)} ${r(cy + k * ry)} ${r(cx + k * rx)} ${r(cy + ry)} ${r(cx)} ${r(cy + ry)} b ${r(cx - k * rx)} ${r(cy + ry)} ${r(cx - rx)} ${r(cy + k * ry)} ${r(cx - rx)} ${r(cy)} b ${r(cx - rx)} ${r(cy - k * ry)} ${r(cx - k * rx)} ${r(cy - ry)} ${r(cx)} ${r(cy - ry)} b ${r(cx + k * rx)} ${r(cy - ry)} ${r(cx + rx)} ${r(cy - k * ry)} ${r(cx + rx)} ${r(cy)}`;
}
const poly = pts => `m ${pts.map(([x, y]) => `${n0(x)} ${n0(y)}`).join(' l ')}`;
const rect = b => poly([[b.x, b.y], [b.x + b.w, b.y], [b.x + b.w, b.y + b.h], [b.x, b.y + b.h]]);
const shape = (layer, tags, drawing) => `Dialogue: ${layer},0:00:00.00,0:00:10.00,D,,0,0,0,,{\\an7\\pos(0,0)${tags}\\p1}${drawing}{\\p0}`;

function assDoc(W, H, events) {
  return ['[Script Info]', 'ScriptType: v4.00+', `PlayResX: ${W}`, `PlayResY: ${H}`, 'WrapStyle: 2', 'ScaledBorderAndShadow: yes', '',
    '[V4+ Styles]',
    'Format: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding',
    `Style: T,Noto Sans,64,&H00FFFFFF,&H00FFFFFF,&H00000000,&H96000000,-1,0,0,0,${CONDENSE},100,0,0,1,4,3,5,0,0,0,1`,
    /* BorderStyle 3: an opaque box fitted to the line — the highlighted word's box. */
    `Style: B,Noto Sans,64,&H00111111,&H00FFFFFF,&H0015CCFA,&H80000000,-1,0,0,0,${CONDENSE},100,0,0,3,8,4,5,0,0,0,1`,
    'Style: D,Noto Sans,20,&H00FFFFFF,&H00FFFFFF,&H00000000,&H00000000,0,0,0,0,100,100,0,0,1,0,0,7,0,0,0,1',
    '', '[Events]', 'Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text', ...events, ''].join('\n');
}

/** The plan's overlays and words, as ASS. */
function planAss(plan) {
  const { W, H } = plan;
  const ev = [];
  if (plan.rule) ev.push(shape(1, `\\1c${assHex(plan.rule.color)}\\bord0\\shad0`, rect(plan.rule)));
  if (plan.tile) ev.push(shape(1, `\\1c${assHex(plan.tile.color)}\\bord0\\shad${Math.round(plan.tile.h * 0.05)}\\4c&H000000&\\4a&H60&`, rect(plan.tile)));
  if (plan.split?.vs) {
    const v = plan.split.vs;
    ev.push(shape(3, `\\1c${assHex(v.color)}\\3c&HFFFFFF&\\bord${Math.round(v.r * 0.1)}\\shad${Math.round(v.r * 0.08)}\\4c&H000000&\\4a&H50&`, ellipse(v.cx, v.cy, v.r, v.r)));
    ev.push(`Dialogue: 4,0:00:00.00,0:00:10.00,T,,0,0,0,,{\\an5\\pos(${n0(v.cx)},${n0(v.cy)})\\fs${Math.round(v.r * 1.05)}\\bord0\\shad0\\c${assHex(v.ink)}}VS`);
  }
  if (plan.badge) {
    const b = plan.badge;
    ev.push(shape(5, `\\1c${assHex(b.color)}\\1a&H38&\\bord0\\shad0`, rect(b)));
    ev.push(shape(5, `\\1c${assHex(b.bar)}\\bord0\\shad0`, rect({ x: b.x, y: b.y, w: Math.max(4, Math.round(b.h * 0.14)), h: b.h })));
    ev.push(`Dialogue: 6,0:00:00.00,0:00:10.00,T,,0,0,0,,{\\an4\\pos(${n0(b.x + b.h * 0.42)},${n0(b.y + b.h / 2)})\\fs${Math.round(b.h * 0.56)}\\fscx100\\bord0\\shad0\\c${assHex(b.ink)}\\fsp${Math.round(b.h * 0.04)}}${assSafe(b.text.toLocaleUpperCase())}`);
  }
  for (const l of plan.lines) {
    const an = l.align === 'left' ? 4 : l.align === 'right' ? 6 : 5;
    const body = l.runs.map(r => `{\\c${assHex(r.color)}}${assRun(r.t)}`).join('');
    const font = l.font !== 'Noto Sans' ? `\\fn${l.font}` : '';
    const at = `\\an${an}\\pos(${n0(l.x)},${n0(l.y)})\\fs${l.fs}${font}\\fsp${n0(l.spacing)}`;
    if (l.box) {
      ev.push(`Dialogue: 8,0:00:00.00,0:00:10.00,B,,0,0,0,,{${at}\\frz${-l.box.tilt}\\3c${assHex(l.box.color)}\\bord${l.box.pad}\\shad${l.shadow}\\4c&H000000&\\4a&H40&}${body}`);
      continue;
    }
    /* A soft dark halo first, so the words read on anything; then the words, outlined and dropped. */
    if (l.glow) ev.push(`Dialogue: 6,0:00:00.00,0:00:10.00,T,,0,0,0,,{${at}\\1a&HFF&\\3c&H000000&\\3a&H60&\\bord${l.glow}\\blur${Math.round(l.glow * 0.8)}\\shad0}${body}`);
    ev.push(`Dialogue: 7,0:00:00.00,0:00:10.00,T,,0,0,0,,{${at}\\3c&H000000&\\bord${l.stroke}\\shad${l.shadow}\\4c&H000000&\\4a&H30&}${body}`);
  }
  if (plan.ring) {
    const r = plan.ring;
    ev.push(shape(9, `\\1a&HFF&\\3c${assHex(r.color)}\\bord${r.t}\\shad0`, ellipse(r.cx, r.cy, r.rx, r.ry)));
  }
  if (plan.arrow) ev.push(shape(9, `\\1c${assHex(plan.arrow.color)}\\3c&H000000&\\bord${Math.max(2, Math.round(Math.min(W, H) * 0.005))}\\shad${Math.max(2, Math.round(Math.min(W, H) * 0.006))}\\4c&H000000&\\4a&H60&`, poly(plan.arrow.pts)));
  if (plan.sticker) {
    const s = plan.sticker;
    ev.push(shape(10, `\\1c${assHex(s.disc)}\\3c&HFFFFFF&\\bord${Math.max(2, Math.round(s.r * 0.1))}\\shad${Math.round(s.r * 0.1)}\\4c&H000000&\\4a&H50&`, ellipse(s.cx, s.cy, s.r, s.r)));
    if (s.mark) ev.push(shape(11, '\\1c&HFFFFFF&\\bord0\\shad0', poly(s.mark)));
    if (s.glyph) ev.push(`Dialogue: 11,0:00:00.00,0:00:10.00,T,,0,0,0,,{\\an5\\pos(${n0(s.cx)},${n0(s.cy + s.r * 0.04)})\\fs${Math.round(s.r * 1.35)}\\fscx100\\bord0\\shad0\\c&HFFFFFF&}${s.glyph}`);
  }
  return assDoc(W, H, ev);
}

/** A colour fill over the whole picture as a geq source: a two-colour gradient, with its alpha ramp. Numbers only. */
function fillSource(f, W, H) {
  const [r0, g0, b0] = rgbOf(f.c0solid), [r1, g1, b1] = rgbOf(f.c1solid);
  /* Colour runs along the CSS angle (180° = top to bottom, 135° = top-left to bottom-right). */
  const th = ((Number(f.angle) || 180) * Math.PI) / 180;
  const sx = Math.sin(th), sy = -Math.cos(th), norm = Math.abs(sx) + Math.abs(sy) || 1;
  const t = `clip(((X/${W}-0.5)*${sx.toFixed(4)}+(Y/${H}-0.5)*${sy.toFixed(4)})/${(norm / 2).toFixed(4)}*0.5+0.5,0,1)`;
  const ch = (a, b) => `${a}+(${b - a})*${t}`;
  const a = f.alpha ?? { axis: 'full', max: 1 };
  const max = Math.max(0, Math.min(1, Number(a.max) || 0));
  const ramp = a.axis === 'x' || a.axis === 'y'
    ? `clip(((${a.axis === 'x' ? 'X' : 'Y'})/${a.axis === 'x' ? W : H}-${Number(a.from).toFixed(4)})/(${(Number(a.to) - Number(a.from)).toFixed(4)}),0,1)`
    : '1';
  return `color=c=black:s=${W}x${H}:d=1,format=rgba,geq=r='${ch(r0, r1)}':g='${ch(g0, g1)}':b='${ch(b0, b1)}':a='${(255 * max).toFixed(1)}*${ramp}'`;
}

/** The picture under the overlays: crop, grade, blur, fills, spotlight, vignette, letterbox, edge. Numbers only. */
function planGraph(plan, frameA, frameB) {
  const { W, H } = plan;
  const g = plan.grade;
  const crop = c => `crop=${n0(c.w)}:${n0(c.h)}:${n0(c.x)}:${n0(c.y)},scale=${W}:${H},setsar=1`;
  const grade = (blur = 0) => `eq=contrast=${g.contrast}:saturation=${g.saturation}:brightness=${g.brightness}` +
    (g.sharpen && !blur ? ',unsharp=5:5:0.5' : '') + (blur ? `,gblur=sigma=${blur}` : '') +
    (g.cinematic ? ",lutrgb=r='clip(val*1.02+16*(val-128)/128,0,255)':b='clip(val*0.98-16*(val-128)/128,0,255)'" : '');
  const parts = [];
  let cur;
  if (plan.split) {
    const hw = plan.split.vertical ? W : W / 2, hh = plan.split.vertical ? H / 2 : H;
    const half = c => `crop=${n0(c.w)}:${n0(c.h)}:${n0(c.x)}:${n0(c.y)},scale=${hw}:${hh},setsar=1`;
    parts.push(`[${frameA}]${half(plan.crop)},eq=contrast=1.1:saturation=1.25[sa]`, `[${frameB}]${half(plan.crop2)},eq=contrast=1.1:saturation=1.25[sb]`);
    const d = plan.split.divider;
    const div = plan.split.vertical ? `drawbox=x=0:y=${H / 2 - Math.round(d.t / 2)}:w=${W}:h=${d.t}` : `drawbox=x=${W / 2 - Math.round(d.t / 2)}:y=0:w=${d.t}:h=${H}`;
    parts.push(`[sa][sb]${plan.split.vertical ? 'vstack' : 'hstack'},${div}:color=${d.color.replace('#', '0x')}@1:t=fill[p0]`);
    cur = 'p0';
  } else {
    if (plan.spot) parts.push(`[${frameA}]split=2[base][sharp]`);
    parts.push(`[${plan.spot ? 'base' : frameA}]${crop(plan.crop)},${grade(g.blur)}[p0]`);
    cur = 'p0';
  }
  plan.fills.forEach((f, i) => {
    parts.push(`${fillSource(f, W, H)}[f${i}]`, `[${cur}][f${i}]overlay=format=auto[q${i}]`);
    cur = `q${i}`;
  });
  if (plan.halo) {
    /* The accent glowing behind the subject: a soft ellipse a little wider than the spotlight, which then covers its middle. */
    const h = plan.halo;
    const [hr, hg, hb] = rgbOf(h.color);
    const dist = `hypot((X-${h.cx.toFixed(1)})/${h.rx.toFixed(1)},(Y-${h.cy.toFixed(1)})/${h.ry.toFixed(1)})`;
    parts.push(`color=c=black:s=${W}x${H}:d=1,format=rgba,geq=r='${hr}':g='${hg}':b='${hb}':a='${HALO.max}*clip((${HALO.outer}-${dist})/${HALO.soft},0,1)*clip((${dist}-${HALO.inner})/${HALO.rise},0,1)'[halo]`, `[${cur}][halo]overlay=format=auto[h1]`);
    cur = 'h1';
  }
  if (plan.spot) {
    const s = plan.spot;
    /* The subject sharp and bright over the blurred background, its edge feathered into it. */
    const fe = Math.max(0.05, Math.min(0.8, Number(s.feather) || 0.35));
    const dist = `hypot((X-${s.cx.toFixed(1)})/${s.rx.toFixed(1)},(Y-${s.cy.toFixed(1)})/${s.ry.toFixed(1)})`;
    parts.push(`[sharp]${crop(plan.crop)},eq=contrast=1.12:saturation=1.3,unsharp=5:5:0.6,format=rgba,geq=r='r(X,Y)':g='g(X,Y)':b='b(X,Y)':a='255*clip((1-${dist})/${fe.toFixed(3)},0,1)'[spot]`);
    parts.push(`[${cur}][spot]overlay=format=auto[s1]`);
    cur = 's1';
  }
  const tail = [];
  if (plan.vignette) tail.push('vignette=angle=0.5');
  if (plan.bars) tail.push(`drawbox=x=0:y=0:w=${W}:h=${plan.bars}:color=black@1:t=fill`, `drawbox=x=0:y=${H - plan.bars}:w=${W}:h=${plan.bars}:color=black@1:t=fill`);
  if (plan.edge) tail.push(`drawbox=x=0:y=0:w=${W}:h=${H}:color=${plan.edge.color.replace('#', '0x')}@1:t=${plan.edge.t}`);
  return { parts, out: cur, tail: tail.join(',') };
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
    let drawn = String(it.layout);
    if (TREND_LAYOUTS.includes(String(it.layout))) {
      face = fr.face;
      /* The second moment (split) is read first: each half is framed on its own face. */
      const fr2 = it.layout === 'split' ? await grab(it.at2 ?? num(it.at, 1, 0, 6 * 3600) + 6) : null;
      const plan = thumbPlan(it, W, H, { w: fr.w, h: fr.h }, face, fr2?.face ?? null);
      drawn = plan.layout;
      await fsp.writeFile(assFile, planAss(plan));
      inputs.push('-i', fr.big);
      if (plan.split) inputs.push('-i', fr2.big);
      const g = planGraph(plan, '0:v', '1:v');
      graph = `${g.parts.join(';')};[${g.out}]${g.tail ? `${g.tail},` : ''}subtitles=filename=${assFile}:fontsdir=${FONTS}`;
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
    made.push({ ...up, width: W, height: H, layout: drawn, id: it.id ?? '', face: !!face });
  }
  return { thumbs: made };
}

/* ── fetch_url: the customer's own YouTube video, as if they had uploaded it ── */

/**
 * yt-dlp, run as tightly as it allows: no configuration files, no plugins,
 * no remote components, no --exec, one video and never a playlist. The
 * engine is handed a video id, never the customer's text: the URL is built
 * here from an id that must be eleven of [A-Za-z0-9_-], and a `url` param,
 * if one is sent, must be on youtube.com or youtu.be and is reduced to its id
 * the same way. Nothing from the request ever becomes an argument.
 *
 * Two runs: the video's details first (duration, live, size), so a video that
 * is too long for the plan is refused before a byte of it is fetched; then
 * the best version up to 1080 lines in a container FFmpeg reads (MP4, else
 * Matroska), uploaded through the signed link exactly like a render.
 *
 * yt-dlp's own failure is passed back word for word (`ytdlp: …`) and read by
 * the Worker (lib/video/youtube.ts youtubeRefusal), which knows which of them
 * no retry can change — private, age-restricted, "not a bot" — so that
 * judgement lives in one tested place.
 */
const YTDLP = process.env.YTDLP || 'yt-dlp';
const YT_HOSTS = new Set(['youtube.com', 'www.youtube.com', 'm.youtube.com', 'music.youtube.com', 'youtu.be', 'www.youtu.be']);
let ytdlpCache = null;
async function canFetch() {
  if (ytdlpCache !== null) return ytdlpCache;
  try { ytdlpCache = (await exec(YTDLP, ['--version'], null)).stdout.trim().slice(0, 40) || false; } catch { ytdlpCache = false; }
  return ytdlpCache;
}

function youtubeId(p) {
  const id = String(p.videoId ?? '');
  if (/^[A-Za-z0-9_-]{11}$/.test(id)) return id;
  if (p.url) {
    let u;
    try { u = new URL(String(p.url)); } catch { return ''; }
    if (u.protocol !== 'https:' || !YT_HOSTS.has(u.hostname.toLowerCase())) return '';
    const seg = u.pathname.split('/').filter(Boolean);
    const got = u.hostname.toLowerCase().endsWith('youtu.be') ? seg[0] : seg[0] === 'watch' ? u.searchParams.get('v') : ['shorts', 'live', 'embed'].includes(seg[0]) ? seg[1] : '';
    return /^[A-Za-z0-9_-]{11}$/.test(String(got ?? '')) ? String(got) : '';
  }
  return '';
}

async function fetchUrl(job, dir) {
  const p = job.params;
  const id = youtubeId(p);
  if (!id) throw new Error('refused: youtube:not_youtube');
  if (!(await canFetch())) throw new Error('refused: youtube:not_installed');
  const url = `https://www.youtube.com/watch?v=${id}`;
  const maxDuration = num(p.maxDuration, 3 * 3600, 2, 6 * 3600);
  const allowance = num(p.allowanceSeconds, maxDuration, 0, 6 * 3600);
  const maxBytes = Math.round(num(p.maxBytes, 8e9, 1e6, 12e9));
  const common = ['--ignore-config', '--no-plugin-dirs', '--no-remote-components', '--js-runtimes', 'node', '--no-playlist', '--no-cache-dir', '--no-exec',
    '--socket-timeout', '30', '--retries', '3', '--no-colors', '--ffmpeg-location', FFMPEG];
  const ytFail = e => new Error(`ytdlp: ${String(e?.message ?? e).replace(/^[^:]*exited \d+:\s*/, '').slice(-500)}`);

  job.stage = 'details'; job.pct = null;
  let info;
  try {
    const { stdout } = await exec(YTDLP, [...common, '--skip-download', '--dump-single-json', '--', url], job);
    info = JSON.parse(stdout);
  } catch (e) { if (job.cancelled) throw e; throw ytFail(e); }
  const duration = Number(info?.duration) || 0;
  if (info?.is_live || info?.live_status === 'is_live' || info?.live_status === 'is_upcoming') throw new Error('refused: youtube:live');
  if (duration > maxDuration) throw new Error(`refused: youtube:too_long:${Math.round(duration)}:${Math.round(maxDuration)}`);
  if (duration > allowance) throw new Error(`refused: youtube:over_allowance:${Math.round(duration)}:${Math.round(allowance)}`);
  const approx = Number(info?.filesize_approx || info?.filesize) || 0;
  if (approx > maxBytes) throw new Error('refused: youtube:too_big');

  job.stage = 'download'; job.pct = 0;
  const outTpl = path.join(dir, 'yt', 'source.%(ext)s');
  try {
    await exec(YTDLP, [...common,
      '-f', 'bv*[height<=1080]+ba/b[height<=1080]', '-S', 'res:1080,vcodec:h264,acodec:aac', '--merge-output-format', 'mp4/mkv',
      '--max-filesize', String(maxBytes), '--no-mtime', '--newline', '--progress-template', 'download:pc %(progress.downloaded_bytes)s %(progress.total_bytes)s %(progress.total_bytes_estimate)s',
      '-o', outTpl, '--', url], job, {
      onLine: line => {
        const m = line.match(/^pc (\d+) (\S+) (\S+)/);
        if (!m) return;
        const total = Number(m[2]) || Number(m[3]) || 0;
        if (total > 0) job.pct = Math.min(99, Math.round((Number(m[1]) / total) * 100));
      },
    });
  } catch (e) { if (job.cancelled) throw e; throw ytFail(e); }
  const made = (await fsp.readdir(path.join(dir, 'yt')).catch(() => [])).filter(f => /^source\.(mp4|mkv|webm)$/.test(f));
  if (!made.length) throw new Error('refused: youtube:empty');
  const file = path.join(dir, 'yt', made[0]);
  /* What arrived is probed like an upload before it is handed on: a picture,
     and a container the prepare step will accept. */
  job.stage = 'probe';
  const got = summarise(await probe(file, job));
  if (!got.hasVideo) throw new Error('refused: youtube:no_video');
  const ext = made[0].split('.').pop();
  const type = ext === 'mp4' ? 'video/mp4' : ext === 'webm' ? 'video/webm' : 'video/x-matroska';
  job.stage = 'upload'; job.pct = null;
  const up = await upload(job, file, `original.${ext}`, type);
  return {
    file: { ...up, type },
    info: { id, title: String(info?.title ?? '').slice(0, 200), channel: String(info?.channel ?? info?.uploader ?? '').slice(0, 120), duration },
    probe: got,
  };
}

const OPS = { prepare, render, thumbnail, track, fetch_url: fetchUrl, probe: async job => ({ probe: summarise(await probe(job.inputs.source, job)) }) };

fs.mkdirSync(WORK, { recursive: true });
server.listen(PORT, () => console.log(`media engine on :${PORT}${SECRET ? ' (signed)' : OPEN ? ' (open: behind a service binding)' : ' (refusing: no secret)'}`));
