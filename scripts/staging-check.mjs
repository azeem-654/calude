/**
 * Print what wrangler actually resolved for each environment.
 *
 * ── Why this exists ──
 *
 * Because the one mistake that matters here is invisible in review. A staging
 * Worker bound to the live database sends real mail to real customers, charges
 * real cards and writes real rows, and every screen looks exactly right while
 * it does. A comment claiming the binding is correct proves nothing; this asks
 * wrangler and fails if the answer is wrong.
 *
 * Run it before trusting a staging deploy, and in CI on every staging push.
 */
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';

/*
 * ── A placeholder dist, when there is none ──
 *
 * `wrangler deploy --dry-run` reads the assets directory before it will tell
 * you anything, so with no `dist` it dies with a message about missing files
 * rather than answering the question this script asks.
 *
 * That mattered: in CI this runs *before* the build, on purpose — a wrong
 * binding should be caught in the first twenty seconds, not after two minutes
 * of compiling something that must not be deployed. Found by the staging
 * pipeline on its first real push, which is what that pipeline is for.
 *
 * Only ever created when absent, and removed again afterwards, so a real build
 * is never touched.
 */
const MADE_DIST = !existsSync('dist');
if (MADE_DIST) {
  mkdirSync('dist', { recursive: true });
  writeFileSync('dist/index.html', '<!doctype html><title>placeholder</title>');
}

const run = (args) =>
  execFileSync('npx', ['wrangler', 'deploy', '--dry-run', ...args], { encoding: 'utf8' });

const problems = [];
const say = (ok, line) => { console.log(`${ok ? 'PASS' : 'FAIL'}  ${line}`); if (!ok) problems.push(line); };

let prod = '';
let staging = '';
try {
  prod = run([]);
  staging = run(['--env', 'staging']);
} catch (e) {
  if (MADE_DIST) rmSync('dist', { recursive: true, force: true });
  console.error('wrangler could not resolve the configuration:');
  console.error(e.stdout?.toString() ?? e.message);
  process.exit(1);
}

say(/env\.DB \(crmpro\)/.test(prod), 'production is bound to the live database, crmpro');
say(/app\.protectedcentral\.com/.test(prod), 'production knows its own origin');

say(/env\.DB \(crmpro-staging\)/.test(staging), 'staging is bound to crmpro-staging');
say(!/env\.DB \(crmpro\)\s/.test(staging), 'staging is NOT bound to the live database');
say(/testing\.protectedcentral\.com/.test(staging), 'staging knows its own origin');
say(!/app\.protectedcentral\.com/.test(staging), 'staging does not carry the live origin');

if (MADE_DIST) rmSync('dist', { recursive: true, force: true });

if (problems.length) {
  console.error(`\n${problems.length} problem(s). Nothing should be deployed until this passes.`);
  process.exit(1);
}
console.log('\nBoth environments resolve to their own database and their own origin.');
