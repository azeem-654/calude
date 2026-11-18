/**
 * The platform film on the home page (LaunchFilm), cut from the module
 * recordings — so the film and the sections cannot show different apps.
 *
 *   npx tsx scripts/site-clips.mts      # first: the recordings and their masters
 *   npx tsx scripts/site-film.mts       # then: public/site/launch/
 *
 * ── Why it replaced the drawn launch film ──
 *
 * The owner's brief (2026-11-18): the site's film must show the current app.
 * The five-minute launch film (marketing/launch-film) was drawn in October;
 * it showed the light app, the online shop, reputation, revenue by project and
 * AI Shorts — modules the live app now holds back (docs/INCUBATOR.md) — and
 * its kit cannot be re-rendered from the repository. This one is the real app,
 * dark, one module after another, each with its name and one line beside it.
 *
 * ── What it is ──
 *
 * A title card, then every clip in `ORDER` laid out the way the old film was —
 * the words on the left, the product window on the right (16:9), or the words
 * above the window (9:16, for phones) — then an end card. Silent, so the
 * words are in the picture rather than in captions that would say them twice.
 * Recorded against the sample agency, and the frame says so throughout.
 *
 * ── What it writes ──
 *
 * The files LaunchFilm already reads, in the same places: an HLS ladder for
 * each shape (keyframes every 4 s, 4-second segments, so the player can step
 * between rungs at any boundary), one MP4 and one WebM of each (the fallback;
 * the WebM because a browser without H.264 still plays it), and a poster.
 */
import pw from '/opt/node22/lib/node_modules/playwright/index.js';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import { CLIPS, type ClipKey } from '../src/components/Site/clips.ts';

const FF = process.env.FFMPEG || '/usr/bin/ffmpeg';
const OUT = 'public/site/launch';
const MASTER = '/tmp/site-clips-master';
const WORK = '/tmp/site-film-work';
const FPS = 25;

/* AI Autopilot first — it is what the rest is driven by — then the order a
   business meets the modules in: find people, keep them, reach them, book
   them, sell to them, run it for clients. */
const ORDER: ClipKey[] = ['autopilot', 'prospecting', 'contacts', 'websites', 'graphics', 'campaigns', 'booking', 'inbox', 'pipelines', 'engagement', 'agency', 'reports'];
/* No section of the film runs longer than this: a long clip plays faster. */
const MAX_S = 24;

fs.rmSync(WORK, { recursive: true, force: true });
fs.mkdirSync(WORK, { recursive: true });

const src = (id: string) => (fs.existsSync(`${MASTER}/${id}.mp4`) ? `${MASTER}/${id}.mp4` : `public/site/clips/${id}.webm`);
const dur = (f: string) => Number(execFileSync('ffprobe', ['-v', 'error', '-show_entries', 'format=duration', '-of', 'csv=p=0', f]).toString().trim());
for (const k of ORDER) if (!fs.existsSync(src(CLIPS[k].id))) { console.log(`missing recording: ${CLIPS[k].id} — run site-clips.mts first`); process.exit(2); }

/* ── The cards, drawn as pages ─────────────────────────────────────────── */

type Shape = { name: '16x9' | '9x16'; w: number; h: number; win: { x: number; y: number; w: number; h: number } };
const SHAPES: Shape[] = [
  { name: '16x9', w: 1920, h: 1080, win: { x: 620, y: 150, w: 1232, h: 770 } },
  { name: '9x16', w: 1080, h: 1920, win: { x: 40, y: 760, w: 1000, h: 625 } },
];

const css = `
  *{box-sizing:border-box;margin:0}
  body{width:var(--w);height:var(--h);overflow:hidden;font-family:Inter,'Inter Display',sans-serif;color:#f2f5f1;
    background:radial-gradient(60% 50% at 80% 110%,rgba(242,96,31,.35),transparent 70%),radial-gradient(50% 40% at 0% 0%,rgba(124,92,255,.22),transparent 70%),#05070a}
  .win{position:absolute;border-radius:16px;background:#0a0605;box-shadow:0 0 0 1px rgba(255,255,255,.16),0 40px 90px -30px rgba(0,0,0,.9)}
  .eyebrow{font-size:var(--e);font-weight:700;letter-spacing:.14em;text-transform:uppercase;color:#c8f24d}
  h1{font-size:var(--t);line-height:1.04;letter-spacing:-.03em;font-weight:800;margin-top:18px}
  p{font-size:var(--p);line-height:1.45;color:#b9c4b9;margin-top:22px}
  .tag{position:absolute;font-size:var(--s);color:rgba(255,255,255,.62);font-weight:600}
  .brand{display:flex;align-items:center;gap:14px;font-weight:800;font-size:var(--b)}
  .brand i{width:1.3em;height:1.3em;border-radius:.35em;background:linear-gradient(135deg,#c8f24d,#8fd9c4)}
  .center{position:absolute;inset:0;display:flex;flex-direction:column;align-items:center;justify-content:center;text-align:center;padding:0 8%}
  .n{font-size:var(--e);color:rgba(255,255,255,.5);font-weight:700;margin-top:28px}
`;
const esc = (t: string) => t.replace(/&/g, '&amp;').replace(/</g, '&lt;');

