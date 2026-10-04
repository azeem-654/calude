/**
 * A project's prospects and its daily prospect finder, from the browser's side
 * (worker/src/routes/finders.ts, worker/src/prospectFinderTick.ts).
 *
 * The finder runs on the server every few minutes whether or not anybody is
 * signed in. `syncFinderContacts` is the browser's half of the hand-off: the
 * server adds what it found to Contacts too, but a browser holding an older
 * copy can save over that, so on every load and refresh the browser puts back
 * any found prospect its copy lacks — and tells the server when the customer
 * deletes one on purpose, so neither side brings it back.
 */
import { API_BASE } from './apiBase';
import { sessionToken } from './auth';
import { getActiveAccountId } from './tenancy';
import { CLOUD_REFRESH_EVENT } from './serverData';
import type { Contact } from '../types';

async function call<T = Record<string, unknown>>(action: string, extra: Record<string, unknown> = {}): Promise<T & { success?: boolean; error?: string; field?: string }> {
  try {
    const r = await fetch(`${API_BASE}/api/finders.php`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action, token: sessionToken(), accountId: getActiveAccountId(), ...extra }),
    });
    return await r.json();
  } catch {
    return { success: false, error: 'Could not reach the server.' } as T & { success: boolean; error: string };
  }
}

export interface RotationItem { trade: string; place: string; state: 'done' | 'next' | 'waiting' }
export interface FinderInfo {
  id: string; workflowId: string; trades: string[]; places: string[]; perDay: number; source: 'free' | 'register';
  listId: string; status: 'active' | 'paused' | 'exhausted'; statusReason: string;
  today: { day: string; added: number; searches: number; reads: number };
  limits: { searches: number; reads: number }; nextRunAt: string; lastRunAt: string; rotation: RotationItem[];
}
export interface ProspectRow {
  id: string; name: string; email: string; phone: string; website: string; category: string; person_name: string; person_role: string;
  email_status: string; query: string; source: string; status: string; found_at: string; added_at: string;
}
export interface FinderOverview {
  finder: FinderInfo | null;
  days: { day: string; added: number }[];
  found: { day: string; found: number }[];
  totals: Record<string, number>;
  recent: ProspectRow[];
  runs: { kind: string; detail: string; found: number; added: number; at: string }[];
}

export const finderOverview = (projectId: string) => call<FinderOverview>('overview', { projectId });
export const saveFinder = (p: {
  projectId: string; trades: string[]; places: string[]; perDay: number; source?: 'free' | 'register';
  listId?: string; listName?: string; append?: boolean;
}) => call<{ finderId: string; workflowId: string; listId: string; trades: string[]; places: string[] }>('save', p);
export const setFinderStatus = (projectId: string, finderId: string, status: 'active' | 'paused') => call('set_status', { projectId, finderId, status });
export const runFinderStep = (projectId: string, finderId: string) => call<{ ran: boolean; job: string; detail: string; added: number; found: number }>('run_step', { projectId, finderId });
export const expandPlace = (place: string) => call<{ kind: string; places: string[]; note: string }>('expand_place', { place });
export const recordProjectProspects = (projectId: string, prospects: Record<string, unknown>[]) => call('record', { projectId, prospects });
export const forgetFoundContacts = (contactIds: string[]) => call('removed', { contactIds });

let syncing = false;

/**
 * Put back any found prospect this browser's Contacts lacks, and onto its
 * project's list. Writes go through the tenant-scoped storage, which syncs them
 * up; AppContext re-reads on the refresh event.
 */
export async function syncFinderContacts(): Promise<number> {
  if (syncing || !getActiveAccountId()) return 0;
  syncing = true;
  try {
    const r = await call<{ contacts: { contact: Contact; listId: string }[] }>('sync');
    if (!r.success || !r.contacts?.length) return 0;
    const contacts: Contact[] = JSON.parse(localStorage.getItem('crm_contacts') || '[]');
    const have = new Set(contacts.map(c => c.id));
    const missing = r.contacts.filter(x => !have.has(x.contact.id));
    const lists: { id: string; type: string; memberIds: string[] }[] = JSON.parse(localStorage.getItem('crm_contact_lists') || '[]');
    let listChanged = false;
    for (const x of r.contacts) {
      const l = lists.find(y => y.id === x.listId && y.type === 'static');
      if (l && !l.memberIds.includes(x.contact.id)) { l.memberIds.push(x.contact.id); listChanged = true; }
    }
    if (missing.length) localStorage.setItem('crm_contacts', JSON.stringify([...missing.map(m => m.contact), ...contacts]));
    if (listChanged) localStorage.setItem('crm_contact_lists', JSON.stringify(lists));
    if (missing.length || listChanged) window.dispatchEvent(new CustomEvent(CLOUD_REFRESH_EVENT));
    return missing.length;
  } catch {
    return 0;
  } finally {
    syncing = false;
  }
}
