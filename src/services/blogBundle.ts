/**
 * The export bundle: a folder of files anybody can upload anywhere.
 *
 * Not every customer has WordPress, and some have a static host, a Squarespace
 * page they paste into, or a developer who wants the markup. So the universal
 * path is a ZIP containing one HTML file per post, the images as real files,
 * a sitemap, a feed, robots.txt and a short README saying where to put it all.
 *
 * The ZIP is written by hand rather than pulled in as a dependency. It is about
 * eighty lines because the format allows stored (uncompressed) entries, and the
 * files going in — JPEG covers and small HTML documents — are either already
 * compressed or trivially small, so a deflate implementation would add a great
 * deal of code to save very little.
 *
 * Images are extracted out of the HTML into /images and the src attributes are
 * rewritten to point at them. Left as data URLs they would inflate every page
 * by a third, could not be cached between posts, and would be re-downloaded on
 * every visit — the opposite of what a page trying to rank wants.
 */
import {
  buildRobots, buildRss, buildSitemap, livePosts, postUrl, renderPage, siteRoot, trimSlashes,
  type PublishedPost,
} from './blogExport';
import { imagesOf } from './blogImages';
import type { BlogProject, MonthPlan, PublishTarget } from '../types/blogAutomation';

/* ── ZIP ── */

const CRC_TABLE = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xEDB88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c >>> 0;
  }
  return t;
})();

function crc32(bytes: Uint8Array): number {
  let c = 0xFFFFFFFF;
  for (let i = 0; i < bytes.length; i++) c = CRC_TABLE[(c ^ bytes[i]) & 0xFF] ^ (c >>> 8);
  return (c ^ 0xFFFFFFFF) >>> 0;
}

export interface BundleFile { name: string; bytes: Uint8Array }

/**
 * A store-only ZIP.
 *
 * The UTF-8 name flag (bit 11) is set, without which a filename outside ASCII
 * is decoded with whatever code page the unzipping machine happens to use.
 */
export function makeZip(files: BundleFile[]): Blob {
  const enc = new TextEncoder();
  const chunks: Uint8Array[] = [];
  const central: Uint8Array[] = [];
  let offset = 0;

  const u16 = (v: number) => new Uint8Array([v & 0xFF, (v >> 8) & 0xFF]);
  const u32 = (v: number) => new Uint8Array([v & 0xFF, (v >> 8) & 0xFF, (v >> 16) & 0xFF, (v >>> 24) & 0xFF]);
  const join = (parts: Uint8Array[]) => {
    const total = parts.reduce((n, p) => n + p.length, 0);
    const out = new Uint8Array(total);
    let at = 0;
    for (const p of parts) { out.set(p, at); at += p.length; }
    return out;
  };

  for (const f of files) {
    const name = enc.encode(f.name);
    const crc = crc32(f.bytes);
    const local = join([
      u32(0x04034b50), u16(20), u16(0x0800), u16(0), u16(0), u16(0),
      u32(crc), u32(f.bytes.length), u32(f.bytes.length), u16(name.length), u16(0),
      name, f.bytes,
    ]);
    chunks.push(local);

    central.push(join([
      u32(0x02014b50), u16(20), u16(20), u16(0x0800), u16(0), u16(0), u16(0),
      u32(crc), u32(f.bytes.length), u32(f.bytes.length),
      u16(name.length), u16(0), u16(0), u16(0), u16(0), u32(0), u32(offset),
      name,
    ]));
    offset += local.length;
  }

  const dir = join(central);
  const end = join([
    u32(0x06054b50), u16(0), u16(0), u16(files.length), u16(files.length),
    u32(dir.length), u32(offset), u16(0),
  ]);

  return new Blob([join(chunks) as unknown as BlobPart, dir as unknown as BlobPart, end as unknown as BlobPart], { type: 'application/zip' });
}

/* ── Images out of the markup ── */

const EXT: Record<string, string> = {
  'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp', 'image/gif': 'gif',
};

function decodeDataUrl(dataUrl: string): { bytes: Uint8Array; ext: string } | null {
  const m = /^data:([^;,]+);base64,(.+)$/s.exec(dataUrl);
  if (!m) return null;
  const ext = EXT[m[1].toLowerCase()];
  if (!ext) return null;
  try {
    const bin = atob(m[2].replace(/\s/g, ''));
    const bytes = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
    return { bytes, ext };
  } catch { return null; }
}

