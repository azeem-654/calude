/**
 * deliverabilityAlerts.ts — noticing trouble before it becomes damage.
 *
 * The rest of the module reports numbers. This watches them and speaks up when
 * one crosses a line that matters, through whichever channels are configured.
 *
 * Two design rules, both learned from alerting systems people end up ignoring:
 *  - An alert fires once per condition per day. A bounce rate that is too high
 *    is one problem, not one problem per page load.
 *  - Every alert says what to do, not just what is wrong. "Bounce rate is 6%"
 *    is a reading; "clean the list before your next send" is an alert.
 */

import type { Contact } from '../types';
import { reputation, loadSettings, loadSuppression, listHygiene, checkBlacklists } from './deliverability';
import { providerHealth, loadSeeds, placementSummary } from './warmup';
import { loadEmailConfig, sendEmail } from './emailService';

const ALERTS_KEY = 'crm_deliverability_alerts';
const FIRED_KEY = 'crm_deliverability_alerts_fired';
const PREFS_KEY = 'crm_alert_prefs';

export type Severity = 'critical' | 'warning' | 'info';

export interface Alert {
  id: string;
  /** Stable per condition, so the same problem is not raised twice a day. */
  rule: string;
  severity: Severity;
  title: string;
  detail: string;
  /** What to actually do about it. */
  action: string;
  at: string;
  read: boolean;
}

export interface AlertPrefs {
  inApp: boolean;
  email: boolean;
  emailTo: string;
  sms: boolean;
  smsTo: string;
  /** Do not send email or SMS for anything below this. */
  minSeverity: Severity;
}

export const DEFAULT_PREFS: AlertPrefs = {
  inApp: true,
  email: false,
  emailTo: '',
  sms: false,
  smsTo: '',
  minSeverity: 'critical',
};

const SEVERITY_RANK: Record<Severity, number> = { info: 0, warning: 1, critical: 2 };

export const SEVERITY_META: Record<Severity, { label: string; color: string; bg: string }> = {
  critical: { label: 'Critical', color: '#dc2626', bg: '#fef2f2' },
  warning:  { label: 'Warning',  color: '#d97706', bg: '#fffbeb' },
  info:     { label: 'Note',     color: '#4f46e5', bg: '#eef2ff' },
};

/* ── Storage ─────────────────────────────────────────────────────────────── */

export function loadPrefs(): AlertPrefs {
  try {
    const raw = JSON.parse(localStorage.getItem(PREFS_KEY) || 'null');
    return raw && typeof raw === 'object' ? { ...DEFAULT_PREFS, ...raw } : DEFAULT_PREFS;
  } catch { return DEFAULT_PREFS; }
}

export function savePrefs(p: AlertPrefs) {
  try { localStorage.setItem(PREFS_KEY, JSON.stringify(p)); } catch { /* storage blocked */ }
}

export function loadAlerts(): Alert[] {
  try {
    const raw = JSON.parse(localStorage.getItem(ALERTS_KEY) || '[]');
    return Array.isArray(raw) ? raw : [];
  } catch { return []; }
}

function saveAlerts(rows: Alert[]) {
  try { localStorage.setItem(ALERTS_KEY, JSON.stringify(rows.slice(0, 200))); } catch { /* storage full */ }
}

export function markRead(id: string) {
  saveAlerts(loadAlerts().map(a => (a.id === id ? { ...a, read: true } : a)));
}

export function markAllRead() {
  saveAlerts(loadAlerts().map(a => ({ ...a, read: true })));
}

export function dismissAlert(id: string) {
  saveAlerts(loadAlerts().filter(a => a.id !== id));
}

export const unreadCount = () => loadAlerts().filter(a => !a.read).length;

/** Which rules already fired today, so a standing problem is raised once. */
function firedToday(): Set<string> {
  try {
    const raw = JSON.parse(localStorage.getItem(FIRED_KEY) || '{}');
    const today = new Date().toISOString().slice(0, 10);
    return new Set(raw.date === today && Array.isArray(raw.rules) ? raw.rules : []);
  } catch { return new Set(); }
}

