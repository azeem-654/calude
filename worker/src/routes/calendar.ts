/**
 * Connecting a Google Calendar, and turning a booking into a real meeting.
 *
 * ── Why this is its own route ──
 *
 * The OAuth redirect has to land on a GET, and it lands on the *browser* rather
 * than on an API client — so unlike every other route here it answers with a
 * redirect and an HTML page, not JSON. Mixing that into the engagement route
 * would mean one handler with two contracts.
 *
 * ── Why Calendar consent is separate from sign-in ──
 *
 * `calendar.events` is a sensitive scope. Adding it to the sign-in client would
 * put every new user of this install behind Google's verification process and a
 * 100-new-user cap, for a feature most of them will never use. So it is asked
 * of the one person connecting a calendar, and the sign-in button is untouched.
 */
import { body, fail, json } from '../lib/http';
import { nowIso, userFromToken, workspaceAccess, type Env } from '../lib/db';
import { authUrl, cancelEvent, connect, createEvent, CALENDAR_SCOPE } from '../lib/googleCalendar';
import { googleCreds } from '../lib/googleAuth';
import { recordEvent, rid } from '../lib/engagement';
import { newToken, timingSafeEqual } from '../lib/crypto';

interface Req {
  token?: string;
  accountId?: string;
  action?: string;
  ownerEmail?: string;
  bookingId?: string;
}

/**
 * Where Google is told to come back to. One value, registered once.
 *
 * The API path rather than a pretty `/auth/...` one, because `run_worker_first`
 * in wrangler.jsonc only sends `/api/*` and `/p/*` to the Worker — everything
 * else is served as a static asset. A redirect to `/auth/google/calendar` would
 * have been answered by index.html, and the code would have been dropped on the
 * floor with the OAuth flow appearing to succeed. Widening the asset rule for
 * one callback would be a larger change to the serving model than this is
 * worth.
 */
const redirectFor = (origin: string) => `${origin}/api/calendar.php`;

