/**
 * mailboxService — multi-mailbox inbox for the Conversations module.
 *
 * Each mailbox is bound to ONE company profile: its own identity, knowledge
 * base, signature, tone and auto-reply rules. Incoming email is fetched live
 * over IMAP (via public/api/imap-fetch.php); when the endpoint is unreachable
 * a realistic demo inbox is returned so the UI is always usable.
 */

import { sessionToken } from './auth';
import { API_BASE } from './apiBase';


/* ─── Types ─── */
export interface CompanyProfile {
  companyName: string;
  industry: string;
  description: string;      // what the company does
  products: string;         // products / services offered
  tone: 'friendly' | 'professional' | 'formal' | 'casual' | 'enthusiastic';
  signature: string;        // sign-off appended to replies
  knowledge: string;        // FAQ / policies / key facts the AI can cite
  businessHours: string;    // e.g. "Mon–Fri 9am–6pm ET"
  website: string;
}

export interface AutoReplyRule {
  id: string;
  name: string;
  enabled: boolean;
  match: {
    type: 'first_contact' | 'keyword' | 'out_of_hours' | 'always' | 'negative_sentiment';
    keywords?: string[];    // for keyword match
  };
  mode: 'auto_send' | 'draft';   // send immediately, or draft for human approval
  instruction: string;      // extra guidance handed to the AI for this rule
  runs: number;
}

export interface Mailbox {
  id: string;
  label: string;            // display name, e.g. "Support — Acme"
  color: string;
  address: string;          // the email address this mailbox owns
  // IMAP (incoming)
  imapHost: string;
  imapPort: number;
  imapEncryption: 'ssl' | 'tls' | 'none';
  imapUser: string;
  imapPassword: string;
  // SMTP (outgoing) — reuses the same server unless overridden
  smtpHost: string;
  smtpPort: number;
  smtpEncryption: 'ssl' | 'tls' | 'none';
  smtpUser: string;
  smtpPassword: string;
  fromName: string;
  profile: CompanyProfile;
  autoReplyRules: AutoReplyRule[];
  connected: boolean;       // last fetch succeeded
  createdAt: string;
}

export interface InboxMessage {
  uid: number;
  mailboxId: string;
  from: string;
  fromName: string;
  to: string;
  subject: string;
  date: string;             // ISO
  seen: boolean;
  snippet: string;
  bodyType: 'HTML' | 'PLAIN';
  body: string;
  // client-side enrichment
  sentiment?: 'positive' | 'neutral' | 'negative';
  priority?: 'low' | 'normal' | 'high' | 'urgent';
  tags?: string[];
  assignedTo?: string;
  status?: 'open' | 'pending' | 'closed';
  autoRepliedAt?: string;
}

/* ─── Storage ─── */
const MB_KEY = 'crm_mailboxes';
const MSG_KEY = 'crm_inbox_messages';         // enrichment/state keyed by mailbox:uid
const AR_LOG_KEY = 'crm_autoreply_log';

export function loadMailboxes(): Mailbox[] {
  try { return JSON.parse(localStorage.getItem(MB_KEY) || '[]'); } catch { return []; }
}
export function saveMailboxes(list: Mailbox[]) {
  try { localStorage.setItem(MB_KEY, JSON.stringify(list)); } catch { /* ignore */ }
}

interface MsgState { sentiment?: InboxMessage['sentiment']; priority?: InboxMessage['priority']; tags?: string[]; assignedTo?: string; status?: InboxMessage['status']; autoRepliedAt?: string; }
function loadMsgState(): Record<string, MsgState> {
  try { return JSON.parse(localStorage.getItem(MSG_KEY) || '{}'); } catch { return {}; }
}
function saveMsgState(map: Record<string, MsgState>) {
  try { localStorage.setItem(MSG_KEY, JSON.stringify(map)); } catch { /* ignore */ }
}
export function updateMessageState(mailboxId: string, uid: number, patch: MsgState) {
  const map = loadMsgState();
  const key = `${mailboxId}:${uid}`;
  map[key] = { ...map[key], ...patch };
  saveMsgState(map);
}

