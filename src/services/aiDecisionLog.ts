/**
 * The account the agent gives of itself.
 *
 * An agent that creates campaigns and moves people between stages is only
 * trustworthy to the extent its work can be inspected afterwards. So every
 * action it takes is appended here with what it did and, where there is one, the
 * reason — not a rationalisation written later, but the fact that made it act:
 * which reply, which signal, which count.
 *
 * Rows are appended and never edited. There is no update function on purpose: a
 * log that can be rewritten answers "what does the agent say it did", which is
 * not the question anyone is asking.
 */
import type { AIDecision, AILink, DecisionKind } from '../types/aiSalesAgent';

const KEY = 'crm_ai_decisions';

/**
 * Storage is finite and a long-running campaign is chatty. Past this many rows
 * the oldest are dropped — the only case where anything leaves the log, and it
 * is visible: readers are told how many were trimmed rather than being handed a
 * shortened history that looks complete.
 */
const MAX_ROWS = 2000;

let trimmed = 0;

function read(): AIDecision[] {
  try {
    const raw = JSON.parse(localStorage.getItem(KEY) || '[]');
    return Array.isArray(raw) ? raw.filter((r: AIDecision) => r && typeof r.id === 'string') : [];
  } catch { return []; }
}

function write(rows: AIDecision[]): boolean {
  try {
    localStorage.setItem(KEY, JSON.stringify(rows));
    return true;
  } catch (err) {
    console.error('AI Sales Agent could not save the decision log:', err);
    return false;
  }
}

export interface DecisionInput {
  kind: DecisionKind;
  summary: string;
  /** The evidence. Include it whenever there is one — this is the useful half. */
  because?: string;
  link?: AILink;
  counts?: Record<string, number>;
}

let counter = 0;

/**
 * Append one line.
 *
 * Ids combine the timestamp with a counter because several decisions routinely
 * land inside the same millisecond during a single orchestration pass, and two
 * rows sharing an id would collide as React keys and in any later lookup.
 */
export function logDecision(campaignId: string, input: DecisionInput, now = new Date()): AIDecision {
  const entry: AIDecision = {
    id: `${now.getTime().toString(36)}-${(counter++).toString(36)}`,
    campaignId,
    at: now.toISOString(),
    kind: input.kind,
    summary: input.summary,
    because: input.because,
    link: input.link,
    counts: input.counts,
  };

  const rows = read();
  rows.push(entry);
  if (rows.length > MAX_ROWS) {
    trimmed += rows.length - MAX_ROWS;
    rows.splice(0, rows.length - MAX_ROWS);
  }
  write(rows);
  return entry;
}

/** Oldest first — a log reads forwards. */
export function decisionsFor(campaignId: string): AIDecision[] {
  return read().filter(d => d.campaignId === campaignId);
}

/** Newest first, across every campaign — what the module's activity feed shows. */
export function recentDecisions(limit = 50): AIDecision[] {
  return read().slice(-limit).reverse();
}

/** How many rows have been dropped to stay inside the cap, so a reader can be told. */
export function trimmedCount(): number {
  return trimmed;
}

/**
 * Drop a deleted campaign's rows.
 *
 * Not an edit to history: the campaign these described no longer exists, and
 * keeping its log would leave entries pointing at nothing. Called only when a
 * campaign is deleted.
 */
export function purgeCampaign(campaignId: string): number {
  const rows = read();
  const next = rows.filter(d => d.campaignId !== campaignId);
  const removed = rows.length - next.length;
  if (removed) write(next);
  return removed;
}
