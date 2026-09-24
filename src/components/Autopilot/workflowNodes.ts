/**
 * How a workflow step looks, in one place.
 *
 * Two screens draw the same graph — the compact chain inside a project's
 * settings panel, and the full canvas on the Autopilot hub — and a palette
 * defined twice is a palette that disagrees with itself the first time either
 * is touched. A customer who has learned that purple means "the AI does this"
 * has learned it everywhere or nowhere.
 */
import {
  Zap, Clock, GitBranch, Mail, MessageSquare, Tag, Check, User, Edit2, X,
  Bot, Workflow, type LucideIcon,
} from 'lucide-react';
import type { WorkflowNode } from '../../services/autopilot';

export interface NodeLook {
  icon: LucideIcon;
  /** The type's colour: the icon, the label, and the connector leaving it. */
  fg: string;
  /** The tint behind the icon. Deliberately pale — a wall of saturated cards
   *  is unreadable at six nodes, which is the ordinary length of one of these. */
  bg: string;
  /** What this step is called, in the customer's words rather than the code's. */
  label: string;
}

export const NODE_LOOK: Record<string, NodeLook> = {
  trigger:      { icon: Zap,            fg: '#7c3aed', bg: '#f5f3ff', label: 'Trigger' },
  /* The one that needed a name of its own. A step the model writes is not the
     same promise as a step the product performs, and somebody deciding whether
     to trust a workflow needs to see which is which at a glance. */
  ai:           { icon: Bot,            fg: '#7c3aed', bg: '#f5f3ff', label: 'AI Agent' },
  wait:         { icon: Clock,          fg: '#db2777', bg: '#fdf2f8', label: 'Delay' },
  condition:    { icon: GitBranch,      fg: '#c2410c', bg: '#fff7ed', label: 'Condition' },
  send_email:   { icon: Mail,           fg: '#2563eb', bg: '#eff6ff', label: 'Email' },
  send_sms:     { icon: MessageSquare,  fg: '#0d9488', bg: '#f0fdfa', label: 'SMS' },
  add_tag:      { icon: Tag,            fg: '#16a34a', bg: '#f0fdf4', label: 'Action' },
  remove_tag:   { icon: Tag,            fg: '#dc2626', bg: '#fef2f2', label: 'Action' },
  create_task:  { icon: Check,          fg: '#16a34a', bg: '#f0fdf4', label: 'Action' },
  assign_to:    { icon: User,           fg: '#0369a1', bg: '#eff6ff', label: 'Action' },
  update_field: { icon: Edit2,          fg: '#475569', bg: '#f8fafc', label: 'Action' },
  end:          { icon: X,              fg: '#64748b', bg: '#f8fafc', label: 'End' },
};

export const lookFor = (type: string): NodeLook =>
  NODE_LOOK[type] ?? { icon: Workflow, fg: '#64748b', bg: '#f4f5f7', label: type.replace(/_/g, ' ') };

/* ── What an AI agent reads, and what it makes ───────────────────────────────
 *
 * One table, because four things read it: the step's form, the line under its
 * name, the dry run, and the Assets tab. A label typed in four places is a
 * label that says "News feed" on one screen and "RSS" on the next.
 *
 * The Worker has its own copy of the *behaviour* — `worker/src/lib/
 * projectAgents.ts` — for the same reason `fillTokens` is duplicated: the
 * bundle and the Worker are separate builds. What is here is only the wording
 * and the routes, neither of which the Worker needs to agree with, except the
 * routes below, which it writes into the link on each run.
 */

export interface AgentSource {
  label: string;
  /** The one line under it in the picker. */
  hint: string;
  /** Does it need an address pasting in? */
  needsUrl: boolean;
  /** Does it need a question written for it? The web search does. */
  needsPrompt?: boolean;
  urlLabel?: string;
  urlHint?: string;
  urlPlaceholder?: string;
}

export const AGENT_SOURCES: Record<string, AgentSource> = {
  portfolio: {
    label: "The client's own portfolio",
    hint: 'What they do, what they sell and who buys it — the profile on this project.',
    needsUrl: false,
  },
  rss: {
    label: 'A news feed',
    hint: 'Any RSS or Atom feed. It writes about what appeared since it last ran, and skips a morning when nothing did.',
    needsUrl: true,
    urlLabel: 'Feed address',
    urlHint: 'The feed itself, not the page it sits on — usually ends in /feed or /rss.xml.',
    urlPlaceholder: 'https://example.com/feed',
  },
  website: {
    label: 'A web page',
    hint: 'Any page — a company\u2019s news page, a competitor\u2019s offers, a council\u2019s notices. Read as it stands each time; an unchanged page is skipped, not rewritten.',
    needsUrl: true,
    urlLabel: 'Web address',
    urlHint: 'The page itself. It has to be readable without logging in.',
    urlPlaceholder: 'https://example.com/news',
  },
  web: {
    label: 'A web search',
    hint: 'A question, researched with Google Search each time it runs. It writes only from pages it actually found, and says which.',
    needsUrl: false,
    needsPrompt: true,
  },
  youtube: {
    label: 'A YouTube channel',
    hint: 'Turns new videos into posts. Needs the channel ID rather than a handle — YouTube only publishes a feed for the ID.',
    needsUrl: true,
    urlLabel: 'Channel ID',
    urlHint: 'Starts with UC. Open the channel, click a video, then "…more" under the description.',
    urlPlaceholder: 'UCxxxxxxxxxxxxxxxxxxxxxx',
  },
};

