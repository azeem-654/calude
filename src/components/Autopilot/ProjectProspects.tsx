/**
 * A project's daily prospect finder (worker/src/prospectFinderTick.ts), in the
 * pieces the Prospects tab (ProjectLeads.tsx) lays out:
 *
 *   useFinderOverview  the finder, its rotation, 30 days of counts and the log
 *   FinderCard         the finder as one lead source: what it searches, its
 *                      state in plain words, and Pause / Resume / Change
 *   FinderSetup        kinds of business, places, how many a day, the list
 *   DailyChart         added per day, the last 30 days
 *   RotationPanel      which searches are done, next and waiting
 *
 * ── What it says, and what it will not ──
 *
 * A place has a finite number of listed businesses; "more every day" lasts
 * until the rotation is used up. When every search is done the card says so
 * and asks for more places or kinds of business — it does not offer Resume
 * there, because resuming the same searches finds nobody new and would look
 * like the button did something.
 *
 * Kinds of business, places (a state becomes its towns — `expandPlace`), how
 * many a day, which source, and the list they go on. The same finder is set up
 * from the New Project wizard; both go through `saveFinder`, so there is one
 * place that decides what a finder is. A search connected from AI Prospecting
 * is a *source* instead (ProspectSources.tsx) — the same engine, with a
 * schedule, a verified target and its own checks.
 *
 * Authored light like the rest of Autopilot (theme.ts): the app's dark mode
 * inverts it with everything else.
 */
import { useCallback, useEffect, useMemo, useState } from 'react';
import { Globe, Loader, MapPin, Pause, Play, Plus, Search, Target, X, Zap } from 'lucide-react';
import { T, primaryBtn } from './theme';
import type { Project } from '../../services/projects';
import {
  expandPlace, finderOverview, runFinderStep, saveFinder, setFinderStatus, type FinderInfo, type FinderOverview,
} from '../../services/finders';
import { createList, loadLists } from '../../services/contactLists';
import { flushNow } from '../../services/serverData';
import { currentActor } from '../../services/contactPermissions';

const btn: React.CSSProperties = {
  display: 'inline-flex', alignItems: 'center', gap: 6, padding: '7px 12px', borderRadius: 9, border: `1px solid ${T.line}`,
  background: T.panel, color: T.ink, font: 'inherit', fontSize: 12.5, fontWeight: 650, cursor: 'pointer',
};
const card: React.CSSProperties = { background: T.panel, border: `1px solid ${T.line}`, borderRadius: 14, padding: 14, display: 'grid', gap: 10, minWidth: 0 };
const label: React.CSSProperties = { fontSize: 11, fontWeight: 700, letterSpacing: '0.05em', color: T.muted, textTransform: 'uppercase' };

/** The last 30 days, one bar a day, with the days that added nobody shown as nothing rather than skipped. */
export function DailyChart({ days }: { days: { day: string; added: number }[] }) {
  const series = useMemo(() => {
    const by = new Map(days.map(d => [d.day, d.added]));
    const out: { day: string; n: number }[] = [];
    for (let i = 29; i >= 0; i--) {
      const d = new Date(Date.now() - i * 86_400_000).toISOString().slice(0, 10);
      out.push({ day: d, n: by.get(d) ?? 0 });
    }
    return out;
  }, [days]);
  const max = Math.max(1, ...series.map(s => s.n));
  const total = series.reduce((a, s) => a + s.n, 0);
  return (
    <div style={{ display: 'grid', gap: 6 }}>
      <svg viewBox="0 0 300 90" role="img" aria-label={`${total} prospects added in the last 30 days`} style={{ width: '100%', height: 110 }}>
        {series.map((s, i) => {
          const h = Math.round((s.n / max) * 70);
          return (
            <g key={s.day}>
              <title>{`${s.day}: ${s.n} added`}</title>
              <rect x={i * 10 + 1} y={80 - h} width={8} height={Math.max(h, s.n ? 2 : 1)} rx={2} fill={s.n ? T.accent : T.lineSoft} />
            </g>
          );
        })}
        <line x1="0" y1="80.5" x2="300" y2="80.5" stroke={T.line} />
      </svg>
      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, color: T.faint }}>
        <span>30 days ago</span><span>{total} added</span><span>today</span>
      </div>
    </div>
  );
}

