/**
 * From a sentence to a blueprint, without a browser or a model.
 *
 * Run with `npm run test:intake`. The seven requests are the ones the rebuild
 * was specified against, and the assertion that matters most in each is the
 * negative one: a social project must never be asked about mailboxes, and a
 * shop must never be asked about posting schedules. The old wizard asked every
 * project about sending, and it looked perfectly reasonable doing it.
 */
import {
  applyOps, buildBlueprint, initialState, parseCsv, parseEdit, pendingQuestions,
  productsFromCsv, imageFor, screensOf, capsOf, kindOf, briefOf,
  type IntakeState, type WorkspaceFacts, type Attachment,
} from '../src/services/projectIntake';
import { SOLUTIONS } from '../src/services/projectSolutions';
import { TEMPLATES } from '../src/components/Autopilot/workflowTemplates';

const out: string[] = [];
const ok = (n: string, p: boolean, d = '') => out.push(`${p ? 'PASS' : 'FAIL'}  ${n}${p ? '' : ` — ${d}`}`);

const EMPTY: WorkspaceFacts = { portfolios: [], workspace: null };
const ONE: WorkspaceFacts = { portfolios: [{ id: 'pf1', name: 'Pike Plumbing', website: 'https://pikeplumbing.co.uk' }] };
const CTX = { companyName: 'Pike Plumbing', website: '', files: [] as Attachment[], links: [] };

const SENDING = ['mailbox', 'sender', 'dailyVolume', 'contactSource'];
const ids = (s: IntakeState) => pendingQuestions(s).map(q => q.id);
const answerAll = (s: IntakeState): IntakeState => {
  /* Press "Let AI decide" on everything that offers it and type something into
     the rest, as a customer in a hurry would. */
  let st = s;
  for (let i = 0; i < 6; i++) {
    const set: Record<string, string | string[]> = {};
    for (const q of pendingQuestions(st)) {
      if (q.aiDecides !== undefined && q.aiDecides !== 'detect') set[q.id] = q.aiDecides;
      else if (q.options?.length) set[q.id] = q.type === 'multi' ? [q.options[0].value] : q.options[0].value;
      else set[q.id] = q.type === 'business' ? 'manual' : 'Something specific';
    }
    if (!Object.keys(set).length) break;
    st = applyOps(st, { set });
    for (const id of Object.keys(set)) if (!st.known[id]) st.known[id] = { value: set[id], source: 'you' };
  }
  return st;
};

/* ── The catalogue is sound ── */
{
  const keys = new Set(TEMPLATES.map(t => t.key));
  for (const s of SOLUTIONS) {
    const bp = buildBlueprint(answerAll(initialState(s.example || 'something new', s.key, ONE, [], [])), CTX);
    const missing = bp.workflows.filter(w => w.origin === 'template' && !keys.has(w.templateKey ?? ''));
    ok(`${s.key}: every template it names exists`, !missing.length, missing.map(m => m.templateKey).join(','));
    const broken = bp.workflows.filter(w => w.origin !== 'ai' && !(w.nodes ?? []).some(n => n.type === 'trigger'));
    ok(`${s.key}: every workflow it builds has a trigger`, !broken.length, broken.map(b => b.name).join(','));
  }
  ok('there are at least eighteen solutions plus custom', SOLUTIONS.length >= 19, String(SOLUTIONS.length));
}

/* ── TEST 1: social, no sending questions ── */
{
  const s = initialState('Study my company website https://pikeplumbing.co.uk and create one social image post every weekday.', undefined, EMPTY, [], []);
  ok('T1 matches Social Media Growth', s.solutionKeys[0] === 'social-growth', s.solutionKeys.join());
  ok('T1 knows the schedule from the sentence', s.known.frequency?.value === 'weekdays', JSON.stringify(s.known.frequency));
  ok('T1 knows the business comes from the website', s.known.business?.value === 'website' && String(s.known.website?.value).includes('pikeplumbing'));
  const q = ids(s);
  ok('T1 asks no mailbox, domain or sending question', !q.some(id => SENDING.includes(id)), q.join());
  ok('T1 still asks which platforms', q.includes('platforms'), q.join());
  const bp = buildBlueprint(answerAll(s), CTX);
  ok('T1 builds the social content workflow', bp.workflows.some(w => w.channel === 'social' && !w.sends));
  ok('T1 hands off for manual publishing', bp.manual.some(m => /publish/i.test(m)), bp.manual.join('|'));
  ok('T1 never needs a mailbox', !bp.requirements.includes('mailbox'), bp.requirements.join());
  ok('T1 keeps the planner out of email', !bp.plannerChannels.includes('email'), bp.plannerChannels.join());
  const trig = bp.workflows[0].nodes?.[0];
  ok('T1 runs on weekdays', trig?.config.cadence === 'weekdays', JSON.stringify(trig?.config));
  ok('T1 is a content project, not lead-gen', kindOf(bp) === 'general' && !capsOf(bp).includes('email'), `${kindOf(bp)} ${capsOf(bp)}`);
}

