/**
 * Sending an SMS, and knowing when not to.
 *
 * The Twilio call itself lived inline in an endpoint, which meant only a
 * browser could reach it: the cron had no way to send an SMS step because the
 * credentials arrived in the request body and the scheduler has no request. So
 * it lives here, takes credentials rather than reading them, and both the
 * endpoint and the tick call the same function.
 *
 * `sendSms` refuses an opted-out number rather than leaving that to the caller.
 * Every caller would have to remember, one of them eventually would not, and
 * the failure is invisible: Twilio silently drops messages to somebody who
 * replied STOP, so the app would count a send that never happened and report a
 * reply rate against an audience that got nothing.
 */
import { decryptSecret } from './crypto';
import { installSecret, nowIso, type Env } from './db';

const SECRET_KEY = 'mailbox_key';

export interface SmsCredentials {
  provider: string;
  accountSid: string;
  authToken: string;
  fromNumber: string;
}

export interface SmsResult {
  ok: boolean;
  id?: string;
  error: string;
  /** True when we refused to send, rather than Twilio refusing. */
  suppressed?: boolean;
}

/** E.164, which is what Twilio requires and what the opt-out table is keyed on. */
export const E164 = /^\+[1-9]\d{6,14}$/;

interface Row {
  provider: string;
  account_sid: string;
  auth_token: string;
  from_number: string;
}

/** A workspace's SMS credentials, decrypted. Null when none are set up. */
export async function loadSmsConfig(env: Env, accountId: string): Promise<SmsCredentials | null> {
  const row = await env.DB.prepare('SELECT * FROM crm_sms_config WHERE account_id = ?')
    .bind(accountId).first<Row>();
  if (!row) return null;
  const key = await installSecret(env.DB, SECRET_KEY);
  return {
    provider: row.provider || 'twilio',
    accountSid: await decryptSecret(key, row.account_sid),
    authToken: await decryptSecret(key, row.auth_token),
    fromNumber: row.from_number,
  };
}

/** Has this number told this workspace to stop? */
export async function isOptedOut(env: Env, accountId: string, phone: string): Promise<boolean> {
  const row = await env.DB.prepare('SELECT 1 AS n FROM crm_sms_optouts WHERE account_id = ? AND phone = ?')
    .bind(accountId, phone).first();
  return !!row;
}

export async function recordOptOut(env: Env, accountId: string, phone: string, source = 'reply'): Promise<void> {
  await env.DB.prepare(
    'INSERT OR REPLACE INTO crm_sms_optouts (account_id, phone, source, at) VALUES (?,?,?,?)',
  ).bind(accountId, phone, source, nowIso()).run();
}

/**
 * The words that mean stop.
 *
 * Twilio recognises these at the carrier level for most numbers, so the message
 * may never reach the app at all — this exists for the inbound webhook and for
 * numbers where that interception is not on. Matching is on the whole message
 * trimmed, not a substring: "stop by the shop tomorrow" is not an opt-out, and
 * treating it as one silently loses a customer.
 */
const STOP_WORDS = new Set(['stop', 'stopall', 'unsubscribe', 'cancel', 'end', 'quit', 'stop all', 'optout', 'opt out']);

export function isStopMessage(body: string): boolean {
  return STOP_WORDS.has((body || '').trim().toLowerCase().replace(/[.!]+$/, ''));
}

/**
 * Send one message.
 *
 * `accountId` is optional only so the settings screen can test credentials that
 * have not been saved yet. With it, the opt-out list is checked first; without
 * it there is no workspace to check against, and that path never carries a
 * campaign.
 */
