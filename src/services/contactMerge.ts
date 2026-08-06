/**
 * contactMerge.ts — finding and merging duplicate contacts.
 *
 * Merging is the dangerous operation in a CRM: done naively it silently
 * orphans deals, appointments and email history that pointed at the record
 * being removed. Everything here is written so nothing is lost — the merge
 * returns the cross-module re-pointing the caller must apply, and the caller
 * only deletes the duplicate after that has been written.
 */

import type { Appointment, Contact, Pipeline } from '../types';
import { loadLists, saveLists } from './contactLists';

/* ── Normalisation ── */

const normEmail = (s?: string) => (s || '').trim().toLowerCase();
/** Digits only, last 10 kept, so "+1 (555) 010-1234" and "555-010-1234" match. */
const normPhone = (s?: string) => {
  const d = (s || '').replace(/\D/g, '');
  return d.length >= 7 ? d.slice(-10) : '';
};
const normName = (s?: string) => (s || '').trim().toLowerCase().replace(/[^a-z\s]/g, '').replace(/\s+/g, ' ');
const normCompany = (s?: string) => (s || '').trim().toLowerCase().replace(/\b(ltd|llc|inc|gmbh|plc|co|corp|limited)\b\.?/g, '').replace(/[^a-z0-9\s]/g, '').replace(/\s+/g, ' ').trim();

/* ── Duplicate detection ── */

export interface DuplicateGroup {
  id: string;
  contacts: Contact[];
  /** 0–100; how sure we are these are the same person. */
  confidence: number;
  reason: string;
}

/**
 * Group contacts that look like the same person. Email is treated as an
 * identity, phone as strong evidence, and name+company as a suggestion the
 * user should confirm — so a low-confidence group is offered, never applied.
 */
export function findDuplicates(contacts: Contact[]): DuplicateGroup[] {
  const groups: DuplicateGroup[] = [];
  const claimed = new Set<string>();

  const bucket = (key: (c: Contact) => string, confidence: number, reason: string) => {
    const map = new Map<string, Contact[]>();
    for (const c of contacts) {
      if (claimed.has(c.id)) continue;
      const k = key(c);
      if (!k) continue;
      map.set(k, [...(map.get(k) ?? []), c]);
    }
    for (const [k, members] of map) {
      if (members.length < 2) continue;
      members.forEach(m => claimed.add(m.id));
      groups.push({
        id: `dup-${reason.replace(/\W+/g, '-')}-${k}`.slice(0, 80),
        contacts: [...members].sort(byCompleteness),
        confidence, reason,
      });
    }
  };

  bucket(c => normEmail(c.email), 100, 'Same email address');
  bucket(c => normPhone(c.phone), 85, 'Same phone number');
  bucket(c => {
    const n = normName(c.name);
    const co = normCompany(c.company);
    return n && co ? `${n}@${co}` : '';
  }, 60, 'Same name at the same company');

  return groups.sort((a, b) => b.confidence - a.confidence || b.contacts.length - a.contacts.length);
}

/** Richer records sort first, so the default primary is the fullest one. */
function byCompleteness(a: Contact, b: Contact): number {
  return completeness(b) - completeness(a);
}

export function completeness(c: Contact): number {
  let n = 0;
  for (const v of [c.email, c.phone, c.company, c.jobTitle, c.address, c.website, c.linkedin]) if (v) n += 2;
  n += (c.tags?.length ?? 0);
  n += (c.notes?.length ?? 0) * 2;
  n += (c.activities?.length ?? 0);
  n += (c.tasks?.length ?? 0);
  if (c.lifecycle) n += 2;
  if (c.timezone) n += 1;
  return n;
}

/* ── Field-by-field comparison ── */

export const MERGE_FIELDS = [
  'name', 'email', 'phone', 'company', 'jobTitle', 'address', 'website',
  'linkedin', 'twitter', 'status', 'source', 'assignedTo', 'lifecycle', 'timezone',
] as const;
export type MergeField = typeof MERGE_FIELDS[number];

