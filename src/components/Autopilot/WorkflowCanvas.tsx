/**
 * A workflow, drawn left to right the way somebody describes it.
 *
 * ── Why a laid-out graph rather than a list of steps ──
 *
 * The question this answers is "what does this thing actually do to my
 * customers", and the answer is a shape. A branch read as two indented lines is
 * a branch nobody checks; a branch drawn as two paths is one somebody argues
 * with.
 *
 * ── Why this is now positioned, when it used to be a grid ──
 *
 * It was a flex row per path, on the argument that absolute coordinates would
 * draw a prettier curve and be wrong the first time a label wrapped or a font
 * loaded late. That argument was right about the risk and wrong about the
 * trade: the grid could not draw the one line that matters. A No branch sat on
 * the row below its condition with nothing joining the two, and somebody
 * reading it saw a question, some steps floating underneath, and no way to
 * tell which answer led where. That was reported, and it was fair.
 *
 * So every step is now a **fixed-size box** at a computed position, and the
 * connectors are an SVG layer drawn from the graph's own links (`edgesOf`).
 * The fixed size is what answers the old objection: a long label is clamped
 * inside its box rather than resizing it, so nothing a font or a translation
 * does can move a line away from the box it points at. At 390px the whole
 * thing scrolls sideways rather than squeezing, same as before.
 *
 * ── Editing ──
 *
 * Each step carries a pen in its corner when the caller can edit. It opens
 * that step's settings and nothing else — see `StepDrawer`. The map is still
 * not an editor of its own; it hands the step to the one that is.
 */
import { useEffect, useRef, useState } from 'react';
import { Pencil } from 'lucide-react';
import type { WorkflowNode } from '../../services/autopilot';
import { edgesOf, layout, lookFor, nodeDetail, type Edge } from './workflowNodes';
import { branchLabels } from './templateMeta';
import { T, nodeTone } from './theme';

const INK = T.ink;
const MUTED = T.muted;

/** How many runs are standing on a step, and how many have been through it. */
export interface StepState { waiting: number; done: number }

/**
 * The geometry, per size.
 *
 * The gap between columns is wide enough to carry a branch label ("No reply",
 * "Qualified") on the line itself, which is where somebody's eye already is
 * when they are following the path.
 */
const SIZES = {
  compact: { w: 118, h: 86, col: 178, row: 118, pad: 6 },
  full: { w: 142, h: 98, col: 206, row: 132, pad: 8 },
} as const;

type Geo = typeof SIZES[keyof typeof SIZES];

