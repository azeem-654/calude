/**
 * The Brand Kit — what videos are made in, read from what the workspace
 * already knows (the portfolio, the onboarding profile), with only the
 * video-specific parts editable here. Each value says where it came from, so
 * nobody is asked twice for their company name.
 */
import { useEffect, useState } from 'react';
import { Loader, Save, Palette } from 'lucide-react';
import { saveVideoKit, videoBrand, type VideoBrand, type VideoKit } from '../../services/videoStudio';

export default function BrandKit() {
  const [brand, setBrand] = useState<VideoBrand | null>(null);
  const [kit, setKit] = useState<VideoKit>({});
  const [saved, setSaved] = useState('');
  const [error, setError] = useState('');
  useEffect(() => { void videoBrand().then(r => { if (r.success) { setBrand(r.brand); setKit(r.kit); } else setError(r.error ?? 'Could not load.'); }); }, []);
  if (error) return <div className="vs-note bad">{error}</div>;
  if (!brand) return <p className="vs-sub"><Loader size={14} className="spin" /> Loading…</p>;
  const src = (k: string) => brand.from[k] === 'default' ? 'not set' : `from ${brand.from[k]}`;
  const save = async () => {
    const r = await saveVideoKit(kit);
    if (r.success) { setBrand(r.brand); setKit(r.kit); setSaved('Saved — new thumbnails and captions use it.'); setTimeout(() => setSaved(''), 2500); }
    else setError(r.error ?? 'Could not save.');
  };
  return (
    <div className="vs-new" data-testid="vs-brand">
      <div className="vs-card vs-col">
        <h2><Palette size={16} /> Your brand, as videos use it</h2>
        <p className="vs-sub">Read from your business profile — change those in the AI Autopilot portfolio and they follow here.</p>
        {[['Company', brand.company, 'company'], ['What you do', brand.description, 'description'], ['Website', brand.website, 'website']].map(([l, v, k]) => (
          <div key={k} className="vs-cap-row"><div><b>{l}</b><small>{v || '—'}</small></div><span className="vs-badge">{src(k)}</span></div>
        ))}
        <div className="vs-cap-row"><div><b>Logo</b><small>{brand.logoKey ? 'On thumbnails, top right' : 'No logo in your profile yet'}</small></div><span className="vs-badge">{src('logo')}</span></div>
      </div>
      <div className="vs-card vs-col">
        <h2>Video settings</h2>
        <div className="vs-row">
          <label className="vs-label" style={{ flex: 1 }}>Brand colour <span className="vs-kbd">{src('color')}</span>
            <input type="color" className="vs-input" style={{ height: 40, padding: 4 }} value={kit.color ?? brand.color} onChange={e => setKit(k => ({ ...k, color: e.target.value }))} />
          </label>
          <label className="vs-label" style={{ flex: 1 }}>Accent (highlighted words)
            <input type="color" className="vs-input" style={{ height: 40, padding: 4 }} value={kit.accent ?? brand.accent} onChange={e => setKit(k => ({ ...k, accent: e.target.value }))} />
          </label>
        </div>
        <label className="vs-label">Call to action <input className="vs-input" data-field="video.cta" maxLength={140} value={kit.cta ?? brand.cta} placeholder="Book a free call at example.com" onChange={e => setKit(k => ({ ...k, cta: e.target.value }))} /></label>
        <label className="vs-label">Social handles <input className="vs-input" maxLength={200} value={kit.handles ?? brand.handles} placeholder="@yourbrand on Instagram, TikTok and YouTube" onChange={e => setKit(k => ({ ...k, handles: e.target.value }))} /></label>
        <label className="vs-row" style={{ gap: 6, fontSize: 13 }}><input type="checkbox" checked={kit.useLogo !== false} onChange={e => setKit(k => ({ ...k, useLogo: e.target.checked }))} /> Put the logo on thumbnails</label>
        <div className="vs-row"><button type="button" className="vs-btn primary" onClick={() => void save()}><Save size={14} /> Save</button>{saved && <span className="vs-sub" style={{ margin: 0 }}>{saved}</span>}</div>
      </div>
    </div>
  );
}
