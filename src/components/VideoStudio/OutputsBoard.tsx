/**
 * Every video this project makes, under the editor — one row each, laid out
 * like the reference the owner shared: the score, a playable preview with its
 * thumbnail, the title, the words (description or transcript), the time it
 * comes from, its keywords, hashtags and chapters, the thumbnails, and every
 * way to take it away.
 *
 * Honest about each part:
 *   - the score is the AI's *editorial* reading of the passage (hook, flow,
 *     value, whether it stands alone) — never a forecast of views; a Short
 *     chosen by rule or by hand says it has none;
 *   - before a video is rendered its preview is the low-resolution proxy over
 *     the same stretch, labelled so, and it does not skip the cuts;
 *   - downloads are the files that exist at the size they were made — no
 *     "4K" button on a 1080p render;
 *   - Export XML is the cut list for Premiere Pro or DaVinci Resolve, which
 *     re-links to the customer's own copy of the recording.
 */
import { useMemo, useState } from 'react';
import {
  Download, Image as ImageIcon, FileCode2, Copy as CopyIcon, Pencil, Wand2, CopyPlus, Clapperboard, Loader, Captions as CaptionsIcon, LayoutGrid, List, Check, ShieldCheck,
} from 'lucide-react';
import {
  clock, keepRanges, keptLength, toXmeml, editorialScore, renderOutputs, setOutputStatus, chooseThumb, moreThumbnails, STATUS_LABEL,
  type OutputView, type VideoMeta,
} from '../../services/videoStudio';
import { MetaEditor } from './OutputsPanel';
import ThumbnailDesigner from './ThumbnailDesigner';
import type { EditorCtx } from './VideoEditor';

function save(name: string, body: string, type: string) {
  const url = URL.createObjectURL(new Blob([body], { type }));
  const a = document.createElement('a');
  a.href = url; a.download = name; a.click();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}

function CopyBtn({ text, label }: { text: string; label: string }) {
  const [done, setDone] = useState(false);
  return <button type="button" className="ob-act" disabled={!text} onClick={() => { void navigator.clipboard?.writeText(text).then(() => { setDone(true); setTimeout(() => setDone(false), 1400); }); }}>{done ? <Check size={14} /> : <CopyIcon size={14} />} {done ? 'Copied' : label}</button>;
}

