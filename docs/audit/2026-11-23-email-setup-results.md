# Company email on Cloudflare — local results, 2026-11-23

Tested in the owner's Chrome on app.protectedcentral.com (live, build `1f05a1d`), the Cloudflare dashboard and Gmail (azeem654@gmail.com). No secrets are in this file.

## What was set up

- A Cloudflare API token, "Protected Central email". Zones (all): Zone Edit, DNS Edit, Email Routing Rules Edit, Zone Settings Edit. Account: Account Settings Read, Email Sending Edit. The owner pasted it into the app.
- Platform services → Email on customers' domains: "Saved — the Cloudflare token was checked with Cloudflare."
- Six mailboxes, all "How this mailbox sends = Cloudflare Email Service", all "Cloudflare · validated": support@, azeem@, ceo@, sales@, marketing@, accounts@protectedcentral.com. support@ was switched from Brevo to Cloudflare.
- "Receive mail here" is on for all six. Cloudflare's Routing rules show each address → Worker `crmpro`, Active. The old forward-to-Gmail rules for azeem@ and support@ were replaced. The catch-all is Drop, disabled.
- System email: support@protectedcentral.com (Cloudflare).
- **Primary mailbox changed** from support@wildwestcorp.com (TrekMail SMTP) to support@protectedcentral.com (Cloudflare), with the owner's approval. This was a workaround for bug 1.

## Results

| Address | Gmail → address arrived in Unified Inbox | Reply from Unified Inbox arrived in Gmail |
|---|---|---|
| support@ | PASS | PASS |
| azeem@ | PASS | PASS |
| ceo@ | PASS | PASS, after the From-name change (bug 2) |
| sales@ | PASS | PASS |
| marketing@ | PASS | PASS |
| accounts@ | PASS | PASS, after the primary change (bug 1) |

Gmail details on a reply: mailed-by `cf-bounce.protectedcentral.com`, signed-by `protectedcentral.com`, standard encryption (TLS).

## Bug 1 — Unified Inbox replies go through the primary mailbox, not the one the message came in on

**Seen:** a reply from the accounts@ message showed "Sending as Protected Central Accounts <accounts@protectedcentral.com>". It never arrived. `/api/smtp-send.php` returned HTTP 200 with:

> `{"success":false,"transport":"smtp", … "553 5.7.1 <accounts@protectedcentral.com>: Sender address rejected: not owned by user support@wildwestcorp.com"}`

**Why:** `src/components/Conversations/Conversations.tsx` `sendReplyRaw` calls `sendEmail` with the workspace's global config and only overrides `fromName`/`fromEmail`. `src/services/emailService.ts` posts `accountId` but no mailbox id. `worker/src/routes/smtpSend.ts` then calls `loadMailbox(env, accountId)`, which (`worker/src/routes/mailbox.ts:151`) returns the **primary** row (`ORDER BY is_primary DESC`). So every reply goes out on the primary mailbox's transport with someone else's From address.

**Effect now:** with support@protectedcentral.com as primary, all six @protectedcentral.com replies work, because Cloudflare accepts any From address on the onboarded domain. Replies to mail that arrives at support@wildwestcorp.com should now fail the other way round (not tested).

**Suggested fix:** send the reply's mailbox id (`selectedMb.id`) and have smtp-send use `loadMailboxById` when one is given, falling back to the primary. This must stay inside `lib/deliver.ts`, the one email door.

**Also:** after a failed click, the reply text stayed in the box and Settings → Message Delivery Log still said "Nothing has been sent from this workspace yet". Screenshots 5–6 s after clicking showed no error on the page. If an error toast appeared, it was gone by then. A failed send should stay visible next to the Send button.

## Bug 2 — a non-ASCII From name makes Cloudflare refuse the send, but the mailbox still validates

**Seen:** ceo@ with From name "Azeem Sattar — CEO" (em dash) validated ("Cloudflare accepted the key… This mailbox can send"). Every real send was refused:

> `Cloudflare refused the message (HTTP 400). email.sending.error.invalid_request_schema. Usually the sending address: …`

Changing the name to "Azeem Sattar - CEO" (hyphen) fixed it at once.

**Why:** `worker/src/lib/providerApi.ts:143` builds `from` as the raw text `${fromName} <${fromEmail}>`. Cloudflare's schema seems to reject non-ASCII there. Validation (`providerApi.ts` ~457) sends `{}` and treats `invalid_request_schema` as proof the token works, so it can never catch this. The error message also blames the sending address, which is wrong here.

**Suggested fix:** quote or RFC 2047-encode the display name for Cloudflare (or strip non-ASCII), and say in the error that the From name may be the cause.

## Smaller observations

- After saving a mailbox's outgoing settings (only the From name changed), Platform services → "Receive your own address here" showed ceo@ as "Waiting for Cloudflare — press Check again". Pressing Check again restored "Receiving here". The mailbox's incoming section also went from "Validated" to "Not validated yet". Saving outgoing settings shouldn't reset receiving.
- Mailbox list text "Sends through Cloudflare, which does not receive mail. Add an incoming server…" still shows under mailboxes whose address *is* receiving through "Receive mail here". This misleads the owner.
- Settings → Email & SMS → SMS Provider: Chrome autofilled the owner's address into Twilio "Account SID". The field may need `autocomplete="off"`. Not saved.
- Platform services, "Email on customers' domains": "Sending through" offers only Resend/Brevo, which confused the owner, who expected Cloudflare. Consider explaining there that your own mailboxes choose their provider in Email & SMS.

## Not tested

- Replies to support@wildwestcorp.com mail after the primary change.
- Send-only SMTP (`smtp.mx.cloudflare.net:465`, user `api_token`).
- The phone home-screen app.
