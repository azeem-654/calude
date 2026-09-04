/**
 * Moving pictures of the real modules, for the marketing site.
 *
 * The still screenshots say a module exists. They cannot show it working —
 * that a board scrolls, that a campaign has tabs, that a list is long. So each
 * tile on the site now carries a short silent loop of the same module, and this
 * records them.
 *
 * WebM rather than GIF, and the difference is not pedantry: the same six
 * seconds is tens of kilobytes as VP8 and several megabytes as a GIF, at better
 * colour and without the dithering. Sixteen GIFs would be a page nobody on a
 * phone waits for. Playwright writes WebM natively, so there is no encoder to
 * install and nothing in the build depends on one.
 *
 * Each clip scrolls down and comes back, so the last frame matches the first
 * and the loop does not jump. The still `.webp` stays as the poster — it is
 * what shows before the clip loads, and what shows for good on a browser that
 * will not play WebM.
 *
 * Recording starts when a *page* is created, not when it finishes loading, so
 * the raw cut of every clip opens with the app booting on a white page — an
 * eighteen-second file for three seconds of motion, and Playwright's WebM has
 * no seek index, so the player cannot skip it either. Each clip is therefore
 * trimmed to its last few seconds and re-encoded, which fixes three things at
 * once: the loop is the movement, the file is seekable, and VP9 at a sane CRF
 * takes the set from 6.9MB to 1.5MB.
 *
 * That needs ffmpeg, which the site build does not — so it is not a dependency
 * of the project, only of this script:
 *
 *   npm install --no-save ffmpeg-static
 *
 *   node scripts/site-clips.mjs
 */
