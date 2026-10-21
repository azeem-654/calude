# AI Video Studio — audit, architecture and phases

*Written 2026-10-09, before Phase 1 was built. The "what exists" sections
describe the repository as it was found; the rest is the plan Phase 1 follows.*

Video Studio turns one long recording the customer owns into a cleaned long
video, several distinct Shorts, captions, PNG thumbnails and per-video
metadata, saved into Protected Central and visible in the Autopilot project
and the Content area. It is **repurposing and editing**, never text-to-video:
the customer's own footage is always the source.

---

## 1. Existing video capabilities

| What | Where | Honest state |
|---|---|---|
| **AI Shorts** | `src/components/VideoShorts/VideoShorts.tsx` (~3,300 lines), `ShortsFeed.tsx`, `/ai-shorts` | Runs entirely in the browser. The source is kept in the browser's IndexedDB (`src/lib/videoStore.ts`), the upload goes straight to Google with a key, the "transcript" is **written by Gemini, not transcribed**, and export is a canvas recorded with `MediaRecorder` (`src/lib/videoExport.ts`). Nothing reaches the server; a project lives in `crm_video_projects` (localStorage). |
| Repurposing | `src/components/SocialAutomation/`, `/social-automation` | Campaign → assets (`clip`, `image`, …) in localStorage (`crm_sa_*`); publishing is a hand-off (`publishHandoff.ts`: share intent, `navigator.share`, or download-and-copy). |
| Voice in | `components/Autopilot/voice/`, `routes/intake.ts` `transcribe` | Gemini, ≤ ~4 minutes, text only — no word timestamps. Fine for a prompt; not a transcript. |
| Marketing film | `Site/LaunchFilm.tsx`, `marketing/launch-film` | Static HLS on the public site; not a product feature. |

**Conclusion:** there is no server-side video pipeline, no real transcript, no
real render. AI Shorts is left exactly as it is (customers use it); Video
Studio is built beside it on the server, and its nav entry says what it is.

## 2. Content Studio

There is no `ContentStudio` component. "Content" is a nav group
(`Layout/navModel.ts`, id `content`) holding **Repurposing**, **AI Shorts** and
**Graphics Designer & Editor** (once "Post designer", the Social Creator). Its posts are `crm_social_posts`
(localStorage, synced to `crm_data`); a draft tagged `ready-to-publish` reads
"Ready to publish". Repurposing's **Content Library** (`ContentLibrary.tsx`)
lists every generated asset by kind (Clips, Images, …).

Video Studio joins the **Content** group, and its outputs appear in the
Content Library as **Videos** and **Shorts**, read from the server (they are
not copied into localStorage — a second copy would drift).

## 3. Project Assets

A project's **Assets** tab (`Autopilot/ProjectCard.tsx`) holds no copies: it
merges links from `crm_autopilot_actions` (`link_kind/id/label/route`) and
`crm_agent_runs` (`link` JSON), filtered to known kinds; `ProducedRail.tsx`
shows the latest as bubbles. A Video Studio output becomes an agent run with a
`video`/`short` link whose route opens the real asset in Video Studio — the
same pattern the finder uses for "N prospects added".

## 4. AI Autopilot integration points

- **Catalogue:** `services/projectSolutions.ts` already has `video-content`
  (`videoSource`: YouTube feed or scripts). It gains **"Videos I upload"**,
  which builds a workflow *When a video is uploaded → Video Studio* with the
  shorts count, captions and thumbnails the customer asked for.
- **Engine:** `lib/projectAgents.ts` runs scheduled `ai` nodes; event-driven
  work starts from the route that saw the event (the finder is the precedent).
  A `video_uploaded` trigger is started by Video Studio's upload route; the
  node (`source: 'video'`, `produces: 'video_package'`) is created only by the
  wizard, like the finder's (`finderOnly`).
- **Activity:** each finished package writes `crm_agent_runs`
  ("4 Shorts created", link → `/video-studio/<id>?tab=shorts`).

## 5. Cloudflare infrastructure found

| Product | Used? |
|---|---|
| Workers (one Worker serving assets + `/api/*`) | yes |
| D1 (`DB`, `LEADS`) | yes |
| Cron Triggers (every 5 min) | yes |
| R2 | **no** — chat pictures and avatars are base64 in D1 |
| KV, Queues, Durable Objects, Workers AI, Containers | **no** |

Deploys: `staging.yml` / `deploy.yml` (typecheck, build, migrations, deploy);
`scripts/leads-db.mjs` is the precedent for a resource the pipeline creates
by name and drops from the binding list if it cannot.

## 6. What is reused

- Auth, sessions, `workspaceAccess` / tenant checks, `installSecret`.
- The operator's Gemini pool (`loadAiKey`, `askGeminiParts`, `withFailover`,
  `aiBudget`, trial end) for analysis and metadata.
- Brand: `crm_portfolios.profile` (company, description, website, `logoUrl`,
  brand colour) — the same `brandFor` reading the agents use.
- Voice prompt: `Autopilot/voice` (`MicButton`) — already reliable.
- Autopilot: catalogue, workflow graph, `crm_agent_runs`, Assets tab.
- Nav model, design language, the "capability status" honesty pattern
  (Platform services: ok / unchecked / error / off).

