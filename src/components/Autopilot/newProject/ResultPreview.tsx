/**
 * "What you'll get" — a small preview of the results, before anything is built.
 *
 * Shown on the blueprint, beside the list of workflows, so the customer can
 * picture the outcome and change course while it is still cheap: three posts
 * in their colours and name, the website or funnel they picked (the real
 * template, the same renderer the builder uses), the opening of the first
 * email, and an article idea.
 *
 * Deliberately light. It draws from what the wizard already knows — no AI
 * call, nothing generated to be thrown away — and it says plainly that it is
 * a preview: the real posts and emails are written from the business profile
 * when the project runs, and every one of them can be edited.
 */
import { useMemo } from 'react';
import { Eye, Image as ImageIcon, LayoutTemplate, Mail, FileText } from 'lucide-react';
import type { Blueprint } from '../../../services/projectIntake';
import type { Palette } from '../../../services/designOptions';
import { FONT_FAMILY } from '../../../services/designOptions';
import { TEMPLATE_CATALOG, buildTemplatePages } from '../../shared/pageTemplates';
import { PagesStrip, ScaledPage } from '../../shared/BlockRender';
import { LayoutPic } from './DesignFields';

interface Brand { name: string; tagline: string; heroTitle: string }

function Post({ palette, logo, name, head, sub, variant }: { palette: Palette; logo: string; name: string; head: string; sub: string; variant: number }) {
  const font = FONT_FAMILY[palette.font] ?? 'system-ui, sans-serif';
  const bg = variant === 1 ? palette.bg2 : palette.bg;
  const bottom = variant === 2;
  return (
    <div className="np-prev-post" style={{ background: variant === 0 ? `linear-gradient(150deg, ${palette.bg}, ${palette.bg2})` : bg, color: palette.ink, fontFamily: font }}>
      <div style={{ position: 'absolute', top: 9, left: 10, right: 10, display: 'flex', alignItems: 'center', gap: 6, fontSize: 9, fontWeight: 800, opacity: 0.9 }}>
        {logo ? <img src={logo} alt="" style={{ height: 16, maxWidth: 60, objectFit: 'contain' }} /> : <span>{name}</span>}
      </div>
      <div style={{ position: 'absolute', left: 11, right: 11, ...(bottom ? { bottom: 26 } : { top: '30%' }), display: 'grid', gap: 5 }}>
        <span style={{ fontSize: 14, fontWeight: 800, lineHeight: 1.15, letterSpacing: '-0.01em', display: '-webkit-box', WebkitLineClamp: 3, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>{head}</span>
        <span style={{ fontSize: 9.5, opacity: 0.85, lineHeight: 1.35, display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>{sub}</span>
      </div>
      <span style={{ position: 'absolute', left: 11, bottom: 9, height: 4, width: 34, borderRadius: 3, background: palette.accent }} />
    </div>
  );
}

function Section({ icon: Icon, title, children }: { icon: typeof Eye; title: string; children: React.ReactNode }) {
  return (
    <div style={{ display: 'grid', gap: 8 }}>
      <span style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, fontWeight: 800, color: '#475569', letterSpacing: '0.04em', textTransform: 'uppercase' }}>
        <Icon size={13} /> {title}
      </span>
      {children}
    </div>
  );
}

export default function ResultPreview({ bp, brand, palette, logo, templateId, pageLayout, audience }: {
  bp: Blueprint;
  brand: Brand;
  palette: Palette;
  logo: string;
  templateId: string;
  pageLayout: string;
  audience: string;
}) {
  const name = brand.name || 'Your business';
  const nodes = bp.workflows.flatMap(w => w.nodes ?? []);
  const social = nodes.some(n => n.type === 'ai' && String(n.config?.produces ?? '') === 'social');
  const blog = nodes.some(n => n.type === 'ai' && String(n.config?.produces ?? '') === 'blog');
  const firstEmail = nodes.find(n => n.type === 'send_email');
  const template = TEMPLATE_CATALOG.find(t => t.id === templateId);
  const page = !!template || templateId === 'ai';
  const pages = useMemo(
    () => (template ? buildTemplatePages(template, { name, color: palette.accent, tagline: brand.tagline, heroTitle: brand.heroTitle }, { brand: true }) : []),
    [template, name, palette.accent, brand.tagline, brand.heroTitle],
  );
  if (!social && !blog && !firstEmail && !page) return null;

  const who = audience || 'you';
  const heads = [
    brand.heroTitle || `What ${name} can do for ${who}`,
    `Why ${audience ? audience.toLowerCase() : 'people'} choose ${name}`,
    `One tip from ${name} this week`,
  ];

  return (
    <section className="np-bp-box" aria-label="Preview of the results" style={{ display: 'grid', gap: 16 }}>
      <div style={{ display: 'flex', gap: 10, alignItems: 'flex-start' }}>
        <span style={{ width: 32, height: 32, borderRadius: 10, background: '#f1efff', display: 'grid', placeItems: 'center', flexShrink: 0 }}><Eye size={16} color="#5b46e5" /></span>
        <div>
          <b style={{ display: 'block', fontSize: 15, color: '#17191c' }}>What it might look like</b>
          <span style={{ fontSize: 12.5, color: '#6b7280', lineHeight: 1.5 }}>
            A preview, not the final copy — the real posts, pages and emails are written from your business profile when the project runs, and every one can be edited. Go back a step to change the colours, layout or template.
          </span>
        </div>
      </div>

      {social && (
        <Section icon={ImageIcon} title="Social posts">
          <div className="np-prev-grid">
            {heads.map((h, i) => (
              <Post key={h} palette={palette} logo={logo} name={name} head={h} sub={brand.tagline || name} variant={i} />
            ))}
          </div>
        </Section>
      )}

      {page && (
        <Section icon={LayoutTemplate} title={template ? `${template.kind === 'funnel' ? 'Funnel' : 'Website'} — ${template.name}` : 'Your page'}>
          {template ? (
            <div style={{ borderRadius: 12, overflow: 'hidden', border: '1px solid #e6e9f0' }}>
              {template.kind === 'funnel' && pages.length > 1 ? <PagesStrip pages={pages} height={190} max={4} /> : <ScaledPage page={pages[0]} height={210} renderWidth={1100} />}
            </div>
          ) : (
            <div style={{ maxWidth: 260 }}>
              <LayoutPic kind="page" layout={pageLayout} palette={palette} logo={logo} />
              <span style={{ display: 'block', marginTop: 6, fontSize: 12, color: '#6b7280' }}>Autopilot writes the page in this layout, from your profile.</span>
            </div>
          )}
        </Section>
      )}

      {firstEmail && (
        <Section icon={Mail} title="The first email">
          <div style={{ borderRadius: 12, border: '1px solid #e6e9f0', background: '#fff', overflow: 'hidden' }}>
            <div style={{ padding: '8px 12px', borderBottom: '1px solid #eef0f4', fontSize: 12, color: '#6b7280' }}>
              From <b style={{ color: '#17191c' }}>{name}</b> · to one of your contacts
            </div>
            <div style={{ padding: '10px 12px', fontSize: 13, color: '#334155', lineHeight: 1.6 }}>
              Hello Alex,<br /><br />
              I’m writing from {name}{brand.tagline ? <> — {brand.tagline.charAt(0).toLowerCase()}{brand.tagline.slice(1)}</> : ''}.
              <span style={{ color: '#94a3b8' }}> … the rest is written for “{firstEmail.label}” when the project is built.</span>
            </div>
          </div>
        </Section>
      )}

      {blog && (
        <Section icon={FileText} title="An article idea">
          <div style={{ borderRadius: 12, border: '1px solid #e6e9f0', padding: '10px 12px', background: '#fff' }}>
            <b style={{ display: 'block', fontSize: 14, color: '#17191c', lineHeight: 1.35 }}>
              {audience ? `What ${audience.toLowerCase()} should know before choosing a ${brand.tagline ? 'provider' : 'business like ours'}` : `How ${name} works, and what to expect`}
            </b>
            <span style={{ fontSize: 12, color: '#6b7280' }}>Titles come from your topics and what your buyers search for.</span>
          </div>
        </Section>
      )}
    </section>
  );
}
