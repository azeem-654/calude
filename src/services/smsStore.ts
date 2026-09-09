/**
 * The workspace's SMS sender, kept on the server.
 *
 * These lived in localStorage under `crm_sms` — the Twilio Account SID and auth
 * token, in plain text, in the browser. Two things followed. Anyone with the
 * machine had the credentials, and nothing that runs without a browser could
 * send: the cron had nowhere to read a token from, so an SMS step in a sequence
 * was a record that could never go out.
 *
 * Same treatment as the mailbox now: encrypted at rest with the install secret,
 * never returned here, resolved server-side by workspace.
 */
import { sessionToken } from './auth';
import { getActiveAccountId } from './tenancy';
import { API_BASE } from './apiBase';

/** What the settings screen may see: everything except the secrets. */
export interface SmsStatus {
  provider: string;
  fromNumber: string;
  hasCredentials: boolean;
  verifiedAt: string | null;
  lastError: string;
}

export interface SmsOptOut {
  phone: string;
  source: string;
  at: string;
}

interface Reply {
  success: boolean;
  message?: string;
  error?: string;
  sms?: SmsStatus | null;
  optOuts?: SmsOptOut[];
  id?: string;
}

async function call(action: string, extra: Record<string, unknown> = {}): Promise<Reply> {
  const accountId = getActiveAccountId();
  if (!accountId) return { success: false, error: 'No workspace is active yet.' };
  try {
    const r = await fetch(`${API_BASE}/api/sms-send.php`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ token: sessionToken(), accountId, action, ...extra }),
    });
    return await r.json() as Reply;
  } catch (e) {
    return { success: false, error: `Could not reach the server: ${e instanceof Error ? e.message : String(e)}` };
  }
}

export async function fetchSmsStatus(): Promise<SmsStatus | null> {
  const r = await call('get');
  return r.success ? (r.sms ?? null) : null;
}

/**
 * Save the sender.
 *
 * Blank secrets mean "keep the stored ones", the same convention the mailbox
 * uses — the form shows dots and cannot send back what it was never given.
 */
export async function saveSmsConfig(cfg: { accountSid: string; authToken: string; fromNumber: string }): Promise<Reply> {
  return call('save', { accountSid: cfg.accountSid, authToken: cfg.authToken, from: cfg.fromNumber });
}

/**
 * Ask Twilio whether the credentials are real.
 *
 * Not a send. A test that sends costs the customer money and texts somebody, so
 * this fetches the account instead — which answers the question actually being
 * asked, and says plainly that it cannot vouch for the sending number.
 */
export async function testSmsConfig(): Promise<Reply> { return call('test'); }

export async function listOptOuts(): Promise<SmsOptOut[]> {
  const r = await call('optouts');
  return r.success ? (r.optOuts ?? []) : [];
}

export async function addOptOut(phone: string): Promise<Reply> { return call('opt_out', { phone }); }

/** Send one message now, from the workspace's saved sender. */
export async function sendSmsNow(to: string, body: string): Promise<Reply> {
  return call('send', { to, body });
}
