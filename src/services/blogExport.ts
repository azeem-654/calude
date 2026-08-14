/**
 * Turning an article into a page a search engine can rank.
 *
 * The HTML this produces is the point of the whole module. Everything before it
 * — the portfolio, the clusters, the plan, the writing, the covers — exists so
 * that this document carries the right signals, and every one of them has to be
 * in the markup rather than in our intentions:
 *
 *   • one canonical URL, so the same post at two addresses does not compete
 *     with itself and split its own ranking
 *   • a title and description inside the lengths Google will actually show
 *   • Open Graph and Twitter tags, so a share is a card and not a bare link
 *   • JSON-LD Article structured data, which is what earns the byline, date and
 *     image in a result rather than a plain blue line
 *   • the cover as a real <img> with real alt text
 *   • lang and charset, because a page that does not declare them gets guessed at
 *
 * A sitemap and an RSS feed are built the same way, from the same records, for
 * the export path. WordPress builds its own and this does not duplicate them.
 */
import { htmlToPlain, sanitizeHtml } from './blogWriter';
import { coverOf } from './blogImages';
import type {
  Article, BlogProject, MonthPlan, PlannedPost, PublishRecord, PublishTarget,
} from '../types/blogAutomation';

/* ── URLs ── */

export const trimSlashes = (s: string) => s.replace(/^\/+|\/+$/g, '');

/** The site root with no trailing slash, so joins never double up. */
export const siteRoot = (target: PublishTarget): string =>
  target.siteUrl.trim().replace(/\/+$/, '');

/**
 * The canonical address of one post.
 *
 * Canonical means "the one true address". Getting it wrong is not cosmetic:
 * two URLs serving the same article are two pages competing for the same
 * phrase, and the search engine picks one and discards the other's links.
 */
export function postUrl(target: PublishTarget, slug: string): string {
  const base = trimSlashes(target.basePath || '');
  return `${siteRoot(target)}/${base ? `${base}/` : ''}${trimSlashes(slug)}/`;
}

export const feedUrl = (target: PublishTarget) => `${siteRoot(target)}/feed.xml`;
export const sitemapUrl = (target: PublishTarget) => `${siteRoot(target)}/sitemap.xml`;

/* ── Escaping ── */

const esc = (s: string) =>
  s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#39;');

/** XML text nodes. `]]>` would close a CDATA section early. */
const xml = (s: string) => esc(s).replace(/]]>/g, ']]&gt;');

/* ── Structured data ── */

/**
 * JSON-LD, embedded as a script tag.
 *
 * This is the one place a `<script>` is legitimate, and it is built here from
 * typed values and serialised with JSON.stringify rather than assembled from
 * strings — so nothing a user typed can close the tag and become code. The
 * `</` sequence is escaped because it can terminate a script element from
 * inside a JSON string, which is the classic way this goes wrong.
 */
export function articleJsonLd(
  post: PlannedPost,
  article: Article,
  project: BlogProject,
  target: PublishTarget,
  publishedAt: string,
  coverUrl?: string,
): string {
  const url = postUrl(target, article.seo.slug);
  const cover = coverOf(article);
  const data: Record<string, unknown> = {
    '@context': 'https://schema.org',
    '@type': 'Article',
    headline: post.title.slice(0, 110),
    description: article.seo.metaDescription,
    mainEntityOfPage: { '@type': 'WebPage', '@id': url },
    url,
    datePublished: publishedAt,
    dateModified: article.writtenAt || publishedAt,
    wordCount: article.seo.words,
    inLanguage: 'en',
    author: { '@type': 'Organization', name: project.name || siteRoot(target) },
    publisher: { '@type': 'Organization', name: project.name || siteRoot(target) },
    keywords: [post.primaryKeyword, ...post.secondaryKeywords].filter(Boolean).join(', '),
  };
  // A data: URL is useless to a crawler — it cannot fetch one — so the image is
  // only declared when there is a real address for it.
  const image = coverUrl || (cover && !cover.dataUrl.startsWith('data:') ? cover.dataUrl : '');
  if (cover && image) {
    data.image = { '@type': 'ImageObject', url: image, width: cover.width, height: cover.height };
  }
  return JSON.stringify(data).replace(/</g, '\\u003c');
}

/* ── The head ── */

export interface HeadOptions {
  post: PlannedPost;
  article: Article;
  project: BlogProject;
  target: PublishTarget;
  publishedAt: string;
  /** Absolute URL of the cover, when it has been uploaded somewhere addressable. */
  coverUrl?: string;
}

/**
 * Every tag that affects how this page is indexed and how it is shared.
 *
 * Returned as a list of lines rather than one blob so the WordPress path can
 * take the parts it needs — WordPress writes its own title, canonical and feed
 * links, and duplicating them is worse than omitting them.
 */
