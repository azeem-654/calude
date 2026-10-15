/**
 * The booking page's clock (worker/src/lib/bookingTime.ts): an owner's hours
 * shown in a visitor's zone, filed back under the owner's date and hour, and
 * right on both sides of a daylight-saving change.
 *
 *   npm run test:bookingtz
 */
import {
  addDays, clockLabel, isZone, offsetLabel, offsetMinutes, ownerDaySlots, slotProblem, slotsForVisitorDay,
  slugProblem, slugify, utcToWall, videoEmbedOf, wallToUtc, type SlotRules,
} from '../worker/src/lib/bookingTime';

let pass = 0, fail = 0;
const ok = (n: string, c: boolean, d: unknown = '') => { if (c) pass++; else fail++; console.log(`${c ? '  ✓' : '  ✗'} ${n}${c ? '' : ` — ${JSON.stringify(d).slice(0, 300)}`}`); };
const iso = (ms: number | null) => (ms === null ? null : new Date(ms).toISOString());

const NY = 'America/New_York';
const BKK = 'Asia/Bangkok';
const weekdays = { enabled: true, from: '09:00', to: '17:00' };
const off = { enabled: false, from: '09:00', to: '17:00' };
const rules: SlotRules = {
  timezone: NY, duration: 30, bufferBefore: 0, bufferAfter: 0, dailyLimit: 20, minNoticeMin: 0, windowDays: 365,
  weekly: { mon: weekdays, tue: weekdays, wed: weekdays, thu: weekdays, fri: weekdays, sat: off, sun: off },
};
/* A fixed "now", well before every date asked about. */
const NOW = Date.UTC(2026, 9, 1, 12, 0);

/* ── Zones ── */
ok('known zones are known', isZone(NY) && isZone(BKK) && isZone('UTC'));
ok('a typo is not a zone', !isZone('America/New_Yrok') && !isZone('') && !isZone(42));
ok('New York is UTC−4 in October', offsetMinutes(Date.UTC(2026, 9, 12, 12), NY) === -240);
ok('…and UTC−5 in December', offsetMinutes(Date.UTC(2026, 11, 7, 12), NY) === -300);
ok('Bangkok is UTC+7 all year', offsetMinutes(Date.UTC(2026, 0, 1), BKK) === 420 && offsetMinutes(Date.UTC(2026, 6, 1), BKK) === 420);
ok('a half-hour zone', offsetMinutes(Date.UTC(2026, 0, 1), 'Asia/Kolkata') === 330);
ok('the offset said as people read it', offsetLabel(Date.UTC(2026, 9, 12), BKK) === 'GMT+7' && offsetLabel(Date.UTC(2026, 0, 1), 'Asia/Kolkata') === 'GMT+5:30' && offsetLabel(Date.UTC(2026, 9, 12), NY) === 'GMT-4');

/* ── Wall clock ↔ instant ── */
ok('9:00 in New York on 12 Oct is 13:00 UTC', iso(wallToUtc('2026-10-12', '09:00', NY)) === '2026-10-12T13:00:00.000Z');
ok('9:00 in New York on 7 Dec is 14:00 UTC (after the change)', iso(wallToUtc('2026-12-07', '09:00', NY)) === '2026-12-07T14:00:00.000Z');
ok('and back again', utcToWall(Date.UTC(2026, 9, 12, 13), NY).time === '09:00' && utcToWall(Date.UTC(2026, 9, 12, 13), NY).date === '2026-10-12');
ok('the same instant in Bangkok is 20:00', utcToWall(Date.UTC(2026, 9, 12, 13), BKK).time === '20:00');
ok('the weekday comes from the zone’s own date', utcToWall(Date.UTC(2026, 9, 12, 20), BKK).weekday === 2 /* Tue 03:00 */);
ok('spring forward: 02:30 does not exist in New York', wallToUtc('2026-03-08', '02:30', NY) === null);
ok('…but 03:00 does, at 07:00 UTC', iso(wallToUtc('2026-03-08', '03:00', NY)) === '2026-03-08T07:00:00.000Z');
ok('fall back: 01:30 is taken as the first one (EDT)', iso(wallToUtc('2026-11-01', '01:30', NY)) === '2026-11-01T05:30:00.000Z');
ok('a malformed time is refused', wallToUtc('2026-10-12', '9:00', NY) === null && wallToUtc('12/10/2026', '09:00', NY) === null);
ok('calendar arithmetic crosses a month and a year', addDays('2026-10-31', 1) === '2026-11-01' && addDays('2027-01-01', -1) === '2026-12-31');

