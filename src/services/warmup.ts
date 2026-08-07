/**
 * warmup.ts — sending-reputation warmup and per-provider throttling.
 *
 * What is real here: the ramp schedule, the daily ceiling enforced on every
 * send, per-provider health measured from what actually happened to our own
 * mail, automatic back-off when a provider defers or rejects, and warmup sends
 * to seed mailboxes the user owns.
 *
 * What is deliberately absent: a network of third-party mailboxes that open and
 * reply to each other. That needs a paid pool of real accounts (Mailreach,
 * Warmbox and similar) — it cannot be produced from a browser, so it is not
 * simulated. Everything below works on real signals or not at all.
 */

import { loadEmails, sendToContact, type ContactEmail } from './contactEmail';
import { isEmailConfigured } from './emailService';
import type { Contact } from '../types';

const STATE_KEY = 'crm_warmup_state';
const SEEDS_KEY = 'crm_warmup_seeds';
const LOG_KEY = 'crm_warmup_log';

/* ── Providers ───────────────────────────────────────────────────────────── */

export type ProviderId = 'google' | 'microsoft' | 'yahoo' | 'apple' | 'other';

export const PROVIDERS: { id: ProviderId; name: string; domains: string[]; note: string }[] = [
  { id: 'google', name: 'Google', domains: ['gmail.com', 'googlemail.com'], note: 'Weighs engagement most heavily. Opens and replies matter more here than anywhere else.' },
  { id: 'microsoft', name: 'Microsoft', domains: ['outlook.com', 'hotmail.com', 'live.com', 'msn.com'], note: 'Defers aggressively when a new sender ramps too fast. Back off on the first 451.' },
  { id: 'yahoo', name: 'Yahoo / AOL', domains: ['yahoo.com', 'yahoo.co.uk', 'ymail.com', 'aol.com'], note: 'Complaint-sensitive. One bad list can cost weeks.' },
  { id: 'apple', name: 'Apple', domains: ['icloud.com', 'me.com', 'mac.com'], note: 'Quiet about rejections — watch delivery rate rather than error text.' },
  { id: 'other', name: 'Business / other', domains: [], note: 'Corporate mail servers and everything else. Usually the most forgiving.' },
];

const DOMAIN_TO_PROVIDER = new Map<string, ProviderId>();
for (const p of PROVIDERS) for (const d of p.domains) DOMAIN_TO_PROVIDER.set(d, p.id);

export function providerOf(email: string): ProviderId {
  const domain = (email || '').toLowerCase().split('@')[1] ?? '';
  return DOMAIN_TO_PROVIDER.get(domain) ?? 'other';
}

export const providerName = (id: ProviderId) => PROVIDERS.find(p => p.id === id)?.name ?? 'Other';

/* ── Stored state ────────────────────────────────────────────────────────── */

export interface ProviderThrottle {
  /** Multiplier on this provider's share of the daily allowance, 0.1–1. */
  factor: number;
  /** ISO date until which this provider is paused entirely. */
  pausedUntil?: string;
  /** Why the factor is where it is, in words. */
  reason: string;
  /** Consecutive deferrals seen, used to decide how hard to back off. */
  deferrals: number;
}

export interface WarmupState {
  enabled: boolean;
  /** ISO date warmup started. Set when it is first switched on. */
  startedAt: string;
  /** Where the ramp starts, per day. */
  startVolume: number;
  /** Ceiling the ramp climbs to. */
  targetVolume: number;
  /** Per-day sent counters, keyed by YYYY-MM-DD. */
  sentByDay: Record<string, number>;
  /** Per-day, per-provider counters. */
  sentByProvider: Record<string, Partial<Record<ProviderId, number>>>;
  throttles: Partial<Record<ProviderId, ProviderThrottle>>;
  /** Seed sends already made, keyed by YYYY-MM-DD. */
  seedSentByDay: Record<string, number>;
}

export const DEFAULT_STATE: WarmupState = {
  enabled: false,
  startedAt: '',
  startVolume: 20,
  targetVolume: 1000,
  sentByDay: {},
  sentByProvider: {},
  throttles: {},
  seedSentByDay: {},
};

export function loadWarmup(): WarmupState {
  try {
    const raw = JSON.parse(localStorage.getItem(STATE_KEY) || 'null');
    return raw && typeof raw === 'object' ? { ...DEFAULT_STATE, ...raw } : { ...DEFAULT_STATE };
  } catch { return { ...DEFAULT_STATE }; }
}

