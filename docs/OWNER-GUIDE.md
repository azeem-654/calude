# Your to-do list, one click at a time

Everything below needs **your** hands — your passwords, your Google, Cloudflare,
Stripe or Creem account, your money. Nobody else can do it, and the app works
without most of it, but each item switches something on or makes it safe.

It is the same list as `docs/OWNER-CHECKLIST.md` (which has the reasons and the
history), written as steps. **Do them in this order** — the first block is
security and is the most important. Tick each box as you go. When one is done,
tell the next session, and it will be crossed off the checklist.

Two words used all the way through:

- **Live app** = <https://app.protectedcentral.com> — what customers use.
- **Testing site** = <https://testing.protectedcentral.com> — your copy for
  trying things. It has its **own** accounts, passwords and keys; doing
  something on one does **not** do it on the other.

> **Start here — see what is missing in one screen.** Live app → sign in as
> **azeem@protectedcentral.com** → click **Settings** (the gear in the left
> bar) → click the last tab, **Platform services**. Every service you provide
> for everybody is listed with a coloured state: green *ok*, amber *unchecked*,
> red *error*, grey *off*. Keep this tab open while you work: most items below
> end on it, and you can watch them turn green.

---

## A. Security — do these first (about 30 minutes)

### ☐ 1. Change the master password

A password for your account was once written in a chat, so treat it as known.

1. Open the live app and sign in as **azeem@protectedcentral.com**.
2. Click **Settings** (gear icon, left bar).
3. Click the tab **Security & Privacy**.
4. Find **Change your password**.
5. Type your **current** password in the first box.
6. Type a **new** password — at least 12 characters, not used anywhere else.
   Best: let your password manager make one.
7. Type it again in the confirm box.
8. Click **Change password**.
9. ✅ You stay signed in here; every other device is signed out.

### ☐ 2. Turn on 2-step sign-in for your account

1. Still in **Settings → Security & Privacy**.
2. Find **2-step sign-in** → click **Turn on**.
3. On your phone, open an authenticator app (Google Authenticator, Microsoft
   Authenticator, 1Password, Authy — any of them).
4. In the app tap **+** → **Scan a QR code** → point it at the QR code on screen.
5. Type the 6-digit code the phone shows into the box → click **Confirm**.
6. **Save the backup codes** it shows (print them or put them in your password
   manager). They are the only way in if you lose the phone.
7. ✅ From now on, signing in asks for the 6-digit code after the password.

### ☐ 3. Set your testing-site password

The testing site has its own database, so your live password does not work
there.

1. Open <https://testing.protectedcentral.com>.
2. **If you see "Create your owner account":** type
   **azeem@protectedcentral.com**, choose a password (different from the live
   one), click **Create**. Done.
3. **If you see a normal sign-in and do not know the password:**
   1. Open <https://dash.cloudflare.com> and log in.
   2. Left menu → **Storage & Databases** → **D1 SQL Database**.
   3. Click **crmpro-staging** (read the name — *staging*).
   4. Click the **Console** tab.
   5. Paste: `DELETE FROM crm_users WHERE email = 'azeem@protectedcentral.com';`
      → click **Execute**.
   6. Go back to step 1: the site now offers **"Create your owner account"**.
   > Never run that DELETE on **crmpro** (the live one).

### ☐ 4. Set `CREDENTIAL_WRAP_KEY` on both Workers (locks every stored key)

1. Open your password manager and generate a random password, **40 characters**.
   Save it with the title **CREDENTIAL_WRAP_KEY — live**.
2. Generate a second one. Save it as **CREDENTIAL_WRAP_KEY — testing**.
3. Open <https://dash.cloudflare.com>.
4. Left menu → **Compute (Workers)** → **Workers & Pages**.
5. Click **crmpro** (the live one).
6. Click the **Settings** tab.
7. Scroll to **Variables and Secrets** → click **+ Add**.
8. **Type**: choose **Secret**.
9. **Variable name**: `CREDENTIAL_WRAP_KEY` (exactly, all capitals).
10. **Value**: paste the **live** value from step 1.
11. Click **Deploy**.
12. Go back to **Workers & Pages** → click **crmpro-staging** → repeat 6–11
    with the **testing** value.
13. Check: live app → **Settings → Security & Privacy**. A pill at the top says
    *CREDENTIAL_WRAP_KEY set* (and after some use, *Stored keys protected*).
