/**
 * The AI Sales Agent's own vocabulary.
 *
 * The agent decides what should happen; the existing modules do it and own
 * whether it worked. So nothing here stores a send count, an open rate or a
 * campaign's running state — those are read back from whichever module owns
 * the record, every time they are shown. What lives here is the part no other
 * module knows: the objective, the strategy, the permissions, the decisions,
 * and the links that make a scattered set of records one campaign again.
 */

/** Where a campaign is in its life, from the user's point of view. */
export type AICampaignStatus =
  /** Objective captured, no strategy yet. */
  | 'draft'
  /** A strategy has been proposed and is waiting to be read. */
  | 'awaiting-approval'
  /**
   * The plan is agreed but nothing has been built from it yet. A separate state
   * from 'running' because saying a campaign is running while no message has
   * been created is the kind of small lie that makes the rest untrustworthy.
   */
  | 'ready'
  /** Approved and executing through the other modules. */
  | 'running'
  /** Held. Everything it created is held too. */
  | 'paused'
  /** Finished its plan. */
  | 'completed'
  /** Ended early by a person. */
  | 'stopped';

export const CAMPAIGN_STATUS_LABEL: Record<AICampaignStatus, string> = {
  draft: 'Draft',
  'awaiting-approval': 'Waiting for approval',
  ready: 'Ready to run',
  running: 'Running',
  paused: 'Paused',
  completed: 'Completed',
  stopped: 'Stopped',
};

export type AIChannel = 'email' | 'sms' | 'calendar';

/**
 * What the agent worked out, in a form a person can read and change.
 *
 * Every field is editable before anything is created. `generatedBy` is not
 * decoration: a plan assembled by the deterministic fallback must never be
 * presented as though a model reasoned about the business.
 */
export interface AIStrategy {
  /** One paragraph, in plain words, of what the agent intends to do. */
  summary: string;
  icp: {
    description: string;
    industry?: string;
    location?: string;
    /** e.g. "two or more locations" — kept as text because it is a judgement. */
    sizeHint?: string;
    /** What makes a lead worth contacting, one signal per entry. */
    signals: string[];
  };
  offer: { what: string; priceHint?: string };
  channels: AIChannel[];
  cadence: {
    /** How many follow-ups after the first message. */
    followUps: number;
    intervalDays: number;
  };
  /** When to stop chasing someone. */
  exitConditions: string[];
  targetCount: number;
  /** Why the agent chose this, so a person can disagree on the reasoning. */
  rationale: string[];
  generatedBy: 'ai' | 'fallback';
}

/** What the agent may do on its own. */
export type Permission = 'off' | 'approval' | 'on';

export const PERMISSION_LABEL: Record<Permission, string> = {
  off: 'Never',
  approval: 'Ask me first',
  on: 'Allowed',
};

/**
 * The limits the agent works inside.
 *
 * Defaults are deliberately cautious: an agent that can email strangers
 * unattended on first run is a way to burn a sending domain before anyone
 * notices. Sending starts behind approval and the customer opens it up.
 */
export interface AIGuardrails {
  dailyNewProspects: number;
  maxEmailsPerDay: number;
  maxSmsPerDay: number;
  createWorkflows: Permission;
  activateWorkflows: Permission;
  sendEmail: Permission;
  sendSms: Permission;
  bookAppointments: Permission;
}

export const DEFAULT_GUARDRAILS: AIGuardrails = {
  dailyNewProspects: 100,
  maxEmailsPerDay: 50,
  maxSmsPerDay: 20,
  createWorkflows: 'on',
  activateWorkflows: 'approval',
  sendEmail: 'approval',
  sendSms: 'approval',
  bookAppointments: 'on',
};

/** The kinds of record an AI campaign can be responsible for. */
export type LinkKind =
  | 'sequence'
  | 'email-campaign'
  | 'sms-campaign'
  | 'automation'
  | 'contact'
  | 'appointment'
  | 'pipeline'
  | 'lead-list';

export const LINK_LABEL: Record<LinkKind, string> = {
  sequence: 'Email sequence',
  'email-campaign': 'Email campaign',
  'sms-campaign': 'SMS campaign',
  automation: 'Workflow',
  contact: 'Contact',
  appointment: 'Appointment',
  pipeline: 'Pipeline',
  'lead-list': 'Lead list',
};

