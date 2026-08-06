/**
 * contactLists.ts — saved segments over the contact database.
 *
 * A **smart list** is a saved set of rules that is re-evaluated every time you
 * look at it, so it stays current on its own. A **static list** is an explicit
 * set of contact ids you curate by hand. Both are stored per tenant through
 * the patched localStorage layer.
 *
 * Rules can reach past the contact record into derived data (health score,
 * lifecycle stage, open-deal value, email engagement), which is what makes a
 * segment like "warm leads with an open deal who have not been emailed" a
 * single saved list rather than a manual sweep.
 */

import type { Appointment, Contact, Pipeline } from '../types';
import {
  computeHealthScore, inferLifecycle, dealsForContact, appointmentsForContact,
  type LifecycleStage,
} from './contactIntelligence';
import { placedDealsForContact } from './contactDeals';
import { emailsForContact, emailStats } from './contactEmail';

const LISTS_KEY = 'crm_contact_lists';

export type RuleOp =
  | 'contains' | 'not_contains' | 'equals' | 'not_equals' | 'starts_with'
  | 'is_empty' | 'is_not_empty' | 'gt' | 'lt' | 'before_days' | 'within_days';

export interface ListRule {
  field: string;
  op: RuleOp;
  value: string;
}

export interface ContactList {
  id: string;
  name: string;
  type: 'smart' | 'static';
  /** smart lists only */
  rules: ListRule[];
  match: 'all' | 'any';
  /** static lists only */
  memberIds: string[];
  color: string;
  createdAt: string;
  createdBy: string;
}

/* ── Fields a rule can address ── */

export interface FieldDef {
  value: string;
  label: string;
  kind: 'text' | 'number' | 'date' | 'choice';
  choices?: string[];
  group: string;
}

export const LIST_FIELDS: FieldDef[] = [
  { value: 'name', label: 'Name', kind: 'text', group: 'Contact' },
  { value: 'email', label: 'Email', kind: 'text', group: 'Contact' },
  { value: 'phone', label: 'Phone', kind: 'text', group: 'Contact' },
  { value: 'company', label: 'Company', kind: 'text', group: 'Contact' },
  { value: 'jobTitle', label: 'Job title', kind: 'text', group: 'Contact' },
  { value: 'source', label: 'Source', kind: 'text', group: 'Contact' },
  { value: 'tags', label: 'Tags', kind: 'text', group: 'Contact' },
  { value: 'assignedTo', label: 'Owner', kind: 'text', group: 'Contact' },
  { value: 'status', label: 'Status', kind: 'choice', choices: ['lead', 'prospect', 'customer', 'churned'], group: 'Contact' },
  { value: 'value', label: 'Contact value', kind: 'number', group: 'Contact' },
  { value: 'lastActivityDays', label: 'Days since last activity', kind: 'number', group: 'Engagement' },
  { value: 'health', label: 'Health score', kind: 'number', group: 'Engagement' },
  { value: 'lifecycle', label: 'Lifecycle stage', kind: 'choice', choices: ['Subscriber', 'Lead', 'MQL', 'SQL', 'Opportunity', 'Customer', 'Evangelist'], group: 'Engagement' },
  { value: 'emailsSent', label: 'Emails sent', kind: 'number', group: 'Engagement' },
  { value: 'openRate', label: 'Email open rate %', kind: 'number', group: 'Engagement' },
  { value: 'openDeals', label: 'Open deals', kind: 'number', group: 'Pipeline' },
  { value: 'openDealValue', label: 'Open deal value', kind: 'number', group: 'Pipeline' },
  { value: 'wonDeals', label: 'Won deals', kind: 'number', group: 'Pipeline' },
  { value: 'upcomingMeetings', label: 'Upcoming meetings', kind: 'number', group: 'Pipeline' },
];

export const OPS_FOR: Record<FieldDef['kind'], { value: RuleOp; label: string }[]> = {
  text: [
    { value: 'contains', label: 'contains' }, { value: 'not_contains', label: 'does not contain' },
    { value: 'equals', label: 'is' }, { value: 'starts_with', label: 'starts with' },
    { value: 'is_empty', label: 'is empty' }, { value: 'is_not_empty', label: 'is not empty' },
  ],
  choice: [
    { value: 'equals', label: 'is' }, { value: 'not_equals', label: 'is not' },
  ],
  number: [
    { value: 'gt', label: 'is more than' }, { value: 'lt', label: 'is less than' },
    { value: 'equals', label: 'equals' },
  ],
  date: [
    { value: 'within_days', label: 'within the last (days)' }, { value: 'before_days', label: 'more than (days) ago' },
  ],
};

