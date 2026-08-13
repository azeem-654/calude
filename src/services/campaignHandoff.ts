/**
 * Getting generated content out of the library and into the modules that own it.
 *
 * The library is where content is written and edited; Marketing, Websites and
 * Funnels are where it actually lives and sends. This file is the one-way door
 * between them, and it is deliberately explicit rather than automatic: content
 * appears in a customer's real email sequence because someone asked for it, not
 * as a side effect of pressing Generate.
 *
 * Handing the same campaign over twice would create duplicate sequences, so
 * every push records what it created on the campaign and refuses to run again
 * until that record is cleared.
 */
import type { Campaign, CampaignAsset } from '../types/socialAutomation';
import type { Campaign as MarketingCampaign, Funnel, Website } from '../types';
import type { EmailSequence } from '../types/marketing';
import { assetsFor, loadAssets as loadAssetsAll, updateCampaign } from './socialAutomation';
import { makeSource } from '../types/provenance';

/** The subset of the app context this needs, passed in so the service stays testable. */
export interface HandoffApi {
  addSequence: (seq: Omit<EmailSequence, 'id'>) => EmailSequence;
  addCampaign: (campaign: Omit<MarketingCampaign, 'id'>) => MarketingCampaign;
  addWebsite: (w: Website | Omit<Website, 'id'>) => void;
  addFunnel: (f: Funnel | Omit<Funnel, 'id'>) => void;
}

export interface HandoffResult {
  ok: boolean;
  created: string[];
  error?: string;
}

/** What a previous push produced, so it is never repeated. */
export interface HandoffRecord {
  at: string;
  sequenceId?: string;
  smsCampaignId?: string;
  blogTitle?: string;
  funnelName?: string;
}

const slugify = (s: string) =>
  s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 60) || 'campaign';

/**
 * Push a campaign's email, SMS, blog and landing assets into the real modules.
 * Returns what was created so the caller can tell the user in their own words.
 */
export function pushToModules(campaign: Campaign, api: HandoffApi): HandoffResult {
  if (campaign.handoff) {
    return { ok: false, created: [], error: 'This campaign has already been sent to your modules.' };
  }

  const assets = assetsFor(campaign.id);
  const emails = assets.filter(a => a.kind === 'email');
  const sms = assets.filter(a => a.kind === 'sms');
  const blogs = assets.filter(a => a.kind === 'blog');
  const landings = assets.filter(a => a.kind === 'landing');

  if (!emails.length && !sms.length && !blogs.length && !landings.length) {
    return { ok: false, created: [], error: 'There is nothing to send yet — generate the campaign first.' };
  }

  const now = new Date().toISOString();
  // Everything this push creates gets stamped with the video it came from, so a
  // marketing list full of generated records can still be traced back.
  const source = makeSource('video-campaign', campaign.title || campaign.name, {
    refId: campaign.id,
    route: '/social-automation',
    detail: campaign.sources[0]?.name,
  });
  // Every module in the app stores createdAt as a plain YYYY-MM-DD and renders
  // it raw, so handing over a full ISO timestamp puts "2026-08-10T03:23:42.620Z"
  // on a campaign card. The record keeps the precise time; the modules get theirs.
  const today = now.split('T')[0];
  const record: HandoffRecord = { at: now };
  const created: string[] = [];

  try {
    if (emails.length) {
      const seq = api.addSequence({
        name: `${campaign.name} — email sequence`,
        source,
        goal: campaign.title.slice(0, 140),
        status: 'draft',
        createdAt: today,
        enrolledCount: 0,
        steps: emails.map((e, i) => ({
          id: `sa-${campaign.id}-email-${i}`,
          // Day zero, then the cadence the writer planned.
          day: [0, 2, 5, 9][i] ?? i * 3,
          waitUnit: 'days' as const,
          type: 'auto_email' as const,
          // The first subject variant leads; the others stay on the asset for A/B testing.
          subject: e.parts?.[0]?.body ?? e.title,
          body: e.html ?? e.body,
          followUpRule: 'No reply → continue sequence',
        })),
      });
      record.sequenceId = seq.id;
      created.push(`${emails.length}-email sequence`);
    }

    if (sms.length) {
      const camp = api.addCampaign({
        name: `${campaign.name} — SMS`,
        source,
        description: `Generated from "${campaign.title}".`,
        type: 'sms',
        status: 'draft',
        goal: campaign.title.slice(0, 140),
        audience: campaign.audience.listIds.length ? 'Selected segments' : 'All contacts',
        sent: 0, opened: 0, clicked: 0, replied: 0,
        createdAt: today,
        steps: sms.map((m, i) => ({
          id: `sa-${campaign.id}-sms-${i}`,
          day: [0, 3, 7][i] ?? i * 3,
          waitUnit: 'days' as const,
          subject: '',
          body: m.body,
          abTest: false,
          condition: 'always',
        })),
      });
      record.smsCampaignId = camp.id;
      created.push(`${sms.length} SMS messages`);
    }

    if (blogs.length) {
      const blog = blogs[0];
      // A blog post lives as a published page on a site of its own, which is
      // what the Websites module already understands.
      api.addWebsite({
        name: blog.title,
        source,
        description: blog.parts?.[0]?.body ?? '',
        status: 'draft',
        subdomain: slugify(blog.title),
        seoTitle: blog.title,
        seoDescription: blog.parts?.[0]?.body ?? '',
        seoKeywords: blog.hashtags.map(h => h.replace(/^#/, '')).join(', '),
        visitors: 0,
        pageViews: 0,
        createdAt: today,
        pages: [{
          id: `sa-${campaign.id}-blog`,
          name: blog.title,
          type: 'custom',
          slug: slugify(blog.title),
          blocks: [],
          visitors: 0,
          conversions: 0,
        }],
      });
      record.blogTitle = blog.title;
      created.push('blog post');
    }

    if (landings.length) {
      const page = landings[0];
      api.addFunnel({
        name: `${campaign.name} — landing page`,
        source,
        status: 'draft',
        steps: 1,
        visitors: 0,
        conversions: 0,
        revenue: 0,
        slug: slugify(page.title),
        createdAt: today,
        pages: [{
          id: `sa-${campaign.id}-landing`,
          name: page.title,
          type: 'landing',
          slug: slugify(page.title),
          blocks: [],
          visitors: 0,
          conversions: 0,
        }],
      });
      record.funnelName = `${campaign.name} — landing page`;
      created.push('landing page');
    }

    updateCampaign(campaign.id, { handoff: record });
    return { ok: true, created };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return { ok: false, created, error: message.slice(0, 200) };
  }
}

/** How many assets exist across every campaign, for the library tab's badge. */
export function libraryCount(): number {
  // One read. Going through libraryAssets would parse the whole store again
  // just to take a length.
  return loadAssetsAll().length;
}

/**
 * Everything in the library, newest first.
 *
 * Reads the asset store once and joins in memory. The obvious version — map
 * over campaigns calling assetsFor — re-parses the entire store for every
 * campaign, so ten campaigns meant ten full parses of the same JSON on every
 * mount.
 */
export function libraryAssets(campaigns: Campaign[]): (CampaignAsset & { campaignName: string })[] {
  const names = new Map(campaigns.map(c => [c.id, c.name]));
  const known = new Set(campaigns.map(c => c.id));
  return loadAssetsAll()
    .filter(a => known.has(a.campaignId))
    .map(a => ({ ...a, campaignName: names.get(a.campaignId) ?? 'Unknown campaign' }))
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}
