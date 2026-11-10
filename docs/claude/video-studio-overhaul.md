# AI Video Studio overhaul — three phases, one memory file

**Read this first when the owner says "continue with phase N" (or anything
about Shorts, reframing, thumbnails themes or the live preview).** The owner
clears the conversation between phases, so this file is the only memory. The
section **Phase ledger** at the end says exactly what was built, where, what
was tested and what is still open. Update it before every push.

The owner's brief (2026-11-10): fix three problems in the AI Video Studio —
(1) "New short composition" centre-crops a landscape video so the sides are
lost; (2) AI thumbnails ignore the supplied reference and add odd shapes, and
a thumbnail design cannot be saved and reused; (3) edits show in the export
but not in the live preview. Plus: a guided Shorts wizard (AI decides how
many Shorts, or a topic, or a time range), metadata, reusable thumbnail
themes in the Design Studio, tests, and a final report. Full brief:
reproduce from the ledger, not from memory.

## Audit (done 2026-11-10, before any change)

Read `docs/claude/video-studio.md` for the area's own notes. What matters
for this work:

- **Entry point**: `CompositionMenu` in `src/components/VideoStudio/VideoEditor.tsx`
  → op `clip.add` (`worker/src/lib/video/edit.ts` ~L787). A new clip gets
  `aspect: doc.shorts.aspect` (9:16) and `reframe: { mode: doc.shorts.mode ?? 'crop', x: 0.5, y: 0.5 }`,
  no `layout`, no analysis. **That is the centre crop.**
- **Render** (`worker/src/lib/video/pipeline.ts` `renderSpec` ~L765 and the
  render job ~L1060): `tracking` is on only if `doc.tracking.short` is set
  (default `'off'`) or the clip's layout is `speaker`; otherwise the engine
  (`media/engine/server.mjs` `render`, `crop@cam`) crops a full-height window
  centred on `cropX` — the same centre crop. Layouts `split/two/pip` need the
  face track; `screencam/follow` need the Screen Recorder's notes
  (`extras.screen`, `prep/screen.json`), which an upload never has.
- **Analysis that exists**: `media/engine/track.py` (OpenCV YuNet faces, the
  speaker by mouth movement during speech, `people`) run by the engine op
  `track` after `prepare` for every project → `prep/faces.json`
  (`TrackFile` in `lib/video/motion.ts`). No cursor detection, no scene
  type, no scene cuts, no content/text regions.
- **Pointer following** (`lib/video/pointer.ts`): a complete path→window
  system (`screenPlan`, `followPath`, `wideSpans`, `followAt`; engine
  `screenFrame` with `crop@ptr` moved by sendcmd; preview `drawScreenLayout`
  on a canvas) but fed only by the Screen Recorder's own `PointerLog`.
- **Preview** (`src/components/VideoStudio/Player.tsx`): two `<video>` on the
  720p proxy (`deck.ts`); crop = `object-position`; look + colour effects =
  one CSS `filter` string (`cssLook`, `cssEffects` in `motion.ts`) **on the
  deck div only**; a layout Short is drawn on a `<canvas class="vse-layout">`
  that sits over the deck — **the filter never reaches it**. Not previewed at
  all: vignette, grain, sharpness, green screen, skin smoothing. The engine
  order is select → sendcmd → skin → frame(crop/layout) → green → zoom →
  look/colour/appearance → transition → speed → subtitles/overlays → fades →
  bar → logo.
- **Edits**: `ctx.apply` applies ops locally at once (optimistic), then
  saves a version; undo/redo walk versions (`step`). Sliders (`FxSlider`)
  save on release only, no live value while dragging.
- **Shorts picks**: `lib/video/shorts.ts` (AI picks on whole sentences,
  fallback rules), run by the `shorts` job with a fixed `count` from the
  welcome wizard. Metadata: `cleanMeta`/`fallbackMeta`.
- **Thumbnails**: `lib/video/thumbStyle.ts` (reads the example with vision,
  `styleFromReading`, `modernStyles`), `media/engine/thumbLayout.mjs`
  (`thumbPlan`, nine layouts, stickers, arrow/ring, panels, number badge),
  `ThumbnailDesigner.tsx`, `ThumbShowcase.tsx`; design studio under
  `worker/src/lib/design/` (`spec.ts`, `templates.ts`) and the Graphics
  Designer (`designerHandoff.ts`). No saved reusable thumbnail theme.
