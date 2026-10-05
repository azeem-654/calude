/* Store screenshots for both apps from the app's own phone-layout captures
   (public/site/reel/*-m.webp, scripts/site-reels.mts — the running app with the
   sample workspace, DEMO WORKSPACE on every screen). node store-shots.mjs
   App Store: 1290×2796 (the 6.9" slot). Google Play: 1080×1920 (Play refuses
   anything longer than 2:1). */
import pw from '/opt/node22/lib/node_modules/playwright/index.js';
import fs from 'node:fs';
import path from 'node:path';

const REEL = path.resolve('../../public/site/reel');
const SHOTS = {
  customer: [
    ['ap-describe-m', 'Tell AI what you want.', 'Autopilot builds the workflows'],
    ['hero-dashboard-m', 'Your whole business,', 'on one screen'],
    ['pr-dentists-m', 'Say who you sell to.', 'Get leads you can reach'],
    ['ap-board-m', 'Approve with one tap.', 'Nothing sends without you'],
    ['contacts-list-m', 'Every lead and customer,', 'in one place'],
    ['mkt-sequences-m', 'Follow-ups that', 'send themselves'],
  ],
  support: [
    ['eng-tickets-m', 'Answer every customer,', 'wherever you are'],
    ['contacts-profile-m', 'Who they are, before', 'you say hello'],
    ['cal-week-m', 'Calls and appointments,', 'in your pocket'],
    ['hero-dashboard-m', 'See what needs you,', 'the moment it does'],
  ],
};
const page = await (await pw.chromium.launch()).newPage();
for (const [app, list] of Object.entries(SHOTS)) {
  for (const [store, W, H, top, shotH] of [['appstore', 1290, 2796, 150, 2150], ['play', 1080, 1920, 90, 1420]]) {
    const dir = path.join(app, 'store', store);
    fs.mkdirSync(dir, { recursive: true });
    let n = 0;
    for (const [file, a, b] of list) {
      const src = path.join(REEL, `${file}.webp`);
      if (!fs.existsSync(src)) { console.log('missing', file); continue; }
      const img = `data:image/webp;base64,${fs.readFileSync(src).toString('base64')}`;
      const fs1 = Math.round(W * (W > 1200 ? 0.06 : 0.068));
      await page.setViewportSize({ width: W, height: H });
      await page.setContent(`<html><body style="margin:0;width:${W}px;height:${H}px;overflow:hidden;font-family:Inter,system-ui,sans-serif;
        background:radial-gradient(120% 70% at 15% 0%,#22327f 0%,#0d1336 55%,#070918 100%);display:flex;flex-direction:column;align-items:center">
        <div style="margin-top:${top}px;text-align:center;color:#fff;font-weight:800;font-size:${fs1}px;line-height:1.12;letter-spacing:-0.02em">${a}<br><span style="color:#c8f24d">${b}</span></div>
        <img src="${img}" style="margin-top:${Math.round(top * 0.6)}px;height:${shotH}px;border-radius:${Math.round(W * 0.045)}px;box-shadow:0 30px 80px rgba(0,0,0,.55);border:${Math.round(W * 0.008)}px solid #1d2450">
      </body></html>`);
      await page.waitForTimeout(150);
      await page.screenshot({ path: path.join(dir, `${String(++n).padStart(2, '0')}-${file.replace(/-m$/, '')}.png`) });
    }
  }
}
await page.context().browser().close();
console.log('ok');
