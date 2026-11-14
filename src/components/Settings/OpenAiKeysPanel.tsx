/**
 * The owner's OpenAI keys — pasted many at a time (owner, 2026-11-14: "I
 * have OpenAI keys in bulk").
 *
 * What they do is said on the card, because it is narrower than the Google
 * pool above it: they transcribe voice messages (the wizard's chat and
 * Protron's microphone) with OpenAI's transcription models, the ones
 * ChatGPT's voice typing uses, tried key by key; the Google transcriber
 * takes over when none is stored or all fail (worker/src/lib/openai.ts).
 * Each recording is then billed by OpenAI to the key that heard it.
 *
 * Owner-only on the server. Keys go in and never come back — not even a
 * tail. A paste is reported by each key's place in it (#1, #2 …), so the
 * owner can see which line was refused without the page echoing a key.
 */
import { askConfirm } from '../shared/ConfirmDialog';
import { useEffect, useState } from 'react';
import { ExternalLink, KeyRound, ShieldCheck, Trash2, Upload } from 'lucide-react';
import {
  addOpenAiKeys, clearOpenAiKeys, openAiKeysStatus, removeOpenAiKey, testOpenAiKey,
  type OpenAiKeyEntry, type OpenAiKeysRes, type OpenAiPasteResult,
} from '../../services/aiKeys';

const INK = '#0f172a';
const MUTED = '#64748b';
const LINE = '#e6e9f0';
const when = (iso: string | null) => iso ? new Date(iso).toLocaleString(undefined, { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }) : '';

function Badge({ k }: { k: OpenAiKeyEntry }) {
  const pill = (bg: string, fg: string, text: React.ReactNode) =>
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, fontSize: 11, fontWeight: 700, padding: '3px 9px', borderRadius: 999, background: bg, color: fg, whiteSpace: 'nowrap' }}>{text}</span>;
  if (k.restingUntil) return pill('#fff7ed', '#9a3412', `Resting until ${when(k.restingUntil)}`);
  if (k.lastFailedAt && (!k.lastOkAt || k.lastFailedAt > k.lastOkAt)) return pill('#fef2f2', '#b42318', 'Last call failed');
  return pill('#e8f6ee', '#0f7b3d', <><ShieldCheck size={10} /> Working</>);
}

/** "12 added · 2 already saved · 1 refused (#4: Incorrect API key provided)". */
function summary(results: OpenAiPasteResult[]): { ok: boolean; text: string } {
  const by = (o: OpenAiPasteResult['outcome']) => results.filter(r => r.outcome === o);
  const added = by('added'); const dup = by('duplicate'); const bad = by('refused'); const full = by('full');
  const parts = [
    `${added.length} added`,
    dup.length ? `${dup.length} already saved` : '',
    full.length ? `${full.length} not added — the list is full` : '',
    bad.length ? `${bad.length} refused by OpenAI (${bad.slice(0, 4).map(r => `#${r.n}: ${r.error ?? 'refused'}`).join('; ')}${bad.length > 4 ? '; …' : ''})` : '',
  ].filter(Boolean);
  const noTranscribe = added.filter(r => r.transcribes === false).length;
  if (noTranscribe) parts.push(`${noTranscribe} of the added keys list no transcription model, so they will be skipped for voice messages`);
  return { ok: added.length > 0 && !bad.length, text: `${parts.join(' · ')}.` };
}

