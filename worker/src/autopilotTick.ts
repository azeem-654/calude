/**
 * The heartbeat: Autopilot deciding, and Autopilot doing.
 *
 * Two passes, run from the same five-minute cron as the sends.
 *
 *   plan     once a day per workspace. Reads the real records, works out what
 *            should happen, writes it to the ledger — and stops there.
 *   execute  every tick. Takes what is due and carries it out.
 *
 * They are separate on purpose. Planning is cheap and wants to happen rarely;
 * executing is the part that touches the customer's data and wants to happen
 * promptly. Fusing them would mean either re-planning every five minutes — which
 * would produce the same suggestions over and over — or acting only once a day,
 * which makes a queue that a person just approved sit until tomorrow.
 *
 * ── Why an approved action is not carried out by the endpoint ──
 *
 * Approving marks it `pending` and this pass performs it. The endpoint could do
 * it inline and save a few minutes, but then two code paths could send the same
 * email, and the failure mode of that is a customer receiving it twice.
 */
import { dataGet, dataPut, installSecret, nowIso, type Env } from './lib/db';
import { addr } from './lib/http';
import { loadMailbox, loadMailboxes } from './routes/mailbox';
import { encryptSecret } from './lib/crypto';
import { loadSmsConfig, sendSms } from './lib/sms';
import { normaliseTarget, planPool, type PoolState } from './lib/sendingPool';
import {
  createMailbox, credsForMode, poolDomainCandidates, priceDomain,
  record as recordProvisioned, recordPurchase, registerDomain,
} from './lib/provisioning';
import { loadAiKey } from './lib/ai';
import { createPayLink, storefrontReady } from './routes/storefront';
import { draftAtSupplier, supplierReady } from './routes/supplier';
import { buildMime } from './lib/mime';
import { smtpSend } from './lib/smtp';
import {
  writeBlogPost, writeLandingPage, writeSequence, writeShortScript, writeSocialPosts, type Brand,
} from './lib/autopilotWrite';
import { planNext, type PlannedAction, type Workspace, type Contact, type Sequence, type Enrolment, type Pipeline } from './lib/autopilotPlan';

const CONTACTS_KEY = 'crm_contacts';
const SEQ_KEY = 'crm_sequences';
const ENROLL_KEY = 'crm_sequence_enrollments';
const PIPELINES_KEY = 'crm_pipelines';
const REVIEW_REQ_KEY = 'crm_reputation_requests';
const FUNNELS_KEY = 'crm_funnels';
const WEBSITES_KEY = 'crm_websites';
const BLOG_POSTS_KEY = 'crm_blog_posts';
const SOCIAL_KEY = 'crm_social_posts';
const SHORTS_KEY = 'crm_shorts';
const ONBOARDING_KEY = 'crm_onboarding';

/** A day between plans. Anything shorter and the same advice repeats. */
const PLAN_EVERY_MS = 20 * 60 * 60 * 1000;

/** The ceiling on actions carried out per workspace per tick, so one busy
 *  workspace cannot exhaust the Worker's time budget for everyone else. */
const MAX_ACTIONS_PER_TICK = 10;

export interface AutopilotReport {
  planned: number;
  carried: number;
  awaiting: number;
  failed: number;
  notes: string[];
}

function parse<T>(raw: string | null, fallback: T): T {
  if (!raw) return fallback;
  try { return JSON.parse(raw) as T; } catch { return fallback; }
}

/** One project's worth of settings — what a turn of Autopilot runs on. */
interface RunRow {
  id: string;
  account_id: string;
  /** The client this project speaks for. Empty means it cannot write yet. */
  portfolio_id: string;
  name: string;
  objective: string;
  status: string;
  guardrails: string;
  last_planned_at: string | null;
  purchase_mode: string;
  pool_target: string;
}

