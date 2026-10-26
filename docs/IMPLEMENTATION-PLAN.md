# Multi-industry build — audit and staged plan (started 2026-10-26)

The owner's master prompt asked for industry microsites, a new HVAC/roofing
growth offer, lead-to-revenue tracking with a performance fee, a medical
billing / RCM module, a snapshot marketplace and a private strategy-call
booking system — delivered in **four phases, each stopping for the owner's
go-ahead**. This file is the audit and the plan, so a later session (or the
owner) can pick up where the last phase stopped.

## Audit — what exists (2026-10-26)

| Area | State found | Use |
|---|---|---|
| Public site | `SiteHome` on protectedcentral.com; `/pricing`; `/hvac`, `/roofing` via `Site/IndustryPage.tsx` + `industries.ts`; head rewritten by the Worker (`lib/industryPages.ts`, `industryHead.ts`); sitemap/robots on the site host | Reuse parts; trade pages linked home and to each other (breadcrumb, nav, footer) — must become isolated microsites |
| Mobile nav on the site | `.dc-links` is hidden under 760px and nothing replaces it | Microsites need a real phone menu |
| Pricing | One table `lib/allowances.ts`: Starter $49 / Growth $97 / Pro $197 software plans + Custom. **No $45 or $2,200 offer exists anywhere in the repo** | Software plans stay the self-serve product; the growth service is a new, separate offer config |
| Booking | Per-workspace booking pages (`routes/booking.ts`, `lib/bookingTime.ts`: DST-safe slots, buffers, notice, window, daily limit), mail through the workspace mailbox | Reuse `bookingTime.ts`; the strategy call is the *operator's*, so it gets its own tables and owner-only route — not a workspace page |
| Install-wide mail | `installMailbox()` (validated owner mailbox) + `lib/deliver.ts` | Strategy-call confirmations and owner notices |
| Owner-only settings | Settings → Platform services (`PlatformServices.tsx`, `routes/platform.ts`, `isOwner` = agency with no account_id) | Strategy Call Booking is embedded there |
| CRM deals / pipelines | Client-side blobs in `crm_data` (`crm_pipelines`, deals inside), synced to D1 | Not a financial ledger: lead-to-revenue needs server tables with audit history (phase 2) |
| Money | Three pots (`billing.ts`, `storefront.ts`/`shop.ts`, `resell.ts`); `lib/revenue.ts` counts only money that arrived | Performance fees are a fourth thing: computed and owner-approved, **never charged automatically** |
| Invoices / quotes | Only shop orders and reseller billing; no contractor quote/job/invoice ledger | New in phase 2 |
| Snapshots / templates | Workflow templates (`Autopilot/workflowTemplates.ts`), AI Autopilot blueprints; no snapshot catalogue | New typed snapshot registry in phase 3, reusing templates |
| Medical billing / RCM | Nothing | New, isolated module in phase 4; synthetic data only |
| Calling / ads | No dialler, no ad-platform integration; Twilio SMS bring-your-own; voice optional | Phase 2 adds call-log + DNC/consent/time-window guardrails; no calls are placed by the software |

## The four phases

1. **Public sites, pricing and the strategy call** — **done 2026-10-26** (`test:industry`, `test:strategycall`, `test:strategycalle2e`, `test:security` additions)
   - `lib/offers.ts`: the growth offer ($300 setup, $87/month, 5% of eligible
     attributed collections; ad spend and third-party costs separate) and the
     medical billing profile (assessment-priced, no figure) — one source for
     every page and the structured data.
   - Isolated microsites `/hvac`, `/roofing`, `/medical-billing` on a shared
     `MicrositeLayout` with explicit microsite context, own nav, own logo
     target, phone menu, no link home or to another microsite.
   - Home page: a service-pricing section and links to all three.
   - Private strategy-call booking: owner settings under
     **Settings → Platform services → Strategy Call Booking**, public page
     `/book/strategy-call`, atomic conflict-free booking, idempotent submits,
     tokenised manage links, honest email status, owner list/notes/cancel/
     reschedule; every site CTA built by one link builder carrying the source
     site and UTM.
