/**
 * pageTemplates.ts — the single source of truth for ready-made page content.
 *
 * Both creation flows (the funnel wizard and the New Website modal) and the
 * preview thumbnails render from these builders, so what a user previews is
 * exactly what gets created. Previously each wizard created pages with
 * `blocks: []`, which is why new funnels/websites opened completely empty.
 */

import type { FunnelBlock, FunnelStep } from '../../types';

export interface BrandContext {
  /** Business/site name used in copy, nav logo and footer. */
  name: string;
  /** Primary accent colour for buttons and icon chips. */
  color: string;
  /** Optional one-line positioning statement. */
  tagline?: string;
  /** Per-template hero overrides so every template reads differently. */
  heroTitle?: string;
  heroEyebrow?: string;
  heroCta?: string;
}

let seq = 0;
const uid = () => `tb-${Date.now().toString(36)}-${(seq++).toString(36)}`;

function blk(type: FunnelBlock['type'], content: string, settings: FunnelBlock['settings'] = {}): FunnelBlock {
  return { id: uid(), type, content, settings };
}

const slug = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'page';

/** Darkened brand gradient used for hero/CTA bands. */
const heroGrad = (c: string) => `linear-gradient(135deg, ${c} 0%, #17191c 100%)`;

/* ── Shared building blocks ── */

function navbar(ctx: BrandContext, cta = 'Get Started'): FunnelBlock {
  return blk('navbar', '', {
    navLogo: ctx.name, bgColor: '#ffffff', textColor: '#17191c',
    buttonText: cta, buttonColor: ctx.color, buttonTextColor: '#ffffff',
    navLinks: [
      { label: 'Home', url: '#' }, { label: 'Features', url: '#features' },
      { label: 'Pricing', url: '#pricing' }, { label: 'Contact', url: '#contact' },
    ],
  });
}

function footer(ctx: BrandContext): FunnelBlock {
  return blk('footer', '', {
    bgColor: '#17191c', textColor: '#94a3b8', navLogo: ctx.name, padding: 52,
    footerColumns: [
      { heading: 'Company', links: [{ label: 'About', url: '#' }, { label: 'Contact', url: '#' }] },
      { heading: 'Legal', links: [{ label: 'Privacy', url: '#' }, { label: 'Terms', url: '#' }] },
    ],
    footerCopyright: `© ${new Date().getFullYear()} ${ctx.name}. All rights reserved.`,
  });
}

function trustStats(ctx: BrandContext): FunnelBlock {
  return blk('stats', '', {
    bgColor: '#0f172a', textColor: '#ffffff', padding: 56,
    statItems: [
      { value: '12,000+', label: 'Customers served', icon: '🤝' },
      { value: '4.9★', label: 'Average rating', icon: '⭐' },
      { value: '24h', label: 'Response time', icon: '⚡' },
      { value: '98%', label: 'Would recommend', icon: '🏆' },
    ],
  });
}

function testimonials(ctx: BrandContext): FunnelBlock {
  return blk('testimonials', 'Loved by our customers', {
    eyebrow: 'Reviews', bgColor: '#ffffff', padding: 72,
    testimonialItems: [
      { stars: 5, quote: `${ctx.name} paid for itself in the first month. I only wish we'd started sooner.`, author: 'Sarah Mitchell', role: 'Operations Lead' },
      { stars: 5, quote: 'Straightforward, fast, and they actually answer the phone. Rare these days.', author: 'James Okafor', role: 'Small business owner' },
      { stars: 5, quote: 'The onboarding took ten minutes and the results showed up the same week.', author: 'Priya Raman', role: 'Marketing Manager' },
    ],
  });
}

function faq(ctx: BrandContext): FunnelBlock {
  return blk('faq', 'Frequently asked questions', {
    eyebrow: 'FAQ', bgColor: '#f8fafc', padding: 72, align: 'center',
    faqItems: [
      { q: 'How quickly can I get started?', a: `Most customers are up and running with ${ctx.name} the same day — there is nothing to install.` },
      { q: 'Is there a contract or lock-in?', a: 'No. Everything is month-to-month and you can cancel from your account at any time.' },
      { q: 'What if it is not right for me?', a: 'Tell us within 30 days and we will refund you in full, no questions asked.' },
      { q: 'Do you offer support?', a: 'Yes — real humans, by email and phone, with a same-business-day response.' },
    ],
  });
}

function leadForm(ctx: BrandContext, heading: string, cta: string): FunnelBlock {
  return blk('form', heading, {
    bgColor: '#ffffff', padding: 64, buttonText: cta, buttonColor: ctx.color, buttonTextColor: '#ffffff',
    formFields: [
      { label: 'Full name', type: 'text', required: true },
      { label: 'Email address', type: 'email', required: true },
      { label: 'Phone number', type: 'tel', required: false },
    ],
    redirectUrl: '/thank-you',
  });
}

/* ── Funnel page templates, keyed by step type ── */

/**
 * Real, complete page content for a funnel step. Every funnel step type
 * produces a presentable page — never an empty canvas.
 */
