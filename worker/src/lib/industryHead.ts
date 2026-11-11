/**
 * The trade pages' served head (see industryPages.ts for why). Kept apart from
 * that file because HTMLRewriter exists only in the Worker, and the app's
 * build compiles industryPages.ts for its tab titles.
 */
import { SITE_ORIGIN, industryJsonLd, type IndustryMeta } from './industryPages';

/** index.html, with its head describing the trade page instead of the home page. */
export function rewriteIndustryHead(res: Response, m: IndustryMeta): Response {
  const url = `${SITE_ORIGIN}${m.path}`;
  return new HTMLRewriter()
    .on('title', { element(el) { el.setInnerContent(m.title); } })
    .on('meta[name="description"]', { element(el) { el.setAttribute('content', m.description); } })
    .on('link[rel="canonical"]', { element(el) { el.setAttribute('href', url); } })
    .on('meta[property="og:url"]', { element(el) { el.setAttribute('content', url); } })
    .on('meta[property="og:title"]', { element(el) { el.setAttribute('content', m.title); } })
    .on('meta[property="og:description"]', { element(el) { el.setAttribute('content', m.description); } })
    .on('head', {
      element(el) {
        el.append(`<script type="application/ld+json">${industryJsonLd(m)}</script>`, { html: true });
      },
    })
    .transform(res);
}

/**
 * A public page's own title and description (PUB-4), and for an address the
 * site does not have, a 404 that tells crawlers not to index it. The body is
 * still the app, which draws its own "not found" screen.
 */
export function rewritePageHead(res: Response, h: { title: string; description: string }, path: string, notFound = false): Response {
  const url = `${SITE_ORIGIN}${path}`;
  const out = notFound ? new Response(res.body, { status: 404, headers: res.headers }) : res;
  return new HTMLRewriter()
    .on('title', { element(el) { el.setInnerContent(h.title); } })
    .on('meta[name="description"]', { element(el) { el.setAttribute('content', h.description); } })
    .on('link[rel="canonical"]', { element(el) { if (notFound) el.remove(); else el.setAttribute('href', url); } })
    .on('meta[property="og:url"]', { element(el) { el.setAttribute('content', url); } })
    .on('meta[property="og:title"]', { element(el) { el.setAttribute('content', h.title); } })
    .on('meta[property="og:description"]', { element(el) { el.setAttribute('content', h.description); } })
    .on('head', { element(el) { if (notFound) el.append('<meta name="robots" content="noindex">', { html: true }); } })
    .transform(out);
}
