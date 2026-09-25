/**
 * How the things a project makes should look: layouts, themes, the logo.
 *
 * ── Why the wizard asks this at all ──
 *
 * Before this, every post Autopilot made was the same design — white type on a
 * gradient of the brand colour — and every page the same blue hero. The first
 * thing a customer did with a batch of posts was open each one and restyle it,
 * which is the work they asked Autopilot to take off them. The questions that
 * fix that are few and visual: which layout, which colours, which logo, and two
 * or three words for the feel. Each has "Let AI decide", which resolves to a
 * named choice, so skipping them is a real answer and the blueprint says what
 * was chosen.
 *
 * ── Every choice here changes something that is built ──
 *
 * A layout is only offered for a kind of thing the project actually makes
 * (`designKindsOf` in projectIntake.ts looks at the workflows, not at the
 * solution's name), and each value is read by the code that makes it:
 *
 *   social  → `designFromPost` in worker/src/lib/projectAgents.ts
 *   page    → the website play in worker/src/autopilotTick.ts, via the brief
 *   email   → `wrapEmail` in worker/src/lib/emailLayouts.ts, on each send
 *   blog    → the article's structure, in `writeBlogPost`
 *
 * The server keeps its own list of the layout ids it can draw; `npm run
 * test:design` fails if this file offers one it cannot. Themes are resolved to
 * colours *here* and sent as colours, so there is only one palette table.
 *
 * ── The problems these defaults answer ──
 *
 * The ones people meet designing their own posts and pages, and which a
 * template quietly avoids: text nobody can read on a light brand colour, a logo
 * the size of the headline, six messages on one square, a page whose form is
 * three screens down, and a cold email so designed it goes to spam. So:
 * `readableInk` picks the text colour from the background rather than trusting
 * the theme; the logo is always small and in a corner; posts carry one headline;
 * the lead-capture layout puts the form under the headline; and plain email is
 * the default because it is the one that arrives.
 */

export type DesignKind = 'social' | 'page' | 'email' | 'blog';

export interface LayoutOption {
  value: string;
  label: string;
  hint: string;
}

export const LAYOUTS: Record<DesignKind, LayoutOption[]> = {
  social: [
    { value: 'bold', label: 'Bold headline', hint: 'Big words on your colours. Reads in a second on a phone.' },
    { value: 'offer', label: 'Offer badge', hint: 'A round badge and a button, for sales. The badge only shows an offer your profile states.' },
    { value: 'split', label: 'Split panel', hint: 'Headline on one side, a colour block with your logo on the other.' },
    { value: 'diagonal', label: 'Dynamic diagonal', hint: 'Angled bands of colour. Energetic and sporty.' },
    { value: 'minimal', label: 'Minimal and elegant', hint: 'Lots of space and a fine headline. Beauty, fashion, professional services.' },
    { value: 'quote', label: 'Quote or tip', hint: 'A large quotation mark over one line worth sharing.' },
    { value: 'framed', label: 'Framed announcement', hint: 'Centred inside a border. News, opening hours, holidays.' },
  ],
  page: [
    { value: 'hero-form', label: 'Headline and form', hint: 'The form sits right under the headline. One goal and hardly any scrolling, which suits lead capture.' },
    { value: 'services', label: 'Business website', hint: 'A headline, what you do, a few sections, then an enquiry form.' },
    { value: 'long-sales', label: 'Long sales page', hint: 'The problem, your answer, the benefits, then the ask. For higher-priced offers.' },
    { value: 'minimal', label: 'One screen', hint: 'A headline, one line and a form. Nothing else to read.' },
  ],
  email: [
    { value: 'plain', label: 'Plain and personal', hint: 'Reads like a person typed it. Plain email reaches the inbox more often, so it is best for first contact.' },
    { value: 'branded', label: 'Branded letter', hint: 'Your logo on top, a coloured button and a tidy footer.' },
    { value: 'newsletter', label: 'Newsletter', hint: 'A coloured header band and roomy sections, for updates to people who signed up.' },
    { value: 'promo', label: 'Promotion', hint: 'A bold banner and one big button, for offers to existing customers.' },
  ],
  blog: [
    { value: 'guide', label: 'How-to guide', hint: 'Numbered steps somebody can follow.' },
    { value: 'listicle', label: 'List article', hint: '"7 ways to…". Easy to skim and easy to share.' },
    { value: 'story', label: 'Story or case study', hint: 'A problem, what was done, and how it turned out.' },
    { value: 'qa', label: 'Questions and answers', hint: 'The questions customers ask, each answered. Good for search.' },
    { value: 'news', label: 'News and opinion', hint: 'What changed, and what it means for your customers.' },
  ],
};

