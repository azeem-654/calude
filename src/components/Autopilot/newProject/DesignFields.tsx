/**
 * The design questions, drawn as what they choose.
 *
 * Nobody picks a layout from its name. Each option is a small picture of the
 * thing it makes, in the colours already chosen and with the logo already
 * found, so the screen answers "what will mine look like" before the build
 * does. The pictures are a sketch of the same arrangement the server draws
 * (worker/src/lib/designLayouts.ts) — same positions, same colours — not a
 * mock-up of something it cannot make.
 */
import { useRef, type CSSProperties, type ReactNode } from 'react';
import { Check, Globe, Loader, Sparkles, Upload, Type, AlertTriangle } from 'lucide-react';
import {
  FONT_FAMILY, LAYOUTS, THEMES, resolveTheme, type DesignKind, type LogoChoice, type Palette,
} from '../../../services/designOptions';

const ACCENT = '#5b46e5';

/* What each face falls back to where it is not installed, so a sans theme is
   never previewed in Times. */
const FALLBACK = { sans: 'system-ui, sans-serif', serif: '"Times New Roman", serif', display: '"Arial Narrow", "Helvetica Neue Condensed", sans-serif-condensed, sans-serif' } as const;

function AiButton({ on, onClick, label = 'Let AI decide' }: { on: boolean; onClick: () => void; label?: string }) {
  return (
    <button type="button" className="np-opt" data-ai="1" aria-pressed={on} onClick={onClick}>
      <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}><Sparkles size={13} /> {label}</span>
    </button>
  );
}

function Card({ on, onClick, label, hint, children, ai }: {
  on: boolean; onClick: () => void; label: string; hint?: string; children: ReactNode; ai?: boolean;
}) {
  return (
    <button type="button" className="np-design" aria-pressed={on} onClick={onClick} title={hint}>
      <span className="np-design-pic">{children}</span>
      <span style={{ display: 'flex', alignItems: 'center', gap: 6, minWidth: 0 }}>
        <span style={{ fontSize: 13, fontWeight: 700, color: '#17191c', lineHeight: 1.3 }}>{label}{ai && on ? ' ✦' : ''}</span>
        {on && <Check size={14} color={ACCENT} style={{ marginLeft: 'auto', flexShrink: 0 }} />}
      </span>
      {hint && <span style={{ fontSize: 11.5, color: '#6b7280', lineHeight: 1.4, textAlign: 'left' }}>{hint}</span>}
    </button>
  );
}

/* ── Pictures ─────────────────────────────────────────────────────────────── */

const abs = (x: number, y: number, w: number, h: number, extra: CSSProperties = {}): CSSProperties => ({
  position: 'absolute', left: `${x}%`, top: `${y}%`, width: `${w}%`, height: `${h}%`, ...extra,
});

/** Lines standing for words: the headline is the thick ones. */
function Lines({ n, color, h = 7, gap = 4, widths = [92, 78, 60], center = false }: { n: number; color: string; h?: number; gap?: number; widths?: number[]; center?: boolean }) {
  return (
    <span style={{ display: 'grid', gap, width: '100%' }}>
      {Array.from({ length: n }, (_, i) => (
        <span key={i} style={{ display: 'block', height: h, width: `${widths[i % widths.length]}%`, borderRadius: 3, background: color, margin: center ? '0 auto' : undefined }} />
      ))}
    </span>
  );
}

function Mark({ logo, color, size = 16 }: { logo: string; color: string; size?: number }) {
  return logo
    ? <img src={logo} alt="" style={{ width: size, height: size, objectFit: 'contain', display: 'block' }} />
    : <span style={{ display: 'block', width: size * 1.6, height: size * 0.34, borderRadius: 2, background: color, opacity: 0.85 }} />;
}

