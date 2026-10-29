/**
 * Screen Recorder — in the Media Library: record the screen, the screen with
 * a camera bubble, or just the camera, in the browser, then keep it.
 *
 *  - Capture is the browser's own (getDisplayMedia / getUserMedia) and only
 *    ever starts from a button the person pressed; the browser's sharing and
 *    camera indicators are on the whole time. Every track is stopped when the
 *    recording ends, on discard and when this closes.
 *  - "Screen + camera" is composited, not overlaid: the screen and the camera
 *    are drawn onto one canvas and that canvas is what is recorded, so the
 *    camera is in the file. The layout (a bubble over the screen, the speaker
 *    beside it, the camera large with the screen inset, half and half), the
 *    camera's shape and ring, and the bubble's corner and size change live;
 *    the bubble can be dragged on the preview. The frames are drawn on a
 *    worker's clock so they keep coming while this tab is in the background
 *    (recorder.ts).
 *  - Microphone and the tab's / computer's sound are mixed with WebAudio when
 *    both are there — always in the screen modes, so a screen switched
 *    mid-recording can bring its own sound into a recorder whose tracks are
 *    fixed once it starts.
 *  - Every screen recording goes through the canvas, even with no camera or
 *    background: that is what lets the background, frame and layout change
 *    while recording and another screen be shared without stopping.
 *  - Nothing follows the pointer live. While recording, where the pointer
 *    goes and clicks is read from the picture (`PointerLog`) and where the
 *    screen and camera were drawn is noted (`LayoutLog`); both are saved with
 *    the recording so the editor can propose moments to follow afterwards. The
 *    canvas is captured frame by frame (`captureStream(0)` + `requestFrame`)
 *    so each drawn frame is recorded exactly once — a timed capture doubled
 *    and dropped frames against the draw clock, which read as flicker.
 *  - The controls can float over other windows (Chrome / Edge's Document
 *    Picture-in-Picture), opened by the Start press itself because a browser
 *    opens such a window only from a click.
 *  - Saving is the same path as uploading a file (NewVideoProject):
 *    `createVideoProject` + `uploadVideo`, the bar is the bytes really sent,
 *    and "Saved" is said only after the server confirms the upload. On a
 *    failure the server's own words are shown and the recording stays here
 *    to retry or download.
 */
