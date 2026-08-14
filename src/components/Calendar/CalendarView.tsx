import { useEffect, useMemo, useState } from 'react';
import {
  ChevronLeft, ChevronRight, Clock, Mail, Phone,
  Plus, Search, SlidersHorizontal, Maximize2,
} from 'lucide-react';
import Header from '../Layout/Header';
import { useApp } from '../../context/AppContext';
import EventModal, { type EventDraft } from './EventModal';
import {
  busyBlocks, clock12, dateKey, dayLoad, layOutDay,
  type BusyBlock, type PositionedBlock,
} from '../../services/availability';

/**
 * The calendar.
 *
 * It shows one thing that used to be three. Appointments made in the CRM,
 * bookings taken by the public page, and the owner's own events all land on the
 * same grid, because a diary that only knows about a third of your commitments
 * is worse than no diary — it is a diary that is confidently wrong.
 *
 * The grid is laid out by time rather than by list, so a clash is something you
 * see rather than something you find out about. Overlapping entries sit side by
 * side; the one that would otherwise be hidden underneath is the one that
 * matters most.
 */

const INK = '#17191c';
const MUTED = '#6b7480';
const LINE = '#e6e8ee';
const PLANE = '#f4f5f8';
const ACCENT = '#6c5ce7';

/** Per-kind tint. The kind is also written on the card — colour is never alone. */
const KIND: Record<BusyBlock['kind'], { bg: string; edge: string; label: string }> = {
  appointment: { bg: '#eef2ff', edge: '#c7d2fe', label: 'Meeting' },
  booking: { bg: '#ecfdf5', edge: '#a7f3d0', label: 'Booked' },
  event: { bg: '#f6f6f8', edge: '#e2e4ea', label: 'My time' },
};

const STATUS: Record<string, { bg: string; fg: string; label: string }> = {
  scheduled: { bg: '#fff4e5', fg: '#b45309', label: 'Pending' },
  pending: { bg: '#fff4e5', fg: '#b45309', label: 'Pending' },
  confirmed: { bg: '#e7f8ec', fg: '#116b33', label: 'Confirmed' },
  completed: { bg: '#e7f8ec', fg: '#116b33', label: 'Done' },
  done: { bg: '#e7f8ec', fg: '#116b33', label: 'Done' },
};

type View = 'day' | 'week' | 'month' | 'year';

/**
 * "9:00–10:00 am" rather than "9:00 am–10:00 am".
 *
 * A card split two or three ways is only about seventy pixels wide, and the
 * repeated suffix was the difference between a readable range and one clipped
 * mid-word.
 */
function compactRange(startMin: number, endMin: number): string {
  const a = clock12(startMin);
  const b = clock12(endMin);
  const sa = a.slice(-2);
  return sa === b.slice(-2) ? `${a.slice(0, -3)}–${b}` : `${a}–${b}`;
}

/** The grid runs 07:00–21:00; outside that a day view would be mostly empty. */
const DAY_START = 7 * 60;
const DAY_END = 21 * 60;
const PX_PER_MIN = 1.15;

const startOfWeek = (d: Date) => {
  const out = new Date(d);
  // Monday-first, which is what the column headers show.
  const shift = (out.getDay() + 6) % 7;
  out.setDate(out.getDate() - shift);
  out.setHours(0, 0, 0, 0);
  return out;
};
const addDays = (d: Date, n: number) => {
  const out = new Date(d);
  out.setDate(out.getDate() + n);
  return out;
};

