// Requires the `playwright` package (npm install playwright) with its
// bundled Chromium (npx playwright install chromium).
const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');
const singleAd = require('./single_ad');
const carousel = require('./carousel');

function dotsHtml(count, activeIndex) {
  let html = '<div class="pagegroup">';
  for (let i = 0; i < count; i++) {
    html += `<div class="dot${i === activeIndex ? ' active' : ''}"></div>`;
  }
  html += '</div>';
  return html;
}

(async () => {
  const launchOptions = process.env.PLAYWRIGHT_CHROMIUM_PATH
    ? { executablePath: process.env.PLAYWRIGHT_CHROMIUM_PATH }
    : {};
  const browser = await chromium.launch(launchOptions);
  const page = await browser.newPage({ viewport: { width: 1080, height: 1080 }, deviceScaleFactor: 1 });
  const template = fs.readFileSync(path.join(__dirname, 'square.html'), 'utf8');
  await page.setContent(template, { waitUntil: 'load' });

  const outDir = path.join(__dirname, 'images');
  fs.mkdirSync(outDir, { recursive: true });

  // Single image ad
  await page.evaluate(({ content }) => {
    document.getElementById('content').innerHTML = content;
    document.getElementById('chrome').innerHTML = '';
  }, { content: singleAd.content });
  await page.waitForTimeout(80);
  await page.screenshot({ path: path.join(outDir, `${singleAd.name}.png`) });
  console.log('rendered single ad');

  // Carousel cards
  for (let i = 0; i < carousel.length; i++) {
    const card = carousel[i];
    const chrome = dotsHtml(carousel.length, i) + (card.swipe ? '<div class="swipe">Swipe &rarr;</div>' : '');
    await page.evaluate(({ content, chrome }) => {
      document.getElementById('content').innerHTML = content;
      document.getElementById('chrome').innerHTML = chrome;
    }, { content: card.content, chrome });
    await page.waitForTimeout(80);
    const outPath = path.join(outDir, `carousel_${card.name}.png`);
    await page.screenshot({ path: outPath });
    console.log('rendered', outPath);
  }

  await browser.close();
})();
