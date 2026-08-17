/**
 * contactEmail.ts — per-contact email history, sending, scheduling and
 * sequence enrolment for the contact command center.
 *
 * Outbound mail gets a tracking pixel and rewritten links pointing at
 * `api/track.php`, so opens and clicks are recorded for real once deployed.
 * `syncTracking()` folds those server-side events back into local history.
 * Everything is tenant-scoped through the patched localStorage layer.
 */

import type { Contact } from '../types';
import type { EmailSequence } from '../types/marketing';
import { loadEmailConfig, sendEmail, personalizeHtml } from './emailService';
import { getActiveAccountId } from './tenancy';
import { findSuppression, localCheck, loadSettings, suppress } from './deliverability';
import { warmupGate, recordSend } from './warmup';

/**
 * Decide whether an address may be emailed at all. Called on every outbound
 * send; the reason is returned so the caller can show it rather than failing
 * mysteriously.
 */
function deliverabilityGate(email: string, opts: SendOptions): { ok: boolean; reason: string } {
  if (opts.ignoreDeliverability) return { ok: true, reason: '' };
  const addr = (email || '').trim();
  if (!addr) return { ok: false, reason: 'This contact has no email address.' };

  const suppressed = findSuppression(addr);
  if (suppressed) {
    return { ok: false, reason: `Blocked: ${addr} is on the suppression list (${suppressed.reason.replace('_', ' ')}). Remove it in Settings → Email Deliverability to send again.` };
  }

  // The warmup ramp is a real ceiling, not a chart: once today's allowance for
  // the day or for this provider is used up, the send is refused.
  const gate = warmupGate(addr);
  if (!gate.ok) return { ok: false, reason: gate.reason };

  const settings = loadSettings();
  if (!settings.verifyBeforeSend) return { ok: true, reason: '' };

  const check = localCheck(addr);
  if (check.verdict === 'invalid') {
    return { ok: false, reason: `Blocked: ${check.reason}` };
  }
  if (check.verdict === 'risky' && settings.blockRisky) {
    return { ok: false, reason: `Blocked: ${check.reason} Risky addresses are set to be blocked in your deliverability settings.` };
  }
  return { ok: true, reason: '' };
}

const EMAILS_KEY = 'crm_contact_emails';
const ENROLL_KEY = 'crm_sequence_enrollments';
const SYNC_KEY = 'crm_track_sync';

export type EmailStatus = 'scheduled' | 'sending' | 'sent' | 'opened' | 'clicked' | 'replied' | 'bounced' | 'failed';

export interface EmailAttachment { name: string; size: number; type: string; }

export interface ContactEmail {
  id: string;
  contactId: string;
  subject: string;
  /** Body as authored, personalization tokens intact. */
  body: string;
  status: EmailStatus;
  direction: 'outbound' | 'inbound';
  createdAt: string;
  sentAt?: string;
  scheduledFor?: string;
  firstOpenAt?: string;
  lastOpenAt?: string;
  firstClickAt?: string;
  repliedAt?: string;
  opens: number;
  clicks: number;
  clickedUrls: string[];
  attachments: EmailAttachment[];
  templateId?: string;
  sequenceId?: string;
  /** Groups a reply with the message it answers. */
  threadId: string;
  /** Recipient address, kept so bounces can be traced back to an address. */
  toEmail?: string;
  /** True when we refused to send this ourselves. It never reached a mail
   *  server, so it must not be read as that provider rejecting us. */
  blockedLocally?: boolean;
  error?: string;
}

export interface SequenceEnrollment {
  id: string;
  contactId: string;
  sequenceId: string;
  sequenceName: string;
  status: 'active' | 'paused' | 'completed' | 'cancelled';
  currentStep: number;
  totalSteps: number;
  enrolledAt: string;
  nextSendAt?: string;
  history: { step: number; at: string; action: 'sent' | 'skipped' | 'paused' | 'resumed' }[];
}

/* ── Storage ── */

function load<T>(key: string): T[] {
  try { const v = JSON.parse(localStorage.getItem(key) || '[]'); return Array.isArray(v) ? v : []; } catch { return []; }
}
function save<T>(key: string, rows: T[]) {
  try { localStorage.setItem(key, JSON.stringify(rows)); } catch { /* quota */ }
}

