/**
 * The public site's "Find my solution" — the plan a visitor makes before they
 * have an account, and how it reaches the project built after sign-up.
 *
 * ── One judgement, two screens ──
 *
 * The site does not have a questionnaire of its own. It runs the New Project
 * wizard's pure modules — `initialState`, `allQuestions`, `screensOf`,
 * `buildBlueprint` (services/projectIntake.ts) — so the blueprint a visitor
 * approves on protectedcentral.com is, workflow for workflow, the one the app
 * builds. A second catalogue for the site would drift from the first the day
 * either changed, and the visitor would be shown one thing and given another.
 *
 * What differs is *which* questions are asked before sign-up. A visitor has no
 * contact lists, no mailbox and no portfolio yet, so anything about those waits
 * for the app (and "Let AI decide" fills what can safely be filled). The cap is
 * five screens of at most two questions — required ones first.
 *
 * ── How the plan crosses to the app ──
 *
 * protectedcentral.com and app.protectedcentral.com are two origins: nothing
 * the site stores is visible to the app. The plan travels in the address's
 * fragment (`/signup#plan=…`), which browsers never send to a server, is
 * checked field by field on arrival (`decodePlan` — it is untrusted input),
 * and is kept on the app's origin as `pc_site_plan` until the account exists.
 * Nothing about it is stored on a server before sign-up: no account is made,
 * and no answers are kept, without the visitor pressing the button.
 */
import {
  DESIGN_QUESTION_IDS, allQuestions, applies, extractKnown, initialState, screensOf, validValue,
  type Attachment, type CustomWorkflow, type IntakeState, type KnownMap, type LinkRef, type Screen, type WorkspaceFacts,
} from './projectIntake';
import type { Understanding } from './intake';
import { GROUP_ORDER, QUESTIONS, solutionByKey, CUSTOM, type Question } from './projectSolutions';

/* ── The shortcuts under the box ─────────────────────────────────────────── */

/**
 * The popular outcomes, each a solution in the catalogue and a sentence that
 * starts the visitor off. Shortcuts, not a menu: typing anything else works.
 */
export const SITE_SHORTCUTS: { key: string; label: string; icon: string; seed: string }[] = [
  { key: 'lead-generation', label: 'Get more leads', icon: 'target', seed: 'I want more leads for my business.' },
  { key: 'sales-followup', label: 'Automate sales follow-up', icon: 'repeat', seed: 'Follow up with every lead and quote automatically.' },
  { key: 'social-growth', label: 'Create content', icon: 'image', seed: 'Create social media posts for my business every weekday.' },
  { key: 'appointment-booking', label: 'Book more appointments', icon: 'calendar', seed: 'Book more appointments and remind people so they turn up.' },
  { key: 'ecommerce-store', label: 'Build an online store', icon: 'store', seed: 'Build an online store for my products.' },
  { key: 'customer-support', label: 'Improve customer support', icon: 'life', seed: 'Answer customer questions faster and never miss a request.' },
  { key: 'client-onboarding', label: 'Automate client onboarding', icon: 'clipboard', seed: 'Onboard every new client the same way, automatically.' },
  { key: 'agency-operations', label: 'Grow my agency', icon: 'building', seed: 'Run my agency’s client work and reporting with less admin.' },
  { key: 'blog-seo', label: 'SEO & blog growth', icon: 'file', seed: 'Write SEO blog articles for my website every week.' },
  { key: 'customer-reactivation', label: 'Re-engage old customers', icon: 'refresh', seed: 'Win back customers who have not bought in a while.' },
  { key: CUSTOM, label: 'Something custom', icon: 'sparkles', seed: '' },
];

/* ── What the site asks ──────────────────────────────────────────────────── */

/** Questions the site can draw: plain choices and text. The rest (logos,
 *  layouts, themes, galleries) have safe defaults or wait for the app. */
const SITE_TYPES = new Set(['single', 'multi', 'text', 'number']);

