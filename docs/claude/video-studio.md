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
- **Honest gaps**, shown on the **What works** panel: speaker labels, eye contact
  (researched 2026-10: NVIDIA Maxine is gRPC-only, Sieve's API no longer
  documented — no adapter), background removal (no provider), before/after audio
  preview (planned), publishing (none — "Ready to publish manually").
- **Don't edit `worker/` while `test:videoe2e` runs** — its wrangler rebuilds on
  change and the run dies. `STOP_AFTER=player` ends it after the player check.
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
