/**
 * Phases 4 to 7 — the channels the CRM owns end to end.
 *
 * Email, SMS, blog and landing page. Unlike the social placements these have no
 * third party to hand off to, so what is written here is what actually sends.
 *
 * Two constraints shape the code. SMS is billed and split by segment, so 160
 * characters is a hard ceiling rather than a guideline. And every piece of HTML
 * is assembled by us from user-supplied text, so it is escaped at the point of
 * interpolation — the wizard already stripped angle brackets on the way in, and
 * this is the second lock on the same door.
 */
import { newId } from './socialAutomation';
import { trimToWord } from './campaignComposer';
import type { CampaignAnalysis } from './campaignAnalysis';
import type { Campaign, CampaignAsset, CampaignSource } from '../types/socialAutomation';

/** Escape for HTML text and attribute contexts. */
export function escapeHtml(input: string): string {
  return input
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/** One GSM-7 segment. Past this the message is split and billed twice. */
export const SMS_LIMIT = 160;

const base = (campaign: Campaign, source: CampaignSource) => ({
  campaignId: campaign.id,
  sourceId: source.id,
  status: 'ready' as const,
  placement: null,
  hashtags: [] as string[],
  mentions: [] as string[],
  media: [] as string[],
  createdAt: new Date().toISOString(),
  updatedAt: new Date().toISOString(),
});

/* ── Phase 4: the email sequence ── */

interface EmailPlan {
  day: number;
  role: string;
  subjects: [string, string, string];
  lead: string;
  bullets: string[];
  cta: string;
}

/** Where the campaign points people. Falls back to the video itself. */
function linkFor(source: CampaignSource): string {
  return source.url ?? '';
}

function emailPlans(campaign: Campaign, analysis: CampaignAnalysis): EmailPlan[] {
  const topic = campaign.title || analysis.topics[0] || 'our latest video';
  const points = analysis.talkingPoints.length ? analysis.talkingPoints : [analysis.summary];
  const cta = analysis.ctas[0] ?? 'Watch the video';

  return [
    {
      day: 0,
      role: 'Announcement',
      subjects: [
        trimToWord(`New: ${topic}`, 70),
        trimToWord(`We just published ${topic}`, 70),
        trimToWord(`${topic} — worth 5 minutes`, 70),
      ],
      lead: `We just released something we think is genuinely useful: ${topic}.`,
      bullets: points.slice(0, 2),
      cta,
    },
    {
      day: 2,
      role: 'Key takeaways',
      subjects: [
        trimToWord(`${points.length} things worth knowing about ${topic}`, 70),
        'The short version, if you missed it',
        trimToWord(`What most people get wrong about ${topic}`, 70),
      ],
      lead: 'If you have not had time to watch it yet, here is the short version.',
      bullets: points.slice(0, 4),
      cta: analysis.ctas[1] ?? cta,
    },
    {
      day: 5,
      role: 'Deep dive',
      subjects: [
        'The full breakdown',
        trimToWord(`A closer look at ${topic}`, 70),
        'We wrote this one up properly',
      ],
      lead: `${analysis.summary} We have written the whole thing up so you can skim or read it end to end.`,
      bullets: points.slice(2, 6),
      cta: analysis.ctas[2] ?? 'Read the full article',
    },
    {
      day: 9,
      role: campaign.goal === 'promote' || campaign.goal === 'launch' ? 'Offer' : 'Follow-up',
      subjects: campaign.goal === 'promote' || campaign.goal === 'launch'
        ? ['Ready when you are', trimToWord(`Want help with ${topic}?`, 70), 'One last thing']
        : ['Anything you would add?', 'Did this land?', 'Last one on this'],
      lead: campaign.goal === 'promote' || campaign.goal === 'launch'
        ? 'If this is something you would rather not do alone, we can help.'
        : 'That is the last email on this topic — I would genuinely like to know what you thought.',
      bullets: points.slice(0, 2),
      cta: analysis.ctas[3] ?? cta,
    },
  ];
}

function emailHtml(plan: EmailPlan, campaign: Campaign, link: string): string {
  const bullets = plan.bullets
    .map(b => `      <li style="margin:0 0 8px">${escapeHtml(b)}</li>`)
    .join('\n');
  const button = link
    ? `    <p style="margin:24px 0"><a href="${escapeHtml(link)}" style="background:#17191c;color:#ffffff;padding:12px 22px;border-radius:999px;text-decoration:none;font-weight:700;display:inline-block">${escapeHtml(plan.cta)}</a></p>`
    : `    <p style="margin:24px 0;font-weight:700">${escapeHtml(plan.cta)}</p>`;

  return `<div style="font-family:system-ui,-apple-system,'Segoe UI',sans-serif;line-height:1.6;color:#17191c;max-width:600px">
    <h1 style="font-size:22px;margin:0 0 14px">${escapeHtml(campaign.title)}</h1>
    <p style="margin:0 0 16px">Hi {{firstName}},</p>
    <p style="margin:0 0 16px">${escapeHtml(plan.lead)}</p>
${bullets ? `    <ul style="margin:0 0 16px;padding-left:20px">\n${bullets}\n    </ul>` : ''}
${button}
    <p style="margin:0;color:#8a8f98;font-size:13px">You are receiving this because you are on our list.</p>
  </div>`;
}

export function composeEmails(
  campaign: Campaign,
  source: CampaignSource,
  analysis: CampaignAnalysis,
): CampaignAsset[] {
  const link = linkFor(source);
  return emailPlans(campaign, analysis).map(plan => ({
    ...base(campaign, source),
    id: newId('asset'),
    kind: 'email' as const,
    channel: 'email' as const,
    title: `${plan.role} — day ${plan.day}`,
    body: [plan.lead, ...plan.bullets.map(b => `• ${b}`), plan.cta].join('\n\n'),
    html: emailHtml(plan, campaign, link),
    // The three subject lines to A/B test, best guess first.
    parts: plan.subjects.map((s, i) => ({ title: `Subject ${String.fromCharCode(65 + i)}`, body: s })),
  }));
}

/* ── Phase 5: SMS ── */

/**
 * Short messages that fit one segment. The link is reserved for last so it is
 * never the thing that gets trimmed — a truncated URL makes the whole message
 * worthless.
 */
export function composeSms(
  campaign: Campaign,
  source: CampaignSource,
  analysis: CampaignAnalysis,
): CampaignAsset[] {
  const link = linkFor(source);
  const suffix = link ? ` ${link}` : '';
  const room = SMS_LIMIT - suffix.length;
  const topic = campaign.title || analysis.topics[0] || 'our latest video';
  const quote = analysis.talkingPoints[0] ?? analysis.summary;

  const drafts: { title: string; text: string }[] = [
    { title: 'Alert', text: `New video just dropped — ${topic}.` },
    { title: 'Reminder', text: `Did you catch our latest? Key takeaway: ${quote}` },
  ];
  if (campaign.goal === 'promote' || campaign.goal === 'launch' || campaign.goal === 'traffic') {
    drafts.push({ title: 'Offer', text: `Want to go deeper on ${topic}? Reply YES and we will send details.` });
  }

  return drafts.map(d => ({
    ...base(campaign, source),
    id: newId('asset'),
    kind: 'sms' as const,
    channel: 'sms' as const,
    title: `SMS ${d.title}`,
    body: `${trimToWord(d.text, Math.max(20, room))}${suffix}`,
  }));
}

/* ── Phase 6: the blog post ── */

export interface BlogDraft {
  title: string;
  metaDescription: string;
  tags: string[];
  html: string;
  text: string;
}

/**
 * A full article from the video. Headings come from the talking points, so the
 * structure follows what was actually said rather than a fixed template with
 * the topic pasted in.
 */
export function buildBlog(campaign: Campaign, analysis: CampaignAnalysis): BlogDraft {
  const title = trimToWord(campaign.title || analysis.topics[0] || 'What we learned', 60);
  const intro = analysis.summary || campaign.description;
  const points = analysis.talkingPoints.length ? analysis.talkingPoints : [intro];
  const cta = analysis.ctas[analysis.ctas.length - 1] ?? 'Get in touch';

  const sections = points.slice(0, 6).map((p, i) => {
    // The first sentence becomes the heading; the rest is the section body.
    const split = p.indexOf('. ');
    const heading = split > 12 ? p.slice(0, split) : `${i + 1}. ${trimToWord(p, 60)}`;
    const body = split > 12 ? p.slice(split + 2) : p;
    return { heading: trimToWord(heading, 80), body };
  });

  const html = [
    `<h1>${escapeHtml(title)}</h1>`,
    `<p>${escapeHtml(intro)}</p>`,
    ...sections.flatMap(s => [`<h2>${escapeHtml(s.heading)}</h2>`, `<p>${escapeHtml(s.body)}</p>`]),
    '<h2>Where to go from here</h2>',
    `<p>${escapeHtml(cta)}.</p>`,
  ].join('\n');

  const text = [
    title, '', intro, '',
    ...sections.flatMap(s => [s.heading, s.body, '']),
    'Where to go from here', cta,
  ].join('\n');

  return {
    title,
    // Search engines cut around 160 characters, so write to that rather than past it.
    metaDescription: trimToWord(intro.replace(/\s+/g, ' '), 155),
    tags: analysis.keywords.slice(0, 8),
    html,
    text,
  };
}

export function composeBlog(
  campaign: Campaign,
  source: CampaignSource,
  analysis: CampaignAnalysis,
): CampaignAsset[] {
  const blog = buildBlog(campaign, analysis);
  return [{
    ...base(campaign, source),
    id: newId('asset'),
    kind: 'blog' as const,
    channel: 'blog' as const,
    title: blog.title,
    body: blog.text,
    html: blog.html,
    hashtags: blog.tags.map(t => `#${t}`),
    parts: [{ title: 'Meta description', body: blog.metaDescription }],
  }];
}

/* ── Phase 7: the landing page ── */

export function composeLanding(
  campaign: Campaign,
  source: CampaignSource,
  analysis: CampaignAnalysis,
): CampaignAsset[] {
  const headline = trimToWord(campaign.title || analysis.topics[0] || 'Watch this', 70);
  const sub = trimToWord(analysis.summary, 160);
  const benefits = (analysis.talkingPoints.length ? analysis.talkingPoints : [analysis.summary])
    .slice(0, 5)
    .map(b => trimToWord(b, 110));
  const cta = analysis.ctas[0] ?? 'Get started';
  const link = linkFor(source);

  const html = [
    `<h1>${escapeHtml(headline)}</h1>`,
    `<p>${escapeHtml(sub)}</p>`,
    link ? `<p><a href="${escapeHtml(link)}">Watch the video</a></p>` : '',
    '<ul>',
    ...benefits.map(b => `  <li>${escapeHtml(b)}</li>`),
    '</ul>',
    `<p><strong>${escapeHtml(cta)}</strong></p>`,
  ].filter(Boolean).join('\n');

  return [{
    ...base(campaign, source),
    id: newId('asset'),
    kind: 'landing' as const,
    channel: 'landing' as const,
    title: headline,
    body: [sub, ...benefits.map(b => `• ${b}`), cta].join('\n\n'),
    html,
    media: link ? [link] : [],
    parts: benefits.map((b, i) => ({ title: `Benefit ${i + 1}`, body: b })),
  }];
}

/** Everything the campaign's own channels asked for. */
export function composeChannels(
  campaign: Campaign,
  source: CampaignSource,
  analysis: CampaignAnalysis,
): CampaignAsset[] {
  const out: CampaignAsset[] = [];
  if (campaign.channels.includes('email')) out.push(...composeEmails(campaign, source, analysis));
  if (campaign.channels.includes('sms')) out.push(...composeSms(campaign, source, analysis));
  if (campaign.channels.includes('blog')) out.push(...composeBlog(campaign, source, analysis));
  if (campaign.channels.includes('landing')) out.push(...composeLanding(campaign, source, analysis));
  return out;
}
