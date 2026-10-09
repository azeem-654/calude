/**
 * The preview player: the editor's proxy played through the *same* edit the
 * render uses (`keepRanges`, `retimeWords`, `cuesOf` from the Worker's own
 * files) — cut ranges skipped, a Short shown in its frame with its crop,
 * captions drawn from the re-timed words, and the chosen music track played
 * underneath at its volume. It is a preview of the canonical edit, labelled
 * as such: noise reduction and ducking are heard only in the render.
 *
 * ── Why the video's address is held, not followed ──
 *
 * The editor polls every few seconds and each answer carries a signed link
 * to the proxy. Following it into `src` reloads the video whenever the link
 * changes — which is what made the preview play three or four seconds and
 * stop. The first link is kept for as long as it works; only when the video
 * reports an error (the link expired) is the newest one put in, at the same
 * moment and in the same play state.
 */
import { useEffect, useMemo, useRef, useState } from 'react';
import { Play, Pause, Rewind, FastForward, Volume2, VolumeX, Maximize2, Music2 } from 'lucide-react';
import { keepRanges, keptLength, retimeWords, cuesOf, toOutput, toSource, clock, isRtl } from '../../services/videoStudio';
import type { EditorCtx } from './VideoEditor';

/** Hold a signed address until it fails; then take the newest one. */
function useHeldSrc(latest: string) {
  const [src, setSrc] = useState(latest);
  const failed = useRef(false);
  useEffect(() => {
    if (!src && latest) setSrc(latest);
    else if (failed.current && latest && latest !== src) { failed.current = false; setSrc(latest); }
  }, [latest, src]);
  return { src, fail: () => { failed.current = true; } };
}

