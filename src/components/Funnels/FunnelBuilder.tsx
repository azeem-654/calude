import { useState, useRef } from 'react';
import type { DragEvent } from 'react';
import {
  X, Plus, Trash2, ArrowUp, ArrowDown, Edit2, Eye, Save,
  Type, Image, MousePointerClick, AlignLeft, Minus, Layout,
  ChevronDown, ChevronUp, Code, Video
} from 'lucide-react';
import type { Funnel, FunnelStep, FunnelBlock } from '../../types';

const PAGE_TYPES: { value: FunnelStep['type']; label: string; desc: string }[] = [
  { value: 'landing', label: 'Landing Page', desc: 'Attention-grabbing first page' },
  { value: 'optin', label: 'Opt-in Page', desc: 'Capture leads with a form' },
  { value: 'sales', label: 'Sales Page', desc: 'Present your offer' },
  { value: 'thankyou', label: 'Thank You Page', desc: 'Post-conversion page' },
  { value: 'order', label: 'Order Form', desc: 'Collect payment info' },
  { value: 'webinar', label: 'Webinar Registration', desc: 'Sign up for webinar' },
  { value: 'custom', label: 'Custom Page', desc: 'Blank canvas' },
];

const BLOCK_TYPES: { type: FunnelBlock['type']; label: string; icon: React.ReactNode; defaultContent: string }[] = [
  { type: 'heading', label: 'Heading', icon: <Type size={16} />, defaultContent: 'Your Compelling Headline Here' },
  { type: 'text', label: 'Text', icon: <AlignLeft size={16} />, defaultContent: 'Add your body text here. Explain your value proposition clearly.' },
  { type: 'image', label: 'Image', icon: <Image size={16} />, defaultContent: '' },
  { type: 'button', label: 'Button', icon: <MousePointerClick size={16} />, defaultContent: 'Get Started Now' },
  { type: 'form', label: 'Form', icon: <Layout size={16} />, defaultContent: 'Sign Up Form' },
  { type: 'video', label: 'Video', icon: <Video size={16} />, defaultContent: '' },
  { type: 'divider', label: 'Divider', icon: <Minus size={16} />, defaultContent: '' },
  { type: 'spacer', label: 'Spacer', icon: <Layout size={16} />, defaultContent: '' },
];

function uid() { return `blk-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`; }

function createDefaultBlock(type: FunnelBlock['type']): FunnelBlock {
  const def = BLOCK_TYPES.find(b => b.type === type)!;
  const defaults: Partial<FunnelBlock['settings']> = {
    align: 'center', size: 'md', color: '#0f172a', bgColor: 'transparent',
    buttonColor: '#6366f1', padding: 16,
  };
  if (type === 'form') {
    defaults.formFields = [
      { label: 'Full Name', type: 'text', required: true },
      { label: 'Email Address', type: 'email', required: true },
    ];
    defaults.buttonText = 'Submit';
    defaults.redirectUrl = '';
  }
  if (type === 'heading') defaults.size = 'xl';
  if (type === 'button') { defaults.url = '#'; defaults.buttonText = 'Get Started Now'; }
  if (type === 'image') defaults.imageUrl = '';
  return { id: uid(), type, content: def.defaultContent, settings: defaults as FunnelBlock['settings'] };
}

function createDefaultPage(name: string, type: FunnelStep['type'], slug: string): FunnelStep {
  const blocks: FunnelBlock[] = [];
  if (type === 'landing') {
    blocks.push(createDefaultBlock('heading'), createDefaultBlock('text'), createDefaultBlock('button'));
  } else if (type === 'optin') {
    blocks.push(createDefaultBlock('heading'), createDefaultBlock('text'), createDefaultBlock('form'));
  } else if (type === 'thankyou') {
    blocks.push(createDefaultBlock('heading'), createDefaultBlock('text'));
  } else {
    blocks.push(createDefaultBlock('heading'), createDefaultBlock('text'));
  }
  return { id: `step-${Date.now()}`, name, type, slug, blocks, visitors: 0, conversions: 0 };
}

