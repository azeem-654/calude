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
**Post designer** (Social Creator). Social Creator posts are `crm_social_posts`
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
four operations (`prepare`, `render`, `thumbnail`, `probe`). It is
**stateless**: it downloads inputs from signed URLs, works on local disk,
uploads outputs to signed URLs and reports a result. It never holds a
credential and never talks to the database.

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
| Eye contact | **not available** — "Provider setup required" | NVIDIA Maxine (needs GPU host + licence), Sieve |
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
| Automatic speaker tracking | Planned | — |
| Noise reduction (off / light / medium / strong), voice clarity (presence, de-essing, compression), voice level | Working — heard in the render, not the preview | `media/engine render`, Audio tab |
| Royalty-free music (Openverse: CC0, public domain, CC BY only), your own track with rights confirmed, volume, fades, loop, ducking under speech, which videos | Working | `lib/video/music.ts`, Music tab |
| Before/after audio in the preview | Planned | — |
| Eye contact, background removal | Unavailable — provider setup required | — |
| Direct publishing | Unavailable — Ready to publish manually | — |
| Import from YouTube / Drive / Dropbox | Planned | — |

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
