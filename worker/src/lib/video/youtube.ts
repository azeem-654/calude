/**
 * Starting a project from the customer's own YouTube video — pure rules,
 * shared with the browser (services/videoStudio.ts re-exports them), so the
 * link box and the server refuse exactly the same things.
 *
 * Why it exists: a recording on somebody's PC can be tens of gigabytes; the
 * same video on their channel is a fraction of that and already uploaded.
 *
 * What it is not: a way to take other people's videos. YouTube's terms allow
 * downloading only what you own or have permission for, so the customer
 * confirms that in a box (recorded with who ticked it and when), and the
 * engine is only ever handed an eleven-character video id — never the URL the
 * customer typed, never anything that could become an argument.
 *
 * And it often will not work from a server. YouTube asks datacenter addresses
 * to "sign in to confirm you're not a bot", private and age-restricted videos
 * need an account, and members-only ones a membership. Each of those is a
 * refusal with a sentence the customer reads and one way forward that always
 * works: download the file from YouTube Studio and upload it.
 */

/** What every refusal ends with: the route that does not depend on YouTube letting a server in. */
export const YOUTUBE_WAY_FORWARD = 'Download it from YouTube Studio (Content → ⋮ → Download) and upload the file instead.';

export type YoutubeLink = { ok: true; id: string; url: string; kind: 'watch' | 'short' | 'live' | 'share' } | { ok: false; error: string };

const ID = /^[A-Za-z0-9_-]{11}$/;
const HOSTS = new Set(['youtube.com', 'www.youtube.com', 'm.youtube.com', 'music.youtube.com', 'youtu.be', 'www.youtu.be', 'youtube-nocookie.com', 'www.youtube-nocookie.com']);

/**
 * A link to one YouTube video, as its id. Accepts youtube.com/watch?v=,
 * youtu.be/, youtube.com/shorts/, youtube.com/live/ (and /embed/, which is
 * what a copied embed code holds); refuses a playlist, a channel, a search
 * and every other site by name.
 */
