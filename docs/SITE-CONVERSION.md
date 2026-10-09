# protectedcentral.com: conversion audit and the new funnel

Audited 2026-10-09 against the running site at 1440×900, 1280×800 and 390×844.
It covers the page, the sign-up screen and the first minutes in the app. What was
changed because of it is listed at the end, and the funnel is in CLAUDE.md
under "The public site's funnel".

## 1. The homepage, as a visitor meets it

**Clear**
- The product is real and is shown. Every picture is the running app, nothing
  invented: no fake testimonials, logos or figures.
- The trial terms appear in the hero, in pricing and in the closing call:
  7 days, no card.
- The security section names only things that are true (no "unhackable", no
  certification claimed).

**Confusing**
- The headline is "Run your agency | Resell it as your own". It speaks to
  resellers, but most visitors are a business that wants more customers or
  less busywork. The promise that actually differs from other tools
  ("describe the outcome and it builds the system") is only in the small pill
  above the headline and in the sub-line.
- There are eight nav anchors (Autopilot, AI Prospecting, Leads, Deals, Agency,
  Platform, Pricing, Security). The sections are named after the modules, not
  after what the visitor wants.

**Too technical**
- "Run on the server every five minutes", "Every third-party call is made from
  the server", "credentials are encrypted at rest and never returned to a page".
  These are true and good, but they are engineering claims placed where a
  buyer is still asking "what does this do for me".

**Too broad**
- The page tours 20+ modules: Contacts, Funnels, Websites, Social, Blog,
  Pipelines, Email, Forms, Calendar, Agency, Analytics, the agent chain, the
  cloud and the white-label tabs. The "Everything you would otherwise buy five
  times" wall restates them. Nothing helps a visitor find the one outcome
  they came for.

**Friction**
- Every call to action jumps straight to an account. A visitor who is not yet
  sure has no step between "read" and "create an account".
- The second hero button is a 5½-minute film. It's a big ask as the first
  alternative to signing up.
- After signing up, a new customer lands on an empty dashboard and has to find
  AI Autopilot → New project and describe their business again.

**Trust**
- The trust signals are honest but abstract. Two things that would reassure
  most are said nowhere near the buttons:
  - Nothing sends until you approve it.
  - You see exactly what will be built before anything exists.
- There's no FAQ. "What happens after I sign up?", "Will it email anyone
  without me?" and "What happens when the trial ends?" go unanswered.

**Missing**
- A way to say "this is my business, this is what I want" and see what would
  be built, before an account exists.
- Use cases named by outcome, with a "build this" next to each.
- Any measurement: there was no analytics of any kind, so nobody could tell
  where visitors stopped.

**Likely stopping trials**
- The headline is for a different audience.
- There's no low-commitment step.
- The wording is technical.
- The first screen after sign-up has nothing on it.

**Remove**: nothing wholesale. The module sections are the proof and stay.

**Move**
- The film stays one scroll down.
- The hero's second button becomes "Find my solution".

**Rewrite**
- The headline and sub-line.
- The CTA labels: one primary label, "Start free", everywhere, with "7 days
  free · No card required" under it.

**Keep unchanged**
- The screenshots.
- The launch film.
- The phone layout of the reels (the owner is happy with it).
- The security wording.
- Pricing.
- The logo strip.

## 2. Sign-up

- Sign-up opens on Google, then one email box and an instant code; the
  password form is one link away. It's already short. The heading says "Start
  your 7-day free trial" and the line says "No card needed". Good.
- What it loses is **context**. Arriving from the site, the visitor is asked
  nothing about what they wanted, and nothing they told the site exists on the
  other side. The two hosts are different origins (protectedcentral.com and
  app.protectedcentral.com), so nothing in the browser crosses over by itself.
- After sign-up, the app opens on the dashboard. A new workspace's dashboard
  is honest ("nothing yet"), which is right, but it is not a first value.

## 3. Mobile

