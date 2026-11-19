# Switching on customers' own domains (Cloudflare for SaaS)

Owner-only, done once, about 15 minutes. Until it is done the app offers
resellers only the free address (`theirname.protectedcentral.com`) and says so.

After it, a reseller can put their branded sign-in on:

| What they want | Example | What they add at their DNS |
|---|---|---|
| A name under their domain | `sales.abccompany.com`, `app.abccompany.com` | CNAME → `customers.protectedcentral.com`, plus one TXT |
| The root of their domain | `abccompany.com` | The same CNAME **on the root** — only possible if their DNS is on Cloudflare (free) or a host with ALIAS/ANAME. GoDaddy and Namecheap cannot: connect `www.abccompany.com` and forward the root to it. The app says this when somebody types a root. |
| No domain at all | `abc.protectedcentral.com` | Nothing — works today |

Why the root is special: DNS forbids a CNAME on a root at most hosts.
Cloudflare offers static IPs for roots ("apex proxying") only on Enterprise,
so on our plan the routes above are the honest options.

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
2. Type **AAAA**. Name **customers**. IPv6 address **100::** (that is
   "one hundred, colon, colon" — a placeholder that means "the Worker answers").
3. Proxy status: **Proxied** (orange cloud **on**). TTL Auto.
4. **Save**.

## Step 3 — Set it as the fallback origin

1. Back on **SSL/TLS → Custom Hostnames**.
2. In **Fallback Origin**, type `customers.protectedcentral.com` →
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
   `customers.protectedcentral.com` → **Save and test**.
4. Green "Connected — Cloudflare accepted it" means done: every reseller now
   sees **Your own domain**. Red shows Cloudflare's own reason (usually: step 1
   not finished, or the token is missing *SSL and Certificates: Edit*).

Do the same on **testing.protectedcentral.com** only if you want to try it
there first — the two sites have separate databases, so each is connected
separately (same zone, same token is fine).

## Undo

Settings → Branding → remove every custom domain; delete the `*/*` Workers
route; SSL/TLS → Custom Hostnames → delete the fallback origin; DNS → delete
`customers`; My Profile → API Tokens → **Roll** or **Delete** the token.
