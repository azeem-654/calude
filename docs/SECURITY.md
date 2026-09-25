# Security and privacy: audit and status

Last reviewed **2026-09-25** (third pass). This file is the record behind the public Trust
Center (`/security`) and Settings → Security & Privacy. Every customer-facing
security sentence must be traceable to something in "What customers can be told"
below. When a protection changes, change this file, the Trust Center and the
settings page in the same commit.

---

## How the audit was done

Every route in `worker/src/routes/` was read, and every SQL statement that
touches a row by id was checked for a workspace (`account_id`) constraint. Auth,
sessions, secrets, error handling, logging, uploads, AI calls, headers, webhooks
and dependencies were reviewed separately. Findings were then **exploited
against a real Worker and a real local D1** before being fixed, and the fixes
are pinned by `test/security.e2e.mjs`:

```bash
npx wrangler d1 migrations apply crmpro --local
npx wrangler dev --local           # another terminal
npm run test:security              # 33 checks
```

The test signs up two customers, A and B, and has B try everything below
against A and the install owner.

---

## 1. Critical findings — all fixed (commit 8072e70, live 2026-09-24)

| # | What was possible | Fixed by |
|---|---|---|
| C1 | **Any self-signed-up account could set any user's password, including the install owner's** (`auth.php set_password` checked only "is the caller an agency", and every sign-up is one). Full takeover of the install. | `manageable()` in `routes/auth.ts`: yourself; a client login in a workspace you own; or, for the install owner, anyone — and nobody sets the password of a person who owns a workspace but that person. Own-password changes need the current password, checked on the server. |
| C2 | **Any account could delete any user**, including the owner, then re-register the owner's address and inherit every workspace. | Same check on `delete_user`. |
| C3 | **Any account could create a login inside another customer's workspace** (`create_user` with any `accountId`) and then read or change all of it. | `create_user` goes through `workspaceAccess`; only the owner makes agency logins. |
| C4 | `list_users` returned every user on the install (emails, roles, workspace ids) to any session. | Owner sees all; everyone else sees themselves and logins in workspaces they own. |
| C5 | **Read another customer's inbox, or send mail as them**, by naming their workspace id to `imap-fetch.php`, `smtp-send.php`, `provider-send.php`, `blog-publish.php` — these checked only that *a* session existed. | `denyForeignWorkspace()` in `lib/db.ts`. |
| C6 | **Overwrite another customer's records by id**: products (reprice a live shop), discounts, shipping, tax, collections, shops, portfolios, projects (including their guardrails — e.g. switch sending to "on"). `INSERT … ON CONFLICT(id) DO UPDATE` updated the other tenant's row. | Every such upsert carries `WHERE <table>.account_id = excluded.account_id`, and `foreignId()` refuses the request outright. |

## 2. High and medium findings — fixed

