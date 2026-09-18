/**
 * The Customer Engagement module, from the browser.
 *
 * ── The merge, which is the whole reason this file is careful ──
 *
 * Contacts in this app live in `crm_contacts`, a localStorage list the browser
 * owns and pushes to D1 on a debounce. Everything captured by a public channel
 * — a form on somebody else's website, a chat widget, a voice call — is written
 * server-side instead, because there is no browser there to write it.
 *
 * Those two facts cannot be reconciled by having the server write the list: the
 * next push from an owner with the app open would overwrite it, and a lead
 * captured overnight would disappear in the morning with nothing in any log.
 *
 * So the flow is one-way. The server captures; `mergeCaptured()` pulls anything
 * not yet merged, adds it to the local list the ordinary way, and tells the
 * server which CRM id it used. Nothing on the server ever writes the blob, and
 * a capture can only be merged once.
 */
import { API_BASE } from './apiBase';
import { getSession } from './auth';
import { getActiveAccountId } from './tenancy';

export interface EngageCounts {
  openConversations: number; waitingOnHuman: number; openTickets: number;
  newSubmissions: number; people: number; liveAgents: number;
  liveWidgets: number; liveForms: number;
}

export interface Conversation {
  id: string; channel: string; status: string; handledBy: string; assignedTo: string;
  subject: string; intent: string; aiSummary: string; pageUrl: string;
  lastAt: string; createdAt: string;
  personName: string | null; personEmail: string | null; personId: string | null;
}

export interface ConversationMessage {
  id: string; role: string; author: string; body: string;
  sources: string; internal: number; createdAt: string;
}

export interface Ticket {
  id: string; reference: string; subject: string; status: string; priority: string;
  category: string; assignedTo: string; source: string; createdAt: string; updatedAt: string;
  personName: string | null; personEmail: string | null;
}

export interface FormField {
  key: string; label: string; type: string; required?: boolean;
  options?: string[]; placeholder?: string;
}

export interface EngageForm {
  id: string; name: string; slug: string; headline: string; blurb: string;
  fields: string; status: string; success_message: string; consent_text: string;
  notify_emails: string; create_person: number;
}

export interface Agent {
  id: string; name: string; purpose: string; personality: string; greeting: string;
  instructions: string; business_info: string; tools: string; status: string;
  hours_from: string; hours_to: string; hours_days: string; timezone: string;
  fallback: string; escalation: string;
}

export interface Article {
  id: string; title: string; body: string; kind: string; tags: string; status: string;
}

export interface Widget {
  id: string; name: string; agent_id: string; public_key: string; allowed_hosts: string;
  title: string; subtitle: string; welcome: string; launcher: string; accent: string;
  position: string; features: string; status: string; show_branding: number;
}

export interface CapturedPerson {
  id: string; email: string; phone: string; name: string; company: string;
  source: string; context: string; createdAt: string;
}

interface Reply { success?: boolean; error?: string; message?: string; [k: string]: unknown }

async function call(action: string, extra: Record<string, unknown> = {}): Promise<Reply> {
  const accountId = getActiveAccountId();
  if (!accountId) return { success: false, error: 'No workspace is active yet.' };
  try {
    const r = await fetch(`${API_BASE}/api/engagement.php`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ token: getSession()?.token, accountId, action, ...extra }),
    });
    return await r.json() as Reply;
  } catch (e) {
    return { success: false, error: `Could not reach the server: ${e instanceof Error ? e.message : String(e)}` };
  }
}

export const overview = () => call('overview');
export const listConversations = () => call('conversations');
export const getConversation = (conversationId: string) => call('conversation', { conversationId });
export const replyToConversation = (conversationId: string, message: string, internal = false) =>
  call('reply', { conversationId, message, internal });
export const setConversation = (conversationId: string, status: string, assignedTo = '') =>
  call('set_conversation', { conversationId, status, assignedTo });
export const resumeAi = (conversationId: string) => call('resume_ai', { conversationId });

