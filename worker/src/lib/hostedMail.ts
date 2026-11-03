/**
 * Email on the customer's own domain, hosted here — "you@theirbusiness.com"
 * that receives into the app's inbox and sends from it, with no mail host of
 * their own.
 *
 * ── How it works, and why this way ──
 *
 * Cloudflare cannot run a mailbox server (no IMAP, no POP), so this is not a
 * mailbox a phone's mail app can open; it lives in the app's inbox. What
 * Cloudflare can do is accept mail for a domain and hand each message to a
 * Worker. So:
 *
 *   1. **The domain becomes a zone on the operator's Cloudflare account**
 *      (`addDomain`, `jump_start` so its existing DNS records are copied
 *      across). The customer changes the domain's nameservers to the two
 *      Cloudflare assigns — the only way Email Routing can work for a domain,
 *      and also the proof that they control it: nobody else can change them.
 *   2. **Receiving**: Email Routing on, MX records added by Cloudflare, one
 *      catch-all rule sending every message to this Worker (`email()` in
 *      index.ts → `receive`). Mail to an address that exists is stored
 *      (`crm_hosted_messages`, the raw message in R2 when the bucket is
 *      bound); anything else is refused with "no such address".
 *   3. **Sending**: through the operator's own Resend or Brevo account
 *      (Platform services → Email on customers' domains). The domain is added
 *      there and the records it asks for (DKIM, SPF, the bounce MX) are
 *      written into the zone by this code, then verified. A hosted mailbox
 *      row (`provider = 'hosted'`) never holds that key: `sendCredsFor` hands
 *      it over at send time, and only for a From address on a verified domain
 *      that belongs to the same workspace — so one customer can never send as
 *      another customer's domain with the shared key.
 *
 * Nothing pretends: each step's state is Cloudflare's or the provider's own
 * answer, and a step that could not be checked says so.
 */
import PostalMime from 'postal-mime';
import { decryptSecret, encryptSecret } from './crypto';
import { installSecret, nowIso, type Env } from './db';
import { rateLimit } from './rateLimit';
import type { ImapMessage } from './imap';

const KIND = 'hosted_mail';
const SECRET_KEY = 'mailbox_key';
/* Tests point these at stand-ins (HOSTED_CF_BASE, HOSTED_RESEND_BASE, HOSTED_BREVO_BASE — test/hostedMail.e2e.mjs). */
let CF = 'https://api.cloudflare.com/client/v4';
let RESEND = 'https://api.resend.com';
let BREVO = 'https://api.brevo.com';
function adopt(env: Env): void {
  CF = (env.HOSTED_CF_BASE ?? '').trim() || 'https://api.cloudflare.com/client/v4';
  RESEND = (env.HOSTED_RESEND_BASE ?? '').trim() || 'https://api.resend.com';
  BREVO = (env.HOSTED_BREVO_BASE ?? '').trim() || 'https://api.brevo.com';
}
/** What a hosted mailbox row carries as its incoming host — never connected to; it marks the row. */
export const HOSTED_HOST = 'mail.hosted.protectedcentral';

export type SendProvider = 'resend' | 'brevo';
export interface HostedConfig {
  cfToken: string; cfAccountId: string; workerName: string;
  sendProvider: SendProvider; sendKey: string;
}

/* ── The operator's configuration ────────────────────────────────────────── */

export async function hostedConfig(env: Env): Promise<HostedConfig | null> {
  adopt(env);
  const row = await env.DB.prepare('SELECT credentials FROM crm_install_providers WHERE kind = ?').bind(KIND).first<{ credentials: string }>().catch(() => null);
  if (!row?.credentials) return null;
  try {
    const c = JSON.parse(await decryptSecret(await installSecret(env.DB, SECRET_KEY), row.credentials)) as HostedConfig;
    return c.cfToken && c.cfAccountId ? c : null;
  } catch { return null; }
}

/** What the owner's screen may see: which fields are set, never their values. */
export async function hostedConfigView(env: Env) {
  const c = await hostedConfig(env);
  return { configured: !!c, cfAccountId: c?.cfAccountId ?? '', workerName: c?.workerName ?? '', sendProvider: c?.sendProvider ?? 'resend', hasToken: !!c?.cfToken, hasSendKey: !!c?.sendKey };
}

