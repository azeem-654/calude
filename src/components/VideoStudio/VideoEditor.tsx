/**
 * The Video Studio editor, laid out after the owner's concept:
 *
 *   top      back · name · undo/redo · render changes · history · what works
 *   left     Media (the long video and every Short, searchable) · Transcript
 *            · Cleanup · Shorts
 *   centre   the player — the proxy played through the canonical edit
 *   right    the inspector (Video · Audio · Music · Captions · Export ·
 *            Reuse) with the AI assistant under it
 *   bottom   the timeline: picture, text, Shorts, sound, music
 *
 * Every change is an operation on the document, saved as a new version
 * against the version it was made on; undo and redo walk the versions. The
 * screen polls while anything is processing and reports only what the
 * server's jobs say.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import {
  ArrowLeft, Undo2, Redo2, Loader, Bot, ShieldCheck, Trash2, RefreshCw, Upload, AlertCircle, Check, X, Search, Plus, History, Music2,
  FileText, Scissors, Film, Clapperboard, Images,
} from 'lucide-react';
import {
  getVideoProject, videoStatus, editVideo, gotoVersion, renameVideoProject, retryVideo, cancelVideo, deleteVideoProject, renderOutputs,
  loadTranscript, loadWave, uploadVideo, sentencesOf, clock, bytesLabel, keepRanges, keptLength, STATUS_LABEL,
  type ProjectView, type Transcript, type VideoDoc, type Op, type Clip, type UploadProgress, type Capability,
} from '../../services/videoStudio';
import { TranscriptPanel, CleanupPanel, ShortsPanel, CaptionsPanel } from './EditorPanels';
import { VideoPanel, AudioPanel, MusicPanel } from './InspectorPanels';
import OutputsPanel from './OutputsPanel';
import ReusePanel from './ReusePanel';
import AssistantPanel, { type ChatMsg } from './AssistantPanel';
import VersionsPanel from './VersionsPanel';
import Player from './Player';
import Timeline from './Timeline';
import { CapabilityPanel } from './VideoStudio';

type LeftTab = 'media' | 'transcript' | 'cleanup' | 'shorts';
type RightTab = 'video' | 'audio' | 'music' | 'captions' | 'exports' | 'reuse';
export type PanelTab = LeftTab | RightTab | 'assistant' | 'versions';
const LEFT: { key: LeftTab; label: string; icon: typeof Film }[] = [
  { key: 'media', label: 'Media', icon: Images },
  { key: 'transcript', label: 'Transcript', icon: FileText },
  { key: 'cleanup', label: 'Cleanup', icon: Scissors },
  { key: 'shorts', label: 'Shorts', icon: Film },
];
const RIGHT: { key: RightTab; label: string }[] = [
  { key: 'video', label: 'Video' }, { key: 'audio', label: 'Audio' }, { key: 'music', label: 'Music' },
  { key: 'captions', label: 'Captions' }, { key: 'exports', label: 'Export' }, { key: 'reuse', label: 'Reuse' },
];
const isLeft = (t: string): t is LeftTab => LEFT.some(x => x.key === t);
const isRight = (t: string): t is RightTab => RIGHT.some(x => x.key === t);

export interface EditorCtx {
  view: ProjectView;
  doc: VideoDoc;
  version: number;
  transcript: Transcript | null;
  duration: number;
  apply: (ops: Op[], note: string) => Promise<boolean>;
  seek: (t: number) => void;
  time: number;
  selection: { i0: number; i1: number } | null;
  setSelection: (s: { i0: number; i1: number } | null) => void;
  activeClip: string | null;
  setActiveClip: (id: string | null) => void;
  refresh: () => Promise<void>;
  setTab: (t: PanelTab) => void;
  say: (m: ChatMsg) => void;
}

/* ── Stages ───────────────────────────────────────────────────────────────── */

