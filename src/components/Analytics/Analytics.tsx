import React, { useState } from 'react';
import { BarChart3, TrendingUp, Users, DollarSign, Target } from 'lucide-react';
import {
  AreaChart, Area, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, PieChart, Pie, Cell, Legend, LineChart, Line
} from 'recharts';
import Header from '../Layout/Header';
import { revenueData, channelData } from '../../data/mockData';

const COLORS = ['#6366f1', '#22c55e', '#f59e0b', '#ef4444', '#8b5cf6'];

const cardStyle: React.CSSProperties = {
  backgroundColor: 'white',
  borderRadius: '14px',
  border: '1px solid #e6e9f0',
  boxShadow: '0 1px 2px rgba(16,24,40,0.04)',
  padding: '20px 24px',
};

const tooltipStyle: React.CSSProperties = {
  borderRadius: '10px',
  border: '1px solid #e6e9f0',
  boxShadow: '0 6px 16px rgba(16,24,40,0.08)',
  fontSize: '12px',
  padding: '8px 12px',
};

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
    <div style={{ backgroundColor: '#f8fafc', minHeight: '100%' }}>
      <Header title="Analytics" subtitle="Insights and performance metrics" />
      <div style={{ padding: '28px' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
          <h2 style={{ fontSize: '16px', fontWeight: 600, color: '#0f172a', letterSpacing: '-0.01em', margin: 0 }}>Overview</h2>
          <div style={{ display: 'flex', gap: '4px', padding: '4px', backgroundColor: 'white', border: '1px solid #e6e9f0', borderRadius: '10px', boxShadow: '0 1px 2px rgba(16,24,40,0.04)' }}>
            {['7d', '30d', '90d', '12m'].map(p => (
              <button key={p} onClick={() => setPeriod(p)} style={{ padding: '6px 14px', borderRadius: '7px', border: 'none', backgroundColor: period === p ? '#eef2ff' : 'transparent', color: period === p ? '#6366f1' : '#94a3b8', fontSize: '13px', cursor: 'pointer', fontWeight: 600, transition: 'all 0.12s' }}>
                {p}
              </button>
            ))}
          </div>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '16px', marginBottom: '24px' }}>
          {[
            { label: 'Total Revenue', value: '$895K', change: '+23%', icon: DollarSign, color: '#16a34a' },
            { label: 'New Contacts', value: '2,847', change: '+18%', icon: Users, color: '#6366f1' },
            { label: 'Conversion Rate', value: '4.2%', change: '+0.8%', icon: Target, color: '#3b82f6' },
            { label: 'Avg Deal Size', value: '$7,300', change: '+12%', icon: TrendingUp, color: '#f59e0b' },
          ].map(item => (
            <div key={item.label} style={{ ...cardStyle, padding: '20px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '14px' }}>
                <div style={{ width: '38px', height: '38px', borderRadius: '10px', backgroundColor: `${item.color}14`, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                  <item.icon size={18} color={item.color} />
                </div>
                <p style={{ fontSize: '12px', color: '#94a3b8', fontWeight: 500, margin: 0 }}>{item.label}</p>
              </div>
              <p style={{ fontSize: '26px', fontWeight: 700, color: '#0f172a', letterSpacing: '-0.02em', margin: '0 0 8px' }}>{item.value}</p>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <span style={{ display: 'inline-flex', alignItems: 'center', gap: '3px', fontSize: '11px', fontWeight: 600, color: '#16a34a', backgroundColor: '#16a34a14', padding: '3px 9px', borderRadius: '999px' }}>
                  ▲ {item.change}
                </span>
                <span style={{ fontSize: '11px', color: '#94a3b8' }}>vs last period</span>
              </div>
            </div>
          ))}
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: '16px', marginBottom: '16px' }}>
          <div style={cardStyle}>
            <h3 style={{ fontSize: '15px', fontWeight: 600, color: '#0f172a', letterSpacing: '-0.01em', marginTop: 0, marginBottom: '16px' }}>Revenue &amp; Leads Trend</h3>
            <ResponsiveContainer width="100%" height={220}>
              <LineChart data={revenueData}>
                <CartesianGrid vertical={false} stroke="#f1f5f9" />
                <XAxis dataKey="month" tick={{ fontSize: 11, fill: '#94a3b8' }} axisLine={false} tickLine={false} />
                <YAxis yAxisId="left" tick={{ fontSize: 11, fill: '#94a3b8' }} axisLine={false} tickLine={false} tickFormatter={v => `$${v / 1000}k`} />
                <YAxis yAxisId="right" orientation="right" tick={{ fontSize: 11, fill: '#94a3b8' }} axisLine={false} tickLine={false} />
                <Tooltip contentStyle={tooltipStyle} cursor={{ stroke: '#e6e9f0', strokeWidth: 1 }} />
                <Line yAxisId="left" type="monotone" dataKey="revenue" stroke="#6366f1" strokeWidth={2.5} dot={false} activeDot={{ r: 4, fill: '#6366f1', stroke: '#fff', strokeWidth: 2 }} name="Revenue" />
                <Line yAxisId="right" type="monotone" dataKey="leads" stroke="#22c55e" strokeWidth={2.5} dot={false} activeDot={{ r: 4, fill: '#22c55e', stroke: '#fff', strokeWidth: 2 }} name="Leads" />
                <Legend iconType="circle" iconSize={8} wrapperStyle={{ fontSize: '12px', color: '#475569' }} />
              </LineChart>
            </ResponsiveContainer>
          </div>

          <div style={cardStyle}>
            <h3 style={{ fontSize: '15px', fontWeight: 600, color: '#0f172a', letterSpacing: '-0.01em', marginTop: 0, marginBottom: '16px' }}>Traffic Sources</h3>
            <ResponsiveContainer width="100%" height={160}>
              <PieChart>
                <Pie data={channelData} cx="50%" cy="50%" outerRadius={70} paddingAngle={3} dataKey="value">
                  {channelData.map((_, i) => <Cell key={i} fill={COLORS[i]} stroke="#ffffff" strokeWidth={2} />)}
                </Pie>
                <Tooltip formatter={(v) => [`${v}%`, 'Share']} contentStyle={tooltipStyle} />
              </PieChart>
            </ResponsiveContainer>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', marginTop: '8px' }}>
              {channelData.map((item, i) => (
                <div key={item.name} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <div style={{ width: '8px', height: '8px', borderRadius: '3px', backgroundColor: COLORS[i] }} />
                    <span style={{ fontSize: '12px', color: '#475569' }}>{item.name}</span>
                  </div>
                  <span style={{ fontSize: '12px', fontWeight: 600, color: '#0f172a' }}>{item.value}%</span>
                </div>
              ))}
            </div>
          </div>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
          <div style={cardStyle}>
            <h3 style={{ fontSize: '15px', fontWeight: 600, color: '#0f172a', letterSpacing: '-0.01em', marginTop: 0, marginBottom: '16px' }}>Conversion Funnel</h3>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
              {conversionData.map((item, i) => {
                const pct = (item.count / conversionData[0].count * 100).toFixed(1);
                return (
                  <div key={item.stage}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '5px' }}>
                      <span style={{ fontSize: '13px', color: '#475569', fontWeight: 500 }}>{item.stage}</span>
                      <div>
                        <span style={{ fontSize: '13px', fontWeight: 700, color: '#0f172a', letterSpacing: '-0.01em' }}>{item.count.toLocaleString()}</span>
                        <span style={{ fontSize: '12px', color: '#94a3b8', marginLeft: '6px' }}>({pct}%)</span>
                      </div>
                    </div>
                    <div style={{ height: '8px', backgroundColor: '#f1f5f9', borderRadius: '999px' }}>
                      <div style={{ height: '100%', width: `${pct}%`, backgroundColor: COLORS[i], borderRadius: '999px', transition: 'width 0.5s' }} />
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          <div style={cardStyle}>
            <h3 style={{ fontSize: '15px', fontWeight: 600, color: '#0f172a', letterSpacing: '-0.01em', marginTop: 0, marginBottom: '16px' }}>Team Performance</h3>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
              {teamData.map((member, i) => (
                <div key={member.name} style={{ display: 'flex', alignItems: 'center', gap: '12px', padding: '12px 14px', borderRadius: '10px', backgroundColor: '#f8fafc', border: '1px solid #f1f5f9' }}>
                  <div style={{ width: '34px', height: '34px', borderRadius: '10px', backgroundColor: `${COLORS[i]}14`, color: COLORS[i], display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '12px', fontWeight: 700, flexShrink: 0 }}>
                    {member.name.split(' ').map(n => n[0]).join('')}
                  </div>
                  <div style={{ flex: 1 }}>
                    <p style={{ fontSize: '13px', fontWeight: 600, color: '#0f172a', margin: 0 }}>{member.name}</p>
                    <p style={{ fontSize: '11px', color: '#94a3b8', margin: '2px 0 0' }}>{member.calls} calls · {member.deals} deals</p>
                  </div>
                  <div style={{ textAlign: 'right' }}>
                    <p style={{ fontSize: '14px', fontWeight: 700, color: '#0f172a', letterSpacing: '-0.01em', margin: 0 }}>${member.revenue.toLocaleString()}</p>
                    <p style={{ fontSize: '11px', color: '#16a34a', fontWeight: 600, margin: '2px 0 0' }}>revenue</p>
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
