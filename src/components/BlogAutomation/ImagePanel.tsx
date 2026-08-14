import { useMemo, useRef, useState } from 'react';
import { Check, Download, Image as ImageIcon, Loader2, RefreshCw, Trash2, Upload } from 'lucide-react';
import { useApp } from '../../context/AppContext';
import { COVER_TEMPLATES, type CoverTemplate } from '../../lib/coverArt';
import {
  coverOf, headingsIn, imageBytes, imagesOf, insertFigure, makeCover, makeInline,
  readImageUpload, readableBytes, removeFigure, withImages,
} from '../../services/blogImages';
import type { Article, ArticleImage, BlogProject, PlannedPost } from '../../types/blogAutomation';

/**
 * The pictures for one post.
 *
 * A cover is generated rather than asked for, because a post with no image
 * loses its share preview and its search thumbnail, and "upload one" is exactly
 * the step that does not happen twenty times a month. Everything after that is
 * a correction: pick a different card, replace it with your own photograph,
 * rewrite the alt text, put an image inside the article.
 *
 * The alt field is the one thing here that is never filled in on your behalf
 * for an uploaded image. We have not seen that picture, and inventing a
 * description of it would put a confident lie in the one field a blind reader
 * has no way to check.
 */

const INK = '#17191c';
const MUTED = '#6b7480';
const LINE = '#e3e6eb';
const LIME = '#c7f441';
const ON_LIME = '#0e1117';
const LIME_EDGE = '#a8d327';
const WARN = '#fab219';
const BAD = '#d03b3b';

interface Props {
  post: PlannedPost;
  project: BlogProject;
  onSave: (article: Article) => void;
}

