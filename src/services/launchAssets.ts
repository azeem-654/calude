/**
 * launchAssets.ts — Part 3 of the onboarding engine.
 *
 * Builds the CRM assets a business needs on day one, from the wizard answers:
 *  - a lead-magnet funnel (landing + thank-you) when the Funnels channel is on
 *  - a 4-page website + 3 SEO starter blog posts when the Blog channel is on
 *  - per-service booking event types + email reminders when Booking is on
 *  - a 90-day launch plan: a task board pipeline with 30-50 concrete tasks
 *
 * Everything is deterministic smart-template output personalized from the
 * profile — no API needed — and applyLaunchAssets() is shared by the wizard
 * launch step and the dashboard backfill button.
 */

import type { Funnel, Website, FunnelStep, FunnelBlock, EventType, SchedulingAutomations, ScheduleAvailability, Pipeline, Stage, Deal } from '../types';
import type { OnboardingState, PlanAuditEntry } from '../types/onboarding';
import { auditEntry, sanitizeText } from './onboarding';

/* ── Small helpers ── */

let blockSeq = 0;
function blk(type: FunnelBlock['type'], content: string, settings: FunnelBlock['settings'] = {}): FunnelBlock {
  return { id: `ob-blk-${Date.now()}-${blockSeq++}`, type, content, settings };
}
const slugify = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 60) || 'page';

/* ── Per-industry service catalog (booking event types) ── */

const SERVICES: Record<string, { name: string; duration: number; description: string }[]> = {
  'Real Estate':            [{ name: 'Buyer Consultation', duration: 45, description: 'Discuss what you\'re looking for and how we can help you find it.' }, { name: 'Home Valuation Visit', duration: 60, description: 'We visit your property and give you a data-backed valuation.' }, { name: 'Listing Strategy Call', duration: 30, description: 'How we\'d market and sell your home.' }],
  'Home Services':          [{ name: 'Free Estimate Visit', duration: 60, description: 'On-site walkthrough and a written estimate.' }, { name: 'Phone Consultation', duration: 20, description: 'Quick call to scope your project.' }],
  'Health & Wellness':      [{ name: 'Initial Consultation', duration: 45, description: 'Understand your goals and build your plan.' }, { name: 'Follow-up Session', duration: 30, description: 'Review progress and adjust your plan.' }],
  'Fitness & Gyms':         [{ name: 'Free Trial Session', duration: 45, description: 'Try a session on us — all levels welcome.' }, { name: 'Fitness Assessment', duration: 30, description: 'Baseline measurements and a personal goal plan.' }, { name: 'Nutrition Consult', duration: 30, description: 'Practical eating plan that fits your life.' }],
  'Beauty & Salon':         [{ name: 'New Client Consultation', duration: 20, description: 'Tell us your style — we\'ll plan your look.' }, { name: 'Full Appointment', duration: 60, description: 'Book your full service slot.' }],
  'Restaurant & Food':      [{ name: 'Event Tasting', duration: 60, description: 'Taste the menu before you book your event.' }, { name: 'Catering Consultation', duration: 30, description: 'Plan the menu and logistics for your event.' }],
  'E-commerce & Retail':    [{ name: 'Product Demo', duration: 30, description: 'See our best sellers and get personal recommendations.' }, { name: 'VIP Shopping Session', duration: 45, description: 'One-on-one shopping help.' }],
  'Professional Services':  [{ name: 'Discovery Call', duration: 30, description: 'Understand your needs and see if we\'re a fit.' }, { name: 'Working Session', duration: 60, description: 'Roll up sleeves and work the problem together.' }],
  'Legal':                  [{ name: 'Initial Case Review', duration: 45, description: 'Confidential review of your situation and options.' }, { name: 'Follow-up Consultation', duration: 30, description: 'Next steps on your matter.' }],
  'Finance & Insurance':    [{ name: 'Financial Review', duration: 45, description: 'Full picture of where you stand and where you could be.' }, { name: 'Quote Call', duration: 20, description: 'Fast, no-obligation quote.' }],
  'Marketing Agency':       [{ name: 'Discovery Call', duration: 30, description: 'Your goals, our approach — see if we\'re a match.' }, { name: 'Marketing Audit Review', duration: 45, description: 'Walk through the audit of your current marketing.' }],
  'Education & Coaching':   [{ name: 'Discovery Call', duration: 30, description: 'Your goals and how the program works.' }, { name: 'Coaching Session', duration: 60, description: 'Full one-on-one session.' }],
  'Automotive':             [{ name: 'Test Drive', duration: 30, description: 'Get behind the wheel.' }, { name: 'Service Appointment', duration: 60, description: 'Book your vehicle in.' }],
  'Construction':           [{ name: 'Site Visit & Estimate', duration: 60, description: 'We assess on site and quote the work.' }, { name: 'Project Planning Call', duration: 30, description: 'Scope, timeline and budget.' }],
  'Technology & SaaS':      [{ name: 'Product Demo', duration: 30, description: 'Live walkthrough tailored to your use case.' }, { name: 'Technical Deep-dive', duration: 60, description: 'Architecture, integrations and rollout.' }],
  'Travel & Hospitality':   [{ name: 'Trip Planning Call', duration: 30, description: 'Tell us your dream trip — we\'ll design it.' }, { name: 'Group Booking Consult', duration: 45, description: 'Plans and pricing for groups.' }],
  'Events & Entertainment': [{ name: 'Venue Tour', duration: 45, description: 'See the space and talk through your event.' }, { name: 'Event Planning Call', duration: 30, description: 'Date, format, budget — let\'s plan it.' }],
  'Nonprofit':              [{ name: 'Partnership Call', duration: 30, description: 'How we can work together for the cause.' }, { name: 'Volunteer Orientation', duration: 45, description: 'Get started as a volunteer.' }],
};
const EVENT_COLORS = ['#3e63dd', '#8b5cf6', '#3f9142'];