export function saveWarmup(s: WarmupState) {
  try { localStorage.setItem(STATE_KEY, JSON.stringify(s)); } catch { /* storage full */ }
}

export const today = () => new Date().toISOString().slice(0, 10);

/* ── The ramp ────────────────────────────────────────────────────────────── */

export interface DayPlan {
  day: number;
  allowance: number;
  sentToday: number;
  remaining: number;
  perProvider: { id: ProviderId; name: string; allowance: number; sent: number; factor: number; reason: string; paused: boolean }[];
  reason: string;
}

/** Whole days since warmup began, counting the first day as day 1. */
export function warmupDay(state: WarmupState = loadWarmup()): number {
  if (!state.startedAt) return 0;
  const started = new Date(state.startedAt).getTime();
  if (Number.isNaN(started)) return 0;
  return Math.max(1, Math.floor((Date.now() - started) / 86_400_000) + 1);
}

/**
 * Today's ceiling. The ramp roughly doubles every four days — the shape every
 * deliverability guide agrees on — and is cut when the numbers say to slow down.
 */
export function dailyAllowance(state: WarmupState = loadWarmup(), health = providerHealth()): number {
  if (!state.enabled) return Number.POSITIVE_INFINITY;
  const day = warmupDay(state);
  if (day === 0) return state.startVolume;
  const raw = state.startVolume * Math.pow(2, (day - 1) / 4);
  const capped = Math.min(state.targetVolume, Math.round(raw));

  // A bad week halves the ramp rather than continuing to climb into trouble.
  const overall = health.overall;
  const factor = overall.bounceRate > 5 || overall.complaintRate > 0.3 ? 0.4
    : overall.bounceRate > 2 ? 0.7
    : 1;
  return Math.max(state.startVolume, Math.round(capped * factor));
}

/** The full plan for today, including how it is split across providers. */
export function todayPlan(state: WarmupState = loadWarmup()): DayPlan {
  const health = providerHealth();
  const allowance = dailyAllowance(state, health);
  const d = today();
  const sentToday = state.sentByDay[d] ?? 0;
  const byProvider = state.sentByProvider[d] ?? {};

  // A provider's throttle is a *fraction of the day*, not a fixed share of it.
  // An equal split would give every provider zero on the early days of a ramp,
  // which would block sending entirely — so an unthrottled provider may use the
  // whole day's allowance, and a throttled one a proportion of it.
  const perProvider = PROVIDERS.map(p => {
    const t = state.throttles[p.id];
    const paused = !!(t?.pausedUntil && t.pausedUntil > new Date().toISOString());
    const factor = paused ? 0 : (t?.factor ?? 1);
    const slice = paused ? 0 : Math.max(1, Math.ceil(allowance * factor));
    return {
      id: p.id, name: p.name,
      allowance: Math.min(slice, allowance),
      sent: byProvider[p.id] ?? 0,
      factor, paused,
      reason: paused ? `Paused until ${new Date(t!.pausedUntil!).toLocaleString()} — ${t!.reason}` : (t?.reason ?? 'No problems seen; sending at full rate.'),
    };
  });

  const day = warmupDay(state);
  return {
    day, allowance, sentToday,
    remaining: Math.max(0, allowance - sentToday),
    perProvider,
    reason: !state.enabled
      ? 'Warmup is off, so nothing is capped.'
      : day <= 1
        ? `Day 1. Starting at ${state.startVolume} a day so providers see a human pattern rather than a burst.`
        : `Day ${day}. The ramp doubles every four days while bounces and complaints stay low.`,
  };
}

/* ── Provider health, measured from our own sends ────────────────────────── */

export interface ProviderStats {
  id: ProviderId;
  name: string;
  sent: number;
  delivered: number;
  bounced: number;
  deferred: number;
  opened: number;
  deliveryRate: number;
  openRate: number;
  bounceRate: number;
  status: 'good' | 'watch' | 'blocked' | 'idle';
  note: string;
}

export interface HealthReport {
  byProvider: ProviderStats[];
  overall: { sent: number; bounceRate: number; complaintRate: number; openRate: number };
}

/** A 4xx response means "try later" — the provider is deferring, not refusing. */
const DEFERRED_RE = /\b4\d\d\b|deferred|greylist|try again later|temporarily|rate limit|too many/i;

/**
 * Per-provider outcomes from the last 30 days of our own mail. This is the
 * feedback loop the ramp runs on — no external service is involved.
 */
