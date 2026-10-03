/**
 * Is this address worth sending to — and who else at this business has
 * published one?
 *
 * ── Two levels, and the screen says which one answered ──
 *
 * **Basic** is ours and free: the address is well formed, its domain exists,
 * the domain has a mail server, and it is not a throwaway inbox. That catches
 * the dead domains and the typos, which are most bounces on a list read off
 * websites. What it cannot say is whether *this mailbox* exists — the only way
 * to ask is to open an SMTP conversation on port 25, and Cloudflare Workers
 * cannot make outbound connections on port 25 at all. So a basic pass is
 * reported as `domain_ok` ("the domain takes mail; the mailbox was not
 * checked"), never as `valid`. Calling it verified would be the plausible
 * success this codebase refuses to ship: the customer finds out when the mail
 * bounces.
 *
 * **Mailbox** is the connected verifier's answer, on the install owner's key
 * (Hunter, ZeroBounce or MillionVerifier — Settings → Platform services →
 * Email finder & verifier). Those services run the SMTP conversation from
 * their own servers, detect catch-all domains, and know spam traps. Only their
 * "deliverable" becomes `valid`.
 *
 * ── Who else published one ──
 *
 * With Hunter connected, `findPeople` asks Hunter's domain search for the
 * addresses it has seen published on the web for a domain — each with the
 * pages it was found on. Only addresses with at least one source are kept:
 * Hunter will also *infer* addresses from a domain's pattern, and an invented
 * `firstname@` is exactly what prospects.ts refuses to produce. Hunter's free
 * plan is 25 searches a month for the whole install, so each workspace has a
 * small allowance (`BUDGET`), and the owner can buy more from Hunter.
 *
 * ── Whose money ──
 *
 * The owner's. Every deep check and search spends the owner's credits, so —
 * like the Google Maps key — an ended trial stops it, each workspace has a
 * daily and monthly allowance, and verdicts and searches are cached (a
 * verdict is a fact about an address, so one cache serves every workspace).
 */
import { decryptSecret, encryptSecret } from './crypto';
import { installSecret, nowIso, type Env } from './db';
import { trialForWorkspace } from './trial';

/* ── Verdicts ─────────────────────────────────────────────────────────── */

export type CheckStatus = 'valid' | 'domain_ok' | 'risky' | 'invalid' | 'unknown';
export type CheckLevel = 'basic' | 'mailbox';
export type VerifierProvider = 'hunter' | 'zerobounce' | 'millionverifier';

export interface Verdict {
  email: string;
  status: CheckStatus;
  /** A short code the screen turns into a sentence: `no_mx`, `catch_all`, … */
  reason: string;
  level: CheckLevel;
  provider: VerifierProvider | '';
  role: boolean;
  free: boolean;
  disposable: boolean;
  checkedAt: string;
}

/* ── The pure part: what can be said from the address alone ──────────── */

/*
 * Deliberately stricter than RFC 5322. Quoted local parts and IP-literal
 * domains are legal and nobody publishes one on a business website; accepting
 * them would only let a scraped fragment through as an "address".
 */
const SYNTAX = /^[a-z0-9](?:[a-z0-9._%+-]{0,62}[a-z0-9_%+-])?@(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,24}$/;

export function normaliseEmail(raw: unknown): string {
  return String(raw ?? '').trim().toLowerCase().replace(/^mailto:/, '').replace(/[.,;:)>]+$/, '');
}

export function syntaxOk(email: string): boolean {
  if (email.length > 254 || !SYNTAX.test(email)) return false;
  return !email.split('@')[0].includes('..');
}

/*
 * Throwaway inboxes. Not exhaustive — new ones appear weekly — but these are
 * the ones that turn up in real lists. A connected verifier knows the rest.
 */
const DISPOSABLE = new Set([
  'mailinator.com', 'guerrillamail.com', 'guerrillamail.net', 'sharklasers.com', 'grr.la', '10minutemail.com',
  '10minutemail.net', 'temp-mail.org', 'tempmail.com', 'tempmail.net', 'tempmailo.com', 'yopmail.com', 'yopmail.net',
  'trashmail.com', 'trashmail.de', 'getnada.com', 'nada.email', 'dispostable.com', 'maildrop.cc', 'throwawaymail.com',
  'fakeinbox.com', 'mintemail.com', 'emailondeck.com', 'mohmal.com', 'tempail.com', 'tempr.email', 'discard.email',
  'mailnesia.com', 'mytemp.email', 'burnermail.io', 'mail.tm', 'tmpmail.org', 'tmpmail.net', 'moakt.com',
  'inboxkitten.com', 'mailcatch.com', 'spamgourmet.com', 'getairmail.com', 'trash-mail.com', 'spambox.us',
  'mailpoof.com', 'emailfake.com', 'fakemail.net', 'tempinbox.com', 'mailsac.com', 'harakirimail.com',
  'mvrht.com', 'byom.de', 'wegwerfmail.de', 'einrot.com', 'jetable.org', 'mailforspam.com', 'spam4.me',
  'mail-temp.com', 'temporary-mail.net', 'minuteinbox.com', 'emailtemporanea.net', 'linshiyouxiang.net',
  '33mail.com', 'anonaddy.me', 'mailinator.net', 'mailinator2.com', 'notmailinator.com', 'tempmailaddress.com',
]);

