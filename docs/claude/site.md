<!-- Moved from CLAUDE.md, word for word: read this before working on the public site and its funnel. -->

## The public site's funnel — Find my solution, carried through sign-up

`docs/SITE-CONVERSION.md` is the audit and the funnel. The site's hero is
"Describe the outcome | AI builds the system", with one primary button
everywhere — **Start free** (`StartFree` in SiteHome.tsx), "7 days free · No
card required · Nothing sends until you approve it" beside it — and **Find my
solution**. The wizard (`Site/SolutionWizard.tsx`) is **open on the page**:
the "What do you want to grow?" section (`SolutionsSection.tsx`, `#solutions`,
the wizard at `#find`) draws it `inline` at its first question, with the
ready-made recipe cards under it. Every Find my solution button, and `#find` /
`#find=<solution>`, scrolls there; a card's "Build this" restarts it with that
solution picked (`FindRequest`: `n` remounts with the pick, `call` = somebody
was sent here). Inline it has no scrim, scroll lock, Escape or autofocus, grows
with its step, keeps its footer stuck to the window, and counts
`wizard_started` on first touch or when sent to — never on page load. Its code
loads lazily as the section nears the screen, behind a still copy of its first
screen. The same component still renders as the modal (no `inline`, portalled
to `<body>` because the site's transformed sections make `position: fixed`
relative to themselves). `FaqSection.tsx` answers only what is true of the
product.

