/**
 * Tidying a canvas: aligning, spreading and laying out.
 *
 * Pure functions over the graph, so the arithmetic that decides where a node
 * lands can be checked without a browser. The canvas calls these and saves the
 * result like any other edit, which means undo covers them for free.
 */
import { runOrder } from './aiFlow';
import type { FlowGraph, FlowNode } from '../types/aiFlow';

/** The size a node occupies on the canvas, matching the card in the editor. */
export const NODE_W = 216;
export const NODE_H = 118;

export type Align = 'left' | 'centre-x' | 'right' | 'top' | 'middle-y' | 'bottom';

const pick = (graph: FlowGraph, ids: string[]) => graph.nodes.filter(n => ids.includes(n.id));

const put = (graph: FlowGraph, moved: Map<string, { x: number; y: number }>): FlowGraph => ({
  ...graph,
  nodes: graph.nodes.map(n => {
    const at = moved.get(n.id);
    return at ? { ...n, x: Math.round(at.x), y: Math.round(at.y) } : n;
  }),
});

/**
 * Line up the chosen nodes on one edge.
 *
 * Aligning fewer than two is a no-op rather than an error: it is what a person
 * asking to align one thing would expect, and refusing would be pedantic.
 */
export function align(graph: FlowGraph, ids: string[], how: Align): FlowGraph {
  const chosen = pick(graph, ids);
  if (chosen.length < 2) return graph;

  const left = Math.min(...chosen.map(n => n.x));
  const right = Math.max(...chosen.map(n => n.x + NODE_W));
  const top = Math.min(...chosen.map(n => n.y));
  const bottom = Math.max(...chosen.map(n => n.y + NODE_H));
  const midX = (left + right) / 2;
  const midY = (top + bottom) / 2;

  const moved = new Map<string, { x: number; y: number }>();
  for (const n of chosen) {
    switch (how) {
      case 'left': moved.set(n.id, { x: left, y: n.y }); break;
      case 'right': moved.set(n.id, { x: right - NODE_W, y: n.y }); break;
      case 'centre-x': moved.set(n.id, { x: midX - NODE_W / 2, y: n.y }); break;
      case 'top': moved.set(n.id, { x: n.x, y: top }); break;
      case 'bottom': moved.set(n.id, { x: n.x, y: bottom - NODE_H }); break;
      case 'middle-y': moved.set(n.id, { x: n.x, y: midY - NODE_H / 2 }); break;
    }
  }
  return put(graph, moved);
}

/**
 * Even gaps between the chosen nodes along one axis.
 *
 * The outermost two stay where they are and everything between them is spread
 * evenly, which is what makes it predictable — a distribute that also moves the
 * ends shifts the whole group and looks like a bug.
 */
export function distribute(graph: FlowGraph, ids: string[], axis: 'x' | 'y'): FlowGraph {
  const chosen = pick(graph, ids);
  if (chosen.length < 3) return graph;

  const sorted = [...chosen].sort((a, b) => (axis === 'x' ? a.x - b.x : a.y - b.y));
  const first = sorted[0];
  const last = sorted[sorted.length - 1];
  const span = axis === 'x' ? last.x - first.x : last.y - first.y;
  const step = span / (sorted.length - 1);

  const moved = new Map<string, { x: number; y: number }>();
  sorted.forEach((n, i) => {
    if (i === 0 || i === sorted.length - 1) return;
    moved.set(n.id, axis === 'x'
      ? { x: first.x + step * i, y: n.y }
      : { x: n.x, y: first.y + step * i });
  });
  return put(graph, moved);
}

/**
 * Lay the whole graph out in the order it runs.
 *
 * Columns are the depth from a node with no inputs, so anything that feeds
 * something else sits to its left. Two nodes at the same depth stack instead of
 * overlapping. The result is the shape the campaign actually has, which is more
 * use than a prettier arrangement that hides it.
 */
export function tidy(graph: FlowGraph, opts: { perRow?: number } = {}): FlowGraph {
  const { order } = runOrder(graph);
  if (!order.length) return graph;

  const depth = new Map<string, number>();
  for (const n of order) {
    const feeders = graph.edges.filter(e => e.to === n.id);
    const d = feeders.length
      ? Math.max(...feeders.map(e => (depth.get(e.from) ?? 0) + 1))
      : 0;
    depth.set(n.id, d);
  }

  /* Wrapping keeps a long chain on screen instead of running off the side. */
  const perRow = Math.max(2, opts.perRow ?? 4);
  const gapX = NODE_W + 84;
  const gapY = NODE_H + 132;
  const rowOf = new Map<number, number>();

  const moved = new Map<string, { x: number; y: number }>();
  for (const n of order) {
    const d = depth.get(n.id) ?? 0;
    const column = d % perRow;
    const row = Math.floor(d / perRow);
    /* Nodes sharing a column stack downward within their row band. */
    const stacked = rowOf.get(d) ?? 0;
    rowOf.set(d, stacked + 1);
    moved.set(n.id, { x: 60 + column * gapX, y: 60 + row * gapY * 1.6 + stacked * gapY });
  }

  /* Anything in a cycle is left where it is rather than piled at the origin. */
  return put(graph, moved);
}

/** Snap the chosen nodes to a grid. */
export function snap(graph: FlowGraph, ids: string[], size = 20): FlowGraph {
  const moved = new Map<string, { x: number; y: number }>();
  for (const n of pick(graph, ids)) {
    moved.set(n.id, { x: Math.round(n.x / size) * size, y: Math.round(n.y / size) * size });
  }
  return put(graph, moved);
}

/** Copy the chosen nodes, offset a little so the copies are visible. */
export function duplicate(
  graph: FlowGraph,
  ids: string[],
  newId: (kind: string) => string,
  uniqueKinds: (kind: string) => boolean,
): { graph: FlowGraph; added: string[]; refused: string[] } {
  const added: string[] = [];
  const refused: string[] = [];
  const nodes: FlowNode[] = [...graph.nodes];

  for (const n of pick(graph, ids)) {
    if (uniqueKinds(n.kind)) { refused.push(n.kind); continue; }
    const id = newId(n.kind);
    nodes.push({ ...n, id, x: n.x + 36, y: n.y + 36, config: n.config ? { ...n.config } : undefined });
    added.push(id);
  }
  return { graph: { ...graph, nodes }, added, refused };
}

/** The box around a set of nodes, for fitting the view to a selection. */
export function bounds(graph: FlowGraph, ids?: string[]) {
  const set = ids?.length ? pick(graph, ids) : graph.nodes;
  if (!set.length) return null;
  return {
    minX: Math.min(...set.map(n => n.x)),
    minY: Math.min(...set.map(n => n.y)),
    maxX: Math.max(...set.map(n => n.x + NODE_W)),
    maxY: Math.max(...set.map(n => n.y + NODE_H)),
  };
}