export interface AgentOutput {
  label: string;
  /** Where the finished thing lands, named as the customer knows it. */
  where: string;
  route: string;
}

export const AGENT_OUTPUTS: Record<string, AgentOutput> = {
  social: { label: 'Social posts, as images', where: 'Social Creator', route: '/social-creator' },
  blog: { label: 'A blog post', where: 'Blog', route: '/blog-automation' },
  email_campaign: { label: 'An email campaign', where: 'Campaigns', route: '/marketing?tab=sequences' },
};

/** How often a scheduled workflow runs, in the words on the form. */
export const CADENCES: Record<string, string> = {
  daily: 'Every day',
  weekly: 'Every week',
  monthly: 'Every month',
};

/**
 * The line under a step's name: what it will actually do, from its own config.
 *
 * Read from the config rather than from the label, because the label is
 * editable and the config is what runs. A workflow whose step is called
 * "Welcome" and whose subject line was changed last week should say the subject
 * line — that is the thing somebody is checking when they look.
 */
export function nodeDetail(type: string, config: Record<string, string> = {}): string {
  const c = (k: string) => String(config[k] ?? '').trim();

  if (type === 'trigger') {
    /* A schedule reads as a schedule. "schedule — daily" is the code's words;
       "Every day" is what somebody set. */
    if (c('event') === 'schedule') return CADENCES[c('cadence')] ?? CADENCES.daily;
    const ev = c('event').replace(/_/g, ' ');
    const named = c('formName') || c('tag');
    return named ? `${ev} — ${named}` : ev;
  }
  if (type === 'ai') {
    const src = AGENT_SOURCES[c('source') || 'portfolio'];
    const out = AGENT_OUTPUTS[c('produces') || 'social'];
    if (!src || !out) return 'Not set up yet';
    const n = Number(c('count'));
    const many = c('produces') === 'email_campaign'
      ? `${Math.max(Number(c('campaignSteps')) || 7, 2)} emails`
      : n > 1 ? `${n} ${out.label.toLowerCase()}` : out.label.toLowerCase();
    return `Reads ${src.label.toLowerCase()} → ${many} → ${out.where}`;
  }
  if (type === 'wait') {
    const bits = [
      Number(c('days')) > 0 ? `${Number(c('days'))} day${Number(c('days')) === 1 ? '' : 's'}` : '',
      Number(c('hours')) > 0 ? `${Number(c('hours'))} hour${Number(c('hours')) === 1 ? '' : 's'}` : '',
      Number(c('minutes')) > 0 ? `${Number(c('minutes'))} min` : '',
    ].filter(Boolean);
    /* The engine's own default, said out loud. A wait with nothing set is a day,
       and a blank line here would leave somebody guessing at it. */
    return bits.length ? `Wait ${bits.join(' ')}` : 'Wait 1 day';
  }
  if (type === 'condition') {
    const f = c('field');
    const op = c('operator') || 'equals';
    const v = c('value');
    if (!f) return 'No condition set';
    if (op === 'is_set') return `${f} is set`;
    if (op === 'is_empty') return `${f} is empty`;
    return `${f} ${op.replace(/_/g, ' ')} ${v}`.trim();
  }
  if (type === 'send_email') return c('subject') || 'No subject set';
  if (type === 'send_sms') return (c('message') || c('body') || 'No message set').slice(0, 80);
  if (type === 'add_tag' || type === 'remove_tag') return c('tag') ? `Tag: ${c('tag')}` : 'No tag named';
  if (type === 'create_task') return c('title') || c('text') || 'Follow up';
  if (type === 'assign_to') return c('user') || c('assignee') || 'Nobody named';
  if (type === 'update_field') return c('field') ? `Set ${c('field')}` : 'No field named';
  return '';
}

