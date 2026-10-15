/**
 * The lead directory from the browser's side — /api/leaddir.php
 * (worker/src/routes/leaddir.ts). The owner's import loop lives here too,
 * because it is the same for the card on Platform services and anything that
 * later wants to drive it.
 */
import { API_BASE } from './apiBase';
import { sessionToken } from './auth';
import { getActiveAccountId } from './tenancy';
import { fileKey, readLeads, sourcesOf, type LeadRow, type PickedFile, type ReadProgress } from './leadImport';

export interface DirPerson {
  id: number; name: string; title: string; level: string; department: string; company: string; website: string; domain: string;
  email: string; phone: string; linkedin: string; industry: string; city: string; state: string; country: string;
  size: string; revenue: string; founded: string; keywords: string; revealed: boolean;
  postal?: string; address?: string; company_linkedin?: string; social?: string; codes?: string; technologies?: string;
  /** The file's own verdict on the email: valid | risky | invalid | unknown | '' — never our check. */
  email_status?: string;
  /** The file's other columns, as JSON; before a reveal their values read "hidden". */
  extra?: string;
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
  opts: { path?: string; skipDone?: boolean } = {},
): Promise<{ ok: boolean; error: string; code: string; importId: string; already?: boolean; rows?: number }> {
  let sources;
  try { sources = await sourcesOf(file); } catch (e) { return { ok: false, error: String((e as Error)?.message ?? e), code: 'unreadable', importId: '' }; }
  const st = await dirCall('import_start', { fileKey: fileKey(file, opts.path), name: opts.path || file.name, size: file.size, label, skipDone: opts.skipDone === true });
  if (!st.success) return { ok: false, error: String(st.error ?? 'Could not start.'), code: String(st.code ?? ''), importId: '' };
  /* A folder chosen again: the files that went in whole are not read twice. */
  if (st.done === true) return { ok: true, error: '', code: '', importId: String((st.import as { id?: string })?.id ?? ''), already: true };
  const imp = st.import as { id: string; rows_seen: number };
  const skip = Number(imp.rows_seen) || 0;
  on.start?.({ importId: imp.id, resumed: st.resumed === true, skipped: skip });
  let added = 0, duplicates = 0, bad = 0, sent = 0;
  try {
    const read = await readLeads(sources, {
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
    return { ok: true, error: '', code: '', importId: imp.id, rows: read.rows };
  } catch (e) {
    if ((e as DOMException)?.name === 'AbortError') {
      await dirCall('import_finish', { importId: imp.id, name: 'paused' });
      return { ok: false, error: 'Paused. Choose the same file again to carry on from here.', code: 'paused', importId: imp.id };
    }
    return { ok: false, error: String((e as Error)?.message ?? e), code: String((e as { code?: string })?.code ?? ''), importId: imp.id };
  }
}

/* ── A folder (or several files) at once ───────────────────────────────── */

export type FileStatus = 'waiting' | 'loading' | 'done' | 'already' | 'skipped' | 'failed' | 'paused';
export interface FileState { path: string; size: number; status: FileStatus; tick: ImportTick | null; error: string; note: string }

/**
 * Load every file of a folder (and its sub-folders), `parallel` at a time.
 * Each file is its own load — its own row on the Loads list, its own undo,
 * and its own resume — so choosing the same folder again after a pause skips
 * the files already in and carries each unfinished one on from its row.
 * A file that fails is reported on its line and the rest go on; only a full
 * database stops everything, because every later file would fail the same way.
 */
export async function importMany(
  files: PickedFile[], label: string,
  on: { change: (i: number, s: Partial<FileState>) => void },
  signal: AbortSignal,
  parallel = 2,
): Promise<{ done: number; already: number; skipped: number; failed: number; paused: boolean; full: string }> {
  let next = 0;
  let done = 0, already = 0, skipped = 0, failed = 0;
  let full = '';
  const worker = async () => {
    for (;;) {
      if (signal.aborted || full) return;
      const i = next++;
      if (i >= files.length) return;
      const { file, path } = files[i];
      on.change(i, { status: 'loading', error: '', note: '' });
      const r = await importFile(file, label, {
        start: s => { if (s.resumed) on.change(i, { note: `carrying on from row ${(s.skipped + 1).toLocaleString('en-US')}` }); },
        tick: t => on.change(i, { tick: t }),
        skipPart: (n, why) => on.change(i, { note: `skipped ${n}: ${why}` }),
      }, signal, { path, skipDone: true });
      if (r.ok && r.already) { already++; on.change(i, { status: 'already' }); }
      /* A file with no column for a person (notes, a price list) is read and passed over — said so, not counted as loaded. */
      else if (r.ok && r.rows === 0) { skipped++; on.change(i, { status: 'skipped' }); }
      else if (r.ok) { done++; on.change(i, { status: 'done' }); }
      else if (r.code === 'paused') { on.change(i, { status: 'paused' }); return; }
      else {
        failed++;
        on.change(i, { status: 'failed', error: r.error });
        if (r.code === 'full') full = r.error;
      }
    }
  };
  await Promise.all(Array.from({ length: Math.max(1, Math.min(parallel, files.length)) }, worker));
  return { done, already, skipped, failed, paused: signal.aborted, full };
}
