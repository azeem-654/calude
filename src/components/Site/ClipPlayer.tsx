/**
 * A module demo, playing: the real app in dark mode, a pointer moving,
 * clicking and typing, on a loop (clips.ts, recorded by
 * scripts/site-clips.mts).
 *
 * ── Why video and not a GIF ──
 *
 * The owner asked for something "GIF-like". A GIF of a 1280-wide app window
 * is several megabytes and banded; the same clip as VP9 is a few hundred
 * kilobytes and sharp. So it is a `<video>` that behaves like a GIF —
 * muted, looping, inline, no controls — with WebM first and an H.264 MP4 for
 * Safari, which picks the first it can play.
 *
 * ── What it costs a visitor ──
 *
 * Nothing until the player is nearly on screen: until then it is an empty
 * frame of the right shape, no poster and no video. Then the poster and the
 * one clip showing; the others only when their turn comes. It plays only
 * while on screen (and the tab is visible) and pauses when scrolled away.
 *
 * ── Several modules in one player ──
 *
 * A chapter has a clip per module. They play one after another, each once
 * through, with a tab per module under the player that fills as its clip
 * plays; pressing a tab (or the module's block under the section) plays that
 * one. A single clip loops.
 *
 * ── Less motion ──
 *
 * With reduced motion asked for (services/motion.ts), nothing plays by
 * itself: the poster shows — a still of where the clip ends, taken at 2× —
 * with a Play button. Pressed, that one clip plays once and stops. Everybody
 * gets a pause button, because anything that moves for more than five
 * seconds should have one.
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import { Pause, Play, Maximize2 } from 'lucide-react';
import { clipBase, type ModuleClip } from './clips';
import { motionReduced } from '../../services/motion';

export default function ClipPlayer({ clips, label, pick, onShow, eager = false }: {
  clips: ModuleClip[];
  /** What the player is of, for a screen reader. */
  label: string;
  /** A module to show, from outside (its block under the section was pressed); `n` makes the same pick count twice. */
  pick?: { module: string; n: number };
  onShow?: (c: ModuleClip) => void;
  eager?: boolean;
}) {
  const wrap = useRef<HTMLDivElement | null>(null);
  const video = useRef<HTMLVideoElement | null>(null);
  const [near, setNear] = useState(eager);
  const [inView, setInView] = useState(false);
  const [i, setI] = useState(0);
  const [still] = useState(() => motionReduced());
  /* `paused` is the visitor's choice; `asked` is a reduced-motion visitor pressing Play. */
  const [paused, setPaused] = useState(false);
  const [asked, setAsked] = useState(false);
  const [progress, setProgress] = useState(0);
  const clip = clips[Math.min(i, clips.length - 1)];
  const base = clipBase();
  const single = clips.length === 1;

  useEffect(() => {
    const el = wrap.current;
    if (!el || typeof IntersectionObserver === 'undefined') { setNear(true); setInView(true); return; }
    const far = new IntersectionObserver(([e]) => { if (e?.isIntersecting) { setNear(true); far.disconnect(); } }, { rootMargin: '600px 0px' });
    const io = new IntersectionObserver(([e]) => setInView(!!e?.isIntersecting), { threshold: 0.25 });
    far.observe(el);
    io.observe(el);
    return () => { far.disconnect(); io.disconnect(); };
  }, []);

  useEffect(() => { onShow?.(clip); }, [clip, onShow]);

  /* A block under the section pressed: that module's clip, from its start. */
  useEffect(() => {
    if (!pick) return;
    const k = clips.findIndex(c => c.module === pick.module);
    if (k < 0) return;
    setI(k);
    setPaused(false);
    if (still) setAsked(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- a new pick, not a new list
  }, [pick?.module, pick?.n]);

  /* Play while on screen, the tab visible and nobody has paused it. */
  const want = near && inView && !paused && (!still || asked);
  useEffect(() => {
    const v = video.current;
    if (!v) return;
    const sync = () => {
      if (want && document.visibilityState === 'visible') { if (v.paused) v.play().catch(() => { /* refused: the poster and button remain */ }); }
      else if (!v.paused) v.pause();
    };
    sync();
    document.addEventListener('visibilitychange', sync);
    return () => document.removeEventListener('visibilitychange', sync);
  }, [want, clip.id]);

  const onEnded = useCallback(() => {
    if (still) { setAsked(false); return; }
    if (!single) setI(k => (k + 1) % clips.length);
  }, [still, single, clips.length]);

  const go = (k: number) => { setI(k); setPaused(false); setProgress(0); if (still) setAsked(true); };
  const full = () => {
    const v = video.current as (HTMLVideoElement & { webkitEnterFullscreen?: () => void }) | null;
    if (!v) return;
    if (v.requestFullscreen) v.requestFullscreen().catch(() => {});
    else v.webkitEnterFullscreen?.();
  };

  const playing = want;
  return (
    <div className="dc-mclip" ref={wrap} role="group" aria-roledescription="demo" aria-label={label}>
      <div className="dc-mclip-frame">
        {near && (
          <video
            key={clip.id}
            ref={video}
            className="dc-mclip-video"
            poster={`${base}/${clip.id}-poster.webp`}
            muted
            playsInline
            loop={single && !still}
            preload={still ? 'none' : 'metadata'}
            aria-label={clip.alt}
            onEnded={onEnded}
            onTimeUpdate={e => { const v = e.currentTarget; setProgress(v.duration ? v.currentTime / v.duration : 0); }}
          >
            <source src={`${base}/${clip.id}.webm`} type="video/webm" />
            <source src={`${base}/${clip.id}.mp4`} type="video/mp4" />
          </video>
        )}
        {/* No tag of the player's own: every recording carries "Sample
            workspace · real app, demonstration data" in its corner and its
            captions along the bottom (scripts/clip-frame.mts), and a second
            label here sat on top of both. */}
        {near && still && !asked && (
          <button type="button" className="dc-mclip-play" onClick={() => setAsked(true)} aria-label={`Play the ${clip.module} demo`}>
            <Play size={22} />
          </button>
        )}
        <div className="dc-mclip-tools">
          {(!still || asked) && (
            <button type="button" onClick={() => setPaused(p => !p)} aria-label={paused ? 'Play the demo' : 'Pause the demo'}>
              {paused ? <Play size={14} /> : <Pause size={14} />}
            </button>
          )}
          <button type="button" onClick={full} aria-label="Watch full screen"><Maximize2 size={14} /></button>
        </div>
      </div>
      {!single && (
        <div className="dc-mclip-tabs" role="tablist" aria-label={`${label}: modules`}>
          {clips.map((c, k) => (
            <button key={c.id} type="button" role="tab" aria-selected={k === i} className={k === i ? 'on' : ''} onClick={() => go(k)}>
              <span>{c.module}</span>
              <i aria-hidden="true"><b style={{ transform: `scaleX(${k === i ? (playing || progress ? progress : 0) : 0})` }} /></i>
            </button>
          ))}
        </div>
      )}
      <p className="dc-mclip-caption">{single ? null : <b>{clip.module}. </b>}{clip.caption}</p>
    </div>
  );
}
