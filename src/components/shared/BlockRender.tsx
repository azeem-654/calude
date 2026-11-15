/**
 * BlockRender.tsx — the canonical renderer for a page's FunnelBlocks.
 *
 * Shared by the public site preview, the funnel preview and the template
 * thumbnails in both creation wizards, so what a user previews before choosing
 * a template is exactly what the builder creates.
 */
import { useEffect, useRef, useState } from 'react';
import type { CSSProperties, ReactElement, ReactNode } from 'react';
import type { FunnelBlock, FunnelStep } from '../../types';
import './blockModern.css';

export function BlockRender({ block }: { block: FunnelBlock }) {
  const s = block.settings;
  const bg: CSSProperties = s.bgGradient
    ? { background: s.bgGradient }
    : s.bgImage
    ? { backgroundImage: `url(${s.bgImage})`, backgroundSize: 'cover', backgroundPosition: 'center' }
    : { background: s.bgColor ?? '#fff' };
  const pad = s.padding ?? 40;

  /* The newer look is per block and opt-in (see `look` in types), so a page
     saved before it keeps the styling it was published with. Blocks it does
     not restyle fall through to the original drawing below. */
  if (s.look === 'modern') {
    const m = modernBlock(block, bg, pad);
    if (m !== undefined) return m;
  }

  switch (block.type) {
    case 'navbar': return (
      <nav style={{ ...bg, padding: '0 40px', height: 64, display: 'flex', alignItems: 'center', justifyContent: 'space-between', boxShadow: '0 1px 4px rgba(0,0,0,0.08)', position: 'sticky', top: 0, zIndex: 100 }}>
        {s.navLogoImage
          ? <img src={s.navLogoImage} alt={s.navLogo ?? ''} style={{ height: 40, width: 'auto', maxWidth: 180, objectFit: 'contain' }} />
          : <span style={{ fontWeight: 900, fontSize: 20, color: s.textColor ?? '#0f172a' }}>{s.navLogo ?? 'MySite'}</span>}
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
    case 'form': return <FormBlock block={block} bg={bg} pad={pad} />;
    case 'divider': return <div style={{ padding: `${pad}px 60px` }}><hr style={{ border: 'none', borderTop: `2px solid ${s.color ?? '#e2e8f0'}`, margin: 0 }} /></div>;
    case 'spacer': return <div style={{ height: pad }} />;
    default: return null;
  }
}

/**
 * A form block that actually collects something.
 *
 * ── What was here before ──
 *
 * Markup. Inputs with no state, no `name`, no handler, and a button with no
 * `onClick`. A visitor on a published page filled it in, pressed Submit, and
 * **nothing happened at all** — no request, no error, no record. Every enquiry
 * that page ever took was lost at the moment it was typed, and the page looked
 * completely normal doing it.
 *
 * ── Why it posts to a form rather than to the site ──
 *
 * A submission has to name a workspace, and a public page cannot be trusted to
 * name one — that is the rule the whole engagement route is built on. An
 * engagement form's slug is unique across the install and maps to exactly one
 * workspace, so binding the block to a form answers the tenancy question
 * without inventing a second way to answer it.
 *
 * It also means this inherits everything that path already does: the consent
 * tick, the content gate, the person record, the notification, the contact, the
 * deal, and any automation listening for that form.
 *
 * ── Consent is the form's, and the visitor's ──
 *
 * This sent `consent: true` on every submission, whatever the form said — so a
 * form whose owner wrote consent wording ("I agree to be contacted…") took the
 * enquiry from a page that never showed the wording or a box, and the server,
 * which refuses a submission without the tick, was told it had been ticked.
 * The record then claimed an agreement nobody gave.
 *
 * The wording is read from the form itself (`engage.php form`, the same answer
 * the form's own page uses) rather than copied into the block, because the
 * owner can change it after the page is published and the page must follow.
 * Where there is wording, the box is drawn and its real value is sent; where
 * there is none, nothing is claimed. A server refusal for consent re-reads the
 * form, so wording added since the page loaded appears instead of a dead end.
 *
 * An unbound block says so rather than collecting into nothing.
 */
function FormBlock({ block, bg, pad }: { block: FunnelBlock; bg: CSSProperties; pad: number }) {
  const s = block.settings;
  const fields = s.formFields ?? [];
  const slug = (s.formSlug ?? '').trim();

  const [values, setValues] = useState<Record<string, string>>({});
  const [state, setState] = useState<'idle' | 'sending' | 'sent' | 'error'>('idle');
  const [message, setMessage] = useState('');
  /* `null` until the form has answered. `missing` is a draft or deleted form;
     `unknown` is a server that could not be asked — the visitor may still
     try, and the server will refuse anything consent-bound. */
  const [form, setForm] = useState<{ consentText: string; missing?: boolean; unknown?: boolean } | null>(null);
  const [consent, setConsent] = useState(false);

  const loadForm = async (): Promise<string> => {
    try {
      const r = await fetch(`${window.location.origin}/api/engage.php`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'form', formSlug: slug }),
      });
      const d = await r.json() as { success?: boolean; notFound?: boolean; form?: { consentText?: string | null } };
      if (!d.success) { setForm({ consentText: '', missing: !!d.notFound || r.status === 404 }); return ''; }
      const consentText = String(d.form?.consentText ?? '').trim();
      setForm({ consentText });
      return consentText;
    } catch {
      setForm({ consentText: '', unknown: true });
      return '';
    }
  };

  useEffect(() => {
    if (!slug) return;
    setForm(null);
    void loadForm();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [slug]);

  const consentText = form?.consentText ?? '';

  /* The key a field's answer is filed under. `email` and `phone` matter: the
     capture reads those two by name to build the contact, so a field labelled
     "Email Address" still has to arrive as `email`. */
  const keyFor = (label: string, type: string, i: number): string => {
    const t = type.toLowerCase();
    if (t === 'email') return 'email';
    if (t === 'phone' || t === 'tel') return 'phone';
    const slugged = label.toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '');
    if (slugged === 'name' || slugged === 'full_name' || slugged === 'your_name') return 'name';
    if (slugged === 'company' || slugged === 'business') return 'company';
    return slugged || `field_${i}`;
  };

  async function send() {
    if (!slug) return;
    const missing = fields.find((f, i) => f.required && !(values[keyFor(f.label, f.type, i)] ?? '').trim());
    if (missing) { setState('error'); setMessage(`${missing.label} is needed.`); return; }
    if (consentText && !consent) { setState('error'); setMessage('Please tick the box to agree before sending.'); return; }

    setState('sending');
    try {
      const r = await fetch(`${window.location.origin}/api/engage.php`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          /* What the visitor did, and nothing more. No wording means no box
             and no claim: `false`, which the server only minds when the form
             asks for consent. */
          action: 'submit', formSlug: slug, answers: values, consent: consentText ? consent : false,
          context: { page: window.location.href },
        }),
      });
      const d = await r.json() as { success?: boolean; message?: string; error?: string; redirect?: string; code?: string };
      if (!d.success) {
        /* Wording added after this page loaded: show the box now. */
        if (d.code === 'consent') await loadForm();
        setState('error'); setMessage(d.error ?? 'That could not be sent.'); return;
      }
      setState('sent');
      setMessage(d.message || 'Thank you — we have got that.');
      /* The form's own redirect wins over the block's, because the form is
         where somebody configured what happens after a submission. */
      const to = d.redirect || s.redirectUrl;
      if (to) window.location.href = to;
    } catch (e) {
      /* Named rather than swallowed. "Nothing happened" is the failure this
         whole component exists to stop, and a dead network is still nothing
         happening unless the page says so. */
      setState('error');
      setMessage(`That could not be sent: ${e instanceof Error ? e.message : String(e)}`);
    }
  }

  const ready = !!slug && !!form && !form.missing;

  const input: CSSProperties = {
    width: '100%', padding: '11px 13px', border: '1px solid #e2e8f0', borderRadius: 8,
    fontSize: 14, boxSizing: 'border-box', fontFamily: 'inherit',
  };

  const modern = s.look === 'modern';
  return (
    <section className={modern ? 'bm' : undefined} style={modern ? bg : { ...bg, padding: `${pad}px 60px` }}>
      <div className={modern ? 'bm-in' : undefined} style={modern ? padY(pad) : undefined}>
      {block.content && (modern
        ? <h2 className="bm-h2" style={{ textAlign: s.align ?? 'center', color: s.textColor ?? '#0f172a', margin: '0 auto 28px', maxWidth: 760 }}>{block.content}</h2>
        : <h2 style={{ textAlign: s.align ?? 'center', fontSize: 30, fontWeight: 800, color: s.textColor ?? '#0f172a', margin: '0 0 30px' }}>{block.content}</h2>)}
      <div className={modern ? 'bm-form' : undefined} style={{ maxWidth: modern ? undefined : 540, margin: '0 auto' }}>
        {state === 'sent' ? (
          <p style={{
            margin: 0, padding: '16px 18px', borderRadius: 10, background: '#ecfdf5',
            border: '1px solid #a7f3d0', color: '#065f46', fontSize: 15, textAlign: 'center',
          }}>{message}</p>
        ) : (
          <>
            {fields.map((f, i) => {
              const k = keyFor(f.label, f.type, i);
              return (
                <div key={i} style={{ marginBottom: 16 }}>
                  <label htmlFor={`${block.id}-${k}`} style={{ display: 'block', fontSize: 13, fontWeight: 600, color: '#374151', marginBottom: 5 }}>
                    {f.label}{f.required && <span style={{ color: '#ef4444' }}> *</span>}
                  </label>
                  {f.type === 'textarea' ? (
                    <textarea id={`${block.id}-${k}`} rows={4} value={values[k] ?? ''}
                      onChange={e => setValues(v => ({ ...v, [k]: e.target.value }))}
                      style={{ ...input, resize: 'vertical' }} />
                  ) : (
                    <input id={`${block.id}-${k}`} type={f.type} value={values[k] ?? ''}
                      onChange={e => setValues(v => ({ ...v, [k]: e.target.value }))}
                      style={input} />
                  )}
                </div>
              );
            })}

            {consentText && (
              <label style={{ display: 'flex', gap: 9, alignItems: 'flex-start', fontSize: 13, color: '#475569', lineHeight: 1.5, margin: '4px 0 14px' }}>
                <input type="checkbox" checked={consent} data-field="consent"
                  onChange={e => setConsent(e.target.checked)} style={{ marginTop: 3, flexShrink: 0 }} />
                <span>{consentText}</span>
              </label>
            )}

            {message && state === 'error' && (
              <p role="alert" style={{ margin: '0 0 12px', fontSize: 13, color: '#b42318' }}>{message}</p>
            )}

            {/* Held until the form has said whether it asks for consent, so
                nobody can send before the box they owe a tick is on screen. */}
            <button onClick={() => void send()} disabled={!ready || state === 'sending'}
              style={{
                width: '100%', padding: '13px 0', background: ready ? (s.buttonColor ?? '#6366f1') : '#cbd5e1',
                color: s.buttonTextColor ?? '#fff', border: 'none', borderRadius: 8, fontSize: 15,
                fontWeight: 700, cursor: !ready || state === 'sending' ? 'default' : 'pointer',
                marginTop: 4, fontFamily: 'inherit',
              }}>
              {state === 'sending' ? 'Sending…' : (s.buttonText ?? 'Submit')}
            </button>

            {!slug && (
              /* Said on the page, because the alternative is what this replaced:
                 a form that looks finished and collects nothing. Whoever is
                 looking at this is either the owner in the builder — who needs
                 to know — or a visitor, who deserves not to waste their time. */
              <p style={{ margin: '10px 0 0', fontSize: 12.5, color: '#b45309', textAlign: 'center', lineHeight: 1.55 }}>
                This form is not connected yet, so it cannot take an enquiry.
                Choose a form for it in the builder, under Customer&nbsp;Engagement&nbsp;→&nbsp;Forms.
              </p>
            )}
            {slug && form?.missing && (
              <p style={{ margin: '10px 0 0', fontSize: 12.5, color: '#b45309', textAlign: 'center', lineHeight: 1.55 }}>
                This form is not taking enquiries at the moment.
              </p>
            )}
          </>
        )}
      </div>
      </div>
    </section>
  );
}

