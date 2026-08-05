/**
 * CommandCenter.tsx — the widgets that turn a contact record into a working
 * command center: health score, lifecycle stage, next-best-action and the
 * unified cross-module activity timeline.
 */
import { useMemo, useState } from 'react';
import {
  Mail, Phone, Calendar as CalIcon, Briefcase, CheckSquare, User, Download,
  MousePointerClick, FileText, Tag, ArrowRightLeft, MessageSquare, Zap, ChevronDown, Info,
} from 'lucide-react';
import type { Contact, Deal, Appointment } from '../../types';
import {
  LIFECYCLE_STAGES, LIFECYCLE_META, type LifecycleStage,
  type HealthScore, type NextAction, type TimelineEntry, timelineToText,
} from '../../services/contactIntelligence';

const INK = '#17191c';

/* ── Health score ring ── */

export function HealthRing({ health, size = 76 }: { health: HealthScore; size?: number }) {
  const [open, setOpen] = useState(false);
  const r = (size - 10) / 2;
  const circ = 2 * Math.PI * r;
  const dash = (health.total / 100) * circ;

  return (
    <div style={{ position: 'relative' }}>
      <button onClick={() => setOpen(o => !o)} title="How this score is calculated"
        style={{ border: 'none', background: 'none', padding: 0, cursor: 'pointer', display: 'block' }}>
        <svg width={size} height={size} style={{ display: 'block', transform: 'rotate(-90deg)' }}>
          <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="#eef0f3" strokeWidth={7} />
          <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke={health.color} strokeWidth={7}
            strokeDasharray={`${dash} ${circ}`} strokeLinecap="round" style={{ transition: 'stroke-dasharray 0.6s ease' }} />
        </svg>
        <div style={{ position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center' }}>
          <span style={{ fontSize: size * 0.29, fontWeight: 800, color: INK, lineHeight: 1 }}>{health.total}</span>
          <span style={{ fontSize: 8.5, fontWeight: 700, color: health.color, textTransform: 'uppercase', letterSpacing: '0.06em' }}>
            {health.band === 'at-risk' ? 'At risk' : health.band}
          </span>
        </div>
      </button>

      {open && (
        <div style={{ position: 'absolute', top: size + 8, left: 0, zIndex: 60, width: 262, background: '#fff', borderRadius: 12, padding: 14, boxShadow: '0 16px 40px -8px rgba(15,23,42,0.25)', border: '1px solid #e2e8f0' }}>
          <p style={{ margin: '0 0 10px', fontSize: 12, fontWeight: 800, color: INK, display: 'flex', alignItems: 'center', gap: 6 }}>
            <Info size={12} /> Health score breakdown
          </p>
          {health.components.map(c => (
            <div key={c.label} style={{ marginBottom: 9 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, marginBottom: 3 }}>
                <span style={{ fontWeight: 700, color: '#334155' }}>{c.label}</span>
                <span style={{ color: '#64748b' }}>{c.score}/{c.max}</span>
              </div>
              <div style={{ height: 5, background: '#f1f5f9', borderRadius: 3, overflow: 'hidden' }}>
                <div style={{ width: `${(c.score / c.max) * 100}%`, height: '100%', background: health.color, borderRadius: 3 }} />
              </div>
              <p style={{ margin: '3px 0 0', fontSize: 10.5, color: '#94a3b8' }}>{c.detail}</p>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

/* ── Lifecycle stage bar ── */

export function LifecycleBar({ current, suggested, onChange }: {
  current: LifecycleStage; suggested: LifecycleStage; onChange: (s: LifecycleStage) => void;
}) {
  const idx = LIFECYCLE_STAGES.indexOf(current);
  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 7 }}>
        <span style={{ fontSize: 10.5, fontWeight: 800, color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '0.06em' }}>Lifecycle stage</span>
        {suggested !== current && (
          <button onClick={() => onChange(suggested)}
            title={`Their behaviour suggests ${suggested}`}
            style={{ fontSize: 10, fontWeight: 700, padding: '2px 8px', borderRadius: 999, border: 'none', cursor: 'pointer', background: '#fef3c7', color: '#b45309' }}>
            Suggested: {suggested} →
          </button>
        )}
      </div>
      <div style={{ display: 'flex', gap: 3 }}>
        {LIFECYCLE_STAGES.map((s, i) => {
          const meta = LIFECYCLE_META[s];
          const active = i <= idx;
          const isCurrent = i === idx;
          return (
            <button key={s} onClick={() => onChange(s)} title={meta.hint}
              style={{
                flex: 1, minWidth: 0, padding: '6px 4px', borderRadius: 7, cursor: 'pointer',
                border: isCurrent ? `1.5px solid ${meta.color}` : '1.5px solid transparent',
                background: isCurrent ? meta.bg : active ? '#f8fafc' : '#fff',
                color: isCurrent ? meta.color : active ? '#475569' : '#cbd5e1',
                fontSize: 10, fontWeight: isCurrent ? 800 : 600, whiteSpace: 'nowrap',
                overflow: 'hidden', textOverflow: 'ellipsis',
              }}>
              {s}
            </button>
          );
        })}
      </div>
    </div>
  );
}

/* ── Next best action ── */

const ACTION_ICON = {
  email: Mail, schedule: CalIcon, deal: Briefcase, task: CheckSquare, call: Phone, profile: User,
} as const;

export function NextBestActions({ actions, onAct }: { actions: NextAction[]; onAct: (a: NextAction) => void }) {
  const urgencyColor = { high: '#ef4444', medium: '#f59e0b', low: '#64748b' };
  return (
    <div style={{ background: '#fff', borderRadius: 14, border: '1px solid #e6e9f0', padding: 16 }}>
      <p style={{ margin: '0 0 12px', fontSize: 12.5, fontWeight: 800, color: INK, display: 'flex', alignItems: 'center', gap: 7 }}>
        <Zap size={14} color="#f59e0b" /> Next best action
      </p>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        {actions.map(a => {
          const Icon = ACTION_ICON[a.action];
          return (
            <button key={a.id} onClick={() => onAct(a)}
              style={{ display: 'flex', gap: 10, alignItems: 'flex-start', textAlign: 'left', padding: '10px 12px', borderRadius: 10, border: '1px solid #eef0f3', background: '#f8fafc', cursor: 'pointer', width: '100%' }}
              onMouseEnter={e => { (e.currentTarget as HTMLButtonElement).style.background = '#eef2ff'; }}
              onMouseLeave={e => { (e.currentTarget as HTMLButtonElement).style.background = '#f8fafc'; }}>
              <span style={{ width: 26, height: 26, borderRadius: 8, background: '#fff', border: '1px solid #e2e8f0', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, marginTop: 1 }}>
                <Icon size={13} color={urgencyColor[a.urgency]} />
              </span>
              <span style={{ minWidth: 0 }}>
                <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                  <span style={{ fontSize: 12.5, fontWeight: 700, color: INK }}>{a.title}</span>
                  <span style={{ fontSize: 8.5, fontWeight: 800, padding: '1px 6px', borderRadius: 999, background: `${urgencyColor[a.urgency]}18`, color: urgencyColor[a.urgency], textTransform: 'uppercase' }}>{a.urgency}</span>
                </span>
                <span style={{ display: 'block', fontSize: 11, color: '#64748b', marginTop: 2, lineHeight: 1.45 }}>{a.why}</span>
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
}

/* ── Unified timeline ── */

const TL_META: Record<string, { icon: typeof Mail; color: string; label: string }> = {
  email_sent:     { icon: Mail, color: '#6366f1', label: 'Email' },
  email_opened:   { icon: Mail, color: '#22c55e', label: 'Open' },
  link_clicked:   { icon: MousePointerClick, color: '#f59e0b', label: 'Click' },
  form_submitted: { icon: FileText, color: '#0ea5e9', label: 'Form' },
  call:           { icon: Phone, color: '#8b5cf6', label: 'Call' },
  meeting:        { icon: CalIcon, color: '#ec4899', label: 'Meeting' },
  note:           { icon: MessageSquare, color: '#64748b', label: 'Note' },
  task_open:      { icon: CheckSquare, color: '#94a3b8', label: 'Task' },
  task_done:      { icon: CheckSquare, color: '#22c55e', label: 'Task' },
  task_completed: { icon: CheckSquare, color: '#22c55e', label: 'Task' },
  tag_added:      { icon: Tag, color: '#14b8a6', label: 'Tag' },
  stage_change:   { icon: ArrowRightLeft, color: '#f97316', label: 'Stage' },
  deal:           { icon: Briefcase, color: '#0f172a', label: 'Deal' },
};

const FILTERS: { id: string; label: string; match: (t: string) => boolean }[] = [
  { id: 'all', label: 'Everything', match: () => true },
  { id: 'email', label: 'Email', match: t => t.startsWith('email') || t === 'link_clicked' },
  { id: 'meeting', label: 'Meetings', match: t => t === 'meeting' || t === 'call' },
  { id: 'deal', label: 'Deals', match: t => t === 'deal' || t === 'stage_change' },
  { id: 'task', label: 'Tasks & notes', match: t => t.startsWith('task') || t === 'note' },
];

export function UnifiedTimeline({ contact, entries }: { contact: Contact; entries: TimelineEntry[] }) {
  const [filter, setFilter] = useState('all');
  const [limit, setLimit] = useState(25);

  const shown = useMemo(() => {
    const f = FILTERS.find(x => x.id === filter) ?? FILTERS[0];
    return entries.filter(e => f.match(e.type));
  }, [entries, filter]);

  const exportTxt = () => {
    const blob = new Blob([timelineToText(contact, shown)], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${contact.name.replace(/[^a-z0-9]+/gi, '-').toLowerCase()}-timeline.txt`;
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  };

  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 14, flexWrap: 'wrap' }}>
        {FILTERS.map(f => (
          <button key={f.id} onClick={() => { setFilter(f.id); setLimit(25); }}
            style={{ padding: '6px 13px', borderRadius: 999, cursor: 'pointer', fontSize: 11.5, fontWeight: 700,
              border: filter === f.id ? 'none' : '1px solid #e2e8f0',
              background: filter === f.id ? INK : '#fff', color: filter === f.id ? '#fff' : '#475569' }}>
            {f.label}
          </button>
        ))}
        <div style={{ flex: 1 }} />
        <button onClick={exportTxt} disabled={!shown.length}
          style={{ display: 'flex', alignItems: 'center', gap: 5, padding: '6px 12px', borderRadius: 8, border: '1px solid #e2e8f0', background: '#fff', color: '#475569', fontSize: 11.5, fontWeight: 700, cursor: shown.length ? 'pointer' : 'not-allowed' }}>
          <Download size={12} /> Export
        </button>
      </div>

      {shown.length === 0 ? (
        <div style={{ textAlign: 'center', padding: '46px 20px', color: '#94a3b8' }}>
          <MessageSquare size={30} style={{ opacity: 0.3, marginBottom: 10 }} />
          <p style={{ margin: 0, fontSize: 13.5, fontWeight: 600, color: '#475569' }}>Nothing here yet</p>
          <p style={{ margin: '4px 0 0', fontSize: 12 }}>Interactions appear here as they happen.</p>
        </div>
      ) : (
        <div style={{ position: 'relative' }}>
          <div style={{ position: 'absolute', left: 15, top: 6, bottom: 6, width: 2, background: '#eef0f3' }} />
          {shown.slice(0, limit).map(e => {
            const meta = TL_META[e.type] ?? { icon: MessageSquare, color: '#94a3b8', label: e.type };
            const Icon = meta.icon;
            return (
              <div key={e.id} style={{ display: 'flex', gap: 12, position: 'relative', paddingBottom: 16 }}>
                <span style={{ width: 32, height: 32, borderRadius: 999, background: '#fff', border: `2px solid ${meta.color}25`, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, zIndex: 1 }}>
                  <Icon size={14} color={meta.color} />
                </span>
                <div style={{ flex: 1, minWidth: 0, paddingTop: 2 }}>
                  <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, flexWrap: 'wrap' }}>
                    <span style={{ fontSize: 13, fontWeight: 600, color: INK }}>{e.title}</span>
                    <span style={{ fontSize: 9.5, fontWeight: 800, padding: '1px 6px', borderRadius: 4, background: `${meta.color}14`, color: meta.color, textTransform: 'uppercase' }}>{meta.label}</span>
                  </div>
                  {e.detail && <p style={{ margin: '3px 0 0', fontSize: 12, color: '#64748b', lineHeight: 1.5 }}>{e.detail}</p>}
                  <p style={{ margin: '3px 0 0', fontSize: 11, color: '#94a3b8' }}>{new Date(e.at).toLocaleString()}</p>
                </div>
              </div>
            );
          })}
          {shown.length > limit && (
            <button onClick={() => setLimit(l => l + 25)}
              style={{ marginLeft: 44, padding: '7px 14px', borderRadius: 8, border: '1px solid #e2e8f0', background: '#fff', color: '#475569', fontSize: 12, fontWeight: 700, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 5 }}>
              <ChevronDown size={13} /> Show {Math.min(25, shown.length - limit)} more
            </button>
          )}
        </div>
      )}
    </div>
  );
}

/* ── Cross-module summary strip ── */

export function ModuleSummary({ deals, appointments, emailCount, onOpen }: {
  deals: Deal[]; appointments: Appointment[]; emailCount: number;
  onOpen: (what: 'deals' | 'appointments' | 'email') => void;
}) {
  const open = deals.filter(d => (d.status ?? 'active') === 'active');
  const pipelineValue = open.reduce((s, d) => s + (d.value ?? 0), 0);
  const upcoming = appointments.filter(a => a.status === 'scheduled').length;

  const cards = [
    { key: 'deals' as const, icon: Briefcase, label: 'Open deals', value: String(open.length), sub: `$${pipelineValue.toLocaleString()} in pipeline`, color: '#6366f1' },
    { key: 'appointments' as const, icon: CalIcon, label: 'Appointments', value: String(appointments.length), sub: upcoming ? `${upcoming} upcoming` : 'None scheduled', color: '#ec4899' },
    { key: 'email' as const, icon: Mail, label: 'Emails sent', value: String(emailCount), sub: emailCount ? 'View history' : 'Never emailed', color: '#0ea5e9' },
  ];

  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 10 }}>
      {cards.map(c => (
        <button key={c.key} onClick={() => onOpen(c.key)}
          style={{ background: '#fff', border: '1px solid #e6e9f0', borderRadius: 12, padding: '12px 14px', textAlign: 'left', cursor: 'pointer' }}
          onMouseEnter={e => { (e.currentTarget as HTMLButtonElement).style.borderColor = c.color; }}
          onMouseLeave={e => { (e.currentTarget as HTMLButtonElement).style.borderColor = '#e6e9f0'; }}>
          <span style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 6 }}>
            <c.icon size={13} color={c.color} />
            <span style={{ fontSize: 10.5, fontWeight: 700, color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '0.05em' }}>{c.label}</span>
          </span>
          <span style={{ display: 'block', fontSize: 20, fontWeight: 800, color: INK, lineHeight: 1 }}>{c.value}</span>
          <span style={{ display: 'block', fontSize: 11, color: '#64748b', marginTop: 3 }}>{c.sub}</span>
        </button>
      ))}
    </div>
  );
}
