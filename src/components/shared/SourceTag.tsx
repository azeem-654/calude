import { useNavigate } from 'react-router-dom';
import { CalendarRange, Film, Sparkles, Video } from 'lucide-react';
import { ORIGIN_LABEL, type ContentSource } from '../../types/provenance';

/**
 * "Where did this come from?" — shown on anything a setup created.
 *
 * A marketing list built by the wizard and two video campaigns is otherwise a
 * pile of similarly-named records, and the only way to tell them apart is to
 * remember. The tag names the origin and the original's title, and clicks
 * through to it, so the answer is on screen rather than in someone's head.
 *
 * Records made by hand carry nothing: an untagged row means "you made this",
 * which is the useful default.
 */

const ICON = {
  'business-wizard': Sparkles,
  'content-plan': CalendarRange,
  'video-campaign': Video,
  'ai-shorts': Film,
} as const;

interface Props {
  source?: ContentSource;
  /** `full` shows the origin and the title; `compact` shows the title only. */
  size?: 'full' | 'compact';
}

export default function SourceTag({ source, size = 'full' }: Props) {
  const navigate = useNavigate();
  if (!source) return null;

  const Icon = ICON[source.origin] ?? Sparkles;
  const origin = ORIGIN_LABEL[source.origin] ?? 'Setup';
  const full = [origin, source.title, source.detail].filter(Boolean).join(' · ');
  const clickable = !!source.route;

  return (
    <button
      type="button"
      title={`From ${full}`}
      aria-label={`Created by ${full}${clickable ? '. Open the source.' : ''}`}
      disabled={!clickable}
      onClick={e => {
        // These tags sit inside rows that are themselves clickable, so the
        // click must not also open the row behind it.
        e.stopPropagation();
        if (source.route) navigate(source.route);
      }}
      style={{
        display: 'inline-flex', alignItems: 'center', gap: 5, maxWidth: '100%',
        padding: '3px 9px', borderRadius: 999, border: '1px solid #dfe3ea',
        backgroundColor: '#f5f7fa', color: '#4a5260',
        fontSize: 10.5, fontWeight: 700, lineHeight: 1.4,
        cursor: clickable ? 'pointer' : 'default', fontFamily: 'inherit',
      }}
    >
      <Icon size={11} strokeWidth={2.4} style={{ flexShrink: 0 }} aria-hidden="true" />
      <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
        {size === 'compact' ? source.title : full}
      </span>
    </button>
  );
}
