/**
 * Settings → Profile: the person's own photo, beside their name.
 *
 * Without one, the animated orb stands in (shared/UserFace.tsx) — the same
 * picture in the top bar and the dashboard's welcome, replaced everywhere the
 * moment a photo is saved. The picture is shrunk to a 256 px square in the browser and the
 * server checks its bytes before keeping it (/api/user-avatar.php).
 */
import { useRef, useState } from 'react';
import { Camera, Trash2, Loader } from 'lucide-react';
import { setMyPhoto, shrinkPhoto, useMyAvatar } from '../../services/userAvatar';
import UserFace from '../shared/UserFace';

export default function ProfilePhoto() {
  const me = useMyAvatar();
  const input = useRef<HTMLInputElement | null>(null);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);

  const pick = async (f: File | undefined) => {
    if (!f) return;
    setBusy(true); setMsg(null);
    try {
      const r = await setMyPhoto(await shrinkPhoto(f));
      setMsg(r.ok ? { ok: true, text: 'Photo saved.' } : { ok: false, text: r.error ?? 'The photo could not be saved.' });
    } catch (e) {
      setMsg({ ok: false, text: e instanceof Error ? e.message : 'That file is not a picture.' });
    }
    setBusy(false);
    if (input.current) input.current.value = '';
  };
  const remove = async () => {
    setBusy(true); setMsg(null);
    const r = await setMyPhoto(null);
    setMsg(r.ok ? { ok: true, text: 'Photo removed — the animated orb is back.' } : { ok: false, text: r.error ?? 'Could not remove it.' });
    setBusy(false);
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8, flexShrink: 0 }}>
      <span style={{ borderRadius: '50%', boxShadow: '0 0 0 3px #fff, 0 0 0 4px #e6e9f0' }}>
        <UserFace size={80} testId="profile-avatar" />
      </span>
      <input ref={input} type="file" accept="image/png,image/jpeg,image/webp" hidden
        aria-label="Upload a photo" onChange={e => void pick(e.target.files?.[0])} />
      <div style={{ display: 'flex', gap: 6 }}>
        <button type="button" onClick={() => input.current?.click()} disabled={busy} data-field="profile.photo"
          style={{ display: 'inline-flex', alignItems: 'center', gap: 5, padding: '5px 10px', borderRadius: 999, border: '1px solid #e2e8f0', background: '#fff', fontSize: 12, fontWeight: 600, color: '#0f172a', cursor: 'pointer' }}>
          {busy ? <Loader size={12} className="spin" /> : <Camera size={12} />} {me.photo ? 'Change' : 'Upload photo'}
        </button>
        {me.photo && (
          <button type="button" onClick={() => void remove()} disabled={busy} aria-label="Remove photo" title="Remove photo"
            style={{ display: 'inline-grid', placeItems: 'center', width: 28, height: 28, borderRadius: 999, border: '1px solid #e2e8f0', background: '#fff', color: '#b42318', cursor: 'pointer' }}>
            <Trash2 size={12} />
          </button>
        )}
      </div>
      {msg && <span role={msg.ok ? 'status' : 'alert'} style={{ fontSize: 11.5, color: msg.ok ? '#0f7b3d' : '#b42318', maxWidth: 180, textAlign: 'center' }}>{msg.text}</span>}
    </div>
  );
}