/* ── The modern look (settings.look === 'modern') ─────────────────────────────
   Same blocks, same fields, drawn the way pages are designed now: an inset
   rounded hero over a mesh, a floating pill nav, big tight type, glassy
   rounded cards, pill buttons. Layout is in blockModern.css (it has to follow
   the width the page is drawn at); colours are the block's own settings. */

/** A custom property in an inline style. */
const cssVars = (v: Record<string, string | number>): CSSProperties => v as CSSProperties;
/** The section's vertical padding: the block's own at full width, less on a phone. */
const padY = (pad: number): CSSProperties => cssVars({ '--bm-y': `clamp(${Math.round(pad * 0.6)}px, 12cqi, ${pad}px)` });
const mix = (c: string, pct: number, to = 'transparent') => `color-mix(in srgb, ${c} ${pct}%, ${to})`;

/** Whether a colour is light — so text on it should be dark, and a section with light text is a dark one. */
function isLight(c?: string): boolean {
  const v = String(c ?? '').trim();
  const m = /^#?([0-9a-f]{3}|[0-9a-f]{6})$/i.exec(v);
  if (!m) return /^white$/i.test(v);
  const h = m[1].length === 3 ? m[1].split('').map(x => x + x).join('') : m[1];
  const n = parseInt(h, 16);
  return (0.299 * ((n >> 16) & 255) + 0.587 * ((n >> 8) & 255) + 0.114 * (n & 255)) / 255 > 0.6;
}
const readableOn = (c: string) => (isLight(c) ? '#0f172a' : '#ffffff');
/** The brand colour as small text on white: a pale one (mint, lemon) is darkened until it reads. */
const textTone = (c: string) => (isLight(c) ? mix(c, 45, '#0f172a') : c);
const initials = (name: string) => name.split(/\s+/).filter(Boolean).slice(0, 2).map(w => w[0]).join('').toUpperCase() || '·';

