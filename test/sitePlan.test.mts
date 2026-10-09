/**
 * The public site's "Find my solution", without a browser.
 *
 * Run with `npm run test:siteplan`. The requests are the owner's test
 * journeys (docs/SITE-CONVERSION.md): the assertion that matters most in each
 * is again the negative one — nobody is asked about mailboxes before they
 * have an account, a content customer is never asked about sending at all,
 * and a shop is never asked who to prospect. Then the plan's trip to the app:
 * a plan read back from an address is untrusted, and a plan a visitor
 * finished is built on arrival without asking again.
 */
import { allQuestions, applies, buildBlueprint, initialState, withDefaults, DESIGN_QUESTION_IDS, type IntakeState, type WorkspaceFacts } from '../src/services/projectIntake';
import { SITE_SHORTCUTS, MAX_SCREENS, answerOnSite, arrivalDefaults, buyersFor, cleanPlan, decodePlan, encodePlan, planOf, seedState, siteAskable, siteScreens, stillNeeded, withUnderstanding, yourTradeIn } from '../src/services/sitePlan';
import { CUSTOM, solutionByKey } from '../src/services/projectSolutions';
import type { Understanding } from '../src/services/intake';

const out: string[] = [];
const ok = (n: string, p: boolean, d = '') => out.push(`${p ? 'PASS' : 'FAIL'}  ${n}${p ? '' : ` — ${d}`}`);
const NO_WS: WorkspaceFacts = { portfolios: [], workspace: null };
const NEVER_BEFORE_SIGNUP = ['mailbox', 'sender', 'dailyVolume', 'contactList', 'business', 'website'];

const start = (prompt: string, picked = '') => initialState(prompt, picked || undefined, NO_WS, [], []);
const asked = (st: IntakeState) => siteScreens(st, siteAskable(st)).flatMap(s => s.questions.map(q => q.id));
/* Answer every screen as a visitor in a hurry: "Let AI decide" where offered, else the first option, else some words. */
function finish(st: IntakeState): IntakeState {
  let s = st;
  const ids = siteAskable(s);
  for (let round = 0; round < 3; round++) {
    for (const sc of siteScreens(s, ids)) {
      for (const q of sc.questions) {
        if (s.known[q.id]) continue;
        const v = q.aiDecides !== undefined && q.aiDecides !== 'detect' ? q.aiDecides : q.options?.length ? (q.type === 'multi' ? [q.options[0].value] : q.options[0].value) : 'Property managers';
        s = answerOnSite(s, q.id, v, 'you');
      }
    }
  }
  s = answerOnSite(s, 'bizName', 'Pike Roofing', 'you');
  s = answerOnSite(s, 'bizWhat', 'Commercial roofing across Dallas', 'you');
  return answerOnSite(s, 'business', 'manual', 'you');
}

/* ── Test 1: leads ── */
{
  const st = start('I want 30 roofing leads every day in Dallas.');
  ok('roofing leads → Lead Generation', st.solutionKeys[0] === 'lead-generation', JSON.stringify(st.solutionKeys));
  ok('…the leads are to be found, 30 a day, in Dallas (no full stop)', st.known.contactSource?.value === 'find' && st.known.prospectPerDay?.value === '30' && st.known.prospectPlaces?.value === 'Dallas', JSON.stringify(st.known));
  const q = asked(st);
  ok('…asks who to reach and what is on offer', q.includes('audience') && q.includes('offer'), q.join(','));
  ok('…never asks about mailboxes, senders or lists before sign-up', !q.some(id => NEVER_BEFORE_SIGNUP.includes(id)), q.join(','));
  ok('…nor about design', !q.some(id => DESIGN_QUESTION_IDS.includes(id)), q.join(','));
  ok('…asks "who" once, not again as "what kinds of business"', !q.includes('prospectTrades'));
  ok('a roofer is offered the people who buy roofing, not roofers', yourTradeIn(st.prompt) === 'roofing' && buyersFor('roofing').includes('Property managers'));
  const done = finish(st);
  ok('…and the answer to "who" is the daily finder\'s search too', done.known.prospectTrades?.value === done.known.audience?.value, JSON.stringify([done.known.prospectTrades, done.known.audience]));
  const bp = buildBlueprint(withDefaults(done), { companyName: 'Pike Roofing', website: '', files: [], links: [] });
  const names = bp.workflows.map(w => w.name);
  ok('the plan finds prospects, answers leads and follows up', bp.workflows.some(w => w.key === 'finder') && names.some(n => /speed to lead/i.test(n)) && names.some(n => /follow-up/i.test(n)), names.join(' · '));
  ok('…anything that sends is marked as a draft', bp.workflows.filter(w => w.sends).length > 0);
}

