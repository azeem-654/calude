/**
 * Two-step sign-in: the six-digit code from an authenticator app (RFC 6238).
 *
 * ── Why this, and not SMS ──
 *
 * A code by text message can be taken by anyone who talks a phone company
 * into moving the number, and it costs money per sign-in. An authenticator app
 * (Google Authenticator, 1Password, Microsoft Authenticator…) works offline,
 * costs nothing, and is what every one of them already speaks.
 *
 * ── The standard, exactly ──
 *
 * HMAC-SHA1 over a 30-second counter, dynamic truncation, six digits — the
 * defaults every app assumes. Anything else (SHA-256, eight digits) works in
 * some apps and silently produces wrong codes in others, which is the worst
 * way for a second factor to fail. One step either side is accepted, because
 * a phone clock a few seconds out is normal.
 *
 * ── The ticket between the two steps ──
 *
 * A correct password with 2-step on does not create a session. It returns a
 * ticket: the address and a five-minute expiry, signed with an install secret.
 * The code is then checked against that ticket, so the second call cannot
 * name a different account and nothing has to be stored in between.
 */
import { installSecret, type Env } from './db';

const B32 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';

export function base32Encode(bytes: Uint8Array): string {
  let bits = 0; let value = 0; let out = '';
  for (const b of bytes) {
    value = (value << 8) | b; bits += 8;
    while (bits >= 5) { out += B32[(value >>> (bits - 5)) & 31]; bits -= 5; }
  }
  if (bits > 0) out += B32[(value << (5 - bits)) & 31];
  return out;
}

export function base32Decode(text: string): Uint8Array {
  const clean = text.toUpperCase().replace(/[^A-Z2-7]/g, '');
  let bits = 0; let value = 0; const out: number[] = [];
  for (const ch of clean) {
    value = (value << 5) | B32.indexOf(ch); bits += 5;
    if (bits >= 8) { out.push((value >>> (bits - 8)) & 255); bits -= 8; }
  }
  return new Uint8Array(out);
}

/** 160 random bits, as the apps expect. */
export function newTotpSecret(): string {
  return base32Encode(crypto.getRandomValues(new Uint8Array(20)));
}

async function hotp(secret: string, counter: number): Promise<string> {
  const key = await crypto.subtle.importKey('raw', base32Decode(secret), { name: 'HMAC', hash: 'SHA-1' }, false, ['sign']);
  const msg = new ArrayBuffer(8);
  const view = new DataView(msg);
  view.setUint32(0, Math.floor(counter / 2 ** 32));
  view.setUint32(4, counter >>> 0);
  const mac = new Uint8Array(await crypto.subtle.sign('HMAC', key, msg));
  const off = mac[mac.length - 1] & 15;
  const n = ((mac[off] & 127) << 24) | (mac[off + 1] << 16) | (mac[off + 2] << 8) | mac[off + 3];
  return String(n % 1_000_000).padStart(6, '0');
}

export async function totpAt(secret: string, unixSeconds: number): Promise<string> {
  return hotp(secret, Math.floor(unixSeconds / 30));
}

/** Is this the current code, give or take one step of clock drift? */
export async function verifyTotp(secret: string, code: string, now = Date.now()): Promise<boolean> {
  const c = String(code ?? '').replace(/\s/g, '');
  if (!/^\d{6}$/.test(c) || !secret) return false;
  const t = Math.floor(now / 1000);
  let hit = false;
  /* All three are computed, and compared without an early return, so the time
     taken does not say which window matched. */
  for (const d of [-30, 0, 30]) {
    const want = await totpAt(secret, t + d);
    let diff = 0;
    for (let i = 0; i < 6; i++) diff |= want.charCodeAt(i) ^ c.charCodeAt(i);
    if (diff === 0) hit = true;
  }
  return hit;
}

/** The link an authenticator app reads from a QR code. */
export function otpauthUrl(secret: string, email: string, issuer = 'Protected Central'): string {
  const label = encodeURIComponent(`${issuer}:${email}`);
  return `otpauth://totp/${label}?secret=${secret}&issuer=${encodeURIComponent(issuer)}&algorithm=SHA1&digits=6&period=30`;
}

/* ── The ticket ── */

const b64url = (buf: ArrayBuffer | Uint8Array) => btoa(String.fromCharCode(...new Uint8Array(buf)))
  .replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');

async function ticketKey(env: Env): Promise<CryptoKey> {
  return crypto.subtle.importKey(
    'raw', new TextEncoder().encode(await installSecret(env.DB, 'mfa_ticket')),
    { name: 'HMAC', hash: 'SHA-256' }, false, ['sign', 'verify'],
  );
}

export async function signTicket(env: Env, email: string, method: string): Promise<string> {
  const payload = `${email}|${Date.now() + 5 * 60_000}|${method}`;
  const sig = await crypto.subtle.sign('HMAC', await ticketKey(env), new TextEncoder().encode(payload));
  return `${b64url(new TextEncoder().encode(payload))}.${b64url(sig)}`;
}

export async function readTicket(env: Env, ticket: string): Promise<{ email: string; method: string } | null> {
  const [p, s] = String(ticket ?? '').split('.');
  if (!p || !s) return null;
  try {
    const dec = (x: string) => Uint8Array.from(atob(x.replace(/-/g, '+').replace(/_/g, '/')), ch => ch.charCodeAt(0));
    const payload = dec(p);
    const ok = await crypto.subtle.verify('HMAC', await ticketKey(env), dec(s), payload);
    if (!ok) return null;
    const [email, exp, method] = new TextDecoder().decode(payload).split('|');
    if (!email || Number(exp) < Date.now()) return null;
    return { email, method: method ?? '' };
  } catch { return null; }
}
