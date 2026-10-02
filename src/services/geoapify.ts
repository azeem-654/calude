/**
 * The install owner's Geoapify key — the free business directory behind
 * prospect search (worker/src/lib/geoapify.ts, routes/geoapify.ts). The key is
 * sent once, to be stored; it never comes back.
 */
import { sessionToken } from './auth';
import { API_BASE } from './apiBase';

export interface GeoState {
  success: boolean;
  error?: string;
  set?: boolean;
  status?: string;
  lastError?: string;
  updatedAt?: string | null;
  creditsToday?: number;
  cap?: number;
  tested?: { ok: boolean; error: string };
}

async function call(action: string, extra: Record<string, unknown> = {}): Promise<GeoState> {
  try {
    const r = await fetch(`${API_BASE}/api/geoapify.php`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ token: sessionToken(), action, ...extra }),
    });
    return await r.json() as GeoState;
  } catch {
    return { success: false, error: 'Could not reach the server.' };
  }
}

export const geoStatus = () => call('status');
export const saveGeoKey = (apiKey: string) => call('save', { apiKey });
export const testGeoKey = () => call('test');
