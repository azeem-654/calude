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
import { useEffect, useState } from 'react';
import { hostMatchesServer, isStagingHost } from '../../services/hosts';
import { authStatus } from '../../services/auth';

export default function StagingBanner() {
  /*
   * ── Why this asks the server as well as the address bar ──
   *
   * The hostname is the right thing to draw the banner from, and it stays
   * that way. But it can only say what was typed. On 2026-09-18 a wildcard
   * Worker route on the live app swallowed testing.protectedcentral.com: the
   * live Worker, on the live database, served that address wearing this
   * banner, because this banner asked the hostname and the hostname still
   * said "testing".
   *
   * A banner promising a rehearsal over the real customer database is the
   * worst thing this component could do, so it now checks that the Worker
   * answering agrees about which site this is. `null` means the server did not
   * say — an older deployment — and is treated as "cannot tell" rather than as
   * a mismatch, because a false alarm here teaches people to ignore the true
   * one.
   */
  const [agrees, setAgrees] = useState<boolean | null>(null);
  useEffect(() => {
    let alive = true;
    authStatus()
      .then(st => { if (alive) setAgrees(hostMatchesServer(st.appOrigin ?? '')); })
      .catch(() => { /* unreachable server: say nothing rather than guess */ });
    return () => { alive = false; };
  }, []);

  /* Loud, and on both sites. The mismatch is as dangerous at the live address
     as at the testing one — it means the address bar is lying either way. */
  if (agrees === false) {
    return (
      <div role="alert" style={{
        display: 'flex', gap: 10, alignItems: 'center', justifyContent: 'center', flexWrap: 'wrap',
        padding: '10px clamp(14px, 3vw, 22px)',
        background: '#b42318', color: '#fff',
        fontSize: 12.5, fontWeight: 700, letterSpacing: '0.01em',
      }}>
        <span style={{
          fontSize: 9.5, fontWeight: 800, letterSpacing: '0.06em',
          padding: '2px 7px', borderRadius: 999, background: 'rgba(255,255,255,0.25)',
        }}>
          WRONG SITE
        </span>
        <span style={{ fontWeight: 500 }}>
          This address is being served by the other deployment&rsquo;s Worker, so what you see and what
          you change here are not what this address should be. Stop and fix the Cloudflare route before
          working in it.
        </span>
      </div>
    );
  }

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
