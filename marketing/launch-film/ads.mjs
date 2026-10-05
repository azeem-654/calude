/* Paid-social cut-downs of the v4 launch film, in every Meta placement shape.
   node ads.mjs [cut…]   (run in the film kit directory)

   Each cut is a list of source ranges of the 16:9 master, chosen on whole
   voice lines and on scene changes. Each range is laid out for the shape:
     split  — the film's words (left) stacked above its product window (right)
     fit    — the whole frame, scaled to the width (wide title cards)
     center — the middle 1080 of the frame at full size (centred cards)
   over a blurred, enlarged copy of the frame itself, so the colours are the
   film's own. The audio is not cut from the film: it is re-mixed from the
   same voice files, sound cues and music synthesiser (mix.mjs), so no word
   or note is sliced. */
import fs from 'node:fs';
import { execFileSync } from 'node:child_process';

const FF = 'node_modules/ffmpeg-static/ffmpeg';
const M = 'out/PC_Launch_Film_5min_16x9_v4.mp4';
const OUT = '../ads/out';
const run = (args) => execFileSync(FF, ['-y', '-loglevel', 'error', ...args], { stdio: 'inherit' });
fs.mkdirSync(OUT, { recursive: true });
fs.mkdirSync('../ads/tmp', { recursive: true });
if (!fs.existsSync('../ads/tmp/bg.png')) run(['-ss', '0.02', '-i', 'out/PC_Launch_Film_5min_16x9_v4.mp4', '-frames:v', '1', '../ads/tmp/bg.png']);

const CUTS = {
  /* Scenes cross-fade for 0.45 s (timing.js NT ranges overlap), so a range
     starts just after the fade, a beat before its first word. */
  '15s_autopilot': [[0, 3.0, 'fit'], [6.15, 12.3, 'split'], [325.0, 329.9, 'center']],
  '15s_prospecting': [[88.95, 96.8, 'split'], [320.75, 322.1, 'center'], [325.0, 329.9, 'center']],
  '30s': [[0, 3.0, 'fit'], [3.0, 4.9, 'center'], [6.15, 12.3, 'split'], [88.95, 96.8, 'split'], [320.75, 329.9, 'center']],
  /* The whole film, re-laid for phones — the 16:9 master is the original. */
  'full': [[0, 3.0, 'fit'], [3.0, 6.15, 'center'], [6.15, 320.75, 'split'], [320.75, 331.3, 'center']],
  '60s': [[0, 3.0, 'fit'], [3.0, 4.9, 'center'], [6.15, 20.1, 'split'], [42.1, 50.7, 'split'], [88.95, 108.3, 'split'], [320.75, 329.9, 'center']],
};

/* Shapes. Coordinates are in the 1920×1080 master. The words sit in
   x 40–840; the product window is 960×800 at (860,140) — cropped with 20px of
   its own shadow round it so the rounded corners survive. Every piece is
   feathered into the canvas, which is the film's own first frame (nothing
   but its background gradient), so there is no hard rectangle anywhere. */