function Row({ ctx, o, n, onDesign, onWords }: { ctx: EditorCtx; o: OutputView; n: number; onDesign: () => void; onWords: () => void }) {
  const { view, doc, duration, transcript } = ctx;
  const clip = o.kind === 'short' ? doc.clips.find(c => c.id === o.clipId) : undefined;
  const [mode, setMode] = useState<'description' | 'transcript'>('description');
  const meta = o.meta as Partial<VideoMeta>;
  const score = editorialScore(clip?.scores ?? null);
  const job = view.jobs.find(j => j.target === o.id && j.kind === 'render' && (j.state === 'queued' || j.state === 'running'));
  const thumbJob = view.jobs.some(j => j.target === o.id && j.kind === 'thumbnails' && (j.state === 'queued' || j.state === 'running'));
  const chosen = o.thumbs[o.chosenThumb] ?? o.thumbs[0];
  const [from, to] = clip ? [clip.s, clip.e] : [0, duration];
  const keeps = useMemo(() => keepRanges(duration, doc, clip ? [clip.s, clip.e] : undefined), [duration, doc, clip]);
  const words = useMemo(() => transcript ? transcript.words.filter(w => w.s >= from - 0.05 && w.e <= to + 0.05).map(w => w.w).join(' ') : '', [transcript, from, to]);
  const text = mode === 'description' ? (meta.description || 'The description is written once the video is analysed.') : words || 'No words in this part.';
  const caption = [meta.titles?.[0] ?? o.title, (meta.hashtags ?? []).join(' ')].filter(Boolean).join('\n\n');
  const xml = () => save(`${(o.title || 'video').replace(/[^\w -]+/g, '').trim() || 'video'}.xml`, toXmeml({
    name: o.title || view.project.name, sourceName: view.source.name || 'recording.mp4', keeps, fps: view.source.probe?.fps || 30,
    width: view.source.probe?.width ?? 1920, height: view.source.probe?.height ?? 1080, duration, hasAudio: view.source.probe?.hasAudio ?? true,
  }), 'application/xml');
  const tall = o.height > o.width || (clip?.aspect ?? '') === '9:16';
  return (
    <article className="ob-row" data-testid="vs-board-row" data-kind={o.kind} data-output={o.id}>
      <div className="ob-score">
        {score ? (
          <>
            <div className="ob-total" title="The AI's editorial reading of this passage — not a forecast of views"><b>{score.total}</b>/100</div>
            {score.grades.map(g => <div key={g.label} className="ob-grade"><i className={`g${g.grade[0]}`}>{g.grade}</i><span>{g.label}</span></div>)}
          </>
        ) : <div className="ob-total none" title="Chosen by rule or by you — no AI reading to score">{o.kind === 'long' ? 'Full' : 'Not'}<small>{o.kind === 'long' ? 'video' : 'scored'}</small></div>}
      </div>
      <div className={`ob-preview ${tall ? 'tall' : ''}`}>
        {o.mp4Url ? (
          <video src={o.mp4Url} poster={chosen?.url} controls preload="none" playsInline data-testid="vs-board-video" />
        ) : (
          <>
            <video src={view.source.proxyUrl ? `${view.source.proxyUrl}#t=${from.toFixed(1)},${to.toFixed(1)}` : undefined} poster={chosen?.url || view.source.posterUrl || undefined} controls preload="none" playsInline />
            <span className="ob-tag">Low-res preview · before cuts</span>
          </>
        )}
        <span className="ob-dur">{clock(o.rendered ? o.duration : keptLength(keeps))}</span>
      </div>
      <div className="ob-main">
        <div className="ob-title">
          <span className="ob-n">#{n}</span>
          <b title={meta.titles?.[0] ?? o.title}>{meta.titles?.[0] ?? o.title}</b>
          <span className={`vs-badge ${o.status}`} data-testid="vs-board-status">{job ? (job.progress !== null ? `Rendering ${Math.round(job.progress)}%` : 'Rendering…') : o.stale ? 'Edited — render again' : STATUS_LABEL[o.status]}</span>
        </div>
        <div className="ob-tabs">
          <button type="button" aria-pressed={mode === 'description'} onClick={() => setMode('description')}>Description</button>
          <button type="button" aria-pressed={mode === 'transcript'} onClick={() => setMode('transcript')}>Transcript only</button>
          <span className="vs-spacer" />
          <span className="ob-range">[{clock(from)} – {clock(to)}]</span>
        </div>
        <p className="ob-text">{text}</p>
        {(meta.keywords?.length ?? 0) > 0 && <div className="ob-chips"><span>Keywords</span>{meta.keywords!.slice(0, 10).map(k => <i key={k}>{k}</i>)}</div>}
        {(meta.hashtags?.length ?? 0) > 0 && <div className="ob-chips tags"><span>Hashtags</span>{meta.hashtags!.map(k => <i key={k}>{k}</i>)}</div>}
        {o.kind === 'long' && (meta.chapters?.length ?? 0) > 0 && (
          <div className="ob-chapters" data-testid="vs-board-chapters"><span>Timeline</span>{meta.chapters!.map(c => <button key={c.s} type="button" onClick={() => ctx.seek(c.s)}><b>{clock(c.s)}</b> {c.title}</button>)}</div>
        )}
        <div className="ob-thumbs" data-testid="vs-board-thumbs">
          <span>Thumbnails</span>
          {o.thumbs.slice(-8).map(t => (
            <button key={t.index} type="button" className={`ob-thumb ${tall ? 'tall' : ''}`} aria-pressed={o.chosenThumb === t.index} disabled={!t.verified} title={t.verified ? `${t.layout} · ${t.check}` : t.check}
              onClick={() => void chooseThumb(view.project.id, o.id, t.index).then(() => ctx.refresh())}>
              <img src={t.url} alt={`Thumbnail ${t.index + 1}: ${t.headline}`} loading="lazy" />
            </button>
          ))}
          {thumbJob && <span className="vs-kbd"><Loader size={12} className="spin" /> Making…</span>}
          {o.rendered && <button type="button" className="ob-thumb add" onClick={onDesign} data-act="design-thumb"><Wand2 size={15} /><small>Design</small></button>}
          {o.rendered && !thumbJob && <button type="button" className="ob-thumb add" onClick={() => void moreThumbnails(view.project.id, o.id).then(() => ctx.refresh())} data-act="board-more-thumbs"><ImageIcon size={15} /><small>3 more</small></button>}
        </div>
      </div>
      <div className="ob-actions">
        {o.downloadUrl ? <a className="ob-act primary" href={o.downloadUrl} data-act="board-download"><Download size={14} /> Download MP4 <small>{o.width}×{o.height}</small></a>
          : <span className="ob-act off"><Clapperboard size={14} /> Not rendered yet</span>}
        {chosen?.verified && <a className="ob-act" href={chosen.downloadUrl} data-act="board-png"><ImageIcon size={14} /> Thumbnail PNG</a>}
        {o.srtUrl && <a className="ob-act" href={o.srtUrl}><CaptionsIcon size={14} /> Captions SRT</a>}
        {o.vttUrl && <a className="ob-act" href={o.vttUrl}><CaptionsIcon size={14} /> Captions VTT</a>}
        <button type="button" className="ob-act" onClick={xml} data-act="export-xml"><FileCode2 size={14} /> Export XML</button>
        <CopyBtn text={caption} label="Copy caption" />
        <button type="button" className="ob-act" onClick={onWords}><Pencil size={14} /> Edit words</button>
        {clip && <button type="button" className="ob-act" onClick={() => void ctx.apply([{ op: 'clip.duplicate', id: clip.id }], `Duplicated “${clip.title.slice(0, 30)}”`)} data-act="duplicate"><CopyPlus size={14} /> Duplicate</button>}
        {clip && <button type="button" className="ob-act" onClick={() => { ctx.setActiveClip(clip.id); ctx.seek(clip.s); window.scrollTo({ top: 0, behavior: 'smooth' }); }}><Pencil size={14} /> Edit in editor</button>}
        {o.stale && <button type="button" className="ob-act ai" onClick={() => void renderOutputs(view.project.id, [o.id]).then(() => ctx.refresh())}><Clapperboard size={14} /> Render again</button>}
        {o.rendered && (
          <div className="ob-status">
            {(['needs_review', 'approved', 'ready_to_publish'] as const).map(s => (
              <button key={s} type="button" aria-pressed={o.status === s} onClick={() => void setOutputStatus(view.project.id, o.id, s).then(() => ctx.refresh())} data-status-btn={s}>{STATUS_LABEL[s]}</button>
            ))}
          </div>
        )}
      </div>
    </article>
  );
}

