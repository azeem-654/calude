/**
 * Websites and funnels on the open web — `/s/<slug>` (audit H3/H4).
 *
 * "Published" used to be a flag in the account's synced storage. The page a
 * visitor could reach (/preview/<id>) read the browser's own copy of that
 * storage, so anybody without a session met the sign-in screen and the
 * builders' "Custom Domain" boxes were wired to nothing.
 *
 * ── Why publishing reads the account's storage, not the request ──
 *
 * `publish` names a site or funnel by id and the Worker reads it from the
 * workspace's stored `crm_websites` / `crm_funnels` (the same rows the data
 * route writes). Content sent in the request would let a caller publish
 * anything under any name; reading it here means a page can only ever be
 * something its owner saved. The browser flushes its pending writes first
 * (`flushNow`) so "Publish changes" carries the last edit.
 *
 * ── Tenancy ──
 *
 * Every signed-in action checks the workspace (`workspaceAccess`, reserved
 * bucket allowed like the data route) and addresses rows by the storage id.
 * `unpublish` deletes only `WHERE account_id = <caller's storage id>`, so a
 * foreign item id deletes nothing. The public `get` takes a slug alone and
 * never a workspace: the slug maps to exactly one row.
 *
 * ── What the public copy may hold ──
 *
 * The snapshot is scrubbed of script-bearing URLs (`javascript:`,
 * `vbscript:`, `data:` other than pictures) because it renders on the app's
 * own origin, where a signed-in visitor's cookie session lives. React 19
 * blocks `javascript:` hrefs itself; this does not rely on that alone.
 */
import { body, fail, json } from '../lib/http';
import { dataGet, nowIso, storageWorkspace, userFromToken, workspaceAccess, type Env } from '../lib/db';
import { rateLimit } from '../lib/rateLimit';

interface Req {
  action?: string;
  token?: string;
  accountId?: string;
  kind?: string;
  id?: string;
  slug?: string;
}

type Kind = 'site' | 'funnel';
const STORE: Record<Kind, string> = { site: 'crm_websites', funnel: 'crm_funnels' };

const ACCOUNT_OK = /^[A-Za-z0-9_.-]{1,64}$/;
const ITEM_OK = /^[A-Za-z0-9_.\-:]{1,120}$/;
const SLUG_OK = /^[a-z0-9](?:[a-z0-9-]{0,62}[a-z0-9])?$/;
/* Under D1's 2 MB row cap with room for the other columns. A site this big
   is almost always pictures pasted in as data URLs; the refusal says so. */
const MAX_PAGES_BYTES = 1_500_000;

/** A string that would run script, or load a document, where a link or frame expects a URL. */
const UNSAFE_URL = /^(?:javascript|vbscript|data(?!:image\/(?:png|jpe?g|gif|webp|avif);))\s*:/i;

/* Fields that hold a link, a picture or a frame. Only these are checked, so
   ordinary words that happen to start "Data:" or "JavaScript:" in a heading
   are left alone; an array (gallery pictures) inherits its field's name. */
const URL_FIELD = /url|href|link|src|image|img|avatar|gallery|redirect|logo|video|icon|bg|background/i;

/** Copy of a parsed JSON value with every unsafe URL emptied. Depth-bounded. */
function scrub(v: unknown, field = '', depth = 0): unknown {
  if (depth > 40) return null;
  if (typeof v === 'string') {
    if (!URL_FIELD.test(field)) return v;
    /* Browsers ignore tabs, newlines and leading spaces inside a scheme
       ("java\tscript:"), so the check is made on the string without them. */
    return UNSAFE_URL.test(v.replace(/[\s\p{Cc}]+/gu, '')) ? '' : v;
  }
  if (Array.isArray(v)) return v.map(x => scrub(x, field, depth + 1));
  if (v && typeof v === 'object') {
    const out: Record<string, unknown> = {};
    for (const [k, x] of Object.entries(v as Record<string, unknown>)) out[k] = scrub(x, k, depth + 1);
    return out;
  }
  return v;
}

function parseOr(raw: string | null, fallback: unknown): unknown {
  if (raw == null) return fallback;
  try { return JSON.parse(raw); } catch { return fallback; }
}

const str = (v: unknown, max: number) => (typeof v === 'string' ? v.trim().slice(0, max) : '');

