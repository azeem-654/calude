/**
 * Who was sent what, and what happened to it.
 *
 * ── Why this screen exists ──
 *
 * "Is my email actually arriving?" was unanswerable. Sends were recorded inside
 * the enrolment — a JSON array on a record nobody opens, which cannot be
 * filtered or searched by address. So a customer whose mail was being refused
 * saw a campaign marked sent and no way to find out otherwise.
 *
 * ── Why a refusal is shown in full ──
 *
 * The string an SMTP server returns when it rejects a message is the single
 * most useful thing on this screen. Paraphrasing it into "delivery failed"
 * loses the code that says whether it is a bad password, a blocked IP or a
 * mailbox that does not exist — three completely different afternoons.
 *
 * ── Why "sent" is not "delivered" ──
 *
 * This records what the sending server accepted. A message can be accepted and
 * then land in spam, or bounce hours later. Calling that "delivered" would be
 * the kind of confident wrong answer this product tries not to give, so the
 * column says what it means and the note under it says what it does not.
 */
import { useCallback, useEffect, useState } from 'react';
import { Loader, Search, RefreshCw } from 'lucide-react';
import { deliveryLog } from '../../services/engagement';

const INK = '#0f172a';
const MUTED = '#64748b';
const LINE = '#e6e9f0';
const ACCENT = '#5b46e5';

interface Entry {
  id: string; channel: string; source: string; sourceName: string; stepIndex: number;
  recipient: string; subject: string; status: string; detail: string;
  sentFrom: string; createdAt: string;
}

const TONE: Record<string, string> = {
  sent: '#0f7b3d', failed: '#b42318', suppressed: '#64748b',
};

export default function EngageDelivery() {
  const [rows, setRows] = useState<Entry[]>([]);
  const [totals, setTotals] = useState<{ status: string; n: number }[]>([]);
  const [recipient, setRecipient] = useState('');
  const [status, setStatus] = useState('');
  const [busy, setBusy] = useState(true);

  const read = useCallback(async () => {
    setBusy(true);
    const r = await deliveryLog({ recipient: recipient.trim(), status });
    setRows((r.entries ?? []) as Entry[]);
    setTotals((r.totals ?? []) as typeof totals);
    setBusy(false);
  }, [recipient, status]);

  useEffect(() => { void read(); }, [read]);

  const card: React.CSSProperties = { background: '#fff', border: `1px solid ${LINE}`, borderRadius: 16, padding: 20 };
  const count = (s: string) => totals.find(t => t.status === s)?.n ?? 0;

  return (
    <div style={{ display: 'grid', gap: 14 }}>
      <div style={card}>
        <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap', marginBottom: 6 }}>
          <h3 style={{ fontSize: 16, fontWeight: 800, color: INK, margin: 0, flex: 1 }}>Delivery log</h3>
          <button onClick={() => void read()} disabled={busy} style={btn}>
            {busy ? <Loader size={12} className="spin" /> : <RefreshCw size={12} />} Refresh
          </button>
        </div>
        <p style={{ fontSize: 12.5, color: MUTED, margin: '0 0 14px', lineHeight: 1.6, maxWidth: '76ch' }}>
          Every email and text this workspace has attempted, with whatever the server said back.
          <strong style={{ color: INK }}> Sent means the sending server accepted it</strong> — not that it
          reached an inbox. A message can be accepted and still land in spam or bounce later, and this
          screen will not pretend otherwise.
        </p>

        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 14 }}>
          {(['', 'sent', 'failed', 'suppressed'] as const).map(st => (
            <button key={st || 'all'} onClick={() => setStatus(st)} style={{
              padding: '6px 12px', borderRadius: 999, cursor: 'pointer', fontFamily: 'inherit',
              border: `1.5px solid ${status === st ? ACCENT : LINE}`,
              background: status === st ? 'rgba(91,70,229,0.06)' : '#fff',
              color: status === st ? ACCENT : '#475569', fontSize: 12, fontWeight: 700,
            }}>
              {st ? `${st} (${count(st)})` : 'Everything'}
            </button>
          ))}
          <span style={{ position: 'relative', flex: '1 1 200px', minWidth: 170 }}>
            <Search size={13} style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', color: MUTED }} />
            <input value={recipient} onChange={e => setRecipient(e.target.value)}
              placeholder="An address or number…" aria-label="Filter by recipient"
              style={{
                width: '100%', padding: '7px 10px 7px 30px', border: `1px solid ${LINE}`,
                borderRadius: 999, fontSize: 12.5, fontFamily: 'inherit', outline: 'none', boxSizing: 'border-box',
              }} />
          </span>
        </div>

        {busy ? (
          <p style={{ fontSize: 13, color: MUTED, margin: 0 }}>Loading…</p>
        ) : rows.length === 0 ? (
          <p style={{ fontSize: 13, color: MUTED, margin: 0, lineHeight: 1.65, maxWidth: '62ch' }}>
            {recipient || status
              ? 'Nothing matches that.'
              : 'Nothing has been sent from this workspace yet. Every send from a sequence, a campaign or the assistant is written here as it happens.'}
          </p>
        ) : (
          <div style={{ display: 'grid', gap: 7 }}>
            {rows.map(r => (
              <div key={r.id} style={{
                display: 'grid', gap: 3,
                border: `1px solid ${LINE}`, borderRadius: 11, padding: '10px 12px',
              }}>
                <div style={{ display: 'flex', gap: 9, alignItems: 'center', flexWrap: 'wrap' }}>
                  <span style={{ fontSize: 10.5, fontWeight: 800, color: TONE[r.status] ?? MUTED, letterSpacing: '0.04em' }}>
                    {r.status.toUpperCase()}
                  </span>
                  <span style={{ fontSize: 13, fontWeight: 700, color: INK, minWidth: 0 }}>{r.recipient}</span>
                  <span style={{ fontSize: 11.5, color: MUTED }}>
                    {new Date(r.createdAt).toLocaleString(undefined, { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}
                  </span>
                  <span style={{ flex: 1 }} />
                  <span style={{ fontSize: 11, color: MUTED }}>
                    {r.channel === 'sms' ? 'SMS' : 'Email'}
                    {r.sourceName ? ` · ${r.sourceName}` : ''}
                    {r.stepIndex > 0 ? ` · step ${r.stepIndex + 1}` : ''}
                  </span>
                </div>
                {!!r.subject && (
                  <div style={{ fontSize: 12.5, color: '#334155' }}>{r.subject}</div>
                )}
                {!!r.detail && (
                  /* Verbatim. The code in here is the difference between a bad
                     password, a blocked address and a mailbox that does not
                     exist — three entirely different afternoons. */
                  <div style={{
                    fontSize: 11.5, color: r.status === 'failed' ? '#b42318' : MUTED,
                    fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace',
                    background: '#f8fafc', borderRadius: 7, padding: '6px 8px', marginTop: 2,
                    wordBreak: 'break-word',
                  }}>{r.detail}</div>
                )}
                {!!r.sentFrom && (
                  <div style={{ fontSize: 11, color: MUTED }}>sent from {r.sentFrom}</div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

const btn: React.CSSProperties = {
  display: 'inline-flex', alignItems: 'center', gap: 5, padding: '6px 11px',
  border: `1px solid ${LINE}`, borderRadius: 8, background: '#fff',
  color: INK, fontSize: 11.5, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit',
};
