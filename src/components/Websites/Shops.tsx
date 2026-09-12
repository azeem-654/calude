/**
 * The shops this workspace has open, and the one form that opens another.
 *
 * ── Why this is not a "website" ──
 *
 * A website here is pages in a builder, and "published" only means a badge
 * turns green: /preview/<id> renders it for somebody already signed in and a
 * stranger cannot reach it at all. That is fine for a brochure and useless for
 * selling, so a shop is a different record with a real public address and a
 * catalogue behind it. They live on the same screen because "make me a site
 * that sells things" is one thought, not two.
 *
 * The catalogue is deliberately not edited here. Products live under Sell,
 * where cost, supplier reference and orders already are; a second place to
 * type a price is a second price to disagree with the first.
 */
import { useEffect, useState } from 'react';
import { Store, Plus, Trash2, ExternalLink, Copy, Check, Loader, AlertCircle } from 'lucide-react';
import { useApp } from '../../context/AppContext';
import { listShops, saveShop, deleteShop, shopUrl, type Shop } from '../../services/shop';
import { THEME_LIST, themeFor } from '../Shop/themes';
import { fetchBoard, type Project } from '../../services/projects';

const INK = '#0f172a';
const MUTED = '#64748b';
const LINE = '#e2e8f0';

const inp: React.CSSProperties = {
  width: '100%', padding: '10px 12px', border: `1px solid ${LINE}`, borderRadius: 8,
  fontSize: 14, outline: 'none', boxSizing: 'border-box', fontFamily: 'inherit', color: INK,
};
const lbl: React.CSSProperties = { display: 'block', fontSize: 13, fontWeight: 700, color: '#374151', marginBottom: 6 };

type Draft = Partial<Shop>;

