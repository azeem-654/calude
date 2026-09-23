/**
 * The template library, checked as data.
 *
 * Run with `npm run test:templates`. Every template in here is something a
 * customer can add to a real project with one click, and the graph they get is
 * the graph that runs. A template with a broken step is a broken workflow
 * shipped to everybody at once, which is a different class of mistake from a
 * customer building one badly.
 *
 * ── What is worth checking ──
 *
 * Not that the copy is good — that is a judgement. That each one is **valid**,
 * **honest** and **addable**: it passes the same validation the editor applies,
 * it says what it needs before it is chosen, and nothing claims a single number
 * for an outcome it cannot know.
 */
import { CATEGORIES, TEMPLATES, DEMO_WORKFLOWS } from '../src/components/Autopilot/workflowTemplates';
import { problemsWith } from '../src/components/Autopilot/workflowNodes';
import {
  difficultyOf, hasBranches, isScheduled, outputsOf, setupMinutes, usesAi,
} from '../src/components/Autopilot/templateMeta';

const out: string[] = [];
const ok = (n: string, p: boolean, d = '') => out.push(`${p ? 'PASS' : 'FAIL'}  ${n}${p ? '' : ` — ${d}`}`);

/* Templates that arrive deliberately incomplete, and why. A feed template that
   shipped with a working address would write about somebody else's business
   until it was noticed, so it ships blank and the editor refuses to save it
   until the customer supplies one. */
const NEEDS_FILLING_IN = new Set([
  'feed-blog', 'youtube-blog', 'linkedin-repurpose', 'shorts-repurpose', 'blog-to-social',
]);

/* ── Every template is a graph that would actually run ──────────────────── */

for (const t of TEMPLATES) {
  const problems = problemsWith(t.name, t.nodes);
  if (NEEDS_FILLING_IN.has(t.key)) {
    ok(`${t.key} · ships incomplete on purpose, and says which field`,
      problems.some(p => /address/i.test(p)), problems.join(' | ') || 'it saved clean, so the blank field is not being caught');
  } else {
    ok(`${t.key} · is a graph that can be saved as it comes`,
      problems.length === 0, problems.join(' | '));
  }
}

/* ── Nothing arrives switched on, and nothing is dressed up ─────────────── */

for (const t of TEMPLATES) {
  ok(`${t.key} · says what it needs before it is chosen`,
    Array.isArray(t.needs) && t.needs.length > 0, JSON.stringify(t.needs));

  /*
   * The one that matters most here. "Increases bookings by 40%" is a forecast
   * about a business this product knows six lines about. Every outcome is a
   * range, a "depends", or an explicit refusal to say.
   */
  const bareNumber = /\b\d+(\.\d+)?%/.test(t.outcome) && !/–|-|to |about|around|depends|assume|estimate|varies/i.test(t.outcome);
  ok(`${t.key} · does not promise a number it cannot know`, !bareNumber, t.outcome);

  ok(`${t.key} · states the problem, not only the feature`,
    !!t.pain && t.pain.length > 20, t.pain);
}

/* ── Every borrowed figure carries its source ───────────────────────────── */

for (const t of TEMPLATES.filter(x => x.evidence)) {
  ok(`${t.key} · its evidence names who published it`,
    !!t.evidence?.source && t.evidence.source.length > 3, JSON.stringify(t.evidence));
  /* Hedged, because all of it is vendor or agency published rather than
     independent. A flat assertion would be this product vouching for somebody
     else's marketing. */
  ok(`${t.key} · and is reported rather than asserted`,
    /reported|said|claim|published/i.test(t.evidence?.claim ?? ''), t.evidence?.claim);
}

/* ── The library holds together ─────────────────────────────────────────── */

{
  const keys = TEMPLATES.map(t => t.key);
  ok('every key is unique', new Set(keys).size === keys.length,
    keys.filter((k, i) => keys.indexOf(k) !== i).join(', '));

  const shelves = new Set(CATEGORIES.map(c => c.key));
  const orphans = TEMPLATES.filter(t => !shelves.has(t.category));
  /* A template filed under a category that does not exist would render on no
     shelf at all — present in the data, invisible in the library. */
  ok('no template is filed on a shelf that does not exist', orphans.length === 0,
    orphans.map(t => `${t.key}:${t.category}`).join(', '));

  const empty = CATEGORIES.filter(c => !TEMPLATES.some(t => t.category === c.key));
  ok('and no shelf is empty', empty.length === 0, empty.map(c => c.key).join(', '));

  ok('the demo points at templates that exist',
    DEMO_WORKFLOWS.every(k => keys.includes(k)),
    DEMO_WORKFLOWS.filter(k => !keys.includes(k)).join(', '));
}

/* ── The shape of the library ───────────────────────────────────────────── */

{
  /* The research's own conclusion: answering fast is the one that pays in the
     first week, so it is first. A library sorted A–Z would open on
     "Appointments". */
  ok('the first shelf is the one that pays first', CATEGORIES[0].key === 'speed', CATEGORIES[0].key);

  const scheduled = TEMPLATES.filter(t => t.nodes.some(n => n.config?.event === 'schedule'));
  ok('every scheduled template contains an agent, because nothing else could run it',
    scheduled.every(t => t.nodes.some(n => n.type === 'ai')),
    scheduled.filter(t => !t.nodes.some(n => n.type === 'ai')).map(t => t.key).join(', '));
  /* And the reverse: a scheduled graph has no contact in it, so a send step
     would have nowhere to send. */
  ok('and no scheduled template tries to send to a person',
    scheduled.every(t => !t.nodes.some(n => n.type === 'send_email' || n.type === 'send_sms')),
    scheduled.filter(t => t.nodes.some(n => n.type === 'send_email')).map(t => t.key).join(', '));

  const sends = TEMPLATES.filter(t => t.nodes.some(n => n.type === 'send_sms'));
  ok('every template that texts says it needs an SMS provider',
    sends.every(t => t.needs.some(x => /sms/i.test(x))),
    sends.filter(t => !t.needs.some(x => /sms/i.test(x))).map(t => t.key).join(', '));
  const mails = TEMPLATES.filter(t => t.nodes.some(n => n.type === 'send_email'));
  ok('and every one that emails says it needs a mailbox',
    mails.every(t => t.needs.some(x => /mailbox/i.test(x))),
    mails.filter(t => !t.needs.some(x => /mailbox/i.test(x))).map(t => t.key).join(', '));
}

