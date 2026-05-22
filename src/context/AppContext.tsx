import { createContext, useContext, useState } from 'react';
import type { ReactNode } from 'react';
import type { Contact, Conversation, Appointment, Pipeline, Campaign, Funnel, Review } from '../types';
import type { EmailSequence, Automation } from '../types/marketing';
import { mockPipelines } from '../data/mockData';

interface Notification {
  id: string;
  message: string;
  type: 'success' | 'error' | 'info';
}

interface AppContextType {
  contacts: Contact[];
  conversations: Conversation[];
  appointments: Appointment[];
  pipelines: Pipeline[];
  campaigns: Campaign[];
  funnels: Funnel[];
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
  addCampaign: (campaign: Omit<Campaign, 'id'>) => void;
  updateCampaign: (id: string, updates: Partial<Campaign>) => void;
  deleteCampaign: (id: string) => void;
  toggleCampaignStatus: (id: string) => void;
  updatePipeline: (id: string, updates: Partial<Pipeline>) => void;
  addFunnel: (funnel: Omit<Funnel, 'id'>) => void;
  updateFunnel: (id: string, updates: Partial<Funnel>) => void;
  deleteFunnel: (id: string) => void;
  addReview: (review: Omit<Review, 'id'>) => void;
  replyToReview: (id: string, replyText: string) => void;
  addSequence: (seq: Omit<EmailSequence, 'id'>) => void;
  updateSequence: (id: string, updates: Partial<EmailSequence>) => void;
  deleteSequence: (id: string) => void;
  addAutomation: (auto: Omit<Automation, 'id'>) => void;
  updateAutomation: (id: string, updates: Partial<Automation>) => void;
  deleteAutomation: (id: string) => void;
  notifications: Notification[];
  addNotification: (msg: string, type?: 'success' | 'error' | 'info') => void;
  dismissNotification: (id: string) => void;
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
  const [reviews, setReviews]           = useState<Review[]>(()       => loadLS('crm_reviews',       []));
  const [sequences, setSequences]       = useState<EmailSequence[]>(() => loadLS('crm_sequences',   []));
  const [automations, setAutomations]   = useState<Automation[]>(()   => loadLS('crm_automations',  []));
  const [notifications, setNotifications] = useState<Notification[]>([]);

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
  const addCampaign = (campaign: Omit<Campaign, 'id'>) => {
    const c = { ...campaign, id: `camp-${Date.now()}` };
    setCampaigns(prev => { const next = [c, ...prev]; saveLS('crm_campaigns', next); return next; });
    notify(`Campaign "${campaign.name}" created!`);
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

  /* ── Funnels ── */
  const addFunnel = (funnel: Omit<Funnel, 'id'>) => {
    const f = { ...funnel, id: `funnel-${Date.now()}` };
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

  /* ── Sequences ── */
  const addSequence = (seq: Omit<EmailSequence, 'id'>) => {
    const s = { ...seq, id: `seq-${Date.now()}` };
    setSequences(prev => { const next = [s, ...prev]; saveLS('crm_sequences', next); return next; });
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

  return (
    <AppContext.Provider value={{
      contacts, conversations, appointments, pipelines, campaigns, funnels, reviews, sequences, automations,
      addContact, updateContact, deleteContact, bulkImportContacts,
      addConversation, sendMessage, updateConversationStatus,
      addAppointment, updateAppointment, deleteAppointment,
      addCampaign, updateCampaign, deleteCampaign, toggleCampaignStatus,
      updatePipeline,
      addFunnel, updateFunnel, deleteFunnel,
      addReview, replyToReview,
      addSequence, updateSequence, deleteSequence,
      addAutomation, updateAutomation, deleteAutomation,
      notifications, addNotification: notify, dismissNotification: id => setNotifications(prev => prev.filter(n => n.id !== id)),
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
