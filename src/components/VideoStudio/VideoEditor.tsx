/**
 * The Video Studio editor.
 *
 * Left: the preview — the editor's proxy played through the *same* edit the
 * render uses (`keepRanges`, `retimeWords`, `cuesOf` from the Worker's own
 * files): cut ranges are skipped, a Short is shown in its frame with its
 * crop, and captions are drawn from the re-timed words. It is a preview of
 * the canonical edit, not a separate simulation, and is labelled as such.
 *
 * Right: the panels — Transcript, Cleanup, Shorts, Captions, Exports (files,
 * thumbnails, metadata), Assistant, Versions.
 *
 * Every change is an operation on the document, saved as a new version
 * against the version it was made on; undo and redo walk the versions. The
 * screen polls while anything is processing and reports only what the
 * server's jobs say.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import {
  ArrowLeft, Undo2, Redo2, Loader, Bot, ShieldCheck, Trash2, RefreshCw, Play, Pause, Upload, AlertCircle, Check, X,
  FileText, Scissors, Film, Captions as CaptionsIcon, Download, MessageSquare, History, Clapperboard,
} from 'lucide-react';
import {
  getVideoProject, videoStatus, editVideo, gotoVersion, renameVideoProject, retryVideo, cancelVideo, deleteVideoProject, renderOutputs,
  loadTranscript, loadWave, uploadVideo, keepRanges, keptLength, retimeWords, cuesOf, toOutput, sentencesOf, clock, isRtl, bytesLabel,
  type ProjectView, type Transcript, type VideoDoc, type Op, type Clip, type UploadProgress, type Capability,
} from '../../services/videoStudio';
import { TranscriptPanel, CleanupPanel, ShortsPanel, CaptionsPanel } from './EditorPanels';
import OutputsPanel from './OutputsPanel';
import AssistantPanel, { type ChatMsg } from './AssistantPanel';
import VersionsPanel from './VersionsPanel';
import { CapabilityPanel } from './VideoStudio';

export type PanelTab = 'transcript' | 'cleanup' | 'shorts' | 'captions' | 'exports' | 'assistant' | 'versions';
const PANELS: { key: PanelTab; label: string; icon: typeof Film }[] = [
  { key: 'transcript', label: 'Transcript', icon: FileText },
  { key: 'cleanup', label: 'Cleanup', icon: Scissors },
  { key: 'shorts', label: 'Shorts', icon: Film },
  { key: 'captions', label: 'Captions', icon: CaptionsIcon },
  { key: 'exports', label: 'Exports', icon: Download },
  { key: 'assistant', label: 'Assistant', icon: MessageSquare },
  { key: 'versions', label: 'Versions', icon: History },
];

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

/* ── The preview ──────────────────────────────────────────────────────────── */

