/**
 * A business's next twelve months of marketing, as twelve themes.
 *
 * Pure, no imports: the Worker writes the plan (routes/intake.ts `plan_year`)
 * and the agents read this month's theme from it (lib/projectAgents.ts);
 * the browser re-exports it (src/services/marketingYear.ts) for the AI
 * Autopilot blueprint and the business workspace's Overview.
 *
 * ── The universal plan ──
 *
 * `UNIVERSAL_YEAR` is the ready-made plan any business fits: a plumber, a
 * shop, a clinic and a consultancy all have something to say under every one
 * of these themes, because each theme is about what *every* business has —
 * who it is, what people ask it, how it works, what it has done, who it
 * serves. It is offered as a template in its own right, and it is what the
 * wizard shows when the AI cannot write a tailored plan, *labelled as the
 * universal plan with the reason* — never passed off as written for them
 * (the setup wizard used to label exactly that "AI generated"'s neighbour,
 * "smart templates", with no reason given).
 *
 * Nothing in it invents a figure, a result or a testimonial: where a theme
 * needs proof (customer stories, reviews), the idea is to *ask* customers.
 */

export interface PlanMonth {
  /** Calendar month, YYYY-MM. */
  month: string;
  theme: string;
  /** One or two sentences: what the month's content is for. */
  focus: string;
  /** Three or four concrete things to make. */
  ideas: string[];
}

export interface MarketingYear {
  months: PlanMonth[];
  /** `ai`: written for this business. `universal`: the ready-made plan. */
  source: 'ai' | 'universal';
  /** When `universal` was used in place of a tailored plan: why. */
  note: string;
  createdAt: string;
}

/** The ready-made twelve, in order from the month the plan starts. */
export const UNIVERSAL_YEAR: { theme: string; focus: string; ideas: string[] }[] = [
  { theme: 'Who we are', focus: 'Introduce the business: who runs it, what it does, who it is for, and why it does it its way.',
    ideas: ['The story of how the business started', 'What we do, in one plain paragraph', 'A day behind the scenes', 'Who we help best — and who we are not for'] },
  { theme: 'Your questions, answered', focus: 'Answer the questions customers ask before they buy, so the next one finds the answer without asking.',
    ideas: ['The five questions we hear most', 'What it costs and why (our approach to pricing)', 'How long it takes', 'What to have ready before you contact us'] },
  { theme: 'How it works', focus: 'Walk people through what happens from first contact to finished job, so buying feels safe.',
    ideas: ['Our process, step by step', 'What happens on the first call or visit', 'What we need from you', 'What you get at the end'] },
  { theme: 'Useful know-how', focus: 'Teach something genuinely useful in your field, free — the reason people follow and remember you.',
    ideas: ['A short how-to guide', 'A checklist people can save', 'Three mistakes to avoid', 'A tip of the week series'] },
  { theme: 'Customer stories', focus: 'Show real work for real customers. Ask customers whether you may share their story — never write one for them.',
    ideas: ['Ask three happy customers if you may feature them', 'A before-and-after of a recent job (with permission)', 'Why a customer chose us, in their words', 'A thank-you post to a loyal customer'] },
  { theme: 'Mid-year offer', focus: 'One clear offer for the middle of the year, chosen by you, with a date it ends.',
    ideas: ['Announce the offer and who it is for', 'A reminder halfway through', 'Last-chance message before it ends', 'Thank everyone who took it up'] },
  { theme: 'Meet the team', focus: 'Put faces and names to the business. People buy from people they feel they know.',
    ideas: ['Introduce a team member (or yourself)', 'What a typical week looks like', 'The tools or skills behind the work', 'Why we love what we do'] },
  { theme: 'Myths and mistakes', focus: 'Clear up what people get wrong about your field, and show you know it inside out.',
    ideas: ['Three myths about what we do', 'The most expensive mistake we see', 'What the cheap option leaves out', 'Questions to ask any provider before you hire them'] },
  { theme: 'Reviews and trust', focus: 'Make it easy for happy customers to leave a review, and show the ones you have.',
    ideas: ['Ask recent customers for a review, with the link', 'Share a real review you received', 'How we handle it when something goes wrong', 'Our promise to customers'] },
  { theme: 'Getting ready for the busy season', focus: 'Help customers prepare for the season ahead, and be the business they think of first when it arrives.',
    ideas: ['What to do before the season starts', 'Book early — what is available and when', 'A seasonal checklist', 'What we are doing to prepare'] },
  { theme: 'Thank you', focus: 'Thank customers and the community that kept the business going this year.',
    ideas: ['A thank-you message to every customer', 'A small loyalty reward or early-booking perk', 'Something we did for the local community', 'The people who helped us this year'] },
  { theme: 'Year in review, and what is next', focus: 'Look back at the year honestly and say what is coming, so customers have a reason to stay in touch.',
    ideas: ['What we learned this year', 'What is new next year', 'Our plans and dates for the months ahead', 'An invitation to stay on our list'] },
];