/**
 * Which part of the business a workflow belongs to, for the filter row.
 *
 * Derived from what its steps do rather than stored, because a field somebody
 * has to remember to set is a field that is wrong on half the rows. A workflow
 * that emails is Marketing; one that only writes or tags is Content; one that
 * moves a deal is Sales. A workflow doing several is filed under the one that
 * costs the most to get wrong, which is the one that sends.
 */
export type WorkflowGroup = 'marketing' | 'content' | 'sales';

export function groupOf(nodes: { type: string; config?: Record<string, string> }[]): WorkflowGroup {
  const has = (t: string) => nodes.some(n => n.type === t);
  /* An agent writing a campaign is filed under Marketing even though it sends
     nothing itself: what it produces is a list of emails, and that is what
     somebody is looking for when they filter. */
  if (nodes.some(n => n.type === 'ai' && n.config?.produces === 'email_campaign')) return 'marketing';
  if (has('send_email') || has('send_sms')) return 'marketing';
  if (has('assign_to') || has('create_task')) return 'sales';
  return 'content';
}

export const GROUP_LABEL: Record<WorkflowGroup, string> = {
  marketing: 'Marketing',
  content: 'Content',
  sales: 'Sales',
};

/**
 * Turn an ordered list of steps into a chain the engine can walk.
 *
 * The AI writer returns steps in order and nothing else — no ids, no `nextId`.
 * Saved as they arrive, every node points at nothing, and the engine carries
 * out the first step and stops: a workflow that looks complete on the canvas
 * and does exactly one thing.
 *
 * Shared rather than written twice. The builder has always done this and the
 * hub needs the identical rule, and two copies of "what does next mean" is the
 * kind of thing that diverges silently and is then very hard to see.
 */
export function chain<T extends { id: string }>(raw: T[]): (T & { nextId: string | null })[] {
  return raw.map((n, idx) => ({
    ...n,
    nextId: idx < raw.length - 1 ? raw[idx + 1].id : null,
  }));
}

/**
 * What is wrong with this graph, in the customer's terms.
 *
 * Exported because it is the whole judgement about whether a workflow can run,
 * and it is far easier to argue with as a function than through a form.
 */
export function problemsWith(name: string, nodes: WorkflowNode[]): string[] {
  const out: string[] = [];
  if (!name.trim()) out.push('Give the workflow a name.');
  if (!nodes.some(n => n.type === 'trigger')) out.push('It has no trigger, so nothing would ever start it.');
  if (nodes.length < 2) out.push('It needs at least one step after the trigger.');

  /* ── A workflow on a schedule is a different animal ──
     It runs with nobody in it, so a send step in one has no address to send to.
     Caught here rather than at run time, where it would be a line in a log
     somebody never reads. */
  const scheduled = nodes.some(n => n.type === 'trigger' && n.config?.event === 'schedule');
  if (scheduled) {
    if (!nodes.some(n => n.type === 'ai')) {
      out.push('This runs on a schedule with nobody in it, so it needs an AI agent step — there is nothing else here for it to do.');
    }
    for (const n of nodes) {
      if (n.type === 'send_email' || n.type === 'send_sms') {
        out.push(`"${n.label || lookFor(n.type).label}" sends to a person, and a workflow on a schedule has no person in it. It would be stepped over.`);
      }
    }
  }

  for (const n of nodes) {
    const label = n.label || lookFor(n.type).label;
    /* The two that reach a real person with nothing in them. A blank email is
       worse than no email, and it is the kind of thing found in a delivery log
       rather than in a builder. */
    if (n.type === 'send_email' && !String(n.config.subject ?? '').trim()) {
      out.push(`"${label}" has no subject, so it would send a blank email.`);
    }
    if (n.type === 'send_sms' && !String(n.config.message ?? '').trim()) {
      out.push(`"${label}" has no message, so it would send an empty text.`);
    }
    if (n.type === 'condition' && !String(n.config.field ?? '').trim()) {
      out.push(`"${label}" has nothing to test, so it would always take the No branch.`);
    }
    if ((n.type === 'add_tag' || n.type === 'remove_tag') && !String(n.config.tag ?? '').trim()) {
      out.push(`"${label}" has no tag named.`);
    }
    if (n.type === 'ai') {
      const src = AGENT_SOURCES[String(n.config.source ?? 'portfolio')];
      if (!src) {
        out.push(`"${label}" has no source to read, so it has nothing to write from.`);
      } else if (src.needsUrl && !String(n.config.sourceUrl ?? '').trim()) {
        out.push(`"${label}" reads ${src.label.toLowerCase()} but no address is set.`);
      } else if (src.needsPrompt && String(n.config.sourcePrompt ?? '').trim().length < 6) {
        out.push(`"${label}" searches the web but has no question to search for.`);
      }
      if (!AGENT_OUTPUTS[String(n.config.produces ?? 'social')]) {
        out.push(`"${label}" does not say what it should produce.`);
      }
    }
  }
  return out;
}

