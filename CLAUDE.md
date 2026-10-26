# Protected Central

A white-label CRM and marketing platform. One React app and one API, served by a
single Cloudflare Worker.

Two hostnames, one deployment:

- **protectedcentral.com** — the marketing site. No login, no session. Every
  path renders `SiteHome`; the two ways in are links to the app host.
- **app.protectedcentral.com** — the product.

Which one you get is decided at runtime from `location.hostname`
(`src/services/hosts.ts`), not at build time.

This file is the short version: the rules that apply to every change, and where
the detail lives. **Before working in an area, read its file in `docs/claude/`**
(table below) — each holds that area's sections word for word, with the traps
that cost money or data. Read only the one you need.

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

## Architecture in brief

```
src/           React 19 + TypeScript, built by Vite
worker/src/    the Worker: routes/, lib/, scheduled.ts
worker/migrations/   D1 schema, applied in order
wrangler.jsonc the whole deployment
```

The Worker serves the built assets and every `/api/*` route. **API paths end in
`.php`** but are not PHP: add an endpoint as `worker/src/routes/<name>.ts` and
register it in `ROUTES` in `worker/src/index.ts` as `/api/<name>.php`. A cron
runs every 5 minutes in a deliberate order (finders → Autopilot → replies →
campaign sends → digests). A scheduled run has no origin: absolute URLs read
`env.APP_ORIGIN`. Details: `docs/claude/architecture.md`.

## Where the detail lives

| Working on | Read |
|---|---|
| The cron, "live in the cloud", what runs without a browser | `docs/claude/architecture.md` |
| AI Autopilot (planner, guardrails, business workspaces, the wizard, workflows canvas) | `docs/claude/autopilot.md` |
| Payments, plans and allowances, affiliates, revenue, trials | `docs/claude/money.md` |
| Sending email, Platform services, support widget/live help, phone apps | `docs/claude/platform.md` |
| Reputation, the booking page, the owner's strategy call | `docs/claude/reputation-booking.md` |
| Prospect search, AI Prospecting, Lead library, daily finders, connected searches, contact lists | `docs/claude/prospecting.md` |
| Security, multi-tenancy, secrets, form refusals (`data-field`) | `docs/claude/security.md` |
| Top bar, dashboard | `docs/claude/app-ui.md` |
| Public site, industry microsites, service pricing (`lib/offers.ts`), its funnel, logo strip | `docs/claude/site.md` |
| AI Video Studio | `docs/claude/video-studio.md` |
| Commands, deploying, staging and live | `docs/claude/deploying.md` |
| Verifying a change, site reels, test traps | `docs/claude/testing.md` |

Longer owner-facing guides stay in `docs/` (`SECURITY.md`, `PRICING.md`,
`VIDEO-STUDIO.md`, `LEAD-DIRECTORY.md`, `SITE-CONVERSION.md`, …).

## Rules that apply to every change

- **Money has three pots that are not interchangeable**: the operator billing
  subscribers (`routes/billing.ts`), a subscriber's own shop
  (`routes/storefront.ts`, `shop.ts`), a reseller's own clients
  (`routes/resell.ts`). Charging on the wrong key fails silently and takes
  somebody else's money. Processors live only in `lib/payments`. Prices are
  read from rows, never from a request. Read `docs/claude/money.md` first.
- **Plans and allowances have one table**, `worker/src/lib/allowances.ts`;
  never write a plan's number or price anywhere else. Anything that costs the
  operator per unit gets a meter, checked before and recorded after.
- **Email has one door**: every server-side sender uses `lib/deliver.ts`
  (`canSend`, `deliver`, `CAN_SEND_SQL`) — never `smtpSend` or `mb.smtp.host`.
- **Every workspace a request names is checked on the server**
  (`canAccess`/`workspaceAccess`/`denyForeignWorkspace`); upserts by id are
  scoped to the account; client-side checks are a courtesy. Extend
  `npm run test:security` with every new route that takes an id.
- **Secrets are encrypted at rest and never returned to a browser**, not even a
  tail; a blank field keeps the stored one; changing a credential clears its
  verified stamp. Every third-party API call is made from the Worker.
