/**
 * contentGen.ts — month-by-month content generation for the content pipeline.
 *
 * Part 2 scope: email sequence + SMS flow for a month. The generator prefers
 * Gemini and falls back to a personalized template engine, so it always
 * produces real, sendable copy. Generation runs as an in-app background job:
 * the month is flipped to GENERATING (persisted), work happens async, and the
 * month lands in AWAITING_APPROVAL with a notification. A job interrupted by
 * a page reload is resumed by resumePendingGeneration() on dashboard mount.
 */

import type { ContentMonth, MonthContent, OnboardingState, GeneratedSocialPost, GeneratedVideo } from '../types/onboarding';
import type { Campaign } from '../types';
import type { EmailSequence } from '../types/marketing';
import type { DesignPost, CanvasElement } from '../components/SocialCreator/types';
import { makeSource } from '../types/provenance';
import { loadOnboarding, saveOnboarding, auditEntry, sanitizeText } from './onboarding';
import { generateMonthCampaigns, generateSocialCalendar, hasGeminiKey } from '../lib/gemini';

type Notify = (msg: string, type?: 'success' | 'error' | 'info') => void;

/* ── Offline template engine ── */

const EMAIL_DAYS = [1, 7, 13, 19, 26];
const SMS_DAYS = [3, 10, 17, 24];

/** Personalized, sendable fallback copy built from the profile + month plan. */
export function offlineMonthContent(state: OnboardingState, month: ContentMonth): MonthContent {
  const co = state.profile.companyName || 'our team';
  const ind = (state.profile.industry || 'local business').toLowerCase();
  const aud = state.profile.audience.split(/[.,]/)[0].trim().toLowerCase() || 'people like you';
  const idea = (i: number) => month.ideas[i % Math.max(month.ideas.length, 1)] || month.theme;
  const holiday = month.holidays[0] || month.label.split(' ')[0];
  const wantSms = state.channels.includes('sms');

  const emails = [
    {
      day: EMAIL_DAYS[0],
      subject: `${month.theme} starts now`,
      body: `Hi {{firstName}},\n\n${month.label} at ${co} is all about "${month.theme}". ${month.focus}\n\nHere's what that means for you: over the next few weeks we'll share our best resources for ${aud} — starting with ${idea(0).toLowerCase()}.\n\nKeep an eye on your inbox, and if there's anything you want us to cover, just hit reply.\n\n— The ${co} team`,
    },
    {
      day: EMAIL_DAYS[1],
      subject: `The ${ind} mistake we see every week`,
      body: `Hi {{firstName}},\n\nAfter years in ${ind}, one pattern keeps showing up: people wait too long to act, and it costs them time and money.\n\nThat's exactly why we put together ${idea(1).toLowerCase()} — a simple way to get ahead of it this month.\n\nWant us to walk you through it? Reply to this email or book a time that suits you, and we'll take care of the rest.\n\n— ${co}`,
    },
    {
      day: EMAIL_DAYS[2],
      subject: `What our customers say about ${co}`,
      body: `Hi {{firstName}},\n\nDon't take our word for it — the best proof of what ${co} delivers comes from the people we serve.\n\nCustomers consistently tell us the same thing: working with a team that truly understands ${aud} changes everything. This month's "${month.theme}" push is built on exactly that experience.\n\nCurious what we could do for you? Reply with the word INFO and we'll send the details — no pressure, no spam.\n\n— The ${co} team`,
    },
    {
      day: EMAIL_DAYS[3],
      subject: `${holiday} special from ${co}`,
      body: `Hi {{firstName}},\n\nWith ${holiday} coming up, we're doing something special for our community.\n\nFor a limited time this month you can take advantage of ${idea(2).toLowerCase()} — our way of making "${month.theme}" more than just a slogan.\n\nSpots are limited and this offer ends with the month, so if you've been on the fence, this is the moment.\n\nReply YES and we'll set everything up for you.\n\n— ${co}`,
    },
    {
      day: EMAIL_DAYS[4],
      subject: `Last chance: ${month.label.split(' ')[0]} offer ends soon`,
      body: `Hi {{firstName}},\n\nQuick heads-up before the month wraps: our "${month.theme}" campaign ends in a few days, and with it this month's offer.\n\nIf you meant to act on ${idea(3).toLowerCase()} and life got in the way — this is your friendly nudge. It takes two minutes to get started and we handle the rest.\n\nReply to this email or give us a call and we'll lock it in before the deadline.\n\nTalk soon,\nThe ${co} team`,
    },
  ];

  const sms = wantSms ? [
    { day: SMS_DAYS[0], message: `${co}: Hi {{firstName}}! ${month.label.split(' ')[0]} is "${month.theme}" month. Watch for our best tips + a special offer. Reply STOP to opt out.`.slice(0, 160) },
    { day: SMS_DAYS[1], message: `${co}: {{firstName}}, our guide on ${idea(1).toLowerCase().slice(0, 55)} is ready for you. Want it? Reply YES and we'll send it over.`.slice(0, 160) },
    { day: SMS_DAYS[2], message: `${co}: ${holiday} special is live, {{firstName}}! This month only. Reply YES for details before spots fill up.`.slice(0, 160) },
    { day: SMS_DAYS[3], message: `${co}: Last days of our ${month.label.split(' ')[0]} offer, {{firstName}}. It ends with the month — reply YES to grab it in 2 minutes.`.slice(0, 160) },
  ] : [];

  return { emails, sms };
}