export default function CalendarView() {
  const {
    contacts, appointments, calendarEvents, bookings,
    addAppointment, updateAppointment, addCalendarEvent, updateCalendarEvent,
    deleteCalendarEvent, deleteAppointment, addNotification,
  } = useApp();

  const [view, setView] = useState<View>('week');
  const [anchor, setAnchor] = useState(() => new Date());
  const [modal, setModal] = useState<{ editing: BusyBlock | null; date: string; time: string } | null>(null);
  const [now, setNow] = useState(() => new Date());
  const [query, setQuery] = useState('');

  /* The now-line has to move, or it is a decoration that lies within the hour. */
  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), 60_000);
    return () => clearInterval(t);
  }, []);

  const blocks = useMemo(
    () => busyBlocks({ appointments, bookings, events: calendarEvents }),
    [appointments, bookings, calendarEvents],
  );

  const days = useMemo(() => {
    if (view === 'day') return [anchor];
    if (view === 'week') {
      const s = startOfWeek(anchor);
      return Array.from({ length: 7 }, (_, i) => addDays(s, i));
    }
    return [];
  }, [view, anchor]);

  const contactById = useMemo(() => new Map(contacts.map(c => [c.id, c])), [contacts]);

  const avatarFor = (b: BusyBlock) => {
    const name = b.contactName ?? '';
    const c = contacts.find(x => x.name === name);
    return c?.avatar || '';
  };

  /* ── Saving ── */

  function save(draft: EventDraft, editing: BusyBlock | null) {
    const contact = draft.contactId ? contactById.get(draft.contactId) : undefined;

    if (draft.kind === 'meeting') {
      const payload = {
        title: draft.title.trim(),
        contactId: draft.contactId,
        contactName: contact?.name ?? '',
        date: draft.date,
        time: draft.time,
        duration: draft.duration,
        status: 'scheduled' as const,
        type: draft.type,
        notes: draft.notes,
        location: draft.location,
      };
      if (editing && editing.kind === 'appointment') {
        updateAppointment(editing.sourceId, payload);
      } else {
        addAppointment(payload);
      }
    } else {
      const payload = {
        title: draft.title.trim(),
        date: draft.date,
        time: draft.time,
        duration: draft.duration,
        type: draft.type,
        busy: draft.busy,
        status: 'pending' as const,
        contactId: draft.contactId || undefined,
        contactName: contact?.name,
        notes: draft.notes,
        location: draft.location,
      };
      if (editing && editing.kind === 'event') {
        updateCalendarEvent(editing.sourceId, payload);
        addNotification('Event updated');
      } else {
        addCalendarEvent(payload);
        addNotification(
          draft.busy
            ? 'Added — this time is now blocked on your booking page too.'
            : 'Added as a note. It does not block your booking page.',
          'success',
        );
      }
    }
    setModal(null);
  }

  function remove(b: BusyBlock) {
    if (b.kind === 'event') deleteCalendarEvent(b.sourceId);
    else if (b.kind === 'appointment') deleteAppointment(b.sourceId);
    else addNotification('Bookings are cancelled from the Scheduling page, not deleted here.', 'info');
    setModal(null);
  }

  const openAt = (date: Date, minutes: number) => setModal({
    editing: null,
    date: dateKey(date),
    time: `${String(Math.floor(minutes / 60)).padStart(2, '0')}:${String(minutes % 60).padStart(2, '0')}`,
  });

  const step = (dir: -1 | 1) => {
    if (view === 'day') setAnchor(a => addDays(a, dir));
    else if (view === 'week') setAnchor(a => addDays(a, dir * 7));
    else if (view === 'month') setAnchor(a => new Date(a.getFullYear(), a.getMonth() + dir, 1));
    else setAnchor(a => new Date(a.getFullYear() + dir, a.getMonth(), 1));
  };

  const rangeLabel = view === 'year'
    ? String(anchor.getFullYear())
    : view === 'month'
      ? anchor.toLocaleDateString([], { month: 'long', year: 'numeric' })
      : view === 'day'
        ? anchor.toLocaleDateString([], { weekday: 'long', day: 'numeric', month: 'long' })
        : `${startOfWeek(anchor).toLocaleDateString([], { day: 'numeric', month: 'short' })} – ${addDays(startOfWeek(anchor), 6).toLocaleDateString([], { day: 'numeric', month: 'short' })}`;

  return (
    <div style={{ minHeight: '100vh' }}>
      <Header title="Calendar" subtitle="Meetings, bookings and your own time, on one grid" />

      <div style={{ padding: '18px 22px 30px', display: 'flex', gap: 16, alignItems: 'flex-start', flexWrap: 'wrap' }}>

        {/* ── Schedule ── */}
        <section style={{
          flex: '1 1 660px', minWidth: 320, backgroundColor: '#fff',
          borderRadius: 24, border: `1px solid ${LINE}`, overflow: 'hidden',
        }}>
          <div style={{
            display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap',
            padding: '16px 18px', borderBottom: `1px solid ${LINE}`,
          }}>
            <h2 style={{ margin: 0, fontSize: 16, fontWeight: 800, color: INK, letterSpacing: '-0.02em' }}>Schedule</h2>

            <span style={{ display: 'inline-flex', gap: 4, marginLeft: 6 }}>
              <button onClick={() => step(-1)} aria-label="Previous" style={iconBtn()}><ChevronLeft size={14} /></button>
              <button onClick={() => setAnchor(new Date())} style={{ ...ghost(), padding: '7px 12px' }}>Today</button>
              <button onClick={() => step(1)} aria-label="Next" style={iconBtn()}><ChevronRight size={14} /></button>
            </span>
            <span style={{ fontSize: 12, color: MUTED, fontWeight: 600 }}>{rangeLabel}</span>

            <span style={{ flex: 1 }} />

            <div style={{
              display: 'inline-flex', gap: 2, padding: 3, borderRadius: 999, backgroundColor: PLANE,
            }}>
              {(['day', 'week', 'month', 'year'] as const).map(v => (
                <button
                  key={v}
                  onClick={() => setView(v)}
                  aria-pressed={view === v}
                  style={{
                    padding: '7px 15px', borderRadius: 999, border: 'none', cursor: 'pointer',
                    fontFamily: 'inherit', fontSize: 12, fontWeight: view === v ? 800 : 600,
                    backgroundColor: view === v ? INK : 'transparent',
                    color: view === v ? '#fff' : MUTED, textTransform: 'capitalize',
                  }}
                >{v}</button>
              ))}
            </div>

            <button onClick={() => openAt(anchor, 9 * 60)} style={primary()}>
              Add New <Plus size={14} />
            </button>
          </div>

          {(view === 'day' || view === 'week') && (
            <TimeGrid
              days={days}
              blocks={blocks}
              now={now}
              avatarFor={avatarFor}
              onOpenSlot={openAt}
              onOpenBlock={b => setModal({ editing: b, date: b.date, time: '' })}
            />
          )}
          {view === 'month' && (
            <MonthGrid anchor={anchor} blocks={blocks} onPickDay={d => { setAnchor(d); setView('day'); }} />
          )}
          {view === 'year' && (
            <YearGrid anchor={anchor} blocks={blocks} onPickMonth={m => { setAnchor(m); setView('month'); }} />
          )}
        </section>

        {/* ── Quick Connects ── */}
        <aside style={{
          flex: '0 1 330px', minWidth: 280, backgroundColor: '#fff',
          borderRadius: 24, border: `1px solid ${LINE}`, overflow: 'hidden',
          alignSelf: 'stretch',
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '16px 16px 12px' }}>
            <h2 style={{ margin: 0, fontSize: 15, fontWeight: 800, color: INK, letterSpacing: '-0.02em' }}>
              Quick Connects
            </h2>
            <span style={{ flex: 1 }} />
            <span style={{ position: 'relative' }}>
              <Search size={13} style={{ position: 'absolute', left: 9, top: 8, color: MUTED }} />
              <input
                value={query}
                onChange={e => setQuery(e.target.value)}
                placeholder="Search"
                aria-label="Search upcoming"
                style={{
                  width: 120, padding: '6px 10px 6px 26px', borderRadius: 999,
                  border: `1px solid ${LINE}`, fontSize: 11.5, color: INK,
                  fontFamily: 'inherit', outline: 'none',
                }}
              />
            </span>
            <button aria-label="Filters" style={iconBtn()}><SlidersHorizontal size={13} /></button>
          </div>

          <QuickConnects
            blocks={blocks}
            query={query}
            contacts={contacts}
            onOpen={b => setModal({ editing: b, date: b.date, time: '' })}
          />
        </aside>
      </div>

      {modal && (
        <EventModal
          editing={modal.editing}
          defaultDate={modal.date}
          defaultTime={modal.time || '09:00'}
          blocks={blocks}
          onClose={() => setModal(null)}
          onSave={save}
          onDelete={remove}
        />
      )}
    </div>
  );
}

