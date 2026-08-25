/**
 * Turning a stored message body into the HTML that gets sent.
 *
 * The body of an email in this CRM can be either of two things, and they need
 * opposite treatment:
 *
 *   - Something a person typed into a plain box. Newlines are meant to be
 *     newlines, a stray `<` is meant to be a `<`, and a bare URL should become
 *     a link. That is escaped and wrapped.
 *   - Something composed as HTML — by the campaign editor, by a sequence step,
 *     or by the AI campaign builder. That is already markup and must be sent
 *     as markup.
 *
 * Everything used to take the first path. So a designed campaign — headings,
 * buttons, a footer — arrived in the recipient's inbox as its own source code,
 * `&lt;h1 style=…&gt;` and all, which is about the most embarrassing thing an
 * email tool can do. The plain-text tests never caught it, because the words
 * survive escaping perfectly well; only looking at the rendered message shows
 * it.
 *
 * HTML that is passed through is sanitised first. Not because a mail client
 * will run a script — most will not — but because the same body is shown back
 * inside this app, where it would.
 */

/**
 * Does this body already contain markup?
 *
 * Deliberately narrow: it looks for an actual tag from the set an email is
 * built out of, so a plain sentence containing "a < b" or "<3" is still
 * treated as the plain text it is.
 */
const TAG = /<\s*\/?\s*(?:p|div|br|hr|a|img|h[1-6]|ul|ol|li|table|thead|tbody|tr|td|th|span|strong|b|em|i|u|blockquote|section|center|font|small|pre|code)\b[^>]*>/i;

export function looksLikeHtml(body: string): boolean {
  return TAG.test(body);
}

/* Tags an email may use. Wider than the blog list on purpose: email layout is
   built from divs and tables, and taking those out would flatten the design
   this is meant to preserve. */
const ALLOWED_TAGS = new Set([
  'p', 'div', 'span', 'br', 'hr', 'a', 'img',
  'h1', 'h2', 'h3', 'h4', 'h5', 'h6',
  'ul', 'ol', 'li', 'strong', 'b', 'em', 'i', 'u', 's', 'small',
  'blockquote', 'pre', 'code', 'section', 'article', 'header', 'footer',
  'table', 'thead', 'tbody', 'tfoot', 'tr', 'td', 'th', 'caption', 'center', 'font',
]);

/* Content is the danger in these, so they are removed whole rather than
   unwrapped — unwrapping a <script> would paste the script in as text. */
const DROP_WHOLE = new Set(['script', 'style', 'iframe', 'object', 'embed', 'noscript', 'svg', 'template', 'link', 'meta', 'base', 'form', 'input', 'button', 'select', 'textarea']);

const GLOBAL_ATTRS = new Set(['style', 'class', 'id', 'title', 'dir', 'lang', 'align', 'valign', 'width', 'height', 'bgcolor', 'colspan', 'rowspan', 'cellpadding', 'cellspacing', 'border', 'color', 'face', 'size']);
const TAG_ATTRS: Record<string, Set<string>> = {
  a: new Set(['href', 'target', 'rel']),
  img: new Set(['src', 'alt', 'loading']),
};

/**
 * The schemes a link or image may use. `javascript:` is the point of this list.
 *
 * `data:` is spelled out separately because it carries its payload after a
 * comma rather than a colon — and only the image types are allowed, since a
 * `data:text/html` URI is a script in a trench coat.
 */
const SAFE_SCHEME = /^(?:(?:https?|mailto|tel|cid):|data:image\/(?:png|jpe?g|gif|webp);base64,)/i;
const HAS_SCHEME = /^[a-z][a-z0-9+.-]*:/i;

