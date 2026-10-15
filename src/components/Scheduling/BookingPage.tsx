/**
 * /book/<slug> — the page a visitor books on, and /book?manage=<id>.<key>,
 * where a guest moves or cancels what they booked.
 *
 * The card itself (BookingCard.tsx) is shared with the preview in the AI
 * Autopilot wizard. This file is what only the live page does: find the
 * workspace the link names, fetch what is already booked, file the booking,
 * and the screens around it — meeting types, confirmed, manage, cancelled.
 *
 * Every time shown is the visitor's own; every time stored is the owner's
 * wall clock (services/bookingTime.ts says why both, and how).
 */
import { useCallback, useEffect, useMemo, useState } from 'react';
import { usePageTitle } from '../../services/pageTitle';
import { useParams } from 'react-router-dom';
import { CalendarPlus, Check, Clock, Download, X } from 'lucide-react';
import { useApp } from '../../context/AppContext';
import { busyBlocks, hhmm } from '../../services/availability';
import type { Booking, EventType, ScheduleAvailability } from '../../types';
import {
  fetchPublicConfig, fetchBookedRange, createRemoteBooking,
  getRemoteBooking, cancelRemoteBooking, rescheduleRemoteBooking,
  buildIcs, googleCalendarUrl, type BookingDelivery,
} from '../../services/booking';
import { browserZone, clockLabel, dayWords, utcToWall, wallToUtc, zoneCity, type Busy, type Slot } from '../../services/bookingTime';
import BookingCard, { themeRoot, type PageConfig } from './BookingCard';
import './bookingPage.css';

type Step = 'event' | 'calendar' | 'confirmed' | 'manage' | 'cancelled';

/*
 * The page follows the visitor's system light/dark setting — unless this
 * browser has chosen a theme in the app (`crm_theme`), which then wins. The
 * app writes data-theme="light" on <html> even when nobody chose it, so that
 * attribute alone cannot tell a choice from the default; `data-auto` does.
 */
const themeChosen = (() => { try { return !!localStorage.getItem('crm_theme'); } catch { return false; } })();
const rootAttrs = { 'data-noinvert': '', ...(themeChosen ? {} : { 'data-auto': '' }) };
type Booked = { date: string; time: string; duration: number };

