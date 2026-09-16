/**
 * The content review queue, and an account's standing, from the browser's side.
 *
 * Everything here is a thin call. The decisions are the server's — a queue that
 * could be emptied by a client that chose not to ask would be decorative.
 */
import { API_BASE } from './apiBase';
import { getSession, sessionToken } from './auth';

export type Category = 'adult' | 'violence' | 'politics' | 'hate' | 'illegal' | 'none';

export interface ReviewItem {
  id: string;
  accountId: string;
  surface: string;
  /** Empty for anything refused outright — that text is deliberately not kept. */
  excerpt: string;
  category: Category;
  matched: string;
  score: number;
  aiVerdict: string;
  aiReason: string;
  status: 'held' | 'approved' | 'rejected';
  decidedBy: string;
  decidedAt: string | null;
  note: string;
  createdAt: string;
  ownerEmail: string;
  ownerState: 'ok' | 'warned' | 'suspended';
}

export interface Standing {
  state: 'ok' | 'warned' | 'suspended';
  reason: string;
  clause: string;
}

export interface StandingRow extends Standing {
  email: string;
  setBy: string;
  seenAt: string | null;
  updatedAt: string;
}

export interface Counts { held: number; approved: number; rejected: number }

export interface PolicyState {
  version: string;
  /** False when they have never agreed, or agreed to an older version. */
  accepted: boolean;
}

async function call(action: string, extra: Record<string, unknown> = {}): Promise<Record<string, unknown>> {
  try {
    const r = await fetch(`${API_BASE}/api/moderation.php`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action, token: sessionToken(), ...extra }),
    });
    return await r.json() as Record<string, unknown>;
  } catch {
    return { success: false, error: 'Could not reach the server.' };
  }
}

/** Only the install owner. Everyone else gets an empty queue, not an error. */
export function isInstallOwner(): boolean {
  const u = getSession()?.user;
  return !!u && u.accountId == null && u.role === 'agency';
}

export async function loadQueue(status: 'held' | 'approved' | 'rejected' = 'held'):
Promise<{ items: ReviewItem[]; counts: Counts }> {
  const d = await call('queue', { status });
  return {
    items: (d.items as ReviewItem[]) ?? [],
    counts: (d.counts as Counts) ?? { held: 0, approved: 0, rejected: 0 },
  };
}

export async function decide(id: string, status: 'approved' | 'rejected', note: string):
Promise<{ ok: boolean; error: string }> {
  const d = await call('decide', { id, status, note });
  return { ok: d.success === true, error: String(d.error ?? '') };
}

export async function loadStandings(): Promise<StandingRow[]> {
  const d = await call('standings');
  return (d.standings as StandingRow[]) ?? [];
}

export async function setStanding(
  email: string, state: 'ok' | 'warned' | 'suspended', reason: string, clause: string,
): Promise<{ ok: boolean; error: string }> {
  const d = await call('set_standing', { email, state, reason, clause });
  return { ok: d.success === true, error: String(d.error ?? '') };
}

/**
 * Whether *this* account is under a warning or a suspension.
 *
 * Asked once per session rather than polled: standing changes when a person
 * decides something, which is not often, and the send itself refuses anyway.
 * This is only so the customer reads a sentence instead of watching a button
 * fail.
 */
export async function myStanding(): Promise<{ standing: Standing; policy: PolicyState }> {
  const blank = {
    standing: { state: 'ok' as const, reason: '', clause: '' },
    /* `accepted: true` when we could not ask. A bar demanding agreement to a
       policy the server never confirmed would nag every signed-out or offline
       session forever, which trains people to click past it. */
    policy: { version: '', accepted: true },
  };
  if (!getSession()) return blank;
  const d = await call('mine');
  if (d.success !== true) return blank;
  return {
    standing: (d.standing as Standing) ?? blank.standing,
    policy: (d.policy as PolicyState) ?? blank.policy,
  };
}

/** Agree to the current version. The server decides which version that is. */
export async function acceptPolicy(): Promise<boolean> {
  try {
    const r = await fetch(`${API_BASE}/api/auth.php`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'policy_accept', token: sessionToken() }),
    });
    return ((await r.json()) as { success?: boolean }).success === true;
  } catch { return false; }
}