export const loadEmails = () => load<ContactEmail>(EMAILS_KEY);
export const saveEmails = (rows: ContactEmail[]) => save(EMAILS_KEY, rows);
export const emailsForContact = (contactId: string): ContactEmail[] =>
  loadEmails().filter(e => e.contactId === contactId)
    .sort((a, b) => (b.sentAt || b.scheduledFor || b.createdAt).localeCompare(a.sentAt || a.scheduledFor || a.createdAt));

export const loadEnrollments = () => load<SequenceEnrollment>(ENROLL_KEY);
export const saveEnrollments = (rows: SequenceEnrollment[]) => save(ENROLL_KEY, rows);
export const enrollmentsForContact = (contactId: string): SequenceEnrollment[] =>
  loadEnrollments().filter(e => e.contactId === contactId);

/* ── Templates ── */

export interface EmailTemplate { id: string; name: string; category: string; subject: string; body: string; }

/** Ready-to-use starting points; tokens are filled at send time. */
export const EMAIL_TEMPLATES: EmailTemplate[] = [
  { id: 'intro', name: 'Introduction', category: 'Outreach', subject: 'Quick hello from {{company}}',
    body: 'Hi {{firstName}},\n\nI wanted to introduce myself — I look after new customers here and thought it was worth reaching out directly.\n\nIf it is useful, I am happy to walk you through how we help businesses like yours. No pitch, just a straight conversation.\n\nWould a short call this week suit you?\n\nBest,' },
  { id: 'followup', name: 'Follow-up', category: 'Outreach', subject: 'Following up, {{firstName}}',
    body: 'Hi {{firstName}},\n\nJust floating this back to the top of your inbox in case it got buried.\n\nIs this still something you are looking at? If the timing is wrong, tell me and I will check back later — no hard feelings either way.\n\nBest,' },
  { id: 'proposal', name: 'Proposal sent', category: 'Sales', subject: 'Your proposal is ready',
    body: 'Hi {{firstName}},\n\nYour proposal is attached. It covers scope, timeline and a fixed price so there are no surprises.\n\nHappy to walk through it together — reply with a time that works and I will send an invite.\n\nBest,' },
  { id: 'checkin', name: 'Check-in', category: 'Retention', subject: 'How is everything going?',
    body: 'Hi {{firstName}},\n\nWe have not spoken in a little while, so I wanted to check in. How is everything going on your side?\n\nIf anything needs attention, just reply here and I will sort it.\n\nBest,' },
  { id: 'reengage', name: 'Re-engagement', category: 'Retention', subject: 'Still worth talking, {{firstName}}?',
    body: 'Hi {{firstName}},\n\nIt has been a while, so I will keep this short: is this still on your radar?\n\nIf yes, I will send over the current options. If not, reply "not now" and I will stop chasing.\n\nBest,' },
  { id: 'thanks', name: 'Thank you', category: 'Retention', subject: 'Thank you, {{firstName}}',
    body: 'Hi {{firstName}},\n\nThank you for choosing us — genuinely appreciated.\n\nIf anything comes up, reply to this email and it comes straight to me.\n\nBest,' },
  { id: 'review', name: 'Review request', category: 'Reputation', subject: 'Would you mind a quick review?',
    body: 'Hi {{firstName}},\n\nIf we did a good job, a short review would help other people find us — it takes about a minute.\n\nAnd if anything fell short, tell me first and I will put it right.\n\nBest,' },
  { id: 'meeting', name: 'Meeting recap', category: 'Sales', subject: 'Recap of our conversation',
    body: 'Hi {{firstName}},\n\nThanks for your time today. To recap what we agreed:\n\n1. \n2. \n3. \n\nI will follow up on my actions this week. Shout if I have missed anything.\n\nBest,' },
];

export const MERGE_TOKENS = [
  { token: '{{firstName}}', label: 'First name' },
  { token: '{{lastName}}', label: 'Last name' },
  { token: '{{fullName}}', label: 'Full name' },
  { token: '{{email}}', label: 'Email' },
  { token: '{{company}}', label: 'Company' },
  { token: '{{phone}}', label: 'Phone' },
  { token: '{{jobTitle}}', label: 'Job title' },
];

/* ── Tracking ── */

