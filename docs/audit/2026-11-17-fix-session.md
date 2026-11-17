# Fix session — 17 November 2026

What was fixed from `2026-11-16-pre-appsumo-audit.md`, how it was tested, and
what is left. Code on `claude/gohighlevel-app-testing-5sNjJ`, then `staging`.

## Fixed

| Finding | Fix |
|---|---|
| **H1** Reviewer logins "Not subscribed" | `lib/trial.ts` asks for a paid plan before "no trial date" (reviewer logins never had a trial). Plan & billing and /appsumo name **AppSumo Tier 3 — reviewer login** (`standing().reviewer`). |
| **H2** Second business takes the first's identity | `projectIntake.ts` reuses a business profile only when the request is plausibly the same business; otherwise it asks, with the named business pre-filled. Build log, blueprint and labels use the new one. |
| **H3 / H4** Websites and funnels not public | New `/api/published.php` (`routes/published.ts`, migration `0102_public_pages.sql`): Publish / Publish changes / Unpublish in both builders; public page at `/s/<slug>` signed in or out; content read from the account's stored data, never the request; view counts. Dead domain boxes, `mysite.crmpro.app`, stub funnel tabs, split test and fake counters removed. Form blocks submit through the real Engagement form. |
| **H5** Hidden features promised | Shorts/Reels logos, Shorts meter strip ("Shorts this month"), AI Shorts on plan cards (incl. New Sub-Account), Custom offer, "AI Video Studio" in meter text, reviewer email all follow `featureReady('video-studio')`. "Voice prompts" → "Voice messages, written out" (true on live). The *Coming soon* section stays, labelled. |
| **H6** Bookings not on Calendar | `services/useRemoteBookings.ts`: Calendar and dashboard "Today's schedule" read the server's bookings every 2 min. |
| **H7** Plumber set up as real estate | Trade detection beats "homeowners / property managers"; AI keys pass through `tradeSafeKeys`; prospect type is a business ("property management companies"), never people. 22 new intake cases. |
| M1 | A code typed before sign-up is redeemed automatically on return to /appsumo. |
| M2 | Sign-up with a held code: "Create your account for your AppSumo deal … nothing to pay here". |
| M3 | "Posts to social" → "Social posts, ready to post"; wizard/workflow copy says *prepares*. |
| M4 | Agency page uses the server's allowance (15 on Tier 3). |
| M5 | "Content Studio" removed from blueprints. |
| M6 / M7 | Builder AI fills headline, sub-heading and button separately and may not claim ratings/awards. Invented testimonials, stars and figures removed from website templates, the template gallery and funnel templates (`shared/scrubInvented.ts`); placeholder review slots never publish. New sites carry the business name. |
| M8 / M9 | Dashboard checklist reads real profiles and workspaces; setup chores get their own stage, no "New lead:" chores, account-level chores once per account. |
| M10 | Jobs & revenue hides fee tiles, fee tabs and the agreement line unless a growth-service agreement exists. |
| M11 | "Free Quote Request" is a real quote form (name, phone, address/ZIP, what's needed, "Request my free quote"). |
| M12 | Failure panel: no empty map; verifier step reads "Free domain checks only". |
| M13 | `Layout/CaptureMerger.tsx` turns bookings, chats and form captures into contacts on every screen (every 3 min), one pass at a time. |
| M14 | `engage.php submit` enforces required boxes, refuses an empty form, and makes no contact without an email or phone. |
| L1, L5, L7, L8, L9, L11, L12, L13 | Policy banner above the hero and reworded; old brand placeholders; "Prospects found by daily prospecting"; dates in Contacts; Reports axis; booking monogram; US shop examples; "Set-up score" and "+N pts". |
| Digital Business Setup | No longer says the starter site is "published", and its copy makes no promises. |

## New: Google reviews without a Google Maps key

`lib/serpReviews.ts`. With no Places key anywhere, Reputation reads Google
through **SerpApi's free plan** (250/month, no card): rating, count, ten newest
reviews with the owner's replies. Same Google place ids, so the Maps key takes
over with nothing redone. Capped at 230 a month install-wide and 15 a day per
workspace; the cron reads such workspaces every three days. Owner pastes the
key in Settings → Platform services (checklist row 64). Replies still need
Business Profile.

## Tested

Typecheck (app and Worker) clean; production build clean.

| Suite | Result |
|---|---|
| test:security | 289 passed, 0 failed (15 new for publishing) |
| test:forms | all passed |
| test:signup (standard way, PERSIST + --test-scheduled) | 70 passed, 0 failed |
| test:isolation | 37 passed |
| test:cookies (default local D1 on :8787) | all passed — the audit's 3 "not valid" are cleared |
| test:appsumo | 71 passed (updated: the held code is now added without a press) |
| test:wizard | 95 passed |
| test:sitefunnel | 45 passed |
| test:intake / autopilot / design / allowances / hosts / publicpages | 143 / 41 / 78 / 92 / 37 / 8 passed |
| test:reputation | the new SerpApi cases pass against a mock; the suite's **own browser step fails before them, unrelated**: it expects the install owner to have a workspace selected right after sign-in, and a fresh owner has none. Needs the test to create one first. |

Browser, with Chromium posing as **app.protectedcentral.com** (so held-back
features are off as on live), 1280 and 390: reviewer Plan & billing and
/appsumo show Tier 3; no video meters; Agency "of 15"; a server booking on the
Calendar and Today's schedule; the booker becomes a contact without opening
Engagement; Jobs & revenue without fee machinery; sign-up wording with a held
code; the SerpApi card for the owner; no page errors, no overflow. Helpers also
drove: publish → open signed out → unpublish for a site and a funnel; two
businesses built in one account without crossing.

## Could not be tested from this sandbox

- **Real email delivery** — outbound SMTP is blocked here (only HTTPS leaves);
  the suites use a local mail sink. The owner confirmed the sign-in code email.
- **AI Prospecting on live** — OpenStreetMap's Overpass is unreachable from
  here; Geoapify needs the owner's free key (checklist row 27, still open on
  app.protectedcentral.com — do it before the review).
- **SerpApi for real** — needs the owner's own free account (row 64).
- The AI path of the wizard (no AI key in the sandbox); the keyword fallback was tested.

## Left

- `FunnelPreview.tsx` "Test form submit" still adds a real contact.
- test:reputation's sign-in step (above).
- The AppSumo listing's tier table must drop video allowances (Partner Portal, owner).
