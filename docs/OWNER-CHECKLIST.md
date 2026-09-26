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
| 0 | **URGENT — add a route for `testing.protectedcentral.com/*` to `crmpro-staging`** | Cloudflare → Workers → crmpro-staging → Domains & Routes | The testing site being the testing site. See "The wildcard route swallowed testing" below |
| 1 | **Fund the Openprovider balance** and switch on their recurring auto top-up | openprovider.eu → Finance | Every domain sale. Checkout refuses orders while it is short |
| 2 | **Attach a wildcard Worker route** for `*.protectedcentral.com` | Cloudflare → Workers → Routes | Reseller subdomains resolve |
| 3 | **Change the master password** | Settings → Security | Security |
| 4 | **Reset the testing site's password**, or create its owner account | testing.protectedcentral.com | Being able to sign in to staging at all. See "The testing site has one account" below |
| 5 | **Add the Calendar scope** to your Google client | console.cloud.google.com | Google Meet links on bookings, and the assistant offering real times |
| 6 | *Optional* — **choose a voice provider** | — | AI voice. Nothing else; the rest of Customer Engagement works without it |
| 7 | **Create a Google OAuth client** for "Sign up / Continue with Google" — ten minutes, step by step in 17 | console.cloud.google.com, then Settings → Security | The Google button on sign-in *and* sign-up. The code is built and live; it only appears once the client is saved. Do it on both sites |
| 8 | **Turn on 2-step sign-in for azeem@protectedcentral.com** | app → Settings → Security & Privacy → 2-step sign-in → Turn on | The owner account can connect payments and change settings for everyone; a password alone should not be enough. See 22 |
| 9 | **Create the mailbox `security@protectedcentral.com`** (or an alias to yours) | your mail host | The Trust Center and `/.well-known/security.txt` publish it as the place to report vulnerabilities; until it exists those reports bounce |
| 10 | **Confirm billing is enabled on the Google Cloud project behind the AI key** | console.cloud.google.com → Billing | What the Trust Center may say about AI training. On a free-tier key Google may use prompts to improve its products; on a paid one its terms say it does not |
| 11 | **Confirm the Cloudflare plan** (Workers Paid gives D1 Time Travel 30 days; Free gives 7) | Cloudflare → Billing | How far back the database can be restored. See docs/SECURITY.md §3.10 |
| 12 | **Have a lawyer review the Privacy Policy and Terms of Service** — now published at /privacy and /terms-of-service, written from what the software does (`src/components/Site/legalText.ts`); create `privacy@protectedcentral.com` | a lawyer; your mail host | Launching to the public, and Google's reviewers writing to privacy@ during OAuth verification. The pages are live and linked from the home page footer; they have not been reviewed by a lawyer |
| 13 | **Set `CREDENTIAL_WRAP_KEY`** on both Workers — a long random string, different for each, **never changed afterwards** | Cloudflare → Workers & Pages → `crmpro` (and `crmpro-staging`) → Settings → Variables and Secrets → Add → type *Secret* | Encrypting the key that encrypts every stored password and API key. Until it is set, a database export contains both. See 23 |
| 15 | **Connect a mailbox in your own workspace** (signed in as azeem@protectedcentral.com — Settings → Email & SMS) | app.protectedcentral.com and testing.protectedcentral.com | Emailed sign-in codes, **and the new sign-up check** that proves a new customer owns their email address. Until it exists, sign-up falls back to the old unproved way and code sign-in says it is unavailable. See 24 |
| 14 | **Add the repository secret `BACKUP_PASSPHRASE`** — a long random phrase, also kept somewhere outside GitHub | GitHub → the repository → Settings → Secrets and variables → Actions → New repository secret | The nightly encrypted database backup (`backup.yml`). Without it the job warns and takes nothing |

**Done, and no longer on the list:**

- Attaching testing.protectedcentral.com to the staging Worker — 2026-09-16.
- Revoking the Creem key that was pasted into a chat, and reissuing — 2026-09-18.
- Confirming the billing webhook — 2026-09-18.

The reasoning behind the two Creem items is kept below, because it explains why
the signing secret matters more here than it would with Stripe and that is worth
knowing the next time either is touched.

