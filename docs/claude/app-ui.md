<!-- Moved from CLAUDE.md, word for word: read this before working on the top bar and the dashboard. -->

## Every screen is its own download (PERF-1)

`src/App.tsx` loads each route through `screen()` (React.lazy): the first load
is the shell plus the screen opened (main chunk ~130 kB gzip, was 1.25 MB).
A chunk a deploy removed reloads the page once (`pc_chunk_reload` in
sessionStorage stops a loop). **A lazy screen must import the CSS its class
names need** — one bundle hid that `PricingParts.tsx` used `site.css` without
importing it. Rail buttons carry `aria-label` = their tooltip, and the tooltip
shows on `:focus-visible` too (UX-1).

## The top bar

`Layout/TopNav.tsx`: the shield (`LogoMark`, no name beside it — a
white-label workspace shows its own logo, or its initial on a tile), the
workspace, the pill row, the icons. **It is one line.** Its width depends on
data (a workspace name, the counts on AI Autopilot and the task badge, the
owner's extra menus), so it **measures itself** and writes `data-fit` on the
header — straight onto the element, not through React state, because each
step has to be laid out and measured in the same frame: `full`, then `tight`
(pills closer, the workspace's name hidden behind its initial), and only when
neither fits, `wrap` (the pills on a row of their own). Phones (≤900px) always
wrap. AI Autopilot and **AI Prospecting** are the two lit pills (`nav-hero`,
`nav-hero-prospect`), drawn from the owner's reference video: stacked frosted
glass tinted cyan → white → pink → peach (Prospecting led by the warm end),
the sheets as shadows underneath, a light passing over, and a milky lens
holding the AI bloom (`shared/AiBloom.tsx` — the website launcher's
`bloomSvg`, ported with per-instance gradient ids), which opens faster
(`fast`) when a project would act on the next tick. All of the movement is
behind `prefers-reduced-motion` (Settings → Profile → Animation overrules a
system that asks for less). The Customers pill is not lit while AI
Prospecting is open. The icons on the right are **one dark pill** (`.nav-corner`, the owner's
reference): a violet "+" (`QuickCreate` — a menu of screens that make things,
nothing created on its own), a hairline, outline icons, and the person's face
at the end. The face is `shared/UserFace.tsx`: the person's own photo
(Settings → Profile, `ProfilePhoto.tsx`; `/api/user-avatar.php`,
`routes/userAvatar.ts`, migration 0067 — keyed by email, bytes sniffed like a
widget photo, ≤256 px, served by a random key, read once a page by
`useMyAvatar()`; `test:isolation` covers it), and until there is one the
**animated orb** (`OrbAvatar`, `.orb-av` in index.css — the owner's
reference: a milky glass sphere whose blue/violet/pink liquid ribbon swells to
fill it and folds back into a wave; drawn in CSS, sized by `--s`). Saving or
removing a photo swaps every face on the page at once. The cloud (`CloudBadge.tsx`) is a black backlit key with the cloud lit
inside: blue when the cron ran in the last 20 minutes, amber when late, out
when unreadable; the words are kept for screen readers. The lit parts carry
`data-noinvert`, so dark mode does not turn them inside out. `test:isolation`
checks four widths as the owner, and that 1440 and up is one line.

**2026-11-13**: the account button at the end of the corner is the Protected
Central shield (`LogoMark` + green lock, `.nav-shield`); its menu opens on
"Protected by Protected Central" — only claims `docs/SECURITY.md` §7 allows
(HTTPS, server-checked workspace separation, AES-256-GCM for connected
credentials, HttpOnly session, optional 2-step) and links `/security`; never
"end-to-end", "all data encrypted at rest" or "unhackable". **Appointments**
(`Layout/AppointmentsBadge.tsx`) is a tray of its own beside Tasks: real
bookings from booking.php `list`, green count of those booked since the tray
was last opened (browser-local stamp), polled every 2 min while visible,
hidden with no bookings. The booking email to the owner is now on by default
and goes to the workspace owner when no address is given (booking.ts
`bookingMail`; a page saved with it off stays off).

## The dashboard

**The hero comes first** (owner, 2026-11-12): `DashHero.tsx` — the greeting,
"What should AI Autopilot do for your business today?", one prompt box, four
starting points, then the explainer film. Sending hands the words to the
wizard like Protron does (`pc_protron_handoff`).

- **The ground is colour light, not a picture** (owner, 2026-11-12, fourth
  pass: hills read as cartoonish, footage stuttered, then the office photo
  gave way to "a more modern background that suits the app's theme"). CSS
  only (`.dash-aurora*`): a 160° indigo → violet → pink → peach gradient, four
  soft radial blobs drifting on their own loops, two silk bands of light, a
  fixed noise grain against banding, the pointer shifting the colour (CSS
  `translate`, eased in a frame callback) and a soft light following it. It
  fills the first screen and fades into the floor under the film. Only
  transform/opacity move, nothing blurs live, all pauses once scrolled away;
  reduced motion = still gradient. No media files (docs/MEDIA-CREDITS.md).
- **The menu shares it**: Dashboard.tsx sets `--dash-bleed` to everything
  above the dashboard (menu + trial bar, measured), so the hero starts at the
  top of the page; while the hero is ≥ 35 % visible DashHero sets
  `html[data-hero-top]` and the menu turns see-through and the trial bar
  white glass (dashboard.css); scrolled on, both are solid again.
- The whole hero carries `data-noinvert`: white words on the gradient and the dark
  film look the same in both themes; only `--hero-floor`, the colour it fades
  into, follows the theme.
- **Three ways in, loudly**: a red **Record** button in the box (the shared
  transcriber, `voice/useVoiceInput.ts`; the words land in the box to be
  checked, nothing is sent) and a lit **Talk live — one-to-one with Protron**
  (opens the wizard, where the real-time conversation lives).
- **`AutopilotFilm.tsx`** ("See AI Autopilot work"), the owner's ask for a
  video instead of feature buttons: drawn by the page, not an MP4 (real
  labels, crisp, free, captioned), 3 chapters — what it does (capabilities,
  the usual way vs Autopilot, a live talk building the workflow as it goes,
  type / record / talk), six baby steps of setting it up by talking, and 14
  US example businesses with notifications ending in a payment — then a card
  with the real Talk live / Record / Type buttons. Play/pause, prev/next,
  chapter scrubber, clock, optional narration — Protron's warm AI voice,
  the live bot's voice (lines in `services/filmNarration.ts`, made once per
  install and kept in R2; see protron.md), never the browser's voice. Plays itself only on screen and without reduced motion. **Every
  result scene says "Example scenario — an illustration, not a customer's
  results"**; amounts are typical job prices, never totals or percentages.
  It replaced the panel's capability strip (`DoesStrip`, removed).
  **Second pass (owner, 2026-11-13: "glitchy… a full-width YouTube kind of
  video"):** the picture is 16:9 at the hero column's width, never taller
  than 78% of the window (`.dash-hero-film`); scenes are laid out once at a
  fixed design size (1200/960/640 wide by frame width, `.apf-canvas`) and
  scaled by one transform, typed text is laid out in full and only revealed,
  scenes cross-fade by opacity. The pointer is the site demo's engine: a
  scene lists `aim` targets (`data-k`) with when to reach and click them; it
  measures the element, travels from where it was (arc, minimum-jerk), clicks
  only once there (ripple + ring), and carries on across scenes and seeks.
  Changing a scene's words means changing `FILM_SAY` (and `test:live` L8's
  count of 19 lines plus the 14 people).
  **Third pass (owner, 2026-11-13: "show it using your app inside your
  app"):** five chapters — What it does, Set it up, **Runs your app**,
  **Watches & improves**, Results. Chapters three and four put the app on
  screen (`AppFrame`: Dashboard, AI Autopilot, Contacts, Email campaigns,
  Booking pages, Reports) and Protron's pointer opens modules, writes the
  prompt, adds prospects, builds, schedules and launches a campaign, turns on
  a booking page; then reads a running campaign's figures, runs an A/B test,
  rewrites and relaunches the weaker email, and reports what it did. Every
  app frame carries the "Example scenario" label; all figures are one
  example business's. The pointer is coral (#D97757) with a white edge, a
  soft glow and a pill naming what it is doing (`aim.say`) — the site demo
  (`Site/AutopilotDemo.tsx`) uses the same look.

Under it `Dashboard/Dashboard.tsx` has **one slim bar** (`DayBar` in
`DayBoard.tsx`, the owner's call — it replaced a tall welcome band; styled
after their reference as deep navy glass with a cool edge glow, `.day-top` in
dashboard.css, one line from 1100px): the
person's face (their photo, or the animated orb on its own — no ring; a press
opens Settings → Profile), the greeting with the name lit and what is in
motion, then the day — glass chips for the date, the live clock (lit blue),
where they are and **Add clock** (all open the clocks panel, which sits above
the blocks: the bar is `z-index: 30`, or the blocks painted over it), the
hour track lit lime up to a knob at now with the meetings pinned on it, and
the current/next meeting. The DayBoard further
down keeps only the schedule and goal rails. Under the bar every section is a
block in `.dash-grid`: one column below 1280px, two side by side from there,
`wide` blocks across the row, a dense flow so a half block moves up beside an
earlier one; a section that renders nothing leaves an empty block, which is
hidden. Blocks are not numbered (the owner removed the badges) and keep their
own height — stretching a block to its neighbour pulled the grids inside it
apart.
**No sample figures** — the 2026-11-12 audit also took the invented
statistics out of the tips ("21× more likely", "80% of sales…", "a 40%
benchmark") and stopped Suggested Actions calling a lost deal "pending".
The dashboard still runs some browser-side work on open (meeting reminders,
post-meeting follow-ups, warmup, a verification batch, deliverability
alerts) that the cron does not do; moving it server-side is open work. The pipeline board, deal journey, suggested actions,
growth chart and Business progress read only this workspace's records; with
none they say so (they once drew invented deals, "5 executed / 42% win rate",
a +34% curve and sample department scores, and a new customer took them for
their own). The growth rate is the real one and may be negative.

## Industry snapshots — Workspace → Industry snapshots (/snapshots)

Phase 3 of `docs/IMPLEMENTATION-PLAN.md`. A snapshot is typed, versioned data
in `worker/src/lib/snapshots.ts` (HVAC, Roofing, Medical billing): a pipeline
whose stages carry their checklists, contact fields, and suggested workflow
template keys (shown, not installed). `validateSnapshot` is run by the
catalogue and by `npm run test:snapshots` (also in `staging.yml`), which also
checks every template key exists.

- **An install only adds.** It writes into the app's own documents
  (`crm_pipelines`, `crm_custom_fields`) through `dataUpdate`, matching by id
  (`snap-<id>-…`), never by name. Present items are left exactly as the
  customer has them; items an earlier install added and the customer deleted
  are not put back unless `restore` is ticked. A later version adds only its
  new items, in place. A document that is not a list is refused, not replaced.
  Records carry `source.origin = 'industry-snapshot'`.
- **The marketplace is the install owner's alone** (owner's decision
  2026-10-28): the owner chooses and installs each customer's snapshot.
  Every action of `/api/snapshots.php` (`routes/snapshots.ts`) except `claim`
  — the catalogue included — answers 403 `not_owner` to anybody else, on
  their own workspace too; the menu entry is `ownerOnly` and `/snapshots`
  redirects anybody else (App.tsx). Do not add a customer path back: it is
  the business rule, not a UI preference. Migration 0079
  (`crm_workspaces.industry`, `crm_snapshot_installs` — the audit record:
  who, as which role, which version, what was added). The owner installs
  into any existing workspace without claiming it; `__agency__` never.
  Installing twice writes nothing and no second history row.
- **Five snapshots**: HVAC, Roofing, Medical billing service (the biller's own
  practice-onboarding pipeline), **Medical practice (billing client)** (the
  practice's billing follow-up — work items, never patients) and
  **E-commerce store** (customers from enquiry to repeat buyer; no
  marketplace is connected). An install writes only `crm_pipelines` and
  `crm_custom_fields` — no contacts, messages, credentials or settings.
- **Sign-up carries the industry**: `/signup?industry=<slug>` (the service
  sites' "Start the software free") is kept as `pc_industry`
  (`services/industrySetup.ts`); after sign-in `claim` **records** it on a
  new (≤ 7 days) account's own workspace, once — nothing is installed. The
  owner's workspace picker shows it as "asked for <industry>".
- The screen pushes queued edits (`flushNow`) before an install into the
  open workspace and pulls after (`refreshFromCloud`; AppContext reloads
  pipelines and fields). `npm run test:snapshotse2e` (wrangler :8875, fresh
  D1, needs a `VITE_BASE=/` build: owner vs customer on API and direct URL,
  the right snapshot into the right workspace and nowhere else) and
  `test:security` cover it.
