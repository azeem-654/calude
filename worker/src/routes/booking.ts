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
import { clockLabel, isZone, slotProblem, slugProblem, utcToWall, videoEmbedOf, wallToUtc, type Busy, type SlotRules } from '../lib/bookingTime';
import { ownMediaUrl } from './bookingMedia';
import {
  autofillPrompt, cleanAutofill, cleanHex, cleanLines, cleanLogoTone, cleanRatio, cleanTestimonial, cleanTheme, clipText, helpLink,
  pageFacts, plainFill, pointsOf, MAX_DISCUSS, MAX_TAGS,
  type AutofillText, type PhotoCandidate,
} from '../lib/bookingContent';
import { adoptSiteTestOrigin, fetchPage, readable } from '../lib/readSite';
import { fetchImage, logoFromPage } from '../lib/brandLogo';
import { aiBudget, askGeminiParts, loadAiKey, type AiPart } from '../lib/ai';

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
  from?: string;
  to?: string;
  url?: string;
  business?: string;
}

/* A photo fetched for the editor to shrink: larger than a logo, because a
   site's pictures are full-size, but still read to a cap. */
const PHOTO_FETCH_CAP = 3_000_000;
const GEMINI_IMAGE = /^data:(image\/(?:png|jpeg|webp|gif));base64,(.+)$/;

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
 * The same slot on the guest's own clock — "8:00 pm Tuesday 13 October in
 * Asia/Bangkok" — when they booked from another zone. The page showed them
 * their own time; an email naming only the owner's would read as a different
 * appointment. Empty when the zones agree or either is unknown.
 */
function guestWords(date: string, time: string, ownerTz: string, guestTz: string): string {
  if (!isZone(ownerTz) || !isZone(guestTz) || ownerTz === guestTz) return '';
  const at = wallToUtc(date, time, ownerTz);
  if (at === null) return '';
  const w = utcToWall(at, guestTz);
  if (w.date === date && w.time === time) return '';
  const day = new Date(at).toLocaleDateString('en-GB', { timeZone: guestTz, weekday: 'long', day: 'numeric', month: 'long' });
  return `${clockLabel(w.time)} ${day} in ${guestTz.replace(/_/g, ' ')}`;
}

/** The published page's availability rules, for the meeting type booked. */
function rulesOf(pub: Record<string, unknown>, eventTypeId?: string): SlotRules {
  const types = Array.isArray(pub.eventTypes) ? pub.eventTypes as { id?: string; duration?: number }[] : [];
  const et = eventTypeId ? types.find(t => t && t.id === eventTypeId) : types.length === 1 ? types[0] : undefined;
  const num = (v: unknown, d: number) => (Number.isFinite(Number(v)) ? Number(v) : d);
  return {
    timezone: isZone(pub.timezone) ? pub.timezone : 'UTC',
    weekly: (pub.weekly && typeof pub.weekly === 'object' ? pub.weekly : {}) as SlotRules['weekly'],
    duration: num(et?.duration, num(pub.duration, 30)),
    bufferBefore: num(pub.bufferBefore, 0),
    bufferAfter: num(pub.bufferAfter, 0),
    dailyLimit: num(pub.dailyLimit, 0),
    minNoticeMin: num(pub.minNoticeMin, 0),
    windowDays: num(pub.windowDays, 365),
  };
}

/** Everything already booked on an owner date, as intervals. */
async function busyOn(env: Env, accountId: string, date: string, defaultDuration: number, exceptId = ''): Promise<Busy[]> {
  const { results } = await env.DB.prepare(
    `SELECT id, slot_time AS time, data FROM crm_bookings
      WHERE account_id = ? AND slot_date = ? AND status != 'cancelled' AND id != ?`,
  ).bind(accountId, date, exceptId).all<{ id: string; time: string; data: string }>();
  return (results ?? []).map(r => {
    let duration = defaultDuration;
    try { duration = Number((JSON.parse(r.data) as { duration?: number }).duration) || defaultDuration; } catch { /* default */ }
    return { date, time: r.time, duration };
  });
}

