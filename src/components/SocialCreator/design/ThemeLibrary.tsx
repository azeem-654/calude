/**
 * Thumbnail themes in the Graphics Designer & Editor (2026-11) — the Design
 * Studio's store of reusable thumbnail designs (lib/design/thumbThemes.ts).
 * A theme is its design, not a picture: each card draws it live on one of
 * the customer's own videos (or with sample words on a plain frame), with
 * the same plan the engine paints (thumbLayout.mjs → PlanPreview). Here a
 * theme is named and described, edited field by field, duplicated, deleted,
 * and tried on another video before it is used — from AI Video Studio
 * ("New thumbnail" → a theme, or every Short at once) and the Shorts wizard.
 */
import { useEffect, useMemo, useState } from 'react';
import { Copy, Loader, Palette, Pencil, Plus, Trash2, X } from 'lucide-react';
import { listThemes, saveTheme, duplicateTheme, deleteTheme, describeTheme, cleanDesign, cleanLogo, MAX_THEMES, type ThumbTheme, type ThemeDesign, type ThemeLogo } from '../../../services/designThemes';
import { thumbPlan, videoLibrary, type LibrarySource } from '../../../services/videoStudio';
import { PlanPreview } from '../../VideoStudio/ThumbnailDesigner';
import '../../VideoStudio/videoStudio.css';

const LAYOUTS: [string, string][] = [['bold', 'Person beside big words'], ['headline', 'Big headline'], ['short', 'Shorts cover (9:16)'], ['glow', 'Person in a glow'], ['cinematic', 'Cinematic'], ['split', 'Two halves'], ['number', 'Big number'], ['callout', 'Callout'], ['modern', 'Screen + words']];
const FONTS: [ThemeDesign['font'], string][] = [['sans', 'Heavy sans'], ['display', 'Tall display'], ['serif', 'Serif']];
const TREATMENTS: [ThemeDesign['treatment'], string][] = [['vivid', 'Vivid'], ['natural', 'Natural'], ['muted', 'Muted'], ['dark', 'Dark'], ['mono', 'Black & white']];
const CORNERS: [ThemeLogo['corner'], string][] = [['tl', 'Top left'], ['tr', 'Top right'], ['bl', 'Bottom left'], ['br', 'Bottom right']];
const SAMPLE = 'Your title in big words';
/** A plain frame for previews when the workspace has no video yet: a quiet grey, so the theme's own colours are what shows. */
const BLANK = `data:image/svg+xml;utf8,${encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" width="1280" height="720"><rect width="1280" height="720" fill="#4b5563"/><circle cx="380" cy="300" r="120" fill="#9ca3af"/><rect x="250" y="440" width="260" height="280" rx="120" fill="#9ca3af"/></svg>')}`;

interface Subject { url: string; w: number; h: number; name: string }

function Preview({ design, words, subject, tall }: { design: ThemeDesign; words: string; subject: Subject; tall: boolean }) {
  const W = tall ? 1080 : 1280, H = tall ? 1920 : 720;
  const plan = useMemo(() => thumbPlan({ ...design, layout: tall && design.layout !== 'headline' ? 'short' : design.layout, text: words || SAMPLE, highlight: (words || SAMPLE).split(' ').slice(-1)[0] }, W, H, { w: subject.w, h: subject.h }, null), [design, words, subject.w, subject.h, tall, W, H]);
  return (
    <div className={`td-canvas ${tall ? 'tall' : ''}`} data-testid="theme-preview" data-layout={plan.layout}>
      <PlanPreview plan={plan} frame={subject} frame2={subject} />
    </div>
  );
}

