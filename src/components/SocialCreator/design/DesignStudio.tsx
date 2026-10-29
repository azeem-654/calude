/**
 * The template editor — a design is a template and what fills it, so the
 * customer edits words, pictures, colours and switches, and the template
 * keeps the composition. Nothing here can push a headline off the canvas or
 * stretch a photo: the renderer fits each into the place the template gives it.
 *
 * Saved to the post as it changes (crm_social_posts, the record every other
 * screen reads). Exported at the platform's full size by the same renderer
 * the preview uses. "Saved to the Media Center" is said only once the server
 * has checked and kept the PNG.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import {
  ArrowLeft, Check, ChevronLeft, ChevronRight, Copy, Download, ExternalLink, FolderUp, Image as ImageIcon, Loader,
  Palette, RefreshCw, Search, Send, Share2, SlidersHorizontal, Type, Upload, Wand2, X, CalendarClock, AlertTriangle,
} from 'lucide-react';
import { useApp } from '../../../context/AppContext';
import { askConfirm } from '../../shared/ConfirmDialog';
import {
  FONT_PAIRS, FORMATS, formatOf, paletteFor,
  type DesignContent, type DesignDoc, type FormatId, type ImageRef, type ImageSlot, type Layer, type TemplateSpec, type TextSlot, type ToggleKey,
} from '../../../../worker/src/lib/design/spec';
import { TEMPLATES, templateOf } from '../../../../worker/src/lib/design/templates';
import { PHOTOS, PHOTO_SOURCE, photoUrl, photosFor, topicsForIndustry } from '../../../../worker/src/lib/design/photos';
import { PLACEHOLDER, missingNeeds, photoCredit, type Business } from '../../../../worker/src/lib/design/content';
import { normalisePosts } from '../normalise';
import type { DesignPost } from '../types';
import DesignCanvas from './DesignCanvas';
import { exportPng, pageCount } from './render';
import { asDataUrl, preparePicture, resolveMedia, saveToMedia, searchPhotos, type FoundPhoto } from './media';
import { loadBusinesses } from './business';
import { writeCopy } from './aiCopy';
import { postFields } from './post';
import { COMPOSER_URL, canWebShare, copyToClipboard, openTab } from '../../../services/publishHandoff';
import './design.css';

const SLOT_LABEL: Partial<Record<TextSlot, string>> = {
  eyebrow: 'Small label', headline: 'Headline', subhead: 'Supporting line', cta: 'Button', offer: 'Offer', price: 'Price',
  website: 'Website', phone: 'Phone', email: 'Email', address: 'Address', date: 'Date', time: 'Time', location: 'Place',
  quote: 'Quote / review (real words only)', author: 'Who said it', authorRole: 'Their role or town', rating: 'Star rating (1–5)',
  beforeLabel: 'Before label', afterLabel: 'After label', occasion: 'Occasion', beds: 'Bedrooms', baths: 'Bathrooms', area: 'Size', handle: 'Handle',
};
const TOGGLE_LABEL: Record<ToggleKey, string> = { logo: 'Logo or name', eyebrow: 'Small label', cta: 'Button', subhead: 'Supporting line', contact: 'Contact details', pattern: 'Pattern & texture', badge: 'Offer badge', points: 'Points list', frame: 'Frame' };
const IMAGE_LABEL: Record<ImageSlot, string> = { photo: 'Main photo', photo2: 'Second photo', product: 'Third photo', logo: 'Logo', avatar: 'Your photo' };
const COMPOSER: Record<FormatId, keyof typeof COMPOSER_URL> = { square: 'instagram_feed', portrait: 'instagram_feed', story: 'instagram_story', landscape: 'linkedin_feed', wide: 'x_post' };

const layersOf = (t: TemplateSpec): Layer[] => (t.pages ? [...t.pages.cover.layers, ...t.pages.slide.layers, ...t.pages.end.layers] : t.layers);
const textSlots = (t: TemplateSpec) => [...new Set(layersOf(t).flatMap(l => (l.kind === 'text' || l.kind === 'button' || l.kind === 'badge' || l.kind === 'stars') && 'slot' in l && l.slot ? [l.slot as TextSlot] : []))]
  .filter(s => !['company', 'slideTitle', 'slideBody', 'slideNumber'].includes(s));
const imageSlots = (t: TemplateSpec) => [...new Set(layersOf(t).flatMap(l => (l.kind === 'image' ? [l.slot] : [])))];
const toggles = (t: TemplateSpec) => [...new Set(layersOf(t).flatMap(l => (l.toggle ? [l.toggle] : [])))];

/** Up to four genuinely different templates for the same post: a different family, the same purpose. */
function variationsOf(t: TemplateSpec, format: FormatId, industry: string, doc?: DesignDoc): TemplateSpec[] {
  /* A variation that would need a fact this design does not have (an offer, a date, a review) would only show a placeholder. */
  const hasFact = (x: TemplateSpec) => x.needs.every(n => !['offer', 'date', 'quote', 'author', 'occasion', 'points'].includes(n) || (n === 'points' ? (doc?.content.points ?? []).length > 0 : !!String((doc?.content as Record<string, unknown> | undefined)?.[n] ?? '').trim()));
  const overlap = (a: TemplateSpec) => a.categories.filter(c => t.categories.includes(c)).length * 2 + a.objectives.filter(o => t.objectives.includes(o)).length + (a.industries.includes(industry as never) ? 2 : 0);
  /* A template that needs the customer's own photo is offered only from one that already has it — otherwise the variation is a placeholder. */
  const pool = TEMPLATES.filter(x => x.id !== t.id && !!x.pages === !!t.pages && x.formats.includes(format) && (!x.ownPhotos || !!t.ownPhotos) && hasFact(x) && (x.categories.some(c => t.categories.includes(c)) || x.objectives.some(o => t.objectives.includes(o))))
    .sort((a, b) => overlap(b) - overlap(a));
  const out: TemplateSpec[] = [];
  const families = new Set([t.family]);
  for (const x of pool) { if (out.length >= 4) break; if (!families.has(x.family)) { out.push(x); families.add(x.family); } }
  for (const x of pool) { if (out.length >= 4) break; if (!out.includes(x)) out.push(x); }
  return out;
}

