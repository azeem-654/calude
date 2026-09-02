import { useState, useEffect, useMemo, useRef } from 'react';
import {
  MessageSquare, ShoppingBag, CornerUpLeft, UserPlus, Briefcase,
  Check, CheckCheck, Calendar as CalIcon, MoreHorizontal,
  Star, Lightbulb,
  AlertTriangle, ArrowRight, Rocket, Wand2, ChevronRight,
} from 'lucide-react';
import { PieChart, Pie, Cell, ResponsiveContainer, AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip } from 'recharts';
import { useNavigate } from 'react-router-dom';
import Header from '../Layout/Header';
import { useApp } from '../../context/AppContext';
import { isEmailConfigured } from '../../services/emailService';
import { getSession } from '../../services/auth';
import { onContentJobsChange, resumePendingGeneration, registerPublishApi } from '../../services/contentGen';
import { sendToContact } from '../../services/contactEmail';
import { runBehaviourTriggers, moveDealToStage, findDeal } from '../../services/contactDeals';
import { dueReminders, planFollowUps } from '../../services/contactScheduling';
import { runQueuePass, loadJob } from '../../services/verifyQueue';
import { runAlertCheck, checkBlacklistAlert } from '../../services/deliverabilityAlerts';
import { runWarmup } from '../../services/warmup';
import OnboardingWizard from '../Onboarding/OnboardingWizard';
import SetupChecklist from '../Onboarding/SetupChecklist';
import FlowLauncher from '../Onboarding/FlowLauncher';
import ContentPipelineCard from '../Onboarding/ContentPipelineCard';
import ProgressBoard from './ProgressBoard';
import { recentActivity, relTime, type Activity } from './activity';
import DayBoard from './DayBoard';
import KpiTile from './KpiTile';
import { buildKpis, shortMoney } from './kpis';
import { useProgressBook } from './useProgressBook';
import type { Deal } from '../../types';
import './dashboard.css';

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
const FROST: React.CSSProperties = {
  backgroundColor: 'rgba(255,255,255,0.46)',
  borderRadius: 24,
  padding: 20,
  border: '1px solid rgba(255,255,255,0.55)',
  boxShadow: '0 1px 2px rgba(23,25,28,0.03), 0 18px 44px -28px rgba(23,25,28,0.3)',
  backdropFilter: 'blur(18px)',
  WebkitBackdropFilter: 'blur(18px)',
};
/*
 * Cards are translucent now, not solid white. They sit over a drifting wash, so
 * a little of it showing through is what stops the dashboard reading as boxes
 * on grey — and the blur keeps the text on them perfectly legible.
 */
const CARD: React.CSSProperties = {
  backgroundColor: 'rgba(255,255,255,0.72)',
  borderRadius: 18,
  border: '1px solid rgba(255,255,255,0.6)',
  boxShadow: '0 1px 2px rgba(23,25,28,0.04), 0 10px 28px -18px rgba(23,25,28,0.28)',
  backdropFilter: 'blur(14px)',
  WebkitBackdropFilter: 'blur(14px)',
};

/* ── Initials avatar ──
   No stock photograph. This used to pull a face from a fake-avatar service and
   hang it on a real customer's name, which is a stranger's photograph on your
   client record. Initials over a colour derived from the name are honest,
   stable, and need no network. */
function avatarHue(name: string): number {
  let h = 0;
  for (let i = 0; i < name.length; i++) h = (h * 31 + name.charCodeAt(i)) % 360;
  return h;
}

function Avatar({ name, size = 40 }: { name: string; size?: number }) {
  const initials = name.trim().split(/\s+/).map(w => w[0]).filter(Boolean).join('').slice(0, 2).toUpperCase() || '?';
  const hue = avatarHue(name);
  return (
    <div title={name} style={{
      width: size, height: size, borderRadius: 999, flexShrink: 0,
      background: `linear-gradient(135deg, hsl(${hue} 46% 62%), hsl(${(hue + 38) % 360} 44% 48%))`,
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      color: '#fff', fontSize: size * 0.36, fontWeight: 700, letterSpacing: '-0.02em',
      boxShadow: '0 1px 3px rgba(23,25,28,0.14)',
    }}>
      <span>{initials}</span>
    </div>
  );
}

/* ── Who is carrying the deals ──
   Read off the pipeline rather than invented: one face per person deals are
   assigned to, badged with how many are still open. An unassigned pipeline
   shows nothing at all, which is the truth about it. */
