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

/** How many stars, by how far away they are. Nearer means fewer and brighter. */
const LAYERS = [
  { count: 120, size: [0.5, 1.1], speed: 0.010, alpha: [0.20, 0.45], drift: 0.04 },
  { count: 70, size: [0.9, 1.7], speed: 0.022, alpha: [0.35, 0.70], drift: 0.10 },
  { count: 28, size: [1.4, 2.4], speed: 0.040, alpha: [0.55, 0.95], drift: 0.20 },
];

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
    let raf = 0;
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

    const draw = (t: number) => {
      ctx.clearRect(0, 0, w, h);

      /* Parallax: the further back a layer is, the less the page's scroll moves
         it. This is what turns a flat field of dots into distance. */
      for (const s of stars) {
        if (!reduced) {
          s.x += s.vx;
          s.y += s.vy;
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
