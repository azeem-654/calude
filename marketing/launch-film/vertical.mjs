/* The launch film for phones: 9:16, the whole film re-laid, for the site.
   node vertical.mjs <ffmpeg> <src.mp4> <outdir> [--still t…]

   The site played the 16:9 film as wide as a phone — a small rectangle in a
   tall screen. The owner asked for a 9:16 version on phones. This lays the
   film out the way ads.mjs lays its `full` cut (the film's own words stacked
   above its product window, title and end cards whole, all over a canvas made
   from the frame's own background), but from the published 16:9 MP4 — whose
   timeline is the v4 master's — and keeps that file's own sound, so nothing is
   re-mixed and the captions still line up. Then it makes the web copies: one
   MP4 and an HLS ladder (hls-9x16/), same 4-second segments as the 16:9 one. */
import fs from 'node:fs';
import { execFileSync } from 'node:child_process';

const [FF, SRC, OUT, flag, ...stills] = process.argv.slice(2);
const TMP = `${OUT}/tmp`;
fs.mkdirSync(TMP, { recursive: true });
const run = (args) => execFileSync(FF, ['-y', '-loglevel', 'error', ...args], { stdio: 'inherit' });

/* Every output is checked before it is called done: square pixels, and the
   shape it was made for. A wrong SAR is invisible in a still taken with
   ffmpeg (it writes the stored pixels) and only shows in a player. */
function assertShape(file, w, h) {
  let info = '';
  try { execFileSync(FF, ['-hide_banner', '-i', file], { stdio: ['ignore', 'ignore', 'pipe'] }); } catch (e) { info = String(e.stderr ?? ''); }
  const m = /Video: [^\n]*?, (\d{2,5})x(\d{2,5})(?: \[SAR (\d+):(\d+) DAR (\d+):(\d+)\])?/.exec(info);
  if (!m) throw new Error(`${file}: could not read its video stream`);
  const sar = m[3] ? `${m[3]}:${m[4]}` : '1:1';
  if (+m[1] !== w || +m[2] !== h || sar !== '1:1') throw new Error(`${file}: ${m[1]}x${m[2]} SAR ${sar} — expected ${w}x${h} with square pixels`);
}

/* Ranges of the master and how each is laid out (ads.mjs `full`). */
const SEGS = [[0, 3.0, 'fit'], [3.0, 6.15, 'center'], [6.15, 320.75, 'split'], [320.75, 331.35, 'center']];
const W = 1080, H = 1920;
const piece = (crop, w, h, f, x, y) => ({ crop, w, h, f, x, y });
/* As ads.mjs 9x16, except the site has no Reels profile row to keep clear of,
   so the words start nearer the top and the window sits a little higher. */
const L = {
  split: [piece('780:660:40:200', 1000, 846, 40, 40, 150), piece('1000:840:840:120', 1080, 908, 14, 0, 960)],
  fit: [piece('1920:1080:0:0', 1080, 608, 60, 0, 656)],
  center: [piece('1200:1080:360:0', 1200, 1080, 80, -60, 420)],
};
const masks = {};
const mask = (w, h, f) => {
  const p = `${TMP}/mask_${w}x${h}_${f}.png`;
  if (!masks[p] && !fs.existsSync(p)) run(['-f', 'lavfi', '-i', `color=white:s=${w}x${h}`, '-frames:v', '1', '-vf',
    `format=gray,geq=lum='255*clip(min(min(X/${f}\\,(W-1-X)/${f})\\,min(Y/${f}\\,(H-1-Y)/${f}))\\,0\\,1)'`, p]);
  masks[p] = 1;
  return p;
};
function graph(kind) {
  const ps = L[kind];
  let g = `[0:v]split=${ps.length + 1}${ps.map((_, i) => `[s${i}]`).join('')}[sb];`;
  if (kind === 'split') g += `[sb]crop=100:1080:0:0,scale=${W}:${H},boxblur=40:2[bg0];`;
  else {
    const [cw, , cx] = ps[0].crop.split(':').map(Number);
    const h2 = 2 * Math.round(H / 4);
    g += `[sb]split[t0][b0];[t0]crop=${cw}:90:${cx}:0,scale=${W}:${h2}[tt];[b0]crop=${cw}:90:${cx}:990,scale=${W}:${H - h2}[bb];[tt][bb]vstack,boxblur=30:2[bg0];`;
  }
  ps.forEach((p, i) => {
    g += `movie=${mask(p.w, p.h, p.f)},loop=-1:1,setpts=N/30/TB[m${i}];`;
    g += `[s${i}]crop=${p.crop},scale=${p.w}:${p.h}:flags=lanczos,format=rgba[c${i}];[c${i}][m${i}]alphamerge[p${i}];`;
  });
  ps.forEach((p, i) => { g += `[bg${i}][p${i}]overlay=${p.x}:${p.y}:shortest=1[bg${i + 1}];`; });
  /* setsar=1: the canvas is a narrow strip scaled up, and `scale` keeps the
     strip's display shape by writing a sample aspect ratio (512:27 in 9:16).
     The overlay inherits it, so every player that honours SAR — phones, Meta —
     drew each frame stretched nineteen times wide. The pixels were right;
     only the flag lied. */
  return g + `[bg${ps.length}]setsar=1`;
}
const kindAt = t => SEGS.find(([a, b]) => t >= a && t < b)?.[2] ?? 'center';

