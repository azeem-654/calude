# Protected Central

A white-label CRM and marketing platform. One React app and one API, served by a
single Cloudflare Worker.

Two hostnames, one deployment:

- **protectedcentral.com** — the marketing site. No login, no session. Every
  path renders `SiteHome`; the two ways in are links to the app host.
- **app.protectedcentral.com** — the product.

Which one you get is decided at runtime from `location.hostname`
(`src/services/hosts.ts`), not at build time.

## Before you start

`docs/OWNER-CHECKLIST.md` lists what only the owner can do — connecting Stripe,
a mailbox, an AI key, and changing the password that was handed over in a chat.
Several features are switched off until those are done, and they say so rather
than failing quietly. Read it before concluding something is broken, remind the
owner what is outstanding, and update it when one is finished.

**There is exactly one install owner: azeem@protectedcentral.com.** That is the
single `crm_users` row with `account_id IS NULL AND role = 'agency'`, and
`hasInstallOwner()` makes `bootstrap` refuse a second even if every other user
were deleted. Accounts owning their own workspaces are sub-accounts; they are
not owners and there is no route to making one.

## Architecture

```
src/           React 19 + TypeScript, built by Vite
worker/src/    the Worker: routes/, lib/, scheduled.ts
worker/migrations/   D1 schema, applied in order
wrangler.jsonc the whole deployment
```

The Worker serves the built assets *and* every `/api/*` route. Assets are
matched first; only `/api/*` reaches the fetch handler (`run_worker_first`).

**API paths end in `.php`.** They are not PHP — the backend was PHP on shared
hosting and the URLs were kept so nothing client-side had to change. Add a new
endpoint by writing `worker/src/routes/<name>.ts` and registering it in the
`ROUTES` map in `worker/src/index.ts` as `/api/<name>.php`.

A cron fires every 5 minutes, and the order in `worker/src/index.ts`
`scheduled()` is deliberate:

0. `runProspectFinders` — each project's daily finder adds prospects first,
   so Autopilot can enrol them on the same tick.
1. `runAutopilot` — plan (once a day) and execute (every tick). Enrolling
   somebody is what makes a message due, so planning after sending would make
   every lead it picks up wait a full tick.
2. `runReplies` — answering a lead is the most time-sensitive thing on a tick.
3. `runScheduledSends` — the campaign batch.
4. `runDigests` — reports on the three above, so it goes last.

Then `recordTick` writes what happened into `crm_ticks`.

**"Live in the cloud" is read from `crm_ticks`.** `/api/cloud.php` `status`
(`routes/cloud.ts`, any member of the workspace) answers the last tick's time,
`live` (under 20 minutes ago) and what the cron minds for this workspace;
`services/cloudPulse.ts` shares it between the cloud in the top bar
(`Layout/CloudBadge.tsx`, on every screen — pulsing only when live, amber when
late, grey when unreadable) and the dashboard strip (`Dashboard/CloudLive.tsx`).
The site's **Live in the cloud** section (`Site/CloudSection.tsx`) lists only
what the cron does with nobody signed in. Two things that used to wait for a
browser now run there too: a one-off email scheduled for one contact
(`runOneOffEmails` in scheduled.ts, once it is 10 minutes overdue so an open
tab sends it first; claimed `sending` by compare-and-swap) and automation
changes to a contact (`applyContactChangesInCloud`, stamping
`server_applied_at`, migration 0064 — the browser still re-applies them, so a
stale save cannot lose one). Still browser-only: merging captured leads into
Contacts, Blog Automation's month writing, onboarding content generation, and
publishing social posts (always a person's press). `npm run test:cloud`
(self-contained: SMTP sink :8858, wrangler :8928, fresh D1) covers all of it.

**A scheduled run has no request, so it has no origin.** Anything needing an
absolute URL (a Stripe return address, the link in the digest) reads
`env.APP_ORIGIN`, set in `wrangler.jsonc`. Unset, those paths report that they
were skipped rather than sending something broken.

## Autopilot — the execution layer

`worker/src/autopilotTick.ts` drives the modules; `lib/autopilotPlan.ts` decides
what to drive. The planner is pure and takes a `Workspace` snapshot, which is
why it can be tested without a database — keep it that way.

- **`effect` is its own column, not `detail`.** `detail` is what happened,
  written at the end. They were once the same column, and approving an action
  erased what it was supposed to do; the tick then did nothing and marked it
  **Done**.
- **An `observe` action has nothing to carry out.** Sending one through the
  execution pass marks it Done, which reads as though Autopilot fixed the thing
  it was warning about.
- **Dedupe is "is there an open action with this summary".** That is right for a
  standing condition and wrong for a one-off act against one record — an order
  is still unpaid tomorrow. Those markers live on the record (`chased_at`,
  `thanked_at` on `crm_orders`), stamped only after the act succeeds.
- Guardrails (`'off' | 'approval' | 'on'`) decide whether an action waits for a
  person. `'approval'` is the default for anything that sends. The wizard sets
  them from the capabilities somebody picked (`guardrailsFor` in
  `src/services/projects.ts`) and sets everything unpicked to `'off'` — a
  project must not hold a permission its owner never saw. `kind` is derived the
  same way rather than asked, because it is the server's contract, not a
  question a customer can answer.
- **`autopilotPulse.ts` is the one reader of the board on the client.** The
  dashboard panel and the nav diagram both want it at once; without the shared
  cache each mounts its own fetch and the same question is asked four times a
  minute for an answer that changes every five. It keeps `unreadable` as its own
  state — "no projects" and "could not ask" look identical in a zero, and only
  one of them means the customer has nothing set up.

## Money — three pots, and they are not interchangeable

This is the trap in this codebase most likely to cost somebody real money.

- **The operator charging their subscribers for this app.** `routes/billing.ts`,
  on the processor connected in `crm_install_providers` (kind `payments`). Falls
  back to `env.STRIPE_SECRET_KEY` for installs that predate that.
- **A subscriber charging their own buyers.** `routes/storefront.ts`, on the key
  in `crm_storefront`, per workspace. `routes/shop.ts` is the public front of
  this: `/shop/<slug>` renders with **no session at all**, so it re-earns every
  assumption the signed-in routes make — the price is read from the product row
  and never from the request, a draft shop 404s rather than rendering empty, and
  orders are rate-limited per address because anonymous callers create rows.

- **A reseller charging their own clients.** `routes/resell.ts`, on the key in
  `crm_reseller_billing` (per reseller), at the price the reseller set per client
  (`crm_reseller_clients`, read back at checkout, never taken from the request).
  Each reseller's webhook has its own address (`/api/resell-webhook.php?r=<hook_id>`)
  and may only mark that reseller's own clients paid. No affiliate commission is
  ever earned on it. `npm run test:resell` (fresh D1). The old agency billing
  modal billed clients at plan prices on the *operator's* processor and kept a
  Stripe key in the browser — that was this trap, and it is gone.

Charging a subscriber's buyer on the operator's key would deposit their trading
revenue into the operator's balance — somebody else's money, held without
agreement, and in most jurisdictions money transmission. Reach for the wrong one
and nothing will fail; it will just quietly be wrong.

Both go through `lib/payments`, which is where Stripe and Creem live. Add a
processor by adding a file there and a line in its index — never by branching at
a call site. The interface deliberately exposes what differs: Stripe is a
gateway taking most currencies; **Creem is a merchant of record, dollars and
euros only, and a checkout must name a product that already exists**, so each
account keeps one reusable product rather than creating one per sale.

**Creem's webhook signature has no timestamp.** Stripe's is refused after five
minutes; Creem's is an HMAC over the body alone and never expires, so a captured
delivery stays valid. The only thing preventing a double credit is that an order
moves only while it is still `pending`. That check is load-bearing.

Only the install owner may connect the operator's processor — it decides who
gets paid for everybody. The same reasoning decides what may be bought on the
operator's account.
Domains and mailboxes are offered managed *or* bring-your-own. Phone numbers and
supplier orders are bring-your-own only: a number carries a licensing and
porting obligation, and a supplier order makes the buyer of record liable for
the chargeback and the customs declaration.

## Sending email — one door

A mailbox sends either through **its own SMTP server** or through a
**provider's API** (Brevo, Resend, SendGrid, Mailgun, Mailjet, Postmark — the
choice on the mailbox form). Every server-side sender goes through
`lib/deliver.ts`: `canSend(mb)` for "can this workspace email", `deliver(mb,
msg)` to send, `CAN_SEND_SQL` in queries that pick workspaces. **Never call
`smtpSend` or test `mb.smtp.host` from a sender** — that is how every provider
mailbox was silently treated as "no mailbox" by the cron, Autopilot, replies,
digests, automations and sign-in codes, and why "Save & validate" asked Brevo
users for an SMTP host their form did not show. Providers live in
`lib/providerApi.ts` (`sendViaProvider`, and `verifyProvider`, which proves a
key read-only and, where the provider can say, that the From address will be
accepted). Sign-in codes and sign-up proofs use the owner's mailbox only once
it has passed validation (`out_verified_at`), so a pasted, unproved key cannot
stop every new customer at "we could not send the code".