export function providerHealth(emails: ContactEmail[] = loadEmails()): HealthReport {
  const cutoff = Date.now() - 30 * 86_400_000;
  const recent = emails.filter(e =>
    e.direction === 'outbound' && e.status !== 'scheduled'
    // A message we refused ourselves never reached a mail server, so counting
    // it as a delivery failure would throttle a provider for our own decision.
    && !(e as unknown as { blockedLocally?: boolean }).blockedLocally
    && new Date(e.sentAt || e.createdAt).getTime() >= cutoff);

  const buckets = new Map<ProviderId, ContactEmail[]>();
  for (const p of PROVIDERS) buckets.set(p.id, []);
  for (const e of recent) {
    const addr = (e as unknown as { toEmail?: string }).toEmail || '';
    buckets.get(providerOf(addr))!.push(e);
  }

  const byProvider: ProviderStats[] = PROVIDERS.map(p => {
    const rows = buckets.get(p.id)!;
    const sent = rows.length;
    const bounced = rows.filter(e => e.status === 'bounced').length;
    const deferred = rows.filter(e => e.status === 'failed' && DEFERRED_RE.test(e.error || '')).length;
    const delivered = sent - bounced - rows.filter(e => e.status === 'failed').length;
    const opened = rows.filter(e => e.opens > 0).length;
    const rate = (n: number, d: number) => (d > 0 ? Math.round((n / d) * 1000) / 10 : 0);

    const deliveryRate = rate(delivered, sent);
    const bounceRate = rate(bounced, sent);
    const openRate = rate(opened, Math.max(delivered, 1));

    let status: ProviderStats['status'] = 'idle';
    let note = 'Nothing sent to this provider in the last 30 days.';
    if (sent > 0) {
      // A 4xx is the provider asking us to slow down, not refusing us — it
      // never means "stop", however many there are. Only permanent failures,
      // and only once there is enough volume to mean anything, do that.
      const permanentFailures = rows.filter(e => e.status === 'bounced'
        || (e.status === 'failed' && !DEFERRED_RE.test(e.error || ''))).length;
      const permanentRate = sent > 0 ? (permanentFailures / sent) * 100 : 0;

      if (sent >= 5 && (bounceRate > 8 || permanentRate > 30)) {
        status = 'blocked';
        note = `${Math.round(permanentRate)}% of ${sent} message(s) were permanently rejected. Stop sending here until the list is cleaned.`;
      } else if (deferred > 0) {
        status = 'watch';
        note = `${deferred} message(s) were deferred — this provider is asking you to slow down, not to stop.`;
      } else if (bounceRate > 3) {
        status = 'watch';
        note = `${bounceRate}% bounced, which is above the 2% comfort line.`;
      } else if (permanentFailures > 0 && sent < 5) {
        status = 'watch';
        note = `${permanentFailures} of ${sent} message(s) failed. Too few to judge yet — sending here is slowed while it is unclear.`;
      } else {
        status = 'good';
        note = `${deliveryRate}% delivered, ${openRate}% opened across ${sent} message(s).`;
      }
    }
    return { id: p.id, name: p.name, sent, delivered, bounced, deferred, opened, deliveryRate, openRate, bounceRate, status, note };
  });

  const sent = recent.length;
  const bounced = recent.filter(e => e.status === 'bounced').length;
  const opened = recent.filter(e => e.opens > 0).length;
  const rate = (n: number, d: number) => (d > 0 ? Math.round((n / d) * 1000) / 10 : 0);

  return {
    byProvider,
    overall: {
      sent,
      bounceRate: rate(bounced, sent),
      complaintRate: 0,   // complaints arrive through the suppression list
      openRate: rate(opened, Math.max(sent - bounced, 1)),
    },
  };
}

/* ── Feedback: adjust throttles from what actually happened ──────────────── */

export interface Adjustment { provider: ProviderId; from: number; to: number; reason: string; }

/**
 * Re-derive each provider's throttle from the last 30 days. Deferrals tighten
 * it, a clean run relaxes it — gradually, because snapping back to full speed
 * is what got the sender deferred in the first place.
 */
