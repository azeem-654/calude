/**
 * Make sure AI Video Studio's three Cloudflare pieces exist, and bind only
 * the ones that do.
 *
 *   node scripts/video-bindings.mjs            (live:    crmpro-video, crmpro-media)
 *   node scripts/video-bindings.mjs staging    (testing: crmpro-staging-video, crmpro-staging-media)
 *
 * Run by deploy.yml and staging.yml before `wrangler deploy`, like
 * scripts/leads-db.mjs, and for the same reason: these are made by the
 * pipeline, not by hand.
 *
 *   VIDEO  the R2 bucket — found by name, created the first time.
 *   MEDIA  the FFmpeg engine (media/) — a Cloudflare Container Worker. Deployed
 *          only when its source changed (the deploy is tagged with a hash of
 *          it, so an unchanged engine is not rebuilt on every push).
 *   AI     Workers AI, for transcription — bound if the account answers.
 *
 * ── It never fails the deploy ──
 *
 * Anything that cannot be made or reached (R2 not yet enabled on the
 * account, a token without Containers permission, no Docker) is taken out of
 * this run's wrangler.jsonc and reported as a warning. Video Studio then
 * shows that part as "needs configuration" and everything else ships.
 */
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync } from 'node:fs';

const staging = process.argv[2] === 'staging';
const bucket = staging ? 'crmpro-staging-video' : 'crmpro-video';
const engine = staging ? 'crmpro-staging-media' : 'crmpro-media';
const envArgs = staging ? ['--env', 'staging'] : ['--env', ''];
const file = 'wrangler.jsonc';
const wrangler = (args, timeout = 120_000) => execFileSync('npx', ['wrangler', ...args], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], timeout });
const why = e => String(e?.stderr || e?.stdout || e?.message || e).replace(/\x1b\[[0-9;]*m/g, '').split('\n')
  .filter(l => l.trim() && !/Proxy environment variables/.test(l)).slice(-5).join(' | ');
const warn = (title, msg) => console.log(`::warning title=${title}::${msg}`);

let src = readFileSync(file, 'utf8');
function drop(line) {
  const re = new RegExp(`^\\s*${line.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\n`, 'm');
  src = src.replace(re, '');
}
function dropAi() {
  const from = staging ? src.indexOf('"staging": {') : 0;
  const ai = src.indexOf('"ai": { "binding": "AI" },', Math.max(0, from));
  if (ai >= 0) src = src.slice(0, src.lastIndexOf('\n', ai) + 1) + src.slice(src.indexOf('\n', ai) + 1);
}
const bucketLine = `"r2_buckets": [{ "binding": "VIDEO", "bucket_name": "${bucket}" }],`;
const engineLine = `"services": [{ "binding": "MEDIA", "service": "${engine}" }],`;

/* Safe first: until each piece is proved, this run's file has none of them,
   so a step killed half way (a timeout) leaves a deployable config behind. */
{
  const full = src;
  drop(bucketLine); drop(engineLine); dropAi();
  writeFileSync(file, src);
  src = full;
}

/* ── VIDEO: the bucket ── */
try {
  const listed = wrangler(['r2', 'bucket', 'list']);
  const names = [...listed.matchAll(/name:\s+(\S+)/g)].map(m => m[1]);
  if (!names.includes(bucket)) {
    console.log(`Creating the R2 bucket ${bucket}…`);
    wrangler(['r2', 'bucket', 'create', bucket]);
  }
  console.log(`Video storage: ${bucket} bound as VIDEO.`);
} catch (e) {
  drop(bucketLine);
  warn('Video storage not bound', `Could not find or create the R2 bucket ${bucket}: ${why(e)}. If R2 has never been switched on for this account, open the Cloudflare dashboard → R2 → Enable once. The deploy continues; Video Studio says storage needs setting up.`);
}

/* ── MEDIA: the engine ── */
const hash = createHash('sha256');
for (const f of ['media/Dockerfile', 'media/engine/server.mjs', 'media/worker.ts', 'media/wrangler.jsonc']) hash.update(readFileSync(f));
const tag = `media-${hash.digest('hex').slice(0, 16)}`;
let engineUp = false;
let deployedBefore = false;
try {
  const list = JSON.parse(wrangler(['deployments', 'list', '-c', 'media/wrangler.jsonc', ...envArgs, '--json']));
  deployedBefore = Array.isArray(list) && list.length > 0;
  const latest = deployedBefore ? list[list.length - 1] : null;
  if (JSON.stringify(latest ?? {}).includes(tag)) { engineUp = true; console.log(`Media engine ${engine} is current (${tag}).`); }
} catch { /* never deployed, or cannot be listed: try deploying */ }
if (!engineUp) {
  try {
    console.log(`Deploying the media engine ${engine} (${tag}) — builds the FFmpeg image…`);
    const out = wrangler(['deploy', '-c', 'media/wrangler.jsonc', ...envArgs, '--tag', tag, '--message', tag, '--containers-rollout', 'immediate'], 20 * 60_000);
    console.log(out.split('\n').filter(l => /Uploaded|Deployed|container|image/i.test(l)).slice(-6).join('\n'));
    engineUp = true;
  } catch (e) {
    if (deployedBefore) {
      engineUp = true;
      warn('Media engine not updated', `The new engine did not deploy (${why(e)}); the previous one keeps running.`);
    } else {
      warn('Media engine not deployed', `Could not deploy ${engine}: ${why(e)}. The token needs Workers Scripts: Edit and Containers access, and the runner needs Docker. Video Studio says the engine needs setting up.`);
    }
  }
}
if (!engineUp) drop(engineLine);
else console.log(`Media engine: ${engine} bound as MEDIA.`);

/* ── AI: Workers AI, for transcription ── */
try {
  wrangler(['ai', 'models'], 60_000);
  console.log('Workers AI: bound as AI.');
} catch (e) {
  dropAi();
  warn('Workers AI not bound', `Workers AI did not answer (${why(e)}); the token needs Workers AI: Read. Video Studio says transcription needs setting up.`);
}

writeFileSync(file, src);