/** One step, and where it sits. */
interface Placed {
  node: WorkflowNode;
  column: number;
  /** 0 is the spine; every branch gets a row of its own beneath it. */
  row: number;
  /** The condition this branch left, so its connector can be drawn. */
  from?: string;
}

/** The next step along the path a step is on, ignoring any No branch. */
const onward = (n: WorkflowNode): string | null =>
  n.type === 'condition' ? (n.yesId ?? n.nextId ?? null) : (n.nextId ?? null);

/**
 * Walk the graph into rows and columns.
 *
 * ── The rule ──
 *
 * The spine is row 0: the path a person takes when every condition answers
 * Yes, which is the story the workflow is about and the one somebody pictures
 * when they describe it. **Every No branch gets a row of its own**, starting in
 * the column after the condition it leaves.
 *
 * It used to be one shared second row for every branch. That was fine for the
 * one-condition workflows the product started with and wrong for everything
 * since: two branches landed on the same row, and a condition *inside* a branch
 * never had its own No path laid out at all — those steps fell through to the
 * "unreachable" pile at the end and were drawn as though disconnected, which
 * is the exact failure somebody reported. A row per branch, found breadth
 * first, keeps any number of forks legible.
 *
 * A branch that rejoins stops at the join rather than drawing the rest of the
 * spine a second time; the connector back is what says it rejoined.
 *
 * Exported so it can be argued with directly: the interesting cases are a graph
 * that points back at itself, a branch that rejoins, and a fork inside a fork,
 * and all three are far easier to reason about as data than as pixels.
 */
export function layout(nodes: WorkflowNode[]): { placed: Placed[]; columns: number; rows: number } {
  const byId = new Map(nodes.map(n => [n.id, n]));
  const placed: Placed[] = [];
  const seen = new Set<string>();
  const queue: Placed[] = [];

  const walk = (startId: string | null | undefined, column: number, row: number, from?: string) => {
    let cur: WorkflowNode | undefined = startId ? byId.get(startId) : undefined;
    let col = column;
    let first = true;
    while (cur && !seen.has(cur.id)) {
      seen.add(cur.id);
      const p: Placed = { node: cur, column: col, row, ...(first && from ? { from } : {}) };
      placed.push(p);
      /* Queued rather than recursed into, so every branch of the spine is laid
         out before any branch of a branch — which is what keeps the rows in the
         order somebody reads them, top to bottom. */
      if (cur.type === 'condition') queue.push(p);
      first = false;
      col += 1;
      const next = onward(cur);
      cur = next ? byId.get(next) : undefined;
    }
    return col;
  };

  /* The spine. */
  const root = nodes.find(n => n.type === 'trigger') ?? nodes[0];
  let endCol = root ? walk(root.id, 0, 0) : 0;
  let nextRow = 1;

  /* Then each No branch, breadth first, each on a row of its own. */
  while (queue.length) {
    const c = queue.shift()!;
    const noId = c.node.noId;
    if (!noId || seen.has(noId)) continue;
    walk(noId, c.column + 1, nextRow, c.node.id);
    nextRow += 1;
  }

  /* Anything unreachable — a step left disconnected in the builder — still
     gets drawn, on a row of its own at the end. Dropping it silently would mean
     a customer who cannot find the step they added concludes it was deleted. */
  const orphans = nodes.filter(n => !seen.has(n.id));
  if (orphans.length) {
    const row = nextRow;
    for (const n of orphans) {
      if (seen.has(n.id)) continue;
      endCol = walk(n.id, Math.max(0, endCol), row);
    }
    nextRow += 1;
  }

  const columns = placed.reduce((m, p) => Math.max(m, p.column + 1), 1);
  const rows = placed.reduce((m, p) => Math.max(m, p.row + 1), 1);
  return { placed, columns, rows };
}

/** One connector between two steps, or from a condition to where it ends. */
export interface Edge {
  from: string;
  /** Null when this outcome of a condition leads nowhere — the workflow ends. */
  to: string | null;
  /** Set on a condition's two outcomes; absent on an ordinary next step. */
  branch?: 'yes' | 'no';
}