export function headTags(o: HeadOptions): string[] {
  const url = postUrl(o.target, o.article.seo.slug);
  const cover = coverOf(o.article);
  /**
   * og:image has to be somewhere Facebook, LinkedIn and X can actually fetch.
   *
   * A data: URL renders perfectly inside the app and is worthless here: every
   * crawler that builds a share card issues a real HTTP request for this
   * address. Left inline, every share of every post would show no picture —
   * the exact failure the cover exists to prevent. So the tag is only written
   * when the caller has given a real URL, or the image already had one.
   */
  const image = o.coverUrl || (cover && !cover.dataUrl.startsWith('data:') ? cover.dataUrl : '');
  const brand = o.project.name || siteRoot(o.target);

  const tags = [
    `<meta charset="utf-8" />`,
    `<meta name="viewport" content="width=device-width, initial-scale=1" />`,
    `<title>${esc(o.article.seo.metaTitle)}</title>`,
    `<meta name="description" content="${esc(o.article.seo.metaDescription)}" />`,
    `<link rel="canonical" href="${esc(url)}" />`,
    `<meta name="robots" content="index, follow, max-image-preview:large, max-snippet:-1" />`,

    `<meta property="og:type" content="article" />`,
    `<meta property="og:site_name" content="${esc(brand)}" />`,
    `<meta property="og:title" content="${esc(o.article.seo.metaTitle)}" />`,
    `<meta property="og:description" content="${esc(o.article.seo.metaDescription)}" />`,
    `<meta property="og:url" content="${esc(url)}" />`,
    `<meta property="article:published_time" content="${esc(o.publishedAt)}" />`,

    `<meta name="twitter:card" content="${image ? 'summary_large_image' : 'summary'}" />`,
    `<meta name="twitter:title" content="${esc(o.article.seo.metaTitle)}" />`,
    `<meta name="twitter:description" content="${esc(o.article.seo.metaDescription)}" />`,
  ];

  if (image) {
    tags.push(`<meta property="og:image" content="${esc(image)}" />`);
    tags.push(`<meta property="og:image:width" content="${cover?.width ?? 1200}" />`);
    tags.push(`<meta property="og:image:height" content="${cover?.height ?? 630}" />`);
    if (cover?.alt) tags.push(`<meta property="og:image:alt" content="${esc(cover.alt)}" />`);
    tags.push(`<meta name="twitter:image" content="${esc(image)}" />`);
  }

  tags.push(`<link rel="alternate" type="application/rss+xml" title="${esc(brand)}" href="${esc(feedUrl(o.target))}" />`);
  tags.push(`<script type="application/ld+json">${articleJsonLd(o.post, o.article, o.project, o.target, o.publishedAt, image)}</script>`);

  return tags;
}

/* ── The page ── */

/**
 * The stylesheet the exported pages carry.
 *
 * Inlined rather than linked: an export has to work when it is dropped into a
 * folder on any host, and a missing stylesheet would be the first thing to
 * break. It is deliberately plain — this is a readable article page, not a
 * theme, and it should not fight whatever the customer's site already does if
 * they lift the markup out of it.
 */
const PAGE_CSS = `
:root { color-scheme: light dark; --ink:#17191c; --muted:#5b636d; --line:#e3e6eb; --page:#fff; --link:#1d4ed8; }
@media (prefers-color-scheme: dark) {
  :root { --ink:#e8eaed; --muted:#a2a9b3; --line:#2c3138; --page:#14171a; --link:#8ab4f8; }
}
* { box-sizing: border-box; }
body { margin:0; background:var(--page); color:var(--ink); font: 17px/1.75 -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; }
main { max-width: 720px; margin: 0 auto; padding: 40px 20px 80px; }
h1 { font-size: 2.1em; line-height:1.15; letter-spacing:-0.025em; margin:0 0 0.35em; }
h2 { font-size: 1.4em; margin: 1.7em 0 0.5em; letter-spacing:-0.02em; }
h3 { font-size: 1.12em; margin: 1.4em 0 0.4em; }
p { margin: 0 0 1.15em; }
a { color: var(--link); }
ul, ol { margin: 0 0 1.15em; padding-left: 1.4em; }
li { margin-bottom: 0.4em; }
blockquote { margin: 0 0 1.15em; padding: 0.1em 0 0.1em 1em; border-left: 3px solid var(--line); color: var(--muted); }
img { max-width: 100%; height: auto; border-radius: 12px; }
figure { margin: 0 0 1.4em; }
figcaption { font-size: 0.85em; color: var(--muted); margin-top: 0.5em; }
table { width:100%; border-collapse: collapse; margin: 0 0 1.15em; font-size: 0.95em; }
th, td { border: 1px solid var(--line); padding: 8px 11px; text-align: left; }
.meta { color: var(--muted); font-size: 0.86em; margin: 0 0 2em; }
footer { border-top: 1px solid var(--line); margin-top: 3em; padding-top: 1.2em; color: var(--muted); font-size: 0.86em; }
`.trim();

