/**
 * The built-in template library — original designs, written for this product.
 *
 * Each one is a different composition, not a recolour: a full-bleed photo
 * with a scrim, a split, a framed luxury card, a type-led editorial page, a
 * collage, a poster of shapes. Every layer is placed for the four canvas
 * shapes (`at` moves it for portrait, story or landscape), so a design moves
 * to another format by being laid out again, not stretched or cropped.
 *
 * Boxes are fractions of the canvas; sizes are fractions of its shorter
 * side; colours are brand tokens where the customer's colours belong and
 * literals where the style needs its own (the gold of the luxury frame).
 *
 * To add one: give it a family, the slots it cannot do without (`needs`),
 * check it in the gallery at all four shapes, and run `npm run test:socialtemplates`
 * — it fails if a template names a slot, font pair or photo topic that does
 * not exist, or forgets a format it claims.
 */
import { ORIGINAL, type Layer, type TemplateSpec } from './spec';

const T = (t: Omit<TemplateSpec, 'source'>): TemplateSpec => ({ ...t, source: ORIGINAL });

/* A few recurring pieces, so the templates read as compositions rather than numbers. */
const logo = (x: number, y: number, w: number, h: number, extra: Partial<Layer> = {}): Layer[] => [
  { kind: 'image', slot: 'logo', fit: 'contain', box: { x, y, w, h }, when: ['logo'], toggle: 'logo', ...extra } as Layer,
  { kind: 'text', slot: 'company', font: 'body', weight: 800, upper: true, tracking: 0.12, size: 0.03, maxLines: 1, color: '#ffffff', box: { x, y, w, h }, valign: 'middle', unless: 'logo', toggle: 'logo', ...extra } as Layer,
];
const scrimBottom = { type: 'linear' as const, angle: 180, stops: [['rgba(8,9,12,0)', 0.28], ['rgba(8,9,12,0.55)', 0.6], ['rgba(8,9,12,0.92)', 1]] as [string, number][] };