export async function saveHostedConfig(env: Env, patch: Partial<HostedConfig>): Promise<{ ok: boolean; error: string; field?: string }> {
  const old = await hostedConfig(env);
  const c: HostedConfig = {
    cfToken: (patch.cfToken ?? '').trim() || old?.cfToken || '',
    cfAccountId: (patch.cfAccountId ?? '').trim() || old?.cfAccountId || '',
    workerName: (patch.workerName ?? '').trim() || old?.workerName || 'crmpro',
    sendProvider: patch.sendProvider === 'brevo' ? 'brevo' : patch.sendProvider === 'resend' ? 'resend' : old?.sendProvider ?? 'resend',
    sendKey: (patch.sendKey ?? '').trim() || old?.sendKey || '',
  };
  if (!c.cfToken) return { ok: false, error: 'Paste a Cloudflare API token.', field: 'hosted.cfToken' };
  if (!/^[0-9a-f]{32}$/i.test(c.cfAccountId)) return { ok: false, error: 'The Cloudflare account ID is 32 letters and numbers (Workers & Pages → Overview, right-hand side).', field: 'hosted.cfAccountId' };
  if (!/^[a-z0-9-]{1,63}$/.test(c.workerName)) return { ok: false, error: 'The Worker name is the one in wrangler.jsonc — "crmpro" for the live site.', field: 'hosted.workerName' };
  const t = await cf<{ status?: string }>(c.cfToken, '/user/tokens/verify');
  if (!t.ok) return { ok: false, error: `Cloudflare refused that token: ${t.error}`, field: 'hosted.cfToken' };
  const enc = await encryptSecret(await installSecret(env.DB, SECRET_KEY), JSON.stringify(c));
  await env.DB.prepare(
    `INSERT INTO crm_install_providers (kind, provider, credentials, updated_at) VALUES (?, 'cloudflare', ?, ?)
     ON CONFLICT(kind) DO UPDATE SET provider = excluded.provider, credentials = excluded.credentials, updated_at = excluded.updated_at`,
  ).bind(KIND, enc, nowIso()).run();
  return { ok: true, error: '' };
}

/* ── Cloudflare ──────────────────────────────────────────────────────────── */

