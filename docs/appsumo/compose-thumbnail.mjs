// Builds the YouTube thumbnail (1280x720 JPG) for the launch video. Run from the repo root.
import pw from '/opt/node22/lib/node_modules/playwright/index.js';
import fs from 'fs';
const svg = fs.readFileSync('public/favicon.svg', 'utf8').replace(/<!--[\s\S]*?-->/, '').replace('<svg ', '<svg width="64" height="64" ');
const shot = 'data:image/webp;base64,' + fs.readFileSync('public/site/reel/ap-diagram.webp').toString('base64');
const board = 'data:image/webp;base64,' + fs.readFileSync('public/site/reel/hero-board.webp').toString('base64');
const b = await pw.chromium.launch();
const p = await b.newPage({ viewport: { width: 1280, height: 720 } });
await p.setContent(`<html><body style="margin:0;width:1280px;height:720px;overflow:hidden;position:relative;font-family:Inter,Segoe UI,Helvetica,Arial,sans-serif;background:radial-gradient(900px 600px at 95% 100%,#2a3d12 0%,#0f1210 65%)">
 <div style="position:absolute;right:-170px;top:120px;width:900px;transform:rotate(-6deg);border-radius:18px;overflow:hidden;box-shadow:0 30px 80px rgba(0,0,0,.6),0 0 0 3px #c8f24d;background:#fff"><img src="${board}" style="width:100%;display:block"></div>
 <div style="position:absolute;right:120px;top:400px;width:560px;height:400px;transform:rotate(-6deg);border-radius:14px;overflow:hidden;box-shadow:0 24px 60px rgba(0,0,0,.6),0 0 0 3px #8fd9c4;background:#fff"><img src="${shot}" style="width:100%;display:block;margin-top:-40px"></div>
 <div style="position:absolute;left:0;top:0;bottom:0;width:760px;background:linear-gradient(90deg,#0f1210 62%,rgba(15,18,16,0))"></div>
 <div style="position:absolute;left:60px;top:52px;display:flex;align-items:center;gap:18px;color:#fff;font-size:38px;font-weight:800;letter-spacing:-.01em">${svg}Protected Central</div>
 <div style="position:absolute;left:60px;top:190px;color:#fff;font-weight:900;font-size:112px;line-height:.98;letter-spacing:-.035em">Describe it.<br><span style="color:#c8f24d">AI builds it.</span><br>It runs.</div>
 <div style="position:absolute;left:60px;bottom:58px;display:inline-block;background:#c8f24d;color:#0f1210;font-weight:800;font-size:34px;padding:12px 24px;border-radius:12px">AI CRM + marketing on autopilot</div>
</body></html>`);
await p.waitForTimeout(200);
await p.screenshot({ path: 'docs/appsumo/images/youtube-thumbnail.jpg', type: 'jpeg', quality: 90 });
await b.close();
