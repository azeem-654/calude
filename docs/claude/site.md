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

## Unknown addresses are a 404, and each page has its own head

`worker/src/lib/publicPages.ts` (PUB-4) lists the public site's pages — the
sitemap, aliases, trade pages, `/appsumo`, `/login` and `/signup`, the
`/book/`, `/shop/`, `/p/`, `/f/` prefixes and any file. On
protectedcentral.com (only) the Worker serves each listed page with its own
title and description (`PUBLIC_HEADS`) and anything else with status 404 and
`noindex`, and the app draws `SiteNotFound` there instead of the home page.
Live's `run_worker_first` is `["/*", "!/assets/*"]` for this. A new public page
is added to `SITEMAP_PATHS` (and a head here) or it 404s. `test:publicpages`.

**The legal identity** (owner, 2026-11-11): `LEGAL_ENTITY` Protected Central,
`LEGAL_ADDRESS` Delaware, United States, `GOVERNING_LAW` Delaware and US
federal law, and `REFUND_WINDOW_DAYS` 14 — the first payment of a new in-app
subscription, once per account — in `legalText.ts`, used by the privacy page,
the terms and the refund policy.

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

## The industry microsites — /hvac, /roofing, /medical-billing, /ecommerce-management-services

**In the incubator (owner, 2026-11-18; off live since 2026-11-07).** The site
asks `featureReady` (`Site/siteFeatures.ts`: `serviceShown(slug)` — hvac and
roofing hang on `trade-services`, medical billing on `medical-billing`, the
e-commerce service on `online-shop`; `anyServiceShown()`): the four service
sites' cards in *What we offer* (`#industries`), *Managed services*
(`#services`, one card per shown service), the nav's "Services", the footer's
links, the pricing page's service note and the changelog's `servicePoints`.
On the live site (protectedcentral.com) the four paths and their aliases are a
**real 404** (`isKnownPublicPath(path, host)` in `lib/publicPages.ts`, the
not-found head, `SiteNotFound`); on the app host they still redirect home;
the sitemap leaves them and `/growth-service-terms` out. The Worker cannot
read `featureReady`, so it reads `servicesPublic(hostname)`
(`lib/industryPages.ts`), which must name the same hosts as `isRehearsal()`.
To publish one, take its name out of `REHEARSING` and add the live hosts to
`servicesPublic`.

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
  `Site/medicalBilling.ts`): its own sections, mint accent, no result figure
  of any kind, no "HIPAA compliant/certified", no testimonials. **Priced since
  2026-10-28** at $300 setup + $87/month + 5% of eligible net collections on
  claims handled under the signed agreement (`MEDICAL_BILLING_OFFER`,
  `medicalLine()`, `medicalExample()`), with the basis, exclusions, statement
  steps and "subject to legal and compliance review" beside it; the copy file
  types no figure (`test:industry`). The leakage audit "flags potential issues
  for a person to review" — never proof that money was lost.
