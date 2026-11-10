/**
 * Thumbnail design themes (2026-11) — a thumbnail's design kept as a design,
 * not as a picture, so the next Short gets the same look with its own
 * subject and words. A theme is the engine's own design fields
 * (media/engine/thumbLayout.mjs `normaliseSpec`: layout, colours, type,
 * case, outline, the picture's treatment, where the person and the words
 * sit, how the picked word is dressed, any decoration the design really
 * has) plus where the logo goes and how many words the headline carries.
 * What is never in a theme: the words, the moment, the face — those are
 * each video's own, worked out when the theme is used.
 *
 * Kept in the Design Studio's store (`crm_design_themes`, kind
 * 'thumbnail'; routes/designThemes.ts), listed in the Graphics Designer &
 * Editor and used from AI Video Studio and the Shorts wizard. Pure: the
 * browser draws a theme's preview from the same fields (PlanPreview).
 */
import { normaliseSpec } from '../../../../media/engine/thumbLayout.mjs';

export type Corner = 'tl' | 'tr' | 'bl' | 'br';
export interface ThemeLogo { on: boolean; corner: Corner; size: number }
/** The design fields a theme keeps — a thumbnail spec without its words, moment or badge. */
export interface ThemeDesign {
  layout: string; accent: string; color: string; color2: string; textColor: string; border: boolean; zoom: number;
  hlStyle: 'color' | 'box'; side: 'auto' | 'left' | 'right' | 'center'; textPos: 'auto' | 'top' | 'middle' | 'bottom'; textSize: number;
  sticker: string; pointer: 'auto' | 'none' | 'arrow' | 'circle' | 'both'; faceFrame: 'none' | 'round';
  font: 'sans' | 'serif' | 'display'; upper: boolean; outline: boolean; treatment: 'vivid' | 'natural' | 'muted' | 'dark' | 'mono'; glow: boolean;
}
export interface ThumbTheme {
  id: string; name: string; description: string;
  design: ThemeDesign; logo: ThemeLogo;
  /** How many of the title's words go on it (2–6). */
  words: number;
  /** Where it came from: a thumbnail saved as a theme, an example read, or made in the library. */
  source: 'thumbnail' | 'example' | 'library';
  createdAt: string; updatedAt: string;
}

export const MAX_THEMES = 60;
const CORNERS: Corner[] = ['tl', 'tr', 'bl', 'br'];
const txt = (v: unknown, n: number) => String(v ?? '').replace(/\p{Cc}/gu, ' ').replace(/\s+/g, ' ').trim().slice(0, n);

/** A design from anything: only the engine's own names, ranges and #rrggbb colours survive; a "modern" bubble only when asked. */
export function cleanDesign(raw: unknown): ThemeDesign {
  const r = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>;
  /* A theme with no face frame named never gets the round one (normaliseSpec keeps it for older thumbnails). */
  const o = normaliseSpec({ faceFrame: 'none', pointer: 'none', ...r, text: 'x' }) as unknown as ThemeDesign & { text: string; highlight: string; badge: string };
  return {
    layout: o.layout, accent: o.accent, color: o.color, color2: o.color2, textColor: o.textColor, border: o.border, zoom: o.zoom,
    hlStyle: o.hlStyle, side: o.side, textPos: o.textPos, textSize: o.textSize, sticker: o.sticker, pointer: o.pointer, faceFrame: o.faceFrame,
    font: o.font, upper: o.upper, outline: o.outline, treatment: o.treatment, glow: o.glow,
  };
}

export function cleanLogo(raw: unknown): ThemeLogo {
  const r = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>;
  const size = Number(r.size);
  return { on: r.on === true, corner: CORNERS.includes(r.corner as Corner) ? r.corner as Corner : 'tr', size: Number.isFinite(size) ? Math.min(30, Math.max(6, Math.round(size))) : 13 };
}

/** A theme as saved: a name it can be found by, a description, the design, the logo, the word count. Null without a name. */
export function cleanTheme(raw: unknown): Pick<ThumbTheme, 'name' | 'description' | 'design' | 'logo' | 'words' | 'source'> | null {
  const r = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>;
  const name = txt(r.name, 60);
  if (!name) return null;
  const words = Math.round(Number(r.words));
  return {
    name, description: txt(r.description, 300), design: cleanDesign(r.design), logo: cleanLogo(r.logo),
    words: Number.isFinite(words) ? Math.min(6, Math.max(2, words)) : 4,
    source: r.source === 'thumbnail' || r.source === 'example' ? r.source : 'library',
  };
}

/** The style a thumbnail is made in from a theme — the theme's design, the video's own words and picture. */
export const styleOfTheme = (t: Pick<ThumbTheme, 'design'>): Record<string, unknown> => ({ ...t.design });

/** A theme's own summary for its card, in words, built from its fields. */
export function describeTheme(t: Pick<ThumbTheme, 'design' | 'logo' | 'words'>): string {
  const d = t.design;
  const L: Record<string, string> = { bold: 'person beside big words', headline: 'big headline', glow: 'person in a glow', short: 'Shorts cover', cinematic: 'cinematic', split: 'two halves', number: 'big number', callout: 'callout', modern: 'screen + words' };
  return [
    L[d.layout] ?? d.layout, `${d.color}${d.color2 ? ` → ${d.color2}` : ''}`, `${d.font} type${d.upper ? ', capitals' : ''}${d.outline ? ', outlined' : ''}`,
    d.treatment !== 'vivid' ? `${d.treatment === 'mono' ? 'black-and-white' : d.treatment} picture` : '', `${t.words} words`, t.logo.on ? `logo ${{ tl: 'top left', tr: 'top right', bl: 'bottom left', br: 'bottom right' }[t.logo.corner]}` : '',
  ].filter(Boolean).join(' · ');
}