export const fieldDef = (name: string): FieldDef | undefined => LIST_FIELDS.find(f => f.value === name);

/* ── Derived values a rule may reference ── */

export interface ListContext {
  pipelines: Pipeline[];
  appointments: Appointment[];
}

const daysSince = (iso?: string): number => {
  if (!iso) return 99999;
  const t = new Date(iso).getTime();
  if (Number.isNaN(t)) return 99999;
  return Math.max(0, Math.floor((Date.now() - t) / 86_400_000));
};

/**
 * Everything a rule can be evaluated against, computed once per contact.
 * Building this eagerly keeps `matchesRules` a pure lookup, so evaluating a
 * list over a few thousand contacts stays cheap.
 */
export function deriveFacts(contact: Contact, ctx: ListContext): Record<string, unknown> {
  const deals = dealsForContact(contact, ctx.pipelines);
  const appts = appointmentsForContact(contact, ctx.appointments);
  const health = computeHealthScore(contact, deals, appts);
  const placed = placedDealsForContact(contact, ctx.pipelines);
  const open = placed.filter(d => (d.status ?? 'active') === 'active');
  const emails = emailsForContact(contact.id);
  const stats = emailStats(emails);

  return {
    name: contact.name,
    email: contact.email,
    phone: contact.phone,
    company: contact.company ?? '',
    jobTitle: contact.jobTitle ?? '',
    source: contact.source ?? '',
    tags: contact.tags ?? [],
    assignedTo: contact.assignedTo ?? '',
    status: contact.status,
    value: contact.value ?? 0,
    lastActivityDays: daysSince(contact.lastActivity),
    health: health.total,
    lifecycle: (contact.lifecycle ?? inferLifecycle(contact, deals)) as LifecycleStage,
    emailsSent: stats.sent,
    openRate: stats.openRate,
    openDeals: open.length,
    openDealValue: open.reduce((s, d) => s + (d.value ?? 0), 0),
    wonDeals: placed.filter(d => d.status === 'won').length,
    upcomingMeetings: appts.filter(a => a.status === 'scheduled').length,
  };
}

function testRule(facts: Record<string, unknown>, rule: ListRule): boolean {
  const raw = facts[rule.field];
  const def = fieldDef(rule.field);

  if (rule.op === 'is_empty') return raw === '' || raw == null || (Array.isArray(raw) && raw.length === 0);
  if (rule.op === 'is_not_empty') return !(raw === '' || raw == null || (Array.isArray(raw) && raw.length === 0));

  if (def?.kind === 'number') {
    const n = Number(raw);
    const target = Number(rule.value);
    if (!Number.isFinite(target)) return true;   // an unfinished rule must not exclude everyone
    if (rule.op === 'gt') return n > target;
    if (rule.op === 'lt') return n < target;
    if (rule.op === 'equals') return n === target;
    return true;
  }

  const hay = Array.isArray(raw) ? raw.join(',').toLowerCase() : String(raw ?? '').toLowerCase();
  const needle = rule.value.trim().toLowerCase();
  if (!needle) return true;

  switch (rule.op) {
    case 'contains': return hay.includes(needle);
    case 'not_contains': return !hay.includes(needle);
    case 'equals': return Array.isArray(raw) ? raw.some(v => String(v).toLowerCase() === needle) : hay === needle;
    case 'not_equals': return Array.isArray(raw) ? !raw.some(v => String(v).toLowerCase() === needle) : hay !== needle;
    case 'starts_with': return hay.startsWith(needle);
    default: return true;
  }
}

export function matchesRules(facts: Record<string, unknown>, rules: ListRule[], match: 'all' | 'any'): boolean {
  const real = rules.filter(r => r.field);
  if (!real.length) return true;
  return match === 'all' ? real.every(r => testRule(facts, r)) : real.some(r => testRule(facts, r));
}

/** Members of a list right now: rules re-run for smart lists, ids for static. */
export function listMembers(list: ContactList, contacts: Contact[], ctx: ListContext): Contact[] {
  if (list.type === 'static') {
    const ids = new Set(list.memberIds);
    return contacts.filter(c => ids.has(c.id));
  }
  return contacts.filter(c => matchesRules(deriveFacts(c, ctx), list.rules, list.match));
}

