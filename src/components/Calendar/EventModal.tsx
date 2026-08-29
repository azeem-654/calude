import { useMemo, useState } from 'react';
import { useEscapeKey } from '../../hooks/useEscapeKey';
import { AlertTriangle, Check, X } from 'lucide-react';
import { useApp } from '../../context/AppContext';
import { clock12, conflictsFor, describeConflicts, type BusyBlock } from '../../services/availability';
import type { CalendarEvent } from '../../types';

/**
 * Adding or editing one calendar entry.
 *
 * Two kinds come out of this form and the difference is not cosmetic. A
 * *meeting* is with somebody and goes in as an Appointment, which is the same
 * record the public booking page creates — so booking it here takes the slot
 * off that page. An *event* is the owner's own working time and goes in as a
 * CalendarEvent, which can be marked as not blocking when it is a reminder
 * rather than an hour of work.
 *
 * The clash check runs live rather than on submit. Being told a slot is taken
 * after filling in six fields is the version of this that people learn to hate.
 */

const INK = '#17191c';
const MUTED = '#6b7480';
const LINE = '#e6e8ee';
const ACCENT = '#6c5ce7';
const WARN = '#b45309';

export interface EventDraft {
  kind: 'meeting' | 'event';
  title: string;
  date: string;
  time: string;
  duration: number;
  type: string;
  contactId: string;
  busy: boolean;
  notes: string;
  location: string;
}

interface Props {
  /** The block being edited, or null to create. */
  editing: BusyBlock | null;
  defaultDate: string;
  defaultTime: string;
  blocks: BusyBlock[];
  onClose: () => void;
  onSave: (draft: EventDraft, editing: BusyBlock | null) => void;
  onDelete?: (block: BusyBlock) => void;
}

const TYPES = [
  'Follow-up call', 'Property viewing', 'Prep time', 'Site visit',
  'Document review', 'Internal', 'Personal',
];
const DURATIONS = [15, 30, 45, 60, 90, 120];

