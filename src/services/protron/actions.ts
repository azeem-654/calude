/**
 * What Protron may do — the whole list, and nothing outside it.
 *
 * ── Why a registry rather than "let the model drive the page" ──
 *
 * The model proposes; this file decides. Every reply from the AI is a sentence
 * plus a list of `{ name, args }` calls, and a call is carried out only when
 * its name is registered here, every argument passes its spec, the person
 * signed in may use the module it touches, and — for anything that writes or
 * spends — the person has pressed Confirm on a card that says what will
 * happen. A model that invents `send_campaign`, a route it read somewhere, or
 * an owner-only screen gets a refusal, not an action.
 *
 * Nothing here talks to the server on its own authority either. Each handler
 * calls the same client service the screen's own button calls (navigate,
 * AppContext's `addContact`, the Prospecting screen's `?q=` hand-off), so
 * the server's checks — `canAccess`, allowances, tenant scoping — apply to
 * Protron exactly as they apply to a click. The AI cannot reach past them
 * because it never holds anything but this list.
 *
 * ── The four tiers ──
 *
 *   read        moves around or reads what the screen already shows; runs at once
 *   reversible  changes a preference of Protron's own, or types into a form on
 *               screen without saving it (Undo puts it back); runs at once
 *   confirm     creates a record or spends an allowance; waits for Confirm
 *   sensitive   sends, publishes, deletes, charges — none is registered. Protron
 *               opens the screen and the customer presses the button there.
 *
 * ── Live, step by step ──
 *
 * A handler that does more than one thing reports each step as it starts and
 * ends (`steps`), and the card in the chat shows them ticking over while the
 * screen behind it changes — a pipeline's stages appear one at a time, a
 * form's boxes are typed into one at a time. Nothing is done out of sight.
 *
 * Adding an action: give it the narrowest tier that is true, a spec for every
 * argument, and a test in test/protron.test.mts.
 */
import { allModules, type NavItem } from '../../components/Layout/navModel';
import type { Step } from './memory';

export type Tier = 'read' | 'reversible' | 'confirm' | 'sensitive';

export interface Who {
  /** A client login (a reseller's customer): no agency screens. */
  isClient: boolean;
  /** The install owner — the only login that sees owner-only screens. */
  isOwner: boolean;
}

export type ParamSpec =
  | { type: 'string'; required?: boolean; max: number; desc: string }
  | { type: 'list'; required?: boolean; maxItems: number; maxEach: number; desc: string }
  | { type: 'boolean'; required?: boolean; desc: string }
  | { type: 'enum'; required?: boolean; values: (who: Who) => string[]; desc: string }
  /** Box key → value, for filling a form (keys are checked against the screen when it runs). */
  | { type: 'map'; required?: boolean; maxKeys: number; maxEach: number; desc: string };

export type Args = Record<string, string | string[] | boolean | Record<string, string>>;

export interface ActionResult {
  ok: boolean;
  /** What happened, in a sentence the customer reads. */
  message: string;
  /** Facts a read action hands back to the model for its answer (counts, never records). */
  data?: Record<string, number | string>;
  /** Boxes filled, with what was in them before — the card offers Undo. */
  undo?: { key: string; previous: string }[];
}

/** What a handler may touch. Passed in, so the registry stays testable without a page. */
export interface ActionCtx {
  who: Who;
  navigate: (path: string) => void;
  addContact?: (c: { name: string; email: string; phone: string; company?: string }) => void;
  /** Creates an empty pipeline and returns its id; `setStages` then gives it its stages. */
  createPipeline?: (name: string) => string;
  setStages?: (id: string, stages: string[]) => void;
  counts?: () => Record<string, number>;
  setProactive?: (on: boolean) => void;
  handOffToAutopilot?: (instruction: string) => void;
  /** Types a value into a box on screen (services/protron/screen.ts). */
  fill?: (key: string, value: string) => Promise<{ ok: boolean; label: string; previous: string; message?: string }>;
  /** Waits for a box to appear (a dialog still opening). */
  waitFor?: (key: string) => Promise<boolean>;
  /** The label of a box on screen, for the card's steps. */
  labelOf?: (key: string) => string;
  /** Tells a screen something (a window event it listens for). */
  signal?: (event: string, detail?: Record<string, unknown>) => void;
  /** The card's steps, as they change. */
  report?: (steps: Step[]) => void;
  wait?: (ms: number) => Promise<void>;
}

