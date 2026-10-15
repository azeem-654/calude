/**
 * An AI Autopilot project's Prospects tab: where its leads come from, what
 * they have come to, and every one of them.
 *
 *   1. Where this project's leads come from — every source as one compact card
 *      (the daily search, ProjectProspects.tsx; each connected AI Prospecting
 *      search, ProspectSources.tsx), its state in plain words and its actions
 *      beside it. One "Add another lead source" button once there is one.
 *   2. The tiles — counted by the server in the same groups the list filters
 *      by (`finders.php prospects`), and each one opens its group below.
 *   3. All leads (LeadsList.tsx) — every business examined, any source, any
 *      outcome, newest first, paged.
 *   4. The day-by-day chart; then, folded under Details, the rotation and the
 *      step log, which are how it works rather than what it did.
 *
 * ── Why it is laid out like this ──
 *
 * It used to open on a "Prospecting sources" card with a Connect button, then
 * "No prospect search connected yet" with two more, and only then the daily
 * search that was actually finding the project's leads. A customer whose
 * project already had a working source was asked three times to set up
 * another, and told it had none. And its list showed only the five added to
 * the audience under a tile saying 32 had nothing to write to. The big
 * empty state is now for a project with no source at all, and the list is
 * every business, with what became of it.
 */
import { useCallback, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ChevronDown, Loader, Plus, Search, Sparkles, Target } from 'lucide-react';
import { T, primaryBtn } from './theme';
import type { Project } from '../../services/projects';
import type { LeadGroup } from '../../services/finders';
import type { Connection } from '../../services/prospectSources';
import ConnectAutopilot from '../Prospecting/ConnectAutopilot';
import { DailyChart, FinderCard, FinderIntro, FinderSetup, RotationPanel, useFinderOverview } from './ProjectProspects';
import { CommandBox, SourceCard, useSources } from './ProspectSources';
import LeadsList from './LeadsList';
import './projectLeads.css';

