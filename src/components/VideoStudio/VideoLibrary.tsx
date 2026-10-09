/**
 * The studio's workspace-wide views, all read from /api/video.php `library`:
 *
 *   Media Library    — the source recordings, each kept as uploaded.
 *   Exports          — every video made, with its files and status.
 *   Ready to Publish — the calendar. Nothing is posted from here: there is
 *                      no connected publishing, so a planned day reads
 *                      "Ready to publish manually", with the files to
 *                      download and the words to copy.
 */
import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { Copy, Download, Image as ImageIcon, Loader, CalendarDays, ChevronLeft, ChevronRight, Check } from 'lucide-react';
import { videoLibrary, clock, bytesLabel, STATUS_LABEL, type LibraryItem, type LibrarySource, type OutputStatus } from '../../services/videoStudio';

function useLibrary() {
  const [data, setData] = useState<{ items: LibraryItem[]; sources: LibrarySource[] } | null>(null);
  const [error, setError] = useState('');
  useEffect(() => {
    let alive = true;
    void videoLibrary().then(r => { if (!alive) return; if (r.success) setData({ items: r.items, sources: r.sources }); else setError(r.error ?? 'Could not load.'); });
    return () => { alive = false; };
  }, []);
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

export function MediaLibrary() {
  const { data, error } = useLibrary();
  if (error) return <div className="vs-note bad">{error}</div>;
  if (!data) return <p className="vs-sub"><Loader size={14} className="spin" /> Loading…</p>;
  if (!data.sources.length) return <div className="vs-card vs-empty">No recordings yet. A new video project starts with one.</div>;
  return (
    <div className="vs-grid" data-testid="vs-media">
      {data.sources.map(s => (
        <Link key={s.projectId} to={`/video-studio/${s.projectId}`} className="vs-card vs-proj" style={{ textDecoration: 'none', color: 'inherit' }}>
          <div className="vs-poster" style={s.posterUrl ? { backgroundImage: `url("${s.posterUrl}")` } : undefined}>
            {s.duration > 0 && <span className="vs-dur">{clock(s.duration)}</span>}
          </div>
          <div className="vs-proj-body">
            <b>{s.name || 'Recording'}</b>
            <span>{s.projectName} · {bytesLabel(s.bytes)}{s.width ? ` · ${s.width}×${s.height}` : ''}</span>
            <span>Original kept unchanged</span>
          </div>
        </Link>
      ))}
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
