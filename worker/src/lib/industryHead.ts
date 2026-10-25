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
