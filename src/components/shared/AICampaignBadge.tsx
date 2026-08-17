/**
 * "An AI campaign made this" — for records that carry the campaign id but not
 * a full provenance stamp.
 *
 * Contacts predate the provenance model and have their own `source` string for
 * lead source, so the agent writes the campaign id into custom fields instead.
 * This resolves that id to the live campaign, which means a renamed campaign
 * shows its new name here and a deleted one says so rather than leaving an id
 * nobody can look up.
 */
import { useNavigate } from 'react-router-dom';
import { Bot } from 'lucide-react';
import { getCampaign } from '../../services/aiCampaigns';

interface Props {
  campaignId?: string;
  /** `compact` shows the id only — for a dense table row. */
  size?: 'full' | 'compact';
}

export default function AICampaignBadge({ campaignId, size = 'full' }: Props) {
  const navigate = useNavigate();
  if (!campaignId) return null;

  const campaign = getCampaign(campaignId);
  const label = size === 'compact'
    ? campaignId
    : campaign ? `AI Sales Agent · ${campaign.name}` : `AI Sales Agent · ${campaignId}`;

  return (
    <button
      type="button"
      onClick={(e) => { e.stopPropagation(); navigate(`/ai-sales-agent/${campaignId}`); }}
      title={campaign ? `Created by ${campaign.name} (${campaignId})` : `Created by ${campaignId}, which no longer exists`}
      className="press"
      style={{
        display: 'inline-flex', alignItems: 'center', gap: 5, maxWidth: '100%',
        padding: '2px 8px', borderRadius: 999, cursor: 'pointer',
        border: `1px solid ${campaign ? '#dbe3ee' : '#fecaca'}`,
        backgroundColor: campaign ? '#f1f5f9' : '#fef2f2',
        color: campaign ? '#475569' : '#b91c1c',
        fontSize: 10.5, fontWeight: 600, fontFamily: 'inherit',
        overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
      }}>
      <Bot size={10} style={{ flexShrink: 0 }} />
      {label}
      {!campaign && ' · deleted'}
    </button>
  );
}
