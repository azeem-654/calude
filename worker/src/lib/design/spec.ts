/**
 * The social design engine's vocabulary — templates, formats, fonts, colours.
 *
 * ── Why templates are data, not drawings ──
 *
 * The designs this replaces were a headline set on a gradient with a coloured
 * bar, whatever the customer asked for. The old element model could not do
 * better: it had no idea which text was the headline, so nothing could be
 * filled in for the customer, and nothing could be moved to another format
 * without breaking. A template here is a composition — layers placed in
 * fractions of the canvas, each bound to a named slot (headline, offer,
 * photo, logo…) — and one renderer draws it for the gallery card, the editor
 * and the exported PNG. What the card shows is what downloads.
 *
 * Pure, no imports: the Worker reads it to choose a template for an AI
 * Autopilot post (lib/projectAgents.ts), the browser to draw it
 * (components/SocialCreator/design/render.ts). `npm run test:socialtemplates`.
 */

/* ── Formats ─────────────────────────────────────────────────────────────── */

/** The shape a layout is written for. Every format is one of these. */
export type AspectClass = 'square' | 'portrait' | 'story' | 'landscape';

export type FormatId = 'square' | 'portrait' | 'story' | 'landscape' | 'wide';

export interface Format {
  id: FormatId;
  label: string;
  /** Where it is used, as a person would say it. */
  use: string;
  width: number;
  height: number;
  aspect: AspectClass;
  platforms: string[];
}

/*
 * Sizes as the platforms recommend them in their own help pages (checked
 * October 2026): Instagram feed 1080×1350 (4:5) or 1080×1080, Stories and
 * Reels covers 1080×1920; Facebook feed the same, link and landscape posts
 * 1200×628 (1.91:1); LinkedIn 1080×1080, 1080×1350 or 1200×627; X 1600×900.
 * A carousel is a run of portrait or square slides.
 */
export const FORMATS: Format[] = [
  { id: 'portrait', label: 'Portrait 4:5', use: 'Instagram & Facebook feed, LinkedIn — the most screen space in a feed', width: 1080, height: 1350, aspect: 'portrait', platforms: ['instagram', 'facebook', 'linkedin'] },
  { id: 'square', label: 'Square 1:1', use: 'Instagram, Facebook and LinkedIn feed', width: 1080, height: 1080, aspect: 'square', platforms: ['instagram', 'facebook', 'linkedin'] },
  { id: 'story', label: 'Story 9:16', use: 'Instagram & Facebook Stories, Reels, TikTok and Shorts covers', width: 1080, height: 1920, aspect: 'story', platforms: ['instagram', 'facebook', 'tiktok', 'youtube'] },
  { id: 'landscape', label: 'Landscape 1.91:1', use: 'Facebook and LinkedIn landscape posts and link images', width: 1200, height: 628, aspect: 'landscape', platforms: ['facebook', 'linkedin'] },
  { id: 'wide', label: 'Wide 16:9', use: 'X (Twitter) posts and YouTube community', width: 1600, height: 900, aspect: 'landscape', platforms: ['twitter', 'youtube'] },
];
export const formatOf = (id: string): Format => FORMATS.find(f => f.id === id) ?? FORMATS[0];

/** The old editor's ratio for a format, so a template design sits in every list the old designs do. */
export const RATIO_OF: Record<FormatId, '1:1' | '4:5' | '9:16' | '16:9'> = { square: '1:1', portrait: '4:5', story: '9:16', landscape: '16:9', wide: '16:9' };

/* ── Colour ──────────────────────────────────────────────────────────────── */

/**
 * A colour as a template writes it: a literal ('#c8a96a', 'rgba(0,0,0,.4)')
 * or a brand token ('$primary'). Tokens are what let one template carry any
 * customer's colours.
 */
export type ColorRef = string;
export type Token = 'primary' | 'primaryDark' | 'primaryDeep' | 'primaryLight' | 'primarySoft' | 'secondary' | 'accent'
  | 'ink' | 'paper' | 'white' | 'black' | 'muted' | 'onPrimary' | 'onSecondary' | 'onAccent';

export interface LinearPaint { type: 'linear'; angle: number; stops: [ColorRef, number][] }
export interface RadialPaint { type: 'radial'; cx: number; cy: number; r: number; stops: [ColorRef, number][] }
export type Paint = ColorRef | LinearPaint | RadialPaint;

