/**
 * Where Google drops the visitor back.
 *
 * ── Why this is a screen and not a redirect handler ──
 *
 * Because the exchange happens on the server and takes a round trip, and
 * because it can fail — a refused consent, a state that took too long, a Google
 * account whose address was never confirmed. Somebody who declined at Google's
 * screen has to land somewhere that says so and offers the way back, not on a
 * blank page or, worse, on the sign-in form with no explanation of why they are
 * still looking at it.
 *
 * ── The code is spent once ──
 *
 * Google's authorization code is single-use, and React's StrictMode mounts
 * every effect twice in development. The second exchange would fail against
 * Google and paint an error over a sign-in that had actually just succeeded.
 * The guard is module-level rather than a ref because it has to survive the
 * remount, not just the re-render.
 */
import { useEffect, useRef, useState } from 'react';
import { AlertTriangle, Loader } from 'lucide-react';
import { googleFinish, googleStateIsOurs } from '../../services/auth';
import TwoStepPrompt from './TwoStepPrompt';
import { LogoMark } from '../shared/Logo';

const INK = '#17191c';
const MUTED = '#8a8f98';

/** Codes this page has already handed to the server. */
const spent = new Set<string>();

export default function GoogleCallback({ onAuthed }: { onAuthed: () => void }) {
  const [error, setError] = useState('');
  const [ticket, setTicket] = useState('');
  const done = useRef(false);

  useEffect(() => {
    if (done.current) return;
    done.current = true;

    const params = new URLSearchParams(window.location.search);
    const code = params.get('code') ?? '';
    const state = params.get('state') ?? '';
    /* Google's own word for "they pressed Cancel". Said plainly rather than
       reported as a failure — nothing went wrong, they changed their mind. */
    const refused = params.get('error') ?? '';

    if (refused) {
      setError(refused === 'access_denied'
        ? 'You cancelled the Google sign-in. Nothing was shared.'
        : 'Google could not complete that sign-in.');
      return;
    }
    if (!code || !state) {
      setError('That link is missing part of the sign-in. Start again from the sign-in page.');
      return;
    }
    if (spent.has(code)) return;
    spent.add(code);
    if (!googleStateIsOurs(state)) {
      setError('That sign-in was not started from this browser, so it was not used. Start again from the sign-in page.');
      return;
    }

    void (async () => {
      const r = await googleFinish(code, state);
      if (r.mfaTicket) { setTicket(r.mfaTicket); return; }
      if (r.ok) { onAuthed(); return; }
      setError(r.error);
    })();
  }, [onAuthed]);

  const back = () => {
    const root = `${(import.meta.env.BASE_URL || '/').replace(/\/$/, '')}/login`;
    window.location.assign(root);
  };

  return (
    <div style={{ minHeight: '100vh', background: '#e9ebee', display: 'grid', placeItems: 'center', padding: 20 }}>
      <div style={{ width: '100%', maxWidth: 380, textAlign: 'center' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 10, marginBottom: 20 }}>
          <LogoMark size={30} />
        </div>
        <div style={{ background: '#fff', borderRadius: 20, padding: '30px 26px', boxShadow: '0 12px 40px -12px rgba(16,24,40,0.18)' }}>
          {ticket ? (
            <div style={{ textAlign: 'left' }}>
              <TwoStepPrompt ticket={ticket} onDone={onAuthed} onCancel={back} />
            </div>
          ) : error ? (
            <>
              <AlertTriangle size={20} color="#e5484d" />
              <p style={{ fontSize: 13.5, color: INK, lineHeight: 1.6, margin: '10px 0 16px', fontWeight: 600 }}>{error}</p>
              <button onClick={back} style={{
                padding: '11px 20px', background: INK, color: '#fff', border: 'none', borderRadius: 11,
                fontSize: 13.5, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit',
              }}>
                Back to sign in
              </button>
            </>
          ) : (
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 9, color: MUTED, fontSize: 13.5 }}>
              <Loader size={15} className="spin" /> Signing you in…
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
