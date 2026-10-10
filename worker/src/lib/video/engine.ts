/**
 * Talking to the media engine (media/engine/server.mjs).
 *
 * Two ways to reach it, chosen by what is configured — never by guessing:
 *   - MEDIA_ENGINE_URL + MEDIA_ENGINE_SECRET: any host running the engine;
 *     every request carries an HMAC of its time, method, path and body.
 *   - the MEDIA service binding: the Cloudflare Container Worker, which has
 *     no public address, so the binding itself is the authority.
 * Neither → `none`, and Video Studio says the engine needs setting up rather
 * than queueing work that will never run.
 */
import type { Env } from '../db';

export type EngineMode = 'url' | 'binding' | 'none';

export function engineMode(env: Env): EngineMode {
  if ((env.MEDIA_ENGINE_URL ?? '').trim() && (env.MEDIA_ENGINE_SECRET ?? '').trim()) return 'url';
  if (env.MEDIA) return 'binding';
  return 'none';
}

export interface EngineView {
  state: 'queued' | 'running' | 'done' | 'failed' | 'cancelled' | 'unknown';
  stage?: string;
  pct?: number | null;
  result?: Record<string, unknown> | null;
  error?: string;
}

async function hex(buf: ArrayBuffer) { return [...new Uint8Array(buf)].map(b => b.toString(16).padStart(2, '0')).join(''); }

async function call(env: Env, method: string, path: string, body?: unknown, timeoutMs = 20_000): Promise<Response> {
  const payload = body === undefined ? '' : JSON.stringify(body);
  const init: RequestInit = { method, headers: { 'content-type': 'application/json' }, ...(payload ? { body: payload } : {}), signal: AbortSignal.timeout(timeoutMs) };
  const mode = engineMode(env);
  if (mode === 'url') {
    const ts = String(Math.floor(Date.now() / 1000));
    const enc = new TextEncoder();
    const key = await crypto.subtle.importKey('raw', enc.encode(env.MEDIA_ENGINE_SECRET!.trim()), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
    const bodyHash = await hex(await crypto.subtle.digest('SHA-256', enc.encode(payload)));
    const sig = await hex(await crypto.subtle.sign('HMAC', key, enc.encode(`${ts}\n${method}\n${path}\n${bodyHash}`)));
    (init.headers as Record<string, string>)['x-pc-ts'] = ts;
    (init.headers as Record<string, string>)['x-pc-sig'] = sig;
    return fetch(`${env.MEDIA_ENGINE_URL!.trim().replace(/\/$/, '')}${path}`, init);
  }
  if (mode === 'binding') return env.MEDIA!.fetch(`https://engine${path}`, init);
  throw new Error('no media engine is configured');
}

export interface EngineJob {
  id: string;
  op: 'prepare' | 'render' | 'thumbnail' | 'probe' | 'track';
  params: Record<string, unknown>;
  inputs: Record<string, string>;
  upload: string;
  poke?: string;
}

export async function dispatch(env: Env, job: EngineJob): Promise<EngineView> {
  const r = await call(env, 'POST', '/jobs', job, 30_000);
  const d = await r.json<EngineView & { error?: string }>().catch(() => ({ state: 'unknown' as const, error: `engine answered ${r.status}` }));
  if (!r.ok && r.status !== 202) throw new Error(d.error || `engine answered ${r.status}`);
  return d;
}

export async function engineStatus(env: Env, id: string): Promise<EngineView> {
  const r = await call(env, 'GET', `/jobs/${encodeURIComponent(id)}`);
  if (!r.ok) throw new Error(`engine answered ${r.status}`);
  return r.json<EngineView>();
}

export async function engineCancel(env: Env, id: string): Promise<void> {
  await call(env, 'DELETE', `/jobs/${encodeURIComponent(id)}`).catch(() => null);
}

/** Is the engine answering right now, and what is it? — for the capabilities panel. */
export async function engineHealth(env: Env): Promise<{ ok: boolean; detail: string; track?: boolean }> {
  if (engineMode(env) === 'none') return { ok: false, detail: 'not configured' };
  try {
    const r = await call(env, 'GET', '/health', undefined, 25_000);
    const d = await r.json<{ ok?: boolean; ffmpeg?: string; features?: { track?: boolean } }>();
    return { ok: !!d.ok, detail: d.ffmpeg ?? '', track: d.features?.track === true };
  } catch (e) {
    return { ok: false, detail: String((e as Error).message ?? e).slice(0, 160) };
  }
}
