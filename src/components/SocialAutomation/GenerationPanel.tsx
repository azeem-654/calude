import { useEffect, useRef, useState } from 'react';
import { AlertTriangle, Info, Loader, RefreshCw, Sparkles } from 'lucide-react';
import {
  clearJob, getJob, jobProgress, runGenerationPass, startGeneration, type GenerationJob,
} from '../../services/campaignPipeline';
import type { Campaign } from '../../types/socialAutomation';

const INK = '#17191c';
const MUTED = '#8a8f98';

interface Props {
  campaign: Campaign;
  onChange: () => void;
}

/**
 * Drives the pipeline one step at a time.
 *
 * The in-flight flag is a ref rather than state on purpose: as a dependency it
 * would re-run this effect the moment it flipped, and the queue would advance
 * twice per step. Each completed pass sets the job, which re-runs the effect
 * for the next one — a loop that survives a reload because the job is on disk.
 */
export default function GenerationPanel({ campaign, onChange }: Props) {
  const [job, setJob] = useState<GenerationJob | null>(() => getJob(campaign.id) ?? null);
  const inFlight = useRef(false);

  useEffect(() => {
    if (!job || job.status !== 'running' || inFlight.current) return;
    inFlight.current = true;
    let cancelled = false;
    void runGenerationPass(campaign.id).then(next => {
      inFlight.current = false;
      if (cancelled) return;
      setJob(next);
      if (next && next.status !== 'running') onChange();
    });
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [job, campaign.id]);

  function begin() {
    const started = startGeneration(campaign);
    setJob(started);
    onChange();
  }

  function again() {
    clearJob(campaign.id);
    begin();
  }

  /* Nothing has been generated yet. */
  if (!job) {
    return (
      <button
        onClick={begin}
        style={{
          display: 'inline-flex', alignItems: 'center', gap: 7, padding: '9px 16px',
          borderRadius: 999, border: 'none', cursor: 'pointer',
          backgroundColor: INK, color: '#fff', fontSize: 12.5, fontWeight: 700,
        }}
      >
        <Sparkles size={13} /> Generate everything
      </button>
    );
  }

  if (job.status === 'failed') {
    return (
      <div style={{ backgroundColor: '#fceaea', borderRadius: 11, padding: '10px 12px' }}>
        <p style={{
          display: 'flex', alignItems: 'center', gap: 7, fontSize: 12, fontWeight: 700,
          color: '#e5484d', margin: '0 0 4px',
        }}>
          <AlertTriangle size={13} /> Generation stopped
        </p>
        <p style={{ fontSize: 11.5, color: '#5c6066', margin: '0 0 10px', lineHeight: 1.5 }}>
          {job.error || 'Something went wrong part-way through.'}
        </p>
        <button onClick={again} style={{
          display: 'inline-flex', alignItems: 'center', gap: 6, padding: '7px 13px',
          borderRadius: 999, border: '1px solid #f4d4d4', backgroundColor: '#fff',
          color: '#e5484d', fontSize: 11.5, fontWeight: 700, cursor: 'pointer',
        }}>
          <RefreshCw size={12} /> Try again
        </button>
      </div>
    );
  }

  if (job.status === 'running') {
    const pct = Math.round(jobProgress(job) * 100);
    return (
      <div style={{ backgroundColor: '#eceff9', borderRadius: 11, padding: '10px 12px' }}>
        <p style={{
          display: 'flex', alignItems: 'center', gap: 7, fontSize: 12, fontWeight: 700,
          color: '#3e63dd', margin: '0 0 7px',
        }}>
          <Loader size={13} style={{ animation: 'spin 0.9s linear infinite' }} /> {job.message}
        </p>
        <div style={{ height: 4, borderRadius: 999, backgroundColor: '#dfe4f5', overflow: 'hidden' }}>
          <div style={{
            width: `${Math.max(pct, 3)}%`, height: '100%', borderRadius: 999,
            backgroundColor: '#3e63dd', transition: 'width 0.35s ease',
          }} />
        </div>
        <p style={{ fontSize: 10.5, color: MUTED, margin: '6px 0 0', fontVariantNumeric: 'tabular-nums' }}>
          {pct}% · {job.phase === 'analyse' ? 'watching the video' : 'writing posts'}
        </p>
      </div>
    );
  }

  /* Done. */
  // Naive pluralisation turned "story" into "storys", so the labels are named.
  const KIND_LABEL: Record<string, [one: string, many: string]> = {
    clip: ['clip', 'clips'], image: ['image', 'images'], carousel: ['carousel', 'carousels'],
    story: ['story', 'stories'], text: ['post', 'posts'], thread: ['thread', 'threads'],
    email: ['email', 'emails'], sms: ['SMS', 'SMS'], blog: ['blog post', 'blog posts'],
    landing: ['landing page', 'landing pages'],
  };
  const counts = campaign.assetCounts ?? {};
  const summary = Object.entries(counts)
    .filter(([, n]) => (n ?? 0) > 0)
    .map(([kind, n]) => {
      const [one, many] = KIND_LABEL[kind] ?? [kind, `${kind}s`];
      return `${n} ${n === 1 ? one : many}`;
    })
    .join(' · ');

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
      <div style={{ backgroundColor: '#e9f4e6', borderRadius: 11, padding: '10px 12px' }}>
        <p style={{ fontSize: 12, fontWeight: 700, color: '#3f9142', margin: '0 0 3px' }}>
          Ready to review
        </p>
        <p style={{ fontSize: 11.5, color: '#5c6066', margin: 0, lineHeight: 1.5 }}>
          {summary || 'Nothing was generated — check the placements you selected.'}
        </p>
      </div>

      {job.degraded && (
        <p style={{
          display: 'flex', alignItems: 'flex-start', gap: 6, fontSize: 11, color: '#c77414',
          backgroundColor: '#fdf5e7', borderRadius: 9, padding: '8px 10px', margin: 0, lineHeight: 1.5,
        }}>
          <Info size={12} style={{ flexShrink: 0, marginTop: 1 }} />
          {job.degraded}
        </p>
      )}

      <button onClick={again} style={{
        alignSelf: 'flex-start', display: 'inline-flex', alignItems: 'center', gap: 6,
        padding: '7px 13px', borderRadius: 999, border: '1px solid #e4e7ec',
        backgroundColor: '#fff', color: INK, fontSize: 11.5, fontWeight: 700, cursor: 'pointer',
      }}>
        <RefreshCw size={12} /> Regenerate
      </button>
    </div>
  );
}