/** A handler's steps, reported to its card as each starts and ends. */
function stepsFor(ctx: ActionCtx, labels: string[]) {
  const list: Step[] = labels.map(label => ({ label, status: 'pending' }));
  const push = () => ctx.report?.(list.map(x => ({ ...x })));
  const set = (i: number, status: Step['status']) => { if (list[i]) { list[i].status = status; push(); } };
  push();
  return { run: (i: number) => set(i, 'running'), ok: (i: number) => set(i, 'done'), bad: (i: number) => set(i, 'failed') };
}
const pause = (ctx: ActionCtx, ms: number) => ctx.wait?.(ms) ?? Promise.resolve();

export interface ActionDef {
  name: string;
  /** Shown on the action card. */
  title: string;
  /** What the model is told the action does. */
  description: string;
  /** The screen it belongs to. */
  module: string;
  tier: Tier;
  params: Record<string, ParamSpec>;
  /** A reason it is refused for this login, or '' when it may run. */
  refusal?: (who: Who) => string;
  /** The confirm card's sentence. Required for `confirm`. */
  confirmText?: (a: Args) => string;
  /** Whether the result is given back to the model for a second answer. */
  feedsBack?: boolean;
  run: (a: Args, ctx: ActionCtx) => ActionResult | Promise<ActionResult>;
}

/* ── What the model may name ── */

/** Settings panels a login may open. Platform services is the owner's alone (Settings.tsx). */
export const SETTINGS_TABS: { id: string; label: string; what: string; ownerOnly?: boolean }[] = [
  { id: 'profile', label: 'Profile', what: 'your name, company, logo and time zone' },
  { id: 'email-sms', label: 'Email & SMS', what: 'connecting a mailbox (SMTP), Resend, Mailtrap or Twilio for sending' },
  { id: 'notifications', label: 'Notifications', what: 'which alerts reach you' },
  { id: 'api-validation', label: 'API Validation', what: 'checking third-party keys you have entered' },
  { id: 'integrations', label: 'Integrations', what: 'Google Calendar, WordPress and other connected services' },
  { id: 'billing', label: 'Billing', what: 'payment processors for your own shop and invoices' },
  { id: 'security', label: 'Security & Privacy', what: 'password, 2-step sign-in, sessions and data export' },
  { id: 'team', label: 'Team & Permissions', what: 'inviting teammates and what each may do' },
  { id: 'deliverability', label: 'Email Deliverability', what: 'SPF, DKIM, DMARC and sending reputation' },
  { id: 'infrastructure', label: 'Infrastructure', what: 'sending domains and mailbox pools' },
  { id: 'digital-setup', label: 'Domains & Email', what: 'buying a domain and a mailbox on it' },
  { id: 'platform', label: 'Platform services', what: 'the install owner\'s provider keys', ownerOnly: true },
];

export function settingsTabsFor(who: Who): string[] {
  return SETTINGS_TABS.filter(t => !t.ownerOnly || who.isOwner).map(t => t.id);
}

/** The modules this login may open, by their path without a query. */
export function modulesFor(who: Who): NavItem[] {
  return allModules(who.isClient, who.isOwner).filter(m => !m.path.includes('?'));
}

const modulePaths = (who: Who) => modulesFor(who).map(m => m.path);

/* ── The registry ── */