/** YYYY-MM for the month `offset` months after `start`. */
export function monthKey(start: Date, offset: number): string {
  const d = new Date(Date.UTC(start.getUTCFullYear(), start.getUTCMonth() + offset, 1));
  return d.toISOString().slice(0, 7);
}

/** The universal plan, starting this month. */
export function universalYear(start = new Date(), note = ''): MarketingYear {
  return {
    months: UNIVERSAL_YEAR.map((m, i) => ({ month: monthKey(start, i), theme: m.theme, focus: m.focus, ideas: [...m.ideas] })),
    source: 'universal', note, createdAt: start.toISOString(),
  };
}

const str = (v: unknown, max: number) => String(v ?? '').replace(/\s+/g, ' ').trim().slice(0, max);

/**
 * What the model returned, checked — twelve months, each with a theme and a
 * focus — or null. A month the model left out is filled from the universal
 * plan at that position, so a reply with eleven good months is not thrown away.
 */
export function cleanYear(raw: unknown, start = new Date()): PlanMonth[] | null {
  const list = (raw as { months?: unknown })?.months;
  if (!Array.isArray(list) || list.length < 6) return null;
  const out: PlanMonth[] = [];
  for (let i = 0; i < 12; i++) {
    const m = list[i] as { theme?: unknown; focus?: unknown; ideas?: unknown } | undefined;
    const theme = str(m?.theme, 80);
    const focus = str(m?.focus, 400);
    const ideas = Array.isArray(m?.ideas) ? (m!.ideas as unknown[]).map(x => str(x, 140)).filter(Boolean).slice(0, 5) : [];
    const u = UNIVERSAL_YEAR[i];
    out.push(theme && focus
      ? { month: monthKey(start, i), theme, focus, ideas: ideas.length ? ideas : [...u.ideas] }
      : { month: monthKey(start, i), theme: u.theme, focus: u.focus, ideas: [...u.ideas] });
  }
  return out;
}

/** The prompt for a tailored plan. Business facts only; the rules forbid inventing any. */
export function yearPrompt(b: { companyName: string; description: string; audience?: string; offer?: string; location?: string; goals?: string }, start = new Date()): string {
  const clean = (t: string | undefined, max: number) => str(t, max).replace(/[`$\\]/g, '');
  const first = new Date(Date.UTC(start.getUTCFullYear(), start.getUTCMonth(), 1)).toLocaleString('en-GB', { month: 'long', year: 'numeric', timeZone: 'UTC' });
  return `Plan twelve months of marketing content for this business, starting ${first}.

Business: ${clean(b.companyName, 120) || 'not named'}
What it does: ${clean(b.description, 1200) || 'not described'}
${b.audience ? `Who it serves: ${clean(b.audience, 300)}\n` : ''}${b.offer ? `What it sells or offers: ${clean(b.offer, 300)}\n` : ''}${b.location ? `Where: ${clean(b.location, 120)}\n` : ''}${b.goals ? `What the owner wants from marketing: ${clean(b.goals, 300)}\n` : ''}
Rules:
- One theme per month, in calendar order from ${first}. Use the seasons and the business's own busy and quiet times where they are obvious from what it does.
- Each month: a short theme (under eight words), a focus of one or two plain sentences, and three or four concrete pieces of content to make.
- Never invent facts about the business: no awards, years in business, prices, results, statistics or customer quotes. Where proof would help, the idea is to ask customers for it.
- No hype, no emoji.

Reply with JSON only:
{"months": [{"theme": "", "focus": "", "ideas": ["", "", ""]}]}`;
}

/**
 * This month's theme from a stored plan (an agent step's `monthPlan`), or
 * null. Past the plan's last month it keeps the last one rather than nothing:
 * the plan is a guide, and a business that has not planned year two yet still
 * gets written for.
 */
export function monthThemeOf(raw: string, now = new Date()): { theme: string; focus: string } | null {
  if (!raw) return null;
  try {
    const plan = JSON.parse(raw) as PlanMonth[];
    if (!Array.isArray(plan) || !plan.length) return null;
    const key = now.toISOString().slice(0, 7);
    const hit = plan.find(m => m.month === key) ?? [...plan].reverse().find(m => m.month <= key) ?? plan[0];
    return hit?.theme ? { theme: str(hit.theme, 80), focus: str(hit.focus, 400) } : null;
  } catch { return null; }
}
