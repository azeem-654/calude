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

### 3. Revoke the Creem key that was pasted into a chat

The API key `creem_1ZcMy…` and the endpoint signing secret `whsec_4yeCh…` were
pasted into a chat session while a connection problem was being diagnosed.
Anything that has been in a chat log should be treated as known.

In creem.io: **Developers → API keys**, revoke that key and issue a new one, and
**Developers → Webhooks**, roll the endpoint's signing secret. Paste the new
values into the app's own Billing panel and nowhere else — never back into a
chat. The panel only ever reports whether a secret is set, never what it is.

The signing secret matters more here than it would with Stripe: Creem's webhook
signature is an HMAC over the body with **no timestamp in it**, so it never
expires and a captured delivery stays valid for ever.

### 4. Connect Creem, so the app can charge its subscribers

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

### 5. Sub-accounts connect their own, separately

**Sell → Getting paid**, inside each workspace. This is a *customer's* own
account — where their buyers pay them — and has nothing to do with the one
above. They pick Stripe or Creem for themselves.

Nothing can be charged in a workspace until its owner connects one. See the
"Money" section of `CLAUDE.md` for why the two must never be confused.

Without it orders never mark themselves paid and each one has to be set by hand.

### 6. Connect a Printful token, for dropshipping

**Sell → Who makes and posts it.** Printful → Settings → Developers → a private
token with the Orders and Sync Products scopes. Only needed if selling physical
goods somebody else makes.

### 7. Check `APP_ORIGIN`

`wrangler.jsonc` sets it to `https://app.protectedcentral.com`. A scheduled run
has no request to read its own address from, so this is what the payment-link
chase and the digest's "Open Autopilot" link use. If the product ever moves
host, this moves with it.

### 8. Connect a mailbox and an AI key per workspace

Autopilot needs both, and says so rather than failing quietly:

- **no mailbox** — it still writes the landing page, blog and social posts; it
  just cannot send anything.
- **no AI key** — it cannot write, and will not queue work it cannot do. It is
  also what "Read their site" on a new project uses to fill a client's portfolio
  in from their own website; without it that button says so rather than
  inventing a description.

Settings → Email & SMS for the mailbox; Settings → AI Engine for the key.

### 9. Connect Porkbun and Migadu, if Autopilot is to buy domains for people

**Settings → Infrastructure → the operator's own accounts.** Only the install
owner sees this, because these are the accounts the money comes off.

- **Porkbun** — the only registrar with a public buying API, so it is the only
  one Autopilot can register a domain through. Account → API Access, switch it
  on, and copy the API key and the secret key. Porkbun charges **per domain
  registered**; there is no monthly fee for having an account or using the API.
- **Migadu** — the only mailbox host the app can create addresses on. Admin →
  the account's API key. Migadu is a **plan**, not a per-mailbox charge: every
  tier allows unlimited domains and unlimited mailboxes and meters daily message
  volume instead, so one modest plan covers every customer's sending pool rather
  than one plan per customer.

Until both are here, "Buy them for me" on a project is refused by name rather
than accepted and then failing, and bring-your-own keeps working as it always
did.

**Nothing is bought before it is paid for.** A managed purchase runs only for a
workspace whose subscription is active — the same status the Creem webhook in
item 4 writes. Until that payment lands the step sits on the board saying so and
retries on its own when it clears. The check lives in `managedSpendAllowed()` in
`worker/src/lib/provisioning.ts`; it is the one thing standing between a
stranger signing up and real domains appearing on the operator's card.

### 10. Open a shop, if a workspace sells things

**Websites → Shops.** A shop is a page at `/shop/<name>` that anybody can open
without signing in, listing that workspace's active products and taking payment
on its own processor.

It will not publish until a processor is connected and tested under *Getting
paid* (item 5) — a live shop that cannot be paid takes email addresses and gives
nothing back. Products come from **Sell**, and only ones marked *active* appear.

---

## Done

- **Master password restored** (2026-09-09) — still needs changing, see 1.
- **`npm run smoke`** exists — an end-to-end check that a workspace survives
  signing out and back in on a clean browser. Run it after anything that
  touches sync, auth or onboarding.
- **Deploys go through GitHub Actions**, never by hand. Push to `main`;
  `.github/workflows/deploy.yml` typechecks, builds, applies D1 migrations and
  then publishes, in that order.
