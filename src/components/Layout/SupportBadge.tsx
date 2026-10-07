/**
 * The round badge in the top bar for Customer Engagement: somebody is waiting
 * for a person, or has written something nobody here has read.
 *
 * Drawn only when there is something — the same rule as the task badge — so
 * it is a signal and not furniture. The conversation screen keeps itself live
 * every few seconds; this is what tells somebody on any other screen that a
 * customer has just written. Shares one request with the dashboard card
 * (services/supportPulse.ts).
 */
import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { MessageSquare } from 'lucide-react';
import { watchSupport, type SupportPulse } from '../../services/supportPulse';

export default function SupportBadge({ style }: { style: React.CSSProperties }) {
  const [p, setP] = useState<SupportPulse | null>(null);
  const navigate = useNavigate();
  useEffect(() => watchSupport(setP), []);
  if (!p || p.state !== 'ready') return null;

  const waiting = p.conversations.count + p.live.count;
  /* Waiting people first: an unread message from somebody the assistant is
     still answering matters, but less than a person with nobody. */
  const n = waiting || p.unread;
  if (!n) return null;
  const tone = waiting ? '#e5484d' : '#5b46e5';
  const label = [
    p.conversations.count ? `${p.conversations.count} waiting for a reply` : '',
    p.live.count ? `${p.live.count} waiting for live help` : '',
    p.unread ? `${p.unread} with unread messages` : '',
  ].filter(Boolean).join(', ');
  const to = p.live.count && (!p.conversations.oldestAt || (p.live.oldestAt ?? '') < p.conversations.oldestAt)
    ? '/engagement?tab=live'
    : p.conversations.oldestId ? `/engagement?tab=inbox&c=${encodeURIComponent(p.conversations.oldestId)}` : '/engagement?tab=inbox';

  return (
    <button
      type="button"
      title={`Customer Engagement: ${label}`}
      aria-label={`Customer Engagement: ${label}`}
      data-testid="support-badge"
      onClick={() => navigate(to)}
      className="icon-btn"
      style={{ ...style, position: 'relative', flexShrink: 0 }}
    >
      <MessageSquare size={18} strokeWidth={1.8} />
      <span style={{
        position: 'absolute', top: -2, right: -4, minWidth: 18, height: 18, padding: '0 4px', boxSizing: 'border-box',
        borderRadius: 999, background: tone, color: '#fff', fontSize: 11, fontWeight: 800,
        display: 'grid', placeItems: 'center', border: '2px solid #1c1c22', lineHeight: 1,
      }}>{n > 99 ? '99+' : n}</span>
    </button>
  );
}
