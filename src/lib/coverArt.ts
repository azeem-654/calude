/**
 * Cover art, composed on a canvas.
 *
 * A blog post without an image gets a blank rectangle in every share card, every
 * feed preview and every search result that shows one — so the module has to be
 * able to produce a picture for every post it writes, without an image API, a
 * stock library or a designer.
 *
 * These are typographic cards rather than illustrations, and that is a deliberate
 * choice: a generated illustration that is nearly right about a boiler is worse
 * than no illustration, whereas a well-set title card is honest about what it is
 * and looks deliberate. The palette is derived from the post's own slug, so a
 * month of covers reads as a set without any two being identical.
 *
 * Two constraints shape the implementation. Every card is checked for contrast
 * before it is returned, because a generated palette that happens to put grey on
 * grey is unreadable and nobody is going to inspect twenty of them. And output
 * is a JPEG sized for storage, because these live in localStorage next to the
 * articles and a handful of full-size PNGs would exhaust the quota on their own.
 */

export type CoverTemplate = 'editorial' | 'bold' | 'quiet' | 'stack';

export const COVER_TEMPLATES: { id: CoverTemplate; label: string; note: string }[] = [
  { id: 'editorial', label: 'Editorial', note: 'Serif-weight headline on a deep field, with a rule' },
  { id: 'bold', label: 'Bold', note: 'Large type on a saturated block' },
  { id: 'quiet', label: 'Quiet', note: 'Dark type on paper, for a considered piece' },
  { id: 'stack', label: 'Stack', note: 'Kicker, headline and brand as three bands' },
];

export interface CoverSpec {
  title: string;
  /** A short label above the headline — the cluster, or "Guide". */
  kicker?: string;
  brand?: string;
  domain?: string;
  /** Anything stable about the post. The palette is derived from it. */
  seed: string;
  template: CoverTemplate;
  /** 1200×630 is the Open Graph size every platform crops from. */
  width?: number;
  height?: number;
  /** Overrides the derived hue when a brand colour matters more than variety. */
  accent?: string;
  quality?: number;
}

/* ── Colour ── */

/** A small, stable hash. Same slug in, same palette out, forever. */
function hash(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return Math.abs(h);
}

const hsl = (h: number, s: number, l: number) => `hsl(${h} ${s}% ${l}%)`;

