/**
 * The booking card — who, what and why on one side; a month, the times and
 * the details form on the other. The public page (/book/<slug>) draws it, and
 * so does the preview in the AI Autopilot wizard's booking set-up, so what the
 * owner edits is the page their visitors get rather than a picture of one.
 *
 * ── The look ──
 *
 * The owner's reference, Calendly-style, as two cards. Left: a band in the
 * page's colour with the business's logo, name and tagline; the host's photo,
 * name and role, topic pills; the title and description; four chips (how
 * long, where, the visitor's own zone, one-to-one with whom); a video beside
 * "What we can discuss"; and the points, each with its icon, as a grid of
 * small cards. Right: "Select a Date & Time" with the zone picker in its
 * header, the month, and the day's times as a list of pills. No platform
 * name, no trial offer, no testimonial, no "verified" tick — nothing on it
 * belongs to anybody but the owner, and nothing claims what was not checked.
 *
 * ── Times ──
 *
 * Every time on the page is the visitor's own: their zone is read from the
 * browser and can be changed in the picker. Underneath, availability is the
 * owner's hours in the owner's zone, turned into instants and back by
 * services/bookingTime.ts (the Worker's own rules, so the server checks the
 * booking with the same code that drew the slot). A slot carries both — the
 * visitor picks "8:00 pm Tuesday" and the booking is filed as the owner's
 * "09:00 Monday".
 *
 * Nothing here is decoration pretending to be data: no ratings, no "booked 40
 * times this week", no availability that is not the schedule's, and a video's
 * length only when the file itself says it.
 */
import { useEffect, useMemo, useState, type CSSProperties } from 'react';
import {
  ArrowLeft, CalendarCheck, CalendarDays, Check, ChevronLeft, ChevronRight, Clock, Globe, Loader, MapPin, Phone, Play, UserRound, Video,
} from 'lucide-react';
import type { EventType, ScheduleAvailability } from '../../types';
import {
  addDays, allZones, browserZone, clockLabel, dayWords, isZone, offsetLabel, ownerDatesFor, slotsForVisitorDay, utcToWall,
  videoEmbedOf, weekdayOf, zoneCity, type Busy, type Slot, type SlotRules,
} from '../../services/bookingTime';
import { cleanHex, DEFAULT_ACCENT, DISCUSS_TITLE, inkOn, pointsOf, POINTS_TITLE } from '../../services/bookingContent';
import { PointIcon } from './bookingIcons';
import './bookingPage.css';

export type PageConfig = Partial<ScheduleAvailability> & Pick<ScheduleAvailability, 'weekly' | 'duration' | 'timezone'> & { businessName?: string };
export interface Guest { name: string; email: string; phone: string; notes: string }

const WEEK = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

/** Whether this reader's locale writes the clock 24-hour — the default the toggle starts on. */
function prefers24h(): boolean {
  try { return /h2[34]/.test(new Intl.DateTimeFormat(undefined, { hour: 'numeric' }).resolvedOptions().hourCycle ?? ''); } catch { return false; }
}

export function rulesFor(cfg: PageConfig, eventType?: EventType | null): SlotRules {
  return {
    timezone: isZone(cfg.timezone) ? cfg.timezone : 'UTC',
    weekly: cfg.weekly ?? {},
    duration: eventType?.duration ?? cfg.duration ?? 30,
    bufferBefore: cfg.bufferBefore ?? 0,
    bufferAfter: cfg.bufferAfter ?? 0,
    dailyLimit: cfg.dailyLimit ?? 0,
    minNoticeMin: cfg.minNoticeMin ?? 0,
    windowDays: cfg.windowDays ?? 365,
  };
}

/**
 * The page's colour as custom properties, for the card and the ground behind
 * it. The text on it is computed from the colour, never chosen separately.
 */
export function accentStyle(cfg: { accent?: string }): CSSProperties {
  const accent = cleanHex(cfg.accent) || DEFAULT_ACCENT;
  return { '--bk-accent': accent, '--bk-accent-ink': inkOn(accent) } as CSSProperties;
}