export const FIELD_LABELS: Record<MergeField, string> = {
  name: 'Name', email: 'Email', phone: 'Phone', company: 'Company', jobTitle: 'Job title',
  address: 'Address', website: 'Website', linkedin: 'LinkedIn', twitter: 'Twitter',
  status: 'Status', source: 'Source', assignedTo: 'Owner', lifecycle: 'Lifecycle', timezone: 'Timezone',
};

export interface FieldChoice {
  field: MergeField;
  /** Distinct non-empty values across the group, in record order. */
  options: { contactId: string; value: string }[];
  /** True when the records disagree and a human should pick. */
  conflict: boolean;
  suggested: string;
}

const fieldValue = (c: Contact, f: MergeField): string => String((c as unknown as Record<string, unknown>)[f] ?? '');

/** What the merge will do, per field, before anything is written. */
export function mergePreview(group: Contact[]): FieldChoice[] {
  return MERGE_FIELDS.map(field => {
    const seen = new Map<string, string>();   // value → first contact id holding it
    for (const c of group) {
      const v = fieldValue(c, field).trim();
      if (v && !seen.has(v)) seen.set(v, c.id);
    }
    const options = [...seen].map(([value, contactId]) => ({ contactId, value }));
    return {
      field,
      options,
      conflict: options.length > 1,
      suggested: options[0]?.value ?? '',
    };
  });
}

/* ── The merge ── */

export interface MergeResult {
  /** The surviving contact, with everything folded in. */
  merged: Contact;
  /** Ids to delete once the re-pointing below has been written. */
  removedIds: string[];
  /** Pipelines with every deal re-pointed at the survivor. */
  pipelines: Pipeline[];
  /** Appointments re-pointed at the survivor. */
  appointments: Appointment[];
  /** Contact-email rows to re-point (id → new contactId). */
  emailReassignments: { from: string; to: string };
  summary: string[];
}

/**
 * Merge a group into its primary. Collections (tags, notes, tasks, activities)
 * are unioned rather than overwritten, scalar fields come from `choices`, and
 * every deal, appointment and email that pointed at a removed record is
 * re-pointed at the survivor.
 */
