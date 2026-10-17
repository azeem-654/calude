<!-- Moved from CLAUDE.md, word for word: read this before working on ai autopilot: the execution layer, workflows, and the new business workspace wizard. -->

## Autopilot — the execution layer

`worker/src/autopilotTick.ts` drives the modules; `lib/autopilotPlan.ts` decides
what to drive. The planner is pure and takes a `Workspace` snapshot, which is
why it can be tested without a database — keep it that way.

**Customers call a project a "business workspace"** (the owner's word: each
project is a business). In user-facing text — labels, toasts, refusals,
emails — it is "business workspace" mid-sentence, "Business Workspace(s)" in
titles, tabs and buttons, and the collection is **AI Autopilot Business
Workspaces**. Never a bare "workspace": that already means the customer's
account (the switcher, sub-accounts), so a sentence naming both is reworded
("That business workspace is not one of yours."). Code, types, routes
(`/autopilot?project=`), API actions (`save_project`), tables and test ids
keep "project"; so does a video project in AI Video Studio, and the nav's
`aka` keeps "project(s)" so search still finds it.

- **`effect` is its own column, not `detail`.** `detail` is what happened,
  written at the end. They were once the same column, and approving an action
  erased what it was supposed to do; the tick then did nothing and marked it
  **Done**.
- **An `observe` action has nothing to carry out.** Sending one through the
  execution pass marks it Done, which reads as though Autopilot fixed the thing
  it was warning about.
- **Dedupe is "is there an open action with this summary".** That is right for a
  standing condition and wrong for a one-off act against one record — an order
  is still unpaid tomorrow. Those markers live on the record (`chased_at`,
  `thanked_at` on `crm_orders`), stamped only after the act succeeds.
- Guardrails (`'off' | 'approval' | 'on'`) decide whether an action waits for a
  person. `'approval'` is the default for anything that sends. The wizard sets
  them from the capabilities somebody picked (`guardrailsFor` in
  `src/services/projects.ts`) and sets everything unpicked to `'off'` — a
  project must not hold a permission its owner never saw. `kind` is derived the
  same way rather than asked, because it is the server's contract, not a
  question a customer can answer.
- **Projects keep the order the customer set.** `crm_projects.position`
  (migration 0071; 1 is the top): `save_project` gives a new one the
  workspace's lowest − 1, so it lands **on top**, and an edit never moves
  it; `reorder_projects` takes the whole order and refuses any id not this
  workspace's. Every list of projects (`listProjects`, revenue, the client
  portal) reads `ORDER BY position, created_at, id`. The board's divider line
  over each project carries Move up / Move down (optimistic, put back with the
  reason on refusal, then `refreshPulse`).
- **`autopilotPulse.ts` is the one reader of the board on the client.** The
  dashboard panel and the nav diagram both want it at once; without the shared
  cache each mounts its own fetch and the same question is asked four times a
  minute for an answer that changes every five. It keeps `unreadable` as its own
  state — "no projects" and "could not ask" look identical in a zero, and only
  one of them means the customer has nothing set up.

## A project's workflows

`Autopilot/WorkflowCanvas.tsx` draws each workflow as fixed-size boxes and an
SVG layer of links, in the owner's reference video's look
(`workflowGlass.css`): cards of stacked frosted glass (the sheets are stepped
shadows, so the size the connectors are computed from never changes) with a
title tab naming the step's kind and holding its pen, on a dotted, softly lit
ground, joined by thin blue threads with a soft glow — a soft S inside the
gap when a link changes row, a rounded corner on a No branch (pink), branch
labels as small glass chips. The gallery's compact previews keep their plain
cards. Positions come from `layout()` in `workflowNodes.ts`: Yes carries the
spine, every No gets a row of its own, and a row's forks are laid out from the
right, each with all its own branches first — so a No line dropping down its
condition's column never passes behind another step (`test:nodes` checks it
for every template).

## What a new project decides, and where

The wizard is `src/components/Autopilot/NewProject.tsx`: **describe → understand
→ only the questions still missing → blueprint (editable by sentence or voice)
→ connections → review → build**. `docs/AUTOPILOT-NEW-PROJECT.md` has the audit
of the fixed six-step wizard it replaced and why that one asked every project
about mailboxes. The judgement lives in pure modules:

- **`services/projectSolutions.ts`** — the solution catalogue (Social Media
  Growth, E-commerce Store, …), one shared **question bank**, and a `build` per
  solution that turns answers into workflows. **Every workflow it draws must be
  one the engine runs today** — agent graphs (`projectAgents.ts`) or contact
  graphs (`automationEngine.ts`). Anything asked for beyond that goes in
  `manual` or `limits`, never into a workflow that quietly does nothing.
