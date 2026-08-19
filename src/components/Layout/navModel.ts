/**
 * Every module in the product, in one list.
 *
 * There used to be two lists: ten names on the bar and six more hidden behind a
 * "More" button — and three modules (Websites, Billing, Agency) that were in
 * neither and could only be reached by typing the address. A module nobody can
 * find is a module nobody paid for.
 *
 * So: seven groups named after the job you are doing, every module inside one of
 * them, and nothing in a leftover bin. The top bar shows the groups; a group
 * opens on hover, so the whole product is one pointer-move away rather than a
 * click into a drawer. The command palette and the icon rail read this same
 * list, which is why it lives here rather than inside the bar.
 *
 * The labels are the ones a customer would use. "Scheduling" and "Calendar"
 * side by side told nobody which was which; "Booking pages" and "Calendar" do.
 */
import {
  BarChart3, Bot, Building2, Calendar, CalendarClock, CreditCard,
  Globe, Inbox, LayoutDashboard, LayoutTemplate, Newspaper, Palette, Rocket,
  Scissors, Send, Settings as SettingsIcon, Star, TrendingUp, Users,
  type LucideIcon,
} from 'lucide-react';

export interface NavItem {
  path: string;
  label: string;
  /** One line saying what the module is for. Shown in the menu and the palette. */
  desc: string;
  icon: LucideIcon;
  /** Words somebody might search for that are not in the label. */
  aka?: string[];
  /** Kept out of a client login, which must not see the agency's own screens. */
  agencyOnly?: boolean;
}

export interface NavGroup {
  id: string;
  label: string;
  /** A group of one is a plain link — no menu, no hover, straight there. */
  path?: string;
  items: NavItem[];
}

export const NAV_GROUPS: NavGroup[] = [
  {
    id: 'home',
    label: 'Dashboard',
    path: '/',
    items: [{ path: '/', label: 'Dashboard', desc: 'The week so far, today, and what to do next', icon: LayoutDashboard, aka: ['home', 'overview'] }],
  },
  {
    id: 'customers',
    label: 'Customers',
    items: [
      { path: '/contacts', label: 'Contacts', desc: 'Everyone you know, with their whole history', icon: Users, aka: ['people', 'leads', 'crm', 'customers'] },
      { path: '/conversations', label: 'Inbox', desc: 'Email, SMS and chat in one shared thread', icon: Inbox, aka: ['conversations', 'messages', 'chat', 'email'] },
      { path: '/reputation', label: 'Reviews', desc: 'Watch what people say and answer it', icon: Star, aka: ['reputation', 'ratings', 'google reviews'] },
    ],
  },
  {
    id: 'sales',
    label: 'Sales',
    items: [
      { path: '/pipelines', label: 'Deals', desc: 'Move opportunities through to won', icon: TrendingUp, aka: ['pipeline', 'pipelines', 'opportunities', 'kanban'] },
      { path: '/ai-sales-agent', label: 'AI Sales Agent', desc: 'Turn an objective into a campaign the CRM runs', icon: Bot, aka: ['ai', 'agent', 'outreach', 'prospecting'] },
      { path: '/calendar', label: 'Calendar', desc: 'Meetings, bookings and your own time on one grid', icon: Calendar, aka: ['diary', 'schedule', 'appointments'] },
      { path: '/scheduling', label: 'Booking pages', desc: 'Let people book you without the email chain', icon: CalendarClock, aka: ['scheduling', 'calendly', 'availability', 'event types'] },
    ],
  },
  {
    id: 'marketing',
    label: 'Marketing',
    items: [
      { path: '/marketing', label: 'Email campaigns', desc: 'Campaigns, sequences, automations and deliverability', icon: Send, aka: ['marketing', 'newsletter', 'broadcast', 'sequences', 'smtp'] },
      { path: '/funnels', label: 'Funnels', desc: 'Landing pages built to capture a lead', icon: LayoutTemplate, aka: ['landing pages', 'opt-in'] },
      { path: '/websites', label: 'Websites', desc: 'Full sites, built and published from here', icon: Globe, aka: ['site', 'pages', 'web'] },
      { path: '/blog-automation', label: 'Blog & SEO', desc: 'A planned blog that ranks your own pages', icon: Newspaper, aka: ['seo', 'articles', 'content', 'ranking'] },
    ],
  },
  {
    id: 'content',
    label: 'Content',
    items: [
      { path: '/social-automation', label: 'Repurposing', desc: 'One video out to clips, posts, email and a blog', icon: Rocket, aka: ['social automation', 'repurpose', 'one video'] },
      { path: '/ai-shorts', label: 'AI Shorts', desc: 'Cut a long video into short vertical clips', icon: Scissors, aka: ['video', 'reels', 'tiktok', 'clips'] },
      { path: '/social-creator', label: 'Post designer', desc: 'Design social posts with AI and publish them', icon: Palette, aka: ['social creator', 'graphics', 'canva'] },
    ],
  },
  {
    id: 'reports',
    label: 'Reports',
    path: '/analytics',
    items: [{ path: '/analytics', label: 'Reports', desc: 'How every module is performing', icon: BarChart3, aka: ['analytics', 'stats', 'metrics', 'performance'] }],
  },
  {
    id: 'workspace',
    label: 'Workspace',
    items: [
      { path: '/settings', label: 'Settings', desc: 'Profile, AI engine, integrations and branding', icon: SettingsIcon, aka: ['preferences', 'config', 'account'] },
      { path: '/settings?tab=email-sms', label: 'Email & SMS setup', desc: 'Connect SMTP, Resend, Mailtrap or Twilio', icon: Send, aka: ['smtp', 'sending', 'provider', 'twilio', 'resend'] },
      { path: '/billing', label: 'Plan & billing', desc: 'Your subscription, invoices and usage', icon: CreditCard, aka: ['invoice', 'subscription', 'payment'] },
      { path: '/agency', label: 'Agency & clients', desc: 'Every sub-account you run, in one place', icon: Building2, aka: ['sub-accounts', 'white label', 'clients'], agencyOnly: true },
    ],
  },
];