function SocialPic({ layout, p, logo }: { layout: string; p: Palette; logo: string }) {
  const grad = `linear-gradient(135deg, ${p.bg}, ${p.bg2})`;
  const box: CSSProperties = { display: 'block', position: 'relative', width: '100%', aspectRatio: '1 / 1', borderRadius: 8, overflow: 'hidden', background: grad };
  const ink = p.ink;
  if (layout === 'offer') return (
    <span style={box}>
      <span style={abs(8, 12, 54, 30)}><Lines n={3} color={ink} h={8} /></span>
      <span style={abs(60, 42, 32, 32, { borderRadius: '50%', background: p.accent, display: 'grid', placeItems: 'center', font: `900 11px ${p.font === 'serif' ? 'Georgia' : 'Inter'}`, color: p.bg })}>%</span>
      <span style={abs(8, 72, 36, 10, { borderRadius: 5, background: p.accent })} />
      <span style={abs(80, 7, 13, 13)}><Mark logo={logo} color={ink} size={18} /></span>
    </span>
  );
  if (layout === 'split') return (
    <span style={{ ...box, background: p.bg2 }}>
      <span style={abs(0, 0, 56, 100, { background: p.bg })} />
      <span style={abs(7, 22, 44, 50)}><Lines n={4} color={ink} h={7} /></span>
      <span style={abs(63, 38, 30, 24, { display: 'grid', placeItems: 'center' })}><Mark logo={logo} color={ink} size={26} /></span>
    </span>
  );
  if (layout === 'diagonal') return (
    <span style={{ ...box, background: p.bg }}>
      <span style={abs(-20, 60, 140, 15, { background: p.accent, transform: 'rotate(-14deg)' })} />
      <span style={abs(-20, 79, 140, 9, { background: p.bg2, transform: 'rotate(-14deg)' })} />
      <span style={abs(8, 14, 84, 40)}><Lines n={3} color={ink} h={10} widths={[95, 88, 70]} /></span>
      <span style={abs(80, 5, 13, 13)}><Mark logo={logo} color={ink} size={16} /></span>
    </span>
  );
  if (layout === 'minimal') return (
    <span style={{ ...box, background: p.bg }}>
      <span style={abs(30, 12, 40, 4, { background: ink, opacity: 0.5, borderRadius: 2 })} />
      <span style={abs(14, 32, 72, 34)}><Lines n={2} color={ink} h={5} widths={[90, 70]} center /></span>
      <span style={abs(42, 70, 16, 1.5, { background: p.accent })} />
      <span style={abs(42, 78, 16, 16, { display: 'grid', placeItems: 'center' })}><Mark logo={logo} color={ink} size={14} /></span>
    </span>
  );
  if (layout === 'quote') return (
    <span style={box}>
      <span style={abs(7, -4, 40, 40, { font: '900 44px Georgia', color: p.accent, lineHeight: 1 })}>“</span>
      <span style={abs(8, 32, 84, 36)}><Lines n={3} color={ink} h={6} /></span>
      <span style={abs(8, 80, 10, 2, { background: p.accent })} />
      <span style={abs(80, 80, 13, 13)}><Mark logo={logo} color={ink} size={14} /></span>
    </span>
  );
  if (layout === 'framed') return (
    <span style={box}>
      <span style={abs(6, 6, 88, 88, { border: `2px solid ${p.accent}`, borderRadius: 3, boxSizing: 'border-box' })} />
      <span style={abs(43, 14, 14, 14, { display: 'grid', placeItems: 'center' })}><Mark logo={logo} color={ink} size={14} /></span>
      <span style={abs(16, 36, 68, 34)}><Lines n={3} color={ink} h={6} widths={[90, 75, 55]} center /></span>
    </span>
  );
  return (
    <span style={box}>
      <span style={abs(8, 10, 22, 4, { background: p.accent, borderRadius: 3 })} />
      <span style={abs(8, 24, 84, 40)}><Lines n={3} color={ink} h={10} /></span>
      <span style={abs(8, 80, 36, 5, { background: p.accent, borderRadius: 2 })} />
      <span style={abs(80, 78, 13, 13)}><Mark logo={logo} color={ink} size={16} /></span>
    </span>
  );
}

