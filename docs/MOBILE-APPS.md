# The phone apps — publishing them, click by click

There are two apps, each for Android and iPhone:

| App | Who it is for | Opens on | Store name | ID |
|---|---|---|---|---|
| **Protected Central** | Every customer — the whole product | the dashboard | Protected Central | `com.protectedcentral.app` |
| **PC Support** | You (and any business answering its own customers) — calls, screen shares, chats, tickets | the support inbox | PC Support | `com.protectedcentral.support` |

Both load **app.protectedcentral.com** inside the app. Every web release you
promote reaches both apps straight away — no store update needed. You only
build a new version when something in `mobile/` changes.

**What is different inside the apps** (so the stores accept them):

- **No plan purchases.** Apple and Google make apps use their own billing
  for subscriptions. So plans are bought on the website only, and the app does
  not mention or link to that. Everything else works the same.
- **No "Continue with Google".** Google blocks its sign-in inside apps. People
  sign in with the email code or a password instead.
- **Push alerts.** The phone rings for a call or a screen-share request, and
  buzzes for a chat waiting for a person, a new chat message, or a new ticket,
  even when the app is closed. This needs part 4 below. Until then the apps
  only alert while open.

---

## Part 0 — Try them on your own phone today

**Android (both apps):**

1. On your Android phone, open the two `.apk` files I sent you:
   `ProtectedCentral-1.0.apk` and `ProtectedCentralSupport-1.0.apk`. Email
   them to yourself, or put them on Google Drive and open them there.
2. Tap the file. If Android says *"For your security, your phone is not
   allowed to install unknown apps from this source"*, tap **Settings**.
   Switch on **Allow from this source**, then go back.
3. Tap **Install**, then **Open**.
4. Sign in with your email and the code.

These installed files work like the store versions, but they have no push
alerts until part 4 is done and the apps are rebuilt.

**iPhone:** Apple only allows installing through TestFlight or the App
Store, so the iPhone apps first need part 3.

---

## Part 1 — Accounts you need (once)

| Store | Cost | Where |
|---|---|---|
| Google Play | $25, once | play.google.com/console/signup |
| Apple App Store | $99 a year | developer.apple.com/programs/enroll |

1. **Google Play:** go to play.google.com/console/signup. Choose
   **Organization** if you have a registered company; it needs a D-U-N-S number,
   which is free from dnb.com and takes a few days. Otherwise choose **Yourself**.
   Pay the $25 and verify your identity.
   - A *personal* account must run a **closed test with at least 12 testers for
     14 days** before Google lets the app go public. An organization account
     skips that. This is Google's rule, not ours.
2. **Apple:** go to developer.apple.com/programs/enroll and tap
   **Start your enrollment**. Choose **Organization** (also needs the D-U-N-S
   number) or **Individual**. Pay the $99.

---

## Part 2 — Android: Google Play

### 2.1 Put the signing key in GitHub (once)

I made your Android **upload key** and sent it to you in the
`android-signing` folder:
- `protected-central-upload.jks` — the key itself;
- `protected-central-upload.jks.base64.txt` — the same key, as text;
- `passwords.txt` — its passwords.

**Keep all three somewhere safe and private**, such as a password manager.
They are not in the code repository and must never be.

1. Go to **github.com/azeem-654/calude** and click **Settings**.
2. In the left menu, click **Secrets and variables → Actions**.
3. Click **New repository secret** and add these four, one at a time:

| Name | Value |
|---|---|
| `ANDROID_KEYSTORE_BASE64` | everything in `protected-central-upload.jks.base64.txt` |
| `ANDROID_KEYSTORE_PASSWORD` | the value after `ANDROID_KEYSTORE_PASSWORD=` in `passwords.txt` |
| `ANDROID_KEY_ALIAS` | `upload` |
| `ANDROID_KEY_PASSWORD` | the value after `ANDROID_KEY_PASSWORD=` in `passwords.txt` |

