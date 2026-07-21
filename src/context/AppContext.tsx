import { createContext, useContext, useState } from 'react';
import type { ReactNode } from 'react';
import type { Contact, Conversation, Appointment, Pipeline, Campaign, Funnel, Website, Review, ScheduleAvailability, Booking, ContactNote, ContactTask, ContactActivity, VideoProject, VideoClip } from '../types';
import type { EmailSequence, Automation } from '../types/marketing';
import type { DesignPost } from '../components/SocialCreator/types';
import { mockPipelines } from '../data/mockData';

interface Notification {
  id: string;
  message: string;
  type: 'success' | 'error' | 'info';
}

export interface CustomFieldDef {
  key: string;
  label: string;
  createdAt: string;
}

interface AppContextType {
  contacts: Contact[];
  conversations: Conversation[];
  appointments: Appointment[];
  pipelines: Pipeline[];
  campaigns: Campaign[];
  funnels: Funnel[];
  websites: Website[];
  reviews: Review[];
  sequences: EmailSequence[];
  automations: Automation[];
  addContact: (contact: Omit<Contact, 'id'>) => void;
  updateContact: (id: string, updates: Partial<Contact>) => void;
  deleteContact: (id: string) => void;
  bulkImportContacts: (contacts: Omit<Contact, 'id'>[]) => void;
  addConversation: (conv: Omit<Conversation, 'id'>) => void;
  sendMessage: (conversationId: string, content: string) => void;
  updateConversationStatus: (id: string, status: Conversation['status']) => void;
  addAppointment: (appt: Omit<Appointment, 'id'>) => void;
  updateAppointment: (id: string, updates: Partial<Appointment>) => void;
  deleteAppointment: (id: string) => void;
  addCampaign: (campaign: Omit<Campaign, 'id'>) => Campaign;
  updateCampaign: (id: string, updates: Partial<Campaign>) => void;
  deleteCampaign: (id: string) => void;
  toggleCampaignStatus: (id: string) => void;
  updatePipeline: (id: string, updates: Partial<Pipeline>) => void;
  createPipeline: (name: string) => Pipeline;
  deletePipeline: (id: string) => void;
  addFunnel: (funnel: Funnel | Omit<Funnel, 'id'>) => void;
  updateFunnel: (id: string, updates: Partial<Funnel>) => void;
  deleteFunnel: (id: string) => void;
  addWebsite: (w: Website | Omit<Website, 'id'>) => void;
  updateWebsite: (id: string, updates: Partial<Website>) => void;
  deleteWebsite: (id: string) => void;
  addReview: (review: Omit<Review, 'id'>) => void;
  replyToReview: (id: string, replyText: string) => void;
  addSequence: (seq: Omit<EmailSequence, 'id'>) => EmailSequence;
  updateSequence: (id: string, updates: Partial<EmailSequence>) => void;
  deleteSequence: (id: string) => void;
  addAutomation: (auto: Omit<Automation, 'id'>) => void;
  updateAutomation: (id: string, updates: Partial<Automation>) => void;
  deleteAutomation: (id: string) => void;
  schedule: ScheduleAvailability;
  updateSchedule: (updates: Partial<ScheduleAvailability>) => void;
  bookings: Booking[];
  addBooking: (booking: Omit<Booking, 'id'>) => void;
  updateBooking: (id: string, updates: Partial<Booking>) => void;
  deleteBooking: (id: string) => void;
  addContactNote: (contactId: string, note: Omit<ContactNote, 'id'>) => void;
  deleteContactNote: (contactId: string, noteId: string) => void;
  addContactTask: (contactId: string, task: Omit<ContactTask, 'id'>) => void;
  updateContactTask: (contactId: string, taskId: string, updates: Partial<ContactTask>) => void;
  deleteContactTask: (contactId: string, taskId: string) => void;
  addContactActivity: (contactId: string, activity: Omit<ContactActivity, 'id'>) => void;
  notifications: Notification[];
  addNotification: (msg: string, type?: 'success' | 'error' | 'info') => void;
  dismissNotification: (id: string) => void;
  sidebarMode: 'full' | 'icons' | 'hidden';
  setSidebarMode: (mode: 'full' | 'icons' | 'hidden') => void;
  videoProjects: VideoProject[];
  addVideoProject: (project: VideoProject) => void;
  updateVideoProject: (id: string, updates: Partial<VideoProject>) => void;
  deleteVideoProject: (id: string) => void;
  updateVideoClip: (projectId: string, clipId: string, updates: Partial<VideoClip>) => void;
  trashVideoClip: (projectId: string, clipId: string) => void;
  restoreVideoClip: (projectId: string, clipId: string) => void;
  deleteVideoClip: (projectId: string, clipId: string) => void;
  socialPosts: DesignPost[];
  addSocialPost: (post: DesignPost) => void;
  updateSocialPost: (id: string, updates: Partial<DesignPost>) => void;
  deleteSocialPost: (id: string) => void;
  customFieldDefs: CustomFieldDef[];
  addCustomFieldDefs: (defs: CustomFieldDef[]) => void;
}

