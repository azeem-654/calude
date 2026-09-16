/**
 * The owner's Google application, and the three things that go wrong with it.
 *
 * ── Why the owner and nobody else ──
 *
 * Google's consent screen carries a name and a logo, and on this install that
 * is the operator's brand. A sub-account configuring its own would put its name
 * on the screen every other customer sees. It is also the operator's quota and
 * the operator's problem if it is abused — the same reasoning that keeps the
 * payment processor and the registrar owner-only.
 *
 * ── What this screen is actually for ──
 *
 * Not "enter two strings". The strings are easy; what is hard is that Google
 * matches the redirect address character for character and gives you
 * `redirect_uri_mismatch` when it does not, which names nothing you can act on.
 * So the exact string is printed here with a copy button, and the steps are in
 * the order the console presents them rather than the order the fields are in.
 *
 * ── The scopes are not on this screen ──
 *
 * Deliberately. `openid email profile` are the three that need no review and no
 * user cap; anything more puts the whole install into Google's verification
 * queue. They are a constant in worker/src/lib/googleAuth.ts, not a field, so
 * that moving the install into that queue has to be a code change somebody
 * argues for.
 */
import { useEffect, useState } from 'react';
import { Check, Copy, ExternalLink, Loader, ShieldCheck } from 'lucide-react';
import { googleConfig, saveGoogleConfig, type GoogleConfig } from '../../services/auth';

const INK = '#0f172a';
const MUTED = '#64748b';
const LINE = '#e6e9f0';