export async function handleCalendar(req: Request, env: Env): Promise<Response> {
  const url = new URL(req.url);
  const origin = (env.APP_ORIGIN || url.origin).replace(/\/$/, '');

  /* ── The redirect back from Google ── */
  if (req.method === 'GET') {
    const code = url.searchParams.get('code') ?? '';
    const state = url.searchParams.get('state') ?? '';
    const denied = url.searchParams.get('error');

    /* Escaped: `detail` can carry Google's own error text, which is not ours
       to trust inside a page on our domain. */
    const esc = (x: string) => x.replace(/[&<>"']/g, ch => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch] as string));
    const page = (title: string, detail: string) => new Response(
      `<!doctype html><meta charset="utf-8"><title>${esc(title)}</title>`
      + '<body style="font-family:system-ui;padding:48px;max-width:32rem;margin:0 auto;color:#0f172a">'
      + `<h1 style="font-size:20px">${esc(title)}</h1>`
      + `<p style="color:#64748b;line-height:1.6">${esc(detail)}</p>`
      + `<p><a href="${esc(origin)}/engagement" style="color:#5b46e5">Back to Customer Engagement</a></p>`
      + '</body>',
      { headers: { 'Content-Type': 'text/html; charset=utf-8', 'Content-Security-Policy': "default-src 'none'; style-src 'unsafe-inline'", 'X-Content-Type-Options': 'nosniff' } },
    );

    if (denied) return page('Calendar not connected', 'Google was not given permission, so nothing was changed.');

    /* The state carries who asked, signed, so a stray callback cannot attach a
       calendar to a workspace that never requested one. */
    const [accountId, ownerEmail, nonce, sig] = state.split('|');
    if (!accountId || !ownerEmail || !sig) return page('Calendar not connected', 'That link was incomplete.');

    const row = await env.DB.prepare(
      "SELECT access_token AS nonce FROM crm_calendar_connections WHERE account_id = ? AND owner_email = ? AND status = 'pending'",
    ).bind(accountId, ownerEmail).first<{ nonce: string }>();
    if (!row || !timingSafeEqual(row.nonce, `${nonce}|${sig}`)) {
      return page('Calendar not connected', 'That connection request could not be matched. Start again from the app.');
    }

    const res = await connect(env, accountId, ownerEmail, code, redirectFor(origin));
    return res.ok
      ? page('Calendar connected', 'Bookings on this workspace will now create a Google Calendar event with a Meet link.')
      : page('Calendar not connected', res.error ?? 'Google refused the connection.');
  }

  const d = await body<Req>(req);
  const user = await userFromToken(env.DB, d.token);
  if (!user) return fail('Sign in again — this needs a current session.', 401, { code: 'unauthorised' });
  const accountId = String(d.accountId ?? '').trim();
  const access = await workspaceAccess(env.DB, user, accountId);
  if (!access.ok) return fail(access.message ?? 'That workspace is not yours.', 403);

  const act = String(d.action ?? '');

  if (act === 'status') {
    const creds = await googleCreds(env);
    const { results } = await env.DB.prepare(
      `SELECT owner_email AS ownerEmail, calendar_id AS calendarId, status, last_error AS lastError, updated_at AS updatedAt
       FROM crm_calendar_connections WHERE account_id = ? AND status != 'pending'`,
    ).bind(accountId).all();
    return json({
      success: true,
      /* Said plainly rather than shown as an empty list: a customer with no
         Google client configured on the install cannot connect anything, and
         the button that would try is worse than a sentence explaining why. */
      configured: !!creds,
      note: creds ? '' : 'No Google client is configured for this installation, so a calendar cannot be connected yet.',
      connections: results ?? [],
      scope: CALENDAR_SCOPE,
    });
  }

  if (act === 'connect') {
    const creds = await googleCreds(env);
    if (!creds) return fail('No Google client is configured for this installation.', 400, { code: 'no-client' });
    const ownerEmail = String(d.ownerEmail ?? user.email).trim().toLowerCase();

    /* A pending row holds the nonce until Google comes back. Reusing the
       access_token column for it is deliberate: it is empty at this point and
       overwritten by `connect`, so there is no extra column that exists only
       for thirty seconds of somebody's life. */
    const nonce = newToken();
    const sig = newToken().slice(0, 24);
    const now = nowIso();
    await env.DB.prepare(
      `INSERT INTO crm_calendar_connections
       (id, account_id, provider, owner_email, calendar_id, access_token, status, created_at, updated_at)
       VALUES (?,?, 'google', ?, 'primary', ?, 'pending', ?,?)
       ON CONFLICT(account_id, owner_email) DO UPDATE SET
         access_token = excluded.access_token, status = 'pending', updated_at = excluded.updated_at`,
    ).bind(rid('cal'), accountId, ownerEmail, `${nonce}|${sig}`, now, now).run();

    return json({
      success: true,
      url: authUrl(creds.clientId, redirectFor(origin), `${accountId}|${ownerEmail}|${nonce}|${sig}`),
    });
  }

  if (act === 'disconnect') {
    await env.DB.prepare('DELETE FROM crm_calendar_connections WHERE account_id = ? AND owner_email = ?')
      .bind(accountId, String(d.ownerEmail ?? '').trim().toLowerCase()).run();
    return json({ success: true });
  }

  /* ── Turn a booking into a calendar event with a Meet link ── */
  if (act === 'create_meeting') {
    const booking = await env.DB.prepare(
      'SELECT id, slot_date AS slotDate, slot_time AS slotTime, data, status FROM crm_bookings WHERE id = ? AND account_id = ?',
    ).bind(String(d.bookingId ?? ''), accountId).first<{ id: string; slotDate: string; slotTime: string; data: string; status: string }>();
    if (!booking) return fail('That booking could not be found.', 404);

    const res = await meetingForBooking(env, accountId, booking);
    return res.ok
      ? json({ success: true, meetingUrl: res.url })
      : fail(res.error ?? 'Could not create the meeting.', 200, { code: 'meeting' });
  }

  if (act === 'cancel_meeting') {
    const link = await env.DB.prepare(
      'SELECT id, event_id AS eventId, host_email AS hostEmail FROM crm_meeting_links WHERE booking_id = ? AND account_id = ?',
    ).bind(String(d.bookingId ?? ''), accountId).first<{ id: string; eventId: string; hostEmail: string }>();
    if (!link) return json({ success: true, note: 'There was no meeting on that booking.' });
    const res = await cancelEvent(env, accountId, link.hostEmail, link.eventId);
    await env.DB.prepare("UPDATE crm_meeting_links SET status = ?, last_error = ? WHERE id = ?")
      .bind(res.ok ? 'cancelled' : 'error', res.ok ? '' : (res.error ?? '').slice(0, 300), link.id).run();
    return res.ok ? json({ success: true }) : fail(res.error ?? 'Google would not cancel it.', 200);
  }

  return fail('Unknown action.', 400);
}

/**
 * The shared path, so a booking made through the public page and one created
 * from the app produce the same meeting.
 *
 * Never throws and never blocks the booking. A confirmed appointment with no
 * video link is a real outcome somebody can fix; a booking that failed because
 * Google was slow is a customer who thinks they have no appointment at all.
 */
export async function meetingForBooking(
  env: Env, accountId: string,
  booking: { id: string; slotDate: string; slotTime: string; data: string },
): Promise<{ ok: boolean; url?: string; error?: string }> {
  const conn = await env.DB.prepare(
    "SELECT owner_email AS ownerEmail FROM crm_calendar_connections WHERE account_id = ? AND status = 'connected' LIMIT 1",
  ).bind(accountId).first<{ ownerEmail: string }>();
  if (!conn) return { ok: false, error: 'No calendar is connected for this workspace.' };

  let data: Record<string, string> = {};
  try { data = JSON.parse(booking.data || '{}') as Record<string, string>; } catch { data = {}; }

  const timezone = data.timezone || 'UTC';
  /* The stored slot is a local wall-clock time in the workspace's own zone, and
     Google is given the zone alongside it rather than an offset — so a booking
     made before a daylight-saving change still happens at the time the customer
     picked, which an offset computed today would not. */
  const startIso = `${booking.slotDate}T${booking.slotTime}:00`;
  const endMinutes = Number(data.durationMinutes) || 30;
  const [h, m] = booking.slotTime.split(':').map(Number);
  const end = new Date(Date.UTC(2000, 0, 1, h, m + endMinutes));
  const endIso = `${booking.slotDate}T${String(end.getUTCHours()).padStart(2, '0')}:${String(end.getUTCMinutes()).padStart(2, '0')}:00`;

  const res = await createEvent(env, accountId, {
    ownerEmail: conn.ownerEmail,
    summary: `${data.guestName || 'Booking'} — ${data.eventTypeId || 'appointment'}`,
    description: data.notes || '',
    startIso, endIso, timezone,
    guestEmail: data.guestEmail, guestName: data.guestName,
  });

  await env.DB.prepare(
    `INSERT INTO crm_meeting_links
     (id, account_id, booking_id, provider, event_id, meeting_url, host_email, starts_at, timezone, status, last_error, created_at)
     VALUES (?,?,?, 'google', ?,?,?,?,?,?,?,?)`,
  ).bind(
    rid('mtg'), accountId, booking.id,
    res.data?.eventId ?? '', res.data?.meetingUrl ?? '', conn.ownerEmail,
    startIso, timezone, res.ok ? 'created' : 'error', res.ok ? '' : (res.error ?? '').slice(0, 300), nowIso(),
  ).run();

  if (res.ok) {
    await recordEvent(env, accountId, {
      kind: 'meeting.created', refId: booking.id,
      summary: `Meeting created for ${data.guestName || data.guestEmail || 'a booking'}`,
      detail: { meetingUrl: res.data?.meetingUrl ?? '' },
    });
  }

  return res.ok
    ? { ok: true, url: res.data?.meetingUrl ?? '' }
    : { ok: false, error: res.error };
}
