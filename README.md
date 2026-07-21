# CRM Pro — multi-tenant marketing CRM

A GoHighLevel-style CRM SaaS built with **React + TypeScript + Vite**, deployed to
[protectedcentral.com](https://protectedcentral.com) via GitHub Actions (FTP).
An agency owns isolated client sub-accounts; every module below is tenant-scoped.

## Modules

| Module | What it does |
|---|---|
| Dashboard | Customer-journey overview, KPI ticker, live activity, growth forecast, **Content Pipeline widget** |
| Contacts | Contacts with notes/tasks/activities, custom fields, CSV import |
| Pipelines | Kanban deal boards with subtasks, checklists, automations, WIP limits |
| Marketing | Email/SMS campaigns, multi-step sequences, automations |
| Funnels & Websites | Block-based page builder (hero/features/testimonials/faq/…), live site preview |
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
