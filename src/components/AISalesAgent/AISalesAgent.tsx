/**
 * AI Sales Agent — the module shell and campaign list.
 *
 * The agent decides what should happen; the existing modules do it. So this
 * screen deliberately shows only what the agent itself knows: the objective, the
 * status, what it has created, and what it has done. Send counts and open rates
 * belong to the modules that own them and are read back from there — they are
 * not shown here until there is a real number to read, because a dashboard that
 * displays a plausible zero is indistinguishable from one displaying a real one.
 */
import { useCallback, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Bot, Plus, Search, Sparkles, X } from 'lucide-react';
import Header from '../Layout/Header';
import { useApp } from '../../context/AppContext';
import { getSession } from '../../services/auth';
import { createCampaign, listCampaigns, takeSaveError } from '../../services/aiCampaigns';
import { logDecision } from '../../services/aiDecisionLog';
import type { AICampaign, AICampaignStatus } from '../../types/aiSalesAgent';
import { CAMPAIGN_STATUS_LABEL } from '../../types/aiSalesAgent';
import { STATUS_TONE, card, ghostBtn, nameFromObjective, primaryBtn, statusPill } from './ui';

type Filter = 'all' | AICampaignStatus;

const FILTERS: { id: Filter; label: string }[] = [
  { id: 'all', label: 'All' },
  { id: 'running', label: 'Running' },
  { id: 'awaiting-approval', label: 'Waiting for approval' },
  { id: 'ready', label: 'Ready to run' },
  { id: 'draft', label: 'Drafts' },
  { id: 'paused', label: 'Paused' },
  { id: 'completed', label: 'Completed' },
];

export default function AISalesAgent() {
  const navigate = useNavigate();
  const { addNotification } = useApp();
  const [campaigns, setCampaigns] = useState<AICampaign[]>(() => listCampaigns());
  const [filter, setFilter] = useState<Filter>('all');
  const [query, setQuery] = useState('');
  const [composing, setComposing] = useState(false);

  const refresh = useCallback(() => setCampaigns(listCampaigns()), []);

  const shown = useMemo(() => {
    const q = query.trim().toLowerCase();
    return campaigns.filter(c => {
      if (filter !== 'all' && c.status !== filter) return false;
      if (!q) return true;
      return c.name.toLowerCase().includes(q)
        || c.objective.toLowerCase().includes(q)
        || c.id.toLowerCase().includes(q);
    });
  }, [campaigns, filter, query]);

  const counts = useMemo(() => {
    const by = new Map<string, number>();
    for (const c of campaigns) by.set(c.status, (by.get(c.status) ?? 0) + 1);
    return by;
  }, [campaigns]);

  return (
    <div>
      <Header title="AI Sales Agent" subtitle="Turn an objective into campaigns the rest of the CRM runs" />

      <div style={{ padding: 'clamp(16px, 3vw, 28px)', display: 'flex', flexDirection: 'column', gap: 18 }}>

        {/* Controls */}
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10, alignItems: 'center' }}>
          <div style={{
            display: 'flex', alignItems: 'center', gap: 8, flex: '1 1 220px', minWidth: 0,
            padding: '9px 13px', backgroundColor: 'white', border: '1px solid #e2e8f0', borderRadius: 10,
          }}>
            <Search size={14} color="#94a3b8" style={{ flexShrink: 0 }} />
            <input
              value={query}
              onChange={e => setQuery(e.target.value)}
              placeholder="Search by name, objective or campaign ID"
              aria-label="Search campaigns"
              style={{ flex: 1, minWidth: 0, border: 'none', outline: 'none', fontSize: 13, background: 'transparent', color: '#0f172a' }}
            />
          </div>
          <button onClick={() => setComposing(true)} className="press" style={primaryBtn}>
            <Plus size={15} /> New campaign
          </button>
        </div>

        {campaigns.length > 0 && (
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
            {FILTERS.map(f => {
              const n = f.id === 'all' ? campaigns.length : (counts.get(f.id) ?? 0);
              if (f.id !== 'all' && n === 0) return null;
              const on = filter === f.id;
              return (
                <button key={f.id} onClick={() => setFilter(f.id)} className="press"
                  style={{
                    padding: '6px 12px', borderRadius: 999, fontSize: 12, fontWeight: 600, cursor: 'pointer',
                    border: `1px solid ${on ? '#17191c' : '#e2e8f0'}`,
                    backgroundColor: on ? '#17191c' : 'white',
                    color: on ? 'white' : '#475569',
                  }}>
                  {f.label} <span style={{ opacity: 0.65 }}>{n}</span>
                </button>
              );
            })}
          </div>
        )}

        {campaigns.length === 0 ? (
          <EmptyState onStart={() => setComposing(true)} />
        ) : shown.length === 0 ? (
          <div style={{ ...card, padding: 28, textAlign: 'center' }}>
            <p style={{ margin: 0, fontSize: 14, color: '#64748b' }}>
              Nothing matches that. Clear the search or pick a different filter.
            </p>
          </div>
        ) : (
          <div style={{ display: 'grid', gap: 12, gridTemplateColumns: 'repeat(auto-fill, minmax(min(100%, 340px), 1fr))' }}>
            {shown.map(c => (
              <CampaignCard key={c.id} campaign={c} onOpen={() => navigate(`/ai-sales-agent/${c.id}`)} />
            ))}
          </div>
        )}
      </div>

      {composing && (
        <NewCampaign
          onClose={() => setComposing(false)}
          onCreated={(c) => {
            setComposing(false);
            refresh();
            addNotification(`${c.id} created`);
            navigate(`/ai-sales-agent/${c.id}`);
          }}
          onError={(msg) => addNotification(msg, 'error')}
        />
      )}
    </div>
  );
}

