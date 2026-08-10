import { useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import {
  AlertTriangle, ArrowRight, Check, Copy, Download, ExternalLink, Info, SkipForward, X,
} from 'lucide-react';
import { useApp } from '../../context/AppContext';
import { placementRules, PLATFORM_LABEL } from '../../services/socialAutomation';
import {
  captionFor, downloadMedia, handOff, routeFor, routeHint,
} from '../../services/publishHandoff';
import {
  advance, assetForJob, cancelSession, currentJob, markFailed, markOpened,
  markPublished, markSkipped, sessionFor, sessionProgress, startSession,
} from '../../services/publishSession';
import type { Campaign, PublishSession } from '../../types/socialAutomation';

const INK = '#17191c';
const MUTED = '#8a8f98';
const FAINT = '#b0b4ba';

interface Props {
  campaign: Campaign;
  onClose: () => void;
  onChange: () => void;
}

/**
 * Walks the queue one post at a time.
 *
 * The pre-flight step is a reminder rather than a check: this app cannot read
 * another site's cookies, so it cannot know whether you are signed in to
 * Instagram. Saying "we checked, you're logged in" would be a lie, so it asks.
 */
export default function PublishFlow({ campaign, onClose, onChange }: Props) {
  const { addNotification } = useApp();
  const [session, setSession] = useState<PublishSession | null>(() => sessionFor(campaign.id) ?? null);
  const [note, setNote] = useState('');
  const [permalink, setPermalink] = useState('');
  const [version, setVersion] = useState(0);

  const job = useMemo(
    // eslint-disable-next-line react-hooks/exhaustive-deps
    () => (session ? currentJob(session) : undefined), [session, version],
  );
  const asset = job ? assetForJob(job) : undefined;
  const progress = session ? sessionProgress(session) : null;
  const rules = asset?.placement ? placementRules(asset.placement) : undefined;

  const platforms = useMemo(() => {
    const set = new Set<string>();
    for (const p of campaign.placements) {
      const r = placementRules(p);
      if (r) set.add(PLATFORM_LABEL[r.platform]);
    }
    return [...set];
  }, [campaign.placements]);

  function begin() {
    const s = startSession(campaign);
    if (s.order.length === 0) {
      addNotification('Nothing is queued — schedule the campaign first.', 'error');
      onClose();
      return;
    }
    setSession(s);
    onChange();
  }

  async function open() {
    if (!job || !asset) return;
    const outcome = await handOff(asset);
    markOpened(job.id);
    setNote(outcome.note);
    setVersion(v => v + 1);
    onChange();
  }

  function next(action: 'published' | 'failed' | 'skipped') {
    if (!job || !session) return;
    if (action === 'published') markPublished(job.id, permalink);
    if (action === 'failed') markFailed(job.id, 'Marked as failed by the user.');
    if (action === 'skipped') markSkipped(job.id);
    setSession(advance(session));
    setNote('');
    setPermalink('');
    setVersion(v => v + 1);
    onChange();
  }

  function stop() {
    if (session) cancelSession(session);
    onChange();
    onClose();
  }

  const shell = (children: React.ReactNode) => createPortal(
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Publish campaign"
      style={{
        position: 'fixed', inset: 0, zIndex: 4200, backgroundColor: 'rgba(23,25,28,0.55)',
        display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20,
      }}
    >
      <div style={{
        backgroundColor: '#fff', borderRadius: 20, width: '100%', maxWidth: 620,
        maxHeight: '90vh', overflowY: 'auto', boxShadow: '0 30px 70px -20px rgba(8,10,14,0.5)',
      }}>
        {children}
      </div>
    </div>,
    document.body,
  );

  /* ── Pre-flight ── */
  if (!session) {
    return shell(
      <div style={{ padding: 26 }}>
        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12 }}>
          <h2 style={{ fontSize: 19, fontWeight: 800, color: INK, margin: '0 0 6px', letterSpacing: '-0.02em' }}>
            Before you start
          </h2>
          <button onClick={onClose} aria-label="Close" style={iconBtn}><X size={15} /></button>
        </div>

        <p style={{ fontSize: 13.5, color: '#5c6066', margin: '0 0 16px', lineHeight: 1.65 }}>
          Each post opens in its own tab, one at a time. Where the platform allows it the caption is already
          in the box; where it does not, the caption is copied to your clipboard and the media downloaded.
          You press Post — this app never posts in your name.
        </p>

        <div style={{ backgroundColor: '#f7f8fa', borderRadius: 13, padding: '14px 16px', marginBottom: 16 }}>
          <p style={{ fontSize: 12, fontWeight: 800, color: INK, margin: '0 0 8px' }}>
            Sign in to these first, in this browser:
          </p>
          <div style={{ display: 'flex', gap: 7, flexWrap: 'wrap' }}>
            {platforms.map(p => (
              <span key={p} style={{
                padding: '5px 11px', borderRadius: 999, backgroundColor: '#fff',
                border: '1px solid #e4e7ec', fontSize: 11.5, fontWeight: 600, color: INK,
              }}>{p}</span>
            ))}
          </div>
        </div>

        <p style={{
          display: 'flex', alignItems: 'flex-start', gap: 8, fontSize: 11.5, color: '#8a6516',
          backgroundColor: '#fdf5e7', borderRadius: 11, padding: '11px 13px', margin: '0 0 18px', lineHeight: 1.6,
        }}>
          <Info size={13} color="#c77414" style={{ flexShrink: 0, marginTop: 1 }} />
          We cannot check whether you are signed in — a website is not allowed to read another site's cookies.
          If a tab opens on a login screen, sign in there and come back; nothing is lost.
        </p>

        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
          <button onClick={begin} style={primaryBtn}>
            I'm signed in — start publishing <ArrowRight size={14} />
          </button>
          <button onClick={onClose} style={ghostBtn}>Not yet</button>
        </div>
      </div>,
    );
  }

  /* ── Finished ── */
  if (session.status === 'done' || !job || !asset) {
    const p = progress ?? { total: 0, done: 0, published: 0, failed: 0, skipped: 0, percent: 100 };
    return shell(
      <div style={{ padding: 26 }}>
        <h2 style={{ fontSize: 19, fontWeight: 800, color: INK, margin: '0 0 6px', letterSpacing: '-0.02em' }}>
          That's the run finished
        </h2>
        <p style={{ fontSize: 13.5, color: '#5c6066', margin: '0 0 18px', lineHeight: 1.65 }}>
          {p.published} published · {p.failed} failed · {p.skipped} skipped, out of {p.total}.
        </p>
        {p.failed > 0 && (
          <p style={{
            display: 'flex', alignItems: 'flex-start', gap: 8, fontSize: 12, color: '#8a6516',
            backgroundColor: '#fdf5e7', borderRadius: 11, padding: '11px 13px', margin: '0 0 18px', lineHeight: 1.6,
          }}>
            <AlertTriangle size={13} color="#c77414" style={{ flexShrink: 0, marginTop: 1 }} />
            Retry the failed ones from the campaign dashboard — they keep their captions and their place in the plan.
          </p>
        )}
        <button onClick={() => { onChange(); onClose(); }} style={primaryBtn}>Back to the campaign</button>
      </div>,
    );
  }

  /* ── One post at a time ── */
  const route = routeFor(asset);
  const caption = captionFor(asset);
  const destination = rules?.label ?? asset.channel ?? 'Destination';

  return shell(
    <div>
      {/* Progress */}
      <div style={{ padding: '18px 22px 14px', borderBottom: '1px solid #f2f3f5' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10 }}>
          <div>
            <p style={{ fontSize: 15.5, fontWeight: 800, color: INK, margin: 0, letterSpacing: '-0.02em' }}>
              {destination}
            </p>
            <p style={{ fontSize: 11.5, color: MUTED, margin: '2px 0 0' }}>
              {(progress?.done ?? 0) + 1} of {progress?.total ?? 1} · attempt {job.attempts + 1}
            </p>
          </div>
          <button onClick={stop} aria-label="Stop publishing" style={iconBtn}><X size={15} /></button>
        </div>
        <div style={{ height: 4, borderRadius: 999, backgroundColor: '#eceef1', overflow: 'hidden', marginTop: 12 }}>
          <div style={{
            width: `${Math.max(progress?.percent ?? 0, 2)}%`, height: '100%',
            borderRadius: 999, backgroundColor: INK, transition: 'width 0.3s ease',
          }} />
        </div>
      </div>

      <div style={{ padding: 22 }}>
        <p style={{ fontSize: 13, fontWeight: 700, color: INK, margin: '0 0 6px' }}>{asset.title}</p>
        <pre style={{
          margin: '0 0 10px', padding: '11px 13px', backgroundColor: '#f7f8fa', borderRadius: 11,
          fontSize: 12.5, color: '#374151', lineHeight: 1.6, whiteSpace: 'pre-wrap',
          fontFamily: 'inherit', maxHeight: 200, overflowY: 'auto',
        }}>{caption}</pre>

        <p style={{ fontSize: 11.5, color: MUTED, margin: '0 0 14px', lineHeight: 1.6 }}>
          {routeHint(asset)}
        </p>

        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 14 }}>
          <button onClick={open} style={primaryBtn}>
            <ExternalLink size={13} /> {route === 'intent' ? 'Open composer with text' : 'Open and copy caption'}
          </button>
          {asset.media.length > 0 && (
            <button
              onClick={() => {
                const ok = downloadMedia(asset, `${asset.title.replace(/[^\w -]/g, '').slice(0, 60) || 'media'}.mp4`);
                setNote(ok ? 'Media saved to your downloads.' : 'There is no downloadable file on this piece.');
              }}
              style={ghostBtn}
            >
              <Download size={13} /> Save media
            </button>
          )}
        </div>

        {note && (
          <p style={{
            display: 'flex', alignItems: 'flex-start', gap: 7, fontSize: 11.5, color: '#3e63dd',
            backgroundColor: '#eceff9', borderRadius: 10, padding: '10px 12px', margin: '0 0 14px', lineHeight: 1.55,
          }}>
            <Copy size={12} style={{ flexShrink: 0, marginTop: 1 }} /> {note}
          </p>
        )}

        <label htmlFor="sa-permalink" style={{ display: 'block', fontSize: 11.5, fontWeight: 700, color: INK, marginBottom: 5 }}>
          Link to the post <span style={{ fontWeight: 500, color: MUTED }}>— optional, for your records</span>
        </label>
        <input
          id="sa-permalink"
          value={permalink}
          onChange={e => setPermalink(e.target.value)}
          placeholder="https://…"
          style={{
            width: '100%', padding: '9px 12px', border: '1px solid #e4e7ec', borderRadius: 10,
            fontSize: 12.5, outline: 'none', boxSizing: 'border-box', marginBottom: 16,
          }}
        />

        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <button onClick={() => next('published')} style={{ ...primaryBtn, backgroundColor: '#3f9142' }}>
            <Check size={13} /> Posted it
          </button>
          <button onClick={() => next('skipped')} style={ghostBtn}>
            <SkipForward size={13} /> Skip
          </button>
          <button onClick={() => next('failed')} style={{ ...ghostBtn, color: '#e5484d', borderColor: '#f4d4d4' }}>
            <AlertTriangle size={13} /> Couldn't post
          </button>
        </div>

        <p style={{ fontSize: 10.5, color: FAINT, margin: '14px 0 0', lineHeight: 1.55 }}>
          Only you can see whether the post went live, so this records what you tell it rather than claiming
          to have checked.
        </p>
      </div>
    </div>,
  );
}

const primaryBtn: React.CSSProperties = {
  display: 'inline-flex', alignItems: 'center', gap: 7, padding: '10px 18px',
  borderRadius: 999, border: 'none', cursor: 'pointer',
  backgroundColor: INK, color: '#fff', fontSize: 12.5, fontWeight: 700,
};

const ghostBtn: React.CSSProperties = {
  display: 'inline-flex', alignItems: 'center', gap: 6, padding: '10px 16px',
  borderRadius: 999, border: '1px solid #e4e7ec', backgroundColor: '#fff',
  color: MUTED, fontSize: 12.5, fontWeight: 700, cursor: 'pointer',
};

const iconBtn: React.CSSProperties = {
  width: 28, height: 28, borderRadius: 999, border: '1px solid #e4e7ec',
  backgroundColor: '#fff', color: MUTED, cursor: 'pointer',
  display: 'inline-flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
};
