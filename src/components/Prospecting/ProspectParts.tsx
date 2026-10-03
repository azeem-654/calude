/**
 * The pieces of a prospect search — which map, the two boxes, the results,
 * and the import — shared by the Prospecting page and the "Find businesses"
 * dialog in Contacts. State lives in `useProspectSearch`; these only draw it.
 *
 * ── The bit that is not ours to decide ──
 *
 * Whether these people may be emailed. The confirmation before importing is
 * not a disclaimer to click past — it is clause 3 of the acceptable use policy,
 * and the honest answer is that a published business address and a relevant
 * offer is the lawful case, while "I found it, so I'll mail it" is not. It is
 * in `ImportPanel` and nowhere else, so the page and the dialog cannot word it
 * differently.
 */
import { useMemo, useState } from 'react';
import {
  AlertTriangle, ExternalLink, Globe, Loader, Mail, MapPin, Phone, Search, Star, UserPlus, Bookmark, X, Clock,
} from 'lucide-react';
import type { Prospect } from '../../services/prospects';
import type { SavedSearch } from '../../services/prospectImport';
import { loadLists } from '../../services/contactLists';
import type { ListChoice, ProspectSearch } from './useProspectSearch';
import './prospecting.css';

const INK = '#17191c';
const MUTED = '#6b7280';
const ACCENT = '#5b46e5';

export function Notice({ text, tone = 'warn' }: { text: string; tone?: 'warn' | 'info' }) {
  const warn = tone === 'warn';
  return (
    <div role={warn ? 'alert' : 'status'} style={{
      display: 'flex', gap: 8, alignItems: 'flex-start', fontSize: 12.5, lineHeight: 1.6, borderRadius: 10, padding: '10px 12px',
      color: warn ? '#92400e' : '#1e3a5f', background: warn ? '#fffbeb' : '#f4f7fb', border: `1px solid ${warn ? '#fde68a' : '#dbe4f0'}`,
    }}>
      <AlertTriangle size={14} style={{ flexShrink: 0, marginTop: 2 }} />
      <span style={{ minWidth: 0 }}>{text}</span>
    </div>
  );
}

/** Which map. A choice with its consequence attached: Google has more businesses, the directory may be kept. */
export function SourceTabs({ s }: { s: ProspectSearch }) {
  return (
    <div role="group" aria-label="Which map to search" style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
      {([
        { id: 'free' as const, label: 'Free directory' },
        { id: 'google' as const, label: 'Google Maps' },
      ]).map(t => {
        const on = s.source === t.id;
        return (
          <button key={t.id} type="button" onClick={() => s.setSource(t.id)} aria-pressed={on}
            style={{
              display: 'inline-flex', alignItems: 'center', gap: 6, padding: '6px 12px', borderRadius: 9,
              fontSize: 12.5, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit',
              border: `1px solid ${on ? INK : '#e6e9f0'}`, background: on ? INK : '#fff', color: on ? '#fff' : '#475569',
            }}>
            <MapPin size={12} /> {t.label}
          </button>
        );
      })}
    </div>
  );
}

