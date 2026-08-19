/**
 * Where you are, what time it is there, and what time it is for everyone else.
 *
 * The area is taken from the browser's own IANA timezone — the one thing about
 * a visitor's location that is already known, needs no permission dialog, and
 * never leaves the machine. No geolocation prompt, no IP lookup, nothing sent
 * to a third party to be told a fact the runtime is holding anyway.
 *
 * That gives a zone like `Asia/Karachi`, which is a place: the city is in the
 * name and the offset comes from the runtime's own tz database, daylight saving
 * included. When somebody works somewhere other than where their laptop thinks
 * they are, they can say so, and the correction is remembered.
 *
 * Everything here is arithmetic on Intl — there is no clock of our own, and no
 * table of offsets to go stale twice a year.
 */

const KEY = 'crm_clocks';

export interface Zone {
  /** IANA name, e.g. "America/New_York". */
  id: string;
  /** What to call it on screen — the city, unless the user renamed it. */
  label: string;
  /** Country or state, so "Toronto" and "Vancouver" are tellable apart. */
  region: string;
}

export interface ClockSettings {
  /** An IANA zone the user typed, overriding what the browser reports. */
  home: string | null;
  /** Extra clocks, in the order they should appear. */
  extra: Zone[];
  /** Seconds on the big clock. Off by default — a ticking second is a fidget. */
  seconds: boolean;
}

export const DEFAULT_SETTINGS: ClockSettings = { home: null, extra: [], seconds: false };

/* ── Zones ─────────────────────────────────────────────────────────────── */

/** A zone the runtime will actually accept. Anything else is a typo. */
export function isValidZone(id: string): boolean {
  if (!id || typeof id !== 'string') return false;
  try {
    new Intl.DateTimeFormat('en-US', { timeZone: id });
    return true;
  } catch {
    return false;
  }
}

/**
 * The place inside an IANA name.
 *
 * `Asia/Karachi` → Karachi / Asia. `America/Argentina/Buenos_Aires` → Buenos
 * Aires / Argentina, because the middle segment is the more useful of the two
 * when there is one.
 */
export function placeOf(id: string): { label: string; region: string } {
  const parts = id.split('/');
  const pretty = (s: string) => s.replace(/_/g, ' ').replace(/^St /, 'St. ');
  if (parts.length >= 3) return { label: pretty(parts[2]), region: pretty(parts[1]) };
  if (parts.length === 2) return { label: pretty(parts[1]), region: pretty(parts[0]) };
  return { label: pretty(id), region: '' };
}

/** Minutes this zone is ahead of UTC at a given instant, daylight saving included. */
export function offsetMinutes(id: string, at: Date): number {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: id, hour12: false,
    year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', second: '2-digit',
  }).formatToParts(at);
  const get = (type: string) => Number(parts.find(p => p.type === type)?.value ?? 0);
  /* Some engines render midnight as hour 24 under hour12:false. */
  const hour = get('hour') % 24;
  const asUtc = Date.UTC(get('year'), get('month') - 1, get('day'), hour, get('minute'), get('second'));
  return Math.round((asUtc - at.getTime()) / 60_000);
}

/** "UTC+5", "UTC−3:30", "UTC" — a real minus sign, and half-hours kept. */
export function offsetLabel(id: string, at: Date): string {
  const m = offsetMinutes(id, at);
  if (m === 0) return 'UTC';
  const sign = m < 0 ? '−' : '+';
  const abs = Math.abs(m);
  const h = Math.floor(abs / 60);
  const rest = abs % 60;
  return `UTC${sign}${h}${rest ? `:${String(rest).padStart(2, '0')}` : ''}`;
}

/**
 * The short name the zone goes by — PKT, GMT, EDT.
 *
 * Runtimes without a name for a zone hand back a numeric form like "GMT+5",
 * which is returned as-is: an honest offset beats an invented abbreviation.
 */
export function abbrev(id: string, at: Date): string {
  const parts = new Intl.DateTimeFormat('en-US', { timeZone: id, timeZoneName: 'short' }).formatToParts(at);
  return parts.find(p => p.type === 'timeZoneName')?.value ?? '';
}

/** How far ahead or behind this zone is of another, said in words. */
export function relativeToHome(id: string, home: string, at: Date): string {
  const diff = offsetMinutes(id, at) - offsetMinutes(home, at);
  if (diff === 0) return 'Same time as you';
  const ahead = diff > 0;
  const abs = Math.abs(diff);
  const h = Math.floor(abs / 60);
  const m = abs % 60;
  const size = h && m ? `${h}h ${m}m` : h ? `${h}h` : `${m}m`;
  return `${size} ${ahead ? 'ahead of' : 'behind'} you`;
}

export interface ClockFace {
  /** "14:35" or "2:35", by the reader's own locale. */
  time: string;
  /** "pm" when the locale uses one, otherwise empty. */
  suffix: string;
  seconds: string;
  /** "Tomorrow", "Yesterday", or empty when it is the same date as home. */
  dayNote: string;
  weekday: string;
  /** True between 20:00 and 07:00 there — the "do not ring them now" hint. */
  asleep: boolean;
}