export function adjustThrottles(state: WarmupState = loadWarmup()): { state: WarmupState; changes: Adjustment[] } {
  const health = providerHealth();
  const changes: Adjustment[] = [];
  const next: WarmupState = { ...state, throttles: { ...state.throttles } };

  for (const stats of health.byProvider) {
    const current = next.throttles[stats.id] ?? { factor: 1, reason: 'No problems seen; sending at full rate.', deferrals: 0 };
    let factor = current.factor;
    let reason = current.reason;
    let pausedUntil = current.pausedUntil;
    const deferrals = stats.deferred;

    if (stats.status === 'blocked') {
      factor = 0.1;
      pausedUntil = new Date(Date.now() + 24 * 3_600_000).toISOString();
      reason = `${stats.name} permanently rejected most of what we sent. Paused for 24 hours so the list can be cleaned.`;
    } else if (stats.status === 'watch') {
      factor = Math.max(0.25, current.factor * 0.5);
      pausedUntil = undefined;
      reason = deferrals > 0
        ? `${stats.name} deferred ${deferrals} message(s), so the rate here is halved until it stops.`
        : `Bounces to ${stats.name} are at ${stats.bounceRate}%, so the rate here is halved.`;
    } else if (stats.status === 'good') {
      // Recover in steps, not in one jump.
      factor = Math.min(1, current.factor + 0.15);
      pausedUntil = undefined;
      reason = factor >= 1
        ? 'No problems seen; sending at full rate.'
        : `Recovering — ${Math.round(factor * 100)}% of the normal rate while ${stats.name} stays clean.`;
    }

    if (Math.abs(factor - current.factor) > 0.001 || pausedUntil !== current.pausedUntil) {
      changes.push({ provider: stats.id, from: current.factor, to: factor, reason });
    }
    next.throttles[stats.id] = { factor, reason, deferrals, pausedUntil };
  }

  saveWarmup(next);
  return { state: next, changes };
}

/* ── Enforcement ─────────────────────────────────────────────────────────── */

export interface WarmupGate { ok: boolean; reason: string; }

/**
 * Whether one more email may go to this address today. Called from the send
 * path, so the ramp is a real constraint rather than a chart.
 */
export function warmupGate(email: string, state: WarmupState = loadWarmup()): WarmupGate {
  if (!state.enabled) return { ok: true, reason: '' };
  const plan = todayPlan(state);
  if (plan.sentToday >= plan.allowance) {
    return { ok: false, reason: `Warmup limit reached: ${plan.allowance} email${plan.allowance === 1 ? '' : 's'} for day ${plan.day}. Sending more today risks the reputation the warmup is building.` };
  }
  const id = providerOf(email);
  const slice = plan.perProvider.find(p => p.id === id)!;
  if (slice.paused) {
    return { ok: false, reason: `Sending to ${slice.name} is paused. ${slice.reason}` };
  }
  if (slice.sent >= slice.allowance) {
    return { ok: false, reason: `Today's allowance for ${slice.name} (${slice.allowance}) is used up. ${slice.reason}` };
  }
  return { ok: true, reason: '' };
}

/** Record that an email went out, for both the daily and per-provider counters. */
export function recordSend(email: string, state: WarmupState = loadWarmup()): WarmupState {
  const d = today();
  const id = providerOf(email);
  const next: WarmupState = {
    ...state,
    sentByDay: { ...state.sentByDay, [d]: (state.sentByDay[d] ?? 0) + 1 },
    sentByProvider: {
      ...state.sentByProvider,
      [d]: { ...(state.sentByProvider[d] ?? {}), [id]: ((state.sentByProvider[d] ?? {})[id] ?? 0) + 1 },
    },
  };
  // Keep 60 days of counters; older ones are only noise.
  const keep = Object.keys(next.sentByDay).sort().slice(-60);
  next.sentByDay = Object.fromEntries(keep.map(k => [k, next.sentByDay[k]]));
  next.sentByProvider = Object.fromEntries(keep.filter(k => next.sentByProvider[k]).map(k => [k, next.sentByProvider[k]]));
  saveWarmup(next);
  return next;
}

/* ── Seed mailboxes ──────────────────────────────────────────────────────── */

export interface Seed {
  id: string;
  email: string;
  provider: ProviderId;
  addedAt: string;
  /** Where the last warmup message landed, as reported by the user. */
  lastPlacement?: 'inbox' | 'spam' | 'missing';
  lastCheckedAt?: string;
  sends: number;
}

export function loadSeeds(): Seed[] {
  try {
    const raw = JSON.parse(localStorage.getItem(SEEDS_KEY) || '[]');
    return Array.isArray(raw) ? raw : [];
  } catch { return []; }
}

