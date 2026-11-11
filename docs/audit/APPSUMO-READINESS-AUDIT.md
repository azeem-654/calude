# Protected Central — independent AppSumo readiness audit

**Date:** 10–11 November 2026.
**Scope:** the code on the branch `claude/gohighlevel-app-testing-5sNjJ`, the live public site (read only), and the app driven on a local Worker with a fresh, empty database.
**Method:** code reading, the project's own test suites, and a real browser.
**What was not done:** no production data was read or changed, nothing was sent to a real recipient, and nothing was bought or refunded. No load was put on production. No production code was modified by this audit.

The implementation backlog for the next engineer is in `docs/audit/OPUS-HANDOFF.md`. It stands on its own.

## How to read this report

- **Confirmed** means the defect was traced through the code path a request really takes, or reproduced in a browser or against a provider. **Suspected** means the code points at it, but proof needs something this audit could not do. Each finding says which.
- **Severity:** P0 is customer data exposure, cross-tenant access, auth bypass or payment corruption. P1 is a core feature broken, billing or entitlements wrong, or a seriously misleading result. P2 is a significant limitation or an incomplete error path. P3 is cosmetic or minor.
- The code review of money, email, SMS, domains, auth, tenancy, automation and web security was split across two independent reviewers working only from the code. The author checked their P0 and P1 claims at the cited lines. The notes "verified" and "reviewer" say which ones were re-checked.
- The author of this report also wrote the AI Video Studio changes of 10 November (Shorts framing, the Shorts wizard and thumbnail themes). For that module, this audit's view is not independent, and it says so where it matters.

---

## Deliverable A — Executive readiness assessment

### Overall

Protected Central is a large product: 52 app routes, 68 server route files and about 90 test suites. A great deal of it is real, working software. The foundations are better than most products at this stage:

- Tenant scoping is applied consistently.
- Sessions are HttpOnly cookies.
- Secrets are encrypted at rest.
- Webhooks are signed and replay-protected.
- There is a meter-based allowance table, and an AppSumo redemption flow with stacking tiers.
- Owner-only controls exist.

All 44 pure unit suites pass, the 205-check security suite passes, and the live public site renders cleanly at 1280 and 390 with no console errors.

**It is not ready for marketplace submission as it stands.**

- **Two P0 defects.** Anyone signed in can buy the top plan for about 1% of its price. A tenant on hosted mail can send as another tenant's domain through the operator's sending account.
- **About a dozen P1 defects** in billing, consent, tenancy and features advertised on the home page.
- **Public pages** state figures and capabilities that the product does not back up.
- **Legal pages** do not yet suit a lifetime-deal marketplace.

None of this needs re-architecture. Each item is a bounded fix with a clear test. A focused remediation pass, followed by the regression list in the handoff, would put the product in a defensible position for review.

### Critical risks (P0)

| ID | Risk |
|---|---|
| M-1 | Subscription currency is taken from the request. Scale ($297/month) can be bought for 29,700 VND, about $1.20, and renews that way. |
| E-1 | A hosted-mail tenant can send as any address on another tenant's verified hosted domain, signed by the operator's Resend or Brevo account. |

### Major blockers (P1)

- **M-2:** a request-supplied price id is honoured at checkout.
- **M-3:** an abandoned checkout flips an active subscriber to "past due".
- **M-4:** delayed payments are treated as paid. Domains are registered and orders fulfilled before the money arrives.
- **D-1:** the setup checkout charges for no mailboxes but creates all of them.
- **D-2:** managed domains and mailboxes are bought with the operator's money and never billed.
- **E-2:** scheduled marketing email ignores unsubscribes and carries no unsubscribe link.
- **T-1:** the reserved `__agency__` workspace is one bucket shared by every agency.
- **A-1:** an agency can pre-register a stranger's address so their later sign-up lands in the agency's workspace.
- **T-2:** a tenant can claim another tenant's SMS number and silently drop its STOP replies.
- **C-1:** WordPress publishing in Blog Automation never works.
- **AI-1:** Quick Shorts' file analysis fails for every customer who has not pasted a personal Gemini key.
- **PUB-1:** the terms make refunds discretionary, and there is no refund page. PUB-2, a missing legal entity and governing law, is P2.

### Most important improvements, in order

1. **Fix the two P0s and the billing P1s:** M-1, M-2, M-3, M-4, D-1, D-2. This is money that can be lost silently.
2. **Fix consent and identity:** E-2 (unsubscribe), T-2 and S-1 (SMS opt-outs), A-1 (client pre-registration) and W-1/W-2 (login CSRF, token returned to script).
3. **Close the shared reserved workspace (T-1)**, and extend the security suite to the 23 routes it does not cover.
4. **Make the public site true:** sample figures labelled, unproven claims removed, and refund, legal-entity and AppSumo terms decided by the owner.
5. **Repair the advertised features that do not work:** Blog Automation's WordPress publishing and Quick Shorts' upload. Then the accessibility of the shared rail (UX-1).
6. **Put AI budgets on every server path (F-3)**, and claims and locks on the cron (F-1, F-2), before lifetime-deal volume arrives.

### AppSumo submission readiness

**Not ready. The rating is "blocked by P0 and P1 items", not a score.**

The redemption mechanics themselves are sound:

- Codes are single-use, with compare-and-swap.
- Codes stack to tier 3, with a cap.
- The Licensing v2 webhook is HMAC-verified, and refunded or deactivated licences are terminal.
- Reviewer logins and test codes exist.

What blocks is everything around redemption: the P0s, the consent gaps, legal pages that conflict with a 60-day marketplace refund window, and home-page claims a reviewer can disprove in minutes.

### Decisions only the owner can make

See Deliverable G's "Requires owner approval" rows. In short:

