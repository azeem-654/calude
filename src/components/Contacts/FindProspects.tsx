/**
 * Finding businesses to approach, without connecting anything.
 *
 * ── What this replaces, and why ──
 *
 * The app had a prospect search built on Google Places, which needed the
 * customer's own API key. Two problems: it is not free past 5,000 searches a
 * month, and — the fatal one — Google's terms forbid storing what comes back.
 * A prospect list is stored contact details by definition, so that feature
 * could never legally have been the feature it looked like.
 *
 * OpenStreetMap has no key, no bill, and a licence that allows keeping the
 * results with attribution.
 *
 * ── Saying what it is not good at ──
 *
 * OSM coverage is genuinely uneven: excellent for a European high street,
 * thin for a sole trader in a suburb nobody has mapped. That is said on the
 * screen, before the search, rather than left for somebody to infer from an
 * empty result. A tool that quietly returns nothing reads as broken; one that
 * warned you reads as honest.
 *
 * ── Two steps, deliberately ──
 *
 * Search is free and instant. Reading each business's website for a published
 * address is a page fetch each, so it happens only for the rows somebody
 * actually ticked. That is faster, and it is a smaller imposition on the sites
 * being read.
 *
 * ── The bit that is not ours to decide ──
 *
 * Whether these people may be emailed. The confirmation before importing is
 * not a disclaimer to click past — it is clause 3 of the acceptable use policy,
 * and the honest answer is that a published business address and a relevant
 * offer is the lawful case, while "I found it, so I'll mail it" is not.
 */
import { useState } from 'react';
import {
  AlertTriangle, Clock, Globe, Loader, Mail, MapPin, Phone, Search, UserPlus, X,
} from 'lucide-react';
import { useApp } from '../../context/AppContext';
import { featureReady } from '../../services/features';
import { lookupContacts, searchProspects, type Contactable, type Prospect } from '../../services/prospects';
import type { Contact } from '../../types';

const INK = '#17191c';
const MUTED = '#6b7280';
const LINE = '#e6e9f0';
const ACCENT = '#5b46e5';