- **`services/projectIntake.ts`** — matching a sentence to solutions,
  extracting what the prompt/files/workspace already answer, choosing the open
  questions, building the blueprint, and `parseEdit` for the commonest blueprint
  edits. The blueprint is a pure function of `IntakeState`; an edit — by the AI
  (`/api/intake.php` `refine`) or by `parseEdit` — changes the *answers* and the
  blueprint is rebuilt. Never let an edit write workflows directly.
  `npm run test:intake` covers the seven specified requests.
- **`worker/src/routes/intake.ts`** — `understand` (prompt + inline images/PDFs
  + up to three pages, on the operator's Gemini key), `refine`, `transcribe`.
  With no AI it answers `code: 'no_ai'` and the wizard says it matched words
  instead. Everything the model returns is checked against the catalogue the
  client sent.
- **`services/sendingPlan.ts`** — how much infrastructure a target needs, and
  what it might return. **`listKind` is the distinction everything turns on:**
  writing to people who asked to hear from you is one address on the domain they
  recognise, and writing to strangers is a pool of lookalikes. Recommending a
  pool to a shop would be selling it twenty-odd domains it does not need.
  Outcomes are ranges, always, and labelled as assumptions.
- **`services/launchPlan.ts`** — the build order per trade, still used where a
  trade is known; the new wizard's set-up steps become `launchSteps` the same way.

**`crm_projects.brief`** holds the approved blueprint and is shown on the
project's Overview. The server reads two fields of it. **`plannerChannels`**,
which `planNext` uses to drop plays in other channels — every play carries
`channels`. `null` (every project older than the brief) plans exactly as
before; `[]` means the project's own workflows do all the work. A project built
from the wizard is `general` far more often now, so without this a social-only
project would be planned email sequences and a "no mailbox" error. And
**`design.page`**, the layout and colours the planner's website and funnel plays
build in (`pageDesignOf` in `lib/designLayouts.ts`); absent, pages come out as
they always did.

**Design** — `services/designOptions.ts` is the catalogue (layouts per kind,
themes, `resolveTheme`); `lib/designLayouts.ts` on the Worker draws it (posts,
pages, email frames, article shapes). Design questions are not in any solution's
list: `designQuestions` adds them from the workflows the answers would build, so
a layout is only asked for something the project makes. Themes are resolved to
colours on the client and sent as colours — one palette table — and the text
colour is always computed from the background. `npm run test:design` fails if
the client offers a layout the server cannot draw. The logo lives on the
portfolio (`profile.logoUrl`, a ≤320px PNG made in the browser); posts and
emails carry a **signed** `/api/logo.php` address instead of the data URL.

**Pages start from a real template.** When a project builds pages,
`designQuestions` adds `pageTemplate`: a gallery of the Websites/Funnels
catalogue (`shared/pageTemplates.ts`) rendered by the builders' own renderer in
the client's name and theme colour (`buildTemplatePages(meta, ctx, { brand:
true })`). The pick is built by the wizard as a draft through `addWebsite` /
`addFunnel`; the planner only builds a page for a workspace with none, so it
does not add a second. `ai` falls back to the `pageLayout` question and the
planner's page. The blueprint shows `ResultPreview` — posts, the page, the
first email's opening — drawn from what the wizard knows, no AI call, and
labelled as a preview. T9 in `test:wizard` covers it.

**Every question helps.** *Here's what I understood* (`Understanding.tsx`)
has no solution dropdown: a correction box (`data-field="intake.correction"`)
sends the customer's words to `refine` (which may now return a `summary`),
and with no AI — or no change — the request is read again with the
correction appended; the ready-made solutions are one fold away. Typed
questions (audience, offer, kinds of business, places, topics, feel) show
**suggestions** (`newProject/Suggest.tsx`): the trade's offline ideas at once
(`services/answerIdeas.ts`, pure — a med spa is never offered "Amazon
sellers"), replaced by the AI's for this business when `/api/intake.php`
`suggest` answers (own allowance, 120/h); multi-select chips, free text, and
**Let AI decide**, which says why. "Find new ones for me every day" is the
lit, recommended contact source. Leaving the finder's last question stops on
**`FirstLeads.tsx`**: a live directory search, websites read, addresses
checked — the finder's own steps — with a box to correct who it looks for
(`refine` limited to `prospectTrades`/`prospectPlaces`, else `parseAsk`).
Nothing is saved there; the built finder starts with the same search.
The logo found on a site is approved with **Use this logo** (on the business
screen and the logo screen, preview 220×140). The colours screen adds a
**background picture** for the page (projects with a page only): a stock
photo for the trade (`stockPhotoFor`, Unsplash ids checked by eye), the
customer's own (`photoFromFile`, ≤1600px JPEG), or none — laid under a tint
in the first hero (`BrandContext.heroImage`, `withHeroImage`). The pages
question is **"Do you want a website or a funnel?"**: a funnel is
recommended (always when they already have a site), a website second, or
`none`, which also drops the planner's `site` play. Ten newer themes; email
layouts `photo` (the stock photo, `emailImage`), `video` (a YouTube link's
thumbnail and play button) and `card`, drawn by `wrapEmail`.

**Round two.** Choice questions with no fixed default get **Let AI decide**
too (`isOpenChoice` in Suggest.tsx: the AI picks one of the question's own
options through `suggest`, which now refuses anything else; offline, the option
the request's words point to — filler words ignored — and never a contact list
the workspace does not have). First leads carry what each business says it
does (`about`, its page description or first real sentence, from
`findContacts` — never model-written). The understood screen offers add-ons —
daily social posts, AI Shorts, SEO blog — each adding its solution. The
blueprint shows the page at full width (`BlueprintPreviews.tsx`: step tabs,
scrollable, full screen) and every email whole with sample merge values. The
plan's allowance is asked on the blueprint (a warning while a workflow can
still be removed) and again before the build writes anything
(`checkAllowance` for `autopilot_projects` and `workflows_per_project`).

**Researched emails** (`emailStyle`, group "How each email is written",
asked whenever a project sends email; default `researched`). The brief
carries `emailStyle`; the planner's sequences (`withResearch`) and the
wizard's follow-up workflow then open with `{{personalOpener}}` and
`{{theirChallenge}}`, written at send time from the prospect's own website
(`lib/prospectResearch.ts`: `readSite`, the operator's AI after `aiBudget`,
`cleanResearch` strips links, merge fields and pretend relationships;
`crm_email_research`, migration 0072, 30 days per address). Nothing specific
found, no site, a webmail address or no AI → both empty, and `personalise`
drops their lines, so the email reads as written. Social media is never read.
Replies to an enquiry never carry it. `npm run test:emailstyle` (pure).

The build (`newProject/buildRunner.ts`) performs real operations and the bar is
their weighted share. Content-agent workflows (scheduled, only `ai` steps,
nothing that sends) are switched on because the customer approved a blueprint
saying they run; anything that emails or texts stays a draft.

**Voice** is `components/Autopilot/voice/`: a 16 kHz WAV of the whole take
sent to `transcribe` for the text that goes in the box, and the browser
recogniser (told the customer's real locale, restarted across pauses) kept
only as the fallback text. **Its words are not shown while somebody speaks** —
they trailed the voice by a second or more and read as a broken recording.
Listening is shown by `VoiceBars.tsx` instead: bars drawn from the real level
of the same stream (`meter`, a ref written by the hook's frame loop, never
React state), a recording light and a clock; under reduced motion, one level
meter with no transition. AI Prospecting's `MicButton` holds five of the bars.
The text is always put in the box for review — never submitted.

The launch plan is **sent** with `saveProject` rather than recomputed on the
server, and becomes the checklist on the project's first card — so the board
cannot say something the screen the customer agreed to did not. Two
implementations of that list would drift the first time either changed.

**The AI key is the operator's — and there may be several.** `loadAiKey` tries the workspace's own key, then
the install's, then `env.AI_API_KEY`. The install's keys are a pool
(`lib/aiPool.ts`): the installation key, the owner's main key (the **Main AI key** card on Platform
services, `AiEngineCard.tsx` — no longer a Settings tab: customers are never asked
for a key), then the
owner's backups (Settings → Platform services → **AI keys**, `routes/aikeys.ts`,
table `crm_ai_keys`, migration 0059), then `AI_API_KEY`. `loadAiKey` returns the
first and files the rest under it; `askGemini*`, `researchWeb` and `/api/ai.php`
go through `withFailover`, which retries the same request on the next key when
the failure is the key's (429, 401/403, invalid/blocked/disabled key, 5xx, no
answer) and not when it is the request's (a plain 400). A failed key rests
(`crm_ai_key_health.cooldown_until`: 2 min rate limit, 1 h daily quota, 30 min
refusal) and goes to the back. Any new direct Gemini call must go through
`withFailover` too, or it skips the pool. `npm run test:aikeys` (self-contained:
Gemini mock on :8833 via `GEMINI_BASE`, wrangler :8822, fresh D1). Customers are not asked for one, and the
capability `needs` strings stopped mentioning it in the same commit that added
the fallback — removing the ask before supplying the thing would have been a
promise the product could not keep.