/** The pages as a visitor needs them: only the fields BlockRender reads. */
function publicPages(raw: unknown): Array<Record<string, unknown>> {
  if (!Array.isArray(raw)) return [];
  return raw
    .filter((p): p is Record<string, unknown> => !!p && typeof p === 'object')
    .slice(0, 50)
    .map((p, i) => ({
      id: str(p.id, 80) || `p${i}`,
      name: str(p.name, 80) || `Page ${i + 1}`,
      type: str(p.type, 20) || 'custom',
      slug: str(p.slug, 80),
      blocks: Array.isArray(p.blocks) ? withoutPlaceholders(scrub(p.blocks) as unknown[]) : [],
    }));
}

/**
 * Review slots the customer never filled ("Paste a real review here…",
 * `placeholder: true`) are the builder's prompt, not content: on the public
 * page they would read as reviews nobody gave (audit M7). The slots go, and a
 * reviews section left with none goes with them.
 */
function withoutPlaceholders(blocks: unknown[]): unknown[] {
  return blocks.flatMap(b => {
    if (!b || typeof b !== 'object') return [];
    const blk = b as Record<string, unknown>;
    if (blk.type !== 'testimonials') return [blk];
    const settings = (blk.settings && typeof blk.settings === 'object' ? blk.settings : {}) as Record<string, unknown>;
    const items = Array.isArray(settings.testimonialItems) ? settings.testimonialItems : [];
    const real = items.filter(t => t && typeof t === 'object' && !(t as Record<string, unknown>).placeholder);
    return real.length ? [{ ...blk, settings: { ...settings, testimonialItems: real } }] : [];
  });
}

/** An address from the name: lower-case words joined by hyphens, never empty. */
function slugBase(name: string): string {
  const s = name.normalize('NFKD').replace(/[̀-ͯ]/g, '').toLowerCase()
    .replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 48).replace(/-+$/, '');
  return s.length >= 3 ? s : `page-${s || 'site'}`.replace(/-+$/, '');
}
const tail = () => Math.random().toString(36).slice(2, 6).padEnd(4, '0');

interface Row { slug: string; kind: string; item_id: string; name: string; views: number; published_at: string; updated_at: string }

