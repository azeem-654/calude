# Kept on the testing site by choice

Things that are built, deployed to **both** sites, and switched on only on
**testing.protectedcentral.com** (and on a developer's machine). The live app,
app.protectedcentral.com, runs the same code with them switched off. Kept here
so that nobody — the owner, or a future session — promotes something believing
it is live, or switches one on without the testing it was held back for.

## How the switch works

`src/services/features.ts` → `REHEARSING`. A name in that list is on where
`isRehearsal()` is true (the testing site, `localhost`, `*.workers.dev`
previews — `src/services/hosts.ts`) and off on the live app. It is decided by
the address in the browser, not at build time, so one build serves both.

**To send one live:** take its name out of `REHEARSING`, delete its section
below, push to `staging`, check it on the testing site once more, then
**Actions → Promote testing to live**. Nothing else changes.

## Held back now

### Protron's floating chat and Talk mode — `protron`

Held back by the owner on 2026-11-12, to be tested properly first.

- **What is off on live:** the round Protron button on every signed-in screen,
  its chat panel, Talk mode (speak and be answered aloud), the commander voice,
  "speaking first", Protron filling in forms on screen, and its kept
  conversations. Everything under `src/components/Protron/` that
  `App.tsx` mounts behind `featureReady('protron')`.
- **What is live, and not affected:** Protron's first screens in **AI Autopilot
  → New business workspace** (company name → recommended solutions → a short
  interview → the instruction). The owner chose to send those live. They use
  `/api/ai.php` and `/api/intake.php`, not the floating chat.
- **Server side:** `/api/protron.php` (speech, kept conversations, the action
  audit) is deployed on live but nothing on the live app calls it.
- **What to test on the testing site before releasing it** (signed in, at a
  laptop and a phone width):
  1. Open Protron on several screens; ask it to do something (create a
     contact, start a business workspace, show a pipeline) and confirm it asks
     before acting, and that the action really happened.
  2. Talk mode: speak, hear the answer, and that it listens again. With
     "Read replies aloud" on, a reply costs one more AI credit; check the
     Usage card counts as expected.
  3. Use the voice until Google's free voice allowance runs out (about 40
     replies a day across the four voice models): Protron should fall back to
     the browser's voice and **writing elsewhere in the app must keep
     working** — the bug where a spent voice quota benched whole AI keys was
     fixed on 2026-11-11.
  4. Reload and sign in on another device: the conversation is still there.
  5. Nothing scrolls sideways at 390 px; no errors in the browser console.
  6. (2026-11-12 brief) The new robot face looks right on the launcher, the
     panel and Talk mode; the warm voice sounds friendly and its mouth moves
     with the words; signed up with a company address, Protron asks whether
     the site at that domain is yours rather than assuming it.
  7. Ask it for "an email follow-up workflow" in a business workspace:
     confirm, watch it build step by step, and check the workflow is a
     **draft** that sends nothing until you switch it on.
  8. Ask it to find businesses somewhere: the count it reports matches the
     AI Prospecting screen, and nothing reaches Contacts until you save it.
- **Not held back:** the public site's assistant is now named Protron with
  its face (the owner's help button, `houseKnowledge.ts`). That widget is
  live on both sites, so promoting this changes the live site's chat too.

## Released

None yet. When a feature leaves this list, note here when and why, in one line.