> **Never change or delete these values afterwards.** A different value means
> every saved mailbox and key stops working until the old one is put back.

### ☐ 5. Set `BACKUP_PASSPHRASE` (nightly encrypted database backup)

1. Generate a long random phrase in your password manager; save it as
   **BACKUP_PASSPHRASE**. Also write it somewhere outside GitHub.
2. Open <https://github.com/azeem-654/calude>.
3. Click **Settings** (top tab of the repository).
4. Left menu → **Secrets and variables** → **Actions**.
5. Click **New repository secret**.
6. **Name**: `BACKUP_PASSPHRASE`. **Secret**: paste the phrase.
7. Click **Add secret**.
8. Click the **Actions** tab (top of the repository).
9. Left list → **Back up the live database** → click **Run workflow** →
   **Run workflow**.
10. Wait a minute, refresh: a green tick means the first backup worked. From
    now on it runs every night.

### ☐ 6. Create `security@protectedcentral.com` and `privacy@protectedcentral.com`

The website publishes both addresses; until they exist, mail to them bounces.

1. Open your mail host's admin (wherever **support@protectedcentral.com**
   lives).
2. Create **security@protectedcentral.com** — a new mailbox, or an **alias**
   that forwards to your own inbox (an alias is enough).
3. Create **privacy@protectedcentral.com** the same way.
4. Send a test email to each from your phone and check it arrives.

---

## B. Getting paid (about 30 minutes)

### ☐ 7. Check payments are connected

1. Live app → **Settings** → **Platform services**.
2. Find the **Payments** row.
   - Green **ok** → go to 8.
   - Grey or red → click it (it opens **Settings → Billing → How this app is
     paid**), then:
     1. Open <https://creem.io> (or Stripe) → **Developers** → **API keys** →
        copy the **live** key (not `creem_test_…`).
     2. Back in the app: paste it → **Save** → **Test** → green tick.
     3. Copy the **webhook address** the panel shows.
     4. In Creem: **Developers → Webhooks → Add endpoint** → paste the address →
        tick the events in step 8 → **Save** → copy the **signing secret** →
        paste it back in the app → **Save**.

### ☐ 8. Send renewals and cancellations to the app

**If you use Creem:**
1. <https://creem.io> → **Developers** → **Webhooks** → click your endpoint.
2. Make sure these are ticked: **checkout.completed**, **subscription.paid**,
   **subscription.canceled**, **subscription.expired** → **Save**.

**If you use Stripe:**
1. <https://dashboard.stripe.com> → **Developers** → **Webhooks** → click the
   endpoint ending in `/api/billing-webhook.php`.
2. Click **… → Update details** (or **Select events**).
3. Make sure these are ticked: **checkout.session.completed**,
   **invoice.paid**, **invoice.payment_failed**,
   **customer.subscription.deleted** → **Update endpoint**.

### ☐ 9. Stripe only: switch on the customer portal

1. <https://dashboard.stripe.com> → **Settings** (gear, top right) →
   **Billing** → **Customer portal**.
2. Leave the defaults → click **Save** (or **Activate**).
(Creem needs nothing.)

### ☐ 10. Make sure your plan prices have **no** free trial

The app already gives every sign-up 7 days free.

1. Stripe → **Product catalogue** → open each plan → click its **price**.
   If it shows a *free trial*, edit it and remove the trial → **Save**.
   (Creem: open each product → remove any trial → **Save**.)

### ☐ 11. Fund Openprovider (only if you sell domains)

1. <https://cp.openprovider.eu> → log in → **Finance** (or **Billing**).
2. **Add funds** → choose an amount → pay.
3. Find **Automatic top-up** → turn it **on** → set a minimum balance → **Save**.

---

## C. AI and searches — keys you provide for everybody (about 45 minutes)

### ☐ 12. Billing on the Google Cloud project behind the AI key

1. <https://console.cloud.google.com> → top bar, pick the project your AI key
   is in.
2. Left menu (☰) → **Billing**.
3. If it says *This project has no billing account* → **Link a billing
   account** → choose yours → **Set account**.

### ☐ 13. Add two or three backup AI keys

1. Open <https://aistudio.google.com/apikey>.
2. Click **Create API key** → **Create API key in new project** → copy it.
   (A *new project* matters: keys in one project share one limit.)