function PlaceIcon({ where, size = 16 }: { where: string; size?: number }) {
  const w = where.toLowerCase();
  if (/phone|call me|ring/.test(w) && !/video/.test(w)) return <Phone size={size} />;
  if (/video|zoom|meet|teams|online|whereby/.test(w)) return <Video size={size} />;
  return <MapPin size={size} />;
}

const mmss = (sec: number) => `${Math.floor(sec / 60)}:${String(Math.floor(sec % 60)).padStart(2, '0')}`;

/**
 * The video: a still with a play button until pressed, then the player. A
 * clip's length is shown because the file says it; an embedded video's is
 * not known without asking its host, so the tile names the host instead.
 * YouTube's own still is shown from YouTube's image server — the same
 * company whose player it opens — and nothing else is fetched until a press.
 */
function BookingVideo({ fileUrl, link }: { fileUrl?: string; link?: string }) {
  const [playing, setPlaying] = useState(false);
  const [length, setLength] = useState(0);
  const embed = fileUrl ? null : videoEmbedOf(link);
  useEffect(() => { setPlaying(false); setLength(0); }, [fileUrl, link]);
  if (!fileUrl && !embed) return null;
  if (fileUrl) {
    return (
      <div className="bkp-video" data-playing={playing ? '1' : undefined}>
        <video src={playing ? fileUrl : `${fileUrl}#t=0.1`} controls={playing} autoPlay={playing} playsInline preload="metadata"
          onLoadedMetadata={e => { const d = e.currentTarget.duration; if (Number.isFinite(d) && d > 0) setLength(d); }} />
        {!playing && (
          <button type="button" className="bkp-play" onClick={() => setPlaying(true)} aria-label="Play the video">
            <span className="bkp-play-btn"><Play size={22} fill="currentColor" /></span>
            {length > 0 && <small>{mmss(length)}</small>}
          </button>
        )}
      </div>
    );
  }
  const e = embed!;
  const host = e.provider === 'youtube' ? 'YouTube' : e.provider === 'vimeo' ? 'Vimeo' : 'Loom';
  return (
    <div className="bkp-video" data-playing={playing ? '1' : undefined}>
      {playing ? (
        <iframe
          src={`${e.src}${e.src.includes('?') ? '&' : '?'}autoplay=1`} title="Intro video"
          allow="autoplay; encrypted-media; picture-in-picture; fullscreen" allowFullScreen
          referrerPolicy="strict-origin-when-cross-origin"
          sandbox="allow-scripts allow-same-origin allow-presentation allow-popups"
        />
      ) : (
        <button type="button" className="bkp-play" data-provider={e.provider} onClick={() => setPlaying(true)} aria-label={`Play the ${host} video`}>
          {e.provider === 'youtube' && (
            <img src={`https://i.ytimg.com/vi/${e.id}/hqdefault.jpg`} alt="" loading="lazy" referrerPolicy="no-referrer"
              onError={ev => { ev.currentTarget.style.display = 'none'; }} />
          )}
          <span className="bkp-play-btn"><Play size={22} fill="currentColor" /></span>
          <small>{host}</small>
        </button>
      )}
    </div>
  );
}