/** Inboxes that belong to a job rather than a person. Normal for a business — said, not penalised. */
const ROLE = new Set([
  'info', 'hello', 'hi', 'contact', 'contactus', 'enquiries', 'enquiry', 'inquiries', 'inquiry', 'sales', 'office',
  'admin', 'support', 'help', 'team', 'mail', 'email', 'reception', 'bookings', 'booking', 'appointments', 'accounts',
  'billing', 'finance', 'marketing', 'press', 'media', 'jobs', 'careers', 'hr', 'orders', 'service', 'customerservice',
  'general', 'studio', 'shop', 'store', 'reservations', 'events', 'partners', 'feedback',
]);

/** Personal webmail. Fine to send to; worth knowing it is not a company domain. */
const FREE = new Set([
  'gmail.com', 'googlemail.com', 'yahoo.com', 'yahoo.co.uk', 'yahoo.fr', 'yahoo.de', 'ymail.com', 'hotmail.com',
  'hotmail.co.uk', 'hotmail.fr', 'outlook.com', 'live.com', 'live.co.uk', 'msn.com', 'aol.com', 'icloud.com', 'me.com',
  'mac.com', 'proton.me', 'protonmail.com', 'gmx.com', 'gmx.de', 'gmx.net', 'mail.com', 'yandex.com', 'yandex.ru',
  'zoho.com', 'btinternet.com', 'sky.com', 'virginmedia.com', 'talktalk.net', 'web.de', 't-online.de', 'orange.fr',
  'free.fr', 'libero.it', 'qq.com', '163.com', 'rediffmail.com', 'fastmail.com',
]);

export interface AddressFacts { syntax: boolean; domain: string; local: string; role: boolean; free: boolean; disposable: boolean }

export function addressFacts(email: string): AddressFacts {
  const [local = '', domain = ''] = email.split('@');
  const base = local.replace(/[._-]?\d+$/, '');
  return {
    syntax: syntaxOk(email),
    domain,
    local,
    role: ROLE.has(base) || ROLE.has(local),
    free: FREE.has(domain),
    disposable: DISPOSABLE.has(domain) || [...DISPOSABLE].some(d => domain.endsWith(`.${d}`)),
  };
}

/** What a domain's DNS says about mail. `null` is "the lookup itself failed". */
export interface MailDns { exists: boolean; mx: boolean; nullMx: boolean; a: boolean }

/**
 * The basic verdict, from the address and its domain's DNS. Pure, so the
 * classification can be tested without a network.
 */
export function basicVerdict(email: string, dns: MailDns | null, now = nowIso()): Verdict {
  const f = addressFacts(email);
  const v = (status: CheckStatus, reason: string): Verdict => ({
    email, status, reason, level: 'basic', provider: '', role: f.role, free: f.free, disposable: f.disposable, checkedAt: now,
  });
  if (!f.syntax) return v('invalid', 'bad_syntax');
  if (!dns) return v('unknown', 'dns_failed');
  if (!dns.exists) return v('invalid', 'no_domain');
  /* RFC 7505: "MX 0 ." is a domain saying in so many words that it takes no mail. */
  if (dns.nullMx) return v('invalid', 'null_mx');
  if (!dns.mx) return dns.a ? v('risky', 'no_mx') : v('invalid', 'no_mail_server');
  if (f.disposable) return v('risky', 'disposable');
  return v('domain_ok', 'mailbox_not_checked');
}

/* ── DNS, over HTTPS ──────────────────────────────────────────────────── */

const dohBase = (env: Env) => (env.DOH_BASE ?? '').trim() || 'https://cloudflare-dns.com/dns-query';

interface DohAnswer { Status?: number; Answer?: { type: number; data?: string }[] }

