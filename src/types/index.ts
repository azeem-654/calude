export interface Contact {
  id: string;
  name: string;
  email: string;
  phone: string;
  status: 'lead' | 'prospect' | 'customer' | 'churned';
  tags: string[];
  source: string;
  createdAt: string;
  lastActivity: string;
  value: number;
  avatar?: string;
  firstName?: string;
  lastName?: string;
  company?: string;
  jobTitle?: string;
  linkedin?: string;
  twitter?: string;
  website?: string;
  address?: string;
  notes?: ContactNote[];
  tasks?: ContactTask[];
  activities?: ContactActivity[];
  customFields?: Record<string, string>;
  timezone?: string;
  assignedTo?: string;
}

export interface Conversation {
  id: string;
  contactId: string;
  contactName: string;
  channel: 'sms' | 'email' | 'call' | 'chat';
  lastMessage: string;
  lastMessageTime: string;
  unread: number;
  status: 'open' | 'closed' | 'pending';
  messages: Message[];
}

export interface Message {
  id: string;
  content: string;
  sender: 'contact' | 'agent';
  timestamp: string;
  type: 'text' | 'email' | 'sms';
}

export interface Appointment {
  id: string;
  title: string;
  contactId: string;
  contactName: string;
  date: string;
  time: string;
  duration: number;
  status: 'scheduled' | 'completed' | 'cancelled' | 'no-show';
  type: string;
  notes?: string;
}

export interface ContactActivity {
  id: string;
  type: 'email_sent' | 'email_opened' | 'note' | 'task_completed' | 'meeting' | 'tag_added' | 'stage_change' | 'form_submitted' | 'link_clicked' | 'call';
  description: string;
  timestamp: string;
  metadata?: Record<string, string | number | boolean>;
}

export interface ContactNote {
  id: string;
  content: string;
  createdAt: string;
}

export interface ContactTask {
  id: string;
  title: string;
  dueDate: string;
  done: boolean;
  createdAt: string;
}

export interface DayAvailability {
  enabled: boolean;
  from: string;
  to: string;
}

export interface ScheduleAvailability {
  userId: string;
  title: string;
  duration: number;
  bufferBefore: number;
  bufferAfter: number;
  dailyLimit: number;
  timezone: string;
  slug: string;
  description: string;
  location: string;
  weekly: {
    mon: DayAvailability;
    tue: DayAvailability;
    wed: DayAvailability;
    thu: DayAvailability;
    fri: DayAvailability;
    sat: DayAvailability;
    sun: DayAvailability;
  };
}

export interface Booking {
  id: string;
  slotDate: string;
  slotTime: string;
  guestName: string;
  guestEmail: string;
  guestPhone?: string;
  notes?: string;
  status: 'confirmed' | 'cancelled' | 'completed' | 'rescheduled';
  timezone: string;
  createdAt: string;
  appointmentId?: string;
}

export interface FunnelBlock {
  id: string;
  type:
    | 'heading' | 'text' | 'image' | 'button' | 'form' | 'divider' | 'video' | 'countdown' | 'spacer'
    | 'hero' | 'features' | 'testimonials' | 'pricing' | 'columns' | 'cta' | 'stats' | 'faq' | 'navbar' | 'footer' | 'gallery';
  content: string;
  settings: {
    align?: 'left' | 'center' | 'right';
    size?: 'sm' | 'md' | 'lg' | 'xl';
    color?: string;
    bgColor?: string;
    bgGradient?: string;
    bgImage?: string;
    textColor?: string;
    url?: string;
    buttonText?: string;
    buttonColor?: string;
    buttonTextColor?: string;
    secondaryButtonText?: string;
    secondaryButtonUrl?: string;
    formFields?: { label: string; type: string; required: boolean }[];
    redirectUrl?: string;
    imageUrl?: string;
    imageAlt?: string;
    padding?: number;
    fontWeight?: string;
    subheading?: string;
    subtitle?: string;
    minHeight?: number;
    overlay?: boolean;
    overlayOpacity?: number;
    columns?: number;
    iconColor?: string;
    imagePosition?: 'left' | 'right';
    listItems?: string[];
    layout?: string;
    borderRadius?: number;
    shadow?: boolean;
    fullWidth?: boolean;
    featureItems?: { icon: string; title: string; desc: string }[];
    testimonialItems?: { quote: string; author: string; role: string; stars?: number; avatar?: string }[];
    pricingPlans?: { name: string; price: string; period: string; features: string[]; highlighted?: boolean; buttonText?: string }[];
    statItems?: { value: string; label: string; icon?: string }[];
    faqItems?: { q: string; a: string }[];
    galleryImages?: string[];
    navLogo?: string;
    navLinks?: { label: string; url: string }[];
    footerColumns?: { heading: string; links: { label: string; url: string }[] }[];
    footerCopyright?: string;
  };
}

export interface FunnelStep {
  id: string;
  name: string;
  type: 'landing' | 'optin' | 'sales' | 'thankyou' | 'order' | 'webinar' | 'custom' | 'checkout' | 'upsell' | 'downsell' | 'survey';
  slug: string;
  blocks: FunnelBlock[];
  visitors: number;
  conversions: number;
}

export interface SubTask {
  id: string;
  title: string;
  done: boolean;
  assignedTo?: string;
  dueDate?: string;
  priority?: 'urgent' | 'high' | 'normal' | 'low';
  createdAt: string;
}

export interface ChecklistItem {
  id: string;
  text: string;
  done: boolean;
}

