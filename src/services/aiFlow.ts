/**
 * Storing, checking and running the campaign graph.
 *
 * The graph is a view onto the campaign, not a second copy of it. Nothing about
 * the strategy, the prospects or the sequence lives here — a node holds its
 * position, its settings and nothing else, and every run reads the real record
 * and calls the service that already owns that step. Delete the graph and the
 * campaign is untouched.
 *
 * Wiring is checked rather than trusted. A port only joins a port of the same
 * name, a node cannot feed itself, an input takes one wire, and a cycle is
 * refused — so a graph that exists is a graph the run can walk.
 */
import { loadCampaigns } from './aiCampaigns';
import {
  NODE_SPECS, type FlowEdge, type FlowGraph, type FlowNode, type FlowNodeKind,
} from '../types/aiFlow';

const KEY = 'crm_ai_flows';

/* ── Store ─────────────────────────────────────────────────────────────── */

function readAll(): FlowGraph[] {
  try {
    const raw = JSON.parse(localStorage.getItem(KEY) || '[]');
    return Array.isArray(raw) ? raw.filter((g: FlowGraph) => g && typeof g.campaignId === 'string') : [];
  } catch { return []; }
}

function writeAll(rows: FlowGraph[]): boolean {
  try { localStorage.setItem(KEY, JSON.stringify(rows)); return true; }
  catch (err) { console.error('The campaign flow could not be saved:', err); return false; }
}

let ids = 0;
export const flowId = (prefix: string) =>
  `${prefix}-${Date.now().toString(36)}-${(ids++).toString(36)}`;

/**
 * The graph every campaign starts with: the seven steps it already runs, laid
 * out left to right and wired in the order they happen.
 */
export function defaultGraph(campaignId: string, now = new Date()): FlowGraph {
  const order: FlowNodeKind[] = ['objective', 'plan', 'prospects', 'build', 'sequence', 'send', 'measure', 'rewrite'];
  const nodes: FlowNode[] = order.map((kind, i) => ({
    id: `n-${kind}`,
    kind,
    /* Two rows, so the chain does not run off the side of a laptop. */
    x: 60 + (i % 4) * 300,
    y: 70 + Math.floor(i / 4) * 260,
    config: kind === 'prospects' ? { source: 'crm' } : undefined,
  }));

  const edges: FlowEdge[] = [];
  for (let i = 1; i < order.length; i++) {
    const from = NODE_SPECS[order[i - 1]].outputs[0];
    const to = NODE_SPECS[order[i]].inputs.find(p => p.id === from?.id);
    if (from && to) {
      edges.push({ id: `e-${i}`, from: `n-${order[i - 1]}`, fromPort: from.id, to: `n-${order[i]}`, toPort: to.id });
    }
  }
  /* Build takes the plan directly as well as the prospects that came from it. */
  edges.push({ id: 'e-plan-build', from: 'n-plan', fromPort: 'strategy', to: 'n-build', toPort: 'strategy' });

  return { campaignId, nodes, edges, updatedAt: now.toISOString() };
}

export function loadGraph(campaignId: string): FlowGraph {
  return readAll().find(g => g.campaignId === campaignId) ?? defaultGraph(campaignId);
}

export function saveGraph(graph: FlowGraph, now = new Date()): boolean {
  const rows = readAll().filter(g => g.campaignId !== graph.campaignId);
  rows.push({ ...graph, updatedAt: now.toISOString() });
  return writeAll(rows);
}

/** Forget one campaign's graph. Used when the campaign itself is deleted. */
export function purgeGraph(campaignId: string): boolean {
  const rows = readAll();
  const kept = rows.filter(g => g.campaignId !== campaignId);
  return kept.length === rows.length ? true : writeAll(kept);
}

/** Drop graphs whose campaign is gone, so storage does not grow for ever. */
export function pruneGraphs(): number {
  const live = new Set(loadCampaigns().map(c => c.id));
  const rows = readAll();
  const kept = rows.filter(g => live.has(g.campaignId));
  if (kept.length !== rows.length) writeAll(kept);
  return rows.length - kept.length;
}

