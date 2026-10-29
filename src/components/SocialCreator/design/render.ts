/**
 * Draws a template design — the one renderer for the gallery card, the
 * editor's preview and the exported PNG.
 *
 * ── Why one renderer, on a canvas ──
 *
 * The old exporter redrew the design with a second set of rules: images were
 * stretched instead of cropped, text was never wrapped, rounded corners and
 * filters were dropped. So the download did not match the editor, and a
 * gallery thumbnail matched neither. Here every picture of a design is the
 * same drawing at a different width, so a template card cannot promise what
 * the export does not deliver.
 *
 * Text is measured, wrapped and shrunk to fit its box (`fitText`); pictures
 * are cropped around their focal point; a slot the template needs but the
 * customer has not filled is drawn as a visible placeholder and reported, so
 * nothing is invented to fill it.
 */
import {
  contrast, fontPairOf, formatOf, paletteFor, resolveColor,
  type AspectClass, type Box, type DesignDoc, type FontPair, type IconName, type ImageRef, type ImageSlot, type Layer,
  type Paint, type TemplateSpec, type TextLayer, type TextSlot, type Token, type PageSpec,
} from '../../../../worker/src/lib/design/spec';
import { templateOf } from '../../../../worker/src/lib/design/templates';
import { photoById, photoUrl, photosFor } from '../../../../worker/src/lib/design/photos';
import { PLACEHOLDER, slotText } from '../../../../worker/src/lib/design/content';

/* ── Fonts ───────────────────────────────────────────────────────────────── */

const fontLinks = new Set<string>();
const fontReady = new Map<string, Promise<void>>();

function googleFontsUrl(pair: FontPair): string {
  const fam = (f: FontPair['display']) => {
    const w = [...new Set(f.weights)].sort((a, b) => a - b);
    const axis = f.italic ? `ital,wght@${[...w.map(x => `0,${x}`), ...w.map(x => `1,${x}`)].join(';')}` : `wght@${w.join(';')}`;
    return `family=${encodeURIComponent(f.family).replace(/%20/g, '+')}:${axis}`;
  };
  const faces = pair.display.family === pair.body.family ? [{ ...pair.display, weights: [...pair.display.weights, ...pair.body.weights] }] : [pair.display, pair.body];
  return `https://fonts.googleapis.com/css2?${faces.map(fam).join('&')}&display=swap`;
}

/**
 * The pair's fonts, loaded once. Google Fonts serves them under the SIL Open
 * Font License. A canvas draws with whatever font is ready at that moment,
 * so every draw waits for this — at most four seconds, then it draws with
 * the fallback rather than not at all (an office network that blocks Google
 * Fonts still gets a design).
 */
export function ensureFonts(pair: FontPair): Promise<void> {
  const key = pair.id;
  const had = fontReady.get(key);
  if (had) return had;
  const p = (async () => {
    if (typeof document === 'undefined') return;
    const href = googleFontsUrl(pair);
    if (!fontLinks.has(href)) {
      const l = document.createElement('link');
      l.rel = 'stylesheet'; l.href = href; l.crossOrigin = 'anonymous';
      document.head.appendChild(l);
      fontLinks.add(href);
      await new Promise<void>(res => { l.onload = () => res(); l.onerror = () => res(); setTimeout(res, 2500); });
    }
    const loads: Promise<unknown>[] = [];
    for (const f of [pair.display, pair.body]) for (const w of f.weights) {
      loads.push(document.fonts.load(`${w} 40px "${f.family}"`));
      if (f.italic) loads.push(document.fonts.load(`italic ${w} 40px "${f.family}"`));
    }
    await Promise.race([Promise.allSettled(loads), new Promise(res => setTimeout(res, 4000))]);
  })();
  fontReady.set(key, p);
  return p;
}

const SERIFS = /Playfair|Cormorant|DM Serif|Georgia/;
const stack = (family: string) => `"${family}", ${SERIFS.test(family) ? 'Georgia, "Times New Roman", serif' : 'Inter, "Helvetica Neue", Arial, sans-serif'}`;

/* ── Images ──────────────────────────────────────────────────────────────── */

const images = new Map<string, Promise<HTMLImageElement | null>>();

function loadImage(src: string): Promise<HTMLImageElement | null> {
  const had = images.get(src);
  if (had) return had;
  const p = new Promise<HTMLImageElement | null>(res => {
    const img = new Image();
    if (/^https?:/i.test(src)) img.crossOrigin = 'anonymous';
    img.decoding = 'async';
    img.onload = () => res(img);
    img.onerror = () => res(null);
    img.src = src;
  });
  images.set(src, p);
  /* A failed load is not cached for ever: the next draw tries again. */
  void p.then(i => { if (!i) setTimeout(() => images.delete(src), 15_000); });
  return p;
}

/* ── Geometry ────────────────────────────────────────────────────────────── */

interface Px { x: number; y: number; w: number; h: number }

function boxFor(l: Layer, aspect: AspectClass): Box | null {
  const over = l.at?.[aspect];
  if (over === null) return null;
  return { x: over?.x ?? l.box.x, y: over?.y ?? l.box.y, w: over?.w ?? l.box.w, h: over?.h ?? l.box.h };
}

/** The layer as drawn on this shape of canvas: its alignment and mask overrides applied. */
function tweaked<L extends Layer>(l: L, aspect: AspectClass): L {
  const over = l.at?.[aspect];
  if (!over || (over.align === undefined && over.valign === undefined && over.mask === undefined)) return l;
  return { ...l, ...(over.align ? { align: over.align } : {}), ...(over.valign ? { valign: over.valign } : {}), ...(over.mask ? { mask: over.mask } : {}) };
}

