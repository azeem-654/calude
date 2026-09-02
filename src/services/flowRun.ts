/**
 * Turning a plan into records the modules actually own.
 *
 * planFlow() writes the campaign; this is the one place that creates anything.
 * The split matters: a plan can be looked at, re-planned and thrown away with
 * no consequences, and the moment of commitment is a single deliberate call
 * with a list of the channels the person actually ticked.
 *
 * Everything created here carries the same `source` stamp, and the run records
 * every id it produced. That is what makes it undoable — a chain that fans a
 * campaign into five modules and then cannot take it back is a chain most
 * people will not risk pressing.
 */
import type { Campaign, Funnel } from '../types';
import type { EmailSequence } from '../types/marketing';
import type { DesignPost, CanvasElement } from '../components/SocialCreator/types';
import type { BlogProject } from '../types/blogAutomation';
import { makeSource, type ContentSource } from '../types/provenance';
import { loadProjects, saveProjects, newId } from './blogAutomation';
import { loadSettings } from './deliverability';
import { activeBranding } from './tenancy';
import { loadOnboarding } from './onboarding';
import type { ChannelId, FlowPlan } from './businessFlow';

/* ── What the run needs from the app, passed in rather than imported ─────── */

export interface FlowApi {
  addSequence: (seq: Omit<EmailSequence, 'id'>) => EmailSequence;
  addCampaign: (campaign: Omit<Campaign, 'id'>) => Campaign;
  addSocialPost: (post: DesignPost) => void;
  addFunnel: (f: Funnel | Omit<Funnel, 'id'>) => void;
  deleteSequence: (id: string) => void;
  deleteCampaign: (id: string) => void;
  deleteSocialPosts: (ids: string[]) => void;
  deleteFunnel: (id: string) => void;
}

/* ── The record of a run ─────────────────────────────────────────────────── */

export interface FlowRun {
  id: string;
  flowId: string;
  name: string;
  at: string;
  writtenBy: 'ai' | 'portfolio';
  channels: ChannelId[];
  /** Ids, so undo removes exactly what this run made and nothing else. */
  sequenceId?: string;
  smsCampaignId?: string;
  socialPostIds: string[];
  funnelId?: string;
  funnelName?: string;
  blogProjectId?: string;
  /**
   * The short's script, kept rather than turned into a record.
   *
   * AI Shorts cuts clips out of footage you upload; there is no footage yet, so
   * creating a video project here would be a row pretending to be a video. The
   * script is the real deliverable at this stage — something to read to camera
   * — so it is kept here and shown, and becomes a project when there is a file.
   */
  short?: { title: string; hook: string; script: string[] };
  /** Human-readable summary of what was made, for the toast and the history. */
  created: string[];
}

const RUNS_KEY = 'crm_flow_runs';

export function loadRuns(): FlowRun[] {
  try {
    const raw = JSON.parse(window.localStorage.getItem(RUNS_KEY) || '[]');
    return Array.isArray(raw) ? raw as FlowRun[] : [];
  } catch { return []; }
}

function saveRuns(rows: FlowRun[]): boolean {
  try { window.localStorage.setItem(RUNS_KEY, JSON.stringify(rows)); return true; }
  catch { return false; }
}

const slug = (s: string) =>
  s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 60) || 'campaign';

/* ── Social posts ────────────────────────────────────────────────────────── */

/**
 * One planned post as a real, editable Social Creator design.
 *
 * A caption in a list is not a post — it cannot be opened, restyled or
 * exported. The whole point of chaining into Social Creator rather than storing
 * text somewhere is that what lands is the same object a person would have made
 * by hand, on the right canvas for its platform, with the brand colour already
 * on it.
 */