// ── Block Renderer (for preview) ─────────────────────────────────────────────
function BlockPreview({ block }: { block: FunnelBlock }) {
  const s = block.settings;
  const align = s.align || 'center';
  const pad = s.padding || 16;

  if (block.type === 'divider') return <hr style={{ border: 'none', borderTop: '1px solid #e2e8f0', margin: `${pad}px 0` }} />;
  if (block.type === 'spacer') return <div style={{ height: Math.max(pad, 20) }} />;

  if (block.type === 'heading') {
    const sizes: Record<string, string> = { sm: '18px', md: '24px', lg: '32px', xl: '42px' };
    return <h2 style={{ fontSize: sizes[s.size || 'xl'] || '32px', fontWeight: 800, color: s.color || '#0f172a', textAlign: align, margin: `${pad}px 0`, lineHeight: 1.2 }}>{block.content}</h2>;
  }

  if (block.type === 'text') {
    return <p style={{ fontSize: '16px', color: s.color || '#374151', textAlign: align, margin: `${pad}px 0`, lineHeight: 1.7 }}>{block.content}</p>;
  }

  if (block.type === 'image') {
    if (!s.imageUrl) return <div style={{ padding: `${pad}px`, textAlign: 'center', backgroundColor: '#f1f5f9', borderRadius: 8, color: '#94a3b8', fontSize: 13 }}>📷 Image placeholder</div>;
    return <img src={s.imageUrl} alt="" style={{ width: '100%', borderRadius: 8, margin: `${pad}px 0`, display: 'block' }} />;
  }

  if (block.type === 'button') {
    return (
      <div style={{ textAlign: align, margin: `${pad}px 0` }}>
        <a href={s.url || '#'} style={{ display: 'inline-block', padding: '14px 32px', backgroundColor: s.buttonColor || '#6366f1', color: 'white', borderRadius: 10, fontSize: '16px', fontWeight: 700, textDecoration: 'none', cursor: 'pointer' }}>
          {block.content || s.buttonText || 'Click Here'}
        </a>
      </div>
    );
  }

  if (block.type === 'form') {
    return (
      <div style={{ backgroundColor: 'white', borderRadius: 12, padding: '24px', border: '1px solid #e2e8f0', margin: `${pad}px 0` }}>
        {(s.formFields || []).map((f, i) => (
          <div key={i} style={{ marginBottom: 12 }}>
            <label style={{ display: 'block', fontSize: 13, fontWeight: 600, color: '#374151', marginBottom: 4 }}>{f.label}{f.required && <span style={{ color: '#ef4444' }}> *</span>}</label>
            <input type={f.type} placeholder={f.label} style={{ width: '100%', padding: '10px 12px', border: '1px solid #e2e8f0', borderRadius: 8, fontSize: 14, outline: 'none', boxSizing: 'border-box' }} />
          </div>
        ))}
        <button style={{ width: '100%', padding: '13px', backgroundColor: s.buttonColor || '#6366f1', color: 'white', border: 'none', borderRadius: 8, fontSize: 15, fontWeight: 700, cursor: 'pointer', marginTop: 4 }}>
          {s.buttonText || 'Submit'}
        </button>
      </div>
    );
  }

  if (block.type === 'video') {
    if (!block.content) return <div style={{ padding: `${pad}px`, textAlign: 'center', backgroundColor: '#f1f5f9', borderRadius: 8, color: '#94a3b8', fontSize: 13 }}>🎥 Video placeholder — add a YouTube/Vimeo URL</div>;
    const videoId = block.content.includes('youtu.be/') ? block.content.split('youtu.be/')[1]?.split('?')[0] : block.content.split('v=')[1]?.split('&')[0];
    if (videoId) return (
      <div style={{ margin: `${pad}px 0`, borderRadius: 10, overflow: 'hidden' }}>
        <iframe width="100%" height="315" src={`https://www.youtube.com/embed/${videoId}`} title="Video" frameBorder="0" allowFullScreen />
      </div>
    );
    return <div style={{ padding: `${pad}px`, textAlign: 'center', backgroundColor: '#f1f5f9', borderRadius: 8, color: '#94a3b8', fontSize: 13 }}>Invalid video URL</div>;
  }

  return null;
}

