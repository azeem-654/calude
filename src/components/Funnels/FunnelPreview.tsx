/**
 * FunnelPreview.tsx — the live, rendered view of a funnel exactly as a visitor
 * sees it. Reads the funnel from app state on every render, so re-opening after
 * an edit always shows the current content.
 *
 * Supports desktop/mobile device toggle, page switching, and real form
 * submission that creates a CRM contact.
 */
import { useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import { Monitor, Smartphone, ArrowLeft, Check } from 'lucide-react';
import { useApp } from '../../context/AppContext';
import { PageBlocks } from '../shared/BlockRender';
import type { FunnelStep } from '../../types';

export default function FunnelPreview() {
  const { funnelId } = useParams<{ funnelId: string }>();
  const { funnels, addContact, updateFunnel } = useApp();
  const funnel = funnels.find(f => f.id === funnelId);
  const [device, setDevice] = useState<'desktop' | 'mobile'>('desktop');
  const [pageIdx, setPageIdx] = useState(0);
  const [submitted, setSubmitted] = useState(false);

  if (!funnel) {
    return (
      <div style={{ minHeight: '100vh', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', background: '#f8fafc', fontFamily: 'Inter, system-ui, sans-serif' }}>
        <div style={{ fontSize: 60, marginBottom: 14 }}>🔍</div>
        <h2 style={{ fontSize: 23, fontWeight: 800, color: '#0f172a', margin: '0 0 8px' }}>Funnel not found</h2>
        <p style={{ color: '#64748b', margin: '0 0 22px' }}>It may have been deleted.</p>
        <Link to="/funnels" style={{ padding: '10px 22px', background: '#6366f1', color: '#fff', borderRadius: 9, textDecoration: 'none', fontWeight: 700 }}>← Back to Funnels</Link>
      </div>
    );
  }

  const pages: FunnelStep[] = funnel.pages ?? [];
  const page = pages[Math.min(pageIdx, Math.max(0, pages.length - 1))];
  const frameW = device === 'desktop' ? 1100 : 390;

  /**
   * Capture a real lead from any form on the page: creates a CRM contact and
   * counts the conversion against the funnel.
   */
  /**
   * A visitor pressing the button on the page.
   *
   * The blocks render inputs and a button but no <form> and no handler, so the
   * call to action on a funnel page did nothing at all — the owner previewing
   * their own funnel filled it in, pressed the button, and watched nothing
   * happen. Any press inside the rendered page is treated as the submit it
   * looks like.
   */
  const handlePageClick = (e: React.MouseEvent<HTMLDivElement>) => {
    const el = (e.target as HTMLElement)?.closest('button, [type="submit"]');
    if (!el) return;
    e.preventDefault();
    captureLead();
  };

  const captureLead = () => {
    const root = document.getElementById('funnel-preview-body');
    if (!root) return;
    const inputs = Array.from(root.querySelectorAll('input')) as HTMLInputElement[];
    const byType = (t: string) => inputs.find(i => i.type === t)?.value?.trim() ?? '';
    const email = byType('email');
    const name = inputs.find(i => i.type === 'text')?.value?.trim() || email.split('@')[0] || 'Website lead';
    if (!email) { alert('Enter an email address to submit this form.'); return; }

    const today = new Date().toISOString().split('T')[0];
    addContact({
      name, email, phone: byType('tel'),
      status: 'lead', tags: ['Funnel lead', funnel.name],
      source: `Funnel: ${funnel.name}`,
      createdAt: today, lastActivity: today, value: 0,
    });
    updateFunnel(funnel.id, { conversions: (funnel.conversions ?? 0) + 1, visitors: Math.max(funnel.visitors ?? 0, 1) });
    setSubmitted(true);
    inputs.forEach(i => { i.value = ''; });
    // Advance to the next page, mirroring a real funnel's redirect.
    if (pageIdx < pages.length - 1) setTimeout(() => { setPageIdx(i => i + 1); setSubmitted(false); }, 1400);
  };

  return (
    <div style={{ minHeight: '100vh', fontFamily: 'Inter, system-ui, sans-serif', background: '#e2e8f0' }}>
      {/* Preview bar */}
      <div style={{ position: 'sticky', top: 0, zIndex: 200, height: 46, background: '#0f172a', display: 'flex', alignItems: 'center', gap: 12, padding: '0 14px' }}>
        <Link to="/funnels" style={{ color: '#94a3b8', textDecoration: 'none', fontSize: 12, fontWeight: 600, display: 'flex', alignItems: 'center', gap: 5 }}>
          <ArrowLeft size={13} /> Back
        </Link>
        <div style={{ width: 1, height: 16, background: '#334155' }} />
        <span style={{ color: '#f8fafc', fontSize: 12.5, fontWeight: 700 }}>{funnel.name}</span>
        <span style={{ padding: '2px 8px', borderRadius: 10, fontSize: 10, fontWeight: 700, background: funnel.status === 'active' ? '#dcfce7' : '#1e293b', color: funnel.status === 'active' ? '#16a34a' : '#94a3b8' }}>
          {funnel.status === 'active' ? 'Published' : 'Draft'}
        </span>

        {pages.length > 1 && (
          <div style={{ display: 'flex', gap: 3, marginLeft: 6, overflowX: 'auto' }}>
            {pages.map((p, i) => (
              <button key={p.id} onClick={() => { setPageIdx(i); setSubmitted(false); }}
                style={{ padding: '4px 11px', borderRadius: 6, border: 'none', cursor: 'pointer', whiteSpace: 'nowrap',
                  background: i === pageIdx ? '#6366f1' : 'transparent', color: i === pageIdx ? '#fff' : '#94a3b8', fontSize: 11, fontWeight: 600 }}>
                {p.name}
              </button>
            ))}
          </div>
        )}

        <div style={{ flex: 1 }} />

        <div style={{ display: 'flex', gap: 2, padding: 3, borderRadius: 8, background: 'rgba(255,255,255,0.08)' }}>
          {([['desktop', Monitor], ['mobile', Smartphone]] as const).map(([d, Icon]) => (
            <button key={d} onClick={() => setDevice(d)} title={d}
              style={{ padding: '5px 11px', borderRadius: 6, border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 5,
                background: device === d ? '#fff' : 'transparent', color: device === d ? '#0f172a' : '#cbd5e1', fontSize: 11, fontWeight: 700 }}>
              <Icon size={12} /> {d === 'desktop' ? 'Desktop' : 'Mobile'}
            </button>
          ))}
        </div>
        <button onClick={captureLead}
          style={{ padding: '6px 14px', borderRadius: 8, border: 'none', background: '#22c55e', color: '#fff', fontSize: 11.5, fontWeight: 700, cursor: 'pointer', whiteSpace: 'nowrap' }}>
          Test form submit
        </button>
      </div>

      {submitted && (
        <div style={{ position: 'fixed', top: 60, left: '50%', transform: 'translateX(-50%)', zIndex: 300, background: '#16a34a', color: '#fff', padding: '10px 20px', borderRadius: 10, fontSize: 13, fontWeight: 700, display: 'flex', alignItems: 'center', gap: 8, boxShadow: '0 10px 30px rgba(22,163,74,0.35)' }}>
          <Check size={15} /> Lead captured — contact added to your CRM
        </div>
      )}

      {/* Rendered funnel page */}
      <div id="funnel-preview-body" onClick={handlePageClick} style={{ padding: device === 'mobile' ? '20px 0' : 0 }}>
        {page ? (
          <div style={{ width: frameW, maxWidth: '100%', margin: '0 auto', background: '#fff', boxShadow: '0 0 40px rgba(15,23,42,0.18)', borderRadius: device === 'mobile' ? 16 : 0, overflow: 'hidden' }}>
            <PageBlocks page={page} />
          </div>
        ) : (
          <div style={{ padding: '120px 40px', textAlign: 'center', color: '#94a3b8' }}>
            <div style={{ fontSize: 54, marginBottom: 14 }}>📄</div>
            <div style={{ fontSize: 19, fontWeight: 700, color: '#475569', marginBottom: 6 }}>This funnel has no pages yet</div>
            <div style={{ fontSize: 14 }}>Open the builder to add one.</div>
          </div>
        )}
      </div>
    </div>
  );
}