export function saveSeeds(rows: Seed[]) {
  try { localStorage.setItem(SEEDS_KEY, JSON.stringify(rows.slice(0, 100))); } catch { /* storage full */ }
}

export function addSeed(email: string): { ok: boolean; error?: string; seed?: Seed } {
  const e = (email || '').trim().toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(e)) return { ok: false, error: 'Enter a full email address.' };
  const rows = loadSeeds();
  if (rows.some(s => s.email === e)) return { ok: false, error: 'That mailbox is already a seed.' };
  const seed: Seed = { id: `seed-${Date.now()}`, email: e, provider: providerOf(e), addedAt: new Date().toISOString(), sends: 0 };
  saveSeeds([...rows, seed]);
  return { ok: true, seed };
}

export function removeSeed(id: string) { saveSeeds(loadSeeds().filter(s => s.id !== id)); }

export function recordPlacement(id: string, placement: Seed['lastPlacement']) {
  saveSeeds(loadSeeds().map(s => (s.id === id ? { ...s, lastPlacement: placement, lastCheckedAt: new Date().toISOString() } : s)));
}

/** Inbox placement across seeds, which is the number that actually matters. */
export function placementSummary(seeds: Seed[] = loadSeeds()) {
  const checked = seeds.filter(s => s.lastPlacement);
  const inbox = checked.filter(s => s.lastPlacement === 'inbox').length;
  const spam = checked.filter(s => s.lastPlacement === 'spam').length;
  const missing = checked.filter(s => s.lastPlacement === 'missing').length;
  return {
    checked: checked.length, inbox, spam, missing,
    inboxRate: checked.length ? Math.round((inbox / checked.length) * 100) : 0,
    byProvider: PROVIDERS.map(p => {
      const rows = checked.filter(s => s.provider === p.id);
      return { id: p.id, name: p.name, total: rows.length, inbox: rows.filter(s => s.lastPlacement === 'inbox').length };
    }).filter(r => r.total > 0),
  };
}

/* ── Warmup log ──────────────────────────────────────────────────────────── */

export interface WarmupLogEntry { at: string; text: string; kind: 'send' | 'throttle' | 'placement' | 'note'; }

export function loadLog(): WarmupLogEntry[] {
  try {
    const raw = JSON.parse(localStorage.getItem(LOG_KEY) || '[]');
    return Array.isArray(raw) ? raw : [];
  } catch { return []; }
}

export function log(text: string, kind: WarmupLogEntry['kind'] = 'note') {
  const rows = [{ at: new Date().toISOString(), text, kind }, ...loadLog()].slice(0, 300);
  try { localStorage.setItem(LOG_KEY, JSON.stringify(rows)); } catch { /* storage full */ }
}

/* ── The background job ──────────────────────────────────────────────────── */

const WARMUP_SUBJECTS = [
  'Checking in on this week',
  'A quick note about the schedule',
  'Following up on our last conversation',
  'Short update for you',
  'One thing worth a look',
];

const WARMUP_BODY = (n: number) =>
  `Hello,\n\nThis is a routine message from our sending domain, part of establishing a normal sending pattern before regular mail begins.\n\n` +
  `If it reached your inbox, nothing needs doing. If it landed in spam, marking it as "not spam" genuinely helps — that signal is what providers weigh.\n\n` +
  `Reference ${n}.\n\nThank you.`;

export interface WarmupRun { sent: number; skipped: number; notes: string[]; }

/**
 * Send today's warmup messages to the seed mailboxes, spread across providers,
 * and re-derive the throttles from the results. Idempotent per day: the daily
 * counter stops a reload from sending twice.
 */