### 2.2 Create the app in Play Console (do this twice, once per app)

1. In play.google.com/console, click **Create app**.
2. Fill in:
   - **App name:** `Protected Central` (the second time: `PC Support`);
   - **Default language:** English (United States);
   - **App or game:** App;
   - **Free or paid:** Free.
3. Tick both declarations and click **Create app**.

### 2.3 Upload the first version

1. In the left menu, click **Test and release → Testing → Internal testing**.
2. Click **Create new release**.
3. When asked about **Play App Signing**, click **Continue** to let Google
   manage the app signing key. Your upload key stays yours.
4. Under **App bundles**, upload the `.aab` file:
   - `ProtectedCentral-1.0-play.aab` for Protected Central;
   - `ProtectedCentralSupport-1.0-play.aab` for PC Support.
5. **Release name:** `1.0`. Click **Next**, then **Save and publish**.
6. In the **Testers** tab, create an email list with your own address, then
   open the **opt-in link** on your phone to install from Play.

### 2.4 Store listing (left menu: Grow users → Store presence → Main store listing)

- **Short description** (80 characters max):
  - Protected Central: `Your CRM, AI Autopilot and prospecting — describe it, AI builds it.`
  - PC Support: `Answer your customers' calls, chats, screen shares and tickets anywhere.`
- **Full description:** use the text in part 6.
- **App icon:** `mobile/assets/<app>/icon-512.png`.
- **Feature graphic:** `mobile/assets/<app>/feature-1024x500.png`.
- **Phone screenshots:** every file in `mobile/assets/<app>/store/play/`.

### 2.5 App content (left menu: Policy and programs → App content)

Answer each item:

- **Privacy policy:** `https://protectedcentral.com/privacy`
- **App access:** choose *All or some functionality is restricted*, then
  **Add instructions** with a review account. Make one first: sign up on the
  website as `review@protectedcentral.com` with a password, and add a little
  sample data. Paste the email and password here.
- **Ads:** No.
- **Content rating:** start the questionnaire, category *Utility/Productivity*,
  and answer **No** to everything (violence, gambling, …). For user-generated
  content, answer **Yes, users can communicate** (chat).
- **Target audience:** 18 and over.
- **Data safety:** see the table in part 5.
- **Government app:** No. **Financial features:** none. **Health:** none.

### 2.6 Go live

- **Organization account:** **Test and release → Production → Create new
  release**, add the same `.aab`, then **Send for review**. It usually takes
  1–7 days.
- **Personal account:** first **Closed testing**. Add 12 or more testers (friends
  or staff with Android phones) and keep it running 14 days. Then apply for
  production in the dashboard.

---

## Part 3 — iPhone: App Store

### 3.1 Register the two app IDs

1. Go to developer.apple.com/account and click **Certificates, IDs & Profiles**.
2. Click **Identifiers**, then **+**.
3. Choose **App IDs**, click **Continue**, choose **App**, click **Continue**.
4. Fill in:
   - **Description:** `Protected Central`;
   - **Bundle ID:** choose **Explicit** and type `com.protectedcentral.app`;
   - under **Capabilities**, tick **Push Notifications**.
5. Click **Continue**, then **Register**.
6. Do it again for `PC Support`, `com.protectedcentral.support`.

### 3.2 Create the apps in App Store Connect

1. Go to appstoreconnect.apple.com, click **Apps**, then **+ → New App**.
2. Fill in:
   - **Platform:** iOS;
   - **Name:** `Protected Central`;
   - **Primary language:** English (U.S.);
   - **Bundle ID:** `com.protectedcentral.app`;
   - **SKU:** `pc-app`;
   - **User access:** Full access.
3. Click **Create**. Do it again for `PC Support`, `com.protectedcentral.support`
   and SKU `pc-support`.

### 3.3 A key that lets GitHub build and upload for you

1. In App Store Connect, go to **Users and Access → Integrations → App Store
   Connect API**.
