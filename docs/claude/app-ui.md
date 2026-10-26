<!-- Moved from CLAUDE.md, word for word: read this before working on the top bar and the dashboard. -->

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

## The dashboard

`Dashboard/Dashboard.tsx` opens on **one slim bar** (`DayBar` in
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
**No sample figures.** The pipeline board, deal journey, suggested actions,
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
- **Route** `/api/snapshots.php` (`routes/snapshots.ts`), migration 0079
  (`crm_workspaces.industry`, `crm_snapshot_installs`). A customer installs
  where `workspaceAccess` lets them; the install owner into any existing
  workspace without claiming it; client logins and `__agency__` never.
  Installing twice writes nothing and no second history row.
- **Sign-up carries the industry**: `/signup?industry=<slug>` (the trade
  sites' "Start the software free") is kept as `pc_industry`
  (`services/industrySetup.ts`); SyncGate calls `claim` *before the first
  pull*, so the new workspace opens on the industry pipeline and the generic
  one is never seeded. The server honours it once, for a new (≤ 7 days)
  account's own workspace (`industry = ''` claim).
- The screen pushes queued edits (`flushNow`) before an install into the
  open workspace and pulls after (`refreshFromCloud`; AppContext reloads
  pipelines and fields). `npm run test:snapshotse2e` (wrangler :8875, fresh
  D1, needs a `VITE_BASE=/` build) and `test:security` cover it.
