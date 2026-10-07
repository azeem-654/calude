/**
 * Whoever is signed in, as a picture: their own photo once they have uploaded
 * one (Settings → Profile), and until then the animated orb — the owner's
 * reference: a milky glass sphere with a blue, violet and pink liquid ribbon
 * inside it that swells to fill the sphere and folds back into a wave.
 *
 * The orb is drawn in CSS (index.css, `.orb-av`), sized from one custom
 * property so the same markup works at 38 px in the top bar and 112 px in the
 * dashboard's welcome. Its movement is behind `prefers-reduced-motion`, like
 * every other moving part; Settings → Profile → Animation overrules a system
 * that asks for less.
 */
import { useMyAvatar } from '../../services/userAvatar';

export function OrbAvatar({ size, label }: { size: number; label?: string }) {
  return (
    <span className="orb-av" data-noinvert role={label ? 'img' : undefined} aria-label={label} aria-hidden={label ? undefined : true}
      style={{ width: size, height: size, '--s': `${size}px` } as React.CSSProperties}>
      <span className="orb-fluid">
        <i className="orb-b1" /><i className="orb-b2" /><i className="orb-b3" /><i className="orb-b4" />
      </span>
      <span className="orb-glass" />
    </span>
  );
}

/** The signed-in person's face at `size` px: their photo, or the orb. */
export default function UserFace({ size, className, testId }: { size: number; className?: string; testId?: string }) {
  const me = useMyAvatar();
  if (me.photo) {
    return <img src={me.src} alt="Your photo" className={className} data-testid={testId} data-face="photo"
      style={{ width: size, height: size, borderRadius: '50%', objectFit: 'cover', display: 'block' }} />;
  }
  return (
    <span className={className} data-testid={testId} data-face="orb" style={{ display: 'block', width: size, height: size, borderRadius: '50%' }}>
      <OrbAvatar size={size} label="Your picture — add a photo in Settings → Profile" />
    </span>
  );
}
