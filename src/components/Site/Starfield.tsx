/**
 * The sky the site sits on.
 *
 * A fixed canvas behind everything: layered stars drifting at three depths,
 * and one slow orbital system off to the side. It is deliberately quiet —
 * ambient motion that reads as depth, not a screensaver competing with the
 * words in front of it.
 *
 * Canvas rather than a few hundred absolutely-positioned divs. Two hundred
 * elements each with their own transform and animation is two hundred things
 * for the compositor to keep; one canvas is one texture, and it costs about a
 * millisecond a frame.
 *
 * Three things it will not do:
 *
 *   - Run when nobody is looking. A hidden tab stops the loop entirely, which
 *     is the difference between a page you leave open and a warm laptop.
 *   - Run when asked not to. `prefers-reduced-motion` draws one still frame
 *     and stops; the depth is still there, the movement is not.
 *   - Intercept the cursor. It is `pointer-events: none` and `aria-hidden`, so
 *     it is invisible to both the mouse and a screen reader.
 */
import { useEffect, useRef } from 'react';

/**
 * How many stars, by how far away they are. Nearer means fewer, brighter and
 * faster — which is the whole of what makes a flat field of dots read as depth.
 *
 * The first cut moved at a hundredth of a pixel a frame. That is a star
 * crossing the screen in about forty minutes, which is indistinguishable from
 * a still image; these are roughly six times that, slow enough to be calm and
 * fast enough to be visibly moving while you read a paragraph.
 */
const LAYERS = [
  { count: 130, size: [0.5, 1.1], speed: 0.055, alpha: [0.22, 0.50], drift: 0.04 },
  { count: 78, size: [0.9, 1.7], speed: 0.115, alpha: [0.38, 0.75], drift: 0.10 },
  { count: 32, size: [1.4, 2.5], speed: 0.210, alpha: [0.58, 1.00], drift: 0.20 },
];

/**
 * Seconds between meteors — a range, so they never arrive on a beat.
 *
 * Roughly one on screen at a time. Faster than this and it is a meteor shower,
 * which stops being a detail somebody notices and becomes the thing the page
 * is about.
 */
const METEOR_GAP = [1.2, 3.6];

/* The mark's own colours, so the sky belongs to the logo rather than to space
   in general. Most stars stay white — a sky of entirely lime stars reads as a
   effect, where a few do read as a palette. */
const TINTS = ['255,255,255', '255,255,255', '255,255,255', '200,242,77', '143,217,196'];

interface Star {
  x: number; y: number; r: number; a: number;
  /** Radians per frame for the twinkle, and where in it this star starts. */
  tw: number; phase: number;
  vx: number; vy: number;
  tint: string;
  depth: number;
}

interface Body {
  /** Orbit radii — elliptical, because a circle reads as a loading spinner. */
  rx: number; ry: number;
  angle: number; speed: number;
  size: number; tint: string; alpha: number;
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
    let nextMeteor = 0;
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
      nextMeteor = 0;
      stars = [];
      LAYERS.forEach(layer => {
        for (let i = 0; i < layer.count; i++) {
          const dir = Math.random() * Math.PI * 2;
          stars.push({
            x: Math.random() * w,
            y: Math.random() * h,
            r: rnd(layer.size[0], layer.size[1]),
            a: rnd(layer.alpha[0], layer.alpha[1]),
            tw: rnd(0.006, 0.02),
            phase: Math.random() * Math.PI * 2,
            vx: Math.cos(dir) * layer.speed,
            vy: Math.sin(dir) * layer.speed,
            tint: TINTS[Math.floor(Math.random() * TINTS.length)],
            depth: layer.drift,
          });
        }
      });

