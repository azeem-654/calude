/**
 * The frame of an industry microsite — /hvac, /roofing, /medical-billing.
 *
 * Each is meant to read as a site of its own: the logo and "Home" stay on the
 * microsite, the menu names only its own sections, and nothing links back to
 * the general home page or across to another industry. That is decided here,
 * once, from the microsite's config — the pages inside never build a nav or a
 * footer of their own, so no stray "/" or "/roofing" can creep in from a
 * shared component.
 *
 * `MicrositeContext` (micrositeContext.ts) tells anything inside which site it is on (the booking
 * buttons use it for the source they report).
 *
 * The home page's nav simply hides its links under 760px; a microsite has a
 * real menu there instead, because its links are the only way around it.
 */
import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from 'react';
import { MicrositeContext, useMicrosite, type MicrositeConfig } from './micrositeContext';
import { CalendarCheck, Mail, Menu, X } from 'lucide-react';
import { LogoMark } from '../shared/Logo';
import { appHref, isCrossOrigin } from '../../services/hosts';
import { rememberArrival, useCallLink } from '../../services/strategyCall';
import HelpLauncher from '../shared/HelpLauncher';
import Starfield from './Starfield';
import './site.css';
import './industry.css';



const cross = (href: string) => (isCrossOrigin(href) ? { rel: 'noopener' as const } : {});

/**
 * "Book …" on this microsite, to the strategy call, carrying where the visitor
 * came from — or, while the owner is not taking bookings, to the page's own
 * inquiry form, in words that say so.
 */
export function BookCall({ label, size = '', variant = 'primary', testid }: { label?: string; size?: '' | 'lg'; variant?: 'primary' | 'outline' | 'light'; testid?: string }) {
  const site = useMicrosite();
  const { href, closed } = useCallLink(site?.id ?? 'main', site?.writeHref ?? '#talk');
  return (
    <a className={`dc-btn dc-btn-${variant}${size ? ` dc-btn-${size}` : ''}`} href={href} data-testid={testid ?? 'book-call'} data-booking={closed ? 'closed' : 'open'}>
      {closed ? <Mail size={size === 'lg' ? 16 : 15} /> : <CalendarCheck size={size === 'lg' ? 16 : 15} />} {closed ? site?.writeLabel ?? 'Write to us' : label ?? site?.bookLabel ?? 'Book a Strategy Call'}
    </a>
  );
}

export default function MicrositeLayout({ site, children }: { site: MicrositeConfig; children: ReactNode }) {
  useEffect(() => { rememberArrival(); }, []);
  const call = useCallLink(site.id, site.writeHref);
  const [stuck, setStuck] = useState(false);
  const [open, setOpen] = useState(false);
  useEffect(() => {
    const onScroll = () => setStuck(window.scrollY > 24);
    onScroll();
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);
  useEffect(() => {
    if (!open) return;
    const esc = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false); };
    window.addEventListener('keydown', esc);
    return () => window.removeEventListener('keydown', esc);
  }, [open]);

  /* The same self-measuring nav as the home page: it steps down until it fits. */
  const navRef = useRef<HTMLElement | null>(null);
  useLayoutEffect(() => {
    const el = navRef.current;
    if (!el) return;
    const fit = () => {
      for (const step of ['full', 'tight', 'tiny']) {
        el.dataset.fit = step;
        if (el.scrollWidth <= el.clientWidth + 1) return;
      }
    };
    fit();
    const ro = new ResizeObserver(fit);
    ro.observe(el);
    document.fonts?.ready.then(fit).catch(() => {});
    return () => ro.disconnect();
  }, []);

  const home = (e: React.MouseEvent) => {
    /* Already on the microsite's own page: back to its top rather than a reload. */
    if (window.location.pathname.replace(/\/+$/, '') === site.root) { e.preventDefault(); window.scrollTo({ top: 0 }); history.replaceState(null, '', site.root); }
    setOpen(false);
  };

  return (
    <MicrositeContext.Provider value={site}>
      <div className="dc ind ms" data-industry={site.id} data-microsite={site.id}>
        <HelpLauncher signedIn={false} />
        <Starfield />

        <header ref={navRef} className={`dc-nav ms-nav${stuck ? ' stuck' : ''}`}>
          <a className="dc-brand" href={site.root} onClick={home} aria-label={`Protected Central ${site.tag} — home`} data-testid="ms-logo">
            <LogoMark size={26} />
            <span>Protected Central</span>
            <b className="ms-tag">{site.tag}</b>
          </a>
          <nav className="dc-links" aria-label={`${site.tag} site`}>
            <a href={site.root} onClick={home}>Home</a>
            {site.nav.map(l => <a key={l.href} href={l.href}>{l.label}</a>)}
          </nav>
          <div className="dc-nav-cta">
            {site.signIn && <a className="dc-btn dc-btn-ghost ms-signin" href={appHref('/login')} {...cross(appHref('/login'))}>Sign in</a>}
            <a className="dc-btn dc-btn-primary ms-book" href={call.href} data-testid="nav-book">
              <span className="dc-cta-long">{call.closed ? 'Write to us' : site.bookShort}</span><span className="dc-cta-short" aria-hidden="true">{call.closed ? 'Write to us' : 'Book a call'}</span>
            </a>
            <button type="button" className="ms-menu-btn" aria-label={open ? 'Close menu' : 'Open menu'} aria-expanded={open} aria-controls="ms-menu" onClick={() => setOpen(o => !o)}>
              {open ? <X size={20} /> : <Menu size={20} />}
            </button>
          </div>
        </header>

        {open && (
          <div className="ms-menu" id="ms-menu" role="dialog" aria-label="Menu" onClick={e => { if ((e.target as HTMLElement).tagName === 'A') setOpen(false); }}>
            <a href={site.root} onClick={home}>Home</a>
            {site.nav.map(l => <a key={l.href} href={l.href}>{l.label}</a>)}
            <a className="dc-btn dc-btn-primary" href={call.href}>{call.closed ? site.writeLabel : site.bookLabel}</a>
            {site.signIn && <a className="ms-menu-quiet" href={appHref('/login')} {...cross(appHref('/login'))}>Sign in</a>}
          </div>
        )}

        <main>{children}</main>

        <footer className="dc-foot ms-foot">
          <div className="dc-foot-cols">
            <div className="dc-foot-brand">
              <a className="dc-brand" href={site.root} onClick={home}><LogoMark size={24} /><span>Protected Central</span><b className="ms-tag">{site.tag}</b></a>
              <p>{site.footerLine}</p>
            </div>
            <div>
              <h5>On this site</h5>
              <a href={site.root} onClick={home}>Home</a>
              {site.nav.map(l => <a key={l.href} href={l.href}>{l.label}</a>)}
            </div>
            <div>
              <h5>Talk to us</h5>
              <a href={call.href}>{call.closed ? site.writeLabel : site.bookLabel}</a>
              {site.signIn && <a href={appHref('/login')} {...cross(appHref('/login'))}>Sign in</a>}
            </div>
            <div>
              <h5>Legal</h5>
              <a href="/privacy">Privacy policy</a>
              <a href="/terms-of-service">Terms of service</a>
              {site.growthTerms && <a href="/growth-service-terms">Growth service terms</a>}
              <a href="/security">Security &amp; privacy</a>
            </div>
          </div>
          <div className="dc-foot-base">
            <span>© {new Date().getFullYear()} Protected Central</span>
            <span>{site.tag}</span>
          </div>
        </footer>
      </div>
    </MicrositeContext.Provider>
  );
}
