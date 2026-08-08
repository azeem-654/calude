import {
  Activity, Calendar, Film, Globe, Mail, MessageSquare, Palette,
  Send, Star, TrendingUp, Users, type LucideIcon,
} from 'lucide-react';
import { INDEX_SYMBOL } from '../../services/marketFeed';

/**
 * Each department gets a mark and a hue, the way a markets list gives every
 * asset a recognisable badge. The hues are identity only — never used to encode
 * a value — so they sit outside the up/down palette entirely.
 */
const MARKS: Record<string, { icon: LucideIcon; hue: string }> = {
  [INDEX_SYMBOL]: { icon: Activity, hue: '#7c8794' },
  CRM: { icon: Users, hue: '#3e63dd' },
  SALES: { icon: TrendingUp, hue: '#12a594' },
  MKTG: { icon: Send, hue: '#e5484d' },
  INBOX: { icon: MessageSquare, hue: '#8b5cf6' },
  SCHED: { icon: Calendar, hue: '#c77414' },
  REP: { icon: Star, hue: '#d6409f' },
  SHORTS: { icon: Film, hue: '#0091ff' },
  SOCIAL: { icon: Palette, hue: '#6e56cf' },
  WEB: { icon: Globe, hue: '#5a9116' },
  DLVR: { icon: Mail, hue: '#946800' },
};

export function ModuleMark({ symbol, size = 26 }: { symbol: string; size?: number }) {
  const mark = MARKS[symbol] ?? MARKS[INDEX_SYMBOL];
  const Icon = mark.icon;
  return (
    <span
      aria-hidden="true"
      style={{
        width: size, height: size, borderRadius: 999, flexShrink: 0,
        display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
        backgroundColor: mark.hue, color: '#fff',
      }}
    >
      <Icon size={size * 0.52} strokeWidth={2.4} />
    </span>
  );
}
