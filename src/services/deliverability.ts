/**
 * deliverability.ts — the client half of the Email Deliverability engine.
 *
 * Split of responsibilities:
 *   here            everything computable from data we already hold — syntax,
 *                   suppression, content scanning, reputation metrics, volume
 *                   and send-time advice. No network, instant, works offline.
 *   api/deliverability.php  the checks a browser cannot make — DNS for
 *                   SPF/DKIM/DMARC/MX, DNSBL blacklists, SMTP probes, and any
 *                   paid verification API (whose key never leaves the server).
 */

import type { Contact } from '../types';
import { getSession } from './auth';
import { getActiveAccountId } from './tenancy';
import { loadEmails, type ContactEmail } from './contactEmail';
import { API_BASE } from './apiBase';


const SUPPRESSION_KEY = 'crm_suppression_list';
const HEALTH_KEY = 'crm_email_health';
const SETTINGS_KEY = 'crm_deliverability_settings';

/* ── Types ───────────────────────────────────────────────────────────────── */

export type Verdict = 'valid' | 'risky' | 'invalid' | 'unknown';
export type CheckStatus = 'pass' | 'warn' | 'error' | 'missing' | 'unknown';

export interface VerifyResult {
  email: string;
  normalized: string;
  syntax: boolean;
  domain: string;
  mx: string[];
  hasMx: boolean;
  disposable: boolean;
  role: boolean;
  free: boolean;
  trapRisk: string[];
  smtp: string | null;
  verdict: Verdict;
  score: number;
  reasons: string[];
  cached?: boolean;
  provider?: { provider: string; verdict: Verdict; raw: string; sub: string };
}

export interface AuthCheck {
  domain: string;
  spf: { status: CheckStatus; record: string | null; message: string; lookups?: number; qualifier?: string };
  dkim: { status: CheckStatus; message: string; selectors: { selector: string; record: string; revoked: boolean }[] };
  dmarc: { status: CheckStatus; record: string | null; message: string; policy?: string; rua?: boolean; pct?: number };
  mx: { status: CheckStatus; message: string; records: { host: string; pri: number }[] };
  checkedAt: string;
}

export interface BlacklistCheck {
  ips: string[];
  checked: number;
  listedCount: number;
  status: CheckStatus;
  message: string;
  results: { ip: string; list: string; zone: string; listed: boolean; delistUrl: string }[];
}

export interface HostCapabilities {
  dns: boolean;
  smtp: boolean;
  provider: string;
  providerConfigured: boolean;
  blacklists: number;
}

export interface SuppressionEntry {
  email: string;
  reason: 'hard_bounce' | 'complaint' | 'invalid' | 'manual' | 'unsubscribed';
  detail: string;
  at: string;
  /** How many times we saw the triggering event before suppressing. */
  hits: number;
}

export interface DeliverabilitySettings {
  sendingDomain: string;
  dkimSelectors: string[];
  /** Verify every address before an email leaves. */
  verifyBeforeSend: boolean;
  /** Refuse to send to a risky address, rather than warning. */
  blockRisky: boolean;
  bounceThreshold: number;    // % — alert above this
  complaintThreshold: number; // % — alert above this
  minSenderScore: number;
}

export const DEFAULT_SETTINGS: DeliverabilitySettings = {
  sendingDomain: '',
  dkimSelectors: ['default', 'google', 'selector1', 'selector2', 'k1', 'mail'],
  verifyBeforeSend: true,
  blockRisky: false,
  bounceThreshold: 2,
  complaintThreshold: 0.1,
  minSenderScore: 70,
};

/* ── Settings ────────────────────────────────────────────────────────────── */

export function loadSettings(): DeliverabilitySettings {
  try {
    const raw = JSON.parse(localStorage.getItem(SETTINGS_KEY) || 'null');
    return raw && typeof raw === 'object' ? { ...DEFAULT_SETTINGS, ...raw } : DEFAULT_SETTINGS;
  } catch { return DEFAULT_SETTINGS; }
}

export function saveSettings(s: DeliverabilitySettings) {
  try { localStorage.setItem(SETTINGS_KEY, JSON.stringify(s)); } catch { /* storage blocked */ }
}

/* ── Server calls ────────────────────────────────────────────────────────── */

