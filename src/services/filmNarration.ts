/**
 * The words of "See AI Autopilot work" (Dashboard/AutopilotFilm.tsx), in one
 * pure module the Worker imports too.
 *
 * Why the Worker reads it: the owner asked for the film's narrator to sound
 * exactly like Protron's live voice, not the browser's own (2026-11-12). That
 * voice is an AI voice, made on the server, one AI request a line. The film's
 * lines are the same for everybody, so each is made once per install and
 * kept (routes/protron.ts `narrate`, R2 `narration/`), and the server only
 * makes or serves a line that is in `filmLines()` — it is not a free
 * text-to-speech door, and nobody's own words end up in a shared store.
 *
 * Pure data: no imports, no DOM, nothing Workers lack.
 */

export const FILM_SAY = {
  intro: 'This is AI Autopilot. Tell it what you want, and it finds customers, follows up, books the work and gets you paid.',
  usual: 'The usual way is a dozen jobs done by hand. With Autopilot you say it once, and it runs every step, asking you before anything important goes out.',
  live: 'Talk to it live, one to one. While you are still speaking, Protron is already building the workflow.',
  ways: 'Type it, record it, or just talk. Whichever is easiest for you.',
  step1: 'Step one. Open AI Autopilot and press Talk live — or Record, or simply type.',
  step2: 'Step two. Say what your business does and what you want from it.',
  step3: 'Step three. Protron asks a few short questions — where your customers are, your offer, your website.',
  step4: 'Step four. It writes your smart prompt and the plan, in plain words you can change.',
  step5: 'Step five. It builds the workflow, one step at a time, and you can watch every step.',
  step6: 'Step six. Choose what needs your OK, then switch it on. It runs in the cloud every few minutes, even with this tab closed.',
  run1: 'Now watch Protron use the app for you. It opens AI Autopilot and writes the prompt itself.',
  run2: 'It opens Contacts and adds new prospects who fit, each one marked as found by Autopilot.',
  run3: 'It builds the email campaign: the subject, the email and the schedule, then launches it from your own mailbox.',
  run4: 'It turns on your booking page and puts the link in the email, so anyone who replies can book a time.',
  watch1: 'Then it keeps watching: who replied, which appointments were booked, and which sales came in.',
  watch2: 'It tests two subject lines against each other. When one wins, everyone new gets the winner.',
  watch3: 'When an email falls behind, it rewrites it and launches the new version.',
  watch4: 'And it tells you what it did, in plain words: what it improved, and which campaigns got new prospects.',
  end: 'Ready? Press Talk live, record your prompt, or type it — and put your business on AI Autopilot.',
} as const;

/** The example businesses, in the film's order: [who, where]. */
export const FILM_PEOPLE: readonly (readonly [string, string])[] = [
  ['Plumber', 'Phoenix, AZ'],
  ['Electrician', 'Dallas, TX'],
  ['Real estate agent', 'Miami, FL'],
  ['Digital marketing agency', 'Austin, TX'],
  ['Solo entrepreneur, online store', 'Denver, CO'],
  ['Business coach', 'Atlanta, GA'],
  ['Educator & tutor', 'Boston, MA'],
  ['Corporate trainer', 'Chicago, IL'],
  ['Corporate consultant', 'New York, NY'],
  ['HVAC contractor', 'Houston, TX'],
  ['Dental practice', 'San Diego, CA'],
  ['Roofing company', 'Charlotte, NC'],
  ['Estate-planning attorney', 'Orlando, FL'],
  ['Cleaning company', 'Seattle, WA'],
];

/** The line spoken over an example business. */
export function exampleLine(i: number): string {
  const [who, where] = FILM_PEOPLE[i];
  const article = /^[AEIOU]/i.test(who) ? 'An' : 'A';
  const line = `${article} ${who.toLowerCase()} in ${where.split(',')[0]}.`;
  return i === 0 ? `Here is what that looks like. ${line}` : line;
}

/** Every line the film says. */
export function filmLines(): string[] {
  return [...Object.values(FILM_SAY), ...FILM_PEOPLE.map((_, i) => exampleLine(i))];
}
