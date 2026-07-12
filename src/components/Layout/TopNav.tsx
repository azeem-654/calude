import { useState, useRef, useEffect } from 'react';
import { NavLink, useNavigate, useLocation } from 'react-router-dom';
import {
  Layers, Search, Mail, Bell, ChevronDown, ChevronLeft,
  Share2, Star, Plus, Phone, Calendar as CalIcon, Send, TriangleAlert, Moon,
  Scissors, Palette, Settings as SettingsIcon, Building2, Check, ArrowLeftRight, LogOut,
} from 'lucide-react';
import { loadSubAccounts, activeAccount, switchAccount, activeBranding } from '../../services/tenancy';
import { getSession, logout } from '../../services/auth';

/* ═══ SugarCRM-style top navigation + floating icon rail ═══ */

const PRIMARY_NAV = [
  { path: '/',              label: 'Dashboard' },
  { path: '/contacts',      label: 'Contacts' },
  { path: '/conversations', label: 'Conversations' },
  { path: '/calendar',      label: 'Calendar' },
  { path: '/scheduling',    label: 'Scheduling' },
  { path: '/pipelines',     label: 'Pipelines' },
  { path: '/marketing',     label: 'Marketing' },
  { path: '/funnels',       label: 'Funnels' },
  { path: '/analytics',     label: 'Reports' },
];

const MORE_NAV = [
  { path: '/ai-shorts',      label: 'AI Shorts',      icon: Scissors,     desc: 'Turn videos into viral clips' },
  { path: '/social-creator', label: 'Social Creator', icon: Palette,      desc: 'AI social post designer' },
  { path: '/reputation',     label: 'Reputation',     icon: Star,         desc: 'Reviews & ratings' },
  { path: '/settings',       label: 'Settings',       icon: SettingsIcon, desc: 'Email, SMS & workspace' },
];

const circleBtn: React.CSSProperties = {
  width: 40, height: 40, borderRadius: 999, border: 'none',
  backgroundColor: '#fff', cursor: 'pointer',
  display: 'flex', alignItems: 'center', justifyContent: 'center',
  color: '#17191c', boxShadow: '0 1px 2px rgba(23,25,28,0.06)',
};

