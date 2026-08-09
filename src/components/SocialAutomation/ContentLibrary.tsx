import { useMemo, useState } from 'react';
import { FileText, Film, Image, Layers, Mail, MessageSquare, Search, Type } from 'lucide-react';
import { libraryAssets } from '../../services/campaignHandoff';
import { loadCampaigns, placementRules } from '../../services/socialAutomation';
import type { CampaignAssetKind } from '../../types/socialAutomation';

const INK = '#17191c';
const MUTED = '#8a8f98';
const FAINT = '#b0b4ba';

const KIND_META: Record<CampaignAssetKind, { label: string; icon: typeof Film; color: string; bg: string }> = {
  clip:     { label: 'Clips',     icon: Film,          color: '#3e63dd', bg: '#eceff9' },
  image:    { label: 'Images',    icon: Image,         color: '#12a594', bg: '#e4f5f2' },
  carousel: { label: 'Carousels', icon: Layers,        color: '#8b5cf6', bg: '#f1edfb' },
  story:    { label: 'Stories',   icon: Image,         color: '#d6409f', bg: '#fbecf6' },
  text:     { label: 'Posts',     icon: Type,          color: '#c77414', bg: '#fdf5e7' },
  thread:   { label: 'Threads',   icon: MessageSquare, color: '#0091ff', bg: '#e6f2ff' },
  email:    { label: 'Emails',    icon: Mail,          color: '#e5484d', bg: '#fceaea' },
  sms:      { label: 'SMS',       icon: MessageSquare, color: '#5a9116', bg: '#eef7e2' },
  blog:     { label: 'Blog',      icon: FileText,      color: '#6e56cf', bg: '#efedfb' },
  landing:  { label: 'Pages',     icon: FileText,      color: '#946800', bg: '#fbf3e0' },
};

const ORDER: CampaignAssetKind[] = ['clip', 'image', 'carousel', 'story', 'text', 'thread', 'email', 'sms', 'blog', 'landing'];

/**
 * Everything ever generated, in one place and reusable.
 *
 * Assets outlive the campaign moment they were written for — a good caption is
 * worth pulling out again six months later — so the library is a first-class
 * view rather than a tab hidden inside one campaign.
 */