function Editor({ theme, subjects, onClose, onSaved }: { theme: ThumbTheme | null; subjects: Subject[]; onClose: () => void; onSaved: (t: ThumbTheme) => void }) {
  const [name, setName] = useState(theme?.name ?? '');
  const [desc, setDesc] = useState(theme?.description ?? '');
  const [d, setD] = useState<ThemeDesign>(theme?.design ?? cleanDesign({ layout: 'bold', color: '#5b21b6', color2: '#1d4ed8', accent: '#facc15', hlStyle: 'color' }));
  const [logo, setLogo] = useState<ThemeLogo>(theme?.logo ?? cleanLogo({ on: true }));
  const [words, setWords] = useState(theme?.words ?? 4);
  const [sample, setSample] = useState(SAMPLE);
  const [si, setSi] = useState(0);
  const [tall, setTall] = useState(d.layout === 'short');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<{ text: string; field?: string } | null>(null);
  useEffect(() => { const k = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); }; window.addEventListener('keydown', k); return () => window.removeEventListener('keydown', k); }, [onClose]);
  const set = (p: Partial<ThemeDesign>) => setD(x => cleanDesign({ ...x, ...p }));
  const subject = subjects[si] ?? { url: BLANK, w: 1280, h: 720, name: 'Sample frame' };
  const save = async () => {
    setBusy(true); setErr(null);
    const r = await saveTheme({ name, description: desc, design: d, logo, words, source: theme?.source ?? 'library' }, theme?.id);
    setBusy(false);
    if (!r.success) { setErr({ text: r.error ?? 'The theme could not be saved.', field: r.field }); return; }
    onSaved(r.theme);
  };
  const color = (k: 'color' | 'color2' | 'accent' | 'textColor', label: string) => (
    <label className="dz-field th-color"><span>{label}</span><input type="color" value={d[k] || d.color} onChange={e => set({ [k]: e.target.value })} aria-label={label} /></label>
  );
  return (
    <div className="dz-overlay" role="dialog" aria-modal="true" aria-label={theme ? `Edit ${theme.name}` : 'New thumbnail theme'} onClick={onClose}>
      <div className="dz-modal wide" onClick={e => e.stopPropagation()} data-testid="theme-editor">
        <div className="dz-modal-head"><b><Palette size={16} /> {theme ? 'Edit thumbnail theme' : 'New thumbnail theme'}</b><button type="button" className="dz-btn ghost sm" onClick={onClose} aria-label="Close"><X size={15} /></button></div>
        <div className="th-edit">
          <div className="th-stage">
            <Preview design={d} words={sample} subject={subject} tall={tall} />
            <div className="dz-chips">
              <button type="button" className="dz-chip" aria-pressed={!tall} onClick={() => setTall(false)}>16:9 video</button>
              <button type="button" className="dz-chip" aria-pressed={tall} onClick={() => setTall(true)}>9:16 Short</button>
            </div>
            <label className="dz-field"><span>Try it on</span>
              <select value={si} onChange={e => setSi(Number(e.target.value))} data-testid="theme-subject">
                {subjects.length ? subjects.map((x, i) => <option key={i} value={i}>{x.name}</option>) : <option value={0}>Sample frame (no videos yet)</option>}
              </select></label>
            <label className="dz-field"><span>Sample words (preview only)</span><input value={sample} onChange={e => setSample(e.target.value.slice(0, 80))} /></label>
            <p className="dz-sub" style={{ fontSize: 12 }}>The preview is drawn from the same plan the thumbnail is made from; each video uses its own title, face and moment.</p>
          </div>
          <div className="th-fields">
            <label className="dz-field"><span>Name</span><input value={name} onChange={e => setName(e.target.value)} maxLength={60} data-field="theme.name" placeholder="e.g. Tutorial — purple" /></label>
            <label className="dz-field"><span>What it is for</span><input value={desc} onChange={e => setDesc(e.target.value)} maxLength={300} placeholder="e.g. software tutorial Shorts" /></label>
            <label className="dz-field"><span>Layout</span><select value={d.layout} onChange={e => { set({ layout: e.target.value }); if (e.target.value === 'short') setTall(true); }}>{LAYOUTS.map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select></label>
            <div className="th-row">{color('color', 'Background')}{color('color2', 'Gradient to')}{color('accent', 'Accent')}{color('textColor', 'Words')}</div>
            <label className="dz-field"><span>Type</span><select value={d.font} onChange={e => set({ font: e.target.value as ThemeDesign['font'] })}>{FONTS.map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select></label>
            <div className="dz-chips">
              <button type="button" className="dz-chip" aria-pressed={d.upper} onClick={() => set({ upper: !d.upper })}>Capitals</button>
              <button type="button" className="dz-chip" aria-pressed={d.outline} onClick={() => set({ outline: !d.outline })}>Outline on the words</button>
              <button type="button" className="dz-chip" aria-pressed={d.hlStyle === 'box'} onClick={() => set({ hlStyle: d.hlStyle === 'box' ? 'color' : 'box' })}>Last word in a box</button>
              <button type="button" className="dz-chip" aria-pressed={d.glow} onClick={() => set({ glow: !d.glow })}>Glow behind the person</button>
            </div>
            <label className="dz-field"><span>Picture</span><select value={d.treatment} onChange={e => set({ treatment: e.target.value as ThemeDesign['treatment'] })}>{TREATMENTS.map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select></label>
            <div className="th-row">
              <label className="dz-field"><span>Person</span><select value={d.side} onChange={e => set({ side: e.target.value as ThemeDesign['side'] })}><option value="auto">Where they are</option><option value="left">Left</option><option value="right">Right</option><option value="center">Middle</option></select></label>
              <label className="dz-field"><span>Words</span><select value={d.textPos} onChange={e => set({ textPos: e.target.value as ThemeDesign['textPos'] })}><option value="auto">Layout’s own</option><option value="top">Top</option><option value="middle">Middle</option><option value="bottom">Bottom</option></select></label>
            </div>
            <label className="dz-field"><span>Word size · {Math.round(d.textSize * 100)}%</span><input type="range" min={60} max={140} value={Math.round(d.textSize * 100)} onChange={e => set({ textSize: Number(e.target.value) / 100 })} /></label>
            <label className="dz-field"><span>Words from the title · {words}</span><input type="range" min={2} max={6} value={words} onChange={e => setWords(Number(e.target.value))} /></label>
            <div className="th-row">
              <label className="dz-check"><input type="checkbox" checked={logo.on} onChange={e => setLogo(l => ({ ...l, on: e.target.checked }))} /> Logo</label>
              <label className="dz-field"><span>Corner</span><select value={logo.corner} disabled={!logo.on} onChange={e => setLogo(l => ({ ...l, corner: e.target.value as ThemeLogo['corner'] }))}>{CORNERS.map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select></label>
              <label className="dz-field"><span>Size · {logo.size}%</span><input type="range" min={6} max={30} value={logo.size} disabled={!logo.on} onChange={e => setLogo(l => ({ ...l, size: Number(e.target.value) }))} /></label>
            </div>
            <p className="dz-sub" style={{ fontSize: 12 }}>The logo is your business logo from AI Video Studio’s brand kit; with none set up, nothing is drawn. Arrows, rings and stickers are only kept when the design they came from had them.</p>
            {err && <div className="dz-empty" role="alert" style={{ padding: 10, color: '#b91c1c' }} data-field-error={err.field}>{err.text}</div>}
            <div className="th-row" style={{ justifyContent: 'flex-end' }}>
              <button type="button" className="dz-btn ghost" onClick={onClose}>Cancel</button>
              <button type="button" className="dz-btn primary" disabled={busy || !name.trim()} onClick={() => void save()} data-testid="theme-save">{busy ? <Loader size={14} className="spin" /> : null} Save theme</button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

export default function ThemeLibrary() {
  const [themes, setThemes] = useState<ThumbTheme[] | null>(null);
  const [subjects, setSubjects] = useState<Subject[]>([]);
  const [si, setSi] = useState(0);
  const [editing, setEditing] = useState<ThumbTheme | null | 'new'>(null);
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState('');
  const load = () => void listThemes().then(r => { if (r.success) setThemes(r.themes); else { setThemes([]); setErr(r.error ?? 'Your themes could not be loaded.'); } });
  useEffect(() => {
    load();
    /* The customer's own videos, as subjects to try a theme on (their posters). */
    void videoLibrary().then(r => { if (r.success) setSubjects((r.sources as LibrarySource[]).filter(x => x.posterUrl).slice(0, 20).map(x => ({ url: x.posterUrl, w: x.width || 1280, h: x.height || 720, name: x.projectName || x.name }))); });
  }, []);
  const subject = subjects[si] ?? { url: BLANK, w: 1280, h: 720, name: 'Sample frame' };
  const act = async (what: 'dup' | 'del', t: ThumbTheme) => {
    if (what === 'del' && !window.confirm(`Delete the theme “${t.name}”? Thumbnails already made keep their look.`)) return;
    setBusy(t.id); setErr('');
    const r = what === 'dup' ? await duplicateTheme(t.id) : await deleteTheme(t.id);
    setBusy('');
    if (!r.success) setErr(r.error ?? 'That did not work.');
    load();
  };
  return (
    <section className="dz-gallery th-lib" data-testid="theme-library" aria-label="Thumbnail themes">
      <div className="dz-gal-head">
        <div>
          <h2 className="dz-h2"><Palette size={18} /> Thumbnail themes</h2>
          <p className="dz-sub">Your saved thumbnail designs. Each one makes a video’s thumbnail in the same look with its own title and picture — from AI Video Studio and the Shorts wizard. Save one from any thumbnail with “Save as a theme”, or start one here.</p>
        </div>
        <div className="th-row">
          {subjects.length > 0 && <label className="dz-field"><span>Show them on</span><select value={si} onChange={e => setSi(Number(e.target.value))}>{subjects.map((x, i) => <option key={i} value={i}>{x.name}</option>)}</select></label>}
          <button type="button" className="dz-btn primary" disabled={!!themes && themes.length >= MAX_THEMES} onClick={() => setEditing('new')} data-testid="theme-new"><Plus size={14} /> New theme</button>
        </div>
      </div>
      {err && <div className="dz-empty" role="alert" style={{ color: '#b91c1c' }}>{err}</div>}
      {!themes ? <p className="dz-sub"><Loader size={14} className="spin" /> Loading your themes…</p> : !themes.length ? (
        <div className="dz-empty" data-testid="theme-empty">No themes yet. Make one here, or open any video’s thumbnail in AI Video Studio and press “Save as a theme”.</div>
      ) : (
        <div className="dz-grid" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(min(100%, 280px), 1fr))' }}>
          {themes.map(t => (
            <article key={t.id} className="dz-card" data-theme={t.id}>
              <div className="th-card-art"><Preview design={t.design} words={SAMPLE.split(' ').slice(0, t.words).join(' ')} subject={subject} tall={t.design.layout === 'short'} /></div>
              <div className="dz-card-body">
                <div className="dz-card-title"><b>{t.name}</b></div>
                {t.description && <span className="dz-card-meta">{t.description}</span>}
                <span className="dz-card-meta">{describeTheme(t)}</span>
                <div className="th-row">
                  <button type="button" className="dz-btn sm" onClick={() => setEditing(t)} data-act="theme-edit"><Pencil size={13} /> Edit</button>
                  <button type="button" className="dz-btn sm" disabled={busy === t.id} onClick={() => void act('dup', t)} data-act="theme-duplicate"><Copy size={13} /> Duplicate</button>
                  <button type="button" className="dz-btn ghost sm" disabled={busy === t.id} onClick={() => void act('del', t)} data-act="theme-delete" aria-label={`Delete ${t.name}`}><Trash2 size={13} /></button>
                </div>
              </div>
            </article>
          ))}
        </div>
      )}
      {editing && <Editor theme={editing === 'new' ? null : editing} subjects={subjects} onClose={() => setEditing(null)} onSaved={() => { setEditing(null); load(); }} />}
    </section>
  );
}