export async function sendSms(
  env: Env,
  creds: SmsCredentials,
  to: string,
  body: string,
  accountId?: string,
): Promise<SmsResult> {
  const text = (body ?? '').trim();
  if (!creds.accountSid || !creds.authToken || !creds.fromNumber) {
    return { ok: false, error: 'No SMS sender is set up for this workspace. Add one in Settings → Email & SMS.' };
  }
  if (!E164.test(to)) {
    return { ok: false, error: `"${to}" is not a phone number in international format, e.g. +15551234567.` };
  }
  if (!text) return { ok: false, error: 'The message is empty.' };
  if (!/^AC[0-9a-f]{32}$/i.test(creds.accountSid)) {
    return { ok: false, error: 'That does not look like a Twilio Account SID — they start with "AC".' };
  }

  if (accountId && await isOptedOut(env, accountId, to)) {
    return { ok: false, suppressed: true, error: `${to} has opted out of messages from this workspace.` };
  }

  /* 1600 is Twilio's ceiling for a single API call; past it the request is
     rejected outright rather than split, so it is trimmed here where the reason
     is visible. */
  const form = new URLSearchParams({ From: creds.fromNumber, To: to, Body: text.slice(0, 1600) });
  try {
    const r = await fetch(`https://api.twilio.com/2010-04-01/Accounts/${creds.accountSid}/Messages.json`, {
      method: 'POST',
      headers: {
        Authorization: 'Basic ' + btoa(`${creds.accountSid}:${creds.authToken}`),
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: form,
    });
    const data = await r.json<{ sid?: string; message?: string; code?: number }>()
      .catch(() => ({}) as { sid?: string; message?: string; code?: number });
    if (r.ok) return { ok: true, id: data.sid ?? 'sent', error: '' };
    return { ok: false, error: `Twilio refused it (HTTP ${r.status}): ${data.message ?? 'no reason given'}` };
  } catch (e) {
    return { ok: false, error: `Could not reach Twilio: ${e instanceof Error ? e.message : String(e)}` };
  }
}

/**
 * Check credentials without sending anything.
 *
 * A "test" that sends a real message needs a destination, costs the customer
 * money, and texts somebody. Fetching the account is a plain authenticated GET:
 * it proves the SID and token are a working pair and that the account is live,
 * which is the whole question being asked. It cannot prove the sending number
 * is permitted to send — only a send does that — so it does not claim to.
 */
export async function verifySmsCredentials(creds: SmsCredentials): Promise<SmsResult> {
  if (!creds.accountSid || !creds.authToken) {
    return { ok: false, error: 'Enter your Account SID and auth token first.' };
  }
  if (!/^AC[0-9a-f]{32}$/i.test(creds.accountSid)) {
    return { ok: false, error: 'That does not look like a Twilio Account SID — they start with "AC".' };
  }
  try {
    const r = await fetch(`https://api.twilio.com/2010-04-01/Accounts/${creds.accountSid}.json`, {
      headers: { Authorization: 'Basic ' + btoa(`${creds.accountSid}:${creds.authToken}`) },
    });
    if (r.ok) {
      type Account = { friendly_name?: string; status?: string };
      const data = await r.json<Account>().catch(() => ({}) as Account);
      if (data.status && data.status !== 'active') {
        return { ok: false, error: `Twilio says this account is "${data.status}", not active.` };
      }
      return { ok: true, id: data.friendly_name ?? 'ok', error: '' };
    }
    if (r.status === 401) {
      return { ok: false, error: 'Twilio rejected the SID and auth token. Check both — the token is the one on the account dashboard, not an API key secret.' };
    }
    return { ok: false, error: `Twilio refused the check (HTTP ${r.status}).` };
  } catch (e) {
    return { ok: false, error: `Could not reach Twilio: ${e instanceof Error ? e.message : String(e)}` };
  }
}


/* ── Numbers ───────────────────────────────────────────────────────────────
 *
 * Buying a number is the one thing in this file that spends money, so it is
 * kept apart from sending and every caller has to confirm it.
 *
 * Twilio only, and on the workspace's own account. There is no managed path
 * here on purpose: reselling telephone numbers is a regulated business in most
 * countries — a number carries an address requirement, a porting obligation and
 * in several jurisdictions a licence — and quietly buying one on the operator's
 * account would put that obligation somewhere nobody agreed to hold it.
 */

export interface AvailableNumber {
  number: string;
  friendly: string;
  locality: string;
  region: string;
  /** What Twilio charges monthly, when it says. Zero when it does not. */
  monthly: number;
  sms: boolean;
  voice: boolean;
}

/** Numbers that could be bought. Buys nothing. */
export async function searchNumbers(
  creds: SmsCredentials,
  country = 'US',
  contains = '',
  smsOnly = true,
): Promise<{ ok: boolean; numbers: AvailableNumber[]; error: string }> {
  if (!creds.accountSid || !creds.authToken) {
    return { ok: false, numbers: [], error: 'Add your Twilio credentials in Settings → Email & SMS first.' };
  }
  const cc = (country || 'US').toUpperCase().replace(/[^A-Z]/g, '').slice(0, 2) || 'US';
  const params = new URLSearchParams({ PageSize: '20' });
  if (contains.trim()) params.set('Contains', contains.trim().replace(/[^0-9*]/g, ''));
  if (smsOnly) params.set('SmsEnabled', 'true');

  try {
    const r = await fetch(
      `https://api.twilio.com/2010-04-01/Accounts/${creds.accountSid}/AvailablePhoneNumbers/${cc}/Local.json?${params}`,
      { headers: { Authorization: 'Basic ' + btoa(`${creds.accountSid}:${creds.authToken}`) } },
    );
    if (!r.ok) {
      const body = await r.text().catch(() => '');
      if (r.status === 404) {
        /* Twilio 404s a country it does not sell local numbers in, which reads
           as "broken" unless it is named. */
        return { ok: false, numbers: [], error: `Twilio does not sell local numbers in ${cc} on this account.` };
      }
      return { ok: false, numbers: [], error: `Twilio refused the search (HTTP ${r.status}): ${body.slice(0, 160)}` };
    }
    type Row = {
      phone_number?: string; friendly_name?: string; locality?: string; region?: string;
      capabilities?: { SMS?: boolean; sms?: boolean; voice?: boolean; MMS?: boolean };
    };
    const data = await r.json<{ available_phone_numbers?: Row[] }>().catch(() => ({}) as { available_phone_numbers?: Row[] });
    const numbers = (data.available_phone_numbers ?? []).map(n => ({
      number: n.phone_number ?? '',
      friendly: n.friendly_name ?? n.phone_number ?? '',
      locality: n.locality ?? '',
      region: n.region ?? '',
      /* Twilio does not quote a price on this endpoint. Rather than invent one,
         it is zero and the screen says the price comes from Twilio. */
      monthly: 0,
      sms: !!(n.capabilities?.SMS ?? n.capabilities?.sms),
      voice: !!n.capabilities?.voice,
    })).filter(n => n.number);
    return { ok: true, numbers, error: '' };
  } catch (e) {
    return { ok: false, numbers: [], error: `Could not reach Twilio: ${e instanceof Error ? e.message : String(e)}` };
  }
}

/**
 * Buy one number, and point it at this install so replies arrive.
 *
 * The webhook is set in the same call. A number bought without one looks bought
 * and silently swallows every STOP and every reply — which is worse than not
 * having bought it, because the app would then believe it can receive.
 */
export async function buyNumber(
  creds: SmsCredentials,
  number: string,
  inboundUrl: string,
): Promise<{ ok: boolean; number: string; error: string }> {
  if (!E164.test(number)) return { ok: false, number, error: `"${number}" is not a number in international format.` };
  if (!creds.accountSid || !creds.authToken) {
    return { ok: false, number, error: 'Add your Twilio credentials first.' };
  }
  const form = new URLSearchParams({ PhoneNumber: number });
  if (/^https:\/\//.test(inboundUrl)) {
    form.set('SmsUrl', inboundUrl);
    form.set('SmsMethod', 'POST');
  }
  try {
    const r = await fetch(`https://api.twilio.com/2010-04-01/Accounts/${creds.accountSid}/IncomingPhoneNumbers.json`, {
      method: 'POST',
      headers: {
        Authorization: 'Basic ' + btoa(`${creds.accountSid}:${creds.authToken}`),
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: form,
    });
    const data = await r.json<{ phone_number?: string; message?: string }>()
      .catch(() => ({}) as { phone_number?: string; message?: string });
    if (r.ok) return { ok: true, number: data.phone_number ?? number, error: '' };
    return { ok: false, number, error: `Twilio refused it (HTTP ${r.status}): ${data.message ?? 'no reason given'}` };
  } catch (e) {
    return { ok: false, number, error: `Could not reach Twilio: ${e instanceof Error ? e.message : String(e)}` };
  }
}
