/**
 * The policy, on a page anybody can open without an account.
 *
 * ── Why it is public ──
 *
 * Because it is linked from the sign-up form, and a document somebody is asked
 * to agree to has to be readable *before* they agree. A terms link that opens a
 * login screen is a terms link nobody has ever read.
 *
 * ── Why it is plain ──
 *
 * The audience is a plumber deciding whether to sign up, not a lawyer. Short
 * numbered clauses, in the words the product actually uses, so that when a
 * suspension says "2.1" there is something on this page that means the same
 * thing. Clauses are anchored so a decision can link straight to one.
 */
import { POLICY, POLICY_VERSION } from '../../services/policy';
import { activeBranding } from '../../services/tenancy';
import { usePageTitle } from '../../services/pageTitle';

const INK = '#17191c';
const MUTED = '#5b6270';
const LINE = '#e6e9f0';

export default function PolicyPage() {
  const brand = activeBranding();
  /* The reseller's name, never the platform's — this page is reachable on a
     white-label host too, and their customer should not learn whose software
     it is from the terms. */
  usePageTitle(`Acceptable use — ${brand.appName}`);

  return (
    <div style={{
      minHeight: '100vh', background: '#f4f5f7',
      padding: 'clamp(20px, 5vw, 52px) clamp(16px, 4vw, 32px)',
      fontFamily: 'system-ui, -apple-system, "Segoe UI", sans-serif',
    }}>
      <article style={{
        maxWidth: 720, margin: '0 auto', background: '#fff',
        border: `1px solid ${LINE}`, borderRadius: 18, padding: 'clamp(22px, 4vw, 40px)',
      }}>
        <h1 style={{ margin: 0, fontSize: 'clamp(21px, 3.6vw, 28px)', fontWeight: 800, color: INK, letterSpacing: '-0.025em' }}>
          Acceptable use
        </h1>
        <p style={{ margin: '6px 0 0', fontSize: 12.5, color: MUTED }}>
          Version {POLICY_VERSION} · {brand.appName}
        </p>
        <p style={{ margin: '16px 0 0', fontSize: 14, color: '#374151', lineHeight: 1.7 }}>
          The short version: use this to market a real business honestly. Do not send anything to people
          who did not ask to hear from you, and do not publish the five kinds of thing in clause 2.
          Everything below is that, in more detail.
        </p>

        {POLICY.map(c => (
          <section key={c.id} id={`clause-${c.id}`} style={{ marginTop: 26, scrollMarginTop: 20 }}>
            <h2 style={{ margin: 0, fontSize: 15.5, fontWeight: 800, color: INK }}>
              <span style={{ color: MUTED, fontWeight: 700 }}>{c.id}.</span> {c.title}
            </h2>
            {c.body.map((p, i) => (
              <p key={i} style={{ margin: '9px 0 0', fontSize: 13.5, color: '#374151', lineHeight: 1.75 }}>{p}</p>
            ))}
          </section>
        ))}

        <p style={{ margin: '30px 0 0', paddingTop: 18, borderTop: `1px solid ${LINE}`, fontSize: 12.5, color: MUTED, lineHeight: 1.7 }}>
          Questions about any of this, or about a decision made under it, go to whoever gave you this
          account. Say which clause you mean.
        </p>
      </article>
    </div>
  );
}
