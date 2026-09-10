# Things only the owner can do

Kept here rather than in a chat, because chats end and this does not. A session
picking this repo up should read it and remind the owner what is still
outstanding, rather than asking them to remember.

**Update this file when one of these is done.** A stale checklist is worse than
none — it trains the owner to ignore it.

---

## The one master account

The install owner is **azeem@protectedcentral.com**, and there is exactly one.

This is enforced in code, not just intended: an install owner is the single
`crm_users` row with `account_id IS NULL AND role = 'agency'`, and
`hasInstallOwner()` in `worker/src/lib/db.ts` makes `bootstrap` refuse a second
— it keeps refusing even if every other user were deleted. `register` always
issues a workspace, so it cannot mint one either, and `create_user` requires an
explicit `accountId`.

Other accounts owning their own workspaces are sub-accounts and are expected.
They are not owners and cannot become one.

---

## Outstanding

### 1. Change the master password — do this first

A password was generated in a chat session to restore access. Anything that has
been in a chat log should be treated as known.

Sign in, then **Settings → Security → Change your password**. It checks the
current one before changing anything, and the server ends every other session
for that account on success, so a stolen session does not survive it.

Do it yourself rather than asking an assistant to set one: a new password
handed over in a chat has exactly the problem you were fixing.

### 2. Confirm the workspace loads on a clean browser

Two bugs that hid a workspace on any browser but the usual one were fixed on
2026-09-10 (`53d3b95`, `8d4a674`). The owner's data lives under
`acct-1788874859362` — an id an early browser invented before sign-in adopted
server-issued ones.

Open a private window, sign in, and confirm the work is there. If it is not,
that is a regression and worth reporting immediately.

### 3. Connect Creem, so the app can charge its subscribers

**Settings → Billing → How this app is paid.** Only the install owner sees this
panel, because it decides who gets paid for everybody.

1. creem.io → Developers → API keys. `creem_test_…` is the sandbox key and only
   takes test payments; the live key takes real ones.
2. Paste it, **Save**, then **Test**. A green tick means Creem accepted it.
3. Copy the webhook address the panel shows. In Creem, add an endpoint for it
   listening for `checkout.completed`, and paste the signing secret back.

Until this is done the app falls back to the Stripe key set on the deployment
itself, and the panel says so — that works, but nobody chose it.

**Creem bills in USD or EUR only.** A plan priced in anything else is refused
when you try to charge it, by name.

### 4. Sub-accounts connect their own, separately

**Sell → Getting paid**, inside each workspace. This is a *customer's* own
account — where their buyers pay them — and has nothing to do with the one
above. They pick Stripe or Creem for themselves.

Nothing can be charged in a workspace until its owner connects one. See the
"Money" section of `CLAUDE.md` for why the two must never be confused.

Without it orders never mark themselves paid and each one has to be set by hand.

### 5. Connect a Printful token, for dropshipping

**Sell → Who makes and posts it.** Printful → Settings → Developers → a private
token with the Orders and Sync Products scopes. Only needed if selling physical
goods somebody else makes.

### 6. Check `APP_ORIGIN`

`wrangler.jsonc` sets it to `https://app.protectedcentral.com`. A scheduled run
has no request to read its own address from, so this is what the payment-link
chase and the digest's "Open Autopilot" link use. If the product ever moves
host, this moves with it.

### 7. Connect a mailbox and an AI key per workspace

Autopilot needs both, and says so rather than failing quietly:

- **no mailbox** — it still writes the landing page, blog and social posts; it
  just cannot send anything.
- **no AI key** — it cannot write, and will not queue work it cannot do.

Settings → Email & SMS for the mailbox; Settings → AI Engine for the key.

---

## Done

- **Master password restored** (2026-09-09) — still needs changing, see 1.
- **`npm run smoke`** exists — an end-to-end check that a workspace survives
  signing out and back in on a clean browser. Run it after anything that
  touches sync, auth or onboarding.
- **Deploys go through GitHub Actions**, never by hand. Push to `main`;
  `.github/workflows/deploy.yml` typechecks, builds, applies D1 migrations and
  then publishes, in that order.
