/**
 * Joins recorded film chapters (scripts/site-clips.mts, recipes marked
 * `film`) into one demonstration film.
 *
 *   npx tsx scripts/demo-film.mts autopilot-deep-dive film-ap-board film-ap-new …
 *
 * Reads the near-lossless masters in /tmp/site-clips-master and writes
 * marketing/demos/<name>.mp4 (H.264, faststart, silent — the words are in the
 * picture). The films are tens of megabytes, so they are not committed
 * (marketing/demos/.gitignore); the recipes are, and re-make them.
 *
 * The two films (2026-11-20), after recording their chapters:
 *
 *   npx tsx scripts/demo-film.mts autopilot-deep-dive film-ap-board film-ap-new film-ap-inside film-ap-follow film-ap-sites
 *   npx tsx scripts/demo-film.mts platform-ai-tour film-card-intro film-card-autopilot clip-autopilot \
 *     film-card-prospecting clip-prospecting film-ai-contacts clip-contacts film-ai-pipelines clip-pipelines \
 *     film-ai-campaigns clip-campaigns film-ai-blog film-ai-websites clip-websites film-ai-graphics clip-graphics \
 *     film-card-engagement clip-engagement film-ai-inbox clip-inbox film-card-booking clip-booking \
 *     film-card-agency clip-agency film-card-reports clip-reports
 *
 * Record the film-ap-* chapters in that order against one fresh workspace
 * (the second builds the business the fifth shows); CLIPS_REUSE=1 with a
 * HOLD=1 site-reels.mts lets a failed chapter be re-shot alone.
 *
 * Each chapter already fades in and out on dark (site-clips.mts), so plain
 * concatenation gives a soft cut between chapters with nothing re-timed.
 */
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';

const MASTER = '/tmp/site-clips-master';
const FF = process.env.FFMPEG || '/usr/bin/ffmpeg';
const [name, ...ids] = process.argv.slice(2);
if (!name || !ids.length) { console.log('usage: demo-film.mts <name> <chapter id>…'); process.exit(2); }
const missing = ids.filter(id => !fs.existsSync(`${MASTER}/${id}.mp4`));
if (missing.length) { console.log(`not recorded yet: ${missing.join(', ')}`); process.exit(1); }

fs.mkdirSync('marketing/demos', { recursive: true });
const list = `${MASTER}/${name}.txt`;
fs.writeFileSync(list, ids.map(id => `file '${MASTER}/${id}.mp4'`).join('\n'));
const out = `marketing/demos/${name}.mp4`;
execFileSync(FF, ['-y', '-loglevel', 'error', '-f', 'concat', '-safe', '0', '-i', list,
  '-c:v', 'libx264', '-preset', 'slow', '-crf', '23', '-tune', 'animation', '-pix_fmt', 'yuv420p', '-movflags', '+faststart', '-an', out]);
const secs = Number(execFileSync('/usr/bin/ffprobe', ['-v', 'error', '-show_entries', 'format=duration', '-of', 'csv=p=0', out]).toString().trim());
console.log(`${out}: ${Math.floor(secs / 60)} min ${Math.round(secs % 60)} s · ${Math.round(fs.statSync(out).size / 1048576)} MB`);