/**
 * Every link in the graph, as something to draw.
 *
 * ── Why this is its own function ──
 *
 * The canvas used to infer its arrows from which boxes sat side by side on a
 * row. That drew the spine and nothing else: the line from a condition down to
 * the branch it starts was never drawn, because the two boxes were never next
 * to each other. Somebody reading it saw a condition, and some steps floating
 * on the row below, and no way to tell which outcome led where.
 *
 * So the lines come from the links themselves — `nextId`, `yesId`, `noId` —
 * the same fields the engine follows. A line on the screen is a path a person
 * can actually take, and a path a person can take has a line.
 *
 * A condition always yields both of its outcomes, even when one leads nowhere.
 * An unwired outcome is not an absence: it is where the workflow *ends* for the
 * people who answer that way, and drawing nothing there is how somebody misses
 * that half their contacts drop out at step four.
 */
export function edgesOf(nodes: WorkflowNode[]): Edge[] {
  const ids = new Set(nodes.map(n => n.id));
  const out: Edge[] = [];
  for (const n of nodes) {
    if (n.type === 'condition') {
      const yes = n.yesId ?? n.nextId ?? null;
      out.push({ from: n.id, to: yes && ids.has(yes) ? yes : null, branch: 'yes' });
      out.push({ from: n.id, to: n.noId && ids.has(n.noId) ? n.noId : null, branch: 'no' });
    } else if (n.nextId && ids.has(n.nextId)) {
      out.push({ from: n.id, to: n.nextId });
    }
  }
  return out;
}

/* ── What a step would actually do, before it does it ──────────────────────── */

/**
 * How long a wait step waits, in milliseconds.
 *
 * The same rules as `waitMs` in `worker/src/lib/automationEngine.ts`, including
 * both defaults that a builder would otherwise have to discover by watching:
 * nothing set means a day, and anything over 180 days is clamped — a "wait 365"
 * meant as hours would otherwise park somebody in a workflow for a year.
 *
 * Duplicated for the same reason as `fillTokens` above, and kept to the same
 * few lines so the two cannot quietly disagree.
 */
export function waitMs(config: Record<string, string> = {}): number {
  const n = (k: string) => Number(config[k]);
  let ms = 0;
  if (Number.isFinite(n('days')) && n('days') > 0) ms += n('days') * 86_400_000;
  if (Number.isFinite(n('hours')) && n('hours') > 0) ms += n('hours') * 3_600_000;
  if (Number.isFinite(n('minutes')) && n('minutes') > 0) ms += n('minutes') * 60_000;
  return Math.min(ms || 86_400_000, 180 * 86_400_000);
}

/**
 * A stand-in person, for previewing a step.
 *
 * Deliberately a whole record with ordinary values rather than
 * "FIRSTNAME_PLACEHOLDER": the point of a preview is to read the email as the
 * person receiving it will, and a preview full of shouting placeholders is one
 * nobody reads properly.
 */
export const SAMPLE_CONTACT = {
  name: 'Rita Walker',
  firstName: 'Rita',
  lastName: 'Walker',
  email: 'rita.walker@example.com',
  phone: '07700 900123',
  company: 'Walker Lettings',
  jobTitle: 'Director',
};

/**
 * Fill the tokens in a piece of text.
 *
 * ── The duplication here is deliberate, and so is this comment ──
 *
 * The engine does this in `worker/src/lib/automationEngine.ts` (`personalise`).
 * The Worker and the bundle are separate builds with separate tsconfigs, so
 * there is no honest way to share one function without restructuring both.
 *
 * Two copies of a substitution rule is exactly the kind of thing that drifts,
 * and a preview that fills tokens differently from the sender is worse than no
 * preview — it would show one email and send another. The rule is therefore
 * kept deliberately tiny, stated identically in both files, and pinned by a
 * test: an unknown token becomes an empty string rather than being left on
 * screen, because "Hi {{firstName}}," arriving in somebody's inbox is the
 * failure this is meant to prevent.
 */
export function fillTokens(text: string, contact: Record<string, string> = SAMPLE_CONTACT): string {
  return text.replace(/\{\{\s*(\w+)\s*\}\}/g, (_, key: string) => contact[key] ?? '');
}

/** What a dry run of one step has to say. */
export interface StepPreview {
  /** What it would do, in one line. */
  headline: string;
  /** The message, when there is one. */
  subject?: string;
  body?: string;
  /** Why it would not run at all. Empty when it would. */
  blocked: string;
  /** Anything true but worth knowing before switching it on. */
  notes: string[];
}

/**
 * What this step would do to the sample person, without doing it.
 *
 * ── Why a dry run rather than a real send ──
 *
 * A "Test" button that actually sends puts a real email in a real inbox every
 * time somebody presses it while building — and people press it a lot. This
 * reports what *would* happen and names anything that would stop it, which is
 * the question being asked.
 *
 * It is honest about the limits of that: it cannot know whether a mail server
 * will accept the message, so it says so rather than reporting success.
 */