## 7. What needs external processing — and what does not

A Worker cannot run FFmpeg (no subprocess, 128 MB memory, CPU-time limits).
So the work is split by what each part needs:

| Step | Runs on | Why |
|---|---|---|
| Upload (multipart, resumable), signed reads, signed writes | **Worker → R2** | R2 multipart through the binding: no S3 keys anywhere, no egress fee. |
| Probe, validate, proxy, audio chunks, waveform, silences | **Media engine (FFmpeg)** | Needs a real process and disk. |
| Transcription | **Workers AI** `@cf/openai/whisper-large-v3-turbo` | Word timestamps, language detection (EN/TR/UR), pay per audio minute, no key to hold. |
| Cleanup proposals, Shorts selection, metadata | **Worker** (pure rules + Gemini pool) | Text in, JSON out, validated against the transcript. |
| Captions (SRT/VTT/ASS), re-timed after cuts | **Worker** (pure) | One function from the edit decisions — preview and render read the same one. |
| Render MP4 (cuts, reframe, burned captions, loudness) | **Media engine** | libx264/AAC, libass for Turkish and Urdu shaping. |
| PNG thumbnails | **Media engine**, checked by the **Worker** | Frame + brand + exact text via libass; the Worker checks the PNG signature, IHDR size and IEND before calling it a PNG. |

### The media engine

`media/engine/` — a small Node HTTP service around `ffmpeg`/`ffprobe` with
five operations (`prepare`, `render`, `thumbnail`, `track`, `probe`). It is
**stateless**: it downloads inputs from signed URLs, works on local disk,
uploads outputs to signed URLs and reports a result. It never holds a
credential and never talks to the database. `prepare` copies the source to
its own disk once (stage `download`) after the refusal checks and before its
five FFmpeg passes, in 16 MB ranges each retried on its own, when the disk holds it twice over — reading a 190 MB
recording five times through the Worker, with FFmpeg seeking and dropping
connections, was one of the things making local runs fail intermittently.
The other was the Worker: `/api/video-file.php` read each 16 MB part whole,
and with the browser sending several at once and the engine its outputs, one
isolate neared its 128 MB and was reset mid-request. Parts now stream to R2
through a `FixedLengthStream` of the declared length (part 1 alone is read, to
sniff that it is a video).

It is deployed as a **Cloudflare Container** (`media/` — a Worker
`crmpro-media` with a `Container` class; one instance per job, scale to zero,
billed per 10 ms of use) and reached from the main Worker by a **service
binding** (`MEDIA`), so it has no public address. Any other host can run the
same image: set `MEDIA_ENGINE_URL` and `MEDIA_ENGINE_SECRET` and requests are
HMAC-signed. That is the replaceable part.

Hardening: inputs are downloaded first and FFmpeg runs with
`-protocol_whitelist file` and a demuxer whitelist (mov/mp4/matroska/webm), so
a crafted file cannot make it fetch anything; sizes, duration and resolution
are checked before any work.

## 8. Provider strategy

| Need | Phase 1 provider | Replaceable by |
|---|---|---|
| Storage | Cloudflare R2 (`VIDEO` binding) | — |
| Media | FFmpeg in a Cloudflare Container | any host running `media/engine` (URL + secret) |
| Transcription | Workers AI Whisper large-v3-turbo | adapter interface in `lib/video/transcribe.ts` (OpenAI-compatible, AssemblyAI for speakers) |
| Analysis / metadata | the operator's Gemini pool | — |
| Speaker labels | **not available** with Whisper — shown as "needs a provider" | AssemblyAI / Deepgram (diarisation) |
| Eye contact | **not available** — "Provider setup required" (researched 2026-10, §15) | NVIDIA Maxine (gRPC only — no HTTP route for the Worker), Sieve (API no longer documented) |
| Background removal for portraits | **not available** in Phase 1 | a segmentation model on Workers AI or a provider |
| Music | customer's own upload (Phase 2) | licensed library integrations |
| Publishing | **none** — "Ready to publish manually" | official APIs (YouTube Data, TikTok Content Posting, Meta Graph) |

Every one of these is listed with its status on the studio's **Capabilities**
panel: *Working*, *Needs configuration*, *Unavailable*, *Planned*.

## 9. Cost considerations (pay as used; nothing fixed)

| Item | Unit price (Cloudflare list, Workers Paid) | A 45-minute recording → long + 4 Shorts |
|---|---|---|
| R2 storage | $0.015 / GB-month (10 GB free) | ~1.5 GB source + ~0.6 GB outputs ≈ $0.03/month |
| R2 operations | $4.50 / M writes, $0.36 / M reads | ~200 multipart writes ≈ $0.001 |
| R2 egress | free | $0 |
| Workers AI Whisper turbo | ~$0.0005 / audio minute | ≈ $0.02 |
| Container (standard: ½ vCPU, 4 GB) | ~$0.000020 / vCPU-s + $0.0000025 / GB-s, 375 vCPU-min + 25 GB-h free each month | prepare ~4 min + long render ~25 min + Shorts ~6 min ≈ 35 vCPU-min ≈ $0.04–0.08 |
| Gemini analysis + metadata | operator's key, ~6 calls | a few cents at Flash prices |
| **Total** | | **≈ $0.10–0.20 per recording**, before the monthly free allowances |

