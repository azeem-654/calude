<!-- Moved from CLAUDE.md, word for word: read this before working on commands and deploying. -->

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

**testing.protectedcentral.com is locked** (since 2026-10-26,
`lib/stagingGate.ts`): every request to the staging Worker — page, static file
or API — needs HTTP Basic credentials first, then a 30-day `pc_gate` cookie
stands in for them. Staging sets `assets.run_worker_first: true` so the lock
covers the bundle too; live keeps its short list and has no lock. Only a hash
is committed (`STAGING_GATE_HASH`); the owner's `STAGING_GATE` secret
(`user:password`) overrides it. `robots.txt` answers `Disallow: /`, every
answer carries `X-Robots-Tag: noindex`, and signed webhooks pass. A test or
script against the *deployed* testing site must send the credentials; local
`wrangler dev` without `--env staging` has no lock. `npm run test:gate`, and the
staging workflow checks the deployed site answers 401.

**testing.protectedcentral.com's root is the staging copy of the public
site** (`siteAtRoot()`, since 2026-10-26, so the owner has an address to see
site changes on): signed out, `/` is `SiteHome` with the TESTING bar pinned to
the bottom, and its Sign in goes to the testing `/login`; every other path
still answers with the sign-in form. Signed in, `/site` shows it again. Sign-up
stays shut there (`SELF_SERVE_SIGNUP=off`).

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
