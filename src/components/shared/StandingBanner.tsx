/**
 * The bar that tells somebody their account is in trouble.
 *
 * ── Why this exists at all ──
 *
 * Because the alternative is a send button that fails. A suspended workspace
 * gets a refusal from the server on every campaign, and without this the
 * customer's reasonable conclusion is that the product is broken — they retry,
 * they check their SMTP settings, they open a support ticket about the wrong
 * thing entirely.
 *
 * ── Why a warning cannot be dismissed forever ──
 *
 * It can be closed for the session and comes back on the next load, until the
 * owner clears the mark. Something that can be permanently dismissed is
 * something that will be dismissed on the day it appears and never thought
 * about again — which is how somebody ends up suspended having genuinely never
 * registered the warning.
 */
import { useEffect, useState } from 'react';
import { AlertTriangle, FileText, ShieldX, X } from 'lucide-react';
import { acceptPolicy, myStanding, type PolicyState, type Standing } from '../../services/moderation';

export default function StandingBanner() {
  const [standing, setStanding] = useState<Standing | null>(null);
  const [policy, setPolicy] = useState<PolicyState | null>(null);
  const [closed, setClosed] = useState(false);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let alive = true;
    void (async () => {
      const r = await myStanding();
      if (!alive) return;
      if (r.standing.state !== 'ok') setStanding(r.standing);
      if (!r.policy.accepted && r.policy.version) setPolicy(r.policy);
    })();
    return () => { alive = false; };
  }, []);

  const agree = async () => {
    setBusy(true);
    const ok = await acceptPolicy();
    setBusy(false);
    if (ok) setPolicy(null);
  };

  /*
   * ── Which bar wins ──
   *
   * Being in trouble is shown before being asked to read something. Two bars
   * stacked is two things nobody reads, and somebody who is suspended needs
   * that sentence more than they need a link to the policy it came from —
   * which the suspension already cites.
   */
  if (!standing && policy) {
    return (
      <div role="status" style={{
        display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap',
        padding: '10px clamp(14px, 3vw, 22px)',
        background: '#eef2ff', borderBottom: '1px solid #c7d2fe', color: '#3730a3',
      }}>
        <FileText size={15} style={{ flexShrink: 0 }} />
        <span style={{ flex: 1, minWidth: 200, fontSize: 12.5, lineHeight: 1.6 }}>
          The acceptable use policy has been updated. Please read it and confirm you are happy to carry on.{' '}
          <a href="/terms" target="_blank" rel="noopener noreferrer" style={{ color: '#3730a3', fontWeight: 700 }}>
            Read it
          </a>
        </span>
        {/* No dismiss. It is a question with an answer, not a notice — and a
            bar that can be closed without answering is a bar that is closed
            without being read. */}
        <button onClick={() => void agree()} disabled={busy} style={{
          padding: '7px 14px', borderRadius: 8, border: 'none', background: '#3730a3', color: '#fff',
          fontSize: 12.5, fontWeight: 700, cursor: busy ? 'default' : 'pointer', fontFamily: 'inherit',
        }}>
          {busy ? 'Saving…' : 'I accept'}
        </button>
      </div>
    );
  }

  if (!standing || closed) return null;
  const suspended = standing.state === 'suspended';

  return (
    <div role="status" style={{
      display: 'flex', gap: 10, alignItems: 'flex-start',
      padding: '11px clamp(14px, 3vw, 22px)',
      background: suspended ? '#fef2f2' : '#fffbeb',
      borderBottom: `1px solid ${suspended ? '#fecaca' : '#fde68a'}`,
      color: suspended ? '#991b1b' : '#92400e',
    }}>
      {suspended ? <ShieldX size={15} style={{ flexShrink: 0, marginTop: 2 }} /> : <AlertTriangle size={15} style={{ flexShrink: 0, marginTop: 2 }} />}
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 13, fontWeight: 800 }}>
          {suspended ? 'This account cannot send or publish' : 'A warning has been recorded on this account'}
        </div>
        <p style={{ margin: '3px 0 0', fontSize: 12.5, lineHeight: 1.6 }}>
          {standing.reason}
          {standing.clause && <span style={{ opacity: 0.8 }}> ({standing.clause})</span>}
          {suspended && (
            /* Said plainly, because it is the first thing somebody suspended
               wants to know and the thing they will otherwise assume the worst
               about. */
            <> You can still sign in, read everything and export your data. Reply to support to sort it out.</>
          )}
        </p>
      </div>
      {/* Only a warning can be closed. A suspension is the explanation for
          every refusal they are about to see, so it stays on the screen. */}
      {!suspended && (
        <button onClick={() => setClosed(true)} aria-label="Hide until next time"
          style={{ background: 'none', border: 0, padding: 2, cursor: 'pointer', color: 'inherit', flexShrink: 0 }}>
          <X size={14} />
        </button>
      )}
    </div>
  );
}