export interface BrandColors { primary: string; secondary?: string; accent?: string }

export function hex(raw: unknown, fallback: string): string {
  const m = String(raw ?? '').trim().match(/^#?([0-9a-f]{3}|[0-9a-f]{6})$/i);
  if (!m) return fallback;
  const h = m[1].length === 3 ? m[1].split('').map(c => c + c).join('') : m[1];
  return `#${h.toLowerCase()}`;
}
const rgb = (h: string): [number, number, number] => [0, 2, 4].map(i => parseInt(h.slice(1 + i, 3 + i), 16)) as [number, number, number];
const toHex = (c: number[]) => `#${c.map(v => Math.max(0, Math.min(255, Math.round(v))).toString(16).padStart(2, '0')).join('')}`;
export const mix = (a: string, b: string, t: number) => { const x = rgb(hex(a, '#000000')), y = rgb(hex(b, '#000000')); return toHex(x.map((v, i) => v + (y[i] - v) * t)); };

export function luminance(color: string): number {
  return rgb(hex(color, '#000000')).map(c => c / 255).map(c => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4))
    .reduce((s, c, i) => s + c * [0.2126, 0.7152, 0.0722][i], 0);
}
export const contrast = (a: string, b: string) => { const x = luminance(a), y = luminance(b); return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05); };
/** Near-black or white, whichever reads better on this colour. */
export const inkOn = (bg: string) => (contrast(bg, '#ffffff') >= contrast(bg, '#14161a') ? '#ffffff' : '#14161a');

function hsl(h: string): [number, number, number] {
  const [r, g, b] = rgb(h).map(v => v / 255);
  const max = Math.max(r, g, b), min = Math.min(r, g, b), l = (max + min) / 2;
  if (max === min) return [0, 0, l];
  const d = max - min, s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
  const hue = max === r ? (g - b) / d + (g < b ? 6 : 0) : max === g ? (b - r) / d + 2 : (r - g) / d + 4;
  return [hue * 60, s, l];
}
function fromHsl(h: number, s: number, l: number): string {
  const k = (n: number) => (n + h / 30) % 12, a = s * Math.min(l, 1 - l);
  const f = (n: number) => l - a * Math.max(-1, Math.min(k(n) - 3, 9 - k(n), 1));
  return toHex([f(0), f(8), f(4)].map(v => v * 255));
}

/**
 * Every token for one customer's colours. A missing accent is derived — a
 * warm pop against a cool brand and the reverse — never a random colour, so
 * the same brand always comes out the same.
 */
export function paletteFor(b: BrandColors): Record<Token, string> {
  const primary = hex(b.primary, '#3e63dd');
  const [h, s] = hsl(primary);
  const secondary = hex(b.secondary, mix(primary, '#14161a', 0.62));
  const accent = hex(b.accent, h >= 170 && h <= 330 ? fromHsl(42, 0.92, 0.6) : fromHsl((h + 200) % 360, Math.max(0.55, s), 0.5));
  return {
    primary, secondary, accent,
    primaryDark: mix(primary, '#000000', 0.45), primaryDeep: mix(primary, '#05060a', 0.72),
    primaryLight: mix(primary, '#ffffff', 0.9), primarySoft: mix(primary, '#ffffff', 0.7),
    ink: '#14161a', paper: '#f6f3ee', white: '#ffffff', black: '#0b0b0c', muted: '#6b7280',
    onPrimary: inkOn(primary), onSecondary: inkOn(secondary), onAccent: inkOn(accent),
  };
}

/** A colour reference as a CSS colour, tokens resolved. */
export function resolveColor(c: ColorRef, pal: Record<Token, string>): string {
  if (c.startsWith('$')) {
    const [name, alpha] = c.slice(1).split('/');
    const base = pal[name as Token] ?? '#000000';
    if (!alpha) return base;
    const [r, g, bl] = rgb(base);
    return `rgba(${r},${g},${bl},${Number(alpha)})`;
  }
  return c;
}

/* ── Type ────────────────────────────────────────────────────────────────── */

