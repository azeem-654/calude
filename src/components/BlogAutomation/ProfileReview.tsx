import { useState } from 'react';
import { Info, Plus, Target, Trash2, X } from 'lucide-react';
import { newId } from '../../services/blogAutomation';
import { classifyIntent, clusterStats, estimateDifficulty } from '../../services/seoProfile';
import type {
  BlogProject, MoneyPage, SearchIntent, TopicCluster,
} from '../../types/blogAutomation';

/**
 * The strategy, and the right to disagree with it.
 *
 * Everything on this screen was inferred — by a model or by counting words —
 * and the person reading it knows their own business better than either. So all
 * of it is editable, and the module records that a human has been through it so
 * a later rebuild cannot quietly undo their corrections.
 *
 * The difficulty numbers are labelled as estimates wherever they appear. They
 * come from the shape of the phrase, not from search volume, and presenting a
 * guess in the visual language of measured data is how a tool loses trust.
 */

const INK = '#17191c';
const MUTED = '#6b7480';
const LINE = '#e3e6eb';

const INTENT_META: Record<SearchIntent, { label: string; bg: string; ink: string; why: string }> = {
  informational: { label: 'Learning', bg: '#e6f0fb', ink: '#1c5cab', why: 'Someone researching — where a blog wins readers' },
  commercial: { label: 'Comparing', bg: '#fdeecd', ink: '#8a5c05', why: 'Weighing options — a post can tip the decision' },
  transactional: { label: 'Ready to buy', bg: '#d7f0d7', ink: '#0a7a0a', why: 'Ready to act — usually a money page, not a post' },
  navigational: { label: 'Your brand', bg: '#eceef2', ink: '#4a5260', why: 'Already looking for you' },
};

interface Props {
  project: BlogProject;
  onChange: (next: BlogProject) => void;
}

