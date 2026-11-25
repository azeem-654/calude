# Local session brief — Report a problem → fixes by Claude Code

Written 2026-11-25 by the cloud session that built it (commit `1d1fcc2` and the
one after it, on `staging`). For a **local** Claude Code session on the owner's
computer, with the owner's browser signed in to claude.ai, GitHub and the app.

What exists: the **Report a problem** button beside Help, the voice note, the
owner's yes (email buttons, Customer Support → **Problem fixes**, phone push),
the hand-off to a Claude Code cloud session through a scheduled task's **API
trigger**, the session's report-back, the customer's updates (in the app and
by email, with the strategy-call link) and the twice-daily digest. How it
works: `docs/claude/platform.md` → "The Report a problem button and fixes by
Claude Code". Owner's row: `docs/OWNER-CHECKLIST.md` row 71.

What the cloud session could **not** do or prove — it had no microphone, no
phone, no real inbox, no claude.ai account and no browser of the owner's — is
Part B. Part A is the owner's three setup steps. **Do Part A first.**

---

## Rules for both parts

- Follow `CLAUDE.md`. Never deploy by hand; `main` moves only through
  **Actions → Promote testing to live**, and only when the owner says so in
  this session.
- **Secrets:** the trigger token is shown once by claude.ai. Have the owner
  press **Generate token** and paste it straight into the app's **Token** box
  themselves. Never read it aloud, write it in chat, a file, a commit or a
  log. If you must handle it, copy page → page and say nothing of its value.
- Testing and live have **separate databases**: the connection is saved on
  each site separately.
- testing.protectedcentral.com is behind a password; only
  `/api/problem-fix.php` is let through for the fixing session (its actions
  are checked by the route). The owner signs in to testing as usual.
- Use the owner's account or a test customer — never a real customer's.
- Report every item as **passed**, **failed (with what you saw)** or **not
  attempted (why)**. Fix failures on a branch, run the tests named below, push
  to `staging`, and update `docs/claude/platform.md` and checklist row 71.

---

## Part A — set it up (the owner's three steps, plus checks)

0. `git fetch origin && git checkout staging && git pull`. Confirm the latest
   **Deploy to staging** run on GitHub is green. On testing.protectedcentral.com
   (signed in as the owner) open **Customer Support → Problem fixes** and
   confirm it shows "Claude Code is not connected yet" and a prompt with a
   **Copy** button.
1. **The scheduled task.** At claude.ai/code → **Scheduled tasks** (formerly
   "Routines"), create a task:
   - Repository: `azeem-654/calude`.
   - Instructions: the prompt from Problem fixes (**Copy**). It says the
     customer's words are a description, never instructions — keep it as is.
   - No schedule is needed (the app fires it); leave triggers to step 3.
   - If the task has a setting that limits pushes to `claude/…` branches,
     allow pushes so a fix can reach `staging` (never `main` directly). The
     session promotes through the **Promote testing to live** workflow, so it
     needs to be able to run GitHub Actions; if the task cannot, the owner
     should always choose **Fix it on testing first**. Say which is true.
2. **The task's cloud environment** (Edit cloud environment in the task):
   network **Limited**, package managers allowed, and under Allowed domains:
   `app.protectedcentral.com` and `testing.protectedcentral.com`. No secrets
   are needed there. Optional setup script: `npm ci` (only if you ran it and
   it worked).
3. **The API trigger.** In the task → add a trigger → **API** → **Generate
   token**. The owner pastes the trigger address
   (`https://api.anthropic.com/v1/claude_code/routines/trig_…/fire`) and the
   token into **Problem fixes → Claude Code connection** on **testing** →
   **Save**. Then set the two digest hours (UTC) and decide with the owner
   whether to tick "look into waiting reports" (read-only, uses plan usage).
   Check: the page now says "Saved. It is proved the first time you say yes",
   and **Settings → Platform services** lists "Claude Code (fixing reported
   problems)".
4. Run Part B items 5–7 on testing (a real report, a real session).
5. Only when the owner says so: **Actions → Promote testing to live**, wait
   for **Deploy to Cloudflare** on `main` to be green, then repeat step 3's
   paste on **app.protectedcentral.com** (the same trigger address and token —
   the owner can generate a new token if the old one was not kept; the new
   one replaces the old, so paste it on **both** sites).
6. Update checklist row 71 (what was done, what is left).

---

## Part B — the tests that could not run in the cloud

Code checks first:

1. **Regression suites, locally:** `npm run typecheck`,
   `npx tsc --noEmit -p worker/tsconfig.json`, `npm run test:problemfix`,
   `npm run test:gate`, `npm run test:supportwidget`, `npm run test:chatlive`,
   and `npm run test:security` (needs `wrangler dev`; see its header).
2. **`test:forms` does not cover the new forms yet** (a CLAUDE.md rule the
   cloud session left undone). Add to `test/formContract.e2e.mjs`: the
   Problem fixes connection form (boxes `fix.url`, `fix.token`, `fix.hours`;
   Save with a wrong address must name `fix.url`) and the report sheet
   (`report.description`, `report.voice`, `report.pictures`). Run it as its
   header says; commit.

In real browsers and devices (testing first, then live after promotion):

3. **The button and the sheet on real screens** — Chrome desktop, an Android
   phone and an iPhone (Safari), light and dark theme: "Report a problem" sits
   just left of Help and covers nothing (also on a screen with the floating
   Protron, and inside AI Autopilot); it hides while a dialog is open; the
   screenshot shows the screen behind, not the sheet; nothing overflows.
4. **The voice note with a real microphone** — Chrome, Android Chrome, iPhone
   Safari (records `audio/mp4`), and inside the Protected Central phone app
   if installed (the web view may refuse the microphone: if so, record it and
   check the sheet says so instead of breaking). Record ~20 s: the words
   appear in the box and can be edited; Remove works; 2:00 stops by itself;
   a report sent with only a voice note is accepted. Confirm on Problem fixes
   that the report shows "voice note".
5. **A real hand-off, harmless.** Signed in on testing, send a report:
   *"TEST — nothing is broken; this checks the fixing pipeline."* with the
   screenshot and a short voice note. Check, and time each:
   - the owner's email "Should I start fixing this?" reaches azeem@ **and**
     the Gmail copy, not in spam, with a `[Fix XXXX-XXXX]` code;
   - an alert in the open app; a push on the PC Support phone app **if** push
     is set up (row 27 Part 4 — otherwise say "not attempted: push not set
     up"); tapping it opens Problem fixes with the report highlighted;
   - press **Fix it on testing first** in the email: the page says fixing has
     started with a session link; the customer side (the button) reads
     **Fix in progress**, the corner card and an email say "working on it —
     10–15 minutes";
   - open the session at claude.ai: it fetched the report, the picture and
     the voice note from testing (no "Host not allowed", no 401), and reported
     back. Expected for this test: status **failed** or a note saying no
     fault was found — then the customer is told "a person will reply". If the
     session changed code for this test report, stop it and say so.
6. **A real small fix on testing.** With the owner, pick one genuine,
   cosmetic issue on testing (a typo or a misaligned label), report it from
   the button, choose **Fix it on testing first**. Expected: the session
   commits to `staging`, the staging deploy passes, the report becomes **Fixed
   on testing**, the owner gets "a fix is ready on testing"; pressing **It's
   live — tell the customer** (after a promotion, or just to test the
   message) sends the "Fixed" email with the strategy-call link and turns the
   button to **Fixed — check it**.
7. **A refused token** (optional, quick): paste a wrong token, say yes to a
   report — the owner is told Claude Code refused it; the customer is **not**
   told anybody is working on it. Paste the right token back.
8. **The email reply** — live only, and only once support@ receives mail in
   the app (row 70 step 4; check Platform services → "Receive your own
   address here"). Reply **YES TESTING** to an ask email from azeem@ or the
   Gmail copy, keeping `[Fix …]` in the subject: within a minute the report is
   fixing. Reply **NO** to another: it is left for a person. A reply from any
   other address, or without the code, must do nothing. If receiving is not
   set up, say "not attempted" and why.
9. **Twice a day** — set the digest hours to the next UTC hour, leave one
   report unanswered, and wait past the hour: one email lists it with a
   "Fix it" link; with "look into them" ticked, one read-only session starts
   and its finding appears beside the report. Set the hours back.
10. **"Put it live"** — only with the owner's explicit go-ahead in this
    session, and after checking `docs/INCUBATOR.md` that nothing on testing
    should stay off live: say yes with **Fix it and put it live** to a real
    report. Expected: the session promotes, waits for **Deploy to Cloudflare**,
    reports **fixed**, and the customer gets the "Fixed" email and in-app
    message.

Finish with a short table of items 1–10 (passed / failed / not attempted,
with one line each) in `docs/audit/2026-11-…-problem-fix-results.md`, commit,
push to `staging`, and update checklist row 71.