**System email** is whatever `installMailbox` returns: the owner's chosen
mailbox (`crm_meta.system_mailbox_id`, set on the owner-only **System email**
card in Settings → Email & SMS, `routes/systemMail.ts`) if it is validated,
otherwise their first validated one — a chosen mailbox that stops working
falls back rather than silencing every code. Only mailboxes in workspaces the
install owner owns are candidates. `npm run test:systemmail` (fresh D1).

## The affiliate program — 40% of every payment, for as long as it pays

`lib/affiliate.ts` holds the rules (rate 40, 30-day hold, 14-day attribution
window); `routes/affiliate.ts` the API; `components/Affiliate` the screen
(`/affiliate`, with a **Manage program** tab for the install owner);
`/affiliate-terms` the terms (`AFFILIATE_TERMS` in legalText.ts). A link is
`<site>/?ref=<code>`; `services/referral.ts` keeps the code in `pc_ref`
(60 days, first link wins), `appHref` carries it to `/signup` and `/login`,
and after any sign-in the browser asks `attribute` — the server decides.

**A commission is written only by the billing webhook, from money that
arrived** (`recordCommission`): a `subscriptionPayment` event — Stripe
`invoice.paid` (first payment and every renewal; the subscription carries
`metadata.accountId` via `subscription_data`) or Creem `subscription.paid` —
keyed `<processor>:<event id>` so a redelivery cannot pay twice. A completed
subscription *checkout* earns nothing, because its invoice does. Nothing
moves money: the owner pays affiliates and marks rows paid. Commissions are on
the operator's subscription billing only — never on a customer's shop or a
reseller's own billing. `npm run test:affiliate` (fresh D1, `PERSIST=`) signs
real webhooks.

## Revenue by project — what a project earned, on a stated rule

`lib/revenue.ts` holds the rule and the arithmetic (pure); `routes/revenue.ts`
is `/api/revenue.php` `summary` (`days` 30 | 90 | 365, optional `currency`,
`projectId` — refused unless it is this workspace's); the screen is
Reports → **Revenue by project** (`components/Analytics/RevenueByProject.tsx`,
`/analytics?section=revenue`) and the strip on a project's Overview
(`ProjectRevenueStrip.tsx`). `npm run test:revenue` (fresh D1, port 8811,
`PERSIST=`) signs real storefront webhooks.

- **Only money that arrived counts**: orders `paid` or `fulfilled`, dated by
  `crm_orders.paid_at` — stamped once, when an order first becomes paid (the
  storefront webhook, `record_order`, `set_order_status`), never moved by a
  later fulfil or redelivery. Refunds are shown beside revenue, never in it.
- **An order belongs to at most one project**, on the first of: (a) `link` —
  the buyer came through the project's shop link `/shop/<slug>?pj=<projectId>`
  (ShopPage keeps `pj` in sessionStorage for the visit); (b) `shop` — the shop
  belongs to the project; (c) `products` — every line is a product of the same
  project. Otherwise **Unattributed**, drawn in grey, never shared out. Every
  candidate must be a project of the order's own workspace; a foreign or
  unknown `pj` is dropped silently. Shop orders are stamped at checkout
  (`project_id`, `project_via`, frozen like the price); unstamped orders (older
  ones, manual ones) are attributed when the report is read, by the same
  function.
- **Currencies are never added together** or converted. Every figure is in one
  currency (asked for, else the one with most revenue); the rest are listed.
- **Recovered by Autopilot** is an order named in a project's `chase_payment`
  effect whose `chased_at` is set (the email was accepted) and that was paid
  after it. **Won deals** come from the project's own pipeline (`projectId`),
  shown at the typed value — a deal has no currency, so it never joins revenue.

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

## Platform services — the owner's keys for everybody, in one place

Settings → **Platform services** (`components/Settings/PlatformServices.tsx`,
tab `platform`) is listed only for the install owner, and its one read,
`/api/platform.php` `status` (`routes/platform.ts`), answers 403 `not_owner`
to anybody else. It lists every install-wide service — the AI key, the Google
Maps key, the Google sign-in client, payments, system email, Openprovider,
managed buying, Cloudflare for SaaS, TURN, voice, `CREDENTIAL_WRAP_KEY` —
with its state (`ok` / `unchecked` / `error` / `off`, `optional` ones not
counted as needing attention), when it was last proved, the last error and
what it powers. **It sets nothing itself and never says a secret** (not even
a tail; Cloudflare secrets are presence only). The two purely install-wide
Google panels are embedded (`PlacesKeyPanel`, `GoogleSignInPanel` — the same
components, one implementation each); the rest open the tab that owns them.
Add a new install-wide key there when you add one.

## Prospect search — the free directory first, Google Maps on the owner's key

**The free directory is the default** (`source: 'free'`; the AI Sales Agent
sends `'auto'`, which is the same, and falls back to Google only when it found
nothing). `lib/geoapify.ts`: OpenStreetMap's businesses through **Geoapify**
on the owner's key (`crm_install_providers` kind `geoapify`, card on Platform
services, `routes/geoapify.ts` owner-only, proved on save). A trade is mapped to
Geoapify's categories by `categoriesFor` (only published keys — an unknown one
fails the request); the place is geocoded once and searched inside its own
boundary. Geoapify's terms allow storing, so searches and places are cached a
fortnight in `crm_prospect_cache`. Credits are counted per UTC day in
`crm_meta` and stop at 2,800 (free plan: 3,000) — past that, or with no key, a
refused key, an outage, or a trade with **no** Geoapify category (plumbers,
roofers: Geoapify has none), the search goes to Overpass (`searchProspects`,
singularised word), also free. Attribution comes back with every answer.
Overpass cannot search a whole state (it times out), and a place like
"Richmond, Virginia" is the area named Richmond *intersected with* Virginia —
`lib/regions.ts` knows the US states, the UK nations, the larger
Canadian/Australian provinces and a few whole countries (Australia, the UK, the
US, Canada, New Zealand, Ireland — never used to narrow a "town, country"
search, `splitPlace`) with their largest towns, so a region is
searched at its largest town (the answer's `note` says so), `expand_place`
answers without a Geoapify key, and a finder's `save` stores a region as its
towns. Common trades are matched to OSM's own tag values (`osmTagsFor`:
"real estate" → `estate_agent`), not the typed words.
**Google's terms forbid saving business names and addresses**; the Google tab
remains for customers who ask, budgeted as below. `npm run test:platform`
covers the free directory against a Geoapify mock (`GEOAPIFY_BASE`).

