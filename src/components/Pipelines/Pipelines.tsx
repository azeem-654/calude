import React, { useState } from 'react';
import { TrendingUp, Plus, DollarSign, ChevronRight, User } from 'lucide-react';
import Header from '../Layout/Header';
import { useApp } from '../../context/AppContext';

const stageColors: Record<string, { bg: string; color: string; border: string }> = {
  'New Lead': { bg: '#eff6ff', color: '#2563eb', border: '#bfdbfe' },
  'Qualified': { bg: '#fef3c7', color: '#d97706', border: '#fde68a' },
  'Proposal Sent': { bg: '#f0fdf4', color: '#16a34a', border: '#bbf7d0' },
  'Negotiation': { bg: '#fef2f2', color: '#dc2626', border: '#fecaca' },
  'Closed Won': { bg: '#ecfdf5', color: '#16a34a', border: '#a7f3d0' },
};

export default function Pipelines() {
  const { pipelines } = useApp();
  const [selected, setSelected] = useState(pipelines[0]);
  const [view, setView] = useState<'kanban' | 'list'>('kanban');

  const totalValue = selected?.stages.reduce((sum, s) => sum + s.deals.reduce((v, d) => v + d.value, 0), 0) || 0;
  const wonValue = selected?.stages.find(s => s.name === 'Closed Won')?.deals.reduce((v, d) => v + d.value, 0) || 0;
  const totalDeals = selected?.stages.reduce((sum, s) => sum + s.deals.length, 0) || 0;

  return (
    <div>
      <Header title="Pipelines" subtitle="Track your sales opportunities" />
      <div style={{ padding: '24px 28px' }}>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '16px', marginBottom: '24px' }}>
          {[
            { label: 'Total Pipeline Value', value: `$${totalValue.toLocaleString()}`, sub: 'All stages combined', color: '#6366f1' },
            { label: 'Won This Month', value: `$${wonValue.toLocaleString()}`, sub: 'Closed deals', color: '#22c55e' },
            { label: 'Total Deals', value: totalDeals, sub: 'Across all stages', color: '#3b82f6' },
            { label: 'Win Rate', value: '67%', sub: 'Last 30 days', color: '#f59e0b' },
          ].map(item => (
            <div key={item.label} style={{ backgroundColor: 'white', borderRadius: '12px', padding: '18px 20px', border: '1px solid #e2e8f0' }}>
              <p style={{ fontSize: '12px', color: '#64748b', fontWeight: 500, marginBottom: '6px' }}>{item.label}</p>
              <p style={{ fontSize: '24px', fontWeight: 700, color: '#0f172a', margin: 0 }}>{item.value}</p>
              <p style={{ fontSize: '12px', color: '#94a3b8', marginTop: '4px' }}>{item.sub}</p>
            </div>
          ))}
        </div>

        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
          <div style={{ display: 'flex', gap: '8px' }}>
            {(['kanban', 'list'] as const).map(v => (
              <button key={v} onClick={() => setView(v)} style={{ padding: '7px 14px', borderRadius: '8px', border: `1px solid ${view === v ? '#6366f1' : '#e2e8f0'}`, backgroundColor: view === v ? '#6366f1' : 'white', color: view === v ? 'white' : '#64748b', fontSize: '13px', cursor: 'pointer', textTransform: 'capitalize', fontWeight: 500 }}>
                {v}
              </button>
            ))}
          </div>
          <button style={{ display: 'flex', alignItems: 'center', gap: '6px', padding: '8px 16px', backgroundColor: '#6366f1', color: 'white', border: 'none', borderRadius: '8px', fontSize: '13px', fontWeight: 600, cursor: 'pointer' }}>
            <Plus size={15} /> Add Deal
          </button>
        </div>

        {view === 'kanban' ? (
          <div style={{ display: 'flex', gap: '16px', overflowX: 'auto', paddingBottom: '16px' }}>
            {selected?.stages.map(stage => {
              const sc = stageColors[stage.name] || { bg: '#f8fafc', color: '#64748b', border: '#e2e8f0' };
              const stageValue = stage.deals.reduce((v, d) => v + d.value, 0);
              return (
                <div key={stage.id} style={{ minWidth: '240px', maxWidth: '260px', flex: '0 0 240px' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '10px' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                      <div style={{ width: '10px', height: '10px', borderRadius: '50%', backgroundColor: stage.color }} />
                      <span style={{ fontSize: '13px', fontWeight: 600, color: '#374151' }}>{stage.name}</span>
                      <span style={{ fontSize: '12px', color: '#94a3b8', fontWeight: 500 }}>({stage.deals.length})</span>
                    </div>
                    <span style={{ fontSize: '12px', fontWeight: 600, color: '#374151' }}>${stageValue.toLocaleString()}</span>
                  </div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                    {stage.deals.map(deal => (
                      <div key={deal.id} style={{ backgroundColor: 'white', borderRadius: '10px', padding: '14px', border: '1px solid #e2e8f0', boxShadow: '0 1px 3px rgba(0,0,0,0.05)', cursor: 'pointer', transition: 'all 0.1s' }}
                        onMouseEnter={e => { e.currentTarget.style.boxShadow = '0 4px 12px rgba(0,0,0,0.1)'; e.currentTarget.style.transform = 'translateY(-1px)'; }}
                        onMouseLeave={e => { e.currentTarget.style.boxShadow = '0 1px 3px rgba(0,0,0,0.05)'; e.currentTarget.style.transform = 'none'; }}>
                        <p style={{ fontSize: '13px', fontWeight: 600, color: '#0f172a', margin: '0 0 8px' }}>{deal.title}</p>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '8px' }}>
                          <User size={12} color="#94a3b8" />
                          <span style={{ fontSize: '12px', color: '#64748b' }}>{deal.contactName}</span>
                        </div>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                          <span style={{ fontSize: '15px', fontWeight: 700, color: '#0f172a' }}>${deal.value.toLocaleString()}</span>
                          <span style={{ fontSize: '11px', padding: '2px 8px', borderRadius: '20px', backgroundColor: sc.bg, color: sc.color, fontWeight: 600, border: `1px solid ${sc.border}` }}>
                            {deal.probability}%
                          </span>
                        </div>
                        <div style={{ marginTop: '10px' }}>
                          <div style={{ height: '4px', backgroundColor: '#e2e8f0', borderRadius: '2px' }}>
                            <div style={{ height: '100%', width: `${deal.probability}%`, backgroundColor: stage.color, borderRadius: '2px', transition: 'width 0.3s' }} />
                          </div>
                          <p style={{ fontSize: '11px', color: '#94a3b8', marginTop: '4px', margin: '4px 0 0' }}>Close: {deal.expectedClose}</p>
                        </div>
                      </div>
                    ))}
                    <button style={{ width: '100%', padding: '10px', border: '2px dashed #e2e8f0', borderRadius: '10px', backgroundColor: 'transparent', color: '#94a3b8', fontSize: '13px', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px' }}>
                      <Plus size={14} /> Add Deal
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        ) : (
          <div style={{ backgroundColor: 'white', borderRadius: '12px', border: '1px solid #e2e8f0', overflow: 'hidden' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead>
                <tr style={{ backgroundColor: '#f8fafc', borderBottom: '1px solid #e2e8f0' }}>
                  {['Deal', 'Contact', 'Stage', 'Value', 'Probability', 'Close Date', 'Assigned To'].map(h => (
                    <th key={h} style={{ padding: '12px 16px', textAlign: 'left', fontSize: '12px', fontWeight: 600, color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.3px' }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {selected?.stages.flatMap(s => s.deals).map((deal, i, arr) => {
                  const sc = stageColors[deal.stage] || { bg: '#f8fafc', color: '#64748b', border: '#e2e8f0' };
                  return (
                    <tr key={deal.id} style={{ borderBottom: i < arr.length - 1 ? '1px solid #f1f5f9' : 'none' }}>
                      <td style={{ padding: '14px 16px', fontSize: '14px', fontWeight: 600, color: '#0f172a' }}>{deal.title}</td>
                      <td style={{ padding: '14px 16px', fontSize: '13px', color: '#374151' }}>{deal.contactName}</td>
                      <td style={{ padding: '14px 16px' }}>
                        <span style={{ padding: '3px 10px', borderRadius: '20px', fontSize: '12px', fontWeight: 600, backgroundColor: sc.bg, color: sc.color }}>{deal.stage}</span>
                      </td>
                      <td style={{ padding: '14px 16px', fontSize: '14px', fontWeight: 700, color: '#0f172a' }}>${deal.value.toLocaleString()}</td>
                      <td style={{ padding: '14px 16px' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                          <div style={{ flex: 1, height: '6px', backgroundColor: '#e2e8f0', borderRadius: '3px' }}>
                            <div style={{ height: '100%', width: `${deal.probability}%`, backgroundColor: '#6366f1', borderRadius: '3px' }} />
                          </div>
                          <span style={{ fontSize: '12px', fontWeight: 600, color: '#374151', minWidth: '30px' }}>{deal.probability}%</span>
                        </div>
                      </td>
                      <td style={{ padding: '14px 16px', fontSize: '13px', color: '#64748b' }}>{deal.expectedClose}</td>
                      <td style={{ padding: '14px 16px', fontSize: '13px', color: '#374151' }}>{deal.assignedTo}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
