import React from 'react';
import { Bell, Search, Plus } from 'lucide-react';
import { useApp } from '../../context/AppContext';

interface HeaderProps {
  title: string;
  subtitle?: string;
}

export default function Header({ title, subtitle }: HeaderProps) {
  const { notifications, dismissNotification } = useApp();

  return (
    <>
      <header style={{ backgroundColor: 'white', borderBottom: '1px solid #e2e8f0', padding: '16px 28px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', position: 'sticky', top: 0, zIndex: 40 }}>
        <div>
          <h1 style={{ fontSize: '22px', fontWeight: 700, color: '#0f172a', margin: 0 }}>{title}</h1>
          {subtitle && <p style={{ fontSize: '13px', color: '#64748b', margin: '2px 0 0' }}>{subtitle}</p>}
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          <div style={{ position: 'relative' }}>
            <Search size={16} style={{ position: 'absolute', left: '10px', top: '50%', transform: 'translateY(-50%)', color: '#94a3b8' }} />
            <input
              placeholder="Search..."
              style={{ paddingLeft: '32px', paddingRight: '12px', paddingTop: '8px', paddingBottom: '8px', border: '1px solid #e2e8f0', borderRadius: '8px', fontSize: '13px', outline: 'none', width: '220px', color: '#374151', backgroundColor: '#f8fafc' }}
            />
          </div>
          <button style={{ position: 'relative', padding: '8px', border: '1px solid #e2e8f0', borderRadius: '8px', backgroundColor: 'white', cursor: 'pointer', display: 'flex', alignItems: 'center' }}>
            <Bell size={18} color="#64748b" />
            <span style={{ position: 'absolute', top: '4px', right: '4px', width: '8px', height: '8px', backgroundColor: '#ef4444', borderRadius: '50%' }} />
          </button>
          <div style={{ width: '36px', height: '36px', borderRadius: '50%', background: 'linear-gradient(135deg, #6366f1, #8b5cf6)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'white', fontSize: '13px', fontWeight: 600, cursor: 'pointer' }}>
            JD
          </div>
        </div>
      </header>

      {notifications.length > 0 && (
        <div style={{ position: 'fixed', top: '80px', right: '24px', zIndex: 1000, display: 'flex', flexDirection: 'column', gap: '8px' }}>
          {notifications.map(n => (
            <div
              key={n.id}
              onClick={() => dismissNotification(n.id)}
              style={{
                padding: '12px 16px', borderRadius: '10px', cursor: 'pointer', boxShadow: '0 4px 20px rgba(0,0,0,0.15)',
                backgroundColor: n.type === 'success' ? '#ecfdf5' : n.type === 'error' ? '#fef2f2' : '#eff6ff',
                borderLeft: `4px solid ${n.type === 'success' ? '#22c55e' : n.type === 'error' ? '#ef4444' : '#3b82f6'}`,
                color: '#1e293b', fontSize: '13px', fontWeight: 500, maxWidth: '320px',
                animation: 'slideIn 0.3s ease',
              }}
            >
              {n.message}
            </div>
          ))}
        </div>
      )}

      <style>{`
        @keyframes slideIn {
          from { transform: translateX(100%); opacity: 0; }
          to { transform: translateX(0); opacity: 1; }
        }
      `}</style>
    </>
  );
}