export function previewStep(node: WorkflowNode, contact = SAMPLE_CONTACT): StepPreview {
  const c = (k: string) => String(node.config?.[k] ?? '').trim();
  const notes: string[] = [];

  if (node.type === 'trigger') {
    if (c('event') === 'schedule') {
      const cad = CADENCES[c('cadence')] ?? CADENCES.daily;
      return {
        headline: `${cad}, whether or not anybody has done anything.`,
        blocked: '',
        /* The two things somebody would otherwise find out by waiting a day.
           Neither is a fault; both are surprising if unstated. */
        notes: [
          'Nobody is enrolled in a workflow like this — it has no contact in it, so a send step would have nowhere to send.',
          'It runs on the server whether or not the app is open.',
        ],
      };
    }
    const ev = c('event').replace(/_/g, ' ') || 'nothing';
    const named = c('formName') || c('tag');
    return {
      headline: `Starts when ${ev}${named ? ` — only "${named}"` : ''}.`,
      blocked: c('event') ? '' : 'No event is chosen, so nothing would ever start this workflow.',
      notes: named ? [] : ['Any form or tag will start it. Name one above to narrow it.'],
    };
  }

  if (node.type === 'ai') {
    const src = AGENT_SOURCES[c('source') || 'portfolio'];
    const out = AGENT_OUTPUTS[c('produces') || 'social'];
    if (!src || !out) {
      return { headline: 'An AI agent.', blocked: 'It has no source or nothing to produce, so there is nothing to run.', notes: [] };
    }
    const count = Math.max(Number(c('count')) || 1, 1);
    const emails = Math.max(Number(c('campaignSteps')) || 7, 2);
    const makes = c('produces') === 'email_campaign'
      ? `a campaign of ${emails} emails`
      : c('produces') === 'blog' ? 'one blog post'
        : `${count} ${count === 1 ? 'post' : 'posts'}`;

    if (src.needsUrl && !c('sourceUrl')) {
      return {
        headline: `Would read ${src.label.toLowerCase()} and write ${makes}.`,
        blocked: `No address is set, so there is nothing to read.`,
        notes: [],
      };
    }
    if (src.needsPrompt && c('sourcePrompt').length < 6) {
      return {
        headline: `Would search the web and write ${makes}.`,
        blocked: 'No question is set, so there is nothing to search for.',
        notes: [],
      };
    }

    return {
      headline: `Reads ${src.label.toLowerCase()} and writes ${makes}, filed in ${out.where}.`,
      blocked: '',
      notes: [
        /* Said before it runs rather than discovered after. Everything it makes
           is a draft; nothing it makes is posted. */
        `Everything it makes is a draft in ${out.where}. Nothing is published or scheduled by this step.`,
        ...(c('source') === 'rss' || c('source') === 'youtube'
          ? ['It only writes about what appeared since it last ran. A morning with nothing new is recorded as skipped, not as done.']
          : []),
        ...(c('source') === 'website'
          ? ['It remembers what the page said. If the page has not changed since last time, it skips rather than writing the same thing again.']
          : []),
        ...(c('source') === 'web'
          ? [`It searches for: \u201c${c('sourcePrompt')}\u201d. It writes only from pages Google actually returned, and a search with no sources is treated as a failure, not as research.`]
          : []),
        ...(c('produces') === 'email_campaign' && emails > 13
          ? [`${emails} emails are written a batch at a time, so this takes a few minutes and may finish across two runs.`]
          : []),
        'A dry run cannot show the copy — that is written by the model when it runs. Use "Run it now" to see the real thing.',
      ],
    };
  }

  if (node.type === 'wait') {
    const ms = waitMs(node.config ?? {});
    const days = ms / 86_400_000;
    return {
      headline: days >= 1
        ? `Waits ${Number(days.toFixed(1))} day${days === 1 ? '' : 's'}, then carries on.`
        : `Waits ${Math.round(ms / 60_000)} minutes, then carries on.`,
      blocked: '',
      notes: Object.keys(node.config ?? {}).length ? [] : ['Nothing is set, so this waits the default day.'],
    };
  }

  if (node.type === 'condition') {
    const field = c('field');
    const op = c('operator') || 'equals';
    const value = c('value');
    if (!field) {
      return {
        headline: 'Splits the workflow in two.',
        blocked: 'Nothing is chosen to test, so every person would take the No branch.',
        notes: [],
      };
    }
    const have = String((contact as Record<string, string>)[field] ?? '');
    const yes = op === 'is_set' ? !!have
      : op === 'is_empty' ? !have
        : op === 'contains' ? have.toLowerCase().includes(value.toLowerCase())
          : op === 'not_equals' ? have.toLowerCase() !== value.toLowerCase()
            : have.toLowerCase() === value.toLowerCase();
    /* Behaviour the engine has and a builder would not guess: a field nothing
       records is unknown, and unknown takes No. */
    if (!(field in contact)) {
      notes.push(`Nothing records "${field}" yet, so in a real run this always takes the No branch.`);
    }
    return {
      headline: `For ${contact.firstName}, this answers ${yes ? 'Yes' : 'No'}.`,
      blocked: '',
      notes,
    };
  }

  if (node.type === 'send_email') {
    const subject = fillTokens(c('subject'), contact);
    const body = fillTokens(c('body') || c('preview'), contact);
    return {
      headline: `Emails ${contact.email}.`,
      subject,
      body,
      blocked: c('subject') ? '' : 'There is no subject, so this would send a blank email.',
      notes: ['This is what would be sent. Whether a mail server accepts it is only known once it goes.'],
    };
  }

  if (node.type === 'send_sms') {
    const text = fillTokens(c('message') || c('body'), contact);
    return {
      headline: `Texts ${contact.phone}.`,
      body: text,
      blocked: (c('message') || c('body')) ? '' : 'There is no message, so this would send an empty text.',
      notes: text.length > 160
        ? [`That is ${text.length} characters — over 160 it is billed and delivered as more than one text.`]
        : [],
    };
  }

  if (node.type === 'add_tag' || node.type === 'remove_tag') {
    const tag = c('tag');
    return {
      headline: tag
        ? `${node.type === 'add_tag' ? 'Adds' : 'Removes'} the tag "${tag}" on ${contact.firstName}.`
        : 'Changes a tag.',
      blocked: tag ? '' : 'No tag is named.',
      /* The thing a builder would otherwise discover from a screen that does
         not change: the engine proposes contact edits and the browser applies
         them, because the contact list is the browser's document. */
      notes: ['Contact changes are applied the next time the app is open.'],
    };
  }

  if (node.type === 'create_task') {
    return {
      headline: `Puts "${c('title') || c('text') || 'Follow up'}" on your list, against ${contact.name}.`,
      blocked: '',
      notes: [],
    };
  }

  if (node.type === 'assign_to') {
    return {
      headline: c('user') ? `Assigns ${contact.name} to ${c('user')}.` : 'Assigns the contact to somebody.',
      blocked: c('user') ? '' : 'Nobody is named.',
      notes: [],
    };
  }

  if (node.type === 'update_field') {
    return {
      headline: c('field') ? `Sets ${c('field')} to "${c('value')}" on ${contact.name}.` : 'Sets a field.',
      blocked: c('field') ? '' : 'No field is named.',
      notes: ['Contact changes are applied the next time the app is open.'],
    };
  }

  if (node.type === 'end') {
    return { headline: 'Ends the workflow here.', blocked: '', notes: [] };
  }

  return {
    headline: `"${node.type}" is not a step this version can carry out.`,
    blocked: 'The engine would skip this step and carry on.',
    notes: [],
  };
}

