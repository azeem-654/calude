# The incubator

Things that are built, deployed to **both** sites, and switched on only on
**testing.protectedcentral.com** (and on a developer's machine). The live app,
app.protectedcentral.com, runs the same code with them switched off. Kept here
so that nobody — the owner, or a future session — promotes something believing
it is live, or switches one on without the testing it was held back for.

**"What do we have in the incubator?"** — the answer is the *In the incubator*
list below. Keep it current: a session that incubates or releases something
edits this file in the same commit.

## How the switch works

`src/services/features.ts`:

- `REHEARSING` — the incubator. A name in that list is on where
  `isRehearsal()` is true (the testing site, `localhost`, `*.workers.dev`
  previews — `src/services/hosts.ts`) and off on the live app. It is decided by
  the address in the browser, not at build time, so one build serves both.
- `PARKED` — off on **both** sites until the owner asks for it back.

`featureReady('<name>')` is the only check; nothing else decides it.

**To send one live:** take its name out of `REHEARSING`, delete its section
below (one line under *Released*), remove its card from the home page's
**Coming soon** section (`src/components/Site/UpcomingSection.tsx`, which
lists the incubator for visitors — "Coming soon" on live, "In testing now" on
testing) and, if it earns one, add it to What's new; push to `staging`, check
it on the testing site once more, then **Actions → Promote testing to live**.
A feature newly incubated gets a card there too, if the owner wants it shown.

## In the incubator (testing site only)

### `protron-live` — talking live with Protron (since 2026-11-14)

Real-time speech-to-speech (`services/protron/live.ts`, `/api/live.php`): the
wizard's **Talk live** button and the floating panel's live talk, plus the
hands-free turn-by-turn **Talk mode** and the Talk chip on the launcher.
Held back because "it keeps on failing" (the owner, 2026-11-14 — "The live
voice could not connect" on the wizard). On live, Protron is a chat: type, or
record a voice message (the microphone button — recorded, transcribed, sent).

Before release: a live session that opens first time on Chrome, Safari and a
phone; a drop recovering on its own; no "could not connect" with a working key.

### `protron-hands` — Protron working the screen (since 2026-11-14)

Protron's coral pointer, `press_button`, `fill_form`, `draft_social_post`
(typing into a form), and an approved plan driving the wizard by pressing its
buttons (`autoDrive`). Also the public site's story of it: the home page's
Protron section, the platform film and What's new show the chat version on
live (`agent` in `SiteHome.tsx`). Held back because "that's making the thing
complex" and some of it still needs fixing; the owner does not want the
AppSumo review to meet it half-finished.

On live, Protron still answers, opens screens, creates contacts and pipelines
on Confirm, drafts workflows, and an approved plan opens the AI Autopilot
wizard with the plan in its box — the customer presses the buttons.

The dashboard film keeps its "Runs the app" chapter (owner, 2026-11-14:
"that's definitely gonna come in the app"); where this is off, the chapter is
labelled **Coming soon** with an "Upcoming feature" badge on the picture
(`HANDS` in `AutopilotFilm.tsx`) — both disappear on release with no edit.

Before release: the pointer and autodrive e2e (`protron-brief.e2e.mjs`,
`protron-live.e2e.mjs`) green at 390 and 1280 on the testing site, and the
film checked against what the app really does.

## Parked (off on both sites)

- **`protron-speaks-first`** — the panel opening by itself after 10 s idle,
  on an error, a frozen page or a dialog opened three times. Off since
  2026-11-14: "only turn on the floating bot whenever it's clicked on." Its
  idle menu is hidden with it.

## Released

When a feature leaves this list, note here when and why, in one line.

- **`protron`** — Protron's floating chat — released to live on 2026-11-13 at
  the owner's request ("switch it on for live"). Its live talk and screen
  driving went back into the incubator on 2026-11-14 (above).
- **`prospects`** — prospect search — released 2026-10-01 once it searched
  Google Maps on the owner's key.
