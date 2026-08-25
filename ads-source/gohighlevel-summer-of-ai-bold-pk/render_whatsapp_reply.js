// Renders the 1080x1350 "how to claim" image sent as a reply to incoming
// WhatsApp messages from the ad campaigns.
//
//   node render_whatsapp_reply.js                          # default number
//   PHONE=0302-1202000 node render_whatsapp_reply.js       # other number
//
// With PHONE set, the output filename gets the number's digits appended.
// Requires the `playwright` package (npm install playwright) with its
// bundled Chromium (npx playwright install chromium).
const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');

// The number as it appears in whatsapp_reply.html.
const SOURCE_PHONE = '0320-0045364';

const PHONE = process.env.PHONE || SOURCE_PHONE;
const outName = PHONE === SOURCE_PHONE
  ? 'whatsapp_reply_1080x1350.png'
  : `whatsapp_reply_1080x1350_${PHONE.replace(/\D/g, '')}.png`;

(async () => {
  const launchOptions = process.env.PLAYWRIGHT_CHROMIUM_PATH
    ? { executablePath: process.env.PLAYWRIGHT_CHROMIUM_PATH }
    : {};
  const browser = await chromium.launch(launchOptions);
  const page = await browser.newPage({ viewport: { width: 1080, height: 1350 }, deviceScaleFactor: 1 });
  let html = fs.readFileSync(path.join(__dirname, 'whatsapp_reply.html'), 'utf8');
  html = html.split(SOURCE_PHONE).join(PHONE);
  await page.setContent(html, { waitUntil: 'load' });
  await page.waitForTimeout(80);
  const outDir = path.join(__dirname, 'images');
  fs.mkdirSync(outDir, { recursive: true });
  await page.screenshot({ path: path.join(outDir, outName) });
  console.log('rendered', outName);
  await browser.close();
})();
