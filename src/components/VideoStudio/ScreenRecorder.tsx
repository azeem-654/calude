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
 *    bubble is in the file. Its corner, size and shape change live, and it
 *    can be dragged on the preview. The frames are drawn on a worker's clock
 *    so they keep coming while this tab is in the background (recorder.ts).
 *  - Microphone and the tab's / computer's sound are mixed with WebAudio when
 *    both are there.
 *  - Saving is the same path as uploading a file (NewVideoProject):
 *    `createVideoProject` + `uploadVideo`, the bar is the bytes really sent,
 *    and "Saved" is said only after the server confirms the upload. On a
 *    failure the server's own words are shown and the recording stays here
 *    to retry or download.
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { MonitorPlay, Camera, Mic, MicOff, Pause, Play, Square, Circle, Download, RotateCcw, Trash2, UploadCloud, X, AlertCircle, Check, Loader, Volume2, Info } from 'lucide-react';
import { createVideoProject, uploadVideo, renameVideoProject, deleteVideoProject, bytesLabel, type VideoRequest } from '../../services/videoStudio';
import {
  support, mediaError, fileSlug, bubbleAt, drawComposite, frameSize, bitrateFor, finishFile, startClock, stopStreams, msClock, CORNERS,
  type RecMode, type Bubble, type Corner, type BubbleSize,
} from './recorder';

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
  { key: 'screen-cam', label: 'Screen + camera', help: 'Your face in a bubble on top', icon: MonitorPlay },
  { key: 'cam', label: 'Camera only', help: 'Just you, no screen', icon: Camera },
];
const CORNER_LABEL: Record<Corner, string> = { tl: 'Top left', tr: 'Top right', bl: 'Bottom left', br: 'Bottom right' };

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
  const [bubble, setBubble] = useState<Bubble>({ ...CORNERS.br, size: 'M', shape: 'circle', mirror: false });
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
  phaseRef.current = phase;
  bubbleRef.current = bubble;
  modeRef.current = mode;

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
        video: c ? { ...(camId ? { deviceId: { exact: camId } } : {}), width: { ideal: 1280 }, height: { ideal: 720 }, frameRate: { ideal: 30 } } : false,
        audio: m ? { ...(micId ? { deviceId: { exact: micId } } : {}), echoCancellation: true, noiseSuppression: true } : false,
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
  useEffect(() => { if (cam.current && phaseRef.current === 'setup') { stopCam(); void ensureDevices(true, false); } }, [camId]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { if (micS.current && phaseRef.current === 'setup') { stopMic(); void ensureDevices(false, true); } }, [micId]); // eslint-disable-line react-hooks/exhaustive-deps
  /* What the chosen mode no longer needs is switched off, light and all. */
  useEffect(() => { if (phaseRef.current === 'setup' && mode === 'screen' && cam.current) stopCam(); }, [mode]);
  useEffect(() => { if (phaseRef.current === 'setup' && !mic && micS.current) stopMic(); }, [mic]);

  /* ── The frame clock: the composite, and the microphone meter ── */
  useEffect(() => startClock(30, () => {
    const cv = canvasRef.current;
    if (modeRef.current === 'screen-cam' && cv) {
      const ctx = cv.getContext('2d');
      if (ctx) drawComposite(ctx, display.current ? screenVid.current : null, live(cam.current) ? camVid.current : null, bubbleRef.current);
    }
    const mt = meter.current, el = meterEl.current;
    if (mt && el) {
      mt.an.getByteTimeDomainData(mt.buf);
      let peak = 0;
      for (const v of mt.buf) peak = Math.max(peak, Math.abs(v - 128));
      el.style.width = `${Math.min(100, Math.round(peak / 128 * 160))}%`;
    }
  }), []);

  /* ── Releasing everything ── */
  const releaseCapture = () => {
    stopStreams(display.current, cam.current, micS.current, canvasStream.current, mixOut.current?.stream);
    display.current = cam.current = micS.current = canvasStream.current = null;
    mixOut.current = null; meter.current = null;
    attach(screenVid.current, null); attach(camVid.current, null);
    setCamOn(false); setMicOn(false);
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
  }, []);

  /* Leaving the page with a recording going, uploading or unsaved. */
  useEffect(() => {
    if (!dirty) return;
    const warn = (e: BeforeUnloadEvent) => { e.preventDefault(); e.returnValue = ''; };
    window.addEventListener('beforeunload', warn);
    return () => window.removeEventListener('beforeunload', warn);
  }, [dirty]);

  /* The timer (paused time left out), and the two-hour stop. */
  useEffect(() => {
    if (phase !== 'recording' && phase !== 'paused') return;
    const t = setInterval(() => {
      const ms = msNow();
      setElapsed(ms);
      if (ms >= MAX_MS && phaseRef.current === 'recording') stop('Recordings stop at two hours. This one is kept below.');
    }, 250);
    return () => clearInterval(t);
  }, [phase]); // eslint-disable-line react-hooks/exhaustive-deps

  /* ── Recording ── */
  const shareEnded = () => {
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
    let shared: MediaStream | null = null;
    if (mode !== 'cam') {
      try {
        /* systemAudio / surfaceSwitching are Chrome's hints (ignored elsewhere): offer the computer's
           sound in the picker when asked for, and let somebody switch what they share without stopping. */
        shared = await navigator.mediaDevices.getDisplayMedia({
          video: { frameRate: { ideal: 30, max: 30 } },
          audio: sysAudio,
          ...(sysAudio ? { systemAudio: 'include' } : {}),
          surfaceSwitching: 'include', selfBrowserSurface: 'include',
        } as DisplayMediaStreamOptions);
      } catch (e) { if (run.current === me) back(mediaError(e, 'screen')); return; }
      if (run.current !== me) { stopStreams(shared); return; }
      display.current = shared;
      shared.getVideoTracks()[0]?.addEventListener('ended', shareEnded);
      if (sysAudio && !shared.getAudioTracks().length) setNote('No computer sound was shared. Sound can be shared from a browser tab (tick “Share tab audio”), and on Windows or ChromeOS from the whole screen; windows and Mac screens share none.');
    }
    if (!await ensureDevices(mode !== 'screen', mic)) { if (run.current === me) back(''); return; }
    if (run.current !== me) return;
    if (shared && screenVid.current) {
      attach(screenVid.current, shared);
      await metadata(screenVid.current);
      if (mode === 'screen-cam' && canvasRef.current) {
        const s = frameSize(screenVid.current.videoWidth, screenVid.current.videoHeight);
        canvasRef.current.width = s.w; canvasRef.current.height = s.h;
      }
    }
    if (mode === 'cam' && camVid.current) await metadata(camVid.current);
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
    if (mode === 'screen-cam') { canvasStream.current = canvasRef.current!.captureStream(30); video = canvasStream.current.getVideoTracks()[0]; }
    else if (mode === 'screen') video = display.current?.getVideoTracks()[0];
    else video = cam.current?.getVideoTracks()[0];
    if (!video || video.readyState !== 'live') { releaseCapture(); setPhase('setup'); setError('There was no picture to record — try again.'); return; }
    const sounds = [mic ? micS.current?.getAudioTracks()[0] : undefined, display.current?.getAudioTracks()[0]].filter((t): t is MediaStreamTrack => !!t && t.readyState === 'live');
    let sound: MediaStreamTrack | undefined = sounds[0];
    if (sounds.length > 1) {
      const ctx = audioCtx();
      mixOut.current = ctx.createMediaStreamDestination();
      for (const t of sounds) ctx.createMediaStreamSource(new MediaStream([t])).connect(mixOut.current);
      sound = mixOut.current.stream.getAudioTracks()[0];
    }
    const out = new MediaStream([video, ...(sound ? [sound] : [])]);
    const st = video.getSettings();
    const w = (mode === 'screen-cam' ? canvasRef.current?.width : st.width) ?? 1280;
    const h = (mode === 'screen-cam' ? canvasRef.current?.height : st.height) ?? 720;
    let r: MediaRecorder;
    try { r = new MediaRecorder(out, { mimeType: m.mime, videoBitsPerSecond: bitrateFor(w, h), audioBitsPerSecond: 128_000 }); }
    catch (e) { releaseCapture(); setPhase('setup'); setError(`This browser could not start recording (${(e as Error).message || 'MediaRecorder refused'}).`); return; }
    chunks.current = [];
    r.ondataavailable = e => { if (e.data.size) chunks.current.push(e.data); };
    r.onerror = () => { setNote('The browser reported a recording error; what was recorded so far is kept.'); if (r.state !== 'inactive') r.stop(); };
    r.onstop = () => void finish();
    rec.current = r;
    t0.current = performance.now(); pausedAt.current = null; pausedFor.current = 0;
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
    if (r?.state === 'paused') { r.resume(); if (pausedAt.current !== null) pausedFor.current += performance.now() - pausedAt.current; pausedAt.current = null; setPhase('recording'); }
  };
  const cancelStart = () => { run.current++; releaseCapture(); setPhase('setup'); };

  /* ── After ── */
  const dropResult = () => {
    upload.current?.abort();
    if (urlRef.current) URL.revokeObjectURL(urlRef.current);
    urlRef.current = '';
    setResult(null); setSave({ state: 'idle' }); setName(''); setNote(''); setError('');
    project.current = null; file.current = null;
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
      } else if (project.current.name !== nm) {
        const r = await renameVideoProject(project.current.id, nm);
        if (r.success) project.current.name = nm;
      }
      /* One File for every attempt: the same name, size and time is what lets a retry resume. */
      file.current ??= new File([result.blob], `${fileSlug(nm)}.${sup.mime!.ext}`, { type: sup.mime!.type, lastModified: Date.now() });
      upload.current = new AbortController();
      const up = await uploadVideo(project.current.id, file.current, p => setSave({ state: 'saving', sent: p.sent, total: p.total }), upload.current.signal);
      if (up.ok) { setSave({ state: 'saved', projectId: project.current.id }); onSaved(); return; }
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
    setBubble(b => ({ ...b, ...bubbleAt(cv.width, cv.height, b, cv2.videoWidth / cv2.videoHeight, px, py) }));
  };

  /* ── What is on screen ── */
  const corner = (Object.keys(CORNERS) as Corner[]).find(k => CORNERS[k].x === bubble.x && CORNERS[k].y === bubble.y);
  const recordingNow = phase === 'recording' || phase === 'paused';
  const blocked = !sup.secure ? 'Recording needs the app open on its secure (https) address.'
    : !sup.recorder ? 'This browser cannot record video. Use a recent Chrome, Edge, Firefox or Safari on a computer.'
      : !sup.mime ? 'This browser cannot record in a format we can keep (WebM or MP4). Use a recent Chrome, Edge, Firefox or Safari.'
        : '';
  const canStart = !blocked && phase === 'setup' && (mode === 'cam' ? sup.devices : sup.display);
  const showCanvas = mode === 'screen-cam' && phase !== 'review';
  const showCam = mode === 'cam' && phase !== 'review';
  const showScreen = mode === 'screen' && phase !== 'review' && !!display.current;
  const pct = save.state === 'saving' && save.total ? Math.round(save.sent / save.total * 100) : 0;

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
              onPointerDown={e => { if (!camOn) return; drag.current = true; e.currentTarget.setPointerCapture(e.pointerId); dragTo(e); }}
              onPointerMove={e => { if (drag.current) dragTo(e); }}
              onPointerUp={() => { drag.current = false; }} onPointerCancel={() => { drag.current = false; }}
              style={{ cursor: camOn ? 'grab' : 'default' }}
              aria-label="Preview of what is recorded"
            />
            <video ref={camVid} muted playsInline autoPlay className={showCam && camOn ? '' : 'vs-rec-hidden'} data-testid="rec-cam" />
            <video ref={screenVid} muted playsInline autoPlay className={showScreen ? '' : 'vs-rec-hidden'} />
            {phase === 'review' && result && <video src={result.url} controls playsInline data-testid="rec-playback" />}
            {phase !== 'review' && mode === 'screen' && !display.current && <p className="vs-rec-hint">Press <b>Start recording</b>, then choose a screen, window or tab to share.</p>}
            {phase !== 'review' && mode === 'screen-cam' && !display.current && <p className="vs-rec-hint">Your screen appears here when you press <b>Start recording</b>.{camOn ? ' Drag your bubble to place it.' : <> Press <b>Check camera</b> to place your bubble.</>}</p>}
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
                  <div className="vs-note ok" data-testid="rec-saved" role="status"><Check size={16} /> <span>Saved to your Media Library. <Link to={`/video-studio/${save.projectId}`}>Open it in the editor</Link> to trim it, add captions or make Shorts.</span></div>
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
                  {mode !== 'cam' && (
                    <label className="vs-rec-check"><input type="checkbox" checked={sysAudio} onChange={e => setSysAudio(e.target.checked)} disabled={capturing} data-testid="rec-sys" /> <Volume2 size={15} /> Also record sound from the tab or computer</label>
                  )}
                  {mode !== 'cam' && sysAudio && <small className="vs-sub" style={{ margin: 0 }}>Chrome and Edge offer it in the share window: a tab’s sound always, the whole screen’s on Windows and ChromeOS. Firefox and Safari share no sound.</small>}
                </div>

                {needsCam && (
                  <div className="vs-col" style={{ gap: 6 }}>
                    <b className="vs-rec-h">Camera</b>
                    <select className="vs-select" value={camId} onChange={e => setCamId(e.target.value)} disabled={capturing || !cams.length} aria-label="Camera">
                      {cams.length ? cams.map(d => <option key={d.id} value={d.id}>{d.label}</option>) : <option value="">No camera found yet</option>}
                    </select>
                    {cams.length > 0 && cams.every(d => /^Camera \d+$/.test(d.label)) && <small className="vs-sub" style={{ margin: 0 }}>Camera names appear once you allow the camera.</small>}
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
                  <div className="vs-col" style={{ gap: 6 }} data-testid="rec-bubble">
                    <b className="vs-rec-h">Camera bubble <small className="vs-sub" style={{ margin: 0, fontWeight: 500 }}>— or drag it on the preview</small></b>
                    <div className="vs-chips">
                      {(Object.keys(CORNERS) as Corner[]).map(k => <button key={k} type="button" className="vs-chip" aria-pressed={corner === k} onClick={() => setBubble(b => ({ ...b, ...CORNERS[k] }))} data-testid={`rec-corner-${k}`}>{CORNER_LABEL[k]}</button>)}
                    </div>
                    <div className="vs-chips">
                      {(['S', 'M', 'L'] as BubbleSize[]).map(s => <button key={s} type="button" className="vs-chip" aria-pressed={bubble.size === s} onClick={() => setBubble(b => ({ ...b, size: s }))} data-testid={`rec-size-${s}`}>{s === 'S' ? 'Small' : s === 'M' ? 'Medium' : 'Large'}</button>)}
                      <button type="button" className="vs-chip" aria-pressed={bubble.shape === 'circle'} onClick={() => setBubble(b => ({ ...b, shape: 'circle' }))}>Circle</button>
                      <button type="button" className="vs-chip" aria-pressed={bubble.shape === 'rounded'} onClick={() => setBubble(b => ({ ...b, shape: 'rounded' }))} data-testid="rec-shape-rounded">Rounded</button>
                      <button type="button" className="vs-chip" aria-pressed={bubble.mirror} onClick={() => setBubble(b => ({ ...b, mirror: !b.mirror }))}>Mirror</button>
                    </div>
                  </div>
                )}

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
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
