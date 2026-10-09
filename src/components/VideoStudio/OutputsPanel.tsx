/**
 * Exports: every video this project makes, each with its own files,
 * thumbnails and words.
 *
 *   - the MP4 (watch it here, download it), SRT and VTT;
 *   - PNG thumbnails, each marked with the check it passed (signature,
 *     header, size) — one that failed cannot be chosen or downloaded;
 *   - metadata written from *that* video's words: titles, description,
 *     keywords, tags, hashtags, chapters (long video), pinned comment, CTA;
 *   - its status: Needs review → Approved → Ready to publish. "Ready to
 *     publish" means ready for a person to post — there is no connected
 *     publishing, and nothing here says otherwise.
 */
import { useState } from 'react';
import { Download, Image as ImageIcon, Play, RefreshCw, Check, Send, Wand2, CalendarDays, X, Loader, ShieldCheck, ShieldAlert, Clapperboard } from 'lucide-react';
import {
  chooseThumb, moreThumbnails, setOutputStatus, updateMeta, regenerateMeta, renderOutputs, clock, bytesLabel, STATUS_LABEL,
  type OutputView, type VideoMeta,
} from '../../services/videoStudio';
import { CopyButton } from './VideoLibrary';
import type { EditorCtx } from './VideoEditor';

function MetaEditor({ ctx, o }: { ctx: EditorCtx; o: OutputView }) {
  const m = o.meta as Partial<VideoMeta>;
  const [draft, setDraft] = useState({
    title: m.titles?.[0] ?? o.title, description: m.description ?? '', hashtags: (m.hashtags ?? []).join(' '), tags: (m.tags ?? []).join(', '),
    keywords: (m.keywords ?? []).join(', '), pinnedComment: m.pinnedComment ?? '', cta: m.cta ?? '',
  });
  const [msg, setMsg] = useState('');
  if (!m.titles) return <p className="vs-sub" style={{ margin: 0 }}><Loader size={13} className="spin" /> Writing titles and a description from this video's words…</p>;
  const save = async () => {
    const r = await updateMeta(ctx.view.project.id, o.id, {
      titles: [draft.title, ...(m.titles ?? []).filter(t => t !== draft.title)], description: draft.description,
      hashtags: draft.hashtags.split(/[\s,]+/).filter(Boolean), tags: draft.tags.split(',').map(s => s.trim()).filter(Boolean),
      keywords: draft.keywords.split(',').map(s => s.trim()).filter(Boolean), pinned_comment: draft.pinnedComment, cta: draft.cta,
    });
    setMsg(r.success ? 'Saved.' : r.error ?? 'Could not save.');
    if (r.success) void ctx.refresh();
    setTimeout(() => setMsg(''), 2500);
  };
  const caption = [draft.title, draft.hashtags].filter(Boolean).join('\n\n');
  return (
    <div className="vs-col" data-testid="vs-meta" style={{ gap: 8 }}>
      <div className="vs-row"><b style={{ fontSize: 13 }}>Titles and description</b><span className="vs-kbd">{m.by === 'ai' ? 'written by AI from this video' : m.by === 'rules' ? 'from this video\'s own words (no AI)' : 'edited by you'}</span></div>
      {(m.titles ?? []).length > 1 && <div className="vs-chips">{m.titles!.map(t => <button key={t} type="button" className="vs-chip" aria-pressed={draft.title === t} onClick={() => setDraft(d => ({ ...d, title: t }))}>{t}</button>)}</div>}
      <label className="vs-label">Title <input className="vs-input" value={draft.title} maxLength={100} onChange={e => setDraft(d => ({ ...d, title: e.target.value }))} data-testid="vs-meta-title" /></label>
      <label className="vs-label">Description <textarea className="vs-textarea" rows={o.kind === 'long' ? 7 : 3} value={draft.description} onChange={e => setDraft(d => ({ ...d, description: e.target.value }))} data-testid="vs-meta-description" /></label>
      <div className="vs-row">
        <label className="vs-label" style={{ flex: 1 }}>Hashtags <input className="vs-input" value={draft.hashtags} onChange={e => setDraft(d => ({ ...d, hashtags: e.target.value }))} /></label>
        <label className="vs-label" style={{ flex: 1 }}>Tags <input className="vs-input" value={draft.tags} onChange={e => setDraft(d => ({ ...d, tags: e.target.value }))} /></label>
      </div>
      <label className="vs-label">Keywords <input className="vs-input" value={draft.keywords} onChange={e => setDraft(d => ({ ...d, keywords: e.target.value }))} /></label>
      <label className="vs-label">Pinned comment <input className="vs-input" value={draft.pinnedComment} onChange={e => setDraft(d => ({ ...d, pinnedComment: e.target.value }))} /></label>
      <label className="vs-label">Call to action <input className="vs-input" value={draft.cta} onChange={e => setDraft(d => ({ ...d, cta: e.target.value }))} /></label>
      {o.kind === 'long' && (m.chapters?.length ?? 0) > 0 && (
        <div className="vs-col" style={{ gap: 2 }}><b style={{ fontSize: 12.5 }}>Chapters (timed to the edited video)</b>{m.chapters!.map(c => <span key={c.s} style={{ fontSize: 12.5 }}>{clock(c.s)} {c.title}</span>)}</div>
      )}
      <div className="vs-row">
        <button type="button" className="vs-btn primary sm" onClick={() => void save()}><Check size={13} /> Save words</button>
        <button type="button" className="vs-btn sm" onClick={() => void regenerateMeta(ctx.view.project.id, o.id).then(() => ctx.refresh())}><Wand2 size={13} /> Write again</button>
        <CopyButton text={caption} label="Copy caption" />
        <CopyButton text={draft.description} label="Copy description" />
        <CopyButton text={draft.hashtags} label="Copy hashtags" />
        {msg && <span className="vs-kbd">{msg}</span>}
      </div>
    </div>
  );
}

