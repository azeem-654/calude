import { useState, useEffect } from 'react';
import { Globe, Plus, Trash2, Eye, ExternalLink, Edit3, Copy, BarChart3, Search } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { useApp } from '../../context/AppContext';
import type { Website } from '../../types';
import WebsiteBuilder from './WebsiteBuilder';
import { buildWebsiteTemplatePages } from '../shared/pageTemplates';
import TemplateGallery from '../shared/TemplateGallery';
import { ScaledPage } from '../shared/BlockRender';
import { activeAccount } from '../../services/tenancy';
import SourceTag from '../shared/SourceTag';

const STARTER_TEMPLATES = [
  { id: 'blank',       name: 'Blank Site',          emoji: '📄', desc: 'Start from scratch with an empty canvas.',           color: '#f1f5f9' },
  { id: 'business',    name: 'Business Website',     emoji: '🏢', desc: 'Professional multi-page business site.',            color: 'linear-gradient(135deg,#1e3a5f,#2563eb)' },
  { id: 'portfolio',   name: 'Creative Portfolio',   emoji: '✨', desc: 'Stunning portfolio for designers & creatives.',     color: 'linear-gradient(135deg,#f59e0b,#ec4899)' },
  { id: 'saas',        name: 'SaaS / Startup',       emoji: '🚀', desc: 'Modern SaaS homepage with all the key sections.',  color: 'linear-gradient(135deg,#6366f1,#8b5cf6)' },
  { id: 'agency',      name: 'Digital Agency',        emoji: '🎨', desc: 'Bold dark-theme agency with gallery & services.',  color: '#0f172a' },
  { id: 'ecommerce',   name: 'eCommerce / Store',    emoji: '🛍️', desc: 'Product-focused shop with testimonials & CTA.',   color: 'linear-gradient(135deg,#ec4899,#f97316)' },
  { id: 'blog',        name: 'Blog / Magazine',       emoji: '📝', desc: 'Clean editorial layout for content creators.',     color: 'linear-gradient(135deg,#0891b2,#06b6d4)' },
  { id: 'consulting',  name: 'Consulting / Coach',   emoji: '💼', desc: 'Authoritative consulting page with lead capture.',  color: 'linear-gradient(135deg,#1e3a5f,#0f172a)' },
  { id: 'restaurant',  name: 'Restaurant / Cafe',    emoji: '🍽️', desc: 'Menu, gallery, reservations all included.',        color: 'linear-gradient(135deg,#b45309,#92400e)' },
  { id: 'nonprofit',   name: 'Nonprofit / Charity',  emoji: '❤️', desc: 'Mission-driven layout with donation CTA.',         color: 'linear-gradient(135deg,#dc2626,#7f1d1d)' },
];

function StatusBadge({ status }: { status: Website['status'] }) {
  const published = status === 'published';
  return (
    <span style={{ padding: '3px 9px', borderRadius: 20, fontSize: 11, fontWeight: 700, background: published ? '#dcfce7' : '#f1f5f9', color: published ? '#16a34a' : '#64748b' }}>
      {published ? '● Published' : '○ Draft'}
    </span>
  );
}

function StatChip({ icon, value, label }: { icon: string; value: string | number; label: string }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 12, color: '#64748b' }}>
      <span>{icon}</span><span style={{ fontWeight: 700, color: '#0f172a' }}>{value}</span><span>{label}</span>
    </div>
  );
}

