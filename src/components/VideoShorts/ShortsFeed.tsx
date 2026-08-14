import { useMemo, useRef, useState } from 'react';
import {
  ArrowRight, ChevronLeft, ChevronRight, Clock, Download, Film, Pencil,
  Play, Plus, Scissors, Sparkles, Upload,
} from 'lucide-react';
import type { VideoClip, VideoProject } from '../../types';
import { band, projectSignals, signalsFor, sparkPoints } from './shortsSignals';

/**
 * The AI Shorts feed.
 *
 * One row per source video, the long-form input on the left and every short cut
 * from it laid out to the right, so the relationship between the two is the
 * layout rather than something you have to click through to discover. Ten rows
 * a page, scrolled vertically.
 *
 * It is deliberately dark in a light-mode app. That is not decoration: these
 * are video thumbnails and vertical frames, and a dark ground is what stops the
 * page glowing brighter than the footage. It carries `data-noinvert` because
 * the app's dark mode works by inverting the whole tree, which would turn a
 * deliberately dark panel white — the panel picks its own colours in both
 * themes and opts out of the inversion.
 */

/* ── Palette. Fixed in both themes, hence data-noinvert on the root. ── */
const BG = '#0b0d1a';
const PANEL = '#12152a';
const PANEL_2 = '#171a33';
const EDGE = 'rgba(255,255,255,0.09)';
const TEXT = '#eef0f8';
const DIM = '#8e94b4';
const ACCENT = '#7c5cff';
const ACCENT_2 = '#22d3ee';

/** Score bands. Checked against #12152a: all clear 4.5:1 as text. */
const TONE: Record<string, string> = {
  high: '#4ade80',
  good: '#38bdf8',
  fair: '#fbbf24',
  low: '#fb7185',
};

const PAGE_SIZE = 10;

const fmt = (s: number) => {
  const m = Math.floor(s / 60);
  const r = Math.round(s % 60);
  return m > 0 ? `${m}:${String(r).padStart(2, '0')}` : `0:${String(r).padStart(2, '0')}`;
};

export interface FeedTool {
  label: string;
  icon: typeof Play;
  isNew?: boolean;
  action: () => void;
}

interface Props {
  projects: VideoProject[];
  /** The per-clip tools, kept from the previous dashboard — each deep-links
      into the clip editor at its own panel, so removing them would lose real
      functionality that has nothing to do with the layout change. */
  tools: FeedTool[];
  onOpenProject: (project: VideoProject) => void;
  onEditClip: (project: VideoProject, clip: VideoClip) => void;
  onNewProject: () => void;
  onTryExample: () => void;
  onExportAll: (project: VideoProject) => void;
}

