/**
 * Who has said "stop", and the link that lets them say it.
 *
 * One place, because there were three answers. The unsubscribe link records
 * into `crm_unsubscribes`; the suppression list the browser edits lives under
 * two keys the app has used over time (`crm_suppression_list`,
 * `crm_suppressions`); and `crm_suppression_list` was only filled with the
 * opt-outs when somebody happened to open that screen. Sequence and
 * automation mail checked none of them, so a person who unsubscribed kept
 * getting the next step. Every marketing sender asks here before `deliver`.
 */
import { dataGet, installSecret, type Env } from './db';
import { signAddress } from './crypto';

const LIST_KEYS = ['crm_suppression_list', 'crm_suppressions'] as const;

/** Every suppressed address for a workspace, lowercased. One read per run. */
export async function suppressedSet(env: Env, accountId: string): Promise<Set<string>> {
  const out = new Set<string>();
  for (const key of LIST_KEYS) {
    let rows: unknown = [];
    try { rows = JSON.parse((await dataGet(env.DB, accountId, key)) ?? '[]'); } catch { rows = []; }
    for (const x of Array.isArray(rows) ? rows : []) {
      const e = (typeof x === 'string' ? x : (x as { email?: string } | null)?.email ?? '').trim().toLowerCase();
      if (e) out.add(e);
    }
  }
  const u = await env.DB.prepare('SELECT email FROM crm_unsubscribes WHERE account_id = ? LIMIT 20000')
    .bind(accountId).all<{ email: string }>().catch(() => ({ results: [] as { email: string }[] }));
  for (const r of u.results ?? []) out.add(String(r.email).toLowerCase());
  return out;
}

/** Has this address opted out of this workspace's mail? */
export async function isSuppressed(env: Env, accountId: string, email: string): Promise<boolean> {
  return (await suppressedSet(env, accountId)).has(String(email ?? '').trim().toLowerCase());
}

/**
 * The signed one-click opt-out for this address (routes/unsubscribe.ts): the
 * footer link and the List-Unsubscribe header both point here. '' when the
 * deployment has no APP_ORIGIN — a scheduled run has no request to take one
 * from, and a relative link in an email goes nowhere.
 */
export async function unsubscribeUrl(env: Env, accountId: string, email: string, campaign = ''): Promise<string> {
  const origin = (env.APP_ORIGIN ?? '').trim().replace(/\/$/, '');
  if (!origin || !email) return '';
  const e = email.trim().toLowerCase();
  const t = await signAddress(await installSecret(env.DB, 'unsub_key'), e, accountId);
  return `${origin}/api/unsubscribe.php?${new URLSearchParams({ e, a: accountId, ...(campaign ? { c: campaign } : {}), t }).toString()}`;
}

const escAttr = (v: string) => v.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

/**
 * The body with its opt-out link. A writer who placed `{{unsubscribe}}`
 * (filled by `personalise` from `Person.unsubscribeUrl`) already has it;
 * otherwise a short footer is added. Never none when there is a link.
 */
export function withUnsubscribe(html: string, url: string): string {
  if (!url) return html;
  const href = escAttr(url);
  if (html.includes(href) || html.includes(url)) return html;
  return `${html}<p style="margin-top:24px;font-size:12px;color:#64748b">Don’t want these emails? <a href="${href}" style="color:#64748b">Unsubscribe</a>.</p>`;
}