export const ACTIONS: ActionDef[] = [
  {
    name: 'open_module',
    title: 'Open a screen',
    description: 'Go to one of the product\'s screens. `path` must be one of the listed module paths.',
    module: 'navigation',
    tier: 'read',
    params: { path: { type: 'enum', required: true, values: modulePaths, desc: 'module path' } },
    run: (a, ctx) => {
      const m = modulesFor(ctx.who).find(x => x.path === a.path);
      ctx.navigate(String(a.path));
      return { ok: true, message: `Opened ${m?.label ?? a.path}.` };
    },
  },
  {
    name: 'open_settings',
    title: 'Open a Settings panel',
    description: 'Open one panel of Settings. `tab` must be one of the listed settings tabs.',
    module: '/settings',
    tier: 'read',
    params: { tab: { type: 'enum', required: true, values: settingsTabsFor, desc: 'settings tab id' } },
    run: (a, ctx) => {
      const t = SETTINGS_TABS.find(x => x.id === a.tab);
      ctx.navigate(a.tab === 'email-sms' ? '/settings' : `/settings?tab=${a.tab}`);
      return { ok: true, message: `Opened Settings → ${t?.label ?? a.tab}.` };
    },
  },
  {
    name: 'find_prospects',
    title: 'Search for prospects',
    description: 'Run an AI Prospecting search for businesses of a kind in a place, e.g. who="roofing companies", where="Dallas, TX". Uses one prospect search from the plan.',
    module: '/prospecting',
    tier: 'confirm',
    params: {
      who: { type: 'string', required: true, max: 80, desc: 'kind of business or person' },
      where: { type: 'string', required: false, max: 80, desc: 'city, region or country' },
    },
    confirmText: a => `Search AI Prospecting for ${a.who}${a.where ? ` in ${a.where}` : ''}? It uses one search from your plan, and the results open on the AI Prospecting screen.`,
    run: async (a, ctx) => {
      const q = `${a.who}${a.where ? ` in ${a.where}` : ''}`;
      const st = stepsFor(ctx, ['Open AI Prospecting', `Search for ${q}`]);
      st.run(0);
      ctx.navigate(`/prospecting?q=${encodeURIComponent(q)}`);
      await pause(ctx, 400);
      st.ok(0); st.run(1); await pause(ctx, 300); st.ok(1);
      return { ok: true, message: `Started the search for ${q} on AI Prospecting.` };
    },
  },
  {
    name: 'start_autopilot_project',
    title: 'Start a business workspace',
    description: 'Open the AI Autopilot "New business workspace" wizard with an instruction already written in its box. Nothing is saved until the customer builds it there.',
    module: '/autopilot',
    tier: 'read',
    params: { instruction: { type: 'string', required: true, max: 4000, desc: 'what the business workspace should do, written as the customer would' } },
    run: async (a, ctx) => {
      if (!ctx.handOffToAutopilot) return { ok: false, message: 'AI Autopilot could not be opened from here.' };
      const st = stepsFor(ctx, ['Open AI Autopilot', 'Open New business workspace', 'Write your instruction in its box']);
      st.run(0);
      ctx.handOffToAutopilot(String(a.instruction));
      await pause(ctx, 350); st.ok(0); st.run(1);
      await pause(ctx, 350); st.ok(1); st.run(2);
      await pause(ctx, 300); st.ok(2);
      return { ok: true, message: 'Opened the New business workspace wizard with your instruction in the box. Nothing is saved until you build it.' };
    },
  },
  {
    name: 'create_contact',
    title: 'Add a contact',
    description: 'Add one person to Contacts. Needs a name and an email or a phone number the customer actually gave.',
    module: '/contacts',
    tier: 'confirm',
    params: {
      name: { type: 'string', required: true, max: 120, desc: 'full name' },
      email: { type: 'string', required: false, max: 160, desc: 'email address' },
      phone: { type: 'string', required: false, max: 40, desc: 'phone number' },
      company: { type: 'string', required: false, max: 120, desc: 'company' },
    },
    confirmText: a => `Add ${a.name}${a.company ? ` (${a.company})` : ''} to Contacts${a.email ? ` with ${a.email}` : ''}${a.phone ? `${a.email ? ' and' : ' with'} ${a.phone}` : ''}?`,
    run: (a, ctx) => {
      if (!ctx.addContact) return { ok: false, message: 'Contacts are not available here.' };
      const email = String(a.email ?? '').trim();
      const phone = String(a.phone ?? '').trim();
      if (!email && !phone) return { ok: false, message: 'A contact needs an email address or a phone number.' };
      if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email)) return { ok: false, message: `“${email}” is not an email address.` };
      ctx.addContact({ name: String(a.name).trim(), email, phone, company: String(a.company ?? '').trim() || undefined });
      return { ok: true, message: `Added ${a.name} to Contacts.` };
    },
  },
  {
    name: 'create_pipeline',
    title: 'Create a deals pipeline',
    description: 'Create a new pipeline in Deals with the given stages, in order (2 to 8 short stage names).',
    module: '/pipelines',
    tier: 'confirm',
    params: {
      name: { type: 'string', required: true, max: 60, desc: 'pipeline name' },
      stages: { type: 'list', required: true, maxItems: 8, maxEach: 40, desc: 'stage names in order' },
    },
    confirmText: a => `Create the pipeline “${a.name}” in Deals with ${(a.stages as string[]).length} stages: ${(a.stages as string[]).join(' → ')}?`,
    run: async (a, ctx) => {
      if (!ctx.createPipeline || !ctx.setStages) return { ok: false, message: 'Deals are not available here.' };
      const stages = (a.stages as string[]).map(s => s.trim()).filter(Boolean);
      if (stages.length < 2) return { ok: false, message: 'A pipeline needs at least two stages.' };
      const name = String(a.name).trim();
      /* Built on the Deals screen in front of the customer: the board first,
         then each stage as it is added. */
      const st = stepsFor(ctx, ['Open Deals', `Create “${name}”`, ...stages.map(x => `Add the stage “${x}”`)]);
      st.run(0);
      ctx.navigate('/pipelines');
      await pause(ctx, 600);
      st.ok(0); st.run(1);
      const id = ctx.createPipeline(name);
      await pause(ctx, 150);
      ctx.signal?.('pc-protron-show-pipeline', { id });
      await pause(ctx, 350);
      st.ok(1);
      for (let i = 0; i < stages.length; i++) {
        st.run(i + 2);
        ctx.setStages(id, stages.slice(0, i + 1));
        await pause(ctx, 420);
        st.ok(i + 2);
      }
      return { ok: true, message: `Built “${name}” in Deals with ${stages.length} stages — it is the board on screen.` };
    },
  },
  {
    name: 'fill_form',
    title: 'Fill in the form on screen',
    description: 'Type values into the boxes of the form the customer has open, one box at a time while they watch. `fields` maps a box key listed under SCREEN to its value. It never saves or sends: the customer checks it and presses the screen\'s own button. Use only keys listed under SCREEN; never invent an email address, phone number or price — use what the customer gave, or copy they asked you to write.',
    module: 'screen',
    tier: 'reversible',
    params: { fields: { type: 'map', required: true, maxKeys: 15, maxEach: 4000, desc: 'box key → value' } },
    run: async (a, ctx) => {
      if (!ctx.fill) return { ok: false, message: 'There is no form here I can reach.' };
      const fields = Object.entries(a.fields as Record<string, string>);
      const st = stepsFor(ctx, fields.map(([k]) => `Fill “${ctx.labelOf?.(k) || k}”`));
      const undo: { key: string; previous: string }[] = [];
      const missed: string[] = [];
      for (let i = 0; i < fields.length; i++) {
        const [k, v] = fields[i];
        st.run(i);
        const out = await ctx.fill(k, v);
        if (out.ok) { st.ok(i); undo.push({ key: k, previous: out.previous }); } else { st.bad(i); missed.push(`${out.label}: ${out.message ?? 'not filled'}`); }
      }
      if (!undo.length) return { ok: false, message: missed[0] ?? 'None of those boxes is on this screen.' };
      return {
        ok: true, undo,
        message: `Filled ${undo.length} of ${fields.length} boxes.${missed.length ? ` Not filled — ${missed.join('; ')}.` : ''} Check them, then press the screen's own button to save or send.`,
      };
    },
  },
  {
    name: 'draft_social_post',
    title: 'Draft a social post design',
    description: 'Open Graphics Designer → Create with AI and type a design brief into it in front of the customer: what the post shows and the words on it. The customer presses Generate there (that uses the AI). `prompt` is the full brief; `name` a short design name.',
    module: '/social-creator',
    tier: 'reversible',
    params: {
      prompt: { type: 'string', required: true, max: 1000, desc: 'the design brief: look, colours and the exact words on the post' },
      name: { type: 'string', required: false, max: 60, desc: 'design name' },
    },
    refusal: who => (modulePaths(who).includes('/social-creator') ? '' : 'Graphics Designer is not part of this login.'),
    run: async (a, ctx) => {
      if (!ctx.fill || !ctx.waitFor) return { ok: false, message: 'Graphics Designer could not be reached from here.' };
      const st = stepsFor(ctx, ['Open Graphics Designer & Editor', 'Open Create with AI', 'Name the design', 'Write the design brief']);
      st.run(0);
      ctx.navigate('/social-creator?compose=ai');
      await pause(ctx, 500);
      st.ok(0); st.run(1);
      ctx.signal?.('pc-protron-compose');
      if (!(await ctx.waitFor('social.aiPrompt'))) { st.bad(1); return { ok: false, message: 'Create with AI did not open. Press “Create with AI” on Graphics Designer and ask me again.' }; }
      st.ok(1);
      const undo: { key: string; previous: string }[] = [];
      st.run(2);
      const named = await ctx.fill('social.designName', String(a.name || 'Post by Protron'));
      if (named.ok) { st.ok(2); undo.push({ key: 'social.designName', previous: named.previous }); } else st.bad(2);
      st.run(3);
      const brief = await ctx.fill('social.aiPrompt', String(a.prompt));
      if (!brief.ok) { st.bad(3); return { ok: false, message: brief.message ?? 'The brief could not be written in.' }; }
      st.ok(3);
      undo.push({ key: 'social.aiPrompt', previous: brief.previous });
      return { ok: true, undo, message: 'The brief is in Graphics Designer → Create with AI. Choose the platform and size, then press Generate — that is your button.' };
    },
  },
  {
    name: 'workspace_overview',
    title: 'Look at your workspace',
    description: 'Count what is in this workspace (contacts, deals, pipelines, campaigns, websites, funnels) to answer a question about it. Returns numbers only.',
    module: '/',
    tier: 'read',
    feedsBack: true,
    params: {},
    run: (_a, ctx) => {
      const data = ctx.counts?.() ?? {};
      return { ok: true, message: 'Looked at your workspace.', data };
    },
  },
  {
    name: 'set_proactive_help',
    title: 'Proactive help',
    description: 'Turn Protron\'s offers of help (when somebody seems stuck) on or off.',
    module: 'protron',
    tier: 'reversible',
    params: { on: { type: 'boolean', required: true, desc: 'true to offer help, false to stay quiet' } },
    run: (a, ctx) => {
      ctx.setProactive?.(a.on === true);
      return { ok: true, message: a.on ? 'I will offer help when you seem stuck. You can turn it off again here.' : 'I will stay quiet unless you open me.' };
    },
  },
];

