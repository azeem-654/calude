import { useState } from 'react';
import { X, Building2, Link2, Zap, Plus, Trash2, ToggleLeft, ToggleRight, ChevronRight, Star } from 'lucide-react';
import type { BusinessProfile, AutoResponseRule, Platform } from '../../services/reputationService';
import { blankRule } from '../../services/reputationService';

const INK = '#17191c';
const MUTED = '#8a8f98';
const inp: React.CSSProperties = { width: '100%', padding: '9px 11px', border: '1px solid #e6e9f0', borderRadius: 10, fontSize: 13, outline: 'none', boxSizing: 'border-box', fontFamily: 'inherit', backgroundColor: '#fff' };
const label: React.CSSProperties = { display: 'block', fontSize: 11.5, fontWeight: 600, color: '#475569', marginBottom: 5 };

type Tab = 'business' | 'sources' | 'rules';

export default function ReputationSetup({
  profile: initProfile, rules: initRules,
  google, onSave, onClose,
}: {
  profile: BusinessProfile;
  rules: AutoResponseRule[];
  google: { apiKey: string; placeId: string };
  onSave: (p: BusinessProfile, r: AutoResponseRule[], g: { apiKey: string; placeId: string }) => void;
  onClose: () => void;
}) {
  const [tab, setTab] = useState<Tab>('business');
  const [profile, setProfile] = useState<BusinessProfile>(initProfile);
  const [rules, setRules] = useState<AutoResponseRule[]>(initRules);
  const [g, setG] = useState(google);

  const setP = (patch: Partial<BusinessProfile>) => setProfile(prev => ({ ...prev, ...patch }));
  const setLink = (pl: Platform, v: string) => setProfile(prev => ({ ...prev, reviewLinks: { ...prev.reviewLinks, [pl]: v } }));
  const updateRule = (id: string, patch: Partial<AutoResponseRule>) => setRules(rs => rs.map(r => r.id === id ? { ...r, ...patch } : r));

  const TABS: { id: Tab; label: string; icon: typeof Zap }[] = [
    { id: 'business', label: 'Business Profile', icon: Building2 },
    { id: 'sources', label: 'Review Sources', icon: Link2 },
    { id: 'rules', label: 'Auto-Response', icon: Zap },
  ];

  return (
    <div style={{ position: 'fixed', inset: 0, backgroundColor: 'rgba(15,23,42,0.55)', backdropFilter: 'blur(4px)', zIndex: 400, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}>
      <div style={{ backgroundColor: '#fff', borderRadius: 20, width: '100%', maxWidth: 660, maxHeight: '92vh', display: 'flex', flexDirection: 'column', boxShadow: '0 24px 48px -12px rgba(16,24,40,0.28)', overflow: 'hidden' }}>
        <div style={{ padding: '20px 24px 0', flexShrink: 0 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 14 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
              <div style={{ width: 40, height: 40, borderRadius: 12, background: INK, display: 'flex', alignItems: 'center', justifyContent: 'center' }}><Star size={19} color="#fff" fill="#fff" /></div>
              <div>
                <h2 style={{ fontSize: 18, fontWeight: 800, color: INK, margin: 0, letterSpacing: '-0.02em' }}>Reputation Setup</h2>
                <p style={{ fontSize: 12.5, color: MUTED, margin: '2px 0 0' }}>Configure your profile, connect review sources, and set auto-responses.</p>
              </div>
            </div>
            <button onClick={onClose} style={{ border: 'none', background: '#f1f5f9', borderRadius: 9, padding: 7, display: 'flex', cursor: 'pointer' }}><X size={16} color="#64748b" /></button>
          </div>
          <div style={{ display: 'flex', gap: 20, borderBottom: '1px solid #e9edf3' }}>
            {TABS.map(t => (
              <button key={t.id} onClick={() => setTab(t.id)} aria-pressed={tab === t.id} style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '10px 2px', border: 'none', background: 'none', cursor: 'pointer', fontSize: 13, fontWeight: 600, color: tab === t.id ? INK : MUTED, borderBottom: tab === t.id ? `2px solid ${INK}` : '2px solid transparent', marginBottom: -1 }}>
                <t.icon size={14} /> {t.label}
              </button>
            ))}
          </div>
        </div>

        <div style={{ flex: 1, overflowY: 'auto', padding: '20px 24px 24px' }}>
          {tab === 'business' && (
            <div style={{ display: 'grid', gap: 14 }}>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
                <div><label style={label}>Business name</label><input style={inp} value={profile.name} onChange={e => setP({ name: e.target.value })} placeholder="Acme Studio" /></div>
                <div><label style={label}>Category</label><input style={inp} value={profile.category} onChange={e => setP({ category: e.target.value })} placeholder="Marketing agency" /></div>
              </div>
              <div><label style={label}>About the business</label><textarea style={{ ...inp, resize: 'vertical', lineHeight: 1.5 }} rows={2} value={profile.description} onChange={e => setP({ description: e.target.value })} placeholder="We help small businesses grow with done-for-you marketing." /></div>
              <div><label style={label}>Facts / policies the AI may reference in replies</label><textarea style={{ ...inp, resize: 'vertical', lineHeight: 1.5 }} rows={3} value={profile.knowledge} onChange={e => setP({ knowledge: e.target.value })} placeholder={'• Family-owned since 2012.\n• Satisfaction guarantee.\n• Contact us at hello@acme.com or (555) 123-4567.'} /></div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
                <div>
                  <label style={label}>Reply tone</label>
                  <select style={{ ...inp, cursor: 'pointer' }} value={profile.tone} onChange={e => setP({ tone: e.target.value as BusinessProfile['tone'] })}>
                    {['warm', 'professional', 'friendly', 'formal'].map(t => <option key={t} value={t}>{t[0].toUpperCase() + t.slice(1)}</option>)}
                  </select>
                </div>
                <div><label style={label}>Signature</label><input style={inp} value={profile.signature} onChange={e => setP({ signature: e.target.value })} placeholder="— The Acme Team" /></div>
              </div>
            </div>
          )}

          {tab === 'sources' && (
            <div style={{ display: 'grid', gap: 16 }}>
              <div style={{ border: '1px solid #e6e9f0', borderRadius: 14, padding: 16 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
                  <span style={{ width: 24, height: 24, borderRadius: 7, background: '#fef2f2', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#ea4335', fontWeight: 800, fontSize: 13 }}>G</span>
                  <span style={{ fontSize: 13.5, fontWeight: 700, color: INK }}>Google Business Profile</span>
                  <span style={{ fontSize: 11, color: MUTED }}>— live review sync</span>
                </div>
                <p style={{ fontSize: 12, color: MUTED, margin: '0 0 12px', lineHeight: 1.5 }}>
                  Paste a Google Places API key and your Place ID to pull live Google reviews. (Find your Place ID at Google's Place ID Finder.)
                </p>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                  <div><label style={label}>Google API key</label><input style={inp} type="password" value={g.apiKey} onChange={e => setG({ ...g, apiKey: e.target.value })} placeholder="AIza…" /></div>
                  <div><label style={label}>Place ID</label><input style={inp} value={g.placeId} onChange={e => setG({ ...g, placeId: e.target.value })} placeholder="ChIJ…" /></div>
                </div>
              </div>
              <div>
                <div style={{ fontSize: 12.5, fontWeight: 700, color: INK, marginBottom: 8 }}>Review request links</div>
                <p style={{ fontSize: 12, color: MUTED, margin: '0 0 10px' }}>Where customers land when you ask them for a review.</p>
                {(['google', 'facebook', 'yelp', 'trustpilot'] as Platform[]).map(pl => (
                  <div key={pl} style={{ marginBottom: 8 }}>
                    <label style={{ ...label, textTransform: 'capitalize' }}>{pl}</label>
                    <input style={inp} value={profile.reviewLinks[pl] ?? ''} onChange={e => setLink(pl, e.target.value)} placeholder={`https://…/${pl}-review-link`} />
                  </div>
                ))}
              </div>
            </div>
          )}

          {tab === 'rules' && (
            <div>
              <div style={{ padding: '12px 14px', background: '#f7f8f9', border: '1px solid #e9edf3', borderRadius: 12, fontSize: 12, color: '#5c6066', lineHeight: 1.6, marginBottom: 14 }}>
                By star range, choose to <strong>auto-send</strong> an AI reply, leave a <strong>draft</strong>, or just <strong>alert</strong> you. Great for auto-thanking 5-star reviews and instantly flagging 1-star ones.
              </div>
              {rules.map(rule => (
                <div key={rule.id} style={{ border: '1px solid #e6e9f0', borderRadius: 14, padding: 14, marginBottom: 10, background: rule.enabled ? '#fff' : '#fafbfc' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 10 }}>
                    <button onClick={() => updateRule(rule.id, { enabled: !rule.enabled })} style={{ border: 'none', background: 'none', cursor: 'pointer', padding: 0, display: 'flex' }}>
                      {rule.enabled ? <ToggleRight size={26} color={INK} /> : <ToggleLeft size={26} color="#cbd5e1" />}
                    </button>
                    <span style={{ fontSize: 13, fontWeight: 700, color: INK, flex: 1 }}>
                      {rule.minRating === rule.maxRating ? `${rule.minRating}★ reviews` : `${rule.minRating}–${rule.maxRating}★ reviews`}
                    </span>
                    <button onClick={() => setRules(rs => rs.filter(r => r.id !== rule.id))} style={{ border: 'none', background: '#fceaea', borderRadius: 8, padding: 7, cursor: 'pointer', display: 'flex' }}><Trash2 size={13} color="#e5484d" /></button>
                  </div>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 8, marginBottom: 8 }}>
                    <div><label style={label}>Min ★</label><select style={{ ...inp, cursor: 'pointer' }} value={rule.minRating} onChange={e => updateRule(rule.id, { minRating: Number(e.target.value) })}>{[1, 2, 3, 4, 5].map(n => <option key={n} value={n}>{n}</option>)}</select></div>
                    <div><label style={label}>Max ★</label><select style={{ ...inp, cursor: 'pointer' }} value={rule.maxRating} onChange={e => updateRule(rule.id, { maxRating: Number(e.target.value) })}>{[1, 2, 3, 4, 5].map(n => <option key={n} value={n}>{n}</option>)}</select></div>
                    <div>
                      <label style={label}>Action</label>
                      <select style={{ ...inp, cursor: 'pointer' }} value={rule.mode} onChange={e => updateRule(rule.id, { mode: e.target.value as AutoResponseRule['mode'] })}>
                        <option value="auto_send">Auto-send</option>
                        <option value="draft">Draft</option>
                        <option value="alert">Alert only</option>
                      </select>
                    </div>
                  </div>
                  <div><label style={label}>AI instruction</label><input style={inp} value={rule.instruction} onChange={e => updateRule(rule.id, { instruction: e.target.value })} placeholder="Thank them warmly and invite them back." /></div>
                </div>
              ))}
              <button onClick={() => setRules(rs => [...rs, blankRule()])} style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 7, width: '100%', padding: 12, border: '2px dashed #d5d8dd', borderRadius: 12, background: 'none', color: INK, fontSize: 13, fontWeight: 700, cursor: 'pointer' }}><Plus size={15} /> Add rule</button>
            </div>
          )}
        </div>

        <div style={{ padding: '14px 24px', borderTop: '1px solid #e9edf3', display: 'flex', justifyContent: 'flex-end', gap: 8, flexShrink: 0 }}>
          <button onClick={onClose} style={{ padding: '9px 16px', border: '1px solid #e6e9f0', borderRadius: 10, background: '#fff', color: '#374151', fontSize: 13, fontWeight: 600, cursor: 'pointer' }}>Cancel</button>
          {tab !== 'rules' ? (
            <button onClick={() => setTab(tab === 'business' ? 'sources' : 'rules')} style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '9px 18px', border: 'none', borderRadius: 10, background: INK, color: '#fff', fontSize: 13, fontWeight: 700, cursor: 'pointer' }}>Next <ChevronRight size={14} /></button>
          ) : (
            <button onClick={() => onSave(profile, rules, g)} style={{ padding: '9px 20px', border: 'none', borderRadius: 10, background: INK, color: '#fff', fontSize: 13, fontWeight: 700, cursor: 'pointer' }}>Save Settings</button>
          )}
        </div>
      </div>
    </div>
  );
}
