/**
 * "Paste your mail settings" — many mailboxes from one paste, or a screenshot.
 *
 * The customer pastes whatever they have (a host's welcome email, a sheet of
 * forty addresses, `email:password` lines) or attaches a picture of their
 * settings. The paste is read here, in the browser, by the same pure module
 * the Worker uses (worker/src/lib/mailParse.ts); known providers are filled
 * in at once; custom domains are looked up by the Worker (ISPDB, the domain's
 * own autoconfig, its MX). Nothing is saved until "Connect and test all", and
 * every row says where each setting came from and what its test found — a
 * partial failure shows as partial, row by row.
 *
 * Passwords live only in this component's state until they are sent to be
 * saved; they never reach localStorage.
 */
import { useRef, useState } from 'react';
import { ClipboardPaste, ImageUp, Loader, PlugZap, Trash2, CheckCircle2, XCircle, AlertTriangle } from 'lucide-react';
import {
  applyFound, applyKnown, domainOf, finalise, needsLookup, parseMailSettings, type MailRecord,
} from '../../../worker/src/lib/mailParse';
import {
  bulkConnectMailboxes, lookupMailDomains, readMailPicture,
  type BulkResult, type BulkSideResult, type MailboxRecord,
} from '../../services/mailboxStore';

const INK = '#17191c';
const MUTED = '#6b7280';
const LINE = '#e5e7eb';

/** The Worker's own batch sizes (routes/mailbox.ts LOOKUP_BATCH / BULK_BATCH). */
const LOOKUP_BATCH = 8;
const BULK_BATCH = 3;

interface Row {
  key: string;
  rec: MailRecord;
  /** Why a lookup found nothing (or could not run), said in the source cell. */
  lookupNote: string;
  result?: BulkResult;
  busy?: boolean;
}

const KIND_WORDS: Record<string, string> = {
  connected: 'Connected', wrong_password: 'Wrong password', needs_app_password: 'Needs an app password',
  host_not_found: 'Server name not found', host_unreachable: 'Server unreachable', encryption_mismatch: 'Port / encryption mismatch',
  account_locked: 'Account locked', folder_missing: 'Folder missing', not_set: 'Not set', failed: 'Failed',
};

const cell: React.CSSProperties = {
  width: '100%', minWidth: 0, padding: '6px 7px', border: `1px solid ${LINE}`, borderRadius: 7,
  fontSize: 12, color: INK, background: '#fff', boxSizing: 'border-box', fontFamily: 'inherit',
};
const th: React.CSSProperties = { textAlign: 'left', fontSize: 11, fontWeight: 700, color: '#475569', padding: '6px 6px', whiteSpace: 'nowrap' };
const td: React.CSSProperties = { padding: '5px 6px', verticalAlign: 'top' };

let seq = 0;
const toRow = (rec: MailRecord, lookupNote = ''): Row => ({ key: `r${++seq}`, rec, lookupNote });

/** Shrink a screenshot before it travels: text stays legible at 2000px, and the request stays small. */
async function pictureData(file: File): Promise<{ mime: string; data: string }> {
  const url = URL.createObjectURL(file);
  try {
    const img = await new Promise<HTMLImageElement>((res, rej) => { const i = new Image(); i.onload = () => res(i); i.onerror = () => rej(new Error('That file is not a picture this browser can open.')); i.src = url; });
    const scale = Math.min(1, 2000 / Math.max(img.naturalWidth, img.naturalHeight));
    const c = document.createElement('canvas');
    c.width = Math.max(1, Math.round(img.naturalWidth * scale));
    c.height = Math.max(1, Math.round(img.naturalHeight * scale));
    c.getContext('2d')!.drawImage(img, 0, 0, c.width, c.height);
    let out = c.toDataURL('image/png');
    let mime = 'image/png';
    if (out.length > 3_500_000) { out = c.toDataURL('image/jpeg', 0.88); mime = 'image/jpeg'; }
    return { mime, data: out.slice(out.indexOf(',') + 1) };
  } finally {
    URL.revokeObjectURL(url);
  }
}

