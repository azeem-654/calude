/**
 * The template gallery — every card is the template itself, drawn with the
 * customer's own name, colours and logo, so what they pick is what they get.
 *
 * Filters are the ways people look: what the post is for (category), where it
 * goes (format), the kind of business, the look, and the goal. The customer's
 * industry sorts the matching templates first; it never hides the others —
 * an agency designs for every kind of client.
 */
import { useEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import { Check, Eye, Loader, Search, Sparkles, X, Wand2 } from 'lucide-react';
import {
  CATEGORIES, FORMATS, INDUSTRIES, OBJECTIVES, STYLES, formatOf,
  type CategoryId, type DesignContent, type FormatId, type IndustryId, type ObjectiveId, type StyleId, type TemplateSpec,
} from '../../../../worker/src/lib/design/spec';
import { TEMPLATES } from '../../../../worker/src/lib/design/templates';
import { industryId, newDoc, type Business } from '../../../../worker/src/lib/design/content';
import DesignCanvas from './DesignCanvas';
import { loadBusinesses, profileGaps } from './business';
import { writeCopy } from './aiCopy';
import { newPost } from './post';
import type { DesignPost } from '../types';
import './design.css';

const STYLE_LABEL = Object.fromEntries(STYLES.map(s => [s.id, s.label])) as Record<StyleId, string>;

/* The facts a template can use, asked for only when it has a place for them. */
const FACT_FIELDS: { key: keyof DesignContent; label: string; ph: string; slots: string[] }[] = [
  { key: 'offer', label: 'Offer', ph: 'e.g. 15% off this week — only if it is real', slots: ['offer'] },
  { key: 'price', label: 'Price', ph: 'e.g. $129', slots: ['price'] },
  { key: 'date', label: 'Date', ph: 'e.g. Sat 14 Nov', slots: ['date'] },
  { key: 'time', label: 'Time', ph: 'e.g. 10am–2pm', slots: ['time'] },
  { key: 'location', label: 'Place', ph: 'e.g. 12 Main St, Austin', slots: ['location'] },
  { key: 'address', label: 'Address', ph: 'The property’s address', slots: ['address'] },
  { key: 'beds', label: 'Bedrooms', ph: 'e.g. 4 beds', slots: ['beds'] },
  { key: 'baths', label: 'Bathrooms', ph: 'e.g. 2.5 baths', slots: ['baths'] },
  { key: 'area', label: 'Size', ph: 'e.g. 2,150 sq ft', slots: ['area'] },
  { key: 'occasion', label: 'Occasion', ph: 'e.g. Happy Thanksgiving', slots: ['occasion'] },
  { key: 'quote', label: 'The review, word for word', ph: 'Paste a real customer review', slots: ['quote'] },
  { key: 'author', label: 'Who said it', ph: 'e.g. Maria G., Austin', slots: ['author'] },
  { key: 'rating', label: 'Their star rating (1–5)', ph: 'e.g. 5', slots: ['rating'] },
  { key: 'handle', label: 'Your handle', ph: '@yourname', slots: ['handle'] },
];

const slotsOf = (t: TemplateSpec) => new Set((t.pages ? [...t.pages.cover.layers, ...t.pages.slide.layers, ...t.pages.end.layers] : t.layers).flatMap(l => ('slot' in l && l.slot ? [l.slot as string] : [])));

export default function TemplateGallery({ onCreate, compact = false }: { onCreate: (post: DesignPost) => void; compact?: boolean }) {
  const [businesses, setBusinesses] = useState<Business[] | null>(null);
  const [bizIdx, setBizIdx] = useState(0);
  const [cat, setCat] = useState<CategoryId | 'all'>('all');
  const [format, setFormat] = useState<FormatId | 'any'>('any');
  const [industry, setIndustry] = useState<IndustryId | 'auto'>('auto');
  const [style, setStyle] = useState<StyleId | 'all'>('all');
  const [goal, setGoal] = useState<ObjectiveId | 'all'>('all');
  const [q, setQ] = useState('');
  const [peek, setPeek] = useState<TemplateSpec | null>(null);
  const [using, setUsing] = useState<{ t: TemplateSpec; format: FormatId } | null>(null);

  useEffect(() => { void loadBusinesses().then(setBusinesses); }, []);
  const biz = businesses?.[bizIdx] ?? null;
  const bizIndustry = (biz ? industryId(`${biz.industry} ${biz.description}`) : 'any') as IndustryId;
  const ind: IndustryId = industry === 'auto' ? bizIndustry : industry;

  const list = useMemo(() => {
    const words = q.toLowerCase().split(/\s+/).filter(Boolean);
    const rows = TEMPLATES.filter(t =>
      (cat === 'all' || t.categories.includes(cat)) &&
      (format === 'any' || t.formats.includes(format)) &&
      (style === 'all' || t.style === style) &&
      (goal === 'all' || t.objectives.includes(goal)) &&
      (industry === 'auto' || industry === 'any' || t.industries.includes(industry) || t.industries.includes('any')) &&
      words.every(w => `${t.name} ${t.description} ${t.categories.join(' ')} ${t.style}`.toLowerCase().includes(w)),
    );
    /* Their own kind of business first, then templates for any business. */
    const score = (t: TemplateSpec) => (t.industries.includes(ind) && ind !== 'any' ? 2 : 0) + (t.industries.includes('any') ? 1 : 0);
    return rows.sort((a, b) => score(b) - score(a));
  }, [cat, format, style, goal, industry, ind, q]);

  const docFor = (t: TemplateSpec, f?: FormatId) => newDoc(t, biz ?? { name: '', industry: '', description: '', services: [], website: '', phone: '', email: '', address: '', logo: '', colors: { primary: '#3e63dd' } }, { format: f ?? (format !== 'any' ? format : t.formats[0]) });
  const cardW = compact ? 220 : 260;
  const gaps = biz ? profileGaps(biz) : [];

  return (
    <section className="dz-gallery" data-testid="template-gallery" aria-label="Template gallery">
      <div className="dz-gal-head">
        <div>
          <h2 className="dz-h2"><Sparkles size={18} /> Start from a template</h2>
          <p className="dz-sub">Each card is drawn with {biz?.name ? <b>{biz.name}</b> : 'your business'}’s own name and colours. Pick one — the words are written for you and everything stays editable.</p>
        </div>
        {businesses && businesses.length > 1 && (
          <label className="dz-field dz-biz">
            <span>Designing for</span>
            <select value={bizIdx} onChange={e => setBizIdx(Number(e.target.value))} data-field="design.business">
              {businesses.map((b, i) => <option key={i} value={i}>{b.name || 'Unnamed business'}</option>)}
            </select>
          </label>
        )}
      </div>
      {biz && gaps.length > 0 && gaps.length < 5 && (
        <p className="dz-note">Your business profile has no {gaps.join(', ')} yet — designs leave those out or show a placeholder, never a made-up one. Add them under AI Autopilot → the business’s profile.</p>
      )}

      <div className="dz-cats" role="tablist" aria-label="Category">
        <button type="button" role="tab" aria-selected={cat === 'all'} className="dz-chip" onClick={() => setCat('all')}>All templates</button>
        {CATEGORIES.filter(c => TEMPLATES.some(t => t.categories.includes(c.id))).map(c => (
          <button key={c.id} type="button" role="tab" aria-selected={cat === c.id} className="dz-chip" onClick={() => setCat(c.id)}>{c.label}</button>
        ))}
      </div>
      <div className="dz-filters">
        <label className="dz-search"><Search size={15} /><input value={q} onChange={e => setQ(e.target.value)} placeholder="Search templates" aria-label="Search templates" /></label>
        <select aria-label="Format" value={format} onChange={e => setFormat(e.target.value as FormatId | 'any')}>
          <option value="any">Any format</option>
          {FORMATS.map(f => <option key={f.id} value={f.id}>{f.label} — {f.platforms.includes('instagram') ? 'Instagram, ' : ''}{f.platforms.filter(p => p !== 'instagram').map(p => ({ facebook: 'Facebook', linkedin: 'LinkedIn', tiktok: 'TikTok', youtube: 'YouTube', twitter: 'X' } as Record<string, string>)[p]).join(', ')}</option>)}
        </select>
        <select aria-label="Industry" value={industry} onChange={e => setIndustry(e.target.value as IndustryId | 'auto')}>
          <option value="auto">{bizIndustry !== 'any' ? `Best for ${INDUSTRIES.find(i => i.id === bizIndustry)?.label} first` : 'Every industry'}</option>
          {INDUSTRIES.map(i => <option key={i.id} value={i.id}>{i.label}</option>)}
        </select>
        <select aria-label="Style" value={style} onChange={e => setStyle(e.target.value as StyleId | 'all')}>
          <option value="all">Any style</option>
          {STYLES.map(s => <option key={s.id} value={s.id}>{s.label}</option>)}
        </select>
        <select aria-label="Goal" value={goal} onChange={e => setGoal(e.target.value as ObjectiveId | 'all')}>
          <option value="all">Any goal</option>
          {OBJECTIVES.map(o => <option key={o.id} value={o.id}>{o.label}</option>)}
        </select>
      </div>

      {!businesses ? <p className="dz-sub"><Loader size={14} className="spin" /> Loading your business details…</p> : !list.length ? (
        <div className="dz-empty">No template matches all of those filters. <button type="button" className="dz-link" onClick={() => { setCat('all'); setFormat('any'); setStyle('all'); setGoal('all'); setIndustry('auto'); setQ(''); }}>Clear the filters</button></div>
      ) : (
        <div className="dz-grid" style={{ gridTemplateColumns: `repeat(auto-fill, minmax(min(100%, ${cardW - 40}px), 1fr))` }}>
          {list.map(t => {
            const d = docFor(t);
            return (
              <article key={t.id} className="dz-card" data-template={t.id}>
                <button type="button" className="dz-card-art" onClick={() => setPeek(t)} aria-label={`Preview ${t.name}`}>
                  <DesignCanvas doc={d} width={cardW} preview label={`${t.name} template`} />
                  <span className="dz-card-hover"><Eye size={15} /> Preview</span>
                </button>
                <div className="dz-card-body">
                  <div className="dz-card-title"><b>{t.name}</b>{t.industries.includes(ind) && ind !== 'any' && <span className="dz-tag good">For you</span>}</div>
                  <span className="dz-card-meta">{STYLE_LABEL[t.style]} · {t.pages ? 'Carousel' : formatOf(d.format).label}</span>
                  <button type="button" className="dz-btn primary sm" onClick={() => setUsing({ t, format: d.format })} data-testid={`use-${t.id}`}><Wand2 size={13} /> Use template</button>
                </div>
              </article>
            );
          })}
        </div>
      )}

      {peek && biz && <PeekModal t={peek} docFor={docFor} onClose={() => setPeek(null)} onUse={f => { setUsing({ t: peek, format: f }); setPeek(null); }} />}
      {using && biz && <CreateModal t={using.t} format={using.format} biz={biz} onClose={() => setUsing(null)} onCreate={p => { setUsing(null); onCreate(p); }} />}
    </section>
  );
}

function Modal({ title, onClose, children, wide }: { title: string; onClose: () => void; children: React.ReactNode; wide?: boolean }) {
  useEffect(() => { const k = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); }; window.addEventListener('keydown', k); return () => window.removeEventListener('keydown', k); }, [onClose]);
  return createPortal(
    <div className="dz-overlay" onMouseDown={e => { if (e.target === e.currentTarget) onClose(); }}>
      <div className={`dz-modal ${wide ? 'wide' : ''}`} role="dialog" aria-modal="true" aria-label={title}>
        <div className="dz-modal-head"><h3>{title}</h3><button type="button" className="dz-icon" onClick={onClose} aria-label="Close"><X size={18} /></button></div>
        <div className="dz-modal-body">{children}</div>
      </div>
    </div>, document.body);
}

