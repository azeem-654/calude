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