export default function ProfileReview({ project, onChange }: Props) {
  const [newTerm, setNewTerm] = useState<Record<string, string>>({});

  const set = (patch: Partial<BlogProject>) => onChange({ ...project, ...patch });
  const setSeo = (patch: Partial<BlogProject['seo']>) => set({ seo: { ...project.seo, ...patch } });
  const setVoice = (patch: Partial<BlogProject['voice']>) => set({ voice: { ...project.voice, ...patch } });

  const setClusters = (clusters: TopicCluster[]) => set({ clusters });

  function addTerm(clusterId: string) {
    const term = (newTerm[clusterId] ?? '').trim();
    if (!term) return;
    setClusters(project.clusters.map(c => c.id !== clusterId ? c : {
      ...c,
      keywords: [...c.keywords, {
        term,
        // Classified the same way as everything else, so a hand-added term is
        // not a second-class citizen with no intent.
        intent: classifyIntent(term),
        difficulty: estimateDifficulty(term),
        weight: 0,
      }],
    }));
    setNewTerm({ ...newTerm, [clusterId]: '' });
  }

  function addMoneyPage() {
    const page: MoneyPage = { id: newId('mp'), title: '', url: '', purpose: '', primaryKeyword: '' };
    set({ moneyPages: [...project.moneyPages, page] });
  }

  const setPage = (id: string, patch: Partial<MoneyPage>) =>
    set({ moneyPages: project.moneyPages.map(p => (p.id === id ? { ...p, ...patch } : p)) });

  const card: React.CSSProperties = {
    backgroundColor: '#fff', borderRadius: 20, border: `1px solid ${LINE}`, padding: 18,
  };
  const input: React.CSSProperties = {
    width: '100%', padding: '9px 12px', borderRadius: 11, border: `1px solid ${LINE}`,
    fontSize: 12.5, color: INK, outline: 'none', fontFamily: 'inherit', boxSizing: 'border-box',
  };
  const label: React.CSSProperties = {
    display: 'block', fontSize: 10.5, fontWeight: 800, color: MUTED, marginBottom: 5,
    textTransform: 'uppercase', letterSpacing: '0.05em',
  };

  if (project.clusters.length === 0) {
    return (
      <div style={{ ...card, textAlign: 'center', padding: '40px 22px' }}>
        <h3 style={{ margin: '0 0 7px', fontSize: 16, fontWeight: 800, color: INK }}>No strategy yet</h3>
        <p style={{ margin: 0, fontSize: 12.5, color: MUTED }}>
          Add a portfolio and press <strong>Build strategy</strong> — this fills in from what you have written.
        </p>
      </div>
    );
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>

      {/* How this was produced — said plainly, at the top. */}
      <div style={{
        display: 'flex', alignItems: 'flex-start', gap: 9, padding: '12px 15px',
        borderRadius: 14, backgroundColor: '#f5f7fa', border: `1px solid ${LINE}`,
      }}>
        <Info size={14} color={MUTED} style={{ flexShrink: 0, marginTop: 1 }} />
        <p style={{ margin: 0, fontSize: 11.5, color: MUTED, lineHeight: 1.6 }}>
          {project.profileSource === 'ai'
            ? 'Read by the AI from your portfolio, then every number re-checked here.'
            : 'Read from your portfolio text — no AI key configured, so this is the plain reading.'}
          {project.profileNote ? ` ${project.profileNote}` : ''}
          {' '}Difficulty is an <strong>estimate from the shape of the phrase</strong> — how long, how
          specific, how commercial. It is not search volume; nothing here queried Google.
          {project.edited ? ' You have edited this, so a rebuild will not silently undo your changes to the pages below.' : ''}
        </p>
      </div>

      {/* ── The business ── */}
      <section style={card}>
        <h3 style={{ margin: '0 0 12px', fontSize: 15, fontWeight: 800, color: INK }}>The business</h3>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: 12 }}>
          <div>
            <label style={label} htmlFor="ba-offering">What you sell</label>
            <textarea id="ba-offering" rows={2} value={project.seo.offering}
              onChange={e => setSeo({ offering: e.target.value })}
              placeholder="We install and service combi boilers."
              style={{ ...input, resize: 'vertical' }} />
          </div>
          <div>
            <label style={label} htmlFor="ba-audience">Who you sell to</label>
            <textarea id="ba-audience" rows={2} value={project.seo.audience}
              onChange={e => setSeo({ audience: e.target.value })}
              placeholder="Homeowners who want a fixed price."
              style={{ ...input, resize: 'vertical' }} />
          </div>
          <div>
            <label style={label} htmlFor="ba-location">Location</label>
            <input id="ba-location" value={project.seo.location}
              onChange={e => setSeo({ location: e.target.value })}
              placeholder="Leave blank if you are not local"
              style={input} />
            <p style={{ margin: '5px 0 0', fontSize: 10.5, color: MUTED }}>
              Set this and posts can chase "near me" searches, which are far easier to win.
            </p>
          </div>
          <div>
            <label style={label} htmlFor="ba-domain">Domain to publish to</label>
            <input id="ba-domain" value={project.domain}
              onChange={e => set({ domain: e.target.value.trim() })}
              placeholder="yourdomain.com"
              style={input} />
            <p style={{ margin: '5px 0 0', fontSize: 10.5, color: MUTED }}>
              Used in Part 5. Nothing publishes anywhere yet.
            </p>
          </div>
        </div>
      </section>

      {/* ── Voice ── */}
      <section style={card}>
        <h3 style={{ margin: '0 0 4px', fontSize: 15, fontWeight: 800, color: INK }}>How you write</h3>
        <p style={{ margin: '0 0 12px', fontSize: 11.5, color: MUTED }}>
          Posts are written to match this, so a wrong reading here shows up in every article.
        </p>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 12 }}>
          <div>
            <label style={label} htmlFor="ba-tone">Tone</label>
            <input id="ba-tone" value={project.voice.tone} onChange={e => setVoice({ tone: e.target.value })} style={input} />
          </div>
          <div>
            <label style={label} htmlFor="ba-level">Reading level</label>
            <select id="ba-level" value={project.voice.readingLevel}
              onChange={e => setVoice({ readingLevel: e.target.value as BlogProject['voice']['readingLevel'] })}
              style={{ ...input, cursor: 'pointer' }}>
              <option value="plain">Plain</option>
              <option value="standard">Standard</option>
              <option value="technical">Technical</option>
            </select>
          </div>
          <div>
            <label style={label} htmlFor="ba-person">Voice</label>
            <select id="ba-person" value={project.voice.person}
              onChange={e => setVoice({ person: e.target.value as BlogProject['voice']['person'] })}
              style={{ ...input, cursor: 'pointer' }}>
              <option value="we">We</option>
              <option value="i">I</option>
              <option value="neutral">Neutral</option>
            </select>
          </div>
          <div>
            <label style={label} htmlFor="ba-len">Average sentence</label>
            <input id="ba-len" type="number" min={6} max={40} value={project.voice.averageSentenceWords}
              onChange={e => setVoice({ averageSentenceWords: Math.max(6, Math.min(40, Number(e.target.value) || 18)) })}
              style={input} />
            <p style={{ margin: '5px 0 0', fontSize: 10.5, color: MUTED }}>words — measured, not guessed</p>
          </div>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: 12, marginTop: 12 }}>
          <TagField
            title="Phrases you actually use"
            values={project.voice.signaturePhrases}
            onChange={v => setVoice({ signaturePhrases: v })}
            placeholder="Add a phrase"
          />
          <TagField
            title="Never use these"
            values={project.voice.avoid}
            onChange={v => setVoice({ avoid: v })}
            placeholder="Add a word to avoid"
          />
        </div>
      </section>

      {/* ── Pages that must rank ── */}
      <section style={card}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 10, marginBottom: 4 }}>
          <h3 style={{ margin: 0, fontSize: 15, fontWeight: 800, color: INK }}>Pages that have to rank</h3>
          <button onClick={addMoneyPage} className="press" style={ghost()}><Plus size={12} /> Add page</button>
        </div>
        <p style={{ margin: '0 0 12px', fontSize: 11.5, color: MUTED, lineHeight: 1.6 }}>
          The pages that actually earn. Posts link to these in context, and those internal links are the
          mechanism by which a blog lifts a service page — without them the writing ranks for itself and
          nothing else.
        </p>

        {project.moneyPages.length === 0 ? (
          <p style={{ margin: 0, fontSize: 12, color: MUTED }}>
            None yet. Import a site on the Portfolio tab and its pages arrive with their URLs.
          </p>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 9 }}>
            {project.moneyPages.map(page => (
              <div key={page.id} style={{
                display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(170px, 1fr)) 32px',
                gap: 9, alignItems: 'end', padding: 11, borderRadius: 13, backgroundColor: '#f7f8fa',
              }}>
                <div>
                  <label style={label}>Page</label>
                  <input value={page.title} onChange={e => setPage(page.id, { title: e.target.value })}
                    placeholder="Boiler servicing" style={input} />
                </div>
                <div>
                  <label style={label}>URL</label>
                  <input value={page.url} onChange={e => setPage(page.id, { url: e.target.value })}
                    placeholder="https://…" style={input} />
                </div>
                <div>
                  <label style={label}>Term it should own</label>
                  <input value={page.primaryKeyword} onChange={e => setPage(page.id, { primaryKeyword: e.target.value })}
                    placeholder="boiler service bristol" style={input} />
                </div>
                <button
                  onClick={() => set({ moneyPages: project.moneyPages.filter(p => p.id !== page.id) })}
                  aria-label={`Remove ${page.title || 'page'}`}
                  className="press"
                  style={{
                    width: 32, height: 32, borderRadius: 999, border: `1px solid ${LINE}`,
                    backgroundColor: '#fff', color: '#c2410c', cursor: 'pointer',
                    display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                  }}
                >
                  <Trash2 size={13} />
                </button>
              </div>
            ))}
          </div>
        )}
      </section>

      {/* ── Clusters ── */}
      <section style={card}>
        <h3 style={{ margin: '0 0 4px', fontSize: 15, fontWeight: 800, color: INK }}>Topic clusters</h3>
        <p style={{ margin: '0 0 14px', fontSize: 11.5, color: MUTED, lineHeight: 1.6 }}>
          One pillar with supporting posts around it, all linking to the same page. That structure is what
          builds authority on a subject — a scatter of unrelated articles does not.
        </p>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          {project.clusters.map(c => {
            const st = clusterStats(c);
            return (
              <div key={c.id} style={{ borderRadius: 16, border: `1px solid ${LINE}`, padding: 14 }}>
                <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap', marginBottom: 9 }}>
                  <input
                    value={c.pillar}
                    onChange={e => setClusters(project.clusters.map(x => x.id === c.id ? { ...x, pillar: e.target.value } : x))}
                    aria-label="Pillar topic"
                    style={{ ...input, flex: '1 1 200px', fontWeight: 800, fontSize: 13.5 }}
                  />
                  <select
                    value={c.targetPageId ?? ''}
                    onChange={e => setClusters(project.clusters.map(x => x.id === c.id ? { ...x, targetPageId: e.target.value || undefined } : x))}
                    aria-label="Page this cluster should lift"
                    style={{ ...input, flex: '0 1 210px', cursor: 'pointer' }}
                  >
                    <option value="">Which page should this lift?</option>
                    {project.moneyPages.map(p => (
                      <option key={p.id} value={p.id}>{p.title || p.url || 'Untitled page'}</option>
                    ))}
                  </select>
                  <button
                    onClick={() => setClusters(project.clusters.filter(x => x.id !== c.id))}
                    aria-label={`Remove cluster ${c.pillar}`}
                    className="press"
                    style={{
                      width: 32, height: 32, borderRadius: 999, border: `1px solid ${LINE}`,
                      backgroundColor: '#fff', color: '#c2410c', cursor: 'pointer',
                      display: 'inline-flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
                    }}
                  >
                    <Trash2 size={13} />
                  </button>
                </div>

                <div style={{ display: 'flex', gap: 14, fontSize: 10.5, color: MUTED, marginBottom: 10, flexWrap: 'wrap' }}>
                  <span><strong style={{ color: INK }}>{st.terms}</strong> terms</span>
                  <span><strong style={{ color: '#0a7a0a' }}>{st.easy}</strong> winnable</span>
                  <span>avg difficulty <strong style={{ color: INK }}>{st.averageDifficulty}</strong> (estimate)</span>
                  <span><strong style={{ color: INK }}>{c.keywords.filter(k => k.weight > 0).length}</strong> from your writing</span>
                  {!c.targetPageId && (
                    <span style={{ color: '#b3302f', fontWeight: 700 }}>
                      <Target size={10} style={{ verticalAlign: -1 }} /> no page to lift
                    </span>
                  )}
                </div>

                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                  {c.keywords.map(k => {
                    const meta = INTENT_META[k.intent];
                    return (
                      <span
                        key={k.term}
                        title={`${meta.why} · estimated difficulty ${k.difficulty}/100 · ${
                          k.weight
                            ? `used ${k.weight}× in your own writing`
                            : 'a suggested long-tail variant, not something you wrote'
                        }`}
                        style={{
                          display: 'inline-flex', alignItems: 'center', gap: 6, padding: '5px 10px',
                          borderRadius: 999, backgroundColor: meta.bg, color: meta.ink,
                          fontSize: 11, fontWeight: 700,
                        }}
                      >
                        {/* A dot marks a term the portfolio actually used. A
                            suggested variant must not look like evidence. */}
                        {k.weight > 0 && (
                          <span aria-hidden="true" style={{
                            width: 5, height: 5, borderRadius: 999, backgroundColor: 'currentColor', flexShrink: 0,
                          }} />
                        )}
                        {k.term}
                        <span style={{ fontSize: 9.5, opacity: 0.85, fontVariantNumeric: 'tabular-nums' }}>{k.difficulty}</span>
                        <button
                          onClick={() => setClusters(project.clusters.map(x => x.id === c.id
                            ? { ...x, keywords: x.keywords.filter(y => y.term !== k.term) } : x))}
                          aria-label={`Remove ${k.term}`}
                          style={{ border: 'none', background: 'none', padding: 0, cursor: 'pointer', color: 'inherit', display: 'flex' }}
                        >
                          <X size={10} />
                        </button>
                      </span>
                    );
                  })}
                </div>

                <div style={{ display: 'flex', gap: 7, marginTop: 10 }}>
                  <input
                    value={newTerm[c.id] ?? ''}
                    onChange={e => setNewTerm({ ...newTerm, [c.id]: e.target.value })}
                    onKeyDown={e => { if (e.key === 'Enter') addTerm(c.id); }}
                    placeholder="Add a search phrase you know people use"
                    aria-label={`Add a keyword to ${c.pillar}`}
                    style={{ ...input, flex: 1 }}
                  />
                  <button onClick={() => addTerm(c.id)} className="press" style={ghost()}>Add</button>
                </div>
              </div>
            );
          })}
        </div>

        {/* The legend, so the colours are never the only carrier of meaning. */}
        <div style={{ display: 'flex', gap: 9, flexWrap: 'wrap', marginTop: 14 }}>
          {(Object.keys(INTENT_META) as SearchIntent[]).map(k => (
            <span key={k} style={{
              display: 'inline-flex', alignItems: 'center', gap: 6, padding: '4px 10px',
              borderRadius: 999, backgroundColor: INTENT_META[k].bg, color: INTENT_META[k].ink,
              fontSize: 10.5, fontWeight: 700,
            }}>
              {INTENT_META[k].label}
              <span style={{ opacity: 0.75, fontWeight: 600 }}>· {INTENT_META[k].why}</span>
            </span>
          ))}
          <span style={{
            display: 'inline-flex', alignItems: 'center', gap: 6, padding: '4px 10px',
            borderRadius: 999, backgroundColor: '#f0f2f5', color: MUTED, fontSize: 10.5, fontWeight: 700,
          }}>
            <span aria-hidden="true" style={{ width: 5, height: 5, borderRadius: 999, backgroundColor: INK }} />
            A dot means you already write about it · no dot is a suggested variant
          </span>
        </div>
      </section>
    </div>
  );
}

