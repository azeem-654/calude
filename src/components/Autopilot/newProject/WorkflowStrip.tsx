/**
 * A workflow's steps, laid out open in one row that scrolls sideways.
 *
 * The owner's brief (2026-11-12): the blueprint said "we have created the
 * following workflow" and showed only its name, so nobody could see what it
 * would do. This draws every step — the trigger first, then the main path
 * (Yes on a condition), then any branch steps — as small cards joined by
 * arrows, with the same icons, colours and one-line details as the workflow
 * canvas (`workflowNodes.ts` lookFor / nodeDetail), so the blueprint and the
 * editor never describe a step two ways.
 */
import { ArrowRight, GitBranch } from 'lucide-react';
import type { WorkflowNode } from '../../../services/autopilot';
import { lookFor, nodeDetail } from '../workflowNodes';

/** Trigger first, then the main path, then whatever only a branch reaches. */
function orderSteps(nodes: WorkflowNode[]): { node: WorkflowNode; branch: boolean }[] {
  if (!nodes.length) return [];
  const byId = new Map(nodes.map(n => [n.id, n]));
  const pointed = new Set(nodes.flatMap(n => [n.nextId, n.yesId, n.noId].filter(Boolean) as string[]));
  const start = nodes.find(n => n.type === 'trigger') ?? nodes.find(n => !pointed.has(n.id)) ?? nodes[0];
  const out: { node: WorkflowNode; branch: boolean }[] = [];
  const seen = new Set<string>();
  let cur: WorkflowNode | undefined = start;
  while (cur && !seen.has(cur.id) && out.length < 60) {
    seen.add(cur.id);
    out.push({ node: cur, branch: false });
    const nextId: string | null | undefined = cur.type === 'condition' ? (cur.yesId ?? cur.nextId) : cur.nextId;
    cur = nextId ? byId.get(nextId) : undefined;
  }
  for (const n of nodes) if (!seen.has(n.id)) out.push({ node: n, branch: true });
  return out;
}

export default function WorkflowStrip({ nodes, name }: { nodes?: WorkflowNode[]; name: string }) {
  const steps = orderSteps(nodes ?? []);
  if (!steps.length) {
    return <span className="np-strip-none">The steps are written for your business while it is built — you can open and edit them afterwards.</span>;
  }
  return (
    <div className="np-strip" role="list" aria-label={`Steps in ${name}`} tabIndex={0}>
      {steps.map(({ node, branch }, i) => {
        const look = lookFor(node.type);
        const Icon = look.icon;
        const detail = nodeDetail(node.type, node.config);
        return (
          <div key={node.id} className="np-strip-item" role="listitem">
            {i > 0 && (branch && !steps[i - 1].branch
              ? <span className="np-strip-join" data-branch="1" aria-hidden="true"><GitBranch size={13} /></span>
              : <span className="np-strip-join" aria-hidden="true"><ArrowRight size={13} /></span>)}
            <div className="np-strip-step" data-branch={branch ? '1' : '0'} style={{ ['--step-fg' as string]: look.fg, ['--step-bg' as string]: look.bg }}>
              <span className="np-strip-kind"><Icon size={12} /> {branch ? `If not · ${look.label}` : look.label}</span>
              <b>{node.label || look.label}</b>
              {detail && <span className="np-strip-detail">{detail}</span>}
            </div>
          </div>
        );
      })}
    </div>
  );
}