function PeekModal({ t, docFor, onClose, onUse }: { t: TemplateSpec; docFor: (t: TemplateSpec, f?: FormatId) => ReturnType<typeof newDoc>; onClose: () => void; onUse: (f: FormatId) => void }) {
  const [f, setF] = useState<FormatId>(t.formats[0]);
  const d = docFor(t, f);
  return (
    <Modal title={t.name} onClose={onClose} wide>
      <div className="dz-peek">
        <div className="dz-peek-art"><DesignCanvas doc={d} width={f === 'story' ? 300 : f === 'landscape' || f === 'wide' ? 560 : 440} preview lazy={false} label={`${t.name}, ${formatOf(f).label}`} /></div>
        <div className="dz-peek-side">
          <p>{t.description}</p>
          <div className="dz-label">Formats — laid out again for each, never stretched</div>
          <div className="dz-chips">{t.formats.map(x => <button key={x} type="button" className="dz-chip" aria-pressed={x === f} onClick={() => setF(x)}>{formatOf(x).label}</button>)}</div>
          <p className="dz-small">{formatOf(f).use} · {formatOf(f).width} × {formatOf(f).height}px</p>
          {t.ownPhotos && <p className="dz-small"><b>Uses your own photo.</b> The card shows a sample; your design starts with a space for your picture, because a stock photo here would show somebody else’s work.</p>}
          <p className="dz-small">An original Protected Central design — yours to use and publish, commercially included.{t.ownPhotos ? '' : ' Sample photos are from Unsplash (free for commercial use).'}</p>
          <button type="button" className="dz-btn primary" onClick={() => onUse(f)}><Wand2 size={14} /> Use this template</button>
        </div>
      </div>
    </Modal>
  );
}

