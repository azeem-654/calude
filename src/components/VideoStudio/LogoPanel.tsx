/**
 * Elements → Logo: the customer's logo on the videos.
 *
 * Adding one is a short path with each step shown as it happens: the picture
 * is read here, its background taken out here when asked (flood-filled from
 * the edges — a logo on a plain white or coloured square becomes a cut-out;
 * a photo behind a logo will not, and the preview shows it before anything is
 * sent), trimmed to what is left, uploaded through a signed link, and checked
 * by the server, which is what makes it the project's logo.
 *
 * Placing it: a corner (with a margin) or anywhere — the arrows move it one
 * per cent of the frame at a time (five with Shift), the sliders anywhere.
 * Size, roundness (0 square … 50 a circle or pill) and see-through apply in
 * the preview at once and in every video it is on when that video is made.
 */
import { useEffect, useRef, useState } from 'react';
import { ImagePlus, Trash2, Loader, Check, ArrowUp, ArrowDown, ArrowLeft, ArrowRight, Wand2, AlertCircle } from 'lucide-react';
import { uploadLogo, logoBox, LOGO_DEFAULT, type LogoSettings } from '../../services/videoStudio';
import type { EditorCtx } from './VideoEditor';
import { readPicture, cutOutBackground } from './pictureCut';

type Step = 'read' | 'cut' | 'link' | 'upload' | 'check';
const STEP_LABEL: Record<Step, string> = { read: 'Reading the picture', cut: 'Taking out the background', link: 'Getting a safe upload link', upload: 'Uploading the logo', check: 'Checking it and adding it' };

/** A slider whose value shows as it moves and is saved once, when it is let go — not a version per pixel. */
function Slide({ label, value, min, max, step = 1, unit = '', onCommit, testid }: { label: string; value: number; min: number; max: number; step?: number; unit?: string; onCommit: (v: number) => void; testid?: string }) {
  const [v, setV] = useState(value);
  useEffect(() => setV(value), [value]);
  const commit = () => { if (v !== value) onCommit(v); };
  return (
    <label className="vs-slide">
      <span>{label}</span>
      <input type="range" min={min} max={max} step={step} value={v} onChange={e => setV(Number(e.target.value))} onPointerUp={commit} onKeyUp={commit} onBlur={commit} data-testid={testid} />
      <b>{Math.round(v * 10) / 10}{unit}</b>
    </label>
  );
}

const CORNERS: { key: LogoSettings['corner']; label: string }[] = [{ key: 'tl', label: 'Top left' }, { key: 'tr', label: 'Top right' }, { key: 'bl', label: 'Bottom left' }, { key: 'br', label: 'Bottom right' }, { key: 'custom', label: 'Anywhere' }];