export function parseYoutubeUrl(raw: string): YoutubeLink {
  const text = String(raw ?? '').trim();
  if (!text) return { ok: false, error: 'Paste the link to your video on YouTube.' };
  if (text.length > 500) return { ok: false, error: 'That is too long to be a YouTube link.' };
  let u: URL;
  try { u = new URL(/^[a-z][a-z0-9+.-]*:\/\//i.test(text) ? text : `https://${text}`); } catch { return { ok: false, error: 'That is not a link. Copy the address of your video from YouTube.' }; }
  if (u.protocol !== 'https:' && u.protocol !== 'http:') return { ok: false, error: 'That is not a web link to YouTube.' };
  if (u.username || u.password || (u.port && u.port !== '443' && u.port !== '80')) return { ok: false, error: 'That is not a YouTube link.' };
  const host = u.hostname.toLowerCase();
  if (!HOSTS.has(host)) return { ok: false, error: `That link is to ${host}, not YouTube. Only links to youtube.com or youtu.be can be used here.` };
  const seg = u.pathname.split('/').filter(Boolean);
  let id = '', kind: 'watch' | 'short' | 'live' | 'share' = 'watch';
  if (host.endsWith('youtu.be')) { id = seg[0] ?? ''; kind = 'share'; }
  else if (seg[0] === 'watch' && seg.length === 1) id = u.searchParams.get('v') ?? '';
  else if (seg[0] === 'shorts' && seg.length >= 2) { id = seg[1]; kind = 'short'; }
  else if (seg[0] === 'live' && seg.length >= 2) { id = seg[1]; kind = 'live'; }
  else if ((seg[0] === 'embed' || seg[0] === 'v') && seg.length >= 2) id = seg[1];
  else if (seg[0] === 'playlist') return { ok: false, error: 'That is a playlist. Open the one video you want and copy its link.' };
  else if (seg[0] === 'channel' || seg[0] === 'c' || seg[0] === 'user' || seg[0]?.startsWith('@')) return { ok: false, error: 'That is a channel, not a video. Open the video and copy its link.' };
  else if (seg[0] === 'results') return { ok: false, error: 'That is a search. Open the video and copy its link.' };
  if (!id) return { ok: false, error: 'That YouTube link does not name a video. Open the video and copy its link.' };
  if (!ID.test(id)) return { ok: false, error: 'That YouTube link is cut short or changed — a video id is 11 letters, numbers, - or _.' };
  return { ok: true, id, kind, url: `https://www.youtube.com/watch?v=${id}` };
}

/** The still YouTube itself publishes for a video — shown as a picture, nothing else is asked of YouTube by the browser. */
export const youtubeThumb = (id: string) => (ID.test(id) ? `https://i.ytimg.com/vi/${id}/hqdefault.jpg` : '');

export const isYoutubeId = (id: string) => ID.test(id);

/**
 * What the engine's failure means for the customer, and whether trying again
 * could change it. Two sources:
 *   - the engine's own checks, as `refused:youtube:<code>[:<a>:<b>]` (it read
 *     the video's details first and found it too long, live, too big);
 *   - yt-dlp's own words, passed through as `ytdlp: <its last lines>` and
 *     read here, in one tested place, rather than in the engine.
 * Anything not recognised is a network or engine hiccup: retried, and if it
 * keeps failing, said plainly with the way forward.
 */
export function youtubeRefusal(error: string): { terminal: boolean; code: string; message: string } {
  const e = String(error ?? '');
  const mins = (s: string) => Math.max(1, Math.round(Number(s) / 60));
  const own = e.match(/refused:\s*youtube:([a-z_]+)(?::([\d.]+))?(?::([\d.]+))?/);
  const say = (code: string, why: string, terminal = true) => ({ terminal, code, message: `${why} ${YOUTUBE_WAY_FORWARD}` });
  if (own) {
    const [, code, a, b] = own;
    if (code === 'too_long') return say(code, `This video is ${mins(a)} minutes; Video Studio takes recordings up to ${mins(b)} minutes.`);
    if (code === 'over_allowance') {
      const left = Math.max(0, Math.floor(Number(b) / 60));
      return say(code, `This video is ${mins(a)} minutes and ${left} minute${left === 1 ? '' : 's'} of this month's video allowance ${left === 1 ? 'is' : 'are'} left. A shorter part, or next month, would fit.`);
    }
    if (code === 'too_big') return say(code, 'This video is larger than Video Studio fetches from YouTube.');
    if (code === 'live') return say(code, 'This is a live stream that has not finished. Once YouTube has the full recording, try again.');
    if (code === 'no_video') return say(code, 'YouTube sent no picture for this video.');
    if (code === 'not_youtube') return say(code, 'That is not a YouTube video link.');
    if (code === 'not_installed') return { terminal: true, code, message: `Fetching from YouTube is not installed in this media engine yet. ${YOUTUBE_WAY_FORWARD}` };
    if (code === 'empty') return say(code, 'YouTube sent nothing to save.', false);
    return say(code, 'YouTube would not give this video to Video Studio.');
  }
  const t = e.toLowerCase().replace(/[’`]/g, "'");
  if (/not a bot|confirm you're not|sign in to confirm(?! your age)|http error 429|too many requests|unusual traffic|captcha/.test(t)) {
    return say('bot', 'YouTube refused to hand this video to our server ("Sign in to confirm you\'re not a bot"). YouTube often does this to cloud servers, whatever the video.');
  }
  if (/private video|video is private|this video is private/.test(t)) return say('private', 'This video is private, so YouTube will not give it to anyone but your signed-in account. Making it unlisted would also work.');
  if (/confirm your age|age[- ]restricted|inappropriate for some users|age-gated/.test(t)) return say('age', 'This video is age-restricted, and YouTube only shows it to a signed-in account.');
  if (/members[- ]only|join this channel|available to this channel's members|premium/.test(t)) return say('members', 'This video is for channel members only, so YouTube will not give it out without a membership sign-in.');
  if (/not made this video available in your country|geo.?restrict|blocked it in your country|not available in your country/.test(t)) return say('geo', 'YouTube does not make this video available where our server is.');
  if (/copyright/.test(t)) return say('removed', 'YouTube has blocked this video on copyright grounds.');
  if (/live event|premieres in|is_upcoming|this live stream|will begin in/.test(t)) return say('live', 'This video is a live stream or premiere that has not finished. Once YouTube has the full recording, try again.');
  if (/video unavailable|has been removed|does not exist|no longer available|account associated with this video has been terminated|incomplete youtube id|not a valid url/.test(t)) return say('unavailable', 'YouTube says this video is unavailable — check the link, and that the video is public or unlisted.');
  if (/larger than max-filesize|max-filesize|file is larger/.test(t)) return say('too_big', 'This video is larger than Video Studio fetches from YouTube.');
  if (/requested format is not available|no video formats found/.test(t)) return say('no_format', 'YouTube offered no version of this video Video Studio can read.');
  return { terminal: false, code: 'unknown', message: `Fetching the video from YouTube failed (${e.replace(/^ytdlp:\s*/, '').replace(/\s+/g, ' ').slice(0, 160)}). ${YOUTUBE_WAY_FORWARD}` };
}

/** The bits of YouTube's oEmbed answer worth showing: the title and the channel. Anything odd is dropped. */
export function cleanOembed(raw: unknown): { title: string; author: string } | null {
  const r = (raw ?? {}) as Record<string, unknown>;
  const clean = (v: unknown, n: number) => String(v ?? '').replace(/[\u0000-\u001f<>]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, n);
  const title = clean(r.title, 140);
  if (!title) return null;
  return { title, author: clean(r.author_name, 80) };
}