function CreateModal({ t, format, biz, onClose, onCreate }: { t: TemplateSpec; format: FormatId; biz: Business; onClose: () => void; onCreate: (p: DesignPost) => void }) {
  const slots = slotsOf(t);
  const [topic, setTopic] = useState('');
  const [goal, setGoal] = useState<ObjectiveId>(t.objectives[0]);
  const [facts, setFacts] = useState<Partial<DesignContent>>(() => (biz.offer && slots.has('offer') ? { offer: biz.offer } : {}));
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const fields = FACT_FIELDS.filter(f => f.slots.some(s => slots.has(s)));
  const create = async () => {
    setBusy(true); setErr('');
    const clean = Object.fromEntries(Object.entries(facts).filter(([, v]) => typeof v === 'string' && v.trim()).map(([k, v]) => [k, String(v).trim()])) as Partial<DesignContent>;
    try {
      const w = await writeCopy(t, biz, goal, topic.trim(), clean);
      const doc = { ...newDoc(t, biz, { format, objective: goal, topic: topic.trim(), content: w.content }), caption: w.caption, hashtags: w.hashtags };
      onCreate(newPost(doc, { aiPrompt: topic.trim() || undefined, tags: ['template', t.id, ...(w.by === 'ai' ? ['ai-written'] : [])] }));
      if (w.note) sessionStorage.setItem('dz-note', w.note);
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'The design could not be made.');
      setBusy(false);
    }
  };
  return (
    <Modal title={`Use “${t.name}”`} onClose={onClose}>
      <div className="dz-form">
        <label className="dz-field"><span>What is this post about? <i>optional</i></span>
          <input value={topic} onChange={e => setTopic(e.target.value)} placeholder={biz.services[0] ? `e.g. ${biz.services[0]}` : 'e.g. our new spring range'} data-field="design.topic" autoFocus />
        </label>
        <label className="dz-field"><span>Goal</span>
          <select value={goal} onChange={e => setGoal(e.target.value as ObjectiveId)} data-field="design.goal">
            {OBJECTIVES.map(o => <option key={o.id} value={o.id}>{o.label}</option>)}
          </select>
        </label>
        {fields.length > 0 && (
          <fieldset className="dz-facts">
            <legend>Details for this design</legend>
            <p className="dz-small">Only what is true. Leave any empty — the design shows a clear placeholder instead, and nothing is made up for you.</p>
            <div className="dz-facts-grid">
              {fields.map(f => (
                <label key={f.key} className={`dz-field ${f.key === 'quote' ? 'span' : ''}`}><span>{f.label}{t.needs.includes(f.key as never) ? '' : <i> optional</i>}</span>
                  {f.key === 'quote'
                    ? <textarea rows={3} value={(facts[f.key] as string) ?? ''} placeholder={f.ph} onChange={e => setFacts(x => ({ ...x, [f.key]: e.target.value }))} data-field={`design.${f.key}`} />
                    : <input value={(facts[f.key] as string) ?? ''} placeholder={f.ph} onChange={e => setFacts(x => ({ ...x, [f.key]: e.target.value }))} data-field={`design.${f.key}`} />}
                </label>
              ))}
            </div>
          </fieldset>
        )}
        {err && <p className="dz-err" role="alert">{err}</p>}
        <div className="dz-actions">
          <button type="button" className="dz-btn" onClick={onClose}>Cancel</button>
          <button type="button" className="dz-btn primary" onClick={() => void create()} disabled={busy} data-testid="create-design">
            {busy ? <><Loader size={14} className="spin" /> Writing your design…</> : <><Check size={14} /> Create design</>}
          </button>
        </div>
      </div>
    </Modal>
  );
}
