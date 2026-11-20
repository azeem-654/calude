/**
 * The face of a project's Autopilot — Protron.
 *
 * ── Why a face rather than an icon ──
 *
 * A project runs on a five-minute cron somewhere the customer cannot see, and
 * the single hardest thing to believe about this product is that anything is
 * happening at all. A face that looks around is not decoration here — it is
 * the only signal on the screen that the system is present.
 *
 * It was a drawn purple bot of its own until 2026-11-20, when the owner asked
 * for every AI bot in the app to be Protron. The states it carried still
 * hold: a paused project must not look busy, so `awake={false}` is a still,
 * dimmed Protron; `busy` is Protron at work (ring running, head scanning).
 */
import ProtronAvatar from '../Protron/ProtronAvatar';

export default function AutopilotBot({
  size = 54, awake = true, busy = false,
}: {
  size?: number;
  /** False when the project is paused: Protron holds still and dims. */
  awake?: boolean;
  /** True while something is mid-flight. */
  busy?: boolean;
}) {
  return (
    <span
      style={{ display: 'inline-flex', width: size, height: size, flexShrink: 0, borderRadius: '50%', ...(awake ? {} : { filter: 'grayscale(1)', opacity: 0.6 }) }}
      aria-hidden
      data-awake={awake ? '1' : '0'}
    >
      <ProtronAvatar size={size} alive={awake} state={awake && busy ? 'working' : 'idle'} />
    </span>
  );
}