export default function EventModal({ editing, defaultDate, defaultTime, blocks, onClose, onSave, onDelete }: Props) {
  useEscapeKey(true, onClose);
  const { contacts, appointments, calendarEvents } = useApp();

  const existing = useMemo(() => {
    if (!editing) return null;
    if (editing.kind === 'event') return calendarEvents.find(e => e.id === editing.sourceId) ?? null;
    return null;
  }, [editing, calendarEvents]);

  const existingAppt = useMemo(() => {
    if (!editing || editing.kind !== 'appointment') return null;
    return appointments.find(a => a.id === editing.sourceId) ?? null;
  }, [editing, appointments]);

  const [draft, setDraft] = useState<EventDraft>(() => ({
    kind: editing ? (editing.kind === 'event' ? 'event' : 'meeting') : 'event',
    title: editing?.title ?? '',
    date: editing?.date ?? defaultDate,
    time: editing ? `${String(Math.floor(editing.startMin / 60)).padStart(2, '0')}:${String(editing.startMin % 60).padStart(2, '0')}` : defaultTime,
    duration: editing ? editing.endMin - editing.startMin : 30,
    type: (existing as CalendarEvent | null)?.type ?? existingAppt?.type ?? 'Follow-up call',
    contactId: (existing as CalendarEvent | null)?.contactId ?? existingAppt?.contactId ?? '',
    busy: (existing as CalendarEvent | null)?.busy ?? true,
    notes: (existing as CalendarEvent | null)?.notes ?? existingAppt?.notes ?? '',
    location: (existing as CalendarEvent | null)?.location ?? existingAppt?.location ?? '',
  }));

  const set = <K extends keyof EventDraft>(k: K, v: EventDraft[K]) => setDraft(d => ({ ...d, [k]: v }));

  /* Live, and only when this entry would actually take the slot. */
  const conflicts = useMemo(() => {
    if (draft.kind === 'event' && !draft.busy) return [];
    return conflictsFor(
      { date: draft.date, time: draft.time, durationMin: draft.duration, ignoreId: editing?.sourceId },
      blocks,
    );
  }, [draft.date, draft.time, draft.duration, draft.busy, draft.kind, blocks, editing]);

  const canSave = draft.title.trim() && draft.date && draft.time;

  return (
    <div
      onClick={onClose}
      style={{
        position: 'fixed', inset: 0, backgroundColor: 'rgba(17,20,26,0.45)', zIndex: 400,
        display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20,
      }}
    >
      <div
        onClick={e => e.stopPropagation()}
        role="dialog"
        aria-label={editing ? 'Edit entry' : 'Add to the calendar'}
        style={{
          width: '100%', maxWidth: 520, maxHeight: '90vh', overflowY: 'auto',
          backgroundColor: '#fff', borderRadius: 22, padding: 22,
          boxShadow: '0 24px 60px -12px rgba(16,24,40,0.3)',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 16 }}>
          <h3 style={{ margin: 0, fontSize: 17, fontWeight: 800, color: INK, letterSpacing: '-0.02em' }}>
            {editing ? 'Edit' : 'Add to the calendar'}
          </h3>
          <span style={{ flex: 1 }} />
          <button onClick={onClose} aria-label="Close" style={iconBtn()}><X size={15} /></button>
        </div>

        {/* Meeting or event — the choice that decides which store it lands in. */}
        {!editing && (
          <div style={{ display: 'flex', gap: 8, marginBottom: 14 }}>
            {([
              ['event', 'My own time', 'A follow-up, prep, a reminder'],
              ['meeting', 'A meeting', 'With a contact — takes the slot off your booking page'],
            ] as const).map(([k, label, hint]) => (
              <button
                key={k}
                onClick={() => set('kind', k)}
                aria-pressed={draft.kind === k}
                style={{
                  flex: 1, textAlign: 'left', padding: '10px 12px', borderRadius: 14, cursor: 'pointer',
                  border: `1px solid ${draft.kind === k ? ACCENT : LINE}`,
                  backgroundColor: draft.kind === k ? 'rgba(108,92,231,0.06)' : '#fff',
                  fontFamily: 'inherit',
                }}
              >
                <span style={{ display: 'block', fontSize: 12.5, fontWeight: 800, color: INK }}>{label}</span>
                <span style={{ display: 'block', fontSize: 10.5, color: MUTED, marginTop: 2, lineHeight: 1.45 }}>{hint}</span>
              </button>
            ))}
          </div>
        )}

        <Field label="Title">
          <input value={draft.title} onChange={e => set('title', e.target.value)} autoFocus
            placeholder={draft.kind === 'meeting' ? '2BHK apartment viewing' : 'Call the surveyor back'}
            style={input()} />
        </Field>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
          <Field label="Date">
            <input type="date" value={draft.date} onChange={e => set('date', e.target.value)} style={input()} />
          </Field>
          <Field label="Time">
            <input type="time" value={draft.time} onChange={e => set('time', e.target.value)} style={input()} />
          </Field>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
          <Field label="Length">
            <select value={draft.duration} onChange={e => set('duration', Number(e.target.value))} style={input()}>
              {DURATIONS.map(d => <option key={d} value={d}>{d} minutes</option>)}
            </select>
          </Field>
          <Field label="Kind">
            <select value={draft.type} onChange={e => set('type', e.target.value)} style={input()}>
              {TYPES.map(t => <option key={t} value={t}>{t}</option>)}
            </select>
          </Field>
        </div>

        <Field label={draft.kind === 'meeting' ? 'Who with' : 'About (optional)'}>
          <select value={draft.contactId} onChange={e => set('contactId', e.target.value)} style={input()}>
            <option value="">{draft.kind === 'meeting' ? 'Pick a contact…' : 'Nobody in particular'}</option>
            {contacts.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
        </Field>

        <Field label="Where (optional)">
          <input value={draft.location} onChange={e => set('location', e.target.value)}
            placeholder="A link, or an address" style={input()} />
        </Field>

        <Field label="Notes (optional)">
          <textarea value={draft.notes} onChange={e => set('notes', e.target.value)} rows={2}
            style={{ ...input(), resize: 'vertical' }} />
        </Field>

        {/* Only an owner's own event can be non-blocking. A meeting always is. */}
        {draft.kind === 'event' && (
          <label style={{
            display: 'flex', gap: 9, alignItems: 'flex-start', padding: '10px 12px', marginTop: 4,
            borderRadius: 12, border: `1px solid ${LINE}`, cursor: 'pointer',
          }}>
            <input type="checkbox" checked={draft.busy} onChange={e => set('busy', e.target.checked)}
              style={{ marginTop: 2 }} />
            <span>
              <span style={{ display: 'block', fontSize: 12.5, fontWeight: 700, color: INK }}>
                Block this time
              </span>
              <span style={{ display: 'block', fontSize: 11, color: MUTED, lineHeight: 1.5, marginTop: 2 }}>
                On, nobody can book this slot on your public page. Off, it is only a note to yourself —
                a reminder should not empty your diary.
              </span>
            </span>
          </label>
        )}

        {conflicts.length > 0 && (
          <div style={{
            marginTop: 12, padding: '11px 13px', borderRadius: 12,
            backgroundColor: '#fffbeb', border: '1px solid #fcd34d',
          }}>
            <p style={{ margin: 0, fontSize: 12, fontWeight: 800, color: WARN, display: 'flex', alignItems: 'center', gap: 6 }}>
              <AlertTriangle size={13} /> This clashes
            </p>
            <p style={{ margin: '4px 0 0', fontSize: 11.5, color: '#78350f', lineHeight: 1.55 }}>
              {describeConflicts(conflicts)} You can still save it — sometimes a double-booking is
              deliberate — but nothing will be able to book over it either way.
            </p>
            <ul style={{ margin: '6px 0 0', paddingLeft: 17, fontSize: 11, color: '#78350f', lineHeight: 1.6 }}>
              {conflicts.slice(0, 3).map(c => (
                <li key={c.id}>
                  {clock12(c.startMin)}–{clock12(c.endMin)} · {c.title}
                  <span style={{ opacity: 0.75 }}> ({c.kind})</span>
                </li>
              ))}
            </ul>
          </div>
        )}

        <div style={{ display: 'flex', gap: 8, marginTop: 16, flexWrap: 'wrap' }}>
          <button
            onClick={() => canSave && onSave(draft, editing)}
            disabled={!canSave}
            style={{ ...primary(), opacity: canSave ? 1 : 0.5, cursor: canSave ? 'pointer' : 'not-allowed' }}
          >
            <Check size={14} /> {editing ? 'Save' : 'Add it'}
          </button>
          <button onClick={onClose} style={ghost()}>Cancel</button>
          <span style={{ flex: 1 }} />
          {editing && onDelete && (
            <button onClick={() => onDelete(editing)} style={{ ...ghost(), color: '#c2410c' }}>Delete</button>
          )}
        </div>
      </div>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label style={{ display: 'block', marginBottom: 10 }}>
      <span style={{ display: 'block', fontSize: 11, fontWeight: 700, color: MUTED, marginBottom: 5 }}>{label}</span>
      {children}
    </label>
  );
}

const input = (): React.CSSProperties => ({
  width: '100%', padding: '10px 12px', borderRadius: 12, border: `1px solid ${LINE}`,
  backgroundColor: '#fff', fontSize: 13, color: INK, fontFamily: 'inherit',
  outline: 'none', boxSizing: 'border-box',
});

const primary = (): React.CSSProperties => ({
  display: 'inline-flex', alignItems: 'center', gap: 6, padding: '10px 17px',
  borderRadius: 999, border: 'none', backgroundColor: INK, color: '#fff',
  fontSize: 12.5, fontWeight: 800, fontFamily: 'inherit', cursor: 'pointer',
});

const ghost = (): React.CSSProperties => ({
  display: 'inline-flex', alignItems: 'center', gap: 6, padding: '10px 15px',
  borderRadius: 999, border: `1px solid ${LINE}`, backgroundColor: '#fff', color: INK,
  fontSize: 12.5, fontWeight: 700, fontFamily: 'inherit', cursor: 'pointer',
});

const iconBtn = (): React.CSSProperties => ({
  width: 28, height: 28, borderRadius: 999, border: `1px solid ${LINE}`,
  backgroundColor: '#fff', color: MUTED, cursor: 'pointer',
  display: 'inline-flex', alignItems: 'center', justifyContent: 'center', padding: 0,
});
