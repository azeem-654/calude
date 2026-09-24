/**
 * Building the project the customer approved — for real, one record at a time.
 *
 * ── Why the progress is honest ──
 *
 * The old wizard saved a project and then showed a checklist that waited for
 * the planner's first five-minute tick; a new project sat at 0% and looked
 * broken. Here every step *is* an operation — save the profile, save the
 * project, save each workflow, switch on the agents, import each product, make
 * the first post — and the bar is the weighted share of those that have
 * actually returned. The one step whose length nobody can know (the AI making
 * the first post) is drawn as working rather than as a number creeping up.
 *
 * ── What fails the build and what does not ──
 *
 * Only the two things a project cannot exist without: the business profile it
 * writes from, and the project row. Everything after is reported per step — a
 * workflow the server refused, a product without a price — and the project is
 * still opened, because a partial project the customer can see and fix beats a
 * wizard that threw away everything they answered.
 */
import {
  savePortfolio, saveProject, readPortfolioFromUrl, guardrailsFor, type Portfolio,
} from '../../../services/projects';
import {
  saveWorkflow, buildWorkflow, setWorkflowStatus, runAgent, fetchWorkflows,
} from '../../../services/autopilot';
import { saveProduct } from '../../../services/commerce';
import { understand } from '../../../services/intake';
import {
  briefOf, capsOf, kindOf, launchStepsOf, parseCsv, productsFromCsv, imageFor,
  type Attachment, type Blueprint, type IntakeState, type ProductDraft,
} from '../../../services/projectIntake';

export type StepState = 'todo' | 'now' | 'done' | 'warn' | 'failed';

export interface BuildStep {
  key: string;
  label: string;
  state: StepState;
  detail?: string;
  weight: number;
  /** 0–1 within the step, for the one step that has a count (products). */
  part?: number;
  link?: { label: string; route: string };
}

export interface BuildInput {
  bp: Blueprint;
  state: IntakeState;
  files: Attachment[];
  portfolios: Portfolio[];
  /** The profile the understanding step read from the website or files. */
  profileDraft: Record<string, string> | null;
  workspace: { companyName: string; description: string; website: string } | null;
}

export interface BuildResult {
  ok: boolean;
  projectId: string;
  fatal: string;
  created: { workflows: number; activated: number; products: number };
  first?: { label: string; route: string; detail: string };
  problems: string[];
}

const val = (st: IntakeState, id: string) => {
  const v = st.known[id]?.value;
  return Array.isArray(v) ? v.join(', ') : String(v ?? '');
};

const domainName = (url: string) => {
  try {
    const h = new URL(url).hostname.replace(/^www\./, '').split('.')[0];
    return h.split(/[-_]/).map(w => w[0]?.toUpperCase() + w.slice(1)).join(' ');
  } catch { return ''; }
};

/**
 * A workflow that is safe to switch on because the customer approved it.
 *
 * On a schedule, made only of AI agent steps, with nothing that emails or
 * texts a person. Those write drafts into the customer's own modules and
 * nothing else — the blueprint said they would run, and a content engine that
 * arrives switched off does not do what was agreed. Anything that sends stays
 * a draft, whatever else is true of it.
 */
function isContentAgent(w: Blueprint['workflows'][number]): boolean {
  const nodes = w.nodes ?? [];
  const trigger = nodes.find(n => n.type === 'trigger');
  return !w.sends && trigger?.config?.event === 'schedule'
    && nodes.some(n => n.type === 'ai') && nodes.every(n => n.type === 'trigger' || n.type === 'ai');
}

/** The products a build will import, worked out up front so the step list can say how many. */
export function productPlan(inp: BuildInput): { rows: ProductDraft[]; images: Attachment[]; missing: string[] } {
  if (!inp.bp.setup.some(s => s.key === 'import')) return { rows: [], images: [], missing: [] };
  const sheet = inp.files.find(f => f.kind === 'sheet' && f.text);
  if (!sheet) return { rows: [], images: [], missing: ['a spreadsheet to import from'] };
  const r = productsFromCsv(parseCsv(sheet.text!));
  return { rows: r.products, images: inp.files.filter(f => f.kind === 'image'), missing: r.missing };
}