export const actionByName = (name: string): ActionDef | undefined => ACTIONS.find(a => a.name === name);

/* ── Checking a call before anything happens ── */

export type Checked =
  | { ok: true; def: ActionDef; args: Args }
  | { ok: false; error: string };

/**
 * A call from the model, checked. Unknown names, unknown or malformed
 * arguments, values outside an enum and modules this login cannot see are all
 * refused here — the handler only ever sees arguments that passed.
 */
export function checkCall(call: unknown, who: Who): Checked {
  if (!call || typeof call !== 'object') return { ok: false, error: 'That was not an action.' };
  const { name, args } = call as { name?: unknown; args?: unknown };
  const def = typeof name === 'string' ? actionByName(name) : undefined;
  if (!def) return { ok: false, error: `“${String(name).slice(0, 40)}” is not something I can do from here.` };
  if (def.tier === 'sensitive') return { ok: false, error: `${def.title} has to be done by you on its own screen.` };
  const why = def.refusal?.(who) ?? '';
  if (why) return { ok: false, error: why };
  const raw = (args && typeof args === 'object' && !Array.isArray(args) ? args : {}) as Record<string, unknown>;
  for (const k of Object.keys(raw)) if (!def.params[k]) return { ok: false, error: `${def.title}: “${k.slice(0, 30)}” is not one of its settings.` };
  const out: Args = {};
  for (const [k, spec] of Object.entries(def.params)) {
    const v = raw[k];
    if (v === undefined || v === null || v === '') {
      if (spec.required) return { ok: false, error: `${def.title} needs ${spec.desc}.` };
      continue;
    }
    switch (spec.type) {
      case 'string': {
        if (typeof v !== 'string' && typeof v !== 'number') return { ok: false, error: `${def.title}: ${spec.desc} must be text.` };
        const s = String(v).replace(/\p{Cc}/gu, ' ').trim();
        if (!s && spec.required) return { ok: false, error: `${def.title} needs ${spec.desc}.` };
        if (s.length > spec.max) return { ok: false, error: `${def.title}: ${spec.desc} is too long.` };
        if (s) out[k] = s;
        break;
      }
      case 'list': {
        if (!Array.isArray(v) || !v.every(x => typeof x === 'string')) return { ok: false, error: `${def.title}: ${spec.desc} must be a list.` };
        const items = (v as string[]).map(x => x.trim()).filter(Boolean);
        if (items.length > spec.maxItems) return { ok: false, error: `${def.title}: at most ${spec.maxItems} ${spec.desc}.` };
        if (items.some(x => x.length > spec.maxEach)) return { ok: false, error: `${def.title}: one of the ${spec.desc} is too long.` };
        if (!items.length && spec.required) return { ok: false, error: `${def.title} needs ${spec.desc}.` };
        out[k] = items;
        break;
      }
      case 'boolean':
        if (typeof v !== 'boolean') return { ok: false, error: `${def.title}: ${spec.desc} must be true or false.` };
        out[k] = v;
        break;
      case 'map': {
        if (typeof v !== 'object' || Array.isArray(v)) return { ok: false, error: `${def.title}: ${spec.desc} must be a set of boxes and values.` };
        const entries = Object.entries(v as Record<string, unknown>);
        if (entries.length > spec.maxKeys) return { ok: false, error: `${def.title}: at most ${spec.maxKeys} boxes at a time.` };
        const m: Record<string, string> = {};
        for (const [k, x] of entries) {
          if (!/^[\w.-]{1,80}$/.test(k)) return { ok: false, error: `${def.title}: “${k.slice(0, 30)}” is not a box on this screen.` };
          if (typeof x !== 'string' && typeof x !== 'number' && typeof x !== 'boolean') return { ok: false, error: `${def.title}: the value for “${k.slice(0, 30)}” must be text.` };
          const t = String(x).replace(/[^\P{Cc}\n\t]/gu, '');
          if (t.length > spec.maxEach) return { ok: false, error: `${def.title}: the value for “${k.slice(0, 30)}” is too long.` };
          m[k] = t;
        }
        if (!Object.keys(m).length && spec.required) return { ok: false, error: `${def.title} needs ${spec.desc}.` };
        out[k] = m;
        break;
      }
      case 'enum': {
        const allowed = spec.values(who);
        if (typeof v !== 'string' || !allowed.includes(v)) return { ok: false, error: `${def.title}: “${String(v).slice(0, 60)}” is not one you can open.` };
        out[k] = v;
        break;
      }
    }
  }
  return { ok: true, def, args: out };
}

