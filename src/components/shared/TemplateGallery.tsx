/**
 * TemplateGallery.tsx — browsable template library with live previews.
 *
 * Thumbnails are the REAL page rendered and CSS-scaled, so what a user
 * previews is exactly what gets created (no screenshot pipeline to drift out
 * of date, and no blank placeholder boxes).
 *
 *  - hover a card  → the thumbnail scrolls through the full page
 *  - click a card  → full-screen modal, desktop/mobile toggle, page switcher
 *  - Use template  → hands the built pages to the caller
 */
import { useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import { X, Search, Monitor, Smartphone, Star, Check, Layers } from 'lucide-react';
import type { FunnelStep } from '../../types';
import { PageBlocks } from './BlockRender';
import {
  TEMPLATE_CATALOG, TEMPLATE_CATEGORIES, buildTemplatePages,
  type TemplateMeta, type BrandContext, type TemplateCategory,
} from './pageTemplates';

const INK = '#17191c';

function Stars({ n }: { n: number }) {
  return (
    <span style={{ display: 'inline-flex', gap: 1 }}>
      {[1, 2, 3, 4, 5].map(i => (
        <Star key={i} size={10} strokeWidth={0} fill={i <= n ? '#f59e0b' : '#e2e8f0'} />
      ))}
    </span>
  );
}

/** Scaled, non-interactive render of a real page. */
function Thumb({ page, height, width = 1100, hoverScroll }: { page: FunnelStep; height: number; width?: number; hoverScroll?: boolean }) {
  const scale = 300 / width;
  return (
    <div className={hoverScroll ? 'tpl-preview' : undefined}
      style={{ position: 'relative', height, overflow: 'hidden', background: '#fff' }}>
      <div className={hoverScroll ? 'tpl-preview-inner' : undefined}
        style={{
          position: 'absolute', top: 0, left: 0, width,
          transform: `scale(${scale})`, transformOrigin: 'top left', pointerEvents: 'none',
          ['--tpl-scale' as string]: String(scale),
        }}>
        <PageBlocks page={page} />
      </div>
    </div>
  );
}

/** Full-screen preview with device toggle and page switching. */
function PreviewModal({ meta, pages, onClose, onUse }: {
  meta: TemplateMeta; pages: FunnelStep[]; onClose: () => void; onUse: () => void;
}) {
  const [device, setDevice] = useState<'desktop' | 'mobile'>('desktop');
  const [pageIdx, setPageIdx] = useState(0);
  const page = pages[Math.min(pageIdx, pages.length - 1)];
  const frameW = device === 'desktop' ? 1100 : 390;

  return createPortal(
    <div style={{ position: 'fixed', inset: 0, zIndex: 5000, background: 'rgba(15,23,42,0.75)', backdropFilter: 'blur(4px)', display: 'flex', flexDirection: 'column' }}>
      {/* Modal top bar */}
      <div style={{ height: 58, background: '#0f172a', display: 'flex', alignItems: 'center', gap: 14, padding: '0 18px', flexShrink: 0 }}>
        <div style={{ minWidth: 0 }}>
          <div style={{ color: '#f8fafc', fontWeight: 800, fontSize: 15, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{meta.name}</div>
          <div style={{ color: '#94a3b8', fontSize: 11 }}>{meta.category} · {meta.industry} · {pages.length} page{pages.length > 1 ? 's' : ''}</div>
        </div>

        {/* Page switcher */}
        {pages.length > 1 && (
          <div style={{ display: 'flex', gap: 4, marginLeft: 10, overflowX: 'auto' }}>
            {pages.map((p, i) => (
              <button key={p.id} onClick={() => setPageIdx(i)}
                style={{ padding: '5px 12px', borderRadius: 7, border: 'none', cursor: 'pointer', whiteSpace: 'nowrap',
                  background: i === pageIdx ? '#6366f1' : 'rgba(255,255,255,0.08)', color: i === pageIdx ? '#fff' : '#cbd5e1', fontSize: 11.5, fontWeight: 700 }}>
                {p.name}
              </button>
            ))}
          </div>
        )}

        <div style={{ flex: 1 }} />

        {/* Device toggle */}
        <div style={{ display: 'flex', gap: 2, padding: 3, borderRadius: 9, background: 'rgba(255,255,255,0.08)' }}>
          {([['desktop', Monitor], ['mobile', Smartphone]] as const).map(([d, Icon]) => (
            <button key={d} onClick={() => setDevice(d)} title={d === 'desktop' ? 'Desktop' : 'Mobile'}
              style={{ padding: '6px 12px', borderRadius: 7, border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 5,
                background: device === d ? '#fff' : 'transparent', color: device === d ? INK : '#cbd5e1', fontSize: 11.5, fontWeight: 700 }}>
              <Icon size={13} /> {d === 'desktop' ? 'Desktop' : 'Mobile'}
            </button>
          ))}
        </div>

        <button onClick={onUse}
          style={{ display: 'flex', alignItems: 'center', gap: 7, padding: '9px 20px', borderRadius: 9, border: 'none', background: '#6366f1', color: '#fff', fontSize: 13, fontWeight: 800, cursor: 'pointer', whiteSpace: 'nowrap' }}>
          <Check size={15} /> Use this template
        </button>
        <button onClick={onClose} title="Close"
          style={{ width: 36, height: 36, borderRadius: 9, border: '1px solid rgba(255,255,255,0.15)', background: 'transparent', color: '#cbd5e1', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
          <X size={17} />
        </button>
      </div>

      {/* Rendered page — real blocks, scrollable, at true device width */}
      <div style={{ flex: 1, overflowY: 'auto', background: '#e2e8f0', padding: device === 'mobile' ? '22px 0' : 0 }}>
        <div style={{
          width: frameW, maxWidth: '100%', margin: '0 auto', background: '#fff',
          boxShadow: '0 0 50px rgba(0,0,0,0.28)',
          borderRadius: device === 'mobile' ? 18 : 0, overflow: 'hidden',
        }}>
          <PageBlocks page={page} />
        </div>
      </div>
    </div>,
    document.body,
  );
}

export default function TemplateGallery({ ctx, kind, onUse, onClose, title = 'Choose a template' }: {
  ctx: BrandContext;
  /** Limit the library to funnels or websites; omit for everything. */
  kind?: 'funnel' | 'website';
  onUse: (meta: TemplateMeta, pages: FunnelStep[]) => void;
  onClose: () => void;
  title?: string;
}) {
  const [category, setCategory] = useState<TemplateCategory | 'All'>('All');
  const [search, setSearch] = useState('');
  const [previewing, setPreviewing] = useState<TemplateMeta | null>(null);

  const list = useMemo(() => TEMPLATE_CATALOG.filter(t =>
    (!kind || t.kind === kind) &&
    (category === 'All' || t.category === category) &&
    (!search.trim() ||
      t.name.toLowerCase().includes(search.toLowerCase()) ||
      t.industry.toLowerCase().includes(search.toLowerCase()) ||
      t.description.toLowerCase().includes(search.toLowerCase()))
  ), [kind, category, search]);

  // Build pages lazily per visible template and memoize by id.
  const pagesFor = useMemo(() => {
    const cache = new Map<string, FunnelStep[]>();
    return (m: TemplateMeta) => {
      if (!cache.has(m.id)) cache.set(m.id, buildTemplatePages(m, ctx));
      return cache.get(m.id)!;
    };
  }, [ctx]);

  const cats: (TemplateCategory | 'All')[] = ['All', ...TEMPLATE_CATEGORIES.filter(c => {
    if (!kind) return true;
    return TEMPLATE_CATALOG.some(t => t.category === c && t.kind === kind);
  })];

  return createPortal(
    <div style={{ position: 'fixed', inset: 0, zIndex: 4500, background: 'rgba(15,23,42,0.6)', backdropFilter: 'blur(4px)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20 }}>
      <div style={{ width: 'min(1180px, 100%)', height: 'min(88vh, 900px)', background: '#fff', borderRadius: 18, display: 'flex', flexDirection: 'column', overflow: 'hidden', boxShadow: '0 30px 70px -12px rgba(15,23,42,0.4)' }}>
        {/* Header */}
        <div style={{ padding: '18px 22px 14px', borderBottom: '1px solid #e2e8f0', display: 'flex', alignItems: 'center', gap: 14, flexShrink: 0 }}>
          <div style={{ flex: 1, minWidth: 0 }}>
            <h2 style={{ fontSize: 19, fontWeight: 800, color: '#0f172a', margin: 0, letterSpacing: '-0.02em' }}>{title}</h2>
            <p style={{ fontSize: 12.5, color: '#64748b', margin: '3px 0 0' }}>
              {list.length} templates · hover to scroll a preview, click to open it full screen
            </p>
          </div>
          <div style={{ position: 'relative', width: 240 }}>
            <Search size={14} style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', color: '#94a3b8' }} />
            <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search templates…"
              style={{ width: '100%', padding: '8px 10px 8px 31px', border: '1px solid #e2e8f0', borderRadius: 9, fontSize: 13, outline: 'none', boxSizing: 'border-box' }} />
          </div>
          <button onClick={onClose} style={{ width: 34, height: 34, borderRadius: 9, border: '1px solid #e2e8f0', background: '#fff', cursor: 'pointer', color: '#64748b', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
            <X size={17} />
          </button>
        </div>

        <div style={{ display: 'flex', flex: 1, overflow: 'hidden' }}>
          {/* Categories */}
          <div style={{ width: 176, borderRight: '1px solid #e2e8f0', padding: 10, overflowY: 'auto', flexShrink: 0 }}>
            {cats.map(c => (
              <button key={c} onClick={() => setCategory(c)}
                style={{ width: '100%', textAlign: 'left', padding: '8px 11px', borderRadius: 8, border: 'none', marginBottom: 2, cursor: 'pointer',
                  background: category === c ? '#eef2ff' : 'transparent', color: category === c ? '#4f46e5' : '#475569',
                  fontSize: 12.5, fontWeight: category === c ? 700 : 500 }}>
                {c}
              </button>
            ))}
          </div>

          {/* Grid */}
          <div style={{ flex: 1, overflowY: 'auto', padding: 16, background: '#f8fafc' }}>
            {list.length === 0 ? (
              <div style={{ textAlign: 'center', padding: '80px 20px', color: '#94a3b8' }}>
                <Layers size={40} style={{ opacity: 0.3, marginBottom: 12 }} />
                <p style={{ fontWeight: 700, color: '#475569', margin: '0 0 4px' }}>No templates match</p>
                <p style={{ fontSize: 13, margin: 0 }}>Try a different search or category.</p>
              </div>
            ) : (
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(232px, 1fr))', gap: 14 }}>
                {list.map(meta => {
                  const pages = pagesFor(meta);
                  return (
                    <div key={meta.id}
                      onClick={() => setPreviewing(meta)}
                      style={{ background: '#fff', borderRadius: 12, border: '1px solid #e2e8f0', overflow: 'hidden', cursor: 'pointer', transition: 'box-shadow 0.15s, transform 0.15s' }}
                      onMouseEnter={e => { const el = e.currentTarget as HTMLDivElement; el.style.boxShadow = '0 10px 26px rgba(15,23,42,0.14)'; el.style.transform = 'translateY(-2px)'; }}
                      onMouseLeave={e => { const el = e.currentTarget as HTMLDivElement; el.style.boxShadow = 'none'; el.style.transform = 'none'; }}>
                      <div style={{ position: 'relative', borderBottom: '1px solid #f1f5f9' }}>
                        <Thumb page={pages[0]} height={150} hoverScroll />
                        <span style={{ position: 'absolute', top: 7, right: 7, padding: '2px 7px', borderRadius: 5, background: 'rgba(15,23,42,0.72)', color: '#fff', fontSize: 9.5, fontWeight: 700, backdropFilter: 'blur(2px)' }}>
                          {pages.length} page{pages.length > 1 ? 's' : ''}
                        </span>
                      </div>
                      <div style={{ padding: '10px 12px 12px' }}>
                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 6 }}>
                          <span style={{ fontSize: 13, fontWeight: 700, color: '#0f172a', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{meta.name}</span>
                          <Stars n={meta.popularity} />
                        </div>
                        <p style={{ fontSize: 11, color: '#64748b', margin: '4px 0 8px', lineHeight: 1.45, display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>{meta.description}</p>
                        <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
                          <span style={{ fontSize: 9.5, fontWeight: 700, padding: '2px 7px', borderRadius: 999, background: '#eef2ff', color: '#4f46e5' }}>{meta.category}</span>
                          <span style={{ fontSize: 9.5, fontWeight: 700, padding: '2px 7px', borderRadius: 999, background: '#f1f5f9', color: '#475569' }}>{meta.industry}</span>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      </div>

      {previewing && (
        <PreviewModal
          meta={previewing}
          pages={pagesFor(previewing)}
          onClose={() => setPreviewing(null)}
          onUse={() => onUse(previewing, pagesFor(previewing))}
        />
      )}
    </div>,
    document.body,
  );
}
