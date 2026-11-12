<!-- Read this before working on Protron, the in-app AI business manager, or the Protron screens at the start of the New business workspace wizard. -->

## Protron — the AI business manager

The robot face in the bottom-left corner of every signed-in screen. Built
2026-11-11 from the owner's brief (the brief called it "NEXA"; the owner's
title and picture name it **Protron**); the 2026-11-12 brief (below) gave it
a new face, a warm voice, business identity, workflow drafts, a pointer and
the public site.

```
src/components/Protron/Protron.tsx        launcher + Talk chip, drag, speaking first (idle/trouble/froze/loop), opens the panel
src/components/Protron/ProtronPanel.tsx   floating chat, live step cards, Undo, Talk mode, sync, audit — own chunk
src/components/Protron/ProtronAvatar.tsx  the SVG robot head, its 7 states, the mouth driven by voice loudness
src/components/Protron/ProtronCursor.tsx  the pointer overlay (services/protron/cursor.ts says where)
src/services/protron/identity.ts          pure: personal vs business email domain, known facts, what is missing, the first greeting
src/services/protron/facts.ts             reads session, workspace, Settings profile, onboarding, prefs → identity.ts
src/services/protron/level.ts             the voice's loudness for the face (no voice code imported by the face)
src/services/protron/actions.ts           THE registry: every action, its tier, argument specs, permission
src/services/protron/brain.ts             one turn: /api/ai.php (module 'protron'), JSON reply, offline matcher
src/services/protron/knowledge.ts         what it knows: derived from navModel.ts + MODULE_NOTES + TROUBLESHOOTING
src/services/protron/memory.ts            conversation + prefs, per person × workspace (browser copy, sync stamps)
src/services/protron/sync.ts              /api/protron.php: load/save/clear, audit, speak
src/services/protron/screen.ts            reads the screen's shape (labels, empty boxes, messages); fills boxes live
src/services/protron/voice.ts             Speaker seam; warm voice (default, clean AI speech); commander (robot filter); device voice
public/protron.svg                        the idle face, generated from ProtronAvatar.tsx, for the public widget
worker/src/routes/protron.ts              the server side of sync.ts; migration 0094 crm_protron_threads
src/services/protron/intake.ts            the wizard's cards, interview and instruction writer
src/components/Autopilot/newProject/ProtronIntake.tsx   the wizard's first screens
```

### Rules

- **The model proposes; `checkCall` decides.** A reply's actions run only if
  the name is in `ACTIONS`, every argument passes its spec (enums are computed
  per login — owner-only modules and the Platform services tab are not even
  offered to a customer), and confirm-tier ones have been confirmed. A card is
  checked again when Confirm is pressed. Never add a handler that calls the
  server on its own authority: handlers call the same client service the
  screen's button calls, so `canAccess`, allowances and tenancy apply.
- **Tiers.** `read` (navigate, count) runs at once; `reversible` (Protron's own
  prefs; `fill_form` and `draft_social_post`, which type into a form without
  saving — the card offers Undo) runs at once; `confirm` (create a contact or pipeline, a prospect
  search that spends an allowance) waits for Confirm; `sensitive` (send,
  publish, delete, charge) — **none is registered on purpose**: Protron opens
  the screen and says which button to press. Adding one needs the owner's
  say-so and a test in `test/protron.test.mts`.
- **The model sees the screen's shape, never its data.** It is told the
  module's name and purpose, the page title, the business as the customer
  typed it, and SCREEN (`screen.ts`): headings, the form's boxes (label, kind,
  empty/filled, required — never the value), messages on show, button names.
  Password, card, key and token boxes are neither read nor fillable. The one
  read action that returns data (`workspace_overview`) returns counts only.
- **Customer text is never in the system prompt.** It goes as user turns; the
  instructions say it is a request, not a rule. Worst case of an injection is a
  refused card.
