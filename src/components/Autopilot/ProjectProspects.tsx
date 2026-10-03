/**
 * A project's Prospects tab — the people it is finding, day by day, and the
 * daily prospect finder that finds them (worker/src/prospectFinderTick.ts).
 *
 * ── What it shows, and what it will not ──
 *
 * Every number is counted from `crm_project_prospects`: added per day, waiting,
 * being read, nothing to write to, already in Contacts. The rotation says which
 * searches are done, which is next and which are waiting — and when every one
 * is done it says so, rather than implying the audience grows for ever. A place
 * has a finite number of listed businesses; "more every day" lasts until the
 * rotation is used up, and then needs more places or kinds of business.
 *
 * ── Setting it up ──
 *
 * Kinds of business, places (a state becomes its towns — `expandPlace`), how
 * many a day, which source, and the list they go on (the project's audience, or
 * a new one made here). The same finder is set up from the New Project wizard
 * and from AI Prospecting's "Search this every day"; all three go through
 * `saveFinder`, so there is one place that decides what a finder is.
 *
 * Authored light like the rest of Autopilot (theme.ts): the app's dark mode
 * inverts it with everything else.
 */
import { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  AlertTriangle, BadgeCheck, CheckCircle2, Globe, Loader, MapPin, Pause, Play, Plus, Search, Sparkles, Target, Users, X, Zap,
} from 'lucide-react';
import { T, primaryBtn } from './theme';
import type { Project } from '../../services/projects';
import {
  expandPlace, finderOverview, runFinderStep, saveFinder, setFinderStatus, type FinderOverview,
} from '../../services/finders';
import { createList, loadLists } from '../../services/contactLists';
import { flushNow } from '../../services/serverData';
import { currentActor } from '../../services/contactPermissions';