export function buildFunnelPageBlocks(type: FunnelStep['type'], ctx: BrandContext): FunnelBlock[] {
  const g = heroGrad(ctx.color);
  const tag = ctx.tagline || `The easier way to work with ${ctx.name}`;

  switch (type) {
    case 'optin':
      return [
        blk('hero', ctx.heroTitle || 'Get the free guide that saves you hours every week', {
          eyebrow: ctx.heroEyebrow || 'Free download', subheading: tag, bgGradient: g, textColor: '#ffffff',
          buttonText: ctx.heroCta || 'Send me the guide', buttonColor: '#c7f441', buttonTextColor: '#17191c',
          secondaryButtonText: 'See what is inside', minHeight: 480, align: 'center', padding: 76,
        }),
        blk('features', 'What you will learn', {
          eyebrow: 'Inside the guide', subtitle: 'Three things you can apply the same day', bgColor: '#f8fafc', padding: 68, columns: 3, iconColor: ctx.color,
          featureItems: [
            { icon: '⚡', title: 'The 10-minute setup', desc: 'A simple checklist that removes the busywork from your week.' },
            { icon: '🎯', title: 'The 3 costly mistakes', desc: 'What quietly drains time and money — and how to avoid all three.' },
            { icon: '📈', title: 'The follow-up system', desc: 'The exact sequence that turns interest into booked business.' },
          ],
        }),
        leadForm(ctx, 'Where should we send it?', 'Send me the free guide'),
        footer(ctx),
      ];

    case 'sales':
      return [
        navbar(ctx, 'Buy now'),
        blk('hero', ctx.heroTitle || 'Everything you need to grow — in one place', {
          eyebrow: ctx.heroEyebrow || 'Limited time offer', subheading: tag, bgGradient: g, textColor: '#ffffff',
          buttonText: ctx.heroCta || 'Get instant access', buttonColor: '#c7f441', buttonTextColor: '#17191c',
          secondaryButtonText: 'Watch the demo', minHeight: 520, align: 'center', padding: 80,
        }),
        trustStats(ctx),
        blk('features', 'Why customers choose us', {
          eyebrow: 'Benefits', subtitle: 'Built for results, not for busywork', bgColor: '#ffffff', padding: 72, columns: 3, iconColor: ctx.color,
          featureItems: [
            { icon: '🚀', title: 'Live in a day', desc: 'No lengthy setup and no technical work — you are running by tomorrow.' },
            { icon: '🔒', title: 'Your data is safe', desc: 'Encrypted end to end with daily backups you never have to think about.' },
            { icon: '💬', title: 'Real human support', desc: 'Talk to someone who knows your account, not a scripted chatbot.' },
            { icon: '📊', title: 'Clear reporting', desc: 'See exactly what is working so you can spend where it pays off.' },
            { icon: '🔄', title: 'Works with your tools', desc: 'Connects to the software you already use in a couple of clicks.' },
            { icon: '💰', title: 'Fair, simple pricing', desc: 'One monthly price, no surprise fees, cancel whenever you want.' },
          ],
        }),
        blk('columns', 'Built for busy owners, not technicians', {
          subheading: 'You should be running your business, not wrestling with software. Everything here is designed to work on day one.',
          bgColor: '#f8fafc', padding: 72, imagePosition: 'right', buttonText: 'Get started', buttonColor: ctx.color, buttonTextColor: '#ffffff',
          listItems: ['Set up in under 10 minutes', 'Templates written for your industry', 'Free migration from your old tool', 'Cancel any time, keep your data'],
        }),
        testimonials(ctx),
        blk('pricing', 'Simple pricing that scales with you', {
          eyebrow: 'Pricing', subtitle: 'No contracts. No setup fees. Cancel anytime.', bgColor: '#ffffff', padding: 72,
          pricingPlans: [
            { name: 'Starter', price: '$49', period: '/mo', features: ['Up to 500 contacts', 'Email campaigns', 'Standard support'], buttonText: 'Start free trial' },
            { name: 'Growth', price: '$99', period: '/mo', highlighted: true, features: ['Up to 5,000 contacts', 'Email + SMS', 'Automations', 'Priority support'], buttonText: 'Start free trial' },
            { name: 'Scale', price: '$199', period: '/mo', features: ['Unlimited contacts', 'All channels', 'Dedicated manager'], buttonText: 'Talk to sales' },
          ],
        }),
        faq(ctx),
        blk('cta', 'Ready to get started?', {
          eyebrow: 'Get started', subheading: 'Join thousands already growing with us. 30-day money-back guarantee.',
          bgGradient: g, textColor: '#ffffff', buttonText: 'Get instant access', buttonColor: '#c7f441', buttonTextColor: '#17191c', padding: 76,
        }),
        footer(ctx),
      ];

    case 'checkout':
      return [
        blk('hero', 'Complete your order', {
          eyebrow: 'Secure checkout', subheading: 'You are one step away. Your details are encrypted and never shared.',
          bgGradient: g, textColor: '#ffffff', minHeight: 300, padding: 60, buttonText: '',
        }),
        blk('form', 'Your details', {
          bgColor: '#ffffff', padding: 60, buttonText: 'Complete secure order', buttonColor: ctx.color, buttonTextColor: '#ffffff',
          formFields: [
            { label: 'Full name', type: 'text', required: true },
            { label: 'Email address', type: 'email', required: true },
            { label: 'Phone number', type: 'tel', required: true },
            { label: 'Billing address', type: 'text', required: true },
          ],
          redirectUrl: '/thank-you',
        }),
        blk('features', 'Every order includes', {
          bgColor: '#f8fafc', padding: 56, columns: 3, iconColor: ctx.color,
          featureItems: [
            { icon: '🔒', title: 'Secure payment', desc: 'Bank-level encryption on every transaction.' },
            { icon: '↩️', title: '30-day guarantee', desc: 'Not happy? Get a full refund, no questions.' },
            { icon: '💬', title: 'Support included', desc: 'Real help from real people whenever you need it.' },
          ],
        }),
        footer(ctx),
      ];

    case 'upsell':
      return [
        blk('hero', 'Wait — add this to your order and save 40%', {
          eyebrow: 'One-time offer', subheading: 'This offer is only available on this page and will not be shown again.',
          bgGradient: g, textColor: '#ffffff', buttonText: 'Yes, add it to my order', buttonColor: '#c7f441', buttonTextColor: '#17191c',
          secondaryButtonText: 'No thanks, continue', minHeight: 460, padding: 72,
        }),
        blk('columns', 'Why customers add this', {
          subheading: 'The customers who get the best results are almost always the ones who added this at checkout.',
          bgColor: '#ffffff', padding: 68, imagePosition: 'left', buttonText: 'Add to my order', buttonColor: ctx.color, buttonTextColor: '#ffffff',
          listItems: ['Get results roughly twice as fast', 'Everything is done for you', 'Only available at this price today'],
        }),
        blk('cta', 'Add it for 40% off — today only', {
          subheading: 'One click adds it to the order you just placed.', bgGradient: g, textColor: '#ffffff',
          buttonText: 'Yes, add it to my order', buttonColor: '#c7f441', buttonTextColor: '#17191c', padding: 68,
        }),
        footer(ctx),
      ];

    case 'downsell':
      return [
        blk('hero', 'How about a smaller starting point?', {
          eyebrow: 'Special offer', subheading: 'Get the essentials now and upgrade whenever you are ready.',
          bgGradient: g, textColor: '#ffffff', buttonText: 'Add the starter option', buttonColor: '#c7f441', buttonTextColor: '#17191c',
          secondaryButtonText: 'No thanks', minHeight: 420, padding: 70,
        }),
        blk('columns', 'The essentials, at a lower price', {
          subheading: 'Same quality, smaller scope. It is the easiest way to get started without a bigger commitment.',
          bgColor: '#ffffff', padding: 64, imagePosition: 'right',
          listItems: ['Everything you need to begin', 'Upgrade any time at the difference in price', '30-day money-back guarantee'],
        }),
        footer(ctx),
      ];

    case 'thankyou':
      return [
        blk('hero', 'You are all set! 🎉', {
          eyebrow: 'Confirmed', subheading: `Check your inbox — a confirmation from ${ctx.name} is on its way. Want to skip the queue? Book a time below.`,
          bgGradient: g, textColor: '#ffffff', buttonText: 'Book a time now', buttonColor: '#c7f441', buttonTextColor: '#17191c', minHeight: 440, padding: 76,
        }),
        blk('features', 'What happens next', {
          subtitle: 'Here is exactly what to expect', bgColor: '#ffffff', padding: 64, columns: 3, iconColor: ctx.color,
          featureItems: [
            { icon: '📧', title: '1. Check your email', desc: 'Your confirmation and next steps arrive within a few minutes.' },
            { icon: '📞', title: '2. We reach out', desc: 'A real person contacts you within one business day.' },
            { icon: '🚀', title: '3. You get going', desc: 'We handle the setup so you can start seeing results.' },
          ],
        }),
        blk('cta', 'Know someone who needs this?', {
          subheading: 'Share it with them — they will thank you for it.', bgGradient: g, textColor: '#ffffff',
          buttonText: 'Share now', buttonColor: '#c7f441', buttonTextColor: '#17191c', padding: 64,
        }),
        footer(ctx),
      ];

    case 'webinar':
      return [
        navbar(ctx, 'Save my seat'),
        blk('hero', ctx.heroTitle || 'Free live training: the system that actually works', {
          eyebrow: ctx.heroEyebrow || 'Live webinar', subheading: 'Ninety minutes, no fluff — the exact process, walked through step by step. Seats are limited.',
          bgGradient: g, textColor: '#ffffff', buttonText: 'Save my free seat', buttonColor: '#c7f441', buttonTextColor: '#17191c',
          minHeight: 500, padding: 78,
        }),
        blk('countdown', 'Registration closes in', {
          subheading: 'Seats are limited and we do cap attendance.', bgColor: '#0f172a', textColor: '#ffffff', padding: 60, align: 'center',
        }),
        blk('features', 'What we will cover', {
          eyebrow: 'Agenda', subtitle: 'Three things you can use immediately', bgColor: '#ffffff', padding: 68, columns: 3, iconColor: ctx.color,
          featureItems: [
            { icon: '🧭', title: 'The framework', desc: 'The full process end to end, in plain language.' },
            { icon: '🛠️', title: 'Live walkthrough', desc: 'We build it in front of you so nothing is hand-waved.' },
            { icon: '❓', title: 'Live Q&A', desc: 'Bring your situation and get a straight answer on the call.' },
          ],
        }),
        blk('form', 'Save your seat — it is free', {
          bgColor: '#f8fafc', padding: 64, buttonText: 'Reserve my seat', buttonColor: ctx.color, buttonTextColor: '#ffffff',
          formFields: [
            { label: 'Full name', type: 'text', required: true },
            { label: 'Email address', type: 'email', required: true },
          ],
          redirectUrl: '/thank-you',
        }),
        footer(ctx),
      ];

    case 'survey':
      return [
        blk('hero', ctx.heroTitle || 'Answer 4 quick questions', {
          eyebrow: ctx.heroEyebrow || '30 seconds', subheading: 'So we can point you to the right thing instead of wasting your time.',
          bgGradient: g, textColor: '#ffffff', minHeight: 340, padding: 64, buttonText: '',
        }),
        blk('form', 'Tell us about your situation', {
          bgColor: '#ffffff', padding: 64, buttonText: 'See my recommendation', buttonColor: ctx.color, buttonTextColor: '#ffffff',
          formFields: [
            { label: 'What is your biggest challenge right now?', type: 'text', required: true },
            { label: 'What have you already tried?', type: 'text', required: false },
            { label: 'What would success look like in 90 days?', type: 'text', required: true },
            { label: 'Best email to send your result to', type: 'email', required: true },
          ],
          redirectUrl: '/thank-you',
        }),
        footer(ctx),
      ];

    case 'landing':
    case 'custom':
    default:
      return [
        navbar(ctx),
        blk('hero', ctx.heroTitle || `${ctx.name} — ${tag}`, {
          eyebrow: ctx.heroEyebrow || 'Welcome', subheading: 'Everything you need, without the complexity you do not.',
          bgGradient: g, textColor: '#ffffff', buttonText: ctx.heroCta || 'Get started', buttonColor: '#c7f441', buttonTextColor: '#17191c',
          secondaryButtonText: 'Learn more', minHeight: 480, padding: 76,
        }),
        blk('features', 'How we help', {
          eyebrow: 'What we do', subtitle: 'Three ways we make your life easier', bgColor: '#f8fafc', padding: 68, columns: 3, iconColor: ctx.color,
          featureItems: [
            { icon: '✨', title: 'Done properly', desc: 'Careful work from people who take the details seriously.' },
            { icon: '⚡', title: 'Done quickly', desc: 'Clear timelines that we actually hold ourselves to.' },
            { icon: '🤝', title: 'Done with you', desc: 'You always know where things stand — no chasing required.' },
          ],
        }),
        testimonials(ctx),
        blk('cta', 'Let us get started', {
          eyebrow: 'Next step', subheading: 'The first conversation is free and genuinely useful.',
          bgGradient: g, textColor: '#ffffff', buttonText: 'Book a call', buttonColor: '#c7f441', buttonTextColor: '#17191c', padding: 72,
        }),
        footer(ctx),
      ];
  }
}