2. **Lead-to-revenue and the performance fee** — **done 2026-10-26** (`test:leadrevenue`, `test:leadrevenuee2e`, `test:security` additions; notes in `docs/claude/money.md`). Built: migration 0077, `lib/leadRevenue.ts`, `/api/lead-revenue.php`, Sales → Jobs & revenue, Workspace → Growth service. Not built: any payment integration (all payments are entered and confirmed by hand) and a national DNC registry lookup — both said on screen.
   - Server tables for inquiry → qualified → opportunity → appointment →
     quote → accepted/rejected → job won → in progress → completed → final
     amount → invoice → payments → refunds/disputes → fee, each transition
     timestamped and attributed to a user; first-touch attribution preserved.
   - Contractor confirmation screens; manual vs integration-verified payments.
   - Per-customer agreement (snapshot of commercial terms at signing),
     fee = rate × net eligible collections, partial payments, refunds,
     exclusions; owner reviews and approves before a fee is final.
   - Owner commercial settings (effective-dated; never rewrites a signed
     agreement); calling/advertising safeguards (call log, DNC/consent,
     calling hours, approval gate). Dashboards with stated definitions.
3. **Snapshot marketplace and industry provisioning** — **done 2026-10-26** (`test:snapshots`, `test:snapshotse2e`, `test:security` additions; notes in `docs/claude/app-ui.md`). Built: `lib/snapshots.ts`, migration 0079, `/api/snapshots.php`, Workspace → Industry snapshots, the sign-up industry claim. Snapshots hold pipelines, checklists and fields; workflows are suggested from the template library, not installed.
   - Typed, validated snapshot registry (HVAC, Roofing, Medical Billing/RCM)
     with versions; owner catalogue with preview/validate/install/history.
   - Signup carries the industry from the microsite; the server validates and
     records it; provisioning is idempotent; upgrades preview and never
     overwrite customer changes.
4. **Medical billing / RCM module and release checks** — **done 2026-10-26** (`test:rcm`, `test:rcme2e`, `test:security` additions; notes in `docs/claude/rcm.md`). Built: migration 0080, `lib/rcm.ts`, `/api/rcm.php`, Sales → Medical billing (`/rcm`), the owner's launch checklist. Not built: any clearinghouse, eligibility or payer integration (answers recorded by hand, remittances imported as CSV), and patient payment tracking — both said on screen. Real patient data is blocked until `docs/HIPAA-LAUNCH-BLOCKERS.md` is cleared.
   - Practices, providers, payers; claims workbench with distinct
     clearinghouse vs payer states; denials/appeals; leakage audit with
     evidence and no double counting; CSV remittance import and
     reconciliation; A/R aging; prior-auth and coding review queues; practice
     portal with internal notes hidden; audit trail; synthetic fixtures only.
   - HIPAA launch-blocker list; final full-suite run and completion report.

Each phase ends with typecheck, its tests, a push to the branch and to
`staging`, and a short report; the next starts only when the owner says so.

## Completion report (2026-10-26)

All four phases are built, on `staging` and promoted to live at the owner's
request. The final run: typecheck (app and Worker); the 27 unit suites the
staging workflow runs plus `test:rcm` and `test:gate`; `test:rcme2e` (116
checks), `test:security` (164), and the phase 2 and 3 end-to-end suites.

What stands between this and selling each offer is the owner's, and is in
`docs/OWNER-CHECKLIST.md`: a lawyer on the growth-service terms (33, approved
by the owner), the medical billing compensation model and BAA (34, 38), and —
the largest — a hosting BAA before any patient data (Cloudflare signs one only
on Enterprise; `docs/HIPAA-LAUNCH-BLOCKERS.md`). Medical billing runs on
synthetic data until then, and says so on every screen.
