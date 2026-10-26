<!-- Moved from CLAUDE.md, word for word: read this before working on money, plans and allowances, affiliates, revenue, trials. -->

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

## Plans and allowances — one table, counted on the server

`worker/src/lib/allowances.ts` (pure, no imports; the browser re-exports it as
`services/allowances.ts`) is **the** package table: three priced plans
(`kind: 'self'` — Starter $49 / Growth $97 / Pro $197 a month, yearly at ten
months), **Custom** (`kind: 'custom'`, no price, given by hand) and `agency`
(`kind: 'legacy'`, never shown or sold, kept with what its subscribers bought),
plus the trial's numbers, for fourteen meters (projects, workflows per
project, sub-accounts, branded login addresses, AI requests, posts, articles,
AI emails, prospects found, recordings, AI Shorts, video/render minutes,
storage). Checkout (`PLAN_CENTS` from `SOLD_PLANS`, `interval: 'year'` on both
processors), `PLAN_RESELL`, the site's cards (`Site/PricingParts.tsx`: lines
from `featureLines`, **Show full details** and `/pricing`'s table from
`comparison()`), Plan & billing and the trial bar all read it — never write a
plan's number, price or feature tick anywhere else. `/pricing`
(`Site/PricingPage.tsx`, routed on every host) has the comparison (sticky
header; one plan at a time under 760px), white-label, billing answers and the
Custom form (`enquire` → `crm_enquiries`, migration 0075, read and answered on
Sign-ups & trials, where `grant_plan` gives a plan by hand).
docs/PRICING.md has the market research, costs and what white-label means.

- **The allowance is the subscriber's** (workspace owner's email), pooled over
  every workspace they own. Install owner: unlimited, still counted. Trial (and
  ended trial): `TRIAL_LIMITS`. Otherwise `crm_plans.plan_id`, Starter if none.
- **`lib/allowanceStore.ts`**: `check` (refusal by name — `fail(r.message, 402,
  refusalBody(r))`, `code: 'allowance'`, meter, used, limit, plan, upgrade),
  `record` (idempotent on `(meter, '<workspace>:<ref>')` in `crm_usage`,
  migration 0074 — key by the thing made, never by the request), `roomFor` for
  steps that make several, `readAll` for the Usage card. Count meters are
  counted from their tables; video minutes and storage from the Video Studio's
  own (`lib/video/usage.ts` takes its limits from here).
- **Any new thing that costs the operator per unit gets a meter**, checked
  before the work and recorded after it succeeds. A cron path skips and says
  why where the customer reads it; it never throws. Don't meter what the server
  cannot see being made (contacts, sends — see docs/PRICING.md).
- `/api/allowances.php`: `plans` (public), `status`/`check` (workspaceAccess),
  `set_limits` (install owner; `crm_plan_limits`, edited on Sign-ups & trials →
  Plans & allowances). Prices are not editable on a screen.
- A renewal is matched to the plan the subscriber is on before the amount
  (`soldAt`, `LEGACY_CENTS`): $97 was "Agency" (`pro`) and is now Growth;
  $149/$297/$2,970 are `agency`. A feature on every plan is listed once
  (`INCLUDED`), never as what a higher plan adds; white-label's countable part
  (`login_addresses`) is refused at `whitelabel.php add`.
- `npm run test:allowances` (pure, real SQLite with every migration via
  `node:sqlite`); `npm run test:allowancese2e` (wrangler :8991, fresh D1 in
  `.wrangler-allowances`, needs a `VITE_BASE=/` build). Seeded journeys that
  make more than a trial allows (video e2e, site reels) raise the account's
  allowance first.

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

## Lead-to-revenue and the performance fee — a fourth thing, never charged

The growth service (HVAC/roofing, `lib/offers.ts`) earns a percentage of what
a contractor collects on jobs it brought in. That is **not one of the three
pots**: nothing here touches a processor. A fee is computed, reviewed with the
contractor, approved by the install owner, and invoiced outside the app.

- **Rules are `lib/leadRevenue.ts`** (pure, the browser imports it):
  `leadVerdict`/`paymentVerdict` say why each payment counts, is *held* (will
  count later: not won, not confirmed complete, unconfirmed, disputed, closes
  after the statement) or is *left out* (contractor's own source, existing
  customer, before the agreement, outside the attribution window);
  `buildStatement` sums confirmed eligible payments not yet on an approved
  statement, less agreed exclusions (per payment) and refunds/chargebacks,
  plus a negative balance carried from the last approved statement, and takes
  `feeOn` once on the total. `callCheck` is the pre-call gate (do-not-call,
  consent, 08:00–21:00 in the called person's zone, an approved script).
- **The ledger is `routes/leadRevenue.ts`** → `/api/lead-revenue.php`, tables
  `crm_growth_terms`, `crm_growth_agreements`, `crm_rev_*` (migration 0077).
  Every change writes `crm_rev_events` (append-only, who and in which role).
- **Two parties, not interchangeable.** The contractor (`workspaceAccess`)
  alone confirms a job complete with its final amount, confirms payments,
  marks an existing customer, approves scripts/budgets/expenses, removes a
  number from do-not-call and queries a statement line. The install owner
  reaches a customer's workspace **without claiming it** (`knownWorkspace`,
  never `workspaceAccess` for them on someone else's) and records inquiries
  and calls, reports payments (they wait as `reported`), corrects attribution
  with a reason, keeps terms and agreements, and computes/sends/approves
  statements. `__agency__` is keyed by `storageWorkspace`, like `crm_data`.
- **First touch is written once** (channel, detail, time, agreement in force);
  leads are logged within a month of first contact; corrections are events.
- **Fixed by the database, not only the route**: a signed agreement's terms
  (`trg_growth_agreement_fixed`) and a payment on an approved statement
  (`trg_rev_payment_counted`). New terms are effective-dated, never backdated,
  and reach only agreements drafted after them.
- **Approval re-checks**: a statement must have been sent for review, have no
  open questions, and still compute to the same lines and fee — otherwise
  `stale`, recalculate. Approval stamps each payment's `statement_id`, so
  nothing is counted twice; corrections go on the next statement.
- **The written terms** (`/growth-service-terms`, `GROWTH_TERMS`) are the
  contract the ledger enforces; their numbers are `TRADE_GROWTH_OFFER.rules`
  and `DEFAULT_TERMS` reads its window from there. The contractor may flag an
  existing customer only until the job is won or within 14 days of the lead
  (`existingCustomerProblem`); after that it is the owner's
  `attribution_fix`, with a reason. A negative balance is carried, never paid
  out, and lapses when the agreement ends.
- No payment integration exists: `integration_verified` is a state only the
  server could set, and the screens say none is connected. No call is placed
  by the software; the national DNC registry is not connected.
- Screens: **Sales → Jobs & revenue** (`/jobs`, `Jobs/JobsRevenue.tsx`
  `Ledger`) and the owner's **Workspace → Growth service** (`/growth`,
  `Agency/GrowthService.tsx`, the same `Ledger` with owner powers).
  `npm run test:leadrevenue` (pure), `npm run test:leadrevenuee2e`
  (wrangler :8873, fresh D1, needs a `VITE_BASE=/` build), `test:security`.