/** Kinds of business, as removable chips with a box to add one. */
function Chips({ values, onChange, placeholder, field, icon }: {
  values: string[]; onChange: (v: string[]) => void; placeholder: string; field: string; icon: React.ReactNode;
}) {
  const [draft, setDraft] = useState('');
  const add = () => {
    const parts = draft.split(/[,;\n]/).map(x => x.trim()).filter(Boolean);
    if (!parts.length) return;
    onChange([...new Set([...values, ...parts])]);
    setDraft('');
  };
  return (
    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, alignItems: 'center', padding: 8, border: `1px solid ${T.line}`, borderRadius: 10, background: T.panel }}>
      {values.map(v => (
        <span key={v} style={{ display: 'inline-flex', alignItems: 'center', gap: 4, fontSize: 12, fontWeight: 600, padding: '3px 6px 3px 9px', borderRadius: 999, background: T.accentSoft, color: T.accent }}>
          {v}
          <button type="button" aria-label={`Remove ${v}`} onClick={() => onChange(values.filter(x => x !== v))}
            style={{ border: 0, background: 'none', color: 'inherit', cursor: 'pointer', display: 'inline-flex', padding: 1 }}><X size={11} /></button>
        </span>
      ))}
      <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, flex: '1 1 160px', color: T.faint }}>
        {icon}
        <input value={draft} onChange={e => setDraft(e.target.value)} data-field={field} placeholder={placeholder} aria-label={placeholder}
          onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); add(); } }} onBlur={add}
          style={{ flex: 1, minWidth: 0, border: 0, outline: 'none', font: 'inherit', fontSize: 13, color: T.ink, background: 'transparent' }} />
      </span>
    </div>
  );
}