/**
 * Never asked before an account exists, each for its reason:
 * the business has its own screen; a contact list, a sender and a mailbox are
 * things a new account does not have yet (and a content customer must never be
 * asked about sending at all); the daily volume sizes a mailbox setup.
 */
const SITE_SKIP = new Set(['business', 'website', 'contactList', 'sender', 'mailbox', 'dailyVolume', 'inspiration']);

/** Options that make no sense before sign-up: there is nothing in the CRM yet. */
const SITE_DROP: Record<string, string[]> = { contactSource: ['crm', 'list'] };

export const MAX_SCREENS = 5;
const PER_SCREEN = 2;

/** A question as the site shows it — with the options it can offer. */
export function siteQuestion(q: Question): Question {
  const drop = SITE_DROP[q.id];
  return drop && q.options ? { ...q, options: q.options.filter(o => !drop.includes(o.value)) } : q;
}

/**
 * The question ids worth asking on the site, decided once when the questions
 * start (like the app's `asked` set): everything still open that the site can
 * draw, including questions that only apply after another answer — whether
 * each is shown is decided screen by screen.
 */
export function siteAskable(state: IntakeState): string[] {
  const ids = allQuestions(state)
    .filter(q => !SITE_SKIP.has(q.id) && !DESIGN_QUESTION_IDS.includes(q.id) && SITE_TYPES.has(q.type) && !answered(state.known[q.id]?.value))
    .map(q => q.id);
  /* "Who should it reach?" and "what kinds of business should it find?" are
     one question to a visitor: the answer to the first is the second's too
     (`answerOnSite` copies it across). */
  return ids.includes('audience') ? ids.filter(id => id !== 'prospectTrades') : ids;
}

/**
 * An answer given on the site, with what it settles besides itself: who to
 * reach is also what kinds of business the daily finder searches for, unless
 * that was answered separately.
 */
export function answerOnSite(state: IntakeState, id: string, value: string | string[] | null, source: KnownMap[string]['source']): IntakeState {
  const known = { ...state.known };
  if (value === null) delete known[id];
  else known[id] = { value, source, note: source === 'default' ? 'chosen for you' : undefined };
  if (id === 'audience' && allQuestions(state).some(q => q.id === 'prospectTrades') && (!known.prospectTrades || known.prospectTrades.note === 'who you want to reach')) {
    const v = Array.isArray(value) ? value.join(', ') : String(value ?? '');
    if (v.trim()) known.prospectTrades = { value: v, source, note: 'who you want to reach' };
    else delete known.prospectTrades;
  }
  return { ...state, known };
}

const answered = (v: unknown) => v !== undefined && (Array.isArray(v) ? v.length > 0 : String(v).trim() !== '');

/**
 * The screens, from the ids asked and the answers so far.
 *
 * At most two questions to a screen and five screens in all. When there are
 * more, screens of nothing but optional questions are the ones dropped — their
 * defaults are safe, and a short wizard that finishes beats a thorough one
 * that does not.
 */
export function siteScreens(state: IntakeState, asked: string[]): Screen[] {
  const set = new Set(asked);
  const qs = allQuestions(state).filter(q => set.has(q.id) && applies(q, state.known)).map(siteQuestion);
  const out: Screen[] = [];
  for (const s of screensOf(qs)) {
    for (let i = 0; i < s.questions.length; i += PER_SCREEN) out.push({ group: s.group, questions: s.questions.slice(i, i + PER_SCREEN) });
  }
  if (out.length <= MAX_SCREENS) return out;
  const keep: Screen[] = [];
  let room = MAX_SCREENS - out.filter(s => s.questions.some(q => q.need === 'required')).length;
  for (const s of out) {
    if (s.questions.some(q => q.need === 'required')) keep.push(s);
    else if (room > 0) { keep.push(s); room--; }
  }
  return keep.slice(0, MAX_SCREENS).sort((a, b) => GROUP_ORDER.indexOf(a.group) - GROUP_ORDER.indexOf(b.group));
}

/**
 * The AI's reading of a request, folded into the starting state — the same
 * rules as the app's wizard (NewProject `runUnderstanding`): its solution keys
 * only if the catalogue has them, a picked shortcut first, facts only for
 * questions those solutions ask and only as values the question accepts, and
 * the AI's own questions and workflows only for a custom request.
 */
