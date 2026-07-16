import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Plus, Search, Trash2, Edit3, Copy, Share2,
  Image, LayoutGrid,
  List, Clock, Eye, X, Wand2, AlertCircle,
} from 'lucide-react';
import { useApp } from '../../context/AppContext';
import type { DesignPost, Platform, CanvasElement } from './types';
import { PLATFORM_PRESETS, RATIO_SIZES, TEMPLATES } from './templates';
import { generateSocialPostDesign, hasGeminiKey } from '../../lib/gemini';

const PLATFORM_ICONS: Record<string, React.ReactNode> = {
  instagram: <span style={{ fontSize: 12, fontWeight: 700 }}>IG</span>,
  linkedin:  <span style={{ fontSize: 12, fontWeight: 700 }}>LI</span>,
  youtube:   <span style={{ fontSize: 12, fontWeight: 700 }}>YT</span>,
  twitter:   <span style={{ fontSize: 12, fontWeight: 700 }}>X</span>,
  tiktok:    <span style={{ fontSize: 12, fontWeight: 700 }}>TK</span>,
  facebook:  <span style={{ fontSize: 12, fontWeight: 700 }}>FB</span>,
};

function ThumbnailPreview({ post }: { post: DesignPost }) {
  const bg = post.background;
  let backgroundStyle: React.CSSProperties = {};
  if (bg.type === 'gradient') {
    backgroundStyle = { background: `linear-gradient(${bg.gradientAngle}deg, ${bg.gradientStart}, ${bg.gradientEnd})` };
  } else if (bg.type === 'color') {
    backgroundStyle = { backgroundColor: bg.color };
  } else if (bg.imageUrl) {
    backgroundStyle = { backgroundImage: `url(${bg.imageUrl})`, backgroundSize: 'cover', backgroundPosition: 'center' };
  }

  const ratio = post.aspectRatio;
  const [w, h] = ratio.split(':').map(Number);
  const thumbH = 160;
  const thumbW = Math.round((w / h) * thumbH);

  return (
    <div style={{ width: thumbW, height: thumbH, maxWidth: '100%', borderRadius: 6, overflow: 'hidden', position: 'relative', flexShrink: 0, ...backgroundStyle }}>
      {post.thumbnail
        ? <img src={post.thumbnail} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
        : <div style={{ width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <Image size={28} color="rgba(255,255,255,0.4)" />
          </div>
      }
    </div>
  );
}

function PostCard({
  post, onEdit, onDuplicate, onDelete,
}: {
  post: DesignPost;
  onEdit: () => void;
  onDuplicate: () => void;
  onDelete: () => void;
}) {
  const [hover, setHover] = useState(false);
  const preset = PLATFORM_PRESETS[post.platform];
  const statusColors: Record<string, string> = { draft: '#94a3b8', published: '#22c55e', scheduled: '#f59e0b' };

  return (
    <div
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      style={{
        background: '#fff', borderRadius: 12, overflow: 'hidden', border: '1px solid #e2e8f0',
        boxShadow: hover ? '0 8px 24px rgba(0,0,0,0.12)' : '0 1px 4px rgba(0,0,0,0.06)',
        transition: 'all 0.18s', cursor: 'pointer', position: 'relative',
      }}
    >
      {/* Thumbnail */}
      <div
        onClick={onEdit}
        style={{ background: '#f1f5f9', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '16px 16px 0', minHeight: 180 }}
      >
        <ThumbnailPreview post={post} />
      </div>

      {/* Hover actions overlay */}
      {hover && (
        <div style={{
          position: 'absolute', top: 8, right: 8, display: 'flex', gap: 4, zIndex: 10,
        }}>
          {[
            { icon: <Edit3 size={14} />, title: 'Edit', action: onEdit, bg: '#6366f1' },
            { icon: <Copy size={14} />, title: 'Duplicate', action: onDuplicate, bg: '#0ea5e9' },
            { icon: <Trash2 size={14} />, title: 'Delete', action: onDelete, bg: '#ef4444' },
          ].map(btn => (
            <button
              key={btn.title}
              onClick={e => { e.stopPropagation(); btn.action(); }}
              title={btn.title}
              style={{
                width: 28, height: 28, borderRadius: 6, border: 'none', cursor: 'pointer',
                background: btn.bg, color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center',
              }}
            >{btn.icon}</button>
          ))}
        </div>
      )}

      {/* Info */}
      <div style={{ padding: '12px 16px 16px' }} onClick={onEdit}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 }}>
          <span style={{ fontSize: 14, fontWeight: 600, color: '#1e293b', flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {post.name}
          </span>
          <span style={{
            fontSize: 10, fontWeight: 600, padding: '2px 7px', borderRadius: 99, textTransform: 'capitalize',
            background: statusColors[post.status] + '22', color: statusColors[post.status],
          }}>{post.status}</span>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <span style={{
            display: 'flex', alignItems: 'center', gap: 4, fontSize: 12, color: '#64748b',
            background: '#f1f5f9', padding: '2px 8px', borderRadius: 99,
          }}>
            {PLATFORM_ICONS[post.platform]}
            <span>{preset?.label ?? post.platform}</span>
          </span>
          <span style={{ fontSize: 12, color: '#94a3b8' }}>{post.aspectRatio}</span>
        </div>
        <div style={{ fontSize: 11, color: '#94a3b8', marginTop: 8 }}>
          {new Date(post.updatedAt).toLocaleDateString()}
        </div>
      </div>
    </div>
  );
}

/** True miniature render of a template — background + every element, scaled. */
function MiniPreview({ t, width }: { t: typeof TEMPLATES[0]; width: number }) {
  const scale = width / t.canvasWidth;
  const height = t.canvasHeight * scale;
  const bg = t.background;
  const bgStyle: React.CSSProperties = bg.type === 'gradient'
    ? { background: `linear-gradient(${bg.gradientAngle}deg, ${bg.gradientStart}, ${bg.gradientEnd})` }
    : { background: bg.color };
  return (
    <div style={{ width, height, position: 'relative', overflow: 'hidden', ...bgStyle }}>
      {[...t.elements].sort((a, b) => a.zIndex - b.zIndex).map((el, i) => {
        const st: React.CSSProperties = {
          position: 'absolute',
          left: el.x * scale, top: el.y * scale,
          width: el.width * scale, height: el.height * scale,
          transform: el.rotation ? `rotate(${el.rotation}deg)` : undefined,
          pointerEvents: 'none',
        };
        const d = el.data as unknown as Record<string, unknown>;
        if (d.kind === 'text') {
          return (
            <div key={i} style={{ ...st, color: d.color as string, fontSize: Math.max(3, (d.fontSize as number) * scale), fontFamily: d.fontFamily as string, fontWeight: d.fontWeight as React.CSSProperties['fontWeight'], fontStyle: d.fontStyle as string, textAlign: d.textAlign as React.CSSProperties['textAlign'], lineHeight: d.lineHeight as number, letterSpacing: (d.letterSpacing as number) * scale, whiteSpace: 'pre-wrap', textTransform: d.uppercase ? 'uppercase' : 'none', overflow: 'hidden' }}>
              {d.text as string}
            </div>
          );
        }
        if (d.kind === 'shape') {
          const shapeType = d.shapeType as string;
          const radius = shapeType === 'circle' ? '50%' : shapeType === 'rounded-rect' ? 6 * scale + 4 : 0;
          return <div key={i} style={{ ...st, background: (d.fill as string) === 'transparent' ? 'transparent' : d.fill as string, border: (d.strokeWidth as number) > 0 ? `${Math.max(1, (d.strokeWidth as number) * scale)}px solid ${d.stroke}` : 'none', borderRadius: radius, opacity: d.opacity as number }} />;
        }
        if (d.kind === 'image') {
          return (
            <div key={i} style={{ ...st, background: '#26262666', borderRadius: (d.borderRadius as number) * scale, overflow: 'hidden' }}>
              <img src={d.src as string} alt="" loading="lazy" style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }}
                onError={e => { e.currentTarget.style.display = 'none'; }} />
            </div>
          );
        }
        if (d.kind === 'sticker') {
          return <div key={i} style={{ ...st, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: (d.fontSize as number) * scale }}>{d.emoji as string}</div>;
        }
        return null;
      })}
    </div>
  );
}

