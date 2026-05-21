import React from 'react';
import { Users, TrendingUp, Calendar, DollarSign, MessageSquare, Target, ArrowUpRight, ArrowDownRight } from 'lucide-react';
import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, PieChart, Pie, Cell, Legend } from 'recharts';
import Header from '../Layout/Header';
import { useApp } from '../../context/AppContext';
import { revenueData, channelData } from '../../data/mockData';

const COLORS = ['#6366f1', '#22c55e', '#f59e0b', '#ef4444', '#8b5cf6'];

function StatCard({ title, value, change, icon: Icon, color, prefix = '' }: {
  title: string; value: string | number; change: number; icon: React.ElementType; color: string; prefix?: string;
}) {
  const positive = change >= 0;
  return (
    <div style={{ backgroundColor: 'white', borderRadius: '12px', padding: '20px 24px', border: '1px solid #e2e8f0', boxShadow: '0 1px 3px rgba(0,0,0,0.05)' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
        <div>
          <p style={{ fontSize: '13px', color: '#64748b', fontWeight: 500, marginBottom: '6px' }}>{title}</p>
          <p style={{ fontSize: '28px', fontWeight: 700, color: '#0f172a' }}>{prefix}{value}</p>
          <div style={{ display: 'flex', alignItems: 'center', gap: '4px', marginTop: '6px' }}>
            {positive ? <ArrowUpRight size={14} color="#22c55e" /> : <ArrowDownRight size={14} color="#ef4444" />}
            <span style={{ fontSize: '12px', color: positive ? '#22c55e' : '#ef4444', fontWeight: 600 }}>{Math.abs(change)}%</span>
            <span style={{ fontSize: '12px', color: '#94a3b8' }}>vs last month</span>
          </div>
        </div>
        <div style={{ width: '44px', height: '44px', borderRadius: '10px', backgroundColor: `${color}15`, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <Icon size={22} color={color} />
        </div>
      </div>
    </div>
  );
}

export default function Dashboard() {
  const { contacts, appointments, conversations, pipelines } = useApp();
  const totalDeals = pipelines[0]?.stages.reduce((sum, s) => sum + s.deals.reduce((v, d) => v + d.value, 0), 0) || 0;
  const openDeals = pipelines[0]?.stages.slice(0, -1).reduce((sum, s) => sum + s.deals.length, 0) || 0;

  return (
    <div>
      <Header title="Dashboard" subtitle="Welcome back, John! Here's what's happening." />
      <div style={{ padding: '24px 28px' }}>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '16px', marginBottom: '24px' }}>
          <StatCard title="Total Contacts" value={contacts.length} change={12} icon={Users} color="#6366f1" />
          <StatCard title="Open Deals" value={openDeals} change={8} icon={TrendingUp} color="#f59e0b" />
          <StatCard title="Pipeline Value" value={`${(totalDeals / 1000).toFixed(0)}k`} change={23} icon={DollarSign} color="#22c55e" prefix="$" />
          <StatCard title="Appointments" value={appointments.filter(a => a.status === 'scheduled').length} change={-5} icon={Calendar} color="#3b82f6" />
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: '20px', marginBottom: '24px' }}>
          <div style={{ backgroundColor: 'white', borderRadius: '12px', padding: '20px 24px', border: '1px solid #e2e8f0' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
              <h3 style={{ fontSize: '16px', fontWeight: 600, color: '#0f172a' }}>Revenue Overview</h3>
              <select style={{ fontSize: '12px', border: '1px solid #e2e8f0', borderRadius: '6px', padding: '4px 8px', color: '#64748b', outline: 'none' }}>
                <option>Last 12 months</option>
                <option>Last 6 months</option>
              </select>
            </div>
            <ResponsiveContainer width="100%" height={220}>
              <AreaChart data={revenueData}>
                <defs>
                  <linearGradient id="colorRevenue" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#6366f1" stopOpacity={0.3} />
                    <stop offset="95%" stopColor="#6366f1" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                <XAxis dataKey="month" tick={{ fontSize: 12, fill: '#94a3b8' }} axisLine={false} tickLine={false} />
                <YAxis tick={{ fontSize: 12, fill: '#94a3b8' }} axisLine={false} tickLine={false} tickFormatter={v => `$${v / 1000}k`} />
                <Tooltip formatter={(v) => [`$${Number(v).toLocaleString()}`, 'Revenue']} contentStyle={{ borderRadius: '8px', border: '1px solid #e2e8f0' }} />
                <Area type="monotone" dataKey="revenue" stroke="#6366f1" strokeWidth={2} fill="url(#colorRevenue)" />
              </AreaChart>
            </ResponsiveContainer>
          </div>

          <div style={{ backgroundColor: 'white', borderRadius: '12px', padding: '20px 24px', border: '1px solid #e2e8f0' }}>
            <h3 style={{ fontSize: '16px', fontWeight: 600, color: '#0f172a', marginBottom: '16px' }}>Lead Sources</h3>
            <ResponsiveContainer width="100%" height={180}>
              <PieChart>
                <Pie data={channelData} cx="50%" cy="50%" innerRadius={50} outerRadius={80} paddingAngle={3} dataKey="value">
                  {channelData.map((_, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
                </Pie>
                <Tooltip formatter={(v) => [`${v}%`, 'Share']} />
              </PieChart>
            </ResponsiveContainer>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
              {channelData.map((item, i) => (
                <div key={item.name} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <div style={{ width: '10px', height: '10px', borderRadius: '50%', backgroundColor: COLORS[i] }} />
                    <span style={{ fontSize: '12px', color: '#64748b' }}>{item.name}</span>
                  </div>
                  <span style={{ fontSize: '12px', fontWeight: 600, color: '#374151' }}>{item.value}%</span>
                </div>
              ))}
            </div>
          </div>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '20px' }}>
          <div style={{ backgroundColor: 'white', borderRadius: '12px', padding: '20px 24px', border: '1px solid #e2e8f0' }}>
            <h3 style={{ fontSize: '16px', fontWeight: 600, color: '#0f172a', marginBottom: '16px' }}>Recent Activity</h3>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
              {[
                { action: 'New contact added', name: 'Emily Chen', time: '2 min ago', icon: Users, color: '#6366f1' },
                { action: 'Deal closed', name: '$15,000 - Robert Martinez', time: '1 hour ago', icon: DollarSign, color: '#22c55e' },
                { action: 'Appointment scheduled', name: 'Mike Davis - Demo', time: '2 hours ago', icon: Calendar, color: '#3b82f6' },
                { action: 'New message', name: 'Sarah Johnson via SMS', time: '3 hours ago', icon: MessageSquare, color: '#f59e0b' },
              ].map((item, i) => (
                <div key={i} style={{ display: 'flex', alignItems: 'center', gap: '12px', padding: '10px', borderRadius: '8px', backgroundColor: '#f8fafc' }}>
                  <div style={{ width: '36px', height: '36px', borderRadius: '8px', backgroundColor: `${item.color}15`, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                    <item.icon size={16} color={item.color} />
                  </div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <p style={{ fontSize: '13px', color: '#374151', fontWeight: 500, margin: 0 }}>{item.action}</p>
                    <p style={{ fontSize: '12px', color: '#94a3b8', margin: '2px 0 0' }}>{item.name}</p>
                  </div>
                  <span style={{ fontSize: '11px', color: '#94a3b8', flexShrink: 0 }}>{item.time}</span>
                </div>
              ))}
            </div>
          </div>

          <div style={{ backgroundColor: 'white', borderRadius: '12px', padding: '20px 24px', border: '1px solid #e2e8f0' }}>
            <h3 style={{ fontSize: '16px', fontWeight: 600, color: '#0f172a', marginBottom: '16px' }}>Today's Appointments</h3>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
              {appointments.filter(a => a.date === '2024-05-21').map(appt => (
                <div key={appt.id} style={{ display: 'flex', alignItems: 'center', gap: '12px', padding: '12px', borderRadius: '8px', border: '1px solid #e2e8f0' }}>
                  <div style={{ textAlign: 'center', minWidth: '50px' }}>
                    <p style={{ fontSize: '14px', fontWeight: 700, color: '#6366f1', margin: 0 }}>{appt.time.split(':')[0]}</p>
                    <p style={{ fontSize: '11px', color: '#94a3b8', margin: 0 }}>{appt.time.includes('AM') ? 'AM' : 'PM'}</p>
                  </div>
                  <div style={{ width: '1px', height: '36px', backgroundColor: '#e2e8f0' }} />
                  <div style={{ flex: 1 }}>
                    <p style={{ fontSize: '13px', fontWeight: 600, color: '#374151', margin: 0 }}>{appt.title}</p>
                    <p style={{ fontSize: '12px', color: '#94a3b8', margin: '2px 0 0' }}>{appt.contactName} · {appt.type}</p>
                  </div>
                  <span style={{
                    padding: '3px 8px', borderRadius: '20px', fontSize: '11px', fontWeight: 600,
                    backgroundColor: appt.status === 'completed' ? '#ecfdf5' : appt.status === 'cancelled' ? '#fef2f2' : '#eff6ff',
                    color: appt.status === 'completed' ? '#16a34a' : appt.status === 'cancelled' ? '#dc2626' : '#2563eb',
                  }}>
                    {appt.status}
                  </span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
