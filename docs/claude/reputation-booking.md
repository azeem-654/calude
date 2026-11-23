<!-- Moved from CLAUDE.md, word for word: read this before working on reputation and the booking page. -->

## Reputation — reviews read from Google, never invented

`/reputation` (`components/Reputation`, `services/reputationService.ts`) talks
only to `/api/reputation.php` (`routes/reputation.ts`); the Google calls are in
`lib/reputation.ts`, the cron pass in `lib/reputationTick.ts`; tables in
migration 0057 (`crm_review_sources`, `crm_gbp_connections`, `crm_reviews`,
`crm_review_competitors`). It once seeded fake reviews, invented one every
20–40 s and "posted" replies by flipping a flag — none of that may come back.

- **Two sources.** Places API (New) — rating, count and at most **five**
  reviews Google picks; key = the workspace's own, else the install owner's
  (`crm_install_providers` kind `google_places`, Settings → Platform services),
  resolved by `placesKeyFor` in `lib/googlePlaces.ts` — shared with prospect
  search, and like `loadAiKey` it stops falling back to the owner's key once a
  trial has ended. Neither → `NO_KEY`, by name. Business Profile (OAuth `business.manage`,
  callback is the GET of `/api/reputation.php`, state/nonce like calendar.ts
  but in its own `pending_state` column, single-use, 30 min) — every review,
  and the only way Google accepts a reply. Until Google approves the app's API
  access every GBP call is 403 / quota 0 and says `NOT_APPROVED`; the check then
  falls back to Places.
