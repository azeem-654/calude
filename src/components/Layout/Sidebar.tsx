import { NavLink } from 'react-router-dom';
import {
  LayoutDashboard, Users, MessageSquare, Calendar, TrendingUp,
  Mail, Funnel, BarChart3, Star, Settings, Zap, CalendarCheck,
  PanelLeftClose, PanelLeftOpen, Menu, Scissors, Palette,
} from 'lucide-react';
import { useApp } from '../../context/AppContext';

const navGroups = [
  {
    label: 'Workspace',
    items: [
      { path: '/',              icon: LayoutDashboard, label: 'Dashboard' },
      { path: '/contacts',      icon: Users,           label: 'Contacts' },
      { path: '/conversations', icon: MessageSquare,   label: 'Conversations' },
      { path: '/calendar',      icon: Calendar,        label: 'Calendar' },
      { path: '/scheduling',    icon: CalendarCheck,   label: 'Scheduling' },
    ],
  },
  {
    label: 'Growth',
    items: [
      { path: '/pipelines', icon: TrendingUp, label: 'Pipelines' },
      { path: '/marketing', icon: Mail,       label: 'Marketing' },
      { path: '/funnels',   icon: Funnel,     label: 'Funnels' },
    ],
  },
  {
    label: 'Studio',
    items: [
      { path: '/ai-shorts',      icon: Scissors, label: 'AI Shorts' },
      { path: '/social-creator', icon: Palette,  label: 'Social Creator' },
    ],
  },
  {
    label: 'Insights',
    items: [
      { path: '/analytics',  icon: BarChart3, label: 'Analytics' },
      { path: '/reputation', icon: Star,      label: 'Reputation' },
    ],
  },
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
          width: '40px', height: '40px', borderRadius: '12px',
          background: 'linear-gradient(135deg, #6366f1, #8b5cf6)',
          border: 'none', cursor: 'pointer', display: 'flex',
          alignItems: 'center', justifyContent: 'center',
          boxShadow: '0 8px 24px rgba(99,102,241,0.35)',
        }}
      >
        <Menu size={20} color="white" />
      </button>
    );
  }

  const renderItem = ({ path, icon: Icon, label }: { path: string; icon: typeof Zap; label: string }) => (
    <NavLink
      key={path}
      to={path}
      end={path === '/'}
      title={isIcons ? label : undefined}
      className={({ isActive }) => `nav-item${isActive ? ' nav-item-active' : ''}`}
      style={({ isActive }) => ({
        gap: isFull ? '10px' : '0',
        padding: isIcons ? '10px 0' : '8px 10px',
        justifyContent: isIcons ? 'center' : 'flex-start',
        margin: isIcons ? '2px 8px' : '0 0 2px',
        borderRadius: '8px',
        color: isActive ? '#fff' : '#8b95a8',
        fontWeight: isActive ? 600 : 500,
        fontSize: '13px',
        letterSpacing: '-0.01em',
        position: 'relative',
      })}
    >
      {({ isActive }) => (
        <>
          <Icon size={isIcons ? 19 : 16} strokeWidth={isActive ? 2.2 : 1.8} style={{ flexShrink: 0 }} />
          {isFull && (
            <span style={{ flex: 1, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{label}</span>
          )}
        </>
      )}
    </NavLink>
  );

  return (
    <aside style={{
      width: `${width}px`,
      minHeight: '100vh',
      background: 'linear-gradient(180deg, #0d1424 0%, #0f172a 100%)',
      display: 'flex',
      flexDirection: 'column',
      position: 'fixed',
      left: 0, top: 0,
      zIndex: 50,
      transition: 'width 0.22s cubic-bezier(0.4,0,0.2,1)',
      overflow: 'hidden',
      borderRight: '1px solid rgba(255,255,255,0.06)',
    }}>

      {/* Logo row */}
      <div style={{
        padding: isFull ? '18px 14px 16px 18px' : '18px 0 14px',
        display: 'flex', alignItems: 'center',
        justifyContent: isIcons ? 'center' : 'space-between',
        gap: '8px', flexShrink: 0,
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px', minWidth: 0 }}>
          <div style={{
            width: '32px', height: '32px', borderRadius: '9px', flexShrink: 0,
            background: 'linear-gradient(135deg, #6366f1, #8b5cf6)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            boxShadow: '0 4px 12px rgba(99,102,241,0.35)',
          }}>
            <Zap size={17} color="white" fill="white" />
          </div>
          {isFull && (
            <div style={{ overflow: 'hidden' }}>
              <div style={{ color: 'white', fontWeight: 700, fontSize: '14.5px', letterSpacing: '-0.02em', whiteSpace: 'nowrap' }}>CRMPro</div>
              <div style={{ color: '#5f6b7f', fontSize: '10.5px', whiteSpace: 'nowrap' }}>Business Suite</div>
            </div>
          )}
        </div>

        {isFull && (
          <button
            onClick={cycleMode}
            title="Collapse to icons"
            style={{
              width: '26px', height: '26px', borderRadius: '7px', border: 'none',
              backgroundColor: 'transparent', cursor: 'pointer',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              color: '#5f6b7f', flexShrink: 0,
            }}
          >
            <PanelLeftClose size={15} />
          </button>
        )}
      </div>

      {/* Nav */}
      <nav style={{ flex: 1, padding: isIcons ? '4px 0' : '4px 12px 12px', overflowY: 'auto', overflowX: 'hidden' }}>
        {navGroups.map((group, gi) => (
          <div key={group.label} style={{ marginTop: gi === 0 ? 0 : isIcons ? 10 : 18 }}>
            {isFull ? (
              <div style={{ margin: '0 0 5px', padding: '0 10px', color: '#4b5568', fontSize: '10px', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.09em', whiteSpace: 'nowrap' }}>
                {group.label}
              </div>
            ) : (
              gi !== 0 && <div style={{ height: 1, background: 'rgba(255,255,255,0.06)', margin: '0 16px 10px' }} />
            )}
            {group.items.map(renderItem)}
          </div>
        ))}
      </nav>

      {/* Bottom: settings + user */}
      <div style={{ borderTop: '1px solid rgba(255,255,255,0.07)', flexShrink: 0, padding: isIcons ? '8px 0' : '8px 12px 10px' }}>
        {renderItem({ path: '/settings', icon: Settings, label: 'Settings' })}

        {isIcons && (
          <button
            onClick={cycleMode}
            title="Expand sidebar"
            style={{
              width: '100%', padding: '10px 0', border: 'none', backgroundColor: 'transparent',
              cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center',
              color: '#5f6b7f',
            }}
          >
            <PanelLeftOpen size={17} />
          </button>
        )}

        {isFull ? (
          <div style={{
            marginTop: '8px', padding: '8px 10px', display: 'flex', alignItems: 'center', gap: '10px',
            borderRadius: '10px', background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.06)',
          }}>
            <div style={{ position: 'relative', flexShrink: 0 }}>
              <div style={{
                width: '30px', height: '30px', borderRadius: '50%',
                background: 'linear-gradient(135deg, #6366f1, #8b5cf6)',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                color: 'white', fontSize: '11px', fontWeight: 700,
              }}>JD</div>
              <span style={{
                position: 'absolute', bottom: 0, right: 0, width: 8, height: 8, borderRadius: '50%',
                background: '#22c55e', border: '2px solid #0f172a',
              }} />
            </div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ color: '#e2e8f0', fontSize: '12.5px', fontWeight: 600, whiteSpace: 'nowrap', letterSpacing: '-0.01em' }}>John Doe</div>
              <div style={{ color: '#5f6b7f', fontSize: '10.5px' }}>Admin</div>
            </div>
          </div>
        ) : (
          <div style={{ padding: '8px 0 4px', display: 'flex', justifyContent: 'center' }}>
            <div style={{ position: 'relative' }}>
              <div style={{
                width: '28px', height: '28px', borderRadius: '50%',
                background: 'linear-gradient(135deg, #6366f1, #8b5cf6)',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                color: 'white', fontSize: '10px', fontWeight: 700,
              }}>JD</div>
              <span style={{
                position: 'absolute', bottom: 0, right: 0, width: 7, height: 7, borderRadius: '50%',
                background: '#22c55e', border: '2px solid #0f172a',
              }} />
            </div>
          </div>
        )}
      </div>
    </aside>
  );
}
