/**
 * Bookings taken on the public booking page, for screens other than Scheduling.
 *
 * A visitor's booking is written on the server (`crm_bookings`, routes/booking.ts),
 * never into the workspace's local `crm_bookings` list, so the Calendar and the
 * dashboard's "Today's schedule" — which read only the local list — never
 * showed one (audit H6, 2026-11-16). This asks the server, on open and every
 * two minutes while the screen stays open, and merges the same way
 * Scheduling does: a local copy of the same slot and guest wins.
 */
import { useEffect, useState } from 'react';
import type { Appointment, Booking } from '../types';
import { listRemoteBookings } from './booking';
import { sessionToken } from './auth';
import { getActiveAccountId } from './tenancy';

const EVERY_MS = 120_000;

export function useRemoteBookings(): Booking[] {
  const [list, setList] = useState<Booking[]>([]);
  const account = getActiveAccountId();
  useEffect(() => {
    let alive = true;
    const pull = () => {
      const token = sessionToken();
      if (!token || !getActiveAccountId()) return;
      void listRemoteBookings(token).then(l => { if (alive && l) setList(l); });
    };
    pull();
    const t = window.setInterval(pull, EVERY_MS);
    return () => { alive = false; window.clearInterval(t); };
  }, [account]);
  return list;
}

const keyOf = (b: Booking) => `${b.slotDate}|${b.slotTime}|${(b.guestEmail || '').toLowerCase()}`;

/** Local bookings plus the server's, one per slot and guest. */
export function mergeBookings(local: Booking[], remote: Booking[]): Booking[] {
  const have = new Set(local.map(keyOf));
  return [...remote.filter(r => !have.has(keyOf(r))), ...local];
}

/**
 * The server's bookings as diary entries, for the dashboard's day view, which
 * draws appointments. Only live ones; a booking already turned into a local
 * appointment is skipped by its time and guest.
 */
export function bookingsAsAppointments(remote: Booking[], appointments: Appointment[]): Appointment[] {
  const taken = new Set(appointments.map(a => `${a.date}|${a.time}|${(a.contactName || '').toLowerCase()}`));
  return remote
    .filter(b => b.status === 'confirmed')
    .filter(b => !taken.has(`${b.slotDate}|${b.slotTime}|${(b.guestName || '').toLowerCase()}`))
    .map(b => ({
      id: `booking-${b.id}`,
      title: `${b.eventTypeName || 'Booking'} — ${b.guestName}`,
      contactId: '',
      contactName: b.guestName,
      date: b.slotDate,
      time: b.slotTime,
      duration: b.duration ?? 30,
      status: 'scheduled' as const,
      type: 'booking',
      notes: b.notes,
      ownerTimezone: (b as Booking & { ownerTimezone?: string }).ownerTimezone,
      contactTimezone: b.timezone,
    }));
}