- **Tests**: `npm run test:video` (`test/videoStudio.test.mts`, pure),
  `npm run test:videoe2e` (`test/videoStudio.e2e.mjs`, real engine + mocks,
  needs ffmpeg and a `VITE_BASE=/` build; synthetic recordings from
  `test/videoStudioMock.mjs`). Python 3 + OpenCV + ffmpeg are available in
  the cloud session, so `track.py` can be run locally on synthetic clips.

## Root causes (for the final report)

1. **Centre crop**: a new Short is a crop at x = 0.5 with tracking off by
   default; the face track is used only when the customer switches tracking
   on or picks a layout; uploads have no pointer/screen analysis at all, so
   screen recordings can only be centre-cropped or letterboxed.
2. **Preview ≠ export**: the preview re-derives the visual decisions
   separately from `renderSpec`, its CSS filter is on the wrong element for
   layout Shorts, and five effects have no preview at all.
3. **Thumbnails**: the layout planner adds decorations (stickers, rings,
   arrows, panels, number badges) by rule; the example reader maps a reading
   to one of nine fixed layouts, so a reference's actual composition is only
   loosely followed; nothing is saved as a reusable theme.

## The plan

### Phase 1 — live preview = export, and intelligent reframing
- `lib/video/visual.ts` (pure, shared): `visualSpec()` — every visual
  decision (frame mode, tracking, layout, screen layout, framing plan, look,
  motion, effects on, overlays, logo) from the doc + probe + analysis.
  `renderSpec` and the Player both read it; a test asserts they agree.
- Player: one `.vse-picture` wrapper carrying the look/effects filter over
  both the deck and the layout canvas; vignette, grain and sharpness layers;
  a WebGL chroma-key layer for green screen; a skin-smoothing overlay over
  the tracked face; live slider values while dragging (`vs-tweak`).
- `track.py` v2: per-frame motion grid, cursor detection (small coherent
  moving blob while the rest is still), scene cuts, content/edge box, a
  `kind` classification (screen / screencam / talking / two / slides /
  camera) with `why`; written into the same `faces.json` (`analysis`).
- `lib/video/reframe.ts` (pure, shared): `framingFor()` chooses the
  strategy per Short from the analysis and the customer's `clip.framing`
  settings, and builds a `ScreenMeta`-shaped path (cursor / activity /
  face) so the existing `screenPlan`/`followPath`/`screenFrame` machinery
  renders and previews it. Clip gains `framing` (strategy, zoom, focus,
  split share, camera side, pins) — parameters only; paths are derived.
- Engine: `crop@cam` window size from params (`cameraWindow`), and a
  `region` pre-crop for `fit`.
- Video panel: strategy chips, zoom, focal point set by clicking the
  preview, split share, camera side; every change previewed.
- New Short Composition keeps creating the clip, now with AI framing; the
  wizard itself is Phase 2.
- Tests: unit (planner on synthetic analyses: cursor on the left stays in
  frame, talking head keeps headroom, slides never crop text; visualSpec ≡
  renderSpec), track.py on synthetic clips (moving cursor found; a
  pan/zoom clip is not a screen), e2e additions where cheap.

### Phase 2 — the guided Shorts wizard
"New short composition" opens the wizard: Step 1 analysis status (duration,
shape, scenes, transcript, kind, candidate moments); Step 2 how (A: let AI
decide the number — no fixed count, "none suitable" is an answer; B: a topic
or moment via transcript search + AI; C: a time range improved to sentence
boundaries); Step 3 preferences (platform, aspect, language, caption style,
layout preference, branding, theme, CTA, duration override); Step 4
proposals (title, topic, timestamps, duration, why, transcript preview,
composition, thumbnail concept; approve / reject / edit / another /
regenerate); Step 5 generate (clips with framing, captions, branding,
metadata, thumbnail, render, library). `shorts.ts` grows: open-ended
selection with quality checks (complete thought, no mid-sentence cuts,
hook, not redundant), topic search, range improvement, metadata (title,
description, hashtags, tags, CTA, pinned comment, category, thumbnail text).

