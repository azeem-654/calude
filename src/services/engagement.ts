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
import { routeLeads, type ArrivingLead } from './leadRouting';

export interface EngageCounts {
  openConversations: number; waitingOnHuman: number; openTickets: number;
  newSubmissions: number; people: number; liveAgents: number;
  liveWidgets: number; liveForms: number; liveWaiting?: number;
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
  booking_slug?: string; in_app?: number;
}

/** One request to share a screen, as the business side sees it. */
export interface LiveSession {
  id: string; name: string; email: string; topic: string; pageUrl: string;
  /* Proved by a session on this install's own origin; blank on anybody's
     website, where name and email are only what was typed. */
  verifiedEmail: string; verifiedAccount: string;
  status: 'waiting' | 'live' | 'ended'; endedReason: string; sharerState: string;
  agentEmail: string; agentName: string; meetUrl: string; ready: number;
  createdAt: string; joinedAt: string | null; endedAt: string | null;
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

/* Live help. The picture goes browser to browser; these carry the handshake
   and the state. See worker/src/lib/liveHelp.ts. */
export const liveSessions = () => call('live_sessions');
export const liveWaiting = () => call('live_waiting');
export const liveSession = (id: string) => call('live_session', { id });
export const liveAnswer = (id: string, sdp: string) => call('live_answer', { id, sdp });
export const liveEnd = (id: string) => call('live_end', { id });
export const liveMeet = (id: string) => call('live_meet', { id });

/**
 * Who was sent what, and what happened.
 *
 * The filters are optional and independent: the same rows answer "what did this
 * campaign send" and "what has this address ever been sent", which are the two
 * ways anybody ever comes at a delivery log.
 */
export const deliveryLog = (filter: { sourceId?: string; recipient?: string; status?: string } = {}) =>
  call('delivery_log', { id: filter.sourceId ?? '', assignedTo: filter.recipient ?? '', status: filter.status ?? '' });

/* One pair per record type, so adding a knowledge article and adding a widget
   are the same two calls rather than eight endpoints to remember. */
type Kind = 'form' | 'agent' | 'article' | 'widget' | 'voice_agent';
export const listOf = (kind: Kind) => call(`list_${kind}`);
export const saveOf = (kind: Kind, record: Record<string, unknown>) => call(`save_${kind}`, { record });
export const deleteOf = (kind: Kind, id: string) => call(`delete_${kind}`, { id });

export const listVoiceSessions = () => call('voice_sessions');
export const voiceStatus = () => call('voice_status');
export const setSubmission = (id: string, status: string) => call('set_submission', { id, status });

/* Calendar lives on its own endpoint: its OAuth redirect answers a browser with
   a page, which is a different contract from the JSON everything else speaks. */
async function cal(action: string, extra: Record<string, unknown> = {}): Promise<Reply> {
  const accountId = getActiveAccountId();
  if (!accountId) return { success: false, error: 'No workspace is active yet.' };
  try {
    const r = await fetch(`${API_BASE}/api/calendar.php`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ token: getSession()?.token, accountId, action, ...extra }),
    });
    return await r.json() as Reply;
  } catch (e) {
    return { success: false, error: `Could not reach the server: ${e instanceof Error ? e.message : String(e)}` };
  }
}

export const calendarStatus = () => cal('status');
export const calendarConnect = () => cal('connect');
export const calendarDisconnect = (ownerEmail: string) => cal('disconnect', { ownerEmail });
export const createMeeting = (bookingId: string) => cal('create_meeting', { bookingId });

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
export async function mergeCaptured(): Promise<{ added: number; matched: number; deals?: number; enrolled?: number; problems?: string[]; error?: string }> {
  const res = await call('unmerged_people');
  if (!res.success) return { added: 0, matched: 0, error: res.error ?? 'Could not read new captures.' };

  const people = (res.people ?? []) as CapturedPerson[];
  if (!people.length) return { added: 0, matched: 0 };

  let existing: Record<string, unknown>[];
  try { existing = JSON.parse(window.localStorage.getItem('crm_contacts') || '[]') as Record<string, unknown>[]; }
  catch { existing = []; }

  const byEmail = new Map<string, Record<string, unknown>>();
  for (const c of existing) {
    const e = String(c.email ?? '').toLowerCase().trim();
    if (e) byEmail.set(e, c);
  }

  const pairs: { id: string; crmId: string }[] = [];
  const arrived: ArrivingLead[] = [];
  let added = 0;
  let matched = 0;

  for (const p of people) {
    const email = (p.email || '').toLowerCase().trim();
    const hit = email ? byEmail.get(email) : undefined;
    if (hit) {
      /* Already a contact. Recorded as merged so it is not offered again, and
         not edited: the CRM copy is the one somebody has been maintaining. */
      pairs.push({ id: p.id, crmId: String(hit.id ?? '') });
      /* Routed as well as added ones. Somebody already in the CRM who has just
         filled in a form has just enquired, and a returning customer's enquiry
         is not less of a lead than a stranger's. `routeLeads` refuses to make a
         second deal for a contact that already has one, so a regular who
         enquires every month does not accumulate a column of duplicates. */
      arrived.push({
        id: String(hit.id ?? ''), name: String(hit.name ?? '') || email, email,
        phone: String(hit.phone ?? ''), channel: p.source || 'capture',
      });
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
      /* The fields every contact screen reads without checking. Leaving them
         out made the first capture a workspace pulled in crash the dashboard
         ("reading 'length'" of the missing tags) for good. */
      tags: [],
      value: 0,
      lastActivity: p.createdAt || new Date().toISOString(),
      /* Stamped with where it came from, the same way every generated record in
         this app is, so a list full of captures can still be traced back. */
      source: `engagement:${p.source || 'capture'}`,
      createdAt: p.createdAt || new Date().toISOString(),
    });
    pairs.push({ id: p.id, crmId: id });
    byEmail.set(email, existing[0]);
    arrived.push({ id, name: p.name || email, email, phone: p.phone || '', channel: p.source || 'capture' });
    added += 1;
  }

  let routed = { deals: 0, enrolled: 0, problems: [] as string[] };
  if (added) {
    /* Written through the ordinary tenant-scoped setter, so the debounced push
       carries it to D1 exactly like any other edit. Writing the raw key would
       skip the prefix and land in the wrong workspace. */
    window.localStorage.setItem('crm_contacts', JSON.stringify(existing));
  }
  /* A contact in a list is not a lead being worked. Routing is idempotent by
     contact id, so it runs on every pass over the unmerged batch rather than
     only when a contact was newly created — a capture whose contact already
     existed still has to reach the board. */
  routed = routeLeads(arrived);
  await call('mark_merged', { record: { pairs } });
  return { added, matched, deals: routed.deals, enrolled: routed.enrolled, problems: routed.problems };
}