/* ── The week/day grid ── */

function TimeGrid({ days, blocks, now, avatarFor, onOpenSlot, onOpenBlock }: {
  days: Date[];
  blocks: BusyBlock[];
  now: Date;
  avatarFor: (b: BusyBlock) => string;
  onOpenSlot: (d: Date, minutes: number) => void;
  onOpenBlock: (b: BusyBlock) => void;
}) {
  const hours = useMemo(() => {
    const out: number[] = [];
    for (let m = DAY_START; m <= DAY_END; m += 60) out.push(m);
    return out;
  }, []);
  const height = (DAY_END - DAY_START) * PX_PER_MIN;
  const nowMin = now.getHours() * 60 + now.getMinutes();
  const todayKey = dateKey(now);
  const showNow = nowMin >= DAY_START && nowMin <= DAY_END && days.some(d => dateKey(d) === todayKey);

  return (
    <div style={{ display: 'flex', overflowX: 'auto' }}>
      {/* Hour gutter */}
      <div style={{ width: 58, flexShrink: 0, position: 'relative', paddingTop: 34 }}>
        {hours.map(m => (
          <div key={m} style={{
            position: 'absolute', top: 34 + (m - DAY_START) * PX_PER_MIN - 7, right: 8,
            fontSize: 10.5, color: MUTED, fontVariantNumeric: 'tabular-nums',
          }}>{String(Math.floor(m / 60)).padStart(2, '0')}:00</div>
        ))}
        <div style={{ height }} />
      </div>

      {/* Day columns */}
      <div style={{ display: 'flex', flex: 1, minWidth: days.length * 168 }}>
        {days.map(day => {
          const key = dateKey(day);
          const isToday = key === todayKey;
          const laid = layOutDay(blocks.filter(b => b.date === key));
          return (
            <div key={key} style={{ flex: 1, minWidth: 168, borderLeft: `1px solid ${LINE}` }}>
              {/* Column head */}
              <div style={{
                height: 34, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 5,
                fontSize: 11.5, fontWeight: 700, color: isToday ? ACCENT : MUTED,
                borderBottom: `1px solid ${LINE}`,
              }}>
                {day.toLocaleDateString([], { weekday: 'short' })}
                <span style={{
                  display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                  minWidth: 19, height: 19, borderRadius: 999, fontSize: 11,
                  backgroundColor: isToday ? ACCENT : 'transparent', color: isToday ? '#fff' : INK,
                }}>{day.getDate()}</span>
              </div>

              {/* Slots */}
              <div style={{ position: 'relative', height }}>
                {hours.map(m => (
                  <button
                    key={m}
                    onClick={() => onOpenSlot(day, m)}
                    aria-label={`Add at ${clock12(m)} on ${day.toLocaleDateString()}`}
                    style={{
                      position: 'absolute', left: 0, right: 0,
                      top: (m - DAY_START) * PX_PER_MIN, height: 60 * PX_PER_MIN,
                      border: 'none', borderTop: `1px solid ${LINE}`, background: 'none',
                      cursor: 'pointer', padding: 0,
                    }}
                    onMouseEnter={e => { e.currentTarget.style.backgroundColor = 'rgba(108,92,231,0.045)'; }}
                    onMouseLeave={e => { e.currentTarget.style.backgroundColor = 'transparent'; }}
                  />
                ))}

                {showNow && isToday && (
                  <div style={{
                    position: 'absolute', left: 0, right: 0, top: (nowMin - DAY_START) * PX_PER_MIN,
                    borderTop: `2px dashed ${ACCENT}`, pointerEvents: 'none', zIndex: 3,
                  }}>
                    <span style={{
                      position: 'absolute', left: 3, top: -8, fontSize: 9.5, fontWeight: 800,
                      color: '#fff', backgroundColor: ACCENT, padding: '1px 5px', borderRadius: 999,
                    }}>{clock12(nowMin)}</span>
                  </div>
                )}

                {laid.map(b => <EventCard key={b.id} b={b} avatar={avatarFor(b)} onOpen={() => onOpenBlock(b)} />)}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function EventCard({ b, avatar, onOpen }: { b: PositionedBlock; avatar: string; onOpen: () => void }) {
  const kind = KIND[b.kind];
  const status = STATUS[b.status ?? ''] ?? null;
  const top = (b.startMin - DAY_START) * PX_PER_MIN;
  const h = Math.max(38, (b.endMin - b.startMin) * PX_PER_MIN);
  const width = `calc(${100 / b.columns}% - 6px)`;
  const left = `calc(${(100 / b.columns) * b.column}% + 3px)`;

  return (
    <button
      onClick={onOpen}
      aria-label={`${b.title} at ${clock12(b.startMin)}`}
      style={{
        position: 'absolute', top, left, width, height: h, zIndex: 2,
        textAlign: 'left', padding: '7px 8px', cursor: 'pointer', overflow: 'hidden',
        borderRadius: 12, border: `1px solid ${kind.edge}`, backgroundColor: kind.bg,
        fontFamily: 'inherit', display: 'flex', flexDirection: 'column', gap: 3,
        opacity: b.blocking ? 1 : 0.72,
      }}
    >
      {/*
        No kebab here. The reference shows one, but the card is already a button
        and a button inside a button is invalid markup that keyboard and screen
        readers handle badly — and on a card split three ways those fourteen
        pixels were the difference between a readable name and one letter.
        Everything the kebab offered is in the panel this card opens.
      */}
      <span style={{ display: 'flex', alignItems: 'flex-start', gap: 5, minWidth: 0 }}>
        {avatar
          ? <img src={avatar} alt="" style={{ width: 18, height: 18, borderRadius: 999, objectFit: 'cover', flexShrink: 0, marginTop: 1 }} />
          : <span style={{
              width: 18, height: 18, borderRadius: 999, flexShrink: 0, backgroundColor: '#fff',
              border: `1px solid ${kind.edge}`, display: 'inline-flex', alignItems: 'center',
              justifyContent: 'center', fontSize: 8.5, fontWeight: 800, color: MUTED, marginTop: 1,
            }}>{(b.contactName || b.title || '?').charAt(0).toUpperCase()}</span>}
        <span style={{ minWidth: 0, flex: 1 }}>
          {/* Two lines rather than an ellipsis: on a narrow card an ellipsis
              leaves a single initial, which identifies nothing. */}
          <span style={{
            display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden',
            fontSize: 11, fontWeight: 800, color: INK, lineHeight: 1.22, overflowWrap: 'anywhere',
          }}>{b.contactName || b.title}</span>
          {h > 52 && (
            <span style={{
              display: 'block', fontSize: 9.5, color: MUTED, lineHeight: 1.25, marginTop: 1,
              overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
            }}>{b.contactName ? b.title : kind.label}</span>
          )}
        </span>
      </span>

      {h > 62 && (
        <span style={{ display: 'flex', alignItems: 'center', gap: 5, marginTop: 'auto', flexWrap: 'wrap' }}>
          <Clock size={10} color={MUTED} />
          <span style={{ fontSize: 9, color: MUTED, fontVariantNumeric: 'tabular-nums', whiteSpace: 'nowrap' }}>
            {compactRange(b.startMin, b.endMin)}
          </span>
          <span style={{ flex: 1 }} />
          {status && (
            <span style={{
              fontSize: 9, fontWeight: 800, padding: '2px 7px', borderRadius: 999,
              backgroundColor: status.bg, color: status.fg,
            }}>{status.label}</span>
          )}
          {!b.blocking && (
            <span style={{
              fontSize: 9, fontWeight: 800, padding: '2px 7px', borderRadius: 999,
              backgroundColor: '#eef2ff', color: '#4338ca',
            }}>Free</span>
          )}
        </span>
      )}
    </button>
  );
}

/* ── Month ── */

function MonthGrid({ anchor, blocks, onPickDay }: {
  anchor: Date; blocks: BusyBlock[]; onPickDay: (d: Date) => void;
}) {
  const first = new Date(anchor.getFullYear(), anchor.getMonth(), 1);
  const start = startOfWeek(first);
  const cells = Array.from({ length: 42 }, (_, i) => addDays(start, i));
  const todayKey = dateKey(new Date());

  return (
    <div style={{ padding: 14 }}>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: 6, marginBottom: 6 }}>
        {['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'].map(d => (
          <div key={d} style={{ fontSize: 10.5, fontWeight: 800, color: MUTED, textAlign: 'center' }}>{d}</div>
        ))}
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: 6 }}>
        {cells.map(d => {
          const key = dateKey(d);
          const load = dayLoad(blocks, key);
          const outside = d.getMonth() !== anchor.getMonth();
          const isToday = key === todayKey;
          return (
            <button
              key={key}
              onClick={() => onPickDay(d)}
              style={{
                minHeight: 78, padding: 7, borderRadius: 12, cursor: 'pointer', textAlign: 'left',
                border: `1px solid ${isToday ? ACCENT : LINE}`,
                backgroundColor: outside ? '#fbfbfc' : '#fff',
                opacity: outside ? 0.55 : 1, fontFamily: 'inherit',
                display: 'flex', flexDirection: 'column', gap: 4,
              }}
            >
              <span style={{ fontSize: 11.5, fontWeight: isToday ? 800 : 600, color: isToday ? ACCENT : INK }}>
                {d.getDate()}
              </span>
              {load.count > 0 && (
                <>
                  <span style={{ fontSize: 10, color: MUTED }}>
                    {load.count} item{load.count === 1 ? '' : 's'}
                  </span>
                  <span style={{ display: 'flex', gap: 2, flexWrap: 'wrap', marginTop: 'auto' }}>
                    {blocks.filter(b => b.date === key).slice(0, 4).map(b => (
                      <span key={b.id} style={{
                        width: 6, height: 6, borderRadius: 999, backgroundColor: KIND[b.kind].edge,
                      }} />
                    ))}
                  </span>
                </>
              )}
            </button>
          );
        })}
      </div>
    </div>
  );
}

/* ── Year ── */

function YearGrid({ anchor, blocks, onPickMonth }: {
  anchor: Date; blocks: BusyBlock[]; onPickMonth: (d: Date) => void;
}) {
  const year = anchor.getFullYear();
  const perMonth = useMemo(() => {
    const counts = new Array(12).fill(0);
    for (const b of blocks) {
      const [y, m] = b.date.split('-').map(Number);
      if (y === year && m >= 1 && m <= 12) counts[m - 1] += 1;
    }
    return counts;
  }, [blocks, year]);
  const busiest = Math.max(1, ...perMonth);

  return (
    <div style={{ padding: 16, display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: 10 }}>
      {perMonth.map((count, i) => {
        const d = new Date(year, i, 1);
        return (
          <button
            key={i}
            onClick={() => onPickMonth(d)}
            style={{
              padding: 13, borderRadius: 14, border: `1px solid ${LINE}`, backgroundColor: '#fff',
              cursor: 'pointer', textAlign: 'left', fontFamily: 'inherit',
            }}
          >
            <p style={{ margin: 0, fontSize: 13, fontWeight: 800, color: INK }}>
              {d.toLocaleDateString([], { month: 'long' })}
            </p>
            <p style={{ margin: '2px 0 8px', fontSize: 11, color: MUTED }}>
              {count} item{count === 1 ? '' : 's'}
            </p>
            <span style={{ display: 'block', height: 5, borderRadius: 999, backgroundColor: PLANE, overflow: 'hidden' }}>
              <span style={{
                display: 'block', height: '100%', width: `${Math.round((count / busiest) * 100)}%`,
                backgroundColor: ACCENT, borderRadius: 999,
              }} />
            </span>
          </button>
        );
      })}
    </div>
  );
}

/* ── Quick Connects ── */

function QuickConnects({ blocks, query, contacts, onOpen }: {
  blocks: BusyBlock[];
  query: string;
  contacts: { id: string; name: string; avatar?: string; email?: string; phone?: string }[];
  onOpen: (b: BusyBlock) => void;
}) {
  const today = dateKey(new Date());
  const upcoming = useMemo(() => {
    const q = query.trim().toLowerCase();
    return blocks
      .filter(b => b.date >= today)
      .filter(b => !q || b.title.toLowerCase().includes(q) || (b.contactName ?? '').toLowerCase().includes(q))
      .slice(0, 25);
  }, [blocks, query, today]);

  if (!upcoming.length) {
    return (
      <p style={{ margin: 0, padding: '26px 18px 30px', fontSize: 12, color: MUTED, lineHeight: 1.65 }}>
        {query.trim()
          ? 'Nothing upcoming matches that.'
          : 'Nothing coming up. Anything you add — a meeting, a booking from your public page, or your own time — shows here.'}
      </p>
    );
  }

  return (
    <div style={{ padding: '0 12px 14px', display: 'grid', gap: 8, maxHeight: 640, overflowY: 'auto' }}>
      {upcoming.map(b => {
        const c = contacts.find(x => x.name === b.contactName);
        const kind = KIND[b.kind];
        const day = new Date(`${b.date}T12:00:00`);
        return (
          <div key={b.id} style={{
            display: 'flex', gap: 9, alignItems: 'center',
            padding: 10, borderRadius: 14, border: `1px solid ${LINE}`, backgroundColor: '#fff',
          }}>
            <div style={{ width: 44, flexShrink: 0, textAlign: 'center' }}>
              <p style={{ margin: 0, fontSize: 9.5, color: MUTED }}>
                {day.toLocaleDateString([], { day: '2-digit', month: 'short' })}
              </p>
              <p style={{ margin: 0, fontSize: 10.5, fontWeight: 800, color: INK, fontVariantNumeric: 'tabular-nums' }}>
                {clock12(b.startMin)}
              </p>
            </div>

            {c?.avatar
              ? <img src={c.avatar} alt="" style={{ width: 32, height: 32, borderRadius: 999, objectFit: 'cover', flexShrink: 0 }} />
              : <span style={{
                  width: 32, height: 32, borderRadius: 999, flexShrink: 0, backgroundColor: kind.bg,
                  border: `1px solid ${kind.edge}`, display: 'inline-flex', alignItems: 'center',
                  justifyContent: 'center', fontSize: 11, fontWeight: 800, color: INK,
                }}>{(b.contactName || b.title).charAt(0).toUpperCase()}</span>}

            <div style={{ flex: 1, minWidth: 0 }}>
              <p style={{
                margin: 0, fontSize: 12, fontWeight: 700, color: INK,
                overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
              }}>{b.contactName || b.title}</p>
              <p style={{
                margin: 0, fontSize: 10.5, color: MUTED,
                overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
              }}>{b.contactName ? b.title : kind.label}</p>
            </div>

            <span style={{ display: 'inline-flex', gap: 5, flexShrink: 0 }}>
              {c?.phone && (
                <a href={`tel:${c.phone}`} aria-label={`Call ${c.name}`} style={{ ...iconBtn(), textDecoration: 'none' }}>
                  <Phone size={13} />
                </a>
              )}
              {c?.email && (
                <a href={`mailto:${c.email}`} aria-label={`Email ${c.name}`} style={{ ...iconBtn(), textDecoration: 'none' }}>
                  <Mail size={13} />
                </a>
              )}
              <button onClick={() => onOpen(b)} aria-label={`Open ${b.title}`} style={iconBtn()}>
                <Maximize2 size={12} />
              </button>
            </span>
          </div>
        );
      })}
    </div>
  );
}

/* ── Styles ── */

const primary = (): React.CSSProperties => ({
  display: 'inline-flex', alignItems: 'center', gap: 6, padding: '9px 16px',
  borderRadius: 999, border: 'none', backgroundColor: INK, color: '#fff',
  fontSize: 12.5, fontWeight: 800, fontFamily: 'inherit', cursor: 'pointer', whiteSpace: 'nowrap',
});

const ghost = (): React.CSSProperties => ({
  display: 'inline-flex', alignItems: 'center', gap: 6, padding: '8px 13px',
  borderRadius: 999, border: `1px solid ${LINE}`, backgroundColor: '#fff', color: INK,
  fontSize: 11.5, fontWeight: 700, fontFamily: 'inherit', cursor: 'pointer', whiteSpace: 'nowrap',
});

const iconBtn = (): React.CSSProperties => ({
  width: 27, height: 27, borderRadius: 999, border: `1px solid ${LINE}`,
  backgroundColor: '#fff', color: MUTED, cursor: 'pointer',
  display: 'inline-flex', alignItems: 'center', justifyContent: 'center', padding: 0, flexShrink: 0,
});
