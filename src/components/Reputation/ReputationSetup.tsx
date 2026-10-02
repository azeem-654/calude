/**
 * Reputation settings: the business profile the AI writes from, where reviews
 * are read from, and the rules that act on new ones.
 *
 * The Review sources tab talks to the server as it goes — finding the place,
 * saving a key, connecting Business Profile — because each of those is a
 * credential or a call to Google, and none of them belongs in this browser.
 * The profile and rules are saved with "Save settings", into the workspace's
 * synced storage, where the cron reads them.
 */
import { useState } from 'react';
import { X, Building2, Link2, Zap, Plus, Trash2, ToggleLeft, ToggleRight, Star, Search, Check, ExternalLink } from 'lucide-react';
import type { BusinessProfile, AutoResponseRule, Platform, RepStatus, PlaceHit, GbpLocation } from '../../services/reputationService';
import { blankRule, findPlace, saveSource, gbpConnect, gbpLocations, gbpChoose, gbpDisconnect, repStatus } from '../../services/reputationService';

const INK = '#17191c';
const MUTED = '#8a8f98';
const inp: React.CSSProperties = { width: '100%', padding: '9px 11px', border: '1px solid #e6e9f0', borderRadius: 10, fontSize: 13, outline: 'none', boxSizing: 'border-box', fontFamily: 'inherit', backgroundColor: '#fff' };
const label: React.CSSProperties = { display: 'block', fontSize: 11.5, fontWeight: 600, color: '#475569', marginBottom: 5 };
const card: React.CSSProperties = { border: '1px solid #e6e9f0', borderRadius: 14, padding: 16 };
const two: React.CSSProperties = { display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(200px, 100%), 1fr))', gap: 14 };

type Tab = 'business' | 'sources' | 'rules';

