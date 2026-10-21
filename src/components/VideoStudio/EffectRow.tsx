/**
 * One effect, as a row: its name, an on/off switch, and a settings button
 * that opens its controls in a popover with "Remove effect" at the bottom —
 * the way the owner's reference (Descript's property panel) lays them out.
 *
 * The row only shows and asks; the panel that uses it sends the operation.
 */
import { useEffect, useRef, useState, type ReactNode } from 'react';
import { Settings2, Trash2 } from 'lucide-react';

export function Switch({ on, onChange, label, disabled, field }: { on: boolean; onChange: (on: boolean) => void; label: string; disabled?: boolean; field?: string }) {
  return (
    <button type="button" role="switch" aria-checked={on} aria-label={label} className={`vs-switch ${on ? 'on' : ''}`} disabled={disabled} onClick={() => onChange(!on)} data-field={field}>
      <i />
    </button>
  );
}

export default function EffectRow({ icon, title, on, onToggle, summary, children, onRemove, disabled, why, id }: {
  icon: ReactNode; title: string; on: boolean; onToggle: (on: boolean) => void; summary?: string; children?: ReactNode;
  onRemove?: () => void; disabled?: boolean; why?: string; id: string;
}) {
  const [open, setOpen] = useState(false);
  const box = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const away = (e: PointerEvent) => { if (!box.current?.contains(e.target as Node)) setOpen(false); };
    const esc = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false); };
    document.addEventListener('pointerdown', away);
    document.addEventListener('keydown', esc);
    return () => { document.removeEventListener('pointerdown', away); document.removeEventListener('keydown', esc); };
  }, [open]);
  return (
    <div className={`vs-fx ${on ? 'on' : ''} ${disabled ? 'off' : ''}`} ref={box} data-effect={id}>
      <div className="vs-fx-row">
        <span className="ic" aria-hidden="true">{icon}</span>
        <span className="t"><b>{title}</b>{(why && disabled) || summary ? <small>{disabled && why ? why : summary}</small> : null}</span>
        {children && (
          <button type="button" className="vs-btn ghost sm" aria-label={`${title} settings`} aria-expanded={open} disabled={disabled} onClick={() => setOpen(o => !o)} data-act="fx-settings"><Settings2 size={14} /></button>
        )}
        <Switch on={on} onChange={onToggle} label={title} disabled={disabled} field={`video.fx.${id}`} />
      </div>
      {open && children && (
        <div className="vs-fx-pop" role="dialog" aria-label={`${title} settings`} data-testid={`vs-fx-pop-${id}`}>
          {children}
          {onRemove && <button type="button" className="vs-btn ghost sm danger" onClick={() => { onRemove(); setOpen(false); }} data-act="fx-remove"><Trash2 size={13} /> Remove effect</button>}
        </div>
      )}
    </div>
  );
}

/** A slider that saves on release, not on every pixel — one version per change, not forty. */
export function FxSlider({ label, value, min, max, step = 1, unit = '', onSave, fmt }: { label: string; value: number; min: number; max: number; step?: number; unit?: string; onSave: (v: number) => void; fmt?: (v: number) => string }) {
  const [v, setV] = useState<number | null>(null);
  const shown = v ?? value;
  const save = () => { if (v !== null && v !== value) onSave(v); setV(null); };
  return (
    <label className="vs-slider">
      <span><b>{label}</b><i>{fmt ? fmt(shown) : `${shown > 0 && min < 0 ? '+' : ''}${shown}${unit}`}</i></span>
      <input type="range" min={min} max={max} step={step} value={shown} onChange={e => setV(Number(e.target.value))} onPointerUp={save} onKeyUp={save} onBlur={save} aria-label={label} />
    </label>
  );
}
