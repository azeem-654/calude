/**
 * Publish / Publish changes / Unpublish for a website or funnel, with the
 * public link once it is live (audit H3/H4).
 *
 * Sits in both builders' top bars. The answer to "is this public?" comes from
 * the server (services/publishedPages), never from the item's own `status`
 * flag, which said "Published" for years while every visitor met a sign-in
 * screen. `onPublishedChange` keeps that flag in step for older readers.
 */
import { useState } from 'react';
import type { CSSProperties } from 'react';
import { Copy, ExternalLink, Globe, Check } from 'lucide-react';
import { publicUrl, publishItem, unpublishItem, usePublished, type PublishKind } from '../../services/publishedPages';

interface Props {
  kind: PublishKind;
  itemId: string;
  /** Save the builder's current work to the account before the server reads it. */
  beforePublish?: () => void;
  onPublishedChange?: (published: boolean) => void;
  /** The top bar it sits in: the website builder's is dark, the funnel page editor's light. */
  tone?: 'dark' | 'light';
}

export default function PublishControl({ kind, itemId, beforePublish, onPublishedChange, tone = 'dark' }: Props) {
  const pub = usePublished();
  const live = pub.get(kind, itemId);
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState<'' | 'publish' | 'unpublish'>('');
  const [error, setError] = useState('');
  const [note, setNote] = useState('');
  const [copied, setCopied] = useState(false);
  const what = kind === 'site' ? 'website' : 'funnel';
  const url = live ? publicUrl(live.slug) : '';

  async function publish() {
    setBusy('publish'); setError(''); setNote('');
    beforePublish?.();
    const r = await publishItem(kind, itemId);
    setBusy('');
    if (!r.ok) { setError(r.error ?? 'That could not be published.'); return; }
    onPublishedChange?.(true);
    setNote(live ? 'Your changes are live.' : `Your ${what} is live.`);
  }

  async function unpublish() {
    setBusy('unpublish'); setError(''); setNote('');
    const r = await unpublishItem(kind, itemId);
    setBusy('');
    if (!r.ok) { setError(r.error ?? 'That could not be taken down.'); return; }
    onPublishedChange?.(false);
    setNote('Taken down. The link now says the page does not exist.');
  }

  async function copy() {
    try { await navigator.clipboard.writeText(url); setCopied(true); setTimeout(() => setCopied(false), 1600); }
    catch { setError('Copying was blocked by the browser — select the link and copy it instead.'); }
  }

  const dark = tone === 'dark';
  const trigger: CSSProperties = live
    ? { padding: '7px 12px', borderRadius: 7, border: `1px solid ${dark ? '#166534' : '#bbf7d0'}`, background: dark ? '#052e16' : '#f0fdf4', color: dark ? '#86efac' : '#15803d', fontSize: 12, fontWeight: 700, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 6, whiteSpace: 'nowrap' }
    : { padding: '7px 14px', borderRadius: 7, border: 'none', background: '#16a34a', color: '#fff', fontSize: 12.5, fontWeight: 700, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 6, whiteSpace: 'nowrap' };
  const btn = (primary?: boolean, danger?: boolean): CSSProperties => ({
    padding: '8px 12px', borderRadius: 8, fontSize: 12.5, fontWeight: 700, cursor: busy ? 'wait' : 'pointer',
    border: primary ? 'none' : `1px solid ${danger ? '#fecaca' : '#e2e8f0'}`,
    background: primary ? '#16a34a' : '#fff', color: primary ? '#fff' : danger ? '#b91c1c' : '#0f172a',
    display: 'inline-flex', alignItems: 'center', gap: 6, opacity: busy ? 0.7 : 1,
  });

  return (
    <>
      <button type="button" data-testid="publish-trigger" onClick={() => { setOpen(o => !o); setError(''); setNote(''); }} style={trigger}
        title={live ? 'Public — see the link, publish changes or take it down' : `Put this ${what} on a public link`}>
        <Globe size={13} /> {live ? `Live · ${live.views.toLocaleString()} view${live.views === 1 ? '' : 's'}` : 'Publish'}
      </button>
      {open && (
        <>
          <div onClick={() => setOpen(false)} style={{ position: 'fixed', inset: 0, zIndex: 900 }} />
          <div role="dialog" aria-label={`Publish this ${what}`} data-testid="publish-panel"
            style={{ position: 'fixed', top: 60, right: 12, zIndex: 901, width: 'min(360px, calc(100vw - 24px))', boxSizing: 'border-box', background: '#fff', borderRadius: 14, boxShadow: '0 18px 50px rgba(15,23,42,0.28)', border: '1px solid #e2e8f0', padding: 18, fontFamily: 'Inter, system-ui, sans-serif', color: '#0f172a' }}>
            {!pub.loaded ? (
              <div style={{ fontSize: 13, color: '#64748b' }}>Checking whether this is public…</div>
            ) : live ? (
              <>
                <div style={{ fontSize: 14, fontWeight: 800, marginBottom: 4 }}>This {what} is live</div>
                <div style={{ fontSize: 12, color: '#64748b', marginBottom: 10 }}>
                  Anybody with the link can open it — no sign-in. {live.views.toLocaleString()} view{live.views === 1 ? '' : 's'} so far.
                </div>
                <a href={url} target="_blank" rel="noopener noreferrer" data-testid="publish-link"
                  style={{ display: 'block', padding: '9px 11px', borderRadius: 8, background: '#f8fafc', border: '1px solid #e2e8f0', fontSize: 12.5, color: '#4f46e5', fontWeight: 600, wordBreak: 'break-all', textDecoration: 'none', marginBottom: 10 }}>
                  {url}
                </a>
                <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 12 }}>
                  <button type="button" onClick={() => void copy()} style={btn()}>{copied ? <Check size={13} /> : <Copy size={13} />} {copied ? 'Copied' : 'Copy link'}</button>
                  <a href={url} target="_blank" rel="noopener noreferrer" style={{ ...btn(), textDecoration: 'none' }}><ExternalLink size={13} /> Open</a>
                </div>
                <div style={{ fontSize: 12, color: '#64748b', marginBottom: 10, lineHeight: 1.5 }}>
                  Edits in the builder stay private until you publish them.
                </div>
                <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                  <button type="button" disabled={!!busy} onClick={() => void publish()} style={btn(true)} data-testid="publish-changes">
                    {busy === 'publish' ? 'Publishing…' : 'Publish changes'}
                  </button>
                  <button type="button" disabled={!!busy} onClick={() => void unpublish()} style={btn(false, true)} data-testid="publish-unpublish">
                    {busy === 'unpublish' ? 'Taking down…' : 'Unpublish'}
                  </button>
                </div>
              </>
            ) : (
              <>
                <div style={{ fontSize: 14, fontWeight: 800, marginBottom: 4 }}>Publish this {what}</div>
                <div style={{ fontSize: 12.5, color: '#64748b', marginBottom: 12, lineHeight: 1.5 }}>
                  It goes on a public link anybody can open without signing in. You can publish changes or take it down at any time.
                </div>
                {pub.error && <div style={{ fontSize: 12, color: '#b45309', marginBottom: 10 }}>{pub.error}</div>}
                <button type="button" disabled={!!busy} onClick={() => void publish()} style={btn(true)} data-testid="publish-now">
                  {busy === 'publish' ? 'Publishing…' : 'Publish now'}
                </button>
              </>
            )}
            {note && <div style={{ marginTop: 12, fontSize: 12.5, color: '#15803d', fontWeight: 600 }}>{note}</div>}
            {error && <div role="alert" style={{ marginTop: 12, fontSize: 12.5, color: '#b91c1c', lineHeight: 1.5 }}>{error}</div>}
            <div style={{ marginTop: 14, paddingTop: 12, borderTop: '1px solid #f1f5f9', fontSize: 11.5, color: '#94a3b8', lineHeight: 1.5 }}>
              Your own domain cannot be connected to a {what} yet. Share this link, or link to it from your existing site.
            </div>
          </div>
        </>
      )}
    </>
  );
}