export default function LogoPanel({ ctx }: { ctx: EditorCtx }) {
  const logo = ctx.doc.logo ?? null;
  const [pic, setPic] = useState<{ file: File; base: HTMLCanvasElement; out: HTMLCanvasElement; changed: boolean } | null>(null);
  const [cut, setCut] = useState(true);
  const [tol, setTol] = useState(48);
  const [steps, setSteps] = useState<{ step: Step; state: 'active' | 'done' }[]>([]);
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);
  const view = useRef<HTMLCanvasElement>(null);
  const mark = (s: Step) => setSteps(cur => [...cur.map(x => ({ ...x, state: 'done' as const })), { step: s, state: 'active' }]);

  /* The cut-out again whenever the switch or the tolerance changes — here, in a moment, before anything is sent. */
  useEffect(() => {
    if (!pic) return;
    const r = cut ? cutOutBackground(pic.base, tol) : { canvas: pic.base, changed: false };
    setPic(p => p && { ...p, out: r.canvas, changed: r.changed });
  }, [cut, tol, pic?.base]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    const c = view.current;
    if (!c || !pic) return;
    const k = Math.min(1, 220 / Math.max(pic.out.width, pic.out.height));
    c.width = Math.round(pic.out.width * k); c.height = Math.round(pic.out.height * k);
    const g = c.getContext('2d')!; g.clearRect(0, 0, c.width, c.height); g.drawImage(pic.out, 0, 0, c.width, c.height);
  }, [pic]);

  const choose = async (f: File | undefined) => {
    if (!f) return;
    setErr(''); setSteps([]); mark('read');
    try {
      const base = await readPicture(f);
      if (cut) mark('cut');
      const r = cut ? cutOutBackground(base, tol) : { canvas: base, changed: false };
      setSteps(cur => cur.map(x => ({ ...x, state: 'done' as const })));
      setPic({ file: f, base, out: r.canvas, changed: r.changed });
    } catch { setSteps([]); setErr('That picture could not be opened — try a PNG, JPG, WebP or SVG.'); }
  };
  const use = async () => {
    if (!pic) return;
    setBusy(true); setErr('');
    const blob = await new Promise<Blob | null>(res => pic.out.toBlob(res, 'image/png'));
    if (!blob) { setBusy(false); setErr('The picture could not be made into a PNG.'); return; }
    const r = await uploadLogo(ctx.view.project.id, ctx.version, blob, pic.file.name.replace(/\.[a-z0-9]+$/i, ''), cut && pic.changed, s => mark(s));
    setBusy(false);
    if (!r.ok) { setErr(r.error); setSteps(cur => cur.filter(x => x.state === 'done')); return; }
    setSteps(cur => cur.map(x => ({ ...x, state: 'done' as const })));
    ctx.adopt(r.doc, r.docVersion);
    setPic(null);
    void ctx.refresh();
  };

  const patch = (p: Partial<LogoSettings>, note: string) => void ctx.apply([{ op: 'logo.patch', patch: p }], note);
  /* Moving it from a corner makes it "anywhere", starting from where it is now. */
  const W = ctx.view.source.probe?.width || 1920, H = ctx.view.source.probe?.height || 1080;
  const centre = (l: LogoSettings) => { const b = logoBox(l, W, H); return { x: Math.round(((b.x + b.w / 2) / W) * 1000) / 10, y: Math.round(((b.y + b.h / 2) / H) * 1000) / 10 }; };
  const nudge = (dx: number, dy: number, big: boolean) => {
    if (!logo) return;
    const c = logo.corner === 'custom' ? { x: logo.x, y: logo.y } : centre(logo);
    const k = big ? 5 : 1;
    patch({ corner: 'custom', x: Math.max(0, Math.min(100, c.x + dx * k)), y: Math.max(0, Math.min(100, c.y + dy * k)) }, `Logo moved ${k}%`);
  };

  return (
    <div className="vs-col" data-testid="vs-logo-panel" style={{ gap: 12 }}>
      {(!logo || pic) && (
        <div className="vs-item vs-col" style={{ gap: 10 }}>
          <div className="vs-row"><ImagePlus size={15} color="#c084fc" /><b>{logo ? 'Replace your logo' : 'Add your logo'}</b></div>
          <label className="vs-btn primary sm" style={{ justifySelf: 'start' }}>
            <ImagePlus size={13} /> Choose a picture
            <input type="file" hidden accept="image/png,image/jpeg,image/webp,image/svg+xml,image/gif" onChange={e => void choose(e.target.files?.[0])} data-field="video.logo" data-testid="vs-logo-file" />
          </label>
          <label className="vs-rec-check"><input type="checkbox" checked={cut} onChange={e => setCut(e.target.checked)} data-testid="vs-logo-cut" /> <Wand2 size={14} /> Remove the background</label>
          {cut && pic && <Slide label="How much counts as background" value={tol} min={10} max={120} onCommit={setTol} />}
          {pic && (
            <div className="vs-logo-check">
              <canvas ref={view} aria-label="Your logo, as it will be used" />
              <small className="vs-kbd">{cut ? (pic.changed ? 'Background taken out — the squares show where it is see-through.' : 'Nothing round the edge looked like a plain background, so it is used as it is.') : 'Used as it is.'}</small>
            </div>
          )}
          {pic && <button type="button" className="vs-btn ai sm" disabled={busy} onClick={() => void use()} data-act="logo-use">{busy ? <Loader size={13} className="spin" /> : <Check size={13} />} Use this logo</button>}
          {steps.length > 0 && (
            <div className="vs-act-micro" data-testid="vs-logo-steps">
              {steps.map(s => (
                <div key={s.step} className={`vs-act-mrow ${s.state}`}>
                  <span className={`vs-act-dot ${s.state}`}>{s.state === 'done' ? <Check size={11} /> : <Loader size={11} className="spin" />}</span><span>{STEP_LABEL[s.step]}</span>
                </div>
              ))}
            </div>
          )}
          {err && <div className="vs-note bad" role="alert"><AlertCircle size={15} /> {err}</div>}
        </div>
      )}

      {logo && (
        <div className="vs-col" style={{ gap: 10 }}>
          <div className="vs-row">
            <label className="vs-rec-check" style={{ fontWeight: 700 }}><input type="checkbox" checked={logo.on} onChange={e => patch({ on: e.target.checked }, e.target.checked ? 'Logo on' : 'Logo off')} data-testid="vs-logo-on" /> Show “{logo.name}”</label>
            <span className="vs-spacer" />
            {!pic && <label className="vs-btn ghost sm">Replace<input type="file" hidden accept="image/*" onChange={e => void choose(e.target.files?.[0])} /></label>}
            <button type="button" className="vs-btn ghost sm danger" aria-label="Remove the logo" onClick={() => void ctx.apply([{ op: 'logo.remove' }], 'Logo removed')}><Trash2 size={13} /></button>
          </div>
          <div className="vs-field-label">Where</div>
          <div className="vs-chips" role="radiogroup" aria-label="Where the logo sits">
            {CORNERS.map(c => <button key={c.key} type="button" className="vs-chip" role="radio" aria-checked={logo.corner === c.key} aria-pressed={logo.corner === c.key}
              onClick={() => patch(c.key === 'custom' ? { corner: 'custom', ...centre(logo) } : { corner: c.key }, `Logo: ${c.label.toLowerCase()}`)} data-corner={c.key}>{c.label}</button>)}
          </div>
          <div className="vs-nudge" aria-label="Move the logo">
            <button type="button" className="vs-btn sm" aria-label="Move up" onClick={e => nudge(0, -1, e.shiftKey)}><ArrowUp size={14} /></button>
            <div className="vs-row" style={{ gap: 4 }}>
              <button type="button" className="vs-btn sm" aria-label="Move left" onClick={e => nudge(-1, 0, e.shiftKey)}><ArrowLeft size={14} /></button>
              <span className="vs-kbd">1% a press · Shift 5%</span>
              <button type="button" className="vs-btn sm" aria-label="Move right" onClick={e => nudge(1, 0, e.shiftKey)}><ArrowRight size={14} /></button>
            </div>
            <button type="button" className="vs-btn sm" aria-label="Move down" onClick={e => nudge(0, 1, e.shiftKey)}><ArrowDown size={14} /></button>
          </div>
          {logo.corner === 'custom' ? (
            <>
              <Slide label="Across" value={logo.x} min={0} max={100} step={0.5} unit="%" onCommit={v => patch({ x: v }, 'Logo moved')} />
              <Slide label="Down" value={logo.y} min={0} max={100} step={0.5} unit="%" onCommit={v => patch({ y: v }, 'Logo moved')} />
            </>
          ) : <Slide label="From the edge" value={logo.margin} min={0} max={15} step={0.5} unit="%" onCommit={v => patch({ margin: v }, 'Logo margin')} />}
          <Slide label="Size" value={logo.size} min={3} max={40} step={0.5} unit="% wide" onCommit={v => patch({ size: v }, 'Logo size')} testid="vs-logo-size" />
          <div className="vs-field-label">Corners</div>
          <div className="vs-chips">
            {[[0, 'Square'], [12, 'Soft'], [25, 'Rounded'], [50, 'Circle / pill']].map(([r, l]) => (
              <button key={r} type="button" className="vs-chip" aria-pressed={logo.radius === r} onClick={() => patch({ radius: Number(r) }, `Logo corners: ${String(l).toLowerCase()}`)}>{l}</button>
            ))}
          </div>
          <Slide label="Roundness" value={logo.radius} min={0} max={50} unit="%" onCommit={v => patch({ radius: v }, 'Logo roundness')} testid="vs-logo-radius" />
          <Slide label="See-through" value={logo.opacity} min={10} max={100} unit="%" onCommit={v => patch({ opacity: v }, 'Logo see-through')} />
          <div className="vs-field-label">On</div>
          <div className="vs-chips">
            {([['all', 'Every video'], ['long', 'Long video'], ['shorts', 'Shorts']] as const).map(([k, l]) => (
              <button key={k} type="button" className="vs-chip" aria-pressed={logo.applyTo === k} onClick={() => patch({ applyTo: k }, `Logo on: ${l.toLowerCase()}`)}>{l}</button>
            ))}
          </div>
          <button type="button" className="vs-btn ghost sm" style={{ justifySelf: 'start' }} onClick={() => patch({ ...LOGO_DEFAULT, on: logo.on }, 'Logo placement reset')}>Reset placement</button>
          <small className="vs-kbd">Shown in the preview now; in the files when each video is made (Export).</small>
        </div>
      )}
    </div>
  );
}
