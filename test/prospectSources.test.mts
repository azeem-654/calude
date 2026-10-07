/**
 * The rules that turn an AI Prospecting search into a recurring source for an
 * AI Autopilot project (worker/src/lib/prospectSources.ts): schedules in the
 * customer's own time zone, the confidence score and every rejection, what a
 * typed sentence changes, and which sources may run unattended.
 *
 *   npm run test:sources
 */
import {
  DEFAULT_FILTERS, DEFAULT_VERIFY, SOURCE_POLICY, bestMatch, daysFor, describeSchedule, localParts, nextRunStart, parseSourceCommand,
  policyFor, qualify, runLimits, runNow, searchKey, searchName, substantiallyDifferent, workflowNameFor, zonedTime, type Candidate,
} from '../worker/src/lib/prospectSources';

let pass = 0, fail = 0;
const ok = (n: string, c: boolean, d: unknown = '') => { if (c) pass++; else fail++; console.log(`${c ? '  ✓' : '  ✗'} ${n}${c ? '' : ` — ${JSON.stringify(d).slice(0, 300)}`}`); };

/* ── Names and identity ── */
ok('a search is named for what it finds', searchName('dentists', 'new york city') === 'Dentists — New York City');
ok('…and its workflow too', workflowNameFor('dentists', 'New York City') === 'New York City Dentists Prospecting Automation');
ok('the same search typed differently is one definition', searchKey('free', 'Dentists ', 'New  York City') === searchKey('osm', 'dentists', 'new york city'));
ok('a different place is a different search', searchKey('free', 'dentists', 'Boston') !== searchKey('free', 'dentists', 'New York City'));
const base = { trade: 'dentists', place: 'NYC', source: 'free', filters: DEFAULT_FILTERS, exclusions: [] as string[] };
ok('requiring a website is a substantial change', substantiallyDifferent(base, { ...base, filters: { ...DEFAULT_FILTERS, website: true } }));
ok('the same search in other case is not', !substantiallyDifferent(base, { ...base, trade: 'Dentists' }));

/* ── Sources ── */
ok('Google is never run on a schedule', SOURCE_POLICY.google.automate === false && SOURCE_POLICY.google.keep === false);
ok('the directories and the register may be', SOURCE_POLICY.free.automate && SOURCE_POLICY.register.automate);
ok('the owner can keep a source internal or switch it off', policyFor({ register: 'owner' }, 'register') === 'owner' && policyFor({ free: 'off' }, 'osm') === 'off' && policyFor(null, 'free') === 'on');

/* ── Schedules, in the customer's own day ── */
ok('weekdays are Monday to Friday', daysFor('weekdays') === '1111100' && daysFor('weekly', '', 2) === '0010000' && daysFor('manual') === '0000000');
const ny = 'America/New_York';
/* 2026-10-11 is a Sunday. 03:00 UTC Monday the 12th is still Sunday evening in New York. */
const sunEveningNY = new Date('2026-10-12T03:00:00Z');
ok('the local day is the customer\'s, not UTC\'s', localParts(sunEveningNY, ny).date === '2026-10-11' && localParts(sunEveningNY, ny).weekday === 6);
const weekdays = { schedule: 'weekdays' as const, runDays: '1111100', runHour: 9, tz: ny, manualRun: '' };
ok('a weekday run does not start on a Sunday evening in New York', !runNow(weekdays, sunEveningNY).on);
ok('…nor before 9:00 on Monday', !runNow(weekdays, new Date('2026-10-12T12:00:00Z')).on); // 08:00 EDT
ok('…and is on from 9:00 Monday', runNow(weekdays, new Date('2026-10-12T13:05:00Z')).on); // 09:05 EDT
const nx = nextRunStart(weekdays, sunEveningNY)!;
ok('the next run is Monday 9:00 New York time', nx.toISOString() === '2026-10-12T13:00:00.000Z', nx.toISOString());
const fri = nextRunStart(weekdays, new Date('2026-10-16T20:00:00Z'))!; // Friday 16:00 EDT
ok('after Friday\'s run the next is Monday', localParts(fri, ny).date === '2026-10-19', fri.toISOString());
ok('across the clocks changing (1 Nov) it is still 9:00 local', localParts(zonedTime('2026-11-02', 9, ny), ny).hour === 9);
const manual = { ...weekdays, schedule: 'manual' as const };
ok('manual only never starts by itself', nextRunStart(manual, sunEveningNY) === null && !runNow(manual, new Date('2026-10-12T15:00:00Z')).on);
ok('…but a run started by hand is on for that day', runNow({ ...manual, manualRun: '2026-10-12' }, new Date('2026-10-12T15:00:00Z')).on);
ok('an unknown time zone is UTC rather than a crash', localParts(new Date('2026-10-12T03:00:00Z'), 'Not/AZone').date === '2026-10-12');
ok('schedules read as words', describeSchedule(weekdays) === 'Weekdays from 09:00' && describeSchedule({ schedule: 'custom', runDays: '1010100', runHour: 8 }) === 'On Mon, Wed, Fri from 08:00');
ok('a bigger target is allowed more work, within a ceiling', runLimits(40).reads >= 240 && runLimits(100).reads <= 600 && runLimits(5).reads === 150);