// ── Block Editor ──────────────────────────────────────────────────────────────
function BlockEditor({ block, onChange, onDelete, onMoveUp, onMoveDown, canMoveUp, canMoveDown }: {
  block: FunnelBlock;
  onChange: (b: FunnelBlock) => void;
  onDelete: () => void;
  onMoveUp: () => void;
  onMoveDown: () => void;
  canMoveUp: boolean;
  canMoveDown: boolean;
}) {
  const [expanded, setExpanded] = useState(false);
  const s = block.settings;
  const update = (updates: Partial<FunnelBlock>) => onChange({ ...block, ...updates });
  const updateS = (updates: Partial<FunnelBlock['settings']>) => onChange({ ...block, settings: { ...s, ...updates } });
  const inp: React.CSSProperties = { width: '100%', padding: '7px 9px', border: '1px solid #e2e8f0', borderRadius: 6, fontSize: 12, outline: 'none', boxSizing: 'border-box', fontFamily: 'inherit' };

  return (
    <div style={{ border: '1px solid #e2e8f0', borderRadius: 10, overflow: 'hidden', marginBottom: 8 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '10px 12px', backgroundColor: '#f8fafc', cursor: 'pointer' }} onClick={() => setExpanded(e => !e)}>
        <span style={{ fontSize: 11, fontWeight: 700, color: '#64748b', textTransform: 'uppercase', flex: 1 }}>
          {BLOCK_TYPES.find(b => b.type === block.type)?.label || block.type}
        </span>
        <div style={{ display: 'flex', gap: 2 }} onClick={e => e.stopPropagation()}>
          <button onClick={onMoveUp} disabled={!canMoveUp} style={{ border: 'none', background: 'none', cursor: canMoveUp ? 'pointer' : 'default', padding: 3, opacity: canMoveUp ? 1 : 0.3 }}><ArrowUp size={12} color="#64748b" /></button>
          <button onClick={onMoveDown} disabled={!canMoveDown} style={{ border: 'none', background: 'none', cursor: canMoveDown ? 'pointer' : 'default', padding: 3, opacity: canMoveDown ? 1 : 0.3 }}><ArrowDown size={12} color="#64748b" /></button>
          <button onClick={onDelete} style={{ border: 'none', background: 'none', cursor: 'pointer', padding: 3 }}><Trash2 size={12} color="#ef4444" /></button>
        </div>
        {expanded ? <ChevronUp size={13} color="#94a3b8" /> : <ChevronDown size={13} color="#94a3b8" />}
      </div>

      {expanded && (
        <div style={{ padding: '12px', display: 'flex', flexDirection: 'column', gap: 10 }}>
          {/* Content field */}
          {['heading', 'text', 'button', 'form', 'video'].includes(block.type) && (
            <div>
              <label style={{ display: 'block', fontSize: 11, fontWeight: 600, color: '#374151', marginBottom: 3 }}>
                {block.type === 'video' ? 'YouTube/Vimeo URL' : block.type === 'form' ? 'Form Title' : 'Content'}
              </label>
              {block.type === 'text'
                ? <textarea value={block.content} onChange={e => update({ content: e.target.value })} rows={3} style={{ ...inp, resize: 'vertical' }} />
                : <input value={block.content} onChange={e => update({ content: e.target.value })} style={inp} />}
            </div>
          )}

          {/* Image URL */}
          {block.type === 'image' && (
            <div>
              <label style={{ display: 'block', fontSize: 11, fontWeight: 600, color: '#374151', marginBottom: 3 }}>Image URL</label>
              <input value={s.imageUrl || ''} onChange={e => updateS({ imageUrl: e.target.value })} placeholder="https://..." style={inp} />
            </div>
          )}

          {/* Button settings */}
          {block.type === 'button' && (
            <>
              <div>
                <label style={{ display: 'block', fontSize: 11, fontWeight: 600, color: '#374151', marginBottom: 3 }}>Link URL</label>
                <input value={s.url || '#'} onChange={e => updateS({ url: e.target.value })} placeholder="https://..." style={inp} />
              </div>
              <div>
                <label style={{ display: 'block', fontSize: 11, fontWeight: 600, color: '#374151', marginBottom: 3 }}>Button Color</label>
                <input type="color" value={s.buttonColor || '#6366f1'} onChange={e => updateS({ buttonColor: e.target.value })} style={{ width: 48, height: 28, border: '1px solid #e2e8f0', borderRadius: 6, cursor: 'pointer', padding: 2 }} />
              </div>
            </>
          )}

          {/* Form settings */}
          {block.type === 'form' && (
            <>
              <div>
                <label style={{ display: 'block', fontSize: 11, fontWeight: 600, color: '#374151', marginBottom: 3 }}>Submit Button Text</label>
                <input value={s.buttonText || 'Submit'} onChange={e => updateS({ buttonText: e.target.value })} style={inp} />
              </div>
              <div>
                <label style={{ display: 'block', fontSize: 11, fontWeight: 600, color: '#374151', marginBottom: 3 }}>Redirect After Submit</label>
                <input value={s.redirectUrl || ''} onChange={e => updateS({ redirectUrl: e.target.value })} placeholder="/thank-you" style={inp} />
              </div>
              <div>
                <label style={{ display: 'block', fontSize: 11, fontWeight: 600, color: '#374151', marginBottom: 6 }}>Form Fields</label>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                  {(s.formFields || []).map((f, i) => (
                    <div key={i} style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                      <input value={f.label} onChange={e => updateS({ formFields: (s.formFields || []).map((ff, j) => j === i ? { ...ff, label: e.target.value } : ff) })} style={{ ...inp, flex: 1 }} />
                      <select value={f.type} onChange={e => updateS({ formFields: (s.formFields || []).map((ff, j) => j === i ? { ...ff, type: e.target.value } : ff) })} style={{ ...inp, width: 80 }}>
                        {['text','email','phone','textarea','checkbox'].map(t => <option key={t} value={t}>{t}</option>)}
                      </select>
                      <button onClick={() => updateS({ formFields: (s.formFields || []).filter((_, j) => j !== i) })} style={{ border: 'none', background: 'none', cursor: 'pointer', flexShrink: 0 }}><X size={12} color="#94a3b8" /></button>
                    </div>
                  ))}
                  <button onClick={() => updateS({ formFields: [...(s.formFields || []), { label: 'New Field', type: 'text', required: false }] })} style={{ display: 'flex', alignItems: 'center', gap: 5, padding: '6px 10px', border: '1px dashed #e2e8f0', borderRadius: 6, backgroundColor: 'white', color: '#6366f1', fontSize: 11, fontWeight: 600, cursor: 'pointer' }}>
                    <Plus size={11} /> Add Field
                  </button>
                </div>
              </div>
            </>
          )}

          {/* Common settings */}
          {['heading', 'text', 'button'].includes(block.type) && (
            <div style={{ display: 'flex', gap: 8 }}>
              <div style={{ flex: 1 }}>
                <label style={{ display: 'block', fontSize: 11, fontWeight: 600, color: '#374151', marginBottom: 3 }}>Align</label>
                <select value={s.align || 'center'} onChange={e => updateS({ align: e.target.value as 'left' | 'center' | 'right' })} style={inp}>
                  {['left','center','right'].map(a => <option key={a} value={a}>{a}</option>)}
                </select>
              </div>
              {block.type !== 'button' && (
                <div style={{ flex: 1 }}>
                  <label style={{ display: 'block', fontSize: 11, fontWeight: 600, color: '#374151', marginBottom: 3 }}>Text Color</label>
                  <input type="color" value={s.color || '#0f172a'} onChange={e => updateS({ color: e.target.value })} style={{ width: '100%', height: 30, border: '1px solid #e2e8f0', borderRadius: 6, cursor: 'pointer', padding: 2 }} />
                </div>
              )}
            </div>
          )}

          <div>
            <label style={{ display: 'block', fontSize: 11, fontWeight: 600, color: '#374151', marginBottom: 3 }}>Padding (px)</label>
            <input type="number" min="0" max="80" value={s.padding || 16} onChange={e => updateS({ padding: Number(e.target.value) })} style={{ ...inp, width: 80 }} />
          </div>
        </div>
      )}
    </div>
  );
}

