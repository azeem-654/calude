/**
 * One AI key vault for both sites.
 *
 * The owner adds AI keys once, on the live app, and the testing site uses
 * them too (owner's request, 2026-11-12). The two sites still never share a
 * database — that rule is about customers' mail, money and rows — only the
 * AI keys cross, and only in one direction: live → testing.
 *
 * ── Why a service binding, and not copying rows ──
 *
 * Keys are encrypted with each database's own install secret (db.ts
 * `installSecret`), optionally wrapped with CREDENTIAL_WRAP_KEY, so a row
 * copied from `crmpro` to `crmpro-staging` cannot be opened there. Copying
 * them decrypted would put plaintext keys in a CI log or a script. Instead
 * the live Worker exports an RPC entrypoint, `AiVault` (index.ts), and the
 * staging Worker binds to it (`LIVE_VAULT` in wrangler.jsonc, staging only).
 * An RPC method on a named entrypoint is reachable only through a binding in
 * the same Cloudflare account — it has no URL, so there is no public endpoint
 * that could leak the keys and no shared token to guard.
 *
 * ── What testing does with them ──
 *
 * They go at the back of its own pool (aiPool.ts `readInstallKeys`), so a key
 * the owner saved on the testing site itself is still tried first. Health and
 * cooldowns are recorded in testing's own database. Testing's AI use spends
 * the live keys' quota — that is the deal the owner asked for.
 *
 * Read at most once a minute per isolate; an unreachable live Worker (not
 * deployed with the entrypoint yet, or a binding error) answers no keys, never
 * an error, so testing keeps working on whatever keys it has of its own.
 */
import type { Env } from './db';

const TTL_MS = 60_000;
let cached: { at: number; keys: { key: string; label: string }[] } | null = null;

export async function liveVaultKeys(env: Env): Promise<{ key: string; label: string }[]> {
  if (!env.LIVE_VAULT) return [];
  if (cached && Date.now() - cached.at < TTL_MS) return cached.keys;
  let keys: { key: string; label: string }[] = [];
  try {
    const got = await env.LIVE_VAULT.aiKeys();
    keys = (Array.isArray(got) ? got : [])
      .filter(k => k && typeof k.key === 'string' && k.key.trim())
      .map(k => ({ key: k.key.trim(), label: String(k.label || 'AI key').slice(0, 80) }))
      .slice(0, 20);
  } catch (e) {
    console.log(`[liveVault] the live vault did not answer: ${String(e).slice(0, 200)}`);
  }
  cached = { at: Date.now(), keys };
  return keys;
}

/** Tests: forget the cached answer. */
export function forgetLiveVault(): void { cached = null; }