function SideStatus({ label, r }: { label: string; r?: BulkSideResult }) {
  if (!r) return null;
  const color = r.ok ? '#1e6b32' : r.kind === 'not_set' ? MUTED : '#a02216';
  return (
    <div style={{ fontSize: 11.5, color, lineHeight: 1.4 }} title={[r.message, ...(r.steps ?? [])].join('\n')}>
      <strong>{label}:</strong> {KIND_WORDS[r.kind] ?? r.kind}
    </div>
  );
}

function StatusCell({ row }: { row: Row }) {
  if (row.busy) return <span style={{ display: 'inline-flex', gap: 5, alignItems: 'center', fontSize: 12, color: MUTED }}><Loader size={12} className="spin" /> Testing…</span>;
  const r = row.result;
  if (!r) {
    const missing = !row.rec.email ? 'Needs an address' : !row.rec.password && !row.rec.smtp.password && !row.rec.imap.password ? 'Needs a password'
      : !row.rec.smtp.host || !row.rec.imap.host ? 'Needs a server' : 'Ready';
    return <span style={{ fontSize: 12, color: missing === 'Ready' ? INK : '#9a6700', fontWeight: 600 }}>{missing}</span>;
  }
  const icon = r.status === 'connected' ? <CheckCircle2 size={13} color="#1e6b32" /> : r.status === 'partial' ? <AlertTriangle size={13} color="#9a6700" /> : <XCircle size={13} color="#a02216" />;
  return (
    <div style={{ minWidth: 150 }}>
      <div style={{ display: 'flex', gap: 5, alignItems: 'center', fontSize: 12, fontWeight: 700, color: INK }}>
        {icon}{r.status === 'connected' ? 'Connected' : r.status === 'partial' ? 'Partly connected' : 'Not connected'}
      </div>
      {r.message && <div style={{ fontSize: 11.5, color: '#a02216' }}>{r.message}</div>}
      <SideStatus label="Send" r={r.outgoing} />
      <SideStatus label="Receive" r={r.incoming} />
    </div>
  );
}