export function withUnderstanding(
  base: IntakeState, u: Understanding, picked: string, ws: WorkspaceFacts, files: Attachment[], links: LinkRef[],
): IntakeState {
  const aiKeys = u.solutionKeys.filter(k => solutionByKey(k));
  let keys = aiKeys.length ? aiKeys : base.solutionKeys;
  if (picked && picked !== CUSTOM) keys = [picked, ...aiKeys.filter(k => k !== picked)].slice(0, 2);
  const known = extractKnown(base.prompt, keys, ws, files, links);
  const askedIds = new Set(allQuestions({ solutionKeys: keys, extraQuestions: [] }).map(q => q.id));
  for (const [id, v] of Object.entries(u.facts ?? {})) {
    const q = QUESTIONS[id];
    if (!q || !askedIds.has(id) || known[id]) continue;
    const clean = validValue(q, v);
    if (clean !== null && !(id === 'business' && String(clean).startsWith('existing:'))) {
      known[id] = { value: clean, source: 'ai', note: 'understood from what you gave me' };
    }
  }
  const custom = keys.includes(CUSTOM) || u.match === 'custom';
  return {
    ...base,
    solutionKeys: keys,
    strength: picked && picked !== CUSTOM ? (keys.length > 1 ? 'partial' : 'strong') : (aiKeys.length ? u.match : base.strength),
    known,
    extraQuestions: custom ? (u.extraQuestions ?? []).map(q => ({ ...q, group: 'custom' as const })) : [],
    customWorkflows: u.customWorkflows ?? [],
    unsupported: u.unsupported ?? [],
    summary: u.summary || base.summary,
    name: u.name || '',
    objective: u.objective || '',
    understoodBy: 'ai',
  };
}

/* ── The visitor's own trade, and who buys from it ──────────────────────── */

/**
 * "30 roofing leads every day" — the visitor's own trade is the words before
 * "leads". A roofer asking for roofing leads wants customers, not roofers:
 * which is why the site suggests who to find instead of reusing the word.
 */
export function yourTradeIn(prompt: string): string {
  const m = /\b(?:\d+\s+)?(?:more\s+|new\s+)?((?:[a-z]+\s+){0,2}[a-z]+)\s+(?:leads|enquiries|inquiries|jobs)\b/i.exec(prompt);
  if (!m) return '';
  const words = m[1].toLowerCase().replace(/^(more|new|some|good|quality|qualified|the|a|my|our|want|need|get)\s+/g, '').trim();
  return /^(more|new|some|good|quality|qualified|sales|business|b2b|b2c|daily|local)$/.test(words) ? '' : words;
}

/**
 * Who typically buys from a trade, offered as one-press answers to "what kind
 * of customers?". Suggestions only — the visitor can type anything, and
 * "Let AI suggest" takes the first two.
 */
const BUYERS: [RegExp, string[]][] = [
  [/roof|gutter|siding|hvac|plumb|electric|paving|concrete|landscap|cleaning|janitor|pest|security|fire/, ['Property managers', 'General contractors', 'Commercial property owners', 'Real estate companies', 'Facilities managers']],
  [/dent|clinic|medical|physio|chiro|spa|salon|gym|fitness|yoga|vet/, ['Local families', 'Office workers nearby', 'Corporate wellness programmes', 'Schools and sports clubs']],
  [/law|legal|account|bookkeep|tax|financ|insur|consult/, ['Small business owners', 'Startups', 'Property investors', 'Local companies']],
  [/market|agency|seo|web|design|software|saas|it\b|tech/, ['Local service businesses', 'E-commerce brands', 'Professional services firms', 'Startups']],
  [/real estate|property|realtor|mortgage/, ['Home sellers', 'Landlords', 'Property investors', 'Relocating professionals']],
  [/restaurant|cafe|catering|bakery|food/, ['Offices for catering', 'Event planners', 'Wedding venues', 'Local businesses']],
  [/recruit|staffing|hiring/, ['Growing local companies', 'Construction firms', 'Healthcare providers', 'Logistics companies']],
];
const ANY_BUYERS = ['Local businesses', 'Homeowners', 'Small business owners', 'Property managers'];

