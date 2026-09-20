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
  post: { title: string; html: string; excerpt: string },
): Promise<{ ok: boolean; link: string; error: string }> {
  if (!target.appPassword) {
    return { ok: false, link: '', error: 'The stored application password could not be read. Enter it again.' };
  }
  let origin: string;
  try { origin = new URL(target.siteUrl).origin; }
  catch { return { ok: false, link: '', error: `"${target.siteUrl}" is not a valid site address.` }; }

  try {
    const r = await fetch(`${origin}/wp-json/wp/v2/posts`, {
      method: 'POST',
      headers: {
        Authorization: 'Basic ' + btoa(`${target.username}:${target.appPassword}`),
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        title: post.title.slice(0, 250),
        content: post.html,
        excerpt: post.excerpt.slice(0, 500),
        status: 'publish',
      }),
    });
    const data = await r.json<{ id?: number; link?: string; message?: string }>()
      .catch(() => ({}) as { id?: number; link?: string; message?: string });
    if (r.ok) return { ok: true, link: String(data.link ?? ''), error: '' };

    /* The two that actually happen, named. A 401 is a revoked password and a
       403 is usually a security plugin blocking the REST API — completely
       different fixes, and "HTTP error" sends somebody to neither. */
    const why = r.status === 401
      ? 'the application password is wrong or has been revoked'
      : r.status === 403
        ? 'WordPress refused the request — a security plugin is often blocking the REST API'
        : (data.message ?? 'no reason given');
    return { ok: false, link: '', error: `WordPress refused it (HTTP ${r.status}): ${why}` };
  } catch (e) {
    return { ok: false, link: '', error: `Could not reach that site: ${e instanceof Error ? e.message : String(e)}` };
  }
}
