/**
 * One overall bar for a video being prepared, to two decimals ("34.45%"):
 * the editor's "Working on it" card, and the Screen Recorder once a recording
 * is saved. The number is the upload screen's — real readings (FFmpeg's
 * clock, pieces transcribed) with the creep between them that never passes
 * the next milestone (progress.ts) — so the three places never disagree.
 */
import { useEffect, useMemo, useState } from 'react';
import { AlertCircle } from 'lucide-react';
import { videoStatus, type ProjectView } from '../../services/videoStudio';
import { bandsFor, readProgress, useCreep } from './progress';

export function OverallProgress({ view }: { view: ProjectView }) {
  const keys = view.stages.map(s => s.key).join();
  /* A link or YouTube source starts with its own fetch band; the rest are the same for every video. */
  const bands = useMemo(() => {
    const origin = keys.includes('fetch_url') ? 'youtube' : keys.includes('fetch_link') ? 'link' : 'file';
    return bandsFor(origin).filter((b, i) => i === 0 || keys.split(',').includes(b.key));
  }, [keys]);
  const r = readProgress(bands, view, null);
  /* The four bands can all be done while the project is still processing
     (faces, renders, thumbnails): that used to read "Ready 100%" over a
     screen that was still busy. Only the project's own status says ready. */
  const done = view.project.status === 'ready' || (r.done && view.project.status !== 'processing');
  const after = r.done && !done ? view.stages.find(s => s.state === 'active') ?? view.stages.find(s => s.state === 'waiting') : null;
  const shown = useCreep(r.done && !done ? 99 : r.value, r.done && !done ? 99.8 : r.ceiling, done);
  const band = bands[Math.min(r.index, bands.length - 1)];
  const failed = r.failed || (view.project.status === 'failed' ? view.project.error || 'Processing stopped.' : '');
  return (
    <div className="vs-overall" data-testid="vs-overall" data-pct={shown.toFixed(2)}>
      <div className="vs-row" style={{ gap: 8 }}>
        <span className="vs-overall-what">{failed ? 'Stopped' : done ? 'Ready' : r.done ? `${after?.label ?? 'Finishing'}…` : `${band.label}…`}</span>
        <span className="vs-spacer" />
        <b className="vs-overall-pct" data-testid="vs-overall-pct">{done ? '100.00' : shown.toFixed(2)}%</b>
      </div>
      <div className="vs-ps-bar" role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.floor(shown)} aria-label="Getting your video ready"><i style={{ width: `${done ? 100 : shown}%` }} /></div>
      {failed && <div className="vs-note bad" role="alert" style={{ marginTop: 8 }}><AlertCircle size={15} /> <span>{failed}</span></div>}
    </div>
  );
}

/** The same bar for a project known only by id: polls its status every two seconds until it is ready or stopped. */
export function ProjectProgress({ projectId }: { projectId: string }) {
  const [view, setView] = useState<ProjectView | null>(null);
  useEffect(() => {
    let alive = true, t = 0, known = 0;
    const tick = async () => {
      const r = await videoStatus(projectId, known);
      if (!alive) return;
      if (r.success) {
        setView(r);
        if (typeof r.docVersion === 'number') known = r.docVersion;
        if (r.project.status === 'ready' || r.project.status === 'failed') return;
      }
      t = window.setTimeout(tick, 2000);
    };
    void tick();
    return () => { alive = false; clearTimeout(t); };
  }, [projectId]);
  return view ? <OverallProgress view={view} /> : null;
}
