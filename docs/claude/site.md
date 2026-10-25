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

## The trade pages — /hvac and /roofing

`Site/IndustryPage.tsx` draws both from `Site/industries.ts`; the home page's
parts do the rest (FeatureStage + ShotReel over reels.ts shots, PricingSection
with an `intro`/`after`, FaqSection with `items`, the Custom `EnquiryForm` as
"Discuss your business" with `context` — the owner sees `[HVAC page] …` under
Custom plan enquiries). Order: hero → problems (each with its fix) → module
stages → workflows → how it works → what it supports / does not do → pricing →
FAQ → talk → closing call.

- **Workflows are template keys**; the card prints the template's own name,
  description and `needs`, so a dependency (SMS provider, a tag your phone
  system must apply) is never retyped and forgotten.
- **Say what it does not do**: no phone answering, no dispatch or crew
  scheduling, no field-service integration, prospecting finds *businesses*
  (never homeowners or storm paths), inbound texts are read only for STOP.
  No figures — `npm run test:industry` fails on a percentage or multiplier,
  a missing template or shot, or structured-data prices that differ from
  `PLAN_DEFS`.
- **The head is the Worker's**: `/hvac`, `/roofing` are in `run_worker_first`
  and `lib/industryHead.ts` rewrites title, description, canonical, og: and
  adds JSON-LD — only on our own hosts (`speaksAsUs`), never a reseller's
  domain or free subdomain. `lib/industryPages.ts` is the shared metadata (the
  app imports it, so it must stay free of Worker-only types). `/sitemap.xml`
  and `/robots.txt` are written by the Worker on protectedcentral.com only.
- **Routing**: App.tsx renders the page before every other tree, signed in or
  not, on our hosts and not on white-label ones — so it can be read on the
  testing site too.
- **Screens are the sample agency, not a trade.** Trade-specific pictures need
  an HVAC/roofing seed and recipes in `scripts/site-reels.mts`; until then the
  hero says the screens are a sample, not a real trade business's records.
