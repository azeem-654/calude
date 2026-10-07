/**
 * The cloud in the top bar: this workspace's work is running on the server,
 * on every screen.
 *
 * It blinks only when it is true. The state is the cron's own record of its
 * last run (services/cloudPulse.ts → /api/cloud.php): green and pulsing when a
 * run finished in the last twenty minutes, amber and still when the schedule
 * is late, grey when the answer could not be had. A cloud that blinked "live"
 * from a constant would be telling customers their follow-ups were going out
 * on the one day they were not.
 *
 * Pressing it says what that means in words — what keeps running with the
 * computer off, when the cloud last ran, and what it is minding for this
 * workspace — so the claim can be checked, not just believed.
 */
import { useEffect, useRef, useState } from 'react';
import { Cloud, CloudOff } from 'lucide-react';
import { cloudTone, runningText, sinceText, useCloud } from '../../services/cloudPulse';
import './cloudBadge.css';

export default function CloudBadge() {
  const p = useCloud();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const away = (e: MouseEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false); };
    const esc = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false); };
    document.addEventListener('mousedown', away);
    document.addEventListener('keydown', esc);
    return () => { document.removeEventListener('mousedown', away); document.removeEventListener('keydown', esc); };
  }, [open]);

  const tone = cloudTone(p);
  const label = tone === 'live' ? 'Cloud live' : tone === 'late' ? 'Cloud delayed' : 'Cloud';
  const title = tone === 'live'
    ? `Running in the cloud — last run ${sinceText(p!.lastRunAt)}. Your workflows keep running when your computer is off.`
    : tone === 'late'
      ? `The cloud schedule is late — last run ${sinceText(p!.lastRunAt)}.`
      : 'Checking the cloud…';

  return (
    <div ref={ref} className="cb-wrap">
      {/* A black key with the cloud lit inside it and a light under its lip —
          the owner's reference, a backlit keyboard key. The light is the state:
          blue when the cloud ran in the last twenty minutes, amber when it is
          late, out when it could not be asked. */}
      <button
        type="button"
        className={`cb-key cb-${tone}`}
        title={title}
        aria-label={title}
        aria-expanded={open}
        aria-haspopup="dialog"
        data-testid="cloud-badge"
        data-noinvert
        onClick={() => setOpen(v => !v)}
      >
        <span className="cb-cap" aria-hidden="true" />
        <span className="cb-icon">
          {tone === 'unknown' && p?.state === 'unreadable' ? <CloudOff size={17} strokeWidth={2.1} /> : <Cloud size={17} strokeWidth={2.1} />}
        </span>
        <span className="cb-lip" aria-hidden="true" />
        <span className="cb-led" aria-hidden="true" />
        <span className="cb-label">{label}</span>
      </button>
      {open && (
        <div role="dialog" aria-label="Cloud status" className="cb-pop">
          <div className="cb-pop-head">
            <span className={`cb-pop-icon cb-${tone}`}><Cloud size={18} strokeWidth={2.2} /></span>
            <span>
              <strong>{tone === 'live' ? 'Live in the cloud' : tone === 'late' ? 'The cloud is running late' : p?.state === 'unreadable' ? 'Could not reach the cloud' : 'Checking the cloud…'}</strong>
              {p?.state === 'ready' && <small>Last run {sinceText(p.lastRunAt)} · every {p.everyMinutes} minutes</small>}
            </span>
          </div>
          <p>
            Protected Central runs on servers, not on this computer. Autopilot projects, workflows,
            follow-up emails and texts, inbox replies, daily prospect finders and review checks keep
            running when you close the app or switch your computer off.
          </p>
          {p?.state === 'ready' && <p className="cb-minding"><b>Running for this workspace:</b> {runningText(p)}.</p>}
          {tone === 'late' && <p className="cb-warn">The schedule has not run for over twenty minutes. Nothing is lost — due work goes out on the next run.</p>}
          {p?.state === 'unreadable' && <p className="cb-warn">This browser could not ask the server just now, so it cannot say. Check your connection.</p>}
        </div>
      )}
    </div>
  );
}
