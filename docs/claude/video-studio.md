<!-- Moved from CLAUDE.md, word for word: read this before working on ai video studio. -->

## AI Video Studio — long recording in, cleaned video, Shorts, captions, PNGs out

`docs/VIDEO-STUDIO.md` is the audit, architecture, costs and phases. `/video-studio`
(Content → **AI Video Studio**, lazy `components/VideoStudio/`) talks only to
`/api/video.php` (`routes/video.ts`, session + `workspaceAccess`, every row read
`WHERE account_id = ?`, a foreign id is `not_found`). Bytes never pass through it:
it hands out **signed, short-lived links** to `/api/video-file.php`
(`routes/videoFile.ts`, `lib/video/store.ts`: HMAC with `installSecret('video_url')`,
the key must sit under `v/<workspace>/`, modes get / up (a browser upload part) /
put (an engine output prefix) / poke / listen (a library track by id)). **Parts
stream to R2** through a `FixedLengthStream` of their declared length — only part
1 is read whole, to sniff it; buffering 16 MB parts several at a time took an
isolate to its 128 MB and reset it ("Network connection lost"). Signed
links expire **on the hour** so a poll hands out the same address within it —
a link that changed every poll reloaded the player, which is why the preview
played three seconds and stopped; `Player.tsx` also holds its first address
until the video errors. The old browser-only **AI Shorts** and **Repurposing**
modules are tabs inside the studio (`?tab=quick-shorts`, `?tab=repurpose`;
`/ai-shorts` and `/social-automation` redirect there, query kept), drawn
outside its dark frame — AI Shorts' "transcript" is written by Gemini and its
export is a canvas recording; Video Studio is the real one.

- **Three Cloudflare pieces, all optional at deploy.** `VIDEO` (R2, created by name),
  `MEDIA` (service binding to the FFmpeg engine, a Container Worker) and `AI` (Workers
  AI, for Whisper) are in `wrangler.jsonc`; `scripts/video-bindings.mjs`, run by both
  deploy workflows (`continue-on-error`), writes a config with **none** of them first,
  then adds back each one it proved — so a half-run step leaves a deployable file and
  a missing piece never blocks a release. Local `wrangler dev` runs R2 locally; tests
  set `MEDIA_ENGINE_URL` + `MEDIA_ENGINE_SECRET` (an engine elsewhere, HMAC-signed;
  takes precedence over the binding) and `WORKERS_AI_BASE` (a Whisper stand-in).
  `staging:check` fails if staging is bound to `crmpro-video` or `crmpro-media`.
- **The engine** (`media/engine/server.mjs`, Dockerfile, `media/worker.ts` with
  `@cloudflare/containers`, one instance per job, `onActivityExpired` asks `/busy`
  before stopping) is stateless and keyless: signed input URLs in, signed upload
  URLs out (≤16 MB single PUT, else R2 multipart through the Worker), ops `prepare`
  (probe + refusal by codec/duration/size, 8 kHz waveform and measured silences,
  ~3-minute MP3 pieces cut in pauses, 540p proxy, poster), `render`, `thumbnail`.
  FFmpeg runs with a protocol and **demuxer whitelist** (no HLS/concat). Cuts are
  rendered by `select`/`aselect` on a **1/30 s grid with sound regrouped into
  1/30 s frames**, so hundreds of cuts never drift lips; captions are ASS through
  libass with the Noto fonts — **Urdu in Noto Naskh Arabic** (Nastaliq rendered as
  boxes in libass). Thumbnails: layouts are named in the engine (never filter text
  from a request), headline text exact via ASS.
- **Jobs are rows** (`crm_video_jobs`, migration 0069): idempotency key (a render's
  includes the edit's hash), lease, attempts with back-off, `engine_ref` per attempt
  (`<job>-a<n>`), refusals (`refused:`) terminal. Advanced by the open editor's poll
  (`status` → `waitUntil(advanceProject)`), the engine's poke (no authority — the
  state is read back from the engine) and the cron (`runVideoJobs`, after the
  agents). Stages and percentages come from job rows only: pieces transcribed, or
  FFmpeg's own clock; otherwise none (`stagesOf`).
- **One canonical edit** (`lib/video/edit.ts`, pure, shared with the browser via
  `services/videoStudio.ts`): cuts with reason/confidence/state, protects,
  `captionEdits` (caption text only — never the picture), clips, styles. Every change
  is an `Op` through `applyOps`, saved as a version against the version it was made
  on (`saveEdit`, conflict → current doc); undo/redo walk `crm_video_versions`, an
  edit after an undo drops the redo branch. The preview plays the proxy through
  `keepRanges`/`retimeWords`/`cuesOf` — the same functions the render reads.
  `renderSpec` hashes what a file depends on; a different hash is "Edited — render
  again" (changed outputs wait for a press; new clips render at once).
- **Judgement, pure and tested** (`npm run test:video`): `cleanup.ts` (fillers as
  whole tokens; pauses shortened only where the *sound* is quiet; repeats and false
  starts proposed, never applied; numbers, prices, dates, negation never cut; ids
  stable across levels), `shorts.ts` (AI picks checked on whole sentences, trimmed so
  two Shorts never share footage, one per topic, rule fallback labelled and
  unscored; metadata cleaned, distinct per video, chapters to YouTube's rule),
  `captions.ts` (SRT/VTT/ASS re-timed through cuts), `commands.ts` (sentences → the
  same Ops, or an honest "can't"), `png.ts` (signature, IHDR CRC, size, IEND — a
  thumbnail is called PNG only after this).
- **AI**: Whisper large-v3-turbo on Workers AI (`lib/video/transcribe.ts`, adapter);
  Gemini pool for Shorts/chapters/metadata (`aiBudget` first, transcript fenced as
  content-not-instructions, everything validated). No AI → rules, and the stage note
  says so. Scores are editorial; nothing claims reach or virality.
- **Money**: `crm_video_usage` keyed `(job_id, kind)` — a retry cannot charge twice;
  monthly allowances by standing (`lib/video/usage.ts`), an ended trial processes
  nothing new. Only the latest render of an output is kept.
- **Autopilot**: catalogue `video-content` → **Recordings I upload** builds a workflow
  (trigger `video_uploaded`, `ai` node `source: 'video'`, `produces: 'video_package'`,
  string config: shorts/long/captions/thumbnails/cleanup) that `create` reads when a
  video is uploaded into that project; "Run now" on it is `skipped` with a sentence.
  When the package is done `refreshProject` writes `crm_agent_runs` once
  (`reported_at` claimed by CAS): "✨ 4 Shorts created" → `/video-studio/<id>?tab=shorts`.
  The project's Assets tab has `ProjectVideos` (Upload a video →
  `/video-studio?new=1&project=`); the Content Library shows `ContentShelf`.
- **The editor** follows the owner's concept: Media / Transcript / Cleanup / Shorts
  left, the player centre, the inspector (Video · Audio · Music · Captions · Export ·
  Reuse) and the assistant right, a timeline of tracks underneath (filmstrip from
  `prepare`, sentences, Shorts, waveform, music; drag to mark → cut/restore/protect/
  make a Short). It opens on a **welcome wizard** (`WelcomeWizard.tsx`: eight goals,
  each asking only its own choices, `want` sent to `create`).
