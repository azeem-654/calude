import { useMemo, useState } from 'react';
import { ArrowUpRight, Check, Film, Play, Plus, Rocket, Sparkles, Trash2 } from 'lucide-react';
import Header from '../Layout/Header';
import { useApp } from '../../context/AppContext';
import CampaignWizard from './CampaignWizard';
import GenerationPanel from './GenerationPanel';
import ContentLibrary from './ContentLibrary';
import { libraryCount, pushToModules } from '../../services/campaignHandoff';
import {
  STATUS_META, deleteCampaign, describeTargets, goalLabel, loadCampaigns,
} from '../../services/socialAutomation';
import type { Campaign } from '../../types/socialAutomation';

const INK = '#17191c';
const MUTED = '#8a8f98';
const FAINT = '#b0b4ba';

const CARD: React.CSSProperties = {
  backgroundColor: '#fff', borderRadius: 18,
  boxShadow: '0 1px 2px rgba(23,25,28,0.05)',
};

function relDate(iso: string): string {
  const d = new Date(iso);
  const days = Math.floor((Date.now() - d.getTime()) / 86_400_000);
  if (days === 0) return 'today';
  if (days === 1) return 'yesterday';
  if (days < 30) return `${days} days ago`;
  return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
}

export default function SocialAutomation() {
  const { addNotification, addSequence, addCampaign, addWebsite, addFunnel } = useApp();
  const [campaigns, setCampaigns] = useState<Campaign[]>(loadCampaigns);
  const [wizardOpen, setWizardOpen] = useState(false);
  const [tab, setTab] = useState<'campaigns' | 'library'>('campaigns');
  const [libTotal, setLibTotal] = useState(libraryCount);

  const refresh = () => { setCampaigns(loadCampaigns()); setLibTotal(libraryCount()); };

  /** Hand the CRM-owned channels over to the modules that actually send them. */
  function sendToModules(c: Campaign) {
    const res = pushToModules(c, { addSequence, addCampaign, addWebsite, addFunnel });
    if (!res.ok) { addNotification(res.error ?? 'Could not send this campaign.', 'error'); return; }
    refresh();
    addNotification(`Added to your modules: ${res.created.join(', ')}. They are drafts — review before sending.`, 'success');
  }

  const totals = useMemo(() => ({
    all: campaigns.length,
    ready: campaigns.filter(c => c.status === 'ready').length,
    live: campaigns.filter(c => c.status === 'published' || c.status === 'partial').length,
  }), [campaigns]);

  function remove(c: Campaign) {
    deleteCampaign(c.id);
    refresh();
    addNotification(`Campaign "${c.name}" deleted`, 'info');
  }

  if (wizardOpen) {
    return (
      <div style={{ minHeight: '100vh' }}>
        <Header title="New automation campaign" subtitle="One video in — clips, posts, emails, SMS and a blog out" />
        <CampaignWizard
          onCancel={() => setWizardOpen(false)}
          onDone={() => { refresh(); setWizardOpen(false); }}
        />
      </div>
    );
  }

  return (
    <div style={{ minHeight: '100vh' }}>
      <Header
        title="Social Automation"
        subtitle={campaigns.length
          ? `${totals.all} campaign${totals.all === 1 ? '' : 's'} · ${totals.ready} ready to publish · ${totals.live} live`
          : 'Turn one video into a full multi-platform campaign'}
        actions={[{ icon: Plus, label: 'New campaign', onClick: () => setWizardOpen(true) }]}
      />

      <div style={{ padding: '14px 28px 40px' }}>
        <div style={{ display: 'flex', gap: 8, marginBottom: 16 }}>
          {([['campaigns', `Campaigns ${campaigns.length}`], ['library', `Content library ${libTotal}`]] as const).map(([key, label]) => (
            <button
              key={key}
              onClick={() => setTab(key)}
              aria-pressed={tab === key}
              style={{
                padding: '8px 15px', borderRadius: 999, cursor: 'pointer',
                border: `1px solid ${tab === key ? INK : '#e4e7ec'}`,
                backgroundColor: tab === key ? INK : '#fff',
                color: tab === key ? '#fff' : INK, fontSize: 12.5, fontWeight: 700,
              }}
            >
              {label}
            </button>
          ))}
        </div>

        {tab === 'library' ? <ContentLibrary /> : campaigns.length === 0 ? (
          <div style={{ ...CARD, padding: '44px 32px', maxWidth: 620, margin: '20px auto', textAlign: 'center' }}>
            <span style={{
              width: 56, height: 56, borderRadius: 18, backgroundColor: INK, margin: '0 auto 18px',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
            }}>
              <Rocket size={24} color="#fff" />
            </span>
            <h2 style={{ fontSize: 20, fontWeight: 800, color: INK, margin: '0 0 8px', letterSpacing: '-0.02em' }}>
              One video. Everything else written for you.
            </h2>
            <p style={{ fontSize: 13.5, color: MUTED, lineHeight: 1.65, margin: '0 0 22px' }}>
              Upload a video or paste a YouTube link, choose where it should go, and this builds the short clips,
              the platform-specific posts, an email sequence, the SMS messages and a blog article — then walks you
              through publishing each one.
            </p>
            <button
              onClick={() => setWizardOpen(true)}
              style={{
                display: 'inline-flex', alignItems: 'center', gap: 8, padding: '12px 24px',
                borderRadius: 999, border: 'none', cursor: 'pointer',
                backgroundColor: INK, color: '#fff', fontSize: 14, fontWeight: 700,
              }}
            >
              <Sparkles size={15} /> Start a campaign
            </button>
          </div>
        ) : (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(330px, 1fr))', gap: 14 }}>
            {campaigns.map(c => {
              const meta = STATUS_META[c.status];
              const first = c.sources[0];
              return (
                <div key={c.id} style={{ ...CARD, padding: 18, display: 'flex', flexDirection: 'column', gap: 10 }}>
                  <div style={{ display: 'flex', alignItems: 'flex-start', gap: 10 }}>
                    <span style={{
                      width: 36, height: 36, borderRadius: 11, flexShrink: 0,
                      backgroundColor: first?.kind === 'youtube' ? '#fceaea' : '#eceff9',
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                    }}>
                      {first?.kind === 'youtube'
                        ? <Play size={17} color="#e5484d" />
                        : <Film size={17} color="#3e63dd" />}
                    </span>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <h3 style={{
                        fontSize: 14.5, fontWeight: 800, color: INK, margin: 0, letterSpacing: '-0.01em',
                        overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                      }}>{c.name}</h3>
                      <p style={{ fontSize: 11.5, color: MUTED, margin: '2px 0 0' }}>
                        {goalLabel(c.goal)} · created {relDate(c.createdAt)}
                      </p>
                    </div>
                    <span style={{
                      padding: '4px 10px', borderRadius: 999, fontSize: 10.5, fontWeight: 800,
                      backgroundColor: meta.bg, color: meta.color, whiteSpace: 'nowrap',
                    }}>{meta.label}</span>
                  </div>

                  <p style={{ fontSize: 12.5, color: '#5c6066', margin: 0, lineHeight: 1.5 }}>
                    {describeTargets(c)}
                  </p>

                  <p style={{ fontSize: 11.5, color: FAINT, margin: 0 }}>
                    {c.sources.length} source{c.sources.length === 1 ? '' : 's'}
                    {c.audience.skipped
                      ? ' · no audience yet'
                      : c.audience.contactCount > 0 ? ` · ${c.audience.contactCount} contacts` : ''}
                  </p>

                  <GenerationPanel campaign={c} onChange={refresh} />

                  {c.status === 'ready' && c.channels.length > 0 && (
                    c.handoff ? (
                      <p style={{
                        display: 'flex', alignItems: 'center', gap: 6, fontSize: 11.5, color: '#3f9142',
                        margin: 0, fontWeight: 600,
                      }}>
                        <Check size={12} /> Added to your Marketing modules as drafts
                      </p>
                    ) : (
                      <button
                        onClick={() => sendToModules(c)}
                        style={{
                          alignSelf: 'flex-start', display: 'inline-flex', alignItems: 'center', gap: 6,
                          padding: '8px 14px', borderRadius: 999, border: 'none', cursor: 'pointer',
                          backgroundColor: '#3e63dd', color: '#fff', fontSize: 11.5, fontWeight: 700,
                        }}
                      >
                        Add to Marketing <ArrowUpRight size={12} />
                      </button>
                    )
                  )}

                  <div style={{ display: 'flex', gap: 8, marginTop: 'auto', paddingTop: 4 }}>
                    <button
                      onClick={() => remove(c)}
                      style={{
                        display: 'inline-flex', alignItems: 'center', gap: 5, padding: '7px 12px',
                        borderRadius: 999, border: '1px solid #f4d4d4', backgroundColor: '#fff',
                        color: '#e5484d', fontSize: 11.5, fontWeight: 700, cursor: 'pointer',
                      }}
                    >
                      <Trash2 size={12} /> Delete
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
