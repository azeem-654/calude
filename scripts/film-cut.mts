/**
 * An excerpt of a recorded chapter, as a chapter of its own — for a short cut
 * of a long film (the AppSumo short, owner 2026-11-21) without recording
 * anything twice.
 *
 *   npx tsx scripts/film-cut.mts <new id> <chapter id> <from s> <to s> [speed]
 *
 * Reads /tmp/site-clips-master/<chapter id>.mp4 and writes <new id>.mp4 beside
 * it, faded in and out on dark like every recorded chapter, so demo-film.mts
 * and voiceover.mts take it as they take the others. A narration script's
 * `at` for the excerpt is the original caption's time minus <from>, divided
 * by [speed].
 *
 * [speed] (default 1) plays the excerpt faster — for a film's quick tour of
 * the other modules (owner, 2026-11-23: "show all other working modules in a
 * very fast manner"), where a 25-second recording has to say its point in ten.
 */
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';

const MASTER = '/tmp/site-clips-master';
const FF = process.env.FFMPEG || '/usr/bin/ffmpeg';
const [id, src, a, b, sp] = process.argv.slice(2);
const from = Number(a), to = Number(b), speed = Number(sp || 1);
if (!id || !src || !(to > from) || from < 0 || !(speed > 0)) { console.log('usage: film-cut.mts <new id> <chapter id> <from s> <to s> [speed]'); process.exit(2); }
if (!fs.existsSync(`${MASTER}/${src}.mp4`)) { console.log(`not recorded yet: ${src}`); process.exit(1); }
// The fades are placed on the excerpt's own (sped-up) clock, so they come after setpts.
const len = (to - from) / speed;
execFileSync(FF, ['-y', '-loglevel', 'error', '-ss', String(from), '-t', String(to - from), '-i', `${MASTER}/${src}.mp4`,
  '-vf', `setpts=PTS/${speed},fps=25,fade=t=in:st=0:d=0.35,fade=t=out:st=${Math.max(0, len - 0.5).toFixed(2)}:d=0.5`,
  '-an', '-c:v', 'libx264', '-preset', 'fast', '-crf', '14', '-pix_fmt', 'yuv420p', `${MASTER}/${id}.mp4`]);
console.log(`${id}: ${src} ${from}–${to} s${speed !== 1 ? ` at ${speed}×` : ''} (${len.toFixed(1)} s)`);