function Preview({ ctx, wave }: { ctx: EditorCtx; wave: Uint8Array | null }) {
  const { view, doc, transcript, duration } = ctx;
  const clip = ctx.activeClip ? doc.clips.find(c => c.id === ctx.activeClip) ?? null : null;
  const videoRef = useRef<HTMLVideoElement>(null);
  const frameRef = useRef<HTMLDivElement>(null);
  const [playing, setPlaying] = useState(false);
  const [frameH, setFrameH] = useState(360);
  const keeps = useMemo(() => keepRanges(duration, doc, clip ? [clip.s, clip.e] : undefined), [duration, doc, clip]);
  const kind = clip ? 'short' as const : 'long' as const;
  const cues = useMemo(() => transcript ? cuesOf(retimeWords(transcript.words, keeps, doc.captionEdits), kind) : [], [transcript, keeps, doc.captionEdits, kind]);
  const style = doc.captions[kind];
  const out = toOutput(ctx.time, keeps);
  const cue = doc.captions.on && out !== null ? cues.find(c => out >= c.s && out < c.e) : undefined;

  /* Skipping what is cut, checked every frame while playing. Keyed to the
     stable seek function, not the whole context — the context changes every
     frame (it carries the time) and would stop the loop it is driving. */
  const report = ctx.seek;
  useEffect(() => {
    const v = videoRef.current;
    if (!v) return;
    let raf = 0;
    const tick = () => {
      const t = v.currentTime;
      const inside = keeps.find(([a, b]) => t >= a - 0.01 && t < b);
      if (!inside) {
        const next = keeps.find(([a]) => a > t);
        if (next) v.currentTime = next[0];
        else { v.pause(); v.currentTime = keeps[0]?.[0] ?? 0; }
      }
      report(-1 - v.currentTime);
      if (!v.paused) raf = requestAnimationFrame(tick);
    };
    const onPlay = () => { setPlaying(true); cancelAnimationFrame(raf); raf = requestAnimationFrame(tick); };
    const onPause = () => { setPlaying(v => v && !videoRef.current?.paused); cancelAnimationFrame(raf); report(-1 - v.currentTime); if (!v.paused) raf = requestAnimationFrame(tick); };
    v.addEventListener('play', onPlay);
    v.addEventListener('pause', onPause);
    v.addEventListener('seeked', onPause);
    if (!v.paused) raf = requestAnimationFrame(tick);
    return () => { cancelAnimationFrame(raf); v.removeEventListener('play', onPlay); v.removeEventListener('pause', onPause); v.removeEventListener('seeked', onPause); };
  }, [keeps, report]);

  /* A Short opens at its own start. */
  useEffect(() => { const v = videoRef.current; if (v && clip) { v.currentTime = keeps[0]?.[0] ?? clip.s; } }, [clip?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    const el = frameRef.current;
    if (!el) return;
    const ro = new ResizeObserver(() => setFrameH(el.clientHeight));
    ro.observe(el);
    return () => ro.disconnect();
  }, [clip?.id]);

  /* Seeks asked for by the panels arrive through ctx.time as a request. */
  useEffect(() => {
    const onSeek = (e: Event) => { const v = videoRef.current; if (v) v.currentTime = (e as CustomEvent<number>).detail; };
    window.addEventListener('vs-seek', onSeek);
    return () => window.removeEventListener('vs-seek', onSeek);
  }, []);

  const aspect = clip ? clip.aspect : doc.long.aspect;
  const ratio = aspect === '9:16' ? 9 / 16 : aspect === '1:1' ? 1 : aspect === '4:5' ? 4 / 5 : aspect === '16:9' ? 16 / 9 : (view.source.probe ? view.source.probe.width / view.source.probe.height : 16 / 9);
  const reframe = clip ? clip.reframe : doc.long.reframe;
  const fit = reframe.mode === 'fit';
  const total = keptLength(keeps);
  const base = kind === 'short' ? (88 / 1920) * frameH : 0.05 * frameH;
  const toggle = () => { const v = videoRef.current; if (!v) return; if (v.paused) void v.play(); else v.pause(); };

  return (
    <div className="vs-card" style={{ padding: 12, display: 'grid', gap: 10 }} data-testid="vs-preview">
      <div className="vs-stage" style={{ padding: clip ? '10px 0' : 0 }}>
        <div ref={frameRef} className={`vs-frame ${fit ? 'fit' : ''}`}
          style={{ aspectRatio: String(ratio), height: clip ? 'min(56vh, 520px)' : undefined, width: clip ? 'auto' : '100%', maxWidth: '100%',
            backgroundImage: fit && view.source.posterUrl ? `url("${view.source.posterUrl}")` : undefined, backgroundSize: 'cover', backgroundPosition: 'center' }}>
          {fit && <div style={{ position: 'absolute', inset: 0, backdropFilter: 'blur(18px) brightness(.75)', WebkitBackdropFilter: 'blur(18px) brightness(.75)' }} />}
          <video ref={videoRef} className={fit ? 'fg' : ''} src={view.source.proxyUrl} poster={view.source.posterUrl || undefined} playsInline preload="metadata"
            style={{ objectFit: fit ? 'contain' : aspect === 'source' ? 'contain' : 'cover', objectPosition: `${reframe.x * 100}% ${reframe.y * 100}%`, position: fit ? 'absolute' : 'relative', inset: 0, height: '100%' }}
            onClick={toggle} data-testid="vs-video" />
          {cue && (
            <div className={`vs-cap ${style.box ? 'box' : ''}`} data-testid="vs-caption" dir={isRtl(cue.text) ? 'rtl' : 'ltr'}
              style={{
                fontSize: Math.max(10, base * style.size), color: style.color,
                ...(style.position === 'top' ? { top: '7%' } : style.position === 'middle' ? { top: '45%' } : { bottom: kind === 'short' ? '20%' : '6%' }),
                textTransform: style.uppercase && !isRtl(cue.text) ? 'uppercase' : 'none',
                textShadow: style.outline || style.shadow ? undefined : 'none',
              }}>
              <span>{cue.text}</span>
            </div>
          )}
        </div>
      </div>
      <div className="vs-ctrls">
        <button type="button" className="vs-btn sm" onClick={toggle} aria-label={playing ? 'Pause' : 'Play'} disabled={!view.source.proxyUrl}>{playing ? <Pause size={14} /> : <Play size={14} />}</button>
        <span className="vs-time">{clock(out ?? 0)} / {clock(total)}</span>
        <span className="vs-badge">{clip ? `Short: ${clip.title.slice(0, 32)}` : 'Long video'} · preview of the edit</span>
        <span className="vs-spacer" />
        {clip && <button type="button" className="vs-btn ghost sm" onClick={() => ctx.setActiveClip(null)}>Back to the long video</button>}
      </div>
      <Wave ctx={ctx} wave={wave} range={clip ? [clip.s, clip.e] : [0, duration]} />
    </div>
  );
}

