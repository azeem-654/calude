/**
 * The business mailboxes on a workspace's own domains.
 *
 * ── What this screen deliberately cannot do ──
 *
 * Show a password. Not the one that was generated, not a masked tail of it. The
 * app holds it encrypted and uses it to send and receive on the customer's
 * behalf; a screen that could display it would mean the server returning it,
 * and a secret that reaches a browser has left the building. Somebody who wants
 * to use the mailbox in Outlook resets it, which replaces the stored copy too.
 *
 * ── Verified, and honest about it ──
 *
 * Sending and receiving are shown apart, because they fail apart: an outbox can
 * work for months while the inbox password has expired. A mailbox created
 * minutes ago has neither stamp, and says "not checked yet" rather than wearing
 * a green tick it has not earned.
 */
import { useEffect, useState } from 'react';
import { Mail, Plus, Loader, Check, Clock, Star } from 'lucide-react';
import { useApp } from '../../context/AppContext';
import {
  createMailbox, listMailboxes, listOwnedDomains,
  type MailboxRow, type OwnedDomain,
} from '../../services/digitalSetup';

const INK = '#17191c';
const MUTED = '#6b7280';
const LINE = '#e6e9f0';
const ACCENT = '#5b46e5';

function Stamp({ at, label }: { at: string | null; label: string }) {
  return (
    <span style={{
      display: 'inline-flex', alignItems: 'center', gap: 4, fontSize: 10.5, fontWeight: 700,
      padding: '2px 7px', borderRadius: 999,
      background: at ? '#e8f6ee' : '#f1f5f9', color: at ? '#0f7b3d' : MUTED,
    }}>
      {at ? <Check size={9} /> : <Clock size={9} />}
      {label} {at ? 'works' : 'not checked yet'}
    </span>
  );
}

