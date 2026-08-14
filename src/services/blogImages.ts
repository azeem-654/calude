/**
 * Giving every post a picture.
 *
 * Two jobs. Turning a planned post into a cover card — which is mostly deciding
 * what the card should say, since the drawing lives in lib/coverArt.ts — and
 * putting an image into the article body without breaking the HTML the SEO
 * checks are measured against.
 *
 * The storage budget is the constraint that shapes everything here. Articles
 * and their images share one localStorage quota with the rest of the app, and a
 * month is twenty-odd posts. So covers are rendered at a size that shares well
 * rather than a size that prints well, every image reports its real weight, and
 * the UI is given the numbers rather than being left to find out when a save
 * fails.
 */
import { altForCover, renderCover, type CoverSpec, type CoverTemplate } from '../lib/coverArt';
import { newId } from './blogAutomation';
import { sanitizeHtml } from './blogWriter';
import type { Article, ArticleImage, BlogProject, MonthPlan, PlannedPost } from '../types/blogAutomation';

/**
 * 1200×630 is the Open Graph size — the one Facebook, LinkedIn, X and Slack all
 * crop their preview from. Anything smaller is upscaled and looks it.
 */
export const COVER_WIDTH = 1200;
export const COVER_HEIGHT = 630;

/** Inline images sit inside the column, so they can be much lighter. */
export const INLINE_WIDTH = 900;
export const INLINE_HEIGHT = 500;

/**
 * Roughly what one cover may weigh.
 *
 * Not a hard limit — an over-budget image is still produced, because refusing to
 * make a picture is worse than making a slightly heavy one — but the UI says so,
 * and `fitToBudget` will trade quality for size before it gives up.
 */
export const COVER_BYTE_BUDGET = 140 * 1024;

/** A stable per-post seed, so regenerating gives the same card back. */
export const seedFor = (post: PlannedPost): string =>
  `${post.primaryKeyword}|${post.role}|${post.clusterId}`;

/** The small label above the headline: what kind of piece this is. */
export function kickerFor(post: PlannedPost, project: BlogProject): string {
  const where = project.seo.location.trim();
  if (post.role === 'pillar') return where ? `Guide · ${where}` : 'Guide';
  const k = post.primaryKeyword.toLowerCase();
  if (/^how much/.test(k)) return 'Costs';
  if (/^how to/.test(k)) return 'How to';
  if (/^(what|why|which|when) /.test(k)) return 'Explained';
  if (/checklist$/.test(k)) return 'Checklist';
  if (/mistakes$/.test(k)) return 'Mistakes';
  return where ? where : 'Article';
}

export function coverSpec(post: PlannedPost, project: BlogProject, template: CoverTemplate): CoverSpec {
  return {
    title: post.title.trim() || post.primaryKeyword,
    kicker: kickerFor(post, project),
    brand: project.name.trim(),
    domain: project.domain.trim(),
    seed: seedFor(post),
    template,
    width: COVER_WIDTH,
    height: COVER_HEIGHT,
  };
}

/**
 * Render, then drop quality until it fits the budget.
 *
 * A flat typographic card compresses extremely well, so this usually returns on
 * the first try; it earns its keep on the long headlines that need a gradient
 * across the whole frame. It never goes below 0.6, where the type starts to
 * fringe, and it returns the too-large image rather than nothing if it cannot
 * get there — the caller reports the weight either way.
 */
export function fitToBudget(spec: CoverSpec, budget = COVER_BYTE_BUDGET) {
  let out = renderCover(spec);
  for (let q = 0.82; out.bytes > budget && q >= 0.6; q -= 0.07) {
    out = renderCover({ ...spec, quality: q });
  }
  return out;
}

export function makeCover(post: PlannedPost, project: BlogProject, template: CoverTemplate): ArticleImage {
  const spec = coverSpec(post, project, template);
  const rendered = fitToBudget(spec);
  return {
    id: newId('img'),
    role: 'cover',
    dataUrl: rendered.dataUrl,
    alt: altForCover(spec),
    width: rendered.width,
    height: rendered.height,
    bytes: rendered.bytes,
    template,
    source: 'generated',
    createdAt: new Date().toISOString(),
  };
}

/** A lighter card for inside the article, headed by one of its own sections. */
export function makeInline(
  post: PlannedPost,
  project: BlogProject,
  template: CoverTemplate,
  heading: string,
): ArticleImage {
  const spec: CoverSpec = {
    title: heading.trim() || post.title,
    kicker: post.primaryKeyword,
    brand: project.name.trim(),
    domain: '',
    seed: `${seedFor(post)}|${heading}`,
    template,
    width: INLINE_WIDTH,
    height: INLINE_HEIGHT,
  };
  const rendered = fitToBudget(spec, 90 * 1024);
  return {
    id: newId('img'),
    role: 'inline',
    dataUrl: rendered.dataUrl,
    alt: altForCover(spec),
    width: rendered.width,
    height: rendered.height,
    bytes: rendered.bytes,
    template,
    source: 'generated',
    anchor: heading,
    createdAt: new Date().toISOString(),
  };
}

/* ── Uploads ── */

export const IMAGE_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'image/gif'];
export const MAX_UPLOAD_BYTES = 5 * 1024 * 1024;

export interface UploadCheck { ok: boolean; reason?: string }

/**
 * What a user may put on their own live site through this module.
 *
 * The type is taken from the browser's sniffing rather than the file extension,
 * because the extension is chosen by whoever made the file. SVG is deliberately
 * absent from the allowed list: it is a document format that can carry script,
 * and an SVG "image" published to a customer's domain is a stored XSS wearing a
 * picture's clothes.
 */