2. Click **Generate API Key** (or **+**). Name it `GitHub`, choose
   **App Manager**, then click **Generate**.
3. Click **Download** next to the new key. You can only download it **once**;
   save the `.p8` file safely.
4. On the same page, copy the **Issuer ID** (top) and the key's **Key ID**.
5. Find your **Team ID**: developer.apple.com/account → **Membership details**.
6. In GitHub → Settings → Secrets and variables → Actions, add:

| Name | Value |
|---|---|
| `APPSTORE_API_KEY_ID` | the Key ID |
| `APPSTORE_API_ISSUER_ID` | the Issuer ID |
| `APPSTORE_API_KEY_P8` | open the `.p8` file in a text editor and paste all of it, including the `-----BEGIN…` and `-----END…` lines |
| `APPLE_TEAM_ID` | the Team ID |

### 3.4 Build and upload

1. On github.com/azeem-654/calude, click **Actions**.
2. In the left list, click **Build phone apps**, then **Run workflow**.
3. Choose **apps:** both, **platforms:** ios, **version:** `1.0`, **build
   number:** `1`. Click **Run workflow**.
4. Wait for the green tick, about 15 minutes. Both apps are now in App Store
   Connect under **TestFlight**. Apple takes 5–30 minutes more to process them.
5. In **TestFlight → Internal Testing**, click **+**, add yourself, and install
   the **TestFlight** app on your iPhone to get both apps.

### 3.5 The App Store listing (each app → the "1.0 Prepare for Submission" page)

- **Screenshots, 6.9" display:** every file in `mobile/assets/<app>/store/appstore/`.
- **Promotional text / Description / Keywords:** part 6.
- **Support URL:** `https://protectedcentral.com`
- **Privacy policy URL:** `https://protectedcentral.com/privacy`
- **App Privacy** (left menu): answer as in part 5.
- **Build:** click **+** and pick the build uploaded in 3.4.
- **App Review Information:** tick *Sign-in required* and enter the review
  account from 2.5. In **Notes**, paste:
  > Protected Central is a business CRM and support tool. Plans are managed
  > outside the app; no purchases are offered in the app. Sign in with the
  > account above. Push notifications alert the business to customer calls,
  > screen-share requests, chats and tickets.
- Click **Add for Review**, then **Submit for Review**. It usually takes 1–3 days.

