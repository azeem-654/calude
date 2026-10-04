/**
 * The New Project wizard's prospecting questions — who the daily finder looks
 * for, where, and a live look at who it would add today.
 *
 * ── Why a live sample in a wizard ──
 *
 * "It will find real estate agents in Virginia every day" is a promise; twelve
 * named agents in Richmond, found while the customer watches, is evidence. The
 * sample is one real search on the business directories (`searchProspects`,
 * `fresh`), the same the finder will run — so the blueprint is approved on what
 * it will actually find, including when that is nothing.
 *
 * Values are stored the way `outreachPart` reads them: trades comma-separated,
 * places "; "-separated (a town's name has a comma in it: "Richmond, Virginia").
 */
import { useEffect, useState } from 'react';
import { Globe, Loader, MapPin, Plus, Search, Sparkles, X } from 'lucide-react';
import { relatedTrades, splitTradePlace } from '../../../services/aiProspecting';
import { expandPlace } from '../../../services/finders';
import { searchProspects, type Prospect } from '../../../services/prospects';

export const tradesOf = (v: string) => v.split(',').map(x => x.trim()).filter(Boolean);
export const placesOf = (v: string) => v.split(';').map(x => x.trim()).filter(Boolean);

function ChipBox({ values, onChange, placeholder, field, icon }: {
  values: string[]; onChange: (v: string[]) => void; placeholder: string; field: string; icon: React.ReactNode;
}) {
  const [draft, setDraft] = useState('');
  const add = () => {
    const t = draft.trim();
    if (!t) return;
    onChange([...new Set([...values, t])]);
    setDraft('');
  };
  return (
    <div className="np-chips">
      {values.map(v => (
        <span key={v} className="np-chip">
          {v}
          <button type="button" aria-label={`Remove ${v}`} onClick={() => onChange(values.filter(x => x !== v))}><X size={11} /></button>
        </span>
      ))}
      <span className="np-chip-input">
        {icon}
        <input value={draft} onChange={e => setDraft(e.target.value)} placeholder={placeholder} aria-label={placeholder} data-field={field}
          onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); add(); } }} onBlur={add} />
      </span>
    </div>
  );
}

export function TradesField({ value, onChange, onPlace }: {
  value: string; onChange: (v: string) => void;
  /** A place typed into the trade box ("… in Virginia") goes to the place box rather than being searched as part of the trade. */
  onPlace?: (place: string) => void;
}) {
  const trades = tradesOf(value);
  const put = (v: string[]) => {
    const split = v.map(splitTradePlace);
    const place = split.find(x => x.place)?.place;
    onChange([...new Set(split.map(x => x.trade).filter(Boolean))].join(', '));
    if (place && onPlace) onPlace(place);
  };
  /* An answer that arrived with a place in it (from the request, or an older draft) is put right once, on sight. */
  useEffect(() => {
    if (onPlace && trades.some(t => splitTradePlace(t).place)) put(trades);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value]);
  const ideas = [...new Set(trades.flatMap(relatedTrades))].filter(x => !trades.includes(x)).slice(0, 6);
  return (
    <div style={{ display: 'grid', gap: 8 }}>
      <ChipBox values={trades} onChange={put} placeholder="Add a kind of business" field="project.prospectTrades" icon={<Search size={13} />} />
      {ideas.length > 0 && (
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, alignItems: 'center' }}>
          <span style={{ fontSize: 12, color: '#6b7280' }}>Widen it:</span>
          {ideas.map(t => (
            <button key={t} type="button" className="np-opt np-opt-sm" onClick={() => put([...trades, t])}><Plus size={11} /> {t}</button>
          ))}
        </div>
      )}
    </div>
  );
}

export function PlacesField({ value, onChange, trades }: { value: string; onChange: (v: string) => void; trades: string[] }) {
  const places = placesOf(value);
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState('');
  /* One region typed or extracted ("Virginia") is offered as its towns straight away. */
  const region = places.length === 1 && !places[0].includes(',') ? places[0] : '';
  const expand = async (place: string) => {
    setBusy(true); setNote('');
    const r = await expandPlace(place);
    setBusy(false);
    if (!r.success) { setNote(r.error ?? 'Could not look that up.'); return; }
    if (r.places.length > 1) {
      onChange([...new Set([...places.filter(p => p !== place), ...r.places])].join('; '));
      setNote(`${r.places.length} towns in ${place}, largest first. Remove any you do not want; it works through them one by one.`);
    } else {
      setNote(r.note || `"${place}" is searched as one place.`);
    }
  };
  return (
    <div style={{ display: 'grid', gap: 8 }}>
      {/* finder.places: splitting a region asks the finder route, which names its own box. */}
      <div data-field="finder.places">
        <ChipBox values={places} onChange={v => onChange(v.join('; '))} placeholder="Add a town — Richmond, Virginia" field="project.prospectPlaces" icon={<MapPin size={13} />} />
      </div>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, alignItems: 'center' }}>
        {region && (
          <button type="button" className="np-opt np-opt-sm" onClick={() => void expand(region)} disabled={busy}>
            {busy ? <Loader size={12} className="spin" /> : <Globe size={12} />} Split {region} into its towns
          </button>
        )}
        {note && <span style={{ fontSize: 12, color: '#6b7280' }}>{note}</span>}
      </div>
      {trades.length > 0 && places.length > 0 && <LiveSample trade={trades[0]} place={places[0]} />}
    </div>
  );
}

