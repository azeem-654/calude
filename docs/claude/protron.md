<!-- Read this before working on Protron, the in-app AI business manager, or the Protron screens at the start of the New business workspace wizard. -->

## Protron — the AI business manager

The helmet in the bottom-left corner of every signed-in screen. Built
2026-11-11 from the owner's brief (the brief called it "NEXA"; the owner's
title and picture name it **Protron**).

```
src/components/Protron/Protron.tsx        launcher + Talk chip, drag, speaking first (idle/trouble/froze/loop), opens the panel
src/components/Protron/ProtronPanel.tsx   floating chat, live step cards, Undo, Talk mode, sync, audit — own chunk
src/components/Protron/ProtronAvatar.tsx  the SVG helmet and its states
src/services/protron/actions.ts           THE registry: every action, its tier, argument specs, permission
src/services/protron/brain.ts             one turn: /api/ai.php (module 'protron'), JSON reply, offline matcher
src/services/protron/knowledge.ts         what it knows: derived from navModel.ts + MODULE_NOTES + TROUBLESHOOTING
src/services/protron/memory.ts            conversation + prefs, per person × workspace (browser copy, sync stamps)
src/services/protron/sync.ts              /api/protron.php: load/save/clear, audit, speak
src/services/protron/screen.ts            reads the screen's shape (labels, empty boxes, messages); fills boxes live
src/services/protron/voice.ts             Speaker seam; commander voice (AI speech + WebAudio robot filter); browser voice
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

`npm run test:protron` (pure, 99 checks: registry, permissions, tiers,
injection, JSON and salvage, offline matching, onboarding, memory and sync
stamps, context and SCREEN, fill_form/draft_social_post/live pipeline steps,
speaking first offline). `npm run test:protron:e2e` (needs the build and
`wrangler dev`; no AI key needed): the original suite, then
`protron-live.e2e.mjs` — speaks first after 10 s, floats beside a dragged
helmet, header drag, Talk from the helmet, a social post typed into Graphics
Designer with 4 steps and Undo, the conversation on a second browser, the
audit rows, at 390 and 1280. `npm run test:security` covers
`/api/protron.php` (foreign workspace, no session, size cap, audit actor).
