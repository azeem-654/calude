# CRM Pro — multi-tenant marketing CRM

A GoHighLevel-style CRM SaaS built with **React + TypeScript + Vite**, deployed to
[protectedcentral.com](https://protectedcentral.com) via GitHub Actions (FTP).
An agency owns isolated client sub-accounts; every module below is tenant-scoped.

## Modules

| Module | What it does |
|---|---|
| Dashboard | Customer-journey overview, KPI ticker, live activity, growth forecast, **Content Pipeline widget** |
| Contacts | **Command center**: health score, lifecycle stages, next-best-action, unified cross-module timeline, custom fields, CSV import |
| Pipelines | Kanban deal boards with subtasks, checklists, automations, WIP limits |
| Marketing | Email/SMS campaigns, multi-step sequences, automations |
| Funnels & Websites | Template library (53), block-based builder, live preview, lead capture into CRM |
| Scheduling | Calendly-grade booking: event types, timezone slots, ics, reschedule/cancel, email + SMS reminders |
| Social Creator | Canva-grade design editor: templates, snap guides, shortcuts, stock photos, effects |
| AI Shorts | Long-video → shorts: captions, hooks, reframe, B-roll, dubbing, script-to-video, music, intro/outro |
| Reputation | Review inbox and reply workflows |
| Agency | Sub-account management, plans, usage, white-label branding |

## AI Company Onboarding Wizard

New company accounts are greeted by a 6-step wizard (`src/components/Onboarding/OnboardingWizard.tsx`)
that configures the entire workspace:

1. **Business profile** — company, industry, description, audience, brand voice/color, business hours. Validated and sanitized.
2. **Goals & sales process** — growth goals, monthly lead target, industry-prefilled pipeline stages (editable).
3. **Channels** — email, SMS, socials, video, blog, reviews, booking, funnels; each activates the matching module.
4. **Contacts** — CSV upload/paste with fuzzy column mapping, validation, dedupe, custom fields and **AI segmentation** (Hot Lead / SMS-Ready / Email-Ready / B2B / B2C) + auto welcome-campaign drafts.
5. **12-month plan** — theme/focus/holidays/ideas per month via Gemini, with a deterministic smart-template fallback so no API key is required. Fully editable.
6. **Review & launch** — summary of everything, then one click applies it all: brand kit, business hours, sales pipeline, lead-magnet funnel, website + 3 SEO blog posts, per-service booking pages with reminders, and a **90-Day Launch Plan** task board (30–50 tasks in 4 phases).

## Contacts — the command center

`src/services/contactIntelligence.ts` derives everything below from data the CRM
already holds (activities, deals, appointments, tasks). It is deterministic and
rule-based, so it works offline with no API key and every number can be explained.

- **Health score (0–100)** from four weighted signals — engagement (90-day
  opens/clicks/forms/calls), recency, pipeline progress and reachability. The ring
  opens a breakdown showing each component's contribution, so the score is
  inspectable rather than a black box.
- **Lifecycle stages** — Subscriber → Lead → MQL → SQL → Opportunity → Customer →
  Evangelist. The system infers the stage the behaviour supports and offers it as a
  suggestion; setting it explicitly is one click and is written to the timeline.
- **Next best action** — ranked, reasoned suggestions ("They clicked a link 1 day
  ago, which is the strongest intent signal you have"), each routing to the right
  tool. Rules cover overdue tasks, opens without clicks, open deals with no meeting,
  never-emailed contacts, and 30/60-day silence.
- **Unified timeline** — activities, notes, tasks, appointments and deal stage
  changes merged chronologically, filterable by type and exportable to text.
- **Cross-module summary** — open deals and pipeline value, appointments, and
  emails sent, read live from the Pipelines and Scheduling modules.
- **List view** — health bar and lifecycle stage as sortable columns, plus a
  lifecycle filter; clicking any row opens the command center.

### Email from the contact profile

`src/services/contactEmail.ts` plus `public/api/track.php` make the Email tab a
working outbound channel rather than a log viewer.

- **Compose and send** through whichever provider is configured in Settings →
  Email & SMS (SMTP, Mailtrap, Resend, ActiveCampaign). Eight starter templates,
  merge tokens (`{{firstName}}`, `{{company}}`, …) inserted at the cursor,
  attachments, and AI-generated subject lines when a Gemini key is present.
- **Scheduling** — pick a future date/time and the email is queued as `scheduled`.
  A background job on the dashboard sends anything whose time has come.
- **Real open and click tracking.** Outbound HTML is instrumented with a 1×1
  tracking pixel and rewritten links before it leaves. `api/track.php` records
  each hit (MySQL via `crm_pdo()`, JSON file fallback), then `syncTracking()`
  folds the events back into history — status advances sent → opened → clicked,
  with open counts, click counts and the exact URLs clicked. The click
  redirector only accepts `http(s)` targets, so it can't be used as an open
  redirect. If the endpoint isn't reachable, history simply stays as it is.
- **Engagement stats** — open rate, click rate and replies for this contact,
  each shown against the account-wide average so a number has context, plus an
  overall email-health band.
- **Sequences** — enrol the contact in any sequence built in Marketing, then
  skip a step, pause, resume or remove them. Every action is written to the
  enrolment history. A dashboard job sends due steps and stops the sequence
  when the contact replies.
- **Threaded history** — expandable per message with attachments, tracking
  detail and a "Log a reply" action that records the inbound message and marks
  the thread replied.

### Deals from the contact profile

`src/services/contactDeals.ts` treats deals from the contact's side. Deals live
inside `pipeline.stages[].deals`, so every helper here is pure — it takes the
pipeline array and returns a new one, and the caller persists through
`updatePipeline`. That keeps the contact profile and the pipeline board looking
at exactly the same data.

- **Every deal in one place** — across all pipelines, matched by contact id,
  email or name, with open deals first. Create, edit, delete, mark won, mark
  lost with a reason, and reopen, all without leaving the profile.
- **One-click stage moves.** Each open deal shows its pipeline's stages as
  chips; clicking one moves the deal there and **runs the same automation
  engine the kanban board uses** (`runAutomations`), so a rule like
  "when moved to Proposal Sent → set priority urgent, add a Hot label" fires
  identically from either surface and lands in the shared automation log.
- **Explainable win probability.** A forecast from four factors — stage
  position, contact health, momentum (days sitting in the current stage) and
  whether the expected close date has already slipped. Click the percentage to
  see each factor's contribution. The summary strip's weighted forecast is
  value × probability across open deals.
- **Behaviour triggers** — rules that fire on what the *contact* did rather
  than what happened to the deal: a link click or booked meeting advances the
  deal a stage, a pricing/demo form raises the win probability floor, a call
  raises it less. They run as a background job on the dashboard, are toggleable
  per rule, and fire at most once per (rule, deal, activity) so reloading is
  safe. **They never advance a deal into the final stage** — that column is the
  win column, and closing a deal stays a human decision.
- **In the contact list** — a Deals column (open value, open/won/lost counts,
  weighted forecast in the tooltip) and a Pipeline column showing which stages
  the contact's open deals sit in. Both sort. Select contacts and
  "Move deals to stage…" bulk-moves every open deal they own, skipping deals
  that belong to a different pipeline rather than relocating them somewhere the
  stage id doesn't exist.

### Scheduling from the contact profile

`src/services/contactScheduling.ts` books meetings against the **same
availability rules the public booking page enforces** — weekly hours, daily
limit, buffers, minimum notice and the rolling window — so an internal booking
can never double-book against a public one, and vice versa.

- **Both clocks, always.** Appointments store owner-timezone wall clock plus
  the owner's and the contact's IANA zones. Slot buttons show your time with
  theirs in brackets, and cards show both. The contact's zone is taken from
  their record, else guessed from their phone's dialling code — and a guess is
  **labelled as a guess** rather than presented as fact. One dropdown corrects it.
- **Book, reschedule, cancel, close out.** Rescheduling records where the
  meeting came from and rebuilds its reminder; cancelling takes a reason and
  clears pending reminders. Meetings whose end time has passed surface under
  "Needs closing out" so nothing quietly rots in the calendar as `scheduled`.
- **Real calendar files.** Every meeting exports a valid `.ics` (importable
  anywhere) and offers a Google Calendar "add event" link — no OAuth, no
  connector to configure.
- **Reminders that actually send.** A dashboard background job emails any
  reminder whose time has arrived through the configured provider, stamps it
  sent so it can't repeat, and logs it to the contact's timeline. Reminders
  for meetings that already started are skipped rather than sent late.
- **Post-meeting follow-up** — toggleable rules that run once per meeting after
  you mark it completed or a no-show: a thank-you email, a follow-up task two
  days out, an optional deal advance (off by default), and a re-book task for
  no-shows. The deal advance obeys the same rule as the behaviour triggers: it
  never moves a deal into the final stage.
- **Show rate** — completed vs no-show, alongside upcoming and cancelled counts.

### Lists, dedupe, ownership and the team feed

- **Smart lists** (`src/services/contactLists.ts`) are saved rules re-evaluated
  every time you open them, so they never go stale. Rules can reach past the
  contact record into derived data — health score, lifecycle stage, open-deal
  value, email open rate, days since last activity — which turns
  "engaged leads with an open deal who have never been emailed" into one saved
  segment instead of a manual sweep. The rule builder shows the live match
  count as you type. Five starter segments are one click away.
- **Static lists** are hand-curated: select rows and "Add to list…".
  Deleting a contact removes it from every static list, so a list can never
  point at a record that no longer exists.
- **Dedupe** (`src/services/contactMerge.ts`) groups likely duplicates by
  email (100% confidence), normalised phone number (85%) and name-at-company
  (60%, flagged as weaker evidence to check first). The merge wizard shows
  every field the records disagree on before anything is written, and defaults
  the surviving record to the most complete one.
  **Merging never orphans anything**: tags, notes, tasks and timeline entries
  are combined rather than replaced; blank fields on the survivor are filled
  from the duplicate; and every deal, meeting, email and list membership
  pointing at the removed record is re-pointed at the survivor *before* it is
  deleted.
- **Ownership** — an Owner column, an owner filter (including "My contacts"
  and "Unassigned"), and bulk assignment. Roles gate what the UI offers:
  agency users can act on anything; client users can fully manage the contacts
  they own but not someone else's, and merging is withheld from them because
  it destroys records across owners. Denials explain themselves in the tooltip
  rather than just going grey.
- **Team feed** — recent activity across every contact with a per-owner
  workload read, filterable by owner. The per-contact timeline answers "what
  happened to this person"; this answers "what has the team been doing".

### Permissions are enforced on the server

The same rules live in two places that have to agree:

| | |
|---|---|
| `src/services/contactPermissions.ts` | what the interface offers |
| `public/api/_perm.php` | what the database accepts |

Every write reaches the server through `api/data.php`, which is the only path
to the account store, so the guard sits at the choke point. Before anything is
written it diffs the incoming contact array against the stored one and refuses
the request if it touches a record the caller may not touch:

- A client user may edit or delete only records they own, or unowned ones.
- Reassigning a record away from its owner needs the reassign capability *on
  the record as it stands*, so nobody can hand themselves someone else's contact.
- New records created by a non-agency user are stamped with them as owner, so
  every record has someone accountable for it.
- No non-agency user can clear a whole core key (`crm_contacts`,
  `crm_pipelines`, `crm_appointments`, …) in one request.
- Agency users are unrestricted within the workspaces they can access.

When the server refuses a write it returns its own copy of the data along with
the reason. `serverData.ts` writes that copy back, `AppContext` pulls it into
React state, and the user sees *"Blocked: "Cara Lin" is owned by other@a.com and
cannot be edited by you."* — so a change that did not save never sits on screen
looking like it did.

The UI reads its capability matrix from `api/data.php?action=caps` rather than
deciding alone, so what a button offers is what the server will accept.
**Settings → Team & Permissions** shows that matrix, manages team members and
their roles, and states plainly whether enforcement is live.

**The one caveat that remains:** enforcement requires the cloud database to be
connected (Agency → Cloud Database). Running local-only, there is no server to
enforce anything and the same screen says so rather than implying a guarantee
that isn't there.

## Funnel & Website Builder

A single template library (`src/components/shared/pageTemplates.ts`) is the source
of truth for ready-made page content, so **what you preview is exactly what gets
created** — previously each wizard produced pages with `blocks: []`, which is why
new funnels and websites opened empty.

- **53 templates** across Lead Capture, Sales Pages, Landing Pages, Event Pages,
  Thank You Pages, Full Websites and Seasonal — each with its own hero copy,
  industry tag, page count and popularity rating.
- **Live previews, not screenshots.** Thumbnails render the real page through the
  shared `BlockRender` and CSS-scale it, so they can never drift out of date and
  need no screenshot pipeline. Hover scrolls the full page; clicking opens a
  full-screen preview with **desktop/mobile toggle** and a page switcher.
- **Use this template** clones the pages into a new funnel/website and drops you
  straight into the builder with everything populated and editable.
- **Preview that works**: `/preview-funnel/:id` and `/preview/:siteId` render live
  from app state, so edits show up on the next preview. Both builders have a
  *Live preview* button that saves first and opens the rendered page in a new tab.
- **Forms capture real leads** — submitting on a funnel preview creates a CRM
  contact (tagged with the funnel name) and increments the funnel's conversions,
  which the card's Analytics view reports.

Builder features already in place: drag-and-drop blocks with drop zones, a
properties panel per block, page add/delete/rename/reorder, undo/redo, device
widths, and gradient presets.

### Not included (needs infrastructure this deployment doesn't have)

This app is a static SPA on shared hosting with `localStorage` persistence and a
few PHP endpoints — there is no application server, database or object store. So
the following are deliberately **not** implemented rather than faked:
custom-domain DNS verification and serving, S3/Cloudinary uploads (images are
stored as data URLs), Stripe/PayPal checkout, and server-side screenshot
generation. Wire up a backend before expecting those.

Two things that *are* server-backed on this deployment, because the PHP
endpoints carry them: **email open/click tracking** (`api/track.php`) and
**permission enforcement** (`api/_perm.php`, guarding `api/data.php`). Both
need `api/config.php` to exist — run the installer from Agency → Cloud
Database once.

## Deployment and host-side state

Pushing to `main` in `azeem-654/calude` runs `.github/workflows/deploy.yml`:
`npm ci` → `npm run build` with `VITE_BASE=/` → FTP-upload `./dist/` to `/` on
protectedcentral.com (three attempts, since the host's FTP is flaky). Pushing to
`testing` deploys to `testing.protectedcentral.com` instead. `dangerous-clean-slate`
is off, so files the deploy never uploaded — including everything below — are
left alone.

Two kinds of file live only on the host and are never in the repo:

| Path | What it holds | Created by |
|---|---|---|
| `api/config.php` | MySQL credentials | `install.php`, once |
| `api/data/*.php` | Sessions, password hashes, bookings, tracking events | The endpoints, at runtime |

**Those files are protected two ways, because one is not enough on shared
hosting.** Each store under `api/data/` is written as a `.php` file that begins
with `<?php http_response_code(404); exit; ?>` — fetched directly it executes,
returns 404 and prints nothing, whatever the server config says. An install that
predates this is migrated on first read: the plain `.json` file is rewritten in
guarded form and deleted, so old tokens cannot keep leaking. On top of that,
`api/.htaccess` denies `config.php` and the `_*.php` includes, and
`api/data/.htaccess` denies the directory outright.

`install.php` requires an agency session once any account exists, so a public
endpoint cannot be used to repoint a running install at another database.
First-run setup stays open, because at that point there is nothing to protect
and nobody to authenticate as.

## 12-Month Content Pipeline

The plan is stored **month-by-month** (`crm_onboarding` key, `ContentMonth[]` in
`src/types/onboarding.ts`). Each month carries its own lifecycle:

```
PLAN_GENERATED ──generate──▶ GENERATING ──done──▶ AWAITING_APPROVAL ──approve──▶ PUBLISHED
                                                        ▲                            │
                                                        └────────── rollback ────────┘
```

- **Month 1 generates immediately** after launch, as a background job (resumes after reload). Later months generate on demand.
- A month's package: 5 emails, 4 SMS, a 12-post 30-day social calendar, and 4 short-video scripts — Gemini-written when a key is configured, personalized smart templates otherwise. Everything is sanitized and editable in the review screen.
- **Approving** publishes for real: an active email sequence + SMS flow in Marketing and editable, scheduled designs in Social Creator. Record IDs are kept in `publishedRefs`.
- **Rollback** deletes those records and returns the month to review with its content intact.
- Workflow controls on the dashboard widget: **Generate content for [Month]**, **Generate all remaining**, **Approve all**, **Auto-approve** toggle (new generations publish automatically), and a full **audit trail** (every generation, edit, approval and rollback with timestamp + actor).

Key files: `src/services/onboarding.ts` (storage + plan engine), `contentGen.ts`
(month generation, background jobs, publish/rollback), `csvImport.ts`,
`launchAssets.ts` (funnel/website/booking/90-day builder),
`src/components/Onboarding/` (wizard + Content Pipeline widget).

## Development

```bash
npm install
npm run dev        # Vite dev server
npm run build      # type-check + production build to dist/
```

Optional AI: add a Gemini API key in Settings — every AI feature has an offline fallback.
PHP endpoints in `public/api/` (booking, mail, image proxy) deploy alongside the SPA and
run zero-config via a JSON file store, or MySQL/SQLite through `api/config.php`.

## Deployment

Pushing to `main` triggers `.github/workflows` → build → FTP upload to protectedcentral.com.
The workflow retries the FTP step up to 3 times; a failed upload can be re-triggered with an
empty commit.
