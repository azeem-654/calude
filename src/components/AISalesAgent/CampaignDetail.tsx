/**
 * One AI campaign.
 *
 * The full set of tabs from the brief arrives with the parts that produce
 * something to put in them. What is here is what the agent genuinely knows
 * today: the objective it was given, where it is in its life, the records it is
 * responsible for, and the account it has kept of itself.
 *
 * Nothing on this page is a placeholder for a number that does not exist yet.
 * A campaign that has sent nothing shows no send figures at all, rather than a
 * row of zeroes that reads exactly like a campaign whose sends have failed.
 */
import { useCallback, useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import {
  ArrowLeft, ArrowUpRight, Ban, Bot, Pause, Play, Trash2,
} from 'lucide-react';
import Header from '../Layout/Header';
import { useApp } from '../../context/AppContext';
import {
  deleteCampaign, getCampaign, setStatus, takeSaveError,
} from '../../services/aiCampaigns';
import { decisionsFor, logDecision, purgeCampaign } from '../../services/aiDecisionLog';
import { purgeLeads } from '../../services/aiDiscovery';
import { propagatePause } from '../../services/aiRollup';
import {
  CAMPAIGN_STATUS_LABEL, DECISION_LABEL, LINK_LABEL,
  type AICampaign, type AIDecision,
} from '../../types/aiSalesAgent';
import { STATUS_TONE, ago, card, ghostBtn, primaryBtn, statusPill } from './ui';
import StrategyPanel from './StrategyPanel';
import LeadsPanel from './LeadsPanel';
import BuildPanel from './BuildPanel';
import PerformancePanel from './PerformancePanel';

export default function CampaignDetail() {
  const { id = '' } = useParams();
  const navigate = useNavigate();
  const { addNotification, sequences, updateSequence } = useApp();
  const [campaign, setCampaign] = useState<AICampaign | null>(() => getCampaign(id));
  const [log, setLog] = useState<AIDecision[]>(() => decisionsFor(id));

  const reload = useCallback(() => {
    setCampaign(getCampaign(id));
    setLog(decisionsFor(id));
  }, [id]);

  const move = (to: AICampaign['status'], summary: string, because: string) => {
    if (!setStatus(id, to)) { addNotification(takeSaveError() || 'That could not be saved.', 'error'); return; }

    /* Reach into what the campaign created. "Paused" that leaves the sequence
       sending is a label, not a pause — and stopping a campaign has to stop the
       sending too, or it keeps emailing people after the customer ended it. */
    let touched: string[] = [];
    if (campaign && (to === 'paused' || to === 'stopped' || to === 'running')) {
      const r = propagatePause(campaign, { sequences, updateSequence },
        to === 'running' ? 'active' : 'paused');
      touched = r.changed;
      if (r.missing.length) {
        addNotification(`${r.missing.join(', ')} no longer exists in Marketing`, 'error');
      }
    }

    logDecision(id, {
      kind: to === 'paused' ? 'pause' : 'plan',
      summary,
      because: touched.length ? `${because} ${touched.join(', ')} ${touched.length === 1 ? 'was' : 'were'} ${to === 'running' ? 'resumed' : 'paused'} in Marketing too.` : because,
    });
    reload();
    addNotification(summary);
  };

  const remove = () => {
    if (!window.confirm(`Delete ${id}?\n\nThe campaign record goes. Anything it created — sequences, contacts, appointments — stays in the module that owns it.`)) return;
    deleteCampaign(id);
    purgeCampaign(id);
    purgeLeads(id);
    addNotification(`${id} deleted`);
    navigate('/ai-sales-agent');
  };

  if (!campaign) return <Missing id={id} onBack={() => navigate('/ai-sales-agent')} />;

  const tone = STATUS_TONE[campaign.status];
  const canPause = campaign.status === 'running';
  const canResume = campaign.status === 'paused';
  const canStop = campaign.status === 'running' || campaign.status === 'paused';

  return (
    <div>
      <Header title={campaign.name} subtitle={campaign.id} />

      <div style={{ padding: 'clamp(16px, 3vw, 28px)', display: 'flex', flexDirection: 'column', gap: 16 }}>

        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, alignItems: 'center' }}>
          <button onClick={() => navigate('/ai-sales-agent')} className="press" style={ghostBtn}>
            <ArrowLeft size={14} /> All campaigns
          </button>
          <span style={statusPill(tone)}>{CAMPAIGN_STATUS_LABEL[campaign.status]}</span>
          <div style={{ flex: 1 }} />
          {canPause && (
            <button className="press" style={ghostBtn}
              onClick={() => move('paused', 'Campaign paused', 'Paused by a person from the campaign page.')}>
              <Pause size={14} /> Pause
            </button>
          )}
          {canResume && (
            <button className="press" style={primaryBtn}
              onClick={() => move('running', 'Campaign resumed', 'Resumed by a person from the campaign page.')}>
              <Play size={14} /> Resume
            </button>
          )}
          {canStop && (
            <button className="press" style={ghostBtn}
              onClick={() => move('stopped', 'Campaign stopped', 'Ended early by a person from the campaign page.')}>
              <Ban size={14} /> Stop
            </button>
          )}
          <button onClick={remove} className="press" style={{ ...ghostBtn, color: '#b91c1c', borderColor: '#fecaca' }}>
            <Trash2 size={14} /> Delete
          </button>
        </div>

        <Section title="Objective" note="Kept word for word, so what was asked for can always be checked.">
          <p style={{ margin: 0, fontSize: 14.5, lineHeight: 1.65, color: '#1e293b' }}>
            {campaign.objective || 'No objective was written.'}
          </p>
        </Section>

        <StrategyPanel campaign={campaign} onChanged={reload} />

        <LeadsPanel campaign={campaign} onChanged={reload} />

        <BuildPanel campaign={campaign} onChanged={reload} />

        <PerformancePanel campaign={campaign} />

        <Links campaign={campaign} />

        <Activity log={log} />
      </div>
    </div>
  );
}