export const TEMPLATES: TemplateSpec[] = [
  /* ── 1. Spotlight offer — the photo is the ad ─────────────────────────── */
  T({
    id: 'spotlight-offer', sample: 'Made for your day', name: 'Spotlight', family: 'full-bleed', style: 'bold-promotional', fontPair: 'impact',
    description: 'A full-bleed photo, a bold condensed headline over a dark scrim, and your offer in a starburst when you have one.',
    categories: ['promotions', 'services', 'stories'], industries: ['any', 'home-services', 'hvac', 'roofing', 'fitness', 'food', 'beauty', 'ecommerce'],
    objectives: ['sell', 'bookings', 'leads', 'awareness'], formats: ['portrait', 'square', 'story', 'landscape', 'wide'],
    background: '$primaryDeep', needs: ['headline'], limits: { headline: 42, subhead: 80, cta: 18, eyebrow: 22, offer: 14 },
    photoTopics: ['shopping', 'office'], defaults: {},
    layers: [
      { kind: 'image', slot: 'photo', box: { x: 0, y: 0, w: 1, h: 1 }, tint: scrimBottom },
      ...logo(0.06, 0.05, 0.22, 0.08, { at: { landscape: { x: 0.04, y: 0.07, w: 0.16, h: 0.12 } } }),
      { kind: 'text', slot: 'eyebrow', font: 'body', weight: 800, upper: true, tracking: 0.14, size: 0.03, maxLines: 1, color: '$onAccent', highlight: '$accent', box: { x: 0.075, y: 0.52, w: 0.7, h: 0.05 }, toggle: 'eyebrow', at: { story: { y: 0.53, h: 0.035 }, landscape: { x: 0.05, y: 0.3, h: 0.08 } } },
      { kind: 'text', slot: 'headline', font: 'display', upper: true, size: 0.15, minSize: 0.07, lineHeight: 0.95, maxLines: 3, color: '#ffffff', valign: 'bottom', box: { x: 0.06, y: 0.58, w: 0.88, h: 0.26 }, at: { story: { y: 0.58, h: 0.2 }, landscape: { x: 0.04, y: 0.41, w: 0.6, h: 0.38 } } },
      { kind: 'text', slot: 'subhead', font: 'body', weight: 500, size: 0.034, maxLines: 2, color: 'rgba(255,255,255,0.84)', box: { x: 0.06, y: 0.86, w: 0.54, h: 0.09 }, toggle: 'subhead', at: { story: { y: 0.79, w: 0.86, h: 0.06 }, landscape: { x: 0.04, y: 0.82, w: 0.56, h: 0.12 } } },
      { kind: 'button', slot: 'cta', fill: '$accent', color: '$onAccent', font: 'body', weight: 800, size: 0.03, upper: true, tracking: 0.06, arrow: true, align: 'right', box: { x: 0.6, y: 0.865, w: 0.34, h: 0.08 }, toggle: 'cta', at: { story: { x: 0.06, y: 0.88, w: 0.88, h: 0.06 }, landscape: { x: 0.66, y: 0.82, w: 0.3, h: 0.12 } } },
      { kind: 'badge', slot: 'offer', shape: 'burst', fill: '$accent', color: '$onAccent', font: 'display', size: 0.075, upper: true, rotate: 10, box: { x: 0.65, y: 0.08, w: 0.29, h: 0.29 }, when: ['offer'], toggle: 'badge', at: { story: { x: 0.6, y: 0.13, w: 0.33, h: 0.19 }, landscape: { x: 0.76, y: 0.08, w: 0.2, h: 0.4 } } },
    ],
  }),

  /* ── 2. Split showcase — product beside the words ─────────────────────── */
  T({
    id: 'split-showcase', sample: 'Introducing something new', name: 'Split Showcase', family: 'split', style: 'minimal-editorial', fontPair: 'editorial', ownPhotos: true,
    description: 'Your product photo on one half, a serif headline, a price and a button on calm paper on the other.',
    categories: ['product', 'ecommerce'], industries: ['ecommerce', 'beauty', 'food', 'any'],
    objectives: ['launch', 'sell'], formats: ['portrait', 'square', 'story', 'landscape', 'wide'],
    background: '$paper', needs: ['headline', 'photo'], limits: { headline: 48, subhead: 110, cta: 16, eyebrow: 20, price: 14 },
    photoTopics: ['beauty-product', 'product'], defaults: { eyebrow: 'New in' },
    layers: [
      { kind: 'image', slot: 'photo', box: { x: 0.5, y: 0, w: 0.5, h: 1 }, at: { story: { x: 0, y: 0, w: 1, h: 0.55 }, landscape: { x: 0.52, w: 0.48 } } },
      { kind: 'image', slot: 'logo', fit: 'contain', box: { x: 0.07, y: 0.055, w: 0.18, h: 0.06 }, when: ['logo'], toggle: 'logo', at: { story: { x: 0.07, y: 0.025, w: 0.2, h: 0.04 } } },
      { kind: 'text', slot: 'company', font: 'body', weight: 800, upper: true, tracking: 0.14, size: 0.024, maxLines: 1, color: '$ink', box: { x: 0.07, y: 0.06, w: 0.38, h: 0.04 }, unless: 'logo', toggle: 'logo', at: { story: { y: 0.59, h: 0.025 }, landscape: { x: 0.06, y: 0.08 } } },
      { kind: 'text', slot: 'eyebrow', font: 'body', weight: 700, upper: true, tracking: 0.2, size: 0.026, maxLines: 1, color: '$primary', box: { x: 0.07, y: 0.16, w: 0.38, h: 0.04 }, toggle: 'eyebrow', at: { story: { y: 0.625, w: 0.86, h: 0.025 }, landscape: { x: 0.06, y: 0.2, w: 0.42 } } },
      { kind: 'text', slot: 'headline', font: 'display', weight: 800, size: 0.085, minSize: 0.045, lineHeight: 1.04, maxLines: 4, color: '$ink', box: { x: 0.07, y: 0.215, w: 0.39, h: 0.36 }, at: { story: { y: 0.655, w: 0.86, h: 0.14 }, landscape: { x: 0.06, y: 0.28, w: 0.42, h: 0.32 } } },
      { kind: 'rect', fill: '$primary', box: { x: 0.07, y: 0.6, w: 0.08, h: 0.006 }, at: { story: { y: 0.81, w: 0.12, h: 0.003 }, landscape: { x: 0.06, y: 0.62, w: 0.06, h: 0.008 } } },
      { kind: 'text', slot: 'subhead', font: 'body', weight: 400, size: 0.03, lineHeight: 1.4, maxLines: 4, color: '$muted', box: { x: 0.07, y: 0.63, w: 0.37, h: 0.15 }, toggle: 'subhead', at: { story: { y: 0.825, w: 0.86, h: 0.05 }, landscape: { x: 0.06, y: 0.65, w: 0.42, h: 0.12 } } },
      { kind: 'text', slot: 'price', font: 'display', weight: 800, size: 0.06, maxLines: 1, color: '$ink', box: { x: 0.07, y: 0.795, w: 0.37, h: 0.07 }, when: ['price'], at: { story: { y: 0.885, w: 0.4, h: 0.045 }, landscape: { x: 0.06, y: 0.8, w: 0.18, h: 0.12 } } },
      { kind: 'button', slot: 'cta', fill: '$ink', color: '#ffffff', font: 'body', weight: 700, size: 0.026, arrow: true, align: 'left', radius: 0.004, box: { x: 0.07, y: 0.875, w: 0.37, h: 0.075 }, toggle: 'cta', at: { story: { x: 0.5, y: 0.885, w: 0.43, h: 0.05 }, landscape: { x: 0.26, y: 0.8, w: 0.23, h: 0.12 } } },
    ],
  }),

  /* ── 3. Editorial tip — a page from a magazine ───────────────────────── */
  T({
    id: 'editorial-tip', sample: 'Three things worth knowing', name: 'Editorial Tip', family: 'type-led', style: 'minimal-editorial', fontPair: 'classic',
    description: 'A type-led tip: a display serif headline, three checked points and your name at the foot of the page.',
    categories: ['educational'], industries: ['any', 'professional', 'agency', 'personal-brand', 'health', 'home-services'],
    objectives: ['educate', 'trust', 'awareness'], formats: ['portrait', 'square', 'story', 'landscape', 'wide'],
    background: '$paper', needs: ['headline'], limits: { headline: 70, point: 52, eyebrow: 24 },
    photoTopics: ['study'], defaults: { eyebrow: 'Tip of the week' },
    layers: [
      { kind: 'ellipse', fill: '$primarySoft', box: { x: 0.64, y: -0.16, w: 0.56, h: 0.56 }, at: { story: { x: 0.56, y: -0.08, w: 0.6, h: 0.34 }, landscape: { x: 0.8, y: -0.3, w: 0.36, h: 0.75 } } },
      { kind: 'pattern', pattern: 'dots', color: '$primary/0.3', spacing: 0.032, box: { x: 0.07, y: 0.07, w: 0.26, h: 0.14 }, toggle: 'pattern', at: { story: { h: 0.08 }, landscape: { x: 0.05, y: 0.07, w: 0.16, h: 0.12 } } },
      { kind: 'text', slot: 'eyebrow', font: 'body', weight: 800, upper: true, tracking: 0.18, size: 0.028, maxLines: 1, color: '$primary', box: { x: 0.08, y: 0.27, w: 0.7, h: 0.04 }, toggle: 'eyebrow', at: { story: { y: 0.2, h: 0.025 }, landscape: { x: 0.05, y: 0.24, w: 0.5, h: 0.06 } } },
      { kind: 'text', slot: 'headline', font: 'display', size: 0.1, minSize: 0.05, lineHeight: 1.04, maxLines: 4, color: '$ink', box: { x: 0.08, y: 0.32, w: 0.84, h: 0.3 }, at: { story: { y: 0.24, h: 0.28 }, landscape: { x: 0.05, y: 0.32, w: 0.5, h: 0.46 } } },
      { kind: 'list', slot: 'points', font: 'body', weight: 500, size: 0.033, color: '$ink', bullet: 'check', bulletColor: '$onPrimary', bulletFill: '$primary', maxItems: 3, box: { x: 0.08, y: 0.64, w: 0.84, h: 0.22 }, toggle: 'points', at: { story: { y: 0.56, h: 0.26 }, landscape: { x: 0.6, y: 0.24, w: 0.35, h: 0.56 } } },
      { kind: 'text', slot: 'subhead', font: 'body', weight: 400, size: 0.034, lineHeight: 1.45, maxLines: 4, color: '#374151', box: { x: 0.08, y: 0.65, w: 0.8, h: 0.2 }, unless: 'points', toggle: 'subhead', at: { story: { y: 0.56, h: 0.2 }, landscape: { x: 0.6, y: 0.28, w: 0.35, h: 0.5 } } },
      { kind: 'rect', fill: 'rgba(20,22,26,0.14)', box: { x: 0.08, y: 0.9, w: 0.84, h: 0.002 }, at: { landscape: { x: 0.05, y: 0.86, w: 0.9, h: 0.003 } } },
      { kind: 'text', slot: 'company', font: 'body', weight: 800, upper: true, tracking: 0.12, size: 0.024, maxLines: 1, color: '$ink', box: { x: 0.08, y: 0.92, w: 0.5, h: 0.04 }, at: { landscape: { x: 0.05, y: 0.89, h: 0.07 } } },
      { kind: 'text', slot: 'website', font: 'body', weight: 500, size: 0.024, maxLines: 1, align: 'right', color: '$muted', box: { x: 0.5, y: 0.92, w: 0.42, h: 0.04 }, toggle: 'contact', at: { landscape: { x: 0.55, y: 0.89, w: 0.4, h: 0.07 } } },
    ],
  }),

  /* ── 4. Quote card — your own words, set large ────────────────────────── */
  T({
    id: 'quote-card', name: 'Statement', family: 'type-led', style: 'minimal-editorial', fontPair: 'editorial',
    description: 'A big italic quote on a deep brand colour, with who said it. For your own words and ideas — not for reviews.',
    categories: ['quotes', 'personal-brand'], industries: ['any', 'professional', 'agency', 'personal-brand'],
    objectives: ['trust', 'awareness', 'educate'], formats: ['portrait', 'square', 'story', 'landscape', 'wide'],
    background: { type: 'linear', angle: 160, stops: [['$primaryDark', 0], ['$primaryDeep', 1]] }, needs: ['quote', 'author'], limits: { quote: 140, author: 32, authorRole: 40 },
    photoTopics: ['abstract'],
    layers: [
      { kind: 'pattern', pattern: 'rings', color: 'rgba(255,255,255,0.06)', spacing: 0.06, box: { x: 0.5, y: 0.5, w: 0.6, h: 0.6 }, toggle: 'pattern', at: { landscape: { x: 0.7, y: 0.4, w: 0.4, h: 0.7 } } },
      { kind: 'icon', name: 'quote', color: '$accent', box: { x: 0.08, y: 0.1, w: 0.13, h: 0.12 }, at: { story: { y: 0.18, h: 0.07 }, landscape: { x: 0.05, y: 0.16, w: 0.1, h: 0.2 } } },
      { kind: 'text', slot: 'quote', font: 'display', weight: 600, italic: true, size: 0.078, minSize: 0.042, lineHeight: 1.2, maxLines: 7, color: '#ffffff', box: { x: 0.08, y: 0.26, w: 0.84, h: 0.44 }, at: { story: { y: 0.28, h: 0.4 }, landscape: { x: 0.2, y: 0.16, w: 0.74, h: 0.52 } } },
      { kind: 'rect', fill: '$accent', box: { x: 0.08, y: 0.74, w: 0.07, h: 0.006 }, at: { story: { y: 0.71, h: 0.004 }, landscape: { x: 0.2, y: 0.73, w: 0.05, h: 0.01 } } },
      { kind: 'text', slot: 'author', font: 'body', weight: 700, size: 0.032, maxLines: 1, color: '#ffffff', box: { x: 0.08, y: 0.765, w: 0.6, h: 0.05 }, at: { story: { y: 0.725, h: 0.035 }, landscape: { x: 0.2, y: 0.76, w: 0.5, h: 0.08 } } },
      { kind: 'text', slot: 'authorRole', font: 'body', weight: 400, size: 0.026, maxLines: 1, color: 'rgba(255,255,255,0.66)', box: { x: 0.08, y: 0.815, w: 0.6, h: 0.04 }, at: { story: { y: 0.76, h: 0.03 }, landscape: { x: 0.2, y: 0.84, w: 0.5, h: 0.07 } } },
      { kind: 'image', slot: 'logo', fit: 'contain', box: { x: 0.72, y: 0.87, w: 0.2, h: 0.07 }, when: ['logo'], toggle: 'logo', at: { story: { y: 0.9, h: 0.04 }, landscape: { x: 0.8, y: 0.8, w: 0.15, h: 0.12 } } },
    ],
  }),

  /* ── 5. Review card — a real customer's words ─────────────────────────── */
  T({
    id: 'review-card', name: 'Review Card', family: 'card', style: 'warm-friendly', fontPair: 'friendly',
    description: 'A customer review on a lifted white card, with their stars when you add their rating. Paste a real review — nothing is written for you.',
    categories: ['testimonials'], industries: ['any', 'home-services', 'hvac', 'roofing', 'real-estate', 'beauty', 'health', 'food'],
    objectives: ['trust'], formats: ['portrait', 'square', 'story', 'landscape', 'wide'],
    background: { type: 'linear', angle: 155, stops: [['$primary', 0], ['$primaryDark', 1]] }, needs: ['quote', 'author'], limits: { quote: 220, author: 30, authorRole: 40, eyebrow: 30, cta: 18 },
    photoTopics: ['abstract'], defaults: { eyebrow: 'What our customers say' },
    layers: [
      { kind: 'pattern', pattern: 'dots', color: 'rgba(255,255,255,0.14)', spacing: 0.035, box: { x: 0.6, y: 0, w: 0.4, h: 0.2 }, toggle: 'pattern', at: { landscape: { x: 0.65, y: 0.55, w: 0.35, h: 0.45 } } },
      { kind: 'text', slot: 'eyebrow', font: 'body', weight: 800, upper: true, tracking: 0.1, size: 0.03, maxLines: 1, color: '#ffffff', box: { x: 0.07, y: 0.065, w: 0.86, h: 0.05 }, toggle: 'eyebrow', at: { story: { y: 0.13, h: 0.035 }, landscape: { x: 0.65, y: 0.18, w: 0.31, h: 0.3 } } },
      { kind: 'rect', fill: '#ffffff', radius: 0.04, shadow: { color: 'rgba(0,0,0,0.25)', blur: 0.05, y: 0.02 }, box: { x: 0.07, y: 0.15, w: 0.86, h: 0.64 }, at: { story: { y: 0.19, h: 0.56 }, landscape: { x: 0.05, y: 0.1, w: 0.56, h: 0.8 } } },
      { kind: 'stars', slot: 'rating', color: '#F5B83D', empty: '#e5e7eb', box: { x: 0.13, y: 0.21, w: 0.4, h: 0.05 }, when: ['rating'], at: { story: { y: 0.23, h: 0.03 }, landscape: { x: 0.09, y: 0.17, w: 0.25, h: 0.08 } } },
      { kind: 'text', slot: 'quote', font: 'body', weight: 500, size: 0.05, minSize: 0.028, lineHeight: 1.34, maxLines: 8, color: '$ink', box: { x: 0.13, y: 0.29, w: 0.74, h: 0.34 }, at: { story: { y: 0.28, h: 0.33 }, landscape: { x: 0.09, y: 0.3, w: 0.48, h: 0.38 } } },
      { kind: 'text', slot: 'author', font: 'body', weight: 800, size: 0.032, maxLines: 1, color: '$ink', box: { x: 0.13, y: 0.665, w: 0.56, h: 0.045 }, at: { story: { y: 0.645, h: 0.03 }, landscape: { x: 0.09, y: 0.72, w: 0.4, h: 0.07 } } },
      { kind: 'text', slot: 'authorRole', font: 'body', weight: 400, size: 0.025, maxLines: 1, color: '$muted', box: { x: 0.13, y: 0.712, w: 0.56, h: 0.04 }, at: { story: { y: 0.678, h: 0.028 }, landscape: { x: 0.09, y: 0.79, w: 0.4, h: 0.06 } } },
      { kind: 'icon', name: 'quote', color: '$primarySoft', box: { x: 0.74, y: 0.64, w: 0.12, h: 0.1 }, at: { story: { y: 0.64, h: 0.07 }, landscape: { x: 0.52, y: 0.72, w: 0.07, h: 0.13 } } },
      { kind: 'image', slot: 'logo', fit: 'contain', box: { x: 0.07, y: 0.84, w: 0.3, h: 0.09 }, when: ['logo'], toggle: 'logo', at: { story: { y: 0.8, h: 0.05 }, landscape: { x: 0.65, y: 0.62, w: 0.25, h: 0.14 } } },
      { kind: 'text', slot: 'company', font: 'body', weight: 800, upper: true, tracking: 0.1, size: 0.03, maxLines: 1, color: '#ffffff', box: { x: 0.07, y: 0.84, w: 0.5, h: 0.09 }, valign: 'middle', unless: 'logo', toggle: 'logo', at: { story: { y: 0.8, h: 0.05 }, landscape: { x: 0.65, y: 0.62, w: 0.31, h: 0.14 } } },
      { kind: 'button', slot: 'cta', fill: '#ffffff', color: '$primaryDark', font: 'body', weight: 800, size: 0.028, align: 'right', box: { x: 0.56, y: 0.845, w: 0.37, h: 0.08 }, toggle: 'cta', at: { story: { x: 0.07, y: 0.88, w: 0.86, h: 0.06 }, landscape: null } },
    ],
  }),

  /* ── 6. Before / after — your own two photos ─────────────────────────── */
  T({
    id: 'before-after', sample: 'See the difference', name: 'Before & After', family: 'collage', style: 'image-led', fontPair: 'modern', ownPhotos: true,
    description: 'Two of your own photos side by side (stacked in a story), labelled, over a brand band with your headline.',
    categories: ['before-after', 'home-services', 'services'], industries: ['home-services', 'roofing', 'hvac', 'beauty', 'fitness', 'any'],
    objectives: ['trust', 'leads'], formats: ['portrait', 'square', 'story', 'landscape', 'wide'],
    background: '$ink', needs: ['photo', 'photo2', 'headline'], limits: { headline: 48, cta: 16, beforeLabel: 10, afterLabel: 10 },
    photoTopics: ['renovation', 'interior'], defaults: { beforeLabel: 'Before', afterLabel: 'After' },
    layers: [
      { kind: 'image', slot: 'photo', box: { x: 0, y: 0, w: 0.5, h: 0.78 }, filter: 'dim', at: { story: { w: 1, h: 0.39 } } },
      { kind: 'image', slot: 'photo2', box: { x: 0.5, y: 0, w: 0.5, h: 0.78 }, at: { story: { x: 0, y: 0.39, w: 1, h: 0.39 } } },
      { kind: 'rect', fill: '#ffffff', box: { x: 0.4965, y: 0, w: 0.007, h: 0.78 }, at: { story: { x: 0, y: 0.388, w: 1, h: 0.004 } } },
      { kind: 'badge', slot: 'beforeLabel', shape: 'pill', fill: 'rgba(10,10,12,0.72)', color: '#ffffff', font: 'body', weight: 800, size: 0.026, upper: true, box: { x: 0.04, y: 0.035, w: 0.2, h: 0.06 }, at: { story: { y: 0.02, w: 0.24, h: 0.035 }, landscape: { w: 0.14, h: 0.09 } } },
      { kind: 'badge', slot: 'afterLabel', shape: 'pill', fill: '$accent', color: '$onAccent', font: 'body', weight: 800, size: 0.026, upper: true, box: { x: 0.54, y: 0.035, w: 0.2, h: 0.06 }, at: { story: { x: 0.04, y: 0.41, w: 0.24, h: 0.035 }, landscape: { x: 0.54, w: 0.14, h: 0.09 } } },
      { kind: 'rect', fill: '$primary', box: { x: 0, y: 0.78, w: 1, h: 0.22 } },
      { kind: 'text', slot: 'headline', font: 'display', weight: 900, size: 0.06, minSize: 0.035, lineHeight: 1.05, maxLines: 2, color: '$onPrimary', valign: 'middle', box: { x: 0.06, y: 0.805, w: 0.58, h: 0.17 }, at: { story: { w: 0.86, h: 0.1 }, landscape: { x: 0.04, w: 0.6 } } },
      { kind: 'button', slot: 'cta', fill: '$onPrimary', color: '$primary', font: 'body', weight: 800, size: 0.028, align: 'right', box: { x: 0.66, y: 0.84, w: 0.28, h: 0.1 }, toggle: 'cta', at: { story: { x: 0.06, y: 0.91, w: 0.88, h: 0.06 }, landscape: { x: 0.7, w: 0.26 } } },
    ],
  }),

  /* ── 7. Event invite — the date first ────────────────────────────────── */
  T({
    id: 'event-invite', sample: 'Join us', name: 'Event Invite', family: 'band', style: 'modern-corporate', fontPair: 'modern',
    description: 'A tinted photo, a bold date block, the event name, time and place with icons, and an RSVP button.',
    categories: ['events', 'announcements'], industries: ['any', 'real-estate', 'professional', 'agency', 'food', 'fitness'],
    objectives: ['event', 'awareness'], formats: ['portrait', 'square', 'story', 'landscape', 'wide'],
    background: '$paper', needs: ['headline', 'date'], limits: { headline: 48, date: 12, time: 24, location: 36, eyebrow: 22, cta: 18 },
    photoTopics: ['event', 'celebration'], defaults: { eyebrow: 'You’re invited' },
    layers: [
      { kind: 'image', slot: 'photo', filter: 'grayscale', tint: '$primary/0.62', box: { x: 0, y: 0, w: 1, h: 0.5 }, at: { story: { h: 0.44 }, landscape: { x: 0.5, y: 0, w: 0.5, h: 1 } } },
      ...logo(0.07, 0.05, 0.22, 0.08, { at: { story: { h: 0.05 }, landscape: { x: 0.54, y: 0.07, w: 0.16, h: 0.12 } } }),
      { kind: 'rect', fill: '$accent', radius: 0.02, shadow: { color: 'rgba(0,0,0,0.2)', blur: 0.04, y: 0.015 }, box: { x: 0.07, y: 0.4, w: 0.27, h: 0.2 }, at: { story: { y: 0.37, w: 0.32, h: 0.12 }, landscape: { x: 0.05, y: 0.1, w: 0.17, h: 0.3 } } },
      { kind: 'text', slot: 'date', font: 'display', weight: 900, upper: true, size: 0.065, minSize: 0.03, lineHeight: 1, maxLines: 3, align: 'center', valign: 'middle', color: '$onAccent', box: { x: 0.085, y: 0.415, w: 0.24, h: 0.17 }, at: { story: { y: 0.38, w: 0.29, h: 0.1 }, landscape: { x: 0.06, y: 0.12, w: 0.15, h: 0.26 } } },
      { kind: 'text', slot: 'eyebrow', font: 'body', weight: 800, upper: true, tracking: 0.16, size: 0.026, maxLines: 1, color: '$primary', box: { x: 0.38, y: 0.535, w: 0.55, h: 0.05 }, toggle: 'eyebrow', at: { story: { x: 0.42, y: 0.455, w: 0.51, h: 0.03 }, landscape: { x: 0.05, y: 0.46, w: 0.42, h: 0.07 } } },
      { kind: 'text', slot: 'headline', font: 'display', weight: 900, size: 0.08, minSize: 0.045, lineHeight: 1.02, maxLines: 2, color: '$ink', box: { x: 0.07, y: 0.63, w: 0.86, h: 0.17 }, at: { story: { y: 0.52, h: 0.15 }, landscape: { x: 0.05, y: 0.53, w: 0.42, h: 0.22 } } },
      { kind: 'icon', name: 'clock', color: '$primary', box: { x: 0.07, y: 0.818, w: 0.045, h: 0.04 }, when: ['time'], at: { story: { y: 0.705, h: 0.025 }, landscape: { x: 0.05, y: 0.8, w: 0.03, h: 0.06 } } },
      { kind: 'text', slot: 'time', font: 'body', weight: 600, size: 0.03, maxLines: 1, color: '$ink', valign: 'middle', box: { x: 0.13, y: 0.813, w: 0.34, h: 0.05 }, at: { story: { x: 0.13, y: 0.7, w: 0.8, h: 0.035 }, landscape: { x: 0.09, y: 0.79, w: 0.38, h: 0.08 } } },
      { kind: 'icon', name: 'pin', color: '$primary', box: { x: 0.5, y: 0.818, w: 0.045, h: 0.04 }, when: ['location'], at: { story: { x: 0.07, y: 0.745, h: 0.025 }, landscape: { x: 0.05, y: 0.88, w: 0.03, h: 0.06 } } },
      { kind: 'text', slot: 'location', font: 'body', weight: 600, size: 0.03, maxLines: 1, color: '$ink', valign: 'middle', box: { x: 0.56, y: 0.813, w: 0.37, h: 0.05 }, at: { story: { x: 0.13, y: 0.74, w: 0.8, h: 0.035 }, landscape: { x: 0.09, y: 0.87, w: 0.38, h: 0.08 } } },
      { kind: 'button', slot: 'cta', fill: '$primary', color: '$onPrimary', font: 'body', weight: 800, size: 0.028, upper: true, tracking: 0.05, align: 'left', box: { x: 0.07, y: 0.89, w: 0.5, h: 0.075 }, toggle: 'cta', at: { story: { y: 0.84, w: 0.86, h: 0.055 }, landscape: null } },
    ],
  }),

  /* ── 8. Announcement — a poster of shapes ────────────────────────────── */
  T({
    id: 'announcement-shapes', sample: 'Big news is coming', name: 'Bauhaus News', family: 'poster', style: 'colorful-creative', fontPair: 'heavy',
    description: 'No photo needed: bold geometric shapes in your colours around a heavy headline. For news, openings and changes.',
    categories: ['announcements'], industries: ['any', 'agency', 'ecommerce', 'food', 'personal-brand'],
    objectives: ['awareness', 'launch', 'event'], formats: ['portrait', 'square', 'story', 'landscape', 'wide'],
    background: '$primary', needs: ['headline'], limits: { headline: 50, subhead: 90, eyebrow: 18 },
    photoTopics: ['abstract'], defaults: { eyebrow: 'News' },
    layers: [
      { kind: 'ellipse', fill: '$accent', box: { x: 0.56, y: -0.13, w: 0.6, h: 0.6 }, at: { story: { x: 0.42, y: -0.04, w: 0.8, h: 0.45 }, landscape: { x: 0.74, y: -0.35, w: 0.36, h: 0.9 } } },
      { kind: 'rect', fill: '$secondary', radius: 'pill', box: { x: -0.16, y: 0.76, w: 0.62, h: 0.34 }, at: { story: { x: -0.2, y: 0.82, w: 0.7, h: 0.24 }, landscape: { x: 0.8, y: 0.68, w: 0.3, h: 0.5 } } },
      { kind: 'ellipse', fill: '$paper', box: { x: 0.1, y: 0.1, w: 0.1, h: 0.1 }, at: { story: { y: 0.1, h: 0.06 }, landscape: { x: 0.9, y: 0.08, w: 0.05, h: 0.1 } } },
      { kind: 'poly', fill: '$paper', opacity: 0.92, points: [[0, 1], [1, 1], [1, 0]], box: { x: 0.72, y: 0.7, w: 0.22, h: 0.22 }, at: { story: { y: 0.78, h: 0.12 }, landscape: null } },
      { kind: 'pattern', pattern: 'dots', color: 'rgba(255,255,255,0.4)', spacing: 0.026, box: { x: 0.06, y: 0.6, w: 0.26, h: 0.1 }, toggle: 'pattern', at: { story: { y: 0.7, h: 0.06 }, landscape: { x: 0.62, y: 0.12, w: 0.1, h: 0.2 } } },
      { kind: 'text', slot: 'eyebrow', font: 'body', weight: 700, upper: true, tracking: 0.16, size: 0.03, maxLines: 1, color: '$ink', highlight: '$paper', box: { x: 0.09, y: 0.29, w: 0.6, h: 0.05 }, toggle: 'eyebrow', at: { story: { y: 0.33, h: 0.03 }, landscape: { x: 0.06, y: 0.17, w: 0.4, h: 0.08 } } },
      { kind: 'text', slot: 'headline', font: 'display', size: 0.115, minSize: 0.055, lineHeight: 1.02, maxLines: 4, color: '$onPrimary', box: { x: 0.08, y: 0.36, w: 0.84, h: 0.3 }, at: { story: { y: 0.38, h: 0.24 }, landscape: { x: 0.06, y: 0.3, w: 0.62, h: 0.42 } } },
      { kind: 'text', slot: 'subhead', font: 'body', weight: 500, size: 0.034, lineHeight: 1.35, maxLines: 3, color: '$onPrimary', opacity: 0.9, box: { x: 0.08, y: 0.68, w: 0.62, h: 0.1 }, toggle: 'subhead', at: { story: { y: 0.63, w: 0.84, h: 0.06 }, landscape: { x: 0.06, y: 0.75, w: 0.6, h: 0.16 } } },
      ...logo(0.68, 0.9, 0.24, 0.06, { at: { story: { x: 0.6, y: 0.93, w: 0.32, h: 0.035 }, landscape: { x: 0.06, y: 0.06, w: 0.16, h: 0.1 } } }),
    ],
  }),

  /* ── 9. Service checklist — photo, promise, three points ──────────────── */
  T({
    id: 'service-checklist', sample: 'Here when you need us', name: 'Service Card', family: 'card', style: 'warm-friendly', fontPair: 'friendly',
    description: 'A rounded photo, your service as the headline, three checked points from your own service list, and how to reach you.',
    categories: ['services', 'home-services'], industries: ['home-services', 'hvac', 'roofing', 'health', 'beauty', 'professional', 'any'],
    objectives: ['leads', 'bookings'], formats: ['portrait', 'square', 'story', 'landscape', 'wide'],
    background: '$paper', needs: ['headline'], limits: { headline: 44, point: 40, eyebrow: 24, cta: 18 },
    photoTopics: ['renovation', 'office'],
    layers: [
      { kind: 'image', slot: 'photo', mask: 'rounded', radius: 0.04, box: { x: 0.06, y: 0.05, w: 0.88, h: 0.44 }, at: { story: { y: 0.04, h: 0.37 }, landscape: { x: 0.035, y: 0.07, w: 0.42, h: 0.86 } } },
      { kind: 'text', slot: 'eyebrow', font: 'body', weight: 800, upper: true, tracking: 0.08, size: 0.026, maxLines: 1, color: '$onAccent', highlight: '$accent', box: { x: 0.1, y: 0.085, w: 0.7, h: 0.045 }, toggle: 'eyebrow', at: { story: { y: 0.07, h: 0.028 }, landscape: { x: 0.07, y: 0.13, w: 0.36, h: 0.07 } } },
      { kind: 'text', slot: 'company', font: 'body', weight: 800, upper: true, tracking: 0.14, size: 0.022, maxLines: 1, color: '$primary', box: { x: 0.06, y: 0.515, w: 0.88, h: 0.03 }, at: { story: { y: 0.43, h: 0.02 }, landscape: { x: 0.5, y: 0.08, w: 0.46, h: 0.06 } } },
      { kind: 'text', slot: 'headline', font: 'display', weight: 800, size: 0.072, minSize: 0.04, lineHeight: 1.06, maxLines: 2, color: '$ink', box: { x: 0.06, y: 0.55, w: 0.88, h: 0.15 }, at: { story: { y: 0.455, h: 0.13 }, landscape: { x: 0.5, y: 0.15, w: 0.46, h: 0.27 } } },
      { kind: 'list', slot: 'points', font: 'body', weight: 500, size: 0.032, color: '$ink', bullet: 'check', bulletColor: '$onPrimary', bulletFill: '$primary', maxItems: 3, box: { x: 0.06, y: 0.71, w: 0.88, h: 0.15 }, toggle: 'points', at: { story: { y: 0.6, h: 0.2 }, landscape: { x: 0.5, y: 0.44, w: 0.46, h: 0.3 } } },
      { kind: 'button', slot: 'cta', fill: '$primary', color: '$onPrimary', font: 'body', weight: 700, size: 0.028, arrow: true, align: 'left', box: { x: 0.06, y: 0.88, w: 0.46, h: 0.08 }, toggle: 'cta', at: { story: { y: 0.84, w: 0.88, h: 0.055 }, landscape: { x: 0.5, y: 0.79, w: 0.24, h: 0.13 } } },
      { kind: 'icon', name: 'phone', color: '$primary', box: { x: 0.56, y: 0.902, w: 0.04, h: 0.036 }, when: ['phone'], toggle: 'contact', at: { story: { x: 0.2, y: 0.915, w: 0.05, h: 0.025 }, landscape: { x: 0.76, y: 0.815, w: 0.03, h: 0.08 } } },
      { kind: 'text', slot: 'phone', font: 'body', weight: 700, size: 0.03, maxLines: 1, color: '$ink', valign: 'middle', box: { x: 0.61, y: 0.89, w: 0.33, h: 0.06 }, toggle: 'contact', at: { story: { x: 0.26, y: 0.908, w: 0.6, h: 0.04 }, landscape: { x: 0.8, y: 0.8, w: 0.17, h: 0.11 } } },
    ],
  }),

  /* ── 10. Just listed — a property card ───────────────────────────────── */
  T({
    id: 'just-listed', sample: 'A home worth seeing', name: 'Just Listed', family: 'band', style: 'image-led', fontPair: 'modern', ownPhotos: true,
    description: 'The listing photo with a ribbon, then a white panel with the price, address and beds, baths and size — each only when you add it.',
    categories: ['real-estate'], industries: ['real-estate'],
    objectives: ['sell', 'leads'], formats: ['portrait', 'square', 'story', 'landscape', 'wide'],
    background: '$ink', needs: ['headline', 'photo'], limits: { headline: 40, price: 16, address: 48, beds: 10, baths: 10, area: 14, eyebrow: 16, cta: 16 },
    photoTopics: ['home-exterior'], defaults: { eyebrow: 'Just listed' },
    layers: [
      { kind: 'image', slot: 'photo', box: { x: 0, y: 0, w: 1, h: 0.72 }, at: { story: { h: 0.64 }, landscape: { w: 0.62, h: 1 } } },
      { kind: 'rect', fill: '$accent', box: { x: 0, y: 0.055, w: 0.42, h: 0.075 }, at: { story: { y: 0.05, h: 0.045 }, landscape: { y: 0.08, w: 0.3, h: 0.12 } } },
      { kind: 'text', slot: 'eyebrow', font: 'display', weight: 900, upper: true, tracking: 0.08, size: 0.04, maxLines: 1, color: '$onAccent', valign: 'middle', box: { x: 0.05, y: 0.06, w: 0.36, h: 0.065 }, at: { story: { y: 0.053, h: 0.04 }, landscape: { x: 0.035, y: 0.09, w: 0.26, h: 0.1 } } },
      { kind: 'image', slot: 'logo', fit: 'contain', box: { x: 0.72, y: 0.05, w: 0.22, h: 0.08 }, when: ['logo'], toggle: 'logo', at: { story: { y: 0.04, h: 0.05 }, landscape: { x: 0.65, y: 0.06, w: 0.2, h: 0.12 } } },
      { kind: 'rect', fill: '#ffffff', box: { x: 0, y: 0.72, w: 1, h: 0.28 }, at: { story: { y: 0.64, h: 0.36 }, landscape: { x: 0.62, y: 0, w: 0.38, h: 1 } } },
      { kind: 'text', slot: 'headline', font: 'display', weight: 800, size: 0.052, minSize: 0.03, lineHeight: 1.08, maxLines: 2, color: '$ink', box: { x: 0.06, y: 0.745, w: 0.58, h: 0.08 }, at: { story: { y: 0.67, w: 0.88, h: 0.07 }, landscape: { x: 0.65, y: 0.24, w: 0.31, h: 0.18 } } },
      { kind: 'text', slot: 'price', font: 'display', weight: 900, size: 0.06, maxLines: 1, align: 'right', color: '$primary', box: { x: 0.62, y: 0.745, w: 0.32, h: 0.08 }, when: ['price'], at: { story: { x: 0.06, y: 0.745, w: 0.88, h: 0.055, align: 'left' }, landscape: { x: 0.65, y: 0.43, w: 0.31, h: 0.11 } } },
      { kind: 'text', slot: 'address', font: 'body', weight: 500, size: 0.028, maxLines: 1, color: '$muted', box: { x: 0.06, y: 0.832, w: 0.88, h: 0.04 }, at: { story: { y: 0.81, h: 0.03 }, landscape: { x: 0.65, y: 0.55, w: 0.31, h: 0.08 } } },
      { kind: 'icon', name: 'bed', color: '$primary', box: { x: 0.06, y: 0.9, w: 0.045, h: 0.04 }, when: ['beds'], at: { story: { y: 0.865, h: 0.025 }, landscape: { x: 0.65, y: 0.67, w: 0.03, h: 0.06 } } },
      { kind: 'text', slot: 'beds', font: 'body', weight: 700, size: 0.028, maxLines: 1, color: '$ink', valign: 'middle', box: { x: 0.115, y: 0.895, w: 0.15, h: 0.05 }, at: { story: { y: 0.86, h: 0.035 }, landscape: { x: 0.69, y: 0.66, w: 0.1, h: 0.08 } } },
      { kind: 'icon', name: 'bath', color: '$primary', box: { x: 0.27, y: 0.9, w: 0.045, h: 0.04 }, when: ['baths'], at: { story: { y: 0.865, h: 0.025 }, landscape: { x: 0.8, y: 0.67, w: 0.03, h: 0.06 } } },
      { kind: 'text', slot: 'baths', font: 'body', weight: 700, size: 0.028, maxLines: 1, color: '$ink', valign: 'middle', box: { x: 0.325, y: 0.895, w: 0.15, h: 0.05 }, at: { story: { y: 0.86, h: 0.035 }, landscape: { x: 0.84, y: 0.66, w: 0.12, h: 0.08 } } },
      { kind: 'icon', name: 'area', color: '$primary', box: { x: 0.48, y: 0.9, w: 0.04, h: 0.04 }, when: ['area'], at: { story: { y: 0.865, h: 0.025 }, landscape: { x: 0.65, y: 0.77, w: 0.03, h: 0.06 } } },
      { kind: 'text', slot: 'area', font: 'body', weight: 700, size: 0.028, maxLines: 1, color: '$ink', valign: 'middle', box: { x: 0.535, y: 0.895, w: 0.18, h: 0.05 }, at: { story: { y: 0.86, h: 0.035 }, landscape: { x: 0.69, y: 0.76, w: 0.25, h: 0.08 } } },
      { kind: 'button', slot: 'cta', fill: '$ink', color: '#ffffff', font: 'body', weight: 700, size: 0.026, align: 'right', box: { x: 0.72, y: 0.89, w: 0.22, h: 0.07 }, toggle: 'cta', at: { story: { x: 0.06, y: 0.92, w: 0.88, h: 0.05 }, landscape: { x: 0.65, y: 0.87, w: 0.31, h: 0.1 } } },
    ],
  }),

  /* ── 11. Open house — an arch and a fine serif ───────────────────────── */
  T({
    id: 'open-house', sample: 'Come and see', name: 'Open House', family: 'framed', style: 'premium-luxury', fontPair: 'luxe', ownPhotos: true,
    description: 'The property in an arch, a thin frame, an elegant serif and the date, time and address underneath.',
    categories: ['real-estate', 'events'], industries: ['real-estate'],
    objectives: ['event', 'leads'], formats: ['portrait', 'square', 'story', 'landscape', 'wide'],
    background: '$paper', needs: ['headline', 'date', 'photo'], limits: { headline: 34, date: 28, time: 24, address: 48, eyebrow: 16 },
    photoTopics: ['interior', 'home-exterior'], defaults: { eyebrow: 'Open house' },
    layers: [
      { kind: 'rect', fill: 'rgba(0,0,0,0)', stroke: { color: '$primary/0.45', width: 0.003 }, box: { x: 0.035, y: 0.03, w: 0.93, h: 0.94 }, toggle: 'frame', at: { landscape: { x: 0.02, y: 0.04, w: 0.96, h: 0.92 } } },
      { kind: 'image', slot: 'photo', mask: 'arch', box: { x: 0.2, y: 0.08, w: 0.6, h: 0.52 }, at: { story: { x: 0.14, y: 0.08, w: 0.72, h: 0.46 }, landscape: { x: 0.06, y: 0.1, w: 0.34, h: 0.8 } } },
      { kind: 'text', slot: 'eyebrow', font: 'body', weight: 600, upper: true, tracking: 0.34, size: 0.024, maxLines: 1, align: 'center', color: '$primary', box: { x: 0.1, y: 0.63, w: 0.8, h: 0.04 }, toggle: 'eyebrow', at: { story: { y: 0.58, h: 0.025 }, landscape: { x: 0.46, y: 0.16, w: 0.48, h: 0.07 } } },
      { kind: 'text', slot: 'headline', font: 'display', weight: 500, italic: true, size: 0.1, minSize: 0.05, lineHeight: 1.02, maxLines: 2, align: 'center', color: '$ink', box: { x: 0.08, y: 0.67, w: 0.84, h: 0.13 }, at: { story: { y: 0.61, h: 0.12 }, landscape: { x: 0.46, y: 0.25, w: 0.48, h: 0.28 } } },
      { kind: 'rect', fill: '$primary', box: { x: 0.47, y: 0.81, w: 0.06, h: 0.003 }, at: { story: { y: 0.745, h: 0.002 }, landscape: { x: 0.67, y: 0.56, w: 0.06, h: 0.005 } } },
      { kind: 'text', slot: 'date', font: 'body', weight: 600, upper: true, tracking: 0.1, size: 0.03, maxLines: 1, align: 'center', color: '$ink', box: { x: 0.1, y: 0.825, w: 0.8, h: 0.04 }, at: { story: { y: 0.765, h: 0.03 }, landscape: { x: 0.46, y: 0.6, w: 0.48, h: 0.08 } } },
      { kind: 'text', slot: 'time', font: 'body', weight: 400, size: 0.028, maxLines: 1, align: 'center', color: '$muted', box: { x: 0.1, y: 0.865, w: 0.8, h: 0.04 }, at: { story: { y: 0.8, h: 0.03 }, landscape: { x: 0.46, y: 0.69, w: 0.48, h: 0.07 } } },
      { kind: 'text', slot: 'address', font: 'body', weight: 400, size: 0.026, maxLines: 1, align: 'center', color: '$muted', box: { x: 0.1, y: 0.905, w: 0.8, h: 0.035 }, at: { story: { y: 0.835, h: 0.03 }, landscape: { x: 0.46, y: 0.77, w: 0.48, h: 0.07 } } },
      { kind: 'image', slot: 'logo', fit: 'contain', box: { x: 0.4, y: 0.945, w: 0.2, h: 0.04 }, when: ['logo'], toggle: 'logo', at: { story: { x: 0.35, y: 0.9, w: 0.3, h: 0.04 }, landscape: { x: 0.6, y: 0.85, w: 0.2, h: 0.08 } } },
    ],
  }),

  /* ── 12. Seasonal slant — a check-up, at the right time of year ──────── */
  T({
    id: 'seasonal-slant', sample: 'Get ready for the season', name: 'Seasonal Check-up', family: 'split', style: 'bold-promotional', fontPair: 'modern',
    description: 'A slanted photo panel, a season icon, a strong headline, a short checklist and your phone number — for maintenance reminders.',
    categories: ['home-services', 'seasonal', 'services'], industries: ['hvac', 'roofing', 'home-services'],
    objectives: ['bookings', 'leads'], formats: ['portrait', 'square', 'story', 'landscape', 'wide'],
    background: '$primaryDeep', needs: ['headline'], limits: { headline: 46, point: 34, eyebrow: 24, cta: 18 },
    photoTopics: ['hvac', 'home-exterior'], defaults: { eyebrow: 'Seasonal check-up' },
    layers: [
      { kind: 'image', slot: 'photo', mask: 'slant-left', box: { x: 0.42, y: 0, w: 0.58, h: 1 }, at: { story: { x: 0, y: 0, w: 1, h: 0.46, mask: 'slant-bottom' }, landscape: { x: 0.48, w: 0.52 } } },
      { kind: 'icon', name: 'spark', auto: true, color: '$accent', weight: 2.4, box: { x: 0.07, y: 0.085, w: 0.085, h: 0.085 }, at: { story: { y: 0.5, w: 0.08, h: 0.045 }, landscape: { x: 0.05, y: 0.09, w: 0.07, h: 0.13 } } },
      { kind: 'text', slot: 'company', font: 'body', weight: 800, upper: true, tracking: 0.1, size: 0.022, maxLines: 1, color: '#ffffff', valign: 'middle', box: { x: 0.17, y: 0.095, w: 0.24, h: 0.065 }, toggle: 'logo', at: { story: { x: 0.17, y: 0.5, w: 0.7, h: 0.045 }, landscape: { x: 0.13, y: 0.09, w: 0.32, h: 0.13 } } },
      { kind: 'text', slot: 'eyebrow', font: 'body', weight: 800, upper: true, tracking: 0.16, size: 0.026, maxLines: 1, color: '$accent', box: { x: 0.07, y: 0.22, w: 0.34, h: 0.04 }, toggle: 'eyebrow', at: { story: { y: 0.57, w: 0.86, h: 0.025 }, landscape: { x: 0.05, y: 0.27, w: 0.4, h: 0.07 } } },
      { kind: 'text', slot: 'headline', font: 'display', weight: 900, size: 0.078, minSize: 0.04, lineHeight: 1.04, maxLines: 4, color: '#ffffff', box: { x: 0.07, y: 0.27, w: 0.35, h: 0.3 }, at: { story: { y: 0.6, w: 0.86, h: 0.13 }, landscape: { x: 0.05, y: 0.35, w: 0.41, h: 0.26 } } },
      { kind: 'list', slot: 'points', font: 'body', weight: 500, size: 0.028, color: '#ffffff', bullet: 'check', bulletColor: '$accent', maxItems: 3, box: { x: 0.07, y: 0.6, w: 0.35, h: 0.2 }, toggle: 'points', at: { story: { y: 0.74, w: 0.86, h: 0.1 }, landscape: { x: 0.05, y: 0.63, w: 0.41, h: 0.17 } } },
      { kind: 'button', slot: 'cta', fill: '$accent', color: '$onAccent', font: 'body', weight: 800, size: 0.027, upper: true, tracking: 0.04, align: 'left', box: { x: 0.07, y: 0.83, w: 0.35, h: 0.08 }, toggle: 'cta', at: { story: { y: 0.87, w: 0.5, h: 0.055 }, landscape: { x: 0.05, y: 0.83, w: 0.22, h: 0.12 } } },
      { kind: 'text', slot: 'phone', font: 'body', weight: 700, size: 0.026, maxLines: 1, color: '#ffffff', prefix: '☎  ', box: { x: 0.07, y: 0.925, w: 0.35, h: 0.04 }, toggle: 'contact', at: { story: { x: 0.6, y: 0.875, w: 0.33, h: 0.04 }, landscape: { x: 0.29, y: 0.85, w: 0.18, h: 0.08 } } },
    ],
  }),

  /* ── 13. Luxe frame — black, gold, a circle ──────────────────────────── */
  T({
    id: 'luxe-frame', sample: 'The collection', name: 'Luxe Frame', family: 'framed', style: 'premium-luxury', fontPair: 'luxe',
    description: 'Black with a fine gold double frame, a circular photo and a widely spaced serif — for premium products and services.',
    categories: ['product', 'promotions', 'ecommerce'], industries: ['beauty', 'ecommerce', 'real-estate', 'food', 'any'],
    objectives: ['launch', 'sell', 'awareness'], formats: ['portrait', 'square', 'story', 'landscape', 'wide'],
    background: '#0d0d0f', needs: ['headline'], limits: { headline: 36, subhead: 70, eyebrow: 22, price: 16 },
    photoTopics: ['beauty-product', 'interior'], defaults: { eyebrow: 'The collection' },
    layers: [
      { kind: 'rect', fill: 'rgba(0,0,0,0)', stroke: { color: '#c8a96a', width: 0.003 }, box: { x: 0.045, y: 0.035, w: 0.91, h: 0.93 }, toggle: 'frame', at: { landscape: { x: 0.025, y: 0.05, w: 0.95, h: 0.9 } } },
      { kind: 'rect', fill: 'rgba(0,0,0,0)', stroke: { color: 'rgba(200,169,106,0.35)', width: 0.0015 }, box: { x: 0.06, y: 0.05, w: 0.88, h: 0.9 }, toggle: 'frame', at: { landscape: { x: 0.035, y: 0.07, w: 0.93, h: 0.86 } } },
      { kind: 'text', slot: 'eyebrow', font: 'body', weight: 600, upper: true, tracking: 0.42, size: 0.022, maxLines: 1, align: 'center', color: '#c8a96a', box: { x: 0.12, y: 0.105, w: 0.76, h: 0.035 }, toggle: 'eyebrow', at: { story: { y: 0.1, h: 0.022 }, landscape: { x: 0.42, y: 0.2, w: 0.52, h: 0.06 } } },
      { kind: 'image', slot: 'photo', mask: 'circle', stroke: { color: '#c8a96a', width: 0.004 }, box: { x: 0.29, y: 0.17, w: 0.42, h: 0.42 }, at: { story: { x: 0.18, y: 0.15, w: 0.64, h: 0.36 }, landscape: { x: 0.08, y: 0.14, w: 0.28, h: 0.72 } } },
      { kind: 'text', slot: 'headline', font: 'display', weight: 500, size: 0.09, minSize: 0.045, lineHeight: 1.04, maxLines: 2, align: 'center', color: '#f3ede2', box: { x: 0.1, y: 0.62, w: 0.8, h: 0.14 }, at: { story: { y: 0.55, h: 0.12 }, landscape: { x: 0.42, y: 0.29, w: 0.52, h: 0.27 } } },
      { kind: 'text', slot: 'subhead', font: 'display', weight: 500, italic: true, size: 0.036, lineHeight: 1.3, maxLines: 2, align: 'center', color: 'rgba(243,237,226,0.72)', box: { x: 0.14, y: 0.765, w: 0.72, h: 0.07 }, toggle: 'subhead', at: { story: { y: 0.68, h: 0.06 }, landscape: { x: 0.44, y: 0.58, w: 0.48, h: 0.13 } } },
      { kind: 'text', slot: 'price', font: 'display', weight: 700, size: 0.042, maxLines: 1, align: 'center', color: '#c8a96a', box: { x: 0.2, y: 0.84, w: 0.6, h: 0.05 }, when: ['price'], at: { story: { y: 0.76, h: 0.035 }, landscape: { x: 0.5, y: 0.73, w: 0.36, h: 0.09 } } },
      { kind: 'text', slot: 'website', font: 'body', weight: 500, upper: true, tracking: 0.3, size: 0.018, maxLines: 1, align: 'center', color: '#c8a96a', box: { x: 0.15, y: 0.905, w: 0.7, h: 0.03 }, toggle: 'contact', at: { story: { y: 0.92, h: 0.02 }, landscape: { x: 0.42, y: 0.84, w: 0.52, h: 0.05 } } },
      { kind: 'text', slot: 'company', font: 'body', weight: 600, upper: true, tracking: 0.3, size: 0.02, maxLines: 1, align: 'center', color: '#c8a96a', box: { x: 0.15, y: 0.905, w: 0.7, h: 0.03 }, unless: 'website', at: { story: { y: 0.92, h: 0.02 }, landscape: { x: 0.42, y: 0.84, w: 0.52, h: 0.05 } } },
    ],
  }),

  /* ── 14. Corporate insight — for LinkedIn ─────────────────────────────── */
  T({
    id: 'corporate-insight', sample: 'Ideas worth sharing', name: 'Insight', family: 'card', style: 'modern-corporate', fontPair: 'geometric',
    description: 'White, precise and calm: a brand bar, a technical grid, a small photo, a headline and your logo — made for LinkedIn.',
    categories: ['educational', 'quotes', 'announcements'], industries: ['professional', 'agency', 'any'],
    objectives: ['educate', 'trust', 'awareness'], formats: ['portrait', 'square', 'story', 'landscape', 'wide'],
    background: '#ffffff', needs: ['headline'], limits: { headline: 80, subhead: 120, eyebrow: 24 },
    photoTopics: ['office', 'workspace'], defaults: { eyebrow: 'Insight' },
    layers: [
      { kind: 'rect', fill: '$primary', box: { x: 0, y: 0, w: 0.022, h: 1 }, at: { landscape: { w: 0.014 } } },
      { kind: 'pattern', pattern: 'grid', color: '$primary/0.12', spacing: 0.045, box: { x: 0.58, y: 0, w: 0.42, h: 0.44 }, toggle: 'pattern', at: { story: { x: 0.5, w: 0.5, h: 0.3 }, landscape: { x: 0.62, w: 0.38, h: 0.6 } } },
      { kind: 'image', slot: 'photo', mask: 'rounded', radius: 0.02, box: { x: 0.62, y: 0.1, w: 0.3, h: 0.3 }, at: { story: { x: 0.08, y: 0.06, w: 0.84, h: 0.28 }, landscape: { x: 0.68, y: 0.12, w: 0.26, h: 0.5 } } },
      { kind: 'text', slot: 'eyebrow', font: 'body', weight: 700, upper: true, tracking: 0.16, size: 0.024, maxLines: 1, color: '$primary', box: { x: 0.08, y: 0.11, w: 0.48, h: 0.04 }, toggle: 'eyebrow', at: { story: { y: 0.39, w: 0.84, h: 0.025 }, landscape: { x: 0.05, y: 0.14, w: 0.5, h: 0.06 } } },
      { kind: 'text', slot: 'headline', font: 'display', weight: 700, size: 0.075, minSize: 0.04, lineHeight: 1.08, maxLines: 4, color: '$ink', box: { x: 0.08, y: 0.46, w: 0.84, h: 0.26 }, at: { story: { y: 0.43, h: 0.24 }, landscape: { x: 0.05, y: 0.23, w: 0.58, h: 0.38 } } },
      { kind: 'text', slot: 'subhead', font: 'body', weight: 400, size: 0.03, lineHeight: 1.45, maxLines: 3, color: '$muted', box: { x: 0.08, y: 0.73, w: 0.8, h: 0.11 }, toggle: 'subhead', at: { story: { y: 0.69, w: 0.84, h: 0.1 }, landscape: { x: 0.05, y: 0.64, w: 0.58, h: 0.15 } } },
      { kind: 'rect', fill: '#e5e7eb', box: { x: 0.08, y: 0.875, w: 0.84, h: 0.002 }, at: { landscape: { x: 0.05, y: 0.83, w: 0.9, h: 0.003 } } },
      { kind: 'image', slot: 'logo', fit: 'contain', box: { x: 0.08, y: 0.9, w: 0.22, h: 0.06 }, when: ['logo'], toggle: 'logo', at: { story: { y: 0.91, h: 0.04 }, landscape: { x: 0.05, y: 0.86, w: 0.16, h: 0.1 } } },
      { kind: 'text', slot: 'company', font: 'body', weight: 800, size: 0.026, maxLines: 1, color: '$ink', valign: 'middle', box: { x: 0.08, y: 0.9, w: 0.42, h: 0.06 }, unless: 'logo', toggle: 'logo', at: { story: { y: 0.91, h: 0.04 }, landscape: { x: 0.05, y: 0.86, w: 0.4, h: 0.1 } } },
      { kind: 'text', slot: 'website', font: 'body', weight: 600, size: 0.024, maxLines: 1, align: 'right', color: '$primary', valign: 'middle', box: { x: 0.5, y: 0.9, w: 0.42, h: 0.06 }, toggle: 'contact', at: { story: { y: 0.91, h: 0.04 }, landscape: { x: 0.55, y: 0.86, w: 0.4, h: 0.1 } } },
    ],
  }),

  /* ── 15. Magazine cover — your own portrait ──────────────────────────── */
  T({
    id: 'magazine-cover', sample: 'The story behind the work', name: 'Cover Story', family: 'full-bleed', style: 'image-led', fontPair: 'editorial', ownPhotos: true,
    description: 'Your own photo as a magazine cover: your name as the masthead, a cover line in italic serif and your handle.',
    categories: ['personal-brand', 'stories'], industries: ['personal-brand', 'agency', 'beauty', 'fitness', 'professional'],
    objectives: ['awareness', 'trust'], formats: ['portrait', 'story', 'square'],
    background: '$ink', needs: ['photo', 'headline'], limits: { headline: 52, subhead: 70, eyebrow: 28, handle: 24 },
    photoTopics: ['creator'], defaults: { eyebrow: 'In this issue' },
    layers: [
      { kind: 'image', slot: 'photo', box: { x: 0, y: 0, w: 1, h: 1 }, tint: { type: 'linear', angle: 180, stops: [['rgba(0,0,0,0.42)', 0], ['rgba(0,0,0,0)', 0.3], ['rgba(0,0,0,0)', 0.5], ['rgba(0,0,0,0.78)', 1]] } },
      { kind: 'text', slot: 'company', font: 'display', weight: 800, size: 0.17, minSize: 0.07, lineHeight: 1, maxLines: 1, align: 'center', tracking: -0.02, color: '#ffffff', box: { x: 0.04, y: 0.03, w: 0.92, h: 0.16 }, at: { story: { y: 0.04, h: 0.1 } } },
      { kind: 'text', slot: 'eyebrow', font: 'body', weight: 700, upper: true, tracking: 0.32, size: 0.02, maxLines: 1, align: 'center', color: '#ffffff', box: { x: 0.1, y: 0.2, w: 0.8, h: 0.03 }, toggle: 'eyebrow', at: { story: { y: 0.15, h: 0.02 } } },
      { kind: 'rect', fill: '$accent', box: { x: 0.06, y: 0.6, w: 0.1, h: 0.006 }, at: { story: { y: 0.66, h: 0.004 } } },
      { kind: 'text', slot: 'headline', font: 'display', weight: 600, italic: true, size: 0.09, minSize: 0.05, lineHeight: 1.05, maxLines: 3, color: '#ffffff', box: { x: 0.06, y: 0.62, w: 0.72, h: 0.22 }, at: { story: { y: 0.675, h: 0.16 } } },
      { kind: 'text', slot: 'subhead', font: 'body', weight: 500, size: 0.03, lineHeight: 1.35, maxLines: 2, color: 'rgba(255,255,255,0.86)', box: { x: 0.06, y: 0.85, w: 0.6, h: 0.08 }, toggle: 'subhead', at: { story: { y: 0.845, w: 0.8, h: 0.05 } } },
      { kind: 'text', slot: 'handle', font: 'body', weight: 700, size: 0.026, maxLines: 1, align: 'right', color: '#ffffff', box: { x: 0.6, y: 0.93, w: 0.34, h: 0.04 }, when: ['handle'], toggle: 'contact', at: { story: { y: 0.92, h: 0.03 } } },
    ],
  }),

  /* ── 16. Steps — a numbered how-to ────────────────────────────────────── */
  T({
    id: 'steps-guide', sample: 'How it works', name: 'Step by Step', family: 'type-led', style: 'colorful-creative', fontPair: 'friendly',
    description: 'A numbered how-to on a soft tint of your colour, with a blob for depth and your logo at the foot.',
    categories: ['educational'], industries: ['any', 'home-services', 'health', 'fitness', 'ecommerce', 'agency', 'personal-brand'],
    objectives: ['educate', 'trust'], formats: ['portrait', 'square', 'story', 'landscape', 'wide'],
    background: '$primaryLight', needs: ['headline', 'points'], limits: { headline: 56, point: 60, eyebrow: 16, cta: 18 },
    photoTopics: ['study'], defaults: { eyebrow: 'How to' },
    layers: [
      { kind: 'image', slot: 'photo', mask: 'blob', box: { x: 0.6, y: 0.56, w: 0.6, h: 0.6 }, opacity: 0.18, filter: 'grayscale', toggle: 'pattern', at: { story: { y: 0.66, h: 0.4 }, landscape: { x: 0.78, y: 0.3, w: 0.36, h: 0.9 } } },
      { kind: 'text', slot: 'eyebrow', font: 'body', weight: 800, upper: true, tracking: 0.1, size: 0.026, maxLines: 1, color: '$onPrimary', highlight: '$primary', box: { x: 0.08, y: 0.075, w: 0.6, h: 0.045 }, toggle: 'eyebrow', at: { story: { y: 0.08, h: 0.03 }, landscape: { x: 0.05, y: 0.1, w: 0.4, h: 0.07 } } },
      { kind: 'text', slot: 'headline', font: 'display', weight: 800, size: 0.08, minSize: 0.045, lineHeight: 1.06, maxLines: 3, color: '$ink', box: { x: 0.08, y: 0.14, w: 0.84, h: 0.23 }, at: { story: { y: 0.13, h: 0.2 }, landscape: { x: 0.05, y: 0.2, w: 0.4, h: 0.56 } } },
      { kind: 'list', slot: 'points', font: 'body', weight: 600, size: 0.036, color: '$ink', bullet: 'number', bulletColor: '$onPrimary', bulletFill: '$primary', maxItems: 4, lineHeight: 1.25, box: { x: 0.08, y: 0.4, w: 0.84, h: 0.42 }, at: { story: { y: 0.37, h: 0.42 }, landscape: { x: 0.5, y: 0.12, w: 0.45, h: 0.66 } } },
      { kind: 'image', slot: 'logo', fit: 'contain', box: { x: 0.08, y: 0.88, w: 0.22, h: 0.07 }, when: ['logo'], toggle: 'logo', at: { story: { y: 0.9, h: 0.045 }, landscape: { x: 0.05, y: 0.82, w: 0.16, h: 0.12 } } },
      { kind: 'text', slot: 'company', font: 'body', weight: 800, upper: true, tracking: 0.1, size: 0.026, maxLines: 1, color: '$ink', valign: 'middle', box: { x: 0.08, y: 0.88, w: 0.44, h: 0.07 }, unless: 'logo', toggle: 'logo', at: { story: { y: 0.9, h: 0.045 }, landscape: { x: 0.05, y: 0.82, w: 0.3, h: 0.12 } } },
      { kind: 'button', slot: 'cta', fill: '$ink', color: '#ffffff', font: 'body', weight: 700, size: 0.026, align: 'right', box: { x: 0.55, y: 0.88, w: 0.37, h: 0.07 }, toggle: 'cta', at: { story: { y: 0.9, h: 0.045 }, landscape: { x: 0.5, y: 0.82, w: 0.45, h: 0.12 } } },
    ],
  }),

  /* ── 17. Carousel guide — cover, slides, ask ─────────────────────────── */
  T({
    id: 'carousel-guide', sample: 'A quick guide', name: 'Swipe Guide', family: 'type-led', style: 'modern-corporate', fontPair: 'heavy',
    description: 'A multi-slide carousel: a bold cover, one numbered slide per point, and a closing slide with your ask and logo.',
    categories: ['carousel', 'educational'], industries: ['any', 'agency', 'professional', 'personal-brand', 'ecommerce', 'home-services', 'real-estate'],
    objectives: ['educate', 'trust', 'awareness'], formats: ['portrait', 'square'],
    background: '$primary', needs: ['headline'], limits: { headline: 54, subhead: 80, eyebrow: 20, slideTitle: 44, slideBody: 200, cta: 30 },
    photoTopics: ['abstract'], defaults: { eyebrow: 'Swipe to learn' },
    layers: [],
    pages: {
      cover: {
        background: '$primary',
        layers: [
          { kind: 'pattern', pattern: 'diagonal', color: 'rgba(255,255,255,0.06)', spacing: 0.05, box: { x: 0, y: 0, w: 1, h: 1 }, toggle: 'pattern' },
          { kind: 'ellipse', fill: '$accent', box: { x: 0.66, y: 0.06, w: 0.26, h: 0.26 } },
          ...logo(0.08, 0.07, 0.22, 0.07),
          { kind: 'text', slot: 'eyebrow', font: 'body', weight: 800, upper: true, tracking: 0.14, size: 0.028, maxLines: 1, color: '$ink', highlight: '$paper', box: { x: 0.09, y: 0.3, w: 0.7, h: 0.05 }, toggle: 'eyebrow' },
          { kind: 'text', slot: 'headline', font: 'display', size: 0.12, minSize: 0.06, lineHeight: 1.02, maxLines: 4, color: '$onPrimary', box: { x: 0.08, y: 0.37, w: 0.84, h: 0.36 } },
          { kind: 'text', slot: 'subhead', font: 'body', weight: 500, size: 0.034, lineHeight: 1.35, maxLines: 2, color: '$onPrimary', opacity: 0.88, box: { x: 0.08, y: 0.75, w: 0.75, h: 0.08 }, toggle: 'subhead' },
          { kind: 'text', text: 'Swipe', font: 'body', weight: 800, upper: true, tracking: 0.14, size: 0.028, maxLines: 1, color: '$onPrimary', valign: 'middle', box: { x: 0.08, y: 0.88, w: 0.3, h: 0.05 } },
          { kind: 'icon', name: 'arrow', color: '$onPrimary', weight: 2.6, box: { x: 0.25, y: 0.88, w: 0.06, h: 0.05 } },
        ],
      },
      slide: {
        background: '$paper',
        layers: [
          { kind: 'text', slot: 'slideNumber', font: 'display', size: 0.22, maxLines: 1, color: '$primary', box: { x: 0.07, y: 0.06, w: 0.5, h: 0.2 } },
          { kind: 'rect', fill: '$primary', box: { x: 0.08, y: 0.3, w: 0.1, h: 0.008 } },
          { kind: 'text', slot: 'slideTitle', font: 'display', size: 0.075, minSize: 0.045, lineHeight: 1.06, maxLines: 3, color: '$ink', box: { x: 0.08, y: 0.33, w: 0.84, h: 0.2 } },
          { kind: 'text', slot: 'slideBody', font: 'body', weight: 400, size: 0.037, minSize: 0.026, lineHeight: 1.5, maxLines: 8, color: '#374151', box: { x: 0.08, y: 0.55, w: 0.84, h: 0.3 } },
          { kind: 'text', slot: 'company', font: 'body', weight: 800, upper: true, tracking: 0.12, size: 0.022, maxLines: 1, color: '$muted', box: { x: 0.08, y: 0.91, w: 0.6, h: 0.04 } },
          { kind: 'icon', name: 'arrow', color: '$primary', weight: 2.6, box: { x: 0.85, y: 0.9, w: 0.07, h: 0.06 } },
        ],
      },
      end: {
        background: '$ink',
        layers: [
          { kind: 'pattern', pattern: 'dots', color: 'rgba(255,255,255,0.08)', spacing: 0.04, box: { x: 0, y: 0, w: 1, h: 1 }, toggle: 'pattern' },
          { kind: 'text', slot: 'cta', font: 'display', size: 0.1, minSize: 0.05, lineHeight: 1.04, maxLines: 3, align: 'center', color: '#ffffff', box: { x: 0.08, y: 0.3, w: 0.84, h: 0.25 } },
          { kind: 'rect', fill: '$accent', box: { x: 0.45, y: 0.58, w: 0.1, h: 0.008 } },
          { kind: 'image', slot: 'logo', fit: 'contain', box: { x: 0.3, y: 0.63, w: 0.4, h: 0.1 }, when: ['logo'], toggle: 'logo' },
          { kind: 'text', slot: 'company', font: 'body', weight: 800, upper: true, tracking: 0.14, size: 0.032, maxLines: 1, align: 'center', color: '#ffffff', box: { x: 0.1, y: 0.65, w: 0.8, h: 0.06 }, unless: 'logo' },
          { kind: 'text', slot: 'website', font: 'body', weight: 600, size: 0.028, maxLines: 1, align: 'center', color: '$accent', box: { x: 0.1, y: 0.78, w: 0.8, h: 0.05 }, toggle: 'contact' },
        ],
      },
    },
  }),

  /* ── 18. Story promo — built for 9:16 ─────────────────────────────────── */
  T({
    id: 'story-promo', sample: 'Don’t miss this', name: 'Story Takeover', family: 'full-bleed', style: 'image-led', fontPair: 'impact',
    description: 'Made for Stories and Reels: a full-height photo, a white tag, a towering headline and a full-width button in reach of the thumb.',
    categories: ['stories', 'promotions'], industries: ['any', 'ecommerce', 'food', 'fitness', 'beauty', 'real-estate'],
    objectives: ['sell', 'awareness', 'bookings', 'launch'], formats: ['story', 'portrait', 'square'],
    background: '$ink', needs: ['headline'], limits: { headline: 36, subhead: 70, eyebrow: 20, cta: 22 },
    photoTopics: ['shopping', 'celebration'],
    layers: [
      { kind: 'image', slot: 'photo', box: { x: 0, y: 0, w: 1, h: 1 }, tint: { type: 'linear', angle: 180, stops: [['rgba(0,0,0,0.45)', 0], ['rgba(0,0,0,0)', 0.22], ['rgba(0,0,0,0.15)', 0.5], ['rgba(0,0,0,0.85)', 1]] } },
      ...logo(0.06, 0.045, 0.24, 0.06, { at: { story: { h: 0.04 } } }),
      { kind: 'badge', slot: 'eyebrow', shape: 'pill', fill: '#ffffff', color: '$ink', font: 'body', weight: 800, size: 0.03, upper: true, box: { x: 0.06, y: 0.36, w: 0.42, h: 0.055 }, toggle: 'eyebrow', at: { story: { y: 0.4, h: 0.035 } } },
      { kind: 'text', slot: 'headline', font: 'display', upper: true, size: 0.17, minSize: 0.08, lineHeight: 0.94, maxLines: 4, color: '#ffffff', box: { x: 0.06, y: 0.43, w: 0.88, h: 0.28 }, at: { story: { y: 0.45, h: 0.24 } } },
      { kind: 'text', slot: 'subhead', font: 'body', weight: 500, size: 0.036, lineHeight: 1.35, maxLines: 2, color: 'rgba(255,255,255,0.88)', box: { x: 0.06, y: 0.72, w: 0.82, h: 0.09 }, toggle: 'subhead', at: { story: { y: 0.7, h: 0.06 } } },
      { kind: 'button', slot: 'cta', fill: '$accent', color: '$onAccent', font: 'body', weight: 800, size: 0.034, upper: true, tracking: 0.05, arrow: true, align: 'center', box: { x: 0.06, y: 0.84, w: 0.88, h: 0.09 }, toggle: 'cta', at: { story: { y: 0.84, h: 0.062 } } },
    ],
  }),

  /* ── 19. Collection drop — three of your products ─────────────────────── */
  T({
    id: 'collection-drop', sample: 'The new collection', name: 'Collection Drop', family: 'collage', style: 'minimal-editorial', fontPair: 'classic', ownPhotos: true,
    description: 'A grid of three of your own product photos, a serif headline and a shop button — for catalogues and new ranges.',
    categories: ['ecommerce', 'product'], industries: ['ecommerce', 'beauty', 'food'],
    objectives: ['sell', 'launch'], formats: ['portrait', 'square', 'story', 'landscape', 'wide'],
    background: '$paper', needs: ['photo', 'headline'], limits: { headline: 40, eyebrow: 22, cta: 16 },
    photoTopics: ['product', 'fashion'], defaults: { eyebrow: 'New collection' },
    layers: [
      { kind: 'image', slot: 'photo', mask: 'rounded', radius: 0.018, box: { x: 0.06, y: 0.055, w: 0.56, h: 0.63 }, at: { story: { w: 0.88, h: 0.44, y: 0.04 }, landscape: { x: 0.035, y: 0.08, w: 0.34, h: 0.84 } } },
      { kind: 'image', slot: 'photo2', mask: 'rounded', radius: 0.018, box: { x: 0.645, y: 0.055, w: 0.295, h: 0.305 }, at: { story: { x: 0.06, y: 0.5, w: 0.43, h: 0.2 }, landscape: { x: 0.395, y: 0.08, w: 0.2, h: 0.405 } } },
      { kind: 'image', slot: 'product', mask: 'rounded', radius: 0.018, box: { x: 0.645, y: 0.38, w: 0.295, h: 0.305 }, at: { story: { x: 0.51, y: 0.5, w: 0.43, h: 0.2 }, landscape: { x: 0.395, y: 0.515, w: 0.2, h: 0.405 } } },
      { kind: 'text', slot: 'eyebrow', font: 'body', weight: 800, upper: true, tracking: 0.2, size: 0.024, maxLines: 1, color: '$primary', box: { x: 0.06, y: 0.72, w: 0.6, h: 0.04 }, toggle: 'eyebrow', at: { story: { y: 0.73, h: 0.025 }, landscape: { x: 0.63, y: 0.22, w: 0.33, h: 0.06 } } },
      { kind: 'text', slot: 'headline', font: 'display', size: 0.085, minSize: 0.045, lineHeight: 1.04, maxLines: 2, color: '$ink', box: { x: 0.06, y: 0.76, w: 0.58, h: 0.15 }, at: { story: { y: 0.76, w: 0.88, h: 0.1 }, landscape: { x: 0.63, y: 0.3, w: 0.33, h: 0.32 } } },
      { kind: 'button', slot: 'cta', fill: '$ink', color: '#ffffff', font: 'body', weight: 700, size: 0.026, align: 'right', arrow: true, radius: 0.004, box: { x: 0.66, y: 0.8, w: 0.28, h: 0.08 }, toggle: 'cta', at: { story: { x: 0.06, y: 0.885, w: 0.88, h: 0.05 }, landscape: { x: 0.63, y: 0.68, w: 0.25, h: 0.12 } } },
      { kind: 'text', slot: 'website', font: 'body', weight: 500, size: 0.024, maxLines: 1, color: '$muted', box: { x: 0.06, y: 0.92, w: 0.58, h: 0.04 }, toggle: 'contact', at: { story: { y: 0.95, h: 0.025 }, landscape: { x: 0.63, y: 0.84, w: 0.33, h: 0.07 } } },
    ],
  }),

  /* ── 20. Holiday greeting — warm wishes, no sales pitch ──────────────── */
  T({
    id: 'holiday-greeting', name: 'Season’s Greetings', family: 'framed', style: 'warm-friendly', fontPair: 'classic',
    description: 'A seasonal photo inside a thin white frame, the occasion in a large italic serif, a short message and your logo.',
    categories: ['seasonal'], industries: ['any'],
    objectives: ['awareness', 'trust'], formats: ['portrait', 'square', 'story', 'landscape', 'wide'],
    background: '#1f2a24', needs: ['occasion'], limits: { occasion: 28, headline: 70 },
    photoTopics: ['winter'], defaults: { occasion: 'Season’s greetings' },
    layers: [
      { kind: 'image', slot: 'photo', filter: 'dim', box: { x: 0, y: 0, w: 1, h: 1 }, tint: { type: 'radial', cx: 0.5, cy: 0.5, r: 0.75, stops: [['rgba(0,0,0,0.15)', 0], ['rgba(0,0,0,0.6)', 1]] } },
      { kind: 'rect', fill: 'rgba(0,0,0,0)', stroke: { color: 'rgba(255,255,255,0.85)', width: 0.003 }, box: { x: 0.05, y: 0.04, w: 0.9, h: 0.92 }, toggle: 'frame', at: { landscape: { x: 0.03, y: 0.06, w: 0.94, h: 0.88 } } },
      { kind: 'text', slot: 'occasion', font: 'display', italic: true, size: 0.14, minSize: 0.07, lineHeight: 1.02, maxLines: 2, align: 'center', valign: 'bottom', color: '#ffffff', shadow: { color: 'rgba(0,0,0,0.35)', blur: 0.02, y: 0.004 }, box: { x: 0.1, y: 0.28, w: 0.8, h: 0.28 }, at: { story: { y: 0.3, h: 0.2 }, landscape: { x: 0.1, y: 0.16, w: 0.8, h: 0.4 } } },
      { kind: 'rect', fill: '#ffffff', box: { x: 0.46, y: 0.59, w: 0.08, h: 0.003 }, at: { story: { y: 0.525, h: 0.002 }, landscape: { x: 0.47, y: 0.6, w: 0.06, h: 0.005 } } },
      { kind: 'text', slot: 'headline', font: 'body', weight: 500, size: 0.034, lineHeight: 1.4, maxLines: 3, align: 'center', color: 'rgba(255,255,255,0.92)', box: { x: 0.15, y: 0.62, w: 0.7, h: 0.12 }, at: { story: { y: 0.55, h: 0.08 }, landscape: { x: 0.2, y: 0.64, w: 0.6, h: 0.14 } } },
      { kind: 'image', slot: 'logo', fit: 'contain', box: { x: 0.38, y: 0.77, w: 0.24, h: 0.08 }, when: ['logo'], toggle: 'logo', at: { story: { y: 0.8, h: 0.045 }, landscape: { x: 0.42, y: 0.8, w: 0.16, h: 0.1 } } },
      { kind: 'text', text: 'From all of us at {company}', font: 'body', weight: 700, upper: true, tracking: 0.22, size: 0.022, maxLines: 1, align: 'center', color: '#ffffff', box: { x: 0.1, y: 0.87, w: 0.8, h: 0.04 }, at: { story: { y: 0.87, h: 0.025 }, landscape: { x: 0.1, y: 0.9, w: 0.8, h: 0.05 } } },
    ],
  }),

  /* ── 21. Flash offer — the number is the design ──────────────────────── */
  T({
    id: 'flash-offer', sample: 'Treat yourself', name: 'Big Offer', family: 'poster', style: 'bold-promotional', fontPair: 'impact',
    description: 'Your offer, enormous, under a tilted band on a striped brand background. Only for an offer you have actually set.',
    categories: ['promotions', 'ecommerce', 'seasonal'], industries: ['ecommerce', 'food', 'fitness', 'beauty', 'home-services', 'hvac', 'any'],
    objectives: ['sell'], formats: ['portrait', 'square', 'story', 'landscape', 'wide'],
    background: { type: 'linear', angle: 135, stops: [['$primary', 0], ['$primaryDark', 1]] }, needs: ['offer'], limits: { offer: 14, headline: 40, date: 30, eyebrow: 20, cta: 16 },
    photoTopics: ['abstract'], defaults: { eyebrow: 'Special offer' },
    layers: [
      { kind: 'pattern', pattern: 'diagonal', color: 'rgba(255,255,255,0.07)', spacing: 0.06, box: { x: 0, y: 0, w: 1, h: 1 }, toggle: 'pattern' },
      { kind: 'rect', fill: '$ink', rotate: -6, box: { x: -0.1, y: 0.1, w: 1.2, h: 0.12 }, at: { story: { y: 0.16, h: 0.08 }, landscape: { y: 0.04, h: 0.18 } } },
      { kind: 'text', slot: 'eyebrow', font: 'display', upper: true, tracking: 0.12, size: 0.065, maxLines: 1, align: 'center', valign: 'middle', color: '$accent', rotate: -6, box: { x: 0.02, y: 0.115, w: 0.96, h: 0.09 }, toggle: 'eyebrow', at: { story: { y: 0.17, h: 0.06 }, landscape: { y: 0.06, h: 0.14 } } },
      { kind: 'text', slot: 'offer', font: 'display', upper: true, size: 0.3, minSize: 0.12, lineHeight: 0.9, maxLines: 2, align: 'center', valign: 'middle', color: '$onPrimary', shadow: { color: 'rgba(0,0,0,0.25)', blur: 0.03, y: 0.01 }, box: { x: 0.06, y: 0.27, w: 0.88, h: 0.34 }, at: { story: { y: 0.3, h: 0.24 }, landscape: { x: 0.04, y: 0.28, w: 0.52, h: 0.56, align: 'left' } } },
      { kind: 'text', slot: 'headline', font: 'body', weight: 800, upper: true, tracking: 0.05, size: 0.045, lineHeight: 1.15, maxLines: 2, align: 'center', color: '$onPrimary', box: { x: 0.1, y: 0.63, w: 0.8, h: 0.1 }, at: { story: { y: 0.56, h: 0.07 }, landscape: { x: 0.6, y: 0.3, w: 0.36, h: 0.2, align: 'left' } } },
      { kind: 'text', slot: 'date', font: 'body', weight: 600, size: 0.03, maxLines: 1, align: 'center', color: '$onPrimary', opacity: 0.85, box: { x: 0.1, y: 0.735, w: 0.8, h: 0.05 }, at: { story: { y: 0.635, h: 0.035 }, landscape: { x: 0.6, y: 0.51, w: 0.36, h: 0.08, align: 'left' } } },
      { kind: 'button', slot: 'cta', fill: '$ink', color: '#ffffff', font: 'body', weight: 800, size: 0.032, upper: true, tracking: 0.06, arrow: true, align: 'center', box: { x: 0.2, y: 0.8, w: 0.6, h: 0.085 }, toggle: 'cta', at: { story: { x: 0.1, y: 0.76, w: 0.8, h: 0.06 }, landscape: { x: 0.6, y: 0.64, w: 0.3, h: 0.14, align: 'left' } } },
      ...logo(0.38, 0.91, 0.24, 0.06, { at: { story: { x: 0.33, y: 0.9, w: 0.34, h: 0.04 }, landscape: { x: 0.6, y: 0.84, w: 0.2, h: 0.1 } } }),
    ],
  }),

  /* ── 22. Creator intro — your face in a circle ───────────────────────── */
  T({
    id: 'creator-intro', sample: 'Nice to meet you', name: 'Meet the Creator', family: 'card', style: 'warm-friendly', fontPair: 'friendly', ownPhotos: true,
    description: 'Your own photo in a ring on a soft blob of your colour, a friendly intro and your handle — for personal brands and coaches.',
    categories: ['personal-brand', 'announcements'], industries: ['personal-brand', 'professional', 'fitness', 'beauty', 'agency'],
    objectives: ['awareness', 'trust'], formats: ['portrait', 'square', 'story', 'landscape', 'wide'],
    background: '$paper', needs: ['avatar', 'headline'], limits: { headline: 60, subhead: 90, handle: 24, eyebrow: 20 },
    photoTopics: ['creator'], defaults: { eyebrow: 'Hello' },
    layers: [
      { kind: 'ellipse', fill: '$primarySoft', box: { x: 0.18, y: 0.04, w: 0.64, h: 0.64 }, at: { story: { x: 0.12, y: 0.06, w: 0.76, h: 0.44 }, landscape: { x: 0.02, y: 0.06, w: 0.38, h: 0.88 } } },
      { kind: 'ellipse', fill: '$accent', box: { x: 0.68, y: 0.08, w: 0.08, h: 0.08 }, at: { story: { y: 0.1, h: 0.05 }, landscape: { x: 0.34, y: 0.12, w: 0.05, h: 0.1 } } },
      { kind: 'image', slot: 'avatar', mask: 'circle', stroke: { color: '#ffffff', width: 0.012 }, box: { x: 0.26, y: 0.1, w: 0.48, h: 0.48 }, at: { story: { x: 0.2, y: 0.1, w: 0.6, h: 0.34 }, landscape: { x: 0.07, y: 0.13, w: 0.28, h: 0.74 } } },
      { kind: 'text', slot: 'eyebrow', font: 'body', weight: 800, upper: true, tracking: 0.16, size: 0.026, maxLines: 1, align: 'center', color: '$primary', box: { x: 0.1, y: 0.62, w: 0.8, h: 0.04 }, toggle: 'eyebrow', at: { story: { y: 0.54, h: 0.025 }, landscape: { x: 0.45, y: 0.18, w: 0.5, h: 0.07, align: 'left' } } },
      { kind: 'text', slot: 'headline', font: 'display', weight: 800, size: 0.072, minSize: 0.04, lineHeight: 1.08, maxLines: 3, align: 'center', color: '$ink', box: { x: 0.08, y: 0.665, w: 0.84, h: 0.15 }, at: { story: { y: 0.575, h: 0.14 }, landscape: { x: 0.45, y: 0.26, w: 0.5, h: 0.32, align: 'left' } } },
      { kind: 'text', slot: 'subhead', font: 'body', weight: 400, size: 0.03, lineHeight: 1.4, maxLines: 2, align: 'center', color: '$muted', box: { x: 0.12, y: 0.82, w: 0.76, h: 0.08 }, toggle: 'subhead', at: { story: { y: 0.73, h: 0.07 }, landscape: { x: 0.45, y: 0.6, w: 0.5, h: 0.14, align: 'left' } } },
      { kind: 'text', slot: 'handle', font: 'body', weight: 800, size: 0.03, maxLines: 1, align: 'center', color: '$primary', box: { x: 0.1, y: 0.91, w: 0.8, h: 0.05 }, toggle: 'contact', at: { story: { y: 0.85, h: 0.035 }, landscape: { x: 0.45, y: 0.8, w: 0.5, h: 0.1, align: 'left' } } },
    ],
  }),
];

export const templateOf = (id: string): TemplateSpec => TEMPLATES.find(t => t.id === id) ?? TEMPLATES[0];
