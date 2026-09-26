/**
 * Sign in with Google, on the scopes that need no permission from Google.
 *
 * ── Why this is practical after all ──
 *
 * An earlier read of Google's rules said a Production app needs OAuth
 * verification and carries a hundred-user cap. That is true of **sensitive and
 * restricted** scopes — Gmail, Drive, Calendar. Google's own FAQ ties both the
 * cap and the review to exactly those: "unverified apps that are accessing
 * restricted or sensitive scopes have a 100 new-user cap restriction."
 *
 * `openid`, `email` and `profile` are neither. They are auto-approved, there is
 * no security assessment, no queue and no cap. So this asks for those three and
 * nothing else — and the moment it asks for more, all of the above comes back,
 * which is why the scope list below is a constant and not a setting.
 *
 * ── Authorization code, not implicit ──
 *
 * The browser never sees a token. It carries an opaque code to the Worker, the
 * Worker swaps it with Google over TLS using a secret the browser has never
 * held. The implicit flow puts an access token in a URL fragment, which lands
 * in history, in referrers and in anything watching the address bar.
 *
 * ── The check everything rests on ──
 *
 * `email_verified`. Anybody can create a Google account claiming an address;
 * only a verified one proves control of it. Without that check, signing in as
 * somebody else is a sign-up form away — which is the single way this feature
 * could hand over an existing account, so it is the one thing here that refuses
 * loudly rather than falling back.
 */
import { decryptSecret, encryptSecret, timingSafeEqual } from './crypto';
import { installSecret, nowIso, type Env } from './db';

const KIND = 'google_oauth';
const SECRET_KEY = 'mailbox_key';

const AUTH_URL = 'https://accounts.google.com/o/oauth2/v2/auth';
const TOKEN_URL = 'https://oauth2.googleapis.com/token';

/**
 * The three that stay non-sensitive.
 *
 * A constant, never configurable. Adding one sensitive scope — any Gmail or
 * Drive read — moves the whole app into the verification queue and reinstates
 * the hundred-user cap, and that must be a deliberate code change somebody
 * argues for, not a field an admin can fill in.
 */
const SCOPES = 'openid email profile';

export interface GoogleCreds {
  clientId: string;
  clientSecret: string;
}

export async function googleCreds(env: Env): Promise<GoogleCreds | null> {
  const row = await env.DB.prepare('SELECT credentials FROM crm_install_providers WHERE kind = ?')
    .bind(KIND).first<{ credentials: string }>();
  if (!row?.credentials) return null;
  try {
    const c = JSON.parse(await decryptSecret(await installSecret(env.DB, SECRET_KEY), row.credentials)) as GoogleCreds;
    return c.clientId && c.clientSecret ? c : null;
  } catch {
    return null;
  }
}

export async function saveGoogleCreds(
  env: Env, patch: Partial<GoogleCreds>,
): Promise<{ ok: boolean; error: string }> {
  const existing = await googleCreds(env);
  const merged: GoogleCreds = {
    clientId: (patch.clientId ?? '').trim() || existing?.clientId || '',
    /* Blank keeps the stored one, as everywhere else in this app. */
    clientSecret: (patch.clientSecret ?? '').trim() || existing?.clientSecret || '',
  };
  if (!merged.clientId || !merged.clientSecret) {
    return { ok: false, error: 'Both the client ID and the client secret are needed.' };
  }
  if (!merged.clientId.includes('.apps.googleusercontent.com')) {
    /* Caught before a customer meets it: a client ID of the wrong shape fails
       at Google with a message nobody can act on. */
    return { ok: false, error: 'That does not look like a Google client ID — they end in .apps.googleusercontent.com.' };
  }
  const blob = await encryptSecret(await installSecret(env.DB, SECRET_KEY), JSON.stringify(merged));
  await env.DB.prepare(
    `INSERT INTO crm_install_providers (kind, provider, credentials, status, last_error, updated_at)
     VALUES (?, 'google', ?, 'unknown', '', ?)
     ON CONFLICT(kind) DO UPDATE SET
       credentials = excluded.credentials, status = 'unknown', last_error = '',
       updated_at = excluded.updated_at`,
  ).bind(KIND, blob, nowIso()).run();
  return { ok: true, error: '' };
}

/** Where Google sends them back. Must match the console entry exactly. */
export const redirectUri = (origin: string): string => `${origin}/auth/google`;

/**
 * The one origin Google is ever told to come back to.
 *
 * Google matches a redirect URI character for character against the list in the
 * console. Every host that could start a sign-in would therefore have to be
 * registered there by hand — and resellers point their own domains at this app
 * whenever they like, so that list can never be complete. An unregistered one
 * does not degrade: it is `redirect_uri_mismatch`, a Google error page with our
 * client id on it, which is a worse first impression than no button at all.
 *
 * So there is exactly one entry to register, and the button is offered only on
 * that host. Everywhere else the emailed code and the password still work, and
 * `status` simply does not advertise Google — which is the honest version of
 * "this does not apply here".
 */
export const signInOrigin = (env: Env, requestOrigin: string): string =>
  (env.APP_ORIGIN || requestOrigin).replace(/\/$/, '');

/* ── State: CSRF protection without a table ──────────────────────────────── */