/** sRGB relative luminance, per WCAG. */
function luminance(rgb: [number, number, number]): number {
  const [r, g, b] = rgb.map(v => {
    const c = v / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

export function contrast(a: [number, number, number], b: [number, number, number]): number {
  const [x, y] = [luminance(a), luminance(b)].sort((p, q) => q - p);
  return (x + 0.05) / (y + 0.05);
}

export function hslToRgb(h: number, s: number, l: number): [number, number, number] {
  const S = s / 100;
  const L = l / 100;
  const k = (n: number) => (n + h / 30) % 12;
  const a = S * Math.min(L, 1 - L);
  const f = (n: number) => L - a * Math.max(-1, Math.min(k(n) - 3, Math.min(9 - k(n), 1)));
  return [Math.round(f(0) * 255), Math.round(f(8) * 255), Math.round(f(4) * 255)];
}

interface Palette {
  bg: [number, number, number];
  bgCss: string;
  bgCss2: string;
  ink: string;
  inkRgb: [number, number, number];
  muted: string;
  accent: string;
  accentRgb: [number, number, number];
}

const WHITE: [number, number, number] = [255, 255, 255];
const NEAR_BLACK: [number, number, number] = [14, 17, 23];

/**
 * A palette for one post.
 *
 * The ink is not chosen, it is measured: whichever of white or near-black has
 * more contrast against the background wins, and the background lightness is
 * pushed until that winner clears 4.5:1. A headline nobody can read is the one
 * failure mode that makes the whole feature worthless.
 */
export function paletteFor(seed: string, template: CoverTemplate, accentOverride?: string): Palette {
  const h = hash(seed);
  const hue = h % 360;
  const dark = template !== 'quiet';

  let sat = dark ? 42 + (h % 18) : 26 + (h % 12);
  let light = dark ? 20 + (h % 9) : 94;

  let bg = hslToRgb(hue, sat, light);
  let ink = contrast(bg, WHITE) >= contrast(bg, NEAR_BLACK) ? WHITE : NEAR_BLACK;

  // Walk the lightness until the better of the two inks is comfortably legible.
  for (let guard = 0; guard < 40 && contrast(bg, ink) < 4.5; guard++) {
    light += dark ? -2 : 2;
    light = Math.max(6, Math.min(97, light));
    bg = hslToRgb(hue, sat, light);
    ink = contrast(bg, WHITE) >= contrast(bg, NEAR_BLACK) ? WHITE : NEAR_BLACK;
    if (light <= 6 || light >= 97) { sat = Math.max(0, sat - 4); }
  }

  const inkCss = ink === WHITE ? '#ffffff' : '#0e1117';

  /**
   * The accent sits in the same family as the ground, not opposite it.
   *
   * A complementary hue looked striking in isolation and awful in practice —
   * magenta type on a forest-green card reads as a mistake. An analogous hue a
   * short step round the wheel separates the kicker from the headline without
   * fighting it. Its lightness is then walked until it is genuinely readable,
   * because the kicker is small text and this is the one element whose contrast
   * a designer would otherwise never check.
   */
  const accentHue = (hue + 32) % 360;
  let accentLight = dark ? 74 : 34;
  const accentSat = dark ? 62 : 58;
  let accentRgb = hslToRgb(accentHue, accentSat, accentLight);
  for (let guard = 0; guard < 40 && contrast(bg, accentRgb) < 4.5; guard++) {
    accentLight += dark ? 2 : -2;
    accentLight = Math.max(8, Math.min(95, accentLight));
    accentRgb = hslToRgb(accentHue, accentSat, accentLight);
  }

  return {
    bg,
    bgCss: hsl(hue, sat, light),
    bgCss2: hsl((hue + 18) % 360, sat, Math.max(4, Math.min(96, light + (dark ? -8 : 4)))),
    ink: inkCss,
    inkRgb: ink,
    muted: ink === WHITE ? 'rgba(255,255,255,0.66)' : 'rgba(14,17,23,0.6)',
    accent: accentOverride || hsl(accentHue, accentSat, accentLight),
    accentRgb,
  };
}

/* ── Type setting ── */

const FONT = "'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif";

function wrap(ctx: CanvasRenderingContext2D, text: string, maxWidth: number): string[] {
  const words = text.split(/\s+/).filter(Boolean);
  const lines: string[] = [];
  let line = '';
  for (const w of words) {
    const next = line ? `${line} ${w}` : w;
    if (ctx.measureText(next).width <= maxWidth || !line) line = next;
    else { lines.push(line); line = w; }
  }
  if (line) lines.push(line);
  return lines;
}

/**
 * Shrink until it fits.
 *
 * Long titles are the common case, not the exception — "How much does a combi
 * boiler service cost in Bristol?" is a perfectly ordinary long-tail keyword —
 * so the type size is solved for rather than assumed, and the headline is never
 * clipped or ellipsised.
 */
function fitHeadline(
  ctx: CanvasRenderingContext2D,
  text: string,
  maxWidth: number,
  maxHeight: number,
  start: number,
  weight = 800,
): { lines: string[]; size: number; lineHeight: number } {
  for (let size = start; size >= 20; size -= 2) {
    ctx.font = `${weight} ${size}px ${FONT}`;
    const lineHeight = Math.round(size * 1.14);
    const lines = wrap(ctx, text, maxWidth);
    if (lines.length * lineHeight <= maxHeight && lines.length <= 5) return { lines, size, lineHeight };
  }
  ctx.font = `${weight} 20px ${FONT}`;
  return { lines: wrap(ctx, text, maxWidth), size: 20, lineHeight: 23 };
}

const clip = (ctx: CanvasRenderingContext2D, text: string, max: number): string => {
  if (ctx.measureText(text).width <= max) return text;
  let t = text;
  while (t.length > 1 && ctx.measureText(`${t}…`).width > max) t = t.slice(0, -1);
  return `${t}…`;
};

/* ── Rendering ── */

export interface RenderedCover {
  dataUrl: string;
  width: number;
  height: number;
  /** Decoded size of the JPEG, so the UI can be honest about storage. */
  bytes: number;
}

export function renderCover(spec: CoverSpec): RenderedCover {
  const width = spec.width ?? 1200;
  const height = spec.height ?? 630;
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('This browser did not provide a 2D canvas, so cover art cannot be drawn.');

  const p = paletteFor(spec.seed || spec.title, spec.template, spec.accent);
  const pad = Math.round(width * 0.075);
  const title = spec.title.trim() || 'Untitled';
  const kicker = (spec.kicker ?? '').trim().toUpperCase();
  const brand = (spec.brand ?? '').trim();
  const domain = (spec.domain ?? '').trim();

  /* Ground */
  const g = ctx.createLinearGradient(0, 0, width, height);
  g.addColorStop(0, p.bgCss);
  g.addColorStop(1, p.bgCss2);
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, width, height);

  ctx.textBaseline = 'top';
  const inner = width - pad * 2;

  if (spec.template === 'stack') {
    /* Three bands: kicker, headline, brand — each on its own ground. */
    const bandH = Math.round(height * 0.17);
    ctx.fillStyle = p.accent;
    ctx.fillRect(0, 0, width, bandH);
    // The kicker sits on the accent block, so its ink is measured against the
    // accent — not against the card's ground, which is a different colour.
    ctx.fillStyle = contrast(p.accentRgb, WHITE) >= contrast(p.accentRgb, NEAR_BLACK) ? '#ffffff' : '#0e1117';
    ctx.font = `800 ${Math.round(bandH * 0.34)}px ${FONT}`;
    ctx.fillText(clip(ctx, kicker || 'ARTICLE', inner), pad, Math.round(bandH * 0.32));

    const head = fitHeadline(ctx, title, inner, height - bandH * 2 - pad, Math.round(width * 0.068));
    ctx.fillStyle = p.ink;
    ctx.font = `800 ${head.size}px ${FONT}`;
    let y = bandH + Math.round((height - bandH * 2 - head.lines.length * head.lineHeight) / 2);
    for (const line of head.lines) { ctx.fillText(line, pad, y); y += head.lineHeight; }

    ctx.fillStyle = p.ink;
    ctx.globalAlpha = 0.12;
    ctx.fillRect(0, height - bandH, width, bandH);
    ctx.globalAlpha = 1;
    ctx.fillStyle = p.ink;
    ctx.font = `700 ${Math.round(bandH * 0.26)}px ${FONT}`;
    ctx.fillText(clip(ctx, brand || domain, inner), pad, height - bandH + Math.round(bandH * 0.36));
  } else {
    /* Editorial, bold and quiet share a layout and differ in weight and rule. */
    let y = pad;

    if (kicker) {
      ctx.font = `700 ${Math.round(width * 0.0165)}px ${FONT}`;
      ctx.fillStyle = p.accent;
      const letterSpaced = kicker.split('').join(' ');
      ctx.fillText(clip(ctx, letterSpaced, inner), pad, y);
      y += Math.round(width * 0.038);
    }

    if (spec.template === 'editorial') {
      ctx.fillStyle = p.accent;
      ctx.fillRect(pad, y, Math.round(width * 0.075), 5);
      y += Math.round(width * 0.032);
    }

    const footerH = Math.round(width * 0.062);
    const weight = spec.template === 'bold' ? 900 : spec.template === 'quiet' ? 700 : 800;
    const startSize = Math.round(width * (spec.template === 'bold' ? 0.082 : 0.068));
    const head = fitHeadline(ctx, title, inner, height - y - footerH - pad, startSize, weight);

    ctx.fillStyle = p.ink;
    ctx.font = `${weight} ${head.size}px ${FONT}`;
    for (const line of head.lines) { ctx.fillText(line, pad, y); y += head.lineHeight; }

    /* Footer: brand on the left, domain on the right. */
    const fy = height - pad - Math.round(width * 0.018);
    ctx.font = `700 ${Math.round(width * 0.0175)}px ${FONT}`;
    if (brand) {
      ctx.fillStyle = p.ink;
      ctx.fillText(clip(ctx, brand, inner * 0.55), pad, fy);
    }
    if (domain) {
      ctx.fillStyle = p.muted;
      const w = Math.min(ctx.measureText(domain).width, inner * 0.4);
      ctx.fillText(clip(ctx, domain, inner * 0.4), width - pad - w, fy);
    }
  }

  const dataUrl = canvas.toDataURL('image/jpeg', spec.quality ?? 0.86);
  // base64 is 4 characters per 3 bytes, minus the padding.
  const b64 = dataUrl.slice(dataUrl.indexOf(',') + 1);
  const bytes = Math.round((b64.length * 3) / 4) - (b64.endsWith('==') ? 2 : b64.endsWith('=') ? 1 : 0);

  return { dataUrl, width, height, bytes };
}

/**
 * Alt text for a generated card.
 *
 * The card is words on a colour, so the honest description is the words. Alt
 * text that says "cover image" tells a screen reader nothing it could not have
 * guessed, and tells a search engine nothing at all.
 */
export function altForCover(spec: Pick<CoverSpec, 'title' | 'brand' | 'kicker'>): string {
  const bits = [`Title card reading “${spec.title.trim()}”`];
  if (spec.kicker?.trim()) bits.push(`labelled ${spec.kicker.trim()}`);
  if (spec.brand?.trim()) bits.push(`from ${spec.brand.trim()}`);
  return `${bits.join(', ')}.`;
}

/** Is this cover legible? Measured, so a bad palette cannot ship silently. */
export function coverContrast(seed: string, template: CoverTemplate, accent?: string): number {
  const p = paletteFor(seed, template, accent);
  return Math.round(contrast(p.bg, p.inkRgb) * 100) / 100;
}

/** The kicker's contrast against the ground it is drawn on. */
export function accentContrast(seed: string, template: CoverTemplate): number {
  const p = paletteFor(seed, template);
  const against = template === 'stack'
    ? (contrast(p.accentRgb, WHITE) >= contrast(p.accentRgb, NEAR_BLACK) ? WHITE : NEAR_BLACK)
    : p.bg;
  return Math.round(contrast(p.accentRgb, against) * 100) / 100;
}
