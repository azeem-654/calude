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
import type { WorkflowNode } from '../../services/autopilot';
import { layout, lookFor, nodeDetail } from './workflowNodes';

import { T, nodeDark } from './theme';

const INK = T.ink;
const MUTED = T.muted;

function Node({ node, dim }: { node: WorkflowNode; dim?: boolean }) {
  const look = lookFor(node.type);
  /* The dark bed for this kind of step. The light palette's tints are white
     bricks on this ground — see the note in theme.ts. */
  const tone = nodeDark(node.type);
  const Ic = look.icon;
  const detail = nodeDetail(node.type, node.config ?? {});

  return (
    <div style={{
      width: 136, background: T.raised, border: `1px solid ${tone.edge}`, borderRadius: 11,
      padding: '8px 9px', opacity: dim ? 0.72 : 1,
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 5, marginBottom: 5 }}>
        <span style={{
          width: 17, height: 17, borderRadius: 5, background: tone.bg, color: tone.fg,
          display: 'inline-flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
        }}><Ic size={10} /></span>
        <span style={{ fontSize: 9.5, fontWeight: 800, color: tone.fg, letterSpacing: '0.02em' }}>
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
        flex: 1, height: 2, background: T.line, borderRadius: 999,
      }} />
      <span style={{
        width: 0, height: 0, marginLeft: -1,
        borderTop: '3.5px solid transparent', borderBottom: '3.5px solid transparent',
        borderLeft: `5px solid ${live ? T.accent : T.line}`,
      }} />
    </span>
  );
}

/** The Yes / No labels leaving a condition. */
function Branch({ yes }: { yes: boolean }) {
  return (
    <span style={{
      padding: '1px 7px', borderRadius: 999, fontSize: 9, fontWeight: 800,
      background: yes ? 'rgba(52,211,153,0.16)' : 'rgba(248,113,113,0.16)',
      color: yes ? T.good : T.bad,
      whiteSpace: 'nowrap',
    }}>{yes ? 'Yes' : 'No'}</span>
  );
}

export default function WorkflowCanvas({
  nodes, live,
}: { nodes: WorkflowNode[]; live: boolean }) {
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
