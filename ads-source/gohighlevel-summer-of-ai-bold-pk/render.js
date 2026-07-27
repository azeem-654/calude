// Requires the `playwright` package (npm install playwright) with its
// bundled Chromium (npx playwright install chromium).
const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');
const { buildHtml } = require('./template');
const content = require('./content');

const FORMATS = [
  { name: 'facebook_1080x1080', width: 1080, height: 1080, heroHeight: 290, compact: true },
  { name: 'instagram_1080x1350', width: 1080, height: 1350, heroHeight: 400, snug: true },
  { name: 'whatsapp_status_1080x1920', width: 1080, height: 1920, heroHeight: 540, expanded: true },
];

(async () => {
  const launchOptions = process.env.PLAYWRIGHT_CHROMIUM_PATH
    ? { executablePath: process.env.PLAYWRIGHT_CHROMIUM_PATH }
    : {};
  const browser = await chromium.launch(launchOptions);
  const outDir = path.join(__dirname, 'images');
  fs.mkdirSync(outDir, { recursive: true });

  for (const fmt of FORMATS) {
    const page = await browser.newPage({ viewport: { width: fmt.width, height: fmt.height }, deviceScaleFactor: 1 });
    const html = buildHtml(fmt);
    await page.setContent(html, { waitUntil: 'load' });
    await page.evaluate((html) => {
      document.getElementById('body-content').innerHTML = html;
    }, content);
    await page.waitForTimeout(80);
    const outPath = path.join(outDir, `${fmt.name}.png`);
    await page.screenshot({ path: outPath });
    console.log('rendered', outPath);
    await page.close();
  }

  await browser.close();
})();
