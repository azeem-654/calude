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
import type { PlannerChannel } from './projectBrief';

export interface Workspace {
  /** What this project is for. Absent is treated as 'general'. */
  kind?: ProjectKind;
  /**
   * The channels this project's brief lets the planner act on.
   *
   * Absent for every project made before briefs existed, which plan exactly as
   * they always did. Present and empty means the project's own workflows do
   * all of its work and the planner stays out of it — a daily social post
   * written by both would be two posts a day.
   */
  focus?: PlannerChannel[] | null;
  contacts: Contact[];
  sequences: Sequence[];
  enrolments: Enrolment[];
  pipelines: Pipeline[];
  reviewRequests: { contactId?: string; dealId?: string; at?: string }[];
  /**
   * The customer's own calendar date, `YYYY-MM-DD`.
   *
   * Passed in rather than worked out here, for the same reason `tomorrow` is:
   * a pure function that cannot be tested without knowing what day it is in
   * Karachi is not much of a pure function. It is what date-stamps the daily
   * plays, so a post planned at 22:00 local is filed as today's and not as
   * tomorrow's — which is the date a person reads on the card.
   */
  today?: string;

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
  /**
   * Appointments happening tomorrow that the guest has not been reminded of.
   *
   * Already narrowed to "tomorrow, in the owner's own timezone, still
   * confirmed, never reminded" — the planner does no date arithmetic, because
   * a pure function that cannot be tested without knowing what day it is in
   * Karachi is not much of a pure function.
   */
  tomorrow?: { id: string; at: string; name: string; hasPhone: boolean; hasEmail: boolean }[];

  /**
   * What has been sold, and what is stuck.
   *
   * Absent when the workspace sells nothing — a services business has no
   * orders, and a play that fires on "you have no products" would be Autopilot
   * telling a plumber to open a shop.
   */
  commerce?: {
    /** Paid for, and never told so. */
    unthanked: { id: string; email: string; total: number }[];
    /** A payment link was made, a day has gone by, and it is still unpaid. */
    unpaid: { id: string; email: string; days: number }[];
    /** Paid, made by a supplier, and never sent to them. */
    unfulfilled: { id: string; email: string }[];
    /** Imported and never put on sale. */
    draftProducts: number;
    /** Whether the two things those plays depend on are actually connected. */
    canCharge: boolean;
    canSupply: boolean;
  };

  /** What the workspace already has to show for itself, and whether Autopilot
   *  has a key to write more with. */
  content?: {
    funnels: number;
    websites: number;
    blogPosts: number;
    socialPosts: number;
    shorts: number;
    /**
     * When the most recent one was written, per kind.
     *
     * The counts answer "has this ever happened", which is the right question
     * exactly once — and the reason Autopilot wrote a blog post on the day a
     * project was created and then nothing, for ever, while the board said it
     * was running. These answer "did it happen today", which is what a cadence
     * actually needs. Null means never.
     */
    newestBlogAt?: string | null;
    newestSocialAt?: string | null;
    /** Posts still ahead rather than behind. See the note where it is set. */
    socialUnpublished?: number;
    canWrite: boolean;
  };
}

export interface Contact {
  id: string; name?: string; email?: string; phone?: string;
  createdAt?: string; status?: string; tags?: string[];
  lastContactedAt?: string;
}
export interface Sequence {
  id: string; name: string; status?: string;
  /* Only the channel is read here. The rest of a step is the sender's
     business, and re-typing it would be a second copy of a shape that already
     lives in scheduled.ts and would drift from it. */
  steps?: { channel?: string }[];
}
export interface Enrolment { id: string; contactId: string; sequenceId: string; status?: string }
export interface Deal {
  id: string; title?: string; status?: string; stage?: string;
  contactId?: string; value?: number;
  createdAt?: string;
  lastStageChangedAt?: string; closedAt?: string; expectedClose?: string;
}
export interface Pipeline { id: string; name: string; stages: { id: string; name: string; deals: Deal[] }[] }

/**
 * What a project is for, which decides what it plans.
 *
 *   leadgen      find people, write to them, book them in
 *   consultancy  the same shape, selling expertise rather than a service
 *   ecommerce    a catalogue, a storefront, orders and everything after a sale
 *   general      anything that has not said — plans everything, as before
 */
export type ProjectKind = 'leadgen' | 'consultancy' | 'ecommerce' | 'general';

