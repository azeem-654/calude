/* Frames and sound cues from the film page (served at 127.0.0.1:8766).
   node capture.mjs sfx                    → sfx.json
   node capture.mjs stills 10 22.5 …       → stills/
   node capture.mjs video out.mp4 30       → the whole film, silent */
import pw from '/opt/node22/lib/node_modules/playwright/index.js';
import { spawn } from 'node:child_process';
import fs from 'node:fs';
const [, , mode, ...rest] = process.argv;
const browser = await pw.chromium.launch();
const page = await browser.newPage({ viewport: { width: 1920, height: 1080 } });
const errs = [];
page.on('pageerror', e => errs.push(String(e)));
await page.goto('http://127.0.0.1:8766/index.html');
await page.evaluate(() => window.READY);
const DUR = await page.evaluate(() => window.DURATION);
if (mode === 'sfx') {
  fs.writeFileSync('sfx.json', JSON.stringify(await page.evaluate(() => window.SFX)));
} else if (mode === 'stills') {
  fs.mkdirSync('stills', { recursive: true });
  for (const t of rest.map(Number)) { await page.evaluate(t => window.render(t), t); await page.screenshot({ path: `stills/t${t.toFixed(1)}.png` }); }
} else if (mode === 'video') {
  const [out, fpsS] = rest; const fps = Number(fpsS);
  const ff = spawn('node_modules/ffmpeg-static/ffmpeg', ['-y', '-loglevel', 'error', '-f', 'image2pipe', '-framerate', String(fps), '-c:v', 'mjpeg', '-i', '-', '-c:v', 'libx264', '-preset', 'medium', '-crf', '14', '-pix_fmt', 'yuv420p', out], { stdio: ['pipe', 'inherit', 'inherit'] });
  const frames = Math.round(DUR * fps);
  for (let i = 0; i < frames; i++) {
    await page.evaluate(t => window.render(t), i / fps);
    const buf = await page.screenshot({ type: 'jpeg', quality: 95 });
    if (!ff.stdin.write(buf)) await new Promise(r => ff.stdin.once('drain', r));
    if (i % 300 === 0) console.error('frame', i, 'of', frames);
  }
  ff.stdin.end();
  await new Promise(r => ff.on('close', r));
}
if (errs.length) console.log('ERRORS', errs.slice(0, 10));
await browser.close();
