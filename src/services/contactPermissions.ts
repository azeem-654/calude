/**
 * contactPermissions.ts — ownership and what each role may do with a contact.
 *
 * This decides what the interface offers. The matching rules are enforced
 * server-side in `public/api/_perm.php`, which guards every write to the
 * account store, so a user who edits the UI in devtools still cannot change
 * data they are not allowed to change — the server refuses the write and the
 * browser is resynced from the server's copy.
 *
 * When the cloud database is not configured the app runs local-only; then this
 * layer is advisory, because there is no server to enforce anything. Use
 * `enforcementMode()` to tell the user which of the two they are in rather
 * than implying a guarantee that isn't there.
 */

import type { Contact } from '../types';
import { getSession, type Role } from './auth';
import { cachedCapabilities, cloudStatus } from './serverData';

export type Capability =
  | 'view' | 'edit' | 'delete' | 'export' | 'reassign' | 'merge' | 'bulk_edit' | 'manage_lists';

/**
 * Base capabilities per role. Agency users run the account and can act on any
 * record. Client users work their own sub-account: they can fully manage the
 * contacts they own, but cannot touch someone else's, and merging is withheld
 * entirely because it destroys records across owners.
 */
const ROLE_CAPS: Record<Role, Capability[]> = {
  agency: ['view', 'edit', 'delete', 'export', 'reassign', 'merge', 'bulk_edit', 'manage_lists'],
  client: ['view', 'edit', 'delete', 'export', 'reassign', 'bulk_edit', 'manage_lists'],
};

export interface Actor {
  email: string;
  name: string;
  role: Role;
}

export function currentActor(): Actor {
  const s = getSession();
  return {
    email: s?.user.email ?? 'unknown@local',
    name: s?.user.name ?? 'You',
    role: s?.user.role ?? 'agency',
  };
}

/** Owner label stored on the contact. Unowned contacts are everyone's. */
export const ownerOf = (c: Contact): string => (c.assignedTo || '').trim();

export function isOwner(c: Contact, actor: Actor): boolean {
  const owner = ownerOf(c).toLowerCase();
  if (!owner) return true;
  return owner === actor.email.toLowerCase() || owner === actor.name.toLowerCase();
}

/** Restrict a role's write actions on records someone else owns. */
const OWNER_ONLY: Capability[] = ['edit', 'delete', 'reassign', 'merge'];

/**
 * Whether the rules are actually enforced, or only presented.
 *  - 'server'   the cloud database is configured and api/_perm.php guards writes
 *  - 'local'    local-only deployment; the rules shape the UI but nothing else
 */
export function enforcementMode(): 'server' | 'local' {
  const caps = cachedCapabilities();
  return cloudStatus() === 'cloud' && caps?.enforced ? 'server' : 'local';
}

/**
 * Capabilities the server granted this session, when it has spoken. Falling
 * back to the local table keeps the UI working offline, and the server is the
 * one that decides in the end either way.
 */
function capsFor(actor: Actor): Capability[] {
  const server = cachedCapabilities();
  if (server && server.email.toLowerCase() === actor.email.toLowerCase()) {
    return (Object.entries(server.capabilities) as [Capability, boolean][])
      .filter(([, allowed]) => allowed)
      .map(([cap]) => cap);
  }
  return ROLE_CAPS[actor.role];
}

export function can(cap: Capability, actor: Actor = currentActor(), contact?: Contact): boolean {
  if (!capsFor(actor).includes(cap)) return false;
  if (actor.role === 'agency') return true;                  // agency sees the whole account
  if (contact && OWNER_ONLY.includes(cap)) return isOwner(contact, actor);
  return true;
}

/** Explain a denial, so the UI can say why instead of just going grey. */
export function denyReason(cap: Capability, actor: Actor = currentActor(), contact?: Contact): string {
  if (!capsFor(actor).includes(cap)) {
    return `Your role (${actor.role}) cannot ${cap.replace('_', ' ')} contacts.`;
  }
  if (contact && !isOwner(contact, actor) && OWNER_ONLY.includes(cap)) {
    return `${contact.name} is owned by ${ownerOf(contact)} — ask them, or have an agency user reassign it.`;
  }
  return '';
}

/** Every owner currently in use, for the owner filter and assign menu. */
export function ownersInUse(contacts: Contact[]): string[] {
  const set = new Set<string>();
  for (const c of contacts) {
    const o = ownerOf(c);
    if (o) set.add(o);
  }
  return [...set].sort();
}

/* ── Team activity feed ── */

export interface FeedEntry {
  id: string;
  contactId: string;
  contactName: string;
  type: string;
  description: string;
  at: string;
  owner: string;
}

/**
 * Recent activity across every contact, newest first. This is the "what has
 * the team been doing" view that a per-contact timeline cannot give you.
 */
export function teamFeed(contacts: Contact[], limit = 60, ownerFilter = ''): FeedEntry[] {
  const out: FeedEntry[] = [];
  for (const c of contacts) {
    const owner = ownerOf(c);
    if (ownerFilter && owner.toLowerCase() !== ownerFilter.toLowerCase()) continue;
    for (const a of c.activities ?? []) {
      out.push({
        id: `${c.id}-${a.id}`,
        contactId: c.id,
        contactName: c.name,
        type: a.type,
        description: a.description,
        at: a.timestamp,
        owner,
      });
    }
  }
  return out
    .filter(e => e.at)
    .sort((a, b) => new Date(b.at).getTime() - new Date(a.at).getTime())
    .slice(0, limit);
}

/** Per-owner counts over the recent feed, for a quick workload read. */
export function ownerWorkload(contacts: Contact[]): { owner: string; contacts: number; recent: number }[] {
  const map = new Map<string, { contacts: number; recent: number }>();
  const cutoff = Date.now() - 7 * 86_400_000;
  for (const c of contacts) {
    const owner = ownerOf(c) || 'Unassigned';
    const entry = map.get(owner) ?? { contacts: 0, recent: 0 };
    entry.contacts++;
    entry.recent += (c.activities ?? []).filter(a => new Date(a.timestamp).getTime() >= cutoff).length;
    map.set(owner, entry);
  }
  return [...map].map(([owner, v]) => ({ owner, ...v })).sort((a, b) => b.contacts - a.contacts);
}