/* ── Test 2: content ── */
{
  const st = start('I want daily social media images for my dental clinic.');
  ok('dental images → Social Media Growth', st.solutionKeys[0] === 'social-growth', JSON.stringify(st.solutionKeys));
  const q = asked(st);
  ok('…asks nothing about sending, contacts or offers', !q.some(id => ['mailbox', 'sender', 'dailyVolume', 'contactSource', 'offer', 'emailGoal'].includes(id)), q.join(','));
  ok('…images are understood from "images"', Array.isArray(st.known.socialOutputs?.value) && (st.known.socialOutputs!.value as string[]).includes('image'));
  const bp = buildBlueprint(withDefaults(finish(st)), { companyName: 'Bright Smile', website: '', files: [], links: [] });
  ok('…and builds a content workflow', bp.workflows.some(w => w.channel === 'social'), bp.workflows.map(w => w.name).join(' · '));
}

/* ── Test 3: a store ── */
{
  const st = start('I have 70 products and want an online store.');
  ok('70 products → E-commerce Store, about 51–100', st.solutionKeys[0] === 'ecommerce-store' && st.known.productCount?.value === '51-100');
  const q = asked(st);
  ok('…asks where the products are', q.includes('productSource'), q.join(','));
  ok('…asks nothing about leads', !q.some(id => ['audience', 'prospectTrades', 'contactSource', 'offer', 'mailbox'].includes(id)), q.join(','));
}

/* ── Test 4: old customers ── */
{
  const st = start('I want to follow up automatically with old customers.');
  ok('old customers → Customer Reactivation', st.solutionKeys[0] === 'customer-reactivation', JSON.stringify(st.solutionKeys));
  const q = asked(st);
  ok('…asks where the customers are', q.includes('contactSource'), q.join(','));
  ok('…asks no website-design questions', !q.some(id => ['theme', 'pageTemplate', 'pageLayout', 'storeDesign', 'logo', 'designStyle'].includes(id)), q.join(','));
  const cs = siteScreens(st, siteAskable(st)).flatMap(s => s.questions).find(x => x.id === 'contactSource');
  ok('…without "already in Protected Central" or "a list I have", which a new account cannot have', !!cs && !cs.options!.some(o => o.value === 'crm' || o.value === 'list'), JSON.stringify(cs?.options));
}

/* ── Test 5: something unusual ── */
{
  const prompt = 'I want an AI that reminds my yoga students to renew their memberships and sends them a birthday discount.';
  const base = start(prompt);
  ok('an unusual request matches no ready-made solution', base.solutionKeys[0] === CUSTOM);
  const u: Understanding = {
    summary: 'A custom project for renewals.', name: 'Member Renewal Autopilot', objective: 'Keep members renewing.',
    solutionKeys: ['custom'], match: 'custom', facts: {}, profile: {},
    extraQuestions: [{ id: 'x_renewWhen', group: 'custom', type: 'single', need: 'required', prompt: 'How long before a membership ends should the first reminder go?', options: [{ value: '14', label: 'Two weeks before' }, { value: '7', label: 'One week before' }] }],
    customWorkflows: [{ name: 'Membership renewal reminders', purpose: 'Remind members', kind: 'contact', instruction: 'When a membership is 14 days from ending, email a reminder.' }],
    unsupported: [],
  };
  const st = withUnderstanding(base, u, '', NO_WS, [], []);
  ok('…the AI\'s own clarifying question is asked', asked(st).includes('x_renewWhen'), asked(st).join(','));
  const bp = buildBlueprint(withDefaults(finish(st)), { companyName: 'Flow Yoga', website: '', files: [], links: [] });
  ok('…and the custom workflow it proposed is in the plan', bp.workflows.some(w => /renewal/i.test(w.name)), bp.workflows.map(w => w.name).join(' · '));
  ok('…a picked shortcut wins over the AI\'s guess', withUnderstanding(start('more leads please', 'lead-generation'), { ...u, solutionKeys: ['social-growth'], match: 'strong' }, 'lead-generation', NO_WS, [], []).solutionKeys[0] === 'lead-generation');
}

