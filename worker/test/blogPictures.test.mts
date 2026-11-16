/**
 * Blog posts with real pictures, and those pictures reaching WordPress.
 *
 * Run with `npm run test:blogimages`. No Worker and no database: the picture
 * step and the WordPress upload are plain functions over `fetch`, so a stand-in
 * HTTP server plays both Openverse (OPENVERSE_BASE) and a WordPress REST API,
 * and records what it was sent.
 *
 * ── What is worth testing ──
 *
 * The cases that look fine from outside and are not: a CC BY photo slipping
 * onto a post with no credit, a picture landing between a question heading and
 * its answer, the post failing because one picture would not upload, a second
 * publish filling the media library with copies, and a library that is down
 * being reported as a post with no pictures and no reason.
 */
import http from 'node:http';
import type { AddressInfo } from 'node:net';
import {
  cleanQueries, illustratePost, markdownToHtml, pickPostPictures, placePictures, type PostPicture,
} from '../src/lib/blogPictures';
import { publishPost, sendPicturesToWordPress, type PublishTarget } from '../src/lib/publishTarget';
import { blogPostPrompt, type Brand } from '../src/lib/autopilotWrite';
import type { Env } from '../src/lib/db';

const out: string[] = [];
const ok = (n: string, p: boolean, d: unknown = '') => out.push(`${p ? 'PASS' : 'FAIL'}  ${n}${p ? '' : ` — ${typeof d === 'string' ? d : JSON.stringify(d).slice(0, 500)}`}`);

/* ── The stand-in: Openverse and WordPress on one port ── */

const id = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
/* Different bytes per photo: the upload is de-duplicated by a hash of the bytes. */
const jpeg = (n: number) => Buffer.from([0xff, 0xd8, 0xff, 0xe0, n, 2, 3, 4, 5, 6, 0xff, 0xd9]);
const JPEG_LEN = 12;
const photo = (n: number, extra: Record<string, unknown> = {}) => ({
  id: id(n), title: `Photo ${n}`, creator: `Maker ${n}`, license: 'cc0', url: '', foreign_landing_url: `https://www.flickr.com/photos/x/${n}`,
  width: 1600, height: 1000, source: 'flickr', mature: false, ...extra,
});
const library: Record<string, ReturnType<typeof photo>[]> = {
  'plumber fixing sink': [
    photo(1, { license: 'by' }),                      // needs a credit: never used
    photo(2, { mature: true }),                       // never used
    photo(3, { width: 600, height: 1200 }),           // portrait: ranked after landscape
    photo(4),
    photo(5),
  ],
  'leaking pipe': [photo(6), photo(4)],             // 4 again: must not be used twice
  'water heater': [photo(7)],
};
const byId = new Map(Object.values(library).flat().map(p => [p.id, p]));
let openverseDown = false;
let searches: string[] = [];

const wp = { user: 'editor', pass: 'abcd efgh ijkl', media: [] as { id: number; type: string; disposition: string; alt: string; bytes: number; source_url: string }[], posts: [] as Record<string, unknown>[], next: 500, refuseMedia: false, mediaCalls: 0 };

let M = '';
const server = http.createServer((req, res) => {
  const chunks: Buffer[] = [];
  req.on('data', c => chunks.push(c));
  req.on('end', () => {
    const raw = Buffer.concat(chunks);
    const u = new URL(req.url ?? '/', M);
    const send = (s: number, j: unknown) => { res.writeHead(s, { 'Content-Type': 'application/json' }); res.end(JSON.stringify(j)); };

    /* Openverse */
    if (u.pathname === '/v1/images/') {
      if (openverseDown) return send(503, { detail: 'down' });
      const q = u.searchParams.get('q') ?? '';
      searches.push(`${q}|${u.searchParams.get('license')}`);
      return send(200, { results: (library[q] ?? []).map(p => ({ ...p, url: `${M}/img/${p.id}.jpg` })) });
    }
    const meta = /^\/v1\/images\/([0-9a-f-]{36})\/$/.exec(u.pathname);
    if (meta) {
      const p = byId.get(meta[1]);
      return p && !openverseDown ? send(200, { ...p, url: `${M}/img/${p.id}.jpg` }) : send(404, {});
    }
    if (u.pathname.startsWith('/img/')) {
      const b = jpeg(Number(u.pathname.slice(-8, -4)));
      res.writeHead(200, { 'Content-Type': 'image/jpeg', 'Content-Length': String(b.length) }); return res.end(b);
    }

    /* WordPress */
    if (!u.pathname.startsWith('/wp-json/')) return send(404, {});
    if (req.headers.authorization !== 'Basic ' + Buffer.from(`${wp.user}:${wp.pass}`).toString('base64')) return send(401, { message: 'bad password' });
    const p = u.pathname.slice('/wp-json'.length);
    if (p === '/wp/v2/media' && req.method === 'POST') {
      wp.mediaCalls++;
      if (wp.refuseMedia) return send(403, { code: 'rest_cannot_create', message: 'Sorry, you are not allowed to upload files.' });
      const disposition = String(req.headers['content-disposition'] ?? '');
      const name = /filename="([^"]+)"/.exec(disposition)?.[1] ?? 'x.jpg';
      const m = { id: wp.next++, type: String(req.headers['content-type']), disposition, alt: u.searchParams.get('alt_text') ?? '', bytes: raw.length, source_url: `https://myblog.example/wp-content/uploads/${name}` };
      wp.media.push(m);
      return send(201, { id: m.id, source_url: m.source_url, alt_text: m.alt });
    }
    if (p === '/wp/v2/media' && req.method === 'GET') {
      const q = u.searchParams.get('search') ?? '';
      return send(200, wp.media.filter(m => m.source_url.includes(q)).map(m => ({ id: m.id, source_url: m.source_url })));
    }
    if (p === '/wp/v2/posts' && req.method === 'POST') {
      const body = JSON.parse(raw.toString() || '{}');
      wp.posts.push(body);
      return send(201, { id: 900 + wp.posts.length, link: `https://myblog.example/?p=${900 + wp.posts.length}` });
    }
    send(404, { code: 'rest_no_route' });
  });
});
await new Promise<void>(r => server.listen(0, '127.0.0.1', r));
M = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
const env = { OPENVERSE_BASE: M, APP_ORIGIN: 'https://app.protectedcentral.test' } as unknown as Env;

