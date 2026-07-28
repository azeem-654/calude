// Renders the 1200x628 (1.91:1) horizontal image required by Google Ads
// Performance Max / Display asset groups. Requires the `playwright`
// package (npm install playwright) with its bundled Chromium
// (npx playwright install chromium).
const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');

(async () => {
  const launchOptions = process.env.PLAYWRIGHT_CHROMIUM_PATH
    ? { executablePath: process.env.PLAYWRIGHT_CHROMIUM_PATH }
    : {};
  const browser = await chromium.launch(launchOptions);
  const page = await browser.newPage({ viewport: { width: 1200, height: 628 }, deviceScaleFactor: 1 });
  const html = fs.readFileSync(path.join(__dirname, 'horizontal.html'), 'utf8');
  await page.setContent(html, { waitUntil: 'load' });
  await page.waitForTimeout(80);
  const outDir = path.join(__dirname, 'images');
  fs.mkdirSync(outDir, { recursive: true });
  await page.screenshot({ path: path.join(outDir, 'google_ads_horizontal_1200x628.png') });
  console.log('rendered');
  await browser.close();
})();