| Finding | Fix |
|---|---|
| Closing a sub-account left its mailbox passwords, payout key, calendar tokens, shop and buyers' orders behind, and the next agency to name the id **inherited all of it**. | `lib/closeWorkspace.ts` deletes from every table with an `account_id` (found at run time, so new tables are covered) and leaves an unclaimable tombstone. |
| Legacy `stripe-checkout.php` took the price from the request: a $0.01 "subscription" marked a workspace active. | Retired (410). Billing goes through `billing.php`, priced from its own table. |
| `stripe-portal.php` opened a billing portal for any `cus_…` id. | Uses the customer recorded for a workspace the caller may open. |
| `billing.php checkout` for someone else's workspace, then refund → their status flipped to cancelled. | Checks `canAccess`. |
| Anyone could create bookings (and Google Calendar invitations from the owner's account) in any workspace. | Needs a published booking page; rate-limited per network. |
| Unsubscribe links could be signed for another workspace (mass opt-out). | Checks the workspace. |
| **Open redirect** on app.protectedcentral.com via the click tracker; forged clicks/opens started automations. | Tracked links and the open pixel are HMAC-signed as mail goes out (`lib/trackSign.ts`); unsigned links get a page naming the destination, not a redirect, and are not counted. |
| Billing webhook replay (Creem signatures never expire) could reactivate a cancelled subscription. | Each delivery body is recorded once (`crm_webhook_events`). |
| **No brute-force protection on password login.** | Per-network (30/15 min) and per-account (10 failures/15 min) limits. |
| Session tokens stored in plain text in D1. | Stored as `h:` + SHA-256; raw legacy sessions still accepted until they expire (≤30 days — then drop the raw form from `sessionKeys`). |
| No MFA. | Optional TOTP 2-step sign-in on every sign-in path (`lib/totp.ts`, signed 5-minute ticket). |
| Google sign-in not bound to the browser that started it (login CSRF). | State remembered in `sessionStorage` and compared on return. |
| Account pre-hijacking: register a stranger's address with a password first. | The first code/Google sign-in that proves the address clears a password set before it and ends other sessions (`email_verified_at`). |
| "Current password" was only checked in the browser. | Checked on the server. |
| `diagnostics.php` gave any customer install-wide counts and raw DB errors. | Owner only. |
| No audit trail. | `crm_audit_events` (sign-ins, failures, logouts, password/2-step/member changes, exports, deletions), 180 days, never containing secrets. |
| **No security headers.** | `public/_headers`: CSP with `script-src 'self'` (no inline, no eval), `object-src 'none'`, `frame-ancestors 'self'`, HSTS, nosniff, Referrer-Policy, Permissions-Policy. API answers carry nosniff. |
| Server errors could not be traced. | Customer sees "…quote reference PC-XXXXXX"; the same reference is logged with the real error. |
| Stripe secret key kept in `localStorage` (global across workspaces). | Never stored; old copies are wiped on first read. |
| Two unsanitised `innerHTML` sinks in the campaign editor. | Sanitised. |
| Google's error text interpolated unescaped into the calendar OAuth page. | Escaped, with a restrictive CSP. |
| `localtunnel` (vulnerable axios) shipped as a production dependency; `react-router-dom` open-redirect advisory. | Removed / upgraded. `npm audit --omit=dev`: 0. |
| No restore point before live migrations. | `deploy.yml` records a D1 Time Travel bookmark before migrating. |

## 3. Fixed on 2026-09-25 (second pass)

| Was | Now |
|---|---|
| **The credential key lived in the same database as the credentials** — one export held both. | `installSecret` wraps every install secret with `CREDENTIAL_WRAP_KEY`, a Cloudflare secret the database never sees (`wrapped:v1.…`). Existing values are wrapped in place on first use; a wrong or missing key **refuses** (500 with a reference) rather than generating a new secret and orphaning every credential. Tested both ways locally. **Takes effect once the owner sets the secret** (OWNER-CHECKLIST 13). |
| Nine tools called Gemini from the browser with a key in `localStorage`. | `/api/ai.php` proxies them with the operator's key, the model chosen server-side, a size cap and the per-workspace budget; `aiFetch()` returns the same response shape, so the parsers did not change. The website builder's never-working OpenAI button now uses it too. **Exception:** AI Shorts' video analysis still uploads the video from the browser with the customer's own key (too large for a Worker request). |
| No AI budget outside the wizard. | `aiBudget()` — 120 an hour, 800 a day per workspace — on aiwrite, page reading, product ideas, Autopilot writing and the proxy. |
| Twilio inbound SMS unsigned (forged STOP). | `X-Twilio-Signature` verified (HMAC-SHA1 over URL + sorted fields, keyed with the workspace's auth token); unsigned deliveries are ignored. |
| Hand-written email sanitiser. | DOMPurify, with this file's allow-lists and URL/style rules as hooks. `test/emailHtml.e2e.mjs`: 13 payloads in Chromium, including mutation-XSS. |
| Session token in query strings (logged). | `Authorization: Bearer` header (`bearer()`); the query form is still read for old bundles. The opt-out sync also never sent a token and read the wrong response field — fixed, so link opt-outs now reach the browser's suppression list. |
| ~25 emailed-code guesses an hour per address. | Plus 20 wrong codes per address per day; every wrong code is in the audit log; addresses lower-cased. |
| Resend/Mailtrap keys checked from the browser. | `validate-key.php` checks them on the server. |
| No copy of the database outside D1. | `.github/workflows/backup.yml`: nightly `d1 export`, gzip, GPG AES-256 with `BACKUP_PASSPHRASE`, kept 30 days as an artifact. **Takes effect once the owner sets the passphrase** (OWNER-CHECKLIST 14); without it the job warns and uploads nothing. |

## 3a. Fixed on 2026-09-25 (third pass)

| Was | Now |
|---|---|
| **Sign-in codes were sent through the first mailbox on the install, whoever owned it.** A customer on Gmail would have had every sign-in code — the install owner's included — in their Sent folder: an account-takeover path for any customer who connected a mailbox. | `installMailbox()` in `routes/auth.ts` only uses a mailbox in a workspace the install owner owns. With none, codes are refused by name. `npm run test:signup`. |
| **Password sign-up never proved the address.** Anybody could register any address, fill the install with throwaway accounts, or squat an address before its owner arrived (undone only later, by `completeSignIn`). | Sign-up posts a six-digit code and creates nothing until it comes back; same limits, guess counting and audit as the code sign-in; the account is stamped `email_verified_at`. On an install with no owner mailbox it falls back to the old path rather than refusing every sign-up (OWNER-CHECKLIST 15). |
| New in this pass: logo import fetches a URL a customer types. | Same fence as page reading (`urlProblem` on every hop, capped body, image types only; SVG with script refused, and SVG is never served back). Rate-limited per workspace. |
| New in this pass: `/api/logo.php` is public (mail clients have no session). | Every address is HMAC-signed per portfolio (`lib/brandLogo.ts`); unsigned or wrong → 404. Raster only, `nosniff`, `default-src 'none'`. |

## 3b. Remaining risks

**HIGH**

1. ~~The session token is in `localStorage`~~ — **fixed 2026-09-25.** The
   session is an `HttpOnly; SameSite=Lax` cookie (`Secure` on https); the page
   keeps the placeholder `"cookie"`, which the Worker swaps for the cookie on
   same-origin requests only (`lib/session.ts`). Old sessions move over on
   the next page load (`adopt_cookie`). `test/cookieSession.e2e.mjs`, 13 checks.

**MEDIUM**

2. Roles are Owner and Member (`client`) only. A Member can change the
   workspace's storefront payout key, mailbox and calendar. Decide which
   money/credential actions should be Owner-only; add Admin/Viewer if needed.
3. AI Shorts video analysis uses a customer key from `localStorage`.

**LOW**

4. `__agency__` reserved bucket is shared between agencies on routes other
   than `data.php`. 5. Chat widget `agent_id` is not ownership-checked (shows
   another agent's name/avatar). 6. `shop.php list` can reveal another
   tenant's project name. 7. ~~Any tenant can claim free subdomains such as
   `admin.` / `login.`~~ — reserved, with `testing.` and ~45 others (2026-09-25). 8. `Access-Control-Allow-Origin:
   *` on the API (no cookies, so low impact). 9. The offline "local users"
   fallback keeps plaintext passwords in `localStorage`. 10. Workspace ids
   (`acct-<timestamp>`) are guessable — fine, because the server checks, but
   never treat one as a secret.

## 4. Tenant isolation test result

`npm run test:security` — **33 passed, 0 failed** (2026-09-24, local Worker +
D1), including: B cannot list, reset, delete or impersonate A or the owner;
cannot read A's workspace, inbox or send as A; cannot overwrite A's project,
product or portfolio; cannot book into, sign opt-outs for, or open billing for
A; unsigned tracked links do not redirect; sessions are hashed; logout ends the
session; password change needs the current one; brute force is cut off and
logged; 2-step refuses a wrong code and accepts the right one.

## 5. Files and uploads

There is no file store (no R2/KV). Images (logos, product photos, post
designs) are data URLs saved in D1 rows or the workspace blob and are only
reachable through workspace-checked API reads, plus the deliberately public
shop/booking/widget reads. Intake files and voice notes are sent to Gemini and
not stored. Limits: intake 4 files, images/PDF only, ~3 MB each, 12 MB total;
voice ≤ ~11 MB, audio types only; blob values ≤ 2 MB. There are no guessable
public file URLs.

## 6. AI data flows

Provider: Google Gemini (`generativelanguage.googleapis.com`), API-key
endpoint. Key order: workspace key → install key → `env.AI_API_KEY`.

| Feature | Sent | Why |
|---|---|---|
| New Project (`intake.php`) | prompt, attached images/PDFs, up to 3 web pages, voice note, portfolio profile | understand the request |
| Autopilot writing, blog, social, campaigns | business profile, request | write content |
| Reply drafts (`replyTick`) | the inbound email + profile | draft a reply |
| Chat assistant (`agentBrain`) | last 14 turns + knowledge base | answer the visitor |
| Form summaries (`engageDispatch`) | the submission (≤3,000 chars) | summarise for the owner |
| Moderation | outgoing message text (≤6,000 chars) | abuse screening |
| Older tools via `/api/ai.php` | review text, email being replied to, briefs | same key, server-side |
| AI Shorts video (browser) | the uploaded video | the customer's own key |

Contact lists are not sent (placeholders like `{{firstName}}`). **Training:**
on a Gemini key whose Google Cloud project has billing enabled, Google's terms
say prompts are not used to improve its products; on the free tier they may be
and may be human-reviewed. See OWNER-CHECKLIST — confirm billing is on.

## 7. What customers can be told (and where it is said)

True today, and said on `/security`, the home page and Settings:

- Workspace data is access-controlled on the server and separated between
  workspaces; tested with a two-account attack suite.
- Passwords are stored as salted PBKDF2-SHA-256 hashes.
- Optional 2-step sign-in with an authenticator app.
- Password-guessing limits; emailed-code and Google sign-in.
- Session tokens stored hashed, and kept in the browser only in a cookie page
  scripts cannot read; see and sign out every device.
- Security activity log, 180 days.
- HTTPS everywhere with HSTS; connected credentials encrypted with AES-256-GCM
  and never returned to a browser.
- No staff login that can open a workspace as the customer.
- Export your data; delete your account and workspaces.
- AI receives what the task needs, not the workspace; which provider; that
  AI calls are made from the server except AI Shorts' video upload.
- Point-in-time restore via D1 Time Travel; a restore point before every
  release that changes the database.
- Card details go to Stripe's/Creem's pages, never our servers.

## 8. Claims we must NOT make

- "End-to-end encrypted" — the server reads workspace data to do its job.
- "Military-grade", "unhackable", "100% secure", "zero risk of leaks".
- "Your data never leaves Protected Central" — AI and email providers process it.
- "Never used for AI training" — depends on the Gemini key's billing plan.
- SOC 2, ISO 27001, HIPAA, PCI DSS, GDPR-certified — none are held.
- "Daily backups" or a specific backup frequency — only Time Travel exists.
- "Encrypted at rest" for all data — true for connected credentials; for the
  rest, say it is stored on Cloudflare's infrastructure.
- "All AI calls are made from our server" — AI Shorts' video upload is the exception; say so.
- "Nightly encrypted backups" — only once BACKUP_PASSPHRASE is set and a run has succeeded.

## 9. Recommended next

1. Owner sets CREDENTIAL_WRAP_KEY and BACKUP_PASSPHRASE (OWNER-CHECKLIST 13–14).
2. Owner-only money/credential actions and an Admin/Viewer role (3b.2).
3. HttpOnly cookie sessions (3b.1).
4. AI Shorts video analysis through the server (a resumable upload proxy).
7. Support access, when it is built: off by default, time-boxed, every use in
   the customer's activity log (`security.php` already reports it as off, and
   there is no mechanism to switch on).
8. Later: SSO, audit export, security policies, certification readiness.
