/**
 * The public site fits the screen it is on.
 *
 * On 2026-09-30 the owner opened protectedcentral.com on a laptop whose
 * browser showed about 1340×590, and the launch film (sized by width alone,
 * 754px tall) and the hero's picture (756px tall everywhere) were both cut
 * off. Then, once both fitted, that they sat in the middle with dark bands
 * either side, and that the film should be one scroll from the top. This
 * drives fourteen real window sizes — short laptops, desktops, a 4K screen,
 * tablets both ways, small and large phones, phones on their side — and fails
 * any size where:
 *
 *   - the film is not entirely visible when scrolled to, is cropped by more
 *     than its 22% budget, or — on the owner's laptop sizes — covers less than
 *     90% of the window's width,
 *   - on a laptop or desktop (landscape, at least 1000×420): the hero's words
 *     are not all on the first screen with the film starting under them (at
 *     least 80px of it showing), or the wheel does not step top → film,
 *     centred under the nav within 12px, and back up, then on past the film.
 *     Since 2026-11-21 the film is the hero's only picture (the owner asked
 *     for one video at the top), so there is no separate hero picture stop,
 * *   - the page scrolls sideways, or throws.
 *
 *   VITE_BASE=/ npm run build && npx wrangler dev --local     (another terminal)
 *   npm run test:sitefit          SHOTS=/some/dir to keep screenshots
 */
import pw from '/opt/node22/lib/node_modules/playwright/index.js';
const B = process.env.BASE ?? 'http://localhost:8787';
const OUT = process.env.SHOTS ?? '';
const sizes = (process.argv[2] ?? '1340x590,1093x500,1366x657,1280x720,1440x780,1536x730,1920x960,2560x1300,1024x700,820x1180,768x1024,390x844,360x640,844x390,667x375').split(',');
/* The owner's laptop and the desktops either side of it: the film must use
   the width there, not sit in the middle of it. */
const WIDE_FILM = new Set(['1340x590', '1366x657', '1280x720', '1440x780', '1536x730', '1920x960']);
const b = await pw.chromium.launch();
let bad = 0;

/** Wait for a smooth scroll to finish: the position stops changing for a
    while. On a busy machine a headless browser can sit on one frame of a
    smooth scroll for half a second, so a short pause is not the end. */
async function settle(p) {
  await p.waitForTimeout(300);
  let last = -1, same = 0;
  for (let i = 0; i < 80; i++) {
    await p.waitForTimeout(100);
    const y = await p.evaluate(() => scrollY);
    same = y === last ? same + 1 : 0;
    if (same >= 8) return y;
    last = y;
  }
  return last;
}

for (const sz of sizes) {
  const [w, h] = sz.split('x').map(Number);
  const desk = w >= 1000 && w > h && h >= 420;
  const p = await b.newPage({ viewport: { width: w, height: h } });
  const errs = []; p.on('pageerror', e => errs.push(String(e)));
  /* 'load', not 'networkidle': the film streams and the module demos load as
     they near the screen, so at a tablet's size the network was never quiet
     and the run stopped on a timeout with every size before it fitting. */
  await p.goto(`${B}/`, { waitUntil: 'load' });
  await p.waitForTimeout(3500);
  const navH = await p.evaluate(() => document.querySelector('.dc-nav').getBoundingClientRect().height);

  /* As the page opens. */
  if (OUT) await p.screenshot({ path: `${OUT}/top-${sz}.png` });
  const first = await p.evaluate((navH) => {
    const copy = document.querySelector('.dc-hero-copy').getBoundingClientRect();
    const film = document.querySelector('.dc-film-frame').getBoundingClientRect();
    return { words: copy.top >= navH - 1 && copy.bottom <= innerHeight + 1, peek: innerHeight - film.top >= 80, copyB: Math.round(copy.bottom), steps: document.documentElement.classList.contains('dc-snap') };
  }, navH);
  const firstOk = !desk || (first.words && first.peek && first.steps);

  await p.evaluate(() => document.querySelector('#film').scrollIntoView());
  await p.waitForTimeout(600);
  if (OUT) await p.screenshot({ path: `${OUT}/film-${sz}.png` });
  const film = await p.evaluate((navH) => {
    const f = document.querySelector('.dc-film-frame').getBoundingClientRect();
    const v = document.querySelector('.dc-film-video');
    /* object-fit: cover scales a 16:9 film to the frame's width when the
       frame is wider than 16:9, and cuts the difference top and bottom. */
    const crop = Math.max(0, 1 - f.height / (f.width * 9 / 16));
    return { w: Math.round(f.width), h: Math.round(f.height), top: Math.round(f.top), bottom: Math.round(f.bottom), cover: f.width / innerWidth, crop, visible: f.top >= navH - 1 && f.bottom <= innerHeight + 1, file: v.dataset.stream ?? 'none' };
  }, navH);
  const filmOk = film.visible && film.crop <= 0.221 && (!WIDE_FILM.has(sz) || film.cover >= 0.9);

  /* One notch of a wheel, from a fresh load, where the page steps. */
  let step = 'n/a', stepOk = true;
  if (first.steps) {
    await p.evaluate(() => scrollTo(0, 0));
    await settle(p);
    await p.mouse.move(w / 2, h / 2);
    /** How far the centre of `sel` is from the middle of the area under the nav. */
    const off = sel => p.evaluate(([sel, navH]) => {
      const f = document.querySelector(sel).getBoundingClientRect();
      return Math.round((f.top + f.bottom) / 2 - (navH + innerHeight) / 2);
    }, [sel, navH]);
    const notch = async dy => { await p.waitForTimeout(900); await p.mouse.wheel(0, dy); return settle(p); };
    await p.mouse.wheel(0, 120);
    const yFilm = await settle(p);
    const offFilm = await off('.dc-film-frame');
    const yTop = await notch(-120);
    const yFilm2 = await notch(120);
    const yPast = await notch(120);
    stepOk = Math.abs(offFilm) <= 12 && yTop <= 2 && Math.abs(yFilm2 - yFilm) <= 12 && yPast > yFilm + 40;
    step = `film@${yFilm} off ${offFilm}px, up→${yTop}, down→${yFilm2}, on→${yPast}`;
  }

  const overflow = await p.evaluate(() => document.documentElement.scrollWidth - innerWidth);
  const ok = firstOk && filmOk && stepOk && overflow === 0 && !errs.length;
  if (!ok) bad++;
  console.log(`${ok ? 'OK ' : 'BAD'} ${sz.padEnd(10)} nav ${navH} | first screen ${desk ? `words=${first.words} peek=${first.peek}` : '-'} | film ${film.w}×${film.h} (${Math.round(film.cover * 100)}% wide, crop ${Math.round(film.crop * 100)}%) ${film.top}-${film.bottom} visible=${film.visible} ${film.file} | step ${step} | overflow ${overflow} errs ${errs.length}`);
  await p.close();
}
console.log(bad ? `${bad} size(s) wrong` : 'all sizes fit');
await b.close();
process.exit(bad ? 1 : 0);