async function doh(env: Env, name: string, type: 'MX' | 'A'): Promise<DohAnswer | null> {
  try {
    const r = await fetch(`${dohBase(env)}?name=${encodeURIComponent(name)}&type=${type}`, { headers: { accept: 'application/dns-json' } });
    if (!r.ok) return null;
    return await r.json<DohAnswer>();
  } catch {
    return null;
  }
}

/** MX first; A only when there is no MX, because then it decides "risky" from "invalid". */
export async function mailDns(env: Env, domain: string): Promise<MailDns | null> {
  const mx = await doh(env, domain, 'MX');
  if (!mx) return null;
  if (mx.Status === 3) return { exists: false, mx: false, nullMx: false, a: false };
  if (mx.Status !== 0) return null;
  const records = (mx.Answer ?? []).filter(a => a.type === 15);
  const nullMx = records.length === 1 && /^\s*0\s+\.?\s*$/.test(String(records[0].data ?? ''));
  if (records.length && !nullMx) return { exists: true, mx: true, nullMx: false, a: true };
  if (nullMx) return { exists: true, mx: false, nullMx: true, a: false };
  const a = await doh(env, domain, 'A');
  if (!a) return null;
  return { exists: true, mx: false, nullMx: false, a: (a.Answer ?? []).some(x => x.type === 1) };
}

/* ── The owner's verifier key ─────────────────────────────────────────── */

const KIND = 'email_verifier';
const SECRET_KEY = 'mailbox_key';

export const PROVIDERS: Record<VerifierProvider, { name: string; finds: boolean; base: string; keyRe: RegExp; where: string }> = {
  hunter: {
    name: 'Hunter', finds: true, base: 'https://api.hunter.io', keyRe: /^[a-f0-9]{40}$/i,
    where: 'hunter.io → API → copy the API key',
  },
  zerobounce: {
    name: 'ZeroBounce', finds: false, base: 'https://api.zerobounce.net', keyRe: /^[A-Za-z0-9]{32}$/,
    where: 'zerobounce.net → API → API Keys',
  },
  millionverifier: {
    name: 'MillionVerifier', finds: false, base: 'https://api.millionverifier.com', keyRe: /^[A-Za-z0-9]{16,64}$/,
    where: 'millionverifier.com → API → copy the API key',
  },
};

export const isProvider = (p: unknown): p is VerifierProvider => typeof p === 'string' && p in PROVIDERS;
const base = (env: Env, p: VerifierProvider) => ((env.EMAIL_VERIFIER_BASE ?? '').trim() || PROVIDERS[p].base).replace(/\/+$/, '');

export interface VerifierKey { provider: VerifierProvider; key: string; status: string; lastError: string; updatedAt: string }

export async function installVerifier(env: Env): Promise<VerifierKey | null> {
  const row = await env.DB.prepare('SELECT provider, credentials, status, last_error AS lastError, updated_at AS updatedAt FROM crm_install_providers WHERE kind = ?')
    .bind(KIND).first<{ provider: string; credentials: string; status: string; lastError: string; updatedAt: string }>().catch(() => null);
  if (!row?.credentials || !isProvider(row.provider)) return null;
  try {
    const c = JSON.parse(await decryptSecret(await installSecret(env.DB, SECRET_KEY), row.credentials)) as { apiKey?: string };
    return c.apiKey ? { provider: row.provider, key: c.apiKey, status: row.status, lastError: row.lastError, updatedAt: row.updatedAt } : null;
  } catch { return null; }
}

/** A new key starts unproved — a tick carried across an edit vouches for a key nobody tried. */
export async function saveVerifier(env: Env, provider: VerifierProvider, apiKey: string): Promise<void> {
  const blob = await encryptSecret(await installSecret(env.DB, SECRET_KEY), JSON.stringify({ apiKey }));
  await env.DB.prepare(
    `INSERT INTO crm_install_providers (kind, provider, credentials, status, last_error, updated_at)
     VALUES (?, ?, ?, 'unknown', '', ?)
     ON CONFLICT(kind) DO UPDATE SET provider = excluded.provider, credentials = excluded.credentials, status = 'unknown', last_error = '', updated_at = excluded.updated_at`,
  ).bind(KIND, provider, blob, nowIso()).run();
}

export async function markVerifier(env: Env, ok: boolean, error = ''): Promise<void> {
  await env.DB.prepare('UPDATE crm_install_providers SET status = ?, last_error = ?, updated_at = ? WHERE kind = ?')
    .bind(ok ? 'ok' : 'error', error.slice(0, 300), nowIso(), KIND).run().catch(() => undefined);
}

