/**
 * The strategy call's rules (worker/src/lib/strategyCall.ts): settings refused
 * box by box, several windows a day, closed dates and special hours, the
 * visitor's own day across zones and DST, buffers, the daily limit, and the
 * source and answers a stranger sends.
 *
 *   npm run test:strategycall
 */
import {
  cleanAnswers, cleanSettings, cleanSource, DEFAULT_SETTINGS, ownerSlots, publicSettings, slotRefusal, visitorSlots,
  windowsOn, type StrategySettings,
} from '../worker/src/lib/strategyCall';

let pass = 0, fail = 0;
const ok = (n: string, c: boolean, d: unknown = '') => { if (c) pass++; else fail++; console.log(`${c ? '  ✓' : '  ✗'} ${n}${c ? '' : ` — ${JSON.stringify(d).slice(0, 300)}`}`); };

const NY = 'America/New_York';
const base: StrategySettings = {
  ...DEFAULT_SETTINGS, enabled: true, timezone: NY, minNoticeMin: 0, windowDays: 365, bufferBefore: 0, bufferAfter: 0, dailyLimit: 0,
  weekly: { sun: [], mon: [{ from: '09:00', to: '12:00' }, { from: '13:00', to: '15:00' }], tue: [{ from: '09:00', to: '10:00' }], wed: [], thu: [], fri: [], sat: [] },
};
const NOW = Date.UTC(2026, 9, 1, 12, 0); // Thu 1 Oct 2026

/* ── Settings ── */
let r = cleanSettings({ ...base, timezone: 'Mars/Olympus' });
ok('an unknown zone is refused at its box', r.errors.some(e => e.field === 'strategy.timezone'), r.errors);
r = cleanSettings({ ...base, durations: [7, 90] });
ok('lengths outside the choices are refused', r.errors.some(e => e.field === 'strategy.durations') && r.settings.durations.join() === '30');
r = cleanSettings({ ...base, weekly: { ...base.weekly, mon: [{ from: '12:00', to: '09:00' }] } });
ok('a window that ends before it starts is refused', r.errors.some(e => e.field === 'strategy.weekly.mon'));
r = cleanSettings({ ...base, weekly: { ...base.weekly, mon: [{ from: '09:00', to: '12:00' }, { from: '11:00', to: '14:00' }] } });
ok('overlapping windows on one day are refused', r.errors.some(e => /overlap/.test(e.message)));
r = cleanSettings({ ...base, meetingType: 'video_link', meetingDetails: 'javascript:alert(1)' });
ok('a video room must be an https link', r.errors.some(e => e.field === 'strategy.meetingDetails'));
r = cleanSettings({ ...base, notifyEmail: 'not an email' });
ok('a notice address must be an address', r.errors.some(e => e.field === 'strategy.notifyEmail'));
r = cleanSettings({ ...base, weekly: { sun: [], mon: [], tue: [], wed: [], thu: [], fri: [], sat: [] }, overrides: [] });
ok('switched on with no hours anywhere is refused', r.errors.some(e => e.field === 'strategy.weekly'));
r = cleanSettings({ ...base, minNoticeMin: 1e9, windowDays: -4, bufferAfter: 999, dailyLimit: 'x', questions: Array.from({ length: 9 }, (_, i) => ({ label: `Q${i}` })) });
ok('numbers are clamped and questions capped at six', r.settings.minNoticeMin === 14 * 1440 && r.settings.windowDays === 1 && r.settings.bufferAfter === 120 && r.settings.dailyLimit === 0 && r.settings.questions.length === 6);
r = cleanSettings(base);
ok('good settings pass clean', r.errors.length === 0, r.errors);
ok('the default is switched off', DEFAULT_SETTINGS.enabled === false);
const pub = publicSettings({ ...base, notifyEmail: 'owner@example.com' });
ok('the public view carries no notice address or reminder setting', !JSON.stringify(pub).includes('owner@example.com') && !('reminderHours' in pub) && !('notifyEmail' in pub));

/* ── Windows, closed dates, special hours ── */
ok('two windows on a Monday give both blocks', ownerSlots('2026-10-05', base, 60, []).join() === '09:00,10:00,11:00,13:00,14:00', ownerSlots('2026-10-05', base, 60, []));
ok('a closed date offers nothing', windowsOn('2026-10-05', { ...base, blackoutDates: ['2026-10-05'] }).length === 0);
const special = { ...base, overrides: [{ date: '2026-10-07', windows: [{ from: '16:00', to: '17:00' }] }] };
ok('special hours open a closed weekday', ownerSlots('2026-10-07', special, 30, []).join() === '16:00,16:30');
ok('special hours replace a normal day', ownerSlots('2026-10-05', { ...base, overrides: [{ date: '2026-10-05', windows: [] }] }, 30, []).length === 0);

