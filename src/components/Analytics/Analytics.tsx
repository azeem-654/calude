import React, { useState } from 'react';
import { BarChart3, TrendingUp, Users, DollarSign, Target } from 'lucide-react';
import {
  AreaChart, Area, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, PieChart, Pie, Cell, Legend, LineChart, Line
} from 'recharts';
import Header from '../Layout/Header';
import { revenueData, channelData } from '../../data/mockData';

const COLORS = ['#6366f1', '#22c55e', '#f59e0b', '#ef4444', '#8b5cf6'];

const conversionData = [
  { stage: 'Visitors', count: 12400 }, { stage: 'Leads', count: 3200 },
  { stage: 'Prospects', count: 890 }, { stage: 'Opportunities', count: 340 },
  { stage: 'Customers', count: 128 },
];

const teamData = [
  { name: 'John Smith', deals: 12, revenue: 48000, calls: 45 },
  { name: 'Jane Doe', deals: 9, revenue: 36000, calls: 38 },
  { name: 'Mike Chen', deals: 7, revenue: 28000, calls: 29 },
  { name: 'Sarah Lee', deals: 11, revenue: 44000, calls: 52 },
];

export default function Analytics() {
  const [period, setPeriod] = useState('12m');

  return (
    <div>
      <Header title="Analytics" subtitle="Insights and performance metrics" />
      <div style={{ padding: '24px 28px' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
          <h2 style={{ fontSize: '16px', fontWeight: 600, color: '#0f172a' }}>Overview</h2>
          <div style={{ display: 'flex', gap: '6px' }}>
            {['7d', '30d', '90d', '12m'].map(p => (
              <button key={p} onClick={() => setPeriod(p)} style={{ padding: '6px 14px', borderRadius: '8px', border: `1px solid ${period === p ? '#6366f1' : '#e2e8f0'}`, backgroundColor: period === p ? '#6366f1' : 'white', color: period === p ? 'white' : '#64748b', fontSize: '13px', cursor: 'pointer', fontWeight: 500 }}>
                {p}
              </button>
            ))}
          </div>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '16px', marginBottom: '24px' }}>
          {[
            { label: 'Total Revenue', value: '$895K', change: '+23%', icon: DollarSign, color: '#22c55e' },
            { label: 'New Contacts', value: '2,847', change: '+18%', icon: Users, color: '#6366f1' },
            { label: 'Conversion Rate', value: '4.2%', change: '+0.8%', icon: Target, color: '#3b82f6' },
            { label: 'Avg Deal Size', value: '$7,300', change: '+12%', icon: TrendingUp, color: '#f59e0b' },
          ].map(item => (
            <div key={item.label} style={{ backgroundColor: 'white', borderRadius: '12px', padding: '18px 20px', border: '1px solid #e2e8f0' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                <div>
                  <p style={{ fontSize: '12px', color: '#64748b', fontWeight: 500, margin: '0 0 6px' }}>{item.label}</p>
                  <p style={{ fontSize: '24px', fontWeight: 700, color: '#0f172a', margin: 0 }}>{item.value}</p>
                  <span style={{ fontSize: '12px', color: '#22c55e', fontWeight: 600 }}>{item.change} vs last period</span>
                </div>
                <div style={{ width: '40px', height: '40px', borderRadius: '10px', backgroundColor: `${item.color}15`, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  <item.icon size={20} color={item.color} />
                </div>
              </div>
            </div>
          ))}
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: '20px', marginBottom: '20px' }}>
          <div style={{ backgroundColor: 'white', borderRadius: '12px', padding: '20px 24px', border: '1px solid #e2e8f0' }}>
            <h3 style={{ fontSize: '15px', fontWeight: 600, color: '#0f172a', marginBottom: '16px' }}>Revenue & Leads Trend</h3>
            <ResponsiveContainer width="100%" height={220}>
              <LineChart data={revenueData}>
                <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                <XAxis dataKey="month" tick={{ fontSize: 11, fill: '#94a3b8' }} axisLine={false} tickLine={false} />
                <YAxis yAxisId="left" tick={{ fontSize: 11, fill: '#94a3b8' }} axisLine={false} tickLine={false} tickFormatter={v => `$${v / 1000}k`} />
                <YAxis yAxisId="right" orientation="right" tick={{ fontSize: 11, fill: '#94a3b8' }} axisLine={false} tickLine={false} />
                <Tooltip contentStyle={{ borderRadius: '8px', border: '1px solid #e2e8f0', fontSize: '12px' }} />
                <Line yAxisId="left" type="monotone" dataKey="revenue" stroke="#6366f1" strokeWidth={2} dot={false} name="Revenue" />
                <Line yAxisId="right" type="monotone" dataKey="leads" stroke="#22c55e" strokeWidth={2} dot={false} name="Leads" />
                <Legend />
              </LineChart>
            </ResponsiveContainer>
          </div>

          <div style={{ backgroundColor: 'white', borderRadius: '12px', padding: '20px 24px', border: '1px solid #e2e8f0' }}>
            <h3 style={{ fontSize: '15px', fontWeight: 600, color: '#0f172a', marginBottom: '16px' }}>Traffic Sources</h3>
            <ResponsiveContainer width="100%" height={160}>
              <PieChart>
                <Pie data={channelData} cx="50%" cy="50%" outerRadius={70} paddingAngle={3} dataKey="value">
                  {channelData.map((_, i) => <Cell key={i} fill={COLORS[i]} />)}
                </Pie>
                <Tooltip formatter={(v) => [`${v}%`, 'Share']} />
              </PieChart>
            </ResponsiveContainer>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
              {channelData.map((item, i) => (
                <div key={item.name} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <div style={{ width: '8px', height: '8px', borderRadius: '2px', backgroundColor: COLORS[i] }} />
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
            <h3 style={{ fontSize: '15px', fontWeight: 600, color: '#0f172a', marginBottom: '16px' }}>Conversion Funnel</h3>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
              {conversionData.map((item, i) => {
                const pct = (item.count / conversionData[0].count * 100).toFixed(1);
                return (
                  <div key={item.stage}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '4px' }}>
                      <span style={{ fontSize: '13px', color: '#374151', fontWeight: 500 }}>{item.stage}</span>
                      <div>
                        <span style={{ fontSize: '13px', fontWeight: 700, color: '#0f172a' }}>{item.count.toLocaleString()}</span>
                        <span style={{ fontSize: '12px', color: '#94a3b8', marginLeft: '6px' }}>({pct}%)</span>
                      </div>
                    </div>
                    <div style={{ height: '8px', backgroundColor: '#e2e8f0', borderRadius: '4px' }}>
                      <div style={{ height: '100%', width: `${pct}%`, backgroundColor: COLORS[i], borderRadius: '4px', transition: 'width 0.5s' }} />
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          <div style={{ backgroundColor: 'white', borderRadius: '12px', padding: '20px 24px', border: '1px solid #e2e8f0' }}>
            <h3 style={{ fontSize: '15px', fontWeight: 600, color: '#0f172a', marginBottom: '16px' }}>Team Performance</h3>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
              {teamData.map((member, i) => (
                <div key={member.name} style={{ display: 'flex', alignItems: 'center', gap: '12px', padding: '10px', borderRadius: '8px', backgroundColor: '#f8fafc' }}>
                  <div style={{ width: '32px', height: '32px', borderRadius: '50%', background: `linear-gradient(135deg, ${COLORS[i]}, ${COLORS[(i + 1) % COLORS.length]})`, display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'white', fontSize: '12px', fontWeight: 700, flexShrink: 0 }}>
                    {member.name.split(' ').map(n => n[0]).join('')}
                  </div>
                  <div style={{ flex: 1 }}>
                    <p style={{ fontSize: '13px', fontWeight: 600, color: '#374151', margin: 0 }}>{member.name}</p>
                    <p style={{ fontSize: '11px', color: '#94a3b8', margin: '2px 0 0' }}>{member.calls} calls · {member.deals} deals</p>
                  </div>
                  <div style={{ textAlign: 'right' }}>
                    <p style={{ fontSize: '14px', fontWeight: 700, color: '#22c55e', margin: 0 }}>${member.revenue.toLocaleString()}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
