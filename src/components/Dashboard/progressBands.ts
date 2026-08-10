/**
 * Health bands for a department's progress score.
 *
 * Three bands, not four. The stock status palette has a fourth "serious" orange
 * that sits ΔE 13.6 from the amber to normal vision — below the 15 floor, so two
 * adjacent rows would be hard to tell apart even with full colour vision. Three
 * bands clear every gate in both themes:
 *
 *   #d03b3b / #fab219 / #0ca30c
 *     worst adjacent CVD ΔE 11.3 (protan), normal-vision ΔE 27.6
 *     validated against #ffffff (light) and #0e1117 (dark)
 *
 * The amber is 1.83:1 on white, which the validator flags as needing relief.
 * That relief is built in and not optional: every bar carries its number, a band
 * word and an icon, the bar has a hairline ring in its own darker step so its
 * edge is defined against the surface, and the panel has a table view. Colour is
 * the third channel here, never the only one.
 *
 * Darkening the amber was tried and is worse: at #c77a00 it collapses to ΔE 4.0
 * from the green under deuteranopia. Bright amber with relief is the better
 * trade.
 */

export type BandKey = 'idle' | 'attention' | 'building' | 'strong';

export interface Band {
  key: BandKey;
  /** The word that carries the meaning when colour cannot. */
  label: string;
  /** Lowest score in this band. */
  min: number;
  fill: string;
  /** Hairline on the fill, so a low-contrast bar still has a visible edge. */
  edge: string;
  /** Unfilled track — a lighter step of the fill's own ramp. */
  track: string;
  trackDark: string;
  /** Ink for the band word, stepped to read on each surface. */
  ink: string;
  inkDark: string;
}

export const BANDS: Band[] = [
  // Not a status colour, deliberately. A department reads zero on day one
  // because nobody has used it yet, and painting ten of those red tells a new
  // customer their business is failing when they have simply not started. Grey
  // says "nothing here yet", which is what the number actually means — and it
  // keeps red meaning "there is activity here and it is going badly".
  {
    key: 'idle', label: 'Not started', min: 0,
    fill: '#9aa3ad', edge: '#78828e',
    track: '#e9ebee', trackDark: '#2c333c',
    ink: '#6b7480', inkDark: '#9aa3ad',
  },
  {
    key: 'attention', label: 'Needs attention', min: 1,
    fill: '#d03b3b', edge: '#a92e2e',
    track: '#f6dcdc', trackDark: '#4d2828',
    ink: '#b3302f', inkDark: '#f08b8b',
  },
  {
    key: 'building', label: 'Building', min: 40,
    fill: '#fab219', edge: '#b8790a',
    track: '#fdeecd', trackDark: '#4a3c1c',
    ink: '#8a5c05', inkDark: '#f5c451',
  },
  {
    key: 'strong', label: 'Strong', min: 75,
    fill: '#0ca30c', edge: '#087d08',
    track: '#d7f0d7', trackDark: '#1f4520',
    ink: '#0a7a0a', inkDark: '#5ec95e',
  },
];

/**
 * The band a score falls in. Scores are clamped 0–100 upstream.
 *
 * The idle threshold is "rounds to zero" rather than exactly zero: a department
 * carrying one record out of a hundred scores 0.4, and calling that "needs
 * attention" is the same overstatement as calling a truly empty one red.
 */
export function bandFor(score: number): Band {
  if (score < 1) return BANDS[0];
  let hit = BANDS[1];
  for (const b of BANDS) if (score >= b.min) hit = b;
  return hit;
}
