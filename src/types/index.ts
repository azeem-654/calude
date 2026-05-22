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
  steps: number;
  visitors: number;
  conversions: number;
  revenue: number;
  status: 'active' | 'draft';
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
