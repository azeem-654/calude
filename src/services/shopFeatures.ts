/**
 * What this shop can actually do.
 *
 * ── Why this file exists rather than a paragraph of marketing ──
 *
 * Because a feature list is a promise, and this codebase's rule is that
 * nothing pretends to work. Every entry below names something a customer can
 * go and use today, and several of them exist specifically to say what is
 * *not* here — live carrier rates, subscriptions, multi-currency — because a
 * list that only says yes teaches people not to trust it.
 *
 * ── How to keep it honest ──
 *
 * Add a line when the thing ships, not when it is planned. `state` is the
 * discipline: `yes` means somebody can use it now, `partly` means it works
 * with a named limit, and `no` means it does not exist and the entry is here
 * so nobody has to find that out by looking for it.
 */

export type FeatureState = 'yes' | 'partly' | 'no';

export interface ShopFeature {
  label: string;
  /** What it means for the person running the shop, not what it is called. */
  detail: string;
  state: FeatureState;
  /** Where it is done. Empty when there is nothing to open. */
  route?: string;
}

export interface FeatureGroup {
  title: string;
  blurb: string;
  features: ShopFeature[];
}

export const SHOP_FEATURES: FeatureGroup[] = [
  {
    title: 'The catalogue',
    blurb: 'What you sell, and the shapes it comes in.',
    features: [
      { label: 'Products with photos and descriptions', detail: 'Price, a "was" price that has to be genuine, SKU and category.', state: 'yes', route: '/sell' },
      { label: 'Options — sizes, colours, finishes', detail: 'Each carries its own price, its own SKU and its own stock count.', state: 'yes', route: '/sell' },
      { label: 'Several pictures per product', detail: 'Up to five, and an option can have its own — a blue shirt is not illustrated by the red one.', state: 'yes', route: '/sell' },
      { label: 'Stock tracking', detail: 'Per option, checked again at the moment somebody buys rather than only hidden in the listing.', state: 'yes', route: '/sell' },
      { label: 'Draft and live', detail: 'Nothing reaches the shop page until you make it active, and anything held for review stays a draft.', state: 'yes', route: '/sell' },
      { label: 'Collections', detail: 'Group products any way you sell them — "New in", "Gifts", "Under £20" — and a product can be in as many as you like, in the order you put them in. Built by hand: there are no rules that fill one automatically, and no collections inside collections.', state: 'partly', route: '/sell' },
    ],
  },
  {
    title: 'The shop itself',
    blurb: 'One address a stranger can buy from, with no account and no login.',
    features: [
      { label: 'A public shop page', detail: 'At /shop/your-name, with your own name, colour and hero image.', state: 'yes', route: '/websites' },
      { label: 'Themes', detail: 'Several layouts, and a brand colour that is adjusted if it would vanish into the theme.', state: 'yes', route: '/websites' },
      { label: 'Search and filtering', detail: 'By name, description, SKU and category.', state: 'yes' },
      { label: 'A basket', detail: 'Several products and several options at once, capped at what you actually have.', state: 'yes' },
      { label: 'Your own domain', detail: 'Buy one through the app or point one you own at it.', state: 'yes', route: '/settings?tab=digital-setup' },
    ],
  },
  {
    title: 'Taking money',
    blurb: 'On your own payment account. The money never passes through ours.',
    features: [
      { label: 'Stripe or Creem', detail: 'Connected per workspace. Your sales land in your balance, not the platform’s.', state: 'yes', route: '/sell' },
      { label: 'Discount codes', detail: 'Percentage or fixed, with a minimum basket, dates and a usage limit. Taken off the items, never the delivery.', state: 'yes', route: '/sell' },
      { label: 'Delivery rates', detail: 'A flat price or free over a total, different per country, with a catch-all so nowhere ships free by accident.', state: 'yes', route: '/sell' },
      { label: 'Live carrier rates', detail: 'Not here. They need weights, dimensions and a carrier contract, and a wrong one charges a real buyer the wrong amount.', state: 'no' },
      { label: 'Tax and VAT', detail: 'A rate per country, on the goods after any discount and on the delivery too, either inside your listed prices or added at checkout. Not a tax engine: no US nexus, no EU OSS thresholds — take advice if you are more complicated than that.', state: 'partly', route: '/sell' },
      { label: 'Several currencies', detail: 'One per workspace, and it is the one the checkout charges in — so the page and the card can never disagree.', state: 'partly', route: '/sell' },
    ],
  },
  {
    title: 'Orders',
    blurb: 'What was bought, by whom, and what happens next.',
    features: [
      { label: 'Orders with the delivery address', detail: 'Collected at the checkout and written down only when the processor actually sends it.', state: 'yes', route: '/sell' },
      { label: 'Paid, fulfilled, refunded', detail: 'Moved by the processor’s own webhook, and an order only ever moves forward.', state: 'yes', route: '/sell' },
      { label: 'Dropshipping', detail: 'Send an order straight to Printful and track what it said back.', state: 'yes', route: '/sell' },
      { label: 'Orders taken by phone', detail: 'Recorded by hand and counted the same as the rest.', state: 'yes', route: '/sell' },
      { label: 'Chasing unpaid orders', detail: 'Autopilot follows up once per order, marked on the order so it cannot nag.', state: 'yes', route: '/autopilot' },
      { label: 'Thanking buyers', detail: 'Once, after payment — not on every tick.', state: 'yes', route: '/autopilot' },
      { label: 'Order tracking for buyers', detail: 'A buyer looks their order up on your shop page with the reference and email from their receipt — no account to make. They see the status, what they bought and what they paid.', state: 'yes' },
      { label: 'Customer accounts', detail: 'No login and no saved history. Each order is looked up on its own; there is no page listing everything somebody has ever bought.', state: 'no' },
    ],
  },
  {
    title: 'Selling more of it',
    blurb: 'The part a shop platform usually charges extra for.',
    features: [
      { label: 'Product copy written for you', detail: 'Descriptions, pages and posts written from your own profile, shown to you before anything publishes.', state: 'yes', route: '/autopilot' },
      { label: 'Email campaigns', detail: 'Written, scheduled and sent from your own mailbox, so replies come back to you.', state: 'yes', route: '/marketing' },
      { label: 'Abandoned basket follow-up', detail: 'The order exists the moment somebody starts paying, so a stall is something Autopilot can chase.', state: 'yes', route: '/autopilot' },
      { label: 'Win-backs and post-purchase', detail: 'Part of the build order for a shop project, in that sequence.', state: 'yes', route: '/autopilot' },
      { label: 'Reviews', detail: 'Collected and answered, with the bad ones surfaced rather than buried.', state: 'yes', route: '/reputation' },
      { label: 'Subscriptions and repeat billing', detail: 'Not here. One-off orders only.', state: 'no' },
    ],
  },
];

/** Counted for the heading, so the number cannot drift from the list. */
export function featureCount(): { works: number; total: number } {
  const all = SHOP_FEATURES.flatMap(g => g.features);
  return { works: all.filter(f => f.state !== 'no').length, total: all.length };
}