/** Absolute base for the PHP tracking endpoint on this deployment. */
function trackBase(): string {
  const base = (import.meta.env.BASE_URL || '/').replace(/\/$/, '');
  return `${window.location.origin}${base}/api/track.php`;
}

/**
 * Wrap an HTML body for tracking: rewrite links through the click redirector
 * and append an invisible open pixel.
 */
export function instrumentHtml(html: string, emailId: string): string {
  const account = getActiveAccountId() || 'default';
  const base = trackBase();
  const withLinks = html.replace(/href="(https?:\/\/[^"]+)"/gi, (_m, url: string) =>
    `href="${base}?c=${encodeURIComponent(emailId)}&a=${encodeURIComponent(account)}&u=${encodeURIComponent(url)}"`);
  const pixel = `<img src="${base}?o=${encodeURIComponent(emailId)}&a=${encodeURIComponent(account)}" width="1" height="1" alt="" style="display:block;border:0;width:1px;height:1px" />`;
  return `${withLinks}${pixel}`;
}

/** Turn an authored plain-text body into the HTML that actually gets sent. */
export function bodyToHtml(body: string): string {
  const esc = body
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  const linked = esc.replace(/(https?:\/\/[^\s<]+)/g, '<a href="$1">$1</a>');
  return `<div style="font-family:Inter,system-ui,sans-serif;font-size:15px;line-height:1.65;color:#0f172a">${linked.replace(/\n/g, '<br>')}</div>`;
}

/**
 * Pull open/click events recorded by track.php and merge them into history.
 * Returns how many emails changed so the caller can refresh.
 */
export async function syncTracking(): Promise<number> {
  /* The same fallback instrumentHtml uses. They disagreed: every pixel was
     stamped 'default' when no sub-account was selected, and this bailed out on
     the null — so a single-workspace account recorded every open and was shown
     none of them. */
  const account = getActiveAccountId() || 'default';
  const since = localStorage.getItem(SYNC_KEY) || '';
  const base = (import.meta.env.BASE_URL || '/').replace(/\/$/, '');
  let events: { emailId: string; kind: string; url?: string; at: string }[] = [];
  try {
    const res = await fetch(`${base}/api/track.php?events=1&a=${encodeURIComponent(account)}&since=${encodeURIComponent(since)}`);
    if (!res.ok) return 0;
    const json = await res.json();
    if (!json?.success || !Array.isArray(json.events)) return 0;
    events = json.events;
  } catch {
    return 0;   // endpoint not deployed / offline — history simply stays as-is
  }
  if (!events.length) return 0;

  const rows = loadEmails();
  let changed = 0;
  for (const ev of events) {
    const em = rows.find(r => r.id === ev.emailId);
    if (!em) continue;
    if (ev.kind === 'open') {
      em.opens += 1;
      em.firstOpenAt = em.firstOpenAt || ev.at;
      em.lastOpenAt = ev.at;
      if (em.status === 'sent') em.status = 'opened';
      changed++;
    } else if (ev.kind === 'click') {
      em.clicks += 1;
      em.firstClickAt = em.firstClickAt || ev.at;
      if (ev.url && !em.clickedUrls.includes(ev.url)) em.clickedUrls.push(ev.url);
      if (em.status === 'sent' || em.status === 'opened') em.status = 'clicked';
      changed++;
    }
  }
  if (changed) {
    saveEmails(rows);
    const newest = events.reduce((m, e) => (e.at > m ? e.at : m), since);
    localStorage.setItem(SYNC_KEY, newest);
  }
  return changed;
}

/* ── Sending ── */

export interface SendOptions {
  subject: string;
  body: string;
  attachments?: EmailAttachment[];
  templateId?: string;
  /** Bypass the deliverability gate. Only for transactional mail the user
   *  explicitly asked to send to a specific address. */
  ignoreDeliverability?: boolean;
  /** ISO datetime — queues instead of sending now. */
  scheduledFor?: string;
  sequenceId?: string;
  threadId?: string;
}

export interface SendOutcome { ok: boolean; email: ContactEmail; error?: string; }

/**
 * Record and send one email to a contact. Scheduled mail is stored and left
 * for `processScheduled()`; immediate mail goes out through the configured
 * provider with tracking instrumentation applied.
 */