const rid = () => `ap-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;

/** Read everything a plan needs, in one go. */
/**
 * What the sending pool looks like today.
 *
 * Read from what is actually connected, not from what was once bought: a domain
 * whose DNS was set up on a registrar the customer has since disconnected is
 * not a domain this workspace can send from, and treating it as one produces a
 * plan that thinks the work is done.
 */
async function readPool(env: Env, accountId: string): Promise<PoolState> {
  const mailboxes = await loadMailboxes(env, accountId);
  const byDomain: Record<string, number> = {};
  for (const mb of mailboxes) {
    const addr = mb.from.email || mb.smtp.username;
    const dm = addr.includes('@') ? addr.split('@')[1].toLowerCase() : '';
    if (dm) byDomain[dm] = (byDomain[dm] ?? 0) + 1;
  }

  /* crm_provisioned is infra.ts's own audit of what it set up, which is the
     only record of a domain having had its DNS written. */
  const rows = await env.DB.prepare(
    `SELECT DISTINCT kind, subject FROM crm_provisioned
     WHERE account_id = ? AND outcome = 'ok' AND kind IN ('domain','dns')`,
  ).bind(accountId).all<{ kind: string; subject: string }>();

  const domains = new Set<string>(Object.keys(byDomain));
  const authenticated = new Set<string>();
  for (const r of rows.results ?? []) {
    const dm = (r.subject ?? '').toLowerCase();
    if (!dm) continue;
    domains.add(dm);
    if (r.kind === 'dns') authenticated.add(dm);
  }

  return {
    domains: [...domains],
    mailboxesByDomain: byDomain,
    authenticated: [...authenticated],
  };
}

async function readWorkspace(env: Env, accountId: string, run?: RunRow): Promise<Workspace> {
  const [contacts, sequences, enrolments, pipelines, reviewRequests] = await Promise.all([
    dataGet(env.DB, accountId, CONTACTS_KEY),
    dataGet(env.DB, accountId, SEQ_KEY),
    dataGet(env.DB, accountId, ENROLL_KEY),
    dataGet(env.DB, accountId, PIPELINES_KEY),
    dataGet(env.DB, accountId, REVIEW_REQ_KEY),
  ]);
  const mailbox = await loadMailbox(env, accountId);
  const sms = await loadSmsConfig(env, accountId);

  return {
    contacts: parse<Contact[]>(contacts, []),
    sequences: parse<Sequence[]>(sequences, []),
    enrolments: parse<Enrolment[]>(enrolments, []),
    pipelines: parse<Pipeline[]>(pipelines, []),
    reviewRequests: parse(reviewRequests, []),
    /* "Can send" means validated, not filled in. Planning a campaign around a
       host somebody typed is how a workspace ends up with a queue of messages
       that will never leave. */
    canEmail: !!mailbox?.smtp.host,
    canSms: !!sms?.accountSid && !!sms.fromNumber,
    pool: await poolFor(env, accountId, run),
    content: await contentFor(env, accountId),
    commerce: await commerceFor(env, accountId),
    tomorrow: await bookingsTomorrow(env, accountId),
  };
}

/**
 * Appointments happening tomorrow that nobody has been reminded about.
 *
 * ── Whose "tomorrow" ──
 *
 * `slot_date` is a plain calendar date in the business's own timezone, because
 * that is what a booking page shows and what the owner writes in a diary. So
 * "tomorrow" has to be worked out there too: at 23:00 in Karachi it is still
 * this afternoon in UTC, and a reminder computed from the Worker's clock would
 * go out a day early for half the world and a day late for the other half.
 *
 * The zone comes from the booking page's own settings — the one place in this
 * app a real IANA zone is stored. No zone falls back to UTC, which is wrong by
 * at most a day at the edges and is still better than not reminding anybody.
 */
async function bookingsTomorrow(env: Env, accountId: string): Promise<Workspace['tomorrow']> {
  const sched = parse<{ timezone?: string }>(await dataGet(env.DB, accountId, 'crm_schedule'), {});
  const tz = sched.timezone || 'UTC';

  let target: string;
  try {
    /* en-CA gives YYYY-MM-DD, which is the format slot_date is stored in.
       Formatting the instant 24 hours from now *in that zone* is what makes
       this correct across a DST change, where adding a day to the date string
       would not be. */
    target = new Intl.DateTimeFormat('en-CA', { timeZone: tz })
      .format(new Date(Date.now() + 86_400_000));
  } catch {
    target = new Intl.DateTimeFormat('en-CA', { timeZone: 'UTC' })
      .format(new Date(Date.now() + 86_400_000));
  }

  const { results } = await env.DB.prepare(
    `SELECT id, slot_time, data FROM crm_bookings
     WHERE account_id = ? AND slot_date = ? AND status = 'confirmed' AND reminded_at IS NULL
     ORDER BY slot_time LIMIT 50`,
  ).bind(accountId, target).all<{ id: string; slot_time: string; data: string }>();

  return (results ?? []).map(r => {
    const g = parse<{ guestName?: string; guestEmail?: string; guestPhone?: string }>(r.data, {});
    return {
      id: r.id,
      at: r.slot_time,
      name: g.guestName ?? '',
      hasPhone: !!(g.guestPhone ?? '').trim(),
      hasEmail: !!(g.guestEmail ?? '').trim(),
    };
  });
}

/**
 * What has been sold, and what is stuck.
 *
 * Returns undefined for a workspace with no orders at all, so a services
 * business never sees a commerce play. The alternative — returning zeroes —
 * would be a plumber told every morning that nought products are still drafts.
 *
 * The one-day thresholds are read here rather than in the planner because they
 * are cheaper as SQL, and because the planner is pure and testable precisely
 * by not knowing about a database.
 */
async function commerceFor(env: Env, accountId: string): Promise<Workspace['commerce']> {
  const any = await env.DB.prepare('SELECT 1 AS n FROM crm_orders WHERE account_id = ? LIMIT 1')
    .bind(accountId).first();
  if (!any) return undefined;

  const dayAgo = new Date(Date.now() - 86_400_000).toISOString();

  const unthanked = (await env.DB.prepare(
    `SELECT id, email, total_cents AS total FROM crm_orders
     WHERE account_id = ? AND status IN ('paid','fulfilled') AND thanked_at IS NULL AND email != ''
     ORDER BY placed_at DESC LIMIT 25`,
  ).bind(accountId).all<{ id: string; email: string; total: number }>()).results ?? [];

  /* Only orders that were actually sent a link. An order recorded by hand and
     never given one was never asked for, and chasing it would be the first the
     buyer had heard of it. */
  const unpaid = (await env.DB.prepare(
    `SELECT id, email FROM crm_orders
     WHERE account_id = ? AND status = 'pending' AND stripe_session != ''
       AND chased_at IS NULL AND email != '' AND placed_at < ?
     ORDER BY placed_at DESC LIMIT 25`,
  ).bind(accountId, dayAgo).all<{ id: string; email: string }>()).results ?? [];

  /* Paid, and made by somebody else. Matched per product rather than by a flag
     on the order, so an order of one supplier item and one of the customer's
     own still counts — the supplier line still has to be sent.

     The match is `instr` against the items JSON, which is a substring test and
     not a join. It is sound here because a product id is a generated
     `prod-<base36>-<random>` that cannot appear inside another value, and the
     alternative — a line-items table — is a schema change to serve one query.
     If ids ever become short or human-chosen, this has to become a real join. */
  const unfulfilled = (await env.DB.prepare(
    `SELECT o.id, o.email FROM crm_orders o
     WHERE o.account_id = ? AND o.status = 'paid' AND o.supplier_ref = ''
       AND o.ship_address1 != ''
       AND EXISTS (
         SELECT 1 FROM crm_products p
         WHERE p.account_id = o.account_id AND p.source != 'own' AND p.supplier_ref != ''
           AND instr(o.items, p.id) > 0
       )
     ORDER BY o.placed_at DESC LIMIT 25`,
  ).bind(accountId).all<{ id: string; email: string }>()).results ?? [];

  const drafts = await env.DB.prepare(
    "SELECT count(*) AS n FROM crm_products WHERE account_id = ? AND source != 'own' AND status = 'draft'",
  ).bind(accountId).first<{ n: number }>();

  return {
    unthanked: unthanked.map(o => ({ id: o.id, email: o.email, total: o.total })),
    unpaid: unpaid.map(o => ({ id: o.id, email: o.email, days: 1 })),
    unfulfilled: unfulfilled.map(o => ({ id: o.id, email: o.email })),
    draftProducts: drafts?.n ?? 0,
    canCharge: await storefrontReady(env, accountId),
    canSupply: await supplierReady(env, accountId),
  };
}

/** How much this workspace has published, and whether Autopilot can write more. */
async function contentFor(env: Env, accountId: string): Promise<Workspace['content']> {
  const count = async (key: string) =>
    parse<unknown[]>(await dataGet(env.DB, accountId, key), []).length;
  return {
    funnels: await count(FUNNELS_KEY),
    websites: await count(WEBSITES_KEY),
    blogPosts: await count(BLOG_POSTS_KEY),
    socialPosts: await count(SOCIAL_KEY),
    shorts: await count(SHORTS_KEY),
    /* No key, no writing. Planning "write a landing page" for a workspace that
       cannot write one produces a queue item that fails every tick. */
    canWrite: !!(await loadAiKey(env, accountId)),
  };
}

/** What the writers need to know about the business. */
/**
 * The client this project writes for.
 *
 * Read from the project's own portfolio, not from the workspace's onboarding
 * profile. That distinction is the whole point of projects: an agency's
 * sub-account running work for a dental practice and a gym must not describe
 * one in the other's words, and before this every writer read the single
 * workspace profile and would have done exactly that.
 *
 * The workspace profile is still the fallback, for a project whose portfolio
 * was deleted out from under it — better a slightly wrong voice than a blank
 * one, and the board says when a portfolio is missing.
 */
async function brandFor(env: Env, accountId: string, run: RunRow): Promise<Brand> {
  let ob: Record<string, string> = {};
  if (run.portfolio_id) {
    const row = await env.DB.prepare('SELECT profile FROM crm_portfolios WHERE id = ? AND account_id = ?')
      .bind(run.portfolio_id, accountId).first<{ profile: string }>();
    ob = parse<Record<string, string>>(row?.profile ?? '', {});
  }
  if (!ob.companyName) {
    ob = { ...parse<Record<string, string>>(await dataGet(env.DB, accountId, ONBOARDING_KEY), {}), ...ob };
  }
  return {
    companyName: ob.companyName ?? ob.businessName ?? '',
    industry: ob.industry ?? '',
    description: ob.description ?? ob.whatYouDo ?? '',
    products: ob.products ?? ob.services ?? '',
    audience: ob.audience ?? ob.idealCustomer ?? '',
    tone: ob.brandVoice ?? ob.tone ?? '',
    website: ob.website ?? '',
    /* The project's objective, not the workspace's — it is what this
       particular push is trying to achieve. */
    objective: run.objective ?? '',
  };
}

/**
 * The pool, only when a target has been set.
 *
 * No target means the customer has not asked Autopilot to build one, and
 * inventing a default here would have it proposing to spend money on domains
 * nobody asked for.
 */
async function poolFor(env: Env, accountId: string, run?: RunRow): Promise<Workspace['pool']> {
  if (!run?.pool_target || run.pool_target === '{}') return undefined;
  const target = normaliseTarget(parse<{ domains?: number; mailboxesPerDomain?: number }>(run.pool_target, {}));
  const state = await readPool(env, accountId);
  const mode = run.purchase_mode === 'managed' ? 'managed' : 'byo';

  /* Whether anything *can* be bought, answered from the right table for the
     mode. Managed reads the operator's account; bring-your-own reads the
     customer's own. They are never the same row. */
  const canBuy = mode === 'managed'
    ? !!(await env.DB.prepare("SELECT 1 AS n FROM crm_install_providers WHERE kind = 'registrar' AND credentials != ''").first())
    : !!(await env.DB.prepare("SELECT 1 AS n FROM crm_providers WHERE account_id = ? AND kind = 'registrar'").bind(accountId).first());

  return { steps: planPool(state, target), mode, canBuy };
}

/**
 * Decide, and write the decisions down.
 *
 * An action whose `key` already has an open row is skipped rather than added
 * again — otherwise every daily plan would stack another copy of "start 12 new
 * contacts" on top of yesterday's, and the queue would grow for ever while
 * nothing new was actually true.
 */
async function planFor(
  env: Env, run: RunRow, report: AutopilotReport,
  /*
   * Workspace-scoped summaries already planned during *this run*, shared by
   * every project in the workspace.
   *
   * A database check alone is not enough: each project plans and then executes
   * before the next one plans, so a workspace play created by the first project
   * and carried out in the same tick is neither pending nor awaiting by the
   * time the second asks — and gets planned again. That is precisely how "send
   * 3 paid orders to the supplier" appeared twice. This set is the memory the
   * query cannot have.
   */
  plannedThisRun: Set<string>,
): Promise<void> {
  const accountId = run.account_id;
  const ws = await readWorkspace(env, accountId, run);
  const planned = planNext(ws);
  if (!planned.length) return;

  /*
   * Two dedupe questions, because there are two kinds of fact.
   *
   * A project's own work — the blog post, the landing page, the sequence in
   * this client's voice — is deduped within the project: two projects should
   * each get one, and checking across them would silence the second.
   *
   * A fact about the workspace — its orders, contacts, deals, diary — is
   * deduped across every project, because there is one set of those however
   * many projects are running. Without this a workspace with two projects
   * planned "send 3 paid orders to the supplier" twice, and the only thing
   * between that and two parcels was a marker check further down.
   */
  const mine = await env.DB.prepare(
    `SELECT summary FROM crm_autopilot_actions
     WHERE account_id = ? AND project_id = ? AND status IN ('pending','awaiting')`,
  ).bind(accountId, run.id).all<{ summary: string }>();
  const openInProject = new Set((mine.results ?? []).map(r => r.summary));

  const theirs = await env.DB.prepare(
    `SELECT summary FROM crm_autopilot_actions
     WHERE account_id = ? AND status IN ('pending','awaiting')`,
  ).bind(accountId).all<{ summary: string }>();
  const openInWorkspace = new Set([
    ...(theirs.results ?? []).map(r => r.summary),
    ...plannedThisRun,
  ]);

  const guardrails = parse<Record<string, string>>(run.guardrails, {});
  const now = nowIso();

  for (const a of planned) {
    const already = a.scope === 'workspace' ? openInWorkspace : openInProject;
    if (already.has(a.summary)) continue;
    already.add(a.summary);
    /* Remembered for the rest of this run, so the next project in the same
       workspace does not plan the same workspace fact again. */
    if (a.scope === 'workspace') plannedThisRun.add(a.summary);

    /*
     * The guardrail decides whether this waits for a person.
     *
     * 'approval' is the default for sending, so the first campaign of each kind
     * is seen by a human before it goes anywhere. Once they open that channel
     * up, everything after runs without asking — which is the difference
     * between supervised and interrogative.
     */
    const permission = a.permission ? (guardrails[a.permission] ?? 'approval') : 'on';
    if (permission === 'off') continue;

    /*
     * A finding is not a task.
     *
     * `observe` and `error` have nothing to carry out — noticing is the whole
     * action. Sending them through the execution pass marked them "Done", which
     * reads as though Autopilot fixed the thing it was warning about. They are
     * recorded as they are, once, and the pass never sees them.
     */
    const informational = a.effect.type === 'none';
    const status = informational ? 'done'
      : permission === 'approval' ? 'awaiting'
      : 'pending';

    const rowId = rid();
    await env.DB.prepare(
      `INSERT INTO crm_autopilot_actions
       (id, account_id, project_id, kind, status, summary, because, counts, effect, due_at, created_at)
       VALUES (?,?,?,?,?,?,?,?,?,?,?)`,
    ).bind(
      rowId, accountId, run.id, a.kind, status, a.summary, a.because,
      JSON.stringify(a.counts ?? {}),
      /* Its own column, not `detail`. `detail` is what happened, written at the
         end; putting both in one place meant approving an action erased what it
         was supposed to do — and the tick then reported success having sent
         nothing. */
      JSON.stringify(a.effect),
      null, now,
    ).run();

    if (informational) {
      await env.DB.prepare('UPDATE crm_autopilot_actions SET acted_at = ? WHERE id = ?')
        .bind(now, rowId).run();
    }

    report.planned++;
    if (status === 'awaiting') report.awaiting++;
  }

  await env.DB.prepare('UPDATE crm_projects SET last_planned_at = ?, status = ?, updated_at = ? WHERE id = ?')
    .bind(now, run.status === 'learning' ? 'running' : run.status, now, run.id).run();
}

/** Carry out one action. Returns what to record against it. */
async function carryOut(
  env: Env,
  accountId: string,
  effect: PlannedAction['effect'],
  /* The project this is being done for. Everything written is stamped with it,
     so a board can group the work and a link can come back to the right one. */
  run: RunRow,
): Promise<{ ok: boolean; detail: string; link?: { kind: string; id: string; label: string; route: string } }> {
  if (effect.type === 'enrol') {
    const seqs = parse<Sequence[]>(await dataGet(env.DB, accountId, SEQ_KEY), []);
    const seq = seqs.find(s => s.id === effect.sequenceId);
    if (!seq) return { ok: false, detail: 'That sequence no longer exists.' };

    const enrolments = parse<Record<string, unknown>[]>(await dataGet(env.DB, accountId, ENROLL_KEY), []);
    const already = new Set(enrolments.map(e => `${e.contactId}:${e.sequenceId}`));
    const now = nowIso();
    let added = 0;

    for (const contactId of effect.contactIds) {
      if (already.has(`${contactId}:${seq.id}`)) continue;
      enrolments.push({
        id: `enr-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
        contactId, sequenceId: seq.id, sequenceName: seq.name,
        status: 'active', currentStep: 0, totalSteps: seq.steps?.length ?? 0,
        enrolledAt: now,
        /* Due immediately: the send pass in the same tick picks these up, so a
           lead added this morning is contacted this morning. */
        nextSendAt: now,
        history: [],
      });
      added++;
    }
    if (added) await dataPut(env.DB, accountId, ENROLL_KEY, JSON.stringify(enrolments));
    return {
      ok: true,
      detail: added ? `${added} enrolled.` : 'They were all already enrolled.',
      link: { kind: 'sequence', id: seq.id, label: seq.name, route: '/marketing?tab=sequences' },
    };
  }

  if (effect.type === 'review_request') {
    const reqs = parse<Record<string, unknown>[]>(await dataGet(env.DB, accountId, REVIEW_REQ_KEY), []);
    const already = new Set(reqs.map(r => String(r.contactId ?? '')));
    const now = nowIso();
    let added = 0;
    for (const contactId of effect.contactIds) {
      if (already.has(contactId)) continue;
      reqs.push({
        id: `rr-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
        contactId, status: 'queued', channel: 'email', createdAt: now,
        source: { origin: 'autopilot', title: 'Autopilot', at: now },
      });
      added++;
    }
    if (added) await dataPut(env.DB, accountId, REVIEW_REQ_KEY, JSON.stringify(reqs));
    return {
      ok: true,
      detail: added ? `${added} queued in Reviews.` : 'They had all been asked already.',
      link: { kind: 'review-request', id: 'queue', label: 'Review requests', route: '/reputation' },
    };
  }

  if (effect.type === 'pool_step') {
    return carryOutPoolStep(env, accountId, effect, run);
  }

  if (effect.type === 'write') {
    return carryOutWrite(env, accountId, effect.what, run);
  }

  if (effect.type === 'thank_buyers' || effect.type === 'chase_payment') {
    return carryOutBuyerEmail(env, accountId, effect);
  }

  if (effect.type === 'draft_at_supplier') {
    return carryOutSupplierDraft(env, accountId, effect.orderIds);
  }

  if (effect.type === 'remind_bookings') {
    return carryOutReminders(env, accountId, effect.bookingIds);
  }

  if (effect.type === 'flag_stalled') {
    /* Flagged, not chased. What to say to a stalled deal is a judgement about
       that particular customer, and a generic nudge sent automatically is worse
       than the silence it replaces. */
    return {
      ok: true,
      detail: `${effect.dealIds.length} deal(s) worth a look.`,
      link: { kind: 'pipeline', id: 'stalled', label: 'Deals that stopped moving', route: '/pipelines' },
    };
  }

  return { ok: true, detail: '' };
}

/**
 * Remind people about tomorrow's appointment.
 *
 * Texted where there is a number, emailed where there is not. A text is the
 * right default here and the wrong one almost everywhere else in this app: it
 * is read within minutes, which is the entire point of a reminder sent the
 * evening before, and it goes to somebody who chose a time with this business
 * rather than to a stranger.
 *
 * Each booking is re-read at send time. Between the plan and this running,
 * somebody may have cancelled — and "don't forget your appointment tomorrow"
 * arriving after they cancelled it is worse than no reminder at all.
 */
async function carryOutReminders(
  env: Env, accountId: string, bookingIds: string[],
): Promise<{ ok: boolean; detail: string; link?: { kind: string; id: string; label: string; route: string } }> {
  const mb = await loadMailbox(env, accountId);
  const sms = await loadSmsConfig(env, accountId);
  const profile = parse<{ companyName?: string }>(await dataGet(env.DB, accountId, ONBOARDING_KEY), {});
  const company = profile.companyName || mb?.from.name || 'us';

  let sent = 0, skipped = 0;
  const failures: string[] = [];

  for (const id of bookingIds) {
    const row = await env.DB.prepare(
      "SELECT id, slot_date, slot_time, status, data, reminded_at FROM crm_bookings WHERE id = ? AND account_id = ?",
    ).bind(id, accountId).first<{ id: string; slot_date: string; slot_time: string; status: string; data: string; reminded_at: string | null }>();
    /* Cancelled since the plan was written, or already reminded by a tick that
       was cut short. Either way, not again. */
    if (!row || row.status !== 'confirmed' || row.reminded_at) { skipped++; continue; }

    const g = parse<{ guestName?: string; guestEmail?: string; guestPhone?: string }>(row.data, {});
    const who = (g.guestName ?? '').trim().split(' ')[0] || 'there';
    const when = `${row.slot_time}`;
    const phone = (g.guestPhone ?? '').trim();
    const email = addr(g.guestEmail);

    let ok = false;
    let why = '';

    if (phone && sms?.accountSid && sms.fromNumber) {
      /* Short, and it says who it is from — a reminder from an unknown number
         reads as spam and gets ignored, which defeats the purpose. */
      const text = `Hi ${who}, a reminder of your appointment with ${company} tomorrow at ${when}. Reply STOP to opt out.`;
      const r = await sendSms(env, sms, phone, text, accountId);
      ok = r.ok;
      why = r.error;
    } else if (email && mb?.smtp.host) {
      const fromEmail = mb.from.email || mb.smtp.username;
      const mime = buildMime({
        fromName: mb.from.name || company, fromEmail, to: email,
        subject: `Reminder: your appointment tomorrow at ${when}`,
        html: `<p>Hi ${esc(who)},</p><p>Just a reminder of your appointment with ${esc(company)} <strong>tomorrow at ${esc(when)}</strong>.</p><p>If that no longer suits, reply to this message and we will move it.</p><p>${esc(company)}</p>`,
        replyTo: mb.from.replyTo || undefined,
      }, mb.smtp.host);
      const r = await smtpSend(mb.smtp, { from: fromEmail, to: email, mime });
      ok = r.ok;
      why = r.error;
    } else {
      skipped++;
      continue;
    }

    if (!ok) { failures.push(`${g.guestName || id}: ${why.slice(0, 120)}`); continue; }

    /* Stamped only now, so a reminder lost to a dead host is tried again on the
       next tick rather than counted as delivered. */
    await env.DB.prepare('UPDATE crm_bookings SET reminded_at = ? WHERE id = ? AND account_id = ?')
      .bind(nowIso(), id, accountId).run();
    sent++;
  }

  const detail = [
    sent ? `${sent} reminded.` : '',
    skipped ? `${skipped} skipped — cancelled, already reminded, or no way to reach them.` : '',
    failures.length ? `${failures.length} failed: ${failures.slice(0, 3).join('; ')}` : '',
  ].filter(Boolean).join(' ') || 'Nothing needed reminding.';

  return {
    ok: failures.length === 0,
    detail,
    link: { kind: 'appointment', id: 'tomorrow', label: "Tomorrow's appointments", route: '/calendar' },
  };
}

/**
 * Tell a buyer their order arrived, or send them a working link to pay for it.
 *
 * ── Why the order is re-read here ──
 *
 * The plan named order ids and not their contents. Between the plan being
 * written and this running, a buyer may have paid — and chasing somebody for
 * money they have already handed over is the single worst thing this play could
 * do. So each order is checked again, now, and skipped if it has moved on.
 *
 * ── Why a new payment link ──
 *
 * Stripe expires a Checkout Session after 24 hours, and this play only fires on
 * orders older than that. Re-sending the stored URL would post a dead link to
 * somebody who was trying to buy something.
 */
async function carryOutBuyerEmail(
  env: Env,
  accountId: string,
  effect: { type: 'thank_buyers' | 'chase_payment'; orderIds: string[] },
): Promise<{ ok: boolean; detail: string; link?: { kind: string; id: string; label: string; route: string } }> {
  const chasing = effect.type === 'chase_payment';

  const mb = await loadMailbox(env, accountId);
  if (!mb?.smtp.host) return { ok: false, detail: 'No mailbox is connected, so nothing could be sent.' };

  const origin = env.APP_ORIGIN ?? '';
  if (chasing && !origin) {
    /* Named rather than guessed. A Checkout Session needs an absolute return
       address, and inventing one would send buyers to a page that does not
       exist. */
    return { ok: false, detail: 'APP_ORIGIN is not set on this deployment, so a fresh payment link could not be made.' };
  }

  const profile = parse<{ companyName?: string }>(await dataGet(env.DB, accountId, ONBOARDING_KEY), {});
  const company = profile.companyName || mb.from.name || 'us';
  const fromEmail = mb.from.email || mb.smtp.username;

  let sent = 0;
  let skipped = 0;
  const failures: string[] = [];

  for (const id of effect.orderIds) {
    const o = await env.DB.prepare(
      'SELECT id, email, total_cents, currency, status, chased_at, thanked_at FROM crm_orders WHERE id = ? AND account_id = ?',
    ).bind(id, accountId).first<{
      id: string; email: string; total_cents: number; currency: string;
      status: string; chased_at: string | null; thanked_at: string | null;
    }>();
    if (!o || !o.email) { skipped++; continue; }

    /* Still true? Both halves matter: the status may have changed, and the
       marker may have been set by an earlier tick that was cut short. */
    if (chasing && (o.status !== 'pending' || o.chased_at)) { skipped++; continue; }
    if (!chasing && (!['paid', 'fulfilled'].includes(o.status) || o.thanked_at)) { skipped++; continue; }

    const money = `${(o.total_cents / 100).toFixed(2)} ${o.currency || 'USD'}`;
    let subject: string;
    let html: string;

    if (chasing) {
      const link = await createPayLink(env, accountId, o.id, origin);
      if (!link.ok) { failures.push(`${o.email}: ${link.error}`); continue; }
      subject = `Your order is still waiting — ${company}`;
      html = [
        `<p>Hello,</p>`,
        `<p>You started an order with ${esc(company)} for ${esc(money)} and it has not been paid for yet. The link you were sent has since expired, so here is a new one:</p>`,
        `<p><a href="${esc(link.url)}">Pay for your order</a></p>`,
        `<p>This link works for the next 24 hours. If you have changed your mind, you can ignore this — we will not send another.</p>`,
        `<p>${esc(company)}</p>`,
      ].join('');
    } else {
      subject = `We have your order — ${company}`;
      html = [
        `<p>Hello,</p>`,
        `<p>Thank you — your payment of ${esc(money)} came through and your order is confirmed.</p>`,
        `<p>We will be in touch as soon as it is on its way. If anything about it is wrong, just reply to this message.</p>`,
        `<p>${esc(company)}</p>`,
      ].join('');
    }

    const mime = buildMime({
      fromName: mb.from.name || company, fromEmail, to: o.email, subject, html,
      replyTo: mb.from.replyTo || undefined,
    }, mb.smtp.host);

    const r = await smtpSend(mb.smtp, { from: fromEmail, to: o.email, mime });
    if (!r.ok) { failures.push(`${o.email}: ${r.error.slice(0, 120)}`); continue; }

    /* Stamped only after the send succeeded. Stamping first would lose a
       follow-up to a transient SMTP failure and never try again. */
    await env.DB.prepare(
      `UPDATE crm_orders SET ${chasing ? 'chased_at' : 'thanked_at'} = ?, updated_at = ? WHERE id = ? AND account_id = ?`,
    ).bind(nowIso(), nowIso(), o.id, accountId).run();
    sent++;
  }

  /* Partial is reported as partial. "3 sent" when two bounced is the kind of
     success report that gets found out by a customer, not by us. */
  const detail = [
    sent ? `${sent} sent.` : '',
    skipped ? `${skipped} skipped — no longer ${chasing ? 'unpaid' : 'unacknowledged'}.` : '',
    failures.length ? `${failures.length} failed: ${failures.slice(0, 3).join('; ')}` : '',
  ].filter(Boolean).join(' ') || 'Nothing needed sending.';

  return {
    ok: failures.length === 0,
    detail,
    link: { kind: 'order', id: 'orders', label: chasing ? 'Unpaid orders' : 'Orders', route: '/sell' },
  };
}

/** Escape for an HTML body. A buyer's own company name can contain an
 *  apostrophe or an ampersand, and neither belongs in raw markup. */
function esc(v: string): string {
  return v.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

/**
 * Send paid orders to the supplier, as drafts.
 *
 * Never confirmed. Confirming charges the customer's supplier account and
 * starts a garment being printed, and no scheduled run gets to do that — the
 * same rule buying a domain follows.
 */
async function carryOutSupplierDraft(
  env: Env, accountId: string, orderIds: string[],
): Promise<{ ok: boolean; detail: string; link?: { kind: string; id: string; label: string; route: string } }> {
  let drafted = 0;
  const failures: string[] = [];
  const partial: string[] = [];

  for (const id of orderIds) {
    const r = await draftAtSupplier(env, accountId, id);
    if (!r.ok) { failures.push(`${id}: ${r.error.slice(0, 120)}`); continue; }
    drafted++;
    if (r.notSupplied.length) partial.push(`${id} (${r.notSupplied.join(', ')} left for you)`);
  }

  const detail = [
    drafted ? `${drafted} drafted at the supplier — nothing is charged or made until you confirm.` : '',
    partial.length ? `Partly: ${partial.slice(0, 3).join('; ')}.` : '',
    failures.length ? `${failures.length} failed: ${failures.slice(0, 3).join('; ')}` : '',
  ].filter(Boolean).join(' ') || 'Nothing needed sending.';

  return {
    ok: failures.length === 0,
    detail,
    link: { kind: 'order', id: 'orders', label: 'Orders', route: '/sell' },
  };
}

/**
 * Actually build a piece of the sending pool.
 *
 * This used to record that the step was "cleared to go" and point at the
 * Infrastructure screen — an honest placeholder, but a placeholder: a customer
 * who approved "register two domains" still had to go and do it. It now buys,
 * on whichever account the workspace's mode says, and records the cost.
 *
 * Every path through here writes to crm_provisioned whether it worked or not.
 * A purchase that failed silently is worse than one that failed loudly, because
 * the next plan will look at an unbuilt pool and cheerfully propose buying it
 * again.
 */
async function carryOutPoolStep(
  env: Env,
  accountId: string,
  effect: { type: 'pool_step'; step: string; detail: string },
  run: RunRow,
): Promise<{ ok: boolean; detail: string; link?: { kind: string; id: string; label: string; route: string } }> {
  const step = parse<{ count?: number; domain?: string; domains?: string[]; addresses?: number }>(effect.detail, {});
  /* The project's own buying mode. Two projects in a workspace can legitimately
     differ — one on the customer's registrar, one on ours. */
  const mode = run.purchase_mode === 'managed' ? 'managed' : 'byo';

  if (effect.step === 'register_domain') {
    const reg = await credsForMode(env, accountId, 'registrar', mode);
    if (!reg) {
      return { ok: false, detail: mode === 'managed'
        ? 'Managed buying is not switched on for this installation, so nothing could be bought.'
        : 'No registrar is connected, so there was nowhere to buy a domain from.' };
    }

    /* A name based on the business, not the business's own domain: a filtered
       cold campaign should cost the reputation of a throwaway rather than of
       the address invoices come from. */
    const profile = parse<{ companyName?: string }>(await dataGet(env.DB, accountId, 'crm_onboarding'), {});
    const base = (profile.companyName || 'business').toLowerCase().replace(/[^a-z0-9]/g, '');
    const wanted = Math.min(Math.max(step.count ?? 1, 1), 5);

    const bought: string[] = [];
    let spent = 0;
    const problems: string[] = [];

    for (const candidate of poolDomainCandidates(base)) {
      if (bought.length >= wanted) break;
      const check = await priceDomain(reg.provider, reg.creds, candidate);
      if (!check.available) continue;
      const r = await registerDomain(reg.provider, reg.creds, candidate, 1);
      await recordProvisioned(env, accountId, 'domain', candidate, reg.provider,
        r.ok ? 'ok' : 'failed', r.ok ? `${r.cost}` : r.error);
      if (r.ok) {
        bought.push(candidate);
        spent += r.cost;
        /* Only a managed purchase is billable — a customer buying on their own
           registrar has already been charged by it directly. */
        if (reg.managed) {
          await recordPurchase(env, accountId, 'domain', candidate, reg.provider, r.cost, r.cost, 'ok', '1 year');
        }
      } else {
        problems.push(`${candidate}: ${r.error}`);
      }
    }

    if (!bought.length) {
      return { ok: false, detail: problems.length
        ? problems[0].slice(0, 200)
        : 'None of the names tried was available. Choose one yourself in Infrastructure.' };
    }
    return {
      ok: true,
      detail: `Registered ${bought.join(', ')}${spent > 0 ? ` for ${spent.toFixed(2)}` : ''}.`,
      link: { kind: 'domain', id: bought[0], label: bought[0], route: '/settings?tab=infrastructure' },
    };
  }

  if (effect.step === 'create_mailboxes') {
    const domain = String(step.domain ?? '');
    const mbp = await credsForMode(env, accountId, 'mailbox', mode);
    if (!mbp) return { ok: false, detail: 'No mailbox provider is connected, so no addresses could be created.' };

    /* Ordinary-looking names. A pool of sales1@, sales2@, sales3@ is a pattern
       a spam filter can see from orbit. */
    const names = ['hello', 'team', 'hi', 'contact', 'enquiries', 'info', 'mail', 'office', 'desk', 'reach'];
    const wanted = Math.min(Math.max(step.count ?? 1, 1), 10);
    const made: string[] = [];
    const problems: string[] = [];

    for (const name of names) {
      if (made.length >= wanted) break;
      const r = await createMailbox(mbp.provider, mbp.creds, domain, name);
      await recordProvisioned(env, accountId, 'mailbox', r.item, mbp.provider,
        r.ok ? 'ok' : 'failed', r.ok ? '' : r.error);
      if (r.ok && r.secret) {
        made.push(r.item);
        if (mbp.managed) {
          await recordPurchase(env, accountId, 'mailbox', r.item, mbp.provider, 0, 0, 'ok', '');
        }
        /* Saved here, immediately, because the provider will never show this
           password again — and a mailbox whose password was lost is a mailbox
           that has to be deleted and made a second time. */
        await env.DB.prepare(
          `INSERT INTO crm_mailbox_accounts
           (id, account_id, label, is_primary, smtp_host, smtp_port, smtp_encryption, smtp_username, smtp_password,
            from_name, from_email, imap_host, imap_port, imap_encryption, imap_username, imap_password, imap_folder,
            created_at, updated_at)
           VALUES (?,?,?,0,'smtp.migadu.com',587,'tls',?,?,?,?,'imap.migadu.com',993,'ssl',?,?, 'INBOX', ?,?)`,
        ).bind(
          `mb-${crypto.randomUUID()}`, accountId, r.item,
          r.secret.address, await encryptSecret(await installSecret(env.DB, 'mailbox_key'), r.secret.password),
          '', r.secret.address,
          r.secret.address, await encryptSecret(await installSecret(env.DB, 'mailbox_key'), r.secret.password),
          nowIso(), nowIso(),
        ).run();
      } else if (!r.ok) {
        problems.push(r.error);
      }
    }

    if (!made.length) {
      return { ok: false, detail: problems[0]?.slice(0, 200) ?? 'No mailboxes could be created.' };
    }
    return {
      ok: true,
      detail: `Created ${made.join(', ')}. They are connected and ready to validate.`,
      link: { kind: 'mailbox', id: made[0], label: made[0], route: '/settings?tab=email-sms' },
    };
  }

  /* authenticate and warm_up cost nothing and touch DNS or a schedule rather
     than a provider account. Both are pointed at their own screens, which is
     the truth rather than a placeholder: applying DNS needs the customer to see
     what is being written to their zone. */
  if (effect.step === 'authenticate') {
    return {
      ok: true,
      detail: 'Open Infrastructure to write SPF, DKIM and DMARC — you should see the records before they go into your zone.',
      link: { kind: 'domain', id: 'dns', label: 'DNS records', route: '/settings?tab=infrastructure' },
    };
  }
  if (effect.step === 'warm_up') {
    return {
      ok: true,
      detail: 'Warm-up runs from the Deliverability screen, where the ramp is set.',
      link: { kind: 'mailbox', id: 'warmup', label: 'Warm-up', route: '/settings?tab=email-sms' },
    };
  }

  return { ok: true, detail: '' };
}

/**
 * Write something, and file it where the module that owns it will find it.
 *
 * Everything lands as a *draft*, stamped as Autopilot's. A landing page that
 * went live the moment a model finished writing it would be a business's public
 * face chosen by nobody — and the customer would find out when somebody
 * mentioned the wording. Drafting removes the blank page, which is the thing
 * that actually stops a plumber ever publishing, and leaves the decision where
 * it belongs.
 */
async function carryOutWrite(
  env: Env,
  accountId: string,
  what: 'landing' | 'blog' | 'social' | 'short' | 'sequence',
  run: RunRow,
): Promise<{ ok: boolean; detail: string; link?: { kind: string; id: string; label: string; route: string } }> {
  const apiKey = await loadAiKey(env, accountId);
  if (!apiKey) return { ok: false, detail: 'No AI key is set up, so nothing could be written. Add one in Settings → AI Engine.' };
  const brand = await brandFor(env, accountId, run);
  const now = nowIso();

  /* The stamp every generated record carries, so a list full of them can still
     be traced back to the run that made it. Matches src/types/provenance.ts. */
  /* Stamped with the project, so a record can be traced back to the run that
     made it *and* to the client it was written for — two projects in one
     workspace produce work that otherwise looks identical in a list. */
  const source = {
    origin: 'autopilot', title: 'AI Autopilot', route: '/autopilot',
    projectId: run.id, projectName: run.name, at: now,
  };

  const push = async (key: string, row: Record<string, unknown>) => {
    const list = parse<Record<string, unknown>[]>(await dataGet(env.DB, accountId, key), []);
    list.unshift(row);
    await dataPut(env.DB, accountId, key, JSON.stringify(list.slice(0, 500)));
  };

  if (what === 'sequence') {
    const r = await writeSequence(apiKey, brand);
    if (!r.ok || !r.value) return { ok: false, detail: r.error };
    const v = r.value;
    const steps = (v.steps ?? []).slice(0, 6).filter(st => (st.subject ?? '').trim() && (st.body ?? '').trim());
    if (!steps.length) return { ok: false, detail: 'The model returned a sequence with no usable steps.' };

    const id = `seq-${crypto.randomUUID()}`;
    const seqs = parse<Record<string, unknown>[]>(await dataGet(env.DB, accountId, SEQ_KEY), []);
    seqs.unshift({
      id,
      name: (v.name || 'New enquiry follow-up').slice(0, 90),
      /*
       * Active, not draft — and this is the one place in the writing where
       * that is right.
       *
       * A sequence is inert until somebody is enrolled on it, and the only
       * thing that enrols anybody is a play governed by `sendEmail`, which
       * holds for approval by default. So a person still reads these before a
       * single one goes out. Filing it as a draft would instead mean the
       * enrolment play could never see it, and Autopilot would go on reporting
       * that there is nowhere to put anybody while its own sequence sat there.
       */
      status: 'active',
      source,
      createdAt: now,
      steps: steps.map((st, i) => ({
        id: `st-${crypto.randomUUID()}`,
        day: Math.min(Math.max(Math.round(Number(st.day) || (i * 2)), 0), 90),
        waitUnit: 'days',
        subject: String(st.subject).slice(0, 200),
        body: String(st.body).slice(0, 8000),
        channel: 'email',
      })),
    });
    await dataPut(env.DB, accountId, SEQ_KEY, JSON.stringify(seqs.slice(0, 200)));

    return {
      ok: true,
      detail: `"${v.name}" written, ${steps.length} emails. Nobody is enrolled yet — read them first, and the first enrolment still asks you.`,
      link: { kind: 'sequence', id, label: v.name, route: '/marketing?tab=sequences' },
    };
  }

  if (what === 'landing') {
    const r = await writeLandingPage(apiKey, brand);
    if (!r.ok || !r.value) return { ok: false, detail: r.error };
    const v = r.value;
    const id = `fn-${crypto.randomUUID()}`;
    await push(FUNNELS_KEY, {
      id, name: v.headline.slice(0, 90), status: 'draft', source, createdAt: now,
      steps: [{
        id: `st-${crypto.randomUUID()}`, type: 'landing', name: v.headline.slice(0, 90),
        headline: v.headline, subheadline: v.subhead,
        bullets: v.bullets, ctaText: v.cta,
        sections: v.sections,
      }],
    });
    return {
      ok: true,
      detail: `Drafted "${v.headline}". Nothing is live until you publish it.`,
      link: { kind: 'funnel', id, label: v.headline.slice(0, 60), route: '/funnels' },
    };
  }

  if (what === 'blog') {
    const r = await writeBlogPost(apiKey, brand);
    if (!r.ok || !r.value) return { ok: false, detail: r.error };
    const v = r.value;
    const id = `bp-${crypto.randomUUID()}`;
    await push(BLOG_POSTS_KEY, {
      id, title: v.title, slug: v.slug, excerpt: v.excerpt, body: v.body,
      keywords: v.keywords, status: 'draft', source, createdAt: now, updatedAt: now,
    });
    return {
      ok: true,
      detail: `Drafted "${v.title}". Read it before it goes anywhere.`,
      link: { kind: 'blog-post', id, label: v.title.slice(0, 60), route: '/blog-automation' },
    };
  }

  if (what === 'social') {
    const r = await writeSocialPosts(apiKey, brand, 5);
    if (!r.ok || !r.value?.posts?.length) return { ok: false, detail: r.error || 'Nothing usable came back.' };
    for (const p of r.value.posts.slice(0, 10)) {
      await push(SOCIAL_KEY, {
        id: `sp-${crypto.randomUUID()}`,
        platform: p.platform || 'facebook',
        content: p.body, hashtags: p.hashtags ?? [],
        status: 'draft', source, createdAt: now,
      });
    }
    return {
      ok: true,
      detail: `Drafted ${r.value.posts.length} posts. None is scheduled until you say so.`,
      link: { kind: 'social-post', id: 'queue', label: 'Social posts', route: '/social-creator' },
    };
  }

  const r = await writeShortScript(apiKey, brand);
  if (!r.ok || !r.value) return { ok: false, detail: r.error };
  const v = r.value;
  const id = `sh-${crypto.randomUUID()}`;
  await push(SHORTS_KEY, {
    id, title: v.title, hook: v.hook, script: v.script, caption: v.caption,
    status: 'script', source, createdAt: now,
  });
  return {
    ok: true,
    /* Said plainly: this is a script, not a video. Nothing here films anything,
       and a customer expecting a finished clip would be right to be annoyed. */
    detail: `Wrote a script for "${v.title}" — you still have to film it, which takes about five minutes on a phone.`,
    link: { kind: 'short', id, label: v.title.slice(0, 60), route: '/ai-shorts' },
  };
}

/** Do what is due, oldest first, within the per-tick ceiling. */
async function executeFor(env: Env, run: RunRow, report: AutopilotReport): Promise<void> {
  const accountId = run.account_id;
  /* This project's queue only. The per-tick ceiling is per project too, so one
     busy project cannot starve the others in the same workspace. */
  const rows = await env.DB.prepare(
    `SELECT id, effect FROM crm_autopilot_actions
     WHERE account_id = ? AND project_id = ? AND status = 'pending'
       AND (due_at IS NULL OR due_at <= ?)
     ORDER BY created_at ASC LIMIT ?`,
  ).bind(accountId, run.id, nowIso(), MAX_ACTIONS_PER_TICK).all<{ id: string; effect: string }>();

  for (const row of rows.results ?? []) {
    const effect = parse<PlannedAction['effect']>(row.effect, { type: 'none' });
    let result: Awaited<ReturnType<typeof carryOut>>;
    try {
      result = await carryOut(env, accountId, effect, run);
    } catch (e) {
      result = { ok: false, detail: e instanceof Error ? e.message : String(e) };
    }

    await env.DB.prepare(
      `UPDATE crm_autopilot_actions
       SET status = ?, detail = ?, acted_at = ?,
           link_kind = ?, link_id = ?, link_label = ?, link_route = ?
       WHERE id = ?`,
    ).bind(
      result.ok ? 'done' : 'failed',
      result.detail,
      nowIso(),
      result.link?.kind ?? null, result.link?.id ?? null,
      result.link?.label ?? null, result.link?.route ?? null,
      row.id,
    ).run();

    if (result.ok) report.carried++;
    else { report.failed++; report.notes.push(`${accountId}: ${result.detail.slice(0, 140)}`); }
  }

  if ((rows.results ?? []).length) {
    await env.DB.prepare('UPDATE crm_projects SET last_acted_at = ?, updated_at = ? WHERE id = ?')
      .bind(nowIso(), nowIso(), run.id).run();
  }
}

/**
 * One tick of Autopilot, across every workspace that has it on.
 *
 * Paused and off are both skipped, and the difference matters elsewhere: paused
 * keeps its plan and its queue so resuming picks up where it stopped.
 */
/**
 * Every project that is switched on, across every workspace.
 *
 * This used to be one row per workspace. A project is the unit now: an agency's
 * sub-account can run "dental client acquisition" and "gym membership drive"
 * side by side, each writing from its own client's portfolio and each with its
 * own guardrails — somebody may let a long-standing client's project send
 * without asking while a new one still waits for approval on everything.
 */
export async function runAutopilot(env: Env): Promise<AutopilotReport> {
  const report: AutopilotReport = { planned: 0, carried: 0, awaiting: 0, failed: 0, notes: [] };

  const { results } = await env.DB.prepare(
    `SELECT id, account_id, portfolio_id, name, objective, status, guardrails,
            last_planned_at, purchase_mode, pool_target
     FROM crm_projects WHERE status IN ('learning','running') LIMIT 400`,
  ).all<RunRow>();

  /* One per workspace, for the length of this run. See planFor. */
  const plannedThisRun = new Map<string, Set<string>>();

  for (const run of results ?? []) {
    try {
      /*
       * Nothing to write from.
       *
       * A project names the client it speaks for, and without one every writer
       * would invent a business. Said once, as a held action, rather than
       * producing copy about a company that does not exist.
       */
      if (!run.portfolio_id) {
        await noteMissingPortfolio(env, run, report);
        continue;
      }
      const due = !run.last_planned_at
        || (Date.now() - new Date(run.last_planned_at).getTime()) >= PLAN_EVERY_MS;
      if (due) {
        let seen = plannedThisRun.get(run.account_id);
        if (!seen) { seen = new Set<string>(); plannedThisRun.set(run.account_id, seen); }
        await planFor(env, run, report, seen);
      }
      await executeFor(env, run, report);
    } catch (e) {
      /* One project's bad data must not stop Autopilot for everyone else —
         the same rule the send pass follows. */
      const msg = e instanceof Error ? e.message : String(e);
      report.failed++;
      report.notes.push(`${run.account_id}/${run.name}: Autopilot's turn failed — ${msg.slice(0, 120)}`);
      await env.DB.prepare('UPDATE crm_projects SET last_error = ?, updated_at = ? WHERE id = ?')
        .bind(msg.slice(0, 400), nowIso(), run.id).run();
    }
  }

  return report;
}

/** Say it once, not once per tick. */
async function noteMissingPortfolio(env: Env, run: RunRow, report: AutopilotReport): Promise<void> {
  const summary = `"${run.name}" has no client portfolio, so there is nothing to write from`;
  const open = await env.DB.prepare(
    "SELECT 1 AS n FROM crm_autopilot_actions WHERE account_id = ? AND project_id = ? AND summary = ? AND status IN ('pending','awaiting','done')",
  ).bind(run.account_id, run.id, summary).first();
  if (open) return;
  const now = nowIso();
  await env.DB.prepare(
    `INSERT INTO crm_autopilot_actions
     (id, account_id, project_id, kind, status, summary, because, counts, effect, due_at, created_at, acted_at)
     VALUES (?,?,?,'error','done',?,?,'{}','{"type":"none"}',NULL,?,?)`,
  ).bind(
    rid(), run.account_id, run.id, summary,
    'a project writes in the voice of one client, and none is attached to this one — pick or add a portfolio on the project',
    now, now,
  ).run();
  report.planned++;
}
