/**
 * Make sure the lead directory's database exists, and bind it.
 *
 *   node scripts/leads-db.mjs            (live: crmpro-leads)
 *   node scripts/leads-db.mjs staging    (testing: crmpro-staging-leads)
 *
 * Run by deploy.yml and staging.yml before `wrangler deploy`. The directory
 * lives in a D1 database of its own (worker/src/lib/leadDir.ts says why);
 * wrangler.jsonc names it with a placeholder id because the database is made
 * by the pipeline, not by hand, and the id is only known once it exists. This
 * finds it by name (making it the first time), and writes its id into the
 * working copy of wrangler.jsonc for this run.
 *
 * ── It never fails the deploy ──
 *
 * If the database cannot be listed or made (a token without D1: Edit, the
 * account's database limit), the binding is taken out of the working copy
 * and the deploy goes ahead: the directory then answers "no database yet",
 * and everything else ships. A lead list is not a reason to hold back a fix.
 */
import { execFileSync } from 'node:child_process';
import { readFileSync, writeFileSync } from 'node:fs';

const staging = process.argv[2] === 'staging';
const name = staging ? 'crmpro-staging-leads' : 'crmpro-leads';
const placeholder = staging ? 'STAGING_LEADS_DB_ID_SET_BY_CI' : 'LEADS_DB_ID_SET_BY_CI';
const file = 'wrangler.jsonc';
const wrangler = (args) => execFileSync('npx', ['wrangler', ...args], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });

function find() {
  const out = wrangler(['d1', 'list', '--json']);
  const list = JSON.parse(out.slice(out.indexOf('[')));
  return list.find((d) => d.name === name)?.uuid ?? null;
}

let src = readFileSync(file, 'utf8');
if (!src.includes(placeholder)) {
  console.log(`${file} has no ${placeholder} — nothing to do.`);
  process.exit(0);
}
try {
  let id = find();
  if (!id) {
    console.log(`Creating the D1 database ${name}…`);
    wrangler(['d1', 'create', name]);
    id = find();
  }
  if (!id || !/^[0-9a-f-]{36}$/.test(id)) throw new Error(`no id for ${name} after creating it`);
  writeFileSync(file, src.replace(`"${placeholder}"`, `"${id}"`));
  console.log(`Lead directory: ${name} (${id}) bound as LEADS.`);
} catch (e) {
  const why = String(e?.stderr || e?.stdout || e?.message || e).split('\n').filter(Boolean).slice(-6).join(' | ');
  /* Out of the working copy, with any comment lines above it, so the deploy
     carries on without the directory rather than failing on a bad id. */
  const re = new RegExp(`,(\\s*//[^\\n]*\\n)*\\s*\\{ "binding": "LEADS"[^\\n]*"${placeholder}" \\}`);
  src = src.replace(re, '');
  writeFileSync(file, src);
  console.log(`::warning title=Lead directory not bound::Could not find or create the D1 database ${name}: ${why}. The deploy continues; the directory says it has no database until this works (the token needs D1: Edit).`);
}