/** Whether a checked call waits for the customer's Confirm. */
export const needsConfirm = (def: ActionDef): boolean => def.tier === 'confirm' || def.tier === 'sensitive';

/** Runs a checked call. Confirm-tier calls must have been confirmed by the caller. */
export async function runChecked(c: Extract<Checked, { ok: true }>, ctx: ActionCtx, confirmed: boolean): Promise<ActionResult> {
  if (needsConfirm(c.def) && !confirmed) return { ok: false, message: `${c.def.title} is waiting for you to confirm.` };
  try {
    return await c.def.run(c.args, ctx);
  } catch (e) {
    return { ok: false, message: `${c.def.title} did not finish: ${e instanceof Error ? e.message : String(e)}` };
  }
}

/** The registry as the model reads it: names, what each does, its arguments and allowed values. */
export function describeActions(who: Who): string {
  return ACTIONS.filter(a => a.tier !== 'sensitive' && !(a.refusal?.(who))).map(a => {
    const params = Object.entries(a.params).map(([k, s]) => {
      const kind = s.type === 'enum' ? `one of ${JSON.stringify(s.values(who))}` : s.type === 'list' ? 'list of text' : s.type === 'map' ? 'object of box key → text' : s.type;
      return `${k}${s.required ? '' : '?'}: ${kind} — ${s.desc}`;
    });
    return `- ${a.name}(${params.join('; ')}): ${a.description}${a.tier === 'confirm' ? ' [the customer confirms first]' : ''}`;
  }).join('\n');
}