/**
 * Font pairings, all from Google Fonts under the SIL Open Font License — free
 * to use commercially, including in the images a customer exports and sells
 * with. Loaded only when the designer opens (render.ts `ensureFonts`).
 */
export type FontPairId = 'impact' | 'editorial' | 'luxe' | 'modern' | 'geometric' | 'friendly' | 'classic' | 'heavy';
export interface FontFaceRef { family: string; weights: number[]; italic?: boolean }
export interface FontPair { id: FontPairId; label: string; display: FontFaceRef; body: FontFaceRef; feel: string }

export const FONT_PAIRS: FontPair[] = [
  { id: 'impact', label: 'Impact', feel: 'Loud, condensed headlines for offers', display: { family: 'Anton', weights: [400] }, body: { family: 'Inter', weights: [400, 600, 800] } },
  { id: 'editorial', label: 'Editorial', feel: 'A magazine serif with a clean sans', display: { family: 'Playfair Display', weights: [600, 800], italic: true }, body: { family: 'Inter', weights: [400, 600, 800] } },
  { id: 'luxe', label: 'Luxury', feel: 'Fine serif, wide-spaced capitals', display: { family: 'Cormorant Garamond', weights: [500, 700], italic: true }, body: { family: 'Montserrat', weights: [400, 600] } },
  { id: 'modern', label: 'Modern', feel: 'Confident geometric sans', display: { family: 'Montserrat', weights: [700, 900] }, body: { family: 'Inter', weights: [400, 600, 800] } },
  { id: 'geometric', label: 'Corporate', feel: 'Technical, precise, calm', display: { family: 'Space Grotesk', weights: [500, 700] }, body: { family: 'Inter', weights: [400, 600, 800] } },
  { id: 'friendly', label: 'Friendly', feel: 'Round and warm', display: { family: 'Poppins', weights: [600, 800] }, body: { family: 'Poppins', weights: [400, 600] } },
  { id: 'classic', label: 'Classic', feel: 'Elegant display serif, plain body', display: { family: 'DM Serif Display', weights: [400], italic: true }, body: { family: 'DM Sans', weights: [400, 700] } },
  { id: 'heavy', label: 'Heavy', feel: 'Black poster sans', display: { family: 'Archivo Black', weights: [400] }, body: { family: 'DM Sans', weights: [400, 700] } },
];
export const fontPairOf = (id: string): FontPair => FONT_PAIRS.find(f => f.id === id) ?? FONT_PAIRS[3];

/* ── Content ─────────────────────────────────────────────────────────────── */

/** Every text a template can bind a layer to. */
export type TextSlot =
  | 'eyebrow' | 'headline' | 'subhead' | 'cta' | 'offer' | 'price' | 'priceNote'
  | 'company' | 'website' | 'phone' | 'email' | 'address'
  | 'date' | 'time' | 'location' | 'quote' | 'author' | 'authorRole' | 'rating'
  | 'beforeLabel' | 'afterLabel' | 'occasion' | 'beds' | 'baths' | 'area' | 'handle'
  | 'slideTitle' | 'slideBody' | 'slideNumber';
export type ListSlot = 'points';
export type ImageSlot = 'photo' | 'photo2' | 'product' | 'logo' | 'avatar';

export interface ImageRef {
  /** https address, data: URL, or `media:<id>` for a picture kept in the Media Center. */
  src: string;
  /** Where the eye should stay when the picture is cropped, 0–1 each way. */
  focal?: [number, number];
  zoom?: number;
  /** Where it came from — said in the editor and kept for licence questions. */
  origin: 'library' | 'upload' | 'openverse' | 'brand' | 'media';
  credit?: string;
  license?: string;
  licenseUrl?: string;
  /** A library photo's id (photos.ts), so it can be fetched at the size each layer needs. */
  libraryId?: string;
}

export interface DesignContent {
  eyebrow?: string; headline?: string; subhead?: string; cta?: string;
  /** Only ever what the customer typed — never written by the AI. */
  offer?: string; price?: string; priceNote?: string;
  website?: string; phone?: string; email?: string; address?: string;
  date?: string; time?: string; location?: string;
  /** A real customer's words and name, typed or pasted by the customer. */
  quote?: string; author?: string; authorRole?: string; rating?: string;
  beforeLabel?: string; afterLabel?: string; occasion?: string;
  beds?: string; baths?: string; area?: string; handle?: string;
  points?: string[];
  slides?: { title: string; body: string }[];
}

