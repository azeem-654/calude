/**
 * Where Autopilot publishes a blog post, when nobody is there to press the
 * button.
 *
 * ── The wall this gets over ──
 *
 * Publishing to WordPress already worked, and its credentials lived in
 * `crm_blog_targets`, a browser key. Fine for a person pressing publish and
 * useless for a cron: a scheduled run has no browser to read them from. That is
 * the same wall the mailbox hit and it has the same answer — the credential
 * moves to where the schedule can reach it, encrypted at rest with the install
 * secret, and is never returned to a browser afterwards.
 *
 * The browser's own targets are untouched. Somebody publishing by hand keeps
 * working exactly as they did.
 */
import { decryptSecret, encryptSecret } from './crypto';
import { installSecret, nowIso, type Env } from './db';
import { urlProblem, wireUrl } from './readSite';
import { pictureBytes } from './blogPictures';

export interface PublishTarget {
  kind: string;
  siteUrl: string;
  username: string;
  /** Decrypted. Only ever held in memory, inside the Worker. */
  appPassword: string;
  verifiedAt: string | null;
  lastError: string;
}

/** What a screen may be told: whether it is set up, never what it is. */
export interface PublishTargetStatus {
  connected: boolean;
  kind: string;
  siteUrl: string;
  username: string;
  verifiedAt: string | null;
  lastError: string;
}

interface Row {
  kind: string; site_url: string; username: string; app_password: string;
  verified_at: string | null; last_error: string;
}

const read = (env: Env, accountId: string) =>
  env.DB.prepare(
    `SELECT kind, site_url, username, app_password, verified_at, last_error
     FROM crm_publish_targets WHERE account_id = ? LIMIT 1`,
  ).bind(accountId).first<Row>();

/** The destination, with its password, for the tick. Null when none is set. */
export async function loadPublishTarget(env: Env, accountId: string): Promise<PublishTarget | null> {
  const row = await read(env, accountId);
  if (!row?.site_url) return null;
  let appPassword = '';
  if (row.app_password) {
    try {
      appPassword = await decryptSecret(await installSecret(env.DB, 'mailbox_key'), row.app_password);
    } catch {
      /* An unreadable password is reported as an empty one rather than as a
         crash. The caller then says "the stored password could not be read" —
         which is the actual problem and is fixable — instead of the run dying
         somewhere a customer will never see. */
      appPassword = '';
    }
  }
  return {
    kind: row.kind, siteUrl: row.site_url, username: row.username, appPassword,
    verifiedAt: row.verified_at, lastError: row.last_error,
  };
}

/** What a screen is allowed to know. */
export async function publishTargetStatus(env: Env, accountId: string): Promise<PublishTargetStatus> {
  const row = await read(env, accountId);
  return {
    connected: !!row?.site_url,
    kind: row?.kind ?? 'wordpress',
    siteUrl: row?.site_url ?? '',
    username: row?.username ?? '',
    verifiedAt: row?.verified_at ?? null,
    lastError: row?.last_error ?? '',
  };
}

/**
 * Save it.
 *
 * A blank password means "keep the stored one" — the form shows dots and cannot
 * send back what it was never given, so treating blank as "clear it" would wipe
 * the credential every time somebody corrected a typo in the username.
 *
 * Any change clears the verified stamp. Carrying a green tick across an edited
 * password shows a state somebody would trust and only discover at the moment a
 * post silently fails to publish.
 */
