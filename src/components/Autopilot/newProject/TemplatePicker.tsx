/**
 * "Pick the website or funnel to start from" — the real templates, in the
 * client's own name and colours.
 *
 * The same catalogue the Websites and Funnels screens build from
 * (shared/pageTemplates.ts), rendered by the same renderer, so what is picked
 * here is what gets built — not a sketch of it. A funnel is shown as its steps
 * side by side, because a funnel is judged by its flow; a website by its home
 * page. Nothing is built until the wizard's last step, and what is built is a
 * draft that can be changed block by block.
 *
 * Rendering a real page is not free, so a tab shows its most-used templates
 * first and the rest on request, and each preview is built once.
 */
import { useMemo, useState } from 'react';
import { Check, Sparkles, ChevronDown } from 'lucide-react';
import { TEMPLATE_CATALOG, buildTemplatePages, type BrandContext, type TemplateMeta } from '../../shared/pageTemplates';
import { PagesStrip, ScaledPage } from '../../shared/BlockRender';

const ACCENT = '#5b46e5';
const FIRST = 6;

export default function TemplatePicker({ value, onPick, brand, prefer }: {
  value: string;
  onPick: (id: string) => void;
  brand: BrandContext;
  /** Which tab opens first: a shop starts on funnels, a services firm on websites. */
  prefer: 'website' | 'funnel';
}) {
  const chosen = TEMPLATE_CATALOG.find(t => t.id === value);
  const [tab, setTab] = useState<'website' | 'funnel'>(chosen?.kind ?? prefer);
  const [all, setAll] = useState(false);
  const list = useMemo(() => TEMPLATE_CATALOG
    .filter(t => t.kind === tab && t.category !== 'Thank You Pages')
    .sort((a, b) => b.popularity - a.popularity), [tab]);
  const shown = all ? list : list.slice(0, FIRST);
  /* Built once per template and brand, not on every render. */
  const pages = useMemo(() => {
    const m = new Map<string, ReturnType<typeof buildTemplatePages>>();
    return (t: TemplateMeta) => {
      if (!m.has(t.id)) m.set(t.id, buildTemplatePages(t, brand, { brand: true }));
      return m.get(t.id)!;
    };
  }, [brand]);

  return (
    <div style={{ display: 'grid', gap: 12 }}>
      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', alignItems: 'center' }} role="tablist" aria-label="Kind of template">
        {(['website', 'funnel'] as const).map(k => (
          <button key={k} type="button" role="tab" className="np-opt np-tab" aria-selected={tab === k} onClick={() => { setTab(k); setAll(false); }}>
            {k === 'website' ? 'Websites' : 'Funnels'}{prefer === k ? ' · suggested' : ''}
          </button>
        ))}
        <button type="button" className="np-opt" data-ai="1" aria-pressed={value === 'ai'} onClick={() => onPick('ai')}>
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}><Sparkles size={13} /> Let Autopilot design it</span>
        </button>
      </div>

      <div className="np-tpl-grid">
        {shown.map(t => {
          const on = value === t.id;
          const ps = pages(t);
          return (
            <button key={t.id} type="button" className="np-tpl" aria-pressed={on} onClick={() => onPick(t.id)}
              aria-label={`${t.name} — ${t.kind === 'funnel' ? `${ps.length}-step funnel` : `${ps.length}-page website`}`}>
              <span className="np-tpl-pic" aria-hidden>
                {t.kind === 'funnel' && ps.length > 1
                  ? <PagesStrip pages={ps} height={150} max={4} />
                  : <ScaledPage page={ps[0]} height={150} renderWidth={1100} />}
              </span>
              <span style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '9px 11px 0' }}>
                <b style={{ fontSize: 13.5, color: '#17191c' }}>{t.name}</b>
                {on && <Check size={15} color={ACCENT} style={{ marginLeft: 'auto', flexShrink: 0 }} />}
              </span>
              <span style={{ display: 'block', padding: '2px 11px 11px', fontSize: 11.5, color: '#6b7280', lineHeight: 1.45, textAlign: 'left' }}>
                {t.kind === 'funnel' ? ps.map(p => p.name).join(' → ') : `${ps.length} pages · ${t.industry}`}
              </span>
            </button>
          );
        })}
      </div>

      {list.length > FIRST && (
        <button type="button" className="np-skip" onClick={() => setAll(a => !a)} style={{ justifySelf: 'start', display: 'inline-flex', alignItems: 'center', gap: 5 }}>
          <ChevronDown size={14} style={{ transform: all ? 'rotate(180deg)' : undefined }} />
          {all ? 'Show fewer' : `Show all ${list.length} ${tab === 'website' ? 'websites' : 'funnels'}`}
        </button>
      )}

      <span style={{ fontSize: 12, color: '#6b7280' }}>
        Hover a preview to scroll through the page. These show your name and colour; the wording is a starting point, not the final copy.
      </span>
    </div>
  );
}
