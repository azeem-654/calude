/**
 * Send one real email, exactly as a campaign would, and say what happened.
 *
 * The connection test proves the server will let you sign in. That is not the
 * same as proving a campaign arrives: the message a campaign sends carries
 * merge fields, a tracking pixel, wrapped links and a signed unsubscribe URL,
 * and any of those can be the thing a host rejects or a filter dislikes.
 *
 * So this sends the real anatomy — not a bare "test" line — to an address you
 * name, and reports which transport carried it and what the server said. It is
 * meant to be run on the deployed host, because that is the only place where
 * the SMTP ports are open and the PHP endpoints are served by PHP.
 *
 * Nothing here is simulated. If it says the message went, a message went.
 */
import { useState } from 'react';
import { Send, CheckCircle, XCircle, Loader, Info } from 'lucide-react';
import { loadEmailConfig, sendEmail } from '../../services/emailService';
import { unsubscribeUrl, applyUnsubscribe } from '../../services/unsubscribe';
import { instrumentHtml } from '../../services/contactEmail';

interface Outcome {
  ok: boolean;
  message: string;
  /** What the message carried, so a failure can be read against its cause. */
  carried: { label: string; present: boolean }[];
}

export default function DeliveryCheck() {
  const [to, setTo] = useState('');
  const [state, setState] = useState<'idle' | 'sending' | 'done'>('idle');
  const [outcome, setOutcome] = useState<Outcome | null>(null);

  const cfg = loadEmailConfig();
  const configured = cfg.provider !== 'none';

  const run = async () => {
    const address = to.trim();
    if (!address) return;
    setState('sending');
    setOutcome(null);

    /* The same three steps the sender does, in the same order, so what lands in
       the inbox is what a campaign would put there. */
    const id = `check-${Date.now()}`;
    const unsub = await unsubscribeUrl(address, 'delivery-check').catch(() => null);
    const body = applyUnsubscribe(
      `<p>Hello {{firstName}},</p>
       <p>This is a delivery check from your CRM. If it is in your inbox, sending works from this server.</p>
       <p><a href="https://example.com/link-test">This link is wrapped for click tracking</a></p>
       <p style="font-size:12px;color:#888">Sent to {{email}} · <a href="{{unsubscribe}}">Unsubscribe</a></p>`,
      unsub,
    );
    const html = instrumentHtml(
      body.replace(/\{\{\s*firstName\s*\}\}/gi, address.split('@')[0]).replace(/\{\{\s*email\s*\}\}/gi, address),
      id,
    );

    const result = await sendEmail(cfg, {
      to: address,
      subject: 'Delivery check from your CRM',
      html,
      ...(unsub ? { unsubscribeUrl: unsub } : {}),
    });

    setOutcome({
      ok: !!result.success,
      message: result.success
        ? (result.id === 'server-mail'
          ? 'Handed to this host\'s own mail relay. It should arrive, but the relay gives no delivery result — connect SMTP for a reply you can read.'
          : 'The mail server accepted the message. Check the inbox — and the spam folder, which is where an unauthenticated domain lands.')
        : (result.error || 'The send failed and the server gave no reason.'),
      carried: [
        { label: 'Merge fields filled in', present: !/\{\{/.test(html) },
        { label: 'Open-tracking pixel', present: /track\.php\?o=/.test(html) },
        { label: 'Links wrapped for click tracking', present: /track\.php\?c=/.test(html) },
        { label: 'Signed unsubscribe link', present: !!unsub && /[?&]t=[0-9a-f]{8,}/.test(unsub) },
        { label: 'List-Unsubscribe header sent', present: !!unsub },
      ],
    });
    setState('done');
  };

  return (
    <div style={{ backgroundColor: 'white', borderRadius: 18, border: '1px solid #e6e9f0', boxShadow: '0 1px 2px rgba(16,24,40,0.04)', padding: 24, marginBottom: 20 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 18, paddingBottom: 16, borderBottom: '1px solid #f1f5f9' }}>
        <div style={{ width: 42, height: 42, borderRadius: 12, backgroundColor: '#f0f1f3', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
          <Send size={19} color="#17191c" />
        </div>
        <div style={{ minWidth: 0 }}>
          <h3 style={{ fontSize: 15, fontWeight: 700, color: '#0f172a', margin: 0 }}>Delivery check</h3>
          <p style={{ fontSize: 12, color: '#64748b', margin: '2px 0 0', lineHeight: 1.5 }}>
            Sends one real email built the way a campaign builds one — merge fields, tracking pixel, wrapped
            links and a signed unsubscribe — and reports what the mail server said.
          </p>
        </div>
      </div>

      {!configured && (
        <div style={{ display: 'flex', gap: 8, padding: '10px 12px', backgroundColor: '#fffbeb', border: '1px solid #fde68a', borderRadius: 9, marginBottom: 14 }}>
          <Info size={14} color="#d97706" style={{ marginTop: 2, flexShrink: 0 }} />
          <p style={{ fontSize: 12, color: '#92400e', margin: 0, lineHeight: 1.5 }}>
            No sending provider is set up yet. Save your SMTP settings above first, then come back.
          </p>
        </div>
      )}

      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
        <input
          type="email"
          value={to}
          onChange={e => setTo(e.target.value)}
          onKeyDown={e => { if (e.key === 'Enter' && to.trim() && state !== 'sending') void run(); }}
          placeholder="Send it to which address?"
          aria-label="Address to send the delivery check to"
          style={{ flex: '1 1 240px', minWidth: 0, padding: '9px 12px', border: '1px solid #e2e8f0', borderRadius: 9, fontSize: 13, outline: 'none', boxSizing: 'border-box', fontFamily: 'inherit' }}
        />
        <button
          onClick={run}
          disabled={!to.trim() || state === 'sending'}
          style={{
            display: 'flex', alignItems: 'center', gap: 7, padding: '9px 18px', border: 'none', borderRadius: 9,
            backgroundColor: !to.trim() || state === 'sending' ? '#e2e8f0' : '#17191c',
            color: !to.trim() || state === 'sending' ? '#94a3b8' : 'white',
            fontSize: 13, fontWeight: 600, cursor: !to.trim() || state === 'sending' ? 'not-allowed' : 'pointer',
          }}
        >
          {state === 'sending'
            ? <><Loader size={14} style={{ animation: 'spin 1s linear infinite' }} /> Sending…</>
            : <><Send size={14} /> Send the check</>}
        </button>
      </div>

      {outcome && (
        <div style={{ marginTop: 16 }}>
          <div style={{
            display: 'flex', alignItems: 'flex-start', gap: 9, padding: '11px 13px', borderRadius: 9,
            backgroundColor: outcome.ok ? '#f0fdf4' : '#fef2f2',
            border: `1px solid ${outcome.ok ? '#bbf7d0' : '#fecaca'}`,
          }}>
            {outcome.ok
              ? <CheckCircle size={15} color="#16a34a" style={{ marginTop: 1, flexShrink: 0 }} />
              : <XCircle size={15} color="#dc2626" style={{ marginTop: 1, flexShrink: 0 }} />}
            <p style={{ fontSize: 12.5, color: outcome.ok ? '#166534' : '#991b1b', margin: 0, lineHeight: 1.55, whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>
              {outcome.message}
            </p>
          </div>

          <p style={{ fontSize: 11, fontWeight: 700, color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.05em', margin: '14px 0 7px' }}>
            What the message carried
          </p>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
            {outcome.carried.map(c => (
              <div key={c.label} style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12.5, color: '#334155' }}>
                {c.present
                  ? <CheckCircle size={13} color="#16a34a" style={{ flexShrink: 0 }} />
                  : <XCircle size={13} color="#dc2626" style={{ flexShrink: 0 }} />}
                {c.label}
              </div>
            ))}
          </div>

          <p style={{ fontSize: 11.5, color: '#64748b', margin: '14px 0 0', lineHeight: 1.6 }}>
            Arriving is not the same as arriving in the inbox. If it lands in spam, the message is fine and the
            domain is the problem — add an SPF record for this host and a DKIM key with your DNS provider.
          </p>
        </div>
      )}
    </div>
  );
}