      /* The system sits off the right edge on a wide screen and mostly out of
         frame on a narrow one, so it never fights the headline for the middle. */
      bodies = [
        { rx: w * 0.30, ry: h * 0.16, angle: 0.4, speed: 0.00028, size: 2.6, tint: '200,242,77', alpha: 0.5 },
        { rx: w * 0.44, ry: h * 0.24, angle: 2.1, speed: 0.00019, size: 3.4, tint: '143,217,196', alpha: 0.42 },
        { rx: w * 0.58, ry: h * 0.32, angle: 4.0, speed: 0.00012, size: 2.2, tint: '255,255,255', alpha: 0.3 },
      ];
    };

    const centre = () => ({ cx: w * 0.82, cy: h * 0.28 });

    /**
     * One falling star, from somewhere along the top or the right edge.
     *
     * Always down-and-left, because a sky where they arrive from every
     * direction reads as confetti. The angle varies a little so they are not
     * all parallel.
     */
    const spawnMeteor = () => {
      const angle = Math.PI * (0.62 + Math.random() * 0.16);   // down-left
      const speed = rnd(7.5, 13);
      const fromTop = Math.random() < 0.7;
      meteors.push({
        x: fromTop ? rnd(w * 0.25, w * 1.05) : w + 20,
        y: fromTop ? -20 : rnd(0, h * 0.45),
        vx: Math.cos(angle) * speed,
        vy: -Math.sin(angle) * speed * -1,
        len: rnd(90, 210),
        life: 0,
        max: rnd(70, 130),
        tint: Math.random() < 0.55 ? '200,242,77' : '255,255,255',
      });
    };

    const draw = (t: number) => {
      const dt = last ? Math.min((t - last) / 16.67, 3) : 1;   // frames since last, capped
      last = t;
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
        const twinkle = reduced ? 1 : 0.72 + 0.28 * Math.sin(t * s.tw + s.phase);

        ctx.globalAlpha = s.a * twinkle;
        ctx.fillStyle = `rgb(${s.tint})`;
        ctx.beginPath();
        ctx.arc(s.x, wrapped, s.r, 0, Math.PI * 2);
        ctx.fill();
      }

      /* The system: a soft sun and three bodies on slow ellipses. Orbit paths
         are drawn at very low alpha — enough to read as orbits when you look,
         invisible when you are not. */
      const { cx, cy } = centre();
      const sunY = cy - (scrollY * 0.06) % (h * 2);

      const glow = ctx.createRadialGradient(cx, sunY, 0, cx, sunY, Math.max(w, h) * 0.22);
      glow.addColorStop(0, 'rgba(200,242,77,0.16)');
      glow.addColorStop(0.45, 'rgba(143,217,196,0.05)');
      glow.addColorStop(1, 'rgba(200,242,77,0)');
      ctx.globalAlpha = 1;
      ctx.fillStyle = glow;
      ctx.fillRect(0, 0, w, h);

      for (const b of bodies) {
        if (!reduced) b.angle += b.speed;

        ctx.globalAlpha = 0.06;
        ctx.strokeStyle = 'rgba(200,242,77,1)';
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.ellipse(cx, sunY, b.rx, b.ry, -0.35, 0, Math.PI * 2);
        ctx.stroke();

        const bx = cx + Math.cos(b.angle) * b.rx * Math.cos(-0.35) - Math.sin(b.angle) * b.ry * Math.sin(-0.35);
        const by = sunY + Math.cos(b.angle) * b.rx * Math.sin(-0.35) + Math.sin(b.angle) * b.ry * Math.cos(-0.35);

        ctx.globalAlpha = b.alpha;
        ctx.fillStyle = `rgb(${b.tint})`;
        ctx.beginPath();
        ctx.arc(bx, by, b.size, 0, Math.PI * 2);
        ctx.fill();

        /* A faint halo, so a 3px dot still reads as a body rather than dust. */
        ctx.globalAlpha = b.alpha * 0.18;
        ctx.beginPath();
        ctx.arc(bx, by, b.size * 3.4, 0, Math.PI * 2);
        ctx.fill();
      }

      /* ── Falling stars ── */
      if (!reduced) {
        if (t > nextMeteor) {
          spawnMeteor();
          nextMeteor = t + rnd(METEOR_GAP[0], METEOR_GAP[1]) * 1000;
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
      if (!document.hidden && !reduced) raf = requestAnimationFrame(loop);
    };

    build();
    if (reduced) {
      draw(0);
    } else {
      raf = requestAnimationFrame(loop);
    }

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
