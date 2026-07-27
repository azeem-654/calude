// Requires the `playwright` package (npm install playwright) with its
// bundled Chromium (npx playwright install chromium), plus a system
// ffmpeg built with libx264 + aac (Playwright's bundled ffmpeg is not
// enough) to convert the recorded .webm into the final .mp4 — see
// convert.sh.
const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');

const WIDTH = 1080;
const HEIGHT = 1920;
const HOLD_MS = 8000; // total capture length

(async () => {
  const outDir = path.join(__dirname, 'video_raw');
  fs.mkdirSync(outDir, { recursive: true });

  const launchOptions = process.env.PLAYWRIGHT_CHROMIUM_PATH
    ? { executablePath: process.env.PLAYWRIGHT_CHROMIUM_PATH }
    : {};
  const browser = await chromium.launch(launchOptions);
  const context = await browser.newContext({
    viewport: { width: WIDTH, height: HEIGHT },
    recordVideo: { dir: outDir, size: { width: WIDTH, height: HEIGHT } },
  });
  const page = await context.newPage();
  const html = fs.readFileSync(path.join(__dirname, 'anim.html'), 'utf8');
  await page.setContent(html, { waitUntil: 'load' });
  await page.waitForTimeout(HOLD_MS);
  const videoHandle = page.video();
  await page.close();
  await context.close();
  const savedPath = await videoHandle.path();
  console.log('raw video saved at', savedPath);
  await browser.close();
})();