export async function removeVerifier(env: Env): Promise<void> {
  await env.DB.prepare('DELETE FROM crm_install_providers WHERE kind = ?').bind(KIND).run();
}

async function getJson(url: string): Promise<{ status: number; body: Record<string, unknown> | null }> {
  try {
    const r = await fetch(url, { headers: { accept: 'application/json' } });
    let body: Record<string, unknown> | null = null;
    try { body = await r.json<Record<string, unknown>>(); } catch { body = null; }
    return { status: r.status, body };
  } catch {
    return { status: 0, body: null };
  }
}

const hunterError = (b: Record<string, unknown> | null): string => {
  const e = (b?.errors as { details?: string; id?: string }[] | undefined)?.[0];
  return String(e?.details ?? e?.id ?? '');
};

/**
 * Prove a key without spending a verification: each provider has a free
 * "how many credits have I" call. Also says how many are left, for the card.
 */
export async function testVerifier(env: Env, provider: VerifierProvider, key: string): Promise<{ ok: boolean; error: string; credits: string }> {
  const k = encodeURIComponent(key);
  if (provider === 'hunter') {
    const r = await getJson(`${base(env, provider)}/v2/account?api_key=${k}`);
    if (r.status === 200 && r.body?.data) {
      const req = (r.body.data as { requests?: { searches?: { used?: number; available?: number }; verifications?: { used?: number; available?: number } } }).requests;
      const left = (x?: { used?: number; available?: number }) => (x ? `${Math.max(0, (x.available ?? 0) - (x.used ?? 0))}` : '?');
      return { ok: true, error: '', credits: `${left(req?.searches)} searches and ${left(req?.verifications)} verifications left this month` };
    }
    if (r.status === 0) return { ok: false, error: 'Hunter could not be reached.', credits: '' };
    return { ok: false, error: `Hunter refused the key (${r.status})${hunterError(r.body) ? `: ${hunterError(r.body)}` : ''}.`, credits: '' };
  }
  if (provider === 'zerobounce') {
    const r = await getJson(`${base(env, provider)}/v2/getcredits?api_key=${k}`);
    const credits = Number(r.body?.Credits ?? NaN);
    if (r.status === 200 && credits >= 0) return { ok: true, error: '', credits: `${credits} credits left` };
    if (r.status === 0) return { ok: false, error: 'ZeroBounce could not be reached.', credits: '' };
    return { ok: false, error: 'ZeroBounce refused the key.', credits: '' };
  }
  const r = await getJson(`${base(env, provider)}/api/v3/credits?api=${k}`);
  if (r.status === 200 && typeof r.body?.credits === 'number') return { ok: true, error: '', credits: `${r.body.credits} credits left` };
  if (r.status === 0) return { ok: false, error: 'MillionVerifier could not be reached.', credits: '' };
  return { ok: false, error: `MillionVerifier refused the key${r.body?.error ? `: ${String(r.body.error)}` : ''}.`, credits: '' };
}

/* ── Asking the verifier about one address ────────────────────────────── */

/** `null` means the provider did not answer — the key's fault or theirs, never the address's. */
export interface ProviderAnswer { status: CheckStatus; reason: string; catchAll: boolean; keyFault: boolean; error: string }

/**
 * Map each provider's words to ours. Pure; the shapes are the providers'
 * documented responses, and the tests feed them in directly.
 */
