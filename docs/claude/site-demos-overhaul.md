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

## The owner's second note (2026-11-19): demos that sell

Reviewing the first re-recorded clips, the owner said a demo must not be a
basic task ("a contact added", "a deal added"). It is marketing: it shows the
features that make the module better than its competitors, slowly, and runs
the routine steps fast. Their examples — Contacts: filters, lists, export,
finding businesses from inside Contacts, notes, pushing contacts into a
workflow, finding prospects. Pipelines: a separate pipeline per business
workspace, deals created by themselves from the website's forms, the
automations.

So every module recipe is made like this:

1. **Research the module first** — its code (`src/components/<Module>`) and
   the real screens against the sample workspace (`site-reels.mts HOLD=1`,
   drive it with a scratch Playwright script and look at screenshots). List
   what is distinctive, and record only what works there. **AI buttons are
   recorded with real AI since 2026-11-20**: export `AI_API_KEY` (a Google AI
   key) and/or `OPENROUTER_API_KEY` before running the recorder —
   site-reels.mts hands them to its wrangler, and the Worker's failover
   (lib/aiPool.ts) uses them like the live keys; plain `wrangler dev` reads
   the same names from the git-ignored `.dev.vars`. Wait on AI with
   `h.waitAi(done)` (played fast, badged), and drive by what is on screen —
   the model's words differ every take.
2. **Caption each feature** while it is on screen: `h.say(title, sub)`
   (`scripts/clip-frame.mts`) — bottom-centre, read at 1×.
3. **Routine steps at speed**: `h.fast(4)` … `h.fast(1)` plays a stretch
   faster, typing and moves included, with a "⏩ 4× speed" badge, so it reads
   as an edit and not as an app quicker than it is.
4. **Show the real thing happening** where it can be: Pipelines fills in the
   business's public quote form (`/f/get-a-quote`) and the deal appears on
   the board ~5 s later, with the app's own notice (`toasts: true` keeps
   notices on for that recipe; they are hidden otherwise).
5. Every frame carries the "Sample workspace · real app, demonstration data"
   tag (clip-frame.mts). 60–120 s; still under ~2 MB per clip.
