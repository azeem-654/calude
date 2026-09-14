/**
 * Your own address for your clients.
 *
 * ── Two tiers, and the screen says which is which ──
 *
 * A **free subdomain** works the moment it is claimed: the certificate that
 * covers the platform already covers it, so there is nothing to verify and
 * nothing to wait for. A reseller can hand their client a branded link in ten
 * seconds.
 *
 * **Your own domain** is a different promise. Serving somebody else's hostname
 * over HTTPS means holding a certificate for it, which needs DNS the customer
 * controls and a paid product on the operator's side. When that is not switched
 * on, the option is shown as unavailable rather than hidden — a reseller
 * deciding whether to buy the plan should be able to see what the plan gets
 * them — and when it is on, the address stays `pending` and shows the exact
 * records to add until it genuinely works.
 *
 * Nothing here ever says "live" before a browser could actually open it.
 */
import { useCallback, useEffect, useState } from 'react';
import {
  Globe, Plus, Loader, Check, Copy, Trash2, AlertCircle, RefreshCw, Clock, ExternalLink,
} from 'lucide-react';
import { useApp } from '../../context/AppContext';
import { activeBranding } from '../../services/tenancy';
import {
  addDomain, brandingPayload, checkDomain, listDomains, removeDomain,
  type CustomDomain, type DomainList,
} from '../../services/whitelabel';

const INK = '#17191c';
const MUTED = '#6b7280';
const LINE = '#e6e9f0';
const ACCENT = '#5b46e5';

const inp: React.CSSProperties = {
  padding: '9px 11px', border: `1px solid ${LINE}`, borderRadius: 9,
  fontSize: 13, color: INK, outline: 'none', fontFamily: 'inherit', boxSizing: 'border-box',
};

const TONE: Record<string, { bg: string; fg: string; label: string }> = {
  active: { bg: '#e8f6ee', fg: '#0f7b3d', label: 'Live' },
  pending: { bg: '#fff7e6', fg: '#7a4d00', label: 'Waiting for DNS' },
  verifying: { bg: '#eef2f8', fg: '#3a4a63', label: 'Checking' },
  failed: { bg: '#fdf3f3', fg: '#b42318', label: 'Did not work' },
};

/** One record the customer has to add, with the value ready to copy. */
function Record({ type, name, value, onCopy }: {
  type: string; name: string; value: string; onCopy: (v: string) => void;
}) {
  if (!value) return null;
  return (
    <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap', padding: '7px 0' }}>
      <span style={{ fontSize: 10.5, fontWeight: 700, color: '#475569', background: '#eceef3', padding: '2px 7px', borderRadius: 5, minWidth: 44, textAlign: 'center' }}>
        {type}
      </span>
      <span style={{ fontSize: 11.5, color: MUTED, fontFamily: 'ui-monospace, monospace', wordBreak: 'break-all' }}>{name}</span>
      <span style={{ fontSize: 11.5, color: INK, fontFamily: 'ui-monospace, monospace', flex: 1, minWidth: 140, wordBreak: 'break-all' }}>{value}</span>
      <button onClick={() => onCopy(value)} aria-label={`Copy the ${type} value`}
        style={{ border: `1px solid ${LINE}`, background: '#fff', borderRadius: 7, padding: '4px 7px', cursor: 'pointer', color: MUTED, display: 'flex' }}>
        <Copy size={11} />
      </button>
    </div>
  );
}