export default function ReputationSetup({
  initialTab = 'business', profile: initProfile, rules: initRules, status, onStatus, onSave, onClose,
}: {
  initialTab?: Tab;
  profile: BusinessProfile;
  rules: AutoResponseRule[];
  status: RepStatus | null;
  onStatus: (s: RepStatus) => void;
  onSave: (p: BusinessProfile, r: AutoResponseRule[]) => void;
  onClose: () => void;
}) {
  const [tab, setTab] = useState<Tab>(initialTab);
  const [profile, setProfile] = useState<BusinessProfile>(initProfile);
  const [rules, setRules] = useState<AutoResponseRule[]>(initRules);

  const setP = (patch: Partial<BusinessProfile>) => setProfile(prev => ({ ...prev, ...patch }));
  const setLink = (pl: Platform, v: string) => setProfile(prev => ({ ...prev, reviewLinks: { ...prev.reviewLinks, [pl]: v } }));
  const updateRule = (id: string, patch: Partial<AutoResponseRule>) => setRules(rs => rs.map(r => r.id === id ? { ...r, ...patch } : r));

  const TABS: { id: Tab; label: string; icon: typeof Zap }[] = [
    { id: 'business', label: 'Business Profile', icon: Building2 },
    { id: 'sources', label: 'Review Sources', icon: Link2 },
    { id: 'rules', label: 'Auto-Response', icon: Zap },
  ];

  return (
    <div role="dialog" aria-label="Reputation setup" style={{ position: 'fixed', inset: 0, backgroundColor: 'rgba(15,23,42,0.55)', backdropFilter: 'blur(4px)', zIndex: 400, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 12 }}>
      <div style={{ backgroundColor: '#fff', borderRadius: 20, width: '100%', maxWidth: 680, maxHeight: '92vh', display: 'flex', flexDirection: 'column', boxShadow: '0 24px 48px -12px rgba(16,24,40,0.28)', overflow: 'hidden' }}>
        <div style={{ padding: '18px 20px 0', flexShrink: 0 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 14, gap: 10 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 12, minWidth: 0 }}>
              <div style={{ width: 40, height: 40, borderRadius: 12, background: INK, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}><Star size={19} color="#fff" fill="#fff" /></div>
              <div style={{ minWidth: 0 }}>
                <h2 style={{ fontSize: 18, fontWeight: 800, color: INK, margin: 0, letterSpacing: '-0.02em' }}>Reputation Setup</h2>
                <p style={{ fontSize: 12.5, color: MUTED, margin: '2px 0 0' }}>Your profile, where reviews are read from, and what happens to new ones.</p>
              </div>
            </div>
            <button onClick={onClose} aria-label="Close" style={{ border: 'none', background: '#f1f5f9', borderRadius: 9, padding: 7, display: 'flex', cursor: 'pointer' }}><X size={16} color="#64748b" /></button>
          </div>
          <div style={{ display: 'flex', gap: 16, borderBottom: '1px solid #e9edf3', overflowX: 'auto' }}>
            {TABS.map(t => (
              <button key={t.id} onClick={() => setTab(t.id)} aria-pressed={tab === t.id} style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '10px 2px', border: 'none', background: 'none', cursor: 'pointer', fontSize: 13, fontWeight: 600, color: tab === t.id ? INK : MUTED, borderBottom: tab === t.id ? `2px solid ${INK}` : '2px solid transparent', marginBottom: -1, whiteSpace: 'nowrap' }}>
                <t.icon size={14} /> {t.label}
              </button>
            ))}
          </div>
        </div>

        <div style={{ flex: 1, overflowY: 'auto', padding: '18px 20px 22px' }}>
          {tab === 'business' && (
            <div style={{ display: 'grid', gap: 14 }}>
              <div style={two}>
                <div><label style={label}>Business name</label><input style={inp} value={profile.name} onChange={e => setP({ name: e.target.value })} placeholder="Acme Studio" /></div>
                <div><label style={label}>Category</label><input style={inp} value={profile.category} onChange={e => setP({ category: e.target.value })} placeholder="Marketing agency" /></div>
              </div>
              <div><label style={label}>About the business</label><textarea style={{ ...inp, resize: 'vertical', lineHeight: 1.5 }} rows={2} value={profile.description} onChange={e => setP({ description: e.target.value })} placeholder="We help small businesses grow with done-for-you marketing." /></div>
              <div><label style={label}>Facts / policies the AI may reference in replies</label><textarea style={{ ...inp, resize: 'vertical', lineHeight: 1.5 }} rows={3} value={profile.knowledge} onChange={e => setP({ knowledge: e.target.value })} placeholder={'• Family-owned since 2012.\n• Satisfaction guarantee.\n• Contact us at hello@acme.com or (555) 123-4567.'} /></div>
              <div style={two}>
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
              <PlacesSource status={status} onStatus={onStatus} />
              <BusinessProfileSource status={status} onStatus={onStatus} />
              <div>
                <div style={{ fontSize: 12.5, fontWeight: 700, color: INK, marginBottom: 4 }}>Review request links</div>
                <p style={{ fontSize: 12, color: MUTED, margin: '0 0 10px', lineHeight: 1.55 }}>
                  Where customers land when you ask them for a review. Facebook, Yelp and Trustpilot are links only —
                  their reviews are <strong>not</strong> read into this screen.
                </p>
                {(['google', 'facebook', 'yelp', 'trustpilot'] as Platform[]).map(pl => (
                  <div key={pl} style={{ marginBottom: 8 }}>
                    <label style={{ ...label, textTransform: 'capitalize' }}>{pl}</label>
                    <input style={inp} data-field={`rep.link.${pl}`} value={profile.reviewLinks[pl] ?? ''} onChange={e => setLink(pl, e.target.value)} placeholder={pl === 'google' ? 'https://g.page/r/…/review' : `https://… your ${pl} review page`} />
                  </div>
                ))}
                <p style={{ fontSize: 11.5, color: MUTED, margin: '4px 0 0' }}>Links are saved with "Save settings".</p>
              </div>
            </div>
          )}

          {tab === 'rules' && (
            <div>
              <div style={{ padding: '12px 14px', background: '#f7f8f9', border: '1px solid #e9edf3', borderRadius: 12, fontSize: 12, color: '#5c6066', lineHeight: 1.6, marginBottom: 14 }}>
                For each new review that arrives, by its stars: <strong>auto-send</strong> an AI reply, leave a <strong>draft</strong> for you to read,
                or just <strong>alert</strong> you. Auto-send can only post through a connected Business Profile — otherwise it leaves a draft and flags it.
                Rules run on the server, after you press Save, and only on reviews that arrive after your first check.
              </div>
              {rules.map(rule => (
                <div key={rule.id} style={{ border: '1px solid #e6e9f0', borderRadius: 14, padding: 14, marginBottom: 10, background: rule.enabled ? '#fff' : '#fafbfc' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 10 }}>
                    <button onClick={() => updateRule(rule.id, { enabled: !rule.enabled })} aria-label={rule.enabled ? 'Turn rule off' : 'Turn rule on'} style={{ border: 'none', background: 'none', cursor: 'pointer', padding: 0, display: 'flex' }}>
                      {rule.enabled ? <ToggleRight size={26} color={INK} /> : <ToggleLeft size={26} color="#cbd5e1" />}
                    </button>
                    <span style={{ fontSize: 13, fontWeight: 700, color: INK, flex: 1 }}>
                      {rule.minRating === rule.maxRating ? `${rule.minRating}★ reviews` : `${rule.minRating}–${rule.maxRating}★ reviews`}
                    </span>
                    <button onClick={() => setRules(rs => rs.filter(r => r.id !== rule.id))} aria-label="Delete rule" style={{ border: 'none', background: '#fceaea', borderRadius: 8, padding: 7, cursor: 'pointer', display: 'flex' }}><Trash2 size={13} color="#e5484d" /></button>
                  </div>
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, minmax(0, 1fr))', gap: 8, marginBottom: 8 }}>
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

        <div style={{ padding: '14px 20px', borderTop: '1px solid #e9edf3', display: 'flex', justifyContent: 'flex-end', gap: 8, flexShrink: 0 }}>
          <button onClick={onClose} style={{ padding: '9px 16px', border: '1px solid #e6e9f0', borderRadius: 10, background: '#fff', color: '#374151', fontSize: 13, fontWeight: 600, cursor: 'pointer' }}>Close</button>
          <button onClick={() => onSave(profile, rules)} style={{ padding: '9px 20px', border: 'none', borderRadius: 10, background: INK, color: '#fff', fontSize: 13, fontWeight: 700, cursor: 'pointer' }}>Save settings</button>
        </div>
      </div>
    </div>
  );
}

/* ── Google Places: find the business, and optionally bring a key ── */
function PlacesSource({ status, onStatus }: { status: RepStatus | null; onStatus: (s: RepStatus) => void }) {
  const src = status?.source;
  const [q, setQ] = useState('');
  const [hits, setHits] = useState<PlaceHit[]>([]);
  const [key, setKey] = useState('');
  const [busy, setBusy] = useState('');
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);

  const search = async () => {
    setBusy('search'); setMsg(null);
    const r = await findPlace(q);
    setBusy('');
    if (!r.success) { setMsg({ ok: false, text: r.error ?? 'Search failed.' }); setHits([]); return; }
    setHits(r.places);
    if (!r.places.length) setMsg({ ok: false, text: r.fromLink ? 'Google found no business for that link. Type the name as it appears on Google Maps, with the town.' : 'Google found nothing for that. Try the name as it appears on Google Maps, with the town.' });
    else if (r.fromLink) setMsg({ ok: true, text: r.places.length === 1 ? 'This is the business your link points to — press it to use it.' : 'Your link matched more than one business — press yours.' });
  };
  const pick = async (p: PlaceHit) => {
    setBusy('pick'); setMsg(null);
    const r = await saveSource({ placeId: p.placeId, placeName: p.name });
    setBusy('');
    if (!r.success) { setMsg({ ok: false, text: r.error ?? 'Could not save.' }); return; }
    setHits([]); setQ('');
    onStatus(r);
    setMsg({ ok: true, text: `Saved — ${p.name}. Press Refresh on the Reviews screen to read it now; after that Google is checked on its own about every six hours.` });
  };
  const saveKey = async (clear = false) => {
    setBusy('key'); setMsg(null);
    const r = await saveSource(clear ? { clearKey: true } : { placesKey: key });
    setBusy('');
    if (!r.success) { setMsg({ ok: false, text: r.error ?? 'Could not save the key.' }); return; }
    setKey('');
    onStatus(r);
    setMsg({ ok: true, text: clear ? 'Your own key was removed.' : 'Key saved and encrypted. It is used from the next check.' });
  };

  return (
    <div style={card}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6, flexWrap: 'wrap' }}>
        <span style={{ width: 24, height: 24, borderRadius: 7, background: '#fef2f2', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#ea4335', fontWeight: 800, fontSize: 13 }}>G</span>
        <span style={{ fontSize: 13.5, fontWeight: 700, color: INK }}>Find your business on Google</span>
      </div>
      <p style={{ fontSize: 12, color: MUTED, margin: '0 0 12px', lineHeight: 1.55 }}>
        Reads your Google rating, review count and up to five reviews (Google chooses which). No Google account needed.
        Type the name and town, or paste the link from Google Maps (Share → Copy link) or your g.page review link.
      </p>
      {src?.placeId && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12.5, color: INK, background: '#f7f8f9', borderRadius: 10, padding: '8px 10px', marginBottom: 10, flexWrap: 'wrap' }}>
          <Check size={13} color="#3f9142" /> <strong style={{ overflowWrap: 'anywhere' }}>{src.placeName || src.placeId}</strong>
          {src.mapsUrl && <a href={src.mapsUrl} target="_blank" rel="noopener noreferrer" style={{ color: MUTED, display: 'inline-flex', alignItems: 'center', gap: 3 }}>Maps <ExternalLink size={11} /></a>}
        </div>
      )}
      <div style={{ display: 'flex', gap: 8 }}>
        <input data-field="rep.search" style={{ ...inp, flex: 1, minWidth: 0 }} value={q} onChange={e => setQ(e.target.value)} onKeyDown={e => { if (e.key === 'Enter') void search(); }}
          placeholder={src?.placeId ? 'Search again, or paste a Maps link, to change it' : 'Business name and town, or a Google Maps link'} aria-label="Business name and town, or a Google Maps link" />
        <button onClick={search} disabled={busy === 'search'} style={btnDark}><Search size={13} /> {busy === 'search' ? 'Searching…' : 'Search'}</button>
      </div>
      {hits.map(h => (
        <button key={h.placeId} onClick={() => pick(h)} disabled={busy === 'pick'} style={{ display: 'block', width: '100%', textAlign: 'left', marginTop: 6, padding: '9px 11px', border: '1px solid #e6e9f0', borderRadius: 10, background: '#fff', cursor: 'pointer' }}>
          <div style={{ fontSize: 13, fontWeight: 700, color: INK }}>{h.name}{h.rating != null && <span style={{ color: MUTED, fontWeight: 600 }}> · {h.rating.toFixed(1)}★ ({h.count ?? 0})</span>}</div>
          <div style={{ fontSize: 11.5, color: MUTED }}>{h.address}</div>
        </button>
      ))}

      <div style={{ marginTop: 14 }}>
        <label style={label}>Your own Google Places API key (optional)</label>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <input data-field="rep.placesKey" type="password" autoComplete="new-password" style={{ ...inp, flex: 1, minWidth: 180 }} value={key} onChange={e => setKey(e.target.value)}
            placeholder={src?.ownKey ? 'Stored — leave blank to keep it' : 'AIza…'} aria-label="Your own Google Places API key" />
          <button onClick={() => saveKey(false)} disabled={busy === 'key' || !key.trim()} style={btnLight}>Save key</button>
          {src?.ownKey && <button onClick={() => saveKey(true)} disabled={busy === 'key'} style={btnLight}>Remove my key</button>}
        </div>
        <p style={{ fontSize: 11.5, color: MUTED, margin: '6px 0 0', lineHeight: 1.55 }}>
          {src?.ownKey ? (src.ownKeyVerified ? 'Your own key is in use and has worked.' : 'Your own key is saved; it has not been used successfully yet.')
            : status?.installKey ? 'Not needed — this app\'s own key is used when you have none.'
            : 'This app has no Google key of its own yet, so searching and reading need yours (Places API (New) enabled).'}
          {' '}Encrypted on the server and never shown again.
        </p>
      </div>
      {msg && <div role={msg.ok ? 'status' : 'alert'} style={{ marginTop: 10, fontSize: 12, lineHeight: 1.5, color: msg.ok ? '#2f6b31' : '#b42318' }}>{msg.text}</div>}
    </div>
  );
}

