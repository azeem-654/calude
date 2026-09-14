# Digital Business Setup — going live

A customer types their business name into the project wizard, picks a domain,
pays once, and the app registers the domain, writes its DNS, creates the
mailboxes, publishes a starter site, fits out the workspace, sends a welcome
email and starts the content engine. They never learn who any of it was bought
from.

This is what you have to do once, before the first customer can use it.

---

## 1. Your Openprovider account

Openprovider is a **reseller** account: you hold it, you are billed by them, and
your customers never see it.

1. Sign up at openprovider.com and complete the reseller onboarding.
2. **Enable API access.** Their API is authenticated with your ordinary account
   username and password against `POST /v1/auth/login`.
3. **Do not set an IP allow-list.** Openprovider lets you restrict API access to
   named IP addresses. Cloudflare Workers do not have a fixed outbound IP, so an
   allow-list will refuse every call this app makes. If your account security
   policy requires one, this feature cannot run on Workers as built.
4. Add funds or a payment method. Every registration is charged to your
   Openprovider balance at the moment it happens.
5. **Buy at least one Business Email seat** if you want mailboxes. The app buys
   seats as it needs them, but an account that has never had one may need the
   product enabled on it first.
6. Note the hostname your business email runs on — it is per-reseller, and a
   mailbox pointed at the wrong host authenticates against nothing.

## 2. Connect it in the app

**Settings → Domains & Email → Domain and email provider** (owner only).

| Field | What goes in it |
|---|---|
| Username | Your Openprovider login |
| Password | Your Openprovider password — stored encrypted, never shown again |
| Reseller ID | From your Openprovider dashboard |
| Mail server hostname | The business-email host from step 1.6 |
| Sandbox | Tick it while testing — searches and registrations are simulated and cost nothing |

Press **Save**, then **Test**. Test performs a domain availability check, which
creates nothing and costs nothing; a green "Working" means the credentials and
the network path are both good.

**Start in the sandbox.** Run one whole purchase through it — search, pay,
watch the progress list finish — before you untick it. The sandbox is
`api.sandbox.openprovider.nl`; live is `api.openprovider.eu`, and the app
switches between them from that one checkbox.

## 3. Set your prices

**Settings → Domains & Email → What customers pay.**

Prices are yours alone. Openprovider's own suggested retail price is read and
discarded — the customer is quoted from this table and nothing else.

- **Domains** are priced per extension, per year. A `.com` at 24.00 sells at
  24.00 whatever it cost you.
- **Services** — email, hosting, CRM — are priced per month. Email is per
  mailbox.
- **The AI Autopilot Content Engine** ships at zero and still appears on the
  receipt as "Included". Price it if you want to.
- **Fallback markup** applies only to extensions with no price of their own, and
  to premium names. A premium `.com` can cost hundreds at wholesale, so it is
  always priced from cost plus this percentage — never at the flat rate.

Change a price whenever you like. An order already placed keeps the price it was
sold at: the quote is frozen onto the order at checkout.

## 4. Make sure you can take the payment

Setup orders are charged through the same processor as your subscriptions —
**Settings → Billing**. If that is not connected, checkout refuses by name
rather than failing at the payment page.

The processor's webhook is what marks an order paid and starts provisioning. If
the webhook is not configured, **payments will succeed and nothing will be built**,
because the app never finds out. Check "webhook set" says yes.

---

## What happens after a customer pays

Seven steps, in this order, each one a row in the database:

1. **Domain** — registered, with the customer as the legal registrant and WHOIS
   privacy on.
2. **DNS** — `www` pointing at this deployment, MX at your mail host, SPF and a
   DMARC record on `p=none`.
3. **Mailboxes** — each address bought and created, its password encrypted and
   stored. The first becomes the workspace's sending mailbox.
4. **Website** — a starter site written into the workspace, published and
   editable in Websites → Sites.
5. **Workspace** — the company profile filled in, which is what every AI writer
   in the app reads from.
6. **Welcome email** — sent *from the customer's own new mailbox*, so its
   arrival is proof their email works.
7. **Handoff** — the project is set running with no plan, and the content engine
   picks it up on the same tick.

**A failure stops at that step and nothing after it runs.** The runner retries
from wherever it stopped, four times, then marks the order failed and leaves it
for you. Every step is safe to run twice: a domain already registered, a mailbox
already created and a site already published are all recognised and skipped.

The cron fires every five minutes and sweeps any unfinished order, so an order
whose Worker was killed mid-run finishes itself.

---

## When something breaks

**Settings → Domains & Email → Provisioning jobs** (owner only). Every order,
every step, how many times it was tried, and **the provider's own error text**.

That last part is the point: the customer's screen says "we could not register
that domain, our team is on it", and yours says the registrar rejected the
postcode. Fix the cause, press **Retry the failed steps**, and the order carries
on from where it stopped.

Margin is shown per order — what you charged minus what it cost you. It is the
only place in the app those two numbers appear together.

---

## What is deliberately not built

- **Pointing the bare domain at the site.** DNS sets `www` as a CNAME to this
  deployment. The apex cannot be a CNAME, and serving a customer's own hostname
  from a Cloudflare Worker needs the domain attached to your Cloudflare account
  as a custom hostname — a different API, and not part of this. The starter site
  is live on this deployment's own address immediately; the customer's domain
  serves it at `www` once DNS spreads.
- **A recurring subscription for the monthly services.** Checkout charges the
  year of domain plus the first month of services, and says so in those words.
  Billing the following months is your subscription, set up under Settings →
  Billing.
- **Renewals.** Domains are registered with autorenew **off**, deliberately: an
  automatic charge nobody chose is the fastest route to a chargeback. Renewing
  is your decision, from your Openprovider dashboard.

## Swapping provider later

`worker/src/lib/registrars/types.ts` defines what a provider has to do.
`openprovider.ts` implements it; `index.ts` is a one-line registry. Nothing
outside that folder names a provider, so a replacement is a new file and a new
line — not a rewrite.
