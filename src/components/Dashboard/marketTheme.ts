/**
 * Trading-board palette, one set per app theme.
 *
 * The CRM goes dark by inverting the whole of #root with a CSS filter (see
 * index.css), which would turn a deliberately dark panel white. The board opts
 * out with `data-noinvert` and picks its own colours instead, so it is dark in
 * dark mode and light in light mode rather than whatever the filter produces.
 *
 * Both UP/DOWN pairs were picked with the palette validator against their own
 * surface, because a plain red/green scores a deuteranopia ΔE of 2.2 — two
 * colours a red-green colourblind reader cannot tell apart:
 *
 *   dark  #26d9a8 / #f2536d on #0e1117 → deutan ΔE 11.9, normal ΔE 36.0
 *   light #00846b / #e11d48 on #ffffff → deutan ΔE  9.9, normal ΔE 32.3
 *
 * Direction is never carried by colour alone regardless: every figure ships a
 * ▲/▼ glyph and a signed number, up candles are hollow and down candles filled,
 * and the chart has a table view.
 */
export type Theme = 'light' | 'dark';

export interface Palette {
  up: string;
  down: string;
  flat: string;
  /** Chart surface. */
  ink: string;
  panel: string;
  panelHi: string;
  border: string;
  grid: string;
  textStrong: string;
  textMuted: string;
  textDim: string;
  /** Selection/CTA accent, kept off the up-down axis. */
  accent: string;
  /** Ink that reads on top of `accent`. */
  onAccent: string;
  /** Wash behind the accent for selected chips. */
  accentSoft: string;
}

/* Dark is the app's ember look (owner, 2026-11-15): warm blacks and the
   ember accent instead of the reference's blue-greys and lime. Up/down keep
   their validated pair — on these surfaces (#120a07) they still separate. */
const DARK: Palette = {
  up: '#26d9a8',
  down: '#f2536d',
  flat: '#9a8c85',
  ink: '#120a07',
  panel: '#1b100b',
  panelHi: '#24150f',
  border: '#34211a',
  grid: 'rgba(255,214,190,0.06)',
  textStrong: '#f6ece7',
  textMuted: '#b3a39b',
  textDim: '#857169',
  accent: '#ff6a2b',
  onAccent: '#1a0c06',
  accentSoft: 'rgba(255,106,43,0.14)',
};

const LIGHT: Palette = {
  up: '#00846b',
  down: '#e11d48',
  flat: '#6b7280',
  ink: '#ffffff',
  panel: '#f7f8fa',
  panelHi: '#eef0f4',
  border: '#e3e6eb',
  grid: 'rgba(23,25,28,0.07)',
  textStrong: '#17191c',
  textMuted: '#5c6470',
  textDim: '#868e9a',
  accent: '#17191c',
  onAccent: '#ffffff',
  accentSoft: 'rgba(23,25,28,0.07)',
};

export function palette(theme: Theme): Palette {
  return theme === 'dark' ? DARK : LIGHT;
}

export type Dir = 'up' | 'down' | 'flat';

export function dirOf(n: number): Dir {
  if (n > 0) return 'up';
  if (n < 0) return 'down';
  return 'flat';
}

export function colorFor(dir: Dir, p: Palette): string {
  return dir === 'up' ? p.up : dir === 'down' ? p.down : p.flat;
}

/** The glyph that keeps direction legible without colour. */
export function glyphFor(dir: Dir): string {
  return dir === 'up' ? '▲' : dir === 'down' ? '▼' : '■';
}

export function signed(n: number, digits = 2): string {
  const s = n.toFixed(digits);
  return n > 0 ? `+${s}` : s;
}
