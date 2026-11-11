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

**A hosted mailbox sends only as its own address** (`hostedFromProblem` in
`lib/deliver.ts`, also checked in `routes/providerSend.ts`, which calls the
provider directly). It sends on the platform's key, on which every customer's
hosted domain is verified, so a From taken from the request let one workspace
send DKIM-signed as another's domain (audit E-1). `test:hostedmail`.

**Marketing mail asks `lib/suppression.ts` first.** `suppressedSet` reads
`crm_unsubscribes` and both suppression-list keys; sequence steps, scheduled
one-off emails and automation emails skip a suppressed address and log it
`suppressed`. Sequence and automation mail carries the signed opt-out
(`unsubscribeUrl`: a footer link, or wherever `{{unsubscribe}}` was written)
and `List-Unsubscribe` / `List-Unsubscribe-Post`. It needs `APP_ORIGIN`
(audit E-2). `test:cloud`.

**Bounces and complaints suppress** (`lib/bounces.ts`, E-7). Resend and Brevo
post events for hosted mail to `/api/mail-webhook.php?p=…&t=<install token>`
(the owner copies the address from Email on customers' domains; Resend's
`whsec_` signing secret, once saved, is required too). A permanent bounce or a
complaint goes into `crm_unsubscribes` (`campaign_id` 'bounced' /
'complained') for the workspace whose hosted domain sent it, and its last
delivery row is marked. The reply cron reads delivery-status notifications
(`parseDsn`) instead of answering them and suppresses what failed for good;
a delay or a full mailbox suppresses nothing. `test:bounces`.

**Hosted mail has a daily cap** (`hosted_emails`, a `daily` meter in
`allowances.ts`, E-5): trial 50, Advanced 500, Scale 2,000, AppSumo tiers 150 /
300 / 500. `hydrate` puts a `quota` on a hosted mailbox and `deliver` checks it
before and counts after an accepted send; own-key mailboxes have none. The
install owner is unlimited, so sign-in codes are never stopped by it.

**A text's delivery is known** (S-2): workspace sends set Twilio's
`StatusCallback` to `/api/sms-status-webhook.php?a=<workspace>`, verified with
that workspace's auth token; the SID is `crm_delivery_log.provider_ref` and
the callback moves the row to delivered, undelivered or failed (21610 records
the opt-out). `test:security`.

## Connecting mailboxes in bulk — paste, screenshot, connect and test all

