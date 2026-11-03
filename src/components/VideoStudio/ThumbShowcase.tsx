/**
 * A video's thumbnail, shown big — on the board (OutputsBoard) and in
 * Publishing (PublishPanel). The owner found the old row of 88-pixel tiles
 * at the bottom of each video impossible to judge: the chosen thumbnail is
 * now a large 16:9 picture (9:16 for a Short) with Download PNG, Edit (the
 * thumbnail designer, from that thumbnail's own spec) and Edit in Graphics
 * Designer & Editor, and the others are a strip of larger picks, each with
 * "Use this one".
 *
 * Thumbnails are made only when asked (since 2026-11). "Create a thumbnail"
 * first asks for an example the customer likes (`ThumbStart`): the picture is
 * uploaded, read by AI into a style, and two are drawn in it — or, with no
 * example, three in the modern look. Whatever came of the reading is said:
 * what was read, or why it could not be and that the modern look was used.
 */
import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Download, Image as ImageIcon, ImagePlus, Loader, Paintbrush, Pencil, Sparkles, Upload, Wand2, X, Check } from 'lucide-react';
import { useApp } from '../../context/AppContext';
import { thumbAsDesign } from './designerHandoff';
import ThumbnailDesigner from './ThumbnailDesigner';
import { chooseThumb, createThumbnails, uploadThumbExample, videoStatus, type OutputView, type ThumbView } from '../../services/videoStudio';
import type { EditorCtx } from './VideoEditor';

/** Opens a thumbnail as a new design in the Graphics Designer & Editor (see designerHandoff.ts). */
export function useEditInDesigner(ctx: EditorCtx) {
  const { addSocialPost } = useApp() as unknown as { addSocialPost: (p: import('../SocialCreator/types').DesignPost) => void };
  const navigate = useNavigate();
  const [busy, setBusy] = useState(false);
  const open = async (o: OutputView, t: ThumbView) => {
    if (busy) return;
    setBusy(true);
    const r = await thumbAsDesign(o, t, ctx.view.project.id);
    setBusy(false);
    if (!r.ok) { ctx.say({ who: 'ai', text: r.error }); return; }
    addSocialPost(r.post);
    navigate(`/social-creator/editor/${r.post.id}`);
  };
  return { open, busy };
}

