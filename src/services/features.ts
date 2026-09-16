/**
 * Things that are built but not yet for customers.
 *
 * ── Why a flag and not an unmerged branch ──
 *
 * Because an unmerged branch rots. It drifts from `main`, stops compiling
 * against it, and the day somebody wants the feature they find a week of merge
 * work rather than a switch. A flag keeps the code in the build, typechecked
 * and tested on every push, and simply not reachable by a paying customer.
 *
 * ── Why the flag is the *environment*, not a boolean somebody edits ──
 *
 * `testing.protectedcentral.com` exists so that unfinished work can be used in
 * anger without a customer meeting it. So a rehearsing feature is fully live
 * there and on a developer's machine, and says "coming soon" on the real app —
 * from the same build, with no separate bundle to get out of step.
 *
 * ── Turning one on for real ──
 *
 * Move its name out of `REHEARSING`. That is the whole ceremony: one line, in
 * one file, reviewable on its own, and it goes live the next time staging is
 * promoted.
 */
import { isRehearsal } from './hosts';

/**
 * Built, usable on the testing site, and deliberately not offered on the live
 * one yet.
 *
 * `prospects` — searching OpenStreetMap for businesses to approach. Held back
 * because its usefulness depends entirely on how well the customer's own town
 * is mapped, and that is worth finding out on real searches before it is a
 * button every customer presses once and judges the product by.
 */
const REHEARSING = new Set<string>(['prospects']);

export type Feature = 'prospects';

/** Whether this visitor, on this hostname, may actually use it. */
export function featureReady(name: Feature): boolean {
  if (!REHEARSING.has(name)) return true;
  return isRehearsal();
}

/** True when it exists but is being held back *here*. Draws the "Soon" label. */
export function featureComingSoon(name: Feature): boolean {
  return REHEARSING.has(name) && !isRehearsal();
}
