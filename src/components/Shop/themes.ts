/**
 * What a shop looks like.
 *
 * The storefront was one hardcoded layout — a coloured band, a grid of white
 * cards — which is fine for proving a stranger can pay and wrong for everything
 * after that. A jeweller and a scaffolding hire company should not have the
 * same page, and a shopkeeper picking a look is the first thing anybody does
 * when they open a shop.
 *
 * Five, not fifty. A gallery of near-identical themes is a decision nobody can
 * make; these are deliberately different shapes, and each one is named after
 * the kind of shop it suits rather than after a colour.
 *
 * The accent colour is the shopkeeper's, always. A theme decides layout,
 * density, type and shape — never the brand colour, because then choosing a
 * theme would silently throw away a choice they already made.
 *
 * Must stay in step with the TEMPLATES set in worker/src/routes/shop.ts: a
 * theme the server will not store is one that silently becomes 'classic' on
 * save, which looks like the picker is broken.
 */

export type ThemeId = 'classic' | 'bold' | 'editorial' | 'minimal' | 'market';

export interface Theme {
  id: ThemeId;
  name: string;
  /** Who it is for, in the words a shopkeeper would use. */
  blurb: string;

  /* ── Type ── */
  headingFont: string;
  bodyFont: string;
  /** Scales the hero heading. 1 is the base of about 30px. */
  headingScale: number;
  headingWeight: number;
  /** Letter-spacing on the hero heading, in em. */
  headingTracking: string;
  uppercaseHeading: boolean;

  /* ── Shape ── */
  radius: number;
  /** How wide the page runs. A dense market stall wants more than a boutique. */
  maxWidth: number;
  /** Minimum column width in the product grid — smaller means more per row. */
  cardMin: number;
  gap: number;
  /** Product image box, as a CSS aspect-ratio. */
  ratio: string;
  cardBorder: boolean;
  cardShadow: string;

  /* ── The band across the top ── */
  hero: 'band' | 'full' | 'split' | 'quiet';
  /** How tall the hero runs, in px, when there is no image. */
  heroPad: number;
  /** Whether the accent fills the hero or only the buttons. */
  heroFilled: boolean;

  /* ── Ground ── */
  pageBg: string;
  cardBg: string;
  ink: string;
  muted: string;
  line: string;
}

/* Two font stacks, each with a real fallback chain — a theme that asks for a
   webfont this app does not ship would render as whatever the browser felt
   like, which is the one thing a "pick a look" screen must not do. */
const SANS = 'Inter, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif';
const SERIF = 'Georgia, "Iowan Old Style", "Times New Roman", Times, serif';

export const THEMES: Record<ThemeId, Theme> = {
  classic: {
    id: 'classic', name: 'Classic',
    blurb: 'A clean shop that suits almost anything. Start here if you are not sure.',
    headingFont: SANS, bodyFont: SANS, headingScale: 1, headingWeight: 700,
    headingTracking: '-0.02em', uppercaseHeading: false,
    radius: 12, maxWidth: 1040, cardMin: 240, gap: 20, ratio: '4 / 3',
    cardBorder: true, cardShadow: '0 1px 2px rgba(16,24,40,0.04)',
    hero: 'band', heroPad: 56, heroFilled: true,
    pageBg: '#ffffff', cardBg: '#ffffff', ink: '#17191c', muted: '#6b7280', line: '#e5e7eb',
  },

  bold: {
    id: 'bold', name: 'Bold',
    blurb: 'Big type, big pictures. For one hero product or a short, striking range.',
    headingFont: SANS, bodyFont: SANS, headingScale: 1.85, headingWeight: 900,
    headingTracking: '-0.045em', uppercaseHeading: false,
    radius: 20, maxWidth: 1180, cardMin: 300, gap: 26, ratio: '1 / 1',
    cardBorder: false, cardShadow: '0 18px 40px -24px rgba(16,24,40,0.4)',
    hero: 'full', heroPad: 108, heroFilled: true,
    pageBg: '#0f1115', cardBg: '#191d24', ink: '#f5f7fa', muted: '#9aa3b2', line: '#2a303a',
  },

  editorial: {
    id: 'editorial', name: 'Editorial',
    blurb: 'Serif type and room to read. For things that need explaining before they sell.',
    headingFont: SERIF, bodyFont: SERIF, headingScale: 1.45, headingWeight: 400,
    headingTracking: '-0.01em', uppercaseHeading: false,
    radius: 4, maxWidth: 960, cardMin: 280, gap: 30, ratio: '3 / 4',
    cardBorder: false, cardShadow: 'none',
    hero: 'split', heroPad: 72, heroFilled: false,
    pageBg: '#fbfaf7', cardBg: '#fbfaf7', ink: '#1b1a17', muted: '#6d6a62', line: '#ddd8cd',
  },

  minimal: {
    id: 'minimal', name: 'Minimal',
    blurb: 'Almost nothing but the products. For a range that speaks for itself.',
    headingFont: SANS, bodyFont: SANS, headingScale: 0.92, headingWeight: 500,
    headingTracking: '0.18em', uppercaseHeading: true,
    radius: 0, maxWidth: 1120, cardMin: 260, gap: 34, ratio: '3 / 4',
    cardBorder: false, cardShadow: 'none',
    hero: 'quiet', heroPad: 40, heroFilled: false,
    pageBg: '#ffffff', cardBg: '#ffffff', ink: '#111111', muted: '#8a8a8a', line: '#ededed',
  },

  market: {
    id: 'market', name: 'Market',
    blurb: 'Dense and practical. For a long list where people already know what they want.',
    headingFont: SANS, bodyFont: SANS, headingScale: 0.95, headingWeight: 800,
    headingTracking: '-0.015em', uppercaseHeading: false,
    radius: 8, maxWidth: 1280, cardMin: 185, gap: 14, ratio: '1 / 1',
    cardBorder: true, cardShadow: 'none',
    hero: 'band', heroPad: 36, heroFilled: true,
    pageBg: '#f6f7f9', cardBg: '#ffffff', ink: '#17191c', muted: '#667085', line: '#e3e6eb',
  },
};