export function buildEventTypes(state: OnboardingState): EventType[] {
  const list = SERVICES[state.profile.industry] ?? [
    { name: 'Intro Call', duration: 30, description: 'A quick call to understand what you need.' },
    { name: 'Full Consultation', duration: 60, description: 'In-depth session to plan the work.' },
  ];
  return list.map((s, i) => ({ id: `evt-onb-${Date.now()}-${i}`, name: s.name, duration: s.duration, description: s.description, location: 'Video Call', color: EVENT_COLORS[i % EVENT_COLORS.length] }));
}

export function buildAutomations(state: OnboardingState): SchedulingAutomations {
  const co = state.profile.companyName || 'our team';
  return {
    confirmEmail: true,
    ownerNotify: true,
    ownerEmail: state.profile.email || '',
    reminderEmail: true,
    reminderMinutes: 60,
    reminderSms: false, twilioSid: '', twilioToken: '', twilioFrom: '',
    followupEmail: true,
    followupText: `Thanks for meeting with ${co}! If you enjoyed it, a quick review means the world to us — and if you have any questions, just reply to this email.`,
  };
}

/* ── Lead-magnet funnel ── */

const LEAD_MAGNETS: Record<string, string> = {
  'Real Estate': 'Free Home Valuation', 'Home Services': 'Free On-site Estimate', 'Health & Wellness': 'Free Wellness Assessment',
  'Fitness & Gyms': 'Free Trial Week', 'Beauty & Salon': 'First-Visit Discount', 'Restaurant & Food': 'Free Event Tasting',
  'E-commerce & Retail': '10% Off Your First Order', 'Legal': 'Free Case Review', 'Finance & Insurance': 'Free Financial Review',
  'Marketing Agency': 'Free Marketing Audit', 'Education & Coaching': 'Free Discovery Session', 'Automotive': 'Free Vehicle Appraisal',
  'Construction': 'Free Project Estimate', 'Technology & SaaS': 'Free 14-Day Trial', 'Travel & Hospitality': 'Free Trip Plan',
  'Events & Entertainment': 'Free Venue Tour', 'Nonprofit': 'Free Impact Report',
};

