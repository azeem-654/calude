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

export async function readSite(raw: string): Promise<SiteText> {
  const problem = urlProblem(raw);
  if (problem) return no(problem);

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
      return no(`That page could not be reached: ${e instanceof Error ? e.message : String(e)}`, url);
    }

    if (res.status >= 300 && res.status < 400) {
      const next = res.headers.get('location');
      if (!next) return no('That address redirects to nowhere.', url);
      if (hop === MAX_HOPS) return no('That address redirects too many times.', url);
      const resolved = new URL(next, url).toString();
      const p = urlProblem(resolved);
      if (p) return no(`That address redirects somewhere it should not: ${p}`, url);
      url = resolved;
      continue;
    }

    if (res.status === 403 || res.status === 401) {
      return no('That site refused to be read automatically. Describe the client by hand instead.', url);
    }
    if (!res.ok) return no(`That page answered ${res.status}.`, url);

    const type = res.headers.get('content-type') ?? '';
    if (type && !/text\/html|application\/xhtml|text\/plain/i.test(type)) {
      return no(`That address is a ${type.split(';')[0]}, not a web page.`, url);
    }

    /* Read to a cap rather than res.text(): a body with no content-length that
       never ends would otherwise run until the request is killed. */
    const reader = res.body?.getReader();
    if (!reader) return no('That page sent nothing back.', url);
    const chunks: Uint8Array[] = [];
    let total = 0;
    while (total < MAX_BYTES) {
      const { done, value } = await reader.read();
      if (done) break;
      if (value) { chunks.push(value); total += value.length; }
    }
    void reader.cancel().catch(() => {});

    const buf = new Uint8Array(total);
    let at = 0;
    for (const c of chunks) { buf.set(c.subarray(0, Math.min(c.length, total - at)), at); at += c.length; }
    const html = new TextDecoder('utf-8', { fatal: false, ignoreBOM: false }).decode(buf);

    const { title, text } = readable(html);
    if (text.length < 60) {
      /* Almost always a page that renders itself in the browser. Saying so is
         more use than handing a language model forty words and letting it
         invent the rest. */
      return no(
        'There were almost no words on that page — it is probably built in the browser rather than sent as text. Describe the client by hand, or try a page like /about.',
        url,
      );
    }
    return { ok: true, url, title, text: text.slice(0, 12_000), error: '' };
  }

  return no('That address redirects too many times.', url);
}
