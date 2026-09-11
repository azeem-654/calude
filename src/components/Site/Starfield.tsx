/**
 * The sky the site sits on.
 *
 * A fixed canvas behind everything: layered stars drifting at three depths, a
 * small solar system turning off to the side, a rare meteor and, now and then,
 * a satellite crossing. It is deliberately quiet — ambient motion that reads as
 * depth, not a screensaver competing with the words in front of it.
 *
 * Canvas rather than a few hundred absolutely-positioned divs. Two hundred
 * elements each with their own transform and animation is two hundred things
 * for the compositor to keep; one canvas is one texture, and it costs about a
 * millisecond a frame.
 *
 * ── What the first version got wrong ──
 *
 * Everything here is timed in **seconds**, not frames, and that is the fix for
 * the bug the whole scene had. The twinkle was `sin(t * 0.02)` with `t` in
 * milliseconds — 20 radians a second, about three full cycles a second, which
 * is not a star twinkling, it is a fault indicator. And the eye cannot read
 * slow travel underneath a flicker that fast, so the sky looked simultaneously
 * frantic and completely still. The orbits had the opposite problem: a full
 * turn took between six and fourteen minutes, which is a photograph.
 *
 * Three things it will not do:
 *
 *   - Run when nobody is looking. A hidden tab stops the loop entirely, which
 *     is the difference between a page you leave open and a warm laptop.
 *   - Travel when asked not to. Under `prefers-reduced-motion` nothing moves
 *     across the canvas — no drift, no orbits, no meteors, no satellites — but
 *     the stars keep breathing, which changes opacity in place and moves
 *     nothing. This used to freeze on a single frame, and a visitor with
 *     battery saver on could not tell that from a broken page.
 *   - Intercept the cursor. It is `pointer-events: none` and `aria-hidden`, so
 *     it is invisible to both the mouse and a screen reader.
 */
import { useEffect, useRef } from 'react';

/**
 * How many stars, by how far away they are. Nearer means fewer, brighter and
 * faster — which is the whole of what makes a flat field of dots read as depth.
 *
 * There were 240. A sky that dense stops reading as distance and starts reading
 * as noise, and it was competing with the type in front of it; 132 leaves black
 * between them, which is most of what makes a night sky look deep.
 *
 * `speed` is **pixels per second**. The back layer crosses a 1440px screen in
 * about three minutes and the front in under one — slow enough to sit behind a
 * paragraph, fast enough that watching one for a few seconds shows it moving.
 */
const LAYERS = [
  { count: 72, size: [0.4, 1.0], speed: 8, alpha: [0.16, 0.36], drift: 0.04 },
  { count: 42, size: [0.8, 1.5], speed: 17, alpha: [0.26, 0.55], drift: 0.10 },
  { count: 18, size: [1.3, 2.3], speed: 30, alpha: [0.42, 0.80], drift: 0.20 },
];

/**
 * Seconds between meteors — a range, so they never arrive on a beat.
 *
 * This was 1.2 to 3.6 seconds, which is a meteor shower: the thing the page is
 * about rather than a detail somebody happens to catch. At half a minute to two
 * minutes a visitor sees perhaps one, and it is a small event when they do.
 */
const METEOR_GAP = [34, 115];

/** And a satellite rather less often still. */
const SATELLITE_GAP = [55, 170];

/* The mark's own colours, so the sky belongs to the logo rather than to space
   in general. Most stars stay white — a sky of entirely lime stars reads as an
   effect, where a few do read as a palette. */
const TINTS = ['255,255,255', '255,255,255', '255,255,255', '200,242,77', '143,217,196'];

interface Star {
  x: number; y: number; r: number; a: number;
  /** Radians per **second** for the twinkle, and where in it this star starts. */
  tw: number; phase: number;
  vx: number; vy: number;
  tint: string;
  depth: number;
}

/**
 * A planet.
 *
 * Named ones, because "three coloured dots on ellipses" was read as decoration
 * and not as a solar system at all. Each is drawn with the one feature that
 * identifies it at four pixels across — Earth's blue-green split, Jupiter's
 * bands, Saturn's ring — and nothing else, since anything more is invisible at
 * this size and costs a frame.
 */