export default function MailboxImport({ onConnected }: { onConnected: (list: MailboxRecord[]) => void }) {
  const [text, setText] = useState('');
  const [rows, setRows] = useState<Row[]>([]);
  const [busy, setBusy] = useState<'read' | 'picture' | 'connect' | null>(null);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  /** Known providers now; custom domains from the Worker, in batches; then the usual pairings. */
  const complete = async (recs: MailRecord[]): Promise<Row[]> => {
    const known = recs.map(applyKnown);
    const want = new Map<string, string>();
    for (const r of known) if (needsLookup(r)) { const d = domainOf(r.email); if (d && !want.has(d)) want.set(d, r.email); }
    const found = new Map<string, { summary: string; found: Parameters<typeof applyFound>[1] | null }>();
    const list = [...want.entries()].map(([domain, email]) => ({ domain, email }));
    let lookupError = '';
    for (let i = 0; i < list.length; i += LOOKUP_BATCH) {
      const r = await lookupMailDomains(list.slice(i, i + LOOKUP_BATCH));
      if (!r.success) { lookupError = r.error ?? 'The lookup could not run.'; continue; }
      for (const l of r.lookups ?? []) found.set(l.domain, { summary: l.summary, found: l.found });
    }
    return known.map(r => {
      const d = domainOf(r.email);
      if (!want.has(d)) return toRow(finalise(r));
      const f = found.get(d);
      if (!f) return toRow(finalise(r), `Lookup could not run: ${lookupError}`);
      return toRow(finalise(f.found ? applyFound(r, f.found) : r), f.found ? '' : f.summary);
    });
  };

  const merge = (incoming: Row[]) => setRows(prev => {
    const next = [...prev];
    for (const n of incoming) {
      const i = n.rec.email ? next.findIndex(p => p.rec.email === n.rec.email) : -1;
      if (i >= 0) next[i] = { ...n, key: next[i].key }; else next.push(n);
    }
    return next;
  });

  const read = async () => {
    setMsg(null);
    const recs = parseMailSettings(text);
    if (!recs.length) { setMsg({ ok: false, text: 'No mailbox could be found in that text. Paste lines like "you@domain.com yourpassword", a settings email, or a spreadsheet with an Email column.' }); return; }
    setBusy('read');
    const done = await complete(recs);
    setBusy(null);
    merge(done);
    setMsg({ ok: true, text: `Found ${done.length} mailbox${done.length === 1 ? '' : 'es'}. Check each row, then connect.` });
  };

  const picture = async (file: File | undefined) => {
    if (!file) return;
    setMsg(null); setBusy('picture');
    try {
      const { mime, data } = await pictureData(file);
      const r = await readMailPicture(mime, data);
      if (!r.success) { setMsg({ ok: false, text: r.error ?? 'The picture could not be read.' }); return; }
      const recs = r.records ?? [];
      if (!recs.length) { setMsg({ ok: false, text: r.message ?? 'No mail settings could be seen in that picture.' }); return; }
      merge(await complete(recs));
      setMsg({ ok: true, text: r.message ?? 'Read from the picture — check every field before connecting.' });
    } catch (e) {
      setMsg({ ok: false, text: e instanceof Error ? e.message : String(e) });
    } finally {
      setBusy(null);
      if (fileRef.current) fileRef.current.value = '';
    }
  };

  const edit = (key: string, f: (r: MailRecord) => MailRecord) =>
    setRows(p => p.map(r => (r.key === key ? { ...r, rec: f(r.rec), result: undefined } : r)));

  const connectAll = async () => {
    const todo = rows.filter(r => r.rec.email);
    if (!todo.length) { setMsg({ ok: false, text: 'Every row needs an email address before it can be connected.' }); return; }
    setBusy('connect'); setMsg(null);
    let latest: MailboxRecord[] | null = null;
    const tally = { connected: 0, partial: 0, failed: 0 };
    for (let i = 0; i < todo.length; i += BULK_BATCH) {
      const batch = todo.slice(i, i + BULK_BATCH);
      const keys = new Set(batch.map(b => b.key));
      setRows(p => p.map(r => (keys.has(r.key) ? { ...r, busy: true, result: undefined } : r)));
      const ans = await bulkConnectMailboxes(batch.map(({ rec }) => ({
        email: rec.email, name: rec.name, password: rec.password,
        smtp: { host: rec.smtp.host, port: rec.smtp.port, security: rec.smtp.security, username: rec.smtp.username, password: rec.smtp.password },
        imap: { host: rec.imap.host, port: rec.imap.port, security: rec.imap.security, username: rec.imap.username, password: rec.imap.password },
      })));
      const results = ans.success ? ans.results ?? [] : batch.map(b => ({ email: b.rec.email, ok: false, status: 'failed' as const, message: ans.error ?? 'The server did not answer.' }));
      if (ans.mailboxes) latest = ans.mailboxes;
      for (const r of results) tally[r.status] = (tally[r.status] ?? 0) + 1;
      setRows(p => p.map(r => {
        if (!keys.has(r.key)) return r;
        const res = results.find(x => x.email === r.rec.email.toLowerCase());
        return { ...r, busy: false, result: res ?? { email: r.rec.email, ok: false, status: 'failed', message: 'No answer for this row.' } };
      }));
    }
    setBusy(null);
    if (latest) onConnected(latest);
    const total = tally.connected + tally.partial + tally.failed;
    setMsg({
      ok: tally.connected === total,
      text: tally.connected === total
        ? `All ${total} connected — sending and receiving both work.`
        : `${tally.connected} of ${total} fully connected, ${tally.partial} partly (one direction works), ${tally.failed} not connected. Each row says what went wrong.`,
    });
  };

  const sideCells = (row: Row, s: 'smtp' | 'imap') => {
    const v = row.rec[s];
    return (
      <>
        <td style={td}><input aria-label={`${s === 'smtp' ? 'SMTP' : 'IMAP'} host for ${row.rec.email || 'this row'}`} data-field={`bulk.${s}.host`} style={{ ...cell, minWidth: 130 }} value={v.host}
          onChange={e => edit(row.key, r => ({ ...r, [s]: { ...r[s], host: e.target.value.trim(), source: 'typed' } }))} /></td>
        <td style={td}><input aria-label={`${s === 'smtp' ? 'SMTP' : 'IMAP'} port for ${row.rec.email || 'this row'}`} inputMode="numeric" style={{ ...cell, width: 58 }} value={v.port || ''}
          onChange={e => edit(row.key, r => ({ ...r, [s]: { ...r[s], port: Number(e.target.value.replace(/\D/g, '')) || 0 } }))} /></td>
        <td style={td}>
          <select aria-label={`${s === 'smtp' ? 'SMTP' : 'IMAP'} encryption for ${row.rec.email || 'this row'}`} style={{ ...cell, width: 92 }} value={v.security || (s === 'smtp' ? 'tls' : 'ssl')}
            onChange={e => edit(row.key, r => ({ ...r, [s]: { ...r[s], security: e.target.value as 'ssl' | 'tls' | 'none' } }))}>
            <option value="ssl">SSL/TLS</option>
            <option value="tls">STARTTLS</option>
            <option value="none">None</option>
          </select>
        </td>
      </>
    );
  };

  const sourceOf = (row: Row) => {
    const a = row.rec.smtp.source, b = row.rec.imap.source;
    const s = a && b && a !== b ? `Sending: ${a}; receiving: ${b}` : a || b || '';
    return s || row.lookupNote || 'Not found — type the servers in';
  };

  return (
    <section id="mailbox-import" style={{ border: `1px solid ${LINE}`, borderRadius: 14, background: '#fff', padding: 16, display: 'grid', gap: 12, minWidth: 0 }}>
      <header>
        <h4 style={{ margin: 0, fontSize: 14.5, fontWeight: 800, color: INK, display: 'flex', alignItems: 'center', gap: 7 }}>
          <ClipboardPaste size={16} /> Paste your mail settings
        </h4>
        <p style={{ margin: '5px 0 0', fontSize: 12.5, color: MUTED, lineHeight: 1.55, maxWidth: 640 }}>
          One mailbox or a hundred: paste your host's settings email, a spreadsheet, or lines like
          <code style={{ margin: '0 4px' }}>you@domain.com password</code>. Missing servers are filled in from your
          provider's published settings or looked up for your domain. Nothing is saved until you connect.
        </p>
      </header>

      <textarea
        data-field="mailimport.text"
        aria-label="Mail settings to read"
        value={text}
        onChange={e => setText(e.target.value)}
        placeholder={'sales@yourdomain.com  Password1\nsupport@yourdomain.com  Password2\n\nSMTP server: mail.yourdomain.com  Port: 465\nIMAP server: mail.yourdomain.com  Port: 993'}
        rows={6}
        style={{ ...cell, fontSize: 12.5, padding: '9px 11px', fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace', resize: 'vertical' }}
      />

      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
        <button onClick={() => void read()} disabled={busy !== null || !text.trim()}
          style={{ display: 'inline-flex', alignItems: 'center', gap: 6, padding: '9px 15px', borderRadius: 9, border: 'none', background: busy || !text.trim() ? '#c3c7cd' : INK, color: '#fff', fontSize: 12.5, fontWeight: 700, cursor: busy || !text.trim() ? 'default' : 'pointer' }}>
          {busy === 'read' ? <Loader size={14} className="spin" /> : <ClipboardPaste size={14} />} {busy === 'read' ? 'Reading…' : 'Read settings'}
        </button>
        <label data-field="mailimport.picture"
          style={{ display: 'inline-flex', alignItems: 'center', gap: 6, padding: '9px 15px', borderRadius: 9, border: `1px solid ${LINE}`, background: '#fff', color: INK, fontSize: 12.5, fontWeight: 700, cursor: busy ? 'default' : 'pointer' }}>
          {busy === 'picture' ? <Loader size={14} className="spin" /> : <ImageUp size={14} />} {busy === 'picture' ? 'Reading the picture…' : 'Attach a screenshot'}
          <input ref={fileRef} type="file" accept="image/png,image/jpeg,image/webp,image/gif" disabled={busy !== null}
            aria-label="Screenshot of your mail settings" style={{ display: 'none' }}
            onChange={e => void picture(e.target.files?.[0])} />
        </label>
        <span style={{ fontSize: 11.5, color: MUTED }}>A screenshot is read by the AI service and not kept.</span>
      </div>

      {msg && (
        <p role="status" style={{ margin: 0, fontSize: 12.5, fontWeight: 600, lineHeight: 1.5, color: msg.ok ? '#1e6b32' : '#a02216' }}>{msg.text}</p>
      )}

      {rows.length > 0 && (
        <>
          {/* Scrolls inside its own box on a phone rather than pushing the page sideways. */}
          <div style={{ overflowX: 'auto', border: `1px solid ${LINE}`, borderRadius: 10, maxWidth: '100%' }}>
            <table style={{ borderCollapse: 'collapse', width: '100%', minWidth: 1080 }}>
              <thead style={{ background: '#fafbfc' }}>
                <tr>
                  <th style={th}>Address</th>
                  <th style={th}>Password</th>
                  <th style={th}>SMTP host</th><th style={th}>Port</th><th style={th}>Security</th>
                  <th style={th}>IMAP host</th><th style={th}>Port</th><th style={th}>Security</th>
                  <th style={th}>Found from</th>
                  <th style={th}>Status</th>
                  <th style={th} aria-label="Remove" />
                </tr>
              </thead>
              <tbody>
                {rows.map(row => (
                  <FragmentRow key={row.key} row={row}>
                    <td style={td}><input aria-label="Email address" data-field="bulk.email" style={{ ...cell, minWidth: 170 }} value={row.rec.email}
                      onChange={e => edit(row.key, r => ({ ...r, email: e.target.value.trim().toLowerCase() }))} /></td>
                    <td style={td}><input aria-label={`Password for ${row.rec.email || 'this row'}`} data-field="bulk.password" type="password" autoComplete="new-password" style={{ ...cell, minWidth: 110 }}
                      value={row.rec.password} placeholder={row.rec.smtp.password ? 'Separate per side' : ''}
                      onChange={e => edit(row.key, r => ({ ...r, password: e.target.value, smtp: { ...r.smtp, password: '' }, imap: { ...r.imap, password: '' } }))} /></td>
                    {sideCells(row, 'smtp')}
                    {sideCells(row, 'imap')}
                    <td style={{ ...td, fontSize: 11.5, color: MUTED, maxWidth: 200, lineHeight: 1.4 }}>{sourceOf(row)}</td>
                    <td style={td}><StatusCell row={row} /></td>
                    <td style={td}>
                      <button onClick={() => setRows(p => p.filter(r => r.key !== row.key))} aria-label={`Remove ${row.rec.email || 'this row'}`} disabled={busy !== null}
                        style={{ border: 'none', background: 'none', cursor: 'pointer', color: '#a02216', padding: 4, display: 'flex' }}>
                        <Trash2 size={14} />
                      </button>
                    </td>
                  </FragmentRow>
                ))}
              </tbody>
            </table>
          </div>

          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
            <button onClick={() => void connectAll()} disabled={busy !== null}
              style={{ display: 'inline-flex', alignItems: 'center', gap: 6, padding: '10px 16px', borderRadius: 10, border: 'none', background: busy ? '#c3c7cd' : INK, color: '#fff', fontSize: 13, fontWeight: 700, cursor: busy ? 'default' : 'pointer' }}>
              {busy === 'connect' ? <Loader size={14} className="spin" /> : <PlugZap size={14} />} {busy === 'connect' ? 'Connecting…' : `Connect and test all (${rows.length})`}
            </button>
            <button onClick={() => { setRows([]); setMsg(null); }} disabled={busy !== null}
              style={{ padding: '9px 14px', borderRadius: 9, border: `1px solid ${LINE}`, background: '#fff', color: INK, fontSize: 12.5, fontWeight: 700, cursor: 'pointer' }}>
              Clear the list
            </button>
            <span style={{ fontSize: 11.5, color: MUTED }}>Each is saved encrypted, then signs in to send and to receive. An address you already have is updated, not added twice.</span>
          </div>
        </>
      )}
    </section>
  );
}

/** A row and, under it, its notes (app passwords, assumed ports) — said beside the row they are about. */
function FragmentRow({ row, children }: { row: Row; children: React.ReactNode }) {
  const notes = row.rec.notes;
  return (
    <>
      <tr style={{ borderTop: `1px solid ${LINE}` }}>{children}</tr>
      {notes.length > 0 && (
        <tr>
          <td colSpan={11} style={{ padding: '0 8px 8px', fontSize: 11.5, color: '#9a6700', lineHeight: 1.45 }}>
            {notes.map((n, i) => <div key={i}>{n}</div>)}
          </td>
        </tr>
      )}
    </>
  );
}
