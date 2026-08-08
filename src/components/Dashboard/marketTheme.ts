/**
 * Trading-terminal palette.
 *
 * UP/DOWN were picked with the palette validator against the #0e1117 surface:
 * deuteranopia ΔE 11.9 and normal-vision ΔE 36.0 (OKLab ×100), comfortably past
 * the ≥8 CVD target that a plain red/green pair fails badly (ΔE 2.2). They still
 * read as the gain/loss colours a trader expects. Direction is never carried by
 * colour alone — every figure ships a ▲/▼ glyph and a signed number, and up
 * candles are hollow while down candles are filled.
 */
export const UP = '#26d9a8';
export const DOWN = '#f2536d';
export const FLAT = '#8b949e';

/** Surfaces. */
export const INK_DARK = '#0e1117';
export const PANEL = '#151a21';
export const PANEL_HI = '#1c2230';
export const BORDER = '#232b36';
export const GRID = 'rgba(255,255,255,0.055)';

/** Text ramp — all four clear 4.5:1 on INK_DARK except TEXT_DIM, which is
 *  reserved for axis furniture that is never the only source of a value. */
export const TEXT_STRONG = '#e6edf3';
export const TEXT_MUTED = '#9aa6b4';
export const TEXT_DIM = '#6e7d8d';

/** Accent used for neutral/selection chrome, kept off the up-down axis. */
export const ACCENT = '#c7f441';

export type Dir = 'up' | 'down' | 'flat';

export function dirOf(n: number): Dir {
  if (n > 0) return 'up';
  if (n < 0) return 'down';
  return 'flat';
}

export function colorFor(dir: Dir): string {
  return dir === 'up' ? UP : dir === 'down' ? DOWN : FLAT;
}

/** The glyph that keeps direction legible without colour. */
export function glyphFor(dir: Dir): string {
  return dir === 'up' ? '▲' : dir === 'down' ? '▼' : '■';
}

export function signed(n: number, digits = 2): string {
  const s = n.toFixed(digits);
  return n > 0 ? `+${s}` : s;
}