const b64url = (b: ArrayBuffer): string =>
  btoa(String.fromCharCode(...new Uint8Array(b))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');

async function sign(env: Env, payload: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    'raw', new TextEncoder().encode(await installSecret(env.DB, 'oauth_state')),
    { name: 'HMAC', hash: 'SHA-256' }, false, ['sign'],
  );
  return b64url(await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(payload)));
}

/**
 * A state nobody else can mint, and that stops being valid after ten minutes.
 *
 * Signed rather than stored. A state table would need a row per attempted
 * sign-in, a sweep, and a write on a path that has not authenticated anybody
 * yet — which is a table an anonymous caller can fill. An HMAC over a timestamp
 * proves the same thing with nothing to clean up.
 */
export async function makeState(env: Env): Promise<string> {
  const nonce = b64url(crypto.getRandomValues(new Uint8Array(16)).buffer);
  const payload = `${Date.now()}.${nonce}`;
  return `${payload}.${await sign(env, payload)}`;
}

export async function checkState(env: Env, state: string): Promise<boolean> {
  const parts = String(state ?? '').split('.');
  if (parts.length !== 3) return false;
  const [ts, nonce, mac] = parts;
  const age = Date.now() - Number(ts);
  if (!Number.isFinite(age) || age < 0 || age > 600_000) return false;
  /* Constant time: a byte-by-byte comparison tells a patient attacker how much
     of a forged signature was right. */
  return timingSafeEqual(mac, await sign(env, `${ts}.${nonce}`));
}

/** The address to send somebody to. Null when Google is not configured. */
export async function authorizeUrl(env: Env, origin: string, hint = ''): Promise<string | null> {
  const creds = await googleCreds(env);
  if (!creds) return null;
  const params = new URLSearchParams({
    client_id: creds.clientId,
    redirect_uri: redirectUri(origin),
    response_type: 'code',
    scope: SCOPES,
    state: await makeState(env),
  });
  if (/^[^\s@]{1,64}@[^\s@]{1,190}$/.test(hint)) {
    /* "Continue as …": the page named the account, so Google goes straight to
       it. The chooser's reason for existing — being handed whichever account
       the browser prefers — does not arise when the account is named. A hint
       is only a suggestion; Google still decides who is signed in, and the
       verified address it returns is the only one the server believes. */
    params.set('login_hint', hint);
  } else {
    /* Always show the chooser. Without it, somebody signed into two Google
       accounts is silently given whichever one the browser prefers, and finds
       out when the wrong name is in the corner of the app. */
    params.set('prompt', 'select_account');
  }
  return `${AUTH_URL}?${params.toString()}`;
}

export interface GoogleIdentity {
  email: string;
  name: string;
  /** Whether Google says the address is proven. Anything else is refused. */
  verified: boolean;
}

/** Base64url-decode one segment of a JWT. */
function decodeSegment(seg: string): Record<string, unknown> {
  const pad = seg.replace(/-/g, '+').replace(/_/g, '/');
  const json = atob(pad + '='.repeat((4 - (pad.length % 4)) % 4));
  return JSON.parse(json) as Record<string, unknown>;
}

/**
 * Swap the code for an identity.
 *
 * ── Why the ID token is not signature-checked here ──
 *
 * Because it did not arrive from the browser. This code path calls Google's
 * token endpoint directly over TLS and reads the response, so the channel is
 * the proof — which is exactly the case Google's own documentation says may
 * skip local signature validation. A token handed *in* by a client would need
 * the full check, and this never accepts one.
 */
export async function exchangeCode(
  env: Env, origin: string, code: string,
): Promise<{ ok: boolean; identity: GoogleIdentity | null; error: string }> {
  const creds = await googleCreds(env);
  if (!creds) return { ok: false, identity: null, error: 'Google sign-in is not set up on this installation.' };

  let res: Response;
  try {
    res = await fetch(TOKEN_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        code,
        client_id: creds.clientId,
        client_secret: creds.clientSecret,
        redirect_uri: redirectUri(origin),
        grant_type: 'authorization_code',
      }).toString(),
    });
  } catch (e) {
    return { ok: false, identity: null, error: `Could not reach Google: ${e instanceof Error ? e.message : String(e)}` };
  }

  const body = await res.json<{ id_token?: string; error_description?: string; error?: string }>()
    .catch(() => ({}) as Record<string, never>);
  if (!res.ok || !body.id_token) {
    return { ok: false, identity: null, error: body.error_description || body.error || `Google refused the sign-in (HTTP ${res.status}).` };
  }

  let claims: Record<string, unknown>;
  try {
    claims = decodeSegment(body.id_token.split('.')[1] ?? '');
  } catch {
    return { ok: false, identity: null, error: 'Google returned something that was not a sign-in token.' };
  }

  /* The audience must be *this* client. A token minted for another app is a
     valid Google token and says nothing about whether its holder may sign in
     here. */
  if (String(claims.aud ?? '') !== creds.clientId) {
    return { ok: false, identity: null, error: 'That sign-in was issued for a different application.' };
  }

  const email = String(claims.email ?? '').trim().toLowerCase();
  /* Google sends this as a boolean or the string "true" depending on the age of
     the endpoint. Both mean the same thing; anything else does not. */
  const verified = claims.email_verified === true || claims.email_verified === 'true';
  if (!email) return { ok: false, identity: null, error: 'Google did not return an email address.' };

  return { ok: true, identity: { email, name: String(claims.name ?? '').trim(), verified }, error: '' };
}