const BG = '../ads/tmp/bg.png';
const MASKS = {};
const mask = (w, h, f) => {
  const k = `${w}x${h}_${f}`;
  if (!MASKS[k]) {
    const p = `../ads/tmp/mask_${k}.png`;
    if (!fs.existsSync(p)) run(['-f', 'lavfi', '-i', `color=white:s=${w}x${h}`, '-frames:v', '1', '-vf',
      `format=gray,geq=lum='255*clip(min(min(X/${f}\,(W-1-X)/${f})\,min(Y/${f}\,(H-1-Y)/${f}))\,0\,1)'`, p]);
    MASKS[k] = p;
  }
  return MASKS[k];
};
/* A piece: crop from the master, scale, feather, place. */
const piece = (crop, w, h, f, x, y) => ({ crop, w, h, f, x, y });
const LAYOUT = {
  '9x16': { w: 1080, h: 1920,
    /* Words below the top 14% (269px), where Reels/Stories draw the profile row. */
    split: [piece('780:660:40:200', 976, 826, 40, 52, 250), piece('1000:840:840:120', 1080, 908, 14, 0, 1000)],
    fit: [piece('1920:1080:0:0', 1080, 608, 60, 0, 620)],
    center: [piece('1200:1080:360:0', 1200, 1080, 80, -60, 380)] },
  '4x5': { w: 1080, h: 1350,
    split: [piece('780:600:40:220', 780, 600, 36, 150, 20), piece('1000:840:840:120', 850, 714, 12, 115, 620)],
    fit: [piece('1920:1080:0:0', 1080, 608, 60, 0, 371)],
    center: [piece('1200:1080:360:0', 1200, 1080, 80, -60, 135)] },
  '1x1': { w: 1080, h: 1080,
    split: [piece('780:600:40:220', 624, 480, 30, 228, 10), piece('1000:840:840:120', 700, 588, 10, 190, 480)],
    fit: [piece('1920:1080:0:0', 1080, 608, 60, 0, 236)],
    center: [piece('1200:1080:360:0', 1200, 1080, 80, -60, 0)] },
};
function graph(shape, kind) {
  if (shape === '16x9') return '[0:v]null';
  const L = LAYOUT[shape];
  const ps = L[kind];
  /* The canvas is the frame's own left margin (x 0–100: background only,
     the words start at 110) stretched and blurred — the same gradient the
     pieces carry, moving with the film, so their feathered edges vanish. */
  let g = `[0:v]split=${ps.length + 1}${ps.map((_, i) => `[s${i}]`).join('')}[sb];`;
  if (kind === 'split') g += `[sb]crop=100:1080:0:0,scale=${L.w}:${L.h},boxblur=40:2[bg0];`;
  else {
    /* A card is centred on the whole frame: its top half is continued by the
       frame's own top edge, its bottom half by its bottom edge (the same
       columns the piece is cut from), so the feather meets its own colour. */
    const [cw, , cx] = ps[0].crop.split(':').map(Number);
    const h2 = 2 * Math.round(L.h / 4);
    g += `[sb]split[t0][b0];[t0]crop=${cw}:90:${cx}:0,scale=${L.w}:${h2}[tt];[b0]crop=${cw}:90:${cx}:990,scale=${L.w}:${L.h - h2}[bb];[tt][bb]vstack,boxblur=30:2[bg0];`;
  }
  ps.forEach((p, i) => {
    g += `movie=${mask(p.w, p.h, p.f)},loop=-1:1,setpts=N/30/TB[m${i}];`;
    g += `[s${i}]crop=${p.crop},scale=${p.w}:${p.h},format=rgba[c${i}];[c${i}][m${i}]alphamerge[p${i}];`;
  });
  ps.forEach((p, i) => { g += `[bg${i}][p${i}]overlay=${p.x}:${p.y}:shortest=1[bg${i + 1}];`; });
  return g + `[bg${ps.length}]null`;
}
const SHAPES = { '9x16': 1, '4x5': 1, '1x1': 1, '16x9': 1 };

const sfx = JSON.parse(fs.readFileSync('sfx.json'));
const vo = JSON.parse(fs.readFileSync('vo.json'));
const lines = Object.fromEntries(JSON.parse(fs.readFileSync('lines.json')).map(l => [l[0], l[2]]));
const wavDur = f => { const b = fs.readFileSync(f); return (b.length - 44) / (48000 * 2); };