export default function BookingPage() {
  const {
    schedule, bookings, addBooking, addAppointment, contacts, addContact, addContactActivity,
    appointments, calendarEvents,
  } = useApp();

  /* What is already in the owner's diary as this browser knows it — an owner
     opening their own page, signed in. A visitor's browser has none of it and
     relies on the server's list below. */
  const localBusy = useMemo<Busy[]>(
    () => busyBlocks({ appointments, bookings, events: calendarEvents })
      .filter(b => b.blocking)
      .map(b => ({ date: b.date, time: hhmm(b.startMin), duration: b.endMin - b.startMin })),
    [appointments, bookings, calendarEvents],
  );

  const [remoteCfg, setRemoteCfg] = useState<Partial<ScheduleAvailability> | null | 'loading'>('loading');
  const [eventType, setEventType] = useState<EventType | null>(null);
  const [step, setStep] = useState<Step>('calendar');
  const [booked, setBooked] = useState<Booked[]>([]);
  const [confirmed, setConfirmed] = useState<{ utc: number; ownerDate: string; ownerTime: string; zone: string; manageUrl?: string } | null>(null);
  const [manage, setManage] = useState<{ id: string; key: string; booking: (Booking & { startsAt?: string; ownerTimezone?: string }) | null } | null>(null);
  const [rescheduling, setRescheduling] = useState(false);
  const { slug } = useParams<{ slug?: string }>();
  const [unknownLink, setUnknownLink] = useState(false);
  const [pageAccount, setPageAccount] = useState('');
  const [emailed, setEmailed] = useState(false);
  const [cancelError, setCancelError] = useState('');
  const [delivery, setDelivery] = useState<BookingDelivery | undefined>(undefined);

  /* Load the published config; fall back to this browser's local schedule.

     A guest's manage link names its booking, and the booking names its
     workspace — so the page is found from that, not from the slug. */
  useEffect(() => {
    let alive = true;
    const params = new URLSearchParams(window.location.search);
    const m = params.get('manage');
    const loadConfig = (accountId?: string) => fetchPublicConfig(accountId ? undefined : slug, accountId).then(res => {
      if (!alive) return;
      if (res && 'notFound' in res) { setUnknownLink(true); return; }
      if (res?.accountId) setPageAccount(res.accountId);
      if (res && 'delivery' in res) setDelivery(res.delivery);
      setRemoteCfg(res?.config ?? null);
    });
    if (m && m.includes('.')) {
      const [id, key] = m.split('.');
      getRemoteBooking(id, key).then(b => {
        if (!alive) return;
        setManage({ id, key, booking: b });
        setStep('manage');
        const owner = (b as (Booking & { accountId?: string }) | null)?.accountId;
        if (owner) void loadConfig(owner);
        else setRemoteCfg(null);
      });
    } else {
      void loadConfig();
    }
    return () => { alive = false; };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [slug]);

  const cfg: PageConfig = useMemo(() => {
    if (remoteCfg && remoteCfg !== 'loading') return { ...schedule, ...remoteCfg } as PageConfig;
    return schedule;
  }, [remoteCfg, schedule]);

  const eventTypes = cfg.eventTypes ?? [];
  const activeDuration = eventType?.duration ?? cfg.duration;
  const activeLocation = eventType?.location || cfg.location || '';
  const activeTitle = eventType?.name ?? cfg.title ?? 'Meeting';
  const businessName = (cfg.businessName || '').trim();
  usePageTitle(activeTitle || 'Book a time');

  useEffect(() => {
    if (step === 'calendar' && eventTypes.length > 1 && !eventType) setStep('event');
    if (eventTypes.length === 1 && !eventType) setEventType(eventTypes[0]);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [eventTypes.length, step]);

  /* What the server says is booked across the owner dates the visible month
     draws on — one request a month, not one a click. */
  const onRange = useCallback((from: string, to: string) => {
    if (!pageAccount) return;
    void fetchBookedRange(pageAccount, from, to).then(list => { if (list) setBooked(list); });
  }, [pageAccount]);
  const busy = useMemo<Busy[]>(() => [...booked, ...localBusy], [booked, localBusy]);

  if (unknownLink) {
    return (
      <div className="bkp" {...rootAttrs} {...themeRoot(cfg)}>
        <main className="bkp-card" data-narrow="">
          <div className="bkp-done">
            <div className="bkp-tick" data-bad=""><X size={28} /></div>
            <h1>This booking link does not exist</h1>
            <p>Check the address, or ask whoever sent it for an up-to-date link.</p>
          </div>
        </main>
      </div>
    );
  }

  if (remoteCfg === 'loading') {
    return <div className="bkp" {...rootAttrs} {...themeRoot(cfg)} aria-busy="true"><p className="bkp-foot">Loading…</p></div>;
  }

  const finalizeLocalRecords = (s: Slot, guest: { name: string; email: string; phone: string; notes: string }, zone: string) => {
    /* Also recorded in this browser — the owner trying their own page sees it
       at once. Harmless for a real visitor, whose browser holds no CRM. */
    addBooking({
      slotDate: s.ownerDate, slotTime: s.ownerTime,
      guestName: guest.name.trim(), guestEmail: guest.email.trim(),
      guestPhone: guest.phone.trim(), notes: guest.notes.trim(),
      status: 'confirmed', timezone: zone, createdAt: new Date().toISOString(),
      eventTypeId: eventType?.id, eventTypeName: activeTitle, duration: activeDuration, location: activeLocation,
    });
    addAppointment({
      title: `${activeTitle} — ${guest.name}`,
      contactId: '', contactName: guest.name.trim(),
      date: s.ownerDate, time: clockLabel(s.ownerTime).toUpperCase(), duration: activeDuration,
      status: 'scheduled', type: 'Video Call',
      notes: `Booked via scheduling page. ${guest.notes}`.trim(),
    });
    const existing = contacts.find(c => c.email.toLowerCase() === guest.email.toLowerCase());
    if (!existing) {
      addContact({
        name: guest.name.trim(), email: guest.email.trim(), phone: guest.phone.trim(),
        status: 'lead', tags: ['Booked Meeting'], source: 'Booking Page',
        createdAt: new Date().toISOString().split('T')[0], lastActivity: new Date().toISOString().split('T')[0], value: 0,
      });
    } else {
      addContactActivity(existing.id, {
        type: 'meeting',
        description: `Meeting booked: ${activeTitle} on ${s.ownerDate} at ${clockLabel(s.ownerTime)}`,
        timestamp: new Date().toISOString(),
      });
    }
  };

  const onBook = async (s: Slot, guest: { name: string; email: string; phone: string; notes: string }, zone: string): Promise<string | null> => {
    const res = await createRemoteBooking({
      accountId: pageAccount,
      eventTypeId: eventType?.id,
      slotDate: s.ownerDate, slotTime: s.ownerTime,
      guestName: guest.name.trim(), guestEmail: guest.email.trim(),
      guestPhone: guest.phone.trim(), notes: guest.notes.trim(), timezone: zone,
    });
    /* Unreachable used to fall through to "You're booked!" with the booking
       saved only in the visitor's own browser, where the business never sees
       it. A visitor told they are booked does not try again. */
    if (!res.ok) {
      if (pageAccount) onRange(s.ownerDate, s.ownerDate);
      return res.error === 'unreachable'
        ? 'We could not reach the booking service, so nothing was booked. Check your connection and try again.'
        : res.error || 'Booking failed — please pick another time.';
    }
    setEmailed(!!res.emailed);
    finalizeLocalRecords(s, guest, zone);
    const utc = res.startsAt ? Date.parse(res.startsAt) : s.utc;
    setConfirmed({
      utc: Number.isFinite(utc) && utc > 0 ? utc : s.utc, ownerDate: s.ownerDate, ownerTime: s.ownerTime, zone,
      manageUrl: res.id ? `${window.location.origin}/book?manage=${res.id}.${res.key}` : undefined,
    });
    setStep('confirmed');
    return null;
  };

  const onReschedule = async (s: Slot): Promise<string | null> => {
    if (!manage) return 'That booking could not be found.';
    const res = await rescheduleRemoteBooking(manage.id, manage.key, s.ownerDate, s.ownerTime);
    if (!res.ok) return res.error || 'Reschedule failed.';
    setEmailed(!!res.emailed);
    setConfirmed({ utc: s.utc, ownerDate: s.ownerDate, ownerTime: s.ownerTime, zone: browserZone(), manageUrl: `${window.location.origin}/book?manage=${manage.id}.${manage.key}` });
    setStep('confirmed');
    return null;
  };

  /** The instant an existing booking names: the server's own stamp, else the owner's wall clock. */
  const instantOf = (b: { slotDate: string; slotTime: string; startsAt?: string; ownerTimezone?: string }): number | null => {
    const stamped = b.startsAt ? Date.parse(b.startsAt) : NaN;
    if (Number.isFinite(stamped) && stamped > 0) return stamped;
    return wallToUtc(b.slotDate, b.slotTime, b.ownerTimezone || cfg.timezone);
  };
  const when = (utc: number, zone: string) =>
    `${dayWords(utc, zone, { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })} at ${clockLabel(utcToWall(utc, zone).time)}`;

  /* ── Manage (guest cancel / reschedule) ── */
  if (step === 'manage') {
    const b = manage?.booking ?? null;
    const at = b ? instantOf(b) : null;
    const zone = browserZone();
    return (
      <div className="bkp" {...rootAttrs} {...themeRoot(cfg)}>
        <main className="bkp-card" data-narrow="">
          <div className="bkp-done">
            {!b ? (
              <>
                <div className="bkp-tick" data-bad=""><X size={28} /></div>
                <h1>Booking not found</h1>
                <p>This link is invalid or the booking no longer exists.</p>
              </>
            ) : (
              <>
                <h1>Manage your booking</h1>
                <p>Hi {b.guestName} — here is your meeting.</p>
                <div className="bkp-summary">
                  <b>{b.eventTypeName ?? cfg.title}</b>
                  <span><Clock size={14} style={{ verticalAlign: -2 }} /> {at !== null ? `${when(at, zone)} (${zoneCity(zone)} time)` : `${b.slotDate} ${b.slotTime}`}</span>
                  <span className="bkp-note">Status: <strong style={{ textTransform: 'capitalize' }}>{b.status}</strong></span>
                </div>
                {cancelError && <p className="bkp-error" role="alert">{cancelError}</p>}
                {b.status === 'confirmed' && (
                  <div className="bkp-actions">
                    <button type="button" className="bkp-btn" onClick={() => { setRescheduling(true); setStep('calendar'); }}>Reschedule</button>
                    <button type="button" className="bkp-btn" data-danger="" onClick={async () => {
                      if (!manage) return;
                      const r = await cancelRemoteBooking(manage.id, manage.key);
                      if (r.ok) { setEmailed(r.emailed); setStep('cancelled'); } else setCancelError('That did not go through — try again in a moment.');
                    }}>Cancel booking</button>
                  </div>
                )}
              </>
            )}
          </div>
        </main>
      </div>
    );
  }

  if (step === 'cancelled') {
    return (
      <div className="bkp" {...rootAttrs} {...themeRoot(cfg)}>
        <main className="bkp-card" data-narrow="">
          <div className="bkp-done">
            <div className="bkp-tick" data-bad=""><X size={28} /></div>
            <h1>Booking cancelled</h1>
            <p>{emailed ? 'A cancellation confirmation has been emailed to you. ' : ''}You can book a new time any time.</p>
          </div>
        </main>
      </div>
    );
  }

  /* ── Confirmed ── */
  if (step === 'confirmed' && confirmed) {
    const cal = { title: activeTitle, description: cfg.description, location: activeLocation, date: confirmed.ownerDate, time: confirmed.ownerTime, durationMin: activeDuration, startUtc: confirmed.utc };
    const downloadIcs = () => {
      const url = URL.createObjectURL(buildIcs(cal));
      const a = document.createElement('a');
      a.href = url; a.download = 'meeting.ics';
      document.body.appendChild(a); a.click(); a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 800);
    };
    return (
      <div className="bkp" {...rootAttrs} {...themeRoot(cfg)}>
        <main className="bkp-card" data-narrow="">
          <div className="bkp-done">
            <div className="bkp-tick"><Check size={30} /></div>
            <h1>{rescheduling ? 'Rescheduled' : 'You are booked'}</h1>
            <p>{emailed ? 'A confirmation email is on its way to you.' : 'Keep a note of it — add it to your calendar below.'}</p>
            <div className="bkp-summary" data-testid="booking-summary">
              <b>{activeTitle}</b>
              <span>{when(confirmed.utc, confirmed.zone)} ({zoneCity(confirmed.zone)} time)</span>
              {confirmed.zone !== cfg.timezone && (
                <span className="bkp-note">{clockLabel(confirmed.ownerTime)} in {zoneCity(cfg.timezone)}</span>
              )}
              {activeLocation && <span className="bkp-note">{activeLocation}</span>}
            </div>
            <div className="bkp-actions">
              <button type="button" className="bkp-btn" data-ghost="" onClick={downloadIcs}><Download size={15} /> Download .ics</button>
              <a className="bkp-btn" data-ghost="" href={googleCalendarUrl(cal)} target="_blank" rel="noopener noreferrer"><CalendarPlus size={15} /> Google Calendar</a>
            </div>
            {confirmed.manageUrl && (
              <p className="bkp-note">Need changes? <a href={confirmed.manageUrl} style={{ color: 'var(--bk-accent)', fontWeight: 700 }}>Reschedule or cancel</a></p>
            )}
          </div>
        </main>
      </div>
    );
  }

  /* ── Meeting types ── */
  if (step === 'event') {
    return (
      <div className="bkp" {...rootAttrs} {...themeRoot(cfg)}>
        <main className="bkp-card" data-narrow="">
          <div className="bkp-done" style={{ justifyItems: 'stretch', textAlign: 'left' }}>
            {cfg.logoUrl && <img className="bkp-logo" src={cfg.logoUrl} alt="" />}
            <h1>{cfg.title}</h1>
            <p>{cfg.description || 'Pick the type of meeting you need.'}</p>
            <div className="bkp-types">
              {eventTypes.map(et => (
                <button key={et.id} type="button" className="bkp-type" onClick={() => { setEventType(et); setStep('calendar'); }}>
                  <i style={{ background: et.color || 'var(--bk-accent)' }} />
                  <span><b>{et.name}</b>{et.description && <small>{et.description}</small>}</span>
                  <small><Clock size={13} style={{ verticalAlign: -2 }} /> {et.duration} min</small>
                </button>
              ))}
            </div>
          </div>
        </main>
      </div>
    );
  }

  return (
    <div className="bkp" {...rootAttrs} {...themeRoot(cfg)}>
      <BookingCard
        cfg={cfg} businessName={businessName} eventType={eventType} busy={busy} delivery={delivery}
        onRange={onRange}
        onBook={rescheduling ? undefined : onBook}
        onReschedule={rescheduling ? onReschedule : undefined}
        rescheduleOf={rescheduling ? (manage?.booking?.eventTypeName ?? activeTitle) : undefined}
        onBackToTypes={eventTypes.length > 1 && !rescheduling ? () => { setEventType(null); setStep('event'); } : undefined}
      />
    </div>
  );
}
