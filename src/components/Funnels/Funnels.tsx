import React, { useState } from 'react';
import { Funnel, Plus, Eye, TrendingUp, DollarSign, MousePointer, ExternalLink } from 'lucide-react';
import Header from '../Layout/Header';
import { useApp } from '../../context/AppContext';

export default function Funnels() {
  const { funnels } = useApp();
  const [activeTab, setActiveTab] = useState<'funnels' | 'websites'>('funnels');

  const totalRevenue = funnels.reduce((s, f) => s + f.revenue, 0);
  const totalVisitors = funnels.reduce((s, f) => s + f.visitors, 0);
  const totalConversions = funnels.reduce((s, f) => s + f.conversions, 0);
  const avgCvr = totalVisitors > 0 ? ((totalConversions / totalVisitors) * 100).toFixed(1) : '0';

  const funnelSteps = [
    { name: 'Landing Page', visitors: 3420, rate: 100, color: '#6366f1' },
    { name: 'Opt-in Form', visitors: 1890, rate: 55, color: '#8b5cf6' },
    { name: 'Thank You', visitors: 1540, rate: 45, color: '#3b82f6' },
    { name: 'Sales Page', visitors: 890, rate: 26, color: '#22c55e' },
    { name: 'Checkout', visitors: 287, rate: 8, color: '#f59e0b' },
  ];

  return (
    <div>
      <Header title="Funnels & Sites" subtitle="Build and manage your marketing funnels" />
      <div style={{ padding: '24px 28px' }}>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '16px', marginBottom: '24px' }}>
          {[
            { label: 'Total Revenue', value: `$${totalRevenue.toLocaleString()}`, icon: DollarSign, color: '#22c55e' },
            { label: 'Total Visitors', value: totalVisitors.toLocaleString(), icon: Eye, color: '#6366f1' },
            { label: 'Conversions', value: totalConversions, icon: MousePointer, color: '#3b82f6' },
            { label: 'Avg Conversion Rate', value: `${avgCvr}%`, icon: TrendingUp, color: '#f59e0b' },
          ].map(item => (
            <div key={item.label} style={{ backgroundColor: 'white', borderRadius: '12px', padding: '18px 20px', border: '1px solid #e2e8f0', display: 'flex', gap: '14px', alignItems: 'center' }}>
              <div style={{ width: '44px', height: '44px', borderRadius: '10px', backgroundColor: `${item.color}15`, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <item.icon size={22} color={item.color} />
              </div>
              <div>
                <p style={{ fontSize: '12px', color: '#64748b', margin: '0 0 4px', fontWeight: 500 }}>{item.label}</p>
                <p style={{ fontSize: '22px', fontWeight: 700, color: '#0f172a', margin: 0 }}>{item.value}</p>
              </div>
            </div>
          ))}
        </div>

        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
          <div style={{ display: 'flex', gap: '0', borderRadius: '10px', border: '1px solid #e2e8f0', overflow: 'hidden', backgroundColor: '#f8fafc' }}>
            {(['funnels', 'websites'] as const).map(t => (
              <button key={t} onClick={() => setActiveTab(t)} style={{ padding: '8px 20px', border: 'none', backgroundColor: activeTab === t ? '#6366f1' : 'transparent', color: activeTab === t ? 'white' : '#64748b', fontSize: '13px', fontWeight: 500, cursor: 'pointer', textTransform: 'capitalize', transition: 'all 0.15s' }}>
                {t.charAt(0).toUpperCase() + t.slice(1)}
              </button>
            ))}
          </div>
          <button style={{ display: 'flex', alignItems: 'center', gap: '6px', padding: '8px 16px', backgroundColor: '#6366f1', color: 'white', border: 'none', borderRadius: '8px', fontSize: '13px', fontWeight: 600, cursor: 'pointer' }}>
            <Plus size={15} /> New {activeTab === 'funnels' ? 'Funnel' : 'Website'}
          </button>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '20px', marginBottom: '24px' }}>
          {funnels.map(funnel => {
            const cvr = funnel.visitors > 0 ? ((funnel.conversions / funnel.visitors) * 100).toFixed(1) : '0';
            return (
              <div key={funnel.id} style={{ backgroundColor: 'white', borderRadius: '12px', border: '1px solid #e2e8f0', overflow: 'hidden' }}>
                <div style={{ padding: '20px', borderBottom: '1px solid #f1f5f9' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                    <div>
                      <h3 style={{ fontSize: '15px', fontWeight: 700, color: '#0f172a', margin: '0 0 4px' }}>{funnel.name}</h3>
                      <p style={{ fontSize: '12px', color: '#94a3b8', margin: 0 }}>{funnel.steps} steps</p>
                    </div>
                    <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                      <span style={{ padding: '3px 10px', borderRadius: '20px', fontSize: '12px', fontWeight: 600, backgroundColor: funnel.status === 'active' ? '#ecfdf5' : '#f8fafc', color: funnel.status === 'active' ? '#16a34a' : '#64748b' }}>
                        {funnel.status}
                      </span>
                      <button style={{ padding: '6px', borderRadius: '6px', border: '1px solid #e2e8f0', backgroundColor: 'white', cursor: 'pointer', display: 'flex' }}>
                        <ExternalLink size={14} color="#64748b" />
                      </button>
                    </div>
                  </div>
                </div>
                <div style={{ padding: '16px 20px', display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '12px' }}>
                  {[
                    { label: 'Visitors', value: funnel.visitors.toLocaleString(), color: '#6366f1' },
                    { label: 'Conversions', value: funnel.conversions.toLocaleString(), color: '#22c55e' },
                    { label: 'Revenue', value: `$${funnel.revenue.toLocaleString()}`, color: '#f59e0b' },
                  ].map(m => (
                    <div key={m.label} style={{ textAlign: 'center' }}>
                      <p style={{ fontSize: '18px', fontWeight: 700, color: m.color, margin: 0 }}>{m.value}</p>
                      <p style={{ fontSize: '11px', color: '#94a3b8', margin: '2px 0 0' }}>{m.label}</p>
                    </div>
                  ))}
                </div>
                <div style={{ padding: '0 20px 16px' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '12px', color: '#64748b', marginBottom: '4px' }}>
                    <span>Conversion Rate</span><span style={{ fontWeight: 700, color: '#374151' }}>{cvr}%</span>
                  </div>
                  <div style={{ height: '6px', backgroundColor: '#e2e8f0', borderRadius: '3px' }}>
                    <div style={{ height: '100%', width: `${Math.min(parseFloat(cvr) * 5, 100)}%`, background: 'linear-gradient(90deg, #6366f1, #8b5cf6)', borderRadius: '3px' }} />
                  </div>
                </div>
              </div>
            );
          })}
        </div>

        <div style={{ backgroundColor: 'white', borderRadius: '12px', border: '1px solid #e2e8f0', padding: '24px' }}>
          <h3 style={{ fontSize: '16px', fontWeight: 700, color: '#0f172a', marginBottom: '20px' }}>Funnel Visualization — Lead Magnet Funnel</h3>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
            {funnelSteps.map((step, i) => (
              <div key={step.name}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '4px' }}>
                  <span style={{ fontSize: '13px', color: '#374151', fontWeight: 500, minWidth: '130px' }}>{step.name}</span>
                  <div style={{ flex: 1, height: '36px', backgroundColor: '#f8fafc', borderRadius: '6px', overflow: 'hidden', position: 'relative' }}>
                    <div style={{ height: '100%', width: `${step.rate}%`, backgroundColor: step.color, opacity: 0.85, borderRadius: '6px', display: 'flex', alignItems: 'center', justifyContent: 'flex-end', paddingRight: '10px', transition: 'width 0.5s ease' }}>
                      <span style={{ fontSize: '13px', fontWeight: 700, color: 'white' }}>{step.visitors.toLocaleString()}</span>
                    </div>
                  </div>
                  <span style={{ fontSize: '13px', fontWeight: 600, color: '#374151', minWidth: '45px', textAlign: 'right' }}>{step.rate}%</span>
                </div>
                {i < funnelSteps.length - 1 && (
                  <div style={{ marginLeft: '142px', height: '12px', width: '2px', backgroundColor: '#e2e8f0', marginBottom: '-4px' }} />
                )}
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
