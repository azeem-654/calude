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

const out: string[] = [];
const ok = (n: string, p: boolean, d = '') => out.push(`${p ? 'PASS' : 'FAIL'}  ${n}${p ? '' : ` — ${d}`}`);

/* Templates that arrive deliberately incomplete, and why. A feed template that
   shipped with a working address would write about somebody else's business
   until it was noticed, so it ships blank and the editor refuses to save it
   until the customer supplies one. */
const NEEDS_FILLING_IN = new Set(['feed-blog', 'youtube-blog']);

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

console.log(`\n${TEMPLATES.length} templates on ${CATEGORIES.length} shelves\n`);
for (const line of out) console.log(line);
const failed = out.filter(l => l.startsWith('FAIL')).length;
console.log(`\n${out.length - failed}/${out.length} passed`);
process.exit(failed ? 1 : 0);
