/**
 * The face of a project's Autopilot.
 *
 * ── Why a drawn bot rather than an icon ──
 *
 * A project runs on a five-minute cron somewhere the customer cannot see, and
 * the single hardest thing to believe about this product is that anything is
 * happening at all. A thing that blinks and looks around is not decoration
 * here — it is the only signal on the screen that the system is present.
 *
 * It is drawn as SVG rather than imported as an image so it can carry state:
 * the eyes are open when the project is running and closed when it is paused,
 * and a paused project must not look busy. That distinction is the whole reason
 * it is a component rather than a picture.
 *
 * Every moving part is a real CSS rule inside a `prefers-reduced-motion` block
 * — never an inline `style={{ animation }}`, which no media query can reach and
 * which this repo has now been caught by three times.
 */
const ACCENT = '#5b46e5';

export default function AutopilotBot({
  size = 54, awake = true, busy = false,
}: {
  size?: number;
  /** False when the project is paused: the bot closes its eyes and goes still. */
  awake?: boolean;
  /** True while something is mid-flight, which speeds the antenna up. */
  busy?: boolean;
}) {
  return (
    <span
      className={awake ? 'ap-bot' : undefined}
      style={{ display: 'inline-flex', width: size, height: size, flexShrink: 0 }}
      aria-hidden
    >
      <svg viewBox="0 0 64 64" width={size} height={size} role="presentation">
        <defs>
          <linearGradient id="apBotBody" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#6d5ef0" />
            <stop offset="100%" stopColor="#4a36d6" />
          </linearGradient>
        </defs>

        {/* The antenna, which is what says "listening". */}
        <line x1="32" y1="9" x2="32" y2="16" stroke={ACCENT} strokeWidth="2.4" strokeLinecap="round" />
        <circle
          className={awake ? (busy ? 'ap-bot-antenna ap-bot-antenna-fast' : 'ap-bot-antenna') : undefined}
          cx="32" cy="7" r="3.4" fill={awake ? '#22c55e' : '#cbd5e1'}
        />

        {/* Head */}
        <rect x="11" y="16" width="42" height="34" rx="12" fill="url(#apBotBody)" />
        {/* Ears */}
        <rect x="6" y="27" width="4.5" height="11" rx="2.2" fill="#8b7cf5" />
        <rect x="53.5" y="27" width="4.5" height="11" rx="2.2" fill="#8b7cf5" />

        {/* Visor */}
        <rect x="17" y="23" width="30" height="19" rx="9" fill="#12103a" />

        {/* Eyes. Closed is a flat line, which is what "paused" looks like. */}
        {awake ? (
          <g className="ap-bot-eyes">
            <circle cx="26" cy="32.5" r="3.6" fill="#7dd3fc" />
            <circle cx="38" cy="32.5" r="3.6" fill="#7dd3fc" />
          </g>
        ) : (
          <g>
            <rect x="22.5" y="31.5" width="7" height="2" rx="1" fill="#64748b" />
            <rect x="34.5" y="31.5" width="7" height="2" rx="1" fill="#64748b" />
          </g>
        )}

        {/* A mouth line, so the visor is not a blank slab. */}
        <rect x="28" y="38.5" width="8" height="1.8" rx="0.9" fill="#3b3a6b" />
      </svg>
    </span>
  );
}