function loadLS<T>(key: string, fallback: T): T {
  try { return JSON.parse(localStorage.getItem(key) || 'null') ?? fallback; } catch { return fallback; }
}

function saveLS<T>(key: string, value: T) {
  try { localStorage.setItem(key, JSON.stringify(value)); } catch { /* quota exceeded */ }
}

const AppContext = createContext<AppContextType | null>(null);

export function AppProvider({ children }: { children: ReactNode }) {
  const [contacts, setContacts]         = useState<Contact[]>(()      => loadLS('crm_contacts',      []));
  const [conversations, setConversations] = useState<Conversation[]>(() => loadLS('crm_conversations', []));
  const [appointments, setAppointments] = useState<Appointment[]>(()  => loadLS('crm_appointments',  []));
  const [pipelines, setPipelines]       = useState<Pipeline[]>(()     => loadLS('crm_pipelines',     mockPipelines));
  const [campaigns, setCampaigns]       = useState<Campaign[]>(()     => loadLS('crm_campaigns',     []));
  const [funnels, setFunnels]           = useState<Funnel[]>(()       => loadLS('crm_funnels',       []));
  const [websites, setWebsites]         = useState<Website[]>(()      => loadLS('crm_websites',      []));
  const [reviews, setReviews]           = useState<Review[]>(()       => loadLS('crm_reviews',       []));
  const [sequences, setSequences]       = useState<EmailSequence[]>(() => loadLS('crm_sequences',   []));
  const [automations, setAutomations]   = useState<Automation[]>(()   => loadLS('crm_automations',  []));
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [sidebarMode, setSidebarModeState] = useState<'full' | 'icons' | 'hidden'>(() => (loadLS('crm_sidebar_mode', 'full') as 'full' | 'icons' | 'hidden'));
  const [videoProjects, setVideoProjects] = useState<VideoProject[]>(() => loadLS('crm_video_projects', []));
  const [socialPosts, setSocialPosts] = useState<DesignPost[]>(() => loadLS('crm_social_posts', []));
  const [customFieldDefs, setCustomFieldDefs] = useState<CustomFieldDef[]>(() => loadLS('crm_custom_fields', []));
  const setSidebarMode = (mode: 'full' | 'icons' | 'hidden') => { setSidebarModeState(mode); saveLS('crm_sidebar_mode', mode); };

  const defaultSchedule: ScheduleAvailability = {
    userId: 'user-1', title: '30 Minute Meeting', duration: 30, bufferBefore: 0, bufferAfter: 0,
    dailyLimit: 8, timezone: Intl.DateTimeFormat().resolvedOptions().timeZone, slug: 'meeting',
    description: 'Schedule a meeting with me.', location: 'Video Call',
    weekly: {
      mon: { enabled: true, from: '09:00', to: '17:00' }, tue: { enabled: true, from: '09:00', to: '17:00' },
      wed: { enabled: true, from: '09:00', to: '17:00' }, thu: { enabled: true, from: '09:00', to: '17:00' },
      fri: { enabled: true, from: '09:00', to: '17:00' }, sat: { enabled: false, from: '09:00', to: '17:00' },
      sun: { enabled: false, from: '09:00', to: '17:00' },
    },
  };

  const [schedule, setSchedule] = useState<ScheduleAvailability>(() => loadLS('crm_schedule', defaultSchedule));
  const [bookings, setBookings] = useState<Booking[]>(() => loadLS('crm_bookings', []));

  const notify = (message: string, type: 'success' | 'error' | 'info' = 'success') => {
    const id = Date.now().toString();
    setNotifications(prev => [...prev, { id, message, type }]);
    setTimeout(() => setNotifications(prev => prev.filter(n => n.id !== id)), 4000);
  };

  /* ── Contacts ── */
  const addContact = (contact: Omit<Contact, 'id'>) => {
    const c = { ...contact, id: `c-${Date.now()}` };
    setContacts(prev => { const next = [c, ...prev]; saveLS('crm_contacts', next); return next; });
    notify(`Contact "${contact.name}" added`);
  };
  const updateContact = (id: string, updates: Partial<Contact>) => {
    setContacts(prev => { const next = prev.map(c => c.id === id ? { ...c, ...updates } : c); saveLS('crm_contacts', next); return next; });
    notify('Contact updated');
  };
  const deleteContact = (id: string) => {
    setContacts(prev => { const next = prev.filter(c => c.id !== id); saveLS('crm_contacts', next); return next; });
    notify('Contact deleted', 'info');
  };
  const bulkImportContacts = (newContacts: Omit<Contact, 'id'>[]) => {
    const withIds = newContacts.map((c, i) => ({ ...c, id: `imp-${Date.now()}-${i}` }));
    setContacts(prev => { const next = [...withIds, ...prev]; saveLS('crm_contacts', next); return next; });
  };
  const addCustomFieldDefs = (defs: CustomFieldDef[]) => {
    if (!defs.length) return;
    setCustomFieldDefs(prev => {
      const existing = new Set(prev.map(f => f.key));
      const fresh = defs.filter(d => !existing.has(d.key));
      if (!fresh.length) return prev;
      const next = [...prev, ...fresh];
      saveLS('crm_custom_fields', next);
      return next;
    });
  };

  /* ── Conversations ── */
  const addConversation = (conv: Omit<Conversation, 'id'>) => {
    const c = { ...conv, id: `conv-${Date.now()}` };
    setConversations(prev => { const next = [c, ...prev]; saveLS('crm_conversations', next); return next; });
    notify(`Conversation with ${conv.contactName} started`);
  };
  const sendMessage = (conversationId: string, content: string) => {
    const msg = { id: `msg-${Date.now()}`, content, sender: 'agent' as const, timestamp: new Date().toLocaleTimeString(), type: 'text' as const };
    setConversations(prev => {
      const next = prev.map(c => c.id === conversationId
        ? { ...c, messages: [...c.messages, msg], lastMessage: content, lastMessageTime: 'Just now', unread: 0 }
        : c);
      saveLS('crm_conversations', next); return next;
    });
  };
  const updateConversationStatus = (id: string, status: Conversation['status']) => {
    setConversations(prev => { const next = prev.map(c => c.id === id ? { ...c, status } : c); saveLS('crm_conversations', next); return next; });
  };

  /* ── Appointments ── */
  const addAppointment = (appt: Omit<Appointment, 'id'>) => {
    const a = { ...appt, id: `appt-${Date.now()}` };
    setAppointments(prev => { const next = [...prev, a]; saveLS('crm_appointments', next); return next; });
    notify(`Appointment "${appt.title}" scheduled!`);
  };
  const updateAppointment = (id: string, updates: Partial<Appointment>) => {
    setAppointments(prev => { const next = prev.map(a => a.id === id ? { ...a, ...updates } : a); saveLS('crm_appointments', next); return next; });
    notify('Appointment updated');
  };
  const deleteAppointment = (id: string) => {
    setAppointments(prev => { const next = prev.filter(a => a.id !== id); saveLS('crm_appointments', next); return next; });
    notify('Appointment deleted', 'info');
  };

  /* ── Campaigns ── */
  const addCampaign = (campaign: Omit<Campaign, 'id'>): Campaign => {
    const c = { ...campaign, id: `camp-${Date.now()}-${Math.floor(Math.random() * 1e4)}` };
    setCampaigns(prev => { const next = [c, ...prev]; saveLS('crm_campaigns', next); return next; });
    notify(`Campaign "${campaign.name}" created!`);
    return c;
  };
  const updateCampaign = (id: string, updates: Partial<Campaign>) => {
    setCampaigns(prev => { const next = prev.map(c => c.id === id ? { ...c, ...updates } : c); saveLS('crm_campaigns', next); return next; });
  };
  const deleteCampaign = (id: string) => {
    setCampaigns(prev => { const next = prev.filter(c => c.id !== id); saveLS('crm_campaigns', next); return next; });
    notify('Campaign deleted', 'info');
  };
  const toggleCampaignStatus = (id: string) => {
    setCampaigns(prev => prev.map(c => {
      if (c.id !== id) return c;
      const next = c.status === 'active' ? 'paused' : 'active';
      notify(`Campaign ${next === 'active' ? 'activated' : 'paused'}`);
      const updated = { ...c, status: next as Campaign['status'] };
      setTimeout(() => saveLS('crm_campaigns', prev.map(x => x.id === id ? updated : x)), 0);
      return updated;
    }));
  };

  /* ── Pipelines ── */
  const updatePipeline = (id: string, updates: Partial<Pipeline>) => {
    setPipelines(prev => { const next = prev.map(p => p.id === id ? { ...p, ...updates } : p); saveLS('crm_pipelines', next); return next; });
  };
  const createPipeline = (name: string): Pipeline => {
    const p: Pipeline = { id: `pipeline-${Date.now()}`, name, stages: [] };
    setPipelines(prev => { const next = [...prev, p]; saveLS('crm_pipelines', next); return next; });
    return p;
  };
  const deletePipeline = (id: string) => {
    setPipelines(prev => { const next = prev.filter(p => p.id !== id); saveLS('crm_pipelines', next); return next; });
  };

  /* ── Funnels ── */
  const addFunnel = (funnel: Funnel | Omit<Funnel, 'id'>) => {
    const f: Funnel = 'id' in funnel ? (funnel as Funnel) : { ...funnel, id: `funnel-${Date.now()}` };
    setFunnels(prev => { const next = [f, ...prev]; saveLS('crm_funnels', next); return next; });
    notify(`Funnel "${funnel.name}" created!`);
  };
  const updateFunnel = (id: string, updates: Partial<Funnel>) => {
    setFunnels(prev => { const next = prev.map(f => f.id === id ? { ...f, ...updates } : f); saveLS('crm_funnels', next); return next; });
  };
  const deleteFunnel = (id: string) => {
    setFunnels(prev => { const next = prev.filter(f => f.id !== id); saveLS('crm_funnels', next); return next; });
    notify('Funnel deleted', 'info');
  };

  /* ── Reviews ── */
  const addReview = (review: Omit<Review, 'id'>) => {
    const r = { ...review, id: `rev-${Date.now()}` };
    setReviews(prev => { const next = [r, ...prev]; saveLS('crm_reviews', next); return next; });
  };
  const replyToReview = (id: string, _replyText: string) => {
    setReviews(prev => { const next = prev.map(r => r.id === id ? { ...r, replied: true } : r); saveLS('crm_reviews', next); return next; });
    notify('Reply published!');
  };

  /* ── Schedule & Bookings ── */
  const updateSchedule = (updates: Partial<ScheduleAvailability>) => {
    setSchedule(prev => { const next = { ...prev, ...updates }; saveLS('crm_schedule', next); return next; });
  };
  const addBooking = (booking: Omit<Booking, 'id'>) => {
    const b = { ...booking, id: `book-${Date.now()}` };
    setBookings(prev => { const next = [b, ...prev]; saveLS('crm_bookings', next); return next; });
    notify(`Booking confirmed for ${booking.guestName}!`);
  };
  const updateBooking = (id: string, updates: Partial<Booking>) => {
    setBookings(prev => { const next = prev.map(b => b.id === id ? { ...b, ...updates } : b); saveLS('crm_bookings', next); return next; });
  };
  const deleteBooking = (id: string) => {
    setBookings(prev => { const next = prev.filter(b => b.id !== id); saveLS('crm_bookings', next); return next; });
    notify('Booking cancelled', 'info');
  };

  /* ── Contact Activities ── */
  const addContactNote = (contactId: string, note: Omit<ContactNote, 'id'>) => {
    const n = { ...note, id: `note-${Date.now()}` };
    setContacts(prev => { const next = prev.map(c => c.id === contactId ? { ...c, notes: [n, ...(c.notes ?? [])] } : c); saveLS('crm_contacts', next); return next; });
  };
  const deleteContactNote = (contactId: string, noteId: string) => {
    setContacts(prev => { const next = prev.map(c => c.id === contactId ? { ...c, notes: (c.notes ?? []).filter(n => n.id !== noteId) } : c); saveLS('crm_contacts', next); return next; });
  };
  const addContactTask = (contactId: string, task: Omit<ContactTask, 'id'>) => {
    const t = { ...task, id: `task-${Date.now()}` };
    setContacts(prev => { const next = prev.map(c => c.id === contactId ? { ...c, tasks: [...(c.tasks ?? []), t] } : c); saveLS('crm_contacts', next); return next; });
  };
  const updateContactTask = (contactId: string, taskId: string, updates: Partial<ContactTask>) => {
    setContacts(prev => { const next = prev.map(c => c.id === contactId ? { ...c, tasks: (c.tasks ?? []).map(t => t.id === taskId ? { ...t, ...updates } : t) } : c); saveLS('crm_contacts', next); return next; });
  };
  const deleteContactTask = (contactId: string, taskId: string) => {
    setContacts(prev => { const next = prev.map(c => c.id === contactId ? { ...c, tasks: (c.tasks ?? []).filter(t => t.id !== taskId) } : c); saveLS('crm_contacts', next); return next; });
  };
  const addContactActivity = (contactId: string, activity: Omit<ContactActivity, 'id'>) => {
    const a = { ...activity, id: `act-${Date.now()}` };
    setContacts(prev => { const next = prev.map(c => c.id === contactId ? { ...c, activities: [a, ...(c.activities ?? [])], lastActivity: new Date().toISOString().split('T')[0] } : c); saveLS('crm_contacts', next); return next; });
  };

  /* ── Sequences ── */
  const addSequence = (seq: Omit<EmailSequence, 'id'>): EmailSequence => {
    const s = { ...seq, id: `seq-${Date.now()}-${Math.floor(Math.random() * 1e4)}` };
    setSequences(prev => { const next = [s, ...prev]; saveLS('crm_sequences', next); return next; });
    return s;
  };
  const updateSequence = (id: string, updates: Partial<EmailSequence>) => {
    setSequences(prev => { const next = prev.map(s => s.id === id ? { ...s, ...updates } : s); saveLS('crm_sequences', next); return next; });
  };
  const deleteSequence = (id: string) => {
    setSequences(prev => { const next = prev.filter(s => s.id !== id); saveLS('crm_sequences', next); return next; });
    notify('Sequence deleted', 'info');
  };

  /* ── Automations ── */
  const addAutomation = (auto: Omit<Automation, 'id'>) => {
    const a = { ...auto, id: `auto-${Date.now()}` };
    setAutomations(prev => { const next = [a, ...prev]; saveLS('crm_automations', next); return next; });
  };
  const updateAutomation = (id: string, updates: Partial<Automation>) => {
    setAutomations(prev => { const next = prev.map(a => a.id === id ? { ...a, ...updates } : a); saveLS('crm_automations', next); return next; });
  };
  const deleteAutomation = (id: string) => {
    setAutomations(prev => { const next = prev.filter(a => a.id !== id); saveLS('crm_automations', next); return next; });
    notify('Automation deleted', 'info');
  };

  /* ── Video Projects ── */
  const addVideoProject = (project: VideoProject) => {
    setVideoProjects(prev => { const next = [project, ...prev]; saveLS('crm_video_projects', next); return next; });
    notify(`Project "${project.name}" created — AI is analyzing your video...`);
  };
  const updateVideoProject = (id: string, updates: Partial<VideoProject>) => {
    setVideoProjects(prev => { const next = prev.map(p => p.id === id ? { ...p, ...updates } : p); saveLS('crm_video_projects', next); return next; });
  };
  const deleteVideoProject = (id: string) => {
    setVideoProjects(prev => { const next = prev.filter(p => p.id !== id); saveLS('crm_video_projects', next); return next; });
    notify('Project deleted', 'info');
  };
  const updateVideoClip = (projectId: string, clipId: string, updates: Partial<VideoClip>) => {
    setVideoProjects(prev => { const next = prev.map(p => p.id === projectId ? { ...p, clips: p.clips.map(c => c.id === clipId ? { ...c, ...updates } : c) } : p); saveLS('crm_video_projects', next); return next; });
  };
  const trashVideoClip = (projectId: string, clipId: string) => {
    setVideoProjects(prev => { const next = prev.map(p => { if (p.id !== projectId) return p; const clip = p.clips.find(c => c.id === clipId); if (!clip) return p; return { ...p, clips: p.clips.filter(c => c.id !== clipId), trashedClips: [...p.trashedClips, { ...clip, status: 'disliked' as const }] }; }); saveLS('crm_video_projects', next); return next; });
    notify('Clip moved to trash', 'info');
  };
  const restoreVideoClip = (projectId: string, clipId: string) => {
    setVideoProjects(prev => { const next = prev.map(p => { if (p.id !== projectId) return p; const clip = p.trashedClips.find(c => c.id === clipId); if (!clip) return p; return { ...p, trashedClips: p.trashedClips.filter(c => c.id !== clipId), clips: [...p.clips, { ...clip, status: 'neutral' as const }] }; }); saveLS('crm_video_projects', next); return next; });
    notify('Clip restored');
  };
  const deleteVideoClip = (projectId: string, clipId: string) => {
    setVideoProjects(prev => { const next = prev.map(p => p.id === projectId ? { ...p, clips: p.clips.filter(c => c.id !== clipId), trashedClips: p.trashedClips.filter(c => c.id !== clipId) } : p); saveLS('crm_video_projects', next); return next; });
    notify('Clip permanently deleted', 'info');
  };

  /* ── Social Posts ── */
  const addSocialPost = (post: DesignPost) => {
    setSocialPosts(prev => { const next = [post, ...prev]; saveLS('crm_social_posts', next); return next; });
  };
  const updateSocialPost = (id: string, updates: Partial<DesignPost>) => {
    setSocialPosts(prev => { const next = prev.map(p => p.id === id ? { ...p, ...updates } : p); saveLS('crm_social_posts', next); return next; });
  };
  const deleteSocialPost = (id: string) => {
    setSocialPosts(prev => { const next = prev.filter(p => p.id !== id); saveLS('crm_social_posts', next); return next; });
    notify('Design deleted', 'info');
  };

  /* ── Websites ── */
  const addWebsite = (w: Website | Omit<Website, 'id'>) => {
    const site: Website = 'id' in w ? (w as Website) : { ...w, id: `site-${Date.now()}` };
    setWebsites(prev => { const next = [site, ...prev]; saveLS('crm_websites', next); return next; });
    notify(`Website "${w.name}" created!`);
  };
  const updateWebsite = (id: string, updates: Partial<Website>) => {
    setWebsites(prev => { const next = prev.map(s => s.id === id ? { ...s, ...updates } : s); saveLS('crm_websites', next); return next; });
  };
  const deleteWebsite = (id: string) => {
    setWebsites(prev => { const next = prev.filter(s => s.id !== id); saveLS('crm_websites', next); return next; });
    notify('Website deleted', 'info');
  };

  return (
    <AppContext.Provider value={{
      contacts, conversations, appointments, pipelines, campaigns, funnels, websites, reviews, sequences, automations,
      addContact, updateContact, deleteContact, bulkImportContacts,
      addConversation, sendMessage, updateConversationStatus,
      addAppointment, updateAppointment, deleteAppointment,
      addCampaign, updateCampaign, deleteCampaign, toggleCampaignStatus,
      updatePipeline, createPipeline, deletePipeline,
      schedule, updateSchedule, bookings, addBooking, updateBooking, deleteBooking,
      addContactNote, deleteContactNote, addContactTask, updateContactTask, deleteContactTask, addContactActivity,
      addFunnel, updateFunnel, deleteFunnel,
      addWebsite, updateWebsite, deleteWebsite,
      addReview, replyToReview,
      addSequence, updateSequence, deleteSequence,
      addAutomation, updateAutomation, deleteAutomation,
      notifications, addNotification: notify, dismissNotification: id => setNotifications(prev => prev.filter(n => n.id !== id)),
      sidebarMode, setSidebarMode,
      videoProjects, addVideoProject, updateVideoProject, deleteVideoProject,
      updateVideoClip, trashVideoClip, restoreVideoClip, deleteVideoClip,
      socialPosts, addSocialPost, updateSocialPost, deleteSocialPost,
      customFieldDefs, addCustomFieldDefs,
    }}>
      {children}
    </AppContext.Provider>
  );
}

export function useApp() {
  const ctx = useContext(AppContext);
  if (!ctx) throw new Error('useApp must be used within AppProvider');
  return ctx;
}