/** What the customer may switch off without breaking the composition. */
export type ToggleKey = 'logo' | 'eyebrow' | 'cta' | 'subhead' | 'contact' | 'pattern' | 'badge' | 'points' | 'frame';

/**
 * A saved design: which template, which format, and what fills it. Kept on
 * the post (`DesignPost.design`), so the post can be reopened and edited as
 * a template rather than as loose shapes.
 */
export interface DesignDoc {
  v: 1;
  templateId: string;
  format: FormatId;
  content: DesignContent;
  company: string;
  images: Partial<Record<ImageSlot, ImageRef>>;
  colors: BrandColors;
  fontPair?: FontPairId;
  hidden?: ToggleKey[];
  /** Which business it was made for (an AI Autopilot portfolio id), when known. */
  businessId?: string;
  industry?: string;
  objective?: ObjectiveId;
  /** The words posted with the picture. */
  caption?: string;
  hashtags?: string[];
}

/* ── Layers ──────────────────────────────────────────────────────────────── */

/** A box in fractions of the canvas: x and w of its width, y and h of its height. */
export interface Box { x: number; y: number; w: number; h: number }

/** What may change for one shape of canvas besides the box. */
export interface Tweak { align?: 'left' | 'center' | 'right'; valign?: 'top' | 'middle' | 'bottom'; mask?: Mask }

interface LayerBase {
  /** Where it sits; `at` moves (or re-aligns) it for one shape of canvas, or hides it there (null). */
  box: Box;
  at?: Partial<Record<AspectClass, (Partial<Box> & Tweak) | null>>;
  opacity?: number;
  rotate?: number;
  /** Drawn only when every named slot has something in it. */
  when?: (TextSlot | ImageSlot | ListSlot)[];
  /** Drawn only when this slot is empty. */
  unless?: TextSlot | ImageSlot | ListSlot;
  /** The customer may hide it with this switch. */
  toggle?: ToggleKey;
  shadow?: { color: ColorRef; blur: number; y: number };
}

export interface RectLayer extends LayerBase { kind: 'rect'; fill: Paint; radius?: number | 'pill'; stroke?: { color: ColorRef; width: number } }
export interface EllipseLayer extends LayerBase { kind: 'ellipse'; fill: Paint; stroke?: { color: ColorRef; width: number } }
/** Points are fractions of the layer's own box. */
export interface PolyLayer extends LayerBase { kind: 'poly'; points: [number, number][]; fill: Paint }
export type Mask = 'rect' | 'rounded' | 'circle' | 'arch' | 'pill' | 'slant-left' | 'slant-right' | 'slant-bottom' | 'blob';
export interface ImageLayer extends LayerBase {
  kind: 'image'; slot: ImageSlot; fit?: 'cover' | 'contain';
  mask?: Mask; radius?: number;
  filter?: 'none' | 'grayscale' | 'warm' | 'dim';
  /** A colour or gradient laid over the picture — the scrim that keeps words readable. */
  tint?: Paint;
  stroke?: { color: ColorRef; width: number };
}
export type FontRole = 'display' | 'body';
export interface TextLayer extends LayerBase {
  kind: 'text';
  slot?: TextSlot;
  /** Fixed words; `{company}` is replaced. */
  text?: string;
  font: FontRole;
  weight?: number;
  italic?: boolean;
  upper?: boolean;
  /** Letter spacing in em. */
  tracking?: number;
  /** Largest size, as a fraction of the canvas's shorter side; shrunk to fit. */
  size: number;
  minSize?: number;
  lineHeight?: number;
  maxLines?: number;
  align?: 'left' | 'center' | 'right';
  valign?: 'top' | 'middle' | 'bottom';
  color: ColorRef;
  /** A marker band behind each line. */
  highlight?: ColorRef;
  /** Put before the words: "★★★★★", "→". */
  prefix?: string;
}
export interface ButtonLayer extends LayerBase {
  kind: 'button'; slot: 'cta' | 'website' | 'phone';
  fill: ColorRef; color: ColorRef; font: FontRole; weight?: number; size: number;
  radius?: number | 'pill'; align?: 'left' | 'center' | 'right'; arrow?: boolean; outline?: boolean; upper?: boolean; tracking?: number;
}
export interface BadgeLayer extends LayerBase {
  kind: 'badge'; slot: 'offer' | 'price' | 'occasion' | 'eyebrow' | 'beforeLabel' | 'afterLabel';
  shape: 'circle' | 'burst' | 'tag' | 'pill';
  fill: ColorRef; color: ColorRef; font: FontRole; weight?: number; size: number; upper?: boolean;
  /** A small line above the main words: "from", "only". */
  label?: string;
}
export type IconName = 'check' | 'star' | 'arrow' | 'phone' | 'globe' | 'pin' | 'calendar' | 'clock' | 'quote' | 'spark' | 'home' | 'bed' | 'bath' | 'area' | 'snow' | 'sun' | 'leaf' | 'bag' | 'play' | 'mail';
/** `auto` picks the season's mark (snow, sun, leaf) from the occasion, `name` otherwise. */
export interface IconLayer extends LayerBase { kind: 'icon'; name: IconName; color: ColorRef; weight?: number; auto?: boolean }
export interface PatternLayer extends LayerBase { kind: 'pattern'; pattern: 'dots' | 'grid' | 'diagonal' | 'rings' | 'waves'; color: ColorRef; spacing: number }
export interface ListLayer extends LayerBase {
  kind: 'list'; slot: ListSlot; font: FontRole; weight?: number; size: number; color: ColorRef;
  bullet: 'check' | 'number' | 'dot' | 'dash'; bulletColor: ColorRef; bulletFill?: ColorRef; maxItems?: number; lineHeight?: number;
}
export interface StarsLayer extends LayerBase { kind: 'stars'; slot: 'rating'; color: ColorRef; empty?: ColorRef; align?: 'left' | 'center' | 'right' }

