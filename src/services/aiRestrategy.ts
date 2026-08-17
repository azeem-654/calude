/**
 * Rewriting the funnel when the figures say it is not working.
 *
 * The advice in aiRecommend.ts stops at "rewrite the subject lines". This is
 * the part that actually rewrites them — and the distance between those two
 * things is most of the work, because a rewrite that is not aimed at the right
 * failure is just churn with a progress bar.
 *
 * So the diagnosis comes first and it is narrow on purpose:
 *
 *   Nobody opened          → the subject and the sending pattern failed. The
 *                            bodies were never read, so changing them is
 *                            guesswork. Subjects are rewritten, the funnel is
 *                            shortened and spaced out.
 *   Opened, nobody replied → the subject worked. The ask failed. Bodies are
 *                            rewritten, subjects and timing left exactly alone.
 *   Bouncing               → not a writing problem at all. Refused, with the
 *                            reason, rather than rewriting perfectly good copy.
 *   Too few sends          → refused. Rewriting on nine sends is superstition.
 *
 * Two further rules. The revision is built from the steps that are live in
 * Marketing right now, never from the original plan, so a rewrite never
 * silently reverts an edit a person made there. And nothing is written until
 * someone presses Apply, on the steps as they stand after any edits — the
 * proposal is a draft in a form, not a change that has already happened.
 */
import { decisionsFor, logDecision } from './aiDecisionLog';
import { resyncEnrollments } from './contactEmail';
import { plural, singular } from './aiOrchestrator';
import { MIN_SENDS } from './aiRecommend';
import type { EmailSequence, EmailStep } from '../types/marketing';
import type { AICampaign } from '../types/aiSalesAgent';
import type { SequenceView } from './aiRollup';

/* ── Diagnosis ─────────────────────────────────────────────────────────── */

export type Problem =
  | 'no-sequence'
  | 'nobody-enrolled'
  | 'nothing-sent'
  | 'too-early'
  | 'bouncing'
  | 'not-opened'
  | 'opened-not-replied'
  | 'working';

export interface Diagnosis {
  problem: Problem;
  /** One line naming what is wrong. */
  headline: string;
  /** Why that is the reading, in a sentence or two. */
  detail: string;
  /** The figures it rests on, so it can be argued with. */
  evidence: string;
  /** Whether rewriting the messages is a sane response to this. */
  rewritable: boolean;
}

const pct = (n: number, of: number) => (of ? Math.round((n / of) * 100) : 0);

/**
 * What is wrong with one sequence, read from what it actually did.
 *
 * The order matters more than the thresholds. A bouncing list looks like a
 * low open rate — bounces never open — so bounces are ruled out before the
 * copy is ever blamed, or every rewrite would be aimed at the wrong thing.
 */
