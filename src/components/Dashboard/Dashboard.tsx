import { useState } from 'react';
import type { ElementType } from 'react';
import {
  Users, TrendingUp, Calendar, DollarSign, MessageSquare, Target,
  ArrowUpRight, ArrowDownRight, Mail, Funnel, Globe, Star, BarChart3,
  CalendarCheck, CheckCircle, Clock, Send, Eye, MousePointer, ThumbsUp,
  Zap, ChevronRight, Activity,
} from 'lucide-react';
import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, PieChart, Pie, Cell, BarChart, Bar } from 'recharts';
import Header from '../Layout/Header';
import { useApp } from '../../context/AppContext';
import { revenueData, channelData } from '../../data/mockData';
import { useNavigate } from 'react-router-dom';

const COLORS = ['#6366f1', '#22c55e', '#f59e0b', '#ef4444', '#8b5cf6'];

/* ── KPI top card ── */
function KpiCard({ title, value, change, icon: Icon, color, prefix = '', suffix = '' }: {
  title: string; value: string | number; change: number;
  icon: ElementType; color: string; prefix?: string; suffix?: string;
}) {
  const up = change >= 0;
  return (
    <div style={{ backgroundColor: 'white', borderRadius: '14px', padding: '20px 22px', border: '1px solid #e2e8f0', boxShadow: '0 1px 4px rgba(0,0,0,0.04)', position: 'relative', overflow: 'hidden' }}>
      <div style={{ position: 'absolute', top: 0, right: 0, width: '80px', height: '80px', borderRadius: '0 14px 0 80px', backgroundColor: `${color}08` }} />
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '12px' }}>
        <div style={{ width: '42px', height: '42px', borderRadius: '11px', backgroundColor: `${color}15`, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <Icon size={20} color={color} />
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '3px', padding: '3px 8px', borderRadius: '20px', backgroundColor: up ? '#f0fdf4' : '#fef2f2', border: `1px solid ${up ? '#bbf7d0' : '#fecaca'}` }}>
          {up ? <ArrowUpRight size={12} color="#16a34a" /> : <ArrowDownRight size={12} color="#dc2626" />}
          <span style={{ fontSize: '11px', fontWeight: 700, color: up ? '#16a34a' : '#dc2626' }}>{Math.abs(change)}%</span>
        </div>
      </div>
      <p style={{ fontSize: '12px', color: '#64748b', fontWeight: 500, margin: '0 0 4px' }}>{title}</p>
      <p style={{ fontSize: '30px', fontWeight: 800, color: '#0f172a', margin: 0, letterSpacing: '-0.5px' }}>{prefix}{value}{suffix}</p>
      <p style={{ fontSize: '11px', color: '#94a3b8', margin: '4px 0 0' }}>vs last month</p>
    </div>
  );
}