- **SerpApi fallback** (`lib/serpReviews.ts`, 2026-11-17): with no Places
  key anywhere (workspace or install), `reviewKeyFor` hands Reputation the
  owner's SerpApi key (`crm_install_providers` kind `serpapi`, Settings →
  Platform services → *Google reviews without a Maps key*) as
  `serpapi:<key>`; `searchPlaces`/`placeDetails` dispatch on that prefix.
  Place ids stay Google's own, so the Maps key later takes over with no
  migration. Reviews come from `google_maps_reviews` (newest first, ten, with
  the owner's reply), stored as `google_places` with `serp:` ext ids. Budget:
  `SERPAPI_MONTHLY` (default 230) install-wide a calendar month + 15/day per
  workspace, refused as `serp_budget`; the cron reads such a workspace every
  three days. Not metered in `crm_places_usage`. Prospect search keeps
  `placesKeyFor` (never SerpApi). `SERPAPI_BASE` points tests at the mock.
- **Reply** posts only for a `google_business` review with a live connection;
  anything else is refused with the review's link, and "Mark as replied" records
  `posted_elsewhere`. The legacy `/api/reviews-fetch.php` answers 410.
- **Rules** (`crm_reputation_rules` in crm_data) run on the server only if the
  customer *saved* them, and never on a source's first import (that is history).
  `auto_send` without a live GBP connection leaves a draft with `attention`.
- **Review requests**: the modal sends through the server (`send_requests`);
  Autopilot's `queued` rows are sent by the cron (`sendQueued`) and marked
  `sent`/`failed` with a reason; a workspace problem (no mailbox, no link)
  leaves them queued with the reason.
- Every Google base URL is an `Env` override (`GOOGLE_PLACES_BASE`,
  `GOOGLE_GBP_*_BASE`, `GOOGLE_TOKEN_URL`) so `npm run test:reputation` (self-
  contained: mock + SMTP sink on :8833, wrangler on :8822, fresh D1, needs a
  `VITE_BASE=/` build) proves the requests themselves.

## The booking page — the owner's hours, in the visitor's time

`/book/<slug>` (`Scheduling/BookingPage.tsx`) draws `Scheduling/BookingCard.tsx`
— the owner's reference, as **two cards** side by side from 1060px of box
(stacked below), laid out by container queries. Left: the business (logo
mark, name in the heading face, `tagline`); **Meet with** the host — a large
round photo in a glowing ring (`object-position` near the top for faces,
uploaded at 640px; initials on a gradient until there is one), name,
`hostRole`, topic pills (`tags`, ≤ 4); title, description; four items with
outlined icons (length, place, the visitor's own zone, one-to-one with whom);
the video as a still ("Watch a quick intro before booking") beside **What we
can discuss** (`discuss`); the points as icon cards under `pointsTitle`; and a
**testimonial only when the owner typed one** (`testimonial`: quote + name,
role, optional photo — upload kind `testimonial`; no default, never filled by
the website fill, dropped without a name). Right: **Select a Date & Time**
with the zone pill, the month in an inset panel, the day's times as pills
(the first lit), and the after-booking line with **Need Help?** — the line
promises a confirmation email only when `config` answers `delivery.confirms`
(the workspace can send and has not switched it off) and a Google Meet link
only with `delivery.meet` (a connected calendar) and a video place; the help
link only when `help` (an email → mailto, or an https page, `helpLink`) is
set. **No platform name, no trial offer, no invented testimonial, no
"verified" tick**; a clip's length only from the file.

**Themes** (`BOOKING_THEMES` in `worker/src/lib/bookingContent.ts`, picked
as swatch cards in the editor, published as `theme`): Midnight lime (the
reference — near-black, lime glow rings drawn in CSS, serif headings; the
default for a **new** page), Light (the look before themes — what a page
with no `theme` keeps, and the only one that follows the visitor's
light/dark preference), Midnight blue, Royal purple, Warm sand, Clean white &
black. `themeVars` turns one into custom properties (`themeRoot` puts them
and `data-bk-theme`/`data-bk-dark` on the page's root); fonts are the
system's (a Georgia serif stack, like the shop themes) — nothing is loaded.
`accent` (`#rrggbb`) overrides the theme's colour ("The theme's own colour"
clears it); the ink on it is computed (`inkOn`). **The logo** is measured in
the browser at upload (`measureLogo`: `logoTone` dark/light/opaque from its
visible pixels and transparency, `logoRatio`): contained, never cropped; a
plate behind it only when its ink would vanish on this ground (`logoPlate`);
a wordmark (`isWordmark`, ≥ 2.2:1) stands in for the name.
Points are `{ icon, title, detail }` with the icon from a **fixed list**
(`BOOKING_ICONS`, drawn by `Scheduling/bookingIcons.tsx`); a page from before
icons kept plain `bullets`, which `pointsOf` reads as ticks — publish writes
both. The editor `Autopilot/newProject/BookingSetup.tsx` shows the **same
card** as its preview (Desktop: laid out at 1180px and scaled to the pane;
Phone: 390px), in the AI Autopilot wizard and on Scheduling → **Booking
page** (`autoPublish={false}` there — that screen already publishes).
Editable: the address (`slug_check` as typed; slugs are install-wide, a taken
one is refused on `booking.slug`), title, host name and role, tagline,
description, topics, points with icons (≤ 8), what to discuss, theme, accent,
testimonial, help link, photo, logo, a clip or a YouTube/Vimeo/Loom link
(`videoEmbedOf` builds the player address; nothing pasted is framed as
typed), length, place, days, hours, the owner's zone (`booking.timezone`,
refused if Intl does not know it).

- **Filled in from the website.** **Fill it in from my website**
  (`booking.website`; `website` prop, else the workspace profile's) asks
  `booking.php` `autofill` (session + `canAccess`, 20/h): the site is read
  through `fetchPage`'s fence; `pageFacts` (pure) takes what the site
  *states* — title/description tags, YouTube/Vimeo/Loom links really on the
  page, a photo the site itself labels as a person (alt "Jane Bright,
  founder", or a schema.org Person) — and the logo comes from `logoFromPage`.
  With the operator's AI (`aiBudget` first, `loadAiKey`, one
  `askGeminiParts` call, site text fenced as content) it proposes title,
  host and role, tagline, description, 3–6 points with icons, what to
  discuss and tags; `cleanAutofill` clips them, strips links, addresses,
  markup and merge fields, keeps only listed icons, and **drops a host name
  not written on the site**. The link-preview picture (`og:image`) becomes
  the photo only if the AI, shown it, says it is a person. No AI (no key,
  budget, too few words, a failed call) → only the stated parts, and the
  panel says "AI not used: <why>". Nothing is saved by asking; pictures come
  back as data, are shrunk in the browser and uploaded through
  `/api/booking-media.php` like a hand-picked one, so the page never
  hotlinks another site (YouTube's own still excepted). It runs once by
  itself on an empty page with a known website (`crm_booking_autofilled`),
  filling only what is empty; pressed, it replaces what it found.
  `SITE_TEST_ORIGIN` (tests only) fetches any `*.test` host from a local
  mock (`wireUrl` in readSite.ts). `npm run test:bookingfill` (pure).
- **Times.** A booking is stored as the owner's wall clock (`slot_date`,
  `slot_time` in the schedule's `timezone`) — the reminder pass and the diary
  read it so. `worker/src/lib/bookingTime.ts` (pure, no imports, imported by
  the browser through `services/bookingTime.ts`) turns the owner's hours into
  instants per date with Intl — never a fixed offset, so DST is right on both
  sides — and back into the visitor's own day (`slotsForVisitorDay`). The
  skipped spring hour is never offered; the repeated autumn hour is the
  earlier. `create`/`reschedule` ask `slotProblem` with the same rules (open
  day, on the grid, overlaps with buffers, notice, window, daily limit) and
  store `startsAt` (UTC), `ownerTimezone`, the guest's `timezone` and
  `duration`; the Google event uses `ownerTimezone`. Emails add the guest's
  own time. `npm run test:bookingtz` (pure).
- **Media** (`routes/bookingMedia.ts`, `/api/booking-media.php`, migration
  0073 `crm_booking_media`): raw-body upload with `Bearer cookie`, one per
  kind per workspace, served by random key with `nosniff` and a CSP that runs
  nothing. Pictures are PNG/JPEG by their bytes (≤ 800 px, ≤ 400 KB, shrunk in
  the browser first) in D1; a clip (MP4/MOV/WebM by its magic, ≤ 25 MB) needs
  the `VIDEO` R2 bucket and is refused by name (`no_storage`) without it.
  Publishing keeps a media address only if it is this workspace's own.
- `npm run test:bookingpage` (needs a `VITE_BASE=/` build and a running
  `wrangler dev --var SITE_TEST_ORIGIN:http://127.0.0.1:8982` with no AI key;
  `BASE`, `PERSIST`, `SITE_PORT`, `SHOTS`): the website fill with no AI,
  the editor filling itself in, icons/topics/colour/theme/testimonial/help
  published, a new page in Midnight lime and an older one still Light, the
  measured logo, nothing reaching past its card (the page clips its glow, so
  the document's own overflow cannot show it) at 390/1280; an owner in New York and a visitor in
  Bangkok — 11 hours apart in the slots, the booking at the right UTC instant,
  off-grid times refused, uploads, the address across workspaces, the editor,
  390/1280. `test:security` covers the media route (testimonial photos too) and the website read across tenants (and its fence). Local `wrangler dev`'s proxy can exit when a browser closes mid-request — run it in a restart loop.

## The strategy call — the operator's own booking page

`/book/strategy-call` (`StrategyCall/StrategyCallPage.tsx`) is where every
"Book a strategy call / consultation / assessment" button on the four sites
goes. It is **the install's, not a workspace's**: settings in
`crm_strategy_settings` (one row), bookings in `crm_strategy_calls`
(migration 0076), API `/api/strategy-call.php` (`routes/strategyCall.ts`),
rules in `lib/strategyCall.ts` (pure, on top of `bookingTime.ts`). The owner
sets it in **Settings → Platform services → Strategy Call Booking**
(`Settings/StrategyCallSettings.tsx`); every owner action checks
`role = 'agency' AND accountId IS NULL` on the server. The slug
`strategy-call` is reserved in `slugProblem`, and App.tsx routes it before any
workspace's `/book/<slug>` (our hosts only).

- **On by default since 2026-10-26** (`DEFAULT_SETTINGS.enabled = true`, at
  the owner's request: weekdays 09:00–17:00 New York, a day's notice, 30-minute
  calls); migration 0078 switched on a row already saved off. Switched off by
  the owner, the page says bookings are not open and links to the source
  site's own form.
- Several windows a day, closed dates, special hours per date, lengths
  15/30/45/60, notice, horizon, buffers, daily limit, up to six questions.
  `cleanSettings` refuses box by box (`strategy.*` fields).
- **No double booking**: the INSERT is one statement that refuses an overlap
  (with buffers) and a full day; a partial unique index refuses two confirmed
  calls at one instant; `idem_key` (the browser's submit id) turns a retried
  or double-clicked submit into the booking it already made (`replayed`).
- **The guest's link** is `?manage=<id>.<key>`; only the key's SHA-256 is
  stored, a wrong id or key answers the same, and the guest view carries no
  note or source. The owner's private note never leaves the owner's list.
- **Mail** goes through `installMailbox()` + `deliver()`; each booking keeps
  `notify` = `sent` | `failed: …` | `not_configured` | `off`, and the page
  promises an email only when the server says one was accepted. Reminders
  are a cron pass after the trial mail (`strategyReminders`). The guest's
  words live in `lib/strategyMail.ts` (pure, previewable): the confirmation
  quotes their own answers back ("What you would like help with") with a
  promise to come prepared on each, says how the call runs and what we can
  help with — **no figures, testimonials or claims about other customers**.
  The owner's notice carries the same answers.
- **After the call** (2026-11-08): `strategyReviewAsks`, right after the
  reminders in the cron, emails "How did your … go?" once per call, an hour
  after it ends and only within three days of it (no surprise mail about old
  calls), never for `no_show`/`cancelled`. The ask has **its own key**
  (`review_key_hash`, migration 0087) because the manage key is never stored;
  the row is claimed before the send so overlapping runs cannot double-ask.
  `?review=<id>.<key>[&stars=n]` on the booking page saves 1–5 stars and words
  (`review_get`/`review_save`, rate-limited, refusals named
  `strategy.review.*`); the owner sees them in the list. Settings: `askReview`
  (on unless switched off) and an optional https `reviewUrl`, offered after
  saving **to every reviewer whatever the rating** — offering it only to happy
  ones is review gating, which Google and the FTC forbid. **No calendar
  or video integration** — the panel says so; a fixed https room link is sent
  as typed.
- The source site, UTM tags, click ids and referrer are kept per booking
  (`cleanSource`) for the owner's list.
- `npm run test:strategycall` (pure) and `npm run test:strategycalle2e`
  (self-contained: wrangler :8871, fresh D1, needs a `VITE_BASE=/` build):
  owner-only access, field refusals with no dead end, idempotent submits, a
  five-way race, daily limit, closed dates, guest move/cancel, the review by
  its own key (not the manage key) and its page at 1280/390, the sites'
  links and isolation at 1280/390. `test:security` covers the route by id.

### Several booking pages per workspace (2026-11-15)

`crm_booking_pages` (migration 0099): a business workspace's own pages, any
number per account (`id` bp-…, made by the browser; `project_id`; `slug`
unique across **both** tables — `slugTaken` in routes/booking.ts asks each).
The account's page stays in `crm_booking_config`, so every older reader still
works; the private side (automation switches) stays the account's. `publish`
/`slug_check` take `pageId` (+ `projectId`, checked against `crm_projects`);
`pages` lists, `page_delete` removes (and its pictures); `config` by slug
falls back to pages and returns `pageId`; `create` files `pageId` in the
booking's data, which words its emails and a later move. Media are per page
(`crm_booking_media.page_id`, unique per account × kind × page — before, a new
page's logo deleted the other page's file). `{{bookingLink}}` prefers the
project's own page (mergeFields `businessFor`). BookingSetup takes
`value`/`onChange`/`page` to edit one; **Full screen** opens the card in a
dialog (`BigPreview`). Scheduling → **Booking pages** (`BookingPages.tsx`):
the main page plus each business workspace's, "New booking page", take down.
The AI Autopilot wizard makes a **fresh** page for the business it sets up
(`freshBookingSchedule`: the owner's hours only, nothing of another
business), publishes it as edited, and the build links it to the project and
marks the set-up step `done` (launch steps carry `done`; Overview ticks it).
`test:security` covers take-over by id, address clashes, foreign projects,
listing and deleting across accounts.

## 2026-11-18 — Reviews incubated; SerpApi takes over from a refused Maps key; bookings can be deleted

- Reviews (`/reputation`) is in the incubator (`reviews`, docs/INCUBATOR.md)
  until the Google Maps key is paid for.
- `reviewKeyFor` (lib/serpReviews.ts) no longer lets a stored install Maps key
  that Google refuses (`crm_install_providers.status = 'error'`) block
  SerpApi: a refused install key hands over. `find_place` marks the install
  key refused on a key fault (`KEY_FAULT` now includes `denied`, Google's 403
  "Permission denied on the service") and retries the same search through
  SerpApi. Platform services' "Not in use" badge follows the same rule. A
  workspace's own key is never overridden.
- Booking pages → Bookings: the trash cancels a live booking (the guest is
  told) and deletes one already cancelled (`booking.php` `delete`, which
  refuses an upcoming confirmed booking). Covered in `test:security`.
- The booking page's auto-publish is keyed on the schedule's content, so a
  sync handing over an equal schedule no longer leaves "Publishing booking
  page…" on screen.

## 2026-11-23 — Reminders sent, Google busy times close slots, cancels reach the guest

Found while answering an AppSumo buyer's questions about scheduling: three
things the screens promised were not done.

- **Reminder before the meeting** (Scheduling → Automations) was saved and
  never sent. `bookingReminders` (routes/booking.ts), a cron pass after the
  strategy-call mail, now emails the guest `reminderMinutes` before (default
  60, on unless switched off — what the switch shows) from the workspace's
  mailbox through `deliver`, with the Meet link and the reschedule/cancel
  link. The row is claimed (`reminded_at`) before the send, which also keeps
  Autopilot's evening-before reminder from doubling it; a reschedule clears
  it; a booking made inside the window is claimed and not reminded. The
  outcome is kept as `data.reminder` (`sent`/`failed`). The link uses the
  address the booking was made on (`data.origin`, https only — a reseller's
  domain), else `APP_ORIGIN`.
- **Google Calendar busy time** now closes the slots it overlaps:
  `calendarBusy` (routes/calendar.ts, freeBusy in 31-day pieces with the
  existing `calendar.events` scope) feeds `slots` (public — times only, never
  what the events are), `create` and `reschedule`, as `Busy` with
  `external: true` (`busyFromInstants` in lib/bookingTime.ts splits at the
  owner's midnights). External time never counts toward the daily limit. A
  booking's own Google event is dropped when that booking is the one being
  moved. Google not answering offers the page's own free times and stamps
  `last_error` on the connection (shown amber on Customer Engagement →
  Meetings), cleared on the next good read. No local Google mock: the
  conversion is in `test:bookingtz`.
- **Cancel and reschedule follow into Google**: `cancelMeetingFor` deletes the
  event (guest cancel, owner cancel); `moveMeetingFor` PATCHes it to the new
  time (same Meet room; `moveEvent` in lib/googleCalendar.ts), or makes one if
  the calendar was connected after the booking. The rescheduled email carries
  the Meet link. `wallRange` fixes an end time that wrapped past midnight.
- **The owner's cancel tells the guest**: `set_status` → `cancelled` on an
  upcoming booking now sends the cancellation email (answering `emailed`) —
  the trash on Bookings said "the guest is told" and only flipped the column.
- `npm run test:bookingreminders` (self-contained: SMTP sink :8843, wrangler
  :8841 `--test-scheduled`, fresh D1, no build): due reminder sent once with
  the link and the guest's time, not-yet-due and booked-inside-window left
  alone, switched off sends nothing, reschedule clears it, owner cancel
  emails once, another account cannot cancel.
