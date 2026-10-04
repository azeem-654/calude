/**
 * What the wizard needs to know about the workspace's contacts, kept out of
 * the component file so that one only exports components (fast refresh).
 */
import type { WorkflowNode } from '../../../services/autopilot';
import { nodeDetail } from '../workflowNodes';
import { listKindOf, loadLists } from '../../../services/contactLists';
import type { Contact } from '../../../types';

function readContacts(): Contact[] {
  try {
    const raw = JSON.parse(window.localStorage.getItem('crm_contacts') || '[]');
    return Array.isArray(raw) ? raw as Contact[] : [];
  } catch { return []; }
}

export function contactCount(): number {
  return readContacts().length;
}

export interface ListChoice {
  id: string;
  name: string;
  count: number;
  withEmail: number;
  /** Strangers — see `listKindOf`. Said on the picker, and acted on by the planner. */
  cold: boolean;
}

/**
 * The lists a project can work from: hand-picked ones only.
 *
 * A smart list is a set of rules evaluated in the browser against health
 * scores, email history and deals, none of which the planner on the server
 * has. Offering one would give the project an audience it cannot follow, so
 * they are counted (to say why they are missing) and not offered.
 */
export function listChoices(): { lists: ListChoice[]; smart: number } {
  const contacts = readContacts();
  const all = loadLists();
  const lists = all.filter(l => l.type === 'static').map(l => {
    const ids = new Set(l.memberIds);
    const members = contacts.filter(c => ids.has(c.id));
    return {
      id: l.id, name: l.name, count: members.length,
      withEmail: members.filter(c => c.email).length,
      cold: listKindOf(l, members) === 'cold',
    };
  });
  return { lists, smart: all.length - lists.length };
}

/** How somebody enters a workflow, in words: "A form is submitted — Quote request". */
export function entryOf(nodes: WorkflowNode[] = []): string {
  const t = nodes.find(n => n.type === 'trigger');
  if (!t) return 'When it is started';
  const d = nodeDetail('trigger', t.config ?? {});
  return d && d !== t.label ? `${t.label} — ${d}` : t.label || 'When it is started';
}

/** The daily prospect finder a blueprint would build — who, where, how many — or null. */
export function finderSpecOf(workflows: { key: string; nodes?: WorkflowNode[] }[]): { trades: string[]; places: string[]; perDay: number } | null {
  const cfg = workflows.find(w => w.key === 'finder')?.nodes?.find(n => n.config?.produces === 'prospects')?.config;
  if (!cfg) return null;
  return {
    trades: String(cfg.trades ?? '').split(',').map(x => x.trim()).filter(Boolean),
    places: String(cfg.places ?? '').split(';').map(x => x.trim()).filter(Boolean),
    perDay: Number(cfg.perDay) || 20,
  };
}