const SOCIAL_CHANNELS = ['instagram', 'facebook', 'linkedin'] as const;
const POST_DAYS = [2, 5, 7, 9, 12, 14, 16, 19, 21, 23, 26, 28];
const VIDEO_DAYS = [4, 11, 18, 25];

/** 30-day social calendar from templates — 12 posts rotating the chosen platforms. */
export function offlineSocialCalendar(state: OnboardingState, month: ContentMonth): GeneratedSocialPost[] {
  const platforms = SOCIAL_CHANNELS.filter(c => state.channels.includes(c));
  if (!platforms.length) return [];
  const co = state.profile.companyName || 'our team';
  const ind = (state.profile.industry || 'business').toLowerCase().replace(/[^a-z ]/g, '');
  const holiday = month.holidays[0] || '';
  const idea = (i: number) => month.ideas[i % Math.max(month.ideas.length, 1)] || month.theme;
  const baseTags = [ind.replace(/ /g, ''), co.toLowerCase().replace(/[^a-z0-9]/g, ''), 'smallbusiness', month.theme.toLowerCase().split(' ')[0]].filter(t => t.length > 2);

  const angles: { headline: string; caption: string }[] = [
    { headline: `${month.theme}`, caption: `${month.label.split(' ')[0]} at ${co} is all about "${month.theme}". Here's what that means for you — and why this month is the right time to act. Send us a message to get started.` },
    { headline: 'Did you know?', caption: `Most people in ${ind} wait too long to get help — and it costs them. Here's the one thing we'd tell everyone to do this month. Save this post for later.` },
    { headline: 'Real results', caption: `Another happy customer at ${co}! Results like this are why we show up every day. Want to be next? The link in our bio takes 30 seconds.` },
    { headline: 'Behind the scenes', caption: `A peek behind the curtain at ${co} — this is how we actually work. No stock photos, just the real thing. Questions? Drop them below.` },
    { headline: `${idea(0).slice(0, 40)}`, caption: `${idea(0)} — it's live this month at ${co}. Spots are limited, so don't sit on this one. Tap the link in bio to claim yours.` },
    { headline: 'Quick tip', caption: `One free tip from the ${co} team that you can use today. Try it and tell us how it went — we read every comment.` },
    { headline: holiday ? `${holiday} is coming` : 'Mark your calendar', caption: holiday ? `${holiday} is around the corner — and we're celebrating with something special at ${co}. Watch this space, or message us for early access.` : `Something special is coming at ${co} this month. Watch this space — early birds get the best deal.` },
    { headline: 'Meet the team', caption: `The people behind ${co}. When you work with us, these are the faces in your corner. Say hi in the comments!` },
    { headline: 'Common mistake', caption: `The #1 mistake we see people make with ${ind} — and how to avoid it in five minutes. Share this with someone who needs it.` },
    { headline: 'Your questions, answered', caption: `You asked, we answered: the questions we hear most at ${co}, all in one post. Anything we missed? Ask below and we'll reply.` },
    { headline: `Why ${co}?`, caption: `There are plenty of options in ${ind} — here's honestly why customers pick us, in their own words. See the reviews and decide for yourself.` },
    { headline: 'Last call', caption: `Final days of our "${month.theme}" month at ${co}. If you've been thinking about it, this is the sign you were waiting for. Message us today.` },
  ];
  return POST_DAYS.map((day, i) => ({
    day,
    platform: platforms[i % platforms.length],
    headline: angles[i].headline,
    caption: angles[i].caption,
    hashtags: [...baseTags, ['tips', 'local', 'community', 'offer'][i % 4]].slice(0, 5),
  }));
}