/* ── The owner's day ── */
const mon = ownerDaySlots('2026-10-12', rules, []);
ok('a 9–5 day of 30-minute meetings is 16 slots', mon.length === 16 && mon[0] === '09:00' && mon[15] === '16:30', mon);
ok('a closed day has none', ownerDaySlots('2026-10-10', rules, []).length === 0);
ok('a 60-minute booking at 10:00 also takes 10:30', (() => {
  const s = ownerDaySlots('2026-10-12', rules, [{ date: '2026-10-12', time: '10:00', duration: 60 }]);
  return !s.includes('10:00') && !s.includes('10:30') && s.includes('11:00') && s.includes('09:30');
})());
ok('a buffer after keeps the next meeting clear', (() => {
  const s = ownerDaySlots('2026-10-12', { ...rules, bufferAfter: 15 }, []);
  return s[0] === '09:00' && s[1] === '09:45';
})());
ok('the daily limit closes the day', ownerDaySlots('2026-10-12', { ...rules, dailyLimit: 1 }, [{ date: '2026-10-12', time: '09:00', duration: 30 }]).length === 0);

/* ── A visitor in Bangkok, the owner in New York ── */
const bkkTue = slotsForVisitorDay('2026-10-13', BKK, rules, [], NOW);
ok('Monday 9–5 New York is Monday 8 pm – Tuesday 4 am in Bangkok: Tuesday shows the 00:00–03:30 part', bkkTue.length > 0 && bkkTue[0].visitorTime === '00:00', bkkTue.slice(0, 2));
const bkkMon = slotsForVisitorDay('2026-10-12', BKK, rules, [], NOW);
ok('…and Monday the 20:00–23:30 part', bkkMon[0]?.visitorTime === '20:00' && bkkMon[bkkMon.length - 1]?.visitorTime === '23:30', bkkMon.map(s => s.visitorTime));
ok('every Bangkok time is 11 hours after New York in October', bkkMon.every(s => {
  const [vh] = s.visitorTime.split(':').map(Number); const [oh] = s.ownerTime.split(':').map(Number);
  return (vh - oh + 24) % 24 === 11;
}));
ok('the slot is filed under the owner’s date and hour', bkkMon[0].ownerDate === '2026-10-12' && bkkMon[0].ownerTime === '09:00' && iso(bkkMon[0].utc) === '2026-10-12T13:00:00.000Z');
ok('Tuesday 00:00 in Bangkok is Monday 13:00 in New York', bkkTue[0].ownerDate === '2026-10-12' && bkkTue[0].ownerTime === '13:00');
ok('Tuesday in Bangkok also holds Tuesday 9:00 New York at 20:00', bkkTue.some(s => s.ownerDate === '2026-10-13' && s.ownerTime === '09:00' && s.visitorTime === '20:00'));
const all = new Set<number>();
for (const d of ['2026-10-12', '2026-10-13', '2026-10-14']) for (const s of slotsForVisitorDay(d, BKK, rules, [], NOW)) all.add(s.utc);
ok('no slot is lost or doubled between the visitor’s days', [...all].filter(u => utcToWall(u, NY).date === '2026-10-13').length === 16);
ok('Friday 9–5 in New York reaches into a Bangkok Saturday', slotsForVisitorDay('2026-10-17', BKK, rules, [], NOW)[0]?.visitorTime === '00:00');
ok('after New York’s clocks go back the gap is 12 hours', (() => {
  const s = slotsForVisitorDay('2026-12-07', BKK, rules, [], NOW);
  return s[0]?.visitorTime === '21:00' && s[0].ownerTime === '09:00';
})());
ok('a visitor in the owner’s own zone sees the owner’s hours', slotsForVisitorDay('2026-10-12', NY, rules, [], NOW).map(s => s.visitorTime).join(',') === mon.join(','));
ok('a visitor in Kuala Lumpur (UTC+8) sees 21:00 first on Monday', slotsForVisitorDay('2026-10-12', 'Asia/Kuala_Lumpur', rules, [], NOW)[0]?.visitorTime === '21:00');

