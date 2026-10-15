/**
 * The icons a booking page's points may carry — one component per key in the
 * fixed list (worker/src/lib/bookingContent.ts `BOOKING_ICONS`). The AI picks
 * a key, the owner can change it, and the page draws only these: a key it
 * does not know is a tick.
 */
import {
  Award, BadgeDollarSign, BarChart3, CalendarDays, CheckCircle2, Clock, Globe, Heart, Home, Leaf, Lightbulb,
  MessageCircle, Rocket, ShieldCheck, Sparkles, Star, Target, TrendingUp, Users, Wrench, type LucideIcon,
} from 'lucide-react';
import type { BookingIcon } from '../../services/bookingContent';

// eslint-disable-next-line react-refresh/only-export-components -- the map and its one drawer belong together
export const BOOKING_ICON: Record<BookingIcon, { Icon: LucideIcon; label: string }> = {
  check: { Icon: CheckCircle2, label: 'Tick' },
  chart: { Icon: BarChart3, label: 'Chart' },
  trending: { Icon: TrendingUp, label: 'Growth' },
  users: { Icon: Users, label: 'People' },
  rocket: { Icon: Rocket, label: 'Launch' },
  target: { Icon: Target, label: 'Target' },
  clock: { Icon: Clock, label: 'Time' },
  calendar: { Icon: CalendarDays, label: 'Calendar' },
  shield: { Icon: ShieldCheck, label: 'Protection' },
  sparkles: { Icon: Sparkles, label: 'Sparkle' },
  message: { Icon: MessageCircle, label: 'Conversation' },
  dollar: { Icon: BadgeDollarSign, label: 'Money' },
  star: { Icon: Star, label: 'Star' },
  heart: { Icon: Heart, label: 'Care' },
  lightbulb: { Icon: Lightbulb, label: 'Idea' },
  award: { Icon: Award, label: 'Award' },
  wrench: { Icon: Wrench, label: 'Fix' },
  home: { Icon: Home, label: 'Home' },
  leaf: { Icon: Leaf, label: 'Nature' },
  globe: { Icon: Globe, label: 'Worldwide' },
};

export function PointIcon({ icon, size = 18 }: { icon: string; size?: number }) {
  const Icon = (BOOKING_ICON as Record<string, { Icon: LucideIcon }>)[icon]?.Icon ?? CheckCircle2;
  return <Icon size={size} aria-hidden="true" />;
}
