import { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  ArrowRight, ArrowUpRight, CalendarDays, ChevronLeft, ChevronRight,
  Clock, Mail, Phone, Target, Video,
} from 'lucide-react';
import type { Appointment } from '../../types';
import type { GrowthAction } from '../../services/marketFeed';
import {
  clockLabel, dayProgress, dayWindow, hourTicks, positionIn, slotsForDay, ymd,
  type DaySlot,
} from '../../services/dayPlan';
import { ModuleMark } from './moduleIcons';
import DayClocks from './WorldClocks';
import { useTheme } from './useTheme';
import { useTilt } from './useTilt';

/**
 * The day, and the goals behind it.
 *
 * Two rails, because they answer two different questions and a single list was
 * conflating them. "Today" is time-bound and finite — the meetings actually in
 * the diary. "Bigger goals" is the standing work that moves the business, ranked
 * by how much each one would lift the overall score. Above both sits the hour
 * bar, which is the only place the two meet: it shows where you are in the day
 * and pins the meetings on it.
 *
 * Everything here is real. The hour bar is driven by the appointment records,
 * the status control writes back to the appointment, and the goals are the same
 * computed suggestions as before — no decorative cards.
 */

const LIME = '#c7f441';
const ON_LIME = '#0e1117';
/**
 * The accent needs a darker step for marks drawn on a light card. #c7f441
 * measures 1.05:1 against a light track — a bar in it is invisible to anyone
 * not reading hue, which is the whole point of a bar. Large lime shapes
 * carrying dark text (pills, buttons, the hour bar's pins on black) keep the
 * bright step.
 */
const LIME_ON_LIGHT = '#65a30d';

type Filter = 'all' | 'upcoming' | 'done';

interface Props {
  appointments: Appointment[];
  actions: GrowthAction[];
  onStatusChange: (id: string, status: Appointment['status']) => void;
}