function PagePic({ layout, p, logo }: { layout: string; p: Palette; logo: string }) {
  const hero = (h: number) => (
    <span style={{ display: 'grid', gap: 3, padding: '7px 8px', height: h, boxSizing: 'border-box', background: `linear-gradient(135deg, ${p.bg}, ${p.bg2})`, alignContent: 'center' }}>
      <Lines n={2} color={p.ink} h={5} widths={[80, 55]} center />
      <span style={{ display: 'block', width: 26, height: 7, borderRadius: 3, background: p.accent, margin: '0 auto' }} />
    </span>
  );
  const form = <span style={{ display: 'grid', gap: 3, padding: '6px 14px', background: '#fff' }}>{[0, 1].map(i => <span key={i} style={{ height: 6, borderRadius: 2, border: '1px solid #d7dbe3' }} />)}<span style={{ height: 7, width: '40%', borderRadius: 2, background: p.accent }} /></span>;
  const features = <span style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 4, padding: '6px 8px', background: '#f7f8fa' }}>{[0, 1, 2].map(i => <span key={i} style={{ height: 14, borderRadius: 3, background: '#fff', borderTop: `2px solid ${p.accent}` }} />)}</span>;
  const text = <span style={{ padding: '6px 8px', background: '#fff' }}><Lines n={3} color="#d7dbe3" h={3} gap={3} /></span>;
  const nav = <span style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '4px 8px', background: '#fff', borderBottom: '1px solid #eef0f3' }}><Mark logo={logo} color="#17191c" size={10} /><span style={{ width: 16, height: 5, borderRadius: 2, background: p.accent }} /></span>;
  const parts = layout === 'hero-form' ? [nav, hero(44), form, features]
    : layout === 'long-sales' ? [nav, hero(36), text, text, features, form]
      : layout === 'minimal' ? [nav, hero(60), form]
        : [nav, hero(40), features, text, form];
  return (
    <span style={{ display: 'flex', flexDirection: 'column', width: '100%', aspectRatio: '1 / 1', borderRadius: 8, overflow: 'hidden', border: '1px solid #e6e9f0', background: '#fff' }}>
      {parts.map((x, i) => <span key={i} style={{ display: 'block', flexShrink: 0 }}>{x}</span>)}
    </span>
  );
}

function EmailPic({ layout, p, logo }: { layout: string; p: Palette; logo: string }) {
  const body = <span style={{ display: 'block', padding: '8px 10px' }}><Lines n={4} color="#d7dbe3" h={3} gap={4} widths={[92, 86, 90, 50]} /></span>;
  const btn = <span style={{ display: 'block', margin: '2px 10px 8px', width: 34, height: 8, borderRadius: 3, background: p.accent }} />;
  const head = layout === 'branded'
    ? <span style={{ display: 'block', padding: '7px 10px', borderBottom: `2px solid ${p.accent}` }}><Mark logo={logo} color="#17191c" size={14} /></span>
    : layout === 'newsletter'
      ? <span style={{ display: 'block', padding: '8px 10px', background: p.bg }}><Mark logo={logo} color={p.ink} size={14} /></span>
      : layout === 'promo'
        ? <span style={{ display: 'grid', gap: 4, padding: '12px 10px', background: `linear-gradient(135deg, ${p.bg}, ${p.bg2})` }}><Mark logo={logo} color={p.ink} size={14} /><Lines n={1} color={p.ink} h={7} widths={[70]} /></span>
        : null;
  return (
    <span style={{ display: 'block', width: '100%', aspectRatio: '1 / 1', borderRadius: 8, overflow: 'hidden', border: '1px solid #e6e9f0', background: layout === 'plain' ? '#fff' : '#f4f5f7', padding: layout === 'plain' ? 0 : 6, boxSizing: 'border-box' }}>
      <span style={{ display: 'block', background: '#fff', borderRadius: 4, overflow: 'hidden', height: '100%' }}>
        {layout === 'plain'
          ? <span style={{ display: 'block', padding: '10px' }}><span style={{ display: 'block', font: '600 9px Inter', color: '#6b7280', marginBottom: 6 }}>Hi Sam,</span><Lines n={6} color="#d7dbe3" h={3} gap={5} widths={[92, 88, 95, 60, 90, 40]} /></span>
          : <>{head}{body}{btn}</>}
      </span>
    </span>
  );
}

