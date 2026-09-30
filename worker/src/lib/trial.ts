/**
 * The 7-day free trial.
 *
 * ── What it is ──
 *
 * Every account made by signing up — password, emailed code or Google — gets
 * `crm_users.trial_ends_at`, seven days out, at the moment it is created. No
 * card is asked for: the ad and the site promise "no card needed", and a trial
 * that starts at a checkout page loses most of the people it was for.
 *
 * It used to be whatever the operator's Stripe or Creem price carried, which
 * meant the app had no trial of its own until somebody configured one, and the
 * processor's trial started only once a card was in. Do not also set a trial on
 * the processor's price now: somebody paying on day seven would then get a
 * second free week.
 *
 * ── Who it does not apply to ──
 *
 *  owner    the install owner (no account of their own, role agency)
 *  paid     any workspace they own is `active` (or the processor's own
 *           `trialing`) in the billing status the webhooks write, or the
 *           operator granted a plan by hand (`crm_plans.source = 'manual'`)
 *  legacy   no `trial_ends_at` at all: the account predates trials. It is left
 *           exactly as it was; ending somebody's access because a feature was
 *           added after they joined would be a trial they never agreed to.
 *
 * A client login follows the agency that owns its workspace. Its access is the
 * agency's to buy, and a client cannot be "on trial" separately from them.
 *
 * ── What ending it stops ──
 *
 * The operator's money. When the trial is over and nothing is paid, the
 * operator's AI key is no longer spent on that workspace (`loadAiKey`,
 * `aiBudget`, `/api/ai.php`), and the app shows a screen to choose a plan. The
 * customer's data is untouched and still exportable: a trial ending is not a
 * reason to hold somebody's contacts hostage. Their own mailbox and their own
 * AI key, if they brought one, cost the operator nothing and are not the trial's
 * business.
 */
import { agencyBucketFor, dataGet, type Env } from './db';

export const TRIAL_DAYS = 7;
const DAY = 86_400_000;

export type TrialKind = 'owner' | 'paid' | 'trial' | 'ended' | 'legacy';

export interface TrialState {
  kind: TrialKind;
  /** ISO time the trial ends (or ended); null for owner and legacy. */
  endsAt: string | null;
  /** Whole days left, rounded up — "1 day left" until the last minute. 0 once ended. */
  daysLeft: number;
}

/** When a trial that starts now ends. */
export function trialEndFromNow(): string {
  return new Date(Date.now() + TRIAL_DAYS * DAY).toISOString();
}

interface UserRow { email: string; role: string; accountId: string | null; trialEndsAt: string | null }

async function userRow(env: Env, email: string): Promise<UserRow | null> {
  try {
    return await env.DB.prepare(
      'SELECT email, role, account_id AS accountId, trial_ends_at AS trialEndsAt FROM crm_users WHERE email = ?',
    ).bind(email).first<UserRow>();
  } catch {
    /* A database before 0052 has no column; everyone there predates trials. */
    const r = await env.DB.prepare('SELECT email, role, account_id AS accountId FROM crm_users WHERE email = ?')
      .bind(email).first<Omit<UserRow, 'trialEndsAt'>>();
    return r ? { ...r, trialEndsAt: null } : null;
  }
}

/** Is anything this agency owns paid for? */
export async function hasPaid(env: Env, email: string): Promise<boolean> {
  const plan = await env.DB.prepare('SELECT source FROM crm_plans WHERE owner_email = ?')
    .bind(email).first<{ source: string }>().catch(() => null);
  if (plan && plan.source !== 'default') return true;

  const owned = await env.DB.prepare('SELECT account_id AS id FROM crm_workspaces WHERE owner_email = ?')
    .bind(email).all<{ id: string }>();
  for (const { id } of owned.results ?? []) {
    const raw = await dataGet(env.DB, await agencyBucketFor(env.DB, id), `crm_billing_status_${id}`);
    if (!raw) continue;
    try {
      const status = String((JSON.parse(raw) as { status?: string }).status ?? '');
      if (status === 'active' || status === 'trialing') return true;
    } catch { /* unreadable: not proof of payment */ }
  }
  return false;
}

/** The trial as it stands for a person. */
export async function trialFor(env: Env, email: string): Promise<TrialState> {
  let row = await userRow(env, email);
  if (!row) return { kind: 'legacy', endsAt: null, daysLeft: 0 };

  if (row.role === 'client' && row.accountId) {
    const owner = await env.DB.prepare('SELECT owner_email AS e FROM crm_workspaces WHERE account_id = ?')
      .bind(row.accountId).first<{ e: string }>();
    if (!owner) return { kind: 'legacy', endsAt: null, daysLeft: 0 };
    row = await userRow(env, owner.e);
    if (!row) return { kind: 'legacy', endsAt: null, daysLeft: 0 };
  }

  if (row.role === 'agency' && !row.accountId) return { kind: 'owner', endsAt: null, daysLeft: 0 };
  if (!row.trialEndsAt) return { kind: 'legacy', endsAt: null, daysLeft: 0 };
  if (await hasPaid(env, row.email)) return { kind: 'paid', endsAt: row.trialEndsAt, daysLeft: 0 };

  const left = Date.parse(row.trialEndsAt) - Date.now();
  return left > 0
    ? { kind: 'trial', endsAt: row.trialEndsAt, daysLeft: Math.ceil(left / DAY) }
    : { kind: 'ended', endsAt: row.trialEndsAt, daysLeft: 0 };
}

/** The trial of whoever owns a workspace — what a cron run, with no session, can ask. */
export async function trialForWorkspace(env: Env, accountId: string): Promise<TrialState> {
  const owner = await env.DB.prepare('SELECT owner_email AS e FROM crm_workspaces WHERE account_id = ?')
    .bind(accountId).first<{ e: string }>().catch(() => null);
  if (owner) return trialFor(env, owner.e);
  const self = await env.DB.prepare('SELECT email FROM crm_users WHERE account_id = ? LIMIT 1')
    .bind(accountId).first<{ email: string }>().catch(() => null);
  return self ? trialFor(env, self.email) : { kind: 'legacy', endsAt: null, daysLeft: 0 };
}

export const TRIAL_ENDED_MESSAGE =
  'Your 7-day free trial has ended. Choose a plan under Plan & billing to keep using the AI — everything you made is still here.';
