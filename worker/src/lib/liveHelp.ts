/**
 * Live help — the pieces both sides of a screen-sharing session share.
 *
 * A voice call ("Call us now", migration 0061) is the same session with a
 * microphone instead of a screen: `kind` says which, and everything below
 * holds for both — except how long a request waits, which differs because a
 * person listening to a ring will not wait twenty minutes.
 *
 * The public route (`engage.ts`) serves the person sharing their screen; the
 * signed-in route (`engagement.ts`) serves the person watching. Both need the
 * same answer to "how do two browsers find each other", the same rule for
 * what a session description may contain, and the same idea of when a request
 * nobody picked up has gone stale.
 */
import { nowIso, type Env } from './db';

/**
 * How two browsers find each other.
 *
 * STUN alone — a public server that tells a browser its own outside address —
 * connects most home and office networks directly. It does not get through a
 * strict corporate firewall or some mobile carriers, and there the call simply
 * never connects. A TURN server relays the traffic in those cases.
 *
 * Cloudflare's TURN service is used when the operator has set both
 * `TURN_KEY_ID` and `TURN_KEY_API_TOKEN`. Credentials are minted per session
 * and expire, so what the browser is handed is useless a few hours later.
 * Without them the session still works where a direct route exists, and both
 * screens say so when it does not rather than spinning.
 */
export async function iceServers(env: Env): Promise<{ servers: RTCIceServerLike[]; relay: boolean }> {
  const stun: RTCIceServerLike[] = [
    { urls: ['stun:stun.cloudflare.com:3478', 'stun:stun.l.google.com:19302'] },
  ];
  if (!env.TURN_KEY_ID || !env.TURN_KEY_API_TOKEN) return { servers: stun, relay: false };

  try {
    const res = await fetch(
      `https://rtc.live.cloudflare.com/v1/turn/keys/${encodeURIComponent(env.TURN_KEY_ID)}/credentials/generate-ice-servers`,
      {
        method: 'POST',
        headers: { Authorization: `Bearer ${env.TURN_KEY_API_TOKEN}`, 'Content-Type': 'application/json' },
        /* Four hours: longer than any support call, short enough that a
           credential copied out of a browser is soon worthless. */
        body: JSON.stringify({ ttl: 14_400 }),
      },
    );
    if (!res.ok) return { servers: stun, relay: false };
    const data = await res.json() as { iceServers?: RTCIceServerLike | RTCIceServerLike[] };
    const list = Array.isArray(data.iceServers) ? data.iceServers : data.iceServers ? [data.iceServers] : [];
    /* Port 53 is dropped: browsers refuse it, and Chrome waits for it to time
       out before trying the next address, which adds seconds to every call. */
    const cleaned = list.map(s => ({
      ...s,
      urls: (Array.isArray(s.urls) ? s.urls : [s.urls]).filter(u => !/:53(\?|$)/.test(u)),
    })).filter(s => s.urls.length);
    return cleaned.length ? { servers: cleaned, relay: true } : { servers: stun, relay: false };
  } catch {
    return { servers: stun, relay: false };
  }
}

export interface RTCIceServerLike { urls: string | string[]; username?: string; credential?: string }

/**
 * A session description, or nothing.
 *
 * It is a text blob one browser writes and another feeds straight to
 * `setRemoteDescription`. Checked for shape and size only: its contents are
 * addresses and codecs, and the browser reading it is the real validator. The
 * size cap is what matters here — a public endpoint that stores whatever it is
 * given is a free file host.
 */
export function cleanSdp(v: unknown): string {
  const s = String(v ?? '');
  if (s.length < 20 || s.length > 24_000) return '';
  if (!s.startsWith('v=0')) return '';
  return s;
}

/**
 * When a session is over without anybody saying so.
 *
 * Nobody picked it up in twenty minutes: whoever is still sitting in front of
 * "waiting for support" has been let down already, and their screen tells them
 * to leave a ticket instead. Or the sharer's page has stopped asking about it
 * for three: a closed tab sends nothing, and without this the other screen
 * would show a live session with nobody at the far end.
 */
