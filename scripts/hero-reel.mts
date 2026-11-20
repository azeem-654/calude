/**
 * The home page hero's reel: every module working, fast-forwarded, one after
 * another (owner, 2026-11-20: "the first section of our website shows a quick
 * preview and working in fast forwarding of each of our module").
 *
 *   npx tsx scripts/hero-reel.mts
 *
 * Cut from the module recordings of scripts/site-clips.mts (the near-lossless
 * masters in /tmp/site-clips-master), so the hero cannot show anything the
 * module sections do not: the same sample agency, the same real app, nothing
 * the live app holds back. Each module gives a ~30-second stretch played at
 * 5× with its name and a "5× speed" badge on the picture, so it reads as a
 * fast-forward and not as an app quicker than it is (the same rule as
 * h.fast() in the clips).
 *
 * Writes public/site/clips/hero-reel.{webm,mp4} and hero-reel-poster.webp
 * (HERO_REEL in clips.ts). Re-run after re-recording any clip.
 */
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import pw from '/opt/node22/lib/node_modules/playwright/index.js';

const MASTER = '/tmp/site-clips-master';
const OUT = 'public/site/clips';
const FF = process.env.FFMPEG || '/usr/bin/ffmpeg';
const SPEED = 5;
const W = 1120, H = 700;

/** [master, module name, second the stretch starts, seconds of source] */
const PARTS: [string, string, number, number][] = [
  ['clip-autopilot', 'AI Autopilot', 4, 30],
  ['clip-prospecting', 'AI Prospecting', 1, 30],
  ['clip-contacts', 'Contacts', 6, 30],
  ['clip-pipelines', 'Pipelines', 18, 30],
  ['clip-campaigns', 'Email campaigns', 3, 30],
  ['film-ai-blog', 'Blog & SEO', 5, 30],
  ['clip-websites', 'Websites & funnels', 8, 30],
  ['clip-graphics', 'Graphics Designer', 11, 30],
  ['clip-engagement', 'Forms, tickets & AI chat', 19, 30],
  ['clip-inbox', 'Inbox', 1, 30],
  ['clip-booking', 'Booking pages', 5, 30],
  ['clip-agency', 'Agency & white-label', 3, 30],
  ['clip-reports', 'Reports', 1, 29],
];

const dur = (f: string) => Number(execFileSync('ffprobe', ['-v', 'error', '-show_entries', 'format=duration', '-of', 'csv=p=0', f]).toString());

async function labels(): Promise<string[]> {
  const browser = await pw.chromium.launch();
  const page = await browser.newPage({ viewport: { width: W, height: H } });
  const files: string[] = [];
  for (const [id, name] of PARTS) {
    await page.setContent(`<style>body{margin:0;background:transparent;font-family:Inter,system-ui,sans-serif}
      .p{position:absolute;right:16px;top:60px;display:flex;align-items:center;gap:10px;padding:8px 14px 8px 10px;border-radius:12px;
        background:rgba(14,11,10,.86);border:1px solid rgba(255,154,92,.45);box-shadow:0 6px 24px rgba(0,0,0,.45)}
      .p i{width:6px;height:24px;border-radius:4px;background:linear-gradient(180deg,#ffb37a,#ff6a2b);box-shadow:0 0 12px rgba(255,122,61,.7)}
      .p b{color:#fff;font-size:21px;font-weight:800;letter-spacing:-.01em}
      .p span{margin-left:4px;padding:3px 8px;border-radius:8px;background:rgba(255,122,61,.18);color:#ffb37a;font-size:13px;font-weight:800;letter-spacing:.04em}</style>
      <div class="p"><i></i><b>${name}</b><span>⏩ ${SPEED}× SPEED</span></div>`);
    await page.evaluate(() => document.fonts.ready);
    const f = `/tmp/hero-reel/${id}.png`;
    await page.screenshot({ path: f, omitBackground: true });
    files.push(f);
  }
  await browser.close();
  return files;
}

async function main() {
  fs.mkdirSync('/tmp/hero-reel', { recursive: true });
  const missing = PARTS.map(p => p[0]).filter(id => !fs.existsSync(`${MASTER}/${id}.mp4`));
  if (missing.length) { console.log(`not recorded yet: ${missing.join(', ')}`); process.exit(1); }
  const pngs = await labels();
  const segs: string[] = [];
  PARTS.forEach(([id, , at, len], i) => {
    const src = `${MASTER}/${id}.mp4`;
    const take = Math.min(len, dur(src) - at - 0.5);
    const out = `/tmp/hero-reel/${i}.mp4`;
    const sec = take / SPEED;
    execFileSync(FF, ['-y', '-v', 'error', '-ss', String(at), '-t', take.toFixed(2), '-i', src, '-i', pngs[i], '-filter_complex',
      `[0:v]setpts=PTS/${SPEED},fps=25,scale=${W}:${H}:flags=lanczos[v];[v][1:v]overlay=0:0,fade=in:st=0:d=0.25,fade=out:st=${(sec - 0.25).toFixed(2)}:d=0.25,format=yuv420p`,
      '-an', '-c:v', 'libx264', '-crf', '14', '-preset', 'fast', out]);
    segs.push(out);
  });
  fs.writeFileSync('/tmp/hero-reel/list.txt', segs.map(s => `file '${s}'`).join('\n'));
  const joined = '/tmp/hero-reel/joined.mp4';
  execFileSync(FF, ['-y', '-v', 'error', '-f', 'concat', '-safe', '0', '-i', '/tmp/hero-reel/list.txt', '-c', 'copy', joined]);
  // Weight: it is the first thing on the page, so it is kept near 3 MB per format.
  execFileSync(FF, ['-y', '-v', 'error', '-i', joined, '-c:v', 'libvpx-vp9', '-b:v', '0', '-crf', '45', '-row-mt', '1', '-deadline', 'good', '-cpu-used', '2', '-an', `${OUT}/hero-reel.webm`]);
  execFileSync(FF, ['-y', '-v', 'error', '-i', joined, '-c:v', 'libx264', '-crf', '29', '-preset', 'slow', '-profile:v', 'high', '-pix_fmt', 'yuv420p', '-movflags', '+faststart', '-an', `${OUT}/hero-reel.mp4`]);
  execFileSync(FF, ['-y', '-v', 'error', '-ss', '2.2', '-i', joined, '-frames:v', '1', '-c:v', 'libwebp', '-quality', '78', `${OUT}/hero-reel-poster.webp`]);
  for (const f of ['hero-reel.webm', 'hero-reel.mp4', 'hero-reel-poster.webp'])
    console.log(`${f} ${(fs.statSync(`${OUT}/${f}`).size / 1e6).toFixed(2)} MB`);
  console.log(`${dur(joined).toFixed(1)} s, ${PARTS.length} modules`);
}
main().catch(e => { console.error(e); process.exit(1); });
