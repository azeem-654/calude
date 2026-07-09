import { useState, useEffect, useRef } from 'react';
import type { ElementType } from 'react';
import {
  Users, TrendingUp, Calendar, DollarSign, MessageSquare,
  ArrowUpRight, ArrowDownRight, Mail, Funnel, Star,
  CalendarCheck, Send, Zap, ChevronRight, Activity,
  ShoppingBag, CornerUpLeft, ArrowRight,
} from 'lucide-react';
import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';
import Header from '../Layout/Header';
import { useApp } from '../../context/AppContext';
import { useNavigate } from 'react-router-dom';

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const DEMO_REVENUE = [18, 22, 19, 28, 26, 34, 31, 38, 36, 44, 41, 52].map((v, i) => ({ month: MONTHS[i], revenue: v * 1000 }));

/* ═══ Stratus design tokens ═══ */
const INK = '#17191c';
const MUTED = '#83878e';
const FAINT = '#b0b4ba';
const LINE = '#ecedf0';
const CARD: React.CSSProperties = { backgroundColor: '#fff', borderRadius: 20, border: `1px solid ${LINE}`, padding: '22px 24px' };
const LABEL: React.CSSProperties = { fontSize: 11, fontWeight: 600, color: MUTED, textTransform: 'uppercase', letterSpacing: '0.07em' };

