/**
 * The three industry films — /hvac, /roofing, /medical-billing — made from
 * the same steps, words and pictures as the sites' "See it working" sections.
 *
 *   npx tsx scripts/industry-demos.mts          # the pictures and focus.json first
 *   PIPER_MODEL=/path/en_US-ryan-high.onnx npx tsx marketing/industry-films/make.mts [hvac roofing medical-billing]
 *
 * For each film: every narration line (src/components/Site/industryDemos.ts →
 * `film` and each step's `say`) is spoken by Piper and measured; the scenes are
 * laid end to end on those lengths (the voice sets the clock, as in
 * ../launch-film); film.html draws each frame at 1920×1080, stepped by
 * `seek(t)` in Playwright's Chromium and piped to ffmpeg; the lines are mixed
 * at their start times. Writes public/site/industry/<slug>/demo.mp4,
 * poster.jpg and captions.vtt.
 *
 * Needs `piper` (pip install piper-tts) with the en_US-ryan-high voice, and
 * ffmpeg with libx264. Nothing here is a mock-up: every screen in a film is a
 * picture of the running app; the problem cards are words only.
 */
import pw from '/opt/node22/lib/node_modules/playwright/index.js';
import { execFileSync, spawn } from 'node:child_process';
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { INDUSTRY_DEMOS, type DemoSlug } from '../../src/components/Site/industryDemos.ts';

const ROOT = path.resolve('.');
const MODEL = process.env.PIPER_MODEL ?? '/tmp/claude-0/kit/en_US-ryan-high.onnx';
const WORK = process.env.FILM_WORK ?? '/tmp/industry-films';
const FPS = 30;
const FOCUS_FILE = path.join(ROOT, 'marketing/industry-films/focus.json');
const FOCUS: Record<string, { x: number; y: number; width: number; height: number; pageW: number; pageH: number }> =
  fs.existsSync(FOCUS_FILE) ? JSON.parse(fs.readFileSync(FOCUS_FILE, 'utf8')) : {};
/* STILLS=t1,t2,… draws just those moments to <work>/still-<t>.png, for checking a layout before a whole render. */
const STILLS = (process.env.STILLS ?? '').split(',').filter(Boolean).map(Number);
/* Only demos that have a film's words: one without (e-commerce, for now) shows its steps alone. */
const withFilm = (Object.keys(INDUSTRY_DEMOS) as DemoSlug[]).filter(s => INDUSTRY_DEMOS[s].film);
const asked = process.argv.slice(2) as DemoSlug[];
for (const s of asked) if (!withFilm.includes(s)) { console.log(`${s}: no film words in industryDemos.ts — nothing to make`); process.exit(2); }
const slugs = asked.length ? asked : withFilm;

/* The site's pictures and film.html, served to the browser that draws the frames. */
const server = http.createServer((req, res) => {
  const p = decodeURIComponent(new URL(req.url ?? '/', 'http://x').pathname);
  const file = p.startsWith('/reel/') ? path.join(ROOT, 'public/site', p) : path.join(ROOT, 'marketing/industry-films', path.basename(p));
  if (!fs.existsSync(file)) { res.writeHead(404); res.end(); return; }
  res.writeHead(200, { 'Content-Type': file.endsWith('.webp') ? 'image/webp' : 'text/html; charset=utf-8' });
  fs.createReadStream(file).pipe(res);
});
await new Promise<void>(r => server.listen(8767, '127.0.0.1', () => r()));

const seconds = (wav: string) => Number(execFileSync('ffprobe', ['-v', 'error', '-show_entries', 'format=duration', '-of', 'csv=p=0', wav], { encoding: 'utf8' }).trim());
/** Spoken words → written words, for the captions. */
const written = (s: string) => s
  .replace(/protected central dot com slash H V A C/gi, 'protectedcentral.com/hvac')
  .replace(/protected central dot com slash roofing/gi, 'protectedcentral.com/roofing')
  .replace(/protected central dot com slash medical billing/gi, 'protectedcentral.com/medical-billing')
  .replace(/\bA R\b/g, 'A/R');
