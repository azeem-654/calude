/**
 * Import FIRST in a pure test that should see the testing site's switches.
 *
 * The incubator (src/services/features.ts) is decided by the hostname, and
 * under Node there is none — so every held-back feature reads as the live
 * app has it, off. These tests check what the features do, so they run as
 * a developer's machine does (`localhost`, a rehearsal host). What the live
 * app hides is checked in a browser against the live switches.
 */
const g = globalThis as unknown as { window?: { location: { hostname: string } } };
if (typeof g.window === 'undefined') g.window = { location: { hostname: 'localhost' } };
export {};