export default function GoogleSignInPanel() {
  const [cfg, setCfg] = useState<GoogleConfig | null>(null);
  const [clientId, setClientId] = useState('');
  const [clientSecret, setClientSecret] = useState('');
  const [busy, setBusy] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState('');
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    let alive = true;
    void (async () => {
      const c = await googleConfig();
      if (!alive) return;
      setCfg(c);
      setClientId(c.clientId);
    })();
    return () => { alive = false; };
  }, []);

  const save = async () => {
    setBusy(true); setError(''); setSaved(false);
    const r = await saveGoogleConfig(clientId.trim(), clientSecret);
    setBusy(false);
    if (!r.ok) { setError(r.error); return; }
    setCfg(r.config);
    setClientId(r.config.clientId);
    /* Cleared on success. The field showed what was typed, and leaving a real
       secret sitting in a form on a screen somebody walks away from is the one
       way this panel could leak the thing it exists to protect. */
    setClientSecret('');
    setSaved(true);
  };

  const copy = () => {
    if (!cfg?.redirectUri) return;
    void navigator.clipboard?.writeText(cfg.redirectUri);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1600);
  };

  if (!cfg) return null;

  const inp: React.CSSProperties = {
    width: '100%', padding: '10px 12px', border: `1px solid ${LINE}`, borderRadius: 10,
    fontSize: 13, outline: 'none', boxSizing: 'border-box', fontFamily: 'inherit', background: '#fff',
  };

  return (
    <div style={{ background: '#fff', borderRadius: 18, border: `1px solid ${LINE}`, padding: 24, marginTop: 20 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 9, marginBottom: 4 }}>
        <h3 style={{ fontSize: 16, fontWeight: 700, color: INK, margin: 0 }}>Sign in with Google</h3>
        {cfg.connected && (
          <span style={{
            display: 'inline-flex', alignItems: 'center', gap: 4, fontSize: 11, fontWeight: 700,
            padding: '3px 9px', borderRadius: 999, background: '#e8f6ee', color: '#0f7b3d',
          }}>
            <ShieldCheck size={10} /> On
          </span>
        )}
      </div>
      <p style={{ fontSize: 13, color: MUTED, margin: '0 0 18px', lineHeight: 1.6 }}>
        Lets your customers sign in with their Google account instead of a password. This asks Google
        only for their name and email address — the three scopes that need no review and carry no user
        limit. Until it is set up, the button is not shown to anybody.
      </p>

      {/* ── The redirect address, because this is what actually goes wrong ── */}
      <div style={{ background: '#f8fafc', border: `1px solid ${LINE}`, borderRadius: 12, padding: '13px 14px', marginBottom: 16 }}>
        <div style={{ fontSize: 11.5, fontWeight: 700, color: INK, marginBottom: 6 }}>
          Authorised redirect URI — paste this into Google exactly
        </div>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
          <code style={{
            flex: 1, minWidth: 200, fontSize: 12, color: INK, background: '#fff',
            border: `1px solid ${LINE}`, borderRadius: 8, padding: '7px 9px', wordBreak: 'break-all',
          }}>
            {cfg.redirectUri}
          </code>
          <button onClick={copy} style={{
            display: 'inline-flex', alignItems: 'center', gap: 5, padding: '7px 11px',
            border: `1px solid ${LINE}`, borderRadius: 8, background: '#fff', color: INK,
            fontSize: 11.5, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit',
          }}>
            {copied ? <Check size={11} color="#0f7b3d" /> : <Copy size={11} />} {copied ? 'Copied' : 'Copy'}
          </button>
        </div>
        <p style={{ fontSize: 11.5, color: MUTED, margin: '9px 0 0', lineHeight: 1.6 }}>
          Also add <code style={{ color: INK }}>{cfg.origin}</code> under <em>Authorised JavaScript origins</em>.
          Google compares both character for character; a trailing slash or <code style={{ color: INK }}>http</code>{' '}
          instead of <code style={{ color: INK }}>https</code> is enough to break it.
        </p>
        <p style={{ fontSize: 11.5, color: MUTED, margin: '7px 0 0', lineHeight: 1.6 }}>
          This is the only address Google will send people back to, so the Google button appears on{' '}
          <code style={{ color: INK }}>{cfg.origin}</code> and not on a reseller's own domain. Those
          customers sign in with an emailed code instead.
        </p>
      </div>

      <div style={{ display: 'grid', gap: 12 }}>
        <label style={{ display: 'grid', gap: 5 }}>
          <span style={{ fontSize: 12, fontWeight: 700, color: INK }}>Client ID</span>
          <input style={inp} value={clientId} onChange={e => setClientId(e.target.value)}
            placeholder="1234567890-abc.apps.googleusercontent.com" spellCheck={false} />
        </label>
        <label style={{ display: 'grid', gap: 5 }}>
          <span style={{ fontSize: 12, fontWeight: 700, color: INK }}>Client secret</span>
          <input style={inp} type="password" value={clientSecret} autoComplete="new-password"
            onChange={e => setClientSecret(e.target.value)}
            placeholder={cfg.connected ? 'Stored — leave blank to keep it' : 'GOCSPX-…'} />
          <span style={{ fontSize: 11.5, color: MUTED, lineHeight: 1.55 }}>
            Encrypted before it is stored and never shown again, not even the last few characters.
            Leave it blank to keep the one already saved.
          </span>
        </label>

        {error && <div style={{ fontSize: 12.5, color: '#e5484d', fontWeight: 600 }}>{error}</div>}
        {saved && <div style={{ fontSize: 12.5, color: '#0f7b3d', fontWeight: 600 }}>Saved. The Google button is now on the sign-in screen.</div>}

        <div style={{ display: 'flex', gap: 9, alignItems: 'center', flexWrap: 'wrap' }}>
          <button onClick={() => void save()} disabled={busy} style={{
            display: 'inline-flex', alignItems: 'center', gap: 7, padding: '10px 18px',
            background: '#17191c', color: '#fff', border: 'none', borderRadius: 9,
            fontSize: 13, fontWeight: 600, cursor: busy ? 'default' : 'pointer', fontFamily: 'inherit',
          }}>
            {busy ? <Loader size={13} className="spin" /> : <Check size={13} />} Save
          </button>
          <a href="https://console.cloud.google.com/apis/credentials" target="_blank" rel="noopener noreferrer"
            style={{
              display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 12.5,
              fontWeight: 700, color: MUTED, textDecoration: 'none',
            }}>
            Google Cloud console <ExternalLink size={12} />
          </a>
        </div>
      </div>

      {/* ── In the console's own order, not the form's ── */}
      <ol style={{ margin: '18px 0 0', paddingLeft: 18, fontSize: 12.5, color: MUTED, lineHeight: 1.85 }}>
        <li>In the Google Cloud console, create a project (any name — customers never see it).</li>
        <li>
          Under <strong>APIs &amp; Services → OAuth consent screen</strong>, choose <strong>External</strong>,
          put your business name and logo on it, and add only the <strong>openid</strong>,{' '}
          <strong>email</strong> and <strong>profile</strong> scopes. Do not add any Gmail, Drive or
          Calendar scope — those put the app into Google's review queue and cap it at 100 users.
        </li>
        <li>Publish it. With only those three scopes there is no review and no waiting.</li>
        <li>
          Under <strong>Credentials</strong>, create an <strong>OAuth client ID</strong> of type{' '}
          <strong>Web application</strong>, and paste the redirect URI above into it.
        </li>
        <li>Copy the client ID and client secret it shows you into the two boxes here.</li>
      </ol>
    </div>
  );
}
