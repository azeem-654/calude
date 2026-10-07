/**
 * The face of whoever is signed in: their own photo when they have uploaded
 * one (Settings → Profile, /api/user-avatar.php), otherwise an illustrated
 * avatar drawn from their address.
 *
 * ── Why the illustrated one is drawn here, not fetched ──
 *
 * The owner asked for "modern AI avatars, a different one for different
 * customers". Asking an avatar service for one would send every customer's
 * address (or a hash of it) to a third party on every page load. DiceBear's
 * Lorelei style is bundled instead (design CC0, code MIT) and seeded by the
 * address, so the same person always gets the same face and nobody is asked.
 *
 * The photo's key is read once per page and shared by every place that draws
 * the face (top bar, dashboard welcome), like the other pulses.
 */
import { useEffect, useState } from 'react';
import { createAvatar } from '@dicebear/core';
import * as lorelei from '@dicebear/lorelei';
import { getSession, sessionToken } from './auth';
import { API_BASE } from './apiBase';

const BACKGROUNDS = ['c7d2fe', 'fbcfe8', 'bae6fd', 'ddd6fe', 'fde68a', 'a7f3d0', 'fecdd3', 'bfdbfe'];

const drawn = new Map<string, string>();
/** The illustrated avatar for an address — the same face every time. */
export function illustratedAvatar(seed: string): string {
  const key = seed.trim().toLowerCase() || 'guest';
  let uri = drawn.get(key);
  if (!uri) {
    uri = createAvatar(lorelei, {
      seed: key,
      backgroundColor: BACKGROUNDS,
      backgroundType: ['gradientLinear'],
      backgroundRotation: [0, 360],
    }).toDataUri();
    drawn.set(key, uri);
  }
  return uri;
}

export const photoUrl = (key: string): string => (key ? `${API_BASE}/api/user-avatar.php?k=${key}` : '');

let photoKey: string | null = null;
let forEmail = '';
let inFlight: Promise<void> | null = null;
const listeners = new Set<() => void>();
const publish = (k: string) => { photoKey = k; listeners.forEach(f => f()); };

async function call(body: Record<string, unknown>): Promise<{ success?: boolean; key?: string; error?: string }> {
  const r = await fetch(`${API_BASE}/api/user-avatar.php`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ ...body, token: sessionToken() }),
  });
  return r.json();
}

function load(): void {
  const email = getSession()?.user.email ?? '';
  if (email !== forEmail) { forEmail = email; photoKey = null; }
  if (!email || photoKey !== null || inFlight) return;
  inFlight = call({ action: 'get' })
    .then(d => publish(d.success ? d.key ?? '' : ''))
    .catch(() => publish(''))
    .finally(() => { inFlight = null; });
}

export interface MyAvatar { src: string; photo: boolean; name: string }

/** The signed-in person's face: their photo if they have one, else their illustrated avatar. */
export function useMyAvatar(): MyAvatar {
  const [, tick] = useState(0);
  useEffect(() => {
    const f = () => tick(n => n + 1);
    listeners.add(f);
    load();
    return () => { listeners.delete(f); };
  }, []);
  const user = getSession()?.user;
  const key = user?.email === forEmail ? photoKey : null;
  return key
    ? { src: photoUrl(key), photo: true, name: user?.name ?? '' }
    : { src: illustratedAvatar(user?.email || user?.name || ''), photo: false, name: user?.name ?? '' };
}

/** Upload a photo (already shrunk to ≤256 px), or remove it with `null`. */
export async function setMyPhoto(dataUrl: string | null): Promise<{ ok: boolean; error?: string }> {
  try {
    const d = await call(dataUrl ? { action: 'set', image: dataUrl } : { action: 'clear' });
    if (!d.success) return { ok: false, error: d.error ?? 'The photo could not be saved.' };
    publish(d.key ?? '');
    return { ok: true };
  } catch {
    return { ok: false, error: 'The photo could not be saved — check your connection.' };
  }
}

/** A picture file, shrunk in the browser to a square JPEG of at most 256 px. */
export function shrinkPhoto(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      const side = Math.min(img.naturalWidth, img.naturalHeight);
      const out = Math.min(256, side);
      const c = document.createElement('canvas');
      c.width = out; c.height = out;
      const g = c.getContext('2d')!;
      g.imageSmoothingQuality = 'high';
      g.drawImage(img, (img.naturalWidth - side) / 2, (img.naturalHeight - side) / 2, side, side, 0, 0, out, out);
      URL.revokeObjectURL(url);
      resolve(c.toDataURL('image/jpeg', 0.86));
    };
    img.onerror = () => { URL.revokeObjectURL(url); reject(new Error('That file is not a picture.')); };
    img.src = url;
  });
}
