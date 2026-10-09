/**
 * AI Video Studio's outputs inside the Content Library (Content →
 * Repurposing → Library): long videos and Shorts, each with its PNG
 * thumbnail and its status — Processing, Needs review, Approved, Ready to
 * publish. Read from the server, never copied into the browser's library,
 * so the two can never disagree. Self-contained styles: the library is in
 * the main bundle and the studio's stylesheet is not.
 */
import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Clapperboard, Download, Image as ImageIcon } from 'lucide-react';
import { videoLibrary, clock, STATUS_LABEL, type LibraryItem } from '../../services/videoStudio';

const INK = '#17191c';
const MUTED = '#8a8f98';
const TONE: Record<string, [string, string]> = {
  processing: ['#efedfd', '#5b46e5'], needs_review: ['#fff4e5', '#b25e09'], approved: ['#e6f6ef', '#12805c'],
  ready_to_publish: ['#e7f6fd', '#0369a1'], failed: ['#fdecea', '#b42318'],
};

export default function ContentShelf() {
  const [items, setItems] = useState<LibraryItem[] | null>(null);
  const [kind, setKind] = useState<'long' | 'short'>('short');
  useEffect(() => { void videoLibrary().then(r => setItems(r.success ? r.items : [])); }, []);
  if (!items || !items.length) return null;
  const longs = items.filter(i => i.kind === 'long'), shorts = items.filter(i => i.kind === 'short');
  const rows = (kind === 'long' ? longs : shorts).slice(0, 24);
  const chip = (on: boolean): React.CSSProperties => ({ border: `1px solid ${on ? INK : '#e4e7ec'}`, background: on ? INK : '#fff', color: on ? '#fff' : INK, borderRadius: 99, padding: '5px 11px', fontSize: 12, fontWeight: 700, cursor: 'pointer' });
  return (
    <section style={{ backgroundColor: '#fff', borderRadius: 16, padding: 14, marginBottom: 16, boxShadow: '0 1px 2px rgba(23,25,28,0.05)' }} data-testid="content-videos" aria-label="Videos and Shorts">
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap', marginBottom: 10 }}>
        <Clapperboard size={17} color="#5b46e5" />
        <b style={{ fontSize: 14, color: INK, flex: 1 }}>Videos and Shorts <span style={{ fontWeight: 500, color: MUTED }}>— from AI Video Studio</span></b>
        <button type="button" style={chip(kind === 'short')} onClick={() => setKind('short')} aria-pressed={kind === 'short'}>Shorts {shorts.length}</button>
        <button type="button" style={chip(kind === 'long')} onClick={() => setKind('long')} aria-pressed={kind === 'long'}>Long videos {longs.length}</button>
        <Link to="/video-studio?tab=exports" style={{ fontSize: 12, fontWeight: 700 }}>Open AI Video Studio</Link>
      </div>
      <div style={{ display: 'grid', gap: 10, gridTemplateColumns: `repeat(auto-fill, minmax(${kind === 'short' ? 130 : 210}px, 1fr))` }}>
        {rows.map(it => {
          const [bg, fg] = TONE[it.status] ?? ['#f1f3f7', MUTED];
          return (
            <div key={it.id} style={{ border: '1px solid #eceef2', borderRadius: 12, overflow: 'hidden', display: 'grid' }} data-status={it.status} data-kind={it.kind}>
              <Link to={`/video-studio/${it.projectId}?tab=exports`} style={{ display: 'block', aspectRatio: kind === 'short' ? '9 / 16' : '16 / 9', background: it.thumbUrl ? `#0f1115 url("${it.thumbUrl}") center / cover` : '#0f1115' }} aria-label={it.title} />
              <div style={{ padding: '7px 9px', display: 'grid', gap: 4 }}>
                <b style={{ fontSize: 12, color: INK, display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>{it.title}</b>
                <span style={{ fontSize: 11, color: MUTED }}>{it.duration ? clock(it.duration) : ''} · {it.projectName}</span>
                <span style={{ justifySelf: 'start', fontSize: 10.5, fontWeight: 800, background: bg, color: fg, borderRadius: 99, padding: '1px 7px' }}>{it.status === 'ready_to_publish' ? 'Ready to publish' : STATUS_LABEL[it.status]}</span>
                <span style={{ display: 'flex', gap: 8 }}>
                  {it.downloadUrl && <a href={it.downloadUrl} style={{ fontSize: 11, display: 'inline-flex', gap: 3, alignItems: 'center' }}><Download size={11} /> MP4</a>}
                  {it.thumbDownload && <a href={it.thumbDownload} style={{ fontSize: 11, display: 'inline-flex', gap: 3, alignItems: 'center' }}><ImageIcon size={11} /> PNG</a>}
                </span>
              </div>
            </div>
          );
        })}
      </div>
    </section>
  );
}
