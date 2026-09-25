/**
 * The layouts the wizard offers, drawn.
 *
 * The client's `src/services/designOptions.ts` is the catalogue a customer
 * picks from and resolves a theme to colours; this file is what those picks
 * turn into — a post's elements, a page's blocks, an email's frame, an
 * article's shape. The ids below must cover every id the catalogue offers, and
 * `npm run test:design` fails if they do not: a layout the customer chose that
 * silently came out as the default would be exactly the "plausible success with
 * nothing behind it" this codebase refuses.
 *
 * Everything that arrives here came from a workflow's config or a project's
 * brief, which a customer can edit by hand, so every colour and id is checked
 * and anything unrecognised falls back to the default rather than being written
 * into a design.
 */

export const SOCIAL_LAYOUTS = ['bold', 'offer', 'split', 'diagonal', 'minimal', 'quote', 'framed'] as const;
export const PAGE_LAYOUTS = ['hero-form', 'services', 'long-sales', 'minimal'] as const;
export const EMAIL_LAYOUTS = ['plain', 'branded', 'newsletter', 'promo'] as const;
export const BLOG_FORMATS = ['guide', 'listicle', 'story', 'qa', 'news'] as const;
export const FONTS = ['Inter', 'Georgia', 'Impact'] as const;

const pick = <T extends readonly string[]>(list: T, v: unknown, fallback: T[number]): T[number] =>
  (list as readonly string[]).includes(String(v ?? '')) ? String(v) as T[number] : fallback;

export function hex(raw: unknown, fallback: string): string {
  const m = String(raw ?? '').trim().match(/^#?([0-9a-f]{3}|[0-9a-f]{6})$/i);
  if (!m) return fallback;
  const h = m[1].length === 3 ? m[1].split('').map(c => c + c).join('') : m[1];
  return `#${h.toLowerCase()}`;
}

function luminance(color: string): number {
  const h = hex(color, '#000000').slice(1);
  const ch = [0, 2, 4].map(i => parseInt(h.slice(i, i + 2), 16) / 255)
    .map(c => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4));
  return 0.2126 * ch[0] + 0.7152 * ch[1] + 0.0722 * ch[2];
}

/** Near-black or white, whichever reads on this colour. */
export function inkOn(color: string): string {
  const l = luminance(color);
  return (1.05 / (l + 0.05)) >= ((l + 0.05) / 0.0625) ? '#ffffff' : '#111827';
}

export interface Palette {
  bg: string;
  bg2: string;
  ink: string;
  accent: string;
  font: typeof FONTS[number];
}

/**
 * Colours from a config, each checked.
 *
 * `brandColor` is how a node written before the design step said its colour,
 * so a project made last month keeps drawing exactly what it drew.
 */
export function paletteOf(c: (k: string) => string, brandColor = '#5b7cfa'): Palette {
  const bg = hex(c('bg'), hex(c('brandColor'), brandColor));
  const bg2 = hex(c('bg2'), '#17191c');
  return {
    bg,
    bg2,
    ink: hex(c('ink'), '#ffffff'),
    accent: hex(c('accent'), '#c7f441'),
    font: pick(FONTS, c('font'), 'Inter'),
  };
}

/* ── Social posts ─────────────────────────────────────────────────────────── */

export interface PostText {
  headline: string;
  company: string;
  /** A real offer from the profile ("20% off"), or empty — never invented. */
  badge?: string;
  /** Two or three words for the button, or empty. */
  cta?: string;
}

interface Drawn {
  background: Record<string, unknown>;
  elements: Record<string, unknown>[];
}

/**
 * A post's background and elements for one layout.
 *
 * Common to every layout, because these are the mistakes people make by hand:
 * everything stays inside a 6–7% margin (platform crops and rounded corners
 * eat the edge), the logo is small and in a corner and never competes with the
 * headline, and there is one headline — the caption carries the rest.
 */
