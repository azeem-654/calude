/**
 * The Video Studio editor, laid out after Descript (the owner's reference):
 *
 *   top        home · undo/redo · Video Studio / <project> / <composition ▾>
 *              · history · keys · what works · render · Export
 *   left       the script: the composition's transcript — the main way to
 *              edit — with its speaker and a frame at each scene's start
 *   centre     the preview, with Layout and Background under it
 *   right      the open panel beside an icon rail: Project · AI Tools ·
 *              Properties · Elements · Captions · Media
 *   transport  back/on · timecode · Record · play · speed · Split · zoom ·
 *              selection tool
 *   bottom     the timeline: scenes, captions, phrases and gaps over the
 *              waveform, Shorts, music
 *   below      your videos (the outputs board), then publishing
 *
 * A composition is the long video or one Short made from it; the dropdown
 * switches between them on the same screen (the script, the preview and the
 * timeline all follow), and "New short composition" adds one.
 *
 * Every change is an operation on the document, saved as a new version
 * against the version it was made on; undo and redo walk the versions. The
 * screen polls while anything is processing and reports only what the
 * server's jobs say. At phone width the panels stack and the rail becomes a
 * bar along the bottom of the screen.
 */
import { askConfirm } from '../shared/ConfirmDialog';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import {
  Home, Undo2, Redo2, Loader, Bot, ShieldCheck, Trash2, RefreshCw, Upload, AlertCircle, Check, X, Search, Plus, History, Music2, ChevronDown,
  FolderOpen, Sparkles, SlidersHorizontal, Shapes, Captions as CaptionsIcon, Images, Clapperboard, Download, Keyboard, LayoutGrid, PaintBucket, Film,
} from 'lucide-react';
import {
  getVideoProject, videoStatus, editVideo, gotoVersion, renameVideoProject, retryVideo, cancelVideo, deleteVideoProject, renderOutputs,
  loadTranscript, loadWave, loadTrack, uploadVideo, sentencesOf, clock, bytesLabel, keepRanges, keptLength, STATUS_LABEL,
  type ProjectView, type Transcript, type VideoDoc, type Op, type Clip, type UploadProgress, type Capability, type TrackFile,
} from '../../services/videoStudio';
import { TranscriptPanel, CleanupPanel, ShortsPanel, CaptionsPanel } from './EditorPanels';
import { VideoPanel, AudioPanel, MusicPanel } from './InspectorPanels';
import OutputsBoard from './OutputsBoard';
import { AdjustPanel, AnimationPanel, TrackingPanel, TextPanel, VisualEffectsPanel } from './EffectsPanels';
import ReusePanel from './ReusePanel';
import AssistantPanel, { type ChatMsg } from './AssistantPanel';
import VersionsPanel from './VersionsPanel';
import Player from './Player';
import Timeline from './Timeline';
import { CapabilityPanel } from './VideoStudio';

/** Every key the editor answers, in one sheet (press ? anywhere outside a text box). */
const SHORTCUTS: [string, [string, string][]][] = [
  ['Anywhere', [['Space / K', 'play or pause'], ['← → / J L', 'back or on five seconds'], ['Ctrl/⌘ + Z', 'undo'], ['Ctrl/⌘ + Y', 'redo (or Ctrl/⌘ + Shift + Z)'], ['?', 'this sheet']]],
  ['Script', [['← →', 'a word'], ['Ctrl/⌘ + ← →', 'to the start of a sentence'], ['↑ ↓', 'the same place in the sentence before or after'], ['Shift + arrows', 'select words'], ['Delete / Backspace', 'cut the selected words'], ['R', 'restore struck words'], ['Esc', 'clear the selection']]],
  ['Timeline', [['Click a block', 'select that phrase or gap (Shift extends)'], ['I / O', 'mark the start or end of a stretch'], ['X', 'cut the marked stretch'], ['P', 'protect it'], ['M', 'make a Short of it'], ['Ctrl/⌘ + scroll', 'zoom']]],
];