- **E-commerce** (`/ecommerce-management-services`,
  `Site/EcommercePage.tsx` from `Site/ecommerce.ts`, 2026-10-28): the premium
  managed service *E-commerce Business Setup & Growth Management*,
  `ECOMMERCE_OFFER` $2,200/month for a written scope, no performance fee; ad
  spend, inventory, marketplace and payment fees, shipping and apps separate;
  no revenue/ROAS guarantee; **says no marketplace is connected** (the team
  works in the client's own Amazon, eBay, Walmart and Shopify accounts) —
  never add a logo or "integrated with" for them. One canonical URL;
  `/ecommerce`, `/e-commerce`, `/ecommerce-management` answer 301
  (`PAGE_ALIASES`, index.ts, `run_worker_first`). Its "See it working" is
  `INDUSTRY_DEMOS.ecommerce` (a sample store's workspace, no film). After the problems: **why practices change billing company**
  (`MED_SWITCH`, each reason paired with how we work instead — never a claim
  about a named company), six questions to ask theirs (`MED_ASK`), then the
  demo below; specialties (`MED_SPECIALTIES`) after reporting.
- **"See it working"** (`Site/IndustryDemo.tsx` from `Site/industryDemos.ts`,
  `#see-it-work`, "Demo" in each menu) on all three sites: the industry's
  problems one at a time, each a *problem* card, the *in Protected Central*
  card, then a ShotReel of the module that handles it — and above them the
  site's narrated film (`public/site/industry/<slug>/demo.mp4`, poster,
  captions; nothing loads until Play). The pictures are **not** the sample
  agency: `npx tsx scripts/industry-demos.mts` (after a `VITE_BASE=/` build)
  seeds a fresh D1 with an HVAC firm and a roofer set up as the growth
  service sets one up (the snapshot, template workflows, the Jobs & revenue
  ledger through the real API), an online store (`ind-ecom-*`, for
  `<IndustryDemo slug="ecommerce" />`: the `ecommerce` snapshot installed by
  the owner — `claim` only records the industry now — products and orders via
  commerce.php, draft campaigns and posts, template workflows, tickets raised
  through its own widget; **no marketplace, Stripe or SMS provider is
  connected and the screens say so**) and the synthetic practice in the
  owner's own workspace, then photographs `ind-*` into `public/site/reel/`
  (desktop, -sm, -m; name files to take only those) and writes
  `marketing/industry-films/focus.json`. `film` is optional: a demo without
  one (e-commerce) shows no player and `make.mts` skips it. The films are
  `npx tsx marketing/industry-films/make.mts` (Piper `en_US-ryan-high`,
  `PIPER_MODEL=`; ffmpeg) from the same steps, so page and film cannot
  disagree. Every `solved` line and note says only what its screen shows —
  check the picture before changing the words. A step whose picture has no
  recipe stops the capture.
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
- **The home page tells the five business lines apart** (owner's
  specification 2026-10-28, superseding 2026-10-26): *What we offer*
  (`#industries`: the software and the four services, no prices) → … →
  **Software pricing** (`HomePricing`, `#pricing`: the plan cards — Growth
  $97, Scale $297, Custom — from allowances.ts, Custom by strategy call or
  the `#enquire` form) → **Managed services** (`ServiceOffers`, `#services`:
  e-commerce, HVAC, roofing, medical billing, each its one-line price from
  offers.ts and a link to its own site, with the note that the software
  supports delivery and the fee pays for the work). Never one table for both.
  `GrowthOfferBlock` is now on /hvac and /roofing only.
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
- **The microsites' module sections still show the sample agency**; the
  trade- and practice-specific pictures are the "See it working" ones above.

## The module demos and the platform film (2026-11-18)

Owner: the home page shows the **current app, dark**, and each module as a
short looping demo — a pointer moving, clicking and typing — not stills.

- **`Site/clips.ts`** is the one list: per module a recording
  (`public/site/clips/<id>.webm` VP9, `.mp4` H.264 for Safari,
  `-poster.webp` a 2× still of where it ends), its module name, a caption and
  alt text. `ClipPlayer.tsx` plays them like a GIF (muted, inline, no
  controls), loads nothing until near the screen, plays only on screen with
  the tab visible, a pause button always; a chapter's clips play one after
  another with a tab per module, and a module's block under the section is a
  button that plays its own. **Reduced motion: the poster and a Play button**;
  pressed, that clip plays once. `FeatureStage` takes `clips` (home page) or
  `shots` (the microsites, still stills).
- **Recorded from the real app**: `npx tsx scripts/site-clips.mts [id…]` after
  a `VITE_BASE=/` build. It starts `site-reels.mts` with `HOLD=1` (the same
  seeded sample agency, `.example` addresses) and drives Chromium at
  1280×800, 1×, dark, through the Worker reached as `app.protectedcentral.com`
  (a host-resolver rule), so `isRehearsal()` is false and the incubator is off
  as on live. `LIVE_LOOK` also hides menu entries for the modules incubated
  on 2026-11-18 in case the checkout does not gate them yet, and the
  no-AI-key notices (the Worker has no key; live does). The pointer is the
  3D one in `scripts/clip-cursor.mts` (bevelled, lifts and tilts as it moves,
  sinks and ripples on a click, an I-beam over text), a page element
  following the real mouse; frames come from the DevTools
  screencast, motions are played back at their planned pace, waits for the
  server can be marked faster (`speed`). A clip with no recipe is skipped;
  a recipe that misses its target refuses the clip and saves `-fail.png`.
  Near-lossless masters stay in `/tmp/site-clips-master` for the film.
- **The platform film is the same recordings** (`npx tsx scripts/site-film.mts`):
  a title card, the twelve modules in `ORDER` with the module's name and
  caption beside the window (16:9) or above it (9:16, phones), an end card;
  silent, the words in the picture. It writes the files LaunchFilm already
  reads (`public/site/launch/`: HLS ladders with 4 s keyframes, a 720p MP4
  and WebM of each shape, posters). LaunchFilm lost its sound button and
  captions; "Watch from the start" restarts it with controls. The drawn
  launch film (`marketing/launch-film`) showed the shop, reputation, revenue
  and AI Shorts and is no longer on the site.
- The hero's reel, the agents section and the ownership tabs are the stills
  of `site-reels.mts`, **dark since 2026-11-18**: it now sets `crm_theme` dark,
  reaches the pages as `app.protectedcentral.com` (incubator off, as on live)
  and applies the same `LIVE_LOOK` as the clips (`scripts/live-look.mts`).
  With `AI_API_KEY` / `OPENROUTER_API_KEY` in the shell its Worker has an AI
  key, so the email-campaign demo now goes on to the AI writing the three
  emails. The platform film was not re-rendered and still ends that module
  at the brief.
- Gating on the home page besides the services: the online-shop recipe
  card, "Online shop & checkout", the cloud section's Reviews line, the
  logo strip's review and Printful roles, the comparison's shop row, the FAQ's
  shop and Shorts words, and the changelog's Jobs & revenue and Video Studio
  releases (`Release.feature`) appear only where their switch is on. **Coming
  soon** gained four small cards: Reviews, Jobs & revenue, Online shop,
  Managed services.

## The closing demonstration — AutopilotDemo

The home page's last section ("Tell it what you want. Watch it get built.")
plays `Site/AutopilotDemo.tsx` (2026-11-13, replacing a reel of the
dashboard that showed a whole page shrunk into a short, tall strip): a 16:9,
page-drawn film of AI Autopilot in five captioned steps — business details →
12-month marketing plan → workflows and their emails → posts scheduled →
replies held for your OK. It is an illustration with one example business
(said in the frame) and carries **no figures**: the results step says what
happens ("Replies arrive in your inbox"), never how many. Scenes are laid out
once at a fixed design size and scaled by one transform (640, 960 or 1200
wide, chosen by the frame's width so the text stays readable); while it
plays only classes and the pointer's transform change. The pointer's targets
are measured from the elements (`data-k`), it moves on an arc with a
minimum-jerk profile, a click waits for it to arrive, and it never jumps.
It runs only while on screen with the tab visible; reduced motion gets still
finished frames and Previous/Next. No narration: Protron's voice needs a
signed-in workspace — the captions carry it. New wording must name only real
features and stay figure-free.

## Protron, the platform film and What's new (2026-11-13)

The owner's brief: proper sections for the new features. On the home page,
after the recipes and the services strip: **Meet Protron** (`ProtronSection`, `#protron`, in the nav)
— the owner's portrait (`/protron/robot-384.webp`) in a violet ring, a
live-talk window with the plan card and Protron's coral pointer (#D97757
arrow, white edge, coral pill — drawn again here, the app's Protron files are
not imported) — then **the whole platform film** (`#platform-film`,
`Site/PlatformDemo.tsx`): Protron's live talk → AI Autopilot builds →
AI Prospecting and the daily finder → campaign and replies → booking page and
the Appointments tray → deals → a payment reminder → the morning digest and
the campaign watch. One example business (Brightside Plumbing, `.example`
addresses), "Illustration · example business" in the frame, **no figures**,
addresses "Contact checked" (never "verified"). Then **What's new**
(`WhatsNew`, `#whats-new`, six cards, a link to `/changelog`) — below the
film, not above the recipes, so Find my solution keeps its place.

- **One player for all three films**: `shared/DemoFilm.tsx` +
  `shared/demoFilm.css` (the clock, design sizes, measured `data-k` targets,
  the minimum-jerk pointer, the bar). AutopilotDemo, PlatformDemo and the
  in-app ProspectingDemo are each only their steps and scenes. Pressing the
  chip of the step that is playing restarts it (`take`).
- **Only what this host's app does**: Protron on every screen is held back to
  the testing site (`featureReady('protron-hands')`, docs/INCUBATOR.md), so the
  three sections take `agent`. Off (the live site today): Protron is the
  live talk that starts a business workspace and writes the plan ("Build My
  AI Autopilot"), the campaign watch is a notice and an email, no pointer.
  On (testing, localhost): plan → approve → it builds with its pointer, and
  offers to improve a weak campaign. Releasing Protron changes the site with
  no edit. Appointments tray, 12-month plans, AI health ("we check every AI
  tool each hour"), the security shield (only SECURITY.md §7 claims) are
  live everywhere.
- `#film` is LaunchFilm's id; the platform film is `#platform-film`.

## Customers' pages on the public site and on their own domains (2026-11-19)

Owner: a business's published pages live at **protectedcentral.com/<brand>/<page>**
(the brand alone is their home page: the page named `home`, else their first
website, else their first page), not app.protectedcentral.com/s/… The old
`/s/` addresses keep working everywhere. On the live app the publish panel and
the wizard print `protectedcentral.com/` (`pageAddressBase()`); a reseller's
host, testing and localhost keep `<host>/s/`.

- **Our pages always win**: the Worker and App.tsx try `isKnownPublicPath`
  first; only then `brandPath()` → `findBrandPage` (200 with the page's own
  head, or a real 404). `brandNameFree()` refuses a brand named like any page
  the site has on any host, and `RESERVED_BRANDS` (routes/published.ts) holds
  names the site may grow (about, blog, careers…). **A new public page must
  not collide with an existing brand** — check `crm_page_brands` first.
- **A connected address can show the website** (`crm_custom_domains.serves`
  = `site`, `site_brand`; Settings → Branding → *Visitors see*). `set_serves`
  checks the brand is the workspace's own. The Worker rewrites the served head
  with the page's title and *the customer's* canonical URL (`hostPage`,
  `rewriteHostHead`); App.tsx renders `PublicPage scope="host"` at every path
  except `/f/ /book/ /shop/ /p/`. Tested in `test:whitelabel`.
- Cloudflare side: `docs/CLOUDFLARE-SAAS-SETUP.md` (fallback origin
  `whitelabel.protectedcentral.com`, Workers route `*/*`).