/* ── The list ──────────────────────────────────────────────────────────── */

function CampaignCard({ campaign, onOpen }: { campaign: AICampaign; onOpen: () => void }) {
  const tone = STATUS_TONE[campaign.status];
  const created = new Date(campaign.createdAt);
  return (
    <button onClick={onOpen} className="press"
      style={{
        ...card, padding: 18, textAlign: 'left', cursor: 'pointer', width: '100%',
        display: 'flex', flexDirection: 'column', gap: 10, font: 'inherit',
      }}>
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 10 }}>
        <div style={{ minWidth: 0 }}>
          <p style={{ margin: 0, fontSize: 15, fontWeight: 700, color: '#0f172a', overflow: 'hidden', textOverflow: 'ellipsis' }}>
            {campaign.name}
          </p>
          <p style={{ margin: '2px 0 0', fontSize: 11, color: '#94a3b8', fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace' }}>
            {campaign.id}
          </p>
        </div>
        <span style={statusPill(tone)}>{CAMPAIGN_STATUS_LABEL[campaign.status]}</span>
      </div>

      <p style={{
        margin: 0, fontSize: 13, color: '#475569', lineHeight: 1.55,
        display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden',
      }}>
        {campaign.objective || 'No objective written yet.'}
      </p>

      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 12, fontSize: 11.5, color: '#94a3b8', marginTop: 'auto' }}>
        <span>Created {created.toLocaleDateString()}</span>
        {/* What it has actually built, which is a real number even before it runs. */}
        <span>{campaign.links.length} linked {campaign.links.length === 1 ? 'record' : 'records'}</span>
        {campaign.strategy && <span>{campaign.strategy.targetCount.toLocaleString()} target</span>}
      </div>
    </button>
  );
}

