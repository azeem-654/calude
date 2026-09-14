/**
 * The links a reseller hands to their own clients.
 *
 * ── Why this sits on the Autopilot screen ──
 *
 * It is a per-client thing, and this is the screen organised by client. Putting
 * it in Settings would file "show my client their progress" next to SMTP ports,
 * which is where features go to never be found.
 *
 * ── What the copy has to do ──
 *
 * Make the trade obvious before the link is created, not after. Anybody sharing
 * a URL that needs no password is right to want to know exactly what is behind
 * it, and "a report, not a login" is the whole answer. The alternative — a
 * reseller discovering the scope by opening it themselves and hoping — is how
 * somebody ends up not using it at all.
 */
import { useEffect, useState } from 'react';
import { Link2, Copy, Eye, EyeOff, Loader, Plus, ExternalLink, ShieldCheck } from 'lucide-react';
import { useApp } from '../../context/AppContext';
import {
  createPortal, listPortals, portalUrl, setPortalEnabled, type Portal,
} from '../../services/clientPortal';
import type { Portfolio } from '../../services/projects';

const INK = '#17191c';
const MUTED = '#6b7280';
const LINE = '#e6e9f0';
const ACCENT = '#5b46e5';

export default function ClientLinks({ portfolios }: { portfolios: Portfolio[] }) {
  const { addNotification } = useApp();
  const [portals, setPortals] = useState<Portal[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState('');
  const [open, setOpen] = useState(false);

  useEffect(() => {
    let live = true;
    void (async () => {
      const p = await listPortals();
      if (!live) return;
      setPortals(p);
      setLoading(false);
    })();
    return () => { live = false; };
  }, []);

  const make = async (portfolioId: string) => {
    setBusy(portfolioId);
    const r = await createPortal(portfolioId);
    setBusy('');
    if (r.error) { addNotification(r.error, 'error'); return; }
    setPortals(r.portals);
    void navigator.clipboard?.writeText(portalUrl(r.token));
    addNotification('Link created and copied. Send it to your client.', 'success');
  };

  const toggle = async (token: string, on: boolean) => {
    if (!on && !window.confirm('Revoke this link? Anybody holding it will stop being able to open the report.')) return;
    setBusy(token);
    const r = await setPortalEnabled(token, on);
    setBusy('');
    if (r.error) { addNotification(r.error, 'error'); return; }
    setPortals(r.portals);
    addNotification(on ? 'Link switched back on.' : 'Link revoked.', 'success');
  };

  const copy = (token: string) => {
    void navigator.clipboard?.writeText(portalUrl(token));
    addNotification('Copied.', 'success');
  };

  /* Only clients without a live link are worth offering. */
  const covered = new Set(portals.filter(p => p.enabled === 1).map(p => p.portfolioId));
  const available = portfolios.filter(p => !covered.has(p.id));

  if (loading) return null;

  return (
    <section style={{ border: `1px solid ${LINE}`, borderRadius: 16, background: '#fff', overflow: 'hidden' }}>
      <button onClick={() => setOpen(o => !o)} style={{
        display: 'flex', alignItems: 'center', gap: 10, width: '100%', textAlign: 'left',
        padding: '13px 16px', border: 'none', background: '#fafbfc', cursor: 'pointer', fontFamily: 'inherit',
      }}>
        <Link2 size={15} color={ACCENT} />
        <span style={{ flex: 1, minWidth: 0 }}>
          <span style={{ display: 'block', fontSize: 13.5, fontWeight: 800, color: INK }}>
            Share progress with your clients
          </span>
          <span style={{ display: 'block', fontSize: 11.5, color: MUTED, marginTop: 1 }}>
            {portals.filter(p => p.enabled === 1).length > 0
              ? `${portals.filter(p => p.enabled === 1).length} link${portals.filter(p => p.enabled === 1).length === 1 ? '' : 's'} live`
              : 'A read-only page they can open without an account'}
          </span>
        </span>
        <span style={{ fontSize: 11.5, fontWeight: 700, color: MUTED }}>{open ? 'Hide' : 'Show'}</span>
      </button>

      {open && (
        <div style={{ padding: 16, display: 'grid', gap: 12 }}>
          {/* The trade, stated before anything is created. */}
          <div style={{ display: 'flex', gap: 9, alignItems: 'flex-start', padding: '11px 12px', borderRadius: 11, background: '#f4f7fb' }}>
            <ShieldCheck size={15} color="#1e3a5f" style={{ flexShrink: 0, marginTop: 1 }} />
            <p style={{ margin: 0, fontSize: 11.5, color: '#1e3a5f', lineHeight: 1.6 }}>
              Anybody with the link can read that one client's progress — their projects, how far the
              work has got, and what has been done. They <strong>cannot</strong> see your other clients,
              your contacts, your prices or anything they could change. Revoke it any time.
            </p>
          </div>

          {portals.map(p => {
            const live = p.enabled === 1;
            return (
              <div key={p.token} style={{
                border: `1px solid ${LINE}`, borderRadius: 12, padding: '11px 13px',
                display: 'flex', gap: 9, alignItems: 'center', flexWrap: 'wrap',
                opacity: live ? 1 : 0.6,
              }}>
                <span style={{ flex: 1, minWidth: 130 }}>
                  <span style={{ display: 'block', fontSize: 13, fontWeight: 700, color: INK }}>
                    {p.clientName || p.label}
                  </span>
                  <span style={{ display: 'block', fontSize: 11, color: MUTED, marginTop: 1 }}>
                    {/* Whether they ever opened it. The one thing a reseller
                        actually wants to know about a link they sent. */}
                    {p.views > 0
                      ? `Opened ${p.views} time${p.views === 1 ? '' : 's'}`
                      : 'Not opened yet'}
                    {!live && ' · revoked'}
                  </span>
                </span>

                {live && (<>
                  <button onClick={() => copy(p.token)} style={btn}>
                    <Copy size={11} /> Copy link
                  </button>
                  <a href={portalUrl(p.token)} target="_blank" rel="noopener noreferrer" style={{ ...btn, textDecoration: 'none' }}>
                    <ExternalLink size={11} /> Preview
                  </a>
                </>)}

                <button onClick={() => void toggle(p.token, !live)} disabled={busy === p.token} style={{
                  ...btn, color: live ? '#b42318' : INK,
                }}>
                  {busy === p.token ? <Loader size={11} className="spin" /> : live ? <EyeOff size={11} /> : <Eye size={11} />}
                  {live ? 'Revoke' : 'Switch on'}
                </button>
              </div>
            );
          })}

          {available.length > 0 && (
            <div style={{ display: 'grid', gap: 7 }}>
              <span style={{ fontSize: 11.5, fontWeight: 700, color: '#475569' }}>Create a link for</span>
              <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                {available.map(pf => (
                  <button key={pf.id} onClick={() => void make(pf.id)} disabled={busy === pf.id} style={{
                    ...btn, padding: '7px 12px', fontSize: 12,
                  }}>
                    {busy === pf.id ? <Loader size={11} className="spin" /> : <Plus size={11} />} {pf.name}
                  </button>
                ))}
              </div>
            </div>
          )}

          {!portals.length && !available.length && (
            <p style={{ margin: 0, fontSize: 12.5, color: MUTED, lineHeight: 1.6 }}>
              Add a client first — a link is per client, so there has to be one to share.
            </p>
          )}
        </div>
      )}
    </section>
  );
}

const btn: React.CSSProperties = {
  display: 'inline-flex', alignItems: 'center', gap: 5, padding: '6px 11px',
  border: `1px solid ${LINE}`, borderRadius: 8, background: '#fff',
  color: INK, fontSize: 11.5, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit',
};
