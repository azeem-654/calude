/**
 * Title cards for a demonstration film, rendered without the app.
 *
 *   npx tsx scripts/film-cards.mts marketing/voice/scripts/appsumo-cards.json
 *
 * Writes each card as a chapter master in /tmp/site-clips-master/<id>.mp4, so
 * scripts/voiceover.mts (and demo-film.mts) join it like a recorded chapter.
 * The look is site-clips' own title card (clip-frame.mts `.cf-card`) over a
 * blurred frame of the real board, faded in and out on dark like every
 * chapter.
 *
 * Why not a site-clips recipe: those need the whole recorder (wrangler, a
 * seeded workspace) for a picture with no app in it. The `tiers` card reads
 * the AppSumo deal's numbers from lib/allowances.ts, the one table the plans
 * live in, so the film cannot promise a number the app does not give.
 */
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import pw from '/opt/node22/lib/node_modules/playwright/index.js';
const { chromium } = pw;
import { PLAN_DEFS } from '../worker/src/lib/allowances';

const MASTER = '/tmp/site-clips-master';
const FF = process.env.FFMPEG || '/usr/bin/ffmpeg';
type Card = { id: string; eyebrow: string; title: string; sub?: string; seconds?: number; tiers?: boolean; note?: string; background?: [string, number] };

const n = (v: number) => v.toLocaleString('en-US');
function tiersHtml(): string {
  const deal = PLAN_DEFS.filter(p => p.kind === 'deal');
  const rows: [string, (l: any) => string][] = [
    ['Business workspaces', l => n(l.autopilot_projects)],
    ['Workflows per business workspace', l => n(l.workflows_per_project)],
    ['AI requests a month', l => n(l.ai_requests)],
    ['Social posts a month', l => n(l.social_posts)],
    ['Blog articles a month', l => n(l.blog_articles)],
    ['Prospects found a month', l => n(l.prospects_found)],
    ['Client sub-accounts', l => n(l.sub_accounts)],
    ['Branded sign-in addresses', l => n(l.login_addresses)],
  ];
  return `<div class="tiers">${deal.map((p, i) => `<div class="t"><h3>${i + 1} code${i ? 's' : ''}</h3>${rows.map(([k, f]) =>
    `<p><b>${f(p.limits)}</b><span>${k}</span></p>`).join('')}<p class="sup">${p.support.replace(/^In-app help: /, 'Support: ')}</p></div>`).join('')}</div>`;
}

const css = `
*{box-sizing:border-box;margin:0}body{width:1280px;height:800px;overflow:hidden;font-family:Inter,system-ui,sans-serif;background:#0d0a09}
.bg{position:absolute;inset:-40px;background-size:cover;background-position:center;filter:blur(14px) brightness(.32) saturate(.9)}
.card{position:absolute;inset:0;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:14px;text-align:center;padding:0 80px;
  background:radial-gradient(ellipse at center,rgba(26,18,14,.55),rgba(10,8,7,.85))}
em{font-style:normal;color:#ff9a5c;font-size:18px;font-weight:800;letter-spacing:.16em;text-transform:uppercase}
b.h{color:#fff;font-size:54px;line-height:1.08;font-weight:800;letter-spacing:-.02em;max-width:1000px}
span.s{color:#d8cfc8;font-size:22px;line-height:1.4;font-weight:500;max-width:880px}
i.bar{width:120px;height:4px;border-radius:4px;background:linear-gradient(90deg,#ffb37a,#ff6a2b);box-shadow:0 0 18px rgba(255,122,61,.7)}
.small b.h{font-size:40px}
.tiers{display:flex;gap:14px;margin-top:10px}
.t{width:362px;padding:16px 18px;border-radius:16px;background:rgba(20,15,13,.82);border:1px solid rgba(255,154,92,.35);text-align:left}
.t h3{color:#ffb37a;font-size:20px;font-weight:800;margin-bottom:8px}
.t p{display:flex;gap:10px;align-items:baseline;color:#d8cfc8;font-size:15px;line-height:1.75}
.t p b{color:#fff;font-size:17px;min-width:52px;text-align:right}
.t p.sup{margin-top:6px;font-size:13px;color:#bfb4ad;line-height:1.4}
.note{color:#bfb4ad;font-size:15px;margin-top:6px}
`;

async function main() {
  const file = process.argv[2];
  if (!file) { console.log('usage: film-cards.mts <cards.json>'); process.exit(2); }
  const cards: Card[] = JSON.parse(fs.readFileSync(file, 'utf8'));
  fs.mkdirSync(MASTER, { recursive: true });
  const tmp = '/tmp/film-cards';
  fs.mkdirSync(tmp, { recursive: true });
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
  for (const c of cards) {
    const [src, at] = c.background || ['film-ap-board', 3];
    const bg = `${tmp}/${src}-${at}.jpg`;
    if (!fs.existsSync(bg)) execFileSync(FF, ['-y', '-v', 'error', '-ss', String(at), '-i', `${MASTER}/${src}.mp4`, '-frames:v', '1', bg]);
    const html = `<style>${css}</style><div class="bg" style="background-image:url(data:image/jpeg;base64,${fs.readFileSync(bg).toString('base64')})"></div>
      <div class="card ${c.tiers ? 'small' : ''}"><em>${c.eyebrow}</em><b class="h">${c.title}</b><i class="bar"></i>${c.sub ? `<span class="s">${c.sub}</span>` : ''}
      ${c.tiers ? tiersHtml() : ''}${c.note ? `<div class="note">${c.note}</div>` : ''}</div>
`;
    await page.setContent(html);
    await page.evaluate(() => document.fonts.ready);
    const png = `${tmp}/${c.id}.png`;
    await page.screenshot({ path: png });
    const sec = c.seconds ?? 5.2;
    execFileSync(FF, ['-y', '-v', 'error', '-loop', '1', '-i', png, '-t', String(sec),
      '-vf', `fade=in:st=0:d=0.5,fade=out:st=${(sec - 0.5).toFixed(2)}:d=0.5,format=yuv420p`, '-r', '25',
      '-c:v', 'libx264', '-preset', 'medium', '-crf', '12', `${MASTER}/${c.id}.mp4`]);
    console.log(`${c.id} (${sec}s)`);
  }
  await browser.close();
}
main().catch(e => { console.error(e); process.exit(1); });
