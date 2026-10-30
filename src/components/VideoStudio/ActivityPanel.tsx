/**
 * Progress, on the right: everything being done to this video, one line per
 * step, each opening into its small steps while it runs — and the changes
 * the customer made here, saved one at a time in the order they were made.
 *
 * ── What is shown is what the server's jobs say ──
 *
 * A job's own `stage` is the engine's word for where it is (download, probe,
 * sound, proxy… loudness, render, check, upload) and its percentage is
 * FFmpeg's clock or pieces transcribed. A small step is "done" only because a
 * later one has started; nothing ticks on a timer. The noise removal, Studio
 * Sound, captions, logo and words on screen are one FFmpeg pass, so they are
 * listed as "in this pass" under the render with the pass's own percentage —
 * never as separate steps finishing one by one, which they are not.
 *
 * The overall number covers every stage, not only the first four: the old
 * bar said "Ready 100%" while faces were still being found and the videos
 * rendered, and the screen looked stuck.
 */
import { useMemo } from 'react';
import { Check, X, Loader, RefreshCw, AlertCircle, Clock, CircleDashed, Undo2, Save } from 'lucide-react';
import type { ProjectView, VideoDoc, Stage } from '../../services/videoStudio';
import { useCreep, useEta, etaWords } from './progress';

export interface ChangeItem { id: string; note: string; state: 'queued' | 'saving' | 'done' | 'failed'; at: number; version?: number; why?: string }

type Job = ProjectView['jobs'][number];
interface Micro { key: string; label: string; state: 'done' | 'active' | 'waiting'; pct: number | null; within?: string[] }

/* The engine's words for where a job is, in the order it goes through them. */
const PREPARE: [string, string][] = [
  ['download', 'Fetching the recording'], ['probe', 'Reading its format'], ['sound', 'Measuring the sound and the pauses'],
  ['audio', 'Cutting the sound into pieces to transcribe'], ['proxy', 'Making the editing preview'], ['poster', 'Taking the cover picture'], ['filmstrip', 'Making the filmstrip'],
];
const RENDER: [string, string][] = [
  ['download', 'Fetching the recording'], ['loudness', 'Measuring loudness (pass 1 of 2)'], ['render', 'Rendering'], ['check', 'Checking the finished file'], ['upload', 'Saving the file'],
];
const THUMBS: [string, string][] = [['frame', 'Choosing frames'], ['thumbnail', 'Painting the thumbnails'], ['upload', 'Saving them']];

/** Small steps from a job's stage: the ones before it done, it active (with its percentage), the rest waiting. */
function walk(order: [string, string][], job: Job | undefined, finished: boolean): Micro[] {
  const at = job ? order.findIndex(([k]) => job.stage === k || job.stage.startsWith(`${k} `)) : -1;
  return order.map(([key, label], i) => ({
    key, label: key === 'thumbnail' && job?.stage.startsWith('thumbnail ') ? `Painting ${job.stage}` : label,
    state: finished || (at >= 0 && i < at) ? 'done' : at === i ? 'active' : 'waiting',
    pct: at === i && job && typeof job.progress === 'number' ? Math.round(job.progress) : null,
  }));
}

/** What one render pass applies to the picture and the sound, from the document — named, never timed separately. */
function inThisPass(doc: VideoDoc | null, kind: 'long' | 'short'): string[] {
  if (!doc) return [];
  const a = doc.audio, out: string[] = [];
  const cuts = doc.cuts.filter(c => c.state === 'approved').length;
  if (cuts) out.push(`${cuts} cut${cuts === 1 ? '' : 's'} taken out`);
  if (a.hum && a.hum !== 'off') out.push(`${a.hum} Hz hum removed`);
  if (a.declick) out.push('clicks and pops repaired');
  if (a.studio) out.push(`Studio Sound (${a.strength ?? 60}%)`);
  else if (a.denoise !== 'off') out.push(`${a.denoise} background-noise removal`);
  if (a.gate) out.push('room noise between sentences lowered');
  if (!a.studio && a.voice) out.push('voice clarity');
  if (a.loudnorm || a.studio) out.push('even loudness, −16 LUFS (pass 2 of 2)');
  if (doc.music && (doc.music.applyTo === 'all' || (doc.music.applyTo === 'long') === (kind === 'long'))) out.push(`music “${doc.music.title.slice(0, 30)}”`);
  if (doc.captions.on && doc.captions.burn) out.push('captions');
  const ov = doc.overlays?.length ?? 0;
  if (ov) out.push(`${ov} text overlay${ov === 1 ? '' : 's'}`);
  if (doc.logo?.on && (doc.logo.applyTo === 'all' || (doc.logo.applyTo === 'long') === (kind === 'long'))) out.push('your logo');
  if (doc.pointer?.on && doc.pointer.focus.length) out.push('zoom on the pointer');
  return out;
}

