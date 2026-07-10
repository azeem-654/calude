import { useState, useRef, useEffect } from 'react';
import { NavLink, useNavigate, useLocation } from 'react-router-dom';
import {
  Layers, Search, Mail, Bell, ChevronDown, ChevronLeft,
  Share2, Star, Plus, Phone, Calendar as CalIcon, Send, TriangleAlert, Moon,
} from 'lucide-react';

/* ═══ SugarCRM-style top navigation + floating icon rail ═══ */

const PRIMARY_NAV = [
  { path: '/',              label: 'Dashboard' },
  { path: '/contacts',      label: 'Contacts' },
  { path: '/conversations', label: 'Conversations' },
  { path: '/calendar',      label: 'Calendar' },
  { path: '/pipelines',     label: 'Pipelines' },
  { path: '/marketing',     label: 'Marketing' },
  { path: '/analytics',     label: 'Reports' },
];

const MORE_NAV = [
  { path: '/scheduling',     label: 'Scheduling' },
  { path: '/funnels',        label: 'Funnels' },
  { path: '/ai-shorts',      label: 'AI Shorts' },
  { path: '/social-creator', label: 'Social Creator' },
  { path: '/reputation',     label: 'Reputation' },
  { path: '/settings',       label: 'Settings' },
];

const circleBtn: React.CSSProperties = {
  width: 40, height: 40, borderRadius: 999, border: 'none',
  backgroundColor: '#fff', cursor: 'pointer',
  display: 'flex', alignItems: 'center', justifyContent: 'center',
  color: '#17191c', boxShadow: '0 1px 2px rgba(23,25,28,0.06)',
};

export default function TopNav() {
  const [moreOpen, setMoreOpen] = useState(false);
  const moreRef = useRef<HTMLDivElement>(null);
  const location = useLocation();
  const moreActive = MORE_NAV.some(n => location.pathname.startsWith(n.path));

  useEffect(() => {
    const close = (e: MouseEvent) => {
      if (moreRef.current && !moreRef.current.contains(e.target as Node)) setMoreOpen(false);
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
      {/* Logo */}
      <NavLink to="/" style={{ display: 'flex', alignItems: 'center', gap: 8, textDecoration: 'none', flexShrink: 0 }}>
        <Layers size={22} color="#17191c" strokeWidth={2.4} />
        <span style={{ fontSize: 18, fontWeight: 800, color: '#17191c', letterSpacing: '-0.03em' }}>crmpro</span>
      </NavLink>

      {/* Nav pills */}
      <nav style={{ display: 'flex', alignItems: 'center', gap: 2, flex: 1, justifyContent: 'center', minWidth: 0, overflow: 'hidden' }}>
        {PRIMARY_NAV.map(item => (
          <NavLink
            key={item.path}
            to={item.path}
            end={item.path === '/'}
            style={({ isActive }) => ({
              padding: '9px 16px', borderRadius: 999, textDecoration: 'none',
              fontSize: 13.5, fontWeight: isActive ? 700 : 500, whiteSpace: 'nowrap',
              color: isActive ? '#fff' : '#17191c',
              backgroundColor: isActive ? '#17191c' : 'transparent',
              transition: 'background-color 0.15s ease, color 0.15s ease',
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
            style={{
              display: 'flex', alignItems: 'center', gap: 4,
              padding: '9px 14px', borderRadius: 999, border: 'none', cursor: 'pointer',
              fontSize: 13.5, fontWeight: moreActive ? 700 : 500, fontFamily: 'inherit',
              color: moreActive ? '#fff' : '#17191c',
              backgroundColor: moreActive ? '#17191c' : 'transparent',
              letterSpacing: '-0.01em',
            }}
          >
            More <ChevronDown size={13} style={{ transform: moreOpen ? 'rotate(180deg)' : 'none', transition: 'transform 0.15s' }} />
          </button>
          {moreOpen && (
            <div style={{
              position: 'absolute', top: 'calc(100% + 8px)', left: '50%', transform: 'translateX(-50%)',
              backgroundColor: '#fff', borderRadius: 18, padding: 6, minWidth: 180, zIndex: 300,
              boxShadow: '0 16px 40px -8px rgba(23,25,28,0.18)',
            }}>
              {MORE_NAV.map(item => (
                <NavLink
                  key={item.path}
                  to={item.path}
                  onClick={() => setMoreOpen(false)}
                  className="more-nav-item"
                  style={({ isActive }) => ({
                    display: 'block', padding: '10px 14px', borderRadius: 12, textDecoration: 'none',
                    fontSize: 13.5, fontWeight: isActive ? 700 : 500,
                    color: isActive ? '#fff' : '#17191c',
                    backgroundColor: isActive ? '#17191c' : 'transparent',
                  })}
                >
                  {item.label}
                </NavLink>
              ))}
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
        <div style={{
          width: 40, height: 40, borderRadius: 999, overflow: 'hidden', cursor: 'pointer',
          boxShadow: '0 1px 2px rgba(23,25,28,0.1)', flexShrink: 0, position: 'relative',
          background: 'linear-gradient(135deg,#6366f1,#8b5cf6)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          color: '#fff', fontSize: 13, fontWeight: 800,
        }}>
          <img src="https://i.pravatar.cc/80?img=12" alt="" width={40} height={40}
            style={{ position: 'absolute', inset: 0, objectFit: 'cover' }}
            onError={e => { (e.currentTarget as HTMLImageElement).style.display = 'none'; }} />
          <span>JD</span>
        </div>
      </div>
    </header>
  );
}

/* ── Floating left icon rail ── */
export function IconRail() {
  const navigate = useNavigate();
  const rail: { icon: typeof Plus; title: string; onClick: () => void }[] = [
    { icon: ChevronLeft,   title: 'Back',            onClick: () => window.history.back() },
    { icon: Share2,        title: 'Share this view', onClick: () => { navigator.clipboard?.writeText(window.location.href).catch(() => {}); } },
    { icon: Star,          title: 'Reputation',      onClick: () => navigate('/reputation') },
    { icon: Plus,          title: 'New contact',     onClick: () => navigate('/contacts') },
    { icon: Phone,         title: 'Conversations',   onClick: () => navigate('/conversations') },
    { icon: CalIcon,       title: 'Calendar',        onClick: () => navigate('/calendar') },
    { icon: Send,          title: 'Marketing',       onClick: () => navigate('/marketing') },
    { icon: TriangleAlert, title: 'Analytics',       onClick: () => navigate('/analytics') },
  ];
  return (
    <div style={{
      position: 'fixed', left: 16, top: '50%', transform: 'translateY(-50%)', zIndex: 90,
      display: 'flex', flexDirection: 'column', gap: 8, alignItems: 'center',
    }}>
      {rail.map(({ icon: Icon, title, onClick }) => (
        <button key={title} title={title} onClick={onClick} style={{ ...circleBtn, width: 38, height: 38, color: '#3b3f45' }}>
          <Icon size={15} strokeWidth={2} />
        </button>
      ))}
      <button title="Theme" style={{ ...circleBtn, width: 38, height: 38, backgroundColor: '#17191c', color: '#fff', marginTop: 8 }}>
        <Moon size={15} strokeWidth={2} />
      </button>
    </div>
  );
}
