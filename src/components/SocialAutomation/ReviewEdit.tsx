import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { AlertTriangle, ArrowUpRight, Check, RotateCcw, Save } from 'lucide-react';
import {
  assetsFor, loadAssets, placementRules, saveAssets, PLATFORM_LABEL,
} from '../../services/socialAutomation';
import { formatSlot } from '../../services/campaignSchedule';
import { captionFor } from '../../services/publishHandoff';
import type { Campaign, CampaignAsset, CampaignAssetKind } from '../../types/socialAutomation';

/** "growth  #hiring" → ["#growth", "#hiring"] */
function parseTags(raw: string): string[] {
  return raw
    .split(/\s+/)
    .map(t => t.trim())
    .filter(Boolean)
    .map(t => (t.startsWith('#') ? t : `#${t}`));
}

const INK = '#17191c';
const MUTED = '#8a8f98';
const FAINT = '#b0b4ba';
const RED = '#e5484d';

/** Where each kind is genuinely editable, once it has been handed over. */
const EDITOR_ROUTE: Record<CampaignAssetKind, { route: string; label: string }> = {
  clip: { route: '/ai-shorts', label: 'AI Shorts' },
  image: { route: '/social-creator', label: 'Social Creator' },
  carousel: { route: '/social-creator', label: 'Social Creator' },
  story: { route: '/social-creator', label: 'Social Creator' },
  text: { route: '/social-creator', label: 'Social Creator' },
  thread: { route: '/social-creator', label: 'Social Creator' },
  email: { route: '/marketing', label: 'Marketing' },
  sms: { route: '/marketing', label: 'Marketing' },
  blog: { route: '/websites', label: 'Websites' },
  landing: { route: '/funnels', label: 'Funnels' },
};

interface Props {
  campaign: Campaign;
  onChange: () => void;
}

/**
 * Edit anything before it goes out.
 *
 * Captions are edited here rather than in the destination editor because the
 * thing that matters — staying inside the platform's limit — is enforced here,
 * live, as you type. The deep links hand off to the richer editors for the work
 * this pane cannot do, like recutting a clip or laying out a carousel.
 */