/**
 * A complete, standalone page.
 *
 * The body is re-sanitised on the way out. It was sanitised when it was written
 * and again on every edit, but this is the last moment before it becomes a file
 * on somebody's public web server, and that is the wrong place to be trusting
 * an invariant maintained three services ago.
 */
export function renderPage(o: HeadOptions): string {
  const body = sanitizeHtml(o.article.html);
  const date = o.publishedAt.slice(0, 10);
  const mins = o.article.seo.readingMinutes;
  const brand = o.project.name || siteRoot(o.target);

  return `<!doctype html>
<html lang="en">
<head>
${headTags(o).map(t => `  ${t}`).join('\n')}
  <style>${PAGE_CSS}</style>
</head>
<body>
  <main>
    <article>
      <h1>${esc(o.post.title)}</h1>
      <p class="meta">
        <time datetime="${esc(date)}">${esc(date)}</time> · ${mins} min read${brand ? ` · ${esc(brand)}` : ''}
      </p>
${body.split('\n').map(l => `      ${l}`).join('\n')}
    </article>
    <footer>
      <p>${esc(brand)}${o.project.domain ? ` · ${esc(o.project.domain)}` : ''}</p>
    </footer>
  </main>
</body>
</html>
`;
}

/* ── Sitemap and feed ── */

export interface PublishedPost {
  post: PlannedPost;
  article: Article;
  record: PublishRecord;
}

/** Posts in a plan that are live on this target, newest first. */
export function livePosts(plan: MonthPlan, targetId: string): PublishedPost[] {
  return plan.posts
    .filter(p => p.article && p.published?.[targetId]?.state === 'live')
    .map(p => ({ post: p, article: p.article as Article, record: (p.published as Record<string, PublishRecord>)[targetId] }))
    .sort((a, b) => (b.record.at ?? '').localeCompare(a.record.at ?? ''));
}

/**
 * A sitemap.
 *
 * This exists so a new post is found in days rather than weeks. It is built for
 * the export path only — WordPress publishes /wp-sitemap.xml itself, and a
 * second, staler sitemap competing with it would do harm rather than nothing.
 */
export function buildSitemap(target: PublishTarget, posts: PublishedPost[]): string {
  const entries = posts.map(p => {
    const url = p.record.url || postUrl(target, p.article.seo.slug);
    const mod = (p.record.at || p.article.writtenAt || '').slice(0, 10);
    return `  <url>
    <loc>${xml(url)}</loc>${mod ? `\n    <lastmod>${xml(mod)}</lastmod>` : ''}
    <changefreq>monthly</changefreq>
    <priority>0.7</priority>
  </url>`;
  });

  return `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
  <url>
    <loc>${xml(`${siteRoot(target)}/${trimSlashes(target.basePath || '')}${target.basePath ? '/' : ''}`)}</loc>
    <changefreq>weekly</changefreq>
    <priority>1.0</priority>
  </url>
${entries.join('\n')}
</urlset>
`;
}

const rfc822 = (iso: string): string => {
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? '' : d.toUTCString();
};

/** An RSS 2.0 feed. Readers, aggregators, and anything watching for new work. */
export function buildRss(project: BlogProject, target: PublishTarget, posts: PublishedPost[]): string {
  const brand = project.name || siteRoot(target);
  const items = posts.slice(0, 50).map(p => {
    const url = p.record.url || postUrl(target, p.article.seo.slug);
    const summary = p.article.seo.metaDescription || htmlToPlain(p.article.html).slice(0, 300);
    return `    <item>
      <title>${xml(p.post.title)}</title>
      <link>${xml(url)}</link>
      <guid isPermaLink="true">${xml(url)}</guid>
      <description>${xml(summary)}</description>${
        p.record.at ? `\n      <pubDate>${xml(rfc822(p.record.at))}</pubDate>` : ''
      }
    </item>`;
  });

  return `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0" xmlns:atom="http://www.w3.org/2005/Atom">
  <channel>
    <title>${xml(brand)}</title>
    <link>${xml(siteRoot(target))}</link>
    <description>${xml(project.seo.offering || `Articles from ${brand}`)}</description>
    <language>en</language>
    <atom:link href="${xml(feedUrl(target))}" rel="self" type="application/rss+xml" />
${items.join('\n')}
  </channel>
</rss>
`;
}

/** robots.txt, whose only real job is pointing at the sitemap. */
export const buildRobots = (target: PublishTarget): string =>
  `User-agent: *\nAllow: /\n\nSitemap: ${sitemapUrl(target)}\n`;