Item 2 was attempted from a session on 2026-09-14 and could not be done: the
Cloudflare token available to an assistant is a reference, not a working
credential, and `user/tokens/verify` refuses it. It needs a browser and the
owner's login.

---

## Turning Customer Engagement on

Everything below is done inside the app, in any order, from
**Customer Engagement → Overview**, which carries a live checklist that reads
the real state rather than remembering what you told it.

1. **Settings** — your business name and the addresses to notify. Without the
   addresses everything still arrives; you are simply not told about it.
2. **AI agents** — describe the business in your own words. This is the single
   biggest lever on whether it sounds like you. Tick only the things it may do:
   anything unticked it cannot do, however it is asked.
3. **Knowledge** — three or four articles covering what you are asked most.
   Only *published* ones are ever used. With none, the assistant is honest and
   useless: it will say it does not know and offer a person, every time.
4. **Widgets** — make one, then **Copy embed code** and paste that single line
   before `</body>` on your website. Set *Only on these websites* once you are
   live; blank means anywhere, which is right only while testing.
5. **Forms** — the address is `/f/<slug>`. Submissions appear under
   **Submissions** and become contacts.
6. **Meetings** — connect a Google Calendar (see below) for Meet links.

Protected Central itself is configured exactly the same way, in its own
workspace. There is no separate support system and no special code path.

### What Google Cloud needs, for Calendar and Meet

The sign-in client already exists. Calendar is a **sensitive** scope and is
asked separately, of whoever connects a calendar — deliberately not added to
sign-in, which would put every new user of this install behind Google's
verification review and a 100-new-user cap.

1. console.cloud.google.com → **APIs & Services → Library** → enable
   **Google Calendar API**.
2. **OAuth consent screen → Scopes** → add
   `https://www.googleapis.com/auth/calendar.events`.
   Not `auth/calendar`: that one can delete a customer's whole calendar, and the
   narrower scope is both safer and the one people agree to.
3. **Credentials → your OAuth client → Authorised redirect URIs** → add:
   - `https://app.protectedcentral.com/api/calendar.php`
   - `https://testing.protectedcentral.com/api/calendar.php`

   The API path, not a pretty one: only `/api/*` reaches the Worker, so a
   redirect anywhere else is answered by the single-page app and the code is
   dropped while the flow appears to succeed.
4. In the app: **Customer Engagement → Meetings → Connect a Google Calendar**.

If Google does not return a refresh token, the app says so and tells you to
remove the app at myaccount.google.com/permissions and connect again — that
happens when the account has consented before, and a connection without one
stops working an hour later.

### Voice needs a provider, and says so

There is no telephony in this installation. The data model, the configuration
screen and the `VoiceProvider` interface are real and finished; the provider
list is deliberately empty, and every screen and endpoint reports that by name
rather than appearing to answer calls. Adding one is a single file plus a line
in `PROVIDERS` — the product does not need rearranging around it.

---

## The wildcard route swallowed testing — 2026-09-18

**What happened.** The wildcard Worker route `*.protectedcentral.com/*` was
added to the **live** `crmpro` Worker so reseller subdomains resolve. It also
matches `testing.protectedcentral.com`, and it won over that subdomain's own
Worker binding. From that moment the testing address was served by the **live
Worker on the live `crmpro` database**, while still showing the purple TESTING
banner — because the banner is drawn from the hostname, and the hostname was
still "testing".

Nothing failed. No deploy went red. Four staging deploys uploaded correctly to
`crmpro-staging` and the testing address kept showing the old live build,
because it was no longer that Worker's address.

**How it was found.** `crmpro-staging.azeem654.workers.dev` and
`testing.protectedcentral.com` answered `/api/auth.php` `status` differently:
the workers.dev address knew about `signupsOpen`, the custom domain did not.
Two addresses that should be one Worker were two.

**The fix.** Cloudflare → Workers & Pages → **crmpro-staging** → Settings →
Domains & Routes → **Add route**:

- Route: `testing.protectedcentral.com/*`
- Zone: `protectedcentral.com`

A more specific route beats the wildcard, so testing goes back to the staging
Worker and every other subdomain keeps reaching the live one.

Confirm it with, from any machine:

```
curl -s -X POST https://testing.protectedcentral.com/api/auth.php \
  -H 'Content-Type: application/json' -d '{"action":"status"}'
```