export function StagesCard({ view, onRetry, onCancel }: { view: ProjectView; onRetry: () => void; onCancel: () => void }) {
  const st = view.project.status;
  return (
    <div className="vs-card" data-testid="vs-stages">
      <div className="vs-row" style={{ marginBottom: 10 }}>
        <h2 style={{ margin: 0 }}>{st === 'ready' ? 'Done' : st === 'failed' ? 'Stopped' : 'Working on it'}</h2>
        <span className="vs-spacer" />
        {st === 'failed' && <button type="button" className="vs-btn sm" onClick={onRetry}><RefreshCw size={13} /> Try again</button>}
        {st === 'processing' && <button type="button" className="vs-btn ghost sm" onClick={onCancel}>Cancel</button>}
      </div>
      <div className="vs-stages">
        {view.stages.map(s => (
          <div key={s.key} className={`vs-st ${s.state}`} data-stage={s.key} data-state={s.state}>
            <span className="dot">{s.state === 'done' ? <Check size={12} /> : s.state === 'failed' ? <X size={12} /> : null}</span>
            <span>{s.label}</span>
            <span style={{ fontSize: 12, color: 'var(--muted)', fontVariantNumeric: 'tabular-nums' }}>{s.state === 'active' ? (s.pct !== null ? `${s.pct}%` : '…') : s.state === 'skipped' ? 'not needed' : ''}</span>
            {s.state === 'active' && <div className={`vs-bar ${s.pct === null ? 'indet' : ''}`} style={{ gridColumn: '2 / 4' }}><i style={{ width: `${s.pct ?? 35}%` }} /></div>}
            {s.note && (s.state === 'active' || s.state === 'failed' || s.state === 'waiting') && <small>{s.note}</small>}
          </div>
        ))}
      </div>
      {view.project.stageNote && <div className="vs-note" style={{ marginTop: 10 }}><AlertCircle size={15} /> {view.project.stageNote}</div>}
      {st === 'failed' && view.project.error && <div className="vs-note bad" style={{ marginTop: 10 }} role="alert"><AlertCircle size={15} /> {view.project.error}</div>}
    </div>
  );
}

/* ── Finishing an upload that stopped ─────────────────────────────────────── */

function ResumeUpload({ view, onDone }: { view: ProjectView; onDone: () => void }) {
  const [p, setP] = useState<UploadProgress | null>(null);
  const [err, setErr] = useState('');
  const go = async (f: File | undefined) => {
    if (!f) return;
    setErr('');
    const r = await uploadVideo(view.project.id, f, setP);
    if (r.ok) onDone(); else setErr(r.error);
  };
  const pct = p ? Math.round((p.sent / Math.max(1, p.total)) * 100) : 0;
  return (
    <div className="vs-card vs-col" data-testid="vs-resume">
      <h2><Upload size={16} /> {view.upload ? 'Finish the upload' : 'Add the video'}</h2>
      <p className="vs-sub">{view.upload ? `“${view.upload.name}” stopped at ${view.upload.done.length} of ${Math.ceil(view.upload.bytes / view.upload.partSize)} parts. Choose the same file and it carries on from there.` : 'This project has no video yet.'}</p>
      <label className="vs-btn primary" style={{ justifySelf: 'start' }}>
        <Upload size={14} /> Choose the file
        <input type="file" hidden accept="video/*,.mkv" onChange={e => void go(e.target.files?.[0])} data-testid="vs-resume-file" />
      </label>
      {p && <><div className="vs-bar"><i style={{ width: `${pct}%` }} /></div><span className="vs-sub" style={{ margin: 0 }}>{bytesLabel(p.sent)} of {bytesLabel(p.total)}{p.resumed ? ' — resumed' : ''}</span></>}
      {err && <div className="vs-note bad">{err}</div>}
    </div>
  );
}

/* ── Media: the long video and every Short ────────────────────────────────── */

