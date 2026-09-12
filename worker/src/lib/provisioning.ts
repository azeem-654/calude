/**
 * Buying domains and making mailboxes, callable without an HTTP request.
 *
 * All of this lived inside routes/infra.ts and could only be reached from a
 * route handler. That was fine while a person pressed every button; it stopped
 * being fine when Autopilot began planning "register two sending domains",
 * because a scheduler has no request to run a handler from.
 *
 * The shortcut was to give the tick its own copy. Two implementations of
 * *spend the customer's money*, one written in a hurry, is the worst thing in
 * this codebase to duplicate — so it moved here and both callers import it.
 *
 * ── Whose account ──
 *
 * Every operation takes credentials rather than looking them up, and the two
 * resolvers are the only places that decide whose. `workspaceCreds` reads the
 * customer's own connection; `installCreds` reads the operator's. Different
 * tables, and neither falls back to the other — that fallback is exactly how a
 * purchase ends up on the wrong card.
 */
import { agencyBucketFor, dataGet, installSecret, nowIso, type Env } from './db';
import { decryptSecret } from './crypto';

const SECRET_KEY = 'mailbox_key';

export type Kind = 'registrar' | 'dns' | 'mailbox';
export type Creds = Record<string, string>;

export const DOMAIN_OK = /^[a-z0-9]([a-z0-9\-]{0,61}[a-z0-9])?(\.[a-z0-9]([a-z0-9\-]{0,61}[a-z0-9])?)+$/;

export function cleanDomain(v: unknown): string {
  return String(v ?? '').trim().toLowerCase().replace(/^https?:\/\//, '').replace(/\/.*$/, '').replace(/\.$/, '');
}

/* ── Talking to the providers ────────────────────────────────────────────── */

export async function porkbun<T>(creds: Creds, path: string, extra: Record<string, unknown> = {}): Promise<{ ok: boolean; data?: T; error: string }> {
  try {
    const r = await fetch(`https://api.porkbun.com/api/json/v3${path}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ apikey: creds.apiKey ?? '', secretapikey: creds.secretApiKey ?? '', ...extra }),
    });
    const j = await r.json<{ status?: string; message?: string }>().catch(() => ({} as { status?: string; message?: string }));
    if (j.status !== 'SUCCESS') return { ok: false, error: j.message || `Porkbun answered HTTP ${r.status}.` };
    return { ok: true, data: j as T, error: '' };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : 'Porkbun could not be reached.' };
  }
}

export async function migadu<T>(creds: Creds, path: string, init: RequestInit = {}): Promise<{ ok: boolean; data?: T; error: string }> {
  try {
    const auth = btoa(`${creds.account ?? ''}:${creds.apiKey ?? ''}`);
    const r = await fetch(`https://api.migadu.com/v1${path}`, {
      ...init,
      headers: { Authorization: `Basic ${auth}`, 'Content-Type': 'application/json', ...(init.headers ?? {}) },
    });
    if (r.status === 401 || r.status === 403) return { ok: false, error: 'Migadu rejected those credentials.' };
    const text = await r.text();
    if (!r.ok) return { ok: false, error: text.slice(0, 200) || `Migadu answered HTTP ${r.status}.` };
    try { return { ok: true, data: JSON.parse(text) as T, error: '' }; }
    catch { return { ok: true, data: undefined, error: '' }; }
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : 'Migadu could not be reached.' };
  }
}

/* ── Whose credentials ───────────────────────────────────────────────────── */

interface ProviderRow {
  provider: string;
  credentials: string;
}

async function decode(env: Env, row: ProviderRow | null): Promise<{ provider: string; creds: Creds } | null> {
  if (!row) return null;
  const key = await installSecret(env.DB, SECRET_KEY);
  let creds: Creds = {};
  try { creds = JSON.parse(await decryptSecret(key, row.credentials)) as Creds; } catch { creds = {}; }
  return { provider: row.provider, creds };
}

/** The customer's own connection for this kind, or null. */
export async function workspaceCreds(env: Env, accountId: string, kind: Kind) {
  return decode(env, await env.DB.prepare(
    'SELECT provider, credentials FROM crm_providers WHERE account_id = ? AND kind = ?',
  ).bind(accountId, kind).first<ProviderRow>());
}

/** The operator's install-wide account. Only reached when a workspace has
 *  chosen managed buying. */
export async function installCreds(env: Env, kind: Kind) {
  return decode(env, await env.DB.prepare(
    "SELECT provider, credentials FROM crm_install_providers WHERE kind = ? AND credentials != ''",
  ).bind(kind).first<ProviderRow>());
}

