/**
 * "Live in the cloud" on the dashboard — the same answer as the cloud in the
 * top bar (services/cloudPulse.ts), with room to say what it is minding.
 *
 * A strip rather than a panel: it is reassurance, not work, and it sits
 * under the Autopilot panel because that is the work it is reassuring about.
 * It reads the cron's own record of its last run, so it pulses only while
 * that is recent; late, it says so in amber, and unreadable, it says that.
 */
import { Cloud, CloudOff } from 'lucide-react';
import { cloudTone, runningText, sinceText, useCloud } from '../../services/cloudPulse';
import '../Layout/cloudBadge.css';

export default function CloudLive() {
  const p = useCloud();
  const tone = cloudTone(p);
  if (!p || p.state === 'loading') return null;
  const head = tone === 'live' ? 'Live in the cloud' : tone === 'late' ? 'The cloud is running late' : 'Could not reach the cloud';
  const line = tone === 'live'
    ? `Your workflows keep running when the app is closed or your computer is off. Last run ${sinceText(p.lastRunAt)}, every ${p.everyMinutes} minutes.`
    : tone === 'late'
      ? `The schedule last ran ${sinceText(p.lastRunAt)}. Nothing is lost — due work goes out on the next run.`
      : 'This browser could not ask the server just now, so it cannot say whether the schedule is running.';
  return (
    <section className={`cl-strip cb-${tone}`} aria-label="Cloud status" data-testid="cloud-live">
      <span className="cl-icon cb-icon">
        {p.state === 'unreadable' ? <CloudOff size={20} strokeWidth={2.2} /> : <Cloud size={20} strokeWidth={2.2} />}
        {tone === 'live' && <span className="cb-dot" aria-hidden="true" />}
      </span>
      <span className="cl-text">
        <strong>{head}</strong>
        <span>{line}</span>
        {p.state === 'ready' && <span className="cl-minding">Running for this workspace: {runningText(p)}.</span>}
      </span>
    </section>
  );
}