function MediaPanel({ ctx }: { ctx: EditorCtx }) {
  const { view, doc, duration } = ctx;
  const [q, setQ] = useState('');
  const strip = view.source.filmstrip;
  const frameAt = (t: number): React.CSSProperties => {
    if (!strip) return view.source.posterUrl ? { backgroundImage: `url("${view.source.posterUrl}")` } : {};
    const k = Math.min(strip.tiles - 1, Math.max(0, Math.floor(t / strip.every)));
    return { backgroundImage: `url("${strip.url}")`, backgroundSize: `${strip.tiles * 100}% 100%`, backgroundPosition: `${strip.tiles > 1 ? (k / (strip.tiles - 1)) * 100 : 0}% 0` };
  };
  const longOut = view.outputs.find(o => o.kind === 'long');
  const match = (s: string) => !q.trim() || s.toLowerCase().includes(q.trim().toLowerCase());
  const badge = (id?: string) => {
    const o = view.outputs.find(x => x.id === id);
    if (!o) return null;
    const job = view.jobs.find(j => j.target === o.id && j.kind === 'render' && (j.state === 'queued' || j.state === 'running'));
    return <span className={`vs-badge ${o.status}`}>{job ? (job.progress !== null ? `${Math.round(job.progress)}%` : 'Rendering') : o.stale ? 'Edited' : STATUS_LABEL[o.status]}</span>;
  };
  return (
    <div className="vs-col" style={{ gap: 8 }} data-testid="vs-media">
      <div style={{ position: 'relative' }}>
        <Search size={14} style={{ position: 'absolute', left: 10, top: 11, color: '#8a8d99' }} />
        <input className="vs-input" style={{ paddingLeft: 30 }} placeholder="Search media" value={q} onChange={e => setQ(e.target.value)} aria-label="Search media" />
      </div>
      <div className="vs-media">
        {match(`long video ${view.source.name}`) && (
          <button type="button" className="vs-media-item" aria-pressed={!ctx.activeClip} onClick={() => ctx.setActiveClip(null)} data-media="long">
            <div className="th" style={{ ...frameAt(Math.min(duration * 0.1, 30)), backgroundSize: strip ? `${strip.tiles * 100}% 100%` : 'cover' }}><span>{clock(keptLength(keepRanges(duration, doc)))}</span></div>
            <div style={{ minWidth: 0 }}><b>Long video</b><small>{view.source.name || 'The recording'}</small><div style={{ marginTop: 3 }}>{badge(longOut?.id)}</div></div>
          </button>
        )}
        {doc.clips.map((c, n) => {
          const o = view.outputs.find(x => x.kind === 'short' && x.clipId === c.id);
          const th = o?.thumbs[o.chosenThumb] ?? o?.thumbs[0];
          if (!match(`short ${n + 1} ${c.title} ${c.topic}`)) return null;
          return (
            <button key={c.id} type="button" className="vs-media-item" aria-pressed={ctx.activeClip === c.id} onClick={() => { ctx.setActiveClip(c.id); ctx.seek(c.s); }} data-media={c.id}>
              <div className="th" style={th ? { backgroundImage: `url("${th.url}")` } : frameAt(c.s + 1)}><span>{clock(keptLength(keepRanges(duration, doc, [c.s, c.e])))}</span></div>
              <div style={{ minWidth: 0 }}><b title={c.title}>Short {n + 1} · {c.title}</b><small>{c.aspect} · from {clock(c.s)}</small><div style={{ marginTop: 3 }}>{badge(o?.id)}</div></div>
            </button>
          );
        })}
        {doc.music && match(`music ${doc.music.title}`) && (
          <button type="button" className="vs-media-item" onClick={() => ctx.setTab('music')} data-media="music">
            <div className="th" style={{ display: 'grid', placeItems: 'center', background: 'linear-gradient(135deg, rgba(45,212,191,.35), rgba(34,211,238,.2))' }}><Music2 size={20} /></div>
            <div style={{ minWidth: 0 }}><b>{doc.music.title}</b><small>{doc.music.license}</small></div>
          </button>
        )}
      </div>
      {!doc.clips.length && <p className="vs-kbd" style={{ margin: 0 }}>{ctx.transcript ? 'No Shorts yet — mark a stretch on the timeline, or ask the assistant.' : 'Shorts appear here once they are chosen.'}</p>}
      <Link to="/video-studio?new=1" className="vs-btn sm" style={{ justifySelf: 'start' }}><Plus size={13} /> New video project</Link>
    </div>
  );
}