Controls built in Phase 1:
- **Nothing is recomputed that did not change.** Transcripts are keyed to the
  immutable source; a caption colour change re-renders, it never re-transcribes.
- **A ledger per job** (`crm_video_usage`, unique per job and kind), so a
  retried job is never counted twice.
- **A monthly allowance per workspace** (source minutes, render minutes,
  storage), and an ended trial stops new processing, like the AI key.

## 10. Phase 1 — the vertical slice

1. **Storage and upload** — R2 multipart through the Worker (resumable, magic
   bytes checked on the first part), signed short-lived read/write URLs,
   immutable source under `v/<workspace>/<project>/source`.
2. **Engine** — `media/engine` (`prepare`, `render`, `thumbnail`), Container
   wrapper, deploy script that binds it only if it deployed.
3. **Jobs** — `crm_video_jobs`: queued → running → done/failed, attempts with
   back-off, lease, idempotency key, cancel; advanced by the engine's poke,
   by the open screen's poll and by the cron (recovery). Real stages, real
   percentages only where they are counted (transcription chunks, render
   progress from FFmpeg), indeterminate otherwise.
4. **Transcript** — Workers AI per chunk, word timings, language, segment
   confidence; search; correction of caption text (kept apart from cuts).
5. **Edit decisions** — one document per project (`crm_video_projects.doc`):
   cuts (source ranges with reason, confidence, origin, state
   proposed/approved/rejected/protected), clips, caption style, thumbnails,
   outputs, with version history (undo/redo).
6. **Cleanup** — pure rules (fillers in context, long gaps, immediate
   repetitions, false starts), never touching numbers, prices, dates or
   negation; Conservative / Balanced / Aggressive.
7. **Shorts** — Gemini picks distinct topics on sentence boundaries; validated
   (length, overlap, completeness); fallback without AI says so. Editorial
   scores only (hook, clarity, relevance, completeness).
8. **Captions** — re-timed through the cuts; SRT, VTT, burned ASS (Noto fonts,
   libass shaping for Urdu/RTL).
9. **Render** — long 16:9 and Shorts 9:16 (crop with a manual position, or
   fit with a blurred fill for screen recordings), loudness-normalised MP4.
10. **Thumbnails** — three genuinely different layouts per video, exact text
    by libass, PNG verified.
11. **Metadata** — per video, from its own words.
12. **Where it shows** — Video Studio (Projects, editor, Media Library, Brand
    Kit, Exports, Ready to Publish, Templates), Content Library, the
    project's Assets and Activity, and an Autopilot workflow.

Phases 2–4 follow the brief: audio cleanup presets, retake/repetition
detection with AI, music, better reframing; conversational editing beyond the
Phase 1 commands, brand templates, review comments; eye contact and
publishing only with real providers.

---

## 11. Phase 1 as built (2026-10-09)

| Capability | State | Where |
|---|---|---|
| Studio in the app (welcome wizard over Projects, Quick Shorts, Repurpose, Media Library, Brand Kit, Exports, Ready to Publish, Templates) | Working | `src/components/VideoStudio/`, Content → AI Video Studio |
| Resumable uploads to R2 (16 MB parts, bytes sniffed, same file resumes) | Working once R2 is bound | `routes/videoFile.ts`, `services/videoStudio.ts uploadVideo` |
| Probe and refusal (codec, duration ≤ 3 h, ≤ 4096 px, ≤ 12 GB), proxy, waveform, silences | Working once the engine is deployed | `media/engine/server.mjs prepare` |
| Transcription with word timings and language, confidence per segment | Working once Workers AI is bound | `lib/video/transcribe.ts` |
| Transcript editing: remove from video / fix caption text / protect / make a Short | Working | `EditorPanels.tsx` |
| Cleanup: fillers, pauses, repeats, false starts — Conservative / Balanced / Aggressive, approve / reject / restore / protect | Working | `lib/video/cleanup.ts` |
| Shorts: AI choice validated (distinct, whole sentences, no shared footage), rule fallback, "find the section about…" | Working | `lib/video/shorts.ts` |
| Long video + Shorts as real MP4 (H.264/AAC, loudness-normalised), 16:9 / 9:16 / 1:1 / 4:5, crop with a position or fit with blurred fill | Working | `media/engine render` |
| Captions: burned (ASS, Turkish and Urdu), SRT, VTT, re-timed after cuts, four styles | Working | `lib/video/captions.ts` |
| PNG thumbnails: three layouts, exact headline, brand colour, logo; checked as PNG | Working | `media/engine thumbnail`, `lib/video/png.ts` |
| Metadata per video (titles, description, keywords, tags, hashtags, chapters, pinned comment, CTA) | Working | `pipeline.ts metadataStep` |
| Conversational edits, undo / redo, version history | Working (pattern-read commands) | `lib/video/commands.ts`, `VersionsPanel.tsx` |
| Autopilot: "Recordings I upload" workflow, activity line, Assets tab, upload into a project | Working | `projectSolutions.ts`, `pipeline.ts refreshProject`, `ProjectVideos.tsx` |
| Content Library: Videos and Shorts with statuses | Working | `ContentShelf.tsx` |
| Usage ledger and monthly allowances | Working | `lib/video/usage.ts` |
| Speaker labels | Unavailable — needs a diarising provider | — |
| Face and speaker tracking (9:16 and any crop) | Working once the engine image with OpenCV is deployed | `media/engine/track.py`, `lib/video/motion.ts`, Tracking tab |
| Noise reduction (off / light / medium / strong), voice clarity (presence, de-essing, compression), voice level | Working — heard in the render, not the preview | `media/engine render`, Audio tab |
| Royalty-free music (Openverse: CC0, public domain, CC BY only), your own track with rights confirmed, volume, fades, loop, ducking under speech, which videos | Working | `lib/video/music.ts`, Music tab |
| Before/after audio in the preview | Planned | — |
| Eye contact, background removal | Unavailable — provider setup required | — |
| Direct publishing | Unavailable — Ready to publish manually | — |
| Start from the customer's own YouTube video | Working once the engine image with yt-dlp is deployed (see §14) | `lib/video/youtube.ts`, engine `fetch_url` |
| Import from Google Drive / Dropbox | Planned | — |

