/**
 * The bar that says this is not the real thing.
 *
 * ── Why it is unmissable and cannot be closed ──
 *
 * Because the failure it prevents is somebody doing a day's real work in the
 * rehearsal copy — loading their contacts, building a campaign — and losing all
 * of it, because staging's database is wiped and reseeded whenever it suits.
 * The two sites are identical by design, which is exactly what makes them easy
 * to confuse.
 *
 * A dismissible bar would be dismissed on the first visit and never seen again,
 * which is the same as not having one. So it stays, in a colour nothing else in
 * the app uses, with a link back to the live site for whoever arrived here by
 * accident.
 *
 * ── Why the check is the hostname ──
 *
 * `isStagingHost()` reads `location.hostname`, so one build serves both sites
 * and neither can be published with the other's banner state baked in. A build
 * flag would eventually be wrong in the one direction that matters: production
 * built from a staging config, with no warning on it at all.
 */
import { isStagingHost } from '../../services/hosts';

export default function StagingBanner() {
  if (!isStagingHost()) return null;

  return (
    <div role="status" style={{
      display: 'flex', gap: 10, alignItems: 'center', justifyContent: 'center', flexWrap: 'wrap',
      padding: '7px clamp(14px, 3vw, 22px)',
      background: '#3730a3', color: '#fff',
      fontSize: 12, fontWeight: 700, letterSpacing: '0.01em',
    }}>
      <span style={{
        fontSize: 9.5, fontWeight: 800, letterSpacing: '0.06em',
        padding: '2px 7px', borderRadius: 999, background: 'rgba(255,255,255,0.22)',
      }}>
        TESTING
      </span>
      <span style={{ fontWeight: 500 }}>
        This is the testing copy. Its data is separate and gets wiped — do not work in it.
      </span>
      <a href="https://app.protectedcentral.com" style={{ color: '#fff', fontWeight: 800, textDecoration: 'underline' }}>
        Go to the live app
      </a>
    </div>
  );
}