export function FinderSetup({ project, initial, onSaved, onCancel }: {
  project: Project;
  initial: { trades: string[]; places: string[]; perDay: number; source: 'free' | 'register'; listId: string } | null;
  onSaved: () => void; onCancel?: () => void;
}) {
  const audience = (project.brief as { audience?: { listId?: string; listName?: string } } | null | undefined)?.audience;
  const [trades, setTrades] = useState<string[]>(initial?.trades ?? []);
  const [places, setPlaces] = useState<string[]>(initial?.places ?? []);
  const [perDay, setPerDay] = useState(initial?.perDay ?? 20);
  const [source, setSource] = useState<'free' | 'register'>(initial?.source ?? 'free');
  const [region, setRegion] = useState('');
  const [expanding, setExpanding] = useState(false);
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const listId = initial?.listId || audience?.listId || '';
  const listName = listId ? loadLists().find(l => l.id === listId)?.name ?? audience?.listName ?? 'the project\'s list' : '';

  const expand = async () => {
    if (!region.trim()) return;
    setExpanding(true); setNote('');
    const r = await expandPlace(region.trim());
    setExpanding(false);
    if (!r.success) { setNote(r.error ?? 'Could not look that up.'); return; }
    setPlaces([...new Set([...places, ...r.places])]);
    setRegion('');
    setNote(r.places.length > 1 ? `${r.places.length} towns in ${region.trim()}, largest first — remove any you do not want.` : (r.note || ''));
  };

  const save = async () => {
    setErr('');
    if (!trades.length) { setErr('Add at least one kind of business.'); return; }
    if (!places.length) { setErr('Add at least one place.'); return; }
    setBusy(true);
    let list = listId;
    let name = listName;
    if (!list) {
      /* A new list of strangers, saved up before the server is told to fill it. */
      const made = createList({ name: `${project.name} — prospects`, type: 'static', memberIds: [], createdBy: currentActor().name, kind: 'cold', origin: 'prospecting' });
      list = made.id; name = made.name;
      await flushNow();
    }
    const r = await saveFinder({ projectId: project.id, trades, places, perDay, source, listId: list, listName: name });
    setBusy(false);
    if (!r.success) { setErr(r.error ?? 'It could not be saved.'); return; }
    onSaved();
  };

  return (
    <div style={{ ...card, background: T.raised }} aria-label="Daily prospecting settings">
      <div style={{ display: 'grid', gap: 6 }}>
        <span style={label}>Who to find</span>
        <Chips values={trades} onChange={setTrades} placeholder="Kind of business — real estate agents, dentists…" field="finder.trades" icon={<Search size={13} />} />
      </div>
      <div style={{ display: 'grid', gap: 6 }}>
        <span style={label}>Where</span>
        <Chips values={places} onChange={setPlaces} placeholder="A town — Richmond, Virginia" field="finder.places" icon={<MapPin size={13} />} />
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', alignItems: 'center' }}>
          <input value={region} onChange={e => setRegion(e.target.value)} placeholder="Or a whole state or county — Virginia" aria-label="A state or county to split into towns"
            onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); void expand(); } }}
            style={{ flex: '1 1 220px', padding: '8px 10px', border: `1px solid ${T.line}`, borderRadius: 9, font: 'inherit', fontSize: 13, color: T.ink, background: T.panel }} />
          <button type="button" style={btn} onClick={() => void expand()} disabled={expanding || !region.trim()}>
            {expanding ? <Loader size={13} className="spin" /> : <Globe size={13} />} Add its towns
          </button>
        </div>
        {note && <span style={{ fontSize: 12, color: T.muted }}>{note}</span>}
      </div>
      <div style={{ display: 'flex', gap: 14, flexWrap: 'wrap' }}>
        <label style={{ display: 'grid', gap: 6 }}>
          <span style={label}>New prospects a day</span>
          <select value={perDay} onChange={e => setPerDay(Number(e.target.value))} data-field="finder.perDay"
            style={{ padding: '8px 10px', border: `1px solid ${T.line}`, borderRadius: 9, font: 'inherit', fontSize: 13, color: T.ink, background: T.panel }}>
            {[10, 20, 40, 60, 100].map(n => <option key={n} value={n}>{n} a day</option>)}
          </select>
        </label>
        <div style={{ display: 'grid', gap: 6 }}>
          <span style={label}>Search</span>
          <div role="radiogroup" aria-label="Which source" style={{ display: 'flex', gap: 6 }}>
            {([['free', 'Business directories'], ['register', 'Verified business directories (UK)']] as const).map(([v, l]) => (
              <button key={v} type="button" role="radio" aria-checked={source === v} onClick={() => setSource(v)}
                style={{ ...btn, background: source === v ? T.accentSoft : T.panel, borderColor: source === v ? T.accent : T.line, color: source === v ? T.accent : T.ink }}>{l}</button>
            ))}
          </div>
        </div>
      </div>
      <span style={{ fontSize: 12, color: T.muted, lineHeight: 1.55 }}>
        They go on <b style={{ color: T.ink }} data-field="finder.list">{listName || `a new list, "${project.name} — prospects"`}</b>, which this project writes to.
        Your outreach is proposed to them 20 at a time, and each batch waits for your approval. Google Maps is not used for daily searches: it is paid per
        search and its terms do not allow keeping what it returns.
      </span>
      {err && <span role="alert" style={{ fontSize: 12.5, fontWeight: 600, color: T.bad }}>{err}</span>}
      <div style={{ display: 'flex', gap: 8 }}>
        <button type="button" style={{ ...primaryBtn, display: 'inline-flex', alignItems: 'center', gap: 6 }} disabled={busy} onClick={() => void save()}>
          {busy ? <Loader size={14} className="spin" /> : <Zap size={14} />} {initial ? 'Save changes' : 'Start finding prospects every day'}
        </button>
        {onCancel && <button type="button" style={btn} onClick={onCancel}>Cancel</button>}
      </div>
    </div>
  );
}