/** The rail's groups (Descript's): each opens its panel beside the rail. */
export type Group = 'project' | 'ai' | 'properties' | 'elements' | 'captions' | 'media';
type Sub = 'shorts' | 'reuse' | 'tools' | 'cleanup' | 'video' | 'adjust' | 'effects' | 'animation' | 'tracking' | 'audio' | 'text' | 'music' | 'captions' | 'media';
export type PanelTab = Sub | 'transcript' | 'assistant' | 'versions' | 'exports';
const RAIL: { key: Group; label: string; icon: typeof Film }[] = [
  { key: 'project', label: 'Project', icon: FolderOpen }, { key: 'ai', label: 'AI Tools', icon: Sparkles }, { key: 'properties', label: 'Properties', icon: SlidersHorizontal },
  { key: 'elements', label: 'Elements', icon: Shapes }, { key: 'captions', label: 'Captions', icon: CaptionsIcon }, { key: 'media', label: 'Media', icon: Images },
];
const SUBS: Record<Group, { key: Sub; label: string }[]> = {
  project: [{ key: 'shorts', label: 'Compositions' }, { key: 'reuse', label: 'Reuse' }],
  ai: [{ key: 'tools', label: 'AI Tools' }, { key: 'cleanup', label: 'Cleanup' }],
  properties: [{ key: 'video', label: 'Video' }, { key: 'adjust', label: 'Adjust' }, { key: 'effects', label: 'Effects' }, { key: 'animation', label: 'Animation' }, { key: 'tracking', label: 'Tracking' }, { key: 'audio', label: 'Audio' }],
  elements: [{ key: 'text', label: 'Text' }, { key: 'music', label: 'Music' }],
  captions: [{ key: 'captions', label: 'Captions' }],
  media: [{ key: 'media', label: 'Media' }],
};
const groupOf = (t: string): Group | null => (Object.keys(SUBS) as Group[]).find(g => SUBS[g].some(x => x.key === t)) ?? null;

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
  /** Faces and the speaker through the recording (the engine's track), once loaded. */
  track: TrackFile | null;
  /** A version the server just saved (an assistant command), taken at once —
   *  waiting for the next refresh left a window where Undo went back two. */
  adopt: (doc: VideoDoc, version: number) => void;
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

function ResumeUpload({ view, onDone, instead }: { view: ProjectView; onDone: () => void; instead?: boolean }) {
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
      <h2><Upload size={16} /> {view.upload ? 'Finish the upload' : instead ? 'Upload the file instead' : 'Add the video'}</h2>
      <p className="vs-sub">{view.upload ? `“${view.upload.name}” stopped at ${view.upload.done.length} of ${Math.ceil(view.upload.bytes / view.upload.partSize)} parts. Choose the same file and it carries on from there.` : instead ? 'The MP4 YouTube Studio gives you, or the original recording.' : 'This project has no video yet.'}</p>
      <label className="vs-btn primary" style={{ justifySelf: 'start' }}>
        <Upload size={14} /> Choose the file
        <input type="file" hidden accept="video/*,.mkv" onChange={e => void go(e.target.files?.[0])} data-testid="vs-resume-file" />
      </label>
      {p && <><div className="vs-bar"><i style={{ width: `${pct}%` }} /></div><span className="vs-sub" style={{ margin: 0 }}>{bytesLabel(p.sent)} of {bytesLabel(p.total)}{p.resumed ? ' — resumed' : ''}</span></>}
      {err && <div className="vs-note bad">{err}</div>}
    </div>
  );
}

/* ── A YouTube start that YouTube refused ─────────────────────────────────── */

/**
 * The fetch stopped (YouTube refused the server, the video is private, too
 * long for the month…). The sentence is the server's; the way forward is the
 * one that always works — the file from YouTube Studio, uploaded into this
 * same project, which keeps the request and the choices already made.
 */
