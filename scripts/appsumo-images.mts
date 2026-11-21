/**
 * The AppSumo listing's gallery images (owner, 2026-11-21: "image assets …
 * super attractive"), 1280×720 drawn at 2× → marketing/appsumo/images/*.png.
 *
 *   npx tsx scripts/appsumo-images.mts
 *
 * Every screen in them is a frame of the real app from the demo recordings
 * (/tmp/site-clips-master, scripts/site-clips.mts), cropped above the
 * recorder's captions — nothing drawn to look like the app. The recordings
 * are a sample agency, so each image says "Real app · sample workspace": the
 * revenue and counts on those screens are the sample's, and a buyer must not
 * read them as results. The tier card's numbers come from lib/allowances.ts,
 * the one table the plans live in. No AI Shorts, video editing or shop: they
 * are not in the deal.
 */
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import pw from '/opt/node22/lib/node_modules/playwright/index.js';
import { PLAN_DEFS } from '../worker/src/lib/allowances';

const MASTER = '/tmp/site-clips-master';
const OUT = 'marketing/appsumo/images';
const WORK = '/tmp/appsumo-images';
const FF = process.env.FFMPEG || '/usr/bin/ffmpeg';
fs.mkdirSync(OUT, { recursive: true });
fs.mkdirSync(WORK, { recursive: true });

/* A frame of a recording, cropped to the app above the caption band. */
const frame = (id: string, at: number, name: string, h = 680): string => {
  const f = `${WORK}/${name}.png`;
  if (!fs.existsSync(`${MASTER}/${id}.mp4`)) throw new Error(`not recorded yet: ${id} (scripts/site-clips.mts)`);
  execFileSync(FF, ['-y', '-loglevel', 'error', '-ss', String(at), '-i', `${MASTER}/${id}.mp4`, '-frames:v', '1', '-vf', `crop=1280:${h}:0:0`, f]);
  return `data:image/png;base64,${fs.readFileSync(f).toString('base64')}`;
};
const face = `data:image/webp;base64,${fs.readFileSync('public/protron/robot-384.webp').toString('base64')}`;
const mark = fs.readFileSync('public/favicon.svg', 'utf8');
const n = (v: number) => v.toLocaleString('en-US');

type Slide = { name: string; eyebrow: string; title: string; sub: string; chips?: string[]; shots: string[]; layout?: 'one' | 'two' | 'face' };

const S: Slide[] = [
  { name: '01-hero', layout: 'face', eyebrow: 'Lifetime deal', title: 'Your <em>AI Live Business Manager</em>',
    sub: 'Describe your business once. It builds the workflows, finds the leads, writes the emails — and keeps improving them every day.',
    chips: ['AI Autopilot', 'AI Prospecting', 'CRM & campaigns', 'Websites & funnels'], shots: [frame('film-ap-board', 38, 'board')] },
  { name: '02-keeps-watch', layout: 'two', eyebrow: 'Always on', title: 'It notices what <em>isn’t working</em>',
    sub: 'Every campaign checked every hour. Low replies or failing sends are flagged with the fix — nothing changes until you approve.',
    chips: ['Flags low replies', 'Writes the fix', 'You approve'], shots: [frame('film-ap-watch', 14, 'watch'), frame('film-ap-watch', 41, 'chat')] },
  { name: '03-autopilot', layout: 'two', eyebrow: 'AI Autopilot', title: 'Describe it. <em>Approve the blueprint.</em>',
    sub: 'A conversation, not a setup wizard: it asks only what it still needs, shows exactly what it will build, then builds it.',
    chips: ['Plain-English setup', 'Read before it runs', 'Runs every 5 minutes'], shots: [frame('film-ap-new', 30, 'chatnew'), frame('film-ap-new', 122, 'blueprint')] },
  { name: '04-prospecting', eyebrow: 'AI Prospecting', title: 'New, checked leads <em>every day</em>',
    sub: 'Say who you sell to. It searches live, reads each business’s own website for the address it publishes, and checks it before you send.',
    chips: ['One sentence', 'Every address checked', 'Daily, on its own'], shots: [frame('clip-prospecting', 25, 'prospects')] },
  { name: '05-workflows', eyebrow: 'Workflows', title: 'Automations you can <em>actually read</em>',
    sub: 'Every fork labelled Yes or No. Try any step on a sample contact before it runs — or describe a new one in a sentence.',
    chips: ['Visual canvas', 'Dry-run any step', 'Written by AI'], shots: [frame('film-ap-inside', 14, 'canvas')] },
  { name: '06-websites', layout: 'two', eyebrow: 'Websites & funnels', title: 'Modern sites, <em>in each client’s name</em>',
    sub: 'Whole-site templates and funnels in the business’s name and colours, edited on the page itself, published in a click.',
    chips: ['Modern templates', 'Edit on the page', 'Your own domain'], shots: [frame('film-ap-sites', 13, 'funnels'), frame('clip-websites', 30, 'editor')] },
  { name: '07-campaigns', eyebrow: 'Email & sequences', title: 'Email from <em>your own mailbox</em>',
    sub: 'Campaigns and sequences from your own address and domain, stopped the moment someone replies — every figure counted from real sends.',
    chips: ['Your domain', 'Stops on reply', 'A/B tests'], shots: [frame('clip-campaigns', 12, 'campaigns')] },
  { name: '08-agency', eyebrow: 'Agencies', title: 'Every client, <em>under your brand</em>',
    sub: 'A sub-account per client with isolated data, your product name across the app, and your own sign-in address.',
    chips: ['White-label', 'Isolated client data', 'Client report links'], shots: [frame('clip-agency', 48, 'agency')] },
];

