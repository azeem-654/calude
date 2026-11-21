/**
 * The pointer drawn into every site recording (owner's brief of 2026-11-19:
 * "a 3D, interactive-looking pointer", docs/claude/site-demos-overhaul.md).
 *
 * A headless capture shows no system cursor, so the recorder draws one into
 * the page that follows the real mouse events. It is a small solid object
 * rather than a flat arrow: a lit face with a bevelled edge beneath it, a rim
 * light, and a shadow on the page under it. It reacts the way a hand-held
 * object does —
 *
 *  - moving, it lifts: the shadow drops further away, softens and trails
 *    behind the direction of travel, and the pointer tilts into the move;
 *  - over something clickable it rises a little and takes an ember edge;
 *  - pressed, it sinks onto the page (shadow tucks in) and ripples ember;
 *  - over a text field, or while typing into one, it becomes an I-beam
 *    built the same way.
 *
 * Speed is measured per mouse event, not per millisecond, on purpose: the
 * recorder plans a move as one event every 16 ms but a real page over
 * DevTools takes about three times as long, and the clip is played back at
 * the planned pace (site-clips.mts `timed`). Pixels per event are what the
 * viewer sees; pixels per real millisecond would make every move look a third
 * as fast as it plays. Only the settling after a move uses the clock, and
 * pauses play back in real time.
 *
 * `data-noinvert` because the dark theme inverts <html> (index.css) and sets
 * this element's own `filter` to undo it, which is also why every shadow and
 * glow here sits on an inner element: a filter on #clip-cursor is overwritten.
 *
 * Runs in the page (addInitScript), so it may use nothing from this module's
 * scope. It also hides the trial bar and help corner, which are not part of
 * any demo, and the app's notices unless a recipe asks for them
 * (`data-clip-toasts`, site-clips.mts `toasts`).
 */
