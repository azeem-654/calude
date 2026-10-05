/**
 * Push notifications to the Protected Central phone apps: Android through
 * Firebase Cloud Messaging (FCM HTTP v1), iPhone straight through Apple's
 * Push Notification service (APNs, token auth).
 *
 * ── Why each, and why from here ──
 *
 * The support app's job is to ring when a customer calls or a chat is waiting
 * for a person, with the phone in a pocket and the app closed. Only a push can
 * do that. On Android that is FCM — the token the app gets is an FCM token. On
 * iPhone the app gets an APNs token, and sending it to Apple ourselves keeps
 * Google's SDK out of the iPhone app entirely; a Worker's fetch speaks the
 * HTTP/2 APNs requires.
 *
 * ── Off until the owner turns it on ──
 *
 * Android: the secret FCM_SERVICE_ACCOUNT (a Google service account's whole
 * JSON key, Firebase Cloud Messaging role). iPhone: APNS_KEY (the .p8 key's
 * text), APNS_KEY_ID and APNS_TEAM_ID. Without them nothing is sent to that
 * kind of phone and Platform services says so — the apps still ring while
 * they are open (HelpLauncher's LiveAlert), they just cannot wake a closed
 * phone. Nothing here pretends a push went out.
 */
import { nowIso, type Env } from './db';

interface ServiceAccount { client_email: string; private_key: string; project_id: string; token_uri?: string }

export interface PushMessage {
  title: string;
  body: string;
  /** Where a tap opens, inside the app: "/engagement?tab=live&answer=<id>". */
  route: string;
  /** "call" rings louder and on its own channel; "message" is an ordinary alert. */
  kind: 'call' | 'message';
  /** Replaces an earlier alert with the same tag on the phone (one per conversation). */
  tag?: string;
}

export function serviceAccount(env: Env): ServiceAccount | null {
  const raw = env.FCM_SERVICE_ACCOUNT;
  if (!raw) return null;
  try {
    const sa = JSON.parse(raw) as ServiceAccount;
    return sa.client_email && sa.private_key && sa.project_id ? sa : null;
  } catch { return null; }
}

/* ── An OAuth access token from the service account (RS256 JWT), kept for its hour ── */

let cached: { token: string; exp: number; who: string } | null = null;

const b64url = (b: ArrayBuffer | Uint8Array | string) => {
  const bytes = typeof b === 'string' ? new TextEncoder().encode(b) : new Uint8Array(b instanceof Uint8Array ? b : new Uint8Array(b));
  let s = '';
  for (const x of bytes) s += String.fromCharCode(x);
  return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
};