/** "Create a thumbnail": an example first, or the modern look. */
function ThumbStart({ ctx, o, onClose, onDone }: { ctx: EditorCtx; o: OutputView; onClose: () => void; onDone: (note: string) => void }) {
  const [file, setFile] = useState<File | null>(null);
  const [seen, setSeen] = useState('');
  const [busy, setBusy] = useState('');
  const [err, setErr] = useState('');
  const gone = useRef(false);
  useEffect(() => () => { gone.current = true; }, []);
  useEffect(() => {
    if (!file) { setSeen(''); return; }
    const u = URL.createObjectURL(file);
    setSeen(u);
    return () => URL.revokeObjectURL(u);
  }, [file]);
  useEffect(() => {
    const k = (e: KeyboardEvent) => { if (e.key === 'Escape' && !busy) onClose(); };
    window.addEventListener('keydown', k);
    return () => window.removeEventListener('keydown', k);
  }, [busy, onClose]);
  const pid = ctx.view.project.id;
  const go = async (withExample: boolean) => {
    setErr('');
    let key: string | undefined;
    let palette: string[] = [];
    if (withExample) {
      if (!file) { setErr('Attach an example first — or design a modern one.'); return; }
      setBusy('Uploading your example…');
      const up = await uploadThumbExample(pid, o.id, file);
      if (!up.ok) { setBusy(''); setErr(up.error); return; }
      key = up.key; palette = up.palette;
      setBusy('Reading your example’s design…');
    } else setBusy('Starting…');
    const r = await createThumbnails(pid, o.id, key, palette);
    if (!r.success) { setBusy(''); setErr(r.error ?? 'The thumbnail could not be started.'); return; }
    const note = r.note ?? '';
    setBusy(note ? `${note} Drawing it now…` : 'Drawing your thumbnails…');
    /* Asked of the server: the editor's own copy is a step behind while this waits. */
    for (let i = 0; i < 120 && !gone.current; i++) {
      await new Promise(res => setTimeout(res, 1500));
      const v = await videoStatus(pid, -1);
      if (!v.success) continue;
      const now = v.outputs.find(x => x.id === o.id);
      if (now?.thumbs.some(t => t.set === r.set)) break;
      const job = v.jobs.find(j => j.kind === 'thumbnails' && j.target === o.id && j.state === 'failed');
      const open = v.jobs.some(j => j.kind === 'thumbnails' && j.target === o.id && (j.state === 'queued' || j.state === 'running'));
      if (!open && job) { setBusy(''); setErr(job.error || 'The thumbnail could not be made.'); return; }
    }
    await ctx.refresh();
    onDone(note);
    onClose();
  };
  return (
    <div className="vs-modal-back" role="dialog" aria-modal="true" aria-label="Create a thumbnail" onClick={() => !busy && onClose()}>
      <div className="vs-modal ts-start" onClick={e => e.stopPropagation()} data-testid="vs-thumb-start">
        <div className="vs-row" style={{ marginBottom: 8 }}>
          <h2 style={{ margin: 0, fontSize: 17 }}><ImagePlus size={17} /> Create a thumbnail</h2>
          <span className="vs-spacer" />
          <button type="button" className="vs-btn ghost sm" onClick={onClose} disabled={!!busy} aria-label="Close"><X size={15} /></button>
        </div>
        <p className="vs-sub" style={{ marginTop: 0 }}>Attach an example thumbnail you like — we'll design yours in that style, with this video's own title and face.</p>
        <label className={`ts-drop ${seen ? 'has' : ''}`} data-field="video.thumbExample"
          onDragOver={e => e.preventDefault()} onDrop={e => { e.preventDefault(); const f = e.dataTransfer.files?.[0]; if (f) setFile(f); }}>
          {seen ? <img src={seen} alt="Your example thumbnail" /> : <span><Upload size={18} /><b>Choose or drop an example</b><small>A JPEG, PNG or WebP — a screenshot of a thumbnail you like is fine</small></span>}
          <input type="file" accept="image/png,image/jpeg,image/webp" onChange={e => setFile(e.target.files?.[0] ?? null)} disabled={!!busy} data-testid="vs-thumb-example" />
        </label>
        {err && <div className="vs-note bad" role="alert">{err}</div>}
        {busy ? (
          <div className="vs-note" role="status" data-testid="vs-thumb-start-busy"><Loader size={14} className="spin" /> <span>{busy}</span></div>
        ) : (
          <div className="ts-start-acts">
            <button type="button" className="vs-btn ai" disabled={!file} onClick={() => void go(true)} data-act="thumb-from-example"><Sparkles size={15} /> Design mine in this style</button>
            <button type="button" className="vs-btn" onClick={() => void go(false)} data-act="thumb-modern"><Wand2 size={15} /> I don't have one — design a modern one</button>
          </div>
        )}
        <small className="vs-kbd">The example is read by AI for its look only — its words are never copied — and deleted once read. You can change the words and everything else afterwards.</small>
      </div>
    </div>
  );
}

