// Builds the AppSumo horizontal logo (transparent PNG, 5:1). Run from the repo root.
import pw from '/opt/node22/lib/node_modules/playwright/index.js';
import fs from 'fs';
const svg = fs.readFileSync('public/favicon.svg', 'utf8').replace(/<!--[\s\S]*?-->/, '').replace('<svg ', '<svg width="200" height="200" ');
const b = await pw.chromium.launch();
const p = await b.newPage({ viewport: { width: 1200, height: 240 } });
await p.setContent(`<html><body style="margin:0;background:transparent"><div style="height:240px;display:flex;align-items:center;gap:36px;padding:0 20px;font-family:Inter,Segoe UI,Helvetica,Arial,sans-serif;font-weight:800;font-size:104px;letter-spacing:-.02em;color:#0f1210;white-space:nowrap">${svg}Protected Central</div></body></html>`);
const w = await p.evaluate(() => document.querySelector('div').scrollWidth);
await p.setViewportSize({ width: Math.max(w + 20, 1000), height: 240 });
await p.screenshot({ path: 'docs/appsumo/images/logo-horizontal.png', omitBackground: true });
await b.close();
