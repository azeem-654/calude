/**
 * AI Video Studio — a long recording in, a cleaned long video, distinct
 * Shorts, captions, PNG thumbnails and per-video metadata out, saved into the
 * workspace and its AI Autopilot project (docs/VIDEO-STUDIO.md).
 *
 * /video-studio                 the studio: Projects, Media Library, Brand Kit,
 *                               Exports, Ready to Publish, Templates
 * /video-studio?new=1&project=  a new project (optionally for an Autopilot project)
 * /video-studio/:id             the editor
 *
 * Everything shown is read from the server; nothing here advances on a timer
 * or claims a step happened that did not.
 */
import { useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { Clapperboard, Film, Plus, Loader, ShieldCheck, Upload, Palette, Download, CalendarDays, LayoutTemplate, X } from 'lucide-react';
import {
  listVideoProjects, videoCapabilities, clock, STATUS_LABEL, TEMPLATES,
  type Capability, type ProjectSummary, type Usage, type Template,
} from '../../services/videoStudio';
import NewVideoProject from './NewVideoProject';
import VideoEditor from './VideoEditor';
import { MediaLibrary, ExportsList, ReadyToPublish } from './VideoLibrary';
import BrandKit from './BrandKit';
import './videoStudio.css';

type Tab = 'projects' | 'media' | 'brand' | 'exports' | 'publish' | 'templates';
const TABS: { key: Tab; label: string; icon: typeof Film }[] = [
  { key: 'projects', label: 'Projects', icon: Film },
  { key: 'media', label: 'Media Library', icon: Upload },
  { key: 'brand', label: 'Brand Kit', icon: Palette },
  { key: 'exports', label: 'Exports', icon: Download },
  { key: 'publish', label: 'Ready to Publish', icon: CalendarDays },
  { key: 'templates', label: 'Templates', icon: LayoutTemplate },
];

export function CapabilityPanel({ caps, usage, onClose }: { caps: Capability[]; usage: Usage | null; onClose: () => void }) {
  const word: Record<string, string> = { working: 'Working', needs_configuration: 'Needs configuration', unavailable: 'Unavailable', planned: 'Planned' };
  return (
    <div className="vs-modal-back" role="dialog" aria-modal="true" aria-label="What Video Studio can do" onClick={onClose}>
      <div className="vs-modal" style={{ maxWidth: 720 }} onClick={e => e.stopPropagation()}>
        <div className="vs-row" style={{ marginBottom: 6 }}>
          <h2 style={{ margin: 0, fontSize: 17 }}>What works today</h2>
          <span className="vs-spacer" />
          <button type="button" className="vs-btn ghost sm" onClick={onClose} aria-label="Close"><X size={16} /></button>
        </div>
        <p className="vs-sub">Every feature is listed with its real state. Nothing marked anything but <b>Working</b> is offered as if it were.</p>
        <div className="vs-caps" data-testid="vs-capabilities">
          {caps.map(c => (
            <div key={c.key} className="vs-cap-row" data-cap={c.key} data-status={c.status}>
              <div><b>{c.label}</b>{c.note && <small>{c.note}</small>}</div>
              <span className={`vs-badge ${c.status}`}>{word[c.status]}</span>
            </div>
          ))}
        </div>
        {usage && (
          <p className="vs-sub" style={{ marginTop: 12 }}>
            This month: {usage.used.sourceMin} of {usage.limits.sourceMin} source minutes, {usage.used.renderMin} of {usage.limits.renderMin} render minutes, {usage.used.storageGb} of {usage.limits.storageGb} GB stored
            {usage.tier === 'trial' ? ' (trial allowance)' : usage.tier === 'ended' ? ' — your trial has ended, so nothing new is processed' : ''}.
          </p>
        )}
      </div>
    </div>
  );
}

function ProjectCardView({ p, onOpen }: { p: ProjectSummary; onOpen: () => void }) {
  const label = p.status === 'ready' ? 'Ready' : p.status === 'failed' ? 'Failed' : p.status === 'draft' ? 'Needs a video' : p.status === 'uploading' ? 'Uploading' : 'Processing';
  const cls = p.status === 'ready' ? 'approved' : p.status === 'failed' ? 'failed' : p.status === 'draft' ? '' : 'processing';
  return (
    <button type="button" className="vs-card vs-proj" onClick={onOpen} data-testid="vs-project-card">
      <div className="vs-poster" style={p.posterUrl ? { backgroundImage: `url("${p.posterUrl}")` } : undefined}>
        <span className={`vs-badge ${cls}`}>{label}</span>
        {p.duration > 0 && <span className="vs-dur">{clock(p.duration)}</span>}
        {!p.posterUrl && <Clapperboard size={34} color="#3b3f48" style={{ position: 'absolute', inset: 0, margin: 'auto' }} />}
      </div>
      <div className="vs-proj-body">
        <b>{p.name}</b>
        <span>{p.shorts ? `${p.shorts} Short${p.shorts === 1 ? '' : 's'}` : 'No Shorts yet'}{p.approved ? ` · ${p.approved} approved` : ''}{p.autopilotProjectName ? ` · ${p.autopilotProjectName}` : ''}</span>
        {p.status === 'failed' && p.error && <span style={{ color: 'var(--bad)' }}>{p.error.slice(0, 120)}</span>}
      </div>
    </button>
  );
}

function Templates({ onUse }: { onUse: (t: Template) => void }) {
  return (
    <div className="vs-grid" data-testid="vs-templates">
      {TEMPLATES.map(t => (
        <div key={t.key} className="vs-card" style={{ display: 'grid', gap: 8, alignContent: 'start' }}>
          <h2><LayoutTemplate size={16} /> {t.name}</h2>
          <p className="vs-sub" style={{ margin: 0 }}>{t.blurb}</p>
          <p style={{ margin: 0, fontSize: 12.5, color: 'var(--muted)', fontStyle: 'italic' }}>“{t.prompt}”</p>
          <div><button type="button" className="vs-btn primary sm" onClick={() => onUse(t)}>Use this template</button></div>
        </div>
      ))}
    </div>
  );
}

export default function VideoStudio() {
  const { id } = useParams();
  const [params, setParams] = useSearchParams();
  const navigate = useNavigate();
  const [tab, setTab] = useState<Tab>((params.get('tab') as Tab) || 'projects');
  const [projects, setProjects] = useState<ProjectSummary[] | null>(null);
  const [error, setError] = useState('');
  const [caps, setCaps] = useState<Capability[]>([]);
  const [usage, setUsage] = useState<Usage | null>(null);
  const [showCaps, setShowCaps] = useState(false);
  const [template, setTemplate] = useState<Template | null>(null);
  const creating = params.get('new') === '1';

  useEffect(() => {
    if (id) return;
    let alive = true;
    void listVideoProjects().then(r => { if (!alive) return; if (r.success) setProjects(r.projects ?? []); else setError(r.error ?? 'Could not load projects.'); });
    void videoCapabilities().then(r => { if (alive && r.success) { setCaps(r.capabilities); setUsage(r.usage); } });
    const t = setInterval(() => void listVideoProjects().then(r => { if (alive && r.success) setProjects(r.projects ?? []); }), 15_000);
    return () => { alive = false; clearInterval(t); };
  }, [id, creating]);

  const missing = useMemo(() => caps.filter(c => ['storage', 'engine', 'transcription'].includes(c.key) && c.status !== 'working'), [caps]);

  if (id) return <div className="vs"><VideoEditor id={id} /></div>;

  const go = (t: Tab) => { setTab(t); setParams(t === 'projects' ? {} : { tab: t }, { replace: true }); };
  const startNew = (t: Template | null = null) => { setTemplate(t); setParams({ new: '1', ...(params.get('project') ? { project: params.get('project')! } : {}) }); };

  return (
    <div className="vs" data-testid="video-studio">
      <div className="vs-head">
        <span className="vs-mark"><Clapperboard size={22} /></span>
        <div className="vs-grow">
          <h1>AI Video Studio</h1>
          <p>Upload a long recording. Get it cleaned, a polished long video, distinct Shorts, captions, PNG thumbnails and titles — saved to your content and your Autopilot projects.</p>
        </div>
        <button type="button" className="vs-btn" onClick={() => setShowCaps(true)}><ShieldCheck size={15} /> What works</button>
        {!creating && <button type="button" className="vs-btn ai" onClick={() => startNew()} data-testid="vs-new"><Plus size={16} /> New video project</button>}
      </div>

      {missing.length > 0 && (
        <div className="vs-note warn" style={{ marginBottom: 14 }} data-testid="vs-missing">
          <ShieldCheck size={16} />
          <span>{missing.map(m => m.label).join(', ')} {missing.length === 1 ? 'needs' : 'need'} setting up before videos can be processed. Projects can be created now; processing waits and says so. <button type="button" className="vs-btn ghost sm" onClick={() => setShowCaps(true)}>Details</button></span>
        </div>
      )}

      {creating ? (
        <NewVideoProject
          template={template}
          autopilotProjectId={params.get('project') ?? ''}
          onCancel={() => { setTemplate(null); setParams({}); }}
          onCreated={pid => navigate(`/video-studio/${pid}`)}
        />
      ) : (
        <>
          <div className="vs-tabs" role="tablist">
            {TABS.map(t => (
              <button key={t.key} type="button" role="tab" className="vs-tab" aria-selected={tab === t.key} onClick={() => go(t.key)} data-tab={t.key}>
                <t.icon size={15} /> {t.label}
                {t.key === 'projects' && projects?.length ? <span className="vs-count">{projects.length}</span> : null}
              </button>
            ))}
          </div>
          {tab === 'projects' && (
            error ? <div className="vs-note bad">{error}</div>
              : !projects ? <p className="vs-sub"><Loader size={14} className="spin" /> Loading…</p>
                : projects.length === 0 ? (
                  <div className="vs-card vs-empty">
                    <Clapperboard size={36} color="#5b46e5" />
                    <b style={{ color: 'var(--ink)', fontSize: 16 }}>Your first video project</b>
                    <span>Upload a podcast, webinar, training or interview, and say what you want from it.</span>
                    <button type="button" className="vs-btn ai" onClick={() => startNew()}><Plus size={16} /> New video project</button>
                  </div>
                ) : (
                  <div className="vs-grid">
                    {projects.map(p => <ProjectCardView key={p.id} p={p} onOpen={() => navigate(`/video-studio/${p.id}`)} />)}
                  </div>
                )
          )}
          {tab === 'media' && <MediaLibrary />}
          {tab === 'brand' && <BrandKit />}
          {tab === 'exports' && <ExportsList />}
          {tab === 'publish' && <ReadyToPublish />}
          {tab === 'templates' && <Templates onUse={t => startNew(t)} />}
        </>
      )}
      {showCaps && <CapabilityPanel caps={caps} usage={usage} onClose={() => setShowCaps(false)} />}
    </div>
  );
}

export { STATUS_LABEL };