function paintOf(ctx: CanvasRenderingContext2D, p: Paint, b: Px, pal: Record<Token, string>): string | CanvasGradient {
  if (typeof p === 'string') return resolveColor(p, pal);
  if (p.type === 'linear') {
    const a = (p.angle * Math.PI) / 180;
    const dx = Math.sin(a), dy = -Math.cos(a);
    const len = Math.abs(b.w * dx) + Math.abs(b.h * dy);
    const cx = b.x + b.w / 2, cy = b.y + b.h / 2;
    const g = ctx.createLinearGradient(cx - (dx * len) / 2, cy - (dy * len) / 2, cx + (dx * len) / 2, cy + (dy * len) / 2);
    for (const [c, at] of p.stops) g.addColorStop(Math.max(0, Math.min(1, at)), resolveColor(c, pal));
    return g;
  }
  const g = ctx.createRadialGradient(b.x + p.cx * b.w, b.y + p.cy * b.h, 0, b.x + p.cx * b.w, b.y + p.cy * b.h, p.r * Math.max(b.w, b.h));
  for (const [c, at] of p.stops) g.addColorStop(Math.max(0, Math.min(1, at)), resolveColor(c, pal));
  return g;
}

function roundRect(ctx: CanvasRenderingContext2D, b: Px, r: number) {
  const rr = Math.max(0, Math.min(r, b.w / 2, b.h / 2));
  ctx.beginPath();
  ctx.moveTo(b.x + rr, b.y);
  ctx.arcTo(b.x + b.w, b.y, b.x + b.w, b.y + b.h, rr);
  ctx.arcTo(b.x + b.w, b.y + b.h, b.x, b.y + b.h, rr);
  ctx.arcTo(b.x, b.y + b.h, b.x, b.y, rr);
  ctx.arcTo(b.x, b.y, b.x + b.w, b.y, rr);
  ctx.closePath();
}

function maskPath(ctx: CanvasRenderingContext2D, mask: string, b: Px, radius: number) {
  ctx.beginPath();
  switch (mask) {
    case 'circle': ctx.arc(b.x + b.w / 2, b.y + b.h / 2, Math.min(b.w, b.h) / 2, 0, Math.PI * 2); break;
    case 'pill': roundRect(ctx, b, Math.min(b.w, b.h) / 2); break;
    case 'rounded': roundRect(ctx, b, radius); break;
    case 'arch': {
      const r = b.w / 2;
      ctx.moveTo(b.x, b.y + b.h);
      ctx.lineTo(b.x, b.y + r);
      ctx.arc(b.x + r, b.y + r, r, Math.PI, 0);
      ctx.lineTo(b.x + b.w, b.y + b.h);
      ctx.closePath();
      break;
    }
    case 'slant-left': ctx.moveTo(b.x + b.w * 0.22, b.y); ctx.lineTo(b.x + b.w, b.y); ctx.lineTo(b.x + b.w, b.y + b.h); ctx.lineTo(b.x, b.y + b.h); ctx.closePath(); break;
    case 'slant-bottom': ctx.moveTo(b.x, b.y); ctx.lineTo(b.x + b.w, b.y); ctx.lineTo(b.x + b.w, b.y + b.h * 0.86); ctx.lineTo(b.x, b.y + b.h); ctx.closePath(); break;
    case 'slant-right': ctx.moveTo(b.x, b.y); ctx.lineTo(b.x + b.w, b.y); ctx.lineTo(b.x + b.w * 0.78, b.y + b.h); ctx.lineTo(b.x, b.y + b.h); ctx.closePath(); break;
    case 'blob': {
      /* Eight points on a wobbling ring, joined smoothly — the same shape every time. */
      const cx = b.x + b.w / 2, cy = b.y + b.h / 2;
      const k = [1, 0.92, 1.04, 0.95, 1.02, 0.9, 1.05, 0.94];
      const pts = k.map((f, i) => { const a = (i / k.length) * Math.PI * 2 - Math.PI / 2; return [cx + Math.cos(a) * (b.w / 2) * f, cy + Math.sin(a) * (b.h / 2) * f]; });
      const mid = (p: number[], q: number[]) => [(p[0] + q[0]) / 2, (p[1] + q[1]) / 2];
      const s = mid(pts[pts.length - 1], pts[0]);
      ctx.moveTo(s[0], s[1]);
      pts.forEach((p, i) => { const m = mid(p, pts[(i + 1) % pts.length]); ctx.quadraticCurveTo(p[0], p[1], m[0], m[1]); });
      ctx.closePath();
      break;
    }
    default: ctx.rect(b.x, b.y, b.w, b.h);
  }
}

/* ── Text ────────────────────────────────────────────────────────────────── */

interface Fitted { size: number; lines: string[]; lineHeight: number; font: string }

function fontString(family: string, weight: number, size: number, italic?: boolean) {
  return `${italic ? 'italic ' : ''}${weight} ${Math.max(1, size).toFixed(1)}px ${stack(family)}`;
}

function setTracking(ctx: CanvasRenderingContext2D, px: number) {
  const c = ctx as CanvasRenderingContext2D & { letterSpacing?: string };
  if ('letterSpacing' in c) c.letterSpacing = `${px.toFixed(2)}px`;
}

function wrap(ctx: CanvasRenderingContext2D, text: string, maxW: number): string[] {
  const out: string[] = [];
  for (const para of text.split('\n')) {
    const words = para.split(/\s+/).filter(Boolean);
    let line = '';
    for (const w of words) {
      const next = line ? `${line} ${w}` : w;
      if (ctx.measureText(next).width <= maxW || !line) line = next;
      else { out.push(line); line = w; }
    }
    out.push(line);
  }
  return out;
}

