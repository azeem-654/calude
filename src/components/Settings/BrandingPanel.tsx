/**
 * Settings → Branding.
 *
 * Also "Coming Soon" until now — despite the white-label system behind it
 * being real and already wired up: `activeBranding()` drives the product name
 * and logo in the top bar and the headline on the client login screen. The
 * only way to set any of it was a raw URL field buried in the agency's
 * sub-account edit dialog.
 *
 * So this edits that same branding rather than inventing a second one, and
 * previews it live, because the whole point of a white label is what it looks
 * like.
 *
 * The logo can be a URL or an uploaded file. An upload is validated on type
 * and size and stored as a data URI: there is no asset server here, and a
 * silently-too-large image is how local storage fills up and every unrelated
 * save starts failing.
 */
import { useRef, useState } from 'react';
import { Palette, Upload, Check, AlertTriangle, RotateCcw, Layers } from 'lucide-react';
import { activeAccount, updateSubAccount, activeBranding } from '../../services/tenancy';
import { useApp } from '../../context/AppContext';

const CARD: React.CSSProperties = {
  backgroundColor: 'white', borderRadius: 18, border: '1px solid #e6e9f0',
  boxShadow: '0 1px 2px rgba(16,24,40,0.04)', padding: 24, marginBottom: 20,
};
const LABEL: React.CSSProperties = { display: 'block', fontSize: 13, fontWeight: 500, color: '#475569', marginBottom: 5 };
const INPUT: React.CSSProperties = {
  width: '100%', padding: '9px 12px', border: '1px solid #e2e8f0', borderRadius: 9,
  fontSize: 13, outline: 'none', boxSizing: 'border-box', fontFamily: 'inherit',
};

/* Comfortably under the ~5MB localStorage budget once base64 inflates it by a
   third, and far more than a logo needs. */
const MAX_LOGO_BYTES = 512 * 1024;
const ALLOWED_LOGO = ['image/png', 'image/jpeg', 'image/svg+xml', 'image/webp', 'image/gif'];