/** One thing to do, ready to be written to the ledger. */
export interface PlannedAction {
  /** Stable within a plan, so re-planning does not duplicate an open action. */
  key: string;
  /**
   * Whose fact this is about.
   *
   * `project` — true of one client's work: the blog post, the landing page, the
   *   follow-up sequence written in their voice. Two projects in a workspace
   *   should each get their own, and deduping across them would silence the
   *   second.
   *
   * `workspace` — true of the workspace itself: its orders, its contacts, its
   *   deals, its diary, its mailbox. There is one set of those however many
   *   projects are running, so exactly one project plans them and the rest
   *   leave them alone.
   *
   * Getting this wrong is not cosmetic. When every play ran per project, a
   * workspace with two projects planned "send 3 paid orders to the supplier"
   * twice — and the only thing standing between that and two parcels was a
   * marker check further down. Scope is the fix; the markers are the net.
   */
  scope: 'project' | 'workspace';
  /**
   * The kinds of project this play belongs to. Absent means every kind.
   *
   * A dental lead-gen project should not spend its mornings chasing unpaid
   * orders it will never have, and a shop should not be told there is no
   * sequence to put contacts in. Both are noise, and noise is what makes
   * somebody stop reading the board.
   */
  kinds?: ProjectKind[];
  /**
   * Which channel this play works in, for a project whose brief narrows them.
   *
   * Every play carries one. A play without it would be kept by a project that
   * asked for "social only" — and the play most likely to be forgotten is the
   * one that emails somebody.
   */
  channels: PlannerChannel[];
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
    /* Writing something. The kind names which writer; the tick calls it and
       files the result in the module that owns it. */
    /* `landing` is a funnel — one page with one decision on it. `website` is
       several pages somebody can read. They are different products for
       different businesses and the planner picks, rather than everybody getting
       whichever one happened to be built first. */
    | { type: 'write'; what: 'landing' | 'website' | 'blog' | 'social' | 'short' | 'sequence' }
    /* Commerce. Each names orders rather than carrying their contents, so the
       tick reads the current state of an order rather than acting on a copy
       that was true when the plan was written — an order paid overnight must
       not still be chased for payment in the morning. */
    | { type: 'thank_buyers'; orderIds: string[] }
    | { type: 'chase_payment'; orderIds: string[] }
    | { type: 'draft_at_supplier'; orderIds: string[] }
    | { type: 'remind_bookings'; bookingIds: string[] }
    | { type: 'none' };
}

/**
 * Hours since an instant, or Infinity when it never happened.
 *
 * Twenty rather than twenty-four is the threshold every daily play uses. A tick
 * runs every five minutes and a customer's "daily" post should not drift an
 * hour later every day until it is arriving at midnight — twenty hours means it
 * settles into the first tick of their morning and stays there.
 */
const hoursSince = (iso?: string | null): number => {
  if (!iso) return Number.POSITIVE_INFINITY;
  const t = new Date(iso).getTime();
  if (!Number.isFinite(t)) return Number.POSITIVE_INFINITY;
  return (Date.now() - t) / 3_600_000;
};

/**
 * The date a daily play is stamped with.
 *
 * It goes in the summary, which is what the existing dedupe reads — one open
 * action per summary. That is what makes "one a day" work with no new
 * machinery: yesterday's summary is different, so today's is not a duplicate,
 * and a second tick on the same day finds today's already there and stops.
 */
