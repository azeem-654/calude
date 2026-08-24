// Records the 1:1 (anim_square.html) and 16:9 (anim_horizontal.html)
// video variants Meta Ads Manager asks for alongside the 9:16 original
// (recorded separately via record.js / anim.html). Requires the
// `playwright` package (npm install playwright) with its bundled
// Chromium (npx playwright install chromium), plus convert_extra_formats.sh
// to turn the recorded .webm files into the final .mp4s (a system ffmpeg
// with libx264 + aac — Playwright's bundled ffmpeg can't do this).
const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');

const FORMATS = [
  { name: 'square', file: 'anim_square.html', width: 1080, height: 1080 },
  { name: 'horizontal', file: 'anim_horizontal.html', width: 1920, height: 1080 },
];
const HOLD_MS = 8000;

(async () => {
  const launchOptions = process.env.PLAYWRIGHT_CHROMIUM_PATH
    ? { executablePath: process.env.PLAYWRIGHT_CHROMIUM_PATH }
    : {};
  const browser = await chromium.launch(launchOptions);

  for (const fmt of FORMATS) {
    const outDir = path.join(__dirname, `video_raw_${fmt.name}`);
    fs.mkdirSync(outDir, { recursive: true });
    const context = await browser.newContext({
      viewport: { width: fmt.width, height: fmt.height },
      recordVideo: { dir: outDir, size: { width: fmt.width, height: fmt.height } },
    });
    const page = await context.newPage();
    const html = fs.readFileSync(path.join(__dirname, fmt.file), 'utf8');
    await page.setContent(html, { waitUntil: 'load' });
    await page.waitForTimeout(HOLD_MS);
    const videoHandle = page.video();
    await page.close();
    await context.close();
    const savedPath = await videoHandle.path();
    console.log(fmt.name, 'raw video saved at', savedPath);
  }

  await browser.close();
})();