export function diagnose(view: SequenceView | null): Diagnosis {
  if (!view || view.status === 'missing') {
    return {
      problem: 'no-sequence',
      headline: 'There is no sequence to rewrite',
      detail: 'This campaign has not built an email sequence yet, or the one it built was deleted in Marketing.',
      evidence: 'No live sequence is linked to this campaign.',
      rewritable: false,
    };
  }

  if (!view.enrolled) {
    return {
      problem: 'nobody-enrolled',
      headline: 'Nobody is in the sequence',
      detail: 'The messages are not the problem — there is no one to send them to. Enrol the qualified prospects first.',
      evidence: `${view.enrolled} enrolled in “${view.name}”.`,
      rewritable: false,
    };
  }

  if (!view.sent) {
    return {
      problem: 'nothing-sent',
      headline: 'Nothing has gone out yet',
      detail: 'People are enrolled and the first message is still due. There is nothing to judge the wording against until it sends.',
      evidence: `${view.enrolled} enrolled, 0 sent.`,
      rewritable: false,
    };
  }

  if (view.sent < MIN_SENDS) {
    return {
      problem: 'too-early',
      headline: 'Too few sends to rewrite anything',
      detail: 'One unusual recipient still moves these rates by more than ten points. Rewriting on this much data is guessing, '
        + 'and it throws away the sample you would need to tell whether the rewrite helped.',
      evidence: `${view.sent} sent. Rates start being worth acting on at about ${MIN_SENDS}.`,
      rewritable: false,
    };
  }

  const openRate = pct(view.opened, view.sent);
  const replyRate = pct(view.replied, view.sent);
  const bounceRate = pct(view.bounced, view.sent);

  if (bounceRate >= 5) {
    return {
      problem: 'bouncing',
      headline: 'The list is the problem, not the writing',
      detail: 'A bounce rate this high suppresses opens on its own and damages the sending domain while it does it. '
        + 'Clean the addresses before touching a word of the copy — otherwise the rewrite gets judged on a broken list.',
      evidence: `${view.bounced} of ${view.sent} bounced (${bounceRate}%). Anything above about 5% is a deliverability problem.`,
      rewritable: false,
    };
  }

  if (openRate < 20) {
    return {
      problem: 'not-opened',
      headline: 'Almost nobody is opening',
      detail: 'The subject line and the sending pattern are failing. The bodies have not been read by enough people to be '
        + 'the cause, so rewriting them would be changing something nobody has seen.',
      evidence: `${view.opened} of ${view.sent} opened (${openRate}%). A cold sequence normally sits above 20%.`,
      rewritable: true,
    };
  }

  if (replyRate < 2) {
    return {
      problem: 'opened-not-replied',
      headline: 'They open it and then do nothing',
      detail: 'The subject is working — people are reading. The ask is what is failing. A shorter message with one specific '
        + 'question usually beats a longer pitch here, and the timing is not the issue.',
      evidence: `${openRate}% opened but only ${view.replied} of ${view.sent} replied (${replyRate}%).`,
      rewritable: true,
    };
  }

  return {
    problem: 'working',
    headline: 'This is working',
    detail: 'The figures are in the range a working cold sequence sits in. Rewriting now would cost you the only version '
      + 'you have evidence for.',
    evidence: `${openRate}% opened, ${replyRate}% replied, across ${view.sent} sends.`,
    rewritable: false,
  };
}

/* ── The rewrite ───────────────────────────────────────────────────────── */

export interface StepRevision {
  id: string;
  was: EmailStep;
  now: EmailStep;
  changed: ('subject' | 'body' | 'timing')[];
}

export interface Revision {
  sequenceId: string;
  sequenceName: string;
  diagnosis: Diagnosis;
  /** The proposed funnel in full — editable before anything is applied. */
  steps: EmailStep[];
  /** Old against new, per step that changed. */
  revisions: StepRevision[];
  /** Steps this revision drops, kept so the screen can show what goes. */
  removed: EmailStep[];
  /** Every decision the rewrite made, in words. */
  notes: string[];
  /** Which rewrite this is — a second one uses different wording, not the same again. */
  generation: number;
}

interface Voice {
  who: string;
  offer: string;
  location?: string;
  signOff: string;
}

/** How many times this campaign's funnel has already been rewritten. */
export function revisionCount(campaignId: string): number {
  return decisionsFor(campaignId).filter(d => d.kind === 'plan' && d.summary.startsWith('Funnel rewritten')).length;
}

function voiceFor(campaign: AICampaign, businessName?: string): Voice {
  const s = campaign.strategy;
  return {
    who: singular(s?.icp.industry) || 'business',
    offer: trimWords(s?.offer.what || 'what we do', 46),
    location: s?.icp.location?.trim() || undefined,
    /* Signed with the real business or not at all — a cold email ending on the
       word "us" reads like a template nobody filled in. */
    signOff: businessName?.trim() ? `\n\n${businessName.trim()}` : '',
  };
}

/** Cut on a word boundary; a subject line ending mid-word reads as a fault. */
function trimWords(text: string, max: number): string {
  const t = text.trim();
  if (t.length <= max) return t;
  const cut = t.slice(0, max);
  const boundary = cut.lastIndexOf(' ');
  return (boundary > max * 0.5 ? cut.slice(0, boundary) : cut).replace(/[,;:\s]+$/, '');
}

const cap = (s: string) => (s ? s[0].toUpperCase() + s.slice(1) : s);

/**
 * Three sets of subject lines, so a second rewrite is a different attempt
 * rather than the same one again. They cycle after that, and the note says so
 * rather than pretending the fourth is new.
 */
