/**
 * Starting a project: what it is for, whose it is, and what it should achieve.
 *
 * Three questions, on one screen. It was tempting to make this a multi-step
 * wizard — there is a lot behind it — but a wizard is the right shape when
 * later steps depend on earlier answers, and these do not. Three fields that
 * all fit on a phone is a thing somebody finishes; five screens is a thing they
 * abandon halfway and never come back to.
 *
 * The client comes from the portfolios already in the workspace, or is added
 * here. Many projects share one portfolio, so an agency describes a client once
 * and can then push them three different ways.
 */
import { useState } from 'react';
import { X, Plus, Loader, Globe, Check } from 'lucide-react';
import { useApp } from '../../context/AppContext';
import {
  saveProject, savePortfolio, readPortfolioFromUrl, KIND_LABEL, KIND_BLURB,
  type Portfolio, type ProjectKind,
} from '../../services/projects';

const INK = '#17191c';
const MUTED = '#6b7280';
const LINE = '#e6e9f0';
const inp: React.CSSProperties = { width: '100%', padding: '10px 12px', border: `1px solid ${LINE}`, borderRadius: 10, fontSize: 13, color: INK, outline: 'none', boxSizing: 'border-box', fontFamily: 'inherit' };
const lbl: React.CSSProperties = { display: 'block', fontSize: 12, fontWeight: 700, color: '#475569', marginBottom: 5 };

const KINDS: ProjectKind[] = ['leadgen', 'consultancy', 'ecommerce'];