async function call(action: string, body: Record<string, unknown> = {}): Promise<Record<string, unknown> | null> {
  const session = getSession();
  if (!session) return null;
  try {
    const r = await fetch(`${API_BASE}/api/deliverability.php`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action, token: session.token, accountId: getActiveAccountId(), ...body }),
    });
    return await r.json();
  } catch { return null; }
}

export async function hostCapabilities(): Promise<HostCapabilities | null> {
  const res = await call('capabilities');
  if (!res?.success) return null;
  return {
    dns: !!res.dns, smtp: !!res.smtp,
    provider: String(res.provider || ''),
    providerConfigured: !!res.providerConfigured,
    blacklists: Number(res.blacklists || 0),
  };
}

export async function checkAuthentication(domain: string, selectors?: string[]): Promise<{ ok: boolean; data?: AuthCheck; error?: string }> {
  const res = await call('auth_check', { domain, selectors: selectors ?? loadSettings().dkimSelectors });
  if (!res) return { ok: false, error: 'Could not reach the server. Authentication checks need the PHP API, so they only work on the deployed site.' };
  if (!res.success) return { ok: false, error: String(res.error || 'Check failed.') };
  return { ok: true, data: res as unknown as AuthCheck };
}

export async function checkBlacklists(host: string): Promise<{ ok: boolean; data?: BlacklistCheck; error?: string }> {
  const res = await call('blacklist', { host });
  if (!res) return { ok: false, error: 'Could not reach the server.' };
  if (!res.success) return { ok: false, error: String(res.error || 'Check failed.') };
  return { ok: true, data: res as unknown as BlacklistCheck };
}

export async function setVerificationProvider(provider: string, apiKey: string): Promise<{ ok: boolean; error?: string }> {
  const res = await call('provider_set', { provider, apiKey });
  if (!res) return { ok: false, error: 'Could not reach the server.' };
  return res.success ? { ok: true } : { ok: false, error: String(res.error || 'Could not save the key.') };
}

/* ── Local syntax + policy checks ────────────────────────────────────────── */

const ROLE_LOCALS = new Set([
  'admin', 'administrator', 'info', 'sales', 'support', 'contact', 'help', 'billing',
  'accounts', 'accounting', 'office', 'hello', 'team', 'marketing', 'noreply', 'no-reply',
  'donotreply', 'postmaster', 'webmaster', 'hostmaster', 'abuse', 'security', 'privacy',
  'legal', 'careers', 'jobs', 'hr', 'press', 'media', 'enquiries', 'inquiries', 'service',
]);

const DISPOSABLE = new Set([
  'mailinator.com', '10minutemail.com', 'guerrillamail.com', 'sharklasers.com', 'grr.la',
  'temp-mail.org', 'tempmail.com', 'throwawaymail.com', 'yopmail.com', 'trashmail.com',
  'dispostable.com', 'fakeinbox.com', 'maildrop.cc', 'moakt.com', 'mohmal.com',
  'emailondeck.com', 'mailnesia.com', 'discard.email', 'spam4.me', 'mailcatch.com',
  '1secmail.com', 'tempmailo.com', 'burnermail.io', 'getairmail.com', 'jetable.org',
]);

