/**
 * BlockRender.tsx — the canonical renderer for a page's FunnelBlocks.
 *
 * Shared by the public site preview, the funnel preview and the template
 * thumbnails in both creation wizards, so what a user previews before choosing
 * a template is exactly what the builder creates.
 */
import { useEffect, useRef, useState } from 'react';
import type { CSSProperties } from 'react';
import type { FunnelBlock, FunnelStep } from '../../types';

export function BlockRender({ block }: { block: FunnelBlock }) {
  const s = block.settings;
  const bg: CSSProperties = s.bgGradient
    ? { background: s.bgGradient }
    : s.bgImage
    ? { backgroundImage: `url(${s.bgImage})`, backgroundSize: 'cover', backgroundPosition: 'center' }
    : { background: s.bgColor ?? '#fff' };
  const pad = s.padding ?? 40;

  switch (block.type) {
    case 'navbar': return (
      <nav style={{ ...bg, padding: '0 40px', height: 64, display: 'flex', alignItems: 'center', justifyContent: 'space-between', boxShadow: '0 1px 4px rgba(0,0,0,0.08)', position: 'sticky', top: 0, zIndex: 100 }}>
        <span style={{ fontWeight: 900, fontSize: 20, color: s.textColor ?? '#0f172a' }}>{s.navLogo ?? 'MySite'}</span>
        <div style={{ display: 'flex', gap: 28 }}>{(s.navLinks ?? []).map((l, i) => <a key={i} href={l.url} style={{ color: s.textColor ?? '#0f172a', textDecoration: 'none', fontSize: 14, fontWeight: 500 }}>{l.label}</a>)}</div>
        {s.buttonText && <button style={{ padding: '8px 18px', background: s.buttonColor ?? '#6366f1', color: s.buttonTextColor ?? '#fff', border: 'none', borderRadius: 8, fontSize: 13, fontWeight: 700, cursor: 'pointer' }}>{s.buttonText}</button>}
      </nav>
    );
    case 'hero': return (
      <section style={{ ...bg, padding: `${pad}px 60px`, textAlign: s.align ?? 'center', minHeight: s.minHeight ?? 420, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', position: 'relative', overflow: 'hidden' }}>
        <div style={{ position: 'absolute', width: 460, height: 460, borderRadius: '50%', background: 'radial-gradient(circle, rgba(255,255,255,0.15), transparent 70%)', top: -170, right: -110, pointerEvents: 'none' }} />
        {s.eyebrow && (
          <span style={{ position: 'relative', display: 'inline-flex', padding: '6px 16px', borderRadius: 999, background: 'rgba(255,255,255,0.16)', backdropFilter: 'blur(6px)', color: s.textColor ?? '#fff', fontSize: 12.5, fontWeight: 700, letterSpacing: '0.04em', textTransform: 'uppercase', marginBottom: 20 }}>
            {s.eyebrow}
          </span>
        )}
        <h1 style={{ position: 'relative', fontSize: 'clamp(32px, 5vw, 56px)', fontWeight: 900, color: s.textColor ?? '#fff', margin: '0 0 18px', maxWidth: 800, lineHeight: 1.12, letterSpacing: '-1px' }}>{block.content}</h1>
        {s.subheading && <p style={{ position: 'relative', fontSize: 'clamp(15px, 2vw, 20px)', color: `${s.textColor ?? '#fff'}cc`, margin: '0 0 36px', maxWidth: 600, lineHeight: 1.65 }}>{s.subheading}</p>}
        <div style={{ position: 'relative', display: 'flex', gap: 14, flexWrap: 'wrap', justifyContent: 'center' }}>
          {s.buttonText && (
            <button
              onMouseEnter={e => { (e.currentTarget as HTMLButtonElement).style.transform = 'translateY(-2px)'; (e.currentTarget as HTMLButtonElement).style.boxShadow = '0 8px 26px rgba(0,0,0,0.2)'; }}
              onMouseLeave={e => { (e.currentTarget as HTMLButtonElement).style.transform = 'none'; (e.currentTarget as HTMLButtonElement).style.boxShadow = '0 4px 18px rgba(0,0,0,0.14)'; }}
              style={{ padding: '14px 30px', background: s.buttonColor ?? '#fff', color: s.buttonTextColor ?? '#1e3a5f', border: 'none', borderRadius: 999, fontSize: 15, fontWeight: 700, cursor: 'pointer', boxShadow: '0 4px 18px rgba(0,0,0,0.14)', transition: 'transform 0.15s ease, box-shadow 0.15s ease' }}>
              {s.buttonText}
            </button>
          )}
          {s.secondaryButtonText && <button style={{ padding: '14px 30px', background: 'transparent', color: s.textColor ?? '#fff', border: `2px solid ${s.textColor ?? '#fff'}66`, borderRadius: 999, fontSize: 15, fontWeight: 600, cursor: 'pointer' }}>{s.secondaryButtonText}</button>}
        </div>
      </section>
    );
    case 'features': return (
      <section style={{ ...bg, padding: `${pad}px 60px` }}>
        <div style={{ textAlign: s.align ?? 'center' }}>
          {s.eyebrow && <span style={{ display: 'inline-block', padding: '5px 14px', borderRadius: 999, background: `${s.iconColor ?? '#6366f1'}15`, color: s.iconColor ?? '#6366f1', fontSize: 12, fontWeight: 700, letterSpacing: '0.04em', textTransform: 'uppercase', marginBottom: 14 }}>{s.eyebrow}</span>}
        </div>
        {block.content && <h2 style={{ textAlign: s.align ?? 'center', fontSize: 34, fontWeight: 800, color: s.textColor ?? '#0f172a', margin: '0 0 8px' }}>{block.content}</h2>}
        {s.subtitle && <p style={{ textAlign: 'center', fontSize: 17, color: `${s.textColor ?? '#0f172a'}99`, margin: '0 0 44px' }}>{s.subtitle}</p>}
        <div style={{ display: 'grid', gridTemplateColumns: `repeat(${Math.min(s.columns ?? 3, 3)}, 1fr)`, gap: 28, maxWidth: 1100, margin: '0 auto' }}>
          {(s.featureItems ?? []).map((f, i) => (
            <div key={i}
              onMouseEnter={e => { (e.currentTarget as HTMLDivElement).style.transform = 'translateY(-4px)'; (e.currentTarget as HTMLDivElement).style.boxShadow = '0 12px 28px rgba(0,0,0,0.08)'; }}
              onMouseLeave={e => { (e.currentTarget as HTMLDivElement).style.transform = 'none'; (e.currentTarget as HTMLDivElement).style.boxShadow = '0 2px 12px rgba(0,0,0,0.06)'; }}
              style={{ padding: 28, borderRadius: 14, background: 'rgba(255,255,255,0.7)', boxShadow: '0 2px 12px rgba(0,0,0,0.06)', border: '1px solid rgba(0,0,0,0.06)', transition: 'transform 0.18s ease, box-shadow 0.18s ease' }}>
              <div style={{ width: 56, height: 56, borderRadius: 14, background: `linear-gradient(135deg, ${s.iconColor ?? '#6366f1'}22, ${s.iconColor ?? '#6366f1'}0d)`, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 28, marginBottom: 16 }}>{f.icon}</div>
              <div style={{ fontWeight: 700, fontSize: 18, color: s.textColor ?? '#0f172a', marginBottom: 8 }}>{f.title}</div>
              <div style={{ fontSize: 14, color: `${s.textColor ?? '#0f172a'}99`, lineHeight: 1.7 }}>{f.desc}</div>
            </div>
          ))}
        </div>
      </section>
    );
    case 'testimonials': return (
      <section style={{ ...bg, padding: `${pad}px 60px` }}>
        {block.content && <h2 style={{ textAlign: 'center', fontSize: 34, fontWeight: 800, color: s.textColor ?? '#0f172a', margin: '0 0 8px' }}>{block.content}</h2>}
        {s.subtitle && <p style={{ textAlign: 'center', fontSize: 17, color: `${s.textColor ?? '#0f172a'}99`, margin: '0 0 44px' }}>{s.subtitle}</p>}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))', gap: 24, maxWidth: 1100, margin: '0 auto' }}>
          {(s.testimonialItems ?? []).map((t, i) => (
            <div key={i} style={{ padding: 30, borderRadius: 14, background: '#fff', boxShadow: '0 2px 16px rgba(0,0,0,0.07)', border: '1px solid #f1f5f9' }}>
              <div style={{ color: '#f59e0b', fontSize: 18, marginBottom: 14 }}>{'★'.repeat(t.stars ?? 5)}</div>
              <p style={{ fontSize: 15, color: '#475569', lineHeight: 1.75, margin: '0 0 18px', fontStyle: 'italic' }}>"{t.quote}"</p>
              <div style={{ fontWeight: 700, fontSize: 14 }}>{t.author}</div>
              <div style={{ fontSize: 12, color: '#94a3b8' }}>{t.role}</div>
            </div>
          ))}
        </div>
      </section>
    );
    case 'pricing': return (
      <section style={{ ...bg, padding: `${pad}px 60px` }}>
        {block.content && <h2 style={{ textAlign: 'center', fontSize: 34, fontWeight: 800, color: s.textColor ?? '#0f172a', margin: '0 0 8px' }}>{block.content}</h2>}
        {s.subtitle && <p style={{ textAlign: 'center', fontSize: 17, color: `${s.textColor ?? '#0f172a'}99`, margin: '0 0 44px' }}>{s.subtitle}</p>}
        <div style={{ display: 'flex', gap: 24, justifyContent: 'center', flexWrap: 'wrap' }}>
          {(s.pricingPlans ?? []).map((p, i) => (
            <div key={i} style={{ padding: '36px 28px', borderRadius: 18, background: p.highlighted ? 'linear-gradient(135deg,#6366f1,#8b5cf6)' : '#fff', color: p.highlighted ? '#fff' : '#0f172a', boxShadow: p.highlighted ? '0 8px 40px rgba(99,102,241,0.3)' : '0 2px 16px rgba(0,0,0,0.08)', minWidth: 240, transform: p.highlighted ? 'scale(1.04)' : 'none' }}>
              <div style={{ fontSize: 15, fontWeight: 700, marginBottom: 8, opacity: 0.8 }}>{p.name}</div>
              <div style={{ fontSize: 44, fontWeight: 900, marginBottom: 4 }}>{p.price}<span style={{ fontSize: 16, fontWeight: 400, opacity: 0.7 }}>{p.period}</span></div>
              <ul style={{ padding: '16px 0', margin: '0 0 22px', listStyle: 'none' }}>{p.features.map((f, j) => <li key={j} style={{ fontSize: 14, marginBottom: 10, display: 'flex', gap: 8 }}><span>✓</span>{f}</li>)}</ul>
              <button style={{ width: '100%', padding: '12px 0', border: p.highlighted ? '2px solid rgba(255,255,255,0.5)' : '2px solid #6366f1', borderRadius: 8, background: p.highlighted ? 'rgba(255,255,255,0.15)' : '#6366f1', color: p.highlighted ? '#fff' : '#fff', fontWeight: 700, fontSize: 14, cursor: 'pointer' }}>{p.buttonText ?? 'Get Started'}</button>
            </div>
          ))}
        </div>
      </section>
    );
    case 'columns': return (
      <section style={{ ...bg, padding: `${pad}px 60px` }}>
        <div style={{ display: 'flex', gap: 64, alignItems: 'center', flexDirection: s.imagePosition === 'left' ? 'row-reverse' : 'row', maxWidth: 1100, margin: '0 auto' }}>
          <div style={{ flex: 1 }}>
            <h2 style={{ fontSize: 36, fontWeight: 800, color: s.textColor ?? '#0f172a', margin: '0 0 16px', lineHeight: 1.2 }}>{block.content}</h2>
            <p style={{ fontSize: 17, color: `${s.textColor ?? '#0f172a'}99`, margin: '0 0 24px', lineHeight: 1.7 }}>{s.subheading}</p>
            {(s.listItems ?? []).map((li, i) => <div key={i} style={{ display: 'flex', gap: 10, marginBottom: 13, fontSize: 15, color: s.textColor ?? '#0f172a' }}><span style={{ color: '#22c55e', fontWeight: 700 }}>✓</span>{li}</div>)}
            {s.buttonText && <button style={{ marginTop: 24, padding: '13px 28px', background: s.buttonColor ?? '#6366f1', color: s.buttonTextColor ?? '#fff', border: 'none', borderRadius: 8, fontSize: 15, fontWeight: 700, cursor: 'pointer' }}>{s.buttonText}</button>}
          </div>
          <div style={{ width: 380, height: 300, borderRadius: 18, background: s.imageUrl ? `url(${s.imageUrl}) center/cover` : 'linear-gradient(135deg,#6366f1,#8b5cf6)', flexShrink: 0 }} />
        </div>
      </section>
    );
    case 'cta': return (
      <section style={{ ...bg, padding: `${pad}px 60px`, textAlign: s.align ?? 'center', position: 'relative', overflow: 'hidden' }}>
        <div style={{ position: 'absolute', width: 500, height: 500, borderRadius: '50%', background: 'radial-gradient(circle, rgba(255,255,255,0.12), transparent 70%)', top: '50%', left: '50%', transform: 'translate(-50%,-50%)', pointerEvents: 'none' }} />
        {s.eyebrow && <span style={{ position: 'relative', display: 'inline-flex', padding: '6px 16px', borderRadius: 999, background: 'rgba(255,255,255,0.16)', color: s.textColor ?? '#fff', fontSize: 12.5, fontWeight: 700, letterSpacing: '0.04em', textTransform: 'uppercase', marginBottom: 18 }}>{s.eyebrow}</span>}
        <h2 style={{ position: 'relative', fontSize: 38, fontWeight: 900, color: s.textColor ?? '#fff', margin: '0 0 12px' }}>{block.content}</h2>
        {s.subheading && <p style={{ position: 'relative', fontSize: 18, color: `${s.textColor ?? '#fff'}cc`, margin: '0 0 32px' }}>{s.subheading}</p>}
        <div style={{ position: 'relative', display: 'flex', gap: 14, justifyContent: 'center', flexWrap: 'wrap' }}>
          {s.buttonText && <button style={{ padding: '15px 36px', background: s.buttonColor ?? '#fff', color: s.buttonTextColor ?? '#6366f1', border: 'none', borderRadius: 999, fontSize: 16, fontWeight: 700, cursor: 'pointer', boxShadow: '0 4px 20px rgba(0,0,0,0.15)' }}>{s.buttonText}</button>}
          {s.secondaryButtonText && <button style={{ padding: '15px 36px', background: 'transparent', color: s.textColor ?? '#fff', border: `2px solid ${s.textColor ?? '#fff'}66`, borderRadius: 999, fontSize: 16, fontWeight: 600, cursor: 'pointer' }}>{s.secondaryButtonText}</button>}
        </div>
      </section>
    );
    case 'stats': return (
      <section style={{ ...bg, padding: `${pad}px 60px` }}>
        <div style={{ display: 'flex', justifyContent: 'center', gap: 64, flexWrap: 'wrap', maxWidth: 1100, margin: '0 auto' }}>
          {(s.statItems ?? []).map((st, i) => (
            <div key={i} style={{ textAlign: 'center' }}>
              {st.icon && <div style={{ fontSize: 32, marginBottom: 8 }}>{st.icon}</div>}
              <div style={{ fontSize: 48, fontWeight: 900, color: s.textColor ?? '#fff', lineHeight: 1 }}>{st.value}</div>
              <div style={{ fontSize: 14, color: `${s.textColor ?? '#fff'}aa`, marginTop: 6 }}>{st.label}</div>
            </div>
          ))}
        </div>
      </section>
    );
    case 'faq': return (
      <section style={{ ...bg, padding: `${pad}px 60px` }}>
        <div style={{ textAlign: 'center' }}>
          {s.eyebrow && <span style={{ display: 'inline-block', padding: '5px 14px', borderRadius: 999, background: '#6366f115', color: '#6366f1', fontSize: 12, fontWeight: 700, letterSpacing: '0.04em', textTransform: 'uppercase', marginBottom: 14 }}>{s.eyebrow}</span>}
        </div>
        {block.content && <h2 style={{ textAlign: 'center', fontSize: 34, fontWeight: 800, color: s.textColor ?? '#0f172a', margin: '0 0 40px' }}>{block.content}</h2>}
        <div style={{ maxWidth: 760, margin: '0 auto' }}>
          {(s.faqItems ?? []).map((f, i) => (
            <details key={i} style={{ borderBottom: '1px solid #f1f5f9', padding: '22px 0' }}>
              <summary style={{ fontWeight: 700, fontSize: 17, color: s.textColor ?? '#0f172a', marginBottom: 8, cursor: 'pointer', listStyle: 'none', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                {f.q}<span className="faq-chevron" style={{ color: '#6366f1', fontSize: 13, fontWeight: 700, flexShrink: 0, marginLeft: 12 }}>▼</span>
              </summary>
              <div style={{ fontSize: 15, color: `${s.textColor ?? '#0f172a'}99`, lineHeight: 1.75, marginTop: 8 }}>{f.a}</div>
            </details>
          ))}
        </div>
      </section>
    );
    case 'gallery': return (
      <section style={{ ...bg, padding: `${pad}px 60px` }}>
        {block.content && <h2 style={{ textAlign: 'center', fontSize: 34, fontWeight: 800, color: s.textColor ?? '#0f172a', margin: '0 0 8px' }}>{block.content}</h2>}
        {s.subtitle && <p style={{ textAlign: 'center', color: `${s.textColor ?? '#0f172a'}99`, margin: '0 0 40px' }}>{s.subtitle}</p>}
        <div style={{ display: 'grid', gridTemplateColumns: `repeat(${s.columns ?? 3}, 1fr)`, gap: 16, maxWidth: 1100, margin: '0 auto' }}>
          {(s.galleryImages ?? []).map((c, i) => <div key={i} style={{ aspectRatio: '4/3', borderRadius: 12, background: c.startsWith('#') ? c : `url(${c}) center/cover`, boxShadow: '0 2px 12px rgba(0,0,0,0.1)' }} />)}
        </div>
      </section>
    );
    case 'footer': return (
      <footer style={{ ...bg, padding: `${pad}px 60px` }}>
        <div style={{ display: 'flex', gap: 64, flexWrap: 'wrap', marginBottom: 40, maxWidth: 1100, margin: '0 auto 40px' }}>
          <div style={{ flex: 2 }}>
            <div style={{ fontWeight: 900, fontSize: 24, color: '#fff', marginBottom: 12 }}>{s.navLogo ?? 'MySite'}</div>
            <p style={{ fontSize: 14, color: s.textColor ?? '#94a3b8', lineHeight: 1.7, maxWidth: 300 }}>Building better businesses through design and strategy.</p>
          </div>
          {(s.footerColumns ?? []).map((col, i) => (
            <div key={i} style={{ flex: 1 }}>
              <div style={{ fontWeight: 700, fontSize: 12, color: '#fff', marginBottom: 14, textTransform: 'uppercase', letterSpacing: 0.5 }}>{col.heading}</div>
              {col.links.map((l, j) => <div key={j} style={{ marginBottom: 10 }}><a href={l.url} style={{ color: s.textColor ?? '#94a3b8', fontSize: 14, textDecoration: 'none' }}>{l.label}</a></div>)}
            </div>
          ))}
        </div>
        <div style={{ borderTop: '1px solid rgba(255,255,255,0.1)', paddingTop: 24, textAlign: 'center', fontSize: 13, color: s.textColor ?? '#64748b' }}>{s.footerCopyright}</div>
      </footer>
    );
    case 'heading': return <div style={{ ...bg, padding: `${pad}px 60px`, textAlign: s.align ?? 'center' }}><h2 style={{ margin: 0, fontSize: s.size === 'xl' ? 44 : s.size === 'lg' ? 34 : s.size === 'sm' ? 22 : 28, fontWeight: parseInt(s.fontWeight ?? '700'), color: s.color ?? s.textColor ?? '#0f172a' }}>{block.content}</h2></div>;
    case 'text': return <div style={{ ...bg, padding: `${pad}px 60px`, textAlign: s.align ?? 'left' }}><p style={{ margin: 0, fontSize: s.size === 'lg' ? 18 : s.size === 'sm' ? 13 : 15, color: s.color ?? s.textColor ?? '#475569', lineHeight: 1.8, maxWidth: 760 }}>{block.content}</p></div>;
    case 'button': return <div style={{ ...bg, padding: `${pad}px 60px`, textAlign: s.align ?? 'center' }}><button style={{ padding: '13px 30px', background: s.buttonColor ?? '#6366f1', color: s.buttonTextColor ?? '#fff', border: 'none', borderRadius: s.borderRadius ?? 8, fontSize: 15, fontWeight: 700, cursor: 'pointer' }}>{s.buttonText ?? block.content}</button></div>;
    case 'image': return <div style={{ ...bg, padding: `${pad}px 60px`, textAlign: s.align ?? 'center' }}>{s.imageUrl ? <img src={s.imageUrl} alt={s.imageAlt ?? ''} style={{ maxWidth: '100%', borderRadius: s.borderRadius ?? 0, boxShadow: s.shadow ? '0 8px 32px rgba(0,0,0,0.15)' : 'none' }} /> : null}</div>;
    case 'video': return <div style={{ ...bg, padding: `${pad}px 60px` }}>{s.url ? <div style={{ position: 'relative', paddingBottom: '56.25%', maxWidth: 900, margin: '0 auto', borderRadius: 12, overflow: 'hidden' }}><iframe src={s.url} style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', border: 'none' }} allowFullScreen /></div> : null}</div>;
    case 'form': return (
      <section style={{ ...bg, padding: `${pad}px 60px` }}>
        {block.content && <h2 style={{ textAlign: s.align ?? 'center', fontSize: 30, fontWeight: 800, color: s.textColor ?? '#0f172a', margin: '0 0 30px' }}>{block.content}</h2>}
        <div style={{ maxWidth: 540, margin: '0 auto' }}>
          {(s.formFields ?? []).map((f, i) => (
            <div key={i} style={{ marginBottom: 16 }}>
              <label style={{ display: 'block', fontSize: 13, fontWeight: 600, color: '#374151', marginBottom: 5 }}>{f.label}{f.required && <span style={{ color: '#ef4444' }}> *</span>}</label>
              {f.type === 'textarea' ? <textarea rows={4} style={{ width: '100%', padding: '11px 13px', border: '1px solid #e2e8f0', borderRadius: 8, fontSize: 14, resize: 'vertical', boxSizing: 'border-box', fontFamily: 'inherit' }} /> : <input type={f.type} style={{ width: '100%', padding: '11px 13px', border: '1px solid #e2e8f0', borderRadius: 8, fontSize: 14, boxSizing: 'border-box' }} />}
            </div>
          ))}
          <button style={{ width: '100%', padding: '13px 0', background: s.buttonColor ?? '#6366f1', color: s.buttonTextColor ?? '#fff', border: 'none', borderRadius: 8, fontSize: 15, fontWeight: 700, cursor: 'pointer', marginTop: 4 }}>{s.buttonText ?? 'Submit'}</button>
        </div>
      </section>
    );
    case 'divider': return <div style={{ padding: `${pad}px 60px` }}><hr style={{ border: 'none', borderTop: `2px solid ${s.color ?? '#e2e8f0'}`, margin: 0 }} /></div>;
    case 'spacer': return <div style={{ height: pad }} />;
    default: return null;
  }
}

/** Render every block of a page, in order. */
export function PageBlocks({ page }: { page: FunnelStep }) {
  return <>{page.blocks.map(b => <BlockRender key={b.id} block={b} />)}</>;
}

/**
 * A scaled-down, non-interactive thumbnail of a real page. Renders the page at
 * `renderWidth` then CSS-scales it into the available box, so the preview is
 * pixel-accurate to what the builder will produce.
 */
export function PagePreview({ page, height = 200, renderWidth = 1100, scrollOnHover = false }: {
  page: FunnelStep; height?: number; renderWidth?: number; scrollOnHover?: boolean;
}) {
  const scale = 320 / renderWidth;
  return (
    <div
      className={scrollOnHover ? 'tpl-preview' : undefined}
      style={{ position: 'relative', height, overflow: 'hidden', background: '#fff' }}
    >
      <div
        className={scrollOnHover ? 'tpl-preview-inner' : undefined}
        style={{
          width: renderWidth,
          transform: `scale(${scale})`,
          transformOrigin: 'top left',
          pointerEvents: 'none',
          position: 'absolute',
          top: 0,
          left: 0,
        }}
      >
        <PageBlocks page={page} />
      </div>
    </div>
  );
}

/* ── Responsive scaled previews ───────────────────────────────────────────── */

/** Track a container's rendered width so a page can be scaled to fit it. */
function useBoxWidth<T extends HTMLElement>() {
  const ref = useRef<T | null>(null);
  const [w, setW] = useState(0);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    setW(el.getBoundingClientRect().width);
    const ro = new ResizeObserver(entries => setW(entries[0].contentRect.width));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  return [ref, w] as const;
}

/**
 * A real page, rendered at desktop width and scaled to fill its container.
 * With `hoverScroll` the full page slowly scrolls while the pointer is over the
 * card, so a thumbnail shows the whole design rather than just the hero.
 */
export function ScaledPage({ page, height, renderWidth = 1100, hoverScroll = true, shift = '-62%' }: {
  page: FunnelStep; height: number; renderWidth?: number; hoverScroll?: boolean; shift?: string;
}) {
  const [ref, w] = useBoxWidth<HTMLDivElement>();
  const scale = w > 0 ? w / renderWidth : 0;
  return (
    <div ref={ref} className={hoverScroll ? 'tpl-preview' : undefined}
      style={{ position: 'relative', height, overflow: 'hidden', background: '#fff' }}>
      {scale > 0 && (
        <div className={hoverScroll ? 'tpl-preview-inner' : undefined}
          style={{
            position: 'absolute', top: 0, left: 0, width: renderWidth,
            transform: `scale(${scale})`, transformOrigin: 'top left', pointerEvents: 'none',
            ['--tpl-scale' as string]: String(scale),
            ['--tpl-shift' as string]: shift,
          }}>
          <PageBlocks page={page} />
        </div>
      )}
    </div>
  );
}

/**
 * All steps of a funnel side by side in one thumbnail, each scrolling on hover.
 * Multi-step funnels are hard to judge from a single page, so the card shows the
 * whole flow at a glance.
 */
export function PagesStrip({ pages, height, max = 4 }: { pages: FunnelStep[]; height: number; max?: number }) {
  const shown = pages.slice(0, max);
  const extra = pages.length - shown.length;
  if (!shown.length) return <div style={{ height, background: '#f1f5f9' }} />;
  return (
    <div style={{ display: 'flex', height, background: '#e2e8f0', gap: 2 }}>
      {shown.map((p, i) => (
        <div key={p.id} style={{ flex: 1, minWidth: 0, position: 'relative', background: '#fff' }}>
          <ScaledPage page={p} height={height} renderWidth={1100} shift={'-58%'} />
          <span style={{
            position: 'absolute', left: 4, bottom: 4, padding: '1px 6px', borderRadius: 4,
            background: 'rgba(15,23,42,0.75)', color: '#fff', fontSize: 8.5, fontWeight: 700,
            maxWidth: 'calc(100% - 8px)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
            pointerEvents: 'none',
          }}>
            {i + 1}. {p.name}
          </span>
        </div>
      ))}
      {extra > 0 && (
        <div style={{ width: 34, display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#0f172a', color: '#fff', fontSize: 11, fontWeight: 800, flexShrink: 0 }}>
          +{extra}
        </div>
      )}
    </div>
  );
}
