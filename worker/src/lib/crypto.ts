/**
 * Password hashing, session tokens and the unsubscribe signature.
 *
 * PHP used bcrypt. Workers have no bcrypt and WebCrypto has no bcrypt either,
 * so this uses PBKDF2-HMAC-SHA256 — the strongest password KDF the platform
 * ships natively. Pulling in a WASM bcrypt to preserve a hash format would be
 * a dependency, a cold-start cost and a supply-chain risk for no security gain.
 *
 * The stored string records its own parameters:
 *
 *     pbkdf2$sha256$100000$<salt-b64>$<hash-b64>
 *
 * so the iteration count can be raised later and old rows still verify against
 * the count they were written with, rather than silently failing.
 */

/**
 * 100,000 is the ceiling, not a preference.
 *
 * OWASP's current floor for PBKDF2-HMAC-SHA256 is 210,000, which is what this
 * used at first — and the Workers runtime refuses it outright:
 * "Pbkdf2 failed: iteration counts above 100000 are not supported". So this is
 * the strongest the platform will actually run. It remains a respectable work
 * factor, and because the stored string records the count it was written with,
 * raising it later if Cloudflare lifts the cap will not strand existing rows.
 */
const ITERATIONS = 100_000;
const KEY_BITS = 256;

const enc = new TextEncoder();

function b64(bytes: ArrayBuffer | Uint8Array): string {
  const arr = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
  let s = '';
  for (const b of arr) s += String.fromCharCode(b);
  return btoa(s);
}

function unb64(s: string): Uint8Array {
  const bin = atob(s);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

async function derive(password: string, salt: Uint8Array, iterations: number): Promise<string> {
  const key = await crypto.subtle.importKey('raw', enc.encode(password), 'PBKDF2', false, ['deriveBits']);
  const bits = await crypto.subtle.deriveBits(
    { name: 'PBKDF2', salt: salt as BufferSource, iterations, hash: 'SHA-256' },
    key,
    KEY_BITS,
  );
  return b64(bits);
}

export async function hashPassword(password: string): Promise<string> {
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const hash = await derive(password, salt, ITERATIONS);
  return `pbkdf2$sha256$${ITERATIONS}$${b64(salt)}$${hash}`;
}

/**
 * Verify, in constant time with respect to the hash contents.
 *
 * A bcrypt hash left over from the PHP install returns false rather than
 * throwing — the account simply needs its password set again, which the agency
 * password reset already does. Silently accepting it would be worse.
 */
export async function verifyPassword(password: string, stored: string): Promise<boolean> {
  const parts = (stored || '').split('$');
  if (parts.length !== 5 || parts[0] !== 'pbkdf2' || parts[1] !== 'sha256') return false;
  const iterations = Number(parts[2]);
  if (!Number.isFinite(iterations) || iterations < 1000) return false;
  let salt: Uint8Array;
  try { salt = unb64(parts[3]); } catch { return false; }
  const expect = parts[4];
  const got = await derive(password, salt, iterations);
  return timingSafeEqual(got, expect);
}

/** Compare without leaking, through timing, how much of the string matched. */
export function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

/** A session token: 24 random bytes, hex, same length the PHP issued. */
export function newToken(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(24));
  return [...bytes].map(b => b.toString(16).padStart(2, '0')).join('');
}

/**
 * The unsubscribe link's signature.
 *
 * A one-click opt-out URL is handed to mail providers, which fetch it without
 * a session. Signing the address means the endpoint can trust the address in
 * the query string without anyone being able to forge an opt-out for somebody
 * they do not like.
 */
export async function signAddress(secret: string, email: string, campaignId = ''): Promise<string> {
  const key = await crypto.subtle.importKey(
    'raw', enc.encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign'],
  );
  const mac = await crypto.subtle.sign('HMAC', key, enc.encode(`${email.toLowerCase()}|${campaignId}`));
  return [...new Uint8Array(mac)].map(b => b.toString(16).padStart(2, '0')).join('').slice(0, 32);
}

/* ── Secrets held on the customer's behalf ───────────────────────────────── */

/**
 * A customer's mailbox password is not ours to read.
 *
 * It has to be *reversible* — SMTP needs the actual password to authenticate,
 * so this cannot be a hash the way an account password is. What it can be is
 * encrypted at rest, so the database alone is not enough to send mail as
 * somebody else. AES-GCM also authenticates, so a tampered row fails to
 * decrypt rather than quietly returning something wrong.
 *
 * The key lives in one row of crm_meta, generated once per install. That means
 * a stolen database dump is useless without it, and equally that losing it
 * loses every stored mailbox — which is the right trade when the alternative
 * is storing passwords in the clear.
 */
export async function encryptSecret(keyHex: string, plaintext: string): Promise<string> {
  if (!plaintext) return '';
  const key = await aesKey(keyHex);
  /* A fresh 12-byte nonce every time: reusing one under the same key is the
     single way to break GCM. It is stored alongside, which is normal — a nonce
     is not a secret, it only has to be unique. */
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const ct = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, new TextEncoder().encode(plaintext));
  return `v1.${b64(iv)}.${b64(ct)}`;
}

export async function decryptSecret(keyHex: string, stored: string): Promise<string> {
  if (!stored) return '';
  const parts = stored.split('.');
  if (parts.length !== 3 || parts[0] !== 'v1') return '';
  try {
    const key = await aesKey(keyHex);
    const iv = unb64(parts[1]);
    const ct = unb64(parts[2]);
    const out = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: iv as BufferSource }, key, ct as BufferSource);
    return new TextDecoder().decode(out);
  } catch {
    /* Wrong key, or the row was tampered with. Returning '' makes the send
       fail with the mail server's own "authentication failed", which is a
       confusing symptom — so callers should treat '' as "re-enter it". */
    return '';
  }
}

async function aesKey(keyHex: string): Promise<CryptoKey> {
  const bytes = new Uint8Array(keyHex.length / 2);
  for (let i = 0; i < bytes.length; i++) bytes[i] = parseInt(keyHex.slice(i * 2, i * 2 + 2), 16);
  return crypto.subtle.importKey('raw', bytes as BufferSource, 'AES-GCM', false, ['encrypt', 'decrypt']);
}