export const listTickets = () => call('tickets');
export const getTicket = (id: string) => call('ticket', { id });
export const replyToTicket = (id: string, message: string, internal = false) =>
  call('ticket_reply', { id, message, internal });
export const setTicket = (id: string, patch: Record<string, unknown>) => call('set_ticket', { id, ...patch });
export const createTicket = (patch: Record<string, unknown>) => call('create_ticket', patch);

export const listSubmissions = () => call('submissions');

/* One pair per record type, so adding a knowledge article and adding a widget
   are the same two calls rather than eight endpoints to remember. */
type Kind = 'form' | 'agent' | 'article' | 'widget' | 'voice_agent';
export const listOf = (kind: Kind) => call(`list_${kind}`);
export const saveOf = (kind: Kind, record: Record<string, unknown>) => call(`save_${kind}`, { record });
export const deleteOf = (kind: Kind, id: string) => call(`delete_${kind}`, { id });

export const getSettings = () => call('settings');
export const saveSettings = (record: Record<string, unknown>) => call('save_settings', { record });

/**
 * Bring public captures into the CRM.
 *
 * Runs on the browser, which is the only writer of `crm_contacts`. Deliberately
 * additive: an existing contact with the same address is matched and left
 * alone rather than overwritten, because the version in the CRM has been edited
 * by a person and the capture has not.
 *
 * Returns how many were added so a screen can say so. Safe to call repeatedly —
 * `mark_merged` only ever fills a blank, so a second run of the same batch
 * changes nothing.
 */
export async function mergeCaptured(): Promise<{ added: number; matched: number; error?: string }> {
  const res = await call('unmerged_people');
  if (!res.success) return { added: 0, matched: 0, error: res.error ?? 'Could not read new captures.' };

  const people = (res.people ?? []) as CapturedPerson[];
  if (!people.length) return { added: 0, matched: 0 };

  let existing: Record<string, unknown>[] = [];
  try { existing = JSON.parse(window.localStorage.getItem('crm_contacts') || '[]') as Record<string, unknown>[]; }
  catch { existing = []; }

  const byEmail = new Map<string, Record<string, unknown>>();
  for (const c of existing) {
    const e = String(c.email ?? '').toLowerCase().trim();
    if (e) byEmail.set(e, c);
  }

  const pairs: { id: string; crmId: string }[] = [];
  let added = 0;
  let matched = 0;

  for (const p of people) {
    const email = (p.email || '').toLowerCase().trim();
    const hit = email ? byEmail.get(email) : undefined;
    if (hit) {
      /* Already a contact. Recorded as merged so it is not offered again, and
         not edited: the CRM copy is the one somebody has been maintaining. */
      pairs.push({ id: p.id, crmId: String(hit.id ?? '') });
      matched += 1;
      continue;
    }
    const id = `c-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
    existing.unshift({
      id,
      name: p.name || email || 'New enquiry',
      email,
      phone: p.phone || '',
      company: p.company || '',
      status: 'lead',
      /* Stamped with where it came from, the same way every generated record in
         this app is, so a list full of captures can still be traced back. */
      source: `engagement:${p.source || 'capture'}`,
      createdAt: p.createdAt || new Date().toISOString(),
    });
    pairs.push({ id: p.id, crmId: id });
    byEmail.set(email, existing[0]);
    added += 1;
  }

  if (added) {
    /* Written through the ordinary tenant-scoped setter, so the debounced push
       carries it to D1 exactly like any other edit. Writing the raw key would
       skip the prefix and land in the wrong workspace. */
    window.localStorage.setItem('crm_contacts', JSON.stringify(existing));
  }
  await call('mark_merged', { record: { pairs } });
  return { added, matched };
}

/** The snippet somebody pastes into their website. */
export const embedSnippet = (publicKey: string): string =>
  `<script src="${window.location.origin}/widget.js" data-pc-widget="${publicKey}" async></script>`;