/** Build a complete, populated funnel page (blocks included). */
export function buildFunnelPage(name: string, type: FunnelStep['type'], ctx: BrandContext): FunnelStep {
  return {
    id: `step-${uid()}`,
    name,
    type,
    slug: slug(name),
    blocks: buildFunnelPageBlocks(type, ctx),
    visitors: 0,
    conversions: 0,
  };
}

/* ── Website templates (ids match the New Website modal) ── */

interface SitePageSpec { name: string; type: FunnelStep['type']; blocks: FunnelBlock[]; }

function aboutPage(ctx: BrandContext): SitePageSpec {
  return {
    name: 'About', type: 'custom',
    blocks: [
      navbar(ctx),
      blk('hero', `About ${ctx.name}`, {
        eyebrow: 'Our story', subheading: ctx.tagline || 'Why we do this, and who we do it for.',
        bgGradient: heroGrad(ctx.color), textColor: '#ffffff', minHeight: 340, padding: 64, buttonText: '',
      }),
      blk('columns', 'What we believe', {
        subheading: `${ctx.name} started with a simple frustration: good work should not be this hard to buy. So we built the thing we wished existed — clear pricing, straight answers and people who pick up the phone.`,
        bgColor: '#ffffff', padding: 68, imagePosition: 'right',
        listItems: ['Straight answers, always', 'Fair, published pricing', 'We finish what we start', 'You always know where things stand'],
      }),
      trustStats(ctx),
      blk('cta', 'Come work with us', {
        subheading: 'The first conversation is free.', bgGradient: heroGrad(ctx.color), textColor: '#ffffff',
        buttonText: 'Get in touch', buttonColor: '#c7f441', buttonTextColor: '#17191c', padding: 68,
      }),
      footer(ctx),
    ],
  };
}

function contactPage(ctx: BrandContext): SitePageSpec {
  return {
    name: 'Contact', type: 'custom',
    blocks: [
      navbar(ctx),
      blk('hero', 'Get in touch', {
        eyebrow: 'Contact', subheading: 'Send a message and we will come back to you within one business day.',
        bgGradient: heroGrad(ctx.color), textColor: '#ffffff', minHeight: 320, padding: 60, buttonText: '',
      }),
      blk('form', 'Send us a message', {
        bgColor: '#ffffff', padding: 64, buttonText: 'Send message', buttonColor: ctx.color, buttonTextColor: '#ffffff',
        formFields: [
          { label: 'Full name', type: 'text', required: true },
          { label: 'Email address', type: 'email', required: true },
          { label: 'Phone number', type: 'tel', required: false },
          { label: 'How can we help?', type: 'textarea', required: true },
        ],
      }),
      footer(ctx),
    ],
  };
}