const WEIGHT: Record<string, number> = { upload: 2, fetch_url: 2, fetch_link: 2, prepare: 2, transcribe: 2, track: 1, analyze: 1, metadata: 0.5, render: 3, thumbnails: 1, repurpose: 0.5, quiz: 0.5 };

function StateIcon({ state }: { state: string }) {
  if (state === 'done') return <span className="vs-act-dot done"><Check size={11} /></span>;
  if (state === 'failed') return <span className="vs-act-dot failed"><X size={11} /></span>;
  if (state === 'active' || state === 'saving') return <span className="vs-act-dot active"><Loader size={11} className="spin" /></span>;
  if (state === 'skipped') return <span className="vs-act-dot skipped">–</span>;
  return <span className="vs-act-dot"><CircleDashed size={11} /></span>;
}

export default function ActivityPanel({ view, doc, changes, onRetry, onCancel }: {
  view: ProjectView; doc: VideoDoc | null; changes: ChangeItem[]; onRetry: () => void; onCancel: () => void;
}) {
  const st = view.project.status;
  const stages = view.stages.filter(s => s.key !== 'shorts' || s.state !== 'skipped');
  const jobsOf = (k: string) => view.jobs.filter(j => j.kind === k);
  const running = (k: string) => jobsOf(k).find(j => j.state === 'running') ?? jobsOf(k).find(j => j.state === 'queued');

  /* Every stage counts, weighted by how long it usually takes. A render stage is the average of its videos. */
  const reading = useMemo(() => {
    let sum = 0, got = 0, open = false;
    for (const s of stages) {
      if (s.state === 'skipped') continue;
      const w = WEIGHT[s.key] ?? 1;
      sum += w;
      if (s.state === 'done') { got += w; continue; }
      open = true;
      if (s.key === 'render') {
        const rs = jobsOf('render');
        const f = rs.length ? rs.reduce((n, j) => n + (j.state === 'done' ? 1 : j.state === 'running' && typeof j.progress === 'number' ? (j.progress / 100) * 0.9 : 0), 0) / rs.length : 0;
        got += w * f;
      } else if (s.state === 'active') got += w * ((s.pct ?? 0) / 100) * 0.9;
    }
    const value = sum ? (got / sum) * 100 : 0;
    return { value, open };
  }, [stages, view.jobs]); // eslint-disable-line react-hooks/exhaustive-deps
  const busy = st === 'processing' || st === 'uploading' || view.jobs.some(j => j.state === 'queued' || j.state === 'running');
  /* A project with no video yet has nothing done — never "All done". */
  const empty = st === 'draft' && !view.source.probe;
  const done = !busy && st !== 'failed' && !empty;
  const active = stages.find(s => s.state === 'active') ?? stages.find(s => s.state === 'waiting' && busy);
  const shown = useCreep(done ? 100 : reading.value, done ? 100 : Math.min(99.6, reading.value + 8), done);
  const eta = useEta(busy ? reading.value : null, 100);
  const saving = changes.filter(c => c.state === 'queued' || c.state === 'saving');

  const micro = (s: Stage): Micro[] => {
    if (s.state !== 'active' && s.state !== 'failed') return [];
    if (s.key === 'prepare') return walk(PREPARE, running('prepare'), false);
    if (s.key === 'thumbnails') return walk(THUMBS, running('thumbnails'), false);
    if (s.key === 'transcribe') {
      const j = running('transcribe');
      return [{ key: 'tr', label: j?.stage && j.stage !== 'starting' ? j.stage : 'Turning speech into words', state: 'active', pct: s.pct }];
    }
    if (s.key === 'analyze') {
      const j = running('analyze');
      const now = j?.stage ?? '';
      return [
        { key: 'read', label: 'Reading the transcript', state: /topics|shorts/i.test(now) ? 'done' : 'active', pct: null },
        { key: 'topics', label: 'Finding fillers, retakes, topics and Shorts', state: /topics|shorts/i.test(now) ? 'active' : 'waiting', pct: null },
      ];
    }
    return [];
  };

  return (
    <div className="vs-col vs-activity" style={{ gap: 12 }} data-testid="vs-activity" data-busy={busy ? '1' : '0'}>
      <div className="vs-act-head">
        <div className="vs-row" style={{ gap: 8 }}>
          <b className="vs-act-title">{st === 'failed' ? 'Stopped' : empty ? 'Waiting for a video' : done ? 'All done' : active ? `${active.label}…` : 'Working…'}</b>
          <span className="vs-spacer" />
          <b className="vs-act-pct" data-testid="vs-activity-pct">{empty ? '0.0' : shown.toFixed(1)}%</b>
        </div>
        <div className="vs-ps-bar" role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={empty ? 0 : Math.floor(shown)} aria-label="Everything being done to this video"><i style={{ width: `${empty ? 0 : shown}%` }} /></div>
        <div className="vs-row" style={{ gap: 6 }}>
          <span className="vs-kbd">{busy ? (eta !== null ? etaWords(eta) : 'working — one step at a time') : st === 'failed' ? 'something stopped — see below' : empty ? 'add or record a video to start' : 'nothing is running'}</span>
          <span className="vs-spacer" />
          {st === 'failed' && <button type="button" className="vs-btn sm" onClick={onRetry}><RefreshCw size={13} /> Try again</button>}
          {st === 'processing' && <button type="button" className="vs-btn ghost sm" onClick={onCancel}>Cancel</button>}
        </div>
      </div>

      {(saving.length > 0 || changes.length > 0) && (
        <div className="vs-act-group" data-testid="vs-changes">
          <div className="vs-act-gh"><Save size={13} /> Your changes {saving.length ? <span className="vs-kbd">· saving {saving.length}, one at a time</span> : null}</div>
          {changes.slice().reverse().slice(0, 6).map(c => (
            <div key={c.id} className={`vs-act-row ${c.state}`} data-change={c.state}>
              <StateIcon state={c.state} />
              <span className="vs-act-label">{c.note === 'Undo' || c.note === 'Redo' ? <><Undo2 size={12} style={{ transform: c.note === 'Redo' ? 'scaleX(-1)' : undefined }} /> {c.note}</> : c.note}</span>
              <span className="vs-act-pct-sm">{c.state === 'queued' ? 'waiting' : c.state === 'saving' ? 'saving…' : c.state === 'done' ? (c.version ? `v${c.version}` : 'saved') : 'not done'}</span>
              {c.state === 'saving' && <div className="vs-bar indet vs-act-bar"><i style={{ width: '35%' }} /></div>}
              {c.state === 'failed' && c.why && <small className="vs-act-why">{c.why}</small>}
            </div>
          ))}
          {changes.some(c => c.state === 'done') && view.outputs.some(o => o.stale) && (
            <small className="vs-kbd vs-act-why">Shown in the preview now. The finished files are made again when you press <b>Render</b> (top bar) or <b>Export</b>.</small>
          )}
        </div>
      )}

      <div className="vs-act-group">
        <div className="vs-act-gh"><Clock size={13} /> Steps</div>
        {stages.map(s => {
          const ms = micro(s);
          return (
            <div key={s.key} className={`vs-act-stage ${s.state}`} data-stage={s.key} data-state={s.state}>
              <div className="vs-act-row">
                <StateIcon state={s.state} />
                <span className="vs-act-label">{s.label}</span>
                <span className="vs-act-pct-sm">{s.state === 'active' ? (s.pct !== null ? `${s.pct}%` : '…') : s.state === 'skipped' ? 'not needed' : s.state === 'done' ? 'done' : s.state === 'failed' ? 'stopped' : 'waiting'}</span>
                {s.state === 'active' && <div className={`vs-bar vs-act-bar ${s.pct === null ? 'indet' : ''}`}><i style={{ width: `${s.pct ?? 35}%` }} /></div>}
              </div>
              {ms.length > 0 && (
                <div className="vs-act-micro">
                  {ms.map(m => (
                    <div key={m.key} className={`vs-act-mrow ${m.state}`}>
                      <StateIcon state={m.state} /><span>{m.label}</span><span className="vs-act-pct-sm">{m.state === 'active' ? (m.pct !== null ? `${m.pct}%` : '…') : ''}</span>
                    </div>
                  ))}
                </div>
              )}
              {s.key === 'render' && s.state !== 'skipped' && <RenderJobs view={view} doc={doc} />}
              {s.note && (s.state === 'failed' || (s.state === 'waiting' && /not set up|waiting/i.test(s.note))) && <small className="vs-act-why">{s.note}</small>}
            </div>
          );
        })}
      </div>
      {view.project.stageNote && <div className="vs-note" style={{ margin: 0 }}><AlertCircle size={15} /> {view.project.stageNote}</div>}
      {st === 'failed' && view.project.error && <div className="vs-note bad" role="alert" style={{ margin: 0 }}><AlertCircle size={15} /> {view.project.error}</div>}
    </div>
  );
}

