/**
 * Texts to found businesses only with their own say-so.
 *
 * ── Why this exists ──
 *
 * AI Prospecting finds businesses that never asked to hear from anybody. An
 * email to a published business address is the lawful case for cold outreach;
 * a marketing text is not — in the US the TCPA and state laws (Virginia's
 * Telephone Privacy Protection Act among them) apply per message, and an email
 * reply is not consent to texts. So a prospect is texted only after they agree,
 * on a page of their own:
 *
 *   {{smsOptInLink}} in an email → /api/sms-optin.php (signed per contact) →
 *   they type their mobile and tick the box → `crm_sms_consents`, their contact
 *   gets that number and the `sms opt-in` tag, and any workflow that starts on
 *   that tag starts (the wizard's "Text the prospects who opt in").
 *
 * `prospectSmsBlock` is the gate every texting path asks: anybody still a
 * `prospect` with no consent for that number is not texted, and the log says so.
 * STOP still wins over consent — `sendSms` checks opt-outs after this.
 */
import { dataGet, dataUpdate, installSecret, nowIso, type Env } from './db';
import { enrolOnEvent } from './automationEngine';

const KEY = 'sms_optin';
export const CONSENT_TAG = 'sms opt-in';
export const CONSENT_WORDING = 'I agree to receive text messages about this offer at this number. Message and data rates may apply. Reply STOP to opt out at any time.';

async function hmac(env: Env): Promise<CryptoKey> {
  return crypto.subtle.importKey('raw', new TextEncoder().encode(await installSecret(env.DB, KEY)), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
}
async function sig(env: Env, accountId: string, contactId: string): Promise<string> {
  const mac = await crypto.subtle.sign('HMAC', await hmac(env), new TextEncoder().encode(`${accountId}\n${contactId}`));
  return [...new Uint8Array(mac)].slice(0, 12).map(b => b.toString(16).padStart(2, '0')).join('');
}

/** The link for one contact, or '' when there is no app address to put in it (and the email line is dropped). */
export async function optInLink(env: Env, accountId: string, contactId: string): Promise<string> {
  const origin = (env.APP_ORIGIN ?? '').trim().replace(/\/+$/, '');
  if (!origin || !contactId) return '';
  return `${origin}/api/sms-optin.php?a=${encodeURIComponent(accountId)}&c=${encodeURIComponent(contactId)}&s=${await sig(env, accountId, contactId)}`;
}

export async function optInValid(env: Env, accountId: string, contactId: string, s: string): Promise<boolean> {
  if (!s || !accountId || !contactId) return false;
  const want = await sig(env, accountId, contactId);
  if (want.length !== s.length) return false;
  let diff = 0;
  for (let i = 0; i < want.length; i++) diff |= want.charCodeAt(i) ^ s.charCodeAt(i);
  return diff === 0;
}

/** "+1 (804) 555-0101" → "+18045550101"; anything without a country code is refused. */
export function e164(raw: string): string {
  const t = raw.trim();
  if (!t.startsWith('+')) return '';
  const d = t.replace(/[^\d]/g, '');
  return d.length >= 8 && d.length <= 15 ? `+${d}` : '';
}

export async function hasConsent(env: Env, accountId: string, phone: string): Promise<boolean> {
  const p = e164(phone);
  if (!p) return false;
  const row = await env.DB.prepare('SELECT 1 AS n FROM crm_sms_consents WHERE account_id = ? AND phone = ?').bind(accountId, p).first().catch(() => null);
  return !!row;
}

/**
 * Why this contact must not be texted at this number, or '' when they may.
 * Only prospects are gated: a customer or lead came to the business, and their
 * texting rules are the workspace's own (opt-outs still apply in `sendSms`).
 */
export async function prospectSmsBlock(env: Env, accountId: string, contact: { status?: string; name?: string }, phone: string): Promise<string> {
  if (contact.status !== 'prospect') return '';
  if (await hasConsent(env, accountId, phone)) return '';
  return `${contact.name ?? 'This prospect'} has not agreed to texts at ${phone || 'this number'} — a found business is only texted after opting in through the link in your email.`;
}

/** Record their yes: the consent, their number on the contact, the tag, and the workflows that start on it. */
export async function recordConsent(env: Env, accountId: string, contactId: string, phone: string, ip: string): Promise<{ ok: boolean; name: string }> {
  const at = nowIso();
  await env.DB.prepare(
    `INSERT INTO crm_sms_consents (account_id, phone, contact_id, wording, ip, at) VALUES (?,?,?,?,?,?)
     ON CONFLICT(account_id, phone) DO UPDATE SET contact_id = excluded.contact_id, wording = excluded.wording, ip = excluded.ip, at = excluded.at`,
  ).bind(accountId, phone, contactId, CONSENT_WORDING, ip.slice(0, 64), at).run();
  /* A yes now outranks an old STOP for this number — it is the newer, explicit answer. */
  await env.DB.prepare('DELETE FROM crm_sms_optouts WHERE account_id = ? AND phone = ?').bind(accountId, phone).run().catch(() => undefined);

  let name = '';
  let email = '';
  await dataUpdate(env.DB, accountId, 'crm_contacts', cur => {
    let list: Record<string, unknown>[] = [];
    try { list = JSON.parse(cur ?? '[]'); } catch { return null; }
    const c = list.find(x => x.id === contactId);
    if (!c) return null;
    name = String(c.name ?? ''); email = String(c.email ?? '');
    const tags = Array.isArray(c.tags) ? (c.tags as string[]) : [];
    c.phone = phone;
    c.tags = tags.includes(CONSENT_TAG) ? tags : [...tags, CONSENT_TAG];
    c.customFields = { ...(c.customFields as Record<string, string> ?? {}), smsConsentAt: at };
    return JSON.stringify(list);
  }).catch(() => false);
  if (!name) {
    const list = JSON.parse((await dataGet(env.DB, accountId, 'crm_contacts')) ?? '[]') as { id: string; name?: string; email?: string }[];
    const c = list.find(x => x.id === contactId);
    name = c?.name ?? ''; email = c?.email ?? '';
  }
  await enrolOnEvent(env, accountId, { kind: 'tag_added', ref: CONSENT_TAG, contactId, contactName: name, contactEmail: email, contactPhone: phone });
  return { ok: true, name };
}
