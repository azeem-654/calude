// Records all 3 video formats (9:16, 1:1, 16:9) with a given WhatsApp
// number substituted into the CTA, so multiple number variants of the
// same ad stay in sync with one set of source HTML files.
//
//   PHONE=0302-1202000 SLUG=03021202000 node record_number_variant.js
//
// PHONE  the number to display (defaults to the number in the HTML)
// SLUG   suffix for the output filenames (defaults to digits of PHONE)
//
// Then run convert_number_variant.sh with the same SLUG to produce the
// final .mp4 files. Requires the `playwright` package (npm install
// playwright) with its bundled Chromium (npx playwright install chromium).
const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');

// The number as it appears in the source HTML files.
const SOURCE_PHONE = '0320-0045364';

const PHONE = process.env.PHONE || SOURCE_PHONE;
const SLUG = process.env.SLUG || PHONE.replace(/\D/g, '');

const FORMATS = [
  { name: 'vertical', file: 'anim.html', width: 1080, height: 1920 },
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
    const outDir = path.join(__dirname, `video_raw_${SLUG}_${fmt.name}`);
    fs.mkdirSync(outDir, { recursive: true });
    const context = await browser.newContext({
      viewport: { width: fmt.width, height: fmt.height },
      recordVideo: { dir: outDir, size: { width: fmt.width, height: fmt.height } },
    });
    const page = await context.newPage();
    let html = fs.readFileSync(path.join(__dirname, fmt.file), 'utf8');
    html = html.split(SOURCE_PHONE).join(PHONE);
    await page.setContent(html, { waitUntil: 'load' });
    await page.waitForTimeout(HOLD_MS);
    const videoHandle = page.video();
    await page.close();
    await context.close();
    const savedPath = await videoHandle.path();
    console.log(`${fmt.name} (${PHONE}) raw video saved at`, savedPath);
  }

  await browser.close();
})();