export function SearchBoxes({ s }: { s: ProspectSearch }) {
  const enter = (e: React.KeyboardEvent) => { if (e.key === 'Enter') void s.search(); };
  return (
    <div style={{ display: 'grid', gap: 10, gridTemplateColumns: 'repeat(auto-fit, minmax(min(200px, 100%), 1fr))' }}>
      <div style={{ position: 'relative', minWidth: 0 }}>
        <Search size={15} style={{ position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)', color: MUTED }} />
        <input className="pp-input" value={s.trade} onChange={e => s.setTrade(e.target.value)} data-field="prospects.trade"
          aria-label="What kind of business" placeholder="What kind — plumber, dentist, cafe" onKeyDown={enter} />
      </div>
      <div style={{ position: 'relative', minWidth: 0 }}>
        <MapPin size={15} style={{ position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)', color: MUTED }} />
        <input className="pp-input" value={s.place} onChange={e => s.setPlace(e.target.value)} data-field="prospects.place"
          aria-label="Where" placeholder="Where — a town or city" onKeyDown={enter} />
      </div>
      <button type="button" onClick={() => void s.search()} disabled={s.busy} style={{
        display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, padding: '12px',
        background: s.busy ? '#c7c9d3' : INK, color: '#fff', border: 'none', borderRadius: 11,
        fontSize: 13.5, fontWeight: 700, cursor: s.busy ? 'default' : 'pointer', fontFamily: 'inherit',
      }}>
        {s.busy ? <Loader size={15} className="spin" /> : <Search size={15} />} Search
      </button>
    </div>
  );
}

/** Before a search: what this will and will not give, said up front. */
export function SearchHint({ s }: { s: ProspectSearch }) {
  return (
    <p style={{ margin: 0, fontSize: 11.5, color: MUTED, lineHeight: 1.65 }}>
      {s.source === 'google'
        ? 'Twenty businesses a search, with phone, website and Google rating. Google does not publish email addresses — tick the ones you want and the next step reads their own website for a published address.'
        : 'Up to sixty businesses a search, from OpenStreetMap. Coverage is worth knowing about up front: town centres and high-street businesses are mapped well, a sole trader working from home often is not — Google Maps is the other tab for those. Tick the ones you want and the next step reads their own website for a published address.'}
    </p>
  );
}

/** Refusals, the "nothing found" sentence, and the way round a key problem. */
export function SearchProblems({ s }: { s: ProspectSearch }) {
  return (<>
    {/* Said before the search, not after a refusal. */}
    {s.googleDown && !s.error && s.google && <Notice text={s.google.error} />}
    {s.error && <Notice text={s.error} />}
    {s.offerFree && (
      <button type="button" className="pp-btn" style={{ justifySelf: 'start' }} onClick={() => s.setSource('free')}>
        <MapPin size={12} /> Search the free directory instead — nothing to set up
      </button>
    )}
    {s.results && s.results.length === 0 && (
      <p style={{ margin: 0, fontSize: 13, color: MUTED, lineHeight: 1.65 }}>
        {s.searched?.source === 'google'
          ? 'Google found nothing for that. Try a broader word — "dentist" rather than "cosmetic dentistry" — or a larger town nearby.'
          : `Nothing mapped for that. Try a broader word — "dentist" rather than "cosmetic dentistry" — or a larger town nearby. It means nobody has added them to the map, not that they do not exist${s.google?.available ? '; the Google Maps tab may have them' : ''}.`}
      </p>
    )}
  </>);
}

const SOURCE_SHORT: Record<string, string> = { free: 'Free directory', google: 'Google Maps', osm: 'OpenStreetMap' };

/** Recent and saved searches, one press to run again. */
export function SearchHistory({ s, limit = 8 }: { s: ProspectSearch; limit?: number }) {
  const shown = [...s.history].sort((a, b) => Number(!!b.saved) - Number(!!a.saved)).slice(0, limit);
  if (!shown.length) return null;
  return (
    <div style={{ display: 'grid', gap: 7, minWidth: 0 }} aria-label="Recent searches">
      <span style={{ fontSize: 11, fontWeight: 800, letterSpacing: '0.05em', color: MUTED }}>RECENT AND SAVED SEARCHES</span>
      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', minWidth: 0 }}>
        {shown.map((h: SavedSearch) => (
          <span key={`${h.source}|${h.trade}|${h.place}`} className="pp-chip" data-saved={h.saved ? 'true' : undefined}>
            <button type="button" onClick={() => s.rerun(h)} title={`Search ${h.trade} in ${h.place} again`}>
              {h.saved ? <Bookmark size={11} style={{ verticalAlign: -1, marginRight: 4 }} fill={ACCENT} color={ACCENT} /> : <Clock size={11} style={{ verticalAlign: -1, marginRight: 4 }} />}
              <b>{h.trade}</b> in {h.place} <span style={{ color: '#9aa1ad' }}>· {SOURCE_SHORT[h.source] ?? h.source} · {h.count}</span>
            </button>
            <button type="button" className="pp-chip-icon" onClick={() => s.saveSearch(h)}
              aria-label={h.saved ? `Unsave ${h.trade} in ${h.place}` : `Save ${h.trade} in ${h.place}`} title={h.saved ? 'Unsave' : 'Save — kept when older searches make room'}>
              <Bookmark size={12} fill={h.saved ? ACCENT : 'none'} color={h.saved ? ACCENT : 'currentColor'} />
            </button>
            <button type="button" className="pp-chip-icon" onClick={() => s.forget(h)} aria-label={`Forget ${h.trade} in ${h.place}`} title="Forget">
              <X size={12} />
            </button>
          </span>
        ))}
      </div>
    </div>
  );
}

/**
 * The results: a table with room, cards without (see prospecting.css).
 * A row is ticked by pressing anywhere on it, the box included.
 */
export function ResultsTable({ s, maxHeight }: { s: ProspectSearch; maxHeight?: number }) {
  const results = s.results ?? [];
  const all = results.length > 0 && s.picked.size === results.length;
  const some = s.picked.size > 0 && !all;
  if (!results.length) return null;
  return (
    <div style={{ display: 'grid', gap: 10, minWidth: 0 }}>
      <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
        <span style={{ fontSize: 12.5, fontWeight: 700, color: INK }} aria-live="polite">
          {results.length} found{s.picked.size > 0 && ` · ${s.picked.size} ticked`}
        </span>
        {s.cached && <span style={{ fontSize: 11, color: MUTED }}>· from an earlier search</span>}
        <span style={{ flex: 1 }} />
        <button type="button" className="pp-link" onClick={() => s.pickAll(true)}>Tick all</button>
        <button type="button" className="pp-link" onClick={() => s.pickAll(false)}>Clear</button>
      </div>

      <div className="pp-results" style={{ maxHeight, overflowY: maxHeight ? 'auto' : undefined, border: '1px solid #e6e9f0', borderRadius: 12 }}>
        <table className="pp-table" aria-label="Businesses found">
          <thead>
            <tr>
              <th className="pp-check">
                <input type="checkbox" aria-label="Tick all" checked={all}
                  ref={el => { if (el) el.indeterminate = some; }}
                  onChange={e => s.pickAll(e.target.checked)} style={{ accentColor: ACCENT, cursor: 'pointer' }} />
              </th>
              <th>Business</th>
              <th>Phone</th>
              <th>Website</th>
              <th>Email</th>
            </tr>
          </thead>
          <tbody>
            {results.map(p => <Row key={p.ref} p={p} s={s} />)}
          </tbody>
        </table>
      </div>

      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
        <EnrichButton s={s} />
        {s.nextPage && (
          <button type="button" className="pp-btn" onClick={() => void s.loadMore()} disabled={s.more}>
            {s.more ? <Loader size={12} className="spin" /> : <Search size={12} />} More results
          </button>
        )}
      </div>
      {s.moreError && <Notice text={s.moreError} />}
    </div>
  );
}

function Row({ p, s }: { p: Prospect; s: ProspectSearch }) {
  const on = s.picked.has(p.ref);
  const c = s.found[p.website];
  const email = s.emailFor(p);
  return (
    <tr data-on={on} onClick={() => s.toggle(p.ref)}>
      <td className="pp-check" onClick={e => e.stopPropagation()}>
        <input type="checkbox" checked={on} onChange={() => s.toggle(p.ref)} aria-label={`Tick ${p.name}`}
          style={{ accentColor: ACCENT, cursor: 'pointer' }} />
      </td>
      <td>
        <span className="pp-name">{p.name}</span>
        {typeof p.rating === 'number' && (
          <span style={{ display: 'inline-flex', gap: 3, alignItems: 'center', fontSize: 11.5, color: '#92400e', fontWeight: 700, marginLeft: 8 }}>
            <Star size={10} fill="#f59e0b" color="#f59e0b" /> {p.rating.toFixed(1)}
            {typeof p.ratingCount === 'number' && <span style={{ color: MUTED, fontWeight: 500 }}>({p.ratingCount})</span>}
          </span>
        )}
        {p.temporarilyClosed && <span style={{ fontSize: 11, color: '#b45309', fontWeight: 700, marginLeft: 8 }}>Temporarily closed</span>}
        <span className="pp-sub">{p.category}{p.category && p.address ? ' · ' : ''}{p.address}</span>
        {p.mapsUrl && (
          <a href={p.mapsUrl} target="_blank" rel="noopener noreferrer" onClick={e => e.stopPropagation()}
            style={{ display: 'inline-flex', gap: 4, alignItems: 'center', color: '#475569', fontSize: 11.5, marginTop: 2 }}>
            <ExternalLink size={10} /> On Google Maps
          </a>
        )}
      </td>
      <td className={`pp-cell${p.phone ? '' : ' pp-empty'}`}>
        <span className="pp-label"><Phone size={10} /></span>
        {p.phone || <span className="pp-none">—</span>}
      </td>
      <td className={`pp-cell${p.website ? '' : ' pp-empty'}`}>
        <span className="pp-label"><Globe size={10} /></span>
        {p.website
          ? <a className="pp-site" href={p.website} target="_blank" rel="noopener noreferrer" onClick={e => e.stopPropagation()} style={{ color: '#475569' }}>{p.website.replace(/^https?:\/\//, '').replace(/\/$/, '')}</a>
          : <span className="pp-none">—</span>}
      </td>
      <td className="pp-cell">
        <span className="pp-label"><Mail size={10} /></span>
        {email
          ? <span className="pp-email">{email}</span>
          /* Three states, and the middle one is the one that matters: "we
             could not check" reported as "this will bounce" has people
             deleting good leads. */
          : c
            ? <span className="pp-none">None published{c.mx === false ? ' · the domain takes no mail' : c.mx === null ? ' · mail check could not run' : ''}</span>
            : <span className="pp-none">{p.website ? 'Not looked up yet' : 'No website to read'}</span>}
      </td>
    </tr>
  );
}

function EnrichButton({ s }: { s: ProspectSearch }) {
  const [said, setSaid] = useState<{ ok: boolean; message: string } | null>(null);
  const withSite = s.chosen.filter(p => p.website && !s.found[p.website]).length;
  return (
    <>
      <button type="button" className="pp-btn" disabled={s.enriching || !s.chosen.length}
        onClick={async () => setSaid(await s.enrich())}
        title={s.chosen.length ? 'Reads each ticked business\'s own website for the address it published' : 'Tick some businesses first'}>
        {s.enriching ? <Loader size={12} className="spin" /> : <Mail size={12} />} Look up email addresses
        {withSite > 8 && <span style={{ color: MUTED, fontWeight: 500 }}> (first 8)</span>}
      </button>
      {said && !s.enriching && (
        <span role="status" style={{ fontSize: 12, color: said.ok ? '#0f7b3d' : MUTED }}>{said.message}</span>
      )}
    </>
  );
}

/** Both maps ask to be named where their results are shown. */
export function Attribution({ s }: { s: ProspectSearch }) {
  if (!s.attribution || !s.results?.length) return null;
  return (
    <p style={{ margin: 0, fontSize: 10.5, color: '#9aa1ad', textAlign: 'center' }}>
      {s.answered === 'google'
        ? `Results from ${s.attribution}.`
        : `Business data: ${s.attribution}, used under the Open Database Licence.`}
    </p>
  );
}

/**
 * Where the ticked ones go, the rule, and the button.
 *
 * Only static lists can be chosen: a smart list picks its own members by rule,
 * so adding somebody to one by hand would be a promise it cannot keep.
 */
export function ImportPanel({ s, initial, suggested, onDone, listsVersion = 0 }: {
  s: ProspectSearch;
  initial: ListChoice['mode'];
  /** What a new list would be called — "Dentists — Leeds, Oct". */
  suggested: string;
  onDone: (r: ReturnType<ProspectSearch['importChosen']>) => void;
  /** Bumped by the caller after it changes the lists, so the choice re-reads them. */
  listsVersion?: number;
}) {
  const lists = useMemo(() => loadLists().filter(l => l.type === 'static'),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [listsVersion, s.results]);
  const [mode, setMode] = useState<ListChoice['mode']>(initial);
  const [existing, setExisting] = useState('');
  const [name, setName] = useState('');
  const [confirmed, setConfirmed] = useState(false);
  const [err, setErr] = useState<{ field: string; text: string } | null>(null);

  const listId = existing && lists.some(l => l.id === existing) ? existing : lists[0]?.id ?? '';
  const newName = name || suggested;
  const n = s.chosen.length;
  const target = mode === 'existing' ? lists.find(l => l.id === listId)?.name : null;
  const label = !n ? 'Add to Contacts'
    : mode === 'none' ? `Add ${n} to Contacts`
      : mode === 'new' ? `Add ${n} to a new list`
        : `Add ${n} to “${target ?? 'the list'}”`;
  const blocked = !n || !confirmed || (mode === 'existing' && !listId);

  const go = () => {
    setErr(null);
    const choice: ListChoice = mode === 'none' ? { mode } : mode === 'new' ? { mode, name: newName } : { mode, id: listId };
    const r = s.importChosen(choice);
    if ('error' in r) {
      setErr({ field: mode === 'new' ? 'prospects.listName' : 'prospects.list', text: r.error });
      return;
    }
    setName('');
    /* Asked again next time: the rule is a judgement about these businesses
       and this offer, not a setting that stays ticked. */
    setConfirmed(false);
    onDone(r);
  };

  return (
    <div style={{ display: 'grid', gap: 10, minWidth: 0 }}>
      <div role="radiogroup" aria-label="Add them to a contact list" style={{ display: 'grid', gap: 7, minWidth: 0 }}>
        <span style={{ fontSize: 11, fontWeight: 800, letterSpacing: '0.05em', color: MUTED }}>ADD THEM TO A CONTACT LIST</span>
        <label className="pp-choice" data-on={mode === 'new'}>
          <input type="radio" name="pp-list" checked={mode === 'new'} onChange={() => setMode('new')} />
          <span style={{ minWidth: 0, flex: 1, display: 'grid', gap: 6 }}>
            <span style={{ fontSize: 13, fontWeight: 700, color: INK }}>A new list</span>
            {mode === 'new' && (
              <input className="pp-input pp-plain" value={newName} onChange={e => setName(e.target.value)} data-field="prospects.listName"
                aria-label="Name of the new list" maxLength={80} placeholder="Dentists — Leeds, Oct" onClick={e => e.stopPropagation()} />
            )}
          </span>
        </label>
        <label className="pp-choice" data-on={mode === 'existing'} style={{ opacity: lists.length ? 1 : 0.6 }}>
          <input type="radio" name="pp-list" checked={mode === 'existing'} disabled={!lists.length} onChange={() => setMode('existing')} />
          <span style={{ minWidth: 0, flex: 1, display: 'grid', gap: 6 }}>
            <span style={{ fontSize: 13, fontWeight: 700, color: INK }}>A list you already have</span>
            {!lists.length && <span style={{ fontSize: 11.5, color: MUTED }}>You have no hand-picked lists yet.</span>}
            {mode === 'existing' && lists.length > 0 && (
              <select className="pp-input pp-plain" value={listId} onChange={e => setExisting(e.target.value)} data-field="prospects.list"
                aria-label="Which list" onClick={e => e.stopPropagation()}>
                {lists.map(l => <option key={l.id} value={l.id}>{l.name} ({l.memberIds.length})</option>)}
              </select>
            )}
          </span>
        </label>
        <label className="pp-choice" data-on={mode === 'none'}>
          <input type="radio" name="pp-list" checked={mode === 'none'} onChange={() => setMode('none')} />
          <span style={{ fontSize: 13, fontWeight: 700, color: INK }}>No list — just Contacts</span>
        </label>
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

      {err && <Notice text={err.text} />}

      <button type="button" onClick={go} disabled={blocked} title={!n ? 'Tick the businesses to add' : !confirmed ? 'Confirm the rule above first' : undefined} style={{
        display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, padding: '12px',
        background: blocked ? '#c7c9d3' : ACCENT, color: '#fff', border: 'none', borderRadius: 11,
        fontSize: 13.5, fontWeight: 700, cursor: blocked ? 'default' : 'pointer', fontFamily: 'inherit', minWidth: 0,
      }}>
        <UserPlus size={15} style={{ flexShrink: 0 }} /> <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{label}</span>
      </button>
      <p style={{ margin: 0, fontSize: 11, color: MUTED, lineHeight: 1.55 }}>
        They are added as prospects. Anybody already in Contacts — the same email, or the same name and phone
        or website — is put on the list rather than added twice.
      </p>
    </div>
  );
}
