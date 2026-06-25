import { NavLink } from 'react-router-dom';
import {
  LayoutDashboard, Users, MessageSquare, Calendar, TrendingUp,
  Mail, Funnel, BarChart3, Star, Settings, Zap, CalendarCheck, Globe,
  PanelLeftClose, PanelLeftOpen, Menu, X, Scissors, Palette,
} from 'lucide-react';
import { useApp } from '../../context/AppContext';

const navItems = [
  { path: '/',              icon: LayoutDashboard, label: 'Dashboard' },
  { path: '/contacts',      icon: Users,           label: 'Contacts' },
  { path: '/conversations', icon: MessageSquare,   label: 'Conversations' },
  { path: '/calendar',      icon: Calendar,        label: 'Calendar' },
  { path: '/scheduling',    icon: CalendarCheck,   label: 'Scheduling' },
  { path: '/pipelines',     icon: TrendingUp,      label: 'Pipelines' },
  { path: '/marketing',     icon: Mail,            label: 'Marketing' },
  { path: '/funnels',       icon: Funnel,          label: 'Funnels' },
  { path: '/websites',      icon: Globe,           label: 'Websites' },
  { path: '/ai-shorts',       icon: Scissors,  label: 'AI Shorts' },
  { path: '/social-creator',  icon: Palette,   label: 'Social Creator' },
  { path: '/analytics',       icon: BarChart3, label: 'Analytics' },
  { path: '/reputation',    icon: Star,            label: 'Reputation' },
  { path: '/settings',      icon: Settings,        label: 'Settings' },
];

const MODE_CYCLE: Record<'full' | 'icons' | 'hidden', 'full' | 'icons' | 'hidden'> = {
  full: 'icons',
  icons: 'hidden',
  hidden: 'full',
};

const WIDTHS = { full: 240, icons: 64, hidden: 0 };