export default function DayBoard({ appointments, actions, onStatusChange }: Props) {
  const navigate = useNavigate();
  const dark = useTheme() === 'dark';

  const [filter, setFilter] = useState<Filter>('all');

  // A minute is enough: the bar marks the hour you are in, not the second.
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const t = window.setInterval(() => setNow(new Date()), 60_000);
    return () => window.clearInterval(t);
  }, []);

  const today = ymd(now);
  const nowMin = now.getHours() * 60 + now.getMinutes();

  const slots = useMemo(() => slotsForDay(appointments, today), [appointments, today]);
  const win = useMemo(() => dayWindow(slots, nowMin), [slots, nowMin]);
  const progress = useMemo(() => dayProgress(slots, nowMin), [slots, nowMin]);

  const shown = useMemo(() => {
    if (filter === 'upcoming') return slots.filter(s => s.endMin > nowMin);
    if (filter === 'done') return slots.filter(s => s.appt.status === 'completed' || s.endMin <= nowMin);
    return slots;
  }, [slots, filter, nowMin]);

  /* ── Surfaces ── */
  const PLANE = dark ? '#0c0e12' : '#eef0f4';
  const CARD = dark ? '#161a20' : '#ffffff';
  const LINE = dark ? '#232a33' : '#e3e6eb';
  const INK = dark ? '#e9eef4' : '#17191c';
  const MUTED = dark ? '#8f9aa8' : '#6b7480';
  /** The dark chrome pieces stay dark in both themes, as in the reference. */
  const CHROME = '#15181d';

  return (
    <div data-noinvert style={{
      backgroundColor: PLANE, borderRadius: 26, border: `1px solid ${LINE}`,
      padding: 18, display: 'flex', flexDirection: 'column', gap: 16,
    }}>

      {/* ── The hour bar ── */}
      <div className="day-bar" style={{
        backgroundColor: CHROME, borderRadius: 999, padding: '10px 14px',
        display: 'flex', alignItems: 'center', gap: 14, flexWrap: 'wrap',
      }}>
        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8, flexShrink: 0, flexWrap: 'wrap' }}>
          <span style={{ fontSize: 12.5, fontWeight: 800, color: '#ffffff' }}>Your day</span>
          <span style={{
            display: 'inline-flex', alignItems: 'center', gap: 6, padding: '5px 11px',
            borderRadius: 999, backgroundColor: 'rgba(255,255,255,0.10)',
            fontSize: 11, fontWeight: 700, color: 'rgba(255,255,255,0.86)', whiteSpace: 'nowrap',
          }}>
            <CalendarDays size={12} />
            {now.toLocaleDateString(undefined, { day: 'numeric', month: 'long' })}
          </span>
          {/* The live clock, where you are, and the places you work with. */}
          <DayClocks />
        </span>

        <HourBar
          slots={slots}
          win={win}
          nowMin={nowMin}
          onPick={a => navigate(`/calendar?appointment=${encodeURIComponent(a.id)}`)}
        />

        <span style={{
          display: 'inline-flex', alignItems: 'center', gap: 6, flexShrink: 0,
          fontSize: 11, fontWeight: 700, color: 'rgba(255,255,255,0.80)', whiteSpace: 'nowrap',
        }}>
          <Clock size={12} />
          {progress.total === 0
            ? 'Nothing booked'
            : progress.current
              ? `In: ${progress.current.appt.title}`
              : progress.next
                ? `Next ${clockLabel(progress.next.startMin)}`
                : `${progress.done}/${progress.total} done`}
        </span>
      </div>

      {/* ── Today's schedule ── */}
      <Rail
        title="Today's schedule"
        count={`${slots.length} ${slots.length === 1 ? 'meeting' : 'meetings'}`}
        ink={INK}
        muted={MUTED}
        chrome={CHROME}
        filters={([['all', 'All'], ['upcoming', 'Still to come'], ['done', 'Done']] as const)
          .map(([k, label]) => ({ key: k, label, on: filter === k, onClick: () => setFilter(k) }))}
        empty={slots.length === 0
          ? 'Nothing in the diary for today. Anything you book will appear here and on the bar above.'
          : 'Nothing matches that filter.'}
        isEmpty={shown.length === 0}
        emptyCta={{ label: 'Open the calendar', onClick: () => navigate('/calendar') }}
      >
        {shown.map((slot, i) => (
          <MeetingCard
            key={slot.appt.id}
            index={i}
            slot={slot}
            nowMin={nowMin}
            highlight={progress.current
              ? progress.current.appt.id === slot.appt.id
              : progress.next?.appt.id === slot.appt.id && i === 0}
            card={CARD}
            line={LINE}
            ink={INK}
            muted={MUTED}
            chrome={CHROME}
            onStatusChange={onStatusChange}
            onOpen={() => navigate('/calendar')}
          />
        ))}
      </Rail>

      {/* ── Bigger goals ── */}
      <Rail
        title="What to do next"
        count="Ranked by lift"
        ink={INK}
        muted={MUTED}
        chrome={CHROME}
        empty="Every department is above 85. Nothing here is worth nagging you about."
        isEmpty={actions.length === 0}
      >
        {actions.map((a, i) => (
          <GoalCard
            key={a.id}
            index={i}
            action={a}
            best={actions[0]?.lift ?? 1}
            highlight={i === 0}
            barFill={dark ? LIME : LIME_ON_LIGHT}
            card={CARD}
            line={LINE}
            ink={INK}
            muted={MUTED}
            chrome={CHROME}
            onOpen={() => navigate(a.route)}
          />
        ))}
      </Rail>
    </div>
  );
}

/* ── The hour bar ── */