/* ── The bundle ── */

export interface BundleResult {
  blob: Blob;
  files: string[];
  bytes: number;
  posts: number;
  /** Posts that had no article, or no live record, and were left out. */
  skipped: string[];
}

/**
 * Everything needed to serve this month's posts from a folder.
 *
 * Only posts that are marked live on this target go in. A bundle containing
 * drafts would put unfinished writing on a public server the moment it was
 * uploaded, which is the one mistake this feature must never make easy.
 */
export function buildBundle(project: BlogProject, plan: MonthPlan, target: PublishTarget): BundleResult {
  const enc = new TextEncoder();
  const files: BundleFile[] = [];
  const skipped: string[] = [];

  const live: PublishedPost[] = livePosts(plan, target.id);
  for (const p of plan.posts) {
    if (!live.some(l => l.post.id === p.id)) skipped.push(p.title);
  }

  const base = trimSlashes(target.basePath || '');
  const dir = base ? `${base}/` : '';

  for (const { post, article, record } of live) {
    /* Every image becomes a file, whether or not it appears in the body — the
       cover usually does not, and it still has to exist for the share card. */
    let html = article.html;
    let coverUrl: string | undefined;
    for (const [i, img] of imagesOf(article).entries()) {
      const decoded = decodeDataUrl(img.dataUrl);
      if (!decoded) continue;
      const name = `images/${article.seo.slug}-${i + 1}.${decoded.ext}`;
      files.push({ name, bytes: decoded.bytes });
      // Pages sit one directory deep under a base path, so a reference from
      // inside the markup has to climb back out to the shared image folder.
      html = html.split(img.dataUrl).join(`${dir ? '../' : './'}${name}`);
      // og:image, by contrast, must be absolute: a crawler resolving it has no
      // reliable base to work from.
      if (img.role === 'cover' && !coverUrl) coverUrl = `${siteRoot(target)}/${name}`;
    }

    const page = renderPage({
      post,
      article: { ...article, html },
      project,
      target,
      publishedAt: record.at || article.writtenAt || new Date().toISOString(),
      coverUrl,
    });
    files.push({ name: `${dir}${article.seo.slug}/index.html`, bytes: enc.encode(page) });
  }

  files.push({ name: 'sitemap.xml', bytes: enc.encode(buildSitemap(target, live)) });
  files.push({ name: 'feed.xml', bytes: enc.encode(buildRss(project, target, live)) });
  files.push({ name: 'robots.txt', bytes: enc.encode(buildRobots(target)) });
  files.push({ name: 'README.txt', bytes: enc.encode(readme(project, target, live)) });

  const blob = makeZip(files);
  return { blob, files: files.map(f => f.name), bytes: blob.size, posts: live.length, skipped };
}

function readme(project: BlogProject, target: PublishTarget, live: PublishedPost[]): string {
  const base = trimSlashes(target.basePath || '');
  return `${project.name || 'Blog'} — ${live.length} post${live.length === 1 ? '' : 's'}

WHERE THESE GO
Upload the contents of this zip to the root of ${target.siteUrl}, keeping the
folder structure exactly as it is. Each post is a folder with an index.html
inside, so ${postUrl(target, live[0]?.article.seo.slug || 'example')}
serves the first one without any server configuration.

WHAT IS IN HERE
${base ? `  ${base}/<slug>/index.html` : '  <slug>/index.html'}   one page per post
  images/                    covers and in-article pictures
  sitemap.xml                submit this in Google Search Console
  feed.xml                   RSS, for readers and aggregators
  robots.txt                 points crawlers at the sitemap

BEFORE YOU UPLOAD
  • robots.txt goes at the very root of the domain. If you already have one,
    add the Sitemap: line from this one to it rather than replacing yours.
  • If you already publish a sitemap, merge these URLs into it instead of
    overwriting — two sitemaps that disagree is worse than one.
  • The canonical URL in every page assumes the site is ${target.siteUrl}.
    If you serve it from somewhere else, the canonical tags will point at the
    wrong place and the posts will not rank where you expect.

Generated ${new Date().toISOString().slice(0, 10)}.
`;
}

/** Hand the bundle to the browser as a download. */
export function downloadBundle(result: BundleResult, filename: string) {
  const url = URL.createObjectURL(result.blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  // Revoke on the next turn: revoking synchronously can cancel the download in
  // some browsers before it has started reading the blob.
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
}
