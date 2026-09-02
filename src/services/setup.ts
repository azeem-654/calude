/**
 * What is left to set up, worked out from what is actually there.
 *
 * The app had one wizard, and it was the AI onboarding one: it opened by itself
 * on first sign-in, asked about the business, and planned a year of content.
 * Useful, and the wrong first thing to meet. A new workspace cannot send an
 * email — no mailbox, no sending domain, no contacts — so the first screen a
 * customer saw was a content planner for a product that could not yet do
 * anything, and everything it needed to work was somewhere else in Settings
 * with nothing pointing at it.
 *
 * This is the whole setup instead, one step at a time.
 *
 * No step stores "I am done". Each one reads the thing it is about — is there a
 * mailbox, is there an SPF record, are there contacts — so the list is right
 * however the work got done. Somebody who configures their mailbox directly in
 * Settings has finished that step, and a step whose data is later deleted goes
 * back to outstanding rather than staying ticked because a flag says so.
 */
import { loadOnboarding } from './onboarding';
import { isEmailConfigured } from './emailService';
import { loadSettings } from './deliverability';
import { activeBranding, activeAccount } from './tenancy';

export type StepState = 'done' | 'todo' | 'partial';

export interface SetupStep {
  id: string;
  /** "Add your company portfolio" — an instruction, not a noun. */
  title: string;
  /** One line on why it is worth doing. */
  why: string;
  /** Where to go and do it. */
  route: string;
  /** The button that takes you there. */
  action: string;
  state: StepState;
  /** What is missing, when something is. Shown under the title. */
  detail: string;
  /**
   * True when nothing downstream can work until this is done. A workspace with
   * no mailbox cannot send whatever else is configured, so the list says so
   * rather than letting somebody build a campaign that can never go out.
   */
  blocking: boolean;
}

/*
 * Count rows in a list without pulling the whole module in.
 *
 * Plain localStorage is already per-workspace: installTenantStorage() rewrites
 * every `crm_*` key to the active account's prefix before it reaches storage,
 * so reading `crm_contacts` here reads this workspace's contacts and no other's.
 */
function countList(key: string): number {
  try {
    const raw = window.localStorage.getItem(key);
    const list = raw ? JSON.parse(raw) : [];
    return Array.isArray(list) ? list.length : 0;
  } catch {
    return 0;
  }
}

/**
 * The steps, in the order they unblock each other.
 *
 * Portfolio first because every later step is better for having it — the agent
 * writes from it, the brand defaults from it. Mailbox and domain next, because
 * they are what makes sending possible at all. Contacts, then the first
 * campaign, which is the point of the other five.
 */
