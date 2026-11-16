# Pre-AppSumo audit — 16 November 2026

Audit only. No product code was changed. This is the fix list for the next session.

## How it was tested

- Production build (`VITE_BASE=/ npm run build`) on the real Worker with a fresh local D1, a real Google AI key, and the browser made to believe it was on `app.protectedcentral.com`, so the live switches applied (Video Studio hidden, Protron support-only).
- Signed in with **AppSumo reviewer logins** made the same way the owner makes them (`/appsumo` → reviewer logins, Tier 3) — the accounts AppSumo's team will use — plus two brand-new buyers who redeemed codes.
- Every screen at 1280 px and 390 px; every scenario below driven through the UI with realistic mock businesses.
- Live site: read-only page loads only. **Nothing was signed in to, submitted or created on live.**

Typecheck (app and Worker) and the production build are clean. 37 routes × 2 widths: no crash, no horizontal overflow.

### Not verifiable from the test sandbox — check these on live by hand

| # | What | Why it matters |
|---|---|---|
| V1 | **AI Prospecting search** ("dentists in Austin, Texas with a website") returns businesses | Step 2 of the reviewer email. Locally it falls back to OpenStreetMap, which the sandbox cannot reach, so it only ever showed the (honest) failure screen. Needs the Google Maps key on live. |
| V2 | The **Help button** in the corner is present for a reviewer login | Step 4 of the reviewer email. It only appears if one of the owner's widgets is ticked "Use as the help button inside Protected Central". Locally there is no button at all. |
| V3 | A **sign-in code email arrives** for a new sign-up on live | Live sign-up is by emailed code. An AppSumo buyer cannot redeem without it. |
| V4 | Top bar does **not** say "Cloud delayed" / dashboard does not say "The schedule last ran never" | Local artefact (no cron here), but a reviewer seeing it on live reads it as broken. |
| V5 | Reviews → "Find your business on Google" works | Needs the Google key on live. |
| V6 | AI speed on live | Here the first wizard step took 33–47 s on first run (6–14 s later). |

## Findings

Severity: **HIGH** = a reviewer is likely to hit it and it reads as broken or untrue. **MED** = confusing or wrong, not blocking. **LOW** = polish.

### HIGH

**H1. Reviewer logins see "Not subscribed — Choose a plan below" on Plan & billing.**
`/billing` on a reviewer login (Tier 3 granted without codes) shows the "Not subscribed" card, then monthly plan cards, above a usage table headed "AppSumo Tier 3". A buyer who redeemed real codes sees the correct "AppSumo lifetime deal… Paid once" card, so this affects exactly the accounts AppSumo tests with. `/appsumo` on the same login says "Your deal — No code redeemed yet".
→ `src/components/Billing/ClientBilling.tsx:130`; reviewer grant in `worker/src/routes/appsumo.ts` (reviewers).

**H2. A second business workspace takes the first business's identity.**
Built "Blue Ridge Plumbing" then "Lone Star Electric" in the same account. The second wizard skipped the "Your business" question (9 questions instead of 14); the blueprint listed "Blue Ridge Plumbing profile, already in Protected Central"; the build log said "Loading Blue Ridge Plumbing's business profile"; the electrician's workspace says "It writes it for Blue Ridge Plumbing, in their voice" and "Upload a logo for Blue Ridge Plumbing"; the dashboard card reads "Lone Star Electric Marketing — for Blue Ridge Plumbing". Agencies (the Tier 2/3 buyer) make several businesses.
→ `src/services/projectIntake.ts:851` (`existing:` business) and whatever chooses the default business for a new workspace.

**H3. Websites cannot be published to the public.**
"Published" is a status flag only. `/preview/<siteId>` shows the login page to a signed-out visitor. "Custom Domain" and "Subdomain" in the builder are plain text boxes wired to nothing; the placeholder is `mysite.crmpro.app` (old brand). The menu says "Full sites, built and published from here".
→ `src/components/Websites/WebsiteBuilder.tsx:492-499`, `Websites.tsx:330`, `SitePreview.tsx`, route `/preview/:siteId` in `src/App.tsx:268`.

**H4. Funnels cannot be published either, and four builder tabs are stubs.**
No Publish control; `/preview-funnel/<id>` needs a login. Builder tabs Stats / Contacts / Sales / **Settings** all read "No data available yet" (Settings has no fields). "Start Split Test" and the Visitors / Conversions / Revenue counters can never move. Same root cause as H3.
→ `src/components/Funnels/FunnelBuilder.tsx:202, 286`.
*Either host these pages publicly or hide/rename the modules ("page drafts") before submission. Booking pages, Customer Engagement forms (`/f/<slug>`) and shops are genuinely public and work.*