function recordFired(rules: Set<string>) {
  try {
    localStorage.setItem(FIRED_KEY, JSON.stringify({ date: new Date().toISOString().slice(0, 10), rules: [...rules] }));
  } catch { /* storage blocked */ }
}

/* ── Rules ───────────────────────────────────────────────────────────────── */

type Candidate = Omit<Alert, 'id' | 'at' | 'read'>;

/**
 * Evaluate every rule against the current state. Pure: returns what should be
 * raised without raising anything, so it can be inspected and tested.
 */
export function evaluateRules(contacts: Contact[]): Candidate[] {
  const out: Candidate[] = [];
  const settings = loadSettings();
  const metrics = reputation();
  const hygiene = listHygiene(contacts);
  const suppression = loadSuppression();

  // Nothing sent yet means nothing to judge — silence is the honest answer.
  if (metrics.sent >= 10) {
    if (metrics.complaintRate > 0.3) {
      out.push({
        rule: 'complaints-critical', severity: 'critical',
        title: `Spam complaints at ${metrics.complaintRate}%`,
        detail: 'Gmail and Microsoft begin filtering a sender above 0.3%. At this level your mail is already being treated as unwanted.',
        action: 'Stop bulk sending now. Send only to contacts who opened something in the last 30 days until this falls below 0.1%.',
      });
    } else if (metrics.complaintRate > settings.complaintThreshold) {
      out.push({
        rule: 'complaints-warning', severity: 'warning',
        title: `Spam complaints at ${metrics.complaintRate}%`,
        detail: `Above your ${settings.complaintThreshold}% threshold. The level providers act on is 0.3%.`,
        action: 'Check what you sent most recently. Complaints usually follow a list people did not expect to hear from you.',
      });
    }

    if (metrics.bounceRate > 5) {
      out.push({
        rule: 'bounces-critical', severity: 'critical',
        title: `Bounce rate at ${metrics.bounceRate}%`,
        detail: 'Above 5%, receiving servers start throttling or rejecting outright. This is the fastest way to lose a sending reputation.',
        action: 'Run a bulk verification on the whole list before the next send: Settings → Email Deliverability → Verification & placement.',
      });
    } else if (metrics.bounceRate > settings.bounceThreshold) {
      out.push({
        rule: 'bounces-warning', severity: 'warning',
        title: `Bounce rate at ${metrics.bounceRate}%`,
        detail: `Above your ${settings.bounceThreshold}% threshold. Healthy is under 2%.`,
        action: 'Verify the unchecked addresses — bounces almost always come from contacts nobody has validated.',
      });
    }

    if (metrics.senderScore < settings.minSenderScore) {
      out.push({
        rule: 'score-low', severity: metrics.senderScore < 40 ? 'critical' : 'warning',
        title: `Sender score has fallen to ${metrics.senderScore}`,
        detail: `Below your minimum of ${settings.minSenderScore}. ${metrics.components.filter(c => c.points < c.max * 0.5).map(c => c.label.toLowerCase()).join(' and ') || 'Several factors'} are dragging it down.`,
        action: 'Reduce volume and send only to engaged contacts. A score recovers over weeks of clean sending, not overnight.',
      });
    }

    if (metrics.deliveryRate < 90) {
      out.push({
        rule: 'delivery-low', severity: 'warning',
        title: `Only ${metrics.deliveryRate}% of mail is being accepted`,
        detail: `${metrics.hardBounces + metrics.failed} of ${metrics.sent} were rejected by the receiving server.`,
        action: 'Check your authentication records and blacklist status — wholesale rejection usually means SPF, DKIM or a listing.',
      });
    }
  }

  if (hygiene.total >= 20 && hygiene.cleanPercent < 85) {
    out.push({
      rule: 'list-dirty', severity: 'warning',
      title: `Only ${hygiene.cleanPercent}% of your list is usable`,
      detail: `${hygiene.invalid} invalid and ${hygiene.risky} risky addresses out of ${hygiene.total}.`,
      action: 'Use One-click clean on the Contacts screen to remove what cannot be delivered to.',
    });
  }

  if (hygiene.unchecked > 50) {
    out.push({
      rule: 'list-unchecked', severity: 'info',
      title: `${hygiene.unchecked} addresses have never been verified`,
      detail: 'Unverified addresses are where bounces come from, and bounces are what providers judge you on.',
      action: 'Queue a bulk verification — it runs in the background and you can carry on working.',
    });
  }

  if (!settings.sendingDomain) {
    out.push({
      rule: 'no-domain', severity: 'info',
      title: 'No sending domain configured',
      detail: 'Without it, SPF, DKIM and DMARC cannot be checked, and those are the foundation of reaching an inbox at all.',
      action: 'Set your sending domain in Settings → Email Deliverability, then press Check records.',
    });
  }

  // Provider-specific trouble, from the warmup engine's own observations.
  const health = providerHealth();
  for (const p of health.byProvider) {
    if (p.sent >= 10 && p.bounceRate > 10) {
      out.push({
        rule: `provider-${p.id}`, severity: 'warning',
        title: `${p.name} is rejecting ${p.bounceRate}% of your mail`,
        detail: `${p.bounced} of ${p.sent} messages to ${p.name} addresses bounced — far worse than your overall rate.`,
        action: `This is usually specific to that provider. Reduce the daily cap for ${p.name} in the warmup panel and check your authentication records.`,
      });
    }
  }

  // Placement, when it has actually been measured.
  const placement = placementSummary();
  if (placement.checked >= 2 && placement.inboxRate < 60) {
    out.push({
      rule: 'placement-low', severity: 'critical',
      title: `Only ${placement.inboxRate}% of test mail reached an inbox`,
      detail: `${placement.spam} of ${placement.checked} seed mailboxes filed your message as spam. Delivery statistics will not show this — the mail was accepted, then filtered.`,
      action: 'Fix authentication first, then content. A placement problem with clean authentication is almost always the wording.',
    });
  }

  if (suppression.length > 0 && metrics.sent > 0 && suppression.length / Math.max(metrics.sent, 1) > 0.1) {
    out.push({
      rule: 'suppression-growing', severity: 'warning',
      title: `${suppression.length} addresses suppressed`,
      detail: 'That is a large share of what you have sent. A list generating this many failures usually needs re-permissioning rather than cleaning.',
      action: 'Look at where these contacts came from before adding more from the same source.',
    });
  }

  if (loadSeeds().length === 0) {
    out.push({
      rule: 'no-seeds', severity: 'info',
      title: 'No seed mailboxes configured',
      detail: 'Without them there is no way to know whether your mail reaches the inbox or the spam folder — every other number describes only what the sending server did.',
      action: 'Add a Gmail, an Outlook and a Yahoo address in Warmup & providers.',
    });
  }

  return out;
}