/** 4 weekly short-video scripts — ready to paste into AI Shorts → Script to Video. */
export function offlineVideoPlan(state: OnboardingState, month: ContentMonth): GeneratedVideo[] {
  if (!state.channels.includes('video')) return [];
  const co = state.profile.companyName || 'our team';
  const ind = (state.profile.industry || 'business').toLowerCase();
  const idea = (i: number) => month.ideas[i % Math.max(month.ideas.length, 1)] || month.theme;
  return [
    {
      day: VIDEO_DAYS[0], title: `${month.theme} in 30 seconds`,
      hook: `Stop scrolling — this changes how you think about ${ind}`,
      script: [`Stop scrolling — ${ind} tip inside`, `This month is "${month.theme}"`, 'Here\'s what most people get wrong', 'And here\'s the fix — in one step', `${co} does this every day`, 'Follow for more — link in bio'],
    },
    {
      day: VIDEO_DAYS[1], title: `3 things to know before buying ${ind}`,
      hook: 'Nobody tells you this before you buy',
      script: ['Nobody tells you this before you buy', 'One: specialization beats price', 'Two: proof beats promises', 'Three: response time predicts service', `That's how ${co} wins customers`, 'Save this — you\'ll need it'],
    },
    {
      day: VIDEO_DAYS[2], title: `Inside ${co}: how it actually works`,
      hook: 'Ever wondered what happens after you book?',
      script: ['Ever wondered what happens after you book?', 'Step 1: we listen first', 'Step 2: plan in plain language', 'Step 3: updates without asking', 'No surprises. Ever.', 'Book your spot — link in bio'],
    },
    {
      day: VIDEO_DAYS[3], title: `${idea(2).slice(0, 45)}`,
      hook: 'This offer ends with the month',
      script: ['This offer ends with the month', `${idea(2).slice(0, 38)}`, 'Why now? Simple:', 'Waiting costs more than acting', 'Two minutes to claim it', 'Message us today'],
    },
  ];
}

