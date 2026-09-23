/**
 * Workflows that run on a clock rather than on a person.
 *
 * ── What this is for ──
 *
 * "Attach our portfolio and post something about us every morning." "Watch this
 * news feed and turn anything new into a blog post." "Every time that channel
 * puts a video up, write it up and publish it." None of those sentences has a
 * contact in it, and the contact engine — `automationEngine.ts` — cannot run
 * them: every one of its runs is one person standing at one node, and the whole
 * table is built around that.
 *
 * Rather than inventing a stand-in person to walk through the graph (which
 * would leave every send step in the workflow cheerfully emailing a fake
 * address), a trigger may say `event: 'schedule'`, and a graph triggered that
 * way is run here instead. The two passes cannot collide: `triggerMatches()`
 * only ever sees contact events, and no contact event has kind `schedule`.
 *
 * ── What it produces, and where it lands ──
 *
 * Content, as drafts, in the module that already owns that kind of thing:
 * social posts in the Social Creator, articles in Blog, emails in Campaigns.
 * Each run records where its output went, so the project can link straight to
 * it rather than telling somebody to go and find it — the failure this codebase
 * has already had once, when Autopilot said it had written a post and the Blog
 * screen was empty.
 *
 * ── What it refuses to pretend ──
 *
 * A feed that could not be fetched is a failure and says the status code. A
 * feed with nothing new since last time is `skipped`, which is the ordinary
 * case on most mornings and is not the same as having run. Neither is reported
 * as an achievement, because "3 things done today" that were all "the feed was
 * empty" is exactly the kind of number that makes a customer stop believing the
 * rest of the screen.
 */
import { dataGet, dataPut, nowIso, type Env } from './db';
import { loadAiKey } from './ai';
import { urlProblem } from './readSite';
import {
  writeBlogPost, writeImagePosts, writeSequenceBatch,
  type Brand, type SourceItem,
} from './autopilotWrite';

const SOCIAL_KEY = 'crm_social_posts';
const BLOG_KEY = 'crm_blog_posts';
const SEQ_KEY = 'crm_sequences';
const ONBOARDING_KEY = 'crm_onboarding';

/** One workspace's agents may not run away with the whole tick. */
const MAX_AGENTS_PER_TICK = 8;
/** A long campaign is written a batch at a time; see `writeSequenceBatch`. */
const BATCH = 13;

function parse<T>(raw: string | null | undefined, fallback: T): T {
  try { return raw ? JSON.parse(raw) as T : fallback; } catch { return fallback; }
}

export interface AgentReport {
  ran: number;
  produced: number;
  skipped: number;
  failed: number;
}

interface GraphNode {
  id: string;
  type: string;
  label?: string;
  config?: Record<string, string>;
  nextId?: string | null;
}

interface WorkflowRow {
  id: string;
  account_id: string;
  project_id: string;
  name: string;
  nodes: string;
  last_run_at: string | null;
}

interface ProjectRow {
  id: string;
  name: string;
  portfolio_id: string;
  objective: string;
}

export interface RunLink { kind: string; id: string; label: string; route: string }

/* ── Is it due? ──────────────────────────────────────────────────────────── */

/**
 * How long a cadence waits, in hours.
 *
 * Hours rather than "the same time each day" on purpose: the cron fires every
 * five minutes and a wall-clock target would either need a timezone the
 * customer never gave us or would drift an hour twice a year. Twenty hours for
 * "daily" rather than twenty-four for the reason the content plays use the same
 * number — a tick that lands four minutes early must not push tomorrow's post
 * to the day after, and then the day after that.
 */
const CADENCE_HOURS: Record<string, number> = {
  hourly: 1,
  daily: 20,
  weekly: 24 * 6.5,
  monthly: 24 * 29,
};

export function cadenceDue(cadence: string, lastRunAt: string | null, now = Date.now()): boolean {
  /* Never run: due. Anything else would mean switching an agent on and being
     told nothing happened, with no way to tell whether it was broken. */
  if (!lastRunAt) return true;
  const then = Date.parse(lastRunAt);
  if (!Number.isFinite(then)) return true;
  const hours = CADENCE_HOURS[cadence] ?? CADENCE_HOURS.daily;
  return now - then >= hours * 3_600_000;
}