/**
 * The largest size, from `size` down to `minSize`, at which the words fit
 * the box in `maxLines` lines with no word wider than the box. If even the
 * smallest does not fit, the last line ends in an ellipsis — the box is never
 * overrun, so the composition holds whatever is typed.
 */
export function fitText(ctx: CanvasRenderingContext2D, text: string, b: Px, o: { family: string; weight: number; italic?: boolean; max: number; min: number; lineHeight: number; maxLines: number; tracking: number }): Fitted {
  let size = o.max;
  const step = Math.max(0.5, o.max * 0.04);
  for (;;) {
    const font = fontString(o.family, o.weight, size, o.italic);
    ctx.font = font;
    setTracking(ctx, o.tracking * size);
    const lines = wrap(ctx, text, b.w);
    const widest = Math.max(...lines.map(l => ctx.measureText(l).width));
    const tall = lines.length * size * o.lineHeight;
    if ((lines.length <= o.maxLines && tall <= b.h + size * 0.15 && widest <= b.w + 0.5) || size <= o.min) {
      if (lines.length > o.maxLines || tall > b.h + size * 0.15) {
        const keep = Math.max(1, Math.min(o.maxLines, Math.floor((b.h + size * 0.15) / (size * o.lineHeight))));
        const cut = lines.slice(0, keep);
        let last = cut[cut.length - 1];
        while (last && ctx.measureText(`${last}…`).width > b.w) last = last.replace(/\s*\S+$/, '');
        cut[cut.length - 1] = `${last || cut[cut.length - 1]}…`;
        return { size, lines: cut, lineHeight: o.lineHeight, font };
      }
      return { size, lines, lineHeight: o.lineHeight, font };
    }
    size = Math.max(o.min, size - step);
  }
}

/* ── Icons ───────────────────────────────────────────────────────────────── */

/* 24-unit outline icons in the style of the app's own (lucide), drawn as paths. */
const ICONS: Record<IconName, { d: string; fill?: boolean }> = {
  check: { d: 'M20 6 9 17l-5-5' },
  star: { d: 'M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01z', fill: true },
  arrow: { d: 'M5 12h14M13 5l7 7-7 7' },
  phone: { d: 'M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 22 16.92z' },
  globe: { d: 'M12 2a10 10 0 1 0 0 20a10 10 0 1 0 0-20zM2 12h20M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z' },
  pin: { d: 'M20 10c0 6-8 12-8 12s-8-6-8-12a8 8 0 0 1 16 0zM12 7a3 3 0 1 0 0 6a3 3 0 1 0 0-6z' },
  calendar: { d: 'M5 4h14a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2zM16 2v4M8 2v4M3 10h18' },
  clock: { d: 'M12 2a10 10 0 1 0 0 20a10 10 0 1 0 0-20zM12 6v6l4 2' },
  quote: { d: 'M3 21c3 0 7-1 7-8V5H3v8h4c0 4-2 5-4 5zM14 21c3 0 7-1 7-8V5h-7v8h4c0 4-2 5-4 5z', fill: true },
  spark: { d: 'M12 2l2.2 6.8L21 11l-6.8 2.2L12 20l-2.2-6.8L3 11l6.8-2.2z', fill: true },
  home: { d: 'M3 10.5 12 3l9 7.5V20a1 1 0 0 1-1 1h-5v-6H9v6H4a1 1 0 0 1-1-1z' },
  bed: { d: 'M2 20v-8a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v8M2 16h20M6 10V7a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v3' },
  bath: { d: 'M4 12h16v3a5 5 0 0 1-5 5H9a5 5 0 0 1-5-5zM6 12V5a2 2 0 0 1 3.5-1.3M7 20l-1 2M17 20l1 2' },
  area: { d: 'M3 3h18v18H3zM3 9h4M3 15h4M9 3v4M15 3v4' },
  snow: { d: 'M12 2v20M4.9 6l14.2 12M19.1 6 4.9 18M9 4l3 2 3-2M9 20l3-2 3 2' },
  sun: { d: 'M12 8a4 4 0 1 0 0 8a4 4 0 1 0 0-8zM12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4' },
  leaf: { d: 'M11 20A7 7 0 0 1 9.8 6.1C15.5 5 17 4.5 19 2c1 2 2 4.2 2 8 0 5.5-4.8 10-10 10zM2 21c0-3 1.9-5.4 5.1-6' },
  bag: { d: 'M6 2 3 6v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V6l-3-4zM3 6h18M16 10a4 4 0 0 1-8 0' },
  play: { d: 'M6 4l14 8-14 8z', fill: true },
  mail: { d: 'M4 4h16a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2zM22 6l-10 7L2 6' },
};

function drawIcon(ctx: CanvasRenderingContext2D, name: IconName, b: Px, color: string, weight = 2) {
  const icon = ICONS[name];
  if (!icon) return;
  const s = Math.min(b.w, b.h) / 24;
  ctx.save();
  ctx.translate(b.x + (b.w - 24 * s) / 2, b.y + (b.h - 24 * s) / 2);
  ctx.scale(s, s);
  const p = new Path2D(icon.d);
  if (icon.fill) { ctx.fillStyle = color; ctx.fill(p); }
  else { ctx.strokeStyle = color; ctx.lineWidth = weight; ctx.lineCap = 'round'; ctx.lineJoin = 'round'; ctx.stroke(p); }
  ctx.restore();
}

function starPath(ctx: CanvasRenderingContext2D, cx: number, cy: number, outer: number, inner: number, points: number) {
  ctx.beginPath();
  for (let i = 0; i < points * 2; i++) {
    const r = i % 2 ? inner : outer, a = (i / (points * 2)) * Math.PI * 2 - Math.PI / 2;
    const x = cx + Math.cos(a) * r, y = cy + Math.sin(a) * r;
    if (i) ctx.lineTo(x, y); else ctx.moveTo(x, y);
  }
  ctx.closePath();
}