export interface AutoReplyLogEntry {
  id: string;
  mailboxLabel: string;
  ruleName: string;
  to: string;
  subject: string;
  mode: 'auto_send' | 'draft';
  at: string;
}
export function loadAutoReplyLog(): AutoReplyLogEntry[] {
  try { return JSON.parse(localStorage.getItem(AR_LOG_KEY) || '[]'); } catch { return []; }
}
export function appendAutoReplyLog(e: AutoReplyLogEntry) {
  const log = [e, ...loadAutoReplyLog()].slice(0, 100);
  try { localStorage.setItem(AR_LOG_KEY, JSON.stringify(log)); } catch { /* ignore */ }
}

/* ─── Defaults ─── */
export function blankProfile(): CompanyProfile {
  return {
    companyName: '', industry: '', description: '', products: '',
    tone: 'professional', signature: '', knowledge: '', businessHours: 'Mon–Fri, 9am–6pm', website: '',
  };
}

export function blankMailbox(): Mailbox {
  return {
    id: `mb-${Date.now()}`, label: '', color: '#3e63dd', address: '',
    imapHost: '', imapPort: 993, imapEncryption: 'ssl', imapUser: '', imapPassword: '',
    smtpHost: '', smtpPort: 587, smtpEncryption: 'tls', smtpUser: '', smtpPassword: '', fromName: '',
    profile: blankProfile(),
    autoReplyRules: [],
    connected: false, createdAt: new Date().toISOString(),
  };
}

/* ─── Sentiment / priority heuristics (instant, offline) ─── */
const NEG = ['angry', 'terrible', 'awful', 'refund', 'cancel', 'complaint', 'broken', 'worst', 'disappointed', 'unacceptable', 'frustrated', 'never', 'scam', 'urgent', 'asap', 'immediately', 'lawyer', 'legal'];
const POS = ['thanks', 'thank you', 'great', 'love', 'awesome', 'excellent', 'appreciate', 'perfect', 'happy', 'wonderful'];
const URGENT = ['urgent', 'asap', 'immediately', 'emergency', 'critical', 'right now', 'today'];

export function classify(text: string): { sentiment: InboxMessage['sentiment']; priority: InboxMessage['priority'] } {
  const t = text.toLowerCase();
  const neg = NEG.filter(w => t.includes(w)).length;
  const pos = POS.filter(w => t.includes(w)).length;
  const sentiment: InboxMessage['sentiment'] = neg > pos ? 'negative' : pos > neg ? 'positive' : 'neutral';
  const urgent = URGENT.some(w => t.includes(w));
  const priority: InboxMessage['priority'] = urgent ? 'urgent' : neg >= 2 ? 'high' : sentiment === 'negative' ? 'high' : 'normal';
  return { sentiment, priority };
}

/* ─── Live fetch ─── */
export async function fetchInbox(mb: Mailbox, limit = 20): Promise<{ ok: boolean; messages: InboxMessage[]; error?: string; demo?: boolean }> {
  const state = loadMsgState();
  const enrich = (m: Omit<InboxMessage, 'mailboxId'>): InboxMessage => {
    const cls = classify(`${m.subject} ${m.snippet}`);
    const saved = state[`${mb.id}:${m.uid}`] ?? {};
    return {
      ...m, mailboxId: mb.id,
      sentiment: saved.sentiment ?? cls.sentiment,
      priority: saved.priority ?? cls.priority,
      tags: saved.tags ?? [],
      assignedTo: saved.assignedTo,
      status: saved.status ?? 'open',
      autoRepliedAt: saved.autoRepliedAt,
    };
  };

  if (!mb.imapHost || !mb.imapUser) {
    return { ok: true, demo: true, messages: demoInbox(mb).map(enrich) };
  }

  try {
    const resp = await fetch(`${API_BASE}/api/imap-fetch.php`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        token: sessionToken(),
        host: mb.imapHost, port: mb.imapPort, encryption: mb.imapEncryption,
        username: mb.imapUser, password: mb.imapPassword, folder: 'INBOX', limit,
      }),
    });
    const data = await resp.json() as { success: boolean; messages?: Omit<InboxMessage, 'mailboxId'>[]; error?: string };
    if (!data.success) return { ok: false, error: data.error || 'Fetch failed', messages: [] };
    return { ok: true, messages: (data.messages ?? []).map(enrich) };
  } catch {
    // Endpoint unreachable (e.g. running the static build without the PHP host) → demo
    return { ok: true, demo: true, messages: demoInbox(mb).map(enrich), error: 'IMAP endpoint unreachable — showing demo inbox.' };
  }
}

