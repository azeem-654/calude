# Site demos overhaul — owner's brief of 2026-11-19 and the plan

Read with `docs/claude/site.md` (clips, film, reels) and `testing.md`.
Ledger at the bottom: tick a phase when it lands on `staging`.

## The brief, in the owner's words condensed

1. **No still pictures anywhere on protectedcentral.com.** Every module is shown
   as a recording of the real app: a pointer moving, clicking, typing.
2. **A 3D, interactive-looking pointer** in every recording, not a flat arrow.
3. **Hero** ("AI builds…" section): a recorded tour of what makes the product
   unique, in this order —
   - AI Autopilot holding **three business workspaces** (three businesses, each
     with its own website);
   - each paying the agency **$1,200 a month**: the receipts/invoices for the
     three, and a **pending one** being chased with an automatic reminder and a
     payment link — "all on total automation";
   - AI Prospecting's **daily finder** adding new prospects to a workspace's
     workflow every day;
   - the background jobs of a workspace: the daily **social posts**, and a
     **blog post** with its SEO research and its **ranked keywords highlighted**.
   Labelled on screen as a **sample project / real-life demonstration**.
4. **One dedicated demo per module** showing *every* feature of it. Example
   given: Pipelines — building stages, moving a deal between stages, the
   automation on a stage, sub-tasks, deadlines/due dates, and each view (list,
   Kanban, blocks).
5. **AI Autopilot's demo walks through its workflows step by step** (the
   canvas, each node).
6. **Sections still missing a demo** get one (today: the agents section and the
   ownership tabs are stills from `site-reels.mts`).
7. **One full-length platform film** for the second section, re-cut from the
   new recordings, including **upcoming (incubator) modules** as well as live
   ones.

## What is real today, and what must be built first (checked 2026-11-19)

| Hero beat | Real? | Where / gap |
|---|---|---|
| Three business workspaces, each with a website | Yes | Autopilot projects + Websites; seed three in `site-seed.mjs` |
| $1,200/month per client, payment link | Yes | Agency → client → **Reseller billing** "Create a monthly payment link" (`ResellerBilling.tsx`, `routes/resell.ts`); statuses Active / Past due |
| Receipts listed per client | Partly | statuses and links exist; a per-client payments list must be checked — if absent, build it in `ResellerBilling` from `resell.ts` events (not invented rows) |
| **Automatic reminder for a past-due client** | **No** | Autopilot chases unpaid **shop orders** only (`autopilotPlan.ts` ~L899, shop is incubated). Needs a planner item for `past_due` reseller clients: one reminder email with a fresh payment link through `lib/deliver.ts`, guarded like the shop one. Build + test before recording |
| Daily finder adding prospects to a workflow | Yes | `routes/finders.ts`; seed already has 30 days of a daily finder |
| Daily social posts | Yes | Autopilot posts scheduled |
| Blog post with SEO research, keywords highlighted | Partly | `blogWriter.ts` nine checks and keyword research exist; a **highlight of the target keywords in the draft** must be checked in the editor and added if missing |
| Pipelines: stages, drag, automations, sub-tasks, due dates, list/Kanban/blocks | Check each in `src/components/Pipelines` before scripting; record only what exists |

Honesty rules that still hold (CLAUDE.md): the figures are sample figures and
the frame says **"Sample project — real app, demonstration data"**; businesses
are on `.example` addresses; nothing on screen claims results.

**Incubator modules in the film**: shown only under a **"Coming soon"** title
card, recorded on a host where `isRehearsal()` is true; never mixed into the
live modules' chapters.

## How it is built (reuse, do not rewrite)

- Recorder: `scripts/site-clips.mts` (DevTools screencast, the pointer is a
  page element following the real mouse, planned motion pace, recipe refuses
  on a missed target). Seeds: `scripts/site-seed.mjs`, `demo-world.mjs`.
- Player: `ClipPlayer.tsx` + `Site/clips.ts`; film: `scripts/site-film.mts`
  into `public/site/launch/`.
- **Phase 1 — the pointer**: replace the page-element arrow in
  `site-clips.mts` with a 3D one (layered SVG: gradient body, rim light, soft
  drop shadow that lengthens with speed, a slight tilt in the direction of
  travel, a press-in + ripple on click, a text-caret form while typing).
  Re-record one clip, owner approves, then everything uses it.
- **Phase 2 — hero**: build the past-due reminder (above) and any missing
  receipts list; seed the three-workspace agency; record `clip-hero` (~60–90 s,
  chapters with on-screen labels); replace the hero's ShotReel with
  `ClipPlayer`; mobile gets the 9:16 crop.
- **Phase 3 — module demos, longer**: one recipe per module covering every
  feature (Pipelines as the model); 45–120 s each; chapter tabs inside a
  module where it is long. Autopilot includes the workflow canvas node by node.
- **Phase 4 — remaining stills**: agents section, ownership tabs, microsites'
  `shots` → clips. Then `grep` the site for `.webp` stills and `ShotReel`
  uses; none may remain on a section (posters for reduced motion are allowed).
- **Phase 5 — the platform film**: re-cut from phases 2–4 plus a "Coming
  soon" chapter of incubator modules; both shapes (16:9, 9:16); replaces
  `public/site/launch/`.

Weight: keep each clip under ~4 MB (VP9 + H.264), posters only for reduced
motion; `test:sitefit` and `test:reeltour` must stay green.

## Ledger

| Phase | State |
|---|---|
| 1 Pointer | built (`scripts/clip-cursor.mts`); `clip-contacts` and `clip-pipelines` re-recorded with it — **waiting for the owner's approval** before the other clips are retaken |
| 2 Hero (+ past-due reminder, receipts, keyword highlight) | not started |
| 3 Module demos | not started |
| 4 Remaining stills → clips | not started |
| 5 Platform film | not started |