Settings → Email, under the mailbox list: **Paste your mail settings**
(`Settings/MailboxImport.tsx`). The paste is read in the browser by
`worker/src/lib/mailParse.ts` (pure, shared with the Worker): welcome emails,
help pages, CSV/TSV with a header, `email:password` and `email password host
port` lines, several "Label: value" pairs on one line. It groups by address;
labelled settings apply to the addresses in their block, and a block naming no
address applies to the addresses on its host's domain (else to all missing
it). `From:`/`To:` headers and support@/no-reply@ in prose are never mailboxes;
"Password: your email password" is a placeholder, not a password; POP3 is
never taken as IMAP. Gaps are filled in order — `KNOWN_PROVIDERS` (each a
provider's published setting, with its app-password rule in plain words), then
the Worker's `lookup` (`lib/mailLookup.ts`: Mozilla ISPDB, `autoconfig.<domain>`,
MX over DoH → provider, ISPDB for the MX's domain). Every setting carries its
source; a lookup that could not run says so, never "none found". Only
`finalise()` adds the usual 587/993 pairing, and says it did.
A **screenshot** goes to `read_picture`: `loadAiKey` → `aiBudget` →
`askGeminiParts` (JSON, through the pool, OpenRouter vision models included) →
`recordsFromAi`, shown for checking, never saved directly; no key → `no_ai`,
said at the attach button. **Connect and test all** sends rows in batches of 3
(`bulk_connect`): each goes through `saveOne` (the form's own save — encrypted,
workspace-scoped, an existing address updated not duplicated), then
`proveOutgoing` then `proveIncoming` (the form's own Validate), and answers per
row and per side (`connected`, `wrong_password`, `needs_app_password`,
`host_unreachable`…); one side working is `partial`. Rate-limited per workspace
(lookups 300/h, mailbox tests 150/h) so it cannot be used to spray passwords.
There is no plan allowance on mailbox count. `npm run test:mailparse` (pure),
`npm run test:mailimport` (built bundle; SMTP + IMAP stand-in on plain sockets,
mocked ISPDB/DoH/Gemini, both screen widths).

**Check and turn on all mailboxes** (top of the mailbox list, `activate_all`,
ids in batches of 3, same 150/h test budget): for each saved mailbox
`fillGaps` fills only what is missing — a side with no server from the
provider the other side's host names, else `lookupDomain` on the address; a
blank login with the address; a blank password from the other side **only
when both logins are this address** (a relay login like `apikey` is never
copied; a provider API key is never a mailbox password). Each fill is saved
through `saveOne` (so the changed side's stamp clears) and named in `filled`.
Then `proveOutgoing`/`proveIncoming`, answered per side (`connected`,
`wrong_password`, … `not_set_up`, `send_only`). A provider sender (Brevo,
Resend…) is offered IMAP on the address's own mail host; `send_only` only when
DNS answered (no MX, or a mail host publishing no settings) — a lookup that
could not run is `not_set_up` with its reason. Every row's `outgoing` /
`incoming` carries `state` (`connected`/`warning`/`failed`/`untested`/
`not_set_up`/`send_only`) and `problem` (diagnosis summary + first fix), shown
on the row as "Sending ✓ / Receiving: failed" with the fix underneath.

**Incoming sync** (`replyTick.ts`, every mailbox, not only the primary; and the
inbox page's `imap-fetch.php`) records each result on the row
(`noteIncomingSync`, guarded by `updated_at`): a refused login clears
`in_verified_at` and the cron then skips the mailbox (`incomingReady`) rather
than retry a wrong password into a lockout; an unreachable server keeps its
stamp and records the error; a success clears it. Validate or Check and turn
on brings a skipped mailbox back.

## Email on the customer's own domain — hosted here

`lib/hostedMail.ts`, `/api/hosted-mail.php` (`routes/hostedMail.ts`),
migration 0083, Settings → Email & SMS → **Your own domain**
(`HostedMailPanel.tsx`); the owner's switch is **Email on customers'
domains** in Platform services (`HostedMailSettings.tsx`: a Cloudflare token —
Zone Edit, DNS Edit, Email Routing Rules Edit, Zone Settings Edit — the
account id, the Worker name, and a Resend or Brevo key; stored encrypted in
`crm_install_providers` kind `hosted_mail`, never returned). A domain becomes
a zone on the operator's account (`jump_start`, so existing records come
across); the customer changes the nameservers — the only route, and the proof
it is theirs. "Check again" (`refreshDomain`) then turns on Email Routing with
one catch-all to the Worker (`email()` in index.ts → `receive`: unknown
address refused, 600/h per address, 25 MB, text in `crm_hosted_messages`,
raw `.eml` in R2 under `mail/`) and adds the domain at the sending provider,
writing its records into the zone and asking it to verify. Each address is
also a `crm_mailbox_accounts` row with `provider = 'hosted'`, no key, and
`imap_host = HOSTED_HOST`: `hydrate` hands it the platform key only for a
From address on a verified domain of the same workspace (`sendCredsFor`), so
one customer can never send as another's domain; `imap-fetch.php` and the
reply cron read it from D1 (`fetchHosted`); the mailbox form, delete, Validate
and "Check and turn on all" leave it to its domain (`HOSTED_EDIT`);
`stampMailboxes` puts the domain's state on its rows. No IMAP — mail lives in
the app. `npm run test:hostedmail` (Cloudflare and Resend stand-ins, a real
message through wrangler's local email handler, other-workspace refusals).

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

**AI & cloud usage** (2026-11, `UsageDashboard.tsx`, `usage` / `save_caps` /
`save_limits` on the same owner-only route, `lib/usageReport.ts`) sits on top
of the tab. Every AI call the Worker makes — server routes and the browser's
through `/api/ai.php` — is counted by `lib/aiUsage.ts` `recordAiUse` into
`crm_ai_usage` (migration 0082: day × provider × key fingerprint × model ×
module × workspace, Google's/OpenRouter's own token counts, 429s as
`limited`; a workspace's own key is `key_fp = 'own'`, kept out of the
install's free-tier totals). Google offers a key no usage API, so this count
is the only one; the free limits beside it are the published figures
(`FREE_DEFAULTS`), owner-editable (`crm_meta.ai_free_limits`). `freeFirst`
moves a model at today's free requests to the back of its chain. OpenRouter
keys show OpenRouter's own `/key` figures. Cloudflare lines (Workers requests
and CPU, D1 rows and size, R2 classes and size, Workers AI neurons) come from
the GraphQL Analytics API with the optional secrets `CF_ANALYTICS_TOKEN`
(Account Analytics: Read) and `CF_ACCOUNT_ID` (`lib/cloudUsage.ts`, each
product its own query so one failure is reported alone), against Workers
Paid's included amounts. The Openprovider balance is read with the reseller
id (`accountBalance`). **Caps**: `capRefusal` (used by `aiBudget` and
`/api/ai.php`) applies the owner's per-workspace hour/day/token caps and
overrides (`crm_meta.ai_caps`, defaults 120/h, 800/day, no token cap).

**Which model does which job** — `lib/aiTasks.ts` is the one table. Every
call names a `module` (`MODULES`: support chat, email marketing, thumbnails,
Autopilot planning…; the browser sends it on `/api/ai.php` through
`aiFetch(init, module)`), each module a task (chat, write, reason, vision,
extract, code, research), each task Gemini tiers in order (`chainFor`: the
newest stable lite/flash/pro on the key's own ListModels — Pro first only for
vision and reasoning, whose free allowance is small) and OpenRouter families
(`orRank`). Never an id in code. A call naming no module is "general"
writing, or vision if it carries a picture. A new AI caller names its module;
a new module goes in `MODULES`.

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

**The owner's help button answers about Protected Central itself**
(`lib/houseKnowledge.ts`, 2026-11-07). On the house widget only, `engage.php
send` uses the owner's attached agent or, with none, `HOUSE_AGENT`, and
passes `houseFacts(env)` to `think()` as PRODUCT FACTS: plans and AppSumo
tiers built from `effectivePlans` + `featureLines` (with the owner's
overrides), service prices from `offers.ts` only where `servicesPublic`, and
prose about what ships — never a copied number. A customer's widget never gets
them. It answers only once an AI key is set (Platform services); until then the
fallback names support@. Migration 0086 set the house widget to chat, ticket
and `meeting` with `booking_slug = 'strategy-call'` (call and screen share off,
the owner's request); widget.js names that option "Book a strategy call".

**It talks like a person, and never pretends to be one** (2026-11-08). The
house widget's config carries `natural: true` (a customer's widget never), and
widget.js then paces the chat: under each sent message one grey tick, two grey
after 1–2 s, two green 1–2 s later (`pacer`); a typing indicator that starts a
moment after and now and then stops and starts; each reply drawn only once it
has "taken" as long as its length (≈22 ms a character, 1.4–7 s) or at once if
the real answer was slower; a poll that sees the reply early is held so it is
drawn once, at the pace. The header says "Online" (the chat is answered at any
hour) and names the person only when `online` is true — presence written by
the owner's own visible pages (`live_waiting` marks it for the install owner
when their in_app widget offers chat). One note at the top says the assistant
replies first. Its replies come from module `house-support` → task `converse`
(Gemini Pro first, then Flash; strong OpenRouter families), temperature 0.7,
with `HOUSE_STYLE` (houseKnowledge.ts): plain chat voice, no bot phrases, one
concrete idea and usually one question, a strategy call or a ticket offered
when it would help. Rule 6 in agentBrain stays: asked, it says it is the
assistant. **Deliberate typos and claiming to be the owner were asked for and
not built** — deceptive to visitors, against bot-disclosure laws (California's
SB 1001 for sales chats), and the first thing a marketplace reviewer who
tests the help button would hold against the product. `test:chatlive` checks
the pacing in a browser.

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
