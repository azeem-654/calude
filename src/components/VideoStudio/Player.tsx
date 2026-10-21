/**
 * The preview player: the editor's proxy played through the *same* edit the
 * render uses (`keepRanges`, `retimeWords`, `cuesOf` from the Worker's own
 * files) — cut ranges skipped, a Short shown in its frame with its crop,
 * captions drawn from the re-timed words, the chosen music under it, and the
 * look, speed, zooms, fades, flashes, progress bar, words on screen and the
 * tracked crop shown as closely as a browser can. It is a preview of the
 * canonical edit, labelled as such: noise reduction, ducking, vignette and
 * grain are heard or seen only in the render.
 *
 * ── Why the video's address is held, not followed ──
 *
 * The editor polls every few seconds and each answer carries a signed link
 * to the proxy. Following it into `src` reloads the video whenever the link
 * changes — which is what made the preview play three or four seconds and
 * stop. The first link is kept for as long as it works; only when the video
 * reports an error (the link expired) is the newest one put in, at the same
 * moment and in the same play state.
 *
 * ── Why the playhead is not React state ──
 *
 * Everything that moves every frame — the scrub bar, the clock, the zoom,
 * the tracked crop, fades and flashes, the timeline's playhead (told by a
 * `vs-frame` event) — is written straight to the elements from one
 * animation-frame loop. The editor as a whole hears the time ten times a
 * second, which is enough for captions and the transcript and keeps a long
 * transcript from redrawing sixty times a second.
 */
import { useEffect, useMemo, useRef, useState } from 'react';
import { Play, Pause, Rewind, FastForward, Volume2, VolumeX, Maximize2, Music2, Gauge } from 'lucide-react';
import {
  keepRanges, keptLength, retimeWords, cuesOf, toOutput, toSource, clock, isRtl, lookOf, motionOf, trackingOf, cssLook, punchSpans, cutTimes, trackAt, overlaySpan, sentencesOf,
  effectsOf, effectsOn, cssEffects, layoutPlan, dimsFor, LAYOUT_LABEL, type LayoutPlan,
} from '../../services/videoStudio';
import type { EditorCtx } from './VideoEditor';
import { Deck } from './deck';

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


