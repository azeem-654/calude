/**
 * A published website or funnel. Three ways to arrive:
 *   protectedcentral.com/<brand>[/<page>]   `scope="brand"` (2026-11-19, the owner's address)
 *   a customer's own domain showing their site   `scope="host"` — the path under the brand they chose
 *   …/s/<brand>/<page> or /s/<slug>          the older addresses, kept so links already sent still work
 *
 * Reached signed out and signed in, on the app host and on a reseller's own
 * domain: it is the visitor's page, so no app chrome, no login and nothing
 * from AppContext. Everything comes from `published.php get`, which serves the
 * copy the owner last published — not their unsaved edits.
 *
 * Several pages: a small bar of page names, like the preview. A nav link in
 * the content whose address names one of the pages ("/about", "#pricing",
 * "about") switches to it instead of leaving for an address on the app.
 * A funnel's buttons outside a form move on to the next step — that is what a
 * funnel's call to action means, and a button that does nothing on a public
 * page is the dead end this replaces. Forms submit through the form they are
 * bound to (BlockRender's FormBlock → engage.php), which files the contact in
 * the page owner's workspace.
 */
import { useEffect, useMemo, useState } from 'react';
import type { MouseEvent } from 'react';
import { useParams } from 'react-router-dom';
import { API_BASE } from '../../services/apiBase';
import { PageBlocks } from '../shared/BlockRender';
import type { FunnelStep } from '../../types';

interface Snapshot {
  kind: 'site' | 'funnel';
  name: string;
  pages: FunnelStep[];
  seo: { title?: string; description?: string; keywords?: string; image?: string };
}

/** Set (or add) a <meta> for the life of the page, putting back what was there. */
function useMeta(attr: 'name' | 'property', key: string, value: string) {
  useEffect(() => {
    if (!value) return;
    let el = document.head.querySelector<HTMLMetaElement>(`meta[${attr}="${key}"]`);
    const made = !el;
    const before = el?.getAttribute('content') ?? null;
    if (!el) { el = document.createElement('meta'); el.setAttribute(attr, key); document.head.appendChild(el); }
    el.setAttribute('content', value);
    return () => {
      if (made) el?.remove();
      else if (before !== null) el?.setAttribute('content', before);
    };
  }, [attr, key, value]);
}