export function buildFunnel(state: OnboardingState): Funnel {
  const p = state.profile;
  const co = p.companyName || 'Our Business';
  const magnet = LEAD_MAGNETS[p.industry] ?? 'Free Consultation';
  const grad = `linear-gradient(135deg, ${p.brandColor} 0%, #17191c 100%)`;
  const now = Date.now();

  const landing: FunnelStep = {
    id: `ob-page-${now}-l`, name: 'Landing', type: 'optin', slug: 'start', visitors: 0, conversions: 0,
    blocks: [
      blk('hero', `${magnet} from ${co}`, {
        subheading: `${sanitizeText(p.description, 160)} Built for ${sanitizeText(p.audience, 110).toLowerCase() || 'people like you'}.`,
        bgGradient: grad, textColor: '#ffffff', buttonText: `Claim my ${magnet.toLowerCase()}`, buttonColor: '#c7f441', buttonTextColor: '#17191c',
        secondaryButtonText: 'How it works', minHeight: 460, align: 'center', padding: 70,
      }),
      blk('features', `Why ${co}?`, {
        subtitle: 'Three reasons our customers stay with us', bgColor: '#f8fafc', padding: 60, columns: 3,
        featureItems: [
          { icon: '⚡', title: 'Fast to start', desc: `Claim your ${magnet.toLowerCase()} in under a minute — we handle the rest and get back to you the same business day.` },
          { icon: '🏆', title: `${p.industry || 'Industry'} experts`, desc: `This is all we do. You get a team that knows ${(p.industry || 'your industry').toLowerCase()} inside-out, not generalists.` },
          { icon: '💬', title: 'No pressure', desc: 'A genuinely useful first step with zero obligation. If we\'re not the right fit, we\'ll tell you.' },
        ],
      }),
      blk('form', `Get your ${magnet.toLowerCase()}`, {
        bgColor: '#ffffff', padding: 60, buttonText: `Send me my ${magnet.toLowerCase()}`, buttonColor: p.brandColor, buttonTextColor: '#ffffff',
        formFields: [
          { label: 'Full name', type: 'text', required: true },
          { label: 'Email', type: 'email', required: true },
          { label: 'Phone', type: 'tel', required: false },
        ],
        redirectUrl: '/thank-you',
      }),
      blk('footer', '', { bgColor: '#17191c', navLogo: co, padding: 46, footerColumns: [], footerCopyright: `© ${new Date().getFullYear()} ${co}. All rights reserved.` }),
    ],
  };

  const thankyou: FunnelStep = {
    id: `ob-page-${now}-t`, name: 'Thank You', type: 'thankyou', slug: 'thank-you', visitors: 0, conversions: 0,
    blocks: [
      blk('hero', 'You\'re in! 🎉', {
        subheading: `Check your inbox — your ${magnet.toLowerCase()} details from ${co} are on the way. Want to skip the queue? Book a time that suits you right now.`,
        bgGradient: grad, textColor: '#ffffff', buttonText: 'Book a time now', buttonColor: '#c7f441', buttonTextColor: '#17191c', minHeight: 420, padding: 70,
      }),
      blk('footer', '', { bgColor: '#17191c', navLogo: co, padding: 46, footerColumns: [], footerCopyright: `© ${new Date().getFullYear()} ${co}. All rights reserved.` }),
    ],
  };

  return {
    id: `funnel-onb-${now}`, name: `${magnet} Funnel`, goal: `Capture leads with a ${magnet.toLowerCase()} offer`,
    steps: 2, visitors: 0, conversions: 0, revenue: 0, status: 'active', slug: slugify(`${co}-${magnet}`),
    pages: [landing, thankyou], createdAt: new Date().toISOString(),
  };
}

/* ── Website + SEO starter blog ── */

