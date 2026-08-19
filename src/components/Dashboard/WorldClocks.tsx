/**
 * The clock on the day bar, and the world clocks behind it.
 *
 * It owns its own interval so only the clock re-renders — a seconds tick held
 * in the dashboard's state would rebuild the whole board sixty times a minute
 * for eight glyphs. One tick a second while seconds are shown, one a minute
 * when they are not, and the minute one lands on the minute rather than a
 * second into it.
 *
 * The area under the time is not a guess: it is the city out of the browser's
 * own IANA zone, and when that is wrong the user can say so and it sticks.
 */
import { useEffect, useMemo, useRef, useState } from 'react';
import { Check, Globe, MapPin, Plus, Search, Trash2, X } from 'lucide-react';
import {
  MAX_CLOCKS, abbrev, addClock, browserZone, faceOf, homeZone, isValidZone,
  loadClocks, moveClock, offsetLabel, placeOf, relativeToHome, removeClock, saveClocks,
  searchZones, type ClockSettings,
} from '../../services/clocks';

/** Everything on this panel is drawn on the bar's dark chrome. */
const INK = '#ffffff';
const DIM = 'rgba(255,255,255,0.62)';
const LINE = 'rgba(255,255,255,0.13)';
const FILL = 'rgba(255,255,255,0.08)';
const LIME = '#c7f441';
const ON_LIME = '#0e1117';

/** One tick a second while seconds are shown, one a minute when they are not. */
function useTick(withSeconds: boolean): Date {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    if (withSeconds) {
      const t = window.setInterval(() => setNow(new Date()), 1000);
      return () => window.clearInterval(t);
    }
    /* Land on the minute rather than a second into it, then keep the beat. */
    let interval = 0;
    const align = window.setTimeout(() => {
      setNow(new Date());
      interval = window.setInterval(() => setNow(new Date()), 60_000);
    }, 60_000 - (Date.now() % 60_000));
    return () => { window.clearTimeout(align); if (interval) window.clearInterval(interval); };
  }, [withSeconds]);
  return now;
}

export default function DayClocks() {
  const [settings, setSettings] = useState<ClockSettings>(() => loadClocks());
  const [open, setOpen] = useState(false);
  const box = useRef<HTMLDivElement>(null);
  const now = useTick(settings.seconds);

  const home = homeZone(settings);
  const face = faceOf(home, now);
  const place = placeOf(home);
  const zoneName = abbrev(home, now);

  const write = (next: ClockSettings) => {
    setSettings(next);
    saveClocks(next);
  };

  useEffect(() => {
    if (!open) return;
    const away = (e: MouseEvent) => { if (box.current && !box.current.contains(e.target as Node)) setOpen(false); };
    const key = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false); };
    document.addEventListener('mousedown', away);
    document.addEventListener('keydown', key);
    return () => {
      document.removeEventListener('mousedown', away);
      document.removeEventListener('keydown', key);
    };
  }, [open]);

  return (
    <>
    <div ref={box} style={{ position: 'relative', flexShrink: 0 }}>
      <button
        type="button"
        onClick={() => setOpen(v => !v)}
        aria-expanded={open}
        aria-label={`Local time ${face.time}${face.suffix} in ${place.label}. Open world clocks.`}
        style={{
          display: 'flex', alignItems: 'center', gap: 9,
          padding: '5px 11px 5px 9px', borderRadius: 999, border: `1px solid ${LINE}`,
          backgroundColor: open ? 'rgba(255,255,255,0.16)' : FILL,
          cursor: 'pointer', fontFamily: 'inherit', color: INK, whiteSpace: 'nowrap',
          transition: 'background-color 160ms ease',
        }}
      >
        <span style={{ display: 'flex', alignItems: 'baseline', gap: 3 }}>
          <span style={{ fontSize: 14, fontWeight: 800, letterSpacing: '-0.02em', fontVariantNumeric: 'tabular-nums' }}>
            {face.time}
          </span>
          {settings.seconds && (
            <span style={{ fontSize: 10.5, fontWeight: 700, color: DIM, fontVariantNumeric: 'tabular-nums' }}>
              :{face.seconds}
            </span>
          )}
          {face.suffix && <span style={{ fontSize: 10, fontWeight: 700, color: DIM }}>{face.suffix}</span>}
        </span>
        <span style={{ width: 1, height: 14, backgroundColor: LINE }} />
        <span style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 11, fontWeight: 700, color: DIM }}>
          <MapPin size={11} strokeWidth={2.4} />
          {place.label}{zoneName ? ` · ${zoneName}` : ''}
        </span>
      </button>

      {open && (
        <ClocksPanel
          settings={settings}
          now={now}
          home={home}
          onChange={write}
          onClose={() => setOpen(false)}
        />
      )}
    </div>

    {/* The other clocks sit on the bar beside yours, so the times people ask
        for most are readable without opening anything. */}
    {settings.extra.map(z => {
      const f = faceOf(z.id, now, home);
      return (
        <span
          key={z.id}
          title={`${z.label} — ${relativeToHome(z.id, home, now)}`}
          style={{
            display: 'inline-flex', alignItems: 'baseline', gap: 5, flexShrink: 0,
            padding: '4px 10px', borderRadius: 999, border: `1px solid ${LINE}`,
            backgroundColor: FILL, whiteSpace: 'nowrap',
            opacity: f.asleep ? 0.62 : 1,
          }}
        >
          <span style={{ fontSize: 10.5, fontWeight: 700, color: DIM, textTransform: 'uppercase', letterSpacing: '0.04em' }}>
            {z.label}
          </span>
          <span style={{ fontSize: 12, fontWeight: 800, color: INK, fontVariantNumeric: 'tabular-nums' }}>
            {f.time}{f.suffix && <span style={{ fontSize: 9, fontWeight: 700, color: DIM }}>{f.suffix}</span>}
          </span>
          {f.dayNote && <span style={{ fontSize: 9, fontWeight: 700, color: LIME }}>{f.dayNote === 'Tomorrow' ? '+1' : '−1'}</span>}
        </span>
      );
    })}
    </>
  );
}