export function mapProvider(provider: VerifierProvider, httpStatus: number, b: Record<string, unknown> | null): ProviderAnswer {
  const fault = (error: string): ProviderAnswer => ({ status: 'unknown', reason: 'verifier_failed', catchAll: false, keyFault: true, error });
  const said = (status: CheckStatus, reason: string, catchAll = false): ProviderAnswer => ({ status, reason, catchAll, keyFault: false, error: '' });

  if (provider === 'hunter') {
    if (httpStatus === 401 || httpStatus === 403) return fault(`Hunter refused the key (${httpStatus})${hunterError(b) ? `: ${hunterError(b)}` : ''}.`);
    if (httpStatus === 429) return fault('Hunter says this key has used its verifications for now.');
    /* 202: still verifying; 222: the mail server would not say. Both are "could not check". */
    if (httpStatus === 202 || httpStatus === 222) return said('unknown', 'server_did_not_answer');
    if (httpStatus !== 200 || !b?.data) return fault(`Hunter answered ${httpStatus || 'nothing'}.`);
    const d = b.data as { status?: string; result?: string; accept_all?: boolean; disposable?: boolean; block?: boolean };
    if (d.status === 'disposable' || d.disposable) return said('risky', 'disposable');
    if (d.status === 'accept_all' || d.accept_all) return said('risky', 'catch_all', true);
    if (d.status === 'invalid' || d.result === 'undeliverable') return said('invalid', 'mailbox_missing');
    if (d.status === 'valid' || d.status === 'webmail' || d.result === 'deliverable') return said('valid', 'mailbox_exists');
    if (d.result === 'risky') return said('risky', 'risky');
    return said('unknown', 'server_did_not_answer');
  }

  if (provider === 'zerobounce') {
    if (httpStatus !== 200 || !b) return fault(`ZeroBounce answered ${httpStatus || 'nothing'}.`);
    if (b.error) return fault(`ZeroBounce: ${String(b.error)}`);
    const s = String(b.status ?? '').toLowerCase();
    const sub = String(b.sub_status ?? '').toLowerCase();
    if (s === 'valid') return said('valid', 'mailbox_exists');
    if (s === 'invalid') return said('invalid', sub === 'mailbox_not_found' ? 'mailbox_missing' : sub || 'mailbox_missing');
    if (s === 'catch-all') return said('risky', 'catch_all', true);
    if (s === 'spamtrap') return said('invalid', 'spam_trap');
    if (s === 'abuse') return said('risky', 'complainer');
    if (s === 'do_not_mail') return said('risky', sub === 'disposable' ? 'disposable' : sub === 'role_based' ? 'role' : sub || 'do_not_mail');
    return said('unknown', 'server_did_not_answer');
  }

  /* MillionVerifier */
  if (httpStatus !== 200 || !b) return fault(`MillionVerifier answered ${httpStatus || 'nothing'}.`);
  if (b.error) return fault(`MillionVerifier: ${String(b.error)}`);
  const res = String(b.result ?? '').toLowerCase();
  if (res === 'ok') return said('valid', 'mailbox_exists');
  if (res === 'catch_all') return said('risky', 'catch_all', true);
  if (res === 'disposable') return said('risky', 'disposable');
  if (res === 'invalid') return said('invalid', 'mailbox_missing');
  return said('unknown', 'server_did_not_answer');
}

export async function askProvider(env: Env, v: VerifierKey, email: string): Promise<ProviderAnswer> {
  const k = encodeURIComponent(v.key);
  const e = encodeURIComponent(email);
  const url = v.provider === 'hunter' ? `${base(env, 'hunter')}/v2/email-verifier?email=${e}&api_key=${k}`
    : v.provider === 'zerobounce' ? `${base(env, 'zerobounce')}/v2/validate?api_key=${k}&email=${e}&ip_address=`
      : `${base(env, 'millionverifier')}/api/v3/?api=${k}&email=${e}&timeout=10`;
  const r = await getJson(url);
  if (r.status === 0) return { status: 'unknown', reason: 'verifier_failed', catchAll: false, keyFault: false, error: `${PROVIDERS[v.provider].name} could not be reached.` };
  return mapProvider(v.provider, r.status, r.body);
}

/* ── The owner's money: allowances per workspace ──────────────────────── */

export const BUDGET = {
  verify: { day: 100, month: 500 },
  find: { day: 10, month: 40 },
} as const;
export type Spend = keyof typeof BUDGET;

const periods = (d = new Date()) => ({ day: `d:${d.toISOString().slice(0, 10)}`, month: `m:${d.toISOString().slice(0, 7)}` });

export async function usage(env: Env, accountId: string, kind: Spend): Promise<{ day: number; month: number }> {
  const p = periods();
  const rows = await env.DB.prepare('SELECT period, n FROM crm_verifier_usage WHERE account_id = ? AND kind = ? AND period IN (?, ?)')
    .bind(accountId, kind, p.day, p.month).all<{ period: string; n: number }>().catch(() => ({ results: [] as { period: string; n: number }[] }));
  const of = (k: string) => rows.results?.find(r => r.period === k)?.n ?? 0;
  return { day: of(p.day), month: of(p.month) };
}

/** How many of `want` this workspace may still spend now. */
export async function allowance(env: Env, accountId: string, kind: Spend, want: number): Promise<number> {
  const u = await usage(env, accountId, kind);
  return Math.max(0, Math.min(want, BUDGET[kind].day - u.day, BUDGET[kind].month - u.month));
}