export default function Player({ ctx }: { ctx: EditorCtx }) {
  const { view, doc, transcript, duration } = ctx;
  const clip = ctx.activeClip ? doc.clips.find(c => c.id === ctx.activeClip) ?? null : null;
  const videoRef = useRef<HTMLVideoElement>(null);
  const audioRef = useRef<HTMLAudioElement>(null);
  const shellRef = useRef<HTMLDivElement>(null);
  const frameRef = useRef<HTMLDivElement>(null);
  const resume = useRef<{ at: number; play: boolean } | null>(null);
  const [playing, setPlaying] = useState(false);
  const [muted, setMuted] = useState(false);
  const [frameH, setFrameH] = useState(360);
  const video = useHeldSrc(view.source.proxyUrl);
  const music = useHeldSrc(view.musicUrl);

  const keeps = useMemo(() => keepRanges(duration, doc, clip ? [clip.s, clip.e] : undefined), [duration, doc, clip]);
  const kind = clip ? 'short' as const : 'long' as const;
  const cues = useMemo(() => transcript ? cuesOf(retimeWords(transcript.words, keeps, doc.captionEdits), kind) : [], [transcript, keeps, doc.captionEdits, kind]);
  const style = doc.captions[kind];
  const out = toOutput(ctx.time, keeps);
  const total = keptLength(keeps);
  const cue = doc.captions.on && out !== null ? cues.find(c => out >= c.s && out < c.e) : undefined;
  const track = doc.music && (doc.music.applyTo === 'all' || (doc.music.applyTo === 'long') === !clip) ? doc.music : null;

  /* Skipping what is cut, every frame while playing; the time is reported
     about ten times a second, because the whole editor redraws on it. */
  const report = ctx.seek;
  useEffect(() => {
    const v = videoRef.current;
    if (!v) return;
    let raf = 0, last = -1, lastAt = 0;
    const tell = (force = false) => {
      const now = performance.now();
      if (force || Math.abs(v.currentTime - last) > 0.04 && now - lastAt > 90) { last = v.currentTime; lastAt = now; report(-1 - v.currentTime); }
    };
    const tick = () => {
      const t = v.currentTime;
      const inside = keeps.find(([a, b]) => t >= a - 0.01 && t < b);
      if (!inside) {
        const next = keeps.find(([a]) => a > t);
        if (next) v.currentTime = next[0];
        else { v.pause(); v.currentTime = keeps[0]?.[0] ?? 0; tell(true); return; }
      }
      tell();
      if (!v.paused) raf = requestAnimationFrame(tick);
    };
    const onPlay = () => { setPlaying(true); cancelAnimationFrame(raf); raf = requestAnimationFrame(tick); };
    const onPause = () => { setPlaying(false); cancelAnimationFrame(raf); tell(true); };
    const onSeeked = () => tell(true);
    v.addEventListener('play', onPlay);
    v.addEventListener('pause', onPause);
    v.addEventListener('seeked', onSeeked);
    if (!v.paused) raf = requestAnimationFrame(tick);
    return () => { cancelAnimationFrame(raf); v.removeEventListener('play', onPlay); v.removeEventListener('pause', onPause); v.removeEventListener('seeked', onSeeked); };
  }, [keeps, report, video.src]);

  /* The music follows the picture: started, stopped and placed on the
     output's clock (looped as the render loops it), checked once a second. */
  useEffect(() => {
    const v = videoRef.current, a = audioRef.current;
    if (!v || !a || !track) return;
    a.volume = Math.min(1, track.volume);
    const place = () => {
      const o = toOutput(v.currentTime, keeps) ?? 0;
      const d = a.duration;
      const want = d && Number.isFinite(d) ? (track.loop ? o % d : Math.min(o, d)) : o;
      if (Math.abs(a.currentTime - want) > 0.35) a.currentTime = want;
    };
    const play = () => { place(); void a.play().catch(() => {}); };
    const stop = () => a.pause();
    v.addEventListener('play', play);
    v.addEventListener('pause', stop);
    v.addEventListener('seeked', place);
    const t = setInterval(() => { if (!v.paused) place(); }, 1000);
    if (!v.paused) play();
    return () => { clearInterval(t); v.removeEventListener('play', play); v.removeEventListener('pause', stop); v.removeEventListener('seeked', place); a.pause(); };
  }, [track, keeps, music.src]);

  /* A Short opens at its own start. */
  useEffect(() => { const v = videoRef.current; if (v && clip) v.currentTime = keeps[0]?.[0] ?? clip.s; }, [clip?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    const el = frameRef.current;
    if (!el) return;
    const ro = new ResizeObserver(() => setFrameH(el.clientHeight));
    ro.observe(el);
    return () => ro.disconnect();
  }, [clip?.id]);

  /* Seeks asked for by the panels and the timeline. */
  useEffect(() => {
    const onSeek = (e: Event) => { const v = videoRef.current; if (v) v.currentTime = (e as CustomEvent<number>).detail; };
    window.addEventListener('vs-seek', onSeek);
    return () => window.removeEventListener('vs-seek', onSeek);
  }, []);

  /* Space plays and pauses; the arrows step five seconds of the edit. */
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const el = e.target as HTMLElement;
      if (['INPUT', 'TEXTAREA', 'SELECT', 'BUTTON'].includes(el?.tagName) || el?.isContentEditable) return;
      if (e.key === ' ') { e.preventDefault(); toggle(); }
      else if (e.key === 'ArrowLeft' && !e.metaKey && !e.ctrlKey) step(-5);
      else if (e.key === 'ArrowRight' && !e.metaKey && !e.ctrlKey) step(5);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  });

  const aspect = clip ? clip.aspect : doc.long.aspect;
  const ratio = aspect === '9:16' ? 9 / 16 : aspect === '1:1' ? 1 : aspect === '4:5' ? 4 / 5 : aspect === '16:9' ? 16 / 9 : (view.source.probe ? view.source.probe.width / view.source.probe.height : 16 / 9);
  const reframe = clip ? clip.reframe : doc.long.reframe;
  const fit = reframe.mode === 'fit';
  const base = kind === 'short' ? (88 / 1920) * frameH : 0.05 * frameH;

  function toggle() { const v = videoRef.current; if (!v) return; if (v.paused) void v.play().catch(() => {}); else v.pause(); }
  function seekOut(o: number) { const v = videoRef.current; if (!v) return; v.currentTime = toSource(Math.max(0, Math.min(total - 0.05, o)), keeps); }
  function step(d: number) { seekOut((toOutput(videoRef.current?.currentTime ?? 0, keeps) ?? 0) + d); }

  const scrubAt = (e: React.PointerEvent<HTMLDivElement>) => {
    const r = e.currentTarget.getBoundingClientRect();
    seekOut(((e.clientX - r.left) / Math.max(1, r.width)) * total);
  };
  const pct = total ? Math.min(100, ((out ?? 0) / total) * 100) : 0;

  return (
    <div className="vse-player" ref={shellRef} data-testid="vs-preview">
      <div className="vse-screen">
        <div ref={frameRef} className={`vs-frame ${fit ? 'fit' : ''}`}
          style={{ aspectRatio: String(ratio), width: `min(100%, calc(var(--vse-screen-h, 56vh) * ${ratio.toFixed(4)}))`,
            backgroundImage: fit && view.source.posterUrl ? `url("${view.source.posterUrl}")` : undefined, backgroundSize: 'cover', backgroundPosition: 'center' }}>
          {fit && <div style={{ position: 'absolute', inset: 0, backdropFilter: 'blur(18px) brightness(.75)', WebkitBackdropFilter: 'blur(18px) brightness(.75)' }} />}
          <video ref={videoRef} src={video.src || undefined} poster={view.source.posterUrl || undefined} playsInline preload="auto" muted={muted}
            style={{ objectFit: fit || aspect === 'source' ? 'contain' : 'cover', objectPosition: `${reframe.x * 100}% ${reframe.y * 100}%`, position: fit ? 'absolute' : 'relative', inset: 0, height: '100%' }}
            onClick={toggle} data-testid="vs-video" data-src={video.src}
            onError={() => { const v = videoRef.current; resume.current = { at: v?.currentTime ?? 0, play: !!v && !v.paused }; video.fail(); void ctx.refresh(); }}
            onLoadedMetadata={() => { const v = videoRef.current, r = resume.current; if (v && r) { resume.current = null; v.currentTime = r.at; if (r.play) void v.play().catch(() => {}); } }} />
          {cue && (
            <div className={`vs-cap ${style.box ? 'box' : ''}`} data-testid="vs-caption" dir={isRtl(cue.text) ? 'rtl' : 'ltr'}
              style={{
                fontSize: Math.max(10, base * style.size), color: style.color,
                ...(style.position === 'top' ? { top: '7%' } : style.position === 'middle' ? { top: '45%' } : { bottom: kind === 'short' ? '20%' : '6%' }),
                textTransform: style.uppercase && !isRtl(cue.text) ? 'uppercase' : 'none',
                textShadow: style.outline || style.shadow ? undefined : 'none',
              }}>
              <span>{cue.text}</span>
            </div>
          )}
        </div>
        <div className="vse-target">
          <span className="vs-badge">{clip ? `Short ${doc.clips.findIndex(c => c.id === clip.id) + 1} · ${clip.aspect}` : 'Long video'} · preview of the edit</span>
          {track && <span className="vs-badge" title="Ducking under speech and noise reduction are heard in the rendered file"><Music2 size={11} /> {track.title.slice(0, 26)}</span>}
        </div>
        {track && music.src && <audio ref={audioRef} src={music.src} preload="auto" muted={muted} loop={track.loop} onError={() => { music.fail(); void ctx.refresh(); }} />}
      </div>
      <div className="vse-hud">
        <button type="button" className="vs-btn skip" onClick={() => step(-5)} aria-label="Back 5 seconds" disabled={!video.src}><Rewind size={15} /></button>
        <button type="button" className="vs-btn play" onClick={toggle} aria-label={playing ? 'Pause' : 'Play'} disabled={!video.src} data-testid="vs-play">{playing ? <Pause size={16} /> : <Play size={16} />}</button>
        <button type="button" className="vs-btn skip" onClick={() => step(5)} aria-label="Forward 5 seconds" disabled={!video.src}><FastForward size={15} /></button>
        <span className="vse-time-label" data-testid="vs-time">{clock(out ?? 0)} / {clock(total)}</span>
        <div className="vse-scrub" role="slider" aria-label="Position in the edited video" aria-valuemin={0} aria-valuemax={Math.round(total)} aria-valuenow={Math.round(out ?? 0)} tabIndex={0}
          onPointerDown={e => { e.currentTarget.setPointerCapture(e.pointerId); scrubAt(e); }}
          onPointerMove={e => { if (e.buttons === 1) scrubAt(e); }}
          onKeyDown={e => { if (e.key === 'ArrowLeft') { e.preventDefault(); step(-5); } if (e.key === 'ArrowRight') { e.preventDefault(); step(5); } }}>
          <div className="rail" /><div className="fill" style={{ width: `${pct}%` }} /><div className="knob" style={{ left: `${pct}%` }} />
        </div>
        <button type="button" className="vs-btn" onClick={() => setMuted(m => !m)} aria-label={muted ? 'Sound on' : 'Mute'}>{muted ? <VolumeX size={15} /> : <Volume2 size={15} />}</button>
        <button type="button" className="vs-btn" onClick={() => { const el = shellRef.current; if (!el) return; if (document.fullscreenElement) void document.exitFullscreen(); else void el.requestFullscreen?.().catch(() => {}); }} aria-label="Full screen"><Maximize2 size={15} /></button>
      </div>
    </div>
  );
}
