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
  nowIso, storageWorkspace, userFromToken, workspaceAccess,
  type Env, type SessionUser,
} from '../lib/db';
import {
  checkCustomHostname, cnameTarget, createCustomHostname,
  deleteCustomHostname, saasCreds, saasReady, saasStatus, saveSaasCreds, verifySaas,
} from '../lib/cloudflareSaas';
import { check as allowance, refusalBody } from '../lib/allowanceStore';

interface Req {
  token?: string;
  accountId?: string;
  action?: string;
  [k: string]: unknown;
}

const isOwner = (u: SessionUser) => u.accountId === null && u.role === 'agency';

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

/**
 * Subdomain names nobody may claim, whatever the rest of the address.
 *
 * `testing` is the staging site's own address — a reseller holding it would be
 * served by whichever Worker route won. The rest are names a phishing page
 * would choose: `login.protectedcentral.com` asking for a password looks like
 * us to everybody, including our own customers. (SECURITY.md 3b.7.)
 */
const RESERVED_SLUGS = new Set([
  'testing', 'staging', 'app', 'www', 'api', 'admin', 'administrator', 'root', 'owner',
  'login', 'signin', 'sign-in', 'signup', 'sign-up', 'auth', 'oauth', 'sso', 'id', 'account', 'accounts',
  'password', 'reset', 'verify', 'secure', 'security', 'trust', 'support', 'help', 'status', 'docs',
  'billing', 'pay', 'payment', 'payments', 'checkout', 'invoice', 'invoices',
  'mail', 'email', 'smtp', 'imap', 'webmail', 'mx', 'dashboard', 'portal', 'protectedcentral', 'protected-central',
  /* The names the Cloudflare for SaaS fallback origin may take
     (docs/CLOUDFLARE-SAAS-SETUP.md): a reseller's brand must never sit on the
     hostname every customer's domain CNAMEs to. */
  'customers', 'customer', 'cname', 'fallback', 'origin', 'saas', 'domains', 'proxy', 'edge',
  'whitelabel', 'white-label', 'whitelabeling', 'connect',
]);

/** The suffix a free subdomain lives under. */
const SUBDOMAIN_SUFFIX = 'protectedcentral.com';