function BlogPic({ layout }: { layout: string }) {
  const h = (w: number) => <span style={{ display: 'block', height: 5, width: `${w}%`, borderRadius: 2, background: '#17191c' }} />;
  const txt = <Lines n={2} color="#d7dbe3" h={3} gap={3} widths={[92, 70]} />;
  const numbered = (n: number, label: (i: number) => string) => Array.from({ length: n }, (_, i) => (
    <span key={i} style={{ display: 'grid', gridTemplateColumns: '12px 1fr', gap: 4, alignItems: 'start' }}>
      <span style={{ font: '800 8px Inter', color: ACCENT }}>{label(i)}</span>
      <span style={{ display: 'grid', gap: 3 }}>{h(60)}{txt}</span>
    </span>
  ));
  const inner = layout === 'listicle' ? numbered(3, i => String(i + 1))
    : layout === 'qa' ? numbered(3, () => 'Q')
      : layout === 'story' ? [<span key="a" style={{ display: 'grid', gap: 3 }}><span style={{ font: '800 7px Inter', color: ACCENT }}>BEFORE</span>{txt}</span>, <span key="b" style={{ display: 'grid', gap: 3 }}><span style={{ font: '800 7px Inter', color: ACCENT }}>WHAT WE DID</span>{txt}</span>, <span key="c" style={{ display: 'grid', gap: 3 }}><span style={{ font: '800 7px Inter', color: ACCENT }}>RESULT</span>{txt}</span>]
        : layout === 'news' ? [<span key="n" style={{ font: '800 7px Inter', color: '#dc2626' }}>NEWS</span>, h(90), txt, txt, <span key="q" style={{ borderLeft: `2px solid ${ACCENT}`, paddingLeft: 5 }}>{txt}</span>]
          : numbered(3, i => `${i + 1}.`);
  return (
    <span style={{ display: 'grid', gap: 6, alignContent: 'start', width: '100%', aspectRatio: '1 / 1', borderRadius: 8, border: '1px solid #e6e9f0', background: '#fff', padding: 10, boxSizing: 'border-box', overflow: 'hidden' }}>
      {h(85)}{inner}
    </span>
  );
}

export function LayoutPic({ kind, layout, palette, logo }: { kind: DesignKind; layout: string; palette: Palette; logo: string }) {
  if (kind === 'social') return <SocialPic layout={layout} p={palette} logo={logo} />;
  if (kind === 'page') return <PagePic layout={layout} p={palette} logo={logo} />;
  if (kind === 'email') return <EmailPic layout={layout} p={palette} logo={logo} />;
  return <BlogPic layout={layout} />;
}

/* ── The fields ───────────────────────────────────────────────────────────── */

export function LayoutField({ kind, value, byAi, aiValue, onPick, onAi, palette, logo }: {
  kind: DesignKind; value: string; byAi: boolean; aiValue: string;
  onPick: (v: string) => void; onAi: () => void; palette: Palette; logo: string;
}) {
  return (
    <>
      <div className="np-design-grid">
        {LAYOUTS[kind].map(l => (
          <Card key={l.value} on={value === l.value} ai={byAi} onClick={() => onPick(l.value)} label={l.label} hint={l.hint}>
            <LayoutPic kind={kind} layout={l.value} palette={palette} logo={logo} />
          </Card>
        ))}
      </div>
      <div className="np-opts">
        <AiButton on={byAi} onClick={onAi} label={`Let AI decide${aiValue ? ` — ${LAYOUTS[kind].find(l => l.value === aiValue)?.label ?? ''}` : ''}`} />
      </div>
    </>
  );
}

export function ThemeField({ value, byAi, onPick, onAi, brandColor, words }: {
  value: string; byAi: boolean; onPick: (v: string) => void; onAi: () => void; brandColor: string; words: string;
}) {
  return (
    <>
      <div className="np-design-grid" data-size="small">
        {THEMES.map(t => {
          const p = resolveTheme(t.value, brandColor, words);
          return (
            <Card key={t.value} on={value === t.value} ai={byAi} onClick={() => onPick(t.value)} label={t.label} hint={t.hint}>
              <span style={{ display: 'grid', placeItems: 'center', width: '100%', aspectRatio: '16 / 10', borderRadius: 8, background: `linear-gradient(135deg, ${p.bg}, ${p.bg2})`, position: 'relative' }}>
                <span style={{ font: `${p.font === 'display' ? 400 : 800} 22px ${FONT_FAMILY[p.font]}, ${FALLBACK[p.font]}`, color: p.ink, letterSpacing: p.font === 'display' ? 1 : -0.5 }}>Aa</span>
                <span style={{ position: 'absolute', right: 8, bottom: 8, width: 14, height: 14, borderRadius: '50%', background: p.accent, boxShadow: '0 0 0 2px rgba(255,255,255,0.6)' }} />
              </span>
            </Card>
          );
        })}
      </div>
      <div className="np-opts"><AiButton on={byAi} onClick={onAi} label="Let AI decide — my brand colour" /></div>
    </>
  );
}