### Phase 3 — thumbnails, reusable themes, QA, report
Reference analysis that describes composition (subject size/side,
text area, palette, typography weight, treatment) and a planner that adds
no decoration unless the reference has it; `thumb_theme` rows (named,
described, full spec config, logo placement, image treatment) saved from a
thumbnail, applied to any Short, edited/duplicated, previewed with another
subject; integration with the design studio's template structure. Then the
QA sweep of the brief's list (typecheck, build, tests, 390/1280, console,
API failures, memory) and the final report, written to
`docs/VIDEO-STUDIO-OVERHAUL-REPORT.md`.

## Rules carried across phases

- Everything the browser previews is derived from the same pure functions
  the Worker sends the engine; the engine owns every filter string.
- No invented capability: where an analysis could not run (no OpenCV, old
  faces.json), the UI says so and offers "Analyse again".
- Doc stays small: parameters in the doc, paths derived.
- Keep `npm run typecheck`, `npx tsc --noEmit -p worker/tsconfig.json`,
  `npm run test:video`, `npm run test:security` green; push to the feature
  branch and `staging` after each phase.

## Phase ledger

### Phase 1 — status: DONE 2026-11-10 (commit 5192082)

**What was built** (details word for word in `docs/claude/video-studio.md`
→ "Framing a Short round what matters" and "The preview shows every effect"):

- `media/engine/track.py`: the `Analyser` (pointer, motion grid/activity,
  scene cuts, content box, flat/still, `kind`+`why`) in the same pass as the
  faces; output under `analysis` (v2). `detector()` survives a build without
  Haar (`none`). Engine `track()` puts `{v, kind, why, cursorSeen, people}`
  in the summary. Engine `screenFrame`/`cleanScreenLayout`: `fitScreen`.
- `worker/src/lib/video/reframe.ts` (new): `STRATEGY_LABEL/HINT`, `knownOf`,
  `framingOptions`, `resolveFraming`, `framingMatters`, `glidePath`,
  `framePlan`, `windowCentre`.
- `worker/src/lib/video/visual.ts` (new): `visualSpec`, `framingKey`.
- `edit.ts`: `Framing`, `FRAME_STRATEGIES`, `cleanFraming`,
  `clip.update.patch.framing` (sets reframe crop/fit, drops the layout).
- `motion.ts`: `Analysis`, `AnalysisSummary`, `VideoKind`, `KIND_LABEL`,
  `TrackFile.analysis`; preview helpers `vignetteStops`, `grainOpacity`,
  `sharpenKernel`. `pointer.ts`: `toSrc` exported.
- `pipeline.ts`: `renderSpec` reads `visualSpec`; `RenderSpec.framing`;
  the render job builds `framed` from `framePlan` and sends it as the
  engine layout (`ptr.screenLayout ?? framed ?? layout`); hash `fr`.
- Browser: `Player.tsx` (visualSpec, `.vse-picture` filter wrapper, SVG
  sharpen, vignette/grain layers, `greenKey.ts` WebGL keyer, skin overlay,
  `vs-tweak` live sliders, `drawAim` + `vs-aim`/`vs-aimed`, framing badge),
  `InspectorPanels.tsx` `FramingSection`, `EffectsPanels.tsx` +
  `EffectRow.tsx` `onLive`, `VideoEditor.tsx` re-fetches the track by `at`,
  `services/videoStudio.ts` re-exports, `videoStudio.css` layers.
- Tests: `test/videoStudio.test.mts` (+21), `test/videoAnalysis.test.mts`
  (new, `npm run test:videoanalysis`, 9 checks on synthetic clips).

**Verified**: `npm run typecheck`, Worker tsc, `test:video` 355/355,
`test:videoanalysis` 9/9 (with the YuNet model), `VITE_BASE=/ npm run build`.
`test:videoe2e`: see the line below this one (filled in when it finished).

**Decisions to remember**
- `auto` with no analysis resolves to a still crop that `framingMatters`
  rejects → `framing: null` → old projects keep their hash and render as
  before. A customer's explicit strategy always goes through the planner.
- The classic layouts (split/two/pip, Screen Recorder screencam/follow)
  take precedence over the planner; `two` people in `auto` → the classic
  `two` layout. Picking a framing deletes `clip.layout`.
- The old `tracking` crop (`crop@cam`, object-position preview) is kept
  for the long video and for `clip.layout === 'speaker'`; new Shorts go
  through the planner's `follow` window instead.