- **Sound and music.** `doc.audio.denoise` (off/light/medium/strong), `voice`,
  `volume` — heard live in the player since 2026-11 (see **Sound steps**). `doc.music` is set
  **only by the server** (`music.set` filtered from browser edits): an **Openverse**
  track (`lib/video/music.ts` — CC0, PDM and CC BY only, re-read by id, stored in
  R2 with its licence, previews proxied by the Worker) or the customer's upload with
  rights confirmed; CC BY credit goes into every affected description
  (`withMusicCredit`, `recreditOutputs`). `OPENVERSE_BASE` overrides the library.
  Commands split compound sentences ("remove the noise and also add music to all
  the videos").
- **Reuse**: `repurpose` (the Autopilot writers on the transcript → draft posts,
  blog, email sequence) and `quiz` (`cleanQuiz` drops a question tied to no
  sentence) jobs; results in `crm_video_projects.extras` (migration 0070).
- **Faces and the speaker** (`media/engine/track.py`, engine op/job `track` after
  `prepare`, result `source.track` → `prep/faces.json`): OpenCV YuNet (pinned in
  the image; Haar without it), the speaker = the face whose mouth moves during
  speech, held two seconds before a cut. `doc.tracking` (per long / Shorts, crop
  framing only) → `cameraPath` → a crop moved by `sendcmd` (never resized
  mid-stream: that hangs FFmpeg). Reads lips, not voices — said on screen.
- **Look, motion, words on screen** (`doc.look`, `doc.motion`, `doc.overlays`,
  pure helpers in `lib/video/motion.ts`): ten filters + sliders (engine
  `lookFilters`, `lutrgb` for warmth/tint — `colorbalance` is too slow), punch-in /
  slow zoom (`zoompan`), flash/dip at cuts, fades, 0.5–2× speed (captions, SRT/VTT,
  overlays, chapters re-timed), progress bar, animated overlays placed on the
  recording (ASS). The preview shows them (`cssLook`, speed, zoom, tracked
  object-position, overlays) and says it is close.
- **Thumbnails** follow the trending advice (§13–14 of the doc): one plan,
  `media/engine/thumbLayout.mjs` (`thumbPlan`, plain JS, types in `.d.mts`),
  nine layouts — modern, bold, glow, headline, short (9:16 cover), callout,
  split ("A vs B"), number, cinematic — painted by the engine (numbers-only FFmpeg
  graph + escaped ASS) and drawn by `ThumbnailDesigner.tsx` as its preview;
  options (picked word coloured or boxed, gradient, word place/size, face
  side, sticker, arrow/ring, strip) clamped by `normaliseSpec`. A ring or
  arrow only round a found face, never through the words. Each PNG keeps its
  `spec`; `thumb_custom` makes a designed one. **Edit in Graphics Designer &
  Editor** (the post designer's name everywhere a customer reads it) opens a
  thumbnail as a design (`designerHandoff.ts`); **Use as this video's
  thumbnail** comes back through `thumb_upload_url` + `thumb_attach`
  (`checkPng` at the exact size before it is chosen).
  **Since 2026-11 thumbnails are made only on the customer's press**
  (never after a render; the wizard/Autopilot `thumbnails` option is gone
  and `doc.thumbnails.on` is not read; `stagesOf` shows the stage
  "skipped — made when you ask" so a project still becomes ready).
  "Create a thumbnail" (`ThumbShowcase.tsx` → `ThumbStart`) asks first for
  an EXAMPLE thumbnail: shrunk to a JPEG in the browser, PUT through
  `thumb_example_url`, then `thumbnails` with `exampleKey` sniffs the bytes,
  has the AI pool read it (`thumbStyle.ts` `readExample`: `aiBudget` →
  `askGeminiParts`, so OpenRouter's free vision models count; metered
  `ai-thumb-example` on the job) and **deletes it**. `styleFromReading`
  keeps only names from the engine's lists and #rrggbb colours — never the
  model's words — and the note to the customer is built from those names;
  unreadable (no key, budget, no key that reads pictures) → the modern
  look, said so. Without an example: `modernStyles` (layout **`modern`**:
  the blurred frame under a saturated gradient, the frame as a bordered
  screenshot card, the found face cropped round with an accent glow and
  outline — no card for a talking head, no bubble without a face — huge
  2–4 words, one boxed). Words: the title cut by `punchyWords` (its own
  words only). The first new one is chosen. The board and Publishing show
  the chosen thumbnail big (16:9, or 9:16 for a Short) with Download PNG /
  Edit / Edit in Graphics Designer & Editor and the others as a strip with
  "Use this one". A failed render on the board says why (`plainError`
  strips `refused:`) with **Try again**.
- **From a YouTube link** (`lib/video/youtube.ts`, shared): the wizard's
  "Your video" step takes the customer's own video's link plus a rights
  box; engine job `fetch_url` runs pinned yt-dlp on the id only, refuses
  from the details what the plan's minutes cannot take, uploads like a
  render; the Worker checks the bytes before it is the source, then it is an
  upload. `youtubeRefusal` reads yt-dlp's words — "not a bot", private,
  age, members are terminal, each ending "Download it from YouTube Studio
  … and upload the file instead", offered in the same project.
  `npm run test:videoyoutube` (engine :8883 with `test/ytdlpStub.mjs`,
  Whisper :8884, oEmbed :8885, wrangler :8963, `.wrangler-ytvideo`).
- **The board** (`OutputsBoard.tsx`, under the editor): per video an editorial
  score (`editorialScore` — never a forecast), preview, thumbnails, words,
  chapters, downloads at the size made, Export XML (`toXmeml`, Premiere/Resolve),
  duplicate. The inspector is an icon rail; the playhead moves per frame from
  the player's loop (`vs-frame` event), not React state.
- **The editor's preview copy** is 720p at CRF 23 (`buildPrepare`
  `proxyHeight`/`proxyCrf`; the engine never makes it taller than the
  source) — at 540p/28 a screen recording's text was a blur. Existing
  projects keep their 540p copy. **The preview stuttered** because the
  transcript redrew whole ten times a second while playing (`thumbAt` made a
  new style object per paragraph, so `Para`'s memo never held); the tiles'
  styles are now cached, and the player tells the editor the time four
  times a second while playing (captions keep their own ten).
- **The player is a deck** (`deck.ts`): two `<video>` elements on the proxy; the
  standby is seeked (paused) to the next kept stretch and swapped in on the
  playing one's last kept frame (`requestVideoFrameCallback`, rAF fallback). Never
  set `currentTime` on the playing element at a cut — that seek is what stalled
  the old player at every cut (e2e: 10 `waiting` in 11 cuts → 0). A stretch too
  short to prepare holds its last frame, never shows the cut. `data-swaps` /
  `data-waits` on `[data-testid=vs-video]` (the deck wrapper).
- **Text-based editing** (`TranscriptEditor.tsx`, `data-keys="own"` — the player
  and timeline ignore keys inside it): Delete/Backspace cut the selection
  (`cut.add`), R restores (`cut.restoreRange`), arrows/Shift move and select,
  Space plays (`vs-toggle`), Ctrl/⌘+Z/Y walk versions; cleanup suggestions are
  inline chips (`cut.set`). No second edit model. Timeline: cuts shaded pink on
  the filmstrip, waveform faded under them.
- **Cleanup v2** (`cleanup.ts`): filler *kinds* (`FILLER_KINDS`, context rules;
  only `um` auto-applies), `doc.cleanup.fillers` / `maxPause` ("shorten word
  gaps", applied where quiet), retakes grouped by sentence similarity with the
  kept take chosen by measured signals (complete, false start, loudness and
  liveliness from the waveform, fillers, pace) and named in the reason. Server
  reads `wave.json` (`readWave`). Proposed only; numbers/negation never cut.
- **Studio Sound** (`doc.audio.studio`, `strength`): engine `voiceChain` —
  high-pass, `arnndn` (pinned RNNoise model, `RNNOISE_MODEL`; FFT fallback, said
  in `/health` `rnnoise`), de-esser, EQ, compressor; loudness −16 LUFS in **two
  passes** (`measureLoudness`). "Lower audio of other layers" = `music.duck`.
- **Visual effects** (`doc.effects.{long,short}`, op `effects.set`, Effects tab,
  `EffectRow.tsx`): color (kelvin via `lutrgb`, curves, eq), shadow (framed /
  PiP only), green screen (`chromakey` + `despill`, colour behind), Improve
  appearance (hqdn3d, normalize, unsharp, bilateral skin smoothing inside the
  tracked face box only — `skinBox`, sendcmd). Only effects switched on are
  hashed. Preview: `cssEffects`, shadow div; key and skin say "in the render".
- **Framing a Short round what matters (2026-11, `reframe.ts`, `visual.ts`)** —
  "New short composition" used to be a centre crop (`clip.add` → `reframe
  x 0.5`, tracking off). Now `track.py` also runs an **`Analyser`** on the
  same frames (nothing per frame is kept): the mouse **pointer** (the one small
  blob that changes on a still picture, with an arrow's contrast, followed
  frame to frame; a caret never moves so it is never one), a 12×7 **motion
  grid** per second → `activity` (centre + spread), **scene cuts**, the
  **content box** (where edges or movement ever are), `flat`/`still`, and a
  **`kind`** with `why`: screen / screencam / slides / talking / two / camera.
  All in `faces.json` under `analysis` (v2); the headline (kind, why,
  cursorSeen, people) travels in `Source.track.summary.analysis` so a plan can
  be made before the file is opened. **Older `faces.json` have no analysis**:
  the Video panel says so and offers "Analyse again" (`track_now`); the
  editor re-fetches the file when `track.at` changes.
  `clip.framing` (`Framing` in edit.ts, `cleanFraming`) holds only the
  customer's choices — strategy (`auto`/cursor/speaker/screencam/content/
  still/whole), zoom (window size, 0.35–1), focus, band share, camAt, ≤12
  pins — never a path. `resolveFraming` settles `auto` from `knownOf()`
  (screen → cursor, else content; screencam → screencam; slides → whole, or
  screencam with `fitScreen` when there is a bubble; talking → speaker; two
  → the classic `two` layout; camera → content at the full height; not
  analysed → speaker if faces else an honest still crop that `framingMatters`
  says changes nothing, so **old projects keep their hash**). `framePlan`
  turns it into the one thing the engine and the preview already draw: a
  `ScreenPlan` (region = content box, a window of the output's shape ×
  zoom, a camera band for screencam) plus a `glidePath` (0.1 s rows,
  dead zone, glide, hard cuts at scene cuts / speaker switches / pins /
  edit cuts) and `wide` spans (reusing `wideSpans` on a meta built from the
  cursor). The render sends it as the engine's screen layout (`screenFrame`,
  `crop@ptr` by sendcmd; new `fitScreen` for slides under a camera); the
  preview draws it with `drawScreenLayout` from the same plan. **`visualSpec`
  (`visual.ts`) is the single source of every visual decision** — mode,
  tracking, layout, screenLayout, framing, look, motion, effects, overlays,
  logo — read by `renderSpec` (hash includes `fr` + the track key) and by
  the Player; `test:video` asserts they agree. Video panel → **Framing**:
  strategy tiles with why-not, Window size, Camera band / above / below,
  "Point the window" (the preview shows the whole recording with the window
  drawn — `vs-aim`/`vs-aimed` — a click sets `focus` for a still window or
  adds a pin), pins as chips; the Layout list no longer lists speaker/screen
  (they are framings). Tests: `test:video` (planner, cleaner, visualSpec ≡
  renderSpec), `npm run test:videoanalysis` (synthetic clips through
  track.py: kinds, pointer within 12 px median, a 9:16 Short keeping the
  pointer in frame >90% where a centre crop had it <60%).
- **The Shorts wizard (2026-11, `ShortsWizard.tsx`, `shortsWizard.ts`)** —
  "New short composition" (composition menu) opens it (`vs-shorts-wizard`);
  the old one-press Short is **Quick Short** (`data-act="quick-short"`).
  Steps: 1 what the recording holds (length, shape, speech, kind, people,
  scene changes; "Analyse now" when the picture was not analysed); 2 how —
  **Let AI decide** (default; no target number, none is an answer with the
  reason), a topic or moment, or a time range; 3 only what changes the
  result — platform (`PLATFORMS`: limits and hashtag counts), shape, framing
  (the reframe strategies with why-not), captions look, language of the
  words, logo (one setting for every Short — said so), thumbnail (made with
  each Short / not now), call to action, own length (prefs kept in
  `crm_vs_wizard_prefs`); 4 proposal cards — title (editable), topic,
  times, why, **checks** (`checksFor`: clean opening, finished ending,
  stands alone, length, share of speech), what is said, framing note,
  thumbnail words + concept, editorial scores, and every word to publish
  (description, hashtags, tags, CTA, pinned comment, category, thumbnail
  words); approve / reject; ends moved snap to whole sentences and are
  re-checked in the browser with the same functions; Find another (auto,
  excluding the cards) / Ask again; the turned-down passages with why;
  5 the made Shorts followed (render, thumbnail) with Open.
  Server: `shorts_propose` (rate-limited 60/h, `aiBudget` → one
  `askGeminiParts` call metered `ai-shorts-wizard`, nothing saved) →
  `fromAi` / `fromAiRange` / `byRule` / `fromRange` (`findSection` for a
  topic the AI missed); auto excludes footage already a Short.
  `shorts_create` re-snaps every item on the server's own transcript,
  re-checks its words (`honestTitles`: no number the passage never says, no
  stock bait; `thumbTextFor`: only the title's or passage's words;
  `withoutStrangeLinks`; categories only from YouTube's list `CATEGORIES`),
  adds the Shorts (`clip.add` now takes `aspect`, `framing`, `scores`; every
  new Short is `framing: auto`), long pauses taken out of **the Short only**
  (`partsWithout` → `clip.parts`; a cut would take them out of the long video
  too), caption look and logo set, writes each output's `meta` **before**
  `afterEdit` (the metadata job writes only empty ones) and
  `thumbnail.headline`, then queues renders (AI Shorts allowance as ever) and
  `thumbnails` set 1. `VideoMeta` gained `category?`, `thumbText?`, `by:
  'you'`. Tests: `test:video` (+16: prefs, checks, tidy, snap, pauses→parts,
  honest titles, thumbnail words, AI answer → 3 kept / 3 turned down, none
  with the reason, rules labelled, range, prompt fencing, clip.add extras),
  `test:videoe2e` (wizard section through the screens, a topic, a range, an
  empty topic refused by field, nothing proposed twice, made Short's words
  and queued jobs, 390 wide), `test:security` (video actions by id from
  another workspace → 404). **Not changed**: the welcome wizard's "make N
  Shorts" still asks for the number the customer typed (their choice).
- **The preview shows every effect (2026-11)**: the look/colour filter sits
  on `.vse-picture` (deck + keyed canvas + layout canvas) — it was on the deck
  only, so a laid-out Short lost its look; **sharpness** is an SVG
  `feConvolveMatrix` (`sharpenKernel`) in the chain where the engine's
  unsharp runs; **vignette** a radial gradient from the engine's own
  `cos(a·r)^4` (`vignetteStops`); **grain** a feTurbulence texture at
  `grainOpacity` (presets' own grain included); the **green screen** is keyed
  in WebGL (`greenKey.ts`: the same UV distance / similarity / blend as
  FFmpeg's chromakey, despill mix 0.6) and every painter draws the keyed
  picture (`picOf`); **skin smoothing** softens the tracked face box under an
  oval where the frame maps straight onto the recording (badge "≈"). Sliders
  send `vs-tweak` while dragged (`onLive` on `Slider`/`FxSlider`) so the
  preview shows the value before it is saved on release. Badges say "keyed"
  or "in the render" truthfully (no WebGL → in the render).
- **Shorts layouts** (`clip.layout`, `layouts.ts`): speaker/screen/split/two/pip
  offered from `faces.json` `people` (track.py) — `layoutOptions` says why not;
  `layoutPlan` boxes (numbers only) → engine `layoutFrame`; preview drawn on a
  canvas with the same boxes.
- **Screen Recorder** (`ScreenRecorder.tsx` + `recorder.ts`, lazy, in the
  **Media Library** tab; `?tab=media&record=1` opens it): screen, screen +
  camera bubble, or camera only, browser-only (getDisplayMedia /
  getUserMedia / MediaRecorder, no service). The bubble is **composited** —
  screen and camera drawn onto one canvas, `captureStream(30)` recorded — so
  it is in the file; corner/size/shape/drag apply live. Frames are drawn on a
  **worker's clock** (`recorderClock.worker.ts`, its own file: `script-src
  'self'` refuses blob: workers) because rAF stops in a background tab. Mic +
  tab/system sound mixed by WebAudio. WebM's missing duration is written
  from the first MB only (`finishFile` → `lib/webmDuration.ts`). **Save** is
  the upload path: `create` with `long: false, shorts: 0` (no AI analysis, no
  render; still prepared and transcribed like any upload) + `uploadVideo`;
  "Saved" only after `upload_complete`; a refusal before any byte (code set —
  no storage, allowance) deletes the empty draft; the recording stays to
  retry/download. `library` sources now carry `playUrl` (proxy, else the
  original — no engine means no proxy) and `downloadUrl`. Needs
  `camera=(self)` in `public/_headers`. Limits: no screen sharing on phones
  (camera-only offered), system sound only Chrome/Edge (tabs; whole screen on
  Windows/ChromeOS), Safari records MP4, held in memory (stops at 2 h).
  **Every screen mode goes through the canvas** (`Compositor`), so the frame
  — background colour / gradient / the person's own picture (read locally,
  never uploaded), padding, roundness, shadow — and the bubble change live
  while recording, and **Share a different screen** swaps the source without
  stopping (sound is always mixed through WebAudio in screen modes so the new
  screen's sound joins). Frame rate 15/20/24/25/30/50/60, resolution
  360p–4K, quality Data saver/Light/Standard/High/Best (`bitrateFor`, each
  with its own floor), camera 240/360/480/540/720/1080p; remembered in
  `crm_rec_prefs` (never the person's own picture); a 4-core / 4 GB
  computer starts at 720p/30/Light. **The camera and microphone come on by
  themselves** when the recorder opens (or the mode changes) — the owner's
  call, so the preview shows the person at once; asked once per mode, the
  button asks again after a refusal. **Frames are read from the tracks**
  (`trackFeed.ts`, `MediaStreamTrackProcessor`, newest frame kept, the one
  before closed at once) — drawn from a `<video>`, Chrome stopped painting
  it while the recorder's tab was behind the window being recorded, and
  the screen and camera froze and jumped ("stuck frames"); Firefox/Safari
  still draw the element. **Lightweight on purpose**: the background is painted onto
  the canvas only when it changes (a canvas keeps its pixels) — per frame only
  the screen, four corner patches and the bubble's box are redrawn; the
  capture is asked (`applyConstraints`) for the screen at its box's size so
  the copy is 1:1 (a resample cost ~8× in software);
  `captureStream(0)` + `requestFrame` records each drawn frame once; the
  worker clock aims at a fixed grid; H.264 (hardware) then VP8 before VP9; a
  computer falling behind (>1 in 7 frames late) is told so. **Background is a
  switch** (`rec-bg-toggle`: Off = the screen fills the video; On restores
  `lastBg`, default the sequoia gradient). **Layouts** (`layoutRects`, live,
  changeable while recording): bubble (draggable), speaker-left (the owner's
  example: camera panel a third wide, screen right), speaker-right,
  presenter (camera fills, screen inset top-right), split 50/50 — the layer
  key includes the layout. **Camera frame**: circle / square / rounded
  square; rings still (none, white, solid, double, dashed, neon — glow
  cached in a sprite) and moving (turning gradient, pulse, rainbow, comet,
  orbiting dots, marching dashes — a dash pattern whose offset moves round
  any shape — and "moves with your voice" from the mic meter,
  `Scene.level`); 16 colours, any colour from a picker, 12 gradients
  (`ringColor` `g:<id>`, `RING_GRADIENTS`); a tall panel cannot be round
  (said). **Ready-made background pictures** (`scenes.ts`, 12 scenes painted
  in the browser at a third of their size and stretched — a real room's
  soft focus; seeded, so the swatch is what is recorded) behind the screen
  (`Backdrop` `scene`) and behind the person (`fx.bg` `scene`). **No live zoom** (removed on the owner's word —
  the pointer is followed after processing): `PointerLog` reads a 320-px
  grey copy 8×/s while recording (three looks, reused buffers, ~0.4 ms) and
  notes the pointer and likely clicks; `LayoutLog` notes where screen and
  camera were drawn; Save sends both (`screenMeta` → `saveScreenMeta`).
  "Hidden" pointer (Safari/Firefox) means nothing to note — said in the UI.
  **Floating controls** are a
  Document Picture-in-Picture window (Chrome/Edge), opened by the Start press
  (a click is needed; the share picker uses it up after), inline styles only.
  **Camera look** (`cameraFx.ts`, live, all modes — camera-only now goes
  through the canvas too): brightness/contrast/colour/hue (canvas
  `filter`, offered only where it exists), warmth (a `multiply` colour, no
  longer sepia), night view, "smooth skin" (a shrunk-and-stretched
  soft-focus copy — never a filter blur), **Auto look** (a 48-px copy
  measured twice a second, the middle weighted: exposure, grey-world white
  balance two thirds of the way, contrast and colour where flat — eased,
  the sliders on top, said in words), and **behind you**: blur %, remove
  (a see-through cut-out over the screen in a bubble, a colour in
  camera-only), a ready-made scene or the person's picture. **The outline**
  (blur used to eat into the face): each look blended with the last (up at
  once, down over two looks), cut at 0.25–0.6, holes not reachable from the
  edge and under 1/40 of the picture filled, grown a pixel, up to 30 looks
  a second where cheap. The person-finder is
  MediaPipe's selfie segmenter (`segmenter.ts`, `@mediapipe/tasks-vision`
  pinned, model in `src/assets/models`, Apache-2.0), its own lazy chunk (11 MB
  wasm, fetched only when a background is picked; CSP has
  `'wasm-unsafe-eval'` for it). It looks at ≤256 px, never more than a quarter
  of the time (interval ≥ 4× a look's cost), and moves from GPU to CPU when GPU
  looks are slow (emulated graphics: 267 ms vs 17 ms). **Title card and
  logo** (`Brand`, sprites drawn once, restored like the bubble): both
  anywhere (`x/y` 0–1 of the room inside the margin, `placeBox`/`placeAt`),
  dragged on the preview (`Compositor.logoBox`/`cardBox` are what a press
  grabs) or nudged; card 50–200 %; logo 3–40 % of the short side, round
  corners 0–50, see-through, background removed in the browser
  (`pictureCut.ts`, the editor Logo panel's own cut). Old prefs' corner and
  S/M/L are read as the same place and size. **Studio
  Sound** is not done live: Save sets `audio.studio` on the new project's
  version 1 (`editVideo`), so every export has the engine's chain; the browser
  keeps echo/noise suppression and `voiceIsolation` where offered. After Save
  the recorder shows the processing bar (`ProcessingProgress.tsx`, two
  decimals, the upload screen's creep), as does the editor's "Working on it".
  Not built: zoom/speed pills on the editor's timeline, re-styling a
  recording after it is made (the pointer is the exception — see below).
- **Recording engine, 2026-11 (the owner compared it with Zoom: a delayed,
  glitchy camera, "scenes stacking up", blur eating the face).** Root causes
  found and fixed: (1) the worker clock posts a tick every frame whether or
  not the page handled the last one, so any stall queued ticks that then ran
  back to back — several identical frames drawn and *recorded* within a
  millisecond after a freeze; a tick that waited longer than a frame is now
  skipped (`frameClock.ts keepTick`, never more than three in a row). (2) The
  person-finder ran on the page's thread (model + a blocking read-back from the
  graphics chip, 15–30 ms a look) — the stall that fed (1); it now runs in a
  **classic worker** (`segmenter.worker.ts`, MediaPipe's loader needs
  `importScripts`; a page fallback when the worker cannot start, e.g. `vite
  dev`), one look in flight, sent the moment a camera frame arrives
  (`TrackFeed.onFrame`), ImageBitmaps transferred both ways. (3) The outline
  was drawn over a newer frame than it was found on, so a moving head stuck
  out of it and that strip was blurred: the frame sent is copied and drawn
  *with* its outline (`pending`/`pair` in `cameraFx.ts`) while answers come
  back within ~1.25 frames (else the newest frame and last outline, so the
  camera never waits; Performance profile never pairs). (4) The blur was the
  whole picture blurred, the person too — a halo: `bgBlur` takes the person
  out, fills the hole from the room round it, then blurs. (5) The square
  model was fed a squashed 16:9 frame: `selfie_segmenter_landscape.tflite`
  (Apache-2.0, 144×256) for wide cameras (`maskOutline.ts modelFor`). (6) The
  recording timer was the recorder's state — the whole settings column
  re-rendered twice a second; it is its own `Elapsed`. (7) Lip sync: the
  canvas stamps a frame when it is drawn, after the camera's own delay and the
  wait for the clock, while the microphone is stamped as it hears — the voice
  led the lips; sound now always goes through the mix (camera-only too) and the
  voice is delayed by the measured camera latency (rVFC `captureTime`, where
  reported) plus picture age, less the mix's latency, ≤ 200 ms, set at Start.
  Also: **profiles** Performance / Balanced / Quality (`PROFILES`, plain sets
  of fps/res/quality/camRes, `FX_TUNING` follows); a preview that cannot keep
  up is told so once, from measurements; a camera or microphone lost
  mid-recording gets one try to come back before the old behaviour. **The
  diagnostics panel** (`recDiag.ts`, `RecDiagPanel.tsx`; Ctrl+Shift+D or
  `?recdiag=1`, never shown to customers otherwise, no device names): frames
  drawn, draw cost, skipped ticks, long tasks, camera/screen fps and picture
  age, finder (worker/page, GPU/CPU, model, look and answer ms, paired),
  recorder chunks, sound latencies and the applied delay, heap, and a verdict
  (`judge`: capture / main-thread / rendering / segmentation / encoding).
  `npm run test:recorder` holds the pure parts. **Benchmark**
  (`test/recorderBench.e2e.mjs`, see its header): MediaPipe's own portrait and
  ground-truth mask, panned as a moving head, scored for "person treated as
  background" (the blurred face) and bleed; and the real app recording with a
  fake camera + a shared tab, its WebM's frame intervals read by ffprobe. This
  container has no GPU, so its absolute times are software-rendering numbers;
  compare before/after on the same machine, never against Zoom from here.
  Measured there (2026-11, before → after): a moving person drawn as
  background 12 % → 0.04 % (p95 46 % → 0.3 %; Performance, unpaired, 0.2 %),
  bleed 7.6 % → 1.3 %; app, camera + screen + blur: longest page freeze
  654 → 75 ms, camera picture age p95 3.1 s → 115 ms, back-to-back
  duplicate frames 7 → 0 (0 in every scenario), script heap flat over 120 s.
  Recorded frame rate unchanged (~11–18 fps there — software VP8 and a
  software canvas are the limit in that container, not the pipeline).
- **Recording engine, second pass (2026-11, "my hand moves before the
  picture does").** The first pass's fixes stay. What was left, measured: the
  preview *is* the composite canvas, and it was drawn only on the frame
  clock, so (1) every camera frame waited for the next tick — 13 ms on
  average for the camera alone, 20 ms with a screen — and the camera's 30 a
  second beating against the clock's 30 showed as a frame shown twice and
  the next never, every few seconds (8–30 % of camera frames with a screen
  shared); (2) with a background effect, Balanced paired each frame with its
  outline whenever the finder answered within ~41 ms, so on a computer
  without a fast graphics chip the camera ran 40–55 ms behind on that alone
  (picture 63–90 ms old when drawn); (3) a computer that needed more than a
  frame to draw (layout changes, a big camera box with blur) drew back to
  back and starved the page, so the camera's own frames sat unread — up to
  1.6 s old. Now: **frames are drawn as they arrive** (`frameClock.ts`
  `leadOf`/`drawNow`): the camera (or, while paired, the outline's answer,
  `CameraFx.onPair`; or the screen when there is no camera) draws the
  moment its frame is in; the worker clock is the heartbeat (draws only after
  1.25 frames without one) and still leads where the camera cannot pace the
  rate (a 30 fps camera in a 50/60 fps recording) and where frames come
  from an element (Firefox, Safari — unchanged there); never more than four
  fifths of the page on drawing (`COST_SHARE`, from the measured cost).
  **Balanced pairs only while the answer is quick** (`FX_TUNING.pairWithin`
  0.6 of a frame / `pairFloor` 18 ms, 15 % hysteresis; Quality keeps 1.25 /
  40 ms; Performance never). Unpaired, the camera frame is **copied once**
  at its box's size and every pass of the look/background reads the copy
  (each pass read the frame itself — a colour conversion of the whole
  picture three or four times a frame). **Easing** (`EASE_RATE`): six
  seconds of the diagnostics finding the page/drawing/finder behind → the
  finder looks ≤ 15 (then ≤ 8) a second and stops pairing; thirty seconds
  of keeping up → back a step; said in a note each time; nothing the
  person chose changes. The screen's hidden `<video>` is let go once its
  frames are read from the track (it was a second consumer of every screen
  frame). Diagnostics add what paced the drawing, camera frames shown /
  shown twice / never shown, drawn→painted (rAF, only while the panel is
  open), a camera→preview estimate from those parts (labelled: the camera's
  exposure and the display are not reported by any browser), the finder's
  easing, and whether the browser calls the encoder power-efficient
  (`mediaCapabilities.encodingInfo`, `type: 'record'`). **Not adopted, on
  purpose:** WebCodecs (the preview never waits for the encoder —
  MediaRecorder encodes off the page and already picks hardware H.264 first;
  WebCodecs would add a muxer dependency and its own queue for no preview
  gain; the measured stalls were drawing, not encoding); compositing in a
  worker / OffscreenCanvas (long tasks while recording fell to ~0–1 once
  drawing stopped saturating the page, and the compositor's sprites,
  pointer log and drag boxes all live here — a large move for what is now
  left); WebGL/WebGPU (the 2D canvas is already on the graphics chip where
  there is one; the cost that mattered was repeat conversions, removed);
  `desynchronized` canvases (can tear; not testable without real displays).
  Measured in this container (4 cores, no GPU; `node
  test/recorderBench.e2e.mjs app`, same script, old and new builds back to
  back), camera picture age when drawn, average (p95): camera only 13 → 0.1
  ms; + blur 46 (77) → 2 (5); + screen 20 (51) → 1.6 (3), camera frames
  repeated/skipped 8/17 % → 3.5/6 %; + screen + blur 63 (108) → 11 (57); +
  screen + own picture 60 (125) → 7 (49); 60 s long 70 (136) → 11 (57);
  layout every 2 s 82 (147) → 21 (86), long tasks 76 → 28. At 2× CPU
  throttle: camera only 19–22 → 0.6–2 ms; screen + blur 88–90 → 43 ms, long
  tasks 61–75 → 40–42. Recorded frame rate unchanged (software VP8 is the
  ceiling here); outline accuracy unchanged (`fx` mode: moving person drawn
  as background 0.04 % both; Performance 0.32 → 0.21 %). Lip sync follows by
  itself: the voice's delay is built from the measured picture age, now
  near zero. The benchmark takes `BENCH_EMAIL` (sign-up is rate-limited),
  sets the layout explicitly, adds a layout-transition scenario (8), and
  `DI=1` times every drawImage by source and destination.
- **Following the pointer** (`lib/video/pointer.ts`, pure, shared; Properties →
  **Pointer** tab `PointerPanel.tsx`; a **Pointer** lane on the timeline, F or
  "Follow the pointer" on a marked stretch). Nothing zooms while recording:
  the recorder's `PointerLog` reads the shared screen ~8×/s small and notes
  the pointer (the small thing that moves) and likely clicks (it rests, then
  the screen answers under it) plus the layout over time; Save sends it with
  `screen_save` → `prep/screen.json` (`cleanScreenMeta`, capped) and
  `extras.screen` (a `ScreenRef` — **extras, not `source`**: `onPrepared`
  rewrites `source` whole and would drop it). `analyzeStep` proposes the
  moments once (`autoFocus`: words about doing something on screen *and* the
  pointer acting, merged, ~1.5 a minute; clicks alone without a transcript,
  said so) into `doc.pointer.focus` (`ran` — never over the customer's own);
  `pointer.*` ops add/remove/resize/split as many stretches as wanted. Render
  (`pipeline.ts pointerParams`): the long video zooms in on the pointer
  inside each moment (`zoomPlan`/`zoomAt` ↔ the engine's `pointerZoomFilter`
  zoompan expression, same curve; only where the frame maps straight onto
  the recording — no face-tracked crop; it replaces the punch-in zoom); a
  tall Short of a recorder recording is laid out by itself (`screenLayoutFor`)
  as **screencam** (camera box whole in a third of the height — under the screen since 2026-11 — the screen in a
  fixed-size window moved along `followPath` by `sendcmd crop@ptr`) or
  **follow** (no camera: the whole height). The drawn pointer — ring,
  spotlight (a hole cut by winding), big arrow, pointing hand, dot, or
  chosen per moment from the words (`cursorFor`) — and click ripples are
  ASS from numbers only (`pointerAss` → engine `pointerAss`); click sounds
  (click/soft/pop) and celebration/error where the words say so
  (`momentFor`) are engine `SFX` aevalsrc formulas mixed before loudness —
  `sfxSample` is the same formulas for the browser's "hear it" button;
  **change both together**. The preview shows zoom, layout and pointer; the
  real pointer stays under the drawn one unless the browser hid it. A
  project without `extras.screen` renders and hashes exactly as before.
- **Change these words with AI** (top of Publishing, `PublishPanel.tsx` +
  pure `reshape.ts`): the customer's request ("add my affiliate link … to the
  description and bullet points") and the texts go to `/api/ai.php`
  (fenced: request vs content); the answer may change only texts it was
  sent, within their limits, and **a link the customer did not give or that
  was not already there refuses that text, named** (`checkReshape`). Saved
  to the publishing texts (`publish_save`) and the board's words
  (`meta_update`: title, description, hashtags, pinned comment, CTA, tags,
  keywords), this video or every video, with Undo.
- **The front page** (`StudioHome.tsx`, 2026-10, after Descript / Loom /
  Riverside / VEED): a hero with the ways to start — **Record your screen &
  camera** first and biggest (`vs-record-card` → `?tab=media&record=1`), then
  upload, Long → Shorts, YouTube link, Quick Shorts, Repurpose — real counts
  (projects, ready, working, the month's minutes from `usage`), the projects
  as searchable, filterable picture tiles, and the goals folded under "Start
  from a goal" (open when there are no projects).
- **Progress is on the right** (`ActivityPanel.tsx`, rail group **Progress**,
  opens by itself on wide screens when something starts moving — since 2026-11 only when no panel is open (a panel in use keeps its place and shows the `vs-now` strip); a pill under
  the player on phones/closed panel). Every stage counts in the overall
  number (weighted), and `stagesOf` now lists **`track`** (finding faces):
  it kept the project "processing" while the old four-band bar said "Ready
  100%", which is the "stuck at 100%" the owner saw. Each running stage opens
  into the engine's own steps (`job.stage`: download, probe, sound, audio,
  proxy, poster, filmstrip / loudness pass 1, render, check, upload /
  frame, thumbnail n of m); a step is done only because a later one started.
  The render's sound fixes, captions, text and logo are **one FFmpeg pass**,
  shown as "In this pass" chips with the pass's percentage — never as steps
  finishing separately. `OverallProgress` (recorder) no longer says Ready
  until the project is. **Your changes** lists each save and undo in order.
- **Undo is one version per press** (`step` in `VideoEditor.tsx`): saves,
  undos and version jumps share one promise chain (`chain`), so a Ctrl+Z
  pressed while a cut is still saving waits its turn instead of being thrown
  away (it was: five deletes and five Ctrl+Z brought back one or two).
  `maxRef` is the newest version (an edit after an undo is the new top).
- **Export is a dialog** (`ExportDialog.tsx`): every video, its state,
  Download MP4/SRT, Render / Render again, and **Make the video** when there
  is no long output — a Screen Recorder save has `long: false, shorts: 0`, so
  Export used to scroll to an empty board. Escape closes it; "Thumbnails,
  words and more" goes on to the board.
- **The guided path** (`GuidePath` in `VideoEditor.tsx`): Clean up → Sound →
  Look → Zoom (screen recordings) → Text → Logo → Captions → Export, a tick
  where something is set (read from the doc). Since 2026-11 the menu is
  **inside the panel's scroll** and the step's line + "Next" (`GuideNext`)
  are at the **end** of the settings: fixed above them, on a laptop the
  menu and the line left the Sound settings a sliver (the owner's screenshot).
- **Sound steps** (2026-11, `media/engine/soundPlan.mjs`, plain JS + `.d.mts`,
  re-exported by `services/videoStudio.ts`): the voice chain is a list of
  named steps (rumble, hum, declick, noise, deess, tone, gate, even / voice),
  read by three places — **change it there only**: the engine runs **one
  FFmpeg pass per step** on the edited sound (`soundPasses`: the first cuts on
  the 1/30 s grid, f32 WAV between passes so nothing clips) and reports
  `sound:<key>`; Progress lists them by label ("Removing background noise on
  a strong level", "Converting to Studio Sound … (strength 80%)") with each
  pass's percentage (`renderSteps` in `ActivityPanel.tsx`); the player plays
  them **live** (`liveSound.ts`: both deck elements through Web Audio —
  biquads, `DynamicsCompressor`, RNNoise via `@sapphi-red/web-noise-suppressor`
  (MIT, wasm + worklet as `?url` assets), the soft gate in
  `public/worklets/soft-gate.js` (CSP: no blob: worklets)). Click repair and
  the −16 LUFS loudness are render-only, said under `vs-live-sound`. A
  cross-origin preview is never routed (Web Audio would get silence). With no
  fixes the render keeps its single pass (`needsSoundPasses`). The joined
  steps are pinned to the old one-pass chain in `test:video`. Engine measured
  locally: eight passes, 26 s out, −16.0 LUFS.
- **Studio Sound's strengths are choices** (Gentle 30 / Balanced 60 / Strong
  80 / Maximum 100, `data-studio-level`) with a fine-tune slider — no longer
  behind an `EffectRow` settings icon. **"Apply to the video now"** replaces
  "Make the video with this sound": with no output it switches the long video
  on and renders it in place; the made file replaces the last one.
- **Player sizes**: normal, **big** (`.vse.big`, the script moves under the
  video, remembered in `crm_vs_big`, `vs-big` event) and **full screen** with
  the controls inside it (the HUD is portalled to the transport row, which
  full screen left behind). When a render finishes, `vse-done` says the
  changes are applied and offers **Play from the start**.
- **Smoothness (2026-11)**: the editor's `time` state changes only while the
  player is paused/seeked; while playing it lives in `timeRef` (`ctx.time` is
  a getter on it, so presses read the live playhead) and the script follows
  the `vs-frame` event, re-rendering only when the spoken word changes — four
  editor-wide re-renders a second (script, timeline, panels, the board's
  videos) were under the playing video. A poll identical to the last one is
  dropped before it reaches React (`sigRef`).
- **Text anywhere** (`Overlay.x/y/size/font/bold/italic/icon/speed`, clamped
  in `overlayExtras`; styles `subtitle` "Description", `ticker`, `camlabel`
  "Name under camera"): `overlayPlace` and `OVERLAY_SIZE` are shared by the
  ASS script and the preview. The ticker is a `\p1` band plus passes of
  `\move` (text width estimated, generously); fonts are Noto Sans / Serif /
  Display, "condensed" is ScaleX 82; icons only from `OVERLAY_ICONS`. The
  camera name tag is placed from the Screen Recorder's camera box.
- **The logo** (`doc.logo`, `LogoPanel.tsx`): the browser reads the picture,
  takes the background out when asked (flood fill from the edges in the edge
  colour, soft boundary, trimmed — a photo background is not removed, and
  the preview says so), uploads a PNG through `logo_upload_url`;
  `logo_attach` checks it (`checkPng`, ≤4096 px, ≤4 MB) and is the only way
  `logo.set` happens (filtered from browser edits like `music.set`). Corner +
  margin or anywhere (1 % nudges, Shift 5 %), size 3–40 % of the width,
  roundness 0–50 %, see-through, long/Shorts/all. `logoBox` (motion.ts) is
  the box for the engine (`logoFilter`: scale, `geq` alpha mask for the
  corners, `colorchannelmixer`, overlaid last) and the preview; in the hash.
- **Sound repairs** (`audio.hum` 50/60 Hz notches ×4 harmonics, `declick`
  adeclick, `gate` a soft agate) in both chains (`repairChain`), plus "Best
  voice in one click" and **Apply now** (renders the changed videos and opens
  Progress).
- **Zoom sensitivity** (`pointer.sensitivity`, default `high`; `autoFocus`
  `SENSE`): high takes any screen talk with pointer work, and clicks said
  nothing about, ~3 a minute; normal is the old rule; low the clearest. More
  action words (show, open, page, screen, enable, edit…). Choosing one in the
  Pointer panel picks again, keeping the customer's own.
- **2026-11 (the owner's list)** — what changed and why:
  - **Processing is in the cloud.** A second cron, `* * * * *` (`VIDEO_CRON`
    in `index.ts`), only runs `runVideoJobs(env, 52_000)`, which keeps passing
    over due jobs for its whole budget and waits (no CPU) for a job due within
    it. Before, with no editor open, a recording moved one step per five
    minutes — "it only processes while my PC is on". Transcription runs three
    pieces at a time (400 ms apart, in order — the e2e Whisper mock numbers
    pieces as they arrive). The engine is `standard-3` (2 vCPU; was half a
    vCPU).
  - **The Screen Recorder does not watch processing**: Save uploads, then
    goes to `/video-studio/<id>?tab=activity`. Its Studio Sound is strength 80
    with the gate.
  - **Noise** (measured on real speech under fan noise + hiss): RNNoise at
    full mix ≈36 dB speech-to-noise; mix 0.85 ≈18 dB; the old FFT "medium"
    ≈4 dB and smeared. So Studio Sound reaches mix 1 from strength 50, the
    plain levels are RNNoise (light 0.75, medium 1, strong 1 + gate) with the
    FFT only as the no-model fallback, nothing spectral after RNNoise (it cost
    the voice for 1 dB), `aresample=48000` before it, and the transcription
    pieces are denoised too. Whisper gets `vad_filter` and the business name
    as `initial_prompt`, asked again plainly if refused.
  - **AI voice isolation** (2026-11, the owner measured RNNoise leaving
    35–40 % of a loud room): `denoise: 'max'` ("Maximum (AI)") and Studio
    Sound at ≥ 90 % run step `isolate` (`soundPlan.mjs` `tool: 'dfn'`):
    DeepFilterNet 3 (pinned static binary in the image, `isolateVoice` in
    server.mjs — 48 kHz mono s16 in, `-D --pf -a 100`, bare flags on a
    refusal) and, when it is missing or fails, RNNoise twice (the general
    `cb` model, then `std`) plus a light `afftdn`. `/health` says
    `isolation` / `rnnoiseGeneral`. Then **keep only the talking**
    (`speechOnly`, always on with isolation): the render sends `speech`, the
    transcript's words on the edit's clock (pre-speed), and step `speech`
    turns the room to −26 dB outside them (`speechVolume`: padded 0.15 s
    before, 0.3 s after, gaps < 0.6 s joined, ≤ 1,500 stretches); no
    transcript → the gate. The player plays RNNoise twice and says isolation
    is heard in the render. "Remove the noise completely" asks for max.
  - **Thumbnails without a circle** (2026-11): the owner found a ring drawn
    round every speaker. `faceFrame` (`'none' | 'round'`, absent = round so
    older specs draw as before) — "modern" crops the face into a round
    bubble only when asked; `modernStyles` is now bold (person in the
    picture) / modern without the bubble / headline, all `pointer: 'none'`.
    The example reader **describes** (person size/side/frame, background,
    text area/box, annotation, panels, number, letterbox) and `layoutFor`
    decides by rule; colours snap to the example's own pixels
    (`paletteOf` in the browser → `examplePalette`, `snapColour`); a ring,
    arrow or round frame only when the example has one; three PNGs in the
    example's design. Read by the `thumbnails` module (vision: Pro first).
  - **Words for a video**: the prompt says the transcript can mishear and
    forbids links not said; `withoutStrangeLinks` drops any domain that is
    neither the business's site nor in the transcript ("www.fema.gov").
  - **Screen Shorts**: the camera band is **under** the screen (`camAt`
    'bottom'), and `wideSpans` picks whole-screen moments (pointer ranging
    wider than the window in 2 s, or resting ≥5 s; not the first second, ≤45 %
    of the Short) where the screen is fitted whole and the camera steps aside
    (engine overlay with `enable`). Follow re-aims at 20 % off centre, glide
    0.22 s. **No pointer is drawn by default** (`cursor: 'none'`; picked
    moments carry `'auto'`, older picked moments' own shapes are ignored); a
    click ripple is drawn only where a pointer is.
  - **Editor**: the rail is icon tiles (Progress apart, a suggestion count on
    AI Tools); the guide is a menu fixed above the panel (folds, remembered in
    `crm_vs_guide`); a press in AI Tools is an `OpItem` (`ctx.task`) shown
    under Progress — long ones (AI calls, cleanup) open Progress, which has
    "← AI Tools"; AI Tools stays mounted (hidden) so its results survive; a
    "working on" strip (`vs-now`) heads every other panel. Scenes and captions
    on the timeline select like phrases and scroll the script to their first
    word (`vs-reveal`).
- **Honest gaps**, shown on the **What works** panel: speaker labels, eye contact
  (researched 2026-10: NVIDIA Maxine is gRPC-only, Sieve's API no longer
  documented — no adapter), background removal from the video (no provider; a logo's plain background is removed in the browser), before/after audio
  preview (planned), publishing (none — "Ready to publish manually").
- **Don't edit `worker/` while `test:videoe2e` runs** — its wrangler rebuilds on
  change and the run dies. `STOP_AFTER=player` ends it after the player check.
- **The e2e's player check runs in a browser context of its own**: the
  editor already open had read the H.264 proxy from the same signed link,
  and Chromium's media player keeps those bytes in the page's memory (not
  the HTTP cache — clearing it and reloading did nothing), so after the
  test swapped in the VP9 copy it read an MP4 head followed by WebM ("no
  supported streams") and the preview never started; the suite stopped
  there. Production never changes a proxy under its link. **Don't rebuild
  `dist/` while it runs either** — wrangler reloads and the run dies.
- `npm run test:videoe2e` (self-contained: engine :8873, Whisper mock :8874, Gemini
  mock :8875, Openverse mock :8876, wrangler :8953, `.wrangler-video`, needs ffmpeg +
  a `VITE_BASE=/` build; recordings are generated and cached there) drives the
  owner's 20 steps on a 20-minute recording, the wizard, the player playing through
  the cuts across polls (as VP9 — this Chromium has no H.264), noise and music in one
  sentence, music really in the rendered sound, reuse and the quiz, the board and
  XML, a designed thumbnail, a Short with every effect (black and white, 1.25×),
  two people taking turns followed in 9:16 (`makeTwoFaces`, needs Python + OpenCV),
  the player across 10+ cuts with no `waiting` and no frame gap over 250 ms, editing
  by text (Delete, R, Shift+arrows, Ctrl+Z, chips), cleanup options, Studio Sound
  measured (speech-to-noise, −16 LUFS), effects rows, a split and a two-person
  Short (faces found in each half), a real green-screen key,
  isolation, a forged link, a killed engine and a failed transcriber (one charge,
  one file), and a phone.
