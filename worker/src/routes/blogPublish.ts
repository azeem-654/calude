/**
 * Blog Automation → the customer's WordPress site (`/api/blog-publish.php`).
 *
 * Actions: `connect`, `status`, `disconnect`, `publish`, `withdraw`, each
 * naming the browser's `targetId`.
 *
 * ── Why it was rebuilt ──
 *
 * The browser sent `{action:'connect', password, targetId}` and this route
 * ignored `action` and wanted `appPassword` on every call, so connect, status,
 * publish and withdraw all answered "Connect a WordPress site first" and
 * nothing was ever published (audit C-1). The fix is not to have the browser
 * send the password on every publish: it is sent once, on `connect`, proved
 * against WordPress, stored encrypted against the target and never returned.
 * Everything after names the target and the Worker reads the credential.
 *
 * It lived in misc.ts; it has its own file so the SMS routes there and this
 * can change without stepping on each other.
 */
import { body, fail, headerSafe, json } from '../lib/http';
import { denyForeignWorkspace, requireSessionForSocket, storageWorkspace, type Env } from '../lib/db';
import { gate as contentGate } from '../lib/contentGate';
import { adoptSiteTestOrigin } from '../lib/readSite';
import {
  BLOG_TARGET_ID, blogTargetOwner, deleteBlogTarget, loadBlogTarget, noteBlogTarget,
  saveBlogTarget, verifyWordPress, wordpressBase, wordpressCall,
} from '../lib/publishTarget';

interface Req {
  action?: string; token?: string; accountId?: string; targetId?: string;
  siteUrl?: string; username?: string; password?: string;
  title?: string; html?: string; content?: string; excerpt?: string; slug?: string;
  status?: string; date?: string; remoteId?: string | number;
}

/** WordPress takes `date_gmt` without a zone or milliseconds. */
const wpGmt = (iso: string): string | null => {
  const t = Date.parse(iso);
  return Number.isFinite(t) ? new Date(t).toISOString().slice(0, 19) : null;
};