export default function FindProspects({ onClose }: { onClose: () => void }) {
  const { bulkImportContacts, addNotification } = useApp();
  const [trade, setTrade] = useState('');
  const [place, setPlace] = useState('');
  const [busy, setBusy] = useState(false);
  const [enriching, setEnriching] = useState(false);
  const [error, setError] = useState('');
  const [results, setResults] = useState<Prospect[] | null>(null);
  const [attribution, setAttribution] = useState('');
  const [cached, setCached] = useState(false);
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const [found, setFound] = useState<Record<string, Contactable>>({});
  const [confirmed, setConfirmed] = useState(false);

  const search = async () => {
    setBusy(true); setError(''); setResults(null); setPicked(new Set()); setFound({});
    const r = await searchProspects(trade.trim(), place.trim());
    setBusy(false);
    if (r.error) { setError(r.error); return; }
    setResults(r.prospects);
    setAttribution(r.attribution);
    setCached(r.cached);
  };

  const toggle = (ref: string) => {
    setPicked(p => {
      const next = new Set(p);
      if (next.has(ref)) next.delete(ref); else next.add(ref);
      return next;
    });
  };

  const chosen = (results ?? []).filter(p => picked.has(p.ref));

  const enrich = async () => {
    const sites = chosen.map(p => p.website).filter(Boolean).slice(0, 8);
    if (!sites.length) { addNotification('None of those have a website listed.', 'error'); return; }
    setEnriching(true);
    const r = await lookupContacts(sites);
    setEnriching(false);
    if (r.error) { addNotification(r.error, 'error'); return; }
    setFound(f => ({ ...f, ...r.contacts }));
    const n = Object.values(r.contacts).reduce((sum, c) => sum + c.emails.length, 0);
    addNotification(
      n ? `Found ${n} published address${n === 1 ? '' : 'es'}.` : 'None of those publish an email address on their site.',
      n ? 'success' : 'error',
    );
  };

  const emailFor = (p: Prospect): string => p.email || found[p.website]?.emails[0] || '';

  const importThem = () => {
    if (!chosen.length) return;
    const now = new Date().toISOString();
    const rows: Omit<Contact, 'id'>[] = chosen.map(p => ({
      name: p.name,
      email: emailFor(p),
      phone: p.phone,
      status: 'prospect',
      /* Tagged with where and what, because a list of 40 businesses with no
         label is unusable a week later. */
      tags: ['prospect search', p.category].filter(Boolean),
      /* The stamp says what made the row, so a list full of found businesses
         can still be told apart from people who asked to hear from you — which
         is the distinction the sending rules turn on. */
      source: `OpenStreetMap · ${trade.trim()} in ${place.trim()}`,
      createdAt: now,
      lastActivity: now,
      value: 0,
      company: p.name,
      website: p.website,
      address: p.address,
    }));
    bulkImportContacts(rows);
    addNotification(`${rows.length} added to Contacts as prospects.`, 'success');
    onClose();
  };

  const inp: React.CSSProperties = {
    width: '100%', padding: '11px 12px 11px 36px', border: `1px solid ${LINE}`, borderRadius: 11,
    fontSize: 14, outline: 'none', boxSizing: 'border-box', fontFamily: 'inherit', background: '#fff',
  };

  /*
   * ── Held back on the live app ──
   *
   * Not hidden. Somebody who reads "coming soon" knows the thing is being
   * worked on; somebody who finds nothing concludes the product cannot do it
   * and goes looking elsewhere. This says what it will do, which is also the
   * cheapest way to find out whether anyone wants it.
   *
   * On testing.protectedcentral.com this branch is not taken and the whole
   * thing works, which is the point of having that site.
   */
  if (!featureReady('prospects')) {
    return (
      <div role="dialog" aria-label="Find businesses" style={{
        position: 'fixed', inset: 0, background: 'rgba(16,24,40,0.45)', zIndex: 200,
        display: 'flex', alignItems: 'flex-start', justifyContent: 'center',
        padding: 'clamp(12px, 4vw, 44px) clamp(12px, 4vw, 24px)', overflowY: 'auto',
      }}>
        <div style={{ width: '100%', maxWidth: 460, background: '#fff', borderRadius: 18, overflow: 'hidden' }}>
          <header style={{ display: 'flex', gap: 10, alignItems: 'center', padding: '15px 18px', borderBottom: `1px solid ${LINE}` }}>
            <Clock size={16} color={ACCENT} />
            <span style={{ flex: 1, fontSize: 15, fontWeight: 800, color: INK }}>Find businesses</span>
            <button onClick={onClose} aria-label="Close" style={{ background: 'none', border: 0, padding: 4, cursor: 'pointer', color: MUTED }}>
              <X size={17} />
            </button>
          </header>
          <div style={{ padding: 20 }}>
            <span style={{
              display: 'inline-block', fontSize: 11, fontWeight: 800, letterSpacing: '0.04em',
              padding: '3px 10px', borderRadius: 999, background: '#eef2ff', color: '#3730a3',
            }}>
              COMING SOON
            </span>
            <p style={{ margin: '12px 0 0', fontSize: 13.5, color: '#374151', lineHeight: 1.7 }}>
              Search for businesses by trade and town, read the contact details they publish on their own
              website, and add the ones you pick straight to Contacts as prospects — without connecting
              an account or paying per search.
            </p>
            <p style={{ margin: '11px 0 0', fontSize: 12.5, color: MUTED, lineHeight: 1.7 }}>
              It is built and being tested. It is not switched on here yet because how useful it is depends
              on how thoroughly your own town has been mapped, and that is worth knowing before it becomes a
              button everybody presses once.
            </p>
            <p style={{ margin: '11px 0 0', fontSize: 12.5, color: MUTED, lineHeight: 1.7 }}>
              In the meantime, <strong style={{ color: INK }}>Import</strong> takes a CSV of a list you
              already have.
            </p>
            <button onClick={onClose} style={{
              marginTop: 16, width: '100%', padding: '11px', background: INK, color: '#fff', border: 'none',
              borderRadius: 11, fontSize: 13.5, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit',
            }}>
              Close
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div role="dialog" aria-label="Find businesses" style={{
      position: 'fixed', inset: 0, background: 'rgba(16,24,40,0.45)', zIndex: 200,
      display: 'flex', alignItems: 'flex-start', justifyContent: 'center',
      padding: 'clamp(12px, 4vw, 44px) clamp(12px, 4vw, 24px)', overflowY: 'auto',
    }}>
      <div style={{ width: '100%', maxWidth: 680, background: '#fff', borderRadius: 18, overflow: 'hidden' }}>
        <header style={{ display: 'flex', gap: 10, alignItems: 'center', padding: '15px 18px', borderBottom: `1px solid ${LINE}` }}>
          <Search size={16} color={ACCENT} />
          <span style={{ flex: 1, minWidth: 0 }}>
            <span style={{ display: 'block', fontSize: 15, fontWeight: 800, color: INK }}>Find businesses</span>
            <span style={{ display: 'block', fontSize: 11.5, color: MUTED, marginTop: 1 }}>
              From OpenStreetMap. No account, no key, nothing to connect.
            </span>
          </span>
          <button onClick={onClose} aria-label="Close" style={{ background: 'none', border: 0, padding: 4, cursor: 'pointer', color: MUTED }}>
            <X size={17} />
          </button>
        </header>

        <div style={{ padding: 18, display: 'grid', gap: 13 }}>
          <div style={{ display: 'grid', gap: 10, gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))' }}>
            <div style={{ position: 'relative' }}>
              <Search size={15} style={{ position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)', color: MUTED }} />
              <input style={inp} value={trade} onChange={e => setTrade(e.target.value)}
                placeholder="What kind — plumber, dentist, cafe"
                onKeyDown={e => { if (e.key === 'Enter') void search(); }} />
            </div>
            <div style={{ position: 'relative' }}>
              <MapPin size={15} style={{ position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)', color: MUTED }} />
              <input style={inp} value={place} onChange={e => setPlace(e.target.value)}
                placeholder="Where — a town or city"
                onKeyDown={e => { if (e.key === 'Enter') void search(); }} />
            </div>
          </div>

          <button onClick={() => void search()} disabled={busy} style={{
            display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
            padding: '12px', background: busy ? '#c7c9d3' : INK, color: '#fff', border: 'none',
            borderRadius: 11, fontSize: 13.5, fontWeight: 700, cursor: busy ? 'default' : 'pointer', fontFamily: 'inherit',
          }}>
            {busy ? <Loader size={15} className="spin" /> : <Search size={15} />} Search
          </button>

          {/* Said before the search, not after an empty result. */}
          {!results && !error && (
            <p style={{ margin: 0, fontSize: 11.5, color: MUTED, lineHeight: 1.65 }}>
              Coverage is uneven and worth knowing about up front: town centres and high-street trades are
              mapped well, a sole trader working from home often is not. A phone number comes back far more
              often than an email — tick the ones you want and the next step reads their own website for a
              published address.
            </p>
          )}

          {error && (
            <div style={{ display: 'flex', gap: 8, alignItems: 'flex-start', fontSize: 12.5, color: '#92400e', background: '#fffbeb', border: '1px solid #fde68a', borderRadius: 10, padding: '10px 12px' }}>
              <AlertTriangle size={14} style={{ flexShrink: 0, marginTop: 1 }} />
              <span style={{ lineHeight: 1.6 }}>{error}</span>
            </div>
          )}

          {results && results.length === 0 && (
            <p style={{ margin: 0, fontSize: 13, color: MUTED, lineHeight: 1.65 }}>
              Nothing mapped for that. Try a broader word — "dentist" rather than "cosmetic dentistry" — or a
              larger town nearby. It means nobody has added them to the map, not that they do not exist.
            </p>
          )}

          {results && results.length > 0 && (<>
            <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
              <span style={{ fontSize: 12.5, fontWeight: 700, color: INK }}>
                {results.length} found{picked.size > 0 && ` · ${picked.size} ticked`}
              </span>
              {cached && <span style={{ fontSize: 11, color: MUTED }}>· from an earlier search</span>}
              <span style={{ flex: 1 }} />
              <button onClick={() => setPicked(new Set(results.map(r => r.ref)))} style={linkBtn}>Tick all</button>
              <button onClick={() => setPicked(new Set())} style={linkBtn}>Clear</button>
            </div>

            <div style={{ display: 'grid', gap: 7, maxHeight: 340, overflowY: 'auto' }}>
              {results.map(p => {
                const on = picked.has(p.ref);
                const c = found[p.website];
                const email = emailFor(p);
                return (
                  <label key={p.ref} style={{
                    display: 'flex', gap: 10, alignItems: 'flex-start', padding: '10px 12px',
                    border: `1px solid ${on ? ACCENT : LINE}`, borderRadius: 11, cursor: 'pointer',
                    background: on ? '#f7f6ff' : '#fff',
                  }}>
                    <input type="checkbox" checked={on} onChange={() => toggle(p.ref)}
                      style={{ marginTop: 3, accentColor: ACCENT, cursor: 'pointer', flexShrink: 0 }} />
                    <span style={{ minWidth: 0, flex: 1 }}>
                      <span style={{ display: 'block', fontSize: 13.5, fontWeight: 700, color: INK }}>{p.name}</span>
                      <span style={{ display: 'block', fontSize: 11.5, color: MUTED, marginTop: 2, lineHeight: 1.6 }}>
                        {p.category}{p.address ? ` · ${p.address}` : ''}
                      </span>
                      <span style={{ display: 'flex', gap: 12, flexWrap: 'wrap', marginTop: 4, fontSize: 11.5, color: '#475569' }}>
                        {p.phone && <span style={{ display: 'inline-flex', gap: 4, alignItems: 'center' }}><Phone size={10} /> {p.phone}</span>}
                        {p.website && <span style={{ display: 'inline-flex', gap: 4, alignItems: 'center', minWidth: 0 }}><Globe size={10} /> <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: 200 }}>{p.website.replace(/^https?:\/\//, '')}</span></span>}
                        {email && <span style={{ display: 'inline-flex', gap: 4, alignItems: 'center', color: '#0f7b3d', fontWeight: 700 }}><Mail size={10} /> {email}</span>}
                      </span>
                      {/* Three states, and the middle one is the one that matters:
                          "we could not check" reported as "this will bounce"
                          has people deleting good leads. */}
                      {c && !c.emails.length && (
                        <span style={{ display: 'block', fontSize: 11, color: MUTED, marginTop: 3 }}>
                          No address published on their site
                          {c.mx === false ? ' · and the domain does not accept mail at all' : c.mx === null ? ' · mail check could not run' : ''}
                        </span>
                      )}
                    </span>
                  </label>
                );
              })}
            </div>

            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              <button onClick={() => void enrich()} disabled={enriching || !chosen.length} style={{
                ...linkBtn, padding: '9px 14px', fontSize: 12.5, border: `1px solid ${LINE}`, borderRadius: 9,
                opacity: chosen.length ? 1 : 0.5,
              }}>
                {enriching ? <Loader size={12} className="spin" /> : <Mail size={12} />} Look up email addresses
                {chosen.length > 8 && <span style={{ color: MUTED, fontWeight: 500 }}> (first 8)</span>}
              </button>
            </div>

            {/* Not a disclaimer to click past. It is the rule, and it is the
                customer's judgement to make rather than ours to imply. */}
            <label style={{ display: 'flex', gap: 9, alignItems: 'flex-start', cursor: 'pointer', background: '#f4f7fb', borderRadius: 11, padding: '11px 12px' }}>
              <input type="checkbox" checked={confirmed} onChange={e => setConfirmed(e.target.checked)}
                style={{ marginTop: 2, accentColor: ACCENT, cursor: 'pointer', flexShrink: 0 }} />
              <span style={{ fontSize: 11.5, color: '#1e3a5f', lineHeight: 1.65 }}>
                These are businesses whose contact details they published, and what I am offering is relevant
                to what they do. I will not add them to a campaign that is not, and I will honour anyone who
                asks me to stop. (Clause 3 of the acceptable use policy.)
              </span>
            </label>

            <button onClick={importThem} disabled={!chosen.length || !confirmed} style={{
              display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
              padding: '12px', background: !chosen.length || !confirmed ? '#c7c9d3' : ACCENT, color: '#fff',
              border: 'none', borderRadius: 11, fontSize: 13.5, fontWeight: 700,
              cursor: !chosen.length || !confirmed ? 'default' : 'pointer', fontFamily: 'inherit',
            }}>
              <UserPlus size={15} /> Add {chosen.length || ''} to Contacts
            </button>

            {/* Required by the licence, and it travels with the data. */}
            {attribution && (
              <p style={{ margin: 0, fontSize: 10.5, color: '#9aa1ad', textAlign: 'center' }}>
                Business data {attribution}, used under the Open Database Licence.
              </p>
            )}
          </>)}
        </div>
      </div>
    </div>
  );
}

const linkBtn: React.CSSProperties = {
  display: 'inline-flex', alignItems: 'center', gap: 5, padding: '4px 8px',
  border: 0, borderRadius: 7, background: 'none', color: INK,
  fontSize: 11.5, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit',
};