export async function savePublishTarget(
  env: Env, accountId: string,
  input: { kind?: string; siteUrl: string; username: string; appPassword?: string },
): Promise<{ ok: boolean; error: string }> {
  const site = input.siteUrl.trim().replace(/\/$/, '');
  if (!site) return { ok: false, error: 'The site address is needed.' };
  try {
    const u = new URL(site);
    if (u.protocol !== 'https:') return { ok: false, error: 'The site must be reachable over https.' };
  } catch { return { ok: false, error: `"${site}" is not a valid site address.` }; }
  if (!input.username.trim()) return { ok: false, error: 'The username is needed.' };

  const existing = await read(env, accountId);
  const typed = (input.appPassword ?? '').trim();
  if (!typed && !existing?.app_password) {
    return { ok: false, error: 'An application password is needed the first time.' };
  }

  const stored = typed
    ? await encryptSecret(await installSecret(env.DB, 'mailbox_key'), typed)
    : existing!.app_password;

  const now = nowIso();
  await env.DB.prepare(
    `INSERT INTO crm_publish_targets
       (id, account_id, kind, site_url, username, app_password, verified_at, last_error, created_at, updated_at)
     VALUES (?,?,?,?,?,?,NULL,'',?,?)
     ON CONFLICT (account_id, kind) DO UPDATE SET
       site_url = excluded.site_url,
       username = excluded.username,
       app_password = excluded.app_password,
       verified_at = NULL,
       last_error = '',
       updated_at = excluded.updated_at`,
  ).bind(
    `pt-${crypto.randomUUID()}`, accountId, input.kind ?? 'wordpress',
    site, input.username.trim(), stored, now, now,
  ).run();

  return { ok: true, error: '' };
}

export async function deletePublishTarget(env: Env, accountId: string): Promise<void> {
  await env.DB.prepare('DELETE FROM crm_publish_targets WHERE account_id = ?').bind(accountId).run();
}

/** Remember whether it worked, so a screen can say so without trying again. */
export async function notePublishResult(env: Env, accountId: string, ok: boolean, error: string): Promise<void> {
  await env.DB.prepare(
    'UPDATE crm_publish_targets SET verified_at = ?, last_error = ?, updated_at = ? WHERE account_id = ?',
  ).bind(ok ? nowIso() : null, ok ? '' : error.slice(0, 400), nowIso(), accountId).run();
}

/**
 * Put a post on the site.
 *
 * Returns the reason in the customer's terms when it fails. "Could not publish"
 * is not something anybody can act on; "WordPress refused it (401) — the
 * application password is wrong or has been revoked" is.
 */
export async function publishPost(
  target: PublishTarget,
  post: { title: string; html: string; excerpt: string; slug?: string; cover?: { src: string; alt: string } | null },
  env?: Env,
): Promise<{ ok: boolean; link: string; error: string; pictures: string }> {
  if (!target.appPassword) {
    return { ok: false, link: '', error: 'The stored application password could not be read. Enter it again.', pictures: '' };
  }
  let origin: string;
  try { origin = new URL(target.siteUrl).origin; }
  catch { return { ok: false, link: '', error: `"${target.siteUrl}" is not a valid site address.`, pictures: '' }; }

  /* Pictures first, so the post goes up already pointing at the site's own
     copies. Without env (no way to read a photo) the post goes as it was. */
  const pics = env
    ? await sendPicturesToWordPress(env, { base: origin, username: target.username, appPassword: target.appPassword }, post.html, post.cover ?? null, post.slug ?? post.title)
    : null;
  const html = pics?.html ?? post.html;
  const pictures = pics ? picturesNote(pics) : '';

  try {
    const r = await fetch(`${origin}/wp-json/wp/v2/posts`, {
      method: 'POST',
      headers: {
        Authorization: 'Basic ' + btoa(`${target.username}:${target.appPassword}`),
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        title: post.title.slice(0, 250),
        content: html,
        excerpt: post.excerpt.slice(0, 500),
        status: 'publish',
        ...(pics?.featuredMedia ? { featured_media: pics.featuredMedia } : {}),
      }),
    });
    const data = await r.json<{ id?: number; link?: string; message?: string }>()
      .catch(() => ({}) as { id?: number; link?: string; message?: string });
    if (r.ok) return { ok: true, link: String(data.link ?? ''), error: '', pictures };

    /* The two that actually happen, named. A 401 is a revoked password and a
       403 is usually a security plugin blocking the REST API — completely
       different fixes, and "HTTP error" sends somebody to neither. */
    const why = r.status === 401
      ? 'the application password is wrong or has been revoked'
      : r.status === 403
        ? 'WordPress refused the request — a security plugin is often blocking the REST API'
        : (data.message ?? 'no reason given');
    return { ok: false, link: '', error: `WordPress refused it (HTTP ${r.status}): ${why}`, pictures };
  } catch (e) {
    return { ok: false, link: '', error: `Could not reach that site: ${e instanceof Error ? e.message : String(e)}`, pictures };
  }
}

