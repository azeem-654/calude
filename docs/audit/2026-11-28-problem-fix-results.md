# Report a problem → fixes by Claude Code: local session results

Local Claude Code session on the owner's Windows PC, 2026-11-25 to 2026-11-28,
working from `docs/audit/LOCAL-SESSION-PROBLEM-FIX-BRIEF.md`. Nothing was
promoted to live, and "put it live" was not chosen on any report.

## Part A: setup

| Step | Result |
|---|---|
| 0 · staging pulled, deploy green, Problem fixes says "not connected" | **Passed.** Deploy to testing failed twice (#282, #283) at `test:ai-keys`, because the Claude Code trigger files were not listed as AI callers. Fixed in `93c1557`; #284 was green. |
| 1 · scheduled task | **Done.** "Protected Central — Report a problem fixes" on `azeem-654/calude`, with the Problem fixes prompt and an API trigger. The form has no setting that limits pushes to `claude/…` branches, and none for GitHub Actions: Behavior only offers "Auto-fix pull requests" (left off). Whether a session can run **Promote testing to live** is unproved until the first Push it live. |
| 2 · cloud environment | **Done.** A new environment, "Protected Central fixes": Limited network, `app.protectedcentral.com` and `testing.protectedcentral.com` allowed, package managers allowed, no setup script. The owner's three "Default" environments were left unchanged. The connectors (Claude Docs, ClickUp, visualize) were removed from the task, because text in a customer report should not reach ClickUp. |
| 3 · API trigger and token on testing | **Not finished.** One of my screenshots captured the first token. I deleted the image, but the token is still in this session's transcript, so it counts as exposed. **The owner must press Generate token for a new one** and paste the address and token on testing. Digest hours not set yet. |
| 4–6 | Waiting on step 3. |

## Part B: tests

| # | Item | Result |
|---|---|---|
| 1 | Regression suites | **Passed except typecheck (Windows only).** Worker tsc passed. `test:gate` 23/23, `test:problemfix` 51/51 (before the 2026-11-28 change; re-run after it, see below), `test:security` 331/331, `test:supportwidget` 75/75, `test:chatlive` 74/74. `npm run typecheck` fails only on Windows: `src/components/Site/Changelog.tsx` and `changelog.ts` clash on a case-insensitive disk. CI on Linux passes it. |
| 2 | `test:forms` covers the new forms | **Passed.** Sections 2f (Problem fixes connection: `fix.url`, `fix.token`, `fix.hours`) and 2g (the report sheet: `report.kind`, `report.description`, `report.voice`, `report.pictures`) were added. Run locally: 18/18, covering 2f, 2g and the guard self-check. The mailbox rounds were skipped, because local workerd drops outbound provider/SMTP calls on Windows; CI runs the whole file. Commit `7ec5d8e`. |
| 3 | Button and sheet on real screens | **Not attempted.** Part A step 3 is not finished, and the button changed on 2026-11-28 ("Report a bug or request a feature"). |
| 4 | Voice note with a real microphone | **Not attempted** (same reason). |
| 5 | A real, harmless hand-off | **Not attempted.** Needs the token on testing. |
| 6 | A real small fix on testing | **Not attempted.** Needs the token on testing. |
| 7 | A refused token | **Not attempted.** Covered by `test:problemfix` against a stand-in. |
| 8 | The email reply | **Not attempted.** Live only, and support@ does not receive mail in the app yet (row 70 step 4). |
| 9 | Twice a day | **Not attempted.** Needs the connection. |
| 10 | "Put it live" | **Not attempted.** Needs the owner's explicit go-ahead. |

## Changed on the owner's request (2026-11-28)

The owner described the flow they want. It is built on staging:
- **Kinds:** a bug, an improvement or a new feature, each with its own time estimate.
- **Testing first:** the email leads with "Fix it and put it on the testing site".
- **Ready to test:** when a fix is on testing, the owner gets an email with what changed, what the customer will see, step-by-step test steps and a **Push it live** button. That button starts a promoting session.
- **The customer is told at each step:** by email, in the app and on their ticket.
- **One task for both sites:** the saved prompt no longer names a site.

Details are in `docs/claude/platform.md`; tests are `test:problemfix` and `test:security`.

Checked locally after the change:
- `test:problemfix` 83/83 (it was 51; the new checks cover the testing-first path, Push it live and ticket updates).
- Worker tsc passed; the app typecheck shows only the Windows Changelog clash.
- `test:ai-keys` 54/54 and `test:gate` 23/23.
- A browser run of the new screens: 37/37 at 390 and 1280 wide.
  - The button reads "Report a bug or request a feature" ("Bug or feature" on a phone).
  - The sheet's three types change its question and button.
  - Problem fixes lists both sites. Nothing overflows.
- `test:security` (with `promote` added to its owner-only checks) was not re-run on this machine; CI runs it.

## Findings for the cloud session

- **The prompt named only testing.** One scheduled task could not serve reports filed on the live site. Fixed on 2026-11-28 (`savedPrompt()` names no site).
- **First cookie only.** `cookieToken()` reads only the first `pc_session` cookie, so a stale duplicate cookie makes sign-in loop. The owner hit this on testing; a restart cleared it.
- **Token format.** The token format check (`sk-ant-`) matches the real token prefix (`sk-ant-oat01-…`).
- **Windows portability:**
  - The Changelog name clash.
  - Playwright is hard-coded at `/opt/node22/...`.
  - `spawn('npx')` needs `shell: true`.
  - `URL.pathname` gives broken paths (fixed in `test/aiTools.test.mts`).
  - Git Bash rewrites `VITE_BASE=/`; build from PowerShell.
  - Local workerd crashes on outbound calls.
