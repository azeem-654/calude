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

1. `runAutopilot` — plan (once a day) and execute (every tick). Enrolling
   somebody is what makes a message due, so planning after sending would make
   every lead it picks up wait a full tick.
2. `runReplies` — answering a lead is the most time-sensitive thing on a tick.
3. `runScheduledSends` — the campaign batch.
4. `runDigests` — reports on the three above, so it goes last.

Then `recordTick` writes what happened into `crm_ticks`.

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
  person. `'approval'` is the default for anything that sends.

## Money — two Stripe keys, and they are not interchangeable

This is the trap in this codebase most likely to cost somebody real money.

- `env.STRIPE_SECRET_KEY` is a Worker secret: **the operator's** account. It
  bills customers for their subscription to this app (`routes/stripe.ts`).
- `crm_storefront.stripe_key` is **the customer's own**, encrypted per
  workspace. It charges *their* buyers (`routes/storefront.ts`).

Charging a customer's buyer on the operator's key would deposit their trading
revenue into the operator's balance — somebody else's money, held without
agreement, and in most jurisdictions money transmission. Reach for the wrong one
and nothing will fail; it will just quietly be wrong.

The same reasoning decides what may be bought on the operator's account.
Domains and mailboxes are offered managed *or* bring-your-own. Phone numbers and
supplier orders are bring-your-own only: a number carries a licensing and
porting obligation, and a supplier order makes the buyer of record liable for
the chargeback and the customs declaration.

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

Push to `main`. `.github/workflows/deploy.yml` typechecks, builds, applies D1
migrations and deploys — in that order, so a Worker can never reach production
expecting a column its database does not have.

Do not deploy by hand. The repository secrets `CLOUDFLARE_API_TOKEN` and
`CLOUDFLARE_ACCOUNT_ID` are set and the pipeline is green.

## Verifying a change

The app is a single-page product with a lot of state; a typecheck proves very
little about it. Chromium and Playwright are installed:

```js
import pw from '/opt/node22/lib/node_modules/playwright/index.js';
```

Build with `VITE_BASE=/`, run `npx wrangler dev --local`, then drive
`http://localhost:8787` — the same Worker and a real D1, so the API is exercised
too. Worth checking on every UI change: 390px and 1280px, horizontal overflow of
the document, and `pageerror`.

Recurring traps when writing those checks:

- Scope locators to the dialog. The nav behind an overlay has buttons whose
  names collide with the ones inside it.
- `loadOnboarding()` ignores any stored state without `version: 1`. Seeded test
  fixtures need it.
- To seed a signed-in session, write `crm_session` (a `{token, user, backend}`
  object) and `crm_active_account`. Both are in `GLOBAL_KEYS`, so they are *not*
  workspace-prefixed; writing a prefixed copy by hand gets you a logged-out page.

**Scheduled work is testable.** Run `wrangler dev --local --test-scheduled` and
fire the cron with `curl http://127.0.0.1:8787/cdn-cgi/handler/scheduled`. To
re-plan on demand, null `crm_autopilot.last_planned_at` — the planner is
otherwise once a day and you will see nothing.

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

Generated records carry a `source` stamp (`src/types/provenance.ts`) naming what
created them, so a list full of generated rows can still be traced back.