/**
 * Whichever account this workspace buys on.
 *
 * The one function that reads the mode, so no caller has to remember to. A
 * managed workspace on an install with nothing connected gets null rather than
 * quietly falling through to the customer's own account and charging them for
 * something they were told was included.
 */
export async function credsForMode(
  env: Env, accountId: string, kind: Kind, mode: 'byo' | 'managed',
): Promise<{ provider: string; creds: Creds; managed: boolean } | null> {
  if (mode === 'managed') {
    const c = await installCreds(env, kind);
    return c ? { ...c, managed: true } : null;
  }
  const c = await workspaceCreds(env, accountId, kind);
  return c ? { ...c, managed: false } : null;
}

/* ── Spending the operator's money ───────────────────────────────────────── */

/**
 * Whether this workspace has paid for what it is about to be bought.
 *
 * ── Why a gate exists at all ──
 *
 * In managed mode the purchase lands on the *operator's* registrar account and
 * the cost is recorded against the workspace in `crm_managed_purchases`. That
 * ledger is a record of a debt, not a payment: nothing in this app turns a row
 * in it into money arriving. So without this, a stranger could sign up, start a
 * project, set it to "buy them for me" and have real domains registered on the
 * operator's card before paying a penny — and the only trace would be a line
 * item nobody had agreed to settle.
 *
 * So managed buying follows the payment rather than leading it: a domain is
 * registered on an order, not on a hope. The subscription webhook is the only
 * thing that writes `active`, and it only does so on a payment the processor
 * confirmed.
 *
 * ── What it deliberately does not do ──
 *
 * Bring-your-own is untouched. A customer spending on their own registrar
 * account has already agreed with their registrar what it costs, and standing
 * between them and their own provider would be officious.
 */
export async function managedSpendAllowed(
  env: Env, accountId: string,
): Promise<{ ok: boolean; reason: string }> {
  const bucket = await agencyBucketFor(env.DB, accountId);
  const raw = await dataGet(env.DB, bucket, `crm_billing_status_${accountId}`);
  if (!raw) {
    return {
      ok: false,
      reason: 'This workspace has not paid for a subscription yet, and managed buying spends real money on the operator\'s account. It will go ahead on its own once a payment comes in — or switch this project to your own registrar to buy it yourself.',
    };
  }
  let status = '';
  try { status = String((JSON.parse(raw) as { status?: string }).status ?? ''); } catch { status = ''; }
  if (status === 'active') return { ok: true, reason: '' };

  /* Named rather than lumped together: "your card was declined" and "you
     cancelled" are different problems with different fixes, and a customer told
     the wrong one goes looking in the wrong place. */
  return {
    ok: false,
    reason: status === 'past_due'
      ? 'The last subscription payment for this workspace failed, so nothing is being bought on its behalf until it clears.'
      : status === 'cancelled'
        ? 'This workspace\'s subscription has ended, so nothing further is bought on its behalf.'
        : `This workspace's subscription is "${status || 'unknown'}", so managed buying is held until it is active.`,
  };
}

/* ── Audit ───────────────────────────────────────────────────────────────── */

export async function record(
  env: Env, accountId: string, kind: string, subject: string,
  provider: string, outcome: 'ok' | 'failed', detail: string,
): Promise<void> {
  await env.DB.prepare(
    'INSERT INTO crm_provisioned (id, account_id, kind, subject, provider, outcome, detail, created_at) VALUES (?,?,?,?,?,?,?,?)',
  ).bind(crypto.randomUUID(), accountId, kind, subject.slice(0, 253), provider, outcome, detail.slice(0, 500), nowIso()).run();
}

/** Note a managed purchase against the workspace that will be billed for it. */
export async function recordPurchase(
  env: Env, accountId: string, kind: string, item: string, provider: string,
  providerCost: number, workspaceCost: number, status: 'ok' | 'failed', detail: string,
): Promise<void> {
  await env.DB.prepare(
    `INSERT INTO crm_managed_purchases
     (id, account_id, kind, item, provider, provider_cost, workspace_cost, currency, status, detail, created_at)
     VALUES (?,?,?,?,?,?,?, 'USD', ?,?,?)`,
  ).bind(
    crypto.randomUUID(), accountId, kind, item.slice(0, 253), provider,
    providerCost, workspaceCost, status, detail.slice(0, 500), nowIso(),
  ).run();
}

/* ── The operations ──────────────────────────────────────────────────────── */