function EmptyState({ onStart }: { onStart: () => void }) {
  return (
    <div style={{ ...card, padding: 'clamp(24px, 5vw, 44px)', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 14, textAlign: 'center' }}>
      <div style={{ width: 52, height: 52, borderRadius: 16, backgroundColor: '#f0f1f3', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <Bot size={24} color="#17191c" />
      </div>
      <div style={{ maxWidth: 460 }}>
        <h2 style={{ margin: 0, fontSize: 18, fontWeight: 700, color: '#0f172a' }}>No campaigns yet</h2>
        <p style={{ margin: '6px 0 0', fontSize: 13.5, color: '#64748b', lineHeight: 1.6 }}>
          Describe what you want in your own words — who to reach, what you are offering,
          how to follow up. The agent works out a plan and runs it through your existing
          email, SMS and calendar, so everything it creates stays editable in those modules.
        </p>
      </div>
      <button onClick={onStart} className="press" style={primaryBtn}>
        <Sparkles size={15} /> Describe an objective
      </button>
    </div>
  );
}

/* ── Creating one ──────────────────────────────────────────────────────── */

const EXAMPLE = 'Find dental clinics in Texas with more than one location that could afford a £3,000/month marketing service. Email them, follow up three times, then try SMS, and book meetings with anyone interested.';

function NewCampaign({ onClose, onCreated, onError }: {
  onClose: () => void;
  onCreated: (c: AICampaign) => void;
  onError: (msg: string) => void;
}) {
  const [name, setName] = useState('');
  const [objective, setObjective] = useState('');
  const ready = objective.trim().length >= 15;

  const submit = () => {
    if (!ready) return;
    const text = objective.trim();
    const campaign = createCampaign({
      name: name.trim() || nameFromObjective(text),
      objective: text,
      createdBy: getSession()?.user?.email,
    });
    if (!campaign) { onError(takeSaveError() || 'The campaign could not be saved.'); return; }

    logDecision(campaign.id, {
      kind: 'plan',
      summary: 'Campaign created',
      because: `Objective given by ${getSession()?.user?.email || 'a user'}: “${text.slice(0, 160)}${text.length > 160 ? '…' : ''}”`,
    });
    onCreated(campaign);
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="New AI Sales Agent campaign"
      onClick={e => { if (e.target === e.currentTarget) onClose(); }}
      style={{
        position: 'fixed', inset: 0, backgroundColor: 'rgba(15,23,42,0.45)', zIndex: 60,
        display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16,
      }}>
      <div style={{ ...card, width: 'min(620px, 100%)', maxHeight: '90vh', overflowY: 'auto', padding: 'clamp(18px, 4vw, 26px)' }}>
        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12, marginBottom: 16 }}>
          <div>
            <h2 style={{ margin: 0, fontSize: 18, fontWeight: 700, color: '#0f172a' }}>What do you want to happen?</h2>
            <p style={{ margin: '4px 0 0', fontSize: 13, color: '#64748b' }}>
              Plain words are fine. You will see and approve the plan before anything is sent.
            </p>
          </div>
          <button onClick={onClose} aria-label="Close" className="press"
            style={{ border: 'none', background: 'transparent', cursor: 'pointer', color: '#94a3b8', padding: 4, flexShrink: 0 }}>
            <X size={18} />
          </button>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          <label style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
            <span style={{ fontSize: 12, fontWeight: 600, color: '#475569' }}>Objective</span>
            <textarea
              value={objective}
              onChange={e => setObjective(e.target.value)}
              rows={5}
              placeholder={EXAMPLE}
              style={{
                width: '100%', padding: '11px 13px', border: '1px solid #e2e8f0', borderRadius: 10,
                fontSize: 13.5, lineHeight: 1.6, outline: 'none', resize: 'vertical',
                fontFamily: 'inherit', boxSizing: 'border-box', color: '#0f172a',
              }}
            />
            <span style={{ fontSize: 11.5, color: ready ? '#94a3b8' : '#b45309' }}>
              {ready ? 'Kept word for word, so you can check later what was actually asked for.'
                     : 'A sentence or two — who to reach, what you are offering, how to follow up.'}
            </span>
          </label>

          <label style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
            <span style={{ fontSize: 12, fontWeight: 600, color: '#475569' }}>Name <span style={{ color: '#94a3b8', fontWeight: 500 }}>— optional</span></span>
            <input
              value={name}
              onChange={e => setName(e.target.value)}
              placeholder="Texas Dental Outreach"
              style={{
                width: '100%', padding: '10px 13px', border: '1px solid #e2e8f0', borderRadius: 10,
                fontSize: 13.5, outline: 'none', boxSizing: 'border-box', color: '#0f172a',
              }}
            />
          </label>

          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, justifyContent: 'flex-end' }}>
            <button onClick={onClose} className="press" style={ghostBtn}>Cancel</button>
            <button onClick={submit} disabled={!ready} className="press"
              style={{ ...primaryBtn, opacity: ready ? 1 : 0.45, cursor: ready ? 'pointer' : 'not-allowed' }}>
              Create campaign
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