/* ── Qualifying a candidate ── */
const good: Candidate = {
  name: 'Bright Smile Dental', website: 'https://brightsmile.example', siteLive: true, email: 'hello@brightsmile.example', emailOnSite: true,
  phone: '+1 212 555 0100', verdict: { status: 'domain_ok', role: false, free: false, disposable: false, level: 'basic' }, duplicate: false, suppressed: false,
};
const q = qualify(good, DEFAULT_FILTERS, DEFAULT_VERIFY, 85);
ok('a business with its own address on its own site qualifies', q.ok && q.confidence === 95, q);
ok('…and every point of the score is a check that ran', q.checks.filter(c => c.points > 0).reduce((s, c) => s + c.points, 0) === 95);
ok('the order the screen shows ends with the confidence', q.checks.at(-1)!.key === 'confidence' && q.checks[0].key === 'found');
ok('a duplicate is rejected', qualify({ ...good, duplicate: true }, DEFAULT_FILTERS, DEFAULT_VERIFY, 85).reason === 'duplicate');
ok('a suppressed address is rejected', qualify({ ...good, suppressed: true }, DEFAULT_FILTERS, DEFAULT_VERIFY, 85).reason === 'suppressed');
ok('a domain that takes no mail is rejected', qualify({ ...good, verdict: { ...good.verdict!, status: 'invalid' } }, DEFAULT_FILTERS, DEFAULT_VERIFY, 85).reason === 'invalid_domain');
ok('a throwaway address is rejected', qualify({ ...good, verdict: { ...good.verdict!, disposable: true } }, DEFAULT_FILTERS, DEFAULT_VERIFY, 85).reason === 'disposable');
ok('no address, no lead', qualify({ ...good, email: '', verdict: null }, DEFAULT_FILTERS, DEFAULT_VERIFY, 85).reason === 'no_email');
const gmail = qualify({ ...good, email: 'brightsmile@gmail.example', verdict: { ...good.verdict!, free: true } }, DEFAULT_FILTERS, DEFAULT_VERIFY, 85);
ok('a webmail address scores lower and falls under 85%', !gmail.ok && gmail.reason === 'low_confidence' && gmail.confidence === 75, gmail);
ok('…and is rejected outright when asked', qualify({ ...good, verdict: { ...good.verdict!, free: true } }, DEFAULT_FILTERS, { ...DEFAULT_VERIFY, rejectFreeMail: true }, 50).reason === 'free_mail');
ok('a required website must be there', qualify({ ...good, website: '', siteLive: null }, { ...DEFAULT_FILTERS, website: true }, DEFAULT_VERIFY, 50).reason === 'no_website');
ok('a website that did not answer fails a required website', qualify({ ...good, siteLive: false }, { ...DEFAULT_FILTERS, website: true }, DEFAULT_VERIFY, 50).reason === 'site_down');
ok('a required phone must be there', qualify({ ...good, phone: '' }, { ...DEFAULT_FILTERS, phone: true }, DEFAULT_VERIFY, 50).reason === 'no_phone');
ok('strict asks for a mailbox-verified address', qualify(good, DEFAULT_FILTERS, { ...DEFAULT_VERIFY, level: 'strict' }, 50).reason === 'not_mailbox_verified');
const mailbox = qualify({ ...good, verdict: { ...good.verdict!, status: 'valid', level: 'mailbox' } }, DEFAULT_FILTERS, { ...DEFAULT_VERIFY, level: 'strict' }, 85);
ok('…which a verified mailbox passes, at 100%', mailbox.ok && mailbox.confidence === 100, mailbox.confidence);
ok('an exclusion rules a business out', qualify({ ...good, name: 'Smile Franchise Group' }, DEFAULT_FILTERS, DEFAULT_VERIFY, 50, ['franchise']).reason === 'excluded');
ok('a 90% bar turns away what 85% takes', !qualify({ ...good, phone: '' }, DEFAULT_FILTERS, DEFAULT_VERIFY, 91).ok && qualify({ ...good, phone: '' }, DEFAULT_FILTERS, DEFAULT_VERIFY, 85).ok);