/* ── Notice and window ── */
const nearNow = Date.UTC(2026, 9, 12, 14, 10); // Mon 10:10 New York
ok('minimum notice drops the slots too soon', slotsForVisitorDay('2026-10-12', NY, { ...rules, minNoticeMin: 120 }, [], nearNow)[0]?.ownerTime === '12:30');
ok('the window ends on the owner’s calendar', slotsForVisitorDay('2026-10-20', NY, { ...rules, windowDays: 7 }, [], nearNow).length === 0
  && slotsForVisitorDay('2026-10-19', NY, { ...rules, windowDays: 7 }, [], nearNow).length === 16);

/* ── What the server checks on a booking ── */
ok('an offered slot is fine', slotProblem('2026-10-12', '09:00', rules, [], NOW) === null);
ok('a slot already booked is refused as taken', /just booked/.test(slotProblem('2026-10-12', '09:00', rules, [{ date: '2026-10-12', time: '09:00', duration: 30 }], NOW) ?? ''));
ok('a slot overlapped by a longer booking is refused too', /just booked/.test(slotProblem('2026-10-12', '09:30', rules, [{ date: '2026-10-12', time: '09:00', duration: 60 }], NOW) ?? ''));
ok('03:00 on a working day is not on offer', /not one this page offers/.test(slotProblem('2026-10-12', '03:00', rules, [], NOW) ?? ''));
ok('off the grid is not on offer', /not one this page offers/.test(slotProblem('2026-10-12', '09:10', rules, [], NOW) ?? ''));
ok('a Saturday is not on offer', !!slotProblem('2026-10-10', '09:00', rules, [], NOW));
ok('the past is refused', /too soon/.test(slotProblem('2026-09-28', '09:00', rules, [], NOW) ?? ''));
ok('the skipped hour is refused by name', /clocks change/.test(slotProblem('2026-03-08', '02:30', { ...rules, weekly: { ...rules.weekly, sun: { enabled: true, from: '00:00', to: '06:00' } } }, [], Date.UTC(2026, 2, 1)) ?? ''));
ok('…and never offered', !slotsForVisitorDay('2026-03-08', NY, { ...rules, weekly: { ...rules.weekly, sun: { enabled: true, from: '00:00', to: '06:00' } } }, [], Date.UTC(2026, 2, 1)).some(s => s.ownerTime === '02:30'));

/* ── Labels ── */
ok('12-hour and 24-hour clocks', clockLabel('13:05') === '1:05 pm' && clockLabel('00:30') === '12:30 am' && clockLabel('13:05', true) === '13:05');

/* ── Addresses ── */
ok('a good address passes', slugProblem('dr-lee-clinic') === null);
ok('too short, bad characters, edge hyphens and doubles are refused', !!slugProblem('ab') && !!slugProblem('Dr Lee') && !!slugProblem('-lee') && !!slugProblem('lee-') && !!slugProblem('a--b'));
ok('typing is tidied', slugify("Dr. Lée's Clinic!") === 'dr-lee-s-clinic');

/* ── Video links ── */
ok('a YouTube watch link', videoEmbedOf('https://www.youtube.com/watch?v=dQw4w9WgXcQ&t=10')?.src.startsWith('https://www.youtube-nocookie.com/embed/dQw4w9WgXcQ') === true);
ok('a youtu.be and a Shorts link', videoEmbedOf('youtu.be/dQw4w9WgXcQ')?.id === 'dQw4w9WgXcQ' && videoEmbedOf('https://youtube.com/shorts/dQw4w9WgXcQ')?.id === 'dQw4w9WgXcQ');
ok('a Vimeo link', videoEmbedOf('https://vimeo.com/76979871')?.src === 'https://player.vimeo.com/video/76979871?dnt=1');
ok('a Loom link', videoEmbedOf('https://www.loom.com/share/0281766fa2d04bb788eaf19e65135184')?.provider === 'loom');
ok('anything else is not framed', videoEmbedOf('https://evil.example/watch?v=dQw4w9WgXcQ') === null && videoEmbedOf('javascript:alert(1)') === null && videoEmbedOf('') === null);

console.log(`\n${pass} passed, ${fail} failed`);
if (fail) process.exit(1);