/* ── Changing a graph without breaking it ─────────────────────────────────────
 *
 * ── Why these exist ──
 *
 * The builder used to rebuild every link from the order of the step list after
 * *any* edit — renaming a step included. That is correct for a straight line
 * and destructive for anything that forks: a condition's Yes was re-pointed at
 * whatever happened to sit next in the list, which in a branching workflow is
 * usually the first step of the No branch. So renaming a step in "Speed to
 * Lead" quietly sent the "did you get what you needed?" chase to the people who
 * *had* replied. Nothing failed; the graph was simply different from the one
 * on the screen a moment before.
 *
 * These change exactly the links an edit touches and no others. Renaming or
 * configuring a step touches none. Pure, and tested: `npm run test:nodes`.
 */

/** Where a step goes next on its own path — Yes for a condition. */
const nextOf = (n: WorkflowNode): string | null =>
  n.type === 'condition' ? (n.yesId ?? n.nextId ?? null) : (n.nextId ?? null);

/** Point a step's onward link somewhere, respecting which field a condition uses. */
function withNext(n: WorkflowNode, to: string | null): WorkflowNode {
  return n.type === 'condition' ? { ...n, yesId: to, nextId: null } : { ...n, nextId: to };
}

/** Change one step's own fields. Never touches a link. */
export function patchStep(nodes: WorkflowNode[], id: string, patch: Partial<Omit<WorkflowNode, 'id' | 'nextId' | 'yesId'>>): WorkflowNode[] {
  return nodes.map(n => (n.id === id ? { ...n, ...patch, config: { ...n.config, ...(patch.config ?? {}) } } : n));
}

/**
 * Put a new step directly after another, on the same path.
 *
 * The new step takes over where the old one was going; the old one now goes
 * to the new step. A condition gains the step on its Yes path — the one it
 * continues along — and its No branch is left exactly as it was.
 */