**Prospecting** (`/prospecting`, under Customers; `components/Prospecting`) is
the page of its own; Contacts → Find businesses is the same code
(`useProspectSearch.ts`, `ProspectParts.tsx`) in a dialog. Imports go into a
**contact list** (`crm_contact_lists`, the Contacts model, synced): deduped by
email, Google place or name + phone/website, adding existing contacts to the
list rather than copying them. A list has `kind` 'cold' | 'owned' and
`listKindOf()` calls it cold if it says so or holds any `prospect` — the
sendingPlan distinction. A list can be a campaign's audience
(`/marketing?new=campaign&list=<id>`) or an Autopilot project's
(`brief.audience.listId`, `/autopilot?new=1&list=<id>`, hand-picked lists only —
the server cannot evaluate a smart list's rules); `autopilotTick` re-reads the
list itself, enrols only its people, cold ones 20 at a time and each batch
waiting for approval whatever the guardrail. `npm run test:prospecting`
(self-contained: Geoapify mock :8838, wrangler :8908, fresh D1).

### AI Prospecting — one sentence, checked addresses

`/prospecting` is **AI Prospecting** (`components/Prospecting/AiProspecting.tsx`,
`AiParts.tsx`, `aiProspecting.css`; the judgement in `services/aiProspecting.ts`).
A sentence ("dentists in Leeds with a website") is parsed by `parseAsk` — split
at the last in/near/around, "with a website/email/phone" becomes a filter, not a
search term — and run by `useProspectSearch.ask` as a plan whose steps are real
calls, shown as they run with what they found: search, read the first 16
websites (`AUTO_READ`), free-check every address. The two boxes under the
composer carry `data-field="prospects.trade"/"prospects.place"`, so a refusal
naming either still has a box on screen. The dashboard's `ProspectingPanel`
hands a sentence over as `/prospecting?q=`.

**Two screens** (`AiStart.tsx`, `AiResults.tsx`): *New search* — the headline,
the live promise in bold, examples, the three illustrated steps, the composer
(sentence box + `prospects.trade` / `prospects.place`), the trust row, "How it
works" and "Need ideas?"; the side panel lists recent searches (trade icons,
"…" menus) and lead lists. As soon as a search starts, *Results* — the
assistant (a drawn robot whose bubble is the running step's own words), source
tabs, the search bar with a mic (`MicButton`, the Autopilot voice engine),
related trades, the progress card (ring = stages done, timeline, sources), the
step-by-step log, five **counted** figures, the table (#, category, status,
**found at**, actions, switchable columns, a per-row "…" menu drawn into the
card so the scrolling table cannot clip it), and a rail: the results' own
coordinates on a grid (no tile servers), sources scanned with what each
returned, insights computed from the rows, and a type breakdown. The side panel
becomes a drawer there. Nothing on either screen is an invented figure: no
phone "validity", no "best time to reach", no source that was not asked.

**"Live" is a property of the requests, not a label.** The page runs
`useProspectSearch({ live: true })`, which sends `fresh: true`: the directory,
register and Google searches, the website reads (`findContacts` — which reads
the raw page, so short contact pages and `mailto:` links count) and the free
address checks all skip their caches; a paid mailbox verdict is reused with its
own date. Every row carries `foundAt` (the server's `fetchedAt`), shown in the
Found column and kept on an imported contact (`customFields.foundAt`); the
website read adds `live` (did it answer) and `checkedAt`. The Contacts dialog
still takes the caches. `test:prospecting` proves a repeated search asks the
directory again.

**A recent search reopens, it is not re-run.** Each search's rows, website
reads, checks (with their dates) and step log are kept in
`crm_prospect_results` (`saveSnapshot` in prospectImport.ts, one per search in
the history, ≤ 900 KB, synced like any workspace key); clicking it in the side
panel calls `restore` and shows "saved search, found <date>" with **Search
again, live**. A Google search is never kept (Google's terms) and so is run
again. The first pass now reads **every** website (not 16), and
`findContacts` follows the home page's own contact/about links and decodes
Cloudflare-protected and entity-encoded addresses (`unmask`), four fetches a
site at most.

**The results name no supplier.** Tabs are *All businesses*, *Registered
companies*, *With ratings & reviews* (`TAB_NAME`); the rail is "What was
searched"; the step log says "Searched for …". Only the loading line names
sources (`useStage`, each line true of the tab chosen — "Searching Google
Maps" only on the Google tab), and the licences' credit stays in small type
(`Attribution`). `SOURCE_NAME` remains the provenance stamp on imports and the
Contacts dialog. Checks read **Contact verified · <date>** (a verifier said
the mailbox takes mail) or **Contact checked · <date>** (format, domain, mail
server) — never "verified" for a domain check.

**Its dark mode is its own.** The page and the dashboard panel carry
`data-noinvert` and define both palettes on `.aip, .aip-vars` (switched by
`html[data-theme="dark"]`), because the app's inverting dark mode turns the
orange gradient blue. The shared `ProspectParts` read `--pp-*` custom properties
with the old colours as fallbacks, so the Contacts dialog is unchanged.

**Email checks** (`lib/emailVerify.ts`, `/api/prospects.php` `verify` / `people`,
migration 0062). Two levels, and the screen says which answered:
- *basic* — ours, free: syntax, domain (DoH, `DOH_BASE` overridable), MX / null
  MX / A fallback, throwaway domains, role and webmail flags. Its best answer is
  **`domain_ok`, never `valid`**: a Worker cannot open port 25, so it cannot ask
  whether a mailbox exists, and calling a domain check "verified" is the
  plausible success this codebase refuses.
- *mailbox* — the owner's verifier (`crm_install_providers` kind
  `email_verifier`: Hunter, ZeroBounce or MillionVerifier; Settings → Platform
  services → **Email finder & verifier**, `routes/emailVerifier.ts`, owner-only,
  proved on the provider's free credits call). Only its "deliverable" is `valid`.
  A key fault stops the pass and is reported once; the rest keep their basic verdict.

Verdicts are cached per address across workspaces (`crm_email_checks`: a week
basic, 30 days mailbox, 6 h unknown). Each workspace has an allowance on the
owner's credits (`BUDGET`: 100 checks a day / 500 a month, 10 web searches a
day / 40 a month, `crm_verifier_usage`) and an ended trial stops it.
**With Hunter**, `people` asks Hunter's domain search for addresses it saw
published; **an address with no source page is dropped** — that is Hunter's
pattern guess, and guesses are what prospects.ts refuses. `bestAddress` imports
the first address no check said would bounce; the check, and a named person's
name and role, go onto the contact (`customFields.emailStatus`, `firstName`,
`jobTitle`). **AI Prospecting never searches LinkedIn, Apollo or bought
data** — their terms forbid exactly this. The owner's own lead files (the Lead
Directory, below) are shown *beside* a search, never mixed into its results:
`DirectoryMatches.tsx` asks the directory for the same words and place — even
when the business search failed — with addresses masked, and **See them all**
opens `/lead-directory?industry=&place=`. `npm run test:emailverify` and
`npm run test:aiprospecting` (pure); `npm run test:prospecting` drives it with
DoH and Hunter mocks (`EMAIL_VERIFIER_BASE`), in both themes.

**Sources are named for what they are, never "free"** (`SOURCE_NAME` in
services/prospects.ts): *Business directories* (`free` — Geoapify/Overpass),
*Verified business directories* (`register` — `lib/companiesHouse.ts`, UK
Companies House on the owner's key, `crm_install_providers` kind
`companies_house`, card on Platform services, `routes/companiesHouse.ts`
owner-only) and *Google Maps*. The register is searched by SIC code
(`sicFor`; a trade with none is refused on `prospects.trade`, never guessed),
`company_status=active` only, directors for the first 20 of a page; OGL data,
cached a fortnight. It holds no websites or emails and the screen says so;
an import names the first serving director (`firstName`/`jobTitle`), tags
`company register`, keeps `customFields.companyNumber`. `npm run test:register` (pure).

**Bulk and "Add to…".** *Find all emails* reads every unread website in
batches of 8 with a progress bar; *Show all email addresses* lists each
address with its own check; *Copy* leaves out the bouncing. Ticked rows get
an action bar: save to a list, or **add to an existing workflow, AI project
or email campaign** (`AddTo.tsx`) — each imports first (same `importChosen`,
same `RuleConfirm` clause-3 box), then: a workflow via `engagement.php
enrol_contacts` (`enrolInto`, active graphs of this workspace only, trigger
`manual`; suppressed addresses left out because the engine does not read the
suppression list); a project by adding to its `brief.audience` list (or
re-saving a briefed project with every target it had, since `saveProject`
resets what it is not sent); a draft campaign by pointing it at the list, a
scheduled one by `enrollInSequence` for its time (skipping suppressed and
bouncing). Imports tag the check (`emailTag`: `verified email`, `email domain
ok`, `risky email`, `email bounces`, replacing an older one). Rows say *In
Contacts* and *Do not email* (suppression list). Every animation (orb, dots,
shimmer on the cell being read or checked, scanning step, moving composer
gradient) is tied to real work and stops under reduced motion.

### The Lead Directory — the owner's own lead files

`/lead-directory` (Customers → Lead Directory, `Prospecting/LeadDirectory.tsx`)
searches people the install owner loaded from their own files;
`docs/LEAD-DIRECTORY.md` is the owner's guide (and the Leads.cm findings).
`routes/leaddir.ts` is the API; `lib/leadDir.ts` the rules (pure).

- **Its own D1 database, bound as `LEADS`** (`crmpro-leads`, staging
  `crmpro-staging-leads`): millions of rows must never fill the product's
  database, because a full D1 refuses every write. `scripts/leads-db.mjs`,
  run by both deploy workflows, finds it by name, creates it the first time
  and writes its id into that run's `wrangler.jsonc` (the committed id is a
  placeholder); if it cannot, it drops the binding and the deploy goes on —
  the directory then answers `no_database`. The schema is made on first use
  (`ensureSchema`), not by migrations. `staging:check` fails if staging is
  bound to the live directory.
- **Loading is done by the owner's browser** (`services/leadImport.ts`): a
  CSV, `.csv.gz` or ZIP (read from its central directory, ZIP64 included,
  Deflate via `DecompressionStream`) of any size is streamed from disk,
  parsed, mapped by column name (`ALIASES`) and sent 500 rows a request
  (`import_rows`). The server counts rows per file (`ld_imports.rows_seen`);
  the same file again (`fileKey`: name|size|mtime) re-reads and skips that
  many — resuming depends on every row, empty ones too, being counted, and on
  ZIP entries being read in central-directory order. Deduped by email, else
  name + domain/company (`dedupe`, unique). `ld_facets` keeps counts per
  industry/state/country/level/size as rows come and go — never a GROUP BY
  over the table.
- **"business owners", "CEOs"** typed where an industry goes are read as job
  titles and seniority (`roleTerms`) when no industry matches.
- **Customers** see nothing until the owner opens it with a statement that they
  may share the records (`settings`, `attested_at`) — vendors usually license
  lists to the buyer alone. A search must name an industry or a place (a title
  alone would scan the table); results are 50 a page by id, counted to 5,000;
  email, phone and profile are masked until `reveal`, which spends
  `REVEAL_BUDGET` (200/day, 2,000/month per workspace, `ld_reveals`, once per
  person) and stops when a trial has ended. **Removed on request**
  (`ld_removed`) stays out of later loads. Imports go to Contacts on a `cold`
  list, tagged `lead directory`.
- `npm run test:leadimport` (pure: parser, ZIP/ZIP64/gzip, mapping, resume,
  the server's rules) and `npm run test:leaddir` (self-contained: wrangler
  :8938, fresh D1 in `.wrangler-leaddir`, needs a `VITE_BASE=/` build; the
  owner loads a ZIP through the card, customers search, reveal to the limit,
  add to Contacts at 1280 and 390). Never commit a real lead file.

### Autopilot prospecting — a project finds its own prospects every day

A project can run a **finder**: kinds of business × places, searched live on a
rotation, websites read, addresses checked, and up to `per_day` new prospects
added to the project's audience list every day. Pure plan in
`worker/src/lib/finderPlan.ts` (`nextJob`: search → read → rest/exhausted;
12 searches and 150 website reads a day, 6 reads a tick, `PER_DAY_MAX` 100),
the driver in `worker/src/prospectFinderTick.ts` (2 finders a tick, on the cron
**before** `runAutopilot`, so a prospect added this tick can be enrolled on
it), the API in `routes/finders.ts` (`/api/finders.php`: `save` — with `append`
to merge a rotation —, `overview`, `set_status`, `run_step`, `expand_place`,
`record`, `removed`, `sync`; every action workspace-checked and the project
must be this workspace's). Tables in migration 0063 (`crm_prospect_finders`,
`crm_project_prospects` — unique per project and `ref`, `crm_finder_runs`,
`crm_sms_consents`). `npm run test:finder` (pure) and `npm run test:autoprospects`
(self-contained: Geoapify + DNS mock :8848, wrangler :8918, fresh D1 in
`.wrangler-autoprospects`, needs a `VITE_BASE=/` build).

- **A finder is a workflow.** `save` writes "Find new prospects daily" (schedule
  trigger → an `ai` node with `source: 'directory'`, `produces: 'prospects'`);
  `runProjectAgents` hands that node to the finder (`finderStepFor`) before any
  AI key is asked for. Switching the workflow off pauses the finder and the
  tick skips a finder whose workflow is not active. The editor does not offer
  `directory`/`prospects` (`finderOnly`, `editorChoices`) — only `save` makes one.
- **Daily searches never use Google** (paid per search, its terms forbid
  keeping results): Geoapify while today's shared credits are under 2,000,
  else Overpass; `register` uses Companies House. A rotation run to its end
  is `exhausted` and says so; adding a place or trade starts it again.
- **Contacts stay browser-owned.** The finder writes `crm_contacts` and the
  list server-side with `dataUpdate` (compare-and-swap on `updated_at`), and a
  `reconcile` pass puts back any found contact a stale browser save dropped.
  A contact the customer deletes (`pf-…` ids, `forgetFoundContacts`) is
  tombstoned `removed` and never re-added. `ProspectSync` pulls new ones into
  the browser on load and on return to the tab.
- **Screens.** A project's **Prospects** tab: its connected sources first
  (below), then, folded, the older finder (`ProjectProspects.tsx`): status,
  KPIs, 30-day chart, the rotation, latest prospects, the step log, and the
  set-up form (`finder.trades`, `finder.places`, `finder.perDay`,
  `finder.list`). The wizard asks `prospectTrades` / `prospectPlaces`
  / `prospectPerDay` / `prospectSms` when contacts are to be found, reads them
  from the sentence when it can ("sell my products to real estate agents in
  Virginia" — the *selling-to* clause is the audience, not the business, so
  `matchSolutions` drops it before scoring), offers a region's towns
  (`citiesIn`, largest first), and shows the finder's who/where with a live
  sample on the blueprint (`FinderReview`) because an answered question is
  not asked. "commercial properties in virginia" typed as a trade is split
  into trade and place (`splitTradePlace`, client and `save`). The build makes
  the cold list and the finder; the Build screen then runs its first steps in
  front of the customer (`FinderLive.tsx`, `run_step`) instead of saying
  "nobody to email yet", and Connections/Review say the contacts are **found
  by this project**. A sample that could not run says the finder retries — it
  is not shown as the project failing.
- **Booking page in the wizard.** Picking our booking page (question
  `booking` = `page`, and on the blueprint when `bookingPage` is required)
  shows `BookingSetup.tsx`: title, length, where, days, hours, a line — beside
  a preview drawn from the same `crm_schedule`, published as edited with
  `publishBookingConfig` (and again by the build), because `{{bookingLink}}`
  is only filled once a page is published.
- **Texts only after a yes.** A prospect is never texted on the strength of an
  email. `{{smsOptInLink}}` (a P.S. the wizard adds when texts were asked
  for, kept through email tailoring) is a per-contact HMAC link
  (`lib/smsConsent.ts`, install secret `sms_optin`, needs `APP_ORIGIN`) to
  `/api/sms-optin.php`: GET only shows the form (scanners), POST needs the box
  ticked and an E.164 number, rate-limited per IP. A yes records
  `crm_sms_consents`, clears that number's STOP, puts the number and the
  `sms opt-in` tag on the contact and fires `tag_added` — the wizard's "Text
  the prospects who opt in" workflow (a draft) starts on it.
  `prospectSmsBlock` gates the engine and the sequence sender: a `prospect`
  without consent for that number is skipped, by name.

### Connected searches — a tested AI Prospecting search as a project's lead source

The customer builds and tests a search in AI Prospecting, then **Connect to
AI Autopilot** (results bar, history "…" menu) — or, from a project, **Connect
Prospect Search** (Prospects tab, Workflows tab, a fresh project too). One
wizard both ways (`Prospecting/ConnectAutopilot.tsx`): project (or a new one) →
workflow name and the linked search's criteria → schedule and the target of
**verified** leads per run → verification → where leads go (CRM always; a
list, tags, an owner, an opportunity in a pipeline, and the next workflow of
the same project). Rules in `worker/src/lib/prospectSources.ts` — pure, no
imports, and imported by the browser too (`services/prospectSources.ts`), so
there is one implementation; `npm run test:sources`. API `routes/sources.ts`
(`/api/sources.php`); migration 0066. `npm run test:sourcese2e`
(self-contained: Geoapify + DNS mock :8849, wrangler :8919, fresh D1 in
`.wrangler-sources`, needs a `VITE_BASE=/` build).

- **A search definition** (`crm_search_definitions`, `ps-…`, one per
  workspace and `searchKey`) holds trade, place, source, filters, exclusions
  and a `version`. **A connection is a finder row naming it** (`search_id`)
  plus its project workflow — the existing engine runs it; nothing is copied
  into a second one. One search may feed many projects, and one project many
  searches, each with its own settings. Changing what a search finds
  (`update_search`) bumps its version and asks: **Update workflow** copies the
  criteria into the connections (`apply_search`), **Keep existing** leaves them
  on their version, and the source card says it is behind. AI Prospecting asks
  the same when the search on screen differs from a connected one.
- **Runs** (`stepFinder` when `search_id` is set): only on run days from the
  run hour **in the customer's time zone** (`runNow`, `nextRunStart`,
  `zonedTime`); counters belong to that local day; `manual_run` (Run now)
  starts today's run; the target is verified leads and the run examines as
  many candidates as that takes within `runLimits(target)`, saying so when it
  falls short. Each candidate goes through `qualify`: website, the address
  (published on its site or in the directory), the domain and mail-server
  check (`strict` asks the owner's verifier for the mailbox), **duplicates
  against the CRM and the project, the suppression list (`crm_suppression_list`,
  `crm_suppressions`) and `crm_unsubscribes`**, exclusions, and the
  confidence bar. **Confidence is a sum of checks that ran** (the points are
  listed on screen) — never a guess. A rejected candidate is kept with its
  `reject_reason` so no run examines it again; after 30 days its address,
  phone and street are cleared (`minimiseRejected`). Qualifying leads get
  `customFields.provenance` (search, source, licence, date) and `confidence`,
  then the connection's tags/owner/deal, and `enrolInto` the next workflow —
  each outcome said on the lead's line in `live`, the record the source card
  polls (the candidate being checked, check by check, then the result). A
  connection's workflow is drawn by `SourceFlow` (search → verify → duplicate →
  suppression → confidence → YES/NO), with **View Prospect Search**
  (`/prospecting?search=<id>`).
