/**
 * The link at the bottom of every campaign.
 *
 * `{{unsubscribe}}` merged to the literal string "#unsubscribe" — an anchor to
 * nowhere. Somebody who wanted off a customer's list had no way off it, and the
 * only button left to them was "report spam", which is the fastest way there is
 * to lose a sending domain. It is also required by law in most of the places
 * this product is sold.
 *
 * The address is signed by the server, so a link out of one person's email is
 * not a template for unsubscribing anybody else. That means one round trip per
 * address; the answers are cached for the session, because a campaign to two
 * hundred people would otherwise ask two hundred times for the same thing.
 */
import { getSession } from './auth';
import { getActiveAccountId } from './tenancy';
import { isSuppressed, suppress } from './deliverability';

const SYNC_KEY = 'crm_unsub_synced_at';

/** Absolute base for the PHP endpoint on this deployment. */
function endpoint(): string {
  const base = (import.meta.env.BASE_URL || '/').replace(/\/$/, '');
  return `${window.location.origin}${base}/api/unsubscribe.php`;
}

/* One signature per address, for as long as the tab is open. */
const signatures = new Map<string, string>();

/**
 * The unsubscribe link for one recipient, or null when the server cannot sign
 * it — an unsigned link is worse than none, because it would fail on click and
 * teach the recipient the button does not work.
 */
export async function unsubscribeUrl(email: string, campaignId = ''): Promise<string | null> {
  const address = email.trim().toLowerCase();
  if (!address) return null;
  const account = getActiveAccountId() || 'default';
  const cacheKey = `${account}|${address}`;

  let signature = signatures.get(cacheKey);
  if (!signature) {
    try {
      const res = await fetch(
        `${endpoint()}?sign=1&e=${encodeURIComponent(address)}&a=${encodeURIComponent(account)}&token=${encodeURIComponent(getSession()?.token ?? '')}`,
      );
      const data = await res.json() as { success?: boolean; signature?: string };
      if (!data?.success || !data.signature) return null;
      signature = data.signature;
      signatures.set(cacheKey, signature);
    } catch {
      return null;
    }
  }

  const q = new URLSearchParams({ e: address, a: account, t: signature });
  if (campaignId) q.set('c', campaignId);
  return `${endpoint()}?${q.toString()}`;
}

/**
 * Put the real link into a body, wherever the token was left.
 *
 * When no link could be signed the token is replaced with plain text rather
 * than left showing `{{unsubscribe}}` to the recipient — a merge field that
 * arrives unmerged is the most obvious sign of a mailing gone wrong.
 */
export function applyUnsubscribe(html: string, url: string | null): string {
  if (!/\{\{\s*unsubscribe\s*\}\}/i.test(html)) return html;
  return html.replace(/\{\{\s*unsubscribe\s*\}\}/gi, url ?? '#');
}

export interface UnsubEntry {
  email: string;
  account: string;
  campaign?: string;
  at: string;
  source?: string;
}

/**
 * Fold anybody who opted out into the suppression list.
 *
 * The list lives in the browser and the opt-outs arrive at the server, so the
 * two have to be introduced. Runs on the same schedule as the open/click sync.
 */
export async function syncUnsubscribes(): Promise<number> {
  const account = getActiveAccountId() || 'default';
  let since = '';
  try { since = localStorage.getItem(SYNC_KEY) || ''; } catch { /* storage blocked */ }

  let entries: UnsubEntry[];
  try {
    const res = await fetch(`${endpoint()}?list=1&a=${encodeURIComponent(account)}&since=${encodeURIComponent(since)}`);
    const data = await res.json() as { entries?: UnsubEntry[] };
    entries = Array.isArray(data?.entries) ? data.entries : [];
  } catch {
    return 0;
  }

  let added = 0;
  let newest = since;
  for (const e of entries) {
    if (!e?.email) continue;
    /* suppress() answers with the row either way, so "was it already there"
       has to be asked before, or a re-sync would report the same opt-outs as
       new every time it ran. */
    const wasNew = !isSuppressed(e.email);
    suppress(e.email, 'unsubscribed', e.source === 'one-click'
      ? 'Unsubscribed from their mail client'
      : 'Unsubscribed from the link in an email');
    if (wasNew) added += 1;
    if (e.at && e.at > newest) newest = e.at;
  }
  if (newest && newest !== since) {
    try { localStorage.setItem(SYNC_KEY, newest); } catch { /* storage blocked */ }
  }
  return added;
}
