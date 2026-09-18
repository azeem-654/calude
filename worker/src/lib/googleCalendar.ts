/**
 * Google Calendar, and the Meet link that comes with an event.
 *
 * ── Why this is separate from googleAuth.ts ──
 *
 * That file does sign-in, deliberately on the three scopes Google
 * auto-approves. Calendar is a **sensitive** scope: adding it to the sign-in
 * client would put every new user of this install behind Google's verification
 * process and a 100-user cap. So this is its own consent, asked only of the
 * person connecting a calendar, and the sign-in button is unaffected.
 *
 * ── Why there is no video code here ──
 *
 * A Meet link is not something you create. You create a calendar event with a
 * `conferenceData.createRequest` and Google attaches one. There is no WebRTC,
 * no media server and no signalling in this product, and there should not be.
 *
 * ── What it does when it is not set up ──
 *
 * Says so, by name, at the point of use. Every function here returns a result
 * with an `error` a person can act on rather than throwing, because "book a
 * meeting" failing silently is a customer who thinks they have an appointment.
 */
import { decryptSecret, encryptSecret } from './crypto';
import { googleCreds } from './googleAuth';
import { installSecret, nowIso, type Env } from './db';
import { rid } from './engagement';

/**
 * The scope. Read-write on events only — not `calendar`, which would let this
 * delete a customer's whole calendar, and not read-only, which cannot create
 * the event. The narrowest scope that does the job is the one Google's review
 * asks about and the one a customer is most likely to agree to.
 */
export const CALENDAR_SCOPE = 'https://www.googleapis.com/auth/calendar.events';

const TOKEN_URL = 'https://oauth2.googleapis.com/token';
const CAL_API = 'https://www.googleapis.com/calendar/v3';

export interface CalResult<T> { ok: boolean; data?: T; error?: string }

/**
 * The operator's Google client — the same one sign-in uses.
 *
 * Deliberately not a second reader of the credentials table. One Google project
 * for the install means a customer connecting their calendar does not have to
 * make a Cloud project of their own, and it means there is one place a client
 * id is stored rather than two that can disagree about which is current.
 */
async function creds(env: Env): Promise<{ id: string; secret: string } | null> {
  const c = await googleCreds(env);
  return c ? { id: c.clientId, secret: c.clientSecret } : null;
}

export const authUrl = (clientId: string, redirect: string, state: string): string =>
  `https://accounts.google.com/o/oauth2/v2/auth?${new URLSearchParams({
    client_id: clientId,
    redirect_uri: redirect,
    response_type: 'code',
    scope: CALENDAR_SCOPE,
    /* Both are required to be handed a refresh token at all, and without one
       the connection dies an hour after it is made — which looks exactly like
       a bug and is in fact a missing parameter. */
    access_type: 'offline',
    prompt: 'consent',
    include_granted_scopes: 'true',
    state,
  }).toString()}`;

/** Swap the code from the redirect for tokens, and store them encrypted. */
export async function connect(
  env: Env, accountId: string, ownerEmail: string, code: string, redirect: string,
): Promise<CalResult<{ id: string }>> {
  const c = await creds(env);
  if (!c) return { ok: false, error: 'No Google client is configured for this installation.' };

  let res: Response;
  try {
    res = await fetch(TOKEN_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        code, client_id: c.id, client_secret: c.secret,
        redirect_uri: redirect, grant_type: 'authorization_code',
      }),
    });
  } catch (e) {
    return { ok: false, error: `Could not reach Google: ${e instanceof Error ? e.message : String(e)}` };
  }

  const tok = await res.json().catch(() => ({})) as Record<string, unknown>;
  if (!res.ok || !tok.access_token) {
    return { ok: false, error: String(tok.error_description ?? tok.error ?? 'Google refused the connection.') };
  }
  if (!tok.refresh_token) {
    /* Named rather than stored half-working. Google withholds the refresh token
       when the account has consented before, and a connection without one stops
       in an hour — which the customer would experience as the feature randomly
       breaking. Revoking and reconnecting is the actual fix. */
    return {
      ok: false,
      error: 'Google did not return a refresh token. Remove this app at myaccount.google.com/permissions and connect again.',
    };
  }

  const key = await installSecret(env.DB, 'mailbox_key');
  const id = rid('cal');
  const now = nowIso();
  const expires = new Date(Date.now() + (Number(tok.expires_in) || 3600) * 1000).toISOString();

  await env.DB.prepare(
    `INSERT INTO crm_calendar_connections
     (id, account_id, provider, owner_email, calendar_id, refresh_token, access_token, expires_at, scope, status, created_at, updated_at)
     VALUES (?,?, 'google', ?, 'primary', ?,?,?,?, 'connected', ?,?)
     ON CONFLICT(account_id, owner_email) DO UPDATE SET
       refresh_token=excluded.refresh_token, access_token=excluded.access_token,
       expires_at=excluded.expires_at, scope=excluded.scope,
       status='connected', last_error='', updated_at=excluded.updated_at`,
  ).bind(
    id, accountId, ownerEmail,
    await encryptSecret(key, String(tok.refresh_token)),
    await encryptSecret(key, String(tok.access_token)),
    expires, String(tok.scope ?? CALENDAR_SCOPE), now, now,
  ).run();

  return { ok: true, data: { id } };
}

