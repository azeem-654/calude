# Pricing and plan allowances

What Protected Central sells, what each package allows, why those numbers, and
where the market sits. Written 2026-10-14.

> **Since 2026-10-26 the public home page prices the managed growth service
> instead** — $300 setup + $87/month + 5% performance fee on eligible collected
> revenue from qualifying jobs (`worker/src/lib/offers.ts`, `docs/claude/site.md`).
> The software plans below are unchanged and still sold and billed; they are
> shown on `/pricing` but no longer as cards on the home page.

The packages live in **one file**, `worker/src/lib/allowances.ts` (`PLAN_DEFS`,
`TRIAL_LIMITS`). The server enforces them and checkout charges from them, and
the public site's price cards, Plan & billing and the AI Autopilot board's meter
strip draw them. A number changed there changes on all of them in the same
release. `npm run test:allowances` fails if they drift apart.

The install owner can change any plan's **allowances** without a release
(Workspace → Sign-ups & trials → *Plans & allowances*). **Prices** change only
in a release, because they are what customers are charged.

---

## The packages

**Three priced plans and Custom** (the owner's call, 2026-10-14). Every priced
plan starts with 7 days free, no card; yearly is ten months' price, two months
free. Custom has no price: it is asked for with the form on `/pricing`, agreed
with the customer, and given by the owner by hand.

| | **Free trial** (7 days) | **Starter** | **Growth** (most popular) | **Pro** | **Custom** |
|---|---|---|---|---|---|
| Monthly | free | **$49** | **$97** | **$197** | Let's talk |
| Yearly | — | $490 | $970 | $1,970 | agreed |
| Who it is for | trying it | one business | a growing business, or a freelancer with a few clients | an agency running AI marketing for clients, under its own brand | more than Pro, or something Pro does not do |
| AI Autopilot projects (at once) | 2 | 3 | 10 | 40 | unlimited* |
| Workflows per project | 6 | 6 | 12 | 25 | 40* |
| Client sub-accounts | 2 | 2 | 5 | 25 | unlimited* |
| Branded login addresses (white-label) | 1 | 1 | 5 | 25 | 100* |
| AI requests / month | 300 | 1,500 | 5,000 | 20,000 | 40,000* |
| Social posts by AI Autopilot / month | 20 | 60 | 200 | 800 | 2,000* |
| Blog articles by AI Autopilot / month | 3 | 8 | 30 | 120 | 300* |
| Emails written by AI Autopilot / month | 50 | 300 | 1,500 | 6,000 | 15,000* |
| Prospects found daily / month | 100 | 500 | 2,000 | 8,000 | 20,000* |
| Recordings processed (AI Video Studio) / month | 2 | 5 | 15 | 50 | 100* |
| AI Shorts / month | 10 | 30 | 100 | 400 | 1,000* |
| Video minutes uploaded / month | 90 | 300 | 900 | 3,000 | 6,000* |
| Render minutes / month | 120 | 400 | 1,200 | 4,000 | 8,000* |
| Video storage | 5 GB | 25 GB | 100 GB | 300 GB | 750 GB* |
| Support | in-app help | in-app help: chat, tickets, screen sharing | the same | in-app help, answered first | onboarding call, done-for-you setup, named contact |

\* Custom's numbers are where a Custom plan starts; the owner changes them on
Plans & allowances (the Custom column), and the site shows "Set to fit" rather
than a number. Custom also offers (`CUSTOM_OFFER`): any allowance raised,
done-for-you setup, an onboarding call and a named contact, integrations scoped
and quoted, invoiced billing on request. **These are the owner's service
commitments**, as is Pro's "answered first" — see docs/OWNER-CHECKLIST.md.

**Every plan includes** (nothing here is gated by plan, so no card lists it as
something a higher plan adds): CRM, pipelines and one inbox · funnels,
websites, forms and a shop · the booking page · white-label name, logo and
colours on every workspace · business-directory search and free email checks ·
sending from the customer's own mailbox, nothing until they approve.

The full feature-by-plan table is `comparison()` in `lib/allowances.ts`; the
site draws it on `/pricing` and in each card's **Show full details**.

### White-label — what it means here, and what each plan gets

Only what the code does (`routes/whitelabel.ts`, `routes/resell.ts`,
`routes/portal.ts`):

- **Your name, logo and colours** on your workspace and each client's — every plan.
- **Branded login addresses** (`login_addresses` meter, counted from
  `crm_custom_domains`, refused by name at `whitelabel.php add`): a free
  `yourname.protectedcentral.com`, live at once, or the customer's own domain
  with one DNS record — **only once the owner has set up Cloudflare for SaaS**
  (Platform services); until then the screen offers the subdomain alone and
  the site says the own-domain option is "offered once switched on".
- **Client sub-accounts** (`sub_accounts`) — each client's own workspace.
- **Reseller billing** — the customer's own Stripe or Creem, their own price
  per client; the money never passes through the operator. Every plan.
- **Client report links** — progress without prices or contacts. Every plan.

### Custom enquiries, and giving a plan by hand

The Custom card's button goes to the form on `/pricing#custom`, which posts
`enquire` to `/api/allowances.php` (no session; 3 an hour per address, 100 a
day in all; a hidden honeypot field). It is stored in `crm_enquiries`
(migration 0075) and emailed to the install owner when the install mailbox can
send. The owner reads it on Sign-ups & trials → Plans & allowances →
**Custom plan enquiries**, replies by email, and gives the plan under
**Give a customer a plan** (`grant_plan`: a `crm_plans` row with
`source = 'manual'`, which payments and cancellations never change).

### How the allowances work

- **Whose.** The subscriber's — the person who pays, i.e. the owner of the
  workspace. Every workspace they own (their own and each client sub-account)
  draws on one allowance. Per workspace would multiply it by the sub-account
  count, and on Custom (unlimited sub-accounts) that is an unlimited bill.
- **Count meters** (projects, workflows per project, sub-accounts) are what
  exists now; deleting one frees its place.
- **Monthly meters** reset on the 1st, 00:00 UTC, and are counted once per thing
  made, keyed by the thing (`crm_usage`, primary key `(meter, ref)`), so a
  retried step cannot count twice. Deleting something does not give the month
  back — the cost was already paid.
- **Where each is counted** (the Usage card says the same):
  - projects — `save_project` for a new project (`routes/projects.ts`)
  - workflows — `save_workflow` and the typed-instruction build
    (`routes/autopilot.ts`), a finder's workflow (`routes/finders.ts`), a
    connected search (`routes/sources.ts`)
  - AI requests — `/api/ai.php` after the AI answered, and `aiBudget()` for
    every server route that spends the AI key
  - social posts, blog articles, AI emails — an agent step
    (`lib/projectAgents.ts runAgentNode`) and AI Video Studio's repurpose
  - prospects — each one a daily finder adds to a project's audience
    (`prospectFinderTick.ts addReady`)
  - recordings — the upload completing (`routes/video.ts upload_complete`);
    asked at `create` and `upload_start` too
  - AI Shorts — each Short the first time it is sent to render
    (`lib/video/pipeline.ts queueAfterEdit`); re-renders are free
  - video minutes, render minutes, storage — the Video Studio's own
    `crm_video_usage` and R2, now with limits from the plan
- **Refusals** name the meter, the numbers, the plan and the plan that raises
  it: `{ success: false, code: 'allowance', meter, used, limit, plan, upgrade,
  resetsAt }`, HTTP 402. Scheduled work never throws: an agent step is
  *skipped* with the same sentence, a finder logs it and rests until tomorrow,
  Shorts past the month are left unrendered with a note on the project. A step
  that makes several (six posts, a 52-email campaign) makes what still fits and
  says so.
- **The install owner is never limited** (every meter reads unlimited, −1);
  their use is still counted.
- **Trials** get the trial column. An ended trial keeps the trial numbers, and
  the AI is stopped anyway (`lib/trial.ts`).
- **A paying customer** is on the plan in `crm_plans` (set by the billing
  webhook, or by hand with `source = 'manual'`). No row → Starter, as before.

### What is deliberately not metered

| Not metered | Why |
|---|---|
| Contacts | They live in the browser's synced records; the server sees a whole list at a time and there is no single moment a contact is "created" that it could refuse. A limit shown on a card that nothing enforces is a promise in the wrong direction. The old cards said "Up to 2,500 contacts" — that was removed. |
| Email sends | They go through the customer's own mailbox (or their own provider key) and cost the operator nothing. The one sending door (`lib/deliver.ts`) also carries sign-in codes, which a cap must never stop. |
| Posts and articles written by hand in the Graphics Designer & Editor / Blog | They reach the server as AI requests, and are counted there. |
| Users / seats | Nothing enforces a seat count today. |
| Email verifier credits, Lead Directory reveals, Google Maps searches | Already capped per workspace by their own fair-use budgets on the owner's keys (`BUDGET` in `lib/emailVerify.ts`, `REVEAL_BUDGET`, `placesBudget`). Folding them into plans is a later step. |

---

## Market comparison

Checked 2026-10-14 unless marked. "Official" = the vendor's own pricing page,
read that day; "third-party" = a 2026 review citing the vendor; "knowledge" =
from what was known in mid-2026, not re-checked today.

| Product | Tiers (monthly / yearly-billed per month) | What a tier allows | Source |
|---|---|---|---|
| **GoHighLevel** | Starter $97 · Unlimited $297 · Agency Pro $497 (yearly $970 / $2,970 / $4,970 a year) | Starter 3 sub-accounts; Unlimited and Agency Pro unlimited sub-accounts; contacts and users unlimited. AI (Conversation, Voice, Reviews AI) is usage-billed on top; "AI Employee" add-on $50–$97 per sub-account per month | official, gohighlevel.com/pricing |
| **HubSpot Marketing Hub** | Starter ~$20/seat · Professional ~$890/mo (3 seats) + $3,000 onboarding | Starter: 1,000 marketing contacts; Pro: 2,000 marketing contacts, extra seats $45 | third-party (instant.one, tinycommand.com 2026); HubSpot's page did not show figures to the fetcher |
| **Systeme.io** | Free · Startup $17 · Webinar $47 · Unlimited $97 (yearly: 2 months free) | 2,000 / 5,000 / 10,000 / unlimited contacts; 3 / 10 / 50 / unlimited funnels; unlimited email; no AI limits stated | official, systeme.io/pricing |
| **Kajabi** | Basic $179 ($143) · Growth $249 ($199) · Pro $499 ($399) | 5 / 50 / unlimited products; 2,500 / 25,000 / 100,000 contacts; 0 / 500 / 1,000 AI credits; extra 500 AI credits $15/mo | official, kajabi.com/pricing |
| **OpusClip** | Free · Starter $15 · Pro $29 (~$14.50 yearly) | 60 / 150 / 300 processing minutes a month (1 credit = 1 minute of source video) | third-party (castmagic.io, creatify.ai, Aug 2026) |
| **Vizard** | Free · Creator ~$29 (~$14.50–20 yearly) · Business | 60 / 600 / 600+ upload minutes a month | official page (prices not rendered) + third-party |
| **Jasper** | Pro $69/seat ($59 yearly) · Business custom | Pro: 1 seat, 2 brand voices, no API | official, jasper.ai/pricing |
| **Copy.ai** | Chat $29 ($24) · Growth $1,000 · Expansion $2,000 · Scale $3,000 | Chat: 5 seats, unlimited chat words; Growth 20K workflow credits | official, copy.ai/prices |
| **Instantly** (outreach) | Growth $47 ($37.60) · Hypergrowth $97 ($77.60) · Light Speed $358 ($286.30) | 5,000 / 125,000 / 500,000 emails a month; 1,000 / 25,000 / 100,000 contacts. Leads credits sold separately from $47 | official, instantly.ai/pricing (the page shows some conflicting figures) |
| **Smartlead** | Base $39 ($32) · Pro $94 ($78) · Unlimited Smart $174 · Prime $379 | 2,000 / 30,000 contacts; 6,000 / 90,000 / 150,000 / 500,000 emails a month | official, smartlead.ai/pricing |
| **Apollo** | Basic ~$59/user ($49) · Professional ~$99/user ($79) · Organization ~$149/user yearly, 3 seats min | credits pooled per team, reset monthly, no rollover | official page (no figures rendered) + knowledge |
| **Calendly** | Free · Standard $10/seat (yearly) · Teams $16/seat (yearly) · Enterprise from $15k/yr | unlimited event types from Standard | official, calendly.com/pricing |

### What that says about where Protected Central sits

- **Against the all-in-one CRMs** (GoHighLevel, Systeme, Kajabi) the floor is
  $17–$97 and the agency tier $297–$499. GoHighLevel's $297 Unlimited is the
  reference an agency buyer carries in their head, and it charges for AI on top.
  Three priced plans topping out at **Pro, $197 with the AI included**, and
  Custom above it, keep the self-serve ceiling under GoHighLevel's $297 while
  agencies that need more are talked to rather than priced by a table.
- **Against the point tools** a customer would otherwise stack — OpusClip Pro
  ($29) + Instantly Growth ($47) + Jasper Pro ($69) + Calendly ($10) ≈ $155 a
  month, before a CRM — Growth at **$97** replaces the stack.
- **Shorts tools sell minutes** (150–600 a month). Our trial's 90 and Starter's
  300 source minutes sit in that band; Growth's 900 is above every single-tool
  plan at its price.
- **Outreach tools sell sends**; we do not, because sends are the customer's
  own mailbox. We sell *finding and checking* prospects instead (500 to 8,000
  a month on the priced plans).

---

## What a unit costs the operator (estimates)

List prices as of 2026, in US dollars. **Estimates**: real cost depends on prompt
length, model chosen by `modelsFor`, and video length.

| Unit | Estimated cost | Basis |
|---|---|---|
| AI request | $0.002–0.003 | Gemini Flash-class: ~2k tokens in ($0.30/M), ~800 out ($2.50/M) |
| Social post (by an agent) | ~$0.001 | one call writes up to six; the image is drawn from a template, no image model |
| Blog article | ~$0.01 | one long call, ~3–4k tokens out |
| AI-written email | ~$0.001 | batches of several per call |
| Prospect found | ~$0.000–0.02 | Geoapify free credits (3,000/day, 20 businesses each), DNS checks free; a paid mailbox verification (Hunter etc.) is the $0.01–0.02 end and is capped separately |
| Recording processed (30 min) | ~$0.10–0.15 | Whisper on Workers AI $0.00051/audio min (~$0.015); preparing (proxy, waveform) on a standard container ~$0.05; analysis calls ~$0.01; storage ~3 GB × $0.015/GB-month |
| AI Short | ~$0.005 | ~45 s render at ~$0.0018/output min, thumbnails, one metadata call |
| Render minute | ~$0.0018 | container standard-1, ~1.5 min of encoding per output minute (`PRICE` in `lib/video/usage.ts`) |
| GB of video storage | $0.015 / month | R2 |

**At full use** (every allowance spent): trial ≈ $2, Starter ≈ $5, Growth ≈
$17, Pro ≈ $75 a month — against $0 / $49 / $97 / $197 — and Custom's starting
numbers ≈ $140, which is the floor a Custom price should clear,
before the processor's fee (~3% + 30¢). Nobody uses every allowance, so typical
margin is far higher; the numbers are set so that the *worst* customer is still
profitable. The Cloudflare base (Workers Paid, $5/mo) and D1 are shared by all.

---

## Plan ids, and customers who bought before these packages

`crm_plans.plan_id` keeps the ids it always had. What each is now:

| id | Sold before | Now | What its subscribers get |
|---|---|---|---|
| `starter` | "Studio", $49 | **Starter**, $49 | Starter's allowances |
| `growth` | — (new 2026-10-14) | **Growth**, $97 | Growth's allowances |
| `pro` | "Agency", $97 (12 sub-accounts) | **Pro**, $197 | Pro's allowances; a $97 renewal stays `pro` |
| `custom` | — | **Custom**, given by hand | the Custom column |
| `agency` | "Network", $149; briefly "Agency", $297 | **legacy — not sold** | what they bought: unlimited projects and sub-accounts, Custom's starting numbers for the rest, unlimited login addresses. Renewals at $149, $297 or $2,970 stay `agency` |

- Existing subscriptions keep the price they are on — the processor charges
  what was agreed at checkout. A renewal is matched to the plan the subscriber
  is already on first (`soldAt`, `LEGACY_CENTS`, `planFromEvent`), so neither a
  $97 `pro` renewal nor a $149 `agency` one is mistaken for something else.
- Checkout sells only Starter, Growth and Pro (`SOLD_PLANS`); a checkout asking
  for `custom` or `agency` is refused.
- The stored sub-account allowance (`crm_plans.resell_limit`) is unchanged.
- Everybody — old customers included — is held to their plan's allowances.

## Changing a price

Edit `monthlyCents` / `annualCents` in `PLAN_DEFS`, add the old amount to
`LEGACY_CENTS` for that plan, run `npm run test:allowances`, release. Checkout
makes the new price on the processor by itself (Stripe `price_data`, a new Creem
product per name, amount and period) — see docs/OWNER-CHECKLIST.md.