/* ── Module stat card ── */
function ModuleCard({
  icon: Icon, label, color, bg, path,
  primary, primaryLabel,
  stats,
  sparkData,
}: {
  icon: ElementType; label: string; color: string; bg: string; path: string;
  primary: string | number; primaryLabel: string;
  stats: { label: string; value: string | number; icon?: ElementType }[];
  sparkData?: number[];
}) {
  const navigate = useNavigate();
  const [hovered, setHovered] = useState(false);

  const spark = sparkData ?? [20, 35, 28, 45, 38, 55, 48, 62, 58, 70];
  const sparkMin = Math.min(...spark);
  const sparkMax = Math.max(...spark);
  const sparkPoints = spark.map((v, i) => {
    const x = (i / (spark.length - 1)) * 100;
    const y = 100 - ((v - sparkMin) / (sparkMax - sparkMin || 1)) * 80 - 10;
    return `${x},${y}`;
  }).join(' ');

  return (
    <div
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      onClick={() => navigate(path)}
      style={{
        backgroundColor: 'white', borderRadius: '14px', padding: '18px 20px',
        border: `1px solid ${hovered ? color + '40' : '#e2e8f0'}`,
        boxShadow: hovered ? `0 4px 20px ${color}18` : '0 1px 3px rgba(0,0,0,0.04)',
        cursor: 'pointer', transition: 'all 0.18s ease', position: 'relative', overflow: 'hidden',
      }}
    >
      {/* Top row */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '14px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          <div style={{ width: '36px', height: '36px', borderRadius: '10px', backgroundColor: bg, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
            <Icon size={18} color={color} />
          </div>
          <span style={{ fontSize: '13px', fontWeight: 700, color: '#374151' }}>{label}</span>
        </div>
        <ChevronRight size={15} color="#cbd5e1" style={{ transform: hovered ? 'translateX(2px)' : 'none', transition: 'transform 0.15s' }} />
      </div>

      {/* Primary metric */}
      <div style={{ marginBottom: '14px' }}>
        <p style={{ fontSize: '32px', fontWeight: 800, color: '#0f172a', margin: 0, lineHeight: 1, letterSpacing: '-1px' }}>{primary}</p>
        <p style={{ fontSize: '11px', color: '#94a3b8', margin: '3px 0 0', fontWeight: 500 }}>{primaryLabel}</p>
      </div>

      {/* Sparkline */}
      <div style={{ height: '36px', marginBottom: '12px' }}>
        <svg width="100%" height="36" viewBox="0 0 100 100" preserveAspectRatio="none">
          <defs>
            <linearGradient id={`sg-${label}`} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={color} stopOpacity="0.2" />
              <stop offset="100%" stopColor={color} stopOpacity="0" />
            </linearGradient>
          </defs>
          <polygon points={`0,100 ${sparkPoints} 100,100`} fill={`url(#sg-${label})`} />
          <polyline points={sparkPoints} fill="none" stroke={color} strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </div>

      {/* Sub stats */}
      <div style={{ display: 'grid', gridTemplateColumns: `repeat(${stats.length}, 1fr)`, gap: '8px', paddingTop: '10px', borderTop: '1px solid #f1f5f9' }}>
        {stats.map(s => (
          <div key={s.label} style={{ textAlign: 'center' }}>
            <p style={{ fontSize: '15px', fontWeight: 700, color: '#1e293b', margin: 0 }}>{s.value}</p>
            <p style={{ fontSize: '10px', color: '#94a3b8', margin: '2px 0 0', fontWeight: 500 }}>{s.label}</p>
          </div>
        ))}
      </div>
    </div>
  );
}

/* ── Activity feed item ── */
function ActivityRow({ icon: Icon, color, title, sub, time }: { icon: ElementType; color: string; title: string; sub: string; time: string }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: '12px', padding: '10px 0', borderBottom: '1px solid #f8fafc' }}>
      <div style={{ width: '34px', height: '34px', borderRadius: '9px', backgroundColor: `${color}12`, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
        <Icon size={15} color={color} />
      </div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <p style={{ fontSize: '13px', color: '#374151', fontWeight: 500, margin: 0, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{title}</p>
        <p style={{ fontSize: '11px', color: '#94a3b8', margin: '2px 0 0' }}>{sub}</p>
      </div>
      <span style={{ fontSize: '11px', color: '#cbd5e1', flexShrink: 0 }}>{time}</span>
    </div>
  );
}

/* ── Goal progress bar ── */
function GoalBar({ label, current, target, color }: { label: string; current: number; target: number; color: string }) {
  const pct = Math.min(100, Math.round((current / target) * 100));
  return (
    <div style={{ marginBottom: '14px' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '5px' }}>
        <span style={{ fontSize: '12px', color: '#374151', fontWeight: 500 }}>{label}</span>
        <span style={{ fontSize: '12px', color: '#64748b' }}>{current.toLocaleString()} / {target.toLocaleString()} <span style={{ fontWeight: 700, color }}>{pct}%</span></span>
      </div>
      <div style={{ height: '6px', borderRadius: '3px', backgroundColor: '#f1f5f9', overflow: 'hidden' }}>
        <div style={{ height: '100%', width: `${pct}%`, backgroundColor: color, borderRadius: '3px', transition: 'width 0.6s ease' }} />
      </div>
    </div>
  );
}

/* ── Main dashboard ── */
export default function Dashboard() {
  const { contacts, appointments, conversations, pipelines, campaigns, funnels, websites, reviews, bookings } = useApp();

  const totalDeals = pipelines[0]?.stages.reduce((s, st) => s + st.deals.reduce((v, d) => v + d.value, 0), 0) ?? 0;
  const openDeals = pipelines[0]?.stages.slice(0, -1).reduce((s, st) => s + st.deals.length, 0) ?? 0;
  const wonDeals = pipelines[0]?.stages.slice(-1)[0]?.deals.length ?? 0;

  const openConvs = conversations.filter(c => c.status === 'open').length;
  const activeCampaigns = campaigns.filter(c => c.status === 'active').length;
  const publishedSites = websites.filter(w => w.status === 'published').length;
  const avgRating = reviews.length ? (reviews.reduce((s, r) => s + r.rating, 0) / reviews.length).toFixed(1) : '—';
  const fiveStars = reviews.filter(r => r.rating === 5).length;
  const todayBookings = bookings.filter(b => b.date === new Date().toISOString().split('T')[0]).length;
  const emailRate = activeCampaigns > 0 ? 42 : 0;

  const weekRevData = [12, 19, 15, 28, 24, 35, 30].map((v, i) => ({ d: ['M','T','W','T','F','S','S'][i], v }));

  return (
    <div style={{ backgroundColor: '#f8fafc', minHeight: '100vh' }}>
      <Header title="Dashboard" subtitle="Welcome back, John! Here's your business overview." />

      <div style={{ padding: '20px 24px', display: 'flex', flexDirection: 'column', gap: '20px' }}>

        {/* ── Row 1: KPI cards ── */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '14px' }}>
          <KpiCard title="Total Contacts" value={contacts.length || 248} change={12} icon={Users} color="#6366f1" />
          <KpiCard title="Pipeline Value" value={`${((totalDeals || 284000) / 1000).toFixed(0)}k`} change={23} icon={DollarSign} color="#22c55e" prefix="$" />
          <KpiCard title="Open Deals" value={openDeals || 18} change={8} icon={TrendingUp} color="#f59e0b" />
          <KpiCard title="Appointments" value={appointments.filter(a => a.status === 'scheduled').length || 9} change={-5} icon={Calendar} color="#3b82f6" />
        </div>

        {/* ── Row 2: Module cards (3 columns × 2 rows) ── */}
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '12px' }}>
            <Activity size={16} color="#6366f1" />
            <h2 style={{ fontSize: '15px', fontWeight: 700, color: '#0f172a', margin: 0 }}>Module Overview</h2>
            <span style={{ fontSize: '11px', color: '#94a3b8', fontWeight: 500 }}>Click any card to open the module</span>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '14px' }}>
            <ModuleCard
              icon={Users} label="Contacts" color="#6366f1" bg="#f0f0ff" path="/contacts"
              primary={contacts.length || 248} primaryLabel="total contacts"
              stats={[
                { label: 'New this mo.', value: 34 },
                { label: 'Tagged', value: Math.round((contacts.length || 248) * 0.6) },
                { label: 'Active', value: Math.round((contacts.length || 248) * 0.8) },
              ]}
              sparkData={[40, 55, 48, 60, 52, 70, 65, 78, 72, 85]}
            />
            <ModuleCard
              icon={MessageSquare} label="Conversations" color="#0891b2" bg="#f0f9ff" path="/conversations"
              primary={conversations.length || 63} primaryLabel="total threads"
              stats={[
                { label: 'Open', value: openConvs || 18 },
                { label: 'Resolved', value: (conversations.length || 63) - (openConvs || 18) },
                { label: 'Unread', value: 7 },
              ]}
              sparkData={[30, 22, 38, 28, 45, 35, 50, 42, 55, 48]}
            />
            <ModuleCard
              icon={Mail} label="Marketing" color="#8b5cf6" bg="#f5f3ff" path="/marketing"
              primary={activeCampaigns || 4} primaryLabel="active campaigns"
              stats={[
                { label: 'Sent', value: '12.4k' },
                { label: 'Open rate', value: `${emailRate || 42}%` },
                { label: 'Clicks', value: `${emailRate ? Math.round(emailRate * 0.3) : 14}%` },
              ]}
              sparkData={[22, 35, 28, 42, 38, 48, 44, 55, 50, 62]}
            />
            <ModuleCard
              icon={TrendingUp} label="Pipelines" color="#f59e0b" bg="#fffbeb" path="/pipelines"
              primary={`$${((totalDeals || 284000) / 1000).toFixed(0)}k`} primaryLabel="pipeline value"
              stats={[
                { label: 'Open', value: openDeals || 18 },
                { label: 'Won', value: wonDeals || 6 },
                { label: 'Conv. %', value: '33%' },
              ]}
              sparkData={[15, 25, 20, 38, 32, 45, 40, 52, 48, 60]}
            />
            <ModuleCard
              icon={Funnel} label="Funnels" color="#ec4899" bg="#fdf4ff" path="/funnels"
              primary={funnels.length || 5} primaryLabel="active funnels"
              stats={[
                { label: 'Views', value: '8.2k' },
                { label: 'Leads', value: 184 },
                { label: 'Conv. %', value: '2.2%' },
              ]}
              sparkData={[18, 28, 22, 35, 30, 40, 38, 48, 45, 55]}
            />
            <ModuleCard
              icon={Globe} label="Websites" color="#0d9488" bg="#f0fdfa" path="/websites"
              primary={websites.length || 3} primaryLabel="websites"
              stats={[
                { label: 'Published', value: publishedSites || 2 },
                { label: 'Visitors', value: '5.8k' },
                { label: 'Page views', value: '24k' },
              ]}
              sparkData={[25, 38, 32, 48, 42, 55, 50, 65, 60, 72]}
            />
            <ModuleCard
              icon={CalendarCheck} label="Scheduling" color="#3b82f6" bg="#eff6ff" path="/scheduling"
              primary={bookings.length || 28} primaryLabel="total bookings"
              stats={[
                { label: 'Today', value: todayBookings || 3 },
                { label: 'This week', value: 11 },
                { label: 'No-shows', value: 2 },
              ]}
              sparkData={[10, 18, 14, 22, 18, 28, 24, 32, 28, 36]}
            />
            <ModuleCard
              icon={Star} label="Reputation" color="#f59e0b" bg="#fffbeb" path="/reputation"
              primary={avgRating === '—' ? '4.8' : avgRating} primaryLabel="avg. rating"
              stats={[
                { label: 'Reviews', value: reviews.length || 47 },
                { label: '5-star', value: fiveStars || 38 },
                { label: 'Replied', value: `${reviews.length ? Math.round((reviews.filter(r => r.reply).length / reviews.length) * 100) : 82}%` },
              ]}
              sparkData={[60, 72, 68, 80, 75, 85, 82, 90, 88, 95]}
            />
          </div>
        </div>

        {/* ── Row 3: Revenue chart + Goals ── */}
        <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: '16px' }}>
          <div style={{ backgroundColor: 'white', borderRadius: '14px', padding: '20px 24px', border: '1px solid #e2e8f0' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
              <div>
                <h3 style={{ fontSize: '15px', fontWeight: 700, color: '#0f172a', margin: 0 }}>Revenue Overview</h3>
                <p style={{ fontSize: '12px', color: '#94a3b8', margin: '2px 0 0' }}>Monthly recurring revenue trend</p>
              </div>
              <select style={{ fontSize: '12px', border: '1px solid #e2e8f0', borderRadius: '8px', padding: '5px 10px', color: '#64748b', outline: 'none', backgroundColor: 'white' }}>
                <option>Last 12 months</option>
                <option>Last 6 months</option>
              </select>
            </div>
            <ResponsiveContainer width="100%" height={210}>
              <AreaChart data={revenueData}>
                <defs>
                  <linearGradient id="colorRev" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#6366f1" stopOpacity={0.25} />
                    <stop offset="95%" stopColor="#6366f1" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                <XAxis dataKey="month" tick={{ fontSize: 11, fill: '#94a3b8' }} axisLine={false} tickLine={false} />
                <YAxis tick={{ fontSize: 11, fill: '#94a3b8' }} axisLine={false} tickLine={false} tickFormatter={v => `$${v / 1000}k`} />
                <Tooltip formatter={v => [`$${Number(v).toLocaleString()}`, 'Revenue']} contentStyle={{ borderRadius: '8px', border: '1px solid #e2e8f0', fontSize: '12px' }} />
                <Area type="monotone" dataKey="revenue" stroke="#6366f1" strokeWidth={2.5} fill="url(#colorRev)" dot={false} />
              </AreaChart>
            </ResponsiveContainer>
          </div>

          <div style={{ backgroundColor: 'white', borderRadius: '14px', padding: '20px 24px', border: '1px solid #e2e8f0' }}>
            <h3 style={{ fontSize: '15px', fontWeight: 700, color: '#0f172a', margin: '0 0 6px' }}>Monthly Goals</h3>
            <p style={{ fontSize: '12px', color: '#94a3b8', margin: '0 0 18px' }}>Progress toward this month's targets</p>
            <GoalBar label="New Contacts" current={contacts.length || 248} target={300} color="#6366f1" />
            <GoalBar label="Revenue" current={totalDeals ? Math.round(totalDeals * 0.4) : 38400} target={50000} color="#22c55e" />
            <GoalBar label="Deals Closed" current={wonDeals || 6} target={15} color="#f59e0b" />
            <GoalBar label="Campaign Emails" current={12400} target={20000} color="#8b5cf6" />
            <GoalBar label="5-star Reviews" current={fiveStars || 38} target={50} color="#f59e0b" />
          </div>
        </div>

        {/* ── Row 4: Lead sources + Weekly activity ── */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
          <div style={{ backgroundColor: 'white', borderRadius: '14px', padding: '20px 24px', border: '1px solid #e2e8f0' }}>
            <h3 style={{ fontSize: '15px', fontWeight: 700, color: '#0f172a', margin: '0 0 16px' }}>Lead Sources</h3>
            <div style={{ display: 'flex', gap: '16px', alignItems: 'center' }}>
              <ResponsiveContainer width={140} height={140}>
                <PieChart>
                  <Pie data={channelData} cx="50%" cy="50%" innerRadius={38} outerRadius={62} paddingAngle={3} dataKey="value">
                    {channelData.map((_, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
                  </Pie>
                  <Tooltip formatter={v => [`${v}%`, 'Share']} />
                </PieChart>
              </ResponsiveContainer>
              <div style={{ flex: 1 }}>
                {channelData.map((item, i) => (
                  <div key={item.name} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '5px 0', borderBottom: '1px solid #f8fafc' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                      <div style={{ width: '8px', height: '8px', borderRadius: '50%', backgroundColor: COLORS[i], flexShrink: 0 }} />
                      <span style={{ fontSize: '12px', color: '#64748b' }}>{item.name}</span>
                    </div>
                    <span style={{ fontSize: '12px', fontWeight: 700, color: '#374151' }}>{item.value}%</span>
                  </div>
                ))}
              </div>
            </div>
          </div>

          <div style={{ backgroundColor: 'white', borderRadius: '14px', padding: '20px 24px', border: '1px solid #e2e8f0' }}>
            <h3 style={{ fontSize: '15px', fontWeight: 700, color: '#0f172a', margin: '0 0 4px' }}>This Week's Activity</h3>
            <p style={{ fontSize: '12px', color: '#94a3b8', margin: '0 0 14px' }}>Messages sent per day</p>
            <ResponsiveContainer width="100%" height={130}>
              <BarChart data={weekRevData} barSize={18}>
                <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" vertical={false} />
                <XAxis dataKey="d" tick={{ fontSize: 11, fill: '#94a3b8' }} axisLine={false} tickLine={false} />
                <YAxis hide />
                <Tooltip contentStyle={{ borderRadius: '8px', border: '1px solid #e2e8f0', fontSize: '12px' }} />
                <Bar dataKey="v" fill="#6366f1" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '10px', marginTop: '14px', paddingTop: '14px', borderTop: '1px solid #f1f5f9' }}>
              {[
                { label: 'Emails sent', value: '1,248', icon: Send, color: '#6366f1' },
                { label: 'SMS sent', value: '389', icon: MessageSquare, color: '#0891b2' },
                { label: 'Calls made', value: '56', icon: Activity, color: '#22c55e' },
              ].map(s => (
                <div key={s.label} style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <div style={{ width: '28px', height: '28px', borderRadius: '7px', backgroundColor: `${s.color}12`, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                    <s.icon size={13} color={s.color} />
                  </div>
                  <div>
                    <p style={{ fontSize: '13px', fontWeight: 700, color: '#0f172a', margin: 0 }}>{s.value}</p>
                    <p style={{ fontSize: '10px', color: '#94a3b8', margin: 0 }}>{s.label}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* ── Row 5: Activity feed + Today's appointments ── */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
          <div style={{ backgroundColor: 'white', borderRadius: '14px', padding: '20px 24px', border: '1px solid #e2e8f0' }}>
            <h3 style={{ fontSize: '15px', fontWeight: 700, color: '#0f172a', margin: '0 0 12px' }}>Recent Activity</h3>
            <ActivityRow icon={Users} color="#6366f1" title="New contact added" sub="Emily Chen · via web form" time="2m ago" />
            <ActivityRow icon={DollarSign} color="#22c55e" title="Deal closed — $15,000" sub="Robert Martinez · Enterprise plan" time="1h ago" />
            <ActivityRow icon={Calendar} color="#3b82f6" title="Appointment scheduled" sub="Mike Davis · Product demo" time="2h ago" />
            <ActivityRow icon={MessageSquare} color="#f59e0b" title="New SMS received" sub="Sarah Johnson · Replied to campaign" time="3h ago" />
            <ActivityRow icon={Star} color="#f59e0b" title="5-star review received" sub="TechCorp · Google Reviews" time="5h ago" />
            <ActivityRow icon={Mail} color="#8b5cf6" title="Campaign launched" sub="Q2 Onboarding · 840 recipients" time="8h ago" />
          </div>

          <div style={{ backgroundColor: 'white', borderRadius: '14px', padding: '20px 24px', border: '1px solid #e2e8f0' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '14px' }}>
              <h3 style={{ fontSize: '15px', fontWeight: 700, color: '#0f172a', margin: 0 }}>Today's Appointments</h3>
              <span style={{ fontSize: '12px', color: '#6366f1', fontWeight: 600 }}>
                {appointments.filter(a => a.status === 'scheduled').length} scheduled
              </span>
            </div>
            {appointments.filter(a => a.date === '2024-05-21').slice(0, 5).map(appt => (
              <div key={appt.id} style={{ display: 'flex', alignItems: 'center', gap: '12px', padding: '11px', borderRadius: '10px', border: '1px solid #f1f5f9', marginBottom: '8px', backgroundColor: '#fafafe' }}>
                <div style={{ textAlign: 'center', minWidth: '44px' }}>
                  <p style={{ fontSize: '15px', fontWeight: 800, color: '#6366f1', margin: 0 }}>{appt.time.split(':')[0]}</p>
                  <p style={{ fontSize: '10px', color: '#94a3b8', margin: 0 }}>{appt.time.includes('AM') ? 'AM' : 'PM'}</p>
                </div>
                <div style={{ width: '1px', height: '32px', backgroundColor: '#e2e8f0' }} />
                <div style={{ flex: 1, minWidth: 0 }}>
                  <p style={{ fontSize: '13px', fontWeight: 600, color: '#374151', margin: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{appt.title}</p>
                  <p style={{ fontSize: '11px', color: '#94a3b8', margin: '2px 0 0' }}>{appt.contactName} · {appt.type}</p>
                </div>
                <span style={{
                  padding: '3px 9px', borderRadius: '20px', fontSize: '10px', fontWeight: 700, flexShrink: 0,
                  backgroundColor: appt.status === 'completed' ? '#ecfdf5' : appt.status === 'cancelled' ? '#fef2f2' : '#eff6ff',
                  color: appt.status === 'completed' ? '#16a34a' : appt.status === 'cancelled' ? '#dc2626' : '#2563eb',
                }}>
                  {appt.status}
                </span>
              </div>
            ))}
            {appointments.filter(a => a.date === '2024-05-21').length === 0 && (
              <div style={{ textAlign: 'center', padding: '32px 16px', color: '#94a3b8' }}>
                <CalendarCheck size={32} color="#e2e8f0" style={{ margin: '0 auto 8px', display: 'block' }} />
                <p style={{ fontSize: '13px', margin: 0 }}>No appointments today</p>
              </div>
            )}
          </div>
        </div>

      </div>
    </div>
  );
}