export default function ContentLibrary() {
  const [query, setQuery] = useState('');
  const [kind, setKind] = useState<CampaignAssetKind | 'all'>('all');
  const [open, setOpen] = useState<string>('');

  const all = useMemo(() => libraryAssets(loadCampaigns()), []);

  const counts = useMemo(() => {
    const m = new Map<CampaignAssetKind, number>();
    for (const a of all) m.set(a.kind, (m.get(a.kind) ?? 0) + 1);
    return m;
  }, [all]);

  const rows = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return all.filter(a => {
      if (kind !== 'all' && a.kind !== kind) return false;
      if (!needle) return true;
      return `${a.title} ${a.body} ${a.campaignName} ${a.hashtags.join(' ')}`.toLowerCase().includes(needle);
    });
  }, [all, kind, query]);

  if (all.length === 0) {
    return (
      <div style={{
        backgroundColor: '#fff', borderRadius: 18, padding: '40px 30px', textAlign: 'center',
        maxWidth: 560, margin: '20px auto', boxShadow: '0 1px 2px rgba(23,25,28,0.05)',
      }}>
        <Layers size={26} color={FAINT} style={{ marginBottom: 10 }} />
        <h3 style={{ fontSize: 16, fontWeight: 800, color: INK, margin: '0 0 6px' }}>Nothing in the library yet</h3>
        <p style={{ fontSize: 13, color: MUTED, margin: 0, lineHeight: 1.6 }}>
          Generate a campaign and every clip, caption, email and article it writes is kept here — searchable,
          and reusable in later campaigns.
        </p>
      </div>
    );
  }

  return (
    <div>
      {/* Filters */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap', marginBottom: 14 }}>
        <div style={{ position: 'relative', minWidth: 240, flex: '0 1 320px' }}>
          <Search size={14} color={FAINT} style={{ position: 'absolute', left: 11, top: '50%', transform: 'translateY(-50%)' }} />
          <input
            value={query}
            onChange={e => setQuery(e.target.value)}
            placeholder="Search captions, emails, hashtags…"
            aria-label="Search the content library"
            style={{
              width: '100%', padding: '9px 12px 9px 32px', border: '1px solid #e4e7ec',
              borderRadius: 11, fontSize: 13, outline: 'none', boxSizing: 'border-box',
            }}
          />
        </div>
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
          <button
            onClick={() => setKind('all')}
            aria-pressed={kind === 'all'}
            style={chip(kind === 'all')}
          >
            All {all.length}
          </button>
          {ORDER.filter(k => counts.get(k)).map(k => (
            <button key={k} onClick={() => setKind(k)} aria-pressed={kind === k} style={chip(kind === k)}>
              {KIND_META[k].label} {counts.get(k)}
            </button>
          ))}
        </div>
      </div>

      {/* Rows */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        {rows.length === 0 && (
          <p style={{ fontSize: 13, color: MUTED, padding: '20px 0', textAlign: 'center' }}>
            Nothing matches “{query}”.
          </p>
        )}
        {rows.map(a => {
          const meta = KIND_META[a.kind];
          const Icon = meta.icon;
          const expanded = open === a.id;
          const rules = a.placement ? placementRules(a.placement) : undefined;
          return (
            <div key={a.id} style={{
              backgroundColor: '#fff', borderRadius: 14, boxShadow: '0 1px 2px rgba(23,25,28,0.05)',
              overflow: 'hidden',
            }}>
              <button
                onClick={() => setOpen(expanded ? '' : a.id)}
                aria-expanded={expanded}
                style={{
                  display: 'flex', alignItems: 'center', gap: 11, width: '100%', textAlign: 'left',
                  padding: '12px 14px', border: 'none', backgroundColor: 'transparent', cursor: 'pointer',
                }}
              >
                <span style={{
                  width: 32, height: 32, borderRadius: 9, flexShrink: 0, backgroundColor: meta.bg,
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                }}>
                  <Icon size={15} color={meta.color} />
                </span>
                <span style={{ flex: 1, minWidth: 0 }}>
                  <span style={{
                    display: 'block', fontSize: 13, fontWeight: 700, color: INK,
                    overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                  }}>{a.title}</span>
                  <span style={{ display: 'block', fontSize: 11, color: MUTED, marginTop: 1 }}>
                    {a.campaignName}
                    {rules ? ` · ${rules.label}` : a.channel ? ` · ${a.channel}` : ''}
                    {a.viralityScore != null ? ` · virality ${a.viralityScore}` : ''}
                  </span>
                </span>
                <span style={{ fontSize: 10.5, color: FAINT, whiteSpace: 'nowrap' }}>
                  {a.body.length} chars
                </span>
              </button>

              {expanded && (
                <div style={{ padding: '0 14px 14px 57px' }}>
                  <pre style={{
                    margin: 0, padding: '10px 12px', backgroundColor: '#f7f8fa', borderRadius: 10,
                    fontSize: 12, color: '#374151', lineHeight: 1.6, whiteSpace: 'pre-wrap',
                    fontFamily: 'inherit', maxHeight: 260, overflowY: 'auto',
                  }}>{a.body}</pre>

                  {a.parts && a.parts.length > 0 && (
                    <div style={{ marginTop: 8, display: 'flex', flexDirection: 'column', gap: 5 }}>
                      {a.parts.map((p, i) => (
                        <div key={i} style={{
                          fontSize: 11.5, color: '#5c6066', padding: '7px 10px',
                          backgroundColor: '#fcfcfd', border: '1px solid #eceef1', borderRadius: 9,
                        }}>
                          {p.title && <strong style={{ color: INK }}>{p.title}: </strong>}
                          {p.body}
                        </div>
                      ))}
                    </div>
                  )}

                  {a.hashtags.length > 0 && (
                    <p style={{ fontSize: 11.5, color: '#3e63dd', margin: '8px 0 0', lineHeight: 1.6 }}>
                      {a.hashtags.join(' ')}
                    </p>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

function chip(on: boolean): React.CSSProperties {
  return {
    padding: '7px 12px', borderRadius: 999, cursor: 'pointer',
    border: `1px solid ${on ? INK : '#e4e7ec'}`,
    backgroundColor: on ? INK : '#fff',
    color: on ? '#fff' : INK, fontSize: 11.5, fontWeight: 700,
  };
}
