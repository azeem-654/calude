/**
 * The AI campaign registry — the record every other part of the module hangs off.
 *
 * Storage goes through the tenant-scoped `crm_*` keys, so a campaign belongs to
 * the sub-account that created it without this file knowing that scoping
 * exists (see tenancy.ts).
 *
 * Two things here are load-bearing:
 *
 * Ids are allocated from a counter that only ever goes up, never from the
 * length of the list. Deriving the next id from what is currently stored means
 * deleting the newest campaign hands its id to the next one — and by then that
 * id is written into email sequences, contact activity and the decision log,
 * all of which would silently start pointing at the wrong campaign.
 *
 * Links are edges, not copies. A link holds the id of a record another module
 * owns, so following it means going and reading the real thing. Nothing about
 * that record's state is stored here, because two copies of a status is two
 * answers to "is this campaign running?".
 */
import { makeSource, type ContentSource } from '../types/provenance';
import {
  DEFAULT_GUARDRAILS,
  type AICampaign, type AICampaignStatus, type AIGuardrails, type AILink,
  type AIStrategy, type LinkKind,
} from '../types/aiSalesAgent';

const CAMPAIGNS_KEY = 'crm_ai_campaigns';
const SEQ_KEY = 'crm_ai_seq';

/* ── Storage ───────────────────────────────────────────────────────────── */

/**
 * Set by the most recent failed write and read by the UI.
 *
 * A write that fails silently is the worst outcome available here: the campaign
 * looks created, the user walks away, and it is gone on reload. Failures are
 * kept so the screen that caused one can say so.
 */
let lastSaveError = '';

export function takeSaveError(): string {
  const e = lastSaveError;
  lastSaveError = '';
  return e;
}

function read<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key);
    if (raw === null) return fallback;
    const parsed = JSON.parse(raw);
    return (parsed ?? fallback) as T;
  } catch { return fallback; }
}

function write(key: string, value: unknown): boolean {
  try {
    localStorage.setItem(key, JSON.stringify(value));
    return true;
  } catch (err) {
    const quota = err instanceof DOMException
      && (err.name === 'QuotaExceededError' || err.name === 'NS_ERROR_DOM_QUOTA_REACHED');
    console.error(`AI Sales Agent could not save ${key}:`, err);
    lastSaveError = quota
      ? 'Your browser storage is full. Remove an old campaign to free space — nothing new can be saved until you do.'
      : 'The browser refused to save this. Check that storage is not blocked for this site.';
    return false;
  }
}

export function loadCampaigns(): AICampaign[] {
  const rows = read<AICampaign[]>(CAMPAIGNS_KEY, []);
  return Array.isArray(rows) ? rows.filter(r => r && typeof r.id === 'string') : [];
}

function saveCampaigns(rows: AICampaign[]): boolean {
  return write(CAMPAIGNS_KEY, rows);
}

/* ── Identity ──────────────────────────────────────────────────────────── */

/**
 * AI-SA-2026-0001.
 *
 * The counter is per year and per tenant, and it is bumped past anything
 * already stored — so a counter lost to a cleared browser or a partial restore
 * cannot hand out an id that is already in use somewhere.
 */
export function nextCampaignId(now = new Date()): string {
  const year = now.getFullYear();
  const counters = read<Record<string, number>>(SEQ_KEY, {});
  const taken = new Set(loadCampaigns().map(c => c.id));

  let n = Math.max(0, Math.floor(Number(counters[year]) || 0)) + 1;
  let id = format(year, n);
  while (taken.has(id)) { n += 1; id = format(year, n); }

  counters[String(year)] = n;
  write(SEQ_KEY, counters);
  return id;
}

function format(year: number, n: number): string {
  return `AI-SA-${year}-${String(n).padStart(4, '0')}`;
}

/* ── Reading ───────────────────────────────────────────────────────────── */

export function getCampaign(id: string): AICampaign | null {
  return loadCampaigns().find(c => c.id === id) ?? null;
}