export function mergeContacts(
  group: Contact[],
  primaryId: string,
  choices: Partial<Record<MergeField, string>>,
  pipelines: Pipeline[],
  appointments: Appointment[],
): MergeResult {
  const primary = group.find(c => c.id === primaryId) ?? group[0];
  const others = group.filter(c => c.id !== primary.id);
  const summary: string[] = [];

  const merged: Contact = { ...primary };

  // Scalar fields: the explicit choice, else keep the primary's, else the
  // first non-empty value found on a duplicate — never lose data to a blank.
  for (const field of MERGE_FIELDS) {
    const chosen = choices[field];
    if (chosen !== undefined && chosen !== '') {
      (merged as unknown as Record<string, unknown>)[field] = chosen;
      continue;
    }
    if (!fieldValue(primary, field)) {
      const donor = others.find(o => fieldValue(o, field));
      if (donor) {
        (merged as unknown as Record<string, unknown>)[field] = fieldValue(donor, field);
        summary.push(`${FIELD_LABELS[field]} taken from ${donor.name}`);
      }
    }
  }

  // Collections: union, de-duplicated, newest first where there is a date.
  const tags = new Set(primary.tags ?? []);
  for (const o of others) for (const t of o.tags ?? []) tags.add(t);
  merged.tags = [...tags];

  merged.notes = dedupeById([...(primary.notes ?? []), ...others.flatMap(o => o.notes ?? [])])
    .sort((a, b) => (b.createdAt || '').localeCompare(a.createdAt || ''));
  merged.tasks = dedupeById([...(primary.tasks ?? []), ...others.flatMap(o => o.tasks ?? [])]);
  merged.activities = dedupeById([...(primary.activities ?? []), ...others.flatMap(o => o.activities ?? [])])
    .sort((a, b) => (b.timestamp || '').localeCompare(a.timestamp || ''));

  merged.customFields = { ...others.reduce((acc, o) => ({ ...acc, ...(o.customFields ?? {}) }), {}), ...(primary.customFields ?? {}) };
  merged.value = Math.max(primary.value ?? 0, ...others.map(o => o.value ?? 0));

  // Keep the earliest creation date and the latest activity date.
  const created = [primary, ...others].map(c => c.createdAt).filter(Boolean).sort();
  if (created.length) merged.createdAt = created[0];
  const last = [primary, ...others].map(c => c.lastActivity).filter(Boolean).sort();
  if (last.length) merged.lastActivity = last[last.length - 1];

  merged.activities = [
    {
      id: `act-merge-${Date.now()}`,
      type: 'note' as const,
      description: `Merged ${others.length} duplicate record${others.length === 1 ? '' : 's'}: ${others.map(o => o.email || o.name).join(', ')}`,
      timestamp: new Date().toISOString(),
    },
    ...(merged.activities ?? []),
  ];

  summary.push(`${merged.tags.length} tag${merged.tags.length === 1 ? '' : 's'}, ${merged.notes.length} note${merged.notes.length === 1 ? '' : 's'}, ${merged.activities.length} timeline entries kept`);

  // Re-point everything that referenced a removed record.
  const removedIds = others.map(o => o.id);
  const removedSet = new Set(removedIds);
  const removedEmails = new Set(others.map(o => normEmail(o.email)).filter(Boolean));

  let movedDeals = 0;
  const nextPipelines = pipelines.map(p => ({
    ...p,
    stages: p.stages.map(st => ({
      ...st,
      deals: st.deals.map(d => {
        const pointsAtRemoved = removedSet.has(d.contactId) || removedEmails.has(normEmail(d.contactEmail));
        if (!pointsAtRemoved) return d;
        movedDeals++;
        return { ...d, contactId: merged.id, contactName: merged.name, contactEmail: merged.email, contactPhone: merged.phone };
      }),
    })),
  }));
  if (movedDeals) summary.push(`${movedDeals} deal${movedDeals === 1 ? '' : 's'} re-pointed`);

  let movedAppts = 0;
  const nextAppointments = appointments.map(a => {
    if (!removedSet.has(a.contactId)) return a;
    movedAppts++;
    return { ...a, contactId: merged.id, contactName: merged.name };
  });
  if (movedAppts) summary.push(`${movedAppts} meeting${movedAppts === 1 ? '' : 's'} re-pointed`);

  return {
    merged,
    removedIds,
    pipelines: nextPipelines,
    appointments: nextAppointments,
    emailReassignments: { from: removedIds.join(','), to: merged.id },
    summary,
  };
}

function dedupeById<T extends { id: string }>(rows: T[]): T[] {
  const seen = new Set<string>();
  const out: T[] = [];
  for (const r of rows) {
    if (seen.has(r.id)) continue;
    seen.add(r.id);
    out.push(r);
  }
  return out;
}

/** Re-point stored email history at the survivor. Returns rows moved. */
export function reassignEmails(removedIds: string[], toId: string): number {
  const KEY = 'crm_contact_emails';
  const ENROLL = 'crm_sequence_enrollments';
  const removed = new Set(removedIds);
  let moved = 0;
  for (const key of [KEY, ENROLL]) {
    try {
      const rows = JSON.parse(localStorage.getItem(key) || '[]');
      if (!Array.isArray(rows)) continue;
      const next = rows.map((r: { contactId?: string }) => {
        if (!r.contactId || !removed.has(r.contactId)) return r;
        moved++;
        return { ...r, contactId: toId };
      });
      localStorage.setItem(key, JSON.stringify(next));
    } catch { /* corrupt or unavailable storage — leave it alone */ }
  }
  return moved;
}

/** Point static list memberships at the survivor and drop the duplicates. */
export function reassignListMembership(removedIds: string[], toId: string): number {
  const removed = new Set(removedIds);
  let touched = 0;
  const next = loadLists().map(l => {
    if (l.type !== 'static') return l;
    if (!l.memberIds.some(id => removed.has(id))) return l;
    touched++;
    const ids = new Set(l.memberIds.filter(id => !removed.has(id)));
    ids.add(toId);
    return { ...l, memberIds: [...ids] };
  });
  saveLists(next);
  return touched;
}