function NewWebsiteModal({ onClose, onCreate }: { onClose: () => void; onCreate: (name: string, template: string) => void }) {
  const [name, setName] = useState('');
  const [selected, setSelected] = useState('blank');

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', zIndex: 200, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24 }}>
      <div style={{ background: '#fff', borderRadius: 16, padding: 32, width: '100%', maxWidth: 700, maxHeight: '90vh', overflowY: 'auto', boxShadow: '0 24px 64px rgba(0,0,0,0.2)' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 24 }}>
          <div>
            <h2 style={{ margin: 0, fontSize: 22, fontWeight: 800, color: '#0f172a' }}>Create New Website</h2>
            <p style={{ margin: '4px 0 0', color: '#64748b', fontSize: 14 }}>Pick a template and name your site</p>
          </div>
          <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 20, color: '#94a3b8', padding: 4 }}>✕</button>
        </div>

        <div style={{ marginBottom: 20 }}>
          <label style={{ display: 'block', fontSize: 13, fontWeight: 700, color: '#374151', marginBottom: 6 }}>Site Name</label>
          <input
            autoFocus
            value={name}
            onChange={e => setName(e.target.value)}
            placeholder="e.g. My Portfolio, Acme Corp Website..."
            style={{ width: '100%', padding: '10px 12px', border: '1px solid #e2e8f0', borderRadius: 8, fontSize: 14, outline: 'none', boxSizing: 'border-box' }}
          />
        </div>

        <div style={{ marginBottom: 24 }}>
          <label style={{ display: 'block', fontSize: 13, fontWeight: 700, color: '#374151', marginBottom: 10 }}>Choose a Template</label>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(min(180px, 100%), 1fr))', gap: 10 }}>
            {STARTER_TEMPLATES.map(t => (
              <div key={t.id} onClick={() => setSelected(t.id)}
                style={{ borderRadius: 10, overflow: 'hidden', border: selected === t.id ? '2px solid #6366f1' : '2px solid #e2e8f0', cursor: 'pointer', transition: 'all 0.15s', boxShadow: selected === t.id ? '0 0 0 3px #e0e7ff' : 'none' }}>
                <div style={{ height: 64, background: t.color, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 28 }}>{t.emoji}</div>
                <div style={{ padding: '8px 10px' }}>
                  <div style={{ fontWeight: 700, fontSize: 12, color: '#0f172a', marginBottom: 2 }}>{t.name}</div>
                  <div style={{ fontSize: 11, color: '#64748b', lineHeight: 1.4 }}>{t.desc}</div>
                </div>
              </div>
            ))}
          </div>
        </div>

        <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
          <button onClick={onClose} style={{ padding: '10px 20px', border: '1px solid #e2e8f0', borderRadius: 8, background: '#fff', color: '#374151', fontSize: 14, fontWeight: 600, cursor: 'pointer' }}>Cancel</button>
          <button onClick={() => { if (name.trim()) { onCreate(name.trim(), selected); onClose(); } }}
            disabled={!name.trim()}
            style={{ padding: '10px 24px', border: 'none', borderRadius: 8, background: name.trim() ? '#6366f1' : '#c7d2fe', color: '#fff', fontSize: 14, fontWeight: 700, cursor: name.trim() ? 'pointer' : 'not-allowed' }}>
            Create Website
          </button>
        </div>
      </div>
    </div>
  );
}

function DeleteConfirm({ name, onConfirm, onCancel }: { name: string; onConfirm: () => void; onCancel: () => void }) {
  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.4)', zIndex: 200, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <div style={{ background: '#fff', borderRadius: 12, padding: 28, maxWidth: 380, width: '90%', boxShadow: '0 16px 48px rgba(0,0,0,0.15)' }}>
        <div style={{ fontSize: 36, marginBottom: 12, textAlign: 'center' }}>🗑</div>
        <h3 style={{ margin: '0 0 8px', textAlign: 'center', color: '#0f172a' }}>Delete Website?</h3>
        <p style={{ margin: '0 0 20px', color: '#64748b', textAlign: 'center', fontSize: 14 }}>
          "<strong>{name}</strong>" will be permanently deleted. This cannot be undone.
        </p>
        <div style={{ display: 'flex', gap: 10 }}>
          <button onClick={onCancel} style={{ flex: 1, padding: '10px 0', border: '1px solid #e2e8f0', borderRadius: 8, background: '#fff', color: '#374151', fontWeight: 600, cursor: 'pointer', fontSize: 14 }}>Cancel</button>
          <button onClick={onConfirm} style={{ flex: 1, padding: '10px 0', border: 'none', borderRadius: 8, background: '#ef4444', color: '#fff', fontWeight: 700, cursor: 'pointer', fontSize: 14 }}>Delete</button>
        </div>
      </div>
    </div>
  );
}