export async function handleBlogPublish(req: Request, env: Env): Promise<Response> {
  const d = await body<Req>(req);
  const gate = await requireSessionForSocket(env.DB, d.token);
  if ('denied' in gate) return gate.denied;
  /* requireSessionForSocket lets an install with no users through. Nothing is
     stored for nobody: a credential needs an account to belong to. */
  if (!gate.user) return fail('Sign in again — publishing needs a current session.', 401);
  const acct = String(d.accountId ?? '').trim();
  if (!acct) return fail('No workspace is active yet. Open one, then connect the site.');
  const foreign = await denyForeignWorkspace(env.DB, gate.user, acct, { allowReserved: true });
  if (foreign) return foreign;
  const account = storageWorkspace(gate.user, acct);

  const targetId = String(d.targetId ?? '').trim();
  if (!BLOG_TARGET_ID.test(targetId)) return fail('This request did not say which site. Reload the page and try again.');
  /* Ids are primary keys across every tenant. A target another account has
     connected is refused before anything about it is read or overwritten. */
  const owner = await blogTargetOwner(env, targetId);
  if (owner && owner !== account) return fail('That site is connected to another workspace.', 403, { code: 'not_yours' });

  adoptSiteTestOrigin(env);
  const action = String(d.action ?? '');

  if (action === 'connect') {
    const { base, error } = wordpressBase(String(d.siteUrl ?? ''));
    if (error) return fail(error, 200, { field: 'blog.siteUrl' });
    const username = String(d.username ?? '').trim();
    if (!username) return fail('Enter the WordPress username the posts are published as.', 200, { field: 'blog.username' });
    if (/[:\r\n]/.test(username)) return fail('A WordPress username cannot contain a colon or a line break.', 200, { field: 'blog.username' });

    /* Blank keeps the stored password — the form shows dots and cannot send
       back what it was never given, so correcting the username must not need
       the password retyped. */
    let appPassword = String(d.password ?? '').trim();
    if (!appPassword) {
      appPassword = (await loadBlogTarget(env, account, targetId))?.appPassword ?? '';
      if (!appPassword) return fail('Enter the application password from WordPress → Users → Profile → Application Passwords.', 200, { field: 'blog.password' });
    }

    const v = await verifyWordPress(base, username, appPassword);
    if (!v.ok) {
      await noteBlogTarget(env, account, targetId, false, v.error);
      return fail(v.error, 200, v.field ? { field: v.field } : {});
    }
    const verifiedAt = await saveBlogTarget(env, account, targetId, { siteUrl: base, username, appPassword, connectedAs: v.connectedAs });
    return json({
      success: true, connected: true, connectedAs: v.connectedAs, verifiedAt, siteUrl: base, username,
      message: `Connected to ${base} as ${v.connectedAs}.`,
    });
  }

  if (action === 'disconnect') {
    await deleteBlogTarget(env, account, targetId);
    return json({ success: true, connected: false, message: 'Disconnected. The stored password has been deleted.' });
  }

  const target = await loadBlogTarget(env, account, targetId);

  /* "Check connection" asks WordPress, rather than reporting the last stamp:
     a password revoked yesterday still has yesterday's green tick. */
  if (action === 'status') {
    if (!target) return json({ success: true, connected: false, stored: false });
    const v = target.appPassword
      ? await verifyWordPress(target.siteUrl, target.username, target.appPassword)
      : { ok: false as const, error: 'The stored application password could not be read. Enter it again.' };
    await noteBlogTarget(env, account, targetId, v.ok, v.ok ? '' : v.error);
    return json({
      success: true, stored: true, connected: v.ok,
      siteUrl: target.siteUrl, username: target.username,
      connectedAs: v.ok ? v.connectedAs : target.connectedAs,
      verifiedAt: v.ok ? new Date().toISOString() : target.verifiedAt,
      error: v.ok ? undefined : v.error,
    });
  }

  if (action !== 'publish' && action !== 'withdraw') {
    return fail(`"${action}" is not something this endpoint does.`);
  }
  if (!target) return fail('Connect this WordPress site first — Save and connect, with an application password.');
  if (!target.appPassword) return fail('The stored application password could not be read. Enter it again and connect.');

  if (action === 'withdraw') {
    const remoteId = String(d.remoteId ?? '').trim();
    if (!/^\d{1,12}$/.test(remoteId)) return fail('There is no record of this post on that site.');
    /* Back to draft, never deleted: taking a post down must be undoable. */
    const r = await wordpressCall(target.siteUrl, target.username, target.appPassword, `/wp/v2/posts/${remoteId}`, { method: 'POST', body: { status: 'draft' } });
    if (!r.ok) {
      await noteBlogTarget(env, account, targetId, false, r.error);
      return fail(r.error);
    }
    return json({ success: true, remoteId, state: 'withdrawn', message: 'Taken down — it is a draft on the site now.' });
  }

  /*
   * Screened before it reaches WordPress, not after.
   *
   * It is the customer's own site, which is exactly why this matters: a post
   * published there carries a domain this platform sold them, mail this
   * platform sends, and in the managed case an address on our registrar
   * account. "It is their site" stops being a defence at that point.
   */
  const html = String(d.html ?? d.content ?? '');
  const verdict = await contentGate(env, acct, 'blog', `${d.title ?? ''}\n\n${d.excerpt ?? ''}\n\n${html}`);
  if (!verdict.ok) {
    return json({ success: false, held: verdict.verdict === 'review', message: verdict.message, error: verdict.message });
  }

  const title = headerSafe(d.title, 250);
  if (!title) return fail('The post needs a title.');
  const status = d.status === 'future' ? 'future' : d.status === 'draft' ? 'draft' : 'publish';
  const post: Record<string, unknown> = {
    title,
    content: html,
    excerpt: String(d.excerpt ?? '').slice(0, 500),
    status,
  };
  const slug = String(d.slug ?? '').trim().toLowerCase().replace(/[^a-z0-9-]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 190);
  if (slug) post.slug = slug;
  if (status === 'future') {
    const at = wpGmt(String(d.date ?? ''));
    if (!at) return fail('A scheduled post needs a date.');
    post.date_gmt = at;
  }

  /* A post already on the site is updated in place — a second copy would
     compete with the first for the same search phrase. If it has been deleted
     over there, it is created again rather than reported as a failure. */
  const remoteId = String(d.remoteId ?? '').trim();
  let r = /^\d{1,12}$/.test(remoteId)
    ? await wordpressCall(target.siteUrl, target.username, target.appPassword, `/wp/v2/posts/${remoteId}`, { method: 'POST', body: post })
    : null;
  if (!r || (!r.ok && r.status === 404)) {
    r = await wordpressCall(target.siteUrl, target.username, target.appPassword, '/wp/v2/posts', { method: 'POST', body: post });
  }
  if (!r.ok) {
    await noteBlogTarget(env, account, targetId, false, r.error);
    return fail(r.error);
  }
  await noteBlogTarget(env, account, targetId, true, '');
  return json({
    success: true,
    remoteId: r.data.id,
    url: typeof r.data.link === 'string' ? r.data.link : '',
    state: status === 'future' ? 'scheduled' : status === 'draft' ? 'draft' : 'live',
    message: status === 'future' ? 'Scheduled on WordPress.' : 'Published to WordPress.',
  });
}
