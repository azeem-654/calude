/**
 * A workflow, drawn left to right the way somebody describes it.
 *
 * ── Why a laid-out graph rather than a list of steps ──
 *
 * The list is what the builder shows, and it is fine for editing one step. It
 * is useless for the question this screen answers, which is "what does this
 * thing actually do to my customers" — because the answer is a shape. A branch
 * read as two indented lines is a branch nobody checks; a branch drawn as two
 * paths is one somebody argues with.
 *
 * ── The layout, and why it is a grid rather than absolute positions ──
 *
 * Every step is placed in a CSS grid column by how far along the spine it sits.
 * The spine is the path a person takes when every condition answers Yes, which
 * is the story the workflow is about. A No branch drops to the row beneath,
 * starting in the column after its condition, so the two paths are readable as
 * two paths without anything being measured or positioned by hand.
 *
 * Absolute coordinates would draw a prettier curve and would be wrong the first
 * time a label wrapped, a font loaded late, or somebody opened this at 390px.
 * The grid is correct at every width and degrades to a scroll rather than to
 * overlapping boxes.
 *
 * ── What it will not do ──
 *
 * Edit. This is the map; the builder is the editor. Two node editors would
 * drift the first time either changed, which is the same reason the project
 * panel links out rather than embedding one.
 */
import { Fragment } from 'react';
import type { AutomationNode } from '../../types/marketing';
import { lookFor, nodeDetail } from './workflowNodes';

const INK = '#17191c';
const MUTED = '#6b7280';
const LINE = '#e6e9f0';

/** One step, and where it sits. */
interface Placed {
  node: AutomationNode;
  column: number;
  /** 0 is the spine; 1 is a No branch hanging under it. */
  row: number;
  /** The condition this branch left, so its elbow can be drawn. */
  from?: string;
}

/**
 * Walk the graph into rows and columns.
 *
 * Exported so it can be argued with directly: the interesting cases are a graph
 * that points back at itself and a branch that rejoins the spine, and both are
 * far easier to reason about as data than as pixels.
 */
export function layout(nodes: AutomationNode[]): { placed: Placed[]; columns: number } {
  const byId = new Map(nodes.map(n => [n.id, n]));
  const placed: Placed[] = [];
  const seen = new Set<string>();

  /* The spine: every condition answered Yes. That is the story the workflow is
     about, and the path a customer pictures when they describe it. */
  let cur: AutomationNode | undefined = nodes.find(n => n.type === 'trigger') ?? nodes[0];
  let col = 0;
  while (cur && !seen.has(cur.id)) {
    seen.add(cur.id);
    placed.push({ node: cur, column: col, row: 0 });
    col += 1;
    const next: string | null = cur.type === 'condition'
      ? (cur.yesId ?? cur.nextId ?? null)
      : (cur.nextId ?? null);
    cur = next ? byId.get(next) : undefined;
  }

  /* Then each No branch, under the column after the condition it left. A branch
     that rejoins the spine stops at the join rather than drawing the rest of the
     spine a second time — the arrow back is what says it rejoined. */
  for (const p of placed.filter(x => x.node.type === 'condition')) {
    const noId = p.node.noId;
    if (!noId || seen.has(noId)) continue;
    let b: AutomationNode | undefined = byId.get(noId);
    let bcol = p.column + 1;
    while (b && !seen.has(b.id)) {
      seen.add(b.id);
      placed.push({ node: b, column: bcol, row: 1, from: p.node.id });
      bcol += 1;
      const nx: string | null = b.type === 'condition' ? (b.yesId ?? b.nextId ?? null) : (b.nextId ?? null);
      b = nx ? byId.get(nx) : undefined;
    }
  }

  /* Anything unreachable — a step left disconnected in the builder — still gets
     drawn, on the second row, at the end. Dropping it silently would mean a
     customer who cannot find the step they added concludes it was deleted. */
  for (const n of nodes) {
    if (seen.has(n.id)) continue;
    seen.add(n.id);
    placed.push({ node: n, column: Math.max(0, col), row: 1 });
    col += 1;
  }

  const columns = placed.reduce((m, p) => Math.max(m, p.column + 1), 1);
  return { placed, columns };
}

