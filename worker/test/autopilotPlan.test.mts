/**
 * What Autopilot decides to do, argued with directly.
 *
 * Run with `npm run test:autopilot`. No database and no network: `planNext` is
 * a pure function over a workspace snapshot, which is what makes the question
 * "would it plan this?" answerable without inventing a tenant and waiting for a
 * cron.
 *
 * ── What is worth testing here ──
 *
 * The cases where a plausible implementation is wrong and looks right. Nearly
 * all of them are about *cadence*, because the bug this file was written after
 * was exactly that shape: every content play asked "is there none?", which is
 * the right question precisely once. A project produced one blog post, one week
 * of social and one page on the day it was created and then nothing at all —
 * for ever — while the board went on saying it was running. Nothing failed and
 * no screen said anything was wrong.
 */
import { planNext, type Workspace } from '../src/lib/autopilotPlan';

const out: string[] = [];
const ok = (n: string, p: boolean, d = '') => out.push(`${p ? 'PASS' : 'FAIL'}  ${n}${p ? '' : ` — ${d}`}`);

const hoursAgo = (h: number) => new Date(Date.now() - h * 3_600_000).toISOString();

/** A workspace that can do everything, so a play's own guard is what decides. */
const ws = (over: Partial<Workspace> = {}): Workspace => ({
  kind: 'leadgen',
  today: '2026-09-20',
  contacts: [],
  sequences: [],
  enrolments: [],
  pipelines: [],
  reviewRequests: [],
  canEmail: true,
  canSms: false,
  content: {
    funnels: 1, websites: 0, blogPosts: 3, socialPosts: 9, shorts: 1,
    newestBlogAt: hoursAgo(1), newestSocialAt: hoursAgo(1), socialUnpublished: 9,
    canWrite: true,
  },
  ...over,
});

const keys = (w: Workspace) => planNext(w).map(a => a.key);
const find = (w: Workspace, prefix: string) => planNext(w).find(a => a.key.startsWith(prefix));

/* ── The blog, every day ── */
{
  const fresh = ws();
  ok('a post written an hour ago is not written again',
    !keys(fresh).some(k => k.startsWith('write-blog')), keys(fresh).join(' '));

  const stale = ws({ content: { ...ws().content!, newestBlogAt: hoursAgo(21) } });
  const a = find(stale, 'write-blog');
  ok('a post written yesterday means one is due today', !!a, keys(stale).join(' '));

  /* The date is what makes the existing dedupe do the work: one open action per
     summary, so yesterday's is a different string and today's is not a repeat.
     Without it "one a day" would need a whole new marker table. */
  ok('and today\'s date is on it, which is what stops two a day',
    a?.summary.includes('2026-09-20') === true, a?.summary ?? '');
  ok('and the key carries it too', a?.key === 'write-blog-2026-09-20', a?.key ?? '');

  const never = ws({ content: { ...ws().content!, blogPosts: 0, newestBlogAt: null } });
  const first = find(never, 'write-blog');
  ok('the very first one is named as the first rather than dated',
    first?.summary === 'Write your first blog post', first?.summary ?? '');

  /* The honest failure mode: no key, nothing written, and nothing pretending. */
  const noKey = ws({ content: { ...ws().content!, newestBlogAt: hoursAgo(48), canWrite: false } });
  ok('nothing is planned to be written without a key to write it',
    !keys(noKey).some(k => k.startsWith('write-')), keys(noKey).join(' '));
}

/* ── Social is a queue, not a total ── */
{
  /* The case the old rule got wrong: forty posts behind and none in front is
     exactly the page that stops tomorrow, and counting everything ever written
     meant it never got another. */
  const spent = ws({ content: { ...ws().content!, socialPosts: 40, socialUnpublished: 1, newestSocialAt: hoursAgo(30) } });
  const top = find(spent, 'write-social');
  ok('a page with forty behind it and one ahead is topped up', !!top, keys(spent).join(' '));
  ok('and the reason talks about what is still to go out',
    /still to go out/.test(top?.because ?? ''), top?.because ?? '');

  const stocked = ws({ content: { ...ws().content!, socialPosts: 6, socialUnpublished: 6, newestSocialAt: hoursAgo(30) } });
  ok('a full queue is left alone', !find(stocked, 'write-social'), keys(stocked).join(' '));

  /* Two guards, not one: an empty queue topped up an hour ago must wait, or a
     failed write would be retried every five minutes for ever. */
  const justTopped = ws({ content: { ...ws().content!, socialUnpublished: 0, newestSocialAt: hoursAgo(1) } });
  ok('an empty queue topped up an hour ago waits rather than retrying every tick',
    !find(justTopped, 'write-social'), keys(justTopped).join(' '));
}