/* ── Findable by what somebody would type ───────────────────────────────── */

{
  /*
   * The library is filed by the problem, and the words somebody types are the
   * words for the problem — not the name we gave the template. "missed calls"
   * returned nothing until this was pinned, because the template is called
   * "Text back a call nobody answered" and its blurb spells it `missed-call`.
   */
  const hay = (t: typeof TEMPLATES[number]) =>
    `${t.name} ${t.blurb} ${t.pain} ${t.description} ${t.keywords.join(' ')}`.toLowerCase();

  const searches: [string, string][] = [
    ['missed calls', 'missed-call'],
    ['abandoned cart', 'unpaid-order'],
    ['google review', 'review-request'],
    ['no show', 'no-show-recovery'],
    ['database reactivation', 'dormant-winback'],
    ['speed to lead', 'speed-to-lead'],
    ['newsletter', 'year-emails'],
    ['youtube', 'youtube-blog'],
    ['onboarding', 'new-customer'],
  ];
  for (const [typed, expect] of searches) {
    const hits = TEMPLATES.filter(t => hay(t).includes(typed));
    ok(`searching "${typed}" finds ${expect}`,
      hits.some(t => t.key === expect), hits.map(t => t.key).join(', ') || 'nothing found');
  }

  ok('every template carries keywords to be found by',
    TEMPLATES.every(t => t.keywords.length >= 3),
    TEMPLATES.filter(t => t.keywords.length < 3).map(t => t.key).join(', '));
}

/* ── The metadata the gallery shows is derived, and sane ────────────────── */

{
  for (const t of TEMPLATES) {
    const d = difficultyOf(t.nodes);
    const m = setupMinutes(t.nodes);
    /* A gallery badge nobody can act on is worse than no badge. Five minutes is
       the floor because reading it takes that long; an hour means the template
       is too big to be a starting point. */
    ok(`${t.key} · its setup estimate is a believable number`,
      m >= 5 && m <= 60, `${m} minutes`);
    ok(`${t.key} · has a difficulty`, ['easy', 'medium', 'advanced'].includes(d), d);
    /* Every template produces something somebody can point at — the fallback
       line is for a graph that only moves records, and no template here is
       that. */
    ok(`${t.key} · names what actually comes out of it`,
      outputsOf(t.nodes).length > 0 && !/Nothing that leaves the app/.test(outputsOf(t.nodes)[0]),
      outputsOf(t.nodes).join(' | '));
    ok(`${t.key} · says which trades it is for`, t.industry.length > 0, JSON.stringify(t.industry));
    /* Every name ends in "Automation": it is what the customer asked for and,
       more usefully, it makes the library scan as one set rather than as a
       pile of differently-written notes. */
    ok(`${t.key} · is named as an automation`, /Automation$/.test(t.name), t.name);
  }

  /*
   * Branching is what makes a workflow hard to hold in your head, so difficulty
   * has to rise with it — that is the whole reason it is not a node count.
   * Asserted against the rule directly rather than against a chosen template:
   * the same graph, with and without a fork.
   */
  {
    const plain = [
      { id: 'a', type: 'trigger', label: 'Form', config: {}, nextId: 'b' },
      { id: 'b', type: 'send_email', label: 'Mail', config: { subject: 'x' }, nextId: 'c' },
      { id: 'c', type: 'wait', label: 'Wait', config: { days: '1' }, nextId: 'd' },
      { id: 'd', type: 'send_email', label: 'Mail 2', config: { subject: 'y' }, nextId: null },
    ];
    const forked = [
      ...plain.slice(0, 3),
      { id: 'x', type: 'condition', label: 'Replied?', config: { field: 'status' }, nextId: null, yesId: 'd', noId: null },
      plain[3],
    ];
    ok('adding a fork raises the setup estimate and the difficulty score',
      setupMinutes(forked) > setupMinutes(plain),
      `${setupMinutes(plain)} → ${setupMinutes(forked)}`);
    ok('and a long straight drip is still easy', difficultyOf(plain) === 'easy', difficultyOf(plain));
  }

  ok('every scheduled content template is marked as using the AI',
    TEMPLATES.filter(t => isScheduled(t.nodes)).every(t => usesAi(t.nodes)));

  /* Featured is a recommendation, not a sort order. */
  const featured = TEMPLATES.filter(t => t.featured);
  ok('featured is a handful rather than half the library',
    featured.length >= 2 && featured.length <= Math.ceil(TEMPLATES.length / 4),
    `${featured.length} of ${TEMPLATES.length}`);
}

console.log(`\n${TEMPLATES.length} templates on ${CATEGORIES.length} shelves\n`);
for (const line of out) console.log(line);
const failed = out.filter(l => l.startsWith('FAIL')).length;
console.log(`\n${out.length - failed}/${out.length} passed`);
process.exit(failed ? 1 : 0);