**H5. The site and the app promise features that are hidden on live.**
Live marketing home: "YouTube Shorts: Vertical clips, captioned", "Instagram Reels…", "A real conversation, out loud: Protron answers in a natural voice as you speak", "Speak instead of typing, on any screen", "Voice prompts". `/pricing`: "Any allowance raised to fit — business workspaces, Shorts…" and usage text naming "AI Video Studio". In the app: AI Autopilot header "Shorts this month 0/100"; Billing usage descriptions name "AI Video Studio" three times; New Sub-Account plan cards say "100 AI Shorts and 15 recordings processed a month"; `allowances.ts` AppSumo tiers carry video limits. The reviewer email lists "an AI Video Studio".
→ `src/components/AppSumo/reviewerEmail.ts`, `worker/src/lib/allowances.ts:292-335`, site copy, Autopilot header.

**H6. A booking made on the public page never reaches the Calendar.**
Visitor booked Tue 17 Nov 10:00; it shows in Booking pages as Confirmed and the top-bar badge counts it, but `/calendar` (week view, checked twice) is empty, and so is the dashboard's "Today's schedule". Calendar's own text says bookings from the public page show there.

**H7. A plumber is set up as a real-estate business.**
"I run Blue Ridge Plumbing… find homeowners and property managers who need emergency plumbing…" is classified "Real Estate Lead Generation + Social Media Growth" (with AI and with the keyword fallback). The wizard then asks "Who do you want to hear from? Sellers / Buyers / Landlords / Tenants" and the prospect search looks for the business type "homeowners in Richmond, Virginia".
→ `src/services/projectSolutions.ts:1605`, intake matching.

### MED

- **M1. A code typed before sign-up is not added.** `/appsumo` says "Kept in this browser while you sign up, then added for you." After sign-up the buyer is back on `/appsumo` with the code pre-filled and "No code redeemed yet" (watched for 20 s) — they must press Redeem code; until then the account is a 7-day trial. → `AppSumoPage.tsx:160`.
- **M2. The sign-up page an AppSumo buyer lands on says "Start your 7-day free trial… No card needed"** with no mention of AppSumo or the held code. → `src/components/Auth/LoginScreen.tsx:319`.
- **M3. "Posts to social" is promised but the product does not post.** Dashboard tile "Posts to social — On the days your plan says", workflow "Social Media Content Automation", wizard copy "post on social media every day". The Graphics Designer itself says, correctly, "Protected Central does not post to social platforms for you". → `src/components/Dashboard/AutopilotFilm.tsx:142`.
- **M4. Agency page says "0 of 2 sub-accounts used"** on Tier 3 (Billing says 15). → `src/components/Agency/AgencyDashboard.tsx:264` (which allowance it reads).
- **M5. "Content Studio" still appears** in the blueprint ("Content Studio → Graphics Designer & Editor"). → `src/services/projectSolutions.ts:968, 1138`.
- **M6. Website builder "Generate with AI" on the hero** writes headline, sub-headline and literal "[ Get Your Free Estimate ]  [ Call 24/7 Emergency Service ]" into the one headline box, and adds "top-rated".
- **M7. Template gallery cards carry star ratings** (★★★★★ / ★★★☆☆) that nobody gave. New sites are not personalised: "Your Business" everywhere although a business profile exists.
- **M8. Dashboard "Set up your workspace 0/6"** says "Add your company portfolio — Nothing yet" and "Start your first business workspace — None yet" with two workspaces built and listed lower on the same screen.
- **M9. Dashboard deal tasks**: "10 due soon of 34 deal tasks", the same task listed twice ("Publish your booking page…", "Connect the mailbox…"), tasks titled "New lead: Monitor Google Local Services ads…", all under "Get Blue Ridge Plumbing live" (see H2).
- **M10. Jobs & revenue shows the operator's performance-fee machinery to every customer**: "No growth-service agreement is in force…", "Eligible collections", "Fees approved", "Fee under review", tabs "Fee statements" and "Approvals". → `src/components/Jobs/JobsRevenue.tsx:176`.
- **M11. Autopilot-built "Free Quote Request" funnel** carries generic lead-magnet filler: "Inside the guide — The 10-minute setup / The 3 costly mistakes", button "Send me the free guide".
- **M12. Prospect search failure took ~150 s** to say it had stopped, and the failure panel shows "No coordinates for these — the register lists addresses, not points" with 0 found, plus "Verifying mailboxes — Needs a verifier / Not connected" (an operator connection the customer cannot make). → `src/components/Prospecting/AiResults.tsx:196`.
- **M13. A visitor who books is not added to Contacts** (a form submitter is).
- **M14. An Engagement form can go live with no usable question**; the public page then accepts an empty submission and creates a contact "New enquiry" (email "Invalid") with an open deal, though the editor says no contact is made.

