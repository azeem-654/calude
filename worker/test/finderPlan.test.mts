/**
 * The daily prospect finder's decisions, without a database or a network
 * (worker/src/lib/finderPlan.ts).
 *
 *   npm run test:finder
 *
 * The rotation decides what the owner's credits are spent on, and the day's
 * ceilings decide how much. A finder that searched forever, re-ran finished
 * searches, or kept searching after today's leads were in would cost money and
 * find nothing new — so those are what this holds still.
 */
import { DAY_LIMITS, afterSearch, forDay, isKnown, keyOf, knownIndex, nextJob, nextRunAt, rotation, rotationState, type FinderState } from '../src/lib/finderPlan';

const out: string[] = [];
const ok = (n: string, p: boolean, d = '') => out.push(`${p ? 'PASS' : 'FAIL'}  ${n}${p ? '' : ` — ${d}`}`);
const base = (o: Partial<FinderState> = {}): FinderState => ({
  trades: ['real estate agents', 'property managers'], places: ['Richmond, Virginia', 'Norfolk, Virginia'], perDay: 20,
  cursor: 0, pageToken: '', doneKeys: [], day: '2026-10-03', dayAdded: 0, daySearches: 0, dayReads: 0, ...o,
});

/* ── The rotation ── */
{
  const r = rotation(['a', 'b'], ['X', 'Y']);
  ok('every trade in every place, place by place', r.map(x => `${x.trade}@${x.place}`).join(' ') === 'a@X b@X a@Y b@Y', JSON.stringify(r));
  ok('duplicates and blanks are dropped', rotation(['a', 'A ', ''], ['X', 'x']).length === 1);
}

/* ── What it does next ── */
{
  const j = nextJob(base(), 0, 0);
  ok('a fresh finder searches the first trade in the first place', j.kind === 'search' && j.trade === 'real estate agents' && j.place === 'Richmond, Virginia', JSON.stringify(j));
  ok('unread candidates are read before anything new is searched', nextJob(base(), 5, 0).kind === 'read');
  ok('nothing is searched once today\'s leads are in', nextJob(base({ dayAdded: 20 }), 5, 0).kind === 'rest');
  ok('…nor when enough are ready to fill today', nextJob(base({ dayAdded: 15 }), 3, 5).kind === 'rest');
  ok('the day\'s search ceiling stops searching', nextJob(base({ daySearches: DAY_LIMITS.searches }), 0, 0).kind === 'rest');
  ok('the day\'s website ceiling stops reading', nextJob(base({ dayReads: DAY_LIMITS.reads }), 4, 0).kind === 'rest');
}

/* ── After a search ── */
{
  const s0 = base();
  const j = nextJob(s0, 0, 0);
  if (j.kind !== 'search') throw new Error('expected a search');
  const paged = afterSearch(s0, j, 'geo:60');
  ok('a search with another page stays on it, with the page', paged.cursor === 0 && paged.pageToken === 'geo:60' && paged.daySearches === 1);
  const j2 = nextJob(paged, 0, 0);
  ok('…and the next step asks for that page', j2.kind === 'search' && j2.pageToken === 'geo:60' && j2.key === j.key);
  const done = afterSearch(paged, j2 as Extract<typeof j2, { kind: 'search' }>, '');
  ok('a search with no further page is done, and the rotation moves on', done.doneKeys.includes(j.key) && done.cursor === 1 && done.pageToken === '');
  const j3 = nextJob(done, 0, 0);
  ok('…to the next trade in the same place', j3.kind === 'search' && j3.trade === 'property managers' && j3.place === 'Richmond, Virginia', JSON.stringify(j3));
  const all = base({ doneKeys: rotation(s0.trades, s0.places).map(q => q.key) });
  ok('when every search is done the finder is exhausted, not looping', nextJob(all, 0, 0).kind === 'exhausted');
  ok('a done search is never run again, wherever the cursor is', (() => { const x = nextJob(base({ cursor: 0, doneKeys: [keyOf('real estate agents', 'Richmond, Virginia')] }), 0, 0); return x.kind === 'search' && x.trade === 'property managers'; })());
  const st = rotationState(done);
  ok('the rotation reads done / next / waiting', st[0].state === 'done' && st[1].state === 'next' && st[2].state === 'waiting', JSON.stringify(st));
}

/* ── A new day ── */
{
  const s = forDay(base({ dayAdded: 20, daySearches: 12, dayReads: 99 }), '2026-10-04');
  ok('the counters reset when the day turns, the rotation does not', s.dayAdded === 0 && s.daySearches === 0 && s.dayReads === 0 && s.day === '2026-10-04');
  ok('…and not within the same day', forDay(base({ dayAdded: 7 }), '2026-10-03').dayAdded === 7);
  const now = new Date('2026-10-03T15:00:00Z');
  ok('while there is work, the next step is a few minutes away', Date.parse(nextRunAt(now, { kind: 'read' })) - now.getTime() <= 5 * 60_000);
  ok('when today is done, the next step is tomorrow', nextRunAt(now, { kind: 'rest', why: 'quota' }).startsWith('2026-10-04'));
}

/* ── Somebody we already have ── */
{
  const k = knownIndex([
    { name: 'Harbour Realty', email: 'Info@HarbourRealty.com', phone: '+1 804 555 0101', website: 'https://www.harbourrealty.com/' },
    { company: 'Kirk & Sons Property', phone: '(757) 555 0199' },
  ]);
  ok('the same address, any case', isKnown(k, { name: 'X', email: 'info@harbourrealty.com' }));
  ok('the same name and phone, written differently', isKnown(k, { name: 'Kirk and Sons Property', phone: '757-555-0199' }));
  ok('the same name and website host', isKnown(k, { name: 'Harbour Realty', website: 'harbourrealty.com' }));
  ok('a different business with the same name is not', !isKnown(k, { name: 'Harbour Realty', phone: '+1 202 555 0000', website: 'other.com' }));
}

console.log(out.join('\n'));
const failed = out.filter(l => l.startsWith('FAIL')).length;
console.log(`\n${out.length - failed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