function blogArticles(state: OnboardingState): { title: string; paragraphs: string[] }[] {
  const p = state.profile;
  const co = p.companyName || 'our team';
  const ind = (p.industry || 'local business').toLowerCase();
  const aud = sanitizeText(p.audience, 120).toLowerCase() || 'customers';
  return [
    {
      title: `How to Choose the Right ${p.industry || 'Partner'} in ${new Date().getFullYear()}`,
      paragraphs: [
        `Choosing a ${ind} provider is one of those decisions that looks simple until you're in the middle of it. Prices vary wildly, promises all sound the same, and the cost of getting it wrong is real. This guide gives you a practical checklist we share with every prospective customer at ${co} — even the ones who don't end up working with us.`,
        `Start with specialization. A provider that focuses on ${aud} will spot problems and opportunities a generalist simply won't. Ask directly: "How much of your work is with people like me?" If the answer is vague, keep looking.`,
        `Second, insist on proof. Reviews, before-and-afters, named case studies — any provider proud of their work has them ready. At ${co}, we believe the fastest way to judge us is to hear from the people we've already helped.`,
        `Third, pay attention to responsiveness before you buy. The way a company treats you during the sales process is the best it will ever treat you. Same-day replies and clear next steps now predict great service later.`,
        `Finally, make sure the first step is low-risk. We offer a no-obligation first conversation precisely so you can evaluate us with nothing on the line. Whatever provider you choose, never let anyone rush you past that stage.`,
      ],
    },
    {
      title: `5 Questions ${p.industry ? `Every ${p.industry} Customer` : 'You'} Should Ask Before Buying`,
      paragraphs: [
        `After years of serving ${aud}, we've noticed the customers who get the best outcomes all ask better questions up front. Here are the five we wish everyone asked us at ${co}.`,
        `1. "What does the full process look like, start to finish?" A confident provider can walk you through every step, including the boring ones. Vagueness here usually means improvisation later.`,
        `2. "What will this really cost — and what could make it cost more?" The quote is only half the story. Ask what circumstances change the price so there are no surprises.`,
        `3. "Who exactly will I be dealing with?" Sales teams hand off to delivery teams. Meet the people who'll actually serve you, or at least know their names before you sign.`,
        `4. "What happens if I'm not happy?" Guarantees, revision policies, exit terms — good providers have thought about this and answer without flinching.`,
        `5. "Why should I pick you over the cheaper option?" This is our favorite. It gives every provider a fair chance to explain their value — and it tells you a lot about how they think. ${sanitizeText(p.description, 180)}`,
      ],
    },
    {
      title: `Behind the Scenes at ${co}: How We Work`,
      paragraphs: [
        `People often ask what actually happens after they get in touch with ${co}, so here's the honest walkthrough — no marketing gloss.`,
        `Every engagement starts with listening. Before we recommend anything, we want to understand your situation: what you've tried, what worked, what didn't, and what a great outcome looks like for you. For ${aud}, that context changes everything about the right approach.`,
        `Then we put a plan in writing. Scope, timeline, cost, and who does what — in plain language. You should never have to decode jargon to know what you're paying for.`,
        `During the work itself, you'll always know where things stand. We send progress updates without being asked, flag issues early, and treat your deadlines like our own. ${sanitizeText(p.brandVoice, 40) ? `Our style is ${p.brandVoice.toLowerCase()} — ` : ''}we'd rather over-communicate than leave you wondering.`,
        `And when the work is done, we stay reachable. A large share of our business comes from repeat customers and referrals, which only happens when people trust you after the invoice is paid. That's the standard we hold ourselves to — and if it sounds like the kind of team you want in your corner, we'd love to hear from you.`,
      ],
    },
  ];
}