function ClocksPanel({ settings, now, home, onChange, onClose }: {
  settings: ClockSettings;
  now: Date;
  home: string;
  onChange: (next: ClockSettings) => void;
  onClose: () => void;
}) {
  const [query, setQuery] = useState('');
  const [adding, setAdding] = useState(false);
  const [fixing, setFixing] = useState(false);
  const [typedHome, setTypedHome] = useState(home);

  const results = useMemo(() => searchZones(query, 24), [query]);
  const detected = browserZone();
  const homePlace = placeOf(home);

  const apply = onChange;

  const full = settings.extra.length >= MAX_CLOCKS;

  return (
    <div
      role="dialog"
      aria-label="World clocks"
      style={{
        position: 'absolute', top: 'calc(100% + 10px)', left: 0, zIndex: 260,
        width: 'min(330px, calc(100vw - 40px))', maxHeight: 460, overflowY: 'auto',
        backgroundColor: '#15181d', border: `1px solid ${LINE}`, borderRadius: 20,
        padding: 14, boxShadow: '0 26px 60px -16px rgba(0,0,0,0.6)',
        display: 'flex', flexDirection: 'column', gap: 12,
      }}
    >
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 10 }}>
        <div>
          <p style={{ margin: 0, fontSize: 13.5, fontWeight: 800, color: INK, letterSpacing: '-0.015em' }}>Clocks</p>
          <p style={{ margin: '2px 0 0', fontSize: 11, color: DIM, lineHeight: 1.45 }}>
            Your area comes from this device's timezone. Nothing is sent anywhere to work it out.
          </p>
        </div>
        <button type="button" onClick={onClose} aria-label="Close"
          style={{ border: 'none', background: 'none', color: DIM, cursor: 'pointer', display: 'flex', padding: 2 }}>
          <X size={15} strokeWidth={2.4} />
        </button>
      </div>

      {/* ── Home ── */}
      <div style={{ padding: 12, borderRadius: 14, backgroundColor: FILL, border: `1px solid ${LINE}` }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10 }}>
          <div style={{ minWidth: 0 }}>
            <p style={{ margin: 0, fontSize: 10, fontWeight: 700, color: DIM, textTransform: 'uppercase', letterSpacing: '0.06em' }}>
              You are here
            </p>
            <p style={{ margin: '3px 0 0', fontSize: 14, fontWeight: 800, color: INK, letterSpacing: '-0.02em' }}>
              {homePlace.label}
            </p>
            <p style={{ margin: '1px 0 0', fontSize: 11, color: DIM }}>
              {homePlace.region ? `${homePlace.region} · ` : ''}{offsetLabel(home, now)}{abbrev(home, now) ? ` · ${abbrev(home, now)}` : ''}
            </p>
          </div>
          <span style={{ fontSize: 20, fontWeight: 800, color: INK, fontVariantNumeric: 'tabular-nums', letterSpacing: '-0.03em' }}>
            {faceOf(home, now).time}
          </span>
        </div>

        {!fixing ? (
          <button type="button" onClick={() => { setTypedHome(home); setFixing(true); }}
            style={{ marginTop: 9, border: 'none', background: 'none', color: LIME, fontSize: 11, fontWeight: 700, cursor: 'pointer', padding: 0, fontFamily: 'inherit' }}>
            Not where you are? Set it
          </button>
        ) : (
          <div style={{ marginTop: 10, display: 'flex', flexDirection: 'column', gap: 7 }}>
            {/* The label is named on the input itself. A wrapping <label>'s text
                contributes the control's own value to its accessible name, so
                this box would otherwise answer to "Timezone Europe/London". */}
            <label style={{ fontSize: 10.5, color: DIM, fontWeight: 600 }}>
              Timezone
              <input
                aria-label="Timezone"
                value={typedHome}
                onChange={e => setTypedHome(e.target.value)}
                list="clock-zone-options"
                placeholder="Europe/London"
                style={{
                  width: '100%', marginTop: 4, padding: '7px 10px', borderRadius: 10,
                  border: `1px solid ${isValidZone(typedHome) ? LINE : '#e5484d'}`,
                  backgroundColor: 'rgba(0,0,0,0.3)', color: INK, fontSize: 12, fontFamily: 'inherit',
                  outline: 'none', boxSizing: 'border-box',
                }}
              />
            </label>
            <datalist id="clock-zone-options">
              {searchZones('', 40).map(z => <option key={z.id} value={z.id} />)}
            </datalist>
            {!isValidZone(typedHome) && (
              <p style={{ margin: 0, fontSize: 10.5, color: '#f2a0a2' }}>
                Not a timezone this browser knows. Use an IANA name like Asia/Karachi.
              </p>
            )}
            {/* Said plainly, because the two are genuinely separate: the diary
                and the booking page run on the calendar's own timezone, and
                quietly moving those from here would move real appointments. */}
            <p style={{ margin: 0, fontSize: 10.5, color: DIM, lineHeight: 1.5 }}>
              This sets the clock. Working hours and bookings keep the timezone on your booking page.
            </p>
            <div style={{ display: 'flex', gap: 6 }}>
              <button
                type="button"
                disabled={!isValidZone(typedHome)}
                onClick={() => { apply({ ...settings, home: typedHome === detected ? null : typedHome }); setFixing(false); }}
                style={{
                  padding: '6px 12px', borderRadius: 999, border: 'none',
                  backgroundColor: isValidZone(typedHome) ? LIME : 'rgba(255,255,255,0.14)',
                  color: isValidZone(typedHome) ? ON_LIME : DIM,
                  fontSize: 11, fontWeight: 800, cursor: isValidZone(typedHome) ? 'pointer' : 'not-allowed', fontFamily: 'inherit',
                }}>
                <Check size={11} strokeWidth={3} style={{ verticalAlign: -1, marginRight: 3 }} /> Save
              </button>
              <button type="button" onClick={() => setFixing(false)}
                style={{ padding: '6px 12px', borderRadius: 999, border: `1px solid ${LINE}`, background: 'none', color: DIM, fontSize: 11, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit' }}>
                Cancel
              </button>
              {settings.home && (
                <button type="button" onClick={() => { apply({ ...settings, home: null }); setFixing(false); }}
                  style={{ padding: '6px 12px', borderRadius: 999, border: 'none', background: 'none', color: DIM, fontSize: 11, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit' }}>
                  Use {placeOf(detected).label}
                </button>
              )}
            </div>
          </div>
        )}
      </div>

      {/* ── Seconds ── */}
      <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 11.5, color: DIM, fontWeight: 600, cursor: 'pointer' }}>
        <input
          type="checkbox"
          checked={settings.seconds}
          onChange={e => apply({ ...settings, seconds: e.target.checked })}
          style={{ accentColor: LIME, width: 14, height: 14, cursor: 'pointer' }}
        />
        Show seconds on the bar
      </label>

      {/* ── Other clocks ── */}
      <div>
        <p style={{ margin: '0 0 7px', fontSize: 10, fontWeight: 700, color: DIM, textTransform: 'uppercase', letterSpacing: '0.06em' }}>
          Other places {settings.extra.length > 0 && `(${settings.extra.length}/${MAX_CLOCKS})`}
        </p>

        {settings.extra.length === 0 ? (
          <p style={{ margin: 0, fontSize: 11.5, color: DIM, lineHeight: 1.55 }}>
            No other clocks yet. Add the places you work with and their time sits on the bar beside yours.
          </p>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            {settings.extra.map((z, i) => {
              const f = faceOf(z.id, now, home);
              return (
                <div key={z.id} style={{
                  display: 'flex', alignItems: 'center', gap: 9, padding: '8px 10px',
                  borderRadius: 12, backgroundColor: FILL, border: `1px solid ${LINE}`,
                }}>
                  <span style={{ minWidth: 0, flex: 1 }}>
                    <span style={{ display: 'block', fontSize: 12.5, fontWeight: 700, color: INK, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {z.label} {f.dayNote && <span style={{ fontSize: 9.5, fontWeight: 700, color: LIME }}>{f.dayNote}</span>}
                    </span>
                    <span style={{ display: 'block', fontSize: 10.5, color: DIM, marginTop: 1 }}>
                      {relativeToHome(z.id, home, now)} · {offsetLabel(z.id, now)}
                    </span>
                  </span>
                  <span style={{ fontSize: 13.5, fontWeight: 800, color: INK, fontVariantNumeric: 'tabular-nums', opacity: f.asleep ? 0.6 : 1 }}>
                    {f.time}{f.suffix}
                  </span>
                  <span style={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
                    <button type="button" aria-label={`Move ${z.label} up`} disabled={i === 0}
                      onClick={() => apply(moveClock(settings, z.id, -1))}
                      style={{ ...tinyBtn, opacity: i === 0 ? 0.3 : 1, cursor: i === 0 ? 'default' : 'pointer' }}>▲</button>
                    <button type="button" aria-label={`Move ${z.label} down`} disabled={i === settings.extra.length - 1}
                      onClick={() => apply(moveClock(settings, z.id, 1))}
                      style={{ ...tinyBtn, opacity: i === settings.extra.length - 1 ? 0.3 : 1, cursor: i === settings.extra.length - 1 ? 'default' : 'pointer' }}>▼</button>
                  </span>
                  <button type="button" aria-label={`Remove ${z.label}`} onClick={() => apply(removeClock(settings, z.id))}
                    style={{ border: 'none', background: 'none', color: DIM, cursor: 'pointer', display: 'flex', padding: 3 }}>
                    <Trash2 size={13} strokeWidth={2.2} />
                  </button>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* ── Add ── */}
      {!adding ? (
        <button
          type="button"
          onClick={() => setAdding(true)}
          disabled={full}
          style={{
            display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
            padding: '9px 12px', borderRadius: 12, border: `1px dashed ${LINE}`,
            backgroundColor: 'transparent', color: full ? DIM : INK,
            fontSize: 12, fontWeight: 700, cursor: full ? 'not-allowed' : 'pointer', fontFamily: 'inherit',
          }}
        >
          <Plus size={13} strokeWidth={2.6} /> {full ? `That is all ${MAX_CLOCKS}` : 'Add a clock'}
        </button>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 7, padding: '7px 10px', borderRadius: 12, backgroundColor: 'rgba(0,0,0,0.3)', border: `1px solid ${LINE}` }}>
            <Search size={13} color={DIM} strokeWidth={2.4} />
            <input
              autoFocus
              value={query}
              onChange={e => setQuery(e.target.value)}
              placeholder="USA, UK, Canada, Toronto…"
              aria-label="Search places"
              style={{ flex: 1, border: 'none', outline: 'none', background: 'none', color: INK, fontSize: 12, fontFamily: 'inherit', minWidth: 0 }}
            />
            <button type="button" onClick={() => { setAdding(false); setQuery(''); }} aria-label="Stop adding"
              style={{ border: 'none', background: 'none', color: DIM, cursor: 'pointer', display: 'flex', padding: 2 }}>
              <X size={13} strokeWidth={2.4} />
            </button>
          </div>

          <div style={{ maxHeight: 190, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 3 }}>
            {results.length === 0 && (
              <p style={{ margin: 0, padding: '10px 4px', fontSize: 11.5, color: DIM, lineHeight: 1.5 }}>
                No place here matches “{query}”. Try the country, the city, or an IANA name like Asia/Dubai.
              </p>
            )}
            {results.map(z => {
              const already = settings.extra.some(e => e.id === z.id) || z.id === home;
              return (
                <button
                  key={z.id}
                  type="button"
                  disabled={already || full}
                  onClick={() => { apply(addClock(settings, z.id)); setQuery(''); setAdding(false); }}
                  style={{
                    display: 'flex', alignItems: 'center', gap: 9, width: '100%',
                    padding: '8px 10px', borderRadius: 11, border: 'none', textAlign: 'left',
                    backgroundColor: 'transparent', cursor: already || full ? 'default' : 'pointer',
                    opacity: already || full ? 0.45 : 1, fontFamily: 'inherit',
                  }}
                >
                  <Globe size={13} color={DIM} strokeWidth={2} style={{ flexShrink: 0 }} />
                  <span style={{ minWidth: 0, flex: 1 }}>
                    <span style={{ display: 'block', fontSize: 12, fontWeight: 700, color: INK }}>{z.label}</span>
                    <span style={{ display: 'block', fontSize: 10.5, color: DIM }}>{z.country} · {offsetLabel(z.id, now)}</span>
                  </span>
                  <span style={{ fontSize: 11.5, fontWeight: 700, color: DIM, fontVariantNumeric: 'tabular-nums' }}>
                    {already ? 'Added' : faceOf(z.id, now).time}
                  </span>
                </button>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}

const tinyBtn: React.CSSProperties = {
  border: 'none', background: 'none', color: DIM,
  fontSize: 7, lineHeight: 1, padding: '1px 2px', fontFamily: 'inherit',
};