/* ── TEST 2: reactivation, sending questions belong here ── */
{
  const s = initialState('I have 10,000 previous customers. Create an email reactivation campaign.', undefined, ONE, [], []);
  ok('T2 matches Customer Reactivation', s.solutionKeys[0] === 'customer-reactivation', s.solutionKeys.join());
  ok('T2 knows the list size', s.known.contactCount?.value === '2000-10000' || s.known.contactCount?.value === '10000+', JSON.stringify(s.known.contactCount));
  const q = ids(s);
  ok('T2 asks where the contacts are', q.includes('contactSource'), q.join());
  ok('T2 asks about the mailbox', q.includes('mailbox'), q.join());
  ok('T2 asks what is on offer', q.includes('offer'), q.join());
  ok('T2 does not ask about platforms', !q.includes('platforms'), q.join());
  ok('T2 does not re-ask the business it already has', !q.includes('business'), q.join());
  const bp = buildBlueprint(answerAll(s), CTX);
  ok('T2 needs a mailbox', bp.requirements.includes('mailbox'));
  ok('T2 planner writes and sends email', bp.plannerChannels.includes('email'));
  ok('T2 batches a big list', bp.approvals.some(a => /small group/.test(a)) || bp.limits.some(l => /batches/.test(l)), bp.approvals.join('|'));
}

/* ── TEST 3: e-commerce ── */
{
  const csv: Attachment = { id: 'a', name: 'products.csv', mime: 'text/csv', size: 10, kind: 'sheet', text: 'Title,SKU,Price,Image\nRed Mug,MUG-R,12.50,red-mug.jpg\nBlue Mug,MUG-B,"1,012.00",\n' };
  const s = initialState('I have 80 products with images and prices. Build an e-commerce store.', undefined, ONE, [csv], []);
  ok('T3 matches E-commerce Store', s.solutionKeys[0] === 'ecommerce-store', s.solutionKeys.join());
  ok('T3 knows the count bucket', s.known.productCount?.value === '51-100', JSON.stringify(s.known.productCount));
  ok('T3 knows the products are in the spreadsheet', s.known.productSource?.value === 'upload');
  const q = ids(s);
  ok('T3 asks about variants or the store', q.includes('variants') || q.includes('storeDesign'), q.join());
  ok('T3 asks nothing about posting or sending', !q.some(id => [...SENDING, 'platforms', 'frequency'].includes(id)), q.join());
  const bp = buildBlueprint(answerAll(s), CTX);
  ok('T3 imports products as part of the build', bp.setup.some(st => st.key === 'import' && st.by === 'autopilot'));
  ok('T3 needs payments', bp.requirements.includes('payments'));
  ok('T3 is an ecommerce project', kindOf(bp) === 'ecommerce', kindOf(bp));
  const rows = parseCsv(csv.text!);
  const { products } = productsFromCsv(rows);
  ok('CSV: two products', products.length === 2, String(products.length));
  ok('CSV: thousands separator in a quoted price', products[1]?.priceCents === 101200, String(products[1]?.priceCents));
  const img: Attachment = { id: 'i', name: 'Red-Mug.JPG', mime: 'image/jpeg', size: 1, kind: 'image' };
  ok('CSV: an image is matched by file name', imageFor(products[0], [img])?.id === 'i');
}

/* ── TEST 4: missed appointments ── */
{
  const s = initialState('Follow up with customers who miss appointments and try to rebook them.', undefined, ONE, [], []);
  ok('T4 matches Appointment Booking', s.solutionKeys[0] === 'appointment-booking', s.solutionKeys.join());
  ok('T4 knows it is about no-shows', JSON.stringify(s.known.apptFocus?.value ?? '').includes('noshow'));
  const q = ids(s);
  ok('T4 asks where appointments live', q.includes('calendar'), q.join());
  ok('T4 asks how to contact people', q.includes('apptChannels'), q.join());
  const bp = buildBlueprint(answerAll(s), CTX);
  ok('T4 builds the no-show recovery', bp.workflows.some(w => w.templateKey === 'no-show-recovery'));
}

