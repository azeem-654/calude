/**
 * The studio's front page — laid out the way the leading video tools open
 * (Descript, Loom, Riverside, VEED): one welcome with the big ways to start
 * side by side, recording first; the numbers that are real (projects, what
 * is ready, what is still working, the month's minutes); then the projects,
 * searchable and filterable, as picture cards; then the goals, for someone
 * who would rather say what they want than pick a tool.
 *
 * Nothing on it is invented: every count is the projects list or the usage
 * the server returned, and a number that is not known is not shown.
 */
import { useMemo, useState } from 'react';
import { Video, MonitorPlay, Upload, Link2, Film, Rocket, Search, Clapperboard, Play, Sparkles, Wand2, ChevronDown, Clock, CheckCircle2, Loader } from 'lucide-react';
import { clock, type ProjectSummary, type Usage } from '../../services/videoStudio';
import { GoalGrid, type GoalKey } from './WelcomeWizard';

type Filter = 'all' | 'ready' | 'working' | 'draft';
const FILTERS: { key: Filter; label: string }[] = [{ key: 'all', label: 'All' }, { key: 'ready', label: 'Ready' }, { key: 'working', label: 'Working' }, { key: 'draft', label: 'Needs a video' }];
const working = (p: ProjectSummary) => p.status === 'processing' || p.status === 'uploading';

function ago(iso: string | undefined): string {
  if (!iso) return '';
  const s = (Date.now() - Date.parse(iso)) / 1000;
  if (!Number.isFinite(s)) return '';
  if (s < 90) return 'just now';
  if (s < 3600) return `${Math.round(s / 60)} min ago`;
  if (s < 86400) return `${Math.round(s / 3600)} h ago`;
  return `${Math.round(s / 86400)} d ago`;
}

