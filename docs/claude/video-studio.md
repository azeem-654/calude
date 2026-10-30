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
  `volume`, heard in the render only (and the Audio tab says so). `doc.music` is set
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
  eight layouts — bold, glow, headline, short (9:16 cover), callout, split
  ("A vs B"), number, cinematic — painted by the engine (numbers-only FFmpeg
  graph + escaped ASS) and drawn by `ThumbnailDesigner.tsx` as its preview;
  options (picked word coloured or boxed, gradient, word place/size, face
  side, sticker, arrow/ring, strip) clamped by `normaliseSpec`. A ring or
  arrow only round a found face, never through the words. Each PNG keeps its
  `spec`; `thumb_custom` makes a designed one. **Edit in Graphics Designer &
  Editor** (the post designer's name everywhere a customer reads it) opens a
  thumbnail as a design (`designerHandoff.ts`); **Use as this video's
  thumbnail** comes back through `thumb_upload_url` + `thumb_attach`
  (`checkPng` at the exact size before it is chosen).
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
  as **screencam** (camera box whole in the top third, the screen below in a
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
  opens by itself on wide screens when something starts moving; a pill under
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
  Look → Zoom (screen recordings) → Text → Logo → Captions → Export, above
  every editing panel, one line on what each does, a tick where something is
  set (read from the doc), "Next".
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
