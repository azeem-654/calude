# Things only the owner can do

Kept here rather than in a chat, because chats end and this does not. A session
picking this repo up should read it and remind the owner what is still
outstanding, rather than asking them to remember.

**Update this file when one of these is done.** A stale checklist is worse than
none — it trains the owner to ignore it.

---

## ⚠ DO THESE — nobody else can

Everything below needs the owner's own hands: a password, somebody else's
control panel, or money. An assistant cannot do any of it, and has tried.

| # | What | Where | Blocks |
|---|---|---|---|
| 1 | **Fund the Openprovider balance** and switch on their recurring auto top-up | openprovider.eu → Finance | Every domain sale. Checkout refuses orders while it is short |
| 2 | **Attach a wildcard Worker route** for `*.protectedcentral.com` | Cloudflare → Workers → Routes | Reseller subdomains resolve |
| 3 | **Revoke the Creem key pasted into a chat** and reissue | creem.io → Developers | Security |
| 4 | **Confirm the billing webhook is set** | Settings → Billing | Payments succeed and nothing is provisioned without it |
| 5 | **Change the master password** | Settings → Security | Security |
| 6 | **Attach testing.protectedcentral.com** to the staging Worker | Actions → Attach domains, with `testing` | The testing site having an address. The Worker itself is already deployed (see 13) |
| 7 | *Optional* — **create a Google OAuth client** if you want the Google button | console.cloud.google.com, then Settings → Security | Nothing. Sign-in already works without it (see 16) |

Item 2 was attempted from a session on 2026-09-14 and could not be done: the
Cloudflare token available to an assistant is a reference, not a working
credential, and `user/tokens/verify` refuses it. It needs a browser and the
owner's login.

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

### 10. Connect Openprovider, for Digital Business Setup

**Settings → Domains & Email** (owner only). This is the reseller account that
lets the project wizard sell a customer a domain, mailboxes, a website and a
workspace in one payment — and set all of it up without them ever seeing who it
came from.

`docs/DIGITAL-BUSINESS-SETUP.md` is the whole procedure. The three things most
likely to catch you out:

- **Do not set an IP allow-list on the Openprovider API.** Workers have no fixed
  outbound IP, so an allow-list refuses every call.
- **Start in the sandbox**, and run one complete purchase through it before
  untucking that checkbox. It costs nothing and registers nothing.
- **The billing webhook from item 4 is what starts provisioning.** Without it a
  payment succeeds and nothing is built, because the app is never told.

Prices are set in the same place and can be changed at any time; an order
already placed keeps the price it was sold at.

### 11. White label: let resellers use their own address

**Settings → Branding → Your own address.** Two tiers, and only one needs you.

**Free subdomains work now.** A reseller claims `theiragency.protectedcentral.com`
and it is live immediately — Cloudflare's universal certificate already covers
one level of subdomain. For this to serve, attach a **wildcard Worker custom
domain** for `*.protectedcentral.com` once (`npm run domains`, or the Cloudflare
dashboard). Without it the row exists and the address does not resolve.

**Their own domain needs Cloudflare for SaaS.** A paid product. Once you have
it, put the zone id, an API token with *Zone → SSL and Certificates → Edit*, and
your CNAME target into **Settings → Domains & Email** (owner only). Until then
the option shows as unavailable rather than accepting a hostname that would
never work.

`app`, `www`, the marketing apex and the product's own hostname cannot be
claimed by anybody — checked on the server, not just hidden.

### 12. Open a shop, if a workspace sells things

**Websites → Shops.** A shop is a page at `/shop/<name>` that anybody can open
without signing in, listing that workspace's active products and taking payment
on its own processor.

It will not publish until a processor is connected and tested under *Getting
paid* (item 5) — a live shop that cannot be paid takes email addresses and gives
nothing back. Products come from **Sell**, and only ones marked *active* appear.

### 13. The testing site — set it up once, then use it for everything

**testing.protectedcentral.com** is a second copy of the whole app: its own
Worker, its own database, its own cron. Nothing it does can reach a paying
customer. It exists so an update can be used in anger before anyone else meets
it.

**Setup — the first two are done:**

1. ~~Create the staging database.~~ **Done 2026-09-16.** `crmpro-staging`
   exists and `wrangler.jsonc` points at it. (`npm run staging:setup` is the
   command, if it ever has to be redone.)
2. ~~Push the `staging` branch.~~ **Done.** Every push to it now runs
   **Actions → Deploy to testing** and publishes the `crmpro-staging` Worker.
3. **Still to do — yours:** **Actions → Attach domains to the Worker**, with
   `testing` in the box. That points testing.protectedcentral.com at the
   staging Worker. Until it is done the Worker is deployed and running but has
   no address on your domain.

   The token may need two permissions it does not need for deploying, and the
   run will say so if it does: **Zone → Zone: Read** and **Zone → Workers
   Routes: Edit**, added to the existing token at
   <https://dash.cloudflare.com/profile/api-tokens>. There is no new secret to
   store.

