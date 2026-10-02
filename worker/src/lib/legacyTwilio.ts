/**
 * Twilio credentials that were kept where a browser could read them.
 *
 * ── Where they were ──
 *
 * The booking page's SMS reminder had its own Account SID, auth token and
 * sending number, typed into Scheduling → Automations. They lived in
 * `crm_schedule.automations` — localStorage, synced in plain text into
 * `crm_data` — and were sent again on every publish into
 * `crm_booking_config.private.twilio`, where nothing ever read them. Before
 * that, Settings kept the workspace's sender under `crm_sms` the same way.
 *
 * So the auth token sat in three places a tenant's browser or a database dump
 * would show it, unencrypted, while the one place that is meant to hold it —
 * `crm_sms_config`, encrypted with the install secret, never returned — was
 * the only one the senders (Autopilot's reminders, the automation engine, the
 * SMS step) actually read.
 *
 * ── What this does about it ──
 *
 * `takeLegacyTwilio` lifts the credentials out of any of those shapes and
 * returns the value without them. Every door a browser writes through
 * (`data.php`, `booking.php publish`) passes values through it, and
 * `scrubLegacyTwilio` sweeps the rows written before this existed, once.
 *
 * What it lifts is not thrown away when the workspace has no sender yet: it is
 * encrypted into `crm_sms_config`, unverified, so somebody whose reminders were
 * set up only on the booking screen keeps a sender rather than finding it
 * silently gone. A workspace that already has one keeps the one it saved
 * through Settings — that is the copy somebody chose most recently, and the
 * booking copy was never used.
 *
 * Not a migration file because SQL cannot encrypt: clearing the columns there
 * would have destroyed the only copy of a credential some customers have.
 */
import { encryptSecret } from './crypto';
import { installSecret, metaGet, metaPut, nowIso, type Env } from './db';
import { E164 } from './sms';

export interface LegacyTwilio {
  accountSid: string;
  authToken: string;
  fromNumber: string;
}

const str = (v: unknown): string => (typeof v === 'string' ? v.trim() : '');
const isObj = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v);

/**
 * The value with every Twilio credential removed, and the credentials found.
 *
 * Pure. Understands the three shapes the browser wrote: a schedule
 * (`automations.twilioSid/Token/From`), a booking `private` blob (`twilio:
 * {sid, token, from}` beside a copy of the automations), and the old `crm_sms`
 * record (`accountSid/authToken/fromNumber`). `changed` is whether anything was
 * removed, so a caller can skip a write that would change nothing.
 */
export function takeLegacyTwilio(value: unknown): { clean: unknown; found: LegacyTwilio | null; changed: boolean } {
  if (!isObj(value)) return { clean: value, found: null, changed: false };
  const out: Record<string, unknown> = { ...value };
  let sid = '', token = '', from = '', changed = false;

  if (isObj(out.automations)) {
    const a: Record<string, unknown> = { ...out.automations };
    for (const k of ['twilioSid', 'twilioToken', 'twilioFrom']) {
      if (k in a) changed = true;
    }
    sid ||= str(a.twilioSid); token ||= str(a.twilioToken); from ||= str(a.twilioFrom);
    delete a.twilioSid; delete a.twilioToken; delete a.twilioFrom;
    out.automations = a;
  }
  if ('twilio' in out) {
    const t = out.twilio;
    if (isObj(t)) { sid ||= str(t.sid); token ||= str(t.token); from ||= str(t.from); }
    delete out.twilio;
    changed = true;
  }
  if ('authToken' in out || 'accountSid' in out) {
    sid ||= str(out.accountSid); token ||= str(out.authToken); from ||= str(out.fromNumber);
    delete out.accountSid; delete out.authToken;
    changed = true;
  }

  /* A SID with no token cannot send, so there is nothing worth keeping — but it
     is still removed above, because it is half of the pair. */
  return { clean: out, found: token ? { accountSid: sid, authToken: token, fromNumber: from } : null, changed };
}

/**
 * Keep lifted credentials as the workspace's sender, if it has none.
 *
 * Returns what happened, for the sweep's count. The `WHERE auth_token = ''` on
 * the update is the guard against a race with Settings: a sender saved through
 * the form between the read and this write is not overwritten by an older copy.
 * Lands unverified — a credential that has never been checked is not one the
 * screen may show a green tick for.
 */
