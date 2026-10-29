/**
 * The Media Center's pictures: graphics exported from the Graphics Designer
 * and pictures uploaded to design with (routes/media.ts). Shown under the
 * recordings so the Media Library is one place for everything made here.
 */
import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Download, Image as ImageIcon, Loader, Palette, Trash2 } from 'lucide-react';
import { deleteMedia, listMedia, type MediaItem } from '../SocialCreator/design/media';
import { askConfirm } from '../shared/ConfirmDialog';
import { bytesLabel } from '../../services/videoStudio';

export default function MediaGraphics() {
  const [items, setItems] = useState<MediaItem[] | null>(null);
  const [error, setError] = useState('');
  const [kind, setKind] = useState<'graphic' | 'upload'>('graphic');
  useEffect(() => {
    let alive = true;
    void listMedia(kind).then(r => { if (!alive) return; if (r.success) { setItems(r.items); setError(''); } else { setError(r.error ?? 'Could not load the pictures.'); setItems([]); } });
    return () => { alive = false; };
  }, [kind]);
  const remove = async (m: MediaItem) => {
    if (!await askConfirm({ title: 'Delete this picture?', message: `“${m.name}” is removed from the Media Center. A design that uses it will show a placeholder.`, confirmLabel: 'Delete', danger: true })) return;
    const r = await deleteMedia(m.id);
    if (r.success) setItems(list => (list ?? []).filter(x => x.id !== m.id)); else setError(r.error ?? 'Could not delete it.');
  };
  return (
    <section className="vs-col" style={{ gap: 10 }} data-testid="vs-media-graphics">
      <div className="vs-row">
        <h3 style={{ margin: 0, display: 'flex', gap: 6, alignItems: 'center' }}><ImageIcon size={17} /> Graphics &amp; pictures</h3>
        <span className="vs-spacer" />
        <button type="button" className="vs-chip" aria-pressed={kind === 'graphic'} onClick={() => { if (kind !== 'graphic') { setItems(null); setKind('graphic'); } }}>Finished graphics</button>
        <button type="button" className="vs-chip" aria-pressed={kind === 'upload'} onClick={() => { if (kind !== 'upload') { setItems(null); setKind('upload'); } }}>Uploaded pictures</button>
      </div>
      {error && <div className="vs-note bad">{error}</div>}
      {!items ? <p className="vs-sub"><Loader size={14} className="spin" /> Loading…</p>
        : !items.length && !error ? (
          <div className="vs-card vs-empty">{kind === 'graphic' ? <>No graphics saved yet. Make one in the <Link to="/social-creator">Graphics Designer</Link> and press <b>Save to Media Center</b>.</> : 'No uploaded pictures yet. Pictures you upload while designing are kept here.'}</div>
        ) : (
          <div className="vs-grid">
            {items.map(m => (
              <div key={m.id} className="vs-card vs-proj" style={{ cursor: 'default' }} data-testid="vs-graphic">
                <div className="vs-poster" style={{ backgroundImage: `url("${m.url}")`, backgroundSize: 'contain', backgroundRepeat: 'no-repeat', backgroundColor: '#f3f1ec' }} />
                <div className="vs-proj-body">
                  <b>{m.name}</b>
                  <span>{m.width && m.height ? `${m.width}×${m.height} · ` : ''}{bytesLabel(m.bytes)} · {new Date(m.createdAt).toLocaleDateString()}</span>
                  {m.source?.license && <span>{m.source.license}</span>}
                  <div className="vs-row" style={{ marginTop: 4 }}>
                    <a className="vs-btn sm" href={m.downloadUrl}><Download size={13} /> Download</a>
                    {m.designId && <Link className="vs-btn sm" to={`/social-creator/design/${m.designId}`}><Palette size={13} /> Edit design</Link>}
                    <button type="button" className="vs-btn sm ghost" onClick={() => void remove(m)} aria-label={`Delete ${m.name}`}><Trash2 size={13} /></button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
    </section>
  );
}