### LOW

- L1. Policy banner ("The acceptable use policy has been updated… I accept") is hidden behind the dashboard hero at 1280 px and cannot be clicked there; works on other pages. Wording says "has been updated" to a brand-new account. → `src/components/shared/StandingBanner.tsx:65`.
- L2. Wizard failure screen contradicts itself: "The build stopped — Could not reach the server" beside "Every step has finished" and "Done. It keeps running without this open."
- L3. One `/api/intake.php` answer "The AI answered with something that could not be read" during a wizard run (it recovered).
- L4. Blog list page is titled "Blog Automation — Rank the customer's own pages"; inside a project it is "Blog & SEO — A planned blog that ranks your own pages". Project card title is not clickable. Publish tab said "0 written" while Write said "1 written".
- L5. Old brand: `mysite.crmpro.app` (website builder), `crmpro (default)` (New Sub-Account).
- L6. "Media Library" page tells you to press "Save to Media Center".
- L7. Billing row "Prospects found daily — 0 of 1,500" (the allowance is monthly).
- L8. Contacts "Last active" shows a raw timestamp `2026-11-16T15:36:12.046Z`.
- L9. Reports chart axis reads "$0k, $0.001k, $0.002k…" at zero revenue.
- L10. Graphics default picture for a plumber is a pool villa with distorted colours; template thumbnails use a truncated blurb as the headline.
- L11. Booking page monogram shows "3" (first character of "30 Minute Meeting"); "Schedule a meeting with me." with no business name.
- L12. Shop copy is UK-flavoured for a US marketplace ("£500", "Next day across the UK, £4.95", "joiner").
- L13. Dashboard "What to do next — Ranked by lift +1.39 / Now at 0/100" — scores with no explanation. → `src/components/Dashboard/DayBoard.tsx:140`.
- L14. Workspace tab strip is clipped at 1280 px ("Business Workspace S…"). Website builder: Save closes the editor; its top bar is light inside a dark app.
- L15. Settings shows customers operator-looking tabs ("API Validation", "Infrastructure", Integrations → "Stripe: take subscription payments").
- L16. `/rcm` opens by URL with "Synthetic test data only" (hidden from the menu, as intended).

## What worked

See `2026-11-16-appsumo-test-report.md` for the scenario-by-scenario results. In short: AI Autopilot wizard and build, Blog & SEO end to end, Graphics Designer, AI email campaigns (with sending correctly blocked until a mailbox is connected), Customer Engagement forms → contact → deal, booking page, contacts, deals in six views, reports, shop guard, AppSumo code redemption and stacking, all 13 Settings tabs, phone layout.

## Automated suites run

All on a fresh local database, run one at a time:

| Suite | Result |
|---|---|
| `test:security` (multi-tenancy, ids, secrets) | 274 passed, 0 failed |
| `test:forms` (form refusals name their field) | all passed |
| `test:signup` | 70 passed, 0 failed |
| `test:isolation` (one account cannot see another's data) | 37 passed, 0 failed |
| `test:appsumo` (codes, stacking, Licensing v2 webhooks, OAuth) | 72 passed, 0 failed |
| `test:allowances` / `test:allowancese2e` | 92 / 81 passed, 0 failed |
| `test:intake`, `test:design`, `test:autopilot`, `test:hosts`, `test:gate`, `test:publicpages` | 121, 78, 41, 37, 21, 8 passed, 0 failed |
| `test:cookies` | 20 passed; 3 not valid in this run — the test edits the default local database with `wrangler d1 execute` while the server under test used a separate one, so its "session renewed" and "ended session" steps never reached the server. Re-run it the standard way (default database on :8787) to confirm. |

Note: `test:intake` passes ("a barber is a salon, not a bar") yet H7 happens — it has no case for a trade whose customers are "homeowners and property managers".

## Suggested order for the fix session

1. H1, M1, M2 (what an AppSumo tester sees in the first two minutes).
2. H5, M3, M5 (copy that promises what is hidden) — and the listing/reviewer email to match.
3. H3, H4: decide — host pages publicly, or hide Websites/Funnels (or label them drafts) for the review.
4. H2, H7, M8, M9 (wizard identity and classification).
5. H6, M13 (bookings → calendar and contacts).
6. V1–V5 on live, by hand, before sending the reviewer email.
