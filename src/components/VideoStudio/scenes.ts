/**
 * Ready-made background pictures for the Screen Recorder — behind the
 * person (camera background) and behind the screen (the frame's backdrop).
 *
 * Painted in this browser from a few numbers, never downloaded: no picture
 * files to ship, license or upload, and any size is exact. Each is painted
 * at a third of its size and stretched back up, which is the soft focus of
 * a real out-of-focus room (a person sharp in front of a blurred wall reads
 * as a camera's depth of field) and costs a tenth of painting it sharp. A
 * seeded random makes each scene the same every time it is painted, so the
 * swatch is what is recorded.
 */
export const SCENES = ['office', 'living', 'bookshelf', 'loft', 'brick', 'plants', 'bokeh', 'studio', 'city', 'mountains', 'sunset', 'space'] as const;
export type SceneId = typeof SCENES[number];
export const SCENE_LABEL: Record<SceneId, string> = {
  office: 'Office', living: 'Living room', bookshelf: 'Bookshelf', loft: 'Loft', brick: 'Brick wall', plants: 'Plants',
  bokeh: 'Bokeh lights', studio: 'Studio', city: 'City at night', mountains: 'Mountains', sunset: 'Beach sunset', space: 'Space',
};
export const isScene = (v: unknown): v is SceneId => typeof v === 'string' && (SCENES as readonly string[]).includes(v);

type C2 = CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D;
type Cv = HTMLCanvasElement | OffscreenCanvas;
const mk = (w: number, h: number): Cv => {
  if (typeof OffscreenCanvas !== 'undefined') return new OffscreenCanvas(w, h);
  const c = document.createElement('canvas'); c.width = w; c.height = h; return c;
};