export async function spend(env: Env, accountId: string, kind: Spend, n: number): Promise<void> {
  if (n <= 0) return;
  const p = periods();
  for (const period of [p.day, p.month]) {
    await env.DB.prepare(
      `INSERT INTO crm_verifier_usage (period, account_id, kind, n, updated_at) VALUES (?,?,?,?,?)
       ON CONFLICT(period, account_id, kind) DO UPDATE SET n = crm_verifier_usage.n + excluded.n, updated_at = excluded.updated_at`,
    ).bind(period, accountId, kind, n, nowIso()).run().catch(() => undefined);
  }
}

/** This month's spending across the install, for the owner's card. */
export async function monthTotals(env: Env): Promise<{ verify: number; find: number }> {
  const rows = await env.DB.prepare('SELECT kind, SUM(n) AS n FROM crm_verifier_usage WHERE period = ? GROUP BY kind')
    .bind(periods().month).all<{ kind: string; n: number }>().catch(() => ({ results: [] as { kind: string; n: number }[] }));
  const of = (k: string) => Number(rows.results?.find(r => r.kind === k)?.n ?? 0);
  return { verify: of('verify'), find: of('find') };
}

export type VerifierAccess =
  | { ok: true; v: VerifierKey }
  | { ok: false; code: 'no_verifier' | 'trial_ended'; error: string };

export const NO_VERIFIER = 'Mailbox-level checks need an email verifier — the owner connects one in Settings → Platform services. The free checks below still ran.';
export const VERIFY_TRIAL_ENDED = 'Your 7-day free trial has ended, so mailbox checks and web searches for addresses have stopped. The free checks still run. Choose a plan under Plan & billing to carry on.';

export async function verifierFor(env: Env, accountId: string): Promise<VerifierAccess> {
  const v = await installVerifier(env);
  if (!v) return { ok: false, code: 'no_verifier', error: NO_VERIFIER };
  if ((await trialForWorkspace(env, accountId).catch(() => null))?.kind === 'ended') {
    return { ok: false, code: 'trial_ended', error: VERIFY_TRIAL_ENDED };
  }
  return { ok: true, v };
}

/* ── Checking a batch ─────────────────────────────────────────────────── */

const BASIC_SECONDS = 7 * 86_400;
const MAILBOX_SECONDS = 30 * 86_400;
/* Saying "could not check" for a month would stop anybody trying again. */
const UNKNOWN_SECONDS = 6 * 3600;

const flagsOf = (v: Verdict) => [v.role && 'role', v.free && 'free', v.disposable && 'disposable', v.reason === 'catch_all' && 'catch_all'].filter(Boolean).join(',');

async function cached(env: Env, emails: string[]): Promise<Map<string, Verdict>> {
  const out = new Map<string, Verdict>();
  if (!emails.length) return out;
  const now = Math.floor(Date.now() / 1000);
  const rows = await env.DB.prepare(
    `SELECT email, status, reason, level, provider, flags, checked_at AS checkedAt FROM crm_email_checks
     WHERE expires_at > ? AND email IN (${emails.map(() => '?').join(',')})`,
  ).bind(now, ...emails).all<{ email: string; status: CheckStatus; reason: string; level: CheckLevel; provider: string; flags: string; checkedAt: string }>()
    .catch(() => ({ results: [] }));
  for (const r of rows.results ?? []) {
    const f = r.flags.split(',');
    out.set(r.email, {
      email: r.email, status: r.status, reason: r.reason, level: r.level, provider: isProvider(r.provider) ? r.provider : '',
      role: f.includes('role'), free: f.includes('free'), disposable: f.includes('disposable'), checkedAt: r.checkedAt,
    });
  }
  return out;
}

async function remember(env: Env, v: Verdict): Promise<void> {
  const ttl = v.status === 'unknown' ? UNKNOWN_SECONDS : v.level === 'mailbox' ? MAILBOX_SECONDS : BASIC_SECONDS;
  await env.DB.prepare(
    `INSERT INTO crm_email_checks (email, status, reason, level, provider, flags, checked_at, expires_at) VALUES (?,?,?,?,?,?,?,?)
     ON CONFLICT(email) DO UPDATE SET status = excluded.status, reason = excluded.reason, level = excluded.level,
       provider = excluded.provider, flags = excluded.flags, checked_at = excluded.checked_at, expires_at = excluded.expires_at`,
  ).bind(v.email, v.status, v.reason, v.level, v.provider, flagsOf(v), v.checkedAt, Math.floor(Date.now() / 1000) + ttl).run().catch(() => undefined);
}

export const MAX_PER_CALL = 20;

export interface CheckOutcome {
  verdicts: Record<string, Verdict>;
  /** What happened to the mailbox level, said once for the whole batch. */
  deep: { asked: boolean; ran: number; provider: VerifierProvider | ''; skipped: number; code: string; error: string };
}

