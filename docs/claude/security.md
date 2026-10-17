<!-- Moved from CLAUDE.md, word for word: read this before working on security, multi-tenancy, secrets and form refusals. -->

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
  the browser, renewal and an ended session. The sign-in screen offers
  **"Continue as …"** from `pc_last_signin` (name, address and method only —
  `pc_`, not `crm_`, so the tenant patch leaves it alone); for a Google account
  it passes the address to Google as `login_hint`, which the server accepts
  only if it looks like an address. `test:google` covers it.
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

**A browser holds one person's workspaces at a time.** `crm_subaccounts` and
`crm_active_account` are global keys, so a browser somebody signed out of kept
their workspaces in the switcher and their records on disk for whoever signed
in next — a new customer opened the app to another account's projects. Every
sign-in (`adoptSession` in services/auth.ts, which `login` now uses too) calls
`keepOnlyWorkspaces` with the ids the server says this person owns
(`workspaces` in every sign-in answer, plus `user.accountId`): every other
workspace's prefixed keys and registry entries go, and the per-person globals
too when `pc_data_owner` names somebody else. `logout` saves (`flushNow`, 3 s
at most) and then `forgetLocalWorkspaces`. On the server, an unowned workspace
that **already holds records** (`crm_data`, `crm_projects`, `crm_portfolios`)
is claimed only by the install owner or the account it was issued to
(`crm_users.account_id`) — never by whoever names it first.
`npm run test:isolation` (self-contained: wrangler :8939, fresh D1) covers both,
the top bar, that AI Prospecting shows nobody from the owner's lead library,
and that the library is closed to customers.

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

## Forms ask only for what they show

A refusal about a particular box names it — `fail(msg, 200, { field:
'smtp.host' })` — and the input carries `data-field="smtp.host"` (or lists it
among several, space-separated, when one input answers for more than one name —
AI Prospecting's sentence box answers for `prospects.trade` and
`prospects.place`; the guard matches with `~=`).
`services/fieldGuard.ts` checks, after any refused `/api/*.php` call, that the
named box is on screen; if not, it is a **dead end**: logged, kept on
`window.__deadEnds`, and reported to `/api/uireport.php`, which the install
owner sees under Settings → API Validation → **Screen checks**. It costs
nothing on success. `npm run test:forms` (fresh D1, like `test:google`) picks
every option of every choice on the mailbox form, validates empty and filled,
sweeps the validate buttons on the Settings tabs, and plants a dead end to
prove the guard catches one. **When you add a form or a refusal, tag both
ends, and add the form to that test.**