3. Live app → **Settings → Platform services** → **AI keys — main and
   backups** → paste → click **Add backup key**. It is checked with Google
   before it is kept.
4. Repeat 2–3 once or twice more.
5. Do the same on the testing site (sign in there first).

### ☐ 14. The Google Maps key (prospect search on Google, and every customer's Reviews)

1. <https://console.cloud.google.com> → pick a project with billing on.
2. ☰ → **APIs & Services** → **Library** → search **Places API (New)** →
   click it → **Enable**. (It must say **(New)**.)
3. ☰ → **APIs & Services** → **Credentials** → **+ Create credentials** →
   **API key** → copy it (starts `AIza`).
4. Click the new key's name → **API restrictions** → **Restrict key** → tick
   only **Places API (New)** → **Save**. Leave *Application restrictions* at
   **None**.
5. Live app → **Settings → Platform services** → **Google Maps key (Places
   API)** → paste → **Save key** → **Test connection** → green.
6. Do step 5 on the testing site too.

### ☐ 15. Cap Google Maps so it can never bill you

1. <https://console.cloud.google.com> → the same project.
2. ☰ → **Google Maps Platform** → **Quotas**.
3. Pick **Places API (New)** in the list at the top.
4. Find **SearchTextRequest per day** → click the pencil → set **32** →
   **Save**.
5. ☰ → **Billing** → **Budgets & alerts** → **Create budget** → amount
   **$1** → keep the alert at 50/90/100% → **Finish**.

### ☐ 16. The business directory key on the **live** app (Geoapify)

Done on the testing site already; the live app keeps its own keys.

1. Open <https://myprojects.geoapify.com> → sign in (or sign up — free, no
   card).
2. Click your project (or **Create project** → any name).
3. Copy the **API key** shown.
4. Live app → **Settings → Platform services** → **Free business directory
   (Geoapify)** → paste → **Save key** → green.
> This also powers **daily prospecting** for every Autopilot project.

### ☐ 17. *Optional* — Email finder & verifier (the "Verified" badge)

1. Open <https://hunter.io> → sign up (free plan is fine).
2. Click your name (top right) → **API** → copy the **API key**.
3. Live app → **Settings → Platform services** → **Email finder & verifier**
   → choose **Hunter** → paste → **Save key** → green.
4. Repeat 3 on the testing site.

### ☐ 18. *Optional* — Verified business directories (UK company register)

1. Open <https://developer.company-information.service.gov.uk> → **Register**
   (free) → confirm your email.
2. **Your applications** → **Create an application** → any name → choose
   **Live** → **Create**.
3. Click **Create new key** → choose **REST** → **Create** → copy the key
   (long, with dashes).
4. Live app → **Settings → Platform services** → **Verified business
   directories (Companies House)** → paste → **Save key** → green.
5. Repeat 4 on the testing site.

---

## D. What your customers see (about 30 minutes)

### ☐ 19. Switch on the help button (on both sites)

1. Live app, signed in as azeem@protectedcentral.com → top menu **Customers**
   → **Customer Engagement**.
2. Click the **Widgets** tab → **New**.
3. Tick **Chat**, **Share your screen**, **Raise and check a ticket** (and
   **Call us now** if you want browser calls).
4. Tick **Use as the help button inside Protected Central**.
5. Optional: add your name and photo (PNG or JPEG, small) so the card shows
   who answers.
6. Click **Save and make it live**.
7. Open the website in a new tab: the **Help** card appears in the corner on
   every page load.
8. Repeat 1–6 on the testing site.

### ☐ 20. Set your kickoff-call booking link

1. Live app → top menu **Workspace** → **Sign-ups & trials**.
2. Find **Kickoff call & welcome**.
3. Paste a booking link (your own Booking page from the app, or any calendar
   link such as Calendly) → **Save**.

### ☐ 21. Read the onboarding emails and pick your digest hour

1. Same screen: **Workspace → Sign-ups & trials**.
2. **Onboarding emails** → read the day 1, 3 and 5 emails → change any words
   you want → **Save**.
3. **Daily digest** → choose the hour (your time zone) and the address →
   **Save**.
4. Click **Send me today's digest now** → check it arrives.

### ☐ 22. Google Calendar and Meet (bookings get Meet links)