function TemplateGallery({ onSelect }: { onSelect: (template: typeof TEMPLATES[0]) => void }) {
  const [category, setCategory] = useState('All');
  const [query, setQuery] = useState('');
  const categories = ['All', ...new Set(TEMPLATES.map(t => t.category))];
  const q = query.trim().toLowerCase();
  const filtered = TEMPLATES.filter(t =>
    (category === 'All' || t.category === category) &&
    (!q || t.name.toLowerCase().includes(q) || t.tags.some(tag => tag.includes(q)))
  );

  return (
    <div>
      {/* Search + category chips */}
      <div style={{ position: 'sticky', top: 0, background: '#fff', paddingBottom: 12, zIndex: 5 }}>
        <input value={query} onChange={e => setQuery(e.target.value)} placeholder="Search 40+ templates… try 'fashion' or 'sale'"
          style={{ width: '100%', padding: '11px 14px', border: '1px solid #e2e8f0', borderRadius: 10, fontSize: 14, outline: 'none', boxSizing: 'border-box', marginBottom: 12 }} />
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
          {categories.map(c => (
            <button key={c} onClick={() => setCategory(c)}
              style={{
                padding: '6px 14px', borderRadius: 99, border: '1px solid', fontSize: 12.5, cursor: 'pointer',
                fontWeight: 600,
                background: category === c ? '#17191c' : '#fff',
                borderColor: category === c ? '#17191c' : '#e2e8f0',
                color: category === c ? '#fff' : '#64748b',
              }}
            >{c}</button>
          ))}
        </div>
      </div>

      {filtered.length === 0 && (
        <div style={{ padding: '40px 0', textAlign: 'center', color: '#94a3b8', fontSize: 14 }}>No templates match "{query}"</div>
      )}

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(170px, 1fr))', gap: 16 }}>
        {filtered.map(t => (
          <div
            key={t.id}
            onClick={() => onSelect(t)}
            className="tpl-card"
            style={{ cursor: 'pointer', borderRadius: 12, overflow: 'hidden', border: '1px solid #eceef2', background: '#fff', position: 'relative', transition: 'box-shadow 0.15s, transform 0.15s' }}
            onMouseEnter={e => { e.currentTarget.style.boxShadow = '0 12px 32px -8px rgba(16,24,40,0.2)'; e.currentTarget.style.transform = 'translateY(-2px)'; }}
            onMouseLeave={e => { e.currentTarget.style.boxShadow = 'none'; e.currentTarget.style.transform = 'none'; }}
          >
            <div style={{ position: 'relative', maxHeight: 240, overflow: 'hidden', display: 'flex', justifyContent: 'center', background: '#f4f5f7' }}>
              <MiniPreview t={t} width={170} />
              <div className="tpl-overlay" style={{ position: 'absolute', inset: 0, background: 'rgba(15,17,20,0.45)', display: 'flex', alignItems: 'center', justifyContent: 'center', opacity: 0, transition: 'opacity 0.15s' }}>
                <span style={{ padding: '9px 18px', background: '#fff', borderRadius: 99, fontSize: 12.5, fontWeight: 700, color: '#17191c' }}>Use template</span>
              </div>
            </div>
            <div style={{ padding: '9px 12px' }}>
              <div style={{ fontSize: 12.5, fontWeight: 700, color: '#1e293b', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{t.name}</div>
              <div style={{ fontSize: 10.5, color: '#94a3b8', fontWeight: 600 }}>{t.category} · {t.aspectRatio}</div>
            </div>
          </div>
        ))}
      </div>
      <style>{`.tpl-card:hover .tpl-overlay { opacity: 1 !important; }`}</style>
    </div>
  );
}

function NewPostModal({ onClose, onCreate }: { onClose: () => void; onCreate: (post: Omit<DesignPost, 'id' | 'createdAt' | 'updatedAt'>) => void }) {
  const [step, setStep] = useState<'choose' | 'blank' | 'template' | 'ai'>('choose');
  const [platform, setPlatform] = useState<Platform>('instagram');
  const [ratio, setRatio] = useState<string>('1:1');
  const [name, setName] = useState('Untitled Design');
  const [aiPrompt, setAiPrompt] = useState('');
  const [generating, setGenerating] = useState(false);
  const [error, setError] = useState('');

  const ratioOptions = [
    { label: 'Square', value: '1:1', desc: '1080 × 1080' },
    { label: 'Portrait', value: '9:16', desc: '1080 × 1920' },
    { label: 'Landscape', value: '16:9', desc: '1920 × 1080' },
    { label: 'Portrait+', value: '4:5', desc: '1080 × 1350' },
  ];

  const createBlank = () => {
    const sizes = RATIO_SIZES[ratio] ?? { width: 540, height: 540 };
    onCreate({
      name,
      platform,
      aspectRatio: ratio as any,
      canvasWidth: sizes.width,
      canvasHeight: sizes.height,
      background: { type: 'color', color: '#ffffff', gradientStart: '#6366f1', gradientEnd: '#a855f7', gradientAngle: 135, imageFit: 'cover' },
      elements: [],
      status: 'draft',
      tags: [],
    });
  };

  const handleGenerate = async () => {
    setError('');
    if (step !== 'ai') { createBlank(); return; }
    if (!aiPrompt.trim()) { setError('Please enter a prompt describing your design.'); return; }
    if (!hasGeminiKey()) { setError('No Gemini API key configured. Add VITE_GEMINI_API_KEY to your environment.'); return; }
    setGenerating(true);
    try {
      const sizes = RATIO_SIZES[ratio] ?? { width: 540, height: 540 };
      const result = await generateSocialPostDesign(aiPrompt, platform, ratio, sizes.width, sizes.height);
      const elements: CanvasElement[] = result.elements.map((el, i) => ({
        id: `el-${Date.now()}-${i}`,
        type: el.type,
        x: el.x,
        y: el.y,
        width: el.width,
        height: el.height,
        rotation: el.rotation,
        zIndex: el.zIndex,
        locked: el.locked,
        visible: el.visible,
        data: el.data as any,
      }));
      onCreate({
        name: result.name || name,
        platform,
        aspectRatio: ratio as any,
        canvasWidth: sizes.width,
        canvasHeight: sizes.height,
        background: { ...result.background, imageFit: 'cover' },
        elements,
        status: 'draft',
        tags: [],
        aiPrompt,
      });
    } catch (e: any) {
      setError(e.message ?? 'AI generation failed. Please try again.');
    } finally {
      setGenerating(false);
    }
  };

  const createFromTemplate = (t: typeof TEMPLATES[0]) => {
    onCreate({
      name: t.name,
      platform: t.platform === 'all' ? platform : t.platform as Platform,
      aspectRatio: t.aspectRatio,
      canvasWidth: t.canvasWidth,
      canvasHeight: t.canvasHeight,
      background: { ...t.background },
      elements: t.elements.map((el, i) => ({ ...el, id: `el-${Date.now()}-${i}` })),
      status: 'draft',
      tags: t.tags,
    });
  };

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.6)', zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20 }}>
      <div style={{ background: '#fff', borderRadius: 16, width: '100%', maxWidth: 700, maxHeight: '90vh', overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
        <div style={{ padding: '24px 28px 20px', borderBottom: '1px solid #e2e8f0', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div>
            <h2 style={{ margin: 0, fontSize: 20, fontWeight: 700, color: '#1e293b' }}>Create New Design</h2>
            {step !== 'choose' && <p style={{ margin: '4px 0 0', fontSize: 13, color: '#64748b' }}>
              {step === 'blank' ? 'Start with a blank canvas' : step === 'template' ? 'Choose a template' : 'AI-powered generation'}
            </p>}
          </div>
          <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#64748b' }}><X size={22} /></button>
        </div>

        <div style={{ flex: 1, overflowY: 'auto', padding: '24px 28px' }}>
          {step === 'choose' && (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 16 }}>
              {[
                { key: 'blank', icon: <Plus size={32} />, title: 'Blank Canvas', desc: 'Start from scratch with full creative control', color: '#6366f1' },
                { key: 'template', icon: <LayoutGrid size={32} />, title: 'Use Template', desc: '50+ professionally designed templates', color: '#0ea5e9' },
                { key: 'ai', icon: <Wand2 size={32} />, title: 'AI Generate', desc: 'Describe your vision, let AI design it', color: '#a855f7' },
              ].map(opt => (
                <button
                  key={opt.key}
                  onClick={() => setStep(opt.key as any)}
                  style={{
                    padding: '28px 20px', border: '2px solid #e2e8f0', borderRadius: 12, background: '#fff', cursor: 'pointer',
                    textAlign: 'center', transition: 'all 0.15s',
                  }}
                  onMouseEnter={e => { e.currentTarget.style.borderColor = opt.color; e.currentTarget.style.background = opt.color + '08'; }}
                  onMouseLeave={e => { e.currentTarget.style.borderColor = '#e2e8f0'; e.currentTarget.style.background = '#fff'; }}
                >
                  <div style={{ color: opt.color, marginBottom: 12 }}>{opt.icon}</div>
                  <div style={{ fontWeight: 700, fontSize: 16, color: '#1e293b', marginBottom: 6 }}>{opt.title}</div>
                  <div style={{ fontSize: 13, color: '#64748b', lineHeight: 1.4 }}>{opt.desc}</div>
                </button>
              ))}
            </div>
          )}

          {(step === 'blank' || step === 'ai') && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
              <div>
                <label style={{ fontSize: 13, fontWeight: 600, color: '#374151', display: 'block', marginBottom: 8 }}>Design Name</label>
                <input
                  value={name}
                  onChange={e => setName(e.target.value)}
                  style={{ width: '100%', padding: '10px 14px', border: '1px solid #e2e8f0', borderRadius: 8, fontSize: 14, outline: 'none', boxSizing: 'border-box' }}
                />
              </div>
              <div>
                <label style={{ fontSize: 13, fontWeight: 600, color: '#374151', display: 'block', marginBottom: 8 }}>Platform</label>
                <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                  {Object.entries(PLATFORM_PRESETS).map(([key, p]) => (
                    <button
                      key={key}
                      onClick={() => setPlatform(key as Platform)}
                      style={{
                        padding: '8px 16px', borderRadius: 8, border: '2px solid', fontSize: 13, cursor: 'pointer', fontWeight: 500,
                        borderColor: platform === key ? p.primaryColor : '#e2e8f0',
                        background: platform === key ? p.primaryColor + '15' : '#fff',
                        color: platform === key ? p.primaryColor : '#64748b',
                      }}
                    >{p.icon} {p.label}</button>
                  ))}
                </div>
              </div>
              <div>
                <label style={{ fontSize: 13, fontWeight: 600, color: '#374151', display: 'block', marginBottom: 8 }}>Aspect Ratio</label>
                <div style={{ display: 'flex', gap: 8 }}>
                  {ratioOptions.map(r => (
                    <button
                      key={r.value}
                      onClick={() => setRatio(r.value)}
                      style={{
                        flex: 1, padding: '10px 8px', borderRadius: 8, border: '2px solid', fontSize: 13, cursor: 'pointer', fontWeight: 500,
                        borderColor: ratio === r.value ? '#6366f1' : '#e2e8f0',
                        background: ratio === r.value ? '#ede9fe' : '#fff',
                        color: ratio === r.value ? '#6366f1' : '#64748b',
                        textAlign: 'center',
                      }}
                    >
                      <div style={{ fontWeight: 600 }}>{r.label}</div>
                      <div style={{ fontSize: 11, marginTop: 2, opacity: 0.7 }}>{r.value}</div>
                    </button>
                  ))}
                </div>
              </div>
              {step === 'ai' && (
                <div>
                  <label style={{ fontSize: 13, fontWeight: 600, color: '#374151', display: 'block', marginBottom: 8 }}>AI Prompt</label>
                  <textarea
                    value={aiPrompt}
                    onChange={e => setAiPrompt(e.target.value)}
                    placeholder="Describe your design... e.g. 'A bold motivational post with purple gradient, large white text saying KEEP GOING, and fire emoji'"
                    rows={4}
                    style={{ width: '100%', padding: '10px 14px', border: '1px solid #e2e8f0', borderRadius: 8, fontSize: 14, outline: 'none', resize: 'vertical', boxSizing: 'border-box', fontFamily: 'inherit' }}
                  />
                  <p style={{ fontSize: 12, color: '#94a3b8', margin: '6px 0 0' }}>AI will generate a starting design. You can edit everything after.</p>
                </div>
              )}
            </div>
          )}

          {step === 'template' && (
            <TemplateGallery onSelect={createFromTemplate} />
          )}
        </div>

        {step !== 'choose' && step !== 'template' && (
          <div style={{ padding: '16px 28px', borderTop: '1px solid #e2e8f0' }}>
            {error && (
              <div style={{ display: 'flex', alignItems: 'flex-start', gap: 8, padding: '10px 14px', background: '#fef2f2', border: '1px solid #fecaca', borderRadius: 8, marginBottom: 12, color: '#dc2626', fontSize: 13 }}>
                <AlertCircle size={16} style={{ flexShrink: 0, marginTop: 1 }} />
                {error}
              </div>
            )}
            <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
              <button onClick={() => { setStep('choose'); setError(''); }} style={{ padding: '10px 20px', border: '1px solid #e2e8f0', borderRadius: 8, background: '#fff', cursor: 'pointer', fontSize: 14 }}>Back</button>
              <button
                onClick={handleGenerate}
                disabled={generating}
                style={{ padding: '10px 24px', border: 'none', borderRadius: 8, background: step === 'ai' ? 'linear-gradient(135deg,#a855f7,#6366f1)' : '#6366f1', color: '#fff', cursor: generating ? 'wait' : 'pointer', fontSize: 14, fontWeight: 600, opacity: generating ? 0.75 : 1 }}
              >
                {step === 'ai' ? (generating ? '⟳ Generating…' : '✨ Generate & Edit') : 'Create Design'}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

export default function SocialCreator() {
  const navigate = useNavigate();
  const { socialPosts, addSocialPost, updateSocialPost, deleteSocialPost } = useApp() as any;
  const [search, setSearch] = useState('');
  const [filterPlatform, setFilterPlatform] = useState<string>('all');
  const [filterStatus, setFilterStatus] = useState<string>('all');
  const [view, setView] = useState<'grid' | 'list'>('grid');
  const [showNew, setShowNew] = useState(false);
  const [sortBy, setSortBy] = useState<'updated' | 'created' | 'name'>('updated');

  const posts: DesignPost[] = socialPosts ?? [];

  const filtered = posts
    .filter(p => {
      if (search && !p.name.toLowerCase().includes(search.toLowerCase())) return false;
      if (filterPlatform !== 'all' && p.platform !== filterPlatform) return false;
      if (filterStatus !== 'all' && p.status !== filterStatus) return false;
      return true;
    })
    .sort((a, b) => {
      if (sortBy === 'name') return a.name.localeCompare(b.name);
      if (sortBy === 'created') return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
      return new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime();
    });

  const stats = {
    total: posts.length,
    published: posts.filter(p => p.status === 'published').length,
    drafts: posts.filter(p => p.status === 'draft').length,
    scheduled: posts.filter(p => p.status === 'scheduled').length,
  };

  const handleCreate = (data: Omit<DesignPost, 'id' | 'createdAt' | 'updatedAt'>) => {
    const now = new Date().toISOString();
    const id = `post-${Date.now()}`;
    const post: DesignPost = { ...data, id, createdAt: now, updatedAt: now };
    addSocialPost(post);
    setShowNew(false);
    navigate(`/social-creator/editor/${id}`);
  };

  const handleDuplicate = (post: DesignPost) => {
    const now = new Date().toISOString();
    const id = `post-${Date.now()}`;
    const dup: DesignPost = { ...post, id, name: `${post.name} (copy)`, createdAt: now, updatedAt: now };
    addSocialPost(dup);
  };

  const handleDelete = (id: string) => {
    if (confirm('Delete this design?')) deleteSocialPost(id);
  };

  return (
    <div style={{ padding: '32px 40px', maxWidth: 1400, margin: '0 auto' }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 32 }}>
        <div>
          <h1 style={{ margin: 0, fontSize: 28, fontWeight: 800, color: '#1e293b' }}>Social Creator</h1>
          <p style={{ margin: '6px 0 0', fontSize: 15, color: '#64748b' }}>Design stunning social media posts with AI</p>
        </div>
        <button
          onClick={() => setShowNew(true)}
          style={{
            display: 'flex', alignItems: 'center', gap: 8, padding: '10px 20px', border: 'none', borderRadius: 10,
            background: 'linear-gradient(135deg, #6366f1, #a855f7)', color: '#fff', fontWeight: 700, fontSize: 14, cursor: 'pointer',
            boxShadow: '0 4px 12px rgba(99,102,241,0.35)',
          }}
        >
          <Plus size={18} />
          New Design
        </button>
      </div>

      {/* Stats */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 16, marginBottom: 32 }}>
        {[
          { label: 'Total Designs', value: stats.total, icon: <Image size={20} />, color: '#6366f1' },
          { label: 'Published', value: stats.published, icon: <Share2 size={20} />, color: '#22c55e' },
          { label: 'Drafts', value: stats.drafts, icon: <Edit3 size={20} />, color: '#f59e0b' },
          { label: 'Scheduled', value: stats.scheduled, icon: <Clock size={20} />, color: '#0ea5e9' },
        ].map(s => (
          <div key={s.label} style={{ background: '#fff', borderRadius: 12, padding: '20px', border: '1px solid #e2e8f0', display: 'flex', alignItems: 'center', gap: 14 }}>
            <div style={{ width: 44, height: 44, borderRadius: 10, background: s.color + '18', display: 'flex', alignItems: 'center', justifyContent: 'center', color: s.color, flexShrink: 0 }}>
              {s.icon}
            </div>
            <div>
              <div style={{ fontSize: 24, fontWeight: 800, color: '#1e293b' }}>{s.value}</div>
              <div style={{ fontSize: 13, color: '#64748b' }}>{s.label}</div>
            </div>
          </div>
        ))}
      </div>

      {/* Filters */}
      <div style={{ display: 'flex', gap: 12, marginBottom: 24, flexWrap: 'wrap', alignItems: 'center' }}>
        <div style={{ flex: 1, minWidth: 220, position: 'relative' }}>
          <Search size={16} style={{ position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)', color: '#94a3b8' }} />
          <input
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Search designs…"
            style={{ width: '100%', padding: '9px 14px 9px 36px', border: '1px solid #e2e8f0', borderRadius: 8, fontSize: 14, outline: 'none', background: '#fff', boxSizing: 'border-box' }}
          />
        </div>
        <select value={filterPlatform} onChange={e => setFilterPlatform(e.target.value)}
          style={{ padding: '9px 14px', border: '1px solid #e2e8f0', borderRadius: 8, fontSize: 14, background: '#fff', cursor: 'pointer', outline: 'none' }}>
          <option value="all">All Platforms</option>
          {Object.entries(PLATFORM_PRESETS).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
        </select>
        <select value={filterStatus} onChange={e => setFilterStatus(e.target.value)}
          style={{ padding: '9px 14px', border: '1px solid #e2e8f0', borderRadius: 8, fontSize: 14, background: '#fff', cursor: 'pointer', outline: 'none' }}>
          <option value="all">All Status</option>
          <option value="draft">Draft</option>
          <option value="published">Published</option>
          <option value="scheduled">Scheduled</option>
        </select>
        <select value={sortBy} onChange={e => setSortBy(e.target.value as any)}
          style={{ padding: '9px 14px', border: '1px solid #e2e8f0', borderRadius: 8, fontSize: 14, background: '#fff', cursor: 'pointer', outline: 'none' }}>
          <option value="updated">Last Modified</option>
          <option value="created">Date Created</option>
          <option value="name">Name</option>
        </select>
        <div style={{ display: 'flex', gap: 4, background: '#f1f5f9', padding: 3, borderRadius: 8 }}>
          {([['grid', <LayoutGrid size={16} />], ['list', <List size={16} />]] as const).map(([v, icon]) => (
            <button key={v} onClick={() => setView(v as any)}
              style={{ padding: '6px 10px', borderRadius: 6, border: 'none', cursor: 'pointer', background: view === v ? '#fff' : 'transparent', color: view === v ? '#6366f1' : '#94a3b8', boxShadow: view === v ? '0 1px 3px rgba(0,0,0,0.1)' : 'none' }}>
              {icon}
            </button>
          ))}
        </div>
      </div>

      {/* Content */}
      {filtered.length === 0 ? (
        <div style={{ textAlign: 'center', padding: '80px 40px', color: '#64748b' }}>
          <div style={{ fontSize: 64, marginBottom: 16 }}>🎨</div>
          <h3 style={{ margin: '0 0 8px', fontSize: 20, fontWeight: 700, color: '#1e293b' }}>No designs yet</h3>
          <p style={{ margin: '0 0 24px', fontSize: 15 }}>Create your first design to get started</p>
          <button
            onClick={() => setShowNew(true)}
            style={{ padding: '12px 24px', border: 'none', borderRadius: 10, background: '#6366f1', color: '#fff', fontSize: 14, fontWeight: 600, cursor: 'pointer' }}
          >
            Create Design
          </button>
        </div>
      ) : view === 'grid' ? (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(240px, 1fr))', gap: 20 }}>
          {filtered.map(p => (
            <PostCard
              key={p.id}
              post={p}
              onEdit={() => navigate(`/social-creator/editor/${p.id}`)}
              onDuplicate={() => handleDuplicate(p)}
              onDelete={() => handleDelete(p.id)}
            />
          ))}
        </div>
      ) : (
        <div style={{ background: '#fff', borderRadius: 12, border: '1px solid #e2e8f0', overflow: 'hidden' }}>
          {filtered.map((p, i) => (
            <div
              key={p.id}
              onClick={() => navigate(`/social-creator/editor/${p.id}`)}
              style={{
                display: 'flex', alignItems: 'center', gap: 16, padding: '14px 20px', cursor: 'pointer',
                borderBottom: i < filtered.length - 1 ? '1px solid #f1f5f9' : 'none',
              }}
              onMouseEnter={e => (e.currentTarget.style.background = '#f8fafc')}
              onMouseLeave={e => (e.currentTarget.style.background = '#fff')}
            >
              <div style={{ width: 48, height: 48, borderRadius: 8, overflow: 'hidden', flexShrink: 0 }}>
                <ThumbnailPreview post={p} />
              </div>
              <div style={{ flex: 1 }}>
                <div style={{ fontWeight: 600, color: '#1e293b', fontSize: 14 }}>{p.name}</div>
                <div style={{ fontSize: 12, color: '#64748b' }}>{PLATFORM_PRESETS[p.platform]?.label} • {p.aspectRatio}</div>
              </div>
              <span style={{ fontSize: 11, padding: '3px 8px', borderRadius: 99, background: p.status === 'published' ? '#dcfce7' : p.status === 'scheduled' ? '#fef3c7' : '#f1f5f9', color: p.status === 'published' ? '#16a34a' : p.status === 'scheduled' ? '#d97706' : '#64748b' }}>
                {p.status}
              </span>
              <span style={{ fontSize: 12, color: '#94a3b8' }}>{new Date(p.updatedAt).toLocaleDateString()}</span>
              <div style={{ display: 'flex', gap: 4 }}>
                {[
                  { icon: <Edit3 size={14} />, fn: (e: any) => { e.stopPropagation(); navigate(`/social-creator/editor/${p.id}`); } },
                  { icon: <Copy size={14} />, fn: (e: any) => { e.stopPropagation(); handleDuplicate(p); } },
                  { icon: <Trash2 size={14} />, fn: (e: any) => { e.stopPropagation(); handleDelete(p.id); } },
                ].map((btn, bi) => (
                  <button key={bi} onClick={btn.fn} style={{ width: 28, height: 28, borderRadius: 6, border: '1px solid #e2e8f0', background: '#fff', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#64748b' }}>
                    {btn.icon}
                  </button>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}

      {showNew && <NewPostModal onClose={() => setShowNew(false)} onCreate={handleCreate} />}
    </div>
  );
}
