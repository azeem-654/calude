/**
 * What Autopilot should do next, decided from what is actually in the workspace.
 *
 * ── A correction to my own earlier note ──
 *
 * The plan said this would "promote campaignAnalysis from advice to
 * instruction". Two things were wrong with that. campaignAnalysis is text
 * analysis for writing content; the dashboard's ranked next actions come from
 * `growthActions` in src/services/marketFeed.ts. And that function — which is
 * good, and computes lift by genuinely re-scoring rather than guessing — makes
 * *advice for a person*: a title, a sentence and a route to go and do it
 * yourself. There is no effect attached to run.
 *
 * Autopilot needs the opposite: things it can carry out. So the plays below are
 * new, and each one is a condition read from real records plus an effect the
 * Worker can actually perform. What is borrowed from marketFeed is the
 * principle, not the code — a suggestion is only worth making if it would
 * change something, and the reason has to quote the real figure.
 *
 * ── The rule every play obeys ──
 *
 * `because` quotes what was actually counted. Not "your contacts need
 * nurturing" but "12 contacts were added in the last 7 days and none are in a
 * sequence". A person has to be able to check the claim and disagree with it,
 * or the log is decoration.
 */

/** The workspace records a play may look at. Parsed once, passed to all. */
export interface Workspace {
  contacts: Contact[];
  sequences: Sequence[];
  enrolments: Enrolment[];
  pipelines: Pipeline[];
  reviewRequests: { contactId?: string; dealId?: string; at?: string }[];
  /** Can this workspace send at all? Nothing is worth planning if not. */
  canEmail: boolean;
  canSms: boolean;
  /** What the sending pool looks like, and what it is meant to look like.
   *  Absent when the customer has not asked Autopilot to build one. */
  pool?: {
    steps: { type: string; because: string; count?: number; domain?: string; domains?: string[]; addresses?: number }[];
    mode: 'byo' | 'managed';
    canBuy: boolean;
  };
}

export interface Contact {
  id: string; name?: string; email?: string; phone?: string;
  createdAt?: string; status?: string; tags?: string[];
  lastContactedAt?: string;
}
export interface Sequence { id: string; name: string; status?: string; steps?: unknown[] }
export interface Enrolment { id: string; contactId: string; sequenceId: string; status?: string }
export interface Deal {
  id: string; title?: string; status?: string; stage?: string;
  contactId?: string; value?: number;
  lastStageChangedAt?: string; closedAt?: string; expectedClose?: string;
}
export interface Pipeline { id: string; name: string; stages: { id: string; name: string; deals: Deal[] }[] }

/** One thing to do, ready to be written to the ledger. */
export interface PlannedAction {
  /** Stable within a plan, so re-planning does not duplicate an open action. */
  key: string;
  kind: 'create' | 'enrol' | 'send' | 'observe' | 'advance' | 'book' | 'error';
  summary: string;
  because: string;
  counts?: Record<string, number>;
  /** Which guardrail governs it. Absent means it needs no permission. */
  permission?: 'sendEmail' | 'sendSms' | 'createWorkflows' | 'activateWorkflows' | 'bookAppointments';
  /** What carrying it out means. Read by the execution pass. */
  effect:
    | { type: 'enrol'; sequenceId: string; contactIds: string[] }
    | { type: 'review_request'; contactIds: string[] }
    | { type: 'flag_stalled'; dealIds: string[] }
    /* Building a sending pool is planned here and confirmed elsewhere. The
       effect names the step; carrying it out is a separate, confirmed act
       because two of the four steps spend real money. */
    | { type: 'pool_step'; step: string; detail: string }
    | { type: 'none' };
}

const days = (iso?: string | null): number => {
  if (!iso) return Number.POSITIVE_INFINITY;
  const t = new Date(iso).getTime();
  if (!Number.isFinite(t)) return Number.POSITIVE_INFINITY;
  return (Date.now() - t) / 86_400_000;
};

const allDeals = (pipelines: Pipeline[]): Deal[] =>
  pipelines.flatMap(p => (p.stages ?? []).flatMap(s => s.deals ?? []));

/** How many contacts one play may touch in a single run. */
const BATCH = 50;