/** Generate a month's content: Gemini first, offline templates as fallback. */
export async function generateMonthContent(state: OnboardingState, month: ContentMonth): Promise<{ content: MonthContent; source: 'ai' | 'smart-templates' }> {
  const fallback: MonthContent = {
    ...offlineMonthContent(state, month),
    social: offlineSocialCalendar(state, month),
    videos: offlineVideoPlan(state, month),
  };
  if (!hasGeminiKey()) return { content: fallback, source: 'smart-templates' };

  let content: MonthContent = fallback;
  let anyAi = false;
  try {
    const ai = await generateMonthCampaigns({
      company: sanitizeText(state.profile.companyName, 80),
      industry: sanitizeText(state.profile.industry, 60),
      description: sanitizeText(state.profile.description, 350),
      audience: sanitizeText(state.profile.audience, 250),
      voice: sanitizeText(state.profile.brandVoice, 60),
      monthLabel: month.label, theme: month.theme, focus: month.focus,
      ideas: month.ideas, holidays: month.holidays,
      wantSms: state.channels.includes('sms'),
    });
    const emails = ai.emails.map(e => ({
      day: Math.min(Math.max(1, Math.round(e.day)), 28),
      subject: sanitizeText(e.subject, 80),
      body: e.body.replace(/<[^>]*>/g, ' ').trim().slice(0, 1600),
    })).filter(e => e.subject && e.body);
    const sms = ai.sms.map(s => ({
      day: Math.min(Math.max(1, Math.round(s.day)), 28),
      message: sanitizeText(s.message, 160),
    })).filter(s => s.message);
    if (emails.length >= 3) {
      content = { ...content, emails, sms: state.channels.includes('sms') ? (sms.length ? sms : fallback.sms) : [] };
      anyAi = true;
    }
  } catch { /* keep template emails/sms */ }

  const platforms = SOCIAL_CHANNELS.filter(c => state.channels.includes(c));
  if (platforms.length || state.channels.includes('video')) {
    try {
      const ai = await generateSocialCalendar({
        company: sanitizeText(state.profile.companyName, 80),
        industry: sanitizeText(state.profile.industry, 60),
        description: sanitizeText(state.profile.description, 300),
        audience: sanitizeText(state.profile.audience, 200),
        voice: sanitizeText(state.profile.brandVoice, 60),
        monthLabel: month.label, theme: month.theme, ideas: month.ideas, holidays: month.holidays,
        platforms: platforms.length ? platforms : ['instagram'],
        wantVideos: state.channels.includes('video'),
      });
      const social: GeneratedSocialPost[] = platforms.length ? ai.posts.map(p => ({
        day: p.day,
        platform: (SOCIAL_CHANNELS as readonly string[]).includes(p.platform) ? p.platform as GeneratedSocialPost['platform'] : platforms[0],
        headline: sanitizeText(p.headline, 60),
        caption: sanitizeText(p.caption, 400),
        hashtags: p.hashtags.map(h => sanitizeText(h.replace(/^#/, ''), 30)).filter(Boolean).slice(0, 6),
      })).filter(p => p.headline && p.caption) : [];
      const videos: GeneratedVideo[] = state.channels.includes('video') ? ai.videos.map(v => ({
        day: v.day,
        title: sanitizeText(v.title, 60),
        hook: sanitizeText(v.hook, 90),
        script: v.script.map(s => sanitizeText(s, 60)).filter(Boolean),
      })).filter(v => v.title && v.script.length >= 3) : [];
      if (social.length >= 6 || videos.length >= 2) {
        content = {
          ...content,
          social: social.length >= 6 ? social : content.social,
          videos: videos.length >= 2 ? videos : content.videos,
        };
        anyAi = true;
      }
    } catch { /* keep template social/videos */ }
  }

  return { content, source: anyAi ? 'ai' : 'smart-templates' };
}

/* ── Background job runner ── */

const inFlight = new Set<number>();
let changeListener: (() => void) | null = null;
/** The dashboard registers here to refresh its widgets when a job finishes. */
export function onContentJobsChange(cb: (() => void) | null) { changeListener = cb; }

/**
 * The dashboard also registers the publish API so background jobs can
 * auto-approve months when that setting is on (publishing needs the
 * AppContext creators, which services can't import directly).
 */
let publishApiRef: PublishApi | null = null;
export function registerPublishApi(api: PublishApi | null) { publishApiRef = api; }

function patchMonth(index: number, patch: (m: ContentMonth) => ContentMonth) {
  const ob = loadOnboarding();
  const next = { ...ob, plan: ob.plan.map(m => m.index === index ? patch(m) : m) };
  saveOnboarding(next);
  return next;
}

/**
 * Kick off background generation for one month. Idempotent: a month already
 * generating (in this tab) or already past PLAN_GENERATED is left alone.
 */
export function startMonthGeneration(index: number, notify: Notify, actor = 'system') {
  const ob = loadOnboarding();
  const month = ob.plan.find(m => m.index === index);
  if (!month || inFlight.has(index)) return;
  if (month.status !== 'PLAN_GENERATED' && month.status !== 'GENERATING') return;
  inFlight.add(index);

  patchMonth(index, m => ({
    ...m, status: 'GENERATING',
    audit: [...m.audit, auditEntry('Content generation started (emails + SMS)', actor)],
  }));
  changeListener?.();

  void (async () => {
    // Small stagger so the GENERATING state is visible and storage writes settle.
    await new Promise(r => setTimeout(r, 1200));
    try {
      const state = loadOnboarding();
      const target = state.plan.find(m => m.index === index);
      if (!target) return;
      const { content, source } = await generateMonthContent(state, target);
      const nSocial = content.social?.length ?? 0;
      const nVideos = content.videos?.length ?? 0;
      patchMonth(index, m => ({
        ...m,
        status: 'AWAITING_APPROVAL',
        generated: content,
        generatedAt: new Date().toISOString(),
        counts: { ...m.counts, emails: content.emails.length, sms: content.sms.length, social: nSocial, videos: nVideos },
        audit: [...m.audit, auditEntry(`Generated ${content.emails.length} emails, ${content.sms.length} SMS, ${nSocial} social posts, ${nVideos} video scripts via ${source === 'ai' ? 'Gemini AI' : 'smart templates'}`, actor)],
      }));
      const bits = [`${content.emails.length} emails`, content.sms.length ? `${content.sms.length} SMS` : '', nSocial ? `${nSocial} social posts` : '', nVideos ? `${nVideos} video scripts` : ''].filter(Boolean).join(', ');
      if (loadOnboarding().autoApprove && publishApiRef) {
        const published = publishMonth(index, publishApiRef, 'auto-approve');
        if (published) notify(`${monthShort(index)} generated & auto-approved — ${bits} published`, 'success');
        else notify(`${monthShort(index)} content is ready for review — ${bits}`, 'info');
      } else {
        notify(`${monthShort(index)} content is ready for review — ${bits}`, 'info');
      }
    } catch {
      patchMonth(index, m => ({
        ...m, status: 'PLAN_GENERATED',
        audit: [...m.audit, auditEntry('Content generation failed — month reset to Planned', actor)],
      }));
      notify(`Content generation for ${monthShort(index)} failed — open the month to retry`, 'error');
    } finally {
      inFlight.delete(index);
      changeListener?.();
    }
  })();
}

function monthShort(index: number): string {
  const m = loadOnboarding().plan.find(x => x.index === index);
  return m ? m.label : `Month ${index + 1}`;
}

/** Resume months left in GENERATING by a reload/tab close mid-job. */
export function resumePendingGeneration(notify: Notify) {
  const ob = loadOnboarding();
  if (!ob.completed) return;
  ob.plan.filter(m => m.status === 'GENERATING' && !inFlight.has(m.index))
    .forEach(m => startMonthGeneration(m.index, notify));
}

/**
 * Queue generation for every month still in PLAN_GENERATED, staggered so a
 * dozen Gemini calls don't fire at once. Returns how many were queued.
 */
export function generateAllRemaining(notify: Notify, actor: string): number {
  const pending = loadOnboarding().plan.filter(m => m.status === 'PLAN_GENERATED' && !inFlight.has(m.index));
  pending.forEach((m, i) => {
    window.setTimeout(() => startMonthGeneration(m.index, notify, actor), i * 1800);
  });
  if (pending.length) notify(`Generating content for ${pending.length} remaining month${pending.length > 1 ? 's' : ''} in the background…`, 'info');
  return pending.length;
}

/** Approve & publish every month currently awaiting approval. Returns count published. */
export function approveAllPending(api: PublishApi, notify: Notify, actor: string): number {
  const pending = loadOnboarding().plan.filter(m => m.status === 'AWAITING_APPROVAL' && m.generated);
  let done = 0;
  for (const m of pending) { if (publishMonth(m.index, api, actor)) done++; }
  if (done) notify(`${done} month${done > 1 ? 's' : ''} approved & published across your modules`, 'success');
  return done;
}

/* ── Rollback ── */

export interface RollbackApi {
  deleteSequence: (id: string) => void;
  deleteCampaign: (id: string) => void;
  deleteSocialPosts: (ids: string[]) => void;
}

/**
 * Undo a published month: remove the sequence, SMS campaign and social
 * designs it created, and put the month back into AWAITING_APPROVAL with its
 * generated content intact (so it can be edited and re-approved).
 */
export function rollbackMonth(index: number, api: RollbackApi, actor: string): boolean {
  const month = loadOnboarding().plan.find(m => m.index === index);
  if (!month || month.status !== 'PUBLISHED') return false;
  const refs = month.publishedRefs ?? {};
  if (refs.sequenceId) api.deleteSequence(refs.sequenceId);
  if (refs.smsCampaignId) api.deleteCampaign(refs.smsCampaignId);
  if (refs.socialPostIds?.length) api.deleteSocialPosts(refs.socialPostIds);
  patchMonth(index, m => ({
    ...m,
    status: 'AWAITING_APPROVAL',
    publishedRefs: undefined, approvedAt: undefined, approvedBy: undefined, publishedAt: undefined,
    audit: [...m.audit, auditEntry(`Rolled back: removed published sequence${refs.smsCampaignId ? ', SMS flow' : ''}${refs.socialPostIds?.length ? ` and ${refs.socialPostIds.length} social designs` : ''} — month returned to review`, actor)],
  }));
  changeListener?.();
  return true;
}

/* ── Approve & publish ── */

export interface PublishApi {
  addSequence: (seq: Omit<EmailSequence, 'id'>) => EmailSequence;
  addCampaign: (campaign: Omit<Campaign, 'id'>) => Campaign;
  addSocialPost: (post: DesignPost) => void;
}

/** Turn one planned social post into a real, editable Social Creator design. */
function designFromSocialPost(p: GeneratedSocialPost, month: ContentMonth, brandColor: string, company: string, seq: number): DesignPost {
  const square = p.platform === 'instagram';
  const W = square ? 1080 : 1200, H = square ? 1080 : 675;
  const now = new Date().toISOString();
  const el = (partial: Omit<CanvasElement, 'id' | 'locked' | 'visible' | 'rotation'>): CanvasElement => ({
    id: `ob-el-${month.index}-${seq}-${partial.zIndex}`, rotation: 0, locked: false, visible: true, ...partial,
  });
  return {
    id: `ob-social-${Date.now()}-${seq}`,
    name: `Day ${p.day} · ${p.headline.slice(0, 34)}`,
    platform: p.platform,
    aspectRatio: square ? '1:1' : '16:9',
    canvasWidth: W, canvasHeight: H,
    background: { type: 'gradient', color: brandColor, gradientStart: brandColor, gradientEnd: '#17191c', gradientAngle: 135, imageFit: 'cover' },
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
        type: 'text', x: W * 0.06, y: H * 0.66, width: W * 0.7, height: H * 0.16, zIndex: 3,
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
    status: 'scheduled',
    tags: ['month-plan', month.label, `Day ${p.day}`, ...p.hashtags.slice(0, 3)],
    aiPrompt: p.caption,
    createdAt: now, updatedAt: now,
  };
}

/**
 * Approve a reviewed month: push its emails into Marketing as an active
 * sequence and its SMS flow as an active campaign, then mark PUBLISHED.
 */
export function publishMonth(index: number, api: PublishApi, actor: string): ContentMonth | null {
  const ob = loadOnboarding();
  const month = ob.plan.find(m => m.index === index);
  if (!month || month.status !== 'AWAITING_APPROVAL' || !month.generated) return null;
  const now = new Date().toISOString();

  // The plan is twelve months of similarly-shaped campaigns, so each one says
  // which month of which plan it is — otherwise they are indistinguishable in
  // the Marketing list a year later.
  const source = makeSource('content-plan', month.theme || month.label, {
    refId: `plan-month-${index}`,
    route: '/',
    detail: `${month.label} · month ${index + 1} of ${ob.plan.length}`,
  });

  const seq = api.addSequence({
    name: `${month.label}: ${month.theme}`,
    source,
    goal: month.focus.slice(0, 140),
    status: 'active',
    createdAt: now,
    enrolledCount: 0,
    steps: month.generated.emails.map((e, i) => ({
      id: `obstep-${index}-${i}`, day: e.day, waitUnit: 'days', type: 'auto_email',
      subject: e.subject, body: e.body, followUpRule: 'No reply → continue sequence',
    })),
  });

  const state = loadOnboarding();
  const socialPostIds: string[] = [];
  for (const [i, p] of (month.generated.social ?? []).entries()) {
    const design = designFromSocialPost(p, month, state.profile.brandColor || '#3e63dd', state.profile.companyName || 'My Business', i);
    api.addSocialPost(design);
    socialPostIds.push(design.id);
  }

  let smsCampaignId: string | undefined;
  if (month.generated.sms.length) {
    const camp = api.addCampaign({
      name: `${month.label} SMS flow`,
      source,
      description: `Auto-generated SMS flow for the "${month.theme}" campaign.`,
      type: 'sms', status: 'active', goal: month.theme, audience: 'SMS-Ready',
      sent: 0, opened: 0, clicked: 0, replied: 0, createdAt: now,
      steps: month.generated.sms.map((s, i) => ({
        id: `obsms-${index}-${i}`, day: s.day, waitUnit: 'days',
        subject: '', body: s.message, abTest: false, condition: 'always',
      })),
    });
    smsCampaignId = camp.id;
  }

  const published = patchMonth(index, m => ({
    ...m,
    status: 'PUBLISHED',
    approvedAt: now, approvedBy: actor, publishedAt: now,
    publishedRefs: { sequenceId: seq.id, smsCampaignId, socialPostIds: socialPostIds.length ? socialPostIds : undefined },
    audit: [...m.audit, auditEntry(`Approved & published: email sequence "${seq.name}"${smsCampaignId ? ' + SMS flow' : ''}${socialPostIds.length ? ` + ${socialPostIds.length} social designs` : ''}`, actor)],
  }));
  changeListener?.();
  return published.plan.find(m => m.index === index) ?? null;
}
