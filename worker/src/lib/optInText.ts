/**
 * The words that offer a found business texts instead of email.
 *
 * Kept here, apart from smsConsent.ts, so it stays pure: the planner's sequence
 * writer (autopilotTick.ts) appends it, and the wizard writes the same line
 * into its outreach emails (src/services/projectSolutions.ts, `OPT_IN_PS`).
 * `npm run test:finder` fails if the two copies drift — a customer who sees two
 * different offers in one project's emails would reasonably ask which is meant.
 */
export const OPT_IN_PS = 'P.S. Would a text be easier? Say yes here and we will text you instead: {{smsOptInLink}}';

/** The wizard's texting workflow, by name — how a brief written before `smsOptIn` existed says texts were asked for. */
export const OPT_IN_WORKFLOW = 'Text the prospects who opt in';

/** Whether a project's approved brief asked for texts to the prospects who opt in. */
export function briefWantsOptIn(brief: unknown): boolean {
  if (!brief || typeof brief !== 'object') return false;
  const b = brief as { smsOptIn?: unknown; workflows?: { name?: unknown }[] };
  if (b.smsOptIn === true) return true;
  return Array.isArray(b.workflows) && b.workflows.some(w => w?.name === OPT_IN_WORKFLOW);
}

/** A body with the offer once at the end — never twice, and never into a body that already carries the link. */
export function withOptIn(body: string): string {
  if (/\{\{\s*smsOptInLink\s*\}\}/.test(body)) return body;
  return `${body.trimEnd()}\n\n${OPT_IN_PS}`;
}