function HourBar({ slots, win, nowMin, onPick }: {
  slots: DaySlot[];
  win: { startMin: number; endMin: number };
  nowMin: number;
  onPick: (a: Appointment) => void;
}) {
  const ticks = hourTicks(win);
  const nowPct = positionIn(win, nowMin);

  return (
    <div style={{ flex: 1, minWidth: 320, position: 'relative', padding: '14px 0 16px' }}>
      {/* Track, with the part of the day already gone filled in. */}
      <div style={{
        position: 'relative', height: 26, borderRadius: 999,
        backgroundColor: 'rgba(255,255,255,0.08)', overflow: 'visible',
      }}>
        <div style={{
          position: 'absolute', left: 0, top: 0, bottom: 0, width: `${nowPct}%`,
          borderRadius: 999, backgroundColor: 'rgba(199,244,65,0.20)',
        }} />

        {/* Meetings, pinned where they actually fall. */}
        {slots.map(s => {
          const left = positionIn(win, s.startMin);
          const right = positionIn(win, s.endMin);
          const past = s.endMin <= nowMin;
          const live = s.startMin <= nowMin && nowMin < s.endMin;
          return (
            <button
              key={s.appt.id}
              className={live ? 'live-pin press' : 'press'}
              onClick={() => onPick(s.appt)}
              title={`${s.appt.title} · ${clockLabel(s.startMin)}`}
              aria-label={`${s.appt.title} at ${clockLabel(s.startMin)}`}
              style={{
                position: 'absolute', top: 3, bottom: 3,
                left: `${left}%`,
                // Always wide enough to hit, however short the meeting.
                width: `max(${Math.max(right - left, 0).toFixed(2)}%, 26px)`,
                borderRadius: 999, cursor: 'pointer',
                border: live ? `2px solid ${LIME}` : 'none',
                backgroundColor: past ? 'rgba(255,255,255,0.22)' : LIME,
                opacity: past ? 0.55 : 1,
                padding: 0, overflow: 'hidden',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
              }}
            >
              <span style={{
                fontSize: 9.5, fontWeight: 800, color: past ? '#ffffff' : ON_LIME,
                padding: '0 6px', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
              }}>
                {clockLabel(s.startMin).replace(':00', '')}
              </span>
            </button>
          );
        })}

        {/* Now. */}
        <div
          aria-hidden="true"
          className="now-marker"
          style={{
            position: 'absolute', top: -7, bottom: -7, left: `${nowPct}%`,
            width: 2, backgroundColor: '#ffffff', borderRadius: 999, transform: 'translateX(-1px)',
          }}
        />
        <span style={{
          position: 'absolute', top: -24, left: `${nowPct}%`, transform: 'translateX(-50%)',
          padding: '2px 7px', borderRadius: 999, backgroundColor: '#ffffff',
          fontSize: 9, fontWeight: 800, color: ON_LIME, whiteSpace: 'nowrap',
        }}>
          {clockLabel(nowMin)}
        </span>
      </div>

      {/* Hour ticks. */}
      <div style={{ position: 'relative', height: 12, marginTop: 4 }}>
        {ticks.map(t => (
          <span
            key={t}
            style={{
              position: 'absolute', left: `${positionIn(win, t)}%`, transform: 'translateX(-50%)',
              fontSize: 8.5, fontWeight: 700, color: 'rgba(255,255,255,0.42)', whiteSpace: 'nowrap',
            }}
          >
            {clockLabel(t).replace(':00', '')}
          </span>
        ))}
      </div>
    </div>
  );
}

/* ── A horizontal rail ── */