export default function ShortsFeed({
  projects, tools, onOpenProject, onEditClip, onNewProject, onTryExample, onExportAll,
}: Props) {
  const [page, setPage] = useState(0);
  const pages = Math.max(1, Math.ceil(projects.length / PAGE_SIZE));
  const current = Math.min(page, pages - 1);
  const rows = projects.slice(current * PAGE_SIZE, current * PAGE_SIZE + PAGE_SIZE);

  /* The figures the previous dashboard showed in a stat row. Kept, because the
     layout changed and the information did not stop being useful. */
  const totals = useMemo(() => {
    const clips = projects.flatMap(p => p.clips);
    return {
      sources: projects.length,
      shorts: clips.length,
      avgScore: clips.length ? Math.round(clips.reduce((s, c) => s + c.viralityScore, 0) / clips.length) : 0,
      published: clips.filter(c => c.publishedTo.some(pub => pub.status === 'published')).length,
      views: projects.reduce((s, p) => s + p.totalViews, 0),
    };
  }, [projects]);

  return (
    <div data-noinvert style={{ backgroundColor: BG, minHeight: '100%', padding: '18px 20px 40px' }}>
      {/* ── Title bar ── */}
      <div style={{
        display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap',
        padding: '14px 18px', borderRadius: 16, marginBottom: 16,
        backgroundColor: PANEL, border: `1px solid ${EDGE}`,
      }}>
        <span style={{
          width: 30, height: 30, borderRadius: 9, display: 'inline-flex',
          alignItems: 'center', justifyContent: 'center',
          background: `linear-gradient(135deg, ${ACCENT}, ${ACCENT_2})`, color: '#fff',
        }}>
          <Play size={14} fill="#fff" />
        </span>
        <h2 style={{ margin: 0, fontSize: 16, fontWeight: 800, color: TEXT, letterSpacing: '-0.02em' }}>
          AI Shorts Generator
        </h2>
        <span style={{ flex: 1 }} />
        <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap', marginRight: 4 }}>
          {[
            { k: 'Sources', v: String(totals.sources) },
            { k: 'Shorts', v: String(totals.shorts) },
            { k: 'Avg score', v: totals.shorts ? `${totals.avgScore}%` : '—' },
            { k: 'Published', v: String(totals.published) },
            { k: 'Views', v: totals.views >= 1000 ? `${(totals.views / 1000).toFixed(1)}k` : String(totals.views) },
          ].map(s => (
            <div key={s.k}>
              <p style={{ margin: 0, fontSize: 9.5, color: DIM, whiteSpace: 'nowrap' }}>{s.k}</p>
              <p style={{ margin: 0, fontSize: 14, fontWeight: 800, color: TEXT, fontVariantNumeric: 'tabular-nums' }}>{s.v}</p>
            </div>
          ))}
        </div>
        <button onClick={onTryExample} style={ghost()}>
          <Play size={12} /> Try an example
        </button>
        <button onClick={onNewProject} style={primary()}>
          <Plus size={13} /> New video
        </button>
      </div>

      {/* ── Tools ── */}
      {tools.length > 0 && (
        <div style={{
          display: 'flex', gap: 6, overflowX: 'auto', padding: '10px 12px', marginBottom: 16,
          backgroundColor: PANEL, border: `1px solid ${EDGE}`, borderRadius: 16,
        }}>
          {tools.map(t => (
            <button
              key={t.label}
              onClick={t.action}
              style={{
                display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6,
                padding: '6px 10px', border: 'none', background: 'none', cursor: 'pointer',
                position: 'relative', minWidth: 82, flexShrink: 0, fontFamily: 'inherit',
              }}
            >
              {t.isNew && (
                <span style={{
                  position: 'absolute', top: -1, right: 4, zIndex: 1,
                  backgroundColor: ACCENT, color: '#fff', fontSize: 8.5, fontWeight: 800,
                  padding: '2px 6px', borderRadius: 999,
                }}>New</span>
              )}
              <span style={{
                width: 42, height: 42, borderRadius: 999, display: 'flex',
                alignItems: 'center', justifyContent: 'center',
                backgroundColor: 'rgba(255,255,255,0.07)', border: `1px solid ${EDGE}`,
              }}>
                <t.icon size={17} color={TEXT} strokeWidth={1.8} />
              </span>
              <span style={{ fontSize: 10.5, fontWeight: 600, color: DIM, whiteSpace: 'nowrap' }}>{t.label}</span>
            </button>
          ))}
        </div>
      )}

      {projects.length === 0 ? (
        <EmptyState onNewProject={onNewProject} onTryExample={onTryExample} />
      ) : (
        <>
          <div style={{ display: 'grid', gap: 14 }}>
            {rows.map(project => (
              <SourceRow
                key={project.id}
                project={project}
                onOpen={() => onOpenProject(project)}
                onEditClip={clip => onEditClip(project, clip)}
                onExportAll={() => onExportAll(project)}
              />
            ))}
          </div>

          {pages > 1 && (
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 10, marginTop: 20 }}>
              <button onClick={() => setPage(p => Math.max(0, p - 1))} disabled={current === 0}
                style={{ ...ghost(), opacity: current === 0 ? 0.4 : 1 }}>
                <ChevronLeft size={13} /> Previous
              </button>
              <span style={{ fontSize: 12, color: DIM }}>
                {current * PAGE_SIZE + 1}–{Math.min(projects.length, (current + 1) * PAGE_SIZE)} of {projects.length}
              </span>
              <button onClick={() => setPage(p => Math.min(pages - 1, p + 1))} disabled={current >= pages - 1}
                style={{ ...ghost(), opacity: current >= pages - 1 ? 0.4 : 1 }}>
                Next <ChevronRight size={13} />
              </button>
            </div>
          )}
        </>
      )}
    </div>
  );
}

/* ── One source video and everything cut from it ── */