export async function sendToContact(contact: Contact, opts: SendOptions): Promise<SendOutcome> {
  const id = `em-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
  const now = new Date().toISOString();

  /* Merged here rather than on the way out, so the history holds the words this
     person actually received. A record that reads "Hi {{firstName}}" is not a
     record of anything — and it is the copy a user checks when they are asked
     what was sent. */
  const merge = mergeFor(contact);
  const subject = personalizeHtml(opts.subject, merge);
  const body = personalizeHtml(opts.body, merge);

  /* Deliverability gate. Sending to a suppressed or invalid address is how a
     sender's reputation gets destroyed, so it is refused here — at the single
     point every outbound email passes through — rather than relying on each
     caller to remember. */
  const gate = deliverabilityGate(contact.email, opts);
  if (!gate.ok) {
    const blockedRow: ContactEmail = {
      id, contactId: contact.id, subject, body,
      status: 'failed', direction: 'outbound', createdAt: now,
      opens: 0, clicks: 0, clickedUrls: [], attachments: opts.attachments ?? [],
      templateId: opts.templateId, sequenceId: opts.sequenceId,
      threadId: opts.threadId || id, error: gate.reason,
      toEmail: (contact.email || '').toLowerCase(),
      blockedLocally: true,
    };
    const existing = loadEmails();
    existing.unshift(blockedRow);
    saveEmails(existing);
    return { ok: false, email: blockedRow, error: gate.reason };
  }

  const email: ContactEmail = {
    id, contactId: contact.id,
    subject, body,
    status: opts.scheduledFor ? 'scheduled' : 'sending',
    direction: 'outbound',
    createdAt: now,
    scheduledFor: opts.scheduledFor,
    opens: 0, clicks: 0, clickedUrls: [],
    attachments: opts.attachments ?? [],
    templateId: opts.templateId,
    sequenceId: opts.sequenceId,
    threadId: opts.threadId || id,
    toEmail: (contact.email || '').toLowerCase(),
  };

  const rows = loadEmails();
  rows.unshift(email);
  saveEmails(rows);

  if (opts.scheduledFor) return { ok: true, email };
  return deliver(email, contact);
}

/** The fields a merge token can draw on, in one place. */
function mergeFor(contact: Contact) {
  return {
    name: contact.name, email: contact.email, company: contact.company,
    phone: contact.phone, jobTitle: contact.jobTitle, website: contact.website,
    customFields: contact.customFields,
  };
}

/** Push one stored email through the provider and update its status. */
async function deliver(email: ContactEmail, contact: Contact): Promise<SendOutcome> {
  const cfg = loadEmailConfig();
  /* Subject and body were merged before the row was written, so what goes out
     and what is on file are the same text. The merge is passed on anyway for
     anything a scheduled row picked up later. */
  const merge = mergeFor(contact);
  const html = instrumentHtml(personalizeHtml(bodyToHtml(email.body), merge), email.id);

  const result = await sendEmail(cfg, { to: contact.email, toName: contact.name, subject: email.subject, html, merge });

  const rows = loadEmails();
  const row = rows.find(r => r.id === email.id);
  if (row) {
    if (result.success) {
      row.status = 'sent'; row.sentAt = new Date().toISOString(); row.error = undefined;
      // Count it against the warmup ramp only once it genuinely left.
      if (contact.email) recordSend(contact.email);
    }
    else {
      // A permanent rejection is a hard bounce: the mailbox does not exist, so
      // suppress it immediately rather than discovering it again next send.
      const permanent = /(550|551|553|does not exist|no such user|unknown recipient|mailbox unavailable|user unknown|recipient rejected)/i
        .test(result.error || '');
      row.status = permanent ? 'bounced' : 'failed';
      row.error = result.error || 'Send failed';
      if (permanent && contact.email) {
        suppress(contact.email, 'hard_bounce', `Rejected by the receiving server: ${(result.error || '').slice(0, 120)}`);
      }
    }
    saveEmails(rows);
  }
  return { ok: !!result.success, email: row ?? email, error: result.error };
}

/** Send any scheduled emails whose time has come. Returns how many went out. */
export async function processScheduled(contacts: Contact[]): Promise<number> {
  const rows = loadEmails();
  const due = rows.filter(r => r.status === 'scheduled' && r.scheduledFor && new Date(r.scheduledFor).getTime() <= Date.now());
  let sent = 0;
  for (const em of due) {
    const contact = contacts.find(c => c.id === em.contactId);
    if (!contact) continue;
    const out = await deliver(em, contact);
    if (out.ok) sent++;
  }
  return sent;
}

/** Mark an outbound email as replied to, and log the inbound message. */
export function recordReply(emailId: string, snippet: string): void {
  const rows = loadEmails();
  const em = rows.find(r => r.id === emailId);
  if (!em) return;
  em.status = 'replied';
  em.repliedAt = new Date().toISOString();
  rows.unshift({
    id: `em-${Date.now()}-r`, contactId: em.contactId,
    subject: `Re: ${em.subject}`, body: snippet,
    status: 'sent', direction: 'inbound',
    createdAt: new Date().toISOString(), sentAt: new Date().toISOString(),
    opens: 0, clicks: 0, clickedUrls: [], attachments: [], threadId: em.threadId,
  });
  saveEmails(rows);
}

/* ── Per-contact stats ── */

export interface EmailStats {
  sent: number; opened: number; clicked: number; replied: number; bounced: number;
  openRate: number; clickRate: number; replyRate: number;
  /** Green/amber/red engagement verdict for this contact's email behaviour. */
  band: 'good' | 'ok' | 'poor' | 'none';
}

export function emailStats(emails: ContactEmail[]): EmailStats {
  const out = emails.filter(e => e.direction === 'outbound' && e.status !== 'scheduled' && e.status !== 'failed');
  const sent = out.length;
  const opened = out.filter(e => e.opens > 0 || ['opened', 'clicked', 'replied'].includes(e.status)).length;
  const clicked = out.filter(e => e.clicks > 0 || e.status === 'clicked').length;
  const replied = out.filter(e => e.status === 'replied').length;
  const bounced = out.filter(e => e.status === 'bounced').length;
  const pct = (n: number) => (sent ? Math.round((n / sent) * 100) : 0);
  const openRate = pct(opened);
  const band: EmailStats['band'] = !sent ? 'none' : openRate >= 50 ? 'good' : openRate >= 20 ? 'ok' : 'poor';
  return { sent, opened, clicked, replied, bounced, openRate, clickRate: pct(clicked), replyRate: pct(replied), band };
}

/** Database-wide averages so a contact's rates have something to compare to. */
export function databaseAverages(): { openRate: number; clickRate: number; replyRate: number } {
  return emailStats(loadEmails());
}

/* ── Sequence enrolment ── */

export function enrollInSequence(contact: Contact, sequence: EmailSequence): SequenceEnrollment {
  const rows = loadEnrollments();
  const existing = rows.find(r => r.contactId === contact.id && r.sequenceId === sequence.id && (r.status === 'active' || r.status === 'paused'));
  if (existing) return existing;

  const first = sequence.steps[0];
  const enrollment: SequenceEnrollment = {
    id: `enr-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
    contactId: contact.id, sequenceId: sequence.id, sequenceName: sequence.name,
    status: 'active', currentStep: 0, totalSteps: sequence.steps.length,
    enrolledAt: new Date().toISOString(),
    nextSendAt: nextSendFor(first?.day ?? 0, first?.waitUnit ?? 'days'),
    history: [],
  };
  rows.push(enrollment);
  saveEnrollments(rows);
  return enrollment;
}

