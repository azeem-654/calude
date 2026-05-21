import type { Contact, Conversation, Appointment, Pipeline, Campaign, Funnel, Review } from '../types';

export const mockContacts: Contact[] = [
  { id: '1', name: 'Sarah Johnson', email: 'sarah@example.com', phone: '+1 (555) 001-0001', status: 'customer', tags: ['VIP', 'Referral'], source: 'Website', createdAt: '2024-01-15', lastActivity: '2024-05-20', value: 4500 },
  { id: '2', name: 'Mike Davis', email: 'mike@techcorp.com', phone: '+1 (555) 001-0002', status: 'prospect', tags: ['Hot Lead'], source: 'LinkedIn', createdAt: '2024-02-20', lastActivity: '2024-05-19', value: 8200 },
  { id: '3', name: 'Emily Chen', email: 'emily@startup.io', phone: '+1 (555) 001-0003', status: 'lead', tags: ['Newsletter'], source: 'Facebook Ad', createdAt: '2024-03-10', lastActivity: '2024-05-18', value: 0 },
  { id: '4', name: 'Robert Martinez', email: 'rob@bigbiz.com', phone: '+1 (555) 001-0004', status: 'customer', tags: ['Enterprise', 'VIP'], source: 'Referral', createdAt: '2023-11-05', lastActivity: '2024-05-21', value: 15000 },
  { id: '5', name: 'Lisa Thompson', email: 'lisa@creative.co', phone: '+1 (555) 001-0005', status: 'prospect', tags: ['Trial'], source: 'Google Ad', createdAt: '2024-04-01', lastActivity: '2024-05-17', value: 2100 },
  { id: '6', name: 'James Wilson', email: 'james@agency.com', phone: '+1 (555) 001-0006', status: 'lead', tags: ['Cold'], source: 'Cold Email', createdAt: '2024-04-15', lastActivity: '2024-05-15', value: 0 },
  { id: '7', name: 'Amanda Foster', email: 'amanda@retail.com', phone: '+1 (555) 001-0007', status: 'customer', tags: ['Loyal'], source: 'Website', createdAt: '2023-09-20', lastActivity: '2024-05-20', value: 6800 },
  { id: '8', name: 'David Kim', email: 'david@consulting.net', phone: '+1 (555) 001-0008', status: 'churned', tags: ['Re-engage'], source: 'Conference', createdAt: '2023-06-01', lastActivity: '2024-02-10', value: 3200 },
];

export const mockConversations: Conversation[] = [
  {
    id: '1', contactId: '1', contactName: 'Sarah Johnson', channel: 'sms', lastMessage: 'Thanks! I\'ll review the proposal', lastMessageTime: '10 min ago', unread: 2, status: 'open',
    messages: [
      { id: 'm1', content: 'Hi Sarah, just following up on our last meeting!', sender: 'agent', timestamp: '2024-05-21 09:00', type: 'sms' },
      { id: 'm2', content: 'Yes, I received the proposal. Looking good!', sender: 'contact', timestamp: '2024-05-21 09:30', type: 'sms' },
      { id: 'm3', content: 'Thanks! I\'ll review the proposal', sender: 'contact', timestamp: '2024-05-21 10:15', type: 'sms' },
    ]
  },
  {
    id: '2', contactId: '2', contactName: 'Mike Davis', channel: 'email', lastMessage: 'Can we schedule a demo call?', lastMessageTime: '1 hour ago', unread: 1, status: 'open',
    messages: [
      { id: 'm4', content: 'Hi Mike, thank you for your interest in our platform!', sender: 'agent', timestamp: '2024-05-21 08:00', type: 'email' },
      { id: 'm5', content: 'Can we schedule a demo call?', sender: 'contact', timestamp: '2024-05-21 09:45', type: 'email' },
    ]
  },
  {
    id: '3', contactId: '4', contactName: 'Robert Martinez', channel: 'call', lastMessage: 'Discussed enterprise package', lastMessageTime: '2 hours ago', unread: 0, status: 'closed',
    messages: [
      { id: 'm6', content: 'Call duration: 25 minutes. Discussed enterprise package pricing.', sender: 'agent', timestamp: '2024-05-21 07:30', type: 'text' },
    ]
  },
  {
    id: '4', contactId: '3', contactName: 'Emily Chen', channel: 'chat', lastMessage: 'I have a question about pricing', lastMessageTime: '3 hours ago', unread: 3, status: 'pending',
    messages: [
      { id: 'm7', content: 'Hello! I have a question about pricing', sender: 'contact', timestamp: '2024-05-21 07:00', type: 'text' },
      { id: 'm8', content: 'What plans are available?', sender: 'contact', timestamp: '2024-05-21 07:05', type: 'text' },
      { id: 'm9', content: 'I have a question about pricing', sender: 'contact', timestamp: '2024-05-21 07:10', type: 'text' },
    ]
  },
];