/** Real multi-page content for each starter website template. */
export function buildWebsiteTemplatePages(templateId: string, ctx: BrandContext): FunnelStep[] {
  const g = heroGrad(ctx.color);
  const tag = ctx.tagline || 'Doing great work for people who value it';
  let home: SitePageSpec;

  switch (templateId) {
    case 'saas':
      home = { name: 'Home', type: 'landing', blocks: [
        navbar(ctx, 'Start free'),
        blk('hero', 'The smarter way to run your business', {
          eyebrow: 'New', subheading: `${ctx.name} replaces the spreadsheets, sticky notes and half-finished tools with one place that just works.`,
          bgGradient: g, textColor: '#ffffff', buttonText: 'Start free — no card needed', buttonColor: '#c7f441', buttonTextColor: '#17191c',
          secondaryButtonText: 'Watch 2-min demo', minHeight: 540, padding: 84,
        }),
        trustStats(ctx),
        blk('features', 'One platform, every tool you need', {
          eyebrow: 'Features', subtitle: 'Stop paying for eight tools that do not talk to each other', bgColor: '#ffffff', padding: 76, columns: 3, iconColor: ctx.color,
          featureItems: [
            { icon: '🤖', title: 'Automations', desc: 'Let the repetitive work run itself while you focus on customers.' },
            { icon: '📊', title: 'Live dashboards', desc: 'Know what is working today, not at the end of the quarter.' },
            { icon: '🔗', title: 'Integrations', desc: 'Connects to the tools your team already lives in.' },
            { icon: '📱', title: 'Works anywhere', desc: 'Full functionality on your phone, tablet and desktop.' },
            { icon: '🔒', title: 'Enterprise security', desc: 'SOC-2 aligned practices with encryption at rest and in transit.' },
            { icon: '💬', title: 'Support that answers', desc: 'Median first response under two hours, from real engineers.' },
          ],
        }),
        blk('pricing', 'Pricing that makes sense', {
          eyebrow: 'Pricing', subtitle: 'Start free. Upgrade only when it is paying for itself.', bgColor: '#f8fafc', padding: 76,
          pricingPlans: [
            { name: 'Free', price: '$0', period: '/mo', features: ['1 user', '100 records', 'Community support'], buttonText: 'Start free' },
            { name: 'Pro', price: '$79', period: '/mo', highlighted: true, features: ['10 users', 'Unlimited records', 'Automations', 'Priority support'], buttonText: 'Start free trial' },
            { name: 'Business', price: '$249', period: '/mo', features: ['Unlimited users', 'Advanced reporting', 'Dedicated manager'], buttonText: 'Talk to sales' },
          ],
        }),
        testimonials(ctx),
        faq(ctx),
        blk('cta', 'Start free today', {
          eyebrow: 'Get started', subheading: 'No credit card. Cancel any time. Import your data in minutes.',
          bgGradient: g, textColor: '#ffffff', buttonText: 'Create free account', buttonColor: '#c7f441', buttonTextColor: '#17191c', padding: 78,
        }),
        footer(ctx),
      ]};
      break;

    case 'agency':
      home = { name: 'Home', type: 'landing', blocks: [
        navbar(ctx, 'Start a project'),
        blk('hero', 'We build brands people remember', {
          eyebrow: 'Digital agency', subheading: tag, bgGradient: 'linear-gradient(135deg,#0f172a,#1e293b)', textColor: '#ffffff',
          buttonText: 'Start a project', buttonColor: '#c7f441', buttonTextColor: '#17191c', secondaryButtonText: 'See our work', minHeight: 540, padding: 84,
        }),
        blk('features', 'What we do', {
          eyebrow: 'Services', subtitle: 'Full-service, senior-led, no hand-offs to juniors', bgColor: '#ffffff', padding: 76, columns: 3, iconColor: ctx.color,
          featureItems: [
            { icon: '🎨', title: 'Brand identity', desc: 'Logos, systems and guidelines that hold up everywhere.' },
            { icon: '💻', title: 'Web design', desc: 'Fast, beautiful sites built to convert, not just to look nice.' },
            { icon: '📈', title: 'Performance marketing', desc: 'Paid media managed against revenue, not vanity metrics.' },
            { icon: '🎬', title: 'Content & video', desc: 'Story-first production that actually gets watched.' },
            { icon: '🔍', title: 'SEO', desc: 'Technical and editorial work that compounds month over month.' },
            { icon: '📊', title: 'Analytics', desc: 'Tracking you can trust, reported in plain English.' },
          ],
        }),
        blk('gallery', 'Selected work', {
          eyebrow: 'Portfolio', subtitle: 'A few recent projects', bgColor: '#0f172a', textColor: '#ffffff', padding: 72, columns: 3,
          galleryImages: ['#6366f1', '#8b5cf6', '#ec4899', '#f59e0b', '#10b981', '#0ea5e9'],
        }),
        testimonials(ctx),
        blk('cta', 'Let us build something good', {
          eyebrow: 'Next step', subheading: 'Tell us what you are working on. We will tell you honestly if we can help.',
          bgGradient: g, textColor: '#ffffff', buttonText: 'Start a project', buttonColor: '#c7f441', buttonTextColor: '#17191c', padding: 78,
        }),
        footer(ctx),
      ]};
      break;

    case 'ecommerce':
      home = { name: 'Home', type: 'landing', blocks: [
        navbar(ctx, 'Shop now'),
        blk('hero', 'Products worth keeping', {
          eyebrow: 'Free shipping over $50', subheading: tag, bgGradient: g, textColor: '#ffffff',
          buttonText: 'Shop the collection', buttonColor: '#c7f441', buttonTextColor: '#17191c', secondaryButtonText: 'Best sellers', minHeight: 520, padding: 80,
        }),
        blk('gallery', 'Shop the collection', {
          eyebrow: 'New in', subtitle: 'Fresh arrivals this week', bgColor: '#ffffff', padding: 72, columns: 3,
          galleryImages: ['#f59e0b', '#ec4899', '#6366f1', '#10b981', '#0ea5e9', '#8b5cf6'],
        }),
        blk('features', 'Why shop with us', {
          bgColor: '#f8fafc', padding: 68, columns: 3, iconColor: ctx.color,
          featureItems: [
            { icon: '🚚', title: 'Free shipping', desc: 'On every order over $50, dispatched same day.' },
            { icon: '↩️', title: 'Easy returns', desc: '30 days, prepaid label, no awkward questions.' },
            { icon: '🔒', title: 'Secure checkout', desc: 'Encrypted payments through trusted providers.' },
          ],
        }),
        testimonials(ctx),
        blk('cta', 'Get 10% off your first order', {
          subheading: 'Join the list for early access to new drops.', bgGradient: g, textColor: '#ffffff',
          buttonText: 'Claim 10% off', buttonColor: '#c7f441', buttonTextColor: '#17191c', padding: 72,
        }),
        footer(ctx),
      ]};
      break;

    case 'restaurant':
      home = { name: 'Home', type: 'landing', blocks: [
        navbar(ctx, 'Reserve a table'),
        blk('hero', 'Honest food, done properly', {
          eyebrow: 'Open daily 11am–10pm', subheading: tag, bgGradient: 'linear-gradient(135deg,#78350f,#1c0a00)', textColor: '#ffffff',
          buttonText: 'Reserve a table', buttonColor: '#c7f441', buttonTextColor: '#17191c', secondaryButtonText: 'View the menu', minHeight: 540, padding: 82,
        }),
        blk('features', 'Why people come back', {
          eyebrow: 'The kitchen', bgColor: '#fffbf5', padding: 72, columns: 3, iconColor: ctx.color,
          featureItems: [
            { icon: '🌿', title: 'Fresh every day', desc: 'Produce delivered each morning from local growers.' },
            { icon: '👨‍🍳', title: 'A serious kitchen', desc: 'A team that has cooked in rooms you have heard of.' },
            { icon: '🍷', title: 'A proper wine list', desc: 'Well chosen, fairly priced, happily explained.' },
          ],
        }),
        blk('gallery', 'From the kitchen', {
          bgColor: '#ffffff', padding: 68, columns: 3,
          galleryImages: ['#b45309', '#92400e', '#d97706', '#78350f', '#a16207', '#713f12'],
        }),
        testimonials(ctx),
        blk('form', 'Reserve your table', {
          bgColor: '#fffbf5', padding: 68, buttonText: 'Request reservation', buttonColor: ctx.color, buttonTextColor: '#ffffff',
          formFields: [
            { label: 'Name', type: 'text', required: true },
            { label: 'Email address', type: 'email', required: true },
            { label: 'Date & time', type: 'text', required: true },
            { label: 'Party size', type: 'number', required: true },
          ],
        }),
        footer(ctx),
      ]};
      break;

    case 'portfolio':
      home = { name: 'Home', type: 'landing', blocks: [
        navbar(ctx, 'Hire me'),
        blk('hero', 'I design things people actually enjoy using', {
          eyebrow: 'Portfolio', subheading: tag, bgGradient: 'linear-gradient(135deg,#f59e0b,#ec4899)', textColor: '#ffffff',
          buttonText: 'View my work', buttonColor: '#17191c', buttonTextColor: '#ffffff', secondaryButtonText: 'Get in touch', minHeight: 540, padding: 84,
        }),
        blk('gallery', 'Selected work', {
          eyebrow: 'Projects', subtitle: 'A few things I am proud of', bgColor: '#ffffff', padding: 72, columns: 3,
          galleryImages: ['#6366f1', '#f59e0b', '#ec4899', '#0891b2', '#22c55e', '#f97316'],
        }),
        blk('features', 'What I do', {
          bgColor: '#f8fafc', padding: 68, columns: 3, iconColor: ctx.color,
          featureItems: [
            { icon: '🎨', title: 'Interface design', desc: 'Clean, considered screens that respect the user.' },
            { icon: '🧠', title: 'Research', desc: 'Decisions grounded in what people actually do.' },
            { icon: '💻', title: 'Front-end build', desc: 'I ship my own designs, so nothing gets lost.' },
          ],
        }),
        testimonials(ctx),
        blk('cta', 'Have a project in mind?', {
          subheading: 'I take on a small number of projects at a time.', bgGradient: g, textColor: '#ffffff',
          buttonText: 'Start a conversation', buttonColor: '#c7f441', buttonTextColor: '#17191c', padding: 72,
        }),
        footer(ctx),
      ]};
      break;

    case 'blog':
      home = { name: 'Home', type: 'landing', blocks: [
        navbar(ctx, 'Subscribe'),
        blk('hero', 'Writing worth your time', {
          eyebrow: 'The blog', subheading: 'Practical essays on the work, published every week. No filler, no clickbait.',
          bgGradient: 'linear-gradient(135deg,#0891b2,#06b6d4)', textColor: '#ffffff',
          buttonText: 'Start reading', buttonColor: '#c7f441', buttonTextColor: '#17191c', secondaryButtonText: 'Subscribe free', minHeight: 480, padding: 78,
        }),
        blk('features', 'What we write about', {
          eyebrow: 'Topics', bgColor: '#ffffff', padding: 68, columns: 4, iconColor: ctx.color,
          featureItems: [
            { icon: '💻', title: 'Technology', desc: 'What is actually changing, minus the hype cycle.' },
            { icon: '🎨', title: 'Design', desc: 'Craft, critique and the occasional strong opinion.' },
            { icon: '📈', title: 'Business', desc: 'Growth strategies with the numbers shown.' },
            { icon: '🧠', title: 'Productivity', desc: 'Systems that survive contact with a real week.' },
          ],
        }),
        blk('form', 'Get new posts by email', {
          bgColor: '#f0f9ff', padding: 64, buttonText: 'Subscribe free', buttonColor: ctx.color, buttonTextColor: '#ffffff',
          formFields: [{ label: 'Email address', type: 'email', required: true }],
        }),
        footer(ctx),
      ]};
      break;

    case 'consulting':
      home = { name: 'Home', type: 'landing', blocks: [
        navbar(ctx, 'Book a consult'),
        blk('hero', 'Expert guidance, without the jargon', {
          eyebrow: 'Consulting', subheading: tag, bgGradient: 'linear-gradient(135deg,#1e3a5f,#0f172a)', textColor: '#ffffff',
          buttonText: 'Book a free consult', buttonColor: '#c7f441', buttonTextColor: '#17191c', secondaryButtonText: 'How we work', minHeight: 520, padding: 82,
        }),
        trustStats(ctx),
        blk('features', 'How we help', {
          eyebrow: 'Services', bgColor: '#ffffff', padding: 72, columns: 3, iconColor: ctx.color,
          featureItems: [
            { icon: '🔍', title: 'Diagnose', desc: 'We find the real constraint, not the obvious symptom.' },
            { icon: '🗺️', title: 'Plan', desc: 'A sequenced plan with owners, dates and costs.' },
            { icon: '🤝', title: 'Implement', desc: 'We stay through delivery — advice alone changes nothing.' },
          ],
        }),
        testimonials(ctx),
        faq(ctx),
        blk('cta', 'Book your free consultation', {
          subheading: 'Thirty minutes, genuinely useful, no obligation.', bgGradient: g, textColor: '#ffffff',
          buttonText: 'Book a time', buttonColor: '#c7f441', buttonTextColor: '#17191c', padding: 74,
        }),
        footer(ctx),
      ]};
      break;

    case 'nonprofit':
      home = { name: 'Home', type: 'landing', blocks: [
        navbar(ctx, 'Donate'),
        blk('hero', 'Small actions, real change', {
          eyebrow: 'Our mission', subheading: tag, bgGradient: 'linear-gradient(135deg,#dc2626,#7f1d1d)', textColor: '#ffffff',
          buttonText: 'Donate now', buttonColor: '#c7f441', buttonTextColor: '#17191c', secondaryButtonText: 'Our impact', minHeight: 520, padding: 82,
        }),
        blk('stats', '', {
          bgColor: '#0f172a', textColor: '#ffffff', padding: 60,
          statItems: [
            { value: '48,000', label: 'People reached', icon: '❤️' },
            { value: '92¢', label: 'Of each $1 to programs', icon: '💰' },
            { value: '31', label: 'Communities served', icon: '🌍' },
            { value: '1,200', label: 'Active volunteers', icon: '🤝' },
          ],
        }),
        blk('features', 'Where your money goes', {
          eyebrow: 'Programs', bgColor: '#ffffff', padding: 72, columns: 3, iconColor: ctx.color,
          featureItems: [
            { icon: '🍲', title: 'Food security', desc: 'Weekly meals for families who need them most.' },
            { icon: '📚', title: 'Education', desc: 'Tutoring and supplies for students falling behind.' },
            { icon: '🏠', title: 'Shelter', desc: 'Emergency housing and a route back to stability.' },
          ],
        }),
        testimonials(ctx),
        blk('cta', 'Give what you can', {
          subheading: 'Every contribution is spent where it does the most good.', bgGradient: g, textColor: '#ffffff',
          buttonText: 'Donate now', buttonColor: '#c7f441', buttonTextColor: '#17191c', padding: 74,
        }),
        footer(ctx),
      ]};
      break;

    case 'blank':
      home = { name: 'Home', type: 'landing', blocks: [
        navbar(ctx),
        blk('hero', ctx.name, {
          subheading: tag, bgGradient: g, textColor: '#ffffff',
          buttonText: 'Get started', buttonColor: '#c7f441', buttonTextColor: '#17191c', minHeight: 440, padding: 72,
        }),
        blk('footer', '', { bgColor: '#17191c', textColor: '#94a3b8', navLogo: ctx.name, padding: 48, footerColumns: [], footerCopyright: `© ${new Date().getFullYear()} ${ctx.name}.` }),
      ]};
      break;

    case 'business':
    default:
      home = { name: 'Home', type: 'landing', blocks: [
        navbar(ctx, 'Get a quote'),
        blk('hero', `${ctx.name}`, {
          eyebrow: 'Welcome', subheading: tag, bgGradient: g, textColor: '#ffffff',
          buttonText: 'Get a free quote', buttonColor: '#c7f441', buttonTextColor: '#17191c', secondaryButtonText: 'Our services', minHeight: 520, padding: 80,
        }),
        trustStats(ctx),
        blk('features', 'What we do', {
          eyebrow: 'Services', subtitle: 'Everything you need, under one roof', bgColor: '#ffffff', padding: 72, columns: 3, iconColor: ctx.color,
          featureItems: [
            { icon: '✨', title: 'Consultation', desc: 'We start by understanding what you actually need.' },
            { icon: '🛠️', title: 'Delivery', desc: 'Careful work, on the timeline we agreed together.' },
            { icon: '🤝', title: 'Aftercare', desc: 'We stay reachable long after the invoice is paid.' },
          ],
        }),
        blk('columns', 'Why choose us', {
          subheading: `${ctx.name} has built its reputation on doing what we say we will do. No surprises, no disappearing acts.`,
          bgColor: '#f8fafc', padding: 72, imagePosition: 'right', buttonText: 'Get in touch', buttonColor: ctx.color, buttonTextColor: '#ffffff',
          listItems: ['Clear, fixed pricing up front', 'Fully licensed and insured', 'Work guaranteed in writing', 'Same-day replies during business hours'],
        }),
        testimonials(ctx),
        faq(ctx),
        blk('cta', 'Get your free quote', {
          eyebrow: 'Get started', subheading: 'No obligation, and genuinely useful either way.',
          bgGradient: g, textColor: '#ffffff', buttonText: 'Request a quote', buttonColor: '#c7f441', buttonTextColor: '#17191c', padding: 76,
        }),
        footer(ctx),
      ]};
  }

  const pages: SitePageSpec[] = templateId === 'blank'
    ? [home]
    : [home, aboutPage(ctx), contactPage(ctx)];

  return pages.map(p => ({
    id: `wp-${uid()}`,
    name: p.name,
    type: p.type,
    slug: slug(p.name),
    blocks: p.blocks,
    visitors: 0,
    conversions: 0,
  }));
}

