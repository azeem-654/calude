/**
 * /api/strategy-call.php — the operator's own strategy call.
 *
 * Who may call what:
 *   visitor  config, slots, create                 — public, rate-limited
 *   guest    manage_get, manage_cancel, manage_reschedule — proven by the key in their email
 *   owner    settings_get, settings_save, list, note, cancel, reschedule, set_status
 *            — the install owner only, checked here on every call
 *
 * A customer's booking page belongs to a workspace (routes/booking.ts); this
 * belongs to the install, so a tenant — even one who forges a request — reads
 * nothing of it but what the public page shows.
 *
 * Double booking is closed in the database, not the browser: the insert is
 * one conditional statement that refuses an overlap, a unique index refuses
 * two calls at one instant, and the browser's submit id makes a retry or a
 * double click find the booking it already made instead of making another.
 */
import { addr, body, fail, json, ok } from '../lib/http';
import { nowIso, userFromToken, type Env, type SessionUser } from '../lib/db';
import { newToken, timingSafeEqual } from '../lib/crypto';
import { rateLimit } from '../lib/rateLimit';
import { deliver, fromAddressOf } from '../lib/deliver';
import { installMailbox } from './auth';
import { addDays, clockLabel, isZone, utcToWall, wallToUtc, type Busy } from '../lib/bookingTime';
import {
  cleanAnswers, cleanSettings, cleanSource, DEFAULT_SETTINGS, publicSettings, slotRefusal, visitorSlots,
  SOURCE_LABEL, STRATEGY_CALL_PATH, type StrategySettings,
} from '../lib/strategyCall';

const isOwner = (u: SessionUser | null): u is SessionUser => !!u && u.role === 'agency' && !u.accountId;

interface Row {
  id: string; key_hash: string; idem_key: string; status: string; slot_date: string; slot_time: string;
  start_ms: number; end_ms: number; duration: number; host_tz: string; visitor_tz: string;
  name: string; email: string; company: string; website: string; industry: string; phone: string;
  answers: string; meeting_type: string; source_site: string; source: string; internal_note: string;
  history: string; notify: string; reminded_at: string | null; created_at: string; updated_at: string;
}

const DATE_OK = /^\d{4}-\d{2}-\d{2}$/;
const TIME_OK = /^\d{2}:\d{2}$/;

async function sha256(s: string): Promise<string> {
  const h = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(s));
  return [...new Uint8Array(h)].map(b => b.toString(16).padStart(2, '0')).join('');
}
const parse = <T>(s: string | null | undefined, d: T): T => { try { return s ? JSON.parse(s) as T : d; } catch { return d; } };
const esc = (s: string) => s.replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]!));
const clip = (v: unknown, n: number) => String(v ?? '').replace(/\p{Cc}/gu, ' ').trim().slice(0, n);

export async function loadSettings(env: Env): Promise<StrategySettings> {
  const row = await env.DB.prepare("SELECT settings FROM crm_strategy_settings WHERE id = 'default'").first<{ settings: string }>();
  /* Re-cleaned on the way out, so a row written by an older version is read with today's rules. */
  return row ? cleanSettings(parse(row.settings, {})).settings : { ...DEFAULT_SETTINGS };
}

/** Everything confirmed on the owner dates a range can draw on, as the slot rules read it. */
async function busyBetween(env: Env, from: string, to: string, except = ''): Promise<Busy[]> {
  const { results } = await env.DB.prepare(
    "SELECT id, slot_date, slot_time, duration FROM crm_strategy_calls WHERE status = 'confirmed' AND slot_date >= ? AND slot_date <= ?",
  ).bind(from, to).all<{ id: string; slot_date: string; slot_time: string; duration: number }>();
  return (results ?? []).filter(r => r.id !== except).map(r => ({ date: r.slot_date, time: r.slot_time, duration: r.duration }));
}

/** The address the owner hears on: the one they set, else the install owner's own. */
async function ownerAddress(env: Env, s: StrategySettings): Promise<string | null> {
  if (s.notifyEmail) return addr(s.notifyEmail);
  const r = await env.DB.prepare("SELECT email FROM crm_users WHERE account_id IS NULL AND role = 'agency' LIMIT 1").first<{ email: string }>();
  return r ? addr(r.email) : null;
}

