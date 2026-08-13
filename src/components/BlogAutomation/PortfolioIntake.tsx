import { useRef, useState } from 'react';
import {
  FileText, Globe, Link2, Loader2, Sparkles, Trash2, Upload,
} from 'lucide-react';
import { useApp } from '../../context/AppContext';
import {
  MAX_TOTAL_CHARS, READABLE_TYPES, htmlToText, makePortfolioItem,
  portfolioChars, readPortfolioFile, validateUpload,
} from '../../services/blogAutomation';
import { distilWithAI } from '../../services/seoProfile';
import type { BlogProject, PortfolioItem } from '../../types/blogAutomation';

/**
 * Getting the customer's own writing in.
 *
 * Four ways in, because businesses keep their words in four places: pasted,
 * uploaded, on a URL, or already inside a site in this app. The last is the
 * best of them — importing an existing page brings its URL with it, which is
 * what lets a later post link to it in context, which is the whole mechanism by
 * which a blog moves a money page's ranking.
 */

const INK = '#17191c';
const MUTED = '#6b7480';
const LINE = '#e3e6eb';
const LIME = '#c7f441';
const ON_LIME = '#0e1117';
const LIME_EDGE = '#a8d327';

const KIND_ICON = { text: FileText, file: Upload, url: Link2, 'site-page': Globe } as const;

interface Props {
  project: BlogProject;
  onChange: (next: BlogProject) => void;
  onDistilled: (next: BlogProject) => void;
}

