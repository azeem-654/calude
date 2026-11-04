/**
 * AppSumo Licensing (v2) — the "Activate" button on a buyer's AppSumo account.
 *
 *   /api/appsumo-webhook.php  POST from AppSumo, signed. purchase, activate,
 *                             upgrade, downgrade, deactivate (and migrate, for
 *                             add-ons). Answers {success: true, event}.
 *   /api/appsumo-oauth.php    GET. AppSumo's OAuth redirect: trades `code` for
 *                             the buyer's license key, then sends them to
 *                             /appsumo#license=<one-use claim> to sign up or
 *                             sign in, where the claim ties the license to
 *                             their account (routes/appsumo.ts `claim`).
 *
 * This sits beside the codes model (routes/appsumo.ts), not instead of it: the
 * listing chooses one, and the owner may not know which AppSumo will ask for
 * until the Partner Portal's Redemption step. A subscriber's tier is the
 * larger of the two (`appsumoUnits`), never their sum.
 *
 * Settings are Cloudflare Worker secrets, never the database and never shown
 * to a browser: APPSUMO_API_KEY (signs the webhooks, reads the Licensing API),
 * APPSUMO_CLIENT_ID and APPSUMO_CLIENT_SECRET (OAuth; AppSumo issues them only
 * after both URLs validate). Unset, the webhook answers 503 so AppSumo retries
 * once they are set rather than a purchase being dropped.
 *
 * Why AppSumo's own test request passes unsigned: AppSumo sends it while the
 * owner is saving the URL, possibly before any key is in place here, and the
 * URL is not saved unless it succeeds. It is answered and never acted on, so
 * forging one gains nothing.
 *
 * Why no timestamp window: AppSumo re-signs retries with a new timestamp but
 * does not document how late a retry may come, and a refused activation is a
 * buyer who cannot get in. Replays are made harmless instead — 'replaced' and
 * 'deactivated' are terminal, and an event older than the last one applied to
 * that key is ignored.
 */
import { fail, json } from '../lib/http';
import { metaPut, nowIso, type Env } from '../lib/db';
import { timingSafeEqual } from '../lib/crypto';
import { APPSUMO_MAX_CODES } from '../lib/allowances';
import { applyAppsumoTier, sha256Hex } from './appsumo';

interface Hook {
  license_key?: string;
  prev_license_key?: string;
  parent_license_key?: string;
  partner_plan_name?: string;
  unit_quantity?: number;
  event?: string;
  event_timestamp?: number;
  license_status?: string;
  tier?: number;
  test?: boolean;
  extra?: { reason?: string };
}

interface Row { license_key: string; status: string; owner_email: string | null; last_event_ms: number | null; tier: number }

const EVENTS = ['purchase', 'activate', 'upgrade', 'downgrade', 'deactivate', 'migrate'];
const TERMINAL = ['replaced', 'deactivated'];
/* A claim link outlives a slow sign-up, not a forgotten tab. */
const CLAIM_DAYS = 14;

const keyOk = (k: unknown): k is string => typeof k === 'string' && /^[A-Za-z0-9-]{8,64}$/.test(k);
const tierOf = (t: unknown) => Math.min(Math.max(1, Math.floor(Number(t)) || 1), APPSUMO_MAX_CODES);

