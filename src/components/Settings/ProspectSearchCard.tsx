/**
 * The Google Places key for prospect search.
 *
 * Unlike the AI keys elsewhere in Settings, this one is never held in the
 * browser. Places bills per search, so a key sitting in localStorage — readable
 * by anything running in the tab, and recoverable from a built bundle — is
 * somebody else's search budget on your card. It is posted once to the server,
 * stored beside the booking SMTP password, and never sent back: the field below
 * shows only enough of it to recognise which key is in place.
 */
import { useCallback, useEffect, useState } from 'react';
import { AlertTriangle, Check, ExternalLink, Loader, MapPin, Trash2 } from 'lucide-react';
import { useApp } from '../../context/AppContext';
import { sessionToken } from '../../services/auth';

const API_BASE = import.meta.env.DEV ? 'http://localhost:3001' : '';

export default function ProspectSearchCard() {
  const { addNotification } = useApp();
  const [configured, setConfigured] = useState(false);
  const [hint, setHint] = useState('');
  const [key, setKey] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [reachable, setReachable] = useState(true);

  const call = useCallback(async (body: Record<string, unknown>) => {
    const res = await fetch(`${API_BASE}/api/places-search.php`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...body, token: sessionToken() }),
    });
    return res.json() as Promise<{ success?: boolean; configured?: boolean; keyHint?: string; error?: string }>;
  }, []);

  const refresh = useCallback(async () => {
    try {
      const d = await call({ action: 'status' });
      setConfigured(!!d.configured);
      setHint(d.keyHint ?? '');
      setReachable(true);
    } catch { setReachable(false); }
  }, [call]);

  /* Read the server's state on mount. The `live` guard is not ceremony: leaving
     Settings mid-request would otherwise set state on a component that is gone. */
  useEffect(() => {
    let live = true;
    void (async () => {
      try {
        const d = await call({ action: 'status' });
        if (!live) return;
        setConfigured(!!d.configured);
        setHint(d.keyHint ?? '');
        setReachable(true);
      } catch {
        if (live) setReachable(false);
      }
    })();
    return () => { live = false; };
  }, [call]);

  const save = async () => {
    setBusy(true); setError('');
    try {
      const d = await call({ action: 'save-key', key: key.trim() });
      if (!d.success) { setError(d.error || 'That could not be saved.'); return; }
      setKey('');
      await refresh();
      addNotification('Places key saved on the server');
    } catch {
      setError('Could not reach the server. This needs the PHP backend deployed.');
    } finally { setBusy(false); }
  };

  const clear = async () => {
    if (!window.confirm('Remove the Google Places key from the server?')) return;
    setBusy(true);
    try { await call({ action: 'clear-key' }); await refresh(); addNotification('Places key removed'); }
    finally { setBusy(false); }
  };

  return (
    <div style={{ backgroundColor: 'white', borderRadius: 18, border: '1px solid #e6e9f0', boxShadow: '0 1px 2px rgba(16,24,40,0.04)', padding: 24, marginBottom: 20 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 18, paddingBottom: 16, borderBottom: '1px solid #f1f5f9' }}>
        <div style={{ width: 42, height: 42, borderRadius: 12, backgroundColor: '#f0f1f3', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
          <MapPin size={20} color="#17191c" />
        </div>
        <div style={{ minWidth: 0 }}>
          <h3 style={{ fontSize: 15, fontWeight: 700, color: '#0f172a', margin: 0 }}>Prospect search</h3>
          <p style={{ fontSize: 12, color: '#64748b', margin: '2px 0 0' }}>
            Lets the AI Sales Agent find businesses on Google Places.
          </p>
        </div>
      </div>

      {!reachable && (
        <div style={{ display: 'flex', gap: 8, padding: '10px 12px', backgroundColor: '#fef2f2', border: '1px solid #fecaca', borderRadius: 9, marginBottom: 14 }}>
          <AlertTriangle size={14} color="#dc2626" style={{ flexShrink: 0, marginTop: 2 }} />
          <p style={{ margin: 0, fontSize: 12.5, color: '#991b1b', lineHeight: 1.55 }}>
            Cannot reach the server. Prospect search needs the PHP backend deployed — it will not work
            on a static preview.
          </p>
        </div>
      )}

      {configured ? (
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10, alignItems: 'center', padding: '12px 14px', backgroundColor: '#f0fdf4', border: '1px solid #bbf7d0', borderRadius: 10 }}>
          <Check size={15} color="#16a34a" style={{ flexShrink: 0 }} />
          <div style={{ minWidth: 0, flex: 1 }}>
            <p style={{ margin: 0, fontSize: 13, fontWeight: 600, color: '#166534' }}>A key is set on the server</p>
            <p style={{ margin: '1px 0 0', fontSize: 11.5, color: '#15803d', fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace' }}>{hint}</p>
          </div>
          <button onClick={clear} disabled={busy} className="press"
            style={{ display: 'inline-flex', alignItems: 'center', gap: 6, padding: '8px 14px', backgroundColor: 'white', color: '#b91c1c', border: '1px solid #fecaca', borderRadius: 9, fontSize: 12.5, fontWeight: 600, cursor: 'pointer' }}>
            <Trash2 size={13} /> Remove
          </button>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          <label style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
            <span style={{ fontSize: 12, fontWeight: 600, color: '#475569' }}>Google Places API key</span>
            <input
              value={key}
              onChange={e => setKey(e.target.value)}
              type="password"
              placeholder="AIza…"
              autoComplete="off"
              style={{ width: '100%', padding: '10px 12px', border: '1px solid #e2e8f0', borderRadius: 9, fontSize: 13, outline: 'none', boxSizing: 'border-box', color: '#0f172a' }}
            />
          </label>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, alignItems: 'center' }}>
            <button onClick={save} disabled={busy || !key.trim()} className="press"
              style={{ display: 'inline-flex', alignItems: 'center', gap: 6, padding: '9px 17px', backgroundColor: '#17191c', color: 'white', border: 'none', borderRadius: 9, fontSize: 13, fontWeight: 600, cursor: busy || !key.trim() ? 'not-allowed' : 'pointer', opacity: busy || !key.trim() ? 0.5 : 1 }}>
              {busy ? <><Loader size={13} className="spin" /> Saving…</> : 'Save key'}
            </button>
            <a href="https://console.cloud.google.com/apis/library/places-backend.googleapis.com"
              target="_blank" rel="noopener noreferrer"
              style={{ display: 'inline-flex', alignItems: 'center', gap: 4, fontSize: 12.5, color: '#2563eb' }}>
              Get a key <ExternalLink size={11} />
            </a>
          </div>
        </div>
      )}

      {error && (
        <p style={{ margin: '10px 0 0', fontSize: 12.5, color: '#b91c1c', lineHeight: 1.55 }}>{error}</p>
      )}

      <p style={{ margin: '14px 0 0', fontSize: 11.5, color: '#94a3b8', lineHeight: 1.6 }}>
        The key is kept on the server and never sent back to this page — Places bills per search, so a key
        the browser can read is a bill anyone can run up. It needs the <strong>Places API (New)</strong> enabled
        and billing switched on in Google Cloud. Restrict it by server IP rather than by website referrer,
        because the searches are made from your server.
      </p>
      <p style={{ margin: '8px 0 0', fontSize: 11.5, color: '#94a3b8', lineHeight: 1.6 }}>
        Places returns a name, address, phone number and often a website. It does not publish email
        addresses, so a campaign that opens on email will need those from somewhere else.
      </p>
    </div>
  );
}