The reply must contain `"appOrigin":"https://testing.protectedcentral.com"`. If
it says `app.protectedcentral.com`, the wildcard is still winning.

**Anything typed into testing.protectedcentral.com while this was true went
into the live database.** Worth checking the live workspace list and user list
for rows created on 2026-09-18 that were meant to be rehearsal data.

**What stops it recurring.** The Worker now reports which deployment it
believes it is, and the app compares that against the address bar. When they
disagree, every page carries a red **WRONG SITE** bar instead of the testing
one. It is checked in both directions by `npm run test:hosts`.

---

## The testing site has one account

**testing.protectedcentral.com runs against its own database.** `crmpro-staging`
shares nothing with the live `crmpro` — not the users, not the workspaces, not
the passwords. An account on the live app does not exist on the testing site,
and that is the whole point: a staging Worker bound to the live database would
send real mail to real customers and look completely normal doing it.

So the testing site needs its own owner account, created once:

1. Open **https://testing.protectedcentral.com**.
2. With no users in that database, the screen is **"Create your owner account"**
   rather than a sign-in form. That is the first-run path and it is still open
   on staging; everything else is not.
3. Use **azeem@protectedcentral.com** and a password you choose. It does not
   have to match the live one, and it is better that it does not.

After that, `bootstrap` refuses a second owner and every self-serve route is
shut (`SELF_SERVE_SIGNUP: "off"` in `wrangler.jsonc`): no public sign-up form,
no Google, no emailed code. The sign-up link is not drawn on that site at all,
because a link that will be refused is worse than no link.

**Nobody can tell you the password of an existing account, including an
assistant with the database open.** Passwords are stored as PBKDF2-SHA256
hashes — the stored value cannot be turned back into the password, which is the
property that makes storing it safe.

### Resetting a forgotten password, on either site

There is no "forgot password" email yet, so this is done in the database. Both
sites work the same way; the only difference is which one you open.

1. **Cloudflare dashboard → Workers & Pages → D1.**
2. Open **`crmpro-staging`** for testing.protectedcentral.com, or **`crmpro`**
   for the live app. Getting this wrong resets the account on the other site,
   so read the name before typing.
3. **Console** tab, and run:

   ```sql
   UPDATE crm_users SET hash = '' WHERE email = 'azeem@protectedcentral.com';
   ```

   An empty hash is not a blank password — `verifyPassword` fails against it, so
   the account simply has no password rather than one somebody might guess.
4. Then set a new one. The simplest route is **Sign in with a code**: the app
   emails a one-time code, and signing in that way works with no password at
   all. Once in, set a password under **Settings → Security**.
   - On the testing site that needs a mailbox connected there. If there is not
     one, delete the row instead — `DELETE FROM crm_users WHERE email = '…'` —
     and, with that database then holding no users, the site offers **"Create
     your owner account"** again and you set the password as you create it.
   - Deleting the row on the **live** database would take its workspace links
     with it. Do not use that route there; use the code sign-in.

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

### 3. Revoke the Creem key that was pasted into a chat — **DONE 2026-09-18**

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

### 14. Connect the AI key once, for everybody

**Customers are no longer asked for one.** `loadAiKey` now falls back to a key
you hold for the whole install, so the writing is part of the product rather
than homework. Three places, in order: the workspace's own key (a customer who
brings one keeps their own quota and bill), then yours, then `AI_API_KEY` as a
Cloudflare secret.

Until you set one, a workspace with no key of its own can plan and produce
nothing — and the wizard now promises it can. So this one is worth doing
promptly.

**It now also drives the New Project wizard and the microphone** (2026-09-24).
Without it the wizard still works, but it matches the customer's words to the
solution catalogue instead of reading them, cannot read an attached brochure or
a website, and the microphone falls back to the browser's own recogniser —
which is the one customers said misheard them. The screen says so each time
rather than pretending, but it is a noticeably worse first impression.
Nothing else is needed for voice: transcription uses this same Gemini key.

**Do it in the app. It takes about three minutes and needs no terminal.**

1. Open <https://aistudio.google.com/apikey> and sign in with your Google
   account.
2. **Create API key**, then copy it. It starts with `AIza`.
3. In the app — signed in as **azeem@protectedcentral.com**, the install owner
   — go to **Settings → AI Engine**.
