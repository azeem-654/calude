/**
 * What the e-commerce service page says — protectedcentral.com/ecommerce-management-services.
 *
 * A premium managed service, not a software plan: the team sets up and runs a
 * client's store and marketplace accounts, their advertising, and their
 * Protected Central CRM and marketing automation, for one monthly fee
 * (lib/offers.ts → ECOMMERCE_OFFER). The page must never type a figure; it
 * reads the offer.
 *
 * What it must never say, because nothing supports it: that Amazon, eBay,
 * Walmart, Shopify or an ad network is connected to Protected Central (none
 * is — the team works in the client's own accounts), that ads publish
 * themselves, a revenue, ROAS or sales figure, a customer, a testimonial, a
 * certification or a partner status. `npm run test:industry` checks it.
 */
import type { ReactNode } from 'react';
import {
  ShoppingBag, Store, Package, Megaphone, Users, Mail, MessageSquare, Workflow, LifeBuoy, Star, FileText, BarChart3,
  Search, ClipboardCheck, KeyRound, Rocket, CalendarClock, LineChart,
} from 'lucide-react';
import type { MicrositeConfig } from './micrositeContext';

type Icon = (p: { size?: number }) => ReactNode;

export const ECOM_SITE: MicrositeConfig = {
  id: 'ecommerce',
  root: '/ecommerce-management-services',
  tag: 'E-commerce',
  nav: [
    { href: '#service', label: 'Service' },
    { href: '#platforms', label: 'Platforms' },
    { href: '#handle', label: 'What we handle' },
    { href: '#see-it-work', label: 'Demo' },
    { href: '#process', label: 'Process' },
    { href: '#pricing', label: 'Pricing' },
    { href: '#faq', label: 'FAQ' },
  ],
  bookLabel: 'Book an E-commerce Strategy Call',
  bookShort: 'Book a strategy call',
  writeHref: '#talk',
  writeLabel: 'Tell us about your store',
  footerLine: 'E-commerce business setup and growth management for online sellers.',
  signIn: true,
};

export const ECOM_HERO = {
  eyebrow: 'E-commerce management services',
  h1: 'E-commerce Business Setup & Growth Management',
  sub: 'A done-for-you e-commerce management service: we set up and run your Shopify store and your Amazon, eBay and Walmart seller accounts, manage your advertising, and keep your customers followed up — with your CRM, email, SMS, reviews and support run in Protected Central.',
};

export const ECOM_SERVICE = {
  lead: 'One team for the store,',
  emph: 'the marketplaces and the follow-up.',
  body: [
    'Selling online means a storefront, several marketplace accounts, product listings, advertising on more than one network, and customers who need answering, reminding and asking for reviews. Most sellers end up running each in a different place, and the follow-up is what slips.',
    'Our e-commerce business management service puts it with one team. We set up the store and marketplace accounts you choose, keep your catalogue and listings in order, manage your campaigns, and run your customer relationships and marketing automation in Protected Central — every customer, order question, campaign and review request in one workspace you can open at any time.',
    'Protected Central is the software we deliver the work in; the monthly fee pays for the managed-service work in your written scope. It is a different thing from the self-serve software plans, which you would run yourself.',
  ],
};

export const ECOM_PLATFORMS: { icon: Icon; title: string; body: string; note?: string }[] = [
  { icon: Store, title: 'Shopify store management', body: 'Your Shopify storefront and supporting website pages set up — theme, collections, product pages, policies, checkout settings and contact and lead-capture forms — then maintained month to month.' },
  { icon: ShoppingBag, title: 'Amazon store management', body: 'Seller account set-up support, product listings and catalogue upkeep, and Amazon PPC campaigns where your account qualifies.', note: 'Amazon decides seller and category approval.' },
  { icon: Package, title: 'eBay store management', body: 'Your eBay store and listings set up and kept current, with promoted listings managed where they are available to your account.' },
  { icon: Store, title: 'Walmart Marketplace management', body: 'Walmart Marketplace onboarding support, listings and catalogue upkeep, and Walmart advertising where your account is eligible.', note: 'Subject to Walmart’s seller eligibility and approval.' },
];

/** Said under the platform cards, every time. */
export const ECOM_PLATFORM_NOTE = 'We work inside your own seller, store and ad accounts, with the access each platform allows. Protected Central does not connect to Amazon, eBay, Walmart or Shopify, and nothing is published or changed on them automatically: listings, campaigns and settings are changed there by our team, and recorded in your workspace.';

