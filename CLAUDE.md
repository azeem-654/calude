# Protected Central

A white-label CRM and marketing platform. One React app and one API, served by a
single Cloudflare Worker.

Two hostnames, one deployment:

- **protectedcentral.com** — the marketing site. No login, no session. Every
  path renders `SiteHome`; the two ways in are links to the app host.
- **app.protectedcentral.com** — the product.

Which one you get is decided at runtime from `location.hostname`
(`src/services/hosts.ts`), not at build time.

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

A cron fires every 5 minutes (`worker/src/scheduled.ts`): it starts campaigns
whose scheduled time has come, then sends whatever is due, then records what it
did into `crm_ticks`.

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

Customer credentials — mailbox passwords, registrar and DNS API keys — are
encrypted at rest with an install secret (`installSecret` + `encryptSecret` /
`decryptSecret`) and **never returned to a browser**. Endpoints report whether a
secret is set, never what it is. A blank field on save means "keep the stored
one", not "clear it".

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

Two recurring traps when writing those checks:

- Scope locators to the dialog. The nav behind an overlay has buttons whose
  names collide with the ones inside it.
- `loadOnboarding()` ignores any stored state without `version: 1`. Seeded test
  fixtures need it.

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
