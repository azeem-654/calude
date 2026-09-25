/**
 * Fetch a web page and reduce it to readable text.
 *
 * ── This fetches a URL somebody typed, from our server ──
 *
 * That is a server-side request forgery primitive unless it is fenced in, and
 * "it's only on Cloudflare, there is no private network" is not a fence — it is
 * a property of today's deployment. So the URL is checked before the request
 * and again after every redirect, because a public hostname that 302s to
 * 169.254.169.254 defeats a check done only once.
 *
 * What is refused, and why each one:
 *
 *  - anything but http and https — `file:`, `data:` and `blob:` are not pages;
 *  - credentials in the URL, which would be sent to a host we then describe;
 *  - a literal IP address, loopback, link-local, and the RFC1918 ranges;
 *  - `.local`, `.internal`, `localhost` and bare single-label hostnames, which
 *    only resolve to something inside a network;
 *  - more than three redirects.
 *
 * And the body is read to a cap. A URL that streams forever would otherwise
 * hold a Worker request open until it was killed.
 */

const MAX_BYTES = 400_000;
const MAX_HOPS = 3;

/** Refused before we ask for it. */
export function urlProblem(raw: string): string {
  let u: URL;
  try { u = new URL(raw.trim()); } catch { return 'That is not a web address. It needs to start with https://'; }

  if (u.protocol !== 'https:' && u.protocol !== 'http:') {
    return `Only web pages can be read — ${u.protocol.replace(':', '')} addresses cannot.`;
  }
  if (u.username || u.password) {
    return 'Remove the username and password from the address before pasting it.';
  }

  const host = u.hostname.toLowerCase().replace(/^\[|\]$/g, '');

  /* A literal address skips DNS entirely, which is how loopback, link-local
     and the RFC1918 ranges are usually reached. Public sites are named, so
     refusing every literal costs nothing worth having. Checked first, so an
     IPv6 host is named as one rather than falling through to the "no dot in
     it" rule below and being called an internal name. */
  if (/^\d{1,3}(\.\d{1,3}){3}$/.test(host) || host.includes(':')) {
    return 'Paste the site\u2019s address rather than an IP address.';
  }

  if (host === 'localhost' || host.endsWith('.localhost')) return 'That address points at this server, not at a website.';
  if (host.endsWith('.local') || host.endsWith('.internal') || host.endsWith('.home.arpa')) {
    return 'That address only exists inside a private network, so there is nothing here to read.';
  }
  /* A single label \u2014 "intranet", "router" \u2014 is a name only a private resolver
     answers. A real site always has a dot in it. */
  if (!host.includes('.')) return 'That looks like an internal name rather than a website address.';


  return '';
}

export interface SiteText {
  ok: boolean;
  url: string;
  title: string;
  text: string;
  error: string;
}

const no = (error: string, url = ''): SiteText => ({ ok: false, url, title: '', text: '', error });

