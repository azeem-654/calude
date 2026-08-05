import { useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import { useApp } from '../../context/AppContext';
import type { FunnelStep } from '../../types';
import { BlockRender } from '../shared/BlockRender';

function PageContent({ page }: { page: FunnelStep }) {
  return (
    <>
      {page.blocks.map(block => <BlockRender key={block.id} block={block} />)}
    </>
  );
}

export default function SitePreview() {
  const { siteId } = useParams<{ siteId: string }>();
  const { websites } = useApp();
  const site = websites.find(w => w.id === siteId);
  const [activePage, setActivePage] = useState(0);

  if (!site) {
    return (
      <div style={{ minHeight: '100vh', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', fontFamily: 'Inter, system-ui, sans-serif', background: '#f8fafc' }}>
        <div style={{ fontSize: 64, marginBottom: 16 }}>🔍</div>
        <h2 style={{ fontSize: 24, fontWeight: 800, color: '#0f172a', marginBottom: 8 }}>Site not found</h2>
        <p style={{ color: '#64748b', marginBottom: 24 }}>The website you're looking for doesn't exist or has been removed.</p>
        <Link to="/websites" style={{ padding: '10px 24px', background: '#6366f1', color: '#fff', borderRadius: 8, textDecoration: 'none', fontWeight: 700 }}>← Back to Websites</Link>
      </div>
    );
  }

  const pages = site.pages ?? [];
  const currentPage = pages[activePage] ?? null;

  return (
    <div style={{ minHeight: '100vh', fontFamily: 'Inter, system-ui, sans-serif' }}>
      {/* Preview bar */}
      <div style={{ position: 'fixed', top: 0, left: 0, right: 0, height: 40, background: '#0f172a', display: 'flex', alignItems: 'center', padding: '0 16px', gap: 12, zIndex: 200, borderBottom: '1px solid #1e293b' }}>
        <Link to="/websites" style={{ color: '#94a3b8', textDecoration: 'none', fontSize: 12, fontWeight: 600, display: 'flex', alignItems: 'center', gap: 5 }}>← Back</Link>
        <div style={{ width: 1, height: 16, background: '#334155' }} />
        <span style={{ color: '#f8fafc', fontSize: 12, fontWeight: 700 }}>{site.name}</span>
        <span style={{ padding: '2px 8px', borderRadius: 10, fontSize: 10, fontWeight: 700, background: site.status === 'published' ? '#dcfce7' : '#f1f5f9', color: site.status === 'published' ? '#16a34a' : '#64748b' }}>{site.status}</span>
        {pages.length > 1 && (
          <>
            <div style={{ flex: 1 }} />
            {pages.map((p, i) => (
              <button key={p.id} onClick={() => setActivePage(i)}
                style={{ padding: '3px 10px', borderRadius: 6, border: 'none', background: activePage === i ? '#6366f1' : 'transparent', color: activePage === i ? '#fff' : '#94a3b8', fontSize: 11, fontWeight: 600, cursor: 'pointer' }}>
                {p.name}
              </button>
            ))}
          </>
        )}
      </div>

      {/* Site content */}
      <div style={{ paddingTop: 40 }}>
        {currentPage ? (
          <PageContent page={currentPage} />
        ) : (
          <div style={{ padding: '120px 60px', textAlign: 'center', color: '#94a3b8' }}>
            <div style={{ fontSize: 56, marginBottom: 16 }}>🌐</div>
            <div style={{ fontSize: 20, fontWeight: 700, color: '#475569', marginBottom: 8 }}>No content yet</div>
            <div style={{ fontSize: 14 }}>Open the Website Builder to add blocks to this page.</div>
          </div>
        )}
      </div>
    </div>
  );
}
