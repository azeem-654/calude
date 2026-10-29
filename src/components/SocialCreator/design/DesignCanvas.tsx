/**
 * One design, drawn — the same drawing the export makes (render.ts), at the
 * width it is shown. Drawn only once it scrolls near the screen, so a gallery
 * of templates does not fetch every photo at once.
 */
import { useEffect, useRef, useState } from 'react';
import { formatOf, type DesignDoc } from '../../../../worker/src/lib/design/spec';
import { drawDesign, type DrawResult } from './render';
import { resolveMedia } from './media';

export default function DesignCanvas({ doc, width, page = 0, preview = false, lazy = true, onDrawn, label, style }: {
  doc: DesignDoc; width: number; page?: number; preview?: boolean; lazy?: boolean;
  onDrawn?: (r: DrawResult) => void; label?: string; style?: React.CSSProperties;
}) {
  const ref = useRef<HTMLCanvasElement | null>(null);
  const [near, setNear] = useState(!lazy);
  const [busy, setBusy] = useState(true);
  const fmt = formatOf(doc.format);
  const height = Math.round((width * fmt.height) / fmt.width);
  const key = JSON.stringify(doc) + page + width;

  useEffect(() => {
    if (near || !ref.current) return;
    const io = new IntersectionObserver(es => { if (es.some(e => e.isIntersecting)) { setNear(true); io.disconnect(); } }, { rootMargin: '300px' });
    io.observe(ref.current);
    return () => io.disconnect();
  }, [near]);

  useEffect(() => {
    if (!near || !ref.current) return;
    let alive = true;
    const c = ref.current;
    /* Drawn off-screen and copied in, so the old picture stays until the new one is ready. */
    const off = document.createElement('canvas');
    setBusy(true);
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    void drawDesign(off, doc, { width, dpr, page, preview, resolveMedia }).then(r => {
      if (!alive) return;
      c.width = off.width; c.height = off.height;
      c.getContext('2d')?.drawImage(off, 0, 0);
      setBusy(false);
      onDrawn?.(r);
    });
    return () => { alive = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [near, key]);

  return (
    <canvas ref={ref} role="img" aria-label={label ?? 'Design preview'} data-busy={busy ? '1' : '0'} data-testid="design-canvas"
      style={{ display: 'block', width: '100%', maxWidth: width, aspectRatio: `${fmt.width} / ${fmt.height}`, height: 'auto', background: '#eceae6', borderRadius: 4, ...style }}
      width={width} height={height} />
  );
}