/* ── Automations ────────────────────────────────────────────────────────── */

export interface AutomationRun {
  id: string; automationId: string; automationName: string;
  contactId: string; contactName: string; contactEmail: string;
  nodeId: string; dueAt: string; status: string; detail: string;
  triggerKind: string; triggerRef: string; stepsTaken: number;
  createdAt: string; updatedAt: string;
}

export interface AutomationLogEntry {
  id: string; nodeId: string; nodeType: string; status: string; detail: string; createdAt: string;
}

/**
 * Tell the engine something happened in the app.
 *
 * Tags, deals and field changes happen in the browser, on records the browser
 * owns, so the Worker never sees them. Without this the builder offered "when a
 * tag is added" and nothing could ever fire it — a trigger that looks like a
 * feature and is not, which is the whole class of bug the engine was written to
 * end.
 *
 * Deliberately fire-and-forget: it returns how many automations it started, and
 * callers ignore it. Adding a tag must not fail because a graph is broken.
 */
export const fireEvent = (e: {
  kind: string; ref?: string; contactId: string;
  contactName?: string; contactEmail?: string; contactPhone?: string;
}) => call('enrol_event', { record: e });

/** Everyone currently inside an automation, or inside one particular one. */
export const automationRuns = (automationId?: string) =>
  call('automation_runs', automationId ? { automationId } : {});

/** Every node one person passed through, and what each one did. */
export const automationLog = (runId: string) => call('automation_log', { runId });

/**
 * Apply what the engine wants changed on a contact.
 *
 * ── Why the server does not simply do this ──
 *
 * `crm_contacts` is the browser's document: the app writes it to localStorage
 * and `serverData` pushes it up. A Worker writing the same key would be
 * overwritten by the next browser that syncs, so a tag added by an automation
 * at 3am would vanish the moment its owner opened the app — silently, and only
 * on the records the automation had touched.
 *
 * So the engine records what it wants and this applies it. The same one-way
 * route `mergeCaptured` takes, for the same reason.
 *
 * Idempotent from both ends: a change is only ever marked applied once, and
 * adding a tag that is already there changes nothing.
 */
export async function applyContactChanges(): Promise<{ applied: number; error?: string }> {
  const res = await call('pending_contact_changes');
  if (!res.success) return { applied: 0, error: res.error ?? 'Could not read pending changes.' };

  const changes = (res.changes ?? []) as {
    id: string; contactId: string; kind: string; field: string; value: string;
  }[];
  if (!changes.length) return { applied: 0 };

  let contacts: Record<string, unknown>[];
  try { contacts = JSON.parse(window.localStorage.getItem('crm_contacts') || '[]') as Record<string, unknown>[]; }
  catch { return { applied: 0, error: 'The contact list could not be read.' }; }

  const byId = new Map(contacts.map(c => [String(c.id ?? ''), c]));
  const done: string[] = [];
  let touched = false;

  for (const ch of changes) {
    const c = byId.get(ch.contactId);
    /* A change for a contact this browser has not got is *not* marked applied.
       It is almost always a capture that has not been merged yet, and the next
       pass — after the merge — will find it. Marking it done here would throw
       the tag away for good. */
    if (!c) continue;

    if (ch.kind === 'add_tag') {
      const tags = Array.isArray(c.tags) ? (c.tags as string[]).map(String) : [];
      if (!tags.some(t => t.toLowerCase() === ch.value.toLowerCase())) {
        c.tags = [...tags, ch.value];
        touched = true;
      }
    } else if (ch.kind === 'remove_tag') {
      const tags = Array.isArray(c.tags) ? (c.tags as string[]).map(String) : [];
      const next = tags.filter(t => t.toLowerCase() !== ch.value.toLowerCase());
      if (next.length !== tags.length) { c.tags = next; touched = true; }
    } else if (ch.kind === 'assign') {
      c.assignedTo = ch.value;
      touched = true;
    } else if (ch.kind === 'set_field') {
      /* Only fields the app already understands, plus custom ones, and never
         the id — a change that could rewrite `id` would silently detach a
         contact from its deals, its emails and its own history. */
      const field = ch.field.trim();
      if (field && field !== 'id') { c[field] = ch.value; touched = true; }
    }
    done.push(ch.id);
  }

  if (touched) window.localStorage.setItem('crm_contacts', JSON.stringify(contacts));
  if (done.length) await call('mark_changes_applied', { record: { ids: done } });
  return { applied: done.length };
}

/** The snippet somebody pastes into their website. */
export const embedSnippet = (publicKey: string): string =>
  `<script src="${window.location.origin}/widget.js" data-pc-widget="${publicKey}" async></script>`;