/** Newest first, which is the order every screen wants. */
export function listCampaigns(): AICampaign[] {
  return loadCampaigns().sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

export function linksOf(campaign: AICampaign | null, kind?: LinkKind): AILink[] {
  const links = campaign?.links ?? [];
  return kind ? links.filter(l => l.kind === kind) : links;
}

/**
 * Which campaign is responsible for a record another module owns.
 *
 * This is what lets Marketing show "created by AI Sales Agent" without
 * Marketing having to store anything about the agent.
 */
export function campaignForRecord(kind: LinkKind, id: string): AICampaign | null {
  return loadCampaigns().find(c => c.links?.some(l => l.kind === kind && l.id === id)) ?? null;
}

/* ── Writing ───────────────────────────────────────────────────────────── */

export interface NewCampaign {
  name: string;
  objective: string;
  guardrails?: Partial<AIGuardrails>;
  createdBy?: string;
  status?: AICampaignStatus;
}

/**
 * Returns null when the write failed — call takeSaveError() for the reason.
 * Callers must not assume success, because on a full storage quota the campaign
 * genuinely does not exist.
 */
export function createCampaign(input: NewCampaign, now = new Date()): AICampaign | null {
  const at = now.toISOString();
  const campaign: AICampaign = {
    id: nextCampaignId(now),
    name: input.name.trim() || 'Untitled campaign',
    objective: input.objective.trim(),
    status: input.status ?? 'draft',
    guardrails: { ...DEFAULT_GUARDRAILS, ...(input.guardrails ?? {}) },
    links: [],
    createdAt: at,
    updatedAt: at,
    createdBy: input.createdBy,
  };
  const rows = loadCampaigns();
  rows.push(campaign);
  return saveCampaigns(rows) ? campaign : null;
}

export function updateCampaign(id: string, updates: Partial<AICampaign>, now = new Date()): AICampaign | null {
  const rows = loadCampaigns();
  const i = rows.findIndex(c => c.id === id);
  if (i < 0) return null;
  /* id and createdAt are identity, not state — an update must never move a
     campaign's id out from under the records that point at it. */
  const { id: _ignoredId, createdAt: _ignoredAt, ...safe } = updates;
  void _ignoredId; void _ignoredAt;
  rows[i] = { ...rows[i], ...safe, updatedAt: now.toISOString() };
  return saveCampaigns(rows) ? rows[i] : null;
}

export function setStrategy(id: string, strategy: AIStrategy): AICampaign | null {
  return updateCampaign(id, { strategy, status: 'awaiting-approval' });
}

export function setStatus(id: string, status: AICampaignStatus, now = new Date()): AICampaign | null {
  const extra: Partial<AICampaign> = { status };
  if (status === 'running' && !getCampaign(id)?.startedAt) extra.startedAt = now.toISOString();
  if (status === 'completed' || status === 'stopped') extra.endedAt = now.toISOString();
  return updateCampaign(id, extra, now);
}

export function setGuardrails(id: string, updates: Partial<AIGuardrails>): AICampaign | null {
  const current = getCampaign(id);
  if (!current) return null;
  return updateCampaign(id, { guardrails: { ...current.guardrails, ...updates } });
}

/**
 * Record that this campaign is responsible for something.
 *
 * Linking the same record twice is a no-op rather than a duplicate: the
 * orchestrator is built to be re-runnable, so it will legitimately try.
 */
export function linkRecord(
  campaignId: string,
  link: Omit<AILink, 'at'> & { at?: string },
  now = new Date(),
): AICampaign | null {
  const rows = loadCampaigns();
  const i = rows.findIndex(c => c.id === campaignId);
  if (i < 0) return null;

  const links = rows[i].links ?? [];
  const existing = links.findIndex(l => l.kind === link.kind && l.id === link.id);
  const entry: AILink = { ...link, at: link.at ?? now.toISOString() };
  /* Re-linking refreshes the label and route — a renamed sequence should not
     leave a stale name on the campaign — but keeps the original timestamp,
     because that is when the agent actually created it. */
  if (existing >= 0) links[existing] = { ...entry, at: links[existing].at };
  else links.push(entry);

  rows[i] = { ...rows[i], links, updatedAt: now.toISOString() };
  return saveCampaigns(rows) ? rows[i] : null;
}

export function unlinkRecord(campaignId: string, kind: LinkKind, id: string, now = new Date()): AICampaign | null {
  const rows = loadCampaigns();
  const i = rows.findIndex(c => c.id === campaignId);
  if (i < 0) return null;
  rows[i] = {
    ...rows[i],
    links: (rows[i].links ?? []).filter(l => !(l.kind === kind && l.id === id)),
    updatedAt: now.toISOString(),
  };
  return saveCampaigns(rows) ? rows[i] : null;
}

/**
 * Forget a campaign.
 *
 * Only the campaign record goes. Everything it created — sequences, contacts,
 * appointments — belongs to the module that owns it and stays exactly where it
 * is; deleting the orchestration record must not quietly delete a customer's
 * live email sequence. Those records keep their provenance stamp, which will
 * no longer resolve, and that is the honest outcome: it says "an AI campaign
 * made this, and that campaign is gone".
 */
export function deleteCampaign(id: string): boolean {
  const rows = loadCampaigns();
  const next = rows.filter(c => c.id !== id);
  if (next.length === rows.length) return false;
  return saveCampaigns(next);
}

/* ── Provenance ────────────────────────────────────────────────────────── */

/**
 * The stamp put on every record the agent creates, so any of them can be
 * traced back to the campaign that asked for it.
 */
export function aiCampaignSource(campaign: Pick<AICampaign, 'id' | 'name'>): ContentSource {
  return makeSource('ai-sales-agent', campaign.name, {
    refId: campaign.id,
    route: `/ai-sales-agent/${campaign.id}`,
    detail: campaign.id,
  });
}
