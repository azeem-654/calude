/**
 * One AI campaign, in tabs.
 *
 * The tabs are the ones from the brief, and each shows what is genuinely known
 * rather than a placeholder for a number that does not exist yet. A campaign
 * that has sent nothing shows dashes, not noughts — "0 replies" says the emails
 * went out and nobody answered, which is a different morning entirely.
 *
 * The chosen tab lives in the URL so a campaign's Email tab can be linked to,
 * and so going back does what going back should.
 */
import { useCallback, useState } from 'react';
import { useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { ArrowLeft, Ban, Bot, Pause, Play, Trash2 } from 'lucide-react';
import Header from '../Layout/Header';
import { useApp } from '../../context/AppContext';
import { deleteCampaign, getCampaign, setStatus, takeSaveError } from '../../services/aiCampaigns';
import { decisionsFor, logDecision, purgeCampaign } from '../../services/aiDecisionLog';
import { purgeLeads } from '../../services/aiDiscovery';
import { propagatePause } from '../../services/aiRollup';
import { CAMPAIGN_STATUS_LABEL, type AICampaign, type AIDecision } from '../../types/aiSalesAgent';
import { STATUS_TONE, card, ghostBtn, primaryBtn, statusPill } from './ui';
import StrategyPanel from './StrategyPanel';
import LeadsPanel from './LeadsPanel';
import BuildPanel from './BuildPanel';
import PerformancePanel from './PerformancePanel';
import ActivityTab from './ActivityTab';
import {
  AppointmentsTab, ContactsTab, EmailTab, Panel, SettingsTab, SmsTab, WorkflowsTab,
} from './tabs';

const TABS = [
  { id: 'overview', label: 'Overview' },
  { id: 'strategy', label: 'Strategy' },
  { id: 'leads', label: 'Leads' },
  { id: 'workflows', label: 'Workflows' },
  { id: 'email', label: 'Email' },
  { id: 'sms', label: 'SMS' },
  { id: 'appointments', label: 'Appointments' },
  { id: 'activity', label: 'Activity' },
  { id: 'settings', label: 'Settings' },
] as const;

export default function CampaignDetail() {
  const { id = '' } = useParams();
  const navigate = useNavigate();
  const [params, setParams] = useSearchParams();
  const { addNotification, sequences, updateSequence } = useApp();
  const [campaign, setCampaign] = useState<AICampaign | null>(() => getCampaign(id));
  const [log, setLog] = useState<AIDecision[]>(() => decisionsFor(id));

  const tab = TABS.some(t => t.id === params.get('tab')) ? params.get('tab')! : 'overview';
  const goTab = (next: string) => setParams(next === 'overview' ? {} : { tab: next }, { replace: true });

  const reload = useCallback(() => {
    setCampaign(getCampaign(id));
    setLog(decisionsFor(id));
  }, [id]);

  const move = (to: AICampaign['status'], summary: string, because: string) => {
    if (!setStatus(id, to)) { addNotification(takeSaveError() || 'That could not be saved.', 'error'); return; }

    /* Reach into what the campaign created. "Paused" that leaves the sequence
       sending is a label, not a pause. */
    let touched: string[] = [];
    if (campaign && (to === 'paused' || to === 'stopped' || to === 'running')) {
      const r = propagatePause(campaign, { sequences, updateSequence }, to === 'running' ? 'active' : 'paused');
      touched = r.changed;
      if (r.missing.length) addNotification(`${r.missing.join(', ')} no longer exists in Marketing`, 'error');
    }

    logDecision(id, {
      kind: to === 'paused' ? 'pause' : 'plan',
      summary,
      because: touched.length
        ? `${because} ${touched.join(', ')} ${touched.length === 1 ? 'was' : 'were'} ${to === 'running' ? 'resumed' : 'paused'} in Marketing too.`
        : because,
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

        {/* Tabs wrap rather than scroll: nine of them will not fit a phone on
            one line, and a hidden tab is a tab nobody uses. */}
        <div role="tablist" aria-label="Campaign sections"
          style={{ display: 'flex', flexWrap: 'wrap', gap: 4, borderBottom: '1px solid #e6e9f0', paddingBottom: 2 }}>
          {TABS.map(t => {
            const on = tab === t.id;
            return (
              <button key={t.id} role="tab" aria-selected={on} onClick={() => goTab(t.id)} className="press"
                style={{
                  padding: '8px 14px', border: 'none', cursor: 'pointer',
                  borderRadius: '9px 9px 0 0', fontSize: 13,
                  fontWeight: on ? 700 : 500,
                  color: on ? '#0f172a' : '#64748b',
                  backgroundColor: on ? 'white' : 'transparent',
                  boxShadow: on ? '0 -1px 0 #e6e9f0 inset, 1px 0 0 #e6e9f0 inset, -1px 0 0 #e6e9f0 inset' : 'none',
                }}>
                {t.label}
              </button>
            );
          })}
        </div>

        {tab === 'overview' && (
          <>
            <Panel title="Objective" note="Kept word for word, so what was asked for can always be checked.">
              <p style={{ margin: 0, fontSize: 14.5, lineHeight: 1.65, color: '#1e293b' }}>
                {campaign.objective || 'No objective was written.'}
              </p>
            </Panel>
            <PerformancePanel campaign={campaign} />
            <BuildPanel campaign={campaign} onChanged={reload} />
          </>
        )}

        {tab === 'strategy' && <StrategyPanel campaign={campaign} onChanged={reload} />}

        {tab === 'leads' && (
          <>
            <LeadsPanel campaign={campaign} onChanged={reload} />
            <ContactsTab campaign={campaign} />
          </>
        )}

        {tab === 'workflows' && <WorkflowsTab campaign={campaign} />}
        {tab === 'email' && <EmailTab campaign={campaign} />}
        {tab === 'sms' && <SmsTab campaign={campaign} />}
        {tab === 'appointments' && <AppointmentsTab campaign={campaign} />}
        {tab === 'activity' && <ActivityTab log={log} />}
        {tab === 'settings' && <SettingsTab campaign={campaign} onChanged={reload} />}
      </div>
    </div>
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
