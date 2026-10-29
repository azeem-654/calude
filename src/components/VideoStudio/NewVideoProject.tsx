/**
 * A new video project, upload first: one big place to drop the video, a
 * "Choose a file" button, or a pasted link — and then a progress screen that
 * stays with the video until it and its transcript are ready, when the
 * editor opens. There is no prompt to write: the goal chosen on the welcome
 * (or a template) is the request, and its choices are folded under Options.
 *
 * The video can come from:
 *  - the customer's computer — a resumable upload in parts, its progress the
 *    bytes that have really left the browser;
 *  - a link to their own YouTube video — fetched by the media engine (the
 *    rules in lib/video/youtube.ts), only after they tick that it is theirs;
 *  - a direct link to a video file — fetched by the Worker, fenced like every
 *    address somebody types (`import_link`).
 *
 * The progress screen (`ImportProgress`) reads only what is real — bytes,
 * the engine's clock, pieces transcribed — and creeps between readings
 * without passing the next one (progress.ts says how).
 */
import { useEffect, useMemo, useRef, useState } from 'react';
import { UploadCloud, Loader, AlertCircle, Bot, SquarePlay, ArrowLeft, Check, X, Link2, SlidersHorizontal, ChevronDown, ChevronUp, Film } from 'lucide-react';
import {
  createVideoProject, parseRequest, describeRequest, uploadVideo, abortUpload, importVideoLink, bytesLabel, SHORTS_MAX, parseYoutubeUrl, youtubeInfo, youtubeThumb, videoStatus,
  type Template, type VideoRequest, type UploadProgress, type Want, type Capability, type ProjectView,
} from '../../services/videoStudio';
import { fetchBoard, type Project } from '../../services/projects';
import { bandsFor, readProgress, useCreep, useEta, etaWords, type Origin } from './progress';

/** What the welcome wizard asked for beyond the video itself, said in words. */
function wantWords(w: Want): string[] {
  return [
    w.denoise ? `${w.denoise} noise reduction` : '',
    w.voice ? 'clearer voice' : '',
    w.music ? `${w.music.replace(/ instrumental$/, '')} royalty-free music` : '',
    w.repurpose ? [w.repurpose.posts ? `${w.repurpose.posts} social posts` : '', w.repurpose.blog ? 'a blog article' : '', w.repurpose.email ? '3 emails' : ''].filter(Boolean).join(', ') + ' (drafts)' : '',
    w.quiz ? 'a quiz' : '',
  ].filter(Boolean);
}

const VIDEO_NAME = /\.(mp4|m4v|mov|mkv|webm)$/i;