/* ── The drawing ─────────────────────────────────────────────────────────── */

export interface DrawOptions {
  /** CSS pixels wide. The canvas is sized to this times `dpr`. */
  width: number;
  dpr?: number;
  /** Which carousel page. 0 for a single design. */
  page?: number;
  /** Draw missing must-have slots as placeholders (the editor and gallery) — on by default. */
  placeholders?: boolean;
  /** A gallery card: own-photo templates show a labelled sample picture. */
  preview?: boolean;
  /** Turns `media:<id>` into a fetchable address. */
  resolveMedia?: (id: string) => Promise<string | null>;
}

export interface DrawResult {
  /** The must-have slots still showing a placeholder, in words. */
  placeholders: string[];
  /** Pictures that could not be loaded. */
  missingImages: string[];
  pages: number;
}

/** How many pages a design has: 1, or a carousel's cover + slides + end. */
export function pageCount(doc: DesignDoc, tpl: TemplateSpec = templateOf(doc.templateId)): number {
  return tpl.pages ? 2 + Math.max(1, (doc.content.slides ?? []).length) : 1;
}

function pageOf(doc: DesignDoc, tpl: TemplateSpec, page: number): { spec: PageSpec; slide: number } {
  if (!tpl.pages) return { spec: { background: tpl.background, layers: tpl.layers }, slide: -1 };
  const n = pageCount(doc, tpl);
  if (page <= 0) return { spec: tpl.pages.cover, slide: -1 };
  if (page >= n - 1) return { spec: tpl.pages.end, slide: -1 };
  return { spec: tpl.pages.slide, slide: page - 1 };
}

/** The picture for a slot, as the customer set it or the template's library photo. */
export function imageFor(doc: DesignDoc, tpl: TemplateSpec, slot: ImageSlot, preview = false): ImageRef | null {
  const set = doc.images[slot];
  if (set?.src) return set;
  if (slot === 'logo') return null;
  /* A template that needs the customer's own picture gets a placeholder,
     not a stranger's photo — except on a gallery card, where a sample is
     drawn and labelled "Sample photo". */
  if (!preview && (slot === 'avatar' || (tpl.ownPhotos && slot !== 'product'))) return null;
  const pool = photosFor(tpl.photoTopics);
  const pick = pool[(slot === 'photo2' ? 1 : slot === 'product' ? 2 : slot === 'avatar' ? 1 : 0) % pool.length];
  return pick ? { src: `library:${pick.id}`, libraryId: pick.id, focal: pick.focal, origin: 'library' } : null;
}