/** A usable access token, refreshed if the stored one has expired. */
async function accessToken(env: Env, accountId: string, ownerEmail: string): Promise<CalResult<string>> {
  const row = await env.DB.prepare(
    `SELECT refresh_token AS refresh, access_token AS access, expires_at AS expires
     FROM crm_calendar_connections WHERE account_id = ? AND owner_email = ? AND status = 'connected'`,
  ).bind(accountId, ownerEmail).first<{ refresh: string; access: string; expires: string }>();
  if (!row) return { ok: false, error: 'No calendar is connected for that person.' };

  const key = await installSecret(env.DB, 'mailbox_key');

  /* A minute of slack. A token that expires while the request is in flight is
     indistinguishable from a broken connection to whoever is booking. */
  if (row.access && row.expires && Date.parse(row.expires) - 60_000 > Date.now()) {
    try { return { ok: true, data: await decryptSecret(key, row.access) }; } catch { /* re-mint below */ }
  }

  const c = await creds(env);
  if (!c) return { ok: false, error: 'No Google client is configured for this installation.' };

  let refresh: string;
  try { refresh = await decryptSecret(key, row.refresh); }
  catch { return { ok: false, error: 'The stored calendar credential could not be read. Reconnect the calendar.' }; }

  const res = await fetch(TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: c.id, client_secret: c.secret, refresh_token: refresh, grant_type: 'refresh_token',
    }),
  }).catch(() => null);

  const tok = res ? await res.json().catch(() => ({})) as Record<string, unknown> : {};
  if (!res?.ok || !tok.access_token) {
    const why = String(tok.error_description ?? tok.error ?? 'Google refused to refresh the connection.');
    /* Marked, so the screen can say "reconnect" instead of failing every booking
       from now on with the same opaque error. */
    await env.DB.prepare(
      "UPDATE crm_calendar_connections SET status = 'error', last_error = ?, updated_at = ? WHERE account_id = ? AND owner_email = ?",
    ).bind(why.slice(0, 300), nowIso(), accountId, ownerEmail).run();
    return { ok: false, error: why };
  }

  const access = String(tok.access_token);
  await env.DB.prepare(
    "UPDATE crm_calendar_connections SET access_token = ?, expires_at = ?, status = 'connected', last_error = '', updated_at = ? WHERE account_id = ? AND owner_email = ?",
  ).bind(
    await encryptSecret(key, access),
    new Date(Date.now() + (Number(tok.expires_in) || 3600) * 1000).toISOString(),
    nowIso(), accountId, ownerEmail,
  ).run();

  return { ok: true, data: access };
}

/** Busy periods, so a slot that is already taken is never offered. */
export async function busy(
  env: Env, accountId: string, ownerEmail: string, fromIso: string, toIso: string,
): Promise<CalResult<{ start: string; end: string }[]>> {
  const t = await accessToken(env, accountId, ownerEmail);
  if (!t.ok || !t.data) return { ok: false, error: t.error };

  const cal = await env.DB.prepare(
    'SELECT calendar_id AS calendarId FROM crm_calendar_connections WHERE account_id = ? AND owner_email = ?',
  ).bind(accountId, ownerEmail).first<{ calendarId: string }>();

  const res = await fetch(`${CAL_API}/freeBusy`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${t.data}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      timeMin: fromIso, timeMax: toIso,
      items: [{ id: cal?.calendarId || 'primary' }],
    }),
  }).catch(() => null);

  if (!res?.ok) return { ok: false, error: 'Google would not answer for that calendar.' };
  const data = await res.json().catch(() => ({})) as Record<string, unknown>;
  const cals = (data.calendars ?? {}) as Record<string, { busy?: { start: string; end: string }[] }>;
  const first = Object.values(cals)[0];
  return { ok: true, data: first?.busy ?? [] };
}