type Look = 'earth' | 'jupiter' | 'saturn';

interface Body {
  /** Orbit radii — elliptical, because a circle reads as a loading spinner. */
  rx: number; ry: number;
  angle: number;
  /** Radians per **second**. A full turn in 40–95s: visibly moving, never busy. */
  speed: number;
  size: number;
  look: Look;
  alpha: number;
}

/**
 * A falling star.
 *
 * Drawn as a tapering line rather than a dot with a blur behind it: the streak
 * *is* the meteor, and a gradient stroke from the head back along its own
 * direction of travel is both cheaper and more convincing than a sprite.
 */
interface Meteor {
  x: number; y: number;
  vx: number; vy: number;
  len: number;
  life: number;
  max: number;
  tint: string;
}

/**
 * A satellite: a single dot on a straight line, blinking slowly.
 *
 * The blink is the whole of what tells it from a star. It travels at a few
 * dozen pixels a second — far slower than a meteor, far faster than the star
 * field — which is exactly how one looks from the ground.
 */
interface Satellite {
  x: number; y: number;
  vx: number; vy: number;
  /** Seconds alive, and the blink period in seconds. */
  life: number;
  blink: number;
}

export default function Starfield() {
  const ref = useRef<HTMLCanvasElement | null>(null);

  useEffect(() => {
    const canvas = ref.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d', { alpha: true });
    if (!ctx) return;

    const reduced = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false;

    let w = 0;
    let h = 0;
    let stars: Star[] = [];
    let bodies: Body[] = [];
    let meteors: Meteor[] = [];
    let satellites: Satellite[] = [];
    let nextMeteor = 0;
    let nextSatellite = 0;
    /** Seconds since the loop started. Every speed in this file is per second. */
    let clock = 0;
    let raf = 0;
    let last = 0;
    let scrollY = window.scrollY;

    const rnd = (a: number, b: number) => a + Math.random() * (b - a);

    const build = () => {
      /* Capped at 2: a 3x phone screen would triple the fill cost for a
         difference nobody can see in a one-pixel star. */
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      w = window.innerWidth;
      h = window.innerHeight;
      canvas.width = Math.floor(w * dpr);
      canvas.height = Math.floor(h * dpr);
      canvas.style.width = `${w}px`;
      canvas.style.height = `${h}px`;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

      meteors = [];
      satellites = [];
      /* Not zero: a meteor in the first second of a page load looks like part
         of the loading animation. The first one is a while away. */
      nextMeteor = clock + rnd(METEOR_GAP[0], METEOR_GAP[1]);
      nextSatellite = clock + rnd(SATELLITE_GAP[0], SATELLITE_GAP[1]);

      stars = [];
      LAYERS.forEach(layer => {
        for (let i = 0; i < layer.count; i++) {
          const dir = Math.random() * Math.PI * 2;
          stars.push({
            x: Math.random() * w,
            y: Math.random() * h,
            r: rnd(layer.size[0], layer.size[1]),
            a: rnd(layer.alpha[0], layer.alpha[1]),
            /* 0.35–1.4 rad/s: a cycle every four and a half to eighteen
               seconds. Slow enough to read as a star breathing rather than a
               pixel flashing, and varied enough that the field never pulses
               together. */
            tw: rnd(0.35, 1.4),
            phase: Math.random() * Math.PI * 2,
            vx: Math.cos(dir) * layer.speed,
            vy: Math.sin(dir) * layer.speed,
            tint: TINTS[Math.floor(Math.random() * TINTS.length)],
            depth: layer.drift,
          });
        }
      });

      /* The system sits off the right edge on a wide screen and mostly out of
         frame on a narrow one, so it never fights the headline for the middle.
         Nearer planets orbit faster, as they actually do. */
      bodies = [
        { rx: w * 0.21, ry: h * 0.14, angle: 0.4, speed: 0.155, size: 3.0, look: 'earth', alpha: 0.72 },
        { rx: w * 0.32, ry: h * 0.22, angle: 2.1, speed: 0.096, size: 5.2, look: 'jupiter', alpha: 0.66 },
        { rx: w * 0.44, ry: h * 0.31, angle: 4.0, speed: 0.066, size: 4.2, look: 'saturn', alpha: 0.60 },
      ];
    };

    /*
     * Where the sun sits. Off to the right so it never fights the headline for
     * the middle, but not so far that the outer orbits spend most of a turn
     * past the edge — three planets nobody ever sees are not a solar system.
     */
    const centre = () => ({ cx: w * 0.78, cy: h * 0.3 });

    /**
     * One falling star, from somewhere along the top or the right edge.
     *
     * Always down-and-left, because a sky where they arrive from every
     * direction reads as confetti. The angle varies a little so they are not
     * all parallel.
     */
    const spawnMeteor = () => {
      const angle = Math.PI * (0.62 + Math.random() * 0.16);   // down-left
      const speed = rnd(430, 780);                              // px per second
      const fromTop = Math.random() < 0.7;
      meteors.push({
        x: fromTop ? rnd(w * 0.25, w * 1.05) : w + 20,
        y: fromTop ? -20 : rnd(0, h * 0.45),
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed,
        len: rnd(90, 210),
        life: 0,
        max: rnd(1.2, 2.2),                                     // seconds
        tint: Math.random() < 0.55 ? '200,242,77' : '255,255,255',
      });
    };

    /** Crosses the whole screen, in whichever direction, over roughly a minute. */
    const spawnSatellite = () => {
      const leftToRight = Math.random() < 0.5;
      const speed = rnd(22, 40);
      const slant = rnd(-0.22, 0.22);
      satellites.push({
        x: leftToRight ? -30 : w + 30,
        y: rnd(h * 0.06, h * 0.8),
        vx: leftToRight ? speed : -speed,
        vy: speed * slant,
        life: 0,
        blink: rnd(1.7, 3.4),
      });
    };

    /** Earth, Jupiter or Saturn at the size a planet gets on a marketing page. */
    const drawPlanet = (b: Body, x: number, y: number) => {
      ctx.globalAlpha = b.alpha;

      if (b.look === 'earth') {
        ctx.fillStyle = '#2f6fb5';
        ctx.beginPath();
        ctx.arc(x, y, b.size, 0, Math.PI * 2);
        ctx.fill();
        /* One landmass, clipped to the disc. Any more detail than this is
           sub-pixel and simply muddies the blue. */
        ctx.save();
        ctx.clip();
        ctx.fillStyle = '#4e9e6a';
        ctx.beginPath();
        ctx.arc(x - b.size * 0.3, y + b.size * 0.15, b.size * 0.62, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();
      } else if (b.look === 'jupiter') {
        ctx.fillStyle = '#c9a06a';
        ctx.beginPath();
        ctx.arc(x, y, b.size, 0, Math.PI * 2);
        ctx.fill();
        ctx.save();
        ctx.clip();
        /* Two bands and the spot — the three things anybody draws when asked
           to draw Jupiter, and all that survives at five pixels. */
        ctx.fillStyle = 'rgba(150,105,70,0.75)';
        ctx.fillRect(x - b.size, y - b.size * 0.52, b.size * 2, b.size * 0.3);
        ctx.fillRect(x - b.size, y + b.size * 0.18, b.size * 2, b.size * 0.26);
        ctx.fillStyle = 'rgba(190,90,70,0.8)';
        ctx.beginPath();
        ctx.ellipse(x + b.size * 0.28, y + b.size * 0.3, b.size * 0.3, b.size * 0.18, 0, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();
      } else {
        ctx.fillStyle = '#d8c48c';
        ctx.beginPath();
        ctx.arc(x, y, b.size, 0, Math.PI * 2);
        ctx.fill();
        /* The ring, tilted. Without it this is a beige dot and nobody can tell
           which planet it is meant to be. */
        ctx.strokeStyle = `rgba(216,196,140,${b.alpha})`;
        ctx.lineWidth = 1.3;
        ctx.beginPath();
        ctx.ellipse(x, y, b.size * 2.2, b.size * 0.62, -0.42, 0, Math.PI * 2);
        ctx.stroke();
      }
    };

    const draw = (t: number) => {
      /* Seconds since the last frame, capped so a tab that was throttled does
         not teleport everything on the frame it wakes up. */
      const dt = last ? Math.min((t - last) / 1000, 0.05) : 0.016;
      last = t;
      clock += dt;
      ctx.clearRect(0, 0, w, h);

      /* Parallax: the further back a layer is, the less the page's scroll moves
         it. This is what turns a flat field of dots into distance. */
      for (const s of stars) {
        if (!reduced) {
          s.x += s.vx * dt;
          s.y += s.vy * dt;
          if (s.x < -2) s.x = w + 2; else if (s.x > w + 2) s.x = -2;
          if (s.y < -2) s.y = h + 2; else if (s.y > h + 2) s.y = -2;
        }
        const y = s.y - (scrollY * s.depth) % (h + 4);
        const wrapped = y < -2 ? y + h + 4 : y;
        /* Twinkle survives `reduce`: it changes opacity in place and moves
           nothing, so it is not the kind of animation the setting is asking us
           to stop — and without it the sky is a flat still. */
        const twinkle = 0.76 + 0.24 * Math.sin(clock * s.tw + s.phase);

        ctx.globalAlpha = s.a * twinkle;
        ctx.fillStyle = `rgb(${s.tint})`;
        ctx.beginPath();
        ctx.arc(s.x, wrapped, s.r, 0, Math.PI * 2);
        ctx.fill();
      }

      /* The system: a soft sun and three planets on slow ellipses. Orbit paths
         are drawn at very low alpha — enough to read as orbits when you look,
         invisible when you are not. */
      const { cx, cy } = centre();
      const sunY = cy - (scrollY * 0.06) % (h * 2);

      /* Halved, and pulled in. The old glow lifted the whole right-hand third
         of the page through `mix-blend-mode: screen`, which is why the sky read
         as grey rather than as space. */
      const glow = ctx.createRadialGradient(cx, sunY, 0, cx, sunY, Math.max(w, h) * 0.17);
      glow.addColorStop(0, 'rgba(200,242,77,0.085)');
      glow.addColorStop(0.45, 'rgba(143,217,196,0.026)');
      glow.addColorStop(1, 'rgba(200,242,77,0)');
      ctx.globalAlpha = 1;
      ctx.fillStyle = glow;
      ctx.fillRect(0, 0, w, h);

      for (const b of bodies) {
        if (!reduced) b.angle += b.speed * dt;

        ctx.globalAlpha = 0.05;
        ctx.strokeStyle = 'rgba(200,242,77,1)';
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.ellipse(cx, sunY, b.rx, b.ry, -0.35, 0, Math.PI * 2);
        ctx.stroke();

        const bx = cx + Math.cos(b.angle) * b.rx * Math.cos(-0.35) - Math.sin(b.angle) * b.ry * Math.sin(-0.35);
        const by = sunY + Math.cos(b.angle) * b.rx * Math.sin(-0.35) + Math.sin(b.angle) * b.ry * Math.cos(-0.35);

        drawPlanet(b, bx, by);

        /* A faint halo, so a small disc still reads as a body rather than dust. */
        ctx.globalAlpha = b.alpha * 0.12;
        ctx.beginPath();
        ctx.arc(bx, by, b.size * 2.6, 0, Math.PI * 2);
        ctx.fill();
      }

      if (reduced) { ctx.globalAlpha = 1; return; }

      /* ── Falling stars ── */
      if (clock > nextMeteor) {
        spawnMeteor();
        nextMeteor = clock + rnd(METEOR_GAP[0], METEOR_GAP[1]);
      }
      for (let i = meteors.length - 1; i >= 0; i--) {
        const m = meteors[i];
        m.x += m.vx * dt;
        m.y += m.vy * dt;
        m.life += dt;
        if (m.life > m.max || m.x < -260 || m.y > h + 260) { meteors.splice(i, 1); continue; }

        /* Fades in over the first fifth of its life and out over the last
           third, so it never appears or vanishes on a hard edge. */
        const p = m.life / m.max;
        const fade = p < 0.2 ? p / 0.2 : p > 0.66 ? (1 - p) / 0.34 : 1;

        const nx = m.vx / Math.hypot(m.vx, m.vy);
        const ny = m.vy / Math.hypot(m.vx, m.vy);
        const tailX = m.x - nx * m.len;
        const tailY = m.y - ny * m.len;

        const streak = ctx.createLinearGradient(m.x, m.y, tailX, tailY);
        streak.addColorStop(0, `rgba(${m.tint},${0.95 * fade})`);
        streak.addColorStop(0.35, `rgba(${m.tint},${0.35 * fade})`);
        streak.addColorStop(1, `rgba(${m.tint},0)`);

        ctx.globalAlpha = 1;
        ctx.strokeStyle = streak;
        ctx.lineWidth = 2;
        ctx.lineCap = 'round';
        ctx.beginPath();
        ctx.moveTo(m.x, m.y);
        ctx.lineTo(tailX, tailY);
        ctx.stroke();

        /* A bright head, so it reads as a body with a tail rather than a
           gradient someone drew. */
        ctx.globalAlpha = fade;
        ctx.fillStyle = `rgb(${m.tint})`;
        ctx.beginPath();
        ctx.arc(m.x, m.y, 1.7, 0, Math.PI * 2);
        ctx.fill();
      }

      /* ── Satellites ── */
      if (clock > nextSatellite) {
        spawnSatellite();
        nextSatellite = clock + rnd(SATELLITE_GAP[0], SATELLITE_GAP[1]);
      }
      for (let i = satellites.length - 1; i >= 0; i--) {
        const s = satellites[i];
        s.x += s.vx * dt;
        s.y += s.vy * dt;
        s.life += dt;
        if (s.x < -60 || s.x > w + 60 || s.y < -60 || s.y > h + 60) { satellites.splice(i, 1); continue; }

        /* Never fully dark: a satellite that disappears between blinks reads as
           a rendering fault rather than as something turning. */
        const blink = 0.35 + 0.65 * (0.5 + 0.5 * Math.sin((s.life / s.blink) * Math.PI * 2));
        ctx.globalAlpha = 0.85 * blink;
        ctx.fillStyle = 'rgb(226,236,255)';
        ctx.beginPath();
        ctx.arc(s.x, s.y, 1.25, 0, Math.PI * 2);
        ctx.fill();
      }

      ctx.globalAlpha = 1;
    };

    const loop = (t: number) => {
      draw(t);
      raf = requestAnimationFrame(loop);
    };

    const onScroll = () => { scrollY = window.scrollY; };
    const onResize = () => { build(); draw(performance.now()); };
    const onVisibility = () => {
      /* A background tab still runs rAF in some browsers, and always burns
         battery in the ones that throttle it rather than stopping it. */
      cancelAnimationFrame(raf);
      last = 0;                    // do not integrate the time spent hidden
      if (!document.hidden) raf = requestAnimationFrame(loop);
    };

    build();
    /* Runs either way. Under `reduce` nothing travels — no drift, no orbits, no
       meteors, no satellites — but the stars still breathe, so the sky reads as
       a sky rather than as a page that failed to load. */
    raf = requestAnimationFrame(loop);

    window.addEventListener('scroll', onScroll, { passive: true });
    window.addEventListener('resize', onResize);
    document.addEventListener('visibilitychange', onVisibility);

    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener('scroll', onScroll);
      window.removeEventListener('resize', onResize);
      document.removeEventListener('visibilitychange', onVisibility);
    };
  }, []);

  return <canvas className="dc-sky" ref={ref} aria-hidden="true" />;
}