function subjectBank(generation: number, v: Voice): { opener: string; followUps: string[] } {
  switch (((generation - 1) % 3 + 3) % 3) {
    case 0:
      return {
        opener: '{{firstName}} — one question',
        followUps: ['Following up', 'Still worth asking?', 'Last one from me'],
      };
    case 1:
      return {
        opener: v.location ? `${cap(plural(v.who))} in ${v.location}` : 'A question about {{company}}',
        followUps: ['Re: {{company}}', 'Two minutes, {{firstName}}?', 'Closing this out'],
      };
    default:
      return {
        opener: `{{company}} — ${trimWords(v.offer, 34).toLowerCase()}`,
        followUps: ['Did this reach you?', 'One last idea', 'I will stop here'],
      };
  }
}

/**
 * Three sets of bodies for the case where people are reading and not replying.
 *
 * All three are shorter than what they replace and all three end in one
 * answerable question. None of them claims a result, because the CRM has no
 * results to claim and a fabricated case study is worse than a weak email.
 */
function bodyBank(generation: number, v: Voice): { opener: string; followUps: string[] } {
  const { who, offer, signOff } = v;
  switch (((generation - 1) % 3 + 3) % 3) {
    case 0:
      return {
        opener: `Hi {{firstName}},\n\nStraight to it: is {{company}} taking on new work at the moment?\n\n`
          + `If yes I will send one short example of ${offer}. If not, reply “not now” and I will close the file.${signOff}`,
        followUps: [
          `Hi {{firstName}},\n\nJust the one question from my last note: are you taking on new work?\n\nYes or no is enough.${signOff}`,
          `Hi {{firstName}},\n\nI will make this easy — reply with a day that suits and I will send a time. Ten minutes, no slides.\n\nIf that is not useful, say so and I will stop.${signOff}`,
          `Hi {{firstName}},\n\nLast one. If ${offer} is not on the list this quarter, tell me when to come back and I will diarise it.${signOff}`,
        ],
      };
    case 1:
      return {
        opener: `Hi {{firstName}},\n\nThe gap between an enquiry reaching ${plural(who)} like {{company}} and somebody answering it `
          + `is usually where the work goes. That gap is the part we handle.\n\nHow does it look at your end?${signOff}`,
        followUps: [
          `Hi {{firstName}},\n\nIf enquiries reach you by phone and get called back when someone has a minute, that is the `
            + `common answer — and the fixable one.\n\nShall I send what the fix looks like?${signOff}`,
          `Hi {{firstName}},\n\nWould it help if I sent this in writing rather than asking for a call? Say the word and I will.${signOff}`,
          `Hi {{firstName}},\n\nI will leave it here. If you would rather I came back later in the year, reply with a month and I will.${signOff}`,
        ],
      };
    default:
      return {
        opener: `Hi {{firstName}},\n\nIf ${offer} is not something {{company}} is looking at this quarter, reply “no” and you will `
          + `not hear from me again.\n\nIf it is, I will send one page on how it works for a ${who} your size.\n\nWhich one?${signOff}`,
        followUps: [
          `Hi {{firstName}},\n\nStill happy to take a “no” — it is a quicker reply than deleting these.\n\nOtherwise, shall I send the page?${signOff}`,
          `Hi {{firstName}},\n\nOne line is all I need: “send it” or “not for us”.${signOff}`,
          `Hi {{firstName}},\n\nTaking the silence as a no. If that is wrong, reply any time and I will pick it up.${signOff}`,
        ],
      };
  }
}

/** The gap the funnel is currently spaced on, read from the live steps. */
export function intervalOf(steps: EmailStep[], fallback = 3): number {
  const days = steps.map(s => Math.max(0, Math.round(Number(s.day) || 0))).sort((a, b) => a - b);
  for (let i = 1; i < days.length; i++) {
    const gap = days[i] - days[i - 1];
    if (gap > 0) return gap;
  }
  return fallback;
}

/** When almost nobody opens, sending more often is how a domain gets burned. */
const QUIET_INTERVAL_DAYS = 5;
const QUIET_MAX_STEPS = 3;