export interface Bought {
  ok: boolean;
  item: string;
  error: string;
  /** What the provider charged, when it says. Zero when it does not — recorded
   *  as zero rather than guessed from a price list that may have moved. */
  cost: number;
  /** Anything the caller must save immediately. A mailbox password is shown
   *  once by the provider and never again. */
  secret?: Record<string, string>;
}

/**
 * Register one domain.
 *
 * Porkbun only. Cloudflare Registrar has no public buying API, and naming that
 * beats a generic failure that reads like a broken integration.
 */
export async function registerDomain(provider: string, creds: Creds, domain: string, years = 1): Promise<Bought> {
  const dm = cleanDomain(domain);
  if (!DOMAIN_OK.test(dm)) return { ok: false, item: domain, error: 'That is not a domain that can be registered.', cost: 0 };
  if (provider !== 'porkbun') {
    return {
      ok: false, item: dm, cost: 0,
      error: `${provider} has no public API for buying a domain. Register it in their dashboard, then set up its DNS here.`,
    };
  }
  const yrs = Math.min(Math.max(Math.round(years) || 1, 1), 10);

  /* Priced before buying, so what is recorded against the customer is what the
     registrar actually charged. */
  let unit = 0;
  const priced = await porkbun<{ response?: { price?: string } }>(creds, `/domain/checkDomain/${dm}`);
  if (priced.ok) unit = Number(priced.data?.response?.price) || 0;

  const r = await porkbun(creds, `/domain/create/${dm}`, { years: String(yrs) });
  return { ok: r.ok, item: dm, error: r.ok ? '' : r.error, cost: r.ok ? unit * yrs : 0 };
}

/** Is this name available, and what would it cost? Buys nothing. */
export async function priceDomain(provider: string, creds: Creds, domain: string): Promise<{ available: boolean; price: number; error: string }> {
  const dm = cleanDomain(domain);
  if (provider !== 'porkbun' || !DOMAIN_OK.test(dm)) return { available: false, price: 0, error: '' };
  const r = await porkbun<{ response?: { avail?: string; price?: string } }>(creds, `/domain/checkDomain/${dm}`);
  if (!r.ok) return { available: false, price: 0, error: r.error };
  return {
    available: r.data?.response?.avail === 'yes',
    price: Number(r.data?.response?.price) || 0,
    error: '',
  };
}

/** Create one mailbox. Migadu only, for the same reason. */
export async function createMailbox(
  provider: string, creds: Creds, domain: string, localPart: string, displayName = '',
): Promise<Bought> {
  const dm = cleanDomain(domain);
  const lp = localPart.trim().toLowerCase().replace(/[^a-z0-9._\-]/g, '');
  const address = `${lp}@${dm}`;
  if (!DOMAIN_OK.test(dm) || !lp) return { ok: false, item: address, error: 'A mailbox needs a domain and a name.', cost: 0 };
  if (provider !== 'migadu') {
    return {
      ok: false, item: address, cost: 0,
      error: `${provider} cannot create mailboxes from here. Create ${address} with your mail provider and paste its details into Settings → Email.`,
    };
  }

  /* Generated, never typed. Nobody memorises it, so there is no reason for it
     to be weak. */
  const bytes = crypto.getRandomValues(new Uint8Array(18));
  const password = [...bytes].map(b => 'abcdefghijkmnpqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789'[b % 56]).join('');

  const r = await migadu(creds, `/domains/${dm}/mailboxes`, {
    method: 'POST',
    body: JSON.stringify({
      local_part: lp, domain_name: dm, name: (displayName || lp).slice(0, 120), password,
      may_send: true, may_receive: true, may_access_imap: true, may_access_pop3: false,
    }),
  });

  return {
    ok: r.ok, item: address, error: r.ok ? '' : r.error, cost: 0,
    /* Returned once and only once. A caller that does not save this has made an
       unusable mailbox — Migadu will not show the password again. */
    secret: r.ok ? { address, password } : undefined,
  };
}

/**
 * A name to try, built from the business.
 *
 * Sending domains are deliberately not the customer's main domain: a filtered
 * cold campaign should damage the reputation of a throwaway, not of the address
 * their invoices come from. So these are variations — mail-, -hq, get- — which
 * is what the practice actually looks like.
 */
export function poolDomainCandidates(base: string, tld = 'com'): string[] {
  const stem = cleanDomain(base).split('.')[0].replace(/[^a-z0-9-]/g, '').slice(0, 30) || 'business';
  return [
    `try${stem}.${tld}`,
    `get${stem}.${tld}`,
    `${stem}hq.${tld}`,
    `${stem}mail.${tld}`,
    `hello${stem}.${tld}`,
  ];
}