export default function PortfolioIntake({ project, onChange, onDistilled }: Props) {
  const { addNotification, websites } = useApp();
  const fileRef = useRef<HTMLInputElement>(null);

  const [paste, setPaste] = useState('');
  const [pasteLabel, setPasteLabel] = useState('');
  const [url, setUrl] = useState('');
  const [busy, setBusy] = useState(false);

  const chars = portfolioChars(project.portfolio);
  const budgetPct = Math.min(100, Math.round((chars / MAX_TOTAL_CHARS) * 100));

  const add = (items: PortfolioItem[]) =>
    onChange({ ...project, portfolio: [...project.portfolio, ...items] });

  function addPaste() {
    const text = paste.trim();
    if (text.length < 80) {
      addNotification('Paste a bit more — under eighty characters says nothing about a voice.', 'error');
      return;
    }
    add([makePortfolioItem('text', pasteLabel || 'Pasted text', text)]);
    setPaste('');
    setPasteLabel('');
    addNotification('Added to the portfolio');
  }

  async function addFiles(list: FileList | null) {
    if (!list?.length) return;
    const accepted: PortfolioItem[] = [];
    let running = chars;
    for (const file of Array.from(list)) {
      const check = validateUpload(file, running);
      if (!check.ok) { addNotification(check.error ?? 'That file was refused.', 'error'); continue; }
      try {
        const text = await readPortfolioFile(file);
        if (text.trim().length < 40) {
          addNotification(`${file.name} had almost no readable text in it.`, 'error');
          continue;
        }
        const item = makePortfolioItem('file', file.name, text);
        running += item.text.length;
        accepted.push(item);
      } catch {
        addNotification(`${file.name} could not be read.`, 'error');
      }
    }
    if (accepted.length) {
      add(accepted);
      addNotification(`${accepted.length} file${accepted.length > 1 ? 's' : ''} added`);
    }
    if (fileRef.current) fileRef.current.value = '';
  }

  /**
   * Fetching someone else's page from the browser hits the same-origin wall,
   * so this asks for the text rather than pretending it can crawl. The URL is
   * still kept, because that is what a later post links to.
   */
  function addUrl() {
    const clean = url.trim();
    if (!/^https?:\/\/\S+\.\S+/i.test(clean)) {
      addNotification('That does not look like a full URL — include https://', 'error');
      return;
    }
    if (project.portfolio.some(i => i.url === clean)) {
      addNotification('That URL is already in the portfolio.', 'error');
      return;
    }
    add([makePortfolioItem('url', clean.replace(/^https?:\/\//, ''), '', { url: clean })]);
    setUrl('');
    addNotification('URL added — paste its text below so it counts towards the strategy');
  }

  /** Pages already in this app: text and URL both come along. */
  function importSite(websiteId: string) {
    const site = websites.find(w => w.id === websiteId);
    if (!site) return;
    const host = site.domain || site.subdomain || '';
    const pages = (site.pages ?? []).map(pg => {
      const text = (pg.blocks ?? [])
        .map(b => {
          const c = b as unknown as { content?: string; text?: string; html?: string };
          return c.content ?? c.text ?? (c.html ? htmlToText(c.html) : '');
        })
        .filter(Boolean)
        .join('\n\n');
      return makePortfolioItem('site-page', `${site.name} · ${pg.name}`, text, {
        url: host ? `https://${host}/${pg.slug}` : undefined,
        websiteId: site.id,
      });
    }).filter(i => i.text.length > 40 || i.url);

    if (!pages.length) {
      addNotification(`"${site.name}" has no pages with readable text yet.`, 'error');
      return;
    }
    add(pages);
    addNotification(`${pages.length} page${pages.length > 1 ? 's' : ''} imported from ${site.name}`);
  }

  function removeItem(id: string) {
    onChange({ ...project, portfolio: project.portfolio.filter(i => i.id !== id) });
  }

  async function build() {
    if (chars < 400) {
      addNotification('There is not enough text yet — aim for a few hundred words.', 'error');
      return;
    }
    setBusy(true);
    try {
      const d = await distilWithAI(project.portfolio);
      onDistilled({
        ...project,
        voice: d.voice,
        seo: { ...d.seo, competitorTerms: d.seo.competitorTerms },
        clusters: d.clusters,
        // Suggestions only fill gaps: a page the user already described by hand
        // must never be overwritten by a re-read.
        moneyPages: project.moneyPages.length
          ? project.moneyPages
          : d.suggestedMoneyPages,
        profileSource: d.source,
        profileNote: d.note,
      });
      if (d.note) addNotification(d.note, 'info');
    } catch {
      addNotification('The strategy could not be built. Try again.', 'error');
    } finally {
      setBusy(false);
    }
  }

  const card: React.CSSProperties = {
    backgroundColor: '#fff', borderRadius: 20, border: `1px solid ${LINE}`, padding: 18,
  };
  const input: React.CSSProperties = {
    width: '100%', padding: '10px 13px', borderRadius: 12, border: `1px solid ${LINE}`,
    fontSize: 13, color: INK, outline: 'none', fontFamily: 'inherit', boxSizing: 'border-box',
  };

  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(330px, 1fr))', gap: 14, alignItems: 'start' }}>

      {/* ── Ways in ── */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>

        <section style={card}>
          <h3 style={h3()}>Paste your writing</h3>
          <p style={sub()}>An about page, a service page, an old post. A few hundred words is enough.</p>
          <input
            value={pasteLabel}
            onChange={e => setPasteLabel(e.target.value)}
            placeholder="What is this? e.g. About page"
            aria-label="Label for the pasted text"
            style={{ ...input, marginBottom: 8 }}
          />
          <textarea
            value={paste}
            onChange={e => setPaste(e.target.value)}
            rows={6}
            placeholder="Paste the text here…"
            aria-label="Portfolio text"
            style={{ ...input, resize: 'vertical', lineHeight: 1.55 }}
          />
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 9 }}>
            <span style={{ fontSize: 11, color: MUTED }}>{paste.trim().length.toLocaleString()} characters</span>
            <button onClick={addPaste} className="press" style={primary()}>Add to portfolio</button>
          </div>
        </section>

        <section style={card}>
          <h3 style={h3()}>Upload files</h3>
          <p style={sub()}>{READABLE_TYPES.join(', ')} — up to 2 MB each. Anything else, paste the text.</p>
          <input
            ref={fileRef}
            type="file"
            multiple
            accept={READABLE_TYPES.join(',')}
            onChange={e => addFiles(e.target.files)}
            aria-label="Upload portfolio files"
            style={{ fontSize: 12, color: MUTED }}
          />
        </section>

        <section style={card}>
          <h3 style={h3()}>Pages already in this app</h3>
          <p style={sub()}>
            The best source: the page's URL comes with it, so posts can link to it — which is how a
            blog actually moves that page up.
          </p>
          {websites.length === 0 ? (
            <p style={{ margin: 0, fontSize: 12, color: MUTED }}>No websites in this workspace yet.</p>
          ) : (
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 7 }}>
              {websites.map(w => (
                <button key={w.id} onClick={() => importSite(w.id)} className="press" style={ghost()}>
                  <Globe size={12} /> {w.name}
                </button>
              ))}
            </div>
          )}
        </section>

        <section style={card}>
          <h3 style={h3()}>A URL to link to</h3>
          <p style={sub()}>
            Kept as a link target. A browser cannot fetch another site's page, so paste its text above
            if you want it read too — this does not pretend to crawl.
          </p>
          <div style={{ display: 'flex', gap: 8 }}>
            <input
              value={url}
              onChange={e => setUrl(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter') addUrl(); }}
              placeholder="https://example.com/services"
              aria-label="Page URL"
              style={input}
            />
            <button onClick={addUrl} className="press" style={ghost()}>Add</button>
          </div>
        </section>
      </div>

      {/* ── What is in there ── */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
        <section style={card}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: 10 }}>
            <h3 style={{ ...h3(), margin: 0 }}>Portfolio</h3>
            <span style={{ fontSize: 11, color: MUTED }}>
              {project.portfolio.length} item{project.portfolio.length === 1 ? '' : 's'} · {(chars / 1000).toFixed(1)}k chars
            </span>
          </div>

          <div style={{ height: 6, borderRadius: 999, backgroundColor: '#e6e9ee', overflow: 'hidden', margin: '10px 0 4px' }}>
            <div style={{
              width: `${Math.max(budgetPct, 1)}%`, height: '100%', borderRadius: 999,
              backgroundColor: budgetPct > 90 ? '#d03b3b' : '#65a30d',
            }} />
          </div>
          <p style={{ margin: '0 0 12px', fontSize: 10.5, color: MUTED }}>
            {budgetPct}% of the reading budget used
          </p>

          {project.portfolio.length === 0 ? (
            <p style={{ margin: 0, fontSize: 12.5, color: MUTED, lineHeight: 1.6 }}>
              Nothing yet. Anything you add on the left shows up here, and you can remove it again.
            </p>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 7, maxHeight: 340, overflowY: 'auto' }}>
              {project.portfolio.map(item => {
                const Icon = KIND_ICON[item.kind];
                return (
                  <div key={item.id} style={{
                    display: 'flex', alignItems: 'center', gap: 9, padding: '9px 11px',
                    borderRadius: 12, backgroundColor: '#f7f8fa',
                  }}>
                    <Icon size={13} color={MUTED} style={{ flexShrink: 0 }} />
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <p style={{
                        margin: 0, fontSize: 12, fontWeight: 700, color: INK,
                        overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                      }}>{item.label}</p>
                      <p style={{ margin: 0, fontSize: 10.5, color: MUTED }}>
                        {item.text.length
                          ? `${item.text.length.toLocaleString()} chars`
                          : 'link only — no text read'}
                        {item.url ? ' · linkable' : ''}
                      </p>
                    </div>
                    <button
                      onClick={() => removeItem(item.id)}
                      aria-label={`Remove ${item.label}`}
                      className="press"
                      style={{
                        border: 'none', background: 'none', cursor: 'pointer', color: '#c2410c',
                        display: 'flex', flexShrink: 0, padding: 3,
                      }}
                    >
                      <Trash2 size={13} />
                    </button>
                  </div>
                );
              })}
            </div>
          )}
        </section>

        <section style={{ ...card, borderColor: chars >= 400 ? LIME_EDGE : LINE }}>
          <h3 style={h3()}>Build the ranking strategy</h3>
          <p style={sub()}>
            Reads what you sell, who you sell to, and the terms worth chasing — grouped into clusters
            with an intent and a difficulty on each. You can correct all of it afterwards.
          </p>
          <button onClick={build} disabled={busy || chars < 400} className="press" style={{
            ...primary(),
            opacity: busy || chars < 400 ? 0.5 : 1,
            cursor: busy || chars < 400 ? 'not-allowed' : 'pointer',
          }}>
            {busy
              ? <><Loader2 size={13} className="spin" /> Reading…</>
              : <><Sparkles size={13} /> {project.clusters.length ? 'Rebuild strategy' : 'Build strategy'}</>}
          </button>
          {chars < 400 && (
            <p style={{ margin: '9px 0 0', fontSize: 11, color: MUTED }}>
              Needs about 400 characters of real writing first — {chars} so far.
            </p>
          )}
          {project.clusters.length > 0 && (
            <p style={{ margin: '9px 0 0', fontSize: 11, color: MUTED }}>
              Rebuilding replaces the clusters. Pages you have described by hand are kept.
            </p>
          )}
        </section>
      </div>
    </div>
  );
}

/* ── Styles ── */

const h3 = (): React.CSSProperties => ({
  margin: '0 0 5px', fontSize: 14, fontWeight: 800, color: INK, letterSpacing: '-0.01em',
});
const sub = (): React.CSSProperties => ({
  margin: '0 0 11px', fontSize: 11.5, color: MUTED, lineHeight: 1.6,
});
function primary(): React.CSSProperties {
  return {
    display: 'inline-flex', alignItems: 'center', gap: 6, padding: '10px 17px',
    borderRadius: 999, border: `1px solid ${LIME_EDGE}`, backgroundColor: LIME,
    color: ON_LIME, fontSize: 12, fontWeight: 800, cursor: 'pointer', whiteSpace: 'nowrap',
  };
}
function ghost(): React.CSSProperties {
  return {
    display: 'inline-flex', alignItems: 'center', gap: 6, padding: '9px 14px',
    borderRadius: 999, border: `1px solid ${LINE}`, backgroundColor: '#fff',
    color: INK, fontSize: 11.5, fontWeight: 700, cursor: 'pointer', whiteSpace: 'nowrap',
  };
}
