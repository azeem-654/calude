// Renders the 1080x1350 "how to claim" image sent as a reply to incoming
// WhatsApp messages from the ad campaigns. Requires the `playwright`
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
  const page = await browser.newPage({ viewport: { width: 1080, height: 1350 }, deviceScaleFactor: 1 });
  const html = fs.readFileSync(path.join(__dirname, 'whatsapp_reply.html'), 'utf8');
  await page.setContent(html, { waitUntil: 'load' });
  await page.waitForTimeout(80);
  const outDir = path.join(__dirname, 'images');
  fs.mkdirSync(outDir, { recursive: true });
  await page.screenshot({ path: path.join(outDir, 'whatsapp_reply_1080x1350.png') });
  console.log('rendered');
  await browser.close();
})();
