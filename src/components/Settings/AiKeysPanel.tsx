/**
 * The owner's AI keys, in the order they are tried.
 *
 * One key was one quota: when Google rate-limited it or its daily quota ran
 * out, every customer's writing stopped with an error on their screen. Here
 * the owner keeps backup keys — ideally each from a different Google Cloud
 * project, since a project's quota is shared by its keys — and the server
 * moves a call to the next key the moment one fails for a reason that is the
 * key's (worker/src/lib/aiPool.ts). The failed key rests for a while and is
 * tried again after.
 *
 * Owner-only on the server. Keys are pasted in and never shown again — the
 * list says what each one is, whether it last worked and what Google said
 * when it did not.
 */
import { useEffect, useState } from 'react';
import { ArrowDown, ArrowUp, ExternalLink, Plus, ShieldCheck, Trash2 } from 'lucide-react';
import { addAiKey, aiKeysStatus, moveAiKey, removeAiKey, testAiKey, type AiPoolEntry, type AiKeysRes } from '../../services/aiKeys';

const INK = '#0f172a';
const MUTED = '#64748b';
const LINE = '#e6e9f0';

const when = (iso: string | null) => iso ? new Date(iso).toLocaleString(undefined, { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }) : '';

function Badge({ k }: { k: AiPoolEntry }) {
  const pill = (bg: string, fg: string, text: React.ReactNode) =>
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, fontSize: 11, fontWeight: 700, padding: '3px 9px', borderRadius: 999, background: bg, color: fg, whiteSpace: 'nowrap' }}>{text}</span>;
  if (k.restingUntil) return pill('#fff7ed', '#9a3412', `Resting until ${when(k.restingUntil)}`);
  if (k.lastFailedAt && (!k.lastOkAt || k.lastFailedAt > k.lastOkAt)) return pill('#fef2f2', '#b42318', 'Last call failed');
  if (k.lastOkAt) return pill('#e8f6ee', '#0f7b3d', <><ShieldCheck size={10} /> Working</>);
  return pill('#f1f5f9', MUTED, 'Not used yet');
}