function sectionHtml(sh: Shape, k: ClipKey, n: number): string {
  const c = CLIPS[k];
  const tall = sh.name === '9x16';
  const text = tall
    ? `<div style="position:absolute;left:60px;right:60px;top:200px"><div class="eyebrow">${n} of ${ORDER.length}</div><h1>${esc(c.module)}</h1><p>${esc(c.caption)}</p></div>`
    : `<div style="position:absolute;left:80px;width:470px;top:50%;transform:translateY(-50%)"><div class="eyebrow">${n} of ${ORDER.length}</div><h1>${esc(c.module)}</h1><p>${esc(c.caption)}</p></div>`;
  const w = sh.win;
  return `<div class="win" style="left:${w.x - 2}px;top:${w.y - 2}px;width:${w.w + 4}px;height:${w.h + 4}px"></div>${text}
    <div class="tag" style="left:${tall ? 60 : 80}px;bottom:${tall ? 140 : 70}px">Recorded in the app · sample workspace with example data</div>
    <div class="tag" style="right:${tall ? 60 : 68}px;bottom:${tall ? 140 : 70}px">protectedcentral.com</div>`;
}
const titleHtml = () => `<div class="center"><div class="brand"><i></i>Protected Central</div>
  <h1 style="margin-top:34px">Describe the outcome.<br>AI builds the system.</h1>
  <p>The app as it is today, module by module — recorded, not drawn.</p></div>`;
const endHtml = () => `<div class="center"><div class="brand"><i></i>Protected Central</div>
  <h1 style="margin-top:34px">Every module. One login.</h1>
  <p>7 days free · No card required · Nothing sends until you approve it</p><div class="n">protectedcentral.com</div></div>`;

const browser = await pw.chromium.launch();
async function draw(sh: Shape, body: string, file: string) {
  const page = await browser.newPage({ viewport: { width: sh.w, height: sh.h }, deviceScaleFactor: 1 });
  const tall = sh.name === '9x16';
  const vars = tall ? '--e:26px;--t:84px;--p:40px;--s:24px;--b:44px' : '--e:20px;--t:64px;--p:27px;--s:19px;--b:36px';
  await page.setContent(`<!doctype html><html><head><style>${css}</style></head><body style="--w:${sh.w}px;--h:${sh.h}px;${vars}">${body}</body></html>`);
  await page.evaluate(() => document.fonts.ready);
  await page.screenshot({ path: file });
  await page.close();
}

/* ── The sections ──────────────────────────────────────────────────────── */

const x264 = ['-c:v', 'libx264', '-preset', 'medium', '-crf', '16', '-pix_fmt', 'yuv420p', '-r', String(FPS)];
const fades = (d: number) => `fade=t=in:st=0:d=0.4,fade=t=out:st=${(d - 0.45).toFixed(2)}:d=0.45`;

for (const sh of SHAPES) {
  const parts: string[] = [];
  const card = async (name: string, html: string, secs: number) => {
    const png = `${WORK}/${sh.name}-${name}.png`;
    await draw(sh, html, png);
    const out = `${WORK}/${sh.name}-${name}.mp4`;
    execFileSync(FF, ['-y', '-loglevel', 'error', '-loop', '1', '-t', String(secs), '-i', png, '-vf', `${fades(secs)}`, ...x264, out]);
    parts.push(out);
  };
  await card('00-title', titleHtml(), 3.5);
  for (const [i, k] of ORDER.entries()) {
    const png = `${WORK}/${sh.name}-${k}.png`;
    await draw(sh, sectionHtml(sh, k, i + 1), png);
    const clip = src(CLIPS[k].id);
    const d0 = dur(clip);
    const rate = Math.max(1, d0 / MAX_S);
    const d = d0 / rate;
    const w = sh.win;
    const out = `${WORK}/${sh.name}-${String(i + 1).padStart(2, '0')}-${k}.mp4`;
    execFileSync(FF, ['-y', '-loglevel', 'error', '-loop', '1', '-i', png, '-i', clip, '-filter_complex',
      `[1:v]setpts=PTS/${rate.toFixed(4)},scale=${w.w}:${w.h}:flags=lanczos[c];[0:v][c]overlay=${w.x}:${w.y}:shortest=1,${fades(d)}[v]`,
      '-map', '[v]', '-t', d.toFixed(2), ...x264, out]);
    parts.push(out);
  }
  await card('99-end', endHtml(), 4.5);
  fs.writeFileSync(`${WORK}/${sh.name}-list.txt`, parts.map(p => `file '${p}'`).join('\n'));
  const film = `${WORK}/film-${sh.name}.mp4`;
  execFileSync(FF, ['-y', '-loglevel', 'error', '-f', 'concat', '-safe', '0', '-i', `${WORK}/${sh.name}-list.txt`, '-c', 'copy', film]);
  console.log(`${sh.name}: ${dur(film).toFixed(1)} s`);
}
await browser.close();