/** The finder overview, re-read every minute while the page is visible. */
export function useFinderOverview(projectId: string) {
  const [data, setData] = useState<FinderOverview | null>(null);
  const [error, setError] = useState('');
  const load = useCallback(async () => {
    const r = await finderOverview(projectId);
    if (!r.success) { setError(r.error ?? 'Could not read this project\'s prospects.'); return; }
    setError(''); setData(r);
  }, [projectId]);
  useEffect(() => {
    void load();
    const t = window.setInterval(() => { if (document.visibilityState === 'visible') void load(); }, 60_000);
    return () => window.clearInterval(t);
  }, [load]);
  return { data, error, load };
}

const placesText = (places: string[]) =>
  places.length > 3 ? `${places.slice(0, 3).join(', ')} and ${places.length - 3} more` : places.join(', ');

/**
 * The finder's state in words a customer can act on. "Every search done" on
 * its own read as a fault; it means the places given have nobody new left.
 */
export function finderState(f: FinderInfo): { word: string; tone: string; soft: string; says: string } {
  if (f.status === 'paused') {
    return { word: 'Paused', tone: T.warn, soft: T.warnSoft, says: f.statusReason ? `Paused: ${f.statusReason}` : 'Nothing is searched until you resume it. What it already found stays.' };
  }
  if (f.status === 'exhausted') {
    return {
      word: 'All searches done for now', tone: T.muted, soft: T.raised,
      says: 'It has searched every kind of business in every place you gave it, to the end of each list, so there is nobody new left to find there. Add a place or another kind of business and it starts again.',
    };
  }
  const full = f.today.added >= f.perDay;
  return {
    word: full ? 'Today\'s leads are in' : 'Finding every day', tone: T.good, soft: T.goodSoft,
    says: full
      ? `Today's ${f.perDay} are added — it carries on tomorrow.`
      : `${f.today.added} of ${f.perDay} added today. It works a few at a time through the day, by itself, whether or not you are signed in.`,
  };
}