export default function AiKeysPanel() {
  const [keys, setKeys] = useState<AiPoolEntry[] | null>(null);
  const [apiKey, setApiKey] = useState('');
  const [label, setLabel] = useState('');
  const [busy, setBusy] = useState('');
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);

  useEffect(() => {
    let alive = true;
    void aiKeysStatus().then(r => { if (alive && r.success) setKeys(r.keys ?? []); });
    return () => { alive = false; };
  }, []);

  const apply = (r: AiKeysRes, ok?: string) => {
    if (r.keys) setKeys(r.keys);
    if (!r.success) setMsg({ ok: false, text: r.error ?? 'That did not work.' });
    else if (ok) setMsg({ ok: true, text: ok });
  };
  const add = async () => {
    setBusy('add'); setMsg(null);
    const r = await addAiKey(apiKey.trim(), label.trim());
    setBusy('');
    apply(r, 'Google accepted it. Saved and encrypted — it takes over whenever the keys above it fail.');
    if (r.success) { setApiKey(''); setLabel(''); }
  };
  const test = async (i: number) => {
    setBusy(`test${i}`); setMsg(null);
    const r = await testAiKey(i);
    setBusy('');
    apply(r);
    if (r.tested) setMsg(r.tested.ok ? { ok: true, text: 'Google answered on that key.' } : { ok: false, text: `That key failed: ${r.tested.error}` });
  };

  if (!keys) return null;
  const backups = keys.filter(k => k.source === 'backup');
  const inp: React.CSSProperties = { width: '100%', padding: '10px 12px', border: `1px solid ${LINE}`, borderRadius: 10, fontSize: 13, outline: 'none', boxSizing: 'border-box', fontFamily: 'inherit', background: '#fff' };
  const b: React.CSSProperties = { display: 'inline-flex', alignItems: 'center', gap: 5, padding: '7px 11px', borderRadius: 9, border: `1px solid ${LINE}`, background: '#fff', color: INK, fontSize: 12, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit' };
  const icon: React.CSSProperties = { ...b, padding: '6px 8px' };

  return (
    <div style={{ background: '#fff', borderRadius: 18, border: `1px solid ${LINE}`, padding: 24 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 9, marginBottom: 4, flexWrap: 'wrap' }}>
        <h3 style={{ fontSize: 16, fontWeight: 700, color: INK, margin: 0 }}>AI keys — main and backups</h3>
        <span style={{ fontSize: 11, fontWeight: 700, padding: '3px 9px', borderRadius: 999, background: '#eef2ff', color: '#3730a3' }}>
          {keys.length} {keys.length === 1 ? 'key' : 'keys'} in turn
        </span>
      </div>
      <p style={{ fontSize: 13, color: MUTED, margin: '0 0 6px', lineHeight: 1.6 }}>
        Every piece of AI writing for every customer is tried on these keys <strong style={{ color: INK }}>from the top</strong>.
        If a key hits its rate limit or daily quota, is refused, or Google fails on it, the same request goes straight to the
        next key — the customer gets the answer, not the error — and the failed key rests for a while (two minutes for a
        rate limit, an hour for a daily quota, half an hour for a refusal) before it is tried first again.
      </p>
      <p style={{ fontSize: 12.5, color: MUTED, margin: '0 0 14px', lineHeight: 1.6 }}>
        Make each backup in a <strong>different Google Cloud project</strong> — keys in the same project share one quota, so
        they run out together. At <a href="https://aistudio.google.com/apikey" target="_blank" rel="noopener noreferrer" style={{ color: INK, fontWeight: 600 }}>Google AI Studio <ExternalLink size={10} style={{ verticalAlign: 'middle' }} /></a>:
        Create API key → Create API key in new project, then paste it below. A key is proved with Google before it is kept,
        and never shown again.
      </p>

      {keys.length === 0 && (
        <div style={{ fontSize: 13, color: '#9a3412', background: '#fff7ed', borderRadius: 10, padding: '10px 12px', marginBottom: 12 }}>
          No AI key at all yet. Add one below — the first key you add here works on its own as well as a main key does.
        </div>
      )}

      <div style={{ display: 'grid', gap: 8, marginBottom: 16 }}>
        {keys.map((k, i) => {
          const bi = k.id ? backups.findIndex(x => x.id === k.id) : -1;
          return (
            <div key={`${k.source}-${k.id ?? i}`} style={{ border: `1px solid ${LINE}`, borderRadius: 12, padding: '10px 12px', display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
              <span style={{ width: 22, height: 22, borderRadius: 999, background: '#f1f5f9', color: INK, fontSize: 12, fontWeight: 800, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>{i + 1}</span>
              <div style={{ flex: '1 1 220px', minWidth: 0 }}>
                <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
                  <strong style={{ fontSize: 13, color: INK }}>{k.label}</strong>
                  <Badge k={k} />
                </div>
                <div style={{ fontSize: 11.5, color: MUTED, marginTop: 3, overflowWrap: 'anywhere' }}>
                  {k.lastOkAt ? `Last worked ${when(k.lastOkAt)}` : 'No answer recorded yet'}
                  {k.lastFailedAt ? ` · last failed ${when(k.lastFailedAt)}${k.lastError ? ` — ${k.lastError.slice(0, 160)}` : ''}` : ''}
                </div>
              </div>
              <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                <button style={b} disabled={!!busy} onClick={() => test(i)}>{busy === `test${i}` ? 'Testing…' : 'Test'}</button>
                {k.id && <>
                  <button style={icon} disabled={!!busy || bi <= 0} aria-label="Try earlier" title="Try earlier" onClick={async () => apply(await moveAiKey(k.id!, 'up'))}><ArrowUp size={13} /></button>
                  <button style={icon} disabled={!!busy || bi < 0 || bi >= backups.length - 1} aria-label="Try later" title="Try later" onClick={async () => apply(await moveAiKey(k.id!, 'down'))}><ArrowDown size={13} /></button>
                  <button style={{ ...icon, color: '#b42318' }} disabled={!!busy} aria-label="Remove this key" title="Remove" onClick={async () => { if (confirm(`Remove "${k.label}"?`)) apply(await removeAiKey(k.id!), 'Removed.'); }}><Trash2 size={13} /></button>
                </>}
                {k.source === 'engine' && <span style={{ fontSize: 11.5, color: MUTED, alignSelf: 'center' }}>Change it in “Main AI key” above</span>}
              </div>
            </div>
          );
        })}
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 8, alignItems: 'end' }}>
        <label style={{ fontSize: 12, fontWeight: 700, color: INK, display: 'grid', gap: 5 }}>
          Name (for you)
          <input style={inp} value={label} onChange={e => setLabel(e.target.value)} placeholder="e.g. Backup — project 2" maxLength={60} data-field="aikeys.label" />
        </label>
        <label style={{ fontSize: 12, fontWeight: 700, color: INK, display: 'grid', gap: 5 }}>
          Google AI key
          <input style={inp} type="password" autoComplete="off" value={apiKey} onChange={e => setApiKey(e.target.value)} placeholder="AIza…" data-field="aikeys.key" />
        </label>
        <button style={{ ...b, justifyContent: 'center', padding: '10px 14px', background: INK, color: '#fff', borderColor: INK }} disabled={!!busy || !apiKey.trim()} onClick={add}>
          <Plus size={13} /> {busy === 'add' ? 'Checking with Google…' : 'Add backup key'}
        </button>
      </div>
      {msg && <div role="status" style={{ marginTop: 12, fontSize: 12.5, fontWeight: 600, color: msg.ok ? '#0f7b3d' : '#b42318' }}>{msg.text}</div>}
    </div>
  );
}