/** HMAC-SHA256 of `${timestamp}${body}` with the API key, hex — AppSumo's "Webhook Security". */
export async function appsumoSignature(apiKey: string, timestamp: string, raw: string): Promise<string> {
  const k = await crypto.subtle.importKey('raw', new TextEncoder().encode(apiKey), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const mac = await crypto.subtle.sign('HMAC', k, new TextEncoder().encode(`${timestamp}${raw}`));
  return [...new Uint8Array(mac)].map(b => b.toString(16).padStart(2, '0')).join('');
}

/** Which of the three secrets are set — never their values. */
export const licensingReady = (env: Env) => ({
  webhook: !!env.APPSUMO_API_KEY,
  oauth: !!(env.APPSUMO_CLIENT_ID && env.APPSUMO_CLIENT_SECRET),
});

async function find(env: Env, key: string): Promise<Row | null> {
  return env.DB.prepare('SELECT license_key, status, owner_email, last_event_ms, tier FROM crm_appsumo_licenses WHERE license_key = ?')
    .bind(key).first<Row>();
}

async function upsert(env: Env, h: Hook, key: string, status: string, owner: string | null, prev: string | null) {
  const at = nowIso();
  await env.DB.prepare(
    `INSERT INTO crm_appsumo_licenses (license_key, prev_key, parent_key, plan_name, units, tier, status, owner_email, last_event, last_event_ms, reason, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT(license_key) DO UPDATE SET tier = excluded.tier, status = excluded.status,
       owner_email = COALESCE(crm_appsumo_licenses.owner_email, excluded.owner_email),
       prev_key = COALESCE(excluded.prev_key, crm_appsumo_licenses.prev_key),
       last_event = excluded.last_event, last_event_ms = excluded.last_event_ms, reason = excluded.reason, updated_at = excluded.updated_at`,
  ).bind(
    key, prev, keyOk(h.parent_license_key) ? h.parent_license_key : null, h.partner_plan_name ? String(h.partner_plan_name).slice(0, 120) : null,
    Number.isFinite(Number(h.unit_quantity)) ? Math.floor(Number(h.unit_quantity)) : null,
    tierOf(h.tier), status, owner, String(h.event), Number(h.event_timestamp) || null,
    String(h.extra?.reason ?? '').slice(0, 200) || null, at, at,
  ).run();
}

export async function handleAppsumoWebhook(req: Request, env: Env): Promise<Response> {
  if (req.method !== 'POST') return json({ success: true, note: 'AppSumo licensing webhook. AppSumo POSTs here.' });
  const raw = await req.text();
  let h: Hook;
  try { h = JSON.parse(raw) as Hook; } catch { return fail('Not JSON.', 400); }
  const event = String(h.event ?? '');

  if (h.test === true) return json({ success: true, event: event || 'test' });

  if (!env.APPSUMO_API_KEY) return fail('AppSumo licensing is not connected here yet: APPSUMO_API_KEY is not set.', 503, { code: 'not_connected' });
  const ts = req.headers.get('X-Appsumo-Timestamp') ?? '';
  const sig = (req.headers.get('X-Appsumo-Signature') ?? '').toLowerCase();
  if (!ts || !sig || !timingSafeEqual(sig, await appsumoSignature(env.APPSUMO_API_KEY, ts, raw))) {
    /* Named on the owner's /appsumo: a wrong key would otherwise look exactly like no buyers. */
    await metaPut(env.DB, 'appsumo_last_rejected', JSON.stringify({ at: nowIso(), signed: !!sig })).catch(() => null);
    return fail('Signature does not match.', 401, { code: 'bad_signature' });
  }

  if (!EVENTS.includes(event) || !keyOk(h.license_key)) return fail('Unknown event or license key.', 400);
  await metaPut(env.DB, 'appsumo_last_webhook', JSON.stringify({ event, at: nowIso() })).catch(() => null);
  const ack = json({ success: true, event });
  /* migrate is a ledger entry for add-ons, sent beside the upgrade/downgrade that does the work. */
  if (event === 'migrate') return ack;

  const key = h.license_key;
  const row = await find(env, key);
  const ms = Number(h.event_timestamp) || 0;
  if (row && TERMINAL.includes(row.status) && event !== 'deactivate') return ack;
  if (row?.last_event_ms && ms && ms < row.last_event_ms) return ack;
  const addOn = keyOk(h.parent_license_key);

  if (event === 'purchase') {
    /* A second purchase webhook for a key already activated must not knock it back to pending. */
    if (!row) await upsert(env, h, key, 'pending', null, null);
    return ack;
  }

  if (event === 'activate') {
    await upsert(env, h, key, 'active', null, null);
    if (row?.owner_email && !addOn) await applyAppsumoTier(env, row.owner_email);
    return ack;
  }

  if (event === 'upgrade' || event === 'downgrade') {
    const prev = keyOk(h.prev_license_key) ? await find(env, h.prev_license_key) : null;
    const owner = prev?.owner_email ?? row?.owner_email ?? null;
    await upsert(env, h, key, 'active', owner, prev?.license_key ?? null);
    if (prev && prev.license_key !== key) {
      await env.DB.prepare("UPDATE crm_appsumo_licenses SET status = 'replaced', claim_hash = NULL, updated_at = ? WHERE license_key = ?")
        .bind(nowIso(), prev.license_key).run();
    }
    if (owner && !addOn) await applyAppsumoTier(env, owner);
    return ack;
  }

  /* deactivate — a refund, or AppSumo staff. */
  await upsert(env, h, key, 'deactivated', null, null);
  await env.DB.prepare('UPDATE crm_appsumo_licenses SET claim_hash = NULL WHERE license_key = ?').bind(key).run();
  if (row?.owner_email) await applyAppsumoTier(env, row.owner_email);
  return ack;
}

const back = (url: URL, frag: string) => Response.redirect(`${url.origin}/appsumo#${frag}`, 302);

export async function handleAppsumoOauth(req: Request, env: Env): Promise<Response> {
  const url = new URL(req.url);
  const code = url.searchParams.get('code') ?? '';
  /* AppSumo validates the redirect address with a bare GET that must answer 200. */
  if (!code) {
    return new Response('<!doctype html><meta charset="utf-8"><title>AppSumo activation</title><p>This is where AppSumo returns buyers after they press Activate. Open your AppSumo account → Products to activate Protected Central.</p>',
      { headers: { 'Content-Type': 'text/html; charset=utf-8' } });
  }
  if (!env.APPSUMO_CLIENT_ID || !env.APPSUMO_CLIENT_SECRET) return back(url, 'license-error=not_connected');

  const oauth = (env.APPSUMO_OAUTH_BASE ?? 'https://appsumo.com').replace(/\/$/, '');
  let licenseKey: string;
  try {
    const t = await fetch(`${oauth}/openid/token/`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      /* Must match the address saved in the Partner Portal exactly: the one AppSumo just sent the buyer to. */
      body: JSON.stringify({ client_id: env.APPSUMO_CLIENT_ID, client_secret: env.APPSUMO_CLIENT_SECRET, code, redirect_uri: `${url.origin}${url.pathname}`, grant_type: 'authorization_code' }),
    });
    const tok = await t.json().catch(() => ({})) as { access_token?: string; error?: string };
    if (!t.ok || !tok.access_token) return back(url, 'license-error=expired');
    const l = await fetch(`${oauth}/openid/license_key/?access_token=${encodeURIComponent(tok.access_token)}`);
    const lic = await l.json().catch(() => ({})) as { license_key?: string };
    if (!l.ok || !keyOk(lic.license_key)) return back(url, 'license-error=no_license');
    licenseKey = lic.license_key;
  } catch {
    return back(url, 'license-error=unreachable');
  }

  let row = await find(env, licenseKey);
  if (!row) {
    /* The activate webhook normally lands first. If it has not, ask AppSumo for the tier
       rather than guess it; the webhook, when it comes, sets it again. */
    let tier = 1, status = 'active';
    if (env.APPSUMO_API_KEY) {
      try {
        const api = (env.APPSUMO_API_BASE ?? 'https://api.licensing.appsumo.com').replace(/\/$/, '');
        const r = await fetch(`${api}/v2/licenses/${encodeURIComponent(licenseKey)}`, { headers: { 'X-AppSumo-Licensing-Key': env.APPSUMO_API_KEY } });
        const j = await r.json().catch(() => ({})) as { tier?: number; status?: string };
        if (r.ok) { tier = tierOf(j.tier); if (j.status === 'deactivated') status = 'deactivated'; }
      } catch { /* keep tier 1 until the webhook says otherwise */ }
    }
    const at = nowIso();
    await env.DB.prepare(
      `INSERT OR IGNORE INTO crm_appsumo_licenses (license_key, tier, status, last_event, reason, created_at, updated_at)
       VALUES (?, ?, ?, 'oauth', 'Arrived through AppSumo sign-in before its webhook', ?, ?)`,
    ).bind(licenseKey, tier, status, at, at).run();
    row = await find(env, licenseKey);
  }
  if (!row || TERMINAL.includes(row.status)) return back(url, `license-error=${row?.status === 'replaced' ? 'replaced' : 'deactivated'}`);

  const claim = [...crypto.getRandomValues(new Uint8Array(24))].map(b => b.toString(16).padStart(2, '0')).join('');
  await env.DB.prepare('UPDATE crm_appsumo_licenses SET claim_hash = ?, claim_expires = ?, updated_at = ? WHERE license_key = ?')
    .bind(await sha256Hex(`claim:${claim}`), new Date(Date.now() + CLAIM_DAYS * 86400_000).toISOString(), nowIso(), licenseKey).run();
  /* The fragment never reaches a server log or a Referer. */
  return back(url, `license=${claim}`);
}
