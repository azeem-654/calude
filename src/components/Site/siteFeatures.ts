/**
 * Which of the site's incubated offers this host may show.
 *
 * Owner, 2026-11-18: reviews, jobs & revenue, the online shop and e-commerce
 * service, the trade growth service and medical billing go into the incubator
 * (docs/INCUBATOR.md). The public site shows only what the app on this host
 * offers, so every card, link, price and FAQ line about them asks here — the
 * one switch is `featureReady` (services/features.ts): on the testing site
 * and a developer's machine they are shown, on the live site they are not.
 *
 * The Worker cannot read that switch (it runs no browser), so for the service
 * sites' addresses it reads `servicesPublic(hostname)` (lib/industryPages.ts),
 * which names the same hosts `isRehearsal()` does — the testing site, a
 * staging preview and localhost. The two must name the same hosts, or a link
 * shown here would lead to a 404 there.
 */
import { featureReady, type Feature } from '../../services/features';
import type { IndustrySlug } from '../../../worker/src/lib/industryPages';

/** The switch each service site and its offer hang on. */
export const SERVICE_FEATURE: Record<IndustrySlug, Feature> = {
  hvac: 'trade-services',
  roofing: 'trade-services',
  'medical-billing': 'medical-billing',
  ecommerce: 'online-shop',
};

/** Whether this host shows that service: its site, its card, its price and its links. */
export const serviceShown = (slug: IndustrySlug): boolean => featureReady(SERVICE_FEATURE[slug]);

/** Whether this host shows any of the managed services — the strip, the section, the nav entry. */
export const anyServiceShown = (): boolean => (Object.keys(SERVICE_FEATURE) as IndustrySlug[]).some(serviceShown);