/* ── Reading a source ────────────────────────────────────────────────────── */

/**
 * A YouTube channel, as a feed address.
 *
 * YouTube publishes an Atom feed per channel and always has, which means
 * watching a channel needs no API key, no quota and no OAuth — three things
 * that would each be a reason this feature could not ship. It is keyed on the
 * channel *id*, though, and what somebody pastes is usually a handle
 * (`youtube.com/@name`) or a video they happened to be watching.
 *
 * A handle cannot be turned into an id without asking YouTube, and this runs on
 * a cron with no browser to ask in. So a handle is refused *by name*, with the
 * one instruction that fixes it, rather than being accepted and then silently
 * producing nothing every morning.
 */
export function youtubeFeed(raw: string): { url: string; problem: string } {
  const s = raw.trim();
  if (!s) return { url: '', problem: 'No channel is set.' };
  if (/^UC[\w-]{20,24}$/.test(s)) return { url: `https://www.youtube.com/feeds/videos.xml?channel_id=${s}`, problem: '' };
  if (/youtube\.com\/feeds\/videos\.xml/.test(s)) return { url: s, problem: '' };

  const byId = s.match(/youtube\.com\/channel\/(UC[\w-]{20,24})/i);
  if (byId) return { url: `https://www.youtube.com/feeds/videos.xml?channel_id=${byId[1]}`, problem: '' };

  if (/youtube\.com\/@|youtu\.be\/|youtube\.com\/watch/i.test(s)) {
    return {
      url: '',
      problem: 'That is a handle or a video link, and the channel feed needs the channel ID. Open the channel, click any video, then "…more" under the description — the ID starts with UC.',
    };
  }
  return { url: '', problem: 'That does not look like a YouTube channel. Paste the channel ID, which starts with UC.' };
}

/**
 * Pull the items out of a feed, RSS or Atom.
 *
 * A regex rather than a parser because a Worker has no DOM and pulling in an
 * XML library to read four fields is a lot of bundle for a job this small. It
 * is deliberately forgiving: a feed missing a summary is an item with no
 * summary, not a feed that failed. The one thing it will not do is return an
 * item with no title and no link, because that is indistinguishable from
 * having misread the document entirely.
 */