export const mockAppointments: Appointment[] = [
  { id: '1', title: 'Discovery Call', contactId: '1', contactName: 'Sarah Johnson', date: '2024-05-22', time: '10:00 AM', duration: 30, status: 'scheduled', type: 'Video Call' },
  { id: '2', title: 'Product Demo', contactId: '2', contactName: 'Mike Davis', date: '2024-05-22', time: '2:00 PM', duration: 60, status: 'scheduled', type: 'Screen Share' },
  { id: '3', title: 'Onboarding Session', contactId: '4', contactName: 'Robert Martinez', date: '2024-05-21', time: '11:00 AM', duration: 90, status: 'completed', type: 'Video Call' },
  { id: '4', title: 'Follow-up Call', contactId: '5', contactName: 'Lisa Thompson', date: '2024-05-23', time: '3:00 PM', duration: 30, status: 'scheduled', type: 'Phone Call' },
  { id: '5', title: 'Renewal Discussion', contactId: '7', contactName: 'Amanda Foster', date: '2024-05-21', time: '4:00 PM', duration: 45, status: 'cancelled', type: 'Video Call', notes: 'Client rescheduled' },
  { id: '6', title: 'Initial Consultation', contactId: '6', contactName: 'James Wilson', date: '2024-05-24', time: '9:00 AM', duration: 30, status: 'scheduled', type: 'Phone Call' },
];

export const mockPipelines: Pipeline[] = [
  {
    id: '1', name: 'Sales Pipeline',
    stages: [
      {
        id: 's1', name: 'New Lead', color: '#6366f1', deals: [
          { id: 'd1', title: 'Website Redesign', contactId: '3', contactName: 'Emily Chen', value: 5000, stage: 'New Lead', probability: 20, expectedClose: '2024-06-30', assignedTo: 'John Smith', createdAt: '2024-05-01' },
          { id: 'd2', title: 'SEO Package', contactId: '6', contactName: 'James Wilson', value: 2400, stage: 'New Lead', probability: 15, expectedClose: '2024-07-15', assignedTo: 'Jane Doe', createdAt: '2024-05-10' },
        ]
      },
      {
        id: 's2', name: 'Qualified', color: '#f59e0b', deals: [
          { id: 'd3', title: 'Marketing Automation', contactId: '5', contactName: 'Lisa Thompson', value: 8500, stage: 'Qualified', probability: 40, expectedClose: '2024-06-15', assignedTo: 'John Smith', createdAt: '2024-04-20' },
        ]
      },
      {
        id: 's3', name: 'Proposal Sent', color: '#3b82f6', deals: [
          { id: 'd4', title: 'Enterprise CRM', contactId: '2', contactName: 'Mike Davis', value: 24000, stage: 'Proposal Sent', probability: 60, expectedClose: '2024-06-01', assignedTo: 'John Smith', createdAt: '2024-04-10' },
        ]
      },
      {
        id: 's4', name: 'Negotiation', color: '#f97316', deals: [
          { id: 'd5', title: 'Annual License', contactId: '1', contactName: 'Sarah Johnson', value: 12000, stage: 'Negotiation', probability: 80, expectedClose: '2024-05-30', assignedTo: 'Jane Doe', createdAt: '2024-03-25' },
        ]
      },
      {
        id: 's5', name: 'Closed Won', color: '#22c55e', deals: [
          { id: 'd6', title: 'Platform Setup', contactId: '4', contactName: 'Robert Martinez', value: 15000, stage: 'Closed Won', probability: 100, expectedClose: '2024-05-10', assignedTo: 'John Smith', createdAt: '2024-03-01' },
          { id: 'd7', title: 'Growth Package', contactId: '7', contactName: 'Amanda Foster', value: 6800, stage: 'Closed Won', probability: 100, expectedClose: '2024-05-05', assignedTo: 'Jane Doe', createdAt: '2024-03-15' },
        ]
      },
    ]
  }
];