export async function handlePublished(req: Request, env: Env): Promise<Response> {
  const d = await body<Req>(req);
  const action = String(d.action ?? '');

  /* ── The visitor ── */
  if (action === 'get') {
    const slug = String(d.slug ?? '').trim().toLowerCase();
    if (!SLUG_OK.test(slug)) return fail('There is no page at this address.', 200, { code: 'not_found' });
    const ip = req.headers.get('CF-Connecting-IP') ?? 'unknown';
    /* Generous: a page load is one call. It bounds what one address can do to
       the view count and to the database, nothing more. */
    const limit = await rateLimit(env, { what: 'public-page', who: ip, max: 600, windowSeconds: 600 });
    if (!limit.allowed) return fail('Too many requests from this connection. Try again shortly.', 429);
    const row = await env.DB.prepare('SELECT kind, name, pages, seo, updated_at FROM crm_public_pages WHERE slug = ?')
      .bind(slug).first<{ kind: string; name: string; pages: string; seo: string; updated_at: string }>();
    if (!row) return fail('There is no page at this address.', 200, { code: 'not_found' });
    await env.DB.prepare('UPDATE crm_public_pages SET views = views + 1 WHERE slug = ?').bind(slug).run();
    return json({ success: true, page: { kind: row.kind, name: row.name, pages: parseOr(row.pages, []), seo: parseOr(row.seo, {}), updatedAt: row.updated_at } });
  }

  /* Checked before the workspace: reaching an unowned workspace claims it,
     and a misspelt action must not do that (the data route's rule). */
  if (!['publish', 'unpublish', 'status'].includes(action)) {
    return fail(`"${action}" is not something this endpoint does.`);
  }

  const user = await userFromToken(env.DB, d.token);
  if (!user) return fail('Sign in again — this action needs a current session.', 401, { code: 'unauthorised' });
  const accountId = String(d.accountId ?? '').trim();
  if (!ACCOUNT_OK.test(accountId)) return fail('A valid account id is required.');
  const access = await workspaceAccess(env.DB, user, accountId, { allowReserved: true });
  if (!access.ok) return fail(access.message ?? 'That workspace is not yours.', 403, { code: access.code });
  const ws = storageWorkspace(user, accountId);

  if (action === 'status') {
    const { results } = await env.DB.prepare(
      'SELECT slug, kind, item_id, name, views, published_at, updated_at FROM crm_public_pages WHERE account_id = ? ORDER BY published_at',
    ).bind(ws).all<Row>();
    return json({
      success: true,
      pages: (results ?? []).map(r => ({
        kind: r.kind, itemId: r.item_id, slug: r.slug, name: r.name, views: r.views,
        publishedAt: r.published_at, updatedAt: r.updated_at,
      })),
    });
  }

  const kind = d.kind === 'site' || d.kind === 'funnel' ? d.kind : null;
  if (!kind) return fail('Say whether this is a website or a funnel.');
  const itemId = String(d.id ?? '').trim();
  if (!ITEM_OK.test(itemId)) return fail('That website or funnel id is not valid.');

  if (action === 'unpublish') {
    const res = await env.DB.prepare('DELETE FROM crm_public_pages WHERE account_id = ? AND kind = ? AND item_id = ?')
      .bind(ws, kind, itemId).run();
    return json({ success: true, removed: res.meta?.changes ?? 0 });
  }

  /* ── publish ── */
  const items = parseOr(await dataGet(env.DB, ws, STORE[kind]), []);
  const item = Array.isArray(items)
    ? (items as Array<Record<string, unknown>>).find(x => x && typeof x === 'object' && String(x.id ?? '') === itemId)
    : undefined;
  if (!item) {
    return fail(kind === 'site'
      ? 'That website is not saved to your account yet. Save it, wait a moment and try again.'
      : 'That funnel is not saved to your account yet. Save it, wait a moment and try again.', 200, { code: 'not_saved' });
  }

  const pages = publicPages(item.pages);
  if (!pages.some(p => Array.isArray(p.blocks) && p.blocks.length > 0)) {
    return fail(`This ${kind === 'site' ? 'website' : 'funnel'} has nothing on its pages yet — add a section before publishing.`, 200, { code: 'empty' });
  }
  const pagesJson = JSON.stringify(pages);
  if (new TextEncoder().encode(pagesJson).length > MAX_PAGES_BYTES) {
    return fail('This is too large to publish (over 1.5 MB). Pictures pasted straight into the page are the usual cause — upload them to the Media Center and use their links instead.', 200, { code: 'too_large' });
  }
  const name = str(item.name, 120) || (kind === 'site' ? 'Website' : 'Funnel');
  const seo = scrub(kind === 'site'
    ? { title: str(item.seoTitle, 120), description: str(item.seoDescription, 320), keywords: str(item.seoKeywords, 300), image: str(item.ogImage, 600) }
    : { title: '', description: str(item.goal, 320), keywords: '', image: '' });
  const now = nowIso();

  const existing = await env.DB.prepare('SELECT slug, published_at FROM crm_public_pages WHERE account_id = ? AND kind = ? AND item_id = ?')
    .bind(ws, kind, itemId).first<{ slug: string; published_at: string }>();
  if (existing) {
    await env.DB.prepare('UPDATE crm_public_pages SET name = ?, pages = ?, seo = ?, updated_at = ? WHERE slug = ? AND account_id = ?')
      .bind(name, pagesJson, JSON.stringify(seo), now, existing.slug, ws).run();
    return json({ success: true, slug: existing.slug, publishedAt: existing.published_at, updatedAt: now, republished: true });
  }

  /* A new address. Taken by anybody (this account included) → a short tail;
     the unique primary key is what actually decides, so a race between two
     publishes of the same name loses cleanly and tries the next one. */
  const base = slugBase(name);
  for (let i = 0; i < 6; i++) {
    const slug = i === 0 ? base : `${base.slice(0, 43)}-${tail()}`;
    try {
      await env.DB.prepare(
        `INSERT INTO crm_public_pages (slug, account_id, kind, item_id, name, pages, seo, views, published_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, 0, ?, ?)`,
      ).bind(slug, ws, kind, itemId, name, pagesJson, JSON.stringify(seo), now, now).run();
      return json({ success: true, slug, publishedAt: now, updatedAt: now, republished: false });
    } catch (e) {
      /* The same item published at the same moment from another tab: the
         (account, kind, item) index refused it, so it is already live. */
      const again = await env.DB.prepare('SELECT slug, published_at FROM crm_public_pages WHERE account_id = ? AND kind = ? AND item_id = ?')
        .bind(ws, kind, itemId).first<{ slug: string; published_at: string }>();
      if (again) return json({ success: true, slug: again.slug, publishedAt: again.published_at, updatedAt: now, republished: true });
      if (!/UNIQUE|constraint/i.test(String(e))) throw e;
    }
  }
  return fail('Could not find a free address for this name. Rename it slightly and publish again.');
}
