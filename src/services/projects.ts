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
  profile?: Record<string, string>;
  readFrom?: string;
  title?: string;
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

/**
 * Read a client's own website into a portfolio draft.
 *
 * A draft, deliberately. What comes back becomes the voice of every email and
 * post that goes out under this client's name, so a person reads it and presses
 * save — `savePortfolio` with `source: 'url'` is the second half of this.
 */
export const readPortfolioFromUrl = (url: string) => call('read_url', { url });

/** The same, from something pasted rather than fetched — an article, a brochure. */
export const readPortfolioFromText = (text: string) => call('read_text', { text });
export const deletePortfolio = (id: string) => call('delete_portfolio', { id });

export const saveProject = (p: {
  id?: string; name: string; objective: string; portfolioId: string; kind: ProjectKind;
  /** Omitted on an edit: the server keeps whatever the project already had. */
  guardrails?: Record<string, string>;
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

/* ── What a project is allowed to do ───────────────────────────────────────
 *
 * The wizard used to ask one question — "what is this project for?" — with
 * three answers, and then hand every project every permission there is. That
 * is the wrong shape twice over: nobody thinks about their work as one of
 * three categories, and a project that was only ever meant to find names
 * should not also be able to text strangers.
 *
 * So the question is now "what should it do?", answered with as many of these
 * as apply. Each one is a real guardrail on the server, and anything not
 * chosen is set to 'off' rather than left at a default nobody saw.
 */
export type Capability =
  | 'find' | 'email' | 'sms' | 'content' | 'book' | 'shop';

export interface CapabilityInfo {
  id: Capability;
  label: string;
  blurb: string;
  /** What it needs before it can do anything, said up front rather than discovered. */
  needs?: string;
}

export const CAPABILITIES: CapabilityInfo[] = [
  {
    id: 'find', label: 'Find people worth contacting',
    blurb: 'Searches for businesses and people who fit this client, and files them as leads.',
    needs: 'an AI key',
  },
  {
    id: 'email', label: 'Write and send the emails',
    blurb: 'Sequences, follow-ups and campaigns, written from the portfolio and shown to you first.',
    needs: 'a mailbox and an AI key',
  },
  {
    id: 'sms', label: 'Text them as well',
    blurb: 'The same conversation by SMS, for the people who never open email.',
    needs: 'an SMS provider',
  },
  {
    id: 'content', label: 'Write the content',
    blurb: 'Landing pages, blog posts and social posts that give the outreach somewhere to point.',
    needs: 'an AI key',
  },
  {
    id: 'book', label: 'Book the meetings',
    blurb: 'Turns a reply into a slot in the diary without the email chain.',
  },
  {
    id: 'shop', label: 'Run the shop',
    blurb: 'The catalogue and the storefront, chasing unpaid orders and thanking buyers.',
    needs: 'a payment processor',
  },
];

/** Everything on — what "run the whole thing" means, spelled out. */
export const ALL_CAPABILITIES: Capability[] = CAPABILITIES.map(c => c.id);

/**
 * Which kind of project this adds up to.
 *
 * `kind` is still the server's contract and still decides which plays the
 * planner offers, so it is derived rather than asked: a shop and outreach
 * together is 'general', because either half alone would silence the other.
 */
export function kindFor(caps: Capability[]): ProjectKind {
  const shop = caps.includes('shop');
  const reach = caps.some(c => c === 'find' || c === 'email' || c === 'sms' || c === 'book');
  if (shop && reach) return 'general';
  if (shop) return 'ecommerce';
  return 'leadgen';
}

/**
 * The permissions a set of capabilities adds up to.
 *
 * Anything that reaches a person who has not heard from this client before
 * waits for a human the first time — that is what 'approval' is for, and it is
 * the default for every sending channel. Writing does not wait: a draft nobody
 * sent costs nothing, and approving each one is how a hands-off product turns
 * into a queue of chores.
 *
 * Everything not chosen is explicitly 'off'. Leaving it at a default would mean
 * a project quietly holding a permission its owner never saw.
 */
export function guardrailsFor(caps: Capability[]): Record<string, string> {
  const has = (c: Capability) => caps.includes(c);
  const writes = has('email') || has('content') || has('shop');
  return {
    createWorkflows: writes ? 'on' : 'off',
    activateWorkflows: has('email') ? 'approval' : 'off',
    sendEmail: has('email') ? 'approval' : 'off',
    sendSms: has('sms') ? 'approval' : 'off',
    bookAppointments: has('book') ? 'on' : 'off',
    findProspects: has('find') ? 'approval' : 'off',
  };
}

/**
 * Objectives worth offering, by what the project is allowed to do.
 *
 * Not a dropdown — a starting sentence somebody edits. Autopilot reads the
 * objective every time it decides what to do next, so "20 dental practices a
 * month within 20 miles" plans differently from "more leads", and a blank box
 * is where most people write the second one.
 */
export function objectiveIdeas(caps: Capability[], client: string): string[] {
  const who = client.trim() || 'this client';
  const out: string[] = [];
  if (caps.includes('shop')) {
    out.push(
      'Sell 200 units a month and get buyers coming back for a second order',
      `Get ${who}\u2019s best three products in front of people who have bought something like them`,
      'Recover the orders that get abandoned at the checkout',
    );
  }
  if (caps.includes('find')) {
    out.push(
      'Find and book 20 meetings a month with businesses within 20 miles',
      `Build a list of everyone who plausibly needs what ${who} sells, and start the conversation`,
    );
  }
  if (caps.includes('email') && !caps.includes('find')) {
    out.push('Turn the contacts we already have into booked calls');
  }
  if (caps.includes('content')) {
    out.push(`Rank ${who} for the things their customers actually search for`);
  }
  if (caps.includes('book')) {
    out.push('Fill the diary \u2014 every reply that wants a call gets one booked');
  }
  /* Always something, even with nothing chosen yet. */
  if (!out.length) out.push('Bring in more work than we are bringing in now');
  return out.slice(0, 5);
}