- **Plain language**: `parseSourceCommand` (pattern-read, never an AI call)
  and the `command` action — target, schedule, pause/resume, bar, next
  workflow by name, connect a search by name. Anything else is answered with
  what it can do. Every change is logged with who made it (`crm_finder_runs`,
  kind `config`).
- **Sources the owner can hold back**: `SOURCE_POLICY` says what each source
  may do (Google is never run on a schedule or kept); the owner's switch per
  source (`crm_meta.source_policy`, `lib/sourcePolicyStore.ts`, `policy`
  action: on / kept internal / off) is asked by manual search, by connecting,
  by Run now, and by the engine, which pauses a connection on a source
  switched off.

### Google Maps on the owner's key

Contacts → **Find businesses** (`components/Contacts/FindProspects.tsx`) and
the AI Sales Agent's Google source (`services/aiDiscovery.ts`) both call
`/api/prospects.php` (`routes/prospects.ts`): session + `workspaceAccess`
always, the key never from the request. `search` reads **Places API (New)**
Text Search (`searchBusinesses` in `lib/googlePlaces.ts`, `GOOGLE_PLACES_BASE`
overridable, field mask with phone/website — Google's dearer SKU) on the key
from `placesKeyFor`; on the owner's key `placesBudget` caps each workspace (20
an hour, 60 a day, 300 a month) and an ended trial is refused. Refusals by
name: `no_key` ("Prospect search needs the Google Maps key — the owner sets it
in Settings → Platform services."), `trial_ended`, `places_budget` (429), and
Google's own (`bad_key`, `api_disabled`, …, which also mark the owner's key as
refused). Each call is counted in `crm_places_usage` (migration 0058) and shown
on the owner's key card. **Nothing of a Google search is cached** — Google's
terms let a place id be kept and restrict the rest; imported contacts carry
`customFields.googlePlaceId`. `source: 'osm'` still searches OpenStreetMap
(free, keepable, cached a fortnight) as the second choice on the same screen.
The old `/api/places-search.php`, which took a key in the body, answers 410.
`npm run test:prospects` (pure mapping) and `npm run test:platform` (self-
contained: Places mock on :8833, wrangler on :8822, fresh D1, needs a
`VITE_BASE=/` build). Tests that call `wrangler d1 execute` mid-run send
`Connection: close`: the blocked event loop otherwise reuses a socket the
Worker already closed and fails as "other side closed".

