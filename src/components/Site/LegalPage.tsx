/**
 * /privacy and /terms-of-service — public on every host, signed in or not.
 *
 * Google's OAuth review opens these from the consent screen and from the home
 * page, and a customer is asked to agree to them before an account exists, so
 * neither may sit behind a login. Same plain layout as the Acceptable Use page
 * (PolicyPage), with a contents list and anchored sections so a support reply
 * can link to one. The words are in legalText.ts.
 */
import { LEGAL_UPDATED, PRIVACY, PRIVACY_CONTACT, TERMS, type LegalSection } from './legalText';
import { usePageTitle } from '../../services/pageTitle';

const INK = '#17191c';
const MUTED = '#5b6270';
const LINE = '#e6e9f0';

export default function LegalPage({ doc }: { doc: 'privacy' | 'terms' }) {
  const title = doc === 'privacy' ? 'Privacy Policy' : 'Terms of Service';
  usePageTitle(`${title} — Protected Central`);
  const sections: LegalSection[] = doc === 'privacy' ? PRIVACY : TERMS;

  return (
    <div style={{ minHeight: '100vh', background: '#f4f5f7', padding: 'clamp(20px, 5vw, 52px) clamp(16px, 4vw, 32px)', fontFamily: 'system-ui, -apple-system, "Segoe UI", sans-serif' }}>
      <article style={{ maxWidth: 760, margin: '0 auto', background: '#fff', border: `1px solid ${LINE}`, borderRadius: 18, padding: 'clamp(22px, 4vw, 42px)' }}>
        <a href="/" style={{ fontSize: 13, color: MUTED, textDecoration: 'none' }}>← Protected Central</a>
        <h1 style={{ margin: '14px 0 0', fontSize: 'clamp(24px, 4vw, 32px)', fontWeight: 800, color: INK, letterSpacing: '-0.025em' }}>{title}</h1>
        <p style={{ margin: '6px 0 0', fontSize: 12.5, color: MUTED }}>Last updated {LEGAL_UPDATED}</p>

        <nav aria-label="Contents" style={{ marginTop: 22, padding: '14px 16px', borderRadius: 12, background: '#f8fafc', border: `1px solid ${LINE}` }}>
          <b style={{ fontSize: 12, color: MUTED, letterSpacing: '0.05em', textTransform: 'uppercase' }}>Contents</b>
          <ol style={{ margin: '8px 0 0', paddingLeft: 20, display: 'grid', gap: 4, fontSize: 13.5 }}>
            {sections.map(s => <li key={s.id}><a href={`#${s.id}`} style={{ color: '#4c39d1', textDecoration: 'none' }}>{s.title}</a></li>)}
          </ol>
        </nav>

        {sections.map((s, n) => (
          <section key={s.id} id={s.id} style={{ marginTop: 28, scrollMarginTop: 20 }}>
            <h2 style={{ margin: 0, fontSize: 17, fontWeight: 800, color: INK }}>
              <span style={{ color: MUTED, fontWeight: 700 }}>{n + 1}.</span> {s.title}
            </h2>
            {s.body.map((p, i) => <p key={i} style={{ margin: '10px 0 0', fontSize: 14, color: '#374151', lineHeight: 1.75 }}>{p}</p>)}
            {s.list && (
              <ul style={{ margin: '10px 0 0', paddingLeft: 22, display: 'grid', gap: 6 }}>
                {s.list.map(li => <li key={li} style={{ fontSize: 14, color: '#374151', lineHeight: 1.7 }}>{li}</li>)}
              </ul>
            )}
          </section>
        ))}

        <p style={{ margin: '32px 0 0', paddingTop: 18, borderTop: `1px solid ${LINE}`, fontSize: 13, color: MUTED, lineHeight: 1.7 }}>
          Contact: <a href={`mailto:${PRIVACY_CONTACT}`} style={{ color: '#4c39d1' }}>{PRIVACY_CONTACT}</a>
          {' · '}<a href="/privacy" style={{ color: '#4c39d1' }}>Privacy Policy</a>
          {' · '}<a href="/terms-of-service" style={{ color: '#4c39d1' }}>Terms of Service</a>
          {' · '}<a href="/terms" style={{ color: '#4c39d1' }}>Acceptable Use</a>
          {' · '}<a href="/security" style={{ color: '#4c39d1' }}>Security</a>
        </p>
      </article>
    </div>
  );
}