export const THEME_LIST = Object.values(THEMES);

export const themeFor = (id: string | undefined): Theme =>
  THEMES[(id ?? 'classic') as ThemeId] ?? THEMES.classic;

/** Rec. 601 luma, 0–255. The usual rule of thumb, good enough for a button. */
function luma(hex: string): number | null {
  const h = (hex || '').replace('#', '');
  const full = h.length === 3 ? h.split('').map(c => c + c).join('') : h;
  if (full.length !== 6) return null;
  const r = parseInt(full.slice(0, 2), 16);
  const g = parseInt(full.slice(2, 4), 16);
  const b = parseInt(full.slice(4, 6), 16);
  if ([r, g, b].some(n => Number.isNaN(n))) return null;
  return (r * 299 + g * 587 + b * 114) / 1000;
}

/** Move a colour towards white or black by `amount` (0–1). */
function shift(hex: string, amount: number, towards: 'light' | 'dark'): string {
  const h = (hex || '').replace('#', '');
  const full = h.length === 3 ? h.split('').map(c => c + c).join('') : h;
  if (full.length !== 6) return hex;
  const to = towards === 'light' ? 255 : 0;
  const out = [0, 2, 4].map(i => {
    const v = parseInt(full.slice(i, i + 2), 16);
    if (Number.isNaN(v)) return '00';
    return Math.round(v + (to - v) * amount).toString(16).padStart(2, '0');
  });
  return `#${out.join('')}`;
}

/**
 * The shopkeeper's accent, made visible against this theme's ground.
 *
 * A near-black brand colour on the dark theme produced a black button on a
 * black card — the "Add to basket" control was genuinely invisible, and the
 * shop looked like it had no buy button at all. Nobody picking a dark theme
 * expects it to eat the colour they chose, and nobody picking a brand colour
 * expects it to matter which theme they are on.
 *
 * So the accent is lifted or dropped only as far as it has to be, and only when
 * it is too close to the background to see. A colour with enough contrast is
 * returned exactly as chosen.
 */
export function usableAccent(accent: string, against: string): string {
  const a = luma(accent);
  const b = luma(against);
  if (a == null || b == null) return accent;
  const gap = Math.abs(a - b);
  if (gap >= 60) return accent;
  /* Towards whichever end the background is not. */
  const towards = b < 128 ? 'light' : 'dark';
  /* Enough to clear the threshold with room to spare, never so much that the
     colour stops being recognisable as theirs. */
  return shift(accent, Math.min(0.62, (60 - gap) / 100 + 0.28), towards);
}

/**
 * Readable text on a colour.
 *
 * A shop whose brand colour is pale yellow gets white buttons with white text
 * on them unless somebody checks.
 */
export function inkOn(hex: string): string {
  const h = (hex || '').replace('#', '');
  const full = h.length === 3 ? h.split('').map(c => c + c).join('') : h;
  if (full.length !== 6) return '#ffffff';
  const r = parseInt(full.slice(0, 2), 16);
  const g = parseInt(full.slice(2, 4), 16);
  const b = parseInt(full.slice(4, 6), 16);
  if ([r, g, b].some(n => Number.isNaN(n))) return '#ffffff';
  return (r * 299 + g * 587 + b * 114) / 1000 > 150 ? '#111111' : '#ffffff';
}