/* ─── Auto-reply rule matching ─── */
function withinBusinessHours(): boolean {
  const now = new Date();
  const day = now.getDay();       // 0 Sun … 6 Sat
  const hour = now.getHours();
  return day >= 1 && day <= 5 && hour >= 9 && hour < 18;
}

/** Returns the first enabled rule that matches this message, or null. */
export function matchAutoReplyRule(mb: Mailbox, msg: InboxMessage, isFirstContact: boolean): AutoReplyRule | null {
  const text = `${msg.subject} ${msg.body}`.toLowerCase();
  for (const rule of mb.autoReplyRules) {
    if (!rule.enabled) continue;
    const m = rule.match;
    if (m.type === 'always') return rule;
    if (m.type === 'first_contact' && isFirstContact) return rule;
    if (m.type === 'out_of_hours' && !withinBusinessHours()) return rule;
    if (m.type === 'negative_sentiment' && msg.sentiment === 'negative') return rule;
    if (m.type === 'keyword' && (m.keywords ?? []).some(k => k.trim() && text.includes(k.trim().toLowerCase()))) return rule;
  }
  return null;
}

export function blankRule(): AutoReplyRule {
  return {
    id: `ar-${Date.now()}`, name: '', enabled: true,
    match: { type: 'first_contact', keywords: [] },
    mode: 'draft', instruction: '', runs: 0,
  };
}

/* ─── Demo inbox (realistic, so the UI works without a live server) ─── */
function demoInbox(mb: Mailbox): Omit<InboxMessage, 'mailboxId'>[] {
  const co = mb.profile.companyName || 'your company';
  const now = Date.now();
  const raw: [string, string, string, string, number][] = [
    ['Emily Chen', 'emily.chen@example.com', `Question about ${mb.profile.products || 'your pricing'}`, `Hi, I'm evaluating ${co} for my team and wanted to understand your pricing tiers and whether there's an annual discount. Could you share details?`, 6],
    ['Robert Martinez', 'r.martinez@acme.io', 'URGENT: cannot access my account', `This is really frustrating — I've been locked out of my account since this morning and I have a deadline today. I need this fixed ASAP or I'll have to cancel.`, 32],
    ['Sarah Johnson', 'sarah.j@brightmail.com', 'Thank you for the quick help!', `Just wanted to say thanks — your team resolved my issue in minutes. Really appreciate the great support. Will definitely recommend ${co}.`, 95],
    ['James Carter', 'james@carterco.com', 'Requesting a demo', `Hello, we're a 40-person company looking for a solution like yours. Could we schedule a demo sometime next week? Tuesday or Wednesday afternoon works best.`, 180],
    ['Lisa Wong', 'lisa.wong@example.org', 'Invoice / billing question', `Hi, I noticed I was charged twice on my last invoice. Can you look into this and issue a refund for the duplicate charge? Order #48213.`, 320],
    ['Tom Becker', 'tom.becker@startup.dev', 'Integration with our tools', `Do you integrate with Slack and Zapier? We'd need that before switching over. Also curious about your API rate limits.`, 640],
  ];
  return raw.map((r, i) => ({
    uid: 900000 + i,
    from: r[1], fromName: r[0], to: mb.address || mb.imapUser,
    subject: r[2], date: new Date(now - r[4] * 60000).toISOString(),
    seen: i > 2, snippet: r[3].slice(0, 150), bodyType: 'PLAIN' as const, body: r[3],
  }));
}