function Rail({ title, count, children, ink, muted, chrome, filters, empty, isEmpty, emptyCta }: {
  title: string;
  count: string;
  children: React.ReactNode;
  ink: string;
  muted: string;
  chrome: string;
  filters?: { key: string; label: string; on: boolean; onClick: () => void }[];
  empty: string;
  isEmpty: boolean;
  emptyCta?: { label: string; onClick: () => void };
}) {
  const scroller = useRef<HTMLDivElement>(null);
  const nudge = (dir: -1 | 1) => scroller.current?.scrollBy({ left: dir * 320, behavior: 'smooth' });

  return (
    <section>
      <div style={{
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        gap: 12, marginBottom: 11, flexWrap: 'wrap',
      }}>
        <div style={{ display: 'flex', alignItems: 'baseline', gap: 10 }}>
          <h3 style={{ margin: 0, fontSize: 16, fontWeight: 800, color: ink, letterSpacing: '-0.02em' }}>{title}</h3>
          <span style={{ fontSize: 11.5, color: muted, fontWeight: 600 }}>{count}</span>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
          {filters && (
            <div style={{
              display: 'inline-flex', gap: 3, padding: 3, borderRadius: 999, backgroundColor: chrome,
            }}>
              {filters.map(f => (
                <button
                  key={f.key}
                  onClick={f.onClick}
                  aria-pressed={f.on}
                  style={{
                    padding: '6px 12px', borderRadius: 999, border: 'none', cursor: 'pointer',
                    backgroundColor: f.on ? LIME : 'transparent',
                    color: f.on ? ON_LIME : 'rgba(255,255,255,0.72)',
                    fontSize: 11, fontWeight: 700, whiteSpace: 'nowrap',
                  }}
                >
                  {f.label}
                </button>
              ))}
            </div>
          )}
          {!isEmpty && (
            <span style={{ display: 'inline-flex', gap: 5 }}>
              {([[ChevronLeft, -1, 'Scroll left'], [ChevronRight, 1, 'Scroll right']] as const).map(([Icon, dir, label]) => (
                <button
                  key={label}
                  onClick={() => nudge(dir)}
                  aria-label={label}
                  style={{
                    width: 30, height: 30, borderRadius: 999, border: 'none', cursor: 'pointer',
                    backgroundColor: chrome, color: '#ffffff',
                    display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                  }}
                >
                  <Icon size={15} />
                </button>
              ))}
            </span>
          )}
        </div>
      </div>

      {isEmpty ? (
        <div style={{
          padding: '22px 18px', borderRadius: 20, border: `1px dashed ${muted}44`,
          fontSize: 12.5, color: muted, lineHeight: 1.6,
        }}>
          {empty}
          {emptyCta && (
            <button
              onClick={emptyCta.onClick}
              style={{
                display: 'inline-flex', alignItems: 'center', gap: 5, marginTop: 11,
                padding: '8px 15px', borderRadius: 999, border: 'none',
                backgroundColor: LIME, color: ON_LIME, fontSize: 11.5, fontWeight: 800, cursor: 'pointer',
              }}
            >
              {emptyCta.label} <ArrowRight size={12} />
            </button>
          )}
        </div>
      ) : (
        <div
          ref={scroller}
          className="rail-scroll"
          style={{
            display: 'flex', gap: 12, overflowX: 'auto', paddingBottom: 6,
            scrollSnapType: 'x proximity',
          }}
        >
          {children}
        </div>
      )}
    </section>
  );
}

/* ── Cards ── */

const MEETING_ICON: Record<string, typeof Video> = {
  call: Phone, phone: Phone, video: Video, meeting: Video, demo: Video, email: Mail,
};

const STATUS_LABEL: Record<Appointment['status'], string> = {
  scheduled: 'Call scheduled',
  completed: 'Completed',
  cancelled: 'Cancelled',
  'no-show': 'No show',
};