4. Paste it into **API Key** and save.
5. Press **Check what Autopilot has**. That asks Google about the key and
   writes down what it said, so a key that was refused shows as refused rather
   than as connected.

Do it on **testing.protectedcentral.com** and again on
**app.protectedcentral.com**. They are separate databases on purpose, so a key
set on one is genuinely not set on the other.

That key is now the whole install's: every sub-account that has not brought its
own writes with it. The bill therefore scales with customers — a customer who
connects their own key is preferred over yours on purpose, and keeps their own
quota.

**What you will see once it is set.** An AI agent step that said "Writing is
unavailable on this installation at the moment" starts producing drafts on the
next pass, within five minutes. Nothing it writes is published or sent: the
`sendEmail` and `publishContent` permissions still hold everything for you.

**The terminal route, if you would rather the key never touched the database.**
It is read only after the two above, so setting it does not override a key you
put in the app:

```bash
npx wrangler secret put AI_API_KEY        # production
npx wrangler secret put AI_API_KEY --env staging
```

### 15. Content review — check it weekly

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

### 16. Prospect search — built, and held back on the live app

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

### 17. Sign up and sign in with Google — step by step

**Already built, waiting for your Google client.** The button reads **"Sign up
with Google"** on the sign-up form and **"Continue with Google"** on sign-in. A
first-time Google address becomes a new account with its own workspace; an
existing one signs in. It is drawn only once the server says it will work, so
until you finish these steps nobody sees a broken button.

Why it is secure: the browser never holds a Google token (the Worker swaps the
code with a secret the browser never sees), the sign-in is bound to the browser
that started it, Google must say the address is **verified** or it is refused,
and a password somebody set on that address before it was proved is wiped the
first time the real owner arrives through Google. 2-step sign-in still applies
on top.

**On Google's side** — about ten minutes, signed in to the Google account you
want to own this:

1. Open <https://console.cloud.google.com> → project picker (top left) →
   **New project**. Call it anything, e.g. `Protected Central sign-in`.
   Customers never see this name.
2. **APIs & Services → OAuth consent screen** (Google may call it **Google Auth
   Platform → Branding**). Choose **External**, then fill in:
   - *App name*: `Protected Central`
   - *User support email*: your address
   - *App logo*: optional — adding one can trigger a short brand check; you can
     add it later
   - *Authorised domains*: `protectedcentral.com`
   - *Developer contact*: your address
   - *Application home page*: `https://protectedcentral.com`
   - *Application privacy policy link*: `https://protectedcentral.com/privacy`
   - *Application terms of service link*: `https://protectedcentral.com/terms-of-service`
   Both pages exist (2026-09-25), are public, and are linked from the home
   page's footer, which Google checks. The privacy policy names the exact
   scopes and carries Google's Limited Use statement. **Create the mailbox
   `privacy@protectedcentral.com`** (or an alias) — both pages give it as the
   contact, and Google's reviewers may write to it.
3. **Data access / Scopes** → add **only** `openid`, `.../auth/userinfo.email`
   and `.../auth/userinfo.profile`. Nothing else.
4. **Audience** → **Publish app** (move it from *Testing* to *In production*).
   With only those three scopes there is no review, no waiting and no 100-user
   cap. Left in *Testing*, only the test users you list can sign in.
5. **Clients** (or **Credentials → Create credentials → OAuth client ID**) →
   *Application type*: **Web application**, name it `app`.
   - *Authorised JavaScript origins*: `https://app.protectedcentral.com`
   - *Authorised redirect URIs*: `https://app.protectedcentral.com/auth/google`
   - For the testing site add a second pair:
     `https://testing.protectedcentral.com` and
     `https://testing.protectedcentral.com/auth/google`
   The settings screen in the app prints the exact redirect address for the
   site you are on — copy it from there rather than typing it; one character
   off is Google's `redirect_uri_mismatch` page.
6. **Create**, then copy the **Client ID** (ends `.apps.googleusercontent.com`)
   and the **Client secret**.

**In the app** — signed in as azeem@protectedcentral.com:

7. **Settings → Security & Privacy → Sign in with Google**. Paste the client ID
   and secret, **Save**. The secret is encrypted and never shown again, not
   even its last characters; leave the box blank later to keep it.
