# Protron and AI Autopilot audit — 2026-11-14

The owner asked for an audit of Protron as the live site runs it and of AI
Autopilot's business workspaces, with a test of creating one by voice message
and by typing, so that AppSumo's reviewers do not hit a problem. This is what
was tested, what was found, what was fixed, and what still needs the owner.

## How it was tested

- **The real app**: the production build served by `wrangler dev` with a local
  D1. Signed in as a new trial customer each run.
- **The live app's switches**: the browser was pointed at
  `app.protectedcentral.com` mapped to the local Worker. The incubator
  (`features.ts`) is decided by the hostname, so live talk and Protron's "hands"
  were off, as they are on live. (The voice runs used `localhost`, because the
  browser grants a microphone only on a secure origin. The recording path is
  the same code on both.)
- **The AI was degraded on purpose, not by choice**: the only key available
  here is a free OpenRouter key, and its free models were rate-limited for most
  of the session. That is close to what AppSumo's reviewers met when the free
  Google quota ran out, so the fallback paths got a real workout. Gemini Live,
  real Whisper and real OpenAI transcription cannot run from this sandbox. They
  were replaced by local stand-ins that answer in the providers' own formats.
- **Widths**: 1280 and 390. Every run checked horizontal overflow, page errors,
  console errors and every failed `/api/` answer.

Paths driven end to end:

1. Dashboard → AI Autopilot → New business workspace → typed chat with Protron
   → "Create my smart optimized prompt" → Approve → questions → blueprint →
   Build → the business workspace opens.
2. The same with every answer sent as a recorded voice message (record, stop,
   play it back, check the words, send), at 390 px.
3. The floating Protron panel on the dashboard: a typed request, then a voice
   message, with the AI unavailable.

## The state of live today