/** The question each kind's layout is asked by. */
export const LAYOUT_QUESTION: Record<DesignKind, string> = {
  social: 'postLayout', page: 'pageLayout', email: 'emailLayout', blog: 'blogLayout',
};

/** The other way round: which kind a layout question is about. */
export const KIND_OF: Record<string, DesignKind> = {
  postLayout: 'social', pageLayout: 'page', emailLayout: 'email', blogLayout: 'blog',
};

export const DEFAULT_LAYOUT: Record<DesignKind, string> = {
  social: 'bold', page: 'hero-form', email: 'plain', blog: 'guide',
};

export type FontKey = 'sans' | 'serif' | 'display';

/** Fonts every browser and the PNG export already have, so nothing is fetched. */
export const FONT_FAMILY: Record<FontKey, string> = {
  sans: 'Inter', serif: 'Georgia', display: 'Impact',
};

export interface Theme {
  value: string;
  label: string;
  hint: string;
  bg: string;
  bg2: string;
  accent: string;
  font: FontKey;
}

/*
 * No `ink` here on purpose. The text colour is worked out from the background
 * in `resolveTheme`, because the commonest way a generated design fails is a
 * pale brand colour with white type on it, and a table cannot know the brand.
 */
export const THEMES: Theme[] = [
  { value: 'brand', label: 'My brand colour', hint: 'Your colour, fading to near-black', bg: '', bg2: '#17191c', accent: '#c7f441', font: 'sans' },
  { value: 'bold-dark', label: 'Bold and dark', hint: 'Black with a hot accent', bg: '#0b0b0f', bg2: '#26263a', accent: '#ff3b3b', font: 'display' },
  { value: 'vibrant', label: 'Vibrant', hint: 'Orange into purple', bg: '#e8590c', bg2: '#6a11cb', accent: '#ffe600', font: 'sans' },
  { value: 'clean', label: 'Clean and light', hint: 'White, soft grey, your colour as the accent', bg: '#ffffff', bg2: '#eef2f7', accent: '', font: 'sans' },
  { value: 'luxury', label: 'Luxury', hint: 'Black and gold, a serif headline', bg: '#101010', bg2: '#2a2418', accent: '#c9a54a', font: 'serif' },
  { value: 'pastel', label: 'Soft pastel', hint: 'Pink and lilac', bg: '#fde2ef', bg2: '#e6dcff', accent: '#c2255c', font: 'serif' },
  { value: 'corporate', label: 'Corporate blue', hint: 'Navy and bright blue', bg: '#0b2e6b', bg2: '#1d4ed8', accent: '#38bdf8', font: 'sans' },
  { value: 'fresh', label: 'Fresh and natural', hint: 'Deep greens with lime', bg: '#0f5132', bg2: '#2d8f5b', accent: '#c7f441', font: 'sans' },
  { value: 'warm', label: 'Warm and friendly', hint: 'Cream and orange', bg: '#fff4e5', bg2: '#ffd8a8', accent: '#e8590c', font: 'sans' },
];

export const DEFAULT_THEME = 'brand';
export const FALLBACK_BRAND = '#5b7cfa';

const HEX = /^#?([0-9a-f]{3}|[0-9a-f]{6})$/i;

export function cleanHex(raw: string, fallback = FALLBACK_BRAND): string {
  const m = String(raw ?? '').trim().match(HEX);
  if (!m) return fallback;
  const h = m[1].length === 3 ? m[1].split('').map(c => c + c).join('') : m[1];
  return `#${h.toLowerCase()}`;
}

/** WCAG relative luminance, 0 (black) to 1 (white). */
export function luminance(hex: string): number {
  const h = cleanHex(hex, '#000000').slice(1);
  const ch = [0, 2, 4].map(i => parseInt(h.slice(i, i + 2), 16) / 255)
    .map(c => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4));
  return 0.2126 * ch[0] + 0.7152 * ch[1] + 0.0722 * ch[2];
}

export function contrast(a: string, b: string): number {
  const [x, y] = [luminance(a), luminance(b)].sort((p, q) => q - p);
  return (x + 0.05) / (y + 0.05);
}

/**
 * Near-black or white, whichever reads better on this background.
 *
 * Judged on both ends of a gradient and the worse of the two, because the
 * headline sits across the middle of it.
 */