/* ═══ Blog Automation's sites — one per target on its Publish screen ═══════
 *
 * The Publish screen keeps its targets (address, username, where posts live)
 * in the browser, and the password here, against the browser's target id.
 * The browser sends the password once, on connect, and never again: status,
 * publish and withdraw name the target and the Worker reads the credential.
 *
 * The site is fetched through `wireUrl`, which only ever changes anything when
 * the deployment sets SITE_TEST_ORIGIN (a `wrangler dev --var`) and the host is
 * a reserved `.test` name. The https rule is checked on the address as typed,
 * so a test proves the real rule rather than a relaxed copy of it.
 */

export const BLOG_TARGET_ID = /^[\w.\-]{1,80}$/;

export interface BlogTarget {
  id: string;
  siteUrl: string;
  username: string;
  /** Decrypted. Only ever held in memory, inside the Worker. */
  appPassword: string;
  connectedAs: string;
  verifiedAt: string | null;
  lastError: string;
}

interface BlogRow {
  id: string; account_id: string; site_url: string; username: string; app_password: string;
  connected_as: string; verified_at: string | null; last_error: string;
}

/** Whose target this id is, or null when nobody has connected it yet. */
export async function blogTargetOwner(env: Env, targetId: string): Promise<string | null> {
  const row = await env.DB.prepare('SELECT account_id FROM crm_blog_publish_targets WHERE id = ?')
    .bind(targetId).first<{ account_id: string }>();
  return row?.account_id ?? null;
}

export async function loadBlogTarget(env: Env, accountId: string, targetId: string): Promise<BlogTarget | null> {
  const row = await env.DB.prepare(
    `SELECT id, account_id, site_url, username, app_password, connected_as, verified_at, last_error
     FROM crm_blog_publish_targets WHERE id = ? AND account_id = ?`,
  ).bind(targetId, accountId).first<BlogRow>();
  if (!row?.site_url) return null;
  let appPassword = '';
  /* Unreadable reads as empty, as in loadPublishTarget: the caller then says
     "enter it again", which is the fix, instead of the request dying. */
  try { appPassword = row.app_password ? await decryptSecret(await installSecret(env.DB, 'mailbox_key'), row.app_password) : ''; }
  catch { appPassword = ''; }
  return {
    id: row.id, siteUrl: row.site_url, username: row.username, appPassword,
    connectedAs: row.connected_as, verifiedAt: row.verified_at, lastError: row.last_error,
  };
}

/**
 * Store a connection that has just been proved.
 *
 * Only ever called after WordPress accepted the credentials, so the verified
 * stamp is set here rather than cleared: what is stored is exactly what was
 * checked. The upsert is scoped — an id that belongs to another account does
 * not match the WHERE and nothing is written.
 */
export async function saveBlogTarget(
  env: Env, accountId: string, targetId: string,
  input: { siteUrl: string; username: string; appPassword: string; connectedAs: string },
): Promise<string> {
  const stored = await encryptSecret(await installSecret(env.DB, 'mailbox_key'), input.appPassword);
  const now = nowIso();
  await env.DB.prepare(
    `INSERT INTO crm_blog_publish_targets
       (id, account_id, site_url, username, app_password, connected_as, verified_at, last_error, created_at, updated_at)
     VALUES (?,?,?,?,?,?,?,'',?,?)
     ON CONFLICT (id) DO UPDATE SET
       site_url = excluded.site_url, username = excluded.username, app_password = excluded.app_password,
       connected_as = excluded.connected_as, verified_at = excluded.verified_at, last_error = '',
       updated_at = excluded.updated_at
     WHERE crm_blog_publish_targets.account_id = excluded.account_id`,
  ).bind(targetId, accountId, input.siteUrl, input.username, stored, input.connectedAs.slice(0, 120), now, now, now).run();
  return now;
}

export async function deleteBlogTarget(env: Env, accountId: string, targetId: string): Promise<void> {
  await env.DB.prepare('DELETE FROM crm_blog_publish_targets WHERE id = ? AND account_id = ?').bind(targetId, accountId).run();
}