export default function ImagePanel({ post, project, onSave }: Props) {
  const { addNotification } = useApp();
  const [template, setTemplate] = useState<CoverTemplate>('editorial');
  const [busy, setBusy] = useState(false);
  const [anchor, setAnchor] = useState('');
  const [caption, setCaption] = useState('');
  const fileRef = useRef<HTMLInputElement>(null);

  const article = post.article;
  const images = imagesOf(article);
  const cover = coverOf(article);
  const headings = useMemo(() => headingsIn(article?.html ?? ''), [article?.html]);
  const inBody = (img: ArticleImage) => !!article && article.html.includes(img.dataUrl);

  if (!article) return null;

  const save = (next: Article, message?: string) => {
    onSave(next);
    if (message) addNotification(message, 'success');
  };

  function generateCover() {
    setBusy(true);
    try {
      const next = makeCover(post, project, template);
      // One cover at a time; the old one is replaced and pulled out of the body
      // if it was in there, so a stale picture cannot linger in the article.
      const rest = images.filter(i => i.role !== 'cover');
      const html = cover ? removeFigure(article!.html, cover) : article!.html;
      save({ ...article!, html, images: [next, ...rest] }, `Cover made — ${readableBytes(next.bytes)}`);
    } catch (err) {
      addNotification(err instanceof Error ? err.message : 'The cover could not be drawn.', 'error');
    } finally {
      setBusy(false);
    }
  }

  async function upload(file: File) {
    setBusy(true);
    try {
      const img = await readImageUpload(file);
      const rest = images.filter(i => i.role !== 'cover');
      const html = cover ? removeFigure(article!.html, cover) : article!.html;
      save({ ...article!, html, images: [img, ...rest] },
        'Uploaded and re-encoded. Add alt text — it is empty until you write it.');
    } catch (err) {
      addNotification(err instanceof Error ? err.message : 'That image could not be read.', 'error');
    } finally {
      setBusy(false);
      if (fileRef.current) fileRef.current.value = '';
    }
  }

  function setAlt(id: string, alt: string) {
    onSave(withImages(article!, images.map(i => (i.id === id ? { ...i, alt } : i))));
  }

  function toggleInBody(img: ArticleImage) {
    if (inBody(img)) {
      save({ ...article!, html: removeFigure(article!.html, img) }, 'Taken out of the article');
      return;
    }
    if (!img.alt.trim()) {
      addNotification('Write the alt text first — an image with none is worth nothing to a search engine and invisible to a screen reader.', 'error');
      return;
    }
    save({ ...article!, html: insertFigure(article!.html, img, img.anchor, img.role === 'cover' ? caption : '') },
      'Placed in the article');
  }

  function addInline() {
    if (!anchor) { addNotification('Choose which section it should sit under.', 'error'); return; }
    setBusy(true);
    try {
      const img = makeInline(post, project, template, anchor);
      save({ ...article!, html: insertFigure(article!.html, img, anchor), images: [...images, img] },
        `Section image added under “${anchor}”`);
      setAnchor('');
    } catch (err) {
      addNotification(err instanceof Error ? err.message : 'That image could not be drawn.', 'error');
    } finally {
      setBusy(false);
    }
  }

  function remove(img: ArticleImage) {
    save({
      ...article!,
      html: removeFigure(article!.html, img),
      images: images.filter(i => i.id !== img.id),
    }, 'Image deleted');
  }

  function download(img: ArticleImage) {
    const a = document.createElement('a');
    a.href = img.dataUrl;
    a.download = `${post.title.replace(/[^\w -]/g, '').slice(0, 60) || 'cover'}.jpg`;
    a.click();
  }

  const missingAlt = images.filter(i => !i.alt.trim()).length;

  return (
    <section style={{
      border: `1px solid ${LINE}`, borderRadius: 16, backgroundColor: '#fff', padding: 14, marginBottom: 14,
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', marginBottom: 11 }}>
        <ImageIcon size={14} color={INK} />
        <h5 style={{ margin: 0, fontSize: 13, fontWeight: 800, color: INK }}>Pictures</h5>
        <span style={{ fontSize: 11, color: MUTED }}>
          {images.length ? `${images.length} image${images.length === 1 ? '' : 's'} · ${readableBytes(imageBytes(article))}` : 'none yet'}
        </span>
        {missingAlt > 0 && (
          <span style={{ fontSize: 11, fontWeight: 700, color: BAD }}>
            {missingAlt} still needs alt text
          </span>
        )}
      </div>

      {/* Card design. The same picker drives the cover and any section image. */}
      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 11 }}>
        {COVER_TEMPLATES.map(t => (
          <button
            key={t.id}
            onClick={() => setTemplate(t.id)}
            aria-pressed={template === t.id}
            title={t.note}
            className="press"
            style={template === t.id ? primary() : ghost()}
          >
            {t.label}
          </button>
        ))}
      </div>

      <div style={{ display: 'flex', gap: 7, flexWrap: 'wrap', marginBottom: 13 }}>
        <button onClick={generateCover} disabled={busy} className="press" style={{ ...primary(), opacity: busy ? 0.55 : 1 }}>
          {busy ? <><Loader2 size={12} className="spin" /> Drawing…</> : <><RefreshCw size={12} /> {cover ? 'Redraw cover' : 'Make a cover'}</>}
        </button>
        <button onClick={() => fileRef.current?.click()} disabled={busy} className="press" style={ghost()}>
          <Upload size={12} /> Use my own
        </button>
        <input
          ref={fileRef}
          type="file"
          accept="image/jpeg,image/png,image/webp,image/gif"
          onChange={e => { const f = e.target.files?.[0]; if (f) void upload(f); }}
          style={{ display: 'none' }}
        />
      </div>

      {images.length === 0 ? (
        <p style={{ margin: 0, fontSize: 11.5, color: MUTED, lineHeight: 1.6 }}>
          No picture yet. Without one, every share of this post — Facebook, LinkedIn, X, Slack, WhatsApp —
          shows a blank rectangle where the preview should be.
        </p>
      ) : (
        <div style={{ display: 'grid', gap: 12 }}>
          {images.map(img => (
            <div key={img.id} style={{
              display: 'flex', gap: 12, flexWrap: 'wrap',
              padding: 11, borderRadius: 14, backgroundColor: '#fbfcfd', border: `1px solid ${LINE}`,
            }}>
              <img
                src={img.dataUrl}
                alt={img.alt || 'Generated image with no alt text yet'}
                style={{ width: 190, height: 'auto', borderRadius: 9, border: `1px solid ${LINE}`, flexShrink: 0 }}
              />
              <div style={{ flex: '1 1 260px', minWidth: 0 }}>
                <p style={{ margin: '0 0 6px', fontSize: 11, color: MUTED }}>
                  {img.role === 'cover' ? 'Cover' : `Section — ${img.anchor}`} · {img.width}×{img.height} ·{' '}
                  {readableBytes(img.bytes)} · {img.source === 'uploaded' ? 'your file' : img.template}
                  {inBody(img) && <strong style={{ color: '#0ca30c' }}> · in the article</strong>}
                </p>

                <label style={{ display: 'block', fontSize: 11, fontWeight: 700, color: INK, marginBottom: 4 }}>
                  Alt text {!img.alt.trim() && <span style={{ color: BAD }}>— required before it can go in</span>}
                </label>
                <textarea
                  value={img.alt}
                  onChange={e => setAlt(img.id, e.target.value)}
                  rows={2}
                  placeholder="Describe what is in the picture, for someone who cannot see it."
                  style={{
                    width: '100%', padding: '7px 10px', borderRadius: 10, fontSize: 12, lineHeight: 1.5,
                    border: `1px solid ${img.alt.trim() ? LINE : WARN}`, backgroundColor: '#fff',
                    color: INK, fontFamily: 'inherit', outline: 'none', resize: 'vertical', boxSizing: 'border-box',
                  }}
                />

                {img.role === 'cover' && !inBody(img) && (
                  <input
                    value={caption}
                    onChange={e => setCaption(e.target.value)}
                    placeholder="Caption — optional"
                    style={{
                      width: '100%', marginTop: 6, padding: '7px 10px', borderRadius: 10, fontSize: 12,
                      border: `1px solid ${LINE}`, backgroundColor: '#fff', color: INK,
                      fontFamily: 'inherit', outline: 'none', boxSizing: 'border-box',
                    }}
                  />
                )}

                <div style={{ display: 'flex', gap: 7, marginTop: 8, flexWrap: 'wrap' }}>
                  <button onClick={() => toggleInBody(img)} className="press" style={ghost()}>
                    <Check size={12} /> {inBody(img) ? 'Take out of the article' : 'Put in the article'}
                  </button>
                  <button onClick={() => download(img)} className="press" style={ghost()}>
                    <Download size={12} /> Save
                  </button>
                  <button onClick={() => remove(img)} className="press" style={{ ...ghost(), color: BAD }}>
                    <Trash2 size={12} /> Delete
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* A picture inside the article, tied to one of its own headings. */}
      {headings.length > 0 && (
        <div style={{ display: 'flex', gap: 7, alignItems: 'center', flexWrap: 'wrap', marginTop: 13 }}>
          <label htmlFor={`anchor-${post.id}`} style={{ fontSize: 11.5, color: MUTED }}>
            Add a section image under
          </label>
          <select
            id={`anchor-${post.id}`}
            value={anchor}
            onChange={e => setAnchor(e.target.value)}
            style={{
              padding: '8px 11px', borderRadius: 10, border: `1px solid ${LINE}`,
              backgroundColor: '#fff', fontSize: 12, color: INK, fontFamily: 'inherit',
              maxWidth: 280, outline: 'none',
            }}
          >
            <option value="">Choose a section…</option>
            {headings.map(h => <option key={h} value={h}>{h}</option>)}
          </select>
          <button onClick={addInline} disabled={busy || !anchor} className="press" style={{ ...ghost(), opacity: anchor ? 1 : 0.55 }}>
            Add
          </button>
        </div>
      )}
    </section>
  );
}

function primary(): React.CSSProperties {
  return {
    display: 'inline-flex', alignItems: 'center', gap: 6, padding: '8px 13px',
    borderRadius: 999, border: `1px solid ${LIME_EDGE}`, backgroundColor: LIME,
    color: ON_LIME, fontSize: 11.5, fontWeight: 800, cursor: 'pointer', whiteSpace: 'nowrap',
  };
}

function ghost(): React.CSSProperties {
  return {
    display: 'inline-flex', alignItems: 'center', gap: 6, padding: '8px 12px',
    borderRadius: 999, border: `1px solid ${LINE}`, backgroundColor: '#fff',
    color: INK, fontSize: 11.5, fontWeight: 700, cursor: 'pointer', whiteSpace: 'nowrap',
  };
}