## Forms ask only for what they show

A refusal about a particular box names it — `fail(msg, 200, { field:
'smtp.host' })` — and the input carries `data-field="smtp.host"`.
`services/fieldGuard.ts` checks, after any refused `/api/*.php` call, that the
named box is on screen; if not, it is a **dead end**: logged, kept on
`window.__deadEnds`, and reported to `/api/uireport.php`, which the install
owner sees under Settings → API Validation → **Screen checks**. It costs
nothing on success. `npm run test:forms` (fresh D1, like `test:google`) picks
every option of every choice on the mailbox form, validates empty and filled,
sweeps the validate buttons on the Settings tabs, and plants a dead end to
prove the guard catches one. **When you add a form or a refusal, tag both
ends, and add the form to that test.**

## Multi-tenancy — read this before touching storage

`installTenantStorage()` patches `localStorage` so every `crm_*` key is
transparently rewritten to `crm_acct_<id>_<key>` for the active workspace.

- Application code reads and writes the **plain** key (`crm_contacts`). The
  prefix is applied underneath.
- A test or script that writes a prefixed key by hand will double-prefix it.
- On the server, `workspaceAccess()` in `worker/src/lib/db.ts` decides who may
  touch a workspace. It also enforces the plan's sub-account allowance at the
  moment an unowned workspace is claimed — that is the only place a new
  workspace comes into existence server-side.

Client-side allowance checks are a courtesy. The server is the boundary.

**A browser holds one person's workspaces at a time.** `crm_subaccounts` and
`crm_active_account` are global keys, so a browser somebody signed out of kept
their workspaces in the switcher and their records on disk for whoever signed
in next — a new customer opened the app to another account's projects. Every
sign-in (`adoptSession` in services/auth.ts, which `login` now uses too) calls
`keepOnlyWorkspaces` with the ids the server says this person owns
(`workspaces` in every sign-in answer, plus `user.accountId`): every other
workspace's prefixed keys and registry entries go, and the per-person globals
too when `pc_data_owner` names somebody else. `logout` saves (`flushNow`, 3 s
at most) and then `forgetLocalWorkspaces`. On the server, an unowned workspace
that **already holds records** (`crm_data`, `crm_projects`, `crm_portfolios`)
is claimed only by the install owner or the account it was issued to
(`crm_users.account_id`) — never by whoever names it first.
`npm run test:isolation` (self-contained: wrangler :8939, fresh D1) covers both,
the top bar and the directory beside AI Prospecting.

## Secrets

Customer credentials — mailbox passwords, registrar and DNS API keys, Stripe
and supplier tokens — are encrypted at rest with an install secret
(`installSecret` + `encryptSecret` / `decryptSecret`) and **never returned to a
browser**. Endpoints report whether a secret is set, never what it is. Not even
a masked tail: a secret key's last four characters are enough to confirm a
guess, and no screen needs them to say "connected".

A blank field on save means "keep the stored one", not "clear it" — the form
shows dots and cannot send back what it was never given. And **changing a
credential clears its verified stamp**; carrying a green tick across an edit
shows a state somebody would trust and only discover at the moment it matters.

Every third-party API call is made from the Worker, never from the bundle.

## Security rules — read docs/SECURITY.md

The 2026-09-24 audit found that any signed-up account could reset the owner's
password, read another workspace's inbox, and overwrite other tenants' rows by
id. The rules that closed those holes:

- **Every workspace a request names is checked on the server.** Routes behind
  `requireSessionForSocket` also call `denyForeignWorkspace`; everything else
  uses `canAccess` / `workspaceAccess`. A session existing is not permission.
- **An upsert by id is scoped.** `ON CONFLICT(id) DO UPDATE … WHERE
  <table>.account_id = excluded.account_id`, and `foreignId()` refuses a
  foreign id. Ids are primary keys across all tenants.
- **User administration acts on the target, not the caller's role**
  (`manageable()` in routes/auth.ts). Every sign-up is an "agency".
- **Sessions are stored as `sessionKey(token)`**, never the raw token; delete
  and compare with `sessionKeys()`.
- **The browser never holds the session token.** It is an HttpOnly cookie;
  the page sends the placeholder `token: "cookie"` and `withCookieToken`
  (lib/session.ts) swaps it in for same-origin JSON requests before any route
  runs. Routes keep reading `d.token`. A GET that needs a session uses
  `bearer()`, which understands the placeholder. Tests may still send real
  tokens. A session lasts 30 days **from last use** (`userFromToken` renews
  it); the cookie outlives it on purpose. `checkSession` on the client turns
  a 401 into the sign-in screen with a reason — never treat an offline or a
  500 as signed out. `npm run test:cookies` covers sign-up, reload, reopening
  the browser, renewal and an ended session. The sign-in screen offers
  **"Continue as …"** from `pc_last_signin` (name, address and method only —
  `pc_`, not `crm_`, so the tenant patch leaves it alone); for a Google account
  it passes the address to Google as `login_hint`, which the server accepts
  only if it looks like an address. `test:google` covers it.
- **Install mail (sign-in and sign-up codes) goes only through a mailbox in a
  workspace the install owner owns** (`installMailbox` in routes/auth.ts) —
  never a customer's, whose Sent folder would then hold other people's codes.
  Password sign-up proves the address with a code before the account exists.
  `npm run test:signup` (fresh local D1) covers both.
- Record security events with `recordAuthEvent` — never a secret in `detail`.
- **AI from the browser goes through `/api/ai.php`** (`aiFetch` in
  `src/lib/gemini.ts`), never to Google directly; every server route that
  spends the AI key calls `aiBudget()` first. Models are chosen by
  `modelsFor()` from what the key lists — never hard-code a model id.
- **Install secrets are wrapped** by `CREDENTIAL_WRAP_KEY` when it is set
  (`installSecret` in lib/db.ts). Never make it regenerate on a failed
  unwrap: that would orphan every stored credential.
- Customer-facing security wording must match docs/SECURITY.md §7, and never
  anything in §8. `npm run test:security` (needs `wrangler dev`) is the
  two-tenant attack suite; extend it with every new route that takes an id.

## The top bar

