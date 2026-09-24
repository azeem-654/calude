# AI Autopilot — the New Project wizard

What was there, why it behaved the way it did, and what replaced it. Written
before the rebuild (the audit) and kept afterwards, because the reasons are the
part that stops the next change from quietly putting the old shape back.

---

## Part 1 — the audit (2026-09-24, before any change)

### 1. How the old wizard worked

`src/components/Autopilot/NewProject.tsx`, six fixed steps:

1. **"What is going wrong right now?"** — seven complaints from
   `services/projectJobs.ts` ("the phone has gone quiet", "a list you never
   contact"…) plus an "I know exactly what I want" escape hatch exposing six
   capability switches. Each job maps to a fixed set of `Capability` values
   (`find | email | sms | content | book | shop`).
2. **"Whose business is this for?"** — pick one of six `INDUSTRIES` from
   `services/sendingPlan.ts` (all sales verticals), then choose or describe a
   client portfolio (website / paste / type).
3. **"What would make this worth it?"** — name, objective, goal chips, revenue.
4. **"Your sending setup"** — domains × mailboxes × per-day sizing, a revenue
   forecast, mailbox readiness, and "buy / have / later". This press saves the
   project.
5. **"Domains and mailboxes"** — `DigitalSetupStep`, buying the pool.
6. **"Autopilot is building it now"** — `ProjectProgress`, polling the board.

### 2. Why it behaved like a cold-email wizard

It was one, by construction:

- Every job but one includes `email`, and six of seven are phrased as
  sales complaints. There is no job for "make me a post a day" or "build me a
  shop from this catalogue" that does not also carry email.
- The trade question offers six sales verticals whose only purpose is to pick
  reply-rate assumptions for the forecast on step 4.
- Step 4 always rendered, whatever was picked — a content-only project still
  saw the sending-setup screen and a revenue forecast in replies and meetings.
- The steps are a fixed array (`STEP_NAV`), so the only way to vary questions
  was to add more steps to everybody.

### 3. What already existed

| Thing | Where | Notes |
|---|---|---|
| Projects | `crm_projects`, `routes/projects.ts` | `kind`, `guardrails`, `goals`, `launch_steps`; no free-form brief column |
| Client portfolios | `crm_portfolios` | profile JSON; `read_url` / `read_text` draft one with AI |
| Project workflows | `crm_project_workflows`, `routes/autopilot.ts` | `save_workflow`, `build_workflow` (AI, capped 20/day), drafts by default |
| AI agents | `ai` nodes in a *scheduled* workflow, `lib/projectAgents.ts` | read portfolio / website / web search / RSS / YouTube; produce `social`, `blog`, `email_campaign` drafts; cadence hourly / daily / weekly / monthly |
| Templates | `components/Autopilot/workflowTemplates.ts` | 33 templates on 8 shelves, each a real node graph |
| AI | `worker/src/lib/ai.ts` | Gemini only; `askGemini` is text-in / JSON-out; the operator's key is the fallback |
| Planner | `lib/autopilotPlan.ts` | pure; plays filtered by `kind` only |
| Products | `crm_products`, `routes/commerce.ts` `save_product` | accepts `imageUrl` as a data URI, `projectId`, `category`, `sku` |
| Voice | `components/Autopilot/VoicePrompt.tsx` | browser `SpeechRecognition` only |
| File storage | — | none: no R2, no upload route; images travel as data URIs |

### 4. What can be reused safely

The portfolio reader, `save_project`, `save_workflow`, the template graphs, the
agent engine, `save_product`, `DigitalSetupStep` for buying a pool,
`checkReadiness`, `WizardChrome`, `AutopilotBot`, and the whole project page.
Nothing in the engine needed replacing; what was wrong was the front door.

### 5. How projects and workflows relate

A project is one row in `crm_projects`. Its workflows are rows in
`crm_project_workflows` keyed by `project_id`. A workflow is a node graph; a
graph whose trigger is `event: 'schedule'` is run by `projectAgents.ts` (its
`ai` nodes are the "agents"), anything else by `automationEngine.ts` one contact
at a time. The planner (`autopilotTick.ts`) separately writes cards per project
from `kind` and the workspace's data.

### 6. How templates work

Plain data. Adding one is `saveWorkflow(projectId, {name, description,
status: 'draft', nodes}, key)` — the same inline call in three places. No
template is ever switched on by being added.

### 7. How voice worked

`new webkitSpeechRecognition()` with `continuous = true`,
`interimResults = false`, `lang = document.documentElement.lang` and no
`onend` restart. Whatever was final was appended straight into the box.

### 8. Why it misheard

- **`lang` was `"en"`** (`index.html` is `<html lang="en">`). Chrome maps a bare
  `en` to its US model; British, Indian, Nigerian, South African and Australian
  speakers were being decoded against the wrong acoustic model.
- **No interim results**, so nobody saw what it heard until it was already in
  the box — and nobody could stop a bad take early.
- **No restart on `onend`.** Chrome ends a session after a few seconds of
  silence (and after about a minute regardless), so a natural pause ended the
  recording and everything after it was lost.
- **Android's continuous mode repeats itself** — each result is the whole
  utterance so far, so appending finals duplicates phrases.
- **Browser-only.** Firefox has no recogniser at all, so the button did not
  render; Chrome's recogniser is a server-side Google model that cannot be
  given context and does no punctuation.
- **Nothing was reviewed** — text went straight in and was sent with the
  prompt.

### 9. What had to change

1. A describe-first entry with attachments and solution cards.
2. Understanding (AI, with a deterministic fallback) before any question.
3. Questions generated per project from a question bank and from what is
   already known — nothing email-shaped unless the project sends email.
4. A blueprint the customer approves and can edit by text or voice.
5. Requirements derived from the blueprint, not from a fixed list.
6. A build that performs the real operations and reports each one.
7. The planner told what a project is *for*, so a social-only project stops
   being planned as `general` — which plans everything, email included.
8. Voice rebuilt: the right locale, live interim text, restart across pauses,
   server transcription on the operator's Gemini key, and a mandatory review.

### 10. Migration risks

- **Existing projects must plan exactly as before.** The new `brief` column
  defaults to `'{}'`, and the planner only narrows plays when a brief says
  which channels it owns. No existing row has one.
- **The first card's launch plan** is still sent with `saveProject`.
- **Old e2e tests** (`wizardPlan`, `wizardBuy`, `launchOrder`, `wizardLook`)
  drove the old step names; they are rewritten or retired.
- **AI unavailable** (no key, quota, local dev): every AI step has a
  deterministic path, and says which one it used.

### 11. Phases

Followed in the requested order: prompt + attachments + cards → understanding
and dynamic questions → template matching → blueprint + edit → voice →
requirements → real build progress → project page → tests.

---

## Part 2 — what it is now

See the comments at the top of each file; this is the map.

| File | Job |
|---|---|
| `src/services/projectSolutions.ts` | The solution catalogue: cards, keywords, the question bank each one draws from, and the workflows it builds |
| `src/services/projectIntake.ts` | Pure: match a request to solutions, extract what is already known, choose questions, build and edit a blueprint, derive requirements and the build plan |
| `src/services/intake.ts` | The API client for `/api/intake.php` |
| `worker/src/routes/intake.ts` | `understand`, `refine`, `transcribe` — Gemini with inline files and audio |
| `src/components/Autopilot/newProject/*` | The wizard's screens |
| `src/components/Autopilot/voice/*` | The voice hook and its UI |
| `worker/migrations/0048_project_brief.sql` | `crm_projects.brief` |

### Where things are deliberately honest

- **Social content is not published.** Every social workflow ends in the Social
  Creator as a draft marked for the customer to publish by hand, and the
  blueprint says so under *Manual actions*.
- **"Image post" means a branded design** with the headline set on it, not a
  generated photograph — that is what `designFromPost` makes.
- **Imported products are drafts.** Nothing goes on sale until somebody sets a
  price they stand behind and switches it on.
- **Workflows that send stay drafts.** Content agents, which only write drafts,
  are switched on when the customer approves the blueprint that says they will
  run; anything that emails or texts waits for a person.
- **Understanding without AI says so.** The screen names whether it used the
  AI or matched keywords, rather than presenting a guess as comprehension.

### What was borrowed from other products, and what was not

- **Describe it first, with templates underneath** (Zapier Copilot, Power
  Automate's "describe it to design it"). Both open on a sentence and generate a
  draft; both tell you to treat the draft as a first draft. Kept: the sentence
  box is the front door and the cards are a shortcut, never a gate.
- **Show the connections a flow needs, and only those** (Power Automate reviews
  "connected apps and services" before it creates anything). Kept as the
  Connections step, derived from the blueprint.
- **Human-in-the-loop as a first-class step** (Relay-style approvals). Kept as
  the blueprint's *Human approvals* and *Manual actions* sections — said before
  the build, not discovered after.
- **Run history with each step's output** (Zapier task history, n8n
  executions). Already here as agent runs; the Overview now leads with the
  latest outputs, each a link to the real record.
- **Not borrowed:** a node canvas as the first screen. Every one of those
  products opens a builder too early for somebody who has not yet decided what
  they want; here the canvas exists after the business intent is understood.

### Tested

- `npm run test:intake` — 96 assertions over the seven specified requests,
  including the negative ones (no sending questions for social, blog or shop).
- `npm run test:autopilot` — the planner's focus filtering.
- `node test/newProject.e2e.mjs` — 79 browser assertions against the real
  Worker and a local D1, at 1280 px and 390 px: all seven requests end to end
  (questions asked, blueprint, edits, connections, build, landing on the
  project), a three-product CSV import, mailbox "set one up" leading to the
  domain shop, and voice — listening, stop, an unusable take reported rather
  than submitted, and nothing looping under reduced motion.

Locally there is no AI key, so the end-to-end run exercises the fallback path.
The AI path (`understand`, `refine`, `transcribe`) is checked on the server for
shape and validation, but its quality can only be judged on an install with a
key — staging, once item 14 of the owner checklist is done there.

### Known limits, said rather than hidden

- Social posts are prepared, not published; there is no social-network
  connection in this product.
- Products import from CSV. Shopify and WooCommerce are not connected
  directly; both export a CSV the importer understands.
- Weekday schedules are read in UTC.
- Voice transcription happens after the take, not while speaking; the live
  words come from the browser and are a preview.