/** RFC-shaped enough for practical use, without the pathological full grammar. */
const EMAIL_RE = /^[a-z0-9!#$%&'*+/=?^_`{|}~-]+(?:\.[a-z0-9!#$%&'*+/=?^_`{|}~-]+)*@(?:[a-z0-9](?:[a-z0-9-]*[a-z0-9])?\.)+[a-z]{2,63}$/i;

export interface LocalCheck {
  valid: boolean;
  disposable: boolean;
  role: boolean;
  suppressed: SuppressionEntry | null;
  reason: string;
  verdict: Verdict;
}

/**
 * Everything decidable without a network round trip. Fast enough to run on
 * every keystroke and on every row of an import.
 */
export function localCheck(email: string): LocalCheck {
  const e = (email || '').trim().toLowerCase();
  if (!e || !EMAIL_RE.test(e)) {
    return { valid: false, disposable: false, role: false, suppressed: null, verdict: 'invalid', reason: 'Not a valid email address.' };
  }
  const [local, domain] = e.split('@');
  const disposable = DISPOSABLE.has(domain);
  const role = ROLE_LOCALS.has(local);
  const suppressed = findSuppression(e);

  if (suppressed) {
    return { valid: true, disposable, role, suppressed, verdict: 'invalid', reason: `Suppressed: ${suppressed.detail}` };
  }
  if (disposable) {
    return { valid: true, disposable, role, suppressed: null, verdict: 'invalid', reason: 'Disposable address — it will stop existing shortly.' };
  }
  if (role) {
    return { valid: true, disposable, role, suppressed: null, verdict: 'risky', reason: `"${local}@" is a shared role address; these complain more often than personal ones.` };
  }
  return { valid: true, disposable, role, suppressed: null, verdict: 'valid', reason: 'Looks fine.' };
}

/* ── Server-backed verification, batched and cached ──────────────────────── */

const verifyCache = new Map<string, VerifyResult>();

/**
 * Verify addresses through the server. Batched at 50 (the endpoint's own cap),
 * de-duplicated, and cached in memory for the session so a repeated sweep of
 * the same list costs nothing.
 */
export async function verifyEmails(
  emails: string[],
  opts: { smtp?: boolean; onProgress?: (done: number, total: number) => void } = {},
): Promise<VerifyResult[]> {
  const unique = [...new Set(emails.map(e => (e || '').trim().toLowerCase()).filter(Boolean))];
  const out: VerifyResult[] = [];
  const todo: string[] = [];

  for (const e of unique) {
    const hit = verifyCache.get(e);
    if (hit) out.push(hit); else todo.push(e);
  }

  let done = out.length;
  opts.onProgress?.(done, unique.length);

  for (let i = 0; i < todo.length; i += 50) {
    const batch = todo.slice(i, i + 50);
    const res = await call('verify', { emails: batch, smtp: !!opts.smtp });
    if (res?.success && Array.isArray(res.results)) {
      for (const r of res.results as VerifyResult[]) {
        verifyCache.set(r.normalized || r.email, r);
        out.push(r);
      }
    } else {
      // Server unreachable: fall back to what we can decide locally rather
      // than reporting nothing.
      for (const e of batch) {
        const l = localCheck(e);
        out.push({
          email: e, normalized: e, syntax: l.valid, domain: e.split('@')[1] ?? '',
          mx: [], hasMx: l.valid, disposable: l.disposable, role: l.role, free: false,
          trapRisk: [], smtp: null, verdict: l.verdict,
          score: l.verdict === 'valid' ? 70 : l.verdict === 'risky' ? 50 : 10,
          reasons: [l.reason, 'Checked locally only — the server was unreachable, so DNS was not consulted.'],
        });
      }
    }
    done += batch.length;
    opts.onProgress?.(Math.min(done, unique.length), unique.length);
  }
  return out;
}

/* ── Suppression list ────────────────────────────────────────────────────── */

export function loadSuppression(): SuppressionEntry[] {
  try {
    const raw = JSON.parse(localStorage.getItem(SUPPRESSION_KEY) || '[]');
    return Array.isArray(raw) ? raw : [];
  } catch { return []; }
}

function saveSuppression(rows: SuppressionEntry[]) {
  try { localStorage.setItem(SUPPRESSION_KEY, JSON.stringify(rows.slice(0, 20000))); } catch { /* storage full */ }
}

export function findSuppression(email: string): SuppressionEntry | null {
  const e = (email || '').trim().toLowerCase();
  if (!e) return null;
  return loadSuppression().find(s => s.email === e) ?? null;
}

export function isSuppressed(email: string): boolean { return findSuppression(email) !== null; }

/**
 * Add an address to the suppression list. Hard bounces and complaints suppress
 * on the first occurrence — the damage from one more send outweighs the chance
 * it was a fluke. Soft signals accumulate.
 */
export function suppress(email: string, reason: SuppressionEntry['reason'], detail: string): SuppressionEntry | null {
  const e = (email || '').trim().toLowerCase();
  if (!e) return null;
  const rows = loadSuppression();
  const existing = rows.find(s => s.email === e);
  if (existing) {
    existing.hits += 1;
    existing.at = new Date().toISOString();
    saveSuppression(rows);
    return existing;
  }
  const entry: SuppressionEntry = { email: e, reason, detail, at: new Date().toISOString(), hits: 1 };
  saveSuppression([entry, ...rows]);
  return entry;
}

export function unsuppress(email: string): void {
  const e = (email || '').trim().toLowerCase();
  saveSuppression(loadSuppression().filter(s => s.email !== e));
}

/** Fold sent-email outcomes into the suppression list. Returns how many were added. */
export function syncSuppressionFromHistory(): number {
  const rows = loadEmails();
  let added = 0;
  for (const em of rows) {
    if (em.direction !== 'outbound') continue;
    if (em.status === 'bounced' && !isSuppressed(contactEmailAddress(em))) {
      const addr = contactEmailAddress(em);
      if (addr) { suppress(addr, 'hard_bounce', `Bounced on "${em.subject}"`); added++; }
    }
  }
  return added;
}

/** The recipient address recorded on a stored email, when we have one. */
function contactEmailAddress(em: ContactEmail): string {
  return (em as unknown as { toEmail?: string }).toEmail || '';
}

/* ── Contact email-health field ──────────────────────────────────────────── */

export interface HealthRecord { verdict: Verdict; score: number; reason: string; at: string; }

export function loadHealth(): Record<string, HealthRecord> {
  try {
    const raw = JSON.parse(localStorage.getItem(HEALTH_KEY) || '{}');
    return raw && typeof raw === 'object' ? raw : {};
  } catch { return {}; }
}

export function saveHealth(map: Record<string, HealthRecord>) {
  try { localStorage.setItem(HEALTH_KEY, JSON.stringify(map)); } catch { /* storage full */ }
}

export function healthFor(email: string): HealthRecord | null {
  const e = (email || '').trim().toLowerCase();
  if (!e) return null;
  const sup = findSuppression(e);
  if (sup) return { verdict: 'invalid', score: 0, reason: sup.detail, at: sup.at };
  return loadHealth()[e] ?? null;
}

/** Store verification results as each contact's email-health field. */
export function recordHealth(results: VerifyResult[]): void {
  const map = loadHealth();
  for (const r of results) {
    const key = r.normalized || r.email;
    if (!key) continue;
    map[key] = { verdict: r.verdict, score: r.score, reason: r.reasons[0] ?? '', at: new Date().toISOString() };
    if (r.verdict === 'invalid' && !isSuppressed(key)) {
      suppress(key, 'invalid', r.reasons[0] || 'Failed verification');
    }
  }
  saveHealth(map);
}

export const HEALTH_META: Record<Verdict, { label: string; color: string; bg: string }> = {
  valid:   { label: 'Valid',   color: '#16a34a', bg: '#dcfce7' },
  risky:   { label: 'Risky',   color: '#d97706', bg: '#fef3c7' },
  invalid: { label: 'Invalid', color: '#dc2626', bg: '#fef2f2' },
  unknown: { label: 'Unchecked', color: '#64748b', bg: '#f1f5f9' },
};

/* ── Content scanning ────────────────────────────────────────────────────── */

interface SpamRule { pattern: RegExp; weight: number; label: string; advice: string; }

/** Phrases filters actually weight, grouped by how much trouble they cause. */
const SPAM_RULES: SpamRule[] = [
  { pattern: /\b(viagra|cialis|pharmacy|casino|lottery|winner|jackpot)\b/gi, weight: 12, label: 'High-risk term', advice: 'Filters treat these as near-certain spam. Remove them.' },
  { pattern: /\b(free money|make money fast|get rich|double your|risk[- ]free|no credit check)\b/gi, weight: 10, label: 'Get-rich phrasing', advice: 'Rewrite as a concrete, specific benefit.' },
  { pattern: /\b(act now|urgent|limited time|expires? (today|soon)|last chance|don'?t delay|hurry)\b/gi, weight: 6, label: 'False urgency', advice: 'Say when the offer ends instead of shouting about it.' },
  { pattern: /\b(100% (free|guaranteed)|guarantee[d]?|no obligation|no strings)\b/gi, weight: 6, label: 'Absolute promise', advice: 'Qualify the claim, or drop it.' },
  { pattern: /\b(click here|click below|buy now|order now|sign up free)\b/gi, weight: 5, label: 'Generic call to action', advice: 'Describe the destination: "See the pricing" beats "Click here".' },
  { pattern: /\b(cash bonus|extra income|earn \$|\$\$\$|save big|discount|cheap|lowest price)\b/gi, weight: 5, label: 'Money bait', advice: 'Lead with the outcome rather than the number.' },
  { pattern: /\b(dear (friend|sir|madam)|congratulations you)\b/gi, weight: 7, label: 'Impersonal opener', advice: 'Use the contact\'s name — you already have it as a merge token.' },
  { pattern: /\b(this is not spam|unsubscribe below to stop)\b/gi, weight: 9, label: 'Protesting innocence', advice: 'Saying it is not spam is a classic spam signal. Delete the line.' },
];

export interface ContentIssue { label: string; matches: string[]; weight: number; advice: string; }
export interface ContentScan {
  score: number;                 // 0–100, higher is safer
  band: 'good' | 'ok' | 'poor';
  issues: ContentIssue[];
  stats: { words: number; links: number; capsRatio: number; exclamations: number; subjectLength: number };
  summary: string;
}

/**
 * Score subject + body the way a filter roughly would. Deterministic, offline,
 * and every deduction is reported with what to do about it.
 */
export function scanContent(subject: string, body: string): ContentScan {
  const text = `${subject}\n${body}`;
  const issues: ContentIssue[] = [];
  let penalty = 0;

  for (const rule of SPAM_RULES) {
    const found = text.match(rule.pattern);
    if (!found) continue;
    const matches = [...new Set(found.map(m => m.trim()))];
    const weight = rule.weight * Math.min(3, matches.length);
    penalty += weight;
    issues.push({ label: rule.label, matches, weight, advice: rule.advice });
  }

  const words = text.trim().split(/\s+/).filter(Boolean).length;
  const links = (body.match(/https?:\/\/[^\s"'<>)]+/gi) || []).length;
  const letters = text.replace(/[^a-zA-Z]/g, '');
  const capsRatio = letters.length ? (text.replace(/[^A-Z]/g, '').length / letters.length) : 0;
  const exclamations = (text.match(/!/g) || []).length;

  if (subject.length > 0 && subject.length < 4) {
    penalty += 6; issues.push({ label: 'Subject too short', matches: [subject], weight: 6, advice: 'A one-word subject reads as a template. Aim for 30–50 characters.' });
  }
  if (subject.length > 70) {
    penalty += 4; issues.push({ label: 'Subject too long', matches: [`${subject.length} characters`], weight: 4, advice: 'Phones truncate past ~50 characters. Put the point first.' });
  }
  if (subject && subject === subject.toUpperCase() && /[A-Z]{4,}/.test(subject)) {
    penalty += 8; issues.push({ label: 'Subject in capitals', matches: [subject], weight: 8, advice: 'All caps is one of the oldest spam tells. Use sentence case.' });
  }
  if (capsRatio > 0.3 && letters.length > 40) {
    penalty += 8; issues.push({ label: 'Shouting', matches: [`${Math.round(capsRatio * 100)}% capitals`], weight: 8, advice: 'Drop the capitals to under 20% of letters.' });
  }
  if (exclamations >= 3) {
    penalty += Math.min(9, exclamations * 2);
    issues.push({ label: 'Too many exclamation marks', matches: [`${exclamations} of them`], weight: Math.min(9, exclamations * 2), advice: 'One is plenty; filters count the rest against you.' });
  }
  if (words > 0 && words < 25) {
    penalty += 5; issues.push({ label: 'Very little text', matches: [`${words} words`], weight: 5, advice: 'Short, link-heavy mail looks like a redirect. Add real content.' });
  }
  if (links > 0 && words > 0 && links / Math.max(words, 1) > 0.08) {
    penalty += 7; issues.push({ label: 'Link-heavy', matches: [`${links} links in ${words} words`], weight: 7, advice: 'Keep it to one or two links per message.' });
  }
  if (links === 0 && words > 60) {
    penalty += 2; issues.push({ label: 'No link at all', matches: [], weight: 2, advice: 'A message with no next step tends to underperform; it is not a spam risk.' });
  }

  const score = Math.max(0, Math.min(100, 100 - penalty));
  const band = score >= 80 ? 'good' : score >= 55 ? 'ok' : 'poor';
  const summary = band === 'good'
    ? 'Nothing here should trouble a spam filter.'
    : band === 'ok'
      ? `${issues.length} thing${issues.length === 1 ? '' : 's'} worth tidying before you send.`
      : 'This is likely to be filtered. Fix the flagged items before sending.';

  return { score, band, issues, stats: { words, links, capsRatio, exclamations, subjectLength: subject.length }, summary };
}

/* ── Reputation metrics from real send history ───────────────────────────── */

export interface ReputationMetrics {
  sent: number;
  delivered: number;
  opened: number;
  clicked: number;
  replied: number;
  hardBounces: number;
  failed: number;
  complaints: number;
  deliveryRate: number;
  openRate: number;
  clickRate: number;
  bounceRate: number;
  complaintRate: number;
  senderScore: number;
  band: 'strong' | 'watch' | 'at-risk';
  components: { label: string; points: number; max: number; detail: string }[];
}

/**
 * Sender score from what actually happened to our own mail. Every component is
 * returned with its reasoning, because a reputation number nobody can question
 * is a number nobody should trust.
 */
export function reputation(emails: ContactEmail[] = loadEmails()): ReputationMetrics {
  // Messages we refused ourselves never reached a mail server; counting them
  // as delivery failures would make our own caution look like bad reputation.
  const out = emails.filter(e => e.direction === 'outbound' && e.status !== 'scheduled'
    && !(e as unknown as { blockedLocally?: boolean }).blockedLocally);
  const sent = out.length;
  const hardBounces = out.filter(e => e.status === 'bounced').length;
  const failed = out.filter(e => e.status === 'failed').length;
  const delivered = sent - hardBounces - failed;
  const opened = out.filter(e => e.opens > 0 || e.status === 'opened' || e.status === 'clicked' || e.status === 'replied').length;
  const clicked = out.filter(e => e.clicks > 0 || e.status === 'clicked').length;
  const replied = out.filter(e => e.status === 'replied').length;
  const complaints = loadSuppression().filter(s => s.reason === 'complaint').length;

  const pct = (n: number, d: number) => (d > 0 ? Math.round((n / d) * 1000) / 10 : 0);
  const deliveryRate = pct(delivered, sent);
  const openRate = pct(opened, delivered);
  const clickRate = pct(clicked, delivered);
  const bounceRate = pct(hardBounces, sent);
  const complaintRate = pct(complaints, sent);

  const components: ReputationMetrics['components'] = [];

  // Delivery (40): the single biggest signal.
  const deliveryPts = sent === 0 ? 30 : Math.round((deliveryRate / 100) * 40);
  components.push({ label: 'Delivery', points: deliveryPts, max: 40,
    detail: sent === 0 ? 'No mail sent yet — starting from a neutral position.' : `${deliveryRate}% of ${sent} accepted by the receiving server.` });

  // Bounces (25): rises steeply because ISPs treat it steeply.
  const bouncePts = bounceRate === 0 ? 25 : bounceRate < 2 ? 20 : bounceRate < 5 ? 10 : 0;
  components.push({ label: 'Bounce rate', points: bouncePts, max: 25,
    detail: `${bounceRate}% hard bounces. Under 2% is healthy; over 5% gets you throttled.` });

  // Complaints (20): the threshold that actually gets senders blocked.
  const complaintPts = complaintRate === 0 ? 20 : complaintRate < 0.1 ? 16 : complaintRate < 0.3 ? 8 : 0;
  components.push({ label: 'Spam complaints', points: complaintPts, max: 20,
    detail: `${complaintRate}% complained. Gmail acts above 0.3%; stay under 0.1%.` });

  // Engagement (15): providers read opens and clicks as wanted-mail signals.
  const engagementPts = Math.round(Math.min(1, (openRate / 25 + clickRate / 5) / 2) * 15);
  components.push({ label: 'Engagement', points: engagementPts, max: 15,
    detail: `${openRate}% opened, ${clickRate}% clicked. Providers read engagement as proof the mail is wanted.` });

  const senderScore = Math.max(0, Math.min(100, components.reduce((s, c) => s + c.points, 0)));
  const band: ReputationMetrics['band'] = senderScore >= 80 ? 'strong' : senderScore >= 55 ? 'watch' : 'at-risk';

  return {
    sent, delivered, opened, clicked, replied, hardBounces, failed, complaints,
    deliveryRate, openRate, clickRate, bounceRate, complaintRate,
    senderScore, band, components,
  };
}

/* ── Volume and timing advice ────────────────────────────────────────────── */

export interface VolumeAdvice {
  dailyMax: number;
  weeklyMax: number;
  reason: string;
  warmupDay: number;
}

/**
 * A safe daily ceiling. New senders ramp; established senders are limited by
 * the health of the list rather than the calendar.
 */
export function volumeAdvice(listSize: number, metrics: ReputationMetrics = reputation()): VolumeAdvice {
  const emails = loadEmails().filter(e => e.direction === 'outbound' && e.sentAt);
  const firstSend = emails.length ? emails.map(e => e.sentAt!).sort()[0] : null;
  const daysSending = firstSend ? Math.max(1, Math.floor((Date.now() - new Date(firstSend).getTime()) / 86_400_000) + 1) : 0;

  if (daysSending === 0) {
    return { dailyMax: 20, weeklyMax: 100, warmupDay: 0,
      reason: 'Nothing has been sent from here yet. Start at 20 a day so providers see a human pattern, not a burst.' };
  }
  if (daysSending < 30) {
    // Roughly doubling every four days, which is the accepted ramp shape.
    const cap = Math.min(2000, Math.round(20 * Math.pow(2, daysSending / 4)));
    const penalty = metrics.bounceRate > 3 || metrics.complaintRate > 0.2 ? 0.5 : 1;
    const dailyMax = Math.max(20, Math.round(cap * penalty));
    return { dailyMax, weeklyMax: dailyMax * 5, warmupDay: daysSending,
      reason: penalty < 1
        ? `Day ${daysSending} of warmup, halved because bounces or complaints are above target. Fix the list before ramping further.`
        : `Day ${daysSending} of warmup. The ramp roughly doubles every four days as long as the numbers stay clean.` };
  }
  const healthy = metrics.senderScore >= 70;
  const dailyMax = healthy ? Math.max(200, Math.min(listSize, 5000)) : Math.max(100, Math.round(listSize * 0.2));
  return { dailyMax, weeklyMax: dailyMax * 5, warmupDay: daysSending,
    reason: healthy
      ? `Sender score is ${metrics.senderScore}, so a normal volume is safe. Avoid sudden multiples of your usual send.`
      : `Sender score is ${metrics.senderScore}. Hold volume down and send only to engaged contacts until it recovers.` };
}

export interface SendTimeAdvice { hour: number; label: string; confidence: 'high' | 'low'; reason: string; }

/** Best hour to send, taken from when opens actually happened. */
export function bestSendTime(emails: ContactEmail[] = loadEmails()): SendTimeAdvice {
  const hours = new Array(24).fill(0);
  let samples = 0;
  for (const e of emails) {
    if (!e.firstOpenAt) continue;
    const h = new Date(e.firstOpenAt).getHours();
    if (Number.isNaN(h)) continue;
    hours[h]++; samples++;
  }
  if (samples < 8) {
    return { hour: 10, label: '10:00', confidence: 'low',
      reason: `Only ${samples} open${samples === 1 ? '' : 's'} recorded so far, which is too few to read a pattern. 10:00 local is a sound default.` };
  }
  const best = hours.indexOf(Math.max(...hours));
  return { hour: best, label: `${String(best).padStart(2, '0')}:00`, confidence: 'high',
    reason: `${hours[best]} of ${samples} opens happened in the ${String(best).padStart(2, '0')}:00 hour.` };
}

/* ── Pre-send check ──────────────────────────────────────────────────────── */

export interface PreSendIssue { level: 'block' | 'warn' | 'info'; title: string; detail: string; }
export interface PreSendReport {
  canSend: boolean;
  recipients: number;
  blocked: string[];
  risky: string[];
  issues: PreSendIssue[];
  content: ContentScan;
}

/**
 * The gate before a campaign goes out. Blocking issues are the ones that harm
 * the sender's reputation; everything else is advice, not an obstacle.
 */
export function preSendCheck(
  recipients: { email: string }[],
  subject: string,
  body: string,
  settings: DeliverabilitySettings = loadSettings(),
): PreSendReport {
  const issues: PreSendIssue[] = [];
  const blocked: string[] = [];
  const risky: string[] = [];

  for (const r of recipients) {
    const check = localCheck(r.email);
    const health = healthFor(r.email);
    const verdict = health?.verdict ?? check.verdict;
    if (verdict === 'invalid') blocked.push(r.email);
    else if (verdict === 'risky') risky.push(r.email);
  }

  if (blocked.length) {
    issues.push({ level: 'block', title: `${blocked.length} address${blocked.length === 1 ? '' : 'es'} will not be sent to`,
      detail: 'These are suppressed, disposable or previously bounced. Sending to them damages your reputation, so they are skipped automatically.' });
  }
  if (risky.length) {
    issues.push({ level: settings.blockRisky ? 'block' : 'warn', title: `${risky.length} risky address${risky.length === 1 ? '' : 'es'}`,
      detail: settings.blockRisky
        ? 'Blocking risky addresses is switched on in your deliverability settings, so these are skipped too.'
        : 'Role addresses and unverified domains. They usually deliver, but they complain more often than personal addresses.' });
  }

  const metrics = reputation();
  if (metrics.bounceRate > settings.bounceThreshold) {
    issues.push({ level: 'warn', title: `Bounce rate is ${metrics.bounceRate}%`,
      detail: `Your alert threshold is ${settings.bounceThreshold}%. Clean the list before a large send.` });
  }
  if (metrics.complaintRate > settings.complaintThreshold) {
    issues.push({ level: 'block', title: `Spam complaints are at ${metrics.complaintRate}%`,
      detail: `Above your ${settings.complaintThreshold}% threshold. Providers start filtering around 0.3%. Send only to engaged contacts until this comes down.` });
  }
  if (metrics.senderScore < settings.minSenderScore && metrics.sent > 20) {
    issues.push({ level: 'warn', title: `Sender score is ${metrics.senderScore}`,
      detail: `Below your minimum of ${settings.minSenderScore}. Smaller sends to engaged contacts will bring it back up.` });
  }

  const advice = volumeAdvice(recipients.length, metrics);
  const willSend = recipients.length - blocked.length - (settings.blockRisky ? risky.length : 0);
  if (willSend > advice.dailyMax) {
    issues.push({ level: 'warn', title: `${willSend} recipients exceeds today's safe volume of ${advice.dailyMax}`,
      detail: advice.reason + ' Split the send across days rather than sending it all at once.' });
  }

  const content = scanContent(subject, body);
  if (content.band === 'poor') {
    issues.push({ level: 'warn', title: `Content scores ${content.score}/100 for spam risk`, detail: content.summary });
  }

  if (!settings.sendingDomain) {
    issues.push({ level: 'info', title: 'No sending domain set',
      detail: 'Set it in Settings → Email Deliverability so SPF, DKIM and DMARC can be checked automatically.' });
  }

  return {
    canSend: !issues.some(i => i.level === 'block' && !i.title.includes('will not be sent to')),
    recipients: recipients.length, blocked, risky, issues, content,
  };
}

/** Recipients that survive the pre-send gate. */
export function sendableRecipients<T extends { email: string }>(list: T[], settings: DeliverabilitySettings = loadSettings()): T[] {
  return list.filter(r => {
    const verdict = healthFor(r.email)?.verdict ?? localCheck(r.email).verdict;
    if (verdict === 'invalid') return false;
    if (verdict === 'risky' && settings.blockRisky) return false;
    return true;
  });
}

/* ── Contact list helpers ────────────────────────────────────────────────── */

export interface ListHygiene {
  total: number;
  valid: number;
  risky: number;
  invalid: number;
  unchecked: number;
  suppressed: number;
  cleanPercent: number;
}

export function listHygiene(contacts: Contact[]): ListHygiene {
  let valid = 0, risky = 0, invalid = 0, unchecked = 0, suppressed = 0;
  for (const c of contacts) {
    if (!c.email) { invalid++; continue; }
    if (isSuppressed(c.email)) { suppressed++; invalid++; continue; }
    const h = healthFor(c.email);
    if (!h) { unchecked++; continue; }
    if (h.verdict === 'valid') valid++;
    else if (h.verdict === 'risky') risky++;
    else invalid++;
  }
  const total = contacts.length;
  return { total, valid, risky, invalid, unchecked, suppressed,
    cleanPercent: total ? Math.round(((total - invalid) / total) * 100) : 100 };
}