function MeetingCard({ slot, nowMin, highlight, index, card, line, ink, muted, chrome, onStatusChange, onOpen }: {
  slot: DaySlot;
  nowMin: number;
  highlight: boolean;
  index: number;
  card: string; line: string; ink: string; muted: string; chrome: string;
  onStatusChange: (id: string, status: Appointment['status']) => void;
  onOpen: () => void;
}) {
  const { tiltProps } = useTilt();
  const a = slot.appt;
  const Icon = MEETING_ICON[(a.type ?? '').toLowerCase()] ?? Video;
  const past = slot.endMin <= nowMin;

  // The highlighted card inverts to lime, so its own ink has to come with it.
  const bg = highlight ? LIME : card;
  const fg = highlight ? ON_LIME : ink;
  const sub = highlight ? 'rgba(14,17,23,0.66)' : muted;

  return (
    <article
      className="tilt-card rail-in"
      {...tiltProps}
      style={{
      ['--i' as string]: index,
      flex: '0 0 288px', scrollSnapAlign: 'start',
      backgroundColor: bg, borderRadius: 22,
      border: `1px solid ${highlight ? LIME : line}`,
      padding: 15, opacity: past && !highlight ? 0.72 : 1,
      display: 'flex', flexDirection: 'column', gap: 11,
    }}>
      <div style={{ display: 'flex', alignItems: 'flex-start', gap: 10 }}>
        <Initials name={a.contactName || a.title} highlight={highlight} />
        <div style={{ flex: 1, minWidth: 0 }}>
          <p style={{
            margin: 0, fontSize: 12.5, fontWeight: 800, color: fg,
            whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
          }}>{a.contactName || 'No contact'}</p>
          <p style={{ margin: 0, fontSize: 10.5, color: sub, textTransform: 'capitalize' }}>
            {a.type || 'meeting'}{a.location ? ` · ${a.location}` : ''}
          </p>
        </div>
        <button
          onClick={onOpen}
          aria-label={`Open ${a.title} in the calendar`}
          style={{
            width: 26, height: 26, borderRadius: 999, flexShrink: 0, cursor: 'pointer',
            border: 'none', backgroundColor: highlight ? 'rgba(14,17,23,0.10)' : `${muted}1f`,
            color: fg, display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
          }}
        >
          <ArrowUpRight size={13} />
        </button>
      </div>

      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
        <span style={{
          width: 34, height: 34, borderRadius: 12, flexShrink: 0,
          backgroundColor: highlight ? 'rgba(14,17,23,0.10)' : `${muted}1f`,
          color: fg, display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
        }}>
          <Icon size={17} strokeWidth={2.2} />
        </span>
        <p style={{
          margin: 0, fontSize: 16, fontWeight: 800, color: fg, letterSpacing: '-0.02em',
          overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
        }}>{a.title}</p>
      </div>

      <p style={{ margin: 0, fontSize: 11, color: sub, fontWeight: 600 }}>
        {clockLabel(slot.startMin)} – {clockLabel(slot.endMin)} · {a.duration || 30} min
      </p>

      <div style={{ marginTop: 'auto', display: 'flex', alignItems: 'center', gap: 8 }}>
        <label style={{ flex: 1, minWidth: 0 }}>
          <span style={{ display: 'block', fontSize: 9.5, fontWeight: 700, color: sub, marginBottom: 3 }}>
            Status
          </span>
          <select
            value={a.status}
            onChange={e => onStatusChange(a.id, e.target.value as Appointment['status'])}
            aria-label={`Status of ${a.title}`}
            style={{
              width: '100%', padding: '7px 10px', borderRadius: 999, cursor: 'pointer',
              border: `1px solid ${highlight ? 'rgba(14,17,23,0.18)' : line}`,
              backgroundColor: highlight ? 'rgba(255,255,255,0.55)' : card,
              color: fg, fontSize: 11, fontWeight: 700, fontFamily: 'inherit',
            }}
          >
            {(Object.keys(STATUS_LABEL) as Appointment['status'][]).map(s => (
              <option key={s} value={s}>{STATUS_LABEL[s]}</option>
            ))}
          </select>
        </label>
        <button
          onClick={onOpen}
          aria-label={`Join or open ${a.title}`}
          style={{
            width: 34, height: 34, borderRadius: 999, flexShrink: 0, marginTop: 13, cursor: 'pointer',
            border: 'none', backgroundColor: chrome, color: '#ffffff',
            display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
          }}
        >
          <Icon size={15} />
        </button>
      </div>
    </article>
  );
}

