/**
 * The browser's side of `/api/intake.php`.
 *
 * Every call returns a result rather than throwing, and `noAi` is its own
 * outcome: the wizard carries on with its own matching when the model is not
 * there, and says so — which it can only do if "no model" and "the model said
 * nothing useful" are told apart.
 */
import { sessionToken } from './auth';
import { getActiveAccountId } from './tenancy';
import { API_BASE } from './apiBase';
import { currentAiJob } from '../lib/gemini';
import { universalYear, type MarketingYear } from './marketingYear';
import { QUESTIONS, SOLUTIONS } from './projectSolutions';
import { TEMPLATES } from '../components/Autopilot/workflowTemplates';
import type { Attachment, CustomWorkflow, EditOps, ExtraQuestion } from './projectIntake';

interface Reply {
  success: boolean;
  error?: string;
  code?: string;
  [k: string]: unknown;
}

/**
 * The public site's wizard has no account: it asks `/api/site-plan.php`,
 * which answers `understand` and `transcribe` the same way, rate-limited, on
 * the operator's key (worker/src/routes/sitePlan.ts). Set by SolutionWizard.
 */
let siteMode = false;
export function setSiteIntake(on: boolean): void { siteMode = on; }

async function call(action: string, extra: Record<string, unknown>): Promise<Reply> {
  if (siteMode) {
    if (action !== 'understand' && action !== 'transcribe') return { success: false, code: 'no_ai', error: 'Not before sign-up.' };
    try {
      const r = await fetch(`${API_BASE}/api/site-plan.php`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action, ...extra }),
      });
      return await r.json() as Reply;
    } catch (e) {
      return { success: false, error: `Could not reach the server: ${e instanceof Error ? e.message : String(e)}` };
    }
  }
  const accountId = getActiveAccountId();
  if (!accountId) return { success: false, error: 'No workspace is active yet.' };
  try {
    const r = await fetch(`${API_BASE}/api/intake.php`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      /* A build's calls carry its job id (lib/gemini.ts aiJob), so a build that
         started inside the AI allowance finishes past it. */
      body: JSON.stringify({ token: sessionToken(), accountId, action, ...(currentAiJob() ? { job: currentAiJob() } : {}), ...extra }),
      signal: AbortSignal.timeout(120_000),
    });
    return await r.json() as Reply;
  } catch (e) {
    return { success: false, error: `Could not reach the server: ${e instanceof Error ? e.message : String(e)}` };
  }
}

/**
 * The catalogue, as the model is shown it.
 *
 * Sent from here rather than duplicated on the server: the catalogue is a
 * client module, and two copies would disagree the first time a solution was
 * added — the model would then choose a key the wizard does not know.
 */
export function catalogue() {
  return {
    solutions: SOLUTIONS.map(s => ({ key: s.key, label: s.label, blurb: s.blurb })),
    questions: Object.values(QUESTIONS)
      .filter(q => q.type !== 'inspiration')
      .map(q => ({ id: q.id, prompt: q.prompt, type: q.type, options: q.options?.map(o => ({ value: o.value, label: o.label })) })),
    templates: TEMPLATES.map(t => ({ key: t.key, name: t.name, blurb: t.blurb.slice(0, 120) })),
  };
}

export interface Understanding {
  summary: string;
  name: string;
  objective: string;
  solutionKeys: string[];
  match: 'strong' | 'partial' | 'custom';
  facts: Record<string, string | string[]>;
  profile: Record<string, string>;
  extraQuestions: ExtraQuestion[];
  customWorkflows: CustomWorkflow[];
  unsupported: string[];
}

export interface UnderstandResult {
  ok: boolean;
  noAi: boolean;
  understanding?: Understanding;
  sources: { what: string; ok: boolean; error?: string }[];
  error: string;
}

const base64Of = (dataUrl: string) => dataUrl.slice(dataUrl.indexOf(',') + 1);

export async function understand(p: {
  prompt: string; files: Attachment[]; urls: string[]; portfolioId?: string; candidates: string[];
}): Promise<UnderstandResult> {
  /* Images and PDFs go as they are; the model reads both. Only a handful — the
     wizard may hold eighty product photos, and the model needs to see a few
     to know what the shop sells, not all of them. */
  const visual = p.files.filter(f => (f.kind === 'image' || f.kind === 'pdf') && f.dataUrl);
  const pdfs = visual.filter(f => f.kind === 'pdf').slice(0, 2);
  const images = visual.filter(f => f.kind === 'image').slice(0, 4 - pdfs.length);
  const r = await call('understand', {
    prompt: p.prompt,
    files: [...pdfs, ...images].map(f => ({ name: f.name, mime: f.mime, data: base64Of(f.dataUrl!) })),
    texts: p.files.filter(f => f.text).slice(0, 3).map(f => ({ name: f.name, text: f.text!.slice(0, 20_000) })),
    urls: p.urls.slice(0, 3),
    portfolioId: p.portfolioId,
    catalogue: catalogue(),
    candidates: p.candidates,
  });
  const sources = (r.sources as UnderstandResult['sources']) ?? [];
  if (!r.success) return { ok: false, noAi: r.code === 'no_ai', sources, error: r.error ?? 'Could not understand that.' };
  return { ok: true, noAi: false, understanding: r.understanding as Understanding, sources, error: '' };
}