- The hero, nav and film were fixed in the last round: the nav fits, and the
  9:16 film plays with square pixels.
- The sections are long. On a phone, the CTA appears only at the top of each
  chapter, so a visitor mid-section is a long way from any button.
- There was no questionnaire to judge. Any new one has to work one-handed:
  - full-screen
  - large cards
  - the primary button within thumb reach
  - nothing that needs hover

## 4. Messaging

- The site said **what it is** (modules) before **what it does for you**
  (outcomes).
- AI wording was mostly concrete. Keep it that way: no "revolutionary", no
  "10x".

## 5. Calls to action

There were seven different labels for one action:
- Start free trial
- Start your 7-day free trial
- Start free
- Try it free for 7 days
- Create your account
- Create an account
- Try free

Now there is one primary label, **Start free**, with its short form "Try free"
only where the nav must shrink. The secondary label is **Find my solution**.

## 6. Trust

- The four trust cards stay.
- What is added sits next to the buttons, and every line is true of the
  running product:
  - Nothing sends until you approve it.
  - You see the plan first.
  - Cancel any time, export your data.
- No customer counts or testimonials: there are none to show yet.

## 7. Analytics that existed

None. No tag, pixel or event of any kind: the only counts were the
affiliate click counter and the owner's sign-up list.

## 8. The AI Autopilot onboarding that already exists

`components/Autopilot/NewProject.tsx` has the flow this funnel needs:

1. **Describe**
2. **Understand**: the AI reads it, or words are matched to the catalogue
   without it.
3. **Questions**: only the missing ones.
4. **Blueprint**
5. **Connections**
6. **Review**
7. **Build**: real operations, real progress.

All of the judgement is in pure modules that run in any browser:
`services/projectIntake.ts` and `services/projectSolutions.ts`.

## 9. Project and workflow templates that already exist

- `projectSolutions.ts`: 19 solutions plus "custom", one shared question bank,
  and a `build` per solution that composes workflows from the template library
  (`workflowTemplates.ts`).
- `buildBlueprint` picks templates first and builds custom workflows only when
  none fit.
- Anything that emails or texts is built as a draft.

## 10. What is reused

- **Matching, extraction, question choice and blueprint:**
  `initialState`, `allQuestions`, `applies`, `screensOf`, `withDefaults`,
  `buildBlueprint`. The site runs the same code the app does, so what the
  visitor sees is what gets built.
- **Understanding:** the AI path of `/api/intake.php` `understand`, exposed
  without a session as `/api/site-plan.php`, rate-limited per address and per
  day, on the operator's key. Without it the site matches words and says so.
- **The build:** the app wizard's `runBuild`, unchanged: the same steps, the
  same drafts and the same guardrails.

## 11. The funnel now

```
Land  →  Find my solution  →  describe (type / speak / website / file)
      →  understood (AI, or matched words — said which)
      →  3–6 questions, only the missing ones, most with "Let AI decide"
      →  "Here's what Protected Central can build for you"
         (project, objective, agents, workflows drawn with their branches,
          expected outputs — no promised results)
      →  "Build this in my free account"  (7 days free · no card)
      →  sign up (Google / code / password) — the plan travels with them
      →  "Building your Protected Central project…"  (real steps)
      →  the project, its workflows, and its first output where there is one
```

Abandoning is safe:
- Progress is kept in this browser only (`pc_site_wizard`, 14 days), and
  "Continue where you left off" offers it back.
- Nothing is stored on a server before an account exists.
- No account is made without the visitor pressing the button.

## 12. Phases

1. Centre the section slideshows on desktop. They hung left from the third
   section on.
2. Audit (this file).
3. The site wizard, its public understanding endpoint, and the plan's journey
   through sign-up into an automatic build.
4. Funnel events and the owner's funnel report (Sign-ups & trials → Website
   funnel).
5. The page's hero, buttons, use cases ("Build this") and FAQ.
6. An end-to-end test of the eight journeys, at desktop and phone sizes.