/* ── The prompt holds the structure and the bans ── */

const brand: Brand = { companyName: 'Flow Right Plumbing', industry: 'Plumbing', description: 'Emergency plumbing', products: 'Repairs', audience: 'Homeowners', tone: '', website: 'https://flowright.example', objective: '' };
const prompt = blogPostPrompt(brand, 'How to stop a leaking tap');
ok('prompt: title under 60 characters with the main phrase', /under 60 characters/.test(prompt));
ok('prompt: opening answers the question', /answer the searcher's question directly/.test(prompt));
ok('prompt: key takeaways and an FAQ of three or four', prompt.includes('## Key takeaways') && prompt.includes('## Frequently asked questions') && /three or four questions/.test(prompt));
ok('prompt: no statistics, percentages, studies or quotes', /no statistics, percentages, survey or study results/.test(prompt) && /quotes/.test(prompt));
ok('prompt: bans the AI-tell phrases', ['delve', 'unlock', 'game-changer', 'navigating the landscape', 'in conclusion', "it's important to note", "in today's fast-paced world"].every(x => prompt.includes(`"${x}"`)));
ok('prompt: asks for metaDescription and imageQueries', prompt.includes('"metaDescription"') && prompt.includes('"imageQueries"'));
ok('prompt: a questions-and-answers post has no second FAQ', !blogPostPrompt(brand, 't', 'qa').includes('## Frequently asked questions'));

/* ── Suggested searches ── */

const qs = cleanQueries([{ query: 'Plumber, fixing! sink', alt: 'A plumber [under] a sink' }, 'leaking pipe', { query: 'plumber fixing sink' }, 'a', 'b'], { title: 'T' });
ok('queries: punctuation stripped, duplicates and a fourth dropped', qs.length === 3 && qs[0].query === 'Plumber fixing sink' && qs[1].query === 'leaking pipe', qs);
ok('queries: alt text cannot break the Markdown', qs[0].alt === 'A plumber under a sink', qs[0]);
ok('queries: none suggested falls back to the first keyword', cleanQueries(undefined, { title: 'Fix a tap', keywords: ['tap repair'] })[0]?.query === 'tap repair');

/* ── Choosing pictures ── */

const picked = await pickPostPictures(env, [
  { query: 'plumber fixing sink', alt: 'A plumber working under a kitchen sink' },
  { query: 'leaking pipe', alt: 'Water dripping from a pipe joint' },
  { query: 'water heater', alt: 'A water heater in a utility room' },
], 'https://app.protectedcentral.test');
ok('openverse: searched with CC0 and public domain only', searches.every(s => s.endsWith('|cc0,pdm')), searches);
ok('pick: a cover, from the first search, licence-checked (no CC BY, no mature)', picked.cover?.id === id(4), picked.cover);
ok('pick: the cover is served through the Worker at APP_ORIGIN', picked.cover?.url === `https://app.protectedcentral.test/api/media.php?photo=${id(4)}`, picked.cover?.url);
ok('pick: two inline pictures, one per later search, never the cover again', picked.inline.length === 2 && picked.inline[0].id === id(6) && picked.inline[1].id === id(7), picked.inline.map(p => p.id));
ok('pick: carries alt, creator, licence and source page', picked.inline[0].alt === 'Water dripping from a pipe joint' && picked.inline[0].creator === 'Maker 6' && /CC0/.test(picked.inline[0].license) && picked.inline[0].landing.includes('flickr.com'));
ok('pick: nothing to report when it found everything', picked.note === '', picked.note);
const nothing = await pickPostPictures(env, [{ query: 'zzz nothing', alt: '' }], '');
ok('pick: nothing matched is said, by search', !nothing.cover && /No free pictures matched “zzz nothing”/.test(nothing.note), nothing);

/* ── Placing them ── */

const md = `A dripping tap is usually a worn washer, and you can often fix it in under an hour.

## Turn the water off first
Find the isolation valve under the sink.
Turn it a quarter turn.

## Take the tap apart
- Remove the handle
- Unscrew the headgear

## Key takeaways
- Water off first.

## Frequently asked questions
### Do I need a plumber?
Not usually.`;
const placed = placePictures(md, picked.inline);
const lines = placed.body.split('\n');
const firstImg = lines.findIndex(l => l.startsWith('!['));
ok('place: both pictures placed', placed.placed.length === 2 && (placed.body.match(/!\[/g) ?? []).length === 2, placed.body);
ok('place: after the answer paragraph, not between heading and answer', lines[firstImg - 2] === 'Turn it a quarter turn.' || lines[firstImg - 1] === 'Turn it a quarter turn.', lines.slice(firstImg - 3, firstImg + 2));
ok('place: never under Key takeaways or the FAQ', !/## Key takeaways\n+!\[/.test(placed.body) && placed.body.indexOf('![') < placed.body.indexOf('## Key takeaways') && placed.body.lastIndexOf('![') < placed.body.indexOf('## Key takeaways'));
ok('place: a credit line under each picture', (placed.body.match(/^\*Photo by Maker \d · CC0 1\.0 \(public domain dedication\) · via \[flickr\]\(https:\/\/www\.flickr\.com/gm) ?? []).length === 2, placed.body);
ok('place: one H2 takes one picture, the other is dropped (not claimed as placed)', placePictures('Intro.\n\n## Only one\nText.', picked.inline).placed.length === 1);

/* ── Openverse down: the post is still saved, and says why ── */

openverseDown = true;
const down = await illustratePost(env, { title: 'Fix a tap', body: md, imageQueries: [{ query: 'plumber fixing sink', alt: 'x' }] });
ok('down: body untouched, no pictures', down.body === md && down.images.length === 0);
ok('down: the note says Openverse did not answer', /Openverse\) did not answer/.test(down.note), down.note);
openverseDown = false;
const good = await illustratePost(env, { title: 'Fix a tap', body: md, imageQueries: [{ query: 'plumber fixing sink', alt: 'A plumber' }, { query: 'leaking pipe', alt: 'A pipe' }] });
ok('illustrate: a cover and an inline picture, stored with roles', good.images.map(i => i.role).join(',') === 'cover,inline' && good.body.includes('/api/media.php?photo='), good.images);

/* ── Markdown → HTML for WordPress ── */

const html = markdownToHtml(`${good.body}\n\n1. One\n2. Two\n\nSome <script>alert(1)</script> **bold** and [a link](https://flowright.example/contact).`);
ok('html: ## is h2, ### is h3', html.includes('<h2>Turn the water off first</h2>') && html.includes('<h3>Do I need a plumber?</h3>'));
ok('html: bullet and numbered lists', html.includes('<ul><li>Remove the handle</li><li>Unscrew the headgear</li></ul>') && html.includes('<ol><li>One</li><li>Two</li></ol>'));
ok('html: a picture is a figure with alt and its credit as the caption', /<figure><img src="https:\/\/app\.protectedcentral\.test\/api\/media\.php\?photo=[0-9a-f-]+" alt="A pipe" loading="lazy" \/><figcaption>Photo by Maker \d · CC0[^<]*<a href="https:\/\/www\.flickr\.com[^"]*">flickr<\/a><\/figcaption><\/figure>/.test(html), html.slice(html.indexOf('<figure>'), html.indexOf('</figure>') + 9));
ok('html: text is escaped, links and bold kept', html.includes('&lt;script&gt;') && !html.includes('<script>') && html.includes('<strong>bold</strong>') && html.includes('<a href="https://flowright.example/contact">a link</a>'));

/* ── WordPress: upload, featured image, rewritten src ── */

const target: PublishTarget = { kind: 'wordpress', siteUrl: M, username: wp.user, appPassword: wp.pass, verifiedAt: null, lastError: '' };
const cover = good.images.find(i => i.role === 'cover') as PostPicture;
const res = await publishPost(target, { title: 'Fix a dripping tap', html, excerpt: 'How to fix it.', slug: 'fix-a-dripping-tap', cover: { src: cover.url, alt: cover.alt } }, env);
const sent = wp.posts.at(-1) ?? {};
ok('wp: the post published', res.ok, res);
ok('wp: two pictures uploaded to the media library', wp.media.length === 2, wp.media);
ok('wp: upload sends the bytes, the type and a named file', wp.media.every(m => m.bytes === JPEG_LEN && m.type === 'image/jpeg' && /^attachment; filename="fix-a-dripping-tap-[0-9a-f]{10}\.jpg"$/.test(m.disposition)), wp.media);
ok('wp: upload carries the alt text', wp.media.length === 2 && wp.media[0].alt === 'A plumber' && wp.media[1].alt === 'A pipe', wp.media.map(m => m.alt));
ok('wp: the cover is the featured image', sent.featured_media === wp.media[0]?.id, sent.featured_media);
const content = String(sent.content ?? '');
ok('wp: inline src rewritten to the WordPress copy, with its wp-image class', content.includes(`src="${wp.media[1]?.source_url}"`) && content.includes(`class="wp-image-${wp.media[1]?.id}"`) && !content.includes('/api/media.php'), content.slice(content.indexOf('<figure'), content.indexOf('</figure>')));
ok('wp: the result says what happened to the pictures', /2 pictures added to the WordPress media library, the cover as the featured image/.test(res.pictures), res.pictures);

/* Publishing the same post again finds the copies already there. */
const before = wp.mediaCalls;
await publishPost(target, { title: 'Fix a dripping tap', html, excerpt: '', slug: 'fix-a-dripping-tap', cover: { src: cover.url, alt: cover.alt } }, env);
ok('wp: a second publish uploads nothing new', wp.mediaCalls === before && wp.media.length === 2 && wp.posts.at(-1)?.featured_media === wp.media[0]?.id, { calls: wp.mediaCalls - before });

/* A cover drawn in Blog Automation arrives as a data URL. */
const dataUrl = `data:image/png;base64,${Buffer.from([0x89, 0x50, 0x4e, 0x47, 9, 9]).toString('base64')}`;
const drawn = await sendPicturesToWordPress(env, { base: M, username: wp.user, appPassword: wp.pass }, `<p>x</p><figure><img src="${dataUrl}" alt="Chart" /></figure>`, { src: dataUrl, alt: 'Cover card' }, 'Drawn cover');
ok('wp: a data-URL picture is uploaded once and used as cover and inline', drawn.sent === 1 && drawn.featuredMedia === wp.media.at(-1)?.id && wp.media.at(-1)?.type === 'image/png' && !drawn.html.includes('data:'), drawn);

/* ── Partial failure: a picture refused, the post still goes up ── */

wp.refuseMedia = true;
const fresh = good.body.replace(/photo=[0-9a-f-]+/g, `photo=${id(5)}`);
const partial = await publishPost(target, { title: 'Another post', html: markdownToHtml(fresh), excerpt: '', slug: 'another', cover: { src: `${env.APP_ORIGIN}/api/media.php?photo=${id(5)}`, alt: 'c' } }, env);
const last = wp.posts.at(-1) ?? {};
ok('partial: the post is still published', partial.ok && wp.posts.length === 3, partial);
ok('partial: no featured image, the picture keeps its own address', !('featured_media' in last) && String(last.content).includes(`/api/media.php?photo=${id(5)}`), last);
ok('partial: the result names what could not be uploaded and why', /could not be uploaded/.test(partial.pictures) && /Author or above/.test(partial.pictures), partial.pictures);
wp.refuseMedia = false;

/* Openverse gone at publish time: the photo cannot be read, the post still goes. */
openverseDown = true;
const noLib = await sendPicturesToWordPress(env, { base: M, username: wp.user, appPassword: wp.pass }, '<p>x</p>', { src: `/api/media.php?photo=${id(7)}`, alt: 'c' }, 'p');
ok('partial: an unreadable photo is reported, not thrown', noLib.sent === 0 && noLib.failed.length === 1 && /the cover/.test(noLib.failed[0]), noLib);
openverseDown = false;

/* Someone else's hosted picture is left where it is. */
const theirs = await sendPicturesToWordPress(env, { base: M, username: wp.user, appPassword: wp.pass }, '<img src="https://cdn.other.example/a.jpg" alt="a" />', null, 'p');
ok('wp: a picture that is not ours is not uploaded or reported', theirs.sent === 0 && !theirs.failed.length && theirs.html.includes('cdn.other.example'));

server.close();
console.log(out.join('\n'));
const failed = out.filter(l => l.startsWith('FAIL')).length;
console.log(`\n${out.length - failed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