`Layout/TopNav.tsx`: the shield (`LogoMark`, no name beside it — a
white-label workspace shows its own logo, or its initial on a tile), the
workspace, the pill row, the icons. **It is one line.** Its width depends on
data (a workspace name, the counts on AI Autopilot and the task badge, the
owner's extra menus), so it **measures itself** and writes `data-fit` on the
header — straight onto the element, not through React state, because each
step has to be laid out and measured in the same frame: `full`, then `tight`
(pills closer, the workspace's name hidden behind its initial), and only when
neither fits, `wrap` (the pills on a row of their own). Phones (≤900px) always
wrap. AI Autopilot and **AI Prospecting** are the two lit pills (`nav-hero`,
`nav-hero-prospect`), drawn from the owner's reference video: stacked frosted
glass tinted cyan → white → pink → peach (Prospecting led by the warm end),
the sheets as shadows underneath, a light passing over, and a milky lens
holding the AI bloom (`shared/AiBloom.tsx` — the website launcher's
`bloomSvg`, ported with per-instance gradient ids), which opens faster
(`fast`) when a project would act on the next tick. All of the movement is
behind `prefers-reduced-motion` (Settings → Profile → Animation overrules a
system that asks for less). The Customers pill is not lit while AI
Prospecting is open. The icons on the right are **one dark pill** (`.nav-corner`, the owner's
reference): a violet "+" (`QuickCreate` — a menu of screens that make things,
nothing created on its own), a hairline, outline icons, and the person's face
at the end. The face is `useMyAvatar()` (`services/userAvatar.ts`): their own
photo (Settings → Profile, `ProfilePhoto.tsx`; `/api/user-avatar.php`,
`routes/userAvatar.ts`, migration 0067 — keyed by email, bytes sniffed like a
widget photo, ≤256 px, served by a random key; `test:isolation` covers it),
otherwise an illustrated avatar drawn in the browser from their address
(DiceBear Lorelei, bundled — design CC0, code MIT — so no third party is
asked). The cloud (`CloudBadge.tsx`) is a black backlit key with the cloud lit
inside: blue when the cron ran in the last 20 minutes, amber when late, out
when unreadable; the words are kept for screen readers. The lit parts carry
`data-noinvert`, so dark mode does not turn them inside out. `test:isolation`
checks four widths as the owner, and that 1440 and up is one line.

## The dashboard

`Dashboard/Dashboard.tsx` opens on **the welcome** (`Welcome.tsx`, the owner's
references): a dark band with the greeting and the name lit, the person's face
in a sunburst ring (their photo or illustrated avatar, with "Add your photo"
until there is one), and a glass card of today's real appointments — the next
with "in 53m", the rest in time pills; a day with nothing says so. Under it
every section is a **numbered block** in `.dash-grid`: one column below
1280px, two side by side from there, `wide` blocks across the row, a dense
flow so a half block moves up beside an earlier one. A section that renders
nothing leaves an empty block, which is hidden and not numbered; the numbers
are written by the page from where the blocks landed (top to bottom, then
left to right), not from the source order. Blocks keep their own height —
stretching a block to its neighbour pulled the grids inside it apart.

## A project's workflows

`Autopilot/WorkflowCanvas.tsx` draws each workflow as fixed-size boxes and an
SVG layer of links, in the owner's reference video's look
(`workflowGlass.css`): cards of stacked frosted glass (the sheets are stepped
shadows, so the size the connectors are computed from never changes) with a
title tab naming the step's kind and holding its pen, on a dotted, softly lit
ground, joined by thin blue threads with a soft glow — a soft S inside the
gap when a link changes row, a rounded corner on a No branch (pink), branch
labels as small glass chips. The gallery's compact previews keep their plain
cards.

## Commands

```bash
npm run typecheck      # tsc -b — the one that actually checks
npm run build          # production build
npx wrangler dev --local          # real Worker + local D1 on :8787
npx wrangler d1 migrations apply crmpro --local
```

**`npx tsc --noEmit` passes vacuously.** The root `tsconfig.json` is a solution
file with only references, so a bare `--noEmit` compiles nothing and reports
success on broken code. Always use `npm run typecheck`. Check the Worker
separately with `npx tsc --noEmit -p worker/tsconfig.json`.

`VITE_BASE=/` is required for anything served from the domain root. The default
is `/calude/`, left over from GitHub Pages; a build without it produces a page
whose assets 404.

## Deploying

**Work lands on `staging`. `main` is what customers are using.**

**Push finished work to `staging` without being asked.** A session's own
branch is where it develops; once the typecheck and the relevant tests pass,
the same commits go to `staging` too (`git push origin HEAD:staging`, a
fast-forward — if it is not one, merge `origin/staging` in first), so the owner
can see them on testing.protectedcentral.com. The owner should never have to
ask for that. Promotion to `main` is the step that waits for them.

| Branch | Workflow | Worker | Database | Address |
|---|---|---|---|---|
| `staging` | `staging.yml`, on push | `crmpro-staging` | `crmpro-staging` | testing.protectedcentral.com |
| `main` | `deploy.yml`, on push | `crmpro` | `crmpro` | app.protectedcentral.com, protectedcentral.com |

Both typecheck, build, apply D1 migrations and then deploy — migrations first,
so a Worker can never reach a database that lacks a column it expects. Staging
also runs `test:moderation`, `test:prospects`, `test:domains`, `test:hosts`, `test:intake`, `test:design` and `test:autopilot` (among others); the live deploy does not,
because its job is to publish what has already been rehearsed.

`main` is only ever moved by **Actions → Promote testing to live**, which
fast-forwards it to `staging` after you type `PROMOTE` and then **starts
`deploy.yml` on `main` itself**. It has to: a push made with the workflow's own
token cannot start other workflows, so the push alone would move `main` and
never deploy it. Check the Deploy to Cloudflare run, not the promote run, to
know it is live. It refuses if `main`
has commits `staging` does not, rather than discarding them. Pushing straight
to `main` still works and still deploys — it is for a hotfix, and the next
promotion will refuse until you have merged it back into `staging`.

`src/services/hosts.ts` is what makes one build serve both: `isStagingHost()`
draws the testing banner and `isRehearsal()` decides which features in
`src/services/features.ts` are switched on. Nothing is baked in at build time,
so a production bundle cannot be published believing it is staging.

**A Worker has more addresses than the one you gave it.** Cloudflare turns on
`<name>.<account>.workers.dev` and a preview wildcard by default, and both are
public. Matching only the custom domain left the testing copy reachable with no
warning bar and the marketing pitch at its root, so `isStagingHost()` matches
the staging Worker's name on `.workers.dev` too — by name, so the live Worker's
own preview URL is never mislabelled. `npm run test:hosts` covers all of it.

**The two environments must never share a database.** `npm run staging:check`
asks wrangler what it actually resolved and fails if they do; the staging
workflow runs it before it builds anything. A staging Worker bound to `crmpro`
would send real mail to real customers and look completely normal doing it.

Do not deploy by hand. The repository secrets `CLOUDFLARE_API_TOKEN` and
`CLOUDFLARE_ACCOUNT_ID` are set and the pipeline is green.

## What a new project decides, and where

The wizard is `src/components/Autopilot/NewProject.tsx`: **describe → understand
→ only the questions still missing → blueprint (editable by sentence or voice)
→ connections → review → build**. `docs/AUTOPILOT-NEW-PROJECT.md` has the audit
of the fixed six-step wizard it replaced and why that one asked every project
about mailboxes. The judgement lives in pure modules:

- **`services/projectSolutions.ts`** — the solution catalogue (Social Media
  Growth, E-commerce Store, …), one shared **question bank**, and a `build` per
  solution that turns answers into workflows. **Every workflow it draws must be
  one the engine runs today** — agent graphs (`projectAgents.ts`) or contact
  graphs (`automationEngine.ts`). Anything asked for beyond that goes in
  `manual` or `limits`, never into a workflow that quietly does nothing.
- **`services/projectIntake.ts`** — matching a sentence to solutions,
  extracting what the prompt/files/workspace already answer, choosing the open
  questions, building the blueprint, and `parseEdit` for the commonest blueprint
  edits. The blueprint is a pure function of `IntakeState`; an edit — by the AI
  (`/api/intake.php` `refine`) or by `parseEdit` — changes the *answers* and the
  blueprint is rebuilt. Never let an edit write workflows directly.
  `npm run test:intake` covers the seven specified requests.
- **`worker/src/routes/intake.ts`** — `understand` (prompt + inline images/PDFs
  + up to three pages, on the operator's Gemini key), `refine`, `transcribe`.
  With no AI it answers `code: 'no_ai'` and the wizard says it matched words
  instead. Everything the model returns is checked against the catalogue the
  client sent.
- **`services/sendingPlan.ts`** — how much infrastructure a target needs, and
  what it might return. **`listKind` is the distinction everything turns on:**
  writing to people who asked to hear from you is one address on the domain they
  recognise, and writing to strangers is a pool of lookalikes. Recommending a
  pool to a shop would be selling it twenty-odd domains it does not need.
  Outcomes are ranges, always, and labelled as assumptions.
- **`services/launchPlan.ts`** — the build order per trade, still used where a
  trade is known; the new wizard's set-up steps become `launchSteps` the same way.

**`crm_projects.brief`** holds the approved blueprint and is shown on the
project's Overview. The server reads two fields of it. **`plannerChannels`**,
which `planNext` uses to drop plays in other channels — every play carries
`channels`. `null` (every project older than the brief) plans exactly as
before; `[]` means the project's own workflows do all the work. A project built
from the wizard is `general` far more often now, so without this a social-only
project would be planned email sequences and a "no mailbox" error. And
**`design.page`**, the layout and colours the planner's website and funnel plays
build in (`pageDesignOf` in `lib/designLayouts.ts`); absent, pages come out as
they always did.

**Design** — `services/designOptions.ts` is the catalogue (layouts per kind,
themes, `resolveTheme`); `lib/designLayouts.ts` on the Worker draws it (posts,
pages, email frames, article shapes). Design questions are not in any solution's
list: `designQuestions` adds them from the workflows the answers would build, so
a layout is only asked for something the project makes. Themes are resolved to
colours on the client and sent as colours — one palette table — and the text
colour is always computed from the background. `npm run test:design` fails if
the client offers a layout the server cannot draw. The logo lives on the
portfolio (`profile.logoUrl`, a ≤320px PNG made in the browser); posts and
emails carry a **signed** `/api/logo.php` address instead of the data URL.

**Pages start from a real template.** When a project builds pages,
`designQuestions` adds `pageTemplate`: a gallery of the Websites/Funnels
catalogue (`shared/pageTemplates.ts`) rendered by the builders' own renderer in
the client's name and theme colour (`buildTemplatePages(meta, ctx, { brand:
true })`). The pick is built by the wizard as a draft through `addWebsite` /
`addFunnel`; the planner only builds a page for a workspace with none, so it
does not add a second. `ai` falls back to the `pageLayout` question and the
planner's page. The blueprint shows `ResultPreview` — posts, the page, the
first email's opening — drawn from what the wizard knows, no AI call, and
labelled as a preview. T9 in `test:wizard` covers it.

The build (`newProject/buildRunner.ts`) performs real operations and the bar is
their weighted share. Content-agent workflows (scheduled, only `ai` steps,
nothing that sends) are switched on because the customer approved a blueprint
saying they run; anything that emails or texts stays a draft.

**Voice** is `components/Autopilot/voice/`: the browser recogniser for a live
preview only (told the customer's real locale, restarted across pauses), and a
16 kHz WAV of the whole take sent to `transcribe` for the text that goes in the
box. The text is always put in the box for review — never submitted.

The launch plan is **sent** with `saveProject` rather than recomputed on the
server, and becomes the checklist on the project's first card — so the board
cannot say something the screen the customer agreed to did not. Two
implementations of that list would drift the first time either changed.

**The AI key is the operator's — and there may be several.** `loadAiKey` tries the workspace's own key, then
the install's, then `env.AI_API_KEY`. The install's keys are a pool
(`lib/aiPool.ts`): the installation key, the owner's main key (the **Main AI key** card on Platform
services, `AiEngineCard.tsx` — no longer a Settings tab: customers are never asked
for a key), then the
owner's backups (Settings → Platform services → **AI keys**, `routes/aikeys.ts`,
table `crm_ai_keys`, migration 0059), then `AI_API_KEY`. `loadAiKey` returns the
first and files the rest under it; `askGemini*`, `researchWeb` and `/api/ai.php`
go through `withFailover`, which retries the same request on the next key when
the failure is the key's (429, 401/403, invalid/blocked/disabled key, 5xx, no
answer) and not when it is the request's (a plain 400). A failed key rests
(`crm_ai_key_health.cooldown_until`: 2 min rate limit, 1 h daily quota, 30 min
refusal) and goes to the back. Any new direct Gemini call must go through
`withFailover` too, or it skips the pool. `npm run test:aikeys` (self-contained:
Gemini mock on :8833 via `GEMINI_BASE`, wrangler :8822, fresh D1). Customers are not asked for one, and the
capability `needs` strings stopped mentioning it in the same commit that added
the fallback — removing the ask before supplying the thing would have been a
promise the product could not keep.

## Support — the help button, tickets and live help

Protected Central answers its own customers with its own Customer Engagement
module; there is no second support system. The round button in the app's
corner (`shared/HelpLauncher.tsx`) is `public/widget.js` pointed at the install
owner's widget marked `in_app` (`engage.php` `house`; a tenant ticking the same
box is ignored). The widget draws whatever its `features` name — chat, ticket
(raise and check), meeting, **screen**.

**Live help** is screen sharing over WebRTC: the picture goes browser to
browser, and `crm_live_sessions` holds only the handshake (one SDP each way,
exchanged whole — no trickle) and who/when. Public side is `engage.php
live_*` (proved by `share_key`), business side `engagement.php live_*`
(workspace-checked; first `live_answer` wins in one UPDATE). ICE servers come
from `lib/liveHelp.ts` — STUN, plus Cloudflare TURN when `TURN_KEY_ID` /
`TURN_KEY_API_TOKEN` are set. `live_meet` is the fallback: a Google Meet made
now from the workspace's connected calendar. On this install's own origin the
widget sends the cookie placeholder, so a signed-in customer's request is
stamped `verified_email` from their session — never from the body. Viewing
only; nobody can click on the customer's machine, and the screens say so.
`npm run test:livehelp` drives two real browsers through a session.

**Chat is live both ways, by id and by cursor.** The widget polls `engage.php
poll` whenever a conversation exists (3 s open, 12 s closed, 30 s hidden,
stopped after 30 min idle) with the server's `cursor`; the inbox polls
`engagement.php inbox_sync` every 4 s while visible. Both re-read a 10 s
overlap and de-duplicate by message id — never count messages. Every message
bumps `crm_conversations.updated_at`; `last_visitor_at` / `agent_seen_at` make
"unread", and `needs_human_since` (set when a visitor is left waiting for a
person, cleared by a person's reply or "give back to AI") feeds the
dashboard's **Waiting for support** card and the nav badge (`support_waiting`,
shared through `services/supportPulse.ts`). **Pictures** in a chat
(`lib/chatFiles.ts`, table `crm_chat_files`, migration 0060) are held in D1
because there is no R2 binding: images only, sniffed from the bytes, ≤ 1.5 MB
after the browser shrinks them, rate-limited per conversation, served only to
a POST (visitor: conversation + key, never on an internal note; business:
workspace) with `nosniff` and a sandbox CSP. A picture never goes to the
assistant, which cannot see it — it marks the conversation as waiting for a
person. `npm run test:chatlive` (fresh D1, `BASE`/`PERSIST`).

**"Call us now"** (widget feature `voice`) is the same session with a
microphone and no screen: `crm_live_sessions.kind = 'voice'` (migration 0061).
It is a browser call — never call it a phone call. It rings for
`RING_SECONDS` (75, `lib/liveHelp.ts`): `live_poll` ends it as `expired` after
that and records `live.missed` (emailed), and `live_answer` refuses a rung-out
call even before any poll has closed it. `live_decline` ends it as `declined`.
Both caller screens then offer chat/ticket instead. The business is rung by
`LiveAlert` in `shared/HelpLauncher.tsx` (polls `live_waiting` every 5 s, only
while the page is visible) wherever they are; Answer goes to
`/engagement?tab=live&answer=<id>`, which joins it once. That poll also writes
`crm_live_presence` (≤ once a minute), which is the widget's `online` — `null`
for a widget offering neither call nor screen, so it claims nothing. Both ends
have the same sound controls (mute, told to the other side over the data
channel; volume; microphone via `replaceTrack`; speaker via `setSinkId`, not
drawn where unsupported; who is talking from `getStats` audio levels) —
`widget.js` `audioPanel`, `Engagement/LiveAudio.tsx`.

The widget's launcher reads "Help" (with a green dot only when `online`) and
opens a home panel listing exactly the enabled features (`homeOptions`: "Start
an online call", "Share your screen with us", "Live chat", "Submit a ticket"),
also read by the marketing-site teaser (`data-pc-teaser`, ≥720px wide): a
see-through frosted card above the launcher on **every page load** (closing it
hides it for that page only — nothing about a dismissal is remembered), back
when the widget is closed, its rows sliding in, the first icon breathing and
each icon in a small loop of its own — none of it under reduced motion.
The launcher itself has two looks: on the site (`data-pc-teaser`) the owner's
reference design — a pill of stacked frosted glass (five coloured sheet edges
underneath, cyan → white → orchid tint, dark text) with a milky glass lens
holding a drawn bloom (`bloomSvg`: violet petals behind magenta ones round a
glowing heart, each petal opening a beat after its neighbour, the two rings
turning slowly against each other); the tint drifts, a light passes over, the
pill floats, and the blur deepens while the page scrolls. In
the app it is plain and still, because a button moving in the corner all day
is an annoyance; `ProtectedCentralChat.appMode()` switches a widget loaded
signed out (the card goes too), and HelpLauncher calls it whenever somebody
is signed in. `CornerHelp` names the same options. The owner's photo and name are
per widget (`agent_name`; the photo via `engagement.php widget_avatar`,
checked by magic bytes, PNG/JPEG ≤256px, served at
`/api/widget-avatar.php?k=<random key>`, `lib/widgetAvatar.ts`) and reach the
public config as `agentName` / `agentAvatar` / `businessName`.
`npm run test:voicecall` (same arguments as `test:livehelp`, plus `PERSIST=`).

## Phone apps — two Capacitor shells around the live site

`mobile/` holds **Protected Central** (`customer/`, `com.protectedcentral.app`)
and **PC Support** (`support/`, `com.protectedcentral.support`), Android and
iPhone each; `mobile/README.md` for developers, `docs/MOBILE-APPS.md` for the
owner's store steps. Both load app.protectedcentral.com (`server.url`), so a
web release is in the apps at once and the cookie session stays same-origin.
They append `ProtectedCentralApp/1.0 (<customer|support>; <android|ios>[; push])`
to the user agent; `services/nativeApp.ts` reads it and **hides plan purchases**
(`canBuyPlans` — Apple 3.1.1 / Play billing), **hides Google sign-in** (Google
refuses web-view OAuth), and `shared/NativeBridge.tsx` registers for push and
opens the support app on the inbox. Never call the push plugin without
`; push`: Android's crashes the app without `google-services.json`
(`build.sh` adds the flag only when the file is there).
**Push** (`lib/push.ts`, `/api/push.php`, `crm_push_devices`, migration 0065):
iPhone straight to APNs (`APNS_KEY`/`APNS_KEY_ID`/`APNS_TEAM_ID`), Android via
FCM (`FCM_SERVICE_ACCOUNT`); calls, screen shares, escalated chats and tickets
from `recordEvent`, a visitor's message on a human-held chat from `engage.ts`
(one per two minutes per conversation); off and said so on Platform services
until the secrets are set. Native changes live in `mobile/native.mjs`
(idempotent — re-run after `npx cap add`); builds in
`.github/workflows/mobile.yml` (Android signed from `ANDROID_KEYSTORE_*`;
iPhone compiled unsigned, or archived and uploaded to TestFlight with the App
Store Connect key). Keys never enter the repository. `npm run test:push`
(pure, real signatures against mocks), `npm run test:nativeapp` (fresh D1).

## Trials, sign-ups and keeping trial customers

**Every sign-up is on a 7-day trial, no card** (`worker/src/lib/trial.ts`).
`crm_users.trial_ends_at` is stamped where an account is created (password
sign-up and `completeSignIn`); NULL means the account predates trials and is
never ended. A client login follows the agency that owns its workspace. The
install owner, a paid workspace (`active`/`trialing` billing status) or a
`crm_plans` row that is not `default` is never on trial. **What ending it stops
is the operator's money**: `loadAiKey` stops falling back to the operator's AI
key, and `aiBudget` / `trialRefusal` say why by name (`/api/ai.php` answers 402
`trial_ended`). The customer's data, mailbox and own AI key are untouched, and
the app shows `TrialBar`'s plan screen everywhere but Plan & billing and
Settings (export). Do not add a trial on the processor's price as well.

Sign-up opens on **Google, then one email box and an instant code**; the
password form is one link away — or is the form, when `status` answers
`codes: false` (no validated owner mailbox, so no code could be sent). The code email carries a "Sign in instantly"
link to `/login?email&code`, which fills the boxes and waits for **one press** —
never auto-submits, because mail scanners open links and would spend the code.

The install owner's **Sign-ups & trials** screen (`/signups`,
`routes/customers.ts`) lists every customer with their trial, last visit and
coarse signals (project made, mailbox connected, asked for help), and sends
messages that appear in the corner of the customer's app (`crm_notices`) and,
if the owner's mailbox is validated, by email. Links in them are https only —
they render inside somebody else's session. The kickoff-call link and the
automatic welcome are set there too.

**Days 1, 3 and 5, and the owner's digest** (`lib/trialMail.ts`, on the cron
after the customers' digests). A trial customer with **no project yet** gets
one email on each of those days from the install mailbox, replies to the
owner; making a project, paying or the signed opt-out (`/api/trial-optout.php`
— GET shows a button, POST acts, because scanners follow links) stops them.
Someone who first qualifies late gets only the latest due email and the
overtaken days are written `skipped`. A step is `sent` only after the server
accepted it; `failed` is retried hourly, three times. The owner's digest goes
once a day at their chosen local hour and says nothing on a day with nothing
in it. The pass gates itself to every 30 minutes (`crm_meta.trial_nudges_at`)
— null it to test, and fire the cron as below.

`shared/CornerHelp.tsx` **offers** help rather than waiting to be asked: when
something fails on a screen (`signalTrouble` in `services/fieldGuard.ts` — a
5xx, a dead end, a crash) and, during a trial, after 75 visible seconds on one
screen, once per screen per day. It offers only what works: chat and screen
sharing if the house widget has them (`ProtectedCentralChat.features()`), a call
if a kickoff link is set.

## Verifying a change

The app is a single-page product with a lot of state; a typecheck proves very
little about it. Chromium and Playwright are installed:

```js
import pw from '/opt/node22/lib/node_modules/playwright/index.js';
```

Build with `VITE_BASE=/`, run `npx wrangler dev --local`, then drive
`http://localhost:8787` — the same Worker and a real D1, so the API is exercised
too. Worth checking on every UI change: 390px and 1280px, horizontal overflow of
the document, and `pageerror`. For the public site, `npm run test:sitefit`
drives fourteen window sizes (a 1340×590 laptop, 4K, tablets, phones upright
and on their side) and fails if the hero's picture or the launch film does not
fit on the screen — size things on the site by the window's height as well as
its width.

**The site's pictures are the running app.** `npx tsx scripts/site-reels.mts
[file…]` (after a `VITE_BASE=/` build) starts its own wrangler (:8797, fresh D1
in `.wrangler-reels`) and a mock directory, DNS and mailbox verifier (:8857), seeds
a busy sample agency (`site-seed.mjs` + `demo-world.mjs`: five clients in five
trades, branching five-column workflows, 30 days of a daily finder, 72 contacts
across 25 industries, all on `.example`), and photographs every shot in
`src/components/Site/reels.ts` **three ways**, each the page from the window
down: the desktop in a 1920×1200 window, 1.5× (`<file>.webp`, 2000 wide, and
`<file>-sm.webp`, 1200), and the app's own phone layout in a 390×720 window,
3× (`<file>-m.webp`, 1000 wide). `PHONE_ONLY=1` retakes just the phone ones. A
shot with no recipe stops the run.

**Readable at every size** (ShotReel): every reel is a strip — the screen
showing drawn whole in the middle, its neighbours dimmed beside it, the strip
sliding along. Each picture is the **whole page** from where its recipe left
it scrolled (up to 3,000 CSS px on a desktop, 2,160 on a phone; panes that
scroll on their own are let out first), and each slide is a **tour**: the
window as it opens, then zoomed to a readable size (`planFor`: the app's text
at about 11px, centred across on `focus`), then travelled down to the bottom
of the page at a reading pace, then back out and on — so a slide lasts as long
as its page takes to read. A phone gets the app's own phone layout as wide as
the column (the hero too) and the same travel without the zoom. While it
travels, the shot's `notes` (NOTES in reels.ts — how it works, what it brings
in, only what the screen shows) come up one at a time over it. **It plays
with reduced motion asked for too** — on many machines a battery saver sets
that, and the owner read a still reel as "the zoom is not working" — with the
zoom and the way back as a fade, and a pause button on every reel. **Full
size** (and a click on the slide) opens the whole page to scroll, portalled to
`<body>`. The product sections are `FeatureStage`
(title on top, the wide strip, feature blocks under it with looping icons,
event chips floating beside the screens at ≥1380px); the launch film is
re-rendered from `marketing/launch-film` (its README has the kit and the
honesty table).

Recurring traps when writing those checks:

- Scope locators to the dialog. The nav behind an overlay has buttons whose
  names collide with the ones inside it.
- `loadOnboarding()` ignores any stored state without `version: 1`. Seeded test
  fixtures need it.
- To seed a signed-in session, write `crm_session` (a `{token, user, backend}`
  object), `crm_active_account` **and `crm_subaccounts` containing a row whose
  `id` is that account**. All three are in `GLOBAL_KEYS`, so they are *not*
  workspace-prefixed; writing a prefixed copy by hand gets you a logged-out page.
  Omit `crm_subaccounts` and `ensureDefaultAccount()` sees no workspace, invents
  `acct-<timestamp>` and overwrites the id you just set — every API call then
  answers 403 and the screen looks like a server fault. Real sign-in is immune:
  `login()` writes the server's id *after* that has already run.

**There is one end-to-end check, and it is worth running.** `npm run smoke`
signs up, fills the portfolio, throws the browser away, signs back in on a
clean one and asserts the workspace came back. That is the path that broke
twice, invisibly to `tsc`, and stayed broken in production for weeks. It needs
a built bundle and a running `wrangler dev`; it is deliberately not in the
deploy workflow, because it needs a browser and would roughly triple it.

**Scheduled work is testable.** Run `wrangler dev --local --test-scheduled` and
fire the cron with `curl http://127.0.0.1:8787/cdn-cgi/handler/scheduled`. To
re-plan on demand, null `crm_autopilot.last_planned_at` — the planner is
otherwise once a day and you will see nothing.

**Motion is a preference, not a constant.** Every moving part is gated on
`prefers-reduced-motion`, and `src/services/motion.ts` lets somebody overrule
their system for this browser — it rewrites the media *conditions* through the
CSSOM rather than unwrapping sixteen `@media` blocks, so specificity and the
cascade stay exactly as written. A `MutationObserver` re-applies it when Vite
injects the next component's CSS, which is most of it. `test/motion.e2e.mjs`
drives a real browser with `reducedMotion: 'reduce'`; asserting the dashboard is
*completely* still is what found two animations written inline in JSX, which no
media query could reach.

**Test the failure, not just the success.** Point a mailbox at a local SMTP sink
and check that a send that fails is reported as failed and leaves its marker
unset, so it retries. A pass that only proves the happy path proves the one case
that was never in doubt.

## Conventions

Comments explain **why**, not what — the decision, the alternative rejected, and
what breaks without it. Match the density of the file you are editing.

Nothing pretends to work. A provider that is not connected says so; a DNS lookup
that could not run reports that rather than declaring the records missing; a
partial failure is reported as partial. Plausible success with nothing behind it
is worse than no feature, because the customer finds out when their mail
bounces.

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

Generated records carry a `source` stamp (`src/types/provenance.ts`) naming what
created them, so a list full of generated rows can still be traced back.
