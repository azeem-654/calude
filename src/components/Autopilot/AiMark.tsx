/**
 * The mark a project wears until its client has a logo.
 *
 * ── Why not a letter ──
 *
 * It was the first letter of the project name in a tinted square, which is the
 * default every dashboard ships with and which says nothing except "nobody has
 * filled this in". A board of six of those reads as six unfinished things.
 *
 * This is a small piece of machinery instead: a core with three rings turning
 * around it at different speeds. It is the same mark on every project — it is
 * not pretending to be a brand — but it is *the system's* mark, which is what
 * the square actually means while a client has no logo of their own.
 *
 * ── The motion ──
 *
 * Three rings at three speeds, in CSS classes so `prefers-reduced-motion` can
 * reach them. Still, it is a clean geometric mark rather than a broken one:
 * nothing here is legible only while it is moving.
 *
 * It takes the project's own tint so a stack of projects is still telling them
 * apart by colour, which is what the lettered square was at least doing.
 */
export default function AiMark({ size = 48, fg = '#5b46e5', awake = true }: {
  size?: number;
  fg?: string;
  /** False on a paused project: the rings stop and the core dims. */
  awake?: boolean;
}) {
  return (
    <svg viewBox="0 0 48 48" width={size} height={size} role="presentation" aria-hidden
      style={{ display: 'block' }}>
      {/* The outer ring, drawn as a dashed circle so the rotation is visible
          at all — a plain circle turning looks exactly like a still one. */}
      <circle
        className={awake ? 'ai-mark-ring-slow' : undefined}
        cx="24" cy="24" r="19"
        fill="none" stroke={fg} strokeWidth="1.5" strokeLinecap="round"
        strokeDasharray="26 14" opacity="0.32"
        style={{ transformOrigin: '24px 24px' }}
      />
      <circle
        className={awake ? 'ai-mark-ring-fast' : undefined}
        cx="24" cy="24" r="13.5"
        fill="none" stroke={fg} strokeWidth="1.5" strokeLinecap="round"
        strokeDasharray="14 22" opacity="0.55"
        style={{ transformOrigin: '24px 24px' }}
      />

      {/* The core. A rounded square rather than a dot, so at 28px it still
          reads as an object rather than as a speck of dust on the screen. */}
      <rect
        className={awake ? 'ai-mark-core' : undefined}
        x="17" y="17" width="14" height="14" rx="4.5"
        fill={fg} opacity={awake ? 1 : 0.4}
        style={{ transformOrigin: '24px 24px' }}
      />
      {/* Two nodes on the inner orbit: the thing that makes it read as a
          network rather than as a loading spinner. */}
      <g className={awake ? 'ai-mark-ring-fast' : undefined} style={{ transformOrigin: '24px 24px' }}>
        <circle cx="24" cy="10.5" r="2.4" fill={fg} opacity="0.85" />
        <circle cx="24" cy="37.5" r="1.8" fill={fg} opacity="0.5" />
      </g>
    </svg>
  );
}