export default function BrandingPanel() {
  const { addNotification } = useApp();
  const account = activeAccount();
  const live = activeBranding();

  const [appName, setAppName] = useState(account?.branding?.appName ?? '');
  const [logoUrl, setLogoUrl] = useState(account?.branding?.logoUrl ?? '');
  const [headline, setHeadline] = useState(account?.branding?.loginHeadline ?? '');
  const [err, setErr] = useState('');
  const [saved, setSaved] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  if (!account) {
    return (
      <div style={CARD}>
        <p style={{ fontSize: 13, color: '#64748b', margin: 0 }}>No workspace is active, so there is nothing to brand yet.</p>
      </div>
    );
  }

  const pickFile = (file: File | undefined) => {
    setErr(''); setSaved(false);
    if (!file) return;
    /* Both checks matter: the type keeps a renamed .exe out of an <img>, and
       the size keeps a 4MB photograph from filling the storage every other
       feature shares. */
    if (!ALLOWED_LOGO.includes(file.type)) {
      setErr(`"${file.name}" is a ${file.type || 'unknown'} file. Use a PNG, JPEG, SVG, WebP or GIF.`);
      return;
    }
    if (file.size > MAX_LOGO_BYTES) {
      setErr(`That image is ${(file.size / 1024).toFixed(0)}KB. Keep a logo under ${MAX_LOGO_BYTES / 1024}KB.`);
      return;
    }
    const reader = new FileReader();
    reader.onload = () => setLogoUrl(String(reader.result || ''));
    reader.onerror = () => setErr('That file could not be read.');
    reader.readAsDataURL(file);
  };

  const save = () => {
    setErr('');
    updateSubAccount(account.id, {
      branding: {
        appName: appName.trim(),
        logoUrl: logoUrl.trim(),
        loginHeadline: headline.trim(),
      },
    });
    setSaved(true);
    addNotification('Branding saved', 'success');
    /* The bar reads its branding once at mount, so the change is only fully
       visible after a reload — said plainly rather than leaving someone
       wondering why the header still shows the old name. */
  };

  const reset = () => { setAppName(''); setLogoUrl(''); setHeadline(''); setErr(''); setSaved(false); };

  const previewName = appName.trim() || 'crmpro';
  const previewHeadline = headline.trim() || 'Sign in to your workspace';

  return (
    <div>
      <div style={CARD}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 18, paddingBottom: 16, borderBottom: '1px solid #f1f5f9' }}>
          <div style={{ width: 42, height: 42, borderRadius: 12, backgroundColor: '#f0f1f3', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
            <Palette size={19} color="#17191c" />
          </div>
          <div style={{ minWidth: 0 }}>
            <h3 style={{ fontSize: 15, fontWeight: 700, color: '#0f172a', margin: 0 }}>White-label this workspace</h3>
            <p style={{ fontSize: 12, color: '#64748b', margin: '2px 0 0', lineHeight: 1.5 }}>
              What <strong>{account.name}</strong>&apos;s users see in the top bar and on the sign-in screen.
            </p>
          </div>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(240px, 100%), 1fr))', gap: 14 }}>
          <div>
            <label style={LABEL} htmlFor="brand-name">Product name</label>
            <input id="brand-name" value={appName} onChange={e => { setAppName(e.target.value); setSaved(false); }}
              maxLength={40} placeholder="crmpro" style={INPUT} />
            <p style={{ fontSize: 11, color: '#94a3b8', margin: '4px 0 0' }}>Replaces the wordmark in the top bar.</p>
          </div>
          <div>
            <label style={LABEL} htmlFor="brand-headline">Sign-in headline</label>
            <input id="brand-headline" value={headline} onChange={e => { setHeadline(e.target.value); setSaved(false); }}
              maxLength={80} placeholder="Sign in to your workspace" style={INPUT} />
            <p style={{ fontSize: 11, color: '#94a3b8', margin: '4px 0 0' }}>Shown above the login form.</p>
          </div>
        </div>

        <div style={{ marginTop: 14 }}>
          <label style={LABEL} htmlFor="brand-logo">Logo</label>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
            <input id="brand-logo" value={logoUrl.startsWith('data:') ? '' : logoUrl}
              onChange={e => { setLogoUrl(e.target.value); setSaved(false); }}
              placeholder={logoUrl.startsWith('data:') ? 'Uploaded image' : 'https://…/logo.png'}
              disabled={logoUrl.startsWith('data:')}
              style={{ ...INPUT, flex: '1 1 240px', backgroundColor: logoUrl.startsWith('data:') ? '#f8fafc' : '#fff' }} />
            <input ref={fileRef} type="file" accept={ALLOWED_LOGO.join(',')} style={{ display: 'none' }}
              onChange={e => { pickFile(e.target.files?.[0]); e.target.value = ''; }} />
            <button onClick={() => fileRef.current?.click()}
              style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '9px 14px', border: '1px solid #e2e8f0', borderRadius: 9, background: '#fff', fontSize: 13, fontWeight: 600, color: '#0f172a', cursor: 'pointer', fontFamily: 'inherit' }}>
              <Upload size={14} /> Upload
            </button>
            {logoUrl && (
              <button onClick={() => { setLogoUrl(''); setSaved(false); }} title="Remove the logo"
                style={{ padding: '9px 14px', border: '1px solid #e2e8f0', borderRadius: 9, background: '#fff', fontSize: 13, fontWeight: 600, color: '#64748b', cursor: 'pointer', fontFamily: 'inherit' }}>
                Remove
              </button>
            )}
          </div>
          <p style={{ fontSize: 11, color: '#94a3b8', margin: '4px 0 0' }}>
            PNG, JPEG, SVG, WebP or GIF, under {MAX_LOGO_BYTES / 1024}KB.
          </p>
        </div>

        {err && (
          <div style={{ display: 'flex', gap: 8, marginTop: 12, padding: '10px 12px', borderRadius: 9, backgroundColor: '#fef2f2', border: '1px solid #fecaca' }}>
            <AlertTriangle size={14} color="#dc2626" style={{ marginTop: 2, flexShrink: 0 }} />
            <p style={{ fontSize: 12.5, color: '#991b1b', margin: 0, lineHeight: 1.5 }}>{err}</p>
          </div>
        )}

        {/* ── Live preview ── */}
        <p style={{ fontSize: 11, fontWeight: 700, color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.05em', margin: '20px 0 8px' }}>Preview</p>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(240px, 100%), 1fr))', gap: 12 }}>
          <div style={{ border: '1px solid #e6e9f0', borderRadius: 12, padding: 14, backgroundColor: '#e9ebee' }}>
            <p style={{ fontSize: 10.5, color: '#8a8f98', margin: '0 0 8px', fontWeight: 600 }}>Top bar</p>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, background: 'transparent' }}>
              {logoUrl
                ? <img src={logoUrl} alt="" style={{ height: 26, maxWidth: 150, objectFit: 'contain' }} />
                : <><Layers size={22} color="#17191c" strokeWidth={2.4} /><span style={{ fontSize: 18, fontWeight: 800, color: '#17191c', letterSpacing: '-0.03em' }}>{previewName}</span></>}
            </div>
          </div>
          <div style={{ border: '1px solid #e6e9f0', borderRadius: 12, padding: 14, backgroundColor: '#fff' }}>
            <p style={{ fontSize: 10.5, color: '#8a8f98', margin: '0 0 8px', fontWeight: 600 }}>Sign-in screen</p>
            <div style={{ display: 'flex', alignItems: 'center', gap: 7, marginBottom: 6 }}>
              {logoUrl
                ? <img src={logoUrl} alt="" style={{ height: 20, maxWidth: 120, objectFit: 'contain' }} />
                : <><Layers size={17} color="#17191c" strokeWidth={2.4} /><span style={{ fontSize: 14, fontWeight: 800, color: '#17191c' }}>{previewName}</span></>}
            </div>
            <p style={{ fontSize: 13, fontWeight: 700, color: '#0f172a', margin: 0 }}>{previewHeadline}</p>
          </div>
        </div>

        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 18 }}>
          <button onClick={save}
            style={{ display: 'flex', alignItems: 'center', gap: 7, padding: '9px 18px', border: 'none', borderRadius: 9, backgroundColor: '#17191c', color: '#fff', fontSize: 13, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit' }}>
            {saved ? <><Check size={14} /> Saved</> : 'Save branding'}
          </button>
          <button onClick={reset}
            style={{ display: 'flex', alignItems: 'center', gap: 7, padding: '9px 16px', border: '1px solid #e2e8f0', borderRadius: 9, background: '#fff', color: '#64748b', fontSize: 13, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit' }}>
            <RotateCcw size={14} /> Back to defaults
          </button>
        </div>

        {saved && (
          <p style={{ fontSize: 11.5, color: '#64748b', margin: '12px 0 0', lineHeight: 1.55 }}>
            Saved. The top bar picks this up on the next page load — it currently still shows &ldquo;{live.appName}&rdquo;.
          </p>
        )}
      </div>
    </div>
  );
}
