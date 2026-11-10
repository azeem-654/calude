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
import { createPortal } from 'react-dom';
import { Play, Pause, SkipBack, SkipForward, Volume2, VolumeX, Maximize2, Minimize2, Columns2, RectangleHorizontal, Music2, Gauge, Circle, Scissors, Minus, Plus, MousePointer2, Hand } from 'lucide-react';
import {
  keepRanges, clipKeeps, keptLength, retimeWords, cuesOf, toOutput, toSource, clock, isRtl, lookOf, motionOf, trackingOf, cssLook, punchSpans, cutTimes, trackAt, overlaySpan, overlayPlace, OVERLAY_SIZE, OVERLAY_FAMILY, logoBox, logoFor, sentencesOf,
  cssEffects, effectsOf, layoutPlan, dimsFor, LAYOUT_LABEL, type LayoutPlan,
  pointerOf, pointerInFrame, focusWindows, zoomPlan, zoomAt, screenPlan, followPath, followAt, wideSpans, isWide, frameMap, resolveCursor, type ScreenPlan, type ZoomPlan,
  visualSpec, knownOf, framePlan, framingKey, STRATEGY_LABEL, vignetteStops, grainOpacity, sharpenKernel, type FramePlan, type Look, type Effects, type EffectKey,
} from '../../services/videoStudio';
import { GreenKey } from './greenKey';
import type { EditorCtx } from './VideoEditor';
import { Deck } from './deck';

/** The picture the layout painters draw from: the playing element, or the keyed canvas when the green screen is on. */
interface Pic { el: CanvasImageSource; w: number; h: number }
const picOf = (v: HTMLVideoElement, keyed: HTMLCanvasElement | null): Pic =>
  keyed ? { el: keyed, w: keyed.width, h: keyed.height } : { el: v, w: v.readyState >= 2 ? v.videoWidth : 0, h: v.videoHeight };

/**
 * A slider being dragged (EffectsPanels `vs-tweak`): the value shown in the
 * preview at once, before it is saved on release. The look or the one
 * effect it touches is laid over the edit's own for the filter string only.
 */
export interface Tweak { target: 'long' | 'short'; look?: Partial<Look>; effect?: { key: EffectKey; patch: Record<string, number | string> } }
export const tweak = (t: Tweak | null) => window.dispatchEvent(new CustomEvent('vs-tweak', { detail: t }));
import { LiveSound } from './liveSound';

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


/** The transport's clock: minutes, seconds and a tenth — "01:16.4" (hours when there are any). */
export function tc(t: number): string {
  const x = Math.max(0, t), h = Math.floor(x / 3600), m = Math.floor((x % 3600) / 60), sec = x % 60;
  const ss = sec.toFixed(1).padStart(4, '0');
  return `${h ? `${h}:` : ''}${String(m).padStart(2, '0')}:${ss === '60.0' ? '59.9' : ss}`;
}
const RATES = [0.5, 0.75, 1, 1.25, 1.5, 2];