8. Open a private window at <https://app.protectedcentral.com/signup> — the
   **Sign up with Google** button should be there. Try it with a spare Google
   account.
9. Repeat 7–8 on **testing.protectedcentral.com**. It is a separate database, so
   the client has to be saved there too. (Sign-up is closed on testing; Google
   there only signs *you* in.)

**Never paste the client secret into a chat** — only into that settings box.

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

### 18. Voice: pick a provider, or leave it off — it says which

The AI chatbot needs **no extra service at all**. It runs on the same Google AI
(Gemini) key as everything else, through `loadAiKey`, so once item 14 is done
the chat agent, the ticket triage, the knowledge-base answers and all the
writing are covered by one key. There is nothing else to buy for it.

**Voice is different, and this is the honest part:** a Gemini key cannot answer
a phone. Answering a call needs three things Gemini does not provide — a phone
number with a carrier behind it, speech-to-text and text-to-speech running
inside a few hundred milliseconds, and something to hold the audio leg open. The
voice agent screen, the session model and the `VoiceProvider` interface are all
built and finished; the provider list is deliberately **empty**, and every
screen and endpoint says so by name rather than pretending to take calls.

Three ways to go, cheapest first:

| Route | What it costs you | What you give up |
|---|---|---|
| **Leave it off** | Nothing | No inbound calls. Chat, forms and tickets are unaffected. |
| **A hosted voice-agent API** (Vapi, Retell, ElevenLabs Agents and similar all expose the same shape) | Roughly $0.05–$0.15 a minute all-in, plus the number | A second bill and a second vendor. Cheapest to *build*: one file and one line in `PROVIDERS`. |
| **Assemble it yourself** — Twilio for the number and the media stream, a streaming STT, Gemini for the reasoning, a TTS | Cheapest per minute at volume | Weeks of work and the latency problem is genuinely hard. Not worth it until voice is earning. |

**The recommendation: leave voice off for now and turn the chatbot on.** The
chatbot costs nothing beyond the key you already have, captures leads on every
website and funnel, and is the thing customers will actually use first. Voice is
worth adding when a customer asks for it and will pay for it — at which point it
is a day's work, not a rebuild.

Whichever you choose, **the key is entered in the app**, never pasted into a
chat. It is encrypted at rest and never shown back, not even its last
characters.

#### If you do want voice now: Vapi, step by step

Vapi is the right first choice for this install. It bundles the number, the
speech in both directions and the turn-taking into one API, it bills per minute
with no monthly floor, and its webhook carries a transcript and a duration —
which is exactly the shape `crm_voice_sessions` already stores. Retell and
ElevenLabs Agents are the same shape if you prefer one of those; nothing below
changes except the names.

**What it costs.** Around $0.05–$0.09 a minute all-in at Vapi's own rates, plus
roughly $2 a month for each phone number. There is no subscription to hold an
account open, so an install with no calls costs nothing.

**On your side:**

1. **vapi.ai → sign up.** A card is needed before a number can be bought; there
   is no charge until a call connects.
2. **Dashboard → API Keys → create a private key.** The private one, not the
   public one — the public key is for browsers, and every third-party call in
   this app is made from the Worker.
3. **Phone Numbers → Buy.** Pick the country your customers are in. A UK number
   answering UK callers costs a fraction of an international leg and, more
   importantly, gets answered.
4. **Bring the key into the app, not into a chat.** Settings → Infrastructure →
   Voice. It is encrypted at rest with the install secret and never shown back.
5. **Tell me the number and that the key is in.** The `VoiceProvider` interface,
   the session table and the screens are already built and tested; what is
   missing is one file in `worker/src/lib/` and one line in `PROVIDERS`. That is
   a day, not a rebuild — and until it exists every screen says voice cannot
   take calls rather than pretending.

**Two things worth knowing before you spend anything.**

*Gemini cannot be the whole answer, but it can be part of it.* Google's
Realtime/Live API does speech in and speech out, so the reasoning and the voice
could both be Google — but it has no phone number and no carrier, so you would
still be buying a number and a media bridge from Twilio and writing the glue
between them. That is the "assemble it yourself" row above: cheaper per minute
at volume, weeks of work, and the latency is the hard part. It is the right
answer once voice is earning, and the wrong one before.