/**
 * Check up to MAX_PER_CALL addresses.
 *
 * Every address gets the basic check (cached a week, one DNS lookup per
 * domain). With `deep`, the ones whose basic verdict leaves the mailbox
 * question open (`domain_ok`, or a risky no-MX) go to the verifier, within the
 * workspace's allowance; a cached mailbox verdict is used without spending.
 * A provider fault stops the deep pass for the batch and is reported once —
 * the rest keep their basic verdict rather than becoming "unknown".
 */
export async function checkEmails(env: Env, accountId: string, raw: unknown[], deep: boolean): Promise<CheckOutcome> {
  const emails = [...new Set(raw.map(normaliseEmail).filter(Boolean))].slice(0, MAX_PER_CALL);
  const out: CheckOutcome = { verdicts: {}, deep: { asked: deep, ran: 0, provider: '', skipped: 0, code: '', error: '' } };
  const have = await cached(env, emails);

  /* Basic first, one DNS answer per domain. */
  const dnsByDomain = new Map<string, MailDns | null>();
  for (const e of emails) {
    /* A cached basic verdict still goes on to the deep pass below. */
    const hit = have.get(e);
    if (hit) { out.verdicts[e] = hit; continue; }
    const f = addressFacts(e);
    if (f.syntax && !dnsByDomain.has(f.domain)) dnsByDomain.set(f.domain, await mailDns(env, f.domain));
    out.verdicts[e] = basicVerdict(e, dnsByDomain.get(f.domain) ?? null);
    await remember(env, out.verdicts[e]);
  }
  if (!deep) return out;

  const open = emails.filter(e => {
    const v = out.verdicts[e];
    return v && v.level === 'basic' && (v.status === 'domain_ok' || (v.status === 'risky' && v.reason === 'no_mx'));
  });
  if (!open.length) return out;

  const access = await verifierFor(env, accountId);
  if (!access.ok) { out.deep = { ...out.deep, code: access.code, error: access.error, skipped: open.length }; return out; }
  out.deep.provider = access.v.provider;
  const may = await allowance(env, accountId, 'verify', open.length);
  if (may < open.length) {
    out.deep.skipped = open.length - may;
    out.deep.code = 'verify_budget';
    out.deep.error = `This workspace has used its mailbox checks on the included verifier for now (${BUDGET.verify.day} a day, ${BUDGET.verify.month} a month). The rest kept their free check.`;
  }
  let spent = 0;
  for (const e of open.slice(0, may)) {
    const a = await askProvider(env, access.v, e);
    if (a.keyFault) {
      await markVerifier(env, false, a.error);
      out.deep.code = 'verifier_failed';
      out.deep.error = `${a.error} The owner has been told on their Platform services screen; these kept their free check.`;
      out.deep.skipped += open.length - spent;
      break;
    }
    spent++;
    if (access.v.status !== 'ok' && spent === 1) await markVerifier(env, true);
    if (a.status === 'unknown' && a.reason === 'verifier_failed') { out.deep.error ||= a.error; continue; }
    const prev = out.verdicts[e];
    const v: Verdict = { ...prev, status: a.status, reason: a.reason, level: 'mailbox', provider: access.v.provider, checkedAt: nowIso(),
      disposable: prev.disposable || a.reason === 'disposable' };
    out.verdicts[e] = v;
    await remember(env, v);
  }
  out.deep.ran = spent;
  await spend(env, accountId, 'verify', spent);
  return out;
}

/* ── Who else published an address: Hunter's domain search ─────────────── */

export interface FoundPerson {
  email: string;
  name: string;
  position: string;
  /** 'personal' is a named person; 'generic' an inbox like info@. */
  type: 'personal' | 'generic';
  /** How many pages Hunter saw it published on. Never zero — those are dropped. */
  sources: number;
  /** Hunter's own confidence, 0–100. */
  confidence: number;
}

const FIND_SECONDS = 14 * 86_400;

