/**
 * Researched emails, without a network (worker/src/lib/emailStyle.ts and the
 * merge fields that carry the research).
 *
 *   npm run test:emailstyle
 *
 * The lines go where a reader expects an opening; an empty research result
 * leaves the email exactly as it was written; nothing the model returns can
 * smuggle in a link, a merge field or a pretend relationship.
 */
import { briefWantsResearch, cleanResearch, researchSiteOf, withResearch } from '../worker/src/lib/emailStyle.ts';
import { personalise } from '../worker/src/lib/mergeFields.ts';
import { buildBlueprint, briefOf, initialState } from '../src/services/projectIntake.ts';

const out: string[] = [];
const ok = (n: string, p: boolean, d = '') => out.push(`${p ? 'PASS' : 'FAIL'}  ${n}${p ? '' : ` — ${d}`}`);

const body = 'Hi {{firstName}},\n\nI’m writing from {{myCompany}}.\n\nBook here: {{bookingLink}}';
const r = withResearch(body);
ok('research goes after the greeting', r.startsWith('Hi {{firstName}},\n\n{{personalOpener}}\n\n{{theirChallenge}}\n\nI’m writing'), JSON.stringify(r));
ok('never twice', withResearch(r) === r);
ok('no greeting: at the top', withResearch('Quick question about your bookings.').startsWith('{{personalOpener}}'));

const biz = { myCompany: 'Glow', website: '', bookingLink: 'https://x.test/book/glow', senderName: '' };
const none = personalise(r, { firstName: 'Sam' }, biz);
ok('nothing found → the email reads as written', !/personalOpener|theirChallenge/.test(none) && !none.includes('\n\n\n\n'), JSON.stringify(none));
ok('…with its own lines intact', none.includes('I’m writing from Glow.') && none.includes('https://x.test/book/glow'));
const some = personalise(r, { firstName: 'Sam', personalOpener: 'I saw you opened in Hove.', theirChallenge: 'New chairs fill slowly.' }, biz);
ok('found → both lines in place', some.includes('Hi Sam,\n\nI saw you opened in Hove.\n\nNew chairs fill slowly.'), JSON.stringify(some));

const c = cleanResearch({ opener: 'Great speaking last week! Your new Hove clinic looks great.', challenge: 'See https://evil.test {{bookingLink}} — clinics that add a site often see slower bookings at first.' });
ok('a pretend relationship is dropped', c.opener === '', c.opener);
ok('links and merge fields are stripped', !/https?:|\{\{/.test(c.challenge) && c.challenge.length > 20, c.challenge);

ok('site from the record', researchSiteOf({ website: 'brightsmile.co.uk' }) === 'https://brightsmile.co.uk');
ok('site from a business address', researchSiteOf({ email: 'sam@brightsmile.co.uk' }) === 'https://brightsmile.co.uk');
ok('never a webmail domain', researchSiteOf({ email: 'sam@gmail.com' }) === '');

ok('the brief says researched', briefWantsResearch({ emailStyle: 'researched' }) && !briefWantsResearch({ emailStyle: 'template' }) && !briefWantsResearch(null));

/* The wizard: a lead-generation project that finds prospects asks how emails open, and says so on the brief. */
{
  const ws = { portfolios: [], workspace: null };
  const st = initialState('Find dentists in Leeds every day and email them to book a free audit', 'lead-generation', ws, [], []);
  const known = { ...st.known, emailStyle: { value: 'researched', source: 'you' as const } };
  const bp = buildBlueprint({ ...st, known }, { companyName: 'Glow', website: '', files: [], links: [] });
  const brief = briefOf(bp, st.prompt);
  ok('the brief carries the style for the planner', brief.emailStyle === 'researched', JSON.stringify(brief.emailStyle));
  const follow = bp.workflows.find(w => w.key === 'followup');
  const mail = follow?.nodes?.find(n => n.type === 'send_email');
  ok('the follow-up opens with the research', !mail || /\{\{personalOpener\}\}/.test(String(mail.config.body ?? '')), String(mail?.config.body ?? '').slice(0, 120));
  const reply = bp.workflows.find(w => w.key === 'reply')?.nodes?.find(n => n.type === 'send_email');
  ok('a reply to an enquiry does not', !reply || !/personalOpener/.test(String(reply.config.body ?? '')));
}

console.log(out.join('\n'));
const failed = out.filter(l => l.startsWith('FAIL')).length;
console.log(`\n${out.length - failed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