if (flag === '--still') {
  for (const t of stills.map(Number)) {
    run(['-ss', String(t), '-i', SRC, '-filter_complex', `${graph(kindAt(t))},format=yuv420p[v]`, '-map', '[v]', '-frames:v', '1', `${OUT}/still_${t}.jpg`]);
    console.log('still', t);
  }
  process.exit(0);
}

/* Each range at near-lossless quality, then one continuous encode with the
   source's sound. `--web` skips straight to the web copies from the master
   already in tmp/ (they set square pixels themselves). */
const master = `${TMP}/vertical.mp4`;
if (flag !== '--web') {
const parts = SEGS.map(([a, b, kind], i) => {
  const p = `${TMP}/part${i}.mp4`;
  run(['-ss', String(a), '-to', String(b), '-i', SRC, '-filter_complex', `${graph(kind)},fps=30,format=yuv420p[v]`, '-map', '[v]', '-an', '-t', (b - a).toFixed(3),
    '-c:v', 'libx264', '-preset', 'medium', '-crf', '12', '-r', '30', p]);
  console.log('part', i, kind);
  return p;
});
fs.writeFileSync(`${TMP}/list.txt`, parts.map(p => `file '${p.split('/').pop()}'`).join('\n'));
run(['-f', 'concat', '-safe', '0', '-i', `${TMP}/list.txt`, '-i', SRC, '-map', '0:v', '-map', '1:a', '-c:v', 'libx264', '-preset', 'medium', '-crf', '14',
  '-pix_fmt', 'yuv420p', '-r', '30', '-c:a', 'copy', '-shortest', master]);
assertShape(master, W, H);
}

/* The web copies. One MP4 for a browser without HLS; the ladder for the rest. */
const GOP = ['-g', '120', '-keyint_min', '120', '-sc_threshold', '0'];
/* 720×1280: a Worker serves no file over 25 MiB, and this one is only for a
   browser that can play neither HLS nor MSE — the ladder is the real film. */
run(['-i', master, '-vf', 'scale=720:1280:flags=lanczos,setsar=1', '-c:v', 'libx264', '-preset', 'slow', '-profile:v', 'high', '-b:v', '440k', '-maxrate', '800k', '-bufsize', '1600k', ...GOP,
  '-pix_fmt', 'yuv420p', '-c:a', 'aac', '-b:a', '64k', '-movflags', '+faststart', `${OUT}/launch-9x16.mp4`]);
run(['-ss', '10', '-i', master, '-frames:v', '1', '-q:v', '3', `${OUT}/poster-9x16.jpg`]);
assertShape(`${OUT}/launch-9x16.mp4`, 720, 1280);
const RUNGS = [[1920, 1080, '1400k', '2400k'], [1280, 720, '800k', '1300k'], [854, 480, '420k', '700k']];
for (const [h, w, br, mx] of RUNGS) {
  const d = `${OUT}/hls-9x16/${h}`;
  fs.mkdirSync(d, { recursive: true });
  run(['-i', master, '-vf', `scale=${w}:${h}:flags=lanczos,setsar=1`, '-c:v', 'libx264', '-preset', 'slow', '-profile:v', h > 1000 ? 'high' : 'main', '-b:v', br, '-maxrate', mx, '-bufsize', mx.replace('k', '') * 2 + 'k', ...GOP,
    '-pix_fmt', 'yuv420p', '-c:a', 'aac', '-b:a', h > 1000 ? '96k' : '64k', '-ar', '48000',
    '-f', 'hls', '-hls_time', '4', '-hls_playlist_type', 'vod', '-hls_segment_filename', `${d}/s%03d.ts`, `${d}/index.m3u8`]);
  console.log('rung', h);
}
fs.writeFileSync(`${OUT}/hls-9x16/master.m3u8`, ['#EXTM3U', '#EXT-X-VERSION:3', '#EXT-X-INDEPENDENT-SEGMENTS',
  ...RUNGS.flatMap(([h, w, br, mx]) => [`#EXT-X-STREAM-INF:BANDWIDTH=${parseInt(mx) * 1000 + 100000},AVERAGE-BANDWIDTH=${parseInt(br) * 1000 + 80000},RESOLUTION=${w}x${h},FRAME-RATE=30.000,CODECS="${h > 1000 ? 'avc1.640028' : 'avc1.4d401f'},mp4a.40.2"`, `${h}/index.m3u8`]),
].join('\n') + '\n');
console.log('done');
