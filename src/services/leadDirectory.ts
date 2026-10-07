/**
 * The lead directory from the browser's side — /api/leaddir.php
 * (worker/src/routes/leaddir.ts). The owner's import loop lives here too,
 * because it is the same for the card on Platform services and anything that
 * later wants to drive it.
 */
import { API_BASE } from './apiBase';
import { sessionToken } from './auth';
import { getActiveAccountId } from './tenancy';
import { fileKey, readLeads, sourcesOf, type LeadRow, type ReadProgress } from './leadImport';

export interface DirPerson {
  id: number; name: string; title: string; level: string; department: string; company: string; website: string; domain: string;
  email: string; phone: string; linkedin: string; industry: string; city: string; state: string; country: string;
  size: string; revenue: string; founded: string; keywords: string; revealed: boolean;
}
export interface Facet { value: string; label: string; n: number }
export interface DirStatus {
  label: string; total: number; shared: boolean; trialEnded: boolean;
  left: { day: number; month: number } | null;
  industries: Facet[]; states: Facet[]; countries: Facet[]; levels: Facet[]; sizes: Facet[];
}
export interface DirImport {
  id: string; name: string; label: string; size: number; bytes_done: number; rows_seen: number; rows_added: number;
  rows_dup: number; rows_bad: number; status: string; error: string | null; started_at: string; updated_at: string; finished_at: string | null;
}
export interface DirAdmin {
  label: string; total: number; shared: boolean; attestedAt: string | null; imports: DirImport[];
  industries: Facet[]; states: Facet[]; removed: number; rowsPerBatch: number; budget: { day: number; month: number };
}

type Answer = Record<string, unknown> & { success?: boolean; error?: string; code?: string; field?: string };

export async function dirCall(action: string, extra: Record<string, unknown> = {}): Promise<Answer> {
  try {
    const r = await fetch(`${API_BASE}/api/leaddir.php`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action, token: sessionToken(), accountId: getActiveAccountId(), ...extra }),
    });
    const d = await r.json().catch(() => ({ success: false, error: `The server answered ${r.status}.`, code: r.status >= 500 ? 'server' : '' })) as Answer;
    if (r.status >= 500 && d.success !== true) d.code = d.code || 'server';
    return d;
  } catch {
    return { success: false, error: 'Could not reach the server.', code: 'offline' };
  }
}

export interface ImportRun {
  importId: string;
  resumed: boolean;
  skipped: number;
}

export interface ImportTick extends ReadProgress {
  added: number; duplicates: number; bad: number; sent: number;
  /** A failed request is retried; this says what is being waited on. */
  retrying: string;
}

const wait = (ms: number) => new Promise(r => setTimeout(r, ms));

/**
 * Load one file into the directory, resuming if the server has part of it.
 * Each batch is retried with growing pauses when the network or the server
 * falters — a 3-hour load should not die on one dropped request — but a
 * refusal that will not change (the database is full, not the owner) stops it.
 */
export async function importFile(
  file: File, label: string,
  on: { start?: (r: ImportRun) => void; tick?: (t: ImportTick) => void; skipPart?: (name: string, why: string) => void },
  signal: AbortSignal,
): Promise<{ ok: boolean; error: string; code: string; importId: string }> {
  const sources = await sourcesOf(file);
  const st = await dirCall('import_start', { fileKey: fileKey(file), name: file.name, size: file.size, label });
  if (!st.success) return { ok: false, error: String(st.error ?? 'Could not start.'), code: String(st.code ?? ''), importId: '' };
  const imp = st.import as { id: string; rows_seen: number };
  const skip = Number(imp.rows_seen) || 0;
  on.start?.({ importId: imp.id, resumed: st.resumed === true, skipped: skip });
  let added = 0, duplicates = 0, bad = 0, sent = 0;
  try {
    await readLeads(sources, {
      skip, batch: 500, signal,
      onSkipPart: on.skipPart,
      onProgress: p => on.tick?.({ ...p, added, duplicates, bad, sent, retrying: '' }),
    }, async (rows: LeadRow[], badHere: number, p) => {
      for (let attempt = 0; ; attempt++) {
        if (signal.aborted) throw new DOMException('Paused', 'AbortError');
        const d = await dirCall('import_rows', { importId: imp.id, rows, bad: badHere, bytesDone: p.bytes });
        if (d.success) {
          added += Number(d.added) || 0; duplicates += Number(d.duplicates) || 0; bad += (Number(d.bad) || 0) + badHere; sent += rows.length;
          on.tick?.({ ...p, added, duplicates, bad, sent, retrying: '' });
          return;
        }
        const transient = ['offline', 'server', 'write_failed'].includes(String(d.code));
        if (!transient || attempt >= 7) throw Object.assign(new Error(String(d.error ?? 'The server refused the rows.')), { code: String(d.code ?? '') });
        const pause = Math.min(60_000, 2000 * 2 ** attempt);
        on.tick?.({ ...p, added, duplicates, bad, sent, retrying: `${String(d.error ?? 'No answer')} — trying again in ${Math.round(pause / 1000)} s` });
        await wait(pause);
      }
    });
    await dirCall('import_finish', { importId: imp.id, bytesDone: file.size });
    return { ok: true, error: '', code: '', importId: imp.id };
  } catch (e) {
    if ((e as DOMException)?.name === 'AbortError') {
      await dirCall('import_finish', { importId: imp.id, name: 'paused' });
      return { ok: false, error: 'Paused. Choose the same file again to carry on from here.', code: 'paused', importId: imp.id };
    }
    return { ok: false, error: String((e as Error)?.message ?? e), code: String((e as { code?: string })?.code ?? ''), importId: imp.id };
  }
}