/** The sound, the cuts, the Shorts and the playhead on one strip; a press seeks. */
function Wave({ ctx, wave, range }: { ctx: EditorCtx; wave: Uint8Array | null; range: [number, number] }) {
  const ref = useRef<HTMLCanvasElement>(null);
  const { doc } = ctx;
  useEffect(() => {
    const c = ref.current;
    if (!c) return;
    const w = c.clientWidth * devicePixelRatio, h = c.clientHeight * devicePixelRatio;
    c.width = w; c.height = h;
    const g = c.getContext('2d')!;
    g.clearRect(0, 0, w, h);
    const [a, b] = range;
    const x = (t: number) => ((t - a) / Math.max(0.001, b - a)) * w;
    if (!ctx.activeClip) for (const cl of doc.clips) { g.fillStyle = 'rgba(91,70,229,.13)'; g.fillRect(x(cl.s), 0, x(cl.e) - x(cl.s), h); }
    for (const cut of doc.cuts) {
      if (cut.e < a || cut.s > b || cut.state === 'rejected') continue;
      g.fillStyle = cut.state === 'approved' ? 'rgba(229,72,77,.35)' : 'rgba(245,165,36,.35)';
      g.fillRect(x(cut.s), 0, Math.max(1, x(cut.e) - x(cut.s)), h);
    }
    for (const p of doc.protects) { g.fillStyle = 'rgba(18,165,148,.3)'; g.fillRect(x(p.s), 0, x(p.e) - x(p.s), h); }
    if (wave) {
      g.fillStyle = '#5b6170';
      const rate = 20;
      for (let px = 0; px < w; px += 2 * devicePixelRatio) {
        const t = a + (px / w) * (b - a);
        const i = Math.floor(t * rate);
        const v = (wave[i] ?? 0) / 255;
        const bar = Math.max(1, v * h * 0.9);
        g.fillRect(px, (h - bar) / 2, 1.2 * devicePixelRatio, bar);
      }
    }
    if (ctx.time >= a && ctx.time <= b) { g.fillStyle = '#17191c'; g.fillRect(x(ctx.time) - devicePixelRatio, 0, 2 * devicePixelRatio, h); }
  }, [wave, doc, range, ctx.time, ctx.activeClip]);
  const seekAt = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const r = e.currentTarget.getBoundingClientRect();
    ctx.seek(range[0] + ((e.clientX - r.left) / r.width) * (range[1] - range[0]));
  };
  return (
    <div className="vs-col" style={{ gap: 4 }}>
      <canvas ref={ref} className="vs-wave" onPointerDown={seekAt} aria-label="Timeline: press to move the playhead" data-testid="vs-wave" />
      <div className="vs-legend"><span><i style={{ background: 'rgba(229,72,77,.6)' }} />Cut</span><span><i style={{ background: 'rgba(245,165,36,.7)' }} />Suggested</span><span><i style={{ background: 'rgba(18,165,148,.6)' }} />Protected</span>{!ctx.activeClip && <span><i style={{ background: 'rgba(91,70,229,.35)' }} />Shorts</span>}</div>
    </div>
  );
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
  const [tab, setTabState] = useState<PanelTab>((params.get('tab') as PanelTab) || 'transcript');
  const [time, setTime] = useState(0);
  const [selection, setSelection] = useState<{ i0: number; i1: number } | null>(null);
  const [activeClip, setActiveClip] = useState<string | null>(null);
  const [messages, setMessages] = useState<ChatMsg[]>([]);
  const [busy, setBusy] = useState(false);
  const [caps, setCaps] = useState<Capability[] | null>(null);
  const [showCaps, setShowCaps] = useState(false);
  const [name, setName] = useState('');
  const transcriptUrlSeen = useRef('');
  const prev = useRef<ProjectView | null>(null);
  const versionRef = useRef(0);
  versionRef.current = version;

  const say = useCallback((m: ChatMsg) => setMessages(ms => [...ms, m].slice(-80)), []);
  const setTab = useCallback((t: PanelTab) => { setTabState(t); setParams(t === 'transcript' ? {} : { tab: t }, { replace: true }); }, [setParams]);

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

  if (error) return <div className="vs-note bad" role="alert"><AlertCircle size={16} /> {error} <Link to="/video-studio">Back to Video Studio</Link></div>;
  if (!view || !doc || !ctx) return <p className="vs-sub"><Loader size={14} className="spin" /> Opening the project…</p>;

  const st = view.project.status;
  const hasSource = !!view.source.probe || st === 'processing';
  const stale = view.outputs.filter(o => o.stale);
  const sentences = transcript ? sentencesOf(transcript.words) : [];

  return (
    <div data-testid="vs-editor" data-status={st}>
      <div className="vs-head">
        <Link to="/video-studio" className="vs-btn ghost sm" aria-label="Back to Video Studio"><ArrowLeft size={16} /></Link>
        <div className="vs-grow">
          <input className="vs-input" aria-label="Project name" value={name} onChange={e => setName(e.target.value)}
            onBlur={() => { if (name.trim() && name !== view.project.name) void renameVideoProject(id, name.trim()); }}
            style={{ border: 0, padding: '2px 0', fontSize: 21, fontWeight: 800, letterSpacing: '-.02em', background: 'transparent' }} />
          <p style={{ margin: 0, color: 'var(--muted)', fontSize: 13 }}>
            {view.source.name || 'No video yet'}{view.source.probe ? ` · ${clock(view.source.probe.duration)} · ${view.source.probe.width}×${view.source.probe.height}` : ''}{view.project.language ? ` · ${view.project.language.toUpperCase()}` : ''}
            {view.project.autopilotProjectId && <> · <Link className="vs-aplink" to={`/autopilot?project=${view.project.autopilotProjectId}&tab=assets`}><Bot size={12} /> {view.project.autopilotProjectName || 'AI Autopilot project'}</Link></>}
          </p>
        </div>
        <button type="button" className="vs-btn sm" disabled={version <= 1} onClick={() => void go(version - 1)} aria-label="Undo" title="Undo (Ctrl+Z)"><Undo2 size={14} /></button>
        <button type="button" className="vs-btn sm" disabled={version >= view.maxVersion} onClick={() => void go(version + 1)} aria-label="Redo" title="Redo (Ctrl+Shift+Z)"><Redo2 size={14} /></button>
        {stale.length > 0 && (
          <button type="button" className="vs-btn ai sm" data-testid="vs-render-changes" onClick={() => void renderOutputs(id, stale.map(o => o.id)).then(r => { if (!r.success) say({ who: 'ai', text: r.error ?? 'Could not render.' }); void refresh(); })}>
            <Clapperboard size={14} /> Render {stale.length} change{stale.length === 1 ? '' : 's'}
          </button>
        )}
        <button type="button" className="vs-btn sm" onClick={() => setShowCaps(true)}><ShieldCheck size={14} /> What works</button>
        <button type="button" className="vs-btn ghost sm danger" aria-label="Delete project" onClick={() => {
          if (window.confirm('Delete this project, its source video and everything made from it? This cannot be undone.')) void deleteVideoProject(id).then(() => navigate('/video-studio'));
        }}><Trash2 size={14} /></button>
        {busy && <Loader size={14} className="spin" />}
      </div>

      <div className="vs-ed">
        <div className="vs-ed-left">
          {!hasSource && (st === 'draft' || st === 'uploading') ? <ResumeUpload view={view} onDone={() => void refresh()} />
            : view.source.proxyUrl ? <Preview ctx={ctx} wave={wave} /> : null}
          {(st !== 'ready' || view.jobs.some(j => j.state === 'queued' || j.state === 'running' || j.state === 'failed')) && hasSource && (
            <StagesCard view={view} onRetry={() => void retryVideo(id).then(refresh)} onCancel={() => void cancelVideo(id).then(refresh)} />
          )}
        </div>
        <div className="vs-card vs-panel">
          <div className="vs-ptabs" role="tablist">
            {PANELS.map(p => (
              <button key={p.key} type="button" role="tab" className="vs-ptab" aria-selected={tab === p.key} onClick={() => setTab(p.key)} data-panel={p.key}>
                <p.icon size={14} /> {p.label}
                {p.key === 'cleanup' && doc.cuts.some(c => c.state === 'proposed') ? <span className="vs-count" style={{ fontSize: 11, background: '#fff1d6', color: '#b25e09', borderRadius: 99, padding: '0 6px' }}>{doc.cuts.filter(c => c.state === 'proposed').length}</span> : null}
                {p.key === 'shorts' && doc.clips.length ? <span className="vs-count" style={{ fontSize: 11, background: '#efedfd', color: '#5b46e5', borderRadius: 99, padding: '0 6px' }}>{doc.clips.length}</span> : null}
              </button>
            ))}
          </div>
          {tab === 'transcript' && <TranscriptPanel ctx={ctx} sentences={sentences} />}
          {tab === 'cleanup' && <CleanupPanel ctx={ctx} />}
          {tab === 'shorts' && <ShortsPanel ctx={ctx} sentences={sentences} />}
          {tab === 'captions' && <CaptionsPanel ctx={ctx} />}
          {tab === 'exports' && <OutputsPanel ctx={ctx} />}
          {tab === 'assistant' && <AssistantPanel ctx={ctx} messages={messages} />}
          {tab === 'versions' && <VersionsPanel ctx={ctx} onGo={v => void go(v)} />}
        </div>
      </div>
      {showCaps && caps && <CapabilityPanel caps={caps} usage={null} onClose={() => setShowCaps(false)} />}
    </div>
  );
}

export type { Clip };
