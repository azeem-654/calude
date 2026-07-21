/**
 * onboarding.ts — types for the AI Company Onboarding Wizard and the
 * 12-month content planning engine.
 *
 * A company account gets ONE OnboardingState (stored under the tenant-scoped
 * `crm_onboarding` key). The 12-month plan is stored month-by-month: every
 * ContentMonth carries its own status + audit trail so the monthly approval
 * workflow (generate → review → approve → publish) can operate independently
 * per month.
 */

/** Lifecycle of one month inside the content pipeline. */
export type ContentMonthStatus =
  | 'PLAN_GENERATED'      // theme/topics planned — full content not yet generated
  | 'GENERATING'          // background generation for this month is running
  | 'AWAITING_APPROVAL'   // content generated, waiting for human review
  | 'PUBLISHED';          // approved & pushed live into the CRM modules

export interface PlanAuditEntry {
  at: string;        // ISO timestamp
  actor: string;     // user email or 'system'
  action: string;    // human-readable description of what happened
}

/** One generated email in a month's content package. */
export interface GeneratedEmail { day: number; subject: string; body: string; }
/** One generated SMS in a month's content package. */
export interface GeneratedSms { day: number; message: string; }

/** The full content package generated for one month (grows in Parts 3-4). */
export interface MonthContent {
  emails: GeneratedEmail[];
  sms: GeneratedSms[];
}

/** CRM records created when a month is published — kept for rollback. */
export interface PublishedRefs {
  sequenceId?: string;
  smsCampaignId?: string;
}

/** Per-month record — the unit the approval workflow operates on. */
export interface ContentMonth {
  index: number;               // 0..11 position in the 12-month plan
  year: number;                // calendar year, e.g. 2026
  month: number;               // calendar month 0..11
  label: string;               // "August 2026"
  theme: string;               // monthly campaign theme
  focus: string;               // 1-2 sentence focus statement
  holidays: string[];          // real holidays/observances leveraged that month
  ideas: string[];             // planned content/campaign ideas
  status: ContentMonthStatus;
  generated?: MonthContent;    // full content once generation has run
  publishedRefs?: PublishedRefs;
  generatedAt?: string;        // when full content generation finished
  approvedAt?: string;
  approvedBy?: string;
  publishedAt?: string;
  /** How many artifacts generation produced for this month (filled in Parts 2-4). */
  counts: { emails: number; sms: number; social: number; blogs: number; tasks: number };
  audit: PlanAuditEntry[];
}

/** Step 1 — business profile. */
export interface OnboardingProfile {
  companyName: string;
  industry: string;
  description: string;         // what the business does / sells
  audience: string;            // who they sell to
  brandVoice: string;          // e.g. 'Friendly & approachable'
  brandColor: string;          // hex accent used across generated assets
  website: string;
  email: string;
  phone: string;
  workDays: string[];          // subset of ['mon'..'sun']
  workFrom: string;            // '09:00'
  workTo: string;              // '17:00'
}

/** Step 2 — goals & sales process. */
export interface OnboardingGoals {
  goals: string[];             // selected growth goals
  monthlyLeadTarget: number;
  salesStages: string[];       // ordered pipeline stage names
}

export interface OnboardingState {
  version: 1;
  step: number;                // last step the user was on (resume support)
  completed: boolean;
  skipped: boolean;
  completedAt?: string;
  planSource?: 'ai' | 'smart-templates';
  /** IDs of records the wizard created, so a rollback can undo them. */
  createdPipelineId?: string;
  /** Result of the Step-4 contacts import (for the dashboard + audit). */
  importSummary?: {
    total: number; imported: number; duplicates: number; invalid: number;
    segments: { tag: string; count: number }[];
  };
  profile: OnboardingProfile;
  goals: OnboardingGoals;
  channels: string[];          // selected marketing channels
  plan: ContentMonth[];        // exactly 12 entries once generated
  audit: PlanAuditEntry[];     // workspace-level audit trail
}