/** "Tuesday, 3 November 2026, 10:00 am (America/New_York)". */
function whenWords(ms: number, tz: string): string {
  const w = utcToWall(ms, tz);
  const day = new Date(`${w.date}T12:00:00Z`).toLocaleDateString('en-US', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' });
  return `${day}, ${clockLabel(w.time)} (${tz})`;
}

function meetingWords(s: StrategySettings): string {
  if (s.meetingType === 'phone') return s.meetingDetails || 'We will call you on the number you gave.';
  if (s.meetingType === 'in_person') return s.meetingDetails || 'The address will follow by email.';
  return s.meetingDetails ? `Join: ${s.meetingDetails}` : 'The video link will be sent to you before the call.';
}

type Sent = 'sent' | 'not_configured' | 'off' | string;

/**
 * The emails a booking promises, from the install's own validated mailbox and
 * through the one door. A send that fails is recorded as failed with the
 * reason; no mailbox is "not_configured" — never "sent".
 */
async function mailFor(env: Env, origin: string, s: StrategySettings, r: Row, what: 'booked' | 'moved' | 'cancelled' | 'reminder', key = ''): Promise<{ guest: Sent; owner: Sent }> {
  const result: { guest: Sent; owner: Sent } = { guest: 'off', owner: 'off' };
  const wantGuest = what === 'reminder' ? s.reminderHours > 0 : s.confirmEmail;
  const wantOwner = what !== 'reminder' && s.notifyOnBook;
  if (!wantGuest && !wantOwner) return result;
  const mb = await installMailbox(env).catch(() => null);
  if (!mb) {
    if (wantGuest) result.guest = 'not_configured';
    if (wantOwner) result.owner = 'not_configured';
    return result;
  }
  const fromEmail = fromAddressOf(mb);
  const theirs = r.visitor_tz && r.visitor_tz !== r.host_tz ? whenWords(r.start_ms, r.visitor_tz) : '';
  const hostWhen = whenWords(r.start_ms, r.host_tz);
  const manage = key ? `${origin}${STRATEGY_CALL_PATH}?manage=${encodeURIComponent(r.id)}.${encodeURIComponent(key)}` : '';
  const first = r.name.split(/\s+/)[0] || 'there';
  if (wantGuest) {
    const lead = what === 'cancelled' ? `Your ${esc(s.title)} is cancelled.`
      : what === 'moved' ? `Your ${esc(s.title)} has moved to <strong>${esc(theirs || hostWhen)}</strong>.`
        : what === 'reminder' ? `A reminder: your ${esc(s.title)} is on <strong>${esc(theirs || hostWhen)}</strong>.`
          : `You're booked: <strong>${esc(s.title)}</strong> on <strong>${esc(theirs || hostWhen)}</strong>.`;
    const html = `<div style="font-family:system-ui,-apple-system,Segoe UI,sans-serif;max-width:520px;color:#17191c;line-height:1.6">`
      + `<p>Hi ${esc(first)},</p><p>${lead}</p>`
      + (what !== 'cancelled' ? `<p>${esc(meetingWords(s))}</p>` : '')
      + (what !== 'cancelled' && manage ? `<p><a href="${esc(manage)}" style="display:inline-block;padding:11px 22px;background:#17191c;color:#c8f24d;border-radius:999px;text-decoration:none;font-weight:700">Reschedule or cancel</a></p>` : '')
      + (what !== 'cancelled' && !manage ? '<p>To change it, use the link in your confirmation email or reply to this one.</p>' : '')
      + '</div>';
    const subject = what === 'cancelled' ? `Cancelled: ${s.title}` : what === 'moved' ? `Moved: ${s.title}` : what === 'reminder' ? `Reminder: ${s.title}` : `Confirmed: ${s.title}`;
    const d = await deliver(mb, { fromName: s.hostName || mb.from.name || 'Protected Central', fromEmail, to: r.email, subject, html, replyTo: (await ownerAddress(env, s)) ?? undefined })
      .catch(e => ({ ok: false, error: String((e as Error)?.message ?? e) }));
    result.guest = d.ok ? 'sent' : `failed: ${String(d.error).slice(0, 160)}`;
  }
  if (wantOwner) {
    const to = await ownerAddress(env, s);
    if (!to) result.owner = 'not_configured';
    else {
      const verb = what === 'cancelled' ? 'cancelled' : what === 'moved' ? 'moved' : 'booked';
      const src = parse<{ utm?: Record<string, string> }>(r.source, {});
      const html = `<div style="font-family:system-ui,sans-serif;line-height:1.6;color:#17191c">`
        + `<p><strong>${esc(r.name)}</strong> (${esc(r.email)}${r.company ? `, ${esc(r.company)}` : ''}) ${verb} a ${esc(s.title)} — ${esc(hostWhen)}.</p>`
        + `<p>From: ${esc(SOURCE_LABEL[r.source_site as keyof typeof SOURCE_LABEL] ?? r.source_site)}${src.utm?.campaign ? ` · campaign ${esc(src.utm.campaign)}` : ''}</p>`
        + `<p>Details and answers are in Settings → Platform services → Strategy Call Booking.</p></div>`;
      const d = await deliver(mb, { fromName: 'Strategy calls', fromEmail, to, subject: `${r.name} ${verb}: ${s.title}`, html, replyTo: r.email })
        .catch(e => ({ ok: false, error: String((e as Error)?.message ?? e) }));
      result.owner = d.ok ? 'sent' : `failed: ${String(d.error).slice(0, 160)}`;
    }
  }
  return result;
}

/** What the guest's own link may see: their booking, never the owner's note or the source. */
function guestView(r: Row, s: StrategySettings) {
  return {
    id: r.id, status: r.status, startsAt: new Date(r.start_ms).toISOString(), duration: r.duration,
    hostTimezone: r.host_tz, visitorTimezone: r.visitor_tz, ownerDate: r.slot_date, ownerTime: r.slot_time,
    name: r.name, email: r.email, title: s.title, meeting: r.status === 'confirmed' ? meetingWords(s) : '',
  };
}

function ownerView(r: Row) {
  return {
    id: r.id, status: r.status, startsAt: new Date(r.start_ms).toISOString(), duration: r.duration,
    ownerDate: r.slot_date, ownerTime: r.slot_time, hostTimezone: r.host_tz, visitorTimezone: r.visitor_tz,
    name: r.name, email: r.email, company: r.company, website: r.website, industry: r.industry, phone: r.phone,
    answers: parse(r.answers, {}), meetingType: r.meeting_type, sourceSite: r.source_site, source: parse(r.source, {}),
    note: r.internal_note, history: parse(r.history, []), notify: parse(r.notify, {}), createdAt: r.created_at, updatedAt: r.updated_at,
  };
}

/**
 * Move a booking, guarded the same way as a new one: the slot rules with this
 * booking's own time not counted, then one UPDATE that refuses an overlap with
 * any other confirmed call.
 */
async function moveTo(env: Env, s: StrategySettings, r: Row, ownerDate: string, ownerTime: string, by: string): Promise<string | null> {
  if (!DATE_OK.test(ownerDate) || !TIME_OK.test(ownerTime)) return 'Pick a new date and time.';
  const busy = await busyBetween(env, addDays(ownerDate, -1), addDays(ownerDate, 1), r.id);
  const problem = slotRefusal(ownerDate, ownerTime, s, r.duration, busy, Date.now());
  if (problem) return problem;
  const start = wallToUtc(ownerDate, ownerTime, s.timezone)!;
  const end = start + r.duration * 60000;
  const history = [...parse<unknown[]>(r.history, []), { at: nowIso(), by, what: 'rescheduled', from: new Date(r.start_ms).toISOString(), to: new Date(start).toISOString() }];
  try {
    const res = await env.DB.prepare(
      `UPDATE crm_strategy_calls SET slot_date = ?, slot_time = ?, start_ms = ?, end_ms = ?, host_tz = ?, status = 'confirmed',
              reminded_at = NULL, history = ?, updated_at = ?
        WHERE id = ? AND NOT EXISTS (
          SELECT 1 FROM crm_strategy_calls o WHERE o.status = 'confirmed' AND o.id != ? AND o.start_ms < ? AND o.end_ms > ?)`,
    ).bind(ownerDate, ownerTime, start, end, s.timezone, JSON.stringify(history), nowIso(), r.id, r.id, end + s.bufferAfter * 60000, start - s.bufferBefore * 60000).run();
    if (!res.meta.changes) return 'That time was just booked — please pick another.';
  } catch {
    return 'That time was just booked — please pick another.';
  }
  return null;
}

export async function handleStrategyCall(req: Request, env: Env): Promise<Response> {
  const d = await body<Record<string, unknown>>(req);
  const action = String(d.action ?? '');
  const origin = new URL(req.url).origin;

  /* ── Visitor ── */
  if (action === 'config') {
    const s = await loadSettings(env);
    const mb = s.enabled && s.confirmEmail ? await installMailbox(env).catch(() => null) : null;
    /* The page promises a confirmation email only when one can actually go. */
    return json({ success: true, settings: publicSettings(s), delivery: { confirms: !!mb } });
  }

  if (action === 'slots') {
    const s = await loadSettings(env);
    if (!s.enabled) return json({ success: false, closed: true, error: 'Bookings are not open at the moment.' });
    const from = String(d.from ?? ''), to = String(d.to ?? '');
    const tz = isZone(d.timezone) ? String(d.timezone) : s.timezone;
    const duration = s.durations.includes(Number(d.duration)) ? Number(d.duration) : s.defaultDuration;
    if (!DATE_OK.test(from) || !DATE_OK.test(to) || to < from) return fail('Ask for a range of dates.');
    if ((Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / 86_400_000 > 42) return fail('Ask for at most six weeks at a time.');
    const busy = await busyBetween(env, addDays(from, -1), addDays(to, 1));
    const now = Date.now();
    const days: Record<string, { utc: number; ownerDate: string; ownerTime: string; visitorTime: string }[]> = {};
    for (let day = from; day <= to; day = addDays(day, 1)) {
      const list = visitorSlots(day, tz, s, duration, busy, now);
      if (list.length) days[day] = list;
    }
    return json({ success: true, timezone: tz, duration, days });
  }

  if (action === 'create') {
    const s = await loadSettings(env);
    if (!s.enabled) return json({ success: false, closed: true, error: 'Bookings are not open at the moment.' });
    const requestId = clip(d.requestId, 80);
    if (!/^[\w-]{16,80}$/.test(requestId)) return fail('Something went wrong with the form — reload the page and try again.');

    /* A retry of a submit that already landed: answer with that booking, not a second one. */
    const prior = await env.DB.prepare('SELECT * FROM crm_strategy_calls WHERE idem_key = ?').bind(requestId).first<Row>();
    if (prior) return json({ success: true, replayed: true, id: prior.id, startsAt: new Date(prior.start_ms).toISOString(), hostTimezone: prior.host_tz, notify: parse(prior.notify, {}) });

    const ip = req.headers.get('CF-Connecting-IP') ?? 'unknown';
    const limit = await rateLimit(env, { what: 'strategy-call', who: ip, max: 6, windowSeconds: 3600 });
    if (!limit.allowed) return fail('Too many bookings from here in the last hour. Try again later.', 429);

    const name = clip(d.name, 120);
    if (!name) return fail('Enter your name.', 200, { field: 'strategy.name' });
    const email = addr(d.email);
    if (!email) return fail('Enter a valid email address so we can confirm the call.', 200, { field: 'strategy.email' });
    const company = clip(d.company, 160);
    if (!company) return fail('Enter your business name.', 200, { field: 'strategy.company' });
    let website = clip(d.website, 200);
    if (website && !/^https?:\/\//i.test(website)) website = `https://${website}`;
    if (website) { try { const u = new URL(website); website = u.origin + (u.pathname === '/' ? '' : u.pathname); } catch { return fail('That website address does not look right.', 200, { field: 'strategy.website' }); } }
    const industry = clip(d.industry, 80);
    const phone = clip(d.phone, 40).replace(/[^\d+()\-. ]/g, '');
    const { answers, error } = cleanAnswers(s.questions, d.answers);
    if (error) return fail(error.message, 200, { field: error.field });
    const duration = s.durations.includes(Number(d.duration)) ? Number(d.duration) : s.defaultDuration;
    const ownerDate = String(d.ownerDate ?? ''), ownerTime = String(d.ownerTime ?? '');
    const visitorTz = isZone(d.timezone) ? String(d.timezone) : '';
    const source = cleanSource(d.source);

    /* The rules again, immediately before the write — the page may be an hour old. */
    const busy = await busyBetween(env, addDays(ownerDate, -1), addDays(ownerDate, 1));
    const problem = DATE_OK.test(ownerDate) ? slotRefusal(ownerDate, ownerTime, s, duration, busy, Date.now()) : 'Pick a date and a time.';
    if (problem) return fail(problem, 200, { code: 'slot' });

    const start = wallToUtc(ownerDate, ownerTime, s.timezone)!;
    const end = start + duration * 60000;
    const id = `sc_${newToken().slice(0, 24)}`;
    const key = newToken();
    const now = nowIso();
    const frozenAnswers = { ...answers, _asked: Object.fromEntries(s.questions.map(q => [q.id, q.label])) };
    const history = [{ at: now, by: 'visitor', what: 'booked' }];
    try {
      /* One statement: it inserts only if no confirmed call overlaps this one
         with its buffers, and only while the day is under its limit. SQLite
         runs it whole, so two visitors racing for one slot cannot both win. */
      const res = await env.DB.prepare(
        `INSERT INTO crm_strategy_calls (id, key_hash, idem_key, status, slot_date, slot_time, start_ms, end_ms, duration, host_tz, visitor_tz,
            name, email, company, website, industry, phone, answers, meeting_type, source_site, source, history, notify, created_at, updated_at)
         SELECT ?, ?, ?, 'confirmed', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, '{}', ?, ?
          WHERE NOT EXISTS (SELECT 1 FROM crm_strategy_calls WHERE status = 'confirmed' AND start_ms < ? AND end_ms > ?)
            AND (? = 0 OR (SELECT COUNT(*) FROM crm_strategy_calls WHERE status = 'confirmed' AND slot_date = ?) < ?)`,
      ).bind(
        id, await sha256(key), requestId, ownerDate, ownerTime, start, end, duration, s.timezone, visitorTz,
        name, email, company, website, industry, phone, JSON.stringify(frozenAnswers), s.meetingType, source.site,
        JSON.stringify({ utm: source.utm, clickIds: source.clickIds, referrer: source.referrer }), JSON.stringify(history), now, now,
        end + s.bufferAfter * 60000, start - s.bufferBefore * 60000,
        s.dailyLimit, ownerDate, s.dailyLimit,
      ).run();
      if (!res.meta.changes) return fail('That time was just booked — please pick another.', 200, { code: 'slot' });
    } catch (e) {
      /* The same submit id landing twice at once: the other one won, answer with it. */
      const again = await env.DB.prepare('SELECT * FROM crm_strategy_calls WHERE idem_key = ?').bind(requestId).first<Row>();
      if (again) return json({ success: true, replayed: true, id: again.id, startsAt: new Date(again.start_ms).toISOString(), hostTimezone: again.host_tz, notify: {} });
      if (/UNIQUE/i.test(String((e as Error)?.message))) return fail('That time was just booked — please pick another.', 200, { code: 'slot' });
      throw e;
    }

    const row = (await env.DB.prepare('SELECT * FROM crm_strategy_calls WHERE id = ?').bind(id).first<Row>())!;
    const notify = await mailFor(env, origin, s, row, 'booked', key);
    await env.DB.prepare('UPDATE crm_strategy_calls SET notify = ? WHERE id = ?').bind(JSON.stringify(notify), id).run();
    return json({ success: true, id, key, startsAt: new Date(start).toISOString(), hostTimezone: s.timezone, notify, meeting: meetingWords(s) });
  }

  /* ── Guest, by the key in their email ── */
  if (action === 'manage_get' || action === 'manage_cancel' || action === 'manage_reschedule') {
    const id = clip(d.id, 60), key = clip(d.key, 200);
    const row = id && key ? await env.DB.prepare('SELECT * FROM crm_strategy_calls WHERE id = ?').bind(id).first<Row>() : null;
    /* Same answer for a wrong id and a wrong key: the link proves nothing about which part was wrong. */
    if (!row || !timingSafeEqual(await sha256(key), row.key_hash)) return json({ success: false, error: 'That link does not match a booking. Use the one in your confirmation email.' });
    const s = await loadSettings(env);
    if (action === 'manage_get') return json({ success: true, booking: guestView(row, s) });
    if (row.status !== 'confirmed') return fail('This call is no longer booked, so it cannot be changed.');
    if (action === 'manage_cancel') {
      const history = [...parse<unknown[]>(row.history, []), { at: nowIso(), by: 'guest', what: 'cancelled' }];
      await env.DB.prepare("UPDATE crm_strategy_calls SET status = 'cancelled', history = ?, updated_at = ? WHERE id = ? AND status = 'confirmed'")
        .bind(JSON.stringify(history), nowIso(), id).run();
      const notify = await mailFor(env, origin, s, row, 'cancelled');
      return ok({ notify });
    }
    if (!s.enabled) return fail('Bookings are not open at the moment, so the call cannot be moved. You can still cancel it.');
    const problem = await moveTo(env, s, row, String(d.ownerDate ?? ''), String(d.ownerTime ?? ''), 'guest');
    if (problem) return fail(problem, 200, { code: 'slot' });
    const moved = (await env.DB.prepare('SELECT * FROM crm_strategy_calls WHERE id = ?').bind(id).first<Row>())!;
    const notify = await mailFor(env, origin, s, moved, 'moved', key);
    return json({ success: true, booking: guestView(moved, s), notify });
  }

  /* ── Owner ── */
  const user = await userFromToken(env.DB, d.token as string | undefined);
  if (!user) return fail('Sign in again — this needs a current session.', 401, { code: 'unauthorised' });
  if (!isOwner(user)) return fail('Only the owner of this installation can manage strategy calls.', 403, { code: 'not_owner' });

  if (action === 'settings_get') {
    const s = await loadSettings(env);
    const mb = await installMailbox(env).catch(() => null);
    return json({
      success: true, settings: s, publicPath: STRATEGY_CALL_PATH,
      integrations: {
        email: mb ? { state: 'connected', from: fromAddressOf(mb) } : { state: 'not_configured', from: '' },
        /* Said plainly, because a host who believes these exist waits for an event or a link that never comes. */
        calendar: { state: 'not_connected', detail: 'Bookings are kept here only. Nothing is added to or read from an external calendar, so time you are busy elsewhere must be blocked under "Closed dates" or "Special hours".' },
        video: { state: s.meetingType === 'video_link' && s.meetingDetails ? 'fixed_link' : 'none', detail: 'No video service is connected. A room link you paste is sent as it is; otherwise send each guest a link yourself.' },
      },
    });
  }

  if (action === 'settings_save') {
    const { settings, errors } = cleanSettings(d.settings);
    if (errors.length) return fail(errors[0].message, 200, { field: errors[0].field, errors });
    await env.DB.prepare(
      `INSERT INTO crm_strategy_settings (id, settings, updated_by, updated_at) VALUES ('default', ?, ?, ?)
       ON CONFLICT(id) DO UPDATE SET settings = excluded.settings, updated_by = excluded.updated_by, updated_at = excluded.updated_at`,
    ).bind(JSON.stringify(settings), user.email, nowIso()).run();
    return json({ success: true, settings });
  }

  if (action === 'list') {
    const view = String(d.view ?? 'upcoming');
    const now = Date.now();
    const where = view === 'upcoming' ? "status = 'confirmed' AND end_ms >= ?"
      : view === 'past' ? "status IN ('confirmed', 'completed', 'no_show') AND end_ms < ?"
        : view === 'cancelled' ? "status = 'cancelled' AND ? >= 0" : '? >= 0';
    const order = view === 'upcoming' ? 'start_ms ASC' : 'start_ms DESC';
    const { results } = await env.DB.prepare(`SELECT * FROM crm_strategy_calls WHERE ${where} ORDER BY ${order} LIMIT 300`).bind(now).all<Row>();
    return json({ success: true, bookings: (results ?? []).map(ownerView) });
  }

  const id = clip(d.id, 60);
  const row = id ? await env.DB.prepare('SELECT * FROM crm_strategy_calls WHERE id = ?').bind(id).first<Row>() : null;
  if (!row) return fail('That booking was not found.');
  const s = await loadSettings(env);
  const log = (what: string, extra: Record<string, unknown> = {}) => JSON.stringify([...parse<unknown[]>(row.history, []), { at: nowIso(), by: user.email, what, ...extra }]);

  if (action === 'note') {
    await env.DB.prepare('UPDATE crm_strategy_calls SET internal_note = ?, updated_at = ? WHERE id = ?').bind(clip(d.note, 4000), nowIso(), id).run();
    return ok();
  }
  if (action === 'cancel') {
    if (row.status !== 'confirmed') return fail('Only a booked call can be cancelled.');
    await env.DB.prepare("UPDATE crm_strategy_calls SET status = 'cancelled', history = ?, updated_at = ? WHERE id = ?").bind(log('cancelled'), nowIso(), id).run();
    const notify = d.notifyGuest === false ? { guest: 'off', owner: 'off' } : await mailFor(env, origin, { ...s, notifyOnBook: false }, row, 'cancelled');
    return ok({ notify });
  }
  if (action === 'reschedule') {
    if (row.status !== 'confirmed') return fail('Only a booked call can be moved.');
    const problem = await moveTo(env, s, row, String(d.ownerDate ?? ''), String(d.ownerTime ?? ''), user.email);
    if (problem) return fail(problem, 200, { code: 'slot' });
    const moved = (await env.DB.prepare('SELECT * FROM crm_strategy_calls WHERE id = ?').bind(id).first<Row>())!;
    /* The guest's key is not stored, so the owner's notice of a move carries no manage link; it says to reply instead. */
    const notify = await mailFor(env, origin, { ...s, notifyOnBook: false }, moved, 'moved');
    return json({ success: true, booking: ownerView(moved), notify });
  }
  if (action === 'set_status') {
    const status = String(d.status ?? '');
    if (!['completed', 'no_show', 'confirmed'].includes(status)) return fail('That is not a status a call can have.');
    if (row.status === 'cancelled') return fail('A cancelled call stays cancelled.');
    await env.DB.prepare('UPDATE crm_strategy_calls SET status = ?, history = ?, updated_at = ? WHERE id = ?').bind(status, log(status), nowIso(), id).run();
    return ok();
  }

  return fail(`"${action}" is not something this endpoint does.`);
}

/**
 * The cron's pass: one reminder per call, `reminderHours` before it, from the
 * install mailbox. Skipped — and left unmarked, so it is tried next time — when
 * no mailbox can send; a failed send is marked with its reason and not retried,
 * so a broken address is not written to every five minutes.
 */
export async function strategyReminders(env: Env): Promise<number> {
  const s = await loadSettings(env);
  if (!s.enabled || s.reminderHours <= 0) return 0;
  const now = Date.now();
  const { results } = await env.DB.prepare(
    "SELECT * FROM crm_strategy_calls WHERE status = 'confirmed' AND reminded_at IS NULL AND start_ms > ? AND start_ms <= ? LIMIT 25",
  ).bind(now, now + s.reminderHours * 3_600_000).all<Row>();
  if (!(results ?? []).length) return 0;
  if (!(await installMailbox(env).catch(() => null))) return 0;
  let sent = 0;
  for (const r of results ?? []) {
    /* Booked inside the reminder window: the confirmation was the reminder. */
    if (Date.parse(r.created_at) > r.start_ms - s.reminderHours * 3_600_000) {
      await env.DB.prepare('UPDATE crm_strategy_calls SET reminded_at = ? WHERE id = ?').bind(nowIso(), r.id).run();
      continue;
    }
    const n = await mailFor(env, env.APP_ORIGIN || '', s, r, 'reminder');
    const notify = { ...parse<Record<string, string>>(r.notify, {}), reminder: n.guest };
    await env.DB.prepare('UPDATE crm_strategy_calls SET reminded_at = ?, notify = ? WHERE id = ?').bind(nowIso(), JSON.stringify(notify), r.id).run();
    if (n.guest === 'sent') sent++;
  }
  return sent;
}