export function drawSocial(
  layoutRaw: string, W: number, H: number, p: Palette, t: PostText, logoSrc: string, idBase: string,
): Drawn {
  const layout = pick(SOCIAL_LAYOUTS, layoutRaw, 'bold');
  const square = W === H;
  const m = Math.round(Math.min(W, H) * 0.07);
  const short = Math.min(W, H);
  let z = 0;
  const els: Record<string, unknown>[] = [];
  const el = (x: number, y: number, w: number, h: number, data: Record<string, unknown>, rotation = 0) => {
    els.push({
      id: `ael-${idBase}-${z}`, type: data.kind, x: Math.round(x), y: Math.round(y), width: Math.round(w), height: Math.round(h),
      rotation, zIndex: ++z, locked: false, visible: true, data,
    });
  };
  const text = (x: number, y: number, w: number, h: number, s: string, o: Record<string, unknown>) => el(x, y, w, h, {
    kind: 'text', text: s, fontSize: 40, fontFamily: p.font, color: p.ink, fontWeight: '700', fontStyle: 'normal',
    textAlign: 'left', lineHeight: 1.1, letterSpacing: 0, textDecoration: 'none', ...o,
  });
  const shape = (x: number, y: number, w: number, h: number, shapeType: string, fill: string, extra: Record<string, unknown> = {}, rotation = 0) =>
    el(x, y, w, h, { kind: 'shape', shapeType, fill, stroke: 'transparent', strokeWidth: 0, opacity: 1, ...extra }, rotation);
  const logoBox = Math.round(short * 0.13);
  const logo = (x: number, y: number, size = logoBox) => {
    if (!logoSrc) return false;
    el(x, y, size, size, { kind: 'image', src: logoSrc, objectFit: 'contain', opacity: 1, borderRadius: 0 });
    return true;
  };
  const gradient = { type: 'gradient', color: p.bg, gradientStart: p.bg, gradientEnd: p.bg2, gradientAngle: 135, imageFit: 'cover' };
  const flat = (color: string) => ({ type: 'color', color, gradientStart: color, gradientEnd: color, gradientAngle: 0, imageFit: 'cover' });
  const headSize = square ? 88 : 72;
  const display = p.font === 'Impact';

  if (layout === 'offer') {
    text(m, H * 0.12, W * (t.badge ? 0.56 : 0.86), H * 0.42, t.headline, { fontSize: square ? 80 : 64, fontWeight: '800', effect: 'shadow', uppercase: display });
    if (t.badge) {
      const d = short * 0.34;
      shape(W - m - d, H * 0.40, d, d, 'circle', p.accent);
      text(W - m - d, H * 0.40 + d * 0.30, d, d * 0.44, t.badge, { fontSize: Math.round(d * 0.19), color: inkOn(p.accent), fontWeight: '900', textAlign: 'center', lineHeight: 1 });
    }
    if (t.cta) {
      shape(m, H * 0.72, W * 0.36, H * 0.095, 'rounded-rect', p.accent);
      text(m, H * 0.72 + H * 0.022, W * 0.36, H * 0.06, `${t.cta} →`, { fontSize: square ? 34 : 28, color: inkOn(p.accent), fontWeight: '800', textAlign: 'center' });
    }
    logo(W - m - logoBox, m);
    text(m, H * 0.87, W - 2 * m, H * 0.07, t.company, { fontSize: square ? 28 : 22, fontWeight: '600', uppercase: true, letterSpacing: 1 });
    return { background: gradient, elements: els };
  }

  if (layout === 'split') {
    const half = W * (square ? 0.56 : 0.58);
    shape(0, 0, half, H, 'rect', p.bg);
    const ink = inkOn(p.bg);
    shape(m, m, 90, 10, 'rounded-rect', p.accent);
    text(m, H * 0.2, half - 2 * m, H * 0.56, t.headline, { fontSize: square ? 70 : 56, fontWeight: '800', color: ink, uppercase: display });
    text(m, H * 0.84, half - 2 * m, H * 0.08, t.company, { fontSize: square ? 26 : 22, fontWeight: '600', color: ink, uppercase: true, letterSpacing: 1 });
    const right = W - half;
    if (!logo(half + (right - short * 0.3) / 2, (H - short * 0.3) / 2, short * 0.3)) {
      text(half + m * 0.6, H * 0.4, right - m * 1.2, H * 0.2, t.company, { fontSize: square ? 46 : 38, fontWeight: '800', color: inkOn(p.bg2), textAlign: 'center' });
    }
    return { background: flat(p.bg2), elements: els };
  }

  if (layout === 'diagonal') {
    shape(-W * 0.2, H * 0.62, W * 1.4, H * 0.16, 'rect', p.accent, {}, -14);
    shape(-W * 0.2, H * 0.80, W * 1.4, H * 0.10, 'rect', p.bg2, { opacity: 0.85 }, -14);
    text(m, H * 0.14, W * 0.84, H * 0.44, t.headline, { fontSize: square ? 92 : 74, fontWeight: '900', uppercase: true, letterSpacing: display ? 2 : -1, effect: 'shadow' });
    logo(W - m - logoBox, m);
    text(m, H - m - H * 0.07, W * 0.6, H * 0.06, t.company, { fontSize: square ? 26 : 22, fontWeight: '700', uppercase: true, letterSpacing: 2, color: inkOn(p.bg2) });
    return { background: flat(p.bg), elements: els };
  }

  if (layout === 'minimal') {
    const ink = inkOn(p.bg);
    text(m * 1.4, H * 0.12, W - 2.8 * m, H * 0.06, t.company, { fontSize: square ? 24 : 20, fontWeight: '600', color: ink, uppercase: true, letterSpacing: 4, textAlign: 'center' });
    text(m * 1.4, H * 0.30, W - 2.8 * m, H * 0.38, t.headline, { fontSize: square ? 72 : 58, fontWeight: '500', color: ink, textAlign: 'center', lineHeight: 1.15, fontFamily: p.font === 'Impact' ? 'Georgia' : p.font });
    shape((W - 120) / 2, H * 0.72, 120, 3, 'rect', p.accent);
    logo((W - logoBox * 0.8) / 2, H * 0.80, logoBox * 0.8);
    return { background: flat(p.bg), elements: els };
  }

  if (layout === 'quote') {
    text(m, H * 0.02, W * 0.4, H * 0.3, '“', { fontSize: Math.round(short * 0.32), color: p.accent, fontWeight: '900', fontFamily: 'Georgia', lineHeight: 1 });
    text(m, H * 0.28, W - 2 * m, H * 0.42, t.headline, { fontSize: square ? 68 : 54, fontWeight: '700', fontStyle: 'italic', lineHeight: 1.2, fontFamily: p.font === 'Impact' ? 'Georgia' : p.font });
    shape(m, H * 0.80, 60, 4, 'rect', p.accent);
    text(m + 80, H * 0.775, W * 0.6, H * 0.06, t.company, { fontSize: square ? 28 : 22, fontWeight: '600', uppercase: true, letterSpacing: 1 });
    logo(W - m - logoBox, H - m - logoBox);
    return { background: gradient, elements: els };
  }

  if (layout === 'framed') {
    const inset = m * 0.7;
    shape(inset, inset, W - 2 * inset, H - 2 * inset, 'rect', 'transparent', { stroke: p.accent, strokeWidth: 6 });
    const top = logo((W - logoBox) / 2, H * 0.12) ? H * 0.32 : H * 0.24;
    text(m * 1.6, top, W - 3.2 * m, H * 0.38, t.headline, { fontSize: square ? 72 : 56, fontWeight: '800', textAlign: 'center', uppercase: display });
    text(m * 1.6, H * 0.78, W - 3.2 * m, H * 0.07, t.company, { fontSize: square ? 28 : 22, fontWeight: '600', textAlign: 'center', uppercase: true, letterSpacing: 3, color: p.accent });
    return { background: gradient, elements: els };
  }

  /* bold — and what every post looked like before layouts existed. */
  shape(m, H * 0.10, 110, 12, 'rounded-rect', p.accent);
  text(m, H * 0.22, W - 2 * m, H * 0.40, t.headline, {
    fontSize: headSize, fontWeight: '800', lineHeight: 1.08, letterSpacing: display ? 1 : -1, effect: 'shadow', uppercase: display,
  });
  text(m, H * 0.78, W - 2 * m - (logoSrc ? logoBox + 20 : 0), H * 0.10, t.company, {
    fontSize: square ? 34 : 28, color: p.accent, fontWeight: '600', lineHeight: 1.2, letterSpacing: 1, uppercase: true,
  });
  logo(W - m - logoBox, H - m - logoBox);
  return { background: gradient, elements: els };
}