/* ── Wiring rules ──────────────────────────────────────────────────────── */

export interface ConnectCheck {
  ok: boolean;
  /** Why not, in words a person can act on. */
  reason?: string;
}

/**
 * Whether a wire may be drawn.
 *
 * Said out loud rather than silently refused: a user dragging from `leads` to
 * `strategy` should be told the two do not carry the same thing, not watch the
 * wire evaporate.
 */
export function canConnect(
  graph: FlowGraph,
  from: { node: string; port: string },
  to: { node: string; port: string },
): ConnectCheck {
  if (from.node === to.node) return { ok: false, reason: 'A node cannot feed itself.' };

  const source = graph.nodes.find(n => n.id === from.node);
  const target = graph.nodes.find(n => n.id === to.node);
  if (!source || !target) return { ok: false, reason: 'One end of that wire is not on the canvas.' };

  const out = NODE_SPECS[source.kind].outputs.find(p => p.id === from.port);
  const inp = NODE_SPECS[target.kind].inputs.find(p => p.id === to.port);
  if (!out) return { ok: false, reason: `${NODE_SPECS[source.kind].title} has no ${from.port} output.` };
  if (!inp) return { ok: false, reason: `${NODE_SPECS[target.kind].title} does not take ${to.port}.` };
  if (out.id !== inp.id) {
    return { ok: false, reason: `${out.label} and ${inp.label} do not carry the same thing.` };
  }

  /* One wire per input. This also covers joining the same pair twice — that
     wire is already on the input, so there is no separate case for it. */
  if (graph.edges.some(e => e.to === to.node && e.toPort === to.port)) {
    return { ok: false, reason: 'That input already has a wire. Remove it first.' };
  }
  /*
   * A loop cannot currently be drawn — no port carries what an earlier node
   * takes — but a graph is stored data, and stored data is never trusted. Left
   * in so a future node kind, or a file written by another build, cannot get a
   * cycle past the run.
   */
  if (reaches(graph, to.node, from.node)) {
    return { ok: false, reason: 'That would make a loop, and a loop has no order to run in.' };
  }
  return { ok: true };
}

/** Can `to` be reached from `from` by following wires? */
function reaches(graph: FlowGraph, from: string, to: string): boolean {
  const seen = new Set<string>();
  const stack = [from];
  while (stack.length) {
    const at = stack.pop()!;
    if (at === to) return true;
    if (seen.has(at)) continue;
    seen.add(at);
    for (const e of graph.edges) if (e.from === at) stack.push(e.to);
  }
  return false;
}

export function connect(graph: FlowGraph, from: { node: string; port: string }, to: { node: string; port: string }): FlowGraph | null {
  if (!canConnect(graph, from, to).ok) return null;
  return {
    ...graph,
    edges: [...graph.edges, { id: flowId('e'), from: from.node, fromPort: from.port, to: to.node, toPort: to.port }],
  };
}

export function disconnect(graph: FlowGraph, edgeId: string): FlowGraph {
  return { ...graph, edges: graph.edges.filter(e => e.id !== edgeId) };
}

/** Remove a node and every wire that touched it. */
export function removeNode(graph: FlowGraph, nodeId: string): FlowGraph {
  return {
    ...graph,
    nodes: graph.nodes.filter(n => n.id !== nodeId),
    edges: graph.edges.filter(e => e.from !== nodeId && e.to !== nodeId),
  };
}

export function addNode(graph: FlowGraph, kind: FlowNodeKind, at: { x: number; y: number }): FlowGraph | null {
  if (NODE_SPECS[kind].unique && graph.nodes.some(n => n.kind === kind)) return null;
  const node: FlowNode = {
    id: flowId('n'), kind, x: Math.round(at.x), y: Math.round(at.y),
    config: kind === 'prospects' ? { source: 'crm' } : undefined,
  };
  return { ...graph, nodes: [...graph.nodes, node] };
}

export function moveNode(graph: FlowGraph, nodeId: string, at: { x: number; y: number }): FlowGraph {
  return {
    ...graph,
    nodes: graph.nodes.map(n => (n.id === nodeId ? { ...n, x: Math.round(at.x), y: Math.round(at.y) } : n)),
  };
}

