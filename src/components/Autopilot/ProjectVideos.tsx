/**
 * An Autopilot project's videos, on its Assets tab: what AI Video Studio has
 * made for it, and the button to upload the next recording into it. A video
 * uploaded from here is linked to the project, so its "Recording to Shorts"
 * workflow's settings apply and the finished Shorts are reported in the
 * project's activity (lib/video/pipeline.ts `refreshProject`).
 */
import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Clapperboard, Upload } from 'lucide-react';
import { listVideoProjects, type ProjectSummary } from '../../services/videoStudio';

const INK = '#17191c';
const MUTED = '#6b7280';
const LINE = '#e6e9f0';

export default function ProjectVideos({ projectId }: { projectId: string }) {
  const navigate = useNavigate();
  const [videos, setVideos] = useState<ProjectSummary[] | null>(null);
  /* Asked again after a failed answer (it used to stay empty for good), and
     every 20 s while a video is still being made, so "Processing…" becomes
     "✨ 4 Shorts created" without a reload — the work goes on in the cloud. */
  useEffect(() => {
    let alive = true, timer = 0, fails = 0;
    const look = async () => {
      const r = await listVideoProjects();
      if (!alive) return;
      if (r.success) { fails = 0; const mine = (r.projects ?? []).filter(p => p.autopilotProjectId === projectId); setVideos(mine); if (mine.some(v => v.status !== 'ready' && v.status !== 'failed')) timer = window.setTimeout(look, 20_000); }
      else if (++fails <= 4) timer = window.setTimeout(look, 2_000 * fails);
      else setVideos(v => v ?? []);
    };
    void look();
    return () => { alive = false; clearTimeout(timer); };
  }, [projectId]);
  return (
    <div style={{ border: `1px solid ${LINE}`, borderRadius: 14, padding: 12, display: 'grid', gap: 10, marginBottom: 12 }} data-testid="project-videos">
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
        <span style={{ width: 32, height: 32, borderRadius: 10, display: 'grid', placeItems: 'center', color: '#fff', background: 'linear-gradient(135deg,#5b46e5,#ec4899)' }}><Clapperboard size={16} /></span>
        <div style={{ flex: 1, minWidth: 180 }}>
          <b style={{ fontSize: 13.5, color: INK }}>Videos</b>
          <div style={{ fontSize: 12, color: MUTED }}>Recordings turned into cleaned videos, Shorts, captions and PNG thumbnails in AI Video Studio.</div>
        </div>
        <button type="button" className="press" onClick={() => navigate(`/video-studio?new=1&project=${encodeURIComponent(projectId)}`)}
          style={{ display: 'inline-flex', alignItems: 'center', gap: 6, border: 0, borderRadius: 10, padding: '8px 12px', fontWeight: 700, fontSize: 12.5, color: '#fff', background: INK, cursor: 'pointer', fontFamily: 'inherit' }}>
          <Upload size={14} /> Upload a video
        </button>
      </div>
      {videos && videos.length > 0 && (
        <div style={{ display: 'grid', gap: 8, gridTemplateColumns: 'repeat(auto-fill, minmax(170px, 1fr))' }}>
          {videos.map(v => (
            <button key={v.id} type="button" onClick={() => navigate(`/video-studio/${v.id}?tab=exports`)} className="press"
              style={{ border: `1px solid ${LINE}`, borderRadius: 11, padding: 0, overflow: 'hidden', background: '#fff', textAlign: 'left', cursor: 'pointer', fontFamily: 'inherit' }}>
              <div style={{ aspectRatio: '16 / 9', background: v.posterUrl ? `#0f1115 url("${v.posterUrl}") center / cover` : '#0f1115' }} />
              <div style={{ padding: '7px 9px' }}>
                <b style={{ fontSize: 12.5, color: INK, display: 'block', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{v.name}</b>
                <span style={{ fontSize: 11.5, color: MUTED }}>{v.status === 'ready' ? `✨ ${v.shorts} Short${v.shorts === 1 ? '' : 's'} created` : v.status === 'failed' ? 'Stopped — open to see why' : 'Processing…'}</span>
              </div>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