import { useCallback, useEffect, useRef, useState, type CSSProperties, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { Link } from 'react-router-dom';
import {
  MonitorPlay, Camera, Mic, MicOff, Pause, Play, Square, Circle, Download, RotateCcw, Trash2, UploadCloud, X, AlertCircle, Check, Loader, Volume2, Info,
  ImagePlus, RefreshCw, VideoOff, PictureInPicture2, MousePointer2,
} from 'lucide-react';
import { ProjectProgress } from './ProcessingProgress';
import { createVideoProject, uploadVideo, renameVideoProject, deleteVideoProject, editVideo, saveScreenMeta, bytesLabel, type VideoRequest, type ScreenMeta } from '../../services/videoStudio';
import {
  support, mediaError, fileSlug, bubbleAt, frameSize, bitrateFor, finishFile, startClock, stopStreams, msClock, CORNERS,
  Compositor, PointerLog, LayoutLog, screenMeta, layoutRects, loadBackdrop, readPrefs, defaultPrefs, slowComputer, gradientCss,
  FPS, RES, RES_LABEL, CAM_RES, COLORS, GRADIENTS, LAYOUTS, SHAPES, RINGS, RING_COLORS,
  type RecMode, type Bubble, type Corner, type BubbleSize, type Prefs, type Look, type Res, type Quality, type CamRes, type CursorMode, type GradientId, type Brand,
  type Layout, type CamShape, type Ring, type CamFrame,
} from './recorder';
import { canGrade, NO_FX, type CamFx, type CamBg } from './cameraFx';

type Phase = 'setup' | 'starting' | 'countdown' | 'recording' | 'paused' | 'finishing' | 'review';
type SaveState = { state: 'idle' } | { state: 'saving'; sent: number; total: number } | { state: 'saved'; projectId: string } | { state: 'failed'; error: string };
interface Device { id: string; label: string }

/*
 * A plain recording is kept as it is: no long video rendered and no Shorts
 * picked (no AI analysis call, no render minutes). It is still prepared like
 * any upload — picture, sound, transcript — so it opens in the editor, where
 * Shorts can be asked for later. "fit" keeps a screen whole if it ever is cut.
 */
const RECORDING_SETTINGS: Partial<VideoRequest> = { long: false, shorts: 0, cleanup: 'conservative', layout: 'fit' };
/* Browsers hold the recording in memory until it stops; two hours is well past any normal walkthrough. */
const MAX_MS = 2 * 3600 * 1000;

const MODES: { key: RecMode; label: string; help: string; icon: typeof MonitorPlay }[] = [
  { key: 'screen', label: 'Screen', help: 'A screen, window or tab', icon: MonitorPlay },
  { key: 'screen-cam', label: 'Screen + camera', help: 'You beside or over the screen', icon: MonitorPlay },
  { key: 'cam', label: 'Camera only', help: 'Just you, no screen', icon: Camera },
];
const CORNER_LABEL: Record<Corner, string> = { tl: 'Top left', tr: 'Top right', bl: 'Bottom left', br: 'Bottom right' };
const QUALITY_LABEL: Record<Quality, string> = { light: 'Light', standard: 'Standard', high: 'High' };
const CURSOR_LABEL: Record<CursorMode, string> = { always: 'Always shown', motion: 'Only while moving', never: 'Hidden' };
const CAM_LABEL: Record<CamRes, string> = { '480': '480p', '720': '720p', '1080': '1080p' };
const gradientLabel = (id: GradientId) => id[0].toUpperCase() + id.slice(1);
const LAYOUT_LABEL: Record<Layout, string> = { bubble: 'Bubble', 'speaker-left': 'Speaker left', 'speaker-right': 'Speaker right', presenter: 'Presenter', split: 'Side by side' };
const LAYOUT_HELP: Record<Layout, string> = {
  bubble: 'Your screen, with you in a bubble on top — drag it anywhere.',
  'speaker-left': 'You on the left in a tall panel, your screen on the right.',
  'speaker-right': 'Your screen on the left, you on the right in a tall panel.',
  presenter: 'You fill the video, with your screen in a corner — for talking-head videos.',
  split: 'You and your screen side by side, the same size.',
};
const SHAPE_LABEL: Record<CamShape, string> = { circle: 'Circle', square: 'Square', rounded: 'Rounded square' };
const RING_LABEL: Record<Ring, string> = { none: 'No ring', white: 'White', neon: 'Neon', gradient: 'Turning gradient', pulse: 'Pulsing neon' };

/* A per-browser convenience: the frame rate, quality and look somebody chose last time. Never the picture. */
const PREFS_KEY = 'crm_rec_prefs';
const savedPrefs = (): Prefs => { try { return readPrefs(JSON.parse(localStorage.getItem(PREFS_KEY) || 'null')); } catch { return defaultPrefs(); } };
const SLOW = slowComputer();

const live = (s: MediaStream | null) => !!s && s.getTracks().some(t => t.readyState === 'live');
const attach = (v: HTMLVideoElement | null, s: MediaStream | null) => {
  if (!v) return;
  if (v.srcObject !== s) v.srcObject = s;
  if (s) void v.play().catch(() => { /* muted, so this only fails if the element is gone */ });
};
const metadata = (v: HTMLVideoElement) => v.videoWidth ? Promise.resolve() : new Promise<void>(res => {
  const done = () => { v.removeEventListener('loadedmetadata', done); res(); };
  v.addEventListener('loadedmetadata', done);
  setTimeout(done, 4000);
});
const defaultName = (mode: RecMode) => `${mode === 'cam' ? 'Camera recording' : 'Screen recording'} ${new Date().toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' })}`;

export default function ScreenRecorder({ onClose, onSaved }: { onClose: () => void; onSaved: () => void }) {
  const [sup] = useState(support);
  const [mode, setMode] = useState<RecMode>(() => support().display ? 'screen-cam' : 'cam');
  const [mic, setMic] = useState(true);
  const [sysAudio, setSysAudio] = useState(false);
  const [bubble, setBubble] = useState<Bubble>({ ...CORNERS.br, size: 'M', mirror: false });
  const [cams, setCams] = useState<Device[]>([]);
  const [mics, setMics] = useState<Device[]>([]);
  const [camId, setCamId] = useState('');
  const [micId, setMicId] = useState('');
  const [camOn, setCamOn] = useState(false);
  const [micOn, setMicOn] = useState(false);
  const [phase, setPhase] = useState<Phase>('setup');
  const [count, setCount] = useState(3);
  const [elapsed, setElapsed] = useState(0);
  const [error, setError] = useState('');
  const [note, setNote] = useState('');
  const [result, setResult] = useState<{ url: string; blob: Blob; ms: number } | null>(null);
  const [name, setName] = useState('');
  const [save, setSave] = useState<SaveState>({ state: 'idle' });
  const [busy, setBusy] = useState(false);
  const [prefs, setPrefs] = useState<Prefs>(savedPrefs);
  const [image, setImage] = useState<{ url: string; name: string } | null>(null);
  const [micMuted, setMicMuted] = useState(false);
  const [camHidden, setCamHidden] = useState(false);
  const [switching, setSwitching] = useState(false);
  const [pip, setPip] = useState<Window | null>(null);
  const [camBg, setCamBg] = useState<{ url: string; name: string } | null>(null);
  const [logo, setLogo] = useState<{ url: string; name: string } | null>(null);
  const [fxState, setFxState] = useState<{ state: string; error: string }>({ state: 'off', error: '' });

  const canvasRef = useRef<HTMLCanvasElement>(null);
  const screenVid = useRef<HTMLVideoElement>(null);
  const camVid = useRef<HTMLVideoElement>(null);
  const meterEl = useRef<HTMLSpanElement>(null);
  const display = useRef<MediaStream | null>(null);
  const cam = useRef<MediaStream | null>(null);
  const micS = useRef<MediaStream | null>(null);
  const canvasStream = useRef<MediaStream | null>(null);
  const audio = useRef<AudioContext | null>(null);
  const mixOut = useRef<MediaStreamAudioDestinationNode | null>(null);
  const meter = useRef<{ an: AnalyserNode; buf: Uint8Array<ArrayBuffer> } | null>(null);
  const rec = useRef<MediaRecorder | null>(null);
  const chunks = useRef<Blob[]>([]);
  const t0 = useRef(0);
  const pausedAt = useRef<number | null>(null);
  const pausedFor = useRef(0);
  const run = useRef(0);
  const phaseRef = useRef<Phase>('setup');
  const bubbleRef = useRef(bubble);
  const modeRef = useRef(mode);
  const drag = useRef(false);
  const project = useRef<{ id: string; name: string } | null>(null);
  const file = useRef<File | null>(null);
  const upload = useRef<AbortController | null>(null);
  const urlRef = useRef('');
  const prefsRef = useRef(prefs);
  const imageRef = useRef<ImageBitmap | null>(null);
  const camHiddenRef = useRef(false);
  const comp = useRef(new Compositor());
  const plog = useRef(new PointerLog());
  const layLog = useRef(new LayoutLog());
  /** What the recorder saw for the finished recording, and the project it was already sent to (sent once). */
  const meta = useRef<ScreenMeta | null>(null);
  const metaSent = useRef('');
  const recSize = useRef({ w: 0, h: 0 });
  /* Whether the last background chosen was the picture, so switching the background back on can bring it back this session. */
  const lastImage = useRef(false);
  const ctx2d = useRef<CanvasRenderingContext2D | null>(null);
  const canvasTrack = useRef<CanvasCaptureMediaStreamTrack | null>(null);
  const dispSrc = useRef<MediaStreamAudioSourceNode | null>(null);
  const pipRef = useRef<Window | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const camBgRef = useRef<ImageBitmap | null>(null);
  const logoRef = useRef<ImageBitmap | null>(null);
  const camBgFile = useRef<HTMLInputElement>(null);
  const logoFile = useRef<HTMLInputElement>(null);
  const stats = useRef({ last: 0, late: 0, ticks: 0, warned: false, n: 0 });
  const fitKey = useRef('');
  phaseRef.current = phase;
  bubbleRef.current = bubble;
  modeRef.current = mode;
  prefsRef.current = prefs;
  camHiddenRef.current = camHidden;

  const setPref = <K extends keyof Prefs>(k: K, v: Prefs[K]) => setPrefs(p => ({ ...p, [k]: v }));
  const setLook = (l: Partial<Look>) => {
    if (l.bg && l.bg.kind !== 'none') lastImage.current = l.bg.kind === 'image';
    /* A colour or gradient is remembered as the one to bring back; a picture never is (it is not kept). */
    const keep = l.bg && (l.bg.kind === 'color' || l.bg.kind === 'gradient') ? { lastBg: l.bg } : {};
    setPrefs(p => ({ ...p, ...keep, look: { ...p.look, ...l } }));
  };
  const setFrame = (f: Partial<CamFrame>) => setPrefs(p => ({ ...p, frame: { ...p.frame, ...f } }));
  /** Background off: the screen fills the video. On again: the last background chosen. */
  const toggleBg = () => {
    if (prefs.look.bg.kind !== 'none') setLook({ bg: { kind: 'none' } });
    else setLook({ bg: lastImage.current && imageRef.current ? { kind: 'image' } : prefs.lastBg });
  };
  const setFx = (f: Partial<CamFx>) => setPrefs(p => ({ ...p, fx: { ...p.fx, ...f } }));
  const setBrand = (b: Partial<Brand>) => setPrefs(p => ({ ...p, brand: { ...p.brand, ...b } }));
  useEffect(() => {
    const fx = comp.current.fx;
    fx.onState = () => setFxState({ state: fx.state, error: fx.error });
    return () => { fx.onState = null; };
  }, []);
  useEffect(() => {
    try { localStorage.setItem(PREFS_KEY, JSON.stringify({ ...prefs, look: prefs.look.bg.kind === 'image' ? { ...prefs.look, bg: { kind: 'none' } } : prefs.look })); } catch { /* private window */ }
  }, [prefs]);

  const needsCam = mode !== 'screen';
  const capturing = phase === 'starting' || phase === 'countdown' || phase === 'recording' || phase === 'paused' || phase === 'finishing';
  const unsaved = !!result && save.state !== 'saved';
  const dirty = capturing || save.state === 'saving' || unsaved;

  const msNow = () => (pausedAt.current ?? performance.now()) - t0.current - pausedFor.current;

  /* ── Devices ── */
  const applyDevices = useCallback((all: MediaDeviceInfo[]) => {
    /* Labels are blank until the person has allowed a camera or microphone once — numbered until then. */
    const list = (kind: MediaDeviceKind, word: string) => all.filter(d => d.kind === kind && d.deviceId !== 'communications')
      .map((d, i) => ({ id: d.deviceId === 'default' ? '' : d.deviceId, label: d.label || `${word} ${i + 1}` }))
      .filter((d, i, a) => a.findIndex(x => x.id === d.id) === i);
    setCams(list('videoinput', 'Camera'));
    setMics(list('audioinput', 'Microphone'));
  }, []);
  const refreshDevices = useCallback(() => {
    void navigator.mediaDevices?.enumerateDevices?.().then(applyDevices, () => {});
  }, [applyDevices]);
  useEffect(() => {
    const md = navigator.mediaDevices;
    void md?.enumerateDevices?.().then(applyDevices, () => {});
    md?.addEventListener?.('devicechange', refreshDevices);
    return () => md?.removeEventListener?.('devicechange', refreshDevices);
  }, [applyDevices, refreshDevices]);

  const audioCtx = () => {
    if (!audio.current || audio.current.state === 'closed') audio.current = new AudioContext();
    if (audio.current.state === 'suspended') void audio.current.resume();
    return audio.current;
  };

  const stopCam = () => { stopStreams(cam.current); cam.current = null; attach(camVid.current, null); setCamOn(false); };
  const stopMic = () => { stopStreams(micS.current); micS.current = null; meter.current = null; setMicOn(false); };

  /** The camera and/or microphone, asked for together (one browser prompt) when both are needed. */
  const ensureDevices = async (wantCam: boolean, wantMic: boolean): Promise<boolean> => {
    const c = wantCam && !live(cam.current), m = wantMic && !live(micS.current);
    if (!c && !m) return true;
    if (!sup.devices) { setError('This browser cannot use a camera or microphone.'); return false; }
    try {
      const s = await navigator.mediaDevices.getUserMedia({
        /* In a bubble the camera never needs more than 30 frames a second; asking for 60 only costs the computer. */
        video: c ? {
          ...(camId ? { deviceId: { exact: camId } } : {}),
          width: { ideal: CAM_RES[prefs.camRes].width }, height: { ideal: CAM_RES[prefs.camRes].height },
          frameRate: { ideal: mode === 'cam' ? prefs.fps : Math.min(30, prefs.fps) },
        } : false,
        /* voiceIsolation is Chrome's stronger cleaner where the computer offers it (ignored elsewhere). */
        audio: m ? { ...(micId ? { deviceId: { exact: micId } } : {}), echoCancellation: true, noiseSuppression: true, ...(sup.isolate && prefs.isolate ? { voiceIsolation: true } : {}) } as MediaTrackConstraints : false,
      });
      if (c) {
        cam.current = new MediaStream(s.getVideoTracks());
        attach(camVid.current, cam.current);
        cam.current.getVideoTracks()[0]?.addEventListener('ended', () => {
          setCamOn(false);
          if (modeRef.current === 'cam' && (phaseRef.current === 'recording' || phaseRef.current === 'paused')) stop('The camera stopped (unplugged or taken by another app), so the recording stopped.');
          else setNote('The camera stopped (unplugged or taken by another app).');
        });
        setCamOn(true);
      }
      if (m) {
        micS.current = new MediaStream(s.getAudioTracks());
        micS.current.getAudioTracks().forEach(t => { t.enabled = !micMuted; });
        const ctx = audioCtx();
        const an = ctx.createAnalyser();
        an.fftSize = 512;
        ctx.createMediaStreamSource(micS.current).connect(an);
        meter.current = { an, buf: new Uint8Array(new ArrayBuffer(an.fftSize)) };
        micS.current.getAudioTracks()[0]?.addEventListener('ended', () => { setMicOn(false); setNote('The microphone stopped (unplugged or taken by another app).'); });
        setMicOn(true);
      }
      refreshDevices();
      return true;
    } catch (e) {
      setError(mediaError(e, c && m ? 'camera and microphone' : c ? 'camera' : 'microphone'));
      return false;
    }
  };

  /* A device chosen while its preview is on: swap to it. */
  useEffect(() => { if (cam.current && phaseRef.current === 'setup') { stopCam(); void ensureDevices(true, false); } }, [camId, prefs.camRes]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { if (micS.current && phaseRef.current === 'setup') { stopMic(); void ensureDevices(false, true); } }, [micId]); // eslint-disable-line react-hooks/exhaustive-deps
  /* What the chosen mode no longer needs is switched off, light and all. */
  useEffect(() => { if (phaseRef.current === 'setup' && mode === 'screen' && cam.current) stopCam(); }, [mode]);
  useEffect(() => { if (phaseRef.current === 'setup' && !mic && micS.current) stopMic(); }, [mic]);

  /* ── The frame clock: the composite, the pointer log and the microphone meter ── */
  /* An opaque canvas: the browser skips blending it with the page, a measurable saving per frame on a small graphics chip. */
  const getCtx = () => {
    const cv = canvasRef.current;
    if (!cv) return null;
    if (ctx2d.current?.canvas !== cv) ctx2d.current = cv.getContext('2d', { alpha: false });
    return ctx2d.current;
  };
  const tick = useRef(() => {});
  tick.current = () => {
    const now = performance.now();
    const ph = phaseRef.current, p = prefsRef.current, st = stats.current;
    if (ph === 'recording') { if (st.last && now - st.last > 2.5 * 1000 / p.fps) st.late++; st.ticks++; }
    st.last = now;
    st.n++;
    const cv = canvasRef.current;
    const capturingNow = ph === 'countdown' || ph === 'recording' || ph === 'paused';
    if (cv && ph !== 'review' && ph !== 'finishing') {
      const camOnly = modeRef.current === 'cam';
      const scr = !camOnly && display.current ? screenVid.current : null;
      const face = modeRef.current !== 'screen' && live(cam.current) && !camHiddenRef.current ? camVid.current : null;
      /* Camera only: the frame takes the camera's own shape while choosing, so what is seen is what is recorded. */
      if (camOnly && face?.videoWidth && !capturingNow) {
        const fs = frameSize(face.videoWidth, face.videoHeight);
        if (cv.width !== fs.w || cv.height !== fs.h) { cv.width = fs.w; cv.height = fs.h; comp.current.invalidate(); }
      }
      /* Back to a screen mode while choosing: the 16:9 placeholder again, not the camera's shape. */
      if (!camOnly && !display.current && !capturingNow && (cv.width !== 1280 || cv.height !== 720)) { cv.width = 1280; cv.height = 720; comp.current.invalidate(); }
      /* Nothing moving and nothing recording: a few frames a second keep the preview current for a sixth of the work. */
      const idle = !scr && !face && !capturingNow;
      if (!(idle && st.n % 6) && !(document.hidden && !capturingNow)) {
        const ctx = getCtx();
        const c = comp.current;
        if (ctx) {
          c.draw(ctx, {
            screen: scr, cam: face, camOnly, look: p.look, image: p.look.bg.kind === 'image' ? imageRef.current : null,
            layout: modeRef.current === 'screen-cam' ? p.layout : 'bubble',
            bubble: bubbleRef.current, frame: p.frame, fx: p.fx, camBg: p.fx.bg === 'image' ? camBgRef.current : null,
            brand: p.brand, logo: logoRef.current, now,
          });
          canvasTrack.current?.requestFrame();
        }
        /* Noted after the frame is out, so the looks never delay it; only while recording, never paused. */
        if (!camOnly && (ph === 'recording' || ph === 'paused')) {
          const t = msNow() / 1000;
          if (scr && ph === 'recording') plog.current.look(scr, now, t);
          layLog.current.note(t, modeRef.current === 'screen' ? 'screen' : p.layout, c.box, c.camBox, p.frame.shape, cv.width, cv.height);
        }
        /*
         * Copying a video into a canvas at its own size is a plain copy; at another size it is a resample,
         * which cost a software-drawn canvas eight times as much. So the capture is asked to deliver the
         * screen at the size of its box — the browser scales it on the way in, cheaply — in every layout
         * (beside a panel or as the presenter's inset the box is smaller, and so is the capture).
         */
        const track = display.current?.getVideoTracks()[0], box = c.box;
        if (track && capturingNow && box.w > 1) {
          const fk = `${track.id}|${box.w}x${box.h}`;
          if (fk !== fitKey.current) {
            fitKey.current = fk;
            void track.applyConstraints({
              frameRate: { ideal: p.fps, max: p.fps }, width: { max: box.w }, height: { max: box.h },
              ...(sup.cursor ? { cursor: p.cursor } : {}),
            } as MediaTrackConstraints).catch(() => { /* kept as it was: drawing still scales it */ });
          }
        }
      }
    }
    const mt = meter.current, el = meterEl.current;
    if (mt && el && st.n % 3 === 0) {
      mt.an.getByteTimeDomainData(mt.buf);
      let peak = 0;
      for (const v of mt.buf) peak = Math.max(peak, Math.abs(v - 128));
      el.style.width = `${Math.min(100, Math.round(peak / 128 * 160))}%`;
    }
  };
  useEffect(() => startClock(prefs.fps, () => tick.current()), [prefs.fps]);

  /* ── Releasing everything ── */
  const closePip = () => {
    const w = pipRef.current;
    pipRef.current = null; setPip(null);
    try { w?.close(); } catch { /* already closed */ }
  };
  const releaseCapture = () => {
    stopStreams(display.current, cam.current, micS.current, canvasStream.current, mixOut.current?.stream);
    display.current = cam.current = micS.current = canvasStream.current = null;
    mixOut.current = null; meter.current = null; canvasTrack.current = null; dispSrc.current = null;
    attach(screenVid.current, null); attach(camVid.current, null);
    setCamOn(false); setMicOn(false); setMicMuted(false); setCamHidden(false);
    closePip();
    if (audio.current && audio.current.state !== 'closed') void audio.current.close().catch(() => {});
    audio.current = null;
  };
  useEffect(() => () => {
    run.current++;
    const r = rec.current;
    if (r && r.state !== 'inactive') { r.onstop = null; try { r.stop(); } catch { /* gone */ } }
    upload.current?.abort();
    stopStreams(display.current, cam.current, micS.current, canvasStream.current, mixOut.current?.stream);
    if (audio.current && audio.current.state !== 'closed') void audio.current.close().catch(() => {});
    if (urlRef.current) URL.revokeObjectURL(urlRef.current);
    try { pipRef.current?.close(); } catch { /* gone */ }
  }, []);
  useEffect(() => () => { if (image) URL.revokeObjectURL(image.url); }, [image]);
  useEffect(() => () => { if (camBg) URL.revokeObjectURL(camBg.url); }, [camBg]);
  useEffect(() => () => { if (logo) URL.revokeObjectURL(logo.url); }, [logo]);

  /* Leaving the page with a recording going, uploading or unsaved. */
  useEffect(() => {
    if (!dirty) return;
    const warn = (e: BeforeUnloadEvent) => { e.preventDefault(); e.returnValue = ''; };
    window.addEventListener('beforeunload', warn);
    return () => window.removeEventListener('beforeunload', warn);
  }, [dirty]);

  /*
   * The timer (paused time left out), the two-hour stop, and a computer that
   * cannot keep up said out loud: when more than one frame in seven comes
   * late the recording will look jerky, and the cure is a lower setting.
   */
  useEffect(() => {
    if (phase !== 'recording' && phase !== 'paused') return;
    const t = setInterval(() => {
      const ms = msNow();
      setElapsed(ms);
      if (ms >= MAX_MS && phaseRef.current === 'recording') stop('Recordings stop at two hours. This one is kept below.');
      const st = stats.current, p = prefsRef.current;
      if (!st.warned && st.ticks > p.fps * 5 && st.late / st.ticks > 0.15) {
        st.warned = true;
        setNote(`This computer is falling behind at ${p.fps} fps, so parts of the recording may look jerky. It is still recording; next time choose 30 fps, ${RES_LABEL['720']} and Light.`);
      }
    }, 500);
    return () => clearInterval(t);
  }, [phase]); // eslint-disable-line react-hooks/exhaustive-deps

  /* ── Recording ── */
  const displayOptions = (): DisplayMediaStreamOptions => {
    const cap = RES[prefs.res];
    /* systemAudio / surfaceSwitching are Chrome's hints (ignored elsewhere): offer the computer's
       sound in the picker when asked for, and let somebody switch what they share without stopping.
       The size cap is asked of the capture itself, so a 5K screen is not copied at 5K only to be shrunk. */
    return {
      video: { frameRate: { ideal: prefs.fps, max: prefs.fps }, width: { max: cap }, height: { max: cap }, ...(sup.cursor ? { cursor: prefs.cursor } : {}) },
      audio: sysAudio,
      ...(sysAudio ? { systemAudio: 'include' } : {}),
      surfaceSwitching: 'include', selfBrowserSurface: 'include',
    } as DisplayMediaStreamOptions;
  };

  const openPip = async () => {
    const dp = (window as unknown as { documentPictureInPicture?: { requestWindow(o: { width: number; height: number }): Promise<Window> } }).documentPictureInPicture;
    if (!dp || pipRef.current) return;
    try {
      const w = await dp.requestWindow({ width: 440, height: 76 });
      w.document.title = 'Recording controls';
      Object.assign(w.document.body.style, { margin: '0', background: '#14151c', color: '#fff', font: '600 13px system-ui, -apple-system, "Segoe UI", sans-serif', overflow: 'hidden' });
      w.addEventListener('pagehide', () => { if (pipRef.current === w) { pipRef.current = null; setPip(null); } });
      pipRef.current = w; setPip(w);
    } catch (e) {
      setNote(`The floating controls could not open${(e as Error)?.message ? ` (${(e as Error).message})` : ''}. The controls on this page still work.`);
    }
  };

  /** The shared screen's sound into the mix — again after a switch, the old one let go. */
  const connectScreenSound = (s: MediaStream | null) => {
    try { dispSrc.current?.disconnect(); } catch { /* gone */ }
    dispSrc.current = null;
    const t = s?.getAudioTracks()[0];
    if (t && t.readyState === 'live' && mixOut.current && audio.current) {
      dispSrc.current = audio.current.createMediaStreamSource(new MediaStream([t]));
      dispSrc.current.connect(mixOut.current);
    }
  };

  const shareEnded = (e?: Event) => {
    /* A track from a screen already switched away from is not the one being recorded. */
    if (e && e.target !== display.current?.getVideoTracks()[0]) return;
    const ph = phaseRef.current;
    if (ph === 'recording' || ph === 'paused') stop('You pressed “Stop sharing”, so the recording stopped. It is kept below.');
    else if (ph === 'starting' || ph === 'countdown') { run.current++; releaseCapture(); setPhase('setup'); setNote('Sharing stopped before the recording began.'); }
  };

  const start = async () => {
    if (!sup.mime || phaseRef.current !== 'setup') return;
    setError(''); setNote('');
    const me = ++run.current;
    setPhase('starting');
    const back = (msg: string) => { if (msg) setError(msg); stopStreams(display.current); display.current = null; attach(screenVid.current, null); setPhase('setup'); };
    /* Opened first, while this press still counts as one: the share picker uses it up. If the picker then
       refuses for want of a press, the message asks for Start again — and the window is already open. */
    if (prefs.float && sup.pip) await openPip();
    if (run.current !== me) return;
    let shared: MediaStream | null = null;
    if (mode !== 'cam') {
      try {
        shared = await navigator.mediaDevices.getDisplayMedia(displayOptions());
      } catch (e) { if (run.current === me) { closePip(); back(mediaError(e, 'screen')); } return; }
      if (run.current !== me) { stopStreams(shared); return; }
      display.current = shared;
      shared.getVideoTracks()[0]?.addEventListener('ended', shareEnded);
      if (sysAudio && !shared.getAudioTracks().length) setNote('No computer sound was shared. Sound can be shared from a browser tab (tick “Share tab audio”), and on Windows or ChromeOS from the whole screen; windows and Mac screens share none.');
    }
    if (!await ensureDevices(mode !== 'screen', mic)) { if (run.current === me) { closePip(); back(''); } return; }
    if (run.current !== me) return;
    if (shared && screenVid.current) {
      attach(screenVid.current, shared);
      await metadata(screenVid.current);
      if (canvasRef.current) {
        const s = frameSize(screenVid.current.videoWidth, screenVid.current.videoHeight, RES[prefs.res]);
        canvasRef.current.width = s.w; canvasRef.current.height = s.h;
        comp.current.invalidate();
      }
    }
    if (mode === 'cam' && camVid.current) {
      await metadata(camVid.current);
      if (canvasRef.current && camVid.current.videoWidth) {
        const s = frameSize(camVid.current.videoWidth, camVid.current.videoHeight);
        canvasRef.current.width = s.w; canvasRef.current.height = s.h;
        comp.current.invalidate();
      }
    }
    setPhase('countdown');
    for (let n = 3; n > 0; n--) {
      setCount(n);
      await new Promise(r => setTimeout(r, 1000));
      if (run.current !== me) return;
    }
    begin();
  };

  const begin = () => {
    const m = sup.mime!;
    let video: MediaStreamTrack | undefined;
    {
      const cv = canvasRef.current!;
      let s = cv.captureStream(0);
      const t = s.getVideoTracks()[0] as CanvasCaptureMediaStreamTrack | undefined;
      if (t && typeof t.requestFrame === 'function') canvasTrack.current = t;
      else { stopStreams(s); s = cv.captureStream(prefs.fps); canvasTrack.current = null; }
      canvasStream.current = s;
      video = s.getVideoTracks()[0];
    }
    if (!video || video.readyState !== 'live' || (mode === 'cam' && !live(cam.current))) { releaseCapture(); setPhase('setup'); setError('There was no picture to record — try again.'); return; }
    const micT = mic ? micS.current?.getAudioTracks()[0] : undefined;
    let sound: MediaStreamTrack | undefined;
    if (mode !== 'cam' && (micT || sysAudio)) {
      const ctx = audioCtx();
      mixOut.current = ctx.createMediaStreamDestination();
      if (micT?.readyState === 'live') ctx.createMediaStreamSource(new MediaStream([micT])).connect(mixOut.current);
      connectScreenSound(display.current);
      sound = mixOut.current.stream.getAudioTracks()[0];
    } else sound = [micT, display.current?.getAudioTracks()[0]].find(t => t?.readyState === 'live');
    const out = new MediaStream([video, ...(sound ? [sound] : [])]);
    const st = video.getSettings();
    const w = canvasRef.current?.width ?? st.width ?? 1280;
    const h = canvasRef.current?.height ?? st.height ?? 720;
    recSize.current = { w, h };
    let r: MediaRecorder;
    try { r = new MediaRecorder(out, { mimeType: m.mime, videoBitsPerSecond: bitrateFor(w, h, prefs.fps, prefs.quality), audioBitsPerSecond: 128_000 }); }
    catch (e) { releaseCapture(); setPhase('setup'); setError(`This browser could not start recording (${(e as Error).message || 'MediaRecorder refused'}).`); return; }
    chunks.current = [];
    r.ondataavailable = e => { if (e.data.size) chunks.current.push(e.data); };
    r.onerror = () => { setNote('The browser reported a recording error; what was recorded so far is kept.'); if (r.state !== 'inactive') r.stop(); };
    r.onstop = () => void finish();
    rec.current = r;
    t0.current = performance.now(); pausedAt.current = null; pausedFor.current = 0;
    stats.current = { last: 0, late: 0, ticks: 0, warned: false, n: 0 };
    plog.current.clear(); layLog.current.clear();
    meta.current = null; metaSent.current = '';
    setElapsed(0);
    r.start(1000);
    setPhase('recording');
  };

  function stop(why = '') {
    const r = rec.current;
    if (!r || r.state === 'inactive') return;
    if (pausedAt.current !== null) { pausedFor.current += performance.now() - pausedAt.current; pausedAt.current = null; }
    setElapsed(msNow());
    if (why) setNote(why);
    setPhase('finishing');
    r.stop();
  }

  const finish = async () => {
    const ms = msNow();
    const m = sup.mime!;
    /* What the recorder saw (screen modes only), read before the capture is let go. */
    meta.current = modeRef.current !== 'cam' ? screenMeta(recSize.current.w, recSize.current.h, ms, plog.current, layLog.current) : null;
    metaSent.current = '';
    releaseCapture();
    rec.current = null;
    if (!chunks.current.length) { setPhase('setup'); setError('Nothing was recorded. Try again, and keep sharing until you press Stop.'); return; }
    const blob = await finishFile(chunks.current, m, ms);
    chunks.current = [];
    if (urlRef.current) URL.revokeObjectURL(urlRef.current);
    urlRef.current = URL.createObjectURL(blob);
    setResult({ url: urlRef.current, blob, ms });
    setName(n => n || defaultName(modeRef.current));
    setSave({ state: 'idle' });
    project.current = null; file.current = null;
    setPhase('review');
  };

  const pause = () => { const r = rec.current; if (r?.state === 'recording') { r.pause(); pausedAt.current = performance.now(); setPhase('paused'); } };
  const resume = () => {
    const r = rec.current;
    /* The screen may have changed while paused: the pointer log starts afresh rather than reading the difference as a click. */
    if (r?.state === 'paused') { r.resume(); if (pausedAt.current !== null) pausedFor.current += performance.now() - pausedAt.current; pausedAt.current = null; plog.current.reset(); setPhase('recording'); }
  };
  const cancelStart = () => { run.current++; releaseCapture(); setPhase('setup'); };

  /* ── While recording ── */
  /** Another screen, window or tab, without stopping: the canvas keeps recording and draws whatever is shared now. */
  const switchScreen = async () => {
    if (switching || !display.current) return;
    setSwitching(true);
    try {
      const s = await navigator.mediaDevices.getDisplayMedia(displayOptions());
      if (!display.current || !(phaseRef.current === 'recording' || phaseRef.current === 'paused')) { stopStreams(s); return; }
      const old = display.current;
      display.current = s;
      s.getVideoTracks()[0]?.addEventListener('ended', shareEnded);
      attach(screenVid.current, s);
      connectScreenSound(s);
      /* A different picture: no comparing across the switch. */
      plog.current.reset();
      stopStreams(old);
      setNote('');
    } catch (e) {
      const n = (e as { name?: string } | null)?.name;
      setNote(n === 'NotAllowedError' || n === 'AbortError' ? 'Still sharing the same screen.' : mediaError(e, 'screen'));
    } finally { setSwitching(false); }
  };
  const toggleMic = () => {
    const muted = !micMuted;
    micS.current?.getAudioTracks().forEach(t => { t.enabled = !muted; });
    setMicMuted(muted);
  };
  const toggleCam = () => setCamHidden(h => !h);

  /* ── The background picture ── */
  const pickImage = async (f: File | undefined) => {
    if (!f) return;
    if (!f.type.startsWith('image/')) { setError('That file is not a picture. Choose a JPG, PNG or WebP.'); return; }
    try {
      imageRef.current = await loadBackdrop(f);
      setImage({ url: URL.createObjectURL(f), name: f.name });
      setLook({ bg: { kind: 'image' } });
      setError('');
    } catch { setError('That picture could not be read. Try a JPG, PNG or WebP.'); }
  };
  /** A picture for behind the camera, or the logo: read here, kept in this browser, never uploaded. */
  const pickPicture = async (f: File | undefined, which: 'camBg' | 'logo') => {
    if (!f) return;
    if (!f.type.startsWith('image/')) { setError('That file is not a picture. Choose a PNG, JPG or WebP.'); return; }
    try {
      const bmp = await loadBackdrop(f);
      const shown = { url: URL.createObjectURL(f), name: f.name };
      if (which === 'camBg') { camBgRef.current = bmp; setCamBg(shown); setFx({ bg: 'image' }); }
      else { logoRef.current = bmp; setLogo(shown); }
      setError('');
    } catch { setError('That picture could not be read. Try a PNG, JPG or WebP.'); }
  };
  const removeImage = () => {
    /* The background stays on, as the switch says: the last colour or gradient comes back. */
    if (prefs.look.bg.kind === 'image') setLook({ bg: prefs.lastBg });
    lastImage.current = false;
    imageRef.current = null;
    setImage(null);
  };

  /* ── After ── */
  const dropResult = () => {
    upload.current?.abort();
    if (urlRef.current) URL.revokeObjectURL(urlRef.current);
    urlRef.current = '';
    setResult(null); setSave({ state: 'idle' }); setName(''); setNote(''); setError('');
    project.current = null; file.current = null; meta.current = null; metaSent.current = '';
    setPhase('setup');
  };
  const retake = () => {
    if (unsaved && !window.confirm('Record again? This recording is thrown away unless you download or save it first.')) return;
    dropResult();
  };
  const discard = () => {
    if (!window.confirm(save.state === 'saved' ? 'Clear it from this screen? The saved copy stays in your Media Library.' : 'Throw this recording away? It has not been saved or downloaded.')) return;
    dropResult();
  };
  const close = () => {
    if (dirty && !window.confirm(capturing ? 'Stop and throw away this recording?' : save.state === 'saving' ? 'Stop saving and close? The recording has not been saved.' : 'Close without saving? This recording has not been saved.')) return;
    run.current++;
    const r = rec.current;
    if (r && r.state !== 'inactive') { r.onstop = null; r.stop(); }
    releaseCapture();
    onClose();
  };

  const saveIt = async () => {
    if (!result || busy) return;
    const nm = (name.trim() || defaultName(mode)).slice(0, 120);
    setName(nm); setError(''); setBusy(true);
    setSave({ state: 'saving', sent: 0, total: result.blob.size });
    try {
      if (!project.current) {
        const c = await createVideoProject({ name: nm, prompt: '', settings: RECORDING_SETTINGS });
        if (!c.success) { setSave({ state: 'failed', error: c.error ?? 'The recording could not be saved.' }); return; }
        project.current = { id: c.id, name: nm };
        /* Studio Sound is the engine's (RNNoise, de-esser, EQ, −16 LUFS), far beyond what a browser can do live
           without taxing a small computer. A new project's edit is version 1; switched on there, every export
           from the editor has it. A refusal only loses the switch, and is said. */
        if (prefs.studio) {
          const e = await editVideo(c.id, 1, [{ op: 'audio.set', patch: { studio: true, strength: 70 } }], 'Studio Sound, from the Screen Recorder');
          if (!e.success) setNote('Studio Sound could not be switched on for this recording — turn it on in the editor’s Audio tab.');
        }
      } else if (project.current.name !== nm) {
        const r = await renameVideoProject(project.current.id, nm);
        if (r.success) project.current.name = nm;
      }
      /* One File for every attempt: the same name, size and time is what lets a retry resume. */
      file.current ??= new File([result.blob], `${fileSlug(nm)}.${sup.mime!.ext}`, { type: sup.mime!.type, lastModified: Date.now() });
      upload.current = new AbortController();
      const up = await uploadVideo(project.current.id, file.current, p => setSave({ state: 'saving', sent: p.sent, total: p.total }), upload.current.signal);
      if (up.ok) {
        const id = project.current.id;
        /* Where the pointer went goes with the recording, once per project. Losing it loses only the offer to follow the pointer, so the recording is still Saved. */
        if (meta.current && metaSent.current !== id) {
          metaSent.current = id;
          const r = await saveScreenMeta(id, meta.current);
          if (!r.success) setNote('The recording is saved, but where the pointer went could not be kept, so following the pointer will not be offered for it.');
        }
        setSave({ state: 'saved', projectId: id }); onSaved(); return;
      }
      if (upload.current.signal.aborted) { setSave({ state: 'idle' }); setNote('Saving stopped. The recording is still here.'); return; }
      /* Refused before a byte was stored (no storage, allowance): the empty project goes too,
         so retrying does not leave a trail of "Needs a video" projects. */
      if (up.code) { const id = project.current.id; project.current = null; file.current = null; void deleteVideoProject(id); }
      setSave({ state: 'failed', error: up.error });
    } finally { setBusy(false); }
  };

  /* ── Dragging the bubble on the preview ── */
  const dragTo = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const cv = canvasRef.current, cv2 = camVid.current;
    if (!cv || !cv2?.videoWidth) return;
    const box = cv.getBoundingClientRect();
    /* The canvas is drawn object-fit: contain — find the picture inside its box. */
    const s = Math.min(box.width / cv.width, box.height / cv.height);
    const ox = (box.width - cv.width * s) / 2, oy = (box.height - cv.height * s) / 2;
    const px = (e.clientX - box.left - ox) / s, py = (e.clientY - box.top - oy) / s;
    setBubble(b => ({ ...b, ...bubbleAt(cv.width, cv.height, b, cv2.videoWidth / cv2.videoHeight, px, py, prefsRef.current.fx.bg === 'remove') }));
  };

  /* ── What is on screen ── */
  const corner = (Object.keys(CORNERS) as Corner[]).find(k => CORNERS[k].x === bubble.x && CORNERS[k].y === bubble.y);
  const recordingNow = phase === 'recording' || phase === 'paused';
  const blocked = !sup.secure ? 'Recording needs the app open on its secure (https) address.'
    : !sup.recorder ? 'This browser cannot record video. Use a recent Chrome, Edge, Firefox or Safari on a computer.'
      : !sup.mime ? 'This browser cannot record in a format we can keep (WebM or MP4). Use a recent Chrome, Edge, Firefox or Safari.'
        : '';
  const canStart = !blocked && phase === 'setup' && (mode === 'cam' ? sup.devices : sup.display);
  const showCanvas = phase !== 'review';
  const pct = save.state === 'saving' && save.total ? Math.round(save.sent / save.total * 100) : 0;
  /* Only the bubble moves: every other layout puts the camera in a fixed place. */
  const canDrag = mode === 'screen-cam' && camOn && !camHidden && prefs.layout === 'bubble';
  const look = prefs.look, framed = look.bg.kind !== 'none', fx = prefs.fx, brand = prefs.brand, frame = prefs.frame, layout = prefs.layout;
  const cutout = fx.bg === 'remove' && layout === 'bubble';
  const frameHint = cutout ? 'With the background behind you removed, you stand over the screen with no frame, so the shape and ring are not drawn.'
    : layout === 'presenter' && !framed ? 'With the background off you fill the whole video, so there is no frame or ring round you; switch the background on to frame yourself.'
      : layout !== 'bubble' && frame.shape === 'circle' ? 'A tall panel cannot be round, so in this layout a circle is drawn as a rounded panel.'
        : frame.ring === 'gradient' ? 'The gradient ring turns slowly, in the recording too.'
          : frame.ring === 'pulse' ? 'The neon glow breathes gently, in the recording too.' : '';
  /* What a minute costs on disk, on a 16:9 screen — what the person weighs when choosing. */
  const perMin = (() => {
    const d = mode === 'cam' ? CAM_RES[prefs.camRes] : { width: RES[prefs.res], height: Math.round(RES[prefs.res] * 9 / 16) };
    return (bitrateFor(d.width, d.height, prefs.fps, prefs.quality) + 128_000) * 60 / 8;
  })();
  const live2 = { phase, elapsed, count, micOn: mic && micOn, micMuted, camShown: mode === 'screen-cam' && camOn, camHidden, screen: mode !== 'cam', switching };
  const actions = { pause, resume, stop: () => stop(), cancel: cancelStart, toggleMic, toggleCam, switchScreen: () => void switchScreen() };

  return (
    <div className="vs-modal-back" role="dialog" aria-modal="true" aria-label="Screen Recorder" data-testid="rec-dialog">
      <div className="vs-modal vs-rec">
        <div className="vs-row" style={{ marginBottom: 10 }}>
          <h2 style={{ margin: 0, fontSize: 18, display: 'flex', alignItems: 'center', gap: 8 }}><MonitorPlay size={18} /> Screen Recorder</h2>
          {recordingNow && (
            <span className={`vs-rec-pill ${phase}`} data-testid="rec-state" data-state={phase} role="status">
              <i /> {phase === 'paused' ? 'Paused' : 'Recording'} <b data-testid="rec-time">{msClock(elapsed)}</b>
            </span>
          )}
          <span className="vs-spacer" />
          <button type="button" className="vs-btn ghost sm" onClick={close} aria-label="Close the recorder" data-testid="rec-close"><X size={16} /></button>
        </div>

        {blocked && <div className="vs-note bad" role="alert" style={{ marginBottom: 10 }}><AlertCircle size={16} /> <span>{blocked}</span></div>}
        {!blocked && !sup.display && <div className="vs-note warn" style={{ marginBottom: 10 }} data-testid="rec-no-screen"><Info size={16} /> <span>This browser cannot share its screen (most phones and tablets cannot). {sup.devices ? 'You can still record yourself with the camera.' : ''}</span></div>}
        {error && <div className="vs-note bad" role="alert" style={{ marginBottom: 10 }} data-testid="rec-error"><AlertCircle size={16} /> <span>{error}</span></div>}
        {note && <div className="vs-note warn" style={{ marginBottom: 10 }} data-testid="rec-note"><Info size={16} /> <span>{note}</span></div>}

        <div className="vs-rec-grid">
          <div className="vs-rec-stage" data-noinvert="">
            <canvas
              ref={canvasRef} width={1280} height={720} data-testid="rec-canvas"
              className={showCanvas ? '' : 'vs-rec-hidden'}
              onPointerDown={e => { if (!canDrag) return; drag.current = true; e.currentTarget.setPointerCapture(e.pointerId); dragTo(e); }}
              onPointerMove={e => { if (drag.current) dragTo(e); }}
              onPointerUp={() => { drag.current = false; }} onPointerCancel={() => { drag.current = false; }}
              style={{ cursor: canDrag ? 'grab' : 'default' }}
              aria-label="Preview of what is recorded"
            />
            <video ref={camVid} muted playsInline autoPlay className="vs-rec-hidden" data-testid="rec-cam" />
            <video ref={screenVid} muted playsInline autoPlay className="vs-rec-hidden" />
            {phase === 'review' && result && <video src={result.url} controls playsInline data-testid="rec-playback" />}
            {phase !== 'review' && mode === 'screen' && !display.current && <p className={`vs-rec-hint${framed ? ' on-bg' : ''}`}>Press <b>Start recording</b>, then choose a screen, window or tab to share.</p>}
            {phase !== 'review' && mode === 'screen-cam' && !display.current && <p className={`vs-rec-hint${framed ? ' on-bg' : ''}`}>Your screen appears here when you press <b>Start recording</b>.{camOn ? (layout === 'bubble' ? ' Drag your bubble to place it.' : '') : <> Press <b>Check camera</b> to see yourself in place.</>}</p>}
            {phase !== 'review' && mode === 'cam' && !camOn && <p className="vs-rec-hint">Press <b>Check camera</b> to see yourself before you start.</p>}
            {phase === 'countdown' && <div className="vs-rec-count" aria-live="assertive" data-testid="rec-countdown">{count}</div>}
          </div>

          <div className="vs-rec-side">
            {phase === 'review' && result ? (
              <div className="vs-col" style={{ gap: 12 }} data-testid="rec-review">
                <div className="vs-row" style={{ gap: 6 }}>
                  <b>Your recording</b>
                  <span className="vs-sub" style={{ margin: 0 }}>{msClock(result.ms)} · {bytesLabel(result.blob.size)}</span>
                </div>
                <label className="vs-label">Name
                  <input className="vs-input" value={name} onChange={e => setName(e.target.value)} maxLength={120} data-field="video.name" data-testid="rec-name" disabled={save.state === 'saving' || save.state === 'saved'} />
                </label>
                {save.state === 'saved' ? (
                  <>
                    <div className="vs-note ok" data-testid="rec-saved" role="status"><Check size={16} /> <span>Saved to your Media Library. <Link to={`/video-studio/${save.projectId}`}>Open it in the editor</Link> to trim it, add captions or make Shorts.</span></div>
                    <ProjectProgress projectId={save.projectId} />
                  </>
                ) : (
                  <button type="button" className="vs-btn ai vs-rec-big" onClick={() => void saveIt()} disabled={busy} data-testid="rec-save">
                    {save.state === 'saving' ? <Loader size={18} className="spin" /> : <UploadCloud size={18} />} {save.state === 'saving' ? 'Saving…' : save.state === 'failed' ? 'Try saving again' : 'Save to Media Library'}
                  </button>
                )}
                {save.state === 'saving' && (
                  <div className="vs-col" style={{ gap: 4 }} data-testid="rec-progress" data-pct={pct}>
                    <div className="vs-bar"><i style={{ width: `${pct}%` }} /></div>
                    <div className="vs-row"><span className="vs-sub" style={{ margin: 0 }}>{bytesLabel(save.sent)} of {bytesLabel(save.total)} sent</span><span className="vs-spacer" /><button type="button" className="vs-btn ghost sm" onClick={() => upload.current?.abort()}>Stop</button></div>
                  </div>
                )}
                {save.state === 'failed' && <div className="vs-note bad" role="alert" data-testid="rec-save-error"><AlertCircle size={16} /> <span>{save.error} Your recording is still here — try again, or download it.</span></div>}
                <div className="vs-row">
                  <a className="vs-btn" href={result.url} download={`${fileSlug(name || defaultName(mode))}.${sup.mime?.ext ?? 'webm'}`} data-testid="rec-download"><Download size={15} /> Download</a>
                  <button type="button" className="vs-btn" onClick={retake} disabled={save.state === 'saving'} data-testid="rec-retake"><RotateCcw size={15} /> Record again</button>
                  <button type="button" className="vs-btn danger" onClick={discard} disabled={save.state === 'saving'} data-testid="rec-discard"><Trash2 size={15} /> Discard</button>
                </div>
                <p className="vs-sub" style={{ margin: 0 }} data-testid="rec-allowance">
                  Saving uploads the recording as a new video project, so it counts toward your plan’s Video Studio allowances exactly as an upload does: one of this month’s recordings processed, its length in video minutes uploaded, and its size in video storage. If one is used up, saving says so and the recording stays here to download. No Shorts are made unless you ask for them in the editor.
                </p>
              </div>
            ) : (
              <div className="vs-col" style={{ gap: 14 }}>
                {!capturing && (
                  <div className="vs-col" style={{ gap: 6 }}>
                    <b className="vs-rec-h">What do you want to record?</b>
                    <div className="vs-rec-modes">
                      {MODES.map(m => {
                        const off = m.key === 'cam' ? !sup.devices : !sup.display;
                        return (
                          <button key={m.key} type="button" className="vs-rec-mode" aria-pressed={mode === m.key} disabled={off || phase !== 'setup'} onClick={() => setMode(m.key)} data-testid={`rec-mode-${m.key}`}>
                            <span>{m.key === 'screen-cam' ? <><MonitorPlay size={18} /><Camera size={14} /></> : <m.icon size={18} />}</span>
                            <b>{m.label}</b><small>{off ? 'Not available in this browser' : m.help}</small>
                          </button>
                        );
                      })}
                    </div>
                  </div>
                )}

                {(phase === 'recording' || phase === 'paused') && (
                  <div className="vs-col" style={{ gap: 6 }} data-testid="rec-live">
                    <b className="vs-rec-h">While recording</b>
                    <div className="vs-chips">
                      {live2.micOn && <button type="button" className="vs-chip" aria-pressed={micMuted} onClick={toggleMic} data-testid="rec-mute">{micMuted ? <><MicOff size={13} /> Microphone muted</> : <><Mic size={13} /> Mute microphone</>}</button>}
                      {live2.camShown && <button type="button" className="vs-chip" aria-pressed={camHidden} onClick={toggleCam} data-testid="rec-hide-cam">{camHidden ? <><VideoOff size={13} /> Camera hidden</> : <><Camera size={13} /> Hide camera</>}</button>}
                      {mode !== 'cam' && <button type="button" className="vs-chip" onClick={() => void switchScreen()} disabled={switching} data-testid="rec-switch"><RefreshCw size={13} className={switching ? 'spin' : ''} /> {switching ? 'Choose what to share…' : 'Share a different screen'}</button>}
                      {sup.pip && !pip && <button type="button" className="vs-chip" onClick={() => void openPip()} data-testid="rec-float"><PictureInPicture2 size={13} /> Floating controls</button>}
                    </div>
                  </div>
                )}

                <div className="vs-col" style={{ gap: 6 }}>
                  <b className="vs-rec-h">Sound</b>
                  <label className="vs-rec-check"><input type="checkbox" checked={mic} onChange={e => setMic(e.target.checked)} disabled={capturing} data-testid="rec-mic" /> {mic ? <Mic size={15} /> : <MicOff size={15} />} Record my microphone</label>
                  {mic && (
                    <div className="vs-row" style={{ flexWrap: 'nowrap' }}>
                      <select className="vs-select" value={micId} onChange={e => setMicId(e.target.value)} disabled={capturing || !mics.length} aria-label="Microphone">
                        {mics.length ? mics.map(d => <option key={d.id} value={d.id}>{d.label}</option>) : <option value="">No microphone found yet</option>}
                      </select>
                      <span className="vs-rec-meter" title={micOn ? 'Microphone level' : 'Check the microphone to see its level'}><span ref={meterEl} /></span>
                    </div>
                  )}
                  {mode !== 'cam' && !capturing && (
                    <label className="vs-rec-check"><input type="checkbox" checked={sysAudio} onChange={e => setSysAudio(e.target.checked)} disabled={capturing} data-testid="rec-sys" /> <Volume2 size={15} /> Also record sound from the tab or computer</label>
                  )}
                  {!capturing && sup.isolate && mic && (
                    <label className="vs-rec-check"><input type="checkbox" checked={prefs.isolate} onChange={e => setPref('isolate', e.target.checked)} data-testid="rec-isolate" /> <Mic size={15} /> Isolate my voice while recording</label>
                  )}
                  {!capturing && (
                    <label className="vs-rec-check"><input type="checkbox" checked={prefs.studio} onChange={e => setPref('studio', e.target.checked)} data-testid="rec-studio" /> <Volume2 size={15} /> Studio Sound on the saved recording</label>
                  )}
                  {!capturing && prefs.studio && <small className="vs-sub" style={{ margin: 0 }}>The browser already cuts echo and steady noise as you speak. Studio Sound — removing room noise, de-essing, evening out and setting the loudness — is done properly after saving, by the video engine, so recording stays light; every video you export from the editor has it.</small>}
                  {mode !== 'cam' && sysAudio && !capturing && <small className="vs-sub" style={{ margin: 0 }}>Chrome and Edge offer it in the share window: a tab’s sound always, the whole screen’s on Windows and ChromeOS. Firefox and Safari share no sound.</small>}
                </div>

                {needsCam && !capturing && (
                  <div className="vs-col" style={{ gap: 6 }}>
                    <b className="vs-rec-h">Camera</b>
                    <select className="vs-select" value={camId} onChange={e => setCamId(e.target.value)} disabled={capturing || !cams.length} aria-label="Camera">
                      {cams.length ? cams.map(d => <option key={d.id} value={d.id}>{d.label}</option>) : <option value="">No camera found yet</option>}
                    </select>
                    {cams.length > 0 && cams.every(d => /^Camera \d+$/.test(d.label)) && <small className="vs-sub" style={{ margin: 0 }}>Camera names appear once you allow the camera.</small>}
                    <div className="vs-chips" role="group" aria-label="Camera resolution">
                      {(Object.keys(CAM_RES) as CamRes[]).map(k => <button key={k} type="button" className="vs-chip" aria-pressed={prefs.camRes === k} onClick={() => setPref('camRes', k)} data-testid={`rec-camres-${k}`}>{CAM_LABEL[k]}</button>)}
                    </div>
                    <small className="vs-sub" style={{ margin: 0 }}>{mode === 'cam' ? 'The camera gives the nearest size it has.' : layout === 'bubble' ? 'The bubble is small, so 480p or 720p looks the same and is lighter on the computer.' : 'You are large in this layout, so 720p or 1080p keeps you sharp.'}</small>
                  </div>
                )}
                {phase === 'setup' && (needsCam || mic) && sup.devices && (
                  <div>
                    <button type="button" className="vs-btn" onClick={() => { setError(''); void ensureDevices(needsCam, mic); }} disabled={(!needsCam || camOn) && (!mic || micOn)} data-testid="rec-preview-btn">
                      <Camera size={15} /> {needsCam ? (camOn && (!mic || micOn) ? 'Camera is on' : mic ? 'Check camera and microphone' : 'Check camera') : micOn ? 'Microphone is on' : 'Check microphone'}
                    </button>
                  </div>
                )}

                {mode === 'screen-cam' && (
                  <div className="vs-col" style={{ gap: 6 }} data-testid="rec-layout">
                    <b className="vs-rec-h">Layout <small className="vs-sub" style={{ margin: 0, fontWeight: 500 }}>— see it on the preview; change it any time, even while recording</small></b>
                    <div className="vs-rec-layouts" role="group" aria-label="Layout">
                      {LAYOUTS.map(k => (
                        <button key={k} type="button" className="vs-rec-lay" aria-pressed={layout === k} onClick={() => setPref('layout', k)} title={LAYOUT_HELP[k]} data-testid={`rec-layout-${k}`}>
                          <LayoutThumb layout={k} look={look} bubble={bubble} shape={frame.shape} />
                          <small>{LAYOUT_LABEL[k]}</small>
                        </button>
                      ))}
                    </div>
                    <small className="vs-sub" style={{ margin: 0 }}>{LAYOUT_HELP[layout]}{camHidden ? ' While your camera is hidden the screen has the video to itself.' : ''}</small>
                  </div>
                )}

                {mode === 'screen-cam' && (
                  <div className="vs-col" style={{ gap: 6 }} data-testid="rec-bubble">
                    <b className="vs-rec-h">{layout === 'bubble' ? <>Camera bubble <small className="vs-sub" style={{ margin: 0, fontWeight: 500 }}>— or drag it on the preview</small></> : 'Camera frame'}</b>
                    {layout === 'bubble' && (
                      <>
                        <div className="vs-chips">
                          {(Object.keys(CORNERS) as Corner[]).map(k => <button key={k} type="button" className="vs-chip" aria-pressed={corner === k} onClick={() => setBubble(b => ({ ...b, ...CORNERS[k] }))} data-testid={`rec-corner-${k}`}>{CORNER_LABEL[k]}</button>)}
                        </div>
                        <div className="vs-chips">
                          {(['S', 'M', 'L'] as BubbleSize[]).map(s => <button key={s} type="button" className="vs-chip" aria-pressed={bubble.size === s} onClick={() => setBubble(b => ({ ...b, size: s }))} data-testid={`rec-size-${s}`}>{s === 'S' ? 'Small' : s === 'M' ? 'Medium' : 'Large'}</button>)}
                        </div>
                      </>
                    )}
                    <div className="vs-chips" role="group" aria-label="Camera shape">
                      {SHAPES.map(k => <button key={k} type="button" className="vs-chip" aria-pressed={frame.shape === k} onClick={() => setFrame({ shape: k })} data-testid={`rec-shape-${k}`}>{SHAPE_LABEL[k]}</button>)}
                      <button type="button" className="vs-chip" aria-pressed={bubble.mirror} onClick={() => setBubble(b => ({ ...b, mirror: !b.mirror }))}>Mirror</button>
                    </div>
                    <div className="vs-chips" role="group" aria-label="Ring round the camera">
                      {RINGS.map(k => <button key={k} type="button" className="vs-chip" aria-pressed={frame.ring === k} onClick={() => setFrame({ ring: k })} data-testid={`rec-ring-${k}`}>{RING_LABEL[k]}</button>)}
                    </div>
                    {frame.ring !== 'none' && frame.ring !== 'white' && (
                      <div className="vs-rec-swatches" role="group" aria-label="Ring colour">
                        {RING_COLORS.map(c => <button key={c} type="button" className="vs-rec-sw vs-rec-ring-sw" style={{ background: c, color: c }} aria-pressed={frame.ringColor === c} aria-label={`Ring colour ${c}`} onClick={() => setFrame({ ringColor: c })} data-testid={`rec-ring-colour-${c.slice(1)}`} />)}
                      </div>
                    )}
                    {frameHint && <small className="vs-sub" style={{ margin: 0 }} data-testid="rec-frame-hint">{frameHint}</small>}
                  </div>
                )}

                {needsCam && (
                  <div className="vs-col" style={{ gap: 8 }} data-testid="rec-camfx">
                    <b className="vs-rec-h">Camera look <small className="vs-sub" style={{ margin: 0, fontWeight: 500 }}>— {camOn ? 'see it on the preview' : 'check the camera to see it'}; changes live</small></b>
                    {canGrade() ? (
                      <div className="vs-rec-sliders">
                        <label>Brightness<input type="range" min={-50} max={50} step={1} value={fx.bright} onChange={e => setFx({ bright: Number(e.target.value) })} data-testid="rec-fx-bright" /></label>
                        <label>Contrast<input type="range" min={-50} max={50} step={1} value={fx.contrast} onChange={e => setFx({ contrast: Number(e.target.value) })} /></label>
                        <label>Colour<input type="range" min={-50} max={50} step={1} value={fx.sat} onChange={e => setFx({ sat: Number(e.target.value) })} /></label>
                        <label>Warmth<input type="range" min={-50} max={50} step={1} value={fx.warmth} onChange={e => setFx({ warmth: Number(e.target.value) })} /></label>
                        <label>Smooth skin<input type="range" min={0} max={100} step={5} value={fx.soften} onChange={e => setFx({ soften: Number(e.target.value) })} data-testid="rec-fx-soften" /></label>
                      </div>
                    ) : <small className="vs-sub" style={{ margin: 0 }}>This browser cannot colour-grade the camera (Safari 18 and newer, Chrome, Edge and Firefox can).</small>}
                    <div className="vs-chips">
                      {canGrade() && <button type="button" className="vs-chip" aria-pressed={fx.night} onClick={() => setFx({ night: !fx.night })} data-testid="rec-fx-night">Night view</button>}
                      {mode === 'cam' && <button type="button" className="vs-chip" aria-pressed={bubble.mirror} onClick={() => setBubble(b => ({ ...b, mirror: !b.mirror }))}>Mirror</button>}
                      <button type="button" className="vs-chip" onClick={() => setPrefs(p => ({ ...p, fx: { ...NO_FX, bg: p.fx.bg, blur: p.fx.blur, bgColor: p.fx.bgColor } }))}>Reset look</button>
                    </div>
                    <small className="vs-sub" style={{ margin: 0 }}>Smooth skin lays a soft focus over the camera picture; night view brightens a dark room. Both are in the recording.</small>
                    <b className="vs-rec-h" style={{ marginTop: 4 }}>Behind you</b>
                    <div className="vs-chips" role="group" aria-label="Camera background">
                      {(['none', 'blur', 'remove', 'image'] as CamBg[]).map(k => (
                        <button key={k} type="button" className="vs-chip" aria-pressed={fx.bg === k} data-testid={`rec-fx-bg-${k}`}
                          onClick={() => k === 'image' && !camBg ? camBgFile.current?.click() : setFx({ bg: k })}>
                          {k === 'none' ? 'As it is' : k === 'blur' ? 'Blur' : k === 'remove' ? 'Remove' : camBg ? 'My picture' : 'A picture…'}
                        </button>
                      ))}
                      <input ref={camBgFile} type="file" accept="image/png,image/jpeg,image/webp,image/avif" hidden onChange={e => { void pickPicture(e.target.files?.[0], 'camBg'); e.target.value = ''; }} data-testid="rec-fx-bg-file" />
                    </div>
                    {fx.bg === 'blur' && <div className="vs-rec-sliders"><label>Blur {fx.blur}%<input type="range" min={0} max={100} step={5} value={fx.blur} onChange={e => setFx({ blur: Number(e.target.value) })} data-testid="rec-fx-blur" /></label></div>}
                    {fx.bg === 'remove' && (mode === 'cam' || layout !== 'bubble') && (
                      <div className="vs-rec-swatches" role="group" aria-label="Colour behind you">
                        {COLORS.map(c => <button key={c} type="button" className="vs-rec-sw" style={{ background: c }} aria-pressed={fx.bgColor === c} aria-label={`Colour ${c}`} onClick={() => setFx({ bgColor: c })} />)}
                      </div>
                    )}
                    {fx.bg === 'image' && camBg && (
                      <div className="vs-row" style={{ gap: 6 }}>
                        <small className="vs-sub vs-rec-file" style={{ margin: 0 }}>{camBg.name} — stays in this browser</small>
                        <button type="button" className="vs-chip" onClick={() => camBgFile.current?.click()}>Replace</button>
                        <button type="button" className="vs-chip" onClick={() => { setFx({ bg: 'none' }); camBgRef.current = null; setCamBg(null); }}>Remove</button>
                      </div>
                    )}
                    {fx.bg !== 'none' && (
                      <small className={`vs-sub${fxState.state === 'failed' ? ' vs-rec-bad' : ''}`} style={{ margin: 0 }} data-testid="rec-fx-state" data-state={fxState.state}>
                        {fxState.state === 'loading' ? 'Loading the person-finder (about 11 MB, once)… the camera shows as it is until it is ready.'
                          : fxState.state === 'failed' ? `The person-finder could not start in this browser (${fxState.error}), so the background is shown as it is.`
                            : `${mode === 'screen-cam' && cutout ? 'You stand over your screen, cut out. ' : ''}Found in this browser — nothing is sent anywhere. It works the computer harder than the rest; if the recording stutters, choose “As it is”.`}
                      </small>
                    )}
                  </div>
                )}

                <div className="vs-col" style={{ gap: 8 }} data-testid="rec-brand">
                  <b className="vs-rec-h">Title and logo <small className="vs-sub" style={{ margin: 0, fontWeight: 500 }}>— on the video, changes live</small></b>
                  <label className="vs-rec-check"><input type="checkbox" checked={brand.card} onChange={e => setBrand({ card: e.target.checked })} data-testid="rec-card" /> Show a title card on the left</label>
                  {brand.card && (
                    <>
                      <input className="vs-input" placeholder="Title — e.g. How to book a call" value={brand.title} maxLength={60} onChange={e => setBrand({ title: e.target.value })} aria-label="Title" data-testid="rec-card-title" />
                      <textarea className="vs-input" placeholder="A line or two of description" value={brand.desc} maxLength={140} rows={2} onChange={e => setBrand({ desc: e.target.value })} aria-label="Description" data-testid="rec-card-desc" />
                      <div className="vs-chips">
                        <button type="button" className="vs-chip" aria-pressed={brand.cardPos === 'bl'} onClick={() => setBrand({ cardPos: 'bl' })}>Bottom left</button>
                        <button type="button" className="vs-chip" aria-pressed={brand.cardPos === 'tl'} onClick={() => setBrand({ cardPos: 'tl' })}>Top left</button>
                      </div>
                    </>
                  )}
                  <div className="vs-row" style={{ gap: 6 }}>
                    <button type="button" className="vs-btn sm" onClick={() => logoFile.current?.click()} data-testid="rec-logo-btn"><ImagePlus size={14} /> {logo ? 'Replace logo' : 'Add a logo'}</button>
                    {logo && <><img src={logo.url} alt="" className="vs-rec-logo" /><button type="button" className="vs-chip" onClick={() => { logoRef.current = null; setLogo(null); }}>Remove</button></>}
                    <input ref={logoFile} type="file" accept="image/png,image/jpeg,image/webp,image/svg+xml,image/avif" hidden onChange={e => { void pickPicture(e.target.files?.[0], 'logo'); e.target.value = ''; }} data-testid="rec-logo-file" />
                  </div>
                  {logo && (
                    <div className="vs-chips">
                      {(Object.keys(CORNERS) as Corner[]).map(k => <button key={k} type="button" className="vs-chip" aria-pressed={brand.logoCorner === k} onClick={() => setBrand({ logoCorner: k })}>{CORNER_LABEL[k]}</button>)}
                      {(['S', 'M', 'L'] as BubbleSize[]).map(z => <button key={z} type="button" className="vs-chip" aria-pressed={brand.logoSize === z} onClick={() => setBrand({ logoSize: z })}>{z === 'S' ? 'Small' : z === 'M' ? 'Medium' : 'Large'}</button>)}
                    </div>
                  )}
                  <small className="vs-sub" style={{ margin: 0 }}>A transparent PNG logo looks best. Pictures stay in this browser and are drawn into the recording.</small>
                </div>

                {mode !== 'cam' && (
                  <div className="vs-col" style={{ gap: 8 }} data-testid="rec-look">
                    <b className="vs-rec-h">Background and frame <small className="vs-sub" style={{ margin: 0, fontWeight: 500 }}>— change it any time, even while recording</small></b>
                    <div className="vs-row" style={{ gap: 10, flexWrap: 'nowrap' }}>
                      <span className="vs-rec-switch-label" id="rec-bg-label">Background behind the screen</span>
                      <span className="vs-spacer" />
                      <button type="button" className="vs-rec-switch" aria-pressed={framed} aria-labelledby="rec-bg-label" onClick={toggleBg} data-testid="rec-bg-toggle">
                        <i aria-hidden="true" /> {framed ? 'On' : 'Off'}
                      </button>
                    </div>
                    {!framed && (
                      <small className="vs-sub" style={{ margin: 0 }}>
                        {mode === 'screen-cam' && layout !== 'bubble' && camOn && !camHidden ? 'Off: you and your screen sit on a plain dark background with a small gap.' : 'Off: the screen fills the whole video.'} Switch it on to bring back the last background you chose.
                      </small>
                    )}
                    {framed && (
                      <>
                        <div className="vs-rec-swatches" role="group" aria-label="Background">
                          {COLORS.map(c => <button key={c} type="button" className="vs-rec-sw" style={{ background: c }} aria-pressed={look.bg.kind === 'color' && look.bg.color === c} aria-label={`Colour ${c}`} onClick={() => setLook({ bg: { kind: 'color', color: c } })} />)}
                          {(Object.keys(GRADIENTS) as GradientId[]).map(id => <button key={id} type="button" className="vs-rec-sw" style={{ background: gradientCss(id) }} aria-pressed={look.bg.kind === 'gradient' && look.bg.id === id} title={gradientLabel(id)} aria-label={`${gradientLabel(id)} gradient`} onClick={() => setLook({ bg: { kind: 'gradient', id } })} data-testid={`rec-bg-${id}`} />)}
                          <button type="button" className="vs-rec-sw img" style={image ? { backgroundImage: `url(${image.url})` } : undefined} aria-pressed={look.bg.kind === 'image'}
                            title={image ? `Your picture: ${image.name}` : 'Use your own picture'} aria-label={image ? 'Your picture' : 'Choose a picture'}
                            onClick={() => image ? setLook({ bg: { kind: 'image' } }) : fileRef.current?.click()} data-testid="rec-bg-image">{!image && <ImagePlus size={15} />}</button>
                        </div>
                        {image && (
                          <div className="vs-row" style={{ gap: 6 }}>
                            <small className="vs-sub vs-rec-file" style={{ margin: 0 }}>{image.name} — stays in this browser</small>
                            <button type="button" className="vs-chip" onClick={() => fileRef.current?.click()}>Replace</button>
                            <button type="button" className="vs-chip" onClick={removeImage}>Remove</button>
                          </div>
                        )}
                        <div className="vs-rec-sliders">
                          <label>Padding<input type="range" min={0} max={16} step={0.5} value={look.padding} onChange={e => setLook({ padding: Number(e.target.value) })} data-testid="rec-padding" /></label>
                          <label>Roundness<input type="range" min={0} max={6} step={0.2} value={look.radius} onChange={e => setLook({ radius: Number(e.target.value) })} data-testid="rec-radius" /></label>
                          <label>Shadow<input type="range" min={0} max={100} step={5} value={look.shadow} onChange={e => setLook({ shadow: Number(e.target.value) })} data-testid="rec-shadow" /></label>
                        </div>
                      </>
                    )}
                    {/* Outside the switch so a picture chosen from the swatch row (which is only shown when on) still has its input mounted. */}
                    <input ref={fileRef} type="file" accept="image/png,image/jpeg,image/webp,image/avif,image/gif" hidden onChange={e => { void pickImage(e.target.files?.[0]); e.target.value = ''; }} data-testid="rec-bg-file" />
                  </div>
                )}

                {mode !== 'cam' && (
                  <div className="vs-col" style={{ gap: 6 }} data-testid="rec-pointer">
                    <b className="vs-rec-h">Pointer</b>
                    <small className="vs-sub" style={{ margin: 0 }}>Where your pointer goes and clicks is noted while you record (read from the picture — nothing is zoomed now). After saving, the editor proposes the moments to follow from what you say, and you can choose them yourself.</small>
                    {!capturing && (sup.cursor ? (
                      <>
                        <div className="vs-chips" role="group" aria-label="Pointer">
                          <MousePointer2 size={14} style={{ alignSelf: 'center' }} />
                          {(Object.keys(CURSOR_LABEL) as CursorMode[]).map(k => <button key={k} type="button" className="vs-chip" aria-pressed={prefs.cursor === k} onClick={() => setPref('cursor', k)} data-testid={`rec-cursor-${k}`}>{CURSOR_LABEL[k]}</button>)}
                        </div>
                        <small className="vs-sub" style={{ margin: 0 }}>Hidden keeps your real pointer out of the video, so only a pointer the editor draws would show — but a hidden pointer is not in the picture either, so where it went cannot be noted and there is nothing to draw or follow.</small>
                      </>
                    ) : (
                      <small className="vs-sub" style={{ margin: 0 }}>This browser records the pointer exactly as it is on screen; hiding it is offered in Safari and Firefox.</small>
                    ))}
                  </div>
                )}

                {!capturing && (
                  <div className="vs-col" style={{ gap: 6 }} data-testid="rec-quality">
                    <b className="vs-rec-h">Frame rate and quality</b>
                    <div className="vs-chips" role="group" aria-label="Frame rate">
                      {FPS.map(f => <button key={f} type="button" className="vs-chip" aria-pressed={prefs.fps === f} onClick={() => setPref('fps', f)} data-testid={`rec-fps-${f}`}>{f} fps</button>)}
                    </div>
                    {mode !== 'cam' && (
                      <div className="vs-chips" role="group" aria-label="Resolution">
                        {(Object.keys(RES) as Res[]).map(k => <button key={k} type="button" className="vs-chip" aria-pressed={prefs.res === k} onClick={() => setPref('res', k)} data-testid={`rec-res-${k}`}>{RES_LABEL[k]}</button>)}
                      </div>
                    )}
                    <div className="vs-chips" role="group" aria-label="Quality">
                      {(Object.keys(QUALITY_LABEL) as Quality[]).map(k => <button key={k} type="button" className="vs-chip" aria-pressed={prefs.quality === k} onClick={() => setPref('quality', k)} data-testid={`rec-q-${k}`}>{QUALITY_LABEL[k]}</button>)}
                    </div>
                    <small className="vs-sub" style={{ margin: 0 }} data-testid="rec-permin">
                      About {bytesLabel(perMin)} a minute{mode !== 'cam' ? ' (a smaller screen records at its own size)' : ''}. {SLOW ? 'Set lighter to suit this computer. ' : ''}60 fps, 1440p and 4K need a fast computer; if the recording looks jerky, choose 30 fps, 720p and Light.
                    </small>
                  </div>
                )}

                {phase === 'setup' && (
                  sup.pip ? (
                    <div className="vs-col" style={{ gap: 4 }}>
                      <label className="vs-rec-check"><input type="checkbox" checked={prefs.float} onChange={e => setPref('float', e.target.checked)} data-testid="rec-float-pref" /> <PictureInPicture2 size={15} /> Floating controls over other windows</label>
                      <small className="vs-sub" style={{ margin: 0 }}>Pause, stop, mute and switch screens without coming back here. Sharing your whole screen shows them in the video too — drag them to a corner, or share a window or tab.</small>
                    </div>
                  ) : (
                    <small className="vs-sub" style={{ margin: 0 }}>This browser cannot float controls over other windows (Chrome and Edge can). Come back to this tab to pause or stop, or press your browser’s “Stop sharing”.</small>
                  )
                )}

                <div className="vs-rec-go">
                {phase === 'setup' || phase === 'starting' ? (
                  <div className="vs-col" style={{ gap: 6 }}>
                    <button type="button" className="vs-btn ai vs-rec-big" onClick={() => void start()} disabled={!canStart} data-testid="rec-start">
                      {phase === 'starting' ? <Loader size={18} className="spin" /> : <Circle size={18} fill="currentColor" />} {phase === 'starting' ? 'Waiting for you to choose…' : 'Start recording'}
                    </button>
                    <small className="vs-sub" style={{ margin: 0 }}>{mode === 'cam' ? 'A 3-second countdown, then it records.' : 'Your browser asks what to share, then a 3-second countdown. Your browser shows it is sharing the whole time.'}</small>
                  </div>
                ) : phase === 'countdown' ? (
                  <button type="button" className="vs-btn vs-rec-big" onClick={cancelStart} data-testid="rec-cancel"><X size={18} /> Cancel</button>
                ) : phase === 'finishing' ? (
                  <p className="vs-sub"><Loader size={14} className="spin" /> Finishing the file…</p>
                ) : (
                  <div className="vs-row vs-rec-controls">
                    {phase === 'recording'
                      ? <button type="button" className="vs-btn vs-rec-big" onClick={pause} data-testid="rec-pause"><Pause size={18} /> Pause</button>
                      : <button type="button" className="vs-btn vs-rec-big" onClick={resume} data-testid="rec-resume"><Play size={18} /> Resume</button>}
                    <button type="button" className="vs-btn vs-rec-big stop" onClick={() => stop()} data-testid="rec-stop"><Square size={16} fill="currentColor" /> Stop</button>
                  </div>
                )}
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
      {pip && createPortal(<FloatingControls s={live2} a={actions} />, pip.document.body)}
    </div>
  );
}

/* ── The floating controls ─────────────────────────────────────────────── */

/*
 * Drawn into the Picture-in-Picture window, which has none of this page's
 * stylesheets — so every style is inline, and kept to what a 76-pixel-high
 * strip needs.
 */
const bar: CSSProperties = { display: 'flex', alignItems: 'center', gap: 6, padding: '0 12px', height: '100vh', boxSizing: 'border-box', whiteSpace: 'nowrap' };
const fbtn: CSSProperties = { display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 5, height: 40, minWidth: 40, padding: '0 10px', border: 0, borderRadius: 10, background: '#2a2c38', color: '#fff', cursor: 'pointer', font: 'inherit' };

interface LiveState { phase: Phase; elapsed: number; count: number; micOn: boolean; micMuted: boolean; camShown: boolean; camHidden: boolean; screen: boolean; switching: boolean }
interface LiveActions { pause(): void; resume(): void; stop(): void; cancel(): void; toggleMic(): void; toggleCam(): void; switchScreen(): void }

/* A component of its own, not one made inside the bar: the bar re-renders twice a second and a remade button loses a click pressed across it. */
function B({ on, label, onClick, children, style }: { on?: boolean; label: string; onClick: () => void; children: ReactNode; style?: CSSProperties }) {
  return <button type="button" title={label} aria-label={label} aria-pressed={on} onClick={onClick} style={{ ...fbtn, ...(on ? { background: '#f59e0b', color: '#111' } : null), ...style }}>{children}</button>;
}

function FloatingControls({ s, a }: { s: LiveState; a: LiveActions }) {
  const going = s.phase === 'recording' || s.phase === 'paused';
  return (
    <div style={bar}>
      <span style={{ display: 'inline-flex', alignItems: 'center', gap: 7, minWidth: 74, fontVariantNumeric: 'tabular-nums' }} role="status">
        <i style={{ width: 10, height: 10, borderRadius: '50%', background: s.phase === 'recording' ? '#ef4444' : '#f59e0b' }} />
        {s.phase === 'countdown' ? `In ${s.count}…` : going ? msClock(s.elapsed) : s.phase === 'finishing' ? 'Saving…' : 'Ready'}
      </span>
      {s.phase === 'countdown' && <B label="Cancel" onClick={a.cancel}><X size={16} /> Cancel</B>}
      {going && (
        <>
          {s.phase === 'recording'
            ? <B label="Pause" onClick={a.pause}><Pause size={16} /></B>
            : <B label="Resume" onClick={a.resume} style={{ background: '#16a34a' }}><Play size={16} /></B>}
          <B label="Stop recording" onClick={a.stop} style={{ background: '#dc2626' }}><Square size={14} fill="currentColor" /> Stop</B>
          {s.micOn && <B label={s.micMuted ? 'Unmute microphone' : 'Mute microphone'} on={s.micMuted} onClick={a.toggleMic}>{s.micMuted ? <MicOff size={16} /> : <Mic size={16} />}</B>}
          {s.camShown && <B label={s.camHidden ? 'Show camera' : 'Hide camera'} on={s.camHidden} onClick={a.toggleCam}>{s.camHidden ? <VideoOff size={16} /> : <Camera size={16} />}</B>}
          {s.screen && <B label={s.switching ? 'Choose what to share in the main window' : 'Share a different screen'} onClick={a.switchScreen}><RefreshCw size={16} /></B>}
        </>
      )}
    </div>
  );
}

/* ── The layout picker's previews ──────────────────────────────────────── */

/*
 * Drawn from the same layoutRects the recording uses, on a 16:9 screen and a
 * 4:3 camera, so each little picture is where things will really sit — the
 * bubble in its current corner and size, the camera's shape, the padding.
 */
function LayoutThumb({ layout, look, bubble, shape }: { layout: Layout; look: Look; bubble: Bubble; shape: CamShape }) {
  const W = 160, H = 90;
  const r = layoutRects(W, H, layout, look, 16 / 9, 4 / 3, bubble);
  const pct = (b: { x: number; y: number; w: number; h: number }): CSSProperties => ({ left: `${b.x / W * 100}%`, top: `${b.y / H * 100}%`, width: `${b.w / W * 100}%`, height: `${b.h / H * 100}%` });
  const bg = look.bg.kind === 'color' ? look.bg.color : look.bg.kind === 'gradient' ? gradientCss(look.bg.id) : look.bg.kind === 'image' ? '#64748b' : '#0b0c10';
  const camRound = shape === 'square' ? '2px' : shape === 'circle' && !r.panel ? '50%' : '5px';
  const full = !!r.cam && r.cam.w >= W && r.cam.h >= H;
  return (
    <span className="vs-rec-lay-pic" style={{ background: bg }} aria-hidden="true">
      {layout === 'presenter' && r.cam && <i className="cam" style={{ ...pct(r.cam), borderRadius: full ? 0 : camRound }} />}
      <i className="scr" style={pct(r.screen)} />
      {layout !== 'presenter' && r.cam && <i className="cam" style={{ ...pct(r.cam), borderRadius: camRound }} />}
    </span>
  );
}