const STATUS_WORD: Record<string, string> = { valid: 'Verified email', domain_ok: 'Domain OK', risky: 'Risky', invalid: 'Invalid' };
const when = (iso: string) => {
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? '' : d.toLocaleString(undefined, { day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' });
};
const btn: React.CSSProperties = {
  display: 'inline-flex', alignItems: 'center', gap: 6, padding: '7px 12px', borderRadius: 9, border: `1px solid ${T.line}`,
  background: T.panel, color: T.ink, font: 'inherit', fontSize: 12.5, fontWeight: 650, cursor: 'pointer',
};
const card: React.CSSProperties = { background: T.panel, border: `1px solid ${T.line}`, borderRadius: 14, padding: 14, display: 'grid', gap: 10, minWidth: 0 };
const label: React.CSSProperties = { fontSize: 11, fontWeight: 700, letterSpacing: '0.05em', color: T.muted, textTransform: 'uppercase' };

/** The last 30 days, one bar a day, with the days that added nobody shown as nothing rather than skipped. */
function DailyChart({ days }: { days: { day: string; added: number }[] }) {
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

function Setup({ project, initial, onSaved, onCancel }: {
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

export default function ProjectProspects({ project }: { project: Project }) {
  const navigate = useNavigate();
  const [data, setData] = useState<FinderOverview | null>(null);
  const [error, setError] = useState('');
  const [editing, setEditing] = useState(false);
  const [busy, setBusy] = useState('');
  const [said, setSaid] = useState('');

  const load = useCallback(async () => {
    const r = await finderOverview(project.id);
    if (!r.success) { setError(r.error ?? 'Could not read this project\'s prospects.'); return; }
    setError(''); setData(r);
  }, [project.id]);
  useEffect(() => {
    void load();
    const t = window.setInterval(() => { if (document.visibilityState === 'visible') void load(); }, 60_000);
    return () => window.clearInterval(t);
  }, [load]);

  if (error) return <div style={{ ...card, color: T.bad, fontSize: 13 }}><AlertTriangle size={14} /> {error}</div>;
  if (!data) return <div style={{ ...card, color: T.muted, fontSize: 13 }}><Loader size={14} className="spin" /> Reading this project's prospects…</div>;

  const f = data.finder;
  const t = data.totals;
  const today = f ? f.today : null;

  if (!f || editing) {
    return (
      <div style={{ display: 'grid', gap: 12 }} aria-label="Prospects">
        {!f && (
          <div style={card}>
            <span style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 15, fontWeight: 750, color: T.ink }}><Target size={17} color={T.accent} /> Find new prospects every day</span>
            <span style={{ fontSize: 13, color: T.muted, lineHeight: 1.6 }}>
              Autopilot searches business directories live, reads each business's own website for the address it publishes, checks
              it, and adds the new ones to this project's audience — a few at a time through the day, until today's number is in.
              It never emails anybody itself.
            </span>
            {(t.added ?? 0) > 0 && <span style={{ fontSize: 12.5, color: T.ink }}>{t.added} already added to this project by hand from AI Prospecting.</span>}
          </div>
        )}
        <Setup project={project} onSaved={() => { setEditing(false); void load(); }} onCancel={f ? () => setEditing(false) : undefined}
          initial={f ? { trades: f.trades, places: f.places, perDay: f.perDay, source: f.source, listId: f.listId } : null} />
        <button type="button" style={{ ...btn, justifySelf: 'start' }} onClick={() => navigate('/prospecting')}><Plus size={13} /> Or add some by hand in AI Prospecting</button>
      </div>
    );
  }

  const statusWord = f.status === 'active' ? 'Finding every day' : f.status === 'paused' ? 'Paused' : 'Every search done';
  const tone = f.status === 'active' ? T.good : f.status === 'paused' ? T.warn : T.muted;

  return (
    <div style={{ display: 'grid', gap: 12 }} aria-label="Prospects">
      <div style={{ ...card, gridTemplateColumns: 'minmax(0, 1fr) auto', alignItems: 'start' }}>
        <div style={{ display: 'grid', gap: 4, minWidth: 0 }}>
          <span style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
            <b style={{ fontSize: 15, color: T.ink }}>Daily prospecting</b>
            <span data-testid="finder-status" style={{ fontSize: 11.5, fontWeight: 700, padding: '2px 9px', borderRadius: 999, color: tone, background: f.status === 'active' ? T.goodSoft : f.status === 'paused' ? T.warnSoft : T.raised }}>{statusWord}</span>
          </span>
          <span style={{ fontSize: 12.5, color: T.muted, lineHeight: 1.55, overflowWrap: 'anywhere' }}>
            {f.trades.join(', ')} · in {f.places.length > 3 ? `${f.places.slice(0, 3).join(', ')} and ${f.places.length - 3} more` : f.places.join(', ')} · {f.perDay} a day
          </span>
          {f.statusReason && <span style={{ fontSize: 12.5, color: T.warn }}>{f.statusReason}</span>}
        </div>
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', justifyContent: 'flex-end' }}>
          {f.status === 'active' && (
            <button type="button" style={btn} disabled={!!busy} onClick={async () => {
              setBusy('run'); setSaid('');
              const r = await runFinderStep(project.id, f.id);
              setBusy(''); setSaid(r.success ? r.detail : (r.error ?? 'It could not run.'));
              void load();
            }}>{busy === 'run' ? <Loader size={13} className="spin" /> : <Play size={13} />} Run a step now</button>
          )}
          <button type="button" style={btn} disabled={!!busy} onClick={async () => {
            setBusy('status');
            await setFinderStatus(project.id, f.id, f.status === 'active' ? 'paused' : 'active');
            setBusy(''); void load();
          }}>{f.status === 'active' ? <><Pause size={13} /> Pause</> : <><Play size={13} /> Resume</>}</button>
          <button type="button" style={btn} onClick={() => setEditing(true)}>Change what it finds</button>
        </div>
      </div>
      {said && <div role="status" style={{ fontSize: 12.5, color: T.ink, background: T.accentSoft, borderRadius: 10, padding: '8px 12px' }}>{said}</div>}

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: 10 }}>
        {[
          { n: `${today?.added ?? 0} / ${f.perDay}`, l: 'Added today', Icon: Zap },
          { n: t.added ?? 0, l: 'In the audience', Icon: Users },
          { n: t.ready ?? 0, l: 'Ready for another day', Icon: CheckCircle2 },
          { n: t.candidate ?? 0, l: 'Websites still to read', Icon: Globe },
          { n: t.no_email ?? 0, l: 'Nothing to write to', Icon: X },
          { n: t.known ?? 0, l: 'Already in Contacts', Icon: BadgeCheck },
        ].map(k => (
          <div key={k.l} style={{ ...card, gap: 2, padding: 12 }}>
            <k.Icon size={14} color={T.accent} />
            <b style={{ fontSize: 20, color: T.ink, fontVariantNumeric: 'tabular-nums' }} data-kpi={k.l}>{k.n}</b>
            <span style={{ fontSize: 11.5, color: T.muted }}>{k.l}</span>
          </div>
        ))}
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(320px, 100%), 1fr))', gap: 12 }}>
        <div style={card}>
          <span style={label}>Added to the audience, day by day</span>
          <DailyChart days={data.days} />
        </div>
        <div style={card}>
          <span style={label}>Searches in the rotation</span>
          <span style={{ fontSize: 12, color: T.muted }}>
            Each kind of business in each place, town by town. Today: {today?.searches ?? 0} of {f.limits.searches} searches, {today?.reads ?? 0} of {f.limits.reads} websites.
          </span>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, maxHeight: 150, overflowY: 'auto' }}>
            {f.rotation.map(r => (
              <span key={`${r.trade}|${r.place}`} title={r.state === 'done' ? 'Run to its end' : r.state === 'next' ? 'Next' : 'Waiting its turn'}
                style={{
                  fontSize: 11.5, fontWeight: 600, padding: '3px 9px', borderRadius: 999,
                  color: r.state === 'done' ? T.muted : r.state === 'next' ? T.accent : T.ink,
                  background: r.state === 'done' ? T.raised : r.state === 'next' ? T.accentSoft : T.panel,
                  border: `1px solid ${r.state === 'next' ? T.accent : T.line}`, textDecoration: r.state === 'done' ? 'line-through' : 'none',
                }}>{r.trade} · {r.place}</span>
            ))}
          </div>
        </div>
      </div>

      <div style={card}>
        <span style={{ display: 'flex', alignItems: 'center', gap: 8 }}><span style={label}>Latest prospects</span><span style={{ flex: 1 }} />
          <button type="button" style={btn} onClick={() => navigate('/prospecting')}><Sparkles size={13} /> Add more in AI Prospecting</button></span>
        {!data.recent.length && <span style={{ fontSize: 12.5, color: T.muted }}>None yet — the first appear within a few minutes of starting, a few at a time.</span>}
        {data.recent.length > 0 && (
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12.5, minWidth: 560 }} aria-label="Latest prospects">
              <thead><tr style={{ textAlign: 'left', color: T.muted, fontSize: 11 }}>
                {['Business', 'Email', 'Found', 'Where it is'].map(h => <th key={h} style={{ padding: '6px 8px', borderBottom: `1px solid ${T.line}`, fontWeight: 700 }}>{h}</th>)}
              </tr></thead>
              <tbody>
                {data.recent.map(r => (
                  <tr key={r.id}>
                    <td style={{ padding: '7px 8px', borderBottom: `1px solid ${T.lineSoft}` }}>
                      <b style={{ color: T.ink }}>{r.name}</b>
                      <span style={{ display: 'block', fontSize: 11, color: T.muted }}>{r.category}{r.person_name ? ` · ${r.person_name}${r.person_role ? `, ${r.person_role}` : ''}` : ''}</span>
                    </td>
                    <td style={{ padding: '7px 8px', borderBottom: `1px solid ${T.lineSoft}` }}>
                      <span style={{ color: T.ink }}>{r.email || '—'}</span>
                      {r.email_status && <span style={{ display: 'block', fontSize: 11, color: r.email_status === 'valid' ? T.good : T.muted }}>{STATUS_WORD[r.email_status] ?? r.email_status}</span>}
                    </td>
                    <td style={{ padding: '7px 8px', borderBottom: `1px solid ${T.lineSoft}`, whiteSpace: 'nowrap', color: T.muted }}>{when(r.found_at)}</td>
                    <td style={{ padding: '7px 8px', borderBottom: `1px solid ${T.lineSoft}`, color: r.status === 'added' ? T.good : T.warn }}>
                      {r.status === 'added' ? (r.source === 'manual' ? 'In the audience · added by hand' : 'In the audience') : 'Ready — joins on a later day'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {data.runs.length > 0 && (
        <details style={card}>
          <summary style={{ cursor: 'pointer', fontSize: 12.5, fontWeight: 650, color: T.ink }}>What it did, step by step</summary>
          <ul style={{ margin: 0, padding: 0, listStyle: 'none', display: 'grid', gap: 6 }}>
            {data.runs.map((r, i) => (
              <li key={i} style={{ fontSize: 12, color: T.ink, display: 'grid', gridTemplateColumns: '110px minmax(0, 1fr)', gap: 8 }}>
                <span style={{ color: T.muted }}>{when(r.at)}</span><span style={{ overflowWrap: 'anywhere' }}>{r.detail}</span>
              </li>
            ))}
          </ul>
        </details>
      )}
    </div>
  );
}