const css = `
*{box-sizing:border-box;margin:0}
body{width:1280px;height:720px;overflow:hidden;font-family:Inter,system-ui,sans-serif;color:#f4f6ef;
  background:radial-gradient(900px 600px at 85% 20%,rgba(200,242,77,.13),transparent 60%),radial-gradient(700px 500px at 0% 100%,rgba(124,92,255,.16),transparent 60%),#07090a}
.grid{position:absolute;inset:0;background-image:linear-gradient(rgba(255,255,255,.035) 1px,transparent 1px),linear-gradient(90deg,rgba(255,255,255,.035) 1px,transparent 1px);background-size:40px 40px;mask-image:radial-gradient(ellipse at 70% 40%,#000 20%,transparent 75%)}
.copy{position:absolute;left:64px;top:0;bottom:0;width:480px;display:flex;flex-direction:column;justify-content:center;gap:18px;z-index:2}
.brand{position:absolute;left:64px;top:44px;display:flex;align-items:center;gap:10px;font-weight:700;font-size:15px;letter-spacing:.01em;z-index:3}
.brand svg{width:26px;height:26px}
.eyebrow{display:inline-flex;align-self:flex-start;gap:8px;align-items:center;padding:6px 12px;border-radius:999px;border:1px solid rgba(200,242,77,.45);color:#c8f24d;font-size:13px;font-weight:700;letter-spacing:.12em;text-transform:uppercase;background:rgba(200,242,77,.07)}
h1{font-size:50px;line-height:1.04;letter-spacing:-.025em;font-weight:800}
h1 em{font-style:normal;background:linear-gradient(90deg,#c8f24d,#7ee0a1);-webkit-background-clip:text;background-clip:text;color:transparent}
p.sub{font-size:19px;line-height:1.5;color:#b9c0b4}
.chips{display:flex;flex-wrap:wrap;gap:8px;margin-top:4px}
.chips span{padding:8px 13px;border-radius:10px;background:rgba(255,255,255,.06);border:1px solid rgba(255,255,255,.1);font-size:14px;font-weight:600;color:#e6eadf}
.chips span::before{content:'✓';color:#c8f24d;margin-right:7px;font-weight:800}
.win{position:absolute;border-radius:14px;overflow:hidden;border:1px solid rgba(255,255,255,.14);box-shadow:0 40px 80px -20px rgba(0,0,0,.8),0 0 0 1px rgba(0,0,0,.4),0 0 60px -10px rgba(200,242,77,.18);background:#0d0f10}
.win .bar{height:26px;background:#15181a;display:flex;align-items:center;gap:6px;padding:0 12px;border-bottom:1px solid rgba(255,255,255,.07)}
.win .bar i{width:9px;height:9px;border-radius:50%;background:#3a3f43}.win .bar i:nth-child(1){background:#ff6159}.win .bar i:nth-child(2){background:#ffbd2e}.win .bar i:nth-child(3){background:#28c941}
.win img{display:block;width:100%}
.one{left:578px;top:118px;width:672px;transform:perspective(1800px) rotateY(-6deg);transform-origin:left center}
.a{left:572px;top:78px;width:600px;transform:perspective(1800px) rotateY(-6deg);transform-origin:left center}
.b{left:790px;top:330px;width:460px;transform:perspective(1800px) rotateY(-6deg);transform-origin:left center}
.facewrap{position:absolute;left:1075px;top:470px;width:200px;height:200px;border-radius:50%;z-index:3;background:radial-gradient(circle,rgba(124,92,255,.35),transparent 70%);display:grid;place-items:center}
.facewrap img{width:170px;height:170px;border-radius:50%;box-shadow:0 0 0 3px rgba(124,92,255,.55),0 0 40px rgba(124,92,255,.5)}
.tag{position:absolute;right:28px;bottom:22px;font-size:12px;color:#8b9287;letter-spacing:.03em;z-index:3}
.tiers{position:absolute;left:64px;right:64px;top:250px;display:grid;grid-template-columns:repeat(3,1fr);gap:18px}
.t{border-radius:18px;padding:22px 24px;background:rgba(255,255,255,.04);border:1px solid rgba(255,255,255,.1)}
.t.mid{border-color:rgba(200,242,77,.6);background:rgba(200,242,77,.06);box-shadow:0 0 50px -15px rgba(200,242,77,.35)}
.t h3{font-size:22px;margin-bottom:12px}.t h3 small{display:block;font-size:13px;color:#8b9287;font-weight:600;margin-top:3px}
.t p{display:flex;gap:10px;align-items:baseline;font-size:15px;color:#c5cbbf;padding:4px 0}.t p b{min-width:62px;text-align:right;color:#fff;font-size:18px}
`;

