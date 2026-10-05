# mobile/ — the two phone apps

Capacitor 8 shells around **app.protectedcentral.com** (`server.url` in each
`capacitor.config.json`): `customer/` is **Protected Central**, `support/` is
**PC Support**. Each has its own generated `android/` and `ios/`. The owner's
step-by-step publishing guide is `docs/MOBILE-APPS.md`.

## Why a shell around the live site

The page is the product. Loading the deployed site means every web release
reaches the apps at once, the session cookie stays same-origin (the browser
never holds the token — CLAUDE.md, Security rules), and there is one
implementation of every screen. A bundled copy of `dist/` would pin each app to
the release it was built with, and its cross-origin API calls would lose the
HttpOnly cookie.

## How the page knows it is in an app

Each app appends `ProtectedCentralApp/1.0 (<customer|support>; <android|ios>[; push])`
to its user agent. `src/services/nativeApp.ts` reads it, and:

- hides plan purchases (`canBuyPlans`). The stores require their own billing
  for subscriptions bought in an app;
- hides Google sign-in, which Google blocks inside web views;
- registers for push (`NativeBridge.tsx`), and sends the support app to the
  inbox.

`; push` is always on for iPhone. On Android, `build.sh` adds it only when
`android/app/google-services.json` exists, because the push plugin crashes the
app without Firebase.

## Push

`worker/src/lib/push.ts` sends to iPhones straight through APNs and to
Android through FCM. Each needs its own Worker secrets: `APNS_KEY`,
`APNS_KEY_ID` and `APNS_TEAM_ID`, or `FCM_SERVICE_ACCOUNT`. Platform services
shows whether each is set.

The alert kinds:
- calls and screen-share requests (`live.call`, `live.requested`);
- a chat handed to a person (`conversation.escalated`);
- a visitor's message on a chat a person has taken over (throttled to one
  every two minutes per conversation);
- a new ticket.

The first four are raised from `recordEvent`, the visitor's message from
`engage.ts`. Devices are in `crm_push_devices` (migration 0065), filed under
the workspace that was open on the phone. `npm run test:push` checks the
sender against mock Google and Apple servers with real signatures.
`npm run test:nativeapp` checks the page inside each app.

## Commands

```bash
cd mobile && npm ci                  # Capacitor and plugins (npm workspaces)
node native.mjs                      # re-apply every native change (idempotent; needs ffmpeg on PATH or FFMPEG=)
./build.sh support debug             # an installable .apk (needs Java 21 + ANDROID_HOME)
./build.sh customer release 2 1.0.1  # .aab + .apk, signed when ANDROID_KEYSTORE_* are set
node assets/icons.mjs                # icons, splash, Play feature graphic
node assets/store-shots.mjs          # store screenshots from public/site/reel/*-m.webp
```

The iPhone builds need Xcode, so they run only in `.github/workflows/mobile.yml`
on a macOS runner. Without the App Store Connect secrets the workflow compiles
unsigned, which still catches a broken build. With them it archives, signs
automatically and uploads to TestFlight.

**Regenerating a platform** (`npx cap add android`) loses nothing: run
`node native.mjs` afterwards. It holds every change made to the generated
projects:
- icons and splash;
- permissions and usage strings;
- the push entitlement and AppDelegate callbacks;
- version numbers from Gradle properties;
- signing from the environment.

Keys never go in the repository (`mobile/.gitignore`).