export function buildWebsite(state: OnboardingState): Website {
  const p = state.profile;
  const co = p.companyName || 'Our Business';
  const grad = `linear-gradient(135deg, ${p.brandColor} 0%, #17191c 100%)`;
  const now = Date.now();
  const nav = blk('navbar', '', {
    navLogo: co, bgColor: '#ffffff', textColor: '#17191c', buttonText: 'Book now', buttonColor: p.brandColor, buttonTextColor: '#ffffff',
    navLinks: [{ label: 'Home', url: '#' }, { label: 'About', url: '#' }, { label: 'Blog', url: '#' }, { label: 'Contact', url: '#' }],
  });
  const footer = () => blk('footer', '', {
    bgColor: '#17191c', navLogo: co, padding: 46,
    footerColumns: [
      { heading: 'Company', links: [{ label: 'About us', url: '#' }, { label: 'Contact', url: '#' }] },
      { heading: 'Resources', links: [{ label: 'Blog', url: '#' }, { label: 'Book a time', url: '#' }] },
    ],
    footerCopyright: `© ${new Date().getFullYear()} ${co}. All rights reserved.`,
  });

  const home: FunnelStep = {
    id: `ob-site-${now}-home`, name: 'Home', type: 'landing', slug: 'home', visitors: 0, conversions: 0,
    blocks: [
      nav,
      blk('hero', co, {
        subheading: `${sanitizeText(p.description, 180)}`,
        bgGradient: grad, textColor: '#ffffff', buttonText: 'Get started', buttonColor: '#c7f441', buttonTextColor: '#17191c',
        secondaryButtonText: 'Learn more', minHeight: 440, padding: 70,
      }),
      blk('features', 'What we do', {
        subtitle: `Built for ${sanitizeText(p.audience, 90).toLowerCase() || 'you'}`, bgColor: '#f8fafc', padding: 60, columns: 3,
        featureItems: (SERVICES[p.industry] ?? [
          { name: 'Consultation', duration: 30, description: 'A first conversation about what you need.' },
          { name: 'Full Service', duration: 60, description: 'The complete experience, end to end.' },
        ]).slice(0, 3).map((s, i) => ({ icon: ['✨', '🎯', '🤝'][i % 3], title: s.name, desc: s.description })),
      }),
      blk('testimonials', 'What customers say', {
        bgColor: '#ffffff', padding: 60,
        testimonialItems: [
          { stars: 5, quote: `Working with ${co} was the easiest part of my month. Fast, clear and genuinely helpful.`, author: 'Recent customer', role: 'Google review' },
          { stars: 5, quote: 'They did what they said, when they said, for the price they quoted. Rare these days.', author: 'Verified client', role: 'Facebook review' },
        ],
      }),
      blk('cta', 'Ready when you are', {
        subheading: 'Book a time that suits you — it takes under a minute.',
        bgGradient: grad, textColor: '#ffffff', buttonText: 'Book now', buttonColor: '#c7f441', buttonTextColor: '#17191c', padding: 70,
      }),
      footer(),
    ],
  };

  const about: FunnelStep = {
    id: `ob-site-${now}-about`, name: 'About', type: 'custom', slug: 'about', visitors: 0, conversions: 0,
    blocks: [
      nav,
      blk('heading', `About ${co}`, { size: 'xl', padding: 50, bgColor: '#ffffff' }),
      blk('text', sanitizeText(p.description, 400) || `${co} exists to serve its customers exceptionally well.`, { size: 'lg', padding: 20, bgColor: '#ffffff', align: 'left' }),
      blk('text', `We work with ${sanitizeText(p.audience, 250).toLowerCase() || 'customers who value quality'} — and our approach is ${(p.brandVoice || 'friendly & approachable').toLowerCase()}. If that sounds like your kind of team, we'd love to meet you.`, { padding: 20, bgColor: '#ffffff', align: 'left' }),
      blk('cta', 'Let\'s talk', { subheading: 'The first conversation is free and genuinely useful.', bgGradient: grad, textColor: '#ffffff', buttonText: 'Book a call', buttonColor: '#c7f441', buttonTextColor: '#17191c', padding: 60 }),
      footer(),
    ],
  };

  const blogs = blogArticles(state);
  const blogPages: FunnelStep[] = blogs.map((b, i) => ({
    id: `ob-site-${now}-blog${i}`, name: `Blog: ${b.title.slice(0, 40)}`, type: 'custom', slug: slugify(b.title), visitors: 0, conversions: 0,
    blocks: [
      nav,
      blk('heading', b.title, { size: 'xl', padding: 50, bgColor: '#ffffff', align: 'left' }),
      ...b.paragraphs.map(par => blk('text', par, { padding: 14, bgColor: '#ffffff', align: 'left', size: 'lg' })),
      blk('cta', 'Want help with this?', { subheading: `${co} is one message away.`, bgGradient: grad, textColor: '#ffffff', buttonText: 'Get in touch', buttonColor: '#c7f441', buttonTextColor: '#17191c', padding: 56 }),
      footer(),
    ],
  }));

  return {
    id: `site-onb-${now}`,
    name: `${co} Website`,
    description: `Auto-generated starter website for ${co} with SEO blog.`,
    status: 'published',
    subdomain: slugify(co),
    seoTitle: `${co} — ${p.industry || 'Services'} for ${sanitizeText(p.audience, 60) || 'you'}`,
    seoDescription: sanitizeText(p.description, 155),
    seoKeywords: [p.industry, p.companyName, 'reviews', 'near me', 'best'].filter(Boolean).join(', ').toLowerCase(),
    pages: [home, about, ...blogPages],
    visitors: 0, pageViews: 0, createdAt: new Date().toISOString(),
  };
}