/** One real search, now: who the finder would start with. */
function LiveSample({ trade, place }: { trade: string; place: string }) {
  const [state, setState] = useState<{ busy: boolean; rows: Prospect[]; total: number; at: string; error: string; key: string; note: string }>({ busy: false, rows: [], total: 0, at: '', error: '', key: '', note: '' });
  const key = `${trade}|${place}`;
  const run = async () => {
    setState(s => ({ ...s, busy: true, error: '', key }));
    let r = await searchProspects({ source: 'free', trade, place, fresh: true });
    /* The free directory is volunteer-run and is sometimes busy for a moment; one quiet retry before saying so. */
    if (r.error && !r.code) {
      await new Promise(res => window.setTimeout(res, 2500));
      r = await searchProspects({ source: 'free', trade, place, fresh: true });
    }
    setState({ busy: false, rows: r.prospects.slice(0, 12), total: r.prospects.length, at: r.fetchedAt, error: r.error, key, note: r.note ?? '' });
  };
  /* Once per trade and place: a sample costs a search, so it is not re-run on every keystroke. */
  useEffect(() => {
    if (state.key === key || state.busy) return;
    const t = window.setTimeout(() => void run(), 600);
    return () => window.clearTimeout(t);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);
  const time = state.at ? new Date(state.at).toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' }) : '';
  return (
    <section className="np-sample" aria-label="Who it would find today">
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
        <Sparkles size={14} color="#5b46e5" />
        <b style={{ fontSize: 13 }}>Who it would find today — {trade} in {place}</b>
        <span style={{ flex: 1 }} />
        <button type="button" className="np-opt np-opt-sm" onClick={() => void run()} disabled={state.busy}>
          {state.busy ? <Loader size={12} className="spin" /> : <Search size={12} />} {state.rows.length ? 'Search again' : 'Search now'}
        </button>
      </div>
      {state.busy && <span style={{ fontSize: 12.5, color: '#6b7280' }}>Searching live…</span>}
      {/* A sample that could not run is not the project failing: the finder
          searches on its own schedule and retries a source that is down, so
          this says that rather than showing a red error mid-setup. */}
      {!state.busy && state.error && (
        <span style={{ fontSize: 12.5, color: '#92400e', lineHeight: 1.55 }}>
          The business directory did not answer just now, so there is no sample to show. That does not hold the project up —
          once it is published it searches by itself every few minutes, tries again when a source is busy, and adds what it finds.
          <span style={{ display: 'block', color: '#6b7280', fontSize: 11.5, marginTop: 2 }}>{state.error}</span>
        </span>
      )}
      {!state.busy && !state.error && state.key === key && (
        state.rows.length ? (
          <>
            {state.note && <span style={{ fontSize: 12, color: '#4c39d1' }}>{state.note}</span>}
            <span style={{ fontSize: 12, color: '#6b7280' }}>
              {state.total} found live at {time} — the first {state.rows.length} below. Every day it reads their websites for the address each publishes,
              checks it, and adds the new ones to this project.
            </span>
            <ul className="np-sample-list">
              {state.rows.map(p => (
                <li key={p.ref}><b>{p.name}</b><span>{[p.category, p.address].filter(Boolean).join(' · ')}</span>{p.website ? <em>has a website</em> : null}</li>
              ))}
            </ul>
          </>
        ) : (
          <span style={{ fontSize: 12.5, color: '#92400e' }}>
            Nothing listed for that just now. Try a broader kind of business, or split the place into its towns — the finder can only add what the directories list.
          </span>
        )
      )}
    </section>
  );
}

/**
 * The same two boxes and the live sample on the blueprint. A sentence that
 * already said who and where ("real estate agents in Virginia") answers both
 * questions, so neither is asked — and without this the customer would approve
 * a daily finder having never seen who it finds. Changing a box changes the
 * answer, and the blueprint is rebuilt from it like any other edit.
 */
export function FinderReview({ trades, places, onAnswer }: {
  trades: string; places: string; onAnswer: (id: 'prospectTrades' | 'prospectPlaces', v: string | null) => void;
}) {
  return (
    <section className="np-finder" aria-label="Who it finds every day">
      <b style={{ fontSize: 14 }}>Who it finds every day</b>
      <span style={{ fontSize: 12.5, color: '#6b7280' }}>Change either box and the blueprint follows.</span>
      <TradesField value={trades} onChange={v => onAnswer('prospectTrades', v || null)}
        onPlace={p => { if (!placesOf(places).length) onAnswer('prospectPlaces', p); }} />
      <PlacesField value={places} trades={tradesOf(trades)} onChange={v => onAnswer('prospectPlaces', v || null)} />
    </section>
  );
}
