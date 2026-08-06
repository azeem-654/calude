import { useState, useMemo } from 'react';
import {
  X, Mail, Phone, Building2, Briefcase, Link2, MessageCircle, Globe, MapPin,
  Plus, Check, Trash2, Edit2, Send, Calendar, Tag, Clock, User, Activity,
  FileText, CheckSquare, MessageSquare, ExternalLink,
} from 'lucide-react';
import { useApp } from '../../context/AppContext';
import {
  computeHealthScore, inferLifecycle, nextBestActions, dealsForContact,
  appointmentsForContact, buildTimeline, type LifecycleStage, type NextAction,
} from '../../services/contactIntelligence';
import { HealthRing, LifecycleBar, NextBestActions, UnifiedTimeline, ModuleSummary } from './CommandCenter';
import EmailTab from './EmailTab';
import DealsTab from './DealsTab';
import type { Contact, ContactActivity } from '../../types';
import { sendEmail, loadEmailConfig, personalizeHtml } from '../../services/emailService';

const ACTIVITY_ICONS: Record<ContactActivity['type'], string> = {
  email_sent: '📧', email_opened: '👁', note: '📝', task_completed: '✅',
  meeting: '📅', tag_added: '🏷', stage_change: '🔄', form_submitted: '📋',
  link_clicked: '🔗', call: '📞',
};

const ACTIVITY_COLORS: Record<ContactActivity['type'], string> = {
  email_sent: '#17191c', email_opened: '#3b3f45', note: '#f59e0b',
  task_completed: '#22c55e', meeting: '#3b82f6', tag_added: '#ec4899',
  stage_change: '#64748b', form_submitted: '#14b8a6', link_clicked: '#f97316', call: '#06b6d4',
};

function fmtTime(iso: string) {
  const d = new Date(iso);
  const diff = Date.now() - d.getTime();
  if (diff < 60000) return 'Just now';
  if (diff < 3600000) return `${Math.floor(diff / 60000)}m ago`;
  if (diff < 86400000) return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  return d.toLocaleDateString([], { month: 'short', day: 'numeric', year: 'numeric' });
}

const statusColors: Record<string, { bg: string; color: string }> = {
  lead: { bg: '#eff6ff', color: '#2563eb' },
  prospect: { bg: '#fef3c7', color: '#d97706' },
  customer: { bg: '#ecfdf5', color: '#16a34a' },
  churned: { bg: '#fef2f2', color: '#dc2626' },
};

interface Props {
  contact: Contact;
  onClose: () => void;
}