export async function adoptLegacyTwilio(env: Env, accountId: string, creds: LegacyTwilio): Promise<'adopted' | 'kept' | 'skipped'> {
  /* The reserved agency bucket is storage, not a workspace; nothing sends as it. */
  if (!accountId || accountId.startsWith('__')) return 'skipped';
  const existing = await env.DB.prepare('SELECT auth_token FROM crm_sms_config WHERE account_id = ?')
    .bind(accountId).first<{ auth_token: string }>();
  if (existing?.auth_token) return 'kept';

  const key = await installSecret(env.DB, 'mailbox_key');
  const from = E164.test(creds.fromNumber) ? creds.fromNumber : '';
  const res = await env.DB.prepare(
    `INSERT INTO crm_sms_config (account_id, provider, account_sid, auth_token, from_number, verified_at, last_error, updated_at)
     VALUES (?, 'twilio', ?, ?, ?, NULL, '', ?)
     ON CONFLICT(account_id) DO UPDATE SET
       account_sid = excluded.account_sid, auth_token = excluded.auth_token,
       from_number = CASE WHEN excluded.from_number != '' THEN excluded.from_number ELSE crm_sms_config.from_number END,
       verified_at = NULL, last_error = '', updated_at = excluded.updated_at
     WHERE crm_sms_config.auth_token = ''`,
  ).bind(accountId, await encryptSecret(key, creds.accountSid), await encryptSecret(key, creds.authToken), from, nowIso()).run();
  return res.meta.changes ? 'adopted' : 'kept';
}

/**
 * A value on its way into `crm_data`, with any Twilio credential taken out.
 *
 * `null` means "do not store this key at all" — the old `crm_sms` record, whose
 * only content was the credentials. A browser that has not reloaded since this
 * shipped still pushes what it holds, so this is what stops the plaintext
 * coming straight back after the sweep removed it.
 */
export async function cleanDataValue(env: Env, accountId: string, key: string, value: string): Promise<string | null> {
  if (key !== 'crm_schedule' && key !== 'crm_sms') return value;
  let parsed: unknown;
  try { parsed = JSON.parse(value); } catch { return key === 'crm_sms' ? null : value; }
  const { clean, found, changed } = takeLegacyTwilio(parsed);
  if (found) {
    try { await adoptLegacyTwilio(env, accountId, found); } catch { /* the strip below still happens */ }
  }
  if (key === 'crm_sms') return null;
  return changed ? JSON.stringify(clean) : value;
}

const DONE_KEY = 'legacy_twilio_scrubbed_at';

/**
 * Remove the plaintext copies already stored, once.
 *
 * Runs from housekeeping (hourly), and stamps itself done only after a pass in
 * which every row was handled — a pass that failed half way is tried again.
 * Once done it costs one meta read an hour: the doors above keep new copies
 * out, so there is nothing for a second pass to find.
 */
export async function scrubLegacyTwilio(env: Env): Promise<{ ran: boolean; scrubbed: number; adopted: number }> {
  if (await metaGet(env.DB, DONE_KEY)) return { ran: false, scrubbed: 0, adopted: 0 };

  let scrubbed = 0, adopted = 0, failed = 0;

  const data = await env.DB.prepare(
    `SELECT account_id, k, v FROM crm_data
      WHERE k = 'crm_sms' OR (k = 'crm_schedule' AND v LIKE '%twilio%')`,
  ).all<{ account_id: string; k: string; v: string }>();
  for (const row of data.results ?? []) {
    try {
      let parsed: unknown = null;
      try { parsed = JSON.parse(row.v); } catch { /* unreadable: crm_sms is dropped below, a schedule is left */ }
      const { clean, found, changed } = takeLegacyTwilio(parsed);
      if (found && (await adoptLegacyTwilio(env, row.account_id, found)) === 'adopted') adopted++;
      if (row.k === 'crm_sms') {
        await env.DB.prepare('DELETE FROM crm_data WHERE account_id = ? AND k = ?').bind(row.account_id, row.k).run();
        scrubbed++;
      } else if (changed) {
        await env.DB.prepare('UPDATE crm_data SET v = ?, updated_at = ? WHERE account_id = ? AND k = ?')
          .bind(JSON.stringify(clean), nowIso(), row.account_id, row.k).run();
        scrubbed++;
      }
    } catch { failed++; }
  }

  const booking = await env.DB.prepare(
    "SELECT account_id, private FROM crm_booking_config WHERE private LIKE '%twilio%'",
  ).all<{ account_id: string; private: string }>();
  for (const row of booking.results ?? []) {
    try {
      let parsed: unknown = {};
      try { parsed = JSON.parse(row.private || '{}'); } catch { parsed = {}; }
      const { clean, found } = takeLegacyTwilio(parsed);
      if (found && (await adoptLegacyTwilio(env, row.account_id, found)) === 'adopted') adopted++;
      /* Written even when nothing parsed: an unreadable blob that matched
         "twilio" is not one worth keeping a credential inside. */
      await env.DB.prepare('UPDATE crm_booking_config SET private = ? WHERE account_id = ?')
        .bind(JSON.stringify(isObj(clean) ? clean : {}), row.account_id).run();
      scrubbed++;
    } catch { failed++; }
  }

  if (!failed) await metaPut(env.DB, DONE_KEY, nowIso());
  return { ran: true, scrubbed, adopted };
}
