import type { Contact, Conversation, Appointment, Pipeline, Campaign, Funnel, Review } from '../types';

export const mockContacts: Contact[] = [];
export const mockConversations: Conversation[] = [];
export const mockAppointments: Appointment[] = [];
export const mockCampaigns: Campaign[] = [];
export const mockFunnels: Funnel[] = [];
export const mockReviews: Review[] = [];

/* Default pipeline structure (stages only, no deals) */
export const mockPipelines: Pipeline[] = [
  {
    id: 'pipeline-default',
    name: 'Sales Pipeline',
    stages: [
      { id: 'stage-new',   name: 'New Lead',       color: '#6366f1', deals: [] },
      { id: 'stage-qual',  name: 'Qualified',       color: '#f59e0b', deals: [] },
      { id: 'stage-prop',  name: 'Proposal Sent',   color: '#3b82f6', deals: [] },
      { id: 'stage-neg',   name: 'Negotiation',     color: '#f97316', deals: [] },
      { id: 'stage-won',   name: 'Closed Won',      color: '#22c55e', deals: [] },
    ],
  },
];

/* Revenue chart — static example data (no real revenue tracking) */
export const revenueData = [
  { month: 'Jan', revenue: 0, leads: 0 },
  { month: 'Feb', revenue: 0, leads: 0 },
  { month: 'Mar', revenue: 0, leads: 0 },
  { month: 'Apr', revenue: 0, leads: 0 },
  { month: 'May', revenue: 0, leads: 0 },
  { month: 'Jun', revenue: 0, leads: 0 },
  { month: 'Jul', revenue: 0, leads: 0 },
  { month: 'Aug', revenue: 0, leads: 0 },
  { month: 'Sep', revenue: 0, leads: 0 },
  { month: 'Oct', revenue: 0, leads: 0 },
  { month: 'Nov', revenue: 0, leads: 0 },
  { month: 'Dec', revenue: 0, leads: 0 },
];

export const channelData = [
  { name: 'Website',      value: 0 },
  { name: 'Google Ads',   value: 0 },
  { name: 'Social Media', value: 0 },
  { name: 'Referral',     value: 0 },
  { name: 'Cold Email',   value: 0 },
];