function SourceRow({ project, onOpen, onEditClip, onExportAll }: {
  project: VideoProject;
  onOpen: () => void;
  onEditClip: (clip: VideoClip) => void;
  onExportAll: () => void;
}) {
  const strip = useRef<HTMLDivElement>(null);
  const signals = useMemo(() => projectSignals(project.clips), [project.clips]);
  const overall = project.clips.length
    ? Math.round(project.clips.reduce((s, c) => s + c.viralityScore, 0) / project.clips.length)
    : 0;
  const overallBand = band(overall);

  const scroll = (dir: -1 | 1) => {
    strip.current?.scrollBy({ left: dir * 340, behavior: 'smooth' });
  };

  return (
    <section style={{
      backgroundColor: PANEL, borderRadius: 18, border: `1px solid ${EDGE}`,
      overflow: 'hidden',
    }}>
      <div style={{ display: 'flex', gap: 0, alignItems: 'stretch', flexWrap: 'wrap' }}>

        {/* ── Left: the long-form input ── */}
        <div style={{ flex: '1 1 320px', minWidth: 280, padding: 16, borderRight: `1px solid ${EDGE}` }}>
          <p style={label()}>Long-form video input</p>

          <button
            onClick={onOpen}
            style={{
              display: 'block', width: '100%', padding: 0, border: 'none', cursor: 'pointer',
              borderRadius: 12, overflow: 'hidden', background: project.thumbnailGradient,
              aspectRatio: '16 / 9', position: 'relative', textAlign: 'left',
            }}
            aria-label={`Open ${project.name}`}
          >
            <span style={{
              position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center',
            }}>
              <span style={{
                width: 44, height: 44, borderRadius: 999, backgroundColor: 'rgba(0,0,0,0.45)',
                display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                border: '1px solid rgba(255,255,255,0.35)',
              }}>
                <Play size={18} fill="#fff" color="#fff" />
              </span>
            </span>
            <span style={{
              position: 'absolute', right: 8, bottom: 8, padding: '3px 7px', borderRadius: 6,
              backgroundColor: 'rgba(0,0,0,0.62)', color: '#fff', fontSize: 10.5, fontWeight: 700,
            }}>
              {fmt(project.duration)}
            </span>
          </button>

          <h3 style={{
            margin: '10px 0 3px', fontSize: 13.5, fontWeight: 700, color: TEXT, lineHeight: 1.35,
            overflow: 'hidden', textOverflow: 'ellipsis', display: '-webkit-box',
            WebkitLineClamp: 2, WebkitBoxOrient: 'vertical',
          }}>{project.name}</h3>
          <p style={{ margin: 0, fontSize: 11, color: DIM, display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
            <Clock size={10} /> {fmt(project.duration)}
            <span>·</span>
            <Scissors size={10} /> {project.clips.length} short{project.clips.length === 1 ? '' : 's'}
            {project.status !== 'ready' && (
              <span style={{ color: '#fbbf24', fontWeight: 700 }}>
                · {project.status === 'processing' ? `${project.progress}% — ${project.processingStep}` : project.status}
              </span>
            )}
          </p>

          <div style={{ display: 'flex', gap: 7, marginTop: 11, flexWrap: 'wrap' }}>
            <button onClick={onOpen} style={ghost()}>Open <ArrowRight size={12} /></button>
            {project.clips.length > 0 && (
              <button onClick={onExportAll} style={ghost()}><Download size={12} /> Export all</button>
            )}
          </div>
        </div>

        {/* ── Right: the generated shorts ── */}
        <div style={{ flex: '2 1 560px', minWidth: 300, padding: 16, position: 'relative' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 9 }}>
            <p style={{ ...label(), margin: 0 }}>Generated shorts</p>
            <span style={{
              display: 'inline-flex', alignItems: 'center', gap: 4, fontSize: 9.5, fontWeight: 800,
              padding: '2px 7px', borderRadius: 999, color: '#c4b5fd',
              backgroundColor: 'rgba(124,92,255,0.16)',
            }}>
              <Sparkles size={9} /> AI
            </span>
            <span style={{ flex: 1 }} />
            {project.clips.length > 3 && (
              <span style={{ display: 'inline-flex', gap: 5 }}>
                <button onClick={() => scroll(-1)} style={iconBtn()} aria-label="Scroll shorts left"><ChevronLeft size={13} /></button>
                <button onClick={() => scroll(1)} style={iconBtn()} aria-label="Scroll shorts right"><ChevronRight size={13} /></button>
              </span>
            )}
          </div>

          {project.clips.length === 0 ? (
            <div style={{
              border: `1px dashed ${EDGE}`, borderRadius: 12, padding: '26px 16px',
              color: DIM, fontSize: 12, textAlign: 'center',
            }}>
              {project.status === 'processing'
                ? `Cutting shorts — ${project.progress}%`
                : project.status === 'failed'
                  ? (project.error || 'Processing failed. Open the video to retry.')
                  : 'No shorts from this video yet. Open it to generate some.'}
            </div>
          ) : (
            <div
              ref={strip}
              style={{
                display: 'flex', gap: 10, overflowX: 'auto', paddingBottom: 6,
                scrollbarWidth: 'thin',
              }}
            >
              {project.clips.map(clip => (
                <ShortCard key={clip.id} clip={clip} onEdit={() => onEditClip(clip)} />
              ))}
            </div>
          )}
        </div>
      </div>

      {/* ── The analysis strip ── */}
      {project.clips.length > 0 && (
        <div style={{
          borderTop: `1px solid ${EDGE}`, backgroundColor: PANEL_2,
          padding: '12px 16px', display: 'flex', alignItems: 'center', gap: 14, flexWrap: 'wrap',
        }}>
          <span style={{ ...label(), margin: 0, whiteSpace: 'nowrap' }}>AI analysis</span>
          <div style={{ display: 'flex', gap: 18, flexWrap: 'wrap', flex: 1 }}>
            {signals.map(s => {
              const b = band(s.score);
              return (
                <div key={s.id} title={`${s.why} Estimated from the clip, not measured.`} style={{ minWidth: 78 }}>
                  <p style={{ margin: 0, fontSize: 10, color: DIM, whiteSpace: 'nowrap' }}>{s.label}</p>
                  <p style={{ margin: '1px 0 0', fontSize: 15, fontWeight: 800, color: TONE[b.tone], fontVariantNumeric: 'tabular-nums' }}>
                    {s.score}
                  </p>
                </div>
              );
            })}
          </div>
          <div style={{
            display: 'flex', alignItems: 'center', gap: 10, padding: '7px 12px', borderRadius: 12,
            backgroundColor: 'rgba(124,92,255,0.12)', border: '1px solid rgba(124,92,255,0.3)',
          }}>
            <div>
              <p style={{ margin: 0, fontSize: 9.5, color: DIM, whiteSpace: 'nowrap' }}>Overall potential</p>
              <p style={{ margin: 0, fontSize: 19, fontWeight: 900, color: TONE[overallBand.tone], lineHeight: 1.1, fontVariantNumeric: 'tabular-nums' }}>
                {overall}<span style={{ fontSize: 11, fontWeight: 700 }}>%</span>
              </p>
            </div>
            <span style={{ fontSize: 10, fontWeight: 800, color: TONE[overallBand.tone], whiteSpace: 'nowrap' }}>
              {overallBand.label}
            </span>
          </div>
        </div>
      )}
    </section>
  );
}

/* ── One short ── */

function ShortCard({ clip, onEdit }: { clip: VideoClip; onEdit: () => void }) {
  const b = band(clip.viralityScore);
  const tone = TONE[b.tone];
  const sig = useMemo(() => signalsFor(clip), [clip]);
  const why = sig.map(s => `${s.label} ${s.score} — ${s.why}`).join('\n');

  return (
    <div style={{ width: 150, flexShrink: 0 }}>
      <button
        onClick={onEdit}
        aria-label={`Edit ${clip.title}`}
        style={{
          display: 'block', width: '100%', padding: 0, cursor: 'pointer', textAlign: 'left',
          border: `1px solid ${EDGE}`, borderRadius: 12, overflow: 'hidden', position: 'relative',
          aspectRatio: '9 / 16',
          background: clip.thumbnailUrl ? `url(${clip.thumbnailUrl}) center/cover` : clip.thumbnailGradient,
        }}
      >
        <span style={{
          position: 'absolute', inset: 0,
          background: 'linear-gradient(180deg, rgba(0,0,0,0.05) 40%, rgba(0,0,0,0.82) 100%)',
        }} />
        <span style={{
          position: 'absolute', top: 7, right: 7, padding: '2px 6px', borderRadius: 6,
          backgroundColor: 'rgba(0,0,0,0.6)', color: '#fff', fontSize: 9.5, fontWeight: 700,
        }}>{fmt(clip.duration)}</span>

        {/* The edit affordance is the whole point of the card, so it is visible
            rather than hidden behind a hover a touch device cannot produce. */}
        <span style={{
          position: 'absolute', top: 7, left: 7, width: 22, height: 22, borderRadius: 999,
          backgroundColor: 'rgba(0,0,0,0.6)', border: '1px solid rgba(255,255,255,0.3)',
          display: 'inline-flex', alignItems: 'center', justifyContent: 'center', color: '#fff',
        }}><Pencil size={11} /></span>

        <span style={{
          position: 'absolute', left: 8, right: 8, bottom: 8, color: '#fff',
          fontSize: 11, fontWeight: 700, lineHeight: 1.3,
          display: '-webkit-box', WebkitLineClamp: 3, WebkitBoxOrient: 'vertical', overflow: 'hidden',
        }}>{clip.title}</span>
      </button>

      {/* Virality, with the sparkline the reference draws — but captioned as an
          estimate, because there is no time series behind it. */}
      <div title={`${why}\n\nEstimated from the clip, not measured.`} style={{ marginTop: 6 }}>
        <div style={{ display: 'flex', alignItems: 'baseline', gap: 5 }}>
          <span style={{ fontSize: 15, fontWeight: 900, color: tone, fontVariantNumeric: 'tabular-nums' }}>
            {clip.viralityScore}<span style={{ fontSize: 9.5, fontWeight: 700 }}>%</span>
          </span>
          <span style={{ fontSize: 9, fontWeight: 800, color: tone, textTransform: 'uppercase', letterSpacing: '0.04em' }}>
            {b.label}
          </span>
        </div>
        <svg viewBox="0 0 140 26" width="100%" height="20" role="img"
          aria-label={`Estimated viral potential ${clip.viralityScore} out of 100`} style={{ display: 'block' }}>
          <polyline
            points={sparkPoints(clip.viralityScore, 140, 24)}
            fill="none" stroke={tone} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"
          />
        </svg>
        <p style={{ margin: 0, fontSize: 9, color: DIM }}>estimated</p>
      </div>
    </div>
  );
}

/* ── Empty ── */

function EmptyState({ onNewProject, onTryExample }: { onNewProject: () => void; onTryExample: () => void }) {
  return (
    <div style={{
      backgroundColor: PANEL, border: `1px dashed ${EDGE}`, borderRadius: 18,
      padding: '52px 26px', textAlign: 'center',
    }}>
      <span style={{
        width: 54, height: 54, borderRadius: 16, display: 'inline-flex',
        alignItems: 'center', justifyContent: 'center', marginBottom: 14,
        background: `linear-gradient(135deg, ${ACCENT}, ${ACCENT_2})`, color: '#fff',
      }}><Film size={24} /></span>
      <h3 style={{ margin: '0 0 7px', fontSize: 17, fontWeight: 800, color: TEXT }}>
        Nothing processed yet
      </h3>
      <p style={{ margin: '0 auto 18px', maxWidth: 460, fontSize: 12.5, color: DIM, lineHeight: 1.65 }}>
        Add a webinar, podcast, interview or YouTube video. Each one becomes a row here, with every
        short cut from it lined up beside it — click any short to open the editor.
      </p>
      <div style={{ display: 'flex', gap: 9, justifyContent: 'center', flexWrap: 'wrap' }}>
        <button onClick={onNewProject} style={primary()}><Upload size={13} /> Add a video</button>
        <button onClick={onTryExample} style={ghost()}><Play size={12} /> Try an example</button>
      </div>
    </div>
  );
}

/* ── Styles ── */

const label = (): React.CSSProperties => ({
  margin: '0 0 9px', fontSize: 9.5, fontWeight: 800, color: DIM,
  textTransform: 'uppercase', letterSpacing: '0.08em',
});

function primary(): React.CSSProperties {
  return {
    display: 'inline-flex', alignItems: 'center', gap: 6, padding: '9px 15px',
    borderRadius: 999, border: 'none', cursor: 'pointer', whiteSpace: 'nowrap',
    background: `linear-gradient(135deg, ${ACCENT}, #a78bfa)`, color: '#fff',
    fontSize: 12, fontWeight: 800, fontFamily: 'inherit',
  };
}

function ghost(): React.CSSProperties {
  return {
    display: 'inline-flex', alignItems: 'center', gap: 6, padding: '8px 13px',
    borderRadius: 999, border: `1px solid ${EDGE}`, cursor: 'pointer', whiteSpace: 'nowrap',
    backgroundColor: 'rgba(255,255,255,0.05)', color: TEXT,
    fontSize: 11.5, fontWeight: 700, fontFamily: 'inherit',
  };
}

function iconBtn(): React.CSSProperties {
  return {
    width: 24, height: 24, borderRadius: 999, border: `1px solid ${EDGE}`,
    backgroundColor: 'rgba(255,255,255,0.05)', color: TEXT, cursor: 'pointer',
    display: 'inline-flex', alignItems: 'center', justifyContent: 'center', padding: 0,
  };
}
