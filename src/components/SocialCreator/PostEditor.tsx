import { useState, useRef, useEffect, useCallback } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import {
  ArrowLeft, Type, Image, Square, Smile, Undo2, Redo2, Download,
  Share2, Eye, EyeOff, Lock, Unlock, Trash2, Copy, AlignLeft, AlignCenter,
  AlignRight, Bold, Italic, Underline, ChevronUp, ChevronDown, Layers,
  Palette, Settings, ZoomIn, ZoomOut, RotateCcw, Move, Plus, Check,
  Wand2, X, Save, Maximize2, Minimize2,
} from 'lucide-react';
import { useApp } from '../../context/AppContext';
import type { DesignPost, CanvasElement, CanvasBackground, TextElement, ShapeElement, ImageElement, StickerElement, HistoryEntry } from './types';
import { normalisePost } from './normalise';
import { FONT_FAMILIES, EMOJI_STICKERS, RATIO_SIZES } from './templates';
import { API_BASE } from '../../services/apiBase';

/* ── Helpers ── */
const uid = () => `el-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;


/** Canva-style text effect presets → CSS text-shadow. */
const TEXT_EFFECT_CSS: Record<string, (color: string) => string> = {
  none: () => 'none',
  shadow: () => '2px 4px 10px rgba(0,0,0,0.45)',
  lift: () => '0 10px 28px rgba(0,0,0,0.35)',
  neon: c => `0 0 6px rgba(255,255,255,0.9), 0 0 18px ${c}, 0 0 36px ${c}`,
  echo: c => `4px 4px 0 ${c}55, 8px 8px 0 ${c}2e`,
};

const SHAPE_PATHS: Record<string, (w: number, h: number) => string> = {
  triangle: (w, h) => `M${w / 2},0 L${w},${h} L0,${h} Z`,
  star: (w, h) => {
    const cx = w / 2, cy = h / 2, r1 = Math.min(w, h) / 2, r2 = r1 * 0.4;
    const pts = Array.from({ length: 10 }, (_, i) => {
      const a = (Math.PI / 5) * i - Math.PI / 2;
      const r = i % 2 === 0 ? r1 : r2;
      return `${cx + r * Math.cos(a)},${cy + r * Math.sin(a)}`;
    });
    return `M${pts.join(' L')} Z`;
  },
  diamond: (w, h) => `M${w / 2},0 L${w},${h / 2} L${w / 2},${h} L0,${h / 2} Z`,
  heart: (w, h) => `M${w / 2},${h * 0.3} C${w / 2},${-h * 0.05} ${w},${-h * 0.05} ${w},${h * 0.3} C${w},${h * 0.65} ${w / 2},${h * 0.9} ${w / 2},${h} C${w / 2},${h * 0.9} 0,${h * 0.65} 0,${h * 0.3} C0,${-h * 0.05} ${w / 2},${-h * 0.05} ${w / 2},${h * 0.3} Z`,
  hexagon: (w, h) => {
    const pts = Array.from({ length: 6 }, (_, i) => {
      const a = (Math.PI / 3) * i - Math.PI / 6;
      return `${w / 2 + w / 2 * Math.cos(a)},${h / 2 + h / 2 * Math.sin(a)}`;
    });
    return `M${pts.join(' L')} Z`;
  },
  arrow: (w, h) => `M0,${h * 0.3} L${w * 0.6},${h * 0.3} L${w * 0.6},0 L${w},${h * 0.5} L${w * 0.6},${h} L${w * 0.6},${h * 0.7} L0,${h * 0.7} Z`,
};

function renderShapeSVG(el: CanvasElement) {
  const d = el.data as ShapeElement;
  const { width: w, height: h } = el;
  const common = { width: w, height: h, style: { display: 'block' } };

  if (d.shapeType === 'rect') {
    return <svg {...common}><rect x={0} y={0} width={w} height={h} fill={d.fill} stroke={d.stroke} strokeWidth={d.strokeWidth} opacity={d.opacity} /></svg>;
  }
  if (d.shapeType === 'rounded-rect') {
    return <svg {...common}><rect x={0} y={0} width={w} height={h} rx={Math.min(w, h) * 0.12} fill={d.fill} stroke={d.stroke} strokeWidth={d.strokeWidth} opacity={d.opacity} /></svg>;
  }
  if (d.shapeType === 'circle') {
    return <svg {...common}><ellipse cx={w / 2} cy={h / 2} rx={w / 2} ry={h / 2} fill={d.fill} stroke={d.stroke} strokeWidth={d.strokeWidth} opacity={d.opacity} /></svg>;
  }
  if (d.shapeType === 'line') {
    return <svg {...common}><line x1={0} y1={h / 2} x2={w} y2={h / 2} stroke={d.fill || d.stroke} strokeWidth={Math.max(d.strokeWidth, 3)} opacity={d.opacity} strokeLinecap="round" /></svg>;
  }
  const path = SHAPE_PATHS[d.shapeType]?.(w, h);
  if (path) return <svg {...common}><path d={path} fill={d.fill} stroke={d.stroke} strokeWidth={d.strokeWidth} opacity={d.opacity} /></svg>;
  return <svg {...common}><rect x={0} y={0} width={w} height={h} fill={d.fill} stroke={d.stroke} strokeWidth={d.strokeWidth} opacity={d.opacity} /></svg>;
}

/* ── Canvas Element Renderer ── */
function CanvasElementView({
  el, selected, onSelect, onStartDrag, onStartResize, onStartRotate, editingId, onDblClick, onTextChange,
}: {
  el: CanvasElement;
  selected: boolean;
  onSelect: (id: string, e: React.PointerEvent) => void;
  onStartDrag: (id: string, e: React.PointerEvent) => void;
  onStartResize: (id: string, handle: string, e: React.PointerEvent) => void;
  onStartRotate: (id: string, e: React.PointerEvent) => void;
  editingId: string | null;
  onDblClick: (id: string) => void;
  onTextChange: (id: string, text: string) => void;
}) {
  const d = el.data;

  const containerStyle: React.CSSProperties = {
    position: 'absolute',
    left: el.x,
    top: el.y,
    width: el.width,
    height: el.height,
    transform: `rotate(${el.rotation}deg)`,
    transformOrigin: 'center center',
    cursor: el.locked ? 'not-allowed' : 'move',
    userSelect: 'none',
    outline: selected ? '2px solid #6366f1' : 'none',
    boxSizing: 'border-box',
    visibility: el.visible ? 'visible' : 'hidden',
    zIndex: el.zIndex,
  };

  const content = (() => {
    if (d.kind === 'text') {
      const td = d as TextElement;
      const isEditing = editingId === el.id;
      const textStyle: React.CSSProperties = {
        width: '100%', height: '100%', fontSize: td.fontSize, fontFamily: td.fontFamily,
        color: td.color, fontWeight: td.fontWeight as any, fontStyle: td.fontStyle,
        textAlign: td.textAlign, lineHeight: td.lineHeight, letterSpacing: td.letterSpacing,
        textDecoration: td.textDecoration, whiteSpace: 'pre-wrap', overflow: 'hidden',
        textTransform: td.uppercase ? 'uppercase' : 'none',
        textShadow: td.effect && td.effect !== 'none' ? TEXT_EFFECT_CSS[td.effect](td.color) : (td.textShadow ?? 'none'),
        backgroundColor: td.backgroundColor ?? 'transparent',
        padding: td.padding ?? 0,
        borderRadius: td.borderRadius ?? 0,
        wordBreak: 'break-word',
        boxSizing: 'border-box',
      };
      if (isEditing) {
        // Use a textarea overlay when editing to avoid contentEditable sync issues
        return (
          <textarea
            autoFocus
            defaultValue={td.text}
            onBlur={e => onTextChange(el.id, e.currentTarget.value)}
            onKeyDown={e => { if (e.key === 'Escape') { onTextChange(el.id, e.currentTarget.value); e.currentTarget.blur(); } e.stopPropagation(); }}
            style={{
              ...textStyle, resize: 'none', border: 'none', outline: '2px solid #a5b4fc',
              cursor: 'text', background: td.backgroundColor ?? 'transparent',
              overflowY: 'hidden', fontFamily: td.fontFamily,
            }}
          />
        );
      }
      return (
        <div
          style={{ ...textStyle, outline: 'none', cursor: 'move' }}
          onPointerDown={e => e.preventDefault()}
        >
          {td.text}
        </div>
      );
    }
    if (d.kind === 'image') {
      const id = d as ImageElement;
      return (
        <img
          src={id.src} alt=""
          style={{ width: '100%', height: '100%', objectFit: id.objectFit, opacity: id.opacity, borderRadius: id.borderRadius, border: id.border ?? 'none', filter: id.filter ?? 'none', display: 'block' }}
          draggable={false}
        />
      );
    }
    if (d.kind === 'shape') return renderShapeSVG(el);
    if (d.kind === 'sticker') {
      const sd = d as StickerElement;
      return <div style={{ width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: sd.fontSize, lineHeight: 1, userSelect: 'none' }}>{sd.emoji}</div>;
    }
    return null;
  })();

  const handles = ['nw', 'n', 'ne', 'e', 'se', 's', 'sw', 'w'];
  const handlePos: Record<string, React.CSSProperties> = {
    nw: { top: -5, left: -5 }, n: { top: -5, left: '50%', transform: 'translateX(-50%)' },
    ne: { top: -5, right: -5 }, e: { top: '50%', right: -5, transform: 'translateY(-50%)' },
    se: { bottom: -5, right: -5 }, s: { bottom: -5, left: '50%', transform: 'translateX(-50%)' },
    sw: { bottom: -5, left: -5 }, w: { top: '50%', left: -5, transform: 'translateY(-50%)' },
  };

  return (
    <div
      style={containerStyle}
      onPointerDown={e => { if (!el.locked && editingId !== el.id) { onSelect(el.id, e); onStartDrag(el.id, e); } }}
      onDoubleClick={() => onDblClick(el.id)}
    >
      {content}
      {selected && !el.locked && (
        <>
          {handles.map(h => (
            <div
              key={h}
              onPointerDown={e => { e.stopPropagation(); onStartResize(el.id, h, e); }}
              style={{
                position: 'absolute', width: 10, height: 10, background: '#6366f1',
                border: '2px solid #fff', borderRadius: 2, cursor: `${h}-resize`, zIndex: 100, ...handlePos[h],
              }}
            />
          ))}
          {/* Rotate handle */}
          <div
            onPointerDown={e => { e.stopPropagation(); onStartRotate(el.id, e); }}
            style={{
              position: 'absolute', top: -30, left: '50%', transform: 'translateX(-50%)',
              width: 16, height: 16, background: '#6366f1', border: '2px solid #fff', borderRadius: '50%',
              cursor: 'grab', zIndex: 100, display: 'flex', alignItems: 'center', justifyContent: 'center',
            }}
          >
            <RotateCcw size={9} color="#fff" />
          </div>
        </>
      )}
    </div>
  );
}

/* ── Background Renderer ── */
function CanvasBg({ bg, width, height }: { bg: CanvasBackground; width: number; height: number }) {
  let style: React.CSSProperties = { position: 'absolute', inset: 0, width, height };
  if (bg.type === 'gradient') {
    style.background = `linear-gradient(${bg.gradientAngle}deg, ${bg.gradientStart}, ${bg.gradientEnd})`;
  } else if (bg.type === 'color') {
    style.backgroundColor = bg.color;
  } else if (bg.imageUrl) {
    style.backgroundImage = `url(${bg.imageUrl})`;
    style.backgroundSize = bg.imageFit === 'contain' ? 'contain' : bg.imageFit === 'fill' ? '100% 100%' : 'cover';
    style.backgroundPosition = 'center';
    style.backgroundRepeat = 'no-repeat';
  }
  return <div style={style} />;
}

/* ── Color Swatch Picker ── */
function ColorPicker({ value, onChange, label }: { value: string; onChange: (v: string) => void; label?: string }) {
  const SWATCHES = [
    '#ffffff', '#000000', '#f8fafc', '#1e293b', '#ef4444', '#f97316', '#f59e0b', '#eab308',
    '#22c55e', '#10b981', '#06b6d4', '#0ea5e9', '#3b82f6', '#6366f1', '#8b5cf6', '#a855f7',
    '#ec4899', '#f43f5e', '#64748b', '#94a3b8', '#fce7f3', '#ede9fe', '#dbeafe', '#dcfce7',
    '#ffd700', '#ff6b35', '#1da1f2', '#0a66c2', '#ff0050', '#ff0000',
  ];
  return (
    <div>
      {label && <div style={{ fontSize: 12, fontWeight: 600, color: '#374151', marginBottom: 6 }}>{label}</div>}
      <div style={{ display: 'flex', gap: 6, alignItems: 'center', marginBottom: 8 }}>
        <div style={{ width: 32, height: 32, borderRadius: 6, background: value, border: '2px solid #e2e8f0', flexShrink: 0 }} />
        <input type="color" value={value} onChange={e => onChange(e.target.value)}
          style={{ width: 32, height: 32, border: 'none', padding: 0, cursor: 'pointer', background: 'none' }} />
        <input type="text" value={value} onChange={e => onChange(e.target.value)}
          style={{ flex: 1, padding: '4px 8px', border: '1px solid #e2e8f0', borderRadius: 6, fontSize: 12, fontFamily: 'monospace', outline: 'none' }} />
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(10, 1fr)', gap: 3 }}>
        {SWATCHES.map(s => (
          <div key={s} onClick={() => onChange(s)}
            style={{ width: 20, height: 20, borderRadius: 4, background: s, border: value === s ? '2px solid #6366f1' : '1px solid #e2e8f0', cursor: 'pointer' }} />
        ))}
      </div>
    </div>
  );
}

/* ── Properties Panel ── */
function PropertiesPanel({
  el, onUpdate, onDelete, onDuplicate, onMoveZ,
}: {
  el: CanvasElement | null;
  onUpdate: (id: string, updates: Partial<CanvasElement>) => void;
  onDelete: (id: string) => void;
  onDuplicate: (id: string) => void;
  onMoveZ: (id: string, dir: 'up' | 'down' | 'top' | 'bottom') => void;
}) {
  if (!el) return (
    <div style={{ padding: 20, color: '#94a3b8', textAlign: 'center', fontSize: 13 }}>
      <Layers size={32} style={{ margin: '0 auto 8px', display: 'block', opacity: 0.3 }} />
      <p style={{ margin: 0 }}>Select an element to edit its properties</p>
    </div>
  );

  const updateData = (updates: any) => onUpdate(el.id, { data: { ...el.data, ...updates } });
  const d = el.data;

  return (
    <div style={{ padding: '16px' }}>
      {/* Element actions */}
      <div style={{ display: 'flex', gap: 4, marginBottom: 16, flexWrap: 'wrap' }}>
        {[
          { icon: <Copy size={13} />, title: 'Duplicate', fn: () => onDuplicate(el.id) },
          { icon: <Trash2 size={13} />, title: 'Delete', fn: () => onDelete(el.id) },
          { icon: <ChevronUp size={13} />, title: 'Bring Up', fn: () => onMoveZ(el.id, 'up') },
          { icon: <ChevronDown size={13} />, title: 'Send Down', fn: () => onMoveZ(el.id, 'down') },
          { icon: el.locked ? <Lock size={13} /> : <Unlock size={13} />, title: el.locked ? 'Unlock' : 'Lock', fn: () => onUpdate(el.id, { locked: !el.locked }) },
          { icon: el.visible ? <Eye size={13} /> : <EyeOff size={13} />, title: el.visible ? 'Hide' : 'Show', fn: () => onUpdate(el.id, { visible: !el.visible }) },
        ].map(btn => (
          <button key={btn.title} onClick={btn.fn} title={btn.title}
            style={{ flex: '1 1 calc(33% - 4px)', padding: '6px 4px', border: '1px solid #e2e8f0', borderRadius: 6, background: '#fff', cursor: 'pointer', fontSize: 11, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 3, color: btn.title === 'Delete' ? '#ef4444' : '#374151' }}>
            {btn.icon}
            <span>{btn.title}</span>
          </button>
        ))}
      </div>

      {/* Position & Size */}
      <div style={{ marginBottom: 16, borderTop: '1px solid #f1f5f9', paddingTop: 14 }}>
        <div style={{ fontSize: 12, fontWeight: 700, color: '#374151', marginBottom: 10, textTransform: 'uppercase', letterSpacing: 0.5 }}>Transform</div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
          {[
            { label: 'X', key: 'x', val: Math.round(el.x) },
            { label: 'Y', key: 'y', val: Math.round(el.y) },
            { label: 'W', key: 'width', val: Math.round(el.width) },
            { label: 'H', key: 'height', val: Math.round(el.height) },
          ].map(f => (
            <div key={f.key}>
              <label style={{ fontSize: 11, color: '#64748b', display: 'block', marginBottom: 3 }}>{f.label}</label>
              <input type="number" value={f.val}
                onChange={e => onUpdate(el.id, { [f.key]: Number(e.target.value) })}
                style={{ width: '100%', padding: '5px 8px', border: '1px solid #e2e8f0', borderRadius: 6, fontSize: 13, outline: 'none', boxSizing: 'border-box' }} />
            </div>
          ))}
        </div>
        <div style={{ marginTop: 8 }}>
          <label style={{ fontSize: 11, color: '#64748b', display: 'block', marginBottom: 3 }}>Rotation (°)</label>
          <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
            <input type="range" min={-180} max={180} value={el.rotation}
              onChange={e => onUpdate(el.id, { rotation: Number(e.target.value) })}
              style={{ flex: 1 }} />
            <input type="number" value={Math.round(el.rotation)}
              onChange={e => onUpdate(el.id, { rotation: Number(e.target.value) })}
              style={{ width: 52, padding: '5px 8px', border: '1px solid #e2e8f0', borderRadius: 6, fontSize: 13, outline: 'none' }} />
          </div>
        </div>
      </div>

      {/* TEXT PROPERTIES */}
      {d.kind === 'text' && (() => {
        const td = d as TextElement;
        return (
          <div>
            <div style={{ fontSize: 12, fontWeight: 700, color: '#374151', marginBottom: 10, textTransform: 'uppercase', letterSpacing: 0.5, borderTop: '1px solid #f1f5f9', paddingTop: 14 }}>Text</div>
            <textarea
              value={td.text}
              onChange={e => updateData({ text: e.target.value })}
              rows={3}
              style={{ width: '100%', padding: '8px', border: '1px solid #e2e8f0', borderRadius: 6, fontSize: 13, resize: 'vertical', outline: 'none', boxSizing: 'border-box', fontFamily: 'inherit', marginBottom: 10 }}
            />
            <div style={{ marginBottom: 10 }}>
              <label style={{ fontSize: 11, color: '#64748b', display: 'block', marginBottom: 4 }}>Font</label>
              <select value={td.fontFamily} onChange={e => updateData({ fontFamily: e.target.value })}
                style={{ width: '100%', padding: '7px 10px', border: '1px solid #e2e8f0', borderRadius: 6, fontSize: 13, outline: 'none', boxSizing: 'border-box', fontFamily: td.fontFamily }}>
                {FONT_FAMILIES.map(f => <option key={f} value={f} style={{ fontFamily: f }}>{f}</option>)}
              </select>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginBottom: 10 }}>
              <div>
                <label style={{ fontSize: 11, color: '#64748b', display: 'block', marginBottom: 3 }}>Size</label>
                <input type="number" value={td.fontSize} min={6} max={200}
                  onChange={e => updateData({ fontSize: Number(e.target.value) })}
                  style={{ width: '100%', padding: '5px 8px', border: '1px solid #e2e8f0', borderRadius: 6, fontSize: 13, outline: 'none', boxSizing: 'border-box' }} />
              </div>
              <div>
                <label style={{ fontSize: 11, color: '#64748b', display: 'block', marginBottom: 3 }}>Weight</label>
                <select value={td.fontWeight} onChange={e => updateData({ fontWeight: e.target.value })}
                  style={{ width: '100%', padding: '5px 8px', border: '1px solid #e2e8f0', borderRadius: 6, fontSize: 13, outline: 'none', boxSizing: 'border-box' }}>
                  {['300', 'normal', '500', '600', '700', '800', '900'].map(w => <option key={w} value={w}>{w}</option>)}
                </select>
              </div>
            </div>
            <div style={{ display: 'flex', gap: 4, marginBottom: 10 }}>
              {[
                { icon: <Bold size={14} />, key: 'fontWeight', on: '700', off: 'normal', active: td.fontWeight === '700' || td.fontWeight === '800' || td.fontWeight === '900' || td.fontWeight === 'bold' },
                { icon: <Italic size={14} />, key: 'fontStyle', on: 'italic', off: 'normal', active: td.fontStyle === 'italic' },
                { icon: <Underline size={14} />, key: 'textDecoration', on: 'underline', off: 'none', active: td.textDecoration === 'underline' },
              ].map(btn => (
                <button key={btn.key} onClick={() => updateData({ [btn.key]: btn.active ? btn.off : btn.on })}
                  style={{ width: 34, height: 34, border: '1px solid', borderRadius: 6, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', borderColor: btn.active ? '#6366f1' : '#e2e8f0', background: btn.active ? '#ede9fe' : '#fff', color: btn.active ? '#6366f1' : '#374151' }}>
                  {btn.icon}
                </button>
              ))}
              {[
                { icon: <AlignLeft size={14} />, val: 'left' },
                { icon: <AlignCenter size={14} />, val: 'center' },
                { icon: <AlignRight size={14} />, val: 'right' },
              ].map(btn => (
                <button key={btn.val} onClick={() => updateData({ textAlign: btn.val })}
                  style={{ width: 34, height: 34, border: '1px solid', borderRadius: 6, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', borderColor: td.textAlign === btn.val ? '#6366f1' : '#e2e8f0', background: td.textAlign === btn.val ? '#ede9fe' : '#fff', color: td.textAlign === btn.val ? '#6366f1' : '#374151' }}>
                  {btn.icon}
                </button>
              ))}
              <button onClick={() => updateData({ uppercase: !td.uppercase })}
                style={{ padding: '0 8px', height: 34, border: '1px solid', borderRadius: 6, cursor: 'pointer', fontSize: 11, fontWeight: 700, borderColor: td.uppercase ? '#6366f1' : '#e2e8f0', background: td.uppercase ? '#ede9fe' : '#fff', color: td.uppercase ? '#6366f1' : '#374151' }}>AA</button>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginBottom: 10 }}>
              <div>
                <label style={{ fontSize: 11, color: '#64748b', display: 'block', marginBottom: 3 }}>Line Height</label>
                <input type="number" value={td.lineHeight} min={0.8} max={4} step={0.1}
                  onChange={e => updateData({ lineHeight: Number(e.target.value) })}
                  style={{ width: '100%', padding: '5px 8px', border: '1px solid #e2e8f0', borderRadius: 6, fontSize: 13, outline: 'none', boxSizing: 'border-box' }} />
              </div>
              <div>
                <label style={{ fontSize: 11, color: '#64748b', display: 'block', marginBottom: 3 }}>Spacing</label>
                <input type="number" value={td.letterSpacing} min={-5} max={20}
                  onChange={e => updateData({ letterSpacing: Number(e.target.value) })}
                  style={{ width: '100%', padding: '5px 8px', border: '1px solid #e2e8f0', borderRadius: 6, fontSize: 13, outline: 'none', boxSizing: 'border-box' }} />
              </div>
            </div>
            <ColorPicker label="Text Color" value={td.color} onChange={v => updateData({ color: v })} />
            <div style={{ marginTop: 12 }}>
              <label style={{ fontSize: 11, color: '#64748b', display: 'block', marginBottom: 4 }}>Effects</label>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: 4 }}>
                {(['none', 'shadow', 'lift', 'neon', 'echo'] as const).map(fx => (
                  <button key={fx} onClick={() => updateData({ effect: fx })}
                    style={{ padding: '7px 2px', border: '1px solid', borderRadius: 6, background: (td.effect ?? 'none') === fx ? '#ede9fe' : '#fff', borderColor: (td.effect ?? 'none') === fx ? '#6366f1' : '#e2e8f0', cursor: 'pointer', fontSize: 10, textTransform: 'capitalize', color: '#374151' }}>
                    {fx}
                  </button>
                ))}
              </div>
            </div>
            <div style={{ marginTop: 12 }}>
              <label style={{ fontSize: 11, color: '#64748b', display: 'block', marginBottom: 4 }}>Background Color</label>
              <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                <div style={{ width: 28, height: 28, borderRadius: 6, background: td.backgroundColor ?? 'transparent', border: '1px solid #e2e8f0' }} />
                <input type="color" value={td.backgroundColor ?? '#ffffff'}
                  onChange={e => updateData({ backgroundColor: e.target.value })}
                  style={{ width: 28, height: 28, border: 'none', padding: 0, cursor: 'pointer' }} />
                <button onClick={() => updateData({ backgroundColor: undefined })}
                  style={{ padding: '4px 10px', border: '1px solid #e2e8f0', borderRadius: 6, background: '#fff', cursor: 'pointer', fontSize: 12 }}>Clear</button>
              </div>
            </div>
          </div>
        );
      })()}

      {/* SHAPE PROPERTIES */}
      {d.kind === 'shape' && (() => {
        const sd = d as ShapeElement;
        return (
          <div>
            <div style={{ fontSize: 12, fontWeight: 700, color: '#374151', marginBottom: 10, textTransform: 'uppercase', letterSpacing: 0.5, borderTop: '1px solid #f1f5f9', paddingTop: 14 }}>Shape</div>
            <div style={{ marginBottom: 12 }}>
              <label style={{ fontSize: 11, color: '#64748b', display: 'block', marginBottom: 4 }}>Type</label>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: 4 }}>
                {(['rect', 'rounded-rect', 'circle', 'triangle', 'star', 'diamond', 'arrow', 'line', 'heart', 'hexagon'] as const).map(s => (
                  <button key={s} onClick={() => updateData({ shapeType: s })}
                    style={{ padding: '6px 4px', border: '1px solid', borderRadius: 6, background: sd.shapeType === s ? '#ede9fe' : '#fff', borderColor: sd.shapeType === s ? '#6366f1' : '#e2e8f0', cursor: 'pointer', fontSize: 10 }}>
                    {s === 'rounded-rect' ? 'rRect' : s}
                  </button>
                ))}
              </div>
            </div>
            <div style={{ marginBottom: 12 }}>
              <label style={{ fontSize: 11, color: '#64748b', display: 'block', marginBottom: 4 }}>Opacity</label>
              <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                <input type="range" min={0} max={1} step={0.01} value={sd.opacity} onChange={e => updateData({ opacity: Number(e.target.value) })} style={{ flex: 1 }} />
                <span style={{ fontSize: 12, color: '#374151', minWidth: 36 }}>{Math.round(sd.opacity * 100)}%</span>
              </div>
            </div>
            <ColorPicker label="Fill Color" value={sd.fill} onChange={v => updateData({ fill: v })} />
            <div style={{ marginTop: 12 }}>
              <ColorPicker label="Stroke Color" value={sd.stroke} onChange={v => updateData({ stroke: v })} />
              <div style={{ marginTop: 8 }}>
                <label style={{ fontSize: 11, color: '#64748b', display: 'block', marginBottom: 3 }}>Stroke Width</label>
                <input type="number" value={sd.strokeWidth} min={0} max={20}
                  onChange={e => updateData({ strokeWidth: Number(e.target.value) })}
                  style={{ width: '100%', padding: '5px 8px', border: '1px solid #e2e8f0', borderRadius: 6, fontSize: 13, outline: 'none', boxSizing: 'border-box' }} />
              </div>
            </div>
          </div>
        );
      })()}

      {/* IMAGE PROPERTIES */}
      {d.kind === 'image' && (() => {
        const id = d as ImageElement;
        return (
          <div>
            <div style={{ fontSize: 12, fontWeight: 700, color: '#374151', marginBottom: 10, textTransform: 'uppercase', letterSpacing: 0.5, borderTop: '1px solid #f1f5f9', paddingTop: 14 }}>Image</div>
            <div style={{ marginBottom: 10 }}>
              <label style={{ fontSize: 11, color: '#64748b', display: 'block', marginBottom: 4 }}>Fit</label>
              <div style={{ display: 'flex', gap: 4 }}>
                {(['cover', 'contain', 'fill'] as const).map(f => (
                  <button key={f} onClick={() => updateData({ objectFit: f })}
                    style={{ flex: 1, padding: '6px', border: '1px solid', borderRadius: 6, background: id.objectFit === f ? '#ede9fe' : '#fff', borderColor: id.objectFit === f ? '#6366f1' : '#e2e8f0', cursor: 'pointer', fontSize: 11 }}>{f}</button>
                ))}
              </div>
            </div>
            <div style={{ marginBottom: 10 }}>
              <label style={{ fontSize: 11, color: '#64748b', display: 'block', marginBottom: 3 }}>Opacity</label>
              <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                <input type="range" min={0} max={1} step={0.01} value={id.opacity} onChange={e => updateData({ opacity: Number(e.target.value) })} style={{ flex: 1 }} />
                <span style={{ fontSize: 12, minWidth: 36 }}>{Math.round(id.opacity * 100)}%</span>
              </div>
            </div>
            <div style={{ marginBottom: 10 }}>
              <label style={{ fontSize: 11, color: '#64748b', display: 'block', marginBottom: 3 }}>Border Radius</label>
              <input type="number" value={id.borderRadius} min={0} max={200}
                onChange={e => updateData({ borderRadius: Number(e.target.value) })}
                style={{ width: '100%', padding: '5px 8px', border: '1px solid #e2e8f0', borderRadius: 6, fontSize: 13, outline: 'none', boxSizing: 'border-box' }} />
            </div>
            <div style={{ marginBottom: 10 }}>
              <label style={{ fontSize: 11, color: '#64748b', display: 'block', marginBottom: 4 }}>Filter</label>
              <select value={id.filter ?? 'none'} onChange={e => updateData({ filter: e.target.value === 'none' ? undefined : e.target.value })}
                style={{ width: '100%', padding: '7px 10px', border: '1px solid #e2e8f0', borderRadius: 6, fontSize: 13, outline: 'none' }}>
                <option value="none">None</option>
                <option value="grayscale(100%)">Grayscale</option>
                <option value="sepia(100%)">Sepia</option>
                <option value="blur(2px)">Blur</option>
                <option value="brightness(1.3)">Bright</option>
                <option value="contrast(1.5)">Contrast</option>
                <option value="hue-rotate(90deg)">Hue Rotate</option>
                <option value="saturate(2)">Saturate</option>
              </select>
            </div>
          </div>
        );
      })()}

      {/* STICKER PROPERTIES */}
      {d.kind === 'sticker' && (() => {
        const sd = d as StickerElement;
        return (
          <div>
            <div style={{ fontSize: 12, fontWeight: 700, color: '#374151', marginBottom: 10, textTransform: 'uppercase', letterSpacing: 0.5, borderTop: '1px solid #f1f5f9', paddingTop: 14 }}>Sticker</div>
            <div style={{ marginBottom: 10 }}>
              <label style={{ fontSize: 11, color: '#64748b', display: 'block', marginBottom: 4 }}>Size</label>
              <input type="number" value={sd.fontSize} min={20} max={200}
                onChange={e => updateData({ fontSize: Number(e.target.value) })}
                style={{ width: '100%', padding: '5px 8px', border: '1px solid #e2e8f0', borderRadius: 6, fontSize: 13, outline: 'none', boxSizing: 'border-box' }} />
            </div>
            <div style={{ display: 'flex', gap: 2, flexWrap: 'wrap' }}>
              {EMOJI_STICKERS.map(em => (
                <button key={em} onClick={() => updateData({ emoji: em })}
                  style={{ width: 34, height: 34, border: sd.emoji === em ? '2px solid #6366f1' : '1px solid #e2e8f0', borderRadius: 6, background: sd.emoji === em ? '#ede9fe' : '#fff', cursor: 'pointer', fontSize: 18, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  {em}
                </button>
              ))}
            </div>
          </div>
        );
      })()}
    </div>
  );
}

/* ── Background Panel ── */
function BackgroundPanel({ bg, onUpdate }: { bg: CanvasBackground; onUpdate: (b: Partial<CanvasBackground>) => void }) {
  const [bgTab, setBgTab] = useState<'color' | 'gradient' | 'image'>(bg.type);
  const fileRef = useRef<HTMLInputElement>(null);

  const handleImageUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = ev => { if (ev.target?.result) onUpdate({ type: 'image', imageUrl: ev.target.result as string }); };
    reader.readAsDataURL(file);
  };

  return (
    <div style={{ padding: 16 }}>
      <div style={{ fontSize: 12, fontWeight: 700, color: '#374151', marginBottom: 12, textTransform: 'uppercase', letterSpacing: 0.5 }}>Background</div>
      <div style={{ display: 'flex', gap: 4, marginBottom: 16 }}>
        {(['color', 'gradient', 'image'] as const).map(t => (
          <button key={t} onClick={() => { setBgTab(t); onUpdate({ type: t }); }}
            style={{ flex: 1, padding: '7px 4px', border: '1px solid', borderRadius: 6, background: bgTab === t ? '#6366f1' : '#fff', borderColor: bgTab === t ? '#6366f1' : '#e2e8f0', color: bgTab === t ? '#fff' : '#64748b', fontSize: 12, cursor: 'pointer', fontWeight: bgTab === t ? 600 : 400 }}>
            {t === 'color' ? 'Solid' : t === 'gradient' ? 'Gradient' : 'Image'}
          </button>
        ))}
      </div>
      {bgTab === 'color' && <ColorPicker label="Color" value={bg.color} onChange={v => onUpdate({ type: 'color', color: v })} />}
      {bgTab === 'gradient' && (
        <div>
          <ColorPicker label="Start Color" value={bg.gradientStart} onChange={v => onUpdate({ gradientStart: v })} />
          <div style={{ marginTop: 12 }}>
            <ColorPicker label="End Color" value={bg.gradientEnd} onChange={v => onUpdate({ gradientEnd: v })} />
          </div>
          <div style={{ marginTop: 12 }}>
            <label style={{ fontSize: 11, color: '#64748b', display: 'block', marginBottom: 3 }}>Angle</label>
            <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
              <input type="range" min={0} max={360} value={bg.gradientAngle} onChange={e => onUpdate({ gradientAngle: Number(e.target.value) })} style={{ flex: 1 }} />
              <span style={{ fontSize: 12, minWidth: 36 }}>{bg.gradientAngle}°</span>
            </div>
          </div>
          <div style={{ marginTop: 8, height: 60, borderRadius: 8, background: `linear-gradient(${bg.gradientAngle}deg, ${bg.gradientStart}, ${bg.gradientEnd})` }} />
        </div>
      )}
      {bgTab === 'image' && (
        <div>
          <button onClick={() => fileRef.current?.click()}
            style={{ width: '100%', padding: '10px', border: '2px dashed #e2e8f0', borderRadius: 8, background: '#f8fafc', cursor: 'pointer', fontSize: 13, color: '#64748b' }}>
            Upload Image
          </button>
          <input ref={fileRef} type="file" accept="image/*" onChange={handleImageUpload} style={{ display: 'none' }} />
          {bg.imageUrl && (
            <div style={{ marginTop: 10 }}>
              <img src={bg.imageUrl} alt="" style={{ width: '100%', borderRadius: 6, objectFit: 'cover', maxHeight: 100 }} />
              <div style={{ marginTop: 6 }}>
                <label style={{ fontSize: 11, color: '#64748b', display: 'block', marginBottom: 3 }}>Fit</label>
                <div style={{ display: 'flex', gap: 4 }}>
                  {(['cover', 'contain', 'fill'] as const).map(f => (
                    <button key={f} onClick={() => onUpdate({ imageFit: f })}
                      style={{ flex: 1, padding: '5px', border: '1px solid', borderRadius: 6, background: bg.imageFit === f ? '#ede9fe' : '#fff', borderColor: bg.imageFit === f ? '#6366f1' : '#e2e8f0', cursor: 'pointer', fontSize: 11 }}>{f}</button>
                  ))}
                </div>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

/* ── Layers Panel ── */
function LayersPanel({ elements, selectedId, onSelect, onUpdate, onDelete, onReorder }: {
  elements: CanvasElement[];
  selectedId: string | null;
  onSelect: (id: string) => void;
  onUpdate: (id: string, u: Partial<CanvasElement>) => void;
  onDelete: (id: string) => void;
  onReorder: (from: number, to: number) => void;
}) {
  const sorted = [...elements].sort((a, b) => b.zIndex - a.zIndex);

  const ICONS: Record<string, React.ReactNode> = {
    text: <Type size={12} />,
    image: <Image size={12} />,
    shape: <Square size={12} />,
    sticker: <Smile size={12} />,
  };

  const getLabel = (el: CanvasElement) => {
    if (el.data.kind === 'text') return (el.data as TextElement).text.slice(0, 20) || 'Text';
    if (el.data.kind === 'sticker') return (el.data as StickerElement).emoji + ' Sticker';
    if (el.data.kind === 'shape') return (el.data as ShapeElement).shapeType;
    return 'Image';
  };

  return (
    <div style={{ padding: '12px 16px' }}>
      <div style={{ fontSize: 12, fontWeight: 700, color: '#374151', marginBottom: 10, textTransform: 'uppercase', letterSpacing: 0.5 }}>Layers ({elements.length})</div>
      {sorted.length === 0 && <p style={{ fontSize: 12, color: '#94a3b8', margin: 0 }}>No elements yet</p>}
      {sorted.map((el, i) => (
        <div key={el.id}
          onClick={() => onSelect(el.id)}
          style={{
            display: 'flex', alignItems: 'center', gap: 8, padding: '7px 8px', borderRadius: 6, marginBottom: 2,
            background: selectedId === el.id ? '#ede9fe' : 'transparent', cursor: 'pointer',
          }}
          onMouseEnter={e => { if (selectedId !== el.id) e.currentTarget.style.background = '#f8fafc'; }}
          onMouseLeave={e => { if (selectedId !== el.id) e.currentTarget.style.background = 'transparent'; }}
        >
          <span style={{ color: selectedId === el.id ? '#6366f1' : '#94a3b8' }}>{ICONS[el.type]}</span>
          <span style={{ flex: 1, fontSize: 12, color: selectedId === el.id ? '#6366f1' : '#374151', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {getLabel(el)}
          </span>
          <button onClick={e => { e.stopPropagation(); onUpdate(el.id, { visible: !el.visible }); }}
            style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 2, color: el.visible ? '#94a3b8' : '#e2e8f0' }}>
            {el.visible ? <Eye size={12} /> : <EyeOff size={12} />}
          </button>
          <button onClick={e => { e.stopPropagation(); onDelete(el.id); }}
            style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 2, color: '#ef4444' }}>
            <Trash2 size={12} />
          </button>
        </div>
      ))}
    </div>
  );
}

/* ── Export Canvas to PNG ── */
async function exportToPNG(post: DesignPost): Promise<void> {
  const SCALE = 2;
  const canvas = document.createElement('canvas');
  canvas.width = post.canvasWidth * SCALE;
  canvas.height = post.canvasHeight * SCALE;
  const ctx = canvas.getContext('2d')!;
  ctx.scale(SCALE, SCALE);

  // Draw background
  const bg = post.background;
  if (bg.type === 'color') {
    ctx.fillStyle = bg.color;
    ctx.fillRect(0, 0, post.canvasWidth, post.canvasHeight);
  } else if (bg.type === 'gradient') {
    const grad = ctx.createLinearGradient(
      post.canvasWidth / 2 + post.canvasWidth / 2 * Math.cos((bg.gradientAngle - 90) * Math.PI / 180),
      post.canvasHeight / 2 + post.canvasHeight / 2 * Math.sin((bg.gradientAngle - 90) * Math.PI / 180),
      post.canvasWidth / 2 - post.canvasWidth / 2 * Math.cos((bg.gradientAngle - 90) * Math.PI / 180),
      post.canvasHeight / 2 - post.canvasHeight / 2 * Math.sin((bg.gradientAngle - 90) * Math.PI / 180),
    );
    grad.addColorStop(0, bg.gradientStart);
    grad.addColorStop(1, bg.gradientEnd);
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, post.canvasWidth, post.canvasHeight);
  } else if (bg.imageUrl) {
    await new Promise<void>(res => {
      const img = new window.Image();
      if (/^https?:/i.test(bg.imageUrl!)) img.crossOrigin = 'anonymous';
      img.onload = () => { ctx.drawImage(img, 0, 0, post.canvasWidth, post.canvasHeight); res(); };
      img.onerror = () => res();
      img.src = bg.imageUrl!;
    });
  }

  // Draw elements by zIndex
  const sorted = [...post.elements].filter(e => e.visible).sort((a, b) => a.zIndex - b.zIndex);
  for (const el of sorted) {
    ctx.save();
    ctx.translate(el.x + el.width / 2, el.y + el.height / 2);
    ctx.rotate((el.rotation * Math.PI) / 180);
    ctx.translate(-el.width / 2, -el.height / 2);

    if (el.data.kind === 'text') {
      const td = el.data as TextElement;
      ctx.font = `${td.fontStyle} ${td.fontWeight} ${td.fontSize}px ${td.fontFamily}`;
      ctx.fillStyle = td.color;
      ctx.textBaseline = 'top';
      // Text effect presets (match the live CSS rendering)
      if (td.effect === 'shadow') { ctx.shadowColor = 'rgba(0,0,0,0.45)'; ctx.shadowOffsetX = 2; ctx.shadowOffsetY = 4; ctx.shadowBlur = 10; }
      else if (td.effect === 'lift') { ctx.shadowColor = 'rgba(0,0,0,0.35)'; ctx.shadowOffsetY = 10; ctx.shadowBlur = 28; }
      else if (td.effect === 'neon') { ctx.shadowColor = td.color; ctx.shadowBlur = 18; }
      else if (td.effect === 'echo') { ctx.shadowColor = td.color + '55'; ctx.shadowOffsetX = 4; ctx.shadowOffsetY = 4; }
      if (td.backgroundColor) {
        ctx.fillStyle = td.backgroundColor;
        ctx.fillRect(0, 0, el.width, el.height);
        ctx.fillStyle = td.color;
      }
      const lines = td.text.split('\n');
      const lh = td.fontSize * td.lineHeight;
      lines.forEach((line, li) => {
        const txt = td.uppercase ? line.toUpperCase() : line;
        let tx = td.textAlign === 'center' ? el.width / 2 : td.textAlign === 'right' ? el.width : 0;
        ctx.textAlign = td.textAlign as CanvasTextAlign;
        if (td.effect === 'neon') ctx.fillText(txt, tx, li * lh); // double pass = stronger glow
        ctx.fillText(txt, tx, li * lh);
      });
      ctx.shadowColor = 'transparent'; ctx.shadowBlur = 0; ctx.shadowOffsetX = 0; ctx.shadowOffsetY = 0;
    } else if (el.data.kind === 'image') {
      const id = el.data as ImageElement;
      await new Promise<void>(res => {
        const img = new window.Image();
        if (/^https?:/i.test(id.src)) img.crossOrigin = 'anonymous';
        img.onload = () => {
          ctx.globalAlpha = id.opacity;
          ctx.drawImage(img, 0, 0, el.width, el.height);
          ctx.globalAlpha = 1;
          res();
        };
        img.onerror = () => res();   // never hang the export on a dead image
        img.src = id.src;
      });
    } else if (el.data.kind === 'shape') {
      const sd = el.data as ShapeElement;
      ctx.globalAlpha = sd.opacity;
      ctx.fillStyle = sd.fill;
      ctx.strokeStyle = sd.stroke;
      ctx.lineWidth = sd.strokeWidth;
      if (sd.shapeType === 'rect') {
        ctx.fillRect(0, 0, el.width, el.height);
        if (sd.strokeWidth > 0) ctx.strokeRect(0, 0, el.width, el.height);
      } else if (sd.shapeType === 'circle') {
        ctx.beginPath();
        ctx.ellipse(el.width / 2, el.height / 2, el.width / 2, el.height / 2, 0, 0, Math.PI * 2);
        ctx.fill();
        if (sd.strokeWidth > 0) ctx.stroke();
      } else {
        const pathStr = SHAPE_PATHS[sd.shapeType]?.(el.width, el.height);
        if (pathStr) {
          const p2d = new Path2D(pathStr);
          ctx.fill(p2d);
          if (sd.strokeWidth > 0) ctx.stroke(p2d);
        }
      }
      ctx.globalAlpha = 1;
    } else if (el.data.kind === 'sticker') {
      const sd = el.data as StickerElement;
      ctx.font = `${sd.fontSize}px Arial`;
      ctx.textBaseline = 'middle';
      ctx.textAlign = 'center';
      ctx.fillText(sd.emoji, el.width / 2, el.height / 2);
    }
    ctx.restore();
  }

  canvas.toBlob(blob => {
    if (!blob) return;
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `design-${Date.now()}.png`;
    a.click();
    URL.revokeObjectURL(url);
  }, 'image/png');
}

/* ══════════════════════════════════════════════════════ */
/*                    MAIN EDITOR                         */
/* ══════════════════════════════════════════════════════ */
export default function PostEditor() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { socialPosts, updateSocialPost } = useApp() as any;

  /* Put it through the same normaliser the gallery uses: a record saved by
     content setup has no canvas on it, and the editor would open onto nothing. */
  const post: DesignPost | undefined =
    normalisePost(socialPosts?.find((p: { id?: string }) => p?.id === id)) ?? undefined;

  const [elements, setElements] = useState<CanvasElement[]>(post?.elements ?? []);
  const [background, setBackground] = useState<CanvasBackground>(post?.background ?? { type: 'color', color: '#ffffff', gradientStart: '#6366f1', gradientEnd: '#a855f7', gradientAngle: 135, imageFit: 'cover' });
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [history, setHistory] = useState<HistoryEntry[]>([{ elements: post?.elements ?? [], background: post?.background ?? { type: 'color', color: '#ffffff', gradientStart: '#6366f1', gradientEnd: '#a855f7', gradientAngle: 135, imageFit: 'cover' } }]);
  const [histIdx, setHistIdx] = useState(0);
  const [zoom, setZoom] = useState(1);
  const [tool, setTool] = useState<'select' | 'text' | 'shape' | 'image' | 'sticker'>('select');
  const [leftPanel, setLeftPanel] = useState<'elements' | 'layers' | 'bg'>('elements');
  const [rightPanel, setRightPanel] = useState<'properties' | 'bg'>('properties');
  const [addShapeType, setAddShapeType] = useState<string>('rect');
  const [showStickers, setShowStickers] = useState(false);
  const [saved, setSaved] = useState(true);
  const [exporting, setExporting] = useState(false);
  const canvasRef = useRef<HTMLDivElement>(null);
  const imageUploadRef = useRef<HTMLInputElement>(null);
  // Smart snapping guides (Canva-style magenta lines while dragging)
  const [guides, setGuides] = useState<{ v: number[]; h: number[] }>({ v: [], h: [] });
  const clipboardRef = useRef<CanvasElement | null>(null);
  // Stock photo search
  const [photoQuery, setPhotoQuery] = useState('');
  const [photoResults, setPhotoResults] = useState<string[]>([]);

  // Drag / resize / rotate state
  const dragRef = useRef<{
    type: 'drag' | 'resize' | 'rotate';
    id: string;
    handle?: string;
    startX: number;
    startY: number;
    origEl: CanvasElement;
  } | null>(null);
  const didDragRef = useRef(false);

  if (!post) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100vh', flexDirection: 'column', gap: 16 }}>
        <p style={{ color: '#64748b', fontSize: 16 }}>Design not found</p>
        <button onClick={() => navigate('/social-creator')} style={{ padding: '10px 20px', border: 'none', borderRadius: 8, background: '#6366f1', color: '#fff', cursor: 'pointer' }}>Go Back</button>
      </div>
    );
  }

  // ── History ──
  const pushHistory = useCallback((els: CanvasElement[], bg: CanvasBackground) => {
    setHistory(prev => {
      const next = [...prev.slice(0, histIdx + 1), { elements: els, background: bg }];
      setHistIdx(next.length - 1);
      return next;
    });
  }, [histIdx]);

  const undo = () => {
    if (histIdx <= 0) return;
    const entry = history[histIdx - 1];
    setElements(entry.elements);
    setBackground(entry.background);
    setHistIdx(histIdx - 1);
    setSaved(false);
  };

  const redo = () => {
    if (histIdx >= history.length - 1) return;
    const entry = history[histIdx + 1];
    setElements(entry.elements);
    setBackground(entry.background);
    setHistIdx(histIdx + 1);
    setSaved(false);
  };

  // ── Save ──
  const save = useCallback(() => {
    updateSocialPost(post.id, { elements, background, updatedAt: new Date().toISOString() });
    setSaved(true);
  }, [post.id, elements, background, updateSocialPost]);

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      const tag = (e.target as Element).tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA' || (e.target as Element).getAttribute('contenteditable')) return;
      if ((e.metaKey || e.ctrlKey) && e.key === 'z') { e.preventDefault(); undo(); }
      if ((e.metaKey || e.ctrlKey) && (e.key === 'y' || (e.shiftKey && e.key === 'z'))) { e.preventDefault(); redo(); }
      if ((e.metaKey || e.ctrlKey) && e.key === 's') { e.preventDefault(); save(); }
      if ((e.key === 'Delete' || e.key === 'Backspace') && selectedId) {
        deleteElement(selectedId);
      }
      if ((e.metaKey || e.ctrlKey) && e.key === 'd' && selectedId) { e.preventDefault(); duplicateElement(selectedId); }
      if ((e.metaKey || e.ctrlKey) && e.key === 'c' && selectedId) {
        const el = elements.find(el => el.id === selectedId);
        if (el) clipboardRef.current = { ...el, data: { ...el.data } };
      }
      if ((e.metaKey || e.ctrlKey) && e.key === 'v' && clipboardRef.current) {
        e.preventDefault();
        const c = clipboardRef.current;
        addElement({ ...c, id: uid(), x: c.x + 20, y: c.y + 20, zIndex: Math.max(0, ...elements.map(el => el.zIndex)) + 1 });
      }
      if (e.key === 'Escape') { setSelectedId(null); setEditingId(null); }
      // Arrow-key nudging (Shift = 10px)
      if (selectedId && ['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(e.key)) {
        e.preventDefault();
        const step = e.shiftKey ? 10 : 1;
        const el = elements.find(el => el.id === selectedId);
        if (el && !el.locked) {
          updateElementAndHistory(selectedId, {
            x: el.x + (e.key === 'ArrowRight' ? step : e.key === 'ArrowLeft' ? -step : 0),
            y: el.y + (e.key === 'ArrowDown' ? step : e.key === 'ArrowUp' ? -step : 0),
          });
        }
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [selectedId, histIdx, history, elements, background, save]);

  // ── Element CRUD ──
  const addElement = (el: CanvasElement) => {
    const next = [...elements, el];
    setElements(next);
    setSelectedId(el.id);
    pushHistory(next, background);
    setSaved(false);
  };

  const updateElement = (id: string, updates: Partial<CanvasElement>) => {
    const next = elements.map(e => e.id === id ? { ...e, ...updates } : e);
    setElements(next);
    setSaved(false);
  };

  const updateElementAndHistory = (id: string, updates: Partial<CanvasElement>) => {
    const next = elements.map(e => e.id === id ? { ...e, ...updates } : e);
    setElements(next);
    pushHistory(next, background);
    setSaved(false);
  };

  const deleteElement = (id: string) => {
    const next = elements.filter(e => e.id !== id);
    setElements(next);
    if (selectedId === id) setSelectedId(null);
    if (editingId === id) setEditingId(null);
    pushHistory(next, background);
    setSaved(false);
  };

  const duplicateElement = (id: string) => {
    const el = elements.find(e => e.id === id);
    if (!el) return;
    const dup: CanvasElement = { ...el, id: uid(), x: el.x + 16, y: el.y + 16, zIndex: Math.max(...elements.map(e => e.zIndex), 0) + 1 };
    addElement(dup);
  };

  const moveZ = (id: string, dir: 'up' | 'down' | 'top' | 'bottom') => {
    const maxZ = Math.max(...elements.map(e => e.zIndex));
    const minZ = Math.min(...elements.map(e => e.zIndex));
    const el = elements.find(e => e.id === id);
    if (!el) return;
    let newZ = el.zIndex;
    if (dir === 'up') newZ = el.zIndex + 1;
    if (dir === 'down') newZ = el.zIndex - 1;
    if (dir === 'top') newZ = maxZ + 1;
    if (dir === 'bottom') newZ = minZ - 1;
    updateElementAndHistory(id, { zIndex: newZ });
  };

  const updateBackground = (updates: Partial<CanvasBackground>) => {
    const next = { ...background, ...updates };
    setBackground(next);
    pushHistory(elements, next);
    setSaved(false);
  };

  // ── Pointer events for drag/resize/rotate ──
  const handlePointerDown = (id: string, e: React.PointerEvent) => {
    if (e.button !== 0) return;
    e.preventDefault();
    const el = elements.find(el => el.id === id);
    if (!el || el.locked) return;
    setSelectedId(id);
    didDragRef.current = false;
    dragRef.current = { type: 'drag', id, startX: e.clientX, startY: e.clientY, origEl: { ...el } };
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
  };

  const handleResizeStart = (id: string, handle: string, e: React.PointerEvent) => {
    e.preventDefault();
    e.stopPropagation();
    const el = elements.find(el => el.id === id);
    if (!el) return;
    didDragRef.current = false;
    dragRef.current = { type: 'resize', id, handle, startX: e.clientX, startY: e.clientY, origEl: { ...el } };
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
  };

  const handleRotateStart = (id: string, e: React.PointerEvent) => {
    e.preventDefault();
    e.stopPropagation();
    const el = elements.find(el => el.id === id);
    if (!el) return;
    didDragRef.current = false;
    dragRef.current = { type: 'rotate', id, startX: e.clientX, startY: e.clientY, origEl: { ...el } };
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
  };

  const handleCanvasPointerMove = (e: React.PointerEvent) => {
    const dr = dragRef.current;
    if (!dr) return;
    didDragRef.current = true;
    const dx = (e.clientX - dr.startX) / zoom;
    const dy = (e.clientY - dr.startY) / zoom;
    const orig = dr.origEl;

    if (dr.type === 'drag') {
      // Smart snapping: canvas edges/center + other elements' edges/centers
      let nx = orig.x + dx, ny = orig.y + dy;
      const SNAP = 6 / zoom;
      const vTargets = [0, post.canvasWidth / 2, post.canvasWidth];
      const hTargets = [0, post.canvasHeight / 2, post.canvasHeight];
      for (const other of elements) {
        if (other.id === dr.id || !other.visible) continue;
        vTargets.push(other.x, other.x + other.width / 2, other.x + other.width);
        hTargets.push(other.y, other.y + other.height / 2, other.y + other.height);
      }
      const gv: number[] = [], gh: number[] = [];
      outerV: for (const off of [0, orig.width / 2, orig.width]) {
        for (const t of vTargets) { if (Math.abs(nx + off - t) < SNAP) { nx = t - off; gv.push(t); break outerV; } }
      }
      outerH: for (const off of [0, orig.height / 2, orig.height]) {
        for (const t of hTargets) { if (Math.abs(ny + off - t) < SNAP) { ny = t - off; gh.push(t); break outerH; } }
      }
      setGuides({ v: gv, h: gh });
      updateElement(dr.id, { x: nx, y: ny });
    } else if (dr.type === 'resize') {
      const h = dr.handle!;
      let { x, y, width, height } = orig;
      if (h.includes('e')) width = Math.max(20, orig.width + dx);
      if (h.includes('s')) height = Math.max(20, orig.height + dy);
      if (h.includes('w')) { x = orig.x + dx; width = Math.max(20, orig.width - dx); }
      if (h.includes('n')) { y = orig.y + dy; height = Math.max(20, orig.height - dy); }
      updateElement(dr.id, { x, y, width, height });
    } else if (dr.type === 'rotate') {
      const canvas = canvasRef.current;
      if (!canvas) return;
      const rect = canvas.getBoundingClientRect();
      const cx = rect.left + (orig.x + orig.width / 2) * zoom;
      const cy = rect.top + (orig.y + orig.height / 2) * zoom;
      const angle = Math.atan2(e.clientY - cy, e.clientX - cx) * (180 / Math.PI) + 90;
      updateElement(dr.id, { rotation: angle });
    }
  };

  const handleCanvasPointerUp = () => {
    setGuides({ v: [], h: [] });
    if (dragRef.current) {
      const el = elements.find(e => e.id === dragRef.current!.id);
      if (el) pushHistory(elements, background);
      dragRef.current = null;
    }
    // Reset drag flag after a short delay so click handler can read it
    setTimeout(() => { didDragRef.current = false; }, 50);
  };

  // ── Add elements ──
  const addText = () => {
    const el: CanvasElement = {
      id: uid(), type: 'text', x: post.canvasWidth / 2 - 100, y: post.canvasHeight / 2 - 25,
      width: 200, height: 50, rotation: 0, zIndex: elements.length + 1, locked: false, visible: true,
      data: { kind: 'text', text: 'Double-click to edit', fontSize: 24, fontFamily: 'Inter', color: '#1e293b', fontWeight: 'normal', fontStyle: 'normal', textAlign: 'center', lineHeight: 1.2, letterSpacing: 0, textDecoration: 'none' },
    };
    addElement(el);
    setTool('select');
    setTimeout(() => setEditingId(el.id), 100);
  };

  const addShape = (shapeType = addShapeType) => {
    const el: CanvasElement = {
      id: uid(), type: 'shape', x: post.canvasWidth / 2 - 50, y: post.canvasHeight / 2 - 50,
      width: 100, height: 100, rotation: 0, zIndex: elements.length + 1, locked: false, visible: true,
      data: { kind: 'shape', shapeType: shapeType as any, fill: '#6366f1', stroke: 'transparent', strokeWidth: 0, opacity: 1 },
    };
    addElement(el);
    setTool('select');
  };

  const addSticker = (emoji: string) => {
    const el: CanvasElement = {
      id: uid(), type: 'sticker', x: post.canvasWidth / 2 - 40, y: post.canvasHeight / 2 - 40,
      width: 80, height: 80, rotation: 0, zIndex: elements.length + 1, locked: false, visible: true,
      data: { kind: 'sticker', emoji, fontSize: 56 },
    };
    addElement(el);
    setShowStickers(false);
    setTool('select');
  };

  const handleImageUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = ev => {
      if (!ev.target?.result) return;
      const img = new window.Image();
      img.onload = () => {
        const scale = Math.min(post.canvasWidth * 0.6 / img.width, post.canvasHeight * 0.6 / img.height, 1);
        const w = img.width * scale, h = img.height * scale;
        const el: CanvasElement = {
          id: uid(), type: 'image', x: post.canvasWidth / 2 - w / 2, y: post.canvasHeight / 2 - h / 2,
          width: w, height: h, rotation: 0, zIndex: elements.length + 1, locked: false, visible: true,
          data: { kind: 'image', src: ev.target!.result as string, objectFit: 'cover', opacity: 1, borderRadius: 0 },
        };
        addElement(el);
      };
      img.src = ev.target.result as string;
    };
    reader.readAsDataURL(file);
    setTool('select');
  };

  /** Align the selected element to the canvas (Canva's Position menu). */
  const alignElement = (id: string, mode: 'left' | 'centerX' | 'right' | 'top' | 'centerY' | 'bottom') => {
    const el = elements.find(e => e.id === id);
    if (!el) return;
    const updates: Partial<CanvasElement> = {};
    if (mode === 'left') updates.x = 0;
    if (mode === 'centerX') updates.x = (post.canvasWidth - el.width) / 2;
    if (mode === 'right') updates.x = post.canvasWidth - el.width;
    if (mode === 'top') updates.y = 0;
    if (mode === 'centerY') updates.y = (post.canvasHeight - el.height) / 2;
    if (mode === 'bottom') updates.y = post.canvasHeight - el.height;
    updateElementAndHistory(id, updates);
  };

  /** Canva-style text presets. */
  const addTextPreset = (preset: 'heading' | 'subheading' | 'body') => {
    const cfgMap = {
      heading:    { text: 'Add a heading',    fontSize: Math.round(post.canvasWidth * 0.075), fontWeight: '800' as const },
      subheading: { text: 'Add a subheading', fontSize: Math.round(post.canvasWidth * 0.045), fontWeight: '600' as const },
      body:       { text: 'Add a little bit of body text', fontSize: Math.round(post.canvasWidth * 0.028), fontWeight: 'normal' as const },
    }[preset];
    const w = post.canvasWidth * 0.8;
    const h = cfgMap.fontSize * 1.5;
    const el: CanvasElement = {
      id: uid(), type: 'text', x: (post.canvasWidth - w) / 2, y: post.canvasHeight / 2 - h / 2,
      width: w, height: h, rotation: 0, zIndex: elements.length + 1, locked: false, visible: true,
      data: { kind: 'text', text: cfgMap.text, fontSize: cfgMap.fontSize, fontFamily: 'Inter', color: '#1e293b', fontWeight: cfgMap.fontWeight, fontStyle: 'normal', textAlign: 'center', lineHeight: 1.15, letterSpacing: 0, textDecoration: 'none' },
    };
    addElement(el);
    setTimeout(() => setEditingId(el.id), 100);
  };

  /** Stock photo search (keyword images via the server-side image proxy). */
  const searchPhotos = () => {
    const q = photoQuery.trim();
    if (!q) return;
    setPhotoResults(Array.from({ length: 8 }, (_, i) => `${API_BASE}/api/img-proxy.php?q=${encodeURIComponent(q)}&sig=${i + 1}`));
  };

  const addStockPhoto = (url: string) => {
    const w = post.canvasWidth * 0.6, h = w * (9 / 16);
    addElement({
      id: uid(), type: 'image', x: (post.canvasWidth - w) / 2, y: (post.canvasHeight - h) / 2,
      width: w, height: h, rotation: 0, zIndex: elements.length + 1, locked: false, visible: true,
      data: { kind: 'image', src: url, objectFit: 'cover', opacity: 1, borderRadius: 0 },
    });
  };

  const handleCanvasClick = (e: React.MouseEvent) => {
    if (didDragRef.current) return; // Ignore click events after a drag
    if (editingId) { setEditingId(null); return; }
    const onBackground = e.target === canvasRef.current || (e.target as HTMLElement).dataset?.canvas === 'true';
    if (onBackground) {
      setSelectedId(null);
      if (tool === 'text') addText();
    }
  };

  const selectedEl = elements.find(e => e.id === selectedId) ?? null;

  const TOOLBAR_TOOLS = [
    { key: 'select', icon: <Move size={18} />, label: 'Select' },
    { key: 'text', icon: <Type size={18} />, label: 'Text' },
    { key: 'shape', icon: <Square size={18} />, label: 'Shapes' },
    { key: 'image', icon: <Image size={18} />, label: 'Image' },
    { key: 'sticker', icon: <Smile size={18} />, label: 'Sticker' },
  ];

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100vh', background: '#f1f5f9', overflow: 'hidden' }}>
      {/* ── Top Bar ── */}
      <div style={{ height: 56, background: '#1e293b', display: 'flex', alignItems: 'center', padding: '0 16px', gap: 12, zIndex: 100, flexShrink: 0 }}>
        <button onClick={() => { save(); navigate('/social-creator'); }}
          style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '6px 12px', border: 'none', borderRadius: 6, background: 'rgba(255,255,255,0.1)', color: '#e2e8f0', cursor: 'pointer', fontSize: 13 }}>
          <ArrowLeft size={16} /> Back
        </button>
        <div style={{ flex: 1, fontSize: 14, fontWeight: 600, color: '#e2e8f0', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {post.name}
          {!saved && <span style={{ fontSize: 11, color: '#94a3b8', marginLeft: 8 }}>● unsaved</span>}
        </div>
        {/* Undo/Redo */}
        <button onClick={undo} disabled={histIdx <= 0} title="Undo (⌘Z)"
          style={{ padding: '6px 10px', border: 'none', borderRadius: 6, background: 'rgba(255,255,255,0.1)', color: histIdx <= 0 ? '#475569' : '#e2e8f0', cursor: histIdx <= 0 ? 'default' : 'pointer' }}>
          <Undo2 size={16} />
        </button>
        <button onClick={redo} disabled={histIdx >= history.length - 1} title="Redo (⌘Y)"
          style={{ padding: '6px 10px', border: 'none', borderRadius: 6, background: 'rgba(255,255,255,0.1)', color: histIdx >= history.length - 1 ? '#475569' : '#e2e8f0', cursor: histIdx >= history.length - 1 ? 'default' : 'pointer' }}>
          <Redo2 size={16} />
        </button>
        {/* Zoom */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 4, background: 'rgba(255,255,255,0.1)', borderRadius: 6, padding: '2px' }}>
          <button onClick={() => setZoom(z => Math.max(0.25, z - 0.1))} style={{ padding: '4px 8px', border: 'none', background: 'none', color: '#e2e8f0', cursor: 'pointer' }}><ZoomOut size={14} /></button>
          <span style={{ fontSize: 12, color: '#e2e8f0', minWidth: 40, textAlign: 'center' }}>{Math.round(zoom * 100)}%</span>
          <button onClick={() => setZoom(z => Math.min(3, z + 0.1))} style={{ padding: '4px 8px', border: 'none', background: 'none', color: '#e2e8f0', cursor: 'pointer' }}><ZoomIn size={14} /></button>
          <button onClick={() => setZoom(1)} style={{ padding: '4px 8px', border: 'none', background: 'none', color: '#94a3b8', cursor: 'pointer', fontSize: 10 }}>Reset</button>
        </div>
        <button onClick={save} title="Save (⌘S)"
          style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '6px 14px', border: 'none', borderRadius: 6, background: saved ? 'rgba(255,255,255,0.1)' : '#6366f1', color: '#fff', cursor: 'pointer', fontSize: 13, fontWeight: 600 }}>
          <Save size={14} /> {saved ? 'Saved' : 'Save'}
        </button>
        <button
          onClick={async () => { setExporting(true); await exportToPNG({ ...post, elements, background }); setExporting(false); }}
          disabled={exporting}
          style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '6px 14px', border: 'none', borderRadius: 6, background: '#22c55e', color: '#fff', cursor: 'pointer', fontSize: 13, fontWeight: 600 }}>
          <Download size={14} /> {exporting ? 'Exporting…' : 'Export PNG'}
        </button>
      </div>

      <div style={{ display: 'flex', flex: 1, overflow: 'hidden' }}>
        {/* ── Left Panel ── */}
        <div style={{ width: 200, background: '#fff', borderRight: '1px solid #e2e8f0', display: 'flex', flexDirection: 'column', flexShrink: 0, overflow: 'hidden' }}>
          {/* Tool selection */}
          <div style={{ display: 'flex', borderBottom: '1px solid #e2e8f0', background: '#f8fafc' }}>
            {TOOLBAR_TOOLS.map(t => (
              <button key={t.key}
                onClick={() => {
                  setTool(t.key as any);
                  if (t.key === 'sticker') setShowStickers(s => !s);
                  else setShowStickers(false);
                  if (t.key === 'image') imageUploadRef.current?.click();
                }}
                title={t.label}
                style={{
                  flex: 1, padding: '10px 4px', border: 'none', background: tool === t.key ? '#ede9fe' : 'transparent',
                  color: tool === t.key ? '#6366f1' : '#64748b', cursor: 'pointer', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 3, fontSize: 9,
                }}>
                {t.icon}
                <span>{t.label}</span>
              </button>
            ))}
          </div>

          {/* Sticker picker */}
          {showStickers && (
            <div style={{ padding: '10px', borderBottom: '1px solid #e2e8f0', background: '#fff', maxHeight: 220, overflowY: 'auto' }}>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
                {EMOJI_STICKERS.map(em => (
                  <button key={em} onClick={() => addSticker(em)}
                    style={{ width: 36, height: 36, border: '1px solid #e2e8f0', borderRadius: 6, background: '#fff', cursor: 'pointer', fontSize: 20, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                    {em}
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Shape picker when shape tool active */}
          {tool === 'shape' && (
            <div style={{ padding: '10px', borderBottom: '1px solid #e2e8f0' }}>
              <div style={{ fontSize: 11, fontWeight: 600, color: '#64748b', marginBottom: 6 }}>SHAPES</div>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 4 }}>
                {(['rect', 'rounded-rect', 'circle', 'triangle', 'star', 'diamond', 'arrow', 'line', 'heart', 'hexagon'] as const).map(s => (
                  <button key={s}
                    onClick={() => { setAddShapeType(s); addShape(s); }}
                    style={{ padding: '6px', border: '1px solid', borderRadius: 6, background: addShapeType === s ? '#ede9fe' : '#fff', borderColor: addShapeType === s ? '#6366f1' : '#e2e8f0', cursor: 'pointer', fontSize: 9, color: '#374151' }}>
                    {s === 'rounded-rect' ? 'rRect' : s}
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Left panel tabs */}
          <div style={{ display: 'flex', borderBottom: '1px solid #e2e8f0' }}>
            {[
              { key: 'elements', label: 'Add' },
              { key: 'layers', label: 'Layers' },
              { key: 'bg', label: 'BG' },
            ].map(t => (
              <button key={t.key} onClick={() => setLeftPanel(t.key as any)}
                style={{ flex: 1, padding: '8px', border: 'none', background: leftPanel === t.key ? '#ede9fe' : '#fff', color: leftPanel === t.key ? '#6366f1' : '#64748b', cursor: 'pointer', fontSize: 11, fontWeight: leftPanel === t.key ? 600 : 400 }}>
                {t.label}
              </button>
            ))}
          </div>

          <div style={{ flex: 1, overflowY: 'auto' }}>
            {leftPanel === 'elements' && (
              <div style={{ padding: 12 }}>
                {/* Canva-style text presets */}
                <div style={{ fontSize: 10.5, fontWeight: 700, color: '#94a3b8', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 6 }}>Text</div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginBottom: 14 }}>
                  <button onClick={() => addTextPreset('heading')}
                    style={{ padding: '12px', border: '1px solid #e2e8f0', borderRadius: 8, background: '#fff', cursor: 'pointer', fontSize: 17, fontWeight: 800, color: '#17191c', textAlign: 'left' }}>
                    Add a heading
                  </button>
                  <button onClick={() => addTextPreset('subheading')}
                    style={{ padding: '10px 12px', border: '1px solid #e2e8f0', borderRadius: 8, background: '#fff', cursor: 'pointer', fontSize: 14, fontWeight: 600, color: '#374151', textAlign: 'left' }}>
                    Add a subheading
                  </button>
                  <button onClick={() => addTextPreset('body')}
                    style={{ padding: '9px 12px', border: '1px solid #e2e8f0', borderRadius: 8, background: '#fff', cursor: 'pointer', fontSize: 12, color: '#64748b', textAlign: 'left' }}>
                    Add a little bit of body text
                  </button>
                </div>

                <div style={{ fontSize: 10.5, fontWeight: 700, color: '#94a3b8', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 6 }}>Elements</div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginBottom: 14 }}>
                  {[
                    { icon: <Square size={16} />, label: 'Add Shape', fn: () => addShape(), color: '#0ea5e9' },
                    { icon: <Image size={16} />, label: 'Upload Image', fn: () => imageUploadRef.current?.click(), color: '#22c55e' },
                    { icon: <Smile size={16} />, label: 'Add Sticker', fn: () => setShowStickers(s => !s), color: '#f59e0b' },
                  ].map(btn => (
                    <button key={btn.label} onClick={btn.fn}
                      style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '10px 12px', border: '1px solid #e2e8f0', borderRadius: 8, background: '#fff', cursor: 'pointer', fontSize: 13, color: btn.color, fontWeight: 500 }}>
                      {btn.icon} {btn.label}
                    </button>
                  ))}
                </div>

                {/* Stock photo search */}
                <div style={{ fontSize: 10.5, fontWeight: 700, color: '#94a3b8', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 6 }}>Stock Photos</div>
                <div style={{ display: 'flex', gap: 5, marginBottom: 8 }}>
                  <input value={photoQuery} onChange={e => setPhotoQuery(e.target.value)} onKeyDown={e => e.key === 'Enter' && searchPhotos()}
                    placeholder="Search photos… e.g. city"
                    style={{ flex: 1, padding: '8px 10px', border: '1px solid #e2e8f0', borderRadius: 8, fontSize: 12.5, outline: 'none', minWidth: 0 }} />
                  <button onClick={searchPhotos}
                    style={{ padding: '8px 12px', border: 'none', borderRadius: 8, background: '#17191c', color: '#fff', cursor: 'pointer', fontSize: 12, fontWeight: 700 }}>Go</button>
                </div>
                {photoResults.length > 0 && (
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 6 }}>
                    {photoResults.map((url, i) => (
                      <button key={i} onClick={() => addStockPhoto(url)} title="Add to canvas"
                        style={{ padding: 0, border: '1px solid #e2e8f0', borderRadius: 8, overflow: 'hidden', cursor: 'pointer', background: '#f1f5f9', aspectRatio: '16/10' }}>
                        <img src={url} alt="" loading="lazy" style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }}
                          onError={e => { (e.currentTarget.parentElement as HTMLElement).style.display = 'none'; }} />
                      </button>
                    ))}
                  </div>
                )}
              </div>
            )}
            {leftPanel === 'layers' && (
              <LayersPanel
                elements={elements}
                selectedId={selectedId}
                onSelect={id => setSelectedId(id)}
                onUpdate={updateElementAndHistory}
                onDelete={deleteElement}
                onReorder={() => {}}
              />
            )}
            {leftPanel === 'bg' && (
              <BackgroundPanel bg={background} onUpdate={updateBackground} />
            )}
          </div>
        </div>

        {/* ── Canvas Area ── */}
        <div
          style={{ flex: 1, overflow: 'auto', display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#e2e8f0', cursor: tool === 'text' ? 'text' : 'default', position: 'relative' }}
          onClick={handleCanvasClick}
          onPointerMove={handleCanvasPointerMove}
          onPointerUp={handleCanvasPointerUp}
        >
          {/* Canvas */}
          <div
            ref={canvasRef}
            data-canvas="true"
            style={{
              width: post.canvasWidth, height: post.canvasHeight,
              position: 'relative', overflow: 'hidden',
              transform: `scale(${zoom})`, transformOrigin: 'center center',
              boxShadow: '0 8px 40px rgba(0,0,0,0.2)',
              borderRadius: 4,
              cursor: tool === 'text' ? 'text' : 'default',
            }}
          >
            <CanvasBg bg={background} width={post.canvasWidth} height={post.canvasHeight} />
            {/* Smart snap guides */}
            {guides.v.map((x, i) => (
              <div key={`gv${i}`} style={{ position: 'absolute', left: x, top: 0, bottom: 0, width: 1.5, background: '#ec4899', zIndex: 9999, pointerEvents: 'none' }} />
            ))}
            {guides.h.map((y, i) => (
              <div key={`gh${i}`} style={{ position: 'absolute', top: y, left: 0, right: 0, height: 1.5, background: '#ec4899', zIndex: 9999, pointerEvents: 'none' }} />
            ))}
            {[...elements].sort((a, b) => a.zIndex - b.zIndex).map(el => (
              <CanvasElementView
                key={el.id}
                el={el}
                selected={selectedId === el.id}
                editingId={editingId}
                onSelect={(id, e) => { e.stopPropagation(); setSelectedId(id); setEditingId(null); }}
                onStartDrag={handlePointerDown}
                onStartResize={handleResizeStart}
                onStartRotate={handleRotateStart}
                onDblClick={id => {
                  const found = elements.find(e => e.id === id);
                  if (found?.data.kind === 'text') setEditingId(id);
                }}
                onTextChange={(id, text) => {
                  updateElementAndHistory(id, { data: { ...(elements.find(e => e.id === id)?.data as any), text } });
                  setEditingId(null);
                }}
              />
            ))}
          </div>

          {/* Canvas info */}
          <div style={{ position: 'absolute', bottom: 12, left: '50%', transform: 'translateX(-50%)', background: 'rgba(0,0,0,0.5)', color: '#fff', fontSize: 11, padding: '4px 12px', borderRadius: 99 }}>
            {post.canvasWidth} × {post.canvasHeight}px · {post.aspectRatio} · {Math.round(zoom * 100)}%
          </div>
        </div>

        {/* ── Right Panel ── */}
        <div style={{ width: 260, background: '#fff', borderLeft: '1px solid #e2e8f0', display: 'flex', flexDirection: 'column', flexShrink: 0, overflow: 'hidden' }}>
          <div style={{ display: 'flex', borderBottom: '1px solid #e2e8f0' }}>
            {[
              { key: 'properties', label: 'Properties' },
              { key: 'bg', label: 'Canvas BG' },
            ].map(t => (
              <button key={t.key} onClick={() => setRightPanel(t.key as any)}
                style={{ flex: 1, padding: '12px', border: 'none', background: rightPanel === t.key ? '#ede9fe' : '#fff', color: rightPanel === t.key ? '#6366f1' : '#64748b', cursor: 'pointer', fontSize: 12, fontWeight: rightPanel === t.key ? 600 : 400 }}>
                {t.label}
              </button>
            ))}
          </div>
          <div style={{ flex: 1, overflowY: 'auto' }}>
            {rightPanel === 'properties' && selectedEl && (
              <div style={{ padding: '14px 16px 4px' }}>
                <div style={{ fontSize: 12, fontWeight: 700, color: '#374151', marginBottom: 8, textTransform: 'uppercase', letterSpacing: 0.5 }}>Arrange</div>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(6, 1fr)', gap: 4, marginBottom: 10 }}>
                  {([['left', 'L'], ['centerX', 'C'], ['right', 'R'], ['top', 'T'], ['centerY', 'M'], ['bottom', 'B']] as const).map(([mode, label]) => (
                    <button key={mode} onClick={() => alignElement(selectedEl.id, mode)}
                      title={{ left: 'Align left', centerX: 'Center horizontally', right: 'Align right', top: 'Align top', centerY: 'Center vertically', bottom: 'Align bottom' }[mode]}
                      style={{ padding: '7px 0', border: '1px solid #e2e8f0', borderRadius: 6, background: '#fff', cursor: 'pointer', fontSize: 11, fontWeight: 700, color: '#374151' }}>
                      {label}
                    </button>
                  ))}
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 6, marginBottom: 6 }}>
                  {([['x', 'X'], ['y', 'Y'], ['width', 'W'], ['height', 'H']] as const).map(([key, label]) => (
                    <div key={key} style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
                      <span style={{ fontSize: 10.5, fontWeight: 700, color: '#94a3b8', width: 12 }}>{label}</span>
                      <input type="number" value={Math.round(selectedEl[key] as number)}
                        onChange={e => updateElementAndHistory(selectedEl.id, { [key]: Number(e.target.value) })}
                        style={{ flex: 1, padding: '5px 7px', border: '1px solid #e2e8f0', borderRadius: 6, fontSize: 12, outline: 'none', minWidth: 0 }} />
                    </div>
                  ))}
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
                  <span style={{ fontSize: 10.5, fontWeight: 700, color: '#94a3b8' }}>Rotate</span>
                  <input type="range" min={-180} max={180} value={Math.round(selectedEl.rotation)}
                    onChange={e => updateElement(selectedEl.id, { rotation: Number(e.target.value) })}
                    onMouseUp={() => pushHistory(elements, background)}
                    style={{ flex: 1 }} />
                  <span style={{ fontSize: 11, color: '#374151', minWidth: 34, textAlign: 'right' }}>{Math.round(selectedEl.rotation)}°</span>
                </div>
              </div>
            )}
            {rightPanel === 'properties' ? (
              <PropertiesPanel
                el={selectedEl}
                onUpdate={updateElementAndHistory}
                onDelete={deleteElement}
                onDuplicate={duplicateElement}
                onMoveZ={moveZ}
              />
            ) : (
              <BackgroundPanel bg={background} onUpdate={updateBackground} />
            )}
          </div>
        </div>
      </div>

      {/* Hidden inputs */}
      <input ref={imageUploadRef} type="file" accept="image/*" onChange={handleImageUpload} style={{ display: 'none' }} />
    </div>
  );
}