**From then on, this is the routine:**

- Work goes to `staging`. It deploys to testing.protectedcentral.com on every
  push, automatically.
- Check it there. The whole product is real — sign up, send, buy, publish — but
  against a database nobody depends on.
- When you are happy: **Actions → Promote testing to live**, type `PROMOTE`.
  That fast-forwards `main`, and the existing deploy publishes it to
  app.protectedcentral.com.

Two things worth knowing:

- **Its data is separate and disposable.** Nothing you do on testing appears on
  the live app, and the testing database can be wiped whenever it suits. Every
  screen there carries a purple bar saying so.
- **Promotion refuses rather than overwrites.** If somebody pushed a hotfix
  straight to `main`, the promote workflow stops and tells you to merge `main`
  into `staging` first. It will not throw the hotfix away.

### 14. Content review — check it weekly

**Workspace → Content review** (you only; sub-accounts cannot see it or reach
it). Anything the filter stopped on its way out is listed there with the text,
what matched, and whose account it was. Nothing in that list has been sent.

Two things worth knowing:

- **The AI second pass needs an AI key on the workspace that wrote the
  content.** Without one, the filter's suspicion stands and the item is held
  rather than cleared. That is deliberate — holding costs you a click, sending
  does not come back — but it means a busy queue on installs where customers
  have not connected a key.
- **Suspending an account does not lock it.** They can still sign in, read and
  export; they cannot send or publish. That is clause 6.2 of the policy and it
  is a promise, not an oversight.

`npm run test:moderation` argues with every rule in the filter, in both
directions. Run it if you change the word list — the half that matters is the
seventeen pieces of ordinary trade copy that must *not* be flagged.

### 15. Prospect search — built, and held back on the live app

**Contacts → Find businesses** searches OpenStreetMap. No key, no account, no
bill, and the results may be kept, which is the part that matters.

**It is switched off for customers for now.** On app.protectedcentral.com the
button carries a *SOON* label and opens a short page explaining what it will do;
on testing.protectedcentral.com it works in full. Turn it on for everyone by
taking `'prospects'` out of `REHEARSING` in `src/services/features.ts` — one
line, then promote. Try some real searches for your own customers' towns first:
how useful it is depends entirely on how well those places are mapped, and that
is the thing worth knowing before every customer presses it once.

The old Google Places search is still wired up for installs that configured a
key, but nothing reaches for it any more and you can delete the key. Two reasons
it had to go: Places charges $32 per thousand searches past a 5,000/month
allowance, and its terms forbid storing what comes back beyond a place id — so a
saved prospect list could never legally have been built on it.

What to expect: OSM is strong on town centres and high-street trades and thin on
a sole trader working from home, and it carries a phone number far more often
than an email. The screen says so before the search rather than after an empty
result.

### 16. Sign in with Google, if you want the button — optional

Customers can already sign in without a password: **Email me a sign-in code**
works today, for any address, with nothing to set up. This adds the Google
button beside it, which is one tap for anybody who has a Google account.

**Settings → Security → Sign in with Google.** That screen prints the exact
redirect address to paste into Google and lists the steps in the console's own
order. The short version:

1. console.cloud.google.com → new project (customers never see its name).
2. **APIs & Services → OAuth consent screen** → *External*. Put your business
   name and logo on it — this is the screen your customers read.
3. Add **only** the `openid`, `email` and `profile` scopes, then **Publish**.
   With just those three there is no review, no waiting and no user cap.
4. **Credentials → Create OAuth client ID → Web application**, and paste in the
   redirect address the settings screen shows you.
5. Copy the client ID and client secret back into that screen.

**Do not add a Gmail, Drive or Calendar scope.** Those are the *sensitive and
restricted* ones: they put the whole app into Google's verification queue, which
takes weeks, and cap an unverified app at 100 users for good. The three scopes
above are neither, which is the entire reason this is a ten-minute job. The list
is a constant in `worker/src/lib/googleAuth.ts` rather than a setting, so it
cannot be widened by accident from a screen.

Two things worth knowing before you start:

- The button only appears on **app.protectedcentral.com**, because that is the
  single address Google will redirect back to. Resellers on their own domains
  keep the emailed code, which works everywhere.
- The client secret is encrypted before it is stored and never shown again, not
  even its last characters. Leave the box blank to keep the one already saved.

---

## Done

- **Master password restored** (2026-09-09) — still needs changing, see 1.
- **`npm run smoke`** exists — an end-to-end check that a workspace survives
  signing out and back in on a clean browser. Run it after anything that
  touches sync, auth or onboarding.
- **Deploys go through GitHub Actions**, never by hand. Push to `main`;
  `.github/workflows/deploy.yml` typechecks, builds, applies D1 migrations and
  then publishes, in that order.
