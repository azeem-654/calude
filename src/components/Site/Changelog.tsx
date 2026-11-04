/**
 * /changelog — what shipped, newest first. Public on every host, signed in or
 * not, styled as the Trust Center is. The entries are `changelog.ts`, which
 * says why nothing planned is listed.
 */
import { ArrowLeft, Check, Sparkles } from 'lucide-react';
import { LogoMark } from '../shared/Logo';
import { appHref, isCrossOrigin } from '../../services/hosts';
import { usePageTitle } from '../../services/pageTitle';
import { RELEASES } from './changelog';
import { FOUNDER, SUPPORT_EMAIL } from './company';
import './site.css';

const cross = (href: string) => (isCrossOrigin(href) ? { rel: 'noopener' as const } : {});
const when = (iso: string) => new Date(`${iso}T12:00:00Z`).toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric', timeZone: 'UTC' });

export default function Changelog() {
  usePageTitle('What’s new — Protected Central');
  const home = typeof window !== 'undefined' && /^(www\.)?protectedcentral\.com$/.test(window.location.hostname) ? '/' : appHref('/');
  return (
    <div className="dc tc">
      <header className="dc-nav stuck">
        <a className="dc-brand" href={home}><LogoMark size={26} /><span>Protected Central</span></a>
        <div className="dc-nav-cta">
          <a className="dc-btn dc-btn-ghost" href={appHref('/login')} {...cross(appHref('/login'))}>Sign in</a>
          <a className="dc-btn dc-btn-primary" href={appHref('/signup')} {...cross(appHref('/signup'))}>Start free</a>
        </div>
      </header>

      <main className="tc-main">
        <a className="tc-back" href={home}><ArrowLeft size={14} /> Back to the site</a>
        <span className="dc-eyebrow">Changelog</span>
        <h1 className="tc-h1">What’s new</h1>
        <p className="tc-lead">
          What we have shipped, newest first. Every customer gets each release on their plan, at no extra cost — including lifetime-deal buyers.
          Only finished work is listed here; nothing on this page is a promise of something to come.
        </p>
        <p className="tc-lead">
          Protected Central is built and run by its founder, {FOUNDER}. Questions or a feature you need: <a className="chg-mail" href={`mailto:${SUPPORT_EMAIL}`}>{SUPPORT_EMAIL}</a>.
        </p>
        <p className="tc-updated">Last release {when(RELEASES[0].date)}</p>

        <ol className="chg-list">
          {RELEASES.map(r => (
            <li key={`${r.date}-${r.title}`} className="tc-card chg-item">
              <div className="chg-meta"><time dateTime={r.date}>{when(r.date)}</time><span className="chg-area">{r.area}</span></div>
              <div className="tc-card-head"><span className="dc-tile-icon"><Sparkles size={16} /></span><h2>{r.title}</h2></div>
              <ul>{r.points.map(p => <li key={p}><Check size={13} /> <span>{p}</span></li>)}</ul>
            </li>
          ))}
        </ol>
      </main>
    </div>
  );
}