function Thumbs({ ctx, o }: { ctx: EditorCtx; o: OutputView }) {
  const [headline, setHeadline] = useState('');
  const [asked, setAsked] = useState(false);
  const pending = ctx.view.jobs.some(j => j.kind === 'thumbnails' && j.target === o.id && (j.state === 'queued' || j.state === 'running'));
  return (
    <div className="vs-col" style={{ gap: 8 }} data-testid="vs-thumbs">
      <b style={{ fontSize: 13 }}>PNG thumbnails {o.kind === 'short' ? '(1080×1920 cover)' : '(1280×720)'}</b>
      {o.thumbs.length > 0 && (
        <div className="vs-thumbs" style={o.kind === 'short' ? { gridTemplateColumns: 'repeat(auto-fill, minmax(90px, 1fr))' } : undefined}>
          {o.thumbs.map(t => (
            <button key={t.index} type="button" className="vs-thumbopt" aria-pressed={o.chosenThumb === t.index} disabled={!t.verified} data-verified={t.verified}
              onClick={() => void chooseThumb(ctx.view.project.id, o.id, t.index).then(() => ctx.refresh())} title={t.check}>
              <img src={t.url} alt={`Thumbnail option ${t.index + 1}: ${t.headline}`} loading="lazy" />
              <small className={t.verified ? '' : 'bad'}>{t.verified ? <><ShieldCheck size={11} /> PNG {t.width}×{t.height}</> : <><ShieldAlert size={11} /> {t.check}</>}</small>
              {t.verified && <a href={t.downloadUrl} onClick={e => e.stopPropagation()} style={{ fontSize: 11.5 }}>Download PNG</a>}
            </button>
          ))}
        </div>
      )}
      {pending ? <p className="vs-sub" style={{ margin: 0 }}><Loader size={13} className="spin" /> Making thumbnails…</p> : (
        <div className="vs-row">
          <input className="vs-input" style={{ flex: 1, minWidth: 160 }} placeholder="Exact headline (optional)" value={headline} maxLength={90} onChange={e => setHeadline(e.target.value)} aria-label="Thumbnail headline" />
          <button type="button" className="vs-btn sm" disabled={asked} data-act="more-thumbs" onClick={() => { setAsked(true); void moreThumbnails(ctx.view.project.id, o.id, headline || undefined).then(r => { setAsked(false); if (!r.success) ctx.say({ who: 'ai', text: r.error ?? 'Could not make thumbnails.' }); void ctx.refresh(); }); }}>
            <ImageIcon size={13} /> {o.thumbs.length ? 'Create another set' : 'Create thumbnails'}
          </button>
        </div>
      )}
      <span className="vs-kbd">Headlines are set in type exactly as written — never drawn by an image model.</span>
    </div>
  );
}