/* ── 90-day launch plan (task board) ── */

interface TaskTpl { title: string; stage: 0 | 1 | 2 | 3; priority: 'urgent' | 'high' | 'normal' | 'low'; desc?: string; checklist?: string[]; }

function taskTemplates(state: OnboardingState): TaskTpl[] {
  const ch = new Set(state.channels);
  const co = state.profile.companyName || 'your business';
  const theme = state.plan[0]?.theme || 'this month\'s theme';
  const base: TaskTpl[] = [
    { title: 'Connect business email (SMTP) so campaigns can send', stage: 0, priority: 'urgent', desc: 'Settings → Email. Without this, sequences and campaigns stay in the outbox.' },
    { title: 'Upload logo & confirm brand colors', stage: 0, priority: 'high' },
    { title: 'Review sales pipeline stages with the team', stage: 0, priority: 'high', desc: 'The wizard created your stages — rename or reorder anything that doesn\'t match how you actually sell.' },
    { title: 'Import any remaining contacts', stage: 0, priority: 'high' },
    { title: 'Claim & update your Google Business Profile', stage: 0, priority: 'urgent', checklist: ['Verify ownership', 'Add photos and hours', 'Write a keyword-rich description', 'Enable messaging'] },
    { title: 'Share your booking link on website & social bios', stage: 0, priority: 'high' },
    { title: 'Review Month-1 content in the Content Pipeline', stage: 0, priority: 'urgent', desc: 'Emails and SMS are waiting for your approval on the dashboard.' },
    { title: 'Add team members and assign lead ownership', stage: 0, priority: 'normal' },
    { title: 'Approve & publish Month-1 emails and SMS', stage: 1, priority: 'urgent' },
    { title: 'Announce your booking link to existing customers', stage: 1, priority: 'high' },
    { title: 'Ask your 10 happiest customers for a Google review', stage: 1, priority: 'high', checklist: ['Pick the 10 customers', 'Send a personal message with the direct review link', 'Thank everyone who posts'] },
    { title: 'Reply to every new lead within 5 minutes', stage: 1, priority: 'urgent', desc: 'Leads contacted within 5 minutes convert 21× better. Watch the Live Activity feed.' },
    { title: `Run the "${theme}" monthly promo`, stage: 1, priority: 'high' },
    { title: 'Track win rate and pipeline value weekly', stage: 1, priority: 'normal' },
    { title: 'Hold a 30-minute weekly marketing review', stage: 1, priority: 'normal' },
    { title: 'Launch a referral push to happy customers', stage: 2, priority: 'high', checklist: ['Decide the reward', 'Email the offer to past customers', 'Add a referral ask to the follow-up email'] },
    { title: 'A/B test your best email subject line', stage: 2, priority: 'normal' },
    { title: 'Clean bounced and invalid contacts from the list', stage: 2, priority: 'normal' },
    { title: 'Rescue or close stale pipeline deals', stage: 2, priority: 'high' },
    { title: 'Refresh website testimonials with new reviews', stage: 2, priority: 'normal' },
    { title: 'Shift send times to your best open-rate window', stage: 2, priority: 'low' },
    { title: 'Double down on your best-performing channel', stage: 3, priority: 'high', desc: 'Check Analytics: whichever channel drove the most leads in 60 days gets 2× budget/time in Month 3.' },
    { title: `Raise the monthly lead target beyond ${state.goals.monthlyLeadTarget}`, stage: 3, priority: 'normal' },
    { title: 'Build a win-back campaign for lapsed customers', stage: 3, priority: 'high' },
    { title: 'Record one customer video testimonial', stage: 3, priority: 'normal' },
    { title: 'Plan next quarter from the 12-month content plan', stage: 3, priority: 'high' },
  ];
  const packs: TaskTpl[] = [];
  if (ch.has('email')) packs.push(
    { title: 'Verify sender domain (SPF/DKIM) for deliverability', stage: 0, priority: 'high' },
    { title: 'Send the welcome campaign to imported contacts', stage: 1, priority: 'high' },
    { title: 'Build a 5-step nurture sequence for cold leads', stage: 2, priority: 'normal' },
  );
  if (ch.has('sms')) packs.push(
    { title: 'Confirm SMS opt-out wording and compliance', stage: 0, priority: 'high' },
    { title: 'Send the SMS welcome to SMS-Ready contacts', stage: 1, priority: 'high' },
    { title: 'Test SMS vs email response on one promo', stage: 2, priority: 'normal' },
  );
  if (ch.has('facebook') || ch.has('instagram') || ch.has('linkedin')) packs.push(
    { title: 'Refresh social profiles with the new brand kit', stage: 0, priority: 'high' },
    { title: 'Schedule 12 posts from Social Creator templates', stage: 1, priority: 'high' },
    { title: 'Post 3× per week on your chosen social channels', stage: 1, priority: 'normal' },
    { title: 'Boost your best-performing post of the month', stage: 2, priority: 'normal' },
  );
  if (ch.has('video')) packs.push(
    { title: 'Create 4 shorts from your best video in AI Shorts', stage: 1, priority: 'high' },
    { title: 'Publish 2 shorts per week', stage: 2, priority: 'normal' },
    { title: 'Turn your top short into a paid ad', stage: 3, priority: 'normal' },
  );
  if (ch.has('blog')) packs.push(
    { title: 'Publish the 3 starter blog posts on your site', stage: 1, priority: 'high' },
    { title: 'Write 2 new SEO posts targeting local keywords', stage: 2, priority: 'normal' },
    { title: 'Refresh your top post with updated keywords', stage: 3, priority: 'low' },
  );
  if (ch.has('reviews')) packs.push(
    { title: 'Set up the automatic review-request flow', stage: 0, priority: 'high' },
    { title: 'Reply to every existing review (good and bad)', stage: 1, priority: 'high' },
    { title: 'Showcase five 5-star reviews on the website', stage: 2, priority: 'normal' },
  );
  if (ch.has('booking')) packs.push(
    { title: 'Test-book each service booking page yourself', stage: 0, priority: 'high' },
    { title: 'Add the booking link to all email signatures', stage: 1, priority: 'normal' },
    { title: 'Enable reminders to cut no-shows', stage: 1, priority: 'high' },
  );
  if (ch.has('funnels')) packs.push(
    { title: 'Drive first traffic to the lead-magnet funnel', stage: 1, priority: 'high' },
    { title: 'A/B test the funnel headline', stage: 2, priority: 'normal' },
    { title: 'Add an upsell step to the funnel', stage: 3, priority: 'low' },
  );
  const fillers: TaskTpl[] = [
    { title: 'Ask three customers what almost stopped them buying', stage: 2, priority: 'normal', desc: `Their answers become ${co}'s best marketing copy.` },
    { title: 'Audit your website copy for clarity in 15 minutes', stage: 2, priority: 'low' },
    { title: 'Set up a simple monthly KPI scorecard', stage: 1, priority: 'normal' },
    { title: 'Document your sales follow-up cadence', stage: 1, priority: 'normal' },
    { title: 'Create a one-page offer summary PDF', stage: 2, priority: 'low' },
    { title: 'List 20 local partnership prospects', stage: 3, priority: 'normal' },
  ];
  let all = [...base, ...packs];
  for (const f of fillers) { if (all.length >= 30) break; all.push(f); }
  if (all.length > 50) all = all.slice(0, 50);
  return all;
}