- **One judgement.** The wizard runs the app wizard's pure modules
  (`initialState`, `allQuestions`, `screensOf`, `buildBlueprint`), so the plan
  a visitor approves is what the app builds. `services/sitePlan.ts` decides
  only *which* questions come before sign-up (`siteAskable`/`siteScreens`: at
  most five screens of two, required first; never the business, website,
  mailbox, sender, contact list, daily volume or design — and no "already in
  Protected Central"/"a list I have" options), and asks "who to reach" once
  (`answerOnSite` copies it to the finder's trades). Understanding is the AI's
  through `/api/site-plan.php` (`routes/sitePlan.ts`: no session, the
  operator's key, 8 an hour per connection and 600 a day site-wide, one page
  and two files; transcribe 12/300) — past those it is `no_ai` and the words
  are matched, said on screen. `setSiteIntake(true)` points `services/intake.ts`
  there.
- **The plan crosses origins in the fragment** (`/signup#plan=<base64url>`,
  never sent to a server). `capturePlan()` in main.tsx checks it field by
  field (`cleanPlan` — catalogue keys only, `validValue` answers, no foreign
  portfolio, no AI question redefining a real one) and keeps it as
  `pc_site_plan` (7 days). Nothing is stored server-side before sign-up; the
  site's progress is `pc_site_wizard` in that browser only (14 days, "Continue
  where you left off").
- **After sign-up** `SitePlanHandoff` (App.tsx, once per tab, not for client
  logins) opens `/autopilot?new=1&plan=site`; NewProject's `seed` takes the
  plan as approved, answers the mailbox "not sure yet" (`arrivalDefaults` —
  nothing sends until one is connected), asks only `stillNeeded` (required,
  no safe default) plus the business if the site skipped it, then runs the
  ordinary build by itself — the same steps, drafts and guardrails. Cancel or
  build clears the plan.
- **The funnel** (`services/funnel.ts`, `crm_funnel_events` migration 0068):
  fixed event names, a random `pc_vid` (carried to the app as `?vid=` by
  `appHref`), a catalogue solution key and phone/desktop — never anything
  typed; GPC/DNT browsers send nothing. One row per visitor, event and day.
  In-app steps (`trackKnown`) only for a browser the funnel knows, and the
  server counts `signup_completed` only for an account under two hours old
  and project steps for one under a fortnight. The owner reads it on
  Sign-ups & trials → **Website funnel** (`Agency/SiteFunnel.tsx`).
- `npm run test:siteplan` (pure) and `npm run test:sitefunnel` (self-contained:
  Gemini mock :8863, wrangler :8943, fresh D1 in `.wrangler-sitefunnel`, needs
  a `VITE_BASE=/` build) drive the owner's eight journeys at 1280 and 390,
  the funnel report, the allowance and the centred slideshows.

## Logos say only what is true (from Conventions)

**Logos say only what is true.** `shared/WorksWith.tsx` is the logo strip on
the sign-in screen and the site, in three labelled rows: *connects to* (the
code calls it — Google, Gemini, Maps, Meet, Stripe, Creem, Cloudflare,
Openprovider, the six email providers, Twilio, WordPress, Printful, the three
verifiers, Geoapify, OpenStreetMap, Companies House), *writes for* (the social
creator has its format) and *technology partners\** (the tools the owner used
to make and run the product, as the owner lists them). The third row is called
"partners" because the owner asked for the word, and carries an asterisk whose
note says what it means here — the platforms it is built and runs on, not an
endorsement or an agreement; none of those companies has one with us. A name
goes on the first two rows when the integration exists, not when it is
wanted. A partner that gets integrated moves up a row. **The public site shows
only the first two rows** (`partners={false}`); the sign-in screen keeps all
three.

## The industry microsites — /hvac, /roofing, /medical-billing

Each reads as a site of its own: `Site/Microsite.tsx` (`MicrositeLayout`) is
the only nav and footer they have — logo and "Home" go to the microsite's own
root, the menu is in-page anchors only, **no link to `/` or to another
industry**, and a real phone menu under 760px (the home page simply hides its
links there). Which site a component is on is `micrositeContext.ts`, never a
path check. `npm run test:industry` fails if a menu entry leaves the site;
`npm run test:strategycalle2e` checks every header/footer link at 1280 and 390.

- **Trades** (`Site/IndustryPage.tsx` from `Site/industries.ts`) sell the
  **growth service**, not the software plans: hero → problems → the service
  and its steps → lead-to-revenue stages (with what "estimated", "quoted",
  "invoiced" and "collected" mean — only collected counts) → the real screens
  (FeatureStage + reels.ts, a sample workspace, said so) → workflows → what it
  does / does not do → `GrowthPricing` → FAQ (`ind.faq` + `growthFaq()`) →
  "Prefer to write?" (the Custom `EnquiryForm`, `[HVAC page] …`) → closing
  call; "Start the software free" is a quiet link to `/signup?industry=<slug>`.
- **Medical billing** (`Site/MedicalBillingPage.tsx` from
  `Site/medicalBilling.ts`): its own sections, mint accent, no screens (there
  is no RCM sample to photograph), **no figure of any kind**, no "HIPAA
  compliant/certified", no testimonials; priced after an assessment.
- **Prices are `worker/src/lib/offers.ts`** — `TRADE_GROWTH_OFFER` ($300 setup,
  $87/month, 500 bps of eligible collections from qualifying jobs; ad budget and
  approved third-party expenses separate) with its approved headline, labels,
  scope, `costDisclosure`, `feeDisclosure` and worked example
  (`growthExample()`: $6,000 → $300, computed by `feeOn`), and
  `MEDICAL_BILLING_OFFER` (no figure). Never type a figure into a page;
  `test:industry` fails if one of the site components does. `feeOn()` is the
  fee arithmetic (integer cents, half-up once).
- **The written terms** are `GROWTH_TERMS` in `Site/legalText.ts`, published
  at `/growth-service-terms` (every host, signed in or not; in the sitemap)
  and linked from the price block and the trade sites' footer. Every number
  in them is `TRADE_GROWTH_OFFER.rules` (180-day window, 14 days to flag an
  existing customer, 10 days to query, net 15, 3-month minimum, 30 days'
  notice, liability capped at 3 months' fees) and `monthlyScope` (3 hours, 2
  campaigns a month). Change a number there, never in the prose.
- **One block draws the price** — `Site/GrowthOfferBlock.tsx`, no props, on the
  home page (`HomePricing`, `#pricing`) and on /hvac and /roofing
  (`GrowthPricing`). `test:strategycalle2e` compares its text on the three
  pages word for word at 1280 and 390.
- **The home page no longer shows the software plans' cards** ($49/$97/$197,
  owner's decision 2026-10-26). They remain in allowances.ts, on `/pricing`
  (titled "Software plans", reached from Plan & billing, with a note quoting
  the growth service) and on every subscription already sold. Do not put them
  back on the home page unless the owner asks.
- **Booking buttons follow the owner's switch** (`useBookingState`/`useCallLink`
  in `services/strategyCall.ts`, one `config` call per page): while bookings
  are closed, `BookCall`, the microsite nav/menu/footer and the home button
  lead to the page's own inquiry form (`writeHref`: `#talk`, `#request`, the
  home page's `#enquire`) in words that do not say "Book"; the closed booking
  page sends main-site visitors to `/#enquire`.
- **Every booking button is `strategyCallHref(site)`** (`services/strategyCall.ts`):
  `/book/strategy-call?src=<site>` plus the visit's UTM tags and click ids,
  remembered on arrival (`rememberArrival`). `BookCall` uses the microsite's
  own words (`bookLabel`).
- **The head is the Worker's**: the three paths are in `run_worker_first` and
  `lib/industryHead.ts` rewrites title, description, canonical, og: and adds
  JSON-LD (a `Service`; the trades carry the two fixed prices as Offers and the
  percentage in words; medical carries none) — only on our own hosts
  (`speaksAsUs`). `/sitemap.xml` lists all three and `/book/strategy-call`.
- **Routing**: App.tsx renders a microsite before every other tree, signed in
  or not, on our hosts and not on white-label ones.
- **`.dc p { margin: 0 }` out-ranks a single class** — a centred paragraph on
  these pages needs `.dc .x { margin: … auto }`, or it sits left.
- **Screens are the sample agency, not a trade.** Trade-specific pictures need
  an HVAC/roofing seed and recipes in `scripts/site-reels.mts`.
