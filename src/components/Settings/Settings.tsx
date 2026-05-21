import React, { useState } from 'react';
import { Settings as SettingsIcon, User, Bell, Shield, CreditCard, Globe, Mail, Phone, Palette, Key, Save, ChevronRight } from 'lucide-react';
import Header from '../Layout/Header';
import { useApp } from '../../context/AppContext';

const tabs = [
  { id: 'profile', label: 'Profile', icon: User },
  { id: 'notifications', label: 'Notifications', icon: Bell },
  { id: 'security', label: 'Security', icon: Shield },
  { id: 'billing', label: 'Billing', icon: CreditCard },
  { id: 'integrations', label: 'Integrations', icon: Globe },
  { id: 'branding', label: 'Branding', icon: Palette },
];

function Toggle({ value, onChange }: { value: boolean; onChange: (v: boolean) => void }) {
  return (
    <button onClick={() => onChange(!value)} style={{ width: '44px', height: '24px', borderRadius: '12px', backgroundColor: value ? '#6366f1' : '#e2e8f0', border: 'none', cursor: 'pointer', position: 'relative', transition: 'background 0.2s' }}>
      <div style={{ width: '18px', height: '18px', borderRadius: '50%', backgroundColor: 'white', position: 'absolute', top: '3px', left: value ? '23px' : '3px', transition: 'left 0.2s', boxShadow: '0 1px 3px rgba(0,0,0,0.2)' }} />
    </button>
  );
}

