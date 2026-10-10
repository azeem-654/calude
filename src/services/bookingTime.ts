/**
 * The booking page's clock, from the browser's side. The rules live in the
 * Worker's own file (worker/src/lib/bookingTime.ts) and are imported here, so
 * the times a visitor is shown and the check the server makes on the one they
 * pick are a single implementation. `npm run test:bookingtz`.
 */
export * from '../../worker/src/lib/bookingTime';

/** The zone this browser is in — what a visitor's times are shown in first. */
export function browserZone(): string {
  try { return Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC'; } catch { return 'UTC'; }
}

/*
 * Every zone the browser knows, for the pickers. Older browsers without
 * `supportedValuesOf` get a short list of the commonest, plus whatever zone
 * is already in use, so a choice is never lost by not being listed.
 */
const FALLBACK_ZONES = [
  'Pacific/Honolulu', 'America/Anchorage', 'America/Los_Angeles', 'America/Denver', 'America/Phoenix', 'America/Chicago',
  'America/New_York', 'America/Toronto', 'America/Halifax', 'America/Mexico_City', 'America/Bogota', 'America/Sao_Paulo',
  'America/Argentina/Buenos_Aires', 'Atlantic/Reykjavik', 'Europe/London', 'Europe/Dublin', 'Europe/Lisbon', 'Europe/Paris',
  'Europe/Berlin', 'Europe/Madrid', 'Europe/Rome', 'Europe/Amsterdam', 'Europe/Stockholm', 'Europe/Warsaw', 'Europe/Athens',
  'Europe/Istanbul', 'Europe/Moscow', 'Africa/Lagos', 'Africa/Cairo', 'Africa/Johannesburg', 'Africa/Nairobi', 'Asia/Dubai',
  'Asia/Karachi', 'Asia/Kolkata', 'Asia/Dhaka', 'Asia/Bangkok', 'Asia/Jakarta', 'Asia/Kuala_Lumpur', 'Asia/Singapore',
  'Asia/Manila', 'Asia/Hong_Kong', 'Asia/Shanghai', 'Asia/Tokyo', 'Asia/Seoul', 'Australia/Perth', 'Australia/Brisbane',
  'Australia/Sydney', 'Pacific/Auckland', 'UTC',
];
export function allZones(...keep: string[]): string[] {
  let list: string[] = [];
  try {
    const f = (Intl as unknown as { supportedValuesOf?: (k: string) => string[] }).supportedValuesOf;
    list = f ? f('timeZone') : [];
  } catch { list = []; }
  if (!list.length) list = FALLBACK_ZONES;
  const set = new Set(list);
  for (const z of keep) if (z) set.add(z);
  set.add('UTC');
  return [...set].sort();
}

/** "Tuesday, 13 October" in the reader's language, on a zone's own calendar. */
export function dayWords(ms: number, tz: string, opts: Intl.DateTimeFormatOptions = { weekday: 'long', day: 'numeric', month: 'long' }): string {
  try { return new Date(ms).toLocaleDateString(undefined, { ...opts, timeZone: tz }); } catch { return new Date(ms).toDateString(); }
}