export default function OpenAiKeysPanel() {
  const [keys, setKeys] = useState<OpenAiKeyEntry[] | null>(null);
  const [paste, setPaste] = useState('');
  const [label, setLabel] = useState('');
  const [busy, setBusy] = useState('');
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [field, setField] = useState('');

  useEffect(() => {
    let alive = true;
    void openAiKeysStatus().then(r => { if (alive && r.success) setKeys(r.openai ?? []); });
    return () => { alive = false; };
  }, []);

  const apply = (r: OpenAiKeysRes, ok?: string) => {
    if (r.openai) setKeys(r.openai);
    setField(r.success ? '' : r.field ?? '');
    if (!r.success) setMsg({ ok: false, text: r.error ?? 'That did not work.' });
    else if (ok) setMsg({ ok: true, text: ok });
  };
  const add = async () => {
    setBusy('add'); setMsg(null);
    const r = await addOpenAiKeys(paste, label.trim());
    setBusy('');
    apply(r);
    if (r.success && r.results) {
      setMsg(summary(r.results));
      /* Clear the box once something was kept — the keys are not left on screen. */
      if ((r.added ?? 0) > 0) setPaste('');
    }
  };

  if (!keys) return null;
  const found = (paste.match(/sk-(?!or-|ant-)[A-Za-z0-9_-]{20,}/g) ?? []).length;
  const b: React.CSSProperties = { display: 'inline-flex', alignItems: 'center', gap: 5, padding: '7px 11px', borderRadius: 9, border: `1px solid ${LINE}`, background: '#fff', color: INK, fontSize: 12, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit' };
  const inp: React.CSSProperties = { width: '100%', padding: '10px 12px', border: `1px solid ${LINE}`, borderRadius: 10, fontSize: 13, outline: 'none', boxSizing: 'border-box', fontFamily: 'inherit', background: '#fff' };

  return (
    <div style={{ background: '#fff', borderRadius: 18, border: `1px solid ${LINE}`, padding: 24 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 9, marginBottom: 4, flexWrap: 'wrap' }}>
        <KeyRound size={16} color={INK} />
        <h3 style={{ fontSize: 16, fontWeight: 700, color: INK, margin: 0 }}>OpenAI keys</h3>
        <span style={{ fontSize: 11, fontWeight: 700, padding: '3px 9px', borderRadius: 999, background: '#eef2ff', color: '#3730a3' }}>
          {keys.length} {keys.length === 1 ? 'key' : 'keys'}
        </span>
      </div>
      <p style={{ fontSize: 13, color: MUTED, margin: '0 0 6px', lineHeight: 1.6 }}>
        Used to <strong style={{ color: INK }}>transcribe voice messages</strong> — the AI Autopilot chat and Protron&rsquo;s microphone — with
        OpenAI&rsquo;s transcription models, the ones ChatGPT&rsquo;s voice typing uses. Keys are tried in order; a key that is rate-limited or
        refused rests and the next one is used. With no OpenAI key, or when they all fail, the Google transcriber does it instead.
        Each recording is billed by OpenAI to the key that heard it.
      </p>
      <p style={{ fontSize: 12.5, color: MUTED, margin: '0 0 14px', lineHeight: 1.6 }}>
        Paste as many as you like (up to 50 at a time) — one per line, or separated by commas or spaces; anything around them is ignored.
        Each is checked with OpenAI before it is kept, stored encrypted, and never shown again. Keys come from{' '}
        <a href="https://platform.openai.com/api-keys" target="_blank" rel="noopener noreferrer" style={{ color: INK, fontWeight: 600 }}>platform.openai.com/api-keys <ExternalLink size={10} style={{ verticalAlign: 'middle' }} /></a>.
      </p>

      <label style={{ fontSize: 12, fontWeight: 700, color: INK, display: 'grid', gap: 5 }}>
        OpenAI keys
        <textarea
          data-field="aikeys.openai"
          aria-invalid={field === 'aikeys.openai' || undefined}
          style={{ ...inp, minHeight: 120, resize: 'vertical', fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace', fontSize: 12, borderColor: field === 'aikeys.openai' ? '#f04438' : LINE, WebkitTextSecurity: 'disc' } as React.CSSProperties}
          autoComplete="off" spellCheck={false}
          value={paste} onChange={e => { setPaste(e.target.value); if (field) setField(''); }}
          placeholder={'sk-proj-…\nsk-proj-…\nsk-svcacct-…'}
        />
      </label>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 8, alignItems: 'end', marginTop: 8 }}>
        <label style={{ fontSize: 12, fontWeight: 700, color: INK, display: 'grid', gap: 5 }}>
          Name them (optional)
          <input style={inp} value={label} onChange={e => setLabel(e.target.value)} placeholder="e.g. Batch November → “Batch November 1, 2…”" maxLength={40} data-field="aikeys.openaiLabel" />
        </label>
        <button style={{ ...b, justifyContent: 'center', padding: '10px 14px', background: INK, color: '#fff', borderColor: INK }} disabled={!!busy || !found} onClick={add}>
          <Upload size={13} /> {busy === 'add' ? `Checking ${found} with OpenAI…` : found ? `Check and add ${found} ${found === 1 ? 'key' : 'keys'}` : 'Paste keys to add'}
        </button>
      </div>
      {msg && <div role="status" style={{ marginTop: 12, fontSize: 12.5, fontWeight: 600, color: msg.ok ? '#0f7b3d' : '#b42318', lineHeight: 1.5, overflowWrap: 'anywhere' }}>{msg.text}</div>}

      {keys.length > 0 && (
        <div style={{ display: 'grid', gap: 8, marginTop: 16 }}>
          {keys.map((k, i) => (
            <div key={k.id} style={{ border: `1px solid ${LINE}`, borderRadius: 12, padding: '10px 12px', display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
              <span style={{ width: 22, height: 22, borderRadius: 999, background: '#f1f5f9', color: INK, fontSize: 12, fontWeight: 800, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>{i + 1}</span>
              <div style={{ flex: '1 1 220px', minWidth: 0 }}>
                <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
                  <strong style={{ fontSize: 13, color: INK }}>{k.label}</strong>
                  <Badge k={k} />
                </div>
                <div style={{ fontSize: 11.5, color: MUTED, marginTop: 3, overflowWrap: 'anywhere' }}>
                  {k.lastOkAt ? `Last worked ${when(k.lastOkAt)}` : `Added ${when(k.addedAt)}`}
                  {k.lastFailedAt ? ` · last failed ${when(k.lastFailedAt)}${k.lastError ? ` — ${k.lastError.slice(0, 160)}` : ''}` : ''}
                </div>
              </div>
              <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                <button style={b} disabled={!!busy} onClick={async () => {
                  setBusy(`t${k.id}`); setMsg(null);
                  const r = await testOpenAiKey(k.id);
                  setBusy(''); apply(r);
                  if (r.tested) setMsg(r.tested.ok ? { ok: true, text: `OpenAI answered on ${k.label}${r.tested.model ? ` — voice messages use ${r.tested.model}` : ' — but it lists no transcription model'}.` } : { ok: false, text: `${k.label} failed: ${r.tested.error}` });
                }}>{busy === `t${k.id}` ? 'Testing…' : 'Test'}</button>
                <button style={{ ...b, padding: '6px 8px', color: '#b42318' }} disabled={!!busy} aria-label={`Remove ${k.label}`} title="Remove"
                  onClick={async () => { if (await askConfirm({ title: `Remove “${k.label}”?`, message: 'This OpenAI key is deleted and no longer used.', confirmLabel: 'Remove key', danger: true })) apply(await removeOpenAiKey(k.id), 'Removed.'); }}>
                  <Trash2 size={13} />
                </button>
              </div>
            </div>
          ))}
          {keys.length > 1 && (
            <button style={{ ...b, justifySelf: 'start', color: '#b42318' }} disabled={!!busy}
              onClick={async () => { if (await askConfirm({ title: `Remove all ${keys.length} OpenAI keys?`, message: 'Every stored OpenAI key is deleted. Voice messages go back to the Google transcriber.', confirmLabel: 'Remove all', danger: true })) apply(await clearOpenAiKeys(), 'All OpenAI keys removed.'); }}>
              <Trash2 size={13} /> Remove all
            </button>
          )}
        </div>
      )}
    </div>
  );
}
