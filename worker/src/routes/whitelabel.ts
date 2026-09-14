/**
 * /api/whitelabel.php — a reseller's clients sign in at the reseller's address.
 *
 * ── The one public action, and why it is safe ──
 *
 * `resolve` takes a hostname and answers with a workspace id and three branding
 * fields. It runs with **no session**, because it has to: a visitor arriving at
 * `app.theiragency.com` needs the right logo painted before anybody knows who
 * they are.
 *
 * That makes it the most exposed query in the app, so it is also the most
 * boring one. A single indexed read of a table that holds nothing but a name,
 * a colour and a logo URL — copied there deliberately rather than joined to the
 * workspace's own data, which is a blob a browser can write and which contains
 * everything else about a customer. An anonymous caller can learn that a
 * hostname exists and what it is called. That is what the login page displays
 * to them anyway.
 *
 * ── Why a reseller cannot claim any hostname they like ──
 *
 * A hostname is the primary key, so the first workspace to claim one owns it,
 * and a second is refused. Reserved names — the deployment's own hostnames —
 * are refused outright, because a reseller who claimed `app.protectedcentral.com`
 * would have every visitor to the product land in their workspace.
 */
import { body, fail, json, ok } from '../lib/http';
import {
  nowIso, userFromToken, workspaceAccess,
  type Env, type SessionUser,
} from '../lib/db';
import {
  checkCustomHostname, cnameTarget, createCustomHostname,
  deleteCustomHostname, saasCreds, saveSaasCreds,
} from '../lib/cloudflareSaas';

interface Req {
  token?: string;
  accountId?: string;
  action?: string;
  [k: string]: unknown;
}

const isOwner = (u: SessionUser) => u.accountId === null && u.role === 'agency';

function parse<T>(raw: string | null | undefined, fallback: T): T {
  if (!raw) return fallback;
  try { return JSON.parse(raw) as T; } catch { return fallback; }
}

/**
 * Hostnames nobody may claim.
 *
 * The deployment's own names, obviously. Also `www` and the apex of the
 * marketing site — a reseller owning either would replace the public site with
 * their own login screen for every visitor.
 */
const RESERVED = new Set([
  'protectedcentral.com',
  'www.protectedcentral.com',
  'app.protectedcentral.com',
  'localhost',
]);

/** The suffix a free subdomain lives under. */
const SUBDOMAIN_SUFFIX = 'protectedcentral.com';