/**
 * Create the event, and ask Google for a Meet link with it.
 *
 * `conferenceDataVersion=1` is the whole trick: without it the create request
 * is accepted and silently ignored, and you get an event with no meeting on it
 * — which is the failure everybody hits once and cannot see in the response.
 */
export async function createEvent(env: Env, accountId: string, input: {
  ownerEmail: string;
  summary: string;
  description?: string;
  startIso: string;
  endIso: string;
  timezone: string;
  guestEmail?: string;
  guestName?: string;
}): Promise<CalResult<{ eventId: string; meetingUrl: string; htmlLink: string }>> {
  const t = await accessToken(env, accountId, input.ownerEmail);
  if (!t.ok || !t.data) return { ok: false, error: t.error };

  const cal = await env.DB.prepare(
    'SELECT calendar_id AS calendarId FROM crm_calendar_connections WHERE account_id = ? AND owner_email = ?',
  ).bind(accountId, input.ownerEmail).first<{ calendarId: string }>();

  const res = await fetch(
    `${CAL_API}/calendars/${encodeURIComponent(cal?.calendarId || 'primary')}/events?conferenceDataVersion=1&sendUpdates=all`,
    {
      method: 'POST',
      headers: { Authorization: `Bearer ${t.data}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        summary: input.summary.slice(0, 200),
        description: (input.description ?? '').slice(0, 4000),
        start: { dateTime: input.startIso, timeZone: input.timezone },
        end: { dateTime: input.endIso, timeZone: input.timezone },
        attendees: input.guestEmail
          ? [{ email: input.guestEmail, displayName: input.guestName ?? '' }]
          : [],
        conferenceData: {
          createRequest: {
            /* Unique per event. Reusing one hands two customers the same room. */
            requestId: rid('meet'),
            conferenceSolutionKey: { type: 'hangoutsMeet' },
          },
        },
      }),
    },
  ).catch(() => null);

  if (!res) return { ok: false, error: 'Could not reach Google Calendar.' };
  const ev = await res.json().catch(() => ({})) as Record<string, unknown>;
  if (!res.ok) {
    const err = (ev.error ?? {}) as { message?: string };
    return { ok: false, error: err.message || 'Google refused to create the event.' };
  }

  const conf = (ev.conferenceData ?? {}) as { entryPoints?: { entryPointType?: string; uri?: string }[] };
  const meet = conf.entryPoints?.find(e => e.entryPointType === 'video')?.uri ?? '';

  return {
    ok: true,
    data: {
      eventId: String(ev.id ?? ''),
      /* Reported empty rather than guessed. An event without a Meet link is a
         real outcome — a Workspace policy can forbid them — and a confirmation
         email containing a fabricated URL is worse than one that says a link
         will follow. */
      meetingUrl: meet,
      htmlLink: String(ev.htmlLink ?? ''),
    },
  };
}

export async function cancelEvent(
  env: Env, accountId: string, ownerEmail: string, eventId: string,
): Promise<CalResult<true>> {
  const t = await accessToken(env, accountId, ownerEmail);
  if (!t.ok || !t.data) return { ok: false, error: t.error };
  const cal = await env.DB.prepare(
    'SELECT calendar_id AS calendarId FROM crm_calendar_connections WHERE account_id = ? AND owner_email = ?',
  ).bind(accountId, ownerEmail).first<{ calendarId: string }>();

  const res = await fetch(
    `${CAL_API}/calendars/${encodeURIComponent(cal?.calendarId || 'primary')}/events/${encodeURIComponent(eventId)}?sendUpdates=all`,
    { method: 'DELETE', headers: { Authorization: `Bearer ${t.data}` } },
  ).catch(() => null);

  /* 410 is "already gone", which is the state we wanted. Treating it as a
     failure would leave a booking that cannot be cancelled in the app because
     it was already cancelled in Google. */
  if (res && (res.ok || res.status === 410)) return { ok: true, data: true };
  return { ok: false, error: 'Google would not cancel that event.' };
}