export const domainOf = (website: string): string => {
  try { return new URL(/^https?:\/\//i.test(website) ? website : `https://${website}`).hostname.toLowerCase().replace(/^www\./, ''); }
  catch { return ''; }
};

/** Pure: Hunter's answer → the people worth keeping. Only addresses on the domain, each with a source. */
export function peopleFromHunter(domain: string, body: Record<string, unknown> | null): FoundPerson[] {
  const emails = ((body?.data as { emails?: unknown[] } | undefined)?.emails ?? []) as {
    value?: string; type?: string; confidence?: number; sources?: unknown[]; first_name?: string | null; last_name?: string | null; position?: string | null;
  }[];
  const out: FoundPerson[] = [];
  for (const e of emails) {
    const email = normaliseEmail(e.value);
    if (!syntaxOk(email)) continue;
    const d = email.split('@')[1];
    if (d !== domain && !d.endsWith(`.${domain}`)) continue;
    const sources = Array.isArray(e.sources) ? e.sources.length : 0;
    /* An address with no page behind it is Hunter's inference from the
       domain's pattern — a guess, and guesses are what this refuses. */
    if (!sources) continue;
    out.push({
      email,
      name: [e.first_name, e.last_name].filter(Boolean).join(' ').trim().slice(0, 80),
      position: String(e.position ?? '').trim().slice(0, 80),
      type: e.type === 'personal' ? 'personal' : 'generic',
      sources,
      confidence: Math.max(0, Math.min(100, Number(e.confidence) || 0)),
    });
  }
  /* Named people first, then the most-seen. */
  return out.sort((a, b) => Number(b.type === 'personal') - Number(a.type === 'personal') || b.sources - a.sources || b.confidence - a.confidence).slice(0, 10);
}

export interface FindOutcome {
  people: Record<string, FoundPerson[]>;
  searched: number;
  skipped: number;
  code: string;
  error: string;
}

export const MAX_FIND_PER_CALL = 5;

export async function findPeople(env: Env, accountId: string, websites: unknown[]): Promise<FindOutcome> {
  const out: FindOutcome = { people: {}, searched: 0, skipped: 0, code: '', error: '' };
  const sites = [...new Set(websites.map(w => String(w ?? '').trim()).filter(Boolean))].slice(0, MAX_FIND_PER_CALL);
  const now = Math.floor(Date.now() / 1000);
  const todo: { site: string; domain: string }[] = [];
  for (const site of sites) {
    const domain = domainOf(site);
    if (!domain || addressFacts(`x@${domain}`).free) { out.people[site] = []; continue; }
    const hit = await env.DB.prepare('SELECT payload FROM crm_email_finds WHERE domain = ? AND expires_at > ?').bind(domain, now).first<{ payload: string }>().catch(() => null);
    if (hit) { try { out.people[site] = JSON.parse(hit.payload) as FoundPerson[]; continue; } catch { /* stale shape: ask again */ } }
    todo.push({ site, domain });
  }
  if (!todo.length) return out;

  const access = await verifierFor(env, accountId);
  if (!access.ok) return { ...out, skipped: todo.length, code: access.code, error: access.code === 'no_verifier' ? 'Searching the web for addresses needs Hunter — the owner connects it in Settings → Platform services.' : access.error };
  if (!PROVIDERS[access.v.provider].finds) {
    return { ...out, skipped: todo.length, code: 'no_finder', error: `The connected verifier (${PROVIDERS[access.v.provider].name}) checks addresses but does not search for them. Hunter does both.` };
  }
  const may = await allowance(env, accountId, 'find', todo.length);
  if (may < todo.length) {
    out.skipped = todo.length - may;
    out.code = 'find_budget';
    out.error = `This workspace has used its web searches for addresses for now (${BUDGET.find.day} a day, ${BUDGET.find.month} a month).`;
  }
  for (const t of todo.slice(0, may)) {
    const r = await getJson(`${base(env, 'hunter')}/v2/domain-search?domain=${encodeURIComponent(t.domain)}&limit=10&api_key=${encodeURIComponent(access.v.key)}`);
    if (r.status === 401 || r.status === 403 || r.status === 429 || r.status === 0) {
      const why = r.status === 0 ? 'Hunter could not be reached.' : r.status === 429 ? 'Hunter says this key has used its searches for now.' : `Hunter refused the key (${r.status})${hunterError(r.body) ? `: ${hunterError(r.body)}` : ''}.`;
      if (r.status !== 0) await markVerifier(env, false, why);
      out.code = 'verifier_failed';
      out.error = why;
      out.skipped += todo.length - out.searched;
      break;
    }
    out.searched++;
    const people = r.status === 200 ? peopleFromHunter(t.domain, r.body) : [];
    out.people[t.site] = people;
    if (r.status === 200) {
      await env.DB.prepare('INSERT OR REPLACE INTO crm_email_finds (domain, payload, expires_at, created_at) VALUES (?,?,?,?)')
        .bind(t.domain, JSON.stringify(people), now + FIND_SECONDS, nowIso()).run().catch(() => undefined);
    }
  }
  await spend(env, accountId, 'find', out.searched);
  return out;
}