const hexA = (hex: string, a: number) => { const n = parseInt(hex.slice(1), 16); return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${a.toFixed(2)})`; };

/**
 * The layout preview: the playing element drawn into its boxes — the screen
 * whole on a blurred copy of itself, the camera's crop, the round bubble —
 * exactly the boxes the render is sent (layouts.ts), scaled to the proxy.
 */
function drawLayout(c: HTMLCanvasElement, pic: Pic, plan: LayoutPlan, shadow: { x: number; y: number; blur: number; color: string; opacity: number } | null) {
  const dpr = Math.min(2, window.devicePixelRatio || 1);
  const W = Math.round(c.clientWidth * dpr), H = Math.round(c.clientHeight * dpr);
  if (!W || !H) return;
  if (c.width !== W || c.height !== H) { c.width = W; c.height = H; }
  const g = c.getContext('2d');
  if (!g || !pic.w || !pic.h) return;
  const v = pic.el;
  const vw = pic.w, vh = pic.h;
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

/**
 * A Screen Recorder Short laid out round the pointer: the camera's box whole
 * on a blurred copy of itself in a third of the height (under the screen
 * unless asked for on top), the window at its place along the follow path —
 * and, in a whole-screen moment, the screen fitted whole with the camera
 * stepped aside. The boxes the render is sent.
 */
function drawScreenLayout(c: HTMLCanvasElement, pic: Pic, plan: ScreenPlan & { fitScreen?: boolean }, at: [number, number] | null, wide = false) {
  const dpr = Math.min(2, window.devicePixelRatio || 1);
  const W = Math.round(c.clientWidth * dpr), H = Math.round(c.clientHeight * dpr);
  if (!W || !H) return;
  if (c.width !== W || c.height !== H) { c.width = W; c.height = H; }
  const g = c.getContext('2d');
  if (!g || !pic.w || !pic.h) return;
  const v = pic.el;
  const kx = pic.w / plan.src[0], ky = pic.h / plan.src[1];
  g.clearRect(0, 0, W, H);
  /* A box of the recording fitted into a band, on a blurred copy of itself. */
  const fitted = (x: number, y: number, w: number, h: number, by: number, bh: number) => {
    g.save(); g.beginPath(); g.rect(0, by, W, bh); g.clip();
    const cover = Math.max(W / w, bh / h), fit = Math.min(W / w, bh / h);
    g.filter = 'blur(14px) brightness(.75)';
    g.drawImage(v, x * kx, y * ky, w * kx, h * ky, (W - w * cover) / 2, by + (bh - h * cover) / 2, w * cover, h * cover);
    g.filter = 'none';
    g.drawImage(v, x * kx, y * ky, w * kx, h * ky, (W - w * fit) / 2, by + (bh - h * fit) / 2, w * fit, h * fit);
    g.restore();
  };
  if (wide) { const [rx, ry, rw, rh] = plan.region; fitted(rx, ry, rw, rh, 0, H); return; }
  const band = Math.round(H * plan.top / plan.out[1]);
  const camY = plan.camAt === 'top' ? 0 : H - band, scrY = plan.camAt === 'top' ? band : 0;
  if (plan.cam && band > 0) { const [x, y, w, h] = plan.cam; fitted(x, y, w, h, camY, band); }
  /* Slides under the camera: the screen band carries the region whole, as the engine's fitScreen does. */
  if (plan.fitScreen) { const [rx, ry, rw, rh] = plan.region; fitted(rx, ry, rw, rh, scrY, H - band); return; }
  const [cw, ch] = plan.crop, [x, y] = at ?? [plan.region[0], plan.region[1]];
  g.drawImage(v, x * kx, y * ky, cw * kx, ch * ky, 0, scrY, W, H - band);
}

/**
 * Aiming (the Video panel's "Point the window"): the whole recording fitted
 * into the frame, the region it may look at outlined, and the window where
 * it is now — so a click lands in the recording's own coordinates.
 */
function drawAim(c: HTMLCanvasElement, pic: Pic, plan: ScreenPlan, at: [number, number] | null): { ox: number; oy: number; k: number } | null {
  const dpr = Math.min(2, window.devicePixelRatio || 1);
  const W = Math.round(c.clientWidth * dpr), H = Math.round(c.clientHeight * dpr);
  if (!W || !H) return null;
  if (c.width !== W || c.height !== H) { c.width = W; c.height = H; }
  const g = c.getContext('2d');
  if (!g || !pic.w || !pic.h) return null;
  const [sw, sh] = plan.src;
  const k = Math.min(W / sw, H / sh), ox = (W - sw * k) / 2, oy = (H - sh * k) / 2;
  g.fillStyle = '#000'; g.fillRect(0, 0, W, H);
  g.drawImage(pic.el, 0, 0, pic.w, pic.h, ox, oy, sw * k, sh * k);
  g.fillStyle = 'rgba(0,0,0,.45)'; g.fillRect(ox, oy, sw * k, sh * k);
  const [rx, ry, rw, rh] = plan.region;
  g.save(); g.beginPath(); g.rect(ox + rx * k, oy + ry * k, rw * k, rh * k); g.clip(); g.drawImage(pic.el, 0, 0, pic.w, pic.h, ox, oy, sw * k, sh * k); g.restore();
  g.lineWidth = 2 * dpr; g.strokeStyle = 'rgba(255,255,255,.5)'; g.setLineDash([6 * dpr, 4 * dpr]); g.strokeRect(ox + rx * k, oy + ry * k, rw * k, rh * k); g.setLineDash([]);
  if (plan.cam) { const [cx, cy, cw, ch] = plan.cam; g.strokeStyle = 'rgba(96,165,250,.9)'; g.strokeRect(ox + cx * k, oy + cy * k, cw * k, ch * k); }
  if (at) { const [cw, ch] = plan.crop; g.lineWidth = 3 * dpr; g.strokeStyle = '#f472b6'; g.strokeRect(ox + at[0] * k, oy + at[1] * k, cw * k, ch * k); }
  return { ox, oy, k };
}

export default function Player({ ctx, transport, below }: {
  ctx: EditorCtx;
  /** Where the transport bar is drawn (the editor's own row under the panels); without one it sits under the picture. */
  transport?: HTMLElement | null;
  below?: React.ReactNode;
}) {
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
  /* The preview's own speed (Descript's "1x") — how fast it plays here, never the edit's speed. */
  const [rate, setRate] = useState(1);
  const [zoomPct, setZoomPct] = useState(100);
  const [tool, setTool] = useState<'select' | 'scrub'>('select');
  const [frameH, setFrameH] = useState(360);
  /* The playhead as this player knows it — the editor's copy is told less often (see paint). */
  const [here, setHere] = useState(ctx.time);
  /* Full screen (the controls come into the full-screen box with the picture — they live in the editor's
     transport row otherwise, which full screen left behind) and the big player (the script moves under it). */
  const [full, setFull] = useState(false);
  const [big, setBig] = useState(() => { try { return localStorage.getItem('crm_vs_big') === '1'; } catch { return false; } });
  useEffect(() => {
    const on = () => setFull(document.fullscreenElement === shellRef.current && !!shellRef.current);
    document.addEventListener('fullscreenchange', on);
    return () => document.removeEventListener('fullscreenchange', on);
  }, []);
  useEffect(() => {
    window.dispatchEvent(new CustomEvent('vs-big', { detail: big }));
    try { localStorage.setItem('crm_vs_big', big ? '1' : '0'); } catch { /* private window */ }
  }, [big]);
  const flipFull = () => { const el = shellRef.current; if (!el) return; if (document.fullscreenElement) void document.exitFullscreen(); else void el.requestFullscreen?.().catch(() => {}); };
  /* The sound fixes heard live (liveSound.ts), built from the same steps the engine runs. */
  const liveSound = useRef<LiveSound | null>(null);
  useEffect(() => { liveSound.current?.set(doc.audio); }, [doc.audio]);
  useEffect(() => { if (!deck.current?.playing) setHere(ctx.time); }, [ctx.time]);
  const video = useHeldSrc(view.source.proxyUrl);
  const music = useHeldSrc(view.musicUrl);

  /* Kept by value: every poll hands over the same edit as a new object, and a
     new `keeps` each time re-ran the music and re-planned the deck mid-play. */
  const keepsNow = useMemo(() => clipKeeps(duration, doc, clip), [duration, doc, clip]);
  const keepsKey = keepsNow.map(([a, b]) => `${a},${b}`).join(';');
  const keeps = useMemo(() => keepsNow, [keepsKey]); // eslint-disable-line react-hooks/exhaustive-deps
  const errors = useRef(0);
  const kind = clip ? 'short' as const : 'long' as const;
  const probe = view.source.probe;
  /* Every visual decision comes from visual.ts — the same function renderSpec reads (the preview and the render cannot drift). */
  const known = useMemo(() => knownOf(ctx.track, view.source.track?.summary), [ctx.track, view.source.track?.summary]);
  const vis = useMemo(() => probe ? visualSpec({ doc, clip, probe, tracked: !!view.source.track?.ready, known, screen: view.extras?.screen ?? null, keeps }) : null,
    [doc, clip, probe, view.source.track?.ready, known, view.extras?.screen, keeps]);
  /* A slider being dragged shows at once (EffectsPanels `vs-tweak`); the saved edit takes over on release. */
  const [tw, setTw] = useState<Tweak | null>(null);
  useEffect(() => {
    const on = (e: Event) => setTw((e as CustomEvent<Tweak | null>).detail);
    window.addEventListener('vs-tweak', on);
    return () => window.removeEventListener('vs-tweak', on);
  }, []);
  /* Aiming the planner's window (InspectorPanels `vs-aim`): the preview shows the whole recording and a click answers `vs-aimed` in its coordinates. */
  const [aim, setAim] = useState(false);
  const aimMap = useRef<{ ox: number; oy: number; k: number } | null>(null);
  useEffect(() => {
    const on = (e: Event) => setAim(!!(e as CustomEvent<boolean>).detail);
    window.addEventListener('vs-aim', on);
    return () => window.removeEventListener('vs-aim', on);
  }, []);
  useEffect(() => { if (!clip) setAim(false); }, [clip?.id]); // eslint-disable-line react-hooks/exhaustive-deps
  const logo = vis?.logo ?? logoFor(doc, kind);
  const look0 = vis?.look ?? lookOf(doc, kind), motion = vis?.motion ?? motionOf(doc, kind);
  const look: Look = tw?.target === kind && tw.look ? { ...look0, ...tw.look } : look0;
  const tracking = vis?.tracking ?? 'off';
  const fx0 = vis?.effects ?? {};
  const fx: Partial<Effects> = tw?.target === kind && tw.effect
    ? { ...fx0, [tw.effect.key]: { ...effectsOf(doc, kind)[tw.effect.key], ...fx0[tw.effect.key], ...tw.effect.patch, on: true } } as Partial<Effects>
    : fx0;
  const speed = motion.speed;
  const cues = useMemo(() => transcript ? cuesOf(retimeWords(transcript.words, keeps, doc.captionEdits), kind) : [], [transcript, keeps, doc.captionEdits, kind]);
  const spans = useMemo(() => motion.zoom === 'punch' && transcript ? punchSpans(sentencesOf(transcript.words), keeps) : [], [motion.zoom, transcript, keeps]);
  const cuts = useMemo(() => motion.transition !== 'none' ? cutTimes(keeps) : [], [motion.transition, keeps]);
  const style = doc.captions[kind];
  const out = toOutput(here, keeps);
  const total = keptLength(keeps);
  const cue = doc.captions.on && out !== null ? cues.find(c => out >= c.s && out < c.e) : undefined;
  const track = doc.music && (doc.music.applyTo === 'all' || (doc.music.applyTo === 'long') === !clip) ? doc.music : null;
  const words = useMemo(() => (doc.overlays ?? []).map(o => ({ o, span: overlaySpan(o, keeps) })).filter(x => x.span), [doc.overlays, keeps]);

  const aspect = clip ? clip.aspect : doc.long.aspect;
  const ratio = aspect === '9:16' ? 9 / 16 : aspect === '1:1' ? 1 : aspect === '4:5' ? 4 / 5 : aspect === '16:9' ? 16 / 9 : (probe ? probe.width / probe.height : 16 / 9);
  const reframe = clip ? clip.reframe : doc.long.reframe;
  const fit = vis ? vis.mode === 'fit' : reframe.mode === 'fit';
  const cropping = vis ? vis.mode === 'crop' : (!fit && aspect !== 'source');
  const srcRatio = probe ? probe.width / probe.height : 16 / 9;
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
  const plan: LayoutPlan | null = useMemo(() => {
    if (!vis?.layout || !probe) return null;
    return layoutPlan(vis.layout, ctx.track, probe.width, probe.height, vis.width, vis.height);
  }, [vis?.layout, vis?.width, vis?.height, probe, ctx.track]); // eslint-disable-line react-hooks/exhaustive-deps
  /* Stretches muted on the timeline: the preview turns its sound off there, as the render does. */
  const mutes = doc.mutes ?? [];

  /* Following the pointer of a Screen Recorder recording, as the render will
     (pipeline.ts pointerParams): a screen Short's layout round the pointer,
     the long video's zoom inside the moments, and the drawn pointer. */
  const scr = ctx.screen, sref = view.extras?.screen ?? null;
  const ptr = pointerOf(doc);
  const outDims = probe ? dimsFor(aspect, probe.width, probe.height) : null;
  const screenL = vis?.screenLayout ?? null;
  /* The planner's framing (reframe.ts): the same plan, path and whole-screen stretches the render is sent. */
  const frKey = vis?.framing ? JSON.stringify(framingKey(vis.framing)) : '';
  const fplan: FramePlan | null = useMemo(() => vis?.framing && probe && outDims ? framePlan(vis.framing, ctx.track, probe.width, probe.height, outDims.width, outDims.height, keeps) : null,
    [frKey, ctx.track, probe, outDims?.width, outDims?.height, keeps]); // eslint-disable-line react-hooks/exhaustive-deps
  const rplan: ScreenPlan | null = useMemo(() => screenL && scr && probe && outDims && clip ? screenPlan(screenL, scr, clip.s, clip.e, probe.width, probe.height, outDims.width, outDims.height) : null,
    [screenL, scr, probe, outDims?.width, outDims?.height, clip?.s, clip?.e]); // eslint-disable-line react-hooks/exhaustive-deps
  const splan: (ScreenPlan & { fitScreen?: boolean }) | null = fplan?.plan ?? rplan;
  const spath = useMemo(() => fplan ? fplan.path : rplan && scr ? followPath(scr, keeps, rplan) : null, [fplan, rplan, scr, keeps]);
  const swide = useMemo(() => fplan ? fplan.wide : rplan && scr ? wideSpans(scr, keeps, rplan) : null, [fplan, rplan, scr, keeps]);
  const screenLive = splan ? { splan, spath, swide, aim: aim && !!fplan } : null;
  const pwins = useMemo(() => scr && sref && ptr.on && (clip ? ptr.shorts && !!splan : ptr.long && tracking === 'off') ? focusWindows(ptr.focus, keeps) : [],
    [scr, sref, doc.pointer, clip, splan, keeps, tracking]); // eslint-disable-line react-hooks/exhaustive-deps
  const fmap = useMemo(() => probe && outDims ? frameMap(cropping ? 'crop' : fit ? 'fit' : 'source', probe.width, probe.height, outDims.width, outDims.height, reframe.x, reframe.y) : null,
    [probe, outDims?.width, outDims?.height, cropping, fit, reframe.x, reframe.y]); // eslint-disable-line react-hooks/exhaustive-deps
  const zplan: ZoomPlan | null = useMemo(() => !clip && pwins.length && scr && fmap && outDims ? zoomPlan(scr, keeps, pwins, ptr.zoom, outDims.width, outDims.height, fmap) : null,
    [clip, pwins, scr, fmap, keeps, ptr.zoom]); // eslint-disable-line react-hooks/exhaustive-deps
  const sentencesAll = useMemo(() => transcript ? sentencesOf(transcript.words) : [], [transcript]);
  const pcursors = useMemo(() => pwins.map(w => resolveCursor(w.range, ptr.cursor, sentencesAll)), [pwins, ptr.cursor, sentencesAll]);
  const ptrRef = useRef<HTMLDivElement>(null);
  const pointerLive = scr && (zplan || rplan) ? { scr, zplan, splan: rplan, spath, swide, pwins, pcursors, fmap, out: outDims!, size: ptr.size, color: ptr.color } : null;
  /* The green screen keyed in the preview (greenKey.ts) and the face box for skin smoothing, where the frame maps straight onto the recording. */
  const keyRef = useRef<HTMLCanvasElement>(null);
  const keyer = useRef<GreenKey | null>(null);
  const [keyOk, setKeyOk] = useState<boolean | null>(null);
  const green = fx.green ?? null;
  useEffect(() => {
    if (!green || !keyRef.current) { keyer.current?.destroy(); keyer.current = null; return; }
    const k = new GreenKey(keyRef.current);
    keyer.current = k; setKeyOk(k.ok);
    return () => { k.destroy(); keyer.current = null; };
  }, [!!green]); // eslint-disable-line react-hooks/exhaustive-deps
  const skinRef = useRef<HTMLCanvasElement>(null);
  const skinRows = fx.appearance && !plan && !splan && !followRows ? ctx.track?.face?.filter(r => r[3] > 0.02) ?? null : null;
  const skinH = useMemo(() => { if (!skinRows?.length) return 0; const hs = skinRows.map(r => r[3]).sort((a, b) => a - b); return hs[Math.floor(hs.length / 2)]; }, [skinRows]);
  const skinLive = skinRows?.length && fmap && outDims && fx.appearance ? { rows: skinRows, h: skinH, fmap, out: outDims, amount: fx.appearance.amount } : null;
  const live = useRef({ keeps, total, speed, motion, spans, cuts, followRows, objPos, report, plan, shadow: fx.shadow ?? null, mutes, muted, pointerLive, screenLive, green, skinLive, audio: doc.audio });
  live.current = { keeps, total, speed, motion, spans, cuts, followRows, objPos, report, plan, shadow: fx.shadow ?? null, mutes, muted, pointerLive, screenLive, green, skinLive, audio: doc.audio };

  /* The deck: two elements swapped at each cut (deck.ts says why). It is made
     once; the edit, the speed and the sound reach it below. Everything that
     moves every frame is written straight to the elements from its loop. */
  useEffect(() => {
    const a = aRef.current, b = bRef.current, wrap = deckRef.current;
    if (!a || !b || !wrap) return;
    let last = -1, lastAt = 0, lastRep = -1, repAt = 0, hush = false;
    const paint = (t: number) => {
      const L = live.current;
      const inMute = L.mutes.some(m => t >= m.s && t < m.e);
      if (inMute !== hush) { hush = inMute; deck.current?.setMuted(L.muted || inMute); }
      const o = toOutput(t, L.keeps) ?? 0;
      const pct = L.total ? Math.min(100, (o / L.total) * 100) : 0;
      if (fillRef.current) fillRef.current.style.width = `${pct}%`;
      if (knobRef.current) knobRef.current.style.left = `${pct}%`;
      if (clockRef.current) clockRef.current.textContent = `${tc(o / L.speed)} / ${tc(L.total / L.speed)}`;
      if (barRef.current) barRef.current.style.width = `${pct}%`;
      /* The zoom and the tracked crop. */
      let z = 1;
      const m = L.motion;
      if (m.zoom === 'slow') z = 1 + (m.zoomAmount - 1) * Math.min(1, o / Math.max(1, L.total));
      else if (m.zoom === 'punch' && L.spans.some(([s0, e0]) => o >= s0 && o < e0)) z = m.zoomAmount;
      const P = L.pointerLive;
      const zv = P?.zplan ? zoomAt(P.zplan, o) : null;
      if (zv && zv.z > 1.001) {
        /* Zoomed on the pointer: the view's top-left at the frame's corner, then scaled — the render's zoompan. */
        wrap.style.transformOrigin = '0 0';
        wrap.style.transform = `scale(${zv.z.toFixed(3)}) translate(${(-zv.x / P!.zplan!.w * 100).toFixed(3)}%, ${(-zv.y / P!.zplan!.h * 100).toFixed(3)}%)`;
      } else {
        wrap.style.transformOrigin = '50% 40%';
        wrap.style.transform = z !== 1 && !P?.zplan ? `scale(${z.toFixed(3)})` : '';
      }
      const act = a.classList.contains('on') ? a : b;
      /* The green screen keyed first: every painter below draws the keyed picture, as the engine keys before it lays out. */
      const kc = keyRef.current, keyed = L.green && kc && keyer.current?.ok && keyer.current.draw(act, L.green) ? kc : null;
      if (kc) { kc.style.objectPosition = act.style.objectPosition; kc.classList.toggle('on', !!keyed); }
      const pic = picOf(act, keyed);
      const S = L.screenLive;
      if (S?.splan && layoutRef.current) {
        if (S.aim) aimMap.current = drawAim(layoutRef.current, pic, S.splan, S.spath ? followAt(S.spath, o) : null);
        else drawScreenLayout(layoutRef.current, pic, S.splan, S.spath ? followAt(S.spath, o) : null, isWide(S.swide, o));
      }
      /* The drawn pointer, where the render draws it, inside the moments only. */
      const pe = ptrRef.current;
      if (pe) {
        const wi = P ? P.pwins.findIndex(w => o >= w.a && o <= w.b) : -1;
        const f = wi >= 0 && P ? pointerInFrame(P.scr, t) : null;
        let pos: [number, number] | null = null;
        if (f && P) {
          if (P.splan && P.spath) {
            const at = isWide(P.swide, o) ? null : followAt(P.spath, o), [cw, ch] = P.splan.crop, top = P.splan.top, [W, H] = P.splan.out;
            const y0 = P.splan.camAt === 'top' ? top : 0;
            if (at) pos = [(f[0] * P.splan.src[0] - at[0]) * (W / cw), y0 + (f[1] * P.splan.src[1] - at[1]) * ((H - top) / ch)];
            if (pos && (pos[1] < y0 || pos[1] > y0 + H - top || pos[0] < 0 || pos[0] > W)) pos = null;
          } else if (P.fmap) {
            const [px, py] = P.fmap(f[0], f[1]);
            pos = zv ? [(px - zv.x) * zv.z, (py - zv.y) * zv.z] : [px, py];
          }
        }
        const cur = wi >= 0 && P ? P.pcursors[wi] : 'none';
        if (pos && cur !== 'none' && P) {
          pe.hidden = false;
          pe.dataset.cursor = cur;
          pe.style.left = `${(pos[0] / P.out.width * 100).toFixed(2)}%`;
          pe.style.top = `${(pos[1] / P.out.height * 100).toFixed(2)}%`;
        } else pe.hidden = true;
      }
      if (L.followRows) { const [cx, cy] = trackAt(L.followRows, t); const pos = L.objPos(cx, cy, 0.42); a.style.objectPosition = pos; b.style.objectPosition = pos; }
      if (L.plan && layoutRef.current) drawLayout(layoutRef.current, pic, L.plan, L.shadow);
      /* Skin smoothing, roughly: the face box softened under an oval, where the engine's bilateral filter works (skinBox). */
      const sc = skinRef.current, K = L.skinLive;
      if (sc && K && pic.w) {
        const g2 = sc.getContext('2d');
        const cw = sc.clientWidth, chh = sc.clientHeight;
        if (g2 && cw && chh) {
          if (sc.width !== cw || sc.height !== chh) { sc.width = cw; sc.height = chh; }
          g2.clearRect(0, 0, cw, chh);
          const [fx0, fy0] = trackAt(K.rows, t);
          const [ox, oy] = K.fmap(fx0, fy0);
          const kx = cw / K.out.width, ky = chh / K.out.height;
          const bh = K.h * 1.6 * K.out.height * ky, bw = bh * 0.8, bx = ox * kx - bw / 2, by = oy * ky - bh / 2;
          const sx = (fx0 - K.h * 0.8 * (pic.h / pic.w) * 0.5) * pic.w, sy = (fy0 - K.h * 0.8) * pic.h, sw = K.h * 1.6 * pic.h * 0.8, shh = K.h * 1.6 * pic.h;
          g2.save();
          g2.filter = `blur(${(1.5 + 4 * K.amount / 100).toFixed(1)}px)`;
          g2.drawImage(pic.el, sx, sy, sw, shh, bx, by, bw, bh);
          g2.filter = 'none';
          g2.globalCompositeOperation = 'destination-in';
          const grad = g2.createRadialGradient(bx + bw / 2, by + bh / 2, 0, bx + bw / 2, by + bh / 2, Math.max(bw, bh) / 2);
          grad.addColorStop(0, `rgba(0,0,0,${(0.45 + 0.4 * K.amount / 100).toFixed(2)})`); grad.addColorStop(0.7, `rgba(0,0,0,${(0.35 + 0.3 * K.amount / 100).toFixed(2)})`); grad.addColorStop(1, 'rgba(0,0,0,0)');
          g2.fillStyle = grad; g2.fillRect(bx - 2, by - 2, bw + 4, bh + 4);
          g2.restore();
        }
      }
      /* Fades, and a flash or dip at each jump cut. */
      if (shadeRef.current) {
        const ft = o / L.speed, end = L.total / L.speed;
        let black = 0, white = 0;
        if (m.fadeIn && ft < m.fadeIn) black = 1 - ft / m.fadeIn;
        if (m.fadeOut && ft > end - m.fadeOut) black = Math.max(black, 1 - (end - ft) / m.fadeOut);
        if (m.transition !== 'smooth' && L.cuts.length && L.cuts.some(c => Math.abs(o - c) < 0.07)) { if (m.transition === 'flash') white = 0.35; else black = Math.max(black, 0.55); }
        shadeRef.current.style.background = white ? `rgba(255,255,255,${white})` : `rgba(0,0,0,${black.toFixed(3)})`;
      }
      window.dispatchEvent(new CustomEvent('vs-frame', { detail: t }));
      const now = performance.now();
      /* Captions and words on screen follow ten times a second (this player only); the rest of the
         editor — transcript, timeline labels, panels — four times while playing: telling the whole
         editor ten times a second redrew it under the video and the preview stuttered. */
      if (Math.abs(t - last) > 0.04 && now - lastAt > 90) { last = t; lastAt = now; setHere(t); }
      if (Math.abs(t - lastRep) > 0.04 && (!deck.current?.playing || now - repAt > 250)) { lastRep = t; repAt = now; L.report(-1 - t); }
    };
    const d = new Deck(a, b, paint);
    deck.current = d;
    d.setKeeps(live.current.keeps);
    d.setRate(live.current.speed);
    /* The transcript follows the playhead while the video plays, and its Space key plays and pauses. */
    const said = (on: boolean) => window.dispatchEvent(new CustomEvent('vs-play-state', { detail: on }));
    const ls = new LiveSound([a, b]);
    ls.set(live.current.audio);
    liveSound.current = ls;
    const onPlay = () => { setPlaying(true); said(true); void ls.start(); };
    const onPause = () => { setPlaying(false); said(false); live.current.report(-1 - d.time); };
    const onToggle = () => d.toggle();
    const onPlayAsk = () => { if (!d.playing) d.play(); };
    window.addEventListener('vs-toggle', onToggle);
    window.addEventListener('vs-play', onPlayAsk);
    const onSeeked = () => live.current.report(-1 - d.time);
    d.addEventListener('play', onPlay);
    d.addEventListener('pause', onPause);
    d.addEventListener('seeked', onSeeked);
    return () => { window.removeEventListener('vs-toggle', onToggle); window.removeEventListener('vs-play', onPlayAsk); said(false); d.removeEventListener('play', onPlay); d.removeEventListener('pause', onPause); d.removeEventListener('seeked', onSeeked); d.destroy(); deck.current = null; ls.destroy(); liveSound.current = null; };
  }, []);

  useEffect(() => { deck.current?.setKeeps(keeps); }, [keeps]);
  useEffect(() => { const d = deck.current, c = layoutRef.current; if (d && c && plan) drawLayout(c, picOf(d.active, null), plan, fx.shadow ?? null); }, [plan, fx.shadow, frameH]); // eslint-disable-line react-hooks/exhaustive-deps
  /* The speed, as the render will play it. */
  useEffect(() => { deck.current?.setRate(speed * rate); }, [speed, rate, video.src]);
  /* The timeline says how far it is zoomed; the transport shows it. */
  useEffect(() => {
    const on = (e: Event) => setZoomPct(Math.round((e as CustomEvent<number>).detail));
    window.addEventListener('vs-tl-zoomed', on);
    return () => window.removeEventListener('vs-tl-zoomed', on);
  }, []);
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
  /* The look and the colour effects as one filter on the picture (deck, keyed canvas and layout canvas alike —
     it used to sit on the deck only, so a laid-out Short lost its look); sharpness is an SVG kernel in the same
     chain, placed where the engine's unsharp runs (after the colour, before the blur). */
  const kernel = sharpenKernel(look.sharpness);
  const sharp = kernel ? `url(#vs-sharpen-${kind})` : '';
  const lookCss = cssLook(look);
  const lookParts = lookCss === 'none' ? [] : lookCss.split(' ');
  const blurAt = lookParts.findIndex(p => p.startsWith('blur('));
  const withSharp = sharp ? (blurAt >= 0 ? [...lookParts.slice(0, blurAt), sharp, ...lookParts.slice(blurAt)] : [...lookParts, sharp]) : lookParts;
  const filter = [...withSharp, cssEffects(fx)].filter(f => f && f !== 'none').join(' ') || 'none';
  const vignette = vignetteStops(look.vignette);
  const grain = grainOpacity(look);
  /* Where the picture sits inside a "whole picture" frame — the shadow goes under that. */
  const inner = fit && probe ? (srcRatio >= ratio ? { w: 1, h: ratio / srcRatio } : { w: srcRatio / ratio, h: 1 }) : null;
  const sh = fx.shadow;

  return (
    <div className={`vse-player ${full ? 'is-full' : ''}`} ref={shellRef} data-testid="vs-preview">
      <div className="vse-screen" data-noinvert="">
        <div ref={frameRef} className={`vs-frame ${fit ? 'fit' : ''}`}
          style={{ aspectRatio: String(ratio), width: `min(100%, calc(var(--vse-screen-h, 56vh) * ${ratio.toFixed(4)}))`,
            backgroundImage: fit && view.source.posterUrl ? `url("${view.source.posterUrl}")` : undefined, backgroundSize: 'cover', backgroundPosition: 'center' }}>
          {fit && <div style={{ position: 'absolute', inset: 0, backdropFilter: 'blur(18px) brightness(.75)', WebkitBackdropFilter: 'blur(18px) brightness(.75)' }} />}
          {inner && sh && !plan && (
            <div className="vse-fxshadow" data-testid="vs-shadow-preview" style={{ left: `${(1 - inner.w) * 50}%`, top: `${(1 - inner.h) * 50}%`, width: `${inner.w * 100}%`, height: `${inner.h * 100}%`,
              boxShadow: `${(sh.x * frameH / 1920).toFixed(1)}px ${(sh.y * frameH / 1920).toFixed(1)}px ${(sh.blur * frameH / 1920).toFixed(1)}px ${hexA(sh.color, sh.opacity / 100)}` }} />
          )}
          {kernel && <svg width="0" height="0" style={{ position: 'absolute' }} aria-hidden="true"><filter id={`vs-sharpen-${kind}`} colorInterpolationFilters="sRGB"><feConvolveMatrix order="3" kernelMatrix={kernel} preserveAlpha="true" /></filter></svg>}
          <div className="vse-picture" data-testid="vs-picture" data-filter={filter} style={{ filter: filter === 'none' ? undefined : filter }}>
          <div ref={deckRef} className={`vs-deck ${motion.transition === 'smooth' ? 'smooth' : ''} ${green && keyOk ? 'keyed' : ''}`} onClick={toggle} data-testid="vs-video" data-src={video.src} data-look={look.filter}
            style={{ transformOrigin: '50% 40%' }}>
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
            {green && <canvas ref={keyRef} className="vse-key" data-testid="vs-key-preview" aria-hidden="true" style={{ objectFit: fit || aspect === 'source' ? 'contain' : 'cover', objectPosition: cropping ? objPos(reframe.x, reframe.y) : 'center' }} />}
          </div>
          {(plan || splan) && <canvas ref={layoutRef} className="vse-layout" data-testid="vs-layout-preview" data-layout={plan?.kind ?? splan!.kind} data-framing={vis?.framing?.strategy ?? ''} aria-label={`${vis?.framing ? STRATEGY_LABEL[vis.framing.strategy] : LAYOUT_LABEL[plan?.kind ?? splan!.kind]} — preview`} />}
          {skinLive && <canvas ref={skinRef} className="vse-skin" data-testid="vs-skin-preview" aria-hidden="true" />}
          </div>
          {grain > 0 && <div className="vse-grain" data-testid="vs-grain-preview" style={{ opacity: grain }} />}
          {vignette && <div className="vse-vignette" data-testid="vs-vignette-preview" style={{ background: vignette }} />}
          {aim && fplan && (
            <div className="vse-aim" data-testid="vs-aim" role="button" tabIndex={0} aria-label="Click where the window should look"
              onClick={e => {
                const m = aimMap.current, c = layoutRef.current;
                if (!m || !c || !fplan) return;
                const r = c.getBoundingClientRect(), dpr = c.width / Math.max(1, r.width);
                const px = (e.clientX - r.left) * dpr, py = (e.clientY - r.top) * dpr;
                const x = (px - m.ox) / (m.k * fplan.plan.src[0]), y = (py - m.oy) / (m.k * fplan.plan.src[1]);
                if (x < 0 || x > 1 || y < 0 || y > 1) return;
                window.dispatchEvent(new CustomEvent('vs-aimed', { detail: { x: Math.round(x * 1000) / 1000, y: Math.round(y * 1000) / 1000, t: deck.current?.time ?? ctx.time } }));
              }}>
              <span>Click where the window should look</span>
            </div>
          )}
          {pointerLive && pwins.length > 0 && <div ref={ptrRef} className="vse-ptr" hidden data-testid="vs-pointer-preview" style={{ ['--ptr' as string]: ptr.color, ['--ptrk' as string]: String(ptr.size * frameH / 1080) }}><i /></div>}
          <div ref={shadeRef} className="vse-shade" />
          {words.map(({ o, span }) => {
            if (out === null || out < span![0] || out >= span![1]) return null;
            /* The same place and size the engine's script uses (overlayPlace, OVERLAY_SIZE), on the frame's own pixels. */
            const pl = overlayPlace(o, ratio < 1);
            const fs = Math.max(8, Math.min(frameH, frameH * ratio) * (OVERLAY_SIZE[o.style] ?? 0.06) * (o.size ?? 100) / 100);
            const txt = (o.icon ? `${o.icon} ` : '') + (o.style === 'quote' ? `“${o.text}”` : o.text);
            const font: React.CSSProperties = {
              fontFamily: `'${OVERLAY_FAMILY[o.font ?? 'sans'] ?? 'Noto Sans'}', system-ui, sans-serif`,
              fontWeight: (o.bold ?? o.style !== 'subtitle') ? 800 : 500, fontStyle: (o.italic ?? o.style === 'quote') ? 'italic' : 'normal',
              ...(o.font === 'condensed' ? { fontStretch: 'condensed', letterSpacing: '-0.02em' } : {}),
            };
            return o.style === 'ticker' ? (
              <div key={o.id} className="vse-ov ticker" data-testid="vs-overlay" data-style="ticker"
                style={{ top: `${pl.y}%`, fontSize: fs, color: o.color, ['--ovbg' as string]: o.bg, ['--tk' as string]: `${o.speed ?? 12}s`, ...font }}>
                <span>{txt}</span>
              </div>
            ) : (
              <div key={o.id} className={`vse-ov placed ${o.style} anim-${o.anim} ${pl.left ? 'left' : ''}`} data-testid="vs-overlay" data-style={o.style}
                style={{ left: `${pl.x}%`, top: `${pl.y}%`, fontSize: fs, color: o.color, ['--ovbg' as string]: o.bg, ...font }}>
                <span>{txt}</span>
              </div>
            );
          })}
          {logo && ctx.view.source.logoUrl && (() => {
            const W = frameH * ratio, b = logoBox(logo, W, frameH);
            return <img className="vse-logo" src={ctx.view.source.logoUrl} alt="" data-testid="vs-logo-preview"
              style={{ left: b.x, top: b.y, width: b.w, height: b.h, borderRadius: Math.min(b.w, b.h) * logo.radius / 100, opacity: logo.opacity / 100 }} />;
          })()}
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
          {splan && !fplan && <span className="vs-badge">{LAYOUT_LABEL[splan.kind]}</span>}
          {fplan && vis?.framing && <span className="vs-badge" data-testid="vs-framing-badge" title={vis.framing.note}>{STRATEGY_LABEL[vis.framing.strategy]}</span>}
          {pwins.length > 0 && <span className="vs-badge" title="Sounds are heard in the rendered video"><MousePointer2 size={11} /> Pointer followed in {pwins.length} moment{pwins.length === 1 ? '' : 's'}</span>}
          {fx.green && <span className="vs-badge" title={keyOk ? 'Keyed here with the same colour, similarity and softness the render uses' : 'This browser cannot key the picture (no WebGL); the render does'}>Green screen {keyOk ? 'keyed' : 'in the render'}</span>}
          {fx.appearance && <span className="vs-badge" title={skinLive ? 'The face softened under an oval, roughly where the render smooths skin; the render is exact' : 'Skin smoothing shows in the render (it needs a face found and a still frame)'}>Skin smoothing {skinLive ? '≈' : 'in the render'}</span>}
          {track && <span className="vs-badge" title="Ducking under speech and noise reduction are heard in the rendered file"><Music2 size={11} /> {track.title.slice(0, 26)}</span>}
        </div>
        {track && music.src && <audio ref={audioRef} src={music.src} preload="auto" muted={muted} loop={track.loop} onError={() => { music.fail(); void ctx.refresh(); }} />}
      </div>
      {below}
      {(() => {
        const hud = (
          <div className="vse-hud" data-testid="vs-hud">
            <div className="vse-scrub" role="slider" aria-label="Position in the edited video" aria-valuemin={0} aria-valuemax={Math.round(total)} aria-valuenow={Math.round(out ?? 0)} tabIndex={0}
              onPointerDown={e => { e.currentTarget.setPointerCapture(e.pointerId); scrubAt(e); }}
              onPointerMove={e => { if (e.buttons === 1) scrubAt(e); }}
              onKeyDown={e => { if (e.key === 'ArrowLeft') { e.preventDefault(); step(-5); } if (e.key === 'ArrowRight') { e.preventDefault(); step(5); } }}>
              <div className="rail" /><div className="fill" ref={fillRef} /><div className="knob" ref={knobRef} />
            </div>
            <div className="vse-hud-row">
              <button type="button" className="vs-btn ghost sm skip" onClick={() => step(-5)} aria-label="Back 5 seconds" title="Back 5 seconds (J)" disabled={!video.src}><SkipBack size={16} /></button>
              <button type="button" className="vs-btn ghost sm skip" onClick={() => step(5)} aria-label="Forward 5 seconds" title="On 5 seconds (L)" disabled={!video.src}><SkipForward size={16} /></button>
              <span className="vse-time-label" data-testid="vs-time" ref={clockRef}>{tc((out ?? 0) / speed)} / {tc(total / speed)}</span>
              <span className="vs-spacer vse-hide-sm" />
              <button type="button" className="vs-btn ghost sm vse-rec" disabled aria-label="Record" title="Recording in the browser is not available here yet — record with your camera or screen recorder and upload the file."><Circle size={14} fill="currentColor" /> <span className="vse-hide-sm">Record</span></button>
              <button type="button" className="vs-btn play" onClick={toggle} aria-label={playing ? 'Pause' : 'Play'} disabled={!video.src} data-testid="vs-play">{playing ? <Pause size={18} /> : <Play size={18} />}</button>
              <select className="vse-rate" value={rate} onChange={e => setRate(Number(e.target.value))} aria-label="Preview speed" title="How fast the preview plays (the video's own speed is under Properties → Animation)">
                {RATES.map(r => <option key={r} value={r}>{r}x</option>)}
              </select>
              <button type="button" className="vs-btn ghost sm" onClick={() => window.dispatchEvent(new Event('vs-split'))} data-act="split" title="Split the scene at the playhead"><Scissors size={14} /> <span className="vse-hide-sm">Split</span></button>
              <span className="vs-spacer vse-hide-sm" />
              <span className="vse-zoom" role="group" aria-label="Timeline zoom">
                <button type="button" className="vs-btn ghost sm" onClick={() => window.dispatchEvent(new CustomEvent('vs-tl-zoom', { detail: 'out' }))} aria-label="Zoom the timeline out"><Minus size={14} /></button>
                <button type="button" className="vse-zoom-pct" onClick={() => window.dispatchEvent(new CustomEvent('vs-tl-zoom', { detail: 'fit' }))} title="Fit the whole composition" data-testid="vs-zoom">{zoomPct}%</button>
                <button type="button" className="vs-btn ghost sm" onClick={() => window.dispatchEvent(new CustomEvent('vs-tl-zoom', { detail: 'in' }))} aria-label="Zoom the timeline in"><Plus size={14} /></button>
              </span>
              <button type="button" className="vs-btn ghost sm" aria-pressed={tool === 'select'} data-act="select-tool"
                title={tool === 'select' ? 'Selection tool: drag on the timeline to mark a stretch (press for the hand: drag to move the playhead)' : 'Hand: drag on the timeline to move the playhead (press for the selection tool)'}
                onClick={() => { const t = tool === 'select' ? 'scrub' : 'select'; setTool(t); window.dispatchEvent(new CustomEvent('vs-tool', { detail: t })); }}>
                {tool === 'select' ? <MousePointer2 size={14} /> : <Hand size={14} />}
              </button>
              <button type="button" className="vs-btn ghost sm" onClick={() => setMuted(m => !m)} aria-label={muted ? 'Sound on' : 'Mute'}>{muted ? <VolumeX size={15} /> : <Volume2 size={15} />}</button>
              {!full && <button type="button" className="vs-btn ghost sm vse-hide-sm" onClick={() => setBig(b => !b)} aria-pressed={big} aria-label={big ? 'Normal player size' : 'Big player'} title={big ? 'Normal size — the script beside the video' : 'Big player — the script moves under the video'} data-act="big-player">{big ? <Columns2 size={15} /> : <RectangleHorizontal size={15} />}</button>}
              <button type="button" className="vs-btn ghost sm" onClick={flipFull} aria-label={full ? 'Leave full screen' : 'Full screen'} title={full ? 'Leave full screen (Esc)' : 'Full screen'} data-act="full-screen">{full ? <Minimize2 size={15} /> : <Maximize2 size={15} />}</button>
            </div>
          </div>
        );
        return transport && !full ? createPortal(hud, transport) : hud;
      })()}
    </div>
  );
}
