/**
 * Protron's "Report a problem" sheet: a screenshot of the screen taken the
 * moment it opens, the customer's words, and any screenshots of their own
 * (chosen, or pasted into the box), sent to support by email
 * (services/supportReport.ts → /api/support-report.php).
 *
 * The screenshot is shown before it is sent and can be retaken or removed —
 * it is a picture of somebody's CRM, so they decide whether it goes.
 *
 * A voice note (2026-11-25): the customer can say what went wrong instead of
 * typing it. The recording is turned into words in the box (intake.php
 * `transcribe`), where they can correct it, and the recording itself goes with
 * the report for whoever fixes it. Two minutes at most — the size the server
 * keeps — and it stops by itself there.
 */
import { useEffect, useRef, useState } from 'react';
import { Camera, ImagePlus, Loader, Mic, RotateCcw, Send, Square, Trash2, X } from 'lucide-react';
import { captureScreen, preparePicture, sendReport, type ReportResult } from '../../services/supportReport';
import { transcribe } from '../../services/intake';

const MAX_OWN = 3;
const MAX_VOICE_S = 120;
const MAX_VOICE_BYTES = 1_450_000;

/** What this browser records in: Opus in WebM, or AAC in MP4 on Safari. */
function voiceType(): string {
  if (typeof MediaRecorder === 'undefined') return '';
  for (const t of ['audio/webm;codecs=opus', 'audio/webm', 'audio/mp4', 'audio/ogg;codecs=opus']) {
    try { if (MediaRecorder.isTypeSupported(t)) return t; } catch { /* old Safari */ }
  }
  return '';
}

function toBase64(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(String(r.result).replace(/^data:[^,]*,/, ''));
    r.onerror = () => reject(new Error('read'));
    r.readAsDataURL(blob);
  });
}