const clip = (v: unknown, n: number) => String(v ?? '').replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/g, '').trim().slice(0, n);

/**
 * A picture address the page may show: one of this workspace's own uploads
 * (checked by the caller), an https/http link, or an inline PNG/JPEG/GIF/WebP.
 * Anything else — `javascript:`, an SVG data URL — is dropped.
 */
function pictureUrl(v: unknown): string {
  const s = String(v ?? '').trim();
  if (!s) return '';
  if (/^data:image\/(png|jpeg|gif|webp);base64,[a-z0-9+/=\s]+$/i.test(s)) return s.length <= 700_000 ? s : '';
  try { const u = new URL(s); return (u.protocol === 'https:' || u.protocol === 'http:') && s.length <= 2000 ? s : ''; } catch { return ''; }
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
  b: { id: string; key: string; slotDate: string; slotTime: string; guestName: string; guestEmail: string; notes?: string; meetingUrl?: string; guestTz?: string },
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
    const theirs = guestWords(b.slotDate, b.slotTime, tz, b.guestTz ?? '');
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
        + (what !== 'cancelled' && theirs ? `<p>That is <strong>${esc(theirs)}</strong>, your time.</p>` : '')
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

    const pub = { ...((d.public ?? {}) as Record<string, unknown>) };
    const slug = String(pub.slug ?? '').trim().toLowerCase();
    if (slug && !SLUG_OK.test(slug)) {
      return fail('A booking link can use lowercase letters, numbers and hyphens only.', 200, { field: 'booking.slug' });
    }
    /* The stricter rule (three characters, no hyphen at either end) is for a
       new address only: a page already live under an older, looser one keeps
       working rather than being refused on its next save. */
    const current = await env.DB.prepare('SELECT slug FROM crm_booking_config WHERE account_id = ?')
      .bind(accountId).first<{ slug: string | null }>();
    if (slug && slug !== (current?.slug ?? '')) {
      const why = slugProblem(slug);
      if (why) return fail(why, 200, { field: 'booking.slug' });
    }

    /* A slug is how a visitor finds one workspace rather than another, so two
       accounts cannot hold the same one. */
    if (slug) {
      const clash = await env.DB.prepare('SELECT account_id FROM crm_booking_config WHERE slug = ? AND account_id != ?')
        .bind(slug, accountId).first<{ account_id: string }>();
      if (clash) return fail(`The link "${slug}" is already taken by another workspace. Choose a different one.`, 200, { field: 'booking.slug' });
    }

    /* The owner's zone is what every stored booking time means. A name Intl
       does not know would quietly become UTC and move every slot. */
    if (pub.timezone !== undefined && pub.timezone !== '' && !isZone(pub.timezone)) {
      return fail(`"${clip(pub.timezone, 64)}" is not a time zone this page can use. Pick one from the list.`, 200, { field: 'booking.timezone' });
    }

    /* What a stranger's browser will render, cleaned here rather than trusted
       to the page: text capped, pictures only from places a picture may come
       from, a video only as a player address this code builds, and an
       uploaded file only if it is this workspace's own. */
    pub.slug = slug;
    pub.title = clip(pub.title, 120);
    pub.description = clip(pub.description, 1500);
    pub.hostName = clip(pub.hostName, 80);
    pub.businessName = clip(pub.businessName, 120);
    /* Points carry an icon from a fixed list; a page from an older editor
       sends plain strings in `bullets`, which become ticks. `bullets` is kept
       as the points' lines for anything that still reads it. */
    const points = pointsOf(pub.points, pub.bullets);
    pub.points = points;
    pub.bullets = points.map(p => p.title);
    pub.pointsTitle = clip(pub.pointsTitle, 80);
    pub.discuss = cleanLines(pub.discuss, MAX_DISCUSS, 100);
    pub.tags = cleanLines(pub.tags, MAX_TAGS, 28);
    pub.tagline = clip(pub.tagline, 120);
    pub.hostRole = clip(pub.hostRole, 60);
    pub.accent = cleanHex(pub.accent);
    /* The look: a theme the page knows ('' keeps the look pages had before
       themes), and what the logo is like — measured in the owner's browser,
       only ever choosing whether a plate goes behind it. */
    pub.theme = cleanTheme(pub.theme);
    pub.logoTone = cleanLogoTone(pub.logoTone);
    pub.logoRatio = cleanRatio(pub.logoRatio);
    /* "Need help?" is drawn only with somewhere real to go. */
    pub.help = helpLink(pub.help) ? clip(pub.help, 300) : '';
    /* A testimonial is the owner's own customer's words, typed by the owner:
       kept only whole (a quote and a name), its photo only if it is this
       workspace's own upload. */
    const quote = cleanTestimonial(pub.testimonial);
    pub.testimonial = quote ? { ...quote, photoUrl: await ownMediaUrl(env, accountId, 'testimonial', quote.photoUrl) } : null;
    pub.imageUrl = pictureUrl(pub.imageUrl);
    pub.photoUrl = await ownMediaUrl(env, accountId, 'photo', pub.photoUrl);
    pub.logoUrl = await ownMediaUrl(env, accountId, 'logo', pub.logoUrl);
    pub.videoFileUrl = await ownMediaUrl(env, accountId, 'video', pub.videoFileUrl);
    pub.videoUrl = videoEmbedOf(pub.videoUrl) ? clip(pub.videoUrl, 400) : '';

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

  /* ── Owner: fill the page in from the business's website ──
     Read with the same fence as every other site read (lib/readSite.ts):
     every hop checked, the body capped, no private addresses. What the site
     states is read without AI (lib/bookingContent.ts `pageFacts`); the AI,
     when there is one, proposes the words — and every field it returns is
     checked before it leaves here. Nothing is saved: the editor shows it,
     and the owner keeps or changes it. Pictures come back as data for the
     editor to shrink and upload through /api/booking-media.php, where their
     bytes are checked like any upload — so the page never shows an image
     from somebody else's server. */
  if (action === 'autofill') {
    const user = await userFromToken(env.DB, d.token);
    if (!user) return fail('Sign in again — this action needs a current session.', 401, { code: 'unauthorised' });
    const accountId = String(d.accountId ?? '').trim();
    if (!accountId) return fail('A workspace is required.');
    if (!(await canAccess(env.DB, user, accountId))) return fail('That workspace is not yours to change.', 403);
    const limit = await rateLimit(env, { what: 'booking-fill', who: accountId, max: 20, windowSeconds: 3600 });
    if (!limit.allowed) return fail('That is a lot of website reads in an hour — try again later, or fill the page in by hand.', 429, { field: 'booking.website' });

    adoptSiteTestOrigin(env);
    const raw = clip(d.url, 400);
    const target = /^https?:\/\//i.test(raw) ? raw : raw ? `https://${raw}` : '';
    if (!target) return fail('Give your website address first.', 200, { field: 'booking.website' });
    const page = await fetchPage(target);
    if (!page.ok) return fail(page.error, 200, { field: 'booking.website' });

    const facts = pageFacts(page.html, page.url);
    const { text } = readable(page.html);
    const words = text.split(/\s+/).filter(Boolean).length;
    const notes: string[] = [];

    /* The logo, as the wizard finds it. */
    const logo = await logoFromPage(page.html, page.url).catch(() => null);
    if (!logo?.ok) notes.push('No logo is marked on the site — upload yours.');

    /* A photo: the first candidate that loads. One the site labels as a
       person is used as it is; the link-preview picture only if the AI,
       shown it, says it is a person. */
    let photo: { dataUrl: string; from: string; why: string; marked: boolean } | null = null;
    for (const c of facts.photos.slice(0, 3) as PhotoCandidate[]) {
      const img = await fetchImage(c.url, PHOTO_FETCH_CAP).catch(() => null);
      if (img?.ok && !/^data:image\/(svg|x-icon)/.test(img.dataUrl)) { photo = { dataUrl: img.dataUrl, from: img.url, why: c.why, marked: c.marked }; break; }
    }

    /* The AI's part. Each reason it was not used is said by name. */
    let ai: { used: boolean; why: string } = { used: false, why: '' };
    let fill: Partial<AutofillText> = {};
    let photoIsPerson: boolean | null = null;
    let photoWhat = '';
    const business = clip(d.business, 120);
    if (words < 40) {
      ai.why = 'There are almost no words on that page (it is probably built in the browser), so there was nothing for the AI to read.';
    } else {
      const over = await aiBudget(env, accountId);
      const key = over ? null : await loadAiKey(env, accountId);
      if (over) ai.why = over;
      else if (!key) ai.why = 'No AI is available on this install, so only what the site states directly was filled in.';
      else {
        const inline = photo ? GEMINI_IMAGE.exec(photo.dataUrl) : null;
        const parts: AiPart[] = [{ text: autofillPrompt({ url: page.url, title: facts.title, siteName: facts.siteName, text: text.slice(0, 10_000), business, withPhoto: !!inline }) }];
        if (inline) parts.push({ inlineData: { mimeType: inline[1], data: inline[2] } });
        const r = await askGeminiParts(key, parts, 0.3, { timeoutMs: 30_000 });
        let parsed: Record<string, unknown> | null = null;
        if (r.ok) { try { parsed = JSON.parse(r.text) as Record<string, unknown>; } catch { parsed = null; } }
        if (!parsed) ai.why = r.ok ? 'The AI answered with something that could not be used, so only what the site states directly was filled in.' : `The AI could not be reached (${clipText(r.error, 140)}), so only what the site states directly was filled in.`;
        else {
          ai = { used: true, why: '' };
          fill = cleanAutofill(parsed, text);
          if (inline) { photoIsPerson = parsed.photoIsPerson === true; photoWhat = clipText(String(parsed.photoWhat ?? '').replace(/[<>{}]/g, ''), 60); }
        }
      }
    }
    /* Without the AI: the site's own description, as it wrote it. */
    const plain = plainFill(facts);
    if (!fill.description && plain.description) fill.description = plain.description;
    if (!fill.tagline && plain.tagline) fill.tagline = plain.tagline;

    /* The photo decision. */
    if (photo && photoIsPerson === false) {
      notes.push(`The picture found (${photo.why}) does not show a person, so it was not used as your photo.`);
      photo = null;
    } else if (photo && !photo.marked && photoIsPerson !== true) {
      notes.push(`The site has a preview picture, but nothing says it shows a person${ai.used ? '' : ' and the AI was not there to look'}, so it was not used as your photo.`);
      photo = null;
    } else if (!photo) {
      notes.push('No photo of a person is marked on the site — upload one of yourself.');
    }
    const video = facts.videos[0] ?? '';
    if (!video) notes.push('No YouTube, Vimeo or Loom video is on that page.');
    if (!ai.used && !fill.description) notes.push('The site has no description tag to take a description from.');

    return json({
      success: true,
      from: page.url,
      ai,
      fill: { ...fill, videoUrl: video },
      logo: logo?.ok ? { dataUrl: logo.dataUrl, from: logo.url } : null,
      photo: photo ? { dataUrl: photo.dataUrl, from: photo.from, what: photoIsPerson && photoWhat ? photoWhat : photo.why } : null,
      notes,
    });
  }

  /* ── Owner: is this address free? ──
     Asked as the owner types, so the box can say "taken" before a save is
     refused. The answer is not a secret — /book/<slug> already says whether a
     page is there — but it still needs a session, so it is not a free oracle
     for walking every address on the install. */
  if (action === 'slug_check') {
    const user = await userFromToken(env.DB, d.token);
    if (!user) return fail('Sign in again — this action needs a current session.', 401, { code: 'unauthorised' });
    const accountId = String(d.accountId ?? '').trim();
    if (!accountId) return fail('A workspace is required.');
    if (!(await canAccess(env.DB, user, accountId))) return fail('That workspace is not yours.', 403);
    const limit = await rateLimit(env, { what: 'booking-slug', who: accountId, max: 300, windowSeconds: 3600 });
    if (!limit.allowed) return fail('Too many checks — wait a minute and try again.', 429, { field: 'booking.slug' });
    const slug = String(d.slug ?? '').trim().toLowerCase();
    const mine = await env.DB.prepare('SELECT slug FROM crm_booking_config WHERE account_id = ?')
      .bind(accountId).first<{ slug: string | null }>();
    if (slug && slug === mine?.slug) return json({ success: true, available: true, yours: true });
    const why = slugProblem(slug);
    if (why) return json({ success: true, available: false, reason: why });
    const clash = await env.DB.prepare('SELECT 1 AS n FROM crm_booking_config WHERE slug = ? AND account_id != ?')
      .bind(slug, accountId).first();
    return json(clash
      ? { success: true, available: false, reason: 'Another workspace already uses this address. Try another.' }
      : { success: true, available: true });
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
    /* What the page may promise about after booking, read now rather than
       stored: a confirmation email only if this workspace can send one and
       has not switched it off, a Google Meet link only with a calendar
       connected. The page words its last line from these. */
    let confirms = false;
    let meet = false;
    try {
      const priv = await env.DB.prepare('SELECT private FROM crm_booking_config WHERE account_id = ?').bind(row.account_id).first<{ private: string }>();
      let auto: Record<string, unknown> = {};
      try { auto = (JSON.parse(priv?.private || '{}') as { automations?: Record<string, unknown> }).automations ?? {}; } catch { /* defaults */ }
      confirms = auto.confirmEmail !== false && canSend(await loadMailbox(env, row.account_id));
      meet = !!(await env.DB.prepare("SELECT 1 AS n FROM crm_calendar_connections WHERE account_id = ? AND status = 'connected' LIMIT 1").bind(row.account_id).first());
    } catch { /* unknown: promise nothing */ }
    return json({ success: true, accountId: row.account_id, config: JSON.parse(row.public || '{}'), delivery: { confirms, meet } });
  }

  /* ── Visitor: which slots are already taken ── */
  if (action === 'slots') {
    const accountId = String(d.accountId ?? '').trim();
    /* A range, because a visitor's day spans two of the owner's dates once
       the zones differ, and a month view asks about thirty at once. */
    const from = String(d.from ?? d.date ?? '');
    const to = String(d.to ?? d.date ?? '');
    if (!accountId || !DATE_OK.test(from) || !DATE_OK.test(to) || to < from) return fail('A workspace and a date are required.');
    if ((Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / 86_400_000 > 62) return fail('Ask for at most two months at a time.');
    const { results } = await env.DB.prepare(
      `SELECT slot_date AS date, slot_time AS time, data FROM crm_bookings
        WHERE account_id = ? AND slot_date >= ? AND slot_date <= ? AND status != 'cancelled'`,
    ).bind(accountId, from, to).all<{ date: string; time: string; data: string }>();
    const booked = (results ?? []).map(r => {
      let duration = 30;
      try { duration = Number((JSON.parse(r.data) as { duration?: number }).duration ?? 30) || 30; } catch { /* default */ }
      return { date: r.date, time: r.time, duration };
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
    const page = await env.DB.prepare('SELECT public FROM crm_booking_config WHERE account_id = ?').bind(accountId).first<{ public: string }>();
    if (!page) return json({ success: false, notFound: true, error: 'There is no booking page at that address.' });
    let pub: Record<string, unknown> = {};
    try { pub = JSON.parse(page.public || '{}') as Record<string, unknown>; } catch { /* an empty page offers nothing */ }
    const ip = req.headers.get('CF-Connecting-IP') ?? 'unknown';
    const limit = await rateLimit(env, { what: 'booking', who: ip, max: 8, windowSeconds: 3600 });
    if (!limit.allowed) return fail('Too many bookings from here in the last hour. Try again later.', 429);

    const guestEmail = addr(d.guestEmail);
    if (!guestEmail) return fail('Enter a valid email address so we can send the confirmation.');
    const guestName = headerSafe(d.guestName, 120);
    if (!guestName) return fail('Enter your name.');

    /*
     * Only a time the page could have offered, and not one already gone.
     *
     * This checked one thing — an exact start time already booked — so a
     * 60-minute meeting at 09:00 left 09:30 open to a second visitor, and any
     * time at all could be filed by calling this directly: 03:00 on a Sunday,
     * last week. The same rules that drew the page (lib/bookingTime.ts) are
     * asked here, on the owner's own clock. Two visitors can still reach this
     * at the same moment; the read immediately before the write keeps that
     * window small, and losing it is a clear message rather than two people
     * at one appointment.
     */
    const eventTypeId = headerSafe(d.eventTypeId, 64);
    const rules = rulesOf(pub, eventTypeId);
    const problem = slotProblem(slotDate, slotTime, rules, await busyOn(env, accountId, slotDate, rules.duration), Date.now());
    if (problem) return fail(problem);

    const id = `bk-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
    const manageKey = newToken();
    const data = {
      guestName, guestEmail,
      guestPhone: headerSafe(d.guestPhone, 40),
      notes: String(d.notes ?? '').slice(0, 2000),
      /* The guest's zone, as their browser named it — what the page showed
         them. The slot itself is the owner's wall clock (`ownerTimezone`);
         `startsAt` is the instant both name, kept so nobody has to redo the
         conversion with whatever the rules are by then. */
      timezone: isZone(d.timezone) ? d.timezone : '',
      ownerTimezone: rules.timezone,
      startsAt: new Date(wallToUtc(slotDate, slotTime, rules.timezone) ?? 0).toISOString(),
      duration: rules.duration,
      eventTypeId,
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
      id, key: manageKey, slotDate, slotTime, guestName, guestEmail, notes: data.notes, meetingUrl, guestTz: data.timezone,
    });

    /* Returned so the confirmation screen can show it rather than promising a
       link that may not exist. Empty means no calendar is connected, which the
       booking page says plainly instead of leaving a blank. */
    return json({ success: true, id, key: manageKey, meetingUrl, emailed: mail.guest, startsAt: data.startsAt, ownerTimezone: rules.timezone });
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

    let guestData: { guestName?: string; guestEmail?: string; notes?: string; timezone?: string; duration?: number; eventTypeId?: string } = {};
    try { guestData = JSON.parse(row.data || '{}'); } catch { /* nothing to address */ }
    const mailFor = (slotDate: string, slotTime: string) => ({
      id, key, slotDate, slotTime,
      guestName: String(guestData.guestName ?? ''), guestEmail: String(guestData.guestEmail ?? ''), notes: guestData.notes,
      guestTz: guestData.timezone ?? '',
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
    /* The same rules as a new booking, with this booking's own time not
       counted against it — moving a meeting by half an hour must not be
       refused because it overlaps itself. */
    const cfgRow = await env.DB.prepare('SELECT public FROM crm_booking_config WHERE account_id = ?').bind(row.account_id).first<{ public: string }>();
    let pubCfg: Record<string, unknown> = {};
    try { pubCfg = JSON.parse(cfgRow?.public || '{}') as Record<string, unknown>; } catch { /* defaults */ }
    const rules = rulesOf(pubCfg, guestData.eventTypeId);
    if (Number(guestData.duration) > 0) rules.duration = Number(guestData.duration);
    const problem = slotProblem(newDate, newTime, rules, await busyOn(env, row.account_id, newDate, rules.duration, id), Date.now());
    if (problem) return fail(problem);
    const moved = { ...guestData, ownerTimezone: rules.timezone, startsAt: new Date(wallToUtc(newDate, newTime, rules.timezone) ?? 0).toISOString() };
    await env.DB.prepare('UPDATE crm_bookings SET data = ? WHERE id = ?').bind(JSON.stringify(moved), id).run();
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