/* ── KPI bento card ── */
function KpiCard({ title, value, change, icon: Icon, dark = false, prefix = '' }: {
  title: string; value: string | number; change: number;
  icon: ElementType; dark?: boolean; prefix?: string;
}) {
  const up = change >= 0;
  return (
    <div style={{
      ...CARD,
      backgroundColor: dark ? INK : '#fff',
      border: dark ? '1px solid #17191c' : `1px solid ${LINE}`,
      display: 'flex', flexDirection: 'column', gap: 14,
    }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div style={{
          width: 38, height: 38, borderRadius: 999,
          backgroundColor: dark ? 'rgba(255,255,255,0.1)' : '#f3f4f6',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
        }}>
          <Icon size={17} color={dark ? '#c7f441' : INK} strokeWidth={2} />
        </div>
        <div style={{
          display: 'flex', alignItems: 'center', gap: 3, padding: '4px 10px', borderRadius: 999,
          backgroundColor: dark ? '#c7f441' : up ? '#eefbe7' : '#fdeeee',
        }}>
          {up ? <ArrowUpRight size={11} color={dark ? INK : '#3f9142'} /> : <ArrowDownRight size={11} color="#c0392b" />}
          <span style={{ fontSize: 11, fontWeight: 700, color: dark ? INK : up ? '#3f9142' : '#c0392b' }}>{Math.abs(change)}%</span>
        </div>
      </div>
      <div>
        <p style={{ fontSize: 30, fontWeight: 700, color: dark ? '#fff' : INK, margin: 0, letterSpacing: '-0.03em', lineHeight: 1.1 }}>{prefix}{value}</p>
        <p style={{ fontSize: 12.5, color: dark ? 'rgba(255,255,255,0.55)' : MUTED, margin: '5px 0 0', fontWeight: 500 }}>{title}</p>
      </div>
    </div>
  );
}

/* ── Customer Journey strip — the signature element ── */
function CustomerJourney({ stages }: { stages: { name: string; count: number; value: number; color: string }[] }) {
  const total = Math.max(1, stages.reduce((s, x) => s + x.count, 0));
  return (
    <div style={CARD}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
        <div>
          <h3 style={{ fontSize: 16, fontWeight: 700, color: INK, margin: 0, letterSpacing: '-0.02em' }}>Customer Journey</h3>
          <p style={{ fontSize: 12.5, color: MUTED, margin: '3px 0 0' }}>Where your customers are right now, stage by stage</p>
        </div>
        <span style={{ ...LABEL, backgroundColor: '#f3f4f6', padding: '6px 14px', borderRadius: 999 }}>{total} in journey</span>
      </div>

      {/* Segment bar */}
      <div style={{ display: 'flex', gap: 5, height: 10, borderRadius: 999, overflow: 'hidden', marginBottom: 20 }}>
        {stages.map(s => (
          <div key={s.name} style={{ flex: Math.max(s.count, 0.5), backgroundColor: s.color, borderRadius: 999, transition: 'flex 0.6s ease' }} />
        ))}
      </div>

      {/* Stage columns */}
      <div style={{ display: 'grid', gridTemplateColumns: `repeat(${stages.length}, 1fr)`, gap: 12 }}>
        {stages.map((s, i) => {
          const share = Math.round((s.count / total) * 100);
          return (
            <div key={s.name} style={{ display: 'flex', alignItems: 'flex-start', gap: 10 }}>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 6 }}>
                  <span style={{ width: 8, height: 8, borderRadius: 999, backgroundColor: s.color, flexShrink: 0 }} />
                  <span style={{ fontSize: 12, fontWeight: 600, color: MUTED, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{s.name}</span>
                </div>
                <p style={{ fontSize: 22, fontWeight: 700, color: INK, margin: 0, letterSpacing: '-0.02em' }}>{s.count}</p>
                <p style={{ fontSize: 11.5, color: FAINT, margin: '3px 0 0', fontWeight: 500 }}>
                  ${(s.value / 1000).toFixed(0)}k · {share}%
                </p>
              </div>
              {i < stages.length - 1 && (
                <ArrowRight size={14} color={LINE} style={{ marginTop: 22, flexShrink: 0 }} />
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

/* ── Live Activity feed ── */
interface FeedEvent {
  id: number;
  type: 'message' | 'order' | 'email' | 'reply';
  actor: string;
  text: string;
  ts: number;
  fresh: boolean;
}

const FEED_META = {
  message: { icon: MessageSquare, color: '#3b82f6', bg: '#eef4fe', label: 'Message' },
  order:   { icon: ShoppingBag,   color: '#3f9142', bg: '#eefbe7', label: 'Order' },
  email:   { icon: Mail,          color: '#8b5cf6', bg: '#f4f0fe', label: 'Email' },
  reply:   { icon: CornerUpLeft,  color: '#d97706', bg: '#fdf5e7', label: 'Team reply' },
} as const;

const FALLBACK_NAMES = ['Emily Chen', 'Robert Martinez', 'Sarah Johnson', 'Mike Davis', 'Lisa Wong', 'James Carter', 'Ana Silva', 'Tom Becker'];
const TEAM = ['John', 'Maria', 'Alex'];

function makeEvent(id: number, names: string[]): FeedEvent {
  const name = names[Math.floor(Math.random() * names.length)];
  const type = (['message', 'order', 'email', 'reply'] as const)[Math.floor(Math.random() * 4)];
  const text =
    type === 'message' ? ['sent you a new message', 'asked about pricing', 'replied in the chat'][Math.floor(Math.random() * 3)] :
    type === 'order'   ? `placed an order — $${(Math.floor(Math.random() * 46) + 3) * 100}` :
    type === 'email'   ? ['opened your campaign email', 'clicked a campaign link', 'subscribed to the newsletter'][Math.floor(Math.random() * 3)] :
    `got a reply from ${TEAM[Math.floor(Math.random() * TEAM.length)]} on the team`;
  return { id, type, actor: name, text, ts: Date.now(), fresh: true };
}

function relTime(ts: number, now: number): string {
  const s = Math.floor((now - ts) / 1000);
  if (s < 8) return 'just now';
  if (s < 60) return `${s}s ago`;
  const m = Math.floor(s / 60);
  return m < 60 ? `${m}m ago` : `${Math.floor(m / 60)}h ago`;
}

function LiveFeed({ names }: { names: string[] }) {
  const idRef = useRef(4);
  const hoverRef = useRef(false);
  const [now, setNow] = useState(Date.now());
  const [events, setEvents] = useState<FeedEvent[]>(() => [
    { ...makeEvent(1, names), ts: Date.now() - 47000, fresh: false },
    { ...makeEvent(2, names), ts: Date.now() - 112000, fresh: false },
    { ...makeEvent(3, names), ts: Date.now() - 260000, fresh: false },
  ].map((e, i) => ({ ...e, id: i + 1 })));

  useEffect(() => {
    let timer: number;
    const tick = () => {
      if (!hoverRef.current) {
        idRef.current += 1;
        const e = makeEvent(idRef.current, names);
        setEvents(prev => [e, ...prev.map(p => ({ ...p, fresh: false }))].slice(0, 7));
      }
      setNow(Date.now());
      timer = window.setTimeout(tick, 3200 + Math.random() * 2800);
    };
    timer = window.setTimeout(tick, 2200);
    const clock = window.setInterval(() => setNow(Date.now()), 10000);
    return () => { clearTimeout(timer); clearInterval(clock); };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div
      style={{ ...CARD, padding: '22px 20px 14px', display: 'flex', flexDirection: 'column', minHeight: 0 }}
      onMouseEnter={() => { hoverRef.current = true; }}
      onMouseLeave={() => { hoverRef.current = false; }}
    >
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14, paddingRight: 4 }}>
        <div>
          <h3 style={{ fontSize: 16, fontWeight: 700, color: INK, margin: 0, letterSpacing: '-0.02em' }}>Live Activity</h3>
          <p style={{ fontSize: 12, color: MUTED, margin: '3px 0 0' }}>Messages, orders, emails & team replies</p>
        </div>
        <span style={{
          display: 'flex', alignItems: 'center', gap: 6, padding: '5px 12px', borderRadius: 999,
          backgroundColor: '#eefbe7', fontSize: 10.5, fontWeight: 800, color: '#3f9142', letterSpacing: '0.08em',
        }}>
          <span style={{ width: 7, height: 7, borderRadius: 999, backgroundColor: '#4ade80', animation: 'pulse-dot 1.6s ease-in-out infinite' }} />
          LIVE
        </span>
      </div>

      <div style={{ flex: 1, overflow: 'hidden' }}>
        {events.map(e => {
          const meta = FEED_META[e.type];
          const Icon = meta.icon;
          return (
            <div key={e.id} style={{
              display: 'flex', alignItems: 'center', gap: 12, padding: '10px 4px',
              borderBottom: `1px solid #f4f5f7`,
              animation: e.fresh ? 'feed-in 0.45s cubic-bezier(0.16,1,0.3,1)' : undefined,
            }}>
              <div style={{
                width: 36, height: 36, borderRadius: 12, backgroundColor: meta.bg,
                display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
              }}>
                <Icon size={15} color={meta.color} strokeWidth={2.2} />
              </div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <p style={{ fontSize: 13, color: INK, margin: 0, lineHeight: 1.45, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  <span style={{ fontWeight: 700 }}>{e.actor}</span>{' '}
                  <span style={{ color: '#5c6066' }}>{e.text}</span>
                </p>
                <p style={{ fontSize: 11, color: FAINT, margin: '2px 0 0', fontWeight: 500 }}>
                  {meta.label} · {relTime(e.ts, now)}
                </p>
              </div>
              {e.fresh && (
                <span style={{ width: 7, height: 7, borderRadius: 999, backgroundColor: meta.color, flexShrink: 0 }} />
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

/* ── Module bento card ── */
function ModuleCard({ icon: Icon, label, color, path, primary, primaryLabel, stats }: {
  icon: ElementType; label: string; color: string; path: string;
  primary: string | number; primaryLabel: string;
  stats: { label: string; value: string | number }[];
}) {
  const navigate = useNavigate();
  const [hovered, setHovered] = useState(false);
  return (
    <div
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      onClick={() => navigate(path)}
      style={{
        ...CARD, padding: '20px 22px', cursor: 'pointer',
        boxShadow: hovered ? '0 12px 32px -8px rgba(23,25,28,0.12)' : 'none',
        transform: hovered ? 'translateY(-2px)' : 'none',
        transition: 'all 0.18s ease',
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <div style={{ width: 34, height: 34, borderRadius: 999, backgroundColor: `${color}14`, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <Icon size={15} color={color} strokeWidth={2.2} />
          </div>
          <span style={{ fontSize: 13.5, fontWeight: 700, color: INK, letterSpacing: '-0.01em' }}>{label}</span>
        </div>
        <ChevronRight size={15} color={hovered ? color : FAINT} style={{ transform: hovered ? 'translateX(2px)' : 'none', transition: 'all 0.15s' }} />
      </div>
      <p style={{ fontSize: 28, fontWeight: 700, color: INK, margin: 0, lineHeight: 1, letterSpacing: '-0.03em' }}>{primary}</p>
      <p style={{ fontSize: 11.5, color: MUTED, margin: '4px 0 14px', fontWeight: 500 }}>{primaryLabel}</p>
      <div style={{ display: 'grid', gridTemplateColumns: `repeat(${stats.length}, 1fr)`, gap: 8, paddingTop: 12, borderTop: `1px solid #f4f5f7` }}>
        {stats.map(s => (
          <div key={s.label}>
            <p style={{ fontSize: 14, fontWeight: 700, color: INK, margin: 0 }}>{s.value}</p>
            <p style={{ fontSize: 10.5, color: FAINT, margin: '2px 0 0', fontWeight: 500 }}>{s.label}</p>
          </div>
        ))}
      </div>
    </div>
  );
}

/* ── Goal progress ── */
function GoalBar({ label, current, target, color }: { label: string; current: number; target: number; color: string }) {
  const pct = Math.min(100, Math.round((current / target) * 100));
  return (
    <div style={{ marginBottom: 16 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6 }}>
        <span style={{ fontSize: 12.5, color: INK, fontWeight: 600 }}>{label}</span>
        <span style={{ fontSize: 12, color: MUTED }}>{current.toLocaleString()} / {target.toLocaleString()} <span style={{ fontWeight: 700, color: INK }}>{pct}%</span></span>
      </div>
      <div style={{ height: 8, borderRadius: 999, backgroundColor: '#f3f4f6', overflow: 'hidden' }}>
        <div style={{ height: '100%', width: `${pct}%`, backgroundColor: color, borderRadius: 999, transition: 'width 0.6s ease' }} />
      </div>
    </div>
  );
}

/* ── Main dashboard ── */
export default function Dashboard() {
  const { contacts, appointments, conversations, pipelines, campaigns, funnels, reviews, bookings, videoProjects, socialPosts } = useApp();

  const totalDeals = pipelines[0]?.stages.reduce((s, st) => s + st.deals.reduce((v, d) => v + d.value, 0), 0) ?? 0;
  const openDeals = pipelines[0]?.stages.slice(0, -1).reduce((s, st) => s + st.deals.length, 0) ?? 0;
  const wonDeals = pipelines[0]?.stages.slice(-1)[0]?.deals.length ?? 0;

  const openConvs = conversations.filter(c => c.status === 'open').length;
  const activeCampaigns = campaigns.filter(c => c.status === 'active').length;
  const totalClips = videoProjects.reduce((s, p) => s + p.clips.length, 0);
  const avgRating = reviews.length ? (reviews.reduce((s, r) => s + r.rating, 0) / reviews.length).toFixed(1) : '4.8';
  const fiveStars = reviews.filter(r => r.rating === 5).length;
  const todayBookings = bookings.filter(b => b.slotDate === new Date().toISOString().split('T')[0]).length;
  const emailRate = activeCampaigns > 0 ? 42 : 0;

  /* Journey stages from the real pipeline (fallback demo numbers) */
  const JOURNEY_COLORS = ['#8b5cf6', '#3b82f6', '#f59e0b', '#f97316', '#22c55e'];
  const pipelineStages = pipelines[0]?.stages ?? [];
  const journeyStages = (pipelineStages.length >= 2
    ? pipelineStages.map((s, i) => ({
        name: s.name,
        count: s.deals.length,
        value: s.deals.reduce((v, d) => v + d.value, 0),
        color: JOURNEY_COLORS[i % JOURNEY_COLORS.length],
      }))
    : [
        { name: 'New Lead', count: 24, value: 96000, color: JOURNEY_COLORS[0] },
        { name: 'Qualified', count: 16, value: 78000, color: JOURNEY_COLORS[1] },
        { name: 'Proposal', count: 9, value: 54000, color: JOURNEY_COLORS[2] },
        { name: 'Negotiation', count: 5, value: 38000, color: JOURNEY_COLORS[3] },
        { name: 'Won', count: 6, value: 47000, color: JOURNEY_COLORS[4] },
      ]
  );
  const journeyAllZero = journeyStages.every(s => s.count === 0);
  const journey = journeyAllZero
    ? journeyStages.map((s, i) => ({ ...s, count: [24, 16, 9, 5, 6][i % 5], value: [96000, 78000, 54000, 38000, 47000][i % 5] }))
    : journeyStages;

  const feedNames = contacts.length >= 3 ? contacts.slice(0, 12).map(c => c.name) : FALLBACK_NAMES;

  /* Revenue by month from real won deals; demo curve when no closed deals yet */
  const revenueData = (() => {
    const base = MONTHS.map(m => ({ month: m, revenue: 0 }));
    pipelines.forEach(p => p.stages.forEach(s => s.deals.forEach(d => {
      if (d.status === 'won' && d.closedAt) base[new Date(d.closedAt).getMonth()].revenue += d.value;
    })));
    return base.some(b => b.revenue > 0) ? base : DEMO_REVENUE;
  })();

  return (
    <div style={{ backgroundColor: '#f3f4f6', minHeight: '100vh' }}>
      <Header title="Dashboard" subtitle="Welcome back, John! Here's your business overview." />

      <div style={{ padding: '22px 26px', display: 'flex', flexDirection: 'column', gap: 16 }}>

        {/* ── Row 1: KPI bento ── */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 16 }}>
          <KpiCard title="Pipeline value" value={`${((totalDeals || 284000) / 1000).toFixed(0)}k`} change={23} icon={DollarSign} prefix="$" dark />
          <KpiCard title="Total contacts" value={contacts.length || 248} change={12} icon={Users} />
          <KpiCard title="Open deals" value={openDeals || 18} change={8} icon={TrendingUp} />
          <KpiCard title="Appointments" value={appointments.filter(a => a.status === 'scheduled').length || 9} change={-5} icon={Calendar} />
        </div>

        {/* ── Row 2: Customer Journey ── */}
        <CustomerJourney stages={journey} />

        {/* ── Row 3: Revenue + Live feed ── */}
        <div style={{ display: 'grid', gridTemplateColumns: '1.9fr 1.1fr', gap: 16 }}>
          <div style={CARD}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
              <div>
                <h3 style={{ fontSize: 16, fontWeight: 700, color: INK, margin: 0, letterSpacing: '-0.02em' }}>Revenue Overview</h3>
                <p style={{ fontSize: 12.5, color: MUTED, margin: '3px 0 0' }}>Monthly recurring revenue trend</p>
              </div>
              <select style={{ fontSize: 12, border: `1px solid ${LINE}`, borderRadius: 999, padding: '7px 14px', color: MUTED, outline: 'none', backgroundColor: '#fff', fontWeight: 600, cursor: 'pointer' }}>
                <option>Last 12 months</option>
                <option>Last 6 months</option>
              </select>
            </div>
            <ResponsiveContainer width="100%" height={250}>
              <AreaChart data={revenueData} margin={{ top: 8, right: 4, left: -12, bottom: 0 }}>
                <defs>
                  <linearGradient id="colorRev" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor={INK} stopOpacity={0.14} />
                    <stop offset="95%" stopColor={INK} stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="2 6" stroke="#e8e9ec" vertical={false} />
                <XAxis dataKey="month" tick={{ fontSize: 11, fill: FAINT }} axisLine={false} tickLine={false} dy={6} />
                <YAxis tick={{ fontSize: 11, fill: FAINT }} axisLine={false} tickLine={false} tickFormatter={v => `$${v / 1000}k`} />
                <Tooltip
                  formatter={v => [`$${Number(v).toLocaleString()}`, 'Revenue']}
                  contentStyle={{ borderRadius: 14, border: `1px solid ${LINE}`, fontSize: 12, boxShadow: '0 12px 32px -8px rgba(23,25,28,0.12)' }}
                />
                <Area type="monotone" dataKey="revenue" stroke={INK} strokeWidth={2.5} fill="url(#colorRev)" dot={false}
                  activeDot={{ r: 5, fill: '#c7f441', stroke: INK, strokeWidth: 2 }} />
              </AreaChart>
            </ResponsiveContainer>
          </div>

          <LiveFeed names={feedNames} />
        </div>

        {/* ── Row 4: Module overview ── */}
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, margin: '6px 2px 12px' }}>
            <Activity size={15} color={INK} />
            <h2 style={{ fontSize: 15, fontWeight: 700, color: INK, margin: 0, letterSpacing: '-0.01em' }}>Modules</h2>
            <span style={{ fontSize: 11.5, color: FAINT, fontWeight: 500 }}>Click any card to open</span>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 16 }}>
            <ModuleCard
              icon={Users} label="Contacts" color="#6366f1" path="/contacts"
              primary={contacts.length || 248} primaryLabel="total contacts"
              stats={[{ label: 'New this mo.', value: 34 }, { label: 'Tagged', value: Math.round((contacts.length || 248) * 0.6) }, { label: 'Active', value: Math.round((contacts.length || 248) * 0.8) }]}
            />
            <ModuleCard
              icon={MessageSquare} label="Conversations" color="#0891b2" path="/conversations"
              primary={conversations.length || 63} primaryLabel="total threads"
              stats={[{ label: 'Open', value: openConvs || 18 }, { label: 'Resolved', value: (conversations.length || 63) - (openConvs || 18) }, { label: 'Unread', value: 7 }]}
            />
            <ModuleCard
              icon={Mail} label="Marketing" color="#8b5cf6" path="/marketing"
              primary={activeCampaigns || 4} primaryLabel="active campaigns"
              stats={[{ label: 'Sent', value: '12.4k' }, { label: 'Open rate', value: `${emailRate || 42}%` }, { label: 'Clicks', value: `${emailRate ? Math.round(emailRate * 0.3) : 14}%` }]}
            />
            <ModuleCard
              icon={TrendingUp} label="Pipelines" color="#f59e0b" path="/pipelines"
              primary={`$${((totalDeals || 284000) / 1000).toFixed(0)}k`} primaryLabel="pipeline value"
              stats={[{ label: 'Open', value: openDeals || 18 }, { label: 'Won', value: wonDeals || 6 }, { label: 'Conv. %', value: '33%' }]}
            />
            <ModuleCard
              icon={Funnel} label="Funnels" color="#ec4899" path="/funnels"
              primary={funnels.length || 5} primaryLabel="active funnels"
              stats={[{ label: 'Views', value: '8.2k' }, { label: 'Leads', value: 184 }, { label: 'Conv. %', value: '2.2%' }]}
            />
            <ModuleCard
              icon={Zap} label="AI Studio" color="#0d9488" path="/social-creator"
              primary={socialPosts.length + totalClips || 3} primaryLabel="AI creations"
              stats={[{ label: 'Designs', value: socialPosts.length }, { label: 'Shorts', value: totalClips }, { label: 'Projects', value: videoProjects.length }]}
            />
            <ModuleCard
              icon={CalendarCheck} label="Scheduling" color="#3b82f6" path="/scheduling"
              primary={bookings.length || 28} primaryLabel="total bookings"
              stats={[{ label: 'Today', value: todayBookings || 3 }, { label: 'This week', value: 11 }, { label: 'No-shows', value: 2 }]}
            />
            <ModuleCard
              icon={Star} label="Reputation" color="#f59e0b" path="/reputation"
              primary={avgRating} primaryLabel="avg. rating"
              stats={[{ label: 'Reviews', value: reviews.length || 47 }, { label: '5-star', value: fiveStars || 38 }, { label: 'Replied', value: `${reviews.length ? Math.round((reviews.filter(r => r.replied).length / reviews.length) * 100) : 82}%` }]}
            />
          </div>
        </div>

        {/* ── Row 5: Goals + Today's appointments ── */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
          <div style={CARD}>
            <h3 style={{ fontSize: 16, fontWeight: 700, color: INK, margin: '0 0 4px', letterSpacing: '-0.02em' }}>Monthly Goals</h3>
            <p style={{ fontSize: 12.5, color: MUTED, margin: '0 0 18px' }}>Progress toward this month's targets</p>
            <GoalBar label="New Contacts" current={contacts.length || 248} target={300} color={INK} />
            <GoalBar label="Revenue" current={totalDeals ? Math.round(totalDeals * 0.4) : 38400} target={50000} color="#c7f441" />
            <GoalBar label="Deals Closed" current={wonDeals || 6} target={15} color="#8b5cf6" />
            <GoalBar label="Campaign Emails" current={12400} target={20000} color="#3b82f6" />
            <GoalBar label="5-star Reviews" current={fiveStars || 38} target={50} color="#f59e0b" />
          </div>

          <div style={CARD}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
              <h3 style={{ fontSize: 16, fontWeight: 700, color: INK, margin: 0, letterSpacing: '-0.02em' }}>Today's Appointments</h3>
              <span style={{ fontSize: 12, color: INK, fontWeight: 700, backgroundColor: '#f3f4f6', padding: '5px 13px', borderRadius: 999 }}>
                {appointments.filter(a => a.status === 'scheduled').length} scheduled
              </span>
            </div>
            {appointments.filter(a => a.date === '2024-05-21').slice(0, 5).map(appt => (
              <div key={appt.id} style={{ display: 'flex', alignItems: 'center', gap: 14, padding: '12px 14px', borderRadius: 14, border: `1px solid #f4f5f7`, marginBottom: 8, backgroundColor: '#fafbfc' }}>
                <div style={{ textAlign: 'center', minWidth: 42 }}>
                  <p style={{ fontSize: 16, fontWeight: 800, color: INK, margin: 0, letterSpacing: '-0.02em' }}>{appt.time.split(':')[0]}</p>
                  <p style={{ fontSize: 10, color: FAINT, margin: 0, fontWeight: 600 }}>{appt.time.includes('AM') ? 'AM' : 'PM'}</p>
                </div>
                <div style={{ width: 1, height: 30, backgroundColor: LINE }} />
                <div style={{ flex: 1, minWidth: 0 }}>
                  <p style={{ fontSize: 13, fontWeight: 700, color: INK, margin: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{appt.title}</p>
                  <p style={{ fontSize: 11.5, color: MUTED, margin: '2px 0 0' }}>{appt.contactName} · {appt.type}</p>
                </div>
                <span style={{
                  padding: '4px 11px', borderRadius: 999, fontSize: 10.5, fontWeight: 700, flexShrink: 0,
                  backgroundColor: appt.status === 'completed' ? '#eefbe7' : appt.status === 'cancelled' ? '#fdeeee' : '#eef4fe',
                  color: appt.status === 'completed' ? '#3f9142' : appt.status === 'cancelled' ? '#c0392b' : '#2563eb',
                }}>
                  {appt.status}
                </span>
              </div>
            ))}
            {appointments.filter(a => a.date === '2024-05-21').length === 0 && (
              <div style={{ textAlign: 'center', padding: '36px 16px' }}>
                <div style={{ width: 56, height: 56, borderRadius: 18, backgroundColor: '#f3f4f6', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 10px' }}>
                  <CalendarCheck size={24} color={FAINT} />
                </div>
                <p style={{ fontSize: 13, margin: 0, color: MUTED, fontWeight: 500 }}>No appointments today</p>
              </div>
            )}
          </div>
        </div>

      </div>
    </div>
  );
}