/** The steps, before anything runs — so the list is on screen from the first frame. */
export function planSteps(inp: BuildInput): BuildStep[] {
  const business = val(inp.state, 'business');
  const existing = business.startsWith('existing:') ? inp.portfolios.find(p => p.id === business.slice(9)) : null;
  const steps: BuildStep[] = [{
    key: 'profile',
    label: existing ? `Loading ${existing.name}'s business profile`
      : business === 'website' ? 'Reading your website'
        : business === 'upload' ? 'Reading your company profile'
          : 'Saving your business profile',
    state: 'todo', weight: business === 'website' || business === 'upload' ? 3 : 1,
  }, { key: 'project', label: 'Creating the project', state: 'todo', weight: 2 }];
  for (const w of inp.bp.workflows) {
    steps.push({ key: `wf:${w.key}`, label: `Creating ${w.name}`, state: 'todo', weight: w.origin === 'ai' ? 3 : 1.5 });
  }
  const agents = inp.bp.workflows.filter(isContentAgent);
  if (agents.length) steps.push({ key: 'activate', label: `Switching on ${agents.length === 1 ? 'the AI agent' : `${agents.length} AI agent workflows`}`, state: 'todo', weight: 0.5 });
  const products = productPlan(inp);
  if (products.rows.length) steps.push({ key: 'products', label: `Importing ${products.rows.length} product${products.rows.length === 1 ? '' : 's'} as drafts`, state: 'todo', weight: Math.max(2, products.rows.length * 0.15) });
  const first = agents[0];
  if (first) {
    const out = first.channel === 'social' ? 'post' : first.channel === 'blog' ? 'article' : 'draft';
    steps.push({ key: 'first', label: `Making your first ${out} now`, state: 'todo', weight: 3 });
  }
  steps.push({ key: 'validate', label: 'Checking everything is in place', state: 'todo', weight: 0.5 });
  return steps;
}

export function percentOf(steps: BuildStep[]): number {
  const total = steps.reduce((n, s) => n + s.weight, 0) || 1;
  const done = steps.reduce((n, s) => n + (s.state === 'done' || s.state === 'warn' || s.state === 'failed' ? s.weight : s.state === 'now' ? s.weight * (s.part ?? 0) : 0), 0);
  return Math.min(100, Math.round((done / total) * 100));
}

/**
 * Run the build. `update` is called after every change so the screen follows.
 */