/* ── Pieces ────────────────────────────────────────────────────────────── */

function Section({ title, note, children }: { title: string; note?: string; children: React.ReactNode }) {
  return (
    <section style={{ ...card, padding: 'clamp(16px, 3vw, 22px)', display: 'flex', flexDirection: 'column', gap: 10 }}>
      <div>
        <h2 style={{ margin: 0, fontSize: 14, fontWeight: 700, color: '#0f172a' }}>{title}</h2>
        {note && <p style={{ margin: '3px 0 0', fontSize: 12, color: '#94a3b8' }}>{note}</p>}
      </div>
      {children}
    </section>
  );
}

function Links({ campaign }: { campaign: AICampaign }) {
  const navigate = useNavigate();
  const { sequences, contacts } = useApp();
  const links = campaign.links;

  /* The stored label is a fallback, not the truth. A sequence renamed in
     Marketing must not keep showing its old name here — that is the same stale
     copy this whole module is built to avoid, just smaller. */
  const liveName = useCallback((kind: string, id: string, fallback: string) => {
    if (kind === 'sequence') return sequences.find(x => x.id === id)?.name ?? fallback;
    if (kind === 'contact') return contacts.find(x => x.id === id)?.name ?? fallback;
    return fallback;
  }, [sequences, contacts]);

  const isGone = useCallback((kind: string, id: string) => {
    if (kind === 'sequence') return !sequences.some(x => x.id === id);
    if (kind === 'contact') return !contacts.some(x => x.id === id);
    return false;
  }, [sequences, contacts]);

  const grouped = useMemo(() => {
    const by = new Map<string, AICampaign['links']>();
    for (const l of links) by.set(l.kind, [...(by.get(l.kind) ?? []), l]);
    return [...by.entries()];
  }, [links]);

  return (
    <Section
      title="What this campaign created"
      note="Each of these lives in the module that owns it — open one to edit it there.">
      {grouped.length === 0 ? (
        <p style={{ margin: 0, fontSize: 13.5, color: '#64748b', lineHeight: 1.6 }}>
          Nothing yet. Records appear here as the agent creates them, each linked to the real
          sequence, campaign or appointment rather than a copy of it.
        </p>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          {grouped.map(([kind, links]) => (
            <div key={kind} style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              <p style={{ margin: 0, fontSize: 10.5, fontWeight: 700, letterSpacing: '0.06em', textTransform: 'uppercase', color: '#94a3b8' }}>
                {LINK_LABEL[kind as keyof typeof LINK_LABEL] ?? kind}
              </p>
              {links.map(l => (
                <button key={`${l.kind}-${l.id}`} className="press"
                  onClick={() => l.route && navigate(l.route)}
                  disabled={!l.route}
                  style={{
                    display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10,
                    padding: '9px 12px', borderRadius: 9, border: '1px solid #eef1f5',
                    backgroundColor: '#f8fafc', textAlign: 'left', width: '100%',
                    cursor: l.route ? 'pointer' : 'default', font: 'inherit',
                  }}>
                  <span style={{ minWidth: 0, display: 'flex', flexDirection: 'column' }}>
                    <span style={{ fontSize: 13, fontWeight: 600, color: isGone(l.kind, l.id) ? '#94a3b8' : '#0f172a', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {liveName(l.kind, l.id, l.label)}
                      {isGone(l.kind, l.id) && <span style={{ fontWeight: 500, color: '#b91c1c' }}> · deleted</span>}
                    </span>
                    <span style={{ fontSize: 11, color: '#94a3b8', fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace' }}>{l.id}</span>
                  </span>
                  {l.route && <ArrowUpRight size={14} color="#64748b" style={{ flexShrink: 0 }} />}
                </button>
              ))}
            </div>
          ))}
        </div>
      )}
    </Section>
  );
}

function Activity({ log }: { log: AIDecision[] }) {
  /* Newest first on screen. The store keeps them in order, which is what makes
     "what happened just before this went wrong" answerable. */
  const rows = useMemo(() => [...log].reverse(), [log]);
  return (
    <Section title="What the agent has done" note="Every action, with the reason it acted.">
      {rows.length === 0 ? (
        <p style={{ margin: 0, fontSize: 13.5, color: '#64748b' }}>Nothing recorded yet.</p>
      ) : (
        <ol style={{ margin: 0, padding: 0, listStyle: 'none', display: 'flex', flexDirection: 'column', gap: 12 }}>
          {rows.map(d => (
            <li key={d.id} style={{ display: 'flex', gap: 11 }}>
              <span style={{
                flexShrink: 0, marginTop: 5, width: 7, height: 7, borderRadius: 999,
                backgroundColor: d.kind === 'error' ? '#dc2626' : '#cbd5e1',
              }} />
              <div style={{ minWidth: 0, display: 'flex', flexDirection: 'column', gap: 2 }}>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, alignItems: 'baseline' }}>
                  <span style={{ fontSize: 13.5, fontWeight: 600, color: '#0f172a' }}>{d.summary}</span>
                  <span style={{ fontSize: 11, color: '#94a3b8' }}>
                    {DECISION_LABEL[d.kind]} · {ago(d.at)}
                  </span>
                </div>
                {d.because && (
                  <p style={{ margin: 0, fontSize: 12.5, color: '#64748b', lineHeight: 1.55 }}>{d.because}</p>
                )}
                {d.counts && Object.keys(d.counts).length > 0 && (
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10, marginTop: 2 }}>
                    {Object.entries(d.counts).map(([k, v]) => (
                      <span key={k} style={{ fontSize: 11.5, color: '#475569' }}>
                        <strong style={{ color: '#0f172a', fontVariantNumeric: 'tabular-nums' }}>{v.toLocaleString()}</strong> {k}
                      </span>
                    ))}
                  </div>
                )}
              </div>
            </li>
          ))}
        </ol>
      )}
    </Section>
  );
}

function Missing({ id, onBack }: { id: string; onBack: () => void }) {
  return (
    <div>
      <Header title="AI Sales Agent" subtitle="Campaign not found" />
      <div style={{ padding: 'clamp(16px, 3vw, 28px)' }}>
        <div style={{ ...card, padding: 'clamp(24px, 5vw, 40px)', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 12, textAlign: 'center' }}>
          <Bot size={26} color="#94a3b8" />
          <div>
            <h2 style={{ margin: 0, fontSize: 17, fontWeight: 700, color: '#0f172a' }}>No campaign called {id}</h2>
            <p style={{ margin: '5px 0 0', fontSize: 13, color: '#64748b', lineHeight: 1.6, maxWidth: 420 }}>
              It may have been deleted, or it belongs to a different sub-account — campaign
              numbers start again in each workspace, so the same ID can exist in more than one.
            </p>
          </div>
          <button onClick={onBack} className="press" style={primaryBtn}>All campaigns</button>
        </div>
      </div>
    </div>
  );
}