/** The left side: the business, the person, the meeting, and why to book it. */
export function BookingInfo({ cfg, businessName, eventType, slot, visitorTz, h24, hideMedia, onBack, backLabel, rescheduleOf }: {
  cfg: PageConfig; businessName: string; eventType?: EventType | null; slot?: Slot | null; visitorTz: string; h24: boolean;
  hideMedia?: boolean; onBack?: () => void; backLabel?: string; rescheduleOf?: string;
}) {
  const title = eventType?.name || cfg.title || 'Meeting';
  const description = eventType?.description || cfg.description || '';
  const where = eventType?.location || cfg.location || '';
  const duration = eventType?.duration ?? cfg.duration;
  const hostName = (cfg.hostName || '').trim();
  const host = hostName || businessName;
  const role = hostName ? (cfg.hostRole || '').trim() : '';
  const brand = businessName || hostName || title;
  const tagline = (cfg.tagline || '').trim();
  const tags = (cfg.tags ?? []).map(t => t.trim()).filter(Boolean).slice(0, 4);
  const points = pointsOf(cfg.points, cfg.bullets);
  const discuss = (cfg.discuss ?? []).map(t => t.trim()).filter(Boolean);
  const hasVideo = !!cfg.videoFileUrl || !!videoEmbedOf(cfg.videoUrl);
  const endsAt = slot ? utcToWall(slot.utc + duration * 60000, visitorTz).time : '';
  const pointsTitle = (cfg.pointsTitle || '').trim() || POINTS_TITLE;

  return (
    <aside className="bkp-info bkp-panel">
      <header className="bkp-band">
        {cfg.logoUrl
          ? <span className="bkp-logo-tile"><img className="bkp-logo" src={cfg.logoUrl} alt={businessName ? `${businessName} logo` : 'Logo'} /></span>
          : <span className="bkp-logo-tile bkp-logo-letter" aria-hidden="true">{brand.charAt(0).toUpperCase()}</span>}
        <span className="bkp-band-words">
          <b>{brand}</b>
          {tagline && <span>{tagline}</span>}
        </span>
      </header>

      <div className="bkp-body">
        {onBack && <button type="button" className="bkp-back" onClick={onBack}><ArrowLeft size={14} /> {backLabel ?? 'Back'}</button>}
        {(host || cfg.photoUrl) && (
          <div className="bkp-host">
            {cfg.photoUrl
              ? <img className="bkp-avatar" src={cfg.photoUrl} alt="" />
              : <span className="bkp-avatar bkp-avatar-letter" aria-hidden="true">{(host || '?').charAt(0).toUpperCase()}</span>}
            <span className="bkp-host-words">
              {host && <b className="bkp-host-name">{host}</b>}
              {role && <span className="bkp-host-role">{role}</span>}
            </span>
          </div>
        )}
        {tags.length > 0 && <ul className="bkp-tags" aria-label="Topics">{tags.map((t, i) => <li key={i}>{t}</li>)}</ul>}

        <h1 className="bkp-title">{rescheduleOf ? `Reschedule: ${rescheduleOf}` : title}</h1>
        {description && <p className="bkp-desc">{description}</p>}

        <ul className="bkp-chips">
          <li><Clock size={16} /> <span>{duration} min</span></li>
          {where && <li><PlaceIcon where={where} /> <span>{where}</span></li>}
          <li><Globe size={16} /> <span>{zoneCity(visitorTz)} time ({offsetLabel(slot?.utc ?? Date.now(), visitorTz)})</span></li>
          {host && <li><UserRound size={16} /> <span>One-to-one with {host}</span></li>}
          {slot && (
            <li data-on="1"><CalendarCheck size={16} /> <span>{clockLabel(slot.visitorTime, h24)} – {clockLabel(endsAt, h24)}, {dayWords(slot.utc, visitorTz)}</span></li>
          )}
        </ul>

        {!hideMedia && (hasVideo || discuss.length > 0) && (
          <div className="bkp-media-row" data-both={hasVideo && discuss.length > 0 ? '1' : undefined}>
            {hasVideo && <BookingVideo fileUrl={cfg.videoFileUrl} link={cfg.videoUrl} />}
            {discuss.length > 0 && (
              <div className="bkp-discuss">
                <h3>{DISCUSS_TITLE}</h3>
                <ul>{discuss.map((d, i) => <li key={i}><Check size={14} strokeWidth={3} /> <span>{d}</span></li>)}</ul>
              </div>
            )}
          </div>
        )}

        {!hideMedia && points.length > 0 && (
          <section className="bkp-points" aria-label={pointsTitle}>
            <h3>{pointsTitle}</h3>
            <ul>
              {points.map((pt, i) => (
                <li key={i}>
                  <span className="bkp-point-icon"><PointIcon icon={pt.icon} size={18} /></span>
                  <span className="bkp-point-words"><b>{pt.title}</b>{pt.detail && <small>{pt.detail}</small>}</span>
                </li>
              ))}
            </ul>
          </section>
        )}
      </div>
    </aside>
  );
}