export const ECOM_HANDLE: { icon: Icon; title: string; items: string[] }[] = [
  {
    icon: Package, title: 'Store and marketplace operations', items: [
      'Store and marketplace account setup on the platforms in your scope',
      'Product catalogue setup, listings and catalogue maintenance',
      'Operational workflows: order questions, returns and stock issues routed to the right person',
      'Store and marketplace performance monitoring, reported monthly',
    ],
  },
  {
    icon: Store, title: 'Website and conversion setup', items: [
      'Your Shopify storefront and supporting website pages',
      'Contact, lead-capture and newsletter forms feeding your CRM',
      'Abandoned-cart, first-order and follow-up workflows',
      'The approved tools and channels connected where they are supported',
    ],
  },
  {
    icon: Megaphone, title: 'Paid advertising management', items: [
      'Social advertising on supported platforms, including Meta where it applies',
      'Marketplace advertising — Amazon PPC, eBay promoted listings, Walmart advertising — where your accounts qualify and give us access',
      'Campaign setup, optimisation and performance monitoring',
      'A monthly advertising report; budgets are set and paid by you',
    ],
  },
  {
    icon: Users, title: 'CRM and marketing automation in Protected Central', items: [
      'CRM setup and a customer pipeline from enquiry to repeat buyer',
      'Email marketing and customer follow-up campaigns',
      'SMS marketing only to customers who gave consent, within the rules that apply',
      'Automation workflows, tags, customer segments and follow-up tasks',
      'Tickets and support workflows for order and product questions',
      'Review requests and feedback follow-up for your store and other eligible platforms',
      'Social media and blog content prepared for your approval',
      'Reporting, sales follow-up and customer-retention campaigns',
    ],
  },
];

/** The Protected Central modules the team works in for a store — each one that exists in the product. */
export const ECOM_MODULES: { icon: Icon; title: string; body: string }[] = [
  { icon: Users, title: 'Contacts and pipelines', body: 'Every customer with where they bought, their orders, tags and stage — from enquiry to repeat buyer.' },
  { icon: Mail, title: 'Email campaigns', body: 'Campaigns and automated sequences sent from your own mailbox, written for your products, sent only once approved.' },
  { icon: MessageSquare, title: 'SMS', body: 'Text follow-ups through your own connected SMS provider, to customers who agreed to receive them.' },
  { icon: Workflow, title: 'AI Autopilot workflows', body: 'Launches, reminders and win-back sequences drawn as steps you can read, run on the server every five minutes.' },
  { icon: Star, title: 'Reputation', body: 'Review requests after delivery, and an unhappy reply handed to a person before anything else goes out.' },
  { icon: LifeBuoy, title: 'Tickets and support', body: 'Order and product questions as tickets with an owner, a status and a history.' },
  { icon: FileText, title: 'Social and blog content', body: 'Posts, short videos and articles prepared for your approval before anything is published.' },
  { icon: BarChart3, title: 'Reports', body: 'Contacts, campaigns and pipeline reported from your own records — no sample figures.' },
];

export const ECOM_PROCESS: { icon: Icon; title: string; body: string }[] = [
  { icon: Search, title: '1. Strategy call', body: 'Your products, the channels you sell on now, where you want to sell, your ad budget and what is not working.' },
  { icon: ClipboardCheck, title: '2. Written scope and agreement', body: 'The platforms, catalogue size, ad channels, campaigns, content, support and reporting a month covers — in writing, before any work starts.' },
  { icon: KeyRound, title: '3. Access and onboarding', body: 'You give us access to your store, seller and ad accounts, and we set up your Protected Central workspace.' },
  { icon: Rocket, title: '4. Setup and launch', body: 'Store and listings, CRM pipeline, forms, the first campaigns and automations — each one reviewed with you before it goes live.' },
  { icon: CalendarClock, title: '5. Monthly management', body: 'Listings kept current, campaigns run and adjusted, customers followed up, tickets answered, within the agreed scope.' },
  { icon: LineChart, title: '6. Monthly report and review', body: 'What was done, what the numbers in your accounts show, and what we plan next — agreed with you.' },
];

export const ECOM_FAQ: { q: string; a: string }[] = [
  { q: 'What are e-commerce management services?', a: 'A team that sets up and runs the day-to-day of an online store for you: the storefront and marketplace accounts, product listings, advertising, customer follow-up, reviews and support. Ours covers Shopify, Amazon, eBay and Walmart, with your CRM and marketing automation run in Protected Central.' },
  { q: 'Is advertising spend included in the monthly fee?', a: 'No. You set your ad budget and pay each ad platform directly; we manage the campaigns. Inventory, marketplace commissions and selling fees, shipping, fulfilment, payment processing and paid apps or themes are also yours, unless a signed agreement says otherwise.' },
  { q: 'Do you guarantee sales or a return on ad spend?', a: 'No. We do not guarantee revenue, sales volume, ROAS, profit or how soon a store becomes profitable. The monthly report shows what was done and what your accounts show.' },
  { q: 'Is Protected Central connected to Amazon, eBay, Walmart or Shopify?', a: 'No. Our team works in your own accounts on each platform, with the access you give us, and records the work, your customers and your follow-up in Protected Central. Nothing is published on a marketplace automatically.' },
  { q: 'How much work does a month include?', a: 'What your written scope says: which platforms, how many products and listings, which ad channels, how many campaigns and how much content, support hours and the report. It is agreed before we start, and anything beyond it is quoted first. Nothing is unlimited.' },
  { q: 'Can you get my store approved on Walmart or in a restricted Amazon category?', a: 'We prepare and submit what the marketplace asks for, but approval is the marketplace’s decision, and some sellers or products do not qualify.' },
  { q: 'Do you send SMS marketing?', a: 'Only to customers who have given consent, through an SMS provider connected to your workspace, and within the laws and carrier rules that apply. Email follows the same approval and unsubscribe rules.' },
  { q: 'Who owns the accounts and the customer data?', a: 'You do. Your store, seller and ad accounts stay in your name, and your Protected Central workspace and everything in it is yours to export at any time.' },
];
