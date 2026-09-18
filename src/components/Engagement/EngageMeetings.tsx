/**
 * Calendars and video meetings.
 *
 * ── Why connecting is its own screen and its own consent ──
 *
 * `calendar.events` is a sensitive Google scope. Putting it on the sign-in
 * button would have pushed every new user of this installation behind Google's
 * verification review and a 100-new-user cap, for a feature most of them will
 * never touch. So it is asked once, of the person who wants a calendar, here.
 */
import { useCallback, useEffect, useState } from 'react';
import { Calendar, Check, Loader, Trash2, Video } from 'lucide-react';
import { useApp } from '../../context/AppContext';
import { calendarConnect, calendarDisconnect, calendarStatus } from '../../services/engagement';

const INK = '#0f172a';
const MUTED = '#64748b';
const LINE = '#e6e9f0';
const ACCENT = '#5b46e5';

interface Conn { ownerEmail: string; calendarId: string; status: string; lastError: string }

export default function EngageMeetings() {
  const { addNotification } = useApp();
  const [conns, setConns] = useState<Conn[]>([]);
  const [configured, setConfigured] = useState(true);
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState('');

  const read = useCallback(async () => {
    const r = await calendarStatus();
    setConns((r.connections ?? []) as Conn[]);
    setConfigured(r.configured !== false);
    setNote(String(r.note ?? ''));
  }, []);

  useEffect(() => { void read(); }, [read]);

  const card: React.CSSProperties = { background: '#fff', border: `1px solid ${LINE}`, borderRadius: 16, padding: 20 };

  return (
    <div style={{ display: 'grid', gap: 14 }}>
      <div style={card}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 9, marginBottom: 4 }}>
          <Calendar size={16} color={ACCENT} />
          <h3 style={{ fontSize: 16, fontWeight: 800, color: INK, margin: 0 }}>Google Calendar and Meet</h3>
        </div>
        <p style={{ fontSize: 13, color: MUTED, margin: '0 0 14px', lineHeight: 1.6, maxWidth: '74ch' }}>
          Connect a calendar and every booking creates a real event with a Google Meet link on it, and the
          assistant can offer times that are genuinely free. Without one, booking still works — there is just
          no video link and no conflict checking.
        </p>

        {!configured && (
          <div style={{
            display: 'flex', gap: 9, alignItems: 'flex-start', padding: '11px 12px', borderRadius: 11,
            background: '#fffbeb', border: '1px solid #fde68a', marginBottom: 14,
          }}>
            <p style={{ margin: 0, fontSize: 12, color: '#78350f', lineHeight: 1.6 }}>
              {note || 'No Google client is configured for this installation, so a calendar cannot be connected yet.'}
            </p>
          </div>
        )}

        {conns.length === 0 ? (
          <p style={{ fontSize: 13, color: MUTED, margin: '0 0 12px' }}>No calendar is connected.</p>
        ) : (
          <div style={{ display: 'grid', gap: 8, marginBottom: 12 }}>
            {conns.map(c => (
              <div key={c.ownerEmail} style={{
                display: 'flex', gap: 11, alignItems: 'center', flexWrap: 'wrap',
                border: `1px solid ${LINE}`, borderRadius: 12, padding: '11px 13px',
              }}>
                <Check size={14} color={c.status === 'connected' ? '#0f7b3d' : '#b42318'} />
                <span style={{ fontSize: 13.5, fontWeight: 700, color: INK }}>{c.ownerEmail}</span>
                <span style={{ fontSize: 12, color: MUTED }}>{c.calendarId}</span>
                {c.status !== 'connected' && (
                  /* Named rather than left as a silent failure: a refresh token
                     that stops working looks exactly like the feature being
                     broken, and the fix is to reconnect. */
                  <span style={{ fontSize: 11.5, color: '#b42318' }}>
                    {c.lastError || 'Needs reconnecting'}
                  </span>
                )}
                <span style={{ flex: 1 }} />
                <button onClick={() => void (async () => {
                  setBusy(c.ownerEmail);
                  await calendarDisconnect(c.ownerEmail);
                  setBusy('');
                  await read();
                })()} disabled={busy === c.ownerEmail} style={{ ...btn, color: '#b42318' }}>
                  {busy === c.ownerEmail ? <Loader size={11} className="spin" /> : <Trash2 size={11} />} Disconnect
                </button>
              </div>
            ))}
          </div>
        )}

        <button onClick={() => void (async () => {
          setBusy('connect');
          const r = await calendarConnect();
          setBusy('');
          if (!r.success || !r.url) {
            addNotification(r.error ?? 'Could not start the connection.', 'error');
            return;
          }
          /* Replaced rather than opened in a tab: Google's consent screen in a
             popup is blocked as often as it is shown, and coming back to a tab
             that is already the app is less confusing than one that is not. */
          window.location.href = String(r.url);
        })()} disabled={!configured || busy === 'connect'} style={{
          display: 'inline-flex', alignItems: 'center', gap: 7, padding: '10px 16px',
          border: 'none', borderRadius: 10,
          background: !configured ? '#dcdfe6' : ACCENT,
          color: !configured ? '#8b93a3' : '#fff',
          fontSize: 13.5, fontWeight: 700, fontFamily: 'inherit',
          cursor: !configured || busy === 'connect' ? 'default' : 'pointer',
        }}>
          {busy === 'connect' ? <Loader size={14} className="spin" /> : <Video size={14} />}
          Connect a Google Calendar
        </button>
        <p style={{ fontSize: 11.5, color: MUTED, margin: '9px 0 0', lineHeight: 1.6, maxWidth: '70ch' }}>
          Google is asked only for permission to manage events — not to read your whole calendar and not to
          delete it. The refresh token is encrypted before it is stored and is never sent back to a browser.
        </p>
      </div>
    </div>
  );
}

const btn: React.CSSProperties = {
  display: 'inline-flex', alignItems: 'center', gap: 5, padding: '6px 11px',
  border: `1px solid ${LINE}`, borderRadius: 8, background: '#fff',
  color: INK, fontSize: 11.5, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit',
};
