/**
 * Export: every video this project makes, what state its file is in, and
 * the one thing to press next — download it, render the change, or make it.
 *
 * Export used to scroll to the board under the editor, which lists only
 * videos already made. A Screen Recorder recording is saved with no long
 * video and no Shorts asked for (it is prepared and transcribed, nothing
 * rendered), so the board was empty and Export showed nothing. Here the long
 * video can be made from the dialog: the edit switches it on (`long.set`),
 * which adds it, and the render starts at once.
 */
import { useEffect, useState } from 'react';
import { Download, X, Clapperboard, Film, Loader, Check, AlertCircle, FileText, RefreshCw, Plus } from 'lucide-react';
import { renderOutputs, clock, bytesLabel, keepRanges, keptLength, type OutputView } from '../../services/videoStudio';
import type { EditorCtx } from './VideoEditor';

export default function ExportDialog({ ctx, onClose, onBoard }: { ctx: EditorCtx; onClose: () => void; onBoard: () => void }) {
  const { view, doc } = ctx;
  const [busy, setBusy] = useState('');
  const [err, setErr] = useState('');
  const outs = view.outputs;
  const long = outs.find(o => o.kind === 'long');
  const shorts = outs.filter(o => o.kind === 'short');
  const jobFor = (o: OutputView) => view.jobs.find(j => j.target === o.id && j.kind === 'render' && (j.state === 'queued' || j.state === 'running'));
  const stale = outs.filter(o => o.stale || (!o.rendered && o.status === 'failed'));
  useEffect(() => {
    const esc = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', esc);
    return () => window.removeEventListener('keydown', esc);
  }, [onClose]);

  const render = async (ids: string[], what: string) => {
    setBusy(what); setErr('');
    const r = await renderOutputs(view.project.id, ids);
    setBusy('');
    if (!r.success) setErr(r.error ?? 'Could not start the render.');
    void ctx.refresh();
  };
  const makeLong = async () => {
    setBusy('long'); setErr('');
    const ok = await ctx.apply([{ op: 'long.set', patch: { on: true } }], 'Make the long video');
    if (ok) { const r = await renderOutputs(view.project.id); if (!r.success) setErr(r.error ?? 'Could not start the render.'); }
    setBusy('');
    void ctx.refresh();
  };

  const row = (o: OutputView, name: string) => {
    const job = jobFor(o);
    const ready = o.rendered && !job;
    return (
      <div key={o.id} className="vs-exp-row" data-export={o.kind} data-state={job ? 'rendering' : o.stale ? 'stale' : ready ? 'ready' : o.status}>
        <span className="vs-exp-ic">{o.kind === 'long' ? <Clapperboard size={16} /> : <Film size={16} />}</span>
        <div className="vs-exp-main">
          <b title={o.title}>{name}</b>
          <small>
            {job ? `Rendering — ${job.stage || 'starting'}${typeof job.progress === 'number' ? `, ${Math.round(job.progress)}%` : ''}`
              : o.status === 'failed' ? (o.error || 'The render stopped.')
                : ready ? `${clock(o.duration)} · ${o.width}×${o.height}${o.bytes ? ` · ${bytesLabel(o.bytes)}` : ''}${o.stale ? ' · edited since — render again for the latest' : ''}`
                  : 'Not made yet'}
          </small>
          {job && <div className={`vs-bar ${typeof job.progress === 'number' ? '' : 'indet'}`}><i style={{ width: `${job.progress ?? 35}%` }} /></div>}
        </div>
        <div className="vs-exp-acts">
          {ready && o.downloadUrl && <a className="vs-btn primary sm" href={o.downloadUrl} download data-act="download-mp4"><Download size={13} /> MP4</a>}
          {ready && o.srtUrl && <a className="vs-btn ghost sm" href={o.srtUrl} download title="Captions (SRT)"><FileText size={13} /> SRT</a>}
          {!job && (o.stale || o.status === 'failed' || !o.rendered) && (
            <button type="button" className="vs-btn sm" disabled={!!busy} onClick={() => void render([o.id], o.id)} data-act="render-one">
              {busy === o.id ? <Loader size={13} className="spin" /> : <RefreshCw size={13} />} {o.rendered ? 'Render again' : 'Render'}
            </button>
          )}
          {job && <span className="vs-badge processing"><Loader size={12} className="spin" /> {typeof job.progress === 'number' ? `${Math.round(job.progress)}%` : 'Working'}</span>}
        </div>
      </div>
    );
  };

  return (
    <div className="vs-modal-back" role="dialog" aria-modal="true" aria-label="Export" onClick={onClose}>
      <div className="vs-modal vs-export" style={{ maxWidth: 640 }} onClick={e => e.stopPropagation()} data-testid="vs-export">
        <div className="vs-row" style={{ marginBottom: 4 }}>
          <h2 style={{ margin: 0, fontSize: 18 }}><Download size={17} /> Export</h2>
          <span className="vs-spacer" />
          <button type="button" className="vs-btn ghost sm" onClick={onClose} aria-label="Close"><X size={16} /></button>
        </div>
        <p className="vs-sub" style={{ marginBottom: 10 }}>Each video is made with every edit, sound fix, caption, text and logo you set. Download it once it is made; progress also shows on the right.</p>

        {!long && (
          <div className="vs-exp-row" data-export="long" data-state="none">
            <span className="vs-exp-ic"><Clapperboard size={16} /></span>
            <div className="vs-exp-main"><b>Long video</b><small>{ctx.duration ? `${clock(keptLength(keepRanges(ctx.duration, doc)))} after your cuts · not made yet` : 'Add or record a video first'}</small></div>
            <div className="vs-exp-acts">
              <button type="button" className="vs-btn primary sm" disabled={!!busy || !ctx.duration} onClick={() => void makeLong()} data-act="make-long">
                {busy === 'long' ? <Loader size={13} className="spin" /> : <Plus size={13} />} Make the video
              </button>
            </div>
          </div>
        )}
        {long && row(long, 'Long video')}
        {shorts.map((o, i) => row(o, `Short ${i + 1} · ${o.title}`))}
        {!shorts.length && <p className="vs-kbd" style={{ margin: '8px 2px' }}>No Shorts yet — make one from the composition menu (top bar) or the timeline (mark a stretch, then M).</p>}

        {err && <div className="vs-note bad" role="alert"><AlertCircle size={15} /> {err}</div>}
        <div className="vs-row" style={{ marginTop: 12, gap: 8 }}>
          {stale.length > 1 && <button type="button" className="vs-btn sm" disabled={!!busy} onClick={() => void render(stale.map(o => o.id), 'all')}>{busy === 'all' ? <Loader size={13} className="spin" /> : <RefreshCw size={13} />} Render all {stale.length}</button>}
          <span className="vs-spacer" />
          {outs.some(o => o.rendered) && <button type="button" className="vs-btn ghost sm" onClick={onBoard} data-act="export-board"><Check size={13} /> Thumbnails, words and more</button>}
        </div>
      </div>
    </div>
  );
}
