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

None right now.

## Released

When a feature leaves this list, note here when and why, in one line.

- **`protron`** — Protron's floating chat, live talk, plan-then-build and its
  pointer — released to live on 2026-11-13 at the owner's request ("switch it
  on for live"), after the one-voice and live-session fixes. Its test notes
  are kept in git history (this file before that date).
