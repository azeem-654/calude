/**
 * publishedPages.ts — client for api/published.php: websites and funnels on
 * the open web at /s/<slug> (audit H3/H4).
 *
 * The server is the only record of what is public. The `status` flag on a
 * Website or Funnel in synced storage is kept in step for older readers, but
 * every screen that says "Published" asks here, because the flag was exactly
 * what said "Published" for years while nothing was.
 *
 * One shared answer per workspace, so a publish in the builder shows up on
 * the list behind it without a second fetch.
 */
import { useEffect, useState } from 'react';
import { API_BASE } from './apiBase';
import { getActiveAccountId } from './tenancy';
import { getSession } from './auth';
import { flushNow } from './serverData';

export type PublishKind = 'site' | 'funnel';

export interface PublishedPage {
  kind: PublishKind;
  itemId: string;
  slug: string;
  name: string;
  views: number;
  publishedAt: string;
  updatedAt: string;
}

/** What the screens read: `null` until the server has answered (or when it cannot be reached). */
export interface PublishedState {
  loaded: boolean;
  /** Set when the server could not be asked — screens say so rather than showing "Draft". */
  error: string;
  byKey: Record<string, PublishedPage>;
}

const keyOf = (kind: PublishKind, itemId: string) => `${kind}:${itemId}`;

let state: PublishedState = { loaded: false, error: '', byKey: {} };
let stateAccount = '';
let inflight: Promise<void> | null = null;
const listeners = new Set<(s: PublishedState) => void>();
const emit = () => listeners.forEach(fn => fn(state));

async function call(body: Record<string, unknown>): Promise<{ success?: boolean; error?: string; code?: string; [k: string]: unknown } | null> {
  try {
    const r = await fetch(`${API_BASE}/api/published.php`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
    });
    return await r.json();
  } catch { return null; }
}

const signedIn = () => ({ token: getSession()?.token || 'cookie', accountId: getActiveAccountId() ?? '' });

/** The public address of a slug, on whichever host the owner is using (a reseller's domain keeps its own). */
export function publicUrl(slug: string): string {
  const base = (import.meta.env.BASE_URL || '/').replace(/\/$/, '');
  return `${window.location.origin}${base}/s/${slug}`;
}

/** Ask the server which of this workspace's sites and funnels are public. */
export function refreshPublished(): Promise<void> {
  const acct = getActiveAccountId() ?? '';
  if (acct !== stateAccount) { state = { loaded: false, error: '', byKey: {} }; stateAccount = acct; }
  if (inflight) return inflight;
  inflight = (async () => {
    const res = await call({ action: 'status', ...signedIn() });
    if (!res || !res.success) {
      state = { ...state, loaded: true, error: res?.error ? String(res.error) : 'The server could not be reached, so whether this is public is not known right now.' };
    } else {
      const byKey: Record<string, PublishedPage> = {};
      for (const p of (res.pages as PublishedPage[] | undefined) ?? []) byKey[keyOf(p.kind, p.itemId)] = p;
      state = { loaded: true, error: '', byKey };
    }
    emit();
  })().finally(() => { inflight = null; });
  return inflight;
}

/** The shared answer, fetched once per mount of the first screen that asks. */
export function usePublished(): PublishedState & { get: (kind: PublishKind, itemId: string) => PublishedPage | undefined } {
  const [s, setS] = useState<PublishedState>(state);
  useEffect(() => {
    listeners.add(setS);
    void refreshPublished();
    return () => { listeners.delete(setS); };
  }, []);
  return { ...s, get: (kind, itemId) => s.byKey[keyOf(kind, itemId)] };
}

/**
 * Publish (or publish the changes to) a site or funnel. The server reads it
 * from the account's stored data, so whatever is still waiting in the sync
 * queue is pushed first — otherwise "Publish changes" would publish the edit
 * before last.
 */
export async function publishItem(kind: PublishKind, itemId: string): Promise<{ ok: boolean; slug?: string; error?: string }> {
  /* The builder's save runs inside a React state updater, which React may
     run on the next render rather than at the call — so give it that render
     before pushing the queue, or the flush can go out without the edit. */
  await new Promise(r => setTimeout(r, 60));
  await flushNow().catch(() => undefined);
  const res = await call({ action: 'publish', kind, id: itemId, ...signedIn() });
  if (!res) return { ok: false, error: 'The server could not be reached. Nothing was published.' };
  if (!res.success) return { ok: false, error: String(res.error ?? 'That could not be published.') };
  await refreshPublished();
  return { ok: true, slug: String(res.slug ?? '') };
}

export async function unpublishItem(kind: PublishKind, itemId: string): Promise<{ ok: boolean; error?: string }> {
  const res = await call({ action: 'unpublish', kind, id: itemId, ...signedIn() });
  if (!res) return { ok: false, error: 'The server could not be reached. The page is still public.' };
  if (!res.success) return { ok: false, error: String(res.error ?? 'That could not be taken down.') };
  await refreshPublished();
  return { ok: true };
}