const vttTime = (t: number) => {
  const ms = Math.round(t * 1000), h = Math.floor(ms / 3_600_000), m = Math.floor(ms / 60_000) % 60, s = Math.floor(ms / 1000) % 60;
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}.${String(ms % 1000).padStart(3, '0')}`;
};

const browser = await pw.chromium.launch();
for (const slug of slugs) {
  const d = { ...INDUSTRY_DEMOS[slug], film: INDUSTRY_DEMOS[slug].film! };
  const work = path.join(WORK, slug);
  fs.rmSync(work, { recursive: true, force: true });
  fs.mkdirSync(work, { recursive: true });

  /* ── The voice ── */
  const lines: { id: string; text: string }[] = [{ id: 'intro', text: d.film.intro }];
  d.steps.forEach((s, i) => { lines.push({ id: `p${i}`, text: s.say[0] }, { id: `s${i}`, text: s.say[1] }); });
  lines.push({ id: 'outro', text: d.film.outro });
  const len: Record<string, number> = {};
  for (const l of lines) {
    const wav = path.join(work, `${l.id}.wav`);
    execFileSync('piper', ['-m', MODEL, '--length-scale', '0.97', '--noise-scale', '0.7', '--noise-w-scale', '0.85', '--sentence-silence', '0.18', '-f', wav], { input: l.text, stdio: ['pipe', 'ignore', 'ignore'] });
    len[l.id] = seconds(wav);
  }

  /* ── The timeline: each scene as long as its line, plus room to look ── */
  type Scene = Record<string, unknown> & { type: string; t0: number; t1: number };
  const scenes: Scene[] = [];
  const said: { id: string; at: number }[] = [];
  let t = 0;
  const lead = 0.5;
  const firstShot = `/reel/${d.steps[0].shots[0].file}.webp`;
  const title = d.film.title.replace(/^Protected Central( for)? ?/, '');
  scenes.push({ type: 'title', t0: 0, t1: len.intro + lead + 1.4, eyebrow: d.eyebrow === 'See it working' ? 'See it working' : d.eyebrow, html: `Protected Central<br><em>${title || 'medical billing'}</em>`, text: d.lead.replace(/ —$/, '.'), ghost: firstShot });
  said.push({ id: 'intro', at: lead });
  t = scenes[0].t1;
  for (const [i, s] of d.steps.entries()) {
    const ghost = `/reel/${s.shots[0].file}.webp`;
    const p1 = t + len[`p${i}`] + lead + 1.1;
    scenes.push({ type: 'problem', t0: t, t1: p1, n: i + 1, total: d.steps.length, pain: s.pain, problem: s.problem, ghost });
    said.push({ id: `p${i}`, at: t + lead });
    t = p1;
    /* The screens share the answer's line; each gets long enough to arrive at its focus and be read. */
    const total = Math.max(len[`s${i}`] + lead + 1.6, s.shots.length * 7);
    said.push({ id: `s${i}`, at: t + lead });
    s.shots.forEach((sh, k) => {
      const meta = fs.readFileSync(path.join(ROOT, `public/site/reel/${sh.file}.webp`));
      /* WebP VP8 header: width and height from the RIFF chunk. */
      const dims = webpSize(meta);
      const f = FOCUS[sh.file];
      const kpx = dims.w / (f?.pageW ?? 1920);
      scenes.push({
        type: 'screen', t0: t + (total * k) / s.shots.length, t1: t + (total * (k + 1)) / s.shots.length,
        img: `/reel/${sh.file}.webp`, iw: dims.w, ih: dims.h, module: s.module, caption: sh.caption, note: sh.notes?.[0] ?? '',
        focus: f ? { x: f.x * kpx, y: f.y * kpx, w: Math.max(40, f.width * kpx), h: Math.max(30, f.height * kpx) } : null,
      });
    });
    t += total;
  }
  const end = t + len.outro + lead + 2.2;
  scenes.push({ type: 'outro', t0: t, t1: end, last: true, eyebrow: d.film.title, html: slug === 'medical-billing' ? 'Every claim followed<br><em>through to payment.</em>' : 'Every inquiry,<br><em>followed to the payment.</em>', text: written(d.film.outro).split('. ').slice(0, 1)[0] + '.', cta: slug === 'medical-billing' ? 'Book a Medical Billing Assessment' : `Book a ${slug === 'hvac' ? 'HVAC' : 'roofing'} growth consultation`, url: `protectedcentral.com/${slug}`, ghost: firstShot });
  said.push({ id: 'outro', at: t + lead });
  const duration = end;
  const FILM = { tag: slug === 'medical-billing' ? 'Medical billing' : slug === 'hvac' ? 'HVAC' : 'Roofing', sample: slug === 'medical-billing' ? 'Synthetic test data · no real patient information' : 'Sample workspace · example data', duration, scenes };

  /* ── The pictures ── */
  const ctx = await browser.newContext({ viewport: { width: 1920, height: 1080 }, deviceScaleFactor: 1 });
  const page = await ctx.newPage();
  await page.addInitScript((f: unknown) => { (window as unknown as { FILM: unknown }).FILM = f; }, FILM);
  await page.goto('http://127.0.0.1:8767/film.html', { waitUntil: 'networkidle' });
  await page.evaluate(() => (window as unknown as { ready: Promise<unknown> }).ready);
  if (STILLS.length) {
    for (const x of STILLS) {
      await page.evaluate((v: number) => (window as unknown as { seek: (t: number) => void }).seek(v), x);
      await page.screenshot({ path: path.join(work, `still-${x}.png`) });
    }
    console.log(`${slug}: ${duration.toFixed(1)} s; stills in ${work}`);
    await ctx.close();
    continue;
  }
  const silent = path.join(work, 'video.mp4');
  const enc = spawn('ffmpeg', ['-y', '-loglevel', 'error', '-f', 'image2pipe', '-framerate', String(FPS), '-c:v', 'mjpeg', '-i', '-', '-c:v', 'libx264', '-preset', 'medium', '-crf', '23', '-tune', 'stillimage', '-pix_fmt', 'yuv420p', '-r', String(FPS), silent], { stdio: ['pipe', 'inherit', 'inherit'] });
  const frames = Math.ceil(duration * FPS);
  for (let n = 0; n < frames; n++) {
    await page.evaluate((x: number) => (window as unknown as { seek: (t: number) => void }).seek(x), n / FPS);
    const jpg = await page.screenshot({ type: 'jpeg', quality: 90 });
    if (!enc.stdin!.write(jpg)) await new Promise(r => enc.stdin!.once('drain', r));
    if (n % 300 === 0) console.log(`${slug}: frame ${n}/${frames}`);
  }
  enc.stdin!.end();
  await new Promise(r => enc.on('close', r));
  /* The poster: the title card, a second in. */
  await page.evaluate(() => (window as unknown as { seek: (t: number) => void }).seek(1.2));
  const out = path.join(ROOT, 'public/site/industry', slug);
  fs.mkdirSync(out, { recursive: true });
  await page.screenshot({ type: 'jpeg', quality: 82, path: path.join(out, 'poster.jpg') });
  await ctx.close();

  /* ── The sound: each line at its start, levelled ── */
  const inputs = said.flatMap(s => ['-i', path.join(work, `${s.id}.wav`)]);
  const delays = said.map((s, i) => `[${i}:a]adelay=${Math.round(s.at * 1000)}|${Math.round(s.at * 1000)}[a${i}]`).join(';');
  const mix = `${delays};${said.map((_, i) => `[a${i}]`).join('')}amix=inputs=${said.length}:normalize=0,apad=whole_dur=${duration.toFixed(2)},loudnorm=I=-16:TP=-1.5:LRA=11[out]`;
  const audio = path.join(work, 'voice.m4a');
  execFileSync('ffmpeg', ['-y', '-loglevel', 'error', ...inputs, '-filter_complex', mix, '-map', '[out]', '-ar', '44100', '-ac', '2', '-c:a', 'aac', '-b:a', '128k', '-t', duration.toFixed(2), audio]);
  execFileSync('ffmpeg', ['-y', '-loglevel', 'error', '-i', silent, '-i', audio, '-c:v', 'copy', '-c:a', 'copy', '-movflags', '+faststart', '-shortest', path.join(out, 'demo.mp4')]);

  /* ── Captions: the lines as written ── */
  const cues = said.map(s => `${vttTime(s.at)} --> ${vttTime(s.at + len[s.id])}\n${written(lines.find(l => l.id === s.id)!.text)}`);
  fs.writeFileSync(path.join(out, 'captions.vtt'), `WEBVTT\n\n${cues.join('\n\n')}\n`);
  const mb = fs.statSync(path.join(out, 'demo.mp4')).size / 1048576;
  console.log(`${slug}: ${duration.toFixed(1)} s, demo.mp4 ${mb.toFixed(1)} MB`);
  if (mb > 24) { console.log(`${slug}: over Cloudflare's 25 MiB a file — raise -crf`); process.exitCode = 1; }
}
await browser.close();
server.close();

/** Width and height of a WebP (lossy VP8, lossless VP8L or extended VP8X). */
function webpSize(b: Buffer) {
  const kind = b.toString('ascii', 12, 16);
  if (kind === 'VP8X') return { w: 1 + b.readUIntLE(24, 3), h: 1 + b.readUIntLE(27, 3) };
  if (kind === 'VP8L') { const bits = b.readUInt32LE(21); return { w: (bits & 0x3fff) + 1, h: ((bits >> 14) & 0x3fff) + 1 }; }
  return { w: b.readUInt16LE(26) & 0x3fff, h: b.readUInt16LE(28) & 0x3fff };
}