/**
 * The proposed funnel, built from the steps that are live in Marketing.
 *
 * Returns null when the diagnosis says rewriting is the wrong move — a caller
 * that shows the diagnosis and no proposal is doing the right thing, and a
 * caller that ignores the null and rewrites anyway cannot, because there is
 * nothing to rewrite with.
 */
export function reviseFunnel(
  campaign: AICampaign,
  sequence: EmailSequence,
  view: SequenceView,
  opts: { businessName?: string; generation?: number } = {},
): Revision | null {
  const diagnosis = diagnose(view);
  if (!diagnosis.rewritable) return null;
  if (!sequence.steps.length) return null;

  const generation = Math.max(1, Math.round(opts.generation ?? revisionCount(campaign.id) + 1));
  const v = voiceFor(campaign, opts.businessName);
  const notes: string[] = [];
  const live = sequence.steps;

  let proposed: EmailStep[];
  let removed: EmailStep[] = [];

  if (diagnosis.problem === 'not-opened') {
    const bank = subjectBank(generation, v);
    const kept = live.slice(0, QUIET_MAX_STEPS);
    removed = live.slice(QUIET_MAX_STEPS);
    const interval = intervalOf(live);
    const spacing = Math.max(interval, QUIET_INTERVAL_DAYS);

    proposed = kept.map((step, i) => ({
      ...step,
      subject: i === 0 ? bank.opener : bank.followUps[Math.min(i - 1, bank.followUps.length - 1)],
      /* Bodies untouched. Nobody read them, so there is no evidence they are
         wrong and no way to tell whether a change helped. */
      day: i === 0 ? Math.max(0, Math.round(Number(step.day) || 0)) : spacing * i,
      waitUnit: 'days',
    }));

    notes.push('Every subject line is replaced. That is the part that failed — a message nobody opened cannot have been rejected on its contents.');
    notes.push('The bodies are left exactly as they are, including any edits made in Marketing. Changing writing nobody has read would make the next set of figures unreadable too.');
    if (spacing !== interval) {
      notes.push(`Spacing widened from ${interval} to ${spacing} days between messages. On a list this quiet, sending more often mostly raises complaints, and complaints are what turn a low open rate into a blocked domain.`);
    }
    if (removed.length) {
      notes.push(`${removed.length} later ${removed.length === 1 ? 'message is' : 'messages are'} dropped, leaving ${proposed.length}. Chasing an audience that is not opening is where sender reputation goes.`);
    }
    if (generation > 3) {
      notes.push(`This is rewrite ${generation}, and the wording has cycled back to the first set. Three rewrites with no movement usually means the list or the sending domain, not the words.`);
    }
  } else {
    /* opened-not-replied */
    const bank = bodyBank(generation, v);
    proposed = live.map((step, i) => ({
      ...step,
      /* Subjects untouched: they are the half that is demonstrably working. */
      body: i === 0 ? bank.opener : bank.followUps[Math.min(i - 1, bank.followUps.length - 1)],
    }));

    notes.push('Every message is rewritten around a single question, and the funnel gets shorter overall. A long message that has been opened and ignored does not get answered by making it longer.');
    notes.push('The subject lines are left alone. They are the half of this that is demonstrably working, and changing both at once means the next set of figures cannot tell you which one moved.');
    notes.push('The timing is left alone too. People are opening on the current schedule, so the schedule is not what is stopping them replying.');
    if (generation > 3) {
      notes.push(`This is rewrite ${generation}, and the wording has cycled back to the first set. If three different asks have all gone unanswered, the offer or the audience is the thing to change, not the email.`);
    }
  }

  const revisions: StepRevision[] = [];
  for (let i = 0; i < proposed.length; i++) {
    const was = live[i];
    const now = proposed[i];
    const changed: StepRevision['changed'] = [];
    if (was.subject !== now.subject) changed.push('subject');
    if (was.body !== now.body) changed.push('body');
    if (was.day !== now.day || was.waitUnit !== now.waitUnit) changed.push('timing');
    if (changed.length) revisions.push({ id: now.id, was, now, changed });
  }

  if (!revisions.length && !removed.length) return null;

  return {
    sequenceId: sequence.id,
    sequenceName: sequence.name,
    diagnosis,
    steps: proposed,
    revisions,
    removed,
    notes,
    generation,
  };
}

