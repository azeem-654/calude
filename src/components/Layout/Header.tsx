import { CheckCircle2, AlertCircle, Info, type LucideIcon } from 'lucide-react';
import { useApp } from '../../context/AppContext';

export interface HeaderAction {
  icon: LucideIcon;
  /** Tooltip and accessible name — every action must say what it does. */
  label: string;
  onClick: () => void;
}

interface HeaderProps {
  title: string;
  subtitle?: string;
  /**
   * Optional quick actions. Screens that have a real action pass one; screens
   * that do not render nothing. Previously every screen showed a fixed
   * Add/Share/Schedule trio with no handlers at all — three buttons on sixteen
   * screens that looked interactive and did nothing when clicked.
   */
  actions?: HeaderAction[];
}

const miniBtn: React.CSSProperties = {
  width: 36, height: 36, borderRadius: 999, border: 'none',
  backgroundColor: '#fff', cursor: 'pointer',
  display: 'flex', alignItems: 'center', justifyContent: 'center',
  color: '#17191c', boxShadow: '0 1px 2px rgba(23,25,28,0.06)',
};

/** Floating toast stack. Rendered by Header, and standalone by full-screen
    views that don't use Header (e.g. the AI Shorts clip editor). */
export function Toasts() {
  const { notifications, dismissNotification } = useApp();

  return (
    <>
      {notifications.length > 0 && (
        <div style={{ position: 'fixed', top: 76, right: 24, zIndex: 1000, display: 'flex', flexDirection: 'column', gap: 8, pointerEvents: 'none' }}>
          {notifications.map(n => {
            const Icon = n.type === 'success' ? CheckCircle2 : n.type === 'error' ? AlertCircle : Info;
            const color = n.type === 'success' ? '#3f9142' : n.type === 'error' ? '#e5484d' : '#3e63dd';
            return (
              <div
                key={n.id}
                onClick={() => dismissNotification(n.id)}
                style={{
                  display: 'flex', alignItems: 'flex-start', gap: 10,
                  padding: '12px 14px', borderRadius: 16, cursor: 'pointer', pointerEvents: 'auto',
                  backgroundColor: '#fff',
                  boxShadow: '0 16px 40px -8px rgba(23,25,28,0.2)',
                  color: '#17191c', fontSize: 13, fontWeight: 500, maxWidth: 340, lineHeight: 1.45,
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

export default function Header({ title, subtitle, actions }: HeaderProps) {
  return (
    <>
      <div style={{
        padding: '18px 28px 4px',
        display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', gap: 16,
      }}>
        <div style={{ minWidth: 0 }}>
          <h1 style={{ fontSize: 26, fontWeight: 800, color: '#17191c', margin: 0, letterSpacing: '-0.03em', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{title}</h1>
          {subtitle && <p style={{ fontSize: 13, color: '#8a8f98', margin: '3px 0 0', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{subtitle}</p>}
        </div>
        {actions && actions.length > 0 && (
          <div style={{ display: 'flex', gap: 8, flexShrink: 0 }}>
            {actions.map(a => (
              <button key={a.label} title={a.label} aria-label={a.label} onClick={a.onClick} style={miniBtn}>
                <a.icon size={15} strokeWidth={2.2} />
              </button>
            ))}
          </div>
        )}
      </div>
      <Toasts />
    </>
  );
}
