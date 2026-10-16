/**
 * Customers → Lead lists: the customer's own leads, folder by folder
 * (components/Prospecting/LeadLists.tsx).
 *
 * ── Only what is already theirs ──
 *
 * Every row on that page is a contact already in this workspace, on a list in
 * this workspace. There is no search of anything else behind it: the product
 * finds leads live (AI Prospecting, a project's daily finder) and does not sell
 * a database of people to look up — the owner's licensed data reaches a
 * customer only through a project's daily prospecting, named on each contact
 * as "Licensed business data".
 *
 * ── The folders ──
 *
 * One per AI Autopilot project, holding the lists that project fills: its
 * audience (`brief.audience.listId`) and the list of every finder and connected
 * search it runs — which only the server knows, so `/api/finders.php` `folders`
 * answers it. Contacts a project found that sit on none of those lists (a
 * finder with no list) are shown as the project's own list, so nothing it found
 * is invisible. Then the lists saved from AI Prospecting, then every other
 * list. A list two projects share is in both folders.
 *
 * Everything here but `fetchProjectLinks` is pure.
 */
import type { Contact } from '../types';
import { API_BASE } from './apiBase';
import { sessionToken } from './auth';
import { getActiveAccountId } from './tenancy';
import type { ContactList } from './contactLists';
import { SOURCE_NAME } from './prospects';

export interface ProjectLink {
  id: string;
  listIds: string[];
  added: number;
  bySource: Record<string, number>;
  lastAddedAt: string;
}

/** Which lists each project fills — null when the server could not be asked. */
export async function fetchProjectLinks(): Promise<{ links: ProjectLink[] | null; error: string }> {
  const accountId = getActiveAccountId();
  if (!accountId) return { links: null, error: 'No workspace is active yet.' };
  try {
    const r = await fetch(`${API_BASE}/api/finders.php`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ token: sessionToken(), accountId, action: 'folders' }),
    });
    const d = await r.json().catch(() => ({ success: false, error: `The server answered ${r.status}.` })) as { success?: boolean; error?: string; projects?: ProjectLink[] };
    return d.success ? { links: d.projects ?? [], error: '' } : { links: null, error: d.error ?? 'Your business workspaces could not be read.' };
  } catch {
    return { links: null, error: 'Could not reach the server.' };
  }
}

/* ── One lead, as the page shows it ── */

export type CheckState = 'valid' | 'domain_ok' | 'risky' | 'invalid' | 'none';
export const CHECK_LABEL: Record<CheckState, string> = {
  valid: 'Verified', domain_ok: 'Domain takes mail', risky: 'Risky', invalid: 'Would bounce', none: 'Not checked',
};

/** The address check stored on the contact — ours, never a list seller's word. */
export function checkOf(c: Contact): CheckState {
  if (!c.email) return 'none';
  const s = c.customFields?.emailStatus ?? '';
  if (s === 'valid' || s === 'domain_ok' || s === 'risky' || s === 'invalid') return s;
  const tags = c.tags ?? [];
  if (tags.includes('verified email')) return 'valid';
  if (tags.includes('email domain ok')) return 'domain_ok';
  if (tags.includes('risky email')) return 'risky';
  if (tags.includes('email bounces')) return 'invalid';
  return 'none';
}

export const LICENSED = SOURCE_NAME.library;

/**
 * Where a lead came from, in words a customer can repeat to the person
 * themselves. Contacts once loaded from the owner's library by hand said
 * "Lead directory"; they are that same licensed data and say so.
 */
export function sourceOf(c: Contact): string {
  const s = (c.source ?? '').toLowerCase();
  if (c.customFields?.dataSource === LICENSED || s.includes('licensed business data') || s === 'lead directory') return LICENSED;
  if (s.includes('daily prospecting')) return 'Found by daily prospecting';
  if (s.startsWith('ai prospecting')) return 'AI Prospecting';
  if (s.startsWith('ai autopilot')) return 'AI Autopilot';
  return c.source || 'Added by you';
}

export const foundAtOf = (c: Contact): string => c.customFields?.foundAt || c.createdAt || '';

/** The person's name and the business, whichever way round the contact keeps them. */
export function whoOf(c: Contact): { person: string; business: string } {
  const person = [c.firstName, c.lastName].filter(Boolean).join(' ');
  const business = c.company || '';
  if (person && business) return { person, business: business === person ? '' : business };
  if (person) return { person, business: c.name !== person ? c.name : '' };
  return { person: c.name, business: business && business !== c.name ? business : '' };
}

/* ── Folders ── */

export interface LeadListView {
  /** The list's id; for a project's unlisted finds, `found:<projectId>` — not a real list. */
  id: string;
  name: string;
  real: boolean;
  smart: boolean;
  cold: boolean;
  createdAt: string;
  members: Contact[];
}

