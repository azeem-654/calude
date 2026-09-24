/**
 * From a sentence to a buildable project — the judgement behind the wizard.
 *
 * Pure on purpose, like `launchPlan.ts` and the server's planner: no fetch, no
 * storage, no React. Everything the wizard shows is a function of an
 * `IntakeState`, which is what makes it testable without a browser
 * (`test/projectIntake.test.mts`) and what lets an edit to the blueprint be a
 * change to that state followed by a re-derive, rather than a second
 * implementation of the blueprint that has to be kept in step with the first.
 *
 * ── The pipeline ──
 *
 *   matchSolutions   which catalogue entries the request is about
 *   extractKnown     what the request, the files and the workspace already say
 *   pendingQuestions what is still missing — and nothing that is not relevant
 *   buildBlueprint   the project, its workflows and everything the customer
 *                    signs up to, from the solutions and the answers
 *   parseEdit        "make it three a week" → a change to the answers
 *
 * The AI, when it is there, feeds the same pipeline: it proposes solution keys,
 * facts and extra questions, and every one is checked against the catalogue
 * before it is used. When it is not there, this still works — it matches words
 * rather than understanding them, and the screen says which it did.
 */
import {
  CUSTOM, GROUP_ORDER, QUESTIONS, REQUIREMENT_INFO, SOLUTIONS, cadenceOf, solutionByKey,
  type Answers, type Channel, type Contribution, type Question, type QuestionGroup,
  type RequirementId, type SetupStep, type WorkflowSpec,
} from './projectSolutions';
import type { Capability, ProjectKind } from './projects';
import type { LaunchStep } from './launchPlan';

/* ── Inputs ───────────────────────────────────────────────────────────────── */

export type AttachmentKind = 'image' | 'pdf' | 'sheet' | 'text' | 'other';

export interface Attachment {
  id: string;
  name: string;
  mime: string;
  size: number;
  kind: AttachmentKind;
  /** Images (downscaled) and PDFs, for the AI to look at and the build to use. */
  dataUrl?: string;
  /** CSV, TXT, MD — read in the browser. */
  text?: string;
}

export interface LinkRef {
  url: string;
  role: 'website' | 'reference';
}

/** Where a known answer came from — said on screen next to it. */
export type KnownSource = 'prompt' | 'profile' | 'file' | 'link' | 'ai' | 'you' | 'default';

export interface Known {
  value: string | string[];
  source: KnownSource;
  /** A short human line: "from your request", "from Pike Plumbing's profile". */
  note?: string;
}

export type KnownMap = Record<string, Known>;

/** The client portfolios and workspace profile the wizard can draw on. */
export interface WorkspaceFacts {
  portfolios: { id: string; name: string; website?: string; description?: string }[];
  /** The workspace's own onboarding profile, when it has a real one. */
  workspace?: { companyName: string; description: string; website: string } | null;
}

/** A question the AI wrote for a request the catalogue does not cover. */
export type ExtraQuestion = Question;

/**
 * A workflow the AI proposed for something the catalogue does not cover.
 *
 * Checked before it becomes a `WorkflowSpec`: an agent must name a source and
 * an output the engine has; anything else becomes an instruction the server's
 * own workflow writer turns into a contact workflow during the build.
 */
export interface CustomWorkflow {
  name: string;
  purpose: string;
  kind: 'agent' | 'contact';
  produces?: 'social' | 'blog' | 'email_campaign';
  source?: 'portfolio' | 'website' | 'web' | 'rss' | 'youtube';
  sourceUrl?: string;
  sourcePrompt?: string;
  cadence?: string;
  platform?: string;
  instruction?: string;
}

export interface IntakeState {
  prompt: string;
  solutionKeys: string[];
  strength: MatchStrength;
  known: KnownMap;
  extraQuestions: ExtraQuestion[];
  customWorkflows: CustomWorkflow[];
  /** Workflow keys the customer asked to take out. */
  removed: string[];
  name: string;
  objective: string;
  /** Things asked for that this product cannot do, said on the blueprint. */
  unsupported: string[];
  /** One line of what was understood, from the AI or from the match. */
  summary: string;
  understoodBy: 'ai' | 'keywords';
}

/* ── Matching ─────────────────────────────────────────────────────────────── */

export type MatchStrength = 'strong' | 'partial' | 'custom';

export interface MatchResult {
  keys: string[];
  strength: MatchStrength;
  scores: { key: string; score: number }[];
}

const norm = (s: string) => ` ${s.toLowerCase().replace(/[^a-z0-9#@+\-\s]/g, ' ').replace(/\s+/g, ' ')} `;

/** Whether a phrase occurs, on word boundaries — or as a stem, when it ends with one. */
function has(text: string, phrase: string): boolean {
  const p = phrase.toLowerCase();
  /* A keyword written as a stem ("reactivat") matches any ending. */
  if (/[a-z]$/.test(p) && !/[aeiouy]$/.test(p) && p.length >= 7 && !p.includes(' ')) {
    return text.includes(` ${p}`);
  }
  return text.includes(` ${p} `) || text.includes(` ${p}s `);
}

/**
 * Which solutions a request is about.
 *
 * A weighted phrase match. Deliberately simple: it is the fallback when the AI
 * is not there, and a fallback that is easy to reason about is worth more than
 * one that is occasionally cleverer. Two solutions are combined when the second
 * is close behind the first *and* brings a channel the first does not have —
 * "a blog and social posts" is content marketing, not a blog with a rider.
 */
export function matchSolutions(prompt: string, picked?: string): MatchResult {
  const text = norm(prompt);
  const scores = SOLUTIONS
    .filter(s => s.key !== CUSTOM)
    .map(s => ({ key: s.key, score: s.keywords.reduce((sum, [p, w]) => sum + (has(text, p) ? w : 0), 0) }))
    .filter(s => s.score > 0)
    .sort((a, b) => b.score - a.score);

  /* A picked card is the customer telling us, and it outranks a word match. */
  if (picked && picked !== CUSTOM && solutionByKey(picked)) {
    const second = scores.find(s => s.key !== picked);
    const keys = [picked];
    if (second && second.score >= 4 && bringsSomethingNew(picked, second.key)) keys.push(second.key);
    return { keys, strength: keys.length > 1 ? 'partial' : 'strong', scores };
  }

  const top = scores[0];
  if (!top || top.score < 2.5) return { keys: [CUSTOM], strength: 'custom', scores };
  const keys = [top.key];
  const second = scores[1];
  if (second && second.score >= Math.max(3, top.score * 0.6) && bringsSomethingNew(top.key, second.key)) {
    keys.push(second.key);
  }
  return { keys, strength: keys.length > 1 || top.score < 4 ? 'partial' : 'strong', scores };
}

