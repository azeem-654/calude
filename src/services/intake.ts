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
import { QUESTIONS, SOLUTIONS } from './projectSolutions';
import { TEMPLATES } from '../components/Autopilot/workflowTemplates';
import type { Attachment, CustomWorkflow, EditOps, ExtraQuestion } from './projectIntake';

interface Reply {
  success: boolean;
  error?: string;
  code?: string;
  [k: string]: unknown;
}

async function call(action: string, extra: Record<string, unknown>): Promise<Reply> {
  const accountId = getActiveAccountId();
  if (!accountId) return { success: false, error: 'No workspace is active yet.' };
  try {
    const r = await fetch(`${API_BASE}/api/intake.php`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ token: sessionToken(), accountId, action, ...extra }),
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

export async function transcribe(audioBase64: string, mime: string, language: string): Promise<{
  ok: boolean; noAi: boolean; text: string; clarity: 'clear' | 'partly' | 'unclear'; error: string;
}> {
  const r = await call('transcribe', { audio: audioBase64, mime, language });
  if (!r.success) return { ok: false, noAi: r.code === 'no_ai', text: '', clarity: 'unclear', error: r.error ?? 'Could not transcribe that.' };
  const clarity = (['clear', 'partly', 'unclear'].includes(String(r.clarity)) ? r.clarity : 'partly') as 'clear' | 'partly' | 'unclear';
  return { ok: true, noAi: false, text: String(r.text ?? ''), clarity, error: '' };
}
