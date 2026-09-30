import pw from '/opt/node22/lib/node_modules/playwright/index.js';
import { spawn } from 'node:child_process';
import fs from 'node:fs';
const [, , mode, ...rest] = process.argv;
const browser = await pw.chromium.launch();
const page = await browser.newPage({ viewport: { width: 1080, height: 1920 } });
const errs = [];
page.on('pageerror', e => errs.push(String(e)));
page.on('console', m => { if (m.type() === 'error') errs.push(m.text()); });
await page.goto('http://127.0.0.1:8765/index.html');
await page.evaluate(() => window.READY);
if (mode === 'stills') {
  fs.mkdirSync('stills', { recursive: true });
  for (const t of rest.map(Number)) {
    await page.evaluate(t => window.render(t), t);
    await page.screenshot({ path: `stills/t${t.toFixed(2)}.png` });
  }
} else if (mode === 'sfx') {
  fs.writeFileSync('sfx.json', JSON.stringify(await page.evaluate(() => window.SFX)));
} else if (mode === 'video') {
  // video <out.mp4> <fps> <segments json: [[a,b],...]>
  const [out, fpsS, segS] = rest;
  const fps = Number(fpsS); const segs = JSON.parse(segS);
  const ff = spawn('node_modules/ffmpeg-static/ffmpeg', ['-y', '-f', 'image2pipe', '-framerate', String(fps), '-c:v', 'mjpeg', '-i', '-', '-c:v', 'libx264', '-preset', 'medium', '-crf', '16', '-pix_fmt', 'yuv420p', '-movflags', '+faststart', out], { stdio: ['pipe', 'inherit', 'inherit'] });
  let n = 0;
  for (const [a, b] of segs) {
    const frames = Math.round((b - a) * fps);
    for (let i = 0; i < frames; i++) {
      const t = a + i / fps;
      await page.evaluate(t => window.render(t), t);
      const buf = await page.screenshot({ type: 'jpeg', quality: 94 });
      if (!ff.stdin.write(buf)) await new Promise(r => ff.stdin.once('drain', r));
      if (++n % 150 === 0) console.error('frames', n);
    }
  }
  ff.stdin.end();
  await new Promise(r => ff.on('close', r));
}
if (errs.length) console.log('ERRORS', errs.slice(0, 10));
await browser.close();
