/**
 * Real screenshots of the real modules, for the marketing site.
 *
 * Nothing here is a mock-up: the app is booted with a plausible workspace and
 * photographed, so what the site shows is what a customer actually gets. Rerun
 * this whenever a module's look changes.
 */
import pw from '/opt/node22/lib/node_modules/playwright/index.js';
const { chromium } = pw;
import { spawn, execSync } from 'node:child_process';
import fs from 'node:fs';

const ROOT = '/home/user/calude';
const BASE = 'http://localhost:5193/calude';
const RAW = '/tmp/crmpro-site-shots';
const OUT = `${ROOT}/public/site`;

fs.rmSync(RAW, { recursive: true, force: true }); fs.mkdirSync(RAW, { recursive: true });
fs.mkdirSync(OUT, { recursive: true });
execSync(`rm -f ${ROOT}/public/api/data/users.php`);

const vite = spawn('npx', ['vite', '--port', '5193', '--strictPort'], { cwd: ROOT, stdio: 'ignore' });
for (let i = 0; i < 140; i++) { try { if ((await fetch(`${BASE}/`)).ok) break; } catch { /* waiting */ } await new Promise(r => setTimeout(r, 500)); }

import { workspaceSeed } from './site-seed.mjs';

/* The window every capture is measured against. The clip regions below are
   document pixels at exactly this size, so changing it invalidates them. */
const VIEWPORT = { width: 1240, height: 800 };

const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome' });
const ctx = await browser.newContext({ viewport: VIEWPORT, deviceScaleFactor: 2 });
/* The same workspace site-clips.mjs records, so the stills and the moving
   loops are pictures of one business rather than two. */
const seed = workspaceSeed();
await ctx.addInitScript(seed.script, seed.data);

const page = await ctx.newPage();
const errs = [];
page.on('pageerror', e => errs.push(e.stack || e.message));
page.on('console', m => { if (m.type() === 'error') errs.push('console: ' + m.text().slice(0, 400)); });

/*
 * What to photograph.
 *
 * One picture per module was one picture too few. A whole 1240px window shrunk
 * into a marketing page shows that a screen exists and nothing about what it
 * does; the parts that carry the argument — the figures, the board, the ranked
 * list of what to do next — are each a few dozen pixels tall in it.
 *
 * So each module is captured several times, close in, on the region that
 * actually makes its point. The regions come from measuring the running app
 * rather than from taste: `clip` is in document pixels at the 1240x800 viewport
 * below, and `fullPage` lets a region below the fold be captured without
 * scrolling the page under it.
 *
 * `label` is what the site prints under the view. It says which function is
 * being shown, because a crop without one is just a smaller screenshot.
 */
const SHOTS = [
  { file: 'dashboard',      path: '/', settle: 2800 },
  { file: 'dash-kpis',      path: '/', clip: { x: 96, y: 248, width: 560, height: 180 }, label: 'Counted from your own records, not estimated' },
  { file: 'dash-next',      path: '/', clip: { x: 114, y: 700, width: 600, height: 262 }, label: 'What to do next, ranked by lift' },

  { file: 'agent',          path: '/ai-sales-agent/AI-SA-2026-0001', settle: 2800 },
  { file: 'agent-objective', path: '/ai-sales-agent/AI-SA-2026-0001', clip: { x: 84, y: 326, width: 620, height: 146 }, label: 'Your sentence, kept word for word' },
  { file: 'agent-metrics',  path: '/ai-sales-agent/AI-SA-2026-0001', clip: { x: 106, y: 544, width: 600, height: 192 }, label: 'Every figure read live from the module that owns it' },

  { file: 'flow',           path: '/ai-sales-agent/AI-SA-2026-0001?tab=flow', settle: 3400 },

  { file: 'marketing',      path: '/marketing', settle: 2800 },
  { file: 'mkt-stats',      path: '/marketing', clip: { x: 84, y: 334, width: 580, height: 114 }, label: 'Sent, opened and replied across every campaign' },
  { file: 'mkt-list',       path: '/marketing', clip: { x: 84, y: 452, width: 620, height: 310 }, label: 'Each campaign, and the sequence that produced it' },

  { file: 'contacts',       path: '/contacts', settle: 2800 },
  { file: 'contacts-filters', path: '/contacts', clip: { x: 56, y: 190, width: 620, height: 240 }, label: 'Filter by status, stage, owner or tag' },
  { file: 'contacts-table', path: '/contacts', clip: { x: 84, y: 430, width: 620, height: 400 }, label: 'Health, stage and pipeline on every row' },

  { file: 'pipelines',      path: '/pipelines', settle: 2800 },
  { file: 'pipe-summary',   path: '/pipelines', clip: { x: 84, y: 216, width: 580, height: 142 }, label: 'Open value, and the same value weighted by probability' },
  { file: 'pipe-board',     path: '/pipelines', clip: { x: 84, y: 462, width: 600, height: 420 }, label: 'Stages you define, dragged straight across' },

  { file: 'calendar',       path: '/calendar', settle: 2800 },
  { file: 'cal-week',       path: '/calendar', clip: { x: 78, y: 280, width: 600, height: 420 }, label: 'The week, on one grid' },
  { file: 'cal-upcoming',   path: '/calendar', clip: { x: 878, y: 266, width: 352, height: 380 }, label: 'What is booked, and who booked it' },

  /*
   * One full-window view per remaining module.
   *
   * The site's card grid shows a whole screen shrunk into a tile rather than a
   * crop — at that size a crop reads as an unidentifiable fragment, while a
   * whole screen still reads as "that is a product". So these need no `clip`;
   * they exist so that every card on the marketing page is a real module and
   * not a placeholder.
   */
  { file: 'conversations',  path: '/conversations', settle: 2800 },
  { file: 'funnels',        path: '/funnels', settle: 2600 },
  { file: 'websites',       path: '/websites', settle: 2600 },
  { file: 'blog',           path: '/blog-automation', settle: 2800 },
  { file: 'shorts',         path: '/ai-shorts', settle: 2800 },
  { file: 'social',         path: '/social-creator', settle: 2800 },
  { file: 'social-auto',    path: '/social-automation', settle: 2800 },
  { file: 'analytics',      path: '/analytics', settle: 3000 },
  { file: 'reputation',     path: '/reputation', settle: 2600 },
  { file: 'scheduling',     path: '/scheduling', settle: 2600 },
  { file: 'agency',         path: '/agency', settle: 2600 },
  { file: 'infrastructure', path: '/settings?tab=infrastructure', settle: 3000 },
  { file: 'automation',     path: '/settings?tab=automation', settle: 3000 },
];