export interface LeadFolder {
  id: string;
  kind: 'project' | 'prospecting' | 'other';
  name: string;
  /** For a project: its status on the board. */
  status?: string;
  lists: LeadListView[];
  /** Everybody in the folder once, whichever lists they are on. */
  people: Contact[];
  lastAt: string;
}

export interface FolderInput {
  projects: { id: string; name: string; status?: string }[];
  links: ProjectLink[];
  lists: ContactList[];
  contacts: Contact[];
  /** Members of a list now — smart lists re-run their rules (contactLists.listMembers). */
  membersOf: (l: ContactList) => Contact[];
}

const latest = (people: Contact[]) => people.reduce((t, c) => { const a = foundAtOf(c); return a > t ? a : t; }, '');

function view(l: ContactList, members: Contact[]): LeadListView {
  return {
    id: l.id, name: l.name, real: true, smart: l.type === 'smart',
    cold: l.kind ? l.kind === 'cold' : members.some(c => c.status === 'prospect'),
    createdAt: l.createdAt, members,
  };
}

function folder(id: string, kind: LeadFolder['kind'], name: string, lists: LeadListView[], status?: string): LeadFolder {
  const seen = new Map<string, Contact>();
  for (const l of lists) for (const c of l.members) seen.set(c.id, c);
  const people = [...seen.values()];
  return { id, kind, name, status, lists, people, lastAt: latest(people) };
}

export function buildFolders(input: FolderInput): LeadFolder[] {
  const byId = new Map(input.lists.map(l => [l.id, l]));
  const members = new Map<string, Contact[]>();
  const membersOf = (l: ContactList) => {
    let m = members.get(l.id);
    if (!m) { try { m = input.membersOf(l); } catch { m = []; } members.set(l.id, m); }
    return m;
  };
  const claimed = new Set<string>();
  const links = new Map(input.links.map(p => [p.id, p]));
  const out: LeadFolder[] = [];

  for (const p of input.projects) {
    const link = links.get(p.id);
    const lists = (link?.listIds ?? []).map(id => byId.get(id)).filter((l): l is ContactList => !!l);
    lists.forEach(l => claimed.add(l.id));
    const views = lists.map(l => view(l, membersOf(l)));
    /* What the project found that is on none of its lists — still the project's. */
    const onLists = new Set(views.flatMap(v => v.members.map(c => c.id)));
    const loose = input.contacts.filter(c => c.customFields?.projectId === p.id && !onLists.has(c.id));
    if (loose.length) {
      views.push({ id: `found:${p.id}`, name: `Found by ${p.name}`, real: false, smart: false, cold: true, createdAt: '', members: loose });
    }
    out.push(folder(`project:${p.id}`, 'project', p.name, views, p.status));
  }

  const prospecting = input.lists.filter(l => !claimed.has(l.id) && l.origin === 'prospecting');
  prospecting.forEach(l => claimed.add(l.id));
  out.push(folder('prospecting', 'prospecting', 'Saved from AI Prospecting', prospecting.map(l => view(l, membersOf(l)))));

  const other = input.lists.filter(l => !claimed.has(l.id));
  out.push(folder('other', 'other', 'Other lists', other.map(l => view(l, membersOf(l)))));
  return out;
}

/** Leads whose name, business, email, phone, website or tags contain every word typed. */
export function matchLeads(people: Contact[], q: string): Contact[] {
  const words = q.toLowerCase().split(/\s+/).filter(Boolean);
  if (!words.length) return people;
  return people.filter(c => {
    const hay = [c.name, c.firstName, c.lastName, c.company, c.email, c.phone, c.website, c.jobTitle, c.address, ...(c.tags ?? [])]
      .filter(Boolean).join(' ').toLowerCase();
    return words.every(w => hay.includes(w));
  });
}

/* ── Export ── */

const cell = (v: string) => (/[",\n\r]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v);

/**
 * A CSV of the leads, with where each came from — the column a customer
 * needs when somebody they write to asks where their details were found.
 */
export function toCsv(people: Contact[]): string {
  const head = ['Name', 'Business', 'Job title', 'Email', 'Email check', 'Checked on', 'Phone', 'Website', 'Source', 'Found on', 'Where it came from'];
  const rows = people.map(c => {
    const w = whoOf(c);
    return [
      w.person, w.business, c.jobTitle ?? '', c.email ?? '', c.email ? CHECK_LABEL[checkOf(c)] : '', (c.customFields?.emailCheckedAt ?? '').slice(0, 10),
      c.phone ?? '', c.website ?? '', sourceOf(c), foundAtOf(c).slice(0, 10), c.customFields?.provenance ?? '',
    ];
  });
  /* A byte-order mark, so a spreadsheet opens names with accents as written. */
  return '﻿' + [head, ...rows].map(r => r.map(x => cell(String(x ?? ''))).join(',')).join('\r\n') + '\r\n';
}
