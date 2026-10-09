/**
 * The first prospects, found while the customer watches.
 *
 * A project that finds its own contacts used to finish its build with "Nobody
 * to email yet — import your list", which is the opposite of what was just
 * agreed: the customer chose to have them found. So once everything is made,
 * this runs the finder's first steps for real (`run_step`, the same step the
 * cron runs every five minutes) and shows each one as it returns — the search,
 * the websites read, the prospects added to the project's audience.
 *
 * It stops after a handful of steps or once the first few are in; the cron
 * carries on from there with nobody signed in. A step that fails is reported
 * as what it is and the cron retries it — nothing here pretends a search ran.
 */
import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { CheckCircle2, Globe, Loader, Search, UserPlus, AlertTriangle, ArrowRight } from 'lucide-react';
import { runFinderStep, syncFinderContacts } from '../../../services/finders';
import { trackKnown } from '../../../services/funnel';

type Line = { job: string; detail: string; added: number; found: number; failed?: boolean };

/* Steps this screen runs before handing over to the cron: a search and a few rounds of website reads. */
const MAX_STEPS = 7;
/* Under StrictMode an effect mounts twice; the steps must run once. */
const started = new Set<string>();

/*
 * Rounds of website reading are one activity to the customer: seven lines of
 * "Read 6 websites" read as the screen stuttering. Consecutive reads are
 * summed into one line; any line in a shape this does not recognise is shown
 * as the server wrote it.
 */
const READ = /^Read (\d+) websites?: (\d+) with an address that takes mail/;
function merged(lines: Line[]): Line[] {
  const out: Line[] = [];
  for (const l of lines) {
    const m = READ.exec(l.detail);
    const prev = out[out.length - 1];
    const pm = prev ? /^Read (\d+) websites so far: (\d+) with an address that takes mail/.exec(prev.detail) : null;
    if (m && !l.failed && prev && pm) {
      const read = Number(pm[1]) + Number(m[1]);
      const mail = Number(pm[2]) + Number(m[2]);
      out[out.length - 1] = { ...prev, added: prev.added + l.added, detail: `Read ${read} websites so far: ${mail} with an address that takes mail` };
    } else if (m && !l.failed) {
      out.push({ ...l, detail: `Read ${m[1]} websites so far: ${m[2]} with an address that takes mail` });
    } else out.push(l);
  }
  return out;
}

export default function FinderLive({ projectId, finderId, perDay, trades, places }: {
  projectId: string; finderId: string; perDay: number; trades: string[]; places: string[];
}) {
  const [lines, setLines] = useState<Line[]>([]);
  const [busy, setBusy] = useState(true);
  const [note, setNote] = useState('');
  const alive = useRef(true);

  useEffect(() => {
    alive.current = true;
    if (started.has(finderId)) { setBusy(false); return () => { alive.current = false; }; }
    started.add(finderId);
    void (async () => {
      let added = 0;
      for (let i = 0; i < MAX_STEPS; i++) {
        const r = await runFinderStep(projectId, finderId);
        if (!alive.current) return;
        if (!r.success) {
          setLines(l => [...l, { job: 'error', detail: r.error ?? 'The step could not run.', added: 0, found: 0, failed: true }]);
          setNote('It tries again by itself every few minutes, with nobody signed in.');
          break;
        }
        const failed = /failed/i.test(r.detail ?? '');
        setLines(l => [...l, { job: r.job, detail: r.detail, added: r.added ?? 0, found: r.found ?? 0, failed }]);
        added += r.added ?? 0;
        if (failed) { setNote('The directory did not answer that search; the finder tries it again by itself in a few minutes.'); break; }
        /* Nothing left to do right now (today's share is in, or the rotation is finished): the cron takes it from here. */
        if (!r.ran || !['search', 'read'].includes(r.job)) break;
        if (added >= Math.min(perDay, 10)) break;
      }
      await syncFinderContacts().catch(() => 0);
      /* The first prospects are this project's first value (services/funnel.ts). */
      if (added > 0) trackKnown('first_value_reached', { solution: 'lead-generation' });
      if (alive.current) setBusy(false);
    })();
    return () => { alive.current = false; };
  }, [projectId, finderId, perDay]);

  const found = lines.reduce((n, l) => n + l.found, 0);
  const added = lines.reduce((n, l) => n + l.added, 0);
  const where = places.length > 3 ? `${places.slice(0, 3).join('; ')} and ${places.length - 3} more` : places.join('; ');

  return (
    <section className="np-rise np-finder-live" aria-label="Finding your first prospects" aria-busy={busy}>
      <div style={{ display: 'flex', gap: 11, alignItems: 'flex-start' }}>
        <span className="np-finder-live-ic">{busy ? <Loader size={17} className="spin" /> : <UserPlus size={17} />}</span>
        <div style={{ minWidth: 0, flex: 1 }}>
          <b style={{ display: 'block', fontSize: 15, color: '#17191c' }}>
            {busy ? 'Finding your first prospects now' : added ? `${added} prospect${added === 1 ? '' : 's'} added to this project` : 'Your project is finding its own prospects'}
          </b>
          <span style={{ display: 'block', fontSize: 13, color: '#6b7280', lineHeight: 1.55, marginTop: 2 }}>
            {trades.join(', ')}{where ? ` in ${where}` : ''} — searched live, each website read for the address it publishes, every address checked.
          </span>
        </div>
        {/* "Found" only once a search has run here — the build's own save may already have searched, and "0 found" beside 9 added reads as nonsense. */}
        <span className="np-finder-live-n" aria-live="polite">{found > 0 && <><b>{found}</b><small>found</small></>}<b>{added}</b><small>added</small></span>
      </div>

      {lines.length > 0 && (
        <ol className="np-finder-live-log">
          {merged(lines).map((l, i) => (
            <li key={i} data-failed={l.failed ? '1' : undefined}>
              {l.failed ? <AlertTriangle size={14} color="#b45309" /> : l.job === 'search' ? <Search size={14} color="#5b46e5" /> : l.job === 'read' ? <Globe size={14} color="#5b46e5" /> : <CheckCircle2 size={14} color="#16a34a" />}
              <span>{l.detail}</span>
            </li>
          ))}
        </ol>
      )}

      {!busy && (
        <span style={{ fontSize: 13, color: '#334155', lineHeight: 1.6 }}>
          {note && <>{note} </>}
          It carries on by itself every few minutes — up to {perDay} new prospects a day — and Autopilot writes to them
          in batches of 20, each batch waiting for your approval on the project's board.
        </span>
      )}
      <Link to={`/autopilot?project=${encodeURIComponent(projectId)}&tab=prospects`} className="np-finder-live-link">
        Watch them arrive on the Prospects tab <ArrowRight size={13} />
      </Link>
    </section>
  );
}