*Calls are recorded and that is regulated.* Several countries require both
parties to be told. The voice agent screen has a consent line for exactly this
reason — write one and leave it on.

### 19. Where the forms are, and what happens to a lead

Not a task — the answer to "where do I find them", because it moved.

- **Forms:** *Customers → Customer Engagement → Forms*, or straight to
  `/engagement?tab=forms`. Each one gets a public address anybody can open with
  no account, and the same form can be embedded in a **website** or a **funnel**.
  Chat and voice capture into the same place.
- **What is captured:** *Customer Engagement → Submissions*, and the people
  themselves land in **Contacts**.
- **Where a lead goes next:** *Customer Engagement → Settings → Where new leads
  go*. By default every captured person gets a **deal on your pipeline**, in the
  first stage, carrying that stage's checklist. Optionally they can also be put
  into a **follow-up sequence** — that one is off until you pick a sequence,
  deliberately, because it sends email to somebody who has just met you.
- **Did the email arrive:** *Customer Engagement → Delivery log*, one row per
  recipient, with the mail server's own words when it refused.
- **The online shop** is no longer called "Sell" and no longer sits under
  Marketing. It is **Sales → Online shop**, with a map of its nine panels at the
  top, and it links both ways to the shop pages under *Websites → Shops*.

### 20. Connect every form block on a website or funnel — do this before launch

Not optional, and it is the one thing on this list that silently loses money.

A form block on a website or funnel page used to be **a picture of a form**: no
handler, no request, nothing. A visitor filled it in, pressed Submit, and every
word went nowhere. That is fixed — but a block only collects once it is told
*which* form it collects into, because a public page cannot be trusted to name
a workspace and a form's slug can.

For each site and funnel you have already built:

1. **Customer Engagement → Forms** — make one form per thing you actually want
   to be asked ("Get a quote", "Book a survey"). Set it **live**.
2. **Websites → open the builder → click the form block → "Collects into"** —
   pick that form. Same control in the funnel builder.
3. Preview the page and send yourself one. It should thank you, and the
   submission should appear under *Customer Engagement → Submissions*.

An unconnected block now says on the page that it cannot take an enquiry, so
nothing is lost silently — but it is still a form your visitors cannot use.

### 21. Switch on the workflows you want, and only those

**Marketing → Automations**, or per project under **AI Autopilot → Workflows**.

These now genuinely run: on the server, every five minutes, with the app closed.
Until this release nothing executed them at all, so anything you drew before is
sitting there having never done a thing — worth reading before you switch it on,
because the moment you do it starts emailing real people.

Three things to know:

- **Everything arrives as a draft.** Nothing sends until you press *Switch on*.
- **A step that cannot run is skipped and named**, never counted as sent. "No
  mail server is connected to this workspace" is what you will see if item 8 is
  not done — the workflow is fine, the mailbox is missing.
- **"What has actually run"**, under the builder, lists every person inside a
  workflow and every step it took for them. That is where "why did Rita get
  that email" is answered.

---


### 22. Security & Privacy — what changed on 2026-09-24, and what is yours

An audit found requests any signed-up account could make against other
customers — including resetting the owner's password. They are fixed and live
(docs/SECURITY.md has every finding, and `npm run test:security` re-runs the
attack suite). Yours to do:

1. **Change the master password** (still item 3 above) — from
   Settings → Security & Privacy, which now needs your current one.
2. **Turn on 2-step sign-in** (item 8): Settings → Security & Privacy →
   *Turn on* → scan the QR code with Google Authenticator / Microsoft
   Authenticator / 1Password → enter the 6 digits. From then on every sign-in
   asks for a code. Keep the app on a phone you will not lose; if you do lose
   it, a code or password sign-in on a device already signed in can switch it
   off from the same screen.
3. **Look at "Signed-in devices"** on that screen once, and sign out anything
   you do not recognise.
4. Items 9–12 above.

Everything customers are told about security is in docs/SECURITY.md §7, and
what they must **not** be told is §8 — no "end-to-end encrypted", no
certifications, no "never used for AI training" until item 10 is confirmed.


### 23. The two secrets that finish the security work — do both once

**`CREDENTIAL_WRAP_KEY` (item 13).** Every mailbox password, API key and
payment key is encrypted in the database with an install key. That install
key used to sit in the same database. With this secret set, it is stored
encrypted under a key Cloudflare keeps outside the database, so an export of
the database on its own opens nothing.