async function cf<T>(token: string, path: string, init: RequestInit = {}): Promise<{ ok: boolean; result?: T; error: string }> {
  try {
    const r = await fetch(`${CF}${path}`, { ...init, headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' }, signal: AbortSignal.timeout(15_000) });
    const j = await r.json<{ success?: boolean; result?: T; errors?: { message?: string; code?: number }[] }>().catch(() => ({ success: false } as { success?: boolean; result?: T; errors?: { message?: string }[] }));
    if (!j.success) return { ok: false, error: (j.errors ?? []).map(e => e.message).filter(Boolean).join('; ') || `Cloudflare answered HTTP ${r.status}.` };
    return { ok: true, result: j.result, error: '' };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : 'Cloudflare could not be reached.' };
  }
}

/* ── Domains ─────────────────────────────────────────────────────────────── */

export interface DomainRow {
  id: string; account_id: string; domain: string; zone_id: string; nameservers: string;
  zone_status: string; routing_status: string; send_provider: string; send_ref: string; send_status: string;
  last_error: string; checked_at: string | null; created_at: string;
}

const DOMAIN = /^(?=.{4,253}$)(?!-)([a-z0-9-]{1,63}\.)+[a-z]{2,63}$/;
export const cleanDomain = (d: unknown) => String(d ?? '').trim().toLowerCase().replace(/^https?:\/\//, '').replace(/^www\./, '').replace(/\/.*$/, '').replace(/\.$/, '');

/** Domains this platform must never take as a customer's. */
const RESERVED = /(^|\.)(protectedcentral\.com|gmail\.com|googlemail\.com|outlook\.com|hotmail\.com|yahoo\.com|icloud\.com|aol\.com|proton\.me|protonmail\.com)$/;

export async function listDomains(env: Env, accountId: string): Promise<DomainRow[]> {
  const { results } = await env.DB.prepare('SELECT * FROM crm_hosted_domains WHERE account_id = ? ORDER BY created_at').bind(accountId).all<DomainRow>();
  return results ?? [];
}

/**
 * Put a domain on the operator's Cloudflare account for this workspace. The
 * zone is created (its records scanned across); a zone already on the
 * account that is not this workspace's is refused — it is the owner's own,
 * or another customer's.
 */
export async function addDomain(env: Env, accountId: string, raw: string): Promise<{ ok: true; row: DomainRow } | { ok: false; error: string; field?: string }> {
  const c = await hostedConfig(env);
  if (!c) return { ok: false, error: 'Email on your own domain is not switched on for this platform yet.' };
  const domain = cleanDomain(raw);
  if (!DOMAIN.test(domain)) return { ok: false, error: 'Type the domain on its own, like yourbusiness.com.', field: 'hosted.domain' };
  if (RESERVED.test(domain)) return { ok: false, error: 'That domain belongs to an email provider — use a domain you own.', field: 'hosted.domain' };
  const taken = await env.DB.prepare('SELECT account_id FROM crm_hosted_domains WHERE domain = ?').bind(domain).first<{ account_id: string }>();
  if (taken) return { ok: false, error: taken.account_id === accountId ? 'That domain is already added.' : 'That domain is already set up by another account here. If it is yours, contact support.', field: 'hosted.domain' };
  const rl = await rateLimit(env, { what: 'hosted-domain-add', who: accountId, max: 10, windowSeconds: 86_400 });
  if (!rl.allowed) return { ok: false, error: 'That is a lot of domains for one day — try again tomorrow.', field: 'hosted.domain' };

  type Zone = { id: string; name: string; status: string; name_servers?: string[] };
  const existing = await cf<Zone[]>(c.cfToken, `/zones?name=${encodeURIComponent(domain)}&account.id=${c.cfAccountId}`);
  if (existing.ok && existing.result?.length) return { ok: false, error: 'That domain is already on this platform\'s Cloudflare account. If it is yours, contact support.', field: 'hosted.domain' };
  const z = await cf<Zone>(c.cfToken, '/zones', { method: 'POST', body: JSON.stringify({ name: domain, account: { id: c.cfAccountId }, type: 'full', jump_start: true }) });
  if (!z.ok || !z.result) return { ok: false, error: `Cloudflare could not add the domain: ${z.error}`, field: 'hosted.domain' };
  const row: DomainRow = {
    id: `hd-${crypto.randomUUID()}`, account_id: accountId, domain, zone_id: z.result.id, nameservers: JSON.stringify(z.result.name_servers ?? []),
    zone_status: z.result.status || 'pending', routing_status: 'off', send_provider: c.sendKey ? c.sendProvider : '', send_ref: '', send_status: c.sendKey ? 'not_started' : 'no_provider',
    last_error: '', checked_at: nowIso(), created_at: nowIso(),
  };
  await env.DB.prepare(
    `INSERT INTO crm_hosted_domains (id, account_id, domain, zone_id, nameservers, zone_status, routing_status, send_provider, send_ref, send_status, last_error, checked_at, created_at)
     VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)`,
  ).bind(row.id, row.account_id, row.domain, row.zone_id, row.nameservers, row.zone_status, row.routing_status, row.send_provider, row.send_ref, row.send_status, '', row.checked_at, row.created_at).run();
  return { ok: true, row };
}

/** A DNS record in the zone, unless an identical one is already there. */
async function ensureRecord(c: HostedConfig, zoneId: string, rec: { type: string; name: string; content: string; priority?: number }): Promise<string> {
  const list = await cf<{ id: string; content: string }[]>(c.cfToken, `/zones/${zoneId}/dns_records?type=${rec.type}&name=${encodeURIComponent(rec.name)}`);
  if (list.ok && (list.result ?? []).some(r => r.content.replace(/^"|"$/g, '') === rec.content)) return '';
  const r = await cf(c.cfToken, `/zones/${zoneId}/dns_records`, { method: 'POST', body: JSON.stringify({ ...rec, ttl: 1, proxied: false }) });
  return r.ok ? '' : `${rec.type} ${rec.name}: ${r.error}`;
}

/** The sending provider's DNS records for a domain, from its own API. */
type SendRecord = { type: string; name: string; content: string; priority?: number };
async function sendSetup(c: HostedConfig, domain: string, ref: string): Promise<{ ref: string; status: string; records: SendRecord[]; error: string }> {
  if (c.sendProvider === 'resend') {
    const H = { Authorization: `Bearer ${c.sendKey}`, 'Content-Type': 'application/json' };
    type R = { id?: string; status?: string; records?: { type?: string; name?: string; value?: string; priority?: number }[]; message?: string };
    let r: R;
    if (ref) r = await fetch(`${RESEND}/domains/${ref}`, { headers: H }).then(x => x.json<R>()).catch(() => ({ message: 'Resend could not be reached.' }));
    else {
      r = await fetch(`${RESEND}/domains`, { method: 'POST', headers: H, body: JSON.stringify({ name: domain }) }).then(x => x.json<R>()).catch(() => ({ message: 'Resend could not be reached.' }));
      /* Already on the account (added before, or by hand): find it. */
      if (!r.id && /already/i.test(r.message ?? '')) {
        const all = await fetch(`${RESEND}/domains`, { headers: H }).then(x => x.json<{ data?: { id: string; name: string }[] }>()).catch(() => ({ data: [] }));
        const found = (all.data ?? []).find(d => d.name === domain);
        if (found) r = await fetch(`${RESEND}/domains/${found.id}`, { headers: H }).then(x => x.json<R>()).catch(() => ({ message: 'Resend could not be reached.' }));
      }
    }
    if (!r.id) return { ref, status: 'failed', records: [], error: r.message ?? 'Resend did not add the domain.' };
    const records = (r.records ?? []).filter(x => x.type && x.name && x.value).map(x => ({
      type: String(x.type).toUpperCase(), name: x.name === '@' || x.name === domain ? domain : String(x.name).endsWith(domain) ? String(x.name) : `${x.name}.${domain}`,
      content: String(x.value), ...(x.priority !== undefined ? { priority: Number(x.priority) } : {}),
    }));
    if (r.status !== 'verified') await fetch(`${RESEND}/domains/${r.id}/verify`, { method: 'POST', headers: H }).catch(() => null);
    return { ref: r.id, status: r.status === 'verified' ? 'verified' : r.status === 'failed' ? 'failed' : 'pending', records, error: '' };
  }
  /* Brevo: the domain under Senders, its records, then "authenticate". */
  const H = { 'api-key': c.sendKey, 'Content-Type': 'application/json', accept: 'application/json' };
  type B = { authenticated?: boolean; verified?: boolean; message?: string; dns_records?: Record<string, { type?: string; value?: string; host_name?: string }> };
  let b = await fetch(`${BREVO}/v3/senders/domains/${encodeURIComponent(domain)}`, { headers: H }).then(x => x.json<B>()).catch(() => ({ message: 'Brevo could not be reached.' } as B));
  if (!b.dns_records) {
    const made = await fetch(`${BREVO}/v3/senders/domains`, { method: 'POST', headers: H, body: JSON.stringify({ name: domain }) }).then(x => x.json<B>()).catch(() => ({ message: 'Brevo could not be reached.' } as B));
    if (!made.dns_records) return { ref, status: 'failed', records: [], error: made.message ?? 'Brevo did not add the domain.' };
    b = made;
  }
  const records = Object.values(b.dns_records ?? {}).filter(x => x?.type && x.value).map(x => ({
    type: String(x.type).toUpperCase(), name: !x.host_name || x.host_name === '@' ? domain : x.host_name.endsWith(domain) ? x.host_name : `${x.host_name}.${domain}`, content: String(x.value),
  }));
  if (!b.authenticated) await fetch(`${BREVO}/v3/senders/domains/${encodeURIComponent(domain)}/authenticate`, { method: 'PUT', headers: H }).catch(() => null);
  return { ref: domain, status: b.authenticated ? 'verified' : 'pending', records, error: '' };
}

/**
 * Bring a domain up to date: the zone's state from Cloudflare; once active,
 * Email Routing on and the catch-all to this Worker; then the sending
 * provider's records written and its verification asked again. Every step
 * records what it found, so the screen shows where it is.
 */
export async function refreshDomain(env: Env, row: DomainRow): Promise<DomainRow> {
  const c = await hostedConfig(env);
  if (!c) return { ...row, last_error: 'Email on your own domain is not switched on for this platform.' };
  const errors: string[] = [];
  const z = await cf<{ status: string; name_servers?: string[] }>(c.cfToken, `/zones/${row.zone_id}`);
  let zone = row.zone_status, ns = row.nameservers, routing = row.routing_status, send = row.send_status, ref = row.send_ref;
  if (z.ok && z.result) { zone = z.result.status; ns = JSON.stringify(z.result.name_servers ?? JSON.parse(ns || '[]')); }
  else errors.push(`Domain: ${z.error}`);
  if (zone === 'active') {
    /* Receiving: routing on (Cloudflare adds the MX and SPF records), then everything to this Worker. */
    if (routing !== 'on') {
      const on = await cf(c.cfToken, `/zones/${row.zone_id}/email/routing/enable`, { method: 'POST', body: '{}' });
      if (!on.ok && !/already/i.test(on.error)) errors.push(`Receiving: ${on.error}`);
      const rule = await cf(c.cfToken, `/zones/${row.zone_id}/email/routing/rules/catch_all`, {
        method: 'PUT', body: JSON.stringify({ name: 'Protected Central inbox', enabled: true, matchers: [{ type: 'all' }], actions: [{ type: 'worker', value: [c.workerName] }] }),
      });
      if (!rule.ok) errors.push(`Receiving rule: ${rule.error}`);
      const st = await cf<{ enabled?: boolean; status?: string }>(c.cfToken, `/zones/${row.zone_id}/email/routing`);
      routing = st.ok && st.result?.enabled && rule.ok ? 'on' : 'pending';
    }
    /* Sending: the provider's records into the zone, then its verification. */
    if (c.sendKey && send !== 'verified') {
      const s = await sendSetup(c, row.domain, ref);
      ref = s.ref; send = s.status;
      if (s.error) errors.push(`Sending: ${s.error}`);
      for (const rec of s.records) { const e = await ensureRecord(c, row.zone_id, rec); if (e) errors.push(`Sending record ${e}`); }
      /* A DMARC policy that only reports, if the domain has none: receivers trust a domain that has one. */
      const dm = await cf<unknown[]>(c.cfToken, `/zones/${row.zone_id}/dns_records?type=TXT&name=_dmarc.${row.domain}`);
      if (dm.ok && !(dm.result ?? []).length) { const e = await ensureRecord(c, row.zone_id, { type: 'TXT', name: `_dmarc.${row.domain}`, content: 'v=DMARC1; p=none' }); if (e) errors.push(e); }
    } else if (!c.sendKey) send = 'no_provider';
  }
  const next = { ...row, zone_status: zone, nameservers: ns, routing_status: routing, send_status: send, send_ref: ref, send_provider: c.sendKey ? c.sendProvider : '', last_error: errors.join(' · ').slice(0, 600), checked_at: nowIso() };
  await env.DB.prepare(
    `UPDATE crm_hosted_domains SET zone_status = ?, nameservers = ?, routing_status = ?, send_status = ?, send_ref = ?, send_provider = ?, last_error = ?, checked_at = ? WHERE id = ? AND account_id = ?`,
  ).bind(next.zone_status, next.nameservers, next.routing_status, next.send_status, next.send_ref, next.send_provider, next.last_error, next.checked_at, row.id, row.account_id).run();
  await stampMailboxes(env, next);
  return next;
}

/** What each side of a hosted domain is waiting for, in the mailbox list's words. */
export function domainWhy(d: Pick<DomainRow, 'domain' | 'zone_status' | 'routing_status' | 'send_status'>): { incoming: string; outgoing: string } {
  const ns = `${d.domain} is waiting for its nameservers to be changed to Cloudflare's (Email & SMS → Your own domain shows which).`;
  return {
    incoming: d.zone_status !== 'active' ? ns : d.routing_status === 'on' ? '' : 'Receiving is being switched on — press Check again in a minute.',
    outgoing: d.zone_status !== 'active' ? ns : d.send_status === 'verified' ? ''
      : d.send_status === 'no_provider' ? 'Sending from your own domain is not switched on for this platform yet.'
        : d.send_status === 'failed' ? 'The sending provider could not verify this domain — press Check again.' : 'Sending is being verified — press Check again in a few minutes.',
  };
}

/**
 * The mailbox rows of a domain's addresses carry its state as their verified
 * stamps and last errors, so the mailbox list and everything that asks
 * "can this mailbox send / receive" read it the usual way.
 */
export async function stampMailboxes(env: Env, d: DomainRow): Promise<void> {
  const why = domainWhy(d);
  const now = nowIso();
  await env.DB.prepare(
    `UPDATE crm_mailbox_accounts SET
       in_verified_at = CASE WHEN ? = '' THEN COALESCE(in_verified_at, ?) ELSE NULL END, in_last_error = ?,
       out_verified_at = CASE WHEN ? = '' THEN COALESCE(out_verified_at, ?) ELSE NULL END, out_last_error = ?
     WHERE account_id = ? AND provider = 'hosted' AND id IN (SELECT mailbox_id FROM crm_hosted_addresses WHERE domain_id = ?)`,
  ).bind(why.incoming, now, why.incoming, why.outgoing, now, why.outgoing, d.account_id, d.id).run();
}

/** Remove a domain: its addresses, its mailboxes, its stored mail and the zone. */
export async function removeDomain(env: Env, row: DomainRow): Promise<{ ok: boolean; error: string }> {
  const c = await hostedConfig(env);
  const { results } = await env.DB.prepare('SELECT mailbox_id FROM crm_hosted_addresses WHERE domain_id = ? AND account_id = ?').bind(row.id, row.account_id).all<{ mailbox_id: string }>();
  for (const a of results ?? []) await env.DB.prepare('DELETE FROM crm_mailbox_accounts WHERE id = ? AND account_id = ?').bind(a.mailbox_id, row.account_id).run();
  await env.DB.batch([
    env.DB.prepare('DELETE FROM crm_hosted_messages WHERE domain_id = ? AND account_id = ?').bind(row.id, row.account_id),
    env.DB.prepare('DELETE FROM crm_hosted_addresses WHERE domain_id = ? AND account_id = ?').bind(row.id, row.account_id),
    env.DB.prepare('DELETE FROM crm_hosted_domains WHERE id = ? AND account_id = ?').bind(row.id, row.account_id),
  ]);
  if (c) { const r = await cf(c.cfToken, `/zones/${row.zone_id}`, { method: 'DELETE' }); if (!r.ok) return { ok: false, error: `Removed here, but Cloudflare kept the zone: ${r.error}` }; }
  return { ok: true, error: '' };
}

/* ── Addresses ───────────────────────────────────────────────────────────── */

export interface AddressRow { id: string; account_id: string; domain_id: string; address: string; mailbox_id: string; created_at: string }

const LOCAL = /^[a-z0-9](?:[a-z0-9._+-]{0,62}[a-z0-9])?$/;

/**
 * A new address on a domain this workspace holds: the address row and a
 * mailbox row (`provider = 'hosted'`, no key, no password), so everything
 * that sends from or reads a mailbox — campaigns, replies, the inbox — uses
 * it like any other.
 */
export async function addAddress(env: Env, accountId: string, domainId: string, localRaw: string, name: string): Promise<{ ok: true; address: string } | { ok: false; error: string; field?: string }> {
  const d = await env.DB.prepare('SELECT * FROM crm_hosted_domains WHERE id = ? AND account_id = ?').bind(domainId, accountId).first<DomainRow>();
  if (!d) return { ok: false, error: 'That domain is not in this workspace.' };
  const local = String(localRaw ?? '').trim().toLowerCase();
  if (!LOCAL.test(local)) return { ok: false, error: 'Use letters, numbers, dots or dashes before the @ — like hello or sales.', field: 'hosted.local' };
  const address = `${local}@${d.domain}`;
  if (await env.DB.prepare('SELECT 1 FROM crm_hosted_addresses WHERE address = ?').bind(address).first()) return { ok: false, error: 'That address already exists.', field: 'hosted.local' };
  const n = await env.DB.prepare('SELECT COUNT(*) AS n FROM crm_hosted_addresses WHERE domain_id = ?').bind(d.id).first<{ n: number }>();
  /* Cloudflare's own limit on routing addresses per domain; the catch-all serves them all, but the number keeps a domain sensible. */
  if ((n?.n ?? 0) >= 200) return { ok: false, error: 'A domain can have up to 200 addresses.', field: 'hosted.local' };
  const mailboxId = `mb-${crypto.randomUUID()}`;
  const primary = !(await env.DB.prepare('SELECT 1 FROM crm_mailbox_accounts WHERE account_id = ? LIMIT 1').bind(accountId).first());
  const now = nowIso();
  await env.DB.batch([
    env.DB.prepare(
      `INSERT INTO crm_mailbox_accounts (id, account_id, label, is_primary, from_name, from_email, imap_host, imap_port, imap_encryption, imap_username, provider, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, 0, 'ssl', ?, 'hosted', ?, ?)`,
    ).bind(mailboxId, accountId, address, primary ? 1 : 0, String(name ?? '').trim().slice(0, 80), address, HOSTED_HOST, address, now, now),
    env.DB.prepare('INSERT INTO crm_hosted_addresses (id, account_id, domain_id, address, mailbox_id, created_at) VALUES (?, ?, ?, ?, ?, ?)')
      .bind(`ha-${crypto.randomUUID()}`, accountId, d.id, address, mailboxId, now),
  ]);
  await stampMailboxes(env, d);
  return { ok: true, address };
}

export async function removeAddress(env: Env, accountId: string, id: string): Promise<boolean> {
  const a = await env.DB.prepare('SELECT * FROM crm_hosted_addresses WHERE id = ? AND account_id = ?').bind(id, accountId).first<AddressRow>();
  if (!a) return false;
  await env.DB.batch([
    env.DB.prepare('DELETE FROM crm_hosted_messages WHERE address_id = ? AND account_id = ?').bind(a.id, accountId),
    env.DB.prepare('DELETE FROM crm_mailbox_accounts WHERE id = ? AND account_id = ?').bind(a.mailbox_id, accountId),
    env.DB.prepare('DELETE FROM crm_hosted_addresses WHERE id = ? AND account_id = ?').bind(a.id, accountId),
  ]);
  return true;
}

export async function listAddresses(env: Env, accountId: string): Promise<(AddressRow & { messages: number })[]> {
  const { results } = await env.DB.prepare(
    `SELECT a.*, (SELECT COUNT(*) FROM crm_hosted_messages m WHERE m.address_id = a.id) AS messages
       FROM crm_hosted_addresses a WHERE a.account_id = ? ORDER BY a.address`,
  ).bind(accountId).all<AddressRow & { messages: number }>();
  return results ?? [];
}

/* ── Sending ─────────────────────────────────────────────────────────────── */

/**
 * The sending key for a hosted mailbox, at send time — only when its From
 * address is on a domain this workspace holds and the provider has verified.
 * Null otherwise, with the reason.
 */
export async function sendCredsFor(env: Env, accountId: string, fromEmail: string): Promise<{ name: string; key: string } | { why: string }> {
  const domain = String(fromEmail ?? '').toLowerCase().split('@')[1] ?? '';
  const d = await env.DB.prepare('SELECT send_status FROM crm_hosted_domains WHERE domain = ? AND account_id = ?').bind(domain, accountId).first<{ send_status: string }>();
  if (!d) return { why: 'This address is not on a domain in this workspace.' };
  if (d.send_status !== 'verified') return { why: `Sending from ${domain} is not verified yet — open Email & SMS → Your own domain and press Check again.` };
  const c = await hostedConfig(env);
  if (!c?.sendKey) return { why: 'Sending from your own domain is not switched on for this platform yet.' };
  return { name: c.sendProvider, key: c.sendKey };
}

/* ── Receiving ───────────────────────────────────────────────────────────── */

const MAX_BODY = 200_000;

/**
 * One message from Email Routing. The address must exist (else refused, so
 * the sender gets a bounce rather than mail vanishing); flooding one address
 * is refused too. The text is kept in D1 (trimmed); the whole raw message in
 * R2 when the bucket is bound, so nothing is lost.
 */
export async function receive(message: ForwardableEmailMessage, env: Env): Promise<void> {
  const to = String(message.to ?? '').toLowerCase().trim();
  const a = await env.DB.prepare('SELECT * FROM crm_hosted_addresses WHERE address = ?').bind(to).first<AddressRow>();
  if (!a) { message.setReject('No such address here.'); return; }
  const rl = await rateLimit(env, { what: 'hosted-in', who: a.id, max: 600, windowSeconds: 3600 });
  if (!rl.allowed) { message.setReject('This mailbox is receiving too much mail — try again later.'); return; }
  if (message.rawSize > 25 * 1024 * 1024) { message.setReject('That message is too large (25 MB at most).'); return; }
  const raw = await new Response(message.raw).arrayBuffer();
  let parsed: Awaited<ReturnType<typeof PostalMime.parse>> | null = null;
  try { parsed = await PostalMime.parse(raw); } catch { parsed = null; }
  const id = `hm-${crypto.randomUUID()}`;
  let rawKey = '';
  if (env.VIDEO) {
    rawKey = `mail/${a.account_id}/${a.id}/${id}.eml`;
    await env.VIDEO.put(rawKey, raw, { httpMetadata: { contentType: 'message/rfc822' } }).catch(() => { rawKey = ''; });
  }
  const html = parsed?.html ?? '';
  const text = parsed?.text ?? '';
  const body = (html || text || '').slice(0, MAX_BODY);
  const plain = (text || html.replace(/<style[\s\S]*?<\/style>/gi, ' ').replace(/<[^>]*>/g, ' ')).replace(/\s+/g, ' ').trim();
  const attachments = (parsed?.attachments ?? []).map(x => x.filename || x.mimeType).filter(Boolean).slice(0, 20);
  await env.DB.prepare(
    `INSERT INTO crm_hosted_messages (id, account_id, domain_id, address_id, mailbox_id, message_id, from_addr, from_name, to_addr, subject, sent_at, snippet, body, body_type, attachments, raw_key, size, seen, received_at)
     VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,0,?)`,
  ).bind(id, a.account_id, a.domain_id, a.id, a.mailbox_id, String(parsed?.messageId ?? '').slice(0, 300),
    String(parsed?.from?.address ?? message.from ?? '').slice(0, 300), String(parsed?.from?.name ?? '').slice(0, 200), to,
    String(parsed?.subject ?? '').slice(0, 500), String(parsed?.date ?? '').slice(0, 100), plain.slice(0, 200), body,
    html ? 'HTML' : 'TEXT', JSON.stringify(attachments), rawKey, raw.byteLength, nowIso()).run();
}

/** The latest messages of a hosted mailbox, in the shape the inbox reads from IMAP. */
export async function fetchHosted(env: Env, accountId: string, mailboxId: string, limit: number): Promise<{ ok: boolean; error: string; messages: ImapMessage[] }> {
  const { results } = await env.DB.prepare(
    `SELECT id, from_addr, from_name, to_addr, subject, sent_at, received_at, seen, snippet, body, body_type, attachments
       FROM crm_hosted_messages WHERE account_id = ? AND mailbox_id = ? ORDER BY received_at DESC LIMIT ?`,
  ).bind(accountId, mailboxId, Math.max(1, Math.min(50, limit))).all<{ id: string; from_addr: string; from_name: string; to_addr: string; subject: string; sent_at: string; received_at: string; seen: number; snippet: string; body: string; body_type: string; attachments: string }>();
  return {
    ok: true, error: '',
    messages: (results ?? []).map(m => {
      const files = (() => { try { return JSON.parse(m.attachments) as string[]; } catch { return []; } })();
      return {
        uid: m.id, from: m.from_addr, fromName: m.from_name, to: m.to_addr, subject: m.subject || '(no subject)',
        date: m.sent_at || m.received_at, seen: !!m.seen, snippet: m.snippet,
        body: m.body + (files.length ? (m.body_type === 'HTML' ? `<p><em>Attachments: ${files.map(f => f.replace(/[<>&]/g, '')).join(', ')}</em></p>` : `\n\nAttachments: ${files.join(', ')}`) : ''),
        bodyType: m.body_type === 'HTML' ? 'HTML' : 'TEXT',
      };
    }),
  };
}