/** Strip a page down to the words on it. */
export function readable(html: string): { title: string; text: string } {
  const titleMatch = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i);
  const metaDesc = html.match(/<meta[^>]+name=["']description["'][^>]+content=["']([^"']{0,400})["']/i)
    ?? html.match(/<meta[^>]+content=["']([^"']{0,400})["'][^>]+name=["']description["']/i);

  const body = html
    /* Script and style hold the most text on a modern page and none of the
       meaning. Removed first so what follows is not mostly minified JS. */
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<noscript[\s\S]*?<\/noscript>/gi, ' ')
    .replace(/<svg[\s\S]*?<\/svg>/gi, ' ')
    .replace(/<!--[\s\S]*?-->/g, ' ')
    /* Block ends become breaks, so headings and list items do not run into the
       next sentence and read as one long word salad. */
    .replace(/<\/(p|div|section|li|h[1-6]|tr|br)[^>]*>/gi, '\n')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&quot;/gi, '"')
    .replace(/&#39;|&apos;/gi, "'")
    .replace(/[ \t]+/g, ' ')
    .replace(/\n{2,}/g, '\n')
    .trim();

  const title = (titleMatch?.[1] ?? '').replace(/\s+/g, ' ').trim();
  const desc = (metaDesc?.[1] ?? '').replace(/\s+/g, ' ').trim();
  return { title, text: desc ? `${desc}\n${body}` : body };
}

export interface SitePage {
  ok: boolean;
  /** Where it ended up, after redirects. Relative links resolve against this. */
  url: string;
  html: string;
  error: string;
}

/**
 * Fetch a page's HTML, fenced — every hop checked, the body read to a cap.
 *
 * Split out of `readSite` so the logo finder can look at the markup of a page
 * that has too few words to describe a business (a landing page that is all
 * pictures still has a logo on it).
 */
export async function fetchPage(raw: string): Promise<SitePage> {
  const problem = urlProblem(raw);
  const none = (error: string, url = ''): SitePage => ({ ok: false, url, html: '', error });
  if (problem) return none(problem);

  let url = new URL(raw.trim()).toString();

  for (let hop = 0; hop <= MAX_HOPS; hop++) {
    let res: Response;
    try {
      res = await fetch(url, {
        /* Manual, so every hop is checked. Following automatically would let a
           public host redirect us somewhere the first check refused. */
        redirect: 'manual',
        headers: {
          /* Named honestly. A site that does not want to be read by a tool
             should be able to tell it is one. */
          'User-Agent': 'ProtectedCentral-SiteReader/1.0 (+https://protectedcentral.com)',
          Accept: 'text/html,application/xhtml+xml',
        },
      });
    } catch (e) {
      return none(`That page could not be reached: ${e instanceof Error ? e.message : String(e)}`, url);
    }

    if (res.status >= 300 && res.status < 400) {
      const next = res.headers.get('location');
      if (!next) return none('That address redirects to nowhere.', url);
      if (hop === MAX_HOPS) return none('That address redirects too many times.', url);
      const resolved = new URL(next, url).toString();
      const p = urlProblem(resolved);
      if (p) return none(`That address redirects somewhere it should not: ${p}`, url);
      url = resolved;
      continue;
    }

    if (res.status === 403 || res.status === 401) {
      return none('That site refused to be read automatically. Describe the client by hand instead.', url);
    }
    if (!res.ok) return none(`That page answered ${res.status}.`, url);

    const type = res.headers.get('content-type') ?? '';
    if (type && !/text\/html|application\/xhtml|text\/plain/i.test(type)) {
      return none(`That address is a ${type.split(';')[0]}, not a web page.`, url);
    }

    const buf = await readCapped(res, MAX_BYTES);
    if (!buf) return none('That page sent nothing back.', url);
    const html = new TextDecoder('utf-8', { fatal: false, ignoreBOM: false }).decode(buf);
    return { ok: true, url, html, error: '' };
  }

  return none('That address redirects too many times.', url);
}

/**
 * A response body, read to at most `cap` bytes.
 *
 * Not res.text() or arrayBuffer(): a body with no content-length that never
 * ends would otherwise run until the request is killed. Null when there was no
 * body at all.
 */
export async function readCapped(res: Response, cap: number): Promise<Uint8Array | null> {
  const reader = res.body?.getReader();
  if (!reader) return null;
  const chunks: Uint8Array[] = [];
  let total = 0;
  while (total < cap) {
    const { done, value } = await reader.read();
    if (done) break;
    if (value) { chunks.push(value); total += value.length; }
  }
  void reader.cancel().catch(() => {});
  const size = Math.min(total, cap);
  const buf = new Uint8Array(size);
  let at = 0;
  for (const c of chunks) {
    if (at >= size) break;
    const part = c.subarray(0, Math.min(c.length, size - at));
    buf.set(part, at);
    at += part.length;
  }
  return buf;
}

export async function readSite(raw: string): Promise<SiteText> {
  const page = await fetchPage(raw);
  if (!page.ok) return no(page.error, page.url);
  const url = page.url;

  const { title, text } = readable(page.html);
  /*
   * Forty words, counted the same way the paste path counts them.
   *
   * The bar here used to be sixty *characters* — about ten words — while
   * pasting the same content by hand demanded forty. So a page that rendered
   * a nav and a tagline server-side and everything else in the browser sailed
   * through the URL route and was refused through the paste route, and the
   * model was handed fifteen words and asked for seven fields about a
   * business. It answered, of course. That is the failure this whole file
   * exists to avoid, and the looser of two thresholds for the same job was
   * where it got in.
   *
   * Modern marketing sites built in the browser land here often. Saying so,
   * with somewhere else to go, is worth more than a confident profile of a
   * company nobody read anything about.
   */
  if (text.split(/\s+/).filter(Boolean).length < 40) {
    return no(
      'There were almost no words on that page — it is probably built in the browser rather than sent as text. Try their /about page, paste the text in by hand, or describe the client yourself.',
      url,
    );
  }
  return { ok: true, url, title, text: text.slice(0, 12_000), error: '' };
}
