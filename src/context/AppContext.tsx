import { createContext, useContext, useState } from 'react';
import type { ReactNode } from 'react';
import type { Contact, Conversation, Appointment, Pipeline, Campaign, Funnel, Review } from '../types';
import type { EmailSequence, Automation } from '../types/marketing';
import { mockContacts, mockConversations, mockAppointments, mockPipelines, mockCampaigns, mockFunnels, mockReviews } from '../data/mockData';

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
  addAppointment: (appt: Omit<Appointment, 'id'>) => void;
  updateAppointment: (id: string, updates: Partial<Appointment>) => void;
  sendMessage: (conversationId: string, content: string) => void;
  addCampaign: (campaign: Omit<Campaign, 'id'>) => void;
  toggleCampaignStatus: (id: string) => void;
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
  try { localStorage.setItem(key, JSON.stringify(value)); } catch { /* quota exceeded — ignore */ }
}

const AppContext = createContext<AppContextType | null>(null);

export function AppProvider({ children }: { children: ReactNode }) {
  const [contacts, setContacts] = useState<Contact[]>(() => loadLS('crm_contacts', mockContacts));
  const [conversations, setConversations] = useState<Conversation[]>(mockConversations);
  const [appointments, setAppointments] = useState<Appointment[]>(mockAppointments);
  const [pipelines] = useState<Pipeline[]>(mockPipelines);
  const [campaigns, setCampaigns] = useState<Campaign[]>(mockCampaigns);
  const [funnels] = useState<Funnel[]>(mockFunnels);
  const [reviews, setReviews] = useState<Review[]>(mockReviews);
  const [sequences, setSequences] = useState<EmailSequence[]>(() => loadLS('crm_sequences', []));
  const [automations, setAutomations] = useState<Automation[]>(() => loadLS('crm_automations', []));
  const [notifications, setNotifications] = useState<Notification[]>([]);

  const addNotification = (message: string, type: 'success' | 'error' | 'info' = 'success') => {
    const id = Date.now().toString();
    setNotifications(prev => [...prev, { id, message, type }]);
    setTimeout(() => setNotifications(prev => prev.filter(n => n.id !== id)), 4000);
  };

  const dismissNotification = (id: string) => setNotifications(prev => prev.filter(n => n.id !== id));

  const addContact = (contact: Omit<Contact, 'id'>) => {
    const c = { ...contact, id: Date.now().toString() };
    setContacts(prev => { const next = [c, ...prev]; saveLS('crm_contacts', next); return next; });
    addNotification(`Contact "${contact.name}" added successfully`);
  };

  const updateContact = (id: string, updates: Partial<Contact>) => {
    setContacts(prev => { const next = prev.map(c => c.id === id ? { ...c, ...updates } : c); saveLS('crm_contacts', next); return next; });
    addNotification('Contact updated successfully');
  };

  const deleteContact = (id: string) => {
    setContacts(prev => { const next = prev.filter(c => c.id !== id); saveLS('crm_contacts', next); return next; });
    addNotification('Contact deleted', 'info');
  };

  const bulkImportContacts = (newContacts: Omit<Contact, 'id'>[]) => {
    const withIds = newContacts.map((c, i) => ({ ...c, id: `imp-${Date.now()}-${i}` }));
    setContacts(prev => { const next = [...withIds, ...prev]; saveLS('crm_contacts', next); return next; });
  };

  const addAppointment = (appt: Omit<Appointment, 'id'>) => {
    const a = { ...appt, id: Date.now().toString() };
    setAppointments(prev => [...prev, a]);
    addNotification(`Appointment "${appt.title}" scheduled!`);
  };

  const updateAppointment = (id: string, updates: Partial<Appointment>) => {
    setAppointments(prev => prev.map(a => a.id === id ? { ...a, ...updates } : a));
    addNotification('Appointment updated');
  };

  const sendMessage = (conversationId: string, content: string) => {
    const msg = { id: Date.now().toString(), content, sender: 'agent' as const, timestamp: new Date().toLocaleString(), type: 'text' as const };
    setConversations(prev => prev.map(c => c.id === conversationId ? { ...c, messages: [...c.messages, msg], lastMessage: content, lastMessageTime: 'Just now', unread: 0 } : c));
  };

  const addCampaign = (campaign: Omit<Campaign, 'id'>) => {
    const c = { ...campaign, id: Date.now().toString() };
    setCampaigns(prev => [c, ...prev]);
    addNotification(`Campaign "${campaign.name}" created!`);
  };

  const toggleCampaignStatus = (id: string) => {
    setCampaigns(prev => prev.map(c => {
      if (c.id !== id) return c;
      const next = c.status === 'active' ? 'paused' : c.status === 'paused' ? 'active' : c.status === 'draft' ? 'active' : 'paused';
      addNotification(`Campaign ${next === 'active' ? 'activated' : 'paused'}`);
      return { ...c, status: next };
    }));
  };

  const replyToReview = (id: string, _replyText: string) => {
    setReviews(prev => prev.map(r => r.id === id ? { ...r, replied: true } : r));
    addNotification('Reply published successfully!');
  };

  const addSequence = (seq: Omit<EmailSequence, 'id'>) => {
    const s = { ...seq, id: `seq-${Date.now()}` };
    setSequences(prev => { const next = [s, ...prev]; saveLS('crm_sequences', next); return next; });
  };

  const updateSequence = (id: string, updates: Partial<EmailSequence>) => {
    setSequences(prev => { const next = prev.map(s => s.id === id ? { ...s, ...updates } : s); saveLS('crm_sequences', next); return next; });
  };

  const deleteSequence = (id: string) => {
    setSequences(prev => { const next = prev.filter(s => s.id !== id); saveLS('crm_sequences', next); return next; });
    addNotification('Sequence deleted', 'info');
  };

  const addAutomation = (auto: Omit<Automation, 'id'>) => {
    const a = { ...auto, id: `auto-${Date.now()}` };
    setAutomations(prev => { const next = [a, ...prev]; saveLS('crm_automations', next); return next; });
  };

  const updateAutomation = (id: string, updates: Partial<Automation>) => {
    setAutomations(prev => { const next = prev.map(a => a.id === id ? { ...a, ...updates } : a); saveLS('crm_automations', next); return next; });
  };

  const deleteAutomation = (id: string) => {
    setAutomations(prev => { const next = prev.filter(a => a.id !== id); saveLS('crm_automations', next); return next; });
    addNotification('Automation deleted', 'info');
  };

  return (
    <AppContext.Provider value={{
      contacts, conversations, appointments, pipelines, campaigns, funnels, reviews, sequences, automations,
      addContact, updateContact, deleteContact, bulkImportContacts,
      addAppointment, updateAppointment, sendMessage,
      addCampaign, toggleCampaignStatus, replyToReview,
      addSequence, updateSequence, deleteSequence,
      addAutomation, updateAutomation, deleteAutomation,
      notifications, addNotification, dismissNotification,
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
