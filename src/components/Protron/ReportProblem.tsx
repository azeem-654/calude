/**
 * Protron's "Report a problem" sheet: a screenshot of the screen taken the
 * moment it opens, the customer's words, and any screenshots of their own
 * (chosen, or pasted into the box), sent to support by email
 * (services/supportReport.ts → /api/support-report.php).
 *
 * The screenshot is shown before it is sent and can be retaken or removed —
 * it is a picture of somebody's CRM, so they decide whether it goes.
 */
import { useEffect, useRef, useState } from 'react';
import { Camera, ImagePlus, Loader, RotateCcw, Send, Trash2, X } from 'lucide-react';
import { captureScreen, preparePicture, sendReport } from '../../services/supportReport';

const MAX_OWN = 3;

export default function ReportProblem({ initial, onClose, onSent }: {
  /** What they last said, as a start for the description. */
  initial: string;
  onClose: () => void;
  onSent: (message: string, withScreenshot: boolean) => void;
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
    if (text.trim().length < 5) { setError({ message: 'Say what went wrong, in a sentence or two.', field: 'report.description' }); area.current?.focus(); return; }
    setSending(true);
    setError(null);
    const withShot = shotState === 'ready' && !!shot;
    const r = await sendReport({ description: text.trim(), screenshot: withShot ? shot : '', pictures: own });
    setSending(false);
    if (!r.ok) { setError({ message: r.message, field: r.field }); return; }
    onSent(r.message, withShot);
  };

  return (
    <div className="pt-report" role="dialog" aria-label="Report a problem" data-testid="protron-report">
      <div className="pt-report-head">
        <b><Camera size={16} /> Report a problem</b>
        <button type="button" className="pt-icon" aria-label="Close the report" title="Close" onClick={onClose}><X size={16} /></button>
      </div>
      <p className="pt-report-sub">Tell us what went wrong. Your report, with a screenshot of this screen, goes to our support team at support@protectedcentral.com, and they reply by email.</p>

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
        <button type="button" className="pt-btn pt-btn-primary" onClick={() => void send()} disabled={sending || shotState === 'taking'} data-testid="protron-report-send">
          {sending ? <><Loader size={14} className="spin" /> Sending…</> : <><Send size={14} /> Send report</>}
        </button>
      </div>
    </div>
  );
}