export function buyersFor(trade: string): string[] {
  const t = trade.toLowerCase();
  return BUYERS.find(([re]) => re.test(t))?.[1] ?? (t ? ANY_BUYERS : []);
}

/* ── The plan ────────────────────────────────────────────────────────────── */

/** What crosses to the app: enough to rebuild the IntakeState, nothing more. */
export interface SitePlan {
  v: 1;
  at: number;
  prompt: string;
  picked: string;
  solutionKeys: string[];
  strength: IntakeState['strength'];
  known: KnownMap;
  extraQuestions: Question[];
  customWorkflows: CustomWorkflow[];
  unsupported: string[];
  summary: string;
  name: string;
  objective: string;
  understoodBy: IntakeState['understoodBy'];
}

/** The business fields the site's business screen fills (questionRules' MANUAL_FIELDS). */
const BUSINESS_IDS = ['bizName', 'bizWhat', 'bizWho', 'website', 'business'];

export function planOf(state: IntakeState, picked: string): SitePlan {
  return {
    v: 1, at: Date.now(), prompt: state.prompt, picked, solutionKeys: state.solutionKeys, strength: state.strength,
    known: state.known, extraQuestions: state.extraQuestions, customWorkflows: state.customWorkflows,
    unsupported: state.unsupported, summary: state.summary, name: state.name, objective: state.objective,
    understoodBy: state.understoodBy,
  };
}

const clip = (v: unknown, n: number) => String(v ?? '').slice(0, n);
const KNOWN_SOURCES = new Set(['prompt', 'profile', 'file', 'link', 'ai', 'you', 'default']);
const ID = /^[a-zA-Z][\w-]{0,40}$/;

/** A question the AI wrote, re-checked: shape only, and nothing executable. */
function cleanQuestion(q: unknown): Question | null {
  const o = (q ?? {}) as Record<string, unknown>;
  const id = String(o.id ?? '');
  if (!ID.test(id) || QUESTIONS[id]) return null;
  const type = String(o.type ?? '');
  if (!['single', 'multi', 'text'].includes(type)) return null;
  const options = Array.isArray(o.options)
    ? o.options.slice(0, 8).map(x => ({ value: clip((x as Record<string, unknown>)?.value, 60), label: clip((x as Record<string, unknown>)?.label, 80) })).filter(x => x.value && x.label)
    : undefined;
  return {
    id, group: 'custom', type: type as Question['type'], need: o.need === 'required' ? 'required' : 'optional',
    prompt: clip(o.prompt, 160) || 'One more thing', help: o.help ? clip(o.help, 240) : undefined,
    placeholder: o.placeholder ? clip(o.placeholder, 120) : undefined, options,
  };
}

function cleanWorkflow(w: unknown): CustomWorkflow | null {
  const o = (w ?? {}) as Record<string, unknown>;
  const name = clip(o.name, 80);
  if (!name) return null;
  const pick = <T extends string>(v: unknown, ok: readonly T[]): T | undefined => (ok.includes(v as T) ? (v as T) : undefined);
  return {
    name, purpose: clip(o.purpose, 300), kind: o.kind === 'agent' ? 'agent' : 'contact',
    produces: pick(o.produces, ['social', 'blog', 'email_campaign'] as const),
    source: pick(o.source, ['portfolio', 'website', 'web', 'rss', 'youtube'] as const),
    sourceUrl: o.sourceUrl ? clip(o.sourceUrl, 300) : undefined,
    sourcePrompt: o.sourcePrompt ? clip(o.sourcePrompt, 300) : undefined,
    cadence: o.cadence ? clip(o.cadence, 20) : undefined,
    platform: o.platform ? clip(o.platform, 20) : undefined,
    instruction: o.instruction ? clip(o.instruction, 500) : undefined,
  };
}

