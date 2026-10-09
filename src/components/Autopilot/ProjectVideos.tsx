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
  useEffect(() => {
    let alive = true;
    void listVideoProjects().then(r => { if (alive) setVideos(r.success ? (r.projects ?? []).filter(p => p.autopilotProjectId === projectId) : []); });
    return () => { alive = false; };
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