export default function NewProject({
  portfolios, onClose, onCreated,
}: {
  portfolios: Portfolio[];
  onClose: () => void;
  onCreated: () => void;
}) {
  const { addNotification } = useApp();
  const [kind, setKind] = useState<ProjectKind>('leadgen');
  const [name, setName] = useState('');
  const [objective, setObjective] = useState('');
  const [portfolioId, setPortfolioId] = useState(portfolios[0]?.id ?? '');
  const [busy, setBusy] = useState(false);

  /* Adding a client without leaving: the alternative is sending somebody to a
     different screen mid-thought and hoping they come back. */
  const [adding, setAdding] = useState(!portfolios.length);
  const [clientName, setClientName] = useState('');
  const [clientDoes, setClientDoes] = useState('');
  const [clientWho, setClientWho] = useState('');
  const [clientSite, setClientSite] = useState('');
  /* Everything the reader found that these four fields have no room for. Kept
     so the saved portfolio is the whole reading, not the part that fitted on
     this form. */
  const [extra, setExtra] = useState<Record<string, string>>({});
  const [reading, setReading] = useState(false);
  /* Where the answers came from, shown on the form. Somebody reviewing fields
     a machine filled in should be able to see that is what happened. */
  const [readFrom, setReadFrom] = useState('');

  const readSite = async () => {
    const url = clientSite.trim();
    if (!url) { addNotification('Paste the client\u2019s website address first.', 'error'); return; }
    setReading(true);
    const r = await readPortfolioFromUrl(url);
    setReading(false);
    if (!r.success || !r.profile) { addNotification(r.error ?? 'That page could not be read.', 'error'); return; }
    const p = r.profile;
    /* Filled in, not overwritten: somebody who has already typed the name
       meant it, and a machine reading a marketing page should not win. */
    if (!clientName.trim() && p.companyName) setClientName(p.companyName);
    if (!clientDoes.trim() && p.description) setClientDoes(p.description);
    if (!clientWho.trim() && p.audience) setClientWho(p.audience);
    if (p.website) setClientSite(p.website);
    setExtra({ offer: p.offer ?? '', industry: p.industry ?? '', tone: p.tone ?? '', locations: p.locations ?? '' });
    setReadFrom(r.readFrom ?? url);
    addNotification('Read from the site. Check it over before you start — this is what everything gets written from.', 'success');
  };

  const create = async () => {
    setBusy(true);
    let pid = portfolioId;

    if (adding) {
      if (!clientName.trim()) { setBusy(false); addNotification('Give the client a name.', 'error'); return; }
      const p = await savePortfolio({
        name: clientName.trim(),
        profile: {
          ...extra,
          companyName: clientName.trim(),
          description: clientDoes.trim(),
          audience: clientWho.trim(),
          website: clientSite.trim(),
        },
        /* Stamped so the portfolio says where it came from. A description a
           person wrote and one a page was read into are worth different
           amounts of trust when something it wrote reads oddly. */
        source: readFrom ? 'url' : 'manual',
      });
      if (!p.success || !p.id) { setBusy(false); addNotification(p.error ?? 'Could not save the client.', 'error'); return; }
      pid = p.id;
    }

    const r = await saveProject({ name: name.trim(), objective: objective.trim(), portfolioId: pid, kind });
    setBusy(false);
    if (!r.success) { addNotification(r.error ?? 'Could not start the project.', 'error'); return; }
    addNotification(`"${name.trim()}" started. Autopilot plans it within a day.`, 'success');
    onCreated();
  };

  return (
    <div
      role="dialog" aria-modal="true" aria-label="New project"
      onClick={e => { if (e.target === e.currentTarget) onClose(); }}
      onKeyDown={e => { if (e.key === 'Escape') onClose(); }}
      style={{
        position: 'fixed', inset: 0, zIndex: 400, background: 'rgba(17,19,22,0.45)',
        display: 'flex', alignItems: 'flex-start', justifyContent: 'center',
        padding: 20, overflowY: 'auto',
      }}
    >
      <div style={{
        background: '#fff', borderRadius: 20, width: '100%', maxWidth: 540,
        marginTop: 40, padding: 20, display: 'grid', gap: 16,
        boxShadow: '0 24px 60px -12px rgba(23,25,28,0.3)',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <h2 style={{ margin: 0, fontSize: 17, fontWeight: 800, color: INK, flex: 1 }}>New project</h2>
          <button onClick={onClose} aria-label="Close" style={{ border: 'none', background: 'none', cursor: 'pointer', color: MUTED, display: 'flex' }}>
            <X size={18} />
          </button>
        </div>

        <div>
          <label style={lbl}>What is this project for?</label>
          <div style={{ display: 'grid', gap: 8 }}>
            {KINDS.map(k => (
              <button key={k} onClick={() => setKind(k)} aria-pressed={kind === k}
                style={{
                  textAlign: 'left', padding: '11px 13px', borderRadius: 12, cursor: 'pointer',
                  border: kind === k ? `1.5px solid ${INK}` : `1.5px solid ${LINE}`,
                  background: kind === k ? '#fff' : 'rgba(255,255,255,0.6)',
                  fontFamily: 'inherit',
                }}>
                <span style={{ display: 'block', fontSize: 13, fontWeight: 700, color: INK }}>{KIND_LABEL[k]}</span>
                <span style={{ display: 'block', fontSize: 11.5, color: MUTED, marginTop: 2, lineHeight: 1.45 }}>{KIND_BLURB[k]}</span>
              </button>
            ))}
          </div>
        </div>

        <div>
          <label style={lbl} htmlFor="pj-name">Call it something you will recognise</label>
          <input id="pj-name" value={name} onChange={e => setName(e.target.value)} style={inp}
            placeholder={kind === 'ecommerce' ? 'Supplement range launch' : 'Dental client acquisition'} />
        </div>

        <div>
          <label style={lbl}>Which client is it for?</label>
          {!adding ? (
            <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
              <select value={portfolioId} onChange={e => setPortfolioId(e.target.value)} style={{ ...inp, cursor: 'pointer' }}>
                {portfolios.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
              </select>
              <button onClick={() => setAdding(true)} style={{
                display: 'inline-flex', alignItems: 'center', gap: 5, padding: '10px 13px',
                borderRadius: 10, border: `1px solid ${LINE}`, background: '#fff',
                fontSize: 12.5, fontWeight: 700, color: INK, cursor: 'pointer', whiteSpace: 'nowrap',
              }}><Plus size={13} /> New</button>
            </div>
          ) : (
            <div style={{ display: 'grid', gap: 9, padding: 12, border: `1px solid ${LINE}`, borderRadius: 12, background: '#f7f8fa' }}>
              <input value={clientName} onChange={e => setClientName(e.target.value)} style={inp} placeholder="Client name — e.g. Bright Smile Dental" />
              <input value={clientDoes} onChange={e => setClientDoes(e.target.value)} style={inp} placeholder="What do they do?" />
              <input value={clientWho} onChange={e => setClientWho(e.target.value)} style={inp} placeholder="Who buys it?" />
              <div style={{ display: 'flex', gap: 7, alignItems: 'center', flexWrap: 'wrap' }}>
                <input value={clientSite} onChange={e => setClientSite(e.target.value)}
                  style={{ ...inp, flex: 1, minWidth: 150 }} placeholder="Website — e.g. brightsmile.co.uk" />
                <button onClick={() => void readSite()} disabled={reading} type="button" style={{
                  display: 'inline-flex', alignItems: 'center', gap: 5, padding: '10px 13px',
                  borderRadius: 10, border: 'none', background: INK, color: '#fff',
                  fontSize: 12.5, fontWeight: 700, cursor: reading ? 'default' : 'pointer',
                  opacity: reading ? 0.65 : 1, whiteSpace: 'nowrap',
                }}>
                  {reading ? <Loader size={13} /> : <Globe size={13} />}
                  {reading ? 'Reading…' : 'Read their site'}
                </button>
              </div>
              {readFrom && (
                <p style={{ margin: 0, fontSize: 11.5, color: '#166534', lineHeight: 1.5, display: 'flex', gap: 5, alignItems: 'flex-start' }}>
                  <Check size={13} style={{ flexShrink: 0, marginTop: 1 }} />
                  <span>Filled in from <strong>{readFrom}</strong>. Correct anything it got wrong — nothing is saved until you start the project.</span>
                </p>
              )}
              <p style={{ margin: 0, fontSize: 11.5, color: MUTED, lineHeight: 1.5 }}>
                Everything Autopilot writes for this project comes from here. Paste their website and it reads
                these in for you, or type them yourself. Other projects for the same client share it.
              </p>
              {portfolios.length > 0 && (
                <button onClick={() => setAdding(false)} style={{ border: 'none', background: 'none', color: INK, fontSize: 12, fontWeight: 700, cursor: 'pointer', justifySelf: 'start', padding: 0, textDecoration: 'underline' }}>
                  Use an existing client instead
                </button>
              )}
            </div>
          )}
        </div>

        <div>
          <label style={lbl} htmlFor="pj-obj">What should it achieve?</label>
          <textarea id="pj-obj" value={objective} onChange={e => setObjective(e.target.value)} rows={2}
            style={{ ...inp, resize: 'vertical' }}
            placeholder={kind === 'ecommerce'
              ? 'Sell 200 units a month and keep buyers coming back'
              : 'Find and book 20 dental practices a month within 20 miles'} />
          <p style={{ margin: '5px 0 0', fontSize: 11.5, color: MUTED, lineHeight: 1.5 }}>
            One sentence, in your own words. Autopilot reads it every time it decides what to do next.
          </p>
        </div>

        <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
          <button onClick={onClose} style={{
            padding: '10px 16px', borderRadius: 10, border: `1px solid ${LINE}`,
            background: '#fff', fontSize: 13, fontWeight: 700, color: INK, cursor: 'pointer',
          }}>Cancel</button>
          <button onClick={() => void create()} disabled={busy} style={{
            display: 'inline-flex', alignItems: 'center', gap: 6,
            padding: '10px 18px', borderRadius: 10, border: 'none',
            background: INK, color: '#fff', fontSize: 13, fontWeight: 700, cursor: 'pointer',
          }}>
            {busy && <Loader size={13} className="spin" />} Start project
          </button>
        </div>
      </div>
    </div>
  );
}