export default function MailboxManager() {
  const { addNotification } = useApp();
  const [boxes, setBoxes] = useState<MailboxRow[]>([]);
  const [domains, setDomains] = useState<OwnedDomain[]>([]);
  const [loading, setLoading] = useState(true);

  const [adding, setAdding] = useState(false);
  const [local, setLocal] = useState('');
  const [domain, setDomain] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const load = async () => {
    const [list, dms] = await Promise.all([listMailboxes(), listOwnedDomains()]);
    setBoxes(list);
    setDomains(dms);
    setDomain(prev => prev || dms[0]?.domain || '');
    setLoading(false);
  };

  useEffect(() => {
    let live = true;
    void (async () => {
      const [list, dms] = await Promise.all([listMailboxes(), listOwnedDomains()]);
      if (!live) return;
      setBoxes(list);
      setDomains(dms);
      setDomain(dms[0]?.domain ?? '');
      setLoading(false);
    })();
    return () => { live = false; };
  }, []);

  const create = async () => {
    setBusy(true);
    setError('');
    const r = await createMailbox(domain, local, displayName || local);
    setBusy(false);
    if (r.error) { setError(r.error); return; }
    addNotification(`${r.address} is ready.`, 'success');
    setAdding(false);
    setLocal('');
    setDisplayName('');
    void load();
  };

  const inp: React.CSSProperties = {
    padding: '9px 11px', border: `1px solid ${LINE}`, borderRadius: 9,
    fontSize: 13, color: INK, outline: 'none', fontFamily: 'inherit', boxSizing: 'border-box',
  };

  if (loading) return <p style={{ fontSize: 13, color: MUTED, padding: '20px 0' }}>Loading your mailboxes…</p>;

  return (
    <div style={{ display: 'grid', gap: 13 }}>
      {boxes.length === 0 && !adding && (
        <div style={{ border: `1px dashed ${LINE}`, borderRadius: 16, padding: '28px 22px', textAlign: 'center' }}>
          <Mail size={20} color={MUTED} />
          <p style={{ margin: '8px 0 0', fontSize: 13, color: MUTED, lineHeight: 1.6 }}>
            No business email yet.{' '}
            {domains.length
              ? `You can add an address on ${domains[0].domain}.`
              : 'Add a domain to this workspace first and mailboxes on it appear here.'}
          </p>
        </div>
      )}

      {boxes.map(b => (
        <div key={b.id} style={{
          border: `1px solid ${LINE}`, borderRadius: 12, background: '#fff', padding: '12px 14px',
          display: 'flex', gap: 11, alignItems: 'center', flexWrap: 'wrap',
        }}>
          <span style={{ width: 30, height: 30, borderRadius: 9, background: 'rgba(91,70,229,0.08)', display: 'grid', placeItems: 'center', flexShrink: 0 }}>
            <Mail size={14} color={ACCENT} />
          </span>
          <span style={{ flex: 1, minWidth: 150 }}>
            <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <span style={{ fontSize: 13.5, fontWeight: 700, color: INK, overflow: 'hidden', textOverflow: 'ellipsis' }}>
                {b.address}
              </span>
              {b.isPrimary === 1 && (
                <span title="Campaigns and Autopilot send from this one"
                  style={{ display: 'inline-flex', alignItems: 'center', gap: 3, fontSize: 10.5, fontWeight: 700, color: '#92400e', background: '#fef3c7', padding: '2px 7px', borderRadius: 999 }}>
                  <Star size={9} /> Sends from here
                </span>
              )}
            </span>
            <span style={{ display: 'flex', gap: 6, marginTop: 5, flexWrap: 'wrap' }}>
              <Stamp at={b.outVerifiedAt} label="Sending" />
              <Stamp at={b.inVerifiedAt} label="Receiving" />
            </span>
          </span>
        </div>
      ))}

      {adding ? (
        <div style={{ border: `1px solid ${LINE}`, borderRadius: 12, background: '#fff', padding: 14, display: 'grid', gap: 11 }}>
          <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
            <input value={local} placeholder="sales"
              onChange={e => setLocal(e.target.value.toLowerCase().replace(/[^a-z0-9._-]/g, ''))}
              style={{ ...inp, width: 130 }} />
            <span style={{ fontSize: 14, color: MUTED }}>@</span>
            <select value={domain} onChange={e => setDomain(e.target.value)} style={{ ...inp, cursor: 'pointer', minWidth: 170 }}>
              {domains.map(d => <option key={d.domain} value={d.domain}>{d.domain}</option>)}
            </select>
          </div>
          <input value={displayName} placeholder="Name shown on outgoing mail (optional)"
            onChange={e => setDisplayName(e.target.value)} style={{ ...inp, width: '100%' }} />
          {error && <p style={{ margin: 0, fontSize: 12, color: '#b42318' }}>{error}</p>}
          <div style={{ display: 'flex', gap: 8 }}>
            <button onClick={() => void create()} disabled={busy || !local || !domain} style={{
              display: 'inline-flex', alignItems: 'center', gap: 6, padding: '9px 16px',
              border: 'none', borderRadius: 9, background: busy || !local || !domain ? '#c7c9d3' : INK,
              color: '#fff', fontSize: 12.5, fontWeight: 700,
              cursor: busy || !local || !domain ? 'not-allowed' : 'pointer', fontFamily: 'inherit',
            }}>
              {busy ? <Loader size={13} className="spin" /> : <Check size={13} />} Create it
            </button>
            <button onClick={() => { setAdding(false); setError(''); }} style={{
              padding: '9px 14px', border: `1px solid ${LINE}`, borderRadius: 9,
              background: '#fff', color: MUTED, fontSize: 12.5, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit',
            }}>Cancel</button>
          </div>
        </div>
      ) : (
        domains.length > 0 && (
          <button onClick={() => setAdding(true)} style={{
            display: 'inline-flex', alignItems: 'center', gap: 6, alignSelf: 'flex-start',
            padding: '9px 15px', border: `1px solid ${LINE}`, borderRadius: 9,
            background: '#fff', color: INK, fontSize: 12.5, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit',
          }}>
            <Plus size={13} /> Add a mailbox
          </button>
        )
      )}

      {boxes.length > 0 && (
        <p style={{ margin: 0, fontSize: 11.5, color: MUTED, lineHeight: 1.6 }}>
          Passwords are held encrypted and are never shown — the app signs in for you. To use one of
          these in another mail app, reset its password from Settings → Email &amp; SMS.
        </p>
      )}
    </div>
  );
}
