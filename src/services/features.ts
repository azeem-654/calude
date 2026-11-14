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
 * THE INCUBATOR: built, usable on the testing site, and deliberately not
 * offered on the live one yet. Each entry is listed in docs/INCUBATOR.md —
 * "what is in the incubator?" is answered there.
 *
 * `prospects` was here until 2026-10-01: OpenStreetMap alone was too thin in
 * too many towns to be a button every customer presses once and judges the
 * product by. It went live once it searched Google Maps on the owner's key,
 * with a per-workspace budget and nothing after a trial ends (routes/prospects.ts).
 * The name stays in `Feature` so the next held-back feature has a pattern.
 */
const REHEARSING = new Set<string>([
  /* `protron` (the floating chat) was here from 2026-11-12 and was released
     to live by the owner on 2026-11-13. Two of its parts came back on
     2026-11-14 (owner: "it keeps on failing", "that's making the thing
     complex", and the AppSumo review must not meet them half-finished): */
  'protron-live',    // real-time speech-to-speech (wizard and panel) and hands-free Talk mode
  'protron-hands',   // Protron working the screen: pointer, pressing buttons, typing into forms, driving the wizard; the site's film of it
]);

/**
 * Parked: off on BOTH sites until the owner asks for it back. Kept in the
 * build so it does not rot (see above), listed in docs/INCUBATOR.md.
 */
const PARKED = new Set<string>([
  'protron-speaks-first',  // the panel opening by itself (idle, errors, a frozen page) — owner, 2026-11-14: "only when it's clicked"
]);

export type Feature = 'prospects' | 'protron' | 'protron-live' | 'protron-hands' | 'protron-speaks-first';

/** Whether this visitor, on this hostname, may actually use it. */
export function featureReady(name: Feature): boolean {
  if (PARKED.has(name)) return false;
  if (!REHEARSING.has(name)) return true;
  return isRehearsal();
}

/** True when it exists but is being held back *here*. Draws the "Soon" label. */
export function featureComingSoon(name: Feature): boolean {
  return REHEARSING.has(name) && !isRehearsal();
}
