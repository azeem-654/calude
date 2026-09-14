/**
 * What this project actually has, on the card where somebody looks for it.
 *
 * ── Why here and not in Settings ──
 *
 * A project is the unit somebody thinks in — "the roofing push" — and its
 * domain, its mailboxes and its website are facts about that push, not about
 * the workspace. Putting them three screens away in Settings meant the answer
 * to "does this one have a website yet" was a hunt, and the answer to "can I
 * buy it one" was nothing at all.
 *
 * ── Why the link goes to the builder, not the live page ──
 *
 * Both are offered, and they are different intentions. **Open** is "show me
 * what a visitor sees"; **Edit** is "take me to where I change it". A single
 * link has to guess, and guesses wrong about half the time.
 *
 * Nothing here knows who anything was bought from. It shows names, addresses
 * and prices, and the endpoint behind it sends nothing else.
 */
import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Globe, Mail, Monitor, Filter, ExternalLink, Pencil, Plus, Loader, Clock, X,
} from 'lucide-react';
import { projectAssets, type ProjectAssets as Assets } from '../../services/digitalSetup';
import DigitalSetupStep from '../Setup/DigitalSetupStep';

const INK = '#17191c';
const MUTED = '#6b7280';
const LINE = '#e6e9f0';
const ACCENT = '#5b46e5';

function Row({ icon: Icon, title, sub, actions }: {
  icon: typeof Globe; title: string; sub: string; actions?: React.ReactNode;
}) {
  return (
    <div style={{ display: 'flex', gap: 9, alignItems: 'flex-start', padding: '9px 0' }}>
      <Icon size={13} color={ACCENT} style={{ flexShrink: 0, marginTop: 3 }} />
      <div style={{ minWidth: 0, flex: 1 }}>
        <div style={{ fontSize: 12.5, fontWeight: 700, color: INK, overflow: 'hidden', textOverflow: 'ellipsis' }}>{title}</div>
        {sub && <div style={{ fontSize: 11, color: MUTED, marginTop: 1, lineHeight: 1.5 }}>{sub}</div>}
        {actions && <div style={{ display: 'flex', gap: 6, marginTop: 6, flexWrap: 'wrap' }}>{actions}</div>}
      </div>
    </div>
  );
}

const link: React.CSSProperties = {
  display: 'inline-flex', alignItems: 'center', gap: 4, padding: '4px 9px',
  borderRadius: 7, border: `1px solid ${LINE}`, background: '#fff',
  color: INK, fontSize: 11, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit',
};

