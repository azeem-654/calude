/**
 * Finding businesses to approach — on Google Maps, or on OpenStreetMap.
 *
 * ── Why Google, and why it is the owner's key ──
 *
 * This shipped on OpenStreetMap alone and was held back from the live app,
 * because how useful it was depended on how well the customer's own town had
 * been mapped — thin for a sole trader in a suburb. Google Maps has them. The
 * install owner provides one key for every customer (Settings → Platform
 * services); nobody here is asked for one. The server guards it: a budget per
 * workspace, nothing after a trial ends, and each refusal says which.
 *
 * OpenStreetMap stays as the second choice. It costs nobody anything and its
 * results may be kept, which is worth having one tap away — and it is what
 * this screen offers when Google cannot be searched right now.
 *
 * ── Saying what it is not good at ──
 *
 * Neither map publishes email addresses. That is said before the search, and
 * the next step reads each ticked business's own website for the address it
 * chose to publish — never a guessed `firstname@`.
 *
 * ── The bit that is not ours to decide ──
 *
 * Whether these people may be emailed. The confirmation before importing is
 * not a disclaimer to click past — it is clause 3 of the acceptable use policy,
 * and the honest answer is that a published business address and a relevant
 * offer is the lawful case, while "I found it, so I'll mail it" is not.
 */
import { useEffect, useState } from 'react';
import {
  AlertTriangle, ExternalLink, Globe, Loader, Mail, MapPin, Phone, Search, Star, UserPlus, X,
} from 'lucide-react';
import { useApp } from '../../context/AppContext';
import {
  googleAvailability, lookupContacts, searchProspects,
  type Contactable, type GoogleAvailability, type Prospect, type ProspectSource,
} from '../../services/prospects';
import type { Contact } from '../../types';

const INK = '#17191c';
const MUTED = '#6b7280';
const LINE = '#e6e9f0';
const ACCENT = '#5b46e5';

