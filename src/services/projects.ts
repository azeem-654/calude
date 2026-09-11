/**
 * Projects, the client portfolios they speak for, and the work under each.
 *
 * One project is one push for one client: a dental clinic's lead-gen campaign,
 * a shop's storefront, an Amazon consultant's outreach. A workspace runs as
 * many as it likes, and many projects can share one portfolio — a client with
 * three services is described once and pushed three ways.
 */
import { sessionToken } from './auth';
import { getActiveAccountId } from './tenancy';
import { API_BASE } from './apiBase';

export type ProjectKind = 'leadgen' | 'consultancy' | 'ecommerce' | 'general';

export interface Portfolio {
  id: string;
  name: string;
  profile: Record<string, string>;
  source: 'manual' | 'url';
  createdAt: string;
  updatedAt: string;
}

export interface Project {
  id: string;
  portfolioId: string;
  portfolioName: string;
  name: string;
  objective: string;
  kind: ProjectKind;
  status: 'off' | 'learning' | 'running' | 'paused';
  guardrails: Record<string, string>;
  lastPlannedAt: string | null;
  lastActedAt: string | null;
  lastError: string;
  createdAt: string;
  /** What the board's column header counts. */
  awaiting: number;
  done: number;
  failed: number;
}

/** One thing Autopilot did, or is waiting to do, for a project. */
export interface Card {
  id: string;
  kind: string;
  status: 'pending' | 'awaiting' | 'done' | 'failed' | 'skipped';
  summary: string;
  because: string;
  detail: string | null;
  counts: Record<string, number>;
  linkKind: string | null;
  linkId: string | null;
  linkLabel: string | null;
  linkRoute: string | null;
  createdAt: string;
  actedAt: string | null;
}

interface Reply {
  success: boolean;
  error?: string;
  id?: string;
  projects?: Project[];
  portfolios?: Portfolio[];
  board?: Record<string, Card[]>;
}

async function call(action: string, extra: Record<string, unknown> = {}): Promise<Reply> {
  const accountId = getActiveAccountId();
  if (!accountId) return { success: false, error: 'No workspace is active yet.' };
  try {
    const r = await fetch(`${API_BASE}/api/projects.php`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ token: sessionToken(), accountId, action, ...extra }),
    });
    return await r.json() as Reply;
  } catch (e) {
    return { success: false, error: `Could not reach the server: ${e instanceof Error ? e.message : String(e)}` };
  }
}

export async function fetchBoard() {
  const r = await call('get');
  return {
    projects: r.projects ?? [],
    portfolios: r.portfolios ?? [],
    board: r.board ?? {},
    error: r.success ? '' : (r.error ?? ''),
  };
}

export const savePortfolio = (p: { id?: string; name: string; profile: Record<string, string>; source?: string }) =>
  call('save_portfolio', p);
export const deletePortfolio = (id: string) => call('delete_portfolio', { id });

export const saveProject = (p: {
  id?: string; name: string; objective: string; portfolioId: string; kind: ProjectKind;
}) => call('save_project', p);
export const setProjectStatus = (id: string, status: Project['status']) => call('set_status', { id, status });
export const deleteProject = (id: string) => call('delete_project', { id });

/** What each kind is for, in the words the picker shows. */
export const KIND_LABEL: Record<ProjectKind, string> = {
  leadgen: 'Find clients',
  consultancy: 'Consultancy',
  ecommerce: 'Sell products',
  general: 'Everything',
};

export const KIND_BLURB: Record<ProjectKind, string> = {
  leadgen: 'Find people who need this service, write to them, and book them in.',
  consultancy: 'Find businesses who need this expertise and start the conversation.',
  ecommerce: 'A catalogue, a storefront, and everything that happens after a sale.',
  general: 'Everything at once. Pick one of the others if you know what this is for.',
};