function designFor(p: FlowPlan['social'][number], brandColor: string, company: string, seq: number): DesignPost {
  const square = p.platform === 'instagram';
  const W = square ? 1080 : 1200;
  const H = square ? 1080 : 675;
  const now = new Date().toISOString();
  const el = (partial: Omit<CanvasElement, 'id' | 'locked' | 'visible' | 'rotation'>): CanvasElement => ({
    id: `flow-el-${seq}-${partial.zIndex}`, rotation: 0, locked: false, visible: true, ...partial,
  });

  return {
    id: `flow-social-${Date.now()}-${seq}`,
    name: `Day ${p.day} · ${p.headline.slice(0, 34)}`,
    platform: p.platform,
    aspectRatio: square ? '1:1' : '16:9',
    canvasWidth: W,
    canvasHeight: H,
    background: {
      type: 'gradient', color: brandColor,
      gradientStart: brandColor, gradientEnd: '#17191c', gradientAngle: 135, imageFit: 'cover',
    },
    elements: [
      el({
        type: 'shape', x: W * 0.06, y: H * 0.08, width: 110, height: 12, zIndex: 1,
        data: { kind: 'shape', shapeType: 'rounded-rect', fill: '#c7f441', stroke: 'transparent', strokeWidth: 0, opacity: 1 },
      }),
      el({
        type: 'text', x: W * 0.06, y: H * 0.22, width: W * 0.88, height: H * 0.34, zIndex: 2,
        data: {
          kind: 'text', text: p.headline, fontSize: square ? 92 : 74, fontFamily: 'Inter', color: '#ffffff',
          fontWeight: '800', fontStyle: 'normal', textAlign: 'left', lineHeight: 1.08, letterSpacing: -1,
          textDecoration: 'none', effect: 'shadow',
        },
      }),
      el({
        type: 'text', x: W * 0.06, y: H * 0.66, width: W * 0.72, height: H * 0.16, zIndex: 3,
        data: {
          kind: 'text', text: p.caption.split('. ')[0] + '.', fontSize: square ? 34 : 28, fontFamily: 'Inter',
          color: 'rgba(255,255,255,0.85)', fontWeight: '500', fontStyle: 'normal', textAlign: 'left',
          lineHeight: 1.4, letterSpacing: 0, textDecoration: 'none',
        },
      }),
      el({
        type: 'text', x: W * 0.06, y: H * 0.88, width: W * 0.6, height: H * 0.07, zIndex: 4,
        data: {
          kind: 'text', text: company.toUpperCase(), fontSize: square ? 28 : 24, fontFamily: 'Inter', color: '#c7f441',
          fontWeight: '800', fontStyle: 'normal', textAlign: 'left', lineHeight: 1.2, letterSpacing: 3,
          textDecoration: 'none',
        },
      }),
    ],
    status: 'draft',
    tags: ['business-flow', p.platform],
    aiPrompt: p.caption,
    createdAt: now,
    updatedAt: now,
  };
}

/* ── Applying a plan ─────────────────────────────────────────────────────── */

export interface ApplyResult {
  ok: boolean;
  run?: FlowRun;
  created: string[];
  /** Channels that were asked for and could not be made, with the reason. */
  skipped: { channel: ChannelId; why: string }[];
  error?: string;
}

/**
 * Create everything the chosen channels cover.
 *
 * Nothing here is conditional on a channel "working" later — a sequence with no
 * mailbox behind it is still a valid draft, and refusing to write it would just
 * mean the work has to be redone once the mailbox exists. Everything lands as a
 * draft: this chain writes campaigns, it does not send them.
 */