export default function TopNav() {
  const [moreOpen, setMoreOpen] = useState(false);
  const [acctOpen, setAcctOpen] = useState(false);
  const moreRef = useRef<HTMLDivElement>(null);
  const acctRef = useRef<HTMLDivElement>(null);
  const location = useLocation();
  const navigate = useNavigate();
  const moreActive = MORE_NAV.some(n => location.pathname.startsWith(n.path));
  const session = getSession();
  const isClient = session?.user.role === 'client';
  const accounts = loadSubAccounts();
  const active = activeAccount();
  const brand = activeBranding();
  const [userOpen, setUserOpen] = useState(false);
  const userRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const close = (e: MouseEvent) => {
      if (moreRef.current && !moreRef.current.contains(e.target as Node)) setMoreOpen(false);
      if (acctRef.current && !acctRef.current.contains(e.target as Node)) setAcctOpen(false);
      if (userRef.current && !userRef.current.contains(e.target as Node)) setUserOpen(false);
    };
    document.addEventListener('mousedown', close);
    return () => document.removeEventListener('mousedown', close);
  }, []);

  return (
    <header style={{
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

      {/* Nav pills — white capsule segmented control */}
      <nav style={{
        display: 'flex', alignItems: 'center', gap: 2, minWidth: 0,
        margin: '0 auto', padding: 4, borderRadius: 999,
        backgroundColor: '#fff', boxShadow: '0 2px 10px rgba(23,25,28,0.07)',
      }}>
        {PRIMARY_NAV.map(item => (
          <NavLink
            key={item.path}
            to={item.path}
            end={item.path === '/'}
            className={({ isActive }) => `pill-link${isActive ? ' pill-active' : ''}`}
            style={({ isActive }) => ({
              padding: '8px 14px', borderRadius: 999, textDecoration: 'none',
              fontSize: 13, fontWeight: isActive ? 700 : 500, whiteSpace: 'nowrap',
              color: isActive ? '#fff' : '#3b3f45',
              backgroundColor: isActive ? '#17191c' : 'transparent',
              boxShadow: isActive ? '0 3px 10px rgba(23,25,28,0.28)' : 'none',
              transition: 'background-color 0.15s ease, color 0.15s ease, box-shadow 0.15s ease',
              letterSpacing: '-0.01em',
            })}
          >
            {item.label}
          </NavLink>
        ))}

        {/* More dropdown */}
        <div ref={moreRef} style={{ position: 'relative' }}>
          <button
            onClick={() => setMoreOpen(v => !v)}
            className={`pill-link${moreActive ? ' pill-active' : ''}`}
            style={{
              display: 'flex', alignItems: 'center', gap: 4,
              padding: '8px 14px', borderRadius: 999, border: 'none', cursor: 'pointer',
              fontSize: 13, fontWeight: moreActive ? 700 : 500, fontFamily: 'inherit',
              color: moreActive ? '#fff' : '#3b3f45',
              backgroundColor: moreActive ? '#17191c' : 'transparent',
              boxShadow: moreActive ? '0 3px 10px rgba(23,25,28,0.28)' : 'none',
              letterSpacing: '-0.01em',
            }}
          >
            More <ChevronDown size={13} style={{ transform: moreOpen ? 'rotate(180deg)' : 'none', transition: 'transform 0.15s' }} />
          </button>
          {moreOpen && (
            <div style={{
              position: 'absolute', top: 'calc(100% + 8px)', right: 0,
              backgroundColor: '#fff', borderRadius: 20, padding: 8, minWidth: 250, zIndex: 300,
              boxShadow: '0 16px 40px -8px rgba(23,25,28,0.18)',
            }}>
              {MORE_NAV.map(item => {
                const Icon = item.icon;
                return (
                  <NavLink
                    key={item.path}
                    to={item.path}
                    onClick={() => setMoreOpen(false)}
                    className="more-nav-item"
                    style={({ isActive }) => ({
                      display: 'flex', alignItems: 'center', gap: 12,
                      padding: '10px 12px', borderRadius: 14, textDecoration: 'none',
                      backgroundColor: isActive ? '#17191c' : 'transparent',
                    })}
                  >
                    {({ isActive }) => (
                      <>
                        <span style={{
                          width: 34, height: 34, borderRadius: 999, flexShrink: 0,
                          backgroundColor: isActive ? 'rgba(255,255,255,0.14)' : '#f0f1f3',
                          display: 'flex', alignItems: 'center', justifyContent: 'center',
                        }}>
                          <Icon size={15} color={isActive ? '#fff' : '#17191c'} strokeWidth={2} />
                        </span>
                        <span style={{ minWidth: 0 }}>
                          <span style={{ display: 'block', fontSize: 13, fontWeight: 700, color: isActive ? '#fff' : '#17191c', letterSpacing: '-0.01em' }}>{item.label}</span>
                          <span style={{ display: 'block', fontSize: 11, color: isActive ? 'rgba(255,255,255,0.6)' : '#8a8f98', marginTop: 1 }}>{item.desc}</span>
                        </span>
                      </>
                    )}
                  </NavLink>
                );
              })}
            </div>
          )}
        </div>
      </nav>

      {/* Right: circular icon buttons + avatar */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0 }}>
        <button title="Search" style={circleBtn}><Search size={16} strokeWidth={2.2} /></button>
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
    </header>
  );
}

/* ── Floating left icon rail — grouped quick actions ── */
export function IconRail() {
  const navigate = useNavigate();
  const location = useLocation();

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
      { icon: Plus, tip: 'New contact', path: '/contacts', onClick: () => navigate('/contacts') },
      { icon: Send, tip: 'New campaign', path: '/marketing', onClick: () => navigate('/marketing') },
      { icon: CalIcon, tip: 'New appointment', path: '/calendar', onClick: () => navigate('/calendar') },
    ],
    /* Monitor */
    [
      { icon: Phone, tip: 'Conversations', path: '/conversations', onClick: () => navigate('/conversations') },
      { icon: TriangleAlert, tip: 'Analytics & reports', path: '/analytics', onClick: () => navigate('/analytics') },
      { icon: Star, tip: 'Reputation & reviews', path: '/reputation', onClick: () => navigate('/reputation') },
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
        <button className="rail-btn" data-tip="Dark mode — coming soon"
          style={{ ...railBtn(false), backgroundColor: '#17191c', color: '#fff' }}>
          <Moon size={15} strokeWidth={2} />
        </button>
      </div>
    </div>
  );
}
