import { useState, useRef, useEffect, useCallback } from 'react';
import { NavLink, useNavigate, useLocation } from 'react-router-dom';
import {
  Layers, Search, Mail, Bell, ChevronDown, ChevronLeft,
  Share2, Star, Plus, Phone, Calendar as CalIcon, Send, TriangleAlert, Moon,
  Settings as SettingsIcon, Building2, Check, ArrowLeftRight, LogOut, CreditCard, Sun,
} from 'lucide-react';
import CommandPalette from './CommandPalette';
import { NAV_GROUPS, activeGroupId, isItemActive } from './navModel';
import { loadSubAccounts, activeAccount, switchAccount, activeBranding } from '../../services/tenancy';
import { getSession, logout } from '../../services/auth';
import { getTheme, toggleTheme } from '../../services/theme';

/* ═══ SugarCRM-style top navigation + floating icon rail ═══ */

const circleBtn: React.CSSProperties = {
  width: 40, height: 40, borderRadius: 999, border: 'none',
  backgroundColor: '#fff', cursor: 'pointer',
  display: 'flex', alignItems: 'center', justifyContent: 'center',
  color: '#17191c', boxShadow: '0 1px 2px rgba(23,25,28,0.06)',
};

export default function TopNav() {
  /* The open panel remembers which address it was opened from. Going somewhere
     — including with the browser's own back button — therefore closes it,
     without an effect chasing the location after the fact. */
  const [openGroup, setOpenGroup] = useState<{ id: string; where: string } | null>(null);
  const [paletteOpen, setPaletteOpen] = useState(false);
  const [acctOpen, setAcctOpen] = useState(false);
  const navMenuRef = useRef<HTMLElement>(null);
  const acctRef = useRef<HTMLDivElement>(null);
  const location = useLocation();
  const navigate = useNavigate();
  const currentGroup = activeGroupId(location.pathname);
  const here = `${location.pathname}${location.search}`;
  const openId = openGroup?.where === here ? openGroup.id : null;
  const openPanel = (id: string | null) => setOpenGroup(id ? { id, where: here } : null);
  const session = getSession();
  const isClient = session?.user.role === 'client';
  const accounts = loadSubAccounts();
  const active = activeAccount();
  const brand = activeBranding();
  const [userOpen, setUserOpen] = useState(false);
  const userRef = useRef<HTMLDivElement>(null);
  const [theme, setTheme] = useState(getTheme());

  /**
   * Publish the bar's height as --app-nav-h.
   *
   * A full-height panel underneath this needs to know how much room is left,
   * and the answer is not a constant: the bar wraps to two rows below 900px.
   * Anything using `calc(100dvh - var(--app-nav-h))` then fills the viewport
   * exactly instead of overflowing by however tall this happens to be.
   */
  const navRef = useRef<HTMLElement>(null);
  useEffect(() => {
    const el = navRef.current;
    if (!el) return;
    const publish = () => document.documentElement.style.setProperty('--app-nav-h', `${el.offsetHeight}px`);
    publish();
    const ro = new ResizeObserver(publish);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  useEffect(() => {
    const close = (e: MouseEvent) => {
      if (navMenuRef.current && !navMenuRef.current.contains(e.target as Node)) setOpenGroup(null);
      if (acctRef.current && !acctRef.current.contains(e.target as Node)) setAcctOpen(false);
      if (userRef.current && !userRef.current.contains(e.target as Node)) setUserOpen(false);
    };
    document.addEventListener('mousedown', close);
    return () => document.removeEventListener('mousedown', close);
  }, []);

  /* ⌘K / Ctrl-K anywhere in the app, which is where people reach for it. */
  useEffect(() => {
    const key = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        setPaletteOpen(v => !v);
      }
    };
    window.addEventListener('keydown', key);
    return () => window.removeEventListener('keydown', key);
  }, []);

  const closePalette = useCallback(() => setPaletteOpen(false), []);

  return (
    <header ref={navRef} className="app-header" style={{
      position: 'sticky', top: 0, zIndex: 100,
      display: 'flex', alignItems: 'center', gap: 20,
      padding: '14px 28px',
      backgroundColor: 'rgba(233,235,238,0.85)',
      backdropFilter: 'blur(14px)',
      WebkitBackdropFilter: 'blur(14px)',
    }}>
      {/* Logo — white-labeled per workspace */}
      <NavLink to="/" style={{ display: 'flex', alignItems: 'center', gap: 8, textDecoration: 'none', flexShrink: 0 }}>
        {brand.logoUrl
          ? <img src={brand.logoUrl} alt="" style={{ height: 26, maxWidth: 150, objectFit: 'contain' }} onError={e => { (e.currentTarget as HTMLImageElement).style.display = 'none'; }} />
          : <><Layers size={22} color="#17191c" strokeWidth={2.4} /><span style={{ fontSize: 18, fontWeight: 800, color: '#17191c', letterSpacing: '-0.03em' }}>{brand.appName}</span></>}
      </NavLink>

      {/* Sub-account switcher — agency only */}
      {active && !isClient && (
        <div ref={acctRef} style={{ position: 'relative', flexShrink: 0 }}>
          <button onClick={() => setAcctOpen(v => !v)}
            style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '6px 10px 6px 8px', borderRadius: 999, border: 'none', cursor: 'pointer', background: '#fff', boxShadow: '0 1px 2px rgba(23,25,28,0.08)', maxWidth: 190 }}>
            <span style={{ width: 22, height: 22, borderRadius: 7, background: active.color, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff', fontSize: 11, fontWeight: 800, flexShrink: 0 }}>{(active.businessName || active.name || '?')[0].toUpperCase()}</span>
            <span style={{ fontSize: 12.5, fontWeight: 700, color: '#17191c', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{active.name}</span>
            <ChevronDown size={13} color="#8a8f98" style={{ transform: acctOpen ? 'rotate(180deg)' : 'none', transition: 'transform 0.15s', flexShrink: 0 }} />
          </button>
          {acctOpen && (
            <div style={{ position: 'absolute', top: 'calc(100% + 8px)', left: 0, background: '#fff', borderRadius: 16, padding: 6, minWidth: 250, zIndex: 300, boxShadow: '0 16px 40px -8px rgba(23,25,28,0.2)' }}>
              <button onClick={() => { setAcctOpen(false); navigate('/agency'); }}
                style={{ display: 'flex', alignItems: 'center', gap: 10, width: '100%', padding: '10px 12px', border: 'none', background: location.pathname === '/agency' ? '#f0f1f3' : 'none', borderRadius: 12, cursor: 'pointer', textAlign: 'left', marginBottom: 4 }}>
                <span style={{ width: 30, height: 30, borderRadius: 9, background: '#17191c', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}><Building2 size={15} color="#fff" /></span>
                <span style={{ flex: 1 }}>
                  <span style={{ display: 'block', fontSize: 13, fontWeight: 700, color: '#17191c' }}>Agency dashboard</span>
                  <span style={{ display: 'block', fontSize: 11, color: '#8a8f98' }}>Manage all clients & billing</span>
                </span>
                <ArrowLeftRight size={13} color="#8a8f98" />
              </button>
              <div style={{ fontSize: 10, fontWeight: 700, color: '#b0b4ba', textTransform: 'uppercase', letterSpacing: '0.06em', padding: '6px 12px 4px' }}>Switch workspace</div>
              <div style={{ maxHeight: 260, overflowY: 'auto' }}>
                {accounts.map(a => (
                  <button key={a.id} onClick={() => a.id === active.id ? setAcctOpen(false) : switchAccount(a.id)}
                    style={{ display: 'flex', alignItems: 'center', gap: 10, width: '100%', padding: '9px 12px', border: 'none', background: 'none', borderRadius: 12, cursor: 'pointer', textAlign: 'left' }}
                    onMouseEnter={e => (e.currentTarget.style.background = '#f6f7f8')} onMouseLeave={e => (e.currentTarget.style.background = 'none')}>
                    <span style={{ width: 26, height: 26, borderRadius: 8, background: a.color, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff', fontSize: 11, fontWeight: 800, flexShrink: 0 }}>{(a.businessName || a.name || '?')[0].toUpperCase()}</span>
                    <span style={{ flex: 1, minWidth: 0 }}>
                      <span style={{ display: 'block', fontSize: 12.5, fontWeight: 600, color: '#17191c', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{a.name}</span>
                      <span style={{ display: 'block', fontSize: 10.5, color: '#b0b4ba', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{a.businessName || a.industry || '—'}</span>
                    </span>
                    {a.id === active.id && <Check size={14} color="#17191c" />}
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {/*
        The module menu.

        Seven groups, every module inside one of them, nothing behind a "More".
        A group opens on hover so the whole product is a pointer-move away, and
        on click too, because a hover is not available on a phone. Groups of one
        (Dashboard, Reports) are plain links with no panel at all — a menu that
        opens to reveal a single row is a menu that wastes a movement.

        The panels are positioned against their own group and the row is allowed
        to wrap on a narrow screen (see index.css), so nothing is ever clipped
        by a scroll container — which is what forced the old split between the
        scrolling links and the "More" button.
      */}
      <nav
        ref={navMenuRef}
        className="nav-pills"
        aria-label="Modules"
        onMouseLeave={() => openPanel(null)}
        style={{
          display: 'flex', alignItems: 'center', gap: 2, minWidth: 0,
          margin: '0 auto', padding: 4, borderRadius: 999,
          backgroundColor: '#fff', boxShadow: '0 2px 10px rgba(23,25,28,0.07)',
        }}
      >
        {NAV_GROUPS.map((group, gi) => {
          const items = group.items.filter(i => !(i.agencyOnly && isClient));
          if (items.length === 0) return null;
          const on = currentGroup === group.id;
          const open = openId === group.id;

          const pill: React.CSSProperties = {
            display: 'flex', alignItems: 'center', gap: 4,
            padding: '8px 14px', borderRadius: 999, border: 'none', cursor: 'pointer',
            fontSize: 13, fontWeight: on ? 700 : 500, fontFamily: 'inherit',
            whiteSpace: 'nowrap', textDecoration: 'none',
            color: on ? '#fff' : '#3b3f45',
            backgroundColor: on ? '#17191c' : 'transparent',
            boxShadow: on ? '0 3px 10px rgba(23,25,28,0.28)' : 'none',
            transition: 'background-color 0.15s ease, color 0.15s ease, box-shadow 0.15s ease',
            letterSpacing: '-0.01em',
          };

          if (group.path) {
            return (
              <NavLink
                key={group.id}
                to={group.path}
                end={group.path === '/'}
                onPointerEnter={e => { if (e.pointerType === 'mouse') openPanel(null); }}
                className={`pill-link${on ? ' pill-active' : ''}`}
                style={pill}
              >
                {group.label}
              </NavLink>
            );
          }

          return (
            /* Opening on pointerenter only when the pointer is a mouse.
               A tap fires pointerenter too, so without the check the tap opened
               the panel and the click that followed it closed it again — the
               menu was unusable on a phone. */
            <div key={group.id} className="nav-group" style={{ position: 'relative', flexShrink: 0 }}
              onPointerEnter={e => { if (e.pointerType === 'mouse') openPanel(group.id); }}>
              <button
                type="button"
                aria-haspopup="true"
                aria-expanded={open}
                onClick={() => openPanel(open ? null : group.id)}
                onKeyDown={e => { if (e.key === 'Escape') openPanel(null); }}
                className={`pill-link${on ? ' pill-active' : ''}`}
                style={pill}
              >
                {group.label}
                <ChevronDown size={13} style={{ transform: open ? 'rotate(180deg)' : 'none', transition: 'transform 0.15s' }} />
              </button>

              {open && (
                <div
                  className="nav-panel"
                  role="menu"
                  aria-label={group.label}
                  style={{
                    position: 'absolute', top: 'calc(100% + 8px)', zIndex: 300,
                    /* Anchored by where the group sits in the row: a 288px card
                       centred under the first or last pill hangs off the side of
                       the bar on anything but a very wide screen. */
                    ...(gi <= 1
                      ? { left: 0 }
                      : gi >= NAV_GROUPS.length - 2
                        ? { right: 0 }
                        : { left: '50%', transform: 'translateX(-50%)' }),
                    backgroundColor: '#fff', borderRadius: 20, padding: 8, width: 288,
                    boxShadow: '0 16px 40px -8px rgba(23,25,28,0.18)',
                  }}
                >
                  {items.map(item => {
                    const Icon = item.icon;
                    const here = isItemActive(location.pathname, item);
                    return (
                      <button
                        key={item.path}
                        type="button"
                        role="menuitem"
                        onClick={() => { openPanel(null); navigate(item.path); }}
                        className="more-nav-item"
                        style={{
                          display: 'flex', alignItems: 'center', gap: 12, width: '100%',
                          padding: '10px 12px', borderRadius: 14, border: 'none', cursor: 'pointer',
                          textAlign: 'left', backgroundColor: here ? '#17191c' : 'transparent',
                        }}
                      >
                        <span style={{
                          width: 34, height: 34, borderRadius: 999, flexShrink: 0,
                          backgroundColor: here ? 'rgba(255,255,255,0.14)' : '#f0f1f3',
                          display: 'flex', alignItems: 'center', justifyContent: 'center',
                        }}>
                          <Icon size={15} color={here ? '#fff' : '#17191c'} strokeWidth={2} />
                        </span>
                        <span style={{ minWidth: 0 }}>
                          <span style={{ display: 'block', fontSize: 13, fontWeight: 700, color: here ? '#fff' : '#17191c', letterSpacing: '-0.01em' }}>{item.label}</span>
                          <span style={{ display: 'block', fontSize: 11, color: here ? 'rgba(255,255,255,0.6)' : '#8a8f98', marginTop: 1, lineHeight: 1.35 }}>{item.desc}</span>
                        </span>
                      </button>
                    );
                  })}
                </div>
              )}
            </div>
          );
        })}
      </nav>

      {/* Right: circular icon buttons + avatar */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0 }}>
        <button title={theme === 'dark' ? 'Light mode' : 'Dark mode'} data-noinvert onClick={() => setTheme(toggleTheme())} style={circleBtn}>
          {theme === 'dark' ? <Sun size={16} strokeWidth={2.2} /> : <Moon size={16} strokeWidth={2.2} />}
        </button>
        <button
          title="Go to a module (⌘K)"
          aria-label="Go to a module"
          onClick={() => setPaletteOpen(true)}
          style={circleBtn}
        >
          <Search size={16} strokeWidth={2.2} />
        </button>
        <button title="Inbox" style={circleBtn}><Mail size={16} strokeWidth={2.2} /></button>
        <button title="Notifications" style={{ ...circleBtn, position: 'relative' }}>
          <Bell size={16} strokeWidth={2.2} />
          <span style={{ position: 'absolute', top: 9, right: 10, width: 7, height: 7, borderRadius: 999, backgroundColor: '#e5484d', border: '2px solid #fff', boxSizing: 'content-box' }} />
        </button>
        <div ref={userRef} style={{ position: 'relative', flexShrink: 0 }}>
          <button onClick={() => setUserOpen(v => !v)} style={{
            width: 40, height: 40, borderRadius: 999, overflow: 'hidden', cursor: 'pointer', border: 'none', padding: 0,
            boxShadow: '0 1px 2px rgba(23,25,28,0.1)', position: 'relative',
            background: '#17191c', display: 'flex', alignItems: 'center', justifyContent: 'center',
            color: '#fff', fontSize: 13, fontWeight: 800,
          }}>
            {(session?.user.name || 'U').split(' ').map(w => w[0]).join('').slice(0, 2).toUpperCase()}
          </button>
          {userOpen && (
            <div style={{ position: 'absolute', top: 'calc(100% + 8px)', right: 0, background: '#fff', borderRadius: 16, padding: 6, minWidth: 220, zIndex: 300, boxShadow: '0 16px 40px -8px rgba(23,25,28,0.2)' }}>
              <div style={{ padding: '10px 12px' }}>
                <div style={{ fontSize: 13.5, fontWeight: 700, color: '#17191c' }}>{session?.user.name || 'User'}</div>
                <div style={{ fontSize: 11.5, color: '#8a8f98', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{session?.user.email}</div>
                <span style={{ display: 'inline-block', marginTop: 6, fontSize: 10, fontWeight: 800, padding: '2px 8px', borderRadius: 999, background: isClient ? '#eceff9' : '#e9f4e6', color: isClient ? '#3e63dd' : '#3f9142', textTransform: 'uppercase', letterSpacing: '0.05em' }}>{isClient ? 'Client' : 'Agency'}</span>
              </div>
              <NavLink to="/billing" onClick={() => setUserOpen(false)} style={{ display: 'flex', alignItems: 'center', gap: 9, padding: '9px 12px', borderRadius: 10, textDecoration: 'none', color: '#374151', fontSize: 13, fontWeight: 500 }}>
                <CreditCard size={14} /> Billing & subscription
              </NavLink>
              {!isClient && (
                <NavLink to="/settings" onClick={() => setUserOpen(false)} style={{ display: 'flex', alignItems: 'center', gap: 9, padding: '9px 12px', borderRadius: 10, textDecoration: 'none', color: '#374151', fontSize: 13, fontWeight: 500 }}>
                  <SettingsIcon size={14} /> Settings
                </NavLink>
              )}
              <button onClick={() => { logout().then(() => window.location.reload()); }} style={{ display: 'flex', alignItems: 'center', gap: 9, width: '100%', padding: '9px 12px', border: 'none', background: 'none', borderRadius: 10, cursor: 'pointer', color: '#e5484d', fontSize: 13, fontWeight: 600, textAlign: 'left' }}>
                <LogOut size={14} /> Sign out
              </button>
            </div>
          )}
        </div>
      </div>
      {paletteOpen && <CommandPalette onClose={closePalette} isClient={isClient} />}
    </header>
  );
}

/* ── Floating left icon rail — grouped quick actions ── */
export function IconRail() {
  const navigate = useNavigate();
  const location = useLocation();
  const [theme, setTheme] = useState(getTheme());

  const railBtn = (active: boolean): React.CSSProperties => ({
    width: 38, height: 38, borderRadius: 999, border: 'none', cursor: 'pointer',
    display: 'flex', alignItems: 'center', justifyContent: 'center',
    backgroundColor: active ? '#17191c' : 'transparent',
    color: active ? '#fff' : '#3b3f45',
    transition: 'background-color 0.13s ease, color 0.13s ease',
    flexShrink: 0,
  });

  const groups: { icon: typeof Plus; tip: string; path?: string; onClick: () => void }[][] = [
    /* Navigate & share */
    [
      { icon: ChevronLeft, tip: 'Go back', onClick: () => window.history.back() },
      { icon: Share2, tip: 'Copy link to this view', onClick: () => { navigator.clipboard?.writeText(window.location.href).catch(() => {}); } },
    ],
    /* Create */
    [
      { icon: Plus, tip: 'Contacts', path: '/contacts', onClick: () => navigate('/contacts') },
      { icon: Send, tip: 'Email campaigns', path: '/marketing', onClick: () => navigate('/marketing') },
      { icon: CalIcon, tip: 'Calendar', path: '/calendar', onClick: () => navigate('/calendar') },
    ],
    /* Monitor */
    [
      { icon: Phone, tip: 'Inbox', path: '/conversations', onClick: () => navigate('/conversations') },
      { icon: TriangleAlert, tip: 'Reports', path: '/analytics', onClick: () => navigate('/analytics') },
      { icon: Star, tip: 'Reviews', path: '/reputation', onClick: () => navigate('/reputation') },
    ],
  ];

  return (
    <div style={{
      position: 'fixed', left: 14, top: '50%', transform: 'translateY(-50%)', zIndex: 90,
      display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 10,
    }}>
      {/* Grouped capsule */}
      <div style={{
        display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4,
        padding: 6, borderRadius: 999, backgroundColor: '#fff',
        boxShadow: '0 4px 16px rgba(23,25,28,0.08)',
      }}>
        {groups.map((group, gi) => (
          <div key={gi} style={{ display: 'flex', flexDirection: 'column', gap: 4, alignItems: 'center' }}>
            {gi > 0 && <div style={{ width: 22, height: 1, backgroundColor: '#ecedf0', margin: '3px 0' }} />}
            {group.map(({ icon: Icon, tip, path, onClick }) => {
              const active = !!path && (path === '/' ? location.pathname === '/' : location.pathname.startsWith(path));
              return (
                <button key={tip} className="rail-btn" data-tip={tip} onClick={onClick} style={railBtn(active)}>
                  <Icon size={15} strokeWidth={2} />
                </button>
              );
            })}
          </div>
        ))}
      </div>

      {/* Settings + theme, separate pod */}
      <div style={{
        display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4,
        padding: 6, borderRadius: 999, backgroundColor: '#fff',
        boxShadow: '0 4px 16px rgba(23,25,28,0.08)',
      }}>
        <button className="rail-btn" data-tip="Settings" onClick={() => navigate('/settings')}
          style={railBtn(location.pathname.startsWith('/settings'))}>
          <SettingsIcon size={15} strokeWidth={2} />
        </button>
        <button className="rail-btn" data-tip={theme === 'dark' ? 'Light mode' : 'Dark mode'} data-noinvert
          onClick={() => setTheme(toggleTheme())}
          style={{ ...railBtn(false), backgroundColor: '#17191c', color: '#fff' }}>
          {theme === 'dark' ? <Sun size={15} strokeWidth={2} /> : <Moon size={15} strokeWidth={2} />}
        </button>
      </div>
    </div>
  );
}