export default function Settings() {
  const { addNotification } = useApp();
  const [activeTab, setActiveTab] = useState('profile');
  const [profile, setProfile] = useState({ firstName: 'John', lastName: 'Doe', email: 'john@crmpro.com', phone: '+1 (555) 123-4567', company: 'CRMPro Inc.', timezone: 'America/New_York' });
  const [notifications, setNotifications] = useState({ emailNew: true, emailReplied: true, smsNew: false, dealClosed: true, appointmentReminder: true, weeklyReport: true });
  const [billing] = useState({ plan: 'Pro', price: '$297/mo', nextBilling: '2024-06-21', seats: 5 });

  const integrations = [
    { name: 'Stripe', description: 'Payment processing', connected: true, logo: '💳' },
    { name: 'Google Calendar', description: 'Sync appointments', connected: true, logo: '📅' },
    { name: 'Twilio', description: 'SMS & voice calls', connected: true, logo: '📱' },
    { name: 'SendGrid', description: 'Email delivery', connected: false, logo: '📧' },
    { name: 'Zapier', description: 'Automation workflows', connected: false, logo: '⚡' },
    { name: 'Facebook Ads', description: 'Lead generation', connected: false, logo: '📘' },
  ];

  const handleSave = () => addNotification('Settings saved successfully!');

  return (
    <div>
      <Header title="Settings" subtitle="Manage your account and preferences" />
      <div style={{ padding: '24px 28px', display: 'flex', gap: '24px' }}>
        <div style={{ width: '220px', flexShrink: 0 }}>
          <div style={{ backgroundColor: 'white', borderRadius: '12px', border: '1px solid #e2e8f0', overflow: 'hidden' }}>
            {tabs.map(tab => (
              <button key={tab.id} onClick={() => setActiveTab(tab.id)} style={{ width: '100%', display: 'flex', alignItems: 'center', gap: '10px', padding: '12px 16px', border: 'none', backgroundColor: activeTab === tab.id ? '#f0f4ff' : 'white', color: activeTab === tab.id ? '#6366f1' : '#374151', fontSize: '14px', fontWeight: activeTab === tab.id ? 600 : 400, cursor: 'pointer', textAlign: 'left', borderLeft: activeTab === tab.id ? '3px solid #6366f1' : '3px solid transparent', transition: 'all 0.1s', borderBottom: '1px solid #f1f5f9' }}>
                <tab.icon size={16} />
                {tab.label}
                <ChevronRight size={14} style={{ marginLeft: 'auto', opacity: 0.4 }} />
              </button>
            ))}
          </div>
        </div>

        <div style={{ flex: 1 }}>
          {activeTab === 'profile' && (
            <div style={{ backgroundColor: 'white', borderRadius: '12px', border: '1px solid #e2e8f0', padding: '24px' }}>
              <h3 style={{ fontSize: '16px', fontWeight: 700, color: '#0f172a', marginBottom: '20px' }}>Profile Information</h3>
              <div style={{ display: 'flex', gap: '20px', marginBottom: '24px', paddingBottom: '24px', borderBottom: '1px solid #f1f5f9' }}>
                <div style={{ width: '80px', height: '80px', borderRadius: '50%', background: 'linear-gradient(135deg, #6366f1, #8b5cf6)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'white', fontSize: '28px', fontWeight: 700, flexShrink: 0 }}>JD</div>
                <div>
                  <p style={{ fontSize: '15px', fontWeight: 600, color: '#0f172a', margin: '0 0 4px' }}>John Doe</p>
                  <p style={{ fontSize: '13px', color: '#94a3b8', margin: '0 0 10px' }}>Admin · CRMPro Inc.</p>
                  <button style={{ padding: '7px 14px', border: '1px solid #e2e8f0', borderRadius: '8px', fontSize: '13px', cursor: 'pointer', backgroundColor: 'white', color: '#374151', fontWeight: 500 }}>Change Photo</button>
                </div>
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px', marginBottom: '16px' }}>
                {[
                  { label: 'First Name', key: 'firstName' }, { label: 'Last Name', key: 'lastName' },
                  { label: 'Email', key: 'email' }, { label: 'Phone', key: 'phone' },
                  { label: 'Company', key: 'company' }, { label: 'Timezone', key: 'timezone' },
                ].map(({ label, key }) => (
                  <div key={key}>
                    <label style={{ display: 'block', fontSize: '13px', fontWeight: 500, color: '#374151', marginBottom: '6px' }}>{label}</label>
                    <input
                      value={(profile as Record<string, string>)[key]}
                      onChange={e => setProfile(p => ({ ...p, [key]: e.target.value }))}
                      style={{ width: '100%', padding: '9px 12px', border: '1px solid #e2e8f0', borderRadius: '8px', fontSize: '13px', outline: 'none', boxSizing: 'border-box', color: '#374151' }}
                    />
                  </div>
                ))}
              </div>
              <button onClick={handleSave} style={{ display: 'flex', alignItems: 'center', gap: '6px', padding: '9px 18px', backgroundColor: '#6366f1', color: 'white', border: 'none', borderRadius: '8px', fontSize: '13px', fontWeight: 600, cursor: 'pointer' }}>
                <Save size={15} /> Save Changes
              </button>
            </div>
          )}

          {activeTab === 'notifications' && (
            <div style={{ backgroundColor: 'white', borderRadius: '12px', border: '1px solid #e2e8f0', padding: '24px' }}>
              <h3 style={{ fontSize: '16px', fontWeight: 700, color: '#0f172a', marginBottom: '20px' }}>Notification Preferences</h3>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0' }}>
                {[
                  { key: 'emailNew', label: 'New email received', desc: 'Get notified when a new email arrives' },
                  { key: 'emailReplied', label: 'Email replied', desc: 'When a contact replies to your email' },
                  { key: 'smsNew', label: 'New SMS', desc: 'Incoming text messages' },
                  { key: 'dealClosed', label: 'Deal closed', desc: 'When a deal is marked as won or lost' },
                  { key: 'appointmentReminder', label: 'Appointment reminders', desc: '30 minutes before scheduled appointments' },
                  { key: 'weeklyReport', label: 'Weekly report', desc: 'Performance summary every Monday' },
                ].map(({ key, label, desc }) => (
                  <div key={key} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '16px 0', borderBottom: '1px solid #f1f5f9' }}>
                    <div>
                      <p style={{ fontSize: '14px', fontWeight: 500, color: '#374151', margin: 0 }}>{label}</p>
                      <p style={{ fontSize: '12px', color: '#94a3b8', margin: '2px 0 0' }}>{desc}</p>
                    </div>
                    <Toggle value={(notifications as Record<string, boolean>)[key]} onChange={v => setNotifications(p => ({ ...p, [key]: v }))} />
                  </div>
                ))}
              </div>
              <button onClick={handleSave} style={{ display: 'flex', alignItems: 'center', gap: '6px', padding: '9px 18px', backgroundColor: '#6366f1', color: 'white', border: 'none', borderRadius: '8px', fontSize: '13px', fontWeight: 600, cursor: 'pointer', marginTop: '16px' }}>
                <Save size={15} /> Save Preferences
              </button>
            </div>
          )}

          {activeTab === 'billing' && (
            <div style={{ backgroundColor: 'white', borderRadius: '12px', border: '1px solid #e2e8f0', padding: '24px' }}>
              <h3 style={{ fontSize: '16px', fontWeight: 700, color: '#0f172a', marginBottom: '20px' }}>Billing & Subscription</h3>
              <div style={{ padding: '20px', borderRadius: '10px', background: 'linear-gradient(135deg, #6366f1, #8b5cf6)', color: 'white', marginBottom: '20px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                  <div>
                    <p style={{ fontSize: '12px', opacity: 0.8, margin: '0 0 4px' }}>Current Plan</p>
                    <p style={{ fontSize: '24px', fontWeight: 800, margin: 0 }}>{billing.plan} <span style={{ fontSize: '14px', fontWeight: 400 }}>{billing.price}</span></p>
                    <p style={{ fontSize: '12px', opacity: 0.8, margin: '8px 0 0' }}>Next billing: {billing.nextBilling} · {billing.seats} seats</p>
                  </div>
                  <button style={{ padding: '8px 16px', backgroundColor: 'rgba(255,255,255,0.2)', color: 'white', border: '1px solid rgba(255,255,255,0.3)', borderRadius: '8px', fontSize: '13px', cursor: 'pointer', fontWeight: 500 }}>Upgrade</button>
                </div>
              </div>
              {[
                { plan: 'Starter', price: '$97/mo', features: ['3 users', '1,000 contacts', 'Basic CRM', 'Email only'] },
                { plan: 'Pro', price: '$297/mo', features: ['10 users', '10,000 contacts', 'Full CRM', 'All channels'], current: true },
                { plan: 'Enterprise', price: '$697/mo', features: ['Unlimited users', 'Unlimited contacts', 'All features', 'Dedicated support'] },
              ].map(plan => (
                <div key={plan.plan} style={{ display: 'flex', alignItems: 'center', gap: '16px', padding: '16px', borderRadius: '10px', border: `2px solid ${plan.current ? '#6366f1' : '#e2e8f0'}`, marginBottom: '10px', backgroundColor: plan.current ? '#f0f4ff' : 'white' }}>
                  <div style={{ flex: 1 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '6px' }}>
                      <p style={{ fontSize: '15px', fontWeight: 700, color: '#0f172a', margin: 0 }}>{plan.plan}</p>
                      {plan.current && <span style={{ padding: '2px 8px', borderRadius: '20px', fontSize: '11px', backgroundColor: '#6366f1', color: 'white', fontWeight: 600 }}>Current</span>}
                    </div>
                    <div style={{ display: 'flex', gap: '12px', flexWrap: 'wrap' }}>
                      {plan.features.map(f => <span key={f} style={{ fontSize: '12px', color: '#64748b' }}>✓ {f}</span>)}
                    </div>
                  </div>
                  <p style={{ fontSize: '18px', fontWeight: 700, color: '#0f172a', minWidth: '100px', textAlign: 'right' }}>{plan.price}</p>
                </div>
              ))}
            </div>
          )}

          {activeTab === 'integrations' && (
            <div style={{ backgroundColor: 'white', borderRadius: '12px', border: '1px solid #e2e8f0', padding: '24px' }}>
              <h3 style={{ fontSize: '16px', fontWeight: 700, color: '#0f172a', marginBottom: '20px' }}>Integrations</h3>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                {integrations.map(intg => (
                  <div key={intg.name} style={{ display: 'flex', alignItems: 'center', gap: '14px', padding: '16px', borderRadius: '10px', border: `1px solid ${intg.connected ? '#bbf7d0' : '#e2e8f0'}`, backgroundColor: intg.connected ? '#f0fdf4' : 'white' }}>
                    <span style={{ fontSize: '28px' }}>{intg.logo}</span>
                    <div style={{ flex: 1 }}>
                      <p style={{ fontSize: '14px', fontWeight: 600, color: '#0f172a', margin: 0 }}>{intg.name}</p>
                      <p style={{ fontSize: '12px', color: '#94a3b8', margin: '2px 0 0' }}>{intg.description}</p>
                    </div>
                    <button onClick={() => addNotification(intg.connected ? `${intg.name} disconnected` : `${intg.name} connected!`, intg.connected ? 'info' : 'success')} style={{ padding: '6px 14px', borderRadius: '8px', border: `1px solid ${intg.connected ? '#d1fae5' : '#e2e8f0'}`, backgroundColor: intg.connected ? '#ecfdf5' : 'white', color: intg.connected ? '#16a34a' : '#374151', fontSize: '12px', fontWeight: 600, cursor: 'pointer' }}>
                      {intg.connected ? 'Connected' : 'Connect'}
                    </button>
                  </div>
                ))}
              </div>
            </div>
          )}

          {(activeTab === 'security' || activeTab === 'branding') && (
            <div style={{ backgroundColor: 'white', borderRadius: '12px', border: '1px solid #e2e8f0', padding: '24px' }}>
              <h3 style={{ fontSize: '16px', fontWeight: 700, color: '#0f172a', marginBottom: '8px' }}>
                {activeTab === 'security' ? 'Security Settings' : 'Branding'}
              </h3>
              <p style={{ color: '#94a3b8', fontSize: '14px', marginBottom: '20px' }}>
                {activeTab === 'security' ? 'Manage your password, 2FA, and access tokens.' : 'Customize your brand colors, logo, and domain.'}
              </p>
              <div style={{ padding: '40px', textAlign: 'center', border: '2px dashed #e2e8f0', borderRadius: '10px', color: '#94a3b8' }}>
                <div style={{ fontSize: '40px', marginBottom: '12px' }}>{activeTab === 'security' ? '🔒' : '🎨'}</div>
                <p style={{ fontWeight: 600, color: '#374151', marginBottom: '6px' }}>Coming Soon</p>
                <p style={{ fontSize: '13px' }}>This section is under development</p>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
