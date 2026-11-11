# Remediation handoff — Protected Central (from the AppSumo readiness audit, 11 Nov 2026)

This document stands on its own. The evidence behind every task is in `docs/audit/APPSUMO-READINESS-AUDIT.md` under the same ID. Read `CLAUDE.md` first: its rules bind every task here. Then read only the `docs/claude/<area>.md` file for the area of the task in hand.

## Status (2026-11-11, remediation pass 1)

- **Fixed, with tests:** M-1, E-1 (P0); T-1, A-1, T-2, C-1, AI-1 (with F-4), M-2, M-3, M-4, D-1, E-2 (P1). Details in each area's `docs/claude/` file.
- **D-2:** only the false "added to your bill" text is corrected; managed buying is still uncharged pending the owner's decision (OWNER-CHECKLIST #48).
- **PUB-1:** not started — needs the owner and a lawyer (OWNER-CHECKLIST #46).
- **T-1:** live data under the raw `__agency__` name was not inspected (no access from the session); OWNER-CHECKLIST #47.
- Still to do from P2 and below, in the order given.

## Status (2026-11-11, remediation pass 2)

- **Fixed, with tests:** W-1, W-2, S-1, E-3, E-4, F-1, F-3, E-6, M-6, DEP-1 (P2); PUB-3, UX-1, PERF-1 (main chunk 1,255 → 130 kB gzip); FE-1 (P3). Details in `docs/claude/security.md`, `money.md`, `autopilot.md`.
- **PUB-1:** `/refund-policy` and `/cookie-policy` exist and are in the sitemap and footers. They state only facts — AppSumo refunds go through AppSumo, what a refunded licence does, which cookies are set — and promise no refund window of our own. The owner (and a lawyer) still decide the policy itself (OWNER-CHECKLIST #46).
- **PUB-5:** Google Business Profile is off the public "connects to" strip until Business Profile API access exists (#24); put it back then (`shared/WorksWith.tsx`).
- **Pass-1 leftovers closed:** the five "add a Gemini key in Settings" messages; the Quick Shorts upload window is a modal (the welcome card steps aside), fits 390 wide, states the real formats and 2 GB limit, and says the upload counts as one long video.
- **Stale tests fixed:** `test:revenue` (signed webhook now carries `payment_status`, after M-4; a manual plan for a third business workspace; board order).
- **Not done (P2):** W-5, T-3, DATA-1, D-3, M-5, E-7, S-2, F-2, OPS-2, OPS-3, PUB-4. **Owner first:** E-5 (sending cap numbers), D-2, PUB-2.
- **UX-1 follow-up:** unnamed buttons remain inside pages (dashboard checklist collapse and dots, Settings password show/hide, two view toggles on `/social-creator`) — UX-6 to UX-8 territory.
- **No SMS unique index** (T-2): the app enforces one verified owner; a database rule would fail the deploy if live already has duplicates.

## Status (2026-11-11, remediation pass 3)

- **Owner decisions applied:** PUB-1 (14-day refund of a new subscription's first payment), PUB-2 (Protected Central, Delaware, United States; Delaware and US federal law), E-5 (`hosted_emails` daily meter: trial 50 to Scale 2,000), D-2 (managed buying off on live: `MANAGED_BUYING`, staging only). A lawyer's read is still open (OWNER-CHECKLIST #46).
- **Fixed, with tests (P2):** W-5 and T-3 (`test:storage`), DATA-1 (`test:merge`), D-3 (`test:poolauth`), M-5 (`test:affiliate`, `test:revenue`), E-7 (`test:bounces`), S-2, OPS-2, OPS-3 (`test:security`), F-2 (`test:fairness`). PUB-4 (P3) too (`test:publicpages`). Details in `docs/claude/security.md`, `money.md`, `platform.md`, `autopilot.md`, `site.md`.
- **CI:** Promote testing to live now passes the promoted commit to Deploy to Cloudflare, which deploys exactly that commit and refuses one not on `main`.
- **Owner first, new:** OWNER-CHECKLIST #49 (bounce webhook at Resend/Brevo) and #50 (Stripe `charge.refunded` / `charge.dispute.created` on the billing webhook). Without them E-7's provider path and M-5's commission voiding have nothing to act on.
- **Still to do:** the P3 items and the UX-1 follow-ups listed in pass 2.

## 1. The application in brief

- **One Cloudflare Worker serves everything.**
  - `src/` is a React 19 app built by Vite.
  - `worker/src/routes/<name>.ts` are API routes, registered in `worker/src/index.ts` as `/api/<name>.php`. They are not PHP.
  - `worker/src/scheduled.ts` and `lib/*Tick.ts` are crons: every 5 minutes, plus one each minute for video.
  - `worker/migrations/` holds D1 schema, applied in order by the deploy workflows.
  - The AI Video Studio's FFmpeg and OpenCV engine is in `media/`.
- **Tenancy.** Every request names a workspace (`accountId`), checked on the server by `workspaceAccess` / `canAccess` / `denyForeignWorkspace` in `worker/src/lib/db.ts`. `storageWorkspace()` namespaces the reserved `__agency__` id per person.
- **Money has three separate pots:** the operator billing subscribers (`routes/billing.ts`), a subscriber's own shop (`storefront.ts`, `shop.ts`), and a reseller's clients (`resell.ts`). Processors live only in `lib/payments`. Plans and allowances live only in `lib/allowances.ts`.
- **Email has one door:** `lib/deliver.ts`.
- **AI** runs on the server through `aiBudget()` then `withFailover`, using `lib/ai.ts` and `lib/aiTasks.ts`. Never hard-code a model id.
- **Sessions** are HttpOnly cookies. The browser sends `token: "cookie"`.
- **Shipping.** Typecheck (`npm run typecheck`, `npx tsc --noEmit -p worker/tsconfig.json`) and the relevant tests, then push to `staging`. Live moves only through Actions → "Promote testing to live" when the owner asks.

## 2. Constraints

- Change only what each task names. Keep every existing passing test passing.
- Do not change: the three-pot money separation, the AppSumo redemption compare-and-swap logic, the allowance table's role as the single source, the HttpOnly cookie model, `storageWorkspace()` for routes that already use it, or the Video Studio's shared `visualSpec` / `framePlan` path.
- No invented figures, testimonials or "verified" claims on customer screens.
- A refusal names the box it is about (`fail(msg, 200, { field })`), and the input carries `data-field`.
- Extend `npm run test:security` for every route a task touches that takes an id.
- Never send real email or SMS in tests. Use the existing mocks and sinks (see `test/signup.e2e.mjs`, `test/videoStudioMock.mjs`).

## 3. Backlog

Priorities: P0, then P1, then P2, then P3. Within a group, do the tasks in order. The task ID matches the audit ID.

### 3.1 Critical security and data integrity

**[M-1] P0 — Price checkout in the plan's currency only.**
- **Files:** `worker/src/routes/billing.ts` (`checkout` ~L288-300; `planFromEvent` ~L358; the webhook handler), `worker/src/lib/allowances.ts` (add `PLAN_CURRENCY = 'USD'` or a per-plan currency).
- **Change:** refuse any `d.currency` other than the plan's currency, with `fail(…, 200, { field: 'billing.currency' })`. In the webhook, read the event's currency and map an amount to a plan only when it equals the plan currency; otherwise record the status and leave `crm_plans` untouched.
- **Accept:** a checkout with `currency:'VND'` or `'JPY'` is refused. A signed `invoice.paid` `{currency:'vnd', amount_paid:29700}` leaves `crm_plans` unchanged. USD checkout still works.
- **Tests:** extend `test:checkout` (unit) and `test:allowancese2e` (signed webhook).

**[E-1] P0 — The platform's sending key only ever sends as the workspace's own hosted address.**
- **Files:** `worker/src/lib/deliver.ts` (central guard), `worker/src/routes/providerSend.ts` (~L57-99), `worker/src/routes/smtpSend.ts` (~L117-130), `worker/src/lib/hostedMail.ts` (`sendCredsFor`).
- **Change:** when the mailbox is hosted (`mb.hosted`), require `msg.fromEmail` to equal the mailbox's own `from.email`, or at least `sendCredsFor(env, mb.accountId, msg.fromEmail)` to succeed. Otherwise refuse with a sentence naming the address. In both routes, ignore a request `fromEmail` that differs when the key came from the platform.
- **Accept:** workspace A cannot send with a From on workspace B's hosted domain through either route. A's own address still sends.
- **Tests:** `test:hostedmail`, plus two `test:security` checks.

**[T-1] P1 — Close the shared `__agency__` bucket.**
- **Files:** `worker/src/lib/db.ts` (`workspaceAccess` ~L470), and every route that accepts it without `storageWorkspace()`: `projects.ts`, `autopilot.ts`, `engagement.ts`, `commerce.ts`, `mailbox.ts`, `sources.ts` (grep the others).
- **Change:** `workspaceAccess` refuses the reserved id unless the caller opts in (`{ allowReserved: true }`). Routes that legitimately support it (data, shop, misc, leadRevenue, stripe, billing, whitelabel, rcm, and their libs) pass the flag and use `storageWorkspace()`. Before changing anything, check whether production holds rows with `account_id='__agency__'` in `crm_projects` and its peers. If it does, migrate them to `__agency__:<owner>` in a migration, and tell the owner.
- **Accept:** agency B cannot read or write what agency A stored under `__agency__` on any of those routes.
- **Tests:** `test:security`, with two agencies and each route.

**[A-1] P1 — Client logins become invitations.**
- **Files:** `worker/src/routes/auth.ts` (`create_user` ~L1036-1076, `completeSignIn` ~L273-352, `register`).
- **Change:** `create_user` with role `client` inserts a pending invitation with no password and emails an invite link through the system mailbox. The row binds to the agency workspace only when the invitee proves the mailbox and presses Accept. In `completeSignIn`, an unaccepted invitation shows "Join <workspace>" or "Create my own account". It is never joined silently. `register` for an address with only a pending invitation creates the person's own account and leaves the invite pending.
- **Accept:** an agency's invitation for x@test never puts x inside that workspace without x's acceptance. The existing client-login flows still pass.
- **Tests:** `test:signup` and `test:security` (new cases).

**[T-2] P1 — One verified owner per SMS number; inbound STOP always recorded.**
- **Files:** `worker/src/routes/misc.ts` (`sms-send save` ~L198-225, `sms-inbound` ~L384-406), a migration with a unique partial index on verified `from_number`.
- **Change:** at save or verify time, confirm the number is in the account's Twilio IncomingPhoneNumbers. Inbound selects the config by `AccountSid` from the form, falling back to trying each match until a signature validates.
- **Accept:** two workspaces with the same number; a STOP signed with A's token is recorded for A in any row order.
- **Tests:** a new case in `test:security`, plus a unit test of the selection.

**[W-2] P2 — Never hand the session token to page script.**
- **File:** `worker/src/routes/auth.ts` `adopt_cookie` (~L586-590), and any reply to a cookie-placeholder request.
- **Change:** set the cookie only; return `{success:true}` with no `token`.
- **Accept:** `adopt_cookie` sent with `"token":"cookie"` has no token in its JSON.
- **Tests:** `test:cookies`.

**[W-1] P2 — Same-origin JSON only for session-issuing and state-changing API calls.**
- **Files:** `worker/src/index.ts` (router), `worker/src/lib/http.ts`, `worker/src/lib/session.ts`, `worker/src/lib/googleAuth.ts`.
- **Change:** for POST `/api/*`, except an allowlist (payment, AppSumo, Twilio and mail webhooks, the public widget, booking, forms, unsubscribe, track), refuse unless `Content-Type` is `application/json` and the request is same-origin (`sameOrigin()` or `Sec-Fetch-Site` of `same-origin` or `none`). Bind the Google OAuth `state` to an HttpOnly nonce cookie.
- **Accept:** a `text/plain` cross-origin POST to `auth.php login` gets no Set-Cookie. Every e2e suite still passes.
- **Tests:** `test:cookies`, `test:google`, `test:security`.

**[E-3] P2 — Sign tracked links only for the sending workspace.**
- **Files:** `worker/src/lib/trackSign.ts`; callers in `smtpSend.ts`, `providerSend.ts`, `scheduled.ts`, `automationEngine.ts`.
- **Change:** `signTrackedLinks(env, html, accountId)` signs only links whose `a=` equals `accountId`. Leave others unsigned so `track.php` shows its "leaving" page. Sign nothing without a workspace.
- **Accept:** a send for A containing `a=B` comes out unsigned.

**[E-4] P2 — No real send without the content gate.**
- **Files:** `smtpSend.ts` (~L60-95, 165+), `providerSend.ts` (~L86), the cron senders.
- **Change:** explicit credentials are allowed only with `verifyOnly` or `forceVerify`. Every real send requires `accountId`, runs `contentGate`, and goes through `deliver`.
- **Accept:** a suspended workspace cannot send with explicit credentials.

**[W-5] P2 — Bounded uploads.**
- **Files:** `worker/src/routes/media.ts` (~L113-124), `worker/src/routes/videoFile.ts` (~L162-197), a sweep job.
- **Change:** media grants name an exact key and carry a byte limit. Multipart keeps a running total against the declared size and the storage allowance. Add a daily sweep that deletes objects with no database row after 24 hours.
- **Accept:** a 40 MB multipart through a media grant is refused.

**[T-3] P2 — Account deletion removes stored files.**
- **Files:** `worker/src/lib/closeWorkspace.ts`, `worker/src/routes/security.ts` (`delete_account`).
- **Change:** delete every prefix under the workspace (`workspacePrefix(id)`, booking media, chat files) in a queued job, and mark completion.
- **Accept:** after deletion, storage lists nothing under the prefix.

**[DATA-1] P2 — No silent overwrite of CRM documents.**
- **Files:** `worker/src/routes/data.ts` (`put` ~L121-131), the browser store that saves (`src/services/serverData*` / `AppContext`).
- **Change:** `put` accepts an `expectedUpdatedAt`. On a mismatch it returns `{conflict:true, value, updatedAt}`, and the browser re-applies its change to the fresh value (the pattern `dataUpdate` already uses).
- **Accept:** two tabs adding different contacts both survive.

**[DEP-1] P2 — Upgrade vulnerable production dependencies.**
- `dompurify` to a fixed version (used in `src/services/emailHtml.ts`); `postal-mime` to a fixed version (used in `worker/src/lib/hostedMail.ts`).
- **Accept:** `npm audit --omit=dev` shows no critical or high. `test:html`, `test:hostedmail` and `test:mailparse` pass.

### 3.2 Core functionality blockers

**[C-1] P1 — Make WordPress publishing work.**
- **Files:** `worker/src/routes/misc.ts` `handleBlogPublish` (~L599-662), `worker/src/lib/publishTarget.ts`, `src/services/blogPublish.ts`.
- **Change:** the route serves `connect` (verify the site, then store `siteUrl`, `username` and the application password encrypted against `targetId`, and return `connectedAs` and `verifiedAt`), `status`, `disconnect`, `publish` and `withdraw`, using stored credentials. The browser never re-sends the password. Keep the content gate and the https rule.
- **Accept:** connect, publish and withdraw work against a WordPress REST mock. A wrong password says so.
- **Tests:** a new `test/blogPublish.e2e.mjs` with a mock, plus `test:security` (foreign `targetId` refused).

**[AI-1] P1 — Quick Shorts analysis on the server.**
- **Files:** `src/components/VideoShorts/VideoShorts.tsx` (~L2940-3000), `src/lib/gemini.ts` (`uploadFileToGemini`, `waitForFileActive`, `analyzeVideoWithGemini`), `src/components/Settings/AiEngineCard.tsx`.
- **Change:** upload the file through Video Studio's own upload path (`/api/video.php upload_start` / `upload_complete`, or a new `quick_analyze` action). The Worker sends it to the AI pool (`askGeminiParts` with file parts, or Files API calls made by the Worker with the pool's key) after `aiBudget()`. Remove browser-held Gemini keys: `getGeminiKey`, `setGeminiKey`, the `VITE_GEMINI_API_KEY` fallback and the AI-engine card's key field. Remove the hard-coded model lists (F-4).
- **Accept:** a workspace with no browser key analyses an uploaded file. No request from the browser goes to `generativelanguage.googleapis.com`.
- **Tests:** an e2e with the Gemini mock in `test/videoStudioMock.mjs`.

**[FE-1] P3 (latent; not reproduced in the browser) — Hooks order in the post editor.**
- **File:** `src/components/SocialCreator/PostEditor.tsx` (~L839-881).
- **Change:** move the `if (!post) return …` below every hook, or split the editor into an outer guard and an inner component.
- **Accept:** opening `/social-creator/editor/<id>` directly and reloading it renders the editor with no page error. ESLint `react-hooks/rules-of-hooks` reports zero in this file.

**[D-3] P2 — Let the sending-pool planner see authenticated domains.**
- **Files:** `worker/src/lib/autopilotTick.ts` (`readPool` ~L125-138), `worker/src/routes/infra.ts` (`dns_apply` / `dns_records`).
- **Change:** when SPF, DKIM and DMARC are verified present for a domain, record `crm_provisioned (kind='dns', subject=<domain>)`, or derive it from a live check.
- **Accept:** after the records are applied for D, `planPool` yields `create_mailboxes` for D.

### 3.3 Billing and entitlement fixes

**[M-2] P1 —** drop `priceId` from `billing.ts`'s `Req` and from `subscribe`. Line items always come from `PLAN_CENTS` (`price_data`). **Accept:** an arbitrary `priceId` in the request has no effect (unit test asserts `priceId === undefined`).

**[M-3] P1 —** in `lib/payments/stripe.ts` (~L297), map `checkout.session.expired` to `'other'`. Treat `async_payment_failed` as a failure only of that session's own order or setup order, never as a subscription status. Mirror the change in `resell.ts` (~L204). **Accept:** active, then a signed `expired` event → still active.

**[M-4] P1 —** in `stripe.ts` (~L296), map `checkout.session.completed` to `'paid'` only when `payment_status` is `paid` or `no_payment_required`; otherwise `'pending'`. Handle `async_payment_succeeded` as paid and `async_payment_failed` per order (storefront and setup). **Accept:** an unpaid `completed` event leaves the setup order `awaiting_payment` and the storefront order `pending`; `async_payment_succeeded` advances them.

**[D-1] P1 —** in `routes/setup.ts` (`quoteFor` ~L361 and the checkout path), take the mailbox count from `Array.isArray(d.mailboxes) ? d.mailboxes.length : Number(...)`. Assert the priced count equals the stored count before inserting the order. **Accept:** checkout with 3 names prices 3 mailboxes.

**[D-2] P1 — owner decision first.** Add meters `managed_domains` and `managed_mailboxes` to `lib/allowances.ts` (checked before, recorded after) and a processor charge before `registerDomain` or a mailbox purchase (reuse the setup checkout). Otherwise switch managed mode off until billing exists. Correct "added to your bill" in `routes/infra.ts` (~L479). **Accept:** no registration without a paid order; a workspace at its allowance is refused by name.

**[M-5] P2 —** in `stripe.ts` checkout, set `payment_intent_data[metadata][orderId|accountId]`. On `charge.refunded`, match by payment intent stored at completion. In `lib/affiliate.ts`, void a pending commission when its payment is refunded or disputed. **Accept:** a refunded storefront payment moves the order to refunded; a refunded invoice voids its pending commission.

**[M-6] P2 —** `/api/stripe-webhook.php` (`index.ts` ~L252) answers 410, or forwards to `handleBillingWebhook`. **Accept:** signed events there change no billing status.

**[E-5] P2 —** a per-workspace daily cap on hosted sends (meter `hosted_emails` in `allowances.ts`, recorded per send in `deliver` when `mb.hosted`), with a message naming the limit. **Owner sets the numbers.** **Accept:** the (N+1)th send in a day is refused; own-key mailboxes are unaffected.

**[F-3] P2 —** call `aiBudget(env, accountId)` before AI in `engageDispatch.ts` (~L62, the public chat), `replyTick.ts` (~L313), `projectAgents.ts` (~L483, ~L876), `autopilotTick.ts` (~L1164), `agentBrain.ts` (~L181), `projectPipeline.ts` (~L143) and `intake.ts` (~L126). When refused, hold the work and record why. **Accept:** with a workspace cap of 0, none of these reaches the Gemini mock.

**[F-5] P3 —** clamp `maxOutputTokens` in `routes/ai.ts`, and weight the meter by tokens.

### 3.4 Consent and messaging (integrations)

**[E-2] P1 — Honour unsubscribes on every marketing send.**
- **Files:** a new `worker/src/lib/suppression.ts` `isSuppressed(env, accountId, email)` reading `crm_unsubscribes` and both suppression keys; call it in `scheduled.ts` `runAccount` (~L253), `runOneOffEmails` (~L442), `lib/automationEngine.ts` (~L538) and any other marketing sender. Log `suppressed`.
- Add a signed footer link and `List-Unsubscribe` / `List-Unsubscribe-Post` to every marketing `deliver`. Use the existing `signAddress(installSecret('unsub_key'), email, accountId)`, and add a merge tag `{{unsubscribe}}`.
- **Accept:** an address only in `crm_unsubscribes` is skipped by the next tick. Sent sequence mail carries the headers and the link.
- **Tests:** a new unit test, plus `test:html` or a new cron e2e with an SMTP sink.

**[E-6] P2 —** in `scheduled.ts`, claim due enrolments with `dataUpdate` (mark them sending and move `nextSendAt`) before `deliver`, or persist after each send. **Accept:** a throw injected after the first send does not re-send on the next tick.

**[E-7] P2 —** signed Resend and Brevo event webhooks (bounce, complaint) for hosted mail, plus DSN parsing in `replyTick`, adding addresses to suppression. **Accept:** a hard bounce suppresses the address.

**[S-1] P2 —** in `lib/smsConsent.ts` and `routes/smsOptin.ts`, web consent never deletes an opt-out. Send "Reply YES to confirm" instead, and clear the STOP only on an inbound YES or START from that number (`handleSmsInbound`). **Accept:** an opted-out number stays opted out after a web consent until it texts YES.

**[S-2] P2 —** set `StatusCallback` in `lib/sms.ts` to a signed endpoint that updates the delivery log row (delivered, undelivered or failed). **Accept:** a callback with `undelivered` flips the row.

**[F-1] P2 —** in `autopilotTick.ts` (~L1453-1481), `UPDATE … SET status='running', claimed_at=? WHERE id=? AND status='pending'` and proceed only on `changes=1`. In `automationEngine.ts` (~L330, ~L396-401), apply the same compare-and-swap on `node_id`. Add a per-phase lease in `crm_meta`, and recover stale `running` rows after N minutes. **Accept:** two concurrent `runAutopilot` calls send once.

**[F-2] P2 —** in `autopilotTick.ts` (~L1511-1516), add `ORDER BY` plus cursor paging. In `projectAgents.ts` (~L722-747), filter by trigger type in SQL (or a `next_run_at` column) so unrelated rows are never selected. **Accept:** 250 `tag_added` workflows and one due schedule agent → the agent runs in one tick.

**[S-3], [W-6], [W-7], [C-2], [A-2], [A-3], [A-4], [T-4], [T-5], [T-6], [M-7], [M-8], [D-4] P3** — as described in the audit's "P3 items". Each is a contained change with its own one-line test.

### 3.5 AI and output quality

- **[PUB-3] P2:** in `src/components/Site/ProspectingShowcase.tsx`, label the example rows as an illustration ("Example searches"), or drive them from real runs. Rename "verified" to what it means (for example "address checked"), or show it only when a verifier is connected. **Accept:** no unlabelled fixed figures on the public site.
- **[F-4] P3:** remove `TEXT_MODELS`, `VIDEO_MODELS` and `YOUTUBE_MODELS` from `src/lib/gemini.ts` (folded into AI-1).

### 3.6 Video Studio

- **[VS-1] P3:** update the two remaining stale checks in `test/videoStudio.e2e.mjs`: the noise command now asks for "Maximum" (`denoise: 'max'`), and the Audio panel text no longer says "applied when the videos render". Make the retry check wait on job state rather than time.
- **[VS-5] P3:** at 390 wide, close the side panel when the composition menu opens, or keep the breadcrumb above the panel (`VideoEditor.tsx`, `videoStudio.css`).
- **[VS-4] needs a person:** test the screen recorder on real hardware (camera only, screen only, both; 30 minutes) and record delay and drift.

### 3.7 UI/UX

- **[UX-1] P2 —** `src/components/Layout/TopNav.tsx` (and every `.rail-btn` / `data-tip` control): add `aria-label` equal to the tooltip text, and show the tooltip on keyboard focus too. **Accept:** an accessibility probe finds no unnamed buttons in the shell at 1280 or 390.
- **[UX-2] P3 —** one `<h1>` on the dashboard (`/`) and on `/growth`.
- **[UX-3] P3 —** `/growth` for a non-owner sends them to Jobs & revenue, or shows an empty state linking there.
- **[UX-4] P3 —** `src/components/Moderation/ReviewQueue.tsx`: no call to `moderation.php` for non-owners.
- **[UX-5] P3 —** the "Create New Design" window (`SocialCreator.tsx`) uses the shared dialog pattern: `role="dialog"`, `aria-modal`, a focus trap, and Escape to close.
- **[UX-6] P3 —** label the filter selects and inputs on `/contacts`, `/pipelines`, `/settings` and `/sell`.
- **[UX-7] P3 —** one label and one form for the rail's "Add contact" and the Contacts screen's "Add Contact".
- **[UX-8] P3 —** 24 px minimum hit areas on `/` and `/pipelines`.
- **Regression for 3.7:** re-run the audit's browser probe (29 routes × 1280 and 390: page errors, failed API calls, overflow, unnamed controls, unlabelled fields).

### 3.8 Performance

**[PERF-1] P2:** lazy-load route modules and heavy libraries (recharts, d3, hls.light, the Video Studio) off the first screen in `src/App.tsx`. Remove the ineffective dynamic import of `services/videoStudio.ts` from `PostEditor.tsx`. **Accept:** the main chunk is 600 kB gzip or less; the first app screen at 390 wide is interactive in 3 s or less on a mid-tier phone profile.

### 3.9 Documentation, legal and onboarding (owner decisions marked)

- **[PUB-1] P1, owner and lawyer:** a refund page and an AppSumo / lifetime-licence section in the terms (`legalText.ts` and the site's legal pages). Cover the marketplace refund window, what a refund removes, tier stacking, and what "lifetime" covers (allowances are monthly, and third-party costs are capped). Add a cookie statement page or link. **Accept:** `/refund-policy` and `/cookie-policy` render real pages and appear in the sitemap.
- **[PUB-2] P2, owner:** the legal entity, address, data-request contact and governing law in privacy and terms.
- **[PUB-5] P2:** show the Google Business Profile claim only when the install has Business Profile API access (owner checklist #24).
- **[PUB-4] P3:** a real 404 page with status 404 for unknown public paths (Worker-side route list), and per-route `<title>` and description in the HTML shell for the public pages.
- **[OPS-2] P2:** log operator actions (manual tiers, snapshot installs, plan-limit changes, workspace closure) through `lib/audit.ts`. Add an owner-only per-customer view of plan, usage, jobs and recent errors.
- **[OPS-3] P2:** browser `window.onerror` and unhandled rejections go to a rate-limited `/api/uireport.php` kind, shown in the owner's view.
- **[DEV-1] P3:** `eslint.config.*` adds `globalIgnores(['dist', '.claude/**', 'public/**/*.ts'])`, and applies `react-hooks` rules to `src/` only.

### 3.10 Final regression testing

Run all of these, each with its documented setup, and record the results in the commit message:

- **Checks:** `npm run typecheck`, `npx tsc --noEmit -p worker/tsconfig.json`, `npm run build`.
- **Every pure unit suite:** every `test:*` script that runs through `tsx`, 44 at the time of the audit, all passing.
- **Worker and browser suites:** `test:security`, `test:isolation`, `test:cookies`, `test:signup`, `test:google`, `test:forms`, `test:checkout`, `test:allowancese2e`, `test:appsumo`, `test:affiliate`, `test:resell`, `test:revenue`, `test:hostedmail`, `test:html`, `test:mailimport`, `test:prospecting`, `test:platform`, `test:autoprospects`, `test:studio`, `test:wizard`, `test:videoe2e` and `test:strategycalle2e`.
- **A browser pass** of the main screens at 1280 and 390 with no page errors, no failed API calls and no sideways scroll.

## 4. Decisions only the owner can make

1. **Refunds:** the refund policy, and how it relates to AppSumo's buyer refund window (PUB-1).
2. **Legal identity:** the legal entity, address and governing law (PUB-2).
3. **Managed buying:** whether managed domain and mailbox buying stays on before it can bill (D-2).
4. **Sending cap:** the hosted-mail daily cap per plan and deal tier (E-5).
5. **Deal-tier limits:** whether the limits (`allowances.ts:256-310`) hold up against real unit costs (`docs/PRICING.md`).
6. **Sample figures:** whether the home page's sample prospecting figures are shown, and under what label (PUB-3).
7. **Business Profile claim:** the Google Business Profile claim before API access (PUB-5).
8. **Owner checklist items:** the master password (#3), 2-step on the owner account (#8), the credential wrap key (#13; first confirm how secrets are wrapped today), the backup passphrase (#14), the Google Maps key (#23) and the Business Profile API (#24).
9. **Existing data:** for T-1, whether existing `__agency__` rows in production are migrated, and whose they are.