const srtTime = s => { const ms = Math.round(s * 1000); const h = Math.floor(ms / 3600000), m = Math.floor(ms / 60000) % 60, sec = Math.floor(ms / 1000) % 60; return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(sec).padStart(2, '0')},${String(ms % 1000).padStart(3, '0')}`; };

const want = process.argv.slice(2);
for (const [name, segs] of Object.entries(CUTS)) {
  if (want.length && !want.includes(name)) continue;
  /* ── Audio: the cut's own mix ── */
  const starts = []; let acc = 0;
  const cues = [], voices = [];
  for (const [a, b] of segs) {
    starts.push(acc);
    for (const s of sfx) if (s.t >= a && s.t < b) cues.push({ ...s, t: s.t - a + acc });
    for (const v of vo) {
      const d = v.d ?? wavDur(`vo/${v.id}.wav`);
      if (v.t >= a - 0.05 && v.t + d <= b + 0.15) voices.push({ t: v.t - a + acc, file: `vo/${v.id}.wav`, id: v.id, d });
    }
    acc += b - a;
  }
  const dur = +acc.toFixed(3);
  const end = starts[starts.length - 1];
  const cfg = {
    dur, fadeOut: 0.6,
    sections: [{ a: 0, b: Math.min(2.4, dur), kind: 'intro' }, { a: Math.min(2.4, dur), b: Math.max(end, 2.4), kind: 'full' }, { a: Math.max(end, 2.4), b: dur - 0.6, kind: 'outro' }, { a: dur - 0.6, b: 999, kind: 'none' }],
    risers: [{ a: Math.max(0, end - 1.6), b: end, gain: 0.26 }],
    sfx: cues, vo: voices.map(({ t, file }) => ({ t, file })),
  };
  fs.writeFileSync(`../ads/tmp/mix_${name}.json`, JSON.stringify(cfg));
  execFileSync('node', ['mix.mjs', `../ads/tmp/mix_${name}.json`, `../ads/tmp/${name}.wav`], { stdio: 'inherit' });
  execFileSync('bash', ['loud.sh', `../ads/tmp/${name}.wav`, `../ads/tmp/${name}_norm.wav`], { stdio: 'inherit' });

  /* ── Captions: the voice, as said, for sound-off viewing (upload as SRT) ── */
  const srt = voices.map((v, i) => `${i + 1}\n${srtTime(v.t)} --> ${srtTime(Math.min(dur, v.t + v.d + 0.2))}\n${lines[v.id]}\n`).join('\n');
  fs.writeFileSync(`${OUT}/PC_Ad_${name}.en_US.srt`, srt);

  /* ── Video: every shape ── */
  for (const shape of Object.keys(SHAPES).filter(sh => !(name === 'full' && (sh === '16x9' || sh === '1x1')))) {
    const parts = [];
    segs.forEach(([a, b, kind], i) => {
      const p = `../ads/tmp/${name}_${shape}_${i}.mp4`;
      run(['-ss', String(a), '-to', String(b), '-i', M, '-filter_complex', `${graph(shape, kind)},fps=30,format=yuv420p[v]`, '-map', '[v]', '-an', '-t', (b - a).toFixed(3),
        '-c:v', 'libx264', '-preset', 'slow', '-crf', '15', '-profile:v', 'high', '-r', '30', p]);
      parts.push(p);
    });
    const list = `../ads/tmp/${name}_${shape}.txt`;
    fs.writeFileSync(list, parts.map(p => `file '${p.replace('../ads/tmp/', '')}'`).join('\n'));
    const out = `${OUT}/PC_Ad_${name}_${shape}.mp4`;
    /* Final pass: one continuous encode (no seams at the joins), high bitrate —
       Meta re-encodes everything, so the upload should be the best copy. */
    run(['-f', 'concat', '-safe', '0', '-i', list, '-i', `../ads/tmp/${name}_norm.wav`,
      '-map', '0:v', '-map', '1:a', '-c:v', 'libx264', '-preset', 'slow', '-crf', '17', '-maxrate', '14M', '-bufsize', '28M',
      '-profile:v', 'high', '-pix_fmt', 'yuv420p', '-r', '30', '-g', '60', '-c:a', 'aac', '-b:a', '256k', '-ar', '48000',
      '-shortest', '-movflags', '+faststart', out]);
    console.log('wrote', out);
  }
}