export default function ReportProblem({ initial, onClose, onSent }: {
  /** What they last said, as a start for the description. */
  initial: string;
  onClose: () => void;
  onSent: (message: string, withScreenshot: boolean, result?: ReportResult) => void;
}) {
  const [shot, setShot] = useState('');
  const [shotState, setShotState] = useState<'taking' | 'ready' | 'failed' | 'removed'>('taking');
  const [shotError, setShotError] = useState('');
  const [text, setText] = useState(initial);
  const [own, setOwn] = useState<string[]>([]);
  const [error, setError] = useState<{ message: string; field?: string } | null>(null);
  const [sending, setSending] = useState(false);
  const file = useRef<HTMLInputElement>(null);
  const ownCount = useRef(0);
  useEffect(() => { ownCount.current = own.length; }, [own]);
  const area = useRef<HTMLTextAreaElement>(null);
  /* The voice note. */
  const [voice, setVoice] = useState<'idle' | 'asking' | 'recording' | 'writing' | 'done'>('idle');
  const [voiceNote, setVoiceNote] = useState<{ url: string; b64: string; mime: string } | null>(null);
  const [voiceMsg, setVoiceMsg] = useState('');
  const [secs, setSecs] = useState(0);
  const rec = useRef<{ mr: MediaRecorder; stream: MediaStream; timer: number } | null>(null);
  const canRecord = !!voiceType() && !!navigator.mediaDevices?.getUserMedia;
  useEffect(() => () => {
    const r = rec.current;
    if (r) { window.clearInterval(r.timer); try { r.mr.stop(); } catch { /* */ } r.stream.getTracks().forEach(t => t.stop()); }
  }, []);
  useEffect(() => () => { if (voiceNote) URL.revokeObjectURL(voiceNote.url); }, [voiceNote]);

  const startVoice = async () => {
    setVoiceMsg('');
    setError(null);
    setVoice('asking');
    let stream: MediaStream;
    try { stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true } }); } catch {
      setVoice('idle');
      setVoiceMsg('The microphone could not be used — allow it in your browser, or type the problem instead.');
      return;
    }
    const type = voiceType();
    const mr = new MediaRecorder(stream, { mimeType: type, audioBitsPerSecond: 32_000 });
    const parts: Blob[] = [];
    mr.ondataavailable = e => { if (e.data.size) parts.push(e.data); };
    mr.onstop = () => {
      stream.getTracks().forEach(t => t.stop());
      const mime = (mr.mimeType || type).split(';')[0];
      void finishVoice(new Blob(parts, { type: mime }), mime);
    };
    const started = Date.now();
    const timer = window.setInterval(() => {
      const n = Math.floor((Date.now() - started) / 1000);
      setSecs(n);
      if (n >= MAX_VOICE_S) stopVoice();
    }, 250);
    rec.current = { mr, stream, timer };
    setSecs(0);
    mr.start(1000);
    setVoice('recording');
  };

  const stopVoice = () => {
    const r = rec.current;
    if (!r) return;
    rec.current = null;
    window.clearInterval(r.timer);
    try { r.mr.stop(); } catch { setVoice('idle'); }
  };

  const finishVoice = async (blob: Blob, mime: string) => {
    if (blob.size < 800) { setVoice('idle'); setVoiceMsg('Nothing was heard — try again a little closer to the microphone.'); return; }
    if (blob.size > MAX_VOICE_BYTES) { setVoice('idle'); setVoiceMsg('That voice note is too long — keep it under two minutes.'); return; }
    const b64 = await toBase64(blob).catch(() => '');
    if (!b64) { setVoice('idle'); setVoiceMsg('That recording could not be read — try again.'); return; }
    setVoiceNote({ url: URL.createObjectURL(blob), b64, mime });
    setVoice('writing');
    const lang = (navigator.language || '').split(',')[0];
    const t = await transcribe(b64, mime, /^[a-z]{2,3}(-[A-Za-z]{2,4})?$/.test(lang) ? lang : '', 'The speaker is reporting a problem they hit in the Protected Central app (a CRM): which screen, what they pressed, what happened.');
    setVoice('done');
    if (t.ok && t.text.trim()) {
      setText(cur => (cur.trim() ? `${cur.trim()}\n\n${t.text.trim()}` : t.text.trim()));
      setVoiceMsg(t.clarity === 'unclear' ? 'Some of it was hard to hear — please check the words in the box.' : 'Your words are in the box — correct anything it misheard.');
    } else {
      setVoiceMsg(t.noAi ? 'Your voice note will be sent with the report. It could not be turned into words here, so please add a line below.' : `Your voice note will be sent. It could not be written out (${t.error}) — please add a line below.`);
    }
  };

  const dropVoice = () => { setVoiceNote(null); setVoice('idle'); setVoiceMsg(''); };

  const take = async () => {
    setShotState('taking');
    setShotError('');
    const r = await captureScreen();
    if (r.ok) { setShot(r.dataUrl); setShotState('ready'); } else { setShot(''); setShotError(r.error); setShotState('failed'); }
  };
  // eslint-disable-next-line react-hooks/exhaustive-deps -- once, as the sheet opens: the screen as it was when they pressed the button
  useEffect(() => { void take(); area.current?.focus({ preventScroll: true }); }, []);

  const addFiles = async (files: Iterable<File>) => {
    setError(null);
    for (const f of files) {
      if (!/^image\//.test(f.type)) { setError({ message: 'Only pictures can be added.', field: 'report.pictures' }); continue; }
      const r = await preparePicture(f);
      if (!r.ok) { setError({ message: r.error, field: 'report.pictures' }); continue; }
      /* Counted on a ref: a state updater runs later, so it cannot stop this loop. */
      if (ownCount.current >= MAX_OWN) { setError({ message: `Up to ${MAX_OWN} of your own pictures.`, field: 'report.pictures' }); break; }
      ownCount.current += 1;
      setOwn(list => [...list, r.dataUrl]);
    }
  };

  const send = async () => {
    if (voice === 'recording') stopVoice();
    /* A voice note alone is enough to send; its words, when they could be
       written out, are already in the box. */
    const words = text.trim() || (voiceNote ? 'Voice note — please listen to the recording.' : '');
    if (words.length < 5) { setError({ message: 'Say what went wrong, in a sentence or two — or record a voice note.', field: 'report.description' }); area.current?.focus(); return; }
    setSending(true);
    setError(null);
    const withShot = shotState === 'ready' && !!shot;
    const r = await sendReport({ description: words, screenshot: withShot ? shot : '', pictures: own, audio: voiceNote?.b64, audioMime: voiceNote?.mime });
    setSending(false);
    if (!r.ok) { setError({ message: r.message, field: r.field }); return; }
    onSent(r.message, withShot, r);
  };

  return (
    <div className="pt-report" role="dialog" aria-label="Report a problem" data-testid="protron-report">
      <div className="pt-report-head">
        <b><Camera size={16} /> Report a problem</b>
        <button type="button" className="pt-icon" aria-label="Close the report" title="Close" onClick={onClose}><X size={16} /></button>
      </div>
      <p className="pt-report-sub">Stuck, or found a bug? Tell us what went wrong — type it or record a voice note. Your report, with a screenshot of this screen, goes straight to our technical team, and you can follow it from the Report a problem button.</p>

      <div className="pt-report-shot" data-state={shotState}>
        {shotState === 'taking' && <span className="pt-report-wait"><Loader size={15} className="spin" /> Taking a screenshot of your screen…</span>}
        {shotState === 'ready' && <img src={shot} alt="Screenshot of your screen that will be sent" />}
        {shotState === 'failed' && <span className="pt-report-wait">{shotError}</span>}
        {shotState === 'removed' && <span className="pt-report-wait">No screenshot of the screen will be sent.</span>}
        <span className="pt-report-shot-actions">
          {shotState !== 'taking' && <button type="button" className="pt-btn" onClick={() => void take()}><RotateCcw size={13} /> {shotState === 'ready' ? 'Retake' : 'Take screenshot'}</button>}
          {shotState === 'ready' && <button type="button" className="pt-btn" onClick={() => { setShot(''); setShotState('removed'); }}><Trash2 size={13} /> Don’t send it</button>}
        </span>
      </div>

      <div className="pt-report-voice" data-field="report.voice">
        {voice === 'recording' ? (
          <button type="button" className="pt-btn pt-btn-rec" onClick={stopVoice} data-testid="report-voice-stop">
            <Square size={13} /> Stop recording · {Math.floor(secs / 60)}:{String(secs % 60).padStart(2, '0')}
          </button>
        ) : voice === 'writing' ? (
          <span className="pt-report-wait"><Loader size={14} className="spin" /> Writing out what you said…</span>
        ) : voiceNote ? (
          <span className="pt-report-voice-row">
            <audio controls src={voiceNote.url} preload="metadata" />
            <button type="button" className="pt-btn" onClick={dropVoice}><Trash2 size={13} /> Remove</button>
          </span>
        ) : canRecord ? (
          <button type="button" className="pt-btn" onClick={() => void startVoice()} disabled={voice === 'asking'} data-testid="report-voice">
            <Mic size={14} /> {voice === 'asking' ? 'Allow the microphone…' : 'Record a voice note'}
          </button>
        ) : (
          <small className="pt-report-note">This browser cannot record a voice note — please type the problem.</small>
        )}
        {voiceMsg && <small className="pt-report-note" role="status">{voiceMsg}</small>}
      </div>

      <label className="pt-report-label" htmlFor="pt-report-text">What happened, and what did you expect?</label>
      <textarea id="pt-report-text" ref={area} data-field="report.description" className="pt-input pt-report-text" rows={4} maxLength={4000}
        value={text} onChange={e => setText(e.target.value)}
        placeholder="e.g. I pressed Save on a contact and nothing happened."
        aria-invalid={error?.field === 'report.description' || undefined}
        onPaste={e => {
          const pics = [...e.clipboardData.files].filter(f => /^image\//.test(f.type));
          if (pics.length) { e.preventDefault(); void addFiles(pics); }
        }} />

      <div className="pt-report-own" data-field="report.pictures">
        {own.map((src, i) => (
          <span key={i} className="pt-report-thumb">
            <img src={src} alt={`Your picture ${i + 1}`} />
            <button type="button" aria-label={`Remove picture ${i + 1}`} onClick={() => setOwn(list => list.filter((_, j) => j !== i))}><X size={12} /></button>
          </span>
        ))}
        {own.length < MAX_OWN && (
          <button type="button" className="pt-btn" onClick={() => file.current?.click()}><ImagePlus size={14} /> Add your own screenshot</button>
        )}
        <input ref={file} type="file" accept="image/*" multiple hidden
          onChange={e => { const fs = [...(e.target.files ?? [])]; e.target.value = ''; void addFiles(fs); }} />
      </div>
      <small className="pt-report-note">You can also paste a screenshot into the box. Please leave out passwords and patient details.</small>

      {error && <p className="pt-report-error" role="alert">{error.message}</p>}

      <div className="pt-report-foot">
        <button type="button" className="pt-btn" onClick={onClose} disabled={sending}>Cancel</button>
        <button type="button" className="pt-btn pt-btn-primary" onClick={() => void send()} disabled={sending || shotState === 'taking' || voice === 'writing' || voice === 'asking'} data-testid="protron-report-send">
          {sending ? <><Loader size={14} className="spin" /> Sending…</> : <><Send size={14} /> Send report</>}
        </button>
      </div>
    </div>
  );
}
