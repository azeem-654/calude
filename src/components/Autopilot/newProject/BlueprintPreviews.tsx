/**
 * The blueprint's two big previews: the website or funnel at full width, and
 * every email the project will send, whole.
 *
 * The thumbnails in ResultPreview were too small to judge a page or read an
 * email, which is what the owner asked for: "a preview of the funnel of the
 * landing page in the blueprint screen in a wide view, and the complete email
 * in full view". Both draw what will actually be built — the template's own
 * pages through the builders' renderer, and the email steps' own subject and
 * body — with merge fields shown as sample values and labelled as such.
 */
import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Maximize2, X } from 'lucide-react';
import type { FunnelStep } from '../../../types';
import type { Palette } from '../../../services/designOptions';
import { PageBlocks } from '../../shared/BlockRender';

const RENDER_WIDTH = 1280;

/** One page, scaled to the box's width, at its whole height — scrolled inside the box. */
function FitPage({ page, height }: { page: FunnelStep; height: number }) {
  const box = useRef<HTMLDivElement>(null);
  const inner = useRef<HTMLDivElement>(null);
  const [scale, setScale] = useState(0);
  const [tall, setTall] = useState(0);
  useLayoutEffect(() => {
    const measure = () => {
      const w = box.current?.clientWidth ?? 0;
      if (w) setScale(w / RENDER_WIDTH);
      setTall(inner.current?.scrollHeight ?? 0);
    };
    measure();
    const ro = new ResizeObserver(measure);
    if (box.current) ro.observe(box.current);
    if (inner.current) ro.observe(inner.current);
    return () => ro.disconnect();
  }, [page]);
  return (
    <div ref={box} className="np-wide-view" style={{ height }} tabIndex={0} aria-label={`${page.name} — scroll to read the whole page`}>
      <div style={{ height: tall * scale, position: 'relative' }}>
        <div ref={inner} style={{ position: 'absolute', top: 0, left: 0, width: RENDER_WIDTH, transform: `scale(${scale})`, transformOrigin: 'top left', pointerEvents: 'none' }}>
          <PageBlocks page={page} />
        </div>
      </div>
    </div>
  );
}

export function WidePagePreview({ pages, kind }: { pages: FunnelStep[]; kind: 'funnel' | 'website' }) {
  const [i, setI] = useState(0);
  const [full, setFull] = useState(false);
  useEffect(() => {
    if (!full) return;
    const k = (e: KeyboardEvent) => { if (e.key === 'Escape') setFull(false); };
    window.addEventListener('keydown', k);
    return () => window.removeEventListener('keydown', k);
  }, [full]);
  const page = pages[Math.min(i, pages.length - 1)];
  if (!page) return null;
  return (
    <div style={{ display: 'grid', gap: 8 }}>
      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', alignItems: 'center' }}>
        {pages.length > 1 && pages.map((p, n) => (
          <button key={p.id} type="button" className="np-opt np-opt-sm" aria-pressed={n === i} onClick={() => setI(n)}>
            {kind === 'funnel' ? `${n + 1}. ` : ''}{p.name}
          </button>
        ))}
        <span style={{ flex: 1 }} />
        <button type="button" className="np-opt np-opt-sm" onClick={() => setFull(true)}><Maximize2 size={12} /> Full screen</button>
      </div>
      <div className="np-browser">
        <div className="np-browser-bar"><span /><span /><span /><em>{kind === 'funnel' ? 'Funnel' : 'Website'} · {page.name}</em></div>
        <FitPage page={page} height={540} />
      </div>
      {full && createPortal(
        <div className="np-full-scrim" role="dialog" aria-label={`${page.name}, full size`} onClick={() => setFull(false)}>
          <div className="np-full-card" onClick={e => e.stopPropagation()}>
            <div className="np-full-head">
              <b>{page.name}</b>
              {pages.length > 1 && pages.map((p, n) => (
                <button key={p.id} type="button" className="np-opt np-opt-sm" aria-pressed={n === i} onClick={() => setI(n)}>{n + 1}. {p.name}</button>
              ))}
              <span style={{ flex: 1 }} />
              <button type="button" className="np-opt np-opt-sm" onClick={() => setFull(false)} aria-label="Close"><X size={13} /> Close</button>
            </div>
            <FitPage page={page} height={window.innerHeight - 110} />
          </div>
        </div>,
        document.body,
      )}
    </div>
  );
}

