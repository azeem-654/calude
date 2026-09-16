/**
 * Create the staging database and write its id into wrangler.jsonc.
 *
 * ── Why this is a script and not part of the deploy ──
 *
 * Because it happens once, and because `wrangler d1 create` returns a new id
 * every time it succeeds. Putting it in CI would mean every deploy either
 * creating a second database or swallowing an "already exists" — and a staging
 * site pointed at a database nobody can find looks exactly like a staging site
 * that lost its data.
 *
 * ── Why it edits the file ──
 *
 * The id has to be committed: `wrangler deploy --env staging` reads it from
 * wrangler.jsonc, and CI has no memory of what this printed. Asking somebody to
 * copy a UUID out of terminal output and paste it into the right one of two
 * `database_id` lines is a step that goes wrong quietly — the wrong line means
 * production points at staging.
 *
 * Run:
 *   CLOUDFLARE_API_TOKEN=… CLOUDFLARE_ACCOUNT_ID=… node scripts/staging-setup.mjs
 *
 * The token needs the same permissions the deploy uses: Workers Scripts: Edit,
 * D1: Edit, Account Settings: Read.
 *
 * Safe to re-run. If the database already exists its id is looked up rather
 * than a second one being made.
 */
import { execFileSync } from 'node:child_process';
import { readFileSync, writeFileSync } from 'node:fs';

const NAME = 'crmpro-staging';
const CONFIG = 'wrangler.jsonc';
const PLACEHOLDER = 'STAGING_DATABASE_ID_NOT_SET';

const token = process.env.CLOUDFLARE_API_TOKEN;
const account = process.env.CLOUDFLARE_ACCOUNT_ID;
if (!token || !account) {
  console.error('Set CLOUDFLARE_API_TOKEN and CLOUDFLARE_ACCOUNT_ID first.');
  console.error('Both are the same values the deploy workflow uses.');
  process.exit(1);
}

const api = async (path) => {
  const r = await fetch(`https://api.cloudflare.com/client/v4/${path}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  return r.json();
};

/** The id of an existing database of this name, or '' if there is none. */
async function existingId() {
  const d = await api(`accounts/${account}/d1/database?name=${encodeURIComponent(NAME)}`);
  if (!d.success) {
    console.error('Cloudflare refused the lookup:', JSON.stringify(d.errors ?? d));
    process.exit(1);
  }
  return (d.result ?? []).find(db => db.name === NAME)?.uuid ?? '';
}

let id = await existingId();

if (id) {
  console.log(`${NAME} already exists (${id}).`);
} else {
  console.log(`Creating ${NAME}…`);
  /* Through wrangler rather than the API directly: it is the same call, and it
     is the tool that will read the result, so any disagreement about shape
     surfaces here rather than at the first deploy. */
  execFileSync('npx', ['wrangler', 'd1', 'create', NAME], {
    stdio: 'inherit',
    env: { ...process.env, CLOUDFLARE_API_TOKEN: token, CLOUDFLARE_ACCOUNT_ID: account },
  });
  id = await existingId();
  if (!id) {
    console.error(`Created ${NAME} but could not read its id back. Nothing was written to ${CONFIG}.`);
    process.exit(1);
  }
}

const config = readFileSync(CONFIG, 'utf8');

if (config.includes(`"database_id": "${id}"`)) {
  console.log(`${CONFIG} already points at it. Nothing to change.`);
  process.exit(0);
}

if (!config.includes(PLACEHOLDER)) {
  /*
   * Refused rather than guessed at. There are two `database_id` lines in this
   * file and replacing the wrong one points production at staging — which is
   * the single worst outcome available here, so it is not attempted blind.
   */
  console.error(`${CONFIG} no longer contains the placeholder ${PLACEHOLDER}.`);
  console.error(`It has probably been set already. The staging database id is:\n  ${id}`);
  console.error('Check the "staging" block by hand rather than letting this guess.');
  process.exit(1);
}

writeFileSync(CONFIG, config.replace(PLACEHOLDER, id));
console.log(`\nWrote the id into ${CONFIG}:\n  ${id}\n`);
console.log('Now commit it — CI reads it from the file, not from this terminal:');
console.log('  git add wrangler.jsonc && git commit -m "Point staging at its own database" && git push');
