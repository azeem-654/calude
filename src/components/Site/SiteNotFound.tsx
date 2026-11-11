/**
 * An address protectedcentral.com does not have (PUB-4). The Worker answers it
 * with status 404 and noindex (lib/publicPages.ts); this is what a person sees.
 * It used to be the home page, which told nobody their link was wrong.
 */
import { usePageTitle } from '../../services/pageTitle';
import { NOT_FOUND_HEAD } from '../../../worker/src/lib/publicPages';

const INK = '#17191c';
const MUTED = '#5b6270';
const LINE = '#e6e9f0';
const link: React.CSSProperties = { color: '#4c39d1', textDecoration: 'none', fontWeight: 700 };

export default function SiteNotFound() {
  usePageTitle(NOT_FOUND_HEAD.title);
  return (
    <main style={{ minHeight: '100vh', background: '#f4f5f7', padding: 'clamp(20px, 5vw, 52px) clamp(16px, 4vw, 32px)', fontFamily: 'system-ui, -apple-system, "Segoe UI", sans-serif' }}>
      <div style={{ maxWidth: 560, margin: '8vh auto 0', background: '#fff', border: `1px solid ${LINE}`, borderRadius: 18, padding: 'clamp(22px, 4vw, 40px)' }}>
        <a href="/" style={{ fontSize: 13, color: MUTED, textDecoration: 'none' }}>← Protected Central</a>
        <h1 style={{ margin: '14px 0 0', fontSize: 'clamp(22px, 4vw, 30px)', fontWeight: 800, color: INK, letterSpacing: '-0.02em' }}>There is no page at this address</h1>
        <p style={{ margin: '10px 0 0', fontSize: 14.5, color: '#374151', lineHeight: 1.7 }}>
          The link may be mistyped, or the page may have moved. These are the places most people are looking for:
        </p>
        <ul style={{ margin: '14px 0 0', paddingLeft: 20, display: 'grid', gap: 8, fontSize: 14.5 }}>
          <li><a href="/" style={link}>The home page</a></li>
          <li><a href="/pricing" style={link}>Pricing</a></li>
          <li><a href="https://app.protectedcentral.com/login" style={link}>Sign in to the app</a></li>
        </ul>
      </div>
    </main>
  );
}
