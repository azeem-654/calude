/**
 * The pieces of a scheduled agent that are worth arguing with directly.
 *
 * Run with `npm run test:agents`. No database and no network: everything here
 * is a pure function over a string or a config, which is what makes "would it
 * write about this item?" answerable without waiting for a cron and a feed.
 *
 * ── What is worth testing ──
 *
 * The cases where a plausible implementation is wrong and looks right, which on
 * this feature are nearly all about *what it decides not to do*. An agent that
 * rewrites yesterday's story every morning, one that treats a handle as a
 * channel and then silently produces nothing for ever, one that reports an
 * empty feed as work done — each of those looks like a working feature from the
 * outside and is the reason somebody stops believing the screen.
 */
import { cadenceDue, designFromPost, parseFeed, youtubeFeed } from '../src/lib/projectAgents';
import { extractJson } from '../src/lib/ai';

const out: string[] = [];
const ok = (n: string, p: boolean, d = '') => out.push(`${p ? 'PASS' : 'FAIL'}  ${n}${p ? '' : ` — ${d}`}`);
const hoursAgo = (h: number) => new Date(Date.now() - h * 3_600_000).toISOString();

/* ── Is it due? ─────────────────────────────────────────────────────────── */

ok('never run is due', cadenceDue('daily', null));
/* An unreadable stamp must not park an agent for ever. Due is recoverable;
   never running again is not. */
ok('an unreadable stamp is due rather than stuck', cadenceDue('daily', 'not a date'));
ok('daily is not due four hours later', !cadenceDue('daily', hoursAgo(4)));
/*
 * Twenty hours rather than twenty-four, and this is the whole point of the
 * number. A tick landing a few minutes early on a 24-hour rule pushes today's
 * post to tomorrow, and then the day after — the drift that made the content
 * plays stop producing anything at all.
 */
ok('daily is due at twenty-one hours, not twenty-four', cadenceDue('daily', hoursAgo(21)));
ok('weekly is not due after two days', !cadenceDue('weekly', hoursAgo(48)));
ok('weekly is due after a week', cadenceDue('weekly', hoursAgo(24 * 7)));
ok('monthly is not due after a fortnight', !cadenceDue('monthly', hoursAgo(24 * 14)));
/* An unknown cadence falls back to daily rather than to "never" or "always":
   a config written by a newer builder must not strand or spam. */
ok('an unknown cadence behaves as daily', cadenceDue('fortnightly', hoursAgo(21))
  && !cadenceDue('fortnightly', hoursAgo(4)));

/* Weekdays, and named days. Tested at fixed instants: 2026-09-26 is a
   Saturday, 2026-09-28 a Monday. */
const SAT = Date.parse('2026-09-26T09:00:00Z');
const MON = Date.parse('2026-09-28T09:00:00Z');
const dayBefore = (t: number) => new Date(t - 21 * 3_600_000).toISOString();
ok('weekdays is not due on a Saturday', !cadenceDue('weekdays', dayBefore(SAT), SAT));
ok('weekdays is due on a Monday', cadenceDue('weekdays', dayBefore(MON), MON));
ok('mon,wed,fri is due on a Monday', cadenceDue('daily', dayBefore(MON), MON, 'mon,wed,fri'));
ok('mon,wed,fri is not due on a Saturday', !cadenceDue('daily', dayBefore(SAT), SAT, 'mon,wed,fri'));
ok('named days still wait twenty hours', !cadenceDue('daily', new Date(MON - 3_600_000).toISOString(), MON, 'mon'));
ok('a first run is due on any day — it is the proof it works', cadenceDue('weekdays', null, SAT));
ok('nonsense days are ignored rather than stopping it', cadenceDue('daily', dayBefore(SAT), SAT, 'someday'));

/* ── A YouTube channel ──────────────────────────────────────────────────── */

ok('a bare channel ID becomes the feed',
  youtubeFeed('UCBJycsmduvYEL83R_U4JriQ').url.endsWith('channel_id=UCBJycsmduvYEL83R_U4JriQ'));
ok('a channel URL becomes the feed',
  youtubeFeed('https://www.youtube.com/channel/UCBJycsmduvYEL83R_U4JriQ').url.includes('videos.xml'));
ok('a feed address is left alone',
  youtubeFeed('https://www.youtube.com/feeds/videos.xml?channel_id=UCBJycsmduvYEL83R_U4JriQ').url.includes('videos.xml'));
/*
 * The one that matters. A handle cannot be turned into an ID without asking
 * YouTube, and this runs on a cron with nobody to ask. Accepting it would mean
 * an agent that fetches nothing every morning for ever while the screen says it
 * is watching a channel.
 */
{
  const r = youtubeFeed('https://www.youtube.com/@mkbhd');
  ok('a handle is refused rather than accepted and silently useless', !r.url && !!r.problem, JSON.stringify(r));
  ok('and the refusal says how to fix it', /channel ID|starts with UC/i.test(r.problem), r.problem);
}
ok('a video link is refused too', !youtubeFeed('https://youtu.be/dQw4w9WgXcQ').url);
ok('nothing set is named as nothing set', /No channel/.test(youtubeFeed('  ').problem));

/* ── Reading a feed ─────────────────────────────────────────────────────── */

const RSS = `<?xml version="1.0"?>
<rss version="2.0"><channel>
  <title>The channel itself, which is not an item</title>
  <item>
    <title>Boiler grants extended</title>
    <link>https://example.com/one</link>
    <description><![CDATA[<p>The scheme now runs to <b>March</b>.</p>]]></description>
    <pubDate>Mon, 21 Sep 2026 08:00:00 GMT</pubDate>
  </item>
  <item>
    <title>Second story &amp; a half</title>
    <link>https://example.com/two</link>
    <description>Plain text summary.</description>
    <pubDate>Sun, 20 Sep 2026 08:00:00 GMT</pubDate>
  </item>
</channel></rss>`;