function Node({ node, dim }: { node: AutomationNode; dim?: boolean }) {
  const look = lookFor(node.type);
  const Ic = look.icon;
  const detail = nodeDetail(node.type, node.config ?? {});

  return (
    <div style={{
      width: 132, background: '#fff', border: `1px solid ${LINE}`, borderRadius: 11,
      padding: '8px 9px', opacity: dim ? 0.75 : 1,
      boxShadow: '0 1px 2px rgba(16,24,40,0.04)',
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 5, marginBottom: 5 }}>
        <span style={{
          width: 17, height: 17, borderRadius: 5, background: look.bg, color: look.fg,
          display: 'inline-flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
        }}><Ic size={10} /></span>
        <span style={{ fontSize: 9.5, fontWeight: 800, color: look.fg, letterSpacing: '0.02em' }}>
          {look.label}
        </span>
      </div>
      <p style={{
        margin: 0, fontSize: 11.5, fontWeight: 700, color: INK, lineHeight: 1.3,
        /* Two lines, then clipped. A step whose name is a paragraph makes every
           other card in the row taller and the shape unreadable. */
        display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden',
      }}>{node.label || look.label}</p>
      {detail && (
        <p style={{
          margin: '2px 0 0', fontSize: 9.5, color: MUTED, lineHeight: 1.35,
          display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden',
        }}>{detail}</p>
      )}
    </div>
  );
}

/** The arrow between two steps. Lit while the workflow is live. */
function Arrow({ live }: { live: boolean }) {
  return (
    <span aria-hidden style={{ display: 'flex', alignItems: 'center', width: 26, flexShrink: 0 }}>
      <span className={live ? 'ap-flow-line' : undefined} style={live ? undefined : {
        flex: 1, height: 2, background: '#e3e6eb', borderRadius: 999,
      }} />
      <span style={{
        width: 0, height: 0, marginLeft: -1,
        borderTop: '3.5px solid transparent', borderBottom: '3.5px solid transparent',
        borderLeft: `5px solid ${live ? '#c7bdf7' : '#d6dae1'}`,
      }} />
    </span>
  );
}

/** The Yes / No labels leaving a condition. */
function Branch({ yes }: { yes: boolean }) {
  return (
    <span style={{
      padding: '1px 7px', borderRadius: 999, fontSize: 9, fontWeight: 800,
      background: yes ? '#dcfce7' : '#fee2e2', color: yes ? '#15803d' : '#b91c1c',
      whiteSpace: 'nowrap',
    }}>{yes ? 'Yes' : 'No'}</span>
  );
}

export default function WorkflowCanvas({
  nodes, live,
}: { nodes: AutomationNode[]; live: boolean }) {
  if (!nodes.length) {
    return (
      <p style={{ margin: 0, fontSize: 12, color: MUTED, padding: '12px 2px' }}>
        This workflow has no steps yet. Open it in the builder to add some.
      </p>
    );
  }

  const { placed, columns } = layout(nodes);
  const spine = placed.filter(p => p.row === 0).sort((a, b) => a.column - b.column);
  const branch = placed.filter(p => p.row === 1).sort((a, b) => a.column - b.column);

  /* A column is a card plus its arrow. Fixed rather than fractional so a long
     workflow scrolls instead of squeezing eleven steps into 900px — the shape
     is the point, and a shape you cannot read is not one. */
  const COL = 158;

  return (
    <div style={{ overflowX: 'auto', paddingBottom: 4 }}>
      <div style={{ minWidth: columns * COL, display: 'grid', gap: 0 }}>
        {/* ── The spine ── */}
        <div style={{ display: 'flex', alignItems: 'stretch' }}>
          {spine.map((p, i) => (
            <Fragment key={p.node.id}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                <Node node={p.node} />
                {p.node.type === 'condition' && (
                  <span style={{ display: 'grid', gap: 3, justifyItems: 'start' }}>
                    <Branch yes />
                    {/* The No pill is drawn even when nothing hangs off it: a
                        condition with one wired path still has two outcomes,
                        and the unwired one ends the workflow. Saying so is the
                        difference between "it stops here" and a silent gap. */}
                    <Branch yes={false} />
                  </span>
                )}
              </div>
              {i < spine.length - 1 && <Arrow live={live} />}
            </Fragment>
          ))}
        </div>

        {/* ── The No branches, under the column after their condition ── */}
        {branch.length > 0 && (
          <div style={{ display: 'flex', alignItems: 'center', marginTop: 10, minHeight: 1 }}>
            {branch.map((p, i) => {
              /* Indented to its own column, so a branch leaving step three sits
                 under step four rather than under the trigger. */
              const gap = i === 0 ? p.column * COL : 0;
              return (
                <Fragment key={p.node.id}>
                  {gap > 0 && <span aria-hidden style={{ width: gap, flexShrink: 0 }} />}
                  {i > 0 && <Arrow live={live} />}
                  <Node node={p.node} dim />
                </Fragment>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
