<!-- Read this before working on Protron, the in-app AI business manager, or the Protron screens at the start of the New business workspace wizard. -->

## Protron — the AI business manager

The helmet in the bottom-left corner of every signed-in screen. Built
2026-11-11 from the owner's brief (the brief called it "NEXA"; the owner's
title and picture name it **Protron**).

```
src/components/Protron/Protron.tsx        launcher, offers of help, drag, opens the panel (in every page's bundle, ~3 KB face)
src/components/Protron/ProtronPanel.tsx   chat, action cards, voice — its own chunk, fetched on first open
src/components/Protron/ProtronAvatar.tsx  the SVG helmet and its states
src/services/protron/actions.ts           THE registry: every action, its tier, argument specs, permission
src/services/protron/brain.ts             one turn: /api/ai.php (module 'protron'), JSON reply, offline matcher
src/services/protron/knowledge.ts         what it knows: derived from navModel.ts + MODULE_NOTES + TROUBLESHOOTING
src/services/protron/memory.ts            conversation + prefs, per person × workspace, in this browser
src/services/protron/voice.ts             Speaker interface; browser speech synthesis
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
  prefs) runs at once; `confirm` (create a contact or pipeline, a prospect
  search that spends an allowance) waits for Confirm; `sensitive` (send,
  publish, delete, charge) — **none is registered on purpose**: Protron opens
  the screen and says which button to press. Adding one needs the owner's
  say-so and a test in `test/protron.test.mts`.
- **The model never sees the screen's data.** It is told the module's name and
  purpose, the page title and the business as the customer typed it. The one
  read action that returns data (`workspace_overview`) returns counts only.
- **Customer text is never in the system prompt.** It goes as user turns; the
  instructions say it is a request, not a rule. Worst case of an injection is a
  refused card.
- **No model id, no key in the browser.** `/api/ai.php` with module `protron`
  (task `write`) or `protron-plan` (task `reason`, the wizard's instruction) —
  counted, capped and allowance-checked there (`aiTasks.ts` MODULES).
- **Without the AI it still works, and says so.** `offlineTurn` maps "find X in
  Y", "open …", "where do I set up email" to registered actions; the header
  reads "Basic mode — AI not answering". The interview falls back to
  `FALLBACK_QUESTIONS`, the instruction to `draftInstruction`.
- **Knowledge is derived.** Module list, labels, purposes and visibility come
  from `navModel.ts`. When a module changes what it needs connected, change its
  line in `MODULE_NOTES` in the same commit.

### Placement and offers of help

Bottom left (bottom right is the Help widget and CornerHelp). Draggable; the
spot is remembered as a fraction of the window. While any `aria-modal` dialog
is open it shrinks to a tab on the middle of the left edge — the wizard's Back
button is bottom-left. Offers (`trouble` from fieldGuard, `loop` = the same
dialog opened 3× in 2 min, `idle` = 2 min untouched after 2 min on the screen,
tab visible): once per kind per screen per session, 10-minute cooldown, 3 a
day, never while the human-help card is up, off with "Don't offer again" or the
panel's menu. It only offers; it never acts on its own.

### Voice — turn by turn, not live duplex

In: the Autopilot recorder (`useVoiceInput`, now with `silenceStopSeconds`,
1.8 s for Protron) → server transcriber → sent; a transcript the engine doubts
goes in the box to check instead. Out: `browserSpeaker` (speechSynthesis). A
spoken question is answered aloud and the microphone reopens (hands-free);
typing, the mic or Stop interrupt. Recordings are not stored. A realtime
provider (OpenAI Realtime over WebRTC, Gemini Live) would plug in behind the
`Speaker` seam; it needs a provider key and a server-minted ephemeral token,
neither of which exists — do not label the current mode "live".

### Memory

`pc_protron_{chat|prefs}_<hash of email>_<active account>` in localStorage —
a different workspace or person is a different key. 60 turns. "Clear this
conversation" removes it. Server-side history was deliberately left out (a
second copy of every conversation to secure, export and delete).

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

`npm run test:protron` (pure, 67 checks: registry, permissions, tiers,
injection, JSON, offline matching, onboarding, memory, context).
`npm run test:protron:e2e` (needs the build and `wrangler dev`: launcher, panel,
confirm/cancel, navigation, persistence, context note, the whole onboarding to
Understand, at 390 and 1280).