/* ── Applying it ───────────────────────────────────────────────────────── */

export interface ApplyApi {
  sequences: EmailSequence[];
  updateSequence: (id: string, updates: Partial<EmailSequence>) => void;
}

export interface ApplyResult {
  ok: boolean;
  error?: string;
  /** What changed, in words, for the notification and the log. */
  changed: string[];
  /** Live enrolments whose step count was brought back in line. */
  enrolmentsRetimed: number;
  /** Enrolments already past the new last step, so finished rather than stalled. */
  enrolmentsCompleted: number;
}

/**
 * Write the revision to the real sequence in Marketing.
 *
 * `steps` is passed separately from the revision on purpose: the screen lets a
 * person edit every subject and body before applying, and what lands has to be
 * what is on their screen rather than what the agent first proposed.
 */
export function applyRevision(
  campaign: AICampaign,
  revision: Revision,
  steps: EmailStep[],
  api: ApplyApi,
): ApplyResult {
  const empty: ApplyResult = { ok: false, changed: [], enrolmentsRetimed: 0, enrolmentsCompleted: 0 };

  const seq = api.sequences.find(s => s.id === revision.sequenceId);
  if (!seq) {
    return { ...empty, error: `“${revision.sequenceName}” no longer exists in Marketing, so there is nothing to write to.` };
  }
  if (!steps.length) {
    return { ...empty, error: 'A sequence with no messages would never send. Keep at least one.' };
  }

  const blank = steps.findIndex(s => !s.subject.trim() || !s.body.trim());
  if (blank >= 0) {
    return { ...empty, error: `Message ${blank + 1} has an empty ${!steps[blank].subject.trim() ? 'subject' : 'body'}. Fill it in or remove the step.` };
  }

  const clean: EmailStep[] = steps.map(s => ({
    ...s,
    day: Math.max(0, Math.round(Number(s.day) || 0)),
    subject: s.subject.trim(),
    body: s.body.trim(),
  }));

  const changed: string[] = [];
  const subjects = clean.filter((s, i) => seq.steps[i] && seq.steps[i].subject !== s.subject).length;
  const bodies = clean.filter((s, i) => seq.steps[i] && seq.steps[i].body !== s.body).length;
  const timings = clean.filter((s, i) => seq.steps[i] && seq.steps[i].day !== s.day).length;
  if (subjects) changed.push(`${subjects} subject ${subjects === 1 ? 'line' : 'lines'} rewritten`);
  if (bodies) changed.push(`${bodies} ${bodies === 1 ? 'message' : 'messages'} rewritten`);
  if (timings) changed.push(`${timings} send ${timings === 1 ? 'day' : 'days'} moved`);
  if (clean.length < seq.steps.length) changed.push(`${seq.steps.length - clean.length} dropped`);
  if (clean.length > seq.steps.length) changed.push(`${clean.length - seq.steps.length} added`);

  if (!changed.length) {
    return { ...empty, error: 'Nothing in this differs from what is already live, so there is nothing to apply.' };
  }

  api.updateSequence(seq.id, { steps: clean });

  /* Everyone mid-flight is pointing at an index in an array that just changed
     length. Left alone, a shortened funnel strands them: no step to send, so
     they sit active for ever with a send date in the past. */
  const sync = resyncEnrollments({ ...seq, steps: clean });

  logDecision(campaign.id, {
    kind: 'plan',
    summary: `Funnel rewritten: ${changed.join(', ')}`,
    because: `${revision.diagnosis.headline}. ${revision.diagnosis.evidence} ${revision.notes[0] ?? ''}`.trim()
      + (sync.completed ? ` ${sync.completed} ${sync.completed === 1 ? 'person was' : 'people were'} already past the new last message and are marked finished rather than left waiting on a step that no longer exists.` : ''),
    link: { kind: 'sequence', id: seq.id, label: seq.name, route: '/marketing', at: new Date().toISOString() },
    counts: { steps: clean.length, rewritten: subjects + bodies, retimed: sync.retimed },
  });

  return { ok: true, changed, enrolmentsRetimed: sync.retimed, enrolmentsCompleted: sync.completed };
}