/* One navigation per address, however many crops come off it. */
let at = '';
for (const s of SHOTS) {
  if (at !== s.path) {
    await page.goto(`${BASE}${s.path}`, { waitUntil: 'networkidle' });
    await page.waitForTimeout(s.settle ?? 2600);
    await page.evaluate(() => document.querySelectorAll('[class*="notif"], [role="status"]').forEach(n => n.remove()));
    at = s.path;
  }
  const broken = await page.evaluate(() => /ran into a problem/i.test(document.body.innerText));
  if (broken) { console.log('REFUSED', s.file, '— the screen is showing the error boundary'); process.exitCode = 1; continue; }
  await page.screenshot({ path: `${RAW}/${s.file}.png`, ...(s.clip ? { clip: s.clip, fullPage: true } : {}) });
  console.log('captured', s.file);
}

console.log('ERRORS:', errs.length ? errs.join(' | ') : 'none');

/*
 * PNG → WebP, in the browser that just took them.
 *
 * This step used to not exist. The script wrote full-size PNGs to a temp
 * directory and stopped, and somebody converted them by hand with cwebp — so
 * re-running it appeared to work, printed "captured" seven times, and changed
 * nothing the site actually serves.
 *
 * Chromium encodes WebP natively, and there is a Chromium right here. The crops
 * are already close in, so they are written at their captured width rather than
 * being scaled down again into illegibility; only the full-window shots need
 * reducing.
 */
const conv = await ctx.newPage();
await conv.goto('about:blank');
const manifest = [];
for (const s of SHOTS) {
  const png = `${RAW}/${s.file}.png`;
  if (!fs.existsSync(png)) { console.log('skipped', s.file, '— no capture'); continue; }
  const b64 = fs.readFileSync(png).toString('base64');
  const out = await conv.evaluate(async ({ b64, cap }) => {
    const img = new Image();
    await new Promise((ok, no) => { img.onload = ok; img.onerror = no; img.src = 'data:image/png;base64,' + b64; });
    /* Captured at 2x for sharpness, written at 1x. A crop written wider than
       the region it came from would be upscaled mush; written narrower it is
       shrunk again, which is the thing these crops exist to avoid. */
    const w = Math.min(img.naturalWidth, cap);
    const c = document.createElement('canvas');
    c.width = w;
    c.height = Math.round((img.naturalHeight / img.naturalWidth) * w);
    c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
    return { data: c.toDataURL('image/webp', 0.85).split(',')[1], w: c.width, h: c.height };
  }, { b64, cap: s.clip ? s.clip.width : 1400 });
  fs.writeFileSync(`${OUT}/${s.file}.webp`, Buffer.from(out.data, 'base64'));
  manifest.push({ file: s.file, w: out.w, h: out.h, label: s.label ?? null });
  console.log(`wrote ${s.file}.webp  ${out.w}x${out.h}  ${(fs.statSync(`${OUT}/${s.file}.webp`).size / 1024).toFixed(0)}kB`);
}

/* The site needs each picture's real size to reserve space for it before it
   loads; guessing one aspect for crops of five different shapes is what makes
   a page jump about while it settles. */
fs.writeFileSync(`${OUT}/shots.json`, JSON.stringify(manifest, null, 2));
console.log(`wrote shots.json (${manifest.length} views)`);

await browser.close(); vite.kill();