Tests: `npm run test:video` (94 checks, pure, in the staging pipeline) and
`npm run test:videoe2e` (the 20-step journey on a 20-minute recording with the
real engine, plus everything in §12).

## 12. The editor redesign, sound, music, reuse (2026-10-09)

The owner's concept (a dark editor: media list left, player centre, an
inspector with Video/Animation/Tracking tabs right, a multi-track timeline
underneath, an AI panel "How can I help you?") and three reports from using
Phase 1: the assistant refused "remove the background noise and add music to
all the videos"; the preview played three or four seconds and stopped; AI
Shorts and Repurposing were separate modules.

**Why the preview stopped.** Every poll (2.5 s while anything runs) handed
out a freshly signed link to the proxy, and the player followed it into
`src` — so the video reloaded from the start each time. Signed links now
expire on the hour (`sign` in `lib/video/store.ts` rounds the expiry up), so
the same file has the same address within the hour; and the player
(`Player.tsx`) holds the first address until the video itself reports an
error, then takes the newest one at the same moment and play state.

**The editor** (`VideoEditor.tsx`): top bar (back, name, undo/redo, history,
What works, Render N changes, delete); left — **Media** (the long video, every
Short, the music, searchable; Shorts drawn from the engine's filmstrip until
they have a thumbnail), Transcript, Cleanup, Shorts; centre — the player with
its own controls (play, ±5 s, the edited video's clock, a scrub bar over the
*edited* timeline, mute, full screen; Space and ←/→); right — the inspector:
**Video** (shape and framing of what is selected), **Audio**, **Music**,
Captions, Export, **Reuse**, with the assistant under it; bottom — the
**timeline** (`Timeline.tsx`): picture (a filmstrip the engine cuts during
`prepare`, one frame every ≥ 2 s, at most ~300), text (sentences), Shorts,
the measured waveform and the music; cuts in red, suggestions in amber,
protected parts in teal; press to move the playhead, drag to mark a stretch
and Cut / Restore / Protect / Make a Short — the same operations as the
transcript. The concept's Animation and Tracking tabs are not built: nothing
behind them exists yet (speaker tracking is planned), so they are not drawn.

**Sound.** `doc.audio`: `denoise` (`afftdn` at three strengths; strong adds a
low-pass), `voice` (presence EQ, de-esser, gentle compression), `volume`
(0.5–1.5), `loudnorm`. Applied by the engine at render; the Audio tab says
the preview plays the recording's own sound.