export function parseFeed(xml: string): SourceItem[] {
  const out: SourceItem[] = [];
  const strip = (s: string) => s
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"')
    .replace(/&#39;|&apos;/g, "'").replace(/&amp;/g, '&')
    .replace(/\s+/g, ' ')
    /* A tag becomes a space so `<b>a</b><i>b</i>` does not read as "ab" — which
       then leaves "March ." wherever the markup sat against punctuation. The
       space is taken back rather than not put there, because the alternative
       loses word boundaries everywhere to fix a full stop. */
    .replace(/ ([,.;:!?)\]])/g, '$1')
    .replace(/([(\[]) /g, '$1')
    .trim();
  const pick = (block: string, tag: string) => {
    const m = block.match(new RegExp(`<${tag}(?:\\s[^>]*)?>([\\s\\S]*?)</${tag}>`, 'i'));
    return m ? strip(m[1]) : '';
  };

  const blocks = xml.match(/<(item|entry)(?:\s[^>]*)?>[\s\S]*?<\/\1>/gi) ?? [];
  for (const block of blocks.slice(0, 20)) {
    const title = pick(block, 'title');
    /* Atom puts the address in an attribute, RSS in the element. */
    const href = block.match(/<link[^>]*\shref=["']([^"']+)["']/i)?.[1] ?? '';
    const link = pick(block, 'link') || href;
    if (!title && !link) continue;
    out.push({
      title: title || link,
      link,
      summary: pick(block, 'description') || pick(block, 'summary')
        || pick(block, 'content') || pick(block, 'media:description'),
      published: pick(block, 'pubDate') || pick(block, 'published') || pick(block, 'updated'),
    });
  }
  return out;
}

/** Fetch a feed, with the same address rules as reading a site. */
async function fetchFeed(raw: string): Promise<{ items: SourceItem[]; problem: string }> {
  const problem = urlProblem(raw);
  if (problem) return { items: [], problem };
  let res: Response;
  try {
    res = await fetch(raw.trim(), {
      redirect: 'follow',
      headers: {
        'User-Agent': 'ProtectedCentral-FeedReader/1.0 (+https://protectedcentral.com)',
        Accept: 'application/rss+xml, application/atom+xml, application/xml, text/xml',
      },
    });
  } catch (e) {
    return { items: [], problem: `That feed could not be reached: ${e instanceof Error ? e.message : String(e)}` };
  }
  if (!res.ok) return { items: [], problem: `That feed answered ${res.status}, so there was nothing to read.` };

  const text = (await res.text()).slice(0, 400_000);
  const items = parseFeed(text);
  if (!items.length) {
    return {
      items: [],
      problem: 'That address was reached but holds no feed items — check it is the feed address rather than the page it is on.',
    };
  }
  return { items, problem: '' };
}

/**
 * Only what is new.
 *
 * Without this, a daily agent rewrites the same top story every morning for a
 * week. Dates in feeds are unreliable enough that a missing or unparseable one
 * is treated as new rather than dropped — writing about something twice is a
 * nuisance, and silently never writing about anything is the failure.
 */
function sinceLast(items: SourceItem[], lastRunAt: string | null): SourceItem[] {
  if (!lastRunAt) return items;
  const cut = Date.parse(lastRunAt);
  if (!Number.isFinite(cut)) return items;
  return items.filter(it => {
    const at = Date.parse(it.published);
    return !Number.isFinite(at) || at > cut;
  });
}

/* ── The brand this agent writes as ──────────────────────────────────────── */

async function brandFor(env: Env, accountId: string, project: ProjectRow): Promise<Brand> {
  let ob: Record<string, string> = {};
  if (project.portfolio_id) {
    const row = await env.DB.prepare('SELECT profile FROM crm_portfolios WHERE id = ? AND account_id = ?')
      .bind(project.portfolio_id, accountId).first<{ profile: string }>();
    ob = parse<Record<string, string>>(row?.profile ?? '', {});
  }
  if (!ob.companyName) {
    ob = { ...parse<Record<string, string>>(await dataGet(env.DB, accountId, ONBOARDING_KEY), {}), ...ob };
  }
  return {
    companyName: ob.companyName ?? ob.businessName ?? '',
    industry: ob.industry ?? '',
    description: ob.description ?? ob.whatYouDo ?? '',
    products: ob.products ?? ob.services ?? '',
    audience: ob.audience ?? ob.idealCustomer ?? '',
    tone: ob.brandVoice ?? ob.tone ?? '',
    website: ob.website ?? '',
    objective: project.objective ?? '',
  };
}

/** Is there enough in the portfolio to write from at all? */
function portfolioThin(b: Brand): boolean {
  return !(b.companyName || b.description || b.products).trim();
}

/* ── Composing a post that is actually an image ──────────────────────────── */

const ACCENT = '#c7f441';

/**
 * A headline and a caption, as a design the Social Creator can open.
 *
 * ── Why this is composed here rather than left as text ──
 *
 * A thin record — platform, caption, nothing else — normalises into a design
 * with no elements, which is a blank white square. Somebody who asked for daily
 * image posts and finds a gallery of empty squares has been given nothing,
 * however good the caption underneath is.
 *
 * So the headline is set on a gradient in the client's brand colour and the
 * whole thing is a real, editable canvas: every element unlocked, so the first
 * thing somebody does can be to drag it about.
 *
 * It composes rather than generates: no image model is involved and none is
 * claimed. What this makes is type on a colour, which is what most of these
 * posts are anyway — and unlike a generated photograph it never shows a
 * six-fingered plumber.
 */
export function designFromPost(
  post: { platform: string; headline: string; body: string; hashtags: string[] },
  opts: { id: string; brandColor: string; company: string; source: unknown; now: string },
): Record<string, unknown> {
  const platform = ['instagram', 'facebook', 'linkedin', 'twitter', 'tiktok', 'youtube']
    .includes(post.platform) ? post.platform : 'instagram';
  const square = platform === 'instagram' || platform === 'facebook';
  const W = square ? 1080 : 1200;
  const H = square ? 1080 : 675;
  let z = 0;
  const el = (x: number, y: number, w: number, h: number, data: unknown) => ({
    id: `ael-${opts.id}-${z}`, type: (data as { kind: string }).kind,
    x, y, width: w, height: h, rotation: 0, zIndex: ++z, locked: false, visible: true, data,
  });

  return {
    id: opts.id,
    name: post.headline.slice(0, 60) || 'Untitled post',
    platform,
    aspectRatio: square ? '1:1' : '16:9',
    canvasWidth: W,
    canvasHeight: H,
    background: {
      type: 'gradient', color: opts.brandColor,
      gradientStart: opts.brandColor, gradientEnd: '#17191c', gradientAngle: 135, imageFit: 'cover',
    },
    elements: [
      el(W * 0.07, H * 0.10, 110, 12, {
        kind: 'shape', shapeType: 'rounded-rect', fill: ACCENT, stroke: 'transparent', strokeWidth: 0, opacity: 1,
      }),
      el(W * 0.07, H * 0.22, W * 0.86, H * 0.40, {
        kind: 'text', text: post.headline, fontSize: square ? 88 : 72, fontFamily: 'Inter',
        color: '#ffffff', fontWeight: '800', fontStyle: 'normal', textAlign: 'left',
        lineHeight: 1.08, letterSpacing: -1, textDecoration: 'none', effect: 'shadow',
      }),
      el(W * 0.07, H * 0.78, W * 0.86, H * 0.10, {
        kind: 'text', text: opts.company, fontSize: square ? 34 : 28, fontFamily: 'Inter',
        color: ACCENT, fontWeight: '600', fontStyle: 'normal', textAlign: 'left',
        lineHeight: 1.2, letterSpacing: 1, textDecoration: 'none', uppercase: true,
      }),
    ],
    status: 'draft',
    /* The caption travels with the design rather than only on the image, so
       whatever posts it has the words to post. */
    caption: [post.body, (post.hashtags ?? []).join(' ')].filter(Boolean).join('\n\n'),
    content: post.body,
    hashtags: post.hashtags ?? [],
    tags: ['autopilot'],
    source: opts.source,
    createdAt: opts.now,
    updatedAt: opts.now,
  };
}

/* ── Carrying out one agent step ─────────────────────────────────────────── */

interface Produced {
  outcome: 'ok' | 'skipped' | 'failed';
  detail: string;
  link?: RunLink;
}

async function push(env: Env, accountId: string, key: string, row: Record<string, unknown>): Promise<void> {
  const list = parse<Record<string, unknown>[]>(await dataGet(env.DB, accountId, key), []);
  list.unshift(row);
  await dataPut(env.DB, accountId, key, JSON.stringify(list.slice(0, 500)));
}

async function runAgentNode(
  env: Env, accountId: string, project: ProjectRow, node: GraphNode, lastRunAt: string | null,
): Promise<Produced> {
  const cfg = node.config ?? {};
  const c = (k: string) => String(cfg[k] ?? '').trim();

  const apiKey = await loadAiKey(env, accountId);
  /* The workspace's key, the operator's, then the deployment's. None of the
     three is an operator problem, not something the customer can fix, so it is
     reported as one rather than as homework. */
  if (!apiKey) {
    return { outcome: 'failed', detail: 'Writing is unavailable on this installation at the moment, so nothing was written. Support has been able to see this.' };
  }

  const brand = await brandFor(env, accountId, project);
  const now = nowIso();
  const source = {
    origin: 'autopilot', title: 'AI Autopilot', route: '/autopilot',
    projectId: project.id, projectName: project.name, at: now,
  };

  /* ── What it is writing from ── */
  let items: SourceItem[] = [];
  const kind = c('source') || 'portfolio';

  if (kind === 'portfolio') {
    if (portfolioThin(brand)) {
      return {
        outcome: 'failed',
        detail: 'The client’s portfolio has nothing in it yet, so there was nothing to write from. Fill in what they do and who buys it, and this runs on the next tick.',
      };
    }
  } else if (kind === 'rss' || kind === 'youtube') {
    const raw = c('sourceUrl');
    const resolved = kind === 'youtube' ? youtubeFeed(raw) : { url: raw, problem: raw ? '' : 'No feed address is set.' };
    if (resolved.problem) return { outcome: 'failed', detail: resolved.problem };

    const fed = await fetchFeed(resolved.url);
    if (fed.problem) return { outcome: 'failed', detail: fed.problem };

    items = sinceLast(fed.items, lastRunAt);
    if (!items.length) {
      /* Not a failure and not an achievement. Most mornings a feed has nothing
         new, and saying "done" would put a tick against having read an empty
         page. */
      return { outcome: 'skipped', detail: `Nothing new in that feed since it last ran — ${fed.items.length} item${fed.items.length === 1 ? '' : 's'} there, all seen before.` };
    }
  } else {
    return { outcome: 'failed', detail: `"${kind}" is not a source this version can read.` };
  }

  /* ── What it is producing ── */
  const produces = c('produces') || 'social';

  if (produces === 'social') {
    const count = Math.min(Math.max(Number(c('count')) || 1, 1), 6);
    const r = await writeImagePosts(apiKey, brand, { count, platform: c('platform') || 'instagram', items });
    const posts = (r.value?.posts ?? []).filter(p => (p.headline ?? '').trim());
    if (!r.ok || !posts.length) {
      return { outcome: 'failed', detail: r.error || 'Nothing usable came back from the writer.' };
    }
    const brandColor = c('brandColor') || '#5b7cfa';
    let first = '';
    for (const p of posts.slice(0, count)) {
      const id = `sp-${crypto.randomUUID()}`;
      if (!first) first = id;
      await push(env, accountId, SOCIAL_KEY, designFromPost(p, { id, brandColor, company: brand.companyName, source, now }));
    }
    return {
      outcome: 'ok',
      detail: `Made ${posts.length} post${posts.length === 1 ? '' : 's'}${items.length ? ` from ${items.length} new item${items.length === 1 ? '' : 's'}` : ''}. Every one is a draft — nothing is scheduled until you say so.`,
      link: { kind: 'social-post', id: first, label: posts[0].headline.slice(0, 60), route: '/social-creator' },
    };
  }

  if (produces === 'blog') {
    const topic = items.length ? `${items[0].title}. ${items[0].summary.slice(0, 400)}` : c('topic');
    const r = await writeBlogPost(apiKey, brand, topic);
    if (!r.ok || !r.value?.title) return { outcome: 'failed', detail: r.error || 'Nothing usable came back from the writer.' };
    const v = r.value;
    const id = `bp-${crypto.randomUUID()}`;
    await push(env, accountId, BLOG_KEY, {
      id, title: v.title, slug: v.slug, excerpt: v.excerpt, body: v.body,
      keywords: v.keywords ?? [], status: 'draft', source, createdAt: now,
    });
    return {
      outcome: 'ok',
      detail: `Drafted "${v.title}". Read it before it goes anywhere.`,
      link: { kind: 'blog-post', id, label: v.title.slice(0, 60), route: '/blog-automation' },
    };
  }

  if (produces === 'email_campaign') {
    const total = Math.min(Math.max(Number(c('campaignSteps')) || 7, 2), 52);
    const everyDays = Math.min(Math.max(Number(c('everyDays')) || 7, 1), 30);
    const theme = c('topic') || (items.length ? items[0].title : '');

    /* Written a batch at a time. A model asked for fifty-two in one reply
       returns a dozen good ones and then repeats itself, and often enough JSON
       that does not close — so a failed batch leaves the ones before it
       standing rather than losing the lot. */
    const steps: { day: number; subject: string; body: string }[] = [];
    let name = '';
    let stopped = '';
    for (let from = 0; from < total; from += BATCH) {
      const count = Math.min(BATCH, total - from);
      const r = await writeSequenceBatch(apiKey, brand, { from, count, total, everyDays, theme, items });
      if (!r.ok || !r.value?.steps?.length) { stopped = r.error || 'the writer returned nothing usable'; break; }
      if (!name) name = r.value.name || '';
      for (const [i, st] of r.value.steps.entries()) {
        if (!String(st.subject ?? '').trim() || !String(st.body ?? '').trim()) continue;
        steps.push({ day: (from + i) * everyDays, subject: String(st.subject), body: String(st.body) });
      }
    }
    if (!steps.length) return { outcome: 'failed', detail: stopped || 'Nothing usable came back from the writer.' };

    const id = `seq-${crypto.randomUUID()}`;
    await push(env, accountId, SEQ_KEY, {
      id,
      name: (name || `${total}-email campaign`).slice(0, 90),
      /* A draft, unlike Autopilot's own first follow-up. That one is filed
         active because an enrolment play needs somewhere to put people and the
         play itself asks before it sends. This is a campaign somebody asked an
         agent to write, nobody has read it, and it may be fifty-two emails
         long — it waits. */
      status: 'draft',
      source,
      createdAt: now,
      steps: steps.map(st => ({
        id: `st-${crypto.randomUUID()}`,
        day: Math.min(st.day, 400),
        waitUnit: 'days',
        subject: st.subject.slice(0, 200),
        body: st.body.slice(0, 8000),
        channel: 'email',
      })),
    });
    return {
      outcome: 'ok',
      detail: steps.length < total
        ? `Wrote ${steps.length} of the ${total} emails${stopped ? ` — it stopped because ${stopped}` : ''}. The ones it did write are there and readable; run it again to finish the rest.`
        : `Wrote all ${steps.length} emails, one every ${everyDays} days. Nobody is enrolled — read them first.`,
      link: { kind: 'sequence', id, label: (name || 'Campaign').slice(0, 60), route: '/marketing?tab=sequences' },
    };
  }

  return { outcome: 'failed', detail: `"${produces}" is not something this version can produce.` };
}

/* ── The pass ────────────────────────────────────────────────────────────── */

/**
 * Run every scheduled workflow that is due.
 *
 * Only `active` ones, and only the agent steps in them. A scheduled graph may
 * well contain send steps somebody dragged in — those belong to the contact
 * engine and there is no contact here, so they are stepped over and named in
 * the run detail rather than being run against nobody.
 */
export async function runProjectAgents(env: Env): Promise<AgentReport> {
  const report: AgentReport = { ran: 0, produced: 0, skipped: 0, failed: 0 };

  /*
   * Only the rows that could possibly be due.
   *
   * Without the date test this read every active workflow in the install on
   * every one of the 288 daily ticks, parsed each graph, and threw almost all
   * of them away because `cadenceDue` said no. The shortest cadence is hourly,
   * so anything that ran within the hour cannot be due and the database can
   * skip it against the same index it already keeps. `cadenceDue` is still the
   * decision — this only avoids reading rows it is certain to refuse.
   */
  const earliest = new Date(Date.now() - CADENCE_HOURS.hourly * 3_600_000).toISOString();
  const { results } = await env.DB.prepare(
    `SELECT id, account_id, project_id, name, nodes, last_run_at
     FROM crm_project_workflows
     WHERE status = 'active' AND (last_run_at IS NULL OR last_run_at < ?)
     ORDER BY last_run_at IS NOT NULL, last_run_at LIMIT 200`,
  ).bind(earliest).all<WorkflowRow>();

  let budget = MAX_AGENTS_PER_TICK;

  for (const wf of results ?? []) {
    if (budget <= 0) break;
    const nodes = parse<GraphNode[]>(wf.nodes, []);
    const trigger = nodes.find(n => n.type === 'trigger');
    if (String(trigger?.config?.event ?? '') !== 'schedule') continue;

    const cadence = String(trigger?.config?.cadence ?? 'daily');
    if (!cadenceDue(cadence, wf.last_run_at)) continue;

    const agents = nodes.filter(n => n.type === 'ai');
    if (!agents.length) {
      /* Stamped anyway, so a graph with nothing to do is not reconsidered every
         five minutes for the rest of its life. */
      await env.DB.prepare('UPDATE crm_project_workflows SET last_run_at = ? WHERE id = ?')
        .bind(nowIso(), wf.id).run();
      continue;
    }

    const project = await env.DB.prepare(
      'SELECT id, name, portfolio_id, objective FROM crm_projects WHERE id = ? AND account_id = ?',
    ).bind(wf.project_id, wf.account_id).first<ProjectRow>();
    if (!project) continue;

    budget -= 1;
    report.ran += 1;

    for (const node of agents) {
      let outcome: Produced;
      try {
        outcome = await runAgentNode(env, wf.account_id, project, node, wf.last_run_at);
      } catch (e) {
        /* A thrown agent must not take the tick down with it — the next
           workspace's agents have nothing to do with this one's feed. */
        outcome = { outcome: 'failed', detail: e instanceof Error ? e.message : String(e) };
      }
      await recordAgentRun(env, {
        accountId: wf.account_id, projectId: wf.project_id, workflowId: wf.id,
        nodeId: node.id, produces: String(node.config?.produces ?? ''), ...outcome,
      });
      if (outcome.outcome === 'ok') report.produced += 1;
      else if (outcome.outcome === 'skipped') report.skipped += 1;
      else report.failed += 1;
    }

    await env.DB.prepare('UPDATE crm_project_workflows SET last_run_at = ? WHERE id = ?')
      .bind(nowIso(), wf.id).run();
  }

  return report;
}

/** One line of history, and the link to what it made. */
export async function recordAgentRun(env: Env, r: {
  accountId: string; projectId: string; workflowId: string; nodeId: string;
  produces: string; outcome: string; detail: string; link?: RunLink;
}): Promise<void> {
  try {
    await env.DB.prepare(
      `INSERT INTO crm_agent_runs (id, account_id, project_id, workflow_id, node_id, produces, outcome, detail, link, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    ).bind(
      `ar-${crypto.randomUUID()}`, r.accountId, r.projectId, r.workflowId, r.nodeId,
      r.produces, r.outcome, r.detail.slice(0, 1000),
      r.link ? JSON.stringify(r.link) : null, nowIso(),
    ).run();
  } catch { /* history only: losing a line must not lose the work it describes */ }
}

/** Keep the history readable rather than unbounded. */
export async function pruneAgentRuns(env: Env): Promise<void> {
  try {
    await env.DB.prepare(
      `DELETE FROM crm_agent_runs WHERE id NOT IN (
         SELECT id FROM crm_agent_runs ORDER BY created_at DESC LIMIT 5000)`,
    ).run();
  } catch { /* housekeeping only */ }
}

/** One agent step, run now because somebody pressed the button. */
export async function runAgentOnce(
  env: Env, accountId: string, projectId: string, workflowId: string, nodeId: string,
): Promise<Produced & { ok: boolean }> {
  const wf = await env.DB.prepare(
    `SELECT id, account_id, project_id, name, nodes, last_run_at FROM crm_project_workflows
     WHERE id = ? AND account_id = ? AND project_id = ?`,
  ).bind(workflowId, accountId, projectId).first<WorkflowRow>();
  if (!wf) return { ok: false, outcome: 'failed', detail: 'That workflow could not be found.' };

  const node = parse<GraphNode[]>(wf.nodes, []).find(n => n.id === nodeId && n.type === 'ai');
  if (!node) return { ok: false, outcome: 'failed', detail: 'That step is not an AI agent.' };

  const project = await env.DB.prepare(
    'SELECT id, name, portfolio_id, objective FROM crm_projects WHERE id = ? AND account_id = ?',
  ).bind(projectId, accountId).first<ProjectRow>();
  if (!project) return { ok: false, outcome: 'failed', detail: 'That project could not be found.' };

  let out: Produced;
  try {
    /* `null` rather than the workflow's stamp: somebody pressing Run now wants
       to see it work, and filtering a feed to "since the last run" would
       usually hand them "nothing new" — true, and not what the button is for. */
    out = await runAgentNode(env, accountId, project, node, null);
  } catch (e) {
    out = { outcome: 'failed', detail: e instanceof Error ? e.message : String(e) };
  }
  await recordAgentRun(env, {
    accountId, projectId, workflowId, nodeId,
    produces: String(node.config?.produces ?? ''), ...out,
  });
  return { ok: out.outcome === 'ok', ...out };
}
