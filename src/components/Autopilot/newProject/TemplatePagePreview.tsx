/**
 * "Preview" on a design in the wizard's template gallery: every page of a
 * website, or every step of a funnel, full size, in the customer's own name
 * and colours — scrolled top to bottom, stepped through with the arrows.
 *
 * The owner asked for it because a 250px card cannot show what a funnel is:
 * its flow. So each step is drawn whole and the arrows walk the flow in
 * order (a website's arrows walk its pages).
 *
 * The page is the builders' own renderer (`PageBlocks`, through the
 * blueprint's `FitPage` scaler) over the very pages the card was built from,
 * so what is previewed is what "Use this design" builds. Not to be confused
 * with Autopilot/TemplatePreviewModal.tsx, which previews *workflow*
 * templates.
 *
 * It is a real modal — `aria-modal`, focus kept inside, Esc closes, ←/→
 * change step — and it stops its keys and clicks from reaching the wizard
 * behind it (React events bubble through a portal to the wizard's own Esc
 * handler, which would otherwise close the whole wizard). While an
 * aria-modal dialog is open, Protron's helmet tucks itself away.
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import type { KeyboardEvent as ReactKeyboardEvent } from 'react';
import { createPortal } from 'react-dom';
import { ChevronLeft, ChevronRight, Check, Monitor, Smartphone, X } from 'lucide-react';
import type { FunnelStep } from '../../../types';
import type { TemplateMeta } from '../../shared/pageTemplates';
import { FitPage } from './BlueprintPreviews';
import './templatePreview.css';

const PHONE_WIDTH = 390;
const DESKTOP_WIDTH = 1280;
const FOCUSABLE = 'button:not([disabled]), [href], input:not([disabled]), [tabindex]:not([tabindex="-1"])';

export default function TemplatePagePreview({ meta, pages, chosen, onUse, onClose }: {
  meta: TemplateMeta;
  pages: FunnelStep[];
  /** Whether this design is already the one picked. */
  chosen: boolean;
  onUse: () => void;
  onClose: () => void;
}) {
  const [i, setI] = useState(0);
  /* A phone opens on the phone view: the desktop page scaled to 360px is
     unreadable, and on a phone that is what their visitors will see anyway. */
  const [view, setView] = useState<'desktop' | 'phone'>(() => (typeof window !== 'undefined' && window.innerWidth < 720 ? 'phone' : 'desktop'));
  const dialog = useRef<HTMLDivElement>(null);
  const stage = useRef<HTMLDivElement>(null);
  const funnel = meta.kind === 'funnel';
  const n = pages.length;
  const page = pages[Math.min(i, n - 1)];
  const unit = funnel ? 'Step' : 'Page';

  const go = useCallback((d: number) => setI(x => Math.max(0, Math.min(n - 1, x + d))), [n]);

  /* Focus goes in on open and back to the Preview button on close. */
  useEffect(() => {
    const opener = document.activeElement as HTMLElement | null;
    return () => { opener?.focus?.({ preventScroll: true }); };
  }, []);

  /* The scroller is redrawn for each step, which drops focus if it was in
     it; put it back there, so ↑/↓ keep scrolling the new step. */
  useEffect(() => {
    const a = document.activeElement;
    if (!a || a === document.body || !dialog.current?.contains(a)) {
      stage.current?.querySelector<HTMLElement>('.tpv-scroll')?.focus({ preventScroll: true });
    }
  }, [i, view]);

  const onKey = (e: ReactKeyboardEvent<HTMLDivElement>) => {
    /* Nothing here is the wizard's business. */
    e.stopPropagation();
    if (e.key === 'Escape') { e.preventDefault(); onClose(); return; }
    if (e.key === 'ArrowRight') { e.preventDefault(); go(1); return; }
    if (e.key === 'ArrowLeft') { e.preventDefault(); go(-1); return; }
    /* ↑/↓ scroll the page wherever focus is in the dialog — after pressing
       an arrow button, say — not only once the page itself is focused. */
    const sc = stage.current?.querySelector<HTMLElement>('.tpv-scroll');
    if (sc && e.target !== sc) {
      const by = { ArrowDown: 80, ArrowUp: -80, PageDown: sc.clientHeight * 0.9, PageUp: -sc.clientHeight * 0.9 }[e.key];
      if (by) { e.preventDefault(); sc.scrollBy({ top: by }); return; }
      if (e.key === 'Home' || e.key === 'End') { e.preventDefault(); sc.scrollTo({ top: e.key === 'Home' ? 0 : sc.scrollHeight }); return; }
    }
    if (e.key === 'Tab' && dialog.current) {
      const els = [...dialog.current.querySelectorAll<HTMLElement>(FOCUSABLE)].filter(el => el.offsetParent !== null);
      if (!els.length) return;
      const first = els[0];
      const last = els[els.length - 1];
      if (e.shiftKey && (document.activeElement === first || !dialog.current.contains(document.activeElement))) { e.preventDefault(); last.focus(); }
      else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
    }
  };

  if (!page) return null;
  const where = `${unit} ${i + 1} of ${n} · ${page.name}`;
  const prevName = i > 0 ? pages[i - 1].name : '';
  const nextName = i < n - 1 ? pages[i + 1].name : '';

  return createPortal(
    <div className="tpv-scrim"
      onMouseDown={e => { e.stopPropagation(); if (e.target === e.currentTarget) onClose(); }}
      onClick={e => e.stopPropagation()}>
      <div ref={dialog} className="tpv-card" role="dialog" aria-modal="true" aria-labelledby="tpv-title" aria-describedby="tpv-where" onKeyDown={onKey}>
        <header className="tpv-head">
          <div className="tpv-title">
            <b id="tpv-title">{meta.name}</b>
            <span>{funnel ? `${n}-step funnel` : `${n}-page website`} · in your name and colours</span>
          </div>
          <div className="tpv-view" role="group" aria-label="Preview width">
            <button type="button" aria-pressed={view === 'desktop'} onClick={() => setView('desktop')} title="Desktop width"><Monitor size={15} /><span>Desktop</span></button>
            <button type="button" aria-pressed={view === 'phone'} onClick={() => setView('phone')} title="Phone width"><Smartphone size={15} /><span>Phone</span></button>
          </div>
          <button type="button" className="tpv-close" onClick={onClose} aria-label="Close preview"><X size={18} /></button>
        </header>

        <div ref={stage} className="tpv-stage" data-view={view}>
          {n > 1 && (
            <button type="button" className="tpv-side tpv-side-l" onClick={() => go(-1)} disabled={i === 0}
              aria-label={prevName ? `Previous ${unit.toLowerCase()}: ${prevName}` : `Previous ${unit.toLowerCase()}`}>
              <ChevronLeft size={22} />
            </button>
          )}
          <div className="tpv-frame" data-noinvert>
            <div className="tpv-bar" aria-hidden>
              <span /><span /><span />
              <em>{funnel ? `Step ${i + 1}` : 'Page'} · {page.name}</em>
            </div>
            <div className="tpv-body">
              <FitPage key={`${page.id}-${view}`} page={page} height="100%" className="tpv-scroll"
                renderWidth={view === 'phone' ? PHONE_WIDTH : DESKTOP_WIDTH} />
            </div>
          </div>
          {n > 1 && (
            <button type="button" className="tpv-side tpv-side-r" onClick={() => go(1)} disabled={i === n - 1}
              aria-label={nextName ? `Next ${unit.toLowerCase()}: ${nextName}` : `Next ${unit.toLowerCase()}`}>
              <ChevronRight size={22} />
            </button>
          )}
        </div>

        <footer className="tpv-foot">
          {n > 1 && (
            <nav className="tpv-steps" aria-label={funnel ? 'Funnel steps' : 'Website pages'}>
              {pages.map((p, k) => (
                <button key={p.id} type="button" aria-current={k === i ? 'step' : undefined} onClick={() => setI(k)}>
                  <i>{k + 1}</i>{p.name}
                </button>
              ))}
            </nav>
          )}
          <div className="tpv-nav">
            {n > 1 && (
              <button type="button" className="tpv-mini" onClick={() => go(-1)} disabled={i === 0} aria-label={`Previous ${unit.toLowerCase()}`}><ChevronLeft size={18} /></button>
            )}
            <span id="tpv-where" className="tpv-where" aria-live="polite">{where}</span>
            {n > 1 && (
              <button type="button" className="tpv-mini" onClick={() => go(1)} disabled={i === n - 1} aria-label={`Next ${unit.toLowerCase()}`}><ChevronRight size={18} /></button>
            )}
          </div>
          <button type="button" className="tpv-use" onClick={() => { onUse(); onClose(); }}>
            <Check size={16} /> {chosen ? 'Keep this design' : 'Use this design'}
          </button>
        </footer>
      </div>
    </div>,
    document.body,
  );
}