export default function WhiteLabelPanel() {
  const { addNotification } = useApp();
  const [state, setState] = useState<DomainList | null>(null);
  const [loading, setLoading] = useState(true);
  const [slug, setSlug] = useState('');
  const [hostname, setHostname] = useState('');
  const [busy, setBusy] = useState('');

  const branding = () => brandingPayload(activeBranding());

  const load = useCallback(async () => {
    const r = await listDomains();
    setState(r);
    setLoading(false);
  }, []);

  useEffect(() => { void load(); }, [load]);

  const copy = (v: string) => {
    void navigator.clipboard?.writeText(v);
    addNotification('Copied.', 'success');
  };

  const claimSubdomain = async () => {
    setBusy('sub');
    const r = await addDomain({ kind: 'subdomain', slug, branding: branding() });
    setBusy('');
    if (r.error) { addNotification(r.error, 'error'); return; }
    setSlug('');
    await load();
    addNotification('Your address is live. Send your clients straight to it.', 'success');
  };

  const claimCustom = async () => {
    setBusy('custom');
    const r = await addDomain({ kind: 'custom', hostname, branding: branding() });
    setBusy('');
    if (r.error) { addNotification(r.error, 'error'); return; }
    setHostname('');
    await load();
    addNotification('Added. Put the records below into your DNS, then press Check.', 'info');
  };

  const check = async (h: string) => {
    setBusy(h);
    const r = await checkDomain(h, branding());
    setBusy('');
    if (r.error) { addNotification(r.error, 'error'); return; }
    const found = r.domains.find(x => x.hostname === h);
    await load();
    addNotification(
      found?.status === 'active' ? `${h} is live.` : `${h} is not ready yet — the records may take a few minutes to spread.`,
      found?.status === 'active' ? 'success' : 'info',
    );
  };

  const drop = async (h: string) => {
    if (!window.confirm(`Stop serving ${h}? Anybody using that address will no longer be able to sign in there.`)) return;
    setBusy(h);
    const r = await removeDomain(h);
    setBusy('');
    if (r.error) { addNotification(r.error, 'error'); return; }
    await load();
    addNotification(`${h} removed.`, 'success');
  };

  if (loading) return <p style={{ fontSize: 13, color: MUTED }}>Loading your addresses…</p>;

  const s = state!;
  const hasSubdomain = s.domains.some(d => d.kind === 'subdomain');

  return (
    <div style={{ display: 'grid', gap: 16 }}>
      {s.domains.map((d: CustomDomain) => {
        const tone = TONE[d.status] ?? TONE.pending;
        return (
          <div key={d.hostname} style={{ border: `1px solid ${LINE}`, borderRadius: 12, background: '#fff', padding: 14 }}>
            <div style={{ display: 'flex', gap: 9, alignItems: 'center', flexWrap: 'wrap' }}>
              <Globe size={14} color={ACCENT} />
              <span style={{ fontSize: 13.5, fontWeight: 700, color: INK, flex: 1, minWidth: 140, wordBreak: 'break-all' }}>
                {d.hostname}
              </span>
              <span style={{ fontSize: 10.5, fontWeight: 700, padding: '3px 9px', borderRadius: 999, background: tone.bg, color: tone.fg }}>
                {tone.label}
              </span>
              {d.status === 'active' && (
                <a href={`https://${d.hostname}`} target="_blank" rel="noopener noreferrer"
                  style={{ display: 'inline-flex', alignItems: 'center', gap: 4, fontSize: 11.5, fontWeight: 700, color: INK, textDecoration: 'none', border: `1px solid ${LINE}`, borderRadius: 7, padding: '4px 9px' }}>
                  <ExternalLink size={11} /> Open
                </a>
              )}
              {d.kind === 'custom' && (
                <button onClick={() => void check(d.hostname)} disabled={busy === d.hostname}
                  style={{ display: 'inline-flex', alignItems: 'center', gap: 4, fontSize: 11.5, fontWeight: 700, color: INK, background: '#fff', border: `1px solid ${LINE}`, borderRadius: 7, padding: '4px 9px', cursor: 'pointer', fontFamily: 'inherit' }}>
                  {busy === d.hostname ? <Loader size={11} className="spin" /> : <RefreshCw size={11} />} Check
                </button>
              )}
              <button onClick={() => void drop(d.hostname)} aria-label={`Remove ${d.hostname}`}
                style={{ border: 'none', background: 'none', color: '#b42318', cursor: 'pointer', padding: 3, display: 'flex' }}>
                <Trash2 size={13} />
              </button>
            </div>

            {/* The records, and only while they still matter. */}
            {d.kind === 'custom' && d.status !== 'active' && (
              <div style={{ marginTop: 10, padding: '10px 12px', borderRadius: 10, background: '#fafbfc', border: `1px solid ${LINE}` }}>
                <div style={{ fontSize: 11.5, fontWeight: 700, color: '#475569', marginBottom: 4 }}>
                  Add these two records where {d.hostname.split('.').slice(-2).join('.')} is managed
                </div>
                <Record type="CNAME" name={d.hostname} value={d.dnsTarget} onCopy={copy} />
                <Record type="TXT" name={d.dnsTxtName} value={d.dnsTxtValue} onCopy={copy} />
                <p style={{ margin: '6px 0 0', fontSize: 11, color: MUTED, lineHeight: 1.6, display: 'flex', gap: 6, alignItems: 'flex-start' }}>
                  <Clock size={11} style={{ flexShrink: 0, marginTop: 2 }} />
                  DNS can take a few minutes to a few hours. Press Check when you have added them — nothing
                  breaks if you press it early.
                </p>
                {d.lastError && (
                  <p style={{ margin: '7px 0 0', fontSize: 11, color: '#b42318', lineHeight: 1.5 }}>{d.lastError}</p>
                )}
              </div>
            )}
          </div>
        );
      })}

      {/* ── A free subdomain ── */}
      {!hasSubdomain && (
        <div style={{ border: `1px solid ${LINE}`, borderRadius: 12, background: '#fff', padding: 14 }}>
          <div style={{ fontSize: 13, fontWeight: 800, color: INK }}>A free address, live straight away</div>
          <p style={{ margin: '4px 0 10px', fontSize: 11.5, color: MUTED, lineHeight: 1.6 }}>
            Your clients sign in here under your name and your logo. Nothing to set up.
          </p>
          <div style={{ display: 'flex', gap: 7, alignItems: 'center', flexWrap: 'wrap' }}>
            <input value={slug} placeholder="youragency"
              onChange={e => setSlug(e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, ''))}
              style={{ ...inp, width: 150 }} />
            <span style={{ fontSize: 13, color: MUTED }}>.{s.subdomainSuffix}</span>
            <button onClick={() => void claimSubdomain()} disabled={busy === 'sub' || slug.length < 3}
              style={{
                display: 'inline-flex', alignItems: 'center', gap: 6, padding: '9px 15px',
                border: 'none', borderRadius: 9, background: busy === 'sub' || slug.length < 3 ? '#c7c9d3' : INK,
                color: '#fff', fontSize: 12.5, fontWeight: 700,
                cursor: busy === 'sub' || slug.length < 3 ? 'not-allowed' : 'pointer', fontFamily: 'inherit',
              }}>
              {busy === 'sub' ? <Loader size={13} className="spin" /> : <Check size={13} />} Claim it
            </button>
          </div>
        </div>
      )}

      {/* ── Their own domain ── */}
      <div style={{ border: `1px solid ${LINE}`, borderRadius: 12, background: '#fff', padding: 14, opacity: s.customAvailable ? 1 : 0.75 }}>
        <div style={{ fontSize: 13, fontWeight: 800, color: INK }}>Your own domain</div>
        <p style={{ margin: '4px 0 10px', fontSize: 11.5, color: MUTED, lineHeight: 1.6 }}>
          Put your clients on an address you own, like <code>app.youragency.com</code>. You add two DNS
          records; we handle the certificate.
        </p>

        {s.customAvailable ? (
          <div style={{ display: 'flex', gap: 7, alignItems: 'center', flexWrap: 'wrap' }}>
            <input value={hostname} placeholder="app.youragency.com"
              onChange={e => setHostname(e.target.value.toLowerCase().replace(/[^a-z0-9.-]/g, ''))}
              style={{ ...inp, flex: 1, minWidth: 190 }} />
            <button onClick={() => void claimCustom()} disabled={busy === 'custom' || !hostname.includes('.')}
              style={{
                display: 'inline-flex', alignItems: 'center', gap: 6, padding: '9px 15px',
                border: 'none', borderRadius: 9,
                background: busy === 'custom' || !hostname.includes('.') ? '#c7c9d3' : INK,
                color: '#fff', fontSize: 12.5, fontWeight: 700,
                cursor: busy === 'custom' || !hostname.includes('.') ? 'not-allowed' : 'pointer', fontFamily: 'inherit',
              }}>
              {busy === 'custom' ? <Loader size={13} className="spin" /> : <Plus size={13} />} Add it
            </button>
          </div>
        ) : (
          /* Shown as unavailable rather than hidden: somebody deciding whether
             to ask for it should be able to see that it exists. */
          <div style={{ display: 'flex', gap: 9, alignItems: 'flex-start', padding: '11px 12px', borderRadius: 10, background: '#fffbeb', border: '1px solid #fde68a' }}>
            <AlertCircle size={14} color="#b45309" style={{ flexShrink: 0, marginTop: 1 }} />
            <p style={{ margin: 0, fontSize: 11.5, color: '#78350f', lineHeight: 1.6 }}>
              Not switched on for this installation yet. The free address above works now and does the
              same job for your clients.
            </p>
          </div>
        )}
      </div>

      <p style={{ margin: 0, fontSize: 11.5, color: MUTED, lineHeight: 1.6 }}>
        Whichever address your clients use, they see the name, logo and colour you set under Branding.
        Change those and press Check on an address to push the new look to its sign-in screen.
      </p>
    </div>
  );
}
