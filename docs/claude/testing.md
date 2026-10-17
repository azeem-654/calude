<!-- Moved from CLAUDE.md, word for word: read this before working on verifying a change, the site pictures, test traps. -->

## Verifying a change

The app is a single-page product with a lot of state; a typecheck proves very
little about it. Chromium and Playwright are installed:

```js
import pw from '/opt/node22/lib/node_modules/playwright/index.js';
```

Build with `VITE_BASE=/`, run `npx wrangler dev --local`, then drive
`http://localhost:8787` — the same Worker and a real D1, so the API is exercised
too. Worth checking on every UI change: 390px and 1280px, horizontal overflow of
the document, and `pageerror`. For the public site, `npm run test:sitefit`
drives fourteen window sizes (a 1340×590 laptop, 4K, tablets, phones upright
and on their side) and fails if the hero's picture or the launch film does not
fit on the screen — size things on the site by the window's height as well as
its width.

**The site's pictures are the running app.** `npx tsx scripts/site-reels.mts
[file…]` (after a `VITE_BASE=/` build) starts its own wrangler (:8797, fresh D1
in `.wrangler-reels`) and a mock directory, DNS and mailbox verifier (:8857), seeds
a busy sample agency (`site-seed.mjs` + `demo-world.mjs`: five clients in five
trades, branching five-column workflows, 30 days of a daily finder, 72 contacts
across 25 industries, all on `.example`), and photographs every shot in
`src/components/Site/reels.ts` **three ways**, each the page from the window
down: the desktop in a 1920×1200 window, 1.5× (`<file>.webp`, 2000 wide, and
`<file>-sm.webp`, 1200), and the app's own phone layout in a 390×720 window,
3× (`<file>-m.webp`, 1000 wide, starting under the top bar). `PHONE_ONLY=1`
retakes just the phone ones. A shot with no recipe stops the run, and every
recipe ends on `onScreen(path, heading, …texts)` — a shot that landed
anywhere else (a redirect to the dashboard, a tab that is gone) is refused,
because that is how the sections came to show each other's screens. **Each
section's reel is screens of its own module only**; a chapter's reel names
the module on every slide (`module`) and lights that module's block.
`HOLD=1` seeds and waits, for working out a recipe by hand.

**Readable at every size** (ShotReel): every reel is a strip of slides.
Each picture is the **whole page** from where its recipe left it scrolled (up
to 3,000 CSS px on a desktop, 2,160 on a phone; panes that scroll on their own
are let out first; a screen with a dialog open is the window alone). **Wider
than a phone, there is no zoom** (the owner's call): the slide showing takes
the strip's whole width — and every strip, not only the hero's, runs out to
the hero's gutter, up to its 1760px cap (`--sec-pad` margins in site.css,
never `100vw`); the height is 16:9 of that width or what the window allows,
whichever is less, so a short window no longer narrows it — and each
slide opens on the **whole page fitted in**, widens to the full width at the
top, holds a beat, travels down to the bottom at a reading pace, and moves
**straight on to the next slide** — nothing scrolls back up (the slide just
read stays at its bottom as it slides away). **A phone keeps its own tour**
(the owner is happy with it — leave it): the app's own phone layout as wide
as the column, read top to bottom and back. While it travels, the shot's
`notes` (NOTES in reels.ts — how it works, what it brings in, only what the
screen shows) come up one at a time over it. **It plays with reduced motion
asked for too** — on many machines a battery saver sets that — with the
widening and the way back as a fade, and a pause button on every reel.
`npm run test:reeltour` checks all of it at 1440 and 390, both motion
settings. **Full size** (and a click on the slide) opens the whole page to
scroll, portalled to `<body>`. The product sections are `FeatureStage`
(title on top, the wide strip, feature blocks under it with looping icons);
the launch film is re-rendered from `marketing/launch-film` (its README has
the kit and the honesty table). **Phones (≤760px) play the 9:16 film**
(`hls-9x16/`, `launch-9x16.mp4`, `poster-9x16.jpg`, made by `vertical.mjs`;
LaunchFilm `tall`, chosen once on arrival), the desktop the 16:9 one. The
site's nav measures itself (`data-fit`: `full` → `tight`, the shield without
the name → `tiny`, smaller buttons and "Try free") so it never runs off a
phone, and its stuck bar is opaque there. The sample workflows (`FLOWS` in
site-reels.mts) ask three or four nested questions each and must fit five
columns; `DESKTOP_ONLY=1` retakes just the desktop pictures.

Recurring traps when writing those checks:

- Scope locators to the dialog. The nav behind an overlay has buttons whose
  names collide with the ones inside it.
- `loadOnboarding()` ignores any stored state without `version: 1`. Seeded test
  fixtures need it.
- To seed a signed-in session, write `crm_session` (a `{token, user, backend}`
  object), `crm_active_account` **and `crm_subaccounts` containing a row whose
  `id` is that account**. All three are in `GLOBAL_KEYS`, so they are *not*
  workspace-prefixed; writing a prefixed copy by hand gets you a logged-out page.
  Omit `crm_subaccounts` and `ensureDefaultAccount()` sees no workspace, invents
  `acct-<timestamp>` and overwrites the id you just set — every API call then
  answers 403 and the screen looks like a server fault. Real sign-in is immune:
  `login()` writes the server's id *after* that has already run.

**There is one end-to-end check, and it is worth running.** `npm run smoke`
signs up, fills the portfolio, throws the browser away, signs back in on a
clean one and asserts the workspace came back. That is the path that broke
twice, invisibly to `tsc`, and stayed broken in production for weeks. It needs
a built bundle and a running `wrangler dev`; it is deliberately not in the
deploy workflow, because it needs a browser and would roughly triple it.

**Scheduled work is testable.** Run `wrangler dev --local --test-scheduled` and
fire the cron with `curl http://127.0.0.1:8787/cdn-cgi/handler/scheduled`. To
re-plan on demand, null `crm_autopilot.last_planned_at` — the planner is
otherwise once a day and you will see nothing.

**Motion is a preference, not a constant.** Every moving part is gated on
`prefers-reduced-motion`, and `src/services/motion.ts` lets somebody overrule
their system for this browser — it rewrites the media *conditions* through the
CSSOM rather than unwrapping sixteen `@media` blocks, so specificity and the
cascade stay exactly as written. A `MutationObserver` re-applies it when Vite
injects the next component's CSS, which is most of it. `test/motion.e2e.mjs`
drives a real browser with `reducedMotion: 'reduce'`; asserting the dashboard is
*completely* still is what found two animations written inline in JSX, which no
media query could reach.

**Test the failure, not just the success.** Point a mailbox at a local SMTP sink
and check that a send that fails is reported as failed and leaves its marker
unset, so it retries. A pass that only proves the happy path proves the one case
that was never in doubt.
