/**
 * The face of whoever is signed in: their own photo once they have uploaded
 * one (Settings → Profile, /api/user-avatar.php). Until then there is no
 * picture to fetch — the animated orb stands in (shared/UserFace.tsx), drawn
 * in CSS, so nothing about the person goes to anybody to draw it.
 *
 * The photo's key is read once per page and shared by every place that draws
 * the face (top bar, dashboard welcome, Settings), like the other pulses.
 */
import { useEffect, useState } from 'react';
import { getSession, sessionToken } from './auth';
import { API_BASE } from './apiBase';

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

/** The signed-in person's photo, if they have one (`photo: false` → draw the orb). */
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
  return { src: key ? photoUrl(key) : '', photo: !!key, name: user?.name ?? '' };
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
