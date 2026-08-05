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

Parts 2–5 (email tab, deals tab, scheduling tab, lists/merge/permissions) build on
this foundation.

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
