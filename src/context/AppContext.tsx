import { createContext, useContext, useState } from 'react';
import type { ReactNode } from 'react';
import type { Contact, Conversation, Appointment, Pipeline, Campaign, Funnel, Review } from '../types';
import { mockContacts, mockConversations, mockAppointments, mockPipelines, mockCampaigns, mockFunnels, mockReviews } from '../data/mockData';

interface AppContextType {
  contacts: Contact[];
  conversations: Conversation[];
  appointments: Appointment[];
  pipelines: Pipeline[];
  campaigns: Campaign[];
  funnels: Funnel[];
  reviews: Review[];
  addContact: (contact: Omit<Contact, 'id'>) => void;
  updateContact: (id: string, updates: Partial<Contact>) => void;
  deleteContact: (id: string) => void;
  addAppointment: (appt: Omit<Appointment, 'id'>) => void;
  updateAppointment: (id: string, updates: Partial<Appointment>) => void;
  sendMessage: (conversationId: string, content: string) => void;
  addCampaign: (campaign: Omit<Campaign, 'id'>) => void;
  toggleCampaignStatus: (id: string) => void;
  replyToReview: (id: string, replyText: string) => void;
  notifications: Notification[];
  addNotification: (msg: string, type?: 'success' | 'error' | 'info') => void;
  dismissNotification: (id: string) => void;
}

interface Notification {
  id: string;
  message: string;
  type: 'success' | 'error' | 'info';
}

const AppContext = createContext<AppContextType | null>(null);

export function AppProvider({ children }: { children: ReactNode }) {
  const [contacts, setContacts] = useState<Contact[]>(mockContacts);
  const [conversations, setConversations] = useState<Conversation[]>(mockConversations);
  const [appointments, setAppointments] = useState<Appointment[]>(mockAppointments);
  const [pipelines] = useState<Pipeline[]>(mockPipelines);
  const [campaigns, setCampaigns] = useState<Campaign[]>(mockCampaigns);
  const [funnels] = useState<Funnel[]>(mockFunnels);
  const [reviews, setReviews] = useState<Review[]>(mockReviews);
  const [notifications, setNotifications] = useState<Notification[]>([]);

  const addNotification = (message: string, type: 'success' | 'error' | 'info' = 'success') => {
    const id = Date.now().toString();
    setNotifications(prev => [...prev, { id, message, type }]);
    setTimeout(() => setNotifications(prev => prev.filter(n => n.id !== id)), 4000);
  };

  const dismissNotification = (id: string) => {
    setNotifications(prev => prev.filter(n => n.id !== id));
  };

  const addContact = (contact: Omit<Contact, 'id'>) => {
    const newContact = { ...contact, id: Date.now().toString() };
    setContacts(prev => [newContact, ...prev]);
    addNotification(`Contact "${contact.name}" added successfully`);
  };

  const updateContact = (id: string, updates: Partial<Contact>) => {
    setContacts(prev => prev.map(c => c.id === id ? { ...c, ...updates } : c));
    addNotification('Contact updated successfully');
  };

  const deleteContact = (id: string) => {
    setContacts(prev => prev.filter(c => c.id !== id));
    addNotification('Contact deleted', 'info');
  };

  const addAppointment = (appt: Omit<Appointment, 'id'>) => {
    const newAppt = { ...appt, id: Date.now().toString() };
    setAppointments(prev => [...prev, newAppt]);
    addNotification(`Appointment "${appt.title}" scheduled!`);
  };

  const updateAppointment = (id: string, updates: Partial<Appointment>) => {
    setAppointments(prev => prev.map(a => a.id === id ? { ...a, ...updates } : a));
    addNotification('Appointment updated');
  };

  const sendMessage = (conversationId: string, content: string) => {
    const newMsg = { id: Date.now().toString(), content, sender: 'agent' as const, timestamp: new Date().toLocaleString(), type: 'text' as const };
    setConversations(prev => prev.map(c => c.id === conversationId ? { ...c, messages: [...c.messages, newMsg], lastMessage: content, lastMessageTime: 'Just now', unread: 0 } : c));
  };

  const addCampaign = (campaign: Omit<Campaign, 'id'>) => {
    const newCampaign = { ...campaign, id: Date.now().toString() };
    setCampaigns(prev => [newCampaign, ...prev]);
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

  return (
    <AppContext.Provider value={{
      contacts, conversations, appointments, pipelines, campaigns, funnels, reviews,
      addContact, updateContact, deleteContact, addAppointment, updateAppointment,
      sendMessage, addCampaign, toggleCampaignStatus, replyToReview,
      notifications, addNotification, dismissNotification
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