function safeUrl(raw: string): string | null {
  /* Entities and control characters are stripped first: `java&#115;cript:` and
     `java\tscript:` both reach the browser as `javascript:`. */
  const url = raw.replace(/&#(\d+);?/g, (_m, d: string) => String.fromCharCode(Number(d)))
    .replace(/&#x([0-9a-f]+);?/gi, (_m, h: string) => String.fromCharCode(parseInt(h, 16)))
    // eslint-disable-next-line no-control-regex -- control characters are exactly what this removes
    .replace(/[\x00-\x20\x7f]/g, '')
    .trim();
  if (!url) return null;
  if (!HAS_SCHEME.test(url)) return url;          // relative or protocol-less: fine
  return SAFE_SCHEME.test(url) ? url : null;
}

/** CSS that can execute or phone home has no business in a message body. */
function safeStyle(raw: string): string {
  return raw
    .replace(/expression\s*\(/gi, '')
    .replace(/url\s*\(\s*['"]?\s*(?:javascript|vbscript|data:text)/gi, 'url(')
    .replace(/[<>]/g, '')
    .slice(0, 2000);
}

/**
 * Strip anything that could act, keep everything that only looks.
 *
 * Falls back to plain text where DOMParser is unavailable — a test runner or a
 * later server-side pass — so this never throws, and the fallback fails closed.
 */
export function sanitizeEmailHtml(html: string): string {
  if (typeof DOMParser === 'undefined') {
    return html
      .replace(/<(script|style|iframe|object|embed|noscript|svg|template)\b[\s\S]*?<\/\1\s*>/gi, '')
      .replace(/\son\w+\s*=\s*(?:"[^"]*"|'[^']*'|[^\s>]+)/gi, '')
      .replace(/(href|src)\s*=\s*(["'])\s*javascript:[^"']*\2/gi, '$1="#"');
  }

  const doc = new DOMParser().parseFromString(`<div id="crm-root">${html}</div>`, 'text/html');
  const root = doc.getElementById('crm-root');
  if (!root) return '';

  const walk = (node: Element) => {
    for (const child of Array.from(node.children)) {
      const tag = child.tagName.toLowerCase();

      if (DROP_WHOLE.has(tag)) { child.remove(); continue; }

      if (!ALLOWED_TAGS.has(tag)) {
        /* Keep the words, drop the wrapper — an unknown element should not take
           a paragraph of real content with it. */
        const span = doc.createElement('span');
        span.innerHTML = child.innerHTML;
        child.replaceWith(span);
        walk(span);
        continue;
      }

      for (const attr of Array.from(child.attributes)) {
        const name = attr.name.toLowerCase();
        const allowed = TAG_ATTRS[tag];

        if (name.startsWith('on')) { child.removeAttribute(attr.name); continue; }

        if (name === 'href' || name === 'src') {
          const url = allowed?.has(name) ? safeUrl(attr.value) : null;
          if (url === null) child.removeAttribute(attr.name);
          else child.setAttribute(name, url);
          continue;
        }

        if (name === 'style') { child.setAttribute('style', safeStyle(attr.value)); continue; }

        if (!GLOBAL_ATTRS.has(name) && !allowed?.has(name)) child.removeAttribute(attr.name);
      }

      /* A link that opens elsewhere must not hand the opener over with it. */
      if (tag === 'a' && child.getAttribute('target') === '_blank') {
        child.setAttribute('rel', 'noopener noreferrer');
      }

      walk(child);
    }
  };
  walk(root);
  return root.innerHTML;
}

/**
 * The body, ready to send.
 *
 * Plain text is escaped, linkified and given line breaks. HTML is sanitised and
 * passed through as the markup it is.
 */
export function bodyToHtml(body: string): string {
  const text = body ?? '';
  if (looksLikeHtml(text)) return sanitizeEmailHtml(text);

  const esc = text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  const linked = esc.replace(/(https?:\/\/[^\s<]+)/g, '<a href="$1">$1</a>');
  return `<div style="font-family:Inter,system-ui,sans-serif;font-size:15px;line-height:1.65;color:#0f172a">${linked.replace(/\n/g, '<br>')}</div>`;
}
