# Google Calendar: local results, 2026-11-24 (OWNER-CHECKLIST item 5)

Brief: `docs/audit/LOCAL-SESSION-CALENDAR-BRIEF.md` (staging `73037ea`).
Run from the owner's computer in Chrome, in the Google account that owns the
Cloud project (`authuser=1`). No code was changed. Every Google Cloud save was
shown to the owner first and made only after the owner said yes. No secrets,
tokens, codes or manage-links are recorded here.

## Summary

- **Part A is done.** The existing client can now ask for Calendar.
- **Part B mostly works.** Connecting, event + Meet link, guest invite,
  confirmation email, reschedule and cancel all **passed**. **Step 8 failed:**
  times that are busy in Google Calendar are **still offered**, because Google's
  `freeBusy` endpoint does not accept the `calendar.events` scope (details below).
  This needs a code or scope decision before Part C.
- **Part C was not submitted. It is waiting on the owner:** the domain is not
  verified in Search Console for this account, there is no app logo, and the
  demo video can't show "busy time not offered" until step 8 is fixed.

## Scopes and publishing status (after this session)

Project `protectedcentral-signup`, client **ProtectedCentral Web Client** (the
only OAuth client in the project; reused, nothing new created).

| Scope | Type |
|---|---|
| `openid` | non-sensitive |
| `.../auth/userinfo.email` | non-sensitive |
| `.../auth/userinfo.profile` | non-sensitive |
| `.../auth/calendar.events` | **sensitive**, "Approval required" |

No restricted scopes. `.../auth/calendar` was **not** added.
Publishing status: **In production** (unchanged). User type: External.

## Part A: let the client ask for Calendar

| Step | Result |
|---|---|
| 1. Project | **Passed.** `protectedcentral-signup`, one web client "ProtectedCentral Web Client". |
| 2. Google Calendar API | **Passed.** It was **not enabled**; enabled now (status "Enabled" on the API page). |
| 3. Data access scope | **Passed.** Added only `https://www.googleapis.com/auth/calendar.events` through "Manually add scopes", then saved; it is still there after a reload. On save Google showed "Verification required: A sensitive scope was added…" and, on the Data Access page: "If your app is already public, do not deploy unverified scopes to your production traffic… use a staging environment or hidden test route" for the demo video. |
| 4. Redirect URIs | **Passed.** Before: only `https://app.protectedcentral.com/auth/google` and `https://testing.protectedcentral.com/auth/google`. Added `https://app.protectedcentral.com/api/calendar.php` and `https://testing.protectedcentral.com/api/calendar.php`; all four are present after a reload. |
| 5. Publishing status | **Passed.** Already **In production**, so nothing was changed. |

## Part B: a real connection on live (app.protectedcentral.com)

Signed in to the app as the install owner. At Google's account chooser the
owner picked their own Gmail account (the same one that is the app's
support/developer contact), so that account's **primary** calendar is the one
connected. The `+test` guest address was that Gmail account with `+test`,
and its mail was read in Gmail.

| Step | Result |
|---|---|
| 6. Connect | **Passed.** Customer Engagement → Meetings → Connect a Google Calendar sent Google `scope=…/auth/calendar.events`, `access_type=offline`, `prompt=consent` and `redirect_uri=…/api/calendar.php`, with no redirect error. Google showed **"Google hasn't verified this app"**, which is expected; went through *Advanced → Go to protectedcentral.com (unsafe)*. The consent screen asked for one permission only: "View and edit events on all your calendars". The app then showed a "Calendar connected" page. |
| 7. Connected, no red/amber note | **Passed at first.** Meetings showed `azeem@protectedcentral.com · primary` with a Disconnect button and no note. No refresh-token problem. (After step 8 the amber note below appeared.) |
| 8. Busy time not offered | **FAILED.** Booking page `/book/lux-medspa-brickell-y4b0` (Mon–Fri 09:00–17:00, Asia/Karachi). Before: Wed 25 Nov offered 16 times, 9:00 am–4:30 pm. Created "Busy test", Wed 25 Nov 12:00–13:00 PKT, shown as Busy in the connected calendar. After reloading (again ~2 min later): **still 16 times; 12:00 pm and 12:30 pm still offered.** Meetings then showed an amber note: *"Busy times could not be read: Google would not answer for that calendar."* Checked in a normal tab, not a private window. |
| 9. Book with +test | **Passed.** Booked Wed 25 Nov 10:00. Page said "You are booked". Google event created 10:00–10:30 in the connected calendar with a **Google Meet link**, 1 guest (the +test address, awaiting reply). The +test inbox received the app's confirmation *"Confirmed: Custom Home Consultation, Wednesday, 25 November 2026 at 10:00 am"* with the Meet link and a **Reschedule or cancel** button (link goes to `app.protectedcentral.com/book?manage=…`), plus Google's own invitation. |
| 10. Reschedule, then cancel | **Passed.** From the email link, rescheduled to Thu 26 Nov 11:00: page said "Rescheduled", and the **same Google event moved** to Thu 11:00–11:30 with the **same Meet link**; nothing was left at Wed 10:00. Then "Cancel booking": page said "Booking cancelled" ("A cancellation confirmation has been emailed to you"), and the **event disappeared from Google Calendar**. |
| 11. Clean up | **Passed.** Deleted "Busy test" from Google Calendar. Deleted the test booking in Scheduling → Bookings (two rows, see finding 3). After a reload only the pre-existing Oct 28 booking remains. The calendar is **left connected**, because the owner did not ask to disconnect it. |