export default function ContactProfile({ contact, onClose }: Props) {
  const { updateContact, deleteContact, addContactNote, deleteContactNote, addContactTask, updateContactTask, deleteContactTask, addContactActivity, addNotification, videoProjects, pipelines, updatePipeline, appointments, sequences } = useApp();
  const [tab, setTab] = useState<'overview' | 'activity' | 'tasks' | 'notes' | 'email' | 'deals' | 'videos'>('overview');
  const contactClips = videoProjects.filter(p => p.contactId === contact.id).flatMap(p => p.clips);
  const [activityFilter, setActivityFilter] = useState<ContactActivity['type'] | 'all'>('all');

  // Editing state
  const [editing, setEditing] = useState(false);
  const [editForm, setEditForm] = useState({ ...contact });

  // Note input
  const [noteInput, setNoteInput] = useState('');

  // Task input
  const [taskTitle, setTaskTitle] = useState('');
  const [taskDue, setTaskDue] = useState('');

  // Email compose
  const [emailSubject, setEmailSubject] = useState('');
  const [emailBody, setEmailBody] = useState('');
  const [sendingEmail, setSendingEmail] = useState(false);

  // New tag
  const [newTag, setNewTag] = useState('');

  const sc = statusColors[contact.status] ?? { bg: '#f8fafc', color: '#64748b' };
  const activities = contact.activities ?? [];
  const notes = contact.notes ?? [];
  const tasks = contact.tasks ?? [];
  const pendingTasks = tasks.filter(t => !t.done);
  const doneTasks = tasks.filter(t => t.done);

  const filteredActivities = activityFilter === 'all' ? activities : activities.filter(a => a.type === activityFilter);

  /* ── Command-center intelligence, derived from live cross-module data ── */
  const contactDeals = useMemo(() => dealsForContact(contact, pipelines), [contact, pipelines]);
  const contactAppts = useMemo(() => appointmentsForContact(contact, appointments), [contact, appointments]);
  const health = useMemo(() => computeHealthScore(contact, contactDeals, contactAppts), [contact, contactDeals, contactAppts]);
  const suggestedStage = useMemo(() => inferLifecycle(contact, contactDeals), [contact, contactDeals]);
  const stage: LifecycleStage = contact.lifecycle ?? suggestedStage;
  const actions = useMemo(() => nextBestActions(contact, contactDeals, contactAppts, health), [contact, contactDeals, contactAppts, health]);
  const timeline = useMemo(() => buildTimeline(contact, contactDeals, contactAppts), [contact, contactDeals, contactAppts]);
  const emailsSent = activities.filter(a => a.type === 'email_sent').length;

  const setStage = (next: LifecycleStage) => {
    if (next === stage) return;
    updateContact(contact.id, { lifecycle: next });
    addContactActivity(contact.id, { type: 'stage_change', description: `Lifecycle stage: ${stage} → ${next}`, timestamp: new Date().toISOString() });
    addNotification(`${contact.name} moved to ${next}`);
  };

  /** Route a next-best-action to the right place in the profile. */
  const runAction = (a: NextAction) => {
    if (a.action === 'email') setTab('email');
    else if (a.action === 'task') setTab('tasks');
    else if (a.action === 'profile') { setEditing(true); setTab('overview'); }
    else if (a.action === 'deal') setTab('deals');
    else if (a.action === 'call' && contact.phone) window.location.href = `tel:${contact.phone}`;
    else setTab('activity');
  };

  const saveEdit = () => {
    updateContact(contact.id, editForm);
    setEditing(false);
    addContactActivity(contact.id, { type: 'note', description: 'Profile updated', timestamp: new Date().toISOString() });
  };

  const addNote = () => {
    if (!noteInput.trim()) return;
    addContactNote(contact.id, { content: noteInput.trim(), createdAt: new Date().toISOString() });
    addContactActivity(contact.id, { type: 'note', description: `Note added: "${noteInput.trim().slice(0, 40)}${noteInput.length > 40 ? '...' : ''}"`, timestamp: new Date().toISOString() });
    setNoteInput('');
  };

  const addTask = () => {
    if (!taskTitle.trim()) return;
    addContactTask(contact.id, { title: taskTitle.trim(), dueDate: taskDue, done: false, createdAt: new Date().toISOString() });
    setTaskTitle('');
    setTaskDue('');
  };

  const sendContactEmail = async () => {
    if (!emailSubject.trim() || !emailBody.trim()) return;
    setSendingEmail(true);
    const cfg = loadEmailConfig();
    const html = personalizeHtml(`<div style="font-family:sans-serif;line-height:1.6">${emailBody.replace(/\n/g, '<br>')}</div>`, { name: contact.name, email: contact.email });
    const result = await sendEmail(cfg, { to: contact.email, toName: contact.name, subject: emailSubject, html });
    setSendingEmail(false);
    if (result.success) {
      addContactActivity(contact.id, { type: 'email_sent', description: `Email sent: "${emailSubject}"`, timestamp: new Date().toISOString(), metadata: { subject: emailSubject, emailId: result.id || '' } });
      addNotification(`Email sent to ${contact.name}`);
      setEmailSubject('');
      setEmailBody('');
    } else {
      addNotification(`Failed to send: ${result.error}`, 'error');
    }
  };

  const addTag = () => {
    if (!newTag.trim() || contact.tags.includes(newTag.trim())) return;
    updateContact(contact.id, { tags: [...contact.tags, newTag.trim()] });
    addContactActivity(contact.id, { type: 'tag_added', description: `Tag added: "${newTag.trim()}"`, timestamp: new Date().toISOString() });
    setNewTag('');
  };

  const removeTag = (tag: string) => {
    updateContact(contact.id, { tags: contact.tags.filter(t => t !== tag) });
  };

  const inp: React.CSSProperties = { width: '100%', padding: '9px 12px', border: '1px solid #e2e8f0', borderRadius: 9, fontSize: 13, outline: 'none', fontFamily: 'inherit', boxSizing: 'border-box', color: '#0f172a', backgroundColor: '#fff' };
  const fieldRow = (label: string, value: string, key: keyof typeof editForm) => (
    <div key={key as string}>
      <div style={{ fontSize: 11, fontWeight: 600, color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 4 }}>{label}</div>
      {editing
        ? <input value={(editForm as unknown as Record<string, string>)[key as string] || ''} onChange={e => setEditForm(p => ({ ...p, [key]: e.target.value }))} style={inp} />
        : <div style={{ fontSize: 13, color: value ? '#475569' : '#cbd5e1', fontStyle: value ? 'normal' : 'italic' }}>{value || 'Not set'}</div>}
    </div>
  );

  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 400, display: 'flex', backgroundColor: 'rgba(15,23,42,0.55)', backdropFilter: 'blur(4px)' }} onClick={onClose}>
      <div style={{ marginLeft: 'auto', width: '100%', maxWidth: 860, height: '100%', backgroundColor: 'white', display: 'flex', flexDirection: 'column', borderRadius: '16px 0 0 16px', boxShadow: '0 24px 48px -12px rgba(16,24,40,0.25)', overflow: 'hidden' }}
        onClick={e => e.stopPropagation()}>

        {/* Profile Header */}
        <div style={{ padding: '24px', borderBottom: '1px solid #e6e9f0', backgroundColor: 'white', flexShrink: 0 }}>
          <div style={{ display: 'flex', alignItems: 'flex-start', gap: 16, justifyContent: 'space-between' }}>
            <div style={{ display: 'flex', alignItems: 'flex-start', gap: 16 }}>
              <div style={{ width: 56, height: 56, borderRadius: '50%', background: '#17191c', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'white', fontSize: 20, fontWeight: 700, flexShrink: 0, boxShadow: '0 1px 2px rgba(23,25,28,0.3)' }}>
                {contact.name.split(' ').map(n => n[0]).join('').slice(0, 2).toUpperCase()}
              </div>
              <div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 4 }}>
                  <h1 style={{ margin: 0, fontSize: 20, fontWeight: 700, color: '#0f172a', letterSpacing: '-0.02em' }}>{contact.name}</h1>
                  <span style={{ fontSize: 11, fontWeight: 600, padding: '3px 10px', borderRadius: 999, backgroundColor: sc.bg, color: sc.color }}>
                    {contact.status.charAt(0).toUpperCase() + contact.status.slice(1)}
                  </span>
                </div>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 14 }}>
                  {contact.jobTitle && <span style={{ fontSize: 13, color: '#64748b', display: 'inline-flex', alignItems: 'center', gap: 5 }}><Briefcase size={12} color="#94a3b8" />{contact.jobTitle}</span>}
                  {contact.company && <span style={{ fontSize: 13, color: '#64748b', display: 'inline-flex', alignItems: 'center', gap: 5 }}><Building2 size={12} color="#94a3b8" />{contact.company}</span>}
                  {contact.email && <span style={{ fontSize: 13, color: '#64748b', display: 'inline-flex', alignItems: 'center', gap: 5 }}><Mail size={12} color="#94a3b8" />{contact.email}</span>}
                </div>
              </div>
            </div>
            <div style={{ display: 'flex', gap: 12, alignItems: 'flex-start' }}>
              <HealthRing health={health} />
              <button onClick={() => { setEditing(e => !e); setTab('overview'); }}
                style={{ display: 'flex', alignItems: 'center', gap: 5, padding: '8px 14px', border: editing ? 'none' : '1px solid #e2e8f0', borderRadius: 9, backgroundColor: editing ? '#17191c' : 'white', color: editing ? 'white' : '#374151', fontSize: 12, fontWeight: 600, cursor: 'pointer', boxShadow: editing ? '0 1px 2px rgba(23,25,28,0.3)' : '0 1px 2px rgba(16,24,40,0.04)' }}>
                <Edit2 size={13} /> {editing ? 'Editing' : 'Edit'}
              </button>
              <button onClick={onClose} style={{ border: 'none', background: '#f1f5f9', borderRadius: 8, cursor: 'pointer', color: '#64748b', padding: 7, display: 'flex' }}>
                <X size={16} />
              </button>
            </div>
          </div>

          {/* Lifecycle stage */}
          <div style={{ marginTop: 18 }}>
            <LifecycleBar current={stage} suggested={suggestedStage} onChange={setStage} />
          </div>

          {/* Cross-module summary */}
          <div style={{ marginTop: 14 }}>
            <ModuleSummary
              deals={contactDeals}
              appointments={contactAppts}
              emailCount={emailsSent}
              onOpen={what => setTab(what === 'email' ? 'email' : 'activity')}
            />
          </div>
        </div>

        {/* Tabs */}
        <div style={{ display: 'flex', borderBottom: '1px solid #e6e9f0', backgroundColor: '#f8fafc', flexShrink: 0, overflowX: 'auto', padding: '0 12px' }}>
          {([
            { id: 'overview', label: 'Overview', icon: <User size={14} /> },
            { id: 'activity', label: `Activity (${activities.length})`, icon: <Activity size={14} /> },
            { id: 'tasks', label: `Tasks (${pendingTasks.length})`, icon: <CheckSquare size={14} /> },
            { id: 'notes', label: `Notes (${notes.length})`, icon: <FileText size={14} /> },
            { id: 'email', label: 'Email', icon: <Send size={14} /> },
            { id: 'deals', label: `Deals (${contactDeals.length})`, icon: <Briefcase size={14} /> },
            { id: 'videos', label: `AI Shorts (${contactClips.length})`, icon: <ExternalLink size={14} /> },
          ] as { id: typeof tab; label: string; icon: React.ReactNode }[]).map(t => (
            <button key={t.id} onClick={() => setTab(t.id)}
              style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '12px 16px', border: 'none', borderBottom: `2px solid ${tab === t.id ? '#17191c' : 'transparent'}`, backgroundColor: 'transparent', color: tab === t.id ? '#17191c' : '#64748b', fontSize: 13, fontWeight: tab === t.id ? 700 : 500, letterSpacing: '-0.01em', cursor: 'pointer', whiteSpace: 'nowrap' }}>
              {t.icon} {t.label}
            </button>
          ))}
        </div>

        {/* Content */}
        <div style={{ flex: 1, overflowY: 'auto', padding: '24px', backgroundColor: '#fff' }}>

          {/* ── Overview Tab ── */}
          {tab === 'overview' && (
            <div style={{ marginBottom: 22 }}>
              <NextBestActions actions={actions} onAct={runAction} />
            </div>
          )}
          {tab === 'overview' && (
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 24 }}>
              {/* Contact info */}
              <div>
                <h3 style={{ margin: '0 0 16px', fontSize: 13, fontWeight: 700, color: '#0f172a', letterSpacing: '-0.01em' }}>Contact Information</h3>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
                  {fieldRow('First Name', contact.firstName || contact.name.split(' ')[0] || '', 'firstName')}
                  {fieldRow('Last Name', contact.lastName || contact.name.split(' ').slice(1).join(' ') || '', 'lastName')}
                  {fieldRow('Email', contact.email, 'email')}
                  {fieldRow('Phone', contact.phone, 'phone')}
                  {fieldRow('Company', contact.company || '', 'company')}
                  {fieldRow('Job Title', contact.jobTitle || '', 'jobTitle')}
                  {fieldRow('Source', contact.source, 'source')}
                  {fieldRow('Address', contact.address || '', 'address')}
                </div>
              </div>

              {/* Social + details */}
              <div>
                <h3 style={{ margin: '0 0 16px', fontSize: 13, fontWeight: 700, color: '#0f172a', letterSpacing: '-0.01em' }}>Social & Web</h3>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 14, marginBottom: 24 }}>
                  <div>
                    <div style={{ fontSize: 11, fontWeight: 600, color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 4 }}>LinkedIn</div>
                    {editing
                      ? <input value={editForm.linkedin || ''} onChange={e => setEditForm(p => ({ ...p, linkedin: e.target.value }))} placeholder="https://linkedin.com/in/..." style={inp} />
                      : contact.linkedin
                        ? <a href={contact.linkedin} target="_blank" rel="noopener noreferrer" style={{ fontSize: 14, color: '#17191c', display: 'flex', alignItems: 'center', gap: 4 }}><Link2 size={13} /> {contact.linkedin} <ExternalLink size={11} /></a>
                        : <span style={{ fontSize: 14, color: '#d1d5db', fontStyle: 'italic' }}>Not set</span>}
                  </div>
                  <div>
                    <div style={{ fontSize: 11, fontWeight: 600, color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 4 }}>Twitter / X</div>
                    {editing
                      ? <input value={editForm.twitter || ''} onChange={e => setEditForm(p => ({ ...p, twitter: e.target.value }))} placeholder="@handle" style={inp} />
                      : <div style={{ fontSize: 14, color: contact.twitter ? '#374151' : '#d1d5db', fontStyle: contact.twitter ? 'normal' : 'italic' }}>{contact.twitter || 'Not set'}</div>}
                  </div>
                  <div>
                    <div style={{ fontSize: 11, fontWeight: 600, color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 4 }}>Website</div>
                    {editing
                      ? <input value={editForm.website || ''} onChange={e => setEditForm(p => ({ ...p, website: e.target.value }))} placeholder="https://..." style={inp} />
                      : contact.website
                        ? <a href={contact.website} target="_blank" rel="noopener noreferrer" style={{ fontSize: 14, color: '#17191c', display: 'flex', alignItems: 'center', gap: 4 }}><Globe size={13} /> {contact.website} <ExternalLink size={11} /></a>
                        : <span style={{ fontSize: 14, color: '#d1d5db', fontStyle: 'italic' }}>Not set</span>}
                  </div>
                  {editing && <div><div style={{ fontSize: 11, fontWeight: 600, color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 4 }}>Assigned To</div><input value={editForm.assignedTo || ''} onChange={e => setEditForm(p => ({ ...p, assignedTo: e.target.value }))} style={inp} /></div>}
                </div>

                {/* Status */}
                <h3 style={{ margin: '0 0 12px', fontSize: 13, fontWeight: 700, color: '#0f172a', letterSpacing: '-0.01em' }}>Status & Lifecycle</h3>
                {editing
                  ? <select value={editForm.status} onChange={e => setEditForm(p => ({ ...p, status: e.target.value as Contact['status'] }))} style={{ ...inp, marginBottom: 14 }}>
                      {['lead','prospect','customer','churned'].map(s => <option key={s} value={s}>{s.charAt(0).toUpperCase()+s.slice(1)}</option>)}
                    </select>
                  : <span style={{ display: 'inline-block', marginBottom: 14, padding: '3px 10px', borderRadius: 999, fontSize: 11, fontWeight: 600, backgroundColor: sc.bg, color: sc.color }}>{contact.status.charAt(0).toUpperCase()+contact.status.slice(1)}</span>}

                {/* Tags */}
                <h3 style={{ margin: '0 0 12px', fontSize: 13, fontWeight: 700, color: '#0f172a', letterSpacing: '-0.01em' }}>Tags</h3>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 8 }}>
                  {contact.tags.map(tag => (
                    <span key={tag} style={{ display: 'inline-flex', alignItems: 'center', gap: 4, padding: '3px 10px', borderRadius: 999, fontSize: 11, backgroundColor: '#eceef1', color: '#17191c', fontWeight: 600 }}>
                      {tag}
                      {editing && <button onClick={() => removeTag(tag)} style={{ border: 'none', background: 'none', cursor: 'pointer', color: '#5c6066', padding: 0, display: 'flex', marginLeft: 2 }}><X size={10} /></button>}
                    </span>
                  ))}
                </div>
                <div style={{ display: 'flex', gap: 6 }}>
                  <input value={newTag} onChange={e => setNewTag(e.target.value)} placeholder="Add tag..." style={{ ...inp, flex: 1 }} onKeyDown={e => e.key === 'Enter' && addTag()} />
                  <button onClick={addTag} style={{ padding: '8px 12px', backgroundColor: '#17191c', color: 'white', border: 'none', borderRadius: 9, fontSize: 12, fontWeight: 600, cursor: 'pointer', boxShadow: '0 1px 2px rgba(23,25,28,0.3)', display: 'flex', alignItems: 'center' }}><Tag size={13} /></button>
                </div>
              </div>

              {editing && (
                <div style={{ gridColumn: '1 / -1', display: 'flex', justifyContent: 'flex-end', gap: 10, paddingTop: 16, borderTop: '1px solid #f1f5f9' }}>
                  <button onClick={() => setEditing(false)} style={{ padding: '9px 16px', border: '1px solid #e2e8f0', borderRadius: 9, fontSize: 13, fontWeight: 500, cursor: 'pointer', backgroundColor: 'white', color: '#374151' }}>Cancel</button>
                  <button onClick={saveEdit} style={{ padding: '9px 16px', backgroundColor: '#17191c', color: 'white', border: 'none', borderRadius: 9, fontSize: 13, fontWeight: 600, cursor: 'pointer', boxShadow: '0 1px 2px rgba(23,25,28,0.3)' }}>Save Changes</button>
                </div>
              )}
            </div>
          )}

          {/* ── Activity Tab ── */}
          {tab === 'activity' && (
            <UnifiedTimeline contact={contact} entries={timeline} />
          )}

          {tab === 'tasks' && (
            <div>
              {/* Add task */}
              <div style={{ display: 'flex', gap: 8, marginBottom: 20 }}>
                <input value={taskTitle} onChange={e => setTaskTitle(e.target.value)} placeholder="Task title..."
                  style={{ ...inp, flex: 1 }} onKeyDown={e => e.key === 'Enter' && addTask()} />
                <input type="date" value={taskDue} onChange={e => setTaskDue(e.target.value)} style={{ ...inp, width: 140 }} />
                <button onClick={addTask} style={{ padding: '8px 14px', backgroundColor: '#17191c', color: 'white', border: 'none', borderRadius: 7, fontSize: 12, fontWeight: 600, cursor: 'pointer', whiteSpace: 'nowrap' }}>+ Task</button>
              </div>

              {/* Open tasks */}
              {pendingTasks.length > 0 && (
                <div style={{ marginBottom: 20 }}>
                  <div style={{ fontSize: 12, fontWeight: 700, color: '#94a3b8', textTransform: 'uppercase', marginBottom: 8 }}>Open ({pendingTasks.length})</div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                    {pendingTasks.map(task => (
                      <div key={task.id} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 14px', backgroundColor: '#f8fafc', borderRadius: 8, border: '1px solid #e2e8f0' }}>
                        <input type="checkbox" checked={false} onChange={() => { updateContactTask(contact.id, task.id, { done: true }); addContactActivity(contact.id, { type: 'task_completed', description: `Task completed: "${task.title}"`, timestamp: new Date().toISOString() }); }} style={{ cursor: 'pointer', width: 16, height: 16 }} />
                        <span style={{ flex: 1, fontSize: 14, color: '#374151' }}>{task.title}</span>
                        {task.dueDate && <span style={{ fontSize: 11, color: new Date(task.dueDate) < new Date() ? '#dc2626' : '#94a3b8', fontWeight: new Date(task.dueDate) < new Date() ? 700 : 400 }}><Clock size={11} style={{ display: 'inline', marginRight: 3 }} />{task.dueDate}</span>}
                        <button onClick={() => deleteContactTask(contact.id, task.id)} style={{ border: 'none', background: 'none', cursor: 'pointer', color: '#94a3b8', display: 'flex', padding: 2 }}><Trash2 size={13} /></button>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Completed tasks */}
              {doneTasks.length > 0 && (
                <div>
                  <div style={{ fontSize: 12, fontWeight: 700, color: '#94a3b8', textTransform: 'uppercase', marginBottom: 8 }}>Completed ({doneTasks.length})</div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                    {doneTasks.map(task => (
                      <div key={task.id} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 14px', borderRadius: 8, opacity: 0.6 }}>
                        <Check size={16} color="#22c55e" />
                        <span style={{ flex: 1, fontSize: 13, color: '#94a3b8', textDecoration: 'line-through' }}>{task.title}</span>
                        <button onClick={() => deleteContactTask(contact.id, task.id)} style={{ border: 'none', background: 'none', cursor: 'pointer', color: '#d1d5db', display: 'flex', padding: 2 }}><Trash2 size={12} /></button>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {tasks.length === 0 && (
                <div style={{ textAlign: 'center', padding: '40px 0', color: '#94a3b8' }}>
                  <CheckSquare size={32} color="#e2e8f0" style={{ margin: '0 auto 10px', display: 'block' }} />
                  <p style={{ margin: 0, fontSize: 14 }}>No tasks yet. Add one above.</p>
                </div>
              )}
            </div>
          )}

          {/* ── Notes Tab ── */}
          {tab === 'notes' && (
            <div>
              <div style={{ display: 'flex', gap: 8, marginBottom: 20 }}>
                <textarea value={noteInput} onChange={e => setNoteInput(e.target.value)} placeholder="Add a note about this contact..."
                  rows={3} style={{ ...inp, flex: 1, resize: 'vertical' }} />
                <button onClick={addNote} style={{ padding: '8px 14px', backgroundColor: '#17191c', color: 'white', border: 'none', borderRadius: 7, fontSize: 12, fontWeight: 600, cursor: 'pointer', alignSelf: 'flex-start' }}>+ Note</button>
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                {notes.map(note => (
                  <div key={note.id} style={{ padding: '14px 16px', backgroundColor: '#fffbeb', borderRadius: 10, border: '1px solid #fde68a', position: 'relative' }}>
                    <p style={{ margin: '0 0 8px', fontSize: 14, color: '#374151', lineHeight: 1.6, whiteSpace: 'pre-wrap' }}>{note.content}</p>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <span style={{ fontSize: 11, color: '#94a3b8' }}>{fmtTime(note.createdAt)}</span>
                      <button onClick={() => deleteContactNote(contact.id, note.id)} style={{ border: 'none', background: 'none', cursor: 'pointer', color: '#94a3b8', display: 'flex', padding: 2 }}><Trash2 size={13} /></button>
                    </div>
                  </div>
                ))}
                {notes.length === 0 && (
                  <div style={{ textAlign: 'center', padding: '40px 0', color: '#94a3b8' }}>
                    <FileText size={32} color="#e2e8f0" style={{ margin: '0 auto 10px', display: 'block' }} />
                    <p style={{ margin: 0, fontSize: 14 }}>No notes yet. Add one above.</p>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* ── Email Tab ── */}
          {tab === 'email' && (
            <EmailTab
              contact={contact}
              sequences={sequences}
              onActivity={(desc, type) => addContactActivity(contact.id, { type: type ?? 'email_sent', description: desc, timestamp: new Date().toISOString() })}
            />
          )}

          {/* ── Deals Tab ── */}
          {tab === 'deals' && (
            <DealsTab
              contact={contact}
              pipelines={pipelines}
              health={health.total}
              onPipelines={next => {
                for (const p of next) {
                  const before = pipelines.find(x => x.id === p.id);
                  if (before !== p) updatePipeline(p.id, { stages: p.stages });
                }
              }}
              onActivity={text => addContactActivity(contact.id, { type: 'stage_change', description: text, timestamp: new Date().toISOString() })}
              onNotify={text => addNotification(text)}
            />
          )}

          {/* ── Videos Tab ── */}
          {tab === 'videos' && (
            <div>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '16px' }}>
                <h3 style={{ margin: 0, fontSize: '14px', fontWeight: 700, color: '#0f172a' }}>AI Shorts for {contact.name}</h3>
                <a href="/ai-shorts" style={{ fontSize: '12px', color: '#17191c', fontWeight: 600, textDecoration: 'none', display: 'flex', alignItems: 'center', gap: '4px' }}>
                  <ExternalLink size={12} /> Open AI Shorts
                </a>
              </div>
              {contactClips.length === 0 ? (
                <div style={{ textAlign: 'center', padding: '40px 20px', border: '2px dashed #e2e8f0', borderRadius: '10px', color: '#94a3b8' }}>
                  <div style={{ fontSize: '32px', marginBottom: '8px' }}>✂️</div>
                  <p style={{ margin: '0 0 4px', fontWeight: 600, color: '#374151' }}>No clips linked yet</p>
                  <p style={{ margin: 0, fontSize: '12px' }}>Upload a meeting or webinar recording and link it to this contact in AI Shorts.</p>
                </div>
              ) : (
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(140px, 1fr))', gap: '10px' }}>
                  {contactClips.map(clip => (
                    <div key={clip.id} style={{ borderRadius: '8px', border: '1px solid #e2e8f0', overflow: 'hidden' }}>
                      <div style={{ height: '80px', background: clip.thumbnailGradient, position: 'relative', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                        <div style={{ width: '28px', height: '28px', borderRadius: '50%', background: 'rgba(255,255,255,0.25)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                          ▶
                        </div>
                        <div style={{ position: 'absolute', top: '4px', right: '4px', fontSize: '10px', background: 'rgba(0,0,0,0.5)', color: 'white', padding: '1px 5px', borderRadius: '3px', fontWeight: 700 }}>
                          {clip.viralityScore}
                        </div>
                      </div>
                      <div style={{ padding: '6px 8px' }}>
                        <p style={{ margin: 0, fontSize: '11px', fontWeight: 600, color: '#0f172a', overflow: 'hidden', whiteSpace: 'nowrap', textOverflow: 'ellipsis' }}>{clip.title}</p>
                        <p style={{ margin: '2px 0 0', fontSize: '10px', color: '#94a3b8' }}>{clip.duration}s · {clip.aspectRatio}</p>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>

        {/* Footer actions */}
        <div style={{ padding: '12px 24px', borderTop: '1px solid #e2e8f0', display: 'flex', justifyContent: 'space-between', alignItems: 'center', backgroundColor: '#f8fafc', flexShrink: 0 }}>
          <button onClick={() => { if (window.confirm(`Delete ${contact.name}?`)) { deleteContact(contact.id); onClose(); } }}
            style={{ display: 'flex', alignItems: 'center', gap: 5, padding: '7px 14px', border: '1px solid #fecaca', borderRadius: 8, backgroundColor: '#fef2f2', color: '#dc2626', fontSize: 12, fontWeight: 600, cursor: 'pointer' }}>
            <Trash2 size={13} /> Delete Contact
          </button>
          <div style={{ display: 'flex', gap: 8 }}>
            <button onClick={() => setTab('email')}
              style={{ display: 'flex', alignItems: 'center', gap: 5, padding: '7px 14px', border: '1px solid #e2e8f0', borderRadius: 8, backgroundColor: 'white', color: '#374151', fontSize: 12, fontWeight: 600, cursor: 'pointer' }}>
              <Mail size={13} /> Email
            </button>
            <button onClick={() => setTab('tasks')}
              style={{ display: 'flex', alignItems: 'center', gap: 5, padding: '7px 14px', border: '1px solid #e2e8f0', borderRadius: 8, backgroundColor: 'white', color: '#374151', fontSize: 12, fontWeight: 600, cursor: 'pointer' }}>
              <Calendar size={13} /> Task
            </button>
            <button onClick={() => setTab('notes')}
              style={{ display: 'flex', alignItems: 'center', gap: 5, padding: '7px 14px', border: '1px solid #e2e8f0', borderRadius: 8, backgroundColor: 'white', color: '#374151', fontSize: 12, fontWeight: 600, cursor: 'pointer' }}>
              <MessageSquare size={13} /> Note
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