const hexA = (hex: string, a: number) => { const n = parseInt(hex.slice(1), 16); return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${a.toFixed(2)})`; };

/**
 * The layout preview: the playing element drawn into its boxes — the screen
 * whole on a blurred copy of itself, the camera's crop, the round bubble —
 * exactly the boxes the render is sent (layouts.ts), scaled to the proxy.
 */
function drawLayout(c: HTMLCanvasElement, v: HTMLVideoElement, plan: LayoutPlan, shadow: { x: number; y: number; blur: number; color: string; opacity: number } | null) {
  const dpr = Math.min(2, window.devicePixelRatio || 1);
  const W = Math.round(c.clientWidth * dpr), H = Math.round(c.clientHeight * dpr);
  if (!W || !H) return;
  if (c.width !== W || c.height !== H) { c.width = W; c.height = H; }
  const g = c.getContext('2d');
  if (!g || v.readyState < 2 || !v.videoWidth) return;
  const vw = v.videoWidth, vh = v.videoHeight;
  /* Boxes are in source pixels; the proxy is smaller. */
  const kx = vw / plan.src[0], ky = vh / plan.src[1];
  const scale = (b: number[]) => [b[0] * kx, b[1] * ky, b[2] * kx, b[3] * ky];
  const whole = (dx: number, dy: number, dw: number, dh: number) => {
    g.save();
    g.beginPath(); g.rect(dx, dy, dw, dh); g.clip();
    const cover = Math.max(dw / vw, dh / vh);
    g.filter = 'blur(14px) brightness(.75)';
    g.drawImage(v, dx + (dw - vw * cover) / 2, dy + (dh - vh * cover) / 2, vw * cover, vh * cover);
    g.filter = 'none';
    const fitK = Math.min(dw / vw, dh / vh);
    g.drawImage(v, dx + (dw - vw * fitK) / 2, dy + (dh - vh * fitK) / 2, vw * fitK, vh * fitK);
    g.restore();
  };
  const crop = (b: number[], dx: number, dy: number, dw: number, dh: number) => { const [x, y, w, h] = scale(b); g.drawImage(v, x, y, w, h, dx, dy, dw, dh); };
  g.clearRect(0, 0, W, H);
  if (plan.kind === 'split') { whole(0, 0, W, H / 2); crop(plan.boxes[1], 0, H / 2, W, H / 2); return; }
  if (plan.kind === 'two') { crop(plan.boxes[0], 0, 0, W, H / 2); crop(plan.boxes[1], 0, H / 2, W, H / 2); return; }
  whole(0, 0, W, H);
  const ins = plan.inset!, r = W / plan.out[0];
  const bx = ins.x * r, by = ins.y * r, bs = ins.size * r;
  if (shadow) {
    g.save();
    g.shadowColor = hexA(shadow.color, shadow.opacity / 100); g.shadowBlur = shadow.blur * r; g.shadowOffsetX = shadow.x * r; g.shadowOffsetY = shadow.y * r;
    g.beginPath(); g.arc(bx + bs / 2, by + bs / 2, bs / 2, 0, Math.PI * 2); g.fillStyle = '#000'; g.fill();
    g.restore();
  }
  g.save();
  g.beginPath(); g.arc(bx + bs / 2, by + bs / 2, bs / 2, 0, Math.PI * 2); g.clip();
  crop(plan.boxes[0], bx, by, bs, bs);
  g.restore();
}

export default function Player({ ctx }: { ctx: EditorCtx }) {
  const { view, doc, transcript, duration } = ctx;
  const clip = ctx.activeClip ? doc.clips.find(c => c.id === ctx.activeClip) ?? null : null;
  const aRef = useRef<HTMLVideoElement>(null);
  const bRef = useRef<HTMLVideoElement>(null);
  const deckRef = useRef<HTMLDivElement>(null);
  const deck = useRef<Deck | null>(null);
  const layoutRef = useRef<HTMLCanvasElement>(null);
  const audioRef = useRef<HTMLAudioElement>(null);
  const shellRef = useRef<HTMLDivElement>(null);
  const frameRef = useRef<HTMLDivElement>(null);
  const fillRef = useRef<HTMLDivElement>(null);
  const knobRef = useRef<HTMLDivElement>(null);
  const clockRef = useRef<HTMLSpanElement>(null);
  const barRef = useRef<HTMLDivElement>(null);
  const shadeRef = useRef<HTMLDivElement>(null);
  const resume = useRef<{ at: number; play: boolean } | null>(null);
  const [playing, setPlaying] = useState(false);
  const [muted, setMuted] = useState(false);
  const [frameH, setFrameH] = useState(360);
  const video = useHeldSrc(view.source.proxyUrl);
  const music = useHeldSrc(view.musicUrl);

  /* Kept by value: every poll hands over the same edit as a new object, and a
     new `keeps` each time re-ran the music and re-planned the deck mid-play. */
  const keepsNow = useMemo(() => keepRanges(duration, doc, clip ? [clip.s, clip.e] : undefined), [duration, doc, clip]);
  const keepsKey = keepsNow.map(([a, b]) => `${a},${b}`).join(';');
  const keeps = useMemo(() => keepsNow, [keepsKey]); // eslint-disable-line react-hooks/exhaustive-deps
  const errors = useRef(0);
  const kind = clip ? 'short' as const : 'long' as const;
  const look = lookOf(doc, kind), motion = motionOf(doc, kind);
  /* A Short laid out as "speaker" follows the speaker, as its render will. */
  const tracking = clip?.layout === 'speaker' ? 'speaker' : trackingOf(doc, kind);
  const fx = effectsOn(effectsOf(doc, kind));
  const speed = motion.speed;
  const cues = useMemo(() => transcript ? cuesOf(retimeWords(transcript.words, keeps, doc.captionEdits), kind) : [], [transcript, keeps, doc.captionEdits, kind]);
  const spans = useMemo(() => motion.zoom === 'punch' && transcript ? punchSpans(sentencesOf(transcript.words), keeps) : [], [motion.zoom, transcript, keeps]);
  const cuts = useMemo(() => motion.transition !== 'none' ? cutTimes(keeps) : [], [motion.transition, keeps]);
  const style = doc.captions[kind];
  const out = toOutput(ctx.time, keeps);
  const total = keptLength(keeps);
  const cue = doc.captions.on && out !== null ? cues.find(c => out >= c.s && out < c.e) : undefined;
  const track = doc.music && (doc.music.applyTo === 'all' || (doc.music.applyTo === 'long') === !clip) ? doc.music : null;
  const words = useMemo(() => (doc.overlays ?? []).map(o => ({ o, span: overlaySpan(o, keeps) })).filter(x => x.span), [doc.overlays, keeps]);

  const aspect = clip ? clip.aspect : doc.long.aspect;
  const ratio = aspect === '9:16' ? 9 / 16 : aspect === '1:1' ? 1 : aspect === '4:5' ? 4 / 5 : aspect === '16:9' ? 16 / 9 : (view.source.probe ? view.source.probe.width / view.source.probe.height : 16 / 9);
  const reframe = clip ? clip.reframe : doc.long.reframe;
  const fit = reframe.mode === 'fit';
  const cropping = !fit && aspect !== 'source';
  const srcRatio = view.source.probe ? view.source.probe.width / view.source.probe.height : 16 / 9;
  /** Where the crop sits, as the engine places it: centred on (cx, cy), the face a little above the middle. */
  const objPos = (cx: number, cy: number, bias = 0.5) => {
    const cw = Math.min(1, ratio / srcRatio), ch = Math.min(1, srcRatio / ratio);
    const px = cw >= 1 ? 0.5 : Math.min(1, Math.max(0, (cx - cw / 2) / (1 - cw)));
    const py = ch >= 1 ? 0.5 : Math.min(1, Math.max(0, (cy - ch * bias) / (1 - ch)));
    return `${(px * 100).toFixed(2)}% ${(py * 100).toFixed(2)}%`;
  };
  const followRows = cropping && tracking !== 'off' ? ctx.track?.[tracking] ?? null : null;

  /* Everything the frame painter reads, kept current without re-subscribing it. */
  const report = ctx.seek;
  /* A split / two-person / picture-in-picture Short is drawn on a canvas from
     the playing element, with the same boxes the engine is sent. */
  const probe = view.source.probe;
  const plan: LayoutPlan | null = useMemo(() => {
    if (!clip?.layout || !probe || !['split', 'two', 'pip'].includes(clip.layout)) return null;
    const out = dimsFor(clip.aspect, probe.width, probe.height);
    return layoutPlan(clip.layout, ctx.track, probe.width, probe.height, out.width, out.height);
  }, [clip?.layout, clip?.aspect, probe, ctx.track]); // eslint-disable-line react-hooks/exhaustive-deps
  const live = useRef({ keeps, total, speed, motion, spans, cuts, followRows, objPos, report, plan, shadow: fx.shadow ?? null });
  live.current = { keeps, total, speed, motion, spans, cuts, followRows, objPos, report, plan, shadow: fx.shadow ?? null };

  /* The deck: two elements swapped at each cut (deck.ts says why). It is made
     once; the edit, the speed and the sound reach it below. Everything that
     moves every frame is written straight to the elements from its loop. */
  useEffect(() => {
    const a = aRef.current, b = bRef.current, wrap = deckRef.current;
    if (!a || !b || !wrap) return;
    let last = -1, lastAt = 0;
    const paint = (t: number) => {
      const L = live.current;
      const o = toOutput(t, L.keeps) ?? 0;
      const pct = L.total ? Math.min(100, (o / L.total) * 100) : 0;
      if (fillRef.current) fillRef.current.style.width = `${pct}%`;
      if (knobRef.current) knobRef.current.style.left = `${pct}%`;
      if (clockRef.current) clockRef.current.textContent = `${clock(o / L.speed)} / ${clock(L.total / L.speed)}`;
      if (barRef.current) barRef.current.style.width = `${pct}%`;
      /* The zoom and the tracked crop. */
      let z = 1;
      const m = L.motion;
      if (m.zoom === 'slow') z = 1 + (m.zoomAmount - 1) * Math.min(1, o / Math.max(1, L.total));
      else if (m.zoom === 'punch' && L.spans.some(([s0, e0]) => o >= s0 && o < e0)) z = m.zoomAmount;
      wrap.style.transform = z !== 1 ? `scale(${z.toFixed(3)})` : '';
      if (L.followRows) { const [cx, cy] = trackAt(L.followRows, t); const pos = L.objPos(cx, cy, 0.42); a.style.objectPosition = pos; b.style.objectPosition = pos; }
      if (L.plan && layoutRef.current) drawLayout(layoutRef.current, a.classList.contains('on') ? a : b, L.plan, L.shadow);
      /* Fades, and a flash or dip at each jump cut. */
      if (shadeRef.current) {
        const ft = o / L.speed, end = L.total / L.speed;
        let black = 0, white = 0;
        if (m.fadeIn && ft < m.fadeIn) black = 1 - ft / m.fadeIn;
        if (m.fadeOut && ft > end - m.fadeOut) black = Math.max(black, 1 - (end - ft) / m.fadeOut);
        if (L.cuts.length && L.cuts.some(c => Math.abs(o - c) < 0.07)) { if (m.transition === 'flash') white = 0.35; else black = Math.max(black, 0.55); }
        shadeRef.current.style.background = white ? `rgba(255,255,255,${white})` : `rgba(0,0,0,${black.toFixed(3)})`;
      }
      window.dispatchEvent(new CustomEvent('vs-frame', { detail: t }));
      const now = performance.now();
      if (Math.abs(t - last) > 0.04 && now - lastAt > 90) { last = t; lastAt = now; L.report(-1 - t); }
    };
    const d = new Deck(a, b, paint);
    deck.current = d;
    d.setKeeps(live.current.keeps);
    d.setRate(live.current.speed);
    /* The transcript follows the playhead while the video plays, and its Space key plays and pauses. */
    const said = (on: boolean) => window.dispatchEvent(new CustomEvent('vs-play-state', { detail: on }));
    const onPlay = () => { setPlaying(true); said(true); };
    const onPause = () => { setPlaying(false); said(false); live.current.report(-1 - d.time); };
    const onToggle = () => d.toggle();
    const onPlayAsk = () => { if (!d.playing) d.play(); };
    window.addEventListener('vs-toggle', onToggle);
    window.addEventListener('vs-play', onPlayAsk);
    const onSeeked = () => live.current.report(-1 - d.time);
    d.addEventListener('play', onPlay);
    d.addEventListener('pause', onPause);
    d.addEventListener('seeked', onSeeked);
    return () => { window.removeEventListener('vs-toggle', onToggle); window.removeEventListener('vs-play', onPlayAsk); said(false); d.removeEventListener('play', onPlay); d.removeEventListener('pause', onPause); d.removeEventListener('seeked', onSeeked); d.destroy(); deck.current = null; };
  }, []);

  useEffect(() => { deck.current?.setKeeps(keeps); }, [keeps]);
  useEffect(() => { const d = deck.current, c = layoutRef.current; if (d && c && plan) drawLayout(c, d.active, plan, fx.shadow ?? null); }, [plan, fx.shadow, frameH]); // eslint-disable-line react-hooks/exhaustive-deps
  /* The speed, as the render will play it. */
  useEffect(() => { deck.current?.setRate(speed); }, [speed, video.src]);
  useEffect(() => { deck.current?.setMuted(muted); }, [muted]);

  /* The music follows the picture: started, stopped and placed on the
     output's clock (looped as the render loops it), checked once a second. */
  useEffect(() => {
    const d = deck.current, a = audioRef.current;
    if (!d || !a || !track) return;
    a.volume = Math.min(1, track.volume);
    const place = () => {
      const o = (toOutput(d.time, keeps) ?? 0) / speed;
      const dur = a.duration;
      const want = dur && Number.isFinite(dur) ? (track.loop ? o % dur : Math.min(o, dur)) : o;
      if (Math.abs(a.currentTime - want) > 0.35) a.currentTime = want;
    };
    const play = () => { place(); void a.play().catch(() => {}); };
    const stop = () => a.pause();
    d.addEventListener('play', play);
    d.addEventListener('pause', stop);
    d.addEventListener('seeked', place);
    const t = setInterval(() => { if (d.playing) place(); }, 1000);
    if (d.playing) play();
    return () => { clearInterval(t); d.removeEventListener('play', play); d.removeEventListener('pause', stop); d.removeEventListener('seeked', place); a.pause(); };
  }, [track, keeps, music.src, speed]);

  /* A Short opens at its own start. */
  useEffect(() => { const d = deck.current; if (d && clip) { d.setKeeps(keeps); d.seek(keeps[0]?.[0] ?? clip.s); } }, [clip?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    const el = frameRef.current;
    if (!el) return;
    const ro = new ResizeObserver(() => setFrameH(el.clientHeight));
    ro.observe(el);
    return () => ro.disconnect();
  }, [clip?.id]);

  /* Seeks asked for by the panels and the timeline. */
  useEffect(() => {
    const onSeek = (e: Event) => { deck.current?.seek((e as CustomEvent<number>).detail); };
    window.addEventListener('vs-seek', onSeek);
    return () => window.removeEventListener('vs-seek', onSeek);
  }, []);

  /* Space plays and pauses; the arrows step five seconds of the edit; J and L too. */
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const el = e.target as HTMLElement;
      /* The transcript editor owns its keys (arrows move its text cursor). */
      if (['INPUT', 'TEXTAREA', 'SELECT', 'BUTTON'].includes(el?.tagName) || el?.isContentEditable || el?.closest?.('[data-keys="own"]')) return;
      if (e.key === ' ' || e.key === 'k') { e.preventDefault(); toggle(); }
      else if ((e.key === 'ArrowLeft' || e.key === 'j') && !e.metaKey && !e.ctrlKey) step(-5);
      else if ((e.key === 'ArrowRight' || e.key === 'l') && !e.metaKey && !e.ctrlKey) step(5);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  });

  const base = kind === 'short' ? (88 / 1920) * frameH : 0.05 * frameH;

  function toggle() { deck.current?.toggle(); }
  function seekOut(o: number) { deck.current?.seek(toSource(Math.max(0, Math.min(total - 0.05, o)), keeps)); }
  function step(d: number) { seekOut((toOutput(deck.current?.time ?? 0, keeps) ?? 0) + d * speed); }

  const scrubAt = (e: React.PointerEvent<HTMLDivElement>) => {
    const r = e.currentTarget.getBoundingClientRect();
    seekOut(((e.clientX - r.left) / Math.max(1, r.width)) * total);
  };
  const filter = [cssLook(look), cssEffects(fx)].filter(f => f && f !== 'none').join(' ') || 'none';
  /* Where the picture sits inside a "whole picture" frame — the shadow goes under that. */
  const inner = fit && probe ? (srcRatio >= ratio ? { w: 1, h: ratio / srcRatio } : { w: srcRatio / ratio, h: 1 }) : null;
  const sh = fx.shadow;

  return (
    <div className="vse-player" ref={shellRef} data-testid="vs-preview">
      <div className="vse-screen">
        <div ref={frameRef} className={`vs-frame ${fit ? 'fit' : ''}`}
          style={{ aspectRatio: String(ratio), width: `min(100%, calc(var(--vse-screen-h, 56vh) * ${ratio.toFixed(4)}))`,
            backgroundImage: fit && view.source.posterUrl ? `url("${view.source.posterUrl}")` : undefined, backgroundSize: 'cover', backgroundPosition: 'center' }}>
          {fit && <div style={{ position: 'absolute', inset: 0, backdropFilter: 'blur(18px) brightness(.75)', WebkitBackdropFilter: 'blur(18px) brightness(.75)' }} />}
          {inner && sh && !plan && (
            <div className="vse-fxshadow" data-testid="vs-shadow-preview" style={{ left: `${(1 - inner.w) * 50}%`, top: `${(1 - inner.h) * 50}%`, width: `${inner.w * 100}%`, height: `${inner.h * 100}%`,
              boxShadow: `${(sh.x * frameH / 1920).toFixed(1)}px ${(sh.y * frameH / 1920).toFixed(1)}px ${(sh.blur * frameH / 1920).toFixed(1)}px ${hexA(sh.color, sh.opacity / 100)}` }} />
          )}
          <div ref={deckRef} className="vs-deck" onClick={toggle} data-testid="vs-video" data-src={video.src} data-look={look.filter}
            style={{ filter: filter === 'none' ? undefined : filter, transformOrigin: '50% 40%' }}>
            {[aRef, bRef].map((r, i) => (
              <video key={i} ref={r} src={video.src || undefined} poster={view.source.posterUrl || undefined} playsInline preload="auto"
                style={{ objectFit: fit || aspect === 'source' ? 'contain' : 'cover', objectPosition: cropping ? objPos(reframe.x, reframe.y) : 'center' }}
                onError={e => {
                  /* An expired link gets the newest one; a link that is still
                     good (a range request cut off) is loaded again — an
                     element left in its error state never plays or seeks, so
                     the deck waited on it for ever. A few tries, then the
                     error stands. */
                  const el = e.currentTarget, d = deck.current;
                  if (d && el === d.active) resume.current = { at: d.time, play: d.playing };
                  video.fail();
                  if (errors.current++ > 6) return;
                  void ctx.refresh().then(() => setTimeout(() => { if (el.error) el.load(); }, 400));
                }}
                onLoadedMetadata={e => {
                  const d = deck.current, r0 = resume.current;
                  if (d && r0 && e.currentTarget === d.active) { resume.current = null; d.seek(r0.at); if (r0.play) d.play(); }
                  if (d && e.currentTarget === d.active) errors.current = 0;
                }} />
            ))}
          </div>
          {plan && <canvas ref={layoutRef} className="vse-layout" data-testid="vs-layout-preview" data-layout={plan.kind} aria-label={`${LAYOUT_LABEL[plan.kind]} — preview`} />}
          <div ref={shadeRef} className="vse-shade" />
          {words.map(({ o, span }) => out !== null && out >= span![0] && out < span![1] && (
            <div key={o.id} className={`vse-ov ${o.style} pos-${o.position} anim-${o.anim}`} data-testid="vs-overlay"
              style={{ fontSize: Math.max(10, frameH * ({ title: 0.075, lower: 0.042, cta: 0.05, label: 0.034, quote: 0.055 }[o.style] ?? 0.06) * (ratio < 1 ? 0.62 : 1)), color: o.color, ['--ovbg' as string]: o.bg }}>
              <span>{o.style === 'quote' ? `“${o.text}”` : o.text}</span>
            </div>
          ))}
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
          {motion.progressBar && <div ref={barRef} className="vse-progress" style={{ background: style.highlight }} />}
        </div>
        <div className="vse-target">
          <span className="vs-badge">{clip ? `Short ${doc.clips.findIndex(c => c.id === clip.id) + 1} · ${clip.aspect}` : 'Long video'} · preview of the edit</span>
          {speed !== 1 && <span className="vs-badge"><Gauge size={11} /> {speed}×</span>}
          {followRows && <span className="vs-badge">Following the {tracking}</span>}
          {plan && <span className="vs-badge">{LAYOUT_LABEL[plan.kind]}</span>}
          {(fx.green || fx.appearance) && <span className="vs-badge" title="The preview cannot key a green screen or find skin to smooth; the render does both">{fx.green ? 'Green screen' : 'Skin smoothing'} in the render</span>}
          {track && <span className="vs-badge" title="Ducking under speech and noise reduction are heard in the rendered file"><Music2 size={11} /> {track.title.slice(0, 26)}</span>}
        </div>
        {track && music.src && <audio ref={audioRef} src={music.src} preload="auto" muted={muted} loop={track.loop} onError={() => { music.fail(); void ctx.refresh(); }} />}
      </div>
      <div className="vse-hud">
        <button type="button" className="vs-btn skip" onClick={() => step(-5)} aria-label="Back 5 seconds" disabled={!video.src}><Rewind size={15} /></button>
        <button type="button" className="vs-btn play" onClick={toggle} aria-label={playing ? 'Pause' : 'Play'} disabled={!video.src} data-testid="vs-play">{playing ? <Pause size={16} /> : <Play size={16} />}</button>
        <button type="button" className="vs-btn skip" onClick={() => step(5)} aria-label="Forward 5 seconds" disabled={!video.src}><FastForward size={15} /></button>
        <span className="vse-time-label" data-testid="vs-time" ref={clockRef}>{clock((out ?? 0) / speed)} / {clock(total / speed)}</span>
        <div className="vse-scrub" role="slider" aria-label="Position in the edited video" aria-valuemin={0} aria-valuemax={Math.round(total)} aria-valuenow={Math.round(out ?? 0)} tabIndex={0}
          onPointerDown={e => { e.currentTarget.setPointerCapture(e.pointerId); scrubAt(e); }}
          onPointerMove={e => { if (e.buttons === 1) scrubAt(e); }}
          onKeyDown={e => { if (e.key === 'ArrowLeft') { e.preventDefault(); step(-5); } if (e.key === 'ArrowRight') { e.preventDefault(); step(5); } }}>
          <div className="rail" /><div className="fill" ref={fillRef} /><div className="knob" ref={knobRef} />
        </div>
        <button type="button" className="vs-btn" onClick={() => setMuted(m => !m)} aria-label={muted ? 'Sound on' : 'Mute'}>{muted ? <VolumeX size={15} /> : <Volume2 size={15} />}</button>
        <button type="button" className="vs-btn" onClick={() => { const el = shellRef.current; if (!el) return; if (document.fullscreenElement) void document.exitFullscreen(); else void el.requestFullscreen?.().catch(() => {}); }} aria-label="Full screen"><Maximize2 size={15} /></button>
      </div>
    </div>
  );
}