export default function OutputsPanel({ ctx }: { ctx: EditorCtx }) {
  const { view } = ctx;
  const [open, setOpen] = useState<string>(view.outputs[0]?.id ?? '');
  const [watch, setWatch] = useState<OutputView | null>(null);
  if (!view.outputs.length) return <p className="vs-sub">The long video and the Shorts appear here as they are made.</p>;
  const shortN = (o: OutputView) => view.outputs.filter(x => x.kind === 'short').findIndex(x => x.id === o.id) + 1;
  return (
    <div className="vs-col" data-testid="vs-outputs">
      <div className="vs-note"><Send size={15} /> <span>Direct posting to social platforms is not connected, so nothing is published for you. <b>Ready to publish</b> means ready for you to post: download the video and PNG, copy the words.</span></div>
      {view.outputs.map(o => {
        const job = view.jobs.find(j => j.target === o.id && j.kind === 'render' && (j.state === 'queued' || j.state === 'running'));
        const thumb = o.thumbs[o.chosenThumb] ?? o.thumbs[0];
        return (
          <div key={o.id} className="vs-item" data-testid="vs-output" data-kind={o.kind} data-status={o.status} data-output={o.id}>
            <div className="vs-row" style={{ cursor: 'pointer' }} onClick={() => setOpen(x => x === o.id ? '' : o.id)}>
              <div className={`vs-thumb ${o.kind === 'short' ? 'tall' : ''}`} style={{ width: o.kind === 'short' ? 46 : 96, flex: 'none', ...(thumb ? { backgroundImage: `url("${thumb.url}")` } : {}) }} />
              <div style={{ flex: 1, minWidth: 0 }}>
                <b style={{ display: 'block', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{o.kind === 'long' ? 'Long video' : `Short ${shortN(o)}`} · {o.title}</b>
                <span className="vs-meta">{o.rendered ? <>{clock(o.duration)} · {o.width}×{o.height} · {bytesLabel(o.bytes)}</> : 'Not rendered yet'}{o.publishAt ? <> · <CalendarDays size={11} /> {new Date(o.publishAt).toLocaleDateString()}</> : null}</span>
              </div>
              <span className={`vs-badge ${o.status}`} data-testid="vs-output-status">{job ? (job.progress !== null ? `Rendering ${Math.round(job.progress)}%` : 'Rendering…') : o.stale ? 'Edited — render again' : STATUS_LABEL[o.status]}</span>
            </div>
            {open === o.id && (
              <div className="vs-col" style={{ gap: 12, marginTop: 6 }}>
                {o.error && <div className="vs-note bad">{o.error} <button type="button" className="vs-btn sm" onClick={() => void renderOutputs(view.project.id, [o.id]).then(() => ctx.refresh())}><RefreshCw size={13} /> Try again</button></div>}
                <div className="vs-row">
                  {o.mp4Url && <button type="button" className="vs-btn sm" onClick={() => setWatch(o)}><Play size={13} /> Watch</button>}
                  {o.downloadUrl && <a className="vs-btn sm" href={o.downloadUrl} data-act="download-mp4"><Download size={13} /> MP4</a>}
                  {thumb?.verified && <a className="vs-btn sm" href={thumb.downloadUrl} data-act="download-png"><ImageIcon size={13} /> PNG</a>}
                  {o.srtUrl && <a className="vs-btn sm" href={o.srtUrl}>SRT</a>}
                  {o.vttUrl && <a className="vs-btn sm" href={o.vttUrl}>VTT</a>}
                  {o.stale && <button type="button" className="vs-btn ai sm" onClick={() => void renderOutputs(view.project.id, [o.id]).then(() => ctx.refresh())}><Clapperboard size={13} /> Render again</button>}
                  {o.kind === 'short' && <button type="button" className="vs-btn ghost sm" onClick={() => { ctx.setActiveClip(o.clipId); ctx.setTab('shorts'); }}>Edit this Short</button>}
                </div>
                {o.rendered && (
                  <div className="vs-row">
                    <span className="vs-kbd">Status</span>
                    {(['needs_review', 'approved', 'ready_to_publish'] as const).map(s => (
                      <button key={s} type="button" className="vs-chip" aria-pressed={o.status === s} data-status-btn={s}
                        onClick={() => void setOutputStatus(view.project.id, o.id, s).then(() => ctx.refresh())}>{STATUS_LABEL[s]}</button>
                    ))}
                    <label className="vs-row" style={{ gap: 6, fontSize: 12.5, color: 'var(--muted)' }}>Plan to post
                      <input type="date" className="vs-input" style={{ width: 'auto', padding: '4px 8px' }} value={o.publishAt ? o.publishAt.slice(0, 10) : ''}
                        onChange={e => void setOutputStatus(view.project.id, o.id, o.status === 'needs_review' ? 'ready_to_publish' : o.status, e.target.value ? `${e.target.value}T12:00:00Z` : null).then(() => ctx.refresh())} />
                    </label>
                  </div>
                )}
                {o.rendered && <Thumbs ctx={ctx} o={o} />}
                <MetaEditor key={`${o.id}:${JSON.stringify(o.meta).length}`} ctx={ctx} o={o} />
              </div>
            )}
          </div>
        );
      })}
      {watch && (
        <div className="vs-modal-back" onClick={() => setWatch(null)} role="dialog" aria-modal="true" aria-label={watch.title}>
          <div className="vs-modal" onClick={e => e.stopPropagation()} style={{ maxWidth: watch.kind === 'short' ? 420 : 960 }}>
            <div className="vs-row" style={{ marginBottom: 8 }}><b>{watch.title}</b><span className="vs-spacer" /><button type="button" className="vs-btn ghost sm" onClick={() => setWatch(null)} aria-label="Close"><X size={15} /></button></div>
            <video src={watch.mp4Url} controls autoPlay playsInline style={{ width: '100%', maxHeight: '78vh', borderRadius: 12, background: '#000' }} data-testid="vs-watch" />
            <p className="vs-kbd">The rendered file — exactly what downloads.</p>
          </div>
        </div>
      )}
    </div>
  );
}