function GoalCard({ action, best, highlight, index, barFill, card, line, ink, muted, chrome, onOpen }: {
  action: GrowthAction;
  best: number;
  highlight: boolean;
  index: number;
  /** Stepped for the card's surface, not the app theme. */
  barFill: string;
  card: string; line: string; ink: string; muted: string; chrome: string;
  onOpen: () => void;
}) {
  const { tiltProps } = useTilt();
  const bg = highlight ? LIME : card;
  const fg = highlight ? ON_LIME : ink;
  const sub = highlight ? 'rgba(14,17,23,0.66)' : muted;
  const share = Math.max((action.lift / Math.max(best, 0.01)) * 100, 4);

  return (
    <article
      className="tilt-card rail-in"
      {...tiltProps}
      style={{
      ['--i' as string]: index,
      flex: '0 0 300px', scrollSnapAlign: 'start',
      backgroundColor: bg, borderRadius: 22,
      border: `1px solid ${highlight ? LIME : line}`,
      padding: 15, display: 'flex', flexDirection: 'column', gap: 10,
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
        <ModuleMark symbol={action.symbol} size={30} />
        <div style={{ flex: 1, minWidth: 0 }}>
          <p style={{ margin: 0, fontSize: 10.5, fontWeight: 700, color: sub }}>{action.module}</p>
          <p style={{ margin: 0, fontSize: 10.5, color: sub }}>Now at {Math.round(action.current)}/100</p>
        </div>
        <span style={{
          display: 'inline-flex', alignItems: 'center', gap: 4, flexShrink: 0,
          padding: '4px 9px', borderRadius: 999,
          backgroundColor: highlight ? 'rgba(14,17,23,0.12)' : `${muted}1f`,
          fontSize: 10, fontWeight: 800, color: fg, whiteSpace: 'nowrap',
        }}>
          <Target size={10} /> +{action.lift.toFixed(2)}
        </span>
      </div>

      <p style={{
        margin: 0, fontSize: 16, fontWeight: 800, color: fg, letterSpacing: '-0.02em', lineHeight: 1.25,
      }}>{action.title}</p>

      <p style={{ margin: 0, fontSize: 11.5, color: sub, lineHeight: 1.5 }}>{action.detail}</p>

      {/* How this one compares with the best move available. */}
      <div
        role="img"
        aria-label={`Would add ${action.lift.toFixed(2)} points to the overall score`}
        style={{
          height: 6, borderRadius: 999, marginTop: 2,
          backgroundColor: highlight ? 'rgba(14,17,23,0.16)' : `${muted}29`, overflow: 'hidden',
        }}
      >
        <div className="bar-grow" style={{
          width: `${share}%`, height: '100%', borderRadius: 999,
          backgroundColor: highlight ? ON_LIME : barFill,
        }} />
      </div>

      <button
        onClick={onOpen}
        className="press"
        style={{
          marginTop: 'auto', display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
          gap: 6, padding: '10px 16px', borderRadius: 999, cursor: 'pointer', border: 'none',
          backgroundColor: highlight ? ON_LIME : chrome, color: highlight ? LIME : '#ffffff',
          fontSize: 12, fontWeight: 800,
        }}
      >
        {action.cta} <ArrowRight size={13} />
      </button>
    </article>
  );
}

/** A round avatar from initials — no network image, so nothing to fail. */
function Initials({ name, highlight }: { name: string; highlight: boolean }) {
  const letters = name.trim().split(/\s+/).slice(0, 2).map(w => w[0]?.toUpperCase() ?? '').join('') || '?';
  const HUES = ['#3e63dd', '#12a594', '#e5484d', '#8b5cf6', '#c77414', '#d6409f'];
  let sum = 0;
  for (let i = 0; i < name.length; i++) sum += name.charCodeAt(i);
  return (
    <span
      aria-hidden="true"
      style={{
        width: 34, height: 34, borderRadius: 999, flexShrink: 0,
        backgroundColor: HUES[sum % HUES.length], color: '#ffffff',
        display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
        fontSize: 12, fontWeight: 800,
        border: highlight ? '2px solid rgba(14,17,23,0.14)' : 'none',
      }}
    >
      {letters}
    </span>
  );
}
