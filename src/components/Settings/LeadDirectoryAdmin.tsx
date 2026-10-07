/**
 * Settings → Platform services → Lead directory: the owner loads their own
 * lead files, watches them go in, opens the directory to customers, takes a
 * load back out, and removes a person who asks.
 *
 * The file is read in this browser a piece at a time (services/leadImport.ts)
 * so there is no upload limit — a 3 GB ZIP is fine — and choosing the same
 * file again after a pause, a closed tab or a dropped connection carries on
 * where the server says it stopped. The screen is kept awake while it runs,
 * where the browser allows it.
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import { CheckCircle, FileUp, Loader, Pause, RefreshCw, Trash2, Undo2, Users } from 'lucide-react';
import { dirCall, importFile, type DirAdmin, type ImportTick } from '../../services/leadDirectory';

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
  const [tick, setTick] = useState<ImportTick | null>(null);
  const [runNote, setRunNote] = useState('');
  const [done, setDone] = useState('');
  const [attest, setAttest] = useState(false);
  const [removeEmail, setRemoveEmail] = useState('');
  const [msg, setMsg] = useState('');
  const [undoing, setUndoing] = useState('');
  /* Time left, worked out as each batch lands — from the rate since this run began. */
  const [left, setLeft] = useState(0);
  const ctl = useRef<AbortController | null>(null);
  const started = useRef(0);
  const startBytes = useRef(0);

  const load = useCallback(async () => {
    const d = await dirCall('admin');
    if (d.success) { setA(d as unknown as DirAdmin); setError(''); setCode(''); } else { setError(String(d.error ?? 'Could not read the directory.')); setCode(String(d.code ?? '')); }
  }, []);
  useEffect(() => { void load(); }, [load]);
  useEffect(() => () => ctl.current?.abort(), []);

  const run = async (file: File) => {
    setRunning(true); setDone(''); setRunNote(''); setTick(null); setMsg(''); setLeft(0);
    const c = new AbortController(); ctl.current = c;
    /* A screen that sleeps stops the tab; the load stops with it. */
    let lock: { release: () => Promise<void> } | null = null;
    try { lock = await (navigator as unknown as { wakeLock?: { request: (t: string) => Promise<{ release: () => Promise<void> }> } }).wakeLock?.request('screen') ?? null; } catch { /* not offered */ }
    started.current = Date.now(); startBytes.current = 0;
    const r = await importFile(file, label.trim() || file.name.replace(/\.(zip|csv|gz|tsv|txt)$/gi, ''), {
      start: s => { if (s.resumed) setRunNote(`Carrying on from row ${fmtN(s.skipped + 1)} — the first ${fmtN(s.skipped)} are already in.`); },
      tick: t => {
        if (!startBytes.current && t.bytes) startBytes.current = t.bytes;
        const elapsed = Date.now() - started.current;
        const rate = elapsed > 4000 ? (t.bytes - startBytes.current) / elapsed : 0;
        setLeft(rate > 0 ? (t.totalBytes - t.bytes) / rate : 0);
        setTick(t);
      },
      skipPart: (n, why) => setRunNote(x => `${x ? `${x} ` : ''}Skipped ${n}: ${why}.`),
    }, c.signal);
    try { await lock?.release(); } catch { /* already released */ }
    setRunning(false); ctl.current = null;
    if (r.ok) setDone('Finished. Everybody in the file is in the directory (duplicates and rows with nobody in them were left out).');
    else setError(r.error);
    void load();
  };

  const undo = async (id: string) => {
    if (!window.confirm('Take everybody this load added back out of the directory?')) return;
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
    setMsg(Number(d.removed) ? `Removed, and kept out of any later load.` : `Nobody with that address is in the directory now; it is kept out of any later load.`);
    setRemoveEmail(''); void load();
  };

  const pct = tick && tick.totalBytes ? Math.min(100, (tick.bytes / tick.totalBytes) * 100) : 0;

  return (
    <div style={{ background: '#fff', borderRadius: 18, border: `1px solid ${LINE}`, padding: 'clamp(16px, 3vw, 24px)', minWidth: 0, display: 'grid', gap: 14 }} data-testid="lead-directory-admin">
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
        <Users size={18} color="#4f46e5" />
        <h3 style={{ fontSize: 16, fontWeight: 700, color: INK, margin: 0, flex: 1, minWidth: 180 }}>Lead directory — your own leads</h3>
        <button onClick={() => void load()} style={btn}><RefreshCw size={12} /> Refresh</button>
      </div>
      <p style={{ fontSize: 13, color: MUTED, margin: 0, lineHeight: 1.6 }}>
        Load your own lead files — CSV, a ZIP of CSVs, or .csv.gz, of any size. The file is read here in your browser a
        piece at a time and only the columns the directory keeps are sent, so there is no upload limit. Customers find these people under
        <strong> Customers → Lead Directory</strong>, see them with the email and phone hidden, and spend an allowance
        ({a ? `${a.budget.day} a day, ${fmtN(a.budget.month)} a month` : '…'}) to see them in full.
      </p>

      {code === 'no_database' && (
        <div role="status" style={note('#fff7ed', '#9a3412')}>{error}</div>
      )}
      {error && code !== 'no_database' && <div role="alert" style={note('#fef2f2', '#b42318')}>{error}</div>}

      {a && (
        <>
          <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
            <Stat label="People in the directory" value={fmtN(a.total)} />
            <Stat label="Customers can search it" value={a.shared ? 'Yes' : 'Not yet'} />
            <Stat label="Removed on request" value={fmtN(a.removed)} />
          </div>
          {!!a.industries.length && (
            <div style={{ fontSize: 12, color: MUTED, lineHeight: 1.8 }}>
              Largest industries: {a.industries.slice(0, 8).map(f => `${f.label} (${fmtN(f.n)})`).join(' · ')}
              {!!a.states.length && <><br />Largest states: {a.states.slice(0, 8).map(f => `${f.label} (${fmtN(f.n)})`).join(' · ')}</>}
            </div>
          )}

          {/* ── Load a file ── */}
          <div style={{ border: `1px solid ${LINE}`, borderRadius: 14, padding: 14, display: 'grid', gap: 10 }}>
            <div style={{ fontSize: 13.5, fontWeight: 700, color: INK }}>Load a file</div>
            <label style={{ display: 'grid', gap: 4, fontSize: 12, color: MUTED }}>
              Where these came from (shown to you only)
              <input data-field="leaddir.label" value={label} onChange={e => setLabel(e.target.value)} placeholder="e.g. Leads.cm — US real estate, Oct 2026" style={input} disabled={running} />
            </label>
            <label style={{ ...btn, justifySelf: 'start', background: running ? '#f1f5f9' : '#4f46e5', color: running ? MUTED : '#fff', borderColor: 'transparent', cursor: running ? 'default' : 'pointer' }}>
              <FileUp size={13} /> {running ? 'Loading…' : 'Choose a CSV or ZIP'}
              <input data-field="leaddir.file" type="file" accept=".csv,.zip,.gz,.tsv,.txt" disabled={running} style={{ display: 'none' }}
                onChange={e => { const f = e.target.files?.[0]; e.target.value = ''; if (f) void run(f); }} />
            </label>
            {running && (
              <div style={{ display: 'grid', gap: 6 }} data-testid="lead-import-progress">
                <div style={{ height: 8, borderRadius: 99, background: '#eef2ff', overflow: 'hidden' }}>
                  <div style={{ width: `${pct}%`, height: '100%', background: 'linear-gradient(90deg,#6366f1,#ec4899)', transition: 'width .4s' }} />
                </div>
                <div style={{ fontSize: 12, color: '#334155', lineHeight: 1.6 }}>
                  {tick ? <>
                    {pct.toFixed(1)}% · {fmtBytes(tick.bytes)} of {fmtBytes(tick.totalBytes)}
                    {tick.sources > 1 && <> · file {tick.sourceIndex + 1} of {tick.sources} ({tick.source})</>}
                    <br />{fmtN(tick.rows)} rows read · <strong>{fmtN(tick.added)} added</strong> · {fmtN(tick.duplicates)} already there · {fmtN(tick.bad)} with nobody in them
                    {left > 0 && <> · about {eta(left)} left</>}
                  </> : <><Loader size={12} className="spin" /> Opening the file…</>}
                </div>
                {tick?.retrying && <div style={{ fontSize: 12, color: '#9a3412' }}>{tick.retrying}</div>}
                <div style={{ fontSize: 11.5, color: MUTED }}>Keep this tab open. If it stops for any reason, choose the same file again — it carries on from where it got to.</div>
                <button onClick={() => ctl.current?.abort()} style={{ ...btn, justifySelf: 'start' }}><Pause size={12} /> Pause</button>
              </div>
            )}
            {runNote && <div style={{ fontSize: 12, color: '#334155' }}>{runNote}</div>}
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

          {/* ── Customers ── */}
          <div style={{ border: `1px solid ${LINE}`, borderRadius: 14, padding: 14, display: 'grid', gap: 8 }}>
            <div style={{ fontSize: 13.5, fontWeight: 700, color: INK }}>Open it to customers</div>
            {a.shared ? (
              <>
                <div style={{ fontSize: 12.5, color: '#334155' }}>Customers can search the directory{a.attestedAt ? ` (you confirmed the right to share it on ${new Date(a.attestedAt).toLocaleDateString()})` : ''}.</div>
                <button onClick={() => void share(false)} style={{ ...btn, justifySelf: 'start' }}>Close it to customers</button>
              </>
            ) : (
              <>
                <div style={{ fontSize: 12.5, color: '#334155', lineHeight: 1.6 }}>
                  Only you can search it now. Most lead sellers license their data to the buyer alone — passing it on to your
                  customers needs a licence that allows resale. Check yours before opening it.
                </div>
                <label style={{ display: 'flex', gap: 8, alignItems: 'flex-start', fontSize: 12.5, color: INK }}>
                  <input data-field="leaddir.attest" type="checkbox" checked={attest} onChange={e => setAttest(e.target.checked)} style={{ marginTop: 3 }} />
                  I hold the right to share these records with my customers, and I will remove anybody who asks.
                </label>
                <button onClick={() => void share(true)} style={{ ...btn, justifySelf: 'start' }}>Open it to customers</button>
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
