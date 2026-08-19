/**
 * Make stored marketing records into ones their builders can open.
 *
 * `crm_sequences` has had more than one writer and more than one shape. The
 * builder saves an `EmailStep` with a `type` ("auto_email", "phone_call",
 * "li_connect"…) and a `body`. Older records — and anything written when a step
 * was only ever an email — carry a `channel` and a `content` instead, or carry
 * neither.
 *
 * The builder then ran `step.type.startsWith('li_')` on one of those and took
 * the whole Marketing screen down, not just the sequence it could not read.
 *
 * So every sequence is put through here on the way in. A step with no type is
 * an email, because that is what a step with only a subject and a body is; a
 * step whose type is a word nobody recognises is also an email, rather than a
 * blank card. Nothing is invented beyond that: the subject, the body and the
 * spacing are whatever the record actually holds.
 *
 * Automations had the same trouble from the same cause — a record written when
 * an automation was a trigger and a list of actions, read by a builder that
 * expects a list of nodes — so they go through the same door.
 */
import type {
  Automation, AutomationNode, AutomationNodeType, EmailSequence, EmailStep, StepType,
} from '../types/marketing';

const TYPES: StepType[] = ['auto_email', 'manual_email', 'phone_call', 'li_connect', 'li_message', 'li_view', 'li_interact'];

function str(v: unknown): string {
  return typeof v === 'string' ? v : '';
}

/** A step the editor can render, whatever the record was written by. */
export function normaliseStep(raw: unknown, index: number): EmailStep {
  const s = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>;

  /* `channel` is the older field name, and only ever held email or sms. */
  const channel = str(s.channel).toLowerCase();
  const declared = str(s.type);
  const type: StepType = TYPES.includes(declared as StepType)
    ? (declared as StepType)
    : channel === 'call' || channel === 'phone'
      ? 'phone_call'
      : 'auto_email';

  const day = Number(s.day);
  return {
    id: str(s.id) || `step-${index + 1}`,
    day: Number.isFinite(day) && day >= 0 ? day : index,
    waitUnit: s.waitUnit === 'hours' ? 'hours' : 'days',
    type,
    subject: str(s.subject),
    /* Older records call the message `content`. */
    body: str(s.body) || str(s.content),
    variantB: s.variantB && typeof s.variantB === 'object'
      ? { subject: str((s.variantB as Record<string, unknown>).subject), body: str((s.variantB as Record<string, unknown>).body) }
      : undefined,
    abEnabled: s.abEnabled === true,
    followUpRule: str(s.followUpRule) || 'reply',
    taskNote: typeof s.taskNote === 'string' ? s.taskNote : undefined,
    taskPriority: s.taskPriority === 'low' || s.taskPriority === 'high' ? s.taskPriority : undefined,
  };
}

export function normaliseSequence(raw: EmailSequence): EmailSequence {
  const steps = Array.isArray(raw?.steps) ? raw.steps : [];
  return {
    ...raw,
    goal: str(raw?.goal),
    status: raw?.status === 'active' || raw?.status === 'paused' ? raw.status : 'draft',
    enrolledCount: Number.isFinite(Number(raw?.enrolledCount)) ? Number(raw.enrolledCount) : 0,
    steps: steps.map(normaliseStep),
  };
}

export function normaliseSequences(raw: EmailSequence[] | undefined): EmailSequence[] {
  if (!Array.isArray(raw)) return [];
  return raw.filter(s => s && typeof s === 'object' && typeof s.id === 'string').map(normaliseSequence);
}

/* ── Automations ───────────────────────────────────────────────────────── */

const NODE_TYPES: AutomationNodeType[] = [
  'trigger', 'wait', 'condition', 'send_email', 'send_sms',
  'add_tag', 'remove_tag', 'create_task', 'assign_to', 'update_field', 'end',
];

/** Older records name the same things slightly differently. */
const ACTION_ALIASES: Record<string, AutomationNodeType> = {
  email: 'send_email', sms: 'send_sms', tag: 'add_tag', untag: 'remove_tag',
  task: 'create_task', assign: 'assign_to', update: 'update_field', delay: 'wait',
};

function nodeType(raw: unknown): AutomationNodeType {
  const t = typeof raw === 'string' ? raw.toLowerCase() : '';
  if (NODE_TYPES.includes(t as AutomationNodeType)) return t as AutomationNodeType;
  return ACTION_ALIASES[t] ?? 'update_field';
}

/**
 * What to call a node that never carried a label.
 *
 * Whatever the record does say about it comes first — an email step named by
 * its own subject line tells a reader more than "Send email" does.
 */
function label(type: AutomationNodeType, config: Record<string, string>): string {
  const named = config.label || config.name || config.title || config.subject || config.tag;
  if (named) return named;
  return type.replace(/_/g, ' ').replace(/^./, c => c.toUpperCase());
}

function asConfig(raw: unknown): Record<string, string> {
  if (!raw || typeof raw !== 'object') return {};
  const out: Record<string, string> = {};
  for (const [k, v] of Object.entries(raw as Record<string, unknown>)) {
    if (typeof v === 'string' || typeof v === 'number' || typeof v === 'boolean') out[k] = String(v);
  }
  return out;
}

/**
 * The steps of an automation, however the record spells them.
 *
 * A record with real nodes keeps them. One written as a trigger plus a list of
 * actions is turned into the same thing rather than being thrown away — the
 * work somebody set up is still described in there, and losing it to a rename
 * would be worse than reading it.
 */
export function normaliseNodes(raw: Automation): AutomationNode[] {
  const record = raw as unknown as Record<string, unknown>;

  const source: unknown[] = Array.isArray(raw?.nodes) && raw.nodes.length
    ? raw.nodes
    : [
        ...(record.trigger ? [{ type: 'trigger', config: record.trigger }] : []),
        ...(Array.isArray(record.actions) ? (record.actions as unknown[]) : []),
      ];

  if (source.length === 0) return [];

  const built = source.map((item, i) => {
    const n = (item && typeof item === 'object' ? item : {}) as Record<string, unknown>;
    const config = asConfig(n.config ?? n);
    const type = nodeType(n.type);
    return {
      id: typeof n.id === 'string' && n.id ? n.id : `n${i}`,
      type,
      label: typeof n.label === 'string' && n.label ? n.label : label(type, config),
      config,
      nextId: null as string | null,
      ...(typeof n.yesId === 'string' ? { yesId: n.yesId } : {}),
      ...(typeof n.noId === 'string' ? { noId: n.noId } : {}),
    };
  });

  /* Re-thread the chain: an id that was never written cannot be pointed at. */
  return built.map((n, i) => ({ ...n, nextId: i < built.length - 1 ? built[i + 1].id : null }));
}

export function normaliseAutomation(raw: Automation): Automation {
  return {
    ...raw,
    name: str(raw?.name) || 'Untitled automation',
    description: str(raw?.description),
    status: raw?.status === 'active' || raw?.status === 'paused' ? raw.status : 'draft',
    nodes: normaliseNodes(raw),
    enrolledCount: Number.isFinite(Number(raw?.enrolledCount)) ? Number(raw.enrolledCount) : 0,
    completedCount: Number.isFinite(Number(raw?.completedCount)) ? Number(raw.completedCount) : 0,
  };
}

export function normaliseAutomations(raw: Automation[] | undefined): Automation[] {
  if (!Array.isArray(raw)) return [];
  return raw.filter(a => a && typeof a === 'object' && typeof a.id === 'string').map(normaliseAutomation);
}