### Why step 8 fails

`worker/src/lib/googleCalendar.ts` `busy()` calls `POST /calendar/v3/freeBusy`
with the calendar.events token. Google's reference for
[Freebusy: query](https://developers.google.com/workspace/calendar/api/v3/reference/freebusy/query)
lists the scopes it accepts: `calendar.readonly`, `calendar`,
`calendar.events.freebusy`, `calendar.freebusy`. **`calendar.events` is
not on that list**, so the call returns an error, `calendarBusy` stamps the
amber note, and the page offers every time, as the code intends when Google
can't be read. The Calendar API had been enabled for several minutes and the
event calls in steps 9–10 worked with the same token, so it isn't a
propagation delay. (The API metrics page hadn't shown any traffic yet, so
there's no response code from Google's side to quote.)

Ways to fix it, for the cloud session or owner to decide:
- **Code only, same scope:** read busy times with `events.list` (which
  `calendar.events` allows) over the date range instead of `freeBusy`, skipping
  events marked transparent/free and declined ones.
- **Add a scope:** `https://www.googleapis.com/auth/calendar.events.freebusy`
  (or `calendar.freebusy`). This is narrower than `calendar`, but it is a
  second scope, every connected customer has to reconnect, and the owner's
  rule says "exactly calendar.events", so it is the owner's call.

The privacy policy says calendar.events is used "to check when you are busy";
that wording should match whichever fix is chosen.

### Other findings (not blocking)

1. **The Google event title shows an internal id**: "Calendar Test — et-1793010440173".
   The guest's Google invitation subject carries the same id. The app's own
   email says "Custom Home Consultation", and the event type is called "New meeting".
2. **The OAuth app name is "protectedcentral.com"**, not "Protected Central",
   and **there is no app logo**. Consent screens show the bare domain.
3. **Stale booking row after a reschedule:** after rescheduling and cancelling,
   Scheduling → Bookings showed **two** "Calendar Test" rows: the real one
   (Thu 26 Nov 11:00, Cancelled, "via booking page") and a second one at the
   **original** time (Wed 25 Nov 10:00, "New meeting", still **Confirmed**,
   counted under Upcoming Meetings). Its trash deleted it at once, so it looks
   like a separate local copy of the first booking that doesn't follow
   reschedule/cancel. Not traced in code.

## Part C: Google verification

| Step | Result |
|---|---|
| 12. Branding check | **Waiting on owner.** App name `protectedcentral.com`; user support email and developer contact are the owner's Gmail; **no logo**; home page `https://protectedcentral.com/`, privacy `https://protectedcentral.com/privacy`, terms `https://protectedcentral.com/terms-of-service`, and all three load (HTTP 200, right titles). The privacy page names `calendar.events` and has the Google API Services User Data Policy / Limited Use statement. Authorized domain `protectedcentral.com` is listed, **but Search Console for this Google account has no properties, so `protectedcentral.com` is not verified there.** Verification Center: *"Your branding is not being shown to users… You need to verify and publish your branding before you can request for verification."* |
| 13. Scope justification | **Waiting on owner.** Not entered. The brief's draft says busy times are not offered, which is untrue until step 8 is fixed. Draft to approve once it is: *"Customers connect their own Google Calendar so that bookings made on their booking page are created as calendar events with a Google Meet link, times already busy in their calendar are not offered to visitors, and when a guest reschedules or cancels the event is moved or removed. We read only free/busy times and create, update and delete only the events our booking pages made."* |
| 14. Demo video | **Waiting on owner.** Not recorded. It has to show a busy time not offered, which isn't possible yet. Google also advises recording on staging or a hidden route, not live. |
| 15. Submit | **Not submitted.** Google's next requirements, in order: verify `protectedcentral.com` in Search Console with this Google account (a DNS TXT record), verify and publish branding (optionally after uploading a logo and fixing the app name), then the scope justification and unlisted YouTube demo link on Data Access, then submit. Fix step 8 first, so the scopes submitted are final; changing scopes after submitting restarts the review. |

Until verified: customers see the "unverified app" warning, and at most 100
users can connect (Google's cap for unverified sensitive scopes).

## What the owner needs to do / decide

1. Pick the step 8 fix (events.list with the same scope, or add a free/busy scope). This is cloud session work.
2. Verify `protectedcentral.com` in Search Console under the Google account that owns the project.
3. Optionally upload a 120×120 logo and rename the app "Protected Central" on Branding.
4. After 1–3: record the demo video on testing, approve the justification, and submit.