const stamp = (today?: string): string =>
  (today && /^\d{4}-\d{2}-\d{2}$/.test(today)) ? today : new Date().toISOString().slice(0, 10);

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
  /*
   * Read here rather than only at the bottom, because two plays now need it to
   * decide *what* to plan rather than only whether to keep it — a shop gets a
   * funnel where everybody else gets a website. The filter at the end still
   * does the keeping.
   */
  const kind: ProjectKind = ws.kind ?? 'general';
  /* Collected first and filtered once at the bottom. Twenty `if (kind === …)`
     guards would be twenty chances to forget one, and the one forgotten is the
     one that plans an order chase for a dentist. */

  /*
   * ── No way to send ──
   *
   * Said as a problem rather than silently producing no plan: a workspace with
   * Autopilot on and an empty activity log is indistinguishable from a broken
   * one, and this is the commonest reason for it.
   *
   * It used to `return` here, which was wrong and was the first thing a brand
   * new customer met. Connecting a mailbox is the slowest step of setting this
   * app up — DNS, a password, a validation round trip — and blocking on it
   * meant Autopilot did *nothing at all* for the days that took, when writing
   * the landing page and the first blog post needs no mailbox whatsoever.
   * Those are exactly the things that remove the blank page while somebody is
   * waiting on their DNS to propagate.
   *
   * So this is a notice, not a gate. Every play that actually sends checks
   * `canSend` for itself, immediately above the send.
   */
  const canSend = ws.canEmail || ws.canSms;
  if (!canSend) {
    out.push({
      key: 'no-sender',
      channels: ['email', 'sms'],
      scope: 'workspace',
      kind: 'error',
      /* Only claims what is true. It used to say "cannot do anything yet",
         which stopped being true the moment it also queued the writing. */
      summary: 'Nothing can be sent yet — no mailbox is connected',
      because: 'nothing in this workspace has been validated for sending, so anything Autopilot writes will wait here rather than go out',
      effect: { type: 'none' },
    });
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
        channels: ['email'],
        scope: 'workspace',
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
        channels: ['email'],
        scope: 'workspace',
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

  /* ── Something to show for itself, and to go on showing ──
     A campaign with nowhere to send people, and a business with nothing
     published, is the commonest reason a small workspace does nothing. These
     only fire when there is a key to write with — a plan to write a page that
     cannot be written is not a plan.

     ── Why these are cadences and not gates ──

     Every one of these used to ask "is there none?". That is the right question
     exactly once. After the first pass it was false for ever, so a project
     produced one blog post, one week of social and one landing page on the day
     it was created and then nothing at all, while the board went on saying it
     was running. A customer paying monthly for "it markets your business" got a
     day's work and eleven months of silence.

     They now ask "is there one from today?" instead. The date is in the summary
     so the existing dedupe — one open action per summary — becomes exactly one
     of each a day without any new machinery: yesterday's is closed, today's is
     not there yet, and a second tick on the same day finds it and stops. */
  if (ws.content?.canWrite) {
    const c = ws.content;
    /* The customer's own day, not UTC's. A post "for Monday" planned at 22:00
       in Karachi must not be filed as Sunday's — the stamp is what a person
       reads on the card. */
    const today = stamp(ws.today);

    if (c.funnels === 0 && c.websites === 0) {
      /*
       * A shop gets a funnel; everybody else gets a website.
       *
       * They are not interchangeable. A funnel is one page with one decision on
       * it, which is what sells a product — and a services business judged on
       * whether it looks like a real firm needs pages a person can read: what
       * you do, who you are, how to reach you. Giving a plumber a single
       * squeeze page is the same mistake as giving a supplement brand a
       * five-page brochure.
       */
      const wantsFunnel = kind === 'ecommerce';
      out.push({
        key: 'write-landing',
        channels: ['site'],
        scope: 'project',
        kind: 'create',
        summary: wantsFunnel ? 'Build a funnel to sell from' : 'Build a website for what you do',
        because: wantsFunnel
          ? 'this project sells a product and has nowhere to sell it, and a funnel is one page with one decision on it — which is what a product needs'
          : 'there is no website or funnel here, so every campaign would send people nowhere — and a services business is judged on whether it looks like a real firm',
        permission: 'createWorkflows',
        effect: { type: 'write', what: wantsFunnel ? 'landing' : 'website' },
      });
    }

    /*
     * A post a day, and the reason it is a day.
     *
     * Search rewards a site that keeps answering questions, and nothing about
     * one post is worth anything. A day is also the slowest cadence somebody
     * notices: a customer watching the board wants to see it working, and the
     * whole promise of this product is that it does something while they are
     * doing their actual job.
     */
    if (hoursSince(c.newestBlogAt) >= 20) {
      const first = c.blogPosts === 0;
      out.push({
        key: `write-blog-${today}`,
        channels: ['blog'],
        scope: 'project',
        kind: 'create',
        summary: first ? 'Write your first blog post' : `Write today's blog post — ${today}`,
        because: first
          ? 'nothing has been published, and the pages that bring people in from a search are the ones that answer a question before they buy'
          : 'a site that answers a new question every day is what search rewards, and one post on its own is worth almost nothing',
        permission: 'createWorkflows',
        effect: { type: 'write', what: 'blog' },
      });
    }

    /*
     * Social is topped up rather than added to.
     *
     * The old rule counted every post that had ever existed, so a page with
     * forty behind it and none in front never got another — which is exactly
     * the page that stops tomorrow. What matters is how many are still ahead.
     */
    const ahead = c.socialUnpublished ?? c.socialPosts;
    if (ahead < 5 && hoursSince(c.newestSocialAt) >= 20) {
      out.push({
        key: `write-social-${today}`,
        channels: ['social'],
        scope: 'project',
        kind: 'create',
        summary: ahead === 0 ? 'Write a week of social posts' : `Top up the social queue — ${today}`,
        because: ahead === 0
          ? 'nothing is scheduled, and a page with no posts on it reads as a business that has closed'
          : `there ${ahead === 1 ? 'is 1 post' : `are ${ahead} posts`} still to go out, which is a few days of cover and not enough to stop thinking about`,
        permission: 'createWorkflows',
        effect: { type: 'write', what: 'social' },
      });
    }

    if (c.shorts === 0) {
      /* Deliberately still once. A short is a script somebody has to go and
         film, and queueing a new one every day for a customer who has not
         filmed the first is a pile of homework rather than a service. */
      out.push({
        key: 'write-short',
        channels: ['video'],
        scope: 'project',
        kind: 'create',
        summary: 'Write a script for a 30-second video',
        because: 'no short has been made, and a phone video is the cheapest thing this business can put in front of people',
        permission: 'createWorkflows',
        effect: { type: 'write', what: 'short' },
      });
    }
  }

  const active = ws.sequences.filter(s => s.status !== 'archived' && (s.steps?.length ?? 0) > 0);
  const enrolledIds = new Set(ws.enrolments.filter(e => e.status !== 'cancelled').map(e => e.contactId));

  /*
   * ── Another angle, every week ──
   *
   * One sequence is a follow-up. A business that keeps selling needs more than
   * one thing to say: the enquiry that went cold, the customer who bought once,
   * the season, the offer. Writing the first and then stopping is what the old
   * plan did, and it is the difference between a tool that set something up
   * once and a service that keeps working.
   *
   * Weekly rather than daily, deliberately. A blog post a day is a library; an
   * email campaign a day is a list that unsubscribes. The cap is on *writing*
   * them — nobody is enrolled without `sendEmail`, which holds for approval by
   * default, so this produces things to read rather than things that have gone.
   *
   * Four is where it stops. Beyond that a customer is not reading them, and a
   * queue of unread drafts is worse than none because it hides the one that
   * matters.
   */
  if (ws.content?.canWrite && active.length >= 1 && active.length < 4 && canSend) {
    const angles = ['win back a customer who bought once', 'restart an enquiry that went cold', 'introduce what else you do'];
    const angle = angles[Math.min(active.length - 1, angles.length - 1)];
    out.push({
      key: `write-sequence-extra-${active.length}`,
      channels: ['email'],
      kinds: ['leadgen', 'consultancy', 'ecommerce'],
      scope: 'project',
      kind: 'create',
      summary: `Write an email campaign to ${angle}`,
      because: `there ${active.length === 1 ? 'is 1 campaign' : `are ${active.length} campaigns`} here and only one thing to say to anybody who has already had it — a business that keeps selling needs more than one angle`,
      counts: { campaigns: active.length },
      permission: 'createWorkflows',
      effect: { type: 'write', what: 'sequence' },
    });
  }

  /* ── New contacts nobody has started talking to ──
     The most valuable thing a small business fails to do. A lead that arrived
     four days ago and has heard nothing is the cheapest revenue in the
     workspace. */
  if (active.length && canSend) {
    const fresh = ws.contacts.filter(c =>
      c.email && !enrolledIds.has(c.id) && days(c.createdAt) <= 14 && !c.lastContactedAt,
    ).slice(0, BATCH);
    if (fresh.length) {
      const seq = active[0];
      out.push({
        key: `enrol-new:${seq.id}`,
        channels: ['email'],
        kinds: ['leadgen', 'consultancy'],
        scope: 'workspace',
        kind: 'enrol',
        summary: `Start ${fresh.length} new contact${fresh.length === 1 ? '' : 's'} on "${seq.name}"`,
        because: `${fresh.length} contact${fresh.length === 1 ? ' was' : 's were'} added in the last two weeks and ${fresh.length === 1 ? 'has' : 'have'} never been contacted`,
        counts: { contacts: fresh.length },
        permission: 'sendEmail',
        effect: { type: 'enrol', sequenceId: seq.id, contactIds: fresh.map(c => c.id) },
      });
    }
  } else if (ws.contacts.length > 0 && canSend) {
    /*
     * Contacts and nowhere to put them.
     *
     * This used to be the end of the road — a true observation that left the
     * customer to go and build a sequence by hand, which is the one thing they
     * signed up here to avoid. With a key to write with, Autopilot writes the
     * first one instead; without, it can only say so, and does.
     *
     * Writing it does not start it. The first enrolment onto it is still
     * governed by `sendEmail`, which holds for approval by default — so a
     * person reads the emails before anybody receives one.
     */
    if (ws.content?.canWrite) {
      out.push({
        key: 'write-sequence',
        channels: ['email'],
        kinds: ['leadgen', 'consultancy'],
        scope: 'project',
        kind: 'create',
        summary: 'Write a follow-up sequence for new enquiries',
        because: `this workspace has ${ws.contacts.length} contact${ws.contacts.length === 1 ? '' : 's'} and no sequence with any steps in it, so nothing can be followed up`,
        counts: { contacts: ws.contacts.length },
        permission: 'createWorkflows',
        effect: { type: 'write', what: 'sequence' },
        /* Named here so the block below can tell "the first one" apart from
           "another angle", which read identically on the board. */
      });
    } else {
      out.push({
        key: 'no-sequence',
        channels: ['email'],
        kinds: ['leadgen', 'consultancy'],
        scope: 'workspace',
        kind: 'observe',
        summary: 'There are contacts but no email sequence to put them in',
        because: `this workspace has ${ws.contacts.length} contact${ws.contacts.length === 1 ? '' : 's'} and no sequence with any steps in it, and no AI key to write one with`,
        counts: { contacts: ws.contacts.length },
        effect: { type: 'none' },
      });
    }
  }

  /* ── Leads who left a number and no email ──
     The play above only looks at contacts with an email address, so a
     phone-only lead was invisible to Autopilot entirely — and for a trade,
     somebody tapping the number on their phone is the commonest kind there is.
     Deliberately a separate group rather than a fallback, so nobody is
     contacted on two channels for one enquiry. */
  if (ws.canSms) {
    const textable = active.filter(s => (s.steps ?? []).some(st => st?.channel === 'sms'));
    const phoneOnly = ws.contacts.filter(c =>
      c.phone && !c.email && !enrolledIds.has(c.id) && days(c.createdAt) <= 14 && !c.lastContactedAt,
    ).slice(0, BATCH);

    if (textable.length && phoneOnly.length) {
      const seq = textable[0];
      out.push({
        key: `enrol-sms:${seq.id}`,
        channels: ['sms'],
        kinds: ['leadgen', 'consultancy'],
        scope: 'workspace',
        kind: 'enrol',
        summary: `Text ${phoneOnly.length} new lead${phoneOnly.length === 1 ? '' : 's'} on "${seq.name}"`,
        because: phoneOnly.length === 1
          ? 'a lead left a phone number and no email address, and has never been contacted'
          : `${phoneOnly.length} leads left a phone number and no email address, and none has been contacted`,
        counts: { contacts: phoneOnly.length },
        /* Its own guardrail. Somebody who opened email up has not thereby
           agreed to text people, and a text is the more intrusive of the two. */
        permission: 'sendSms',
        effect: { type: 'enrol', sequenceId: seq.id, contactIds: phoneOnly.map(c => c.id) },
      });
    } else if (phoneOnly.length >= 3 && !textable.length) {
      /* Worth saying: from the outside it looks like Autopilot is ignoring
         them, and without anywhere to put them it is. */
      out.push({
        key: 'no-sms-sequence',
        channels: ['sms'],
        kinds: ['leadgen', 'consultancy'],
        scope: 'workspace',
        kind: 'observe',
        summary: `${phoneOnly.length} leads left a phone number and there is no text sequence to put them in`,
        because: 'they have no email address, so an email sequence cannot reach them — a sequence with a text step can',
        counts: { contacts: phoneOnly.length },
        effect: { type: 'none' },
      });
    }
  }

  /* ── Tomorrow's appointments ──
     The highest-value message a trade business sends and the one most often
     skipped, because it has to go out on the evening before, which is exactly
     when nobody is at a desk. A no-show costs the whole slot. */
  const due = ws.tomorrow ?? [];
  const remindable = due.filter(b => (b.hasPhone && ws.canSms) || (b.hasEmail && ws.canEmail));
  if (remindable.length) {
    out.push({
      key: 'remind-bookings',
      channels: ['book'],
      scope: 'workspace',
      kind: 'send',
      summary: `Remind ${remindable.length} ${remindable.length === 1 ? 'person' : 'people'} about tomorrow's appointment`,
      because: remindable.length === 1
        ? 'they have an appointment tomorrow and have not been reminded'
        : `${remindable.length} appointments are booked for tomorrow and none of those people has been reminded`,
      counts: { appointments: remindable.length },
      /*
       * Governed by the appointment guardrail rather than by sendEmail or
       * sendSms, and it defaults to on.
       *
       * This is not outreach. It is a message to somebody who booked a time
       * with this business themselves, about that time, and holding it for
       * approval would mean it went out the morning after the appointment or
       * not at all. The channel guardrails exist to stop Autopilot contacting
       * people who did not ask to be contacted; this person asked.
       */
      permission: 'bookAppointments',
      effect: { type: 'remind_bookings', bookingIds: remindable.map(b => b.id) },
    });
  } else if (due.length) {
    /* Bookings tomorrow and no way to reach any of them. Said, because from
       the outside this is indistinguishable from Autopilot not bothering. */
    out.push({
      key: 'cannot-remind',
      channels: ['book'],
      scope: 'workspace',
      kind: 'observe',
      summary: `${due.length} appointment${due.length === 1 ? ' is' : 's are'} booked for tomorrow and cannot be reminded`,
      because: 'none of those guests has a contactable address on a channel this workspace has set up',
      counts: { appointments: due.length },
      effect: { type: 'none' },
    });
  }

  const deals = allDeals(ws.pipelines);

  /* ── Deals that have stopped moving ──
     14 days is the point at which a deal in most small-business pipelines is
     not slow, it is forgotten. Flagged rather than chased automatically: what
     to say to a stalled deal is a judgement about that customer. */
  /*
   * Measured from the last stage change, or from when the deal was made.
   *
   * `days()` answers Infinity for a missing date, and a deal that has never
   * changed stage has no `lastStageChangedAt` — so this told a workspace
   * forty minutes old that forty-one of its deals "have not moved in two
   * weeks". The deals onboarding creates are exactly that shape. A deal with
   * no date at all cannot be shown to have stalled, so it is not claimed.
   */
  const sinceMoved = (d: Deal): number => {
    const stamp = d.lastStageChangedAt || d.createdAt;
    return stamp ? days(stamp) : 0;
  };
  const stalled = deals.filter(d =>
    (d.status ?? 'active') === 'active' && sinceMoved(d) >= 14,
  ).slice(0, BATCH);
  if (stalled.length) {
    const worth = stalled.reduce((n, d) => n + (Number(d.value) || 0), 0);
    out.push({
      key: 'stalled-deals',
      channels: ['sales'],
      scope: 'workspace',
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
  if (won.length && canSend) {
    out.push({
      key: 'ask-reviews',
      channels: ['reviews'],
      kinds: ['leadgen', 'consultancy'],
      scope: 'workspace',
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
  if (active.length && canSend) {
    const quiet = ws.contacts.filter(c =>
      c.email && !enrolledIds.has(c.id) && c.lastContactedAt && days(c.lastContactedAt) >= 60,
    ).slice(0, BATCH);
    if (quiet.length >= 5) {
      const seq = active[active.length - 1];
      out.push({
        key: `re-engage:${seq.id}`,
        channels: ['email'],
        kinds: ['leadgen', 'consultancy'],
        scope: 'workspace',
        kind: 'enrol',
        summary: `Re-engage ${quiet.length} contacts who have not heard from you in two months`,
        because: `${quiet.length} contacts were last contacted more than 60 days ago and are not in any sequence`,
        counts: { contacts: quiet.length },
        permission: 'sendEmail',
        effect: { type: 'enrol', sequenceId: seq.id, contactIds: quiet.map(c => c.id) },
      });
    }
  }

  /* ── What has been sold ──
     Only reached when the workspace actually sells something. A services
     business has no orders, and every play below would be silent anyway — but
     reading the block as a whole is what makes that obvious. */
  const com = ws.commerce;
  if (com) {
    /* Somebody paid and was never told the order arrived.
       This is the cheapest trust there is, and the one most often skipped: a
       buyer who hears nothing for two days assumes the payment failed and
       either buys again or asks for it back. */
    if (com.unthanked.length && ws.canEmail) {
      const n = com.unthanked.length;
      out.push({
        key: 'thank-buyers',
        channels: ['shop'],
        kinds: ['ecommerce'],
        scope: 'workspace',
        kind: 'send',
        summary: `Tell ${n} buyer${n === 1 ? '' : 's'} their order came through`,
        because: n === 1
          ? 'somebody paid and has not been sent anything confirming it'
          : `${n} people paid and none of them has been sent anything confirming it`,
        counts: { orders: n },
        permission: 'sendEmail',
        effect: { type: 'thank_buyers', orderIds: com.unthanked.map(o => o.id) },
      });
    }

    /* A payment link that was never used.
       One reminder, never a series. The old link has expired by now — Stripe
       gives a Checkout Session 24 hours — so the effect makes a fresh one
       rather than sending a dead URL, which is the failure this play would
       otherwise quietly produce. */
    if (com.unpaid.length && ws.canEmail && com.canCharge) {
      const n = com.unpaid.length;
      out.push({
        key: 'chase-payment',
        channels: ['shop'],
        kinds: ['ecommerce'],
        scope: 'workspace',
        kind: 'send',
        summary: `Send ${n} unpaid order${n === 1 ? '' : 's'} a fresh payment link`,
        because: n === 1
          ? 'a payment link was sent more than a day ago and the order is still unpaid, and that link has now expired'
          : `${n} orders have been unpaid for more than a day, and the links they were sent have now expired`,
        counts: { orders: n },
        permission: 'sendEmail',
        effect: { type: 'chase_payment', orderIds: com.unpaid.map(o => o.id) },
      });
    }

    /* Paid for, made by somebody else, and still sitting here.
       Drafted at the supplier, never confirmed: confirming is what charges the
       customer's supplier account and starts a garment being printed, and
       nothing scheduled should do that on its own. */
    if (com.unfulfilled.length && com.canSupply) {
      const n = com.unfulfilled.length;
      out.push({
        key: 'draft-at-supplier',
        channels: ['shop'],
        kinds: ['ecommerce'],
        scope: 'workspace',
        kind: 'create',
        summary: `Send ${n} paid order${n === 1 ? '' : 's'} to the supplier as ${n === 1 ? 'a draft' : 'drafts'}`,
        because: n === 1
          ? 'it is paid for and made by your supplier, and has not been sent to them'
          : `${n} orders are paid for and made by your supplier, and none has been sent to them`,
        counts: { orders: n },
        permission: 'createWorkflows',
        effect: { type: 'draft_at_supplier', orderIds: com.unfulfilled.map(o => o.id) },
      });
    }

    /* Imported and never put on sale.
       Noticed rather than fixed: what to charge, and whether to sell a thing at
       all, is the business decision this system does not get to make. */
    if (com.draftProducts > 0) {
      out.push({
        key: 'draft-products',
        channels: ['shop'],
        kinds: ['ecommerce'],
        scope: 'workspace',
        kind: 'observe',
        summary: `${com.draftProducts} product${com.draftProducts === 1 ? ' is' : 's are'} still a draft`,
        because: com.draftProducts === 1
          ? 'it was imported from your supplier and has never been made active, so nobody can buy it'
          : `they were imported from your supplier and none has been made active, so nobody can buy any of them`,
        counts: { products: com.draftProducts },
        effect: { type: 'none' },
      });
    }
  }

  /*
   * Only what this kind of project is for.
   *
   * 'general' predates kinds and keeps planning everything: a project that was
   * working yesterday must not have work silently withdrawn because a column
   * was added.
   */
  /* The brief first: it is the narrower of the two, and a project that said
     "social only" must not be handed an email play because its kind is
     general. */
  const focus = ws.focus;
  const inFocus = focus ? out.filter(a => a.channels.some(c => focus.includes(c))) : out;
  if (kind === 'general') return inFocus;
  return inFocus.filter(a => !a.kinds || a.kinds.includes(kind));
}
