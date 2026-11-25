# Brief for a local session — Protected Central on Google Play (internal testing)

Written 2026-11-25 by the cloud session. Owner checklist item 27, Android only.

## Goal

The owner installs **Protected Central** (`com.protectedcentral.app`) on their
own Android phone **from the Play Store** — no "unknown app" or Play Protect
warning — through Play Console's **Internal testing** track. Nothing goes to
production, closed testing or the App Store in this session.

**One app, not two (recommended 2026-11-25 — confirm with the owner at step 1; if they want both, ask before doing PC Support the same way).** The customer app
already contains the whole product: Customer Engagement (chats, tickets, live
help, calls), the Unified Inbox, campaigns and Autopilot, and it receives the
same push alerts as PC Support. Signed in as azeem@protectedcentral.com, the
owner can answer support *and* run their own campaigns in it. **PC Support
(`com.protectedcentral.support`) is not created or uploaded in this session**;
it stays in `mobile/` in case resellers want a separate support app later.

## Rules

- **Do not change code.** If something in `mobile/` or the workflow must
  change, stop and describe it in the report; the cloud session makes it.
- **Before anything is saved, uploaded, published or paid for** — in Play
  Console, GitHub secrets, Firebase or Cloudflare — show the owner what you are
  about to save and wait for their yes.
- **Never put a password, keystore, key file, token or its contents** in the
  report, the chat, a commit or the repository. Names of secrets only.
- **Do not promote to live** and do not push to `main` or `staging`. If the
  owner asks for a promote in this chat, use Actions → **Promote testing to
  live** only.
- Use existing projects and accounts; do not create a second Play app, a
  second Firebase project or a new Google Cloud project if one already exists.
- When finished, write `docs/audit/2026-11-25-play-results.md` and push **only
  that file** to the branch `local/results`.

## Read first

`docs/MOBILE-APPS.md` — Part 1 (accounts), Part 2 (Google Play), Part 4.1
(Firebase push), Part 5 (privacy answers), Part 6 (store text). Every click
below is described there in more detail.

## Steps — report each as passed, failed (with what was on screen) or waiting on the owner

1. **Pull, and confirm one app.** `git fetch origin staging && git checkout staging && git pull`. Ask the owner to confirm: only Protected Central now, PC Support not uploaded.

2. **Play developer account.** Ask the owner to sign in at
   play.google.com/console. If there is no account yet, the owner creates it
   (Part 1: $25 once, identity check — personal or organisation). Identity
   verification can take days: if it is pending, record that and stop at this
   step. Internal testing works on either account type; the 12-testers/14-days
   rule only applies to going public on a personal account.

3. **Upload key in GitHub.** On github.com/azeem-654/calude → Settings →
   Secrets and variables → Actions, check whether these exist (names only):
   `ANDROID_KEYSTORE_BASE64`, `ANDROID_KEYSTORE_PASSWORD`, `ANDROID_KEY_ALIAS`,
   `ANDROID_KEY_PASSWORD`.
   - Present → go on.
   - Missing → ask the owner for the `android-signing` folder sent earlier
     (Part 2.1) and add the four secrets from it, after their yes.
   - Folder lost and nothing ever uploaded to Play → make a new upload key on
     this machine with `keytool -genkeypair -v -keystore protected-central-upload.jks -alias upload -keyalg RSA -keysize 2048 -validity 10000`,
     **outside the repository folder**, passwords from a generator, kept in the
     owner's password manager; then the four secrets as above. Say plainly in
     the report that a new key was made and where the owner keeps it.

4. **Push alerts (ask the owner first; recommended).** Without this the app
   only alerts while open — chats and calls will not ring the phone. Part 4.1:
   one Firebase project "Protected Central" (reuse if it exists), Android app
   `com.protectedcentral.app` (skip the support package), download
   `google-services.json` → GitHub secret `GOOGLE_SERVICES_JSON`; service-account
   key → Cloudflare secret `FCM_SERVICE_ACCOUNT` on **crmpro** and
   **crmpro-staging**. Each save waits for the owner's yes. If the owner says
   later, skip it — the build works without it.

5. **Build.** GitHub → Actions → **Build phone apps** → Run workflow on `main`
   with apps = **customer**, platforms = **android**, version name `1.0`,
   version code `1` (or one higher than anything already uploaded to this Play
   app). Wait for green. Download the `android-customer-…` artifact. Confirm
   from the run log that the bundle was **signed** with the upload key (not
   debug/unsigned) and whether the push flag was included.

6. **Create the app in Play Console** (Part 2.2), only if "Protected Central"
   does not already exist: name `Protected Central`, English (United States),
   App, Free. Show the owner the form before **Create app**.

7. **Internal testing release** (Part 2.3): Test and release → Testing →
   Internal testing → Create new release → accept **Play App Signing** → upload
   the `.aab` → release name `1.0` → note "First internal build". Show the
   owner the release summary before **Save and publish**.
   - If Play refuses because setup items are unfinished (app access, ads,
     content rating, target audience, data safety, privacy policy), fill only
     the ones it demands, using Part 2.5, Part 5 and Part 6. For **App access**
     use a review account the owner creates; its password goes in Play only,
     never in the report.

8. **Testers.** Internal testing → Testers → create an email list containing
   the Google account signed in on the owner's phone (ask which; probably
   aiautomationapp@gmail.com). Save after their yes. Copy the **opt-in link**.

9. **Install on the phone (owner does it, you guide).** On the phone, signed
   in to Play with that same Google account: open the opt-in link → **Become a
   tester** → **Download it on Google Play** → Install. It can take a few
   minutes after publishing before Play offers it. Record whether any warning
   appeared (there should be none).

10. **Check on the phone (owner reads out what they see).**
    - Sign in with the email code or password (Google sign-in is hidden in the
      app by design — Google blocks it in apps).
    - Dashboard loads; no plan-purchase buttons (by design for Play billing).
    - Customer Engagement → Conversations and Tickets open.
    - Unified Inbox opens. (**New email** is on testing now and reaches the
      app only after the next promote to live — do not promote for this.)
    - If step 4 was done: Settings → Platform services says push is on, and a
      test chat from the website widget makes the phone buzz with the app closed.

## Report

`docs/audit/2026-11-25-play-results.md`: each step's status; the Play app's
name, package and track; the version name/code uploaded; whether the bundle was
signed and had push; whether push secrets were set (names only); the testers
list name (not its members' addresses beyond the owner's); whether the phone
installed from Play without warnings; and what is left for the owner (e.g.
store listing, closed test for production, iPhone).