/* ── Template catalog (browsable library) ── */

export type TemplateCategory =
  | 'Lead Capture' | 'Sales Pages' | 'Landing Pages' | 'Event Pages'
  | 'Thank You Pages' | 'Full Websites' | 'Seasonal';

export interface TemplateMeta {
  id: string;
  name: string;
  category: TemplateCategory;
  /** Industry / use-case shown on the card. */
  industry: string;
  /** 1–5 popularity, drives the star row on the card. */
  popularity: number;
  kind: 'funnel' | 'website';
  /** Funnel templates: the pages to generate, in order. */
  steps?: { name: string; type: FunnelStep['type'] }[];
  /** Website templates: which starter layout to build. */
  websiteTemplate?: string;
  /** Optional accent override so cards in a category don't all look alike. */
  accent?: string;
  description: string;
}

const optinFlow = (l = 'Opt-in Page'): { name: string; type: FunnelStep['type'] }[] =>
  [{ name: l, type: 'optin' }, { name: 'Thank You', type: 'thankyou' }];
const salesFlow = (): { name: string; type: FunnelStep['type'] }[] =>
  [{ name: 'Sales Page', type: 'sales' }, { name: 'Order Form', type: 'checkout' }, { name: 'Upsell', type: 'upsell' }, { name: 'Thank You', type: 'thankyou' }];