export default function ThumbShowcase({ ctx, o, testId = "vs-board-thumbs" }: { ctx: EditorCtx; o: OutputView; testId?: string }) {
  const designer = useEditInDesigner(ctx);
  const [start, setStart] = useState(false);
  const [edit, setEdit] = useState<ThumbView | null | 'new'>(null);
  const [note, setNote] = useState('');
  const pid = ctx.view.project.id;
  const tall = o.kind === 'short';
  const making = ctx.view.jobs.some(j => j.target === o.id && j.kind === 'thumbnails' && (j.state === 'queued' || j.state === 'running'));
  const chosen = o.thumbs[o.chosenThumb] ?? o.thumbs[0];
  const others = o.thumbs.filter(t => t !== chosen).slice(-8).reverse();
  const canMake = !!ctx.view.source.probe;
  return (
    <div className={`ts ${tall ? "tall" : ""}`} data-testid={testId}>
      <div className="ts-big">
        {chosen ? (
          <img src={chosen.url} alt={`The chosen thumbnail: ${chosen.headline}`} data-testid="vs-thumb-chosen" />
        ) : (
          <div className="ts-empty">
            {making ? <><Loader size={20} className="spin" /><b>Making your thumbnail…</b></> : <><ImageIcon size={22} /><b>No thumbnail yet</b><small>Made when you ask — from an example you like, or in the modern style</small></>}
          </div>
        )}
        {chosen && <span className="ts-size">{chosen.width}×{chosen.height} PNG</span>}
      </div>
      <div className="ts-side">
        <div className="ts-head"><b>Thumbnail</b>{making && <span className="vs-kbd"><Loader size={12} className="spin" /> Making…</span>}</div>
        {note && <div className="vs-note ok" role="status" data-testid="vs-thumb-note"><Check size={14} /> <span>{note}</span></div>}
        <div className="ts-acts">
          {chosen?.verified && <a className="ob-act primary" href={chosen.downloadUrl} download data-act="board-png"><Download size={14} /> Download PNG</a>}
          {chosen?.verified && <button type="button" className="ob-act" onClick={() => setEdit(chosen)} data-act="design-thumb"><Pencil size={14} /> Edit words and look</button>}
          {chosen?.verified && (
            <button type="button" className="ob-act" disabled={designer.busy} onClick={() => void designer.open(o, chosen)} data-act="board-edit-in-designer">
              {designer.busy ? <Loader size={14} className="spin" /> : <Paintbrush size={14} />} Edit in Graphics Designer & Editor
            </button>
          )}
          {canMake && !making && (
            <button type="button" className={`ob-act ${chosen ? '' : 'ai'}`} onClick={() => setStart(true)} data-act="board-more-thumbs">
              <ImagePlus size={14} /> {chosen ? 'New thumbnail' : 'Create a thumbnail'}
            </button>
          )}
          {canMake && <button type="button" className="ob-act" onClick={() => setEdit('new')} data-act="design-new-thumb"><Wand2 size={14} /> Design one yourself</button>}
        </div>
        {chosen && !chosen.verified && <small className="vs-kbd">{chosen.check}</small>}
        {others.length > 0 && (
          <div className="ts-strip" aria-label="Other thumbnails">
            {others.map(t => (
              <div key={t.index} className="ts-pick">
                <img src={t.url} alt={`Thumbnail ${t.index + 1}: ${t.headline}`} loading="lazy" title={t.verified ? `${t.layout} · ${t.check}` : t.check} />
                <div className="ts-pick-acts">
                  <button type="button" className="vs-btn sm" disabled={!t.verified} onClick={() => void chooseThumb(pid, o.id, t.index).then(() => ctx.refresh())} data-act="use-thumb"><Check size={12} /> Use this one</button>
                  {t.verified && <button type="button" className="vs-btn ghost sm" onClick={() => setEdit(t)} aria-label={`Edit thumbnail ${t.index + 1}`} title="Edit"><Pencil size={12} /></button>}
                  {t.verified && <button type="button" className="vs-btn ghost sm" disabled={designer.busy} onClick={() => void designer.open(o, t)} data-act="edit-in-designer" title="Edit in Graphics Designer & Editor" aria-label={`Edit thumbnail ${t.index + 1} in Graphics Designer & Editor`}><Paintbrush size={12} /></button>}
                  {t.verified && <a className="vs-btn ghost sm" href={t.downloadUrl} download aria-label={`Download thumbnail ${t.index + 1}`} title="Download PNG"><Download size={12} /></a>}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
      {start && <ThumbStart ctx={ctx} o={o} onClose={() => setStart(false)} onDone={setNote} />}
      {edit && <ThumbnailDesigner ctx={ctx} o={o} startFrom={edit === "new" ? null : edit} onClose={() => setEdit(null)} />}
    </div>
  );
}