export const CLIP_CURSOR = () => {
  const put = () => {
    if (document.getElementById('clip-cursor')) return;
    const st = document.createElement('style');
    st.textContent = `
      #clip-cursor{position:fixed;left:0;top:0;z-index:2147483647;pointer-events:none;will-change:transform}
      #clip-cursor .cc-sh,#clip-cursor .cc-bd{position:absolute;left:0;top:0;transform-origin:0 0;transition:transform .07s linear,filter .12s linear,opacity .12s linear}
      #clip-cursor .cc-bd{transition:transform .07s linear,filter .16s ease-out}
      #clip-cursor .cc-ar,#clip-cursor .cc-ib{position:absolute;display:block;transition:opacity .12s ease-out,transform .14s ease-out}
      #clip-cursor .cc-ar{left:-2.6px;top:-2.6px}
      #clip-cursor .cc-ib{left:-10.4px;top:-18.2px;opacity:0;transform:scale(.6)}
      #clip-cursor.text .cc-ar{opacity:0;transform:scale(.6)}
      #clip-cursor.text .cc-ib{opacity:1;transform:none}
      #clip-cursor .cc-rp{position:absolute;left:0;top:0;width:0;height:0}
      #clip-cursor .cc-rp b{position:absolute;left:-30px;top:-30px;width:60px;height:60px;border-radius:50%;box-sizing:border-box}
      #clip-cursor .cc-rp b:nth-child(1){background:radial-gradient(circle,rgba(255,255,255,.6) 0,rgba(255,170,120,.3) 40%,rgba(255,122,61,0) 70%);animation:ccflash .42s ease-out forwards}
      #clip-cursor .cc-rp b:nth-child(2){border:2.5px solid #fff;box-shadow:0 0 0 2px rgba(255,122,61,.9),0 0 10px rgba(255,122,61,.6);animation:ccring .62s cubic-bezier(.2,.7,.3,1) forwards}
      #clip-cursor .cc-rp b:nth-child(3){border:1.5px solid rgba(255,255,255,.85);box-shadow:0 0 0 1.5px rgba(255,122,61,.7);animation:ccring .62s .09s cubic-bezier(.2,.7,.3,1) both}
      @keyframes ccflash{0%{opacity:1;transform:scale(.25)}100%{opacity:0;transform:scale(1)}}
      @keyframes ccring{0%{opacity:.95;transform:scale(.18)}100%{opacity:0;transform:scale(1.25)}}
      html:not([data-clip-toasts]) .toast-stack,[data-trialbar],.trial-bar,html:not([data-clip-help]) [aria-label="Help"],[data-corner-help]{display:none!important}`;
    document.documentElement.appendChild(st);

    /* The arrow's outline, tip at (2,2) of its 26×32 box; the I-beam's, centre
       at (8,14) of 18×30; both drawn at 1.3× — the site shows a 1280-wide clip
       at about 700 px, where a life-size pointer is a speck. Each is drawn three times: the bevel (the same shape
       pushed down-right, darker), the lit face, and a rim light along the
       edges facing the light (top-left). */
    const ARROW = 'M2 2 L2 23.8 L8.1 18.4 L12.1 26.9 L16.2 25 L12.3 16.75 L21.1 16.3 Z';
    const BEAM = 'M3.5 3 H12.5 V5.6 H9.4 V22.4 H12.5 V25 H3.5 V22.4 H6.6 V5.6 H3.5 Z';
    const solid = (id: string, d: string, w: number, h: number, rim: string) => `
      <defs>
        <linearGradient id="${id}f" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stop-color="#ffffff"/><stop offset=".5" stop-color="#eef1f5"/><stop offset="1" stop-color="#c3cad4"/>
        </linearGradient>
        <linearGradient id="${id}b" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stop-color="#6c7480"/><stop offset="1" stop-color="#2c3139"/>
        </linearGradient>
        <radialGradient id="${id}g" cx=".3" cy=".22" r=".5">
          <stop offset="0" stop-color="#fff" stop-opacity=".95"/><stop offset="1" stop-color="#fff" stop-opacity="0"/>
        </radialGradient>
        <clipPath id="${id}c"><path d="${d}"/></clipPath>
      </defs>
      <path d="${d}" transform="translate(1.3 1.8)" fill="url(#${id}b)" stroke="#0c0e12" stroke-width="1.4" stroke-linejoin="round"/>
      <path d="${d}" fill="url(#${id}f)" stroke="#0c0e12" stroke-width="1.4" stroke-linejoin="round"/>
      <rect width="${w}" height="${h}" fill="url(#${id}g)" clip-path="url(#${id}c)"/>
      <path d="${rim}" fill="none" stroke="#fff" stroke-width="1.1" stroke-linecap="round" stroke-linejoin="round" opacity=".9"/>`;
    const arrow = (fill: string) => `<svg class="cc-ar" width="34" height="42" viewBox="0 0 26 32">${fill === 'solid'
      ? solid('cca', ARROW, 26, 32, 'M3.25 5 L3.25 20.9 M3.9 4.1 L17.6 15.1')
      : `<path d="${ARROW}" fill="#000"/>`}</svg>`;
    const beam = (fill: string) => `<svg class="cc-ib" width="23" height="39" viewBox="0 0 18 30">${fill === 'solid'
      ? solid('ccb', BEAM, 18, 30, 'M4.5 4.1 H11.6 M7.7 6.6 V21.4')
      : `<path d="${BEAM}" fill="#000"/>`}</svg>`;

    const c = document.createElement('div');
    c.id = 'clip-cursor';
    c.setAttribute('data-noinvert', '');
    c.innerHTML = `<div class="cc-sh">${arrow('shadow')}${beam('shadow')}</div><div class="cc-bd">${arrow('solid')}${beam('solid')}</div>`;
    document.documentElement.appendChild(c);
    const sh = c.querySelector<HTMLElement>('.cc-sh')!;
    const bd = c.querySelector<HTMLElement>('.cc-bd')!;

    /* Where it was on the last page, so a navigation does not jump it back. */
    const at = (): number[] => { try { return JSON.parse(sessionStorage.getItem('clip-at') || '') as number[]; } catch { return [640, 420]; } };
    let [x, y] = at();
    let vx = 0, vy = 0, last = 0, down = false, hover = false, typing = 0;
    const clamp = (v: number, m: number) => Math.max(-m, Math.min(m, v));

    const EDIT = 'input:not([type=checkbox],[type=radio],[type=button],[type=submit],[type=reset],[type=range],[type=color],[type=file],[type=image]),textarea,[contenteditable=""],[contenteditable="true"]';
    const look = () => {
      const el = document.elementFromPoint(x, y) as HTMLElement | null;
      const cur = el ? getComputedStyle(el).cursor : 'auto';
      const field = cur === 'text' || (cur === 'auto' && !!el?.closest(EDIT));
      const ae = document.activeElement as HTMLElement | null;
      const keyed = Date.now() < typing && !!ae?.matches?.(EDIT);
      c.classList.toggle('text', field || keyed);
      hover = cur === 'pointer' && !field;
    };

    const draw = () => {
      const sp = Math.hypot(vx, vy);
      /* 0 at rest, 1 at a brisk move (~22 px a step). */
      const lift = down ? 0 : Math.min(1, sp / 22) * 0.85 + (hover ? 0.15 : 0);
      const ry = clamp(vx * 0.9, 20), rx = clamp(-vy * 0.9, 20), rz = clamp(vx * 0.22, 6);
      const scale = down ? 0.84 : 1 + lift * 0.07;
      bd.style.transform = `perspective(260px) rotateX(${rx.toFixed(2)}deg) rotateY(${ry.toFixed(2)}deg) rotateZ(${rz.toFixed(2)}deg) scale(${scale.toFixed(3)})`;
      bd.style.filter = hover && !down ? 'drop-shadow(0 0 1.5px rgba(255,122,61,.95)) drop-shadow(0 0 7px rgba(255,122,61,.55))' : 'none';
      /* The light is up and to the left: the shadow falls down-right, further
         and softer the higher the pointer is held, and is drawn out behind a
         fast move like a blur of travel. */
      const ang = Math.atan2(vy, vx) * 180 / Math.PI;
      const stretch = 1 + Math.min(1, sp / 22) * 0.5;
      const ox = down ? 1 : 3 + lift * 6 - vx * 0.35, oy = down ? 1.4 : 4 + lift * 8 - vy * 0.35;
      sh.style.transform = `translate(${ox.toFixed(2)}px,${oy.toFixed(2)}px) rotate(${ang.toFixed(1)}deg) scaleX(${stretch.toFixed(3)}) rotate(${(-ang).toFixed(1)}deg) scale(${scale.toFixed(3)})`;
      sh.style.filter = `blur(${(down ? 0.8 : 1.6 + lift * 3.2).toFixed(2)}px)`;
      sh.style.opacity = (down ? 0.55 : 0.5 - lift * 0.2).toFixed(3);
      c.style.transform = `translate(${x}px,${y}px)`;
    };

    /* After a move the pointer settles back onto the page over ~0.2 s. Only
       while it is settling: an idle loop that rewrote the same styles would
       still cost the screencast nothing, but there is no reason to run it. */
    let raf = 0;
    const settle = () => {
      raf = 0;
      if (performance.now() - last < 40) { raf = requestAnimationFrame(settle); return; }
      vx *= 0.78; vy *= 0.78;
      if (Math.hypot(vx, vy) < 0.15) { vx = 0; vy = 0; draw(); return; }
      draw();
      raf = requestAnimationFrame(settle);
    };

    addEventListener('mousemove', e => {
      const dx = e.clientX - x, dy = e.clientY - y;
      x = e.clientX; y = e.clientY;
      /* A jump (a page's first event, a teleport) is not a move. */
      if (Math.hypot(dx, dy) < 120) { vx = vx * 0.6 + dx * 0.4; vy = vy * 0.6 + dy * 0.4; }
      last = performance.now();
      try { sessionStorage.setItem('clip-at', JSON.stringify([x, y])); } catch { /* no storage on this page */ }
      look();
      draw();
      if (!raf) raf = requestAnimationFrame(settle);
    }, true);
    addEventListener('mousedown', () => {
      down = true;
      draw();
      const rp = document.createElement('div');
      rp.className = 'cc-rp';
      rp.innerHTML = '<b></b><b></b><b></b>';
      c.insertBefore(rp, c.firstChild);
      setTimeout(() => rp.remove(), 900);
    }, true);
    addEventListener('mouseup', () => { down = false; draw(); setTimeout(() => { look(); draw(); }, 120); }, true);
    addEventListener('keydown', () => { typing = Date.now() + 900; look(); draw(); setTimeout(() => { look(); draw(); }, 950); }, true);
    /* What is under the pointer changes when the page does (a dialog opens
       under it, a list scrolls past it), not only when it moves. */
    addEventListener('wheel', () => setTimeout(() => { look(); draw(); }, 60), { capture: true, passive: true });
    addEventListener('focusin', () => { look(); draw(); }, true);
    draw();
  };
  if (document.documentElement) put(); else addEventListener('DOMContentLoaded', put);
};