export async function refine(p: {
  instruction: string; state: Record<string, unknown>;
}): Promise<{ ok: boolean; noAi: boolean; ops?: EditOps; reply: string; error: string }> {
  const r = await call('refine', { instruction: p.instruction, state: p.state, catalogue: catalogue() });
  if (!r.success) return { ok: false, noAi: r.code === 'no_ai', reply: '', error: r.error ?? 'Could not change that.' };
  return { ok: true, noAi: false, ops: r.ops as EditOps, reply: String(r.reply ?? ''), error: '' };
}

/**
 * A workflow's emails, rewritten for this business and this strategy
 * (routes/intake.ts `write_emails`). Ids come back as sent; anything the AI did
 * not return keeps its wording.
 */
export interface EmailDraft { id: string; intent: string; subject: string; body: string }
export async function writeEmails(p: {
  /* Omitted from the step editor, which names the project instead and lets
     the server read that project's own profile. */
  business?: { companyName: string; description: string; audience?: string; offer?: string; website?: string; tone?: string };
  projectId?: string;
  strategy: { workflow: string; purpose: string; objective?: string; booking: boolean; instruction?: string };
  emails: EmailDraft[];
}): Promise<{ ok: boolean; noAi: boolean; emails: { id: string; subject: string; body: string }[]; error: string }> {
  const r = await call('write_emails', p);
  if (!r.success) return { ok: false, noAi: r.code === 'no_ai', emails: [], error: r.error ?? 'Could not write the emails.' };
  return { ok: true, noAi: false, emails: (r.emails as { id: string; subject: string; body: string }[]) ?? [], error: '' };
}

export async function transcribe(audioBase64: string, mime: string, language: string, context = ''): Promise<{
  ok: boolean; noAi: boolean; text: string; clarity: 'clear' | 'partly' | 'unclear'; error: string;
}> {
  const r = await call('transcribe', { audio: audioBase64, mime, language, ...(context ? { context: context.slice(0, 600) } : {}) });
  if (!r.success) return { ok: false, noAi: r.code === 'no_ai', text: '', clarity: 'unclear', error: r.error ?? 'Could not transcribe that.' };
  const clarity = (['clear', 'partly', 'unclear'].includes(String(r.clarity)) ? r.clarity : 'partly') as 'clear' | 'partly' | 'unclear';
  return { ok: true, noAi: false, text: String(r.text ?? ''), clarity, error: '' };
}

/**
 * Likely answers to a screen's typed questions, for this business
 * (routes/intake.ts `suggest`). Keyed by question id; a question the AI said
 * nothing useful about is simply absent, and the wizard keeps its own ideas
 * (services/answerIdeas.ts) for it.
 */
export interface Suggestion { options: string[]; pick: string[]; why: string; placeholder: string }
export async function suggestAnswers(p: {
  prompt: string;
  business: { companyName?: string; description?: string; website?: string; locations?: string; location?: string };
  questions: { id: string; prompt: string; help?: string; many?: boolean; options?: string[] }[];
  answers: Record<string, unknown>;
}): Promise<{ ok: boolean; noAi: boolean; suggestions: Record<string, Suggestion>; error: string }> {
  const r = await call('suggest', p);
  if (!r.success) return { ok: false, noAi: r.code === 'no_ai', suggestions: {}, error: r.error ?? 'No suggestions.' };
  return { ok: true, noAi: false, suggestions: (r.suggestions as Record<string, Suggestion>) ?? {}, error: '' };
}

/**
 * The business's next twelve months (worker/src/routes/intake.ts `plan_year`).
 *
 * Always a plan: the server answers with the universal one and the reason when
 * the AI could not write a tailored one, and so does this when the server
 * cannot be reached — `plan.source` and `plan.note` say which it is.
 */
export async function planYear(business: { companyName: string; description: string; audience?: string; offer?: string; location?: string; goals?: string }): Promise<MarketingYear> {
  const r = await call('plan_year', { business });
  const plan = r.plan as MarketingYear | undefined;
  if (r.success && plan && Array.isArray(plan.months) && plan.months.length === 12) return plan;
  return universalYear(new Date(), `${r.error ?? 'The server could not be reached.'} This is the ready-made plan every business fits — press Write my plan to try again.`);
}