const webinarFlow = (): { name: string; type: FunnelStep['type'] }[] =>
  [{ name: 'Registration', type: 'webinar' }, { name: 'Confirmation', type: 'thankyou' }, { name: 'Replay', type: 'landing' }];
const eventFlow = (): { name: string; type: FunnelStep['type'] }[] =>
  [{ name: 'Event Details', type: 'landing' }, { name: 'Register', type: 'optin' }, { name: 'Confirmed', type: 'thankyou' }];

export const TEMPLATE_CATALOG: TemplateMeta[] = [
  /* Lead Capture (10) */
  { id: 'lc-ebook', name: 'Ebook Download', category: 'Lead Capture', industry: 'Coaching', popularity: 5, kind: 'funnel', steps: optinFlow('Ebook Opt-in'), description: 'Trade a free ebook for email addresses.' },
  { id: 'lc-checklist', name: 'Free Checklist', category: 'Lead Capture', industry: 'Professional Services', popularity: 5, kind: 'funnel', steps: optinFlow('Checklist Opt-in'), accent: '#0ea5e9', description: 'A one-page checklist people actually want.' },
  { id: 'lc-quote', name: 'Free Quote Request', category: 'Lead Capture', industry: 'Home Services', popularity: 5, kind: 'funnel', steps: optinFlow('Get a Quote'), accent: '#f59e0b', description: 'Capture job details and quote fast.' },
  { id: 'lc-consult', name: 'Free Consultation', category: 'Lead Capture', industry: 'Consulting', popularity: 4, kind: 'funnel', steps: optinFlow('Book a Consult'), accent: '#8b5cf6', description: 'Book discovery calls straight from the page.' },
  { id: 'lc-newsletter', name: 'Newsletter Signup', category: 'Lead Capture', industry: 'Media', popularity: 4, kind: 'funnel', steps: optinFlow('Subscribe'), accent: '#06b6d4', description: 'Grow a list with a clean single-focus page.' },
  { id: 'lc-trial', name: 'Free Trial Signup', category: 'Lead Capture', industry: 'SaaS', popularity: 5, kind: 'funnel', steps: optinFlow('Start Free Trial'), accent: '#6366f1', description: 'Low-friction trial capture for software.' },
  { id: 'lc-quiz', name: 'Quiz Funnel', category: 'Lead Capture', industry: 'E-commerce', popularity: 4, kind: 'funnel', steps: [{ name: 'Quiz', type: 'survey' }, { name: 'Your Result', type: 'landing' }, { name: 'Thank You', type: 'thankyou' }], accent: '#ec4899', description: 'Qualify leads with a short quiz.' },
  { id: 'lc-audit', name: 'Free Audit Offer', category: 'Lead Capture', industry: 'Marketing Agency', popularity: 4, kind: 'funnel', steps: optinFlow('Request Audit'), accent: '#14b8a6', description: 'Offer a free audit to start the conversation.' },
  { id: 'lc-waitlist', name: 'Waitlist Page', category: 'Lead Capture', industry: 'Startup', popularity: 3, kind: 'funnel', steps: optinFlow('Join Waitlist'), accent: '#f97316', description: 'Build anticipation before launch.' },
  { id: 'lc-valuation', name: 'Home Valuation', category: 'Lead Capture', industry: 'Real Estate', popularity: 5, kind: 'funnel', steps: optinFlow('Free Valuation'), accent: '#1e3a5f', description: 'The classic real-estate lead magnet.' },

  /* Sales Pages (10) */
  { id: 'sp-classic', name: 'Classic Sales Letter', category: 'Sales Pages', industry: 'Info Products', popularity: 5, kind: 'funnel', steps: salesFlow(), description: 'Long-form sales page with order bump.' },
  { id: 'sp-vsl', name: 'Video Sales Letter', category: 'Sales Pages', industry: 'Coaching', popularity: 5, kind: 'funnel', steps: salesFlow(), accent: '#ef4444', description: 'Video-first page for higher-ticket offers.' },
  { id: 'sp-saas', name: 'SaaS Product Page', category: 'Sales Pages', industry: 'SaaS', popularity: 5, kind: 'funnel', steps: [{ name: 'Product', type: 'sales' }, { name: 'Checkout', type: 'checkout' }, { name: 'Welcome', type: 'thankyou' }], accent: '#6366f1', description: 'Feature-led page with pricing tiers.' },
  { id: 'sp-service', name: 'Service Sales Page', category: 'Sales Pages', industry: 'Professional Services', popularity: 4, kind: 'funnel', steps: salesFlow(), accent: '#0891b2', description: 'Sell a done-for-you service.' },
  { id: 'sp-course', name: 'Online Course', category: 'Sales Pages', industry: 'Education', popularity: 5, kind: 'funnel', steps: salesFlow(), accent: '#8b5cf6', description: 'Curriculum, proof and enrolment in one page.' },
  { id: 'sp-membership', name: 'Membership Offer', category: 'Sales Pages', industry: 'Community', popularity: 4, kind: 'funnel', steps: [{ name: 'Sales Page', type: 'sales' }, { name: 'Checkout', type: 'checkout' }, { name: 'Members Area', type: 'landing' }], accent: '#22c55e', description: 'Recurring membership with clear benefits.' },
  { id: 'sp-product', name: 'Physical Product', category: 'Sales Pages', industry: 'E-commerce', popularity: 4, kind: 'funnel', steps: salesFlow(), accent: '#f59e0b', description: 'Product page with gallery and reviews.' },
  { id: 'sp-highticket', name: 'High-Ticket Application', category: 'Sales Pages', industry: 'Consulting', popularity: 4, kind: 'funnel', steps: [{ name: 'Offer', type: 'sales' }, { name: 'Application', type: 'survey' }, { name: 'Booked', type: 'thankyou' }], accent: '#1e293b', description: 'Qualify before you sell.' },
  { id: 'sp-bundle', name: 'Bundle Deal', category: 'Sales Pages', industry: 'E-commerce', popularity: 3, kind: 'funnel', steps: salesFlow(), accent: '#ec4899', description: 'Stack the value and show the saving.' },
  { id: 'sp-freeplus', name: 'Free + Shipping', category: 'Sales Pages', industry: 'E-commerce', popularity: 3, kind: 'funnel', steps: salesFlow(), accent: '#64748b', description: 'Tiny commitment now, upsell after.' },

  /* Landing Pages (8) */
  { id: 'lp-simple', name: 'Simple Landing', category: 'Landing Pages', industry: 'Any', popularity: 5, kind: 'funnel', steps: [{ name: 'Landing', type: 'landing' }], description: 'Clean single page with one clear action.' },
  { id: 'lp-app', name: 'App Download', category: 'Landing Pages', industry: 'Mobile', popularity: 4, kind: 'funnel', steps: [{ name: 'Landing', type: 'landing' }], accent: '#0ea5e9', description: 'Drive installs with screenshots and proof.' },
  { id: 'lp-local', name: 'Local Business', category: 'Landing Pages', industry: 'Local Services', popularity: 5, kind: 'funnel', steps: [{ name: 'Landing', type: 'landing' }, { name: 'Thank You', type: 'thankyou' }], accent: '#f59e0b', description: 'Hours, services, reviews and a call button.' },
  { id: 'lp-comingsoon', name: 'Coming Soon', category: 'Landing Pages', industry: 'Any', popularity: 3, kind: 'funnel', steps: [{ name: 'Coming Soon', type: 'optin' }], accent: '#8b5cf6', description: 'Hold the page and collect emails.' },
  { id: 'lp-book', name: 'Book a Demo', category: 'Landing Pages', industry: 'B2B', popularity: 5, kind: 'funnel', steps: [{ name: 'Demo', type: 'landing' }, { name: 'Booked', type: 'thankyou' }], accent: '#6366f1', description: 'B2B demo booking with trust signals.' },
  { id: 'lp-portfolio', name: 'Portfolio Landing', category: 'Landing Pages', industry: 'Creative', popularity: 4, kind: 'funnel', steps: [{ name: 'Portfolio', type: 'landing' }], accent: '#ec4899', description: 'Show the work, then the contact form.' },
  { id: 'lp-charity', name: 'Donation Page', category: 'Landing Pages', industry: 'Nonprofit', popularity: 3, kind: 'funnel', steps: [{ name: 'Donate', type: 'landing' }, { name: 'Thank You', type: 'thankyou' }], accent: '#dc2626', description: 'Mission, impact numbers and a give button.' },
  { id: 'lp-restaurant', name: 'Restaurant Landing', category: 'Landing Pages', industry: 'Restaurant', popularity: 4, kind: 'funnel', steps: [{ name: 'Landing', type: 'landing' }], accent: '#b45309', description: 'Menu highlights and table reservations.' },

  /* Event Pages (5) */
  { id: 'ev-webinar', name: 'Webinar Registration', category: 'Event Pages', industry: 'Any', popularity: 5, kind: 'funnel', steps: webinarFlow(), accent: '#6366f1', description: 'Register, confirm and replay.' },
  { id: 'ev-conference', name: 'Conference', category: 'Event Pages', industry: 'Events', popularity: 4, kind: 'funnel', steps: eventFlow(), accent: '#0891b2', description: 'Agenda, speakers and ticket signup.' },
  { id: 'ev-workshop', name: 'Workshop', category: 'Event Pages', industry: 'Education', popularity: 4, kind: 'funnel', steps: eventFlow(), accent: '#8b5cf6', description: 'Small-group workshop registration.' },
  { id: 'ev-launch', name: 'Product Launch', category: 'Event Pages', industry: 'E-commerce', popularity: 4, kind: 'funnel', steps: [{ name: 'Teaser', type: 'landing' }, { name: 'Launch Day', type: 'sales' }, { name: 'Order', type: 'checkout' }, { name: 'Thank You', type: 'thankyou' }], accent: '#f59e0b', description: 'Build anticipation then open the cart.' },
  { id: 'ev-openhouse', name: 'Open House', category: 'Event Pages', industry: 'Real Estate', popularity: 3, kind: 'funnel', steps: eventFlow(), accent: '#1e3a5f', description: 'Property viewing signups with the details.' },

  /* Thank You Pages (5) */
  { id: 'ty-download', name: 'Download Delivery', category: 'Thank You Pages', industry: 'Any', popularity: 5, kind: 'funnel', steps: [{ name: 'Thank You', type: 'thankyou' }], description: 'Deliver the file and set the next step.' },
  { id: 'ty-booking', name: 'Booking Confirmed', category: 'Thank You Pages', industry: 'Services', popularity: 4, kind: 'funnel', steps: [{ name: 'Confirmed', type: 'thankyou' }], accent: '#22c55e', description: 'Confirm the appointment and add to calendar.' },
  { id: 'ty-order', name: 'Order Confirmation', category: 'Thank You Pages', industry: 'E-commerce', popularity: 4, kind: 'funnel', steps: [{ name: 'Order Confirmed', type: 'thankyou' }], accent: '#f59e0b', description: 'Receipt, delivery info and a referral ask.' },
  { id: 'ty-upsell', name: 'Thank You + Upsell', category: 'Thank You Pages', industry: 'Any', popularity: 4, kind: 'funnel', steps: [{ name: 'Thank You', type: 'thankyou' }, { name: 'Special Offer', type: 'upsell' }], accent: '#ec4899', description: 'Convert again while attention is high.' },
  { id: 'ty-survey', name: 'Thank You + Survey', category: 'Thank You Pages', industry: 'Any', popularity: 3, kind: 'funnel', steps: [{ name: 'Thank You', type: 'thankyou' }, { name: 'Quick Survey', type: 'survey' }], accent: '#0ea5e9', description: 'Learn why they bought, right after they buy.' },

  /* Full Websites (10) */
  { id: 'ws-business', name: 'Business Website', category: 'Full Websites', industry: 'Professional Services', popularity: 5, kind: 'website', websiteTemplate: 'business', description: 'Home, About and Contact — the classic.' },
  { id: 'ws-saas', name: 'SaaS / Startup', category: 'Full Websites', industry: 'SaaS', popularity: 5, kind: 'website', websiteTemplate: 'saas', accent: '#6366f1', description: 'Feature grid, pricing tiers and FAQ.' },
  { id: 'ws-agency', name: 'Digital Agency', category: 'Full Websites', industry: 'Marketing Agency', popularity: 5, kind: 'website', websiteTemplate: 'agency', accent: '#0f172a', description: 'Bold dark theme with a work gallery.' },
  { id: 'ws-portfolio', name: 'Creative Portfolio', category: 'Full Websites', industry: 'Creative', popularity: 4, kind: 'website', websiteTemplate: 'portfolio', accent: '#f59e0b', description: 'Gallery-led site for designers.' },
  { id: 'ws-ecom', name: 'Online Store', category: 'Full Websites', industry: 'E-commerce', popularity: 4, kind: 'website', websiteTemplate: 'ecommerce', accent: '#ec4899', description: 'Product grid with shipping and returns.' },
  { id: 'ws-restaurant', name: 'Restaurant / Cafe', category: 'Full Websites', industry: 'Restaurant', popularity: 4, kind: 'website', websiteTemplate: 'restaurant', accent: '#b45309', description: 'Menu, gallery and reservations.' },
  { id: 'ws-blog', name: 'Blog / Magazine', category: 'Full Websites', industry: 'Media', popularity: 3, kind: 'website', websiteTemplate: 'blog', accent: '#0891b2', description: 'Editorial layout with a subscribe block.' },
  { id: 'ws-consult', name: 'Consulting Firm', category: 'Full Websites', industry: 'Consulting', popularity: 4, kind: 'website', websiteTemplate: 'consulting', accent: '#1e3a5f', description: 'Authority-first with a booking CTA.' },
  { id: 'ws-nonprofit', name: 'Nonprofit', category: 'Full Websites', industry: 'Nonprofit', popularity: 3, kind: 'website', websiteTemplate: 'nonprofit', accent: '#dc2626', description: 'Mission, impact stats and donations.' },
  { id: 'ws-blank', name: 'Blank Canvas', category: 'Full Websites', industry: 'Any', popularity: 2, kind: 'website', websiteTemplate: 'blank', accent: '#64748b', description: 'Minimal starting point to build your own.' },

  /* Seasonal (5) */
  { id: 'se-bf', name: 'Black Friday', category: 'Seasonal', industry: 'E-commerce', popularity: 5, kind: 'funnel', steps: salesFlow(), accent: '#0f172a', description: 'Urgency-led sale page with countdown.' },
  { id: 'se-xmas', name: 'Christmas Offer', category: 'Seasonal', industry: 'Retail', popularity: 4, kind: 'funnel', steps: salesFlow(), accent: '#dc2626', description: 'Festive promo with gift messaging.' },
  { id: 'se-ny', name: 'New Year Promo', category: 'Seasonal', industry: 'Fitness', popularity: 4, kind: 'funnel', steps: optinFlow('New Year Offer'), accent: '#0ea5e9', description: 'Fresh-start offer for January demand.' },
  { id: 'se-summer', name: 'Summer Sale', category: 'Seasonal', industry: 'E-commerce', popularity: 3, kind: 'funnel', steps: salesFlow(), accent: '#f59e0b', description: 'Bright seasonal sale layout.' },
  { id: 'se-valentine', name: "Valentine's Special", category: 'Seasonal', industry: 'Restaurant', popularity: 3, kind: 'funnel', steps: eventFlow(), accent: '#ec4899', description: 'Booking page for a themed evening.' },
];


