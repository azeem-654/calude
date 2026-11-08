// Builds the AppSumo listing images (1920x1080) from the site reel. Run from the repo root: node docs/appsumo/compose-images.mjs
import pw from '/opt/node22/lib/node_modules/playwright/index.js';
import fs from 'fs';
const R = 'public/site/reel/';
const shots = [
 ['01-autopilot-board','hero-board','AI Autopilot runs your business on the server','What it did, and what is waiting for your approval — every five minutes, logged in or not.'],
 ['02-describe','ap-describe','Describe the outcome. AI builds the system.','Type a sentence, say it out loud, or hand it your files and website.'],
 ['03-blueprint','ap-diagram','Approve the blueprint before anything exists','Every workflow drawn the way it runs, each fork labelled Yes or No.'],
 ['04-prospecting','hero-prospecting','AI Prospecting: say who to sell to','Finds the businesses, reads the email each one publishes, and checks it before you send.'],
 ['05-pipeline','pipe-board','CRM pipeline, contacts and deals','Every lead says where it came from and when it was found.'],
 ['06-social','social-gallery','Daily content in your colours','Posts with images for Facebook, Instagram, LinkedIn, X and more — each one waits for your yes.'],
 ['07-campaigns','mkt-campaigns','Email campaigns from your own mailbox and domain','Sequences that stop the moment somebody replies.'],
 ['08-sites','sites-builder','Websites and funnels, built in','Pages with forms that drop leads straight into your CRM.'],
 ['09-booking','cal-booking','A booking page of your own','Reminders before each visit, and a rebooking message for anybody who misses one.'],
 ['10-agency','agency','Run agency clients under your own name','A workspace per client, onboarding that runs itself, white-label branding.'],
 ['11-tickets','eng-tickets','Support tickets and live help','Chat and tickets from one help widget.'],
 ['12-revenue','analytics-revenue','Analytics from lead to revenue','See which sources and workflows bring in paying customers.'],
];
const b = await pw.chromium.launch();
const p = await b.newPage({ viewport: { width: 1920, height: 1080 }, deviceScaleFactor: 1 });
for (const [out, src, h, sub] of shots) {
  const img = 'data:image/webp;base64,' + fs.readFileSync(R + src + '.webp').toString('base64');
  await p.setContent(`<html><body style="margin:0;width:1920px;height:1080px;overflow:hidden;background:radial-gradient(1200px 700px at 85% 110%,#1d2a14 0%,#0f1210 60%);font-family:Inter,Segoe UI,Helvetica,Arial,sans-serif;color:#fff;position:relative">
  <div style="position:absolute;left:96px;top:64px;width:1728px">
   <div style="display:flex;align-items:center;gap:14px;font-size:24px;font-weight:600;color:#c8f24d;letter-spacing:.02em">${fs.readFileSync('public/favicon.svg','utf8').replace(/<!--[\s\S]*?-->/,'').replace('<svg ','<svg width="40" height="40" ')}Protected Central<span style="margin-left:auto;font-size:18px;font-weight:500;color:#7d8577;letter-spacing:0">Screens show a demo workspace with example data</span></div>
   <div style="font-size:60px;font-weight:800;line-height:1.08;margin-top:20px;letter-spacing:-.02em">${h}</div>
   <div style="font-size:30px;line-height:1.35;margin-top:16px;color:#c9d1c4">${sub}</div>
  </div>
  <div style="position:absolute;left:96px;right:96px;top:330px;bottom:-40px;border-radius:22px 22px 0 0;overflow:hidden;box-shadow:0 30px 90px rgba(0,0,0,.55),0 0 0 2px rgba(200,242,77,.25);background:#fff">
   <img src="${img}" style="width:2050px;display:block">
  </div>
  </body></html>`);
  await p.waitForTimeout(150);
  await p.screenshot({ path: `docs/appsumo/images/${out}.jpg`, type: "jpeg", quality: 88 });
}
// logo
await p.setViewportSize({ width: 512, height: 512 });
await p.setContent(`<html><body style="margin:0;background:transparent">${fs.readFileSync('public/favicon.svg','utf8').replace(/<!--[\s\S]*?-->/,'').replace('<svg ','<svg width="512" height="512" ')}</body></html>`);
await p.screenshot({ path: 'docs/appsumo/images/logo-512.png', omitBackground: true });
await b.close();