export function readableInk(bg: string, bg2 = bg): string {
  const dark = '#111827';
  const light = '#ffffff';
  const worst = (ink: string) => Math.min(contrast(ink, bg), contrast(ink, bg2));
  return worst(light) >= worst(dark) ? light : dark;
}

export interface Palette {
  bg: string;
  bg2: string;
  ink: string;
  accent: string;
  font: FontKey;
}

/**
 * Words that change the typeface, whatever the theme says.
 *
 * The two or three words somebody gives for the feel are mostly read by the
 * writer; these are the few that are unambiguous about type.
 */
export function fontFromWords(words: string): FontKey | null {
  const w = ` ${String(words ?? '').toLowerCase()} `;
  if (/\b(elegant|luxur\w*|classic|refined|timeless|editorial|premium)\b/.test(w)) return 'serif';
  if (/\b(bold|loud|sport\w*|energetic|punchy|street|impact\w*)\b/.test(w)) return 'display';
  if (/\b(clean|modern|simple|minimal\w*|friendly|techy?)\b/.test(w)) return 'sans';
  return null;
}

/** A theme as colours, with the brand colour and the words applied. */
export function resolveTheme(value: string, brandColor = '', words = ''): Palette {
  const t = THEMES.find(x => x.value === value) ?? THEMES[0];
  const brand = cleanHex(brandColor);
  let bg = t.bg || brand;
  let bg2 = t.bg2;
  let accent = t.accent;

  if (t.value === 'brand' && luminance(brand) > 0.45) {
    /* A pale brand fading to near-black puts dark text across a dark band
       whichever ink is picked. Kept flat instead, so one ink suits all of it. */
    bg2 = brand;
    accent = '#111827';
  }
  if (t.value === 'clean') {
    /* The brand as the accent, unless it would vanish against white. */
    accent = contrast(brand, '#ffffff') >= 3 ? brand : '#2563eb';
  }
  bg = cleanHex(bg);
  bg2 = cleanHex(bg2);
  const ink = readableInk(bg, bg2);
  /* An accent the same weight as the ink's background is invisible. */
  if (contrast(accent, bg) < 1.6) accent = ink;
  return { bg, bg2, ink, accent: cleanHex(accent), font: fontFromWords(words) ?? t.font };
}

export interface LogoChoice {
  /** 'site' | 'upload' | 'none' | 'auto'. */
  answer: string;
  /** A downsized data URL, when one has been found or given. */
  dataUrl: string;
  /** Where it came from, said on the screen. */
  from: string;
}

/**
 * What a design step is told, as strings — node configs are string maps.
 *
 * `logo: 'on'` means "use the client's logo if they have one", not "there is
 * one": the step reads the portfolio when it runs, so a logo uploaded after
 * the build is picked up without editing the workflow, and a client with none
 * gets their name set as a wordmark instead of an empty box.
 */
export function designConfig(kind: DesignKind, a: Record<string, string | string[] | undefined>): Record<string, string> {
  const one = (k: string) => { const v = a[k]; return String(Array.isArray(v) ? v[0] ?? '' : v ?? '').trim(); };
  const layout = one(LAYOUT_QUESTION[kind]) || DEFAULT_LAYOUT[kind];
  if (kind === 'blog') return { format: layout };
  const p = resolveTheme(one('theme') || DEFAULT_THEME, one('brandColor'), one('designStyle'));
  const out: Record<string, string> = {
    layout, bg: p.bg, bg2: p.bg2, ink: p.ink, accent: p.accent, font: FONT_FAMILY[p.font],
    logo: one('logo') === 'none' ? 'off' : 'on',
  };
  if (one('designStyle')) out.style = one('designStyle').slice(0, 80);
  if (kind === 'email') return { emailLayout: layout, emailAccent: p.accent, emailBg: p.bg, emailInk: p.ink, logo: out.logo };
  return out;
}

export const layoutLabel = (kind: DesignKind, value: string): string =>
  LAYOUTS[kind].find(l => l.value === value)?.label ?? value;

export const themeLabel = (value: string): string => THEMES.find(t => t.value === value)?.label ?? value;

/* ── The logo, made small enough to travel ────────────────────────────────── */

/**
 * The largest side a stored logo keeps.
 *
 * It rides on the client's profile (see ProjectLogo.tsx on why there is no file
 * store), and the profile is loaded with every board. 320px is sharp in a
 * corner of a 1080px post and in an email header, and usually under 40KB.
 */
export const LOGO_MAX_SIDE = 320;
export const LOGO_MAX_BYTES = 150_000;
