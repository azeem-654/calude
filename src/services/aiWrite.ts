/**
 * Marketing copy written by the AI — asked for from the server, not the bundle.
 *
 * Every call here goes to /api/aiwrite.php, which holds the workspace's Gemini
 * key encrypted and never hands it back. That is not ceremony: the module this
 * replaces called Anthropic's API directly from the browser with a key out of
 * localStorage, which put a billable credential in the page for anyone with
 * developer tools open — and, because nothing in the app ever wrote that
 * localStorage entry, it also never worked.
 *
 * `needsKey` comes back as its own flag rather than an error string, because
 * "you have not connected an AI key" is a thing the screen should offer to fix
 * with a link, not print in red.
 */
import { sessionToken } from './auth';
import { getActiveAccountId } from './tenancy';
import { API_BASE } from './apiBase';

export interface WrittenStep {
  day: number;
  subject: string;
  preheader: string;
  body: string;
  /** One line on what this email is for. Shown on the step, not sent. */
  purpose: string;
}

export interface WriteResult {
  ok: boolean;
  error: string;
  /** True when the workspace has no AI key at all — offer the link, not an error. */
  needsKey: boolean;
  /** Set when it wrote, but from a business profile too thin to be specific. */
  thin: string;
  steps: WrittenStep[];
  name: string;
  nodes: { type: string; label: string; config: Record<string, string> }[];
  subject: string;
  body: string;
}

const EMPTY: WriteResult = {
  ok: false, error: '', needsKey: false, thin: '',
  steps: [], name: '', nodes: [], subject: '', body: '',
};

async function call(payload: Record<string, unknown>): Promise<WriteResult> {
  const accountId = getActiveAccountId();
  if (!accountId) return { ...EMPTY, error: 'No workspace is active yet.' };
  try {
    const r = await fetch(`${API_BASE}/api/aiwrite.php`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...payload, token: sessionToken(), accountId }),
    });
    const d = await r.json() as Partial<WriteResult> & { success?: boolean; message?: string };
    return {
      ...EMPTY,
      ok: !!d.success,
      error: d.success ? '' : (d.message ?? 'The AI could not be reached.'),
      needsKey: !!d.needsKey,
      thin: d.thin ?? '',
      steps: d.steps ?? [],
      name: d.name ?? '',
      nodes: d.nodes ?? [],
      subject: d.subject ?? '',
      body: d.body ?? '',
    };
  } catch (e) {
    return { ...EMPTY, error: `Could not reach the server: ${e instanceof Error ? e.message : String(e)}` };
  }
}

export interface CampaignBrief {
  goal: string;
  concept: string;
  cta: string;
  tone: string;
  channel: 'email' | 'sms';
  steps: number;
  portfolioId?: string;
  /** The sender's own booking page, when they chose to offer one. */
  bookingUrl?: string;
}

export const writeCampaign = (brief: CampaignBrief) => call({ action: 'campaign', ...brief });

/** Autopilot's own three-email follow-up, written from the brand alone. */
export const writeSequence = (portfolioId?: string) => call({ action: 'sequence', portfolioId });

export const writeAutomation = (prompt: string, portfolioId?: string) =>
  call({ action: 'automation', prompt, portfolioId });

/** Change one email that already exists, rather than replacing it. */
export const rewriteEmail = (subject: string, html: string, instruction: string) =>
  call({ action: 'rewrite', subject, html, instruction });