- **No model id, no key in the browser.** `/api/ai.php` with module `protron`
  (task `write`) or `protron-plan` (task `reason`, the wizard's instruction) —
  counted, capped and allowance-checked there (`aiTasks.ts` MODULES).
- **Without the AI it still works, and says why.** `offlineTurn` maps "find X
  in Y", "open …", "where do I set up email", "draft a post about X" to
  registered actions; the header reads "Basic mode — <reason>" (no key
  answering, allowance, busy, empty answer).
- **Output budget 4,096.** At 900, Google's thinking models spent the budget
  thinking and returned nothing or half a JSON — that, not the keys, is why
  testing showed Basic mode (fixed 2026-11-11). A cut-off reply is salvaged.
- **Live, step by step.** A handler that does more than one thing reports
  `steps`; the card ticks them off while the screen changes (a pipeline's
  stages arrive one by one on the Deals board; boxes are typed into one at a
  time, lit, the panel stepping out of the way). Each settled card except a
  plain navigation is written to `crm_audit_events` (kind `protron_action`). The interview falls back to
  `FALLBACK_QUESTIONS`, the instruction to `draftInstruction`.
- **Knowledge is derived.** Module list, labels, purposes and visibility come
  from `navModel.ts`. When a module changes what it needs connected, change its
  line in `MODULE_NOTES` in the same commit.

### The 2026-11-12 brief — what was built, and the rules it added

- **The face** is an original humanoid robot head (titanium cranium, crest,
  lighter face plate, arched brows, round cyan eyes, ear receptors, neck) —
  film-robot *engineering* as inspiration, no studio's character. The resting
  mouth is one lit smile; speaking, seven segments follow `level.ts`
  (measured from the audio playing, or the browser voice's word boundaries) —
  never a timer. Below 36 px (`lite`) the glow filter and fine seams go.
  `public/protron.svg` is rendered from the component; regenerate, don't edit.
- **The voice**: `warm` (default) — prebuilt voice `Achird` with a friendly,
  conversational direction, played without a filter. `normalisePrefs` moved
  every stored `commander` with no `v: 2` to warm once (it was the default,
  not a choice); chosen afterwards it stays. Spoken turns tell the model "one
  or two sentences, under 35 words"; Talk mode ends a turn after 1.2 s of
  silence (dictation 1.8 s). Each spoken reply shows **measured** timings
  (heard / answered / speaking-in) — `Turn.timing`; never estimate them.
- **Identity**: the model gets a KNOWN block (`describeFacts`). An email
  domain is a clue: protron.php `site` looks **only at the session's own
  domain** (never one from the body — it would be an SSRF), through
  readSite's fence, 8 s, webmail never fetched; a page that answered is
  offered as "Is that your business?", nothing answering is never "no
  website", and Gmail is never "no business". Facts land in
  `Prefs.business` only through `update_business_profile` (what the customer
  said or agreed to). Sign-up stays three boxes; the missing questions
  (own business / agency / independent, name, what they do, website) are
  asked by Protron one at a time. The wizard's first screen prefills a known
  business name and greets by first name.
- **New actions**: `create_workflow_draft` (confirm) — a gallery template
  only, into a business workspace of theirs (`listProjects`; on screen, or
  the newest), **one real `save_workflow` per step** (`partialGraph` cuts
  links to steps not yet added), always a draft, refused part-way = reported
  as partial; the canvas refreshes on `pc-protron-workflow`.
  `list_business_workspaces` (read, feeds back names/status/ids — the one
  exception to "counts only", nothing inside them) and
  `open_business_workspace` resume work instead of starting a duplicate.
  `update_business_profile` (reversible). `find_prospects` now **waits for
  AI Prospecting's own `pc-prospecting-results`** and reports the real count;
  no report = not a success. It finds businesses: the prompt steers consumer
  requests to funnels/contacts. Importing stays the customer's button.
- **The pointer** (`cursor.ts`): moves only when an action points at the
  element it touches (nav link, the box being typed into, the results
  count, the workflow step just saved via `data-node-id`); never clickable;
  fades on `pointerDone` (called when every card settles).
- **Public site**: the house widget's built-in assistant is Protron
  (`HOUSE_AGENT`, `PROTRON_GREETING`): qualifies one question at a time,
  points to `app…/signup` or a strategy call, says it is an AI and that it
  cannot see accounts. The config sends `agent.avatarUrl` = `/protron.svg`
  for the house widget only; widget.js draws that face on `ai` messages
  (`botFace`) — a customer's widget is unchanged.
- **Not built, on purpose**: sending, activating a workflow, importing,
  buying — still the customer's buttons. (Realtime speech-to-speech was
  built on 2026-11-12 for the wizard — below.)

### Real-time speech-to-speech in the wizard (2026-11-12)

`services/protron/live.ts` (browser) ⇄ `/api/live.php` (`routes/live.ts`, a
WebSocket proxy) ⇄ Gemini Live `BidiGenerateContent`. The mic goes through
`public/live-mic-worklet.js` (a static file: the CSP allows scripts from
'self' only, so no Blob worklet) at 16 kHz PCM; 24 kHz PCM comes back and is
scheduled chunk after chunk; `interrupted` stops every queued chunk
(barge-in). Captions are the session's own transcriptions; each final one
becomes a `brief.talk` turn, so the transcript *is* the interview the prompt
is written from.

- **The proxy owns the session**: key, model (from the key's own list,
  `bidiGenerateContent`, native audio first — `liveModels`), `LIVE_SYSTEM`
  and `LIVE_TOOLS` never leave the Worker. `allowedFromClient` passes only
  `realtimeInput`, `toolResponse` and user-role text `clientContent`; a
  `setup` or a model turn from the page is dropped.
- **Who**: session cookie, `Origin` must be this site (cross-site WebSocket
  hijacking), `canAccess` on `?accountId=`. In `test:security`.
- **Cost**: `aiBudget` at start and every further 2 minutes; 10 minutes a
  session; refused or failed = refunded and the reason said. Google keys only;
  OpenRouter-only installs answer `no_live` and the typed interview carries on.
- **Tools**: `set_business_details` (name / website / nature — a website is
  read with projects.php `read_url` and the reading goes back in the tool
  answer, so Protron suggests where the customers are) and
  `finish_interview`. `test:live` (pure) covers the filter, the model choice,
  the instructions and the first screen.

### The first screen and the interview (2026-11-12)

The name step is **"Create a new business workspace"**: company name, company
website (read as soon as it settles — the state chip sits beside the box's
tag), and with no website (or one that could not be read) **"what the
business does"** (`brief.nature`). `Brief` gained `website`, `nature`, `site`
(the reading: description, audience, offer, industry, locations — never
model-invented). **Location is its own question**: the website's places are
offered as quick answers (`placeQuick`, `sitePlaces`), else it is asked
openly with no invented town; the AI interview is told the same. The talk
step is drawn as a chat on a slowly drifting lavender ground (`.np-chat`,
reduced motion = still), and its footer button reads **Create my smart
optimized prompt for AI Autopilot**; the prompt screen is "Your smart
optimized prompt for AI Autopilot". The instruction carries `Website:` and
`Where our potential customers are:` lines.

### Placement and speaking first

The helmet starts bottom left (bottom right is the Help widget and
CornerHelp) and drags anywhere; its spot is remembered as a fraction of the
window. The chat floats beside it (right of it when there is room, else
left, clamped), is dragged by its header, sits above app dialogs (z 3000,
below confirmations and toasts at 4000+) and on a phone is the whole screen,
dropping to the bottom 44 % while a card works. While any `aria-modal`
dialog is open the helmet shrinks to a tab on the middle of the left edge —
the wizard's Back button is bottom-left. The small chip on the helmet opens
Talk mode.

**Speaking first** (the owner's brief, 2026-11-11): after 10 s untouched
(menu: 10 s / 30 s / 2 min / off), when something fails (`TROUBLE_EVENT` or an
uncaught error), when the page froze > 4 s, or the same dialog was opened 3×
in 2 min, the panel opens and `thinkAhead` writes an opening from SCREEN —
what they seem to be doing, what may be in the way, 2–3 suggestions; it may
propose only `open_module`/`open_settings`. Once per screen per visit, ≥ 45 s
apart, ≤ 30 a day, tab visible, not over the human-help card; "Don't start
chats" on the message turns it off. It offers; it never acts on its own.

### Voice — commander voice, Talk mode, turn by turn

In: the Autopilot recorder (`useVoiceInput`, 1.8 s silence) → server
transcriber → sent. Out: `commanderSpeaker` (default) — `/api/protron.php`
`speak` asks a Gemini speech model picked from the key's own list (`tts` in
the name, Flash first; prebuilt voice `Algenib`, a deep, slow robot-commander
direction) and the browser plays the 24 kHz PCM through a WebAudio robot
filter (rate 0.94, 52 Hz ring modulator, 8.5 ms comb with feedback, chest
shelf, soft clip, compressor). Its own voice, in the spirit of a heroic robot
leader — not a copy of any actor or character. Each spoken reply is one AI
request on the plan. An OpenRouter-only install has no speech model: it says
`no_voice` once and the browser's deepest voice (pitch 0.45) is used.
`natural` = the browser voice. **Talk mode**: hands-free loop (listen → send
→ speak → listen) with barge-in (an echo-cancelled mic meter while it speaks;
~⅓ s of talking stops it). Still turn by turn — a realtime provider would
plug in behind `Speaker`; do not label it "live".

### Memory

`pc_protron_{chat|prefs}_<hash of email>_<active account>` in localStorage
(60 turns) **and** `crm_protron_threads` (one row per account × user_email,
≤ 200 KB, prefs without the launcher's spot). Load on open: the server's copy
wins when its `updated_at` is newer than this browser's stamp; a local change
is saved 1.5 s after the last turn. Clearing removes both. Closing a workspace
removes its rows (closeWorkspace finds `account_id`); a member deleting their
account removes theirs by email. Not in the workspace export (it would hand
the exporter other members' chats).

### The wizard's first screens

`NewProject.tsx` starts on `ProtronIntake` unless it was opened with something
to say (`presetListId`, the site's plan, Protron's `seedPrompt` hand-off),
which start on the original box. Steps: company name → ten ready-made cards
(`START_CARDS`, each mapped to catalogue keys; the other catalogue entries one
fold away; any number) + own instructions + "Ask Protron to recommend" →
interview (≤5 questions, quick answers, skip) → the instruction (edit, add,
write again) → **Approve and continue** puts it in the box with `pickedKeys`
and calls `runUnderstanding(prompt, keys)` — the same Understand step a typed
request takes. Several chosen keys now outrank the AI's matching in both the
AI and the no-AI branches. "I'd rather describe it myself" opens the old box;
the e2e suites that drive the box press it first.

Hand-off from the panel: `start_autopilot_project` writes
`sessionStorage.pc_protron_handoff` and goes to `/autopilot?new=1&from=protron`;
`Autopilot.tsx` reads it once (at mount and on later navigation).

### Tests

`npm run test:protron` (pure, 141 checks — P11 is the 2026-11-12 brief: registry, permissions, tiers,
injection, JSON and salvage, offline matching, onboarding, memory and sync
stamps, context and SCREEN, fill_form/draft_social_post/live pipeline steps,
speaking first offline). `npm run test:protron:e2e` — now also
`protron-brief.e2e.mjs` (the face, the Gmail greeting, the voice menu, a
workflow draft built into a real business workspace with D1 checked, the
pointer, 390 and 1280); (needs the build and
`wrangler dev`; no AI key needed): the original suite, then
`protron-live.e2e.mjs` — speaks first after 10 s, floats beside a dragged
helmet, header drag, Talk from the helmet, a social post typed into Graphics
Designer with 4 steps and Undo, the conversation on a second browser, the
audit rows, at 390 and 1280. `npm run test:security` covers
`/api/protron.php` (foreign workspace, no session, size cap, audit actor, the
`site` check reading only the session's domain). `test:chatlive` checks the
widget draws Protron's face on the assistant's greeting.