export default function DesignStudio() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { socialPosts, updateSocialPost, addNotification } = useApp() as unknown as {
    socialPosts: unknown[]; updateSocialPost: (id: string, u: Partial<DesignPost>) => void;
    addNotification: (m: string, k?: 'success' | 'error' | 'info') => void;
  };
  const post = useMemo(() => normalisePosts(socialPosts).find(p => p.id === id), [socialPosts, id]);
  const [doc, setDoc] = useState<DesignDoc | null>(() => post?.design ?? null);
  const [name, setName] = useState(post?.name ?? '');
  const [caption, setCaption] = useState(post?.caption ?? post?.design?.caption ?? '');
  const [tags, setTags] = useState((post?.hashtags ?? post?.design?.hashtags ?? []).join(' '));
  const [tab, setTab] = useState<'words' | 'pictures' | 'brand' | 'layout'>('words');
  const [page, setPage] = useState(0);
  const [drawn, setDrawn] = useState<{ placeholders: string[]; missingImages: string[] }>({ placeholders: [], missingImages: [] });
  const [busy, setBusy] = useState<'' | 'png' | 'media' | 'ai' | 'share'>('');
  const [note, setNote] = useState(() => { const n = sessionStorage.getItem('dz-note') ?? ''; sessionStorage.removeItem('dz-note'); return n; });
  const [savedMedia, setSavedMedia] = useState<string>('');
  const [biz, setBiz] = useState<Business | null>(null);
  const [previewW, setPreviewW] = useState(520);
  const stage = useRef<HTMLDivElement | null>(null);

  useEffect(() => { void loadBusinesses().then(list => setBiz(list.find(b => b.id && b.id === doc?.businessId) ?? list[0] ?? null)); }, [doc?.businessId]);

  /* The preview as wide as its column allows, and no taller than the window. */
  useEffect(() => {
    if (!stage.current || !doc) return;
    const f = formatOf(doc.format);
    const fit = () => {
      const w = stage.current?.clientWidth ?? 520;
      const top = Math.max(0, stage.current?.getBoundingClientRect().top ?? 220);
      const maxH = Math.max(360, window.innerHeight - Math.min(top, 340) - 48);
      setPreviewW(Math.max(200, Math.min(w - 8, Math.round((maxH * f.width) / f.height), 720)));
    };
    fit();
    const ro = new ResizeObserver(fit); ro.observe(stage.current);
    window.addEventListener('resize', fit);
    return () => { ro.disconnect(); window.removeEventListener('resize', fit); };
  }, [doc?.format, doc]);

  /* Saved as it changes, a moment after the last keystroke. */
  const first = useRef(true);
  useEffect(() => {
    if (!doc || !post) return;
    if (first.current) { first.current = false; return; }
    const t = setTimeout(() => {
      updateSocialPost(post.id, { ...postFields({ ...doc, caption, hashtags: tagList(tags) }), name: name.trim() || 'Untitled design', caption, hashtags: tagList(tags), updatedAt: new Date().toISOString() });
    }, 600);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [doc, name, caption, tags]);

  if (!post) return <div className="dz-page"><div className="dz-empty">That design is not in this workspace. <Link to="/social-creator">Back to your designs</Link></div></div>;
  if (!doc) return <div className="dz-page"><div className="dz-empty">This design was made with the free-form editor. <Link to={`/social-creator/editor/${post.id}`}>Open it there</Link>, or start a new one from a template.</div></div>;

  const tpl = templateOf(doc.templateId);
  const pages = pageCount(doc, tpl);
  const set = (patch: Partial<DesignDoc>) => setDoc(d => (d ? { ...d, ...patch } : d));
  const setContent = (patch: Partial<DesignContent>) => setDoc(d => (d ? { ...d, content: { ...d.content, ...patch } } : d));
  const setImage = (slot: ImageSlot, ref: ImageRef | null) => setDoc(d => { if (!d) return d; const images = { ...d.images }; if (ref) images[slot] = ref; else delete images[slot]; return { ...d, images }; });
  const missing = missingNeeds(doc, tpl);
  const fileBase = (name || tpl.name).replace(/[^\w -]+/g, '').trim().replace(/\s+/g, '-').toLowerCase() || 'design';

  const confirmPlaceholders = async () => {
    const left = [...new Set(drawn.placeholders)];
    if (!left.length && !drawn.missingImages.length) return true;
    return askConfirm({
      title: 'Placeholders are still showing',
      message: `${left.length ? `This design still shows: ${left.join(', ')}. ` : ''}${drawn.missingImages.length ? 'A picture could not be loaded. ' : ''}Replace them before you publish, or export anyway to check the layout.`,
      confirmLabel: 'Export anyway',
    });
  };

  const download = async () => {
    if (!await confirmPlaceholders()) return;
    setBusy('png');
    try {
      for (let p = 0; p < pages; p++) {
        const { blob } = await exportPng(doc, p, resolveMedia);
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a'); a.href = url; a.download = `${fileBase}-${doc.format}${pages > 1 ? `-${p + 1}` : ''}.png`; a.click();
        setTimeout(() => URL.revokeObjectURL(url), 4000);
      }
      addNotification(pages > 1 ? `${pages} PNG slides downloaded.` : 'PNG downloaded.', 'success');
    } catch (e) { addNotification(e instanceof Error ? e.message : 'The PNG could not be made.', 'error'); }
    setBusy('');
  };

  const toMedia = async () => {
    if (!await confirmPlaceholders()) return;
    setBusy('media'); setSavedMedia('');
    try {
      let lastId = '';
      for (let p = 0; p < pages; p++) {
        const { blob, width, height } = await exportPng(doc, p, resolveMedia);
        const r = await saveToMedia(blob, { name: `${name || tpl.name}${pages > 1 ? ` — slide ${p + 1}` : ''}`, kind: 'graphic', designId: post.id, width, height, source: { origin: 'designer', templateId: tpl.id, format: doc.format } });
        if (!r.ok) { addNotification(r.error, 'error'); setBusy(''); return; }
        lastId = r.item.id;
      }
      updateSocialPost(post.id, { mediaId: lastId });
      setSavedMedia(pages > 1 ? `${pages} slides saved to the Media Center.` : 'Saved to the Media Center.');
    } catch (e) { addNotification(e instanceof Error ? e.message : 'The PNG could not be made.', 'error'); }
    setBusy('');
  };

  const share = async () => {
    setBusy('share');
    try {
      const { blob } = await exportPng(doc, 0, resolveMedia);
      const file = new File([blob], `${fileBase}.png`, { type: 'image/png' });
      const text = [caption, tagList(tags).map(t => `#${t}`).join(' ')].filter(Boolean).join('\n\n');
      if (navigator.canShare?.({ files: [file] })) await navigator.share({ files: [file], text });
      else addNotification('This browser cannot share pictures straight to an app — download the PNG instead.', 'info');
    } catch { /* the customer closed the share sheet */ }
    setBusy('');
  };

  const rewrite = async () => {
    if (!biz) return;
    setBusy('ai');
    const facts = Object.fromEntries(Object.entries(doc.content).filter(([k]) => ['offer', 'price', 'priceNote', 'date', 'time', 'location', 'address', 'quote', 'author', 'authorRole', 'rating', 'beds', 'baths', 'area', 'handle', 'occasion', 'website', 'phone', 'email', 'beforeLabel', 'afterLabel'].includes(k))) as Partial<DesignContent>;
    const w = await writeCopy(tpl, biz, doc.objective ?? tpl.objectives[0], post.aiPrompt ?? '', facts);
    setDoc(d => (d ? { ...d, content: w.content } : d));
    if (w.caption) setCaption(w.caption);
    if (w.hashtags.length) setTags(w.hashtags.join(' '));
    setNote(w.note ?? (w.by === 'ai' ? 'Rewritten. Your offer, dates and other details were kept exactly as you typed them.' : ''));
    setBusy('');
  };

  const status = post.status === 'scheduled' ? `Scheduled${post.scheduledAt ? ` for ${new Date(post.scheduledAt).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' })}` : ''}` : post.status === 'published' ? 'Published' : (post.tags ?? []).includes('ready-to-publish') ? 'Ready to publish' : 'Draft';

  return (
    <div className="dz-page dz-studio" data-testid="design-studio">
      <header className="dz-bar">
        <button type="button" className="dz-btn ghost" onClick={() => navigate('/social-creator')}><ArrowLeft size={15} /> Designs</button>
        <input className="dz-name" value={name} onChange={e => setName(e.target.value)} aria-label="Design name" data-field="design.name" />
        <span className="dz-status">{status}</span>
        <span className="dz-spacer" />
        <button type="button" className="dz-btn" onClick={() => void download()} disabled={!!busy} data-testid="design-download">{busy === 'png' ? <Loader size={14} className="spin" /> : <Download size={14} />} Download PNG</button>
        <button type="button" className="dz-btn primary" onClick={() => void toMedia()} disabled={!!busy} data-testid="design-save-media">{busy === 'media' ? <Loader size={14} className="spin" /> : <FolderUp size={14} />} Save to Media Center</button>
      </header>
      {savedMedia && <p className="dz-ok" role="status" data-testid="design-saved"><Check size={14} /> {savedMedia} <Link to="/video-studio?tab=media">Open the Media Center</Link></p>}
      {note && <p className="dz-note">{note} <button type="button" className="dz-icon" onClick={() => setNote('')} aria-label="Dismiss"><X size={13} /></button></p>}

      <div className="dz-formats" role="radiogroup" aria-label="Format">
        {FORMATS.filter(f => tpl.formats.includes(f.id)).map(f => (
          <button key={f.id} type="button" role="radio" aria-checked={doc.format === f.id} className="dz-chip" onClick={() => { set({ format: f.id }); setPage(0); }} title={f.use}>{f.label}</button>
        ))}
        <span className="dz-small">{formatOf(doc.format).use} · {formatOf(doc.format).width}×{formatOf(doc.format).height}</span>
      </div>

      <div className="dz-layout">
        <aside className="dz-panel" aria-label="Edit">
          <div className="dz-tabs" role="tablist">
            {([['words', Type, 'Words'], ['pictures', ImageIcon, 'Pictures'], ['brand', Palette, 'Brand'], ['layout', SlidersHorizontal, 'Layout']] as const).map(([k, Icon, l]) => (
              <button key={k} type="button" role="tab" aria-selected={tab === k} onClick={() => setTab(k)}><Icon size={14} /> {l}</button>
            ))}
          </div>
          {tab === 'words' && <WordsTab tpl={tpl} doc={doc} setContent={setContent} rewrite={rewrite} busy={busy === 'ai'} />}
          {tab === 'pictures' && <PicturesTab tpl={tpl} doc={doc} setImage={setImage} biz={biz} />}
          {tab === 'brand' && <BrandTab doc={doc} set={set} biz={biz} setImage={setImage} />}
          {tab === 'layout' && <LayoutTab tpl={tpl} doc={doc} set={set} />}
        </aside>

        <main className="dz-stage" ref={stage}>
          <div className="dz-art" style={{ width: previewW }}>
            <DesignCanvas doc={doc} width={previewW} page={page} lazy={false} onDrawn={r => setDrawn(r)} label="Your design" />
          </div>
          {pages > 1 && (
            <div className="dz-pager">
              <button type="button" className="dz-icon" disabled={page === 0} onClick={() => setPage(p => p - 1)} aria-label="Previous slide"><ChevronLeft size={16} /></button>
              <span>Slide {page + 1} of {pages}</span>
              <button type="button" className="dz-icon" disabled={page >= pages - 1} onClick={() => setPage(p => p + 1)} aria-label="Next slide"><ChevronRight size={16} /></button>
            </div>
          )}
          {missing.length > 0 && <p className="dz-warn" data-testid="design-missing"><AlertTriangle size={14} /> Still to add: {missing.join(', ')}. Shown as placeholders until you do — nothing is filled in for you.</p>}
        </main>

        <aside className="dz-side" aria-label="Variations and publishing">
          <Variations tpl={tpl} doc={doc} onPick={t => { set({ templateId: t.id, format: t.formats.includes(doc.format) ? doc.format : t.formats[0], hidden: [] }); setPage(0); }} industry={doc.industry ?? ''} />
          <section className="dz-box">
            <h4><Send size={14} /> Post it</h4>
            <label className="dz-field"><span>Caption</span><textarea rows={4} value={caption} onChange={e => setCaption(e.target.value)} data-field="design.caption" placeholder="The words that go with the picture" /></label>
            <label className="dz-field"><span>Hashtags</span><input value={tags} onChange={e => setTags(e.target.value)} placeholder="hvac austin tuneup" data-field="design.hashtags" /></label>
            <div className="dz-row">
              <button type="button" className="dz-btn sm" onClick={() => void copyToClipboard([caption, tagList(tags).map(t => `#${t}`).join(' ')].filter(Boolean).join('\n\n')).then(ok => addNotification(ok ? 'Caption copied.' : 'Could not copy.', ok ? 'success' : 'error'))}><Copy size={13} /> Copy caption</button>
              <button type="button" className="dz-btn sm" onClick={() => openTab(COMPOSER_URL[COMPOSER[doc.format]])}><ExternalLink size={13} /> Open {doc.format === 'landscape' ? 'LinkedIn' : doc.format === 'wide' ? 'X' : 'Instagram'}</button>
              {canWebShare() && <button type="button" className="dz-btn sm" onClick={() => void share()} disabled={!!busy}><Share2 size={13} /> Share</button>}
            </div>
            <p className="dz-small">Protected Central does not post to social platforms for you: download or share the picture, copy the caption, and post it in the app.</p>
            <Schedule post={post} update={u => updateSocialPost(post.id, u)} />
          </section>
          <p className="dz-small">{tpl.source.license} {Object.values(doc.images).filter(Boolean).map(r => photoCredit(r!)).filter(Boolean).join(' · ')}</p>
        </aside>
      </div>
    </div>
  );
}

const tagList = (s: string) => s.split(/[\s,]+/).map(t => t.replace(/^#/, '')).filter(Boolean).slice(0, 15);

function Schedule({ post, update }: { post: DesignPost; update: (u: Partial<DesignPost>) => void }) {
  const [when, setWhen] = useState(post.scheduledAt ? post.scheduledAt.slice(0, 16) : '');
  const ready = (post.tags ?? []).includes('ready-to-publish');
  return (
    <div className="dz-sched">
      <label className="dz-field"><span><CalendarClock size={13} /> Plan a date (a reminder on your list — nothing posts automatically)</span>
        <input type="datetime-local" value={when} onChange={e => setWhen(e.target.value)} data-field="design.when" />
      </label>
      <div className="dz-row">
        <button type="button" className="dz-btn sm" disabled={!when} onClick={() => update({ status: 'scheduled', scheduledAt: new Date(when).toISOString() })}>Schedule</button>
        <button type="button" className="dz-btn sm" onClick={() => update({ status: 'draft', tags: ready ? (post.tags ?? []).filter(t => t !== 'ready-to-publish') : [...(post.tags ?? []), 'ready-to-publish'] })}>{ready ? 'Not ready yet' : 'Mark ready to publish'}</button>
        <button type="button" className="dz-btn sm" onClick={() => update({ status: 'published' })}>I posted it</button>
      </div>
    </div>
  );
}

function Count({ v, max }: { v: string; max?: number }) {
  if (!max) return null;
  return <em className={v.length > max ? 'over' : ''}>{v.length}/{max}</em>;
}

function WordsTab({ tpl, doc, setContent, rewrite, busy }: { tpl: TemplateSpec; doc: DesignDoc; setContent: (p: Partial<DesignContent>) => void; rewrite: () => void; busy: boolean }) {
  const slots = textSlots(tpl);
  const c = doc.content as Record<string, unknown>;
  const facts = new Set(['offer', 'price', 'date', 'time', 'location', 'address', 'quote', 'author', 'authorRole', 'rating', 'beds', 'baths', 'area', 'handle', 'website', 'phone', 'email']);
  return (
    <div className="dz-tabbody">
      <button type="button" className="dz-btn primary sm" onClick={rewrite} disabled={busy} data-testid="design-rewrite">{busy ? <Loader size={13} className="spin" /> : <Wand2 size={13} />} Rewrite the words</button>
      <p className="dz-small">Rewrites the headline, label, button and points from your business details. Offers, prices, dates, reviews and contact details are never written for you — type them below.</p>
      {slots.map(sl => {
        const v = String(c[sl] ?? '');
        const need = tpl.needs.includes(sl as never);
        const long = sl === 'quote' || sl === 'subhead';
        return (
          <label key={sl} className="dz-field">
            <span>{SLOT_LABEL[sl] ?? sl}{facts.has(sl) && <i> — only if true</i>}{need && !v.trim() && <b className="dz-need"> needed</b>} <Count v={v} max={tpl.limits[sl]} /></span>
            {long ? <textarea rows={sl === 'quote' ? 4 : 2} value={v} placeholder={PLACEHOLDER[sl]} onChange={e => setContent({ [sl]: e.target.value })} data-field={`design.${sl}`} />
              : <input value={v} placeholder={PLACEHOLDER[sl]} onChange={e => setContent({ [sl]: e.target.value })} data-field={`design.${sl}`} />}
          </label>
        );
      })}
      {layersOf(tpl).some(l => l.kind === 'list') && (
        <label className="dz-field"><span>Points (one a line) <Count v={(doc.content.points ?? []).join('')} /></span>
          <textarea rows={4} value={(doc.content.points ?? []).join('\n')} onChange={e => setContent({ points: e.target.value.split('\n').slice(0, 5) })} data-field="design.points" />
        </label>
      )}
      {tpl.pages && (
        <div className="dz-slides">
          <span className="dz-label">Slides</span>
          {(doc.content.slides ?? []).map((s, i) => (
            <div key={i} className="dz-slide">
              <input value={s.title} onChange={e => setContent({ slides: (doc.content.slides ?? []).map((x, j) => (j === i ? { ...x, title: e.target.value } : x)) })} aria-label={`Slide ${i + 1} title`} data-field={`design.slide${i}.title`} />
              <textarea rows={3} value={s.body} onChange={e => setContent({ slides: (doc.content.slides ?? []).map((x, j) => (j === i ? { ...x, body: e.target.value } : x)) })} aria-label={`Slide ${i + 1} text`} data-field={`design.slide${i}.body`} />
              <button type="button" className="dz-link" onClick={() => setContent({ slides: (doc.content.slides ?? []).filter((_, j) => j !== i) })}>Remove slide</button>
            </div>
          ))}
          {(doc.content.slides ?? []).length < 8 && <button type="button" className="dz-btn sm" onClick={() => setContent({ slides: [...(doc.content.slides ?? []), { title: 'A new point', body: '' }] })}>Add a slide</button>}
        </div>
      )}
    </div>
  );
}

function PicturesTab({ tpl, doc, setImage, biz }: { tpl: TemplateSpec; doc: DesignDoc; setImage: (s: ImageSlot, r: ImageRef | null) => void; biz: Business | null }) {
  const slots = imageSlots(tpl).filter(s => s !== 'logo');
  const [slot, setSlot] = useState<ImageSlot>(slots[0] ?? 'photo');
  const [mode, setMode] = useState<'library' | 'search'>('library');
  const [err, setErr] = useState('');
  const [up, setUp] = useState(false);
  const file = useRef<HTMLInputElement | null>(null);
  if (!slots.length) return <div className="dz-tabbody"><p className="dz-small">This template is type and shapes only — no photo to change. Try a variation with a photo.</p></div>;
  const ref = doc.images[slot];
  const topics = [...topicsForIndustry(`${biz?.industry ?? ''} ${biz?.description ?? ''}`), ...tpl.photoTopics];
  const lib = photosFor(topics).slice(0, 24);
  const upload = async (f: File) => {
    setErr(''); setUp(true);
    try {
      const p = await preparePicture(f);
      const r = await saveToMedia(p.blob, { name: f.name.replace(/\.[^.]+$/, ''), kind: 'upload', width: p.width, height: p.height, source: { origin: 'upload' } });
      if (r.ok) setImage(slot, { src: `media:${r.item.id}`, origin: 'media', focal: [0.5, 0.5] });
      else {
        /* No Media storage on this install: kept inside the design, small enough for the synced list of posts. */
        const small = p.blob.size > 450_000 ? (await preparePicture(f, 1200)).blob : p.blob;
        if (small.size > 600_000) throw new Error(`${r.error} The picture is too large to keep inside the design without it.`);
        setImage(slot, { src: await asDataUrl(small), origin: 'upload', focal: [0.5, 0.5] });
        setErr(`${r.error} The picture is kept inside this design instead.`);
      }
    } catch (e) { setErr(e instanceof Error ? e.message : 'That picture could not be used.'); }
    setUp(false);
  };
  return (
    <div className="dz-tabbody">
      {slots.length > 1 && <div className="dz-chips">{slots.map(s => <button key={s} type="button" className="dz-chip" aria-pressed={s === slot} onClick={() => setSlot(s)}>{IMAGE_LABEL[s]}</button>)}</div>}
      <div className="dz-pic-now">
        {ref ? <RefImg r={ref} /> : <span className="dz-pic-empty">{tpl.ownPhotos ? 'Add your own photo' : 'No picture'}</span>}
        <div>
          <b>{IMAGE_LABEL[slot]}</b>
          <span className="dz-small">{ref ? photoCredit(ref) : tpl.ownPhotos ? 'This template is for your own picture — your work, your product, your face.' : ''}</span>
          {ref && <button type="button" className="dz-link" onClick={() => setImage(slot, null)}>Remove</button>}
        </div>
      </div>
      <input ref={file} type="file" accept="image/png,image/jpeg,image/webp" hidden onChange={e => { const f = e.target.files?.[0]; if (f) void upload(f); e.target.value = ''; }} data-field="design.upload" />
      <button type="button" className="dz-btn primary sm" onClick={() => file.current?.click()} disabled={up}>{up ? <Loader size={13} className="spin" /> : <Upload size={13} />} Upload a picture</button>
      {err && <p className="dz-err">{err}</p>}
      {ref && (
        <div className="dz-crop">
          <span className="dz-label">Crop — where to keep in view</span>
          <div className="dz-focal" role="group" aria-label="Focal point">
            {[0.15, 0.5, 0.85].flatMap(y => [0.15, 0.5, 0.85].map(x => (
              <button key={`${x}${y}`} type="button" aria-pressed={Math.abs((ref.focal?.[0] ?? 0.5) - x) < 0.1 && Math.abs((ref.focal?.[1] ?? 0.5) - y) < 0.1} onClick={() => setImage(slot, { ...ref, focal: [x, y] })} aria-label={`Focus ${y < 0.3 ? 'top' : y > 0.7 ? 'bottom' : 'middle'} ${x < 0.3 ? 'left' : x > 0.7 ? 'right' : 'centre'}`} />
            )))}
          </div>
          <label className="dz-field"><span>Zoom</span><input type="range" min={1} max={2.5} step={0.05} value={ref.zoom ?? 1} onChange={e => setImage(slot, { ...ref, zoom: Number(e.target.value) })} /></label>
        </div>
      )}
      {!tpl.ownPhotos || slot === 'product' ? (
        <>
          <div className="dz-chips">
            <button type="button" className="dz-chip" aria-pressed={mode === 'library'} onClick={() => setMode('library')}>Photo library</button>
            <button type="button" className="dz-chip" aria-pressed={mode === 'search'} onClick={() => setMode('search')}><Search size={12} /> Free photos</button>
          </div>
          {mode === 'library' ? (
            <>
              <div className="dz-thumbs">{lib.map(p => (
                <button key={p.id} type="button" aria-pressed={ref?.libraryId === p.id} onClick={() => setImage(slot, { src: `library:${p.id}`, libraryId: p.id, focal: p.focal, origin: 'library', license: PHOTO_SOURCE.license, licenseUrl: PHOTO_SOURCE.licenseUrl, credit: `Photo: ${PHOTO_SOURCE.name}` })} title={p.alt}>
                  <img src={photoUrl(p.id, 160, 120, p.focal)} alt={p.alt} loading="lazy" />
                </button>
              ))}</div>
              <p className="dz-small">{PHOTOS.length} photos chosen for these templates, from Unsplash — free for commercial use under the <a href={PHOTO_SOURCE.licenseUrl} target="_blank" rel="noreferrer">Unsplash License</a>.</p>
            </>
          ) : <PhotoSearch onPick={p => setImage(slot, { src: p.src, origin: 'openverse', credit: [p.title, p.creator && `by ${p.creator}`, p.provider && `(${p.provider})`].filter(Boolean).join(' '), license: p.license, licenseUrl: p.licenseUrl, focal: [0.5, 0.5] })} />}
        </>
      ) : <p className="dz-small">Stock photos are not offered here: on this template a stranger’s photo would look like your own work.</p>}
    </div>
  );
}

function PhotoSearch({ onPick }: { onPick: (p: FoundPhoto) => void }) {
  const [q, setQ] = useState('');
  const [busy, setBusy] = useState(false);
  const [res, setRes] = useState<FoundPhoto[] | null>(null);
  const [err, setErr] = useState('');
  const go = useCallback(async () => {
    if (!q.trim()) return;
    setBusy(true); setErr('');
    const r = await searchPhotos(q.trim());
    if (r.success) setRes(r.photos); else { setErr(r.error ?? 'The search did not work.'); setRes(null); }
    setBusy(false);
  }, [q]);
  return (
    <div>
      <div className="dz-row">
        <input value={q} onChange={e => setQ(e.target.value)} onKeyDown={e => { if (e.key === 'Enter') void go(); }} placeholder="e.g. roof shingles" aria-label="Search free photos" data-field="media.q" style={{ flex: 1 }} />
        <button type="button" className="dz-btn sm" onClick={() => void go()} disabled={busy}>{busy ? <Loader size={13} className="spin" /> : <Search size={13} />}</button>
      </div>
      {err && <p className="dz-err">{err}</p>}
      {res && !res.length && <p className="dz-small">No CC0 or public-domain pictures for that — try a simpler word.</p>}
      {res && res.length > 0 && <div className="dz-thumbs">{res.map(p => <button key={p.id} type="button" onClick={() => onPick(p)} title={`${p.title} — ${p.license}`}><img src={p.src} alt={p.title} loading="lazy" /></button>)}</div>}
      <p className="dz-small">Searches Openverse for CC0 and public-domain pictures only — free to use commercially and to change. Each picture’s creator and licence are kept with the design.</p>
    </div>
  );
}

function BrandTab({ doc, set, biz, setImage }: { doc: DesignDoc; set: (p: Partial<DesignDoc>) => void; biz: Business | null; setImage: (s: ImageSlot, r: ImageRef | null) => void }) {
  const pal = paletteFor(doc.colors);
  const file = useRef<HTMLInputElement | null>(null);
  const [err, setErr] = useState('');
  const logo = doc.images.logo;
  return (
    <div className="dz-tabbody">
      <span className="dz-label">Colours</span>
      <div className="dz-colors">
        {(['primary', 'secondary', 'accent'] as const).map(k => (
          <label key={k} className="dz-color"><input type="color" value={(doc.colors[k] || pal[k]) as string} onChange={e => set({ colors: { ...doc.colors, [k]: e.target.value } })} data-field={`design.color.${k}`} /><span>{k === 'primary' ? 'Main' : k === 'secondary' ? 'Second' : 'Accent'}</span></label>
        ))}
      </div>
      {biz && <button type="button" className="dz-link" onClick={() => set({ colors: { ...biz.colors } })}><RefreshCw size={12} /> Use {biz.name || 'the business'}’s colours</button>}
      <span className="dz-label">Font style</span>
      <div className="dz-fonts">
        {FONT_PAIRS.map(f => (
          <button key={f.id} type="button" aria-pressed={(doc.fontPair ?? templateOf(doc.templateId).fontPair) === f.id} onClick={() => set({ fontPair: f.id })}>
            <b style={{ fontFamily: `"${f.display.family}", serif` }}>{f.label}</b><span>{f.feel}</span>
          </button>
        ))}
      </div>
      <span className="dz-label">Logo</span>
      <div className="dz-row">
        {logo ? <RefImg r={logo} className="dz-logo" /> : <span className="dz-small">No logo — your business name is set in its place.</span>}
        <input ref={file} type="file" accept="image/png,image/jpeg,image/webp" hidden data-field="design.logo" onChange={e => {
          const f = e.target.files?.[0]; e.target.value = '';
          if (!f) return;
          void preparePicture(f).then(async p => {
            const r = await saveToMedia(p.blob, { name: 'Logo', kind: 'upload', source: { origin: 'upload' } });
            if (r.ok) { setImage('logo', { src: `media:${r.item.id}`, origin: 'media' }); setErr(''); }
            else if (p.blob.size < 300_000) { setImage('logo', { src: await asDataUrl(p.blob), origin: 'upload' }); setErr(`${r.error} The logo is kept inside this design instead.`); }
            else setErr(r.error);
          }).catch(e2 => setErr(e2 instanceof Error ? e2.message : 'That logo could not be used.'));
        }} />
        <button type="button" className="dz-btn sm" onClick={() => file.current?.click()}><Upload size={13} /> {logo ? 'Replace' : 'Upload a logo'}</button>
        {logo && <button type="button" className="dz-link" onClick={() => setImage('logo', null)}>Remove</button>}
      </div>
      {err && <p className="dz-err">{err}</p>}
      <label className="dz-field"><span>Business name on the design</span><input value={doc.company} onChange={e => set({ company: e.target.value })} data-field="design.company" /></label>
    </div>
  );
}

function LayoutTab({ tpl, doc, set }: { tpl: TemplateSpec; doc: DesignDoc; set: (p: Partial<DesignDoc>) => void }) {
  const hidden = new Set(doc.hidden ?? []);
  const keys = toggles(tpl);
  return (
    <div className="dz-tabbody">
      <span className="dz-label">Show on the design</span>
      {keys.length ? keys.map(k => (
        <label key={k} className="dz-toggle"><input type="checkbox" checked={!hidden.has(k)} onChange={e => { const h = new Set(hidden); if (e.target.checked) h.delete(k); else h.add(k); set({ hidden: [...h] }); }} /> {TOGGLE_LABEL[k]}</label>
      )) : <p className="dz-small">Every part of this template is essential to it.</p>}
      <p className="dz-small">Switching a part off keeps the rest where the template puts it. For a different arrangement, choose a variation.</p>
      <span className="dz-label">Template</span>
      <p className="dz-small"><b>{tpl.name}</b> — {tpl.description}</p>
    </div>
  );
}

function Variations({ tpl, doc, onPick, industry }: { tpl: TemplateSpec; doc: DesignDoc; onPick: (t: TemplateSpec) => void; industry: string }) {
  const vars = useMemo(() => variationsOf(tpl, doc.format, industry, doc), [tpl, doc, industry]);
  if (!vars.length) return null;
  return (
    <section className="dz-box" data-testid="design-variations">
      <h4><Wand2 size={14} /> Variations</h4>
      <p className="dz-small">The same words in a different composition. Pick one to switch — your words and pictures come with you.</p>
      <div className="dz-vars">
        {vars.map(t => {
          const d: DesignDoc = { ...doc, templateId: t.id, format: t.formats.includes(doc.format) ? doc.format : t.formats[0], hidden: [] };
          return (
            <button key={t.id} type="button" onClick={() => onPick(t)} title={t.name} data-variation={t.id}>
              <DesignCanvas doc={d} width={150} label={`${t.name} variation`} />
              <span>{t.name}</span>
            </button>
          );
        })}
      </div>
    </section>
  );
}

/** A picture reference as an <img>, a Media Center id resolved to its signed address. */
function RefImg({ r, className }: { r: ImageRef; className?: string }) {
  const direct = r.libraryId ? photoUrl(r.libraryId, 160, 120, r.focal) : r.src.startsWith('media:') ? '' : r.src;
  const [resolved, setResolved] = useState<{ id: string; url: string } | null>(null);
  const mediaId = r.src.startsWith('media:') ? r.src.slice(6) : '';
  useEffect(() => {
    if (!mediaId) return;
    let alive = true;
    void resolveMedia(mediaId).then(u => { if (alive) setResolved({ id: mediaId, url: u ?? '' }); });
    return () => { alive = false; };
  }, [mediaId]);
  const src = direct || (resolved?.id === mediaId ? resolved.url : '');
  return src ? <img className={className} src={src} alt="" /> : <span className="dz-pic-empty">…</span>;
}