function YoutubeStopped({ view, onRetry, onDone }: { view: ProjectView; onRetry: () => void; onDone: () => void }) {
  const yt = view.source.youtube!;
  return (
    <div className="vs-col" style={{ gap: 12 }} data-testid="vs-youtube-stopped">
      <div className="vs-card vs-col" style={{ gap: 10 }}>
        <div className="vs-yt-card" style={{ border: 0, padding: 0, background: 'none' }}>
          <img src={yt.thumb} alt="" width={160} height={90} loading="lazy" referrerPolicy="no-referrer" />
          <div className="vs-col" style={{ gap: 3, minWidth: 0 }}>
            <b>{yt.title || `YouTube video ${yt.id}`}</b>
            <a className="vs-kbd" href={yt.url} target="_blank" rel="noreferrer noopener">{yt.url}</a>
          </div>
        </div>
        <div className="vs-note bad" role="alert" data-testid="vs-youtube-error"><AlertCircle size={15} /> <span>{view.project.error || 'The video could not be fetched from YouTube.'}</span></div>
        <p className="vs-sub" style={{ margin: 0 }}><b>The way that always works:</b> {view.project.wayForward || 'download it from YouTube Studio and upload the file instead.'} Your choices for this project are kept.</p>
        <div className="vs-row"><button type="button" className="vs-btn ghost sm" onClick={onRetry}><RefreshCw size={13} /> Try YouTube again</button></div>
      </div>
      <ResumeUpload view={view} onDone={onDone} instead />
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

/* ── The composition dropdown ─────────────────────────────────────────────── */

/**
 * "Video Studio / <project> / <composition> ▾": the long video and each Short
 * made from it are compositions of the same recording, switched here on the
 * same screen. A new short composition is the stretch selected in the script
 * or on the timeline, or — with nothing selected — the sentences from the
 * playhead for about half a minute (a clip like any other: trim it on the
 * timeline).
 */
function CompositionMenu({ ctx }: { ctx: EditorCtx }) {
  const { doc, duration } = ctx;
  const [open, setOpen] = useState(false);
  const box = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const off = (e: MouseEvent) => { if (!box.current?.contains(e.target as Node)) setOpen(false); };
    const esc = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false); };
    window.addEventListener('mousedown', off); window.addEventListener('keydown', esc);
    return () => { window.removeEventListener('mousedown', off); window.removeEventListener('keydown', esc); };
  }, [open]);
  const clip = ctx.activeClip ? doc.clips.find(c => c.id === ctx.activeClip) : null;
  const n = clip ? doc.clips.indexOf(clip) + 1 : 0;
  const label = clip ? `Short ${n} · ${clip.title}` : 'Long video';
  const words = ctx.transcript?.words ?? [];
  const newShort = async () => {
    setOpen(false);
    let s: number, e: number;
    if (ctx.selection && words.length) {
      s = words[Math.min(ctx.selection.i0, ctx.selection.i1)].s; e = words[Math.max(ctx.selection.i0, ctx.selection.i1)].e;
    } else {
      const sents = sentencesOf(words);
      const from = sents.find(x => x.e > ctx.time) ?? sents[0];
      if (from) {
        s = from.s; e = from.e;
        for (const x of sents) if (x.s >= from.s && x.e - s <= 45) e = x.e;
      } else { s = Math.max(0, ctx.time); e = Math.min(duration, s + 30); }
    }
    if (e - s < 5) e = Math.min(duration, s + 15);
    const before = new Set(doc.clips.map(c => c.id));
    const ok = await ctx.apply([{ op: 'clip.add', s, e, title: `Short from ${clock(s)}`, reason: 'A new short composition' }], 'New short composition');
    if (!ok) return;
    window.setTimeout(() => window.dispatchEvent(new CustomEvent('vs-new-clip', { detail: [...before] })), 0);
  };
  return (
    <div className="vse-comp" ref={box}>
      <button type="button" className="vse-comp-btn" aria-haspopup="menu" aria-expanded={open} onClick={() => setOpen(o => !o)} data-testid="vs-composition" title={label}>
        <span>{label}</span><ChevronDown size={14} />
      </button>
      {open && (
        <div className="vse-comp-menu" role="menu" data-testid="vs-composition-menu">
          <button type="button" role="menuitemradio" aria-checked={!clip} data-comp="long" onClick={() => { ctx.setActiveClip(null); setOpen(false); }}>
            <Clapperboard size={14} /><span><b>Long video</b><small>{clock(keptLength(keepRanges(duration, doc)))} after cuts</small></span>{!clip && <Check size={14} />}
          </button>
          {doc.clips.map((c, i) => (
            <button key={c.id} type="button" role="menuitemradio" aria-checked={clip?.id === c.id} data-comp={c.id} onClick={() => { ctx.setActiveClip(c.id); ctx.seek(c.s); setOpen(false); }}>
              <Film size={14} /><span><b>Short {i + 1} · {c.title}</b><small>{c.aspect} · {clock(keptLength(keepRanges(duration, doc, [c.s, c.e])))}</small></span>{clip?.id === c.id && <Check size={14} />}
            </button>
          ))}
          <hr />
          <button type="button" role="menuitem" onClick={() => void newShort()} data-act="new-short" disabled={!duration}>
            <Plus size={14} /><span><b>New short composition</b><small>{ctx.selection ? 'From your selection' : 'From the playhead, about half a minute'}</small></span>
          </button>
        </div>
      )}
    </div>
  );
}

