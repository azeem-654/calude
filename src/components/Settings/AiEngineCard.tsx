/**
 * The main AI key — moved out of a customer's Settings.
 *
 * It was a Settings tab every customer saw, asking for a Gemini key. Customers
 * are never asked for one: the writing is the operator's (loadAiKey falls back
 * to the install's keys, lib/aiPool.ts), and a box asking for it read as a
 * setup step they had missed. The owner asked for it to live with the other
 * keys they provide, so it is a card on Platform services, above the backup
 * keys that take over when it fails. What it stores is unchanged — the key
 * of the owner's own workspace, which the pool reads as the main key.
 */
import { useState, useEffect, useCallback } from 'react';
import { CheckCircle, XCircle, Loader, Eye, EyeOff, RefreshCw, Save, ExternalLink } from 'lucide-react';
import { getGeminiKey, setGeminiKey, testGeminiKey } from '../../lib/gemini';
import { useApp } from '../../context/AppContext';
import { getSession } from '../../services/auth';
import { fetchReplies, saveAiKey, testAiKey, type AiStatus } from '../../services/replies';

/* ── AI Engine: Gemini API key (powers AI Shorts, content generation, design AI) ── */
export default function AiEngineCard() {
  const { addNotification } = useApp();
  const [key, setKey] = useState(() => getGeminiKey());
  const [show, setShow] = useState(false);
  const [testing, setTesting] = useState(false);
  const [result, setResult] = useState<{ ok: boolean; msg: string } | null>(null);
  const savedKey = getGeminiKey();

  /*
   * The server's copy, asked for rather than assumed.
   *
   * This panel used to report "AI is connected" from localStorage alone, and
   * localStorage is the copy that matters least: it is per-browser, so the same
   * account said "no API key — AI features are disabled" on a phone while the
   * server held a working one, and said "connected" when the browser had a key
   * the server had failed to store — in which case Autopilot still could not
   * write a word. Both readings were confidently wrong.
   *
   * `null` is its own state: not "no key", but "not asked yet". Rendering a red
   * "not connected" while the request is still in flight is the same lie in a
   * shorter timeframe.
   */
  const [server, setServer] = useState<AiStatus | null>(null);
  const [askedServer, setAskedServer] = useState(false);
  const [checking, setChecking] = useState(false);
  /* Verified, and not refused since. `verified_at` is cleared on a failed
     check, so the two together are the whole answer. */
  const serverWorks = !!server?.hasKey && !server.lastError && !!server.verifiedAt;

  const readServer = useCallback(async () => {
    const r = await fetchReplies();
    setServer(r.ai);
    setAskedServer(true);
  }, []);

  useEffect(() => { void readServer(); }, [readServer]);

  /* Asks Google about the key on the record, and writes down what it said — so
     the answer survives a refresh instead of being a toast nobody kept. */
  const handleCheckServer = async () => {
    setChecking(true);
    const r = await testAiKey();
    await readServer();
    setChecking(false);
    addNotification(
      r.success ? (r.message ?? 'Google accepted the stored key.') : (r.error ?? 'Google refused the stored key.'),
      r.success ? 'success' : 'error',
    );
  };

  /*
   * Saved twice, on purpose, and they are not the same copy.
   *
   * The browser keeps one because AI Shorts analyses video *from the page* —
   * uploading a file to the Worker to hand on to Google would be a needless
   * round trip through our own bandwidth.
   *
   * The server keeps one, encrypted, because Autopilot writes replies from the
   * cron and there is no browser there. That is the whole reason a customer who
   * shut their laptop stopped answering leads: the key was somewhere the
   * scheduler could not reach.
   *
   * If the server copy fails to save, the local one still works and the message
   * says exactly what is lost — replies while signed out — rather than claiming
   * success.
   */
  const handleSaveAndTest = async () => {
    setTesting(true);
    setResult(null);
    const res = await testGeminiKey(key);
    if (!res.ok) { setTesting(false); setResult({ ok: false, msg: res.error }); return; }

    setGeminiKey(key);
    const stored = await saveAiKey(key);
    setTesting(false);

    if (stored.success) {
      void readServer();
      setResult({ ok: true, msg: 'Key verified and saved. Autopilot can now answer replies even when you are signed out.' });
      addNotification('Gemini key verified and stored on the server.', 'success');
    } else {
      setResult({
        ok: true,
        msg: `Saved in this browser, but not on the server — Autopilot will not be able to write replies while you are signed out. ${stored.error ?? ''}`,
      });
      addNotification('Saved locally only. Autopilot cannot reply while you are signed out.', 'error');
    }
  };

  const handleRemove = () => {
    setGeminiKey('');
    setKey('');
    setResult(null);
    addNotification('API key removed from this browser. It stays on the server until replaced.', 'info');
  };

  const card: React.CSSProperties = { backgroundColor: 'white', borderRadius: '18px', border: '1px solid #e6e9f0', boxShadow: '0 1px 2px rgba(16,24,40,0.04)', padding: '24px' };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <div style={card}>
        <h3 style={{ fontSize: '16px', fontWeight: 700, color: '#0f172a', marginTop: 0, marginBottom: '6px' }}>Main AI key (Google Gemini)</h3>
        {/*
          The framing changed when `loadAiKey` gained a fallback.
          Writing is now part of the product: a workspace without a key of its
          own uses the operator's. So this stopped being "required" for a
          customer and became "yours, if you would rather" — and for the owner
          it became the key their whole install runs on, which is a bill worth
          naming on the screen where it is set.
        */}
        {getSession()?.user?.accountId == null && getSession()?.user?.role === 'agency' ? (
          <p style={{ fontSize: '13px', color: '#64748b', margin: '0 0 18px', lineHeight: 1.6 }}>
            <strong style={{ color: '#0f172a' }}>This is the key your whole installation writes with.</strong>{' '}
            Every workspace that has not connected one of its own uses it, so the usage — and the bill —
            scales with your customers. A customer who brings their own key uses theirs instead.
          </p>
        ) : (
          <p style={{ fontSize: '13px', color: '#64748b', margin: '0 0 18px', lineHeight: 1.6 }}>
            <strong style={{ color: '#0f172a' }}>Optional.</strong> Writing is included — campaigns, content
            and replies work without you arranging anything. Connect your own key here only if you would
            rather use your own quota and your own billing; it takes priority over ours when you do.
          </p>
        )}

        {/* Two copies, two answers. Shown apart because they fail apart: the
            browser one going missing costs you AI Shorts on this device, and
            the server one going missing costs every customer their replies and
            their campaign copy, silently, at three in the morning. */}
        <div style={{ display: 'grid', gap: 8, marginBottom: 14 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '10px 14px', borderRadius: 10, backgroundColor: savedKey ? '#ecfdf5' : '#fff7ed', border: `1px solid ${savedKey ? '#a7f3d0' : '#fed7aa'}` }}>
            {savedKey
              ? <><CheckCircle size={15} color="#059669" /><span style={{ fontSize: 13, fontWeight: 600, color: '#065f46' }}>This browser has a key — AI Shorts can analyse video here</span></>
              : <><XCircle size={15} color="#c2410c" /><span style={{ fontSize: 13, fontWeight: 600, color: '#9a3412' }}>This browser has no key — AI Shorts cannot analyse video on this device</span></>}
          </div>

          {/* Holding a key and having a working key are different states, and
              the green tick belongs only to the second. A stored key Google has
              refused is the worst one to paint green: everything downstream of
              it fails, and the screen would be saying it is fine. */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', padding: '10px 14px', borderRadius: 10, backgroundColor: !askedServer ? '#f8fafc' : serverWorks ? '#ecfdf5' : '#fff7ed', border: `1px solid ${!askedServer ? '#e2e8f0' : serverWorks ? '#a7f3d0' : '#fed7aa'}` }}>
            {!askedServer
              ? <><Loader size={15} color="#94a3b8" className="spin" /><span style={{ fontSize: 13, fontWeight: 600, color: '#64748b' }}>Checking what Autopilot has…</span></>
              : serverWorks
                ? <>
                    <CheckCircle size={15} color="#059669" />
                    <span style={{ fontSize: 13, fontWeight: 600, color: '#065f46', flex: 1, minWidth: 180 }}>
                      Autopilot has a working key{server?.verifiedAt ? ` — Google accepted it on ${new Date(server.verifiedAt).toLocaleString()}` : ''}
                    </span>
                  </>
                : <>
                    <XCircle size={15} color="#c2410c" />
                    <span style={{ fontSize: 13, fontWeight: 600, color: '#9a3412', flex: 1, minWidth: 180 }}>
                      {!server?.hasKey
                        ? 'Autopilot has no key — it cannot write campaigns or answer replies while you are signed out'
                        : server.lastError
                          ? 'Autopilot has a key that Google refused — campaigns and replies will fail until it is replaced'
                          : 'Autopilot has a key, not yet checked against Google — press Check now to find out before a customer does'}
                    </span>
                  </>}
            {askedServer && server?.hasKey && (
              <button onClick={handleCheckServer} disabled={checking}
                style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '6px 12px', backgroundColor: 'white', color: '#0f172a', border: '1px solid #cbd5e1', borderRadius: 8, fontSize: 12, fontWeight: 600, cursor: checking ? 'not-allowed' : 'pointer', whiteSpace: 'nowrap' }}>
                {checking ? <Loader size={12} className="spin" /> : <RefreshCw size={12} />}
                {checking ? 'Asking Google…' : 'Check now'}
              </button>
            )}
          </div>

          {askedServer && server?.lastError && (
            <div style={{ display: 'flex', alignItems: 'flex-start', gap: 8, padding: '10px 14px', borderRadius: 10, backgroundColor: '#fef2f2', border: '1px solid #fecaca' }}>
              <XCircle size={15} color="#dc2626" style={{ flexShrink: 0, marginTop: 1 }} />
              <span style={{ fontSize: 12.5, color: '#991b1b', lineHeight: 1.5 }}>
                Google last refused the stored key: {server.lastError}
              </span>
            </div>
          )}
        </div>

        <label style={{ display: 'block', fontSize: '13px', fontWeight: 500, color: '#475569', marginBottom: '6px' }}>API Key</label>
        <div style={{ display: 'flex', gap: 8, marginBottom: 12 }}>
          <div style={{ position: 'relative', flex: 1 }}>
            <input
              type={show ? 'text' : 'password'}
              value={key}
              onChange={e => { setKey(e.target.value); setResult(null); }}
              placeholder="AIza..."
              style={{ width: '100%', padding: '10px 40px 10px 12px', border: '1px solid #e2e8f0', borderRadius: '9px', fontSize: '13px', outline: 'none', boxSizing: 'border-box', fontFamily: 'ui-monospace, monospace' }}
            />
            <button onClick={() => setShow(v => !v)} title={show ? 'Hide' : 'Show'}
              style={{ position: 'absolute', right: 8, top: '50%', transform: 'translateY(-50%)', border: 'none', background: 'none', cursor: 'pointer', color: '#94a3b8', display: 'flex', padding: 4 }}>
              {show ? <EyeOff size={15} /> : <Eye size={15} />}
            </button>
          </div>
          <button onClick={handleSaveAndTest} disabled={testing || !key.trim()}
            style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '10px 18px', backgroundColor: testing || !key.trim() ? '#cbd5e1' : '#17191c', color: 'white', border: 'none', borderRadius: '9px', fontSize: '13px', fontWeight: 600, cursor: testing || !key.trim() ? 'not-allowed' : 'pointer', whiteSpace: 'nowrap' }}>
            {testing ? <><Loader size={14} className="spin" /> Verifying…</> : <><Save size={14} /> Verify & Save</>}
          </button>
          {savedKey && (
            <button onClick={handleRemove}
              style={{ padding: '10px 14px', backgroundColor: 'white', color: '#dc2626', border: '1px solid #fecaca', borderRadius: '9px', fontSize: '13px', fontWeight: 600, cursor: 'pointer', whiteSpace: 'nowrap' }}>
              Remove
            </button>
          )}
        </div>

        {result && (
          <div style={{ display: 'flex', alignItems: 'flex-start', gap: 8, padding: '10px 14px', borderRadius: 10, backgroundColor: result.ok ? '#ecfdf5' : '#fef2f2', border: `1px solid ${result.ok ? '#a7f3d0' : '#fecaca'}`, marginBottom: 12 }}>
            {result.ok ? <CheckCircle size={15} color="#059669" style={{ flexShrink: 0, marginTop: 1 }} /> : <XCircle size={15} color="#dc2626" style={{ flexShrink: 0, marginTop: 1 }} />}
            <span style={{ fontSize: 12.5, color: result.ok ? '#065f46' : '#991b1b', lineHeight: 1.5 }}>{result.msg}</span>
          </div>
        )}

        <div style={{ padding: '14px 16px', borderRadius: 10, backgroundColor: '#f8fafc', border: '1px solid #e2e8f0' }}>
          <p style={{ fontSize: 12.5, fontWeight: 700, color: '#0f172a', margin: '0 0 8px' }}>How to get a free key (2 minutes)</p>
          <ol style={{ fontSize: 12.5, color: '#475569', margin: 0, paddingLeft: 18, lineHeight: 1.8 }}>
            <li>Open <a href="https://aistudio.google.com/apikey" target="_blank" rel="noopener noreferrer" style={{ color: '#17191c', fontWeight: 600 }}>aistudio.google.com/apikey <ExternalLink size={11} style={{ display: 'inline', verticalAlign: 'middle' }} /></a></li>
            <li>Sign in with your Google account and click <strong>Create API key</strong></li>
            <li>Copy the key (starts with <code>AIza</code>) and paste it above, then Verify &amp; Save</li>
          </ol>
          <p style={{ fontSize: 11.5, color: '#94a3b8', margin: '10px 0 0', lineHeight: 1.5 }}>
            Verify &amp; Save keeps two copies: one in this browser, which talks to Google directly so a
            video never passes through us, and one encrypted on the server, which is what lets Autopilot
            write and reply on a schedule with nobody signed in. Neither is ever shown back to a browser.
          </p>
        </div>
      </div>
    </div>
  );
}
