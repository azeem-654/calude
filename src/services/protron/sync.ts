/**
 * Protron and the server: the conversation on every device, the audit trail,
 * and the commander voice (worker/src/routes/protron.ts).
 *
 * Every call is best-effort for the customer: a conversation that could not
 * be saved stays in this browser and is saved with the next turn; an audit
 * row that could not be written does not stop the action (the server's own
 * audit helper takes the same view). Nothing here holds a token: the page
 * sends the "cookie" placeholder like every other call.
 */
import type { Prefs, SiteCheck, Turn } from './memory';

const base = (): string => (import.meta.env.DEV ? 'http://localhost:8787' : '');

function who(): { token: string; accountId: string } {
  let token = 'cookie';
  try { token = (JSON.parse(localStorage.getItem('crm_session') || 'null') as { token?: string } | null)?.token || 'cookie'; } catch { /* signed out */ }
  let accountId = '';
  try { accountId = localStorage.getItem('crm_active_account') || ''; } catch { /* none */ }
  return { token, accountId };
}

async function call<T>(action: string, body: Record<string, unknown> = {}, signal?: AbortSignal): Promise<(T & { success: boolean; error?: string; code?: string }) | null> {
  const w = who();
  if (!w.accountId) return null;
  try {
    const r = await fetch(`${base()}/api/protron.php`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, credentials: 'include', signal,
      body: JSON.stringify({ action, ...w, ...body }),
    });
    return await r.json() as T & { success: boolean; error?: string; code?: string };
  } catch { return null; }
}

/** The server's copy of this person's conversation in this workspace. */
export async function loadRemote(): Promise<{ turns: Turn[]; prefs: Partial<Prefs>; updatedAt: number } | null> {
  const r = await call<{ turns: Turn[]; prefs: Partial<Prefs>; updatedAt: number }>('load');
  return r?.success ? { turns: Array.isArray(r.turns) ? r.turns : [], prefs: r.prefs ?? {}, updatedAt: Number(r.updatedAt) || 0 } : null;
}

let pending: number | undefined;
let lastPrefs = '';

/** Saves soon — a burst of turns (a reply and its cards settling) is one write. */
export function saveRemoteSoon(turns: Turn[], prefs: Prefs, onSaved?: (at: number) => void): void {
  window.clearTimeout(pending);
  pending = window.setTimeout(async () => {
    const shared: Partial<Prefs> = { ...prefs };
    delete shared.dock;
    const p = JSON.stringify(shared);
    /* Cards mid-run are saved as they stand; a reload settles them (ProtronPanel). */
    const r = await call<{ updatedAt: number }>('save', { turns, ...(p !== lastPrefs ? { prefs: shared } : {}) });
    if (r?.success) { lastPrefs = p; onSaved?.(r.updatedAt); }
  }, 1500);
}

export async function clearRemote(): Promise<void> { await call('clear'); }

/** One line in the workspace's audit trail: what Protron did and how it ended. */
export function audit(name: string, title: string, status: 'done' | 'failed' | 'cancelled' | 'refused', detail = ''): void {
  void call('audit', { name, title, status, detail: detail.slice(0, 120) });
}

export type SpeechResult = { ok: true; pcm: string; rate: number } | { ok: false; error: string; code: string };

/** An AI voice for a reply (warm or commander): base64 16-bit PCM, or why not. */
export async function fetchSpeech(text: string, signal?: AbortSignal, style: 'warm' | 'commander' = 'warm'): Promise<SpeechResult> {
  const r = await call<{ audio?: string; rate?: number }>('speak', { text, style }, signal);
  if (r?.success && r.audio) return { ok: true, pcm: r.audio, rate: r.rate || 24000 };
  return { ok: false, error: r?.error ?? 'The voice could not be reached.', code: r?.code ?? 'unreachable' };
}

/**
 * What answers at this person's own email domain (the server takes the domain
 * from the session, never from here). Null when it could not be asked — then
 * nothing is said about their website at all.
 */
export async function checkSite(): Promise<SiteCheck | null> {
  const r = await call<{ domain?: string; status?: string; title?: string; about?: string }>('site');
  if (!r?.success || !r.domain || !['found', 'none', 'personal'].includes(String(r.status))) return null;
  return { domain: r.domain, status: r.status as SiteCheck['status'], title: r.title || undefined, about: r.about || undefined, at: Date.now() };
}