**Music.** `doc.music` is set only by the server (`music.set` is filtered out
of browser edits): from **Openverse** — searched with `license=cc0,pdm,by`
and checked again on our side, because NonCommercial (a business video is
commercial), NoDerivatives (music under video is an adaptation) and
ShareAlike (it would bind the customer's video) are not usable — fetched by
the Worker by id (never a URL from the browser), stored in the workspace's
R2 folder with its licence; or the customer's own file, sniffed as audio and
recorded with the rights box they ticked. Previews of library tracks play
through `/api/video-file.php` (mode `listen`, by track id), so the browser
never calls the library. A CC BY credit is written into the description of
every video the music is under (`withMusicCredit`, and `recreditOutputs` when
the track changes). The engine loops it, fades it, ducks it under speech
(`sidechaincompress`) and mixes it before loudness normalisation; the
preview plays it at its volume without the ducking.

**Commands.** A sentence is split at "and / also / then" before a verb, so
"remove the background noise completely and also add upbeat music to all the
videos" is two operations and renders every video again. Noise: remove /
reduce (medium; "completely" → strong; "a bit" → light; "turn off noise
reduction"). Music: add (a mood → a library search), quieter, louder, fade,
remove — and an honest answer when there is none.

**Welcome wizard** (`WelcomeWizard.tsx`): the studio opens on "What would you
like to do with your video?" — eight goals: clean a long video and make
Shorts; edit and clean; Shorts only; repurpose into posts, emails and a blog;
**a quiz from a training video**; captions only; and two hand-overs —
**Quick Shorts** (the old AI Shorts: a Short from a topic, link or script)
and **Repurpose** (the old Repurposing campaign module), now tabs inside the
studio (`/ai-shorts` and `/social-automation` redirect there, keeping their
query). Each goal asks only its own choices (Shorts count/length/shape/
framing, cleanup, captions, thumbnails, noise, voice, music mood, posts/blog/
emails, quiz, language), writes the request out for review, and passes
`want` to `create`: sound onto the first version, music found while the
video uploads, and repurpose/quiz jobs queued once the analysis is done.

**Reuse** (`ReusePanel.tsx`, jobs `repurpose` and `quiz`, migration 0070
`crm_video_projects.extras`): the Repurposing writers AI Autopilot already
uses (`writeImagePosts`, `writeBlogPost`, `writeSequenceBatch`) on the
transcript, saved as drafts in Social posts, Blog and Email sequences and
named on the Autopilot project's activity; and a quiz of up to 12
multiple-choice questions, each tied to the sentence where it is answered —
a question pointing at no sentence of the recording is dropped
(`cleanQuiz`). Copy, .txt and .csv downloads.


## 13. Tracking, animation, colour, words on screen, thumbnails and the board — and an audit (2026-10-10)

The owner asked for the Animation and Tracking tabs from the concept and
speaker tracking, advanced editing (their second reference: Adjust colours,
filters, effects, speed, fade), outputs shown like their third reference (a
list of videos, each with a score, a preview, words and downloads), trending
YouTube thumbnails that are shown and editable, a fluid editor and player,
and an audit of everything in the studio.

### What was built

**Faces and the speaker** (`media/engine/track.py`, engine op `track`, job
`track`, queued after `prepare`). The proxy is piped into Python at 5 frames
a second (3 for recordings over 30 minutes); OpenCV's **YuNet** detector finds
faces (the model is downloaded into the engine image and pinned by its hash;
without it, OpenCV's own Haar cascade). Faces are joined into tracks by
overlap. Two camera paths come out: the most prominent **face**, and the
**speaker** — the face whose mouth region moves while the sound says someone
is talking, less the movement of the eye region so a nod is not speech, held
for two seconds before the frame cuts to a new speaker. The camera eases
inside a dead zone and *cuts* on a change of speaker. It reads lips, not
voices: two people talking at once, or a speaker turned away, are not told
apart, and the Tracking tab says so. The render follows the path with a crop
moved by `sendcmd` (the crop's size never changes mid-stream — that stalls
FFmpeg, found by test). Proved on a 40-second test of two portraits taking
turns: switches at 15 s and 29 s for turns at 14 s and 28 s, with YuNet and
with Haar; and in the end-to-end test, the rendered 9:16 Short keeps the
speaking face centred and changes to the other person.

**Animation** (`doc.motion`, per long video / all Shorts): punch-in zooms on
every other sentence (`punchSpans`) or a slow push (both `zoompan`), a flash
or dip to black at each jump cut (`cutTimes`, ≥ 0.6 s apart), fades in and
out (picture and sound), speed 0.5–2× (`setpts` + `atempo`, pitch kept;
captions, SRT/VTT, words on screen and chapters re-timed), and a progress bar.

**Colour** (`doc.look`): ten filters (vivid, warm, cool, cinematic, black &
white, vintage, punchy, soft, food) and temperature, tint, exposure,
brightness, contrast, saturation, hue, sharpness, blur, vignette, grain. The
engine owns the filters; warmth, tint and the cinematic split are one
per-channel table (`lutrgb`) — measured seven times faster than
`colorbalance` at 1080×1920. The preview uses CSS filters (`cssLook`) and says
it is close, not exact.

**Words on screen** (`doc.overlays`): title, lower third, call to action,
label, quote; pop, slide, fade, reveal; colours. They are placed on the
*recording*, so they stay with their moment in every video that keeps it,
through any cut (`overlaySpan`), and are burned in through ASS
(`overlayAss`, typed braces never become tags).

**Thumbnails, trending.** Creators' own advice for 2025–26 (vidIQ, and the
others found — see the sources in the session) agrees on: one dominant
subject, a face, big; three to five words; two or three colours; a thick
outline because it must read at phone size; one word in an accent colour; a
coloured edge so it stands out on light and dark YouTube; an arrow or ring
used sparingly; either saturated (entertainment) or desaturated and cinematic
(finance, documentary). Five layouts follow it (`trendLayout` in the engine):
**bold** (the face close up — found by the detector in that frame — the
words huge beside it), **callout** (a ring round the face and an arrow from
the words; nothing is ringed when there is no face), **cinematic**
(letterboxed, graded), **split** (two moments), **number** (the figure in the
headline on an accent tile). Default sets are bold / callout / cinematic,
then split / number / bold, and so on. Each PNG keeps the spec it was made
from, so the **designer** (`ThumbnailDesigner.tsx`) opens it again: layout,
words, the highlighted word, the moment (from a frame of the proxy), how close
to the face, colours, edge — with a live preview — and "Make the PNG and use
it" has the engine draw it exactly, checks it, and makes it the chosen one.

**The board** (`OutputsBoard.tsx`, under the editor): a row per video with the
editorial score out of 100 and Hook / Flow / Value / Whole grades (the AI's
reading of the passage — never a forecast of views; rule- and hand-chosen
Shorts are not scored), the playable preview with its thumbnail (the proxy
over the same stretch, labelled "before cuts", until it is rendered), the
title, description or transcript, the time range, keywords, hashtags,
chapters, thumbnails (choose, design, three more), and its files: MP4 at the
size made (no 4K button on a 1080p file), PNG, SRT, VTT, **Export XML** (the
cut list as Final Cut 7 XML for Premiere Pro and DaVinci Resolve, relinked to
the customer's own recording), copy caption, edit the words, **duplicate** a
Short, edit it in the editor, and its status.

**The editor, easier and smoother.** The inspector is an icon rail (Video,
Adjust, Animation, Tracking, Text, Audio, Music, Captions, Reuse, Export →
the board). Everything that moves every frame — the scrub bar, the clock,
zoom, the tracked crop, fades and flashes, the timeline's playhead — is
written to the elements from one animation-frame loop instead of through
React state. The timeline has a Text lane (drag to move, edges to stretch),
Shorts trimmed by dragging their edges (snapping to sentence boundaries; Alt
to drag freely), I / O to mark, X cut, P protect, M make a Short, J / K / L and
the arrows, Ctrl/⌘ + scroll to zoom where the pointer is. The assistant
understands the new edits: "follow the speaker in the Shorts", "speed the
Shorts up to 1.25x", "add punch-in zooms", "make everything black and white",
"add a title "…"" (at the playhead), "add a progress bar", "fade in and out".

### The audit

Every feature of the studio, how it was checked, and what was found.

| Feature | Checked by | Found / fixed |
|---|---|---|
| Welcome wizard, eight goals, upload, resumable | e2e (goal → choices → upload; a resumed upload) | — |
| Prepare: probe and refusals, proxy, waveform, silences, filmstrip, poster | e2e on a 20-minute recording; a PNG renamed .mp4 refused | — |
| Faces and the speaker | engine test (two portraits), e2e (the rendered Short follows the speaker) | The deploy script's rebuild hash left out `track.py` — added, so a tracker change ships |
| Transcription, cleanup, Shorts, metadata | e2e with Whisper and Gemini stand-ins, and without AI | — |
| Player | e2e plays 17 s through cuts and polls (as VP9) | The playhead and clock now move per frame without redrawing the editor |
| Timeline | e2e drags a Short's edge | Short blocks were buttons that could not hold drag handles — now draggable |
| Look, motion, words on screen, speed | engine render test; e2e renders a Short in black and white at 1.25× with captions re-timed | Changing a crop's size mid-stream hangs FFmpeg → crop moves, zoom by `zoompan`; `colorbalance`/`colortemperature` too slow at 1080×1920 → `lutrgb` |
| Sound and music | e2e (noise and music by sentence; music measured in the file) | — |
| Thumbnails | e2e: every one a real PNG of the right size; designed one made and chosen | The number layout read "4 million" as "4 m" — fixed; the portrait callout ring ran off the frame — fixed |
| Outputs board, XML, duplicate | e2e | The Export tab moved here |
| Reuse (posts, article, emails, quiz) | e2e | — |
| AI Shorts / Repurposing tabs | e2e (old addresses redirect) | AI Shorts is still the older browser module (its transcript is Gemini-written, its export a canvas recording) — said in the tab |
| Autopilot, Content Library, isolation, a forged link, a killed engine, a failed transcriber, one charge per job | e2e | — |
| Phone | e2e at 390 on every studio page | — |

Known limits, said on screen: speaker tracking reads lips, not voices; colour
in the preview is close, not exact (vignette and grain only in the render);
a render with a heavy look runs at about 1.6× the length of a 1080×1920
video on four cores; speaker labels, eye contact, background removal and
direct publishing are not available.

Tests: `npm run test:video` (127, pure) and `npm run test:videoe2e` (the
journey above, plus two people taking turns — a public-domain 1863 portrait
of Abraham Lincoln in `test/fixtures/faces`, used twice).

## 14. From a YouTube link, trending thumbnails round two, the Graphics Designer & Editor (2026-10-16)

The owner asked for three things: start a long video from a YouTube link
(a recording on a PC is huge; the same video on the customer's channel is
already uploaded), thumbnails in the style of today's trending ones with
everything editable, and a way to take a thumbnail into the post designer —
now called the **Graphics Designer & Editor** everywhere a customer reads it
(routes and code names unchanged; search still finds "post designer").

### A YouTube link instead of a file

The wizard's third step is **"Your video"**: *From my computer* or *From a
YouTube link* (`NewVideoProject.tsx`). The link is read by
`lib/video/youtube.ts` (pure, shared with the browser): `watch?v=`,
`youtu.be/`, `/shorts/`, `/live/` and `/embed/` give an eleven-character id;
another site, a playlist, a channel or a search is refused by name on
`data-field="video.youtube"`. The title and channel come from YouTube's
oEmbed **through the Worker** (`youtube_info`, `YOUTUBE_OEMBED_BASE` for
tests); the browser asks YouTube for nothing but the still
(`i.ytimg.com/vi/<id>/hqdefault.jpg`). Nothing starts until the customer
ticks **"This is my video, or I have the rights to use it"**
(`video.youtubeRights`) — YouTube's terms allow downloading only what you own
or may use — and who ticked it, when, is kept on the source.

`create` with `youtubeUrl` makes the project and queues engine job
**`fetch_url`** (same idempotency, lease, attempts and back-off as every
job). The engine (`server.mjs fetchUrl`) is given **the id only** and builds
the URL itself (a `url` param must be on youtube.com/youtu.be and is reduced
to its id); yt-dlp runs with `--ignore-config --no-plugin-dirs
--no-remote-components --no-playlist --no-cache-dir --no-exec`, Node as its
JavaScript runtime, the URL after `--`. It reads the video's details first —
live, over Video Studio's three hours, or over **the minutes left in this
month's allowance** (the Worker passes them) is refused before a byte is
fetched — then the best ≤ 1080-line version in MP4 (else Matroska), probed,
and uploaded through the signed prefix link like a render. The Worker then
checks it as an upload is checked — the bytes are there, the size matches,
the first bytes are a video container, storage has room — and only then is
it the source: the recording is counted (`long_videos`), `prepare` runs and
meters its minutes from the probe exactly as for an upload.

yt-dlp's own words come back as `ytdlp: …` and are read in one tested place,
`youtubeRefusal`: "Sign in to confirm you're not a bot" (YouTube often says
this to cloud servers, whatever the video), private, age-restricted,
members-only, unavailable, geo-blocked are **terminal**, each a sentence
ending **"Download it from YouTube Studio (Content → ⋮ → Download) and upload
the file instead."**; anything unrecognised is retried. The editor shows the
stopped project with that sentence and **Upload the file instead** into the
same project, keeping every choice (`upload_start` accepts it once no fetch
is running, and cancels the failed one). Never a source without bytes.

**Honest limits.** From Cloudflare's addresses YouTube may refuse often; the
way forward is on screen. yt-dlp is pinned (`yt-dlp[default]==2026.8.19`,
bringing yt-dlp-ejs) in `media/Dockerfile`; when fetching starts failing for
every video, bump the pin first. The Docker image was **not built** in the
session that added this (no registry access); the engine code path was run
locally against a stand-in.

### Trending thumbnails, round two

`media/engine/thumbLayout.mjs` (plain JavaScript, no imports, types in
`thumbLayout.d.mts`) turns a request into a **plan** in pixels: the crop that
puts the face where the layout wants it, gradient panels, a blurred-frame
background, a spotlight and an accent halo round the face, every line of
words with its size and place (uppercase, condensed, thick outline, drop
shadow, soft dark halo; the picked word coloured or in a **tilted accent box
on its own line**), a ring and an arrow (only round a found face, and never
through the words — no room, no arrow, and the designer says so), a sticker
from a fixed list placed clear of the words, a channel strip, a VS disc. The
engine paints the plan — an FFmpeg graph built only from its numbers
(gradients and the spotlight are `geq` expressions of numbers) plus an ASS
file whose only free text is the escaped words — and the designer's preview
draws **the same plan** with CSS and SVG, so the preview is the PNG's layout
(fonts and blur are the browser's; it says it is a preview).

Eight layouts, a fixed list: **bold** (face + huge words on a gradient
panel), **glow** (frame blurred into the gradient, face sharp in a spotlight
with an accent halo — not a cut-out; background removal needs a provider),
**headline** (words first, for screens), **short** (the 9:16 Shorts cover:
face high, strip on top, words low), **callout** (ring + arrow), **split**
(two moments, each framed on its own face; "A vs B" puts each half under its
picture with a VS disc), **number** (the figure on an accent tile;
"#10", "8 hours"), **cinematic**. A Short's sets lead with the cover.
Options, each held to the engine's lists and ranges (`normaliseSpec`,
`cleanThumbSpec`): picked word and its style, accent, a two-colour gradient
(six presets from the examples), text colour, words at top/middle/bottom,
word size 60–140 %, face left/centre/right, sticker (tick, cross, up, down,
money, alert, question, star), pointer (arrow, circle, both, none), channel
strip, moment(s), zoom, edge. Every PNG is still checked by `png.ts` before
it is offered. Fixed on the way: two designs asked for quickly got the same
set number, and the second was dropped as a duplicate (`setsOf` now counts
sets still being made).

### Edit in Graphics Designer & Editor

Every checked thumbnail on the board has a brush (and the row an **Edit in
Graphics Designer & Editor** action). `designerHandoff.ts` fetches the PNG
now (its signed link expires on the hour), draws it as a JPEG data URL (a
design lives in `crm_social_posts`, synced whole and refused over 2 MB) and
creates a design whose canvas is half the video's size — the designer
exports at twice its canvas, so the PNG is exactly 1280×720, or 1080×1920
for a Short's cover — carrying `videoThumb` (project, output, workspace).
The editor then shows a banner and **Use as this video's thumbnail**: the
PNG goes straight to R2 through a signed link (`thumb_upload_url`), and
`thumb_attach` checks it from its bytes (`checkPng` at the exact size,
≤ 10 MB, key inside this output's folder) before adding it as a `designed`
thumbnail and choosing it; anything else is deleted and refused. Over 2 MB it
says YouTube will want it smaller.

Tests: `npm run test:video` (202, pure — the link parser, the refusal
reader, every layout's plan inside the picture, boxed and two-tone words,
arrows clear of words, stickers, split, clean specs) and `npm run
test:videoyoutube` (53 checks: engine with a yt-dlp stand-in that refuses
unless the locked-down arguments are there, oEmbed and Whisper mocks, real
wrangler and D1, the browser at 1280 and 390 — the bot refusal and the
upload instead, too long, over the month's minutes, a fetch prepared and
metered like an upload, every layout a checked PNG, the designer preview,
the round trip through the Graphics Designer & Editor, a forged PNG and a
foreign key refused).

## 15. Editing like Descript: gapless preview, text-based editing, Studio Sound, effects, Shorts layouts (2026-10-21)

The owner's reference is Descript: the transcript as the editor, a player
that plays through every cut with flow, and a property panel of effects,
each a row with a switch and its settings.

### What works now

| Feature | Status | Where |
|---|---|---|
| Preview plays through cuts without stalling | Working — measured in the e2e: 40 s across 11+ cuts, 0 `waiting` (the old player: 10 in 11) | `deck.ts`, `Player.tsx` |
| Text-based editing: select words (drag, shift-click, Shift+arrows), Delete cuts them (struck through in red, kept on the page), R restores, a text cursor that moves the playhead and follows playback, Ctrl/⌘+Z/Y | Working | `TranscriptEditor.tsx` (same `Op`s as every other panel) |
| Pauses, fillers and retakes inline in the transcript as chips (accept / ignore / put back) | Working | `TranscriptEditor.tsx` |
| Speaker labels in colour | Shown when a transcript has speakers — Whisper does not, so not yet | — |
| Timeline: cuts shaded pink on the filmstrip, the waveform faded under them | Working | `Timeline.tsx` |
| Filler words by kind (um/uh, "like", "you know", "I mean", "sort of / kind of", "basically / actually / literally", "right?", "so / and" + pause) with context rules, ticked in an options panel with counts and a preview of each | Working; only um/uh standing alone start applied | `cleanup.ts findFillers` |
| Retakes: the best take kept, saying why (complete, no false start, louder, livelier, fewer fillers, brisker) | Working — proposed, never applied without you | `cleanup.ts proposeRetakes` |
| Shorten word gaps to a chosen length | Working (where the sound is quiet) | `doc.cleanup.maxPause` |
| Studio Sound: high-pass, RNNoise speech denoising, de-esser, presence EQ, compression, two-pass loudness to −16 LUFS; strength 0–100 | Working in the render — measured in the e2e (noise floor down, speech-to-noise +8 dB or more with RNNoise, −16 ±1 LUFS) | engine `voiceChain`, `measureLoudness` |
| Lower audio of other layers (music ducked under speech) | Working | `music.duck`, sidechaincompress |
| Color adjustments: exposure, contrast, highlights, shadows, saturation, temperature in kelvin | Working; the preview is close (CSS) | engine `colorFilters` |
| Shadow (X, Y, blur, colour, opacity) | Working where the picture sits in a frame (whole-picture framing, the picture-in-picture bubble) | engine `shadowUnder` |
| Green screen: a real chroma key with despill and a colour behind | Working — only for footage shot on a green or blue screen; preview shows the footage as recorded | engine `greenFilter` |
| Improve appearance: mild denoise, gentle auto levels, light sharpen, skin smoothed inside the tracked face box only | Working; skin smoothing needs faces found | engine `appearanceFilters`, `skinFilter` |
| Shorts layouts: speaker (tracked), screen only, split screen + camera, both people top and bottom, picture-in-picture — offered only where the face track supports them, with the reason otherwise; live preview | Working — e2e renders split and two-person Shorts at 1080×1920 and finds the faces in the halves | `layouts.ts`, engine `layoutFrame` |
| Eye contact | Unavailable — see below | — |
| Picture behind a green screen (instead of a colour) | Not built | — |
| Scenes / layout per section, export presets | Not built | — |

### Eye contact, researched

FFmpeg cannot redirect a gaze. NVIDIA Maxine Eye Contact (NIM, hosted on
NVCF) is documented only as a **gRPC** service (`grpc.nvcf.nvidia.com:443`,
streamed file chunks) — there is no HTTP route a Worker can call, and every
third-party call here is made from the Worker. Sieve announced an
eye-contact API in 2024 (10¢ a minute), but its documentation is no longer
published (the docs host does not resolve; the blog post is gone), so there
is no contract to build and test an adapter against. It stays on the gaps
list as "Provider setup required" and the assistant says so; nothing fakes it.

### Unverified

The engine image cannot be built here. The Dockerfile now downloads the
RNNoise model pinned by commit and SHA-256; Debian bookworm's FFmpeg 5.1 has
`arnndn`, `deesser`, `chromakey`, `despill`, `bilateral`, `normalize` and
`hqdn3d`, but the image itself is untested. Everything else ran against the
real engine with FFmpeg 6.1.