export const mockCampaigns: Campaign[] = [
  { id: '1', name: 'Summer Sale 2024', type: 'email', status: 'active', sent: 2450, opened: 892, clicked: 234, replied: 45, createdAt: '2024-05-01', scheduledAt: '2024-05-15' },
  { id: '2', name: 'Welcome Sequence', type: 'sequence', status: 'active', sent: 1200, opened: 780, clicked: 320, replied: 89, createdAt: '2024-04-01' },
  { id: '3', name: 'Re-engagement SMS', type: 'sms', status: 'completed', sent: 500, opened: 420, clicked: 156, replied: 34, createdAt: '2024-03-15', scheduledAt: '2024-04-01' },
  { id: '4', name: 'Product Launch Email', type: 'email', status: 'draft', sent: 0, opened: 0, clicked: 0, replied: 0, createdAt: '2024-05-18' },
  { id: '5', name: 'Appointment Reminders', type: 'sms', status: 'active', sent: 890, opened: 870, clicked: 320, replied: 120, createdAt: '2024-02-01' },
];

export const mockFunnels: Funnel[] = [
  { id: '1', name: 'Lead Magnet Funnel', steps: 4, visitors: 3420, conversions: 287, revenue: 14350, status: 'active' },
  { id: '2', name: 'Webinar Registration', steps: 3, visitors: 1890, conversions: 456, revenue: 22800, status: 'active' },
  { id: '3', name: 'Free Trial Offer', steps: 5, visitors: 2100, conversions: 189, revenue: 9450, status: 'active' },
  { id: '4', name: 'Product Launch', steps: 6, visitors: 0, conversions: 0, revenue: 0, status: 'draft' },
];

export const mockReviews: Review[] = [
  { id: '1', platform: 'google', rating: 5, author: 'Sarah Johnson', content: 'Absolutely fantastic service! The team was professional and delivered beyond expectations.', date: '2024-05-20', replied: true },
  { id: '2', platform: 'google', rating: 4, author: 'Mike Davis', content: 'Great platform, very helpful for managing our business. A few minor UX issues but overall excellent.', date: '2024-05-18', replied: false },
  { id: '3', platform: 'facebook', rating: 5, author: 'Emily Chen', content: 'Best CRM I\'ve ever used. Completely transformed how we handle our customer relationships!', date: '2024-05-15', replied: true },
  { id: '4', platform: 'yelp', rating: 3, author: 'Anonymous User', content: 'Good service but took longer than expected. Could improve communication.', date: '2024-05-10', replied: false },
  { id: '5', platform: 'google', rating: 5, author: 'Robert Martinez', content: 'Incredible ROI. We\'ve seen a 40% increase in conversions since using this platform.', date: '2024-05-08', replied: true },
];

export const revenueData = [
  { month: 'Jan', revenue: 42000, leads: 120 },
  { month: 'Feb', revenue: 38000, leads: 98 },
  { month: 'Mar', revenue: 55000, leads: 145 },
  { month: 'Apr', revenue: 61000, leads: 167 },
  { month: 'May', revenue: 78000, leads: 198 },
  { month: 'Jun', revenue: 65000, leads: 154 },
  { month: 'Jul', revenue: 82000, leads: 210 },
  { month: 'Aug', revenue: 95000, leads: 245 },
  { month: 'Sep', revenue: 88000, leads: 228 },
  { month: 'Oct', revenue: 102000, leads: 267 },
  { month: 'Nov', revenue: 115000, leads: 298 },
  { month: 'Dec', revenue: 125000, leads: 312 },
];

export const channelData = [
  { name: 'Website', value: 35 },
  { name: 'Google Ads', value: 25 },
  { name: 'Social Media', value: 20 },
  { name: 'Referral', value: 15 },
  { name: 'Cold Email', value: 5 },
];