/**
 * One edge from an AI campaign to a record another module owns.
 *
 * `id` is the id in that module, not a copy of the record — following the edge
 * means going and reading the real thing, which is what keeps the two from
 * disagreeing.
 */
export interface AILink {
  kind: LinkKind;
  id: string;
  label: string;
  /** Where to open the real record. */
  route?: string;
  at: string;
}

export interface AICampaign {
  /** e.g. AI-SA-2026-0001 — allocated once, never reused. */
  id: string;
  name: string;
  /** The sentence the customer actually typed, kept verbatim. */
  objective: string;
  status: AICampaignStatus;
  strategy?: AIStrategy;
  guardrails: AIGuardrails;
  links: AILink[];
  createdAt: string;
  updatedAt: string;
  /** Who asked for it. */
  createdBy?: string;
  startedAt?: string;
  endedAt?: string;
}

/** What kind of thing the agent did. */
export type DecisionKind =
  | 'plan'
  | 'discover'
  | 'qualify'
  | 'create'
  | 'enrol'
  | 'send'
  | 'observe'
  | 'advance'
  | 'book'
  | 'pause'
  | 'approval'
  | 'error';

export const DECISION_LABEL: Record<DecisionKind, string> = {
  plan: 'Planned',
  discover: 'Found prospects',
  qualify: 'Qualified',
  create: 'Created',
  enrol: 'Enrolled',
  send: 'Sent',
  observe: 'Noticed',
  advance: 'Moved',
  book: 'Booked',
  pause: 'Paused',
  approval: 'Approval',
  error: 'Problem',
};

/**
 * One line of the account the agent gives of itself.
 *
 * `because` is the point of the whole log. "Moved 4 leads to Interested" is a
 * claim; "because they replied and the reply did not match an out-of-office
 * pattern" is something a person can check and argue with.
 */
export interface AIDecision {
  id: string;
  campaignId: string;
  at: string;
  kind: DecisionKind;
  /** One line, in the words a user would use. */
  summary: string;
  because?: string;
  /** The record this concerned, if any. */
  link?: AILink;
  /** Figures worth showing alongside, e.g. { found: 87, qualified: 52 }. */
  counts?: Record<string, number>;
}

/* ── Leads ─────────────────────────────────────────────────────────────── */

/** Where a prospect came from. Never inferred — recorded by whatever found it. */
export type LeadSource = 'google-places' | 'crm' | 'csv';

export const LEAD_SOURCE_LABEL: Record<LeadSource, string> = {
  'google-places': 'Google Places',
  crm: 'Your contacts',
  csv: 'Imported list',
};

/**
 * One ICP signal, checked against what is actually known about a business.
 *
 * `unknown` is a first-class answer and the most important one. A directory
 * listing says nothing about whether a clinic can afford three thousand a
 * month, and scoring that as a pass — or quietly leaving it out — turns a guess
 * into a qualification. It is reported as unanswerable instead.
 */
export interface SignalCheck {
  signal: string;
  verdict: 'met' | 'not-met' | 'unknown';
  /** What the answer rests on, in words a person can check. */
  evidence: string;
}

export interface LeadQualification {
  /** 0–100 over the signals that could actually be checked. Derived, not measured. */
  score: number;
  checks: SignalCheck[];
  /** The channels this lead could genuinely be reached on, given what is known. */
  contactable: AIChannel[];
  at: string;
}

export type LeadStatus = 'new' | 'qualified' | 'rejected' | 'promoted';

export const LEAD_STATUS_LABEL: Record<LeadStatus, string> = {
  new: 'Not yet checked',
  qualified: 'Qualified',
  rejected: 'Does not match',
  promoted: 'Added to contacts',
};

export interface AILead {
  id: string;
  campaignId: string;
  name: string;
  source: LeadSource;
  /** The id in the source system, so the same business is never added twice. */
  sourceRef?: string;
  address?: string;
  phone?: string;
  website?: string;
  email?: string;
  rating?: number;
  ratingCount?: number;
  /** Google's word for whether the place is still trading. */
  businessStatus?: string;
  status: LeadStatus;
  qualification?: LeadQualification;
  createdAt: string;
}