function TeamRow({ owners }: { owners: { name: string; open: number }[] }) {
  if (owners.length === 0) return null;
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
      {owners.slice(0, 6).map(m => (
        <div key={m.name} style={{ position: 'relative' }}>
          <Avatar name={m.name} size={40} />
          <span
            aria-label={`${m.name}: ${m.open} open deal${m.open === 1 ? '' : 's'}`}
            style={{
              position: 'absolute', bottom: -2, right: -2, minWidth: 17, height: 17, borderRadius: 999,
              backgroundColor: m.open > 0 ? BLUE : '#fff',
              color: m.open > 0 ? '#fff' : INK,
              fontSize: 9.5, fontWeight: 800, display: 'flex', alignItems: 'center', justifyContent: 'center',
              border: '2px solid #eef0f2', padding: '0 3px', boxSizing: 'border-box',
            }}>
            {m.open}
          </span>
        </div>
      ))}
      {owners.length > 6 && (
        <span style={{ fontSize: 11.5, fontWeight: 700, color: MUTED }}>+{owners.length - 6}</span>
      )}
    </div>
  );
}

/* ── Journey task row (avatar + label + checks + calendar chip) ── */
function JourneyTask({ deal, done, onSchedule }: {
  deal: { title: string; contactName?: string };
  done?: boolean;
  /** The calendar chip had no handler — it looked like "book time on this
   *  deal" and did nothing at all. */
  onSchedule: () => void;
}) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '9px 4px' }}>
      <Avatar name={deal.contactName || deal.title} size={34} />
      <span style={{ flex: 1, fontSize: 12.5, fontWeight: 600, color: INK, lineHeight: 1.35, minWidth: 0, overflow: 'hidden', display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical' }}>
        {deal.title}
      </span>
      {done
        ? <CheckCheck size={15} color={INK} strokeWidth={2.2} style={{ flexShrink: 0 }} />
        : <MoreHorizontal size={15} color={MUTED} style={{ flexShrink: 0 }} />}
      <button
        onClick={onSchedule}
        title={`Book time for ${deal.contactName || deal.title}`}
        aria-label={`Book time for ${deal.contactName || deal.title}`}
        style={{
          width: 30, height: 30, borderRadius: 999, border: '1px solid #ecedf0', backgroundColor: '#fff',
          display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', flexShrink: 0, color: INK,
        }}>
        <CalIcon size={13} strokeWidth={2} />
      </button>
    </div>
  );
}

/* ── What has actually happened lately ──
   Real records, newest first. The clock ticks so "3m ago" stays true; the rows
   themselves only change when the workspace does. */
const FEED_META = {
  contact: { icon: UserPlus,     color: BLUE,      bg: '#eceff9', label: 'Contact' },
  deal:    { icon: Briefcase,    color: '#8b5cf6', bg: '#f1edfb', label: 'Deal' },
  won:     { icon: ShoppingBag,  color: GREEN,     bg: '#e9f4e6', label: 'Won' },
  lost:    { icon: CornerUpLeft, color: RED,       bg: '#fceaea', label: 'Lost' },
  meeting: { icon: CalIcon,      color: '#0891b2', bg: '#e4f3f7', label: 'Meeting' },
  message: { icon: MessageSquare, color: BLUE,     bg: '#eceff9', label: 'Message' },
} as const;