export async function drawDesign(canvas: HTMLCanvasElement, doc: DesignDoc, opt: DrawOptions): Promise<DrawResult> {
  const tpl = templateOf(doc.templateId);
  const fmt = formatOf(doc.format);
  const W = fmt.width, H = fmt.height, U = Math.min(W, H);
  const dpr = opt.dpr ?? 1;
  const scale = (opt.width * dpr) / W;
  const pal = paletteFor(doc.colors);
  const pair = fontPairOf(doc.fontPair ?? tpl.fontPair);
  const hidden = new Set(doc.hidden ?? []);
  const showPlaceholders = opt.placeholders !== false;
  const { spec, slide } = pageOf(doc, tpl, opt.page ?? 0);
  const result: DrawResult = { placeholders: [], missingImages: [], pages: pageCount(doc, tpl) };

  await ensureFonts(pair);

  /* Every picture this page needs, fetched at once and at its own size. */
  const pending = new Map<string, Promise<HTMLImageElement | null>>();
  const srcFor = async (ref: ImageRef, pxW: number, pxH: number): Promise<string | null> => {
    if (ref.libraryId || ref.src.startsWith('library:')) {
      const id = ref.libraryId ?? ref.src.slice(8);
      const ph = photoById(id);
      return photoUrl(id, pxW, pxH, ref.focal ?? ph?.focal ?? [0.5, 0.5], ref.zoom ?? 1);
    }
    if (ref.src.startsWith('media:')) return opt.resolveMedia ? opt.resolveMedia(ref.src.slice(6)) : null;
    return ref.src;
  };
  const visible = (l: Layer) => {
    if (l.toggle && hidden.has(l.toggle)) return false;
    return true;
  };
  for (const l of spec.layers) {
    if (l.kind !== 'image' || !visible(l)) continue;
    const b = boxFor(l, fmt.aspect);
    const ref = imageFor(doc, tpl, l.slot, opt.preview);
    if (!b || !ref) continue;
    const src = await srcFor(ref, b.w * W * scale, b.h * H * scale);
    if (src) pending.set(`${l.slot}|${src}`, loadImage(src));
  }

  canvas.width = Math.max(1, Math.round(W * scale));
  canvas.height = Math.max(1, Math.round(H * scale));
  const ctx = canvas.getContext('2d');
  if (!ctx) return result;
  ctx.setTransform(scale, 0, 0, scale, 0, 0);
  ctx.textBaseline = 'alphabetic';
  ctx.imageSmoothingQuality = 'high';

  const full: Px = { x: 0, y: 0, w: W, h: H };
  ctx.fillStyle = paintOf(ctx, spec.background, full, pal);
  ctx.fillRect(0, 0, W, H);

  const textOf = (slot: TextSlot): string => slotText(doc, slot, slide);
  const has = (slot: string): boolean => {
    if (slot === 'points') return (doc.content.points ?? []).some(p => p.trim());
    if (['photo', 'photo2', 'product', 'logo', 'avatar'].includes(slot)) return !!imageFor(doc, tpl, slot as ImageSlot, opt.preview);
    return !!textOf(slot as TextSlot).trim();
  };
  const needed = (slot: string) => tpl.needs.includes(slot as never);

  for (const raw of spec.layers) {
    if (!visible(raw)) continue;
    const l = tweaked(raw, fmt.aspect);
    const bx = boxFor(l, fmt.aspect);
    if (!bx) continue;
    /* A slot the template needs is drawn as a placeholder when empty; one it
       can do without takes its layers away with it. */
    const missing = (l.when ?? []).filter(s => !has(s));
    if (missing.length && !(showPlaceholders && missing.every(needed))) continue;
    if (l.unless && has(l.unless)) continue;
    const b: Px = { x: bx.x * W, y: bx.y * H, w: bx.w * W, h: bx.h * H };
    ctx.save();
    ctx.globalAlpha = l.opacity ?? 1;
    if (l.rotate) {
      ctx.translate(b.x + b.w / 2, b.y + b.h / 2);
      ctx.rotate((l.rotate * Math.PI) / 180);
      ctx.translate(-(b.x + b.w / 2), -(b.y + b.h / 2));
    }
    if (l.shadow) {
      ctx.shadowColor = resolveColor(l.shadow.color, pal);
      ctx.shadowBlur = l.shadow.blur * U;
      ctx.shadowOffsetY = l.shadow.y * U;
    }
    switch (l.kind) {
      case 'rect': {
        ctx.fillStyle = paintOf(ctx, l.fill, b, pal);
        const r = l.radius === 'pill' ? Math.min(b.w, b.h) / 2 : (l.radius ?? 0) * U;
        roundRect(ctx, b, r);
        ctx.fill();
        if (l.stroke) { ctx.shadowColor = 'transparent'; ctx.strokeStyle = resolveColor(l.stroke.color, pal); ctx.lineWidth = l.stroke.width * U; ctx.stroke(); }
        break;
      }
      case 'ellipse': {
        /* Always a circle: a box in fractions is only square on a square canvas. */
        const r = Math.min(b.w, b.h) / 2;
        ctx.fillStyle = paintOf(ctx, l.fill, b, pal);
        ctx.beginPath(); ctx.arc(b.x + b.w / 2, b.y + b.h / 2, r, 0, Math.PI * 2); ctx.fill();
        if (l.stroke) { ctx.shadowColor = 'transparent'; ctx.strokeStyle = resolveColor(l.stroke.color, pal); ctx.lineWidth = l.stroke.width * U; ctx.stroke(); }
        break;
      }
      case 'poly': {
        ctx.fillStyle = paintOf(ctx, l.fill, b, pal);
        ctx.beginPath();
        l.points.forEach(([px, py], i) => { const x = b.x + px * b.w, y = b.y + py * b.h; if (i) ctx.lineTo(x, y); else ctx.moveTo(x, y); });
        ctx.closePath(); ctx.fill();
        break;
      }
      case 'pattern': {
        ctx.strokeStyle = ctx.fillStyle = resolveColor(l.color, pal);
        const sp = l.spacing * U;
        ctx.beginPath(); ctx.rect(b.x, b.y, b.w, b.h); ctx.clip();
        ctx.lineWidth = Math.max(1, sp * 0.06);
        if (l.pattern === 'dots') { for (let y = b.y + sp / 2; y < b.y + b.h; y += sp) for (let x = b.x + sp / 2; x < b.x + b.w; x += sp) { ctx.beginPath(); ctx.arc(x, y, sp * 0.09, 0, Math.PI * 2); ctx.fill(); } }
        else if (l.pattern === 'grid') { ctx.beginPath(); for (let x = b.x; x <= b.x + b.w; x += sp) { ctx.moveTo(x, b.y); ctx.lineTo(x, b.y + b.h); } for (let y = b.y; y <= b.y + b.h; y += sp) { ctx.moveTo(b.x, y); ctx.lineTo(b.x + b.w, y); } ctx.stroke(); }
        else if (l.pattern === 'diagonal') { ctx.lineWidth = sp * 0.32; ctx.beginPath(); for (let x = b.x - b.h; x < b.x + b.w; x += sp) { ctx.moveTo(x, b.y + b.h); ctx.lineTo(x + b.h, b.y); } ctx.stroke(); }
        else if (l.pattern === 'rings') { const cx = b.x + b.w / 2, cy = b.y + b.h / 2; ctx.beginPath(); for (let r = sp; r < Math.hypot(b.w, b.h); r += sp) { ctx.moveTo(cx + r, cy); ctx.arc(cx, cy, r, 0, Math.PI * 2); } ctx.stroke(); }
        else { ctx.beginPath(); for (let y = b.y; y < b.y + b.h + sp; y += sp) { ctx.moveTo(b.x, y); for (let x = b.x; x <= b.x + b.w; x += sp / 4) ctx.lineTo(x, y + Math.sin((x - b.x) / sp * Math.PI * 2) * sp * 0.18); } ctx.stroke(); }
        break;
      }
      case 'image': {
        const ref = imageFor(doc, tpl, l.slot, opt.preview);
        const src = ref ? await srcFor(ref, b.w * scale, b.h * scale) : null;
        const sample = !!opt.preview && !!ref && !doc.images[l.slot]?.src && (tpl.ownPhotos || l.slot === 'avatar') && l.slot !== 'product';
        const img = src ? await (pending.get(`${l.slot}|${src}`) ?? loadImage(src)) : null;
        ctx.save();
        maskPath(ctx, l.mask ?? 'rect', b, (l.radius ?? 0) * U);
        ctx.clip();
        if (img) {
          if (l.filter === 'grayscale') ctx.filter = 'grayscale(1) contrast(1.05)';
          else if (l.filter === 'warm') ctx.filter = 'sepia(0.22) saturate(1.15) contrast(1.03)';
          else if (l.filter === 'dim') ctx.filter = 'brightness(0.78) contrast(1.05)';
          const iw = img.naturalWidth, ih = img.naturalHeight;
          if (l.fit === 'contain') {
            const s = Math.min(b.w / iw, b.h / ih);
            ctx.drawImage(img, b.x + (b.w - iw * s) / 2, b.y + (b.h - ih * s) / 2, iw * s, ih * s);
          } else {
            const z = ref?.libraryId ? 1 : Math.max(1, ref?.zoom ?? 1);
            const s = Math.max(b.w / iw, b.h / ih) * z;
            const [fx, fy] = ref?.libraryId ? [0.5, 0.5] : (ref?.focal ?? [0.5, 0.5]);
            const dw = iw * s, dh = ih * s;
            const ox = Math.min(0, Math.max(b.w - dw, b.w / 2 - fx * dw));
            const oy = Math.min(0, Math.max(b.h - dh, b.h / 2 - fy * dh));
            ctx.drawImage(img, b.x + ox, b.y + oy, dw, dh);
          }
          ctx.filter = 'none';
        } else if (l.slot !== 'logo') {
          /* No picture yet: a calm placeholder that says what goes here, never a stranger's photo. */
          ctx.fillStyle = '#e7e5e1'; ctx.fillRect(b.x, b.y, b.w, b.h);
          ctx.strokeStyle = 'rgba(20,22,26,0.07)'; ctx.lineWidth = U * 0.012;
          ctx.beginPath(); for (let x = b.x - b.h; x < b.x + b.w; x += U * 0.05) { ctx.moveTo(x, b.y + b.h); ctx.lineTo(x + b.h, b.y); } ctx.stroke();
          const ic = Math.min(b.w, b.h) * 0.16;
          drawIcon(ctx, l.slot === 'avatar' ? 'spark' : 'home', { x: b.x + b.w / 2 - ic / 2, y: b.y + b.h / 2 - ic * 0.9, w: ic, h: ic }, '#9a958d');
          ctx.fillStyle = '#7a756d'; ctx.font = fontString(pair.body.family, 600, Math.max(10, Math.min(b.w, b.h) * 0.06)); ctx.textAlign = 'center';
          ctx.fillText(src ? 'Picture could not load' : l.slot === 'avatar' ? 'Add your photo' : 'Add your own photo', b.x + b.w / 2, b.y + b.h / 2 + ic * 0.75);
          if (src) result.missingImages.push(l.slot); else if (showPlaceholders) result.placeholders.push(l.slot === 'avatar' ? 'Your photo' : 'Your own photo');
        } else if (src) result.missingImages.push('logo');
        if (l.tint) { ctx.fillStyle = paintOf(ctx, l.tint, b, pal); ctx.fillRect(b.x, b.y, b.w, b.h); }
        if (sample && img) {
          const ts = Math.max(9, U * 0.02);
          ctx.font = fontString(pair.body.family, 700, ts); setTracking(ctx, 0);
          const tw = ctx.measureText('SAMPLE PHOTO').width + ts * 1.2;
          const cb = l.mask === 'circle' ? { x: b.x + b.w / 2 - tw / 2, y: b.y + b.h * 0.8 } : { x: b.x + ts * 0.8, y: b.y + b.h - ts * 2.6 };
          ctx.fillStyle = 'rgba(0,0,0,0.55)'; roundRect(ctx, { x: cb.x, y: cb.y, w: tw, h: ts * 1.8 }, ts * 0.9); ctx.fill();
          ctx.fillStyle = '#ffffff'; ctx.textAlign = 'left'; ctx.fillText('SAMPLE PHOTO', cb.x + ts * 0.6, cb.y + ts * 1.28);
        }
        ctx.restore();
        if (l.stroke) { ctx.save(); maskPath(ctx, l.mask ?? 'rect', b, (l.radius ?? 0) * U); ctx.strokeStyle = resolveColor(l.stroke.color, pal); ctx.lineWidth = l.stroke.width * U; ctx.stroke(); ctx.restore(); }
        break;
      }
      case 'text': {
        drawText(ctx, l, b, U, pal, pair, textOf, needed, showPlaceholders, result, doc);
        break;
      }
      case 'button': {
        const raw = textOf(l.slot);
        const word = raw || (needed(l.slot) && showPlaceholders ? PLACEHOLDER[l.slot] : '');
        if (!word) break;
        if (!raw) result.placeholders.push(PLACEHOLDER[l.slot]);
        const fam = l.font === 'display' ? pair.display.family : pair.body.family;
        const label = (l.upper ? word.toUpperCase() : word) + (l.arrow ? '  →' : '');
        let size = l.size * U;
        ctx.font = fontString(fam, l.weight ?? 700, size);
        setTracking(ctx, (l.tracking ?? 0) * size);
        const padX = size * 1.1;
        while (ctx.measureText(label).width + padX * 2 > b.w && size > l.size * U * 0.55) { size *= 0.94; ctx.font = fontString(fam, l.weight ?? 700, size); setTracking(ctx, (l.tracking ?? 0) * size); }
        const tw = Math.min(b.w, ctx.measureText(label).width + padX * 2);
        const th = Math.min(b.h, size * 2.4);
        const bx = l.align === 'center' ? b.x + (b.w - tw) / 2 : l.align === 'right' ? b.x + b.w - tw : b.x;
        const by = b.y + (b.h - th) / 2;
        const r = l.radius === 'pill' || l.radius === undefined ? th / 2 : l.radius * U;
        roundRect(ctx, { x: bx, y: by, w: tw, h: th }, r);
        ctx.globalAlpha = (l.opacity ?? 1) * (raw ? 1 : 0.6);
        if (l.outline) { ctx.strokeStyle = resolveColor(l.fill, pal); ctx.lineWidth = Math.max(2, size * 0.09); ctx.stroke(); }
        else { ctx.fillStyle = resolveColor(l.fill, pal); ctx.fill(); }
        ctx.shadowColor = 'transparent';
        ctx.fillStyle = resolveColor(l.color, pal);
        ctx.textAlign = 'center';
        ctx.fillText(label, bx + tw / 2, by + th / 2 + size * 0.36);
        break;
      }
      case 'badge': {
        const raw = textOf(l.slot);
        const word = raw || (needed(l.slot) && showPlaceholders ? PLACEHOLDER[l.slot] : '');
        if (!word) break;
        if (!raw) result.placeholders.push(PLACEHOLDER[l.slot]);
        const d = Math.min(b.w, b.h);
        const cx = b.x + b.w / 2, cy = b.y + b.h / 2;
        ctx.fillStyle = resolveColor(l.fill, pal);
        if (l.shape === 'circle') { ctx.beginPath(); ctx.arc(cx, cy, d / 2, 0, Math.PI * 2); ctx.fill(); }
        else if (l.shape === 'burst') { starPath(ctx, cx, cy, d / 2, d / 2 * 0.86, 18); ctx.fill(); }
        else { roundRect(ctx, b, l.shape === 'pill' ? b.h / 2 : U * 0.012); ctx.fill(); }
        ctx.shadowColor = 'transparent';
        const inner: Px = l.shape === 'circle' || l.shape === 'burst' ? { x: cx - d * 0.34, y: cy - d * 0.3, w: d * 0.68, h: d * 0.6 } : { x: b.x + b.h * 0.3, y: b.y + b.h * 0.12, w: b.w - b.h * 0.6, h: b.h * 0.76 };
        const fam = l.font === 'display' ? pair.display.family : pair.body.family;
        ctx.globalAlpha = (l.opacity ?? 1) * (raw ? 1 : 0.65);
        ctx.fillStyle = resolveColor(l.color, pal);
        ctx.textAlign = 'center';
        let top = inner.y;
        if (l.label && raw) {
          const ls = inner.h * 0.16;
          ctx.font = fontString(pair.body.family, 700, ls); setTracking(ctx, ls * 0.12);
          ctx.fillText(l.label.toUpperCase(), cx, inner.y + ls);
          top += ls * 1.5;
        }
        const f = fitText(ctx, l.upper ? word.toUpperCase() : word, { ...inner, y: top, h: inner.y + inner.h - top }, { family: fam, weight: l.weight ?? 800, max: l.size * U, min: l.size * U * 0.3, lineHeight: 1.02, maxLines: 3, tracking: 0 });
        ctx.font = f.font;
        const total = f.lines.length * f.size * f.lineHeight;
        const y0 = top + ((inner.y + inner.h - top) - total) / 2 + f.size * 0.82;
        f.lines.forEach((line, i) => ctx.fillText(line, cx, y0 + i * f.size * f.lineHeight));
        break;
      }
      case 'icon': {
        /* `auto`: the season's own mark, from the occasion the customer named. */
        const occ = (doc.content.occasion ?? doc.content.eyebrow ?? doc.content.headline ?? '').toLowerCase();
        const name: IconName = l.auto ? (/winter|snow|christmas|holiday|cold|freez|furnace|heat/.test(occ) ? 'snow' : /summer|sun|heat ?wave|cool|a\/?c\b|air/.test(occ) ? 'sun' : /autumn|fall|leaf|thanksgiving/.test(occ) ? 'leaf' : l.name) : l.name;
        drawIcon(ctx, name, b, resolveColor(l.color, pal), l.weight ?? 2);
        break;
      }
      case 'list': {
        const items = (doc.content.points ?? []).map(p => p.trim()).filter(Boolean).slice(0, l.maxItems ?? 4);
        const shown = items.length ? items : needed('points') && showPlaceholders ? [PLACEHOLDER.points, PLACEHOLDER.points, PLACEHOLDER.points] : [];
        if (!items.length && shown.length) result.placeholders.push('Your points');
        if (!shown.length) break;
        const fam = l.font === 'display' ? pair.display.family : pair.body.family;
        const lh = l.lineHeight ?? 1.25;
        let size = l.size * U;
        const lay = () => {
          ctx.font = fontString(fam, l.weight ?? 500, size); setTracking(ctx, 0);
          const indent = size * 1.7;
          const rows = shown.map(t => wrap(ctx, t, b.w - indent));
          const tall = rows.reduce((s, r) => s + r.length * size * lh, 0) + (rows.length - 1) * size * 0.7;
          return { rows, tall, indent };
        };
        let L = lay();
        while (L.tall > b.h && size > l.size * U * 0.5) { size *= 0.94; L = lay(); }
        let y = b.y + Math.max(0, (b.h - L.tall) / 2);
        ctx.globalAlpha = (l.opacity ?? 1) * (items.length ? 1 : 0.55);
        L.rows.forEach((row, i) => {
          const bs = size * 1.15;
          if (l.bulletFill) { ctx.fillStyle = resolveColor(l.bulletFill, pal); ctx.beginPath(); ctx.arc(b.x + bs / 2, y + size * 0.55, bs / 2, 0, Math.PI * 2); ctx.fill(); }
          if (l.bullet === 'check') drawIcon(ctx, 'check', { x: b.x + bs * 0.18, y: y + size * 0.55 - bs * 0.32, w: bs * 0.64, h: bs * 0.64 }, resolveColor(l.bulletColor, pal), 3);
          else if (l.bullet === 'number') { ctx.fillStyle = resolveColor(l.bulletColor, pal); ctx.font = fontString(pair.display.family, 800, size * 0.72); ctx.textAlign = 'center'; ctx.fillText(String(i + 1), b.x + bs / 2, y + size * 0.8); }
          else if (l.bullet === 'dot') { ctx.fillStyle = resolveColor(l.bulletColor, pal); ctx.beginPath(); ctx.arc(b.x + bs / 2, y + size * 0.55, size * 0.16, 0, Math.PI * 2); ctx.fill(); }
          else { ctx.fillStyle = resolveColor(l.bulletColor, pal); ctx.fillRect(b.x, y + size * 0.5, size * 0.8, Math.max(2, size * 0.09)); }
          ctx.font = fontString(fam, l.weight ?? 500, size); ctx.textAlign = 'left'; ctx.fillStyle = resolveColor(l.color, pal);
          row.forEach((line, j) => ctx.fillText(line, b.x + L.indent, y + size * 0.86 + j * size * lh));
          y += row.length * size * lh + size * 0.7;
        });
        break;
      }
      case 'stars': {
        const n = Math.max(0, Math.min(5, Number.parseFloat(textOf('rating')) || 0));
        if (!n) break;
        const s = Math.min(b.h, b.w / 5.6);
        const total = s * 5 + s * 0.15 * 4;
        let x = l.align === 'center' ? b.x + (b.w - total) / 2 : l.align === 'right' ? b.x + b.w - total : b.x;
        for (let i = 0; i < 5; i++) {
          starPath(ctx, x + s / 2, b.y + b.h / 2, s / 2, s / 2 * 0.45, 5);
          ctx.fillStyle = resolveColor(i < Math.round(n) ? l.color : (l.empty ?? 'rgba(0,0,0,0.15)'), pal);
          ctx.fill();
          x += s * 1.15;
        }
        break;
      }
    }
    ctx.restore();
  }
  return result;
}