export async function noteBlogTarget(env: Env, accountId: string, targetId: string, ok: boolean, error: string): Promise<void> {
  await env.DB.prepare(
    `UPDATE crm_blog_publish_targets SET verified_at = CASE WHEN ? THEN ? ELSE verified_at END, last_error = ?, updated_at = ?
     WHERE id = ? AND account_id = ?`,
  ).bind(ok ? 1 : 0, nowIso(), ok ? '' : error.slice(0, 400), nowIso(), targetId, accountId).run();
}

/** The address a WordPress install answers on: origin plus any sub-folder. */
export function wordpressBase(raw: string): { base: string; error: string } {
  const site = raw.trim().replace(/\/+$/, '');
  if (!site) return { base: '', error: 'Enter the site address, e.g. https://example.com.' };
  let u: URL;
  try { u = new URL(site); } catch { return { base: '', error: `"${site}" is not a valid site address. It starts with https://` }; }
  if (u.protocol !== 'https:') return { base: '', error: 'The WordPress site must be reachable over https.' };
  const problem = urlProblem(site);
  if (problem) return { base: '', error: problem };
  return { base: `${u.origin}${u.pathname.replace(/\/+$/, '')}`, error: '' };
}

export type WpAnswer =
  | { ok: true; status: number; data: Record<string, unknown> }
  | { ok: false; status: number; error: string; field?: 'blog.siteUrl' | 'blog.password' };

/**
 * One request to a site's REST API, with the failure named for a person.
 *
 * Redirects are not followed: a redirect would carry the password to wherever
 * the site points (possibly http, possibly another host), and "enter the
 * address it redirects to" is the actual fix anyway.
 */
export async function wordpressCall(
  base: string, username: string, appPassword: string,
  path: string, init: { method?: string; body?: unknown } = {},
): Promise<WpAnswer> {
  let r: Response;
  try {
    r = await fetch(wireUrl(`${base}/wp-json${path}`), {
      method: init.method ?? 'GET',
      redirect: 'manual',
      headers: {
        Authorization: 'Basic ' + btoa(`${username}:${appPassword}`),
        Accept: 'application/json',
        ...(init.body !== undefined ? { 'Content-Type': 'application/json' } : {}),
      },
      body: init.body !== undefined ? JSON.stringify(init.body) : undefined,
    });
  } catch (e) {
    return { ok: false, status: 0, field: 'blog.siteUrl', error: `Could not reach ${base}: ${e instanceof Error ? e.message : String(e)}` };
  }
  if (r.status >= 300 && r.status < 400) {
    const to = r.headers.get('Location') ?? '';
    return { ok: false, status: r.status, field: 'blog.siteUrl', error: `${base} redirects${to ? ` to ${to}` : ' elsewhere'} — enter the address it ends up on.` };
  }
  const data = await r.json<Record<string, unknown>>().catch(() => null);
  if (r.ok && data && typeof data === 'object') return { ok: true, status: r.status, data };
  if (r.ok) return { ok: false, status: r.status, field: 'blog.siteUrl', error: `${base} did not answer like a WordPress site. Check the address.` };

  const said = data && typeof data.message === 'string' ? String(data.message).replace(/<[^>]+>/g, '').slice(0, 200) : '';
  /* The common ones, named — a wrong password, a plugin blocking the API and
     an address that is not WordPress need three different fixes. */
  if (r.status === 401) {
    return { ok: false, status: 401, field: 'blog.password', error: 'Wrong username or application password — WordPress refused them (HTTP 401). Use an application password from Users → Profile → Application Passwords, not the login password.' };
  }
  if (r.status === 403) {
    return { ok: false, status: 403, error: `WordPress refused the request (HTTP 403)${said ? `: ${said}` : ''}. That user may not be allowed to publish, or a security plugin is blocking the REST API.` };
  }
  if (r.status === 404 && path.startsWith('/wp/v2/users/me')) {
    return { ok: false, status: 404, field: 'blog.siteUrl', error: `${base} did not answer as a WordPress site (no REST API at /wp-json/). Check the address.` };
  }
  return { ok: false, status: r.status, error: `WordPress refused it (HTTP ${r.status})${said ? `: ${said}` : ''}.` };
}