function Node({ node, x, y, geo, dim, state, compact, onEdit }: {
  node: WorkflowNode;
  x: number;
  y: number;
  geo: Geo;
  dim?: boolean;
  /** Real state, from the runs: is anybody standing on this step right now? */
  state?: StepState;
  compact?: boolean;
  onEdit?: (id: string) => void;
}) {
  const look = lookFor(node.type);
  const tone = nodeTone(node.type);
  const Ic = look.icon;
  const detail = nodeDetail(node.type, node.config ?? {});
  const name = node.label || look.label;

  return (
    <div
      onClick={onEdit ? () => onEdit(node.id) : undefined}
      className={state?.waiting ? 'ap-working' : undefined}
      style={{
        position: 'absolute', left: x, top: y, width: geo.w, height: geo.h,
        boxSizing: 'border-box', overflow: 'hidden',
        background: compact ? '#fff' : T.raised,
        border: `1px solid ${tone.edge}`, borderRadius: compact ? 10 : 11,
        padding: compact ? '7px 8px' : '8px 9px',
        opacity: dim ? 0.78 : 1,
        cursor: onEdit ? 'pointer' : 'default',
        boxShadow: '0 1px 2px rgba(16,24,40,0.05)',
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: 5, marginBottom: 4, paddingRight: onEdit ? 18 : 0 }}>
        <span style={{
          width: 17, height: 17, borderRadius: 5, background: tone.bg, color: tone.fg,
          display: 'inline-flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
        }}><Ic size={10} /></span>
        <span style={{
          fontSize: 9.5, fontWeight: 800, color: tone.fg, letterSpacing: '0.02em',
          overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
        }}>{look.label}</span>
      </div>

      {/* The pen. A real button, so it is reachable by keyboard and a screen
          reader hears what pressing it does; the box around it is also
          clickable, for everybody using a mouse, because a 16px target in the
          corner of a 118px box is a fiddly thing to have to hit. */}
      {onEdit && (
        <button
          type="button"
          onClick={e => { e.stopPropagation(); onEdit(node.id); }}
          aria-label={`Edit step: ${name}`}
          title="Edit this step"
          style={{
            position: 'absolute', top: 5, right: 5, width: 20, height: 20, padding: 0,
            display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
            border: `1px solid ${T.line}`, borderRadius: 6, background: '#fff',
            color: T.muted, cursor: 'pointer',
          }}
        ><Pencil size={10} /></button>
      )}

      <p style={{
        margin: 0, fontSize: compact ? 11 : 11.5, fontWeight: 700, color: INK, lineHeight: 1.28,
        display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden',
      }}>{name}</p>

      {!!detail && (
        <p style={{
          margin: '2px 0 0', fontSize: 9.5, color: MUTED, lineHeight: 1.3,
          display: '-webkit-box', WebkitLineClamp: compact ? 1 : 2, WebkitBoxOrient: 'vertical', overflow: 'hidden',
        }}>{detail}</p>
      )}

      {/* What is happening here, counted from real runs standing at this node —
          never a timer. */}
      {!!state?.waiting && (
        <p style={{
          margin: '3px 0 0', fontSize: 9, fontWeight: 800, color: T.accent,
          display: 'flex', alignItems: 'center', gap: 4, whiteSpace: 'nowrap',
        }}>
          <span className="ap-live-dot" style={{ background: T.accent }} />
          {state.waiting} {state.waiting === 1 ? 'person' : 'people'} here now
        </p>
      )}
    </div>
  );
}

/** A label on a condition's outgoing line. */
function Pill({ x, y, text, yes }: { x: number; y: number; text: string; yes: boolean }) {
  return (
    <span style={{
      position: 'absolute', left: x, top: y, transform: 'translate(-50%, -50%)',
      padding: '1px 6px', borderRadius: 999, fontSize: 9, fontWeight: 800, whiteSpace: 'nowrap',
      background: yes ? '#ecfdf5' : '#fef2f2', color: yes ? T.good : T.bad,
      border: `1px solid ${yes ? '#bbf7d0' : '#fecaca'}`, pointerEvents: 'none',
    }}>{text}</span>
  );
}