export type Layer = RectLayer | EllipseLayer | PolyLayer | ImageLayer | TextLayer | ButtonLayer | BadgeLayer | IconLayer | PatternLayer | ListLayer | StarsLayer;

/* ── Templates ───────────────────────────────────────────────────────────── */

export type CategoryId =
  | 'promotions' | 'product' | 'educational' | 'quotes' | 'announcements' | 'services' | 'testimonials'
  | 'before-after' | 'events' | 'seasonal' | 'real-estate' | 'home-services' | 'ecommerce' | 'personal-brand'
  | 'carousel' | 'stories';
export type StyleId = 'minimal-editorial' | 'bold-promotional' | 'premium-luxury' | 'modern-corporate' | 'colorful-creative' | 'image-led' | 'warm-friendly';
export type ObjectiveId = 'sell' | 'leads' | 'bookings' | 'awareness' | 'educate' | 'trust' | 'event' | 'launch';
export type IndustryId = 'any' | 'ecommerce' | 'real-estate' | 'hvac' | 'roofing' | 'home-services' | 'agency' | 'personal-brand'
  | 'food' | 'fitness' | 'beauty' | 'health' | 'professional';

export const CATEGORIES: { id: CategoryId; label: string }[] = [
  { id: 'promotions', label: 'Offers & discounts' },
  { id: 'product', label: 'Product launches & showcases' },
  { id: 'educational', label: 'Tips & education' },
  { id: 'quotes', label: 'Quotes & thought leadership' },
  { id: 'announcements', label: 'Announcements' },
  { id: 'services', label: 'Service promotions' },
  { id: 'testimonials', label: 'Testimonials & reviews' },
  { id: 'before-after', label: 'Before & after' },
  { id: 'events', label: 'Events & invitations' },
  { id: 'seasonal', label: 'Seasonal & holidays' },
  { id: 'real-estate', label: 'Real estate' },
  { id: 'home-services', label: 'Home services (HVAC, roofing…)' },
  { id: 'ecommerce', label: 'E-commerce' },
  { id: 'personal-brand', label: 'Personal brands & creators' },
  { id: 'carousel', label: 'Carousels' },
  { id: 'stories', label: 'Stories & vertical' },
];
export const STYLES: { id: StyleId; label: string }[] = [
  { id: 'minimal-editorial', label: 'Minimal editorial' },
  { id: 'bold-promotional', label: 'Bold promotional' },
  { id: 'premium-luxury', label: 'Premium luxury' },
  { id: 'modern-corporate', label: 'Modern corporate' },
  { id: 'colorful-creative', label: 'Colourful creative' },
  { id: 'image-led', label: 'Image-led' },
  { id: 'warm-friendly', label: 'Warm & friendly' },
];
export const OBJECTIVES: { id: ObjectiveId; label: string; cta: string }[] = [
  { id: 'sell', label: 'Sell a product or offer', cta: 'Shop now' },
  { id: 'leads', label: 'Get enquiries', cta: 'Get a quote' },
  { id: 'bookings', label: 'Get bookings', cta: 'Book now' },
  { id: 'awareness', label: 'Build awareness', cta: 'Learn more' },
  { id: 'educate', label: 'Teach something useful', cta: 'Save this post' },
  { id: 'trust', label: 'Build trust', cta: 'See our work' },
  { id: 'event', label: 'Promote an event', cta: 'Save your spot' },
  { id: 'launch', label: 'Launch something new', cta: 'Discover more' },
];
export const INDUSTRIES: { id: IndustryId; label: string }[] = [
  { id: 'any', label: 'Any business' },
  { id: 'ecommerce', label: 'E-commerce & retail' },
  { id: 'real-estate', label: 'Real estate' },
  { id: 'hvac', label: 'HVAC' },
  { id: 'roofing', label: 'Roofing' },
  { id: 'home-services', label: 'Home services' },
  { id: 'agency', label: 'Agencies' },
  { id: 'personal-brand', label: 'Personal brands & creators' },
  { id: 'food', label: 'Food & hospitality' },
  { id: 'fitness', label: 'Fitness & wellness' },
  { id: 'beauty', label: 'Beauty & salons' },
  { id: 'health', label: 'Health & clinics' },
  { id: 'professional', label: 'Professional services' },
];

