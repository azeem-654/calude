/**
 * Contacts → an AI Autopilot business workspace.
 *
 * A business workspace (a project, on the server) writes to the people on
 * its audience list (`brief.audience.listId`), and the cron re-reads that
 * list every tick — so putting somebody on the list IS sending them to it.
 * There is no second way in: cold people are still proposed 20 at a time,
 * each batch waiting for a person (worker/src/autopilotTick.ts).
 *
 * Which list they go on:
 * - the workspace's own audience list, when it has a hand-picked one;
 * - otherwise the list being sent, when it is hand-picked — the workspace
 *   is pointed at it;
 * - otherwise a new hand-picked list named after the workspace. A smart
 *   list is never pointed at, because the server cannot evaluate its rules.
 *
 * Used by Contacts (a list, or ticked contacts) and AI Prospecting's "Add to
 * an AI Autopilot business workspace" — one implementation, so the two can
 * never disagree about where somebody went.
 */
import type { Contact } from '../types';
import { addToStaticList, createList, loadLists, type ContactList } from './contactLists';
import { saveProject, type Project } from './projects';
import { recordProjectProspects } from './finders';
import { flushNow } from './serverData';
import { isSuppressed } from './deliverability';

type Audience = { listId?: string; listName?: string };
const audienceOf = (p: Pick<Project, 'brief'>): Audience | undefined =>
  (p.brief as { audience?: Audience } | null | undefined)?.audience;

/** May something we start email this contact? */
export const mailable = (c: Contact) => !!c.email && !isSuppressed(c.email) && c.customFields?.emailStatus !== 'invalid';

export interface WorkspaceOption { id: string; name: string; note: string; ok: boolean }

/** Every business workspace, with what sending to it would do — said before it is done. */
export function workspaceOptions(projects: Project[]): WorkspaceOption[] {
  return projects.map(p => {
    const aud = audienceOf(p);
    return {
      id: p.id, name: p.name, ok: !!p.brief,
      note: aud?.listId ? `Adds them to its list “${aud.listName || 'audience'}”`
        : p.brief ? 'They become the people it writes to'
          : 'Made before workspaces had an audience — open it in AI Autopilot to choose one',
    };
  });
}

/** Which static list the workspace should hold them on — see the file comment. */
export function targetListFor(p: Pick<Project, 'brief' | 'name'>, from: ContactList | null, lists: ContactList[]):
  { kind: 'existing'; list: ContactList } | { kind: 'new'; name: string } {
  const aud = audienceOf(p);
  const own = aud?.listId ? lists.find(l => l.id === aud.listId && l.type === 'static') : undefined;
  if (own) return { kind: 'existing', list: own };
  if (from && from.type === 'static') return { kind: 'existing', list: from };
  return { kind: 'new', name: `${p.name} — audience` };
}

export interface SendResult { ok: boolean; message: string; list?: ContactList }

export async function sendToWorkspace(input: {
  project: Project;
  people: Contact[];
  /** The list being sent, when a whole list is. */
  from?: ContactList | null;
  createdBy: string;
  /** For the workspace's Prospects tab — "dentists|Leeds" when it came from a search. */
  query?: string;
}): Promise<SendResult> {
  const { project: p, people } = input;
  if (!p.brief) return { ok: false, message: `“${p.name}” was made before workspaces had an audience — open it in AI Autopilot to choose one first.` };
  if (!people.length) return { ok: false, message: 'Nobody to send — the list is empty.' };

  const t = targetListFor(p, input.from ?? null, loadLists());
  const anyCold = people.some(c => c.status === 'prospect');
  const list = t.kind === 'existing'
    ? t.list
    : createList({ name: t.name, type: 'static', createdBy: input.createdBy, ...(anyCold ? { kind: 'cold' as const } : {}) });
  addToStaticList(list.id, people.map(c => c.id));
  /* The server reads the list from the synced workspace data, so it has to
     be there before the workspace is pointed at it. */
  await flushNow();

  const aud = audienceOf(p);
  if (aud?.listId !== list.id) {
    let goals: string[];
    try { goals = JSON.parse(p.goals || '[]') as string[]; } catch { goals = []; }
    /* saveProject resets what it is not sent, so every target goes back. */
    const saved = await saveProject({
      id: p.id, name: p.name, objective: p.objective, portfolioId: p.portfolioId, kind: p.kind,
      revenueTarget: p.revenueTarget, volumeTarget: p.volumeTarget, goals,
      brief: { ...(p.brief as unknown as Record<string, unknown>), audience: { listId: list.id, listName: list.name } },
    });
    if (!saved.success) return { ok: false, list, message: `They are on “${list.name}”, but “${p.name}” could not be pointed at it: ${saved.error ?? 'no answer'}.` };
  }

  /* Counted on the workspace's Prospects tab beside what its daily search adds.
     A failure here loses a count, not a person, so it is not the answer. */
  await recordProjectProspects(p.id, people.map(c => ({
    ref: `contact:${c.id}`, contactId: c.id, name: c.name, email: c.email, phone: c.phone, website: c.website ?? '',
    address: c.address ?? '', category: c.tags?.[1] ?? '', emailStatus: c.customFields?.emailStatus ?? '',
    foundAt: c.customFields?.foundAt ?? '', query: input.query ?? '',
  }))).catch(() => undefined);

  const reach = people.filter(mailable).length;
  const cold = people.filter(c => c.status === 'prospect').length;
  return {
    ok: true, list,
    message: `${people.length} sent to “${p.name}” on its list “${list.name}” — ${reach} can be emailed.`
      + (cold ? ' AI Autopilot proposes people who never asked to hear from you in batches of 20 and asks you before each one.' : ''),
  };
}