**If Apple says "4.2 Minimum Functionality"** (that the app is "just a
website"), reply in Resolution Center with the native features it uses:
- push alerts for calls, chats and tickets with the app closed;
- calls using the microphone;
- an offline screen;
- the dedicated support app.

If they still refuse, ask me. The next step is adding native screens.

---

## Part 4 — Push alerts (calls, chats and tickets with the app closed)

### 4.1 Android — Firebase

1. Go to console.firebase.google.com and click **Create a project**. Name it
   `Protected Central` and turn off Google Analytics (not needed).
2. On the project page, click the **Android** icon to add an app. Use package
   name `com.protectedcentral.app` and click **Register app**.
3. Skip the download for now and click **Next** until you finish.
4. Click **Add app → Android** again for `com.protectedcentral.support`.
5. Click the gear icon, then **Project settings**. Scroll to **Your apps** and
   click **google-services.json** to download it. One file covers both apps.
6. In GitHub → Settings → Secrets and variables → Actions, add a secret named
   `GOOGLE_SERVICES_JSON` and paste the file's whole contents.
7. Still in Firebase **Project settings**, open the **Service accounts** tab,
   click **Generate new private key**, then **Generate key**. A `.json` file
   downloads.
8. Go to dash.cloudflare.com → **Workers & Pages** → **crmpro** → **Settings →
   Variables and Secrets**.
   - Click **Add**, choose type **Secret**.
   - **Name:** `FCM_SERVICE_ACCOUNT`.
   - **Value:** paste that `.json` file's whole contents.
   - Click **Deploy**.
   - Do the same on **crmpro-staging**.
9. Rebuild the Android apps (part 7) so they include Firebase.

### 4.2 iPhone — Apple push key

1. Go to developer.apple.com/account → **Certificates, IDs & Profiles →
   Keys** and click **+**.
2. **Key name:** `Protected Central push`. Tick **Apple Push Notifications
   service (APNs)**, click **Configure**, and choose **Production**.
3. Click **Continue**, then **Register**, then **Download**. You can only
   download it once; save the `.p8` file safely.
4. Note the **Key ID** on that page.
5. In Cloudflare → crmpro → Settings → Variables and Secrets, add three
   **Secrets**, then click **Deploy**. Repeat on crmpro-staging.

| Name | Value |
|---|---|
| `APNS_KEY` | the whole `.p8` file's contents |
| `APNS_KEY_ID` | the Key ID |
| `APNS_TEAM_ID` | your Team ID |

To check it worked: in the app, open **Settings → Platform services**. Both
**Android phone alerts** and **iPhone alerts** should no longer say *off*.

---

## Part 5 — Privacy answers (Play "Data safety" and Apple "App Privacy")

The apps collect only what your workspace already holds. Nothing is sold;
nothing is used for advertising or tracking.

| Data | Collected | Why | Shared with third parties |
|---|---|---|---|
| Name, email address | Yes | Account, sign-in | No |
| Phone number | Yes (if the user adds one) | Account, contacting customers | No |
| Other user content (contacts, notes, messages, tickets) | Yes | App functionality | No |
| Photos | Yes (pictures sent in a chat) | App functionality | No |
| Audio | No — calls go phone to phone and are not recorded | — | — |
| Device ID (push token) | Yes | Push alerts | No |
| Crash logs / analytics | No | — | — |

- Encrypted in transit: **Yes**.
- Users can ask for deletion: **Yes**, in **Settings → Security & Privacy →
  Delete your account**.
- Apple "Tracking": **No**.

---

## Part 6 — Store text

**Protected Central** (full description):

> Describe what you want and Protected Central's AI builds it — the workflows,
> the AI agents and the campaigns — then runs them for you around the clock.
>
> • AI Autopilot: one sentence becomes a working system. Anything that sends
>   waits for your approval.
> • AI Prospecting: say who you sell to and get businesses you can reach, with
>   the email each one publishes, checked before you send.
> • CRM and pipeline: every lead, deal and next step in one place.
> • Campaigns and follow-ups that send themselves on schedule.
> • Content, websites, funnels and booking pages in your brand.
> • Support: live chat, tickets, calls and screen sharing with your customers.
>
> Your workspace is the same on the web and in the app — sign in and carry on.

**PC Support** (full description):

> Answer your customers wherever you are. PC Support rings when a customer
> calls or asks to share their screen from your website, and alerts you when
> a chat is waiting for a person or a new ticket arrives.
>
> • Take calls from your website in the app.
> • See a customer's screen when they share it (view only).
> • Reply to live chats and tickets, with the customer's history beside you.
> • Hand a conversation back to the AI assistant when you are done.
>
> For businesses using Protected Central.

**Keywords (Apple, 100 characters):**
`crm,ai,automation,leads,prospecting,marketing,support,live chat,tickets,helpdesk`

---

## Part 7 — Updating the apps later

**Web changes need nothing.** Every release you promote is in the apps
immediately.

**Native changes** (anything under `mobile/`, a new icon, or Firebase
added) need a rebuild:

1. Go to **Actions → Build phone apps → Run workflow**. Raise the **build
   number** every time (2, 3, 4…); the stores refuse a number they have seen.
2. **Android:** download the artifact from the run, then upload the `.aab`
   in Play Console as in 2.3. Use **Production** once live.
3. **iPhone:** it is already in TestFlight. Add it to a new App Store version
   and submit.

For developers: `mobile/README.md`.