/* ── Business Profile: every review, and replying from here ── */
function BusinessProfileSource({ status, onStatus }: { status: RepStatus | null; onStatus: (s: RepStatus) => void }) {
  const gbp = status?.gbp;
  const [locations, setLocations] = useState<GbpLocation[] | null>(null);
  const [choice, setChoice] = useState('');
  const [busy, setBusy] = useState('');
  const [err, setErr] = useState('');

  const loadLocations = async () => {
    setBusy('list'); setErr('');
    const r = await gbpLocations();
    setBusy('');
    if (!r.success) { setErr(r.error ?? 'Google could not list your locations.'); return; }
    setLocations(r.locations);
    setChoice(r.locations[0]?.id ?? '');
    if (!r.locations.length) setErr('Google lists no locations for this Google account. Connect with the account that manages the business on Google.');
  };

  const connect = async () => {
    setBusy('connect'); setErr('');
    const r = await gbpConnect();
    setBusy('');
    if (!r.success) { setErr(r.error ?? 'Could not start the connection.'); return; }
    window.location.href = r.url;
  };
  const choose = async () => {
    setBusy('choose'); setErr('');
    const r = await gbpChoose(choice);
    setBusy('');
    if (!r.success) { setErr(r.error ?? 'Could not choose that location.'); return; }
    setLocations(null);
    onStatus(r);
  };
  const disconnect = async () => {
    setBusy('disconnect');
    const r = await gbpDisconnect();
    setBusy('');
    if (r.success) { setLocations(null); onStatus(r); } else { const s = await repStatus(); if (s.success) onStatus(s); }
  };

  return (
    <div style={card}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6, flexWrap: 'wrap' }}>
        <span style={{ width: 24, height: 24, borderRadius: 7, background: '#eef4ff', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#1a73e8', fontWeight: 800, fontSize: 13 }}>B</span>
        <span style={{ fontSize: 13.5, fontWeight: 700, color: INK }}>Google Business Profile</span>
        {gbp?.status === 'connected' && <span style={{ fontSize: 11, fontWeight: 700, padding: '2px 8px', borderRadius: 999, background: '#e9f4e6', color: '#3f9142' }}>Connected</span>}
      </div>
      <p style={{ fontSize: 12, color: MUTED, margin: '0 0 12px', lineHeight: 1.55 }}>
        Sign in with the Google account that manages your business on Google. This adds <strong>all</strong> your reviews (not just five)
        and lets you <strong>reply from here</strong> — Google accepts replies only this way.
      </p>
      {!gbp?.configured && <div style={{ fontSize: 12, color: '#7c5a10', background: '#fdf5e7', borderRadius: 10, padding: '8px 10px' }}>This app's Google sign-in is not set up yet, so Business Profile cannot be connected. The owner of this app sets it up in Settings → Platform services.</div>}
      {gbp?.configured && (gbp.status === 'none' || gbp.status === 'error') && (
        <>
          {gbp.status === 'error' && <div role="alert" style={{ fontSize: 12, color: '#b42318', marginBottom: 8 }}>{gbp.lastError || 'The connection stopped working.'}</div>}
          <button onClick={connect} disabled={busy === 'connect'} style={btnDark}>{busy === 'connect' ? 'Opening Google…' : 'Connect Google Business Profile'}</button>
        </>
      )}
      {gbp?.status === 'connected' && (
        <div style={{ display: 'grid', gap: 10 }}>
          <div style={{ fontSize: 12.5, color: INK }}>Signed in as <strong>{gbp.ownerEmail}</strong>{gbp.location && <> · location <strong>{gbp.location.title}</strong></>}</div>
          {gbp.lastError && <div role="alert" style={{ fontSize: 12, color: '#b42318', lineHeight: 1.5 }}>{gbp.lastError}</div>}
          {(!gbp.location || locations) && (
            locations && locations.length > 0 ? (
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                <select data-field="rep.gbpLocation" aria-label="Location" value={choice} onChange={e => setChoice(e.target.value)} style={{ ...inp, flex: 1, minWidth: 180, cursor: 'pointer' }}>
                  {locations.map(l => <option key={l.id} value={l.id}>{l.title}{l.address ? ` — ${l.address}` : ''}</option>)}
                </select>
                <button onClick={choose} disabled={!choice || busy === 'choose'} style={btnDark}>Use this location</button>
              </div>
            ) : (
              <button onClick={loadLocations} disabled={busy === 'list'} style={btnLight}>{busy === 'list' ? 'Asking Google…' : 'Choose a location'}</button>
            )
          )}
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            {gbp.location && !locations && <button onClick={loadLocations} style={btnLight}>Change location</button>}
            <button onClick={disconnect} disabled={busy === 'disconnect'} style={btnLight}>Disconnect</button>
          </div>
        </div>
      )}
      {err && <div role="alert" style={{ marginTop: 10, fontSize: 12, color: '#b42318', lineHeight: 1.5 }}>{err}</div>}
    </div>
  );
}

const btnDark: React.CSSProperties = { display: 'inline-flex', alignItems: 'center', gap: 6, padding: '9px 14px', border: 'none', borderRadius: 10, background: INK, color: '#fff', fontSize: 12.5, fontWeight: 700, cursor: 'pointer', flexShrink: 0 };
const btnLight: React.CSSProperties = { display: 'inline-flex', alignItems: 'center', gap: 6, padding: '9px 14px', border: '1px solid #e6e9f0', borderRadius: 10, background: '#fff', color: INK, fontSize: 12.5, fontWeight: 600, cursor: 'pointer', flexShrink: 0 };