export default function FindProspects({ onClose }: { onClose: () => void }) {
  const { bulkImportContacts, addNotification } = useApp();
  const [source, setSource] = useState<ProspectSource>('google');
  const [google, setGoogle] = useState<GoogleAvailability | null>(null);
  const [trade, setTrade] = useState('');
  const [place, setPlace] = useState('');
  const [busy, setBusy] = useState(false);
  const [more, setMore] = useState(false);
  const [enriching, setEnriching] = useState(false);
  const [error, setError] = useState('');
  const [errorCode, setErrorCode] = useState('');
  const [results, setResults] = useState<Prospect[] | null>(null);
  const [attribution, setAttribution] = useState('');
  const [cached, setCached] = useState(false);
  const [nextPage, setNextPage] = useState('');
  /* What the shown results were searched for, so "More" and the source stamp
     on an import describe the search that produced them, not the boxes as
     they are now. */
  const [searched, setSearched] = useState<{ source: ProspectSource; trade: string; place: string } | null>(null);
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const [found, setFound] = useState<Record<string, Contactable>>({});
  const [confirmed, setConfirmed] = useState(false);

  /* Asked before anybody types, so "the owner has not set the key" is said up
     front rather than after a search — and OpenStreetMap is offered at once. */
  useEffect(() => {
    let live = true;
    void googleAvailability().then(g => { if (live) setGoogle(g); });
    return () => { live = false; };
  }, []);

  const search = async () => {
    setBusy(true); setError(''); setErrorCode(''); setResults(null); setPicked(new Set()); setFound({}); setNextPage('');
    const q = { source, trade: trade.trim(), place: place.trim() };
    const r = await searchProspects(q);
    setBusy(false);
    if (r.error) { setError(r.error); setErrorCode(r.code); return; }
    setResults(r.prospects);
    setAttribution(r.attribution);
    setCached(r.cached);
    setNextPage(r.nextPageToken);
    setSearched(q);
  };

  /* Google gives twenty at a time; each further page is another search on the
     same budget, so it is asked for, never fetched ahead. */
  const loadMore = async () => {
    if (!searched || !nextPage) return;
    setMore(true);
    const r = await searchProspects({ ...searched, pageToken: nextPage });
    setMore(false);
    if (r.error) { addNotification(r.error, 'error'); setNextPage(''); return; }
    setResults(prev => {
      const have = new Set((prev ?? []).map(p => p.ref));
      return [...(prev ?? []), ...r.prospects.filter(p => !have.has(p.ref))];
    });
    setNextPage(r.nextPageToken);
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
    const from = searched?.source === 'google' ? 'Google Maps' : 'OpenStreetMap';
    const what = searched ? `${searched.trade} in ${searched.place}` : '';
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
      source: `${from} · ${what}`,
      createdAt: now,
      lastActivity: now,
      value: 0,
      company: p.name,
      website: p.website,
      address: p.address,
      /* The place id is the part of a Google answer that may be kept, and the
         one that finds this business on Google again. */
      ...(p.placeId ? { customFields: { googlePlaceId: p.placeId } } : {}),
    }));
    bulkImportContacts(rows);
    addNotification(`${rows.length} added to Contacts as prospects.`, 'success');
    onClose();
  };

  const inp: React.CSSProperties = {
    width: '100%', padding: '11px 12px 11px 36px', border: `1px solid ${LINE}`, borderRadius: 11,
    fontSize: 14, outline: 'none', boxSizing: 'border-box', fontFamily: 'inherit', background: '#fff',
  };

  const googleDown = source === 'google' && google && !google.available;
  /* A refusal that is about the key, the trial or the budget is not fixed by
     typing differently — the other map is the useful next step. */
  const offerOsm = source === 'google' && (googleDown || /^(no_key|trial_ended|places_budget|bad_key|api_disabled|key_restricted|billing|quota)$/.test(errorCode));

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
              {/* "Included" directly above "needs the Google Maps key" read as a
                  contradiction; until the owner's key is set it is not. */}
              {source === 'google' && googleDown
                ? 'From Google Maps — not switched on for this app yet.'
                : source === 'google'
                ? 'From Google Maps. Included — nothing for you to connect.'
                : 'From OpenStreetMap. No account, no key, and the results are yours to keep.'}
            </span>
          </span>
          <button onClick={onClose} aria-label="Close" style={{ background: 'none', border: 0, padding: 4, cursor: 'pointer', color: MUTED }}>
            <X size={17} />
          </button>
        </header>

        <div style={{ padding: 18, display: 'grid', gap: 13 }}>
          {/* Which map. A choice with its consequence attached, because the two
              answer differently: Google has more businesses, OSM may be kept. */}
          <div role="group" aria-label="Which map to search" style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
            {([
              { id: 'google' as const, label: 'Google Maps' },
              { id: 'osm' as const, label: 'OpenStreetMap' },
            ]).map(s => {
              const on = source === s.id;
              return (
                <button key={s.id} onClick={() => { setSource(s.id); setError(''); setErrorCode(''); setResults(null); setNextPage(''); }}
                  aria-pressed={on}
                  style={{
                    display: 'inline-flex', alignItems: 'center', gap: 6, padding: '6px 12px', borderRadius: 9,
                    fontSize: 12.5, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit',
                    border: `1px solid ${on ? INK : LINE}`, background: on ? INK : '#fff', color: on ? '#fff' : '#475569',
                  }}>
                  <MapPin size={12} /> {s.label}
                </button>
              );
            })}
          </div>

          <div style={{ display: 'grid', gap: 10, gridTemplateColumns: 'repeat(auto-fit, minmax(min(200px, 100%), 1fr))' }}>
            <div style={{ position: 'relative' }}>
              <Search size={15} style={{ position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)', color: MUTED }} />
              <input style={inp} value={trade} onChange={e => setTrade(e.target.value)} data-field="prospects.trade"
                aria-label="What kind of business"
                placeholder="What kind — plumber, dentist, cafe"
                onKeyDown={e => { if (e.key === 'Enter') void search(); }} />
            </div>
            <div style={{ position: 'relative' }}>
              <MapPin size={15} style={{ position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)', color: MUTED }} />
              <input style={inp} value={place} onChange={e => setPlace(e.target.value)} data-field="prospects.place"
                aria-label="Where"
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

          {/* Said before the search, not after a refusal. */}
          {googleDown && !error && (
            <Notice text={google!.error} />
          )}

          {!results && !error && !googleDown && (
            <p style={{ margin: 0, fontSize: 11.5, color: MUTED, lineHeight: 1.65 }}>
              {source === 'google'
                ? 'Twenty businesses a search, with phone, website and Google rating. Google does not publish email addresses — tick the ones you want and the next step reads their own website for a published address.'
                : 'Coverage is uneven and worth knowing about up front: town centres and high-street trades are mapped well, a sole trader working from home often is not. A phone number comes back far more often than an email — tick the ones you want and the next step reads their own website for a published address.'}
            </p>
          )}

          {error && <Notice text={error} />}

          {offerOsm && (
            <button onClick={() => { setSource('osm'); setError(''); setErrorCode(''); setResults(null); }} style={{
              ...linkBtn, justifySelf: 'start', padding: '8px 12px', border: `1px solid ${LINE}`, borderRadius: 9, fontSize: 12.5,
            }}>
              <MapPin size={12} /> Search OpenStreetMap instead — free, and nothing to set up
            </button>
          )}

          {results && results.length === 0 && (
            <p style={{ margin: 0, fontSize: 13, color: MUTED, lineHeight: 1.65 }}>
              {searched?.source === 'google'
                ? 'Google found nothing for that. Try a broader word — "dentist" rather than "cosmetic dentistry" — or a larger town nearby.'
                : 'Nothing mapped for that. Try a broader word — "dentist" rather than "cosmetic dentistry" — or a larger town nearby. It means nobody has added them to the map, not that they do not exist.'}
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
                    background: on ? '#f7f6ff' : '#fff', minWidth: 0,
                  }}>
                    <input type="checkbox" checked={on} onChange={() => toggle(p.ref)}
                      style={{ marginTop: 3, accentColor: ACCENT, cursor: 'pointer', flexShrink: 0 }} />
                    <span style={{ minWidth: 0, flex: 1 }}>
                      <span style={{ display: 'flex', gap: 8, alignItems: 'baseline', flexWrap: 'wrap' }}>
                        <span style={{ fontSize: 13.5, fontWeight: 700, color: INK, overflowWrap: 'anywhere' }}>{p.name}</span>
                        {typeof p.rating === 'number' && (
                          <span style={{ display: 'inline-flex', gap: 3, alignItems: 'center', fontSize: 11.5, color: '#92400e', fontWeight: 700 }}>
                            <Star size={10} fill="#f59e0b" color="#f59e0b" /> {p.rating.toFixed(1)}
                            {typeof p.ratingCount === 'number' && <span style={{ color: MUTED, fontWeight: 500 }}>({p.ratingCount})</span>}
                          </span>
                        )}
                        {p.temporarilyClosed && <span style={{ fontSize: 11, color: '#b45309', fontWeight: 700 }}>Temporarily closed</span>}
                      </span>
                      <span style={{ display: 'block', fontSize: 11.5, color: MUTED, marginTop: 2, lineHeight: 1.6, overflowWrap: 'anywhere' }}>
                        {p.category}{p.category && p.address ? ' · ' : ''}{p.address}
                      </span>
                      <span style={{ display: 'flex', gap: 12, flexWrap: 'wrap', marginTop: 4, fontSize: 11.5, color: '#475569' }}>
                        {p.phone && <span style={{ display: 'inline-flex', gap: 4, alignItems: 'center' }}><Phone size={10} /> {p.phone}</span>}
                        {p.website && <span style={{ display: 'inline-flex', gap: 4, alignItems: 'center', minWidth: 0 }}><Globe size={10} /> <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: 200 }}>{p.website.replace(/^https?:\/\//, '')}</span></span>}
                        {email && <span style={{ display: 'inline-flex', gap: 4, alignItems: 'center', color: '#0f7b3d', fontWeight: 700, overflowWrap: 'anywhere' }}><Mail size={10} /> {email}</span>}
                        {p.mapsUrl && (
                          <a href={p.mapsUrl} target="_blank" rel="noopener noreferrer" onClick={e => e.stopPropagation()}
                            style={{ display: 'inline-flex', gap: 4, alignItems: 'center', color: '#475569' }}>
                            <ExternalLink size={10} /> On Google Maps
                          </a>
                        )}
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
              {nextPage && (
                <button onClick={() => void loadMore()} disabled={more} style={{
                  ...linkBtn, padding: '9px 14px', fontSize: 12.5, border: `1px solid ${LINE}`, borderRadius: 9,
                }}>
                  {more ? <Loader size={12} className="spin" /> : <Search size={12} />} More results
                </button>
              )}
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

            {/* Both maps ask to be named where their results are shown. */}
            {attribution && (
              <p style={{ margin: 0, fontSize: 10.5, color: '#9aa1ad', textAlign: 'center' }}>
                {searched?.source === 'google'
                  ? `Results from ${attribution}.`
                  : `Business data ${attribution}, used under the Open Database Licence.`}
              </p>
            )}
          </>)}
        </div>
      </div>
    </div>
  );
}

function Notice({ text }: { text: string }) {
  return (
    <div role="alert" style={{ display: 'flex', gap: 8, alignItems: 'flex-start', fontSize: 12.5, color: '#92400e', background: '#fffbeb', border: '1px solid #fde68a', borderRadius: 10, padding: '10px 12px' }}>
      <AlertTriangle size={14} style={{ flexShrink: 0, marginTop: 1 }} />
      <span style={{ lineHeight: 1.6 }}>{text}</span>
    </div>
  );
}

const linkBtn: React.CSSProperties = {
  display: 'inline-flex', alignItems: 'center', gap: 5, padding: '4px 8px',
  border: 0, borderRadius: 7, background: 'none', color: INK,
  fontSize: 11.5, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit',
};