export async function runBuild(
  inp: BuildInput,
  update: (steps: BuildStep[], say: string) => void,
): Promise<BuildResult> {
  let steps = planSteps(inp);
  const set = (key: string, patch: Partial<BuildStep>, say = '') => {
    steps = steps.map(s => (s.key === key ? { ...s, ...patch } : s));
    update(steps, say);
  };
  const result: BuildResult = { ok: false, projectId: '', fatal: '', created: { workflows: 0, activated: 0, products: 0 }, problems: [] };
  const { bp, state } = inp;
  const business = val(state, 'business');

  /* ── 1 · The business ── */
  set('profile', { state: 'now' }, business === 'website' ? 'I’m studying your website.' : business === 'upload' ? 'I’m reading the document you gave me.' : 'I’m getting your business details ready.');
  let portfolioId = business.startsWith('existing:') ? business.slice(9) : '';
  let companyName = inp.portfolios.find(p => p.id === portfolioId)?.name ?? '';
  let profileNote = '';
  if (!portfolioId) {
    let profile: Record<string, string> = {};
    let source: 'url' | 'manual' = 'manual';
    const site = val(state, 'website');
    if (business === 'website' && site) {
      source = 'url';
      if (inp.profileDraft?.companyName || inp.profileDraft?.description) profile = { ...inp.profileDraft, website: site };
      else {
        const r = await readPortfolioFromUrl(site);
        if (r.success && r.profile) profile = { ...r.profile, website: site };
        else profileNote = `Could not read the website (${r.error ?? 'no answer'}), so the profile starts from its name — add detail on the project later.`;
      }
      /* The fallbacks go *after* the spread. A reading that returned
         `companyName: ""` used to be spread over them, and the save was sent
         with no name at all — "A portfolio needs the client's name", at 35%. */
      profile = {
        ...profile,
        companyName: profile.companyName?.trim() || domainName(site) || 'My business',
        description: profile.description?.trim() || state.prompt.slice(0, 300),
        website: site,
      };
    } else if (business === 'upload') {
      if (inp.profileDraft?.companyName || inp.profileDraft?.description) profile = { ...inp.profileDraft };
      else {
        const docs = inp.files.filter(f => f.kind === 'pdf' || f.kind === 'text');
        const u = docs.length ? await understand({ prompt: 'Describe the business in the attached document.', files: docs, urls: [], candidates: [] }) : null;
        if (u?.ok && u.understanding?.profile?.companyName) profile = { ...u.understanding.profile };
        else profileNote = u?.noAi ? 'The document could not be read without the AI, so the profile starts almost empty — add detail on the project later.' : 'The document did not say enough to describe the business — add detail on the project later.';
      }
      profile = {
        ...profile,
        companyName: profile.companyName?.trim() || inp.workspace?.companyName || 'My business',
        description: profile.description?.trim() || state.prompt.slice(0, 300),
      };
    } else if (business === 'workspace' && inp.workspace) {
      profile = { companyName: inp.workspace.companyName, description: inp.workspace.description, website: inp.workspace.website };
    } else {
      profile = { companyName: val(state, 'bizName') || inp.workspace?.companyName || 'My business', description: val(state, 'bizWhat') || state.prompt.slice(0, 300), audience: val(state, 'bizWho') };
    }
    if (!profile.audience && val(state, 'audience')) profile.audience = val(state, 'audience');
    if (!profile.offer && val(state, 'offer')) profile.offer = val(state, 'offer');
    if (val(state, 'brandColor')) profile.brandColor = val(state, 'brandColor');
    companyName = profile.companyName;
    const r = await savePortfolio({ name: companyName.slice(0, 120), profile, source });
    if (!r.success || !r.id) {
      set('profile', { state: 'failed', detail: r.error ?? 'The business profile could not be saved.' });
      result.fatal = r.error ?? 'The business profile could not be saved, so there is nothing for the project to write from.';
      return result;
    }
    portfolioId = r.id;
    const services = (profile.offer ?? '').split(/,|;|\band\b/).map(x => x.trim()).filter(x => x.length > 2);
    set('profile', {
      state: profileNote ? 'warn' : 'done',
      detail: profileNote || (profile.description ? profile.description.slice(0, 160) : `Saved ${companyName}.`),
    }, services.length >= 2 ? `I found ${services.length} services — ${services.slice(0, 3).join(', ')}${services.length > 3 ? '…' : ''}.` : `I’ve got ${companyName}’s details.`);
  } else {
    set('profile', { state: 'done', detail: 'Already in Protected Central.' }, `I’m using ${companyName}’s profile.`);
  }

  /* ── 2 · The project ── */
  set('project', { state: 'now' }, 'I’m setting up the project.');
  const p = await saveProject({
    name: bp.name.trim().slice(0, 150) || 'Autopilot project',
    objective: bp.objective.trim().length >= 8 ? bp.objective.trim() : `${bp.objective.trim()} — set up with Autopilot`.slice(0, 400),
    portfolioId,
    kind: kindOf(bp),
    guardrails: guardrailsFor(capsOf(bp)),
    goals: [],
    launchSteps: launchStepsOf(bp),
    brief: briefOf(bp, state.prompt),
  });
  if (!p.success || !p.id) {
    set('project', { state: 'failed', detail: p.error ?? 'The project could not be saved.' });
    result.fatal = p.error ?? 'The project could not be saved.';
    return result;
  }
  result.projectId = p.id;
  set('project', { state: 'done', detail: bp.name });

  /* ── 3 · The workflows ── */
  const ids: Record<string, string> = {};
  for (const w of bp.workflows) {
    set(`wf:${w.key}`, { state: 'now' }, w.origin === 'ai' ? `I’m writing ${w.name} from your description.` : `I’m building ${w.name}.`);
    if (w.origin === 'ai') {
      const r = await buildWorkflow(p.id, w.instruction ?? w.purpose);
      if (r.ok) { result.created.workflows++; set(`wf:${w.key}`, { state: 'done', detail: r.message }); }
      else { result.problems.push(`${w.name}: ${r.message}`); set(`wf:${w.key}`, { state: 'warn', detail: `${r.message} You can add it from the project with Create Workflow.` }); }
      continue;
    }
    const r = await saveWorkflow(p.id, { name: w.name, description: w.purpose.slice(0, 300), status: 'draft', nodes: w.nodes ?? [] }, w.templateKey);
    if (r.success && r.id) {
      ids[w.key] = String(r.id);
      result.created.workflows++;
      set(`wf:${w.key}`, { state: 'done', detail: w.sends ? 'Saved as a draft — it waits for you to switch it on.' : w.schedule });
    } else {
      result.problems.push(`${w.name}: ${r.error ?? 'not saved'}`);
      set(`wf:${w.key}`, { state: 'warn', detail: r.error ?? 'The server did not save it.' });
    }
  }

  /* ── 4 · Switch on what only writes drafts ── */
  const agentFlows = bp.workflows.filter(w => isContentAgent(w) && ids[w.key]);
  if (steps.some(s => s.key === 'activate')) {
    set('activate', { state: 'now' }, 'I’m switching on the agents that only write drafts.');
    let on = 0;
    for (const w of agentFlows) {
      const r = await setWorkflowStatus(ids[w.key], 'active');
      if (r.success) on++;
    }
    result.created.activated = on;
    set('activate', {
      state: on === agentFlows.length && on > 0 ? 'done' : 'warn',
      detail: on === agentFlows.length && on > 0
        ? 'On. Everything they make is saved for you to check — nothing is published.'
        : `${on} of ${agentFlows.length} switched on. The rest can be switched on from the project.`,
    });
  }

  /* ── 5 · Products ── */
  if (steps.some(s => s.key === 'products')) {
    const plan = productPlan(inp);
    set('products', { state: 'now', part: 0 }, `I’m importing your products — 0 of ${plan.rows.length}.`);
    let made = 0; let withImage = 0; let noPrice = 0;
    const started = Date.now();
    for (let i = 0; i < plan.rows.length; i++) {
      const row = plan.rows[i];
      const img = imageFor(row, plan.images);
      if (!row.priceCents) noPrice++;
      const r = await saveProduct({
        name: row.name, sku: row.sku, description: row.description, priceCents: row.priceCents,
        compareAtCents: row.compareAtCents, category: row.category, inventory: row.inventory,
        trackInventory: row.inventory > 0 ? 1 : 0, imageUrl: img?.dataUrl ?? '', status: 'draft', projectId: p.id,
      });
      if (r.success) { made++; if (img) withImage++; }
      const per = (Date.now() - started) / (i + 1);
      const left = Math.round((per * (plan.rows.length - i - 1)) / 1000);
      set('products', {
        part: (i + 1) / plan.rows.length,
        detail: `${i + 1} of ${plan.rows.length}${left > 3 ? ` — about ${left < 60 ? `${left} seconds` : `${Math.ceil(left / 60)} minutes`} left` : ''}`,
      }, `I’m importing your products — ${i + 1} of ${plan.rows.length}.`);
    }
    result.created.products = made;
    set('products', {
      state: made === plan.rows.length ? 'done' : 'warn', part: 1,
      detail: [
        `${made} imported as drafts`,
        plan.images.length ? `${withImage} with a picture` : '',
        noPrice ? `${noPrice} without a price — set one before it goes live` : '',
        plan.missing.length ? `the sheet had no ${plan.missing.join(' or ')}` : '',
      ].filter(Boolean).join(' · '),
      link: { label: 'Open Products', route: '/sell' },
    });
  }

  /* ── 6 · The first one, now ── */
  if (steps.some(s => s.key === 'first')) {
    const w = agentFlows[0];
    const node = w?.nodes?.find(n => n.type === 'ai');
    const what = w?.channel === 'social' ? 'post' : w?.channel === 'blog' ? 'article' : 'draft';
    set('first', { state: 'now' }, `I’m making your first ${what} now, so you can see what you’ll get.`);
    if (w && node) {
      const r = await runAgent(p.id, ids[w.key], node.id);
      if (r.ok && r.link) {
        result.first = { label: r.link.label || `Your first ${what}`, route: r.link.route, detail: r.detail };
        set('first', { state: 'done', detail: r.detail, link: { label: `Open ${w.output?.label ?? 'it'}`, route: r.link.route } });
      } else {
        set('first', { state: 'warn', detail: `Not made yet: ${(r.detail || 'no answer').replace(/[.\s]+$/, '')}. It runs on its schedule regardless.` });
      }
    } else {
      set('first', { state: 'warn', detail: 'Skipped — the workflow was not saved.' });
    }
  }

  /* ── 7 · Check ── */
  set('validate', { state: 'now' }, 'I’m checking whether anything is missing.');
  const check = await fetchWorkflows(p.id);
  if (check.error) {
    set('validate', { state: 'warn', detail: `Could not read the project back to check it: ${check.error}` });
  } else {
    const n = check.workflows.length;
    const ok = n >= result.created.workflows;
    set('validate', {
      state: ok && !result.problems.length ? 'done' : 'warn',
      detail: `${n} workflow${n === 1 ? '' : 's'} on the project${result.problems.length ? ` · ${result.problems.length} step${result.problems.length === 1 ? '' : 's'} need you` : ''}.`,
    });
  }
  result.ok = true;
  update(steps, 'Your Autopilot is ready.');
  return result;
}
