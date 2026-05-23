import { useState } from 'react';
import { X, AlertTriangle, CheckCircle, Info, ChevronDown, ChevronUp, Lightbulb } from 'lucide-react';
import type { ValidationResult } from '../../services/validationService';

interface Props {
  result: ValidationResult;
  onClose: () => void;
  title?: string;
}

export default function ValidationPopup({ result, onClose, title }: Props) {
  const [showDetails, setShowDetails] = useState(false);
  const isSuccess = result.success;
  const color = isSuccess ? '#16a34a' : '#dc2626';
  const bgColor = isSuccess ? '#f0fdf4' : '#fef2f2';
  const borderColor = isSuccess ? '#bbf7d0' : '#fecaca';

  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 600, display: 'flex', alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(15,23,42,0.6)' }}
      onClick={onClose}>
      <div style={{ backgroundColor: 'white', borderRadius: 16, width: '100%', maxWidth: 480, boxShadow: '0 24px 64px rgba(0,0,0,0.2)', overflow: 'hidden' }}
        onClick={e => e.stopPropagation()}>

        {/* Header */}
        <div style={{ padding: '18px 20px', borderBottom: '1px solid #e2e8f0', display: 'flex', alignItems: 'center', justifyContent: 'space-between', backgroundColor: '#f8fafc' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <div style={{ width: 34, height: 34, borderRadius: 10, backgroundColor: isSuccess ? '#dcfce7' : '#fee2e2', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              {isSuccess
                ? <CheckCircle size={18} color="#16a34a" />
                : <AlertTriangle size={18} color="#dc2626" />}
            </div>
            <div>
              <div style={{ fontSize: 15, fontWeight: 700, color: '#0f172a' }}>{title || (isSuccess ? 'Connection Successful' : 'Validation Failed')}</div>
              <div style={{ fontSize: 11, color: '#64748b', textTransform: 'uppercase', fontWeight: 600, letterSpacing: '0.3px' }}>
                {isSuccess ? 'All checks passed' : 'Action required'}
              </div>
            </div>
          </div>
          <button onClick={onClose} style={{ border: 'none', background: 'none', cursor: 'pointer', color: '#94a3b8', display: 'flex', padding: 4 }}>
            <X size={20} />
          </button>
        </div>

        {/* Body */}
        <div style={{ padding: '20px' }}>
          {/* Main message */}
          <div style={{ padding: '14px 16px', borderRadius: 10, backgroundColor: bgColor, border: `1px solid ${borderColor}`, marginBottom: 16 }}>
            <p style={{ margin: 0, fontSize: 14, color, fontWeight: 600, lineHeight: 1.5 }}>{result.message}</p>
          </div>

          {/* Details (collapsible) */}
          {result.details && (
            <div style={{ marginBottom: 14 }}>
              <button onClick={() => setShowDetails(p => !p)}
                style={{ display: 'flex', alignItems: 'center', gap: 6, border: 'none', background: 'none', cursor: 'pointer', color: '#64748b', fontSize: 13, padding: '4px 0', fontWeight: 500 }}>
                <Info size={14} />
                Technical details
                {showDetails ? <ChevronUp size={13} /> : <ChevronDown size={13} />}
              </button>
              {showDetails && (
                <div style={{ marginTop: 8, padding: '12px 14px', backgroundColor: '#f8fafc', borderRadius: 8, border: '1px solid #e2e8f0', fontFamily: 'monospace', fontSize: 12, color: '#374151', lineHeight: 1.6, wordBreak: 'break-all' }}>
                  {result.details}
                  {result.errorCode && <div style={{ marginTop: 6, color: '#94a3b8' }}>Error code: {result.errorCode}</div>}
                </div>
              )}
            </div>
          )}

          {/* Suggestions */}
          {result.suggestions.length > 0 && (
            <div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 10 }}>
                <Lightbulb size={15} color="#f59e0b" />
                <span style={{ fontSize: 13, fontWeight: 700, color: '#374151' }}>
                  {isSuccess ? 'Tips' : 'How to fix this'}
                </span>
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {result.suggestions.map((s, i) => (
                  <div key={i} style={{ display: 'flex', gap: 10, padding: '10px 12px', backgroundColor: '#fffbeb', borderRadius: 8, border: '1px solid #fde68a' }}>
                    <div style={{ width: 18, height: 18, borderRadius: '50%', backgroundColor: '#f59e0b', color: 'white', fontSize: 10, fontWeight: 800, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, marginTop: 1 }}>{i + 1}</div>
                    <span style={{ fontSize: 13, color: '#374151', lineHeight: 1.5 }}>{s}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div style={{ padding: '14px 20px', borderTop: '1px solid #e2e8f0', display: 'flex', justifyContent: 'flex-end', backgroundColor: '#f8fafc' }}>
          <button onClick={onClose}
            style={{ padding: '9px 20px', backgroundColor: isSuccess ? '#16a34a' : '#6366f1', color: 'white', border: 'none', borderRadius: 8, fontSize: 13, fontWeight: 600, cursor: 'pointer' }}>
            {isSuccess ? 'Great, close' : 'Understood'}
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Inline status indicator ───────────────────────────────────────────────────
interface StatusIndicatorProps {
  status: 'idle' | 'testing' | 'success' | 'error';
  message?: string;
  onShowDetails?: () => void;
}

export function ValidationStatusIndicator({ status, message, onShowDetails }: StatusIndicatorProps) {
  if (status === 'idle') return null;
  const cfg = {
    testing: { color: '#6366f1', bg: '#eef2ff', icon: '⟳', label: 'Testing...' },
    success: { color: '#16a34a', bg: '#f0fdf4', icon: '✓', label: 'Connected' },
    error: { color: '#dc2626', bg: '#fef2f2', icon: '✗', label: 'Failed' },
  }[status];
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '6px 12px', backgroundColor: cfg.bg, borderRadius: 8, marginTop: 6 }}>
      <span style={{ fontSize: 13, fontWeight: 700, color: cfg.color }}>{cfg.icon} {cfg.label}</span>
      {message && <span style={{ fontSize: 12, color: cfg.color, flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{message}</span>}
      {status === 'error' && onShowDetails && (
        <button onClick={onShowDetails} style={{ fontSize: 11, color: cfg.color, border: 'none', background: 'none', cursor: 'pointer', fontWeight: 600, textDecoration: 'underline', whiteSpace: 'nowrap' }}>Details</button>
      )}
    </div>
  );
}
