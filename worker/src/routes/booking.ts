/**
 * The public booking page, and the guest bookings taken through it.
 *
 * This is the port that fixes a real multi-tenant bug rather than carrying it
 * over. In the PHP every published schedule, every set of SMTP credentials and
 * every guest booking on the whole install lived under one hardcoded account
 * id — the literal string '__booking__'. Two clients of the same agency
 * silently overwrote each other's booking page, availability and guest list,
 * and the last workspace to open Scheduling won.
 *
 * Here the account owns its row, and a visitor reaches it by slug.
 *
 * Actions split three ways by who is allowed to call them:
 *   owner   publish, list, set_status          — session required
 *   visitor config, slots, create              — public, by slug
 *   guest   get, cancel, reschedule            — proven by the booking's key
 */
import { rateLimit } from '../lib/rateLimit';
import { addr, body, fail, headerSafe, json, ok } from '../lib/http';
import { canAccess, nowIso, userFromToken, type Env } from '../lib/db';
import { newToken, timingSafeEqual } from '../lib/crypto';
import { meetingForBooking } from './calendar';
import { recordEvent, upsertPerson } from '../lib/engagement';
import { canSend, deliver, fromAddressOf } from '../lib/deliver';
import { loadMailbox } from './mailbox';
import { adoptLegacyTwilio, takeLegacyTwilio } from '../lib/legacyTwilio';

interface BookingBody {
  action?: string;
  token?: string;
  accountId?: string;
  slug?: string;
  public?: unknown;
  private?: unknown;
  id?: string;
  key?: string;
  status?: string;
  date?: string;
  slotDate?: string;
  slotTime?: string;
  guestName?: string;
  guestEmail?: string;
  guestPhone?: string;
  notes?: string;
  timezone?: string;
  eventTypeId?: string;
}

const SLUG_OK = /^[a-z0-9][a-z0-9-]{0,63}$/;

