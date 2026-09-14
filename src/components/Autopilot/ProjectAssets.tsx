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
  Globe, Mail, Monitor, Filter, ExternalLink, Pencil, Plus, Loader, Clock,
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

        {/* ── Buy more, from here ── */}
        {buying ? (
          <div style={{ marginTop: 10 }}>
            <DigitalSetupStep
              companyName={companyName || projectName}
              contactEmail={contactEmail}
              projectId={projectId}
              onOrder={() => setBuying(false)}
            />
            <button onClick={() => setBuying(false)} style={{ ...link, marginTop: 8 }}>Cancel</button>
          </div>
        ) : (
          <button onClick={() => setBuying(true)} style={{
            display: 'inline-flex', alignItems: 'center', gap: 6, marginTop: 6,
            padding: '8px 13px', borderRadius: 9, border: `1px solid ${LINE}`,
            background: '#fff', color: INK, fontSize: 12, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit',
          }}>
            <Plus size={12} /> {has ? 'Add a domain or mailboxes' : 'Buy a domain, email and website'}
          </button>
        )}
      </div>
    </div>
  );
}
