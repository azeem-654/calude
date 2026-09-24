/**
 * The to-do list across every deal: what is pending, and when it is due.
 *
 * Read by the round badge in the top bar, the dashboard's "Due" panel and the
 * daily reminder — one reading, so the badge cannot say 12 while the
 * dashboard says 9. Only open deals count: a task on a won or lost deal is
 * not something anybody is still going to do.
 */
import type { Pipeline } from '../types';

export type Due = 'overdue' | 'today' | 'soon' | 'later' | 'undated';

export interface PendingTask {
  id: string;
  title: string;
  dueDate: string;
  due: Due;
  dealId: string;
  dealTitle: string;
  pipelineId: string;
  pipelineName: string;
  stageName: string;
}

const dayStart = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();

export function dueOf(dueDate: string | undefined, now = new Date()): Due {
  if (!dueDate) return 'undated';
  const t = Date.parse(dueDate.length === 10 ? `${dueDate}T00:00:00` : dueDate);
  if (!Number.isFinite(t)) return 'undated';
  const days = Math.round((dayStart(new Date(t)) - dayStart(now)) / 86_400_000);
  if (days < 0) return 'overdue';
  if (days === 0) return 'today';
  if (days <= 3) return 'soon';
  return 'later';
}

const ORDER: Record<Due, number> = { overdue: 0, today: 1, soon: 2, later: 3, undated: 4 };

export function pendingTasks(pipelines: Pipeline[] | undefined, now = new Date()): PendingTask[] {
  const out: PendingTask[] = [];
  for (const p of pipelines ?? []) {
    for (const st of p.stages ?? []) {
      for (const d of st.deals ?? []) {
        if (d.status === 'won' || d.status === 'lost') continue;
        for (const t of d.subtasks ?? []) {
          if (t.done) continue;
          out.push({
            id: t.id, title: t.title, dueDate: t.dueDate ?? '', due: dueOf(t.dueDate, now),
            dealId: d.id, dealTitle: d.title, pipelineId: p.id, pipelineName: p.name, stageName: st.name,
          });
        }
      }
    }
  }
  return out.sort((a, b) => (ORDER[a.due] - ORDER[b.due]) || a.dueDate.localeCompare(b.dueDate));
}

export function taskSummary(list: PendingTask[]) {
  return {
    total: list.length,
    overdue: list.filter(t => t.due === 'overdue').length,
    today: list.filter(t => t.due === 'today').length,
    soon: list.filter(t => t.due === 'soon').length,
  };
}

/** "Due today", "2 days late", "in 3 days", "12 Oct". */
export function dueLabel(t: PendingTask, now = new Date()): string {
  if (t.due === 'undated') return 'No date';
  const days = Math.round((dayStart(new Date(`${t.dueDate.slice(0, 10)}T00:00:00`)) - dayStart(now)) / 86_400_000);
  if (days < 0) return `${-days} day${days === -1 ? '' : 's'} late`;
  if (days === 0) return 'Due today';
  if (days === 1) return 'Due tomorrow';
  if (days <= 6) return `In ${days} days`;
  return new Date(`${t.dueDate.slice(0, 10)}T00:00:00`).toLocaleDateString(undefined, { day: 'numeric', month: 'short' });
}