/** The daily finder as one lead source: what it looks for, where it stands, and what to do about it. */
export function FinderCard({ project, f, onChanged, onEdit, editing, onCancelEdit }: {
  project: Project; f: FinderInfo; onChanged: () => void; onEdit: () => void; editing: boolean; onCancelEdit: () => void;
}) {
  const [busy, setBusy] = useState('');
  const [said, setSaid] = useState('');
  const st = finderState(f);
  return (
    <article style={{ ...card, gap: 8 }} data-testid="finder-card" aria-label="Daily search">
      <div style={{ display: 'flex', gap: 10, alignItems: 'flex-start', flexWrap: 'wrap' }}>
        <span aria-hidden style={{ display: 'grid', placeItems: 'center', width: 34, height: 34, borderRadius: 10, background: T.accentSoft, flex: '0 0 auto' }}>
          <Target size={17} color={T.accent} />
        </span>
        <div style={{ display: 'grid', gap: 4, minWidth: 0, flex: '1 1 180px' }}>
          <span style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
            <b style={{ fontSize: 14.5, color: T.ink }}>Daily search</b>
            <span data-testid="finder-status" style={{ fontSize: 11.5, fontWeight: 700, padding: '2px 9px', borderRadius: 999, color: st.tone, background: st.soft }}>{st.word}</span>
          </span>
          <span style={{ fontSize: 13, color: T.ink, lineHeight: 1.5, overflowWrap: 'anywhere' }}>
            Searching <b>{f.trades.join(', ')}</b> in <b>{placesText(f.places)}</b> — up to {f.perDay} new leads a day.
          </span>
          <span style={{ fontSize: 12.5, color: f.status === 'paused' && f.statusReason ? T.warn : T.muted, lineHeight: 1.55 }} data-testid="finder-says">{st.says}</span>
        </div>
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
          {f.status === 'exhausted' ? (
            <button type="button" style={{ ...primaryBtn, display: 'inline-flex', alignItems: 'center', gap: 6 }} onClick={onEdit}>
              <Plus size={13} /> Add places or kinds of business
            </button>
          ) : (
            <>
              {f.status === 'active' && (
                <button type="button" style={btn} disabled={!!busy} onClick={async () => {
                  setBusy('run'); setSaid('');
                  const r = await runFinderStep(project.id, f.id);
                  setBusy(''); setSaid(r.success ? r.detail : (r.error ?? 'It could not run.'));
                  onChanged();
                }}>{busy === 'run' ? <Loader size={13} className="spin" /> : <Play size={13} />} Run a step now</button>
              )}
              <button type="button" style={btn} disabled={!!busy} onClick={async () => {
                setBusy('status'); setSaid('');
                const r = await setFinderStatus(project.id, f.id, f.status === 'active' ? 'paused' : 'active');
                setBusy('');
                if (!r.success) setSaid(r.error ?? 'That did not work.');
                onChanged();
              }}>{f.status === 'active' ? <><Pause size={13} /> Pause</> : <><Play size={13} /> Resume</>}</button>
              <button type="button" style={btn} onClick={onEdit}>Change what it finds</button>
            </>
          )}
        </div>
      </div>
      {said && <div role="status" style={{ fontSize: 12.5, color: T.ink, background: T.accentSoft, borderRadius: 10, padding: '8px 12px' }}>{said}</div>}
      {editing && (
        <FinderSetup project={project} onSaved={() => { onCancelEdit(); onChanged(); }} onCancel={onCancelEdit}
          initial={{ trades: f.trades, places: f.places, perDay: f.perDay, source: f.source, listId: f.listId }} />
      )}
    </article>
  );
}

/** Which searches are done, next and waiting, and today's allowance — for the Details fold. */
export function RotationPanel({ f }: { f: FinderInfo }) {
  return (
    <div style={{ display: 'grid', gap: 8 }}>
      <span style={label}>Searches in the rotation</span>
      <span style={{ fontSize: 12, color: T.muted, lineHeight: 1.55 }}>
        Each kind of business in each place, town by town; a crossed-out one has been searched to the end of its list.
        Today: {f.today.searches} of {f.limits.searches} searches, {f.today.reads} of {f.limits.reads} websites read.
      </span>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, maxHeight: 150, overflowY: 'auto' }}>
        {f.rotation.map(r => (
          <span key={`${r.trade}|${r.place}`} title={r.state === 'done' ? 'Searched to the end' : r.state === 'next' ? 'Next' : 'Waiting its turn'}
            style={{
              fontSize: 11.5, fontWeight: 600, padding: '3px 9px', borderRadius: 999,
              color: r.state === 'done' ? T.muted : r.state === 'next' ? T.accent : T.ink,
              background: r.state === 'done' ? T.raised : r.state === 'next' ? T.accentSoft : T.panel,
              border: `1px solid ${r.state === 'next' ? T.accent : T.line}`, textDecoration: r.state === 'done' ? 'line-through' : 'none',
            }}>{r.trade} · {r.place}</span>
        ))}
      </div>
    </div>
  );
}

/** What the daily search does, above a first set-up. */
export function FinderIntro() {
  return (
    <span style={{ fontSize: 12.5, color: T.muted, lineHeight: 1.6 }}>
      Autopilot searches business directories live, reads each business's own website for the address it publishes, checks it, and adds
      the new ones to this project's audience — a few at a time through the day, until the day's number is in. It never emails anybody itself.
    </span>
  );
}