function nextSendFor(amount: number, unit: 'hours' | 'days'): string {
  const ms = unit === 'hours' ? amount * 3_600_000 : amount * 86_400_000;
  return new Date(Date.now() + ms).toISOString();
}

function patchEnrollment(id: string, fn: (e: SequenceEnrollment) => void): SequenceEnrollment | null {
  const rows = loadEnrollments();
  const e = rows.find(r => r.id === id);
  if (!e) return null;
  fn(e);
  saveEnrollments(rows);
  return e;
}

export const pauseEnrollment = (id: string) => patchEnrollment(id, e => {
  e.status = 'paused';
  e.history.push({ step: e.currentStep, at: new Date().toISOString(), action: 'paused' });
});

export const resumeEnrollment = (id: string) => patchEnrollment(id, e => {
  e.status = 'active';
  e.history.push({ step: e.currentStep, at: new Date().toISOString(), action: 'resumed' });
});

export const cancelEnrollment = (id: string) => patchEnrollment(id, e => { e.status = 'cancelled'; });

/** Skip the pending step and move to the next one. */
export const skipStep = (id: string, sequence?: EmailSequence) => patchEnrollment(id, e => {
  e.history.push({ step: e.currentStep, at: new Date().toISOString(), action: 'skipped' });
  e.currentStep += 1;
  if (e.currentStep >= e.totalSteps) {
    e.status = 'completed';
    e.nextSendAt = undefined;
  } else {
    const step = sequence?.steps[e.currentStep];
    e.nextSendAt = nextSendFor(step?.day ?? 1, step?.waitUnit ?? 'days');
  }
});