/** Lower-case, no port, no trailing dot, no scheme. Applied to everything. */
function cleanHost(raw: unknown): string {
  return String(raw ?? '')
    .trim().toLowerCase()
    .replace(/^https?:\/\//, '')
    .replace(/\/.*$/, '')
    .replace(/:\d+$/, '')
    .replace(/\.$/, '');
}

const HOST_OK = /^[a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?(\.[a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?)+$/;

export async function handleWhitelabel(req: Request, env: Env): Promise<Response> {
  const d = await body<Req>(req);
  const act = String(d.action ?? '').trim();

  /* ── Public: whose address is this? ───────────────────────────────────── */

  if (act === 'resolve') {
    const hostname = cleanHost(d.hostname);
    if (!hostname) return json({ success: true, match: null });

    const row = await env.DB.prepare(
      `SELECT d.account_id AS accountId, d.kind, d.status,
              COALESCE(b.app_name, '') AS appName,
              COALESCE(b.logo_url, '') AS logoUrl,
              COALESCE(b.accent, '') AS accent,
              COALESCE(b.login_headline, '') AS loginHeadline
       FROM crm_custom_domains d
       LEFT JOIN crm_domain_branding b ON b.hostname = d.hostname
       WHERE d.hostname = ? AND d.status = 'active'`,
    ).bind(hostname).first<Record<string, unknown>>();

    /* Null rather than an error. An unknown hostname is the ordinary case —
       every visit to the app's own address hits this — and an error would make
       the normal path look broken in a console. */
    return json({ success: true, match: row ?? null });
  }

  /* ── Everything else needs a session ──────────────────────────────────── */

  const user = await userFromToken(env.DB, d.token);
  if (!user) return fail('Sign in again — this action needs a current session.', 401, { code: 'unauthorised' });

  /* ── Owner-only: the certificate provider ─────────────────────────────── */

  if (act === 'provider_get' || act === 'provider_save') {
    if (!isOwner(user)) return fail('Only the installation owner can set this up.', 403);

    if (act === 'provider_save') {
      const r = await saveSaasCreds(env, {
        zoneId: String(d.zoneId ?? ''),
        apiToken: String(d.apiToken ?? ''),
        cnameTarget: String(d.cnameTarget ?? ''),
      });
      if (!r.ok) return fail(r.error);
    }

    const creds = await saasCreds(env);
    return json({
      success: true,
      saas: {
        /* Whether it is set, never the token itself. */
        connected: !!creds,
        zoneId: creds?.zoneId ?? '',
        cnameTarget: creds?.cnameTarget ?? '',
        hasToken: !!creds?.apiToken,
        subdomainSuffix: SUBDOMAIN_SUFFIX,
      },
    });
  }

  /* ── Workspace-scoped from here ───────────────────────────────────────── */

  const accountId = String(d.accountId ?? '').trim();
  if (!accountId) return fail('Which workspace?');
  const access = await workspaceAccess(env.DB, user, accountId);
  if (!access.ok) return fail(access.message ?? 'That workspace is not yours.', 403, { code: access.code });

  const listDomains = async () => {
    const { results } = await env.DB.prepare(
      `SELECT hostname, kind, status, dns_target AS dnsTarget,
              dns_txt_name AS dnsTxtName, dns_txt_value AS dnsTxtValue,
              last_error AS lastError, checked_at AS checkedAt, created_at AS createdAt
       FROM crm_custom_domains WHERE account_id = ? ORDER BY created_at`,
    ).bind(accountId).all();
    return results ?? [];
  };

  /**
   * Copy the workspace's branding to where an anonymous visitor can read it.
   *
   * ── Why the client supplies it ──
   *
   * Branding lives inside `crm_subaccounts`, which is a *global* storage key —
   * per browser, not per workspace, and not reliably on the server at all. The
   * server digging through that blob would be guessing at a location that is
   * not guaranteed to hold anything.
   *
   * So the browser sends the four fields it is already rendering. It can only
   * write them against a hostname this workspace owns, which is checked above,
   * and all four are cosmetic — a name, a logo, a colour and a headline. There
   * is nothing here worth lying about that lying about would gain.
   */
  const syncBranding = async (hostname: string) => {
    const b = parse<Record<string, string>>(JSON.stringify(d.branding ?? {}), {});
    await env.DB.prepare(
      `INSERT INTO crm_domain_branding (hostname, app_name, logo_url, accent, login_headline, updated_at)
       VALUES (?,?,?,?,?,?)
       ON CONFLICT(hostname) DO UPDATE SET
         app_name = excluded.app_name, logo_url = excluded.logo_url,
         accent = excluded.accent, login_headline = excluded.login_headline,
         updated_at = excluded.updated_at`,
    ).bind(
      hostname,
      String(b.appName ?? '').slice(0, 80),
      String(b.logoUrl ?? '').slice(0, 600),
      String(b.accent ?? b.color ?? '').slice(0, 20),
      String(b.loginHeadline ?? '').slice(0, 160),
      nowIso(),
    ).run();
  };

  if (act === 'list') {
    return json({
      success: true,
      domains: await listDomains(),
      /* So the screen can tell a reseller whether the custom tier is even on
         offer, rather than letting them type a hostname that cannot work. */
      customAvailable: !!(await saasCreds(env)),
      cnameTarget: await cnameTarget(env),
      subdomainSuffix: SUBDOMAIN_SUFFIX,
    });
  }

  if (act === 'add') {
    const kind = String(d.kind ?? 'subdomain') === 'custom' ? 'custom' : 'subdomain';

    let hostname: string;
    if (kind === 'subdomain') {
      const slug = String(d.slug ?? '').trim().toLowerCase().replace(/[^a-z0-9-]/g, '').replace(/^-+|-+$/g, '');
      if (slug.length < 3) return fail('Pick a name of at least three letters.');
      hostname = `${slug}.${SUBDOMAIN_SUFFIX}`;
    } else {
      hostname = cleanHost(d.hostname);
      if (!HOST_OK.test(hostname)) return fail('That is not a hostname we can serve.');
      /* A subdomain of ours dressed up as a custom domain would skip the
         certificate work and then not resolve. Refused by name. */
      if (hostname.endsWith(`.${SUBDOMAIN_SUFFIX}`) || hostname === SUBDOMAIN_SUFFIX) {
        return fail(`Use the free subdomain option for a name under ${SUBDOMAIN_SUFFIX}.`);
      }
    }

    if (RESERVED.has(hostname)) return fail('That address is reserved.');

    const taken = await env.DB.prepare('SELECT account_id FROM crm_custom_domains WHERE hostname = ?')
      .bind(hostname).first<{ account_id: string }>();
    if (taken) {
      return fail(taken.account_id === accountId
        ? 'You have already claimed that address.'
        : 'That address is already in use.');
    }

    if (kind === 'custom') {
      const creds = await saasCreds(env);
      if (!creds) {
        return fail('Your own domain is not available on this installation yet. The free subdomain works now.', 200, { code: 'not_available' });
      }
    }

    const now = nowIso();
    /* A subdomain is live the moment the row exists — the wildcard certificate
       already covers it and there is nothing to verify. A custom domain is not,
       and must not say it is. */
    const status = kind === 'subdomain' ? 'active' : 'pending';

    await env.DB.prepare(
      `INSERT INTO crm_custom_domains
       (hostname, account_id, kind, status, provider_id, dns_target, dns_txt_name, dns_txt_value, last_error, created_at, updated_at)
       VALUES (?,?,?,?,'','','','','',?,?)`,
    ).bind(hostname, accountId, kind, status, now, now).run();

    await syncBranding(hostname);

    if (kind === 'custom') {
      const state = await createCustomHostname(env, hostname);
      await env.DB.prepare(
        `UPDATE crm_custom_domains SET provider_id = ?, status = ?, dns_target = ?,
         dns_txt_name = ?, dns_txt_value = ?, last_error = ?, checked_at = ?, updated_at = ? WHERE hostname = ?`,
      ).bind(
        state.id, state.status, await cnameTarget(env),
        state.txtName, state.txtValue, state.error || '', nowIso(), nowIso(), hostname,
      ).run();
    }

    return json({ success: true, hostname, domains: await listDomains() });
  }

  if (act === 'check') {
    const hostname = cleanHost(d.hostname);
    const row = await env.DB.prepare(
      'SELECT provider_id, kind FROM crm_custom_domains WHERE hostname = ? AND account_id = ?',
    ).bind(hostname, accountId).first<{ provider_id: string; kind: string }>();
    if (!row) return fail('That address is not in this workspace.', 403);

    /* A subdomain has nothing to check — there is no certificate being issued
       and no DNS anybody has to add. Saying "checked, still fine" is honest and
       costs nothing. */
    if (row.kind === 'subdomain') {
      await syncBranding(hostname);
      return json({ success: true, domains: await listDomains() });
    }

    const state = await checkCustomHostname(env, row.provider_id);
    await env.DB.prepare(
      `UPDATE crm_custom_domains SET status = ?, dns_txt_name = ?, dns_txt_value = ?,
       last_error = ?, checked_at = ?, updated_at = ? WHERE hostname = ?`,
    ).bind(
      state.ok ? state.status : 'pending',
      state.txtName || '', state.txtValue || '',
      state.error || state.detail || '', nowIso(), nowIso(), hostname,
    ).run();

    if (state.status === 'active') await syncBranding(hostname);
    return json({ success: true, domains: await listDomains() });
  }

  if (act === 'remove') {
    const hostname = cleanHost(d.hostname);
    const row = await env.DB.prepare(
      'SELECT provider_id FROM crm_custom_domains WHERE hostname = ? AND account_id = ?',
    ).bind(hostname, accountId).first<{ provider_id: string }>();
    if (!row) return fail('That address is not in this workspace.', 403);

    /* Cloudflare first. A row deleted before the certificate is released leaves
       a hostname nobody can reclaim — not this workspace, because the row is
       gone, and not another, because Cloudflare still holds it. */
    const r = await deleteCustomHostname(env, row.provider_id);
    if (!r.ok) return fail('Could not release that address yet. Try again shortly.');

    await env.DB.prepare('DELETE FROM crm_custom_domains WHERE hostname = ? AND account_id = ?')
      .bind(hostname, accountId).run();
    await env.DB.prepare('DELETE FROM crm_domain_branding WHERE hostname = ?').bind(hostname).run();
    return json({ success: true, domains: await listDomains() });
  }

  /** Re-copy branding after somebody edits it, so the login screen catches up. */
  if (act === 'refresh_branding') {
    const { results } = await env.DB.prepare(
      'SELECT hostname FROM crm_custom_domains WHERE account_id = ?',
    ).bind(accountId).all<{ hostname: string }>();
    for (const r of results ?? []) await syncBranding(r.hostname);
    return ok();
  }

  return fail(`"${act}" is not something this endpoint does.`);
}