export default function ProjectAssets({ projectId, projectName, companyName, contactEmail }: {
  projectId: string;
  projectName: string;
  companyName: string;
  contactEmail: string;
}) {
  const navigate = useNavigate();
  const [assets, setAssets] = useState<Assets | null>(null);
  const [loading, setLoading] = useState(true);
  const [buying, setBuying] = useState(false);

  useEffect(() => {
    let live = true;
    void (async () => {
      const a = await projectAssets(projectId);
      if (!live) return;
      setAssets(a);
      setLoading(false);
    })();
    return () => { live = false; };
  }, [projectId]);

  if (loading) {
    return <div style={{ padding: '10px 0', fontSize: 12, color: MUTED }}>Loading what this project has…</div>;
  }

  const a = assets!;
  const has = a.domains.length > 0 || a.sites.length > 0 || a.mailboxes.length > 0;

  return (
    <div style={{ border: `1px solid ${LINE}`, borderRadius: 14, background: '#fff', overflow: 'hidden' }}>
      <div style={{ padding: '11px 13px', borderBottom: `1px solid ${LINE}`, background: '#fafbfc' }}>
        <div style={{ fontSize: 12.5, fontWeight: 800, color: INK }}>What this project has</div>
        <div style={{ fontSize: 11, color: MUTED, marginTop: 1 }}>
          Its domain, email and website — and where to change them.
        </div>
      </div>

      <div style={{ padding: '4px 13px 13px' }}>
        {/* Still being built. Said plainly so an empty list is not read as a
            failure while provisioning is two minutes from finishing. */}
        {a.pending.map(p => (
          <Row key={p.id} icon={Clock} title={`${p.domain} — being set up`}
            sub="Registering, creating mailboxes and publishing the site."
            actions={
              <button style={link} onClick={() => navigate(`/autopilot?setup=${p.id}`)}>
                <Loader size={10} className="spin" /> Watch progress
              </button>
            } />
        ))}

        {a.domains.map(dm => (
          <Row key={dm} icon={Globe} title={dm} sub="Registered to this workspace"
            actions={
              <button style={link} onClick={() => navigate('/settings?tab=digital-setup')}>
                <Pencil size={10} /> DNS records
              </button>
            } />
        ))}

        {a.mailboxes.length > 0 && (
          <Row icon={Mail}
            title={`${a.mailboxes.length} mailbox${a.mailboxes.length === 1 ? '' : 'es'}`}
            sub={a.mailboxes.map(m => m.address).join(', ')}
            actions={
              <button style={link} onClick={() => navigate('/settings?tab=digital-setup')}>
                <Pencil size={10} /> Manage email
              </button>
            } />
        )}

        {a.sites.map(site => (
          <Row key={site.id} icon={Monitor}
            title={site.name}
            sub={site.status === 'published'
              ? `Published${site.domain ? ` — www.${site.domain}` : ''}`
              : 'Draft — not visible to anybody yet'}
            actions={<>
              {/* Two links, because they are two different intentions. */}
              {site.status === 'published' && site.domain && (
                <a href={`https://www.${site.domain}`} target="_blank" rel="noopener noreferrer" style={{ ...link, textDecoration: 'none' }}>
                  <ExternalLink size={10} /> Open
                </a>
              )}
              <button style={link} onClick={() => navigate('/websites')}>
                <Pencil size={10} /> Edit site
              </button>
            </>} />
        ))}

        {a.funnels.map(f => (
          <Row key={f.id} icon={Filter} title={f.name} sub={f.status === 'published' ? 'Published' : 'Draft'}
            actions={
              <button style={link} onClick={() => navigate('/funnels')}>
                <Pencil size={10} /> Edit funnel
              </button>
            } />
        ))}

        {!has && !a.pending.length && (
          <p style={{ margin: '8px 0 10px', fontSize: 11.5, color: MUTED, lineHeight: 1.6 }}>
            Nothing bought for this project yet. Autopilot still writes and plans everything — it just
            sends from a mailbox you connect yourself, and has no site of its own.
          </p>
        )}

        {/* ── Buy more ── */}
        <button onClick={() => setBuying(true)} style={{
          display: 'inline-flex', alignItems: 'center', gap: 6, marginTop: 6,
          padding: '8px 13px', borderRadius: 9, border: `1px solid ${LINE}`,
          background: '#fff', color: INK, fontSize: 12, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit',
        }}>
          <Plus size={12} /> {has ? 'Add a domain or mailboxes' : 'Buy a domain, email and website'}
        </button>
      </div>

      {/*
        A dialog, not the column.
        
        A board column is 320px wide. Choosing a domain means reading eight
        names with prices, then five mailbox toggles, then a bill — which in
        that width is a scroll inside a scroll, and the total ends up below the
        fold on the screen where somebody is about to spend money. A purchase
        deserves the whole window.

        Kept on this screen rather than sending them to a separate section,
        because the thing being bought belongs to *this* project: navigating
        away loses which project it was for, and coming back is a second
        decision nobody asked for.
      */}
      {buying && (
        <div
          role="dialog" aria-modal="true" aria-label="Buy a domain and email"
          onClick={e => { if (e.target === e.currentTarget) setBuying(false); }}
          onKeyDown={e => { if (e.key === 'Escape') setBuying(false); }}
          style={{
            position: 'fixed', inset: 0, zIndex: 120, background: 'rgba(15,17,20,0.45)',
            display: 'flex', alignItems: 'flex-start', justifyContent: 'center',
            padding: 'clamp(12px, 4vh, 44px) clamp(12px, 4vw, 32px)', overflowY: 'auto',
          }}>
          <div style={{
            background: '#fff', borderRadius: 18, width: '100%', maxWidth: 560,
            boxShadow: '0 24px 60px rgba(16,24,40,0.24)', overflow: 'hidden',
          }}>
            <div style={{
              display: 'flex', alignItems: 'center', gap: 10,
              padding: '14px 18px', borderBottom: `1px solid ${LINE}`, background: '#fcfcfd',
            }}>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 14, fontWeight: 800, color: INK }}>Set up {companyName || projectName}</div>
                <div style={{ fontSize: 11.5, color: MUTED, marginTop: 1 }}>
                  Domain, business email and a starter website — bought for this project.
                </div>
              </div>
              <button onClick={() => setBuying(false)} aria-label="Close"
                style={{ border: 'none', background: 'none', cursor: 'pointer', color: MUTED, padding: 4, display: 'flex' }}>
                <X size={17} />
              </button>
            </div>

            <div style={{ padding: 16 }}>
              <DigitalSetupStep
                companyName={companyName || projectName}
                contactEmail={contactEmail}
                projectId={projectId}
                onOrder={() => setBuying(false)}
              />
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