/** Distinct first-page hero copy so no two templates read the same. */
const HERO_COPY: Record<string, { title: string; eyebrow?: string; cta?: string }> = {
  'lc-ebook': { title: 'The free ebook that turns strangers into customers', eyebrow: 'Free ebook', cta: 'Send me the ebook' },
  'lc-checklist': { title: 'The one-page checklist we use before every project', eyebrow: 'Free checklist', cta: 'Get the checklist' },
  'lc-quote': { title: 'Get a straight, no-nonsense quote in 24 hours', eyebrow: 'Free quote', cta: 'Get my free quote' },
  'lc-consult': { title: 'Book a free 30-minute strategy call', eyebrow: 'Free consultation', cta: 'Book my free call' },
  'lc-newsletter': { title: 'One useful email a week. Nothing else.', eyebrow: 'Newsletter', cta: 'Subscribe free' },
  'lc-trial': { title: 'Try it free for 14 days — no card required', eyebrow: 'Free trial', cta: 'Start my free trial' },
  'lc-quiz': { title: 'Answer 4 questions, get your personal recommendation', eyebrow: 'Quick quiz', cta: 'Start the quiz' },
  'lc-audit': { title: 'Get a free audit of what is holding you back', eyebrow: 'Free audit', cta: 'Request my audit' },
  'lc-waitlist': { title: 'Something new is coming. Be first in line.', eyebrow: 'Early access', cta: 'Join the waitlist' },
  'lc-valuation': { title: 'What is your home actually worth today?', eyebrow: 'Free valuation', cta: 'Get my valuation' },
  'sp-classic': { title: 'The system that replaced everything else we tried', eyebrow: 'Limited offer', cta: 'Get instant access' },
  'sp-vsl': { title: 'Watch this before you spend another dollar', eyebrow: 'Watch the video', cta: 'Yes, I want in' },
  'sp-saas': { title: 'Run your whole business from one dashboard', eyebrow: 'Product', cta: 'Start free' },
  'sp-service': { title: 'We do it for you, start to finish', eyebrow: 'Done for you', cta: 'Get started' },
  'sp-course': { title: 'Go from beginner to confident in 6 weeks', eyebrow: 'Enrolment open', cta: 'Enrol now' },
  'sp-membership': { title: 'Join the members getting results every month', eyebrow: 'Membership', cta: 'Become a member' },
  'sp-product': { title: 'The last one of these you will ever need to buy', eyebrow: 'Best seller', cta: 'Add to cart' },
  'sp-highticket': { title: 'Work with us one-on-one — by application', eyebrow: 'By application', cta: 'Apply now' },
  'sp-bundle': { title: 'Everything, bundled — for less than two on their own', eyebrow: 'Bundle deal', cta: 'Get the bundle' },
  'sp-freeplus': { title: 'Free — just cover the shipping', eyebrow: 'Free + shipping', cta: 'Claim my free copy' },
  'lp-simple': { title: 'One page. One offer. One clear next step.', eyebrow: 'Welcome', cta: 'Get started' },
  'lp-app': { title: 'The app that finally makes this simple', eyebrow: 'Download', cta: 'Download free' },
  'lp-local': { title: 'Your local experts, here when you need us', eyebrow: 'Serving your area', cta: 'Call us today' },
  'lp-comingsoon': { title: 'We are launching soon', eyebrow: 'Coming soon', cta: 'Notify me' },
  'lp-book': { title: 'See it working on your own data — book a demo', eyebrow: 'Live demo', cta: 'Book a demo' },
  'lp-portfolio': { title: 'Selected work from the last twelve months', eyebrow: 'Portfolio', cta: 'Start a project' },
  'lp-charity': { title: 'Your $25 feeds a family for a week', eyebrow: 'Donate', cta: 'Give now' },
  'lp-restaurant': { title: 'Honest food, cooked properly, every night', eyebrow: 'Open daily', cta: 'Reserve a table' },
  'ev-webinar': { title: 'Free live training: the system that actually works', eyebrow: 'Live webinar', cta: 'Save my seat' },
  'ev-conference': { title: 'Two days. Twelve speakers. One room.', eyebrow: 'Conference', cta: 'Get my ticket' },
  'ev-workshop': { title: 'A hands-on workshop, capped at 20 people', eyebrow: 'Workshop', cta: 'Reserve my place' },
  'ev-launch': { title: 'It is finally here — see what we built', eyebrow: 'Launch day', cta: 'Shop the launch' },
  'ev-openhouse': { title: 'Open house this Saturday, 11am–2pm', eyebrow: 'Open house', cta: 'Register to attend' },
  'ty-download': { title: 'You are all set! 🎉', eyebrow: 'Confirmed' },
  'ty-booking': { title: 'Your booking is confirmed 🎉', eyebrow: 'Booked' },
  'ty-order': { title: 'Thanks for your order! 🎉', eyebrow: 'Order confirmed' },
  'ty-upsell': { title: 'You are in! One more thing…', eyebrow: 'Confirmed' },
  'ty-survey': { title: 'Thank you! Got 30 seconds?', eyebrow: 'Confirmed' },
  'se-bf': { title: 'Black Friday: our biggest discount of the year', eyebrow: 'Black Friday', cta: 'Claim the deal' },
  'se-xmas': { title: 'The gift they will actually use', eyebrow: 'Christmas', cta: 'Shop gifts' },
  'se-ny': { title: 'New year, and this time it sticks', eyebrow: 'New year offer', cta: 'Start January strong' },
  'se-summer': { title: 'Summer sale — up to 40% off', eyebrow: 'Summer sale', cta: 'Shop the sale' },
  'se-valentine': { title: "Valentine's night, done properly", eyebrow: "Valentine's", cta: 'Book our table' },
};

export const TEMPLATE_CATEGORIES: TemplateCategory[] = [
  'Lead Capture', 'Sales Pages', 'Landing Pages', 'Event Pages', 'Thank You Pages', 'Full Websites', 'Seasonal',
];

/** Build the real, populated pages for any catalog template. */
export function buildTemplatePages(meta: TemplateMeta, ctx: BrandContext): FunnelStep[] {
  const copy = HERO_COPY[meta.id];
  const withAccent: BrandContext = {
    ...ctx,
    ...(meta.accent ? { color: meta.accent } : {}),
    ...(copy ? { heroTitle: copy.title, heroEyebrow: copy.eyebrow, heroCta: copy.cta } : {}),
  };
  if (meta.kind === 'website') return buildWebsiteTemplatePages(meta.websiteTemplate ?? 'business', withAccent);
  return (meta.steps ?? [{ name: 'Landing', type: 'landing' as const }]).map(s => buildFunnelPage(s.name, s.type, withAccent));
}
