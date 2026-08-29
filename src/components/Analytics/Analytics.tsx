import React, { useState } from 'react';
import { BarChart3, TrendingUp, Users, DollarSign, Target } from 'lucide-react';
import {
  XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, PieChart, Pie, Cell, Legend, LineChart, Line
} from 'recharts';
import Header from '../Layout/Header';
import DeliverabilityReport from './DeliverabilityReport';
import { useApp } from '../../context/AppContext';
import {
  kpis, trend, sources, funnel, owners, campaignRows, isEmpty,
  type Period,
} from './overview';

const COLORS = ['#17191c', '#22c55e', '#f59e0b', '#ef4444', '#3b3f45'];

const cardStyle: React.CSSProperties = {
  backgroundColor: 'white',
  borderRadius: '18px',
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

export default function Analytics() {
  const [period, setPeriod] = useState<Period>('30d');
  const [section, setSection] = useState<'overview' | 'deliverability'>('overview');
  const { contacts, pipelines, campaigns } = useApp();

  /* Everything below is derived from the account's own records and recomputed
     when the period changes — the selector used to set state nothing read. */
  const tiles = kpis(contacts, pipelines, period);
  const trendData = trend(contacts, pipelines, period);
  const sourceData = sources(contacts, period);
  const funnelData = funnel(pipelines);
  const ownerRows = owners(pipelines, period);
  const campaignPerf = campaignRows(campaigns);
  const nothingYet = isEmpty(contacts, pipelines);

  return (
    <div style={{ minHeight: '100vh' }}>
      <Header title="Reports" subtitle="How every module is performing" />
      <div style={{ padding: 'clamp(14px, 3vw, 28px)' }}>
        <div style={{ display: 'flex', gap: 7, marginBottom: 18 }}>
          {([['overview', 'Overview'], ['deliverability', 'Deliverability']] as const).map(([id, label]) => (
            <button key={id} onClick={() => setSection(id)} title={label} aria-pressed={section === id}
              style={{ padding: '8px 15px', borderRadius: 999, fontSize: 12.5, fontWeight: 700, cursor: 'pointer',
                border: `1px solid ${section === id ? '#17191c' : '#e2e8f0'}`,
                background: section === id ? '#17191c' : '#fff', color: section === id ? '#fff' : '#475569' }}>
              {label}
            </button>
          ))}
        </div>

        {section === 'deliverability' && <DeliverabilityReport />}

        {section === 'overview' && <>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
          <h2 style={{ fontSize: '16px', fontWeight: 600, color: '#0f172a', letterSpacing: '-0.01em', margin: 0 }}>Overview</h2>
          <div style={{ display: 'flex', gap: '4px', padding: '4px', backgroundColor: 'white', border: '1px solid #e6e9f0', borderRadius: '10px', boxShadow: '0 1px 2px rgba(16,24,40,0.04)' }}>
            {(['7d', '30d', '90d', '12m'] as const).map(p => (
              <button key={p} onClick={() => setPeriod(p)} aria-pressed={period === p} style={{ padding: '6px 14px', borderRadius: '7px', border: 'none', backgroundColor: period === p ? '#eceef1' : 'transparent', color: period === p ? '#17191c' : '#94a3b8', fontSize: '13px', cursor: 'pointer', fontWeight: 600, transition: 'all 0.12s' }}>
                {p}
              </button>
            ))}
          </div>
        </div>

        {nothingYet && (
          <div style={{ ...cardStyle, marginBottom: '20px', display: 'flex', gap: 12, alignItems: 'flex-start' }}>
            <BarChart3 size={18} color="#94a3b8" style={{ marginTop: 2, flexShrink: 0 }} />
            <div>
              <p style={{ fontSize: 14, fontWeight: 700, color: '#0f172a', margin: '0 0 4px' }}>Nothing to report on yet</p>
              <p style={{ fontSize: 12.5, color: '#64748b', margin: 0, lineHeight: 1.6 }}>
                These figures come from your own contacts, deals and campaigns. Add a contact or open a deal and they
                will start filling in.
              </p>
            </div>
          </div>
        )}

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(190px, 100%), 1fr))', gap: '16px', marginBottom: '24px' }}>
          {tiles.map((item, i) => {
            const Icon = [DollarSign, Users, Target, TrendingUp][i];
            const color = ['#16a34a', '#17191c', '#3b82f6', '#f59e0b'][i];
            return (
            <div key={item.label} style={{ ...cardStyle, padding: '20px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '14px' }}>
                <div style={{ width: '38px', height: '38px', borderRadius: '10px', backgroundColor: `${color}14`, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                  <Icon size={18} color={color} />
                </div>
                <p style={{ fontSize: '12px', color: '#94a3b8', fontWeight: 500, margin: 0 }}>{item.label}</p>
              </div>
              <p style={{ fontSize: '26px', fontWeight: 700, color: '#0f172a', letterSpacing: '-0.02em', margin: '0 0 8px' }}>{item.value}</p>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
                {/* No invented delta: when there is no earlier window to compare
                    against, the tile says so rather than showing a cheerful
                    green "+23%" derived from nothing. */}
                {item.change !== null ? (
                  <span style={{ display: 'inline-flex', alignItems: 'center', gap: '3px', fontSize: '11px', fontWeight: 600, color: item.change >= 0 ? '#16a34a' : '#dc2626', backgroundColor: item.change >= 0 ? '#16a34a14' : '#dc262614', padding: '3px 9px', borderRadius: '999px' }}>
                    {item.change >= 0 ? '▲' : '▼'} {Math.abs(item.change)}%
                  </span>
                ) : (
                  <span style={{ fontSize: '11px', color: '#94a3b8' }}>no earlier period to compare</span>
                )}
                <span style={{ fontSize: '11px', color: '#94a3b8' }}>{item.hint}</span>
              </div>
            </div>
            );
          })}
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(280px, 100%), 1fr))', gap: '16px', marginBottom: '16px' }}>
          <div style={cardStyle}>
            <h3 style={{ fontSize: '15px', fontWeight: 600, color: '#0f172a', letterSpacing: '-0.01em', marginTop: 0, marginBottom: '16px' }}>Revenue &amp; Leads Trend</h3>
            <ResponsiveContainer width="100%" height={220}>
              <LineChart data={trendData}>
                <CartesianGrid vertical={false} stroke="#f1f5f9" />
                <XAxis dataKey="label" tick={{ fontSize: 11, fill: '#94a3b8' }} axisLine={false} tickLine={false} />
                <YAxis yAxisId="left" tick={{ fontSize: 11, fill: '#94a3b8' }} axisLine={false} tickLine={false} tickFormatter={v => `$${v / 1000}k`} />
                <YAxis yAxisId="right" orientation="right" tick={{ fontSize: 11, fill: '#94a3b8' }} axisLine={false} tickLine={false} />
                <Tooltip contentStyle={tooltipStyle} cursor={{ stroke: '#e6e9f0', strokeWidth: 1 }} />
                <Line yAxisId="left" type="monotone" dataKey="revenue" stroke="#17191c" strokeWidth={2.5} dot={false} activeDot={{ r: 4, fill: '#17191c', stroke: '#fff', strokeWidth: 2 }} name="Revenue" />
                <Line yAxisId="right" type="monotone" dataKey="leads" stroke="#22c55e" strokeWidth={2.5} dot={false} activeDot={{ r: 4, fill: '#22c55e', stroke: '#fff', strokeWidth: 2 }} name="Leads" />
                <Legend iconType="circle" iconSize={8} wrapperStyle={{ fontSize: '12px', color: '#475569' }} />
              </LineChart>
            </ResponsiveContainer>
          </div>

          <div style={cardStyle}>
            {/* Where contacts said they came from, not invented traffic
                shares — this app never measured website traffic. */}
            <h3 style={{ fontSize: '15px', fontWeight: 600, color: '#0f172a', letterSpacing: '-0.01em', marginTop: 0, marginBottom: '16px' }}>Where contacts came from</h3>
            {sourceData.length === 0 ? (
              <p style={{ fontSize: 12.5, color: '#94a3b8', margin: 0, lineHeight: 1.6 }}>No contacts were added in this period.</p>
            ) : (<>
            <ResponsiveContainer width="100%" height={160}>
              <PieChart>
                <Pie data={sourceData} cx="50%" cy="50%" outerRadius={70} paddingAngle={3} dataKey="value">
                  {sourceData.map((_, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} stroke="#ffffff" strokeWidth={2} />)}
                </Pie>
                <Tooltip formatter={(v, _n, e) => [`${v}% (${(e?.payload as { count?: number })?.count ?? 0})`, 'Share']} contentStyle={tooltipStyle} />
              </PieChart>
            </ResponsiveContainer>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', marginTop: '8px' }}>
              {sourceData.map((item, i) => (
                <div key={item.name} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <div style={{ width: '8px', height: '8px', borderRadius: '3px', backgroundColor: COLORS[i % COLORS.length] }} />
                    <span style={{ fontSize: '12px', color: '#475569' }}>{item.name}</span>
                  </div>
                  <span style={{ fontSize: '12px', fontWeight: 600, color: '#0f172a' }}>{item.count} · {item.value}%</span>
                </div>
              ))}
            </div>
            </>)}
          </div>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(280px, 100%), 1fr))', gap: '16px' }}>
          <div style={cardStyle}>
            <h3 style={{ fontSize: '15px', fontWeight: 600, color: '#0f172a', letterSpacing: '-0.01em', marginTop: 0, marginBottom: '16px' }}>Deals by stage</h3>
            {funnelData.length === 0 ? (
              <p style={{ fontSize: 12.5, color: '#94a3b8', margin: 0, lineHeight: 1.6 }}>No pipeline yet. Create one in Sales &rarr; Pipelines.</p>
            ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
              {funnelData.map((item, i) => {
                const top = funnelData[0].count || 0;
                const pct = top > 0 ? (item.count / top * 100).toFixed(1) : '0.0';
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
                      <div style={{ height: '100%', width: `${pct}%`, backgroundColor: COLORS[i % COLORS.length], borderRadius: '999px', transition: 'width 0.5s' }} />
                    </div>
                  </div>
                );
              })}
            </div>
            )}
          </div>

          <div style={cardStyle}>
            {/* Real owners from `assignedTo` on real deals. This was four
                invented reps — John Smith, Jane Doe, Mike Chen, Sarah Lee —
                shown to every account regardless of who actually works there. */}
            <h3 style={{ fontSize: '15px', fontWeight: 600, color: '#0f172a', letterSpacing: '-0.01em', marginTop: 0, marginBottom: '16px' }}>Deal owners</h3>
            {ownerRows.length === 0 ? (
              <p style={{ fontSize: 12.5, color: '#94a3b8', margin: 0, lineHeight: 1.6 }}>
                No deals in this period carry an owner. Set &ldquo;Assigned to&rdquo; on a deal and it will show up here.
              </p>
            ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
              {ownerRows.map((member, i) => (
                <div key={member.name} style={{ display: 'flex', alignItems: 'center', gap: '12px', padding: '12px 14px', borderRadius: '10px', backgroundColor: '#f8fafc', border: '1px solid #f1f5f9' }}>
                  <div style={{ width: '34px', height: '34px', borderRadius: '10px', backgroundColor: `${COLORS[i % COLORS.length]}14`, color: COLORS[i % COLORS.length], display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '12px', fontWeight: 700, flexShrink: 0 }}>
                    {member.name.split(/\s+/).filter(Boolean).slice(0, 2).map(n => n[0]).join('').toUpperCase()}
                  </div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <p style={{ fontSize: '13px', fontWeight: 600, color: '#0f172a', margin: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{member.name}</p>
                    <p style={{ fontSize: '11px', color: '#94a3b8', margin: '2px 0 0' }}>{member.deals} deal{member.deals === 1 ? '' : 's'} · {member.won} won</p>
                  </div>
                  <div style={{ textAlign: 'right', flexShrink: 0 }}>
                    <p style={{ fontSize: '14px', fontWeight: 700, color: '#0f172a', letterSpacing: '-0.01em', margin: 0 }}>${member.revenue.toLocaleString()}</p>
                    <p style={{ fontSize: '11px', color: '#16a34a', fontWeight: 600, margin: '2px 0 0' }}>won</p>
                  </div>
                </div>
              ))}
            </div>
            )}
          </div>
        </div>

        {campaignPerf.length > 0 && (
          <div style={{ ...cardStyle, marginTop: '16px' }}>
            <h3 style={{ fontSize: '15px', fontWeight: 600, color: '#0f172a', letterSpacing: '-0.01em', marginTop: 0, marginBottom: '16px' }}>Campaign performance</h3>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
              {campaignPerf.map(c => (
                <div key={c.name} style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap', padding: '10px 14px', borderRadius: 10, backgroundColor: '#f8fafc', border: '1px solid #f1f5f9' }}>
                  <span style={{ flex: '1 1 160px', minWidth: 0, fontSize: 13, fontWeight: 600, color: '#0f172a', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{c.name}</span>
                  <span style={{ fontSize: 12, color: '#475569' }}>{c.sent.toLocaleString()} sent</span>
                  <span style={{ fontSize: 12, color: '#475569' }}>{c.sent ? Math.round((c.opened / c.sent) * 100) : 0}% opened</span>
                  <span style={{ fontSize: 12, color: '#475569' }}>{c.sent ? Math.round((c.clicked / c.sent) * 100) : 0}% clicked</span>
                </div>
              ))}
            </div>
          </div>
        )}
        </>}
      </div>
    </div>
  );
}