export async function runWarmup(): Promise<WarmupRun> {
  const state = loadWarmup();
  const notes: string[] = [];
  if (!state.enabled) return { sent: 0, skipped: 0, notes: [] };
  if (!isEmailConfigured()) {
    return { sent: 0, skipped: 0, notes: ['Warmup is on but no email provider is configured, so nothing can be sent.'] };
  }

  const seeds = loadSeeds();
  if (!seeds.length) {
    return { sent: 0, skipped: 0, notes: ['Warmup is on but there are no seed mailboxes to send to. Add a few in Settings → Email Deliverability.'] };
  }

  const d = today();
  const alreadySeeded = state.seedSentByDay[d] ?? 0;
  const plan = todayPlan(state);
  // Seeds take a tenth of the day's allowance, at least one and at most the
  // number of seeds — warmup traffic should not crowd out real mail.
  const seedTarget = Math.max(1, Math.min(seeds.length, Math.round(plan.allowance * 0.1)));
  const toSend = Math.max(0, seedTarget - alreadySeeded);
  if (toSend === 0) {
    return { sent: 0, skipped: seeds.length, notes: [`Today's ${seedTarget} warmup message(s) have already gone out.`] };
  }

  // Rotate through seeds so the same mailbox is not always first, and skip any
  // provider that is currently throttled shut.
  const order = [...seeds].sort((a, b) => a.sends - b.sends);
  let sent = 0, skipped = 0;

  for (const seed of order) {
    if (sent >= toSend) break;
    const gate = warmupGate(seed.email, loadWarmup());
    if (!gate.ok) { skipped++; notes.push(`${seed.email}: ${gate.reason}`); continue; }

    const asContact = {
      id: `warmup-${seed.id}`, name: seed.email.split('@')[0], email: seed.email,
      phone: '', status: 'lead', tags: [], source: 'Warmup',
      createdAt: seed.addedAt, lastActivity: seed.addedAt, value: 0,
      activities: [], notes: [], tasks: [],
    } as unknown as Contact;

    const subject = WARMUP_SUBJECTS[(seed.sends + sent) % WARMUP_SUBJECTS.length];
    const out = await sendToContact(asContact, {
      subject,
      body: WARMUP_BODY(Date.now() % 100000),
      // Seeds are mailboxes the user owns and asked us to send to; the
      // suppression and health gates are about strangers' addresses.
      ignoreDeliverability: true,
    });

    if (out.ok) {
      sent++;
      recordSend(seed.email, loadWarmup());
      saveSeeds(loadSeeds().map(s => (s.id === seed.id ? { ...s, sends: s.sends + 1 } : s)));
      log(`Warmup message sent to ${seed.email} (${providerName(seed.provider)})`, 'send');
    } else {
      skipped++;
      notes.push(`${seed.email}: ${out.error ?? 'send failed'}`);
      log(`Warmup message to ${seed.email} failed — ${out.error ?? 'unknown error'}`, 'send');
    }
  }

  const after = loadWarmup();
  after.seedSentByDay = { ...after.seedSentByDay, [d]: alreadySeeded + sent };
  const keepDays = Object.keys(after.seedSentByDay).sort().slice(-60);
  after.seedSentByDay = Object.fromEntries(keepDays.map(k => [k, after.seedSentByDay[k]]));
  saveWarmup(after);

  const { changes } = adjustThrottles(loadWarmup());
  for (const c of changes) {
    log(c.reason, 'throttle');
    notes.push(c.reason);
  }

  return { sent, skipped, notes };
}

/* ── Sending identities (domains / IPs) ──────────────────────────────────── */

export interface SendingIdentity {
  id: string;
  host: string;
  kind: 'domain' | 'ip';
  addedAt: string;
}

const IDENTITIES_KEY = 'crm_sending_identities';

export function loadIdentities(): SendingIdentity[] {
  try {
    const raw = JSON.parse(localStorage.getItem(IDENTITIES_KEY) || '[]');
    return Array.isArray(raw) ? raw : [];
  } catch { return []; }
}

export function saveIdentities(rows: SendingIdentity[]) {
  try { localStorage.setItem(IDENTITIES_KEY, JSON.stringify(rows.slice(0, 50))); } catch { /* storage full */ }
}

export function addIdentity(host: string): { ok: boolean; error?: string } {
  const h = (host || '').trim().toLowerCase().replace(/^https?:\/\//, '').split('/')[0];
  if (!h) return { ok: false, error: 'Enter a domain or IP address.' };
  const isIp = /^\d{1,3}(\.\d{1,3}){3}$/.test(h);
  if (!isIp && !/^([a-z0-9-]+\.)+[a-z]{2,}$/.test(h)) return { ok: false, error: 'That is not a valid domain or IPv4 address.' };
  const rows = loadIdentities();
  if (rows.some(r => r.host === h)) return { ok: false, error: 'That is already being tracked.' };
  saveIdentities([...rows, { id: `id-${Date.now()}`, host: h, kind: isIp ? 'ip' : 'domain', addedAt: new Date().toISOString() }]);
  return { ok: true };
}

export function removeIdentity(id: string) { saveIdentities(loadIdentities().filter(r => r.id !== id)); }
