/**
 * Somebody invited this address to their workspace: the person chooses.
 *
 * Shown in place of the sign-in form once the mailbox is proved (a code, or
 * Google) and an invitation is waiting. Joining was once done for them — an
 * agency could type a stranger's address and catch that person's own sign-up
 * inside its workspace — so nothing binds until "Join" is pressed here.
 */
import { useState } from 'react';
import { Users, Loader, ArrowRight } from 'lucide-react';
import { answerInvite, type InviteOffer } from '../../services/auth';

export default function InviteChoice({ offer, onDone, onCancel }: {
  offer: InviteOffer;
  onDone: () => void;
  onCancel: () => void;
}) {
  const [busy, setBusy] = useState('');
  const [error, setError] = useState('');

  const choose = async (choice: 'join' | 'own', id = '') => {
    setBusy(choice + id); setError('');
    const r = await answerInvite(offer.ticket, choice, id);
    setBusy('');
    if (r.ok) onDone(); else setError(r.error);
  };

  const btn = (dark: boolean): React.CSSProperties => ({
    display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, padding: '12px 16px', borderRadius: 12,
    border: dark ? 0 : '1px solid #e6e9f0', background: dark ? '#17191c' : '#fff', color: dark ? '#fff' : '#17191c',
    fontSize: 14, fontWeight: 700, cursor: busy ? 'default' : 'pointer', fontFamily: 'inherit', minHeight: 44,
  });

  return (
    <div style={{ display: 'grid', gap: 14 }}>
      <div style={{ display: 'flex', gap: 10, alignItems: 'flex-start' }}>
        <span style={{ width: 36, height: 36, borderRadius: 11, background: '#eef2ff', display: 'grid', placeItems: 'center', flexShrink: 0 }}>
          <Users size={18} color="#4338ca" />
        </span>
        <div>
          <h2 style={{ margin: 0, fontSize: 15, color: '#17191c' }}>You have been invited</h2>
          <span style={{ fontSize: 13, color: '#64748b', lineHeight: 1.5 }}>
            Join the workspace you were invited to, or create an account of your own. Nothing is joined until you choose.
          </span>
        </div>
      </div>
      {offer.invitations.map(i => (
        <button key={i.id} type="button" disabled={!!busy} onClick={() => void choose('join', i.id)} style={btn(true)}>
          {busy === `join${i.id}` ? <Loader size={15} className="spin" /> : <ArrowRight size={15} />} Join {i.from}’s workspace
        </button>
      ))}
      <button type="button" disabled={!!busy} onClick={() => void choose('own')} style={btn(false)}>
        {busy === 'own' ? <Loader size={15} className="spin" /> : null} Create my own account
      </button>
      {error && <div role="alert" style={{ fontSize: 13, color: '#b91c1c' }}>{error}</div>}
      <button type="button" onClick={onCancel} style={{ background: 'none', border: 0, color: '#64748b', fontSize: 13, cursor: 'pointer', fontFamily: 'inherit' }}>
        Use a different account
      </button>
    </div>
  );
}