export interface BookingCardProps {
  cfg: PageConfig;
  businessName: string;
  eventType?: EventType | null;
  /** Everything already in the owner's diary, owner wall-clock. */
  busy: Busy[];
  /** The owner editing: nothing is fetched or booked, and the form says so. */
  preview?: boolean;
  /** Told the owner dates the visible month draws on, so the page can fetch what is booked. */
  onRange?: (fromOwnerDate: string, toOwnerDate: string) => void;
  /** Book; answers an error to show, or null when it went through. */
  onBook?: (slot: Slot, guest: Guest, visitorTz: string) => Promise<string | null>;
  /** Moving an existing booking: picking a time confirms it. */
  onReschedule?: (slot: Slot) => Promise<string | null>;
  rescheduleOf?: string;
  onBackToTypes?: () => void;
  /** Fixed in tests and the preview; the real clock otherwise. */
  nowMs?: number;
  initialZone?: string;
}

export default function BookingCard(p: BookingCardProps) {
  const { cfg, busy, preview, eventType } = p;
  const [visitorTz, setVisitorTz] = useState(() => (p.initialZone && isZone(p.initialZone) ? p.initialZone : browserZone()));
  const [h24, setH24] = useState(prefers24h);
  const now = p.nowMs ?? Date.now();
  const today = utcToWall(now, visitorTz).date;
  const [month, setMonth] = useState(today.slice(0, 7));
  const [day, setDay] = useState<string | null>(null);
  const [slot, setSlot] = useState<Slot | null>(null);
  const [step, setStep] = useState<'pick' | 'form'>('pick');
  const [guest, setGuest] = useState<Guest>({ name: '', email: '', phone: '', notes: '' });
  const [busyNow, setBusyNow] = useState(false);
  const [error, setError] = useState('');
  const rules = useMemo(() => rulesFor(cfg, eventType), [cfg, eventType]);
  const zones = useMemo(() => allZones(visitorTz, rules.timezone, browserZone()), [visitorTz, rules.timezone]);

  /* The month's days, on the visitor's calendar, each with its slots. */
  const days = useMemo(() => {
    const first = `${month}-01`;
    const [y, m] = month.split('-').map(Number);
    const count = new Date(Date.UTC(y, m, 0)).getUTCDate();
    const out: { date: string; slots: Slot[] }[] = [];
    for (let i = 0; i < count; i++) {
      const date = addDays(first, i);
      out.push({ date, slots: date < today ? [] : slotsForVisitorDay(date, visitorTz, rules, busy, now) });
    }
    return out;
  // `now` moves every render; a minute's drift does not need a recompute.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [month, visitorTz, rules, busy, today]);

  const lead = weekdayOf(`${month}-01`);
  const lastDay = days[days.length - 1]?.date ?? `${month}-28`;
  useEffect(() => {
    const r = ownerDatesFor(`${month}-01`, lastDay);
    p.onRange?.(r.from, r.to);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [month, lastDay]);

  /* Opened on the first day with a time, so the times are on screen at once.
     Only while nothing has been picked: a visitor's own choice is never moved. */
  const firstOpen = days.find(d => d.slots.length)?.date ?? null;
  useEffect(() => {
    if (!day && firstOpen) setDay(firstOpen);
  }, [firstOpen, day]);
  /* A day that loses its last time (the zone changed, somebody booked it) is let go. */
  const daySlots = day ? (days.find(d => d.date === day)?.slots ?? slotsForVisitorDay(day, visitorTz, rules, busy, now)) : [];
  useEffect(() => {
    if (slot && !daySlots.some(s => s.utc === slot.utc)) setSlot(null);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [daySlots.length, visitorTz]);

  const thisMonth = today.slice(0, 7);
  const lastMonth = utcToWall(now + (rules.windowDays ?? 365) * 86_400_000, visitorTz).date.slice(0, 7);
  const shift = (n: number) => {
    const [y, m] = month.split('-').map(Number);
    const d = new Date(Date.UTC(y, m - 1 + n, 1));
    setMonth(`${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`);
    setDay(null); setSlot(null);
  };
  const monthName = new Date(Date.UTC(Number(month.slice(0, 4)), Number(month.slice(5, 7)) - 1, 15))
    .toLocaleDateString(undefined, { month: 'long', year: 'numeric', timeZone: 'UTC' });
  const sameZone = visitorTz === rules.timezone;

  const pick = async (s: Slot) => {
    setError('');
    if (p.onReschedule) {
      setSlot(s);
      setBusyNow(true);
      const err = await p.onReschedule(s);
      setBusyNow(false);
      if (err) setError(err);
      return;
    }
    setSlot(s);
  };

  const book = async () => {
    if (!slot || preview || !p.onBook) return;
    if (!guest.name.trim() || !/^\S+@\S+\.\S+$/.test(guest.email.trim())) { setError('Add your name and a valid email address.'); return; }
    setBusyNow(true); setError('');
    const err = await p.onBook(slot, guest, visitorTz);
    setBusyNow(false);
    if (err) setError(err);
  };

  const firstSlot = daySlots[0]?.utc;
  const hostWord = (cfg.hostName || '').trim() || p.businessName || 'The host';
  return (
    <main className="bkp-card" style={accentStyle(cfg)}>
      <BookingInfo
        cfg={cfg} businessName={p.businessName} eventType={eventType} slot={step === 'form' ? slot : null}
        visitorTz={visitorTz} h24={h24} hideMedia={step === 'form'} rescheduleOf={p.rescheduleOf}
        onBack={step === 'form' ? () => setStep('pick') : p.onBackToTypes}
        backLabel={step === 'form' ? 'Back to times' : 'All meeting types'}
      />

      {step === 'form' && slot ? (
        <section className="bkp-pick bkp-panel" aria-label="Your details">
          <div className="bkp-pick-head">
            <span className="bkp-pick-icon"><UserRound size={18} /></span>
            <h2 className="bkp-h2">Enter your details</h2>
          </div>
          {!sameZone && (
            <p className="bkp-ownertime">That is {clockLabel(slot.ownerTime, h24)} on {dayWords(slot.utc, rules.timezone, { weekday: 'long', day: 'numeric', month: 'long' })} for {hostWord} in {zoneCity(rules.timezone)}.</p>
          )}
          <form className="bkp-form" onSubmit={e => { e.preventDefault(); void book(); }}>
            <label className="bkp-field"><span>Name *</span>
              <input className="bkp-input" data-field="booking.guestName" autoComplete="name" value={guest.name} maxLength={120}
                onChange={e => setGuest(g => ({ ...g, name: e.target.value }))} />
            </label>
            <label className="bkp-field"><span>Email *</span>
              <input className="bkp-input" data-field="booking.guestEmail" type="email" autoComplete="email" value={guest.email} maxLength={200}
                onChange={e => setGuest(g => ({ ...g, email: e.target.value }))} />
            </label>
            <label className="bkp-field"><span>Phone (optional)</span>
              <input className="bkp-input" type="tel" autoComplete="tel" value={guest.phone} maxLength={40}
                onChange={e => setGuest(g => ({ ...g, phone: e.target.value }))} />
            </label>
            <label className="bkp-field"><span>Anything to share before the meeting? (optional)</span>
              <textarea className="bkp-input" rows={3} value={guest.notes} maxLength={2000}
                onChange={e => setGuest(g => ({ ...g, notes: e.target.value }))} />
            </label>
            {error && <p className="bkp-error" role="alert">{error}</p>}
            <div>
              <button type="submit" className="bkp-btn" disabled={busyNow || preview || !guest.name.trim() || !guest.email.trim()}>
                {busyNow ? <><Loader size={15} className="spin" /> Booking…</> : 'Schedule meeting'}
              </button>
            </div>
            {preview
              ? <p className="bkp-note">Preview — bookings are taken on the live page.</p>
              : <p className="bkp-note">You can reschedule or cancel from the confirmation.</p>}
          </form>
        </section>
      ) : (
        <section className="bkp-pick bkp-panel" aria-label="Pick a time">
          <div className="bkp-pick-head">
            <span className="bkp-pick-icon"><CalendarDays size={18} /></span>
            <h2 className="bkp-h2">Select a Date &amp; Time</h2>
            <label className="bkp-zone" title="Time zone">
              <Globe size={14} aria-hidden="true" />
              <span className="bkp-sr">Time zone</span>
              <select id="bkp-zone" className="bkp-select" data-field="booking.visitorZone" value={visitorTz}
                onChange={e => { setVisitorTz(e.target.value); setSlot(null); setDay(null); }}>
                {zones.map(z => <option key={z} value={z}>{z.replace(/_/g, ' ')} ({offsetLabel(now, z)}){z === browserZone() ? ' · you' : ''}</option>)}
              </select>
            </label>
          </div>
          <div className="bkp-grid" data-times={day ? '1' : undefined}>
            <div className="bkp-cal">
              <div className="bkp-month">
                <button type="button" className="bkp-nav" aria-label="Previous month" disabled={month <= thisMonth} onClick={() => shift(-1)}><ChevronLeft size={18} /></button>
                <b aria-live="polite">{monthName}</b>
                <button type="button" className="bkp-nav" aria-label="Next month" disabled={month >= lastMonth} onClick={() => shift(1)}><ChevronRight size={18} /></button>
              </div>
              <div className="bkp-week" aria-hidden="true">{WEEK.map(w => <span key={w}>{w}</span>)}</div>
              <div className="bkp-days" role="grid">
                {Array.from({ length: lead }, (_, i) => <span key={`x${i}`} />)}
                {days.map(d => {
                  const open = d.slots.length > 0;
                  return (
                    <button key={d.date} type="button" className="bkp-day" disabled={!open}
                      data-open={open ? '1' : undefined} data-on={day === d.date ? '1' : undefined} data-today={d.date === today ? '1' : undefined}
                      aria-label={`${dayWords(Date.UTC(+d.date.slice(0, 4), +d.date.slice(5, 7) - 1, +d.date.slice(8, 10), 12), 'UTC')}${open ? `, ${d.slots.length} times` : ', no times'}`}
                      aria-pressed={day === d.date}
                      onClick={() => { setDay(d.date); setSlot(null); setError(''); }}>
                      {Number(d.date.slice(8, 10))}
                    </button>
                  );
                })}
              </div>
              {!firstOpen && (
                <p className="bkp-empty">No times left in {monthName}. {month < lastMonth ? 'Try the next month.' : ''}</p>
              )}
            </div>

            {day && (
              <div className="bkp-times" key={`${day}|${visitorTz}`}>
                <h3>{dayWords(Date.UTC(+day.slice(0, 4), +day.slice(5, 7) - 1, +day.slice(8, 10), 12), 'UTC')}</h3>
                {daySlots.length === 0 ? <p className="bkp-empty">No times on this day.</p> : (
                  <div className="bkp-slots">
                    {daySlots.map(s => {
                      const on = slot?.utc === s.utc;
                      return (
                        <div key={s.utc} className="bkp-slotrow" data-on={on && !p.onReschedule ? '1' : undefined}>
                          <button type="button" className="bkp-slot" disabled={busyNow} data-first={!slot && s.utc === firstSlot ? '1' : undefined}
                            title={sameZone ? undefined : `${clockLabel(s.ownerTime, h24)} in ${zoneCity(rules.timezone)}`}
                            onClick={() => void pick(s)}>
                            {busyNow && on ? <Loader size={14} className="spin" /> : <span className="bkp-slot-time">{clockLabel(s.visitorTime, h24)}</span>}
                            <ChevronRight size={16} aria-hidden="true" />
                          </button>
                          {on && !p.onReschedule && (
                            <button type="button" className="bkp-btn bkp-next" onClick={() => { setStep('form'); setError(''); }}>Next</button>
                          )}
                        </div>
                      );
                    })}
                  </div>
                )}
                {error && <p className="bkp-error" role="alert">{error}</p>}
              </div>
            )}
          </div>

          <div className="bkp-foot-row">
            {!sameZone && daySlots.length > 0
              ? <p className="bkp-ownertime">Shown in your time. {hostWord} is in {zoneCity(rules.timezone)} ({offsetLabel(daySlots[0].utc, rules.timezone)}).</p>
              : <span />}
            <span className="bkp-clock" role="group" aria-label="Clock">
              <button type="button" aria-pressed={!h24} onClick={() => setH24(false)}>am/pm</button>
              <button type="button" aria-pressed={h24} onClick={() => setH24(true)}>24h</button>
            </span>
          </div>
        </section>
      )}
    </main>
  );
}
