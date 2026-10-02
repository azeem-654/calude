// Proves the site's film steps down on a slow line and keeps playing, and back up.
// Playwright's Chromium has no H.264, so the stream's segments are swapped for
// a VP9 copy of the same ladder (README, "Checking the switching").
import pw from '/opt/node22/lib/node_modules/playwright/index.js';
const B = 'http://localhost:8787';
const MASTER = `#EXTM3U
#EXT-X-VERSION:7
#EXT-X-INDEPENDENT-SEGMENTS
#EXT-X-STREAM-INF:BANDWIDTH=1000000,RESOLUTION=1920x1080,CODECS="vp09.00.40.08,opus"
/site/launch/hlstest/1080/index.m3u8
#EXT-X-STREAM-INF:BANDWIDTH=580000,RESOLUTION=1280x720,CODECS="vp09.00.31.08,opus"
/site/launch/hlstest/720/index.m3u8
#EXT-X-STREAM-INF:BANDWIDTH=320000,RESOLUTION=854x480,CODECS="vp09.00.30.08,opus"
/site/launch/hlstest/480/index.m3u8
#EXT-X-STREAM-INF:BANDWIDTH=190000,RESOLUTION=640x360,CODECS="vp09.00.21.08,opus"
/site/launch/hlstest/360/index.m3u8
`;
const b = await pw.chromium.launch();
const ctx = await b.newContext({ viewport: { width: 1600, height: 900 }, deviceScaleFactor: 2 });
const p = await ctx.newPage();
const errs = []; p.on('pageerror', e => errs.push(String(e)));
const csp = []; p.on('console', m => { if (/Content Security Policy|Refused/.test(m.text())) csp.push(m.text().slice(0, 140)); });
await p.route('**/site/launch/hls/master.m3u8', r => r.fulfill({ status: 200, contentType: 'application/vnd.apple.mpegurl', body: MASTER }));
const log = [];
const t0 = Date.now();
p.on('request', r => { const m = r.url().match(/hlstest\/(\d+)\/(s\d+)\.m4s/); if (m) log.push([((Date.now() - t0) / 1000).toFixed(1), m[1], m[2]]); });
const cdp = await ctx.newCDPSession(p);
await cdp.send('Network.enable');
const net = kbps => cdp.send('Network.emulateNetworkConditions', { offline: false, latency: 40, downloadThroughput: kbps < 0 ? -1 : kbps * 125, uploadThroughput: -1 });
await p.goto(B + '/', { waitUntil: 'load' });
await p.evaluate(() => document.querySelector('#film').scrollIntoView());
const state = () => p.evaluate(() => { const v = document.querySelector('.dc-film-video'); return { mode: v.dataset.stream, t: +v.currentTime.toFixed(1), paused: v.paused, h: v.videoHeight, ready: v.readyState }; });
const phase = async (name, secs) => {
  const s0 = await state(); const n0 = log.length;
  let stalls = 0; const iv = setInterval(async () => { try { const s = await state(); if (s.ready < 3) stalls++; } catch {} }, 500);
  await p.waitForTimeout(secs * 1000); clearInterval(iv);
  const s1 = await state();
  const rungs = log.slice(n0).map(l => l[1]);
  console.log(`${name.padEnd(22)} mode=${s1.mode} played ${s0.t}→${s1.t}s, picture ${s1.h}p, rungs fetched [${rungs.join(',')}], half-seconds without enough data: ${stalls}`);
  return { s0, s1, rungs };
};
await net(-1);
const fast = await phase('fast line', 12);
await net(450);
const slow = await phase('slow line (450 kb/s)', 45);
await net(-1);
const back = await phase('fast again', 40);
console.log('pageerrors', errs.length, 'csp', csp.length, csp[0] ?? '');
const ok = fast.rungs.includes('1080') && slow.rungs.slice(-3).every(r => +r <= 480) && slow.s1.t - slow.s0.t > 14 && back.rungs.slice(-2).some(r => +r >= 720) && !errs.length && !csp.length;
console.log(ok ? 'ABR OK' : 'ABR BAD');
await b.close();