export interface DealActivity {
  id: string;
  text: string;
  timestamp: string;
}

export interface Deal {
  id: string;
  title: string;
  contactId: string;
  contactName: string;
  value: number;
  stage: string;
  probability: number;
  expectedClose: string;
  assignedTo: string;
  createdAt: string;
  priority?: 'urgent' | 'high' | 'normal' | 'low';
  labels?: { color: string; text: string }[];
  description?: string;
  checklist?: ChecklistItem[];
  activity?: DealActivity[];
  status?: 'active' | 'won' | 'lost';
  lostReason?: string;
  closedAt?: string;
  source?: string;
  lastStageChangedAt?: string;
  contactPhone?: string;
  contactEmail?: string;
  subtasks?: SubTask[];
  timeTracked?: number;
  relationships?: string[];
}

export interface Pipeline {
  id: string;
  name: string;
  stages: Stage[];
}

export interface Stage {
  id: string;
  name: string;
  color: string;
  deals: Deal[];
}

export interface CampaignStep {
  id: string;
  day: number;
  waitUnit: 'hours' | 'days';
  subject: string;
  subjectB?: string;
  abTest: boolean;
  body: string;
  condition: string;
}

export interface Campaign {
  id: string;
  name: string;
  description?: string;
  type: 'email' | 'sms' | 'sequence';
  status: 'draft' | 'active' | 'paused' | 'completed';
  goal?: string;
  audience?: string;
  fromName?: string;
  fromEmail?: string;
  replyTo?: string;
  openTracking?: boolean;
  clickTracking?: boolean;
  stopOnReply?: boolean;
  stopOnBounce?: boolean;
  sendDays?: string[];
  sendHoursFrom?: string;
  sendHoursTo?: string;
  subject?: string;
  previewText?: string;
  emailBody?: string;
  smsBody?: string;
  steps?: CampaignStep[];
  sent: number;
  opened: number;
  clicked: number;
  replied: number;
  bounced?: number;
  unsubscribed?: number;
  createdAt: string;
  scheduledAt?: string;
}

export interface Funnel {
  id: string;
  name: string;
  goal?: string;
  steps: number;
  visitors: number;
  conversions: number;
  revenue: number;
  status: 'active' | 'draft';
  slug?: string;
  pages?: FunnelStep[];
  createdAt?: string;
}

export interface Website {
  id: string;
  name: string;
  description?: string;
  domain?: string;
  subdomain?: string;
  status: 'published' | 'draft';
  template?: string;
  pages?: FunnelStep[];
  favicon?: string;
  seoTitle?: string;
  seoDescription?: string;
  seoKeywords?: string;
  ogImage?: string;
  visitors: number;
  pageViews: number;
  createdAt?: string;
}

export interface Review {
  id: string;
  platform: 'google' | 'facebook' | 'yelp';
  rating: number;
  author: string;
  content: string;
  date: string;
  replied: boolean;
}

export interface Stats {
  totalContacts: number;
  newLeads: number;
  openDeals: number;
  revenue: number;
  appointments: number;
  conversionRate: number;
}

/* ─── AI Shorts Engine ─── */

export interface Caption {
  id: string;
  startTime: number;
  endTime: number;
  text: string;
  emoji?: string;
  highlighted?: boolean;
  style?: { fontSize?: number; color?: string; position?: 'top' | 'middle' | 'bottom'; fontWeight?: string };
}

export interface BRollClip {
  id: string;
  keyword: string;
  thumbnail: string;
  duration: number;
  title: string;
  source: string;
}

export interface VideoClip {
  id: string;
  projectId: string;
  title: string;
  description: string;
  /** Full English name of the language title/description/transcript are in, e.g. "Turkish". */
  language?: string;
  /** English translation of the title, present only when `language` isn't English. */
  titleTranslated?: string;
  /** English translation of the description, present only when `language` isn't English. */
  descriptionTranslated?: string;
  hashtags: string[];
  startTime: number;
  endTime: number;
  duration: number;
  thumbnailGradient: string;
  viralityScore: number;
  transcript: string;
  captions: Caption[];
  aspectRatio: '9:16' | '1:1' | '16:9';
  status: 'liked' | 'disliked' | 'neutral';
  focus: 'emotional' | 'educational' | 'funny';
  musicTrack: string;
  hasVoiceover: boolean;
  broll: BRollClip[];
  publishedTo: {
    platform: 'youtube' | 'tiktok' | 'instagram' | 'facebook' | 'linkedin';
    scheduledAt?: string;
    publishedAt?: string;
    status: 'scheduled' | 'published' | 'failed';
    title?: string;
    description?: string;
  }[];
  views: number;
  createdAt: string;
}

export interface VideoProject {
  id: string;
  name: string;
  sourceType: 'upload' | 'youtube' | 'url';
  sourceName: string;
  sourceUrl?: string;
  sourceBlobUrl?: string;
  duration: number;
  thumbnailGradient: string;
  status: 'uploading' | 'processing' | 'ready' | 'failed';
  progress: number;
  processingStep: string;
  error?: string;
  isDemo?: boolean;
  /** Full English name of the detected spoken language of the video, e.g. "Turkish". */
  language?: string;
  clips: VideoClip[];
  trashedClips: VideoClip[];
  settings: {
    maxClipDuration: 30 | 45 | 60;
    focus: 'emotional' | 'educational' | 'funny' | 'all';
    aspectRatio: '9:16' | '1:1' | '16:9';
    autoCaption: boolean;
  };
  contactId?: string;
  totalViews: number;
  createdAt: string;
}
