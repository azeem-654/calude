# Brief for the local Claude Code session — Google Calendar (OWNER-CHECKLIST item 5)

Paste this file (or its path) into a **local** Claude Code session on the
owner's computer, with Claude in Chrome or the built-in browser available, and
the owner signed in to the Google account that owns the Protected Central
OAuth client (the one "Continue with Google" already uses — checklist item 7).

## Why

Since 2026-11-23 (promoted to live the same day) the booking pages block times
busy in a customer's Google Calendar, every booking becomes a Google event with
a Meet link, and a guest's move or cancel updates the event. We told an AppSumo
buyer this works. It cannot until the Google client is allowed to ask for the
Calendar scope: today, **Customer Engagement → Meetings → Connect a Google
Calendar** fails at Google. The code needs nothing — this is Google Cloud
console work, plus a real end-to-end check.

## Rules

1. **Do not change code or commit.** The cloud session writes code; report back.
2. **Every click in Google Cloud that saves or submits needs the owner's yes
   first** — show what you are about to save. Spend no money; nothing here costs any.
3. **Never paste a client secret, token or code into the report or a chat.**
4. Use the existing OAuth client. Do not create a new project or client.
5. The scope is exactly `https://www.googleapis.com/auth/calendar.events` —
   **never** `.../auth/calendar` (that one can delete a customer's whole calendar).

## Part A — let the client ask for Calendar (console.cloud.google.com)

1. Select the project that holds the sign-in OAuth client.
2. **APIs & Services → Library** → *Google Calendar API* → **Enable** (skip if
   already enabled; report which).
3. **Google Auth Platform / OAuth consent screen → Data access (Scopes)** →
   **Add or remove scopes** → add `.../auth/calendar.events` → Save. Report the
   full scope list afterwards (names only).
4. **Clients → the existing web client → Authorised redirect URIs** — make
   sure both are present, exactly (add any missing):
   - `https://app.protectedcentral.com/api/calendar.php`
   - `https://testing.protectedcentral.com/api/calendar.php`
5. Publishing status must be **In production** (not *Testing* — Testing caps
   it at listed test users and expires refresh tokens after 7 days). Report it;
   ask before changing it.

## Part B — a real connection on live (app.protectedcentral.com)

6. Signed in as the owner, open **Customer Engagement → Meetings → Connect a
   Google Calendar** and go through Google's consent. Until verification
   (Part C) is approved Google shows "Google hasn't verified this app" —
   *Advanced → Go to … (unsafe)* is expected for now; note it in the report.
7. Back in the app the calendar must show as connected with no red or amber
   note. If it says no refresh token was returned: remove the app at
   myaccount.google.com/permissions and connect again.
8. Publish (or use) a booking page in that workspace. In the connected Google
   Calendar create a 1-hour event "Busy test" tomorrow inside the page's hours.
   Open the public `/book/<slug>` page in a private window: **those times must
   not be offered**; the hours either side must be.
9. Book a free time on that page with a `+test` address you can read.
   Expect: a Google event with a Meet link in the owner's calendar, the guest
   invited, and the confirmation email with a *Reschedule or cancel* button.
10. From the email's link, **reschedule**: the same Google event moves (same
    Meet link). Then **cancel**: the event disappears from Google.
11. Delete the "Busy test" event and the test booking (Scheduling → Bookings →
    trash, twice). Disconnect the calendar only if the owner says so.

## Part C — submit for Google verification

`calendar.events` is a **sensitive** scope: until Google verifies the app,
customers see the "unverified app" warning and at most 100 users can connect.

12. **OAuth consent screen → Verification centre** (or *Branding*): check the
    app name, logo, support email, home page `https://protectedcentral.com`,
    privacy policy and terms links (the site's own `/privacy` and `/terms-of-service`;
    open each to confirm it loads), and the authorised domain
    `protectedcentral.com` (verified in Search Console — report if not).
13. Prepare the justification for the scope, for the owner to approve before
    submitting, along these lines: *"Customers connect their own Google
    Calendar so that bookings made on their booking page are created as
    calendar events with a Google Meet link, times already busy in their
    calendar are not offered to visitors, and when a guest reschedules or
    cancels the event is moved or removed. We read only free/busy times and
    create, update and delete only the events our booking pages made."*
14. Google asks for a **demo video** (unlisted YouTube): record Part B steps
    6–10 on screen — the consent screen showing the scope, the connected
    calendar, a busy time not offered, a booking creating the event, a
    reschedule moving it, a cancel removing it. Ask the owner before uploading.
15. Submit only with the owner's yes. Report the submission date and anything
    Google says it needs next.

## Report back

A short list: each step passed / failed (with what was on screen) / waiting on
the owner, the scope list and publishing status, and whether verification was
submitted. Then the owner pastes it into the cloud session, which updates
`docs/OWNER-CHECKLIST.md` item 5.