/* ── Raising ─────────────────────────────────────────────────────────────── */

export interface RaiseResult {
  raised: Alert[];
  emailed: number;
  smsQueued: number;
}

/**
 * Evaluate and raise. Only conditions that have not already fired today become
 * alerts, and only those at or above the configured severity go out by email
 * or SMS — in-app always records everything.
 */
export async function runAlertCheck(contacts: Contact[]): Promise<RaiseResult> {
  const prefs = loadPrefs();
  const already = firedToday();
  const candidates = evaluateRules(contacts).filter(c => !already.has(c.rule));

  if (!candidates.length) return { raised: [], emailed: 0, smsQueued: 0 };

  const now = new Date().toISOString();
  const raised: Alert[] = candidates.map((c, i) => ({
    ...c,
    id: `alert-${Date.now()}-${i}`,
    at: now,
    read: false,
  }));

  saveAlerts([...raised, ...loadAlerts()]);
  candidates.forEach(c => already.add(c.rule));
  recordFired(already);

  const notify = raised.filter(a => SEVERITY_RANK[a.severity] >= SEVERITY_RANK[prefs.minSeverity]);
  let emailed = 0;
  if (prefs.email && prefs.emailTo && notify.length) {
    const cfg = loadEmailConfig();
    const body = notify.map(a => `${SEVERITY_META[a.severity].label.toUpperCase()}: ${a.title}\n${a.detail}\nWhat to do: ${a.action}`).join('\n\n');
    const res = await sendEmail(cfg, {
      to: prefs.emailTo,
      toName: 'Deliverability alerts',
      subject: `${notify.length} deliverability alert${notify.length === 1 ? '' : 's'} — ${notify[0].title}`,
      html: `<div style="font-family:system-ui,sans-serif;line-height:1.6">${body.replace(/\n/g, '<br>')}</div>`,
    });
    if (res.success) emailed = notify.length;
  }

  // SMS goes out through the same Twilio settings the scheduling reminders
  // use. It is queued rather than sent here because the browser cannot reach
  // Twilio directly without exposing the token.
  let smsQueued = 0;
  if (prefs.sms && prefs.smsTo && notify.length) {
    try {
      const queue = JSON.parse(localStorage.getItem('crm_sms_queue') || '[]');
      const rows = Array.isArray(queue) ? queue : [];
      for (const a of notify) {
        rows.unshift({ to: prefs.smsTo, text: `${a.title}. ${a.action}`, at: now, sent: false });
        smsQueued++;
      }
      localStorage.setItem('crm_sms_queue', JSON.stringify(rows.slice(0, 100)));
    } catch { smsQueued = 0; }
  }

  return { raised, emailed, smsQueued };
}