/* ── What a sentence changes ── */
const c = (s: string) => parseSourceCommand(s);
ok('"Connect my NYC Dentists search to this project."', JSON.stringify(c('Connect my NYC Dentists search to this project.')) === '{"kind":"connect","search":"nyc dentists"}', c('Connect my NYC Dentists search to this project.'));
ok('"Find 40 new prospects from this search every weekday."', JSON.stringify(c('Find 40 new prospects from this search every weekday.')) === '{"kind":"target","target":40,"schedule":"weekdays"}', c('Find 40 new prospects from this search every weekday.'));
ok('"Change it to 25 per day."', JSON.stringify(c('Change it to 25 per day.')) === '{"kind":"target","target":25,"schedule":"daily"}', c('Change it to 25 per day.'));
ok('"Pause this prospecting source."', c('Pause this prospecting source.').kind === 'pause');
ok('"Resume it"', c('Resume it').kind === 'resume');
ok('"Start these leads in my email outreach workflow."', JSON.stringify(c('Start these leads in my email outreach workflow.')) === '{"kind":"next_workflow","workflow":"email outreach"}', c('Start these leads in my email outreach workflow.'));
ok('"Only accept leads above 90% confidence."', JSON.stringify(c('Only accept leads above 90% confidence.')) === '{"kind":"min_confidence","value":90}', c('Only accept leads above 90% confidence.'));
ok('"Stop adding companies already contacted."', c('Stop adding companies already contacted.').kind === 'skip_contacted');
ok('"Run it weekly on Tuesday"', JSON.stringify(c('Run it weekly on Tuesday')) === '{"kind":"schedule","schedule":"weekly","weeklyDay":1}', c('Run it weekly on Tuesday'));
ok('"forty a day" in words', JSON.stringify(c('forty a day')) === '{"kind":"target","target":40,"schedule":"daily"}', c('forty a day'));
ok('a target over 100 is held to 100', (c('find 500 leads every day') as { target: number }).target === 100);
ok('anything else is not guessed at', c('make it better').kind === 'unknown' && c('').kind === 'unknown');
ok('"NYC dentists" finds "Dentists — New York City"', bestMatch('NYC Dentists', [{ name: 'Dentists — Boston' }, { name: 'Dentists — New York City' }])?.name === 'Dentists — New York City');
ok('…and nothing when nothing fits', bestMatch('roofers', [{ name: 'Dentists — Boston' }]) === null);

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
