/**
 * The public site fits the screen it is on.
 *
 * On 2026-09-30 the owner opened protectedcentral.com on a laptop whose
 * browser showed about 1340×590, and the launch film (sized by width alone,
 * 754px tall) and the hero's picture (756px tall everywhere) were both cut
 * off. This drives fourteen real window sizes — short laptops, desktops, a 4K
 * screen, tablets both ways, small and large phones, phones on their side —
 * and fails any size where:
 *
 *   - the hero's picture does not fit on one screen under the nav (on a phone
 *     on its side: the picture itself, since the caption cannot also fit),
 *   - a decorative chip covers more than a sliver of it, or sits off screen,
 *   - the film is not entirely visible when scrolled to,
 *   - the page scrolls sideways, or throws.
 *
 *   VITE_BASE=/ npm run build && npx wrangler dev --local     (another terminal)
 *   npm run test:sitefit          SHOTS=/some/dir to keep screenshots
 */
import pw from '/opt/node22/lib/node_modules/playwright/index.js';
const B = process.env.BASE ?? 'http://localhost:8787';
const OUT = process.env.SHOTS ?? '';
const sizes = (process.argv[2] ?? '1340x590,1366x657,1280x720,1440x780,1536x730,1920x960,2560x1300,1024x700,820x1180,768x1024,390x844,360x640,844x390,667x375').split(',');
const b = await pw.chromium.launch();
let bad = 0;
for (const sz of sizes) {
  const [w, h] = sz.split('x').map(Number);
  const p = await b.newPage({ viewport: { width: w, height: h } });
  const errs = []; p.on('pageerror', e => errs.push(String(e)));
  await p.goto(`${B}/`, { waitUntil: 'networkidle' });
  await p.waitForTimeout(3500);
  const navH = await p.evaluate(() => document.querySelector('.dc-nav').getBoundingClientRect().height);
  await p.evaluate(() => {
    const short = innerHeight <= 500 && innerWidth > innerHeight;
    const s = document.querySelector(short ? '.dc-hero-shot' : '.dc-hero-stage');
    scrollTo(0, s.getBoundingClientRect().top + scrollY - document.querySelector('.dc-nav').getBoundingClientRect().height);
  });
  await p.waitForTimeout(600);
  if (OUT) await p.screenshot({ path: `${OUT}/stage-${sz}.png` });
  const hero = await p.evaluate(() => {
    const st = document.querySelector('.dc-hero-stage').getBoundingClientRect();
    const shot = document.querySelector('.dc-hero-shot').getBoundingClientRect();
    const chips = [...document.querySelectorAll('.dc-hero-chips .aps-chip')].map(c => c.getBoundingClientRect()).filter(r => r.width);
    const cover = chips.map(c => Math.max(0, Math.min(c.right, shot.right) - Math.max(c.left, shot.left)));
    const offscreen = chips.some(c => c.left < 0 || c.right > innerWidth);
    /* On a phone on its side the promise is the picture itself, not the
       caption under it. */
    const pic = document.querySelector('.dc-hero-shot .dc-reel-stage').getBoundingClientRect();
    const fits = innerHeight <= 500 && innerWidth > innerHeight ? pic.bottom <= innerHeight + 1 && pic.top >= 0 : st.bottom <= innerHeight + 1;
    return { stageH: Math.round(st.height), shotW: Math.round(shot.width), fits, chips: chips.length, maxCover: Math.round(Math.max(0, ...cover)), offscreen };
  });
  await p.evaluate(() => document.querySelector('#film').scrollIntoView());
  await p.waitForTimeout(600);
  if (OUT) await p.screenshot({ path: `${OUT}/film-${sz}.png` });
  const film = await p.evaluate((navH) => {
    const f = document.querySelector('.dc-film-frame').getBoundingClientRect();
    const v = document.querySelector('.dc-film-video');
    return { h: Math.round(f.height), top: Math.round(f.top), bottom: Math.round(f.bottom), visible: f.top >= navH - 1 && f.bottom <= innerHeight + 1, file: [...v.querySelectorAll('source')][0]?.src.split('/').pop() };
  }, navH);
  const overflow = await p.evaluate(() => document.documentElement.scrollWidth - innerWidth);
  const ok = hero.fits && film.visible && overflow === 0 && hero.maxCover <= 40 && !hero.offscreen && !errs.length;
  if (!ok) bad++;
  console.log(`${ok ? 'OK ' : 'BAD'} ${sz.padEnd(10)} nav ${navH} | hero stage ${hero.stageH}px fits=${hero.fits} shotW=${hero.shotW} chips=${hero.chips} cover=${hero.maxCover}px off=${hero.offscreen} | film ${film.h}px ${film.top}-${film.bottom} visible=${film.visible} ${film.file} | overflow ${overflow} errs ${errs.length}`);
  await p.close();
}
console.log(bad ? `${bad} size(s) wrong` : 'all sizes fit');
await b.close();
process.exit(bad ? 1 : 0);