/**
 * A plan read back from an address — untrusted, so every field is checked.
 * Keys must be in the catalogue, answers must be answers the question accepts
 * (`validValue`), the business lines are plain text, and anything else is
 * dropped. Returns null when nothing usable is left.
 */
export function cleanPlan(raw: unknown): SitePlan | null {
  const o = (raw ?? {}) as Record<string, unknown>;
  if (o.v !== 1) return null;
  const keys = (Array.isArray(o.solutionKeys) ? o.solutionKeys : []).map(String).filter(k => solutionByKey(k)).slice(0, 3);
  if (!keys.length) return null;
  const extra = (Array.isArray(o.extraQuestions) ? o.extraQuestions : []).slice(0, 6).map(cleanQuestion).filter((q): q is Question => !!q);
  const extraIds = new Map(extra.map(q => [q.id, q]));
  const known: KnownMap = {};
  for (const [id, k] of Object.entries((o.known ?? {}) as Record<string, { value?: unknown; source?: unknown; note?: unknown }>).slice(0, 80)) {
    if (!ID.test(id) || !k) continue;
    const source = KNOWN_SOURCES.has(String(k.source)) ? (k.source as KnownMap[string]['source']) : 'you';
    const note = k.note ? clip(k.note, 120) : undefined;
    const q = QUESTIONS[id] ?? extraIds.get(id);
    let value: string | string[] | null = null;
    if (BUSINESS_IDS.includes(id)) {
      value = id === 'business' ? (['manual', 'website'].includes(String(k.value)) ? String(k.value) : null)
        : id === 'website' ? (/^https?:\/\/[^\s/]+\.[^\s]+$/.test(String(k.value)) ? clip(k.value, 300) : null)
          : clip(k.value, 300).trim() || null;
    } else if (q) {
      value = QUESTIONS[id] ? validValue(q, k.value) : (Array.isArray(k.value) ? k.value.slice(0, 8).map(v => clip(v, 120)) : clip(k.value, 500));
    }
    if (value !== null) known[id] = { value, source, note };
  }
  const strength = ['strong', 'partial', 'custom'].includes(String(o.strength)) ? (o.strength as SitePlan['strength']) : 'strong';
  return {
    v: 1,
    at: Number(o.at) || Date.now(),
    prompt: clip(o.prompt, 4000),
    picked: solutionByKey(String(o.picked ?? '')) ? String(o.picked) : '',
    solutionKeys: keys,
    strength,
    known,
    extraQuestions: extra,
    customWorkflows: (Array.isArray(o.customWorkflows) ? o.customWorkflows : []).slice(0, 6).map(cleanWorkflow).filter((w): w is CustomWorkflow => !!w),
    unsupported: (Array.isArray(o.unsupported) ? o.unsupported : []).slice(0, 6).map(u => clip(u, 200)).filter(Boolean),
    summary: clip(o.summary, 400),
    name: clip(o.name, 100),
    objective: clip(o.objective, 400),
    understoodBy: o.understoodBy === 'ai' ? 'ai' : 'keywords',
  };
}