export function applyPlan(plan: FlowPlan, channels: ChannelId[], api: FlowApi): ApplyResult {
  const want = new Set(channels);
  if (!want.size) return { ok: false, created: [], skipped: [], error: 'Nothing was selected to create.' };

  const brand = activeBranding();
  /* The accent colour is the one the onboarding wizard collected — Branding
     carries the product name and logo, not a palette — so generated posts come
     out in the customer's colour rather than a default grey. */
  const profile = loadOnboarding().profile;
  const company = (profile.companyName ?? '').trim() || brand.appName || 'Your business';
  const now = new Date().toISOString();
  const today = now.split('T')[0];

  const run: FlowRun = {
    id: `flowrun-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`,
    flowId: plan.flowId,
    name: plan.name,
    at: now,
    writtenBy: plan.writtenBy,
    channels,
    socialPostIds: [],
    created: [],
  };

  const source: ContentSource = makeSource('business-flow', plan.name, {
    refId: run.id,
    route: '/',
    detail: plan.promise.slice(0, 80),
  });

  const created: string[] = [];
  const skipped: { channel: ChannelId; why: string }[] = [];

  try {
    if (want.has('email') && plan.emails.length) {
      const seq = api.addSequence({
        name: `${plan.name} — emails`,
        source,
        goal: plan.promise.slice(0, 200),
        status: 'draft',
        createdAt: today,
        enrolledCount: 0,
        steps: plan.emails.map((e, i) => ({
          id: `${run.id}-email-${i}`,
          day: e.day,
          waitUnit: 'days' as const,
          type: 'auto_email' as const,
          subject: e.subject,
          body: e.body,
          followUpRule: 'No reply → continue sequence',
        })),
      });
      run.sequenceId = seq.id;
      created.push(`${plan.emails.length}-email sequence`);
    }

    if (want.has('sms')) {
      if (!plan.sms.length) skipped.push({ channel: 'sms', why: 'The plan has no texts.' });
      else {
        const camp = api.addCampaign({
          name: `${plan.name} — SMS`,
          source,
          description: plan.promise,
          type: 'sms',
          status: 'draft',
          goal: plan.promise.slice(0, 200),
          audience: plan.audience,
          sent: 0, opened: 0, clicked: 0, replied: 0,
          createdAt: today,
          steps: plan.sms.map((m, i) => ({
            id: `${run.id}-sms-${i}`,
            day: m.day,
            waitUnit: 'days' as const,
            subject: '',
            body: m.body,
            abTest: false,
            condition: 'always',
          })),
        });
        run.smsCampaignId = camp.id;
        created.push(`${plan.sms.length} SMS messages`);
      }
    }

    if (want.has('social') && plan.social.length) {
      const colour = (profile.brandColor ?? '').trim() || '#17191c';
      plan.social.forEach((p, i) => {
        const post = designFor(p, colour, company, i);
        api.addSocialPost(post);
        run.socialPostIds.push(post.id);
      });
      created.push(`${plan.social.length} social posts`);
    }

    if (want.has('landing')) {
      const name = `${plan.name} — landing page`;
      const funnelId = `${run.id}-funnel`;
      /* Given an id here rather than letting the store mint one: addFunnel
         returns nothing, and undoing a run by matching names would delete a
         hand-made funnel that happened to share one. */
      api.addFunnel({
        id: funnelId,
        name,
        source,
        status: 'draft',
        steps: 1,
        visitors: 0,
        conversions: 0,
        revenue: 0,
        slug: slug(plan.landing.title),
        createdAt: today,
        pages: [{
          id: `${run.id}-landing`,
          name: plan.landing.title,
          type: 'landing',
          slug: slug(plan.landing.title),
          blocks: [],
          visitors: 0,
          conversions: 0,
        }],
      });
      run.funnelId = funnelId;
      run.funnelName = name;
      created.push('landing page');
    }

    if (want.has('blog')) {
      const made = createBlogProject(plan, today);
      if (made) { run.blogProjectId = made; created.push('blog project'); }
      else skipped.push({ channel: 'blog', why: 'Browser storage refused the write — free some space and try the blog on its own.' });
    }

    if (want.has('short')) {
      run.short = plan.short;
      created.push('short video script');
    }

    if (!created.length) {
      return { ok: false, created: [], skipped, error: 'Nothing could be created from this plan.' };
    }

    run.created = created;
    const rows = loadRuns();
    saveRuns([run, ...rows].slice(0, 50));
    return { ok: true, run, created, skipped };
  } catch (err) {
    /* Partial failure is reported as partial. The records already made are
       real and staying, and the run is saved with what it got, so undo can
       still take them back out. */
    run.created = created;
    if (created.length) saveRuns([run, ...loadRuns()].slice(0, 50));
    return {
      ok: false, run: created.length ? run : undefined, created, skipped,
      error: err instanceof Error ? err.message.slice(0, 200) : String(err).slice(0, 200),
    };
  }
}