function bringsSomethingNew(a: string, b: string): boolean {
  const sa = solutionByKey(a);
  const sb = solutionByKey(b);
  if (!sa || !sb) return false;
  return sb.channels.some(c => !sa.channels.includes(c));
}

/* ── What is already known ────────────────────────────────────────────────── */

const WORD_NUM: Record<string, number> = { one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9, ten: 10 };

const numberIn = (raw: string): number => Number(raw.replace(/,/g, '')) || WORD_NUM[raw.toLowerCase()] || 0;

const URL_RE = /\bhttps?:\/\/[^\s<>"')]+|\b(?:www\.)[a-z0-9-]+(?:\.[a-z0-9-]+)+[^\s<>"')]*/gi;

export function urlsIn(text: string): string[] {
  return [...new Set((text.match(URL_RE) ?? []).map(u => (u.startsWith('http') ? u : `https://${u}`).replace(/[.,;]+$/, '')))];
}

/** "every day", "weekdays", "three times a week" → a schedule answer. */
export function frequencyIn(text: string): string | null {
  const t = text.toLowerCase();
  if (/\b(weekdays?|every working day|monday to friday|mon-fri)\b/.test(t)) return 'weekdays';
  /* "three times a week", "3 posts per week", "three articles each week". */
  const per = '\\s+(?:[a-z]+\\s+){0,2}(?:a|per|each|every)\\s+week\\b';
  if (new RegExp(`\\b(3|three)${per}`).test(t)) return '3-week';
  if (new RegExp(`\\b(2|two)${per}`).test(t) || /\btwice (a|per|each) week\b/.test(t)) return '2-week';
  const day = /\bevery (monday|tuesday|wednesday|thursday|friday|saturday|sunday)\b/.exec(t);
  if (day) return day[1].slice(0, 3);
  if (/\b(every ?day|daily|each day|once a day|per day|a day)\b/.test(t) && !/\bemails? a day\b|\bpeople a day\b/.test(t)) return 'daily';
  if (/\b(weekly|every week|once a week|each week|per week|a week)\b/.test(t)) return 'weekly';
  if (/\b(monthly|every month|once a month|each month)\b/.test(t)) return 'monthly';
  return null;
}

const bucket = (n: number, edges: [number, string][], top: string): string => {
  for (const [max, label] of edges) if (n <= max) return label;
  return top;
};

/** Words that end a phrase pulled out of a sentence: "Amazon sellers and book…". */
const STOP = /\s+(?:and|who|that|to|with|in|on|for|then|so|about|every|each|by)\b.*$/i;

/**
 * Who the request is aimed at, when it says.
 *
 * Only the two shapes that are reliable — "to <people>" after a send verb, and
 * "find <people>" — and never more than six words. A wrong guess here would be
 * written into every email, so a miss (and the question being asked) is the
 * better failure.
 */
export function audienceIn(text: string): string | null {
  const patterns = [
    /\b(?:send|email|write|reach out|reach)\b[^.]*?\bto\s+([a-z][a-z0-9&' -]{2,60})/i,
    /\bfind\s+(?:me\s+|new\s+)?([a-z][a-z0-9&' -]{2,60})/i,
    /\btarget(?:ing)?\s+([a-z][a-z0-9&' -]{2,60})/i,
  ];
  for (const re of patterns) {
    const m = re.exec(text);
    if (!m) continue;
    const phrase = m[1].replace(STOP, '').trim().replace(/^(the|some|more|them)\s+/i, '');
    const words = phrase.split(/\s+/);
    if (!phrase || words.length > 6 || /^(them|it|us|me|people|customers|clients|out)$/i.test(phrase)) continue;
    if (/^(a|an|one|five|three|seven|\d)\b/i.test(phrase)) continue;
    return phrase;
  }
  return null;
}

/**
 * Everything the request, its attachments and the workspace already answer.
 *
 * Each entry carries where it came from, so the screen can say "from your
 * request" beside it and the customer can see why a question was not asked.
 * Only questions some matched solution actually asks are filled — a platform
 * mentioned in an e-commerce request is not a fact about anything.
 */
export function extractKnown(
  prompt: string, solutionKeys: string[], ws: WorkspaceFacts,
  files: Attachment[] = [], links: LinkRef[] = [],
): KnownMap {
  const asked = new Set(solutionKeys.flatMap(k => solutionByKey(k)?.questions ?? []));
  const out: KnownMap = {};
  const put = (id: string, value: string | string[], source: KnownSource, note: string) => {
    if (asked.has(id) && !out[id]) out[id] = { value, source, note };
  };
  const t = prompt.toLowerCase();
  const fromYou = 'from your request';

  /* ── The business ── */
  const site = links.find(l => l.role === 'website')?.url ?? urlsIn(prompt)[0] ?? '';
  const docs = files.filter(f => f.kind === 'pdf' || f.kind === 'text');
  if (ws.portfolios.length === 1 && !site) {
    const p = ws.portfolios[0];
    put('business', `existing:${p.id}`, 'profile', `using ${p.name}, already in Protected Central`);
  } else if (site) {
    const match = ws.portfolios.find(p => p.website && site.includes(p.website.replace(/^https?:\/\/(www\.)?/, '').replace(/\/$/, '')));
    if (match) put('business', `existing:${match.id}`, 'profile', `${match.name} — its website matches`);
    else {
      put('business', 'website', links.some(l => l.role === 'website') ? 'link' : 'prompt', 'read from the website you gave');
      put('website', site, links.some(l => l.role === 'website') ? 'link' : 'prompt', 'the website you gave');
    }
  } else if (docs.length) {
    put('business', 'upload', 'file', `read from ${docs[0].name}`);
  } else if (!ws.portfolios.length && ws.workspace?.companyName && ws.workspace.description) {
    put('business', 'workspace', 'profile', `your ${ws.workspace.companyName} profile`);
  }

  /* ── Schedule ── */
  const freq = frequencyIn(prompt);
  if (freq) {
    /* Given to whichever schedule question the matched solutions ask first —
       for a blog-and-posts project the article cadence is the one somebody
       names in a sentence. */
    const firstSchedule = solutionKeys.flatMap(k => solutionByKey(k)?.questions ?? [])
      .find(id => id === 'frequency' || id === 'blogFrequency');
    if (firstSchedule === 'blogFrequency') {
      if (['daily', 'weekly', 'monthly', '2-week'].includes(freq)) put('blogFrequency', freq, 'prompt', fromYou);
      else if (/^(mon|tue|wed|thu|fri|sat|sun)$/.test(freq)) put('blogFrequency', freq, 'prompt', fromYou);
    } else if (firstSchedule) {
      put('frequency', freq, 'prompt', fromYou);
    }
  }

  /* ── Social ── */
  const platforms = [
    /\binstagram|\binsta\b/.test(t) ? 'instagram' : '',
    /\bfacebook|\bfb\b/.test(t) ? 'facebook' : '',
    /\blinkedin/.test(t) ? 'linkedin' : '',
    /\btwitter|\bx \(twitter\)|\bon x\b/.test(t) ? 'twitter' : '',
  ].filter(Boolean);
  if (platforms.length) put('platforms', platforms, 'prompt', fromYou);
  const versions = /\b(two|2|three|3)\s+(image\s+)?(versions|variations|options)\b/.exec(t);
  if (versions) put('postsPerRun', String(numberIn(versions[1])), 'prompt', fromYou);
  if (/\bimage posts?\b|\bgraphics?\b|\bvisual/.test(t)) {
    put('socialOutputs', ['image', 'caption', 'hashtags', ...(platforms.length > 1 ? ['variants'] : [])], 'prompt', 'image posts, as you asked');
  }
  const images = files.filter(f => f.kind === 'image');
  if (images.length && !solutionKeys.includes('ecommerce-store')) {
    put('inspiration', 'attached', 'file', `${images.length} example${images.length === 1 ? '' : 's'} attached`);
  }
  if (/\b(approve|approval|review (it|them|each|first)|check (it|them) first)\b/.test(t)) put('approval', 'review', 'prompt', fromYou);
  if (/\bready to (publish|post)\b/.test(t)) put('approval', 'ready', 'prompt', fromYou);

  /* ── Blog ── */
  if (/\bfrom (my|our) (company )?(website|site)\b/.test(t)) put('blogSource', 'portfolio', 'prompt', 'written from your website');
  if (/\b(research|news|trending|latest)\b/.test(t)) put('blogSource', 'web', 'prompt', 'fresh research, from your request');
  if (/\byoutube\b/.test(t) && asked.has('blogSource')) put('blogSource', 'youtube', 'prompt', fromYou);
  const channelId = /\bUC[\w-]{22}\b/.exec(prompt)?.[0];
  if (channelId) { put('channelId', channelId, 'prompt', fromYou); put('sourceUrl', channelId, 'prompt', fromYou); }
  if (/\byoutube\b|\bmy videos\b/.test(t)) put('videoSource', 'youtube', 'prompt', fromYou);
  if (/\bscripts?\b/.test(t)) put('videoSource', 'scripts', 'prompt', fromYou);

  /* ── Catalogue ── */
  const sheets = files.filter(f => f.kind === 'sheet');
  const productN = /\b(\d[\d,]*|one|two|three|four|five|six|seven|eight|nine|ten)\s+(?:different\s+)?(products|items|skus|lines)\b/.exec(t);
  if (productN) {
    const n = numberIn(productN[1]);
    put('productCount', bucket(n, [[10, '1-10'], [50, '11-50'], [100, '51-100']], '100+'), 'prompt', `about ${n}, from your request`);
  }
  if (sheets.length) {
    put('productSource', 'upload', 'file', `from ${sheets[0].name}`);
    put('contactSource', 'upload', 'file', `from ${sheets[0].name}`);
  } else if (docs.some(d => d.kind === 'pdf')) {
    put('productSource', 'catalogue', 'file', `from ${docs[0].name}`);
  }
  const fields: string[] = [];
  if (/\bimages?|photos?|pictures?\b/.test(t)) fields.push('images');
  if (/\bprices?|pricing\b/.test(t)) fields.push('price');
  if (/\bdescriptions?\b/.test(t)) fields.push('description');
  if (/\bskus?\b/.test(t)) fields.push('sku');
  if (/\bcategor(y|ies)\b/.test(t)) fields.push('category');
  if (fields.length && productN) put('productFields', ['title', ...fields], 'prompt', fromYou);
  const style = /\b(minimal|premium|fashion|luxury|colou?rful)\b/.exec(t)?.[1];
  if (style) put('storeDesign', style.replace('colorful', 'colourful'), 'prompt', fromYou);

  /* ── Contacts and offer ── */
  const peopleN = /\b(\d[\d,]*)\s+(?:previous |past |old |existing |former )?(customers|contacts|clients|subscribers|people|leads|patients|members)\b/.exec(t);
  if (peopleN) {
    const n = numberIn(peopleN[1]);
    put('contactCount', bucket(n, [[499, '<500'], [2000, '500-2000'], [10000, '2000-10000']], '10000+'), 'prompt', `${n.toLocaleString()}, from your request`);
  }
  if (/\b(find|search for|discover|source)\b/.test(t) && asked.has('contactSource')) put('contactSource', 'find', 'prompt', 'find new ones, from your request');
  const who = audienceIn(prompt);
  if (who) put('audience', who, 'prompt', fromYou);
  const len = /\b(3|three|5|five|7|seven)[- ](?:step |part )?emails?\b/.exec(t);
  if (len) put('sequenceLength', String(numberIn(len[1])), 'prompt', fromYou);
  if (/\b(book|booking|meeting|call|calls|appointment)s?\b/.test(t)) put('emailGoal', 'booking', 'prompt', fromYou);
  if (/\b(reactivat|win back|re-?engage|come back)/.test(t)) put('emailGoal', 'reactivation', 'prompt', fromYou);
  if (/\brenew/.test(t)) put('emailGoal', 'renewal', 'prompt', fromYou);

  /* ── Appointments ── */
  const focus: string[] = [];
  if (/\b(miss|missed|no-?shows?|rebook)/.test(t)) focus.push('noshow');
  if (/\bremind/.test(t)) focus.push('reminders');
  if (/\b(enquir|inquir|new leads?)/.test(t)) focus.push('enquiries');
  if (focus.length) put('apptFocus', focus, 'prompt', fromYou);
  if (/\bgoogle calendar\b/.test(t)) put('calendar', 'google', 'prompt', fromYou);
  if (/\b(text|sms)\b/.test(t)) put('apptChannels', ['email', 'sms'], 'prompt', fromYou);

  /* ── Reviews, support, onboarding ── */
  const rp = /\b(google|facebook|trustpilot)\s+reviews?\b/.exec(t)?.[1];
  if (rp) put('reviewPlatform', rp, 'prompt', fromYou);

  /* ── Something different ── */
  const custom: string[] = [];
  if (/\bpost/.test(t)) custom.push('social');
  if (/\b(article|blog)/.test(t)) custom.push('blog');
  if (/\bemails?\b/.test(t)) custom.push('email');
  if (/\b(task|remind|to-?do)/.test(t)) custom.push('tasks');
  if (/\b(page|landing)\b/.test(t)) custom.push('page');
  if (custom.length) put('customOutput', custom, 'prompt', fromYou);

  return out;
}

/* ── Saying an answer back ─────────────────────────────────────────────────── */

const SPECIAL: Record<string, Record<string, string>> = {
  business: { website: 'Read from your website', upload: 'From your company document', manual: 'Typed in by you', workspace: 'Your account profile' },
  inspiration: { ai: 'Let AI decide', attached: 'Your examples, attached', link: 'A link you gave' },
  productCount: { detect: 'Worked out from your products' },
};

/**
 * An answer, in the words the customer would use — never the stored value.
 * "website" and "ai" are codes; nobody should read them on a screen.
 */
export function describeAnswer(q: Question, value: string | string[], portfolios: { id: string; name: string }[] = []): string {
  const vals = Array.isArray(value) ? value : [value];
  return vals.filter(v => String(v).trim()).map(v => {
    if (v.startsWith('existing:')) return portfolios.find(p => p.id === v.slice(9))?.name ?? 'Your business profile';
    return SPECIAL[q.id]?.[v] ?? q.options?.find(o => o.value === v)?.label ?? v;
  }).join(', ');
}

/* ── Which questions are still open ───────────────────────────────────────── */

const answered = (k: Known | undefined) =>
  !!k && (Array.isArray(k.value) ? k.value.length > 0 : String(k.value).trim() !== '');

export function answersOf(known: KnownMap): Answers {
  const out: Answers = {};
  for (const [id, k] of Object.entries(known)) out[id] = k.value;
  return out;
}

/** Every question the state's solutions ask, in bank order, deduplicated. */
export function allQuestions(state: Pick<IntakeState, 'solutionKeys' | 'extraQuestions'>): Question[] {
  const ids = [...new Set(state.solutionKeys.flatMap(k => solutionByKey(k)?.questions ?? []))];
  const qs = ids.map(id => QUESTIONS[id]).filter((q): q is Question => !!q);
  return [...qs, ...state.extraQuestions.filter(x => !QUESTIONS[x.id])];
}

/** Whether a question applies, given the answers so far. */
export function applies(q: Question, known: KnownMap): boolean {
  if (!q.showIf) return true;
  const v = known[q.showIf.id]?.value;
  const vals = Array.isArray(v) ? v : v ? [v] : [];
  return vals.some(x => q.showIf!.in.includes(x));
}

/**
 * The questions still worth asking.
 *
 * Anything already known is left out — the screen shows those separately as
 * "what I already know", each changeable — and anything whose condition does
 * not hold is left out entirely. Sending questions are never here for a
 * project with no sending solution, because no such solution lists them.
 */
export function pendingQuestions(state: IntakeState): Question[] {
  return allQuestions(state).filter(q => applies(q, state.known) && !answered(state.known[q.id]));
}

export interface Screen {
  group: QuestionGroup;
  questions: Question[];
}

/**
 * The open questions as screens: one topic each, three at most.
 *
 * Required questions lead their screen; an optional one that shares a topic
 * rides along rather than earning a screen of its own. A screen of nothing but
 * optional questions is still shown — it is skippable in one press.
 */
export function screensOf(questions: Question[]): Screen[] {
  const byGroup = new Map<QuestionGroup, Question[]>();
  for (const q of questions) byGroup.set(q.group, [...(byGroup.get(q.group) ?? []), q]);
  const out: Screen[] = [];
  for (const g of GROUP_ORDER) {
    const qs = (byGroup.get(g) ?? []).sort((a, b) => (a.need === b.need ? 0 : a.need === 'required' ? -1 : 1));
    for (let i = 0; i < qs.length; i += 3) out.push({ group: g, questions: qs.slice(i, i + 3) });
  }
  return out;
}

/** What "Let AI decide" resolves to, for a question that offers it. */
export function aiChoice(q: Question): string | string[] | null {
  if (q.aiDecides === undefined) return null;
  return q.aiDecides;
}

/**
 * Fill every unanswered question that has a safe default.
 *
 * Run when the customer presses "build it" with optional questions left open,
 * so the blueprint says what it chose rather than leaving a hole — and marks
 * each one `default` so it reads "chosen for you".
 */
export function withDefaults(state: IntakeState): IntakeState {
  const known = { ...state.known };
  for (const q of allQuestions(state)) {
    if (!applies(q, known) || answered(known[q.id])) continue;
    const d = aiChoice(q);
    if (d !== null && d !== 'detect') known[q.id] = { value: d, source: 'default', note: 'chosen for you' };
  }
  return { ...state, known };
}

/* ── The blueprint ────────────────────────────────────────────────────────── */

export interface Blueprint {
  name: string;
  objective: string;
  solutionKeys: string[];
  strength: MatchStrength;
  channels: Channel[];
  inputs: string[];
  outputs: string[];
  workflows: WorkflowSpec[];
  agents: { name: string; role: string; workflow: string }[];
  schedules: string[];
  setup: SetupStep[];
  approvals: string[];
  manual: string[];
  destinations: { label: string; route: string }[];
  requirements: RequirementId[];
  limits: string[];
  /** Answers that were chosen for the customer, named on the blueprint. */
  decided: { question: string; answer: string }[];
  plannerChannels: Channel[];
}

export interface BlueprintContext {
  companyName: string;
  website: string;
  files: Attachment[];
  links: LinkRef[];
}

const PLANNER: Channel[] = ['email', 'sms', 'social', 'blog', 'site', 'video', 'book', 'shop', 'sales', 'reviews', 'contacts'];

const PLANNER_WORDS: Record<string, string> = {
  email: 'emails', sms: 'texts', site: 'pages', book: 'bookings', shop: 'the shop', sales: 'deals',
  reviews: 'reviews', contacts: 'new leads', blog: 'articles', social: 'posts', video: 'scripts',
};

const NAME_SUFFIX: Record<string, string> = {
  'social-growth': 'Content Engine',
  'lead-generation': 'Lead Engine',
  'email-outreach': 'Outreach Campaign',
  'content-marketing': 'Content Marketing',
  'blog-seo': 'SEO Blog',
  'ecommerce-store': 'Online Store',
  'customer-support': 'Customer Support',
  'sales-followup': 'Sales Follow-up',
  'appointment-booking': 'Appointment Autopilot',
  'client-onboarding': 'Client Onboarding',
  'customer-reactivation': 'Customer Reactivation',
  reputation: 'Reputation Builder',
  'real-estate': 'Property Leads',
  'agency-operations': 'Agency Operations',
  recruitment: 'Recruitment Pipeline',
  'product-marketing': 'Product Launch',
  'video-content': 'Video Content',
  'local-business': 'Local Growth',
  custom: 'Autopilot Project',
};

export function defaultName(keys: string[], company: string, known: KnownMap): string {
  const first = keys[0] ?? CUSTOM;
  let suffix = NAME_SUFFIX[first] ?? 'Autopilot Project';
  if (first === 'social-growth') {
    const f = String(known.frequency?.value ?? '');
    suffix = f === 'daily' ? 'Daily Content Engine' : f === 'weekdays' ? 'Weekday Content Engine' : 'Content Engine';
  }
  return company ? `${company} ${suffix}` : suffix;
}

const tidy = (s: string) => {
  const t = s.trim().replace(/\s+/g, ' ');
  return t ? t[0].toUpperCase() + t.slice(1) : '';
};

/** A workflow the AI proposed, as something the engine will run — or null. */
export function customToSpec(w: CustomWorkflow, i: number): WorkflowSpec | null {
  const name = tidy(w.name).slice(0, 80) || `Custom Automation ${i + 1}`;
  if (w.kind === 'agent') {
    const produces = w.produces && ['social', 'blog', 'email_campaign'].includes(w.produces) ? w.produces : null;
    const source = w.source && ['portfolio', 'website', 'web', 'rss', 'youtube'].includes(w.source) ? w.source : 'portfolio';
    if (!produces) return null;
    if ((source === 'website' || source === 'rss' || source === 'youtube') && !String(w.sourceUrl ?? '').trim()) return null;
    const cad = cadenceOf(w.cadence ?? 'weekly');
    const config: Record<string, string> = { source, produces };
    if (w.sourceUrl) config.sourceUrl = w.sourceUrl.slice(0, 300);
    if (source === 'web') config.sourcePrompt = (w.sourcePrompt || w.purpose).slice(0, 300);
    if (produces === 'social') { config.platform = ['instagram', 'facebook', 'linkedin', 'twitter'].includes(w.platform ?? '') ? w.platform! : 'instagram'; config.count = '1'; config.handoff = 'review'; }
    const nodes = [
      { id: 'n0', type: 'trigger', label: cad.words, config: { event: 'schedule', cadence: cad.cadence, ...(cad.days ? { days: cad.days } : {}) }, nextId: 'n1' },
      { id: 'n1', type: 'ai', label: name, config, nextId: null },
    ];
    const where = { social: ['Social posts', '/social-creator'], blog: ['Blog drafts', '/blog-automation'], email_campaign: ['Email campaign', '/marketing?tab=sequences'] }[produces];
    return {
      key: `custom-${i}`, name, purpose: tidy(w.purpose).slice(0, 240), origin: 'generated', nodes,
      schedule: cad.words,
      agents: [{ name: produces === 'social' ? 'Creative Agent' : produces === 'blog' ? 'Writer Agent' : 'Email Copy Agent', role: tidy(w.purpose).slice(0, 200) }],
      output: { label: where[0], route: where[1] },
      sends: false, channel: produces === 'social' ? 'social' : produces === 'blog' ? 'blog' : 'email',
    };
  }
  const instruction = String(w.instruction || w.purpose).trim();
  if (instruction.length < 8) return null;
  return {
    key: `custom-${i}`, name, purpose: tidy(w.purpose).slice(0, 240), origin: 'ai',
    instruction: instruction.slice(0, 950),
    schedule: 'When a contact reaches it', agents: [], sends: /\b(email|text|sms|message)\b/i.test(instruction),
    channel: /\b(email|message)\b/i.test(instruction) ? 'email' : 'tasks',
  };
}

function labelOf(q: Question, v: string | string[]): string {
  const vals = Array.isArray(v) ? v : [v];
  return vals.map(x => q.options?.find(o => o.value === x)?.label ?? x).join(', ');
}

/**
 * The blueprint, from the state.
 *
 * Each solution builds its contribution from the answers; the contributions are
 * merged, de-duplicated by name, and anything the customer removed is taken
 * out. Nothing here is decided twice: the same answers always give the same
 * blueprint, which is what lets "make it three a week" be an edit to one answer.
 */
export function buildBlueprint(state: IntakeState, ctx: BlueprintContext): Blueprint {
  const full = withDefaults(state);
  const a = answersOf(full.known);
  let c: Contribution = {
    workflows: [], setup: [], outputs: [], destinations: [], approvals: [], manual: [],
    planner: [], requirements: [], limits: [],
  };
  for (const key of full.solutionKeys) {
    const s = solutionByKey(key);
    if (!s) continue;
    const part = s.build(a, { companyName: ctx.companyName, website: ctx.website });
    c = {
      workflows: [...c.workflows, ...part.workflows],
      setup: [...c.setup, ...part.setup],
      outputs: [...c.outputs, ...part.outputs],
      destinations: [...c.destinations, ...part.destinations],
      approvals: [...c.approvals, ...part.approvals],
      manual: [...c.manual, ...part.manual],
      planner: [...c.planner, ...part.planner],
      requirements: [...c.requirements, ...part.requirements],
      limits: [...c.limits, ...part.limits],
    };
  }
  full.customWorkflows.forEach((w, i) => {
    const spec = customToSpec(w, i);
    if (spec) c.workflows.push(spec);
  });

  const uniq = <T,>(xs: T[], key: (x: T) => string = x => String(x)) => {
    const seen = new Set<string>();
    return xs.filter(x => { const k = key(x); if (!k || seen.has(k)) return false; seen.add(k); return true; });
  };

  const workflows = uniq(c.workflows, w => w.name).filter(w => !full.removed.includes(w.key));
  const agents = workflows.flatMap(w => w.agents.map(ag => ({ ...ag, workflow: w.name })));
  const plannerChannels = uniq(c.planner).filter(ch => PLANNER.includes(ch));
  if (plannerChannels.length) {
    agents.push({
      name: 'Autopilot Planner',
      role: `Looks at the project every day and decides what to do next — ${plannerChannels.map(ch => (PLANNER_WORDS[ch] ?? ch)).join(', ')}.`,
      workflow: 'The whole project',
    });
  }

  const business = String(a.business ?? '');
  const inputs = uniq([
    business.startsWith('existing:') ? `${ctx.companyName || 'The business'} profile, already in Protected Central` : '',
    business === 'workspace' ? `Your ${ctx.companyName || 'business'} profile` : '',
    business === 'website' && ctx.website ? `Your website — ${ctx.website.replace(/^https?:\/\//, '')}` : '',
    ...ctx.files.map(f => `${f.kind === 'image' ? 'Image' : f.kind === 'sheet' ? 'Spreadsheet' : f.kind === 'pdf' ? 'Document' : 'File'}: ${f.name}`),
    ...ctx.links.filter(l => l.role === 'reference').map(l => `Reference: ${l.url.replace(/^https?:\/\//, '')}`),
    business === 'manual' ? 'What you typed about the business' : '',
  ]);

  const decided = allQuestions(full)
    .filter(q => full.known[q.id]?.source === 'default')
    .map(q => ({ question: q.prompt, answer: labelOf(q, full.known[q.id].value) }));

  const channels = uniq([...full.solutionKeys.flatMap(k => solutionByKey(k)?.channels ?? []), ...workflows.map(w => w.channel)]);

  return {
    name: full.name.trim() || defaultName(full.solutionKeys, ctx.companyName, full.known),
    objective: full.objective.trim() || tidy(full.prompt).slice(0, 400),
    solutionKeys: full.solutionKeys,
    strength: full.strength,
    channels,
    inputs,
    outputs: uniq(c.outputs),
    workflows,
    agents,
    schedules: uniq(workflows.filter(w => w.schedule).map(w => `${w.name}: ${w.schedule}`)),
    setup: uniq(c.setup, s => s.label),
    approvals: uniq(c.approvals),
    manual: uniq([...c.manual, ...full.unsupported.map(u => `${tidy(u)} — not something Autopilot can do yet, so it stays with you`)]),
    destinations: uniq(c.destinations, d => d.label),
    requirements: uniq(['ai', 'profile', ...c.requirements] as RequirementId[]).filter(r => REQUIREMENT_INFO[r]),
    limits: uniq(c.limits),
    decided,
    plannerChannels,
  };
}

/* ── What the server is told ──────────────────────────────────────────────── */

/**
 * The permissions a blueprint adds up to — in the same vocabulary the old
 * wizard used, so `guardrailsFor` is the one place that turns them into
 * switches and "unpicked means off" still holds.
 */
export function capsOf(bp: Blueprint): Capability[] {
  const ch = new Set(bp.channels);
  const out = new Set<Capability>();
  if (ch.has('social') || ch.has('blog') || ch.has('site') || ch.has('video')) out.add('content');
  if (ch.has('email') || ch.has('reviews') || ch.has('support') || ch.has('tasks') || ch.has('sales')) out.add('email');
  if (bp.workflows.some(w => w.nodes?.some(n => n.type === 'send_sms'))) out.add('sms');
  if (ch.has('book')) out.add('book');
  if (ch.has('shop')) out.add('shop');
  if (bp.plannerChannels.includes('contacts')) out.add('find');
  /* Content-only projects still need to be able to write their workflows. */
  if (!out.size) out.add('content');
  return [...out];
}

export function kindOf(bp: Blueprint): ProjectKind {
  const shop = bp.channels.includes('shop');
  const reach = bp.plannerChannels.some(c => c === 'email' || c === 'contacts');
  if (shop && reach) return 'general';
  if (shop) return 'ecommerce';
  if (reach) return 'leadgen';
  return 'general';
}

/** The setup steps with somewhere to go, as the project's first checklist. */
export function launchStepsOf(bp: Blueprint): LaunchStep[] {
  return bp.setup.slice(0, 12).map(s => ({
    label: s.label.slice(0, 120),
    why: s.by === 'autopilot' ? 'Done by Autopilot while it builds the project.' : 'Yours to do — the link goes straight there.',
    route: s.route ?? '',
  }));
}

/**
 * The blueprint as it is stored on the project.
 *
 * Without node graphs — those are saved as the workflows themselves — and with
 * `plannerChannels`, the one field the server acts on.
 */
export function briefOf(bp: Blueprint, prompt: string): Record<string, unknown> {
  return {
    version: 1,
    prompt: prompt.slice(0, 2000),
    solutionKeys: bp.solutionKeys,
    strength: bp.strength,
    channels: bp.channels,
    plannerChannels: bp.plannerChannels,
    inputs: bp.inputs,
    outputs: bp.outputs,
    workflows: bp.workflows.map(w => ({ name: w.name, purpose: w.purpose, schedule: w.schedule, output: w.output ?? null, sends: w.sends })),
    agents: bp.agents,
    approvals: bp.approvals,
    manual: bp.manual,
    destinations: bp.destinations,
    requirements: bp.requirements,
    limits: bp.limits,
    decided: bp.decided,
    createdWith: 'wizard-v2',
  };
}

/* ── Editing the blueprint ────────────────────────────────────────────────── */

/**
 * A change to the state, in the vocabulary both the AI and `parseEdit` speak.
 *
 * Answers, solutions, removals, the name and the objective — nothing else. An
 * edit that could write arbitrary workflows would be an edit that could write
 * one the engine cannot run.
 */
export interface EditOps {
  set?: Record<string, string | string[]>;
  addSolutions?: string[];
  removeSolutions?: string[];
  removeWorkflows?: string[];
  name?: string;
  objective?: string;
}

/** Only values a question actually offers survive. */
export function validValue(q: Question, v: unknown): string | string[] | null {
  if (q.type === 'text' || q.type === 'number') {
    const s = String(Array.isArray(v) ? v.join(', ') : v ?? '').trim().slice(0, 400);
    return s || null;
  }
  const allowed = new Set((q.options ?? []).map(o => o.value));
  if (q.type === 'multi') {
    const list = (Array.isArray(v) ? v : [v]).map(String).filter(x => allowed.has(x));
    return list.length ? [...new Set(list)] : null;
  }
  if (q.type === 'single') {
    const s = String(Array.isArray(v) ? v[0] : v ?? '');
    /* A single named day is a valid schedule even though it is not a button. */
    if ((q.id === 'frequency' || q.id === 'blogFrequency') && /^(mon|tue|wed|thu|fri|sat|sun)$/.test(s)) return s;
    return allowed.has(s) ? s : null;
  }
  return null;
}

export function applyOps(state: IntakeState, ops: EditOps): IntakeState {
  let keys = [...state.solutionKeys];
  for (const k of ops.addSolutions ?? []) if (solutionByKey(k) && !keys.includes(k)) keys.push(k);
  for (const k of ops.removeSolutions ?? []) keys = keys.filter(x => x !== k);
  if (!keys.length) keys = [CUSTOM];
  if (keys.length > 1) keys = keys.filter(k => k !== CUSTOM);
  const known = { ...state.known };
  for (const [id, v] of Object.entries(ops.set ?? {})) {
    const q = QUESTIONS[id] ?? state.extraQuestions.find(x => x.id === id);
    if (!q) continue;
    const clean = validValue(q, v);
    if (clean !== null) known[id] = { value: clean, source: 'you', note: 'you changed this' };
  }
  return {
    ...state,
    solutionKeys: keys,
    known,
    removed: [...new Set([...state.removed, ...(ops.removeWorkflows ?? [])])],
    name: ops.name?.trim() ? ops.name.trim().slice(0, 120) : state.name,
    objective: ops.objective?.trim() ? ops.objective.trim().slice(0, 600) : state.objective,
  };
}

const PLATFORM_WORDS: [RegExp, string][] = [
  [/\binstagram\b/, 'instagram'], [/\bfacebook\b/, 'facebook'], [/\blinkedin\b/, 'linkedin'], [/\b(twitter|x)\b/, 'twitter'],
];

/**
 * The commonest edits, understood without the AI.
 *
 * Not a parser for English — a handful of shapes that cover most of what
 * people say to a blueprint ("three posts a week", "remove LinkedIn", "add a
 * blog every Friday", "make approval mandatory"). Anything else returns null
 * and the screen says it did not understand, rather than guessing.
 */
export function parseEdit(text: string, state: IntakeState, bp: Blueprint): { ops: EditOps; said: string } | null {
  const t = text.toLowerCase().trim();
  const ops: EditOps = { set: {} };
  const said: string[] = [];
  const current = (id: string): string[] => {
    const v = withDefaults(state).known[id]?.value;
    return Array.isArray(v) ? v : v ? [v] : [];
  };

  const addBlog = /\badd (a |an )?(blog|article)/.test(t);
  const addSocial = /\badd (some )?(social|posts?)\b/.test(t);
  if (addBlog) { ops.addSolutions = [...(ops.addSolutions ?? []), 'blog-seo']; said.push('added a blog'); }
  if (addSocial) { ops.addSolutions = [...(ops.addSolutions ?? []), 'social-growth']; said.push('added social posts'); }

  const freq = frequencyIn(t);
  if (freq) {
    const blogEdit = addBlog || /\b(blog|article)/.test(t);
    const target = blogEdit || (!bp.workflows.some(w => w.channel === 'social') && bp.workflows.some(w => w.channel === 'blog')) ? 'blogFrequency' : 'frequency';
    const f = target === 'blogFrequency' && freq === 'weekdays' ? 'daily' : freq;
    ops.set![target] = f;
    said.push(`${target === 'blogFrequency' ? 'articles' : 'posts'}: ${cadenceOf(f).words.toLowerCase()}`);
  }

  const removing = /\b(remove|drop|no more|without|take out|stop)\b/.test(t);
  const adding = /\b(add|include|also|plus)\b/.test(t);
  for (const [re, p] of PLATFORM_WORDS) {
    if (!re.test(t)) continue;
    const list = current('platforms');
    if (removing) { ops.set!.platforms = list.filter(x => x !== p); said.push(`removed ${p === 'twitter' ? 'X' : p[0].toUpperCase() + p.slice(1)}`); }
    else if (adding) { ops.set!.platforms = [...new Set([...(ops.set!.platforms as string[] ?? list), p])]; said.push(`added ${p === 'twitter' ? 'X' : p[0].toUpperCase() + p.slice(1)}`); }
  }
  if (Array.isArray(ops.set!.platforms) && !(ops.set!.platforms as string[]).length) {
    delete ops.set!.platforms;
    said.pop();
    said.push('kept at least one platform — a social workflow needs somewhere to write for');
  }

  const n = /\b(one|two|three|1|2|3)\s+(image\s+)?(versions|variations|options|images)\b/.exec(t);
  if (n) { ops.set!.postsPerRun = String(numberIn(n[1])); said.push(`${numberIn(n[1])} versions each time`); }

  if (/\b(approval|approve|review)\b/.test(t) && /\b(mandatory|required|always|must|first)\b/.test(t)) {
    ops.set!.approval = 'review'; ops.set!.blogDestination = 'drafts'; said.push('everything waits for your approval');
  } else if (/\bready to publish\b|\bno approval\b|\bskip (the )?approval\b/.test(t)) {
    ops.set!.approval = 'ready'; said.push('finished posts are marked ready to publish');
  }

  const style = /\b(minimal|premium|fashion|technology|luxury|colou?rful|family)\b/.exec(t)?.[1];
  if (style && /\b(store|shop|theme|design|look|style)\b/.test(t)) {
    ops.set!.storeDesign = style.replace('colorful', 'colourful');
    said.push(`store style: ${style}`);
  }

  const seqLen = /\b(3|three|5|five|7|seven)[- ]emails?\b/.exec(t);
  if (seqLen) { ops.set!.sequenceLength = String(numberIn(seqLen[1])); said.push(`${numberIn(seqLen[1])} emails in the sequence`); }

  if (removing) {
    for (const w of bp.workflows) {
      const words = w.name.toLowerCase().replace(/ automation$/, '').split(/\s+/).filter(x => x.length > 3);
      if (words.length && words.every(x => t.includes(x))) { ops.removeWorkflows = [...(ops.removeWorkflows ?? []), w.key]; said.push(`removed ${w.name}`); }
    }
  }

  const rename = /\b(?:call it|rename (?:it |the project )?(?:to )?|name it)\s+["“]?([^"”]{3,80})["”]?$/i.exec(text.trim());
  if (rename) { ops.name = rename[1].trim(); said.push(`renamed to "${ops.name}"`); }

  if (!said.length) return null;
  if (!Object.keys(ops.set!).length) delete ops.set;
  return { ops, said: said.join('; ') };
}

/* ── Product import ───────────────────────────────────────────────────────── */

/** A CSV, as rows of cells — quoted fields, doubled quotes and CRLF handled. */
export function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = '';
  let quoted = false;
  const src = text.replace(/^\uFEFF/, '');
  const sep = (src.split('\n')[0].match(/;/g)?.length ?? 0) > (src.split('\n')[0].match(/,/g)?.length ?? 0) ? ';' : ',';
  for (let i = 0; i < src.length; i++) {
    const ch = src[i];
    if (quoted) {
      if (ch === '"' && src[i + 1] === '"') { cell += '"'; i++; }
      else if (ch === '"') quoted = false;
      else cell += ch;
    } else if (ch === '"') quoted = true;
    else if (ch === sep) { row.push(cell); cell = ''; }
    else if (ch === '\n' || ch === '\r') {
      if (ch === '\r' && src[i + 1] === '\n') i++;
      row.push(cell); cell = '';
      if (row.some(c => c.trim())) rows.push(row);
      row = [];
    } else cell += ch;
  }
  row.push(cell);
  if (row.some(c => c.trim())) rows.push(row);
  return rows;
}

export interface ProductDraft {
  name: string;
  sku: string;
  description: string;
  priceCents: number;
  compareAtCents: number;
  category: string;
  inventory: number;
  imageRef: string;
}

const HEADERS: Record<keyof ProductDraft, RegExp> = {
  name: /^(name|title|product( name| title)?|item( name)?)$/i,
  sku: /^(sku|code|product code|item code|ref(erence)?)$/i,
  description: /^(description|desc|details|body( \(html\))?|body html)$/i,
  priceCents: /^(price|regular price|unit price|variant price|rrp|cost to customer)$/i,
  compareAtCents: /^(compare[ -]?at( price)?|was price|original price|variant compare at price)$/i,
  category: /^(category|categories|type|product type|collection)$/i,
  inventory: /^(stock|inventory|qty|quantity|stock level|variant inventory qty)$/i,
  imageRef: /^(image|images|image url|image src|photo|picture|filename|image file|image name)$/i,
};

const cents = (raw: string): number => {
  const n = Number(String(raw).replace(/[^0-9.,-]/g, '').replace(/,(?=\d{3}\b)/g, '').replace(',', '.'));
  return Number.isFinite(n) && n > 0 ? Math.round(n * 100) : 0;
};

/**
 * Products from a spreadsheet, by header name.
 *
 * Shopify's and WooCommerce's own export column names are among the ones
 * recognised, because "export a CSV from your old shop" is the honest answer
 * to "import from Shopify" and it should then just work.
 */
export function productsFromCsv(rows: string[][]): { products: ProductDraft[]; missing: string[] } {
  if (rows.length < 2) return { products: [], missing: ['a header row and at least one product'] };
  const header = rows[0].map(h => h.trim());
  const col = (k: keyof ProductDraft) => header.findIndex(h => HEADERS[k].test(h));
  const idx = Object.fromEntries((Object.keys(HEADERS) as (keyof ProductDraft)[]).map(k => [k, col(k)])) as Record<keyof ProductDraft, number>;
  if (idx.name < 0) return { products: [], missing: ['a "name" or "title" column'] };
  const cell = (r: string[], k: keyof ProductDraft) => (idx[k] >= 0 ? String(r[idx[k]] ?? '').trim() : '');
  const seen = new Set<string>();
  const products: ProductDraft[] = [];
  for (const r of rows.slice(1)) {
    const name = cell(r, 'name');
    /* Shopify writes one row per variant and image, with the name only on the
       first. Those rows are not products of their own. */
    if (!name || seen.has(name.toLowerCase())) continue;
    seen.add(name.toLowerCase());
    products.push({
      name: name.slice(0, 200),
      sku: cell(r, 'sku').slice(0, 80),
      description: cell(r, 'description').replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 4000),
      priceCents: cents(cell(r, 'priceCents')),
      compareAtCents: cents(cell(r, 'compareAtCents')),
      category: cell(r, 'category').split(/[>,|]/)[0].trim().slice(0, 80),
      inventory: Math.max(0, Math.round(Number(cell(r, 'inventory')) || 0)),
      imageRef: cell(r, 'imageRef').split(/[,\s]+/)[0] ?? '',
    });
    if (products.length >= 500) break;
  }
  const missing = [
    idx.priceCents < 0 ? 'prices' : '',
    idx.description < 0 ? 'descriptions' : '',
  ].filter(Boolean);
  return { products, missing };
}

/** The attached image for a product: by the file named in the sheet, or by name. */
export function imageFor(p: ProductDraft, images: Attachment[]): Attachment | null {
  const stem = (s: string) => s.toLowerCase().replace(/^.*[\\/]/, '').replace(/\.[a-z0-9]+(\?.*)?$/, '').replace(/[^a-z0-9]+/g, '');
  if (p.imageRef) {
    const ref = stem(p.imageRef);
    const hit = images.find(i => stem(i.name) === ref);
    if (hit) return hit;
  }
  const keys = [stem(p.sku), stem(p.name)].filter(k => k.length >= 3);
  return images.find(i => keys.includes(stem(i.name))) ?? null;
}

/* ── Starting state ───────────────────────────────────────────────────────── */

export function initialState(prompt: string, picked: string | undefined, ws: WorkspaceFacts, files: Attachment[], links: LinkRef[]): IntakeState {
  const m = matchSolutions(prompt, picked);
  const names = m.keys.map(k => solutionByKey(k)?.label ?? k);
  return {
    prompt,
    solutionKeys: m.keys,
    strength: m.strength,
    known: extractKnown(prompt, m.keys, ws, files, links),
    extraQuestions: [],
    customWorkflows: [],
    removed: [],
    name: '',
    objective: '',
    unsupported: [],
    summary: m.strength === 'custom'
      ? 'This is not one of the ready-made solutions, so I will ask a few questions and build it from scratch.'
      : `This looks like ${names.join(' with ')}.`,
    understoodBy: 'keywords',
  };
}