/** Proved by asking WordPress who we are — it needs exactly the access a post needs and leaves nothing behind. */
export async function verifyWordPress(base: string, username: string, appPassword: string):
  Promise<{ ok: true; connectedAs: string } | { ok: false; error: string; field?: 'blog.siteUrl' | 'blog.password' }> {
  const r = await wordpressCall(base, username, appPassword, '/wp/v2/users/me?context=edit');
  if (!r.ok) return { ok: false, error: r.error, field: r.field };
  if (r.data.id === undefined) return { ok: false, field: 'blog.siteUrl', error: `${base} did not answer as a WordPress site. Check the address.` };
  return { ok: true, connectedAs: String(r.data.name || r.data.slug || username) };
}

/* ═══ Pictures into the WordPress media library ═══════════════════════════
 *
 * A post's pictures are this app's: a cover drawn in Blog Automation (a data
 * URL) or a free photo served through /api/media.php. Left like that, WordPress
 * strips a data URL from a post by anyone without `unfiltered_html`, and a
 * hot-linked photo is not in the site's own library, cannot be a featured
 * image and disappears from the post if this app is ever disconnected. So each
 * is uploaded, the post's `src` is rewritten to WordPress's copy, and the cover
 * becomes `featured_media` — the picture themes show on the post, the archive
 * and the share card.
 *
 * A picture that will not upload never stops the post: it keeps its original
 * address (a photo still shows; it is just not in their library) and the
 * result names it as a partial.
 */

type WpAuth = { base: string; username: string; appPassword: string };

/** A short, stable name for these bytes, so publishing again finds the copy already uploaded. */
async function shortHash(bytes: Uint8Array): Promise<string> {
  const d = new Uint8Array(await crypto.subtle.digest('SHA-256', bytes));
  return Array.from(d.slice(0, 5), b => b.toString(16).padStart(2, '0')).join('');
}

const fileSlug = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 50) || 'post';

/** One picture into the media library, with its alt text. */
export async function wordpressUpload(
  wp: WpAuth,
  file: { bytes: Uint8Array; type: string; filename: string; alt: string; caption?: string },
): Promise<{ ok: true; id: number; url: string } | { ok: false; error: string }> {
  const qs = new URLSearchParams({ alt_text: file.alt.slice(0, 250) });
  if (file.caption) qs.set('caption', file.caption.slice(0, 400));
  let r: Response;
  try {
    r = await fetch(wireUrl(`${wp.base}/wp-json/wp/v2/media?${qs}`), {
      method: 'POST',
      redirect: 'manual',
      headers: {
        Authorization: 'Basic ' + btoa(`${wp.username}:${wp.appPassword}`),
        Accept: 'application/json',
        'Content-Type': file.type,
        /* WordPress names the file, and checks its type, from this header — without it the upload is refused. */
        'Content-Disposition': `attachment; filename="${file.filename.replace(/["\\\r\n]/g, '')}"`,
      },
      body: file.bytes,
    });
  } catch (e) {
    return { ok: false, error: `could not reach the site (${e instanceof Error ? e.message : String(e)})` };
  }
  const data = await r.json<Record<string, unknown>>().catch(() => null);
  if (r.ok && data && typeof data.id === 'number') {
    /* Some installs ignore alt_text on the upload itself; set it again rather than leave a picture a screen reader cannot describe. */
    if (file.alt && !String(data.alt_text ?? '').trim()) {
      await wordpressCall(wp.base, wp.username, wp.appPassword, `/wp/v2/media/${data.id}`, { method: 'POST', body: { alt_text: file.alt.slice(0, 250) } });
    }
    return { ok: true, id: data.id, url: String(data.source_url ?? '') };
  }
  const said = data && typeof data.message === 'string' ? String(data.message).replace(/<[^>]+>/g, '').slice(0, 160) : '';
  const why = r.status === 401 || r.status === 403
    ? 'this WordPress user may not upload files (it needs to be an Author or above)'
    : r.status === 413 ? 'the picture is larger than the site accepts'
      : said || `HTTP ${r.status}`;
  return { ok: false, error: why };
}