function drawText(
  ctx: CanvasRenderingContext2D, l: TextLayer, b: Px, U: number, pal: Record<Token, string>, pair: FontPair,
  textOf: (s: TextSlot) => string, needed: (s: string) => boolean, showPlaceholders: boolean, result: DrawResult, doc: DesignDoc,
) {
  let raw = l.slot ? textOf(l.slot) : (l.text ?? '').replace(/\{company\}/g, doc.company || '');
  let placeholder = false;
  if (!raw.trim() && l.slot && needed(l.slot) && showPlaceholders) { raw = PLACEHOLDER[l.slot]; placeholder = true; result.placeholders.push(PLACEHOLDER[l.slot]); }
  if (!raw.trim()) return;
  const text = `${l.prefix ?? ''}${l.upper ? raw.toUpperCase() : raw}`;
  const family = l.font === 'display' ? pair.display.family : pair.body.family;
  const weight = l.weight ?? (l.font === 'display' ? pair.display.weights[pair.display.weights.length - 1] : 400);
  const f = fitText(ctx, text, b, {
    family, weight, italic: l.italic && (l.font === 'body' || !!pair.display.italic), max: l.size * U, min: (l.minSize ?? l.size * 0.45) * U,
    lineHeight: l.lineHeight ?? 1.12, maxLines: l.maxLines ?? 4, tracking: l.tracking ?? 0,
  });
  ctx.font = f.font;
  setTracking(ctx, (l.tracking ?? 0) * f.size);
  const lineH = f.size * f.lineHeight;
  const total = f.lines.length * lineH;
  const top = l.valign === 'bottom' ? b.y + b.h - total : l.valign === 'middle' ? b.y + (b.h - total) / 2 : b.y;
  const align = l.align ?? 'left';
  ctx.textAlign = align;
  const ax = align === 'center' ? b.x + b.w / 2 : align === 'right' ? b.x + b.w : b.x;
  if (placeholder) ctx.globalAlpha *= 0.55;
  f.lines.forEach((line, i) => {
    const baseline = top + i * lineH + f.size * 0.84 + (lineH - f.size) / 2;
    if (l.highlight) {
      const w = ctx.measureText(line).width;
      const lx = align === 'center' ? ax - w / 2 : align === 'right' ? ax - w : ax;
      const sh = ctx.shadowColor; ctx.shadowColor = 'transparent';
      ctx.fillStyle = resolveColor(l.highlight, pal);
      ctx.fillRect(lx - f.size * 0.18, baseline - f.size * 0.86, w + f.size * 0.36, f.size * 1.12);
      ctx.shadowColor = sh;
    }
    ctx.fillStyle = resolveColor(l.color, pal);
    ctx.fillText(line, ax, baseline);
  });
}

/* ── Export ──────────────────────────────────────────────────────────────── */

/**
 * The finished artwork at the platform's full size, as a PNG. Throws with a
 * sentence when a picture's host does not allow it to be drawn into an image
 * (the browser then refuses to export the canvas at all).
 */
export async function exportPng(doc: DesignDoc, page = 0, resolveMedia?: DrawOptions['resolveMedia']): Promise<{ blob: Blob; result: DrawResult; width: number; height: number }> {
  const fmt = formatOf(doc.format);
  const c = document.createElement('canvas');
  const result = await drawDesign(c, doc, { width: fmt.width, dpr: 1, page, placeholders: true, resolveMedia });
  const blob = await new Promise<Blob | null>((res, rej) => {
    try { c.toBlob(b => res(b), 'image/png'); } catch (e) { rej(e); }
  }).catch(() => { throw new Error('One of the pictures is hosted somewhere that does not allow it to be drawn into a download. Upload that picture as a file instead, then export again.'); });
  if (!blob) throw new Error('The browser could not make the PNG — try again.');
  return { blob, result, width: fmt.width, height: fmt.height };
}

/** Whether light words read on a library photo — used by templates' scrims. */
export const readsLight = (bg: string) => contrast(bg, '#ffffff') >= 3;
