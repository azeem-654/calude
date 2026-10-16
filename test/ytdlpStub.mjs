#!/usr/bin/env node
/**
 * A stand-in for yt-dlp, for test:videoyoutube — the real one is never run
 * against YouTube in tests (there is no network to it, and it would be
 * fetching a real person's video). The engine runs this exactly as it runs
 * yt-dlp (YTDLP=<this file>), so its arguments are checked here too: the
 * locked-down flags must be present and the URL must come after `--`, or it
 * refuses — a change that dropped them fails the test.
 *
 * Videos by id:
 *   G00dVideo01  details, then the file in YTDLP_STUB_FILE as source.mp4
 *   B0tBl0cked1  "Sign in to confirm you're not a bot" (what datacenters get)
 *   Pr1vateVid0  "Private video"
 *   L0ngVideo00  details only: five hours long
 */
import fs from 'node:fs';

const args = process.argv.slice(2);
if (args.includes('--version')) { console.log('2026.08.19-stub'); process.exit(0); }
const need = ['--ignore-config', '--no-playlist', '--no-exec', '--no-plugin-dirs', '--no-remote-components'];
const dash = args.indexOf('--');
if (need.some(f => !args.includes(f)) || dash < 0 || dash !== args.length - 2) {
  console.error(`stub: unsafe arguments ${JSON.stringify(args)}`);
  process.exit(2);
}
const url = new URL(args[dash + 1]);
if (url.hostname !== 'www.youtube.com' || url.pathname !== '/watch') { console.error('stub: not a canonical watch URL'); process.exit(2); }
const id = url.searchParams.get('v');
const dump = args.includes('--dump-single-json');
const fail = msg => { console.error(`ERROR: [youtube] ${id}: ${msg}`); process.exit(1); };

if (id === 'B0tBl0cked1') fail('Sign in to confirm you’re not a bot. Use --cookies-from-browser or --cookies for the authentication. See  https://github.com/yt-dlp/yt-dlp/wiki/FAQ#how-do-i-pass-cookies-to-yt-dlp  for how to manually pass cookies.');
if (id === 'Pr1vateVid0') fail('Private video. Sign in if you\'ve been granted access to this video. Use --cookies-from-browser or --cookies for the authentication.');
const duration = id === 'L0ngVideo00' ? 5 * 3600 : Number(process.env.YTDLP_STUB_DURATION) || 40;
if (dump) {
  console.log(JSON.stringify({ id, title: 'Our weekly growth show', channel: 'Growth Show', duration, live_status: 'not_live', is_live: false, filesize_approx: 4_000_000 }));
  process.exit(0);
}
if (id !== 'G00dVideo01') fail('Video unavailable');
const out = args[args.indexOf('-o') + 1].replace('%(ext)s', 'mp4');
fs.mkdirSync(out.slice(0, out.lastIndexOf('/')), { recursive: true });
const src = fs.readFileSync(process.env.YTDLP_STUB_FILE);
for (const k of [0.25, 0.5, 1]) console.log(`pc ${Math.round(src.length * k)} ${src.length} NA`);
fs.writeFileSync(out, src);