/* ── For the web ───────────────────────────────────────────────────────── */

const keys = ['-g', String(FPS * 4), '-keyint_min', String(FPS * 4), '-sc_threshold', '0', '-force_key_frames', 'expr:gte(t,n_forced*4)'];
const LADDER: Record<Shape['name'], { n: string; w: number; h: number; crf: number; max: string; codec: string }[]> = {
  '16x9': [
    { n: '1080', w: 1920, h: 1080, crf: 27, max: '1600k', codec: 'avc1.640028' },
    { n: '720', w: 1280, h: 720, crf: 27, max: '900k', codec: 'avc1.64001f' },
    { n: '480', w: 854, h: 480, crf: 28, max: '500k', codec: 'avc1.4d401f' },
  ],
  '9x16': [
    { n: '1920', w: 1080, h: 1920, crf: 27, max: '1600k', codec: 'avc1.640028' },
    { n: '1280', w: 720, h: 1280, crf: 27, max: '900k', codec: 'avc1.64001f' },
    { n: '854', w: 480, h: 854, crf: 28, max: '500k', codec: 'avc1.4d401f' },
  ],
};

for (const sh of SHAPES) {
  const film = `${WORK}/film-${sh.name}.mp4`;
  const dir = `${OUT}/${sh.name === '16x9' ? 'hls' : 'hls-9x16'}`;
  fs.rmSync(dir, { recursive: true, force: true });
  let master = '#EXTM3U\n#EXT-X-VERSION:3\n#EXT-X-INDEPENDENT-SEGMENTS\n';
  for (const r of LADDER[sh.name]) {
    fs.mkdirSync(`${dir}/${r.n}`, { recursive: true });
    execFileSync(FF, ['-y', '-loglevel', 'error', '-i', film, '-vf', `scale=${r.w}:${r.h}:flags=lanczos`, '-c:v', 'libx264', '-preset', 'slow', '-tune', 'animation',
      '-profile:v', r.codec.startsWith('avc1.64') ? 'high' : 'main', '-crf', String(r.crf), '-maxrate', r.max, '-bufsize', `${parseInt(r.max) * 2}k`, '-pix_fmt', 'yuv420p', ...keys, '-an',
      '-f', 'hls', '-hls_time', '4', '-hls_playlist_type', 'vod', '-hls_segment_filename', `${dir}/${r.n}/s%03d.ts`, `${dir}/${r.n}/index.m3u8`]);
    let peak = 0, bytes = 0, secs = 0, d = 0;
    for (const l of fs.readFileSync(`${dir}/${r.n}/index.m3u8`, 'utf8').split('\n')) {
      if (l.startsWith('#EXTINF:')) d = parseFloat(l.slice(8));
      else if (l.endsWith('.ts')) { const b = fs.statSync(`${dir}/${r.n}/${l}`).size; bytes += b; secs += d; peak = Math.max(peak, (b * 8) / d); }
    }
    master += `#EXT-X-STREAM-INF:BANDWIDTH=${Math.ceil(peak)},AVERAGE-BANDWIDTH=${Math.ceil((bytes * 8) / secs)},RESOLUTION=${r.w}x${r.h},FRAME-RATE=${FPS}.000,CODECS="${r.codec}"\n${r.n}/index.m3u8\n`;
  }
  fs.writeFileSync(`${dir}/master.m3u8`, master);
  /* The fallbacks: 720p of each shape, a file each. */
  const [fw, fh] = sh.name === '16x9' ? [1280, 720] : [720, 1280];
  execFileSync(FF, ['-y', '-loglevel', 'error', '-i', film, '-vf', `scale=${fw}:${fh}:flags=lanczos`, '-c:v', 'libx264', '-preset', 'slow', '-tune', 'animation', '-crf', '27', '-pix_fmt', 'yuv420p', '-movflags', '+faststart', '-an', `${OUT}/launch-${sh.name}.mp4`]);
  execFileSync(FF, ['-y', '-loglevel', 'error', '-i', film, '-vf', `scale=${fw}:${fh}:flags=lanczos`, '-c:v', 'libvpx-vp9', '-b:v', '0', '-crf', '38', '-row-mt', '1', '-deadline', 'good', '-cpu-used', '2', '-an', `${OUT}/launch-${sh.name}.webm`]);
  /* The poster: the first section's window, a few seconds in — the product, not the title card. */
  execFileSync(FF, ['-y', '-loglevel', 'error', '-ss', '9', '-i', film, '-frames:v', '1', '-q:v', '3', `${OUT}/poster-${sh.name}.jpg`]);
}
fs.rmSync(`${OUT}/captions.vtt`, { force: true });
const mb = (f: string) => (fs.statSync(f).size / 1048576).toFixed(1);
console.log(`launch-16x9.mp4 ${mb(`${OUT}/launch-16x9.mp4`)} MB · webm ${mb(`${OUT}/launch-16x9.webm`)} MB · launch-9x16.mp4 ${mb(`${OUT}/launch-9x16.mp4`)} MB · webm ${mb(`${OUT}/launch-9x16.webm`)} MB`);