/* base64url of UTF-8 JSON — readable by `atob` in every browser and by Node. */
export function encodePlan(plan: SitePlan): string {
  const bytes = new TextEncoder().encode(JSON.stringify(plan));
  let bin = '';
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

export function decodePlan(text: string): SitePlan | null {
  if (!text || text.length > 40_000 || !/^[A-Za-z0-9_-]+$/.test(text)) return null;
  try {
    const bin = atob(text.replace(/-/g, '+').replace(/_/g, '/'));
    const bytes = Uint8Array.from(bin, c => c.charCodeAt(0));
    return cleanPlan(JSON.parse(new TextDecoder().decode(bytes)));
  } catch { return null; }
}

/* ── In the app: the plan as the wizard's starting state ─────────────────── */

/**
 * The IntakeState the plan describes, in this workspace. Facts the workspace
 * itself knows (extractKnown) fill in around the visitor's own answers, which
 * always win.
 */
export function seedState(plan: SitePlan, ws: WorkspaceFacts): IntakeState {
  const base = initialState(plan.prompt, plan.picked || undefined, ws, [], []);
  const known: KnownMap = { ...base.known };
  for (const [id, k] of Object.entries(plan.known)) known[id] = k;
  return {
    ...base,
    solutionKeys: plan.solutionKeys,
    strength: plan.strength,
    known,
    extraQuestions: plan.extraQuestions,
    customWorkflows: plan.customWorkflows,
    unsupported: plan.unsupported,
    summary: plan.summary || base.summary,
    name: plan.name,
    objective: plan.objective,
    understoodBy: plan.understoodBy,
  };
}

/**
 * The questions the app must still ask before it can build: required, open,
 * and with no safe default. A site visitor who answered everything is asked
 * nothing — the build starts on arrival. The mailbox is answered "not sure
 * yet" for them: the project is built, and nothing sends until one is
 * connected, which the build's "yours to do" list says.
 */
export function stillNeeded(state: IntakeState): string[] {
  return allQuestions(state)
    .filter(q => q.id !== 'business' && applies(q, state.known) && q.need === 'required' && q.aiDecides === undefined && !answered(state.known[q.id]?.value))
    .map(q => q.id);
}

/** The answers a plan settles for the visitor on arrival — said, never hidden. */
export function arrivalDefaults(state: IntakeState): IntakeState {
  const ids = new Set(allQuestions(state).map(q => q.id));
  if (!ids.has('mailbox') || answered(state.known.mailbox?.value)) return state;
  return { ...state, known: { ...state.known, mailbox: { value: 'later', source: 'default', note: 'connect it when you are ready — nothing sends until then' } } };
}

/* ── Keeping it in the browser ───────────────────────────────────────────── */

const PROGRESS = 'pc_site_wizard';
const PENDING = 'pc_site_plan';
const PROGRESS_DAYS = 14;
const PENDING_DAYS = 7;

/** The site wizard's progress, for "continue where you left off". This
 *  browser only, never a server; forgotten after a fortnight. */
export interface SiteProgress { at: number; step: string; prompt: string; picked: string; website: string; asked: string[]; screen: number; plan: SitePlan | null }

export function saveProgress(p: Omit<SiteProgress, 'at'>): void {
  try { localStorage.setItem(PROGRESS, JSON.stringify({ ...p, at: Date.now() })); } catch { /* private window: nothing kept */ }
}
export function loadProgress(): SiteProgress | null {
  try {
    const p = JSON.parse(localStorage.getItem(PROGRESS) ?? 'null') as SiteProgress | null;
    if (!p || Date.now() - p.at > PROGRESS_DAYS * 86_400_000) return null;
    return { ...p, plan: p.plan ? cleanPlan(p.plan) : null };
  } catch { return null; }
}
export function clearProgress(): void { try { localStorage.removeItem(PROGRESS); } catch { /* nothing to clear */ } }

/**
 * On the app's origin, before anything routes: a plan arriving in the address
 * is checked, kept until the account exists, and taken out of the address bar
 * (so a copied link or a screenshot does not carry somebody's answers).
 */
export function capturePlan(): void {
  let hash = '';
  try { hash = location.hash; } catch { return; }
  const m = /[#&]plan=([A-Za-z0-9_-]+)/.exec(hash);
  if (!m) return;
  const plan = decodePlan(m[1]);
  try {
    if (plan) localStorage.setItem(PENDING, JSON.stringify({ plan, at: Date.now() }));
    history.replaceState(null, '', location.pathname + location.search);
  } catch { /* storage off: the plan is lost, the sign-up still works */ }
}

export function pendingPlan(): SitePlan | null {
  try {
    const v = JSON.parse(localStorage.getItem(PENDING) ?? 'null') as { plan: unknown; at: number } | null;
    if (!v || Date.now() - v.at > PENDING_DAYS * 86_400_000) return null;
    return cleanPlan(v.plan);
  } catch { return null; }
}
export function clearPendingPlan(): void { try { localStorage.removeItem(PENDING); } catch { /* nothing to clear */ } }
