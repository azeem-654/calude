/**
 * Types for thumbLayout.mjs — the plan the media engine paints and the
 * designer previews. The module itself is plain JavaScript so the engine
 * image runs it unbuilt; the app and the Worker import it through these.
 */
export type TrendLayout = 'bold' | 'callout' | 'cinematic' | 'split' | 'number' | 'glow' | 'headline' | 'short';
export type StickerName = 'check' | 'cross' | 'up' | 'down' | 'money' | 'alert' | 'question' | 'star';
export type Side = 'auto' | 'left' | 'right' | 'center';
export type TextPos = 'auto' | 'top' | 'middle' | 'bottom';
export type Pointer = 'auto' | 'none' | 'arrow' | 'circle' | 'both';
export type HlStyle = 'color' | 'box';

export const TREND_LAYOUTS: TrendLayout[];
export const STICKERS: StickerName[];
export const SIDES: Side[];
export const TEXT_POS: TextPos[];
export const POINTERS: Pointer[];
export const HL_STYLES: HlStyle[];
export const CONDENSE: number;
export const EM: number;
export const HALO: { max: number; inner: number; rise: number; outer: number; soft: number };
export const NUMBER: RegExp;

/** A thumbnail request with every option, defaulted and clamped. */
export interface ThumbOptions {
  layout: TrendLayout; text: string; highlight: string;
  accent: string; color: string; color2: string; textColor: string; border: boolean; zoom: number;
  hlStyle: HlStyle; side: Side; textPos: TextPos; textSize: number; sticker: StickerName | ''; pointer: Pointer; badge: string;
}

export interface Rect { x: number; y: number; w: number; h: number }
export interface Run { t: string; color: string }
export interface Line {
  x: number; y: number; fs: number; w: number; align: 'left' | 'center' | 'right'; font: string;
  runs: Run[]; box: { color: string; pad: number; tilt: number } | null; stroke: number; shadow: number; glow: number; spacing: number;
}
export interface Fill { c0solid: string; c1solid: string; angle?: number; alpha: { axis: 'x' | 'y' | 'full'; from?: number; to?: number; max: number } }
export interface Ellipse { cx: number; cy: number; rx: number; ry: number }
export interface Plan {
  layout: TrendLayout; portrait: boolean; W: number; H: number; spec: ThumbOptions;
  crop: { x: number; y: number; w: number; h: number } | null; crop2: { x: number; y: number; w: number; h: number } | null;
  grade: { contrast: number; saturation: number; brightness: number; sharpen: boolean; cinematic: boolean; blur: number };
  fills: Fill[]; spot: (Ellipse & { feather: number }) | null; halo: (Ellipse & { feather: number; color: string }) | null;
  vignette: boolean; bars: number; edge: { color: string; t: number } | null;
  lines: Line[]; ring: (Ellipse & { color: string; t: number }) | null; arrow: { pts: [number, number][]; color: string } | null;
  sticker: { name: StickerName; cx: number; cy: number; r: number; disc: string; mark: [number, number][] | null; glyph: string } | null;
  badge: (Rect & { text: string; color: string; ink: string; bar: string }) | null;
  tile: (Rect & { color: string }) | null;
  split: { vertical: boolean; divider: { color: string; t: number }; vs: { cx: number; cy: number; r: number; color: string; ink: string; text: string } | null } | null;
  rule: (Rect & { color: string }) | null;
  faceAt: Ellipse | null;
}

export function normaliseSpec(it: unknown): ThumbOptions;
export function thumbPlan(it: unknown, W: number, H: number, src: { w: number; h: number } | null, face: { x: number; y: number; w: number; h: number } | null, face2?: { x: number; y: number; w: number; h: number } | null): Plan;
export function inkOn(bg: string): string;
export function shade(hex: string, k: number): string;
export function rgbOf(hex: string): [number, number, number];
export function arrowPoly(x1: number, y1: number, x2: number, y2: number, width: number): [number, number][];
export function stickerShape(name: string, cx: number, cy: number, r: number): { disc: string; mark: [number, number][] | null; glyph: string } | null;
export function lineRect(l: Line): { x0: number; x1: number; y0: number; y1: number };