/** How a layout is built — what makes two templates genuinely different. */
export type Family = 'full-bleed' | 'split' | 'framed' | 'card' | 'type-led' | 'collage' | 'band' | 'poster';

export interface PageSpec { background: Paint; layers: Layer[] }

export interface TemplateSpec {
  id: string;
  name: string;
  description: string;
  categories: CategoryId[];
  style: StyleId;
  family: Family;
  industries: IndustryId[];
  objectives: ObjectiveId[];
  formats: FormatId[];
  fontPair: FontPairId;
  background: Paint;
  layers: Layer[];
  /** A carousel: a cover, one page per slide, and an end page. */
  pages?: { cover: PageSpec; slide: PageSpec; end: PageSpec };
  /** Slots this template cannot do without — the editor asks for them rather than inventing them. */
  needs: (TextSlot | ImageSlot | ListSlot)[];
  /** Longest words that suit each box, so the writer is asked for what fits. */
  limits: Partial<Record<TextSlot | 'point', number>>;
  /** Library topics for its photo, in order of preference. */
  photoTopics: PhotoTopic[];
  /** The photo must be the customer's own (their work, their face) — a library picture would mislead. */
  ownPhotos?: boolean;
  /** A neutral headline for a design made before the business has told us anything — never a claim. */
  sample?: string;
  /** Fixed words a fresh design starts with, for slots that are a label rather than a fact. */
  defaults?: Partial<DesignContent>;
  /** Where the design came from, for licence questions. */
  source: { kind: 'original'; by: string; license: string };
}

export type PhotoTopic =
  | 'product' | 'beauty-product' | 'fashion' | 'shopping' | 'home-exterior' | 'interior' | 'keys'
  | 'hvac' | 'roofing' | 'plumbing' | 'electrical' | 'renovation' | 'cleaning' | 'garden'
  | 'food' | 'coffee' | 'fitness' | 'salon' | 'office' | 'team' | 'workspace' | 'study'
  | 'creator' | 'event' | 'celebration' | 'winter' | 'summer' | 'spring' | 'autumn' | 'halloween' | 'valentine' | 'new-year'
  | 'abstract' | 'texture' | 'clinic';

export const ORIGINAL: TemplateSpec['source'] = {
  kind: 'original',
  by: 'Protected Central design library',
  license: 'Original design. Customers may use, change and publish designs made from it, commercially included.',
};
