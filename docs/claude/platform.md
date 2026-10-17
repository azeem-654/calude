<!-- Moved from CLAUDE.md, word for word: read this before working on email sending, platform services, support and the phone apps. -->

## Sending email — one door

A mailbox sends either through **its own SMTP server** or through a
**provider's API** (Brevo, Resend, SendGrid, Mailgun, Mailjet, Postmark — the
choice on the mailbox form). Every server-side sender goes through
`lib/deliver.ts`: `canSend(mb)` for "can this workspace email", `deliver(mb,
msg)` to send, `CAN_SEND_SQL` in queries that pick workspaces. **Never call
`smtpSend` or test `mb.smtp.host` from a sender** — that is how every provider
mailbox was silently treated as "no mailbox" by the cron, Autopilot, replies,
digests, automations and sign-in codes, and why "Save & validate" asked Brevo
users for an SMTP host their form did not show. Providers live in
`lib/providerApi.ts` (`sendViaProvider`, and `verifyProvider`, which proves a
key read-only and, where the provider can say, that the From address will be
accepted). Sign-in codes and sign-up proofs use the owner's mailbox only once
it has passed validation (`out_verified_at`), so a pasted, unproved key cannot
stop every new customer at "we could not send the code".

**System email** is whatever `installMailbox` returns: the owner's chosen
mailbox (`crm_meta.system_mailbox_id`, set on the owner-only **System email**
card in Settings → Email & SMS, `routes/systemMail.ts`) if it is validated,
otherwise their first validated one — a chosen mailbox that stops working
falls back rather than silencing every code. Only mailboxes in workspaces the
install owner owns are candidates. `npm run test:systemmail` (fresh D1).

## Platform services — the owner's keys for everybody, in one place

Settings → **Platform services** (`components/Settings/PlatformServices.tsx`,
tab `platform`) is listed only for the install owner, and its one read,
`/api/platform.php` `status` (`routes/platform.ts`), answers 403 `not_owner`
to anybody else. It lists every install-wide service — the AI key, the Google
Maps key, the Google sign-in client, payments, system email, Openprovider,
managed buying, Cloudflare for SaaS, TURN, voice, `CREDENTIAL_WRAP_KEY` —
with its state (`ok` / `unchecked` / `error` / `off`, `optional` ones not
counted as needing attention), when it was last proved, the last error and
what it powers. **It sets nothing itself and never says a secret** (not even
a tail; Cloudflare secrets are presence only). The two purely install-wide
Google panels are embedded (`PlacesKeyPanel`, `GoogleSignInPanel` — the same
components, one implementation each); the rest open the tab that owns them.
Add a new install-wide key there when you add one.

## Support — the help button, tickets and live help

Protected Central answers its own customers with its own Customer Engagement
module; there is no second support system. The round button in the app's
corner (`shared/HelpLauncher.tsx`) is `public/widget.js` pointed at the install
owner's widget marked `in_app` (`engage.php` `house`; a tenant ticking the same
box is ignored). The widget draws whatever its `features` name — chat, ticket
(raise and check), meeting, **screen**.

**Live help** is screen sharing over WebRTC: the picture goes browser to
browser, and `crm_live_sessions` holds only the handshake (one SDP each way,
exchanged whole — no trickle) and who/when. Public side is `engage.php
live_*` (proved by `share_key`), business side `engagement.php live_*`
(workspace-checked; first `live_answer` wins in one UPDATE). ICE servers come
from `lib/liveHelp.ts` — STUN, plus Cloudflare TURN when `TURN_KEY_ID` /
`TURN_KEY_API_TOKEN` are set. `live_meet` is the fallback: a Google Meet made
now from the workspace's connected calendar. On this install's own origin the
widget sends the cookie placeholder, so a signed-in customer's request is
stamped `verified_email` from their session — never from the body. Viewing
only; nobody can click on the customer's machine, and the screens say so.
`npm run test:livehelp` drives two real browsers through a session.

**Chat is live both ways, by id and by cursor.** The widget polls `engage.php
poll` whenever a conversation exists (3 s open, 12 s closed, 30 s hidden,
stopped after 30 min idle) with the server's `cursor`; the inbox polls
`engagement.php inbox_sync` every 4 s while visible. Both re-read a 10 s
overlap and de-duplicate by message id — never count messages. Every message
bumps `crm_conversations.updated_at`; `last_visitor_at` / `agent_seen_at` make
"unread", and `needs_human_since` (set when a visitor is left waiting for a
person, cleared by a person's reply or "give back to AI") feeds the
dashboard's **Waiting for support** card and the nav badge (`support_waiting`,
shared through `services/supportPulse.ts`). **Pictures** in a chat
(`lib/chatFiles.ts`, table `crm_chat_files`, migration 0060) are held in D1
because there is no R2 binding: images only, sniffed from the bytes, ≤ 1.5 MB
after the browser shrinks them, rate-limited per conversation, served only to
a POST (visitor: conversation + key, never on an internal note; business:
workspace) with `nosniff` and a sandbox CSP. A picture never goes to the
assistant, which cannot see it — it marks the conversation as waiting for a
person. `npm run test:chatlive` (fresh D1, `BASE`/`PERSIST`).