- the refund policy and its relation to AppSumo's refund window
- the legal entity, address and governing law
- whether the home page's sample figures are shown at all
- whether "Google Business Profile: every review, and replies posted back" stays on the home page before Google grants API access (owner checklist #24)
- the lifetime-deal monthly limits against real unit costs
- whether managed domain and mailbox buying is switched off until it can bill
- the hosted-mail sending cap per workspace
- security items on the owner checklist that only the owner can do: the master password, 2-step sign-in on the owner account, the credential-wrap key and the backup passphrase

---

## Deliverable B — Feature inventory

Status words: **Verified** (exercised by a test or a browser in this audit), **Limited**, **Partial**, **UI only**, **Broken**, **Not implemented**, **Unable to verify**.

| Module | Feature | Status | Evidence | Problems |
|---|---|---|---|---|
| Public site | Home, pricing, security, changelog, legal pages, strategy call, AppSumo redeem page | Verified, with problems | Live render at 1280 and 390; no console errors and no overflow | PUB-1–5 |
| Public site | Refund policy and cookie policy pages | Not implemented | `/refund-policy` and `/cookie-policy` fall through to the home page | PUB-1 |
| Auth | Register, login, logout, codes, Google, 2-step, reset, lockout | Verified, with problems | `test:security` 205/205; journey sign-in (Deliverable E) | W-1, W-2, A-2, A-3 |
| Accounts | Sub-accounts, client logins, roles | Limited | Code review | A-1, T-1, A-4, T-6 |
| Tenancy | Id-scoped queries and upserts, signed storage links | Verified for 37 routes | `test:security`; reviewer sweep of every unscoped `WHERE id` | T-1, T-3, T-4; 23 routes untested |
| CRM | Contacts, companies, deals, pipelines, tags, notes | Verified (contacts) / Limited | Contact added, reloaded and re-signed-in in the browser; deals not exercised | DATA-1, UX-6, UX-7 |
| CRM | Import and export | Verified (unit) | `test:leadimport` 70/70 | — |
| AI Prospecting | Search, sources, lead library, daily finders | Limited | `test:aiprospecting`, `test:sources`, `test:finder`, `test:register` all pass | Needs a Google Maps key (owner checklist #23); C-2; PUB-3 |
| AI Autopilot | Planner, workflows, actions, cron | Partial | `test:autopilot`, `test:triggers`, `test:agents`, `test:nodes` pass | F-1, F-2, F-3, D-3 |
| Email | Mailboxes, SMTP and provider sending, sequences, one-off sends, tracking, unsubscribe | Partial | `test:merge`, `test:emailstyle`, `test:provider-key`; review | E-1–E-7 |
| SMS | Twilio send, inbound STOP, opt-in | Partial | Review | S-1, S-2, S-3, T-2 |
| Domains and hosting | Search, register, DNS, hosted mail, setup checkout | Partial | `test:domains` passes; review | D-1–D-4; Openprovider balance (owner #1) |
| Billing | Plans, checkout, webhooks, trials, portal | Verified, with problems | `test:checkout` 44/44, `test:allowances` 87/87 | M-1–M-7 |
| AppSumo | Codes, stacking, Licensing v2, reviewer logins | Verified | `test:appsumo` 72/72 (earlier run, 4 Nov); review | M-8 |
| Affiliates | Links, commissions, payout marking | Limited | Review | M-5: commissions are never voided on refund |
| Reseller | Clients, their own Stripe or Creem | Limited | Review | M-3 also affects reseller clients |
| AI Video Studio | Upload, transcription, cleanup, Shorts wizard, framing, captions, effects, preview, render, thumbnails, themes | Verified (self-authored) | `test:video` 381/381, `test:videoanalysis` 9/9, `test:videoe2e` 211 passed on the released commit; live since 11 Nov | VS-1–VS-6, AI-1 |
| AI Video Studio | Screen recorder (camera, screen, both) | Unable to verify | Headless browser only; `test:recorder` 47/47 is unit-level | Real-device delay and drift untested |
| Graphics Designer | Templates, editor, thumbnail themes | Verified | `test:design` 78/78, `test:socialtemplates` 30/30; editor opened and reloaded in the browser | FE-1 (latent), UX-5 |
| Blog Automation | WordPress connect and publish | Broken | Code: client and route disagree | C-1 |
| Reputation | Google reviews, replies | Unable to verify | Needs Business Profile API access (owner #24) | PUB-5 |
| Booking and strategy call | Pages, slots, emails, reviews | Verified | `test:strategycall` 33/33, `test:bookingtz` 53/53 | — |
| Customer engagement | Live chat widget, tickets, voice | Limited | Review | F-3: public chat AI is unbudgeted |
| Medical billing (RCM) | Claims, remittances | Limited | `test:rcm`, `test:phi` pass | Owner-only; legal checklist #34 and #38 open |
| Admin and support | Sign-ups and trials, AI usage, field-dead-end reports, audit log | Limited | Review | OPS-2, OPS-3 |
| Observability | Worker logs, browser errors | Partial | `wrangler.jsonc` observability on | OPS-3: no browser error reporting |

---

## Deliverable C — Master issue register

The full detail of each issue is in Deliverable D. Each ID has a task in the handoff.

| ID | Module | Problem | Sev | Verified |
|---|---|---|---|---|
| M-1 | Billing | Currency from the request; the plan is mapped by amount alone, so Scale costs about $1.20 | P0 | yes |
| E-1 | Email | Hosted tenant sends as another tenant's hosted domain via the platform key | P0 | yes |
| M-2 | Billing | Request `priceId` honoured at subscription checkout | P1 | reviewer |
| M-3 | Billing | `checkout.session.expired` sets active subscribers (and reseller clients) to `past_due` | P1 | yes |
| M-4 | Billing | Delayed payments treated as paid (domains registered, orders fulfilled) | P1 | yes |
| D-1 | Setup checkout | Mailboxes priced as 0, all provisioned | P1 | yes |
| D-2 | Managed buying | Operator buys domains and mailboxes; no meter, no billing; UI says "added to your bill" | P1 | reviewer |
| E-2 | Email | Scheduled and automation marketing sends ignore unsubscribes and have no unsubscribe link or header | P1 | yes |
| T-1 | Tenancy | `__agency__` is one bucket shared by all agencies on routes that don't namespace it | P1 | yes |
| A-1 | Accounts | Pre-registered client login captures a stranger's later sign-up | P1 | yes (mechanism) |
| T-2 | SMS | Any tenant can save another's number; inbound STOP may be checked against the wrong tenant and dropped | P1 | yes |
| C-1 | Blog Automation | WordPress connect and publish always fail (field name mismatch) | P1 | yes |
| AI-1 | Video Studio | Quick Shorts uploads straight to Google with an empty browser key, so Google answers 403 | P1 | yes |
| FE-1 | Graphics Designer | Post editor calls hooks after an early return; not reproduced in the browser (latent) | P3 | yes (code); not reproduced |
| PUB-1 | Legal | No refund or cookie page; terms make refunds discretionary; AppSumo licences not covered | P1 | yes |
| PUB-2 | Legal | No legal entity, address or governing law | P2 | yes |
| PUB-3 | Public site | 18 fixed "found / verified" counts shown as real results | P2 | yes |
| PUB-5 | Public site | Google Business Profile replies advertised before API access exists | P2 | unable to verify live |
| W-1 | Web security | Login CSRF (text/plain form posts, no Origin check, OAuth state not browser-bound) | P2 | reviewer |
| W-2 | Web security | `adopt_cookie` returns the HttpOnly session token to page script | P2 | yes |
| E-3 / W-3 | Email | Tracked links signed for any `a=`/`u=`: open redirect and forged events | P2 | reviewer |
| E-4 / W-4 | Email | Explicit-credential sends skip the content gate and suspension | P2 | reviewer |
| E-5 | Email | Hosted sending through the operator key is uncapped | P2 | reviewer |
| E-6 | Email | Sequence sends saved only at the end of a run, so they can repeat | P2 | reviewer |
| E-7 | Email | No bounce or complaint processing | P2 | reviewer |
| S-1 | SMS | Web opt-in clears a STOP for any typed number | P2 | reviewer |
| S-2 | SMS | "Sent" on Twilio acceptance; delivery never tracked | P2 | reviewer |
| D-3 | Autopilot | Sending-pool planner can never reach mailbox creation or warm-up | P2 | reviewer |
| F-1 | Automation | Actions and runs not claimed before acting; no tick lock | P2 | reviewer |
| F-2 | Automation | Cron starvation past 400 projects or 200 non-schedule agents | P2 | reviewer |
| F-3 | AI | Eight server AI paths skip `aiBudget()`, including the public chat widget | P2 | reviewer |
| W-5 | Storage | Signed prefix grants allow unlimited multipart outside the meter | P2 | reviewer |
| T-3 | Privacy | Deleting an account leaves its files in storage | P2 | reviewer |
| M-5 | Billing | Refunds never reach commissions; Stripe refunds never match storefront orders | P2 | reviewer |
| M-6 | Billing | Legacy `/api/stripe-webhook.php` still live, with weaker mapping | P2 | reviewer |
| DEP-1 | Dependencies | dompurify (critical) and postal-mime (high) advisories in production dependencies | P2 | yes |
| PERF-1 | Performance | 4.6 MB main bundle (1.25 MB gzip) on first load | P2 | yes |
| OPS-2 | Admin | No per-customer support console; operator actions not audit-logged | P2 | review |
| OPS-3 | Observability | Browser crashes never reach the operator | P2 | review |
| DATA-1 | Data | Core CRM lists saved as whole JSON documents; the browser's `put` overwrites without a version check | P2 | yes |
| VS-1 | Tests | Three stale Video Studio end-to-end checks and one timing flake (fixed on this branch) | P3 | yes |
| VS-5 | Video Studio | At 390 wide the open side panel covers the breadcrumb, so the composition menu cannot be pressed | P3 | yes |
| UX-1 | App shell | Rail icon buttons named only by tooltip; unnamed to screen readers on every screen | P2 | yes |
| UX-2–UX-8 | Various screens | Missing h1, a customer dead end, a 403 on Moderation, a dialog without a role, unlabelled filters, duplicate Add contact, small targets | P3 | yes |
| PUB-4 | SEO | Unknown URLs return 200 with the home page; one title and description in the HTML shell | P3 | yes |
| DEV-1 | Tooling | ESLint reads stale agent worktrees (2.4 GB) and video segments: 6,623 errors, 591 in real source | P3 | yes |
| M-7, M-8, S-3, D-4, A-2, A-3, A-4, T-4, T-5, T-6, W-6, W-7, C-2, F-4, F-5 | various | Minor items (Deliverable D, "P3 items") | P3 | reviewer |

---

## Deliverable D — Detailed technical findings

Each entry gives the facts needed to act. Fix steps and tests are repeated as tasks in the handoff.

### P0

**M-1 — Subscription currency from the request** (verified). This is P0 because it is payment corruption reachable by any signed-in user.

- **Files:** `worker/src/routes/billing.ts:294-298`, `worker/src/lib/payments/stripe.ts:96` (`currencies: []`) and `:178-180`, `billing.ts:358-369` (`planFromEvent`), `worker/src/lib/allowances.ts:606-616` (`planByAmount`, `soldAt`).
- **Cause (confirmed):** `amountCents` is the plan's USD figure, but the currency is the request's. The Stripe adapter accepts any currency. On `invoice.paid`, the webhook maps a plan from `amount_paid` without reading the currency.
- **Reproduce:** signed in, POST `billing.php {action:'checkout', planId:'scale', currency:'VND'}`. Stripe bills 29,700 VND. The webhook maps 29,700 to Scale. Renewals repeat this.
- **Expected:** USD only, or a per-currency price table, and the webhook refuses a currency it did not price.
- **Impact:** every self-serve plan can be had for about 1% of list, with full allowances, and affiliate commission is booked in VND.
- **Fix:** allow only the plan's currency at checkout. In `planFromEvent`, require the event currency to equal the plan currency before mapping an amount; otherwise record the status and leave `crm_plans` alone.
- **Test:** checkout with `currency:'VND'` is refused. A signed `invoice.paid` with `currency:'vnd', amount_paid:29700` leaves `crm_plans` unchanged.
- **Not verified:** Stripe's live acceptance of VND on this account.

**E-1 — Sending as another tenant's hosted domain** (verified). This is P0 because one tenant can impersonate another's domain, and it risks the operator's sending account.

- **Files:** `worker/src/routes/mailbox.ts:91-110`, where a hosted mailbox receives the platform key. `worker/src/routes/providerSend.ts:57-99`, where `fromEmail` is taken from the request. The same happens at `smtpSend.ts:117-130`. `lib/hostedMail.ts:392-399` checks only the stored row.
- **Reproduce:** tenant A, with a hosted mailbox on its own verified domain, POSTs `provider-send.php {accountId:A, fromEmail:'ceo@<tenant B hosted domain>', to:…}`. The message goes out DKIM-signed on the operator's account, where B's domain is verified.
- **Fix:** in `lib/deliver.ts` (so every caller is covered), when the mailbox is hosted, require the From address to equal the mailbox's own address, or at least sit on a hosted domain verified for that account. Never let the request choose the From address with the platform's key.
- **Test:** `test:hostedmail`: A sending with a From on B's domain is refused on both routes.
- **Not verified:** live Resend and Brevo behaviour. Both are documented to accept any From on a domain verified in the account.

### P1

**M-2 — Request `priceId` honoured** (reviewer). `billing.ts:321` passes `d.priceId` through to Stripe (`stripe.ts:172-176`) or Creem (`creem.ts:316`). When the amount matches no plan, the intent's `planId` is the fallback (`billing.ts:367-368`). Any cheap recurring price, or the one-off $1 Creem order product, can be bought while naming `planId:'scale'`. **Fix:** drop `priceId` from the request; derive line items from `PLAN_CENTS` only. **Test:** a checkout with an arbitrary `priceId` produces `price_data` at the plan's price.

**M-3 — Abandoned checkout sets `past_due`** (verified). `stripe.ts:297` maps `checkout.session.expired` to `failed`, which becomes `past_due` (`billing.ts:473`, `482-492`; `resell.ts:204`). A paying customer who opens a checkout to switch plan and walks away is marked past due 24 hours later. Managed buying is then refused (`provisioning.ts:157-165`), and a subscriber with no `crm_plans` row is treated as an ended trial (`trial.ts:84-88`). **Fix:** map `expired` to `other`, and treat `async_payment_failed` only against that session's own order. **Test:** active status, then a signed `checkout.session.expired` → still active.

**M-4 — Delayed payments treated as paid** (verified). `stripe.ts:296` maps `checkout.session.completed` to `paid` without reading `payment_status`.

- For ACH, SEPA, Bacs or boleto that is `unpaid`, yet `markSetupPaid` registers the domain (`setup.ts:739-761`) and storefront orders become paid and are fulfilled (`storefront.ts:473-477`, `autopilotTick.ts:887-905`).
- **Fix:** `paid` only when `payment_status` is `paid` or `no_payment_required`; rely on `async_payment_succeeded`; handle `async_payment_failed` per order.
- **Test:** an unpaid `completed` event leaves the order pending.
- **Not verified:** which payment methods are enabled on the live account.

**D-1 — Setup checkout charges for no mailboxes** (verified).

- `setup.ts:361` computes `Math.round(Number(d.mailboxes) || 0)`, but the browser sends an array (`src/services/digitalSetup.ts:134`). `Number(['hello','sales'])` is NaN, so 0.
- `setup.ts:440-442` stores every name, and `setupRun.ts:300-335` creates them on the operator's Openprovider account.
- **Fix:** derive the count from the array in both quote and checkout, and assert that the priced count equals the provisioned count before inserting the order.
- **Test:** checkout with 3 names includes 3× the mailbox price.

**D-2 — Managed buying is never billed** (reviewer).

- Autopilot registers up to 5 domains a step (`autopilotTick.ts:1035-1058`) toward a pool of up to 20 domains × 10 mailboxes (`sendingPool.ts:47-50`). The only gate is an `active` billing status.
- `provisioning.ts:126-131` says of its own ledger that "nothing in this app turns a row in it into money arriving". `infra.ts:479` tells the customer it is "added to your bill".
- **Fix:** meters `managed_domains` and `managed_mailboxes` checked before and recorded after; a processor charge before buying, or switch managed mode off; correct the UI text.
- **Test:** a workspace at its allowance is refused before `registerDomain`.

**E-2 — Marketing sends ignore unsubscribes** (verified).

- Sequence emails (`scheduled.ts:253-261`) check no opt-out list. One-off sends check only `crm_suppression_list`, which is filled only when a browser opens the unsubscribe list. Automations send the same way (`automationEngine.ts:538`).
- `deliver.ts` adds no `List-Unsubscribe` header, and no cron sender passes an unsubscribe link.
- This is a consent and compliance breach (CAN-SPAM, GDPR/PECR) and against Gmail and Yahoo bulk-sender rules.
- **Fix:** a shared `isSuppressed(env, accountId, email)` reading `crm_unsubscribes` and both suppression keys, called before every marketing `deliver`; a signed footer link plus `List-Unsubscribe` and `List-Unsubscribe-Post` on every marketing send.
- **Test:** an address only in `crm_unsubscribes` is skipped by the next tick and logged `suppressed`.

**T-1 — Shared reserved workspace** (verified).

- `lib/db.ts:470-477` allows any agency to name `__agency__`. Only `storageWorkspace()` makes it per person, and `routes/projects.ts:104-106` (and autopilot, engagement, commerce, mailbox, sources) query the raw id.
- Agency A can read every project or portfolio any agency saved there, and plant rows the cron then runs.
- This is P1 rather than P0 only because no current client path is known to write projects there. That needs checking first.
- **Fix:** refuse the reserved id in `workspaceAccess` unless a route opts in and namespaces it.
- **Test:** two agencies; A saves under `__agency__`; B's read is refused or empty, on each named route.

**A-1 — Pre-registered client login captures a sign-up** (verified mechanism).

- `auth.ts:1036-1076` (`create_user`) lets any agency create a client login for any unregistered address, bound to its workspace.
- When that person later proves the mailbox, `auth.ts:286-299` clears the password but keeps the role and workspace, so they work inside the agency's workspace. Password `register` refuses the address.
- **Fix:** client logins are invitations: pending, no password, bound only when the invitee proves the mailbox and accepts.
- **Test:** agency creates a client for x@test; x signs in by code and gets their own workspace or an explicit invite screen.

**T-2 — SMS number claimed by another tenant** (verified).

- `misc.ts:198-225` stores any number with no ownership proof. Inbound (`misc.ts:388-389`) takes `.first()` of the matching configs and checks Twilio's signature with that row's token.
- If the wrong row is first, a real STOP fails the signature check and is never recorded.
- **Fix:** a unique index on verified numbers; check the number is in that account's Twilio IncomingPhoneNumbers; on inbound, try every match or select by `AccountSid`.
- **Test:** two workspaces with the same number; a STOP signed with A's token is recorded for A in any row order.

**C-1 — WordPress publishing never works** (verified, raised from P2).

- The client sends `{action:'connect', password, targetId…}` (`src/services/blogPublish.ts:138-140`). The route ignores `action` and requires `appPassword` (`worker/src/routes/misc.ts:626-629`). Connect, status, publish and withdraw all answer "Connect a WordPress site first".
- **Fix:** serve the client's actions through `lib/publishTarget.ts`, so the WordPress password is stored encrypted on the server and never re-sent by the browser.
- **Test:** connect, publish and withdraw against a WordPress mock.

**AI-1 — Quick Shorts upload fails** (verified).

- `src/components/VideoShorts/VideoShorts.tsx:2955/2981` calls `uploadFileToGemini` (`src/lib/gemini.ts:213-240`) with `getGeminiKey()`, which reads browser `localStorage` (or a build-time key, absent in the live bundle).
- `hasGeminiKey()` is true for any server session, so the upload is sent with an empty key. Google answered 403 "Method doesn't allow unregistered callers" when this audit sent the same request.
- This also breaks the project's rule that third-party calls and secrets stay on the server (`Settings → AI engine` stores a Gemini key in the browser).
- **Fix:** move the upload and analysis to the Worker, using the Video Studio's own upload path and the server AI pool; remove browser-held keys.
- **Test:** Quick Shorts analyses an uploaded file for a workspace with no browser key.

**PUB-1 — Refund terms and missing pages** (verified). Public terms say "Refunds are at our discretion unless the law requires otherwise". AppSumo publicly offers buyers a 60-day refund window on deals. The terms never mention marketplace or lifetime licences, what happens on a marketplace refund, or how tiers map. `/refund-policy` and `/cookie-policy` do not exist. **Owner decision with a lawyer.** Then: a refund page, an AppSumo and lifetime-licence section in the terms, and a cookie statement (or a link to privacy §11).

### P2

- **PUB-2:** the privacy policy's "Who we are" names no legal entity, address or contact for data requests. The terms have no governing-law clause. Owner and legal decision.
- **PUB-3:** `src/components/Site/ProspectingShowcase.tsx:44-66` holds 18 fixed rows ("Real estate agents · Richmond, VA · 51 found · 33 verified"), commented as sample-workspace figures but shown without a "sample" label. "Verified mailboxes" needs a connected verifier (owner checklist #28, optional). **Fix:** label them as an illustration, or replace them with figures from real runs, and say what "verified" means.
- **PUB-5:** the home page advertises Google Business Profile reviews and replies posted back. Owner checklist #24 (Business Profile API access, "takes Google weeks") is open. Unable to verify the live state. **Fix:** show it only when the install has access.
- **W-1:** login CSRF. `lib/http.ts:59-61` parses JSON whatever the Content-Type. `index.ts:371-375` sets the session cookie on any successful `auth.php` answer, with no Origin or Fetch-Metadata check. The Google `state` is an HMAC of a timestamp (`googleAuth.ts:138-153`), not bound to the browser. **Fix:** refuse non-`application/json` and cross-origin POSTs on `/api/*` except webhooks and public widgets; bind OAuth state to an HttpOnly nonce cookie.
- **W-2:** `auth.ts:586-590` returns `{token: d.token}`. For same-origin JSON, `session.ts:57-67` has already swapped the cookie placeholder for the real token, so any script can read the 30-day session. **Fix:** never return a token to a cookie-placeholder request.
- **E-3/W-3:** `lib/trackSign.ts:37-54` signs every tracked link in the HTML with whatever `a` and `u` it names. That gives a signed open redirect on app.protectedcentral.com and forged opens and clicks in another workspace. **Fix:** sign only links whose `a` equals the sending workspace.
- **E-4/W-4:** `smtpSend.ts:~90` and `providerSend.ts:86` run the content gate only when `accountId` is present. Explicit credentials without it skip suspension. **Fix:** explicit credentials only for verify; the gate on every real send, cron senders included.
- **E-5:** hosted sending has no cap or meter (`hostedMail.ts:392-399`), including on trial and lifetime accounts. **Fix:** a per-workspace daily cap, refused by name.
- **E-6:** `scheduled.ts:136,350` reads enrolments once and writes back only at the end of a run, so a crash or overlap re-sends. **Fix:** claim each due enrolment with `dataUpdate` before sending.
- **E-7:** there is no bounce or complaint webhook and no DSN parsing. **Fix:** signed Resend and Brevo event webhooks, plus DSN parsing in `replyTick`, feeding suppression.
- **S-1:** `lib/smsConsent.ts` deletes an opt-out for whatever number is typed on the emailed opt-in page (`smsOptin.ts:70-73`). **Fix:** clear a STOP only on an inbound YES or START from that number.
- **S-2:** `lib/sms.ts:132-134` logs "sent" on Twilio's 2xx and sets no `StatusCallback`. **Fix:** a signed status callback that updates the log row.
- **D-3:** `autopilotTick.ts:125-138` counts a domain as authenticated only from `crm_provisioned.kind='dns'`, which nothing writes, so mailbox creation and warm-up are never planned. **Fix:** record `kind='dns'` once SPF, DKIM and DMARC are verified.
- **F-1:** `autopilotTick.ts:1453-1481` and `automationEngine.ts:330,396-401` act before marking rows, with no compare-and-swap and no tick lock. **Fix:** a `pending→running` claim with `changes=1`, and a per-phase lease.
- **F-2:** `autopilotTick.ts:1511-1516` uses `LIMIT 400` with no `ORDER BY`. `projectAgents.ts:722-747` skips non-schedule rows without stamping them, so due agents starve past about 200. **Fix:** filter by trigger in SQL, order, and page with a cursor.
- **F-3:** eight paths call AI with `loadAiKey` only and skip `aiBudget()`: `engageDispatch.ts:62` (the public chat widget), `replyTick.ts:313`, `projectAgents.ts:483,876`, `autopilotTick.ts:1164`, `agentBrain.ts:181`, `projectPipeline.ts:143` and `intake.ts:126`. Plan allowances and owner caps do not bind there, and website visitors can spend the operator's quota. **Fix:** `aiBudget()` before each; hold and report when refused.
- **W-5:** `media.ts:113-124` signs a 30-minute prefix grant after checking only the declared size, and `videoFile.ts:162-197` then allows up to 10,000 × 16 MB parts. Nothing sweeps orphaned objects. **Fix:** exact-key grants with a byte limit, a running multipart total, and a sweep.
- **T-3:** `lib/closeWorkspace.ts:27-53` deletes database rows only, so account deletion (`security.ts:242-266`) leaves videos, media and chat files in storage. **Fix:** delete the workspace prefixes in a queued job, and report completion.
- **M-5:** refunds. `charge.refunded` reads a reference only checkout metadata carries (`stripe.ts:151-152,298,319`), so refunded storefront orders stay paid. `lib/affiliate.ts:47-73` never voids commissions. **Fix:** `payment_intent_data[metadata]`, match on the payment intent, and void pending commissions.
- **M-6:** `/api/stripe-webhook.php` (`index.ts:252`, `routes/stripe.ts:167-184`) still writes billing status with weaker mapping and no replay protection. **Fix:** answer 410, or forward to `handleBillingWebhook`.
- **DEP-1:** `npm audit --omit=dev` reports dompurify (critical, SAFE_FOR_TEMPLATES bypass; used in `src/services/emailHtml.ts`) and postal-mime (high, quadratic CPU on crafted RFC 2047 headers; used for inbound hosted mail in `worker/src/lib/hostedMail.ts`, so a crafted inbound email can burn Worker CPU). **Fix:** upgrade both and re-run `test:html`, `test:hostedmail` and `test:mailparse`.
- **PERF-1:** the main bundle `dist/assets/index-*.js` is 4.6 MB (1.25 MB gzip) on every first load (deploy log of 8 Nov). Rolldown warns, and `services/videoStudio.ts` is both statically and dynamically imported, so the split does nothing. **Fix:** lazy-load route modules and heavy libraries (recharts, d3, hls) off the first screen. Target the main chunk at 600 kB gzip or less.
- **OPS-2:** the audit log (`lib/audit.ts`) records security events only. Operator actions (manual AppSumo tiers, snapshot installs, plan limit changes, workspace closure) are not logged, and there is no single per-customer view of plan, usage, jobs and errors. **Fix:** log operator actions, and add an owner-only customer view.
- **OPS-3:** browser exceptions never reach the operator. `uireport.ts` takes only form-field dead ends. **Fix:** send `window.onerror` and unhandled rejections to a rate-limited endpoint, and show them in the owner's view.
- **DATA-1:** core CRM lists live as whole JSON documents in `crm_data` (`lib/db.ts:186-192`). The browser's `put` (`routes/data.ts:121-131`) overwrites without a version check, unlike the server's `dataUpdate`. Two tabs or two team members editing contacts can silently drop each other's changes, and a single document is capped at 2 MB. **Fix:** optimistic concurrency on `put` (expected `updated_at`, conflict → reload and merge). For contacts and deals, plan a move to rows.

### P3 items

- **PUB-4:** soft 404; one title and description in the HTML shell.
- **DEV-1:** lint reads `.claude/worktrees` (git-ignored, 2.4 GB) and HLS `.ts` segments. Ignore both; fix the 8 real `rules-of-hooks` hits. The Worker ones (`useWrapKey`, `use`) are false positives.
- **VS-5:** at 390 wide the open side panel covers the breadcrumb.
- **M-7:** `stripe-config.php` tells any user the processor and its mode.
- **M-8:** AppSumo OAuth has no `state`; a misleading message for a pending licence; a slight bias in code generation.
- **S-3:** a short STOP-word list, no quiet hours for sequence and automation texts, and inbound picks one workspace per number.
- **D-4:** pending custom hostnames never expire; `infra mailbox_create` returns the password and says "saved".
- **A-2:** TOTP codes can be replayed within the window.
- **A-3:** the lockout counter is incremented after checking.
- **A-4:** client logins under the reserved id.
- **T-4:** `safe()` lets `x.y` and `xy` share a storage prefix.
- **T-5:** hostname squatting.
- **T-6:** `acct-${Date.now()}` ids can collide.
- **W-6:** the RSS fetch follows redirects unchecked.
- **W-7:** `mail-probe` and `smtp-test` connect to any port.
- **C-2:** `placesBudget` counts refused searches.
- **F-4:** model ids hard-coded in the browser (`src/lib/gemini.ts:96-98`).
- **F-5:** `ai.php` meters one request whatever its size.

### AI Video Studio (self-authored, so not independent)

- **VS-1:** the end-to-end suite had three checks that no longer matched intended behaviour (thumbnail order, "Maximum" noise removal, the Audio panel text) and one timing flake. A comparison run on the commit before the 10 November work (f7abd78) showed the same failures. The thumbnail check was updated on this branch; the other two remain.
- **VS-2:** reframing limits, stated on screen. Speakers are found by lip movement, not voice. The pointer is found from the picture, so a hidden or tiny pointer falls back to following the action. There is no text (OCR) detection.
- **VS-3:** the new analysis runs in the media engine, which `scripts/video-bindings.mjs` redeploys when `media/` changes. Projects analysed before it say "not analysed" and render as before.
- **VS-4:** the screen recorder was not testable with real cameras (headless browser only). Delay, drift and dropped frames on real devices are unverified.
- **VS-6:** skin smoothing in the preview is approximate, and the green-screen key needs WebGL. Both are labelled.

---

## Deliverable E — UI/UX report

**How this was tested.** The production build ran on a local Worker with a fresh, empty database. A new customer was registered and signed in through the real login form. Then 29 app screens were visited at 1280 × 900 and 390 × 844 (58 visits). Each visit recorded page errors, console errors, failed API calls, horizontal overflow, load time and an accessibility probe. The probe counted controls with no accessible name, form fields with no label, images with no alt text, the h1 count, heading skips, and touch targets under 24 px. The public site was rendered live at the same widths. Screenshots are in the audit scratch folder; the routes are named below.

**What held up**

- No page errors and no console errors on any screen at either width. The one exception is Moderation, below.
- No horizontal scroll at 390 on any app or public screen.
- Every screen loaded in 1.5–2.7 s locally.
- **Journey, verified:** sign in through the form, then add a contact through Contacts → Add Contact (name, email, company). The contact was still there after a reload, and after signing out (cookies and storage cleared) and back in.
- **FE-1, not reproduced.** The free-form post editor (`/social-creator/editor/<id>`) survived a reload of its own address and opened from a second browser profile, because the app loads workspace data before drawing that route. The hooks-order violation is latent, not a crash today: **FE-1 is downgraded to P3**.
- The Video Studio suite on the released commit passed 211 checks. The 6 failures were 3 pre-existing stale checks and a timing flake, plus 2 caused by its own new themes section and a local Worker restart; the test was corrected.

**Defects by screen**

| ID | Route | Problem | Why it matters | Improvement | Pri |
|---|---|---|---|---|---|
| UX-1 | Every app screen (the right-hand rail, `src/components/Layout/TopNav.tsx`, `.rail-btn`) | 10 icon buttons ("Go back", "Copy link to this view", "Contacts", "Email campaigns", "Calendar", …) have their name only in a `data-tip` tooltip, so they are unnamed to screen readers | Fails WCAG 4.1.2 on every screen; keyboard and screen-reader users cannot tell the rail's buttons apart | Give each `aria-label` (the same words as the tooltip); show the tooltip on focus as well as hover | P2 |
| UX-2 | `/` (dashboard), `/growth` | No `<h1>`. The dashboard's top heading is an h2; Growth has no heading at all | Heading navigation and page titles for assistive technology | One h1 per screen | P3 |
| UX-3 | `/growth` (a customer) | A dead end: one sentence saying the growth service is the install owner's | A customer who follows an old link lands nowhere | Send customers to Jobs & revenue, or show a proper empty state with that link | P3 |
| UX-4 | `/moderation` (a customer) | Shows "Not your screen" but still calls the owner-only API, so two 403s appear in the console | Console noise; wasted calls | Do not call the API for non-owners | P3 |
| UX-5 | `/social-creator` → Blank canvas | The "Create New Design" window has no `role="dialog"` or `aria-modal`, and focus is not trapped | Screen readers do not announce it; Tab escapes behind it | Use the app's shared dialog pattern | P3 |
| UX-6 | `/contacts` (4), `/pipelines` (3), `/settings` (6), `/sell` (2) | Form fields (mostly the filter `<select>`s) with no label or accessible name | WCAG 1.3.1 and 3.3.2 | Add `aria-label` or visible labels | P3 |
| UX-7 | `/contacts` | Two "Add contact" controls with different behaviour: the rail's quick action and the screen's "Add Contact" | Inconsistent wording and behaviour | Same label and the same form for both | P3 |
| UX-8 | `/`, `/pipelines` | 6–8 touch targets under 24 × 24 px | Hard to hit on a phone (WCAG 2.5.8) | Minimum 24 px hit area | P3 |
| VS-5 | `/video-studio/<id>` at 390 | The open side panel covers the breadcrumb, so the composition menu cannot be pressed | A phone user cannot open the Shorts wizard from the menu | Close the panel when the menu opens, or lift the breadcrumb above it | P3 |
| PUB-4 | Public site | Unknown URLs show the home page with status 200 | Search engines index junk URLs as the home page | Real 404 | P3 |

**Not tested in the browser:**

- the sign-up form's emailed code (registration was done through the same API the form calls)
- onboarding wizards beyond the dashboard's "Set up your workspace"
- pipelines and deals creation, the workflow builder, campaign sending and the websites builder
- keyboard-only operation of each screen, and colour contrast (no automated checker is installed)

All of these are in the handoff's regression list.

---

## Deliverable F — Security and data integrity report

**Vulnerabilities by severity:**

- **P0:** M-1 (payment corruption) and E-1 (cross-tenant impersonation through shared infrastructure).
- **P1:** T-1 (shared reserved workspace), A-1 (account capture by pre-registration), T-2 (cross-tenant opt-out loss).
- **P2:** W-1 (login CSRF), W-2 (session token readable by script), E-3/W-3 (open redirect and forged events), E-4/W-4 (suspension bypass), W-5 (storage abuse), DEP-1 (dependency advisories).
- **P3:** A-2, A-3, A-4, T-4, T-5, T-6, W-6, W-7.

**What is sound** (reviewer sweep and passing suites):

- id-scoped SQL and account-scoped upserts throughout
- signed, workspace-prefixed storage grants
- keyed guest links (booking, strategy call, portal, chat visitor, unsubscribe)
- HMAC webhooks with replay windows and body-hash dedupe
- secrets encrypted at rest and never returned (except W-2's session token)
- security headers on the live site: HSTS, CSP, nosniff, frame-options, referrer and permissions policies
- sanitised `dangerouslySetInnerHTML`
- brute-force lockout, hashed sessions, 2-step sign-in

`test:security` covers 37 routes. These take ids or a workspace and are **not** covered: autopilot, automation, calendar, replies, sources, intake, whitelabel, shop, storefront, supplier, setup, infra, portal, ai, aiwrite, cloud, push, video-file, resell, affiliate, appsumo, billing and sms-inbound.

**Data integrity:**

- DATA-1 (whole-document overwrites), E-6 and F-1 (duplicate sends from missing claims), T-3 (files left after deletion), and M-5 (refund state never recorded).
- There are no foreign keys between the JSON documents and the D1 tables, so integrity is the application's job.

**Backup and recovery:**

- Every live deploy records a D1 Time Travel bookmark before migrating (deploy log, 8 Nov), so the database can be restored to a point within D1's retention window.
- A separate backup flow depends on `BACKUP_PASSPHRASE` (owner checklist #14, open). Unable to verify that it has run.
- R2 (videos, media) has no backup described.
- Credential encryption depends on `CREDENTIAL_WRAP_KEY` (owner checklist #13, open). Unable to verify. If it was never set, check how secrets are wrapped today before setting it.

---

## Deliverable G — AppSumo readiness checklist

| Requirement | Status | Note |
|---|---|---|
| Redeem a code; stack codes to raise the tier | Verified | `test:appsumo`; compare-and-swap; capped at tier 3 |
| Duplicate redemption prevented | Verified | Compare-and-swap updates |
| Licensing v2 (purchase, activate, upgrade, downgrade, deactivate) | Verified | HMAC webhook; terminal states; M-8 minor |
| Refund on AppSumo removes access | Verified (code) | Deactivate and refund recompute the tier |
| Lifetime access separate from recurring billing | Verified | `kind:'deal'`, `monthlyCents:0`, never charged |
| Deal-tier limits enforced | Needs improvement | Metered, but F-3 (AI paths unbudgeted) and E-5 (hosted mail uncapped) leak |
| Third-party unit costs accounted for | Needs improvement | AI, prospects and video are metered; hosted mail and managed buying are not (E-5, D-2) |
| Reviewer access and test codes | Verified | `/appsumo` → reviewer logins and the code file |
| Paid plans cannot be bought below price | **Not met** | M-1, M-2 |
| Billing status accurate | **Not met** | M-3, M-4 |
| Marketing email consent and unsubscribe | **Not met** | E-2 |
| SMS opt-out reliable | **Not met** | T-2, S-1 |
| Tenant isolation | Needs improvement | T-1, A-1; 23 routes outside the security suite |
| Advertised features work | Needs improvement | C-1, AI-1, PUB-5 |
| Public claims supported | Needs improvement | PUB-3, PUB-5 |
| Refund policy compatible with AppSumo's | **Requires owner approval** | PUB-1 |
| Legal entity, address, governing law | **Requires owner approval** | PUB-2 |
| Deal-tier numbers sustainable at real unit costs | **Requires owner approval** | `allowances.ts:256-310`; check against `docs/PRICING.md` unit costs |
| Owner-only security items (master password, 2-step, wrap key, backups) | **Requires owner approval** | Owner checklist #3, #8, #13, #14 |
| Google Maps key and Business Profile access | **Requires owner approval** | Owner checklist #23, #24; prospect search and reviews depend on them |
| Support channel | Verified | In-app chat and tickets, support@ address, strategy call |
| Onboarding a new customer without help | Needs improvement | Sign-in and contacts verified; no page errors; UX-1 to UX-8 (Deliverable E) |

AppSumo's private acceptance criteria are not public and are not assumed here. The rows above are publicly visible marketplace expectations (lifetime deals, code or licence redemption, a refund window) plus this audit's own product-readiness judgement.

---

## Audit progress record

**Inspected:**

- the public site (live)
- auth, tenancy and web security (reviewer and verification)
- billing, AppSumo, affiliates and reseller (reviewer and verification)
- email, SMS, domains and hosting (reviewer and verification)
- CRM storage
- prospecting (unit suites)
- autopilot and automation (reviewer and unit suites)
- AI inventory
- AI Video Studio (self-authored; suites)
- the Graphics Designer
- admin and observability
- dependencies, lint, bundle
- deploy and backup configuration

**Tests executed:**

- 44 pure unit suites: all pass
- `test:security`: 205/205
- `test:videoanalysis`: 9/9
- `test:video`: 381/381
- `test:videoe2e` on the released commit: 211 passed, 6 failed, every failure explained in Deliverable E
- `npm audit`, ESLint and a live-site render
- the browser journey: 58 screen visits plus the contacts and editor journeys (Deliverable E)

**Not executed:**

- the other browser and Worker end-to-end suites (signup, cookies, isolation, forms, prospecting, platform, appsumo, allowances, autopilot studio and the rest). They are listed in the handoff's regression plan.
- load tests (not authorised)
- real provider calls: Stripe, Creem, Twilio, Resend, Brevo, Openprovider and AppSumo

**Access limits:**

- no production account or data
- no Cloudflare dashboard (secrets, R2 contents)
- no Google Business Profile, Maps or Stripe accounts
- no real camera or microphone

**Not fully inspected:**

- `customers.ts`, `engagement.ts` (beyond spot checks)
- `commerce.ts`, `storefront.ts`, `shop.ts` (spot checks)
- import and dedupe code line by line
- RCM beyond its suites
- websites and funnels builders
- social automation
- the AI sales agent

Do not treat these as audited.

No production code or customer data was modified by this audit. The only repository changes are this report, the handoff, and a test-navigation fix to the Video Studio end-to-end suite made as part of that module's release.
