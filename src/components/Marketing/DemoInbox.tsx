import { useState, useEffect, useCallback } from 'react';
import { X, Inbox, Trash2, RefreshCw, Mail, ChevronLeft } from 'lucide-react';
import { loadDemoEmails, clearDemoEmails } from '../../services/emailService';
import type { DemoEmail } from '../../services/emailService';

function formatTime(iso: string): string {
  const d = new Date(iso);
  const diff = Date.now() - d.getTime();
  if (diff < 60000) return 'Just now';
  if (diff < 3600000) return `${Math.floor(diff / 60000)}m ago`;
  if (diff < 86400000) return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  return d.toLocaleDateString([], { month: 'short', day: 'numeric' });
}

export default function DemoInbox({ onClose }: { onClose: () => void }) {
  const [emails, setEmails] = useState<DemoEmail[]>([]);
  const [selected, setSelected] = useState<DemoEmail | null>(null);
  const [showMobilePreview, setShowMobilePreview] = useState(false);

  const refresh = useCallback(() => {
    const e = loadDemoEmails();
    setEmails(e);
    if (e.length > 0 && !selected) setSelected(e[0]);
  }, [selected]);

  useEffect(() => { refresh(); }, []);

  const handleClear = () => {
    clearDemoEmails();
    setEmails([]);
    setSelected(null);
    setShowMobilePreview(false);
  };

  const handleSelect = (email: DemoEmail) => {
    setSelected(email);
    setShowMobilePreview(true);
  };

  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 300, display: 'flex', backgroundColor: 'rgba(15,23,42,0.55)' }}
      onClick={onClose}>
      <div style={{ marginLeft: 'auto', width: '100%', maxWidth: 920, height: '100%', backgroundColor: 'white', display: 'flex', flexDirection: 'column', boxShadow: '-8px 0 48px rgba(0,0,0,0.18)' }}
        onClick={e => e.stopPropagation()}>

        {/* Header */}
        <div style={{ padding: '14px 20px', borderBottom: '1px solid #e2e8f0', display: 'flex', alignItems: 'center', gap: 12, flexShrink: 0, backgroundColor: '#fafafa' }}>
          <div style={{ width: 36, height: 36, borderRadius: 10, background: 'linear-gradient(135deg, #0ea5e9, #6366f1)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
            <Inbox size={17} color="white" />
          </div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <h2 style={{ margin: 0, fontSize: 16, fontWeight: 700, color: '#0f172a' }}>Demo Inbox</h2>
              <span style={{ fontSize: 10, padding: '2px 8px', borderRadius: 20, backgroundColor: '#dcfce7', color: '#16a34a', fontWeight: 700 }}>NO REAL EMAILS SENT</span>
            </div>
            <p style={{ margin: 0, fontSize: 12, color: '#64748b' }}>
              {emails.length} email{emails.length !== 1 ? 's' : ''} captured · All campaigns in Demo Mode send here
            </p>
          </div>
          <button onClick={refresh} title="Refresh"
            style={{ border: 'none', background: 'none', cursor: 'pointer', padding: 7, borderRadius: 7, color: '#64748b', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <RefreshCw size={15} />
          </button>
          {emails.length > 0 && (
            <button onClick={handleClear}
              style={{ display: 'flex', alignItems: 'center', gap: 5, padding: '6px 12px', border: '1px solid #fecaca', borderRadius: 7, backgroundColor: '#fef2f2', color: '#dc2626', fontSize: 12, fontWeight: 600, cursor: 'pointer' }}>
              <Trash2 size={12} /> Clear all
            </button>
          )}
          <button onClick={onClose} style={{ border: 'none', background: 'none', cursor: 'pointer', padding: 6, borderRadius: 7, color: '#94a3b8', display: 'flex' }}>
            <X size={20} />
          </button>
        </div>

        {/* Body */}
        {emails.length === 0 ? (
          <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: 48, textAlign: 'center' }}>
            <div style={{ width: 72, height: 72, borderRadius: '50%', background: 'linear-gradient(135deg, #e0f2fe, #ede9fe)', display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: 20 }}>
              <Inbox size={32} color="#6366f1" />
            </div>
            <h3 style={{ fontSize: 18, fontWeight: 700, color: '#0f172a', marginBottom: 10 }}>No demo emails yet</h3>
            <p style={{ fontSize: 13, color: '#64748b', maxWidth: 380, lineHeight: 1.7, marginBottom: 24 }}>
              Create a campaign and launch it — all emails will be captured here instead of being sent to real recipients.<br /><br />
              <strong>Demo Mode is active by default.</strong> No setup needed.
            </p>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10, width: '100%', maxWidth: 340 }}>
              {[
                { step: '1', text: 'Go to Marketing → Create Campaign' },
                { step: '2', text: 'Fill in your campaign brief and flow' },
                { step: '3', text: 'On the Review step, click "Launch Campaign"' },
                { step: '4', text: 'Emails appear here instantly' },
              ].map(s => (
                <div key={s.step} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 14px', backgroundColor: '#f8fafc', borderRadius: 8, border: '1px solid #f1f5f9', textAlign: 'left' }}>
                  <div style={{ width: 22, height: 22, borderRadius: '50%', backgroundColor: '#6366f1', color: 'white', fontSize: 11, fontWeight: 700, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>{s.step}</div>
                  <span style={{ fontSize: 13, color: '#374151' }}>{s.text}</span>
                </div>
              ))}
            </div>
            <button onClick={onClose}
              style={{ marginTop: 24, padding: '10px 24px', backgroundColor: '#6366f1', color: 'white', border: 'none', borderRadius: 8, fontSize: 13, fontWeight: 600, cursor: 'pointer' }}>
              Go create a campaign
            </button>
          </div>
        ) : (
          <div style={{ flex: 1, overflow: 'hidden', display: 'flex' }}>

            {/* Email list — hidden on mobile when preview open */}
            <div style={{ width: 300, flexShrink: 0, borderRight: '1px solid #e2e8f0', overflowY: 'auto', display: showMobilePreview ? 'none' : 'block' }}
              className="inbox-list">
              {emails.map(email => {
                const isActive = selected?.id === email.id;
                return (
                  <button key={email.id} onClick={() => handleSelect(email)}
                    style={{ display: 'block', width: '100%', padding: '12px 14px', borderBottom: '1px solid #f1f5f9', border: 'none', backgroundColor: isActive ? '#f0f9ff' : 'white', cursor: 'pointer', textAlign: 'left', borderLeft: `3px solid ${isActive ? '#6366f1' : 'transparent'}`, transition: 'background 0.1s' }}>
                    <div style={{ display: 'flex', alignItems: 'flex-start', gap: 10 }}>
                      <div style={{ width: 32, height: 32, borderRadius: '50%', background: `hsl(${email.to.charCodeAt(0) * 7 % 360}, 60%, 85%)`, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 12, fontWeight: 700, color: `hsl(${email.to.charCodeAt(0) * 7 % 360}, 50%, 35%)`, flexShrink: 0 }}>
                        {(email.toName || email.to).charAt(0).toUpperCase()}
                      </div>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 2 }}>
                          <span style={{ fontSize: 12, fontWeight: 600, color: '#0f172a', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', flex: 1 }}>
                            {email.toName || email.to}
                          </span>
                          <span style={{ fontSize: 10, color: '#94a3b8', flexShrink: 0, marginLeft: 6 }}>{formatTime(email.timestamp)}</span>
                        </div>
                        <div style={{ fontSize: 12, fontWeight: 500, color: '#374151', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', marginBottom: 2 }}>{email.subject}</div>
                        <div style={{ fontSize: 11, color: '#94a3b8', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{email.to}</div>
                      </div>
                    </div>
                  </button>
                );
              })}
            </div>

            {/* Email preview */}
            <div style={{ flex: 1, overflowY: 'auto', display: 'flex', flexDirection: 'column', minWidth: 0 }}>
              {selected ? (
                <>
                  {/* Back button for mobile */}
                  {showMobilePreview && (
                    <button onClick={() => setShowMobilePreview(false)}
                      style={{ display: 'flex', alignItems: 'center', gap: 5, padding: '10px 16px', border: 'none', background: '#f8fafc', cursor: 'pointer', fontSize: 13, color: '#6366f1', fontWeight: 600, borderBottom: '1px solid #e2e8f0' }}>
                      <ChevronLeft size={14} /> Back to inbox
                    </button>
                  )}

                  {/* Email header */}
                  <div style={{ padding: '18px 24px', borderBottom: '1px solid #e2e8f0', backgroundColor: '#fafafa', flexShrink: 0 }}>
                    <h3 style={{ margin: '0 0 12px', fontSize: 16, fontWeight: 700, color: '#0f172a', lineHeight: 1.4 }}>{selected.subject}</h3>
                    <div style={{ display: 'grid', gridTemplateColumns: 'auto 1fr', gap: '4px 12px', alignItems: 'baseline' }}>
                      <span style={{ fontSize: 11, fontWeight: 600, color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '0.05em' }}>From</span>
                      <span style={{ fontSize: 13, color: '#374151' }}>{selected.fromName} &lt;{selected.from}&gt;</span>
                      <span style={{ fontSize: 11, fontWeight: 600, color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '0.05em' }}>To</span>
                      <span style={{ fontSize: 13, color: '#374151' }}>{selected.toName ? `${selected.toName} <${selected.to}>` : selected.to}</span>
                      <span style={{ fontSize: 11, fontWeight: 600, color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Sent</span>
                      <span style={{ fontSize: 13, color: '#374151' }}>{new Date(selected.timestamp).toLocaleString()}</span>
                    </div>
                    <div style={{ marginTop: 10 }}>
                      <span style={{ fontSize: 10, padding: '2px 8px', borderRadius: 20, backgroundColor: '#dcfce7', color: '#16a34a', fontWeight: 700 }}>📬 Demo email — not delivered to recipient</span>
                    </div>
                  </div>

                  {/* Email body */}
                  <div style={{ flex: 1, padding: '24px 32px', fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif', fontSize: 14, lineHeight: 1.7, color: '#374151', backgroundColor: 'white' }}
                    dangerouslySetInnerHTML={{ __html: selected.html }} />
                </>
              ) : (
                <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 8 }}>
                  <Mail size={28} color="#e2e8f0" />
                  <p style={{ color: '#94a3b8', fontSize: 13 }}>Select an email to preview</p>
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
