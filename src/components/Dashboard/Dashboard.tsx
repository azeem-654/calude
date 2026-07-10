import { useState, useEffect, useRef } from 'react';
import {
  MessageSquare, Mail, ShoppingBag, CornerUpLeft,
  Check, CheckCheck, Calendar as CalIcon, Plus, Share2,
  MoreHorizontal, Star,
} from 'lucide-react';
import { PieChart, Pie, Cell, ResponsiveContainer } from 'recharts';
import Header from '../Layout/Header';
import { useApp } from '../../context/AppContext';
import type { Deal } from '../../types';

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
  const data = [{ v: value }, { v: Math.max(total - value, 0.0001) }];
  return (
    <div style={{ flex: 1, textAlign: 'center', position: 'relative' }}>
      <div style={{ position: 'relative', height: 120 }}>
        <ResponsiveContainer width="100%" height={120}>
          <PieChart>
            <Pie data={data} dataKey="v" cx="50%" cy="50%" innerRadius={38} outerRadius={54} startAngle={90} endAngle={-270} strokeWidth={0}>
              <Cell fill={color} />
              <Cell fill="#eceef1" />
            </Pie>
          </PieChart>
        </ResponsiveContainer>
        <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <span style={{ fontSize: 22, fontWeight: 800, color: INK, letterSpacing: '-0.02em' }}>{value}</span>
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

/* ── Main dashboard ── */
export default function Dashboard() {
  const { contacts, pipelines, appointments } = useApp();

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

  const feedNames = contacts.length >= 3 ? contacts.slice(0, 12).map(c => c.name) : FALLBACK_NAMES;
  const scheduledToday = appointments.filter(a => a.status === 'scheduled').length;

  let avatarSeed = 5;

  return (
    <div style={{ minHeight: '100vh', paddingBottom: 32 }}>
      <Header title="Customer Journeys" subtitle={`Welcome back, John — ${scheduledToday || 9} appointments scheduled, ${activeCount} deals in motion.`} />

      <div style={{ padding: '14px 28px 0', display: 'flex', flexDirection: 'column', gap: 16 }}>

        {/* ── Journey board ── */}
        <div style={FROST}>
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

        {/* ── Bottom row: Live Activity | Knowledge table | Donut journey ── */}
        <div style={{ display: 'grid', gridTemplateColumns: '1.1fr 1.25fr 0.85fr', gap: 16, alignItems: 'stretch' }}>

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
                  {Math.round((wonCount / Math.max(wonCount + activeCount, 1)) * 100)}%
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
    </div>
  );
}
