/**
 * The owner's OpenAI keys, and the one job they do today: turning a voice
 * message into words.
 *
 * ── Why OpenAI for this ──
 *
 * The owner's test (2026-11-14): "my business name is Azeem Dental, based in
 * Virginia" came back from Gemini as a different sentence. OpenAI's
 * transcription models are the ones ChatGPT's own voice typing uses, and the
 * owner holds OpenAI keys in bulk. So a recording goes to OpenAI first when a
 * key is stored, and to the Gemini transcriber (routes/intake.ts) when none
 * is, or when every key fails — the customer is never left without words.
 *
 * ── Never a hard-coded model ──
 *
 * CLAUDE.md: models are read from the key's own list. `pickTranscriber`
 * takes the best transcription model the key can use — a full
 * "…-transcribe" model before a "-mini" one, the newest name first, never a
 * diarising or realtime variant — and Whisper only when nothing else is
 * listed. The list is kept per key for an hour in this isolate.
 *
 * ── Many keys ──
 *
 * Tried in order. A key that is rate-limited rests two minutes; refused
 * (401/403, no credit) half an hour; stored in `crm_openai_keys` so the
 * owner's screen says which key failed and what OpenAI said — never the key.
 */
import { decryptSecret } from './crypto';
import { installSecret, nowIso, type Env } from './db';

export const OPENAI_KEY = /^sk-(?!or-|ant-)[A-Za-z0-9_-]{20,}$/;

const base = (env: Env) => (env.OPENAI_BASE ?? '').trim().replace(/\/$/, '') || 'https://api.openai.com';

/** Anything that looks like a key, scrubbed out of an error before it is stored or shown. */
export const scrub = (s: string) => s.replace(/sk-[A-Za-z0-9_-]{8,}/g, 'sk-…').slice(0, 240);

async function errorOf(res: Response): Promise<string> {
  const t = await res.text().catch(() => '');
  try { return scrub((JSON.parse(t) as { error?: { message?: string } }).error?.message || t || `HTTP ${res.status}`); } catch { return scrub(t || `HTTP ${res.status}`); }
}

/** The key's models, or why OpenAI refused it. One cheap GET — the proof a key is real before it is kept. */
export async function listOpenAiModels(env: Env, key: string): Promise<{ ok: true; models: string[] } | { ok: false; status: number; error: string }> {
  try {
    const res = await fetch(`${base(env)}/v1/models`, { headers: { Authorization: `Bearer ${key}` }, signal: AbortSignal.timeout(12_000) });
    if (!res.ok) return { ok: false, status: res.status, error: await errorOf(res) };
    const j = await res.json() as { data?: { id?: string }[] };
    return { ok: true, models: (j.data ?? []).map(m => String(m.id ?? '')).filter(Boolean) };
  } catch (e) {
    return { ok: false, status: 0, error: e instanceof Error && /abort|timeout/i.test(`${e.name} ${e.message}`) ? 'OpenAI did not answer in time.' : 'Could not reach OpenAI.' };
  }
}

/** The best transcription model in a key's list, or '' when it has none. */
export function pickTranscriber(models: string[]): string {
  const full = models.filter(m => /transcribe/i.test(m) && !/diariz|realtime|search/i.test(m));
  const rank = (m: string) => (/mini/i.test(m) ? 1 : 0);
  full.sort((a, b) => rank(a) - rank(b) || b.localeCompare(a));
  if (full.length) return full[0];
  return models.filter(m => /^whisper/i.test(m)).sort((a, b) => b.localeCompare(a))[0] ?? '';
}

export interface OpenAiKey { id: string; key: string; label: string }

export async function readOpenAiKeys(env: Env): Promise<OpenAiKey[]> {
  const { results } = await env.DB.prepare(
    'SELECT id, label, credentials, resting_until FROM crm_openai_keys ORDER BY position, created_at',
  ).all<{ id: string; label: string; credentials: string; resting_until: string | null }>().catch(() => ({ results: [] as { id: string; label: string; credentials: string; resting_until: string | null }[] }));
  if (!results?.length) return [];
  const secret = await installSecret(env.DB, 'mailbox_key');
  const now = nowIso();
  const out: (OpenAiKey & { resting: boolean })[] = [];
  for (const r of results) {
    try { out.push({ id: r.id, label: r.label, key: await decryptSecret(secret, r.credentials), resting: !!r.resting_until && r.resting_until > now }); } catch { /* unreadable: skipped */ }
  }
  /* Resting keys last, not dropped: when every key is resting one may have recovered. */
  return [...out.filter(k => !k.resting), ...out.filter(k => k.resting)].map(({ resting: _r, ...k }) => k);
}