/* ── The panel beside the rail ────────────────────────────────────────────── */

function SidePanel({ ctx, group, sub, setSub, onClose, messages, commandRef }: {
  ctx: EditorCtx; group: Group; sub: Sub; setSub: (s: Sub) => void; onClose: () => void; messages: ChatMsg[]; commandRef: React.RefObject<HTMLInputElement | null>;
}) {
  const subs = SUBS[group];
  const sentences = useMemo(() => ctx.transcript ? sentencesOf(ctx.transcript.words) : [], [ctx.transcript]);
  return (
    <section className="vse-panel" aria-label={RAIL.find(r => r.key === group)?.label} data-group={group}>
      <div className="vse-panel-head">
        <b>{RAIL.find(r => r.key === group)?.label}</b>
        <span className="vs-spacer" />
        <button type="button" className="vs-btn ghost sm" onClick={onClose} aria-label="Close the panel"><X size={15} /></button>
      </div>
      {subs.length > 1 && (
        <div className="vs-ptabs" role="tablist">
          {subs.map(x => <button key={x.key} type="button" role="tab" className="vs-ptab" aria-selected={sub === x.key} onClick={() => setSub(x.key)} data-panel={x.key}>{x.label}</button>)}
        </div>
      )}
      <div className="vse-scroll">
        {sub === 'shorts' && <ShortsPanel ctx={ctx} sentences={sentences} />}
        {sub === 'reuse' && <ReusePanel ctx={ctx} />}
        {sub === 'tools' && (
          <div className="vs-col">
            <div className="vse-improve" data-testid="vs-improve">
              <span className="vs-mark" style={{ width: 34, height: 34, borderRadius: 11 }}><Sparkles size={17} /></span>
              <div><b>Improve this video</b><small>Let AI plan your edits: the cleanup it found, waiting for your yes or no.</small></div>
              <button type="button" className="vs-btn ai sm" onClick={() => setSub('cleanup')}>Review</button>
            </div>
            <AssistantPanel ctx={ctx} messages={messages} inputRef={commandRef} />
          </div>
        )}
        {sub === 'cleanup' && <CleanupPanel ctx={ctx} />}
        {sub === 'video' && <VideoPanel ctx={ctx} />}
        {sub === 'adjust' && <AdjustPanel ctx={ctx} />}
        {sub === 'effects' && <VisualEffectsPanel ctx={ctx} />}
        {sub === 'animation' && <AnimationPanel ctx={ctx} />}
        {sub === 'tracking' && <TrackingPanel ctx={ctx} />}
        {sub === 'audio' && <AudioPanel ctx={ctx} />}
        {sub === 'text' && <TextPanel ctx={ctx} />}
        {sub === 'music' && <MusicPanel ctx={ctx} />}
        {sub === 'captions' && <CaptionsPanel ctx={ctx} />}
        {sub === 'media' && <MediaPanel ctx={ctx} />}
      </div>
    </section>
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
  const [track, setTrack] = useState<TrackFile | null>(null);
  const trackUrlSeen = useRef(false);
  const [error, setError] = useState('');
  const asked = params.get('tab') ?? '';
  const narrow = () => typeof window !== 'undefined' && window.matchMedia('(max-width: 900px)').matches;
  const [group, setGroup] = useState<Group | null>(() => groupOf(asked) ?? (narrow() ? null : 'ai'));
  const [sub, setSub] = useState<Sub>(() => (groupOf(asked) ? asked as Sub : 'tools'));
  const [time, setTime] = useState(0);
  const [selection, setSelection] = useState<{ i0: number; i1: number } | null>(null);
  const [activeClip, setActiveClip] = useState<string | null>(null);
  const [messages, setMessages] = useState<ChatMsg[]>([]);
  const [busy, setBusy] = useState(false);
  const [caps, setCaps] = useState<Capability[] | null>(null);
  const [showCaps, setShowCaps] = useState(false);
  const [showKeys, setShowKeys] = useState(false);
  const [showHistory, setShowHistory] = useState(asked === 'versions');
  const [name, setName] = useState('');
  const [transportEl, setTransportEl] = useState<HTMLDivElement | null>(null);
  const transcriptUrlSeen = useRef('');
  const prev = useRef<ProjectView | null>(null);
  const versionRef = useRef(0);
  const commandRef = useRef<HTMLInputElement>(null);
  versionRef.current = version;

  const say = useCallback((m: ChatMsg) => setMessages(ms => [...ms, m].slice(-80)), []);
  const openGroup = useCallback((g: Group, s?: Sub) => { setGroup(g); setSub(s ?? SUBS[g][0].key); }, []);
  const setTab = useCallback((t: PanelTab) => {
    const g = groupOf(t);
    if (g) { openGroup(g, t as Sub); setParams(t === 'tools' ? {} : { tab: t }, { replace: true }); return; }
    if (t === 'versions') setShowHistory(true);
    else if (t === 'exports') document.getElementById('vs-outputs-board')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    else if (t === 'assistant') { openGroup('ai', 'tools'); setTimeout(() => commandRef.current?.focus(), 50); }
    else if (t === 'transcript') document.querySelector<HTMLElement>('[data-testid="vs-tr-text"]')?.focus();
  }, [setParams, openGroup]);

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
    if (!before.extras?.quiz && now.extras?.quiz) say({ who: 'sys', text: `A ${now.extras.quiz.questions.length}-question quiz is ready (Project → Reuse).` });
    if (before.project.status !== 'failed' && now.project.status === 'failed') say({ who: 'sys', text: `Processing stopped: ${now.project.error}` });
  }, [say]);

  /* Every edit made here (an operation, undo/redo, an assistant command)
     moves this on. A poll asked before it answers with the document as it was
     then; taking that doc would put back what was just changed — Undo then
     went back two versions. So a poll's doc is taken only if nothing changed
     here while it was on its way. */
  const epoch = useRef(0);
  const absorb = useCallback(async (v: ProjectView, asked = epoch.current) => {
    let d = doc;
    if (v.doc && asked === epoch.current) { d = v.doc; setDoc(v.doc); setVersion(v.docVersion); }
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
    if (v.source.trackUrl && !trackUrlSeen.current) { trackUrlSeen.current = true; void loadTrack(v.source.trackUrl).then(t => { if (t) setTrack(t); else trackUrlSeen.current = false; }); }
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
      const asked = epoch.current;
      const r = await videoStatus(id, versionRef.current);
      if (r.success) await absorb(r, asked);
    }, moving ? 2500 : 15_000);
    return () => clearTimeout(t);
  }, [view, moving, id, absorb]);

  const refresh = useCallback(async () => { const asked = epoch.current; const r = await videoStatus(id, -1); if (r.success) await absorb(r, asked); }, [id, absorb]);

  const apply = useCallback(async (ops: Op[], note: string) => {
    if (!ops.length) return false;
    setBusy(true);
    epoch.current++;
    const r = await editVideo(id, versionRef.current, ops, note);
    epoch.current++;
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
    setBusy(true);
    epoch.current++;
    const r = await gotoVersion(id, v);
    setBusy(false);
    epoch.current++;
    if (r.success) { setDoc(r.doc); setVersion(r.docVersion); void refresh(); }
  }, [id, view, refresh]);

  const adopt = useCallback((d: VideoDoc, v: number) => { epoch.current++; setDoc(d); setVersion(v); }, []);

  const seek = useCallback((t: number) => {
    /* Negative numbers are the player telling us where it is (−1 − time);
       positive ones are a request to move it. */
    if (t < 0) { setTime(-1 - t); return; }
    setTime(t);
    window.dispatchEvent(new CustomEvent('vs-seek', { detail: t }));
  }, []);

  /* A new short composition is opened as soon as the save brings it back. */
  useEffect(() => {
    const on = (e: Event) => { const before = new Set((e as CustomEvent<string[]>).detail); const c = doc?.clips.find(x => !before.has(x.id)); if (c) { setActiveClip(c.id); seek(c.s); } };
    window.addEventListener('vs-new-clip', on);
    return () => window.removeEventListener('vs-new-clip', on);
  }, [doc, seek]);
  /* A composition that was deleted is left for the long video. */
  useEffect(() => { if (activeClip && doc && !doc.clips.some(c => c.id === activeClip)) setActiveClip(null); }, [doc, activeClip]);

  /* Undo / redo from the keyboard, outside text boxes. */
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement)?.tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return;
      if (e.key === '?' && !e.metaKey && !e.ctrlKey) { e.preventDefault(); setShowKeys(k => !k); return; }
      /* While a save is on its way the version here is the one before it; an undo now would go back two. */
      if ((e.metaKey || e.ctrlKey) && busy && /^[zy]$/i.test(e.key)) { e.preventDefault(); return; }
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'z') { e.preventDefault(); void go(e.shiftKey ? version + 1 : version - 1); }
      else if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'y') { e.preventDefault(); void go(version + 1); }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [go, version, busy]);

  const duration = view?.source.probe?.duration ?? transcript?.duration ?? 0;
  const ctx = useMemo<EditorCtx | null>(() => view && doc ? {
    view, doc, version, transcript, duration, apply, seek, time, selection, setSelection, activeClip, setActiveClip, refresh, setTab, say, adopt, track,
  } : null, [view, doc, version, transcript, duration, apply, seek, time, selection, activeClip, refresh, setTab, say, adopt, track]);
  const sentences = useMemo(() => transcript ? sentencesOf(transcript.words) : [], [transcript]);

  if (error) return <div className="vs-note bad" role="alert"><AlertCircle size={16} /> {error} <Link to="/video-studio">Back to Video Studio</Link></div>;
  if (!view || !doc || !ctx) return <p className="vs-sub"><Loader size={14} className="spin" /> Opening the project…</p>;

  const st = view.project.status;
  const hasSource = !!view.source.probe || st === 'processing';
  /* Started from YouTube, stopped before any video arrived. */
  const ytStopped = !!view.source.youtube && !view.source.probe && st === 'failed' && !view.upload;
  const stale = view.outputs.filter(o => o.stale);
  /* The stages card stays while anything moves or stopped — not once every stage is done. */
  const working = (st !== 'ready' || view.jobs.some(j => j.state === 'queued' || j.state === 'running' || j.state === 'failed')) && view.stages.some(x => x.state !== 'done' && x.state !== 'skipped');
  const proposed = doc.cuts.filter(c => c.state === 'proposed').length;
  const clip = activeClip ? doc.clips.find(c => c.id === activeClip) ?? null : null;
  const railClick = (g: Group) => { if (group === g) setGroup(null); else openGroup(g); };

  return (
    <>
    <div className={`vse ${group ? 'with-panel' : ''}`} data-testid="vs-editor" data-status={st}>
      <header className="vse-top">
        <Link to="/video-studio" className="vs-btn ghost sm" aria-label="Back to Video Studio" title="Video Studio"><Home size={16} /></Link>
        <button type="button" className="vs-btn ghost sm" disabled={version <= 1} onClick={() => void go(version - 1)} aria-label="Undo" title="Undo (Ctrl+Z)"><Undo2 size={15} /></button>
        <button type="button" className="vs-btn ghost sm" disabled={version >= view.maxVersion} onClick={() => void go(version + 1)} aria-label="Redo" title="Redo (Ctrl+Y or Ctrl+Shift+Z)"><Redo2 size={15} /></button>
        {busy && <Loader size={14} className="spin" />}
        <nav className="vse-crumbs" aria-label="Where you are">
          <Link to="/video-studio" className="crumb">Video Studio</Link><span className="sep">/</span>
          <input className="vse-name" aria-label="Project name" value={name} onChange={e => setName(e.target.value)} size={Math.max(8, Math.min(36, name.length + 1))}
            onBlur={() => { if (name.trim() && name !== view.project.name) void renameVideoProject(id, name.trim()); }} />
          <span className="sep">/</span>
          <CompositionMenu ctx={ctx} />
        </nav>
        <span className="vs-kbd vse-src">
          {view.source.probe ? `${clock(view.source.probe.duration)} · ${view.source.probe.width}×${view.source.probe.height}` : view.source.name || 'No video yet'}{view.project.language ? ` · ${view.project.language.toUpperCase()}` : ''}
        </span>
        {view.project.autopilotProjectId && <Link className="vs-aplink vs-kbd" to={`/autopilot?project=${view.project.autopilotProjectId}&tab=assets`}><Bot size={12} /> {view.project.autopilotProjectName || 'AI Autopilot business workspace'}</Link>}
        <span className="vs-spacer" />
        <button type="button" className="vs-btn ghost sm" onClick={() => setShowHistory(true)} aria-label="Version history"><History size={15} /></button>
        <button type="button" className="vs-btn ghost sm" onClick={() => setShowKeys(true)} aria-label="Keyboard shortcuts" title="Keyboard shortcuts (?)" data-act="shortcuts"><Keyboard size={15} /></button>
        <button type="button" className="vs-btn ghost sm" onClick={() => setShowCaps(true)}><ShieldCheck size={14} /> <span className="vse-hide-sm">What works</span></button>
        {stale.length > 0 && (
          <button type="button" className="vs-btn sm" data-testid="vs-render-changes" onClick={() => void renderOutputs(id, stale.map(o => o.id)).then(r => { if (!r.success) say({ who: 'ai', text: r.error ?? 'Could not render.' }); void refresh(); })}>
            <Clapperboard size={14} /> Render {stale.length} change{stale.length === 1 ? '' : 's'}
          </button>
        )}
        <button type="button" className="vs-btn ghost sm danger" aria-label="Delete project" onClick={async () => {
          if (await askConfirm({ title: 'Delete this project?', message: 'Its source video and everything made from it are deleted. This cannot be undone.', confirmLabel: 'Delete project', danger: true })) void deleteVideoProject(id).then(() => navigate('/video-studio'));
        }}><Trash2 size={14} /></button>
        <button type="button" className="vs-btn primary sm" onClick={() => setTab('exports')} data-act="export"><Download size={14} /> Export</button>
      </header>

      <section className="vse-script" aria-label="Script">
        <div className="vse-script-head">
          <h2 title={clip ? clip.title : view.project.name}>{clip ? clip.title : view.project.name}</h2>
          {proposed > 0 && <button type="button" className="vs-badge needs_review" onClick={() => setTab('cleanup')} data-act="open-cleanup">{proposed} suggestion{proposed === 1 ? '' : 's'}</button>}
        </div>
        <div className="vse-scroll"><TranscriptPanel ctx={ctx} sentences={sentences} /></div>
      </section>

      <main className="vse-stage">
        {ytStopped ? <YoutubeStopped view={view} onRetry={() => void retryVideo(id).then(refresh)} onDone={() => void refresh()} />
          : !hasSource && (st === 'draft' || st === 'uploading') ? <ResumeUpload view={view} onDone={() => void refresh()} />
          : view.source.proxyUrl ? (
            <Player ctx={ctx} transport={transportEl} below={(
              <div className="vse-under" data-testid="vs-under">
                <button type="button" className="vs-btn sm" onClick={() => setTab('video')} data-act="layout"><LayoutGrid size={14} /> Layout</button>
                <button type="button" className="vs-btn sm" onClick={() => setTab('effects')} data-act="background"><PaintBucket size={14} /> Background</button>
              </div>
            )} />
          ) : (
            <div className="vse-player"><div className="vse-screen" style={{ minHeight: 240 }}><span className="vs-kbd"><Loader size={14} className="spin" /> The preview appears when the video is prepared.</span></div></div>
          )}
        {working && hasSource && <StagesCard view={view} onRetry={() => void retryVideo(id).then(refresh)} onCancel={() => void cancelVideo(id).then(refresh)} />}
      </main>

      <aside className="vse-side">
        {group && <SidePanel ctx={ctx} group={group} sub={SUBS[group].some(x => x.key === sub) ? sub : SUBS[group][0].key} setSub={s => setTab(s)} onClose={() => setGroup(null)} messages={messages} commandRef={commandRef} />}
        <nav className="vse-rail" aria-label="Panels">
          {RAIL.map(r => (
            <button key={r.key} type="button" className="vse-rail-btn" aria-pressed={group === r.key} onClick={() => railClick(r.key)} data-rail={r.key} title={r.label}>
              <r.icon size={18} /><span>{r.label}</span>
              {r.key === 'ai' && proposed ? <i className="dot" /> : null}
            </button>
          ))}
        </nav>
      </aside>

      <div className="vse-transport" ref={setTransportEl} data-testid="vs-transport" />

      {hasSource && duration > 0 && <section className="vse-time"><Timeline ctx={ctx} wave={wave} /></section>}

      {showCaps && caps && <CapabilityPanel caps={caps} usage={null} onClose={() => setShowCaps(false)} />}
      {showKeys && (
        <div className="vs-modal-back" role="dialog" aria-modal="true" aria-label="Keyboard shortcuts" onClick={() => setShowKeys(false)}>
          <div className="vs-modal" style={{ maxWidth: 560 }} onClick={e => e.stopPropagation()} data-testid="vs-shortcuts">
            <div className="vs-row" style={{ marginBottom: 8 }}><h2 style={{ margin: 0, fontSize: 17 }}><Keyboard size={16} /> Keyboard shortcuts</h2><span className="vs-spacer" /><button type="button" className="vs-btn ghost sm" onClick={() => setShowKeys(false)} aria-label="Close"><X size={15} /></button></div>
            {SHORTCUTS.map(([g, rows]) => (
              <div key={g} className="vs-keys" style={{ marginBottom: 8 }}>
                <b>{g}</b>
                {rows.map(([k, what]) => <span key={k}><kbd>{k}</kbd> {what}</span>)}
              </div>
            ))}
          </div>
        </div>
      )}
      {showHistory && (
        <div className="vs-modal-back" role="dialog" aria-modal="true" aria-label="Version history" onClick={() => setShowHistory(false)}>
          <div className="vs-modal" style={{ maxWidth: 640 }} onClick={e => e.stopPropagation()}>
            <div className="vs-row" style={{ marginBottom: 8 }}><h2 style={{ margin: 0, fontSize: 17 }}><History size={16} /> Version history</h2><span className="vs-spacer" /><button type="button" className="vs-btn ghost sm" onClick={() => setShowHistory(false)} aria-label="Close"><X size={15} /></button></div>
            <VersionsPanel ctx={ctx} onGo={v => void go(v)} />
          </div>
        </div>
      )}
    </div>
    {hasSource && <OutputsBoard ctx={ctx} />}
    </>
  );
}

export type { Clip };