/** The path with any query string taken off, for matching against the router. */
function basePath(path: string): string {
  const q = path.indexOf('?');
  return q === -1 ? path : path.slice(0, q);
}

/** Every module a given login is allowed to see, in menu order. */
export function allModules(isClient: boolean): NavItem[] {
  return NAV_GROUPS.flatMap(g => g.items).filter(i => !(i.agencyOnly && isClient));
}

/** Which group the current address belongs to, so its pill can look chosen. */
export function activeGroupId(pathname: string): string | null {
  let best: { id: string; length: number } | null = null;
  for (const g of NAV_GROUPS) {
    for (const item of g.items) {
      const p = basePath(item.path);
      const hit = p === '/' ? pathname === '/' : pathname === p || pathname.startsWith(`${p}/`);
      /* Longest match wins: /settings and /settings?tab=… share a base, and
         /social-creator must not lose to a shorter neighbour. */
      if (hit && (!best || p.length > best.length)) best = { id: g.id, length: p.length };
    }
  }
  return best?.id ?? null;
}

/** True when this menu row should read as the page you are on. */
export function isItemActive(pathname: string, item: NavItem): boolean {
  const p = basePath(item.path);
  return p === '/' ? pathname === '/' : pathname === p || pathname.startsWith(`${p}/`);
}

/**
 * Rank modules against what somebody typed.
 *
 * Label first, then the description, then the words people use that are not on
 * the label — searching "calendly" has to find Booking pages or the palette is
 * only useful to somebody who already knows where everything is.
 */
export function searchModules(query: string, isClient: boolean): NavItem[] {
  const q = query.trim().toLowerCase();
  const all = allModules(isClient);
  if (!q) return all;

  const scored: { item: NavItem; score: number }[] = [];
  for (const item of all) {
    const label = item.label.toLowerCase();
    let score = 0;
    if (label === q) score = 100;
    else if (label.startsWith(q)) score = 80;
    else if (label.includes(q)) score = 60;
    else if ((item.aka ?? []).some(a => a.startsWith(q))) score = 45;
    else if ((item.aka ?? []).some(a => a.includes(q))) score = 35;
    else if (item.desc.toLowerCase().includes(q)) score = 20;
    if (score > 0) scored.push({ item, score });
  }
  return scored.sort((a, b) => b.score - a.score).map(s => s.item);
}