1. <https://console.cloud.google.com> → the project with your **Google
   sign-in** client.
2. ☰ → **APIs & Services** → **Library** → search **Google Calendar API** →
   **Enable**.
3. ☰ → **APIs & Services** → **OAuth consent screen** (or **Google Auth
   Platform → Data access**) → **Add or remove scopes** → paste
   `https://www.googleapis.com/auth/calendar.events` → tick it → **Update** →
   **Save**.
4. ☰ → **APIs & Services** → **Credentials** → click your **OAuth 2.0 Client**
   → **Authorised redirect URIs** → **+ Add URI** twice:
   - `https://app.protectedcentral.com/api/calendar.php`
   - `https://testing.protectedcentral.com/api/calendar.php`
   → **Save**.
5. Live app → **Customers → Customer Engagement** → **Meetings** tab →
   **Connect a Google Calendar** → choose your Google account → **Allow**.

---

## E. Optional extras

### ☐ 23. *Optional* — a relay for screen sharing behind strict firewalls

1. <https://dash.cloudflare.com> → left menu **Realtime** → **TURN Server** →
   **Create** → copy the **Key ID** and the **API token**.
2. **Workers & Pages** → **crmpro** → **Settings** → **Variables and
   Secrets** → **+ Add** → Secret `TURN_KEY_ID` = the Key ID → **Deploy**.
3. **+ Add** → Secret `TURN_KEY_API_TOKEN` = the token → **Deploy**.
4. Repeat 2–3 on **crmpro-staging**.

### ☐ 24. *Optional* — choose a voice provider (AI phone answering)

Leave it off unless you want it; nothing else depends on it. When you do:
live app → **Settings → Platform services** → **Voice** row → follow the
link and the steps in `docs/OWNER-CHECKLIST.md` §18.

### ☐ 25. *Optional, takes Google weeks* — Google Business Profile (all reviews, reply from the app)

1. <https://console.cloud.google.com> → same project → **APIs & Services →
   Library** → enable all three: **My Business Account Management API**,
   **My Business Business Information API**, **Google My Business API**.
2. **OAuth consent screen → Scopes → Add** →
   `https://www.googleapis.com/auth/business.manage` → **Update** → **Save**.
3. **Credentials** → your OAuth client → **Authorised redirect URIs → + Add
   URI** twice:
   - `https://app.protectedcentral.com/api/reputation.php`
   - `https://testing.protectedcentral.com/api/reputation.php`
   → **Save**.
4. Search the web for **"Business Profile API access request form"** → fill it
   in for this project → submit → wait for Google's approval email.
5. After approval: live app → **Reviews** → **Settings** → **Review Sources**
   → **Connect Google Business Profile** → pick the location.

### ☐ 26. Check your Cloudflare plan

1. <https://dash.cloudflare.com> → **Manage account** → **Billing** →
   **Subscriptions**.
2. **Workers Paid** keeps 30 days of database history; **Free** keeps 7. If
   you are on Free and want 30 days, click **Workers Paid → Upgrade**.

### ☐ 27. A lawyer reads the legal pages

Send these three links to a lawyer and ask them to review:
- <https://protectedcentral.com/privacy>
- <https://protectedcentral.com/terms-of-service>
- <https://protectedcentral.com/affiliate-terms>

### ☐ 28. Before paid ads: a human voice for the videos

The launch film and the ad use a computer voice. Before spending on ads, have
a person record the script (`marketing/launch-film/lines.json`); a session can
swap the recording in.

---

## F. Regular jobs

### ☐ Every month — pay your affiliates

1. Live app → top menu **Workspace** → **Affiliate program** → **Manage program** tab.
2. It lists what is payable and how each affiliate wants paying.
3. Pay each one from your bank or PayPal.
4. Click **Mark paid** on each row you paid.

### ☐ Every week — content review

Live app → top menu **Workspace** → **Content review** → look through anything
held → approve it or remove it.

---

## G. Put the newest version live

Everything new is on the testing site first. When you have looked at it and
you are happy:

1. Open <https://github.com/azeem-654/calude/actions>.
2. Left list → **Promote testing to live**.
3. Click **Run workflow** → in the box type `PROMOTE` → **Run workflow**.
4. Left list → **Deploy to Cloudflare** → wait for its green tick (2–4
   minutes). Then the live site has it.