/** Plain-language names, kept beside the plays that use them. */
function describePoolStep(s: { type: string; count?: number; domain?: string; domains?: string[]; addresses?: number }): string {
  if (s.type === 'register_domain') return `Register ${s.count ?? 1} sending domain${(s.count ?? 1) === 1 ? '' : 's'}`;
  if (s.type === 'authenticate') return `Set up SPF, DKIM and DMARC on ${(s.domains ?? []).length} domain${(s.domains ?? []).length === 1 ? '' : 's'}`;
  if (s.type === 'create_mailboxes') return `Create ${s.count ?? 1} mailbox${(s.count ?? 1) === 1 ? '' : 'es'} on ${s.domain}`;
  if (s.type === 'warm_up') return `Start warming up ${s.addresses ?? 0} address${(s.addresses ?? 0) === 1 ? '' : 'es'}`;
  return 'Work on your sending pool';
}

/**
 * The plays, in the order they are considered.
 *
 * Order is not priority — every play that fires produces an action — but it
 * decides what a customer reads first, and "you cannot send at all" has to come
 * before anything that assumes sending works.
 */
export function planNext(ws: Workspace): PlannedAction[] {
  const out: PlannedAction[] = [];

  /* ── Nothing can happen without a way to send ──
     Said as a problem rather than silently producing no plan. A workspace with
     Autopilot on and an empty activity log is indistinguishable from a broken
     one, and this is the single most common reason for it. */
  if (!ws.canEmail && !ws.canSms) {
    out.push({
      key: 'no-sender',
      kind: 'error',
      summary: 'Autopilot cannot do anything yet — no mailbox is connected',
      because: 'nothing in this workspace has been validated for sending, so every campaign it plans would sit unsent',
      effect: { type: 'none' },
    });
    return out;
  }

  /* ── The sending pool ──
     Only when the customer has asked for one. Autopilot does not decide on its
     own that somebody should own more domains — that is money, and a target
     they set. */
  if (ws.pool?.steps.length) {
    const step = ws.pool.steps[0];
    const spends = step.type === 'register_domain' || step.type === 'create_mailboxes';
    if (spends && !ws.pool.canBuy) {
      out.push({
        key: 'pool-cannot-buy',
        kind: 'error',
        summary: 'Autopilot cannot build your sending pool yet',
        because: ws.pool.mode === 'managed'
          ? 'managed buying is not switched on for this installation, so nothing can be purchased on your behalf'
          : 'no registrar is connected, so there is nowhere to buy a domain from — connect one under Settings → Infrastructure',
        effect: { type: 'none' },
      });
    } else {
      out.push({
        key: `pool:${step.type}`,
        /* Everything that spends money asks first, whichever mode is on. In
           bring-your-own it is the customer's registrar; in managed it is a
           line on their bill. Neither is something to do because a plan said
           so. */
        kind: spends ? 'create' : 'advance',
        summary: describePoolStep(step),
        because: step.because,
        permission: spends ? 'activateWorkflows' : undefined,
        effect: { type: 'pool_step', step: step.type, detail: JSON.stringify(step) },
      });
    }
  }

  const active = ws.sequences.filter(s => s.status !== 'archived' && (s.steps?.length ?? 0) > 0);
  const enrolledIds = new Set(ws.enrolments.filter(e => e.status !== 'cancelled').map(e => e.contactId));

  /* ── New contacts nobody has started talking to ──
     The most valuable thing a small business fails to do. A lead that arrived
     four days ago and has heard nothing is the cheapest revenue in the
     workspace. */
  if (active.length) {
    const fresh = ws.contacts.filter(c =>
      c.email && !enrolledIds.has(c.id) && days(c.createdAt) <= 14 && !c.lastContactedAt,
    ).slice(0, BATCH);
    if (fresh.length) {
      const seq = active[0];
      out.push({
        key: `enrol-new:${seq.id}`,
        kind: 'enrol',
        summary: `Start ${fresh.length} new contact${fresh.length === 1 ? '' : 's'} on "${seq.name}"`,
        because: `${fresh.length} contact${fresh.length === 1 ? ' was' : 's were'} added in the last two weeks and ${fresh.length === 1 ? 'has' : 'have'} never been contacted`,
        counts: { contacts: fresh.length },
        permission: 'sendEmail',
        effect: { type: 'enrol', sequenceId: seq.id, contactIds: fresh.map(c => c.id) },
      });
    }
  } else if (ws.contacts.length > 0) {
    /* Contacts and nowhere to put them. Worth saying, because the customer
       cannot tell from the outside why nothing is happening. */
    out.push({
      key: 'no-sequence',
      kind: 'observe',
      summary: 'There are contacts but no email sequence to put them in',
      because: `this workspace has ${ws.contacts.length} contact${ws.contacts.length === 1 ? '' : 's'} and no sequence with any steps in it`,
      counts: { contacts: ws.contacts.length },
      effect: { type: 'none' },
    });
  }

  const deals = allDeals(ws.pipelines);

  /* ── Deals that have stopped moving ──
     14 days is the point at which a deal in most small-business pipelines is
     not slow, it is forgotten. Flagged rather than chased automatically: what
     to say to a stalled deal is a judgement about that customer. */
  const stalled = deals.filter(d =>
    (d.status ?? 'active') === 'active' && days(d.lastStageChangedAt) >= 14,
  ).slice(0, BATCH);
  if (stalled.length) {
    const worth = stalled.reduce((n, d) => n + (Number(d.value) || 0), 0);
    out.push({
      key: 'stalled-deals',
      kind: 'observe',
      summary: `${stalled.length} deal${stalled.length === 1 ? '' : 's'} ${stalled.length === 1 ? 'has' : 'have'} not moved in two weeks`,
      because: worth > 0
        ? (stalled.length === 1
            ? `it is worth ${Math.round(worth)} and has not changed stage in fourteen days`
            : `they are worth ${Math.round(worth)} between them and none has changed stage in fourteen days`)
        : (stalled.length === 1
            ? 'it has not changed stage in the last fourteen days'
            : 'none of them has changed stage in the last fourteen days'),
      counts: { deals: stalled.length, value: Math.round(worth) },
      effect: { type: 'flag_stalled', dealIds: stalled.map(d => d.id) },
    });
  }

  /* ── Reviews, from customers who just had a good experience ──
     Immediately after a win is the only moment this works, which is exactly
     when a busy tradesperson is on to the next job and forgets. */
  const asked = new Set(ws.reviewRequests.map(r => r.contactId ?? r.dealId ?? ''));
  const won = deals.filter(d =>
    d.status === 'won' && days(d.closedAt) <= 30 && d.contactId && !asked.has(d.contactId) && !asked.has(d.id),
  ).slice(0, BATCH);
  if (won.length) {
    out.push({
      key: 'ask-reviews',
      kind: 'create',
      summary: `Ask ${won.length} recent customer${won.length === 1 ? '' : 's'} for a review`,
      because: `${won.length} deal${won.length === 1 ? '' : 's'} closed as won in the last month and no review has been requested for ${won.length === 1 ? 'it' : 'any of them'}`,
      counts: { customers: won.length },
      permission: 'sendEmail',
      effect: { type: 'review_request', contactIds: won.map(d => d.contactId!).filter(Boolean) },
    });
  }

  /* ── People who have gone quiet ──
     Only when there is somewhere to put them; suggesting re-engagement with no
     sequence to run is advice, and this system is supposed to act. */
  if (active.length) {
    const quiet = ws.contacts.filter(c =>
      c.email && !enrolledIds.has(c.id) && c.lastContactedAt && days(c.lastContactedAt) >= 60,
    ).slice(0, BATCH);
    if (quiet.length >= 5) {
      const seq = active[active.length - 1];
      out.push({
        key: `re-engage:${seq.id}`,
        kind: 'enrol',
        summary: `Re-engage ${quiet.length} contacts who have not heard from you in two months`,
        because: `${quiet.length} contacts were last contacted more than 60 days ago and are not in any sequence`,
        counts: { contacts: quiet.length },
        permission: 'sendEmail',
        effect: { type: 'enrol', sequenceId: seq.id, contactIds: quiet.map(c => c.id) },
      });
    }
  }

  return out;
}