/* ── A website or a funnel, decided from the business ── */
{
  const bare = { ...ws().content!, funnels: 0, websites: 0 };

  const shop = ws({ kind: 'ecommerce', content: bare });
  const shopPlan = find(shop, 'write-landing');
  ok('a shop is given a funnel', shopPlan?.effect.type === 'write' && (shopPlan.effect as { what: string }).what === 'landing',
    JSON.stringify(shopPlan?.effect ?? {}));
  ok('and it is called a funnel on the board', /funnel/i.test(shopPlan?.summary ?? ''), shopPlan?.summary ?? '');

  const trade = ws({ kind: 'leadgen', content: bare });
  const tradePlan = find(trade, 'write-landing');
  ok('a services business is given a website',
    tradePlan?.effect.type === 'write' && (tradePlan.effect as { what: string }).what === 'website',
    JSON.stringify(tradePlan?.effect ?? {}));
  ok('and the reason says why it is not a squeeze page',
    /real firm/.test(tradePlan?.because ?? ''), tradePlan?.because ?? '');

  ok('a business that already has one gets neither', !find(ws(), 'write-landing'), keys(ws()).join(' '));
}

/* ── More than one thing to say ── */
{
  const seq = (id: string) => ({ id, name: id, status: 'active', steps: [{ channel: 'email' }] });

  const one = ws({ sequences: [seq('s1')] });
  const more = find(one, 'write-sequence-extra');
  ok('a workspace with one campaign is offered a second angle', !!more, keys(one).join(' '));
  ok('and the angle is named rather than "another campaign"',
    /win back|cold|what else/.test(more?.summary ?? ''), more?.summary ?? '');

  const four = ws({ sequences: ['s1', 's2', 's3', 's4'].map(seq) });
  ok('it stops at four, because unread drafts hide the one that matters',
    !find(four, 'write-sequence-extra'), keys(four).join(' '));

  /* Writing is not sending. The guardrail on the enrolment is what protects
     anybody's inbox, and this play must not be the thing that bypasses it. */
  ok('writing a campaign asks for the workflow permission, never the send one',
    more?.permission === 'createWorkflows', more?.permission ?? '');

  const mute = ws({ sequences: [seq('s1')], canEmail: false, canSms: false });
  ok('a workspace that cannot send is not given more to send',
    !find(mute, 'write-sequence-extra'), keys(mute).join(' '));
}

/* ── The short stays a one-off ── */
{
  const noShort = ws({ content: { ...ws().content!, shorts: 0 } });
  ok('a video script is offered when there is none', !!find(noShort, 'write-short'));
  /* Deliberately not daily: a short is homework somebody has to go and film,
     and a new one every day is a pile rather than a service. */
  ok('but never a second one, because the first still has to be filmed',
    !find(ws(), 'write-short'), keys(ws()).join(' '));
}

/* ── A project's brief narrows what it plans ──
 *
 * The bug this guards: a project that only wanted social posts was 'general',
 * and 'general' plans everything — a daily blog, a website, an email sequence
 * and a "no mailbox" error for a project that was never going to send mail. */
{
  const everything = ws({
    kind: 'general', canEmail: false,
    content: { ...ws().content!, newestBlogAt: hoursAgo(30), newestSocialAt: hoursAgo(30), socialUnpublished: 0, websites: 0, funnels: 0 },
  });
  const all = keys(everything);
  ok('without a brief, general still plans everything, as before',
    all.includes('no-sender') && all.some(k => k.startsWith('write-blog')) && all.includes('write-landing'), all.join(' '));

  const socialOnly = keys({ ...everything, focus: ['social'] });
  ok('a social-only brief plans social', socialOnly.some(k => k.startsWith('write-social')), socialOnly.join(' '));
  ok('and nothing that sends, not even the missing-mailbox warning',
    !socialOnly.includes('no-sender') && !socialOnly.some(k => /sequence|enrol|re-engage|ask-reviews/.test(k)), socialOnly.join(' '));
  ok('and no blog or website it never asked for',
    !socialOnly.some(k => k.startsWith('write-blog') || k === 'write-landing'), socialOnly.join(' '));

  const none = keys({ ...everything, focus: [] });
  ok('an empty focus leaves the planner out entirely — the workflows do the work', none.length === 0, none.join(' '));

  const emailOnly = keys({ ...everything, kind: 'leadgen', focus: ['email'] });
  ok('an email brief still warns that nothing can send', emailOnly.includes('no-sender'), emailOnly.join(' '));
  ok('every play names a channel', planNext({ ...everything, kind: 'general' }).every(a => a.channels.length > 0));
}

for (const line of out) console.log(line);
const failed = out.filter(l => l.startsWith('FAIL')).length;
console.log(`\n${out.length - failed}/${out.length} passed`);
process.exit(failed ? 1 : 0);