/** Highest severity currently unread, for a badge. */
export function topSeverity(): Severity | null {
  const unread = loadAlerts().filter(a => !a.read);
  if (!unread.length) return null;
  return unread.reduce<Severity>((worst, a) => (SEVERITY_RANK[a.severity] > SEVERITY_RANK[worst] ? a.severity : worst), 'info');
}

/**
 * A blacklist listing is the one condition worth a network round trip, since
 * it cannot be derived from anything we already hold.
 */
export async function checkBlacklistAlert(): Promise<Alert | null> {
  const settings = loadSettings();
  if (!settings.sendingDomain) return null;
  const already = firedToday();
  if (already.has('blacklisted')) return null;

  // A DNSBL sweep is the most expensive thing the dashboard can ask the server
  // for — up to ten DNS round trips against remote zones. Marking it done for
  // the day *before* reading the result is the point: a clean domain used to
  // record nothing, so the sweep ran again on every single dashboard load.
  if (already.has('blacklist-checked')) return null;
  already.add('blacklist-checked');
  recordFired(already);

  const res = await checkBlacklists(settings.sendingDomain);
  if (!res.ok || !res.data || res.data.listedCount === 0) return null;

  const lists = res.data.results.filter(r => r.listed).map(r => r.list).join(', ');
  const alert: Alert = {
    id: `alert-${Date.now()}-bl`,
    rule: 'blacklisted',
    severity: 'critical',
    title: `${settings.sendingDomain} is on ${res.data.listedCount} blacklist${res.data.listedCount === 1 ? '' : 's'}`,
    detail: `Listed on ${lists}. While listed, a large share of your mail will be rejected before it is ever seen.`,
    action: 'Use the delisting links in Settings → Email Deliverability. Fix the cause first, or you will be relisted within days.',
    at: new Date().toISOString(),
    read: false,
  };
  saveAlerts([alert, ...loadAlerts()]);
  already.add('blacklisted');
  recordFired(already);
  return alert;
}