function Head({ eyebrow, title, subtitle, ink, accent, align }: {
  eyebrow?: string; title?: string; subtitle?: string; ink: string; accent: string; align?: string;
}) {
  if (!eyebrow && !title && !subtitle) return null;
  const tone = isLight(ink) ? '#ffffff' : textTone(accent);
  return (
    <div className="bm-head" data-align={align === 'left' ? 'left' : undefined}>
      {eyebrow && <span className="bm-eyebrow" style={{ color: tone, borderColor: mix(tone, 28), background: mix(tone, 8) }}>{eyebrow}</span>}
      {title && <h2 className="bm-h2" style={{ color: ink }}>{title}</h2>}
      {subtitle && <p className="bm-sub" style={{ color: mix(ink, 66) }}>{subtitle}</p>}
    </div>
  );
}

function Btn({ text, bg, color, ghost, arrow, small }: {
  text: string; bg?: string; color: string; ghost?: boolean; arrow?: boolean; small?: boolean;
}) {
  /* Templates write white text on the brand colour; a pale brand colour
     (a mint, a lemon) would make that unreadable, so the text flips. */
  if (bg && !ghost && isLight(bg) === isLight(color)) color = readableOn(bg);
  return (
    <button type="button" className={`bm-btn${small ? ' bm-btn-sm' : ''}${ghost ? ' bm-btn-ghost' : ''}`} data-ico={arrow ? '' : undefined}
      style={ghost || !bg ? { color } : { background: bg, color, boxShadow: `0 14px 30px -14px ${mix(bg, 80)}` }}>
      {text}
      {arrow && <span className="bm-btn-ico" aria-hidden>→</span>}
    </button>
  );
}

