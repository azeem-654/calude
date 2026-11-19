# Switching on customers' own domains (Cloudflare for SaaS)

Owner-only, done once, about 15 minutes.

## How customers' addresses work (2026-11-19)

| Where | Example | Needs Cloudflare for SaaS? |
|---|---|---|
| **Free, on our site** — every business's pages | `protectedcentral.com/abcplumbing` (home page), `protectedcentral.com/abcplumbing/sales` | No — works as soon as they publish |
| **Free address for a reseller's client sign-in** | `abcagency.protectedcentral.com` | No |
| **Their own domain, a name under it** | `sales.abcplumbing.com` | Yes |
| **Their own domain, the root** | `abcplumbing.com` | Yes — and their DNS must allow it (below) |

For each own-domain or free address, the customer picks in **Settings →
Branding → Visitors see** whether it shows **their website** (the home page at
`/`, each published page at `/page-name`) or **their client sign-in** (the CRM
with their logo).

`whitelabel.protectedcentral.com` is a behind-the-scenes landing spot, not a
place anybody visits: every customer's domain points at it with one DNS record
(`sales.abcplumbing.com → whitelabel.protectedcentral.com`), Cloudflare puts
the padlock on *their* name, and the app looks up whose name it is. Visitors
only ever see the customer's own address.

**The root of a domain**: DNS forbids a CNAME on a root at most hosts.
Cloudflare DNS (free) flattens it, and some hosts have ALIAS/ANAME records;
GoDaddy and Namecheap have neither — those customers connect
`www.abcplumbing.com` and forward the root to it. The app says this when
somebody types a root. (Cloudflare's static IPs for roots are Enterprise-only.)

## Step 1 — Turn on Custom Hostnames

1. Sign in at **dash.cloudflare.com**.
2. Click the **protectedcentral.com** zone (not chasepassion.com, not
   gohighlevelinstitute.com).
3. Left menu → **SSL/TLS** → **Custom Hostnames**.
4. Click **Enable Cloudflare for SaaS** (the wording can vary slightly).
   It may ask for a payment method. **Read the price it shows before you
   confirm** — at the time of writing the first 100 custom hostnames are
   included and each one after that is billed monthly.
5. Leave this page open; you come back to it in step 3.

## Step 2 — Create the fallback origin record

Cloudflare needs a hostname on our zone that customers' domains are pointed at.

1. Left menu → **DNS** → **Records** → **Add record**.
2. Type **AAAA**. Name **whitelabel**. IPv6 address **100::** (that is
   "one hundred, colon, colon" — a placeholder that means "the Worker answers").
3. Proxy status: **Proxied** (orange cloud **on**). TTL Auto.
4. **Save**.

## Step 3 — Set it as the fallback origin

1. Back on **SSL/TLS → Custom Hostnames**.
2. In **Fallback Origin**, type `whitelabel.protectedcentral.com` →
   **Add Fallback Origin**.
3. Wait until it shows **Active** (refresh after a minute).

## Step 4 — Send those visitors to the app's Worker

1. Left menu → **Workers Routes** (on the protectedcentral.com zone).
2. **Add route**. Route: `*/*` — exactly that. Worker: **crmpro** (the live
   app; **not** crmpro-staging). **Save**.

This changes nothing for our own addresses: they already go to crmpro, and the
staging site's more specific `testing.protectedcentral.com/*` route still wins.

## Step 5 — Make a token the app can use

1. Top right, your profile icon → **My Profile** → **API Tokens** →
   **Create Token** → **Create Custom Token** → **Get started**.
2. Name: `Protected Central custom hostnames`.
3. Permissions: **Zone** · **SSL and Certificates** · **Edit**.
4. Zone Resources: **Include** · **Specific zone** · **protectedcentral.com**.
5. **Continue to summary** → **Create Token** → **Copy** it. Cloudflare shows
   it once. Do not paste it into any chat.
6. Copy the **Zone ID** too: protectedcentral.com → **Overview** → right-hand
   column, *API* → Zone ID.

## Step 6 — Connect it in the app

1. Sign in at **app.protectedcentral.com** as azeem@protectedcentral.com.
2. **Settings → Branding** → scroll to **Cloudflare for SaaS — installation
   owner only**.
3. Paste the **Zone ID**, the **API token**, and CNAME target
   `whitelabel.protectedcentral.com` → **Save and test**.
4. Green "Connected — Cloudflare accepted it" means done: every reseller now
   sees **Your own domain**. Red shows Cloudflare's own reason (usually: step 1
   not finished, or the token is missing *SSL and Certificates: Edit*).

Do the same on **testing.protectedcentral.com** only if you want to try it
there first — the two sites have separate databases, so each is connected
separately (same zone, same token is fine).

## Undo

Settings → Branding → remove every custom domain; delete the `*/*` Workers
route; SSL/TLS → Custom Hostnames → delete the fallback origin; DNS → delete
`whitelabel`; My Profile → API Tokens → **Roll** or **Delete** the token.