/** Everything a clock face needs, read from one instant. */
export function faceOf(id: string, at: Date, home?: string): ClockFace {
  const parts = new Intl.DateTimeFormat(undefined, {
    timeZone: id, hour: 'numeric', minute: '2-digit', second: '2-digit',
  }).formatToParts(at);
  const pick = (type: string) => parts.find(p => p.type === type)?.value ?? '';
  const hour = pick('hour');
  const minute = pick('minute');
  const seconds = pick('second');
  const suffix = (pick('dayPeriod') || '').toLowerCase();

  const hour24 = Number(new Intl.DateTimeFormat('en-US', { timeZone: id, hour12: false, hour: '2-digit' })
    .formatToParts(at).find(p => p.type === 'hour')?.value ?? '0') % 24;

  const dayKey = (zone: string) => new Intl.DateTimeFormat('en-CA', {
    timeZone: zone, year: 'numeric', month: '2-digit', day: '2-digit',
  }).format(at);

  let dayNote = '';
  if (home && home !== id) {
    const there = dayKey(id);
    const mine = dayKey(home);
    if (there > mine) dayNote = 'Tomorrow';
    else if (there < mine) dayNote = 'Yesterday';
  }

  return {
    time: `${hour}:${minute}`,
    suffix,
    seconds,
    dayNote,
    weekday: new Intl.DateTimeFormat(undefined, { timeZone: id, weekday: 'short' }).format(at),
    asleep: hour24 >= 20 || hour24 < 7,
  };
}

/* ── Where the user is ─────────────────────────────────────────────────── */

/**
 * The zone this machine is set to.
 *
 * A runtime that cannot answer gets UTC rather than a guess — an invented
 * location on a dashboard is worse than an admitted one.
 */
export function browserZone(): string {
  try {
    const z = Intl.DateTimeFormat().resolvedOptions().timeZone;
    return z && isValidZone(z) ? z : 'UTC';
  } catch {
    return 'UTC';
  }
}

/** The zone in force: what the user corrected it to, else what the browser says. */
export function homeZone(settings: ClockSettings): string {
  return settings.home && isValidZone(settings.home) ? settings.home : browserZone();
}

/* ── Stored settings ───────────────────────────────────────────────────── */

export function loadClocks(): ClockSettings {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return { ...DEFAULT_SETTINGS };
    const parsed = JSON.parse(raw) as Partial<ClockSettings>;
    const extra = Array.isArray(parsed.extra)
      ? parsed.extra
          .filter((z): z is Zone => !!z && typeof z.id === 'string' && isValidZone(z.id))
          .map(z => ({ id: z.id, label: String(z.label || placeOf(z.id).label), region: String(z.region || placeOf(z.id).region) }))
      : [];
    /* One clock per zone: two "London"s side by side is a saving bug on screen. */
    const seen = new Set<string>();
    return {
      home: typeof parsed.home === 'string' && isValidZone(parsed.home) ? parsed.home : null,
      extra: extra.filter(z => (seen.has(z.id) ? false : (seen.add(z.id), true))).slice(0, 8),
      seconds: parsed.seconds === true,
    };
  } catch {
    return { ...DEFAULT_SETTINGS };
  }
}

export function saveClocks(next: ClockSettings): boolean {
  try {
    localStorage.setItem(KEY, JSON.stringify(next));
    return true;
  } catch {
    return false;
  }
}

/** The most clocks worth showing before the bar becomes a departure board. */
export const MAX_CLOCKS = 8;

export function addClock(settings: ClockSettings, id: string): ClockSettings {
  if (!isValidZone(id)) return settings;
  if (settings.extra.some(z => z.id === id)) return settings;
  if (settings.extra.length >= MAX_CLOCKS) return settings;
  const place = placeOf(id);
  return { ...settings, extra: [...settings.extra, { id, label: place.label, region: place.region }] };
}

export function removeClock(settings: ClockSettings, id: string): ClockSettings {
  return { ...settings, extra: settings.extra.filter(z => z.id !== id) };
}

export function moveClock(settings: ClockSettings, id: string, by: -1 | 1): ClockSettings {
  const at = settings.extra.findIndex(z => z.id === id);
  if (at === -1) return settings;
  const to = at + by;
  if (to < 0 || to >= settings.extra.length) return settings;
  const extra = [...settings.extra];
  [extra[at], extra[to]] = [extra[to], extra[at]];
  return { ...settings, extra };
}

/* ── The picker ────────────────────────────────────────────────────────── */

/**
 * The places most people add first, named the way they would ask for them.
 *
 * Every entry is checked against the runtime before it is offered, so a zone an
 * old browser has never heard of is quietly left out rather than added as a
 * clock that shows the wrong time.
 */