/** The hero's and the call-to-action's shared panel: inset, rounded, over the block's background. */
function Panel({ block, bg, pad, cta }: { block: FunnelBlock; bg: CSSProperties; pad: number; cta?: boolean }) {
  const s = block.settings;
  const ink = s.textColor ?? '#ffffff';
  const onDark = isLight(ink);
  const accent = s.buttonColor ?? '#ffffff';
  return (
    <section className="bm bm-inset">
      <div className="bm-panel" data-align={s.align === 'left' ? 'left' : undefined}
        style={{ ...bg, color: ink, minHeight: cta ? undefined : `min(${s.minHeight ?? 420}px, 150cqi)` }}>
        <span className="bm-glow" style={{ background: onDark ? 'rgba(255,255,255,0.32)' : mix(accent, 40), top: '-32%', right: '-14%' }} />
        {s.buttonColor && <span className="bm-glow" style={{ background: mix(s.buttonColor, 45), bottom: '-40%', left: '-18%', opacity: 0.35 }} />}
        <div className="bm-in" style={padY(pad)}>
          {s.eyebrow && (
            <span className={`bm-eyebrow${onDark ? ' bm-glass-eyebrow' : ''}`}
              style={onDark ? { color: ink } : { color: accent, borderColor: mix(accent, 28), background: mix(accent, 8) }}>{s.eyebrow}</span>
          )}
          {cta
            ? <h2 className="bm-h1 bm-cta-h" style={{ color: ink }}>{block.content}</h2>
            : <h1 className="bm-h1" style={{ color: ink }}>{block.content}</h1>}
          {s.subheading && <p className="bm-lead" style={{ color: mix(ink, 78) }}>{s.subheading}</p>}
          {(s.buttonText || s.secondaryButtonText) && (
            <div className="bm-actions">
              {s.buttonText && <Btn text={s.buttonText} bg={s.buttonColor ?? '#ffffff'} color={s.buttonTextColor ?? readableOn(s.buttonColor ?? '#ffffff')} arrow />}
              {s.secondaryButtonText && <Btn text={s.secondaryButtonText} color={ink} ghost />}
            </div>
          )}
        </div>
      </div>
    </section>
  );
}