/** A short sentence describing what a smart list selects. */
export function describeList(list: ContactList): string {
  if (list.type === 'static') return `${list.memberIds.length} hand-picked contact${list.memberIds.length === 1 ? '' : 's'}`;
  const real = list.rules.filter(r => r.field);
  if (!real.length) return 'Everyone';
  const parts = real.map(r => {
    const def = fieldDef(r.field);
    const op = (OPS_FOR[def?.kind ?? 'text'].find(o => o.value === r.op)?.label) ?? r.op;
    const needsValue = r.op !== 'is_empty' && r.op !== 'is_not_empty';
    return `${def?.label ?? r.field} ${op}${needsValue ? ` ${r.value}` : ''}`.trim();
  });
  return parts.join(list.match === 'all' ? ' and ' : ' or ');
}

/* ── Storage ── */

export function loadLists(): ContactList[] {
  try {
    const raw = JSON.parse(localStorage.getItem(LISTS_KEY) || '[]');
    return Array.isArray(raw) ? raw : [];
  } catch { return []; }
}

export function saveLists(lists: ContactList[]) {
  try { localStorage.setItem(LISTS_KEY, JSON.stringify(lists)); } catch { /* storage full or blocked */ }
}

const COLORS = ['#6366f1', '#f59e0b', '#22c55e', '#ec4899', '#0ea5e9', '#8b5cf6', '#ef4444', '#14b8a6'];

export function createList(input: {
  name: string; type: 'smart' | 'static'; rules?: ListRule[]; match?: 'all' | 'any';
  memberIds?: string[]; createdBy: string;
}): ContactList {
  const lists = loadLists();
  const list: ContactList = {
    id: `list-${Date.now()}-${Math.floor(performance.now() * 1000) % 100000}`,
    name: input.name.trim() || 'Untitled list',
    type: input.type,
    rules: input.rules ?? [],
    match: input.match ?? 'all',
    memberIds: input.memberIds ?? [],
    color: COLORS[lists.length % COLORS.length],
    createdAt: new Date().toISOString(),
    createdBy: input.createdBy,
  };
  saveLists([...lists, list]);
  return list;
}

export function updateList(id: string, updates: Partial<ContactList>): ContactList[] {
  const next = loadLists().map(l => (l.id === id ? { ...l, ...updates, id: l.id } : l));
  saveLists(next);
  return next;
}

export function deleteList(id: string): ContactList[] {
  const next = loadLists().filter(l => l.id !== id);
  saveLists(next);
  return next;
}

/** Add contacts to a static list, ignoring ones already in it. */
export function addToStaticList(id: string, contactIds: string[]): { added: number; lists: ContactList[] } {
  const lists = loadLists();
  const list = lists.find(l => l.id === id);
  if (!list || list.type !== 'static') return { added: 0, lists };
  const existing = new Set(list.memberIds);
  const fresh = contactIds.filter(cid => !existing.has(cid));
  if (!fresh.length) return { added: 0, lists };
  const next = lists.map(l => (l.id === id ? { ...l, memberIds: [...l.memberIds, ...fresh] } : l));
  saveLists(next);
  return { added: fresh.length, lists: next };
}

export function removeFromStaticList(id: string, contactIds: string[]): ContactList[] {
  const drop = new Set(contactIds);
  const next = loadLists().map(l =>
    l.id === id && l.type === 'static' ? { ...l, memberIds: l.memberIds.filter(cid => !drop.has(cid)) } : l);
  saveLists(next);
  return next;
}

/** Drop a deleted contact from every static list so lists never dangle. */
export function purgeContactFromLists(contactId: string): ContactList[] {
  const next = loadLists().map(l =>
    l.type === 'static' ? { ...l, memberIds: l.memberIds.filter(id => id !== contactId) } : l);
  saveLists(next);
  return next;
}

/* ── Starter segments ── */

export const STARTER_LISTS: { name: string; rules: ListRule[]; match: 'all' | 'any' }[] = [
  { name: 'Hot leads', match: 'all', rules: [{ field: 'health', op: 'gt', value: '65' }, { field: 'openDeals', op: 'gt', value: '0' }] },
  { name: 'Going cold', match: 'all', rules: [{ field: 'lastActivityDays', op: 'gt', value: '30' }, { field: 'health', op: 'lt', value: '40' }] },
  { name: 'Never emailed', match: 'all', rules: [{ field: 'emailsSent', op: 'lt', value: '1' }, { field: 'email', op: 'is_not_empty', value: '' }] },
  { name: 'Customers', match: 'all', rules: [{ field: 'lifecycle', op: 'equals', value: 'Customer' }] },
  { name: 'No phone on file', match: 'all', rules: [{ field: 'phone', op: 'is_empty', value: '' }] },
];
