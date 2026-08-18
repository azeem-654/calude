/**
 * The AI Sales Agent as a graph.
 *
 * The campaign already had an order to it — work out a plan, find prospects,
 * build the records, send, read the figures, rewrite what is failing — but that
 * order was implied by a row of tabs. This makes it a thing on a canvas: nodes
 * you can move, ports you can join, and a run that follows the wires.
 *
 * Every node kind here maps to something the module already does. There is no
 * node for a step that does not exist, because a canvas full of boxes that do
 * nothing is a diagram pretending to be software.
 */

export type FlowNodeKind =
  /** The sentence the customer wrote. The graph starts here. */
  | 'objective'
  /** Work out the strategy from the objective. */
  | 'plan'
  /** Search a source for prospects and qualify them against the plan. */
  | 'prospects'
  /** Turn qualified prospects into real contacts, a real sequence, enrolments. */
  | 'build'
  /** The live sequence in Marketing: its steps, its status. */
  | 'sequence'
  /** What actually goes out, and the daily cap it goes out inside. */
  | 'send'
  /** Sent, opened, replied, booked — read from the modules that own them. */
  | 'measure'
  /** Diagnose the failing half of the funnel and propose new wording. */
  | 'rewrite';

export interface PortSpec {
  id: string;
  label: string;
}

export interface NodeSpec {
  kind: FlowNodeKind;
  title: string;
  subtitle: string;
  /** Ports on the left, in the order they are drawn. */
  inputs: PortSpec[];
  /** Ports on the right. */
  outputs: PortSpec[];
  /** Whether running the graph does anything at this node. */
  runs: boolean;
  /** Only one of these may exist in a graph. */
  unique?: boolean;
}

/**
 * What every kind is, in one table.
 *
 * The port names are the vocabulary of the wires: a `strategy` output only
 * joins a `strategy` input, so a graph cannot be wired into a shape the run
 * would not know what to do with.
 */
export const NODE_SPECS: Record<FlowNodeKind, NodeSpec> = {
  objective: {
    kind: 'objective', title: 'Objective', subtitle: 'What you asked for',
    inputs: [], outputs: [{ id: 'objective', label: 'objective' }],
    runs: false, unique: true,
  },
  plan: {
    kind: 'plan', title: 'Plan', subtitle: 'Who, what, how often',
    inputs: [{ id: 'objective', label: 'objective' }],
    outputs: [{ id: 'strategy', label: 'strategy' }],
    runs: true, unique: true,
  },
  prospects: {
    kind: 'prospects', title: 'Prospects', subtitle: 'Search and qualify',
    inputs: [{ id: 'strategy', label: 'strategy' }],
    outputs: [{ id: 'leads', label: 'leads' }],
    runs: true,
  },
  build: {
    kind: 'build', title: 'Build', subtitle: 'Create the real records',
    inputs: [{ id: 'strategy', label: 'strategy' }, { id: 'leads', label: 'leads' }],
    outputs: [{ id: 'records', label: 'records' }],
    runs: true, unique: true,
  },
  sequence: {
    kind: 'sequence', title: 'Sequence', subtitle: 'The live cadence',
    inputs: [{ id: 'records', label: 'records' }],
    outputs: [{ id: 'sends', label: 'sends' }],
    runs: false, unique: true,
  },
  send: {
    kind: 'send', title: 'Send', subtitle: 'Inside your daily cap',
    inputs: [{ id: 'sends', label: 'sends' }],
    outputs: [{ id: 'activity', label: 'activity' }],
    runs: false, unique: true,
  },
  measure: {
    kind: 'measure', title: 'Measure', subtitle: 'Read from the owners',
    inputs: [{ id: 'activity', label: 'activity' }],
    outputs: [{ id: 'figures', label: 'figures' }],
    runs: false, unique: true,
  },
  rewrite: {
    kind: 'rewrite', title: 'Rewrite', subtitle: 'Fix the half that failed',
    inputs: [{ id: 'figures', label: 'figures' }],
    outputs: [],
    runs: true, unique: true,
  },
};

export interface FlowNode {
  id: string;
  kind: FlowNodeKind;
  /** Canvas coordinates, not screen ones. */
  x: number;
  y: number;
  /** Per-kind settings — e.g. which source a Prospects node searches. */
  config?: Record<string, string>;
  /** Left in place but skipped by a run. */
  disabled?: boolean;
}

export interface FlowEdge {
  id: string;
  from: string;
  fromPort: string;
  to: string;
  toPort: string;
}

export interface FlowGraph {
  campaignId: string;
  nodes: FlowNode[];
  edges: FlowEdge[];
  updatedAt: string;
}

/** What a run did at one node, in the words the activity log uses. */
export interface FlowStepResult {
  nodeId: string;
  kind: FlowNodeKind;
  ok: boolean;
  summary: string;
  detail?: string;
}

export interface FlowRunResult {
  ok: boolean;
  steps: FlowStepResult[];
  /** Why the run stopped early, when it did. */
  stoppedBecause?: string;
}
