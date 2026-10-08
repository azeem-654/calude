/**
 * The site's slideshows read each screen (ShotReel). On a desktop: the whole
 * page fitted into the slide, then widened to the slide's full width (no
 * zoom past it), then travelled to the bottom — and on to the next slide
 * without scrolling back up. On a phone: the top of the page, travelled down.
 * The notes come up one at a time over both.
 *
 * The owner reported the zoom "not working". Their machine asks for reduced
 * motion, and the reel used to stand still for anybody who did — so this runs
 * with `reducedMotion: 'reduce'` as well as without, and fails if the tour
 * does not run, if a phone's picture is not the width of the column (the
 * hero's was narrower than every section's), or if the pause button does not
 * stop it.
 *
 *   VITE_BASE=/ npm run build && npx wrangler dev --local     (another terminal)
 *   npm run test:reeltour            SHOTS=/some/dir to keep screenshots
 */
import pw from '/opt/node22/lib/node_modules/playwright/index.js';
const B = process.env.BASE ?? 'http://localhost:8787';
const OUT = process.env.SHOTS ?? '';
const b = await pw.chromium.launch();
let bad = 0;
const ok = (name, cond, detail = '') => { console.log(`  ${cond ? '✓' : '✗'} ${name}${cond || !detail ? '' : `\n      ${detail}`}`); if (!cond) bad++; };

/** The transform on the hero's showing picture, as scale and vertical travel. */
const read = p => p.evaluate(() => {
  const img = document.querySelector('.dc-hero-shot .dc-reel-shot.on .dc-sr-img');
  const m = new DOMMatrix(getComputedStyle(img).transform);
  const shot = document.querySelector('.dc-hero-shot .dc-reel-shot.on').getBoundingClientRect();
  const prev = document.querySelector('.dc-hero-shot .dc-reel-shot[data-pos="-1"] .dc-sr-img');
  const pm = prev ? new DOMMatrix(getComputedStyle(prev).transform) : null;
  return { s: +m.a.toFixed(3), ty: Math.round(m.f), w: Math.round(shot.width), vw: innerWidth, note: document.querySelector('.dc-hero-shot .dc-sr-note')?.textContent ?? '', h: img.naturalHeight, nw: img.naturalWidth,
    at: [...document.querySelectorAll('.dc-hero-shot .dc-reel-shot')].findIndex(e => e.classList.contains('on')), prevTy: pm ? Math.round(pm.f) : 0 };
});

for (const [label, view, motion] of [
  ['desktop', { width: 1440, height: 900 }, 'no-preference'],
  ['desktop, reduced motion', { width: 1440, height: 900 }, 'reduce'],
  ['phone', { width: 390, height: 844 }, 'no-preference'],
  ['phone, reduced motion', { width: 390, height: 844 }, 'reduce'],
]) {
  console.log(label);
  const phone = view.width < 800;
  const ctx = await b.newContext({ viewport: view, reducedMotion: motion, isMobile: phone, hasTouch: phone, deviceScaleFactor: phone ? 2 : 1 });
  const p = await ctx.newPage();
  const errs = []; p.on('pageerror', e => errs.push(String(e)));
  await p.goto(`${B}/`, { waitUntil: 'networkidle' });
  await p.evaluate(() => document.querySelector('.dc-hero-shot').scrollIntoView({ block: 'center' }));
  await p.waitForFunction(() => document.querySelector('.dc-hero-shot .dc-reel-shot.on .dc-sr-img')?.naturalWidth > 0, null, { timeout: 15_000 });
  const start = await read(p);
  if (phone) ok('the screen opens at the top of the page', start.s === 1 && start.ty === 0, JSON.stringify(start));
  else ok('the screen opens whole: the complete page fitted in', start.s < 0.9 && start.ty === 0, JSON.stringify(start));
  if (!phone) ok('the slide is the full width of the strip', start.w >= start.vw * 0.9, JSON.stringify(start));
  ok('the picture is the whole page, taller than the window', start.h / start.nw > (phone ? 720 / 390 : 1200 / 1920) + 0.05, JSON.stringify(start));
  if (phone) ok('the picture is the width of the column', start.w >= start.vw * 0.82, JSON.stringify(start));
  if (OUT) await p.screenshot({ path: `${OUT}/tour-${label.replace(/\W+/g, '-')}-0.png` });

  /* Widened (desktop) and travelling down, with a note over it — never past full width. */
  let seen = { wide: false, over: false, down: false, note: '' };
  for (let i = 0; i < 40 && !(seen.down && seen.note && (phone || seen.wide)); i++) {
    await p.waitForTimeout(400);
    const r = await read(p);
    if (r.s > 0.995 && r.ty === 0) seen.wide = true;
    if (r.s > 1.01) seen.over = true;
    if (r.ty < -40) seen.down = true;
    if (r.note) seen.note = r.note;
    if (i === 14 && OUT) await p.screenshot({ path: `${OUT}/tour-${label.replace(/\W+/g, '-')}-1.png` });
  }
  if (!phone) ok('it widens to the full width', seen.wide, JSON.stringify(seen));
  ok('it never zooms past the width', !seen.over, JSON.stringify(seen));
  ok('it travels down the page', seen.down, JSON.stringify(seen));
  ok('the notes come up over the screen', seen.note.length > 10, JSON.stringify(seen));

  /* A desktop moves on from the bottom: the next slide opens whole, and the one just read never scrolls back up. */
  if (!phone) {
    const was = (await read(p)).at;
    let next = null, low = 0, back = false;
    for (let i = 0; i < 80 && !next; i++) {
      await p.waitForTimeout(500);
      const r = await read(p);
      if (r.at !== was) { next = r; break; }
      low = Math.min(low, r.ty);
      if (low < -40 && r.ty > low + 40) back = true;
    }
    ok('it does not scroll back up before moving on', !back, `lowest ${low}`);
    ok('it moves on to the next slide', !!next, '');
    if (next) {
      ok('the slide just read stays at its bottom', next.prevTy < -40, JSON.stringify(next));
      await p.waitForTimeout(1200);
      const n2 = await read(p);
      ok('the next slide opens whole', n2.s < 0.9, JSON.stringify(n2));
    }
  }

  /* Paused, it stays where it is. */
  await p.locator('.dc-hero-shot').getByRole('button', { name: 'Pause the tour' }).click({ force: true });
  const a = await read(p); await p.waitForTimeout(2500); const c = await read(p);
  ok('pause stops it', a.ty === c.ty && a.s === c.s, `${JSON.stringify(a)} → ${JSON.stringify(c)}`);
  await p.locator('.dc-hero-shot').getByRole('button', { name: 'Play the tour' }).click({ force: true });
  ok('no page errors', !errs.length, errs.join('\n'));
  ok('no sideways scroll', await p.evaluate(() => document.documentElement.scrollWidth - innerWidth) === 0);
  await ctx.close();
}
console.log(bad ? `\n${bad} failed` : '\nall passed');
await b.close();
process.exit(bad ? 1 : 0);