async function accessToken(env: Env, sa: ServiceAccount): Promise<string> {
  const now = Math.floor(Date.now() / 1000);
  if (cached && cached.who === sa.client_email && cached.exp - 120 > now) return cached.token;
  const pem = sa.private_key.replace(/-----[^-]+-----/g, '').replace(/\s+/g, '');
  const der = Uint8Array.from(atob(pem), c => c.charCodeAt(0));
  const key = await crypto.subtle.importKey('pkcs8', der, { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' }, false, ['sign']);
  const tokenUri = env.FCM_TOKEN_URL || sa.token_uri || 'https://oauth2.googleapis.com/token';
  const unsigned = `${b64url(JSON.stringify({ alg: 'RS256', typ: 'JWT' }))}.${b64url(JSON.stringify({
    iss: sa.client_email, scope: 'https://www.googleapis.com/auth/firebase.messaging',
    aud: tokenUri, iat: now, exp: now + 3600,
  }))}`;
  const sig = await crypto.subtle.sign('RSASSA-PKCS1-v1_5', key, new TextEncoder().encode(unsigned));
  const res = await fetch(tokenUri, {
    method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: `grant_type=${encodeURIComponent('urn:ietf:params:oauth:grant-type:jwt-bearer')}&assertion=${unsigned}.${b64url(sig)}`,
    signal: AbortSignal.timeout(8000),
  });
  const j = await res.json().catch(() => ({})) as { access_token?: string; expires_in?: number; error_description?: string };
  if (!res.ok || !j.access_token) throw new Error(`Google refused the service account: ${j.error_description ?? res.status}`);
  cached = { token: j.access_token, exp: now + (j.expires_in ?? 3600), who: sa.client_email };
  return j.access_token;
}

/* ── APNs: an ES256 token from the .p8 key, reused for 50 minutes as Apple asks ── */

export function apnsConfigured(env: Env): boolean {
  return !!(env.APNS_KEY && env.APNS_KEY_ID && env.APNS_TEAM_ID);
}
let apnsJwt: { token: string; at: number } | null = null;
async function apnsToken(env: Env): Promise<string> {
  const now = Math.floor(Date.now() / 1000);
  if (apnsJwt && now - apnsJwt.at < 50 * 60) return apnsJwt.token;
  const pem = String(env.APNS_KEY).replace(/-----[^-]+-----/g, '').replace(/\\n/g, '').replace(/\s+/g, '');
  const der = Uint8Array.from(atob(pem), c => c.charCodeAt(0));
  const key = await crypto.subtle.importKey('pkcs8', der, { name: 'ECDSA', namedCurve: 'P-256' }, false, ['sign']);
  const unsigned = `${b64url(JSON.stringify({ alg: 'ES256', kid: env.APNS_KEY_ID }))}.${b64url(JSON.stringify({ iss: env.APNS_TEAM_ID, iat: now }))}`;
  /* WebCrypto's ECDSA signature is already r‖s, the form a JWT wants. */
  const sig = await crypto.subtle.sign({ name: 'ECDSA', hash: 'SHA-256' }, key, new TextEncoder().encode(unsigned));
  apnsJwt = { token: `${unsigned}.${b64url(sig)}`, at: now };
  return apnsJwt.token;
}
/** The app's bundle id is the APNs topic. */
const TOPIC: Record<string, string> = { customer: 'com.protectedcentral.app', support: 'com.protectedcentral.support' };

async function sendApns(env: Env, deviceToken: string, app: string, m: PushMessage): Promise<{ ok: boolean; gone: boolean; error: string }> {
  const base = env.APNS_BASE || (env.APNS_SANDBOX ? 'https://api.sandbox.push.apple.com' : 'https://api.push.apple.com');
  const res = await fetch(`${base}/3/device/${encodeURIComponent(deviceToken)}`, {
    method: 'POST',
    headers: {
      authorization: `bearer ${await apnsToken(env)}`,
      'apns-topic': TOPIC[app] ?? TOPIC.customer,
      'apns-push-type': 'alert',
      'apns-priority': '10',
      'apns-expiration': String(Math.floor(Date.now() / 1000) + (m.kind === 'call' ? 75 : 3600)),
      ...(m.tag ? { 'apns-collapse-id': m.tag.slice(0, 64) } : {}),
      'content-type': 'application/json',
    },
    body: JSON.stringify({
      aps: { alert: { title: m.title.slice(0, 120), body: m.body.slice(0, 240) }, sound: 'default', 'interruption-level': m.kind === 'call' ? 'time-sensitive' : 'active' },
      route: m.route, kind: m.kind,
    }),
    signal: AbortSignal.timeout(8000),
  });
  if (res.ok) return { ok: true, gone: false, error: '' };
  const err = await res.text().catch(() => '');
  /* 410 Unregistered, or a token that was never valid for this app. */
  return { ok: false, gone: res.status === 410 || /BadDeviceToken|Unregistered|DeviceTokenNotForTopic/.test(err), error: `${res.status} ${err.slice(0, 200)}` };
}

/**
 * Send one alert to every phone registered for this workspace.
 *
 * Returns what happened, by count, so a caller can log it; it never throws —
 * a push that could not go out must not fail the call or the chat that
 * prompted it. A token FCM says is gone is deleted, so a phone that
 * uninstalled the app stops being tried.
 */
export async function pushToWorkspace(env: Env, accountId: string, m: PushMessage): Promise<{ sent: number; failed: number; skipped: string }> {
  const sa = serviceAccount(env);
  const apns = apnsConfigured(env);
  if (!sa && !apns) return { sent: 0, failed: 0, skipped: 'not configured' };
  const rows = (await env.DB.prepare('SELECT token, platform, app FROM crm_push_devices WHERE account_id = ? ORDER BY last_seen_at DESC LIMIT 20')
    .bind(accountId).all<{ token: string; platform: string; app: string }>().catch(() => ({ results: [] as { token: string; platform: string; app: string }[] }))).results ?? [];
  if (!rows.length) return { sent: 0, failed: 0, skipped: 'no devices' };
  let fcmToken = '';
  if (sa && rows.some(r => r.platform !== 'ios')) {
    try { fcmToken = await accessToken(env, sa); } catch { fcmToken = ''; }
  }
  const base = env.FCM_BASE || 'https://fcm.googleapis.com';
  let sent = 0, failed = 0;
  const forget = (t: string) => env.DB.prepare('DELETE FROM crm_push_devices WHERE token = ?').bind(t).run().catch(() => undefined);
  const note = (t: string, e: string) => env.DB.prepare('UPDATE crm_push_devices SET last_error = ? WHERE token = ?').bind(e.slice(0, 240), t).run().catch(() => undefined);
  for (const r of rows) {
    try {
      if (r.platform === 'ios') {
        if (!apns) continue;
        const out = await sendApns(env, r.token, r.app, m);
        if (out.ok) sent++; else { failed++; if (out.gone) await forget(r.token); else await note(r.token, out.error); }
        continue;
      }
      if (!fcmToken) { if (sa) failed++; continue; }
      const message = {
        token: r.token,
        notification: { title: m.title.slice(0, 120), body: m.body.slice(0, 240) },
        data: { route: m.route, kind: m.kind },
        android: {
          priority: 'HIGH',
          ttl: m.kind === 'call' ? '75s' : '3600s',
          notification: { channel_id: m.kind === 'call' ? 'calls' : 'messages', sound: 'default', ...(m.tag ? { tag: m.tag } : {}) },
        },
      };
      const res = await fetch(`${base}/v1/projects/${encodeURIComponent(sa!.project_id)}/messages:send`, {
        method: 'POST', headers: { Authorization: `Bearer ${fcmToken}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ message }), signal: AbortSignal.timeout(8000),
      });
      if (res.ok) { sent++; continue; }
      failed++;
      const err = await res.text().catch(() => '');
      /* UNREGISTERED / NOT_FOUND: the app is gone from that phone. */
      if (res.status === 404 || /UNREGISTERED|registration-token-not-registered/.test(err)) await forget(r.token);
      else await note(r.token, `${res.status} ${err}`);
    } catch { failed++; }
  }
  return { sent, failed, skipped: '' };
}

/** The alerts the support desk wants on a phone, by the event that records them. */
export function alertFor(kind: string, refId: string, summary: string): PushMessage | null {
  switch (kind) {
    case 'live.call': return { kind: 'call', title: 'Incoming call', body: summary, route: `/engagement?tab=live&answer=${encodeURIComponent(refId)}`, tag: refId };
    case 'live.requested': return { kind: 'call', title: 'Screen share request', body: summary, route: `/engagement?tab=live&answer=${encodeURIComponent(refId)}`, tag: refId };
    case 'conversation.escalated': return { kind: 'message', title: 'A chat is waiting for you', body: summary || 'A visitor asked for a person.', route: `/engagement?tab=inbox&c=${encodeURIComponent(refId)}`, tag: refId };
    case 'chat.message': return { kind: 'message', title: 'New chat message', body: summary, route: `/engagement?tab=inbox&c=${encodeURIComponent(refId)}`, tag: refId };
    case 'ticket.created': return { kind: 'message', title: 'New support ticket', body: summary, route: '/engagement?tab=tickets', tag: refId };
    default: return null;
  }
}

/** Record that a device is still in use — cheap enough to run on every app start. */
export async function touchDevice(env: Env, d: { token: string; email: string; accountId: string; platform: string; app: string }): Promise<void> {
  const now = nowIso();
  await env.DB.prepare(
    `INSERT INTO crm_push_devices (token, user_email, account_id, platform, app, created_at, last_seen_at)
     VALUES (?,?,?,?,?,?,?)
     ON CONFLICT(token) DO UPDATE SET user_email = excluded.user_email, account_id = excluded.account_id,
       platform = excluded.platform, app = excluded.app, last_seen_at = excluded.last_seen_at, last_error = ''`,
  ).bind(d.token, d.email, d.accountId, d.platform, d.app, now, now).run();
}