- **app.protectedcentral.com runs `main` at `7e96e77`** ("Release Protron to
  the live app"). The three later commits are only on testing: the chat-first
  wizard and the incubator (`07891d9`), checking voice messages before sending
  (`58ec4b6`), and OpenAI transcription (`58d09c7`). So **live still shows the
  live-talk button the owner held back for "keeps on failing"**, and a voice
  message there goes out without being checked. Only **Actions → Promote
  testing to live** changes that, and only the owner runs it.
- **The testing site was not updated either**: deploy run #215 (`58d09c7`)
  failed on `test:ai-keys`. The new `lib/openai.ts` was not registered in
  `AI_CALLERS`.

## Findings and fixes

| # | Severity | Found | Fix | Verified |
|---|---|---|---|---|
| 1 | Critical | Staging deploy #215 failed: `lib/openai.ts` was missing from `AI_CALLERS` (lib/aiTools.ts), so testing never got the OpenAI-keys commit | Registered as a `caller` gated by `routes/intake.ts` (aiBudget) and the owner's `routes/aikeys.ts` | `test:ai-keys` 34/34 |
| 2 | High | `/api/ai.php` answered **500 "Something went wrong… PC-…"** when an OpenRouter model sent its headers and then stalled: the timeout fired in `res.text()`, outside the `try`. The prompt writer failed this way | The body read is inside the guard; that model counts as failed and the next one is tried | Prompt writer then fell back cleanly |
| 3 | High | **Voice messages were lost when the Google keys were spent and no OpenAI key was stored.** OpenRouter cannot hear audio, so the customer saw "Listening to recordings is not available right now" | Last fallback: Cloudflare Whisper on the Worker's own `AI` binding (`lib/video/transcribe.ts`). It needs no key, stays behind the same `aiBudget()`, and is told only the business name | Whisper stand-in → words in the box → sent. **Real Whisper is unproven until it is deployed** |
| 4 | High | With the AI coming and going, the fixed fallback questions **re-asked what had just been answered**: the name after "Azeem Dental — a family dental practice…" (seven words, so no name was taken), "What would you most like…first?" twice (the company name changed its wording), "Who are your customers?" after the AI had asked and been answered | `guessIntroFacts` also stops at a dash or colon, and takes the rest as what the business does. A fixed question counts as asked by its id (`Talk.fq`), its words, or its topic (`questionOf` + `topicOf`) | Typed and voice runs: no repeats. `test:live` L10 |
| 5 | High | The offline prompt **pasted Protron's whole greeting in as a question** ("Also from our conversation: Hi Azeem — I'm Protron…"), filed "Yes, that is all" under Customers, and used whole AI replies as headings | The answer to the opening is kept only for what it adds beyond the name and site, and never twice. Topics and notes are read from the question sentence only. "That's all" is not an answer | `test:live` L10. Run output checked |
| 6 | High | After the chat, the first wizard question was **"How should AI Autopilot learn about the business?"** (Read my website / Upload / Type it in), with 12 screens ahead, although Protron already had the name and what the business does | `extractKnown` reads Protron's `Company:` / `Business context:` / `Customers:` lines and fills the business as typed answers ("from your chat with Protron"), shown to correct | Voice run: **6 screens**, the business not asked. Built and opened |
| 7 | Medium | **On live, the dashboard said "Talk live — one-to-one with Protron"**, and its film said "press Talk live", though live talk is held back. The button opened a typed chat | Live only: "Chat with Protron — type or record", and the film's live-talk lines become chat lines (`FILM_SAY_CHAT`, which the narrator may also speak). Testing is unchanged | Hero text read on the live hostname |
| 8 | Medium | Panel without the AI: "set up a business workspace that brings in new patients" only opened AI Autopilot and dropped the words; "yes, propose the plan" answered "I could not tell which screen that is"; the reason was printed twice ("…itself..") | The offline matcher hands set-up requests, and a "yes / plan it" that follows one, to `start_autopilot_project`: the wizard opens with their words in its box. The reason is printed once | Panel run: the wizard opened with the instruction. `test:protron` P6 |
| 9 | Medium | Safari / iOS: the recorder's `AudioContext` is created after the permission prompt, outside the tap, and can start suspended. The take is then silent: "I couldn't hear that clearly" | `resume()` when suspended | Cannot be run here (no Safari). **Check on an iPhone** |
| 10 | Low | The wizard's recorder stopped after 2.2 s of silence and cut people off mid-thought | 3 s. Stop still ends it at once | — |
| 11 | Low | CI warned that Node 20 actions are deprecated | checkout, setup-node, upload-artifact and setup-java moved to v5 | Next deploy run |

## What works (checked)

- Typed chat → prompt → questions → blueprint → Build → the workspace opens,
  even with most AI calls refused. Every refusal is said in plain words ("Our
  AI is at capacity… this is on our side"), and the standard questions take
  over.
- Voice message in the wizard: recording strip and timer, then "Writing out
  what you said…". The words land in the box with "Here's what I heard — fix
  anything…" and a player for the recording. Nothing is sent until Send is
  pressed.
- Voice message in the panel: same, through the OpenAI path (the stand-in key
  was added through the owner's Platform services route).
- No horizontal overflow, page errors or console errors at 390 or 1280 in any
  run.

## Still open — needs the owner

1. **Promote testing to live** once the staging deploy for this work is green.
   Until then live has none of the fixes above, and none of the three earlier
   commits either.
2. **AI capacity** (checklist rows 52 and 58): turn on billing on the main Google
   project, add a second Google key and OpenRouter credit, and paste the OpenAI
   keys on both sites. Code cannot create quota. The fallbacks now read well,
   but the reviewer gets the best experience when the AI answers.
3. **Try one voice message on testing after the deploy.** With no OpenAI key
   there, the first one shows whether Cloudflare Whisper answers for real. If it
   says "transcription is not configured", the deploy token needs **Workers
   AI** (row 15).
4. **Not exercised here**: with the AI answering, the panel's plan card →
   **Approve the plan** → wizard. The free models were at capacity all
   session. The existing e2e suites cover it without the AI. Try it once on
   testing.
5. **Decide**: the dashboard film's chapter "Runs the app" shows Protron working
   the screens. That is the `protron-hands` behaviour held back on live, the
   same story the public site already hides on live.
6. **Model quality**: one free OpenRouter model asked two questions in one reply
   and offered example figures ("say, 15 new Invisalign starts"). The
   interview's rules forbid both. Gemini, live's first choice, was not seen
   doing it.