export async function noteOpenAiKey(env: Env, id: string, ok: boolean, status = 0, error = ''): Promise<void> {
  if (ok) {
    await env.DB.prepare('UPDATE crm_openai_keys SET last_ok_at = ?, resting_until = NULL WHERE id = ?').bind(nowIso(), id).run().catch(() => {});
    return;
  }
  const restMs = status === 429 ? 2 * 60_000 : [401, 403].includes(status) ? 30 * 60_000 : 60_000;
  await env.DB.prepare('UPDATE crm_openai_keys SET last_failed_at = ?, last_error = ?, resting_until = ? WHERE id = ?')
    .bind(nowIso(), scrub(error), new Date(Date.now() + restMs).toISOString(), id).run().catch(() => {});
}

const modelCache = new Map<string, { at: number; model: string }>();

async function transcriberFor(env: Env, k: OpenAiKey): Promise<{ model: string; status: number; error: string }> {
  const hit = modelCache.get(k.id);
  if (hit && Date.now() - hit.at < 3_600_000) return { model: hit.model, status: 200, error: '' };
  const m = await listOpenAiModels(env, k.key);
  if (!m.ok) return { model: '', status: m.status, error: m.error };
  const model = pickTranscriber(m.models);
  modelCache.set(k.id, { at: Date.now(), model });
  return { model, status: 200, error: model ? '' : 'This key has no transcription model.' };
}

/**
 * A recording → its words, on the first OpenAI key that answers. `prompt` is
 * the screen's hint (the question being answered, names already known):
 * OpenAI's models take it to spell names the way the speaker means them.
 */
export async function transcribeOpenAi(env: Env, audio: Uint8Array, mime: string, language: string, prompt: string): Promise<
  { ok: true; text: string; model: string } | { ok: false; error: string; noKeys: boolean }
> {
  const keys = await readOpenAiKeys(env);
  if (!keys.length) return { ok: false, error: 'No OpenAI key is stored.', noKeys: true };
  const ext = /webm/.test(mime) ? 'webm' : /ogg/.test(mime) ? 'ogg' : /mp4|m4a|aac/.test(mime) ? 'm4a' : /mpeg|mp3/.test(mime) ? 'mp3' : 'wav';
  let last = '';
  for (const k of keys.slice(0, 6)) {
    const t = await transcriberFor(env, k);
    if (!t.model) { await noteOpenAiKey(env, k.id, false, t.status, t.error); last = t.error; continue; }
    const form = new FormData();
    form.append('file', new Blob([audio.slice().buffer as ArrayBuffer], { type: mime || 'audio/wav' }), `voice.${ext}`);
    form.append('model', t.model);
    form.append('response_format', 'json');
    if (/^[a-z]{2}$/.test(language.slice(0, 2)) && language.length >= 2) form.append('language', language.slice(0, 2).toLowerCase());
    if (prompt) form.append('prompt', prompt.slice(0, 600));
    let res: Response;
    try {
      res = await fetch(`${base(env)}/v1/audio/transcriptions`, { method: 'POST', headers: { Authorization: `Bearer ${k.key}` }, body: form, signal: AbortSignal.timeout(30_000) });
    } catch {
      await noteOpenAiKey(env, k.id, false, 0, 'OpenAI did not answer in time.');
      last = 'OpenAI did not answer in time.';
      continue;
    }
    if (res.ok) {
      const j = await res.json().catch(() => ({})) as { text?: string };
      await noteOpenAiKey(env, k.id, true);
      return { ok: true, text: String(j.text ?? '').trim(), model: t.model };
    }
    last = await errorOf(res);
    /* The recording's own fault (a 400 about the file) is not the next key's to repeat. */
    if (res.status === 400 && !/model/i.test(last)) return { ok: false, error: last, noKeys: false };
    if (res.status === 404 || /model/i.test(last)) modelCache.delete(k.id);
    await noteOpenAiKey(env, k.id, false, res.status, last);
  }
  return { ok: false, error: last || 'Every OpenAI key failed.', noKeys: false };
}
