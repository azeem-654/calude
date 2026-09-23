/**
 * How far a new project actually is, and what it is doing right now.
 *
 * ── The bug this replaces ──
 *
 * The bar read the launch plan only: how many of the steps the customer agreed
 * to in the wizard have a finished record behind them. For a project created a
 * minute ago that is zero, correctly — and a bar sitting at 0% under the words
 * "Getting this project ready" reads as broken, not as early. Somebody watched
 * it for ten minutes and concluded nothing worked.
 *
 * ── What changed, and why it is not padding ──
 *
 * The launch plan is not the whole of getting ready. Four things happen *at
 * creation* and are all checkable facts about records that exist: the project,
 * the client profile it writes from, the permissions it holds, and the build
 * order the customer agreed to. Counting them is not inflating the number — it
 * is counting work that was genuinely done, which the old bar simply ignored.
 *
 * So a brand-new project reads about a third done, every point of which can be
 * pointed at, and the bar moves as the rest arrives.
 *
 * ── Why the estimate is deliberately vague in places ──
 *
 * The first pass is knowable: the cron runs every five minutes and a project
 * with no `last_planned_at` is due on the next one. After that, the pace is set
 * by the planner, which runs once a day — so the rest arrives over days, and
 * saying "4 minutes remaining" would be a number invented to fill a slot. Where
 * this cannot say, it says what it can and labels the rest an estimate.
 *
 * Pure, and tested as such: `npm run test:setup`.
 */

export type StepState = 'done' | 'now' | 'waiting' | 'stuck';

export interface SetupStep {
  key: string;
  label: string;
  state: StepState;
  /** Why it is where it is, in the customer's words. */
  detail: string;
}

export interface SetupProgress {
  steps: SetupStep[];
  done: number;
  total: number;
  percent: number;
  /** One line on what is happening now. Never invented. */
  doing: string;
  /** What is left to wait for, or '' when nothing can honestly be said. */
  eta: string;
  /** True when this has been waiting far longer than it should. */
  stalled: boolean;
}

export interface SetupInput {
  /** Does the project name a client to write from? */
  hasPortfolio: boolean;
  /** How many permissions were decided. Zero means the wizard never ran. */
  guardrailCount: number;
  /** The build order from the wizard. */
  launchSteps: { label: string }[];
  /** How many of those have a finished record behind them. */
  launchDone: number;
  /** When the planner last ran, or null if never. */
  lastPlannedAt: string | null;
  createdAt: string;
  /** Live signals, for the "doing now" line. */
  workflows: number;
  produced: number;
  awaiting: number;
  /** The project's own recorded failure, if it has one. */
  lastError: string;
  now?: number;
}

/** The cron interval. A project with no plan yet is due on the next one. */
const TICK_MS = 5 * 60_000;
/**
 * How long is too long to be waiting for a first pass.
 *
 * Three ticks. One missed tick is a deploy or a slow minute; three in a row
 * means the schedule is not running, and the customer should be told that
 * rather than left watching a bar.
 */
const STALE_MS = 3 * TICK_MS;

const minutes = (ms: number) => Math.max(1, Math.round(ms / 60_000));

export function setupProgress(input: SetupInput): SetupProgress {
  const now = input.now ?? Date.now();
  const created = Date.parse(input.createdAt);
  const age = Number.isFinite(created) ? now - created : 0;
  const planned = !!input.lastPlannedAt;
  const waitedTooLong = !planned && age > STALE_MS;

  const steps: SetupStep[] = [
    {
      key: 'created',
      label: 'Project created',
      state: 'done',
      detail: 'It exists on the server and runs whether or not this is open.',
    },
    {
      key: 'client',
      label: 'Client profile attached',
      state: input.hasPortfolio ? 'done' : 'stuck',
      detail: input.hasPortfolio
        ? 'Everything it writes comes from this profile.'
        : 'No client is attached, so there is nothing to write from. Add one in Project Settings.',
    },
    {
      key: 'permissions',
      label: 'Permissions decided',
      state: input.guardrailCount > 0 ? 'done' : 'waiting',
      detail: input.guardrailCount > 0
        ? `${input.guardrailCount} set. Anything on "asks first" waits on this card.`
        : 'Not set yet.',
    },
    {
      key: 'order',
      label: 'Build order agreed',
      state: input.launchSteps.length > 0 ? 'done' : 'waiting',
      detail: input.launchSteps.length > 0
        ? `${input.launchSteps.length} steps, in the order you saw in the wizard.`
        : 'No build order was recorded for this project.',
    },
    {
      key: 'plan',
      label: 'First pass — reading the business',
      state: planned ? 'done' : waitedTooLong ? 'stuck' : 'now',
      detail: planned
        ? 'Autopilot has read the profile and decided what to do.'
        : waitedTooLong
          ? `Still nothing after ${minutes(age)} minutes. That is longer than it should take — the schedule may not be running.`
          : 'Runs on the next pass, which is within five minutes.',
    },
  ];

  /* Then the build order itself, one line per step, ticked as the record behind
     it appears. Deliberately after the setup steps: these are the slow ones,
     paced by a planner that runs once a day. */
  input.launchSteps.forEach((s, i) => {
    const done = i < input.launchDone;
    steps.push({
      key: `launch-${i}`,
      label: s.label,
      state: done ? 'done' : (planned && i === input.launchDone ? 'now' : 'waiting'),
      detail: done
        ? 'Done — the record behind this exists.'
        : planned && i === input.launchDone
          ? 'Next up.'
          : 'Waiting its turn.',
    });
  });

  const done = steps.filter(s => s.state === 'done').length;
  const total = steps.length;
  /* Rounded down, so a bar never says 100% with something outstanding. */
  const percent = total ? Math.floor((done / total) * 100) : 0;

  /* ── What it is doing right now ──
     In order of what somebody would most want to know. Every line is a fact
     about a record; there is no "analysing your audience". */
  let doing = '';
  if (input.lastError) doing = input.lastError;
  else if (!input.hasPortfolio) doing = 'Waiting on a client profile — it has nothing to write from.';
  else if (!planned && waitedTooLong) doing = 'Waiting for a pass that has not come. Nothing is lost; it picks up when the schedule next runs.';
  else if (!planned) doing = 'Waiting for its first pass, which reads the client profile and decides what to build.';
  else if (input.awaiting > 0) doing = `${input.awaiting} thing${input.awaiting === 1 ? '' : 's'} ready and waiting for you to approve.`;
  else if (input.launchDone < input.launchSteps.length) doing = `Building: ${input.launchSteps[input.launchDone]?.label ?? 'the next step'}.`;
  else if (input.produced > 0) doing = `${input.produced} thing${input.produced === 1 ? '' : 's'} made so far.`;
  else if (input.workflows > 0) doing = 'Set up and watching for the things its workflows start on.';
  else doing = 'Ready. Nothing is queued.';

  /* ── How long ──
     Said only where it can be. The first pass is a known interval; the rest is
     paced by a planner that runs once a day, so it is given as days and called
     an estimate rather than counted down to the minute. */
  let eta = '';
  if (!planned && !waitedTooLong) {
    eta = 'Within five minutes — that is how often the schedule runs.';
  } else if (planned) {
    const left = input.launchSteps.length - input.launchDone;
    if (left > 0) {
      eta = left <= 2
        ? 'The last of it usually lands within a day. An estimate — it plans once a day and acts every five minutes.'
        : `About ${Math.ceil(left / 2)}–${left} days for the remaining ${left}. An estimate: it plans once a day, so the build arrives over several.`;
    }
  }

  return { steps, done, total, percent, doing, eta, stalled: waitedTooLong };
}