export default function StudioHome({ projects, usage, onRecord, onUpload, onGoal, onTab, onOpen }: {
  projects: ProjectSummary[]; usage: Usage | null;
  onRecord: () => void; onUpload: () => void; onGoal: (g: GoalKey) => void; onTab: (t: 'quick-shorts' | 'repurpose') => void; onOpen: (id: string) => void;
}) {
  const [q, setQ] = useState('');
  const [filter, setFilter] = useState<Filter>('all');
  const [goals, setGoals] = useState(projects.length === 0);
  const counts = useMemo(() => ({
    all: projects.length, ready: projects.filter(p => p.status === 'ready').length, working: projects.filter(working).length, draft: projects.filter(p => p.status === 'draft').length,
  }), [projects]);
  const shown = projects.filter(p => (filter === 'all' || (filter === 'ready' ? p.status === 'ready' : filter === 'working' ? working(p) : p.status === 'draft'))
    && (!q.trim() || `${p.name} ${p.autopilotProjectName}`.toLowerCase().includes(q.trim().toLowerCase())));

  const starts = [
    { key: 'upload', icon: Upload, title: 'Upload a video', blurb: 'Drop in a recording — cleaned, captioned, Shorts made.', act: onUpload },
    { key: 'shorts', icon: Film, title: 'Long video → Shorts', blurb: 'The best moments, each on its own topic, vertical.', act: () => onGoal('shorts') },
    { key: 'youtube', icon: Link2, title: 'From a YouTube link', blurb: 'Your own video, fetched and edited the same way.', act: () => onGoal('both') },
    { key: 'quick', icon: Sparkles, title: 'Quick Shorts from a topic', blurb: 'No recording: a script and scenes from an idea.', act: () => onTab('quick-shorts') },
    { key: 'repurpose', icon: Rocket, title: 'Repurpose a video', blurb: 'Posts, an article and emails from what you said.', act: () => onGoal('repurpose') },
  ];

  return (
    <div className="vs-home" data-testid="vs-home">
      <section className="vs-hero">
        <div className="vs-hero-copy">
          <span className="vs-hero-kicker"><Wand2 size={13} /> AI Video Studio</span>
          <h2>What are we making today?</h2>
          <p>Record or upload once — the studio cleans the words and the sound, adds captions, text and your logo, zooms where you click, and cuts Shorts.</p>
        </div>
        <div className="vs-starts">
          <button type="button" className="vs-start feature" onClick={onRecord} data-testid="vs-record-card" data-start="record">
            <span className="vs-start-art" aria-hidden="true">
              <span className="screen"><MonitorPlay size={30} /></span>
              <span className="cam"><Video size={16} /></span>
              <span className="rec"><i /> REC</span>
            </span>
            <span className="vs-start-text">
              <b>Record your screen &amp; camera</b>
              <small>Screen, camera or both, with a background, your logo and a name tag — straight into the editor.</small>
            </span>
            <span className="vs-start-go">Start recording →</span>
          </button>
          {starts.map(s => (
            <button key={s.key} type="button" className="vs-start" onClick={s.act} data-start={s.key}>
              <span className="vs-start-ic"><s.icon size={18} /></span>
              <span className="vs-start-text"><b>{s.title}</b><small>{s.blurb}</small></span>
            </button>
          ))}
        </div>
      </section>

      <section className="vs-stats" aria-label="At a glance">
        <div className="vs-stat"><Clapperboard size={16} /><span><b>{counts.all}</b><small>project{counts.all === 1 ? '' : 's'}</small></span></div>
        <div className="vs-stat ok"><CheckCircle2 size={16} /><span><b>{counts.ready}</b><small>ready</small></span></div>
        <div className="vs-stat busy"><Loader size={16} className={counts.working ? 'spin' : ''} /><span><b>{counts.working}</b><small>working now</small></span></div>
        {usage && (
          <div className="vs-stat wide">
            <Clock size={16} />
            <span className="vs-col" style={{ gap: 4, flex: 1, minWidth: 0 }}>
              <span className="vs-row" style={{ gap: 6 }}><small>Minutes this month</small><span className="vs-spacer" /><b className="sm">{usage.used.sourceMin} / {usage.limits.sourceMin}</b></span>
              <span className="vs-meter"><i style={{ width: `${Math.min(100, (usage.used.sourceMin / Math.max(1, usage.limits.sourceMin)) * 100)}%` }} /></span>
            </span>
          </div>
        )}
      </section>

      <section className="vs-col" style={{ gap: 12 }}>
        <div className="vs-home-bar">
          <h2>Your projects</h2>
          <div className="vs-chips" role="tablist" aria-label="Show">
            {FILTERS.map(f => <button key={f.key} type="button" role="tab" className="vs-chip" aria-selected={filter === f.key} aria-pressed={filter === f.key} onClick={() => setFilter(f.key)} data-filter={f.key}>{f.label}{counts[f.key] ? ` · ${counts[f.key]}` : ''}</button>)}
          </div>
          <span className="vs-spacer" />
          <label className="vs-home-search">
            <Search size={14} />
            <input value={q} onChange={e => setQ(e.target.value)} placeholder="Search projects" aria-label="Search projects" />
          </label>
        </div>
        {!projects.length ? (
          <div className="vs-empty">
            <Clapperboard size={28} />
            <b>No projects yet</b>
            <span>Record your screen and camera, or upload a video, and it appears here.</span>
            <div className="vs-row" style={{ gap: 8, justifyContent: 'center' }}>
              <button type="button" className="vs-btn ai" onClick={onRecord}><Video size={15} /> Record</button>
              <button type="button" className="vs-btn" onClick={onUpload}><Upload size={15} /> Upload</button>
            </div>
          </div>
        ) : !shown.length ? <p className="vs-sub" style={{ margin: 0 }}>Nothing matches — try another word or filter.</p> : (
          <div className="vs-proj-grid">
            {shown.map(p => <ProjectTile key={p.id} p={p} onOpen={() => onOpen(p.id)} />)}
          </div>
        )}
      </section>

      <section className="vs-goals-box">
        <button type="button" className="vs-goals-toggle" aria-expanded={goals} onClick={() => setGoals(g => !g)} data-act="toggle-goals">
          <Sparkles size={15} /> <b>Start from a goal</b> <span className="vs-kbd">tell the studio what you want; it picks the steps</span><span className="vs-spacer" /><ChevronDown size={16} style={{ transform: goals ? 'rotate(180deg)' : undefined }} />
        </button>
        {goals && <GoalGrid compact onTab={onTab} onPick={onGoal} />}
      </section>
    </div>
  );
}

function ProjectTile({ p, onOpen }: { p: ProjectSummary; onOpen: () => void }) {
  const label = p.status === 'ready' ? 'Ready' : p.status === 'failed' ? 'Stopped' : p.status === 'draft' ? 'Needs a video' : p.status === 'uploading' ? 'Uploading' : 'Working';
  const cls = p.status === 'ready' ? 'approved' : p.status === 'failed' ? 'failed' : p.status === 'draft' ? '' : 'processing';
  return (
    <button type="button" className="vs-tile" onClick={onOpen} data-testid="vs-project-card">
      <div className="vs-tile-pic" style={p.posterUrl ? { backgroundImage: `url("${p.posterUrl}")` } : undefined}>
        {!p.posterUrl && <Clapperboard size={30} />}
        <span className={`vs-badge ${cls}`}>{working(p) && <Loader size={11} className="spin" />} {label}</span>
        {p.duration > 0 && <span className="vs-dur">{clock(p.duration)}</span>}
        <span className="vs-tile-play" aria-hidden="true"><Play size={18} /></span>
      </div>
      <div className="vs-tile-body">
        <b title={p.name}>{p.name}</b>
        <span>{p.shorts ? `${p.shorts} Short${p.shorts === 1 ? '' : 's'}` : 'No Shorts yet'}{p.approved ? ` · ${p.approved} approved` : ''}{ago(p.updatedAt) ? ` · ${ago(p.updatedAt)}` : ''}</span>
        {p.autopilotProjectName && <span className="vs-tile-ap">{p.autopilotProjectName}</span>}
        {p.status === 'failed' && p.error && <span style={{ color: 'var(--bad)' }}>{p.error.slice(0, 100)}</span>}
      </div>
    </button>
  );
}