const card: React.CSSProperties = { background: T.panel, border: `1px solid ${T.line}`, borderRadius: 14, padding: 14, display: 'grid', gap: 10, minWidth: 0 };
const btn: React.CSSProperties = {
  display: 'inline-flex', alignItems: 'center', gap: 6, padding: '7px 12px', borderRadius: 9, border: `1px solid ${T.line}`,
  background: T.panel, color: T.ink, font: 'inherit', fontSize: 12.5, fontWeight: 650, cursor: 'pointer',
};
const label: React.CSSProperties = { fontSize: 11, fontWeight: 700, letterSpacing: '0.05em', color: T.muted, textTransform: 'uppercase' };
const when = (iso: string) => {
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? '' : d.toLocaleString(undefined, { day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' });
};

type Act = (id: string, what: string, fn: () => Promise<{ success?: boolean; error?: string; connection?: Connection; step?: { detail: string } }>) => Promise<void>;

/** One way of getting leads, as a choice: what it does, and the button that starts it. */
function Choice({ icon, title, says, children }: { icon: React.ReactNode; title: string; says: string; children: React.ReactNode }) {
  return (
    <div style={{ border: `1px solid ${T.line}`, borderRadius: 12, padding: 12, display: 'grid', gap: 8, alignContent: 'start', background: T.raised, minWidth: 0 }}>
      <span style={{ display: 'flex', gap: 8, alignItems: 'center', fontSize: 13.5, fontWeight: 750, color: T.ink }}>{icon}{title}</span>
      <span style={{ fontSize: 12.5, color: T.muted, lineHeight: 1.55 }}>{says}</span>
      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>{children}</div>
    </div>
  );
}

export default function ProjectLeads({ project, focus }: { project: Project; focus?: string }) {
  const navigate = useNavigate();
  const fin = useFinderOverview(project.id);
  const src = useSources(project.id);
  const [group, setGroup] = useState<LeadGroup>('all');
  const [counts, setCounts] = useState<Record<LeadGroup, number> | null>(null);
  const [refreshKey, setRefreshKey] = useState(0);
  /* 'menu' — the Add another lead source choices; 'finder' — setting up (or widening) the daily search. */
  const [open, setOpen] = useState<'' | 'menu' | 'finder'>('');
  const [connect, setConnect] = useState<{ searchId?: string } | null>(null);
  const [busy, setBusy] = useState('');
  const [said, setSaid] = useState('');

  const f = fin.data?.finder ?? null;
  const conns = src.conns ?? [];
  const any = !!f || conns.length > 0;
  const loading = (!fin.data && !fin.error) || (src.conns === null && !src.error);

  const changed = useCallback(() => { void fin.load(); void src.load(); setRefreshKey(k => k + 1); }, [fin, src]);
  const replace = (c: Connection) => src.setConns(cs => (cs ?? []).map(x => (x.id === c.id ? c : x)));
  const act: Act = async (id, what, fn) => {
    setBusy(`${what}:${id}`); setSaid('');
    const r = await fn();
    setBusy('');
    if (!r.success) { setSaid(r.error ?? 'That did not work.'); return; }
    if (r.connection) replace(r.connection);
    if (r.step?.detail) setSaid(r.step.detail);
    changed();
  };

  /* `?source=<id>` from the Overview or AI Prospecting: bring that card into view. */
  useEffect(() => {
    if (!focus || !src.conns) return;
    const t = window.setTimeout(() => document.getElementById(`source-${focus}`)?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 120);
    return () => window.clearTimeout(t);
  }, [focus, src.conns]);

  const pick = (g: LeadGroup) => {
    setGroup(g);
    window.setTimeout(() => document.getElementById('project-all-leads')?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 50);
  };

  if (loading) return <div style={{ ...card, color: T.muted, fontSize: 13, display: 'flex', gap: 8, alignItems: 'center' }}><Loader size={14} className="spin" /> Reading this project's leads…</div>;

  /* Today's additions are counted from the table (every source, by hand too, UTC day), not summed from
     each source's own day counter — a connection's run day is in the customer's zone, the finder's in UTC. */
  const todayKey = new Date().toISOString().slice(0, 10);
  const todayAdded = fin.data?.days.find(d => d.day === todayKey)?.added ?? 0;
  const todayTarget = (f && f.status === 'active' ? f.perDay : 0) + conns.filter(c => c.status === 'active').reduce((a, c) => a + c.target, 0);
  const totals = fin.data?.totals ?? {};
  const n = (g: LeadGroup) => counts?.[g] ?? 0;
  const tiles: { g?: LeadGroup; value: string; title: string; help: string; show: boolean }[] = [
    {
      value: todayTarget && todayAdded < todayTarget ? `${todayAdded} of ${todayTarget}` : String(todayAdded), title: 'Added today',
      help: !todayTarget ? 'New leads that joined the audience today. No source is running, so no more are coming today.'
        : todayAdded < todayTarget ? 'New leads that joined the audience today, from every source, against the day\'s number of the sources still running.'
          : `New leads that joined the audience today, from every source — the day's ${todayTarget} are in.`,
      show: todayTarget > 0 || todayAdded > 0,
    },
    { g: 'added', value: String(n('added')), title: 'Leads added (all time)', help: 'In this project\'s audience — the people its outreach can go to, once you approve it.', show: true },
    { g: 'all', value: String(n('all')), title: 'Businesses examined', help: 'Every business this project has looked at, from every source — all of them are listed below.', show: true },
    { g: 'no_email', value: String(n('no_email')), title: 'Found without an email', help: 'Can\'t be written to: no website, no address published on it, or the address takes no mail. Kept so they are never examined twice.', show: true },
    { g: 'known', value: String(n('known')), title: 'Already in your contacts', help: 'Found again but already in Contacts or this project — not added twice.', show: true },
    {
      g: 'waiting', value: String(n('waiting')), title: 'Still being checked',
      help: `${totals.candidate ?? 0} websites still to read, ${totals.ready ?? 0} checked and waiting for a later day's room.`, show: true,
    },
    { g: 'other', value: String(n('other')), title: 'Turned away', help: 'Opted out, matched an exclusion, below your confidence bar, or deleted from Contacts by you.', show: n('other') > 0 },
  ];

  const sourceCount = (f ? 1 : 0) + conns.length;
  const working = (f && f.status === 'active' ? 1 : 0) + conns.filter(c => c.status === 'active').length;
  const headline = !any ? '' : working === sourceCount
    ? `${sourceCount === 1 ? 'One source finds' : `${sourceCount} sources find`} new leads for this project by itself, on its own schedule.`
    : working === 0
      ? `${sourceCount === 1 ? 'Its one source is' : `All ${sourceCount} sources are`} stopped — see below for why and what to do.`
      : `${working} of ${sourceCount} sources are finding new leads; the others are stopped — see each one for why.`;

  const runs = fin.data?.runs ?? [];

  return (
    <div style={{ display: 'grid', gap: 14, minWidth: 0 }} aria-label="Prospects">
      {(fin.error || src.error) && <div role="alert" style={{ ...card, color: T.bad, fontSize: 13 }}>{fin.error || src.error}</div>}

      {/* ── 1 · Where the leads come from ── */}
      {any ? (
        <section style={{ ...card, gap: 12 }} aria-label="Where this project's leads come from" data-testid="lead-sources">
          <div style={{ display: 'flex', gap: 10, alignItems: 'flex-start', flexWrap: 'wrap' }}>
            <div style={{ display: 'grid', gap: 3, flex: '1 1 260px', minWidth: 0 }}>
              <b style={{ fontSize: 15, color: T.ink }}>Where this project's leads come from</b>
              <span style={{ fontSize: 12.5, color: T.muted, lineHeight: 1.55 }}>{headline} Everything they found — added or not — is listed under All leads.</span>
            </div>
            <button type="button" style={btn} aria-expanded={open === 'menu'} onClick={() => setOpen(open === 'menu' ? '' : 'menu')} data-testid="add-lead-source">
              <Plus size={13} /> Add another lead source <ChevronDown size={13} style={{ transform: open === 'menu' ? 'rotate(180deg)' : 'none' }} />
            </button>
          </div>

          {open === 'menu' && (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(230px, 100%), 1fr))', gap: 10 }} aria-label="Ways to add leads">
              {f ? (
                <Choice icon={<Target size={15} color={T.accent} />} title="Widen the daily search"
                  says="Add places or kinds of business to the search this project already runs every day — no second search to look after.">
                  <button type="button" style={btn} onClick={() => setOpen('finder')}>Add places or kinds of business</button>
                </Choice>
              ) : (
                <Choice icon={<Target size={15} color={T.accent} />} title="Find new businesses every day"
                  says="Say what kind of business and where; Autopilot searches, reads their websites and adds the ones with an address, a few a day.">
                  <button type="button" style={btn} onClick={() => setOpen('finder')}>Set it up</button>
                </Choice>
              )}
              <Choice icon={<Search size={15} color={T.accent} />} title="Use a search you tested in AI Prospecting"
                says="Connect a saved AI Prospecting search: it runs on a schedule, verifies each lead and turns away duplicates and opt-outs.">
                <button type="button" style={btn} onClick={() => { setOpen(''); setConnect({}); }} data-testid="connect-prospect-search">Connect a search</button>
              </Choice>
              <Choice icon={<Sparkles size={15} color={T.accent} />} title="Add some by hand"
                says="Search in AI Prospecting, tick the businesses you want and add them to this project.">
                <button type="button" style={btn} onClick={() => navigate('/prospecting')}>Open AI Prospecting</button>
              </Choice>
            </div>
          )}

          {f && (
            <FinderCard project={project} f={f} onChanged={changed}
              editing={open === 'finder'} onEdit={() => setOpen('finder')} onCancelEdit={() => setOpen('')} />
          )}
          {!f && open === 'finder' && (
            <div style={{ display: 'grid', gap: 8 }}>
              <FinderIntro />
              <FinderSetup project={project} initial={null} onSaved={() => { setOpen(''); changed(); }} onCancel={() => setOpen('')} />
            </div>
          )}
          {conns.map(c => (
            <SourceCard key={c.id} c={c} focused={focus === c.id} busy={busy} onAct={act} onReplace={replace} onSaid={setSaid} />
          ))}
          {conns.length > 0 && (
            <CommandBox project={project} conns={conns} onAct={act} onReplace={replace} onSaid={setSaid} onConnect={id => setConnect({ searchId: id })} />
          )}
          {said && <div role="status" style={{ fontSize: 12.5, color: T.ink, background: T.accentSoft, borderRadius: 10, padding: '8px 12px' }} data-testid="source-said">{said}</div>}
        </section>
      ) : (
        <section style={{ ...card, gap: 12 }} aria-label="Where this project's leads come from" data-testid="lead-sources-empty">
          <div style={{ display: 'grid', gap: 4 }}>
            <b style={{ fontSize: 15, color: T.ink }}>Where will this project's leads come from?</b>
            <span style={{ fontSize: 12.5, color: T.muted, lineHeight: 1.55 }}>
              Nothing is finding leads for this project yet. Choose one way — you can add another later.
              {n('added') > 0 && ` ${n('added')} ${n('added') === 1 ? 'was' : 'were'} already added by hand from AI Prospecting; they are listed below.`}
            </span>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(260px, 100%), 1fr))', gap: 10 }}>
            <Choice icon={<Target size={15} color={T.accent} />} title="Find new businesses every day"
              says="Say what kind of business and where. Autopilot searches business directories, reads each website for the address it publishes, checks it and adds the new ones — a few at a time, every day.">
              <button type="button" style={{ ...primaryBtn, display: 'inline-flex', alignItems: 'center', gap: 6 }} onClick={() => setOpen('finder')} aria-expanded={open === 'finder'}>
                <Target size={13} /> Set up a daily search
              </button>
            </Choice>
            <Choice icon={<Search size={15} color={T.accent} />} title="Use a search you tested in AI Prospecting"
              says='Build and test a search first — "dentists in New York City with a website" — then connect it: it runs on your schedule and verifies every lead.'>
              <button type="button" style={btn} onClick={() => setConnect({})} data-testid="connect-prospect-search"><Plus size={13} /> Connect a search</button>
              <button type="button" style={btn} onClick={() => navigate('/prospecting')}><Sparkles size={13} /> Open AI Prospecting</button>
            </Choice>
          </div>
          {open === 'finder' && (
            <div style={{ display: 'grid', gap: 8 }}>
              <FinderIntro />
              <FinderSetup project={project} initial={null} onSaved={() => { setOpen(''); changed(); }} onCancel={() => setOpen('')} />
            </div>
          )}
        </section>
      )}

      {/* ── 2 · The tiles ── */}
      {(any || n('all') > 0) && (
        <div className="pl-tiles" aria-label="Lead counts">
          {tiles.filter(t => t.show).map(t => {
            const on = !!t.g && group === t.g;
            const inner = (
              <>
                <b style={{ fontSize: 21, color: T.ink, fontVariantNumeric: 'tabular-nums', lineHeight: 1.1 }} data-kpi={t.title}>{t.value}</b>
                <span style={{ fontSize: 12.5, fontWeight: 700, color: T.ink }}>{t.title}</span>
                <span style={{ fontSize: 11.5, color: T.muted, lineHeight: 1.45 }}>{t.help}</span>
              </>
            );
            const style: React.CSSProperties = { ...card, gap: 3, padding: 12, textAlign: 'left', font: 'inherit', alignContent: 'start', borderColor: on ? T.accent : T.line };
            return t.g
              ? <button key={t.title} type="button" style={{ ...style, cursor: 'pointer' }} aria-pressed={on} onClick={() => pick(t.g!)} title={`Show ${t.title.toLowerCase()} below`}>{inner}</button>
              : <div key={t.title} style={style}>{inner}</div>;
          })}
        </div>
      )}

      {/* ── 3 · Every lead ── (mounted even with no source, so leads added by hand are still listed and counted) */}
      <div style={{ display: any || n('all') > 0 ? 'block' : 'none', minWidth: 0 }}>
        <LeadsList projectId={project.id} projectName={project.name} group={group} onGroup={setGroup} refreshKey={refreshKey} onCounts={setCounts} />
      </div>

      {/* ── 4 · Over time, then how it works ── */}
      {any && (
        <div style={card}>
          <span style={label}>New leads added, day by day</span>
          <DailyChart days={fin.data?.days ?? []} />
        </div>
      )}
      {any && (f || runs.length > 0) && (
        <details style={card} data-testid="prospects-details">
          <summary style={{ cursor: 'pointer', fontSize: 13, fontWeight: 700, color: T.ink }}>Details — the searches it works through and every step it took</summary>
          <div style={{ display: 'grid', gap: 14, marginTop: 6 }}>
            {f && <RotationPanel f={f} />}
            {runs.length > 0 && (
              <div style={{ display: 'grid', gap: 8 }}>
                <span style={label}>What it did, step by step</span>
                <ul style={{ margin: 0, padding: 0, listStyle: 'none', display: 'grid', gap: 6 }}>
                  {runs.map((r, i) => (
                    <li key={i} style={{ fontSize: 12, color: T.ink, display: 'grid', gridTemplateColumns: 'minmax(90px, 120px) minmax(0, 1fr)', gap: 8 }}>
                      <span style={{ color: T.muted }}>{when(r.at)}</span><span style={{ overflowWrap: 'anywhere' }}>{r.detail}</span>
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        </details>
      )}

      {connect && (
        <ConnectAutopilot projectId={project.id} searchId={connect.searchId} onClose={() => { setConnect(null); changed(); }} onDone={changed} />
      )}
    </div>
  );
}
