/**
 * The AI key Autopilot writes with, and the replies waiting on a person.
 *
 * The key lives on the server, encrypted. It used to live in this browser's
 * localStorage, which is exactly why replies only happened with a tab open —
 * the cron had nothing to write with.
 */
import { sessionToken } from './auth';
import { getActiveAccountId } from './tenancy';
import { API_BASE } from './apiBase';

export interface AiStatus {
  provider: string;
  hasKey: boolean;
  verifiedAt: string | null;
  lastError: string;
}

export interface ReplyDraft {
  id: string;
  mailboxId: string;
  to: { email: string; name: string };
  /** What the customer wrote, so the reply can be judged against it. */
  incoming: { subject: string; body: string };
  subject: string;
  body: string;
  confidence: number;
  needsHuman: boolean;
  ruleName: string;
  /** Why this is waiting rather than sent. */
  because: string;
  status: string;
  detail: string;
  createdAt: string;
  actedAt: string | null;
}

interface Reply {
  success: boolean;
  error?: string;
  message?: string;
  ai?: AiStatus | null;
  drafts?: ReplyDraft[];
}

async function call(action: string, extra: Record<string, unknown> = {}): Promise<Reply> {
  const accountId = getActiveAccountId();
  if (!accountId) return { success: false, error: 'No workspace is active yet.' };
  try {
    const r = await fetch(`${API_BASE}/api/replies.php`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ token: sessionToken(), accountId, action, ...extra }),
    });
    return await r.json() as Reply;
  } catch (e) {
    return { success: false, error: `Could not reach the server: ${e instanceof Error ? e.message : String(e)}` };
  }
}

export async function fetchReplies(): Promise<{ ai: AiStatus | null; drafts: ReplyDraft[] }> {
  const r = await call('get');
  return { ai: r.success ? (r.ai ?? null) : null, drafts: r.drafts ?? [] };
}

/** Blank keeps the stored key, as everywhere else in this app. */
export async function saveAiKey(apiKey: string): Promise<Reply> { return call('save_key', { apiKey }); }

/** Asks Google whether the key works. Costs no quota. */
export async function testAiKey(): Promise<Reply> { return call('test_key'); }

/**
 * Send a held reply, optionally edited.
 *
 * The edit and the send are one call: a person who rewrites a reply and then
 * has to find a separate save button will send the version they just replaced.
 */
export async function sendDraft(draftId: string, subject?: string, body?: string): Promise<Reply> {
  return call('send_draft', { draftId, subject, body });
}

export async function discardDraft(draftId: string): Promise<Reply> {
  return call('discard_draft', { draftId });
}