/** mulberry32: small, fast, and the same numbers for the same seed. */
function rng(seed: number) {
  let a = seed >>> 0;
  return () => { a = (a + 0x6d2b79f5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}

function vgrad(g: C2, h: number, stops: string[]) {
  const l = g.createLinearGradient(0, 0, 0, h);
  stops.forEach((c, i) => l.addColorStop(i / Math.max(1, stops.length - 1), c));
  return l;
}
function glow(g: C2, x: number, y: number, r: number, color: string, alpha = 1) {
  const rad = g.createRadialGradient(x, y, 0, x, y, r);
  rad.addColorStop(0, color); rad.addColorStop(1, 'rgba(0,0,0,0)');
  g.save(); g.globalAlpha = alpha; g.fillStyle = rad; g.fillRect(x - r, y - r, r * 2, r * 2); g.restore();
}
function vignette(g: C2, w: number, h: number, a = 0.45) {
  const rad = g.createRadialGradient(w / 2, h / 2, Math.min(w, h) * 0.35, w / 2, h / 2, Math.hypot(w, h) * 0.6);
  rad.addColorStop(0, 'rgba(0,0,0,0)'); rad.addColorStop(1, `rgba(0,0,0,${a})`);
  g.fillStyle = rad; g.fillRect(0, 0, w, h);
}
function leaf(g: C2, x: number, y: number, len: number, ang: number, color: string) {
  g.save(); g.translate(x, y); g.rotate(ang);
  g.beginPath(); g.ellipse(len / 2, 0, len / 2, len / 6, 0, 0, Math.PI * 2);
  g.fillStyle = color; g.fill(); g.restore();
}
function plant(g: C2, x: number, base: number, size: number, r: () => number, dark = false) {
  g.fillStyle = dark ? '#3b2f2a' : '#8b5e3c';
  g.fillRect(x - size * 0.18, base - size * 0.28, size * 0.36, size * 0.28);
  for (let i = 0; i < 14; i++) {
    const a = -Math.PI / 2 + (r() - 0.5) * 2.2;
    leaf(g, x, base - size * 0.26, size * (0.35 + r() * 0.4), a, `hsl(${110 + r() * 40},${35 + r() * 25}%,${dark ? 14 + r() * 10 : 26 + r() * 18}%)`);
  }
}

const PAINT: Record<SceneId, (g: C2, w: number, h: number, r: () => number) => void> = {
  office(g, w, h, r) {
    g.fillStyle = vgrad(g, h, ['#e9e4dc', '#d8d0c4', '#b9ae9f']); g.fillRect(0, 0, w, h);
    /* A tall window on the left, its light falling across the wall. */
    const wx = w * 0.06, ww = w * 0.3, wy = h * 0.08, wh = h * 0.62;
    glow(g, wx + ww / 2, wy + wh / 2, w * 0.55, 'rgba(255,248,230,.9)', 0.8);
    g.fillStyle = '#f7fbff'; g.fillRect(wx, wy, ww, wh);
    g.fillStyle = vgrad(g, h, ['#cfe6f7', '#eaf4fb']); g.fillRect(wx + 4, wy + 4, ww - 8, wh - 8);
    g.fillStyle = '#d9d2c7'; g.fillRect(wx + ww / 2 - 3, wy, 6, wh); g.fillRect(wx, wy + wh / 2 - 3, ww, 6);
    /* A shelf with a few things on it, a desk edge, a plant. */
    g.fillStyle = '#8a6a4f'; g.fillRect(w * 0.55, h * 0.36, w * 0.36, h * 0.025);
    for (let i = 0; i < 7; i++) { g.fillStyle = ['#334155', '#9a3412', '#0f766e', '#e2e8f0', '#a16207'][i % 5]; const bw = w * (0.018 + r() * 0.012), bh = h * (0.08 + r() * 0.06); g.fillRect(w * 0.57 + i * w * 0.035, h * 0.36 - bh, bw, bh); }
    g.fillStyle = '#7b5a40'; g.fillRect(0, h * 0.84, w, h * 0.16);
    plant(g, w * 0.86, h * 0.84, h * 0.5, r);
    glow(g, w * 0.7, h * 0.62, w * 0.18, 'rgba(255,214,150,.6)', 0.7);
    vignette(g, w, h, 0.3);
  },
  living(g, w, h, r) {
    g.fillStyle = vgrad(g, h, ['#c9a98a', '#b08d6e', '#7d5e47']); g.fillRect(0, 0, w, h);
    /* A floor lamp's warm pool, a framed picture, a sofa's back. */
    glow(g, w * 0.82, h * 0.3, w * 0.4, 'rgba(255,200,120,.95)', 0.85);
    g.fillStyle = '#3f2f25'; g.fillRect(w * 0.3, h * 0.16, w * 0.24, h * 0.3);
    g.fillStyle = vgrad(g, h, ['#f59e0b', '#be185d', '#312e81']); g.fillRect(w * 0.31, h * 0.18, w * 0.22, h * 0.26);
    g.fillStyle = '#5b4a3f'; g.fillRect(w * 0.79, h * 0.22, w * 0.012, h * 0.62);
    g.beginPath(); g.moveTo(w * 0.75, h * 0.22); g.lineTo(w * 0.87, h * 0.22); g.lineTo(w * 0.84, h * 0.1); g.lineTo(w * 0.78, h * 0.1); g.closePath(); g.fillStyle = '#fde7c2'; g.fill();
    g.fillStyle = '#556b6f'; g.beginPath(); g.roundRect?.(w * 0.05, h * 0.62, w * 0.62, h * 0.4, h * 0.06); g.fill();
    g.fillStyle = '#4b5f63'; for (let i = 0; i < 3; i++) g.fillRect(w * (0.08 + i * 0.2), h * 0.66, w * 0.17, h * 0.2);
    plant(g, w * 0.12, h * 0.64, h * 0.42, r, true);
    vignette(g, w, h, 0.4);
  },
  bookshelf(g, w, h, r) {
    g.fillStyle = '#5a3d2b'; g.fillRect(0, 0, w, h);
    const rows = 5, rh = h / rows;
    for (let y = 0; y < rows; y++) {
      let x = w * 0.01;
      while (x < w) {
        const bw = w * (0.012 + r() * 0.02), bh = rh * (0.6 + r() * 0.3);
        g.fillStyle = `hsl(${Math.floor(r() * 360)},${30 + r() * 40}%,${22 + r() * 35}%)`;
        g.fillRect(x, y * rh + rh - bh - rh * 0.08, bw, bh);
        x += bw + (r() < 0.08 ? w * 0.04 : w * 0.002);
      }
      g.fillStyle = '#3e2a1d'; g.fillRect(0, y * rh + rh * 0.92, w, rh * 0.08);
    }
    glow(g, w * 0.3, h * 0.25, w * 0.5, 'rgba(255,220,170,.5)', 0.6);
    vignette(g, w, h, 0.5);
  },
  loft(g, w, h) {
    g.fillStyle = vgrad(g, h, ['#8d9196', '#73777c', '#55595e']); g.fillRect(0, 0, w, h);
    /* A big factory window: a grid of panes, light behind it. */
    const x0 = w * 0.48, y0 = h * 0.08, ww = w * 0.46, wh = h * 0.7;
    glow(g, x0 + ww / 2, y0 + wh / 2, w * 0.6, 'rgba(240,248,255,.9)', 0.7);
    g.fillStyle = '#dfe9f2'; g.fillRect(x0, y0, ww, wh);
    g.strokeStyle = '#2b2f33'; g.lineWidth = Math.max(2, w * 0.006);
    for (let i = 0; i <= 4; i++) { g.beginPath(); g.moveTo(x0 + ww * i / 4, y0); g.lineTo(x0 + ww * i / 4, y0 + wh); g.stroke(); }
    for (let i = 0; i <= 5; i++) { g.beginPath(); g.moveTo(x0, y0 + wh * i / 5); g.lineTo(x0 + ww, y0 + wh * i / 5); g.stroke(); }
    g.fillStyle = '#3a3027'; g.fillRect(0, h * 0.86, w, h * 0.14);
    vignette(g, w, h, 0.35);
  },
  brick(g, w, h, r) {
    g.fillStyle = '#6b3a2c'; g.fillRect(0, 0, w, h);
    const bh = h / 14, bw = bh * 2.6;
    for (let y = 0, row = 0; y < h; y += bh, row++) {
      for (let x = row % 2 ? -bw / 2 : 0; x < w; x += bw) {
        g.fillStyle = `hsl(${12 + r() * 10},${40 + r() * 15}%,${28 + r() * 12}%)`;
        g.fillRect(x + 1.5, y + 1.5, bw - 3, bh - 3);
      }
    }
    glow(g, w * 0.25, h * 0.15, w * 0.55, 'rgba(255,190,120,.55)', 0.8);
    vignette(g, w, h, 0.5);
  },
  plants(g, w, h, r) {
    g.fillStyle = vgrad(g, h, ['#1f3b2a', '#16301f', '#0d1f14']); g.fillRect(0, 0, w, h);
    for (let i = 0; i < 260; i++) leaf(g, r() * w, r() * h, h * (0.08 + r() * 0.14), r() * Math.PI * 2, `hsl(${100 + r() * 50},${35 + r() * 30}%,${18 + r() * 28}%)`);
    glow(g, w * 0.7, h * 0.2, w * 0.4, 'rgba(255,245,200,.5)', 0.6);
    vignette(g, w, h, 0.4);
  },
  bokeh(g, w, h, r) {
    g.fillStyle = vgrad(g, h, ['#1d1530', '#2a1a2e', '#120d1a']); g.fillRect(0, 0, w, h);
    for (let i = 0; i < 70; i++) {
      const c = ['rgba(255,190,90,1)', 'rgba(255,120,170,1)', 'rgba(130,190,255,1)', 'rgba(255,230,160,1)'][Math.floor(r() * 4)];
      glow(g, r() * w, r() * h, h * (0.03 + r() * 0.09), c, 0.25 + r() * 0.5);
    }
  },
  studio(g, w, h) {
    g.fillStyle = '#26282d'; g.fillRect(0, 0, w, h);
    glow(g, w * 0.5, h * 0.42, Math.max(w, h) * 0.55, 'rgba(120,126,140,1)', 0.9);
    vignette(g, w, h, 0.65);
  },
  city(g, w, h, r) {
    g.fillStyle = vgrad(g, h, ['#0b1024', '#1b1f45', '#3b2a55']); g.fillRect(0, 0, w, h);
    let x = 0;
    while (x < w) {
      const bw = w * (0.05 + r() * 0.07), bh = h * (0.3 + r() * 0.55);
      g.fillStyle = `hsl(230,25%,${8 + r() * 8}%)`; g.fillRect(x, h - bh, bw, bh);
      for (let wy = h - bh + h * 0.02; wy < h - h * 0.03; wy += h * 0.035) for (let wx = x + bw * 0.12; wx < x + bw * 0.88; wx += bw * 0.2) {
        if (r() < 0.45) { g.fillStyle = r() < 0.7 ? 'rgba(255,214,140,.9)' : 'rgba(170,210,255,.85)'; g.fillRect(wx, wy, bw * 0.1, h * 0.016); }
      }
      x += bw + w * 0.004;
    }
    for (let i = 0; i < 26; i++) glow(g, r() * w, h * (0.55 + r() * 0.45), h * (0.03 + r() * 0.06), ['rgba(255,190,90,1)', 'rgba(255,90,90,1)', 'rgba(140,200,255,1)'][i % 3], 0.35);
  },
  mountains(g, w, h, r) {
    g.fillStyle = vgrad(g, h, ['#7fb2e5', '#cfe3f3', '#f6e7d2']); g.fillRect(0, 0, w, h);
    glow(g, w * 0.72, h * 0.3, h * 0.35, 'rgba(255,240,200,1)', 0.8);
    const layers = ['#7d8fb3', '#5a6b8f', '#3d4b6b', '#26324a'];
    layers.forEach((c, i) => {
      const base = h * (0.5 + i * 0.12);
      g.beginPath(); g.moveTo(0, h);
      let y = base;
      for (let x = 0; x <= w; x += w / 24) { y = base - h * (0.04 + r() * 0.16) * (1 - i * 0.15); g.lineTo(x, y); }
      g.lineTo(w, h); g.closePath(); g.fillStyle = c; g.fill();
    });
  },
  sunset(g, w, h, r) {
    g.fillStyle = vgrad(g, h * 0.62, ['#3b1d5e', '#c2410c', '#fbbf24']); g.fillRect(0, 0, w, h * 0.62);
    glow(g, w * 0.5, h * 0.58, h * 0.5, 'rgba(255,220,140,1)', 0.9);
    g.beginPath(); g.arc(w * 0.5, h * 0.58, h * 0.1, 0, Math.PI * 2); g.fillStyle = '#ffe6a3'; g.fill();
    g.fillStyle = vgrad(g, h, ['#0e3a5c', '#0e3a5c', '#0b2a42']); g.fillRect(0, h * 0.62, w, h * 0.22);
    for (let i = 0; i < 40; i++) { g.fillStyle = 'rgba(255,200,120,.5)'; g.fillRect(w * 0.5 - w * (0.05 + r() * 0.12), h * (0.63 + r() * 0.2), w * (0.04 + r() * 0.18), h * 0.004); }
    g.fillStyle = vgrad(g, h, ['#e7c89a', '#d6b07c']); g.fillRect(0, h * 0.84, w, h * 0.16);
  },
  space(g, w, h, r) {
    g.fillStyle = '#05060f'; g.fillRect(0, 0, w, h);
    glow(g, w * 0.3, h * 0.4, w * 0.45, 'rgba(124,58,237,1)', 0.45);
    glow(g, w * 0.75, h * 0.65, w * 0.4, 'rgba(14,165,233,1)', 0.35);
    glow(g, w * 0.6, h * 0.2, w * 0.25, 'rgba(236,72,153,1)', 0.3);
    for (let i = 0; i < 420; i++) { g.fillStyle = `rgba(255,255,255,${0.3 + r() * 0.7})`; const s = r() < 0.92 ? 1 : 2; g.fillRect(r() * w, r() * h, s, s); }
  },
};

const SEED: Record<SceneId, number> = Object.fromEntries(SCENES.map((s, i) => [s, 1013 + i * 7919])) as Record<SceneId, number>;

/** The scene at w×h: painted small, stretched up (the soft focus), kept for the next frame. */
const cache = new Map<string, Cv>();
export function sceneLayer(id: SceneId, w: number, h: number): Cv {
  w = Math.max(2, Math.round(w)); h = Math.max(2, Math.round(h));
  const key = `${id}|${w}x${h}`;
  const hit = cache.get(key);
  if (hit) return hit;
  /* Stars and windows are dots: space and the city keep more of their size. */
  const k = id === 'space' || id === 'city' ? 2 : 3;
  const sw = Math.max(2, Math.round(w / k)), sh = Math.max(2, Math.round(h / k));
  const small = mk(sw, sh), sg = small.getContext('2d') as C2;
  PAINT[id](sg, sw, sh, rng(SEED[id]));
  const out = mk(w, h), og = out.getContext('2d') as C2;
  og.imageSmoothingQuality = 'high';
  og.drawImage(small, 0, 0, w, h);
  /* A handful of sizes at most (the frame, the camera box, a swatch); the oldest goes first. */
  if (cache.size >= 8) cache.delete(cache.keys().next().value!);
  cache.set(key, out);
  return out;
}

/** A small picture of the scene for its swatch. */
const thumbs = new Map<SceneId, string>();
export function sceneThumb(id: SceneId): string {
  const hit = thumbs.get(id);
  if (hit) return hit;
  if (typeof document === 'undefined') return '';
  const c = document.createElement('canvas'); c.width = 128; c.height = 72;
  c.getContext('2d')!.drawImage(sceneLayer(id, 128, 72), 0, 0);
  const url = c.toDataURL('image/jpeg', 0.8);
  thumbs.set(id, url);
  return url;
}