/* ── The editor ───────────────────────────────────────────────────────────── */

export default function VideoEditor({ id }: { id: string }) {
  const navigate = useNavigate();
  const [params, setParams] = useSearchParams();
  const [view, setView] = useState<ProjectView | null>(null);
  const [doc, setDoc] = useState<VideoDoc | null>(null);
  const [version, setVersion] = useState(0);
  const [transcript, setTranscript] = useState<Transcript | null>(null);
  const [wave, setWave] = useState<Uint8Array | null>(null);
  const [error, setError] = useState('');
  const asked = params.get('tab') ?? '';
  const [left, setLeft] = useState<LeftTab>(isLeft(asked) ? asked : 'media');
  const [right, setRight] = useState<RightTab>(isRight(asked) ? asked : 'video');
  const [time, setTime] = useState(0);
  const [selection, setSelection] = useState<{ i0: number; i1: number } | null>(null);
  const [activeClip, setActiveClip] = useState<string | null>(null);
  const [messages, setMessages] = useState<ChatMsg[]>([]);
  const [busy, setBusy] = useState(false);
  const [caps, setCaps] = useState<Capability[] | null>(null);
  const [showCaps, setShowCaps] = useState(false);
  const [showHistory, setShowHistory] = useState(asked === 'versions');
  const [name, setName] = useState('');
  const transcriptUrlSeen = useRef('');
  const prev = useRef<ProjectView | null>(null);
  const versionRef = useRef(0);
  const commandRef = useRef<HTMLInputElement>(null);
  versionRef.current = version;

  const say = useCallback((m: ChatMsg) => setMessages(ms => [...ms, m].slice(-80)), []);
  const setTab = useCallback((t: PanelTab) => {
    if (isLeft(t)) setLeft(t);
    else if (isRight(t)) setRight(t);
    else if (t === 'versions') setShowHistory(true);
    else if (t === 'assistant') { commandRef.current?.focus(); return; }
    setParams(t === 'media' || t === 'video' ? {} : { tab: t }, { replace: true });
  }, [setParams]);

  /* What the jobs did since the last look, said in the assistant — only real events. */
  const narrate = useCallback((before: ProjectView | null, now: ProjectView, d: VideoDoc | null) => {
    if (!before) return;
    const was = (k: string) => before.stages.find(s => s.key === k)?.state;
    const is = (k: string) => now.stages.find(s => s.key === k)?.state;
    if (was('prepare') !== 'done' && is('prepare') === 'done') say({ who: 'sys', text: 'Your video is prepared — transcribing it now.' });
    if (was('transcribe') !== 'done' && is('transcribe') === 'done') say({ who: 'sys', text: 'Your transcript is ready.' });
    if (was('analyze') !== 'done' && is('analyze') === 'done' && d) {
      say({ who: 'sys', text: `I found ${d.clips.length} possible clip${d.clips.length === 1 ? '' : 's'} and ${d.cuts.filter(c => c.state === 'proposed').length} cleanup suggestions to review.` });
      if (d.clips.length) say({ who: 'sys', text: `I'm creating ${d.clips.length} Short${d.clips.length === 1 ? '' : 's'}.` });
    }
    now.outputs.forEach(o => {
      const b = before.outputs.find(x => x.id === o.id);
      if (b && b.status === 'processing' && o.status === 'needs_review') {
        const n = now.outputs.filter(x => x.kind === 'short').findIndex(x => x.id === o.id) + 1;
        say({ who: 'sys', text: o.kind === 'long' ? 'The cleaned long video is ready to review.' : `Short ${n} is ready.` });
      }
      if (b && b.thumbs.length === 0 && o.thumbs.length > 0) say({ who: 'sys', text: `Thumbnails for “${o.title.slice(0, 40)}” are ready — ${o.thumbs.filter(t => t.verified).length} checked PNGs.` });
    });
    if (!before.extras?.repurposed && now.extras?.repurposed) say({ who: 'sys', text: `Drafts written from this recording: ${now.extras.repurposed.links.map(l => l.label).join(', ')}.` });
    if (!before.extras?.quiz && now.extras?.quiz) say({ who: 'sys', text: `A ${now.extras.quiz.questions.length}-question quiz is ready (Reuse tab).` });
    if (before.project.status !== 'failed' && now.project.status === 'failed') say({ who: 'sys', text: `Processing stopped: ${now.project.error}` });
  }, [say]);

  const absorb = useCallback(async (v: ProjectView) => {
    let d = doc;
    if (v.doc) { d = v.doc; setDoc(v.doc); setVersion(v.docVersion); }
    narrate(prev.current, v, d);
    prev.current = v;
    setView(v);
    if (v.capabilities) setCaps(v.capabilities);
    if (v.transcriptUrl && v.transcriptUrl !== transcriptUrlSeen.current && (!transcriptUrlSeen.current || !transcript)) {
      transcriptUrlSeen.current = v.transcriptUrl;
      const t = await loadTranscript(v.transcriptUrl);
      if (t) setTranscript(t);
    }
    if (v.source.waveUrl && !wave) void loadWave(v.source.waveUrl).then(w => { if (w) setWave(w); });
  }, [doc, narrate, transcript, wave]);

  const load = useCallback(async () => {
    const r = await getVideoProject(id);
    if (!r.success) { setError(r.error ?? 'Could not open the project.'); return; }
    setName(r.project.name);
    await absorb(r);
  }, [id, absorb]);

  useEffect(() => { void load(); }, [id]); // eslint-disable-line react-hooks/exhaustive-deps

  /* Poll while anything is moving; slow down when nothing is. */
  const moving = !!view && (view.project.status === 'processing' || view.project.status === 'uploading' || view.jobs.some(j => j.state === 'queued' || j.state === 'running'));
  useEffect(() => {
    if (!view) return;
    const t = setTimeout(async () => {
      const r = await videoStatus(id, versionRef.current);
      if (r.success) await absorb(r);
    }, moving ? 2500 : 15_000);
    return () => clearTimeout(t);
  }, [view, moving, id, absorb]);

  const refresh = useCallback(async () => { const r = await videoStatus(id, -1); if (r.success) await absorb(r); }, [id, absorb]);

  const apply = useCallback(async (ops: Op[], note: string) => {
    if (!ops.length) return false;
    setBusy(true);
    const r = await editVideo(id, versionRef.current, ops, note);
    setBusy(false);
    if (r.success) {
      setDoc(r.doc); setVersion(r.docVersion);
      if (r.refused?.length) say({ who: 'ai', text: `Not done: ${r.refused.join('; ')}.` });
      if (r.note) say({ who: 'ai', text: r.note });
      void refresh();
      return true;
    }
    if (r.conflict && r.doc) { setDoc(r.doc as VideoDoc); setVersion(Number((r as { docVersion?: number }).docVersion) || versionRef.current); }
    say({ who: 'ai', text: r.error ?? 'That change could not be saved.' });
    return false;
  }, [id, refresh, say]);

  const go = useCallback(async (v: number) => {
    if (!view || v < 1 || v > view.maxVersion) return;
    const r = await gotoVersion(id, v);
    if (r.success) { setDoc(r.doc); setVersion(r.docVersion); void refresh(); }
  }, [id, view, refresh]);

  const seek = useCallback((t: number) => {
    /* Negative numbers are the player telling us where it is (−1 − time);
       positive ones are a request to move it. */
    if (t < 0) { setTime(-1 - t); return; }
    setTime(t);
    window.dispatchEvent(new CustomEvent('vs-seek', { detail: t }));
  }, []);

  /* Undo / redo from the keyboard, outside text boxes. */
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement)?.tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return;
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'z') { e.preventDefault(); void go(e.shiftKey ? version + 1 : version - 1); }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [go, version]);

  const duration = view?.source.probe?.duration ?? transcript?.duration ?? 0;
  const ctx = useMemo<EditorCtx | null>(() => view && doc ? {
    view, doc, version, transcript, duration, apply, seek, time, selection, setSelection, activeClip, setActiveClip, refresh, setTab, say,
  } : null, [view, doc, version, transcript, duration, apply, seek, time, selection, activeClip, refresh, setTab, say]);
  const sentences = useMemo(() => transcript ? sentencesOf(transcript.words) : [], [transcript]);

  if (error) return <div className="vs-note bad" role="alert"><AlertCircle size={16} /> {error} <Link to="/video-studio">Back to Video Studio</Link></div>;
  if (!view || !doc || !ctx) return <p className="vs-sub"><Loader size={14} className="spin" /> Opening the project…</p>;

  const st = view.project.status;
  const hasSource = !!view.source.probe || st === 'processing';
  const stale = view.outputs.filter(o => o.stale);
  const working = st !== 'ready' || view.jobs.some(j => j.state === 'queued' || j.state === 'running' || j.state === 'failed');
  const proposed = doc.cuts.filter(c => c.state === 'proposed').length;

  return (
    <div className="vse" data-testid="vs-editor" data-status={st}>
      <div className="vse-top">
        <Link to="/video-studio" className="vs-btn ghost sm" aria-label="Back to Video Studio"><ArrowLeft size={16} /></Link>
        <input className="vse-name" aria-label="Project name" value={name} onChange={e => setName(e.target.value)}
          onBlur={() => { if (name.trim() && name !== view.project.name) void renameVideoProject(id, name.trim()); }} />
        <span className="vs-kbd vse-src">
          {view.source.probe ? `${clock(view.source.probe.duration)} · ${view.source.probe.width}×${view.source.probe.height}` : view.source.name || 'No video yet'}{view.project.language ? ` · ${view.project.language.toUpperCase()}` : ''}
        </span>
        {view.project.autopilotProjectId && <Link className="vs-aplink vs-kbd" to={`/autopilot?project=${view.project.autopilotProjectId}&tab=assets`}><Bot size={12} /> {view.project.autopilotProjectName || 'AI Autopilot project'}</Link>}
        <span className="vs-spacer" />
        {busy && <Loader size={14} className="spin" />}
        <button type="button" className="vs-btn sm" disabled={version <= 1} onClick={() => void go(version - 1)} aria-label="Undo" title="Undo (Ctrl+Z)"><Undo2 size={14} /></button>
        <button type="button" className="vs-btn sm" disabled={version >= view.maxVersion} onClick={() => void go(version + 1)} aria-label="Redo" title="Redo (Ctrl+Shift+Z)"><Redo2 size={14} /></button>
        <button type="button" className="vs-btn sm" onClick={() => setShowHistory(true)} aria-label="Version history"><History size={14} /></button>
        <button type="button" className="vs-btn sm" onClick={() => setShowCaps(true)}><ShieldCheck size={14} /> What works</button>
        {stale.length > 0 && (
          <button type="button" className="vs-btn ai sm" data-testid="vs-render-changes" onClick={() => void renderOutputs(id, stale.map(o => o.id)).then(r => { if (!r.success) say({ who: 'ai', text: r.error ?? 'Could not render.' }); void refresh(); })}>
            <Clapperboard size={14} /> Render {stale.length} change{stale.length === 1 ? '' : 's'}
          </button>
        )}
        <button type="button" className="vs-btn ghost sm danger" aria-label="Delete project" onClick={() => {
          if (window.confirm('Delete this project, its source video and everything made from it? This cannot be undone.')) void deleteVideoProject(id).then(() => navigate('/video-studio'));
        }}><Trash2 size={14} /></button>
      </div>

      <aside className="vse-left">
        <div className="vse-pane">
          <div className="vs-ptabs" role="tablist" aria-label="Project">
            {LEFT.map(p => (
              <button key={p.key} type="button" role="tab" className="vs-ptab" aria-selected={left === p.key} onClick={() => setTab(p.key)} data-panel={p.key} title={p.label}>
                <p.icon size={14} /> <span className="lbl">{p.label}</span>
                {p.key === 'cleanup' && proposed ? <span className="vs-count warn">{proposed}</span> : null}
                {p.key === 'shorts' && doc.clips.length ? <span className="vs-count">{doc.clips.length}</span> : null}
              </button>
            ))}
          </div>
          <div className="vse-scroll">
            {left === 'media' && <MediaPanel ctx={ctx} />}
            {left === 'transcript' && <TranscriptPanel ctx={ctx} sentences={sentences} />}
            {left === 'cleanup' && <CleanupPanel ctx={ctx} />}
            {left === 'shorts' && <ShortsPanel ctx={ctx} sentences={sentences} />}
          </div>
        </div>
      </aside>

      <main className="vse-stage">
        {!hasSource && (st === 'draft' || st === 'uploading') ? <ResumeUpload view={view} onDone={() => void refresh()} />
          : view.source.proxyUrl ? <Player ctx={ctx} /> : (
            <div className="vse-player"><div className="vse-screen" style={{ minHeight: 280 }}><span className="vs-kbd"><Loader size={14} className="spin" /> The preview appears when the video is prepared.</span></div></div>
          )}
        {working && hasSource && <StagesCard view={view} onRetry={() => void retryVideo(id).then(refresh)} onCancel={() => void cancelVideo(id).then(refresh)} />}
      </main>

      <aside className="vse-right">
        <div className="vse-pane inspector">
          <div className="vs-ptabs" role="tablist" aria-label="Inspector">
            {RIGHT.map(p => (
              <button key={p.key} type="button" role="tab" className="vs-ptab" aria-selected={right === p.key} onClick={() => setTab(p.key)} data-panel={p.key}>
                {p.label}{p.key === 'exports' && stale.length ? <span className="vs-count warn">{stale.length}</span> : null}
              </button>
            ))}
          </div>
          <div className="vse-scroll">
            {right === 'video' && <VideoPanel ctx={ctx} />}
            {right === 'audio' && <AudioPanel ctx={ctx} />}
            {right === 'music' && <MusicPanel ctx={ctx} />}
            {right === 'captions' && <CaptionsPanel ctx={ctx} />}
            {right === 'exports' && <OutputsPanel ctx={ctx} />}
            {right === 'reuse' && <ReusePanel ctx={ctx} />}
          </div>
        </div>
        <AssistantPanel ctx={ctx} messages={messages} inputRef={commandRef} />
      </aside>

      {hasSource && duration > 0 && <section className="vse-time"><Timeline ctx={ctx} wave={wave} /></section>}

      {showCaps && caps && <CapabilityPanel caps={caps} usage={null} onClose={() => setShowCaps(false)} />}
      {showHistory && (
        <div className="vs-modal-back" role="dialog" aria-modal="true" aria-label="Version history" onClick={() => setShowHistory(false)}>
          <div className="vs-modal" style={{ maxWidth: 640 }} onClick={e => e.stopPropagation()}>
            <div className="vs-row" style={{ marginBottom: 8 }}><h2 style={{ margin: 0, fontSize: 17 }}><History size={16} /> Version history</h2><span className="vs-spacer" /><button type="button" className="vs-btn ghost sm" onClick={() => setShowHistory(false)} aria-label="Close"><X size={15} /></button></div>
            <VersionsPanel ctx={ctx} onGo={v => void go(v)} />
          </div>
        </div>
      )}
    </div>
  );
}

export type { Clip };
