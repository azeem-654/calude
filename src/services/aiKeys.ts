/**
 * The install owner's AI keys — the main one and the backups tried after it
 * when it fails (worker/src/lib/aiPool.ts, routes/aikeys.ts). Keys are sent
 * once, to be stored; nothing here ever receives one back.
 */
import { sessionToken } from './auth';
import { API_BASE } from './apiBase';

export interface AiPoolEntry {
  label: string;
  source: 'install' | 'engine' | 'backup' | 'env' | 'workspace';
  id: string | null;
  lastOkAt: string | null;
  lastFailedAt: string | null;
  lastError: string;
  restingUntil: string | null;
  failCount: number;
}
export interface AiKeysRes {
  success: boolean;
  error?: string;
  keys?: AiPoolEntry[];
  tested?: { ok: boolean; error: string };
}

async function call(action: string, extra: Record<string, unknown> = {}): Promise<AiKeysRes> {
  try {
    const r = await fetch(`${API_BASE}/api/aikeys.php`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ token: sessionToken(), action, ...extra }),
    });
    return await r.json() as AiKeysRes;
  } catch {
    return { success: false, error: 'Could not reach the server.' };
  }
}

export const aiKeysStatus = () => call('status');
export const addAiKey = (apiKey: string, label: string) => call('add', { apiKey, label });
export const removeAiKey = (id: string) => call('remove', { id });
export const moveAiKey = (id: string, dir: 'up' | 'down') => call('move', { id, dir });
export const testAiKey = (index: number) => call('test', { index });