function page(s: Slide): string {
  const shots = s.layout === 'two'
    ? `<div class="win a"><div class="bar"><i></i><i></i><i></i></div><img src="${s.shots[0]}"></div><div class="win b"><div class="bar"><i></i><i></i><i></i></div><img src="${s.shots[1]}"></div>`
    : `<div class="win one"><div class="bar"><i></i><i></i><i></i></div><img src="${s.shots[0]}"></div>`;
  return `<!doctype html><html><head><meta charset="utf-8"><style>${css}</style></head><body><div class="grid"></div>
<div class="brand">${mark}<span>Protected Central</span></div>
<div class="copy"><span class="eyebrow">${s.eyebrow}</span><h1>${s.title}</h1><p class="sub">${s.sub}</p>
${s.chips ? `<div class="chips">${s.chips.map(c => `<span>${c}</span>`).join('')}</div>` : ''}</div>
${shots}${s.layout === 'face' ? `<div class="facewrap"><img src="${face}"></div>` : ''}
<div class="tag">Real app · sample workspace with example data</div></body></html>`;
}

function tiers(): string {
  const deal = PLAN_DEFS.filter(p => p.kind === 'deal');
  const rows: [string, (l: any) => string][] = [
    ['Business workspaces', l => n(l.autopilot_projects)],
    ['Workflows per workspace', l => n(l.workflows_per_project)],
    ['AI credits a month', l => n(l.ai_requests)],
    ['Prospects found a month', l => n(l.prospects_found)],
    ['AI-written emails a month', l => n(l.ai_emails)],
    ['Social posts a month', l => n(l.social_posts)],
    ['Client sub-accounts', l => n(l.sub_accounts)],
  ];
  return `<!doctype html><html><head><meta charset="utf-8"><style>${css}</style></head><body><div class="grid"></div>
<div class="brand">${mark}<span>Protected Central</span></div>
<div style="position:absolute;left:64px;top:104px;right:64px"><span class="eyebrow">AppSumo lifetime deal</span>
<h1 style="margin-top:16px">Pay once. <em>Stack up to three codes.</em></h1></div>
<div class="tiers">${deal.map((p, i) => `<div class="t${i === 1 ? ' mid' : ''}"><h3>${i + 1} code${i ? 's' : ''}<small>${i === 1 ? 'For growing teams' : i === 2 ? 'For agencies' : 'For one business'}</small></h3>${rows.map(([k, f]) =>
    `<p><b>${f(p.limits)}</b><span>${k}</span></p>`).join('')}</div>`).join('')}</div>
<div class="tag">Refundable up to 60 days on AppSumo · numbers as the app gives them</div></body></html>`;
}

const b = await pw.chromium.launch();
const ctx = await b.newContext({ viewport: { width: 1280, height: 720 }, deviceScaleFactor: 2 });
const p = await ctx.newPage();
for (const [name, html] of [...S.map(s => [s.name, page(s)] as const), ['09-tiers', tiers()] as const]) {
  await p.setContent(html, { waitUntil: 'load' });
  await p.waitForTimeout(150);
  await p.screenshot({ path: path.join(OUT, `${name}.png`) });
  console.log(`${OUT}/${name}.png`);
}
await b.close();