/** A copy uploaded by an earlier publish of the same picture, if the library still has it. */
async function alreadyUploaded(wp: WpAuth, hash: string): Promise<{ id: number; url: string } | null> {
  const r = await wordpressCall(wp.base, wp.username, wp.appPassword, `/wp/v2/media?search=${hash}&per_page=10`);
  if (!r.ok || !Array.isArray(r.data)) return null;
  const hit = (r.data as Record<string, unknown>[]).find(m => typeof m.id === 'number' && String(m.source_url ?? '').includes(hash));
  return hit ? { id: hit.id as number, url: String(hit.source_url ?? '') } : null;
}

export interface WpPictures { html: string; featuredMedia: number | null; sent: number; failed: string[] }

export function picturesNote(p: WpPictures): string {
  if (!p.sent && !p.failed.length) return '';
  const sent = p.sent ? `${p.sent} picture${p.sent === 1 ? '' : 's'} added to the WordPress media library${p.featuredMedia ? ', the cover as the featured image' : ''}` : '';
  const bad = p.failed.length ? `${p.failed.length} could not be uploaded (${p.failed.join('; ')})` : '';
  return [sent, bad].filter(Boolean).join('; ') + '.';
}

/**
 * Upload every picture of ours in `html` and the cover, and return the html
 * pointing at WordPress's copies.
 *
 * At most six: a post with more is unusual, and each is a request inside a run
 * that has others to make.
 */
export async function sendPicturesToWordPress(
  env: Env, wp: WpAuth, html: string, cover: { src: string; alt: string } | null, name: string,
): Promise<WpPictures> {
  const out: WpPictures = { html, featuredMedia: null, sent: 0, failed: [] };
  const tags = [...html.matchAll(/<img\b[^>]*>/gi)].map(m => m[0]);
  const srcOf = (tag: string) => (/\ssrc="([^"]+)"/i.exec(tag)?.[1] ?? '');
  const altOf = (tag: string) => (/\salt="([^"]*)"/i.exec(tag)?.[1] ?? '').replace(/&quot;/g, '"').replace(/&amp;/g, '&');
  const jobs: { src: string; alt: string; cover: boolean }[] = [];
  if (cover?.src) jobs.push({ src: cover.src, alt: cover.alt, cover: true });
  for (const tag of tags) {
    const src = srcOf(tag);
    if (src && !jobs.some(j => j.src === src)) jobs.push({ src, alt: altOf(tag), cover: false });
  }

  const done = new Map<string, { id: number; url: string }>();
  let n = 0;
  for (const job of jobs.slice(0, 6)) {
    const got = await pictureBytes(env, job.src.replace(/&amp;/g, '&'));
    if (!got) continue;
    const label = job.cover ? 'the cover' : `“${job.alt.slice(0, 40) || 'a picture'}”`;
    if (!got.ok) { out.failed.push(`${label}: ${got.reason}`); continue; }
    const hash = await shortHash(got.bytes);
    const found = await alreadyUploaded(wp, hash);
    const up = found ? { ok: true as const, ...found }
      : await wordpressUpload(wp, { bytes: got.bytes, type: got.type, filename: `${fileSlug(name)}-${hash}.${got.ext}`, alt: job.alt });
    if (!up.ok) { out.failed.push(`${label}: ${up.error}`); continue; }
    n++;
    done.set(job.src, { id: up.id, url: up.url });
    if (job.cover) out.featuredMedia = up.id;
  }
  out.sent = n;

  /* The class is how WordPress recognises its own attachment in a post: with
     it, the site adds responsive sizes and lazy loading to the picture. */
  out.html = html.replace(/<img\b[^>]*>/gi, tag => {
    const hit = done.get(srcOf(tag));
    if (!hit?.url) return tag;
    const t = tag.replace(/\ssrc="[^"]+"/i, ` src="${hit.url}"`);
    return /\sclass="/i.test(t) ? t.replace(/\sclass="([^"]*)"/i, ` class="$1 wp-image-${hit.id}"`) : t.replace(/^<img\b/i, `<img class="wp-image-${hit.id}"`);
  });
  return out;
}