/* ── The emails, whole ───────────────────────────────────────────────────── */

export interface EmailStep { workflow: string; label: string; subject: string; body: string }

/** Merge fields as the reader of a preview should see them: sample values, marked. */
function sample(text: string, ctx: { name: string; booking: boolean }): (string | { field: string; text: string })[] {
  const SAMPLE: Record<string, string> = {
    firstName: 'Alex', lastName: 'Morgan', name: 'Alex Morgan', company: 'Brightsmile Dental', jobTitle: 'Practice Manager',
    myCompany: ctx.name, senderName: 'you', website: 'your website', bookingLink: ctx.booking ? 'your booking page' : 'your booking link',
    smsOptInLink: 'their own opt-in link',
    personalOpener: 'I saw on your site that you recently opened a second location — congratulations.',
    theirChallenge: 'Businesses that grow like that often find new enquiries slip through while the team is busy.',
  };
  const out: (string | { field: string; text: string })[] = [];
  let last = 0;
  for (const m of text.matchAll(/\{\{\s*(\w+)\s*\}\}/g)) {
    out.push(text.slice(last, m.index));
    out.push({ field: m[1], text: SAMPLE[m[1]] ?? m[1] });
    last = (m.index ?? 0) + m[0].length;
  }
  out.push(text.slice(last));
  return out;
}

const plain = (html: string) => html.replace(/<br\s*\/?>/gi, '\n').replace(/<\/p>/gi, '\n\n').replace(/<[^>]+>/g, '').replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&');

export function FullEmails({ steps, name, logo, palette, layout, booking }: {
  steps: EmailStep[]; name: string; logo: string; palette: Palette; layout: string; booking: boolean;
}) {
  const [i, setI] = useState(0);
  const step = steps[Math.min(i, steps.length - 1)];
  if (!step) return null;
  const framed = layout && layout !== 'plain';
  const body = plain(step.body || '').trim();
  const render = (t: string) => sample(t, { name, booking }).map((p, n) => (typeof p === 'string' ? p
    : <mark key={n} className="np-merge" title={`Filled in for each person: {{${p.field}}}`}>{p.text}</mark>));
  return (
    <div style={{ display: 'grid', gap: 8 }}>
      {steps.length > 1 && (
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
          {steps.map((s, n) => (
            <button key={`${s.workflow}-${n}`} type="button" className="np-opt np-opt-sm" aria-pressed={n === i} onClick={() => setI(n)} title={s.workflow}>
              Email {n + 1}{s.label ? ` · ${s.label.slice(0, 28)}` : ''}
            </button>
          ))}
        </div>
      )}
      <div className="np-mail">
        <div className="np-mail-head">
          <span><b>From</b> {name}</span>
          <span><b>To</b> Alex Morgan &lt;alex@brightsmile.example&gt;</span>
          <span><b>Subject</b> {render(step.subject || '(written when the project is built)')}</span>
          <small>{step.workflow}</small>
        </div>
        <div className="np-mail-body" data-framed={framed ? '1' : undefined}>
          {framed && (
            <div className="np-mail-band" style={{ background: layout === 'branded' || layout === 'card' ? '#fff' : `linear-gradient(135deg, ${palette.bg}, ${palette.bg2})`, borderBottom: `3px solid ${palette.accent}` }}>
              {logo ? <img src={logo} alt="" style={{ height: 30, maxWidth: 150, objectFit: 'contain' }} /> : <b style={{ color: layout === 'branded' || layout === 'card' ? '#17191c' : palette.ink }}>{name}</b>}
            </div>
          )}
          <div className="np-mail-text">
            {body ? body.split(/\n{2,}/).map((par, n) => <p key={n}>{render(par)}</p>)
              : <p style={{ color: '#94a3b8' }}>This email is written for your business when the project is built — from your profile and offer.</p>}
          </div>
        </div>
      </div>
      <span style={{ fontSize: 12, color: '#6b7280' }}>
        Highlighted words are filled in for each person when it is sent. Nothing is sent until you approve it.
      </span>
    </div>
  );
}
