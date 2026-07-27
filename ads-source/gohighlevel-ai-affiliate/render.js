// Requires the `playwright` package (npm install playwright) with its
// bundled Chromium (npx playwright install chromium).
const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');
const scenes = require('./scenes');

(async () => {
  const launchOptions = process.env.PLAYWRIGHT_CHROMIUM_PATH
    ? { executablePath: process.env.PLAYWRIGHT_CHROMIUM_PATH }
    : {};
  const browser = await chromium.launch(launchOptions);
  const page = await browser.newPage({ viewport: { width: 1920, height: 1080 }, deviceScaleFactor: 1 });
  const template = fs.readFileSync(path.join(__dirname, 'scene.html'), 'utf8');
  await page.setContent(template, { waitUntil: 'load' });
  fs.mkdirSync(path.join(__dirname, 'frames'), { recursive: true });

  for (const scene of scenes) {
    await page.evaluate((html) => {
      document.getElementById('content').innerHTML = html;
    }, scene.html);
    await page.waitForTimeout(80);
    const outPath = path.join(__dirname, 'frames', `${scene.name}.png`);
    await page.screenshot({ path: outPath });
    console.log('rendered', outPath);
  }

  await browser.close();
})();