/** Each video being rendered, with its small steps and what its pass applies. */
function RenderJobs({ view, doc }: { view: ProjectView; doc: VideoDoc | null }) {
  const jobs = view.jobs.filter(j => j.kind === 'render' && (j.state === 'running' || j.state === 'queued' || j.state === 'failed'));
  if (!jobs.length) return null;
  const shorts = view.outputs.filter(o => o.kind === 'short');
  return (
    <div className="vs-act-micro" data-testid="vs-render-jobs">
      {jobs.map(j => {
        const o = view.outputs.find(x => x.id === j.target);
        const kind = o?.kind ?? 'long';
        const name = !o ? 'A video' : o.kind === 'long' ? 'Long video' : `Short ${shorts.findIndex(x => x.id === o.id) + 1}`;
        const steps = walk(RENDER, j.state === 'running' ? j : undefined, false);
        const within = inThisPass(doc, kind);
        return (
          <div key={j.id} className="vs-act-job" data-render={j.target} data-state={j.state}>
            <div className="vs-act-mrow active"><b>{name}</b><span className="vs-spacer" /><span className="vs-act-pct-sm">{j.state === 'queued' ? 'next in line' : j.state === 'failed' ? 'stopped' : typeof j.progress === 'number' ? `${Math.round(j.progress)}%` : '…'}</span></div>
            {j.state === 'running' && steps.map(m => (
              <div key={m.key} className={`vs-act-mrow ${m.state}`}>
                <StateIcon state={m.state} /><span>{m.label}</span><span className="vs-act-pct-sm">{m.state === 'active' ? (m.pct !== null ? `${m.pct}%` : '…') : ''}</span>
                {m.key === 'render' && m.state === 'active' && m.pct !== null && <div className="vs-bar vs-act-bar"><i style={{ width: `${m.pct}%` }} /></div>}
              </div>
            ))}
            {j.state === 'running' && within.length > 0 && (
              <div className="vs-act-within"><small>In this pass:</small> {within.map(w => <span key={w} className="vs-chip sm">{w}</span>)}</div>
            )}
            {j.state === 'failed' && j.error && <small className="vs-act-why">{j.error}</small>}
          </div>
        );
      })}
    </div>
  );
}
