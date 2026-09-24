/**
 * What the wizard needs to know about the workspace's contacts, kept out of
 * the component file so that one only exports components (fast refresh).
 */
import type { WorkflowNode } from '../../../services/autopilot';
import { nodeDetail } from '../workflowNodes';

export function contactCount(): number {
  try { return (JSON.parse(window.localStorage.getItem('crm_contacts') || '[]') as unknown[]).length; }
  catch { return 0; }
}

/** How somebody enters a workflow, in words: "A form is submitted — Quote request". */
export function entryOf(nodes: WorkflowNode[] = []): string {
  const t = nodes.find(n => n.type === 'trigger');
  if (!t) return 'When it is started';
  const d = nodeDetail('trigger', t.config ?? {});
  return d && d !== t.label ? `${t.label} — ${d}` : t.label || 'When it is started';
}