export function setupSteps(): SetupStep[] {
  const ob = loadOnboarding();
  const p = ob.profile ?? { companyName: '', industry: '', description: '', audience: '', website: '' };
  const brand = activeBranding();
  const account = activeAccount();
  const deliver = loadSettings();

  const portfolioFilled = [p.companyName, p.industry, p.description, p.audience].filter(v => (v ?? '').trim().length > 1).length;

  const contacts = countList('crm_contacts');
  /* A business flow that has run counts: it creates a sequence and an SMS
     campaign, so the step it ticks is the one about having a campaign. */
  const campaigns = countList('crm_campaigns') + countList('crm_ai_campaigns') + countList('crm_flow_runs');

  const mailbox = isEmailConfigured();
  const domain = (deliver.sendingDomain ?? '').trim();

  /*
   * Branding counts as done once it is *chosen* rather than inherited.
   *
   * The default product name is ours, not this customer's — and the workspace
   * every browser gets on first run is created with `businessName: 'My
   * Business'`, which is a placeholder wearing a real value's clothes. Counting
   * either as "branded" ticked the step on a workspace where nobody had chosen
   * anything, which is exactly the sort of false green this checklist exists to
   * avoid. tenancy.ts already refuses to sign mail with that name for the same
   * reason.
   */
  const chosenName = (account?.branding?.appName ?? '').trim();
  const businessName = (account?.businessName ?? '').trim();
  const placeholder = /^(my business|main workspace)$/i;
  const branded = Boolean(
    chosenName
    || (brand.logoUrl ?? '').trim()
    || (businessName && !placeholder.test(businessName)),
  );

  return [
    {
      id: 'portfolio',
      title: 'Add your company portfolio',
      why: 'What you sell and who you sell it to. Everything the agent writes comes from this.',
      /* The AI onboarding wizard opens by asking exactly these four things, so
         that is where this step goes rather than a Settings panel duplicating
         them. SetupChecklist opens it as a modal. */
      route: '/settings?tab=profile',
      action: 'Add your details',
      state: portfolioFilled >= 4 ? 'done' : portfolioFilled > 0 ? 'partial' : 'todo',
      detail: portfolioFilled >= 4
        ? p.companyName
        : portfolioFilled > 0
          ? `${portfolioFilled} of 4 filled in — name, industry, what you sell, who you sell to`
          : 'Nothing yet',
      blocking: false,
    },
    {
      id: 'mailbox',
      title: 'Configure your mailbox',
      why: 'Your own SMTP sends and your own IMAP reads the replies. Nothing goes out until this works.',
      route: '/settings?tab=email-sms',
      action: 'Connect a mailbox',
      state: mailbox ? 'done' : 'todo',
      detail: mailbox ? 'Connected and tested' : 'No mailbox connected — nothing can send',
      blocking: true,
    },
    {
      id: 'domain',
      title: 'Set your sending domain',
      why: 'SPF, DKIM and DMARC on your own domain are what keep your mail out of spam.',
      /* Infrastructure rather than Deliverability: this is the screen that can
         actually buy the domain, read what is live and write the missing
         records, and naming the domain there sets it for the workspace. */
      route: '/settings?tab=infrastructure',
      action: 'Set the domain',
      state: domain ? 'done' : 'todo',
      detail: domain || 'Not set — mail will be sent unauthenticated',
      blocking: true,
    },
    {
      id: 'brand',
      title: 'Put your name on it',
      why: 'The product name, logo and colour your clients see when they log in.',
      route: '/settings?tab=branding',
      action: 'Set your brand',
      state: branded ? 'done' : 'todo',
      detail: branded ? (chosenName || businessName || 'Branded') : 'Still showing the default name',
      blocking: false,
    },
    {
      id: 'contacts',
      title: 'Bring in your contacts',
      why: 'Import a list or add the first few by hand. Duplicates are merged on the way in.',
      route: '/contacts',
      action: contacts > 0 ? 'Add more' : 'Import a list',
      state: contacts > 0 ? 'done' : 'todo',
      detail: contacts > 0 ? `${contacts} contact${contacts === 1 ? '' : 's'}` : 'No contacts yet',
      blocking: false,
    },
    {
      id: 'campaign',
      title: 'Plan your first campaign',
      why: 'Pick the outcome you want. Everything — emails, texts, posts, the blog, the landing page — is written from your portfolio and shown to you before anything is created.',
      route: '/ai-sales-agent',
      action: campaigns > 0 ? 'Open campaigns' : 'Pick an outcome',
      state: campaigns > 0 ? 'done' : 'todo',
      detail: campaigns > 0 ? `${campaigns} campaign${campaigns === 1 ? '' : 's'}` : 'None yet',
      blocking: false,
    },
  ];
}

export interface SetupProgress {
  steps: SetupStep[];
  done: number;
  total: number;
  /** The first step that is not finished — what the card leads with. */
  next: SetupStep | null;
  /** Everything that must work before the product can send anything. */
  blockers: SetupStep[];
  complete: boolean;
}

export function setupProgress(): SetupProgress {
  const steps = setupSteps();
  const done = steps.filter(s => s.state === 'done').length;
  return {
    steps,
    done,
    total: steps.length,
    next: steps.find(s => s.state !== 'done') ?? null,
    blockers: steps.filter(s => s.blocking && s.state !== 'done'),
    complete: done === steps.length,
  };
}

/* ── Dismissal ────────────────────────────────────────────────────────── */

/*
 * The card can be put away, and that *is* a stored flag — unlike the steps
 * themselves, "I do not want to look at this" is not derivable from anything.
 * It is per workspace, so setting up one client does not hide the checklist in
 * the next one, which still has all six to do.
 */
const HIDDEN_KEY = 'crm_setup_hidden';

export function setupHidden(): boolean {
  try { return window.localStorage.getItem(HIDDEN_KEY) === '1'; } catch { return false; }
}

export function hideSetup(hidden: boolean) {
  try { window.localStorage.setItem(HIDDEN_KEY, hidden ? '1' : '0'); }
  catch { /* private mode; the card simply comes back next time */ }
}