// ── Main FunnelBuilder Component ──────────────────────────────────────────────
interface Props {
  funnel: Funnel;
  onSave: (funnel: Funnel) => void;
  onClose: () => void;
}

export default function FunnelBuilder({ funnel: initialFunnel, onSave, onClose }: Props) {
  const [funnel, setFunnel] = useState<Funnel>(() => ({
    ...initialFunnel,
    pages: initialFunnel.pages ?? [],
  }));
  const [activePageId, setActivePageId] = useState<string | null>(funnel.pages?.[0]?.id ?? null);
  const [previewMode, setPreviewMode] = useState(false);
  const [showAddPage, setShowAddPage] = useState(false);
  const [newPageType, setNewPageType] = useState<FunnelStep['type']>('landing');
  const [newPageName, setNewPageName] = useState('');

  const pages = funnel.pages ?? [];
  const activePage = pages.find(p => p.id === activePageId) ?? null;

  const updatePage = (pageId: string, updates: Partial<FunnelStep>) => {
    setFunnel(f => ({ ...f, pages: (f.pages || []).map(p => p.id === pageId ? { ...p, ...updates } : p), steps: (f.pages?.length || 0) }));
  };

  const updateBlock = (pageId: string, blockId: string, updates: FunnelBlock) => {
    const page = pages.find(p => p.id === pageId);
    if (!page) return;
    updatePage(pageId, { blocks: page.blocks.map(b => b.id === blockId ? updates : b) });
  };

  const deleteBlock = (pageId: string, blockId: string) => {
    const page = pages.find(p => p.id === pageId);
    if (!page) return;
    updatePage(pageId, { blocks: page.blocks.filter(b => b.id !== blockId) });
  };

  const moveBlock = (pageId: string, blockId: string, direction: 'up' | 'down') => {
    const page = pages.find(p => p.id === pageId);
    if (!page) return;
    const idx = page.blocks.findIndex(b => b.id === blockId);
    if (idx === -1) return;
    const newBlocks = [...page.blocks];
    const swapIdx = direction === 'up' ? idx - 1 : idx + 1;
    if (swapIdx < 0 || swapIdx >= newBlocks.length) return;
    [newBlocks[idx], newBlocks[swapIdx]] = [newBlocks[swapIdx], newBlocks[idx]];
    updatePage(pageId, { blocks: newBlocks });
  };

  const addBlock = (type: FunnelBlock['type']) => {
    if (!activePage) return;
    updatePage(activePage.id, { blocks: [...activePage.blocks, createDefaultBlock(type)] });
  };

  const addPage = () => {
    if (!newPageName.trim()) return;
    const slug = newPageName.toLowerCase().replace(/[^a-z0-9]+/g, '-');
    const page = createDefaultPage(newPageName.trim(), newPageType, slug);
    setFunnel(f => ({ ...f, pages: [...(f.pages || []), page], steps: (f.pages?.length || 0) + 1 }));
    setActivePageId(page.id);
    setShowAddPage(false);
    setNewPageName('');
  };

  const deletePage = (pageId: string) => {
    if (!window.confirm('Delete this page?')) return;
    setFunnel(f => {
      const newPages = (f.pages || []).filter(p => p.id !== pageId);
      return { ...f, pages: newPages, steps: newPages.length };
    });
    if (activePageId === pageId) setActivePageId(pages.find(p => p.id !== pageId)?.id ?? null);
  };

  const handleSave = () => {
    onSave(funnel);
  };

  const totalVisitors = pages.reduce((s, p) => s + p.visitors, 0);
  const totalConversions = pages.reduce((s, p) => s + p.conversions, 0);

  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 500, display: 'flex', flexDirection: 'column', backgroundColor: 'white' }}>
      {/* Top bar */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '12px 20px', borderBottom: '1px solid #e2e8f0', backgroundColor: '#0f172a', flexShrink: 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <button onClick={onClose} style={{ border: 'none', background: 'none', cursor: 'pointer', color: '#94a3b8', padding: 4, display: 'flex' }}><X size={20} /></button>
          <span style={{ color: '#64748b', fontSize: 13 }}>›</span>
          <input value={funnel.name} onChange={e => setFunnel(f => ({ ...f, name: e.target.value }))}
            style={{ background: 'none', border: 'none', color: 'white', fontSize: 16, fontWeight: 700, outline: 'none', cursor: 'text', minWidth: 200 }} />
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <button onClick={() => setPreviewMode(p => !p)}
            style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '7px 14px', border: `1px solid ${previewMode ? '#6366f1' : 'rgba(255,255,255,0.15)'}`, borderRadius: 8, backgroundColor: previewMode ? '#6366f1' : 'transparent', color: 'white', fontSize: 12, fontWeight: 600, cursor: 'pointer' }}>
            <Eye size={14} /> {previewMode ? 'Editing' : 'Preview'}
          </button>
          <button onClick={handleSave}
            style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '7px 14px', border: 'none', borderRadius: 8, backgroundColor: '#22c55e', color: 'white', fontSize: 12, fontWeight: 600, cursor: 'pointer' }}>
            <Save size={14} /> Save Funnel
          </button>
        </div>
      </div>

      <div style={{ display: 'flex', flex: 1, overflow: 'hidden' }}>
        {/* Left: Page steps panel */}
        <div style={{ width: 220, borderRight: '1px solid #e2e8f0', display: 'flex', flexDirection: 'column', backgroundColor: '#f8fafc', flexShrink: 0 }}>
          <div style={{ padding: '14px 16px', borderBottom: '1px solid #e2e8f0' }}>
            <div style={{ fontSize: 11, fontWeight: 700, color: '#64748b', textTransform: 'uppercase', marginBottom: 10 }}>Funnel Steps ({pages.length})</div>
            <div style={{ display: 'flex', gap: 10, fontSize: 11 }}>
              <div style={{ textAlign: 'center' }}>
                <div style={{ fontWeight: 700, color: '#6366f1', fontSize: 14 }}>{totalVisitors}</div>
                <div style={{ color: '#94a3b8' }}>Visitors</div>
              </div>
              <div style={{ textAlign: 'center' }}>
                <div style={{ fontWeight: 700, color: '#22c55e', fontSize: 14 }}>{totalConversions}</div>
                <div style={{ color: '#94a3b8' }}>Conversions</div>
              </div>
              <div style={{ textAlign: 'center' }}>
                <div style={{ fontWeight: 700, color: '#f59e0b', fontSize: 14 }}>{totalVisitors > 0 ? ((totalConversions / totalVisitors) * 100).toFixed(1) : 0}%</div>
                <div style={{ color: '#94a3b8' }}>CVR</div>
              </div>
            </div>
          </div>

          <div style={{ flex: 1, overflowY: 'auto', padding: '8px' }}>
            {pages.map((page, i) => (
              <div key={page.id}>
                <button onClick={() => setActivePageId(page.id)}
                  style={{ display: 'flex', alignItems: 'center', width: '100%', padding: '10px 12px', borderRadius: 8, border: `1px solid ${activePageId === page.id ? '#6366f1' : 'transparent'}`, backgroundColor: activePageId === page.id ? '#eef2ff' : 'transparent', cursor: 'pointer', textAlign: 'left', gap: 8 }}>
                  <div style={{ width: 22, height: 22, borderRadius: '50%', backgroundColor: '#6366f1', color: 'white', fontSize: 11, fontWeight: 700, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>{i + 1}</div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 12, fontWeight: 600, color: activePageId === page.id ? '#6366f1' : '#374151', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{page.name}</div>
                    <div style={{ fontSize: 10, color: '#94a3b8', textTransform: 'capitalize' }}>{page.type}</div>
                  </div>
                  <button onClick={e => { e.stopPropagation(); deletePage(page.id); }} style={{ border: 'none', background: 'none', cursor: 'pointer', opacity: 0.5, padding: 2 }}><Trash2 size={11} color="#ef4444" /></button>
                </button>
                {i < pages.length - 1 && (
                  <div style={{ display: 'flex', justifyContent: 'center', margin: '2px 0' }}>
                    <div style={{ width: 1, height: 10, backgroundColor: '#d1d5db' }} />
                  </div>
                )}
              </div>
            ))}

            {showAddPage ? (
              <div style={{ padding: '10px', backgroundColor: 'white', borderRadius: 8, border: '1px solid #e2e8f0', marginTop: 8 }}>
                <input value={newPageName} onChange={e => setNewPageName(e.target.value)} placeholder="Page name..." autoFocus
                  style={{ width: '100%', padding: '7px 9px', border: '1px solid #e2e8f0', borderRadius: 6, fontSize: 12, outline: 'none', marginBottom: 6, boxSizing: 'border-box' }} />
                <select value={newPageType} onChange={e => setNewPageType(e.target.value as FunnelStep['type'])}
                  style={{ width: '100%', padding: '7px 9px', border: '1px solid #e2e8f0', borderRadius: 6, fontSize: 12, outline: 'none', marginBottom: 8 }}>
                  {PAGE_TYPES.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
                </select>
                <div style={{ display: 'flex', gap: 6 }}>
                  <button onClick={addPage} style={{ flex: 1, padding: '6px', backgroundColor: '#6366f1', color: 'white', border: 'none', borderRadius: 6, fontSize: 11, fontWeight: 600, cursor: 'pointer' }}>Add</button>
                  <button onClick={() => setShowAddPage(false)} style={{ flex: 1, padding: '6px', backgroundColor: 'white', color: '#64748b', border: '1px solid #e2e8f0', borderRadius: 6, fontSize: 11, cursor: 'pointer' }}>Cancel</button>
                </div>
              </div>
            ) : (
              <button onClick={() => setShowAddPage(true)}
                style={{ display: 'flex', alignItems: 'center', gap: 6, width: '100%', padding: '9px 12px', marginTop: 8, border: '1px dashed #d1d5db', borderRadius: 8, backgroundColor: 'transparent', color: '#94a3b8', fontSize: 12, cursor: 'pointer', transition: 'all 0.1s' }}>
                <Plus size={13} /> Add Step
              </button>
            )}
          </div>
        </div>

        {/* Center: Canvas */}
        <div style={{ flex: 1, overflowY: 'auto', backgroundColor: previewMode ? 'white' : '#e5e7eb' }}>
          {activePage ? (
            <div style={{ maxWidth: 680, margin: '20px auto', backgroundColor: 'white', borderRadius: previewMode ? 0 : 12, boxShadow: previewMode ? 'none' : '0 4px 20px rgba(0,0,0,0.12)', overflow: 'hidden' }}>
              {!previewMode && (
                <div style={{ padding: '12px 16px', backgroundColor: '#1e293b', display: 'flex', alignItems: 'center', gap: 6 }}>
                  {[...Array(3)].map((_, i) => <div key={i} style={{ width: 10, height: 10, borderRadius: '50%', backgroundColor: ['#ef4444','#f59e0b','#22c55e'][i] }} />)}
                  <span style={{ fontSize: 11, color: '#94a3b8', marginLeft: 8 }}>{window.location.origin}{import.meta.env.BASE_URL}f/{funnel.slug || funnel.id}/{activePage.slug}</span>
                </div>
              )}
              <div style={{ padding: '32px 24px', minHeight: 500 }}>
                {activePage.blocks.map((block, i) => (
                  previewMode
                    ? <BlockPreview key={block.id} block={block} />
                    : (
                      <div key={block.id} style={{ border: '2px dashed transparent', borderRadius: 8, transition: 'border 0.1s', position: 'relative' }}
                        onMouseEnter={e => { e.currentTarget.style.borderColor = '#c7d2fe'; }}
                        onMouseLeave={e => { e.currentTarget.style.borderColor = 'transparent'; }}>
                        <BlockPreview block={block} />
                      </div>
                    )
                ))}
                {activePage.blocks.length === 0 && !previewMode && (
                  <div style={{ padding: '60px 20px', textAlign: 'center', color: '#94a3b8', border: '2px dashed #e2e8f0', borderRadius: 12 }}>
                    <p style={{ fontSize: 14, margin: 0 }}>No blocks yet. Add blocks from the panel on the right.</p>
                  </div>
                )}
              </div>
            </div>
          ) : (
            <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '60px 20px', textAlign: 'center', color: '#94a3b8' }}>
              <div>
                <Layout size={48} color="#e2e8f0" style={{ margin: '0 auto 16px', display: 'block' }} />
                <p style={{ fontSize: 16, fontWeight: 600, margin: '0 0 8px', color: '#374151' }}>No pages yet</p>
                <p style={{ fontSize: 13, margin: 0 }}>Add a funnel step to get started.</p>
              </div>
            </div>
          )}
        </div>

        {/* Right: Block editor panel */}
        {!previewMode && activePage && (
          <div style={{ width: 260, borderLeft: '1px solid #e2e8f0', display: 'flex', flexDirection: 'column', backgroundColor: 'white', flexShrink: 0 }}>
            <div style={{ padding: '12px 14px', borderBottom: '1px solid #e2e8f0' }}>
              <div style={{ fontSize: 11, fontWeight: 700, color: '#64748b', textTransform: 'uppercase', marginBottom: 6 }}>Page Info</div>
              <input value={activePage.name} onChange={e => updatePage(activePage.id, { name: e.target.value })}
                style={{ width: '100%', padding: '7px 9px', border: '1px solid #e2e8f0', borderRadius: 6, fontSize: 12, outline: 'none', marginBottom: 6, boxSizing: 'border-box' }} />
            </div>

            <div style={{ padding: '12px 14px', borderBottom: '1px solid #e2e8f0' }}>
              <div style={{ fontSize: 11, fontWeight: 700, color: '#64748b', textTransform: 'uppercase', marginBottom: 8 }}>Add Block</div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 6 }}>
                {BLOCK_TYPES.map(bt => (
                  <button key={bt.type} onClick={() => addBlock(bt.type)}
                    style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4, padding: '10px 6px', border: '1px solid #e2e8f0', borderRadius: 8, backgroundColor: 'white', cursor: 'pointer', fontSize: 11, color: '#374151', fontWeight: 500, transition: 'all 0.1s' }}
                    onMouseEnter={e => { e.currentTarget.style.backgroundColor = '#eef2ff'; e.currentTarget.style.borderColor = '#c7d2fe'; }}
                    onMouseLeave={e => { e.currentTarget.style.backgroundColor = 'white'; e.currentTarget.style.borderColor = '#e2e8f0'; }}>
                    <span style={{ color: '#6366f1' }}>{bt.icon}</span>
                    {bt.label}
                  </button>
                ))}
              </div>
            </div>

            <div style={{ flex: 1, overflowY: 'auto', padding: '12px 14px' }}>
              <div style={{ fontSize: 11, fontWeight: 700, color: '#64748b', textTransform: 'uppercase', marginBottom: 8 }}>
                Blocks ({activePage.blocks.length})
              </div>
              {activePage.blocks.map((block, i) => (
                <BlockEditor
                  key={block.id}
                  block={block}
                  onChange={updated => updateBlock(activePage.id, block.id, updated)}
                  onDelete={() => deleteBlock(activePage.id, block.id)}
                  onMoveUp={() => moveBlock(activePage.id, block.id, 'up')}
                  onMoveDown={() => moveBlock(activePage.id, block.id, 'down')}
                  canMoveUp={i > 0}
                  canMoveDown={i < activePage.blocks.length - 1}
                />
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