/**
 * Bring live enrolments back in line with a sequence whose steps changed.
 *
 * `totalSteps` is snapshotted when someone is enrolled, while `currentStep`
 * indexes the live array — so shortening a sequence leaves an enrolment
 * pointing past the end. processSequences finds no step, skips it, and the
 * person sits "active" with a send date in the past for ever. Anyone already
 * past the new last step has had everything the shortened sequence contains,
 * so they are finished, not stalled.
 *
 * Send times already set are left alone: rewriting the words does not move the
 * appointment, and the new wording is read at send time anyway.
 */
export function resyncEnrollments(sequence: EmailSequence): { retimed: number; completed: number } {
  const rows = loadEnrollments();
  let retimed = 0;
  let completed = 0;

  for (const e of rows) {
    if (e.sequenceId !== sequence.id) continue;
    /* A finished or cancelled enrolment ran the sequence it was on. Reopening
       it because the sequence grew would mail people who were already done. */
    if (e.status !== 'active' && e.status !== 'paused') continue;

    if (e.totalSteps !== sequence.steps.length) { e.totalSteps = sequence.steps.length; retimed++; }
    if (e.currentStep >= sequence.steps.length) {
      e.status = 'completed';
      e.nextSendAt = undefined;
      completed++;
    }
  }

  if (retimed || completed) saveEnrollments(rows);
  return { retimed, completed };
}

/**
 * Send any sequence steps that are due. Kept deliberately simple: one step per
 * run per enrolment, so a long backlog drains gradually rather than spamming.
 */
/**
 * A veto on an individual send, applied at the last moment before it goes.
 *
 * Daily caps live outside this module — they belong to whoever set them — so
 * the rule is injected rather than imported. Returning false holds the send
 * back without touching the enrolment, so it simply goes on the next run.
 */
export type SendGate = (contact: Contact, sequence: EmailSequence) => boolean;

export async function processSequences(
  contacts: Contact[],
  sequences: EmailSequence[],
  gate?: SendGate,
): Promise<number> {
  const rows = loadEnrollments();
  let sent = 0;
  /* Separate from `sent`. Persisting only on success meant a run where every
     send failed left currentStep where it was, so the next tick sent the same
     message again — and again, once a minute, writing a failed row each time. */
  let touched = 0;
  for (const enr of rows) {
    if (enr.status !== 'active' || !enr.nextSendAt) continue;
    if (new Date(enr.nextSendAt).getTime() > Date.now()) continue;
    const seq = sequences.find(s => s.id === enr.sequenceId);
    const contact = contacts.find(c => c.id === enr.contactId);
    const step = seq?.steps[enr.currentStep];
    if (!seq || !contact || !step) continue;
    /* Held, not skipped: currentStep does not move, so nobody loses a message
       to a cap — they get it tomorrow. */
    if (gate && !gate(contact, seq)) continue;

    const out = await sendToContact(contact, { subject: step.subject, body: step.body, sequenceId: seq.id });
    if (out.ok) sent++;
    touched++;
    enr.history.push({ step: enr.currentStep, at: new Date().toISOString(), action: 'sent' });
    enr.currentStep += 1;
    if (enr.currentStep >= enr.totalSteps) { enr.status = 'completed'; enr.nextSendAt = undefined; }
    else {
      const next = seq.steps[enr.currentStep];
      enr.nextSendAt = nextSendFor(next?.day ?? 1, next?.waitUnit ?? 'days');
    }
  }
  if (touched) saveEnrollments(rows);
  return sent;
}