const POPULAR: { id: string; country: string; aka?: string }[] = [
  { id: 'America/New_York', country: 'United States', aka: 'usa us east coast eastern ny' },
  { id: 'America/Chicago', country: 'United States', aka: 'usa us central texas' },
  { id: 'America/Denver', country: 'United States', aka: 'usa us mountain colorado' },
  { id: 'America/Los_Angeles', country: 'United States', aka: 'usa us west coast pacific california sf' },
  { id: 'Europe/London', country: 'United Kingdom', aka: 'uk gb britain england gmt bst' },
  { id: 'America/Toronto', country: 'Canada', aka: 'ca ontario' },
  { id: 'America/Vancouver', country: 'Canada', aka: 'ca british columbia' },
  { id: 'Europe/Dublin', country: 'Ireland' },
  { id: 'Europe/Paris', country: 'France' },
  { id: 'Europe/Berlin', country: 'Germany' },
  { id: 'Europe/Madrid', country: 'Spain' },
  { id: 'Europe/Amsterdam', country: 'Netherlands' },
  { id: 'Europe/Warsaw', country: 'Poland' },
  { id: 'Europe/Istanbul', country: 'Türkiye' },
  { id: 'Asia/Dubai', country: 'United Arab Emirates', aka: 'uae abu dhabi gulf' },
  { id: 'Asia/Riyadh', country: 'Saudi Arabia' },
  { id: 'Asia/Karachi', country: 'Pakistan', aka: 'pk lahore islamabad' },
  { id: 'Asia/Kolkata', country: 'India', aka: 'in delhi mumbai bangalore ist' },
  { id: 'Asia/Dhaka', country: 'Bangladesh' },
  { id: 'Asia/Singapore', country: 'Singapore' },
  { id: 'Asia/Hong_Kong', country: 'Hong Kong' },
  { id: 'Asia/Shanghai', country: 'China', aka: 'cn beijing' },
  { id: 'Asia/Tokyo', country: 'Japan', aka: 'jp' },
  { id: 'Asia/Seoul', country: 'South Korea' },
  { id: 'Australia/Sydney', country: 'Australia', aka: 'au nsw' },
  { id: 'Australia/Perth', country: 'Australia', aka: 'au wa' },
  { id: 'Pacific/Auckland', country: 'New Zealand', aka: 'nz' },
  { id: 'Africa/Johannesburg', country: 'South Africa', aka: 'za' },
  { id: 'Africa/Lagos', country: 'Nigeria' },
  { id: 'Africa/Cairo', country: 'Egypt' },
  { id: 'America/Sao_Paulo', country: 'Brazil', aka: 'br' },
  { id: 'America/Mexico_City', country: 'Mexico', aka: 'mx' },
  { id: 'America/Bogota', country: 'Colombia' },
  { id: 'America/Argentina/Buenos_Aires', country: 'Argentina' },
  { id: 'UTC', country: 'Coordinated Universal Time', aka: 'gmt zulu' },
];

export interface ZoneChoice {
  id: string;
  label: string;
  region: string;
  country: string;
  /** True for the shortlist, so the picker can lead with them. */
  popular: boolean;
}

let cachedChoices: ZoneChoice[] | null = null;

/** Every zone that can be added: the shortlist first, then whatever else the runtime knows. */
export function zoneChoices(): ZoneChoice[] {
  if (cachedChoices) return cachedChoices;

  const out: ZoneChoice[] = [];
  const seen = new Set<string>();
  for (const p of POPULAR) {
    if (!isValidZone(p.id) || seen.has(p.id)) continue;
    seen.add(p.id);
    const place = placeOf(p.id);
    out.push({ id: p.id, label: place.label, region: p.aka ?? place.region, country: p.country, popular: true });
  }

  /* Not every engine can list its zones; the shortlist alone is still useful. */
  const supported = (Intl as unknown as { supportedValuesOf?: (k: string) => string[] }).supportedValuesOf;
  if (typeof supported === 'function') {
    let all: string[];
    try { all = supported('timeZone'); } catch { all = []; }
    for (const id of all) {
      if (seen.has(id)) continue;
      seen.add(id);
      const place = placeOf(id);
      out.push({ id, label: place.label, region: place.region, country: place.region, popular: false });
    }
  }

  cachedChoices = out;
  return out;
}

/** Rank the picker against what somebody typed — "usa", "uk", "toronto" all land. */
export function searchZones(query: string, limit = 40): ZoneChoice[] {
  const q = query.trim().toLowerCase();
  const all = zoneChoices();
  if (!q) return all.filter(z => z.popular).slice(0, limit);

  const scored: { z: ZoneChoice; score: number }[] = [];
  for (const z of all) {
    const label = z.label.toLowerCase();
    const country = z.country.toLowerCase();
    const region = z.region.toLowerCase();
    const id = z.id.toLowerCase();
    let score = 0;
    if (label === q) score = 100;
    else if (country === q) score = 92;
    else if (label.startsWith(q)) score = 84;
    else if (country.startsWith(q)) score = 76;
    else if (region.split(/\s+/).some(w => w === q)) score = 70;
    else if (label.includes(q)) score = 50;
    else if (country.includes(q)) score = 44;
    else if (region.includes(q)) score = 36;
    else if (id.includes(q.replace(/\s+/g, '_'))) score = 24;
    if (score > 0) scored.push({ z, score: score + (z.popular ? 6 : 0) });
  }
  return scored.sort((a, b) => b.score - a.score || a.z.label.localeCompare(b.z.label)).slice(0, limit).map(s => s.z);
}