/** Lower-case, no port, no trailing dot, no scheme. Applied to everything. */
function cleanHost(raw: unknown): string {
  /* Capped before anything else touches it. A hostname is at most 253
     characters by the standard, and an unbounded string from an unauthenticated
     caller should not become a database parameter. */
  return String(raw ?? '').slice(0, 253)
    .trim().toLowerCase()
    .replace(/^https?:\/\//, '')
    .replace(/\/.*$/, '')
    .replace(/:\d+$/, '')
    .replace(/\.$/, '');
}

const HOST_OK = /^[a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?(\.[a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?)+$/;

interface Brand { appName: string; logoUrl: string; loginHeadline: string }

/* A logo is shown at most 170×30 on the sign-in page and 96×32 in the top bar;
   Settings scales an upload down before saving, so a real one is a few KB.
   The cap is generous for that and still keeps the one public, unauthenticated
   answer (`resolve`) small. Over it is refused by name, never clipped — a
   clipped data URL is an image that silently draws nothing. */
const MAX_LOGO_CHARS = 200_000;
const LOGO_OK = /^(https:\/\/[^\s"'<>]{4,600}|data:image\/(png|jpeg|webp|gif|svg\+xml);base64,[A-Za-z0-9+/=]+)$/;

function cleanBrand(raw: unknown): { brand: Brand; error?: string; field?: string } {
  const b = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>;
  const brand: Brand = {
    appName: String(b.appName ?? '').trim().slice(0, 80),
    logoUrl: String(b.logoUrl ?? '').trim(),
    loginHeadline: String(b.loginHeadline ?? '').trim().slice(0, 160),
  };
  if (brand.logoUrl.length > MAX_LOGO_CHARS) return { brand: { ...brand, logoUrl: '' }, error: 'That logo is too large. Use a smaller image (under about 150KB).', field: 'brand.logo' };
  if (brand.logoUrl && !LOGO_OK.test(brand.logoUrl)) return { brand: { ...brand, logoUrl: '' }, error: 'A logo must be an https:// address or an uploaded PNG, JPEG, SVG, WebP or GIF.', field: 'brand.logo' };
  return { brand };
}

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
              COALESCE(b.login_headline, '') AS loginHeadline,
              d.serves, d.site_brand AS siteBrand
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
      if (!r.ok) return fail(r.error, 200, r.field ? { field: r.field } : {});
      await verifySaas(env);
    }
    if (act === 'provider_get' && d.recheck) await verifySaas(env);

    const creds = await saasCreds(env);
    const st = await saasStatus(env);
    return json({
      success: true,
      saas: {
        /* Whether it is set, never the token itself. */
        connected: !!creds,
        /* Saved is not working: resellers are offered their own domain only
           when Cloudflare said yes (saasReady). The owner sees why not. */
        verified: !!creds && st.status === 'ok',
        lastError: st.lastError,
        checkedAt: st.checkedAt,
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
      `SELECT hostname, kind, status, serves, site_brand AS siteBrand, dns_target AS dnsTarget,
              dns_txt_name AS dnsTxtName, dns_txt_value AS dnsTxtValue,
              last_error AS lastError, checked_at AS checkedAt, created_at AS createdAt
       FROM crm_custom_domains WHERE account_id = ? ORDER BY created_at`,
    ).bind(accountId).all();
    return results ?? [];
  };

  /**
   * Copy the workspace's branding to where an anonymous visitor can read it.
   *
   * ── Why it comes from the server's own row ──
   *
   * It used to be whatever the browser sent with the request, because branding
   * lived only in that browser's `crm_subaccounts`. The copy was then taken
   * once, at claim time, and never again: a reseller who renamed afterwards
   * kept the old name on their sign-in page, and a logo uploaded as a data URL
   * was cut to 600 characters and drew nothing. `crm_workspace_branding`
   * (migration 0104) is now the one source; a browser's copy is used only for
   * a workspace that has never saved one, so addresses claimed before it still
   * carry their name.
   */
  const storedBranding = async (): Promise<Brand | null> => {
    const r = await env.DB.prepare(
      'SELECT app_name, logo_url, login_headline FROM crm_workspace_branding WHERE account_id = ?',
    ).bind(accountId).first<{ app_name: string; logo_url: string; login_headline: string }>();
    return r ? { appName: r.app_name, logoUrl: r.logo_url, loginHeadline: r.login_headline } : null;
  };
  const syncBranding = async (hostname: string) => {
    const b = (await storedBranding()) ?? cleanBrand(d.branding).brand;
    await env.DB.prepare(
      `INSERT INTO crm_domain_branding (hostname, app_name, logo_url, accent, login_headline, updated_at)
       VALUES (?,?,?,?,?,?)
       ON CONFLICT(hostname) DO UPDATE SET
         app_name = excluded.app_name, logo_url = excluded.logo_url,
         accent = excluded.accent, login_headline = excluded.login_headline,
         updated_at = excluded.updated_at`,
    ).bind(hostname, b.appName, b.logoUrl, '', b.loginHeadline, nowIso()).run();
  };

  /* The workspace's branding: read on sign-in so every device shows it, saved
     from Settings → Branding, and copied to each of its addresses at once. */
  if (act === 'get_branding') {
    return json({ success: true, branding: await storedBranding() });
  }
  if (act === 'save_branding') {
    const c = cleanBrand(d.branding);
    if (c.error) return fail(c.error, 200, { field: c.field });
    await env.DB.prepare(
      `INSERT INTO crm_workspace_branding (account_id, app_name, logo_url, login_headline, updated_at)
       VALUES (?,?,?,?,?)
       ON CONFLICT(account_id) DO UPDATE SET app_name = excluded.app_name, logo_url = excluded.logo_url,
         login_headline = excluded.login_headline, updated_at = excluded.updated_at`,
    ).bind(accountId, c.brand.appName, c.brand.logoUrl, c.brand.loginHeadline, nowIso()).run();
    const { results } = await env.DB.prepare('SELECT hostname FROM crm_custom_domains WHERE account_id = ?')
      .bind(accountId).all<{ hostname: string }>();
    for (const r of results ?? []) await syncBranding(r.hostname);
    return json({ success: true, branding: c.brand, addresses: (results ?? []).length });
  }

  /* The short names this workspace publishes under (routes/published.ts) —
     what a domain set to "show my website" can show. */
  const ws = storageWorkspace(user, accountId);
  const listBrands = async () => {
    const { results } = await env.DB.prepare('SELECT brand FROM crm_page_brands WHERE account_id = ? ORDER BY created_at')
      .bind(ws).all<{ brand: string }>();
    return (results ?? []).map(r => r.brand);
  };

  /**
   * What an address shows: the client sign-in (white label of the app) or the
   * workspace's published website under one of its short names.
   *
   * ── Why the brand is checked here and not at visit time only ──
   * A visitor's request names nothing but the hostname; the brand behind it
   * was chosen by whoever set this. So this is the one place a workspace could
   * point its domain at somebody else's pages — "show lone-star's site on my
   * domain" — and it is refused here, against crm_page_brands.
   */
  if (act === 'set_serves') {
    const hostname = cleanHost(d.hostname);
    const serves = String(d.serves ?? '') === 'site' ? 'site' : 'signin';
    const brand = serves === 'site' ? String(d.brand ?? '').trim().toLowerCase() : '';
    const mine = await env.DB.prepare('SELECT 1 AS x FROM crm_custom_domains WHERE hostname = ? AND account_id = ?')
      .bind(hostname, accountId).first();
    if (!mine) return fail('That address is not one of yours.', 403);
    if (serves === 'site') {
      if (!brand) return fail('Publish a website first — then choose it here.', 200, { field: 'domain.serves' });
      if (!(await listBrands()).includes(brand)) return fail('Those pages are not published from this workspace.', 200, { field: 'domain.serves' });
    }
    await env.DB.prepare('UPDATE crm_custom_domains SET serves = ?, site_brand = ?, updated_at = ? WHERE hostname = ? AND account_id = ?')
      .bind(serves, brand, nowIso(), hostname, accountId).run();
    return json({ success: true, domains: await listDomains(), brands: await listBrands() });
  }

  if (act === 'list') {
    return json({
      success: true,
      domains: await listDomains(),
      brands: await listBrands(),
      /* So the screen can tell a reseller whether the custom tier is even on
         offer, rather than letting them type a hostname that cannot work. */
      customAvailable: !!(await saasReady(env)),
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
      if (RESERVED_SLUGS.has(slug)) return fail('That name is reserved. Try your business name.');
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

    /* Branded login addresses are a plan allowance (lib/allowances.ts): the
       number a price card promises is the number this refuses at. */
    const room = await allowance(env, accountId, 'login_addresses');
    if (!room.ok) return fail(room.message, 402, refusalBody(room));

    const taken = await env.DB.prepare('SELECT account_id FROM crm_custom_domains WHERE hostname = ?')
      .bind(hostname).first<{ account_id: string }>();
    if (taken) {
      return fail(taken.account_id === accountId
        ? 'You have already claimed that address.'
        : 'That address is already in use.');
    }

    if (kind === 'custom') {
      const creds = await saasReady(env);
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
