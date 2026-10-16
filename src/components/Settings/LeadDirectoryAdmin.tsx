/**
 * Settings → Platform services → Lead library: the owner loads their own
 * lead files, watches them go in, decides whether customers' projects may
 * draw on them, takes a load back out, and removes a person who asks.
 *
 * Customers never browse the library (routes/leaddir.ts refuses them the
 * search). Opened, it feeds their projects' daily prospecting a few matching
 * people at a time, each labelled "Licensed business data" on the contact
 * (prospectFinderTick.ts `libraryStep`); the owner searches it on
 * Workspace → Lead library.
 *
 * Files are read in this browser a piece at a time (services/leadImport.ts)
 * so there is no upload limit — a 3 GB ZIP is fine. A whole folder can be
 * chosen or dropped, however many folders deep, and a ZIP may hold folders,
 * .gz files and more ZIPs; every lead file in it becomes its own load, two or
 * more read at once (importMany). Choosing the same folder or file again after
 * a pause, a closed tab or a dropped connection skips what is already in and
 * carries each unfinished file on from where the server says it stopped. The
 * screen is kept awake while it runs, where the browser allows it.
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import { AlertTriangle, CheckCircle, FileUp, FolderUp, Loader, Pause, RefreshCw, Trash2, Undo2, Users } from 'lucide-react';
import { dirCall, importMany, type DirAdmin, type FileState } from '../../services/leadDirectory';
import { FIELD_LABEL, pickedFromDrop, pickedFromList, previewFile, type FilePreview, type PickedFile } from '../../services/leadImport';
import { askConfirm } from '../shared/ConfirmDialog';

const INK = '#0f172a';
const MUTED = '#64748b';
const LINE = '#e6e9f0';

const fmtBytes = (n: number) => (n >= 1e9 ? `${(n / 1e9).toFixed(2)} GB` : n >= 1e6 ? `${(n / 1e6).toFixed(1)} MB` : `${Math.round(n / 1e3)} KB`);
const fmtN = (n: number) => n.toLocaleString('en-US');
function eta(ms: number) {
  const m = Math.round(ms / 60_000);
  return m < 1 ? 'under a minute' : m < 60 ? `${m} min` : `${Math.floor(m / 60)} h ${m % 60} min`;
}

export default function LeadDirectoryAdmin() {
  const [a, setA] = useState<DirAdmin | null>(null);
  const [error, setError] = useState('');
  const [code, setCode] = useState('');
  const [label, setLabel] = useState('');
  const [running, setRunning] = useState(false);
  /* One line per file of the folder (or the one file), as it goes in. */
  const [files, setFiles] = useState<FileState[]>([]);
  const [parallel, setParallel] = useState(2);
  const [dragOver, setDragOver] = useState(false);
  const [done, setDone] = useState('');
  const [attest, setAttest] = useState(false);
  const [removeEmail, setRemoveEmail] = useState('');
  const [msg, setMsg] = useState('');
  const [undoing, setUndoing] = useState('');
  /* Chosen files wait here, with what was detected in the first, until the owner says load them. */
  const [pending, setPending] = useState<PickedFile[] | null>(null);
  const [ignored, setIgnored] = useState<string[]>([]);
  const [preview, setPreview] = useState<FilePreview | null>(null);
  const [previewErr, setPreviewErr] = useState('');
  /* Time left, worked out as each batch lands — from the rate since this run began. */
  const [left, setLeft] = useState(0);
  const ctl = useRef<AbortController | null>(null);
  const started = useRef(0);
  const startBytes = useRef(0);

  const load = useCallback(async () => {
    const d = await dirCall('admin');
    if (d.success) { setA(d as unknown as DirAdmin); setError(''); setCode(''); } else { setError(String(d.error ?? 'Could not read the library.')); setCode(String(d.code ?? '')); }
  }, []);
  useEffect(() => { void load(); }, [load]);
  useEffect(() => () => ctl.current?.abort(), []);

  const choose = (got: { files: PickedFile[]; ignored: string[] }) => {
    setDone(''); setError(''); setPreview(null); setPreviewErr(''); setFiles([]);
    setIgnored(got.ignored);
    if (!got.files.length) {
      setPending(null);
      setPreviewErr(got.ignored.length ? 'None of these is a lead file. Lead files are CSV, TSV or TXT, or a ZIP or .gz holding them.' : 'Nothing was chosen.');
      return;
    }
    setPending(got.files);
    previewFile(got.files[0].file).then(setPreview).catch(err => setPreviewErr(err instanceof Error ? err.message : 'Could not read this file.'));
  };

  const run = async (chosen: PickedFile[]) => {
    setRunning(true); setDone(''); setMsg(''); setLeft(0); setError('');
    setFiles(chosen.map(f => ({ path: f.path, size: f.file.size, status: 'waiting', tick: null, error: '', note: '' })));
    const c = new AbortController(); ctl.current = c;
    /* A screen that sleeps stops the tab; the load stops with it. */
    let lock: { release: () => Promise<void> } | null = null;
    try { lock = await (navigator as unknown as { wakeLock?: { request: (t: string) => Promise<{ release: () => Promise<void> }> } }).wakeLock?.request('screen') ?? null; } catch { /* not offered */ }
    started.current = Date.now(); startBytes.current = -1;
    const name = label.trim() || (chosen.length > 1 ? chosen[0].path.split('/')[0] : chosen[0].file.name.replace(/\.(zip|csv|gz|tsv|txt)$/gi, ''));
    const r = await importMany(chosen, name, {
      change: (i, patch) => setFiles(list => list.map((f, n) => (n === i ? { ...f, ...patch } : f))),
    }, c.signal, parallel);
    try { await lock?.release(); } catch { /* already released */ }
    setRunning(false); ctl.current = null;
    if (r.full) setError(r.full);
    else if (r.paused) setDone('');
    else {
      const parts = [
        r.done && `${fmtN(r.done)} ${r.done === 1 ? 'file' : 'files'} loaded`,
        r.already && `${fmtN(r.already)} already in from before`,
        r.skipped && `${fmtN(r.skipped)} passed over (no column for a name or an email)`,
        r.failed && `${fmtN(r.failed)} could not be read (see below)`,
      ].filter(Boolean);
      setDone(`Finished: ${parts.join(', ')}. Duplicates and rows with nobody in them were left out.`);
    }
    void load();
  };

  /* Overall progress across every file: a file's share is its size on disk. */
  const totalBytes = files.reduce((s, f) => s + f.size, 0);
  const doneBytes = files.reduce((s, f) => s + (f.status === 'done' || f.status === 'already' || f.status === 'skipped' ? f.size
    : f.tick && f.tick.totalBytes ? f.size * Math.min(1, f.tick.bytes / f.tick.totalBytes) : 0), 0);
  const sum = (k: 'added' | 'duplicates' | 'bad' | 'rows') => files.reduce((s, f) => s + (f.tick?.[k] ?? 0), 0);
  useEffect(() => {
    if (!running) return;
    if (startBytes.current < 0 && doneBytes > 0) { startBytes.current = doneBytes; started.current = Date.now(); return; }
    const elapsed = Date.now() - started.current;
    const rate = elapsed > 4000 && startBytes.current >= 0 ? (doneBytes - startBytes.current) / elapsed : 0;
    setLeft(rate > 0 ? (totalBytes - doneBytes) / rate : 0);
  }, [running, doneBytes, totalBytes]);

  const undo = async (id: string) => {
    if (!await askConfirm({ title: 'Undo this load?', message: 'Everybody this load added is taken back out of the library. People who were already in it from another load stay.', confirmLabel: 'Undo the load', danger: true })) return;
    setUndoing(id);
    for (let i = 0; i < 5000; i++) {
      const d = await dirCall('import_undo', { importId: id });
      if (!d.success) { setError(String(d.error ?? 'Could not undo it.')); break; }
      if (d.done) break;
    }
    setUndoing('');
    void load();
  };

  const share = async (on: boolean) => {
    const d = await dirCall('settings', { shared: on, attest: on ? attest : undefined });
    if (!d.success) { setError(String(d.error ?? 'Could not save.')); return; }
    setError(''); void load();
  };

  const remove = async () => {
    const d = await dirCall('remove', { email: removeEmail.trim() });
    if (!d.success) { setError(String(d.error ?? 'Could not remove.')); return; }
    /* Their details may already be in customers' CRMs through a project's daily
       prospecting; the owner has to pass the request on (GDPR Art. 19). */
    const passed = Array.isArray(d.passedTo) ? d.passedTo.length : 0;
    const told = passed ? ` Their details had been given to ${passed} customer workspace${passed === 1 ? '' : 's'} by daily prospecting — tell ${passed === 1 ? 'that customer' : 'those customers'} to delete them too.` : '';
    setMsg((Number(d.removed) ? `Removed, and kept out of any later load.` : `Nobody with that address is in the library now; it is kept out of any later load.`) + told);
    setRemoveEmail(''); void load();
  };

  const pct = totalBytes ? Math.min(100, (doneBytes / totalBytes) * 100) : 0;
  const pendingBytes = (pending ?? []).reduce((s, f) => s + f.file.size, 0);

  return (
    <div style={{ background: '#fff', borderRadius: 18, border: `1px solid ${LINE}`, padding: 'clamp(16px, 3vw, 24px)', minWidth: 0, display: 'grid', gap: 14 }} data-testid="lead-directory-admin">
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
        <Users size={18} color="#4f46e5" />
        <h3 style={{ fontSize: 16, fontWeight: 700, color: INK, margin: 0, flex: 1, minWidth: 180 }}>Lead library — your own leads</h3>
        <button onClick={() => void load()} style={btn}><RefreshCw size={12} /> Refresh</button>
      </div>
      <p style={{ fontSize: 13, color: MUTED, margin: 0, lineHeight: 1.6 }}>
        Load your own lead files — a CSV, a ZIP or .csv.gz, several files, or a whole folder with folders inside it, of any
        size. Everything is read here in your browser a piece at a time, so there is no upload limit, and several files go in at once. Before it loads you see which column became which field; columns it does not recognise are kept with each person under their own name. Only you
        search them, on <strong>Workspace → Lead library</strong>. Customers never browse them: when you open the library,
        the daily prospecting in their business workspaces may be given a few matching people each day — checked first, never twice, and
        labelled <strong>“Licensed business data”</strong> on every contact.
      </p>

      {code === 'no_database' && (
        <div role="status" style={note('#fff7ed', '#9a3412')}>{error}</div>
      )}
      {error && code !== 'no_database' && <div role="alert" style={note('#fef2f2', '#b42318')}>{error}</div>}

      {a && (
        <>
          <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
            <Stat label="People in the library" value={fmtN(a.total)} />
            <Stat label="Business workspaces may draw on it" value={a.shared ? 'Yes' : 'Not yet'} />
            <Stat label="Removed on request" value={fmtN(a.removed)} />
          </div>
          {!!a.industries.length && (
            <div style={{ fontSize: 12, color: MUTED, lineHeight: 1.8 }}>
              Largest industries: {a.industries.slice(0, 8).map(f => `${f.label} (${fmtN(f.n)})`).join(' · ')}
              {!!a.states.length && <><br />Largest states: {a.states.slice(0, 8).map(f => `${f.label} (${fmtN(f.n)})`).join(' · ')}</>}
            </div>
          )}

          {/* ── Load files or a folder ── */}
          <div style={{ border: `1px solid ${LINE}`, borderRadius: 14, padding: 14, display: 'grid', gap: 10 }}>
            <div style={{ fontSize: 13.5, fontWeight: 700, color: INK }}>Load files or a folder</div>
            <label style={{ display: 'grid', gap: 4, fontSize: 12, color: MUTED }}>
              Where these came from (shown to you only)
              <input data-field="leaddir.label" value={label} onChange={e => setLabel(e.target.value)} placeholder="e.g. Leads.cm — US real estate, Oct 2026" style={input} disabled={running} />
            </label>
            <div data-testid="lead-drop"
              onDragOver={e => { if (running) return; e.preventDefault(); setDragOver(true); }}
              onDragLeave={() => setDragOver(false)}
              onDrop={e => { e.preventDefault(); setDragOver(false); if (running) return; void pickedFromDrop(e.dataTransfer).then(choose).catch(err => setPreviewErr(String((err as Error)?.message ?? err))); }}
              style={{ border: `2px dashed ${dragOver ? '#6366f1' : '#cbd5e1'}`, background: dragOver ? '#eef2ff' : '#fafbff', borderRadius: 14, padding: 'clamp(14px, 3vw, 22px)', display: 'grid', gap: 10, justifyItems: 'center', textAlign: 'center', transition: 'background .15s, border-color .15s' }}>
              <FolderUp size={26} color="#6366f1" />
              <div style={{ fontSize: 13, color: '#334155', lineHeight: 1.5 }}>
                <strong>Drop a folder or files here</strong> — folders inside folders are read to the bottom.<br />
                <span style={{ color: MUTED }}>CSV, TSV, TXT, ZIP (folders and ZIPs inside it too) or .csv.gz · no size limit</span>
              </div>
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', justifyContent: 'center' }}>
                <label style={{ ...btn, background: running ? '#f1f5f9' : '#4f46e5', color: running ? MUTED : '#fff', borderColor: 'transparent', cursor: running ? 'default' : 'pointer', minHeight: 40 }}>
                  <FolderUp size={13} /> Choose a folder
                  <input data-field="leaddir.folder" type="file" multiple disabled={running} style={{ display: 'none' }}
                    {...{ webkitdirectory: '', directory: '' } as Record<string, string>}
                    onChange={e => { const l = e.target.files; if (l) choose(pickedFromList(l)); e.target.value = ''; }} />
                </label>
                <label style={{ ...btn, cursor: running ? 'default' : 'pointer', minHeight: 40, color: running ? MUTED : INK }}>
                  <FileUp size={13} /> {running ? 'Loading…' : 'Choose files'}
                  <input data-field="leaddir.file" type="file" multiple accept=".csv,.zip,.gz,.tsv,.txt" disabled={running} style={{ display: 'none' }}
                    onChange={e => { const l = e.target.files; if (l) choose(pickedFromList(l)); e.target.value = ''; }} />
                </label>
              </div>
            </div>
            {previewErr && !pending && <div role="alert" style={note('#fef2f2', '#b42318')}>{previewErr}</div>}
            {pending && !running && (
              <div style={{ display: 'grid', gap: 8, border: `1px solid ${LINE}`, borderRadius: 12, padding: 12, background: '#fafbff' }} data-testid="lead-preview">
                <div style={{ fontSize: 13, fontWeight: 700, color: INK, overflowWrap: 'anywhere' }}>
                  {pending.length === 1 ? pending[0].path : `${fmtN(pending.length)} lead files`} · {fmtBytes(pendingBytes)}
                </div>
                {pending.length > 1 && (
                  <details style={{ fontSize: 12, color: '#334155' }}>
                    <summary style={{ cursor: 'pointer', color: '#4f46e5', fontWeight: 700 }}>See the {fmtN(pending.length)} files</summary>
                    <div style={{ maxHeight: 220, overflow: 'auto', marginTop: 6, display: 'grid', gap: 2 }}>
                      {pending.map(f => <div key={f.path} style={{ overflowWrap: 'anywhere' }}>{f.path} <span style={{ color: MUTED }}>· {fmtBytes(f.file.size)}</span></div>)}
                    </div>
                  </details>
                )}
                {!!ignored.length && (
                  <div style={{ fontSize: 12, color: MUTED, overflowWrap: 'anywhere' }}>
                    Left out, not lead files: {ignored.slice(0, 6).join(', ')}{ignored.length > 6 ? ` and ${fmtN(ignored.length - 6)} more` : ''}.
                  </div>
                )}
                {previewErr && <div role="alert" style={note('#fef2f2', '#b42318')}>{previewErr}</div>}
                {!preview && !previewErr && <div style={{ fontSize: 12, color: MUTED }}><Loader size={12} className="spin" /> Reading the columns…</div>}
                {preview && <>
                  <div style={{ fontSize: 12, color: MUTED, lineHeight: 1.6 }}>
                    {pending.length > 1 ? `Showing the first file, ${pending[0].path}${preview.parts.length > 1 ? ` (${preview.parts[0]})` : ''}. Every file is matched by its own header, and one with no name or email column is passed over and named. `
                      : preview.parts.length > 1 ? `${preview.parts.length} files in the ZIP — showing the first, ${preview.parts[0]}. Each is matched by its own header. ` : ''}
                    Read as {preview.encoding.toUpperCase()}, columns separated by {preview.delimiter === ',' ? 'commas' : preview.delimiter === ';' ? 'semicolons' : preview.delimiter === '|' ? 'pipes' : 'tabs'}.
                    {' '}<strong>{preview.columns.filter(c => c.to !== 'kept' && c.to !== 'blank').length}</strong> of {preview.columns.length} columns matched a field;
                    the other {preview.columns.filter(c => c.to === 'kept').length} are kept with each person under their own name — nothing in the file is thrown away.
                  </div>
                  {!preview.usable && <div role="alert" style={note(pending.length > 1 ? '#fff7ed' : '#fef2f2', pending.length > 1 ? '#9a3412' : '#b42318')}>No column in {pending.length > 1 ? 'this first file' : 'this file'} holds a name or an email address{pending.length > 1 ? ', so it will be passed over; the other files are still read.' : ', so nobody could be loaded from it. Check the file has a header row.'}</div>}
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                    {preview.columns.map((c, i) => (
                      <span key={i} title={c.to === 'kept' ? 'Kept as it is, under this name' : c.to === 'blank' ? 'This column has no header' : `Becomes: ${FIELD_LABEL[c.to]}`}
                        style={{ fontSize: 11.5, padding: '3px 8px', borderRadius: 8, border: `1px solid ${c.to === 'kept' || c.to === 'blank' ? LINE : '#c7d2fe'}`, background: c.to === 'kept' || c.to === 'blank' ? '#fff' : '#eef2ff', color: c.to === 'blank' ? '#94a3b8' : INK, overflowWrap: 'anywhere' }}>
                        {c.header || '(no header)'} <span style={{ color: MUTED }}>→ {c.to === 'kept' ? 'kept as is' : c.to === 'blank' ? 'skipped' : FIELD_LABEL[c.to]}</span>
                      </span>
                    ))}
                  </div>
                  {!!preview.sample.length && (
                    <div style={{ fontSize: 11.5, color: '#334155', lineHeight: 1.6 }}>
                      <strong>First people, as they will be kept:</strong>
                      {preview.sample.map((r, i) => (
                        <div key={i} style={{ overflowWrap: 'anywhere' }}>
                          {[r.name || [r.first, r.last].filter(Boolean).join(' '), r.title, r.company, r.email, r.phone, [r.city, r.state, r.country].filter(Boolean).join(', ')].filter(Boolean).join(' · ')}
                          {r.emailStatus ? <span style={{ color: MUTED }}> · file says the email is “{r.emailStatus}”</span> : null}
                        </div>
                      ))}
                    </div>
                  )}
                </>}
                {(preview || previewErr) && (
                  <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
                    {pending.length > 1 && (
                      <label style={{ display: 'inline-flex', gap: 6, alignItems: 'center', fontSize: 12, color: '#334155' }}>
                        Files at once
                        <select value={parallel} onChange={e => setParallel(Number(e.target.value))} style={{ ...input, padding: '6px 8px' }} data-field="leaddir.parallel">
                          {[1, 2, 3, 4].map(n => <option key={n} value={n}>{n}</option>)}
                        </select>
                      </label>
                    )}
                    <button data-testid="lead-preview-go" disabled={pending.length === 1 && !preview?.usable} onClick={() => { const f = pending; setPending(null); setPreview(null); void run(f); }}
                      style={{ ...btn, background: pending.length > 1 || preview?.usable ? '#4f46e5' : '#f1f5f9', color: pending.length > 1 || preview?.usable ? '#fff' : MUTED, borderColor: 'transparent', minHeight: 38 }}>
                      <FileUp size={12} /> {pending.length > 1 ? `Load all ${fmtN(pending.length)} files` : 'Load these people'}
                    </button>
                    <button onClick={() => { setPending(null); setPreview(null); setIgnored([]); }} style={{ ...btn, minHeight: 38 }}>Choose something else</button>
                  </div>
                )}
              </div>
            )}
            {!!files.length && (
              <div style={{ display: 'grid', gap: 8 }} data-testid="lead-import-progress">
                <div style={{ height: 8, borderRadius: 99, background: '#eef2ff', overflow: 'hidden' }}>
                  <div style={{ width: `${pct}%`, height: '100%', background: 'linear-gradient(90deg,#6366f1,#ec4899)', transition: 'width .4s' }} />
                </div>
                <div style={{ fontSize: 12, color: '#334155', lineHeight: 1.6 }}>
                  {pct.toFixed(1)}% · {fmtBytes(doneBytes)} of {fmtBytes(totalBytes)}
                  {files.length > 1 && <> · {fmtN(files.filter(f => f.status === 'done' || f.status === 'already' || f.status === 'skipped').length)} of {fmtN(files.length)} files done</>}
                  <br />{fmtN(sum('rows'))} rows read · <strong>{fmtN(sum('added'))} added</strong> · {fmtN(sum('duplicates'))} already there · {fmtN(sum('bad'))} with nobody in them
                  {running && left > 0 && <> · about {eta(left)} left</>}
                </div>
                <div style={{ display: 'grid', gap: 4, maxHeight: 300, overflow: 'auto', border: `1px solid ${LINE}`, borderRadius: 10, padding: 6 }}>
                  {files.map(f => {
                    const share = f.status === 'done' || f.status === 'already' ? 100 : f.tick && f.tick.totalBytes ? Math.min(100, (f.tick.bytes / f.tick.totalBytes) * 100) : 0;
                    const tone = f.status === 'failed' ? '#b42318' : f.status === 'skipped' ? '#9a3412' : f.status === 'done' || f.status === 'already' ? '#0f7b3d' : f.status === 'loading' ? '#4f46e5' : MUTED;
                    return (
                      <div key={f.path} data-file-status={f.status} style={{ display: 'grid', gridTemplateColumns: 'minmax(0,1fr) auto', gap: '2px 10px', fontSize: 12, padding: '5px 6px', borderRadius: 8, background: f.status === 'loading' ? '#f5f3ff' : undefined }}>
                        <span style={{ overflowWrap: 'anywhere', color: INK }}>{f.path}</span>
                        <span style={{ color: tone, fontWeight: 700, whiteSpace: 'nowrap', display: 'inline-flex', gap: 4, alignItems: 'center' }}>
                          {f.status === 'loading' && <Loader size={11} className="spin" />}
                          {f.status === 'failed' && <AlertTriangle size={11} />}
                          {f.status === 'waiting' ? 'waiting' : f.status === 'loading' ? `${share.toFixed(0)}%` : f.status === 'done' ? `done · ${fmtN(f.tick?.added ?? 0)} added` : f.status === 'already' ? 'already loaded' : f.status === 'paused' ? 'paused' : f.status === 'skipped' ? 'passed over' : 'not loaded'}
                        </span>
                        {(f.error || f.note || f.tick?.retrying) && (
                          <span style={{ gridColumn: '1 / -1', color: f.error ? '#b42318' : f.tick?.retrying ? '#9a3412' : MUTED, overflowWrap: 'anywhere' }}>{f.error || f.tick?.retrying || f.note}</span>
                        )}
                      </div>
                    );
                  })}
                </div>
                {running && <>
                  <div style={{ fontSize: 11.5, color: MUTED }}>Keep this tab open. If it stops for any reason, choose the same folder or files again — finished files are skipped and the rest carry on from where they got to.</div>
                  <button onClick={() => ctl.current?.abort()} style={{ ...btn, justifySelf: 'start' }}><Pause size={12} /> Pause</button>
                </>}
              </div>
            )}
            {done && <div role="status" style={note('#e8f6ee', '#0f7b3d')}><CheckCircle size={12} /> {done}</div>}
          </div>

          {/* ── Loads so far ── */}
          {!!a.imports.length && (
            <div style={{ display: 'grid', gap: 6 }}>
              <div style={{ fontSize: 13.5, fontWeight: 700, color: INK }}>Loads</div>
              {a.imports.map(i => (
                <div key={i.id} style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap', border: `1px solid ${LINE}`, borderRadius: 10, padding: '8px 12px', fontSize: 12.5 }}>
                  <span style={{ flex: '1 1 220px', minWidth: 0, color: INK, overflowWrap: 'anywhere' }}>
                    <strong>{i.label || i.name}</strong>{i.label && i.name !== i.label ? <span style={{ color: MUTED }}> · {i.name}</span> : null}
                    <br /><span style={{ color: MUTED }}>{new Date(i.started_at).toLocaleString()} · {fmtN(i.rows_added)} added · {fmtN(i.rows_dup)} duplicates · {fmtN(i.rows_seen)} rows read</span>
                    {i.error && <><br /><span style={{ color: '#b42318' }}>{i.error}</span></>}
                  </span>
                  <span style={{ fontSize: 11, fontWeight: 700, padding: '3px 9px', borderRadius: 999, background: i.status === 'done' ? '#e8f6ee' : i.status === 'failed' ? '#fef2f2' : '#f1f5f9', color: i.status === 'done' ? '#0f7b3d' : i.status === 'failed' ? '#b42318' : '#475569' }}>
                    {i.status === 'running' && !running ? 'stopped — choose the file again' : i.status}
                  </span>
                  {i.status !== 'undone' && i.rows_added > 0 && (
                    <button onClick={() => void undo(i.id)} disabled={!!undoing || running} style={btn}>
                      {undoing === i.id ? <Loader size={12} className="spin" /> : <Undo2 size={12} />} Undo this load
                    </button>
                  )}
                </div>
              ))}
            </div>
          )}

          {/* ── Customers' projects ── */}
          <div style={{ border: `1px solid ${LINE}`, borderRadius: 14, padding: 14, display: 'grid', gap: 8 }}>
            <div style={{ fontSize: 13.5, fontWeight: 700, color: INK }}>Let customers' business workspaces draw on it</div>
            {a.shared ? (
              <>
                <div style={{ fontSize: 12.5, color: '#334155', lineHeight: 1.6 }}>
                  Open{a.attestedAt ? ` (you confirmed the right to share it on ${new Date(a.attestedAt).toLocaleDateString()})` : ''}: the daily prospecting in customers'
                  business workspaces may be given people whose industry and place match it — at most half of a day's leads, each
                  address checked, labelled “Licensed business data”. Customers still cannot search it.
                </div>
                <button onClick={() => void share(false)} style={{ ...btn, justifySelf: 'start' }}>Close it</button>
              </>
            ) : (
              <>
                <div style={{ fontSize: 12.5, color: '#334155', lineHeight: 1.6 }}>
                  Closed: only you use it. Most lead sellers license their data to the buyer alone — passing records into your
                  customers' CRMs, even a few a day through their business workspaces, needs a licence that allows it, and may make you a
                  data broker in some places (docs/LEAD-DIRECTORY.md §7). Check both before opening it.
                </div>
                <label style={{ display: 'flex', gap: 8, alignItems: 'flex-start', fontSize: 12.5, color: INK }}>
                  <input data-field="leaddir.attest" type="checkbox" checked={attest} onChange={e => setAttest(e.target.checked)} style={{ marginTop: 3 }} />
                  I hold the right to share these records with my customers, and I will remove anybody who asks.
                </label>
                <button onClick={() => void share(true)} style={{ ...btn, justifySelf: 'start' }}>Open it to customers' business workspaces</button>
              </>
            )}
          </div>

          {/* ── Remove a person ── */}
          <div style={{ border: `1px solid ${LINE}`, borderRadius: 14, padding: 14, display: 'grid', gap: 8 }}>
            <div style={{ fontSize: 13.5, fontWeight: 700, color: INK }}>Remove a person who asks</div>
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              <input data-field="leaddir.remove" value={removeEmail} onChange={e => setRemoveEmail(e.target.value)} placeholder="their email address" style={{ ...input, flex: '1 1 220px' }} />
              <button onClick={() => void remove()} style={btn}><Trash2 size={12} /> Remove</button>
            </div>
            {msg && <div style={{ fontSize: 12, color: '#0f7b3d' }}>{msg}</div>}
          </div>
        </>
      )}
      {!a && !error && <div style={{ fontSize: 12.5, color: MUTED }}><Loader size={12} className="spin" /> Reading…</div>}
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div style={{ border: `1px solid ${LINE}`, borderRadius: 12, padding: '10px 14px', minWidth: 150, flex: '1 1 150px' }}>
      <div style={{ fontSize: 11.5, color: MUTED }}>{label}</div>
      <div style={{ fontSize: 18, fontWeight: 800, color: INK }}>{value}</div>
    </div>
  );
}

const btn: React.CSSProperties = {
  display: 'inline-flex', alignItems: 'center', gap: 6, padding: '7px 12px', borderRadius: 9, border: `1px solid ${LINE}`,
  background: '#fff', color: INK, fontSize: 12, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit',
};
const input: React.CSSProperties = { padding: '8px 10px', borderRadius: 9, border: `1px solid ${LINE}`, fontSize: 13, fontFamily: 'inherit', color: INK, minWidth: 0 };
const note = (bg: string, fg: string): React.CSSProperties => ({ fontSize: 12.5, color: fg, background: bg, borderRadius: 10, padding: '10px 12px', lineHeight: 1.55, display: 'flex', gap: 6, alignItems: 'center' });