export default function WorkflowCanvas({
  nodes, live, stepState, compact, onPickStep,
}: {
  nodes: WorkflowNode[];
  live: boolean;
  /** Keyed by node id. Absent means "nothing known", which draws nothing. */
  stepState?: Record<string, StepState>;
  /** The gallery's sizing: narrower, tighter, on white. */
  compact?: boolean;
  /** Called with a step's id when its pen, or the step itself, is pressed. */
  onPickStep?: (id: string) => void;
}) {
  /*
   * Fit to the space, down to a readable floor.
   *
   * A long workflow at full size puts its fork past the right edge, and the
   * fork is the part somebody is trying to understand. So the diagram shrinks
   * to fit the width it has — but never below the size at which a step's name
   * stops being legible, and past that it scrolls. The floor is higher when the
   * steps can be edited, because a pen has to stay big enough to press.
   */
  const box = useRef<HTMLDivElement | null>(null);
  const [room, setRoom] = useState(0);
  useEffect(() => {
    const el = box.current;
    if (!el || typeof ResizeObserver === 'undefined') return;
    const ro = new ResizeObserver(entries => setRoom(entries[0]?.contentRect.width ?? 0));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  if (!nodes.length) {
    return (
      <p style={{ margin: 0, fontSize: 12, color: MUTED, padding: '12px 2px' }}>
        This workflow has no steps yet. Add one to begin.
      </p>
    );
  }

  const geo = compact ? SIZES.compact : SIZES.full;
  const { placed, columns, rows } = layout(nodes);
  const at = new Map(placed.map(p => [p.node.id, p]));
  const pos = (column: number, row: number) => ({ x: geo.pad + column * geo.col, y: geo.pad + row * geo.row });

  /* Room under the last row for a condition's "ends here" stub, and for a line
     that has to route round the bottom to reach a step to its left. */
  const STUB = 30;
  const width = geo.pad * 2 + (columns - 1) * geo.col + geo.w + 40;
  const height = geo.pad * 2 + (rows - 1) * geo.row + geo.h + STUB;
  const bottom = geo.pad + (rows - 1) * geo.row + geo.h + STUB - 8;

  const edges = edgesOf(nodes);
  const pills: { x: number; y: number; text: string; yes: boolean; key: string }[] = [];
  /* Where an outcome that leads nowhere stops, so a dot can say "ends here". */
  const ends: { x: number; y: number; key: string }[] = [];

  /**
   * One connector, as an SVG path.
   *
   * Four shapes, and the choice between them is the whole routing:
   *
   * - **Same row, to the right** — a straight line, which is almost every step.
   * - **A condition's No outcome** — down out of the bottom of the condition
   *   and across into the branch. That is what makes a fork read as a fork: the
   *   Yes path carries on, the No path visibly drops away.
   * - **Anything else to the right** — out, down or up, and in. A branch that
   *   rejoins the spine takes this shape back up.
   * - **To the left** — a loop somebody drew by hand. Routed round the bottom
   *   of everything, so it is visible and never crosses a box.
   */
  const pathFor = (e: Edge): string | null => {
    const s = at.get(e.from);
    if (!s) return null;
    const sp = pos(s.column, s.row);
    const sx = sp.x + geo.w;
    const sy = sp.y + geo.h / 2;
    const cx = sp.x + geo.w / 2;
    const by = sp.y + geo.h;

    const labels = e.branch ? branchLabels(s.node) : null;

    /* An outcome that leads nowhere: a short stub ending in a dot. */
    if (!e.to) {
      if (e.branch === 'no') {
        pills.push({ key: `${e.from}-no`, x: cx, y: by + 13, text: labels!.no, yes: false });
        ends.push({ key: `${e.from}-no-end`, x: cx, y: by + 24 });
        return `M ${cx} ${by} V ${by + 24}`;
      }
      pills.push({ key: `${e.from}-yes`, x: sx + 24, y: sy, text: labels!.yes, yes: true });
      ends.push({ key: `${e.from}-yes-end`, x: sx + 46, y: sy });
      return `M ${sx} ${sy} H ${sx + 46}`;
    }

    const t = at.get(e.to);
    if (!t) return null;
    const tp = pos(t.column, t.row);
    const tx = tp.x;
    const ty = tp.y + geo.h / 2;

    if (e.branch === 'no' && tx > sp.x) {
      pills.push({ key: `${e.from}-no`, x: cx, y: by + 13, text: labels!.no, yes: false });
      return `M ${cx} ${by} V ${ty} H ${tx}`;
    }
    if (e.branch === 'yes') {
      pills.push({ key: `${e.from}-yes`, x: (sx + tx) / 2 < sx + 60 ? (sx + tx) / 2 : sx + 30, y: sy, text: labels!.yes, yes: true });
    }

    if (t.row === s.row && tx > sx) return `M ${sx} ${sy} H ${tx}`;
    if (tx > sx) {
      const mid = sx + Math.min(22, (tx - sx) / 2);
      return `M ${sx} ${sy} H ${mid} V ${ty} H ${tx}`;
    }
    /* To the left: round the bottom. */
    return `M ${sx} ${sy} H ${sx + 12} V ${bottom} H ${tx - 12} V ${ty} H ${tx}`;
  };

  const paths = edges
    .map(e => ({ e, d: pathFor(e) }))
    .filter((x): x is { e: Edge; d: string } => !!x.d);

  const stroke = live ? T.accent : '#c7cedb';
  const floor = onPickStep ? 0.84 : 0.72;
  const scale = room > 0 ? Math.min(1, Math.max(floor, room / width)) : 1;
  const overflows = room > 0 && width * scale > room + 1;

  return (
    <div style={{ position: 'relative' }} ref={box}>
      <div style={{ overflowX: 'auto', paddingBottom: 4 }}>
        {/* The box that takes up the scaled space, so the page lays out around
            what is visible rather than around the unscaled diagram. */}
        <div style={{ width: width * scale, height: height * scale }}>
        <div role="group" aria-label="Workflow diagram"
          style={{
            position: 'relative', width, height,
            transform: scale < 1 ? `scale(${scale})` : undefined, transformOrigin: 'top left',
          }}>
          <svg width={width} height={height} aria-hidden
            style={{ position: 'absolute', inset: 0, overflow: 'visible', pointerEvents: 'none' }}>
            <defs>
              <marker id={`ap-arrow-${live ? 'on' : 'off'}`} viewBox="0 0 8 8" refX="7" refY="4"
                markerWidth="7" markerHeight="7" orient="auto-start-reverse">
                <path d="M 0 0 L 8 4 L 0 8 z" fill={stroke} />
              </marker>
            </defs>
            {paths.map(({ e, d }) => (
              <path
                key={`${e.from}-${e.branch ?? 'n'}-${e.to ?? 'end'}`}
                d={d}
                fill="none"
                stroke={e.branch === 'no' ? (live ? '#f87171' : '#e6b4b4') : stroke}
                strokeWidth={1.6}
                strokeLinejoin="round"
                /* The travelling dash is a class, so reduced motion reaches it. */
                className={live ? 'ap-edge-live' : undefined}
                markerEnd={e.to ? `url(#ap-arrow-${live ? 'on' : 'off'})` : undefined}
              />
            ))}
            {/* "Ends here" dots, where an outcome leads nowhere. */}
            {ends.map(p => <circle key={p.key} cx={p.x} cy={p.y} r={3} fill="#cbd2de" />)}
          </svg>

          {placed.map(p => {
            const { x, y } = pos(p.column, p.row);
            return (
              <Node key={p.node.id} node={p.node} x={x} y={y} geo={geo}
                dim={p.row > 0} compact={compact}
                state={stepState?.[p.node.id]} onEdit={onPickStep} />
            );
          })}

          {pills.map(pl => <Pill key={pl.key} x={pl.x} y={pl.y} text={pl.text} yes={pl.yes} />)}

          {/* An outcome that leads nowhere says so in words. A grey dot alone
              was being read as a rendering glitch rather than as "the workflow
              stops here for these people". */}
          {ends.map(en => (
            <span key={`${en.key}-label`} style={{
              position: 'absolute', left: en.x + 7, top: en.y, transform: 'translateY(-50%)',
              fontSize: 9, fontWeight: 700, color: T.faint, whiteSpace: 'nowrap', pointerEvents: 'none',
            }}>Ends here</span>
          ))}
        </div>
        </div>
      </div>

      {/* A diagram still wider than the space it has says so, rather than
          looking as though it ends mid-step. A hint about the scrollbar. */}
      {overflows && (
        <span aria-hidden style={{
          position: 'absolute', top: 0, right: 0, bottom: 4, width: 36, pointerEvents: 'none',
          background: `linear-gradient(90deg, transparent, ${compact ? T.raised : T.panel})`,
        }} />
      )}
    </div>
  );
}
