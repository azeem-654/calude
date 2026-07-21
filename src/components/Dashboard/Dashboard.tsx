import { useState, useEffect, useRef } from 'react';
import {
  MessageSquare, Mail, ShoppingBag, CornerUpLeft,
  Check, CheckCheck, Calendar as CalIcon, Plus, Share2,
  MoreHorizontal, Star, TrendingUp, TrendingDown, Lightbulb,
  AlertTriangle, ArrowRight, Zap, Rocket,
} from 'lucide-react';
import { PieChart, Pie, Cell, ResponsiveContainer, AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip } from 'recharts';
import { useNavigate } from 'react-router-dom';
import Header from '../Layout/Header';
import { useApp } from '../../context/AppContext';
import { isEmailConfigured } from '../../services/emailService';
import { loadOnboarding } from '../../services/onboarding';
import OnboardingWizard from '../Onboarding/OnboardingWizard';
import ContentPipelineCard from '../Onboarding/ContentPipelineCard';
import type { Deal } from '../../types';

/* ── Animated count-up ── */
function useCountUp(target: number, duration = 1000): number {
  const [val, setVal] = useState(0);
  useEffect(() => {
    let raf = 0;
    const start = performance.now();
    const tick = (now: number) => {
      const p = Math.min(1, (now - start) / duration);
      const eased = 1 - Math.pow(1 - p, 3);
      setVal(Math.round(target * eased));
      if (p < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [target, duration]);
  return val;
}

/* ═══ SugarCRM Customer-Journey design tokens ═══ */
const INK = '#17191c';
const MUTED = '#8a8f98';
const RED = '#e5484d';
const BLUE = '#3e63dd';
const GREEN = '#3f9142';
const FROST: React.CSSProperties = { backgroundColor: 'rgba(255,255,255,0.55)', borderRadius: 24, padding: 20 };
const CARD: React.CSSProperties = { backgroundColor: '#fff', borderRadius: 18, boxShadow: '0 1px 2px rgba(23,25,28,0.05)' };

const TEAM = [
  { name: 'John Doe', img: 12, badge: 2, badgeColor: BLUE },
  { name: 'Maria Kim', img: 47, badge: 3, badgeColor: BLUE },
  { name: 'Alex Ray', img: 33, badge: 2, badgeColor: RED },
  { name: 'Sara Lee', img: 26, badge: 1, badgeColor: RED },
  { name: 'Tom Fox', img: 59, badge: 0, badgeColor: BLUE },
  { name: 'Nina Park', img: 44, badge: 1, badgeColor: RED },
  { name: 'Omar Diaz', img: 68, badge: 0, badgeColor: BLUE },
  { name: 'Amy Wu', img: 24, badge: 0, badgeColor: BLUE },
];

/* ── Photo avatar with initials fallback ── */
function Avatar({ img, name, size = 40 }: { img: number; name: string; size?: number }) {
  const initials = name.split(' ').map(w => w[0]).join('').slice(0, 2);
  return (
    <div style={{
      width: size, height: size, borderRadius: 999, overflow: 'hidden', position: 'relative', flexShrink: 0,
      background: 'linear-gradient(135deg,#c7cdd6,#9aa2ad)',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      color: '#fff', fontSize: size * 0.34, fontWeight: 700,
      boxShadow: '0 1px 3px rgba(23,25,28,0.12)',
    }}>
      <span>{initials}</span>
      <img src={`https://i.pravatar.cc/${size * 2}?img=${img}`} alt=""
        style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover' }}
        onError={e => { (e.currentTarget as HTMLImageElement).style.display = 'none'; }} />
    </div>
  );
}

/* ── Team avatar row with count badges ── */
function TeamRow() {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
      {TEAM.map(m => (
        <div key={m.name} style={{ position: 'relative' }} title={m.name}>
          <Avatar img={m.img} name={m.name} size={42} />
          <span style={{
            position: 'absolute', bottom: -2, right: -2, minWidth: 17, height: 17, borderRadius: 999,
            backgroundColor: m.badge > 0 ? m.badgeColor : '#fff',
            color: m.badge > 0 ? '#fff' : INK,
            fontSize: 9.5, fontWeight: 800, display: 'flex', alignItems: 'center', justifyContent: 'center',
            border: '2px solid #e9ebee', padding: '0 3px', boxSizing: 'border-box',
          }}>
            {m.badge > 0 ? m.badge : '+'}
          </span>
        </div>
      ))}
    </div>
  );
}

/* ── Journey task row (avatar + label + checks + calendar chip) ── */
function JourneyTask({ deal, avatarSeed, done }: { deal: { title: string; contactName?: string }; avatarSeed: number; done?: boolean }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '9px 4px' }}>
      <Avatar img={avatarSeed} name={deal.contactName || deal.title} size={34} />
      <span style={{ flex: 1, fontSize: 12.5, fontWeight: 600, color: INK, lineHeight: 1.35, minWidth: 0, overflow: 'hidden', display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical' }}>
        {deal.title}
      </span>
      {done
        ? <CheckCheck size={15} color={INK} strokeWidth={2.2} style={{ flexShrink: 0 }} />
        : <MoreHorizontal size={15} color={MUTED} style={{ flexShrink: 0 }} />}
      <button style={{
        width: 30, height: 30, borderRadius: 999, border: '1px solid #ecedf0', backgroundColor: '#fff',
        display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', flexShrink: 0, color: INK,
      }}>
        <CalIcon size={13} strokeWidth={2} />
      </button>
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
  message: { icon: MessageSquare, color: BLUE,  bg: '#eceff9', label: 'Message' },
  order:   { icon: ShoppingBag,   color: GREEN, bg: '#e9f4e6', label: 'Order' },
  email:   { icon: Mail,          color: '#8b5cf6', bg: '#f1edfb', label: 'Email' },
  reply:   { icon: CornerUpLeft,  color: RED,   bg: '#fceaea', label: 'Team reply' },
} as const;

const FALLBACK_NAMES = ['Emily Chen', 'Robert Martinez', 'Sarah Johnson', 'Mike Davis', 'Lisa Wong', 'James Carter', 'Ana Silva', 'Tom Becker'];
const TEAM_NAMES = ['John', 'Maria', 'Alex'];

function makeEvent(id: number, names: string[]): FeedEvent {
  const name = names[Math.floor(Math.random() * names.length)];
  const type = (['message', 'order', 'email', 'reply'] as const)[Math.floor(Math.random() * 4)];
  const text =
    type === 'message' ? ['sent you a new message', 'asked about pricing', 'replied in the chat'][Math.floor(Math.random() * 3)] :
    type === 'order'   ? `placed an order — $${(Math.floor(Math.random() * 46) + 3) * 100}` :
    type === 'email'   ? ['opened your campaign email', 'clicked a campaign link', 'subscribed to the newsletter'][Math.floor(Math.random() * 3)] :
    `got a reply from ${TEAM_NAMES[Math.floor(Math.random() * TEAM_NAMES.length)]} on the team`;
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
        setEvents(prev => [e, ...prev.map(p => ({ ...p, fresh: false }))].slice(0, 6));
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
      style={{ ...FROST, display: 'flex', flexDirection: 'column', minHeight: 0 }}
      onMouseEnter={() => { hoverRef.current = true; }}
      onMouseLeave={() => { hoverRef.current = false; }}
    >
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', margin: '2px 4px 12px' }}>
        <h3 style={{ fontSize: 16, fontWeight: 800, color: INK, margin: 0, letterSpacing: '-0.02em' }}>Live Activity</h3>
        <span style={{
          display: 'flex', alignItems: 'center', gap: 6, padding: '6px 13px', borderRadius: 999,
          backgroundColor: INK, fontSize: 10, fontWeight: 800, color: '#fff', letterSpacing: '0.1em',
        }}>
          <span style={{ width: 6, height: 6, borderRadius: 999, backgroundColor: '#6ee76e', animation: 'pulse-dot 1.6s ease-in-out infinite' }} />
          LIVE
        </span>
      </div>

      <div style={{ ...CARD, padding: '6px 14px', flex: 1 }}>
        {events.map((e, i) => {
          const meta = FEED_META[e.type];
          const Icon = meta.icon;
          return (
            <div key={e.id} style={{
              display: 'flex', alignItems: 'center', gap: 11, padding: '10px 0',
              borderBottom: i < events.length - 1 ? '1px solid #f2f3f5' : 'none',
              animation: e.fresh ? 'feed-in 0.45s cubic-bezier(0.16,1,0.3,1)' : undefined,
            }}>
              <div style={{
                width: 34, height: 34, borderRadius: 999, backgroundColor: meta.bg,
                display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
              }}>
                <Icon size={14} color={meta.color} strokeWidth={2.2} />
              </div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <p style={{ fontSize: 12.5, color: INK, margin: 0, lineHeight: 1.4, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  <span style={{ fontWeight: 700 }}>{e.actor}</span>{' '}
                  <span style={{ color: '#5c6066' }}>{e.text}</span>
                </p>
                <p style={{ fontSize: 10.5, color: MUTED, margin: '2px 0 0', fontWeight: 500 }}>
                  {meta.label} · {relTime(e.ts, now)}
                </p>
              </div>
              {e.fresh && <span style={{ width: 6, height: 6, borderRadius: 999, backgroundColor: meta.color, flexShrink: 0 }} />}
            </div>
          );
        })}
      </div>
    </div>
  );
}

/* ── Donut journey card (Executed / Active — like the shot) ── */
function JourneyDonut({ label, value, total, color }: { label: string; value: number; total: number; color: string }) {
  const animValue = useCountUp(value, 1100);
  const data = [{ v: value }, { v: Math.max(total - value, 0.0001) }];
  return (
    <div style={{ flex: 1, textAlign: 'center', position: 'relative' }}>
      <div style={{ position: 'relative', height: 120 }}>
        <ResponsiveContainer width="100%" height={120}>
          <PieChart>
            <Pie data={data} dataKey="v" cx="50%" cy="50%" innerRadius={38} outerRadius={54} startAngle={90} endAngle={-270} strokeWidth={0} animationDuration={1100}>
              <Cell fill={color} />
              <Cell fill="#eceef1" />
            </Pie>
          </PieChart>
        </ResponsiveContainer>
        <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <span style={{ fontSize: 22, fontWeight: 800, color: INK, letterSpacing: '-0.02em' }}>{animValue}</span>
        </div>
      </div>
      <span style={{ fontSize: 12, fontWeight: 700, color: INK }}>{label}</span>
    </div>
  );
}

/* ── Status chip ── */
function StatusChip({ status }: { status: string }) {
  const map: Record<string, { bg: string; color: string }> = {
    executed: { bg: '#e2f5dc', color: GREEN },
    scheduled: { bg: '#fdeeda', color: '#c77414' },
    active: { bg: '#eceff9', color: BLUE },
    pending: { bg: '#f0f1f3', color: MUTED },
  };
  const c = map[status.toLowerCase()] ?? map.pending;
  return (
    <span style={{ padding: '4px 12px', borderRadius: 999, fontSize: 10.5, fontWeight: 700, backgroundColor: c.bg, color: c.color, textTransform: 'capitalize' }}>
      {status}
    </span>
  );
}

/* ── Scrolling KPI ticker ── */
interface TickerItem { label: string; value: string; delta?: number }

function Ticker({ items }: { items: TickerItem[] }) {
  const row = (keyPrefix: string) => items.map((it, i) => (
    <div key={`${keyPrefix}-${i}`} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '0 26px', flexShrink: 0 }}>
      <span style={{ fontSize: 11, fontWeight: 600, color: MUTED, textTransform: 'uppercase', letterSpacing: '0.06em', whiteSpace: 'nowrap' }}>{it.label}</span>
      <span style={{ fontSize: 13.5, fontWeight: 800, color: INK, letterSpacing: '-0.01em', whiteSpace: 'nowrap' }}>{it.value}</span>
      {it.delta !== undefined && (
        <span style={{
          display: 'flex', alignItems: 'center', gap: 2, fontSize: 10.5, fontWeight: 700,
          color: it.delta >= 0 ? GREEN : RED, whiteSpace: 'nowrap',
        }}>
          {it.delta >= 0 ? <TrendingUp size={11} /> : <TrendingDown size={11} />}
          {Math.abs(it.delta)}%
        </span>
      )}
      <span style={{ width: 4, height: 4, borderRadius: 999, backgroundColor: '#d5d8dd', marginLeft: 18 }} />
    </div>
  ));
  return (
    <div style={{ backgroundColor: '#fff', borderRadius: 999, overflow: 'hidden', boxShadow: '0 1px 2px rgba(23,25,28,0.05)', padding: '11px 0', position: 'relative' }}>
      <div className="ticker-track">
        {row('a')}{row('b')}
      </div>
      {/* Edge fades */}
      <div style={{ position: 'absolute', inset: '0 auto 0 0', width: 46, background: 'linear-gradient(90deg,#fff,transparent)', borderRadius: '999px 0 0 999px', pointerEvents: 'none' }} />
      <div style={{ position: 'absolute', inset: '0 0 0 auto', width: 46, background: 'linear-gradient(270deg,#fff,transparent)', borderRadius: '0 999px 999px 0', pointerEvents: 'none' }} />
    </div>
  );
}

/* ── Expected business growth (history + projection) ── */
function GrowthForecast({ history, growthPct }: { history: { m: string; v: number }[]; growthPct: number }) {
  const animPct = useCountUp(growthPct, 1200);
  const last = history[history.length - 1]?.v ?? 30000;
  const futureMonths = ['Next mo.', '+2 mo.', '+3 mo.'];
  const monthly = growthPct / 100 / 3;
  const data = [
    ...history.map(h => ({ m: h.m, actual: h.v, forecast: null as number | null })),
    ...futureMonths.map((m, i) => ({
      m, actual: null as number | null,
      forecast: Math.round(last * Math.pow(1 + monthly, i + 1)),
    })),
  ];
  // connect the two series at the seam
  data[history.length - 1].forecast = last;
  const projectedQuarter = futureMonths.reduce((s, _, i) => s + last * Math.pow(1 + monthly, i + 1), 0);
  const animProjected = useCountUp(Math.round(projectedQuarter / 1000), 1200);

  return (
    <div style={FROST}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', margin: '2px 4px 14px' }}>
        <div>
          <h3 style={{ fontSize: 16, fontWeight: 800, color: INK, margin: 0, letterSpacing: '-0.02em' }}>Expected Business Growth</h3>
          <p style={{ fontSize: 12, color: MUTED, margin: '3px 0 0' }}>Revenue history + projected next quarter</p>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <div style={{ backgroundColor: INK, borderRadius: 14, padding: '9px 16px', textAlign: 'center' }}>
            <div style={{ fontSize: 19, fontWeight: 800, color: '#c7f441', letterSpacing: '-0.02em', display: 'flex', alignItems: 'center', gap: 4 }}>
              <Rocket size={14} /> +{animPct}%
            </div>
            <div style={{ fontSize: 9.5, color: 'rgba(255,255,255,0.55)', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.06em' }}>Growth</div>
          </div>
          <div style={{ backgroundColor: '#fff', borderRadius: 14, padding: '9px 16px', textAlign: 'center', boxShadow: '0 1px 2px rgba(23,25,28,0.05)' }}>
            <div style={{ fontSize: 19, fontWeight: 800, color: INK, letterSpacing: '-0.02em' }}>${animProjected}k</div>
            <div style={{ fontSize: 9.5, color: MUTED, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.06em' }}>Next quarter</div>
          </div>
        </div>
      </div>
      <div style={{ ...CARD, padding: '16px 8px 6px' }}>
        <ResponsiveContainer width="100%" height={200}>
          <AreaChart data={data} margin={{ top: 4, right: 10, left: -14, bottom: 0 }}>
            <defs>
              <linearGradient id="gActual" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor={INK} stopOpacity={0.15} />
                <stop offset="95%" stopColor={INK} stopOpacity={0} />
              </linearGradient>
              <linearGradient id="gForecast" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor="#7bb026" stopOpacity={0.22} />
                <stop offset="95%" stopColor="#7bb026" stopOpacity={0} />
              </linearGradient>
            </defs>
            <CartesianGrid strokeDasharray="2 6" stroke="#eceef1" vertical={false} />
            <XAxis dataKey="m" tick={{ fontSize: 10.5, fill: '#b0b4ba' }} axisLine={false} tickLine={false} dy={6} />
            <YAxis tick={{ fontSize: 10.5, fill: '#b0b4ba' }} axisLine={false} tickLine={false} tickFormatter={v => `$${Math.round(Number(v) / 1000)}k`} />
            <Tooltip
              formatter={(v, name) => [`$${Number(v).toLocaleString()}`, name === 'actual' ? 'Revenue' : 'Projected']}
              contentStyle={{ borderRadius: 14, border: '1px solid #ecedf0', fontSize: 12, boxShadow: '0 12px 32px -8px rgba(23,25,28,0.14)' }}
            />
            <Area type="monotone" dataKey="actual" stroke={INK} strokeWidth={2.5} fill="url(#gActual)" dot={false} connectNulls={false} />
            <Area type="monotone" dataKey="forecast" stroke="#7bb026" strokeWidth={2.5} strokeDasharray="7 5" fill="url(#gForecast)" dot={false} connectNulls={false}
              activeDot={{ r: 5, fill: '#c7f441', stroke: '#7bb026', strokeWidth: 2 }} />
          </AreaChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}

/* ── Business tips & flaws carousel ── */
export interface Insight {
  kind: 'flaw' | 'tip' | 'growth';
  title: string;
  desc: string;
  action?: { label: string; path: string };
}

const KIND_META = {
  flaw:   { icon: AlertTriangle, label: 'Flaw detected', bg: '#fceaea', color: RED },
  tip:    { icon: Lightbulb,     label: 'Business tip',  bg: '#eceff9', color: BLUE },
  growth: { icon: Rocket,        label: 'Growth move',   bg: '#eef7e2', color: '#5a9116' },
} as const;

function InsightsCarousel({ insights }: { insights: Insight[] }) {
  const [idx, setIdx] = useState(0);
  const hoverRef = useRef(false);
  const navigate = useNavigate();

  useEffect(() => {
    const t = setInterval(() => {
      if (!hoverRef.current) setIdx(i => (i + 1) % insights.length);
    }, 6000);
    return () => clearInterval(t);
  }, [insights.length]);

  if (insights.length === 0) return null;
  const ins = insights[idx % insights.length];
  const meta = KIND_META[ins.kind];
  const Icon = meta.icon;

  return (
    <div
      style={{ ...FROST, display: 'flex', flexDirection: 'column' }}
      onMouseEnter={() => { hoverRef.current = true; }}
      onMouseLeave={() => { hoverRef.current = false; }}
    >
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', margin: '2px 4px 12px' }}>
        <h3 style={{ fontSize: 16, fontWeight: 800, color: INK, margin: 0, letterSpacing: '-0.02em' }}>Tips & Flaws</h3>
        <span style={{ fontSize: 11, fontWeight: 700, color: MUTED, backgroundColor: '#fff', borderRadius: 999, padding: '4px 12px', boxShadow: '0 1px 2px rgba(23,25,28,0.05)' }}>
          {idx % insights.length + 1} / {insights.length}
        </span>
      </div>

      <div key={idx} style={{ ...CARD, padding: '20px 20px 16px', flex: 1, display: 'flex', flexDirection: 'column', animation: 'insight-in 0.4s cubic-bezier(0.16,1,0.3,1)' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12 }}>
          <div style={{ width: 34, height: 34, borderRadius: 999, backgroundColor: meta.bg, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <Icon size={15} color={meta.color} strokeWidth={2.2} />
          </div>
          <span style={{ fontSize: 10.5, fontWeight: 800, color: meta.color, textTransform: 'uppercase', letterSpacing: '0.08em' }}>{meta.label}</span>
        </div>
        <h4 style={{ fontSize: 15, fontWeight: 700, color: INK, margin: '0 0 6px', letterSpacing: '-0.01em', lineHeight: 1.35 }}>{ins.title}</h4>
        <p style={{ fontSize: 12.5, color: '#5c6066', margin: 0, lineHeight: 1.55, flex: 1 }}>{ins.desc}</p>
        {ins.action && (
          <button
            onClick={() => navigate(ins.action!.path)}
            style={{
              alignSelf: 'flex-start', marginTop: 14, display: 'flex', alignItems: 'center', gap: 6,
              padding: '8px 16px', borderRadius: 999, border: 'none', cursor: 'pointer',
              backgroundColor: INK, color: '#fff', fontSize: 12, fontWeight: 700,
            }}>
            {ins.action.label} <ArrowRight size={12} />
          </button>
        )}
      </div>

      {/* Dots */}
      <div style={{ display: 'flex', justifyContent: 'center', gap: 5, marginTop: 12 }}>
        {insights.map((_, i) => (
          <button key={i} onClick={() => setIdx(i)}
            style={{
              width: i === idx % insights.length ? 18 : 6, height: 6, borderRadius: 999, border: 'none', cursor: 'pointer',
              backgroundColor: i === idx % insights.length ? INK : '#cfd3d9', padding: 0,
              transition: 'width 0.25s ease, background-color 0.25s ease',
            }} />
        ))}
      </div>
    </div>
  );
}

/* ── Main dashboard ── */
export default function Dashboard() {
  const { contacts, pipelines, appointments, reviews, campaigns } = useApp();

  /* ── AI onboarding wizard (auto-opens for un-configured accounts) ── */
  const [wizardOpen, setWizardOpen] = useState(false);
  const [obRefresh, setObRefresh] = useState(0);
  useEffect(() => {
    const ob = loadOnboarding();
    if (!ob.completed && !ob.skipped) setWizardOpen(true);
  }, []);

  const pipelineStages = pipelines[0]?.stages ?? [];
  const allDeals: Deal[] = pipelineStages.flatMap(s => s.deals);

  /* Journey columns from real pipeline stages (demo rows if empty) */
  const DEMO_COLS = [
    { name: 'Lead Capture', deals: [{ title: 'Qualify inbound lead', contactName: 'Emily Chen' }, { title: 'Acknowledge new enquiry', contactName: 'Tom Becker' }] },
    { name: 'Qualification', deals: [{ title: 'Identify budget range', contactName: 'Sarah Johnson' }, { title: 'Identify decision maker', contactName: 'Mike Davis' }, { title: 'Map pain points', contactName: 'Ana Silva' }] },
    { name: 'Proposal', deals: [{ title: 'Estimate delivery time', contactName: 'James Carter' }, { title: 'Send pricing proposal', contactName: 'Lisa Wong' }, { title: 'Review contract terms', contactName: 'Robert Martinez' }] },
    { name: 'Closing', deals: [{ title: 'Final negotiation call', contactName: 'Emily Chen' }, { title: 'Customer satisfaction check', contactName: 'Sara Lee' }] },
  ];
  const journeyCols = pipelineStages.length >= 2 && allDeals.length > 0
    ? pipelineStages.slice(0, 4).map(s => ({ name: s.name, deals: s.deals.slice(0, 3).map(d => ({ title: d.title, contactName: d.contactName })) }))
    : DEMO_COLS;

  /* Black accent card = biggest active deal (or demo) */
  const topDeal = [...allDeals].filter(d => (d.status ?? 'active') === 'active').sort((a, b) => b.value - a.value)[0];
  const accent = topDeal ? { title: topDeal.title, value: topDeal.value } : { title: 'Request Processing', value: 48000 };

  /* Knowledge table rows from deals (or demo) */
  const tableRows = (allDeals.length > 0
    ? allDeals.slice(0, 4).map(d => ({
        subject: d.title,
        status: d.status === 'won' ? 'executed' : d.status === 'lost' ? 'pending' : 'active',
        start: new Date(d.createdAt).toLocaleDateString(undefined, { month: 'short', day: 'numeric' }),
        end: d.expectedClose ? new Date(d.expectedClose).toLocaleDateString(undefined, { month: 'short', day: 'numeric' }) : '—',
        user: d.assignedTo || d.contactName || '—',
      }))
    : [
        { subject: 'Design Sprint', status: 'executed', start: 'Sep 30', end: 'Oct 1', user: 'Sam Frank' },
        { subject: 'Meeting Lead', status: 'scheduled', start: 'Oct 1', end: 'Oct 1', user: 'Nikki Olay' },
        { subject: 'Quote Follow-up', status: 'active', start: 'Oct 2', end: 'Oct 4', user: 'John Doe' },
        { subject: 'Renewal Review', status: 'pending', start: 'Oct 3', end: 'Oct 8', user: 'Maria Kim' },
      ]
  );

  const wonCount = allDeals.filter(d => d.status === 'won').length || 5;
  const activeCount = allDeals.filter(d => (d.status ?? 'active') === 'active').length || 7;
  const lostCount = allDeals.filter(d => d.status === 'lost').length;
  const winRate = wonCount + lostCount > 0 ? Math.round((wonCount / (wonCount + lostCount)) * 100) : 42;
  const pipelineValue = allDeals.filter(d => (d.status ?? 'active') === 'active').reduce((s, d) => s + d.value, 0) || 284000;
  const wonValue = allDeals.filter(d => d.status === 'won').reduce((s, d) => s + d.value, 0) || 47000;

  const feedNames = contacts.length >= 3 ? contacts.slice(0, 12).map(c => c.name) : FALLBACK_NAMES;
  const scheduledToday = appointments.filter(a => a.status === 'scheduled').length;
  const animWinRate = useCountUp(Math.round((wonCount / Math.max(wonCount + activeCount, 1)) * 100), 1200);

  /* ── Ticker items ── */
  const tickerItems: TickerItem[] = [
    { label: 'Pipeline', value: `$${(pipelineValue / 1000).toFixed(0)}k`, delta: 23 },
    { label: 'Won revenue', value: `$${(wonValue / 1000).toFixed(0)}k`, delta: 18 },
    { label: 'Win rate', value: `${winRate}%`, delta: winRate >= 40 ? 6 : -4 },
    { label: 'Contacts', value: String(contacts.length || 248), delta: 12 },
    { label: 'Active deals', value: String(activeCount), delta: 8 },
    { label: 'Appointments', value: String(scheduledToday || 9), delta: -5 },
    { label: 'Emails sent', value: '12.4k', delta: 9 },
    { label: 'Avg response', value: '2h 14m', delta: 11 },
  ];

  /* ── Growth history (won revenue by month, demo fallback) ── */
  const MONTH_NAMES = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  const nowMonth = new Date().getMonth();
  const historyMonths = Array.from({ length: 6 }, (_, i) => (nowMonth - 5 + i + 12) % 12);
  const realByMonth = new Map<number, number>();
  allDeals.forEach(d => {
    if (d.status === 'won' && d.closedAt) {
      const m = new Date(d.closedAt).getMonth();
      realByMonth.set(m, (realByMonth.get(m) ?? 0) + d.value);
    }
  });
  const hasRealHistory = [...realByMonth.values()].filter(v => v > 0).length >= 2;
  const DEMO_CURVE = [21000, 24500, 23000, 29500, 33000, 38500];
  const growthHistory = historyMonths.map((m, i) => ({
    m: MONTH_NAMES[m],
    v: hasRealHistory ? (realByMonth.get(m) ?? 0) : DEMO_CURVE[i],
  }));
  const growthPct = Math.min(34, Math.max(5, Math.round(
    ((growthHistory[5].v - growthHistory[0].v) / Math.max(growthHistory[0].v, 1)) * 100 / 2
  )));

  /* ── Insights: flaws & tips computed from real data ── */
  const idleDeals = allDeals.filter(d =>
    (d.status ?? 'active') === 'active' &&
    (Date.now() - new Date(d.lastStageChangedAt ?? d.createdAt).getTime()) / 86_400_000 > 14
  ).length;
  const unrepliedReviews = reviews.filter(r => !r.replied).length;
  const untaggedPct = contacts.length > 0 ? Math.round((contacts.filter(c => c.tags.length === 0).length / contacts.length) * 100) : 0;
  const draftCampaigns = campaigns.filter(c => c.status === 'draft').length;
  let hasAutomations = false;
  try { hasAutomations = (JSON.parse(localStorage.getItem('crm_pipeline_automations') || '[]') as unknown[]).length > 0; } catch { /* ignore */ }

  const insights: Insight[] = [];
  if (!isEmailConfigured()) insights.push({
    kind: 'flaw', title: 'Email sending is not configured',
    desc: 'Your campaigns and sequences can\'t reach inboxes yet. Connect SMTP or an email provider — it takes about 2 minutes.',
    action: { label: 'Set up email', path: '/settings' },
  });
  if (idleDeals > 0) insights.push({
    kind: 'flaw', title: `${idleDeals} deal${idleDeals > 1 ? 's are' : ' is'} going stale`,
    desc: `Deals sitting in a stage for 14+ days close 60% less often. Add an idle-deal automation so nothing slips through the cracks.`,
    action: { label: 'Review pipeline', path: '/pipelines' },
  });
  if (winRate < 40 && wonCount + lostCount >= 3) insights.push({
    kind: 'flaw', title: `Win rate is ${winRate}% — below the 40% benchmark`,
    desc: 'Qualify harder before quoting: verify budget, decision maker, and timeline on the first call to cut losses early.',
    action: { label: 'See lost deals', path: '/pipelines' },
  });
  if (unrepliedReviews > 0) insights.push({
    kind: 'flaw', title: `${unrepliedReviews} review${unrepliedReviews > 1 ? 's' : ''} still unanswered`,
    desc: 'Businesses that reply to every review earn 12% more repeat customers. Even a two-line thank-you moves the needle.',
    action: { label: 'Reply now', path: '/reputation' },
  });
  if (untaggedPct > 50 && contacts.length >= 5) insights.push({
    kind: 'tip', title: `${untaggedPct}% of contacts have no tags`,
    desc: 'Tagged contacts can be segmented into targeted campaigns — targeted emails get 2-3× the open rate of blasts.',
    action: { label: 'Tag contacts', path: '/contacts' },
  });
  if (!hasAutomations) insights.push({
    kind: 'tip', title: 'Put your pipeline on autopilot',
    desc: 'You haven\'t created any automations yet. Auto-flag stale deals, auto-set priorities, and get alerts on big opportunities.',
    action: { label: 'Create a rule', path: '/pipelines' },
  });
  if (draftCampaigns > 0) insights.push({
    kind: 'tip', title: `${draftCampaigns} campaign${draftCampaigns > 1 ? 's' : ''} still in draft`,
    desc: 'Money loves speed — a finished-but-unsent campaign earns nothing. Review and launch, or schedule it for the best send window (Tue–Thu, 10am).',
    action: { label: 'Open campaigns', path: '/marketing' },
  });
  insights.push(
    {
      kind: 'growth', title: 'Reply to new leads within 5 minutes',
      desc: 'Leads contacted within 5 minutes are 21× more likely to convert than after 30 minutes. Watch the Live Activity feed and pounce.',
      action: { label: 'Open conversations', path: '/conversations' },
    },
    {
      kind: 'growth', title: 'Ask every happy customer for a review',
      desc: 'A steady stream of 5-star reviews compounds: each +0.1 rating lifts conversion ~5%. Automate the ask right after a won deal.',
      action: { label: 'Reputation hub', path: '/reputation' },
    },
    {
      kind: 'growth', title: 'Follow up at least 5 times',
      desc: '80% of sales need 5+ touches, yet most reps stop after 2. Use a 5-step email sequence with 2-3 day gaps to stay top of mind.',
      action: { label: 'Build a sequence', path: '/marketing' },
    },
  );

  let avatarSeed = 5;

  return (
    <div style={{ minHeight: '100vh', paddingBottom: 32 }}>
      <Header title="Customer Journeys" subtitle={`Welcome back, John — ${scheduledToday || 9} appointments scheduled, ${activeCount} deals in motion.`} />

      <div style={{ padding: '14px 28px 0', display: 'flex', flexDirection: 'column', gap: 16 }}>

        {/* ── KPI ticker ── */}
        <div className="slide-up" style={{ animationDelay: '0.02s' }}>
          <Ticker items={tickerItems} />
        </div>

        {/* ── 12-month content pipeline / AI setup ── */}
        <div className="slide-up" style={{ animationDelay: '0.05s' }}>
          <ContentPipelineCard onSetup={() => setWizardOpen(true)} refreshKey={obRefresh} />
        </div>

        {/* ── Journey board ── */}
        <div className="slide-up" style={{ ...FROST, animationDelay: '0.08s' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', margin: '2px 4px 16px' }}>
            <h3 style={{ fontSize: 16, fontWeight: 800, color: INK, margin: 0, letterSpacing: '-0.02em' }}>New Deal Management</h3>
            <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
              <TeamRow />
              <div style={{ display: 'flex', gap: 8 }}>
                {[Plus, Share2, CalIcon].map((I, i) => (
                  <button key={i} style={{ width: 36, height: 36, borderRadius: 999, border: 'none', backgroundColor: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', color: INK, boxShadow: '0 1px 2px rgba(23,25,28,0.06)' }}>
                    <I size={14} strokeWidth={2.2} />
                  </button>
                ))}
              </div>
            </div>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1.15fr 1.15fr 1fr', gap: 14, alignItems: 'start' }}>
            {journeyCols.map((col, ci) => (
              <div key={col.name}>
                <div style={{ ...CARD, padding: '8px 12px' }}>
                  {col.deals.length === 0 && (
                    <p style={{ fontSize: 12, color: MUTED, textAlign: 'center', padding: '18px 0', margin: 0 }}>No deals here yet</p>
                  )}
                  {col.deals.map((d, di) => (
                    <div key={di} style={{ borderBottom: di < col.deals.length - 1 ? '1px solid #f2f3f5' : 'none' }}>
                      <JourneyTask deal={d} avatarSeed={(avatarSeed += 7) % 70} done={ci < 2} />
                    </div>
                  ))}
                </div>

                {/* Black accent card in the last column (like "Request Processing") */}
                {ci === journeyCols.length - 1 && (
                  <div style={{
                    marginTop: 12, backgroundColor: INK, borderRadius: 18, padding: '16px 18px',
                    color: '#fff', boxShadow: '0 12px 28px -8px rgba(23,25,28,0.4)',
                  }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 8 }}>
                      <span style={{ fontSize: 13, fontWeight: 700, lineHeight: 1.35 }}>{accent.title}</span>
                      <Star size={13} color="#c7f441" fill="#c7f441" style={{ flexShrink: 0, marginTop: 2 }} />
                    </div>
                    <p style={{ fontSize: 20, fontWeight: 800, margin: '8px 0 0', letterSpacing: '-0.02em' }}>${accent.value.toLocaleString()}</p>
                    <p style={{ fontSize: 10.5, color: 'rgba(255,255,255,0.55)', margin: '2px 0 0', fontWeight: 500 }}>Top opportunity — needs attention</p>
                  </div>
                )}

                <p style={{ textAlign: 'center', fontSize: 12, fontWeight: 600, color: '#5c6066', margin: '12px 0 0' }}>{col.name}</p>
              </div>
            ))}
          </div>
        </div>

        {/* ── Growth forecast + Tips & Flaws ── */}
        <div className="slide-up" style={{ display: 'grid', gridTemplateColumns: '1.6fr 1fr', gap: 16, alignItems: 'stretch', animationDelay: '0.14s' }}>
          <GrowthForecast history={growthHistory} growthPct={growthPct} />
          <InsightsCarousel insights={insights} />
        </div>

        {/* ── Bottom row: Live Activity | Knowledge table | Donut journey ── */}
        <div className="slide-up" style={{ display: 'grid', gridTemplateColumns: '1.1fr 1.25fr 0.85fr', gap: 16, alignItems: 'stretch', animationDelay: '0.2s' }}>

          <LiveFeed names={feedNames} />

          {/* Suggested Knowledge–style table */}
          <div style={FROST}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', margin: '2px 4px 12px' }}>
              <h3 style={{ fontSize: 16, fontWeight: 800, color: INK, margin: 0, letterSpacing: '-0.02em' }}>Suggested Actions</h3>
              <div style={{ display: 'flex', gap: 8 }}>
                {[Plus, Share2, CalIcon].map((I, i) => (
                  <button key={i} style={{ width: 34, height: 34, borderRadius: 999, border: 'none', backgroundColor: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', color: INK, boxShadow: '0 1px 2px rgba(23,25,28,0.06)' }}>
                    <I size={13} strokeWidth={2.2} />
                  </button>
                ))}
              </div>
            </div>
            <div style={{ ...CARD, padding: '6px 16px 10px', overflow: 'hidden' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
                <thead>
                  <tr>
                    {['Subject', 'Status', 'Start Date', 'End Date', 'Assigned User'].map(h => (
                      <th key={h} style={{ textAlign: 'left', padding: '10px 6px 8px', fontSize: 10.5, fontWeight: 600, color: MUTED, borderBottom: '1px solid #f2f3f5', whiteSpace: 'nowrap' }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {tableRows.map((r, i) => (
                    <tr key={i}>
                      <td style={{ padding: '10px 6px', fontWeight: 700, color: INK, borderBottom: i < tableRows.length - 1 ? '1px solid #f6f7f8' : 'none', display: 'flex', alignItems: 'center', gap: 7 }}>
                        <Star size={11} color="#c9ced6" /> <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: 130 }}>{r.subject}</span>
                      </td>
                      <td style={{ padding: '10px 6px', borderBottom: i < tableRows.length - 1 ? '1px solid #f6f7f8' : 'none' }}><StatusChip status={r.status} /></td>
                      <td style={{ padding: '10px 6px', color: '#5c6066', borderBottom: i < tableRows.length - 1 ? '1px solid #f6f7f8' : 'none', whiteSpace: 'nowrap' }}>{r.start}</td>
                      <td style={{ padding: '10px 6px', color: '#5c6066', borderBottom: i < tableRows.length - 1 ? '1px solid #f6f7f8' : 'none', whiteSpace: 'nowrap' }}>{r.end}</td>
                      <td style={{ padding: '10px 6px', color: INK, fontWeight: 600, borderBottom: i < tableRows.length - 1 ? '1px solid #f6f7f8' : 'none', whiteSpace: 'nowrap' }}>{r.user}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {/* Support/deal journey donuts */}
          <div style={FROST}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', margin: '2px 4px 12px' }}>
              <h3 style={{ fontSize: 16, fontWeight: 800, color: INK, margin: 0, letterSpacing: '-0.02em' }}>Deal Journey</h3>
              <button style={{ width: 34, height: 34, borderRadius: 999, border: 'none', backgroundColor: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', color: INK, boxShadow: '0 1px 2px rgba(23,25,28,0.06)' }}>
                <Share2 size={13} strokeWidth={2.2} />
              </button>
            </div>
            <div style={{ ...CARD, padding: '18px 10px', display: 'flex', gap: 4 }}>
              <JourneyDonut label="Executed" value={wonCount} total={wonCount + activeCount} color={BLUE} />
              <JourneyDonut label="Active" value={activeCount} total={wonCount + activeCount} color={RED} />
            </div>
            <div style={{ ...CARD, padding: '12px 16px', marginTop: 12, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <div>
                <p style={{ fontSize: 11, color: MUTED, margin: 0, fontWeight: 600 }}>Win rate</p>
                <p style={{ fontSize: 20, fontWeight: 800, color: INK, margin: '2px 0 0', letterSpacing: '-0.02em' }}>
                  {animWinRate}%
                </p>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 5, padding: '5px 12px', borderRadius: 999, backgroundColor: '#e2f5dc' }}>
                <Check size={11} color={GREEN} strokeWidth={3} />
                <span style={{ fontSize: 11, fontWeight: 700, color: GREEN }}>{wonCount} won</span>
              </div>
            </div>
          </div>
        </div>

      </div>

      <OnboardingWizard open={wizardOpen} onClose={() => { setWizardOpen(false); setObRefresh(k => k + 1); }} />
    </div>
  );
}