6. Re-record against a **fresh** workspace for the take you keep: a recipe
   changes the data (an automation rule saved, a contact added), and a retry
   against the same one shows duplicates or skips a step.

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
| 1 Pointer | built (`scripts/clip-cursor.mts`), in use; captions, fast-forward badge and sample tag added (`scripts/clip-frame.mts`) |
| 2 Hero (+ past-due reminder, receipts, keyword highlight) | **Re-briefed 2026-11-20** by the owner: the hero is "a quick preview and working in fast forwarding of each of our module". Done: `scripts/hero-reel.mts` cuts a ~30 s stretch of every module clip (13) at 5× with its name and a speed badge into `public/site/clips/hero-reel.*` (`HERO_REEL` in clips.ts, a `ClipPlayer` in the hero; its buttons bottom left). `test:sitefit` green at all 15 sizes; `test:reeltour` now tests the ownership tab's reel (the hero has no ShotReel). The three-workspaces/$1,200 tour, past-due reminder and keyword highlight are not built |
| 3 Module demos | Feature-led per the second note, in four rounds (2026-11-19). Before: **Contacts** (97 s), **Pipelines** (70 s). Round 1: **AI Autopilot** (114 s — the canvas, each step opened in turn with a dry-run, the editor, guardrails, agents, activity, Brightline's daily finder, then a new business workspace from a sentence) and **AI Prospecting** (58 s — a search live, the step log, filters, then the search connected to a business workspace as a daily finder in five steps). Round 2: **Websites** (68 s — templates, editing on the page, a section in a click, pages and screen sizes, search title, publish), **Graphics** (67 s — templates by purpose, words fitted, every format, brand, picture, variation, the post) and **Engagement** (79 s — a ticket with an internal note, a form changed then really filled in and filed, an AI agent set up, the chat widget's embed line). Round 3: **Email campaigns** (47 s — results per campaign, a sequence step that waits for no reply, A/B, a step previewed per contact, the activity log, list import; the AI-written parts are left out because the local Worker's free AI models were refusing that day — retake the brief → AI emails chapter when a key with credit is set), **Booking** (58 s — edited beside the live page, themes, length and place, the visitor's time zone, phone view, hours and automatic emails) and **Inbox** (43 s — mailboxes, urgent first, a ready reply, tag, internal note, resolved, search). Round 4: **Agency** (52 s — a client workspace made on camera with its plan, price and the product name on its sign-in page; the agency's branding saved; a sign-in address claimed; that address opened signed out showing "Welcome back to Rivera Growth") and **Reports** (31 s — the overview over 90 days and 12 months, sources, deals by stage and owner, campaigns, deliverability; not "Revenue by business workspace", which counts shop orders and the shop is incubated). All twelve are feature-led; the player lost its own tag and its buttons moved top right, off the captions. Waiting for the owner's review. Still to do in this phase: the campaign AI-writing chapter (needs a working AI model locally), and the in-video captions are small at phone width (the 9:16 crop of phase 2 answers that) |
| 4 Remaining stills → clips | **Main page done 2026-11-21** (owner: "remove all static screenshots… autoplaying, silent, looping video snippets"): the agents section plays `clip-agents`; the "Yours, not ours" tabs play `clip-mailbox`, `clip-domain`, `clip-agency` (Your name) and `clip-data` — recipes in `site-clips.mts`, entries in `clips.ts`. The main page has no ShotReel left; the industry microsites still do (`test:reeltour` now tests `/hvac`'s hero reel). |
| 2026-11-21 owner brief | Hero: the fast-forward reel and its floating prompt are gone — **one video at the top**, the platform film (LaunchFilm) right under the headline; `hero-reel.*`, `HERO_REEL` and `scripts/hero-reel.mts` removed. Films: no AI Shorts or online shop anywhere; Protron (round face, "AI Live Business Manager") everywhere — the four clips recorded before 2026-11-20 (autopilot, contacts, engagement, inbox) re-recorded; new chapter `film-ap-watch` (the campaign watch flags Brightline's outreach — seeded `crm_delivery_log` + `crm_protron_alerts` — the fix written by Edit with AI for approval, then Protron in the help button's live chat, seeded house widget). The recorder now writes `<id>.captions.json` beside each master (caption times after fast stretches) for a narration script's `at`. `scripts/film-cut.mts` cuts an excerpt as a chapter, for short films. `clip-autopilot` is now cut from `film-ap-inside` (its recipe kept failing on the wizard's varying questions — re-cut it after re-recording that chapter). The platform film (`site-film.mts`) re-made from the new clips. **Voice:** a third of the cached lines had cut faults (a first word lost, the next line's first word on the tail — the owner's "stuck mid-sentence"): `voiceover.mts` now cuts at the silence between two lines and re-hears every piece (`scripts/vo-check.py`), re-voicing a faulty one in a smaller batch; when every key is spent it moves to `gemini-3.8-flash-lite-tts`. Films made: `appsumo-lifetime-deal` (22 min 58 s) and `appsumo-short` (2 min 3 s, `marketing/voice/scripts/appsumo-short.json`, excerpts `s-*` via film-cut: board 4.6–25, watch 5.8–42.6, prospecting 0.5–17, websites 0.3–22). Recorder fixes: a refused clip's page is closed (left open, it slowed every later clip into the ceiling); the help panel is hidden in recordings unless `data-clip-help`; `wizard()` takes visible dialogs only; the corner help offer is off. **For the owner's own voice** ("the voice is still breaking", 2026-11-21): `VO_READ=1 npx tsx scripts/voiceover.mts <script>` writes a silent `<film>-for-voice.mp4` paced for a human reader (2.4 words/s, `VO_READ_WPS`) plus `-for-voice.srt` and `-for-voice-script.md` with each line's start/end second. Narration no longer names Protron or says "I" (owner: never "I'm Protron from ProtectedCentral"). Listing images: `scripts/appsumo-images.mts` → `marketing/appsumo/images/`. |
| 5 Platform film | **Re-briefed 2026-11-20**: section 2 is an *animated* marketing film of every feature, live and incubated. Being made from the drawn launch film (`marketing/launch-film`, v5): new Protron, trade growth service and medical billing scenes; the shop, Shorts, reviews, trades and medical billing say **Coming soon** on the window and in the words; 213 updates a month; lines re-written for Umbriel. Waiting for its voice, then render (README v5) and put it on the site with a sound button (LaunchFilm.tsx says it is silent today) |
| Demo films (2026-11-20) | Two long films beside the site clips, recorded with real AI: **AI Autopilot deep dive** (6 min 43 s — the board of five businesses, a new business workspace built in a conversation with Protron from chat to build, a workflow's canvas walked and dry-run, a workflow written by Edit with AI and switched on, agents, guardrails, approvals, activity, schedule, the daily re-plan, prospects, each client's site and funnels) and **Every module, AI first** (18 min — per module an AI chapter, then its site clip). Recipes are `film-*` in site-clips.mts (`film: true`: no 6-minute cap, master only); `npx tsx scripts/demo-film.mts <name> <ids…>` joins them into `marketing/demos/<name>.mp4` (git-ignored; both commands are in its header). Found while recording and fixed: Protron's replies cut off mid-sentence (thinking tokens ate the cap — lib/ai.ts `withThinkingRoom`), the product's name taken as the finder's place (`placeIn`), Brain and the sequence editor's Write with AI not using AI. Not yet on the site: the films are too long for a looping clip; the site's own clips still lack their AI chapters |

| Voiceovers (2026-11-20) | Owner chose **Umbriel**, Protron narrating. `scripts/voiceover.mts` (Google TTS `gemini-3.8-flash-tts` / `-lite-tts`; lines batched — the free key allows 10 speech requests a day per model — cut back into lines by local Whisper, `scripts/vo-align.py`, venv `/tmp/vo-venv`; the picture holds a frame where a line outruns its caption; cache `/tmp/vo-cache` keyed by model+voice+style+words). Scripts in `marketing/voice/scripts/`. **Done:** `autopilot-deep-dive` voiced (7 min 17 s, lite model). **Left, in this order** (each command resumes where it stopped and says when the day's quota is out): (1) `TTS_MODEL=gemini-3.8-flash-lite-tts VO_BATCH=14 npx tsx scripts/voiceover.mts marketing/voice/scripts/platform-ai-tour.json` (42 of 128 lines done); (2) the same with `appsumo-lifetime-deal.json` (9 new lines; run `npx tsx scripts/film-cards.mts marketing/voice/scripts/appsumo-cards.json` first if `/tmp/site-clips-master/as-*.mp4` are gone); (3) the drawn film, full model: `TTS_MODEL=gemini-3.8-flash-tts npx tsx scripts/voiceover.mts --lines marketing/launch-film/lines.json /tmp/lf/vo`, then its README's render steps. Use the same model for every line of one film. The masters in `/tmp/site-clips-master` are not in git — a fresh container must re-record them first (`docs/claude/site.md`) |
| AppSumo film (2026-11-20) | `appsumo-lifetime-deal`: only what the deal includes on the live app — AI Autopilot (the five deep-dive chapters), AI Prospecting, Contacts, Pipelines, campaigns, websites, booking, graphics, blog, agency, reports — between title cards (`film-cards.mts`), ending on a tier card read from `lib/allowances.ts` and "Not part of this deal: AI Shorts and video editing, and the online shop". A silent cut (19 min 14 s) is in `marketing/demos/`; voiced after step (2) above |

## Resume here (2026-11-23) — voicing one line per request

Owner chose **plan B**: the AI voice, **one line per request** (`VO_BATCH=1`),
so nothing is cut from a longer recording. `voiceover.mts` now also checks the
**finished film**: each line is cut back out where it sits and heard against
the script (`scripts/vo-check.py`); it prints `QA: all N lines heard clean` or
the lines to re-take, and writes `<film>.timeline.json`. The first test, the
2-minute `appsumo-short`, passed (14/14) after one fix: the first line of a
take is kept from the start of the audio, and trimming keeps a breath of
silence (a late-timed first word turned "One click" into "click").

Where things are (this cloud container only — not in git; a new session or a
reclaimed container loses them, the recipes re-make them):
- recorded chapters: `/tmp/site-clips-master/*.mp4` (39 files, incl. the
  short's excerpts `s-*` and cards `as-*`)
- voice cache: `/tmp/vo-cache/`; films: `marketing/demos/*.mp4`
- narration scripts (in git): `marketing/voice/scripts/appsumo-short.json`,
  `appsumo-lifetime-deal.json` (no "Protron"/"I" in the narration)

Next: the long film the same way —
`VO_BATCH=1 npx tsx scripts/voiceover.mts marketing/voice/scripts/appsumo-lifetime-deal.json`
(150 lines ≈ 150 requests: more than three free keys allow in a day — the
script moves to the lite model, then stops; run it again the next day and it
continues from the cache, or switch billing on for the key's Google project).
Delete the long film's cached lines first if they were voiced in batches.