/* ── Articles ─────────────────────────────────────────────────────────────── */

/** What the writer is told for each article shape. */
export function blogFormatRule(raw: string): string {
  switch (pick(BLOG_FORMATS, raw, 'guide')) {
    case 'listicle': return 'Shape: a list article. A title with a number in it ("7 ways to…"), a two-sentence opening, then one subheading per item, each with two or three sentences.';
    case 'story': return 'Shape: a short case study. The problem a customer had, what was done, and how it turned out — only facts from the brand block; if there is no real example, write it as "a typical job" and say so.';
    case 'qa': return 'Shape: questions and answers. Five or six questions customers really ask, each as a subheading phrased as the question, each answered in plain words.';
    case 'news': return 'Shape: news and opinion. What changed or is happening, then what it means for this business\'s customers and what they should do.';
    default: return 'Shape: a how-to guide. A short opening, then numbered steps somebody can follow, each with a subheading.';
  }
}

/* ── Emails ───────────────────────────────────────────────────────────────── */

const esc = (s: string) => s.replace(/[&<>"]/g, ch => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[ch] as string));

/**
 * An email body inside the chosen frame.
 *
 * Tables and inline styles, because that is what Outlook renders; no web
 * fonts, no background images, nothing that needs CSS a mail client strips.
 * The first link in the body becomes the button in the branded layouts, so the
 * one thing the email asks for is the thing that stands out. `plain` returns
 * the body untouched — it is the default because plain email is what arrives.
 */
export function wrapEmail(
  bodyHtml: string, cfg: (k: string) => string, brand: { company: string; logoSrc: string },
): string {
  const layout = pick(EMAIL_LAYOUTS, cfg('emailLayout'), 'plain');
  if (layout === 'plain') return bodyHtml;
  const accent = hex(cfg('emailAccent'), '#2563eb');
  const band = hex(cfg('emailBg'), accent);
  const bandInk = inkOn(band);
  const btnInk = inkOn(accent);
  const company = esc(brand.company || '');
  const mark = brand.logoSrc
    ? `<img src="${esc(brand.logoSrc)}" alt="${company}" height="44" style="display:block;height:44px;width:auto;max-width:200px;border:0">`
    : `<span style="font:700 20px Arial,Helvetica,sans-serif;color:${layout === 'branded' ? '#111827' : bandInk}">${company}</span>`;

  /* The first link, promoted to a button. Left in place in the text too — a
     client that drops the table still has the link. */
  const first = bodyHtml.match(/<a\s[^>]*href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/i);
  const button = first
    ? `<tr><td style="padding:8px 32px 28px"><a href="${first[1]}" style="display:inline-block;background:${accent};color:${btnInk};font:700 15px Arial,Helvetica,sans-serif;text-decoration:none;padding:13px 26px;border-radius:8px">${first[2].replace(/<[^>]+>/g, '').slice(0, 60) || 'Find out more'}</a></td></tr>`
    : '';

  const header = layout === 'branded'
    ? `<tr><td style="padding:24px 32px 8px;border-bottom:3px solid ${accent}">${mark}</td></tr>`
    : layout === 'newsletter'
      ? `<tr><td style="background:${band};padding:22px 32px">${mark}</td></tr>`
      : `<tr><td style="background:${band};padding:30px 32px 26px">${mark}</td></tr>`;

  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f4f5f7;padding:24px 0">
<tr><td align="center">
<table role="presentation" width="600" cellpadding="0" cellspacing="0" style="max-width:600px;width:100%;background:#ffffff;border-radius:10px;overflow:hidden">
${header}
<tr><td style="padding:${layout === 'newsletter' ? '28px 32px 8px' : '24px 32px 8px'};font:15px/1.6 Arial,Helvetica,sans-serif;color:#1f2937">${bodyHtml}</td></tr>
${button}
<tr><td style="padding:16px 32px 22px;border-top:1px solid #eef0f3;font:12px/1.5 Arial,Helvetica,sans-serif;color:#6b7280">${company}</td></tr>
</table>
</td></tr>
</table>`;
}

/* ── Pages ────────────────────────────────────────────────────────────────── */

export interface PageDesign {
  layout: typeof PAGE_LAYOUTS[number];
  palette: Palette;
  logo: boolean;
}

/** A project's page design from its stored brief, or null for "as before". */
export function pageDesignOf(stored: string | null | undefined): PageDesign | null {
  if (!stored) return null;
  try {
    const b = JSON.parse(stored) as { design?: { page?: Record<string, unknown> | null } };
    const d = b?.design?.page;
    if (!d || typeof d !== 'object') return null;
    const c = (k: string) => String((d as Record<string, unknown>)[k] ?? '');
    return { layout: pick(PAGE_LAYOUTS, c('layout'), 'services'), palette: paletteOf(c), logo: c('logo') !== 'off' };
  } catch {
    return null;
  }
}

export interface PageCopy {
  headline: string;
  subhead: string;
  bullets: string[];
  cta: string;
  sections: { heading: string; body: string }[];
}

/**
 * A page's blocks for one layout.
 *
 * The order is the layout — the same blocks, in the order each kind of page
 * is read. Lead capture puts the form under the headline because every scroll
 * between a visitor and the form loses some of them; a long sales page argues
 * before it asks; one screen asks at once. `design` null is the order and the
 * blue every page had before there was a choice.
 */
export function pageBlocks(
  v: PageCopy, design: PageDesign | null,
  o: { company: string; formSlug: string; logoSrc: string; fields: { label: string; type: string; required: boolean }[] },
): { id: string; type: string; content: string; settings: Record<string, unknown> }[] {
  const block = (type: string, content: string, settings: Record<string, unknown>) =>
    ({ id: `bl-${crypto.randomUUID()}`, type, content, settings });
  const p = design?.palette;
  const accent = p?.accent;
  const btn = accent ? { buttonColor: accent, buttonTextColor: inkOn(accent) } : {};

  const nav = block('navbar', '', {
    navLogo: o.company || 'Home', buttonText: v.cta, ...btn,
    ...(o.logoSrc ? { navLogoImage: o.logoSrc } : {}),
  });
  const hero = block('hero', v.headline, {
    subheading: v.subhead, buttonText: v.cta,
    bgGradient: p ? `linear-gradient(135deg,${p.bg},${p.bg2})` : 'linear-gradient(135deg,#1e3a5f,#2563eb)',
    ...(p ? { textColor: p.ink } : {}),
    ...btn,
  });
  /* The bullets become the "what we do" row, which is the section a visitor
     reads to decide whether this business does their thing. */
  const features = block('features', 'What we do', {
    featureItems: v.bullets.slice(0, 6).map(b => ({ icon: '✓', title: b.slice(0, 60), desc: '' })),
    ...(accent ? { iconColor: accent } : {}),
  });
  const sections = v.sections.slice(0, 3).map(sec => block('columns', sec.heading, { subheading: sec.body }));
  const form = block('form', 'Get in touch', { formSlug: o.formSlug, formFields: o.fields, ...btn });
  const footer = block('footer', '', { navLogo: o.company || '' });

  switch (design?.layout) {
    case 'hero-form': return [nav, hero, form, features, ...sections, footer];
    case 'long-sales': return [nav, hero, ...sections, features, form, footer];
    case 'minimal': return [nav, hero, form, footer];
    default: return [nav, hero, features, ...sections, form, footer];
  }
}
