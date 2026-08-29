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
import { addr, body, fail, headerSafe, json, ok } from '../lib/http';
import { canAccess, nowIso, userFromToken, type Env } from '../lib/db';
import { newToken, timingSafeEqual } from '../lib/crypto';

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
    if (!canAccess(user, accountId)) return fail('That workspace is not yours to publish.', 403);

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

    await env.DB.prepare(
      `INSERT INTO crm_booking_config (account_id, slug, public, private, updated_at) VALUES (?, ?, ?, ?, ?)
       ON CONFLICT(account_id) DO UPDATE SET slug = excluded.slug, public = excluded.public,
                                             private = excluded.private, updated_at = excluded.updated_at`,
    ).bind(accountId, slug || null, JSON.stringify(pub), JSON.stringify(d.private ?? {}), nowIso()).run();
    return ok({ slug });
  }

  /* ── Visitor: read the published page ──
     Public by necessity — the person booking has no account. Only the `public`
     column is ever returned; `private` holds the SMTP and Twilio credentials
     the reminders are sent with and never leaves the server. */
  if (action === 'config') {
    const slug = String(d.slug ?? '').trim().toLowerCase();
    const accountId = String(d.accountId ?? '').trim();

    const row = slug
      ? await env.DB.prepare('SELECT account_id, public FROM crm_booking_config WHERE slug = ?').bind(slug).first<{ account_id: string; public: string }>()
      : accountId
        ? await env.DB.prepare('SELECT account_id, public FROM crm_booking_config WHERE account_id = ?').bind(accountId).first<{ account_id: string; public: string }>()
        /* No slug and no account: on a single-workspace install there is only
           one page, so serving it is the helpful answer rather than an error. */
        : await env.DB.prepare('SELECT account_id, public FROM crm_booking_config ORDER BY updated_at LIMIT 1').first<{ account_id: string; public: string }>();

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

    return json({ success: true, id, key: manageKey });
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

    if (action === 'cancel') {
      await env.DB.prepare("UPDATE crm_bookings SET status = 'cancelled' WHERE id = ?").bind(id).run();
      return ok();
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
    return ok();
  }

  /* ── Owner: see and manage the bookings taken ── */
  if (action === 'list' || action === 'set_status') {
    const user = await userFromToken(env.DB, d.token);
    if (!user) return fail('Sign in again — this action needs a current session.', 401, { code: 'unauthorised' });
    const accountId = String(d.accountId ?? '').trim();
    if (!accountId) return fail('A workspace is required.');
    if (!canAccess(user, accountId)) return fail('That workspace is not yours to read.', 403);

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