export default function NewVideoProject({ template, want, autopilotProjectId, transcription, options, onCancel, onCreated }: {
  template: Template | null;
  want?: Want;
  autopilotProjectId: string;
  /** Whether transcription is set up on this install (from capabilities); null while unknown. */
  transcription?: Capability | null;
  /** The goal's choices, folded under "Options". */
  options?: React.ReactNode;
  onCancel: () => void;
  onCreated: (id: string) => void;
}) {
  const [settings, setSettings] = useState<Partial<VideoRequest> & { language?: string }>(template?.settings ?? {});
  const [apProjects, setApProjects] = useState<Project[]>([]);
  const [ap, setAp] = useState(autopilotProjectId);
  const [over, setOver] = useState(false);
  const [showOptions, setShowOptions] = useState(false);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  /* A pasted link: YouTube (the engine fetches it) or a direct video file (the Worker does). */
  const [link, setLink] = useState('');
  const [linkErrShown, setLinkErrShown] = useState(false);
  const [ytInfo, setYtInfo] = useState<{ id: string; title: string; author: string; note: string } | null>(null);
  const [ytServerErr, setYtServerErr] = useState('');
  const [rights, setRights] = useState(false);
  const yt = useMemo(() => parseYoutubeUrl(link), [link]);
  const isYoutube = /youtu\.?be/i.test(link);
  const direct = !isYoutube && /^https?:\/\/\S+\.\S+/i.test(link.trim());
  /* Once started: which project, from where, and the upload's real bytes. */
  const [job, setJob] = useState<{ id: string; origin: Origin; name: string } | null>(null);
  const [progress, setProgress] = useState<UploadProgress | null>(null);
  const abort = useRef<AbortController | null>(null);

  useEffect(() => { void fetchBoard().then(b => setApProjects(b.projects as Project[])); }, []);
  useEffect(() => { if (template) setSettings(template.settings); }, [template]);

  /* The title, asked of YouTube by the server once the link names a video. */
  const ytId = yt.ok ? yt.id : '';
  useEffect(() => {
    setYtServerErr('');
    if (!ytId) { setYtInfo(null); return; }
    let gone = false;
    const t = setTimeout(() => {
      void youtubeInfo(`https://www.youtube.com/watch?v=${ytId}`).then(r => {
        if (gone) return;
        if (!r.success) { setYtServerErr(r.error ?? 'That link could not be checked.'); setYtInfo(null); return; }
        setYtInfo({ id: r.id, title: r.title, author: r.author, note: r.note });
      });
    }, 350);
    return () => { gone = true; clearTimeout(t); };
  }, [ytId]);
  useEffect(() => { setLinkErrShown(false); if (!link.trim()) return; const t = setTimeout(() => setLinkErrShown(true), 900); return () => clearTimeout(t); }, [link]);
  const linkError = ytServerErr || (linkErrShown && link.trim() && isYoutube && !yt.ok ? yt.error : linkErrShown && link.trim() && !isYoutube && !direct ? 'Paste a YouTube link or a direct link to a video file (https://…/video.mp4).' : '');

  /* What will be made — the goal's request read the way the server reads it. */
  const understood = useMemo(() => {
    const r = { ...parseRequest(template?.prompt || 'clean this recording and create three shorts', settings), ...settings } as VideoRequest;
    return { ...r, understood: describeRequest(r) };
  }, [template, settings]);

  const create = async (name: string, extra: Record<string, unknown> = {}) => createVideoProject({
    name: name.slice(0, 120), prompt: template?.prompt ?? '', settings, autopilotProjectId: ap || undefined, want, ...extra,
  });

  const startFile = async (f: File | null | undefined) => {
    if (!f || busy) return;
    setError('');
    if (!VIDEO_NAME.test(f.name)) { setError('Choose an MP4, MOV, MKV or WebM video.'); return; }
    setBusy(true);
    const name = f.name.replace(/\.[^.]+$/, '').replace(/[_-]+/g, ' ').trim() || 'My video';
    const c = await create(name);
    if (!c.success) { setBusy(false); setError(c.error ?? 'The project could not be created.'); return; }
    setJob({ id: c.id, origin: 'file', name });
    abort.current = new AbortController();
    const up = await uploadVideo(c.id, f, setProgress, abort.current.signal);
    if (!up.ok) { setError(abort.current.signal.aborted ? '' : `${up.error} The project is saved — open it and choose the same file to resume.`); if (abort.current.signal.aborted) { setJob(null); setProgress(null); setBusy(false); } }
  };

  const startLink = async () => {
    setLinkErrShown(true);
    if (busy) return;
    if (isYoutube) {
      if (!yt.ok || ytServerErr) { setError(yt.ok ? ytServerErr : yt.error); return; }
      if (!rights) { setError('Tick the box to confirm this is your video, or that you have the rights to use it.'); return; }
      setError(''); setBusy(true);
      const name = ytInfo?.title || 'YouTube video';
      const c = await create(name, { youtubeUrl: yt.url, rightsConfirmed: true, title: ytInfo?.title ?? '' });
      if (!c.success) { setBusy(false); setError(c.error ?? 'The project could not be created.'); return; }
      setJob({ id: c.id, origin: 'youtube', name });
      return;
    }
    if (!direct) { setError('Paste a YouTube link or a direct link to a video file.'); return; }
    if (!rights) { setError('Tick the box to confirm this is your video, or that you have the rights to use it.'); return; }
    setError(''); setBusy(true);
    const name = decodeURIComponent(link.trim().split(/[?#]/)[0].split('/').pop() ?? '').replace(/\.[^.]+$/, '').replace(/[_-]+/g, ' ').trim() || 'Video from a link';
    const c = await create(name);
    if (!c.success) { setBusy(false); setError(c.error ?? 'The project could not be created.'); return; }
    setJob({ id: c.id, origin: 'link', name });
    const r = await importVideoLink(c.id, link.trim());
    if (!r.success) setError(`${r.error ?? 'The video could not be fetched from that link.'} The project is saved — open it and upload the file instead.`);
  };

  if (job) {
    return (
      <ImportProgress job={job} upload={progress} error={error} transcription={transcription ?? null}
        onCancel={job.origin === 'file' && !progress?.total ? undefined : job.origin === 'file' ? () => { abort.current?.abort(); void abortUpload(job.id); } : undefined}
        onReady={() => onCreated(job.id)} />
    );
  }

  const noTranscriber = transcription && transcription.status !== 'working';
  return (
    <div className="vs-upload" data-testid="vs-new-project">
      <div className="vs-row vs-upload-head">
        <button type="button" className="vs-btn ghost sm" onClick={onCancel}><ArrowLeft size={14} /> Goals</button>
        <div style={{ flex: 1, minWidth: 0 }}>
          <b className="vs-upload-goal">{template?.name ?? 'New video project'}</b>
          <div className="vs-understood" data-testid="vs-understood">{understood.understood.map(u => <span key={u}>{u}</span>)}{want && wantWords(want).map(u => <span key={u} className="also">{u}</span>)}</div>
        </div>
        <button type="button" className="vs-btn sm" onClick={() => setShowOptions(o => !o)} aria-expanded={showOptions} data-act="options">
          <SlidersHorizontal size={14} /> Options {showOptions ? <ChevronUp size={13} /> : <ChevronDown size={13} />}
        </button>
      </div>

      {showOptions && (
        <div className="vs-col" data-testid="vs-options">
          {options ?? <AdvancedSettings understood={understood} settings={settings} onSet={p => setSettings(s => ({ ...s, ...p }))} />}
          <label className="vs-label" style={{ maxWidth: 520 }}><span style={{ display: 'flex', gap: 6, alignItems: 'center' }}><Bot size={13} /> Save into an AI Autopilot business workspace (optional)</span>
            <select className="vs-select" data-field="video.autopilot" value={ap} onChange={e => setAp(e.target.value)}>
              <option value="">No — keep it in Video Studio</option>
              {apProjects.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
            </select>
          </label>
        </div>
      )}

      <div className={`vs-bigdrop ${over ? 'over' : ''}`} data-field="video.file" data-testid="vs-dropzone"
        onDragOver={e => { e.preventDefault(); setOver(true); }} onDragLeave={() => setOver(false)}
        onDrop={e => { e.preventDefault(); setOver(false); void startFile(e.dataTransfer.files?.[0]); }}>
        <input ref={inputRef} type="file" accept="video/mp4,video/quicktime,video/x-matroska,video/webm,.mp4,.mov,.m4v,.mkv,.webm" hidden data-testid="vs-file"
          onChange={e => void startFile(e.target.files?.[0])} />
        <UploadCloud size={58} strokeWidth={1.5} className="vs-bigdrop-ic" />
        <h2 className="vs-bigdrop-title">Drag a video file here to upload</h2>
        <button type="button" className="vs-btn primary vs-bigdrop-btn" onClick={() => inputRef.current?.click()} disabled={busy} data-testid="vs-choose">
          {busy ? <Loader size={16} className="spin" /> : <Film size={16} />} Choose a file
        </button>
        <span className="vs-sub" style={{ margin: 0 }}>MP4, MOV, MKV or WebM · up to 12 GB · your original is kept untouched</span>
        <div className="vs-or"><span>or paste a video link</span></div>
        <div className="vs-linkrow" data-testid="vs-youtube">
          <Link2 size={16} className="ic" />
          <input className="vs-input" data-field="video.youtube" data-testid="vs-yt-url" value={link} disabled={busy} inputMode="url" autoComplete="off" spellCheck={false}
            aria-label="A YouTube link or a direct link to a video file" aria-invalid={!!linkError}
            placeholder="youtube.com/watch?v=…  or  https://…/video.mp4"
            onChange={e => setLink(e.target.value)} onBlur={() => setLinkErrShown(true)} onKeyDown={e => { if (e.key === 'Enter') void startLink(); }} />
          <button type="button" className="vs-btn ai" onClick={() => void startLink()} disabled={busy || !link.trim()} data-testid="vs-start">Import</button>
        </div>
        {linkError && <div className="vs-note bad" role="alert" data-testid="vs-yt-error"><AlertCircle size={15} /> {linkError}</div>}
        {isYoutube && yt.ok && !ytServerErr && (
          <div className="vs-yt-card" data-testid="vs-yt-card">
            <img src={youtubeThumb(yt.id)} alt="" width={160} height={90} loading="lazy" referrerPolicy="no-referrer" />
            <div className="vs-col" style={{ gap: 3, minWidth: 0 }}>
              <b data-testid="vs-yt-title">{ytInfo?.title || `YouTube video ${yt.id}`}</b>
              {ytInfo?.author && <span className="vs-kbd">{ytInfo.author}</span>}
              <span className="vs-kbd">Fetched by our server at up to 1080p, then prepared like an upload.</span>
              {ytInfo?.note && <span className="vs-kbd" style={{ color: '#b45309' }}>{ytInfo.note}</span>}
            </div>
          </div>
        )}
        {(isYoutube || direct) && link.trim() && (
          <label className="vs-opt" data-field="video.youtubeRights">
            <input type="checkbox" checked={rights} onChange={e => setRights(e.target.checked)} disabled={busy} data-testid="vs-yt-rights" />
            <span><b>This is my video, or I have the rights to use it</b>{isYoutube ? ' — YouTube allows downloading only videos you own or may use. If it refuses our server, download the file from YouTube Studio and drop it here.' : ''}</span>
          </label>
        )}
      </div>

      {noTranscriber && (
        <div className="vs-note warn" data-testid="vs-no-transcriber"><AlertCircle size={15} /> <span><b>Transcription is not set up on this install</b> — {transcription!.note || 'the owner connects it in Cloudflare.'} Your video will be uploaded and prepared, but there will be no transcript: editing by text, filler removal and captions need it.</span></div>
      )}
      {error && <div className="vs-note bad" role="alert"><AlertCircle size={16} /> {error}</div>}
      <p className="vs-kbd" style={{ margin: 0, textAlign: 'center' }}>Nothing is published anywhere. Cuts are proposed with reasons, and you can restore anything — the original is never changed.</p>
    </div>
  );
}

/** A template's settings (no goal): the few numbers a template sets, changeable. */
function AdvancedSettings({ understood, settings, onSet }: { understood: VideoRequest; settings: Partial<VideoRequest> & { language?: string }; onSet: (p: Partial<VideoRequest> & { language?: string }) => void }) {
  return (
    <div className="vs-card vs-col" data-testid="vs-advanced">
      <div className="vs-row">
        <label className="vs-label" style={{ flex: 1 }}>Shorts<input className="vs-input" type="number" min={0} max={SHORTS_MAX} value={understood.shorts} onChange={e => onSet({ shorts: Math.max(0, Math.min(SHORTS_MAX, Number(e.target.value))) })} /></label>
        <label className="vs-label" style={{ flex: 1 }}>Shortest (s)<input className="vs-input" type="number" min={10} max={170} value={understood.min} onChange={e => onSet({ min: Number(e.target.value) })} /></label>
        <label className="vs-label" style={{ flex: 1 }}>Longest (s)<input className="vs-input" type="number" min={15} max={180} value={understood.max} onChange={e => onSet({ max: Number(e.target.value) })} /></label>
      </div>
      <div className="vs-row">
        <label className="vs-label" style={{ flex: 1 }}>Cleanup
          <select className="vs-select" value={understood.cleanup} onChange={e => onSet({ cleanup: e.target.value as VideoRequest['cleanup'] })}>
            <option value="conservative">Conservative</option><option value="balanced">Balanced</option><option value="aggressive">Aggressive</option>
          </select>
        </label>
        <label className="vs-label" style={{ flex: 1 }}>Language
          <select className="vs-select" value={settings.language ?? ''} onChange={e => onSet({ language: e.target.value || undefined })}>
            <option value="">Detect automatically</option><option value="en">English</option><option value="tr">Turkish</option><option value="ur">Urdu</option>
          </select>
        </label>
      </div>
      <div className="vs-row">
        <label className="vs-row" style={{ gap: 6, fontSize: 13 }}><input type="checkbox" checked={understood.long} onChange={e => onSet({ long: e.target.checked })} /> Long video</label>
        <label className="vs-row" style={{ gap: 6, fontSize: 13 }}><input type="checkbox" checked={understood.captions} onChange={e => onSet({ captions: e.target.checked })} /> Captions</label>
        <label className="vs-row" style={{ gap: 6, fontSize: 13 }}><input type="checkbox" checked={understood.thumbnails} onChange={e => onSet({ thumbnails: e.target.checked })} /> Thumbnails</label>
      </div>
    </div>
  );
}

/* ── The progress screen ─────────────────────────────────────────────────── */

export function ImportProgress({ job, upload, error, transcription, onCancel, onReady }: {
  job: { id: string; origin: Origin; name: string };
  upload: UploadProgress | null;
  error: string;
  transcription: Capability | null;
  onCancel?: () => void;
  onReady: () => void;
}) {
  const bands = useMemo(() => bandsFor(job.origin), [job.origin]);
  const [view, setView] = useState<ProjectView | null>(null);
  const known = useRef(-1);
  const opened = useRef(false);
  /* The server's view, every couple of seconds — it is what moves the jobs on, too. */
  useEffect(() => {
    let alive = true, t = 0;
    const tick = async () => {
      const r = await videoStatus(job.id, known.current);
      if (!alive) return;
      if (r.success) { setView(r); if (typeof r.docVersion === 'number') known.current = r.docVersion; }
      t = window.setTimeout(tick, 2000);
    };
    void tick();
    return () => { alive = false; clearTimeout(t); };
  }, [job.id]);

  const reading = readProgress(bands, view, upload && job.origin === 'file' ? upload : null);
  /* Transcription impossible (not set up, or it stopped): the video is still worth opening once it is prepared. */
  const transcribeFailed = view?.stages.find(s => s.key === 'transcribe')?.state === 'failed';
  const preparedOnly = !!view?.source.proxyUrl && (transcribeFailed || (transcription && transcription.status !== 'working'));
  const done = reading.done;
  const shown = useCreep(reading.value, reading.ceiling, done);
  const band = bands[Math.min(reading.index, bands.length - 1)];
  const stageBytes = job.origin === 'file' && reading.index === 0 && upload ? upload.sent : job.origin === 'link' && reading.index === 0 && view?.source.link ? view.source.link.got : null;
  const stageTotal = job.origin === 'file' && upload ? upload.total : view?.source.link?.bytes ?? 0;
  const eta = useEta(stageBytes ?? reading.stagePct, stageBytes !== null ? stageTotal : 100);
  useEffect(() => { if (done && !opened.current) { opened.current = true; const t = setTimeout(onReady, 700); return () => clearTimeout(t); } }, [done, onReady]);

  const failed = error || reading.failed;
  /* How long the step in hand has taken — a clock that always moves. */
  const [stepSince, setStepSince] = useState(() => Date.now());
  const [, tick] = useState(0);
  useEffect(() => { setStepSince(Date.now()); }, [reading.index]);
  useEffect(() => { const t = window.setInterval(() => tick(n => n + 1), 1000); return () => clearInterval(t); }, []);
  const stepFor = Math.max(0, Math.floor((Date.now() - stepSince) / 1000));
  return (
    <div className="vs-progress-screen" data-testid="vs-upload-progress" data-pct={shown.toFixed(1)} data-stage={done ? 'ready' : band.key}>
      <div className="vs-ps-name" title={job.name}>{job.name}</div>
      <div className="vs-ps-pct" aria-live="off" data-testid="vs-progress-pct">{done ? '100' : shown.toFixed(2)}<small>%</small></div>
      <div className="vs-ps-bar" role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.floor(shown)} aria-label="Getting your video ready"><i style={{ width: `${shown}%` }} /></div>
      <div className="vs-ps-now" data-testid="vs-progress-stage">
        {failed ? <><AlertCircle size={15} /> Stopped</> : done ? <><Check size={15} /> Ready — opening the editor</> : <><Loader size={15} className="spin" /> {band.label}… <span className="vs-ps-clock" data-testid="vs-progress-clock">{Math.floor(stepFor / 60)}:{String(stepFor % 60).padStart(2, '0')}</span></>}
      </div>
      <div className="vs-ps-detail">
        {stageBytes !== null && stageTotal > 0 && <span data-testid="vs-progress-bytes">{bytesLabel(stageBytes)} of {bytesLabel(stageTotal)}</span>}
        {reading.stagePct !== null && stageBytes === null && reading.index > 0 && !done && <span>{band.label}: {Math.floor(reading.stagePct)}%</span>}
        {eta !== null && !done && !failed && <span data-testid="vs-progress-eta">{etaWords(eta)}{reading.index > 0 ? ' in this step' : ''}</span>}
        {upload?.resumed && reading.index === 0 && <span>picked up where the last upload stopped</span>}
      </div>
      <ol className="vs-ps-steps">
        {bands.map((b, i) => {
          const state = reading.skipped.includes(b.key) ? 'skipped' : i < reading.index ? 'done' : i === reading.index ? (failed ? 'failed' : 'active') : 'waiting';
          return (
            <li key={b.key} data-state={state} data-step={b.key}>
              <span className="dot">{state === 'done' ? <Check size={12} /> : state === 'failed' ? <X size={12} /> : state === 'active' ? <Loader size={12} className="spin" /> : null}</span>
              {b.label}{state === 'skipped' ? ' — not needed' : ''}
            </li>
          );
        })}
        <li data-state={done ? 'done' : 'waiting'} data-step="ready"><span className="dot">{done ? <Check size={12} /> : null}</span>Ready</li>
      </ol>
      {transcription && transcription.status !== 'working' && (
        <div className="vs-note warn"><AlertCircle size={15} /> <span>Transcription is not set up on this install, so there will be no transcript — the editor opens once the video is prepared.</span></div>
      )}
      {failed && <div className="vs-note bad" role="alert" data-testid="vs-progress-error"><AlertCircle size={15} /> <span>{failed}</span></div>}
      <div className="vs-row" style={{ justifyContent: 'center' }}>
        {(failed || preparedOnly) && <button type="button" className="vs-btn primary" onClick={onReady} data-act="open-anyway">Open the editor</button>}
        {!failed && !done && reading.index === 0 && onCancel && <button type="button" className="vs-btn ghost sm" onClick={onCancel}>Cancel upload</button>}
      </div>
      {!failed && !done && <p className="vs-kbd" style={{ margin: 0, textAlign: 'center' }}>{reading.index === 0 && job.origin === 'file' ? 'Keep this tab open while it uploads; if it stops, choose the same file again to resume.' : 'You can leave this page — the work carries on and the project waits in Video Studio.'}</p>}
    </div>
  );
}