export default function Websites() {
  const { websites, addWebsite, updateWebsite, deleteWebsite } = useApp();
  const navigate = useNavigate();
  const [showNew, setShowNew] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  /* The Analytics button on each card had no handler at all, unlike every
     other button beside it and unlike the equivalent one on a funnel card. */
  const [statsSite, setStatsSite] = useState<Website | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  // Name of a site just created from a template — opened once it exists in state.
  const [pendingOpen, setPendingOpen] = useState<string | null>(null);

  useEffect(() => {
    if (!pendingOpen) return;
    const fresh = websites.find(w => w.name === pendingOpen);
    if (fresh) { setEditingId(fresh.id); setPendingOpen(null); }
  }, [pendingOpen, websites]);

  const editingWebsite = editingId ? websites.find(w => w.id === editingId) : null;

  function handleCreate(name: string, template: string) {
    const acct = activeAccount();
    // Generate the template's REAL pages so the new site opens fully designed
    // (it previously created an empty site and ignored the chosen template).
    const pages = buildWebsiteTemplatePages(template, {
      name: name.trim() || acct?.businessName || 'Your Business',
      color: acct?.color || '#6366f1',
      tagline: acct?.industry ? `Trusted ${acct.industry.toLowerCase()} experts` : undefined,
    });
    addWebsite({
      name,
      template,
      status: 'draft',
      visitors: 0,
      pageViews: 0,
      pages,
      createdAt: new Date().toISOString(),
    });
  }

  function handleDuplicate(w: Website) {
    addWebsite({
      ...w,
      /* A copy is a new record. Spreading the original carried its id across,
         so the two sites shared one — editing either edited both, and deleting
         one deleted the pair. Funnels and designs already minted a fresh id
         here; this was the one that did not. */
      id: `site-${Date.now()}`,
      name: `${w.name} (Copy)`,
      status: 'draft',
      visitors: 0,
      pageViews: 0,
      createdAt: new Date().toISOString(),
    });
  }

  function handleSaveFromBuilder(updated: Website) {
    updateWebsite(updated.id, updated);
    setEditingId(null);
  }

  const filtered = websites.filter(w =>
    w.name.toLowerCase().includes(search.toLowerCase()) ||
    (w.description ?? '').toLowerCase().includes(search.toLowerCase())
  );

  if (editingWebsite) {
    return (
      <WebsiteBuilder
        website={editingWebsite}
        onSave={handleSaveFromBuilder}
        onPersist={site => updateWebsite(site.id, site)}
        onClose={() => setEditingId(null)}
      />
    );
  }

  return (
    <div style={{ padding: '32px', minHeight: '100vh', background: '#f8fafc', fontFamily: 'Inter, system-ui, sans-serif' }}>
      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 28, gap: 12, flexWrap: 'wrap' }}>
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 4 }}>
            <Globe size={26} color="#6366f1" />
            <h1 style={{ margin: 0, fontSize: 26, fontWeight: 800, color: '#0f172a' }}>Websites</h1>
          </div>
          <p style={{ margin: 0, color: '#64748b', fontSize: 14 }}>Build and manage professional websites with a drag-and-drop editor</p>
        </div>
        <button onClick={() => setShowNew(true)}
          style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '11px 20px', background: '#6366f1', color: '#fff', border: 'none', borderRadius: 10, fontSize: 14, fontWeight: 700, cursor: 'pointer', boxShadow: '0 2px 8px rgba(99,102,241,0.3)' }}>
          <Plus size={18} /> New Website
        </button>
      </div>

      {/* Funnels | Websites tabs — same control as the Funnels page, for parity */}
      <div style={{ display: 'inline-flex', gap: 2, padding: 3, borderRadius: 10, border: '1px solid #e2e8f0', backgroundColor: '#f1f5f9', marginBottom: 24 }}>
        <button onClick={() => navigate('/funnels')} style={{ padding: '6px 18px', border: 'none', borderRadius: 8, backgroundColor: 'transparent', color: '#64748b', fontSize: 13, fontWeight: 500, cursor: 'pointer' }}>
          Funnels
        </button>
        <button onClick={() => {}} style={{ padding: '6px 18px', border: 'none', borderRadius: 8, backgroundColor: 'white', color: '#0f172a', fontSize: 13, fontWeight: 600, cursor: 'default', boxShadow: '0 1px 2px rgba(16,24,40,0.08)' }}>
          Websites
        </button>
      </div>

      {/* Stats row */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(160px, 100%), 1fr))', gap: 16, marginBottom: 28 }}>
        {[
          { label: 'Total Sites', value: websites.length, icon: '🌐', color: '#6366f1' },
          { label: 'Published', value: websites.filter(w => w.status === 'published').length, icon: '✅', color: '#22c55e' },
          { label: 'Total Visitors', value: websites.reduce((a, w) => a + (w.visitors ?? 0), 0).toLocaleString(), icon: '👥', color: '#f59e0b' },
        ].map(s => (
          <div key={s.label} style={{ background: '#fff', borderRadius: 12, padding: '20px 24px', boxShadow: '0 1px 4px rgba(0,0,0,0.06)', display: 'flex', alignItems: 'center', gap: 16 }}>
            <div style={{ width: 48, height: 48, borderRadius: 12, background: `${s.color}15`, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 22 }}>{s.icon}</div>
            <div>
              <div style={{ fontSize: 24, fontWeight: 800, color: '#0f172a' }}>{s.value}</div>
              <div style={{ fontSize: 13, color: '#64748b' }}>{s.label}</div>
            </div>
          </div>
        ))}
      </div>

      {/* Search */}
      <div style={{ position: 'relative', marginBottom: 20, maxWidth: 360 }}>
        <Search size={16} style={{ position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)', color: '#94a3b8' }} />
        <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search websites..."
          style={{ width: '100%', padding: '9px 12px 9px 36px', border: '1px solid #e2e8f0', borderRadius: 8, fontSize: 14, outline: 'none', boxSizing: 'border-box', background: '#fff' }} />
      </div>

      {/* Website cards */}
      {filtered.length === 0 ? (
        <div style={{ textAlign: 'center', padding: '80px 0', color: '#94a3b8' }}>
          <Globe size={56} style={{ marginBottom: 16, opacity: 0.3 }} />
          <div style={{ fontSize: 20, fontWeight: 700, marginBottom: 8, color: '#475569' }}>
            {search ? 'No websites found' : 'No websites yet'}
          </div>
          <div style={{ fontSize: 14, marginBottom: 24 }}>
            {search ? 'Try a different search.' : 'Create your first website to get started.'}
          </div>
          {!search && (
            <button onClick={() => setShowNew(true)}
              style={{ padding: '10px 24px', background: '#6366f1', color: '#fff', border: 'none', borderRadius: 8, fontSize: 14, fontWeight: 700, cursor: 'pointer' }}>
              + Create Website
            </button>
          )}
        </div>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(min(340px, 100%), 1fr))', gap: 20 }}>
          {filtered.map(w => {
            const tpl = STARTER_TEMPLATES.find(t => t.id === w.template) ?? STARTER_TEMPLATES[0];
            return (
              <div key={w.id} style={{ background: '#fff', borderRadius: 14, overflow: 'hidden', boxShadow: '0 1px 6px rgba(0,0,0,0.07)', border: '1px solid #f1f5f9', transition: 'box-shadow 0.15s' }}
                onMouseEnter={e => (e.currentTarget as HTMLDivElement).style.boxShadow = '0 4px 20px rgba(0,0,0,0.1)'}
                onMouseLeave={e => (e.currentTarget as HTMLDivElement).style.boxShadow = '0 1px 6px rgba(0,0,0,0.07)'}>
                {/* Live preview thumbnail — hover to scroll the real page */}
                <div style={{ height: 150, position: 'relative', borderBottom: '1px solid #f1f5f9' }}>
                  {w.pages?.length ? (
                    <ScaledPage page={w.pages[0]} height={150} />
                  ) : (
                    <div style={{ height: 150, background: tpl.color, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                      <span style={{ fontSize: 52 }}>{tpl.emoji}</span>
                    </div>
                  )}
                  <div style={{ position: 'absolute', top: 10, right: 10 }}><StatusBadge status={w.status} /></div>
                </div>

                {/* Card body */}
                <div style={{ padding: '16px 18px' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 8 }}>
                    <div>
                      <h3 style={{ margin: '0 0 2px', fontSize: 16, fontWeight: 800, color: '#0f172a' }}>{w.name}</h3>
                      {w.source && <div style={{ margin: '4px 0 2px' }}><SourceTag source={w.source} size="compact" /></div>}
                      {w.domain && <div style={{ fontSize: 12, color: '#6366f1', fontWeight: 600 }}>{w.domain}</div>}
                      {!w.domain && <div style={{ fontSize: 12, color: '#94a3b8' }}>{tpl.name}</div>}
                    </div>
                  </div>

                  {w.description && <p style={{ margin: '0 0 12px', fontSize: 13, color: '#64748b', lineHeight: 1.5 }}>{w.description}</p>}

                  <div style={{ display: 'flex', gap: 16, marginBottom: 14, flexWrap: 'wrap' }}>
                    <StatChip icon="👥" value={(w.visitors ?? 0).toLocaleString()} label="visitors" />
                    <StatChip icon="📄" value={(w.pages?.length ?? 0)} label="pages" />
                    <StatChip icon="📊" value={(w.pageViews ?? 0).toLocaleString()} label="views" />
                  </div>

                  {/* Action buttons */}
                  <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                    <button onClick={() => setEditingId(w.id)}
                      style={{ flex: 1, padding: '8px 0', background: '#6366f1', color: '#fff', border: 'none', borderRadius: 8, fontSize: 13, fontWeight: 700, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 5 }}>
                      <Edit3 size={14} /> Open Builder
                    </button>
                    <button title="Preview site" onClick={() => navigate(`/preview/${w.id}`)}
                      style={{ padding: '8px 10px', border: '1px solid #e2e8f0', borderRadius: 8, background: '#fff', cursor: 'pointer', display: 'flex', alignItems: 'center', color: '#6366f1' }}>
                      <ExternalLink size={15} />
                    </button>
                    <button title="Toggle published" onClick={() => updateWebsite(w.id, { status: w.status === 'published' ? 'draft' : 'published' })}
                      style={{ padding: '8px 10px', border: '1px solid #e2e8f0', borderRadius: 8, background: '#fff', cursor: 'pointer', display: 'flex', alignItems: 'center', color: w.status === 'published' ? '#22c55e' : '#94a3b8' }}>
                      <Eye size={15} />
                    </button>
                    <button title="Duplicate" onClick={() => handleDuplicate(w)}
                      style={{ padding: '8px 10px', border: '1px solid #e2e8f0', borderRadius: 8, background: '#fff', cursor: 'pointer', display: 'flex', alignItems: 'center', color: '#64748b' }}>
                      <Copy size={15} />
                    </button>
                    <button title="Analytics" onClick={() => setStatsSite(w)}
                      style={{ padding: '8px 10px', border: '1px solid #e2e8f0', borderRadius: 8, background: '#fff', cursor: 'pointer', display: 'flex', alignItems: 'center', color: '#64748b' }}>
                      <BarChart3 size={15} />
                    </button>
                    <button title="Delete" onClick={() => setDeletingId(w.id)}
                      style={{ padding: '8px 10px', border: '1px solid #fee2e2', borderRadius: 8, background: '#fff', cursor: 'pointer', display: 'flex', alignItems: 'center', color: '#ef4444' }}>
                      <Trash2 size={15} />
                    </button>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {showNew && (
        <TemplateGallery
          ctx={{
            name: activeAccount()?.businessName || 'Your Business',
            color: activeAccount()?.color || '#6366f1',
            tagline: activeAccount()?.industry ? `Trusted ${activeAccount()!.industry.toLowerCase()} experts` : undefined,
          }}
          kind="website"
          title="Choose a website template"
          onClose={() => setShowNew(false)}
          onUse={(meta, pages) => {
            const site = {
              name: meta.name,
              template: meta.websiteTemplate ?? 'business',
              description: meta.description,
              status: 'draft' as const,
              visitors: 0, pageViews: 0,
              pages,
              createdAt: new Date().toISOString(),
            };
            addWebsite(site);
            setShowNew(false);
            // Open the builder on the new site as soon as it lands in state.
            setPendingOpen(meta.name);
          }}
        />
      )}
      {statsSite && (
        <div style={{ position: 'fixed', inset: 0, zIndex: 1000, background: 'rgba(15,23,42,0.55)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20 }}
          onClick={() => setStatsSite(null)}>
          <div onClick={e => e.stopPropagation()} style={{ background: '#fff', borderRadius: 16, padding: 26, width: 'min(520px,100%)', boxShadow: '0 24px 60px rgba(15,23,42,0.3)' }}>
            <h3 style={{ margin: '0 0 4px', fontSize: 18, fontWeight: 800, color: '#0f172a' }}>{statsSite.name}</h3>
            <p style={{ margin: '0 0 18px', fontSize: 12.5, color: '#64748b' }}>
              {statsSite.status === 'published' ? 'Published' : 'Draft'} · {statsSite.pages?.length ?? 0} page{(statsSite.pages?.length ?? 0) === 1 ? '' : 's'}
            </p>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 12, marginBottom: 18 }}>
              {[
                { l: 'Visitors', v: (statsSite.visitors ?? 0).toLocaleString(), c: '#17191c' },
                { l: 'Page views', v: (statsSite.pageViews ?? 0).toLocaleString(), c: '#6366f1' },
                { l: 'Views / visitor', v: statsSite.visitors > 0 ? (statsSite.pageViews / statsSite.visitors).toFixed(1) : '—', c: '#22c55e' },
              ].map(m => (
                <div key={m.l} style={{ background: '#f8fafc', borderRadius: 12, padding: '14px 12px', textAlign: 'center' }}>
                  <div style={{ fontSize: 22, fontWeight: 800, color: m.c }}>{m.v}</div>
                  <div style={{ fontSize: 11, color: '#94a3b8', marginTop: 2 }}>{m.l}</div>
                </div>
              ))}
            </div>
            <p style={{ fontSize: 11.5, color: '#94a3b8', margin: '0 0 16px', lineHeight: 1.55 }}>
              {statsSite.status === 'published'
                ? 'Counted from real visits to this site.'
                : 'This site is still a draft, so there is nothing to count yet — publish it to start recording visits.'}
            </p>
            <button onClick={() => setStatsSite(null)} style={{ width: '100%', padding: '10px 0', borderRadius: 9, border: 'none', background: '#17191c', color: '#fff', fontWeight: 700, fontSize: 13, cursor: 'pointer' }}>Close</button>
          </div>
        </div>
      )}

      {deletingId && (
        <DeleteConfirm
          name={websites.find(w => w.id === deletingId)?.name ?? ''}
          onConfirm={() => { deleteWebsite(deletingId); setDeletingId(null); }}
          onCancel={() => setDeletingId(null)}
        />
      )}
    </div>
  );
}