const esc = (v: unknown) => String(v ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

/** "Tuesday 6 October 2026 at 2:30 pm" — the slot as the owner published it. */
function slotWords(date: string, time: string): string {
  const [y, m, d] = date.split('-').map(Number);
  const [h, mi] = time.split(':').map(Number);
  const day = new Date(Date.UTC(y, m - 1, d)).toLocaleDateString('en-GB', { timeZone: 'UTC', weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
  return `${day} at ${h % 12 || 12}:${String(mi).padStart(2, '0')} ${h >= 12 ? 'pm' : 'am'}`;
}

/**
 * The emails a booking promises: the guest's confirmation (with the link that
 * lets them move or cancel it) and, if the owner asked, a note to the owner.
 *
 * The booking page said "a confirmation email is on its way" and the
 * Automations tab offered both switches, and nothing anywhere sent either —
 * guests were left with no record of the appointment and no way back to it.
 * These go from the workspace's own mailbox, through the one door; a failure
 * never fails the booking, and what was actually sent is returned so the page
 * only says "on its way" when it is.
 */
async function bookingMail(
  env: Env, accountId: string, origin: string,
  what: 'booked' | 'rescheduled' | 'cancelled',
  b: { id: string; key: string; slotDate: string; slotTime: string; guestName: string; guestEmail: string; notes?: string; meetingUrl?: string },
): Promise<{ guest: boolean }> {
  try {
    const cfg = await env.DB.prepare('SELECT public, private FROM crm_booking_config WHERE account_id = ?')
      .bind(accountId).first<{ public: string; private: string }>();
    if (!cfg) return { guest: false };
    let pub: Record<string, unknown> = {};
    let auto: Record<string, unknown> = {};
    try { pub = JSON.parse(cfg.public || '{}') as Record<string, unknown>; } catch { /* defaults */ }
    try { auto = ((JSON.parse(cfg.private || '{}') as { automations?: Record<string, unknown> }).automations ?? {}); } catch { /* defaults */ }

    const mb = await loadMailbox(env, accountId);
    if (!canSend(mb)) return { guest: false };
    const fromEmail = fromAddressOf(mb);
    if (!fromEmail) return { guest: false };

    const title = String(pub.title || 'Meeting');
    const when = slotWords(b.slotDate, b.slotTime);
    const tz = String(pub.timezone || '');
    const location = String(pub.location || '');
    const manageUrl = `${origin}/book?manage=${encodeURIComponent(b.id)}.${encodeURIComponent(b.key)}`;
    const first = b.guestName.trim().split(/\s+/)[0] || 'there';
    const button = (href: string, label: string) =>
      `<p><a href="${esc(href)}" style="display:inline-block;padding:11px 22px;background:#17191c;color:#fff;border-radius:8px;text-decoration:none;font-weight:700">${esc(label)}</a></p>`;

    let guest = false;
    /* On unless the owner switched it off — the default the switch shows. */
    if (auto.confirmEmail !== false) {
      const lead = what === 'cancelled' ? `Your ${esc(title)} on ${esc(when)} is cancelled.`
        : what === 'rescheduled' ? `Your ${esc(title)} has moved to <strong>${esc(when)}</strong>${tz ? ` (${esc(tz)})` : ''}.`
          : `You're booked: <strong>${esc(title)}</strong> on <strong>${esc(when)}</strong>${tz ? ` (${esc(tz)})` : ''}.`;
      const html = `<p>Hi ${esc(first)},</p><p>${lead}</p>`
        + (what !== 'cancelled' && location ? `<p>Where: ${esc(location)}</p>` : '')
        + (what !== 'cancelled' && b.meetingUrl ? `<p>Join: <a href="${esc(b.meetingUrl)}">${esc(b.meetingUrl)}</a></p>` : '')
        + (what === 'cancelled' ? '' : button(manageUrl, 'Reschedule or cancel'));
      const subject = what === 'cancelled' ? `Cancelled: ${title}` : what === 'rescheduled' ? `Moved: ${title}, ${when}` : `Confirmed: ${title}, ${when}`;
      const r = await deliver(mb, { fromName: mb.from.name || title, fromEmail, to: b.guestEmail, subject, html, replyTo: mb.from.replyTo || undefined });
      guest = r.ok;
    }

    const ownerTo = auto.ownerNotify ? addr(auto.ownerEmail) : null;
    if (ownerTo) {
      const verb = what === 'cancelled' ? 'cancelled' : what === 'rescheduled' ? 'moved' : 'booked';
      const html = `<p>${esc(b.guestName)} (${esc(b.guestEmail)}) ${verb} <strong>${esc(title)}</strong> — ${esc(when)}${tz ? ` (${esc(tz)})` : ''}.</p>`
        + (b.notes ? `<p>Notes: ${esc(b.notes)}</p>` : '');
      await deliver(mb, { fromName: mb.from.name || title, fromEmail, to: ownerTo, subject: `${b.guestName} ${verb}: ${title}, ${when}`, html, replyTo: b.guestEmail });
    }
    return { guest };
  } catch {
    return { guest: false };
  }
}
const DATE_OK = /^\d{4}-\d{2}-\d{2}$/;
const TIME_OK = /^\d{2}:\d{2}$/;

export async function handleBooking(req: Request, env: Env): Promise<Response> {
  const d = await body<BookingBody>(req);
  const action = String(d.action ?? '');

  /* ── Owner: publish the page ── */
  if (action === 'publish') {
    const user = await userFromToken(env.DB, d.token);
    if (!user) return fail('Sign in again — this action needs a current session.', 401, { code: 'unauthorised' });

    const accountId = String(d.accountId ?? '').trim();
    if (!accountId) return fail('A workspace is required to publish a booking page.');
    if (!(await canAccess(env.DB, user, accountId))) return fail('That workspace is not yours to publish.', 403);

    const pub = (d.public ?? {}) as Record<string, unknown>;
    const slug = String(pub.slug ?? '').trim().toLowerCase();
    if (slug && !SLUG_OK.test(slug)) {
      return fail('A booking link can use lowercase letters, numbers and hyphens only.');
    }

    /* A slug is how a visitor finds one workspace rather than another, so two
       accounts cannot hold the same one. */
    if (slug) {
      const clash = await env.DB.prepare('SELECT account_id FROM crm_booking_config WHERE slug = ? AND account_id != ?')
        .bind(slug, accountId).first<{ account_id: string }>();
      if (clash) return fail(`The link "${slug}" is already taken by another workspace. Choose a different one.`);
    }

    /*
     * No credential is stored with the page.
     *
     * The client used to send the reminder's Twilio SID and auth token here on
     * every publish, and they were kept in plain text in `private` — read by
     * nothing, because every SMS sender resolves the workspace's encrypted
     * sender (`loadSmsConfig`). A client still on the old bundle may send them
     * once more; they are kept as the sender if the workspace has none, and
     * never written to this row.
     */
    const { clean: priv, found } = takeLegacyTwilio(d.private ?? {});
    if (found) {
      try { await adoptLegacyTwilio(env, accountId, found); } catch { /* publishing must not fail for this */ }
    }

    await env.DB.prepare(
      `INSERT INTO crm_booking_config (account_id, slug, public, private, updated_at) VALUES (?, ?, ?, ?, ?)
       ON CONFLICT(account_id) DO UPDATE SET slug = excluded.slug, public = excluded.public,
                                             private = excluded.private, updated_at = excluded.updated_at`,
    ).bind(accountId, slug || null, JSON.stringify(pub), JSON.stringify(priv ?? {}), nowIso()).run();
    return ok({ slug });
  }

  /* ── Visitor: read the published page ──
     Public by necessity — the person booking has no account. Only the `public`
     column is ever returned; `private` holds the automation switches and
     never leaves the server either. Credentials are not kept here at all. */
  if (action === 'config') {
    const slug = String(d.slug ?? '').trim().toLowerCase();
    const accountId = String(d.accountId ?? '').trim();

    /*
     * No slug and no account used to fall through to
     * `ORDER BY updated_at LIMIT 1` — "on a single-workspace install there is
     * only one page". This install is not single-workspace: it is a white-label
     * product whose whole point is sub-accounts. So a bare /book served
     * whichever workspace had gone longest without an edit — a stranger's
     * booking page, under this deployment's name, and any booking taken on it
     * landed in that stranger's account.
     *
     * The fallback survives only where the premise actually holds: exactly one
     * config on the install. Two or more and there is no honest answer to
     * "whose page is this?", so it says there is none.
     */
    let row: { account_id: string; public: string } | null = null;
    if (slug) {
      row = await env.DB.prepare('SELECT account_id, public FROM crm_booking_config WHERE slug = ?')
        .bind(slug).first<{ account_id: string; public: string }>();
    } else if (accountId) {
      row = await env.DB.prepare('SELECT account_id, public FROM crm_booking_config WHERE account_id = ?')
        .bind(accountId).first<{ account_id: string; public: string }>();
    } else {
      const n = await env.DB.prepare('SELECT count(*) AS n FROM crm_booking_config').first<{ n: number }>();
      if ((n?.n ?? 0) === 1) {
        row = await env.DB.prepare('SELECT account_id, public FROM crm_booking_config LIMIT 1')
          .first<{ account_id: string; public: string }>();
      }
    }

    if (!row) {
      return json({ success: false, notFound: true, error: 'There is no booking page at that address.', message: 'There is no booking page at that address.' });
    }
    return json({ success: true, accountId: row.account_id, config: JSON.parse(row.public || '{}') });
  }

  /* ── Visitor: which slots are already taken ── */
  if (action === 'slots') {
    const accountId = String(d.accountId ?? '').trim();
    const date = String(d.date ?? '');
    if (!accountId || !DATE_OK.test(date)) return fail('A workspace and a date are required.');
    const { results } = await env.DB.prepare(
      `SELECT slot_time AS time, data FROM crm_bookings
        WHERE account_id = ? AND slot_date = ? AND status != 'cancelled'`,
    ).bind(accountId, date).all<{ time: string; data: string }>();
    const booked = (results ?? []).map(r => {
      let duration = 30;
      try { duration = Number((JSON.parse(r.data) as { duration?: number }).duration ?? 30); } catch { /* default */ }
      return { time: r.time, duration };
    });
    return json({ success: true, booked });
  }

  /* ── Visitor: take a booking ── */
  if (action === 'create') {
    const accountId = String(d.accountId ?? '').trim();
    const slotDate = String(d.slotDate ?? '');
    const slotTime = String(d.slotTime ?? '');
    if (!accountId) return fail('A workspace is required.');
    if (!DATE_OK.test(slotDate) || !TIME_OK.test(slotTime)) return fail('Pick a date and a time.');

    /* Only a workspace that has published a booking page takes bookings. This
       took any id, anonymously and without limit — so anyone could file
       contacts into a stranger's workspace, start their automations, and, with
       a calendar connected, have Google send invitations from their account to
       any address. */
    const page = await env.DB.prepare('SELECT 1 AS n FROM crm_booking_config WHERE account_id = ?').bind(accountId).first();
    if (!page) return json({ success: false, notFound: true, error: 'There is no booking page at that address.' });
    const ip = req.headers.get('CF-Connecting-IP') ?? 'unknown';
    const limit = await rateLimit(env, { what: 'booking', who: ip, max: 8, windowSeconds: 3600 });
    if (!limit.allowed) return fail('Too many bookings from here in the last hour. Try again later.', 429);

    const guestEmail = addr(d.guestEmail);
    if (!guestEmail) return fail('Enter a valid email address so we can send the confirmation.');
    const guestName = headerSafe(d.guestName, 120);
    if (!guestName) return fail('Enter your name.');

    /* Rejected rather than double-booked. Two visitors can reach this at the
       same moment, so it is checked here and the unique slot is enforced by
       the read immediately before the write — the window is small and the
       failure is a clear message rather than two people at one appointment. */
    const taken = await env.DB.prepare(
      `SELECT 1 AS n FROM crm_bookings WHERE account_id = ? AND slot_date = ? AND slot_time = ? AND status != 'cancelled'`,
    ).bind(accountId, slotDate, slotTime).first();
    if (taken) return fail('That time was just booked — please pick another slot.');

    const id = `bk-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
    const manageKey = newToken();
    const data = {
      guestName, guestEmail,
      guestPhone: headerSafe(d.guestPhone, 40),
      notes: String(d.notes ?? '').slice(0, 2000),
      timezone: headerSafe(d.timezone, 64),
      eventTypeId: headerSafe(d.eventTypeId, 64),
    };

    await env.DB.prepare(
      'INSERT INTO crm_bookings (id, account_id, manage_key, slot_date, slot_time, status, data, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
    ).bind(id, accountId, manageKey, slotDate, slotTime, 'confirmed', JSON.stringify(data), nowIso()).run();

    /*
     * The video meeting, and the guest as a person in the CRM.
     *
     * After the booking row, never before it, and neither may fail the booking.
     * A confirmed appointment with no Meet link is a real outcome the owner can
     * fix in a click; a booking refused because Google was slow is a customer
     * who believes they have no appointment at all — and they are the one who
     * will not try again.
     */
    let meetingUrl = '';
    try {
      const meeting = await meetingForBooking(env, accountId, {
        id, slotDate, slotTime, data: JSON.stringify(data),
      });
      if (meeting.ok) meetingUrl = meeting.url ?? '';
    } catch { /* see above: the booking stands either way */ }

    try {
      const person = await upsertPerson(env, accountId, {
        email: guestEmail, name: guestName, phone: data.guestPhone,
        source: 'booking', sourceRef: id,
      });
      await recordEvent(env, accountId, {
        kind: 'appointment.booked', personId: person.id, refId: id,
        summary: `${guestName} booked ${slotDate} at ${slotTime}`,
        detail: { meetingUrl },
      });
    } catch { /* the booking is the thing that had to be saved */ }

    const mail = await bookingMail(env, accountId, new URL(req.url).origin, 'booked', {
      id, key: manageKey, slotDate, slotTime, guestName, guestEmail, notes: data.notes, meetingUrl,
    });

    /* Returned so the confirmation screen can show it rather than promising a
       link that may not exist. Empty means no calendar is connected, which the
       booking page says plainly instead of leaving a blank. */
    return json({ success: true, id, key: manageKey, meetingUrl, emailed: mail.guest });
  }

  /* ── Guest: manage their own booking, proven by the key in their link ── */
  if (action === 'get' || action === 'cancel' || action === 'reschedule') {
    const id = String(d.id ?? '');
    const key = String(d.key ?? '');
    if (!id || !key) return fail('That link is missing something — use the one in your confirmation email.');

    const row = await env.DB.prepare('SELECT * FROM crm_bookings WHERE id = ?').bind(id)
      .first<{ id: string; account_id: string; manage_key: string; slot_date: string; slot_time: string; status: string; data: string; created_at: string }>();
    if (!row || !timingSafeEqual(key, row.manage_key)) {
      return json({ success: false, error: 'Booking not found.', message: 'Booking not found.' });
    }

    if (action === 'get') {
      /* The key is what proves ownership, so it is never echoed back into a
         page that might be shared or screenshotted. */
      return json({
        success: true,
        booking: {
          id: row.id, accountId: row.account_id, slotDate: row.slot_date, slotTime: row.slot_time,
          status: row.status, createdAt: row.created_at, ...JSON.parse(row.data || '{}'),
        },
      });
    }

    let guestData: { guestName?: string; guestEmail?: string; notes?: string } = {};
    try { guestData = JSON.parse(row.data || '{}'); } catch { /* nothing to address */ }
    const mailFor = (slotDate: string, slotTime: string) => ({
      id, key, slotDate, slotTime,
      guestName: String(guestData.guestName ?? ''), guestEmail: String(guestData.guestEmail ?? ''), notes: guestData.notes,
    });

    if (action === 'cancel') {
      await env.DB.prepare("UPDATE crm_bookings SET status = 'cancelled' WHERE id = ?").bind(id).run();
      const mail = guestData.guestEmail && row.status !== 'cancelled'
        ? await bookingMail(env, row.account_id, new URL(req.url).origin, 'cancelled', mailFor(row.slot_date, row.slot_time))
        : { guest: false };
      return ok({ emailed: mail.guest });
    }

    const newDate = String(d.slotDate ?? '');
    const newTime = String(d.slotTime ?? '');
    if (!DATE_OK.test(newDate) || !TIME_OK.test(newTime)) return fail('Pick a new date and time.');
    const clash = await env.DB.prepare(
      `SELECT 1 AS n FROM crm_bookings WHERE account_id = ? AND slot_date = ? AND slot_time = ? AND status != 'cancelled' AND id != ?`,
    ).bind(row.account_id, newDate, newTime, id).first();
    if (clash) return fail('That time was just booked — please pick another slot.');
    await env.DB.prepare("UPDATE crm_bookings SET slot_date = ?, slot_time = ?, status = 'confirmed' WHERE id = ?")
      .bind(newDate, newTime, id).run();
    const mail = guestData.guestEmail
      ? await bookingMail(env, row.account_id, new URL(req.url).origin, 'rescheduled', mailFor(newDate, newTime))
      : { guest: false };
    return ok({ emailed: mail.guest });
  }

  /* ── Owner: see and manage the bookings taken ── */
  if (action === 'list' || action === 'set_status') {
    const user = await userFromToken(env.DB, d.token);
    if (!user) return fail('Sign in again — this action needs a current session.', 401, { code: 'unauthorised' });
    const accountId = String(d.accountId ?? '').trim();
    if (!accountId) return fail('A workspace is required.');
    if (!(await canAccess(env.DB, user, accountId))) return fail('That workspace is not yours to read.', 403);

    if (action === 'list') {
      const { results } = await env.DB.prepare(
        'SELECT id, slot_date, slot_time, status, data, created_at FROM crm_bookings WHERE account_id = ? ORDER BY slot_date DESC, slot_time DESC LIMIT 1000',
      ).bind(accountId).all<{ id: string; slot_date: string; slot_time: string; status: string; data: string; created_at: string }>();
      return json({
        success: true,
        bookings: (results ?? []).map(r => ({
          id: r.id, slotDate: r.slot_date, slotTime: r.slot_time, status: r.status,
          createdAt: r.created_at, ...JSON.parse(r.data || '{}'),
        })),
      });
    }

    const status = String(d.status ?? '');
    if (!['confirmed', 'cancelled', 'completed', 'no-show'].includes(status)) return fail('That is not a booking status.');
    const res = await env.DB.prepare('UPDATE crm_bookings SET status = ? WHERE id = ? AND account_id = ?')
      .bind(status, String(d.id ?? ''), accountId).run();
    return res.meta.changes ? ok() : fail('Booking not found.');
  }

  return fail(`"${action}" is not something this endpoint does.`);
}
