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

import type { ContentMonth, MonthContent, OnboardingState } from '../types/onboarding';
import type { Campaign } from '../types';
import type { EmailSequence } from '../types/marketing';
import { loadOnboarding, saveOnboarding, auditEntry, sanitizeText } from './onboarding';
import { generateMonthCampaigns, hasGeminiKey } from '../lib/gemini';

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

/** Generate a month's content: Gemini first, offline templates as fallback. */
export async function generateMonthContent(state: OnboardingState, month: ContentMonth): Promise<{ content: MonthContent; source: 'ai' | 'smart-templates' }> {
  const fallback = offlineMonthContent(state, month);
  if (!hasGeminiKey()) return { content: fallback, source: 'smart-templates' };
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
    if (emails.length < 3) return { content: fallback, source: 'smart-templates' };
    return { content: { emails, sms: state.channels.includes('sms') ? (sms.length ? sms : fallback.sms) : [] }, source: 'ai' };
  } catch {
    return { content: fallback, source: 'smart-templates' };
  }
}

/* ── Background job runner ── */

const inFlight = new Set<number>();
let changeListener: (() => void) | null = null;
/** The dashboard registers here to refresh its widgets when a job finishes. */
export function onContentJobsChange(cb: (() => void) | null) { changeListener = cb; }

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
      patchMonth(index, m => ({
        ...m,
        status: 'AWAITING_APPROVAL',
        generated: content,
        generatedAt: new Date().toISOString(),
        counts: { ...m.counts, emails: content.emails.length, sms: content.sms.length },
        audit: [...m.audit, auditEntry(`Generated ${content.emails.length} emails + ${content.sms.length} SMS via ${source === 'ai' ? 'Gemini AI' : 'smart templates'}`, actor)],
      }));
      notify(`${monthShort(index)} content is ready for review — ${content.emails.length} emails, ${content.sms.length} SMS`, 'info');
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

/* ── Approve & publish ── */

export interface PublishApi {
  addSequence: (seq: Omit<EmailSequence, 'id'>) => EmailSequence;
  addCampaign: (campaign: Omit<Campaign, 'id'>) => Campaign;
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

  const seq = api.addSequence({
    name: `${month.label}: ${month.theme}`,
    goal: month.focus.slice(0, 140),
    status: 'active',
    createdAt: now,
    enrolledCount: 0,
    steps: month.generated.emails.map((e, i) => ({
      id: `obstep-${index}-${i}`, day: e.day, waitUnit: 'days', type: 'auto_email',
      subject: e.subject, body: e.body, followUpRule: 'No reply → continue sequence',
    })),
  });

  let smsCampaignId: string | undefined;
  if (month.generated.sms.length) {
    const camp = api.addCampaign({
      name: `${month.label} SMS flow`,
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
    publishedRefs: { sequenceId: seq.id, smsCampaignId },
    audit: [...m.audit, auditEntry(`Approved & published: email sequence "${seq.name}"${smsCampaignId ? ' + SMS flow' : ''}`, actor)],
  }));
  changeListener?.();
  return published.plan.find(m => m.index === index) ?? null;
}