function modernBlock(block: FunnelBlock, bg: CSSProperties, pad: number): ReactElement | null | undefined {
  const s = block.settings;
  const ink = s.textColor ?? '#0f172a';
  const accent = s.iconColor ?? s.buttonColor ?? '#6366f1';
  const dark = isLight(ink) ? '' : undefined;
  const sec = (children: ReactNode) => (
    <section className="bm" data-dark={dark} style={{ ...bg, color: ink }}>
      <div className="bm-in" style={padY(pad)}>{children}</div>
    </section>
  );
  const head = <Head eyebrow={s.eyebrow} title={block.content} subtitle={s.subtitle} ink={ink} accent={accent} align={s.align} />;

  switch (block.type) {
    case 'navbar': {
      const brand = s.buttonColor ?? '#6366f1';
      return (
        /* The strip is see-through so the pill floats over the page once it
           sticks; the pill carries the block's background. */
        <nav className="bm bm-nav">
          <div className="bm-nav-pill" style={{ background: mix(s.bgColor ?? '#ffffff', 80), color: ink }}>
            {s.navLogoImage
              ? <img src={s.navLogoImage} alt={s.navLogo ?? ''} style={{ height: 34, width: 'auto', maxWidth: 170, objectFit: 'contain' }} />
              : <span className="bm-logo"><i style={{ background: `linear-gradient(135deg, ${brand}, ${mix(brand, 55, '#000000')})` }} /><span>{s.navLogo ?? 'MySite'}</span></span>}
            <div className="bm-links">{(s.navLinks ?? []).map((l, i) => <a key={i} href={l.url} style={{ color: ink }}>{l.label}</a>)}</div>
            {s.buttonText && <span className="bm-nav-cta"><Btn text={s.buttonText} bg={brand} color={s.buttonTextColor ?? readableOn(brand)} small /></span>}
          </div>
        </nav>
      );
    }
    case 'hero': return <Panel block={block} bg={bg} pad={pad} />;
    case 'cta': return <Panel block={block} bg={bg} pad={pad} cta />;
    case 'features': return sec(<>
      {head}
      <div className="bm-grid" style={cssVars({ '--bm-cols': Math.min(Math.max(s.columns ?? 3, 1), 4) })}>
        {(s.featureItems ?? []).map((f, i) => (
          <div key={i} className="bm-card">
            <div className="bm-ico" style={{ background: `linear-gradient(135deg, ${mix(accent, 22)}, ${mix(accent, 6)})`, borderColor: mix(accent, 22) }}>{f.icon}</div>
            <h3 style={{ color: ink }}>{f.title}</h3>
            {f.desc && <p style={{ color: mix(ink, 64) }}>{f.desc}</p>}
          </div>
        ))}
      </div>
    </>);
    case 'testimonials': {
      const items = s.testimonialItems ?? [];
      return sec(<>
        {head}
        <div className="bm-grid" style={cssVars({ '--bm-cols': Math.min(Math.max(items.length, 1), 3) })}>
          {items.map((t, i) => (
            <figure key={i} className="bm-card bm-quote" data-placeholder={t.placeholder ? '' : undefined} style={{ margin: 0 }}>
              {t.placeholder
                ? <span className="bm-tag">Placeholder</span>
                : (t.stars ?? 0) > 0
                  ? <div style={{ color: '#f59e0b', letterSpacing: 2, fontSize: 15 }} aria-label={`${t.stars} stars`}>{'★'.repeat(Math.min(5, t.stars ?? 0))}</div>
                  : <span className="bm-qmark" style={{ color: accent }} aria-hidden>“</span>}
              <blockquote style={{ color: t.placeholder ? mix(ink, 60) : ink }}>{t.quote}</blockquote>
              <figcaption className="bm-who">
                <span className="bm-avatar" style={t.avatar ? { backgroundImage: `url(${t.avatar})` } : { background: mix(accent, 14), color: accent }}>{t.avatar ? '' : initials(t.author)}</span>
                <span><strong style={{ color: ink }}>{t.author}</strong><small style={{ color: ink }}>{t.role}</small></span>
              </figcaption>
            </figure>
          ))}
        </div>
      </>);
    }
    case 'pricing': {
      const plans = s.pricingPlans ?? [];
      return sec(<>
        {head}
        <div className="bm-plans" style={cssVars({ '--bm-cols': Math.min(Math.max(plans.length, 1), 3) })}>
          {plans.map((p, i) => (
            <div key={i} className="bm-card bm-plan" data-hot={p.highlighted ? '' : undefined}
              style={p.highlighted
                ? { background: `radial-gradient(120% 80% at 100% 0%, ${mix(accent, 55)}, transparent 60%), #0e1014`, boxShadow: `0 30px 60px -30px ${mix(accent, 75)}` }
                : { color: ink }}>
              {/* "Recommended", not "Most popular": that would be a claim about sales nobody has measured. */}
              {p.highlighted && <span className="bm-pop" style={{ background: accent, color: readableOn(accent) }}>Recommended</span>}
              <div className="bm-plan-name">{p.name}</div>
              <div className="bm-price">{p.price}<small>{p.period}</small></div>
              <ul>{p.features.map((f, j) => <li key={j}><span style={{ color: p.highlighted ? '#ffffff' : accent, fontWeight: 800 }}>✓</span><span>{f}</span></li>)}</ul>
              <Btn text={p.buttonText ?? 'Get started'} bg={p.highlighted ? '#ffffff' : accent} color={p.highlighted ? '#0e1014' : readableOn(accent)} />
            </div>
          ))}
        </div>
      </>);
    }
    case 'columns': {
      const btn = s.buttonColor ?? accent;
      return sec(
        <div className="bm-split" data-flip={s.imagePosition === 'left' ? '' : undefined}>
          <div>
            {s.eyebrow && <span className="bm-eyebrow" style={{ color: isLight(ink) ? '#ffffff' : textTone(accent), borderColor: mix(accent, 28), background: mix(accent, 8) }}>{s.eyebrow}</span>}
            <h2 className="bm-h2" style={{ color: ink }}>{block.content}</h2>
            {s.subheading && <p className="bm-sub" style={{ color: mix(ink, 66) }}>{s.subheading}</p>}
            {(s.listItems ?? []).map((li, i) => (
              <div key={i} className="bm-check" style={{ color: ink }}><i style={{ background: mix(accent, 14), color: accent }}>✓</i><span>{li}</span></div>
            ))}
            {s.buttonText && <div style={{ marginTop: 26 }}><Btn text={s.buttonText} bg={btn} color={s.buttonTextColor ?? readableOn(btn)} arrow /></div>}
          </div>
          <div className="bm-visual" style={s.imageUrl
            ? { background: `url(${s.imageUrl}) center / cover` }
            : { background: `radial-gradient(80% 70% at 15% 10%, ${mix(accent, 75)}, transparent 62%), radial-gradient(70% 70% at 95% 95%, ${mix(accent, 45, '#ffffff')}, transparent 60%), linear-gradient(135deg, ${mix(accent, 28, '#ffffff')}, ${mix(accent, 10, '#ffffff')})` }}>
            {/* A picture slot until there is a picture: shapes only, nothing that reads as data. */}
            {!s.imageUrl && (
              <div className="bm-visual-ui" aria-hidden>
                <i style={{ width: '38%', background: accent }} /><i style={{ width: '86%' }} /><i style={{ width: '72%' }} /><i style={{ width: '58%' }} />
              </div>
            )}
          </div>
        </div>,
      );
    }
    case 'stats': return sec(<>
      {head}
      <div className="bm-stats">
        {(s.statItems ?? []).map((st, i) => (
          <div key={i} className="bm-stat">
            <strong style={{ backgroundImage: `linear-gradient(180deg, ${ink}, ${mix(ink, 55)})`, WebkitBackgroundClip: 'text', backgroundClip: 'text', color: 'transparent' }}>{st.value}</strong>
            <span style={{ color: mix(ink, 72) }}>{st.label}</span>
          </div>
        ))}
      </div>
    </>);
    case 'faq': return sec(<>
      {head}
      <div className="bm-faq">
        {(s.faqItems ?? []).map((f, i) => (
          <details key={i}>
            <summary style={{ color: ink }}>{f.q}<span className="bm-plus" style={{ background: mix(accent, 12), color: accent }} aria-hidden>+</span></summary>
            <div style={{ color: mix(ink, 66) }}>{f.a}</div>
          </details>
        ))}
      </div>
    </>);
    case 'gallery': {
      const imgs = s.galleryImages ?? [];
      const cols = Math.min(Math.max(s.columns ?? 3, 2), 4);
      return sec(<>
        {head}
        <div className="bm-bento" data-bento={imgs.length >= 5 && cols >= 3 ? '' : undefined} style={cssVars({ '--bm-cols': cols })}>
          {imgs.map((c, i) => <div key={i} style={{ background: c.startsWith('#') ? `linear-gradient(140deg, ${c}, ${mix(c, 55, '#ffffff')})` : `url(${c}) center / cover` }} />)}
        </div>
      </>);
    }
    case 'footer': {
      const cols = s.footerColumns ?? [];
      const name = s.navLogo ?? 'MySite';
      const muted = s.textColor ?? '#94a3b8';
      return (
        <footer className="bm bm-foot" data-dark="" style={{ ...bg, color: muted }}>
          <div className="bm-in" style={padY(pad)}>
            <div className="bm-foot-top" style={cssVars({ '--bm-cols': Math.max(cols.length, 1) })}>
              <div className="bm-foot-brand">
                <strong style={{ color: '#ffffff' }}>{name}</strong>
                {s.subheading && <p>{s.subheading}</p>}
              </div>
              {cols.map((col, i) => (
                <div key={i}>
                  <h4 style={{ color: '#ffffff' }}>{col.heading}</h4>
                  {col.links.map((l, j) => <a key={j} href={l.url} style={{ color: muted }}>{l.label}</a>)}
                </div>
              ))}
            </div>
            {s.footerCopyright && <div className="bm-foot-bar"><span>{s.footerCopyright}</span></div>}
            {/* Sized by the name's length so the whole name fits the width. */}
            <div className="bm-wordmark" aria-hidden style={{ fontSize: `clamp(40px, ${Math.min(15, 160 / Math.max(name.length, 4)).toFixed(2)}cqi, 210px)` }}>{name}</div>
          </div>
        </footer>
      );
    }
    default: return undefined;
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
    /* data-noinvert: a picture of the customer's page is shown in its own colours,
       not turned into a negative by the app's dark mode (index.css). */
    <div ref={ref} className={hoverScroll ? 'tpl-preview' : undefined} data-noinvert
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