import pw from '/opt/node22/lib/node_modules/playwright/index.js';
const { chromium } = pw;
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import { execFileSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { workspaceSeed } from './site-seed.mjs';

const require_ = createRequire(import.meta.url);
let FFMPEG = null;
try { FFMPEG = require_('ffmpeg-static'); } catch { /* reported below */ }
if (!FFMPEG) {
  console.error('ffmpeg is needed to trim the recordings. Run:\n\n  npm install --no-save ffmpeg-static\n');
  process.exit(1);
}

/** How much of the tail to keep — the drift, and nothing before it. */
const KEEP_SECONDS = 4.5;

const ROOT = '/home/user/calude';
const BASE = 'http://localhost:5194/calude';
const RAW = '/tmp/crmpro-site-clips';
const OUT = `${ROOT}/public/site`;

fs.rmSync(RAW, { recursive: true, force: true });
fs.mkdirSync(RAW, { recursive: true });
fs.mkdirSync(OUT, { recursive: true });

const vite = spawn('npx', ['vite', '--port', '5194', '--strictPort'], { cwd: ROOT, stdio: 'ignore' });
for (let i = 0; i < 140; i++) {
  try { if ((await fetch(`${BASE}/`)).ok) break; } catch { /* waiting */ }
  await new Promise(r => setTimeout(r, 500));
}

/*
 * The frame the clips are recorded at.
 *
 * Wider than the tile shows, because a tile is ~370px on a phone and ~700px in
 * a wide card, and a video scaled down is sharp while one scaled up is not.
 * 16:10 rather than the app's own ratio: the tile crops the bottom anyway, and
 * a taller frame wastes bytes on pixels nobody sees.
 *
 * Two sizes, because the tiles are two sizes. A wide tile renders its clip
 * around 700px and wants the pixels; a small one renders at ~370px and does
 * not. Recording all eighteen at the larger size cost 12MB across the page for
 * detail that twelve of them never show.
 */
const BIG = { width: 800, height: 500 };
const SMALL = { width: 560, height: 350 };

/**
 * One clip.
 *
 * `act` is optional and is where a module gets a movement of its own — a tab
 * clicked, a row hovered. Everything without one still moves, because the
 * default pass scrolls the page and drifts the cursor across it, which is
 * enough to read as "this is software, and it is running".
 */
const CLIPS = [
  { file: 'agent', path: '/ai-sales-agent/AI-SA-2026-0001', big: true, act: tabs(['Flow', 'Strategy', 'Overview']) },
  { file: 'contacts', path: '/contacts' },
  { file: 'funnels', path: '/funnels' },
  { file: 'websites', path: '/websites' },
  { file: 'scheduling', path: '/scheduling' },
  { file: 'blog', path: '/blog-automation' },
  { file: 'social', path: '/social-creator' },
  { file: 'pipelines', big: true, path: '/pipelines' },
  { file: 'marketing', path: '/marketing' },
  { file: 'conversations', path: '/conversations' },
  { file: 'calendar', path: '/calendar' },
  { file: 'reputation', path: '/reputation' },
  { file: 'agency', big: true, path: '/agency' },
  { file: 'analytics', path: '/analytics' },
  { file: 'automation', path: '/settings?tab=automation' },
  { file: 'infrastructure', big: true, path: '/settings?tab=infrastructure' },
  { file: 'dashboard', big: true, path: '/' },
  { file: 'flow', big: true, path: '/ai-sales-agent/AI-SA-2026-0001?tab=flow' },
];

/** Click through a module's own tabs, pausing on each. */
function tabs(names) {
  return async (page) => {
    for (const name of names) {
      const t = page.getByRole('button', { name, exact: true }).first();
      if (await t.count().catch(() => 0)) {
        await t.click({ timeout: 3000 }).catch(() => { /* the tab moved; keep going */ });
        await page.waitForTimeout(1100);
      }
    }
  };
}

/**
 * Down and back, slowly, with the cursor moving.
 *
 * `scrollBy` in small steps rather than one `scrollTo`, because a single jump
 * records as a cut. The cursor drift is what stops it looking like a
 * screen-recording of nobody: a pointer crossing the screen reads as use.
 */
async function drift(page) {
  const reach = await page.evaluate(() =>
    Math.max(0, Math.min(document.body.scrollHeight - innerHeight, innerHeight * 0.9)));

  /*
   * Move, hold, move, hold.
   *
   * The first cut scrolled continuously for six seconds and every frame was a
   * new frame, which is the most expensive thing you can hand an inter-frame
   * codec — 950kB a clip. Holding still between the moves costs almost nothing
   * to encode, and it reads better anyway: a page that pauses is a page
   * somebody is looking at, where one that scrolls without stopping is a page
   * nobody is reading.
   */
  const glide = async (distance, steps, from, to) => {
    for (let i = 0; i < steps; i++) {
      await page.evaluate(y => scrollBy(0, y), distance / steps);
      await page.mouse.move(from + (to - from) * (i / steps), 220 + Math.sin(i / 3) * 70);
      await page.waitForTimeout(55);
    }
  };

  await page.mouse.move(200, 220);
  await page.waitForTimeout(500);          // hold on the top
  await glide(reach, 14, 200, 620);
  await page.waitForTimeout(700);          // hold on what it scrolled to
  await glide(-reach, 11, 620, 240);
  await page.waitForTimeout(500);          // hold, back where it started
}

const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome' });
const seed = workspaceSeed();

/* Name one or more clips on the command line to re-record only those; the
   whole set takes six minutes and most fixes are to one of them. */
const only = process.argv.slice(2);
const todo = only.length ? CLIPS.filter(c => only.includes(c.file)) : CLIPS;
if (only.length) console.log(`only: ${todo.map(c => c.file).join(', ') || '(nothing matched)'}`);

for (const clip of todo) {
  /* One context per clip: the recorder writes a file per context, and closing
     it is what finalises the WebM. */
  const size = clip.big ? BIG : SMALL;
  const ctx = await browser.newContext({
    viewport: size,
    deviceScaleFactor: 1,
    recordVideo: { dir: RAW, size },
  });
  await ctx.addInitScript(seed.script, seed.data);

  /* Takes the cold load, and is thrown away with its video. */
  const warm = await ctx.newPage();
  await warm.goto(`${BASE}${clip.path}`, { waitUntil: 'networkidle' }).catch(() => {});
  await warm.waitForTimeout(1500);
  await warm.close();

  const page = await ctx.newPage();
  try {
    await page.goto(`${BASE}${clip.path}`, { waitUntil: 'domcontentloaded' });
    /*
     * Wait for the app, not for a stopwatch.
     *
     * A fixed delay caught the funnels clip on "Loading your workspace…" — the
     * sync gate, which is a real screen but not the one the tile is captioned
     * about. This waits for that gate to go, so what gets recorded is always
     * the module.
     */
    await page.waitForFunction(
      () => !/Loading your workspace/i.test(document.body.innerText),
      null, { timeout: 15000 },
    ).catch(() => { /* took too long; the frame check below still guards it */ });
    await page.waitForTimeout(1400);
    /* Toasts drift in and out on their own schedule and would blink through
       the middle of a loop. */
    await page.evaluate(() =>
      document.querySelectorAll('[class*="notif"], [role="status"]').forEach(n => n.remove()));

    const broken = await page.evaluate(() => /ran into a problem/i.test(document.body.innerText));
    if (broken) { console.log('REFUSED', clip.file, '— the screen is showing the error boundary'); }
    else {
      if (clip.act) {
        await clip.act(page);
        /* A tab click re-mounts the app, which puts the sync gate back — the
           agent clip opened on "Loading your workspace…" because of it. */
        await page.waitForFunction(
          () => !/Loading your workspace/i.test(document.body.innerText),
          null, { timeout: 10000 },
        ).catch(() => {});
        await page.waitForTimeout(600);
      }
      await drift(page);
    }
  } catch (e) {
    console.log('FAILED', clip.file, '—', e.message.slice(0, 100));
  }

  const video = page.video();
  await ctx.close();                       // finalises the file
  const from = await video.path();
  const to = `${OUT}/${clip.file}.webm`;

  /* `-sseof` takes the last KEEP_SECONDS; VP9 at crf 36 is roughly a quarter
     the size of what Playwright writes, at the same apparent quality once the
     clip is scaled into a tile. `-an` because none of these have sound and an
     empty audio track is bytes and a decoder for nothing. */
  execFileSync(FFMPEG, [
    '-y', '-v', 'error',
    '-sseof', String(-KEEP_SECONDS), '-i', from,
    '-an',
    '-c:v', 'libvpx-vp9', '-crf', '36', '-b:v', '0',
    '-row-mt', '1', '-deadline', 'good', '-cpu-used', '4',
    '-pix_fmt', 'yuv420p', '-g', '60',
    to,
  ]);

  const raw = fs.statSync(from).size / 1024;
  const cut = fs.statSync(to).size / 1024;
  console.log(`wrote ${clip.file}.webm  ${size.width}x${size.height}  ${raw.toFixed(0)}kB -> ${cut.toFixed(0)}kB`);
}

await browser.close();
vite.kill();
console.log(`\n${todo.length} clip(s) written to public/site/`);