/**
 * A blog project seeded from the campaign.
 *
 * Blog Automation plans posts against a portfolio and a set of topic clusters,
 * and both of those are exactly what the flow already worked out — so rather
 * than dropping a single draft post somewhere, the chain hands the blog module
 * a project it can keep planning from.
 */
function createBlogProject(plan: FlowPlan, today: string): string | null {
  const id = newId('blog');
  const domain = (loadSettings().sendingDomain ?? '').trim();

  /*
   * Difficulty is a guess and the type says so. Blog Automation scores a term
   * from what it can see — length and how commercial it looks — because nothing
   * here has queried a search engine. A short, obviously commercial phrase is
   * the hardest; a long specific one is the easiest. Weight is 1: the term came
   * from this campaign, not from counting how often the portfolio says it.
   */
  const difficultyOf = (term: string): number => {
    const words = term.trim().split(/\s+/).length;
    const commercial = /\b(best|top|near me|price|cost|buy|hire|book)\b/i.test(term);
    return Math.max(10, Math.min(90, 80 - (words - 2) * 12 + (commercial ? 10 : 0)));
  };

  const project: BlogProject = {
    id,
    name: plan.name,
    domain,
    portfolio: [{
      id: newId('pf'),
      kind: 'text',
      label: `Campaign brief — ${plan.name}`,
      text: [plan.promise, plan.blog.angle, ...plan.blog.outline].join('\n\n').slice(0, 8000),
      addedAt: today,
    }],
    voice: {
      tone: 'plain, direct',
      readingLevel: 'plain',
      averageSentenceWords: 16,
      signaturePhrases: [],
      avoid: [],
      person: 'we',
    },
    seo: {
      offering: plan.promise.slice(0, 300),
      audience: plan.audience,
      location: '',
      competitorTerms: [],
    },
    clusters: [{
      id: newId('cl'),
      pillar: plan.blog.title,
      keywords: plan.blog.keywords.map(term => ({
        term,
        intent: 'commercial' as const,
        difficulty: difficultyOf(term),
        weight: 1,
      })),
    }],
    moneyPages: [],
    /* Not 'ai': this came from the campaign plan, which the module should treat
       as a starting point a person is expected to correct. */
    profileSource: 'heuristic',
    edited: false,
    createdAt: today,
    updatedAt: today,
  };

  const rows = loadProjects();
  return saveProjects([project, ...rows]) ? id : null;
}

/* ── Undo ────────────────────────────────────────────────────────────────── */

/**
 * Take a run back out.
 *
 * Deletes by the ids the run recorded, never by matching names — somebody who
 * renamed the sequence still gets it removed, and a hand-made campaign that
 * happens to share a name is never touched.
 */
export function undoRun(runId: string, api: FlowApi): { ok: boolean; removed: string[] } {
  const rows = loadRuns();
  const run = rows.find(r => r.id === runId);
  if (!run) return { ok: false, removed: [] };

  const removed: string[] = [];
  if (run.sequenceId) { api.deleteSequence(run.sequenceId); removed.push('email sequence'); }
  if (run.smsCampaignId) { api.deleteCampaign(run.smsCampaignId); removed.push('SMS campaign'); }
  if (run.socialPostIds.length) { api.deleteSocialPosts(run.socialPostIds); removed.push(`${run.socialPostIds.length} social posts`); }
  if (run.funnelId) { api.deleteFunnel(run.funnelId); removed.push('landing page'); }
  if (run.blogProjectId) {
    saveProjects(loadProjects().filter(p => p.id !== run.blogProjectId));
    removed.push('blog project');
  }

  saveRuns(rows.filter(r => r.id !== runId));
  return { ok: true, removed };
}