export function configureNode(graph: FlowGraph, nodeId: string, config: Record<string, string>): FlowGraph {
  return {
    ...graph,
    nodes: graph.nodes.map(n => (n.id === nodeId ? { ...n, config: { ...n.config, ...config } } : n)),
  };
}

export function toggleNode(graph: FlowGraph, nodeId: string): FlowGraph {
  return {
    ...graph,
    nodes: graph.nodes.map(n => (n.id === nodeId ? { ...n, disabled: !n.disabled } : n)),
  };
}

/* ── Reading the graph ─────────────────────────────────────────────────── */

/**
 * The order a run walks the nodes in.
 *
 * Kahn's algorithm over the wires, so a node never runs before whatever feeds
 * it. Anything left over sat in a cycle, which connect() refuses to create —
 * it is returned rather than dropped so a graph loaded from an older build
 * cannot silently lose steps.
 */
export function runOrder(graph: FlowGraph): { order: FlowNode[]; unreachable: FlowNode[] } {
  const incoming = new Map<string, number>();
  for (const n of graph.nodes) incoming.set(n.id, 0);
  for (const e of graph.edges) {
    if (incoming.has(e.to)) incoming.set(e.to, (incoming.get(e.to) ?? 0) + 1);
  }

  const ready = graph.nodes.filter(n => (incoming.get(n.id) ?? 0) === 0);
  const order: FlowNode[] = [];
  const queue = [...ready];

  while (queue.length) {
    const n = queue.shift()!;
    order.push(n);
    for (const e of graph.edges.filter(x => x.from === n.id)) {
      const left = (incoming.get(e.to) ?? 0) - 1;
      incoming.set(e.to, left);
      if (left === 0) {
        const next = graph.nodes.find(x => x.id === e.to);
        if (next) queue.push(next);
      }
    }
  }

  const placed = new Set(order.map(n => n.id));
  return { order, unreachable: graph.nodes.filter(n => !placed.has(n.id)) };
}

export interface GraphProblem {
  nodeId?: string;
  message: string;
  /** blocking stops a run; worth-knowing does not. */
  severity: 'blocking' | 'worth-knowing';
}

/**
 * What is wrong with the graph as drawn.
 *
 * Shown on the canvas rather than raised when the run fails, because a missing
 * wire is much easier to understand next to the node it is missing from.
 */
export function problems(graph: FlowGraph): GraphProblem[] {
  const out: GraphProblem[] = [];
  const { unreachable } = runOrder(graph);

  for (const n of unreachable) {
    out.push({ nodeId: n.id, severity: 'blocking', message: `${NODE_SPECS[n.kind].title} sits in a loop, so there is no order to run it in.` });
  }

  for (const n of graph.nodes) {
    const spec = NODE_SPECS[n.kind];
    for (const port of spec.inputs) {
      const wired = graph.edges.some(e => e.to === n.id && e.toPort === port.id);
      if (!wired) {
        out.push({
          nodeId: n.id, severity: 'worth-knowing',
          message: `${spec.title} has nothing joined to its ${port.label} input, so a run will skip it.`,
        });
      }
    }
  }

  if (!graph.nodes.some(n => n.kind === 'objective')) {
    out.push({ severity: 'blocking', message: 'There is no Objective node, so nothing tells the graph what it is for.' });
  }
  return out;
}

/** Every node that a run would actually reach and act on. */
export function runnable(graph: FlowGraph): FlowNode[] {
  const { order } = runOrder(graph);
  const fed = new Set<string>();
  const out: FlowNode[] = [];

  for (const n of order) {
    const spec = NODE_SPECS[n.kind];
    const inputsMet = spec.inputs.every(p => {
      const edge = graph.edges.find(e => e.to === n.id && e.toPort === p.id);
      return !!edge && fed.has(edge.from);
    });
    /* A node with no inputs is its own starting point. */
    const reached = spec.inputs.length === 0 || inputsMet;
    if (!reached || n.disabled) continue;
    fed.add(n.id);
    if (spec.runs) out.push(n);
  }
  return out;
}