export function validateImage(file: File): UploadCheck {
  if (!IMAGE_TYPES.includes(file.type)) {
    return {
      ok: false,
      reason: file.type === 'image/svg+xml'
        ? 'SVG is not accepted. An SVG can contain script, and this image is going onto your live site — save it as a PNG or JPEG instead.'
        : `That is a ${file.type || 'unrecognised'} file. Use a JPEG, PNG, WebP or GIF.`,
    };
  }
  if (file.size > MAX_UPLOAD_BYTES) {
    return { ok: false, reason: `That image is ${(file.size / 1024 / 1024).toFixed(1)}MB. The limit is 5MB — resize it first.` };
  }
  return { ok: true };
}

/**
 * Read an upload and re-encode it through a canvas at a sane size.
 *
 * Re-encoding is not only about weight. Decoding the file and drawing it to a
 * canvas discards everything that was not pixels — EXIF, colour profiles,
 * trailing data appended after the image, anything hidden in a comment block —
 * so what gets stored and later published is exactly the picture and nothing
 * that was travelling with it.
 */
export function readImageUpload(file: File, maxWidth = COVER_WIDTH): Promise<ArticleImage> {
  return new Promise((resolve, reject) => {
    const check = validateImage(file);
    if (!check.ok) { reject(new Error(check.reason)); return; }

    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      URL.revokeObjectURL(url);
      try {
        const scale = Math.min(1, maxWidth / img.naturalWidth);
        const w = Math.max(1, Math.round(img.naturalWidth * scale));
        const h = Math.max(1, Math.round(img.naturalHeight * scale));
        const canvas = document.createElement('canvas');
        canvas.width = w;
        canvas.height = h;
        const ctx = canvas.getContext('2d');
        if (!ctx) throw new Error('This browser did not provide a 2D canvas.');
        ctx.drawImage(img, 0, 0, w, h);
        const dataUrl = canvas.toDataURL('image/jpeg', 0.85);
        const b64 = dataUrl.slice(dataUrl.indexOf(',') + 1);
        resolve({
          id: newId('img'),
          role: 'cover',
          dataUrl,
          // Deliberately empty rather than guessed. We have not seen this
          // picture and inventing a description of it would be a lie in the
          // one field a blind reader depends on. The UI asks for it.
          alt: '',
          width: w,
          height: h,
          bytes: Math.round((b64.length * 3) / 4),
          source: 'uploaded',
          createdAt: new Date().toISOString(),
        });
      } catch (err) {
        reject(err instanceof Error ? err : new Error('That image could not be read.'));
      }
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error('That file could not be decoded as an image, whatever its name says.'));
    };
    img.src = url;
  });
}

/* ── Putting an image into the article ── */

const escapeAttr = (s: string) =>
  s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

export const figureFor = (image: ArticleImage, caption = ''): string =>
  `<figure><img src="${image.dataUrl}" alt="${escapeAttr(image.alt)}" width="${image.width}" height="${image.height}" loading="lazy" />${
    caption.trim() ? `<figcaption>${escapeAttr(caption.trim())}</figcaption>` : ''
  }</figure>`;

/**
 * Insert a figure directly after a given heading, or at the top if none is named.
 *
 * The result goes back through the sanitiser like everything else. That is not
 * paranoia about our own output — the alt text and caption are user-typed, and
 * this is the moment they become markup.
 */
export function insertFigure(html: string, image: ArticleImage, heading?: string, caption = ''): string {
  const figure = figureFor(image, caption);
  if (!heading) return sanitizeHtml(`${figure}\n${html}`);

  const escaped = heading.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const re = new RegExp(`(<h[234][^>]*>\\s*${escaped}\\s*</h[234]>)`, 'i');
  return sanitizeHtml(re.test(html) ? html.replace(re, `$1\n${figure}`) : `${html}\n${figure}`);
}

/** Remove every figure whose image is this one, by its data URL. */
export function removeFigure(html: string, image: ArticleImage): string {
  const parts = html.split(/(<figure[\s\S]*?<\/figure>)/i);
  return sanitizeHtml(parts.filter(p => !(/^<figure/i.test(p) && p.includes(image.dataUrl))).join(''));
}

/** Headings an inline image could sit under. */
export function headingsIn(html: string): string[] {
  return [...html.matchAll(/<h[234][^>]*>([\s\S]*?)<\/h[234]>/gi)]
    .map(m => m[1].replace(/<[^>]+>/g, '').trim())
    .filter(Boolean);
}

/* ── Bookkeeping ── */

export const imagesOf = (article: Article | undefined): ArticleImage[] => article?.images ?? [];

export const coverOf = (article: Article | undefined): ArticleImage | undefined =>
  imagesOf(article).find(i => i.role === 'cover');

export const imageBytes = (article: Article | undefined): number =>
  imagesOf(article).reduce((n, i) => n + i.bytes, 0);

export interface PlanImageStats {
  posts: number;
  written: number;
  withCover: number;
  missingAlt: number;
  totalBytes: number;
}

/** What the month's pictures amount to — including the ones that are missing. */
export function planImageStats(plan: MonthPlan): PlanImageStats {
  const written = plan.posts.filter(p => p.article);
  return {
    posts: plan.posts.length,
    written: written.length,
    withCover: written.filter(p => coverOf(p.article)).length,
    missingAlt: written.reduce(
      (n, p) => n + imagesOf(p.article).filter(i => !i.alt.trim()).length, 0,
    ),
    totalBytes: written.reduce((n, p) => n + imageBytes(p.article), 0),
  };
}

export const readableBytes = (n: number): string =>
  n >= 1024 * 1024 ? `${(n / 1024 / 1024).toFixed(1)}MB` : `${Math.max(1, Math.round(n / 1024))}KB`;

/** Replace an article's image list, keeping everything else about it. */
export function withImages(article: Article, images: ArticleImage[]): Article {
  return { ...article, images };
}