/** How many 90-day tasks a launch with the current answers will create. */
export function plannedTaskCount(state: OnboardingState): number {
  return taskTemplates(state).length;
}

const STAGE_DEFS = [
  { name: 'Weeks 1–2 · Foundation', color: '#e5484d', dayFrom: 2, dayTo: 14 },
  { name: 'Month 1 · Launch',       color: '#3e63dd', dayFrom: 15, dayTo: 40 },
  { name: 'Month 2 · Momentum',     color: '#8b5cf6', dayFrom: 41, dayTo: 70 },
  { name: 'Month 3 · Scale',        color: '#3f9142', dayFrom: 71, dayTo: 90 },
];

export function buildNinetyDayStages(state: OnboardingState): Stage[] {
  const tasks = taskTemplates(state);
  const now = Date.now();
  const co = state.profile.companyName || 'Team';
  const stages: Stage[] = STAGE_DEFS.map((s, i) => ({ id: `ob-stage-${now}-${i}`, name: s.name, color: s.color, deals: [] }));
  tasks.forEach((t, i) => {
    const def = STAGE_DEFS[t.stage];
    const span = Math.max(def.dayTo - def.dayFrom, 1);
    const due = new Date(now + (def.dayFrom + (i % span)) * 86400000);
    const deal: Deal = {
      id: `ob-task-${now}-${i}`,
      title: t.title,
      contactId: '', contactName: co,
      value: 0, probability: 0,
      stage: def.name,
      expectedClose: due.toISOString().split('T')[0],
      assignedTo: 'You',
      createdAt: new Date(now).toISOString(),
      priority: t.priority,
      status: 'active',
      description: t.desc,
      labels: [{ color: '#c7f441', text: '90-day plan' }],
      checklist: t.checklist?.map((c, ci) => ({ id: `ob-chk-${now}-${i}-${ci}`, text: c, done: false })),
      source: 'Onboarding',
    };
    stages[t.stage].deals.push(deal);
  });
  return stages;
}

