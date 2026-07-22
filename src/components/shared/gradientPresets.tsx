/**
 * gradientPresets.ts — curated modern background gradients for the Funnel
 * and Website builders' Properties Panels, so users pick a look with one
 * click instead of hand-typing CSS gradient strings.
 */
import type { CSSProperties } from 'react';

export interface GradientPreset { name: string; css: string; }

export const GRADIENT_PRESETS: GradientPreset[] = [
  { name: 'Indigo Violet', css: 'linear-gradient(135deg,#6366f1,#8b5cf6)' },
  { name: 'Sky Indigo',    css: 'linear-gradient(135deg,#0ea5e9,#6366f1)' },
  { name: 'Sunset',        css: 'linear-gradient(135deg,#f59e0b,#ec4899)' },
  { name: 'Emerald Sky',   css: 'linear-gradient(135deg,#10b981,#0ea5e9)' },
  { name: 'Bold Pink',     css: 'linear-gradient(135deg,#ec4899,#8b5cf6)' },
  { name: 'Midnight',      css: 'linear-gradient(135deg,#1e293b,#0f172a)' },
  { name: 'Rose Amber',    css: 'linear-gradient(135deg,#f43f5e,#f59e0b)' },
  { name: 'Teal Tech',     css: 'linear-gradient(135deg,#14b8a6,#3b82f6)' },
];

/** A compact row of clickable gradient swatches, for use inside a Properties Panel. */
export function GradientSwatchRow({ value, onPick }: { value?: string; onPick: (css: string) => void }) {
  const rowStyle: CSSProperties = { display: 'flex', flexWrap: 'wrap', gap: 6, marginTop: 6, marginBottom: 10 };
  return (
    <div style={rowStyle}>
      {GRADIENT_PRESETS.map(p => (
        <button
          key={p.name}
          type="button"
          title={p.name}
          onClick={() => onPick(p.css)}
          style={{
            width: 26, height: 26, borderRadius: 8, cursor: 'pointer', flexShrink: 0,
            background: p.css,
            border: value === p.css ? '2px solid #0f172a' : '2px solid transparent',
            boxShadow: value === p.css ? '0 0 0 2px #fff, 0 0 0 3px #0f172a' : '0 1px 3px rgba(0,0,0,0.15)',
            padding: 0,
          }}
        />
      ))}
    </div>
  );
}