- Not done in Phase 1 (deferred, not forgotten): the wizard itself (Phase
  2); active-speaker *audio* evidence beyond lip movement (track.py reads
  lips — said on screen); text/OCR regions (edge density stands in);
  a real e2e render check of a planner Short (the engine path is the
  existing `screenFrame`, exercised by the Screen Recorder e2e).

### Phase 2 — status: BUILT 2026-11-10 (awaiting the owner's go-ahead for Phase 3)

**What was built** (details word for word in `docs/claude/video-studio.md`
→ "The Shorts wizard"):
- `worker/src/lib/video/shortsWizard.ts` (new, pure): `PLATFORMS`,
  `WizardPrefs`/`cleanPrefs`/`lengthOf`, `checksFor`, `tidy`, `snapRange`,
  `pausesIn`, `partsWithout`, `honestTitles`, `thumbTextFor`,
  `proposePrompt`, `fromAi`, `fromAiRange`, `byRule`, `fromRange`,
  `wizardCtx`, `MAX_PROPOSALS` (12).
- `shorts.ts`: `fit` exported, `CATEGORIES`, `VideoMeta.category/thumbText`,
  `by: 'you'`. `edit.ts`: `clip.add` takes `aspect`, `framing`, `scores`
  (`addExtras`; every new Short `framing: auto`). `visual.ts`: an older
  Short with Tracking-tab face following keeps it (planner skipped).
- `routes/video.ts`: `shorts_propose`, `shorts_create` (see the notes).
- Browser: `ShortsWizard.tsx` (new), `VideoEditor.tsx` (mounts it on
  `vs-shorts-wizard`; menu: "New short composition" → wizard, "Quick
  Short"), `services/videoStudio.ts` (`proposeShorts`, `createShorts`,
  re-exports), `videoStudio.css` (`.vs-wz*`).
- Tests: `test/videoStudio.test.mts` (+16), `test/videoStudio.e2e.mjs`
  (wizard section; "Quick Short" step; layout step reads the framing
  tiles), `test/videoStudioMock.mjs` (topic answers), `test/security.e2e.mjs`
  (+6 video checks).

**Verified**: typecheck, Worker tsc, `test:video` 371/371,
`test:security` 201/201. `test:videoe2e`: see "End-to-end status" below.

**End-to-end status (keep updated)**: Phase 1's run on its own commit had
4 failures in code neither phase touched — the thumbnail order check
expects "modern" first (the 2026-11-03 change made "bold" first on
purpose), the noise command expects `strong` (it is `max` by design since
2026-11), the Audio panel check that follows from it, and the Publishing
panel's "kept after a reload". A run on the commit before Phase 1
(f7abd78) decides whether they were already failing — result below.

**Decisions to remember**
- Proposals are not stored; the browser holds the cards. The server trusts
  none of them: `shorts_create` re-snaps and re-checks.
- Pause trimming uses `clip.parts`, never global cuts.
- Found by the Phase 1 end-to-end run and fixed: two people taking turns in
  `auto` now **follow whoever is talking** (speaker window, cuts on the
  speaker track's switches) — the stacked `two` stays a layout choice; and
  "Follow the speaker" from the Tracking tab wins over `auto` (new Shorts
  included) until a framing is named in the Video panel (`visual.ts`
  `named`).
- For Phase 3's QA sweep: at 390 wide the open side panel lies over the
  editor's breadcrumb, so the composition menu cannot be pressed until the
  panel is closed (the suite opens the wizard by its event there).
- Thumbnail theme choice in the wizard is "made with each Short / not now"
  until Phase 3's saved themes exist — Phase 3 adds them to step 3
  (`WizardPrefs.thumbnail`) and to `shorts_create`'s thumbnails enqueue.

### Phase 3 — status: NOT STARTED
Start here: read this file, then `docs/claude/video-studio.md` →
"Thumbnails" and the 2026-11 "Thumbnails without a circle" note, then
`worker/src/lib/video/thumbStyle.ts`, `media/engine/thumbLayout.mjs`
(`thumbPlan`, stickers, arrow/ring, panels, number), `ThumbnailDesigner.tsx`,
`ThumbShowcase.tsx`, `designerHandoff.ts`, `worker/src/lib/design/`
(`spec.ts`, `templates.ts`) and `docs/claude/graphics.md`. Build what **The
plan → Phase 3** says; plug saved themes into the wizard (above).