const norm = (s: string) => s.toLowerCase().replace(/^[#/]+|\/+$/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');

export default function PublicPage({ scope }: { scope?: 'brand' | 'host' }) {
  /* `/s/<brand>/<page>` (a page under the company's short name) or an older
     `/s/<slug>`; the server tries the two-part address first. On the public
     site and a customer's domain the address is the path itself. */
  const { slug: first = '', '*': rest = '' } = useParams<{ slug: string; '*': string }>();
  const base = (import.meta.env.BASE_URL || '/').replace(/\/$/, '');
  const path = window.location.pathname.slice(base.length).toLowerCase().replace(/^\/+|\/+$/g, '').split('/').slice(0, 2).join('/');
  const slug = scope ? path : [first, rest.split('/')[0]].filter(Boolean).join('/');
  const [snap, setSnap] = useState<Snapshot | null>(null);
  const [state, setState] = useState<'loading' | 'ready' | 'missing' | 'unreachable'>('loading');
  const [idx, setIdx] = useState(0);

  useEffect(() => {
    let live = true;
    fetch(`${API_BASE}/api/published.php`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(scope ? { action: 'get', slug, scope, hostname: window.location.hostname } : { action: 'get', slug }),
    })
      .then(r => r.json())
      .then((d: { success?: boolean; page?: Snapshot }) => {
        if (!live) return;
        if (!d.success || !d.page) { setState('missing'); return; }
        const pages = Array.isArray(d.page.pages) ? d.page.pages.filter(p => p && Array.isArray(p.blocks)) : [];
        setSnap({ ...d.page, pages, seo: d.page.seo ?? {} });
        setState('ready');
      })
      .catch(() => { if (live) setState('unreachable'); });
    return () => { live = false; };
  }, [slug, scope]);

  const title = snap ? (snap.seo.title || snap.name) : state === 'missing' ? 'Page not found' : '';
  useEffect(() => {
    if (!title) return;
    const before = document.title;
    document.title = title.slice(0, 120);
    return () => { document.title = before; };
  }, [title]);
  useMeta('name', 'description', snap?.seo.description ?? '');
  useMeta('name', 'keywords', snap?.seo.keywords ?? '');
  useMeta('property', 'og:title', snap ? title : '');
  useMeta('property', 'og:description', snap?.seo.description ?? '');
  useMeta('property', 'og:image', snap?.seo.image ?? '');

  const pages = useMemo(() => snap?.pages ?? [], [snap]);
  const page = pages[Math.min(idx, Math.max(0, pages.length - 1))];

  /* Page names and slugs a link may point at. */
  const index = useMemo(() => {
    const m = new Map<string, number>();
    pages.forEach((p, i) => { [p.slug, p.name].forEach(k => { const n = norm(k || ''); if (n && !m.has(n)) m.set(n, i); }); });
    return m;
  }, [pages]);

  const go = (i: number) => { setIdx(i); window.scrollTo({ top: 0 }); };

  const onClick = (e: MouseEvent<HTMLDivElement>) => {
    const t = e.target as HTMLElement;
    const a = t.closest('a');
    if (a) {
      const href = a.getAttribute('href') ?? '';
      if (/^(https?:|mailto:|tel:)/i.test(href)) return;
      const n = norm(href);
      if (n === '' || n === 'home') { e.preventDefault(); go(0); return; }
      const to = index.get(n);
      if (to !== undefined) { e.preventDefault(); go(to); return; }
      /* An in-page anchor that exists stays an anchor; anything else would
         leave for an address on the app's host, which is not this site. */
      if (href.startsWith('#') && document.getElementById(href.slice(1))) return;
      e.preventDefault();
      return;
    }
    if (snap?.kind !== 'funnel') return;
    const b = t.closest('button');
    if (!b || b.closest('[data-pp-form]')) return;
    if (idx < pages.length - 1) go(idx + 1);
  };

  if (state !== 'ready' || !snap) {
    const msg = state === 'loading' ? null
      : state === 'unreachable'
        ? { h: 'This page could not be loaded', p: 'The connection failed. Check your internet connection and reload.' }
        : { h: 'Page not found', p: 'There is no page at this address. It may have been taken down or the link may be mistyped.' };
    return (
      <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24, boxSizing: 'border-box', fontFamily: 'Inter, system-ui, sans-serif', background: '#f8fafc' }}>
        {msg ? (
          <div style={{ textAlign: 'center', maxWidth: 420 }}>
            <h1 style={{ fontSize: 24, fontWeight: 800, color: '#0f172a', margin: '0 0 8px' }}>{msg.h}</h1>
            <p style={{ color: '#64748b', margin: 0, lineHeight: 1.6 }}>{msg.p}</p>
          </div>
        ) : (
          <div aria-busy="true" style={{ color: '#94a3b8', fontSize: 14 }}>Loading…</div>
        )}
      </div>
    );
  }

  return (
    <div style={{ minHeight: '100vh', background: '#fff', fontFamily: 'Inter, system-ui, sans-serif', overflowX: 'hidden' }}>
      {pages.length > 1 && (
        <nav aria-label="Pages" style={{ position: 'sticky', top: 0, zIndex: 50, background: 'rgba(255,255,255,0.96)', borderBottom: '1px solid #e2e8f0', display: 'flex', gap: 4, padding: '8px 12px', overflowX: 'auto' }}>
          {pages.map((p, i) => (
            <button key={p.id} type="button" onClick={() => go(i)} aria-current={i === idx ? 'page' : undefined}
              style={{ padding: '6px 12px', borderRadius: 8, border: 'none', whiteSpace: 'nowrap', cursor: 'pointer', fontSize: 13, fontWeight: 600, background: i === idx ? '#0f172a' : 'transparent', color: i === idx ? '#fff' : '#475569' }}>
              {p.name}
            </button>
          ))}
        </nav>
      )}
      <main onClick={onClick}>
        {page ? <PageBlocks page={page} /> : null}
      </main>
    </div>
  );
}