export const WAIT_MINUTES = 20;
const GONE_MINUTES = 3;

/**
 * How long a voice call rings before the visitor is told nobody is free.
 *
 * Not the twenty minutes a screen-share request waits. Somebody sharing a
 * screen has said what is wrong and can keep working while they wait; somebody
 * who pressed "Call us now" is sitting listening to a ring, and a minute and a
 * quarter of that is already longer than most people hold. After it they are
 * offered a message or a ticket instead, which is the honest answer.
 */
export const RING_SECONDS = 75;

/** Close what has gone stale for one workspace. Cheap: one indexed update. */
export async function sweepLive(env: Env, accountId: string): Promise<void> {
  const waitCut = new Date(Date.now() - WAIT_MINUTES * 60_000).toISOString();
  const ringCut = new Date(Date.now() - RING_SECONDS * 1000).toISOString();
  const goneCut = new Date(Date.now() - GONE_MINUTES * 60_000).toISOString();
  const now = nowIso();
  await env.DB.prepare(
    `UPDATE crm_live_sessions
     SET status = 'ended', ended_at = ?, updated_at = ?,
         ended_reason = CASE WHEN seen_at < ? THEN 'left' ELSE 'expired' END
     WHERE account_id = ? AND status IN ('waiting', 'live')
       AND (seen_at < ? OR (status = 'waiting' AND created_at < CASE WHEN kind = 'voice' THEN ? ELSE ? END))`,
  ).bind(now, now, goneCut, accountId, goneCut, ringCut, waitCut).run().catch(() => undefined);
}

/** How often the sharer's page must ask for `seen_at` to be worth rewriting. */
export const SEEN_EVERY_MS = 45_000;

/** Does this widget offer one of its features ("screen", "voice", …)? */
export function offers(features: unknown, feature: string): boolean {
  try {
    const list = JSON.parse(String(features ?? '[]')) as unknown;
    return Array.isArray(list) && list.includes(feature);
  } catch {
    return false;
  }
}

/** Does this widget offer screen sharing? */
export const offersScreen = (features: unknown): boolean => offers(features, 'screen');

/** The two kinds of live session; each is switched on by the widget feature of the same name. */
export type LiveKind = 'screen' | 'voice';
export const liveKind = (v: unknown): LiveKind => (v === 'voice' ? 'voice' : 'screen');

/* ── Is anybody there ─────────────────────────────────────────────────────── */

/** Somebody's page asked within this long: a person could pick up. */
const PRESENT_SECONDS = 120;

/**
 * A signed-in page of this workspace is open and visible right now.
 *
 * Written by the business side's incoming-call check, which only asks while
 * the page is visible, and at most once a minute — a read every few seconds
 * from every open tab must not become a write every few seconds.
 */
export async function markPresent(env: Env, accountId: string): Promise<void> {
  const cut = new Date(Date.now() - 60_000).toISOString();
  const now = nowIso();
  await env.DB.prepare(
    `INSERT INTO crm_live_presence (account_id, seen_at) VALUES (?, ?)
     ON CONFLICT(account_id) DO UPDATE SET seen_at = excluded.seen_at
     WHERE crm_live_presence.seen_at < ?`,
  ).bind(accountId, now, cut).run().catch(() => undefined);
}

/** Whether a person at this workspace could pick up now. */
export async function isPresent(env: Env, accountId: string): Promise<boolean> {
  const cut = new Date(Date.now() - PRESENT_SECONDS * 1000).toISOString();
  const row = await env.DB.prepare('SELECT 1 AS ok FROM crm_live_presence WHERE account_id = ? AND seen_at >= ?')
    .bind(accountId, cut).first<{ ok: number }>().catch(() => null);
  return !!row;
}