/* ── Busy time, buffers, daily limit ── */
const busy = [{ date: '2026-10-05', time: '10:00', duration: 60 }];
ok('a booking takes its own slot', !ownerSlots('2026-10-05', base, 60, busy).includes('10:00'));
const buffered = { ...base, bufferBefore: 15 };
ok('a buffer before keeps the next slot clear', ownerSlots('2026-10-05', base, 60, busy).includes('11:00') && !ownerSlots('2026-10-05', buffered, 60, busy).includes('11:00'));
ok('the daily limit closes the day', ownerSlots('2026-10-05', { ...base, dailyLimit: 1 }, 60, busy).length === 0);

/* ── The visitor's day ── */
const bkk = visitorSlots('2026-10-05', 'Asia/Bangkok', base, 60, [], NOW);
ok('a visitor in Bangkok sees Monday-in-New-York on their Monday evening', bkk.length > 0 && bkk.every(s => s.ownerDate === '2026-10-05') && bkk[0].visitorTime === '20:00', bkk);
const bkkTue = visitorSlots('2026-10-06', 'Asia/Bangkok', base, 60, [], NOW);
ok('…and the Monday afternoon window on their Tuesday', bkkTue.some(s => s.ownerTime === '13:00' && s.visitorTime === '00:00'), bkkTue);
const notice = visitorSlots('2026-10-05', NY, { ...base, minNoticeMin: 60 * 24 * 10 }, 60, [], NOW);
ok('minimum notice hides slots too soon', notice.length === 0);
const horizon = visitorSlots('2026-10-12', NY, { ...base, windowDays: 3 }, 60, [], NOW);
ok('the horizon hides slots too far ahead', horizon.length === 0);
/* DST: 1 Nov 2026 the clocks go back in New York. Monday 2 Nov 09:00 EST is 14:00 UTC. */
const dst = visitorSlots('2026-11-02', 'UTC', base, 60, [], NOW);
ok('after the clocks change, 09:00 in New York is 14:00 UTC', dst[0]?.visitorTime === '14:00', dst[0]);

/* ── The check before writing ── */
ok('an offered time passes', slotRefusal('2026-10-05', '09:00', base, 60, [], NOW) === null);
ok('a taken time is refused as just booked', /just booked/.test(slotRefusal('2026-10-05', '10:00', base, 60, busy, NOW) ?? ''));
ok('an off-grid time is refused', /not offered/.test(slotRefusal('2026-10-05', '09:17', base, 60, [], NOW) ?? ''));
ok('a closed day is refused', /not offered/.test(slotRefusal('2026-10-07', '09:00', base, 60, [], NOW) ?? ''));
ok('a past time is refused', /too soon/.test(slotRefusal('2026-09-28', '09:00', base, 60, [], NOW) ?? ''));
ok('nonsense is refused', !!slotRefusal('tomorrow', '9am', base, 60, [], NOW));

/* ── What a stranger sends ── */
const src = cleanSource({ site: 'hvac', utm: { source: 'google', campaign: 'spring<script>', evil: 'x' }, clickIds: { gclid: 'abc123' }, referrer: 'javascript:alert(1)' });
ok('a known site is kept, tags cleaned, unknown keys dropped', src.site === 'hvac' && src.utm.campaign === 'springscript' && !('evil' in src.utm) && src.clickIds.gclid === 'abc123' && src.referrer === '', src);
ok('an unknown site becomes main', cleanSource({ site: 'evil.com' }).site === 'main');
const qs = [{ id: 'q1', label: 'Goal?', required: true, long: true }, { id: 'q2', label: 'Size?', required: false, long: false }];
const a1 = cleanAnswers(qs, { q2: 'small' });
ok('a required answer left empty is named', a1.error?.field === 'strategy.answer.q1');
const a2 = cleanAnswers(qs, { q1: 'Grow\nfaster\u0000', q9: 'smuggled' });
ok('answers keep line breaks, lose control characters and unknown questions', a2.error === null && a2.answers.q1 === 'Grow\nfaster' && !('q9' in a2.answers), a2);

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