export function ColourField({ value, onChange, placeholder }: { value: string; onChange: (v: string) => void; placeholder?: string }) {
  const ok = /^#([0-9a-f]{3}|[0-9a-f]{6})$/i.test(value.trim());
  return (
    <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
      <input type="color" aria-label="Pick a colour" value={ok ? (value.length === 4 ? `#${value.slice(1).split('').map(c => c + c).join('')}` : value) : '#5b7cfa'}
        onChange={e => onChange(e.target.value)}
        style={{ width: 46, height: 42, padding: 2, border: '1px solid #e6e9f0', borderRadius: 10, background: '#fff', cursor: 'pointer', flexShrink: 0 }} />
      <input className="np-input" value={value} placeholder={placeholder} onChange={e => onChange(e.target.value)} aria-label="Colour as a hex code" />
    </div>
  );
}

export interface LogoFieldState {
  logo: LogoChoice;
  /** A website to look on — known or read. Empty hides "find it". */
  website: string;
  finding: boolean;
  error: string;
}

export function LogoField({ value, byAi, st, onFind, onFile, onNone, onAi }: {
  value: string; byAi: boolean; st: LogoFieldState;
  onFind: (url: string) => void; onFile: (f: File) => void; onNone: () => void; onAi: () => void;
}) {
  const picker = useRef<HTMLInputElement>(null);
  const urlBox = useRef<HTMLInputElement>(null);
  const have = !!st.logo.dataUrl && value !== 'none';
  return (
    <>
      <div style={{ display: 'flex', gap: 14, alignItems: 'center', flexWrap: 'wrap' }}>
        <span className="np-logo-well" data-empty={have ? undefined : '1'}>
          {st.finding ? <Loader size={18} className="spin" color={ACCENT} />
            : have ? <img src={st.logo.dataUrl} alt="Your logo" />
              : <Type size={20} color="#9aa3b2" />}
        </span>
        <span style={{ display: 'grid', gap: 3, minWidth: 0, flex: '1 1 200px' }}>
          <b style={{ fontSize: 14, color: '#17191c' }}>
            {st.finding ? 'Looking for it on your website…'
              : have ? (st.logo.from ? `Found on ${st.logo.from}` : 'Your logo')
                : value === 'none' ? 'No logo — your business name is set as a wordmark'
                  : 'No logo yet'}
          </b>
          <span style={{ fontSize: 12.5, color: '#6b7280', lineHeight: 1.45 }}>
            {have ? 'Shrunk to a crisp 320px and kept on the client’s profile, so every project for them uses it.'
              : 'A PNG or SVG with a transparent background works best.'}
          </span>
        </span>
      </div>
      {st.error && !st.finding && (
        <span style={{ display: 'flex', gap: 7, alignItems: 'flex-start', fontSize: 12.5, color: '#9a3412' }}>
          <AlertTriangle size={14} style={{ flexShrink: 0, marginTop: 2 }} /> {st.error}
        </span>
      )}
      <div className="np-opts">
        <button type="button" className="np-opt" aria-pressed={value === 'upload'} onClick={() => picker.current?.click()}>
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}><Upload size={13} /> {value === 'upload' ? 'Upload a different one' : 'Upload my logo'}</span>
          <small>PNG, SVG, JPG or WebP</small>
        </button>
        <input ref={picker} type="file" hidden accept="image/png,image/svg+xml,image/jpeg,image/webp,image/gif"
          onChange={e => { const f = e.target.files?.[0]; e.target.value = ''; if (f) onFile(f); }} />
        {st.website && (
          <button type="button" className="np-opt" aria-pressed={value === 'site'} disabled={st.finding} onClick={() => onFind(st.website)}>
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}><Globe size={13} /> {value === 'site' && have ? 'Look again on my website' : 'Take it from my website'}</span>
            <small>{st.website.replace(/^https?:\/\//, '').replace(/\/$/, '')}</small>
          </button>
        )}
        <button type="button" className="np-opt" aria-pressed={value === 'none'} onClick={onNone}>
          <span>No logo — use the name</span>
        </button>
        <AiButton on={byAi} onClick={onAi} />
      </div>
      {!st.website && (
        <input ref={urlBox} className="np-input" placeholder="…or paste your website to look there"
          onKeyDown={e => {
            if (e.key !== 'Enter') return;
            e.preventDefault();
            const u = (e.target as HTMLInputElement).value.trim();
            if (u) onFind(/^https?:\/\//.test(u) ? u : `https://${u}`);
          }} aria-label="Website to find the logo on" />
      )}
    </>
  );
}
