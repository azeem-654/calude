/**
 * "Search this every day" — the search on screen becomes part of an AI
 * Autopilot project's daily prospecting (worker/src/prospectFinderTick.ts).
 *
 * It adds this kind of business and this place to the project's rotation
 * (`saveFinder` with `append`), or starts the project's finder if it has none.
 * The prospects go on the project's audience list — or, for a project that
 * does not write to a list yet, a new list made here, which becomes its
 * audience. The same `saveFinder` the wizard and the Prospects tab use, so a
 * finder is one thing however it was started.
 */
import { useEffect, useState } from 'react';
import { CalendarClock, Loader, X } from 'lucide-react';
import { fetchBoard, type Project } from '../../services/projects';
import { saveFinder } from '../../services/finders';
import { createList, loadLists } from '../../services/contactLists';
import { flushNow } from '../../services/serverData';
import { currentActor } from '../../services/contactPermissions';
import { Notice } from './ProspectParts';

export default function DailySearch({ trade, place, source, onClose, onDone }: {
  trade: string; place: string; source: 'free' | 'register' | 'google' | 'osm' | '';
  onClose: () => void; onDone: (message: string, projectId: string) => void;
}) {
  const [projects, setProjects] = useState<Project[] | null>(null);
  const [pick, setPick] = useState('');
  const [perDay, setPerDay] = useState(20);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');

  useEffect(() => {
    let live = true;
    void fetchBoard().then(r => { if (!live) return; setProjects(r.projects as Project[]); if (r.error) setErr(r.error); });
    return () => { live = false; };
  }, []);

  const go = async () => {
    const p = (projects ?? []).find(x => x.id === pick);
    if (!p) { setErr('Choose a project.'); return; }
    setBusy(true); setErr('');
    const aud = (p.brief as { audience?: { listId?: string; listName?: string } } | null | undefined)?.audience;
    let listId = aud?.listId ?? '';
    let listName = aud?.listName ?? '';
    if (!listId) {
      const made = createList({ name: `${p.name} — prospects`, type: 'static', memberIds: [], createdBy: currentActor().name, kind: 'cold', origin: 'prospecting' });
      listId = made.id; listName = made.name;
      await flushNow();
    } else {
      listName = loadLists().find(l => l.id === listId)?.name ?? listName;
    }
    const r = await saveFinder({
      projectId: p.id, trades: [trade], places: [place], perDay, append: true,
      /* Google is never used for daily searches (paid per search; its terms forbid keeping results). */
      source: source === 'register' ? 'register' : 'free', listId, listName,
    });
    setBusy(false);
    if (!r.success) { setErr(r.error ?? 'It could not be set up.'); return; }
    onDone(`"${trade} in ${place}" is now searched every day for "${p.name}" — up to ${perDay} new prospects a day go on "${listName}".`, p.id);
  };

  return (
    <section className="aip-card" aria-label="Search this every day">
      <div className="aip-card-head">
        <span className="aip-card-title"><CalendarClock size={14} /> Search this every day</span>
        <span style={{ flex: 1 }} />
        <button type="button" className="aip-icon-btn" aria-label="Close" onClick={onClose}><X size={14} /></button>
      </div>
      <div style={{ padding: '0 16px 16px', display: 'grid', gap: 10 }}>
        <p className="aip-muted" style={{ margin: 0 }}>
          An AI Autopilot project searches <b data-field="finder.trades">{trade}</b> in <b data-field="finder.places">{place}</b> live every day, reads their websites, checks the addresses and adds the new ones
          to its audience. Its outreach is proposed to them 20 at a time, each batch waiting for your approval.
          {source === 'google' ? ' Daily searches use business directories, not Google Maps — Google charges per search and does not allow keeping results.' : ''}
        </p>
        {projects === null && <span className="aip-muted"><Loader size={12} className="spin" /> Reading your projects…</span>}
        {projects && !projects.length && <span className="aip-muted">You have no AI projects yet — make one in AI Autopilot first, or save these as a list and start a project from it.</span>}
        <div role="radiogroup" aria-label="Which project" className="aip-targets" data-field="daily.project">
          {(projects ?? []).map(p => {
            const aud = (p.brief as { audience?: { listName?: string } } | null | undefined)?.audience;
            return (
              <label key={p.id} className="pp-choice" data-on={pick === p.id}>
                <input type="radio" name="aip-daily" checked={pick === p.id} onChange={() => setPick(p.id)} />
                <span style={{ display: 'grid', gap: 2, minWidth: 0 }}>
                  <b style={{ fontSize: 13, color: 'var(--pp-ink)' }}>{p.name}</b>
                  <small className="aip-muted" data-field={pick === p.id ? 'finder.list' : undefined}>{aud?.listName ? `Adds to its list "${aud.listName}"` : 'Gets a new list of prospects, which it writes to'}</small>
                </span>
              </label>
            );
          })}
        </div>
        <label className="aip-row" style={{ gap: 8 }}>
          <span className="aip-muted">New prospects a day</span>
          <select value={perDay} onChange={e => setPerDay(Number(e.target.value))} className="aip-textarea" style={{ width: 'auto', padding: '6px 10px' }} aria-label="New prospects a day">
            {[10, 20, 40, 60, 100].map(n => <option key={n} value={n}>{n}</option>)}
          </select>
        </label>
        {err && <Notice text={err} />}
        <button type="button" className="aip-btn" data-accent="true" style={{ justifyContent: 'center', padding: '10px 14px' }} disabled={busy || !pick} onClick={() => void go()}>
          {busy ? <Loader size={14} className="spin" /> : <CalendarClock size={14} />} Search it every day
        </button>
      </div>
    </section>
  );
}