{
  const items = parseFeed(RSS);
  ok('an RSS feed gives one item per <item>', items.length === 2, String(items.length));
  /* The channel's own <title> sits outside any item. Picking it up would mean
     the agent writing an article about the feed rather than about the news. */
  ok('and not the channel title', !items.some(i => /the channel itself/i.test(i.title)),
    JSON.stringify(items.map(i => i.title)));
  ok('the markup inside a summary is stripped',
    items[0].summary === 'The scheme now runs to March.', JSON.stringify(items[0].summary));
  ok('entities are decoded', items[1].title === 'Second story & a half', items[1].title);
  ok('the link comes through', items[0].link === 'https://example.com/one', items[0].link);
}

const ATOM = `<?xml version="1.0" encoding="UTF-8"?>
<feed xmlns="http://www.w3.org/2005/Atom">
  <title>A channel</title>
  <entry>
    <title>How to bleed a radiator</title>
    <link rel="alternate" href="https://www.youtube.com/watch?v=abc"/>
    <published>2026-09-21T09:00:00+00:00</published>
    <media:group><media:description>Three minutes, one spanner.</media:description></media:group>
  </entry>
</feed>`;

{
  const items = parseFeed(ATOM);
  ok('an Atom feed gives one item per <entry>', items.length === 1, String(items.length));
  /* Atom puts the address in an attribute rather than in the element, which is
     the difference that silently returns an empty link if it is missed. */
  ok('and the link is read from the href attribute',
    items[0].link === 'https://www.youtube.com/watch?v=abc', items[0].link);
  ok('a YouTube description is found', /one spanner/.test(items[0].summary), items[0].summary);
}

ok('a page that is not a feed gives nothing rather than nonsense',
  parseFeed('<html><body><item>not a feed</item></body></html>').length === 0
  || parseFeed('<html><body>no items at all</body></html>').length === 0);
ok('an empty document gives nothing', parseFeed('').length === 0);

/* ── The design it composes ─────────────────────────────────────────────── */

{
  const d = designFromPost(
    { platform: 'instagram', headline: 'Winter is when boilers give up', body: 'A caption.', hashtags: ['#heating'] },
    { id: 'sp-1', brandColor: '#5b7cfa', company: 'Northside Plumbing', source: { origin: 'autopilot' }, now: '2026-09-23T00:00:00.000Z' },
  );
  /*
   * The check this was written for. A thin record — platform and caption and
   * nothing else — normalises into a canvas with no elements, which renders as
   * a blank white square. A gallery of those is not "daily image posts"
   * however good the captions underneath are.
   */
  ok('the design has real elements rather than being a blank canvas',
    Array.isArray(d.elements) && (d.elements as unknown[]).length >= 2, JSON.stringify(d.elements ?? null).slice(0, 120));
  ok('the headline is on the image',
    JSON.stringify(d.elements).includes('Winter is when boilers give up'));
  ok('the caption travels with it', String(d.caption).includes('A caption.'));
  ok('it is square for Instagram', d.aspectRatio === '1:1' && d.canvasWidth === 1080);
  ok('and wide for LinkedIn', designFromPost(
    { platform: 'linkedin', headline: 'x', body: '', hashtags: [] },
    { id: 'sp-2', brandColor: '#000', company: 'c', source: {}, now: '' },
  ).aspectRatio === '16:9');
  /* Nothing arrives switched on, here as everywhere. */
  ok('every post arrives as a draft', d.status === 'draft');
  /* Locked elements would mean the first thing somebody tries to do — drag the
     headline — does nothing, with no explanation. */
  ok('and nothing on it is locked',
    (d.elements as { locked: boolean }[]).every(e => e.locked === false));
  ok('an unknown platform falls back rather than being written through', designFromPost(
    { platform: 'myspace', headline: 'x', body: '', hashtags: [] },
    { id: 'sp-3', brandColor: '#000', company: 'c', source: {}, now: '' },
  ).platform === 'instagram');
}

/* ── Reading JSON the model was not allowed to send as JSON ──────────────── */

{
  /*
   * Grounded search refuses Gemini's JSON mode, so the model is asked for JSON
   * in plain text and `extractJson` finds it. These are the shapes models
   * actually send back; each one losing a morning's research on a cron, with
   * nobody watching, is the failure being pinned.
   */
  const clean = extractJson<{ findings: unknown[] }>('{"findings": [{"title": "a"}]}');
  ok('plain JSON is read', clean?.findings.length === 1);

  const fenced = extractJson<{ findings: unknown[] }>('```json\n{"findings": [{"title": "a"}]}\n```');
  ok('JSON in a code fence is read', fenced?.findings.length === 1);

  const chatty = extractJson<{ findings: unknown[] }>('Here is what I found:\n{"findings": [{"title": "a"}, {"title": "b"}]}\nLet me know!');
  ok('JSON with chatter either side is read', chatty?.findings.length === 2);

  const trailing = extractJson<{ findings: unknown[] }>('{"findings": [{"title": "a",},],}');
  ok('a trailing comma does not lose the result', trailing?.findings.length === 1);

  ok('prose with no JSON in it is null rather than a throw', extractJson('I could not find anything.') === null);
  ok('broken JSON is null rather than a throw', extractJson('{"findings": [ {"title": }') === null);
}

for (const line of out) console.log(line);
const failed = out.filter(l => l.startsWith('FAIL')).length;
console.log(`\n${out.length - failed}/${out.length} passed`);
process.exit(failed ? 1 : 0);