**"Call us now"** (widget feature `voice`) is the same session with a
microphone and no screen: `crm_live_sessions.kind = 'voice'` (migration 0061).
It is a browser call — never call it a phone call. It rings for
`RING_SECONDS` (75, `lib/liveHelp.ts`): `live_poll` ends it as `expired` after
that and records `live.missed` (emailed), and `live_answer` refuses a rung-out
call even before any poll has closed it. `live_decline` ends it as `declined`.
Both caller screens then offer chat/ticket instead. The business is rung by
`LiveAlert` in `shared/HelpLauncher.tsx` (polls `live_waiting` every 5 s, only
while the page is visible) wherever they are; Answer goes to
`/engagement?tab=live&answer=<id>`, which joins it once. That poll also writes
`crm_live_presence` (≤ once a minute), which is the widget's `online` — `null`
for a widget offering neither call nor screen, so it claims nothing. Both ends
have the same sound controls (mute, told to the other side over the data
channel; volume; microphone via `replaceTrack`; speaker via `setSinkId`, not
drawn where unsupported; who is talking from `getStats` audio levels) —
`widget.js` `audioPanel`, `Engagement/LiveAudio.tsx`.

The widget's launcher reads "Help" (with a green dot only when `online`) and
opens a home panel listing exactly the enabled features (`homeOptions`: "Start
an online call", "Share your screen with us", "Live chat", "Submit a ticket"),
also read by the marketing-site teaser (`data-pc-teaser`, ≥720px wide): a
see-through frosted card above the launcher on **every page load** (closing it
hides it for that page only — nothing about a dismissal is remembered), back
when the widget is closed, its rows sliding in, the first icon breathing and
each icon in a small loop of its own — none of it under reduced motion.
The launcher itself has two looks: on the site (`data-pc-teaser`) the owner's
reference design — a pill of stacked frosted glass (five coloured sheet edges
underneath, cyan → white → orchid tint, dark text) with a milky glass lens
holding a drawn bloom (`bloomSvg`: violet petals behind magenta ones round a
glowing heart, each petal opening a beat after its neighbour, the two rings
turning slowly against each other); the tint drifts, a light passes over, the
pill floats, and the blur deepens while the page scrolls. In
the app it is plain and still, because a button moving in the corner all day
is an annoyance; `ProtectedCentralChat.appMode()` switches a widget loaded
signed out (the card goes too), and HelpLauncher calls it whenever somebody
is signed in. `CornerHelp` names the same options. The owner's photo and name are
per widget (`agent_name`; the photo via `engagement.php widget_avatar`,
checked by magic bytes, PNG/JPEG ≤256px, served at
`/api/widget-avatar.php?k=<random key>`, `lib/widgetAvatar.ts`) and reach the
public config as `agentName` / `agentAvatar` / `businessName`.
`npm run test:voicecall` (same arguments as `test:livehelp`, plus `PERSIST=`).

## Phone apps — two Capacitor shells around the live site

`mobile/` holds **Protected Central** (`customer/`, `com.protectedcentral.app`)
and **PC Support** (`support/`, `com.protectedcentral.support`), Android and
iPhone each; `mobile/README.md` for developers, `docs/MOBILE-APPS.md` for the
owner's store steps. Both load app.protectedcentral.com (`server.url`), so a
web release is in the apps at once and the cookie session stays same-origin.
They append `ProtectedCentralApp/1.0 (<customer|support>; <android|ios>[; push])`
to the user agent; `services/nativeApp.ts` reads it and **hides plan purchases**
(`canBuyPlans` — Apple 3.1.1 / Play billing), **hides Google sign-in** (Google
refuses web-view OAuth), and `shared/NativeBridge.tsx` registers for push and
opens the support app on the inbox. Never call the push plugin without
`; push`: Android's crashes the app without `google-services.json`
(`build.sh` adds the flag only when the file is there).
**Push** (`lib/push.ts`, `/api/push.php`, `crm_push_devices`, migration 0065):
iPhone straight to APNs (`APNS_KEY`/`APNS_KEY_ID`/`APNS_TEAM_ID`), Android via
FCM (`FCM_SERVICE_ACCOUNT`); calls, screen shares, escalated chats and tickets
from `recordEvent`, a visitor's message on a human-held chat from `engage.ts`
(one per two minutes per conversation); off and said so on Platform services
until the secrets are set. Native changes live in `mobile/native.mjs`
(idempotent — re-run after `npx cap add`); builds in
`.github/workflows/mobile.yml` (Android signed from `ANDROID_KEYSTORE_*`;
iPhone compiled unsigned, or archived and uploaded to TestFlight with the App
Store Connect key). Keys never enter the repository. `npm run test:push`
(pure, real signatures against mocks), `npm run test:nativeapp` (fresh D1).
