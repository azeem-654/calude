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
import { Check, Sparkles, ChevronDown, Filter, LayoutTemplate, Ban } from 'lucide-react';
import { TEMPLATE_CATALOG, buildTemplatePages, type BrandContext, type TemplateMeta } from '../../shared/pageTemplates';
import { PagesStrip, ScaledPage } from '../../shared/BlockRender';

const ACCENT = '#5b46e5';
const FIRST = 6;

export default function TemplatePicker({ value, onPick, brand, prefer, hasSite = false, website = '' }: {
  value: string;
  onPick: (id: string) => void;
  brand: BrandContext;
  /** Which kind is recommended: nearly always a funnel; a website only for a business with none whose project is about being found. */
  prefer: 'website' | 'funnel';
  /** Whether the business already has a website. */
  hasSite?: boolean;
  website?: string;
}) {
  const chosen = TEMPLATE_CATALOG.find(t => t.id === value);
  const [tab, setTab] = useState<'website' | 'funnel'>(chosen?.kind ?? prefer);
  const none = value === 'none';
  const host = website.replace(/^https?:\/\//, '').replace(/\/.*$/, '');
  /* The AI's suggestion, said with its reason — a rule, not a model call:
     what the business already has decides it. */
  const why = hasSite
    ? `You already have a website${host ? ` (${host})` : ''}, so a second one is not needed. A funnel gives this business workspace one focused page to send people to — it converts better than a home page.`
    : prefer === 'funnel'
      ? 'A funnel is one focused page with one action — book, buy or enquire — which is what a campaign needs. Add a full website later if you want one.'
      : 'You have no website yet and this business workspace is about being found, so a small website comes first. A funnel can be added for campaigns later.';
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

  const kinds: { k: 'funnel' | 'website'; label: string; hint: string; icon: typeof Filter }[] = [
    { k: 'funnel', label: 'A funnel', hint: 'One focused page → booking or sale', icon: Filter },
    { k: 'website', label: 'A website', hint: 'Several pages about the business', icon: LayoutTemplate },
  ];
  const order = prefer === 'funnel' ? kinds : [...kinds].reverse();
  return (
    <div style={{ display: 'grid', gap: 12 }}>
      <div className="np-kind-row" role="radiogroup" aria-label="Do you want a page?">
        {order.map(({ k, label, hint, icon: Icon }) => {
          const on = !none && value !== 'ai' ? tab === k : false;
          return (
            <button key={k} type="button" role="radio" aria-checked={on} className={`np-kind${prefer === k ? ' np-kind-rec' : ''}`} data-on={on ? '1' : undefined}
              onClick={() => { setTab(k); setAll(false); if (none || value === 'ai' || (chosen && chosen.kind !== k)) onPick(''); }}>
              {prefer === k && <span className="np-hero-badge"><Sparkles size={11} /> Recommended</span>}
              <span style={{ display: 'inline-flex', gap: 7, alignItems: 'center', fontSize: 14.5, fontWeight: 750, color: '#17191c' }}><Icon size={16} /> {label}</span>
              <small>{hint}</small>
            </button>
          );
        })}
        <button type="button" role="radio" aria-checked={none} data-on={none ? '1' : undefined} className="np-kind" onClick={() => onPick('none')}>
          <span style={{ display: 'inline-flex', gap: 7, alignItems: 'center', fontSize: 14.5, fontWeight: 750, color: '#17191c' }}><Ban size={16} /> No page</span>
          <small>I don’t need a website or funnel</small>
        </button>
      </div>
      <p className="np-kind-why"><Sparkles size={13} /> <span><b>AI suggestion:</b> {why}</span></p>

      {none ? (
        <span style={{ fontSize: 13, color: '#475569' }}>No page will be built. The business workspace’s emails and posts link to {host || 'your own website'} instead{host ? '' : ', if you have one'}.</span>
      ) : (<>
      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', alignItems: 'center' }}>
        <span style={{ fontSize: 13, fontWeight: 700, color: '#17191c' }}>Pick a design to start from{tab === 'funnel' ? ' — funnels' : ' — websites'}</span>
        <span style={{ flex: 1 }} />
        <button type="button" className="np-opt" data-ai="1" aria-pressed={value === 'ai'} onClick={() => onPick('ai')}>
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}><Sparkles size={13} /> Let AI design it</span>
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
        Hover a preview to scroll through the page. These show your name, colour and background photo; the wording is a starting point, not the final copy.
      </span>
      </>)}
    </div>
  );
}