/* ── TEST 5: SEO blog ── */
{
  const s = initialState('Create SEO blog content every week.', undefined, ONE, [], []);
  ok('T5 matches Blog & SEO', s.solutionKeys[0] === 'blog-seo', s.solutionKeys.join());
  ok('T5 knows weekly', s.known.blogFrequency?.value === 'weekly', JSON.stringify(s.known));
  const q = ids(s);
  ok('T5 asks about topics or sources', q.includes('topics') || q.includes('blogSource'), q.join());
  ok('T5 asks nothing about sending', !q.some(id => SENDING.includes(id)), q.join());
  const bp = buildBlueprint(answerAll(s), CTX);
  ok('T5 drafts to the Blog', bp.workflows.some(w => w.channel === 'blog'));
}

/* ── TEST 6: something unusual ── */
{
  const s = initialState('Every month, turn our volunteer rota changes into a friendly note for the team.', undefined, ONE, [], []);
  ok('T6 falls through to a custom project', s.solutionKeys[0] === 'custom' && s.strength === 'custom', s.solutionKeys.join());
  const q = ids(s);
  ok('T6 still asks sensible questions', q.includes('customOutput') && q.length <= 6, q.join());
  const st = applyOps(s, { set: { customOutput: ['tasks'], customTrigger: 'contact' } });
  const bp = buildBlueprint(answerAll(st), CTX);
  ok('T6 builds a custom workflow rather than failing', bp.workflows.length >= 1, JSON.stringify(bp.workflows.map(w => w.name)));
  ok('T6 screens hold at most three questions', screensOf(pendingQuestions(s)).every(sc => sc.questions.length <= 3));
}

/* ── Outreach: the audience comes out of the sentence ── */
{
  const s = initialState('Send a five-email outreach sequence to Amazon sellers and book interested prospects.', undefined, ONE, [], []);
  ok('outreach matches Email Outreach', s.solutionKeys.includes('email-outreach'), s.solutionKeys.join());
  ok('outreach knows the audience', s.known.audience?.value === 'Amazon sellers', JSON.stringify(s.known.audience));
  ok('outreach knows the length', s.known.sequenceLength?.value === '5', JSON.stringify(s.known.sequenceLength));
}

/* ── Editing the blueprint ── */
{
  let s = answerAll(initialState('Create one image post every day for Instagram, Facebook and LinkedIn.', undefined, ONE, [], []));
  let bp = buildBlueprint(s, CTX);
  const e1 = parseEdit('Make this three posts per week.', s, bp);
  ok('edit: three a week is understood', !!e1 && e1.ops.set?.frequency === '3-week', JSON.stringify(e1));
  s = applyOps(s, e1!.ops); bp = buildBlueprint(s, CTX);
  ok('edit: the trigger now runs Mon/Wed/Fri', bp.workflows[0].nodes?.[0].config.days === 'mon,wed,fri');
  const e2 = parseEdit('Remove LinkedIn.', s, bp);
  s = applyOps(s, e2!.ops); bp = buildBlueprint(s, CTX);
  ok('edit: LinkedIn is gone', !bp.workflows[0].nodes?.some(n => n.config.platform === 'linkedin'));
  const e3 = parseEdit('Add a blog every Friday.', s, bp);
  s = applyOps(s, e3!.ops); bp = buildBlueprint(s, CTX);
  const blog = bp.workflows.find(w => w.channel === 'blog');
  ok('edit: a Friday blog is added', blog?.nodes?.[0].config.days === 'fri', JSON.stringify(blog?.nodes?.[0]));
  const e4 = parseEdit('Make approval mandatory', s, bp);
  s = applyOps(s, e4!.ops); bp = buildBlueprint(s, CTX);
  ok('edit: approval is mandatory', bp.workflows[0].nodes?.slice(1).every(n => n.config.handoff === 'review') ?? false);
  const e5 = parseEdit('Create two image versions', s, bp);
  s = applyOps(s, e5!.ops); bp = buildBlueprint(s, CTX);
  ok('edit: two versions each run', bp.workflows[0].nodes?.[1].config.count === '2');
  ok('edit: nonsense is admitted, not guessed', parseEdit('purple monkey dishwasher', s, bp) === null);
  const brief = briefOf(bp, s.prompt);
  ok('brief carries planner channels and no node graphs', Array.isArray(brief.plannerChannels) && !JSON.stringify(brief).includes('"nodes"'));
}

console.log(out.join('\n'));
const failed = out.filter(l => l.startsWith('FAIL')).length;
console.log(`\n${out.length - failed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