export default function Shops() {
  const { addNotification } = useApp();
  const [shops, setShops] = useState<Shop[] | null>(null);
  const [projects, setProjects] = useState<Project[]>([]);
  const [draft, setDraft] = useState<Draft | null>(null);
  const [busy, setBusy] = useState(false);
  const [copied, setCopied] = useState('');
  const [error, setError] = useState('');

  useEffect(() => {
    let live = true;
    void (async () => {
      const [s, b] = await Promise.all([listShops(), fetchBoard()]);
      if (!live) return;
      setShops(s.shops ?? []);
      if (!s.success && s.error) setError(s.error);
      /* Only e-commerce projects are offered: a shop attached to a lead-gen
         push would show that client's catalogue, which is empty by design. */
      setProjects(b.projects.filter(p => p.kind === 'ecommerce'));
    })();
    return () => { live = false; };
  }, []);

  const save = async (d: Draft, status?: Shop['status']) => {
    if (!d.name?.trim()) { addNotification('Give the shop a name.', 'error'); return; }
    setBusy(true);
    const r = await saveShop({ ...d, status: status ?? d.status ?? 'draft' });
    setBusy(false);
    if (!r.success) { addNotification(r.error ?? 'Could not save that.', 'error'); return; }
    setShops(r.shops ?? []);
    setDraft(null);
    addNotification(
      (status ?? d.status) === 'published'
        ? `Open at /shop/${r.slug ?? d.slug}. Anyone with the link can buy.`
        : 'Saved as a draft — nobody can reach it yet.',
      'success',
    );
  };

  const remove = async (s: Shop) => {
    if (!window.confirm(`Delete "${s.name}"? The address /shop/${s.slug} stops working immediately. Orders already placed are kept.`)) return;
    const r = await deleteShop(s.id);
    if (!r.success) { addNotification(r.error ?? 'Could not delete it.', 'error'); return; }
    setShops(r.shops ?? []);
  };

  const copy = (s: Shop) => {
    const url = shopUrl(s.slug);
    void navigator.clipboard?.writeText(url).catch(() => {});
    setCopied(s.id);
    window.setTimeout(() => setCopied(''), 1600);
  };

  if (shops === null) {
    return (
      <div style={{ padding: 40, textAlign: 'center', color: MUTED }}>
        <Loader size={20} style={{ animation: 'spin 1s linear infinite' }} />
      </div>
    );
  }

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12, flexWrap: 'wrap', marginBottom: 20 }}>
        <p style={{ margin: 0, color: MUTED, fontSize: 14, lineHeight: 1.6, maxWidth: 560 }}>
          A shop is a page anyone can open without signing in, listing what you sell and taking
          payment on your own processor. What is in it comes from your active products under{' '}
          <strong>Sell</strong>.
        </p>
        <button
          onClick={() => setDraft({ accent: '#0f172a', status: 'draft', template: 'classic' })}
          style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '11px 20px', background: '#6366f1', color: '#fff', border: 'none', borderRadius: 10, fontSize: 14, fontWeight: 700, cursor: 'pointer' }}
        >
          <Plus size={18} /> New Shop
        </button>
      </div>

      {error && (
        <div style={{ display: 'flex', gap: 8, alignItems: 'flex-start', padding: '11px 13px', marginBottom: 16, background: '#fff7ed', border: '1px solid #fed7aa', borderRadius: 10 }}>
          <AlertCircle size={16} color="#c2410c" style={{ flexShrink: 0, marginTop: 1 }} />
          <span style={{ fontSize: 13, color: '#7c2d12', lineHeight: 1.55 }}>{error}</span>
        </div>
      )}

      {draft && (
        <div style={{ background: '#fff', border: `1px solid ${LINE}`, borderRadius: 14, padding: 22, marginBottom: 20, display: 'grid', gap: 14, maxWidth: 640 }}>
          <h3 style={{ margin: 0, fontSize: 16, fontWeight: 800, color: INK }}>
            {draft.id ? 'Edit shop' : 'New shop'}
          </h3>

          <div>
            <label style={lbl}>Shop name</label>
            <input autoFocus value={draft.name ?? ''} onChange={e => setDraft({ ...draft, name: e.target.value })}
              placeholder="Harbour Supply Co." style={inp} />
          </div>

          <div>
            <label style={lbl}>Web address</label>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
              <span style={{ fontSize: 13.5, color: MUTED }}>/shop/</span>
              <input value={draft.slug ?? ''} onChange={e => setDraft({ ...draft, slug: e.target.value })}
                placeholder="harbour-supply" style={{ ...inp, flex: 1, minWidth: 160 }} />
            </div>
            <p style={{ margin: '6px 0 0', fontSize: 12.5, color: MUTED, lineHeight: 1.5 }}>
              Leave it blank and one is made from the name. It has to be unique across the whole
              install, so a very ordinary word may already be taken.
            </p>
          </div>

          <div>
            <label style={lbl}>Headline</label>
            <input value={draft.headline ?? ''} onChange={e => setDraft({ ...draft, headline: e.target.value })}
              placeholder="Marine fittings, next-day across the UK" style={inp} />
          </div>

          <div>
            <label style={lbl}>About</label>
            <textarea value={draft.about ?? ''} onChange={e => setDraft({ ...draft, about: e.target.value })}
              rows={3} placeholder="Who you are and what you sell." style={{ ...inp, resize: 'vertical', lineHeight: 1.55 }} />
          </div>

          {/*
            Pick a look.

            The storefront was one hardcoded layout, so every shop on the
            install looked identical — which is fine for proving a stranger can
            pay and wrong for anybody actually opening a shop. Five deliberately
            different shapes rather than a wall of near-identical ones, each
            previewed with this shop's own accent so the choice is about layout
            rather than about colour.
          */}
          <div>
            <label style={lbl}>Look</label>
            <div style={{ display: 'grid', gap: 8, gridTemplateColumns: 'repeat(auto-fill, minmax(min(140px, 100%), 1fr))' }}>
              {THEME_LIST.map(th => {
                const on = (draft.template ?? 'classic') === th.id;
                const accent = draft.accent || '#0f172a';
                return (
                  <button key={th.id} type="button" onClick={() => setDraft({ ...draft, template: th.id })}
                    title={th.blurb}
                    style={{
                      textAlign: 'left', padding: 0, borderRadius: 12, cursor: 'pointer', overflow: 'hidden',
                      border: `1.5px solid ${on ? INK : LINE}`, background: '#fff', fontFamily: 'inherit',
                      boxShadow: on ? '0 0 0 3px rgba(15,23,42,0.07)' : 'none',
                    }}>
                    {/* A sketch of the layout, not a screenshot: the hero band,
                        then the grid shape that theme actually uses. */}
                    <div style={{ background: th.pageBg, padding: 7 }} aria-hidden="true">
                      <div style={{
                        height: th.hero === 'full' ? 26 : th.hero === 'quiet' ? 10 : 17,
                        borderRadius: Math.min(th.radius, 6),
                        background: th.heroFilled && th.hero !== 'quiet' ? accent : th.line,
                        marginBottom: 6,
                      }} />
                      <div style={{
                        display: 'grid', gap: Math.max(3, Math.round(th.gap / 6)),
                        gridTemplateColumns: `repeat(${th.cardMin < 200 ? 4 : th.cardMin < 280 ? 3 : 2}, 1fr)`,
                      }}>
                        {Array.from({ length: th.cardMin < 200 ? 8 : th.cardMin < 280 ? 6 : 4 }).map((_, i) => (
                          <div key={i} style={{
                            aspectRatio: th.ratio,
                            borderRadius: Math.min(th.radius, 5),
                            background: th.cardBg === th.pageBg ? th.line : th.cardBg,
                            border: th.cardBorder ? `1px solid ${th.line}` : 'none',
                          }} />
                        ))}
                      </div>
                    </div>
                    <div style={{ padding: '7px 9px 9px', borderTop: `1px solid ${LINE}` }}>
                      <div style={{ fontSize: 12.5, fontWeight: 700, color: INK }}>{th.name}</div>
                      <div style={{ fontSize: 11, color: MUTED, marginTop: 2, lineHeight: 1.4 }}>{th.blurb}</div>
                    </div>
                  </button>
                );
              })}
            </div>
          </div>

          <div>
            <label style={lbl}>Picture across the top (optional)</label>
            <input value={draft.heroImage ?? ''} onChange={e => setDraft({ ...draft, heroImage: e.target.value })}
              placeholder="Link to an image" style={inp} />
          </div>

          <div style={{ display: 'flex', gap: 14, flexWrap: 'wrap' }}>
            <div style={{ minWidth: 150 }}>
              <label style={lbl}>Colour</label>
              <input type="color" value={draft.accent ?? '#0f172a'}
                onChange={e => setDraft({ ...draft, accent: e.target.value })}
                style={{ ...inp, padding: 4, height: 40, cursor: 'pointer' }} />
            </div>
            <div style={{ flex: 1, minWidth: 200 }}>
              <label style={lbl}>Project</label>
              <select value={draft.projectId ?? ''} onChange={e => setDraft({ ...draft, projectId: e.target.value })}
                style={inp}>
                <option value="">Everything in this workspace</option>
                {projects.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
              </select>
              <p style={{ margin: '6px 0 0', fontSize: 12.5, color: MUTED, lineHeight: 1.5 }}>
                {projects.length === 0
                  ? 'No “Sell products” project yet — add one under AI Autopilot to keep one client’s catalogue apart from another’s.'
                  : 'Pick one to show only that project’s products.'}
              </p>
            </div>
          </div>

          {/* The three things a buyer looks for before handing over money.
              Left empty they are not shown at all — a "Returns" heading over
              lorem ipsum is worse than no heading. */}
          <div style={{ display: 'grid', gap: 12, gridTemplateColumns: 'repeat(auto-fit, minmax(min(200px, 100%), 1fr))' }}>
            <div>
              <label style={lbl}>Delivery</label>
              <textarea value={draft.shippingNote ?? ''} onChange={e => setDraft({ ...draft, shippingNote: e.target.value })}
                rows={3} placeholder="Next day across the UK, £4.95." style={{ ...inp, resize: 'vertical', lineHeight: 1.5 }} />
            </div>
            <div>
              <label style={lbl}>Returns</label>
              <textarea value={draft.returnsNote ?? ''} onChange={e => setDraft({ ...draft, returnsNote: e.target.value })}
                rows={3} placeholder="30 days, unused and in its packaging." style={{ ...inp, resize: 'vertical', lineHeight: 1.5 }} />
            </div>
            <div>
              <label style={lbl}>Questions to</label>
              <input value={draft.contactEmail ?? ''} onChange={e => setDraft({ ...draft, contactEmail: e.target.value })}
                placeholder="hello@yourshop.com" style={inp} />
              <p style={{ margin: '5px 0 0', fontSize: 11.5, color: MUTED, lineHeight: 1.5 }}>
                Shown at the bottom of the shop.
              </p>
            </div>
          </div>

          <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
            <button onClick={() => void save(draft, 'published')} disabled={busy}
              style={{ padding: '10px 20px', border: 'none', borderRadius: 8, background: INK, color: '#fff', fontSize: 14, fontWeight: 700, cursor: busy ? 'default' : 'pointer', opacity: busy ? 0.6 : 1 }}>
              Save and open it
            </button>
            <button onClick={() => void save(draft, 'draft')} disabled={busy}
              style={{ padding: '10px 20px', border: `1px solid ${LINE}`, borderRadius: 8, background: '#fff', color: INK, fontSize: 14, fontWeight: 600, cursor: 'pointer' }}>
              Save as draft
            </button>
            <button onClick={() => setDraft(null)}
              style={{ padding: '10px 16px', border: 'none', background: 'none', color: MUTED, fontSize: 14, cursor: 'pointer' }}>
              Cancel
            </button>
          </div>
        </div>
      )}

      {shops.length === 0 && !draft ? (
        <div style={{ background: '#fff', border: `1px dashed ${LINE}`, borderRadius: 14, padding: 40, textAlign: 'center' }}>
          <Store size={28} color="#94a3b8" />
          <h3 style={{ margin: '12px 0 6px', fontSize: 16, fontWeight: 800, color: INK }}>No shop yet</h3>
          <p style={{ margin: 0, fontSize: 14, color: MUTED, lineHeight: 1.6 }}>
            Open one and the products you have marked active become something a stranger can buy.
          </p>
        </div>
      ) : (
        <div style={{ display: 'grid', gap: 14, gridTemplateColumns: 'repeat(auto-fill, minmax(min(280px, 100%), 1fr))' }}>
          {shops.map(s => (
            <div key={s.id} style={{ background: '#fff', border: `1px solid ${LINE}`, borderRadius: 14, padding: 18, display: 'flex', flexDirection: 'column', gap: 10 }}>
              <div style={{ display: 'flex', alignItems: 'flex-start', gap: 8, flexWrap: 'wrap' }}>
                <div style={{ width: 32, height: 32, borderRadius: 8, background: s.accent || INK, flexShrink: 0 }} />
                <div style={{ flex: 1, minWidth: 120 }}>
                  <h3 style={{ margin: 0, fontSize: 15, fontWeight: 800, color: INK, lineHeight: 1.3 }}>{s.name}</h3>
                  <div style={{ fontSize: 12.5, color: MUTED, marginTop: 2 }}>/shop/{s.slug}</div>
                </div>
                <span style={{ padding: '3px 9px', borderRadius: 20, fontSize: 11, fontWeight: 700, background: s.status === 'published' ? '#dcfce7' : '#f1f5f9', color: s.status === 'published' ? '#16a34a' : '#64748b' }}>
                  {s.status === 'published' ? '● Open' : '○ Draft'}
                </span>
              </div>

              {s.headline && (
                <p style={{ margin: 0, fontSize: 13, color: MUTED, lineHeight: 1.55 }}>{s.headline}</p>
              )}

              <div style={{ fontSize: 12.5, color: MUTED }}>
                {s.products} {s.products === 1 ? 'product' : 'products'} · {s.orders} {s.orders === 1 ? 'order' : 'orders'}
                {' · '}{themeFor(s.template).name}
                {s.projectName && ` · ${s.projectName}`}
              </div>

              {s.products === 0 && (
                /* Said before it is published rather than discovered by the first
                   visitor to arrive at an empty page. */
                <div style={{ fontSize: 12.5, color: '#7c2d12', background: '#fff7ed', border: '1px solid #fed7aa', borderRadius: 8, padding: '7px 9px', lineHeight: 1.5 }}>
                  Nothing active to sell yet. Add a product under Sell and set it to active.
                </div>
              )}

              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 'auto' }}>
                <button onClick={() => setDraft(s)}
                  style={{ padding: '7px 12px', border: `1px solid ${LINE}`, borderRadius: 8, background: '#fff', color: INK, fontSize: 12.5, fontWeight: 600, cursor: 'pointer' }}>
                  Edit
                </button>
                <button onClick={() => copy(s)}
                  style={{ display: 'inline-flex', alignItems: 'center', gap: 5, padding: '7px 12px', border: `1px solid ${LINE}`, borderRadius: 8, background: '#fff', color: INK, fontSize: 12.5, fontWeight: 600, cursor: 'pointer' }}>
                  {copied === s.id ? <Check size={13} color="#16a34a" /> : <Copy size={13} />}
                  {copied === s.id ? 'Copied' : 'Link'}
                </button>
                {s.status === 'published' && (
                  <a href={shopUrl(s.slug)} target="_blank" rel="noopener noreferrer"
                    style={{ display: 'inline-flex', alignItems: 'center', gap: 5, padding: '7px 12px', border: `1px solid ${LINE}`, borderRadius: 8, background: '#fff', color: INK, fontSize: 12.5, fontWeight: 600, textDecoration: 'none' }}>
                    <ExternalLink size={13} /> Visit
                  </a>
                )}
                <button onClick={() => void remove(s)} title="Delete"
                  style={{ padding: '7px 10px', border: `1px solid ${LINE}`, borderRadius: 8, background: '#fff', color: '#ef4444', cursor: 'pointer' }}>
                  <Trash2 size={13} />
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