/* ── Short, for every shortcut ── */
for (const s of SITE_SHORTCUTS) {
  const st = start(s.seed || 'Something custom for my business', s.key);
  const sc = siteScreens(st, siteAskable(st));
  ok(`"${s.label}": at most ${MAX_SCREENS} screens of at most 2 questions, none before sign-up only`,
    sc.length <= MAX_SCREENS && sc.every(x => x.questions.length <= 2) && !sc.some(x => x.questions.some(q => NEVER_BEFORE_SIGNUP.includes(q.id))),
    sc.map(x => x.questions.map(q => q.id).join('+')).join(' | '));
  ok(`"${s.label}" is a solution in the catalogue`, !!solutionByKey(s.key));
}

/* ── Test 7: the plan reaches the app intact, and untrusted ── */
{
  const st = finish(start('I want 30 roofing leads every day in Dallas.'));
  const plan = planOf({ ...st, name: 'Pike Roofing Lead Engine' }, '');
  const enc = encodePlan(plan);
  ok('the plan fits in an address', enc.length < 12_000, String(enc.length));
  const back = decodePlan(enc);
  ok('…and reads back the same', !!back && back.solutionKeys.join() === plan.solutionKeys.join() && back.known.offer?.value === plan.known.offer?.value && back.name === 'Pike Roofing Lead Engine' && back.known.bizName?.value === 'Pike Roofing');
  ok('garbage is not a plan', decodePlan('not*base64') === null && decodePlan('') === null && cleanPlan({ v: 2 }) === null);
  const evil = cleanPlan({
    v: 1, prompt: 'x'.repeat(9000), solutionKeys: ['lead-generation', 'drop-tables'], known: {
      contactSource: { value: 'hack', source: 'you' }, mailbox: { value: 'buy', source: 'evil' }, __proto__x: { value: 1 },
      business: { value: 'existing:somebody-elses-portfolio' }, website: { value: 'javascript:alert(1)' }, bizName: { value: '<b>Pike</b>' },
    }, extraQuestions: [{ id: 'mailbox', type: 'single', prompt: 'overwrite a real question' }, { id: 'x_ok', type: 'script', prompt: 'bad type' }],
  });
  ok('…a tampered plan keeps only catalogue keys', !!evil && evil.solutionKeys.join() === 'lead-generation', JSON.stringify(evil?.solutionKeys));
  ok('…drops answers the question does not accept', !evil?.known.contactSource && evil?.known.mailbox?.value === 'buy' && evil?.known.mailbox?.source === 'you');
  ok('…never names somebody else\'s portfolio or a script as a website', !evil?.known.business && !evil?.known.website);
  ok('…cannot redefine a real question or add a strange one', (evil?.extraQuestions.length ?? 1) === 0);
  ok('…and clips what it keeps', (evil?.prompt.length ?? 0) <= 4000);

  /* Arriving in the app: everything answered → built with no questions. */
  const seeded = arrivalDefaults(seedState(back!, NO_WS));
  ok('a finished plan is built on arrival: nothing left to ask', stillNeeded(seeded).length === 0, stillNeeded(seeded).join(','));
  ok('…the mailbox is "not sure yet", said, so nothing sends until one is connected', seeded.known.mailbox?.value === 'later' && seeded.known.mailbox.source === 'default');
  const contentPlan = arrivalDefaults(seedState(planOf(finish(start('I want daily social media images for my dental clinic.')), ''), NO_WS));
  ok('…a content plan is never given a mailbox answer at all', !contentPlan.known.mailbox);
  const half = seedState(planOf(start('I want to follow up automatically with old customers.'), ''), NO_WS);
  const need = stillNeeded(arrivalDefaults(half));
  ok('a plan left half-way asks only the required questions with no safe default', need.length > 0 && need.every(id => allQuestions(half).find(q => q.id === id)?.need === 'required') && need.includes('offer'), need.join(','));
  ok('…and never re-asks one the visitor answered', !stillNeeded(arrivalDefaults(seedState(planOf(answerOnSite(half, 'offer', '10% off a return visit', 'you'), ''), NO_WS))).includes('offer'));
  ok('…every question it asks applies', need.every(id => applies(allQuestions(half).find(q => q.id === id)!, half.known)));
}

console.log(out.join('\n'));
const failed = out.filter(l => l.startsWith('FAIL')).length;
console.log(`\n${out.length - failed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
