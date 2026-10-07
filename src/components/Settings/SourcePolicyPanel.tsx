/**
 * Settings → Platform services → Prospect sources: the owner's switch per
 * source — on for every customer, kept internal (the owner alone), or off
 * (lib/sourcePolicyStore.ts). A source whose terms or redistribution rights
 * are unclear can be held back here without a deploy; manual searches,
 * connections to Autopilot and runs already going all respect it.
 */
import { useEffect, useState } from 'react';
import { Loader, ShieldCheck } from 'lucide-react';
import { SOURCE_POLICY, sourcePolicy } from '../../services/prospectSources';

const INK = '#0f172a', MUTED = '#64748b', LINE = '#e6e9f0';
const SOURCES = ['free', 'register', 'google'] as const;
const CHOICES = [['on', 'On for customers'], ['owner', 'Kept internal (you only)'], ['off', 'Off']] as const;

export default function SourcePolicyPanel() {
  const [settings, setSettings] = useState<Record<string, string> | null>(null);
  const [err, setErr] = useState('');
  const [saved, setSaved] = useState('');
  useEffect(() => { void sourcePolicy().then(r => { if (r.success) setSettings(r.settings ?? {}); else setErr(r.error ?? 'Could not read the sources.'); }); }, []);
  const set = async (k: string, v: string) => {
    const next = { ...(settings ?? {}), [k]: v };
    setSettings(next); setSaved('');
    const r = await sourcePolicy(next);
    if (!r.success) setErr(r.error ?? 'Could not save.'); else { setErr(''); setSaved(`${SOURCE_POLICY[k as 'free'].label}: ${CHOICES.find(c => c[0] === v)?.[1]}.`); }
  };
  return (
    <div style={{ background: '#fff', borderRadius: 18, border: `1px solid ${LINE}`, padding: 'clamp(16px, 3vw, 24px)', display: 'grid', gap: 12, minWidth: 0 }} data-testid="source-policy">
      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
        <ShieldCheck size={18} color="#4f46e5" />
        <h3 style={{ fontSize: 16, fontWeight: 700, color: INK, margin: 0 }}>Prospect sources</h3>
      </div>
      <p style={{ fontSize: 13, color: MUTED, margin: 0, lineHeight: 1.6 }}>
        Which sources your customers may search and connect to AI Autopilot. Hold one back — kept internal or off — while its terms or
        redistribution rights are unclear; searches, connections and runs already going respect it at once.
      </p>
      {!settings && !err && <span style={{ fontSize: 12.5, color: MUTED }}><Loader size={12} className="spin" /> Reading…</span>}
      {settings && SOURCES.map(k => (
        <div key={k} style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap', border: `1px solid ${LINE}`, borderRadius: 12, padding: '10px 12px' }}>
          <div style={{ flex: '1 1 220px', minWidth: 0 }}>
            <b style={{ fontSize: 13.5, color: INK }}>{SOURCE_POLICY[k].label}</b>
            <div style={{ fontSize: 12, color: MUTED }}>{SOURCE_POLICY[k].licence}{SOURCE_POLICY[k].automate ? '' : ' · never run on a schedule or kept'}</div>
          </div>
          <select value={settings[k] ?? 'on'} onChange={e => void set(k, e.target.value)} aria-label={`${SOURCE_POLICY[k].label} for customers`}
            style={{ padding: '7px 10px', borderRadius: 9, border: `1px solid ${LINE}`, fontSize: 13, fontFamily: 'inherit', color: INK, background: '#fff' }}>
            {CHOICES.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
          </select>
        </div>
      ))}
      {saved && <span role="status" style={{ fontSize: 12.5, color: '#0f7b3d' }}>{saved}</span>}
      {err && <span role="alert" style={{ fontSize: 12.5, color: '#b42318' }}>{err}</span>}
    </div>
  );
}