function LiveFeed({ items }: { items: Activity[] }) {
  const navigate = useNavigate();
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    const clock = window.setInterval(() => setNow(Date.now()), 30_000);
    return () => clearInterval(clock);
  }, []);

  return (
    <div style={{ ...FROST, display: 'flex', flexDirection: 'column', minHeight: 0 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', margin: '2px 4px 12px', gap: 10 }}>
        <h3 style={{ fontSize: 16, fontWeight: 800, color: INK, margin: 0, letterSpacing: '-0.02em' }}>Recent activity</h3>
        {items.length > 0 && (
          <span style={{
            display: 'flex', alignItems: 'center', gap: 6, padding: '6px 13px', borderRadius: 999,
            backgroundColor: INK, fontSize: 10, fontWeight: 800, color: '#fff', letterSpacing: '0.1em',
          }}>
            <span style={{ width: 6, height: 6, borderRadius: 999, backgroundColor: '#6ee76e', animation: 'pulse-dot 1.6s ease-in-out infinite' }} />
            LIVE
          </span>
        )}
      </div>

      <div style={{ ...CARD, padding: items.length ? '6px 14px' : '18px 16px', flex: 1 }}>
        {items.length === 0 ? (
          <p style={{ margin: 0, fontSize: 12.5, color: MUTED, lineHeight: 1.65 }}>
            Nothing has happened yet. Add a contact, open a deal or book a meeting and it appears here
            the moment it is saved.
          </p>
        ) : items.map((e, i) => {
          const meta = FEED_META[e.kind];
          const Icon = meta.icon;
          return (
            <button
              key={e.id}
              type="button"
              onClick={() => navigate(e.path)}
              className="press"
              style={{
                display: 'flex', alignItems: 'center', gap: 11, padding: '10px 0', width: '100%',
                background: 'none', border: 'none', textAlign: 'left', cursor: 'pointer',
                borderBottom: i < items.length - 1 ? '1px solid #f2f3f5' : 'none',
              }}>
              <div style={{
                width: 34, height: 34, borderRadius: 999, backgroundColor: meta.bg,
                display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
              }}>
                <Icon size={14} color={meta.color} strokeWidth={2.2} />
              </div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <p style={{ fontSize: 12.5, color: INK, margin: 0, lineHeight: 1.4, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  <span style={{ fontWeight: 700 }}>{e.who}</span>{' '}
                  <span style={{ color: '#5c6066' }}>{e.what}</span>
                </p>
                <p style={{ fontSize: 10.5, color: MUTED, margin: '2px 0 0', fontWeight: 500 }}>
                  {meta.label} · {relTime(e.at, now)}
                </p>
              </div>
            </button>
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

/* ── Weight of the pipeline, stage by stage ──
   The journey board shows which deals sit where; this shows how much money
   does, which is the question a sales lead actually asks first. Open deals
   only — counting won and lost in a "what is in play" bar would double the
   pipeline the moment a quarter closed well. */
function StageBar({ stages, total }: {
  stages: { id: string; name: string; color: string; count: number; value: number }[];
  total: number;
}) {
  const navigate = useNavigate();
  const [hot, setHot] = useState<string | null>(null);
  const live = stages.filter(s => s.count > 0);

  return (
    <div className="dash-tile" style={{ padding: '18px 20px 20px' }}>
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
        <div>
          <h3 style={{ margin: 0, fontSize: 15, fontWeight: 700, color: INK, letterSpacing: '-0.015em' }}>Pipeline by stage</h3>
          <p style={{ margin: '2px 0 0', fontSize: 11.5, color: MUTED, fontWeight: 500 }}>Open deals only</p>
        </div>
        <span className="dash-chip"><span className="dash-live" aria-hidden="true" />Live</span>
      </div>

      {total <= 0 ? (
        <p style={{ margin: '18px 0 0', fontSize: 13, color: MUTED, lineHeight: 1.6 }}>
          No open deals carry a value yet — add one in Pipelines and the split appears here.
        </p>
      ) : (
        <>
          <div style={{ display: 'flex', gap: 4, marginTop: 18, height: 14 }}>
            {live.map(s => (
              <button
                key={s.id}
                type="button"
                title={`${s.name} — ${s.count} deal${s.count === 1 ? '' : 's'}, ${shortMoney(s.value)}`}
                aria-label={`${s.name}: ${s.count} open deals worth ${shortMoney(s.value)}`}
                onMouseEnter={() => setHot(s.id)}
                onMouseLeave={() => setHot(null)}
                onFocus={() => setHot(s.id)}
                onBlur={() => setHot(null)}
                onClick={() => navigate('/pipelines')}
                style={{
                  flex: Math.max(s.value, total * 0.02),
                  border: 'none', cursor: 'pointer', padding: 0,
                  borderRadius: 999,
                  backgroundColor: s.color || BLUE,
                  opacity: hot && hot !== s.id ? 0.4 : 1,
                  transform: hot === s.id ? 'scaleY(1.28)' : 'none',
                  transition: 'opacity 200ms ease, transform 200ms cubic-bezier(0.22,0.61,0.36,1)',
                }}
              />
            ))}
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(128px, 1fr))', gap: 12, marginTop: 16 }}>
            {live.map(s => (
              <div key={s.id} style={{ opacity: hot && hot !== s.id ? 0.5 : 1, transition: 'opacity 200ms ease' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                  <span style={{ width: 8, height: 8, borderRadius: 999, backgroundColor: s.color || BLUE, flexShrink: 0 }} />
                  <span style={{ fontSize: 11.5, fontWeight: 600, color: '#5c6066', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{s.name}</span>
                </div>
                <p style={{ margin: '5px 0 0', fontSize: 17, fontWeight: 800, color: INK, letterSpacing: '-0.025em' }}>{shortMoney(s.value)}</p>
                <p style={{ margin: '1px 0 0', fontSize: 11, color: MUTED, fontWeight: 500 }}>
                  {s.count} deal{s.count === 1 ? '' : 's'} · {Math.round((s.value / total) * 100)}%
                </p>
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  );
}

/* ── Main dashboard ── */
export default function Dashboard() {
  const { contacts, pipelines, appointments, reviews, campaigns, conversations, funnels, websites, videoProjects, socialPosts, addNotification, addSequence, addCampaign, addSocialPost, updatePipeline, updateAppointment, schedule, addContactTask, addContactActivity } = useApp();
  const navigate = useNavigate();

  /*
   * The ambient wash has to reach up behind the sticky header, or its rectangle
   * stops dead at the header's lower edge and reads as a band across the top of
   * the screen. The header is not a fixed height — it wraps to several rows on a
   * phone — so measure it and hand the figure to the stylesheet. Written
   * straight onto the node: this is a paint detail, and putting it in state
   * would re-render the whole dashboard on every resize tick.
   */
  const ground = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = ground.current;
    if (!el) return;
    const header = document.querySelector('.app-header') as HTMLElement | null;
    const apply = () => el.style.setProperty('--dash-bleed', `${header?.offsetHeight || 68}px`);
    apply();
    if (header && typeof ResizeObserver !== 'undefined') {
      const ro = new ResizeObserver(apply);
      ro.observe(header);
      return () => ro.disconnect();
    }
    window.addEventListener('resize', apply);
    return () => window.removeEventListener('resize', apply);
  }, []);

  /* ── AI onboarding wizard (auto-opens for un-configured accounts) ── */
  const [wizardOpen, setWizardOpen] = useState(false);
  const [flowOpen, setFlowOpen] = useState(false);
  const [obRefresh, setObRefresh] = useState(0);
  useEffect(() => {
    /*
     * The AI wizard no longer opens by itself.
     *
     * It planned a year of content, which is a reasonable fifth thing to do and
     * a strange first one: a brand-new workspace has no mailbox, no sending
     * domain and no contacts, so the first screen a customer met was a content
     * planner for a product that could not yet send anything. The setup
     * checklist is what greets them now, and this wizard is its last step.
     */
    // Refresh the pipeline widget when a background content job changes state,
    // resume any generation interrupted by a reload, and register the publish
    // API so auto-approve can publish straight from a background job.
    onContentJobsChange(() => setObRefresh(k => k + 1));
    registerPublishApi({ addSequence, addCampaign, addSocialPost });
    resumePendingGeneration(addNotification);

    // Email background work now runs on a tick from the app shell (see
    // DueWorkRunner), so it advances on every screen rather than only when
    // somebody happens to open this one. Running it here as well would mean two
    // passes racing for the same due message.

    // Behaviour triggers: let what contacts actually did move their deals.
    const beh = runBehaviourTriggers(pipelines, contacts);
    if (beh.fired.length) {
      for (const p of beh.pipelines) {
        const before = pipelines.find(x => x.id === p.id);
        if (before !== p) updatePipeline(p.id, { stages: p.stages });
      }
      for (const f of beh.fired.slice(0, 4)) addNotification(`${f.contactName}: ${f.summary}`, 'info');
      if (beh.fired.length > 4) addNotification(`${beh.fired.length - 4} more deal${beh.fired.length - 4 > 1 ? 's' : ''} updated by behaviour triggers`, 'info');
    }
    // Meeting reminders: email anything whose reminder time has arrived, then
    // stamp it so it can only go out once.
    const ownerTz = schedule.timezone || Intl.DateTimeFormat().resolvedOptions().timeZone;
    void (async () => {
      const due = dueReminders(appointments, contacts, ownerTz);
      for (const r of due) {
        const out = await sendToContact(r.contact, { subject: r.subject, body: r.body });
        if (!out.ok) continue;
        const reminders = (r.appointment.reminders ?? []).map((x, i) =>
          i === r.reminderIndex ? { ...x, sentAt: new Date().toISOString() } : x);
        updateAppointment(r.appointmentId, { reminders });
        addContactActivity(r.contact.id, {
          type: 'meeting',
          description: `Reminder sent for "${r.appointment.title}"`,
          timestamp: new Date().toISOString(),
        });
      }
      if (due.length) addNotification(`${due.length} meeting reminder${due.length > 1 ? 's' : ''} sent`, 'info');
    })();

    // Post-meeting follow-up: thank-you emails, follow-up tasks and optional
    // deal advancement, each running once per meeting.
    void (async () => {
      const plan = planFollowUps(appointments, contacts, pipelines, ownerTz, schedule.automations?.followupText);
      if (!plan.handled.length) return;
      for (const e of plan.emails) await sendToContact(e.contact, { subject: e.subject, body: e.body });
      for (const t of plan.tasks) {
        addContactTask(t.contactId, { title: t.title, dueDate: t.dueDate, done: false, createdAt: new Date().toISOString() });
      }
      let nextPipelines = pipelines;
      for (const d of plan.dealAdvances) {
        const placed = findDeal(nextPipelines, d.dealId);
        const pipeline = placed && nextPipelines.find(x => x.id === placed.pipelineId);
        const target = pipeline?.stages[placed!.stageIndex + 1];
        // Same safety rule as the behaviour triggers: never auto-close a deal.
        if (!placed || !pipeline || !target || placed.stageIndex + 1 >= pipeline.stages.length - 1) continue;
        nextPipelines = moveDealToStage(nextPipelines, d.dealId, target.id).pipelines;
      }
      for (const p of nextPipelines) {
        const before = pipelines.find(x => x.id === p.id);
        if (before !== p) updatePipeline(p.id, { stages: p.stages });
      }
      for (const id of plan.handled) updateAppointment(id, { followUpDone: true });
      for (const note of plan.notes.slice(0, 4)) addNotification(note, 'info');
    })();

    // Warmup: send today's seed messages and re-derive the per-provider
    // throttles from what actually happened. Idempotent per day.
    void (async () => {
      const res = await runWarmup();
      if (res.sent) addNotification(`${res.sent} warmup message${res.sent > 1 ? 's' : ''} sent`, 'info');
      for (const note of res.notes.slice(0, 3)) addNotification(note, 'info');
    })();

    // Bulk verification: advance one batch per dashboard visit so a queued
    // list keeps moving without the settings screen being open.
    void (async () => {
      const before = loadJob();
      if (!before || before.status !== 'running') return;
      const after = await runQueuePass();
      if (after?.status === 'done') {
        addNotification(`Address verification finished — ${after.tally.invalid} invalid, ${after.tally.risky} risky`, 'info');
      }
    })();

    // Deliverability alerts: evaluate the rules, raise anything new, and send
    // it through whichever channels are configured.
    void (async () => {
      const res = await runAlertCheck(contacts);
      for (const a of res.raised.slice(0, 3)) {
        addNotification(`${a.title} — ${a.action}`, a.severity === 'critical' ? 'error' : 'info');
      }
      if (res.raised.length > 3) {
        addNotification(`${res.raised.length - 3} more deliverability alert${res.raised.length - 3 > 1 ? 's' : ''} — see Settings → Email Deliverability`, 'info');
      }
      const bl = await checkBlacklistAlert();
      if (bl) addNotification(`${bl.title} — ${bl.action}`, 'error');
    })();

    return () => { onContentJobsChange(null); registerPublishApi(null); };
  // eslint-disable-next-line react-hooks/exhaustive-deps
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

  /* ── The four headline figures, counted from real records ── */
  const kpis = useMemo(
    () => buildKpis({ pipelines, contacts, appointments }),
    [pipelines, contacts, appointments],
  );

  /* ── How much money is sitting in each stage, open deals only ── */
  const stageWeights = pipelineStages.map(st => {
    const open = st.deals.filter(d => (d.status ?? 'active') === 'active');
    return {
      id: st.id,
      name: st.name,
      color: st.color,
      count: open.length,
      value: open.reduce((a, d) => a + (d.value || 0), 0),
    };
  });
  const stageTotal = stageWeights.reduce((a, st) => a + st.value, 0);

  /* ── Who owns the open deals, badged with how many ── */
  const ownerTally = new Map<string, number>();
  for (const d of allDeals) {
    const who = (d.assignedTo || '').trim();
    if (!who) continue;
    if ((d.status ?? 'active') === 'active') ownerTally.set(who, (ownerTally.get(who) ?? 0) + 1);
    else if (!ownerTally.has(who)) ownerTally.set(who, 0);
  }
  const dealOwners = [...ownerTally.entries()]
    .map(([name, open]) => ({ name, open }))
    .sort((a, b) => b.open - a.open || a.name.localeCompare(b.name));

  /* ── The last few things that genuinely happened ── */
  const feed = recentActivity({ contacts, pipelines, appointments, conversations });
  /* Today in the owner's own timezone — appointment dates are local calendar
     days, so an ISO/UTC slice would move the day either side of midnight. */
  const todayKey = (() => {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  })();
  const scheduledToday = appointments.filter(a => a.date === todayKey && a.status === 'scheduled').length;
  const openDeals = allDeals.filter(d => (d.status ?? 'active') === 'active').length;
  const firstName = (getSession()?.user.name || '').trim().split(/\s+/)[0];
  const hour = new Date().getHours();
  const greeting = hour < 12 ? 'Good morning' : hour < 18 ? 'Good afternoon' : 'Good evening';
  const animWinRate = useCountUp(Math.round((wonCount / Math.max(wonCount + activeCount, 1)) * 100), 1200);

  /* Everything the department board replays, gathered in one place. */
  const feedInput = { contacts, pipelines, appointments, conversations, campaigns, reviews, funnels, websites, videoProjects, socialPosts };
  /* Replayed once and shared: both boards read it, and the walk is the costly part. */
  const book = useProgressBook(feedInput);

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
  /* `tags` is required on the Contact type and absent in practice often enough
     to matter — an import, a record written by an older version, anything that
     did not go through the form. Reading `.length` off it threw and took the
     whole dashboard down to the error boundary, which is a large consequence
     for one missing array on one contact. */
  const untaggedPct = contacts.length > 0
    ? Math.round((contacts.filter(c => (c.tags?.length ?? 0) === 0).length / contacts.length) * 100)
    : 0;
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

  return (
    <div ref={ground} className="dash" style={{ minHeight: '100vh', paddingBottom: 32, overflow: 'hidden' }}>
      <span className="dash-glow" aria-hidden="true" />
      <span className="dash-glow-2" aria-hidden="true" />
      <Header
        title={firstName ? `${greeting}, ${firstName}` : greeting}
        subtitle={[
          scheduledToday === 0 ? 'Nothing in the diary today' : `${scheduledToday} meeting${scheduledToday === 1 ? '' : 's'} today`,
          `${openDeals} deal${openDeals === 1 ? '' : 's'} in motion`,
          `${contacts.length} contact${contacts.length === 1 ? '' : 's'} on the books`,
        ].join(' · ')}
      />

      {/* Roomier than it was: the wash behind the panels is most of the effect,
          and it only shows in the space they leave. */}
      <div className="dash-stack" style={{ padding: '18px clamp(18px, 3.2vw, 46px) 0', display: 'flex', flexDirection: 'column', gap: 20 }}>

        {/* ── What is left to set up ──
            Above the figures for as long as it has anything to say, because a
            workspace that cannot send yet has nothing to read in them. It
            removes itself once every step is done. */}
        <SetupChecklist
          onOpenAiWizard={() => setWizardOpen(true)}
          onOpenFlow={() => setFlowOpen(true)}
          refreshKey={obRefresh}
        />

        {/* ── The chain, with a door on it ──
            The checklist removes itself once setup is done, and this is the one
            thing on the dashboard somebody comes back to weekly: pick an
            outcome, get the whole campaign written across every module. So it
            stays after the checklist has gone. */}
        <button
          type="button"
          onClick={() => setFlowOpen(true)}
          className="flow-strip press"
          aria-label="Build a campaign from your portfolio"
        >
          <span className="flow-strip-icon" aria-hidden="true"><Wand2 size={17} /></span>
          <span className="flow-strip-text">
            <span className="flow-strip-title">Build a campaign from your portfolio</span>
            <span className="flow-strip-sub">
              Pick an outcome — the emails, texts, posts, blog and landing page are written from what you sell, and
              shown to you before anything is created.
            </span>
          </span>
          <ChevronRight size={16} aria-hidden="true" style={{ flexShrink: 0, opacity: 0.5 }} />
        </button>

        {/* ── The four numbers this week turned on ──
            Ahead of everything else on purpose: a sales lead opening the CRM
            wants the state of the business before they want a to-do list. */}
        <section aria-label="This week" style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap', padding: '0 2px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
              <h2 style={{ margin: 0, fontSize: 17, fontWeight: 800, color: INK, letterSpacing: '-0.025em' }}>This week</h2>
              <span className="dash-chip"><span className="dash-live" aria-hidden="true" />Counted from your records</span>
            </div>
            <button type="button" className="dash-chip press" onClick={() => navigate('/analytics')}>
              Full analytics <ArrowRight size={11} strokeWidth={2.6} />
            </button>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(232px, 1fr))', gap: 14 }}>
            {kpis.map(k => <KpiTile key={k.id} kpi={k} />)}
          </div>
        </section>

        {/* ── Today, and the goals behind it ── */}
        <div className="slide-up" style={{ animationDelay: '0.08s' }}>
          <DayBoard
            appointments={appointments}
            actions={book.actions.slice(0, 8)}
            onStatusChange={(id, status) => updateAppointment(id, { status })}
          />
        </div>

        {/* ── Journey board ── */}
        <div className="slide-up" style={{ ...FROST, animationDelay: '0.08s' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', margin: '2px 4px 16px' }}>
            <div>
              <h3 style={{ fontSize: 16, fontWeight: 800, color: INK, margin: 0, letterSpacing: '-0.02em' }}>Pipeline</h3>
              <p style={{ margin: '2px 0 0', fontSize: 11.5, color: MUTED, fontWeight: 500 }}>Where the open deals are sitting</p>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 14, flexWrap: 'wrap' }}>
              <TeamRow owners={dealOwners} />
              <button type="button" className="dash-chip press" onClick={() => navigate('/pipelines')}>
                Open pipelines <ArrowRight size={11} strokeWidth={2.6} />
              </button>
            </div>
          </div>

          <StageBar stages={stageWeights} total={stageTotal} />

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1.15fr 1.15fr 1fr', gap: 14, alignItems: 'start', marginTop: 16 }}>
            {journeyCols.map((col, ci) => (
              <div key={col.name}>
                <div style={{ ...CARD, padding: '8px 12px' }}>
                  {col.deals.length === 0 && (
                    <p style={{ fontSize: 12, color: MUTED, textAlign: 'center', padding: '18px 0', margin: 0 }}>No deals here yet</p>
                  )}
                  {col.deals.map((d, di) => (
                    <div key={di} style={{ borderBottom: di < col.deals.length - 1 ? '1px solid #f2f3f5' : 'none' }}>
                      <JourneyTask deal={d} done={ci < 2}
                        onSchedule={() => navigate(`/calendar?for=${encodeURIComponent(d.contactName || d.title)}`)} />
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

        {/* ── 12-month content pipeline / AI setup ── */}
        <div className="slide-up" style={{ animationDelay: '0.05s' }}>
          <ContentPipelineCard onSetup={() => setWizardOpen(true)} refreshKey={obRefresh} />
        </div>

        {/* ── Where the business stands, department by department ── */}
        <div className="slide-up" style={{ animationDelay: '0.05s' }}>
          <ProgressBoard book={book} />
        </div>

        {/* ── Bottom row: Live Activity | Knowledge table | Donut journey ── */}
        <div className="slide-up" style={{ display: 'grid', gridTemplateColumns: '1.1fr 1.25fr 0.85fr', gap: 16, alignItems: 'stretch', animationDelay: '0.2s' }}>

          <LiveFeed items={feed} />

          {/* Suggested Knowledge–style table */}
          <div style={FROST}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', margin: '2px 4px 12px' }}>
              <h3 style={{ fontSize: 16, fontWeight: 800, color: INK, margin: 0, letterSpacing: '-0.02em' }}>Suggested Actions</h3>
              <button type="button" className="dash-chip press" onClick={() => navigate('/pipelines')}>
                Open pipelines <ArrowRight size={11} strokeWidth={2.6} />
              </button>
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
              <button type="button" className="dash-chip press" onClick={() => navigate('/pipelines')}>
                Open pipelines <ArrowRight size={11} strokeWidth={2.6} />
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
      {flowOpen && (
        <FlowLauncher
          onClose={() => setFlowOpen(false)}
          onDone={() => setObRefresh(k => k + 1)}
        />
      )}
    </div>
  );
}
