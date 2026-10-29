/**
 * The studio's workspace-wide views, all read from /api/video.php `library`:
 *
 *   Media Library    — the source recordings, each kept as uploaded and
 *                      playable here, and the Screen Recorder that makes
 *                      new ones in the browser (ScreenRecorder.tsx).
 *   Exports          — every video made, with its files and status.
 *   Ready to Publish — the calendar. Nothing is posted from here: there is
 *                      no connected publishing, so a planned day reads
 *                      "Ready to publish manually", with the files to
 *                      download and the words to copy.
 */
import { lazy, Suspense, useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import MediaGraphics from './MediaGraphics';
import { Copy, Download, Image as ImageIcon, Loader, CalendarDays, ChevronLeft, ChevronRight, Check, MonitorPlay, Play, X, Clapperboard } from 'lucide-react';
import { videoLibrary, clock, bytesLabel, STATUS_LABEL, type LibraryItem, type LibrarySource, type OutputStatus } from '../../services/videoStudio';

/* Loaded when opened: nobody who only browses the library downloads the recorder. */
const ScreenRecorder = lazy(() => import('./ScreenRecorder'));

function useLibrary(nonce = 0) {
  const [data, setData] = useState<{ items: LibraryItem[]; sources: LibrarySource[] } | null>(null);
  const [error, setError] = useState('');
  useEffect(() => {
    let alive = true;
    void videoLibrary().then(r => { if (!alive) return; if (r.success) { setError(''); setData({ items: r.items, sources: r.sources }); } else setError(r.error ?? 'Could not load.'); });
    return () => { alive = false; };
  }, [nonce]);
  return { data, error };
}

export function CopyButton({ text, label, small = true }: { text: string; label: string; small?: boolean }) {
  const [done, setDone] = useState(false);
  return (
    <button type="button" className={`vs-btn ${small ? 'sm' : ''}`} disabled={!text} onClick={() => { void navigator.clipboard?.writeText(text).then(() => { setDone(true); setTimeout(() => setDone(false), 1500); }); }}>
      {done ? <Check size={13} /> : <Copy size={13} />} {done ? 'Copied' : label}
    </button>
  );
}

const SOURCE_STATE: Record<string, string> = { uploading: 'Uploading', processing: 'Preparing for the editor', ready: 'Ready to edit', failed: 'Preparing failed — open it to see why' };

/** One saved recording, played from its signed link (the proxy once made, else the original). */
function SourcePlayer({ s, onClose }: { s: LibrarySource; onClose: () => void }) {
  return (
    <div className="vs-modal-back" role="dialog" aria-modal="true" aria-label={`Play ${s.projectName}`} onClick={onClose} data-testid="vs-media-player">
      <div className="vs-modal vs-media-player" onClick={e => e.stopPropagation()}>
        <div className="vs-row" style={{ marginBottom: 8 }}>
          <b style={{ fontSize: 15 }}>{s.projectName}</b>
          <span className="vs-spacer" />
          <button type="button" className="vs-btn ghost sm" onClick={onClose} aria-label="Close"><X size={16} /></button>
        </div>
        <video src={s.playUrl} controls autoPlay playsInline />
        <div className="vs-row" style={{ marginTop: 10 }}>
          <Link className="vs-btn sm" to={`/video-studio/${s.projectId}`}><Clapperboard size={13} /> Open in the editor</Link>
          {s.downloadUrl && <a className="vs-btn sm" href={s.downloadUrl}><Download size={13} /> Download original</a>}
        </div>
      </div>
    </div>
  );
}

export function MediaLibrary({ record = false, onRecord }: { record?: boolean; onRecord?: (open: boolean) => void }) {
  const [nonce, setNonce] = useState(0);
  const { data, error } = useLibrary(nonce);
  const [localOpen, setLocalOpen] = useState(false);
  const [playing, setPlaying] = useState<LibrarySource | null>(null);
  const open = onRecord ? record : localOpen;
  const setOpen = (o: boolean) => (onRecord ? onRecord(o) : setLocalOpen(o));
  return (
    <div className="vs-col" style={{ gap: 16 }}>
      <div className="vs-card vs-rec-cta" data-testid="vs-recorder-cta">
        <span className="vs-mark"><MonitorPlay size={22} /></span>
        <div className="vs-grow">
          <h2 style={{ margin: 0 }}>Screen Recorder</h2>
          <p className="vs-sub" style={{ margin: '2px 0 0' }}>Record your screen, your screen with your face in a bubble, or just your camera — right here in the browser. Then save it to this library or download it.</p>
        </div>
        <button type="button" className="vs-btn ai vs-rec-big" style={{ width: 'auto' }} onClick={() => setOpen(true)} data-testid="vs-open-recorder"><MonitorPlay size={18} /> Record your screen</button>
      </div>
      {error ? <div className="vs-note bad">{error}</div>
        : !data ? <p className="vs-sub"><Loader size={14} className="spin" /> Loading…</p>
          : !data.sources.length ? <div className="vs-card vs-empty">No recordings yet. Record one above, or start a new video project with a file.</div>
            : (
              <div className="vs-grid" data-testid="vs-media">
                {data.sources.map(s => (
                  <div key={s.projectId} className="vs-card vs-proj" style={{ cursor: 'default' }} data-testid="vs-media-item">
                    <div className="vs-poster" style={s.posterUrl ? { backgroundImage: `url("${s.posterUrl}")` } : undefined}>
                      {s.duration > 0 && <span className="vs-dur">{clock(s.duration)}</span>}
                      {s.playUrl && <button type="button" className="vs-media-play" onClick={() => setPlaying(s)} aria-label={`Play ${s.projectName}`} data-testid="vs-media-play"><Play size={22} fill="currentColor" /></button>}
                    </div>
                    <div className="vs-proj-body">
                      <b>{s.projectName || s.name || 'Recording'}</b>
                      <span>{bytesLabel(s.bytes)}{s.width ? ` · ${s.width}×${s.height}` : ''} · {new Date(s.createdAt).toLocaleDateString()}</span>
                      <span>{SOURCE_STATE[s.status] ?? 'Original kept unchanged'}</span>
                      <div className="vs-row" style={{ marginTop: 4 }}>
                        <Link className="vs-btn sm" to={`/video-studio/${s.projectId}`}><Clapperboard size={13} /> Open</Link>
                        {s.downloadUrl && <a className="vs-btn sm" href={s.downloadUrl}><Download size={13} /> Download</a>}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
      <MediaGraphics />
      {playing && <SourcePlayer s={playing} onClose={() => setPlaying(null)} />}
      {open && (
        <Suspense fallback={<div className="vs-modal-back"><p className="vs-sub" style={{ color: '#fff' }}><Loader size={14} className="spin" /> Opening the recorder…</p></div>}>
          <ScreenRecorder onClose={() => setOpen(false)} onSaved={() => setNonce(n => n + 1)} />
        </Suspense>
      )}
    </div>
  );
}

function ItemRow({ it }: { it: LibraryItem }) {
  return (
    <div className="vs-out" data-testid="vs-export-row" data-kind={it.kind} data-status={it.status}>
      <div className={`vs-thumb ${it.kind === 'short' ? 'tall' : ''}`} style={it.thumbUrl ? { backgroundImage: `url("${it.thumbUrl}")` } : undefined} />
      <div className="vs-col" style={{ gap: 6 }}>
        <div className="vs-row">
          <b>{it.title}</b>
          <span className={`vs-badge ${it.status}`}>{it.status === 'ready_to_publish' ? 'Ready to publish manually' : STATUS_LABEL[it.status]}</span>
        </div>
        <div className="vs-meta">
          <span>{it.kind === 'long' ? 'Long video' : 'Short'}</span>
          {it.duration > 0 && <span>{clock(it.duration)}</span>}
          {it.width > 0 && <span>{it.width}×{it.height}</span>}
          <Link to={`/video-studio/${it.projectId}?tab=exports`}>{it.projectName}</Link>
          {it.publishAt && <span><CalendarDays size={12} /> {new Date(it.publishAt).toLocaleDateString()}</span>}
        </div>
        <div className="vs-row">
          {it.downloadUrl && <a className="vs-btn sm" href={it.downloadUrl}><Download size={13} /> MP4</a>}
          {it.thumbDownload && <a className="vs-btn sm" href={it.thumbDownload}><ImageIcon size={13} /> PNG</a>}
          <CopyButton text={it.caption} label="Copy caption" />
          <CopyButton text={it.description} label="Copy description" />
          <CopyButton text={it.hashtags} label="Copy hashtags" />
        </div>
      </div>
    </div>
  );
}

export function ExportsList() {
  const { data, error } = useLibrary();
  const [kind, setKind] = useState<'all' | 'long' | 'short'>('all');
  const [status, setStatus] = useState<'all' | OutputStatus>('all');
  if (error) return <div className="vs-note bad">{error}</div>;
  if (!data) return <p className="vs-sub"><Loader size={14} className="spin" /> Loading…</p>;
  const rows = data.items.filter(i => (kind === 'all' || i.kind === kind) && (status === 'all' || i.status === status));
  return (
    <div className="vs-col" data-testid="vs-exports">
      <div className="vs-row">
        {(['all', 'long', 'short'] as const).map(k => <button key={k} type="button" className="vs-chip" aria-pressed={kind === k} onClick={() => setKind(k)}>{k === 'all' ? 'Everything' : k === 'long' ? 'Long videos' : 'Shorts'}</button>)}
        <span className="vs-spacer" />
        <select className="vs-select" style={{ width: 'auto' }} value={status} onChange={e => setStatus(e.target.value as 'all' | OutputStatus)} aria-label="Status">
          <option value="all">Any status</option>
          {(Object.keys(STATUS_LABEL) as OutputStatus[]).map(s => <option key={s} value={s}>{STATUS_LABEL[s]}</option>)}
        </select>
      </div>
      {rows.length ? rows.map(it => <ItemRow key={it.id} it={it} />) : <div className="vs-card vs-empty">Nothing here yet.</div>}
    </div>
  );
}

const DOW = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

export function ReadyToPublish() {
  const { data, error } = useLibrary();
  const [month, setMonth] = useState(() => { const d = new Date(); return new Date(d.getFullYear(), d.getMonth(), 1); });
  const ready = useMemo(() => (data?.items ?? []).filter(i => i.status === 'ready_to_publish' || i.status === 'approved'), [data]);
  if (error) return <div className="vs-note bad">{error}</div>;
  if (!data) return <p className="vs-sub"><Loader size={14} className="spin" /> Loading…</p>;
  const first = new Date(month);
  const offset = (first.getDay() + 6) % 7;
  const days = Array.from({ length: 42 }, (_, i) => new Date(month.getFullYear(), month.getMonth(), 1 - offset + i));
  const key = (d: Date) => `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;
  const byDay = new Map<string, LibraryItem[]>();
  for (const it of ready) if (it.publishAt) { const k = key(new Date(it.publishAt)); byDay.set(k, [...(byDay.get(k) ?? []), it]); }
  const today = key(new Date());
  return (
    <div className="vs-col" data-testid="vs-publish">
      <div className="vs-note"><CalendarDays size={16} /> <span>Protected Central does not post to social platforms yet, so nothing here is published for you. Each planned video is <b>Ready to publish manually</b>: download the video and PNG thumbnail, copy the words, and post it yourself.</span></div>
      <div className="vs-card">
        <div className="vs-row" style={{ marginBottom: 8 }}>
          <button type="button" className="vs-btn ghost sm" onClick={() => setMonth(m => new Date(m.getFullYear(), m.getMonth() - 1, 1))} aria-label="Previous month"><ChevronLeft size={16} /></button>
          <b>{month.toLocaleDateString(undefined, { month: 'long', year: 'numeric' })}</b>
          <button type="button" className="vs-btn ghost sm" onClick={() => setMonth(m => new Date(m.getFullYear(), m.getMonth() + 1, 1))} aria-label="Next month"><ChevronRight size={16} /></button>
        </div>
        <div className="vs-cal">
          {DOW.map(d => <div key={d} className="dow">{d}</div>)}
          {days.map(d => (
            <div key={key(d)} className={`vs-day ${d.getMonth() !== month.getMonth() ? 'other' : ''} ${key(d) === today ? 'today' : ''}`}>
              <span className="n">{d.getDate()}</span>
              {(byDay.get(key(d)) ?? []).map(it => <Link key={it.id} className="ev" to={`/video-studio/${it.projectId}?tab=exports`} title={`${it.title} — ready to publish manually`}>{it.title}</Link>)}
            </div>
          ))}
        </div>
      </div>
      <h3 style={{ margin: '6px 0 0' }}>Approved and ready</h3>
      {ready.length ? ready.map(it => <ItemRow key={it.id} it={it} />) : <div className="vs-card vs-empty">Approve a video, or mark it Ready to publish, and it appears here.</div>}
    </div>
  );
}
