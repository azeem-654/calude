/**
 * "Waiting for support" — how many people are waiting for a person here, and
 * for how long.
 *
 * Three queues, counted by the server (`support_waiting` in
 * routes/engagement.ts): chats whose visitor wrote and has not had a person
 * answer, tickets still open, and live-help requests nobody has joined. The
 * longest wait is the headline because it is the one that costs something —
 * twelve people waiting a minute is a queue, one person waiting forty minutes
 * is a customer being lost.
 *
 * Drawn only for a workspace that has ever used Customer Engagement. One that
 * never has would see "nobody is waiting" for ever, which is true and useless.
 */
import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Headphones, MessageSquare, Ticket, Monitor, ArrowRight } from 'lucide-react';
import { watchSupport, type SupportPulse } from '../../services/supportPulse';

function waited(iso: string | null, now: number): string {
  if (!iso) return '';
  const mins = Math.max(0, Math.round((now - Date.parse(iso)) / 60_000));
  if (mins < 1) return 'under a minute';
  if (mins < 60) return `${mins} min`;
  const h = Math.floor(mins / 60);
  if (h < 48) return `${h} h ${mins % 60 ? `${mins % 60} min` : ''}`.trim();
  return `${Math.floor(h / 24)} days`;
}

export default function SupportWaiting() {
  const [p, setP] = useState<SupportPulse | null>(null);
  const [now, setNow] = useState(() => Date.now());
  const navigate = useNavigate();
  useEffect(() => watchSupport(x => { setP(x); setNow(Date.now()); }), []);
  /* The waits are ages, so they grow between fetches too. */
  useEffect(() => {
    const t = window.setInterval(() => setNow(Date.now()), 30_000);
    return () => window.clearInterval(t);
  }, []);

  if (!p || p.state !== 'ready' || !p.hasData) return null;

  const total = p.conversations.count + p.tickets.count + p.live.count;
  /* The single oldest wait across the three, and where it is. */
  const candidates = [
    { at: p.live.oldestAt, to: '/engagement?tab=live' },
    { at: p.conversations.oldestAt, to: p.conversations.oldestId ? `/engagement?tab=inbox&c=${encodeURIComponent(p.conversations.oldestId)}` : '/engagement?tab=inbox' },
    { at: p.tickets.oldestAt, to: '/engagement?tab=tickets' },
  ].filter((c): c is { at: string; to: string } => !!c.at).sort((a, b) => (a.at < b.at ? -1 : 1));
  const oldest = candidates[0];
  const urgent = total > 0;
  const tone = urgent ? { edge: '#fecaca', bg: '#fff7f7', fg: '#b42318' } : { edge: '#e6e9f0', bg: '#fff', fg: '#475569' };

  const row = (Icon: typeof MessageSquare, n: number, one: string, many: string, to: string, at: string | null) => (
    <button key={one} type="button" onClick={() => navigate(to)} disabled={!n} style={{
      textAlign: 'left', padding: '10px 12px', borderRadius: 12, border: '1px solid #eceef1', background: '#fff',
      cursor: n ? 'pointer' : 'default', fontFamily: 'inherit', display: 'grid', gap: 3, minWidth: 0,
      opacity: n ? 1 : 0.7,
    }}>
      <span style={{ display: 'flex', alignItems: 'center', gap: 7, fontSize: 13, fontWeight: 700, color: '#17191c' }}>
        <Icon size={14} color={n ? tone.fg : '#94a3b8'} />
        <span data-count={one}>{n}</span> {n === 1 ? one : many}
      </span>
      <span style={{ fontSize: 11.5, color: '#6b7280' }}>
        {n ? `longest ${waited(at, now)}` : 'nobody waiting'}
      </span>
    </button>
  );

  return (
    <section aria-label="Waiting for support" data-testid="support-waiting" style={{
      borderRadius: 20, border: `1px solid ${tone.edge}`, background: tone.bg, padding: '16px 18px', display: 'grid', gap: 12,
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
        <Headphones size={18} color={tone.fg} />
        <b style={{ fontSize: 15, color: '#17191c' }}>
          {urgent ? `${total} waiting for support` : 'Nobody is waiting for support'}
        </b>
        {urgent && oldest && (
          <span style={{ fontSize: 12.5, color: '#6b7280' }}>the longest for {waited(oldest.at, now)}</span>
        )}
        {urgent && oldest ? (
          <button type="button" onClick={() => navigate(oldest.to)} style={{
            marginLeft: 'auto', display: 'inline-flex', alignItems: 'center', gap: 6, padding: '7px 12px', borderRadius: 10,
            border: 'none', background: tone.fg, color: '#fff', fontSize: 12.5, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit',
          }}>
            Answer the longest wait <ArrowRight size={13} />
          </button>
        ) : (
          <button type="button" onClick={() => navigate('/engagement?tab=inbox')} style={{
            marginLeft: 'auto', display: 'inline-flex', alignItems: 'center', gap: 6, padding: '7px 12px', borderRadius: 10,
            border: '1px solid #e2e8f0', background: '#fff', fontSize: 12.5, fontWeight: 700, color: '#17191c', cursor: 'pointer', fontFamily: 'inherit',
          }}>
            Open conversations <ArrowRight size={13} />
          </button>
        )}
      </div>
      {urgent && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(min(100%, 190px), 1fr))', gap: 8 }}>
          {row(MessageSquare, p.conversations.count, 'chat waiting for a reply', 'chats waiting for a reply',
            p.conversations.oldestId ? `/engagement?tab=inbox&c=${encodeURIComponent(p.conversations.oldestId)}` : '/engagement?tab=inbox',
            p.conversations.oldestAt)}
          {row(Monitor, p.live.count, 'live-help request', 'live-help requests', '/engagement?tab=live', p.live.oldestAt)}
          {row(Ticket, p.tickets.count, 'open ticket', 'open tickets', '/engagement?tab=tickets', p.tickets.oldestAt)}
        </div>
      )}
    </section>
  );
}