1. Make a long random value — for example a password manager's 40-character
   generator. Make a **different** one for staging.
2. Cloudflare → Workers & Pages → **crmpro** → Settings → **Variables and
   Secrets** → **Add** → Type **Secret**, name `CREDENTIAL_WRAP_KEY`, paste the
   value, **Deploy**. Do the same on **crmpro-staging** with its own value.
3. Save both values in your password manager. **Never change or delete them.**
   The app refuses to run the parts that need credentials if the key is wrong
   or missing — it will not quietly make a new one, because that would lose
   every connected mailbox and key at once — so a changed key means putting the
   old one back.

Nothing else needs doing: the first request after it is set wraps the stored
key in place.

4. **Check it took.** Signed in as azeem@protectedcentral.com, open
   **Settings → Security & Privacy**. The row of status pills at the top now
   has one for this (only the install owner sees it):
   - *Stored-key protection off* — the secret is not reaching the Worker. Check
     the name is exactly `CREDENTIAL_WRAP_KEY` and that you pressed Deploy.
   - *CREDENTIAL_WRAP_KEY set — protects keys from their next use* — set; the
     stored keys are wrapped the next time something uses them (sending mail,
     a Google sign-in). Reload after a few minutes of normal use.
   - *Stored keys protected by CREDENTIAL_WRAP_KEY* — done.

   If a mailbox or payment then says it cannot read its credentials, the key
   in Cloudflare is not the one it was wrapped with: put the saved value back.

**`BACKUP_PASSPHRASE` (item 14).** GitHub → Settings → Secrets and variables →
Actions → **New repository secret**, name `BACKUP_PASSPHRASE`, a long random
phrase. Keep a copy outside GitHub — it is the only way to open a backup. Then
Actions → **Back up the live database** → **Run workflow** once to check it
works; after that it runs every night at 03:17 UTC and keeps 30 days.

To restore from one: download the artifact, then
`gpg --decrypt crmpro-<date>.sql.gz.gpg | gunzip > restore.sql` and
`npx wrangler d1 execute <new database> --remote --file restore.sql`.
Once a backup has run successfully, the Trust Center may say "an encrypted
copy of the database is taken every night" — not before (docs/SECURITY.md §8).

### 24. What changed on 2026-09-25 — design steps, logos, sign-up

**New Project now asks how things should look**, but only for what the project
really makes: a logo, two or three words for the feel, a colour theme, and a
layout for each kind of output (social posts, pages and funnels, emails,
articles). Every question has **Let AI decide**, and each screen has **Let AI
decide all of these**. The choices are carried out when the work is made, not
just remembered: posts are drawn in the chosen layout and colours with the
logo in a corner, pages are built in that order and colour, branded emails get
a header and a button, and articles take the chosen shape.

**The logo is taken from the website** the moment one is given — found on the
page, shrunk to 320px and kept on the client's profile, so it becomes the
project's logo (the same one `ProjectLogo` shows). If none can be found, the
wizard asks for an upload. Nothing for you to do.

**Sign-up now proves the email address.** A new customer who signs up with a
password gets a six-digit code by email and must enter it before the account
exists. **This needs item 15** — a mailbox connected in *your own* workspace.
Until then, sign-up keeps working the old way (unproved) rather than being
blocked.

**Sign-in codes no longer go out through a customer's mailbox.** They used to
use the first mailbox on the install, whoever owned it — and Gmail keeps what it
sends in the Sent folder, so that customer could have read other people's
sign-in codes, including yours. Codes now come only from your own mailbox
(item 15). If you use "Email me a sign-in code" for yourself, connect it before
you next need it.

Checks you can run: `npm run test:design` (68, no server needed) and
`npm run test:signup` (16, needs a fresh local database — see the file).

## Done

- **Master password restored** (2026-09-09) — still needs changing, see 1.
- **`npm run smoke`** exists — an end-to-end check that a workspace survives
  signing out and back in on a clean browser. Run it after anything that
  touches sync, auth or onboarding.
- **Deploys go through GitHub Actions**, never by hand. Push to `main`;
  `.github/workflows/deploy.yml` typechecks, builds, applies D1 migrations and
  then publishes, in that order.