export function insertAfter(nodes: WorkflowNode[], afterId: string, step: WorkflowNode): WorkflowNode[] {
  const at = nodes.findIndex(n => n.id === afterId);
  if (at < 0) return [...nodes, { ...step, nextId: null }];
  const before = nodes[at];
  const inserted = withNext(step, nextOf(before));
  const out = nodes.map(n => (n.id === afterId ? withNext(n, step.id) : n));
  out.splice(at + 1, 0, inserted);
  return out;
}

/**
 * Take a step out and close the gap.
 *
 * Anything that pointed at it — a step before it, or a condition branching to
 * it — now points where it was going. A condition's own No branch has nowhere
 * to reconnect to when the condition goes, so it becomes unreachable and is
 * drawn as such rather than silently spliced into the Yes path.
 */
export function removeStep(nodes: WorkflowNode[], id: string): WorkflowNode[] {
  const gone = nodes.find(n => n.id === id);
  if (!gone) return nodes;
  const onward = nextOf(gone);
  return nodes
    .filter(n => n.id !== id)
    .map(n => ({
      ...n,
      nextId: n.nextId === id ? onward : n.nextId,
      ...(n.type === 'condition' ? {
        yesId: n.yesId === id ? onward : n.yesId,
        noId: n.noId === id ? onward : n.noId,
      } : {}),
    }));
}

/**
 * Swap a step with the one after it on its path.
 *
 * Only when that link is a plain "next" — a condition cannot be swapped past,
 * because doing so would carry its No branch to a different point in the story
 * without anybody deciding that. Returns the graph unchanged when refused.
 */
export function swapWithNext(nodes: WorkflowNode[], id: string): WorkflowNode[] {
  const a = nodes.find(n => n.id === id);
  if (!a || a.type === 'trigger' || a.type === 'condition') return nodes;
  const bId = a.nextId;
  const b = bId ? nodes.find(n => n.id === bId) : undefined;
  if (!b || b.type === 'condition') return nodes;

  const afterB = b.nextId ?? null;
  return nodes.map(n => {
    if (n.id === a.id) return { ...n, nextId: afterB };
    if (n.id === b.id) return { ...n, nextId: a.id };
    /* Everything that led to A now leads to B. */
    return {
      ...n,
      nextId: n.nextId === a.id ? b.id : n.nextId,
      ...(n.type === 'condition' ? {
        yesId: n.yesId === a.id ? b.id : n.yesId,
        noId: n.noId === a.id ? b.id : n.noId,
      } : {}),
    };
  });
}

/** Swap a step with the one before it on its path. See `swapWithNext`. */
export function swapWithPrev(nodes: WorkflowNode[], id: string): WorkflowNode[] {
  const prev = nodes.find(n => n.type !== 'condition' && n.nextId === id);
  return prev ? swapWithNext(nodes, prev.id) : nodes;
}

/* ── Where a scheduled workflow gets its material ─────────────────────────────
 *
 * In the engine a scheduled workflow's source lives on its AI step: the
 * trigger says *when*, the agent says *what it reads*. That is the right model
 * for running it and the wrong one for choosing it — somebody setting up
 * "write a post from this web page every morning" thinks of the page as what
 * starts it. So the trigger offers the sources, and these two keep the agent
 * behind it in step, without the person having to visit a second step to
 * finish a decision they made on the first.
 */

/** The agent a scheduled workflow reads through: the first AI step in it. */
export function readerOf(nodes: WorkflowNode[]): WorkflowNode | null {
  return nodes.find(n => n.type === 'ai') ?? null;
}

/**
 * Point the workflow's reader at a source, adding one if there is none.
 *
 * An existing agent keeps everything else about it — what it makes, for which
 * platform, how many — and only changes what it reads. A workflow with no
 * agent gets one straight after the trigger, set up to write a social post,
 * because a scheduled workflow with nothing to run is a clock with no hands.
 */
export function pointReaderAt(
  nodes: WorkflowNode[], source: string, extra: Record<string, string> = {},
): WorkflowNode[] {
  const reader = readerOf(nodes);
  const cfg = { source, ...extra };
  if (reader) {
    return nodes.map(n => (n.id === reader.id ? { ...n, config: { ...n.config, ...cfg } } : n));
  }
  const trigger = nodes.find(n => n.type === 'trigger');
  if (!trigger) return nodes;
  const agent: WorkflowNode = {
    id: `n-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`,
    type: 'ai',
    label: 'Write from what it reads',
    config: { produces: 'social', platform: 'instagram', count: '1', ...cfg },
    nextId: null,
  };
  return insertAfter(nodes, trigger.id, agent);
}
