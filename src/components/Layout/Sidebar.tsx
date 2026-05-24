import React from 'react';
import { NavLink } from 'react-router-dom';
import {
  LayoutDashboard, Users, MessageSquare, Calendar, TrendingUp,
  Mail, Funnel, BarChart3, Star, Settings, ChevronRight, Zap, CalendarCheck, Globe
} from 'lucide-react';

const navItems = [
  { path: '/', icon: LayoutDashboard, label: 'Dashboard' },
  { path: '/contacts', icon: Users, label: 'Contacts' },
  { path: '/conversations', icon: MessageSquare, label: 'Conversations' },
  { path: '/calendar', icon: Calendar, label: 'Calendar' },
  { path: '/scheduling', icon: CalendarCheck, label: 'Scheduling' },
  { path: '/pipelines', icon: TrendingUp, label: 'Pipelines' },
  { path: '/marketing', icon: Mail, label: 'Marketing' },
  { path: '/funnels', icon: Funnel, label: 'Funnels' },
  { path: '/websites', icon: Globe, label: 'Websites' },
  { path: '/analytics', icon: BarChart3, label: 'Analytics' },
  { path: '/reputation', icon: Star, label: 'Reputation' },
  { path: '/settings', icon: Settings, label: 'Settings' },
];

export default function Sidebar() {
  return (
    <aside style={{ width: '240px', minHeight: '100vh', backgroundColor: '#0f172a', display: 'flex', flexDirection: 'column', position: 'fixed', left: 0, top: 0, zIndex: 50 }}>
      <div style={{ padding: '24px 20px', borderBottom: '1px solid rgba(255,255,255,0.1)' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          <div style={{ width: '36px', height: '36px', borderRadius: '10px', background: 'linear-gradient(135deg, #6366f1, #8b5cf6)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <Zap size={20} color="white" />
          </div>
          <div>
            <div style={{ color: 'white', fontWeight: 700, fontSize: '16px', letterSpacing: '-0.3px' }}>CRMPro</div>
            <div style={{ color: '#64748b', fontSize: '11px' }}>Business Suite</div>
          </div>
        </div>
      </div>

      <nav style={{ flex: 1, padding: '16px 12px', overflowY: 'auto' }}>
        <div style={{ marginBottom: '8px', padding: '0 8px', color: '#475569', fontSize: '11px', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.5px' }}>
          Main Menu
        </div>
        {navItems.map(({ path, icon: Icon, label }) => (
          <NavLink
            key={path}
            to={path}
            end={path === '/'}
            style={({ isActive }) => ({
              display: 'flex', alignItems: 'center', gap: '10px', padding: '10px 12px',
              borderRadius: '8px', marginBottom: '2px', textDecoration: 'none',
              color: isActive ? 'white' : '#94a3b8',
              backgroundColor: isActive ? 'rgba(99,102,241,0.15)' : 'transparent',
              borderLeft: isActive ? '3px solid #6366f1' : '3px solid transparent',
              fontWeight: isActive ? 600 : 400,
              fontSize: '14px',
              transition: 'all 0.15s ease',
            })}
          >
            <Icon size={18} />
            <span style={{ flex: 1 }}>{label}</span>
            {path !== '/' && <ChevronRight size={14} style={{ opacity: 0.4 }} />}
          </NavLink>
        ))}
      </nav>

      <div style={{ padding: '16px 20px', borderTop: '1px solid rgba(255,255,255,0.08)' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          <div style={{ width: '32px', height: '32px', borderRadius: '50%', background: 'linear-gradient(135deg, #6366f1, #8b5cf6)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'white', fontSize: '13px', fontWeight: 600 }}>
            JD
          </div>
          <div>
            <div style={{ color: 'white', fontSize: '13px', fontWeight: 500 }}>John Doe</div>
            <div style={{ color: '#64748b', fontSize: '11px' }}>Admin</div>
          </div>
        </div>
      </div>
    </aside>
  );
}
