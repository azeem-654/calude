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