/* ── A small editable tag list ── */

function TagField({ title, values, onChange, placeholder }: {
  title: string; values: string[]; onChange: (v: string[]) => void; placeholder: string;
}) {
  const [draft, setDraft] = useState('');
  const add = () => {
    const v = draft.trim();
    if (!v || values.includes(v)) { setDraft(''); return; }
    onChange([...values, v].slice(0, 12));
    setDraft('');
  };
  return (
    <div>
      <span style={{
        display: 'block', fontSize: 10.5, fontWeight: 800, color: MUTED, marginBottom: 6,
        textTransform: 'uppercase', letterSpacing: '0.05em',
      }}>{title}</span>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 7 }}>
        {values.length === 0 && <span style={{ fontSize: 11, color: MUTED }}>None</span>}
        {values.map(v => (
          <span key={v} style={{
            display: 'inline-flex', alignItems: 'center', gap: 5, padding: '4px 9px',
            borderRadius: 999, backgroundColor: '#f0f2f5', color: INK, fontSize: 11, fontWeight: 700,
          }}>
            {v}
            <button onClick={() => onChange(values.filter(x => x !== v))} aria-label={`Remove ${v}`}
              style={{ border: 'none', background: 'none', padding: 0, cursor: 'pointer', color: MUTED, display: 'flex' }}>
              <X size={10} />
            </button>
          </span>
        ))}
      </div>
      <div style={{ display: 'flex', gap: 6 }}>
        <input
          value={draft}
          onChange={e => setDraft(e.target.value)}
          onKeyDown={e => { if (e.key === 'Enter') add(); }}
          placeholder={placeholder}
          aria-label={title}
          style={{
            flex: 1, padding: '8px 11px', borderRadius: 10, border: `1px solid ${LINE}`,
            fontSize: 12, color: INK, outline: 'none', fontFamily: 'inherit', minWidth: 0,
          }}
        />
        <button onClick={add} className="press" style={ghost()}>Add</button>
      </div>
    </div>
  );
}

function ghost(): React.CSSProperties {
  return {
    display: 'inline-flex', alignItems: 'center', gap: 5, padding: '8px 13px',
    borderRadius: 999, border: `1px solid ${LINE}`, backgroundColor: '#fff',
    color: INK, fontSize: 11.5, fontWeight: 700, cursor: 'pointer', whiteSpace: 'nowrap',
  };
}