- **The browser never holds the session token** (HttpOnly cookie; the page sends
  `token: "cookie"`). AI from the browser goes through `/api/ai.php`; server AI
  calls `aiBudget()` first and goes through `withFailover`; never hard-code a
  model id.
- **Storage is tenant-prefixed underneath**: app code reads plain `crm_*` keys;
  a test writing a prefixed key double-prefixes it.
- **A refusal about a box names it** (`fail(msg, 200, { field })`) and the input
  carries `data-field`; tag both ends and add the form to `test:forms`.
- **Customers call a project a "business workspace"** — never a bare
  "workspace" (that is their account). Code, routes and APIs keep "project".
- **No invented figures, reviews, testimonials or sample data on a customer
  screen**; nothing claims to be "verified" that was only domain-checked.

## Commands and shipping

```bash
npm run typecheck      # tsc -b — the one that actually checks
npx tsc --noEmit -p worker/tsconfig.json   # the Worker
npm run build          # production build (VITE_BASE=/ for anything served from the root)
npx wrangler dev --local          # real Worker + local D1 on :8787
```

`npx tsc --noEmit` alone passes vacuously. **Work lands on `staging`**
(testing.protectedcentral.com): once typecheck and the relevant tests pass,
push the same commits there without being asked (`git push origin HEAD:staging`,
fast-forward). `main` is live and moves only through **Actions → Promote
testing to live**, when the owner asks. Never deploy by hand. Staging and live
must never share a database. Details: `docs/claude/deploying.md`.

A typecheck proves little here: drive the real app at 390 and 1280 wide
(overflow, `pageerror`, what rendered) — `docs/claude/testing.md`.

## Working efficiently (the owner's usage limits)

Every session, and every helper agent, loads this file and the conversation so
far, so tokens spent are the owner's limit spent.

- **Find code through the graph first** (`graphify` section below), then read
  only the lines it points to. Read a whole large file only when the change
  needs it; prefer `Read` with `offset`/`limit` and narrow `Grep`.
- **Read only the `docs/claude/` file for the area in hand.**
- **Helper agents only for big, separable work** — at most one or two, and only
  when the parts touch different files. Never spawn one for a search or a
  small change; a helper reloads all of this context.
- **Keep replies short**: what changed, what was tested, what is left. No
  pasted logs, no repeated file contents.
- **One task per session.** When a long session receives a new, unrelated
  large request, say so in one line and suggest the owner starts a fresh
  session (or types `/clear`) and pastes the request there — only the owner
  can clear a conversation. Then carry on if they prefer to continue here.
- **Batch**: plan the whole change before editing, edit each file once, run
  the slow tests once at the end rather than after every step.

## Conventions

Comments explain **why**, not what — the decision, the alternative rejected, and
what breaks without it. Match the density of the file you are editing.

Nothing pretends to work. A provider that is not connected says so; a DNS lookup
that could not run reports that rather than declaring the records missing; a
partial failure is reported as partial. Plausible success with nothing behind it
is worse than no feature, because the customer finds out when their mail
bounces.

Logos and partner names say only what is true (`shared/WorksWith.tsx`; rules in
`docs/claude/site.md`). Generated records carry a `source` stamp
(`src/types/provenance.ts`) naming what created them.

## graphify

A code knowledge graph lives in `graphify-out/` (not committed). The
SessionStart hook in `.claude/settings.json` runs
`.claude/scripts/ensure-graphify.sh`, which installs graphify only if missing
(cloud sessions only) and builds or incrementally updates the graph in the
background — AST only, no AI calls. Until it exists, search as usual.

- When `graphify-out/graph.json` exists, run `graphify query "<question>"`
  before your first grep, search or source-file read for a codebase question,
  and put this rule in every helper agent's prompt that explores code. Use
  `graphify path "<A>" "<B>"` for relationships and `graphify explain "<X>"`
  for one concept; add `--budget 800` to keep answers small. Read raw files
  only for lines the graph or an earlier read located.
- Read `graphify-out/GRAPH_REPORT.md` only for broad architecture review.
- After modifying code, `graphify update .` keeps it current (no API cost).