export default function ReviewEdit({ campaign, onChange }: Props) {
  const navigate = useNavigate();
  const [platform, setPlatform] = useState<string>('all');
  const [kind, setKind] = useState<CampaignAssetKind | 'all'>('all');
  const [editing, setEditing] = useState<string>('');
  const [draftBody, setDraftBody] = useState('');
  const [draftTags, setDraftTags] = useState('');
  const [version, setVersion] = useState(0);

  const assets = useMemo(
    // Only things that actually go somewhere. Clips are raw material for the
    // video placements — they carry a transcript, not a caption, so offering an
    // Edit button on one was inviting a change that publishes nowhere. It also
    // made this list disagree with the count on its own tab, which counts
    // publishable pieces.
    () => assetsFor(campaign.id).filter(a => a.placement !== null || a.channel !== null),
    // `version` is the save counter — re-reading storage after a write is what
    // keeps this list honest without threading state through every child.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [campaign.id, version],
  );

  const platforms = useMemo(() => {
    const set = new Set<string>();
    for (const a of assets) {
      if (a.placement) set.add(placementRules(a.placement)?.platform ?? 'other');
      else if (a.channel) set.add(a.channel);
    }
    return [...set];
  }, [assets]);

  const kinds = useMemo(() => [...new Set(assets.map(a => a.kind))], [assets]);

  const rows = assets.filter(a => {
    if (kind !== 'all' && a.kind !== kind) return false;
    if (platform === 'all') return true;
    const p = a.placement ? placementRules(a.placement)?.platform : a.channel;
    return p === platform;
  });

  function startEdit(a: CampaignAsset) {
    setEditing(a.id);
    setDraftBody(a.body);
    setDraftTags(a.hashtags.join(' '));
  }

  function save(a: CampaignAsset) {
    const tags = parseTags(draftTags);
    saveAssets(loadAssets().map(x => (
      x.id === a.id
        ? { ...x, body: draftBody, hashtags: tags, updatedAt: new Date().toISOString() }
        : x
    )));
    setEditing('');
    setVersion(v => v + 1);
    onChange();
  }

  const limitFor = (a: CampaignAsset) => (a.placement ? placementRules(a.placement)?.captionLimit : a.kind === 'sms' ? 160 : undefined);

  const chip = (on: boolean): React.CSSProperties => ({
    padding: '6px 12px', borderRadius: 999, cursor: 'pointer',
    border: `1px solid ${on ? INK : '#e4e7ec'}`,
    backgroundColor: on ? INK : '#fff',
    color: on ? '#fff' : INK, fontSize: 11.5, fontWeight: 700, textTransform: 'capitalize',
  });

  if (assets.length === 0) {
    return <p style={{ fontSize: 13, color: MUTED }}>Nothing has been generated for this campaign yet.</p>;
  }

  return (
    <div>
      {/* Filters */}
      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 14 }}>
        <button onClick={() => setPlatform('all')} aria-pressed={platform === 'all'} style={chip(platform === 'all')}>
          All destinations
        </button>
        {platforms.map(p => (
          <button key={p} onClick={() => setPlatform(p)} aria-pressed={platform === p} style={chip(platform === p)}>
            {PLATFORM_LABEL[p as keyof typeof PLATFORM_LABEL] ?? p}
          </button>
        ))}
        <span style={{ width: 1, backgroundColor: '#e4e7ec', margin: '0 4px' }} />
        <button onClick={() => setKind('all')} aria-pressed={kind === 'all'} style={chip(kind === 'all')}>
          All types
        </button>
        {kinds.map(k => (
          <button key={k} onClick={() => setKind(k)} aria-pressed={kind === k} style={chip(kind === k)}>
            {k}
          </button>
        ))}
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        {rows.length === 0 && (
          <p style={{ fontSize: 13, color: MUTED, textAlign: 'center', padding: '20px 0' }}>
            Nothing matches those filters.
          </p>
        )}

        {rows.map(a => {
          const rules = a.placement ? placementRules(a.placement) : undefined;
          const limit = limitFor(a);
          const isEditing = editing === a.id;
          // Count what will actually be sent, not just the body. Publishing
          // appends any hashtags the body does not already carry, so measuring
          // the body alone let an edited caption pass here and then break the
          // platform's limit on the way out.
          const outgoing = isEditing
            ? captionFor({ ...a, body: draftBody, hashtags: parseTags(draftTags) })
            : captionFor(a);
          const length = outgoing.length;
          const over = limit != null && length > limit;
          const dest = EDITOR_ROUTE[a.kind];

          return (
            <div key={a.id} style={{
              backgroundColor: '#fff', borderRadius: 14, padding: 14,
              boxShadow: '0 1px 2px rgba(23,25,28,0.05)',
              border: over ? `1px solid ${RED}` : '1px solid transparent',
            }}>
              <div style={{ display: 'flex', alignItems: 'flex-start', gap: 10, marginBottom: 8 }}>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <p style={{
                    fontSize: 13, fontWeight: 700, color: INK, margin: 0,
                    overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                  }}>{a.title}</p>
                  <p style={{ fontSize: 11, color: MUTED, margin: '2px 0 0' }}>
                    {rules ? rules.label : a.channel}
                    {rules ? ` · ${rules.aspect}` : ''}
                    {a.scheduledFor ? ` · ${formatSlot(a.scheduledFor)}` : ''}
                  </p>
                </div>
                {limit != null && (
                  <span
                    // "172/150" alone tells a screen reader nothing; this says
                    // what the number means and which piece it belongs to.
                    aria-label={`${a.title}: ${length} of ${limit} characters`}
                    role="status"
                    style={{
                    fontSize: 11, fontWeight: 700, whiteSpace: 'nowrap',
                    color: over ? RED : length > limit * 0.9 ? '#c77414' : FAINT,
                    fontVariantNumeric: 'tabular-nums',
                  }}>
                    {length}/{limit}
                  </span>
                )}
              </div>

              {isEditing ? (
                <>
                  <textarea
                    value={draftBody}
                    onChange={e => setDraftBody(e.target.value)}
                    rows={5}
                    aria-label={`Edit ${a.title}`}
                    style={{
                      width: '100%', padding: '10px 12px', borderRadius: 10, fontSize: 12.5,
                      border: `1px solid ${over ? RED : '#e4e7ec'}`, outline: 'none',
                      boxSizing: 'border-box', resize: 'vertical', fontFamily: 'inherit', lineHeight: 1.6,
                    }}
                  />
                  {rules && rules.hashtagMax > 0 && (
                    <input
                      value={draftTags}
                      onChange={e => setDraftTags(e.target.value)}
                      aria-label={`Hashtags for ${a.title}`}
                      placeholder="#hashtags separated by spaces"
                      style={{
                        width: '100%', marginTop: 8, padding: '9px 12px', borderRadius: 10,
                        border: '1px solid #e4e7ec', fontSize: 12.5, outline: 'none', boxSizing: 'border-box',
                      }}
                    />
                  )}
                  {over && (
                    <p role="alert" style={{
                      display: 'flex', alignItems: 'center', gap: 6, fontSize: 11.5,
                      color: RED, margin: '8px 0 0', fontWeight: 600,
                    }}>
                      <AlertTriangle size={12} /> {length - (limit ?? 0)} characters over the limit —
                      {rules ? ` ${rules.label} will reject this.` : ' this will be split into two messages.'}
                    </p>
                  )}
                  <div style={{ display: 'flex', gap: 8, marginTop: 10 }}>
                    <button onClick={() => save(a)} disabled={over} style={{
                      display: 'inline-flex', alignItems: 'center', gap: 6, padding: '7px 14px',
                      borderRadius: 999, border: 'none', cursor: over ? 'not-allowed' : 'pointer',
                      backgroundColor: over ? '#d5d8dd' : INK, color: '#fff', fontSize: 11.5, fontWeight: 700,
                    }}>
                      <Save size={12} /> Save
                    </button>
                    <button onClick={() => setEditing('')} style={{
                      display: 'inline-flex', alignItems: 'center', gap: 6, padding: '7px 14px',
                      borderRadius: 999, border: '1px solid #e4e7ec', backgroundColor: '#fff',
                      color: MUTED, fontSize: 11.5, fontWeight: 700, cursor: 'pointer',
                    }}>
                      <RotateCcw size={12} /> Cancel
                    </button>
                  </div>
                </>
              ) : (
                <>
                  <pre style={{
                    margin: 0, padding: '9px 11px', backgroundColor: '#f7f8fa', borderRadius: 9,
                    fontSize: 12, color: '#374151', lineHeight: 1.6, whiteSpace: 'pre-wrap',
                    fontFamily: 'inherit', maxHeight: 160, overflowY: 'auto',
                  }}>{a.body}</pre>
                  {a.hashtags.length > 0 && (
                    <p style={{ fontSize: 11.5, color: '#3e63dd', margin: '7px 0 0', lineHeight: 1.5 }}>
                      {a.hashtags.join(' ')}
                    </p>
                  )}
                  <div style={{ display: 'flex', gap: 8, marginTop: 10, flexWrap: 'wrap' }}>
                    <button onClick={() => startEdit(a)} style={{
                      display: 'inline-flex', alignItems: 'center', gap: 6, padding: '7px 14px',
                      borderRadius: 999, border: '1px solid #e4e7ec', backgroundColor: '#fff',
                      color: INK, fontSize: 11.5, fontWeight: 700, cursor: 'pointer',
                    }}>
                      Edit
                    </button>
                    <button onClick={() => navigate(dest.route)} style={{
                      display: 'inline-flex', alignItems: 'center', gap: 5, padding: '7px 14px',
                      borderRadius: 999, border: '1px solid #e4e7ec', backgroundColor: '#fff',
                      color: MUTED, fontSize: 11.5, fontWeight: 700, cursor: 'pointer',
                    }}>
                      Open in {dest.label} <ArrowUpRight size={11} />
                    </button>
                    {a.status === 'published' && (
                      <span style={{
                        display: 'inline-flex', alignItems: 'center', gap: 5, fontSize: 11.5,
                        color: '#3f9142', fontWeight: 700,
                      }}>
                        <Check size={12} /> Published
                      </span>
                    )}
                  </div>
                </>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