/* ── Orchestrator (shared by wizard launch + dashboard backfill) ── */

export interface LaunchApi {
  addFunnel: (f: Funnel) => void;
  addWebsite: (w: Website) => void;
  updateSchedule: (u: Partial<ScheduleAvailability>) => void;
  createPipeline: (name: string) => Pipeline;
  updatePipeline: (id: string, u: Partial<Pipeline>) => void;
}

export interface LaunchAssetsResult {
  funnelId?: string;
  websiteId?: string;
  taskPipelineId: string;
  taskCount: number;
  blogCount: number;
  eventTypeCount: number;
  audit: PlanAuditEntry[];
}

/**
 * Create every Part-3 launch asset the selected channels call for.
 * Pure with respect to onboarding storage: returns refs + audit entries for
 * the caller to merge into the persisted OnboardingState.
 */
export function applyLaunchAssets(state: OnboardingState, api: LaunchApi, actor: string): LaunchAssetsResult {
  const audit: PlanAuditEntry[] = [];
  let funnelId: string | undefined;
  let websiteId: string | undefined;
  let blogCount = 0;
  let eventTypeCount = 0;

  if (state.channels.includes('funnels')) {
    const funnel = buildFunnel(state);
    api.addFunnel(funnel);
    funnelId = funnel.id;
    audit.push(auditEntry(`Lead-magnet funnel "${funnel.name}" created (landing + thank-you)`, actor));
  }

  if (state.channels.includes('blog')) {
    const site = buildWebsite(state);
    api.addWebsite(site);
    websiteId = site.id;
    blogCount = (site.pages ?? []).filter(pg => pg.name.startsWith('Blog:')).length;
    audit.push(auditEntry(`Website "${site.name}" generated with ${blogCount} SEO blog posts`, actor));
  }

  if (state.channels.includes('booking')) {
    const eventTypes = buildEventTypes(state);
    eventTypeCount = eventTypes.length;
    api.updateSchedule({ eventTypes, automations: buildAutomations(state) });
    audit.push(auditEntry(`${eventTypes.length} service booking pages configured with confirmation + 60-min reminder emails`, actor));
  }

  const stages = buildNinetyDayStages(state);
  const taskCount = stages.reduce((s, st) => s + st.deals.length, 0);
  const pipe = api.createPipeline('90-Day Launch Plan');
  api.updatePipeline(pipe.id, { stages });
  audit.push(auditEntry(`90-day launch plan created: ${taskCount} tasks across ${stages.length} phases`, actor));

  return { funnelId, websiteId, taskPipelineId: pipe.id, taskCount, blogCount, eventTypeCount, audit };
}
