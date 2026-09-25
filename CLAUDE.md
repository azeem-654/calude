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

## Money — two pots, and they are not interchangeable

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
  the browser, renewal and an ended session.
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

**The AI key is the operator's.** `loadAiKey` tries the workspace's own key, then
the install's, then `env.AI_API_KEY`. Customers are not asked for one, and the
capability `needs` strings stopped mentioning it in the same commit that added
the fallback — removing the ask before supplying the thing would have been a
promise the product could not keep.

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

Generated records carry a `source` stamp (`src/types/provenance.ts`) naming what
created them, so a list full of generated rows can still be traced back.
