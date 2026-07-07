import { Bell, Search, CheckCircle2, AlertCircle, Info } from 'lucide-react';
import { useApp } from '../../context/AppContext';

interface HeaderProps {
  title: string;
  subtitle?: string;
}

export default function Header({ title, subtitle }: HeaderProps) {
  const { notifications, dismissNotification } = useApp();

  return (
    <>
      <header style={{
        backgroundColor: 'rgba(255,255,255,0.82)',
        backdropFilter: 'blur(12px)',
        WebkitBackdropFilter: 'blur(12px)',
        borderBottom: '1px solid #e9edf3',
        padding: '14px 28px',
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        position: 'sticky', top: 0, zIndex: 40,
      }}>
        <div style={{ minWidth: 0 }}>
          <h1 style={{ fontSize: '19px', fontWeight: 700, color: '#0f172a', margin: 0, letterSpacing: '-0.02em', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{title}</h1>
          {subtitle && <p style={{ fontSize: '12.5px', color: '#8492a6', margin: '1px 0 0', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{subtitle}</p>}
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flexShrink: 0 }}>
          <div style={{ position: 'relative' }}>
            <Search size={15} style={{ position: 'absolute', left: '11px', top: '50%', transform: 'translateY(-50%)', color: '#9aa5b5' }} />
            <input
              placeholder="Search..."
              style={{
                paddingLeft: '33px', paddingRight: '44px', paddingTop: '8px', paddingBottom: '8px',
                border: '1px solid #e6e9f0', borderRadius: '10px', fontSize: '13px', outline: 'none',
                width: '230px', color: '#374151', backgroundColor: '#f8fafc',
              }}
            />
            <kbd style={{
              position: 'absolute', right: '8px', top: '50%', transform: 'translateY(-50%)',
              fontSize: '10.5px', fontFamily: 'inherit', fontWeight: 600, color: '#9aa5b5',
              background: '#fff', border: '1px solid #e6e9f0', borderRadius: '5px',
              padding: '2px 5px', pointerEvents: 'none',
            }}>⌘K</kbd>
          </div>
          <button style={{
            position: 'relative', width: '36px', height: '36px', border: '1px solid #e6e9f0',
            borderRadius: '10px', backgroundColor: 'white', cursor: 'pointer',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
          }}>
            <Bell size={16} color="#64748b" />
            <span style={{
              position: 'absolute', top: '7px', right: '8px', width: '7px', height: '7px',
              backgroundColor: '#ef4444', borderRadius: '50%', border: '2px solid #fff', boxSizing: 'content-box',
            }} />
          </button>
          <div style={{
            width: '34px', height: '34px', borderRadius: '50%',
            background: 'linear-gradient(135deg, #6366f1, #8b5cf6)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            color: 'white', fontSize: '12px', fontWeight: 700, cursor: 'pointer',
            boxShadow: '0 2px 8px rgba(99,102,241,0.3)',
          }}>
            JD
          </div>
        </div>
      </header>

      {notifications.length > 0 && (
        <div style={{ position: 'fixed', top: '76px', right: '24px', zIndex: 1000, display: 'flex', flexDirection: 'column', gap: '8px', pointerEvents: 'none' }}>
          {notifications.map(n => {
            const Icon = n.type === 'success' ? CheckCircle2 : n.type === 'error' ? AlertCircle : Info;
            const color = n.type === 'success' ? '#16a34a' : n.type === 'error' ? '#dc2626' : '#2563eb';
            return (
              <div
                key={n.id}
                onClick={() => dismissNotification(n.id)}
                style={{
                  display: 'flex', alignItems: 'flex-start', gap: '10px',
                  padding: '12px 14px', borderRadius: '12px', cursor: 'pointer', pointerEvents: 'auto',
                  backgroundColor: '#fff',
                  border: '1px solid #e9edf3',
                  boxShadow: '0 12px 32px -8px rgba(16,24,40,0.18)',
                  color: '#1e293b', fontSize: '13px', fontWeight: 500, maxWidth: '340px', lineHeight: 1.45,
                  animation: 'slideInRight 0.28s cubic-bezier(0.16,1,0.3,1)',
                }}
              >
                <Icon size={16} color={color} style={{ flexShrink: 0, marginTop: 1 }} />
                <span>{n.message}</span>
              </div>
            );
          })}
        </div>
      )}
    </>
  );
}
