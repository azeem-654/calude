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

### `protron-acts` — the floating Protron as a builder (since 2026-11-14)

Owner, 2026-11-14: "just keep the floating Protron for the customer support
and not for establishing and executing things … keep that executor in the
incubator." With it off (live), `Who.acts === false`: `checkCall` refuses and
`describeActions` hides every action in `EXECUTES` (`actions.ts` — create a
contact or pipeline, a prospect search, a workflow draft, a set-up plan,
starting a business workspace, the business profile, and the hands actions);
`brain.ts` gives the model a support job instead of the builder's
(`support`); the offline matcher never offers to build and points a fault at
**Report a problem**; starters are questions plus the report chip; the panel
says **Help & support** and greets as the support assistant. Opening a
screen, counts and listing business workspaces stay — that is how support
shows somebody where to go. The wizard's Protron (New business workspace) is
not the floating panel and is unchanged.

Since 2026-11-15 (owner: "remove only the floating Protron from the live
site") the floating Protron is not drawn at all where this is off — App.tsx
mounts it only with `protron-acts` on. On live, its support answers are the
help button's Live chat and its Report a problem is the help button's.

**Report a problem** is *not* incubated — it is on both sites, now on the help
button (see `docs/claude/platform.md`).

Before release: the owner decides Protron should build again on live; the
pure tests P14 (support) and P13 (hands) still pass.

### `video-studio` — AI Video Studio's editing and Shorts (since 2026-11-14)

Owner, 2026-11-14: "hide the features of video editing and creating shorts
from the live site and keep it in the incubator, because I saw several
problems there which needs to be fixed before it goes live." With it off
(live): `/video-studio` is the **Media Library** with only its pictures
(`PicturesOnly` — no recorder, recordings, projects, Quick Shorts, Repurpose,
Brand Kit, Exports, Publish or Templates tabs); the editor, `?new=1` and any
other tab show "Video editing and AI Shorts are coming soon"; the sidebar and
search say **Media Library**; the contact's AI Shorts tab, the business
workspace's Videos box, the dashboard's AI Shorts tile, the Usage card's Video
meters, the price cards' and comparison's video lines, the home page's "AI
Shorts", the trial FAQ's Shorts count, the 12-month plan's Shorts bullet and
the help button's mention of AI Video Studio (`houseKnowledge.ts`, by
`APP_ORIGIN`) are gone; Autopilot's Video Content solution offers only the
YouTube channel → articles and posts. The plan table and its meters are
unchanged (display only), the Worker's video routes and `VIDEO_CRON` still
run, and an existing video project keeps processing.

Before release: the owner's list of Video Studio problems fixed
(`docs/claude/video-studio-overhaul.md`), `test:studio` and the Video Studio
e2e green at 390 and 1280 on the testing site.

### `reviews`, `jobs-revenue`, `online-shop`, `trade-services`, `medical-billing` (since 2026-11-18)

Owner, 2026-11-18: move Reviews into the incubator, because reading Google
reviews needs the Google Maps (Places) key, which Google refuses until a $30
deposit is paid ("by the time I'll arrange this money, then we'll get that
module live"). In the same message, Jobs & revenue, the e-commerce set-up, the
plumbing/electrician (trade) contracts and medical billing are "not part of
our current structure now" and go with it.

With them off (live): no menu row, rail button, palette result or dashboard
tip (`navModel.ts` `HELD`, `Sidebar.tsx`, `TopNav.tsx`, `Dashboard.tsx`); the
addresses `/reputation`, `/jobs`, `/sell`, `/growth`, `/snapshots`, `/rcm`
show "… is coming soon" (`shared/Incubated.tsx`, `App.tsx`); AI Autopilot
neither offers nor accepts the Reputation Management or E-commerce Store
solutions (`isOffered` in `projectSolutions.ts` — the catalogue keeps them so
a business workspace saved on testing still reads) and Local Business Growth
drops "More reviews"; the market feed has no Reputation instrument; Protron's
screen notes and the help button's facts (`houseKnowledge.ts`) neither list
nor sell them. The Worker's routes are unchanged.

Before release (`reviews`): the Google Maps key accepted (Settings →
Platform services shows it Working), or SerpApi carrying review reads on its
own — a refused Maps key now hands over to SerpApi (`serpReviews.ts`); the
Reviews e2e at 390 and 1280 on testing. The others: the owner asks for them.

### The public site's side of the 2026-11-18 five

On protectedcentral.com (`Site/siteFeatures.ts`): the service sites /hvac,
/roofing (`trade-services`), /medical-billing (`medical-billing`) and
/ecommerce-management-services (`online-shop`) are a real 404 on live
(`isKnownPublicPath(path, host)`; the Worker reads `servicesPublic`, the same
hosts) and their cards, prices, links, FAQ words, logo roles and changelog
lines are gone; Reviews leaves the cloud list and the logo strip; the module
recordings are made with the incubator off. **Coming soon** carries a small
card for Reviews, Jobs & revenue, Online shop and Managed services — remove a
card when its switch is released.

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