export default function Sidebar() {
  const { sidebarMode, setSidebarMode } = useApp();
  const width = WIDTHS[sidebarMode];
  const isFull = sidebarMode === 'full';
  const isIcons = sidebarMode === 'icons';
  const isHidden = sidebarMode === 'hidden';

  const cycleMode = () => setSidebarMode(MODE_CYCLE[sidebarMode]);

  /* Floating hamburger shown when sidebar is hidden */
  if (isHidden) {
    return (
      <button
        onClick={cycleMode}
        title="Show sidebar"
        style={{
          position: 'fixed', top: '16px', left: '16px', zIndex: 100,
          width: '40px', height: '40px', borderRadius: '10px',
          background: 'linear-gradient(135deg, #6366f1, #8b5cf6)',
          border: 'none', cursor: 'pointer', display: 'flex',
          alignItems: 'center', justifyContent: 'center',
          boxShadow: '0 4px 12px rgba(99,102,241,0.4)',
        }}
      >
        <Menu size={20} color="white" />
      </button>
    );
  }

  return (
    <aside style={{
      width: `${width}px`,
      minHeight: '100vh',
      backgroundColor: '#0f172a',
      display: 'flex',
      flexDirection: 'column',
      position: 'fixed',
      left: 0, top: 0,
      zIndex: 50,
      transition: 'width 0.22s cubic-bezier(0.4,0,0.2,1)',
      overflow: 'hidden',
    }}>

      {/* Logo row */}
      <div style={{
        padding: isFull ? '20px 16px 20px 20px' : '20px 0',
        borderBottom: '1px solid rgba(255,255,255,0.08)',
        display: 'flex', alignItems: 'center',
        justifyContent: isIcons ? 'center' : 'space-between',
        gap: '8px', flexShrink: 0,
      }}>
        {/* Logo mark */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px', minWidth: 0 }}>
          <div style={{
            width: '36px', height: '36px', borderRadius: '10px', flexShrink: 0,
            background: 'linear-gradient(135deg, #6366f1, #8b5cf6)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
          }}>
            <Zap size={20} color="white" />
          </div>
          {isFull && (
            <div style={{ overflow: 'hidden' }}>
              <div style={{ color: 'white', fontWeight: 700, fontSize: '16px', letterSpacing: '-0.3px', whiteSpace: 'nowrap' }}>CRMPro</div>
              <div style={{ color: '#64748b', fontSize: '11px', whiteSpace: 'nowrap' }}>Business Suite</div>
            </div>
          )}
        </div>

        {/* Toggle button — only in full mode (icons mode uses a small button at bottom) */}
        {isFull && (
          <button
            onClick={cycleMode}
            title="Collapse to icons"
            style={{
              width: '28px', height: '28px', borderRadius: '7px', border: 'none',
              backgroundColor: 'rgba(255,255,255,0.07)', cursor: 'pointer',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              color: '#94a3b8', flexShrink: 0,
            }}
          >
            <PanelLeftClose size={15} />
          </button>
        )}
      </div>

      {/* Nav */}
      <nav style={{ flex: 1, padding: isIcons ? '12px 0' : '12px 10px', overflowY: 'auto', overflowX: 'hidden' }}>
        {isFull && (
          <div style={{ marginBottom: '6px', padding: '0 8px', color: '#475569', fontSize: '10px', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.8px', whiteSpace: 'nowrap' }}>
            Main Menu
          </div>
        )}

        {navItems.map(({ path, icon: Icon, label }) => (
          <NavLink
            key={path}
            to={path}
            end={path === '/'}
            title={isIcons ? label : undefined}
            style={({ isActive }) => ({
              display: 'flex',
              alignItems: 'center',
              gap: isFull ? '10px' : '0',
              padding: isIcons ? '11px 0' : '9px 10px',
              justifyContent: isIcons ? 'center' : 'flex-start',
              borderRadius: isIcons ? '0' : '8px',
              marginBottom: isIcons ? '0' : '2px',
              textDecoration: 'none',
              color: isActive ? 'white' : '#94a3b8',
              backgroundColor: isActive
                ? isIcons ? 'rgba(99,102,241,0.2)' : 'rgba(99,102,241,0.15)'
                : 'transparent',
              borderLeft: !isIcons
                ? isActive ? '3px solid #6366f1' : '3px solid transparent'
                : isActive ? '3px solid #6366f1' : '3px solid transparent',
              fontWeight: isActive ? 600 : 400,
              fontSize: '13.5px',
              transition: 'all 0.12s ease',
              position: 'relative',
            })}
          >
            {({ isActive }) => (
              <>
                <Icon size={isIcons ? 20 : 17} style={{ flexShrink: 0, opacity: isActive ? 1 : 0.75 }} />
                {isFull && (
                  <span style={{ flex: 1, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{label}</span>
                )}
              </>
            )}
          </NavLink>
        ))}
      </nav>

      {/* Bottom: user row + toggle (icons mode) */}
      <div style={{
        borderTop: '1px solid rgba(255,255,255,0.08)',
        flexShrink: 0,
      }}>
        {/* Icon mode toggle button at bottom */}
        {isIcons && (
          <button
            onClick={cycleMode}
            title="Expand sidebar"
            style={{
              width: '100%', padding: '12px 0', border: 'none', backgroundColor: 'transparent',
              cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center',
              color: '#64748b', borderBottom: '1px solid rgba(255,255,255,0.06)',
            }}
          >
            <PanelLeftOpen size={18} />
          </button>
        )}

        {isFull ? (
          <div style={{ padding: '14px 20px', display: 'flex', alignItems: 'center', gap: '10px' }}>
            <div style={{
              width: '32px', height: '32px', borderRadius: '50%', flexShrink: 0,
              background: 'linear-gradient(135deg, #6366f1, #8b5cf6)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              color: 'white', fontSize: '12px', fontWeight: 700,
            }}>JD</div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ color: 'white', fontSize: '13px', fontWeight: 500, whiteSpace: 'nowrap' }}>John Doe</div>
              <div style={{ color: '#64748b', fontSize: '11px' }}>Admin</div>
            </div>
            <button
              onClick={cycleMode}
              title="Collapse to icons"
              style={{ border: 'none', background: 'none', cursor: 'pointer', color: '#64748b', padding: '4px', flexShrink: 0 }}
            >
              <X size={14} />
            </button>
          </div>
        ) : (
          <div style={{ padding: '12px 0', display: 'flex', justifyContent: 'center' }}>
            <div style={{
              width: '30px', height: '30px', borderRadius: '50%',
              background: 'linear-gradient(135deg, #6366f1, #8b5cf6)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              color: 'white', fontSize: '11px', fontWeight: 700,
            }}>JD</div>
          </div>
        )}
      </div>
    </aside>
  );
}