export default function OutputsBoard({ ctx }: { ctx: EditorCtx }) {
  const { view, doc } = ctx;
  const [filter, setFilter] = useState<'all' | 'short' | 'long'>('all');
  const [sort, setSort] = useState<'score' | 'time'>('time');
  const [grid, setGrid] = useState(false);
  const [design, setDesign] = useState<OutputView | null>(null);
  const [words, setWords] = useState<OutputView | null>(null);
  const scoreOf = (o: OutputView) => editorialScore(doc.clips.find(c => c.id === o.clipId)?.scores ?? null)?.total ?? (o.kind === 'long' ? 101 : -1);
  const startOf = (o: OutputView) => doc.clips.find(c => c.id === o.clipId)?.s ?? -1;
  const list = view.outputs.filter(o => filter === 'all' || o.kind === filter).sort((a, b) => sort === 'score' ? scoreOf(b) - scoreOf(a) : startOf(a) - startOf(b));
  const nOf = (o: OutputView) => (o.kind === 'long' ? 0 : view.outputs.filter(x => x.kind === 'short').findIndex(x => x.id === o.id) + 1);
  const fresh = design ? view.outputs.find(o => o.id === design.id) ?? design : null;
  const wordsOf = words ? view.outputs.find(o => o.id === words.id) ?? words : null;
  return (
    <section className="ob" id="vs-outputs-board" data-testid="vs-outputs-board">
      <header className="ob-head">
        <div>
          <h2>Your videos <span className="vs-count">{view.outputs.length}</span></h2>
          <p>Each one with its preview, thumbnail, words and files. Nothing is published for you — <b>Ready to publish</b> means ready for you to post.</p>
        </div>
        <span className="vs-spacer" />
        <div className="ob-seg" role="radiogroup" aria-label="Show">
          {([['all', 'All'], ['short', 'Shorts'], ['long', 'Long video']] as const).map(([k, l]) => <button key={k} type="button" aria-pressed={filter === k} onClick={() => setFilter(k)}>{l}</button>)}
        </div>
        <div className="ob-seg" role="radiogroup" aria-label="Order">
          <button type="button" aria-pressed={sort === 'time'} onClick={() => setSort('time')}>In order</button>
          <button type="button" aria-pressed={sort === 'score'} onClick={() => setSort('score')}>By score</button>
        </div>
        <div className="ob-seg">
          <button type="button" aria-pressed={!grid} onClick={() => setGrid(false)} aria-label="List"><List size={15} /></button>
          <button type="button" aria-pressed={grid} onClick={() => setGrid(true)} aria-label="Grid"><LayoutGrid size={15} /></button>
        </div>
      </header>
      {!view.outputs.length && <p className="vs-sub">The long video and the Shorts appear here as they are chosen and made.</p>}
      <div className={`ob-list ${grid ? 'grid' : ''}`}>
        {list.map(o => <Row key={o.id} ctx={ctx} o={o} n={nOf(o)} onDesign={() => setDesign(o)} onWords={() => setWords(o)} />)}
      </div>
      <p className="vs-kbd" style={{ marginTop: 10 }}><ShieldCheck size={12} /> Scores are the AI's editorial reading of each passage — how well it stands alone — not a prediction of views or reach.</p>
      {fresh && <ThumbnailDesigner ctx={ctx} o={fresh} onClose={() => setDesign(null)} />}
      {wordsOf && (
        <div className="vs-modal-back" role="dialog" aria-modal="true" aria-label="Edit the words" onClick={() => setWords(null)}>
          <div className="vs-modal" style={{ maxWidth: 720 }} onClick={e => e.stopPropagation()}>
            <MetaEditor key={`${wordsOf.id}:${JSON.stringify(wordsOf.meta).length}`} ctx={ctx} o={wordsOf} />
            <div className="vs-row" style={{ marginTop: 10 }}><span className="vs-spacer" /><button type="button" className="vs-btn sm" onClick={() => setWords(null)}>Done</button></div>
          </div>
        </div>
      )}
    </section>
  );
}
